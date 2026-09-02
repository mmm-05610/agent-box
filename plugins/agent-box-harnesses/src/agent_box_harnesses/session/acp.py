"""Generic ACP session driver: engine + codec + hub + permission policy.

This driver is the Harness-side host of the protocol-generic ACP engine.
It binds to an already-spawned runtime target (the Runtime remains the
spawn authority), runs the initialize/new|load|resume chain with explicit
rung semantics (no silent fallback past an ambiguous response), pumps
generic engine events through the codec into the ObservationHub, and
enforces the permission policy (timeout -> record -> cancel -> diagnostic,
never an infinite wait).
"""
from __future__ import annotations

import time
from collections import deque
from typing import Any, Callable, Mapping

from ..adapters.observation import Observation, ObservationKind, TerminalCondition, bounded_native
from .codec import AcpSessionCodec, GenericAcpCodec
from .hub import HubPollResult, ObservationHub
from .permission import (
    FailClosedPermissionPolicy, PermissionDecisionKind, PermissionPolicy,
    PermissionRequestState,
)
from .spi import (
    DRIVER_UNAVAILABLE,
    PermissionOptionView,
    PermissionView,
    SessionCapability,
    SessionDriverBindOptions,
    SessionDriverBinding,
    SessionDriverDescriptor,
    SessionDriverError,
    from_acp_error,
)

DEFAULT_SESSION_START_TIMEOUT_S = 15.0
DEFAULT_PERMISSION_TIMEOUT_S = 120.0


def _carrier_of(handle: object) -> Any:
    """Resolve the byte carrier exposed by a runtime handle."""
    runtime = getattr(handle, "runtime", None)
    transport = getattr(runtime, "transport", None)
    if transport is not None:
        return transport
    fallback = getattr(handle, "transport", None)
    return fallback if fallback is not None else handle


