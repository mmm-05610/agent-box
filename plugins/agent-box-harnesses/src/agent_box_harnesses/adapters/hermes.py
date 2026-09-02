"""Official Hermes Agent native Adapter.

Native facts are evidence-backed by the 2026-09-01 knowledge base
(docs/research/harness-native-knowledge-2026-09-01/harnesses/hermes/FACTS.md):

* headless one-shot is ``-z PROMPT``; ``--print`` does not exist (C.2,
  argparse rejects it) -> corrected launch fact.
* ``-z --usage-file <path>`` is the only structured headless surface: a JSON
  usage report written even on failure (H) -> observation artifacts.
* ``HERMES_HOME`` relocates the whole native home (D); the console script
  still needs its Python site-packages (B/J) -> single-file staging is
  declared insufficient via an explicit warning.
* Native resume exists: ``--resume SESSION`` (C.1) -> continuation kind is a
  native session, not a transcript handoff.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

from .generic_cli import GUEST_HOME, GenericCliAdapter
from .launch_plan import ObservationContract
from .native_render import render_yaml_via_json
from .observation import (
    NativeObservationDecoder, Observation, ObservationKind, TerminalCondition,
    bounded_native,
)

USAGE_ARTIFACT = "/runtime/home/usage-report.json"

# Documented top-level config.yaml keys (FACTS D); YAML tolerates unknown
# keys natively, so unknown keys surface as diagnostics instead of errors.
CONFIG_KEYS = frozenset({
    "model", "providers", "fallback_providers", "credential_pool_strategies",
    "toolsets", "max_concurrent_sessions", "max_live_sessions", "agent",
    "approvals", "command_allowlist", "mcp_servers", "skills", "hooks",
    "hooks_auto_accept", "write_approval", "security", "personalities",
    "platform_hints", "provider_routing", "openrouter", "checkpoints",
    "quick_commands", "display", "interface", "update_check",
})


class HermesUsageReportDecoder(NativeObservationDecoder):
    """``-z --usage-file`` JSON report -> canonical Observations (FACTS H)."""

    id = "hermes-usage-file@1"
    harness_type = "hermes"

    def decode_line(self, line: str) -> tuple[Observation, ...]:
        # Hermes -z writes no structured stdout event stream (FACTS C.2/H);
        # any stdout line is a bounded, schema-tagged unknown for this decoder.
        payload = self.parse_line(line)
        return (self.unknown_event(self.harness_type, "oneshot-stdout", payload),)

    def decode_document(self, payload: Mapping[str, Any]) -> tuple[Observation, ...]:
        if not isinstance(payload, dict):
            return (Observation(
                ObservationKind.UNKNOWN, self.harness_type,
                warnings=("MALFORMED_NATIVE_EVENT",),
            ),)
        usage = {str(key): float(value) for key, value in payload.items()
                 if isinstance(value, (int, float)) and ("token" in str(key) or "cost" in str(key))}
        locator = str(payload.get("session_id", "")).strip() or None
        completed = bool(payload.get("completed", False))
        failed = bool(payload.get("failed", False))
        observations = [
            Observation(
                ObservationKind.USAGE, self.harness_type, usage=usage or None,
                session_locator=locator,
                model=str(payload.get("model", ""))[:128] or None,
                native=bounded_native("hermes.usage-report@1", payload),
            ),
            Observation(
                ObservationKind.TERMINAL, self.harness_type,
                session_locator=locator,
                is_error=failed or not completed,
                terminal_condition=TerminalCondition.FAILED if (failed or not completed) else TerminalCondition.COMPLETED,
            ),
        ]
        return tuple(observations)


class HermesAdapter(GenericCliAdapter):
    harness_type = "hermes"
    native_home_env = "HERMES_HOME"
    native_home_guest = "/runtime/home/.hermes"
    config_guest_path = "/runtime/home/.hermes/config.yaml"
    config_renderer = staticmethod(render_yaml_via_json)
    guest_directories = ("/runtime/home/.hermes",)
    known_payload_keys = None
    # No structured stdout event stream exists in -z mode; observation is the
    # usage-file artifact.  "stream" is therefore not implemented here.
    implemented_capabilities = frozenset({"start", "observe", "finish", "native_continuation"})
    stream_live_available = False
    executable_warnings = ("HERMES_REQUIRES_SITE_PACKAGES_SINGLE_FILE_STAGING_INSUFFICIENT",)
    diagnostics_notes = (
        "HEADLESS_ONESHOT_IS_DASH_Z_NOT_PRINT",
        "OBSERVATION_VIA_USAGE_FILE_ARTIFACT",
        "CONSOLE_SCRIPT_NEEDS_PYTHON_SITE_PACKAGES",
    )

    def _make_decoder(self) -> NativeObservationDecoder:
        return HermesUsageReportDecoder()

    def _payload_diagnostics(self, payload: Mapping[str, Any]) -> tuple[str, ...]:
        unknown = sorted(set(str(key) for key in payload) - set(CONFIG_KEYS))
        return tuple(f"UNKNOWN_CONFIG_KEY:{key}" for key in unknown[:8])

    def _observation_contract(self) -> ObservationContract:
        return ObservationContract(decoder_id=self.decoder.id, stdout_events=False, artifacts=(USAGE_ARTIFACT,))

    def _plan_argv(self, context) -> tuple[str, ...]:
        argv = list(super()._plan_argv(context))
        usage_index = next((index for index, token in enumerate(argv) if token == "-z"), None)
        if usage_index is not None and "--usage-file" not in argv:
            argv[usage_index + 1:usage_index + 1] = ["--usage-file", USAGE_ARTIFACT]
        return tuple(argv)

    def _continuation_argv(self, locator: str, *, mode: str | None = None) -> tuple[str, ...]:
        return ("--resume", locator)

    def _plan_warnings(self, context) -> tuple[str, ...]:
        warnings = list(super()._plan_warnings(context))
        warnings.append("HERMES_SITE_PACKAGES_NOT_STAGED_SANDBOX_RUN_MAY_FAIL")
        return tuple(warnings)

    def staged_artifact_paths(self, staged_root: Path) -> tuple[Path, ...]:
        """Host paths of observation artifacts through the execution bind."""
        return tuple(staged_root / path.removeprefix(GUEST_HOME + "/") for path in (USAGE_ARTIFACT,))


__all__ = ["HermesAdapter", "HermesUsageReportDecoder", "USAGE_ARTIFACT"]
