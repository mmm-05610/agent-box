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
from pathlib import Path, PurePosixPath
import re
import secrets
import subprocess
import time
from typing import Any, Mapping
from uuid import uuid4

from agent_box.extensions import capability
from agent_box.server.approvals import ApprovalRecords
from agent_box.server.credentials import CredentialRecords
from agent_box.server.events import EventNotifier
from agent_box.server.execution import HarnessRegistry, TurnExecutionPort
from agent_box.extensions.runtime_composition.sandbox_port import resolve_sandbox_port
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
    # whoami/icacls answer in the console codepage (GBK on zh-CN hosts); the
    # only bytes this code reads back are the ASCII SID, so a lossy decode is
    # strictly better than dying on a localized machine or user name -
    # especially under PYTHONUTF8, where the default decode is always utf-8.
    identity = subprocess.run(
        ["whoami.exe", "/user", "/fo", "csv", "/nh"],
        check=True, capture_output=True, text=True, errors="replace", timeout=5,
    )
    rows = list(csv.reader(io.StringIO(identity.stdout)))
    if len(rows) != 1 or len(rows[0]) < 2 or not rows[0][1].startswith("S-"):
        raise RuntimeError("WINDOWS_IDENTITY_UNAVAILABLE")
    sid = rows[0][1]
    subprocess.run(
        ["icacls.exe", str(path), "/inheritance:r", "/grant:r", f"*{sid}:(F)"],
        check=True, capture_output=True, text=True, errors="replace", timeout=5,
    )


def _builtin_connector(server_instance_id: str) -> WslConnectionPort | None:
    manifest = os.environ.get("AGENT_BOX_WSL_WORKER_MANIFEST")
    worker = os.environ.get("AGENT_BOX_WSL_WORKER_LINUX_PATH")
    if os.name != "nt" or not manifest or not worker:
        return None
    # A host connector is resolved by name here, exactly as the sandbox
    # provider is: the installed plugin entry point first, the importable
    # package as the PYTHONPATH-runtime fallback. Bindings left unset compose
    # no connector, which `resolve_placement` then refuses out loud.
    bindings = {
        "manifest_path": manifest, "linux_worker_path": worker,
        "server_instance_id": server_instance_id,
    }
    factory = _entry_point_factory("runtime-wsl")
    if factory is not None:
        try:
            return factory(**bindings)
        except TypeError:
            pass
    try:
        from agent_box_runtime_wsl import WslConnector
    except ImportError:
        return None
    return WslConnector(**bindings)


def _entry_point_factory(name: str):
    """The callable a plugin entry point registers under ``name``, if any."""
    from importlib import metadata

    from agent_box.extensions.loader import ENTRY_POINT_GROUP

    discovered = metadata.entry_points()
    group = (
        discovered.select(group=ENTRY_POINT_GROUP)
        if hasattr(discovered, "select") else discovered.get(ENTRY_POINT_GROUP, ())
    )
    wanted = name.strip().lower().replace("-", "_")
    for entry_point in group:
        if entry_point.name.lower().replace("-", "_") == wanted:
            return entry_point.load()
    return None