class GenericAcpSessionDriver:
    """One generic ACP session bound to one runtime target."""

    protocol = "acp-v1"

    def __init__(
        self,
        harness_type: str,
        *,
        implementation_id: str,
        display_name: str,
        version: str,
        codec: AcpSessionCodec | None = None,
        engine_factory: Callable[..., Any] | None = None,
        policy: PermissionPolicy | None = None,
        acp_engine_available: Callable[[], bool] | None = None,
    ) -> None:
        self._harness_type = harness_type
        self._impl_id = implementation_id
        self._display_name = display_name
        self._version = version
        self._codec: AcpSessionCodec = codec or GenericAcpCodec()
        self._engine_factory = engine_factory or self._default_engine_factory
        self._policy = policy or FailClosedPermissionPolicy()
        self._engine_available = acp_engine_available or self._default_engine_available
        self._hub = ObservationHub()
        self._engine: Any = None
        self._transport: Any = None
        self._carrier: Any = None
        self._session_id: str | None = None
        self._binding: SessionDriverBinding | None = None
        self._permission_queue: deque[PermissionRequestState] = deque()
        self._last_seq = 0
        self._extra_diagnostics: list[str] = []

    # ------------------------------------------------------------------ #
    # identity / capability truth
    # ------------------------------------------------------------------ #
    def descriptor(self) -> SessionDriverDescriptor:
        return SessionDriverDescriptor(
            self._impl_id, self._display_name, self._version,
            self._harness_type, "acp", self.protocol,
        )

    def capabilities(self) -> Mapping[str, SessionCapability]:
        base = {
            "streaming": SessionCapability.SUPPORTED,
            "permission": SessionCapability.SUPPORTED,
            "cancel": SessionCapability.SUPPORTED,
            "session_continuation": SessionCapability.SUPPORTED,
            "terminal": SessionCapability.SUPPORTED,
            "filesystem_proxy": SessionCapability.UNSUPPORTED,
        }
        if not self._engine_available():
            return {key: SessionCapability.UNAVAILABLE for key in base}
        for override_key, state in self._codec.capability_overrides().items():
            base[override_key] = SessionCapability(state)
        return base

    # ------------------------------------------------------------------ #
    # binding
    # ------------------------------------------------------------------ #
    def bind(self, handle: object, *, options: SessionDriverBindOptions) -> SessionDriverBinding:
        if not self._engine_available():
            raise SessionDriverError(DRIVER_UNAVAILABLE, "agent-box-acp engine is not installed")
        if self._binding is not None and self._engine is not None:
            # Idempotent: one engine per session; a second bind never spawns
            # a competing pump on the same transport.
            return self._binding
        carrier = _carrier_of(handle)
        transport = self._bind_transport(carrier)
        if transport is None:
            raise SessionDriverError(DRIVER_UNAVAILABLE, "runtime target exposes no duplex byte transport")
        self._transport = transport
        self._carrier = carrier
        engine = self._engine_factory(
            transport,
            permission_timeout_s=options.permission_timeout_s,
        )
        self._engine = engine
        try:
            info = engine.initialize(timeout=options.session_start_timeout_s)
        except Exception as exc:
            raise from_acp_error(exc) from exc
        locator = options.continuation_locator
        if locator:
            try:
                engine.resume_session(locator, timeout=options.session_start_timeout_s)
            except Exception as exc:
                if _is_ambiguous(exc):
                    raise from_acp_error(exc) from exc
                try:
                    engine.load_session(locator, timeout=options.session_start_timeout_s)
                except Exception as exc2:
                    if _is_ambiguous(exc2):
                        raise from_acp_error(exc2) from exc2
                    try:
                        self._session_id = engine.new_session(timeout=options.session_start_timeout_s)
                    except Exception as exc3:
                        raise from_acp_error(exc3) from exc3
                else:
                    self._session_id = locator
        else:
            try:
                self._session_id = engine.new_session(timeout=options.session_start_timeout_s)
            except Exception as exc:
                raise from_acp_error(exc) from exc
        binding = SessionDriverBinding(
            session_locator=self._session_id,
            protocol_version=getattr(info, "protocol_version", "1"),
            diagnostics=tuple(self._codec.fidelity_notes()),
        )
        self._binding = binding
        if options.prompt:
            if not engine.prompt(self._session_id, options.prompt):
                self._extra_diagnostics.append("PROMPT_REFUSED_BUSY")
        return binding

    @staticmethod
    def _bind_transport(carrier: Any) -> Any:
        if carrier is None:
            return None
        if hasattr(carrier, "read_line") and hasattr(carrier, "write"):
            return carrier  # already a duplex transport (tests / synthetic)
        stdin = getattr(carrier, "stdin", None)
        stdout = getattr(carrier, "stdout", None)
        if stdin is None or stdout is None:
            return None
        from agent_box_acp.transport import PipeDuplexTransport

        return PipeDuplexTransport(stdin, stdout, getattr(carrier, "stderr", None))

    @staticmethod
    def _default_engine_factory(transport: Any, **kwargs: Mapping[str, Any]) -> Any:
        from agent_box_acp import AcpClientEngine

        return AcpClientEngine(transport, **kwargs)

    @staticmethod
    def _default_engine_available() -> bool:
        try:
            import agent_box_acp  # noqa: F401

            return True
        except Exception:
            return False

    # ------------------------------------------------------------------ #
    # incremental observation
    # ------------------------------------------------------------------ #
    def poll(self, timeout: float = 0.0) -> HubPollResult:
        if self._engine is None:
            raise SessionDriverError(DRIVER_UNAVAILABLE, "driver not bound")
        deadline = time.monotonic() + max(0.0, timeout)
        while True:
            self._handle_permission_timeouts()
            event = self._engine.poll(timeout=max(0.0, deadline - time.monotonic()) if deadline > time.monotonic() else 0.0)
            if event is None:
                break
            self._consume(event)
        result = self._hub.poll(self._last_seq)
        self._last_seq = result.latest_seq if not result.resync else result.latest_seq
        if result.snapshot is not None:
            self._last_seq = result.snapshot.seq
        if self._engine_transport_eof():
            self._finalize_process_exit()
        return result

    @property
    def hub(self) -> ObservationHub:
        return self._hub

    def _consume(self, event: Any) -> None:
        # Dispatch by protocol shape, never by vendored names.
        if hasattr(event, "request_id") and hasattr(event, "options"):
            self._admit_permission(event)
            return
        observations: tuple[Observation, ...] = ()
        if hasattr(event, "session_id") and hasattr(event, "payload"):
            observations = self._codec.decode_update(event)
        elif hasattr(event, "method") and hasattr(event, "params"):
            observations = (self._codec.decode_peer_request(event),)
        elif hasattr(event, "code") and hasattr(event, "detail"):
            code = getattr(event, "code", "PROTOCOL_DIAGNOSTIC")
            observations = (Observation(
                ObservationKind.LIFECYCLE, self._harness_type,
                warnings=(f"ACP_DIAGNOSTIC:{code}",),
                native=bounded_native("acp.diagnostic@1", {"code": code, "detail": getattr(event, "detail", "")}),
            ),)
        for observation in observations:
            self._hub.push(observation)
        if hasattr(event, "session_id") and hasattr(event, "payload"):
            stop = _has_stop(self._codec, event)
            if stop is not None:
                self._engine.end_turn(event.session_id)

    def _admit_permission(self, event: Any) -> None:
        request_id = event.request_id
        if not self._hub.register_permission_open(request_id):
            self._extra_diagnostics.append("PERMISSION_DUPLICATE_REQUEST_REJECTED")
            return
        state = PermissionRequestState(
            request_id=request_id,
            session_id=getattr(event, "session_id", self._session_id or ""),
            option_ids=tuple(option.option_id for option in event.options[:32]),
            tool_name=_tool_name_of_tool_call(getattr(event, "tool_call", None)),
            deadline=event.deadline,
        )
        self._permission_queue.append(state)
        observation = self._codec.decode_permission(event)
        self._hub.push(observation)

    def _handle_permission_timeouts(self) -> None:
        while self._permission_queue:
            head = self._permission_queue[0]
            if not head.expired():
                return
            decision = self._policy.on_timeout(head)
            self._extra_diagnostics.append("ACP_PERMISSION_TIMEOUT:" + head.request_id)
            if decision.kind is PermissionDecisionKind.CANCEL:
                self._engine.cancel_permission(head.request_id)
                self._pop_state(head.request_id)
                self._hub.push(Observation(
                    ObservationKind.PERMISSION_RESULT, self._harness_type,
                    tool_name=head.tool_name or None,
                    native=bounded_native("acp.permission.timeout@1", {"request_id": head.request_id}),
                    warnings=("ACP_PERMISSION_TIMEOUT",),
                ), permission_request_id=head.request_id)
                self._hub.push(Observation(
                    ObservationKind.LIFECYCLE, self._harness_type,
                    text="", native=bounded_native("acp.permission.timeout@1", {"request_id": head.request_id}),
                    warnings=("ACP_PERMISSION_TIMEOUT_RECORDED",),
                ))
                if head.session_id and self._engine.busy(head.session_id):
                    self._hub.push(Observation(
                        ObservationKind.TERMINAL, self._harness_type,
                        terminal_condition=TerminalCondition.INTERRUPTED,
                        warnings=("ACP_TURN_INTERRUPTED_BY_PERMISSION_TIMEOUT",),
                    ))
                    self._engine.end_turn(head.session_id)
                continue
            if decision.kind in (PermissionDecisionKind.ALLOW, PermissionDecisionKind.DENY):
                self._resolve_permission(head, decision.option_id, kind=decision.kind)
                continue
            return

    def _engine_transport_eof(self) -> bool:
        engine = self._engine
        if engine is None:
            return False
        transport = self._transport
        return bool(getattr(transport, "closed", lambda: False)())

    def _finalize_process_exit(self) -> None:
        if self._hub.terminal_seen:
            return
        exit_code = None
        carrier = getattr(self, "_carrier", None)
        if carrier is not None:
            poll = getattr(carrier, "poll", None)
            if callable(poll):
                try:
                    exit_code = poll()
                except Exception:
                    exit_code = None
        self._hub.push(Observation(
            ObservationKind.TERMINAL, self._harness_type,
            terminal_condition=TerminalCondition.PROCESS_EXIT,
            is_error=bool(exit_code not in (None, 0)),
            warnings=("ACP_TRANSPORT_EOF",),
        ))

    # ------------------------------------------------------------------ #
    # permission Host surface
    # ------------------------------------------------------------------ #
    def pending_permission(self) -> PermissionView | None:
        if not self._permission_queue:
            return None
        state = self._permission_queue[0]
        return PermissionView(
            request_id=state.request_id,
            session_locator=self._session_id or "",
            tool_name=state.tool_name,
            options=tuple(PermissionOptionView(option_id) for option_id in state.option_ids[:32]),
            deadline=state.deadline,
        )

    def respond_permission(self, option_id: str) -> bool:
        if not self._permission_queue:
            return False
        state = self._permission_queue[0]
        if self._engine.select_permission(state.request_id, option_id):
            self._resolve_permission(state, option_id, kind=PermissionDecisionKind.ALLOW)
            return True
        return False

    def reject_permission(self) -> bool:
        if not self._permission_queue:
            return False
        state = self._permission_queue[0]
        if self._engine.cancel_permission(state.request_id):
            self._resolve_permission(state, "", kind=PermissionDecisionKind.DENY)
            return True
        return False

    def _pop_state(self, request_id: str) -> None:
        for index, item in enumerate(self._permission_queue):
            if item.request_id == request_id:
                del self._permission_queue[index]
                break

    def _resolve_permission(self, state: PermissionRequestState, option_id: str, *, kind: PermissionDecisionKind) -> None:
        state.answered = True
        self._pop_state(state.request_id)
        reason = "allowed" if kind is PermissionDecisionKind.ALLOW else ("denied" if kind is PermissionDecisionKind.DENY else "cancelled")
        self._hub.push(Observation(
            ObservationKind.PERMISSION_RESULT, self._harness_type,
            tool_name=state.tool_name or None,
            text=reason[:128],
            native=bounded_native("acp.permission.result@1", {"request_id": state.request_id, "option_id": option_id}),
        ), permission_request_id=state.request_id)

    # ------------------------------------------------------------------ #
    # control / cleanup
    # ------------------------------------------------------------------ #
    def session_locator(self) -> str | None:
        return self._session_id

    def cancel(self) -> None:
        if self._engine is None or self._session_id is None:
            return
        try:
            self._engine.cancel(self._session_id)
        except Exception as exc:
            raise from_acp_error(exc) from exc

    def close(self) -> None:
        if self._engine is None:
            return
        try:
            self._engine.close()
        except Exception as exc:
            raise from_acp_error(exc) from exc

    def terminal_state(self) -> TerminalCondition | None:
        condition = self._hub.snapshot().terminal_condition
        return TerminalCondition(condition) if condition is not None else None

    def diagnostics(self) -> Mapping[str, object]:
        engine_diags: list[str] = []
        if self._engine is not None:
            for item in self._engine.diagnostics():
                engine_diags.append(getattr(item, "code", "PROTOCOL_DIAGNOSTIC") + (":" + getattr(item, "detail", "") if getattr(item, "detail", "") else ""))
        return {
            "driver": self._impl_id,
            "mode": "acp",
            "session_locator": self._session_id,
            "protocol_version": self._binding.protocol_version if self._binding else None,
            "fidelity_notes": list(self._codec.fidelity_notes()),
            "engine_diagnostics": engine_diags[:64],
            "driver_diagnostics": list(self._extra_diagnostics)[:32],
            "hub": {
                "seq": self._hub.snapshot().seq,
                "events": self._hub.snapshot().count,
                "terminal": self._hub.snapshot().terminal_condition,
            },
        }


def _tool_name_of_tool_call(tool_call: Any) -> str:
    if isinstance(tool_call, Mapping):
        value = tool_call.get("name")
        if isinstance(value, str):
            return value[:128]
    return ""


def _is_ambiguous(exc: Exception) -> bool:
    mapped = from_acp_error(exc)
    return getattr(mapped, "code", "") == "SESSION_START_AMBIGUOUS"


def _has_stop(codec: AcpSessionCodec, event: Any) -> str | None:
    """Turn-end detection via the codec's stop vocabulary (best effort)."""
    if getattr(event, "kind", "") == "stop_reason":
        payload = getattr(event, "payload", {})
        return str(payload.get("stop_reason") or payload.get("stopReason") or "end_turn")[:128]
    if getattr(event, "kind", "") == "update":
        payload = getattr(event, "payload", {})
        from .codec import _stop_reason

        return _stop_reason(payload)
    return None


__all__ = [
    "GenericAcpSessionDriver",
    "_carrier_of",
    "_is_ambiguous",
]