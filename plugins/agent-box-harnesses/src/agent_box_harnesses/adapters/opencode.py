"""Official OpenCode native Adapter.

Native facts are evidence-backed by the 2026-09-01 knowledge base
(docs/research/harness-native-knowledge-2026-09-01/harnesses/opencode/FACTS.md):

* headless structured output is ``run --format json`` (C2) -> observation
  channel; the run loop exits when the session goes idle (C9).
* OpenCode auto-seeds the global config when it is missing (D3) -> the
  Adapter pre-renders the profile payload as ``opencode.json`` so the native
  seed never writes its own content into the execution home.
* Unknown top-level config keys are rejected natively (D7) -> payload
  validation fails closed against the documented key set.
* Without credentials a headless run can hang on the default model (C9/E5)
  -> a bounded host-side timeout remains mandatory (Host responsibility).
"""
from __future__ import annotations

from typing import Any, Mapping

from .generic_cli import GenericCliAdapter
from .native_render import render_json
from .observation import (
    NativeObservationDecoder, Observation, ObservationKind, TerminalCondition,
    bounded_native,
)

# Documented top-level config keys (FACTS D8); OpenCode rejects unknown keys.
CONFIG_KEYS = frozenset({
    "$schema", "username", "model", "small_model", "default_agent", "shell",
    "logLevel", "share", "autoupdate", "snapshot", "instructions", "skills",
    "references", "agent", "command", "provider", "disabled_providers",
    "enabled_providers", "mcp", "plugin", "permission", "formatter", "lsp",
    "experimental", "tool_output", "compaction", "mode", "theme", "keybinds",
})


class OpenCodeJsonDecoder(NativeObservationDecoder):
    """``run --format json`` SDK v2 event stream -> canonical Observations."""

    id = "opencode-run-json@1"
    harness_type = "opencode"

    def decode_line(self, line: str) -> tuple[Observation, ...]:
        payload = self.parse_line(line)
        event_type = str(payload.get("type", ""))
        session_id = str(payload.get("sessionID", "")).strip() or None
        if event_type == "session.status":
            status = payload.get("status") if isinstance(payload.get("status"), dict) else {}
            status_type = str(status.get("type", ""))
            if status_type == "idle":
                return (Observation(
                    ObservationKind.TERMINAL, self.harness_type,
                    terminal_condition=TerminalCondition.COMPLETED, session_locator=session_id,
                    native=bounded_native("opencode.session.status@1", payload),
                ),)
            return (Observation(
                ObservationKind.LIFECYCLE, self.harness_type, session_locator=session_id,
                native=bounded_native("opencode.session.status@1", payload),
            ),)
        if event_type == "session.error":
            data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
            return (Observation(
                ObservationKind.TERMINAL, self.harness_type, is_error=True,
                text=str(data.get("message", ""))[:1024], session_locator=session_id,
                terminal_condition=TerminalCondition.FAILED,
                native=bounded_native("opencode.session.error@1", payload),
            ),)
        if event_type == "permission.asked":
            return (Observation(
                ObservationKind.PERMISSION_REQUEST, self.harness_type, session_locator=session_id,
                tool_name=str(payload.get("permission", ""))[:128] or None,
                native=bounded_native("opencode.permission.asked@1", payload),
            ),)
        if event_type in {"message.updated", "message.part.updated", "message.part.delta"}:
            return (Observation(
                ObservationKind.MESSAGE, self.harness_type, session_locator=session_id,
                native=bounded_native("opencode.message@1", payload),
            ),)
        if event_type.startswith("session."):
            return (Observation(
                ObservationKind.SESSION, self.harness_type, session_locator=session_id,
                native=bounded_native("opencode.session@1", payload),
            ),)
        return (self.unknown_event(self.harness_type, event_type or "unknown", payload),)