def _builtin_ssh_connector(server_instance_id: str):
    """Compose the SSH connector from process bindings, the way WSL's is.

    Like the WSL connector's bindings, these name machine-local facts the
    deployment document must not carry: which manifest pins the Worker, where
    the Worker already lives on the remote host, and the locator of the identity
    that may reach it. A binding left unset simply means that placement is not
    composed here - which `resolve_placement` then says out loud.
    """
    manifest = os.environ.get("AGENT_BOX_SSH_WORKER_MANIFEST")
    worker = os.environ.get("AGENT_BOX_SSH_WORKER_REMOTE_PATH")
    identity = os.environ.get("AGENT_BOX_SSH_IDENTITY_FILE")
    if not manifest or not worker or not identity:
        return None
    from agent_box.server.execution.ssh_connector import SshConnector

    port = os.environ.get("AGENT_BOX_SSH_PORT")
    return SshConnector(
        manifest_path=manifest, remote_worker_path=worker,
        identity_file=identity, server_instance_id=server_instance_id,
        port=int(port) if port else 22,
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
    #: Credential declarations from the deployment document, imported on start
    #: (the store and the records table both exist only once the schema is up).
    declared_credentials: tuple[dict[str, str], ...] = ()
    started: bool = False

    def start(self) -> None:
        if self.started:
            return
        if not self.owner.acquired:
            self.owner.acquire()
        try:
            self.database.initialize()
            _import_declared_credentials(self, self.declared_credentials)
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
    ssh_connector=None,
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
    ssh_instance = ssh_connector if ssh_connector is not None else _builtin_ssh_connector(owner.instance_id)
    # The composition's connectors, keyed by the placement that consumes them.
    # Everything downstream reads this mapping, so "which environments can this
    # Server actually reach" is one fact stated once.
    connectors = {"wsl": connector_instance, "ssh": ssh_instance}
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
    queue_records = QueueRecords(
        database, idempotency, append_event=session_records._append_session_event,
        objects=objects,
    )
    approval_records = ApprovalRecords(database, append_event=session_records._append_session_event)

    if execution is None and execution_factory is not None:
        try:
            execution = execution_factory(
                session_records, objects, approval_records, notifier, connectors,
                credentials, secrets_store,
            )
        except BaseException:
            owner.release()
            raise
    if execution is not None and hasattr(execution, "bind_queue"):
        execution.bind_queue(queue_records)

    workspace_service = WorkspaceService(
        workspace_records, idempotency, connector=connector_instance,
        ssh_connector=ssh_instance,
    )
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
                                     execution=execution, on_event=notifier.notify,
                                     secret_store=secrets_store)
    session_service.bind_model_configs(provider_model_service)
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
    secret_store: SecretStore | None = None, *,
    plugin_root: Path | str, mount_bindings: Mapping[str, str] | None = None,
) -> ServerRuntime:
    """Compose registered Harnesses from an explicit non-secret deployment file.

    `secret_store` is the same explicit injection `build_runtime` accepts: a
    deployment that declares a credential kind needs a store to read the
    credential from, and a caller that already owns one (Windows DPAPI, or an
    acceptance harness with an ephemeral store) passes it here rather than
    relying on the platform default.

    The document names no host path. `plugin_root` is the machine-local root its
    plugin-relative sources are read from - supplied by whoever runs the Server,
    never carried in the document - and every mount the document declares names a
    `token` whose machine-local path `mount_bindings` supplies. A document that
    still carries a host path, or a mount with no binding, is refused rather than
    half-used: that refusal is what keeps one document runnable on any machine.
    """
    path = Path(deployment_path).resolve()
    value = json.loads(path.read_text(encoding="utf-8"))
    if (not isinstance(value, dict) or value.get("schemaVersion") != 1
            or not isinstance(value.get("harnesses"), list)):
        raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
    if "pluginRoot" in value:
        raise RuntimeError("SIDECAR_DEPLOYMENT_HOST_PATH")
    root = Path(plugin_root).resolve()
    bindings = dict(mount_bindings or {})
    used_bindings: set[str] = set()
    from agent_box.server.execution import HarnessDescriptor, HarnessRegistry, SidecarExecutionBackend
    from agent_box.server.execution.local_channel import LocalSidecarLauncher
    from agent_box.server.execution.placement import SSH_CHANNEL, WSL_CHANNEL, resolve_placement
    from agent_box.server.execution.sidecar import (
        SidecarHarnessPort, WorkerSidecarLauncher, sidecar_bundle_files,
    )
    from agent_box.resource_contracts.harness_capabilities import (
        CapabilityDeclarationError, validate_claims,
    )

    deployments: dict[str, dict[str, Any]] = {}
    additional_bundle: dict[str, bytes] = {}
    registry = HarnessRegistry()
    for item in value["harnesses"]:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
        harness_id = item["id"]
        adapter = item.get("adapter")
        model_control_id = item.get("modelControlId")
        credential_kind = item.get("credentialKind")
        credential_environment = item.get("credentialEnvironment")
        timeout_ms = item.get("timeoutMs", 120_000)
        if (harness_id in deployments
                or re.fullmatch(r"[a-z][a-z0-9._-]{0,63}", harness_id) is None
                or not isinstance(adapter, dict)
                or not isinstance(adapter.get("command"), str)
                or not isinstance(adapter.get("args", []), list)
                or any(not isinstance(argument, str) or len(argument) > 8192 or "\x00" in argument
                       for argument in adapter.get("args", []))
                or type(timeout_ms) is not int or not 1 <= timeout_ms <= 120_000):
            raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
        if model_control_id is not None and (
            not isinstance(model_control_id, str) or not model_control_id
        ):
            raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
        if credential_kind is not None and (
            not isinstance(credential_kind, str) or not credential_kind
        ):
            raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
        if credential_environment is not None and (
            credential_kind is None
            or not isinstance(credential_environment, str)
            or re.fullmatch(r"[A-Z][A-Z0-9_]{0,63}", credential_environment) is None
        ):
            raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
        deployment = dict(item)
        deployment["_timeout_ms"] = timeout_ms
        adapter = dict(adapter)
        adapter_source = adapter.pop("source", None)
        if adapter_source is not None:
            if adapter["command"] != "/usr/bin/node":
                raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
            content = _sidecar_deployment_file(root, adapter_source)
            bundle_path = f"agentbox-sidecar/deployment/{harness_id}/adapter.mjs"
            additional_bundle[bundle_path] = content
            adapter["args"] = [f"/runtime/view/{bundle_path}", *adapter.get("args", [])]
        driver = adapter.pop("driver", None)
        if driver is not None:
            # A native Harness whose protocol is not ACP declares the module the
            # sidecar must load instead, as a plugin file named by the
            # deployment. Nothing here knows what that module speaks: the
            # declaration is carried into the reviewed bundle and the fixed view
            # path is what the sidecar loads, so no brand reaches this layer.
            if (not isinstance(driver, dict) or set(driver) != {"source"}
                    or not isinstance(driver.get("source"), str)):
                raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
            content = _sidecar_deployment_file(root, driver["source"])
            driver_bundle_path = f"agentbox-sidecar/deployment/{harness_id}/driver.mjs"
            additional_bundle[driver_bundle_path] = content
            adapter["driver"] = {"module": f"/runtime/view/{driver_bundle_path}"}
        environment = adapter.get("environment") or {}
        if not isinstance(environment, dict) or any(
            not isinstance(key, str) or re.fullmatch(r"[A-Z][A-Z0-9_]{0,63}", key) is None
            or re.search(r"TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL|AUTH", key, re.I)
            or not isinstance(setting, str) or len(setting) > 8192 or "\x00" in setting
            or re.fullmatch(r"sk-[A-Za-z0-9_-]+", setting) is not None
            for key, setting in environment.items()
        ):
            raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
        adapter["environment"] = dict(environment)
        deployment["adapter"] = adapter
        projection_mounts = []
        projection_targets: list[str] = []
        for index, projection in enumerate(item.get("projectionFiles") or ()):
            if not isinstance(projection, dict) or set(projection) != {"source", "target"}:
                raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
            source = projection.get("source")
            # 目标先校验（同一个 guest home 语法，与 bwrap 侧共用一套实现），
            # 再读源文件：一个越界/非规范的目标不该让 Server 先去读盘。
            target = _home_projection_target(projection.get("target"), kind="file")
            content = _sidecar_deployment_file(root, source)
            suffix = Path(str(source)).name
            bundle_path = f"agentbox-sidecar/deployment/{harness_id}/projection-{index}-{suffix}"
            additional_bundle[bundle_path] = content
            projection_mounts.append((bundle_path, target))
            projection_targets.append(target)
        deployment["_projection_mounts"] = tuple(projection_mounts)
        executable_authorizations = []
        executable_mounts = []
        for executable in item.get("executableMounts") or ():
            if not isinstance(executable, dict) or "source" in executable:
                raise RuntimeError("SIDECAR_DEPLOYMENT_HOST_PATH")
            target = executable.get("target")
            digest_value = executable.get("digest")
            source = _bound_mount_path(executable.get("token"), bindings, used_bindings)
            if (not isinstance(target, str)
                    or re.fullmatch(r"/runtime/bin/[A-Za-z0-9._-]+", target) is None
                    or not isinstance(digest_value, str)
                    or re.fullmatch(r"sha256:[0-9a-f]{64}", digest_value) is None):
                raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
            executable_authorizations.append({"path": source, "digest": digest_value})
            executable_mounts.append((source, target))
        deployment["_executable_authorizations"] = tuple(executable_authorizations)
        deployment["_executable_mounts"] = tuple(executable_mounts)
        artifact_authorizations = _runtime_artifact_declarations(
            item.get("runtimeArtifactMounts"), bindings, used_bindings,
        )
        deployment["_runtime_artifact_authorizations"] = artifact_authorizations
        deployment["_runtime_artifact_mounts"] = tuple(
            (str(declaration["path"]), str(declaration["target"]))
            for declaration in artifact_authorizations
        )
        preferred_auth_method = item.get("preferredAuthMethod")
        if preferred_auth_method is not None and (
            not isinstance(preferred_auth_method, str)
            or re.fullmatch(r"[a-z][a-z0-9._-]{0,63}", preferred_auth_method) is None
        ):
            raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
        state_projection = item.get("stateProjection")
        # §14 (session library independent of the profile home): a family whose
        # session subtree can be split from the rest of its home declares
        # `sessionStore.kind = "sessions-subtree"`; the declared state target is
        # then the *session subtree* inside the guest home and is bound to the
        # per-harness store on the host. The default ("profile-home") keeps the
        # pre-§14 binding byte for byte - shared-DB families (the library holds
        # credential/account tables next to its session tables) must stay there.
        session_store = item.get("sessionStore")
        session_store_kind = "profile-home"
        if session_store is not None:
            if (not isinstance(session_store, dict)
                    or not set(session_store) <= {"kind"}
                    or not isinstance(session_store.get("kind"), str)
                    or session_store["kind"] not in {"profile-home", "sessions-subtree"}):
                raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
            session_store_kind = session_store["kind"]
        state_target: str | None = None
        state_ephemeral_paths: tuple[str, ...] = ()
        if state_projection is not None:
            if (not isinstance(state_projection, dict)
                    or not set(state_projection) <= {"target", "ephemeralPaths"}
                    or not isinstance(state_projection.get("target"), str)):
                raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
            state_target = _home_projection_target(
                state_projection["target"], kind="directory",
            )
            declared = state_projection.get("ephemeralPaths")
            if declared is None:
                declared = []
            if not isinstance(declared, list) or len(declared) > 8:
                raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
            for relative in declared:
                if not isinstance(relative, str):
                    raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
                # 与 target 同一套沙箱语法验证“可写 state 内的临时子路径”，
                # 由 bwrap 以 tmpfs 遮蔽：可写但不进 view/state/checkpoint。
                _home_projection_target(
                    f"{state_target}/{relative}", kind="directory",
                )
            state_ephemeral_paths = tuple(declared)
        # 受保护集合**派生**自这份声明本身：落在可写 state 子树里的只读投影文件
        # （按 state 目标的相对路径记名）。它既不按家硬编码，也不依赖"overlay 恰好
        # 遮住"——checkpoint 捕获按名字排除，恢复遇到同名相对路径直接类型化拒绝。
        deployment["_protected_state_paths"] = _protected_state_paths(
            tuple(projection_targets), state_target,
        )
        if session_store_kind == "sessions-subtree" and state_target is None:
            raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
        if state_target is not None:
            deployment["_state_target"] = state_target
        else:
            deployment["_state_target"] = None
        deployment["_session_store"] = session_store_kind
        deployment["_state_ephemeral_paths"] = state_ephemeral_paths
        deployments[harness_id] = deployment
        # 能力声明是部署座位上的唯一入口：canonical id + 真 bool，其它一律类型化拒绝。
        # 任何生产模板都只能经过这里，不能再各自手写一套不受校验的字典。
        raw_claims = item.get("capabilityClaims")
        try:
            capability_claims = {} if raw_claims is None else validate_claims(raw_claims)
        except CapabilityDeclarationError as exc:
            raise RuntimeError(f"SIDECAR_DEPLOYMENT_INVALID: {exc.code}") from exc
        registry.register(HarnessDescriptor(
            harness_id,
            credential_kind=credential_kind,
            model_control_id=model_control_id,
            credential_environment=credential_environment,
            capability_claims=capability_claims,
            control_options={
                str(key): tuple(options)
                for key, options in dict(item.get("controlOptions") or {}).items()
            },
            security_locked_controls=tuple(item.get("securityLockedControls") or ()),
        ))
    unused = sorted(set(bindings) - used_bindings)
    if unused:
        # A binding nobody asked for is a typo or a stale document, and silently
        # ignoring it would hide which artifact the deployment really uses.
        raise RuntimeError("SIDECAR_ARTIFACT_BINDING_UNUSED")

    # Each seat's native home comes from the Harness registry, never from the
    # document: the document describes how a room runs, the registry says where
    # a Harness's own state lives. A seat with no declared native home cannot
    # run in the native-home model and is refused when a turn asks for it.
    native_homes = _registry_native_homes()
    for harness_id, deployment in deployments.items():
        deployment["_native_home"] = native_homes.get(harness_id)

    bundle = sidecar_bundle_files(root, additional_files=additional_bundle)

    # Credential sources are *declared* here and read from their own files: the
    # deployment document stays a non-secret artifact, and this is the only
    # place the product server can learn about a credential the operator (or the
    # Desktop that owns the machine's credential records) has placed. The strict
    # key set below is what enforces "no secret in the document" - a `value` or
    # `secret` key is a typed refusal, not an ignored extra.
    declared_credentials = _deployment_credentials(value)

    # The local placement's home root is this Server's own data root: the
    # Server *is* the machine that runs those turns. It is a machine-local
    # fact, never a document field and never a recorded path.
    local_home_root = str(Path(data_root).resolve() / "profiles")

    def factory(records, objects, approvals, notifier, connectors, credentials, secret_store):
        # No gate here: whether a connector is required depends on the placement
        # the workspace names, and that is resolved per turn.
        def port_factory(context, on_event):
            try:
                deployment = deployments[context["harness_type"]]
            except KeyError as exc:
                raise RuntimeError("HARNESS_DEPLOYMENT_UNAVAILABLE") from exc
            frozen = json.loads(objects.read(context["config_object_digest"]))
            execution = dict(frozen.get("execution") or {})
            descriptor = registry.get(context["harness_type"])
            credential_id = execution.get("credentialId") or context.get("credential_id")
            credential = None
            if credential_id is not None:
                record = credentials.get(credential_id, kind=descriptor.credential_kind)
                if secret_store is None:
                    raise RuntimeError("CREDENTIAL_STORE_UNAVAILABLE")
                credential = secret_store.read(record["secret_locator"])
            # The native home: no restore, no upload. The Harness reopens its
            # own durable directory on the machine that runs this turn; the
            # record's locator (kept once a turn has run) survives renames,
            # and the first turn of a Session derives it from the role name.
            native_home = deployment.get("_native_home")
            if not native_home:
                raise RuntimeError(
                    f"HARNESS_NATIVE_HOME_UNDECLARED: {context['harness_type']}"
                )
            home_locator = context.get("home_locator") or _profile_home_locator(
                context.get("profile_name") or context["harness_type"], native_home,
            )
            # The workspace record says where this turn belongs; that fact - and
            # only that fact - decides which channel stages and starts it.
            kind = context.get("env_kind")
            placement = resolve_placement(
                kind, has_connector=connectors.get(kind) is not None,
            )
            audit_window = _window_of_state_target(
                deployment["_state_target"], native_home,
            )
            # The sandbox is resolved by name, never imported here: the name
            # comes from the deployment, the process environment, or the one
            # documented default provider id. An unresolvable name is a typed
            # refusal, not a silent run without isolation.
            sandbox_port = resolve_sandbox_port(
                deployment.get("sandboxProvider")
                or os.environ.get("AGENT_BOX_SANDBOX_PROVIDER")
                or "sandbox-bwrap"
            )
            if placement.channel in {WSL_CHANNEL, SSH_CHANNEL}:
                launcher = WorkerSidecarLauncher(
                    connectors[placement.kind],
                    workspace={
                        "distribution": context["distribution"],
                        "remote_user": context["remote_user"],
                        "connection_id": context["connection_id"],
                        "remote_path": context["remote_path"],
                    },
                    bundle=bundle, credential=credential,
                    executable_authorizations=deployment["_executable_authorizations"],
                    executable_mounts=deployment["_executable_mounts"],
                    runtime_artifact_authorizations=deployment["_runtime_artifact_authorizations"],
                    runtime_artifact_mounts=deployment["_runtime_artifact_mounts"],
                    projection_mounts=deployment["_projection_mounts"],
                    home_locator=home_locator,
                    native_home=native_home,
                    profile_id=context["profile_id"],
                    harness_type=context["harness_type"],
                    audit_window=audit_window,
                    state_ephemeral_paths=deployment["_state_ephemeral_paths"],
                    protected_state_paths=deployment["_protected_state_paths"],
                    timeout_ms=deployment["_timeout_ms"],
                    sandbox_port=sandbox_port,
                    session_store_harness=(
                        context["harness_type"]
                        if deployment["_session_store"] == "sessions-subtree" else None
                    ),
                    session_store_target=(
                        deployment["_state_target"]
                        if deployment["_session_store"] == "sessions-subtree" else None
                    ),
                )
            else:
                launcher = LocalSidecarLauncher(
                    workspace_path=context.get("normalized_path") or context["remote_path"],
                    bundle=bundle, credential=credential,
                    executable_mounts=deployment["_executable_mounts"],
                    runtime_artifact_mounts=deployment["_runtime_artifact_mounts"],
                    projection_mounts=deployment["_projection_mounts"],
                    home_root=local_home_root,
                    home_locator=home_locator,
                    profile_id=context["profile_id"],
                    harness_type=context["harness_type"],
                    state_target=deployment["_state_target"],
                    state_ephemeral_paths=deployment["_state_ephemeral_paths"],
                    protected_state_paths=deployment["_protected_state_paths"],
                    sandbox_port=sandbox_port,
                    session_store_harness=(
                        context["harness_type"]
                        if deployment["_session_store"] == "sessions-subtree" else None
                    ),
                    session_store_target=(
                        deployment["_state_target"]
                        if deployment["_session_store"] == "sessions-subtree" else None
                    ),
                )
            capability_documents, capability_grants, authorized, binding = (
                _capability_material(context, deployment)
            )
            return SidecarHarnessPort(
                launcher, environment={"AGENTBOX_SIDECAR_ISOLATED": "1"},
                profile=context["harness_type"], adapter=deployment["adapter"],
                model=execution.get("model"),
                capability_documents=capability_documents,
                capability_grants=capability_grants,
                capability_authorized_providers=authorized,
                capability_binding=binding,
                credential_environment=(
                    descriptor.credential_environment if credential is not None else None
                ),
                preferred_auth_method=deployment.get("preferredAuthMethod"),
                # A recorded native id is reopened only when the harness
                # declares durable state (a native-home window) and a turn has
                # already recorded a locator under it. Anything less - a
                # pre-home Session, a seat with no declared window - opens a
                # fresh native session, and the changed native id says so
                # instead of pretending a reopen succeeded.
                resume_native_id=(
                    context.get("checkpoint_native_id")
                    if context.get("home_locator") and deployment["_state_target"]
                    else None
                ),
                # The sidecar's own working state (a bridge's session index)
                # lives inside the home window: it must survive the attempt,
                # because the next turn's resume reads it from the same durable
                # directory the room binds. It was an ephemeral /tmp path when
                # state travelled as bytes; the home replaces both.
                state_directory=deployment["_state_target"]
                or f"/runtime/home/{native_home}",
                directory="/workspace",
                native_platform=placement.kind if kind else None,
                home_locator=home_locator,
                # 静态上限只能来自已校验的注册声明（不依赖 port 的默认值）。
                declared_capabilities=descriptor.capability_claims,
                on_event=on_event,
            )

        return SidecarExecutionBackend(
            records, objects, approvals, port_factory=port_factory,
            on_event=notifier.notify,
        )

    runtime = build_runtime(data_root, harnesses=registry, execution_factory=factory,
                            secret_store=secret_store)
    runtime.declared_credentials = tuple(declared_credentials)
    return runtime


