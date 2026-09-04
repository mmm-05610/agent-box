"""Official Session Store SPI and its typed Catalog contribution wrapper.

The Store is the concrete authority for sessions, the session↔work mapping,
turns, execution links, binding snapshots, the canonical/event ledger, the
watermark, idempotency receipts, the writer lease and recovery journals.  It
is declared here as a Protocol and implemented by a plugin; Root never
persists Session state.

Two-authority rule: the Work Core Repository and the Session Store are two
independent authorities.  Nothing here may claim distributed ACID across
them; cross-authority creation is a durable saga with explicit recovery.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Mapping, Optional, Protocol, runtime_checkable

from ...extensions.contribution import CatalogContribution, ContributionDescriptor
from ...work_core.models import Ref
from .contracts import (
    SESSION_STORE_KIND,
    BindingSnapshot,
    OfficialSessionV1,
    SessionEvent,
    SessionRefFacts,
    TerminalOutcome,
    TurnExecutionLink,
    TurnRunPhase,
    TurnState,
)


@dataclass(frozen=True)
class WriterLease:
    """Proof that one owner holds the single-writer lease of a Session."""

    session_id: str
    owner_id: str
    acquired_at: Optional[datetime] = None

    def __post_init__(self) -> None:
        if not self.session_id or not self.owner_id:
            raise ValueError("writer lease requires session_id and owner_id")


@dataclass(frozen=True)
class SessionCreationRequest:
    """One durable create-session saga intent (idempotent by key)."""

    idempotency_key: str
    title: str
    objective: str
    workspace_ref: Ref
    workspace_mode: str
    project_identity: Optional[str] = None
    metadata: Mapping[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.idempotency_key:
            raise ValueError("session creation requires a stable idempotency key")
        if not self.title or not self.objective:
            raise ValueError("session title and work objective are required")
        if not self.workspace_mode:
            raise ValueError("workspace_mode is required")


@dataclass(frozen=True)
class TurnBeginRequest:
    """One durable begin-turn saga intent (idempotent by key)."""

    session_id: str
    idempotency_key: str
    input_text: str
    binding: BindingSnapshot
    input_ref: Optional[Ref] = None

    def __post_init__(self) -> None:
        if not self.session_id:
            raise ValueError("session_id is required")
        if not self.idempotency_key:
            raise ValueError("turn begin requires a stable idempotency key")
        if not isinstance(self.binding, BindingSnapshot):
            raise ValueError("turn begin requires a frozen BindingSnapshot")


@dataclass(frozen=True)
class TurnBeginResult:
    turn_id: str
    session_id: str
    state: TurnState
    execution_id: Optional[str] = None
    replayed: bool = False
    frozen_watermark: int = 0


@dataclass(frozen=True)
class TurnView:
    """Exact current facts of one Turn."""

    turn_id: str
    session_id: str
    state: TurnState
    binding: BindingSnapshot
    execution_ids: tuple[str, ...] = ()
    idempotency_key: str = ""
    input_ref: Optional[Ref] = None
    created_at: Optional[datetime] = None
    terminal_outcome: Optional[TerminalOutcome] = None
    committed_watermark: Optional[int] = None


@dataclass(frozen=True)
class RecoveryOperation:
    op_id: str
    session_id: Optional[str]
    kind: str
    state: str
    detail: str = ""


@dataclass(frozen=True)
class TurnRunView:
    """Exact current facts of one Turn's run-transaction journal row.

    This is the durable crash-recovery record of the execution phase: a
    restarted process answers "at which step did this turn die and what did
    we already tell the external authority" from these fields alone
    (dispatch identity, dispatch digest, execution id, phase and bounded
    recovery facts).  ``recovery_facts`` is a bounded string-to-string map
    supplied by callers; the store never fabricates entries.
    """

    turn_id: str
    session_id: str
    execution_id: Optional[str]
    dispatch_id: Optional[str]
    dispatch_digest: Optional[str]
    phase: TurnRunPhase
    recovery_facts: Mapping[str, str] = field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    def __post_init__(self) -> None:
        if not self.turn_id or not self.session_id:
            raise ValueError("turn run requires turn_id and session_id")
        if not isinstance(self.phase, TurnRunPhase):
            raise ValueError("turn run phase must be a TurnRunPhase")


@runtime_checkable
class SessionStore(Protocol):
    """The concrete authority SPI for Official Sessions (plugin-owned)."""

    store_id: str

    # -- session creation saga (session = work, durable, idempotent) ------
    def create_session(
        self,
        request: SessionCreationRequest,
        *,
        create_work: "CallableWorkFactory | None" = None,
        work_exists: "WorkExistsProbe | None" = None,
    ) -> OfficialSessionV1: ...

    def get_session(self, session_id: str) -> OfficialSessionV1: ...

    def list_sessions(self) -> tuple[OfficialSessionV1, ...]: ...

    def work_id_for(self, session_id: str) -> str: ...

    def session_id_for_work(self, work_id: str) -> str: ...

    def session_ref_facts(self, session_id: str) -> SessionRefFacts: ...

    # -- single-writer lease ------------------------------------------------
    def acquire_writer_lease(self, session_id: str, owner_id: str) -> WriterLease: ...

    def release_writer_lease(self, session_id: str, owner_id: str) -> None: ...

    def active_leases(self, session_id: str | None = None) -> "tuple[WriterLease, ...]": ...

    # -- turns ---------------------------------------------------------------
    def begin_turn(
        self, request: TurnBeginRequest, lease: WriterLease, *,
        create_execution: "ExecutionFactory | None" = None,
    ) -> TurnBeginResult: ...

    def get_turn(self, session_id: str, turn_id: str) -> TurnView: ...

    def link_execution(
        self, session_id: str, turn_id: str, execution_id: str, lease: WriterLease,
        *,
        parent_execution_id: str | None = None,
        input_session_ref: Ref | None = None,
        workspace_input_ref: Ref | None = None,
    ) -> TurnExecutionLink: ...

    # -- reserved per-Execution facts (set-once, immutable provenance) ------
    def record_execution_input_facts(
        self, session_id: str, turn_id: str, execution_id: str, lease: WriterLease,
        *,
        parent_execution_id: str | None = None,
        input_session_ref: Ref | None = None,
        workspace_input_ref: Ref | None = None,
    ) -> TurnExecutionLink: ...

    def record_execution_output_facts(
        self, session_id: str, turn_id: str, execution_id: str, lease: WriterLease,
        *,
        output_native_session_ref: Ref | None = None,
        workspace_output_ref: Ref | None = None,
    ) -> TurnExecutionLink: ...

    def execution_link(
        self, session_id: str, turn_id: str, execution_id: str,
    ) -> TurnExecutionLink: ...

    # -- turn run transaction (durable journal of the EXECUTION phase) -------
    def record_dispatch_intent(
        self,
        turn_id: str,
        execution_id: str,
        *,
        dispatch_id: str,
        dispatch_digest: str,
        lease: WriterLease,
    ) -> None: ...

    def record_dispatch_accepted(
        self, turn_id: str, execution_id: str, *, dispatch_id: str, lease: WriterLease,
    ) -> None: ...

    def record_turn_running(self, turn_id: str, *, lease: WriterLease) -> None: ...

    def record_execution_terminal(
        self,
        turn_id: str,
        *,
        outcome: TerminalOutcome,
        evidence: Mapping[str, str],
        lease: WriterLease,
    ) -> None: ...

    def record_finalization_applied(self, turn_id: str, *, lease: WriterLease) -> None: ...

    def mark_turn_recovery_required(
        self, turn_id: str, *, facts: Mapping[str, str],
        lease: WriterLease | None = None,
    ) -> str: ...

    def turn_run(self, turn_id: str) -> TurnRunView: ...

    def unfinished_turn_runs(
        self, session_id: str | None = None,
    ) -> tuple[TurnRunView, ...]: ...

    # -- ledger --------------------------------------------------------------
    def append_event(
        self, session_id: str, event_type: str, payload: Mapping[str, str],
        lease: WriterLease, *,
        turn_id: str | None = None, execution_id: str | None = None,
        terminal: bool = False,
    ) -> SessionEvent: ...

    def record_terminal(
        self, session_id: str, turn_id: str, outcome: TerminalOutcome,
        lease: WriterLease, *,
        execution_id: str | None = None,
    ) -> SessionEvent: ...

    def transcript(
        self, session_id: str, *, after_seq: int = 0, limit: int | None = None,
    ) -> tuple[SessionEvent, ...]: ...

    def watermark(self, session_id: str) -> int: ...

    # -- terminal commit / failure -------------------------------------------
    def commit_turn(self, session_id: str, turn_id: str, lease: WriterLease) -> int: ...

    def fail_turn(self, session_id: str, turn_id: str, reason: str, lease: WriterLease) -> TurnView: ...

    # -- idempotency ---------------------------------------------------------
    def get_receipt(self, idempotency_key: str) -> Optional[Mapping[str, str]]: ...

    # -- recovery ------------------------------------------------------------
    def recovery_operations(
        self, *, session_id: str | None = None,
    ) -> tuple[RecoveryOperation, ...]: ...

    def recover(self, session_id: str, op_id: str) -> RecoveryOperation: ...

    def break_writer_lease(
        self,
        session_id: str,
        *,
        reason: str,
        expected_owner_id: str,
        expected_turn_id: str | None = None,
    ) -> None: ...

    # -- diagnostics ----------------------------------------------------------
    def diagnostics(self) -> Mapping[str, object]: ...


class CallableWorkFactory(Protocol):
    def __call__(self, work_id: str, objective: str, metadata: Mapping[str, str]) -> str: ...


class WorkExistsProbe(Protocol):
    def __call__(self, work_id: str) -> bool: ...


class ExecutionFactory(Protocol):
    def __call__(self, work_id: str, turn_id: str) -> str: ...


def _session_store_spi_members() -> dict[str, object]:
    """The declared SPI method members of the SessionStore Protocol."""
    return {
        name: member
        for name, member in vars(SessionStore).items()
        if not name.startswith("_") and callable(member)
    }


def session_store_contribution(component: SessionStore) -> CatalogContribution:
    """Wrap a concrete Session Store as a typed generic Catalog contribution.

    The Catalog stays semantic-free: it only ever sees the namespaced,
    versioned kind and the store's component id.  The component is
    structurally validated first: it must expose a non-empty ``store_id``
    and every declared SPI method must be callable, otherwise the wrap
    fails closed with ``TypeError`` instead of registering a broken store.
    """
    component_id = getattr(component, "store_id", None)
    if not isinstance(component_id, str) or not component_id:
        raise TypeError("session store must expose a non-empty store_id")
    missing = sorted(
        name
        for name in _session_store_spi_members()
        if not callable(getattr(component, name, None))
    )
    if missing:
        raise TypeError(
            "session store is missing required SPI methods: " + ", ".join(missing)
        )
    return CatalogContribution(
        ContributionDescriptor(SESSION_STORE_KIND, component_id),
        component,
    )
