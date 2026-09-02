"""Shared pure planning base for the five official Harness Adapters.

The base owns the common, Harness-neutral planning mechanics; every
per-Harness subclass owns its evidence-backed native facts (home isolation,
argv shape, config format, skill target).  Adapters are pure planner/codec
code: no process spawn, no environment mutation, no filesystem writes, no
credential reads.
"""
from __future__ import annotations

from typing import Any, Mapping, Sequence

from .composer import CandidateFile, RenderedTarget, compose
from .failures import PlanRejected
from .launch_plan import (
    ContinuationPlan, ExecutableMemberPlan, ExecutablePlan, LaunchPlan,
    MountIntent, ObservationContract, RenderedFile, RenderedNativeTarget as PlanRenderedTarget,
    SecretBinding,
)
from .native_guard import bounded_native_payload
from .native_render import render_json, render_toml, render_yaml_via_json
from .observation import FinishProposal, NativeObservationDecoder, Observation, ObservationKind, TerminalCondition
from .staging import plan_home_logical_digest
from .start_context import HarnessStartContext

GUEST_HOME = "/runtime/home"
GUEST_WORKSPACE = "/workspace"
GUEST_PATH_ENV = "/usr/bin:/bin"
_PROFILE_AUTHORITY = "agent-box.profile@1"
_LOCATOR_ATTRS = ("session_locator", "session_id", "thread_id", "session_file", "native_id", "value")