#: 装配边界自有锁定允许映射：只有显式批准的能力声明提供者才能进入选择。
#: "已安装/已加载"本身不构成授权——声明文档的 provider 必须与这里的身份逐字相符。
_APPROVED_CAPABILITY_DECLARERS = frozenset({"sandbox-bwrap"})


def _capability_binding(context: Mapping[str, Any]) -> str:
    """本次执行的中立环境身份（canonical 串）：分发/连接/远端路径三元组。

    声明文档与匹配上下文都用这一处派生结果，保证声明、授权、需求与环境绑定
    绑定在同一次执行上；绑定不含品牌词，业务层与公共层不需要解释它。
    """
    return "|".join((
        str(context.get("distribution", "")),
        str(context.get("connection_id", "")),
        str(context.get("remote_path", "")),
    ))


def _capability_material(
    context: Mapping[str, Any], deployment: Mapping[str, Any],
) -> tuple[tuple[Any, ...], tuple[Any, ...], tuple[str, ...], str]:
    """Build the neutral injectables for one execution at the assembly boundary.

    返回 (declaration documents, grants, authorized providers, binding)：
    * documents 由插件以本次部署派生的 targets 逐执行构造（与 launcher 同源）；
      插件拒绝或 provider 不在批准映射内时返回空集——门随后 fail-closed 拒绝；
    * grants 来自部署文档的显式授权字段（独立推导路径），provenance 锁定政策；
    * authorized providers 来自本模块常量映射，不取自声明文档自身。
    """
    binding = _capability_binding(context)
    executable_targets = tuple(
        target for _source, target in deployment.get("_executable_mounts", ())
    )
    projection_targets = tuple(
        target for _source, target in deployment.get("_projection_mounts", ())
    )
    artifact_targets = tuple(
        target for _source, target in deployment.get("_runtime_artifact_mounts", ())
    )
    state_target = deployment.get("_state_target")
    grants = capability.sidecar_grants(
        deployment_executable_targets=executable_targets,
        deployment_projection_targets=projection_targets,
        deployment_artifact_targets=artifact_targets,
        deployment_state_target=state_target,
    )
    documents: tuple[Any, ...] = ()
    try:
        # 身份独立核对：实际安装插件的 descriptor id 与声明自报的 provider 必须
        # 一致，且两者都落在本模块的锁定批准映射内。"已安装/已加载"本身不构成
        # 授权——descriptor 只是待比对的身份，批准集才是授权来源。
        # 声明文档由**已解析的沙箱端口**构造（上层不认识具体沙箱）。
        port = resolve_sandbox_port(
            deployment.get("sandboxProvider")
            or os.environ.get("AGENT_BOX_SANDBOX_PROVIDER")
            or "sandbox-bwrap"
        )
        descriptor_id = port.descriptor_id()
        document = port.declaration_document(
            readonly_targets=executable_targets + projection_targets + artifact_targets,
            writable_targets=((state_target,) if state_target else ()),
            environment_binding=binding,
            observed_at=int(time.time()),
        )
        if (
            descriptor_id in _APPROVED_CAPABILITY_DECLARERS
            and document.provider in _APPROVED_CAPABILITY_DECLARERS
            and document.provider == descriptor_id
        ):
            documents = (document,)
    except Exception:
        # 解析不到端口、或 provider 按自己的语法拒绝了声明的面：材料留空；
        # 能力门随后 fail-closed 拒绝本次执行——绝不把失败变成一份声明。
        documents = ()
    return documents, grants, tuple(sorted(_APPROVED_CAPABILITY_DECLARERS)), binding


