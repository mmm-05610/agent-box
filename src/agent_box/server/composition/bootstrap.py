"""The only Server module that imports concrete plugin implementations."""
from __future__ import annotations

from dataclasses import dataclass, field
import csv
import io
import os
from pathlib import Path
import secrets
import subprocess
import threading
from typing import Any, Callable, Mapping
from uuid import uuid4

from agent_box.server.application import ProductService, WslConnectionPort
from agent_box.server.persistence import ProductRepository
from agent_box.storage import (
    Database, ObjectStore, SecretStore, WindowsDpapiSecretStore,
)
from agent_box.work_core import db as core_db


class DataRootOwner:
    """Exclusive process lock and identity marker for one data root."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.instance_id = f"server_{uuid4().hex}"
        self._stream = None

    def acquire(self) -> None:
        marker = self.root / ".agentbox-server-root"
        if self.root.exists() and not marker.exists():
            raise RuntimeError("DATA_ROOT_UNOWNED: existing directory has no AgentBox owner marker")
        self.root.mkdir(parents=True, exist_ok=True)
        if not marker.exists():
            marker.write_text("agentbox-server-r1\n", encoding="utf-8")
        elif marker.read_text(encoding="utf-8") != "agentbox-server-r1\n":
            raise RuntimeError("DATA_ROOT_MARKER_INVALID")
        lock_path = self.root / "server.lock"
        descriptor = os.open(lock_path, os.O_RDWR | os.O_CREAT, 0o600)
        stream = os.fdopen(descriptor, "r+b", buffering=0)
        if os.fstat(descriptor).st_size == 0:
            os.write(descriptor, b"0")
        os.lseek(descriptor, 0, os.SEEK_SET)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            stream.close()
            raise RuntimeError("DATA_ROOT_IN_USE") from exc
        os.lseek(descriptor, 0, os.SEEK_SET)
        os.ftruncate(descriptor, 0)
        os.write(descriptor, (self.instance_id + "\n").encode("ascii"))
        os.fsync(descriptor)
        self._stream = stream

    def release(self) -> None:
        if self._stream is None:
            return
        try:
            if os.name == "nt":
                import msvcrt
                os.lseek(self._stream.fileno(), 0, os.SEEK_SET)
                msvcrt.locking(self._stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(self._stream.fileno(), fcntl.LOCK_UN)
        finally:
            self._stream.close()
            self._stream = None

    @property
    def acquired(self) -> bool:
        return self._stream is not None


def _ensure_token(root: Path) -> tuple[str, Path]:
    path = root / "secrets" / "http-token"
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        token = path.read_text(encoding="ascii").strip()
        if len(token) < 32:
            raise RuntimeError("HTTP_TOKEN_INVALID")
        _protect_token(path)
        return token, path
    token = secrets.token_urlsafe(48)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="ascii") as stream:
        stream.write(token + "\n")
        stream.flush()
        os.fsync(stream.fileno())
    _protect_token(path)
    return token, path


def _protect_token(path: Path) -> None:
    if os.name != "nt":
        os.chmod(path, 0o600)
        return
    identity = subprocess.run(
        ["whoami.exe", "/user", "/fo", "csv", "/nh"],
        check=True, capture_output=True, text=True, timeout=5,
    )
    rows = list(csv.reader(io.StringIO(identity.stdout)))
    if len(rows) != 1 or len(rows[0]) < 2 or not rows[0][1].startswith("S-"):
        raise RuntimeError("WINDOWS_IDENTITY_UNAVAILABLE")
    sid = rows[0][1]
    subprocess.run(
        ["icacls.exe", str(path), "/inheritance:r", "/grant:r", f"*{sid}:(F)"],
        check=True, capture_output=True, text=True, timeout=5,
    )


def _builtin_profile_validators() -> dict[str, Callable[[dict[str, Any]], None]]:
    """Load explicitly enabled official Harness validators without persistence."""
    try:
        from agent_box_harnesses.codex.remote import validate_remote_configuration
    except ImportError:
        return {}
    return {"codex": validate_remote_configuration}


def _builtin_wsl(server_instance_id: str) -> WslConnectionPort | None:
    manifest = os.environ.get("AGENT_BOX_WSL_WORKER_MANIFEST")
    worker = os.environ.get("AGENT_BOX_WSL_WORKER_LINUX_PATH")
    if os.name != "nt" or not manifest or not worker:
        return None
    try:
        from agent_box_runtime_wsl import WslConnector
    except ImportError:
        return None
    return WslConnector(
        manifest_path=manifest, linux_worker_path=worker,
        server_instance_id=server_instance_id,
    )


class EventNotifier:
    """Process-local wakeup; SQLite remains the source of event truth."""

    def __init__(self) -> None:
        self._condition = threading.Condition()
        self._generation = 0

    def notify(self) -> None:
        with self._condition:
            self._generation += 1
            self._condition.notify_all()

    def generation(self) -> int:
        with self._condition:
            return self._generation

    def wait_after(self, generation: int, timeout: float = 15.0) -> int:
        with self._condition:
            self._condition.wait_for(lambda: self._generation != generation, timeout)
            return self._generation


@dataclass
class ServerRuntime:
    data_root: Path
    database: Database
    objects: ObjectStore
    repository: ProductRepository
    service: ProductService
    owner: DataRootOwner
    token: str = field(repr=False)
    token_path: Path
    notifier: EventNotifier
    execution: Any | None = None
    started: bool = False

    def start(self) -> None:
        if self.started:
            return
        if not self.owner.acquired:
            self.owner.acquire()
        try:
            self.database.initialize()
            self.repository.mark_workspaces_unverified()
            self.repository.recover_interrupted_turns()
            core_db.configure_database(self.database.path)
            core_db.get_conn()
        except BaseException:
            core_db.configure_database(None)
            self.owner.release()
            raise
        self.started = True

    def stop(self) -> None:
        if self.execution is not None:
            if not self.execution.stop():
                raise RuntimeError("SERVER_STOP_TIMEOUT")
        if self.started:
            core_db.configure_database(None)
        self.owner.release()
        self.started = False


def build_runtime(
    data_root: Path | str, *,
    profile_validators: Mapping[str, Callable[[dict[str, Any]], None]] | None = None,
    wsl: WslConnectionPort | None = None,
    secret_store: SecretStore | None = None,
    codex_transport: Any | None = None,
) -> ServerRuntime:
    root = Path(data_root).resolve()
    owner = DataRootOwner(root)
    owner.acquire()
    try:
        token, token_path = _ensure_token(root)
    except BaseException:
        owner.release()
        raise
    database = Database(root)
    repository = ProductRepository(database)
    objects = ObjectStore(root)
    notifier = EventNotifier()
    validators = dict(profile_validators) if profile_validators is not None else _builtin_profile_validators()
    connector = wsl if wsl is not None else _builtin_wsl(owner.instance_id)
    secrets_store = secret_store
    transport = codex_transport
    if transport is None and os.name == "nt" and connector is not None:
        codex_path = os.environ.get("AGENT_BOX_CODEX_LINUX_PATH")
        codex_digest = os.environ.get("AGENT_BOX_CODEX_SHA256")
        if codex_path and codex_digest:
            from agent_box_runtime_wsl import WslExecutionTransport
            transport = WslExecutionTransport(
                connector, codex_linux_path=codex_path, codex_digest=codex_digest,
            )
    if secrets_store is None and os.name == "nt":
        secrets_store = WindowsDpapiSecretStore(root)
    execution = None
    if transport is not None and secrets_store is not None:
        from .codex import CodexExecutionBackend
        execution = CodexExecutionBackend(
            repository, objects, secrets_store, transport, on_event=notifier.notify,
        )
    service = ProductService(
        repository, objects, profile_validators=validators,
        wsl=connector, execution=execution, on_event=notifier.notify,
        credential_kinds={"codex": "codex-login"},
    )
    return ServerRuntime(
        root, database, objects, repository, service, owner, token, token_path,
        notifier, execution,
    )
