"""Official Codex CLI native Adapter.

Native facts are evidence-backed by the 2026-09-01 knowledge base
(docs/research/harness-native-knowledge-2026-09-01/harnesses/codex/FACTS.md):

* CODEX_HOME must already exist as a directory (D1) -> guest directory
  requirement; relocated via env, never by copying a developer HOME.
* ``codex exec --json`` streams a closed JSONL event set on stdout while the
  human banner goes to stderr (C.2/H1) -> the observation channel.
* Non-git workspaces require ``--skip-git-repo-check`` (C.2) -> always
  declared because Agent-Box workspaces are execution-local directories.
* ``$CODEX_HOME/skills`` is deprecated; the current user root is
  ``$HOME/.agents/skills`` (G skills) -> native skill target.
"""
from __future__ import annotations

from typing import Any, Mapping

from .generic_cli import GenericCliAdapter
from .native_render import render_toml
from .observation import (
    NativeObservationDecoder, Observation, ObservationKind, TerminalCondition,
    bounded_native,
)

CONFIG_KEYS = frozenset({
    "model", "model_provider", "model_providers", "approval_policy", "sandbox_mode",
    "model_reasoning_effort", "personality", "web_search", "shell_environment_policy",
    "notify", "history", "features", "mcp_servers", "project_doc_max_bytes",
    "project_doc_fallback_filenames", "project_root_markers", "cli_auth_credentials_store",
    "forced_login_method", "chatgpt_base_url", "log_dir", "profile", "profiles",
    "hooks", "skills", "windows", "oss_provider", "tui", "analytics",
})


class CodexExecJsonDecoder(NativeObservationDecoder):
    """``codex exec --json`` closed event set -> canonical Observations (H1/H2/H3)."""

    id = "codex-exec-json@1"
    harness_type = "codex"

    def decode_line(self, line: str) -> tuple[Observation, ...]:
        payload = self.parse_line(line)
        event_type = str(payload.get("type", ""))
        if event_type == "thread.started":
            locator = str(payload.get("thread_id", "")).strip() or None
            return (Observation(
                ObservationKind.SESSION, self.harness_type, session_locator=locator,
                native=bounded_native("codex.thread.started@1", payload),
            ),)
        if event_type in {"turn.started", "item.started", "item.updated"}:
            return (Observation(
                ObservationKind.LIFECYCLE, self.harness_type,
                native=bounded_native("codex.lifecycle@1", payload),
            ),)
        if event_type == "item.completed":
            item = payload.get("item") if isinstance(payload.get("item"), dict) else {}
            item_type = str(item.get("type", ""))
            if item_type == "agent_message":
                return (Observation(
                    ObservationKind.MESSAGE, self.harness_type, text=str(item.get("text", "")),
                    native=bounded_native("codex.item.agent_message@1", payload),
                ),)
            if item_type in {"mcp_tool_call", "collab_tool_call", "command_execution", "file_change", "web_search"}:
                return (Observation(
                    ObservationKind.TOOL_RESULT, self.harness_type, tool_name=item_type,
                    native=bounded_native("codex.item.tool@1", payload),
                ),)
            return (Observation(
                ObservationKind.LIFECYCLE, self.harness_type,
                native=bounded_native("codex.item.completed@1", payload),
            ),)
        if event_type == "turn.completed":
            usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else None
            return (
                Observation(
                    ObservationKind.USAGE, self.harness_type,
                    usage={str(key): float(value) for key, value in (usage or {}).items() if isinstance(value, (int, float))},
                    native=bounded_native("codex.turn.completed@1", payload),
                ),
                Observation(
                    ObservationKind.TERMINAL, self.harness_type,
                    terminal_condition=TerminalCondition.TURN_COMPLETED,
                ),
            )
        if event_type == "turn.failed":
            error = payload.get("error") if isinstance(payload.get("error"), dict) else {}
            return (Observation(
                ObservationKind.TERMINAL, self.harness_type, is_error=True,
                text=str(error.get("message", ""))[:1024],
                terminal_condition=TerminalCondition.FAILED,
                native=bounded_native("codex.turn.failed@1", payload),
            ),)
        if event_type == "error":
            return (Observation(
                ObservationKind.TERMINAL, self.harness_type, is_error=True,
                text=str(payload.get("message", ""))[:1024],
                terminal_condition=TerminalCondition.FAILED,
                native=bounded_native("codex.error@1", payload),
            ),)
        return (self.unknown_event(self.harness_type, event_type, payload),)


class CodexAdapter(GenericCliAdapter):
    harness_type = "codex"
    native_home_env = "CODEX_HOME"
    native_home_guest = "/runtime/home/.codex"
    config_guest_path = "/runtime/home/.codex/config.toml"
    config_renderer = staticmethod(render_toml)
    guest_directories = ("/runtime/home/.codex",)
    # Codex ignores unknown config keys without --strict-config (FACTS D5), so
    # unknown payload keys surface as diagnostics instead of rejections.
    known_payload_keys = None
    implemented_capabilities = frozenset({"start", "observe", "finish", "stream", "native_continuation"})
    credential_guest_target = "/runtime/home/auth.json"
    credential_materializer_id = "codex-login"
    diagnostics_notes = (
        "CODEX_HOME_MUST_PRE_EXIST",
        "EXEC_STDOUT_JSONL_STDERR_DIAGNOSTICS",
        "NON_GIT_WORKSPACE_REQUIRES_SKIP_GIT_REPO_CHECK",
    )

    def _make_decoder(self) -> NativeObservationDecoder:
        return CodexExecJsonDecoder()

    def _payload_diagnostics(self, payload: Mapping[str, Any]) -> tuple[str, ...]:
        unknown = sorted(set(str(key) for key in payload) - set(CONFIG_KEYS))
        return tuple(f"UNKNOWN_CONFIG_KEY:{key}" for key in unknown[:8])

    def _candidate_files(self, context, payload) -> tuple:
        """Render only documented Codex config keys into config.toml."""
        from .composer import CandidateFile

        if not payload or not self.config_guest_path:
            return ()
        native_keys = ("model", "model_provider", "model_providers", "approval_policy", "sandbox_mode",
                       "model_reasoning_effort", "personality", "web_search", "features", "mcp_servers",
                       "notify", "history", "hooks", "profile")
        native = {key: payload[key] for key in native_keys if key in payload}
        return (CandidateFile(
            guest_path=self.config_guest_path,
            content=self.config_renderer(native),
            semantic_key="profile-config",
            authority="agent-box.profile@1",
        ),)

    def _continuation_argv(self, locator: str, *, mode: str | None = None) -> tuple[str, ...]:
        # ``codex exec resume <SESSION_ID> [PROMPT]`` keeps the full exec flag
        # set (FACTS C.3); the base inserts these tokens after argv[1].
        return ("resume", locator)

    def _plan_warnings(self, context) -> tuple[str, ...]:
        warnings = list(super()._plan_warnings(context))
        if context.continuation is not None:
            warnings.append("CODEX_EXEC_RESUME_LOCATOR_PLANNED")
        return tuple(warnings)


__all__ = ["CodexAdapter", "CodexExecJsonDecoder"]