class GenericCliAdapter:
    """Harness-neutral planning mechanics; subclasses own native facts."""

    harness_type = "generic"
    # native home relocation (evidence-backed per harness)
    native_home_env = ""
    native_home_guest = ""
    # rendered native configuration
    config_guest_path = ""
    config_renderer = staticmethod(render_json)
    # directories that must pre-exist in the guest (native hard requirement)
    guest_directories: tuple[str, ...] = ()
    extra_environment: Mapping[str, str] = {}
    # payload key policy: None tolerates unknown keys with native semantics,
    # a frozenset rejects unknown top-level keys (fail closed).
    known_payload_keys: frozenset[str] | None = None
    # executable staging
    executable_staging_policy = "stage-ro"
    executable_warnings: tuple[str, ...] = ()
    # capability truth inputs
    implemented_capabilities: frozenset[str] = frozenset({"start", "observe", "finish", "native_continuation"})
    stream_live_available = False
    continuation_kind = "native_session"
    # credential materialization
    credential_guest_target: str | None = None
    credential_materializer_id: str | None = None
    # bounded, non-secret diagnostics notes surfaced by the provider
    diagnostics_notes: tuple[str, ...] = ()

    def __init__(self, key: str) -> None:
        self.key = key
        self.decoder: NativeObservationDecoder = self._make_decoder()

    # ------------------------------------------------------------------ #
    # native payload validation
    # ------------------------------------------------------------------ #
    def validate_native_payload(self, payload: Any) -> tuple[str, ...]:
        """Validate a native payload; return bounded diagnostics warnings."""
        bounded_native_payload(payload)
        if self.known_payload_keys is not None:
            unknown = sorted(set(str(key) for key in payload) - set(self.known_payload_keys))
            if unknown:
                raise ValueError("NATIVE_PAYLOAD_UNKNOWN_KEYS:" + ",".join(unknown[:8]))
        return self._payload_diagnostics(payload)

    def _payload_diagnostics(self, payload: Mapping[str, Any]) -> tuple[str, ...]:
        return ()

    # ------------------------------------------------------------------ #
    # planning (pure)
    # ------------------------------------------------------------------ #
    def plan(self, context: HarnessStartContext) -> LaunchPlan:
        payload = self._profile_payload(context)
        rendered = compose(self._candidate_files(context, payload))
        plan_rendered = self._plan_rendered_view(rendered, payload)
        # The plan declares ONLY the overlay identity (rendered managed
        # config).  Installed skills live in the Profile Native Home and are
        # part of the view copy; the full home digest is verified by the
        # lowering path against the materialized view.
        home_digest = plan_home_logical_digest(rendered)
        argv = self._plan_argv(context)
        return LaunchPlan(
            harness_type=self.harness_type,
            launch_mode_name=context.launch_mode.name,
            argv=argv,
            cwd_token=GUEST_WORKSPACE,
            environment=self._environment(context),
            io_mode=context.launch_mode.io,
            requires_control_plane_network=True,
            tool_network_requirement="unspecified",
            guest_directories=self.guest_directories,
            mounts=self._mounts(context, home_digest),
            rendered=plan_rendered,
            rendered_content={item.guest_path: item.content for item in rendered.files},
            executable=self._executable_plan(context),
            continuation=self._continuation_plan(context),
            secret_bindings=self._secret_bindings(context),
            observation=self._observation_contract(),
            warnings=self._plan_warnings(context),
        )

    def _profile_payload(self, context: HarnessStartContext) -> Mapping[str, Any]:
        profile = context.profile
        if profile is None:
            return {}
        payload = getattr(profile, "native_payload", None)
        if payload is None:
            return {}
        self.validate_native_payload(payload)
        return payload

    def render_native_config(self, payload: Mapping[str, Any]) -> tuple[CandidateFile, ...]:
        """Pure render of the managed native config candidates (never writes).

        This is the Adapter-owned render port used by the profile store for
        native-home seeding/patching and by the Web projection preview; it
        performs no filesystem I/O and no planning.
        """
        self.validate_native_payload(payload)
        return self._candidate_files(None, payload)

    def _candidate_files(self, context: HarnessStartContext, payload: Mapping[str, Any]) -> tuple[CandidateFile, ...]:
        if not payload or not self.config_guest_path:
            return ()
        return (CandidateFile(
            guest_path=self.config_guest_path,
            content=self.config_renderer(payload),
            semantic_key="profile-config",
            authority=_PROFILE_AUTHORITY,
        ),)

    @staticmethod
    def _plan_rendered_view(rendered: RenderedTarget, payload: Mapping[str, Any]) -> PlanRenderedTarget:
        return PlanRenderedTarget(tuple(
            RenderedFile(item.guest_path, item.digest, item.semantic_key, item.authority, len(item.content))
            for item in rendered.files
        ))

    def _plan_argv(self, context: HarnessStartContext) -> tuple[str, ...]:
        argv = list(context.launch_mode.argv)
        if not argv:
            raise PlanRejected("LAUNCH_MODE_ARGV_EMPTY", self.harness_type)
        argv[0] = context.executable.guest_target()
        locator = self._continuation_locator(context)
        if locator is not None:
            # Mode-aware continuation: an alternative session mode (e.g.
            # OpenCode ACP) may resume through its own protocol and must
            # never receive native argv tokens.
            continuation_argv = self._continuation_argv(locator, mode=context.launch_mode.name)
            if continuation_argv:
                argv = argv[:2] + list(continuation_argv) + argv[2:]
        prompt = context.prompt
        if prompt and not self._prompt_is_protocol(context.launch_mode.name):
            argv.append(prompt)
        return tuple(argv)

    def _prompt_is_protocol(self, mode: str | None = None) -> bool:
        """True when the prompt travels over the session protocol, not argv.

        A protocol mode (e.g. ``acp``) must never receive the user prompt as
        a command-line argument; the driver sends it via ``session/prompt``.
        """
        del mode
        return False

    def _environment(self, context: HarnessStartContext) -> dict[str, str]:
        environment = {
            "HOME": GUEST_HOME,
            "PATH": GUEST_PATH_ENV,
            "AGENT_BOX_EXECUTION_ID": context.execution_id,
        }
        if self.native_home_env and self.native_home_guest:
            environment[self.native_home_env] = self.native_home_guest
        environment.update(self.extra_environment)
        return environment

    def _mounts(self, context: HarnessStartContext, home_digest: str) -> tuple[MountIntent, ...]:
        mounts = [
            MountIntent("workspace", "workspace", context.workspace.source_digest, GUEST_WORKSPACE, "rw", "workspace"),
            MountIntent("profile-home", "profile-home", home_digest, GUEST_HOME, "rw", "profile"),
        ]
        executable = context.executable
        for member in executable.members:
            mounts.append(MountIntent(
                "executable", f"executable:{member.name}", member.digest,
                executable.guest_target(member.name), "ro", "executable",
            ))
        return tuple(mounts)

    def _executable_plan(self, context: HarnessStartContext) -> ExecutablePlan:
        executable = context.executable
        members = tuple(
            ExecutableMemberPlan(member.name, executable.guest_target(member.name), member.digest, f"executable:{member.name}")
            for member in executable.members
        )
        return ExecutablePlan(
            identity=executable.identity,
            staging_policy=self.executable_staging_policy,
            members=members,
            source_digest=executable.digest,
            version=executable.version,
            warnings=tuple((*executable.warnings, *self.executable_warnings)),
        )

    def _continuation_locator(self, context: HarnessStartContext) -> str | None:
        continuation = context.continuation
        if continuation is None:
            return None
        for attribute in _LOCATOR_ATTRS:
            value = getattr(continuation, attribute, None)
            if isinstance(value, str) and value.strip():
                return value.strip()[:256]
        if isinstance(continuation, str) and continuation.strip():
            return continuation.strip()[:256]
        raise PlanRejected("CONTINUATION_LOCATOR_UNEXTRACTABLE", self.harness_type)

    def _continuation_argv(self, locator: str, *, mode: str | None = None) -> tuple[str, ...] | None:
        # Base native continuation; per-Harness subclasses own their argv
        # shape and may opt out per session mode (returning None).
        del mode
        return ("--resume", locator)

    def _continuation_kind(self, mode: str | None = None) -> str:
        del mode
        return self.continuation_kind

    def _continuation_plan(self, context: HarnessStartContext) -> ContinuationPlan | None:
        locator = self._continuation_locator(context)
        if locator is None:
            return None
        return ContinuationPlan(
            self._continuation_kind(context.launch_mode.name), locator,
            self._continuation_argv(locator, mode=context.launch_mode.name) or (),
        )

    def _secret_bindings(self, context: HarnessStartContext) -> tuple[SecretBinding, ...]:
        if context.credential_ref is None:
            return ()
        if not self.credential_guest_target or not self.credential_materializer_id:
            raise PlanRejected("CREDENTIAL_MATERIALIZER_UNDECLARED", self.harness_type)
        return (SecretBinding(
            guest_target=self.credential_guest_target,
            locator=context.credential_ref.native_locator,
            materializer_id=self.credential_materializer_id,
        ),)

    def _observation_contract(self) -> ObservationContract:
        return ObservationContract(decoder_id=self.decoder.id, stdout_events=True)

    def _plan_warnings(self, context: HarnessStartContext) -> tuple[str, ...]:
        warnings: list[str] = []
        if context.prompt.startswith("-"):
            warnings.append("PROMPT_LEADING_DASH")
        return tuple(warnings)

    # ------------------------------------------------------------------ #
    # observation decoding (pure)
    # ------------------------------------------------------------------ #
    def _make_decoder(self) -> NativeObservationDecoder:
        return NativeObservationDecoder()

    def decode_native_events(self, lines: Sequence[str]) -> tuple[Observation, ...]:
        return self.decoder.decode_stream(lines)

    def decode_native_document(self, payload: Mapping[str, Any]) -> tuple[Observation, ...]:
        return self.decoder.decode_document(payload)

    def terminal_observation(self, observations: Sequence[Observation], *, exit_code: int | None) -> Observation:
        for observation in reversed(observations):
            if observation.kind is ObservationKind.TERMINAL:
                return observation
        if exit_code is None:
            return Observation(ObservationKind.TERMINAL, self.harness_type, terminal_condition=TerminalCondition.UNKNOWN)
        failed = exit_code != 0
        return Observation(
            ObservationKind.TERMINAL, self.harness_type,
            terminal_condition=TerminalCondition.PROCESS_EXIT, is_error=failed,
            warnings=("TERMINAL_FROM_PROCESS_EXIT",),
        )

    def finish_proposal(
        self, *, execution_id: str, dispatch_id: str,
        observations: Sequence[Observation], exit_code: int | None,
    ) -> FinishProposal:
        terminal = self.terminal_observation(observations, exit_code=exit_code)
        return FinishProposal(
            execution_id=execution_id, dispatch_id=dispatch_id,
            harness_type=self.harness_type, terminal=terminal, exit_code=exit_code,
        )


__all__ = [
    "GUEST_HOME",
    "GUEST_WORKSPACE",
    "GenericCliAdapter",
    "render_json",
    "render_toml",
    "render_yaml_via_json",
]
