"""Pure, immutable Official Session contract values.

Every value here is a frozen dataclass or enum.  Nothing reads the
filesystem, opens a database, or references a concrete Harness.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import ClassVar, Mapping, Optional

from ...work_core.models import Ref, RefType

SESSION_PROTOCOL_VERSION = 1

# Namespaced, versioned Catalog contribution kinds owned by this pack.
SESSION_STORE_KIND = "agent-box.session.store@1"
SESSION_CODEC_KIND = "agent-box.session.codec@1"

# Contract id for the frozen per-turn user input exchanged through the
# Execution dispatch input surface.  Declared here as a neutral protocol
# value; registration is performed by the owning plugin.
SESSION_TURN_INPUT_CONTRACT_ID = "agent-box.session-turn-input@1"

# Canonical Workspace Ref metadata keys for honest live-workspace facts.
WORKSPACE_META_MODE = "workspace_mode"
WORKSPACE_META_MUTABILITY = "mutability"
WORKSPACE_META_FROZEN = "input_frozen"

# Ref metadata vocabulary marking an event envelope as terminal-once.
EVENT_META_TERMINAL = "terminal"

MAX_INPUT_TEXT_LENGTH = 128 * 1024


class TurnState(str, Enum):
    """Only the states this round really has; no speculative machine."""

    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    RECOVERY_REQUIRED = "recovery_required"

    @property
    def terminal(self) -> bool:
        return self in (TurnState.COMPLETED, TurnState.FAILED, TurnState.RECOVERY_REQUIRED)


class TerminalOutcome(str, Enum):
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TurnRunPhase(str, Enum):
    """Durable run-transaction journal phases for one Turn's execution phase.

    While :class:`TurnState` is the small public state machine of a Turn,
    ``TurnRunPhase`` is the fine-grained crash-recovery journal of the
    execution phase that follows a ``begin_turn`` saga.  A restarted process
    must be able to answer, from the persisted run row alone, "at which step
    did this turn die and what did we already tell the external authority":
    the row carries the dispatch identity, the dispatch digest, the execution
    id and bounded recovery facts alongside the phase.

    Exact phase semantics (the authoritative definition):

    - ``PREPARED``: the run journal row exists (created in the same
      transaction as the Turn row); nothing has been told to any external
      authority yet.
    - ``DISPATCH_REQUESTED``: a dispatch intent (dispatch id + dispatch
      digest) was durably recorded BEFORE any irreversible dispatch side
      effect.  Re-record with identical facts is a no-op.
    - ``DISPATCH_ACCEPTED``: the external authority acknowledged the exact
      recorded dispatch id.
    - ``RUNNING``: first live observation of the run.  Reached from
      ``DISPATCH_ACCEPTED`` normally, or from ``DISPATCH_REQUESTED`` when the
      provider started without an accepted callback (explicitly allowed and
      journaled as-is).
    - ``EXECUTION_TERMINAL``: the caller recorded a bounded provider outcome
      with evidence; nothing was fabricated by the store.
    - ``FINALIZATION_APPLIED``: atomic finalization was applied for the run.
    - ``SESSION_COMMITTED``: terminal SUCCESS phase of the run: the
      session-level commit (watermark advance) is durable.  This is the
      canonical terminal phase written by ``commit_turn`` for a SUCCEEDED
      outcome.
    - ``COMPLETED`` / ``FAILED``: outcome-qualified terminal phases.  A run
      whose committed outcome is not SUCCEEDED ends ``FAILED``; explicit
      recovery may reconcile a lagging journal to ``COMPLETED``/``FAILED``
      when the Turn row's already-sealed state proves the outcome.
    - ``RECOVERY_REQUIRED``: terminal for the run in the sense that NO
      automatic transition may move it; only explicit recovery (which must
      prove facts from persisted state) may resolve it to a terminal
      outcome-qualified phase.  The Turn row's terminal outcome is never
      fabricated when this phase is entered.

    ``terminal`` is True exactly for ``SESSION_COMMITTED``, ``COMPLETED``,
    ``FAILED`` and ``RECOVERY_REQUIRED``.  Every other phase is unfinished
    work that restart discovery must surface.
    """

    PREPARED = "prepared"
    DISPATCH_REQUESTED = "dispatch_requested"
    DISPATCH_ACCEPTED = "dispatch_accepted"
    RUNNING = "running"
    EXECUTION_TERMINAL = "execution_terminal"
    FINALIZATION_APPLIED = "finalization_applied"
    SESSION_COMMITTED = "session_committed"
    COMPLETED = "completed"
    FAILED = "failed"
    RECOVERY_REQUIRED = "recovery_required"

    @property
    def terminal(self) -> bool:
        return self in (
            TurnRunPhase.SESSION_COMMITTED,
            TurnRunPhase.COMPLETED,
            TurnRunPhase.FAILED,
            TurnRunPhase.RECOVERY_REQUIRED,
        )


def _bounded_metadata(value: Mapping[str, str], limit: int = 16) -> dict[str, str]:
    result = dict(value)
    if len(result) > limit:
        raise ValueError(f"metadata has more than {limit} items")
    for key, item in result.items():
        if not isinstance(key, str) or not isinstance(item, str):
            raise ValueError("metadata must be a flat string-to-string map")
        if len(key) > 64 or len(item) > 256:
            raise ValueError("metadata item exceeds bounded size")
    return result


@dataclass(frozen=True)
class SessionRefFacts:
    """Stable, harness-independent identity facts of one Official Session.

    A Session Ref never encodes a Harness identity.  ``work_id`` is the
    one-to-one Work Core counterpart and is fixed at creation.
    """

    session_id: str
    work_id: str
    protocol_version: int = SESSION_PROTOCOL_VERSION

    def __post_init__(self) -> None:
        if not self.session_id or not self.work_id:
            raise ValueError("session_id and work_id are required")

    def to_ref(self) -> Ref:
        return Ref(
            RefType.SESSION,
            "agent-box-session",
            self.session_id,
            metadata={"work_id": self.work_id, "protocol_version": str(self.protocol_version)},
        )


@dataclass(frozen=True)
class OfficialSessionV1:
    """Resolved Official Session contract (current facts, not the ledger)."""

    session_id: str
    work_id: str
    title: str
    workspace_mode: str
    workspace_ref: Ref
    created_at: datetime
    watermark: int = 0
    status: str = "open"
    project_identity: Optional[str] = None

    def __post_init__(self) -> None:
        if not self.session_id or not self.work_id:
            raise ValueError("session_id and work_id are required")
        if self.watermark < 0:
            raise ValueError("watermark must be non-negative")


@dataclass(frozen=True)
class RecordOrigin:
    """Where one canonical record came from."""

    harness_type: str
    execution_id: Optional[str] = None
    native_format_version: Optional[str] = None

    def __post_init__(self) -> None:
        if not self.harness_type:
            raise ValueError("record origin harness_type is required")


@dataclass(frozen=True)
class CanonicalRecord:
    """The minimal sortable public-semantic record of an Official Session."""

    record_id: str
    session_id: str
    sequence: int
    turn_id: str
    event_type: str
    payload: Mapping[str, str]
    origin: RecordOrigin
    native_original_ref: Optional[Ref] = None
    created_at: Optional[datetime] = None

    def __post_init__(self) -> None:
        if not self.record_id or not self.session_id or not self.turn_id:
            raise ValueError("record_id, session_id and turn_id are required")
        if self.sequence < 0:
            raise ValueError("record sequence must be non-negative")


@dataclass(frozen=True)
class BindingSnapshot:
    """The per-turn frozen execution-parameter binding.

    All fields are neutral identities (provider ids, Refs, digests).  A
    missing optional binding is recorded explicitly as ``None``; absence
    never silently means "default".  ``turn_id`` is assigned by the Session
    Store when the turn is durably created; a caller-side draft may leave it
    empty.
    """

    turn_id: str = ""
    session_watermark: int = 0
    harness_provider_id: Optional[str] = None
    harness_provider_version: Optional[str] = None
    model_selection: Optional[str] = None
    profile_ref: Optional[Ref] = None
    workspace_ref: Optional[Ref] = None
    workspace_mode: Optional[str] = None
    runtime_host_ref: Optional[Ref] = None
    sandbox_ref: Optional[Ref] = None
    codec_id: Optional[str] = None
    codec_version: Optional[str] = None
    capability_digest: Optional[str] = None
    extra: Mapping[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.session_watermark < 0:
            raise ValueError("binding session_watermark must be non-negative")
        object.__setattr__(self, "extra", _bounded_metadata(self.extra))


@dataclass(frozen=True)
class TurnExecutionLink:
    """One Turn's link to one Execution attempt (Turn = 1..N Executions).

    The trailing fields are **reserved set-once facts** for the future
    Execution-DAG design: ``parent_execution_id`` names the prior Execution
    whose output this attempt continues from, ``input_session_ref`` the
    native session Ref this attempt consumed, ``output_native_session_ref``
    the native Session output Ref this attempt itself produced, and
    ``workspace_input_ref`` / ``workspace_output_ref`` the Workspace Ref
    facts of the attempt.  They record provenance only — they carry no
    cross-Harness translation semantics, never hold derived/translated
    session content, and once set they are immutable.
    """

    turn_id: str
    execution_id: str
    linked_at: Optional[datetime] = None
    parent_execution_id: Optional[str] = None
    input_session_ref: Optional[Ref] = None
    output_native_session_ref: Optional[Ref] = None
    workspace_input_ref: Optional[Ref] = None
    workspace_output_ref: Optional[Ref] = None

    def __post_init__(self) -> None:
        if not self.turn_id or not self.execution_id:
            raise ValueError("turn_id and execution_id are required")


@dataclass(frozen=True)
class TurnWatermark:
    """The Official Session watermark frozen for one turn's dispatch."""

    turn_id: str
    session_watermark: int

    def __post_init__(self) -> None:
        if not self.turn_id:
            raise ValueError("turn_id is required")
        if self.session_watermark < 0:
            raise ValueError("session watermark must be non-negative")