class OpenCodeAdapter(GenericCliAdapter):
    harness_type = "opencode"
    native_home_env = "XDG_CONFIG_HOME"
    native_home_guest = "/runtime/home/.config"
    config_guest_path = "/runtime/home/.config/opencode/opencode.json"
    config_renderer = staticmethod(render_json)
    guest_directories = ("/runtime/home/.config/opencode",)
    extra_environment = {
        "XDG_DATA_HOME": "/runtime/home/.data",
        "XDG_CACHE_HOME": "/runtime/home/.cache",
        "XDG_STATE_HOME": "/runtime/home/.state",
    }
    # The Agent-Box managed profile payload has its own vocabulary; the
    # adapter renders only the documented native keys into opencode.json so
    # OpenCode's strict unknown-key rejection (FACTS D7) is never triggered.
    known_payload_keys = None
    implemented_capabilities = frozenset({"start", "observe", "finish", "stream", "native_continuation"})
    diagnostics_notes = (
        "OPENCODE_AUTO_SEEDS_GLOBAL_CONFIG_PRE_RENDERED",
        "OPENCODE_NO_CREDENTIAL_HANG_HOST_TIMEOUT_REQUIRED",
        "OPENCODE_PERMISSIONS_AUTO_REJECTED_WITHOUT_EXPLICIT_POLICY",
    )
    # Session-mode facts: native (exec) is the default; acp is an OPTIONAL
    # second mode that must be selected explicitly (never implicitly).
    session_mode_drivers = {"exec": "native", "acp": "acp"}
    default_session_mode = "exec"
    optional_session_modes = ("acp",)

    def _make_decoder(self) -> NativeObservationDecoder:
        return OpenCodeJsonDecoder()

    def _payload_diagnostics(self, payload: Mapping[str, Any]) -> tuple[str, ...]:
        unknown = sorted(set(str(key) for key in payload) - set(CONFIG_KEYS))
        return tuple(f"UNMAPPED_CONFIG_KEY:{key}" for key in unknown[:8])

    def _candidate_files(self, context, payload) -> tuple:
        """Render only the documented native keys into opencode.json.

        OpenCode rejects unknown top-level config keys natively (FACTS D7);
        the managed profile vocabulary (instructions, mcp, skills, ...) is
        mapped onto its documented native key where one exists and dropped
        otherwise.
        """
        from .composer import CandidateFile

        if not payload or not self.config_guest_path:
            return ()
        native_keys = ("model", "small_model", "provider", "permission", "instructions", "skills", "mcp")
        native = {key: payload[key] for key in native_keys if key in payload}
        return (CandidateFile(
            guest_path=self.config_guest_path,
            content=self.config_renderer(native),
            semantic_key="profile-config",
            authority="agent-box.profile@1",
        ),)

    def _continuation_argv(self, locator: str, *, mode: str | None = None) -> tuple[str, ...] | None:
        # native resume: ``-s <sessionID>`` (FACTS I5).  The ACP mode resumes
        # through the protocol (session/resume -> load -> new) inside the
        # session driver; argv injection would corrupt ``opencode acp``.
        if mode == "acp":
            return None
        return ("-s", locator)

    def _continuation_kind(self, mode: str | None = None) -> str:
        return "driver_resume" if mode == "acp" else "native_session"

    def _prompt_is_protocol(self, mode: str | None = None) -> bool:
        # The ACP mode sends the user prompt through session/prompt; the
        # process argv must stay protocol-clean.
        return mode == "acp"

    def _plan_warnings(self, context) -> tuple[str, ...]:
        warnings = list(super()._plan_warnings(context))
        warnings.append("OPENCODE_PERMISSIONS_AUTO_REJECTED_WITHOUT_EXPLICIT_POLICY")
        warnings.append("OPENCODE_NO_CREDENTIAL_HANG_HOST_TIMEOUT_REQUIRED")
        if context.launch_mode.name == "acp":
            warnings.append("OPENCODE_ACP_PROMPT_SENT_VIA_PROTOCOL")
        return tuple(warnings)


__all__ = ["OpenCodeAdapter", "OpenCodeJsonDecoder"]
