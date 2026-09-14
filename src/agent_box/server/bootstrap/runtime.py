"""Bootstrap assembly: the only place concrete implementations are selected.

Production assembly is provider-neutral: no Harness is wired by default, so
unimplemented capabilities report honestly unavailable until Work Order 40
registers real extension implementations.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import csv
from datetime import datetime, timezone
import io
import json
import os
from pathlib import Path
import secrets
import subprocess
from typing import Any
from uuid import uuid4

from agent_box.server.approvals import ApprovalRecords
from agent_box.server.credentials import CredentialRecords
from agent_box.server.events import EventNotifier
from agent_box.server.execution import HarnessRegistry, TurnExecutionPort
from agent_box.server.idempotency import IdempotentRecords
from agent_box.server.model_configs import ProviderModelRecords, ProviderModelService
from agent_box.server.profiles import ProfileRecords, ProfileService
from agent_box.server.services import ProductService
from agent_box.server.sessions import SessionRecords, SessionService
from agent_box.server.sessions.queue import QueueRecords
from agent_box.server.wire.handlers import WireService
from agent_box.server.workspaces import WorkspaceRecords, WorkspaceService, WslConnectionPort
from agent_box.storage import Database, ObjectStore, SecretStore


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


def _builtin_connector(server_instance_id: str) -> WslConnectionPort | None:
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


@dataclass
class ServerRuntime:
    data_root: Path
    database: Database
    objects: ObjectStore
    repository: "ProductRepositoryView"
    service: ProductService
    owner: DataRootOwner
    token: str = field(repr=False)
    token_path: Path
    notifier: EventNotifier
    secret_store: SecretStore | None = None
    harnesses: HarnessRegistry | None = None
    execution: TurnExecutionPort | None = None
    wire: Any | None = None
    approvals: ApprovalRecords | None = None
    queue: QueueRecords | None = None
    model_configs: ProviderModelService | None = None
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
            from agent_box.work_core import db as core_db
            core_db.configure_database(self.database.path)
            core_db.get_conn()
        except BaseException:
            from agent_box.work_core import db as core_db
            core_db.configure_database(None)
            self.owner.release()
            raise
        self.started = True

    def stop(self) -> None:
        if self.execution is not None and hasattr(self.execution, "stop"):
            if not self.execution.stop():
                raise RuntimeError("SERVER_STOP_TIMEOUT")
        if self.started:
            from agent_box.work_core import db as core_db
            core_db.configure_database(None)
        self.owner.release()
        self.started = False


def _server_id(database: Database) -> str:
    """Return the stable, opaque identity this Server presents to clients.

    It is generated once per data root and reused across restarts, so a client
    can tell "the same Server came back" from "a different Server is here".
    """
    with database.transaction() as conn:
        row = conn.execute("SELECT server_id FROM server_bootstrap WHERE singleton=1").fetchone()
        if row is not None:
            return str(row["server_id"])
        identity = f"server_{uuid4().hex}"
        conn.execute(
            "INSERT INTO server_bootstrap(singleton,server_id,created_at) VALUES (1,?,?)",
            (identity, datetime.now(timezone.utc).isoformat()),
        )
        return identity


def build_runtime(
    data_root: Path | str, *,
    harnesses: HarnessRegistry | None = None,
    connector: WslConnectionPort | None = None,
    secret_store: SecretStore | None = None,
    execution: TurnExecutionPort | None = None,
    execution_factory=None,
) -> ServerRuntime:
    """Assemble a provider-neutral Server runtime.

    `harnesses` carries only descriptors for implementations registered for
    this deployment. `execution` is an explicit port injection (tests, or a
    future bootstrap that composes the Work Order 40 Harness plugin); the
    production default stays None so capability answers stay honest.
    """
    root = Path(data_root).resolve()
    owner = DataRootOwner(root)
    owner.acquire()
    try:
        token, token_path = _ensure_token(root)
    except BaseException:
        owner.release()
        raise
    database = Database(root)
    objects = ObjectStore(root)
    notifier = EventNotifier()
    registry = harnesses if harnesses is not None else HarnessRegistry()
    connector_instance = connector if connector is not None else _builtin_connector(owner.instance_id)
    secrets_store = secret_store
    if secrets_store is None and os.name == "nt":
        from agent_box.storage import WindowsDpapiSecretStore
        secrets_store = WindowsDpapiSecretStore(root)

    idempotency = IdempotentRecords(database)
    credentials = CredentialRecords(database)
    workspace_records = WorkspaceRecords(database, idempotency)
    profile_records = ProfileRecords(database, idempotency)
    provider_model_records = ProviderModelRecords(database, idempotency)
    session_records = SessionRecords(database, idempotency)
    queue_records = QueueRecords(database, idempotency)
    approval_records = ApprovalRecords(database, append_event=session_records._append_session_event)

    if execution is None and execution_factory is not None:
        try:
            execution = execution_factory(
                session_records, objects, approval_records, notifier, connector_instance,
            )
        except BaseException:
            owner.release()
            raise
    if execution is not None and hasattr(execution, "bind_queue"):
        execution.bind_queue(queue_records)
        if hasattr(execution, "bind_queue"):
            execution.bind_queue(queue_records)

    workspace_service = WorkspaceService(workspace_records, idempotency, connector=connector_instance)
    profile_service = ProfileService(profile_records, idempotency, objects,
                                     harnesses=registry, credentials=credentials)
    provider_model_service = ProviderModelService(
        provider_model_records, objects, harnesses=registry,
        credentials=credentials, profiles=profile_records,
    )
    profile_service.bind_model_configs(provider_model_service)
    session_service = SessionService(session_records, idempotency, objects,
                                     harnesses=registry, profiles=profile_records,
                                     credentials=credentials, queue=queue_records,
                                     execution=execution, on_event=notifier.notify)
    service = ProductService(
        workspace_service, profile_service, session_service,
        harnesses=registry, credentials=credentials, execution=execution,
        notifier=notifier,
    )
    from agent_box.server.persistence import ProductRepositoryView
    repository = ProductRepositoryView(
        database=database, idempotency=idempotency, credentials=credentials,
        workspaces=workspace_records, profiles=profile_records, sessions=session_records,
    )
    wire = WireService(
        server_id_provider=lambda: _server_id(database),
        workspaces=workspace_service, profiles=profile_service, sessions=session_service,
        queue=queue_records, approvals=approval_records, harnesses=registry,
        objects=objects, execution=execution, cursor_secret=token.encode("utf-8"),
        model_configs=provider_model_service,
    )
    return ServerRuntime(
        root, database, objects, repository, service, owner, token, token_path,
        notifier, secrets_store, registry, execution, wire,
        approval_records, queue_records,
        provider_model_service,
    )


def build_runtime_from_sidecar_deployment(
    data_root: Path | str, deployment_path: Path | str,
) -> ServerRuntime:
    """Compose registered Harnesses from an explicit non-secret deployment file."""
    path = Path(deployment_path).resolve()
    value = json.loads(path.read_text(encoding="utf-8"))
    if value.get("schemaVersion") != 1 or not isinstance(value.get("harnesses"), list):
        raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
    from agent_box.server.execution import HarnessDescriptor, HarnessRegistry, SidecarExecutionBackend
    from agent_box.server.execution.sidecar import (
        SidecarHarnessPort, WslSidecarLauncher, sidecar_bundle_files,
    )

    deployments: dict[str, dict[str, Any]] = {}
    registry = HarnessRegistry()
    for item in value["harnesses"]:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
        harness_id = item["id"]
        adapter = item.get("adapter")
        if (harness_id in deployments or not isinstance(adapter, dict)
                or not isinstance(adapter.get("command"), str)
                or not isinstance(adapter.get("args", []), list)):
            raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
        deployments[harness_id] = dict(item)
        registry.register(HarnessDescriptor(
            harness_id,
            credential_kind=item.get("credentialKind"),
            capability_claims=dict(item.get("capabilityClaims") or {}),
            control_options={
                str(key): tuple(options)
                for key, options in dict(item.get("controlOptions") or {}).items()
            },
            security_locked_controls=tuple(item.get("securityLockedControls") or ()),
        ))
    bundle = sidecar_bundle_files(value.get("pluginRoot") or path.parent)

    def factory(records, objects, approvals, notifier, connector):
        if connector is None:
            raise RuntimeError("WSL_CONNECTOR_UNAVAILABLE")

        def port_factory(context, on_event):
            try:
                deployment = deployments[context["harness_type"]]
            except KeyError as exc:
                raise RuntimeError("HARNESS_DEPLOYMENT_UNAVAILABLE") from exc
            launcher = WslSidecarLauncher(
                connector,
                workspace={
                    "distribution": context["distribution"],
                    "remote_user": context["remote_user"],
                    "connection_id": context["connection_id"],
                    "remote_path": context["remote_path"],
                },
                bundle=bundle, timeout_ms=int(deployment.get("timeoutMs", 600_000)),
            )
            return SidecarHarnessPort(
                launcher, environment={"AGENTBOX_SIDECAR_ISOLATED": "1"},
                profile=context["harness_type"], adapter=deployment["adapter"],
                state_directory="/tmp/agentbox-sidecar-state", directory="/workspace",
                on_event=on_event,
            )

        return SidecarExecutionBackend(
            records, objects, approvals, port_factory=port_factory,
            on_event=notifier.notify,
        )

    return build_runtime(data_root, harnesses=registry, execution_factory=factory)
