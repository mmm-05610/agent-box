"""Generic ACP session codec: protocol messages -> canonical Observations.

The codec is the Harness-side mapping layer between the protocol-generic
engine events and the canonical Agent-Box Observation boundary.  It
declares its fidelity notes honestly: capabilities the protocol or this
codec cannot express are surfaced, never fabricated.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Mapping, Protocol, runtime_checkable

from ..adapters.observation import Observation, ObservationKind, TerminalCondition, bounded_native

if TYPE_CHECKING:
    from agent_box_acp import (
        DiagnosticEvent, PeerRequestEvent, PermissionRequest, UpdateEvent,
    )

_MAX_LOCATOR = 512


def _locator(session_id: str) -> str | None:
    value = session_id.strip()
    return value[: _MAX_LOCATOR] or None


@runtime_checkable
class AcpSessionCodec(Protocol):
    def harness_type(self) -> str: ...
    def decode_update(self, event: UpdateEvent) -> tuple[Observation, ...]: ...
    def decode_permission(self, request: PermissionRequest) -> Observation: ...
    def decode_peer_request(self, event: PeerRequestEvent) -> Observation: ...
    def fidelity_notes(self) -> tuple[str, ...]: ...
    def capability_overrides(self) -> Mapping[str, str]: ...


class GenericAcpCodec:
    """Protocol-generic update mapping; per-Harness codecs subclass it.

    Mapping table (protocol vocabulary only):
      agent_message_chunk      -> MESSAGE (+ stop-reason terminal when present)
      agent_thought_chunk      -> MESSAGE (native-tagged, no fabricated text)
      tool_call                -> TOOL_REQUEST
      tool_call_update         -> TOOL_RESULT
      plan                     -> LIFECYCLE
      available_commands_update/current_mode_update/user_message_chunk -> LIFECYCLE
      session_info_update      -> SESSION (+ USAGE only when usage is present)
      stop_reason              -> terminal TURN_COMPLETED/FAILED
      anything else            -> UNKNOWN with warnings
    """

    id = "generic-acp-codec@1"
    harness = "generic"

    def harness_type(self) -> str:
        return self.harness

    def decode_update(self, event: UpdateEvent) -> tuple[Observation, ...]:
        kind = event.kind
        payload = event.payload
        locator = _locator(event.session_id)
        if kind == "agent_message_chunk":
            text = _text_of(payload)
            stop = _stop_reason(payload)
            observations = [
                Observation(
                    ObservationKind.MESSAGE, self.harness, text=text,
                    session_locator=locator,
                    native=bounded_native("acp.agent_message_chunk@1", payload),
                ),
            ]
            if stop is not None:
                observations.append(_stop_terminal(self.harness, stop, locator, payload))
            return tuple(observations)
        if kind == "agent_thought_chunk":
            return (Observation(
                ObservationKind.MESSAGE, self.harness, text="",
                session_locator=locator,
                native=bounded_native("acp.agent_thought_chunk@1", payload),
            ),)
        if kind == "tool_call":
            return (Observation(
                ObservationKind.TOOL_REQUEST, self.harness,
                tool_name=_tool_name_of(payload)[:128] or None,
                session_locator=locator,
                native=bounded_native("acp.tool_call@1", payload),
            ),)
        if kind == "tool_call_update":
            return (Observation(
                ObservationKind.TOOL_RESULT, self.harness,
                tool_name=_tool_name_of(payload)[:128] or None,
                session_locator=locator,
                native=bounded_native("acp.tool_call_update@1", payload),
            ),)
        if kind == "session_info_update":
            observations = [Observation(
                ObservationKind.SESSION, self.harness, session_locator=locator,
                native=bounded_native("acp.session_info_update@1", payload),
            )]
            usage = _extract_usage(payload)
            if usage is not None:
                observations.append(Observation(
                    ObservationKind.USAGE, self.harness, usage=usage, session_locator=locator,
                    native=bounded_native("acp.session_info_update.usage@1", {"usage": payload.get("usage")}),
                ))
            return tuple(observations)
        if kind == "stop_reason":
            return (_stop_terminal(self.harness, payload, locator, payload),)
        if kind in {"plan", "available_commands_update", "current_mode_update", "user_message_chunk"}:
            return (Observation(
                ObservationKind.LIFECYCLE, self.harness, session_locator=locator,
                native=bounded_native("acp.%s@1" % kind.replace("-", "_"), payload),
            ),)
        return (Observation(
            ObservationKind.UNKNOWN, self.harness, session_locator=locator,
            native=bounded_native("acp.update.unknown@1", payload),
            warnings=("UNKNOWN_UPDATE_VARIANT",),
        ),)

    def decode_permission(self, request: PermissionRequest) -> Observation:
        return Observation(
            ObservationKind.PERMISSION_REQUEST, self.harness,
            session_locator=_locator(request.session_id),
            tool_name=_tool_name_of(request.tool_call)[:128] or None,
            native=bounded_native("acp.permission.request@1", {
                "request_id": request.request_id,
                "options": [{"option_id": o.option_id, "name": o.name, "kind": o.kind} for o in request.options[:32]],
                "tool_call": request.tool_call,
            }),
        )

    def decode_peer_request(self, event: PeerRequestEvent) -> Observation:
        return Observation(
            ObservationKind.UNKNOWN, self.harness,
            native=bounded_native("acp.peer_request@1", {"method": event.method, "params": event.params}),
            warnings=("UNANSWERED_PEER_REQUEST",),
        )

    def fidelity_notes(self) -> tuple[str, ...]:
        return ("ACP_USAGE_AND_COST_AVAILABILITY_IS_PROTOCOL_DEPENDENT",)

    def capability_overrides(self) -> Mapping[str, str]:
        return {}


def _text_of(payload: Mapping[str, object]) -> str:
    for container in (payload, payload.get("payload") if isinstance(payload.get("payload"), Mapping) else {}):
        for key in ("content", "text"):
            value = container.get(key)
            if isinstance(value, str):
                return value[:8192]
            if isinstance(value, Mapping):
                inner = value.get("content")
                if isinstance(inner, str):
                    return inner[:8192]
    return ""


def _stop_reason(payload: Mapping[str, object]) -> str | None:
    for key in ("stopReason", "stop_reason"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value[:128]
        if isinstance(value, Mapping):
            inner = value.get("reason")
            if isinstance(inner, str) and inner:
                return inner[:128]
    inner = payload.get("payload")
    if isinstance(inner, Mapping):
        for key in ("stopReason", "stop_reason"):
            value = inner.get(key)
            if isinstance(value, str) and value:
                return value[:128]
    return None


def _stop_terminal(harness: str, reason: str, locator: str | None, payload: Mapping[str, object]) -> Observation:
    is_error = "error" in reason.lower() or "fail" in reason.lower() or "abort" in reason.lower()
    condition = TerminalCondition.FAILED if is_error else TerminalCondition.TURN_COMPLETED
    return Observation(
        ObservationKind.TERMINAL, harness, text=reason, is_error=is_error,
        session_locator=locator, terminal_condition=condition,
        native=bounded_native("acp.stop_reason@1", payload),
    )


def _tool_name_of(payload: Mapping[str, object]) -> str:
    inner = payload.get("payload")
    if isinstance(inner, Mapping):
        for key in ("name", "tool_name"):
            value = inner.get(key)
            if isinstance(value, str) and value:
                return value
        tool = inner.get("tool")
        if isinstance(tool, Mapping):
            value = tool.get("name")
            if isinstance(value, str) and value:
                return value
    for key in ("name", "tool_name"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value
    tool = payload.get("tool")
    if isinstance(tool, Mapping):
        value = tool.get("name")
        if isinstance(value, str) and value:
            return value
    # "kind" is the ACP variant tag, never a tool name; do not use it here.
    return ""


def _extract_usage(payload: Mapping[str, object]) -> Mapping[str, float] | None:
    usage = payload.get("usage")
    if not isinstance(usage, Mapping):
        return None
    out: dict[str, float] = {}
    for key in ("inputTokens", "outputTokens", "input_tokens", "output_tokens", "totalTokens", "total_tokens"):
        value = usage.get(key)
        if isinstance(value, (int, float)):
            out[key.replace("_tokens", "") or key] = float(value)
    # cost: only when the protocol declares it (never fabricated).
    cost = usage.get("cost")
    if isinstance(cost, (int, float)):
        out["cost_usd"] = float(cost)
    return out or None


__all__ = [
    "AcpSessionCodec",
    "GenericAcpCodec",
    "_extract_usage",
    "_stop_reason",
    "_stop_terminal",
    "_text_of",
    "_tool_name_of",
]