#: The exact keys one credential declaration may use. `sourcePath` is a *path*;
#: a document that tried to carry the secret itself would have to invent a key,
#: and an invented key is a refusal here rather than a silently ignored extra.
_CREDENTIAL_DECLARATION_KEYS = frozenset({"credentialId", "kind", "label", "sourcePath"})
_CREDENTIAL_ID = re.compile(r"^credential_[0-9a-f]{32}$")


def _deployment_credentials(value: Mapping[str, Any]) -> list[dict[str, str]]:
    """Validate the optional `credentials` section of a deployment document.

    Returns the declarations in order; each is `{credentialId, kind, sourcePath,
    label}` with the label possibly empty. Nothing is read here - the file is
    opened by the secret store during import, which is also where the
    symlink/size/bounds rules live, so a declaration can only point at a real,
    ordinary file within the store's own limits.
    """
    raw = value.get("credentials")
    if raw is None:
        return []
    if not isinstance(raw, list) or len(raw) > 16:
        raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID: credentials must be at most 16 entries")
    declarations: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, Mapping) or set(item) - _CREDENTIAL_DECLARATION_KEYS:
            raise RuntimeError(
                "SIDECAR_DEPLOYMENT_INVALID: a credential declaration takes exactly "
                "credentialId, kind, sourcePath and optional label"
            )
        credential_id = item.get("credentialId")
        kind = item.get("kind")
        source = item.get("sourcePath")
        label = item.get("label", "")
        if not isinstance(credential_id, str) or _CREDENTIAL_ID.fullmatch(credential_id) is None:
            raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID: credentialId must be credential_<32 hex>")
        if credential_id in seen:
            raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID: duplicate credentialId")
        if not isinstance(kind, str) or not (1 <= len(kind) <= 32):
            raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID: credential kind is required")
        if not isinstance(source, str) or not Path(source).is_absolute():
            raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID: credential sourcePath must be absolute")
        if not isinstance(label, str) or len(label) > 64:
            raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID: credential label is at most 64 characters")
        seen.add(credential_id)
        declarations.append({
            "credentialId": credential_id, "kind": kind, "label": label, "sourcePath": source,
        })
    return declarations


