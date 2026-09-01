"""P0 local RuntimeHost adapter.

This module deliberately exposes no business ``spawn(command)`` operation.
Native creation is reachable only through ``LocalHostTransport.submit`` with
the closed root-protocol operation and its single-use token.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import uuid
from typing import Callable, Mapping

from agent_box.extensions import HostTransportOperation, RuntimeBundle, RuntimeHostRef
from agent_box.extensions.runtime_composition.protocol import (
    CapabilitySet, CapabilityStatus, CompositionErrorCode, CompositionRejected,
    RuntimeHostV1, digest,
)
from agent_box.work_core import Ref, RefType, ProviderDescriptor

CONTRACT_ID = "agent-box.runtime-host@1"
PROVIDER_ID = "runtime-host-local"
SCHEMA_VERSION = "local-realm@1"
_REALMS = {"native-linux", "wsl"}


def _sha(value: object) -> str:
    return "sha256:" + hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _wsl_info() -> tuple[bool, str, str]:
    release = platform.release().lower()
    version = ""
    try:
        version = Path("/proc/version").read_text(errors="replace").lower()
    except OSError:
        pass
    is_wsl = "microsoft" in release or "microsoft" in version or "wsl" in release
    distro_name = os.environ.get("WSL_DISTRO_NAME", "")
    # WSL_INTEROP contains a per-session path and is intentionally excluded.
    # From inside a distro, the Windows-side GUID is not consistently exposed.
    # The distro name + machine-id is the stable identity available locally;
    # label it derived so consumers do not confuse it with a Windows GUID.
    distro_guid = os.environ.get("AGENT_BOX_WSL_DISTRO_GUID", "")
    if is_wsl and not distro_guid and distro_name:
        try:
            machine_id = Path("/etc/machine-id").read_text(errors="replace").strip()
        except OSError:
            machine_id = ""
        if machine_id:
            distro_guid = "derived:" + _sha({"distro": distro_name, "machine_id": machine_id})[7:]
    return is_wsl, distro_guid, distro_name


def _identity(realm: str) -> dict[str, str]:
    is_wsl, distro_guid, distro_name = _wsl_info()
    if realm not in _REALMS:
        raise ValueError("unsupported local realm")
    if realm == "wsl" and not is_wsl:
        raise CompositionRejected(CompositionErrorCode.CAPABILITY_UNAVAILABLE, "current environment is not WSL")
    if realm == "wsl" and not distro_guid:
        raise CompositionRejected(CompositionErrorCode.CAPABILITY_UNAVAILABLE, "WSL distro GUID is unavailable")
    system = platform.system().lower()
    if realm == "native-linux" and system != "linux":
        raise CompositionRejected(CompositionErrorCode.CAPABILITY_UNAVAILABLE, "native Linux is unavailable")
    return {
        "schema": SCHEMA_VERSION,
        "realm": realm,
        "os": "linux",
        "abi": platform.libc_ver()[0] or "unknown",
        "architecture": platform.machine().lower(),
        "kernel_release": platform.release(),
        "filesystem_realm": "wsl-distro" if realm == "wsl" else "linux-root",
        "distro_guid": distro_guid if realm == "wsl" else "",
        "distro_name": distro_name if realm == "wsl" else "",
    }


def _affinity(identity: Mapping[str, str]) -> str:
    return f"local:{identity['realm']}:{identity['os']}:{identity['architecture']}:{identity['filesystem_realm']}"


def _sdk_ref(identity: Mapping[str, str]) -> RuntimeHostRef:
    identity_digest = _sha(identity)
    return RuntimeHostRef(PROVIDER_ID, identity_digest, identity_digest, _affinity(identity))


@dataclass(frozen=True)
class LocalPathToken:
    token: str
    kind: str


class LocalHostTransport:
    """Bounded local transport for typed, already-authorized operations."""

    transport_kind = "local-exec@1"

    def __init__(self, *, executor: Callable[..., object] | None = None,
                 transport_operations=None) -> None:
        self._executor = executor or self._default_executor
        self._transport_operations = transport_operations
        self._paths: dict[str, Path] = {}
        self._envs: dict[str, dict[str, str]] = {}
        self._consumed: set[tuple[str, str]] = set()
        self.last_native: object | None = None

    @staticmethod
    def _default_executor(argv: list[str], *, cwd: str, env: dict[str, str]) -> object:
        return subprocess.Popen(argv, cwd=cwd, env=env, shell=False, close_fds=True,
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, text=True)

    def issue_cwd_token(self, path: str | Path) -> str:
        resolved = Path(path).resolve(strict=True)
        if not resolved.is_dir():
            raise ValueError("cwd token must point to a directory")
        token = "cwd:" + uuid.uuid4().hex
        self._paths[token] = resolved
        return token

    def issue_env_token(self, environment: Mapping[str, str]) -> str:
        values = dict(environment)
        if len(values) > 64 or any("\0" in k or "\0" in v for k, v in values.items()):
            raise ValueError("environment token is invalid")
        token = "env:" + uuid.uuid4().hex
        self._envs[token] = values
        return token

    def make_operation(self, *, attempt_key: str, spawn_token: str, spec_digest: str,
                       argv: tuple[str, ...], cwd_token: str, env_token: str) -> HostTransportOperation:
        if not argv or len(argv) > 64 or any(not isinstance(x, str) or not x or "\0" in x for x in argv):
            raise ValueError("argv must be bounded and NUL-free")
        payload = {"argv": list(argv), "cwd_token": cwd_token, "env_token": env_token}
        return HostTransportOperation(attempt_key, spawn_token, spec_digest, self.transport_kind, json.dumps(payload, sort_keys=True, separators=(",", ":")))

    def submit(self, operation: HostTransportOperation) -> str:
        if not isinstance(operation, HostTransportOperation):
            raise CompositionRejected(CompositionErrorCode.SPAWN_TOKEN_INVALID, "local transport requires a typed operation")
        if not operation.attempt_key or not operation.spawn_token.startswith("spawn:"):
            raise CompositionRejected(CompositionErrorCode.SPAWN_TOKEN_INVALID, "missing or malformed spawn token")
        key = (operation.attempt_key, operation.spawn_token)
        if key in self._consumed:
            raise CompositionRejected(CompositionErrorCode.SPAWN_TOKEN_INVALID, "single-use token replay")
        if operation.transport_kind == "local-stdio":
            try:
                payload = json.loads(operation.sealed_payload or "")
                argv = payload["argv"]
            except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
                raise CompositionRejected(CompositionErrorCode.SPAWN_TOKEN_INVALID, "invalid direct-stdio operation") from exc
            if not isinstance(argv, list) or not argv or len(argv) > 128 or any(not isinstance(x, str) or not x or "\0" in x for x in argv):
                raise CompositionRejected(CompositionErrorCode.SPAWN_TOKEN_INVALID, "unsafe direct-stdio argv")
            self._consumed.add(key)
            try:
                native = self._executor(argv, cwd="/", env={})
            except OSError as exc:
                raise CompositionRejected(CompositionErrorCode.CAPABILITY_UNAVAILABLE, str(exc)) from exc
            self.last_native = native
            return "local:" + digest({"attempt": operation.attempt_key, "native": repr(native)})[7:31]
        if operation.transport_kind != self.transport_kind:
            # Carrier operations resolve through the activated ExtensionCatalog
            # (injected at environment activation); there is no module-global
            # handler table and no import-order coupling.
            if self._transport_operations is None:
                raise CompositionRejected(
                    CompositionErrorCode.SPAWN_TOKEN_INVALID,
                    "no transport operation resolver is bound on this RuntimeHost transport",
                )
            try:
                contribution = self._transport_operations.resolve(operation.transport_kind)
            except KeyError as exc:
                raise CompositionRejected(
                    CompositionErrorCode.SPAWN_TOKEN_INVALID,
                    f"unregistered provider transport operation: {operation.transport_kind}",
                ) from exc
            handler = contribution.component.handler
            # Validation happens before the single-use token is consumed: a
            # malformed carrier operation is a clean rejection, not an
            # ambiguous native submission.
            handler.validate(operation)
            self._consumed.add(key)
            try:
                native = handler.execute(self, operation)
            except Exception:
                # The token is intentionally not restored: a response or
                # native-operation failure after submission is ambiguous.
                raise
            return "local:" + digest({"attempt": operation.attempt_key, "native": repr(native)})[7:31]
        try:
            payload = json.loads(operation.sealed_payload or "")
            argv = payload["argv"]
            cwd_token = payload["cwd_token"]
            env_token = payload["env_token"]
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise CompositionRejected(CompositionErrorCode.SPAWN_TOKEN_INVALID, "invalid sealed local operation") from exc
        if not isinstance(argv, list) or not argv or len(argv) > 64 or any(not isinstance(x, str) or not x or "\0" in x for x in argv):
            raise CompositionRejected(CompositionErrorCode.SPAWN_TOKEN_INVALID, "unsafe argv")
        cwd = self._paths.get(cwd_token)
        env = self._envs.get(env_token)
        if cwd is None or env is None:
            raise CompositionRejected(CompositionErrorCode.SPAWN_TOKEN_INVALID, "unknown or expired path token")
        self._consumed.add(key)
        try:
            native = self._executor(argv, cwd=str(cwd), env=dict(env))
        except OSError as exc:
            raise CompositionRejected(CompositionErrorCode.CAPABILITY_UNAVAILABLE, str(exc)) from exc
        self.last_native = native
        return "local:" + digest({"attempt": operation.attempt_key, "native": repr(native)})[7:31]


class LocalRuntimeHost:
    def __init__(self, provider: "LocalRuntimeHostProvider", identity: Mapping[str, str]) -> None:
        self.provider = provider
        self.identity = dict(identity)
        self.ref = _sdk_ref(identity)
        self.capabilities = provider.capabilities_for(identity)
        self.transport = LocalHostTransport(executor=provider.executor, transport_operations=provider.transport_operations)
        self.staging_tokens: tuple[str, ...] = ()
        self.path_tokens: tuple[LocalPathToken, ...] = ()

    def resolve(self, ref: RuntimeHostRef) -> "LocalRuntimeHost":
        return self.provider.resolve_runtime_ref(ref)

    def stage(self, bundle: RuntimeBundle) -> RuntimeBundle:
        if bundle.host_ref != self.ref:
            raise ValueError("RuntimeBundle host identity mismatch")
        return bundle


class LocalRuntimeHostProvider:
    provider_id = PROVIDER_ID
    supported_contract_ids = frozenset({CONTRACT_ID})

    def __init__(self, *, executor: Callable[..., object] | None = None) -> None:
        self.executor = executor
        # Injected at environment activation via CatalogBindable; never read
        # from a module-global table.
        self.transport_operations = None

    def bind_catalog(self, catalog) -> None:
        """CatalogBindable: receive the activated transport operation resolver."""
        from agent_box.extensions.catalog import TransportOperationResolver

        self.transport_operations = TransportOperationResolver.from_catalog(catalog)

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(PROVIDER_ID, "Local Linux/WSL RuntimeHost", "1")

    def make_ref(self, realm: str = "native-linux") -> Ref:
        identity = _identity(realm)
        digest_value = _sha(identity)
        return Ref(RefType.ARTIFACT, PROVIDER_ID, digest_value, metadata={**identity, "identity_digest": digest_value, "affinity": _affinity(identity)})

    def capabilities_for(self, identity: Mapping[str, str]) -> CapabilitySet:
        values = {name: CapabilityStatus.SUPPORTED for name in (
            "process.spawn.typed@1", "argv.safe@1", "cwd.token@1", "env.token@1",
            "staging.path-token@1", "identity.drift@1", "transport.local-exec@1",
        )}
        if identity["realm"] == "wsl":
            values["wsl.distro-affinity@1"] = CapabilityStatus.SUPPORTED
        return CapabilitySet(values, assurance="bounded-local-probe", affinity=_affinity(identity))

    def resolve(self, contract_id: str, ref: Ref, **kwargs: object) -> RuntimeHostV1:
        del kwargs
        if contract_id != CONTRACT_ID or ref.type is not RefType.ARTIFACT or ref.provider != PROVIDER_ID:
            raise ValueError("local RuntimeHost requires an exact runtime-host ArtifactRef")
        realm = ref.metadata.get("realm", "")
        identity = _identity(realm)
        expected = _sha(identity)
        if ref.native_id != expected or ref.metadata.get("identity_digest") != expected:
            raise CompositionRejected(CompositionErrorCode.AFFINITY_MISMATCH, "RuntimeHost identity drift")
        if dict(ref.metadata) != {**identity, "identity_digest": expected, "affinity": _affinity(identity)}:
            raise CompositionRejected(CompositionErrorCode.AFFINITY_MISMATCH, "RuntimeHost identity metadata drift")
        port = LocalRuntimeHost(self, identity)
        return RuntimeHostV1(port.ref, port)

    def resolve_runtime_ref(self, ref: RuntimeHostRef) -> LocalRuntimeHost:
        if ref.provider != PROVIDER_ID:
            raise ValueError("RuntimeHost provider mismatch")
        realms = [realm for realm in _REALMS if f"local:{realm}:" in ref.affinity]
        if len(realms) != 1:
            raise CompositionRejected(CompositionErrorCode.AFFINITY_MISMATCH, "RuntimeHostRef does not name one local realm")
        resolved = self.resolve(CONTRACT_ID, self.make_ref(realms[0]))
        sdk = resolved.port
        if sdk.ref != ref:
            raise CompositionRejected(CompositionErrorCode.AFFINITY_MISMATCH, "RuntimeHostRef drift")
        return sdk

    def availability(self, realm: str = "native-linux") -> dict[str, object]:
        try:
            identity = _identity(realm)
        except CompositionRejected as exc:
            return {"status": "unavailable", "code": exc.code.value, "realm": realm, "detail": str(exc)}
        except ValueError as exc:
            return {"status": "unavailable", "code": "unsupported_realm", "realm": realm, "detail": str(exc)}
        return {"status": "available", "code": "ok", "realm": realm, "identity_digest": _sha(identity), "affinity": _affinity(identity), "capabilities": {k: v.value for k, v in self.capabilities_for(identity).values.items()}}
