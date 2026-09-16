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
from typing import Any, Mapping
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
    queue_records = QueueRecords(
        database, idempotency, append_event=session_records._append_session_event,
        objects=objects,
    )
    approval_records = ApprovalRecords(database, append_event=session_records._append_session_event)

    if execution is None and execution_factory is not None:
        try:
            execution = execution_factory(
                session_records, objects, approval_records, notifier, connector_instance,
                credentials, secrets_store,
            )
        except BaseException:
            owner.release()
            raise
    if execution is not None and hasattr(execution, "bind_queue"):
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
    from agent_box.server.execution.sidecar import (
        SidecarHarnessPort, WslSidecarLauncher, sidecar_bundle_files,
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
        if state_target is not None:
            deployment["_state_bundle_prefix"] = (
                f"agentbox-sidecar/deployment/{harness_id}/native-state"
            )
            deployment["_state_target"] = state_target
        else:
            deployment["_state_bundle_prefix"] = None
            deployment["_state_target"] = None
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
    bundle = sidecar_bundle_files(root, additional_files=additional_bundle)

    # Credential sources are *declared* here and read from their own files: the
    # deployment document stays a non-secret artifact, and this is the only
    # place the product server can learn about a credential the operator (or the
    # Desktop that owns the machine's credential records) has placed. The strict
    # key set below is what enforces "no secret in the document" - a `value` or
    # `secret` key is a typed refusal, not an ignored extra.
    declared_credentials = _deployment_credentials(value)

    def factory(records, objects, approvals, notifier, connector, credentials, secret_store):
        if connector is None:
            raise RuntimeError("WSL_CONNECTOR_UNAVAILABLE")

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
            resume_native_id, restored_state = _restore_sidecar_state(
                objects, context,
                enabled=deployment["_state_bundle_prefix"] is not None,
            )
            launcher = WslSidecarLauncher(
                connector,
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
                state_bundle_prefix=deployment["_state_bundle_prefix"],
                state_target=deployment["_state_target"],
                state_ephemeral_paths=deployment["_state_ephemeral_paths"],
                protected_state_paths=deployment["_protected_state_paths"],
                restored_state=restored_state,
                timeout_ms=deployment["_timeout_ms"],
            )
            return SidecarHarnessPort(
                launcher, environment={"AGENTBOX_SIDECAR_ISOLATED": "1"},
                profile=context["harness_type"], adapter=deployment["adapter"],
                model=execution.get("model"),
                credential_environment=(
                    descriptor.credential_environment if credential is not None else None
                ),
                preferred_auth_method=deployment.get("preferredAuthMethod"),
                resume_native_id=resume_native_id,
                state_directory="/tmp/agentbox-sidecar-state", directory="/workspace",
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
    from agent_box_sandbox_bwrap import HomeProjectionRejected, home_projection_target

    try:
        return home_projection_target(target, kind=kind)
    except HomeProjectionRejected:
        raise RuntimeError("SIDECAR_DEPLOYMENT_INVALID") from None


def _protected_state_paths(
    projection_targets: tuple[str, ...], state_target: str | None,
) -> tuple[str, ...]:
    """Derive the read-only paths inside the writable state subtree."""
    from agent_box_sandbox_bwrap import HomeProjectionRejected, protected_state_paths

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
    from agent_box_sandbox_bwrap import (
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


def _restore_sidecar_state(
    objects: ObjectStore, context: Mapping[str, Any], *, enabled: bool,
) -> tuple[str | None, dict[str, bytes]]:
    """Load one bounded opaque native checkpoint from Windows authority."""
    checkpoint_digest = context.get("checkpoint_object_digest")
    native_id = context.get("checkpoint_native_id")
    if not enabled or not checkpoint_digest or not native_id:
        return None, {}
    try:
        manifest = json.loads(objects.read(checkpoint_digest))
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        raise RuntimeError("SIDECAR_CHECKPOINT_INVALID") from None
    files = manifest.get("files") if isinstance(manifest, dict) else None
    if isinstance(manifest, dict) and manifest.get("harnessType") != context.get("harness_type"):
        return None, {}
    if (manifest.get("schema_version") != 2 or manifest.get("resumable") is not True
            or manifest.get("nativeSessionId") != native_id or not isinstance(files, list)
            or not files):
        raise RuntimeError("SIDECAR_CHECKPOINT_INVALID")
    restored: dict[str, bytes] = {}
    total = 0
    for item in files:
        if not isinstance(item, dict) or set(item) != {"path", "digest", "size"}:
            raise RuntimeError("SIDECAR_CHECKPOINT_INVALID")
        relative = item.get("path")
        digest_value = item.get("digest")
        size = item.get("size")
        if (not isinstance(relative, str) or relative.startswith("/") or "\\" in relative
                or "\x00" in relative or "//" in relative
                or any(part in {"", ".", ".."} for part in relative.split("/"))
                or str(PurePosixPath(relative)) != relative
                or relative in restored or not isinstance(digest_value, str)
                or re.fullmatch(r"sha256:[0-9a-f]{64}", digest_value) is None
                or not isinstance(size, int) or size < 0 or size > 8 * 1024 * 1024):
            raise RuntimeError("SIDECAR_CHECKPOINT_INVALID")
        try:
            content = objects.read(digest_value)
        except (OSError, ValueError):
            raise RuntimeError("SIDECAR_CHECKPOINT_INVALID") from None
        if len(content) != size:
            raise RuntimeError("SIDECAR_CHECKPOINT_INVALID")
        total += size
        if len(restored) >= 256 or total > 8 * 1024 * 1024:
            raise RuntimeError("SIDECAR_CHECKPOINT_INVALID")
        restored[relative] = content
    return str(native_id), restored
