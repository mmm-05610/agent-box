"""Generic Agent Client Protocol (ACP) client engine.

The engine is a protocol runtime only: JSON-RPC framing, initialize/version
negotiation, session lifecycle, prompt flow, permission correlation, cancel
and bounded inbound diagnostics.  It contains no Harness identity, no
vendor-specific method switches and no canonical Observation vocabulary —
observations are produced by Session Drivers that consume the engine's
generic events.
"""
from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Mapping

from .errors import (
    CANCEL_FAILED,
    INBOUND_QUEUE_OVERFLOW,
    INTERNAL,
    MALFORMED_PROTOCOL_MESSAGE,
    PROTOCOL_INITIALIZE_FAILED,
    PROTOCOL_METHOD_NOT_FOUND,
    PROTOCOL_VERSION_INCOMPATIBLE,
    SESSION_START_AMBIGUOUS,
    SESSION_START_REJECTED,
    TRANSPORT_CLOSED,
    AcpEngineError,
    CancelFailed,
    InitializeFailed,
    MalformedProtocolMessage,
    ProtocolVersionIncompatible,
    SessionStartAmbiguous,
    SessionStartRejected,
    TransportClosed,
)
from .framing import DEFAULT_MAX_FRAME_BYTES, decode_line, encode_message
from .message import RpcFailure, RpcMessage, classify
from .transport import DuplexByteTransport

PROTOCOL_VERSION = 1  # wire literal; may be echoed as 1 or "1"
DEFAULT_REQUEST_TIMEOUT_S = 15.0
DEFAULT_PERMISSION_TIMEOUT_S = 120.0
DEFAULT_INBOUND_CAPACITY = 256
MAX_DIAGNOSTICS = 64
MAX_BOUND_DEPTH = 8
MAX_BOUND_ITEMS = 128
MAX_BOUND_STRING = 4096
# ACP session/update variants understood as first-class kinds (protocol
# vocabulary only; unknown variants degrade to generic updates).
_KNOWN_UPDATE_KINDS = frozenset({
    "agent_message_chunk", "agent_thought_chunk", "tool_call", "tool_call_update",
    "plan", "available_commands_update", "current_mode_update",
    "user_message_chunk", "session_info_update", "stop_reason",
})


def bounded(value: Any, *, depth: int = 0) -> Any:
    """Recursively bound an untrusted protocol value (fail closed on shape)."""
    if depth > MAX_BOUND_DEPTH:
        return "<clipped>"
    if isinstance(value, Mapping):
        out: dict[str, Any] = {}
        for key in list(value)[:MAX_BOUND_ITEMS]:
            out[str(key)[:96]] = bounded(value[key], depth=depth + 1)
        return out
    if isinstance(value, (list, tuple)):
        return [bounded(item, depth=depth + 1) for item in list(value)[:MAX_BOUND_ITEMS]]
    if isinstance(value, str):
        return value[:MAX_BOUND_STRING]
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return str(value)[:MAX_BOUND_STRING]


@dataclass(frozen=True)
class PermissionOption:
    option_id: str
    name: str = ""
    kind: str = "allow_once"

    def __post_init__(self) -> None:
        if not isinstance(self.option_id, str) or not self.option_id or len(self.option_id) > 256:
            raise ValueError("invalid permission option id")


@dataclass(frozen=True)
class PermissionRequest:
    request_id: str
    session_id: str
    options: tuple[PermissionOption, ...] = ()
    tool_call: Mapping[str, Any] = field(default_factory=dict)
    deadline: float = 0.0
    received_at: float = 0.0

    def __post_init__(self) -> None:
        if not isinstance(self.request_id, str) or not self.request_id or len(self.request_id) > 256:
            raise ValueError("invalid permission request id")
        if not isinstance(self.session_id, str) or not self.session_id or len(self.session_id) > 512:
            raise ValueError("invalid permission session id")
        object.__setattr__(self, "options", tuple(self.options))
        object.__setattr__(self, "tool_call", dict(bounded(self.tool_call)))

    def expired(self, now: float | None = None) -> bool:
        return (now if now is not None else time.monotonic()) > self.deadline


@dataclass(frozen=True)
class UpdateEvent:
    session_id: str
    kind: str
    payload: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class DiagnosticEvent:
    code: str
    detail: str = ""


@dataclass(frozen=True)
class PeerRequestEvent:
    method: str
    params: Mapping[str, Any] = field(default_factory=dict)


InboundEvent = UpdateEvent | DiagnosticEvent | PeerRequestEvent


