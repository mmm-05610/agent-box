"""Official Claude Code native Adapter.

Native facts are evidence-backed by the 2026-09-01 knowledge base
(docs/research/harness-native-knowledge-2026-09-01/harnesses/claude-code/FACTS.md):

* headless structured output is ``--print --output-format stream-json
  --verbose`` (C4; the SDK always launches this way) -> observation channel.
* ``CLAUDE_CONFIG_DIR`` relocates settings/state, but the machine cache
  follows HOME (AUTHORITY_CONFLICT D1 vs F4) -> the Adapter sets BOTH
  ``HOME`` and ``CLAUDE_CONFIG_DIR`` for full isolation.
* personal skills live at ``<config>/skills/<name>`` (G2) -> native target.
"""
from __future__ import annotations

from typing import Any, Mapping

from .generic_cli import GenericCliAdapter
from .native_render import render_json
from .observation import (
    NativeObservationDecoder, Observation, ObservationKind, TerminalCondition,
    bounded_native,
)

# Documented settings keys (FACTS D2/D3); unknown keys are tolerated natively
# and surfaced as diagnostics, never merged silently into LaunchPlan decisions.
SETTINGS_KEYS = frozenset({
    "model", "env", "permissions", "hooks", "statusLine", "effortLevel",
    "modelSettings", "fallbackModel", "availableModels", "enforceAvailableModels",
    "outputStyle", "apiKeyHelper", "forceLoginMethod", "forceLoginOrgUUID",
    "extraKnownMarketplaces", "enabledPlugins", "autoMemoryEnabled",
    "autoMemoryDirectory", "claudeMdExcludes", "alwaysThinkingEnabled",
    "autoCompactWindow", "ultracode", "cleanupPeriodDays",
    "enableAllProjectMcpServers", "enabledMcpjsonServers", "disabledMcpjsonServers",
    "disableBypassPermissionsMode", "defaultMode", "includeCoAuthoredBy",
    "autoUpdates", "respectsGitignore", "requiredMinimumVersion",
    "allowManagedPermissionRulesOnly", "disableAllHooks", "sandbox",
})


class ClaudeStreamJsonDecoder(NativeObservationDecoder):
    """stream-json envelope -> canonical Observations (FACTS H1-H10)."""

    id = "claude-stream-json@1"
    harness_type = "claude-code"

    def decode_line(self, line: str) -> tuple[Observation, ...]:
        payload = self.parse_line(line)
        event_type = str(payload.get("type", ""))
        subtype = str(payload.get("subtype", ""))
        session_id = str(payload.get("session_id", "")).strip() or None
        if event_type == "system" and subtype == "init":
            return (Observation(
                ObservationKind.SESSION, self.harness_type, session_locator=session_id,
                model=str(payload.get("model", ""))[:128] or None,
                native=bounded_native("claude.system.init@1", payload),
            ),)
        if event_type == "system":
            return (Observation(
                ObservationKind.LIFECYCLE, self.harness_type,
                native=bounded_native("claude.system@1", payload),
            ),)
        if event_type == "assistant":
            message = payload.get("message") if isinstance(payload.get("message"), dict) else {}
            blocks = message.get("content") if isinstance(message.get("content"), list) else []
            text = "".join(str(block.get("text", "")) for block in blocks if isinstance(block, dict) and block.get("type") == "text")
            tool_requests = tuple(
                Observation(
                    ObservationKind.TOOL_REQUEST, self.harness_type,
                    tool_name=str(block.get("name", ""))[:128],
                    native=bounded_native("claude.tool_use@1", block),
                )
                for block in blocks if isinstance(block, dict) and block.get("type") == "tool_use"
            )
            return (Observation(
                ObservationKind.MESSAGE, self.harness_type, text=text[:8192],
                session_locator=session_id,
                native=bounded_native("claude.assistant@1", payload),
            ), *tool_requests)
        if event_type == "user":
            return (Observation(
                ObservationKind.TOOL_RESULT, self.harness_type, session_locator=session_id,
                native=bounded_native("claude.user@1", payload),
            ),)
        if event_type == "stream_event":
            return (Observation(
                ObservationKind.LIFECYCLE, self.harness_type, session_locator=session_id,
                native=bounded_native("claude.stream_event@1", payload),
            ),)
        if event_type == "result":
            usage_payload = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
            usage = {str(key): float(value) for key, value in usage_payload.items() if isinstance(value, (int, float))}
            cost = payload.get("total_cost_usd")
            if isinstance(cost, (int, float)):
                usage["total_cost_usd"] = float(cost)
            is_error = bool(payload.get("is_error", False))
            condition = TerminalCondition.FAILED if is_error else TerminalCondition.COMPLETED
            return (
                Observation(
                    ObservationKind.USAGE, self.harness_type, usage=usage or None,
                    session_locator=session_id,
                    native=bounded_native("claude.result.usage@1", payload),
                ),
                Observation(
                    ObservationKind.TERMINAL, self.harness_type, is_error=is_error,
                    text=str(payload.get("result", ""))[:1024] if is_error else "",
                    terminal_condition=condition, session_locator=session_id,
                    native=bounded_native("claude.result@1", payload),
                ),
            )
        if event_type == "control_request":
            return (Observation(
                ObservationKind.PERMISSION_REQUEST, self.harness_type, session_locator=session_id,
                native=bounded_native("claude.control_request@1", payload),
            ),)
        if event_type == "control_response":
            return (Observation(
                ObservationKind.PERMISSION_RESULT, self.harness_type, session_locator=session_id,
                native=bounded_native("claude.control_response@1", payload),
            ),)
        return (self.unknown_event(self.harness_type, event_type or subtype or "unknown", payload),)


class ClaudeAdapter(GenericCliAdapter):
    harness_type = "claude-code"
    native_home_env = "CLAUDE_CONFIG_DIR"
    native_home_guest = "/runtime/home/.claude"
    config_guest_path = "/runtime/home/.claude/settings.json"
    config_renderer = staticmethod(render_json)
    guest_directories = ("/runtime/home/.claude",)
    known_payload_keys = None
    implemented_capabilities = frozenset({"start", "observe", "finish", "stream", "native_continuation"})
    diagnostics_notes = (
        "CLAUDE_CONFIG_DIR_RELOCATES_CONFIG_ONLY_CACHE_FOLLOWS_HOME",
        "HOME_AND_CONFIG_DIR_BOTH_RELOCATED_FOR_FULL_ISOLATION",
    )

    def _make_decoder(self) -> NativeObservationDecoder:
        return ClaudeStreamJsonDecoder()

    def profile_model(self, payload: Mapping[str, Any]) -> str | None:
        """Model identity declared by a Claude Code profile payload (vendor fact).

        Claude Code's documented top-level ``model`` settings key (FACTS D2)
        carries the model selection; it is rendered into settings.json
        verbatim by the managed config render.
        """
        value = payload.get("model") if isinstance(payload, Mapping) else None
        if not isinstance(value, str) or not value.strip():
            return None
        return value.strip()[:128]

    def _payload_diagnostics(self, payload: Mapping[str, Any]) -> tuple[str, ...]:
        unknown = sorted(set(str(key) for key in payload) - set(SETTINGS_KEYS))
        return tuple(f"UNKNOWN_SETTING_KEY:{key}" for key in unknown[:8])

    def _continuation_argv(self, locator: str, *, mode: str | None = None) -> tuple[str, ...]:
        return ("--resume", locator)


__all__ = ["ClaudeAdapter", "ClaudeStreamJsonDecoder"]
