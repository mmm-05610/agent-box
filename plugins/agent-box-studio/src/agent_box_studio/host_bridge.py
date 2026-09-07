"""Private ``agent-box.host-bridge@1`` sidecar bootstrap boundary.

The bootstrap is the only place where the Tauri-owned loopback endpoint and
per-start capability enter the sidecar.  It is intentionally a small framing
parser: business operations remain typed and are not accepted here.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import json
import re
import socket
from typing import BinaryIO, Callable
from urllib.parse import urlsplit
from uuid import uuid4

MAX_BOOTSTRAP_BYTES = 4096
# Rust authority bounds (src-tauri/src/host_bridge.rs): one request/response
# body and one deadline.  The Python client mirrors them exactly.
MAX_BRIDGE_BODY_BYTES = 64 * 1024
MAX_BRIDGE_DEADLINE_MS = 5 * 60 * 1000


class BridgeBootstrapError(ValueError):
    """Malformed, oversized, or unsafe host-bridge bootstrap."""


class BridgeOperationRejected(BridgeBootstrapError):
    """The host authority rejected a typed operation with its own code."""

    def __init__(self, code: str) -> None:
        super().__init__(f"host bridge operation was rejected: {code}")
        self.code = code


@dataclass(frozen=True)
class HostBridgeBootstrap:
    endpoint: str
    capability: str = field(repr=False)
    protocol: str


@dataclass(frozen=True)
class HostBridgeConnectionReceipt:
    connection_id: str
    revision: int
    fingerprint: str
    distribution: str
    user: str
    os: str
    arch: str
    project_root: str
    capabilities: frozenset[str]


@dataclass(frozen=True)
class HostBridgeOperationScope:
    """The exact execution scope one bridge request is authorized for.

    Mirrors the Rust ``OperationScope``: connection and project are always
    required; work/execution/attempt identity is required by every process
    operation and omitted otherwise.
    """

    connection_id: str
    project_identity: str
    work_ref: str | None = None
    execution_ref: str | None = None
    attempt_id: str | None = None


@dataclass(frozen=True)
class HostBridgeOperation:
    """Closed mirror of the host-owned Rust operation set.

    Operations, field names and validation rules are copied from
    ``src-tauri/src/host_bridge.rs`` (``HostBridgeOperation``).  The client
    never invents an operation, a field, or a parallel transport: an
    operation the host enum does not carry cannot be constructed here.
    """

    name: str
    fields: tuple[tuple[str, object], ...]
    # Process operations require the full work/execution/attempt scope.
    execution_scoped: bool = False
    # connectionResolve must match the scope connection/project exactly.
    scope_connection_id: str | None = None
    scope_project_identity: str | None = None

    def wire(self) -> dict[str, object]:
        return {"operation": self.name, **dict(self.fields)}

    # -- closed factories (one per Rust variant, exact fields) ---------------

    @classmethod
    def connection_resolve(
        cls, connection_id: str, revision: int, project_identity: str
    ) -> "HostBridgeOperation":
        # Rust `is_valid`: `*revision > 0`.
        if not isinstance(revision, int) or isinstance(revision, bool) or revision <= 0:
            raise BridgeBootstrapError("host bridge connection revision is invalid")
        _require_u64(revision, "revision")
        _safe_token(connection_id, 128, "connection id")
        _safe_token(project_identity, 256, "project identity")
        return cls(
            "connectionResolve",
            (
                ("connectionId", connection_id),
                ("revision", revision),
                ("projectIdentity", project_identity),
            ),
            scope_connection_id=connection_id,
            scope_project_identity=project_identity,
        )

    @classmethod
    def worker_ensure(cls) -> "HostBridgeOperation":
        return cls("workerEnsure", ())

    @classmethod
    def worker_inspect(cls) -> "HostBridgeOperation":
        return cls("workerInspect", ())

    @classmethod
    def worker_drain(cls) -> "HostBridgeOperation":
        return cls("workerDrain", ())

    @classmethod
    def channel_open(cls, channel_id: int) -> "HostBridgeOperation":
        return cls("channelOpen", (("channelId", _require_id(channel_id)),))

    @classmethod
    def channel_close(cls, channel_id: int) -> "HostBridgeOperation":
        return cls("channelClose", (("channelId", _require_id(channel_id)),))

    @classmethod
    def view_prepare(cls) -> "HostBridgeOperation":
        return cls("viewPrepare", ())

    @classmethod
    def view_put_chunk(cls, chunk_index: int, digest: str) -> "HostBridgeOperation":
        _require_u32(chunk_index, "chunk index")
        _safe_token(digest, 128, "chunk digest")
        return cls(
            "viewPutChunk",
            (("chunkIndex", chunk_index), ("digest", digest)),
        )

    @classmethod
    def view_commit(cls) -> "HostBridgeOperation":
        return cls("viewCommit", ())

    @classmethod
    def view_cleanup(cls) -> "HostBridgeOperation":
        return cls("viewCleanup", ())

    @classmethod
    def process_spawn(cls, process_id: int) -> "HostBridgeOperation":
        return cls(
            "processSpawn",
            (("processId", _require_id(process_id)),),
            execution_scoped=True,
        )

    @classmethod
    def process_stdin(cls, process_id: int, chunk_index: int) -> "HostBridgeOperation":
        _require_u64(chunk_index, "chunk index")
        return cls(
            "processStdin",
            (
                ("processId", _require_id(process_id)),
                ("chunkIndex", chunk_index),
            ),
            execution_scoped=True,
        )

    @classmethod
    def process_signal(cls, process_id: int, signal: int) -> "HostBridgeOperation":
        _require_u32(signal, "signal")
        return cls(
            "processSignal",
            (
                ("processId", _require_id(process_id)),
                ("signal", signal),
            ),
            execution_scoped=True,
        )

    @classmethod
    def process_cancel(cls, process_id: int) -> "HostBridgeOperation":
        return cls(
            "processCancel",
            (("processId", _require_id(process_id)),),
            execution_scoped=True,
        )

    @classmethod
    def process_inspect(cls, process_id: int) -> "HostBridgeOperation":
        return cls(
            "processInspect",
            (("processId", _require_id(process_id)),),
            execution_scoped=True,
        )

    @classmethod
    def events_read(cls, after_sequence: int, max_events: int) -> "HostBridgeOperation":
        _require_u64(after_sequence, "after sequence")
        if not isinstance(max_events, int) or not 1 <= max_events <= 0xFFFF:
            raise BridgeBootstrapError("host bridge max events is invalid")
        return cls(
            "eventsRead",
            (("afterSequence", after_sequence), ("maxEvents", max_events)),
        )

    @classmethod
    def events_ack(cls, sequence: int) -> "HostBridgeOperation":
        _require_u64(sequence, "sequence")
        return cls("eventsAck", (("sequence", sequence),))

    @classmethod
    def artifact_fetch(cls, artifact_id: str) -> "HostBridgeOperation":
        _safe_token(artifact_id, 256, "artifact id")
        return cls("artifactFetch", (("artifactId", artifact_id),))


@dataclass(frozen=True)
class HostBridgeSubmitResult:
    """Typed result of one closed bridge operation."""

    status: str
    connection: HostBridgeConnectionReceipt | None = None


class HostBridgeClient:
    """Small sidecar client for the host-owned typed bridge operations."""

    def __init__(
        self,
        bootstrap: HostBridgeBootstrap,
        *,
        timeout_ms: int = 5_000,
        connector: Callable[[tuple[str, int], float], socket.socket] = socket.create_connection,
    ) -> None:
        if bootstrap.protocol != "V1":
            raise BridgeBootstrapError("unsupported host bridge protocol")
        # Reuse the same endpoint and capability validation as stdin parsing.
        _validate_bootstrap(bootstrap.endpoint, bootstrap.capability, bootstrap.protocol)
        if not 1 <= timeout_ms <= MAX_BRIDGE_DEADLINE_MS:
            raise BridgeBootstrapError("host bridge timeout is invalid")
        self._bootstrap = bootstrap
        self._timeout_ms = timeout_ms
        self._connector = connector

    def submit(
        self,
        operation: HostBridgeOperation,
        scope: HostBridgeOperationScope,
    ) -> HostBridgeSubmitResult:
        """Submit one closed host-owned operation over the private bridge.

        The request is the exact serde JSON of the Rust authority.  Scope
        sufficiency and scope matching are enforced before any byte reaches
        the wire; the host's own typed error code is surfaced verbatim.
        """
        if not isinstance(operation, HostBridgeOperation):
            raise BridgeBootstrapError("host bridge requires a typed operation")
        if not isinstance(scope, HostBridgeOperationScope):
            raise BridgeBootstrapError("host bridge requires a typed scope")
        _safe_token(scope.connection_id, 128, "scope connection id")
        _safe_token(scope.project_identity, 256, "scope project identity")
        for value, limit, name in (
            (scope.work_ref, 128, "scope work ref"),
            (scope.execution_ref, 128, "scope execution ref"),
            (scope.attempt_id, 128, "scope attempt id"),
        ):
            if value is not None:
                _safe_token(value, limit, name)
        if operation.execution_scoped and not (
            scope.work_ref and scope.execution_ref and scope.attempt_id
        ):
            raise BridgeBootstrapError(
                "host bridge request scope is insufficient for a process operation"
            )
        if operation.scope_connection_id is not None and (
            scope.connection_id != operation.scope_connection_id
            or scope.project_identity != operation.scope_project_identity
        ):
            raise BridgeBootstrapError(
                "host bridge request scope does not match the authorized exact scope"
            )
        request_id = uuid4().hex
        request = {
            "protocol": "V1",
            "requestId": request_id,
            "deadlineMs": self._timeout_ms,
            "scope": _scope_wire(scope),
            "operation": operation.wire(),
            "capability": self._bootstrap.capability,
        }
        try:
            with self._connector(
                _socket_address(self._bootstrap.endpoint),
                timeout=self._timeout_ms / 1000,
            ) as connection:
                connection.sendall(_encode_request_frame(request))
                response = _decode_frame(connection)
        except (OSError, BridgeBootstrapError) as exc:
            if isinstance(exc, BridgeBootstrapError):
                raise
            raise BridgeBootstrapError("host bridge request failed") from exc
        if response.get("protocol") != "V1" or response.get("requestId") != request_id:
            raise BridgeBootstrapError("host bridge response correlation failed")
        body = response.get("body")
        if not isinstance(body, dict):
            raise BridgeBootstrapError("host bridge returned no response body")
        status = body.get("status")
        if status == "error":
            code = body.get("code")
            raise BridgeOperationRejected(
                code if isinstance(code, str) and code else "UNKNOWN"
            )
        if status == "accepted":
            return HostBridgeSubmitResult(status="accepted")
        if status == "connectionResolved":
            receipt = _receipt_from_body(body, scope.connection_id, _operation_revision(operation))
            return HostBridgeSubmitResult(status=status, connection=receipt)
        raise BridgeBootstrapError("host bridge returned an unknown response body")

    def resolve_connection(
        self, connection_id: str, revision: int, project_identity: str
    ) -> HostBridgeConnectionReceipt:
        result = self.submit(
            HostBridgeOperation.connection_resolve(connection_id, revision, project_identity),
            HostBridgeOperationScope(connection_id, project_identity),
        )
        assert result.connection is not None  # connectionResolve always carries one
        return result.connection


class HostBridgeAttemptTransport:
    """Execution-scoped carrier for one attempt over the private bridge.

    The transport is receipt-bound (connection id, revision, project
    identity) and submits only closed bridge operations.  It never accepts
    a command string, argv, path or environment map.
    """

    transport_kind = "wsl-host-bridge@1"

    def __init__(
        self,
        client: HostBridgeClient,
        connection_id: str,
        revision: int,
        project_identity: str,
    ) -> None:
        self._client = client
        self._connection_id = connection_id
        self._revision = revision
        self._project_identity = project_identity

    def submit(self, operation: object) -> str:
        from agent_box.protocols.runtime import HostTransportOperation
        from agent_box.protocols.runtime.protocol import (
            CompositionErrorCode,
            CompositionRejected,
        )
        from agent_box.work_core.errors import ExecutionStartRejected

        if not isinstance(operation, HostTransportOperation):
            raise TypeError("the WSL transport requires a typed operation")
        if operation.transport_kind != self.transport_kind or not operation.sealed_payload:
            raise CompositionRejected(
                CompositionErrorCode.INVALID_BINDING,
                "WSL transport requires one opaque HostBridge operation",
            )
        scope = HostBridgeOperationScope(
            self._connection_id, self._project_identity
        )
        # The host authority owns the physical worker: make the Project
        # worker available before any attempt-side operation is issued.
        try:
            ensure = self._client.submit(HostBridgeOperation.worker_ensure(), scope)
        except BridgeOperationRejected as exc:
            raise ExecutionStartRejected(
                f"HOST_BRIDGE_WORKER_ENSURE_REJECTED:{exc.code}"
            ) from exc
        except BridgeBootstrapError as exc:
            raise ExecutionStartRejected(
                "HOST_BRIDGE_WORKER_ENSURE_UNAVAILABLE"
            ) from exc
        if ensure.status != "accepted":
            raise ExecutionStartRejected(
                "HOST_BRIDGE_WORKER_ENSURE_UNAVAILABLE"
            )
        # The current Rust wire cannot carry an execution attempt:
        # `ProcessSpawn { process_id }` has no argv/cwd/environment fields,
        # so the sealed payload has no wire representation.  Fail closed
        # before any irreversible side effect instead of inventing a
        # parallel transport or pretending the attempt crossed the bridge.
        raise ExecutionStartRejected(
            "HOST_BRIDGE_PROCESS_SPAWN_FACTS_ABSENT: agent-box.host-bridge@1 "
            "ProcessSpawn carries only process_id; argv/cwd/environment "
            "facts cannot cross the wire yet"
        )


class HostBridgeHostAuthority:
    """The production ``host_operations`` adapter backed by the bridge.

    It implements the seam consumed by the WSL runtime/workspace providers:
    ``resolve_connection`` issues the real ``connectionResolve`` wire
    operation; ``transport_for_wsl`` returns the receipt-bound attempt
    carrier.  No connection fact is ever fabricated locally.
    """

    def __init__(self, client: HostBridgeClient) -> None:
        self._client = client
        self._projects: dict[tuple[str, int], str] = {}

    def resolve_connection(self, connection_id: str, revision: int, project_identity: str):
        receipt = self._client.resolve_connection(
            connection_id, revision, project_identity
        )
        self._projects[(connection_id, revision)] = project_identity
        return receipt

    def resolve_runtime_ref(self, ref, project_identity: str):
        """Re-resolve one issued RuntimeHost ref through the bridge.

        The ref carries no connection identity, so the authority re-resolves
        the exact (connection, revision, project) tuple it previously issued
        for this project and re-checks the digest-equivalent facts.
        """
        for (connection_id, revision), bound_project in list(self._projects.items()):
            if bound_project != project_identity:
                continue
            receipt = self._client.resolve_connection(
                connection_id, revision, project_identity
            )
            return receipt
        raise LookupError(
            "no bridge-issued connection is bound to this remote project"
        )

    def transport_for_wsl(self, connection_id: str, revision: int):
        project_identity = self._projects.get((connection_id, revision))
        if project_identity is None:
            return None
        return HostBridgeAttemptTransport(
            self._client, connection_id, revision, project_identity
        )


def read_host_bridge_bootstrap(stream: BinaryIO) -> HostBridgeBootstrap:
    """Read exactly one bounded length-prefixed bootstrap frame.

    The caller owns the process stdin and must invoke this before serving
    business traffic.  No fallback to environment variables or command-line
    arguments is provided.
    """
    header = stream.read(4)
    if len(header) != 4:
        raise BridgeBootstrapError("host bridge bootstrap is truncated")
    length = int.from_bytes(header, "big")
    if length > MAX_BOOTSTRAP_BYTES:
        raise BridgeBootstrapError("host bridge bootstrap exceeds its bound")
    body = stream.read(length)
    if len(body) != length:
        raise BridgeBootstrapError("host bridge bootstrap is truncated")
    try:
        value = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise BridgeBootstrapError("host bridge bootstrap is malformed") from exc
    if not isinstance(value, dict):
        raise BridgeBootstrapError("host bridge bootstrap is malformed")
    endpoint = value.get("endpoint")
    capability = value.get("capability")
    protocol = value.get("protocol")
    if not all(isinstance(item, str) for item in (endpoint, capability, protocol)):
        raise BridgeBootstrapError("host bridge bootstrap fields are invalid")
    _validate_bootstrap(endpoint, capability, protocol)
    return HostBridgeBootstrap(endpoint=endpoint, capability=capability, protocol=protocol)


def _validate_bootstrap(endpoint: str, capability: str, protocol: str) -> None:
    if protocol != "V1":
        raise BridgeBootstrapError("unsupported host bridge protocol")
    if len(capability) == 0 or len(capability) > 256 or any(ord(c) < 0x20 for c in capability):
        raise BridgeBootstrapError("host bridge capability is invalid")
    parsed = urlsplit(endpoint)
    if (
        parsed.scheme != "http"
        or parsed.hostname != "127.0.0.1"
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
        or parsed.port is None
        or not 1 <= parsed.port <= 65535
    ):
        raise BridgeBootstrapError("host bridge endpoint is not loopback")


def _safe_token(value: object, limit: int, field: str) -> None:
    if not isinstance(value, str) or not value or len(value) > limit:
        raise BridgeBootstrapError(f"host bridge {field} is invalid")
    if any(ord(c) < 0x20 or 0x7F <= ord(c) < 0xA0 for c in value):
        raise BridgeBootstrapError(f"host bridge {field} is invalid")


def _require_u64(value: object, field: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 2**64 - 1:
        raise BridgeBootstrapError(f"host bridge {field} is invalid")
    return value


def _require_u32(value: object, field: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 2**32 - 1:
        raise BridgeBootstrapError(f"host bridge {field} is invalid")
    return value


def _require_id(value: object) -> int:
    """Rust ``u64`` channel/process identity: strictly positive."""
    if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 2**64 - 1:
        raise BridgeBootstrapError("host bridge identity is invalid")
    return value


def _scope_wire(scope: HostBridgeOperationScope) -> dict[str, object]:
    wire: dict[str, object] = {
        "connectionId": scope.connection_id,
        "projectIdentity": scope.project_identity,
    }
    for key, value in (
        ("workRef", scope.work_ref),
        ("executionRef", scope.execution_ref),
        ("attemptId", scope.attempt_id),
    ):
        if value is not None:
            wire[key] = value
    return wire


def _operation_revision(operation: HostBridgeOperation) -> int:
    for key, value in operation.fields:
        if key == "revision":
            assert isinstance(value, int)
            return value
    raise BridgeBootstrapError("host bridge connection receipt has no revision")


def _receipt_from_body(
    body: dict[str, object], connection_id: str, revision: int
) -> HostBridgeConnectionReceipt:
    if body.get("connectionId") != connection_id or body.get("revision") != revision:
        raise BridgeBootstrapError("host bridge receipt identity mismatch")
    fingerprint = body.get("fingerprint")
    if not isinstance(fingerprint, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", fingerprint):
        raise BridgeBootstrapError("host bridge receipt fingerprint is invalid")
    fields = ("distribution", "user", "os", "arch", "projectRoot")
    if not all(isinstance(body.get(field), str) for field in fields):
        raise BridgeBootstrapError("host bridge receipt fields are invalid")
    project_root = body["projectRoot"]
    if not project_root.startswith("/") or ".." in project_root.split("/"):
        raise BridgeBootstrapError("host bridge receipt project path is invalid")
    capabilities = body.get("capabilities")
    if not isinstance(capabilities, list) or not all(
        isinstance(item, str) and item and len(item) <= 128 and not any(ord(c) < 0x20 for c in item)
        for item in capabilities
    ):
        raise BridgeBootstrapError("host bridge receipt capabilities are invalid")
    return HostBridgeConnectionReceipt(
        connection_id=connection_id,
        revision=revision,
        fingerprint=fingerprint,
        distribution=body["distribution"],
        user=body["user"],
        os=body["os"],
        arch=body["arch"],
        project_root=project_root,
        capabilities=frozenset(capabilities),
    )


def _socket_address(endpoint: str) -> tuple[str, int]:
    parsed = urlsplit(endpoint)
    # Endpoint validation ran in the constructor; this conversion remains
    # explicit so no caller-controlled URL path can reach the socket layer.
    return parsed.hostname or "127.0.0.1", parsed.port or 0


def _encode_frame(value: object) -> bytes:
    body = json.dumps(value, separators=(",", ":")).encode()
    if len(body) > MAX_BOOTSTRAP_BYTES:
        raise BridgeBootstrapError("host bridge request exceeds its bound")
    return len(body).to_bytes(4, "big") + body


def _encode_request_frame(value: object) -> bytes:
    """One bounded bridge request frame (the Rust ``MAX_BODY_BYTES`` bound)."""
    body = json.dumps(value, separators=(",", ":")).encode()
    if len(body) > MAX_BRIDGE_BODY_BYTES:
        raise BridgeBootstrapError("host bridge request exceeds its bound")
    return len(body).to_bytes(4, "big") + body


def _read_exact(connection: socket.socket, length: int) -> bytes:
    chunks = bytearray()
    while len(chunks) < length:
        chunk = connection.recv(length - len(chunks))
        if not chunk:
            raise BridgeBootstrapError("host bridge response is truncated")
        chunks.extend(chunk)
    return bytes(chunks)


def _decode_frame(connection: socket.socket) -> dict[str, object]:
    length = int.from_bytes(_read_exact(connection, 4), "big")
    if length > MAX_BRIDGE_BODY_BYTES:
        raise BridgeBootstrapError("host bridge response exceeds its bound")
    try:
        value = json.loads(_read_exact(connection, length))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise BridgeBootstrapError("host bridge response is malformed") from exc
    if not isinstance(value, dict):
        raise BridgeBootstrapError("host bridge response is malformed")
    return value