@dataclass(frozen=True)
class AgentCapabilities:
    load_session: bool
    session_capabilities: frozenset[str]
    prompt_capabilities: frozenset[str]
    mcp_capabilities: frozenset[str]
    auth_methods: tuple[str, ...]
    raw: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class AgentInfo:
    protocol_version: str
    implementation: Mapping[str, str]
    capabilities: AgentCapabilities


class AcpClientEngine:
    """One stdio ACP client; protocol-generic by construction."""

    def __init__(
        self,
        transport: DuplexByteTransport,
        *,
        protocol_version: object = PROTOCOL_VERSION,
        request_timeout_s: float = DEFAULT_REQUEST_TIMEOUT_S,
        permission_timeout_s: float = DEFAULT_PERMISSION_TIMEOUT_S,
        inbound_capacity: int = DEFAULT_INBOUND_CAPACITY,
        max_frame_bytes: int = DEFAULT_MAX_FRAME_BYTES,
        client_capabilities: Mapping[str, Any] | None = None,
    ) -> None:
        self._transport = transport
        self._protocol_version = protocol_version
        self._protocol_version_str = str(protocol_version)
        self._request_timeout = max(1.0, float(request_timeout_s))
        self._permission_timeout = max(1.0, float(permission_timeout_s))
        self._inbound_capacity = max(16, int(inbound_capacity))
        self._max_frame_bytes = max(1024, int(max_frame_bytes))
        self._client_capabilities = dict(bounded(client_capabilities or {}))
        self._events: deque[InboundEvent] = deque()
        self._diagnostics: deque[DiagnosticEvent] = deque(maxlen=MAX_DIAGNOSTICS)
        self._pending: dict[object, tuple[threading.Event, list[Any]]] = {}
        self._permissions: deque[PermissionRequest] = deque()
        self._responded: dict[str, bool] = {}
        self._active_turns: set[str] = set()
        self._counter = 0
        self._closed = False
        self._cond = threading.Condition()
        self._pump = threading.Thread(target=self._run, name="acp-engine", daemon=True)
        self._pump.start()

    # ------------------------------------------------------------------ #
    # diagnostics / state
    # ------------------------------------------------------------------ #
    def _diagnose(self, code: str, detail: str = "") -> None:
        event = DiagnosticEvent(code, detail[:512])
        self._diagnostics.append(event)
        with self._cond:
            self._events.append(event)
            self._cond.notify_all()

    def diagnostics(self) -> tuple[DiagnosticEvent, ...]:
        return tuple(self._diagnostics)

    def closed(self) -> bool:
        with self._cond:
            return self._closed

    # ------------------------------------------------------------------ #
    # pump
    # ------------------------------------------------------------------ #
    def _run(self) -> None:
        try:
            while True:
                line = self._transport.read_line(self._max_frame_bytes)
                if line is None:
                    with self._cond:
                        self._closed = True
                        self._cond.notify_all()
                    break
                try:
                    raw = decode_line(line, max_bytes=self._max_frame_bytes)
                    self._dispatch(classify(raw))
                except AcpEngineError as exc:
                    self._diagnose(exc.code, exc.detail or "malformed frame")
                except ValueError as exc:
                    self._diagnose(MALFORMED_PROTOCOL_MESSAGE, str(exc)[:512])
        except Exception as exc:  # pump must never die silently
            self._diagnose(INTERNAL, type(exc).__name__ + ":" + str(exc)[:256])
            with self._cond:
                self._closed = True
                self._cond.notify_all()

    def _dispatch(self, rpc: RpcMessage) -> None:
        if rpc.notification is not None:
            method = rpc.notification.method
            params = bounded(rpc.notification.params)
            if method == "session/update":
                self._push_event(self._parse_update(params))
            elif method == "session/request_permission":
                try:
                    request = self._parse_permission(params)
                    with self._cond:
                        self._permissions.append(request)
                    self._push_event(request)
                except ValueError as exc:
                    self._diagnose(MALFORMED_PROTOCOL_MESSAGE, "permission request: " + str(exc)[:256])
            else:
                self._diagnose("UNKNOWN_NOTIFICATION_METHOD", method[:128])
            return
        if rpc.request is not None:
            self._push_event(PeerRequestEvent(rpc.request.method, bounded(rpc.request.params)))
            return
        if rpc.success is not None or rpc.failure is not None:
            self._resolve_response(rpc)
            return
        self._diagnose(MALFORMED_PROTOCOL_MESSAGE, "unclassifiable rpc message")

    def _push_event(self, event: InboundEvent) -> None:
        with self._cond:
            if len(self._events) >= self._inbound_capacity:
                self._events.popleft()
                self._diagnose(INBOUND_QUEUE_OVERFLOW, "oldest inbound event dropped")
            self._events.append(event)
            self._cond.notify_all()

    def _parse_update(self, params: Mapping[str, Any]) -> UpdateEvent:
        session_id = str(params.get("sessionID", ""))[:512]
        update = params.get("update")
        if not isinstance(update, Mapping):
            raise ValueError("session/update missing update object")
        kind: str | None = None
        declared = update.get("kind")
        if isinstance(declared, str) and declared in _KNOWN_UPDATE_KINDS:
            kind = declared
        if kind is None:
            keys = [key for key in update if isinstance(key, str) and key != "kind"]
            if len(keys) == 1 and keys[0] in _KNOWN_UPDATE_KINDS:
                kind = keys[0]
        if kind is None:
            kind = "generic"
        return UpdateEvent(session_id, kind, bounded(update))

    def _parse_permission(self, params: Mapping[str, Any]) -> PermissionRequest:
        request_id = str(params.get("requestID", ""))
        session_id = str(params.get("sessionID", ""))
        if not request_id or not session_id:
            raise ValueError("permission request missing ids")
        options = []
        for item in params.get("options", ()):
            if not isinstance(item, Mapping):
                continue
            option_id = str(item.get("optionId", ""))
            if not option_id:
                continue
            options.append(PermissionOption(
                option_id,
                str(item.get("name", ""))[:256],
                str(item.get("kind", "allow_once"))[:64],
            ))
        tool_call = params.get("toolCall")
        return PermissionRequest(
            request_id, session_id, tuple(options),
            bounded(tool_call) if isinstance(tool_call, Mapping) else {},
            deadline=time.monotonic() + self._permission_timeout,
            received_at=time.monotonic(),
        )

    def _resolve_response(self, rpc: RpcMessage) -> None:
        key = rpc.success.id if rpc.success is not None else rpc.failure.id
        with self._cond:
            entry = self._pending.pop(key, None)
        if entry is None:
            self._diagnose("STRAY_RESPONSE", str(key)[:128])
            return
        event, holder = entry
        if rpc.failure is not None:
            holder.append(("error", rpc.failure.code, rpc.failure.message))
            self._diagnose("PROTOCOL_ERROR_RESPONSE", rpc.failure.message[:256])
        else:
            holder.append(("result", bounded(rpc.success.result)))
        event.set()

    # ------------------------------------------------------------------ #
    # request plumbing
    # ------------------------------------------------------------------ #
    def _next_id(self) -> str:
        self._counter += 1
        return "req-%d" % self._counter

    def _request(self, method: str, params: Mapping[str, Any], *, timeout: float, error_code: str) -> Any:
        if self.closed() or self._transport.closed():
            raise TransportClosed(TRANSPORT_CLOSED, method)
        request_id = self._next_id()
        event = threading.Event()
        holder: list[Any] = []
        with self._cond:
            if self._closed:
                raise TransportClosed(TRANSPORT_CLOSED, method)
            self._pending[request_id] = (event, holder)
        try:
            payload = encode_message({"jsonrpc": "2.0", "id": request_id, "method": method, "params": dict(bounded(params))})
            self._transport.write(payload + b"\n")
        except Exception as exc:
            with self._cond:
                self._pending.pop(request_id, None)
            raise AcpEngineError(error_code, f"write failed: {type(exc).__name__}") from exc
        if not event.wait(timeout=timeout):
            with self._cond:
                self._pending.pop(request_id, None)
            raise AcpEngineError(error_code, f"request timed out after {timeout:.0f}s: {method}")
        kind, *rest = holder[0]
        if kind == "error":
            code, message = rest[0], rest[1]
            if code == -32601:
                raise AcpEngineError(PROTOCOL_METHOD_NOT_FOUND, f"agent does not implement {method}")
            raise AcpEngineError(error_code, f"agent error {code}: {message}")
        return rest[0] if rest else None

    def _notification(self, method: str, params: Mapping[str, Any]) -> None:
        if self.closed() or self._transport.closed():
            raise TransportClosed(TRANSPORT_CLOSED, method)
        payload = encode_message({"jsonrpc": "2.0", "method": method, "params": dict(bounded(params))})
        self._transport.write(payload + b"\n")

    # ------------------------------------------------------------------ #
    # protocol lifecycle
    # ------------------------------------------------------------------ #
    def initialize(self, *, timeout: float | None = None) -> AgentInfo:
        timeout = timeout or self._request_timeout
        try:
            result = self._request(
                "initialize",
                {"protocolVersion": self._protocol_version, "clientCapabilities": self._client_capabilities},
                timeout=timeout,
                error_code=PROTOCOL_INITIALIZE_FAILED,
            )
        except AcpEngineError as exc:
            if exc.code == PROTOCOL_INITIALIZE_FAILED and "timed out" in exc.detail:
                raise InitializeFailed(PROTOCOL_INITIALIZE_FAILED, "initialize timed out") from exc
            if exc.code == PROTOCOL_METHOD_NOT_FOUND:
                raise InitializeFailed(PROTOCOL_INITIALIZE_FAILED, "agent does not implement initialize") from exc
            raise
        if not isinstance(result, Mapping):
            raise InitializeFailed(PROTOCOL_INITIALIZE_FAILED, "initialize result is not an object")
        raw_negotiated = result.get("protocolVersion", None)
        # The wire literal is numeric, but agents may echo it as "1" or 1;
        # normalize before comparing so both spellings work.
        negotiated = str(raw_negotiated) if raw_negotiated is not None else ""
        if negotiated and negotiated != self._protocol_version_str:
            raise ProtocolVersionIncompatible(
                PROTOCOL_VERSION_INCOMPATIBLE,
                f"agent negotiated protocolVersion {negotiated!r}, engine requires {self._protocol_version_str!r}",
            )
        implementation = result.get("implementation")
        capabilities = result.get("agentCapabilities")
        return AgentInfo(
            protocol_version=negotiated or self._protocol_version_str,
            implementation=bounded(implementation) if isinstance(implementation, Mapping) else {},
            capabilities=parse_agent_capabilities(capabilities),
        )

    def new_session(self, *, cwd: str | None = None, mcp_servers: tuple[Mapping[str, Any], ...] = (),
                    timeout: float | None = None) -> str:
        return self._start_session("session/new", {"cwd": cwd, "mcpServers": [dict(bounded(s)) for s in mcp_servers]}, timeout)

    def load_session(self, session_id: str, *, timeout: float | None = None) -> str:
        return self._start_session("session/load", {"sessionID": session_id}, timeout)

    def resume_session(self, session_id: str, *, timeout: float | None = None) -> str:
        return self._start_session("session/resume", {"sessionID": session_id}, timeout)

    def _start_session(self, method: str, params: Mapping[str, Any], timeout: float | None) -> str:
        timeout = timeout or self._request_timeout
        try:
            result = self._request(method, params, timeout=timeout, error_code=SESSION_START_REJECTED)
        except AcpEngineError as exc:
            if exc.code == SESSION_START_REJECTED and "timed out" in exc.detail:
                raise SessionStartAmbiguous(
                    SESSION_START_AMBIGUOUS, f"{method} response lost (target may exist)"
                ) from exc
            if exc.code == SESSION_START_REJECTED:
                raise SessionStartRejected(SESSION_START_REJECTED, exc.detail) from exc
            raise
        if not isinstance(result, Mapping) or not isinstance(result.get("sessionID"), str) or not result["sessionID"]:
            raise SessionStartRejected(SESSION_START_REJECTED, f"{method} missing sessionID")
        return result["sessionID"][:512]

    def prompt(self, session_id: str, content: str, *, message_id: str | None = None) -> bool:
        if self.closed():
            raise TransportClosed(TRANSPORT_CLOSED, "session/prompt")
        if session_id in self._active_turns:
            self._diagnose("TURN_IN_FLIGHT_REJECTED", "prompt refused while a turn is in flight")
            return False
        if not content or len(content) > 262144:
            raise ValueError("prompt content is out of bounds")
        params: dict[str, Any] = {"sessionID": session_id, "content": content}
        if message_id:
            params["messageID"] = message_id
        self._notification("session/prompt", params)
        self._active_turns.add(session_id)
        return True

    def busy(self, session_id: str) -> bool:
        return session_id in self._active_turns

    def end_turn(self, session_id: str) -> None:
        self._active_turns.discard(session_id)

    def cancel(self, session_id: str) -> None:
        try:
            self._notification("session/cancel", {"sessionID": session_id})
        except TransportClosed as exc:
            raise CancelFailed(CANCEL_FAILED, str(exc)) from exc
        self._active_turns.discard(session_id)

    # ------------------------------------------------------------------ #
    # permission correlation (FIFO by protocol arrival)
    # ------------------------------------------------------------------ #
    def pending_permission(self) -> PermissionRequest | None:
        with self._cond:
            return self._permissions[0] if self._permissions else None

    def permission_fifo(self) -> tuple[PermissionRequest, ...]:
        with self._cond:
            return tuple(self._permissions)

    def _pop_permission(self, request_id: str) -> PermissionRequest | None:
        with self._cond:
            for index, item in enumerate(self._permissions):
                if item.request_id == request_id:
                    del self._permissions[index]
                    return item
        return None

    def respond_permission(self, request_id: str, parameter: Mapping[str, Any]) -> bool:
        """Answer the permission with a raw protocol response mapping.

        Only the FIFO head may be answered; out-of-order answers are refused
        (fail closed) and surfaced as a diagnostic.
        """
        head = self.pending_permission()
        if head is None or head.request_id != request_id:
            self._diagnose("PERMISSION_ANSWER_OUT_OF_ORDER" if head is not None else "PERMISSION_UNKNOWN_ID", request_id[:128])
            return False
        self._pop_permission(request_id)
        with self._cond:
            self._responded[request_id] = True
        self._notification("session/respond_permission", {
            "sessionID": head.session_id,
            "requestID": request_id,
            "response": dict(bounded(parameter)),
        })
        return True

    def select_permission(self, request_id: str, option_id: str) -> bool:
        return self.respond_permission(request_id, {"type": "selected", "selectedOptionID": option_id})

    def cancel_permission(self, request_id: str) -> bool:
        return self.respond_permission(request_id, {"type": "cancelled"})

    def expired_permissions(self, now: float | None = None) -> tuple[PermissionRequest, ...]:
        now = now if now is not None else time.monotonic()
        return tuple(item for item in self.permission_fifo() if item.expired(now))

    # ------------------------------------------------------------------ #
    # event consumption
    # ------------------------------------------------------------------ #
    def poll(self, timeout: float = 0.0) -> InboundEvent | None:
        with self._cond:
            if not self._events:
                self._cond.wait(timeout=timeout)
            if not self._events:
                return None
            return self._events.popleft()

    def drain_events(self) -> tuple[InboundEvent, ...]:
        with self._cond:
            events = tuple(self._events)
            self._events.clear()
            return events

    # ------------------------------------------------------------------ #
    # close / cleanup
    # ------------------------------------------------------------------ #
    def close(self) -> None:
        with self._cond:
            if self._closed:
                return
            self._closed = True
            self._cond.notify_all()
        try:
            self._transport.close()
        except Exception as exc:
            raise CleanupFailed(CLEANUP_FAILED, type(exc).__name__) from exc
        self._pump.join(timeout=3.0)


