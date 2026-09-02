"""Formal execution provider for one official Harness.

The formal chain is exactly:

    Registry facts -> typed HarnessStartContext -> per-Harness Adapter plan
    (private immutable LaunchPlan) -> semantic composition -> staging
    (single execution-scoped writer) -> lowering (LaunchPlan -> Runtime
    concrete inputs) -> Root Runtime assembler / composition coordinator ->
    spawn.

Capability reporting is honest: declared capabilities are intersected with
adapter implementations and current runtime availability; declared-but-
unimplemented capabilities are ``not_implemented``, never silent no-ops.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Mapping

from agent_box.protocols.runtime import (
    CompositionRejected, StartAmbiguous as RuntimeStartAmbiguous,
    assemble_runtime_composition,
)
from agent_box.work_core import (
    ExecutionStartReceipt, ExecutionStartRequest, ProviderDescriptor, Ref, RefType,
)

from ..adapters.failures import (
    LaunchStageError, MaterializationFailed, PlanRejected, StartAmbiguous, StartRejected,
    FinishNotTerminal,
)
from ..adapters.launch_plan import LaunchPlan
from ..adapters.lowering import lower
from ..adapters.observation import MAX_EVENTS, Observation, ObservationKind
from ..adapters.staging import ExecutionStagingArea, StagedHome, home_relative_path
from ..adapters.start_context import build_start_context
from ..native_home.failures import (
    NATIVE_HOME_RECONCILE_AMBIGUOUS,
    NATIVE_HOME_VIEW_PREPARE_FAILED,
    NativeHomeError,
    ProfileNativeHomeError,
)
from ..native_home.view import FrozenProfileSnapshot, NativeHomeView, ReconcileReport
from ..resources.executable import ResolvedExecutable, resolve_executable


_MAX_OUTPUT_CHARS = 1_000_000


@dataclass
class GenericHandle:
    request: object
    runtime: object
    command: object
    plan: LaunchPlan
    staged_home: StagedHome | None
    execution_id: str
    dispatch_id: str
    submitted: bool = False
    # Optional bound HarnessSessionDriver (attach is explicit; the legacy
    # observe/finish path is unchanged while no driver is attached).
    session_driver: object | None = None
    # Execution-scoped view of a Profile Native Home (profile-based launches).
    view: NativeHomeView | None = None
    expected_generation: int | None = None
    reconcile_report: ReconcileReport | None = None


class CapabilityState(str, Enum):
    """Effective capability truth states (determined adjudication 9)."""

    IMPLEMENTED = "implemented"
    AVAILABLE = "available"
    UNAVAILABLE = "unavailable"
    NOT_IMPLEMENTED = "not_implemented"


_MAX_OUTPUT_CHARS = 1_000_000


class GenericExecutionProvider:
    def __init__(self, definition, adapter, *, staging_root=None, executable_resolver=None,
                 credential_materializer=None, profile_store=None) -> None:
        self.definition = definition
        self.adapter = adapter
        self.provider_id = f"{definition.harness_type}-execution"
        self._handles: dict[str, GenericHandle] = {}
        self._staging_root = staging_root
        self._executable_resolver = executable_resolver
        self._materializer = credential_materializer
        self._profile_store = profile_store
        self._executable: ResolvedExecutable | None = None
        self._executable_error: str | None = None
        self._acp_probe: tuple[bool, str] | None = None

    # ------------------------------------------------------------------ #
    # registry surface
    # ------------------------------------------------------------------ #
    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(self.provider_id, self.definition.display_name + " execution", self.definition.identity.version)

    def input_limits(self) -> Mapping[str, tuple[int, int | None]]:
        return {item.contract_id: (item.minimum, item.maximum) for item in self.definition.inputs}

    # ------------------------------------------------------------------ #
    # effective capability truth
    # ------------------------------------------------------------------ #
    def _resolve_executable(self) -> ResolvedExecutable | None:
        if self._executable is None and self._executable_error is None:
            resolver = self._executable_resolver or resolve_executable
            try:
                self._executable = resolver(self.definition.executable)
            except Exception as exc:  # bounded diagnostic, no host details
                self._executable_error = type(exc).__name__ + ":" + str(exc)[:120]
        return self._executable

    def capability_truth(self) -> Mapping[str, tuple[CapabilityState, str]]:
        """Effective Capability = Registry declared ∩ Adapter implemented ∩ Runtime available."""
        implemented = set(self.adapter.implemented_capabilities)
        executable = self._resolve_executable()
        # Only these two capabilities depend on the current environment; every
        # other implemented capability is availability-neutral by default.
        availability = {
            "start": executable is not None and executable.available,
            "stream": bool(getattr(self.adapter, "stream_live_available", False)),
        }
        truth: dict[str, tuple[CapabilityState, str]] = {}
        for key in sorted(self.definition.capabilities):
            if key not in implemented:
                truth[key] = (CapabilityState.NOT_IMPLEMENTED, "declared by the registry but not implemented by the adapter")
            elif not availability.get(key, True):
                if key == "start":
                    truth[key] = (CapabilityState.UNAVAILABLE, "executable resolution or version probe failed: " + (self._executable_error or "unknown"))
                elif key == "stream":
                    truth[key] = (CapabilityState.UNAVAILABLE, "decoder exists but no live stdout pump is wired")
                else:
                    truth[key] = (CapabilityState.UNAVAILABLE, "current runtime capability is missing")
            else:
                truth[key] = (CapabilityState.AVAILABLE, "implemented and currently available")
        for key in sorted(implemented - set(self.definition.capabilities)):
            truth[key] = (CapabilityState.IMPLEMENTED, "implemented by the adapter but not declared by the registry")
        return truth

    def capabilities(self) -> Mapping[str, str]:
        exposed = {"available": "supported", "implemented": "supported"}
        return {key: exposed.get(state.value, state.value) for key, (state, _) in self.capability_truth().items()}

    def diagnostics(self) -> dict[str, object]:
        """Bounded, credential-free readiness diagnostics."""
        executable = self._resolve_executable()
        return {
            "provider_id": self.provider_id,
            "harness_type": self.definition.harness_type,
            "executable": {
                "identity": self.definition.executable.identity,
                "status": "resolved" if executable else "unavailable",
                "version": executable.version if executable else None,
                "warnings": list(executable.warnings) if executable else [],
                "error": self._executable_error,
            },
            "capabilities": {key: {"state": state.value, "detail": detail} for key, (state, detail) in self.capability_truth().items()},
            "session_modes": dict(self.session_mode_truth()),
            "notes": list(getattr(self.adapter, "diagnostics_notes", ())),
        }

    # ------------------------------------------------------------------ #
    # formal launch chain
    # ------------------------------------------------------------------ #
    def start(self, request: ExecutionStartRequest) -> ExecutionStartReceipt:
        default_mode = getattr(self.adapter, "default_session_mode", "exec")
        return self.start_mode(request, launch_mode=default_mode)

    def start_mode(self, request: ExecutionStartRequest, launch_mode: str) -> ExecutionStartReceipt:
        """Explicit launch-mode start; the mode must be registry-declared.

        There is no implicit first-mode fallback: an undeclared mode is a
        PLAN_REJECTED, and an ACP driver failure never silently falls back
        to native inside the same attempt.
        """
        if not isinstance(launch_mode, str) or not launch_mode:
            raise PlanRejected("LAUNCH_MODE_INVALID", str(launch_mode)[:128])
        mode_definition = next((mode for mode in self.definition.launch_modes if mode.name == launch_mode), None)
        if mode_definition is None:
            raise PlanRejected("LAUNCH_MODE_UNDECLARED", launch_mode)
        # Dispatch-level replay guard: the coordinator ledger replays by
        # attempt key, but staging must never re-materialize for a dispatch
        # that already started.  Identical inputs return the same handle;
        # changed inputs for a consumed dispatch are rejected fail closed.
        prior = self._handles.get(request.dispatch_id)
        if prior is not None:
            if prior.request.execution_id == request.execution_id and prior.request.inputs_digest == request.inputs_digest:
                return ExecutionStartReceipt(
                    request.execution_id, request.dispatch_id, request.inputs_digest,
                    correlation_ref=Ref(RefType.SESSION, self.provider_id, request.execution_id),
                    runtime_handle=prior,
                )
            raise StartRejected("DISPATCH_REPLAY_INPUT_MISMATCH", request.dispatch_id)

        executable = self._resolve_executable()
        if executable is None:
            raise PlanRejected("EXECUTABLE_UNAVAILABLE", self._executable_error or "")
        try:
            context = build_start_context(
                self.definition, request, executable=executable,
                preferred_launch_mode=launch_mode,
            )
            plan = self.adapter.plan(context)
        except LaunchStageError:
            raise
        except Exception as exc:
            raise PlanRejected("PLAN_INVALID", _bounded(exc)) from exc

        try:
            if self._staging_root is None:
                raise MaterializationFailed("STAGING_ROOT_UNDECLARED")
            staged, view, expected_generation = self._materialize_home(plan, context, request.execution_id)
        except LaunchStageError:
            raise
        except ProfileNativeHomeError as exc:
            raise MaterializationFailed(NATIVE_HOME_VIEW_PREPARE_FAILED, exc.code) from exc
        except NativeHomeError as exc:
            raise MaterializationFailed(NATIVE_HOME_VIEW_PREPARE_FAILED, exc.code) from exc
        except Exception as exc:
            raise MaterializationFailed("MATERIALIZATION_INVALID", _bounded(exc)) from exc

        try:
            secret_mounts = self._prepare_secret_mounts(plan, context, request)
        except LaunchStageError:
            if view is not None:
                view.discard()
            raise
        except Exception as exc:
            if view is not None:
                view.discard()
            raise PlanRejected("CREDENTIAL_BINDING_INVALID", _bounded(exc)) from exc

        sources = {
            "workspace": context.workspace.path,
            "profile-home": view if view is not None else staged,
            **{f"executable:{member.name}": member.path for member in executable.members},
        }
        try:
            lowered = lower(plan, sources=sources, secret_mounts=secret_mounts)
        except LaunchStageError:
            if view is not None:
                view.discard()
            raise
        except Exception as exc:
            if view is not None:
                view.discard()
            raise MaterializationFailed("LOWERING_INVALID", _bounded(exc)) from exc

        try:
            binding, coordinator = assemble_runtime_composition(request, lowered.command, secret_mounts=lowered.secret_mounts)
            runtime_handle = coordinator.start(binding, lowered.command, execution_id=request.execution_id, dispatch_id=request.dispatch_id)
        except (StartAmbiguous, StartRejected):
            # A never-started attempt leaves no harness state to reconcile;
            # release the execution-scoped view so the profile stays mutable.
            if view is not None:
                view.discard()
            raise
        except RuntimeStartAmbiguous as exc:
            if view is not None:
                view.discard()
            raise StartAmbiguous("RUNTIME_START_AMBIGUOUS", _bounded(exc)) from exc
        except CompositionRejected as exc:
            if view is not None:
                view.discard()
            raise StartRejected(exc.code.value, _bounded(exc)) from exc
        except Exception as exc:
            if view is not None:
                view.discard()
            raise StartRejected("ASSEMBLY_REJECTED", _bounded(exc)) from exc

        handle = GenericHandle(
            request=request, runtime=runtime_handle, command=lowered.command, plan=plan,
            staged_home=staged, execution_id=request.execution_id, dispatch_id=request.dispatch_id,
            view=view, expected_generation=expected_generation,
        )
        self._handles[request.dispatch_id] = handle
        return ExecutionStartReceipt(
            request.execution_id, request.dispatch_id, request.inputs_digest,
            correlation_ref=Ref(RefType.SESSION, self.provider_id, request.execution_id),
            runtime_handle=handle,
        )

    def _materialize_home(self, plan: LaunchPlan, context, execution_id: str) -> tuple[StagedHome | None, NativeHomeView | None, int | None]:
        """One materialization path per launch.

        With a resolved Profile the execution home is a policy-governed copy
        of the Profile Native Home plus the plan's declared overlays
        (managed config render); without one, the rendered files are staged
        into a fresh execution-scoped home (legacy empty-home semantics).
        """
        profile = context.profile
        if profile is not None and self._profile_store is not None:
            harness_type = context.harness_type
            profile_id = getattr(profile, "profile_id", "") or profile.name
            layout = self._profile_store.layout(harness_type, profile_id)
            policy = self._profile_store.policy(harness_type)
            view = NativeHomeView(layout, policy, execution_id=execution_id, staging_root=self._staging_root,
                                  profile_store=self._profile_store)
            overlays = [
                (home_relative_path(item.guest_path), plan.rendered_content[item.guest_path])
                for item in plan.rendered.files
            ]
            frozen = FrozenProfileSnapshot(harness_type, profile_id, int(profile.revision), profile.digest)
            view.prepare(overlays=overlays, frozen=frozen)
            return None, view, view.expected_generation()
        staging = ExecutionStagingArea(self._staging_root, execution_id)
        staged = staging.materialize(plan.rendered_target())
        return staged, None, None

    def _prepare_secret_mounts(self, plan: LaunchPlan, context, request) -> tuple[Any, ...]:
        if not plan.secret_bindings:
            return ()
        if self._materializer is None or context.credential_ref is None:
            raise PlanRejected("CREDENTIAL_MATERIALIZER_UNAVAILABLE", self.definition.harness_type)
        binding = plan.secret_bindings[0]
        if context.credential_ref.native_locator != binding.locator:
            raise PlanRejected("CREDENTIAL_BINDING_MISMATCH", self.definition.harness_type)
        prepared = self._materializer.prepare_mount(
            context.credential_ref, f"execution:{request.execution_id}", binding.guest_target, "ro",
        )
        bind = getattr(self._materializer, "bind_to_sandbox", None)
        if callable(bind):
            bind(prepared, context.sandbox.port)
        return (prepared,)

    def get_handle(self, dispatch_id: str) -> GenericHandle:
        return self._handles[dispatch_id]

    # ------------------------------------------------------------------ #
    # session driver surface (attach is explicit; legacy path unchanged)
    # ------------------------------------------------------------------ #
    def attach_session_driver(self, dispatch_id: str) -> object:
        """Bind the declared session driver for this dispatch's launch mode."""
        from ..session.registry import ensure_session_drivers
        from ..session.spi import SessionDriverBindOptions

        handle = self._handles.get(dispatch_id)
        if handle is None:
            raise KeyError(dispatch_id)
        if handle.session_driver is not None:
            return handle.session_driver
        mode = handle.plan.launch_mode_name
        ensure_session_drivers()
        from ..session import session_driver_factory

        factory = session_driver_factory(self.definition.harness_type, mode)
        driver = factory(self.adapter, self.definition)
        continuation = handle.plan.continuation
        options = SessionDriverBindOptions(
            continuation_locator=continuation.session_locator if continuation is not None else None,
            prompt=_driver_prompt(handle.request),
        )
        driver.bind(handle, options=options)
        handle.session_driver = driver
        return driver

    def session_driver(self, dispatch_id: str) -> object:
        """Return the bound driver; raises KeyError when not attached."""
        handle = self._handles.get(dispatch_id)
        if handle is None or handle.session_driver is None:
            raise KeyError(dispatch_id)
        return handle.session_driver

    def session_mode_truth(self) -> Mapping[str, Mapping[str, object]]:
        """Per-launch-mode four-state truth with bounded reasons.

        A mode is AVAILABLE only when its driver factory exists, the
        executable is resolved, and (for ACP) the generic engine is
        installed AND the binary passes the offline ``acp`` probe.
        """
        from ..session.registry import ensure_session_drivers

        ensure_session_drivers()
        executable = self._resolve_executable()
        out: dict[str, Mapping[str, object]] = {}
        for mode in self.definition.launch_modes:
            entry: dict[str, object] = {"mode": mode.name}
            try:
                from ..session import session_driver_factory

                session_driver_factory(self.definition.harness_type, mode.name)
            except Exception as exc:
                entry["state"] = "not_implemented"
                entry["reason"] = "no registered session driver: " + str(exc)[:200]
                out[mode.name] = entry
                continue
            if executable is None or not getattr(executable, "available", True):
                entry["state"] = "unavailable"
                entry["reason"] = (self._executable_error or "executable resolution failed")[:256]
                out[mode.name] = entry
                continue
            if mode.name == "acp":
                state, reason = self._acp_mode_availability(executable)
                entry["state"] = state
                entry["reason"] = reason
            else:
                entry["state"] = "available"
                entry["reason"] = "native mode ready"
            out[mode.name] = entry
        return out

    def _acp_mode_availability(self, executable) -> tuple[str, str]:
        if not _acp_engine_available():
            return "unavailable", "agent-box-acp engine is not installed"
        if self._acp_probe is None:
            from ..opencode.acp import probe_acp_command

            path = getattr(executable, "source_path", None)
            ok, detail = probe_acp_command(str(path)) if path else (False, "no executable path")
            self._acp_probe = (ok, detail)
        ok, detail = self._acp_probe
        if not ok:
            return "unavailable", f"ACP subcommand probe failed: {detail}"[:256]
        return "available", f"ACP subcommand probed: {detail}"[:256]

    def session_modes(self) -> tuple[str, ...]:
        return tuple(mode.name for mode in self.definition.launch_modes)

    # ------------------------------------------------------------------ #
    # observation and finish boundary
    # ------------------------------------------------------------------ #
    def observe(self, handle: GenericHandle) -> tuple[Observation, ...]:
        if handle.session_driver is not None:
            handle.session_driver.poll(timeout=0.0)
            return tuple(item.observation for item in handle.session_driver.hub.all())
        lines, exit_code, exited = _collect_output(handle)
        observations = list(self.adapter.decode_native_events(lines))
        for artifact in handle.plan.observation.artifacts:
            document = _read_staged_document(handle, artifact)
            if document is not None:
                observations.extend(self.adapter.decode_native_document(document))
        if exited:
            observations.append(self.adapter.terminal_observation(tuple(observations), exit_code=exit_code))
        else:
            observations.append(Observation(ObservationKind.LIFECYCLE, self.definition.harness_type, text="running"))
        return tuple(observations)

    def finish(self, handle: GenericHandle) -> Any:
        """Produce a terminal Observation and a FinishProposal.

        Terminal invariant (frozen): finish() is only legal on a TERMINAL
        process/session — a native process that has exited (``poll()``
        returned an exit code) or a session driver whose ObservationHub
        already saw a native terminal event.  While the process is still
        running the call raises typed ``FinishNotTerminal`` (FINISH_
        NOT_TERMINAL): no reconcile, no discard, no fabricated terminal
        Observation, and the execution-scoped view stays in place for the
        Host to decide.  Terminal-once and reconcile-once are preserved.

        A process exit is never Finish: the proposal carries
        ``decision_owner="host"`` and the Host/upper policy layer decides
        whether Work Core Finish is invoked.  Driver-bound handles keep the
        same adapter-owned FinishProposal boundary (the driver never calls
        Finish itself).  Normal completion reconciles the Profile Native
        Home inside one lease-held transaction; ambiguous/failed states keep
        a recovery view and never write back uncertain content.
        """
        if handle.session_driver is not None:
            handle.session_driver.poll(timeout=0.0)
            observations = tuple(item.observation for item in handle.session_driver.hub.all())
            _, exit_code, exited = _collect_output(handle)
            if not handle.session_driver.hub.terminal_seen and not exited:
                raise FinishNotTerminal("session still running")
        else:
            observations = self.observe(handle)
            _, exit_code, exited = _collect_output(handle)
            if not exited:
                raise FinishNotTerminal("process still running")
        self._reconcile_view(handle)
        proposal = self.adapter.finish_proposal(
            execution_id=handle.execution_id, dispatch_id=handle.dispatch_id,
            observations=observations, exit_code=exit_code,
        )
        if not handle.submitted:
            handle.submitted = True
        return proposal

    def _reconcile_view(self, handle: GenericHandle) -> None:
        """Reconcile the execution view exactly once per dispatch.

        The view itself runs the whole reconcile as one lease-held
        transaction (decision -> copy-back with backup -> persistent home
        digest -> generation CAS -> pointer commit).  Here we only map the
        outcome: ok -> discard the view; ambiguous/failed -> preserve the
        view under recovery/ with a typed status, never writing back
        uncertain content.
        """
        view = handle.view
        if view is None or handle.reconcile_report is not None:
            return
        harness_type = view.layout.harness_type
        profile_id = view.layout.profile_id
        try:
            report = view.reconcile(expected_generation=handle.expected_generation)
            handle.reconcile_report = report
            if report.status == "ok":
                view.discard()
            else:
                if self._profile_store is not None:
                    self._profile_store.mark_recovery(harness_type, profile_id)
                view.preserve_recovery()
        except ProfileNativeHomeError as exc:
            handle.reconcile_report = ReconcileReport("failed", exc.code, detail=exc.args[0][:256])
            try:
                if self._profile_store is not None:
                    self._profile_store.mark_recovery(harness_type, profile_id)
                view.preserve_recovery()
            except Exception:
                pass
        except Exception as exc:
            handle.reconcile_report = ReconcileReport("failed", NATIVE_HOME_RECONCILE_FAILED, detail=type(exc).__name__[:256])
            try:
                view.preserve_recovery()
            except Exception:
                pass