def _import_declared_credentials(runtime: Any, declarations: list[dict[str, str]]) -> None:
    """Import each declared source into the Server's own store, once.

    A restart with the same deployment must not duplicate records or re-read the
    source: the declaration names an identity, and an identity that already
    resolves is already satisfied. A declaration whose source has since become
    unreadable fails the start rather than quietly leaving a harness without the
    credential it was declared with.
    """
    records = runtime.repository.credentials
    for declaration in declarations:
        if records.exists(declaration["credentialId"]):
            continue
        store = runtime.secret_store
        if store is None:
            raise RuntimeError(
                "SIDECAR_DEPLOYMENT_CREDENTIAL_STORE_MISSING: the deployment declares a "
                "credential but this Server was composed without a secret store"
            )
        try:
            _store_id, locator = store.import_file(
                Path(declaration["sourcePath"]), declaration["kind"],
            )
        except (OSError, ValueError) as exc:
            raise RuntimeError(
                f"SIDECAR_DEPLOYMENT_CREDENTIAL_UNREADABLE: {declaration['credentialId']}: "
                f"{type(exc).__name__}: {exc}"
            ) from exc
        records.register(declaration["credentialId"], declaration["kind"], locator)


def _home_projection_target(target: Any, *, kind: str) -> str:
    """Validate one declared guest-home target with the sandbox's own grammar.

    The Server does not own the guest layout: the one implementation lives with
    the sandbox that will actually create it, and this wrapper only translates
    its typed refusal into the deployment-level error this loader reports.  A
    deployment is therefore accepted here if and only if the compiler can mount
    it.
    """
    from agent_box.resource_contracts.home_projection import (
        HomeProjectionRejected, home_projection_target,
    )

    try:
        return home_projection_target(target, kind=kind)
    except HomeProjectionRejected:
        raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID") from None


