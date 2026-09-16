"""The same room, run on this machine instead of through a Worker.

This is the second implementation of one channel shape: stage the bytes, ask the
sandbox layer for the room's command, run it, hand its stdio up, capture the
declared state subtree, and leave nothing behind. It shares the capture rules
with the Worker-hosted channel (`state_capture`) rather than restating them.

What it is *not*: an isolation mechanism. The command it runs is the room's, so
the isolation is the room's too - this launcher only decides where the bytes
land and how the process is started and stopped.
"""
from __future__ import annotations

import hashlib
import os
import shutil
import signal
import subprocess
import tempfile
import threading
import time
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Mapping, Sequence

from agent_box_sandbox_bwrap import compose_sidecar_room

from .state_capture import (
    StateCaptureError, merge_state_into_bundle, settled_state, state_snapshot,
)

#: One bundled file may not exceed this many bytes, nor the bundle this many.
MAX_BUNDLE_FILES = 1024
MAX_BUNDLE_BYTES = 64 * 1024 * 1024


def _safe_bundle_path(value: str) -> str:
    if (not isinstance(value, str) or not value or value.startswith("/")
            or "\\" in value or "\x00" in value or "//" in value
            or any(part in {"", ".", ".."} for part in value.split("/"))
            or str(PurePosixPath(value)) != value):
        raise ValueError("LOCAL_CHANNEL_PATH_INVALID")
    return value


def _is_transient(error: BaseException) -> bool:
    code = getattr(error, "code", None)
    return code in {"SIDECAR_STATE_IDENTITY_CONFLICT", "VIEW_CHANGED", "VIEW_MISSING"}


