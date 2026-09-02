"""Shared atomic durable write primitive (filesystem durability scope).

Declaration of durability scope (frozen in this round):

  Local POSIX-like filesystems honoring ``fsync`` and same-directory
  atomic rename: process-crash + power-loss durable for every journaled
  Profile mutation and its single visibility commit point (pointer).
  Network/distributed filesystems are OUTSIDE the guarantee; WSL/Windows
  behavior is best-effort and gaps are reported typed, never silently
  claimed durable.

Every mutation that must survive power loss goes through this module:

    write temp -> flush -> fsync(temp fd) -> os.replace(temp, target)
    -> fsync(target parent directory)

Directory ``fsync`` may be unsupported on some platforms.  Each target
directory is probed at the barrier; unsupported targets fail closed with a
typed diagnostic rather than silently claiming power-loss durability.

Delete paths (journal removal, pointer removal, revision dir removal, lease
removal) also fsync the parent directory so the deletion itself is durable.

Tests inject ``DurabilityRecorder`` instances (never global monkeypatches of
os.fsync) to assert the commit ordering barriers; a recorder failure
(fsync raising) fails closed typed.
"""
from __future__ import annotations

import os
import threading
import uuid
from pathlib import Path
from typing import Callable

from .failures import ProfileNativeHomeError

FSYNC_FAILED = "FSYNC_FAILED"
DIRECTORY_FSYNC_UNSUPPORTED = "DIRECTORY_FSYNC_UNSUPPORTED"


class DurabilityError(ProfileNativeHomeError):
    """Typed durability failure (fsync/rename failure on a durable write)."""

    def __init__(self, code: str = FSYNC_FAILED, detail: str = "") -> None:
        self.code = code
        super().__init__(f"{code}" + (f": {detail}" if detail else ""))


class DurabilityCapability:
    """Probed once; never silently overstates what the platform provides."""

    READY: bool | None = None
    DIRECTORY_FSYNC: bool | None = None

    @classmethod
    def directory_fsync_supported(cls, path: Path | None = None) -> bool:
        # Probe the directory that will actually receive the rename.  A
        # successful fsync on /dev says nothing about a mounted workspace.
        probe = Path(path or Path.cwd())
        try:
            fd = os.open(str(probe), os.O_RDONLY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
            if path is None:
                cls.DIRECTORY_FSYNC = True
            return True
        except OSError:
            if path is None:
                cls.DIRECTORY_FSYNC = False
            return False
        return bool(cls.DIRECTORY_FSYNC)

    @classmethod
    def capability(cls) -> str:
        if cls.directory_fsync_supported():
            return "process-crash-and-power-loss-durable"
        return "process-crash-only"


class DurabilityRecorder:
    """Injected ordering recorder for durability barrier tests.

    Records human/bounded stage names; may be configured to fail at a
    specific stage to emulate fsync failure (fail closed typed).
    """

    def __init__(self, fail_at: str | None = None) -> None:
        self.events: list[str] = []
        self.fail_at = fail_at
        self.failures: list[str] = []
        self._lock = threading.Lock()

    def record(self, stage: str) -> None:
        with self._lock:
            if self.fail_at == stage:
                self.failures.append(stage)
                raise DurabilityError(FSYNC_FAILED, stage)
            self.events.append(stage)

    def order(self) -> tuple[str, ...]:
        with self._lock:
            return tuple(self.events)

    def assert_ordered(self, *stages: str) -> None:
        with self._lock:
            positions = [self.events.index(stage) for stage in stages]
            assert positions == sorted(positions), f"durability order violated: {stages}"


# injectable active recorder (tests only; None = real durability)
_active_recorder: DurabilityRecorder | None = None
_recorder_lock = threading.Lock()


def install_recorder(recorder: DurabilityRecorder | None) -> None:
    global _active_recorder

    with _recorder_lock:
        _active_recorder = recorder


def _record(stage: str) -> None:
    with _recorder_lock:
        recorder = _active_recorder
    if recorder is not None:
        recorder.record(stage)


def fsync_file(path: Path) -> None:
    fd = os.open(str(path), os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def fsync_directory(path: Path) -> None:
    path = Path(path)
    if not DurabilityCapability.directory_fsync_supported(path):
        raise DurabilityError(DIRECTORY_FSYNC_UNSUPPORTED, path.name[:64])
    fd = os.open(str(path), os.O_RDONLY)
    try:
        os.fsync(fd)
    except OSError as exc:
        # bounded diagnostic WITHOUT the host-absolute path
        raise DurabilityError(DIRECTORY_FSYNC_UNSUPPORTED, Path(path).name[:64]) from exc
    finally:
        os.close(fd)


def atomic_write_durable(path: Path, data: bytes, *, mode: int = 0o600) -> None:
    """Atomic durable write: temp -> flush -> fsync(file) -> replace ->
    fsync(parent dir).  Failures are typed (fail closed)."""
    path = Path(path)
    directory = path.parent
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.durable.tmp")
    fd = None
    try:
        fd = os.open(str(temporary), os.O_CREAT | os.O_EXCL | os.O_WRONLY, mode)
        view = os.fdopen(fd, "wb")
        fd = None
        try:
            view.write(data)
            view.flush()
            os.fsync(view.fileno())
        finally:
            view.close()
        _record(f"durable-write:{path.name}")
        os.replace(temporary, path)
    except DurabilityError:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass
        raise
    except Exception as exc:
        try:
            if fd is not None:
                os.close(fd)
        except OSError:
            pass
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass
        raise DurabilityError(FSYNC_FAILED, path.name[:64]) from exc
    try:
        fsync_directory(directory)
    except DurabilityError:
        raise


def remove_durable(path: Path) -> None:
    """Durable removal: unlink + fsync(parent dir) so the deletion sticks."""
    path = Path(path)
    try:
        path.unlink(missing_ok=True)
    except OSError as exc:
        raise DurabilityError(FSYNC_FAILED, path.name[:64]) from exc
    if path.exists():
        return
    _record(f"durable-remove:{path.name}")
    try:
        fsync_directory(path.parent)
    except DurabilityError:
        raise


def durable_copy(source: Path, target: Path, *, mode: int = 0o600) -> None:
    """Copy one regular file through the same durable write barrier."""
    source = Path(source)
    atomic_write_durable(Path(target), source.read_bytes(), mode=mode)


def remove_tree_durable(path: Path) -> None:
    """Remove a transaction tree and persist its parent directory entry."""
    import shutil

    path = Path(path)
    if not path.exists():
        return
    shutil.rmtree(path)
    fsync_directory(path.parent)


__all__ = [
    "DIRECTORY_FSYNC_UNSUPPORTED",
    "DurabilityCapability",
    "DurabilityError",
    "DurabilityRecorder",
    "FSYNC_FAILED",
    "atomic_write_durable",
    "durable_copy",
    "fsync_directory",
    "fsync_file",
    "install_recorder",
    "remove_durable",
    "remove_tree_durable",
]