@dataclass(frozen=True)
class SessionEvent:
    """The durable session event envelope (ledger append unit).

    ``seq`` is per-session monotonically increasing and allocated by the
    Session Store inside the appending transaction.  ``terminal`` marks the
    terminal-once close of a Turn; the Store enforces terminal-once.
    """

    session_id: str
    seq: int
    event_id: str
    event_type: str
    turn_id: Optional[str] = None
    execution_id: Optional[str] = None
    payload: Mapping[str, str] = field(default_factory=dict)
    created_at: Optional[datetime] = None
    terminal: bool = False

    def __post_init__(self) -> None:
        if not self.session_id or not self.event_id or not self.event_type:
            raise ValueError("session_id, event_id and event_type are required")
        if self.seq < 0:
            raise ValueError("event seq must be non-negative")
        object.__setattr__(self, "payload", _bounded_metadata(self.payload, 32))


@dataclass(frozen=True)
class SessionTurnInputV1:
    """Frozen per-turn user input exchanged over the dispatch input surface.

    The whole text is bounded; binary attachments belong behind Refs, never
    inline in this contract or in the session ledger.
    """

    contract_id: ClassVar[str] = SESSION_TURN_INPUT_CONTRACT_ID

    turn_id: str = ""
    text: str = ""

    def __post_init__(self) -> None:
        if not self.turn_id:
            raise ValueError("session turn input turn_id is required")
        if len(self.text) > MAX_INPUT_TEXT_LENGTH:
            raise ValueError("session turn input text exceeds bounded length")
