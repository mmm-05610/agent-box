"""Root Official Session protocol pack (pure, additive, provider-neutral).

This pack defines the public contract vocabulary for the Agent-Box Official
Session: resolved session identity, canonical records, turns and their
execution links, per-turn frozen bindings, the durable event envelope,
terminal outcomes, the Session Store SPI, the Session Codec SPI skeleton,
translation-loss reporting, and the shared single-writer / recovery /
idempotency error vocabulary.

Boundary rules (enforced by tests):

- no concrete plugin, FastAPI, SQLite, or filesystem imports;
- no Harness business identities or vendor session formats;
- no persistence: the Store SPI is declared here, implemented by plugins.

Work Core remains unaware of Session content; this pack may reference Work
Core's provider-neutral ``Ref`` value but nothing else.
"""
from __future__ import annotations

from .contracts import (
    SESSION_TURN_INPUT_CONTRACT_ID,
    SESSION_STORE_KIND,
    SESSION_CODEC_KIND,
    SESSION_PROTOCOL_VERSION,
    BindingSnapshot,
    CanonicalRecord,
    OfficialSessionV1,
    RecordOrigin,
    SessionEvent,
    SessionRefFacts,
    SessionTurnInputV1,
    TerminalOutcome,
    TurnExecutionLink,
    TurnRunPhase,
    TurnState,
    TurnWatermark,
)
from .capabilities import (
    CapabilityState,
    SessionCapabilityTruth,
)
from .codec import (
    CanonicalRecordDraft,
    CodecProbeRequest,
    CodecProbeResult,
    HarnessSessionCodec,
    ImportRequest,
    MaterializationRequest,
    NativeCompactRequest,
    NativeCompactResult,
    NativeImportBatch,
    NativeSessionView,
    NativeValidationResult,
)
from .failures import (
    IdempotencyConflict,
    InvalidCursor,
    InvalidTurnTransition,
    MalformedSessionState,
    RecoveryRequired,
    ExecutionFactConflict,
    RecoveryScopeMismatch,
    ResyncRequired,
    SchemaVersionUnsupported,
    SessionCapabilityUnavailable,
    SessionError,
    SessionNotFound,
    SessionWriterConflict,
    TerminalAlreadyRecorded,
    TurnNotFound,
    WatermarkViolation,
)
from .loss import (
    LossReport,
    LossSeverity,
    TranslationLoss,
)
from .store import (
    RecoveryOperation,
    SessionCreationRequest,
    SessionStore,
    TurnBeginRequest,
    TurnBeginResult,
    TurnRunView,
    TurnView,
    WriterLease,
    session_store_contribution,
)

__all__ = [
    "SESSION_PROTOCOL_VERSION",
    "SESSION_STORE_KIND",
    "SESSION_CODEC_KIND",
    "SESSION_TURN_INPUT_CONTRACT_ID",
    "BindingSnapshot",
    "CanonicalRecord",
    "OfficialSessionV1",
    "RecordOrigin",
    "SessionEvent",
    "SessionRefFacts",
    "SessionTurnInputV1",
    "TerminalOutcome",
    "TurnExecutionLink",
    "TurnRunPhase",
    "TurnState",
    "TurnWatermark",
    "CapabilityState",
    "SessionCapabilityTruth",
    "CanonicalRecordDraft",
    "CodecProbeRequest",
    "CodecProbeResult",
    "HarnessSessionCodec",
    "ImportRequest",
    "MaterializationRequest",
    "NativeCompactRequest",
    "NativeCompactResult",
    "NativeImportBatch",
    "NativeSessionView",
    "NativeValidationResult",
    "IdempotencyConflict",
    "InvalidCursor",
    "InvalidTurnTransition",
    "MalformedSessionState",
    "RecoveryRequired",
    "ExecutionFactConflict",
    "RecoveryScopeMismatch",
    "ResyncRequired",
    "SchemaVersionUnsupported",
    "SessionCapabilityUnavailable",
    "SessionError",
    "SessionNotFound",
    "SessionWriterConflict",
    "TerminalAlreadyRecorded",
    "TurnNotFound",
    "WatermarkViolation",
    "LossReport",
    "LossSeverity",
    "TranslationLoss",
    "RecoveryOperation",
    "SessionCreationRequest",
    "SessionStore",
    "TurnBeginRequest",
    "TurnBeginResult",
    "TurnRunView",
    "TurnView",
    "WriterLease",
    "session_store_contribution",
]