def _capability_keys(value: Any) -> frozenset[str]:
    """Accept both capability shapes used on the wire: a mapping of
    capability -> detail/settings, or a legacy list of names."""
    if isinstance(value, Mapping):
        return frozenset(str(key) for key in value)
    if isinstance(value, (list, tuple)):
        return frozenset(str(item) for item in value)
    return frozenset()


def parse_agent_capabilities(raw: Any) -> AgentCapabilities:
    if not isinstance(raw, Mapping):
        return AgentCapabilities(False, frozenset(), frozenset(), frozenset(), (), {})
    return AgentCapabilities(
        bool(raw.get("loadSession", False)),
        _capability_keys(raw.get("sessionCapabilities")),
        _capability_keys(raw.get("promptCapabilities")),
        _capability_keys(raw.get("mcpCapabilities")),
        tuple(str(item) for item in raw.get("authMethods", ())) if isinstance(raw.get("authMethods"), (list, tuple)) else (),
        dict(bounded(raw)),
    )


__all__ = [
    "AgentCapabilities",
    "AgentInfo",
    "AcpClientEngine",
    "DEFAULT_INBOUND_CAPACITY",
    "DEFAULT_PERMISSION_TIMEOUT_S",
    "DEFAULT_REQUEST_TIMEOUT_S",
    "DiagnosticEvent",
    "InboundEvent",
    "MAX_BOUND_DEPTH",
    "MAX_BOUND_ITEMS",
    "MAX_BOUND_STRING",
    "MAX_DIAGNOSTICS",
    "PROTOCOL_VERSION",
    "PeerRequestEvent",
    "PermissionOption",
    "PermissionRequest",
    "UpdateEvent",
    "bounded",
    "parse_agent_capabilities",
]