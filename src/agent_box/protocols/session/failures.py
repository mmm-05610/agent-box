"""Typed failure vocabulary shared by the Session protocol, Store and Studio.

These are the public single-writer / recovery / idempotency error words:
callers branch on these types instead of string matching.  Messages must
never embed credential values, raw prompts, or host filesystem paths.
"""
from __future__ import annotations


class SessionError(RuntimeError):
    """Base class for all typed Official Session failures."""


class SessionNotFound(SessionError):
    pass


class TurnNotFound(SessionError):
    pass


class SessionWriterConflict(SessionError):
    """A second concurrent writer for one Session must fail closed."""


class TerminalAlreadyRecorded(SessionError):
    """The terminal fact of a Turn is already sealed (terminal-once)."""


class InvalidTurnTransition(SessionError):
    """A Turn state transition that this protocol forbids, e.g. a completed
    Turn re-entering running."""


class IdempotencyConflict(SessionError):
    """A stable idempotency key was reused with different request facts."""


class WatermarkViolation(SessionError):
    """The Session watermark may only advance after the corresponding batch
    is durably committed."""


class MalformedSessionState(SessionError):
    """Persisted Session state is malformed or corrupt; fail closed instead
    of treating it as an empty or default Session."""


class RecoveryRequired(SessionError):
    """An operation ended in a state that cannot be proven COMPLETE or
    ROLLED_BACK; explicit recovery is required before writing again."""


class RecoveryScopeMismatch(SessionError):
    """A recovery operation was addressed without (or with a wrong) session
    scope.  Recovery is session-bound and fails closed without leaking any
    fact about the other session's operation."""



class ResyncRequired(SessionError):
    """An event cursor is invalid or gapped; the consumer must resync."""

    def __init__(self, session_id: str, reason: str, current_watermark: int | None = None) -> None:
        self.session_id = session_id
        self.reason = reason
        self.current_watermark = current_watermark
        super().__init__(f"resync required for session {session_id}: {reason}")


class InvalidCursor(SessionError):
    """A cursor value failed validation before any read was attempted."""


class SessionCapabilityUnavailable(SessionError):
    """A Session capability is honestly unavailable (not implemented or not
    admitted); never silently degrade."""


class ExecutionFactConflict(SessionError):
    """A set-once per-Execution fact (e.g. the immutable native session
    output Ref) was written again with a different value; fail closed
    instead of rewriting provenance."""


class SchemaVersionUnsupported(SessionError):
    """A persisted Session Store schema version cannot be opened by this
    code: either the store is newer than the code, or it is older without an
    explicit registered migration.  Fail closed instead of guessing."""