class LocalSidecarLauncher:
    """Run one execution-local room on this machine."""

    def __init__(
        self, *, workspace_path: str, bundle: Mapping[str, bytes],
        credential: bytes, projection_mounts: Sequence[tuple[str, str]] = (),
        runtime_artifact_mounts: Sequence[tuple[str, str]] = (),
        executable_mounts: Sequence[tuple[str, str]] = (),
        state_bundle_prefix: str | None = None, state_target: str | None = None,
        state_ephemeral_paths: Sequence[str] = (),
        protected_state_paths: Sequence[str] = (),
        restored_state: Mapping[str, bytes] | None = None,
    ) -> None:
        if len(bundle) > MAX_BUNDLE_FILES or sum(map(len, bundle.values())) > MAX_BUNDLE_BYTES:
            raise ValueError("LOCAL_CHANNEL_BUNDLE_OUTSIDE_BOUNDS")
        for path in bundle:
            _safe_bundle_path(path)
        self.workspace_path = workspace_path
        self.bundle = dict(bundle)
        self.restored_state = dict(restored_state or {})
        # The same state projection the Worker-hosted channel carries: the
        # marker that makes the state directory exist, and the restored files
        # under it, minus the read-only configuration and the scratch.
        try:
            merge_state_into_bundle(
                self.bundle, state_bundle_prefix=state_bundle_prefix, state_target=state_target,
                restored_state=self.restored_state,
                protected_state_paths=protected_state_paths,
                state_ephemeral_paths=state_ephemeral_paths,
            )
        except StateCaptureError as error:
            raise ValueError(error.code) from error
        self.credential = credential
        self.projection_mounts = tuple(projection_mounts)
        self.runtime_artifact_mounts = tuple(runtime_artifact_mounts)
        self.executable_mounts = tuple(executable_mounts)
        self.state_bundle_prefix = state_bundle_prefix
        self.state_target = state_target
        self.state_ephemeral_paths = tuple(state_ephemeral_paths)
        self.protected_state_paths = tuple(protected_state_paths)

    def launch(self, environment: Mapping[str, str]):
        root = Path(tempfile.mkdtemp(prefix="agentbox-local-channel-"))
        view = root / "view"
        view.mkdir()
        for path, content in sorted(self.bundle.items()):
            target = view.joinpath(*path.split("/"))
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        secret_path = None
        if self.credential:
            secret_file = root / "secret"
            fd = os.open(secret_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as stream:
                stream.write(self.credential)
            secret_path = str(secret_file)
        room = compose_sidecar_room(
            workspace=self.workspace_path, staged_view=str(view), secret=secret_path,
            base_environment=environment, executable_mounts=self.executable_mounts,
            projection_mounts=self.projection_mounts,
            runtime_artifact_mounts=self.runtime_artifact_mounts,
            state_bundle_prefix=self.state_bundle_prefix, state_target=self.state_target,
            state_ephemeral_paths=self.state_ephemeral_paths,
        )
        # stderr goes to a file, not a pipe: a pipe nobody drains would block
        # the child, and the tail is what a failure needs to report.
        stderr_path = root / "stderr.log"
        stderr_file = stderr_path.open("wb")
        try:
            process = subprocess.Popen(  # noqa: S603 - the argv is the reviewed room
                list(room.argv), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=stderr_file, start_new_session=True,
            )
        except BaseException:
            stderr_file.close()
            shutil.rmtree(root, ignore_errors=True)
            raise
        stderr_file.close()
        return _LocalChannels(
            process, root=root, view=view, stderr_path=stderr_path,
            # A room may run with no credential at all; an absent secret scans
            # as nothing rather than crashing the launch that did not need one.
            credential=(self.credential or b"").strip(),
            state_bundle_prefix=self.state_bundle_prefix,
            protected_state_paths=self.protected_state_paths,
            state_ephemeral_paths=self.state_ephemeral_paths,
        )


class _LocalChannels:
    """One local child process, presented as the channel the harness port uses."""

    def __init__(
        self, process: subprocess.Popen, *, root: Path, view: Path, stderr_path: Path,
        credential: bytes, state_bundle_prefix: str | None,
        protected_state_paths: Sequence[str], state_ephemeral_paths: Sequence[str],
    ) -> None:
        self.process = process
        self.root = root
        self.view = view
        self.stderr_path = stderr_path
        self._credential = credential
        self.state_bundle_prefix = state_bundle_prefix
        self.protected_state_paths = tuple(protected_state_paths)
        self.state_ephemeral_paths = tuple(state_ephemeral_paths)
        self._lock = threading.RLock()
        self._closed = False

    # -- transport ---------------------------------------------------------
    def write_line(self, value: str) -> None:
        with self._lock:
            if self._closed or self.process.stdin is None or self.process.poll() is not None:
                raise RuntimeError("LOCAL_CHANNEL_CLOSED")
            self.process.stdin.write((value + "\n").encode("utf-8"))
            self.process.stdin.flush()

    def iter_chunks(self):
        """Decoded lines, as the envelope's reader expects its channel to speak."""
        assert self.process.stdout is not None
        return iter(lambda: self.process.stdout.readline().decode("utf-8", "replace"), "")

    def close(self) -> None:
        with self._lock:
            if self._closed:
                return
            self._closed = True
        try:
            if self.process.poll() is None:
                os.killpg(os.getpgid(self.process.pid), signal.SIGTERM)
                deadline = time.monotonic() + 5
                while self.process.poll() is None and time.monotonic() < deadline:
                    time.sleep(0.05)
            if self.process.poll() is None:
                os.killpg(os.getpgid(self.process.pid), signal.SIGKILL)
        except ProcessLookupError:
            pass
        finally:
            for stream in (self.process.stdin, self.process.stdout):
                try:
                    if stream is not None:
                        stream.close()
                except OSError:
                    pass
            if os.environ.get("AGENTBOX_LOCAL_CHANNEL_KEEP") != "1":
                # A debug switch: keeping the root is how a failed launch's
                # stderr survives the close that a failure triggers.
                shutil.rmtree(self.root, ignore_errors=True)

    # -- state -------------------------------------------------------------
    def _listing(self) -> list[dict[str, Any]]:
        """Every file under the staged view, as the state rules expect them.

        A symlink is refused rather than followed: the state subtree is carried
        into a checkpoint by value, and a link would name something that does
        not exist on the other side.
        """
        if self.state_bundle_prefix is None:
            return []
        base = self.view.joinpath(*self.state_bundle_prefix.split("/"))
        if not base.is_dir():
            return []
        listing: list[dict[str, Any]] = []
        for item in sorted(base.rglob("*")):
            relative = item.relative_to(base).as_posix()
            if item.is_symlink():
                raise StateCaptureError("VIEW_INVALID", "view contains a symlink")
            if item.is_dir():
                continue
            listing.append({
                "path": f"{self.state_bundle_prefix}/{relative}",
                "size": item.stat().st_size,
            })
        return listing

    def _read(self, path: str) -> tuple[bytes, str]:
        target = self.view.joinpath(*path.split("/"))
        if target.is_symlink():
            raise StateCaptureError("VIEW_INVALID", "view contains a symlink")
        content = target.read_bytes()
        return content, "sha256:" + hashlib.sha256(content).hexdigest()

    def _snapshot(self) -> tuple[dict[str, tuple[int, str]], dict[str, bytes]]:
        if self.state_bundle_prefix is None:
            return {}, {}
        return state_snapshot(
            self._listing(), self._read,
            state_bundle_prefix=self.state_bundle_prefix,
            protected_state_paths=self.protected_state_paths,
            state_ephemeral_paths=self.state_ephemeral_paths,
            forbidden_content=self._credential,
        )

    def capture_state(self, *, deadline_seconds: float | None = None,
                      interval_seconds: float | None = None) -> dict[str, bytes]:
        if self.state_bundle_prefix is None:
            return {}
        return settled_state(
            self._snapshot, is_transient=_is_transient,
            deadline_seconds=deadline_seconds, interval_seconds=interval_seconds,
        )

    def settle_state(self, *, deadline_seconds: float | None = None,
                     interval_seconds: float | None = None) -> None:
        self.capture_state(deadline_seconds=deadline_seconds, interval_seconds=interval_seconds)

    # -- diagnostics -------------------------------------------------------
    def stderr_tail(self, maximum: int = 2000) -> str:
        try:
            return self.stderr_path.read_text(errors="replace")[-maximum:]
        except OSError:
            return ""


__all__ = ["LocalSidecarLauncher"]
