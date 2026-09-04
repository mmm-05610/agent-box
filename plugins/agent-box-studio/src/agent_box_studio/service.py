"""Studio application service: the production Turn transaction vertical.

The orchestrator is brand-free: it selects exactly the ExecutionProvider the
client requested (by provider id, or by harness type through the provider's
generic identity surface), verifies capability truth, freezes a full
BindingSnapshot, and drives the durable Turn Run transaction:

    lease → baseline → begin-turn saga (durable before HTTP 202)
    → dispatch intent journal → Work Core dispatch (freeze/resolve/start)
    → observation loop → durable session events → execution terminal
    → Work Core atomic finalization → live workspace after-observation
    → terminal-once outcome → commit turn + watermark advance → lease release

Every step before an irreversible side effect is journaled in the Session
Store's run-transaction table; a restarted process reconciles unfinished
runs from that journal plus the real Work Core authority.  Dispatch
ambiguity never becomes a fabricated FAILED: the run moves to
RECOVERY_REQUIRED with its dispatch identity preserved.
"""
from __future__ import annotations

import hashlib
import json
import logging
import queue
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Mapping, Optional

from agent_box.protocols.session import (
    SESSION_TURN_INPUT_CONTRACT_ID,
    BindingSnapshot,
    SessionCapabilityUnavailable,
    SessionCreationRequest,
    SessionError,
    TurnBeginRequest,
    TurnState,
)
from agent_box.protocols.session.contracts import TerminalOutcome, TurnRunPhase
from agent_box.protocols.session.store import TurnRunView
from agent_box.protocols.session.failures import (
    ExecutionFactConflict,
    RecoveryRequired,
)
from agent_box.protocols.session.store import SessionStore
from agent_box.resource_contracts import (
    AgentBoxProfileV1,
    CredentialRefV1,
    LaunchSelectionV1,
    PromptFragmentV1,
    WorkspaceV1,
)
from agent_box.work_core.errors import (
    DispatchAmbiguous,
    DispatchFailed,
    WorkCoreError,
)
from agent_box.work_core.models import Ref, RefType
from agent_box.work_core.projection import ExecutionProjection, Freshness, Outcome, Phase
from agent_box.work_core.repository import CoreRepository
from agent_box.work_core.resource_observations import (
    ResourceObservation,
    ResourceObservationCoverage,
    ResourceObservationKind,
    ResourceObservationResult,
    ResourceObserverRole,
)
from agent_box.work_core.services import ExecutionService
from agent_box.work_core.finalization import ExecutionFinalizationRequest
from agent_box.work_core.registry import ExtensionRegistry

from .refs import live_workspace_provider_id

logger = logging.getLogger("agent_box_studio.service")

SERVICE_NAME = "agent-box-studio"
TURN_OWNER_PREFIX = "studio-turn-"

RUNTIME_HOST_CONTRACT_ID = "agent-box.runtime-host@1"
SANDBOX_CONTRACT_ID = "agent-box.sandbox@1"
TERMINAL_SESSION_CONTRACT_ID = "agent-box.terminal-session@1"

# Auditable default rule for omitted selections: the terminal contract has
# two registered providers, so an explicit auditable default is required
# (direct stdio, no tmux dependency).  Component ids — never harness names.
DEFAULT_TERMINAL_PROVIDER_ID = "direct-stdio"
# The sandbox template used when the client omits a sandbox selection: the
# network-capable template of the registered sandbox, because every official
# harness declares runtime.network=required and the sandbox wrap gate fails
# closed on a none-network sandbox for those launches.
DEFAULT_SANDBOX_TEMPLATE = "bwrap-cloud-harness"

_CANCEL_PROOF_TIMEOUT_SECONDS = 10.0


def _terminal_work_core_ref(native_ref: Any) -> Ref:
    """Convert a native terminal-session Ref into the Work Core Ref shape.

    The terminal provider's registry resolution reads the exact session
    identity (digest + affinity) from the Ref metadata.
    """
    metadata = getattr(native_ref, "metadata", None) or {}
    session_digest = (
        getattr(native_ref, "session_digest", None) or metadata.get("session_digest", "")
    )
    ref_affinity = (
        getattr(native_ref, "affinity", None) or metadata.get("affinity", "")
    )
    return Ref(
        RefType.ARTIFACT,
        native_ref.provider,
        native_ref.native_id,
        metadata={"session_digest": str(session_digest), "affinity": str(ref_affinity)},
    )

# Public observation event vocabulary (B6).  Bounded, redacted payloads;
# large native objects stay behind the observation envelope.
_EVENT_MESSAGE = "assistant.message"
_EVENT_TOOL_REQUEST = "tool.requested"
_EVENT_TOOL_RESULT = "tool.output"
_EVENT_PERMISSION = "permission.requested"
_EVENT_USAGE = "usage.updated"
_EVENT_SESSION = "execution.session"
_EVENT_PROGRESS = "execution.progress"
_EVENT_COMPLETED = "execution.completed"
_EVENT_FAILED = "execution.failed"
_EVENT_UNKNOWN = "execution.observation.unknown"

_LEGACY_EVENT_MAP = {
    "TURN_MESSAGE": _EVENT_MESSAGE,
    "WORKSPACE_FACT": "workspace.observation",
    "TURN_RESULT": "turn.result",
}

_TERMINAL_EXIT_GRACE_SECONDS = 5.0


class ProviderSelectionError(SessionError):
    """Exact provider selection failed closed (unknown, duplicate, or
    incompatible with the request)."""


class LaunchSelectionError(SessionError):
    """The requested launch mode or runtime selection is not offered by the
    selected provider."""


class BindingVerificationError(SessionError):
    """A requested binding fact contradicts the frozen authority."""


class CrossHarnessContinuationUnsupported(SessionError):
    """Continuing from an Execution of a DIFFERENT Harness is rejected
    fail-closed: cross-Harness history translation does not exist in this
    phase and is never simulated (no handoff, no summary, no re-wrapping)."""


class _TurnRunControl:
    """In-process control facts of one live run (never the authority).

    The durable authority is the Session Store run-transaction journal plus
    the Work Core dispatch receipt; this object only lets the API and the
    worker talk about the same live attempt (cancel flags, live handle).
    """

    __slots__ = (
        "session_id", "turn_id", "execution_id", "idempotency_key",
        "owner_id", "lease", "provider", "dispatch_id", "receipt",
        "cancel_requested", "cancel_reason", "terminal_seen", "done",
        "driver_bound",
    )

    def __init__(self, session_id, turn_id, execution_id, idempotency_key, owner_id, lease, provider):
        self.session_id = session_id
        self.turn_id = turn_id
        self.execution_id = execution_id
        self.idempotency_key = idempotency_key
        self.owner_id = owner_id
        self.lease = lease
        self.provider = provider
        self.dispatch_id: Optional[str] = None
        self.receipt: Any = None
        self.cancel_requested = False
        self.cancel_reason = ""
        self.terminal_seen = False
        self.done = threading.Event()
        self.driver_bound = False