def _protected_state_paths(
    projection_targets: tuple[str, ...], state_target: str | None,
) -> tuple[str, ...]:
    """Derive the read-only paths inside the writable state subtree."""
    from agent_box.resource_contracts.home_projection import (
        HomeProjectionRejected, protected_state_paths,
    )

    try:
        return protected_state_paths(projection_targets, state_target)
    except HomeProjectionRejected:
        raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID") from None


#: The token grammar shared by every mount a deployment declares.
MOUNT_TOKEN = re.compile(r"[a-z][a-z0-9-]{0,31}")


def _bound_mount_path(
    token: Any, bindings: Mapping[str, str], used: set[str],
) -> str:
    """Resolve one mount token to the machine-local path the caller bound.

    A document that names a host path instead of a token, a token nobody bound,
    or a binding value that is not an absolute path is refused here: the same
    document has to run on WSL, on this machine and over SSH, and a path in the
    document is exactly what stops that from being true.
    """
    if not isinstance(token, str) or MOUNT_TOKEN.fullmatch(token) is None:
        raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
    bound = bindings.get(token)
    if not isinstance(bound, str) or not bound.startswith("/"):
        raise RuntimeError("SIDECAR_ARTIFACT_BINDING_MISSING")
    if "\\" in bound or "\x00" in bound or "//" in bound or bound.endswith("/"):
        raise RuntimeError("SIDECAR_ARTIFACT_BINDING_INVALID")
    used.add(token)
    return bound


