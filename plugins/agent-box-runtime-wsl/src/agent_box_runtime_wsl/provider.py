"""Small, unregistered WSL runtime primitive contract.

This deliberately describes identity and safe path values only.  It does not
start ``wsl.exe``, own business state, inspect a remote home, or materialize
credentials.  Integration with the Host Authority is a later C2.2 slice.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import re
from typing import Protocol

from agent_box.protocols.runtime import HostTransportOperation, RuntimeBundle, RuntimeHostRef, RuntimeHostV1
from agent_box.protocols.runtime.protocol import CapabilitySet, CapabilityStatus, CompositionErrorCode, CompositionRejected
from agent_box.work_core.models import Ref, RefType
from agent_box.work_core.registry import ProviderDescriptor


_IDENTITY_TOKEN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
_ARCH_TOKEN = re.compile(r"^[A-Za-z0-9._-]{1,32}$")


class WslPathError(ValueError):
    """A workspace path is not a canonical, absolute WSL path."""


def _identity_token(name: str, value: str) -> str:
    if not isinstance(value, str) or not _IDENTITY_TOKEN.fullmatch(value):
        raise ValueError(f"{name} is not a safe identity token")
    return value


@dataclass(frozen=True)
class WslRuntimeIdentity:
    """Frozen facts needed to address one WSL runtime, not a user authority."""

    distribution: str
    user: str
    arch: str

    def __post_init__(self) -> None:
        _identity_token("distribution", self.distribution)
        _identity_token("user", self.user)
        if not isinstance(self.arch, str) or not _ARCH_TOKEN.fullmatch(self.arch):
            raise ValueError("arch is not a safe identity token")


@dataclass(frozen=True)
class WslWorkspacePath:
    """An exact project path in the WSL filesystem namespace."""

    value: str

    def __post_init__(self) -> None:
        value = self.value
        if not isinstance(value, str) or not value.startswith("/"):
            raise WslPathError("workspace path must be absolute")
        if "\x00" in value or any(ord(char) < 0x20 for char in value):
            raise WslPathError("workspace path contains a control character")
        if value == "/" or value.endswith("/"):
            raise WslPathError("workspace path must be normalized")
        segments = value.split("/")
        if any(segment in {".", ".."} for segment in segments):
            raise WslPathError("workspace path contains traversal segments")


@dataclass(frozen=True)
class WslRuntime:
    provider_id: str
    identity: WslRuntimeIdentity
    capabilities: frozenset[str]
    workspace_root: WslWorkspacePath | None = None


@dataclass(frozen=True)
class WslConnectionReceipt:
    """Non-secret, host-verified C1 facts bound to one RuntimeHost ref."""

    connection_id: str
    revision: int
    fingerprint: str
    distribution: str
    user: str
    os: str
    arch: str
    project_root: str
    capabilities: frozenset[str]

    def __post_init__(self) -> None:
        _identity_token("connection_id", self.connection_id)
        if not isinstance(self.revision, int) or self.revision <= 0:
            raise ValueError("revision must be positive")
        if not isinstance(self.fingerprint, str) or not re.fullmatch(
            r"sha256:[0-9a-f]{64}", self.fingerprint
        ):
            raise ValueError("fingerprint must be a sha256 digest")
        WslRuntimeIdentity(self.distribution, self.user, self.arch)
        _identity_token("os", self.os)
        WslWorkspacePath(self.project_root)
        if not isinstance(self.capabilities, frozenset) or any(
            not _IDENTITY_TOKEN.fullmatch(value) for value in self.capabilities
        ):
            raise ValueError("capabilities must be safe identity tokens")


class WslConnectionAuthority(Protocol):
    """Host-owned port for retrieving one exact verified C1 receipt."""

    def resolve_wsl_receipt(
        self, connection_id: str, revision: int
    ) -> "WslConnectionReceipt": ...

    def transport_for_wsl(self, connection_id: str, revision: int) -> object | None: ...

    def resolve_runtime_ref(
        self, ref: RuntimeHostRef, project_identity: str
    ) -> "WslConnectionReceipt": ...


def _identity_digest(identity: WslRuntimeIdentity) -> str:
    payload = {
        "arch": identity.arch,
        "distribution": identity.distribution,
        "user": identity.user,
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def _receipt_digest(receipt: WslConnectionReceipt) -> str:
    payload = {
        "arch": receipt.arch,
        "capabilities": sorted(receipt.capabilities),
        "connection_id": receipt.connection_id,
        "distribution": receipt.distribution,
        "fingerprint": receipt.fingerprint,
        "os": receipt.os,
        "project_root": receipt.project_root,
        "revision": receipt.revision,
        "user": receipt.user,
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


class WslHostTransport:
    """Receipt-bound typed carrier for the Tauri HostBridge.

    The bridge is deliberately injected by the host authority.  This object
    never accepts a command string, path, argv or environment map and remains
    unavailable when no host-owned bridge is supplied.
    """

    transport_kind = "wsl-host-bridge@1"

    def __init__(self, bridge: object | None = None) -> None:
        self._bridge = bridge

    def submit(self, operation: HostTransportOperation) -> str:
        if not isinstance(operation, HostTransportOperation):
            raise TypeError("WSL transport requires a typed operation")
        if operation.transport_kind != self.transport_kind or not operation.sealed_payload:
            raise CompositionRejected(
                CompositionErrorCode.INVALID_BINDING,
                "WSL transport requires one opaque HostBridge operation",
            )
        if self._bridge is not None:
            submit = getattr(self._bridge, "submit", None)
            if callable(submit):
                result = submit(operation)
                if not isinstance(result, str) or not result:
                    raise CompositionRejected(
                        CompositionErrorCode.CAPABILITY_UNAVAILABLE,
                        "HostBridge returned an invalid operation reference",
                    )
                return result
        raise CompositionRejected(
            CompositionErrorCode.CAPABILITY_UNAVAILABLE,
            "WSL HostBridge transport is not connected",
        )


class WslRuntimeHost:
    def __init__(
        self,
        provider: "WslRuntimeProvider",
        identity: WslRuntimeIdentity,
        receipt: WslConnectionReceipt | None = None,
        ref: RuntimeHostRef | None = None,
        bridge: object | None = None,
    ) -> None:
        self.provider = provider
        self.identity = identity
        self.receipt = receipt
        self.ref = ref or provider.ref_for(identity)
        self.capabilities = provider.capabilities_for(identity)
        self.transport = WslHostTransport(bridge)

    def resolve(self, ref: RuntimeHostRef) -> "WslRuntimeHost":
        return self.provider.resolve_ref(ref)

    def stage(self, bundle: RuntimeBundle) -> RuntimeBundle:
        if bundle.host_ref != self.ref:
            raise CompositionRejected(
                CompositionErrorCode.AFFINITY_MISMATCH,
                "RuntimeBundle host identity mismatch",
            )
        return bundle


class WslRuntimeProvider:
    """Runtime adapter requiring an injected Host Authority receipt."""

    provider_id = "runtime-host-wsl"
    supported_contract_ids = frozenset({RuntimeHostV1.contract_id})

    def __init__(self, host_operations: object | None = None) -> None:
        self.calls: list[str] = []
        self._verified_receipts: dict[str, WslConnectionReceipt] = {}
        self.host_operations = host_operations

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(
            self.provider_id,
            "Agent-Box WSL RuntimeHost",
            "0.1.0a1",
        )

    def ref_for(self, identity: WslRuntimeIdentity) -> RuntimeHostRef:
        if not isinstance(identity, WslRuntimeIdentity):
            raise TypeError("WSL runtime requires typed identity")
        identity_digest = _identity_digest(identity)
        return RuntimeHostRef(
            self.provider_id,
            identity_digest,
            identity_digest,
            f"wsl:{identity.distribution}:{identity.arch}:{identity.user}",
        )

    def capabilities_for(self, identity: WslRuntimeIdentity) -> CapabilitySet:
        if not isinstance(identity, WslRuntimeIdentity):
            raise TypeError("WSL runtime requires typed identity")
        return CapabilitySet(
            {
                "runtime.identity@1": CapabilityStatus.SUPPORTED,
                "workspace.path@1": CapabilityStatus.SUPPORTED,
                "wsl.distro@1": CapabilityStatus.SUPPORTED,
                "process.spawn.typed@1": CapabilityStatus.UNAVAILABLE,
            },
            assurance="typed-identity-only",
            affinity=f"wsl:{identity.distribution}:{identity.arch}:{identity.user}",
        )

    def resolve(
        self,
        contract_or_identity: str | WslRuntimeIdentity,
        ref: Ref | None = None,
        *,
        context: object | None = None,
    ) -> RuntimeHostV1:
        """Resolve an opaque Work Core Ref through the Host Authority.

        The one-argument identity form remains fail closed: distro/user/arch
        facts are not proof of a verified Connection.  Dispatch resolution
        accepts only the exact provider-private Ref issued by the WSL
        workspace registration.
        """
        del context
        if isinstance(contract_or_identity, WslRuntimeIdentity) and ref is None:
            raise CompositionRejected(
                CompositionErrorCode.CAPABILITY_UNAVAILABLE,
                "WSL runtime requires a host-verified C1 receipt",
            )
        if (
            contract_or_identity != RuntimeHostV1.contract_id
            or not isinstance(ref, Ref)
            or ref.type is not RefType.ARTIFACT
            or ref.provider != self.provider_id
            or ref.uri is not None
        ):
            raise ValueError("WSL RuntimeHost requires an exact opaque runtime-host Ref")
        metadata = dict(ref.metadata)
        if set(metadata) != {
            "runtime_native_id",
            "identity_digest",
            "affinity",
            "schema_version",
            "connection_id",
            "connection_revision",
        }:
            raise CompositionRejected(
                CompositionErrorCode.AFFINITY_MISMATCH,
                "WSL RuntimeHost Ref metadata drift",
            )
        try:
            schema_version = int(metadata["schema_version"])
            connection_revision = int(metadata["connection_revision"])
            if connection_revision <= 0:
                raise ValueError("invalid Connection revision")
            runtime_ref = RuntimeHostRef(
                provider=self.provider_id,
                native_id=metadata["runtime_native_id"],
                identity_digest=metadata["identity_digest"],
                affinity=metadata["affinity"],
                schema_version=schema_version,
            )
        except (TypeError, ValueError) as error:
            raise CompositionRejected(
                CompositionErrorCode.AFFINITY_MISMATCH,
                "WSL RuntimeHost Ref is malformed",
            ) from error
        resolved = self.resolve_connection(
            metadata["connection_id"],
            connection_revision,
            ref.native_id,
        )
        if resolved.ref != runtime_ref:
            raise CompositionRejected(
                CompositionErrorCode.AFFINITY_MISMATCH,
                "Host Authority returned a different RuntimeHost identity",
            )
        return resolved

    def resolve_connection(
        self, connection_id: str, revision: int, project_identity: str
    ) -> RuntimeHostV1:
        """Resolve one exact connection through the injected host port.

        This is the production-facing entry point.  The host port owns the
        C1 verification and returns only non-secret facts; the runtime plugin
        does not accept a renderer-provided receipt or inspect a remote home.
        """
        resolver = getattr(self.host_operations, "resolve_connection", None)
        if not callable(resolver):
            raise CompositionRejected(
                CompositionErrorCode.CAPABILITY_UNAVAILABLE,
                "WSL runtime host operations are unavailable",
            )
        try:
            raw = resolver(connection_id, revision, project_identity)
            receipt = WslConnectionReceipt(
                connection_id=raw.connection_id,
                revision=raw.revision,
                fingerprint=raw.fingerprint,
                distribution=raw.distribution,
                user=raw.user,
                os=raw.os,
                arch=raw.arch,
                project_root=raw.project_root,
                capabilities=frozenset(raw.capabilities),
            )
        except CompositionRejected:
            raise
        except Exception as error:
            raise CompositionRejected(
                CompositionErrorCode.CAPABILITY_UNAVAILABLE,
                "host connection resolution failed",
            ) from error
        if receipt.connection_id != connection_id or receipt.revision != revision:
            raise CompositionRejected(
                CompositionErrorCode.AFFINITY_MISMATCH,
                "host connection receipt identity does not match request",
            )
        identity = WslRuntimeIdentity(receipt.distribution, receipt.user, receipt.arch)
        ref = RuntimeHostRef(
            self.provider_id,
            _receipt_digest(receipt),
            _receipt_digest(receipt),
            _receipt_digest(receipt),
        )
        self._verified_receipts[ref.identity_digest] = receipt
        bridge_factory = getattr(self.host_operations, "transport_for_wsl", None)
        bridge = (
            bridge_factory(receipt.connection_id, receipt.revision)
            if callable(bridge_factory)
            else None
        )
        return RuntimeHostV1(
            ref,
            WslRuntimeHost(
                self,
                identity,
                receipt,
                ref,
                bridge,
            ),
        )

    def resolve_receipt(self, receipt: WslConnectionReceipt) -> RuntimeHostV1:
        """Reject caller-created receipts; use ``resolve_verified_receipt``."""
        if not isinstance(receipt, WslConnectionReceipt):
            raise TypeError("WSL RuntimeHost requires a host authority receipt")
        raise CompositionRejected(
            CompositionErrorCode.CAPABILITY_UNAVAILABLE,
            "WSL receipt must be issued by the Host Authority",
        )

    def resolve_verified_receipt(
        self,
        authority: WslConnectionAuthority,
        *,
        connection_id: str,
        revision: int,
    ) -> RuntimeHostV1:
        receipt = authority.resolve_wsl_receipt(connection_id, revision)
        if not isinstance(receipt, WslConnectionReceipt):
            raise TypeError("Host Authority returned an invalid WSL receipt")
        if receipt.connection_id != connection_id or receipt.revision != revision:
            raise CompositionRejected(
                CompositionErrorCode.AFFINITY_MISMATCH,
                "Host Authority receipt identity does not match the request",
            )
        identity = WslRuntimeIdentity(receipt.distribution, receipt.user, receipt.arch)
        bridge_factory = getattr(authority, "transport_for_wsl", None)
        bridge = (
            bridge_factory(connection_id, revision)
            if callable(bridge_factory)
            else None
        )
        ref = RuntimeHostRef(
            self.provider_id,
            _receipt_digest(receipt),
            _receipt_digest(receipt),
            _receipt_digest(receipt),
        )
        self._verified_receipts[ref.identity_digest] = receipt
        return RuntimeHostV1(
            ref,
            WslRuntimeHost(self, identity, receipt, ref, bridge),
        )

    def resolve_ref(
        self, ref: RuntimeHostRef, *, project_identity: str | None = None
    ) -> WslRuntimeHost:
        if not isinstance(ref, RuntimeHostRef) or ref.provider != self.provider_id:
            raise ValueError("WSL RuntimeHost requires an exact RuntimeHostRef")
        receipt = self._verified_receipts.get(ref.identity_digest)
        if receipt is None and project_identity:
            resolver = getattr(self.host_operations, "resolve_runtime_ref", None)
            if not callable(resolver):
                raise CompositionRejected(
                    CompositionErrorCode.CAPABILITY_UNAVAILABLE,
                    "WSL RuntimeHost ref cannot be re-resolved without Host Authority",
                )
            try:
                raw = resolver(ref, project_identity)
                receipt = WslConnectionReceipt(
                    connection_id=raw.connection_id,
                    revision=raw.revision,
                    fingerprint=raw.fingerprint,
                    distribution=raw.distribution,
                    user=raw.user,
                    os=raw.os,
                    arch=raw.arch,
                    project_root=raw.project_root,
                    capabilities=frozenset(raw.capabilities),
                )
            except CompositionRejected:
                raise
            except Exception as error:
                raise CompositionRejected(
                    CompositionErrorCode.CAPABILITY_UNAVAILABLE,
                    "Host Authority could not re-resolve the WSL RuntimeHost ref",
                ) from error
            if _receipt_digest(receipt) != ref.identity_digest:
                raise CompositionRejected(
                    CompositionErrorCode.AFFINITY_MISMATCH,
                    "re-resolved WSL RuntimeHost receipt does not match the Ref",
                )
            self._verified_receipts[ref.identity_digest] = receipt
        if receipt is None or _receipt_digest(receipt) != ref.identity_digest:
            raise CompositionRejected(
                CompositionErrorCode.CAPABILITY_UNAVAILABLE,
                "WSL RuntimeHost ref is not backed by a verified receipt",
            )
        identity = WslRuntimeIdentity(receipt.distribution, receipt.user, receipt.arch)
        bridge_factory = getattr(self.host_operations, "transport_for_wsl", None)
        bridge = (
            bridge_factory(receipt.connection_id, receipt.revision)
            if callable(bridge_factory)
            else None
        )
        return WslRuntimeHost(self, identity, receipt, ref, bridge)

    def describe(self, identity: WslRuntimeIdentity) -> WslRuntime:
        if not isinstance(identity, WslRuntimeIdentity):
            raise TypeError("WSL runtime requires typed identity")
        return WslRuntime(
            provider_id=self.provider_id,
            identity=identity,
            capabilities=frozenset({"bounded-process", "byte-duplex", "workspace-path"}),
        )