def _collect_output(handle: GenericHandle) -> tuple[tuple[str, ...], int | None, bool]:
    """Bounded post-exit stdout drain; never blocks a live process."""
    transport = getattr(handle.runtime, "transport", None)
    poll = getattr(transport, "poll", None)
    if not callable(poll):
        return (), None, False
    exit_code = poll()
    if exit_code is None:
        return (), None, False
    stream = getattr(transport, "stdout", None)
    lines: tuple[str, ...] = ()
    if stream is not None:
        try:
            text = stream.read(_MAX_OUTPUT_CHARS)
            if isinstance(text, bytes):
                text = text.decode("utf-8", errors="replace")
            lines = tuple(text.splitlines())[:MAX_EVENTS]
        except (OSError, ValueError):
            lines = ()
    return lines, exit_code, True


def _read_staged_document(handle: GenericHandle, artifact: str):
    """Read one bounded observation artifact through the execution bind."""
    staged = handle.staged_home
    if staged is None or not artifact.startswith("/runtime/home/"):
        return None
    import json
    relative = artifact.removeprefix("/runtime/home/").removeprefix("/")
    target = staged.root / relative
    try:
        if target.is_symlink() or not target.is_file():
            return None
        text = target.read_text(encoding="utf-8")[:_MAX_OUTPUT_CHARS]
        document = json.loads(text)
    except (OSError, ValueError):
        return None
    return document if isinstance(document, dict) else None


def _bounded(exc: Exception) -> str:
    return (type(exc).__name__ + ":" + str(exc))[:200]


def _acp_engine_available() -> bool:
    try:
        import agent_box_acp  # noqa: F401

        return True
    except Exception:
        return False


def _driver_prompt(request: object) -> str:
    """Extract the bounded protocol prompt from resolved PromptFragments."""
    from agent_box.resource_contracts import PromptFragmentV1

    fragments = [item.value for item in getattr(request, "resolved_inputs", ())
                 if getattr(item, "contract_id", "") == PromptFragmentV1.contract_id]
    text = "\n\n".join(getattr(fragment, "content", "") for fragment in fragments)
    return text[:262144]


__all__ = [
    "CapabilityState",
    "GenericExecutionProvider",
    "GenericHandle",
]