def _runtime_artifact_declarations(
    value: Any, bindings: Mapping[str, str] | None = None, used: set[str] | None = None,
) -> tuple[dict[str, str], ...]:
    """Validate `runtimeArtifactMounts`, resolving each token to its binding.

    The document declares *which* artifact tree a Harness needs and its expected
    digest; where that tree lives on the machine running the Worker is the
    caller's binding, not the document's line.  Existence, link status, the tree
    digest and every overlap rule are still settled on that machine, inside the
    distribution that will read the tree; the Server refuses a declaration that
    could not be verified at all and carries the exact digests across unchanged.
    """
    from agent_box.resource_contracts.runtime_artifacts import (
        MAX_RUNTIME_ARTIFACT_TREES, RuntimeArtifactRejected,
        validate_runtime_artifact_target,
    )

    if value is None:
        return ()
    if not isinstance(value, list) or len(value) > MAX_RUNTIME_ARTIFACT_TREES:
        raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
    declarations: list[dict[str, str]] = []
    paths: set[str] = set()
    targets: set[str] = set()
    for item in value:
        if not isinstance(item, dict) or set(item) != {"token", "target", "treeDigest"}:
            raise RuntimeError("SIDECAR_DEPLOYMENT_HOST_PATH" if "source" in item
                               else "SIDECAR_DEPLOYMENT_INVALID")
        source = _bound_mount_path(item["token"], bindings or {}, used if used is not None else set())
        target = item["target"]
        digest_value = item["treeDigest"]
        if (not isinstance(digest_value, str)
                or re.fullmatch(r"sha256:[0-9a-f]{64}", digest_value) is None):
            raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
        try:
            validate_runtime_artifact_target(target)
        except RuntimeArtifactRejected:
            raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID") from None
        if source in paths or target in targets:
            raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
        paths.add(source)
        targets.add(target)
        declarations.append({"path": source, "target": target, "digest": digest_value})
    return tuple(declarations)


