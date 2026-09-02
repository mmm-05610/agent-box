"""Official Pi Coding Agent native Adapter.

Native facts are evidence-backed by the 2026-09-01 knowledge base
(docs/research/harness-native-knowledge-2026-09-01/harnesses/pi/FACTS.md):

* there is NO ``--agent-dir`` CLI flag: unknown flags are silently swallowed
  (B5/D3) -> the agent dir is relocated with ``PI_CODING_AGENT_DIR`` env.
* ``--mode json`` is the headless structured event stream (C.3/H1): a
  session header line first, then the documented event set.
* ``PI_OFFLINE=1`` disables the startup pi.dev update check and telemetry
  without affecting model calls (C.10).
* headless runs never show a project trust prompt; without a saved decision
  project ``.pi`` resources are silently ignored (C.8) -> explicit warning.
"""
from __future__ import annotations

from typing import Any, Mapping

from .generic_cli import GenericCliAdapter
from .native_render import render_json
from .observation import (
    NativeObservationDecoder, Observation, ObservationKind, TerminalCondition,
    bounded_native,
)

SETTINGS_KEYS = frozenset({
    "defaultProvider", "defaultModel", "defaultThinkingLevel", "modelThinkingLevels",
    "theme", "sessionDir", "defaultTools", "enabledModels", "packages",
    "extensions", "skills", "prompts", "themes", "enableSkillCommands",
    "compaction", "retry", "steeringMode", "followUpMode", "httpProxy",
    "defaultProjectTrust", "shellPath", "shellCommandPrefix", "npmCommand",
    "terminal", "images",
})


class PiJsonDecoder(NativeObservationDecoder):
    """``--mode json`` event stream -> canonical Observations (FACTS H1/H2)."""

    id = "pi-mode-json@1"
    harness_type = "pi"

    def decode_line(self, line: str) -> tuple[Observation, ...]:
        payload = self.parse_line(line)
        event_type = str(payload.get("type", ""))
        if event_type == "session":
            locator = str(payload.get("id", "")).strip() or None
            return (Observation(
                ObservationKind.SESSION, self.harness_type, session_locator=locator,
                native=bounded_native("pi.session.header@1", payload),
            ),)
        if event_type in {"agent_start", "turn_start", "agent_end", "turn_end",
                          "queue_update", "compaction_start", "compaction_end"}:
            return (Observation(
                ObservationKind.LIFECYCLE, self.harness_type,
                native=bounded_native("pi.lifecycle@1", payload),
            ),)
        if event_type == "message_start":
            return (Observation(
                ObservationKind.LIFECYCLE, self.harness_type,
                native=bounded_native("pi.message_start@1", payload),
            ),)
        if event_type == "message_update":
            return (Observation(
                ObservationKind.LIFECYCLE, self.harness_type,
                native=bounded_native("pi.message_update@1", payload),
            ),)
        if event_type == "message_end":
            message = payload.get("message") if isinstance(payload.get("message"), dict) else {}
            usage_payload = message.get("usage") if isinstance(message.get("usage"), dict) else {}
            usage = {str(key): float(value) for key, value in usage_payload.items() if isinstance(value, (int, float))}
            text = str(message.get("text", ""))[:8192] if message.get("role") == "assistant" else ""
            events = [Observation(
                ObservationKind.MESSAGE, self.harness_type, text=text,
                native=bounded_native("pi.message_end@1", payload),
            )]
            if usage:
                events.append(Observation(ObservationKind.USAGE, self.harness_type, usage=usage))
            return tuple(events)
        if event_type == "tool_execution_start":
            return (Observation(
                ObservationKind.TOOL_REQUEST, self.harness_type,
                tool_name=str(payload.get("toolName", ""))[:128] or None,
                native=bounded_native("pi.tool_execution_start@1", payload),
            ),)
        if event_type == "tool_execution_update":
            return (Observation(
                ObservationKind.LIFECYCLE, self.harness_type,
                native=bounded_native("pi.tool_execution_update@1", payload),
            ),)
        if event_type == "tool_execution_end":
            is_error = bool(payload.get("isError", False))
            return (Observation(
                ObservationKind.TOOL_RESULT, self.harness_type, is_error=is_error,
                native=bounded_native("pi.tool_execution_end@1", payload),
            ),)
        return (self.unknown_event(self.harness_type, event_type or "unknown", payload),)


class PiAdapter(GenericCliAdapter):
    harness_type = "pi"
    native_home_env = "PI_CODING_AGENT_DIR"
    native_home_guest = "/runtime/home"
    config_guest_path = "/runtime/home/settings.json"
    config_renderer = staticmethod(render_json)
    guest_directories = ()
    extra_environment = {"PI_OFFLINE": "1"}
    known_payload_keys = None
    implemented_capabilities = frozenset({"start", "observe", "finish", "stream", "native_continuation"})
    diagnostics_notes = (
        "PI_HAS_NO_AGENT_DIR_FLAG_ENV_ONLY_RELOCATION",
        "PI_STARTUP_NETWORK_DISABLED_VIA_PI_OFFLINE",
        "PI_PROJECT_TRUST_UNDECIDED_PROJECT_RESOURCES_IGNORED",
    )

    def _make_decoder(self) -> NativeObservationDecoder:
        return PiJsonDecoder()

    def _payload_diagnostics(self, payload: Mapping[str, Any]) -> tuple[str, ...]:
        unknown = sorted(set(str(key) for key in payload) - set(SETTINGS_KEYS))
        return tuple(f"UNKNOWN_SETTING_KEY:{key}" for key in unknown[:8])

    def _continuation_argv(self, locator: str, *, mode: str | None = None) -> tuple[str, ...]:
        # native resume: ``--session <path|partial-uuid>`` (FACTS C.7)
        return ("--session", locator)

    def _plan_warnings(self, context) -> tuple[str, ...]:
        warnings = list(super()._plan_warnings(context))
        warnings.append("PI_PROJECT_TRUST_UNDECIDED_PROJECT_RESOURCES_IGNORED")
        return tuple(warnings)


__all__ = ["PiAdapter", "PiJsonDecoder"]