class StudioService:
    def __init__(
        self,
        store: SessionStore,
        workspace: Any,
        registry: ExtensionRegistry,
        repository: CoreRepository,
        *,
        on_event: Optional[Any] = None,
        worker_mode: str = "thread",
        poll_interval: float = 0.1,
        turn_timeout_seconds: float = 600.0,
        permission_timeout_seconds: float = 300.0,
    ) -> None:
        if worker_mode not in ("thread", "inline"):
            raise ValueError("worker_mode must be 'thread' or 'inline'")
        self._store = store
        self._workspace = workspace
        self._registry = registry
        self._repository = repository
        self._execution_service = ExecutionService(repository)
        self._on_event = on_event
        self._worker_mode = worker_mode
        self._poll_interval = poll_interval
        self._turn_timeout_seconds = turn_timeout_seconds
        self._permission_timeout_seconds = permission_timeout_seconds
        self._runs: dict[str, _TurnRunControl] = {}
        self._runs_lock = threading.Lock()
        self._queue: "queue.Queue[_TurnRunControl]" = queue.Queue()
        self._worker_thread: Optional[threading.Thread] = None
        self._shutdown = threading.Event()

    # -- lifecycle -------------------------------------------------------------

    def start_worker(self) -> None:
        """Start the single-process background worker (durable queue: the
        Session Store journal; the in-memory queue is only a work signal)."""
        if self._worker_mode != "thread" or self._worker_thread is not None:
            return
        self._shutdown.clear()
        self._worker_thread = threading.Thread(
            target=self._worker_loop, name="studio-turn-worker", daemon=True
        )
        self._worker_thread.start()

    def stop_worker(self, timeout: float = 5.0) -> None:
        self._shutdown.set()
        thread = self._worker_thread
        if thread is not None:
            thread.join(timeout=timeout)
            self._worker_thread = None

    def _notify(self, session_id: str) -> None:
        if self._on_event is not None:
            self._on_event(session_id)

    # -- bootstrap / capabilities -------------------------------------------

    def _providers(self) -> tuple[Any, ...]:
        return tuple(self._registry.execution_providers())

    def _select_provider(
        self,
        *,
        execution_provider_id: Optional[str],
        harness_type: Optional[str],
    ) -> Any:
        """Exact provider selection — never "first provider that fits".

        - an explicit provider id must resolve and (when a harness type is
          also requested) match that harness;
        - a harness type alone must match exactly one provider;
        - with neither given, exactly one provider may declare the
          session-turn execution capability (offline/vertical environments);
          production multi-provider deployments must select explicitly.
        - the selected provider's start capability must be honestly READY.
        """
        if execution_provider_id:
            try:
                provider = self._registry.get(execution_provider_id)
            except ValueError as exc:
                raise ProviderSelectionError(
                    f"unknown execution provider: {execution_provider_id}"
                ) from exc
            provider_harness = getattr(provider, "harness_type", None)
            if harness_type and provider_harness != harness_type:
                raise ProviderSelectionError(
                    "selected provider does not serve the requested harness type"
                )
        elif harness_type:
            matches = [
                p for p in self._providers()
                if getattr(p, "harness_type", None) == harness_type
            ]
            if not matches:
                raise ProviderSelectionError(
                    f"no execution provider serves harness type: {harness_type}"
                )
            if len(matches) > 1:
                raise ProviderSelectionError(
                    f"multiple execution providers serve harness type: {harness_type}"
                )
            provider = matches[0]
        else:
            candidates = [
                p for p in self._providers()
                if p.capabilities().get("session_turn_execution") == "supported"
            ]
            if len(candidates) != 1:
                raise ProviderSelectionError(
                    "execution_provider_id or harness_type is required"
                )
            provider = candidates[0]
        start_state = provider.capabilities().get("start")
        if start_state != "supported":
            raise ProviderSelectionError(
                f"selected provider is not READY to start (capability truth: {start_state})"
            )
        return provider

    def _resource_providers_for(self, contract_id: str) -> list[Any]:
        return [
            p for p in self._registry.resource_providers()
            if contract_id in set(getattr(p, "supported_contract_ids", ()) or ())
        ]

    def _make_port_ref(
        self,
        contract_id: str,
        requested: Optional[str],
        *,
        default_provider_id: Optional[str] = None,
        make_ref_kwargs: Optional[Mapping[str, Any]] = None,
    ) -> tuple[Ref, Any]:
        """Resolve one runtime port selection through the Registry.

        Fail closed: an unknown request, a duplicate id, or an ambiguous
        omission (more than one candidate and no auditable default) all
        raise instead of picking an arbitrary provider.
        """
        candidates = self._resource_providers_for(contract_id)
        if requested:
            selected = [p for p in candidates if p.descriptor().id == requested]
            if not selected:
                raise LaunchSelectionError(
                    f"no registered provider serves the requested selection for {contract_id}"
                )
            if len(selected) > 1:
                raise LaunchSelectionError(
                    f"duplicate provider identity for {contract_id}: {requested}"
                )
        elif default_provider_id is not None:
            selected = [p for p in candidates if p.descriptor().id == default_provider_id]
            if not selected:
                raise LaunchSelectionError(
                    f"the auditable default provider for {contract_id} is not registered"
                )
        elif len(candidates) == 1:
            selected = candidates
        elif not candidates:
            raise LaunchSelectionError(
                f"no registered provider serves {contract_id}"
            )
        else:
            raise LaunchSelectionError(
                f"multiple providers serve {contract_id}; an explicit selection is required"
            )
        provider = selected[0]
        make_ref = getattr(provider, "make_ref", None)
        if not callable(make_ref):
            raise LaunchSelectionError(
                f"provider {provider.descriptor().id} cannot issue refs for {contract_id}"
            )
        ref = make_ref(**dict(make_ref_kwargs or {}))
        return ref, provider

    def _sandbox_ref(self, requested: Optional[str], affinity: str, network_required: bool):
        sandbox_providers = self._resource_providers_for(SANDBOX_CONTRACT_ID)
        if requested:
            return self._make_port_ref(
                SANDBOX_CONTRACT_ID, requested, make_ref_kwargs={"host_affinity": affinity}
            )
        # Auditable default: when the harness requires the control-plane
        # network, the sandbox must be a network-capable template; a
        # none-network sandbox would fail closed at wrap time.
        template = DEFAULT_SANDBOX_TEMPLATE if network_required else None
        kwargs: dict[str, Any] = {"host_affinity": affinity}
        if template is not None:
            kwargs["template_id"] = template
        errors: list[str] = []
        for provider in sandbox_providers:
            make_ref = getattr(provider, "make_ref", None)
            if not callable(make_ref):
                continue
            try:
                return make_ref(**kwargs), provider
            except (TypeError, ValueError) as exc:
                errors.append(type(exc).__name__)
        if errors:
            raise LaunchSelectionError(
                f"no registered sandbox provider accepted the required network mode"
            )
        return self._make_port_ref(
            SANDBOX_CONTRACT_ID, None, make_ref_kwargs={"host_affinity": affinity}
        )

    def _resolve_profile(
        self,
        provider: Any,
        profile_id: Optional[str],
        revision: Optional[str],
        digest: Optional[str],
    ) -> tuple[Optional[Ref], Optional[Any]]:
        if profile_id is None:
            return None, None
        profile_providers = self._resource_providers_for(AgentBoxProfileV1.contract_id)
        if len(profile_providers) != 1:
            raise BindingVerificationError(
                "exactly one profile authority must be registered to select profiles"
            )
        store = profile_providers[0]
        ref_factory = getattr(store, "ref", None)
        if not callable(ref_factory):
            raise BindingVerificationError("the profile authority cannot issue profile refs")
        harness_type = getattr(provider, "harness_type", None)
        if not harness_type:
            raise BindingVerificationError("the selected provider does not declare a harness type")
        ref = ref_factory(harness_type, profile_id, revision)
        if digest and str(ref.metadata.get("digest", "")) != digest:
            raise BindingVerificationError(
                "the profile authority's digest differs from the requested digest"
            )
        envelope = store.resolve(AgentBoxProfileV1.contract_id, ref)
        return ref, envelope

    def _continuation_ref(
        self, provider: Any, session_id: str, continue_from_turn_id: Optional[str]
    ) -> tuple[Optional[Ref], Optional[str]]:
        """Resolve the SAME-HARNESS native continuation input and its DAG parent.

        The consumed Ref is EXACTLY the source Execution's persisted
        ``output_native_session_ref`` (set-once, provider-built) — it is
        never re-derived from a transcript locator nor re-wrapped by the
        target provider.  Returns ``(input_session_ref, parent_execution_id)``;
        no translation is performed or implied.
        """
        if continue_from_turn_id is None:
            return None, None
        source_turn = self._store.get_turn(session_id, continue_from_turn_id)
        if source_turn.session_id != session_id:
            raise BindingVerificationError("continuation turn belongs to another session")
        if source_turn.state is not TurnState.COMPLETED:
            raise BindingVerificationError(
                "continuation requires a committed source turn"
            )
        # The ONLY parent authority is the source Turn's committed
        # TurnRunView.execution_id.  Candidate scanning, execution_ids
        # order, linked_at, "last locator" or "only Ref holder" heuristics
        # are forbidden: an uncommitted/failed/stale/post-commit-injected
        # attempt must never become the parent, even when it is the unique
        # output-Ref holder.
        run = self._safe_turn_run(continue_from_turn_id)
        if run is None:
            raise BindingVerificationError(
                "the source turn has no run-transaction journal to prove its "
                "committed execution"
            )
        if run.phase not in (TurnRunPhase.SESSION_COMMITTED, TurnRunPhase.COMPLETED):
            raise BindingVerificationError(
                "the source turn's run is not in a committed final state"
            )
        committed_execution_id = run.execution_id
        if not committed_execution_id:
            raise BindingVerificationError(
                "the committed run does not name its execution"
            )
        if committed_execution_id not in source_turn.execution_ids:
            raise BindingVerificationError(
                "the committed run's execution does not belong to the source turn"
            )
        link = self._store.execution_link(
            session_id, continue_from_turn_id, committed_execution_id
        )
        source_ref = link.output_native_session_ref
        if source_ref is None:
            raise BindingVerificationError(
                "the committed execution recorded no native session output "
                "Ref to continue from"
            )
        if not source_ref.native_id:
            raise BindingVerificationError(
                "the source output Ref carries no native session locator"
            )
        source_execution_id = committed_execution_id
        # Same-Harness enforcement: the consumed Ref must belong to the
        # selected provider's own continuation authority.  Cross-Harness
        # history translation does not exist in this phase and is never
        # simulated by handoff/summary.
        target_provider_id = self._continuation_target_provider(provider)
        if (
            source_ref.provider != target_provider_id
            or str(source_ref.metadata.get("harness_type", "")) != provider.harness_type
        ):
            raise CrossHarnessContinuationUnsupported(
                "the source execution ran on a different harness; cross-Harness "
                "continuation requires the future cross-Harness Session Codec "
                "(Importer/Materializer/Resumer) and is rejected fail-closed"
            )
        return source_ref, source_execution_id

    def _continuation_capability(self, provider: Any) -> Optional[str]:
        """The provider's continuation contract id, honestly probed.

        Requires a callable returning a non-empty contract id — attribute
        existence alone is never enough.
        """
        contract_getter = getattr(provider, "continuation_contract_id", None)
        if not callable(contract_getter):
            return None
        contract = contract_getter()
        return contract if contract else None

    def _continuation_target_provider(self, provider: Any) -> str:
        """The Registry authority that resolves this provider's continuation
        contract — its descriptor id is the only legitimate Ref provider."""
        contract = self._continuation_capability(provider)
        if not contract:
            raise LaunchSelectionError(
                "the selected provider does not declare native continuation"
            )
        resolvers = self._resource_providers_for(contract)
        if len(resolvers) != 1:
            raise LaunchSelectionError(
                "the selected provider's continuation contract has no unique "
                "Registry resolver"
            )
        return resolvers[0].descriptor().id

    def _capability_digest(self, provider: Any) -> str:
        payload = json.dumps(
            {
                "provider": provider.descriptor().id,
                "version": provider.descriptor().version,
                "capabilities": dict(sorted(provider.capabilities().items())),
                "input_limits": {
                    key: list(value) for key, value in sorted(provider.input_limits().items())
                },
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        return "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def capability_truth(self) -> dict[str, Any]:
        providers = []
        session_turn_declared = 0
        for provider in self._providers():
            caps = provider.capabilities()
            if caps.get("session_turn_execution") == "supported":
                session_turn_declared += 1
            detailed_truth = getattr(provider, "capability_truth", None)
            start_state = (
                detailed_truth().get("start", ("unknown", ""))[0]
                if callable(detailed_truth)
                else caps.get("start", "unknown")
            )
            session_modes = getattr(provider, "session_mode_truth", None)
            cancel_truth = getattr(provider, "cancel_truth", None)
            runtime_requirements = getattr(provider, "runtime_requirements", None)
            providers.append(
                {
                    "provider_id": provider.descriptor().id,
                    "harness_type": getattr(provider, "harness_type", None),
                    "version": provider.descriptor().version,
                    "capabilities": dict(sorted(caps.items())),
                    "session_modes": dict(session_modes()) if callable(session_modes) else {},
                    "cancel_truth": dict(cancel_truth()) if callable(cancel_truth) else {},
                    "runtime_requirements": (
                        dict(runtime_requirements()) if callable(runtime_requirements) else {}
                    ),
                    "start_state": start_state,
                }
            )
        execution_state = "READY" if providers else "UNAVAILABLE"
        return {
            "session_store": {
                "state": "READY" if self._store is not None else "UNAVAILABLE",
                "component_id": getattr(self._store, "store_id", None),
            },
            "workspace": {
                "state": "READY" if self._workspace is not None else "UNAVAILABLE",
                "provider_id": live_workspace_provider_id,
                "mode": "live",
                "mutability": "externally_mutable",
            },
            "execution": {
                "state": execution_state,
                "selection": (
                    "exact execution_provider_id or harness_type required; the "
                    "implicit default only exists while exactly one provider "
                    "declares the session-turn capability"
                ),
                "providers": providers,
                "session_turn_capability_providers": session_turn_declared,
            },
            "permissions": {
                "state": "PARTIAL",
                "detail": (
                    "durable request/response ledger; delivery to the harness is "
                    "only possible through a session-driver-bound launch mode; "
                    "headless one-shot modes auto-reject inside the harness"
                ),
            },
            "cancel": {
                "state": "READY",
                "detail": (
                    "durable cancel intent; termination via the session driver or "
                    "runtime transport; outcome proven before CANCELLED is recorded"
                ),
            },
            "compact": {"state": "NOT_IMPLEMENTED", "detail": "cross-harness codec phase"},
        }

    # -- sessions -------------------------------------------------------------

    def create_session(self, *, idempotency_key: str, title: str, project_path: str) -> dict:
        if self._workspace is None:
            raise SessionCapabilityUnavailable("live workspace provider unavailable")
        if not idempotency_key:
            raise SessionError("session creation requires an idempotency key")
        project = self._workspace.register_project(project_path)
        workspace_ref = self._workspace.make_ref(project.project_id)
        session = self._store.create_session(
            SessionCreationRequest(
                idempotency_key=idempotency_key,
                title=title.strip()[:200],
                objective=title.strip()[:200],
                workspace_ref=workspace_ref,
                workspace_mode="live",
                project_identity=project.project_id,
            )
        )
        return {
            "session": session,
            "project_id": project.project_id,
            "workspace_mode": "live",
        }

    def list_sessions(self):
        return self._store.list_sessions()

    def get_session(self, session_id: str):
        return self._store.get_session(session_id)

    def transcript(self, session_id: str, *, after_seq: int = 0):
        return self._store.transcript(session_id, after_seq=after_seq)

    # -- turn submission (202) -------------------------------------------------

    def submit_turn(
        self,
        session_id: str,
        *,
        idempotency_key: str,
        input_text: str,
        execution_provider_id: Optional[str] = None,
        harness_type: Optional[str] = None,
        profile_id: Optional[str] = None,
        profile_revision: Optional[str] = None,
        profile_digest: Optional[str] = None,
        model: Optional[str] = None,
        launch_mode: Optional[str] = None,
        runtime_host: Optional[str] = None,
        sandbox: Optional[str] = None,
        terminal: Optional[str] = None,
        continue_from_turn_id: Optional[str] = None,
    ) -> dict:
        """Freeze the binding, durably create the Turn, and enqueue the run.

        Returns the 202 payload.  The Turn (and its run-transaction journal
        row) is durable before this returns; the worker executes the
        production dispatch chain in the background.
        """
        if self._workspace is None:
            raise SessionCapabilityUnavailable("live workspace provider unavailable")
        session = self._store.get_session(session_id)
        if session.status != "open":
            raise SessionError("session is not open for new turns")

        provider = self._select_provider(
            execution_provider_id=execution_provider_id, harness_type=harness_type
        )
        provider_id = provider.descriptor().id
        provider_version = provider.descriptor().version
        harness = getattr(provider, "harness_type", None) or ""

        # -- freeze runtime port selections (auditable defaults only) --------
        # Only the ports the SELECTED provider actually declares as dispatch
        # inputs are resolved: a provider that consumes no runtime/sandbox/
        # terminal contract (fake/offline verticals) must not depend on
        # those providers being installed.
        provider_limits = provider.input_limits()
        requirements = getattr(provider, "runtime_requirements", None)
        network_required = (
            bool(callable(requirements) and requirements().get("network") == "required")
        )
        host_ref: Optional[Ref] = None
        sandbox_ref: Optional[Ref] = None
        terminal_ref: Optional[Ref] = None
        if RUNTIME_HOST_CONTRACT_ID in provider_limits:
            host_ref, _host_provider = self._make_port_ref(
                RUNTIME_HOST_CONTRACT_ID, runtime_host
            )
            affinity = str(host_ref.metadata.get("affinity", ""))
        else:
            affinity = ""
        if SANDBOX_CONTRACT_ID in provider_limits:
            sandbox_ref, _sandbox_provider = self._sandbox_ref(
                sandbox, affinity, network_required
            )
        if TERMINAL_SESSION_CONTRACT_ID in provider_limits:
            terminal_native_ref, _terminal_provider = self._make_port_ref(
                TERMINAL_SESSION_CONTRACT_ID,
                terminal,
                default_provider_id=DEFAULT_TERMINAL_PROVIDER_ID,
                make_ref_kwargs={"host_affinity": affinity},
            )
            # Terminal refs cross the Work Core dispatch surface as
            # work_core Refs carrying the exact session identity in metadata.
            terminal_ref = _terminal_work_core_ref(terminal_native_ref)
        profile_ref, profile_envelope = self._resolve_profile(
            provider, profile_id, profile_revision, profile_digest
        )

        # -- model truth: the profile owns the model vocabulary --------------
        resolved_model: Optional[str] = None
        if profile_envelope is not None:
            resolved_model = provider.profile_model_selection(profile_envelope)
        if model and resolved_model and model != resolved_model:
            raise BindingVerificationError(
                "the requested model differs from the model declared by the selected profile"
            )
        if model and not resolved_model:
            raise BindingVerificationError(
                "the selected profile declares no model; model selection must come "
                "from the profile (honest absence, no silent passthrough)"
            )

        continuation_ref, parent_execution_id = self._continuation_ref(
            provider, session_id, continue_from_turn_id
        )

        binding = BindingSnapshot(
            session_watermark=self._store.watermark(session_id),
            harness_provider_id=provider_id,
            harness_provider_version=provider_version,
            model_selection=resolved_model,
            profile_ref=profile_ref,
            workspace_ref=session.workspace_ref,
            workspace_mode=session.workspace_mode,
            runtime_host_ref=host_ref,
            sandbox_ref=sandbox_ref,
            capability_digest=self._capability_digest(provider),
            extra={
                "harness_type": harness,
                "launch_mode": launch_mode or "",
                **(
                    {
                        "sandbox_template": sandbox_ref.native_id,
                    }
                    if sandbox_ref is not None
                    else {}
                ),
                **(
                    {
                        "terminal_provider": terminal_ref.provider,
                        "terminal_native_id": terminal_ref.native_id,
                        "terminal_session_digest": str(
                            (terminal_ref.metadata or {}).get("session_digest", "")
                        ),
                        "terminal_affinity": str(
                            (terminal_ref.metadata or {}).get("affinity", "")
                        ),
                    }
                    if terminal_ref is not None
                    else {}
                ),
            },
        )

        # Exact replay first: a committed/replayed turn returns its durable
        # result without taking the lease or re-running anything.
        owner = f"{TURN_OWNER_PREFIX}{uuid.uuid4().hex[:12]}"
        lease = self._store.acquire_writer_lease(session_id, owner)
        try:
            result = self._store.begin_turn(
                TurnBeginRequest(
                    session_id=session_id,
                    idempotency_key=idempotency_key,
                    input_text=input_text,
                    binding=binding,
                ),
                lease,
            )
        except Exception:
            self._release_lease_quietly(session_id, owner)
            raise

        if result.replayed:
            # Idempotent replay: same key + same digest.  A still-running
            # turn is reported as-is; recovery stays explicit.
            self._release_lease_quietly(session_id, owner)
            turn = self._store.get_turn(session_id, result.turn_id)
            run = self._safe_turn_run(result.turn_id)
            return self._accepted_payload(turn, run, replayed=True)

        turn_id = result.turn_id
        execution_id = result.execution_id
        if not execution_id:
            raise RecoveryRequired("turn creation did not link an execution")

        self._store.append_event(
            session_id,
            "TURN_INPUT",
            {
                "turn_id": turn_id,
                "input_digest": "sha256:"
                + hashlib.sha256(input_text.encode("utf-8")).hexdigest(),
                "lease_owner": owner,
            },
            lease,
            turn_id=turn_id,
        )
        # Reserved per-Execution provenance (set-once, Execution-DAG ready):
        # the workspace this attempt operates on, and — when this attempt is
        # a native continuation — the parent Execution and the native
        # session Ref it consumed.  No translation is performed.
        self._store.record_execution_input_facts(
            session_id,
            turn_id,
            execution_id,
            lease,
            parent_execution_id=parent_execution_id,
            input_session_ref=continuation_ref,
            workspace_input_ref=session.workspace_ref,
        )

        run = _TurnRunControl(
            session_id, turn_id, execution_id, idempotency_key, owner, lease, provider
        )
        with self._runs_lock:
            self._runs[turn_id] = run

        # 202 shape: accepted state + frozen binding summary.
        payload = self._accepted_payload(
            self._store.get_turn(session_id, turn_id),
            self._store.turn_run(turn_id),
            replayed=False,
        )
        if self._worker_mode == "inline":
            self._execute_turn(run)
        else:
            self.start_worker()
            self._queue.put(run)
        return payload

    # Legacy single-entry name kept for embedders that ran the old fake
    # vertical synchronously.
    def run_turn(self, session_id: str, *, idempotency_key: str, input_text: str) -> dict:
        payload = self.submit_turn(
            session_id, idempotency_key=idempotency_key, input_text=input_text
        )
        run = self._runs.get(payload["turn_id"])
        if run is not None:
            run.done.wait(timeout=max(self._turn_timeout_seconds * 2, 30.0))
        turn = self._store.get_turn(session_id, payload["turn_id"])
        return self._turn_payload(turn)

    # -- the production run chain (worker) --------------------------------------

    def _worker_loop(self) -> None:
        while not self._shutdown.is_set():
            try:
                run = self._queue.get(timeout=0.2)
            except queue.Empty:
                continue
            try:
                self._execute_turn(run)
            except Exception:  # noqa: BLE001 - worker must survive any run
                logger.error("turn run crashed: turn_id=%s", run.turn_id)

    def _execute_turn(self, run: _TurnRunControl) -> None:
        session_id, turn_id = run.session_id, run.turn_id
        lease = run.lease
        try:
            session = self._store.get_session(session_id)
            project_id = session.workspace_ref.native_id
            baseline = self._workspace.baseline_observation(project_id)

            # -- dispatch intent (journal BEFORE the irreversible call) -----
            dispatch_key = f"dispatch:{run.idempotency_key}"
            inputs = self._build_dispatch_inputs(
                run.provider, turn_id, run.execution_id, session
            )
            inputs_digest = "sha256:" + hashlib.sha256(
                json.dumps(
                    sorted(
                        (contract, ref.provider, ref.native_id, json.dumps(dict(ref.metadata), sort_keys=True))
                        for contract, ref in inputs
                    ),
                    sort_keys=True,
                    separators=(",", ":"),
                ).encode("utf-8")
            ).hexdigest()
            self._store.record_dispatch_intent(
                turn_id,
                run.execution_id,
                dispatch_id=dispatch_key,
                dispatch_digest=inputs_digest,
                lease=lease,
            )
            try:
                receipt = self._execution_service.dispatch_execution(
                    run.execution_id,
                    inputs,
                    self._registry,
                    dispatch_key,
                )
            except DispatchAmbiguous as exc:
                # NEVER a fabricated FAILED: the run moves to
                # RECOVERY_REQUIRED with its dispatch identity preserved.
                self._store.mark_turn_recovery_required(
                    turn_id,
                    facts={
                        "reason_code": "DISPATCH_AMBIGUOUS",
                        "dispatch_key": dispatch_key,
                        "detail": str(exc)[:200],
                        "lease_owner": run.owner_id,
                    },
                )
                self._store.append_event(
                    session_id,
                    "execution.recovery_required",
                    {"turn_id": turn_id, "reason_code": "DISPATCH_AMBIGUOUS"},
                    lease,
                    turn_id=turn_id,
                    execution_id=run.execution_id,
                )
                self._notify(session_id)
                return
            except (DispatchFailed, WorkCoreError, SessionError) as exc:
                # Determinate failure evidence: the provider/authority
                # rejected the start; nothing ambiguous remains.
                self._seal_failed_turn(run, reason_code=type(exc).__name__[:64], detail=str(exc)[:200])
                self._notify(session_id)
                return

            run.dispatch_id = receipt.dispatch_id
            # Work Core returns its own DispatchReceipt (the live handle is
            # ephemeral).  Re-attach the provider's live runtime handle for
            # the observation loop; providers without handles (fake/legacy)
            # keep the receipt as the observe target.
            run.receipt = receipt
            get_handle = getattr(run.provider, "get_handle", None)
            if callable(get_handle):
                try:
                    run.receipt = get_handle(receipt.dispatch_id)
                except KeyError:
                    run.receipt = receipt
            self._store.record_dispatch_accepted(
                turn_id, run.execution_id, dispatch_id=dispatch_key, lease=lease
            )
            self._notify(session_id)

            # -- observation loop -------------------------------------------
            self._observe_until_terminal(run)

            run_state = self._store.turn_run(turn_id)
            if run_state.phase.value == "recovery_required":
                # _observe_until_terminal already journaled the facts and
                # the durable recovery event.
                return
            if run_state.phase.value != "execution_terminal":
                # No terminal observation and no provable cancel: never
                # fabricate.  Recovery stays explicit.
                self._store.mark_turn_recovery_required(
                    turn_id,
                    facts={
                        "reason_code": "EXECUTION_OUTCOME_UNPROVEN",
                        "dispatch_key": dispatch_key,
                        "dispatch_id": run.dispatch_id or "",
                        "lease_owner": run.owner_id,
                    },
                    lease=lease,
                )
                self._store.append_event(
                    session_id,
                    "execution.recovery_required",
                    {"turn_id": turn_id, "reason_code": "EXECUTION_OUTCOME_UNPROVEN"},
                    lease,
                    turn_id=turn_id,
                    execution_id=run.execution_id,
                )
                self._notify(session_id)
                return

            self._finalize_and_commit(run, baseline)
        except ExecutionFactConflict as exc:
            # Provenance violation: the run must never commit with missing
            # or conflicting immutable output facts.  Recovery stays
            # explicit; the conflict detail is never echoed into facts.
            logger.error(
                "output provenance conflict: turn_id=%s error_type=%s",
                turn_id,
                type(exc).__name__,
            )
            try:
                self._store.mark_turn_recovery_required(
                    turn_id,
                    facts={
                        "reason_code": "OUTPUT_PROVENANCE_CONFLICT",
                        "lease_owner": run.owner_id,
                    },
                    lease=run.lease,
                )
                self._store.append_event(
                    run.session_id,
                    "execution.recovery_required",
                    {"turn_id": turn_id, "reason_code": "OUTPUT_PROVENANCE_CONFLICT"},
                    run.lease,
                    turn_id=turn_id,
                    execution_id=run.execution_id,
                )
            except Exception:  # noqa: BLE001
                logger.error(
                    "provenance recovery journaling failed: turn_id=%s", turn_id
                )
            self._notify(run.session_id)
        except Exception as exc:  # noqa: BLE001
            # Unexpected orchestration error: no terminal can be proven from
            # an orchestration bug — recovery stays explicit.
            logger.error(
                "turn run moved to recovery: turn_id=%s error_type=%s",
                turn_id,
                type(exc).__name__,
            )
            logger.debug("turn run failure detail", exc_info=exc)
            try:
                self._store.append_event(
                    run.session_id,
                    "execution.recovery_required",
                    {"turn_id": turn_id, "reason_code": "ORCHESTRATION_ERROR"},
                    run.lease,
                    turn_id=turn_id,
                    execution_id=run.execution_id,
                )
            except Exception:  # noqa: BLE001
                pass
            try:
                self._store.mark_turn_recovery_required(
                    turn_id,
                    facts={
                        "reason_code": "ORCHESTRATION_ERROR",
                        "error_type": type(exc).__name__[:64],
                        "lease_owner": run.owner_id,
                    },
                    lease=run.lease,
                )
            except Exception:  # noqa: BLE001
                logger.error("recovery journaling failed: turn_id=%s", turn_id)
            self._notify(session_id)
        finally:
            self._release_lease_quietly(run.session_id, run.owner_id)
            run.done.set()
            with self._runs_lock:
                self._runs.pop(run.turn_id, None)

    # -- dispatch input assembly --------------------------------------------------

    def _build_dispatch_inputs(
        self, provider: Any, turn_id: str, execution_id: str, session
    ) -> list[tuple[str, Ref]]:
        from .refs import turn_input_ref

        limits = provider.input_limits()
        inputs: list[tuple[str, Ref]] = []
        missing: list[str] = []

        def add(contract_id: str, ref: Optional[Ref], *, required: bool) -> None:
            if contract_id not in limits:
                return
            minimum = limits[contract_id][0]
            if ref is not None:
                inputs.append((contract_id, ref))
            elif minimum > 0:
                missing.append(contract_id)

        add(SESSION_TURN_INPUT_CONTRACT_ID, turn_input_ref(turn_id), required=True)
        add(PromptFragmentV1.contract_id, turn_input_ref(turn_id), required=True)
        add(WorkspaceV1.contract_id, session.workspace_ref, required=True)

        turn = self._store.get_turn(session.session_id, turn_id)
        binding = turn.binding
        add(RUNTIME_HOST_CONTRACT_ID, binding.runtime_host_ref, required=True)
        add(SANDBOX_CONTRACT_ID, binding.sandbox_ref, required=True)
        # Rebuild the exact frozen terminal Ref from the binding extras (the
        # session digest and affinity are part of the frozen identity).
        terminal_ref = Ref(
            RefType.ARTIFACT,
            binding.extra.get("terminal_provider") or DEFAULT_TERMINAL_PROVIDER_ID,
            binding.extra.get("terminal_native_id") or "direct-stdio",
            metadata={
                "session_digest": binding.extra.get("terminal_session_digest", ""),
                "affinity": binding.extra.get("terminal_affinity", ""),
            },
        )
        add(TERMINAL_SESSION_CONTRACT_ID, terminal_ref, required=True)
        add(AgentBoxProfileV1.contract_id, binding.profile_ref, required=False)

        launch_mode = binding.extra.get("launch_mode") or ""
        if LaunchSelectionV1.contract_id in limits and launch_mode:
            # Resolved by the shared generic launch-selection resolver; the
            # Ref carries the requested mode and fails closed on undeclared
            # modes inside the provider's launch chain.
            ref = Ref(
                RefType.ARTIFACT,
                "harness-launch-selection",
                launch_mode,
                metadata={"mode": launch_mode},
            )
            add(LaunchSelectionV1.contract_id, ref, required=False)

        continuation_contract_id = self._continuation_capability(provider)
        if continuation_contract_id and continuation_contract_id in limits:
            # Native continuation dispatches consume EXACTLY the persisted
            # input_session_ref of this Execution (itself the source
            # Execution's set-once output_native_session_ref) — never a
            # re-derived locator.
            link = self._store.execution_link(
                session.session_id, turn_id, execution_id
            )
            if link.input_session_ref is not None:
                add(continuation_contract_id, link.input_session_ref, required=False)

        credential_contract = getattr(provider, "credential_contract_id", None)
        if callable(credential_contract):
            contract_id = credential_contract()
            if contract_id and contract_id in limits:
                add(contract_id, self._credential_ref(provider), required=False)

        if missing:
            raise LaunchSelectionError(
                "frozen binding cannot satisfy the provider's declared input minimums: "
                + ",".join(sorted(missing))
            )
        return inputs

    def _credential_ref(self, provider: Any) -> Optional[Ref]:
        definition = getattr(provider, "definition", None)
        credential = getattr(definition, "credential", None) if definition else None
        if credential is None:
            return None
        locator_provider = credential.locator_provider
        return Ref(
            RefType.ARTIFACT,
            locator_provider,
            f"{locator_provider}/default",
            metadata={"schema_version": "1"},
        )

    # -- observation loop -----------------------------------------------------------

    def _observe_until_terminal(self, run: _TurnRunControl) -> None:
        session_id, turn_id, lease = run.session_id, run.turn_id, run.lease
        deadline = time.monotonic() + self._turn_timeout_seconds
        running_recorded = False
        handle = run.receipt
        provider = run.provider
        driver = None
        attach = getattr(provider, "attach_session_driver", None)
        if callable(attach) and provider.capabilities().get("stream") == "supported":
            try:
                driver = attach(run.dispatch_id)
                run.driver_bound = driver is not None
            except Exception:  # noqa: BLE001 - legacy observe path remains
                driver = None
        seen_hub_entries = 0
        while True:
            if run.cancel_requested:
                break
            if time.monotonic() > deadline:
                run.cancel_requested = True
                run.cancel_reason = "turn timeout"
                break
            try:
                if driver is not None:
                    driver.poll(timeout=0.0)
                    entries = driver.hub.all()
                    observations = tuple(item.observation for item in entries[seen_hub_entries:])
                    seen_hub_entries = len(entries)
                else:
                    observations = provider.observe(handle)
            except Exception as exc:  # noqa: BLE001
                # Observation decode failure: the run facts stay honest.
                self._store.mark_turn_recovery_required(
                    turn_id,
                    facts={
                        "reason_code": "OBSERVATION_ERROR",
                        "error_type": type(exc).__name__[:64],
                        "dispatch_id": run.dispatch_id or "",
                        "lease_owner": run.owner_id,
                    },
                    lease=lease,
                )
                return
            terminal_outcome: Optional[TerminalOutcome] = None
            evidence: dict[str, str] = {"dispatch_id": run.dispatch_id or ""}
            if observations and not running_recorded:
                self._store.record_turn_running(turn_id, lease=lease)
                running_recorded = True
            for observation in observations:
                event_type, payload, outcome = self._map_observation(observation, run)
                if payload is not None:
                    self._store.append_event(
                        session_id,
                        event_type,
                        payload,
                        lease,
                        turn_id=turn_id,
                        execution_id=run.execution_id,
                    )
                    self._notify(session_id)
                locator = getattr(observation, "session_locator", None)
                if (
                    event_type == _EVENT_SESSION
                    and locator
                    and self._continuation_capability(run.provider) is not None
                ):
                    # Native Session output Ref of THIS execution (set-once):
                    # the harness provider's own continuation identity, built
                    # by the provider, never derived by Studio.  A failure
                    # here is a provenance violation: it propagates and the
                    # run can never commit with missing/mismatched
                    # provenance (no log-and-continue).
                    output_ref = run.provider.continuation_ref(locator)
                    self._store.record_execution_output_facts(
                        session_id,
                        turn_id,
                        run.execution_id,
                        lease,
                        output_native_session_ref=output_ref,
                    )
                if outcome is not None:
                    terminal_outcome = outcome
            if terminal_outcome is None:
                # No terminal observation yet: prove process exit directly.
                exit_code, exited = self._process_exit(provider, run.dispatch_id)
                if exited:
                    terminal_outcome = (
                        TerminalOutcome.SUCCEEDED if exit_code == 0 else TerminalOutcome.FAILED
                    )
                    evidence["exit_code"] = str(exit_code)
                    evidence["exit_source"] = "process-poll"
            if terminal_outcome is not None:
                evidence["outcome"] = terminal_outcome.value
                if run.cancel_requested:
                    # A cancel that provably stopped the process is a
                    # cancelled outcome; a completion that raced the cancel
                    # request stays what the provider reported.
                    if terminal_outcome is not TerminalOutcome.SUCCEEDED:
                        terminal_outcome = TerminalOutcome.CANCELLED
                        evidence["cancel_reason"] = run.cancel_reason or "requested"
                run.terminal_seen = True
                self._store.record_execution_terminal(
                    turn_id, outcome=terminal_outcome, evidence=evidence, lease=lease
                )
                return
            time.sleep(self._poll_interval)
        # Loop exited without a terminal observation: a cancel or timeout
        # was requested.  Stop the run through its authority and only
        # record CANCELLED when termination is provable.
        if run.cancel_requested and run.dispatch_id:
            provider.cancel_dispatch(run.dispatch_id)
            proof_deadline = time.monotonic() + _CANCEL_PROOF_TIMEOUT_SECONDS
            while time.monotonic() < proof_deadline:
                state = provider.dispatch_state(run.dispatch_id)
                if state.get("state") == "terminal":
                    self._store.record_execution_terminal(
                        turn_id,
                        outcome=TerminalOutcome.CANCELLED,
                        evidence={
                            "outcome": TerminalOutcome.CANCELLED.value,
                            "dispatch_id": run.dispatch_id,
                            "cancel_reason": run.cancel_reason or "requested",
                            "exit_code": str(state.get("exit_code")),
                        },
                        lease=lease,
                    )
                    return
                time.sleep(0.05)
            provider.kill_dispatch(run.dispatch_id)
        # Nothing can be proven: recovery stays explicit (never fabricated).
        self._store.mark_turn_recovery_required(
            turn_id,
            facts={
                "reason_code": "EXECUTION_OUTCOME_UNPROVEN",
                "dispatch_id": run.dispatch_id or "",
                "cancel_reason": run.cancel_reason,
                "lease_owner": run.owner_id,
            },
            lease=lease,
        )
        self._store.append_event(
            session_id,
            "execution.recovery_required",
            {"turn_id": turn_id, "reason_code": "EXECUTION_OUTCOME_UNPROVEN"},
            lease,
            turn_id=turn_id,
            execution_id=run.execution_id,
        )
        self._notify(session_id)

    def _process_exit(self, provider: Any, dispatch_id: Optional[str]) -> tuple[Optional[int], bool]:
        state_getter = getattr(provider, "dispatch_state", None)
        if not dispatch_id or not callable(state_getter):
            # Providers without a runtime exit-probe surface (fake/legacy)
            # rely on their own terminal observations only.
            return None, False
        state = state_getter(dispatch_id)
        if state.get("state") == "terminal":
            exit_code = state.get("exit_code")
            return (int(exit_code) if exit_code is not None else None), True
        return None, False

    def _map_observation(self, observation: Any, run: _TurnRunControl):
        """Map one provider observation to a durable, bounded session event.

        Returns (event_type, payload, terminal_outcome).  Unknown native
        events are never silently dropped.
        """
        legacy_type = getattr(observation, "event_type", None)
        origin = getattr(observation, "harness_type", "") or ""
        execution_id = run.execution_id

        def bounded(value: Any) -> str:
            return str(value)[:512] if value is not None else ""

        if legacy_type is not None:
            # Legacy fake-provider observation shape.
            payload = {key: bounded(val) for key, val in dict(observation.payload).items()}
            payload["turn_id"] = run.turn_id
            event_type = _LEGACY_EVENT_MAP.get(legacy_type, legacy_type.lower())
            outcome = None
            if legacy_type == "TURN_RESULT":
                outcome = (
                    TerminalOutcome.SUCCEEDED
                    if payload.get("outcome") == "succeeded"
                    else TerminalOutcome.FAILED
                )
            return event_type, payload, outcome

        kind = getattr(observation.kind, "value", str(observation.kind))
        payload: dict[str, str] = {
            "turn_id": run.turn_id,
            "origin_harness": bounded(origin) or "unknown",
        }
        warnings = getattr(observation, "warnings", ()) or ()
        if warnings:
            payload["loss"] = ";".join(bounded(w) for w in warnings[:8])
        outcome: Optional[TerminalOutcome] = None
        if kind == "session":
            payload["event"] = "execution.started"
            locator = getattr(observation, "session_locator", None)
            if locator:
                payload["session_locator"] = bounded(locator)
            model = getattr(observation, "model", None)
            if model:
                payload["model"] = bounded(model)
            return _EVENT_SESSION, payload, None
        if kind == "message":
            payload["text"] = bounded(getattr(observation, "text", ""))
            return _EVENT_MESSAGE, payload, None
        if kind == "tool_request":
            payload["tool"] = bounded(getattr(observation, "tool_name", ""))
            return _EVENT_TOOL_REQUEST, payload, None
        if kind == "tool_result":
            payload["tool"] = bounded(getattr(observation, "tool_name", ""))
            payload["is_error"] = "true" if getattr(observation, "is_error", False) else "false"
            payload["text"] = bounded(getattr(observation, "text", ""))
            return _EVENT_TOOL_RESULT, payload, None
        if kind == "permission_request":
            payload["request_id"] = uuid.uuid4().hex
            payload["tool"] = bounded(getattr(observation, "tool_name", ""))
            payload["timeout_seconds"] = str(int(self._permission_timeout_seconds))
            payload["delivery"] = "session-driver" if run.driver_bound else "none-headless-auto-reject"
            return _EVENT_PERMISSION, payload, None
        if kind == "usage":
            usage = getattr(observation, "usage", None) or {}
            payload["usage_json"] = json.dumps(
                {str(k)[:64]: str(v)[:64] for k, v in sorted(usage.items())[:32]},
                sort_keys=True,
            )[:1024]
            locator = getattr(observation, "session_locator", None)
            if locator:
                payload["session_locator"] = bounded(locator)
            model = getattr(observation, "model", None)
            if model:
                payload["model"] = bounded(model)
            return _EVENT_USAGE, payload, None
        if kind == "terminal":
            condition = getattr(observation.terminal_condition, "value", None) or "unknown"
            payload["condition"] = bounded(condition)
            is_error = bool(getattr(observation, "is_error", False))
            if is_error or condition == "failed":
                outcome = TerminalOutcome.FAILED
                return _EVENT_FAILED, payload, outcome
            # process_exit with a clean exit code (is_error False) is an
            # honest success; the exit code is proven by the transport poll.
            outcome = TerminalOutcome.SUCCEEDED
            return _EVENT_COMPLETED, payload, outcome
        if kind == "lifecycle":
            text = bounded(getattr(observation, "text", ""))
            if text == "running":
                return _EVENT_PROGRESS, None, None  # deduplicated noise
            payload["text"] = text
            return _EVENT_PROGRESS, payload, None
        # UNKNOWN and anything else: recorded, never dropped.
        payload["text"] = bounded(getattr(observation, "text", ""))
        return _EVENT_UNKNOWN, payload, None

    # -- finalization / commit --------------------------------------------------------

    def _finalize_and_commit(self, run: _TurnRunControl, baseline) -> None:
        session_id, turn_id, lease = run.session_id, run.turn_id, run.lease
        session = self._store.get_session(session_id)
        run_state = self._store.turn_run(turn_id)
        evidence = dict(run_state.recovery_facts)
        outcome = TerminalOutcome(evidence.get("outcome", TerminalOutcome.SUCCEEDED.value))
        turn = self._store.get_turn(session_id, turn_id)
        execution_id = run.execution_id

        if run_state.phase.value == "execution_terminal":
            self._apply_finalization(
                execution_id, session.workspace_ref, f"{run.idempotency_key}:finalize", outcome
            )
            self._store.record_finalization_applied(turn_id, lease=lease)

        project_id = session.workspace_ref.native_id
        after = self._workspace.after_observation(project_id, baseline)
        self._store.append_event(
            session_id,
            "WORKSPACE_AFTER",
            {
                "turn_id": turn_id,
                "changed": str(after.changed),
                "source": after.source,
                "baseline_digest": after.baseline.inventory_digest,
                "after_digest": after.after.inventory_digest,
                "coverage": after.after.coverage,
                "baseline_git_head": after.baseline.git_head or "",
                "after_git_head": after.after.git_head or "",
            },
            lease,
            turn_id=turn_id,
            execution_id=execution_id,
        )
        self._notify(session_id)

        # Reserved per-Execution output fact: the workspace Ref after the
        # attempt (live workspace: same Ref, the attempt's output fact of
        # record; set-once immutable).
        self._store.record_execution_output_facts(
            session_id, turn_id, execution_id, lease,
            workspace_output_ref=session.workspace_ref,
        )

        self._store.record_terminal(
            session_id, turn_id, outcome, lease, execution_id=execution_id
        )
        self._store.commit_turn(session_id, turn_id, lease)

    def _apply_finalization(
        self, execution_id: str, workspace_ref: Ref, idempotency_key: str, outcome: TerminalOutcome
    ) -> None:
        now = datetime.now(tz=timezone.utc)
        phase_outcome = {
            TerminalOutcome.SUCCEEDED: Outcome.SUCCEEDED,
            TerminalOutcome.FAILED: Outcome.FAILED,
            TerminalOutcome.CANCELLED: Outcome.CANCELLED,
        }[outcome]
        terminal_projection = ExecutionProjection(
            Phase.TERMINAL, phase_outcome, None, Freshness.OBSERVED, now
        )
        frozen = dict(self._repository.list_input_refs(execution_id))
        observations = []
        workspace_contract_ref = frozen.get(WorkspaceV1.contract_id)
        if workspace_contract_ref is not None:
            observations.append(
                ResourceObservation(
                    WorkspaceV1.contract_id,
                    workspace_contract_ref,
                    ResourceObservationKind.READ_BACK,
                    ResourceObservationResult.UNVERIFIABLE,
                    ResourceObserverRole.RESOURCE_PROVIDER,
                    live_workspace_provider_id,
                    now,
                    ResourceObservationCoverage.UNKNOWN,
                    detail=(
                        "live workspace is externally mutable and unfrozen; "
                        "changes cannot be attributed: source=shared_live_workspace"
                    ),
                )
            )
        request = ExecutionFinalizationRequest(
            execution_id,
            f"finalize:{idempotency_key}",
            terminal_projection,
            resource_observations=tuple(observations),
        )
        self._execution_service.apply_finalization(request)

    def _seal_failed_turn(self, run: _TurnRunControl, *, reason_code: str, detail: str) -> None:
        """Seal a determinate failure with real evidence (never fabricated).

        A dispatch rejection means nothing was started, so no Work Core
        finalization is applied; the run journal moves to EXECUTION_TERMINAL
        and ``commit_turn`` stamps the FAILED terminal phase from the
        recorded terminal outcome.
        """
        turn_id, lease = run.turn_id, run.lease
        try:
            self._store.record_execution_terminal(
                turn_id,
                outcome=TerminalOutcome.FAILED,
                evidence={
                    "reason_code": reason_code,
                    "detail": detail,
                    "dispatch_id": run.dispatch_id or "",
                },
                lease=lease,
            )
            self._store.append_event(
                run.session_id,
                _EVENT_FAILED,
                {"turn_id": turn_id, "reason_code": reason_code},
                lease,
                turn_id=turn_id,
                execution_id=run.execution_id,
            )
            self._store.record_terminal(
                run.session_id,
                turn_id,
                TerminalOutcome.FAILED,
                lease,
                execution_id=run.execution_id,
            )
            self._store.commit_turn(run.session_id, turn_id, lease)
        except SessionError as exc:
            logger.error(
                "failed-turn sealing could not complete: turn_id=%s error=%s",
                turn_id,
                type(exc).__name__,
            )

    # -- cancel -------------------------------------------------------------------

    def cancel_turn(self, session_id: str, turn_id: str) -> dict:
        """Persist the cancel intent, then stop the run through its authority."""
        turn = self._store.get_turn(session_id, turn_id)
        if turn.state.terminal:
            return self._turn_payload(turn)  # idempotent: already terminal
        run = self._runs.get(turn_id)
        lease_owner = run.owner_id if run is not None else None
        if run is None:
            # No live attempt in this process: the run is either executing
            # under a crashed writer or already between steps.  Only the
            # journal can decide.
            run_state = self._safe_turn_run(turn_id)
            if run_state is not None and run_state.phase.terminal:
                return self._turn_payload(turn)
            raise RecoveryRequired(
                "no live execution handle for this turn; recovery required"
            )
        lease = run.lease
        self._store.append_event(
            session_id,
            "CANCEL_REQUESTED",
            {"turn_id": turn_id, "reason": "api-request"},
            lease,
            turn_id=turn_id,
        )
        run.cancel_requested = True
        run.cancel_reason = "api-request"
        provider = run.provider
        dispatch_id = run.dispatch_id
        if not dispatch_id:
            # Dispatch not yet started: the worker will observe the cancel
            # flag before any side effect and fail the run honestly.
            return {"turn_id": turn_id, "cancel": "requested-before-dispatch"}
        result = dict(provider.cancel_dispatch(dispatch_id))
        state = result.get("state")
        if state == "terminate_sent":
            deadline = time.monotonic() + _CANCEL_PROOF_TIMEOUT_SECONDS
            while time.monotonic() < deadline:
                exit_state = provider.dispatch_state(dispatch_id)
                if exit_state.get("state") == "terminal":
                    result["proven"] = "true"
                    break
                time.sleep(0.05)
            else:
                kill = dict(provider.kill_dispatch(dispatch_id))
                if kill.get("state") == "kill_sent":
                    result["kill"] = "sent"
        # The worker records the outcome; without proof it must never write
        # CANCELLED.  The response is honest about what was done.
        return {"turn_id": turn_id, "cancel": state or "unknown"}

    # -- permission / question responses --------------------------------------------

    def respond_permission(self, session_id: str, request_id: str, *, decision: str) -> dict:
        return self._respond_request(
            session_id, request_id, decision, event_in=_EVENT_PERMISSION, event_out="permission.response"
        )

    def respond_question(self, session_id: str, request_id: str, *, decision: str) -> dict:
        return self._respond_request(
            session_id, request_id, decision, event_in="question.requested", event_out="question.response"
        )

    def _respond_request(self, session_id: str, request_id: str, decision: str, *, event_in: str, event_out: str) -> dict:
        if decision not in ("approve", "reject"):
            raise SessionError("decision must be approve or reject")
        events = self._store.transcript(session_id)
        request_event = None
        response_events = []
        for event in events:
            if event.event_type == event_in and event.payload.get("request_id") == request_id:
                request_event = event
            if event.event_type == event_out and event.payload.get("request_id") == request_id:
                response_events.append(event)
        if request_event is None:
            raise SessionError("unknown permission or question request")
        if response_events:
            raise SessionError("request was already answered")
        turn_id = request_event.turn_id
        run = self._runs.get(turn_id) if turn_id else None
        lease = run.lease if run is not None else None
        if lease is None:
            raise RecoveryRequired(
                "the turn that raised this request has no live writer in this process"
            )
        delivered = "false"
        if run is not None and run.receipt is not None:
            driver = self._bound_driver(run.provider, run.dispatch_id)
            respond = None
            if driver is not None:
                respond = getattr(driver, "respond_permission", None) or getattr(
                    driver, "respond", None
                )
            if callable(respond):
                try:
                    respond(request_id, decision)
                    delivered = "true"
                except Exception as exc:  # noqa: BLE001
                    logger.error(
                        "permission delivery failed: request_id=%s error=%s",
                        request_id,
                        type(exc).__name__,
                    )
        self._store.append_event(
            session_id,
            event_out,
            {
                "request_id": request_id,
                "turn_id": turn_id or "",
                "decision": decision,
                "delivered": delivered,
            },
            lease,
            turn_id=turn_id,
        )
        self._notify(session_id)
        return {"request_id": request_id, "decision": decision, "delivered": delivered == "true"}

    def _bound_driver(self, provider: Any, dispatch_id: Optional[str]):
        if not dispatch_id:
            return None
        getter = getattr(provider, "session_driver", None)
        if not callable(getter):
            return None
        try:
            return getter(dispatch_id)
        except KeyError:
            return None

    # -- restart recovery -------------------------------------------------------------

    def recover_on_startup(self) -> dict:
        """Reconcile unfinished run-transaction rows after a process restart.

        Provable roll-forward: a run that already journaled its execution
        terminal (with outcome evidence) is finalized and committed from the
        journal.  Everything earlier cannot be proven without its process —
        it becomes RECOVERY_REQUIRED with its dispatch identity preserved.
        """
        rolled_forward, recovery_required = [], []
        for run in self._store.unfinished_turn_runs():
            session_id, turn_id = run.session_id, run.turn_id
            if run.phase.value in ("execution_terminal", "finalization_applied"):
                try:
                    outcome = TerminalOutcome(
                        run.recovery_facts.get("outcome", TerminalOutcome.SUCCEEDED.value)
                    )
                    session = self._store.get_session(session_id)
                    if run.phase.value == "execution_terminal":
                        self._apply_finalization(
                            run.execution_id,
                            session.workspace_ref,
                            f"recover:{turn_id}",
                            outcome,
                        )
                        lease = self._store.acquire_writer_lease(
                            session_id, f"{TURN_OWNER_PREFIX}recovery"
                        )
                        try:
                            self._store.record_finalization_applied(turn_id, lease=lease)
                            self._store.record_terminal(
                                session_id, turn_id, outcome, lease, execution_id=run.execution_id
                            )
                            self._store.commit_turn(session_id, turn_id, lease)
                        finally:
                            self._release_lease_quietly(session_id, f"{TURN_OWNER_PREFIX}recovery")
                    else:
                        lease = self._store.acquire_writer_lease(
                            session_id, f"{TURN_OWNER_PREFIX}recovery"
                        )
                        try:
                            self._store.record_terminal(
                                session_id, turn_id, outcome, lease, execution_id=run.execution_id
                            )
                            self._store.commit_turn(session_id, turn_id, lease)
                        finally:
                            self._release_lease_quietly(session_id, f"{TURN_OWNER_PREFIX}recovery")
                    rolled_forward.append(turn_id)
                    continue
                except SessionError:
                    logger.error("roll-forward failed: turn_id=%s", turn_id)
            facts = dict(run.recovery_facts)
            facts.setdefault("reason_code", "RESTART_DISCOVERY")
            facts["phase_at_restart"] = run.phase.value
            self._store.mark_turn_recovery_required(turn_id, facts=facts)
            recovery_required.append(turn_id)
        return {"rolled_forward": rolled_forward, "recovery_required": recovery_required}

    # -- recovery surface ----------------------------------------------------------------

    def recovery(self, session_id: Optional[str] = None) -> dict:
        operations = self._store.recovery_operations(session_id=session_id)
        leases = self._store.active_leases(session_id)
        return {
            "operations": [
                {
                    "op_id": op.op_id,
                    "session_id": op.session_id,
                    "kind": op.kind,
                    "state": op.state,
                    "detail": op.detail,
                }
                for op in operations
            ],
            "leases": [
                {
                    "session_id": lease.session_id,
                    "owner_id": lease.owner_id,
                    "acquired_at": lease.acquired_at.isoformat() if lease.acquired_at else None,
                }
                for lease in leases
            ],
            "diagnostics": dict(self._store.diagnostics()),
        }

    def recover(self, session_id: str, op_id: str) -> dict:
        operation = self._store.recover(session_id, op_id)
        return {
            "op_id": operation.op_id,
            "state": operation.state,
            "detail": operation.detail,
        }

    def break_lease(
        self,
        session_id: str,
        *,
        expected_owner_id: str,
        expected_turn_id: Optional[str] = None,
        reason: str = "",
        confirm: bool = False,
    ) -> dict:
        """Explicitly break a stale writer lease after CAS re-validation.

        The store re-reads the current lease and the session's running turn
        and fails closed unless ``expected_owner_id`` (and, when given,
        ``expected_turn_id``) still match.  An unconditional break is not
        possible.
        """
        if not confirm:
            raise SessionError("break lease requires an explicit confirm flag")
        self._store.break_writer_lease(
            session_id,
            reason=reason or "explicit recovery request",
            expected_owner_id=expected_owner_id,
            expected_turn_id=expected_turn_id,
        )
        return {"session_id": session_id, "lease": "broken"}

    # -- helpers -----------------------------------------------------------------------

    def _release_lease_quietly(self, session_id: str, owner_id: str) -> None:
        try:
            self._store.release_writer_lease(session_id, owner_id)
        except SessionError:
            pass

    def _safe_turn_run(self, turn_id: str) -> Optional[TurnRunView]:
        try:
            return self._store.turn_run(turn_id)
        except SessionError:
            return None

    def _accepted_payload(self, turn, run: Optional[TurnRunView], *, replayed: bool) -> dict:
        binding = turn.binding
        return {
            "session_id": turn.session_id,
            "turn_id": turn.turn_id,
            "execution_ids": list(turn.execution_ids),
            "state": turn.state.value,
            "replayed": replayed,
            "run_phase": run.phase.value if run is not None else None,
            "binding": {
                "harness_provider_id": binding.harness_provider_id,
                "harness_provider_version": binding.harness_provider_version,
                "harness_type": binding.extra.get("harness_type"),
                "model_selection": binding.model_selection,
                "workspace_mode": binding.workspace_mode,
                "launch_mode": binding.extra.get("launch_mode") or None,
                "session_watermark": binding.session_watermark,
                "capability_digest": binding.capability_digest,
            },
        }

    def _turn_payload(self, turn) -> dict:
        run = self._safe_turn_run(turn.turn_id)
        return {
            "turn_id": turn.turn_id,
            "session_id": turn.session_id,
            "state": turn.state.value,
            "execution_ids": list(turn.execution_ids),
            "terminal_outcome": (
                turn.terminal_outcome.value if turn.terminal_outcome else None
            ),
            "committed_watermark": turn.committed_watermark,
            "run_phase": run.phase.value if run is not None else None,
        }

    def get_turn(self, session_id: str, turn_id: str) -> dict:
        return self._turn_payload(self._store.get_turn(session_id, turn_id))