def _sidecar_deployment_file(root: Path, relative: Any) -> bytes:
    """Read one non-secret plugin artifact named by the deployment.

    `relative` is a plugin-relative name, never a host path: a drive letter, a
    leading separator or a UNC prefix is refused here, so a document written for
    one machine cannot half-work on another.
    """
    if (not isinstance(relative, str) or relative.startswith("/") or "\\" in relative
            or ":" in relative or "\x00" in relative
            or any(part in {"", ".", ".."} for part in relative.split("/"))):
        raise RuntimeError("SIDECAR_DEPLOYMENT_HOST_PATH")
    candidate = root.joinpath(*relative.split("/"))
    if candidate.is_symlink():
        raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
    try:
        resolved = candidate.resolve(strict=True)
        resolved.relative_to(root)
    except (OSError, ValueError):
        raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID") from None
    if not resolved.is_file() or resolved.stat().st_size > 8 * 1024 * 1024:
        raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID")
    return resolved.read_bytes()


def _registry_native_homes() -> dict[str, str]:
    """The native home each registered Harness declares, keyed by seat id.

    Asked once per composition. The registry is the only place a Harness says
    where its own state lives; a deployment cannot invent one, and a seat the
    registry does not know has none (refused at dispatch, not guessed here).
    """
    try:
        from agent_box_harnesses.registry import load_builtin_registry
    except ImportError:
        return {}
    try:
        registry = load_builtin_registry()
    except Exception:
        return {}
    homes = {}
    for definition in registry.all():
        homes[definition.identity.harness_type] = definition.profile.native_home
    return homes


def _profile_home_locator(name: str, native_home: str) -> str:
    """`<role>/<native home>` - the locator a first Session records.

    The role directory is a normalized label chosen at creation; a later
    rename never recomputes it, because the Session (and the marker inside)
    keeps the locator that was recorded when the home was made.
    """
    normalized = re.sub(r"[^a-z0-9-]+", "-", (name or "").lower()).strip("-")
    normalized = normalized[:40] or "role"
    return f"{normalized}/{native_home}"


def _window_of_state_target(state_target: str | None, native_home: str) -> str | None:
    """The audit window relative to the role directory, or None.

    `stateProjection.target` stays a guest path under the guest home; the
    window is that path minus the guest home prefix, so it can name a subtree
    outside the native home as well as one inside it - whichever way the
    Harness family declares its own durable state. A target outside the guest
    home cannot be served by a home bind and is refused.
    """
    del native_home
    if not state_target:
        return None
    prefix = "/runtime/home/"
    if not state_target.startswith(prefix) or state_target == prefix:
        raise RuntimeError("SIDECAR_STATE_PROJECTION_INVALID")
    window = state_target[len(prefix):]
    if (not window or window.startswith("/")
            or any(part in {"", ".", ".."} for part in window.split("/"))
            or "\\" in window or "\x00" in window):
        raise RuntimeError("SIDECAR_STATE_PROJECTION_INVALID")
    return window
