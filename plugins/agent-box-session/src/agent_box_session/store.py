"""Concrete SQLite Session Store: the durable authority for Official Sessions.

Authority boundaries honored here:

- This store and the Work Core Repository are two independent authorities.
  Cross-authority creation (Session↔Work, Turn↔Execution) uses durable,
  idempotent, resumable sagas — never a claim of distributed ACID.
- Sessions, turns, bindings, the canonical/event ledger, the watermark,
  idempotency receipts, the writer lease and recovery operations all persist
  in this database and survive process restarts.
- The watermark advances only inside the same transaction that durably
  commits the corresponding batch.
- Malformed persisted state raises typed ``MalformedSessionState``; it is
  never treated as an empty Session.
- Diagnostics never include host paths, raw prompts, credentials or
  tracebacks.
"""
from __future__ import annotations

import hashlib
import dataclasses
import json
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Mapping, Optional

from agent_box.protocols.session import SESSION_TURN_INPUT_CONTRACT_ID
from agent_box.protocols.session.contracts import (
    BindingSnapshot,
    OfficialSessionV1,
    SessionEvent,
    SessionRefFacts,
    TerminalOutcome,
    TurnRunPhase,
    TurnState,
)
from agent_box.protocols.session.failures import (
    ExecutionFactConflict,
    IdempotencyConflict,
    InvalidCursor,
    InvalidTurnTransition,
    MalformedSessionState,
    RecoveryRequired,
    RecoveryScopeMismatch,
    ResyncRequired,
    SessionError,
    SessionNotFound,
    SessionWriterConflict,
    TerminalAlreadyRecorded,
    TurnNotFound,
    WatermarkViolation,
)
from agent_box.protocols.session.store import (
    RecoveryOperation,
    SessionCreationRequest,
    SessionStore,  # noqa: F401  (SPI re-export for type checkers)
    TurnBeginRequest,
    TurnBeginResult,
    TurnExecutionLink,
    TurnRunView,
    TurnView,
    WriterLease,
)
from agent_box.work_core.models import Ref, RefType

from . import schema

STORE_ID = "official-session-store"

# Saga states (create_session / begin_turn)
SAGA_INTENT = "INTENT"
SAGA_SESSION_CREATED = "SESSION_CREATED"
SAGA_TURN_CREATED = "TURN_CREATED"
SAGA_COMPLETE = "COMPLETE"
SAGA_RECOVERY_REQUIRED = "RECOVERY_REQUIRED"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.isoformat()


def _parse(value: Optional[str]) -> Optional[datetime]:
    return datetime.fromisoformat(value) if value else None


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def _dump_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _load_json(raw: str, context: str) -> object:
    try:
        return json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        raise MalformedSessionState(
            f"persisted session state is malformed: {context}"
        ) from exc


def _ref_to_json(ref: Optional[Ref]) -> Optional[str]:
    if ref is None:
        return None
    return _dump_json({
        "type": ref.type.value,
        "provider": ref.provider,
        "native_id": ref.native_id,
        "uri": ref.uri,
        "metadata": dict(ref.metadata),
    })


def _ref_from_json(raw: Optional[str]) -> Optional[Ref]:
    if raw is None:
        return None
    payload = _load_json(raw, "Ref value")
    if not isinstance(payload, dict):
        raise MalformedSessionState("persisted Ref is malformed")
    try:
        return Ref(
            RefType(payload["type"]),
            payload["provider"],
            payload["native_id"],
            payload.get("uri"),
            payload.get("metadata") or {},
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise MalformedSessionState("persisted Ref is malformed") from exc


def _binding_to_json(binding: BindingSnapshot, turn_id: Optional[str] = None) -> str:
    return _dump_json({
        "turn_id": turn_id if turn_id is not None else binding.turn_id,
        "session_watermark": binding.session_watermark,
        "harness_provider_id": binding.harness_provider_id,
        "harness_provider_version": binding.harness_provider_version,
        "model_selection": binding.model_selection,
        "profile_ref": _ref_to_json(binding.profile_ref),
        "workspace_ref": _ref_to_json(binding.workspace_ref),
        "workspace_mode": binding.workspace_mode,
        "runtime_host_ref": _ref_to_json(binding.runtime_host_ref),
        "sandbox_ref": _ref_to_json(binding.sandbox_ref),
        "codec_id": binding.codec_id,
        "codec_version": binding.codec_version,
        "capability_digest": binding.capability_digest,
        "extra": dict(binding.extra),
    })


def _binding_from_json(raw: str) -> BindingSnapshot:
    payload = _load_json(raw, "binding snapshot")
    if not isinstance(payload, dict):
        raise MalformedSessionState("persisted binding snapshot is malformed")
    try:
        return BindingSnapshot(
            turn_id=payload["turn_id"],
            session_watermark=payload["session_watermark"],
            harness_provider_id=payload.get("harness_provider_id"),
            harness_provider_version=payload.get("harness_provider_version"),
            model_selection=payload.get("model_selection"),
            profile_ref=_ref_from_json(payload.get("profile_ref")),
            workspace_ref=_ref_from_json(payload.get("workspace_ref")),
            workspace_mode=payload.get("workspace_mode"),
            runtime_host_ref=_ref_from_json(payload.get("runtime_host_ref")),
            sandbox_ref=_ref_from_json(payload.get("sandbox_ref")),
            codec_id=payload.get("codec_id"),
            codec_version=payload.get("codec_version"),
            capability_digest=payload.get("capability_digest"),
            extra=payload.get("extra") or {},
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise MalformedSessionState("persisted binding snapshot is malformed") from exc


def turn_input_ref(turn_id: str) -> Ref:
    """The stable dispatch input Ref for one Turn's frozen user input."""
    return Ref(
        RefType.SESSION,
        "agent-box-session-inputs",
        f"turn-input:{turn_id}",
        metadata={"contract": SESSION_TURN_INPUT_CONTRACT_ID},
    )


# -- canonical request digests (strict idempotency) ---------------------------

_MAX_FACTS_ITEMS = 16


def _bounded_facts(value: Mapping[str, str], context: str) -> dict[str, str]:
    """Bound and validate a caller-supplied string-to-string facts map."""
    result = dict(value)
    if len(result) > _MAX_FACTS_ITEMS:
        raise ValueError(f"{context} has more than {_MAX_FACTS_ITEMS} items")
    for key, item in result.items():
        if not isinstance(key, str) or not isinstance(item, str):
            raise ValueError(f"{context} must be a flat string-to-string map")
        if len(key) > 64 or len(item) > 256:
            raise ValueError(f"{context} item exceeds bounded size")
    return result


def _canonical_digest(payload: Mapping[str, object]) -> str:
    """sha256 over the canonical (sorted, compact) JSON of the payload."""
    canonical = _dump_json(payload)
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _create_session_digest(request: SessionCreationRequest) -> str:
    """Canonical request digest of one create-session saga intent."""
    return _canonical_digest({
        "kind": "create_session",
        "title": request.title,
        "objective": request.objective,
        "workspace": _ref_to_json(request.workspace_ref),
        "workspace_mode": request.workspace_mode,
        "project_identity": request.project_identity or "",
        "metadata": dict(request.metadata),
    })


def _begin_turn_digest(request: TurnBeginRequest) -> str:
    """Canonical request digest of one begin-turn saga intent.

    The input text enters only as its sha256.  The binding is digested with
    the store-assigned ``turn_id`` neutralized (the caller's draft cannot
    know it) and with ``session_watermark`` normalized to zero: the frozen
    watermark is derived server-side state allocated during the saga, not a
    caller-supplied request fact.  Every caller-supplied binding fact
    (provider id/version, model selection, all Refs, codec, capability
    digest, extra) is covered, so any real binding revision conflicts.
    """
    binding = dataclasses.replace(request.binding, session_watermark=0)
    return _canonical_digest({
        "kind": "begin_turn",
        "session_id": request.session_id,
        "input_text_sha256": hashlib.sha256(
            request.input_text.encode("utf-8")
        ).hexdigest(),
        "binding": _binding_to_json(binding, turn_id=""),
    })


@dataclass(frozen=True)
class StoreCallbacks:
    """Idempotent cross-authority operations wired by the owning plugin.

    ``create_work`` creates (or confirms) one Work Core Work with the given
    explicit, saga-persisted id.  ``work_exists`` probes Work Core.
    ``create_execution`` creates (or confirms) one Work Core Execution for a
    turn with the turn's frozen harness provider id and must be idempotent
    per (work_id, execution_id).
    """

    create_work: Optional[Callable[[str, str, Mapping[str, str]], str]] = None
    work_exists: Optional[Callable[[str], bool]] = None
    create_execution: Optional[Callable[[str, str, str], str]] = None


class SQLiteSessionStore:
    """SQLite implementation of the Session Store SPI.

    One connection guarded by a re-entrant lock; all multi-step invariants
    (seq allocation, watermark advance, terminal-once, lease checks, saga
    transitions) hold inside single ``with conn:`` transactions.
    """

    store_id = STORE_ID

    def __init__(
        self,
        path: Path,
        *,
        callbacks: StoreCallbacks | None = None,
        fault_hook: Optional[Callable[[str], None]] = None,
    ) -> None:
        self._path = Path(path)
        self._callbacks = callbacks or StoreCallbacks()
        # Documented test seam: invoked before critical saga steps so fault
        # injection can crash the process between durable steps.
        self._fault_hook = fault_hook
        self._lock = threading.RLock()
        self._conn: Optional[object] = None

    # -- plumbing ---------------------------------------------------------

    def _connection(self):
        with self._lock:
            if self._conn is None:
                self._path.parent.mkdir(parents=True, exist_ok=True)
                self._conn = schema.connect(self._path)
            return self._conn

    def _fault(self, step: str) -> None:
        if self._fault_hook is not None:
            self._fault_hook(step)

    def close(self) -> None:
        with self._lock:
            if self._conn is not None:
                self._conn.close()
                self._conn = None

    # -- row loaders -------------------------------------------------------

    def _session_row(self, conn, session_id: str):
        row = conn.execute(
            "SELECT * FROM sessions WHERE session_id = ?", (session_id,)
        ).fetchone()
        if row is None:
            raise SessionNotFound(f"session not found: {session_id}")
        return row

    def _load_session(self, conn, row) -> OfficialSessionV1:
        return OfficialSessionV1(
            session_id=row["session_id"],
            work_id=row["work_id"],
            title=row["title"],
            workspace_mode=row["workspace_mode"],
            workspace_ref=Ref(
                RefType.WORKSPACE,
                row["workspace_provider"],
                row["workspace_native_id"],
                row["workspace_uri"],
                _load_json(row["workspace_metadata_json"], "workspace metadata") or {},
            ),
            created_at=_parse(row["created_at"]) or _now(),
            watermark=row["watermark"],
            status=row["status"],
            project_identity=row["project_identity"],
        )

    def _load_turn(self, conn, session_id: str, turn_id: str) -> TurnView:
        row = conn.execute(
            "SELECT * FROM turns WHERE turn_id = ? AND session_id = ?",
            (turn_id, session_id),
        ).fetchone()
        if row is None:
            raise TurnNotFound(f"turn not found: {turn_id}")
        links = conn.execute(
            "SELECT execution_id FROM turn_executions WHERE turn_id = ? "
            "ORDER BY linked_at, execution_id",
            (turn_id,),
        ).fetchall()
        return TurnView(
            turn_id=row["turn_id"],
            session_id=row["session_id"],
            state=TurnState(row["state"]),
            binding=_binding_from_json(row["binding_json"]),
            execution_ids=tuple(link["execution_id"] for link in links),
            idempotency_key=row["idempotency_key"],
            input_ref=turn_input_ref(turn_id),
            created_at=_parse(row["created_at"]),
            terminal_outcome=(
                TerminalOutcome(row["terminal_outcome"])
                if row["terminal_outcome"]
                else None
            ),
            committed_watermark=row["committed_watermark"],
        )

    # -- ledger internals (must run inside an open transaction) ------------

    def _append_event_tx(
        self,
        conn,
        session_id: str,
        event_type: str,
        payload: Mapping[str, str],
        *,
        turn_id: Optional[str] = None,
        execution_id: Optional[str] = None,
        terminal: bool = False,
    ) -> SessionEvent:
        row = self._session_row(conn, session_id)
        seq = row["event_seq_next"]
        if terminal and turn_id is not None:
            turn = conn.execute(
                "SELECT terminal_outcome FROM turns WHERE turn_id = ?", (turn_id,)
            ).fetchone()
            if turn is None:
                raise TurnNotFound(f"turn not found: {turn_id}")
            if turn["terminal_outcome"] is not None:
                raise TerminalAlreadyRecorded(
                    f"terminal outcome already recorded for turn {turn_id}"
                )
        now = _now()
        event = SessionEvent(
            session_id=session_id,
            seq=seq,
            event_id=_new_id("evt"),
            event_type=event_type,
            turn_id=turn_id,
            execution_id=execution_id,
            payload=dict(payload),
            created_at=now,
            terminal=terminal,
        )
        conn.execute(
            "INSERT INTO session_events (session_id, seq, event_id, event_type, "
            "turn_id, execution_id, payload_json, terminal, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                session_id,
                seq,
                event.event_id,
                event_type,
                turn_id,
                execution_id,
                _dump_json(dict(payload)),
                1 if terminal else 0,
                _iso(now),
            ),
        )
        conn.execute(
            "UPDATE sessions SET event_seq_next = ? WHERE session_id = ?",
            (seq + 1, session_id),
        )
        return event

    # -- session creation saga ---------------------------------------------

    def create_session(
        self,
        request: SessionCreationRequest,
        *,
        create_work: Optional[Callable[[str, str, Mapping[str, str]], str]] = None,
        work_exists: Optional[Callable[[str], bool]] = None,
    ) -> OfficialSessionV1:
        """Durable, idempotent Session+Work creation saga.

        Steps (each durable before the next):
          INTENT (with the canonical request digest) → create/confirm Work
          (external authority) → WORK_CREATED → create Session row + mapping
          + SESSION_CREATED event + receipt → COMPLETE.

        Strict idempotency: the digest check happens at saga lookup time,
        before ANY callback or write.  Same key + same digest replays
        exactly; same key + different digest raises ``IdempotencyConflict``
        before any external side effect; a key already bound to another
        operation scope conflicts as well.

        The optional ``create_work``/``work_exists`` callables override the
        wired cross-authority callbacks for this call only.
        """
        if not isinstance(request, SessionCreationRequest):
            raise TypeError("create_session requires SessionCreationRequest")
        conn = self._connection()
        with self._lock:
            digest = _create_session_digest(request)
            saga = conn.execute(
                "SELECT * FROM session_saga_ops WHERE op_id = ?",
                (request.idempotency_key,),
            ).fetchone()
            if saga is not None:
                if saga["kind"] != "create_session":
                    raise IdempotencyConflict(
                        "idempotency key already used for a different operation scope"
                    )
                if saga["request_digest"] != digest:
                    raise IdempotencyConflict(
                        "idempotency key reused with different request facts"
                    )
                if saga["state"] == SAGA_COMPLETE:
                    return self.get_session(saga["session_id"])
            else:
                now = _now()
                session_id, work_id = _new_id("sess"), _new_id("work")
                detail = {
                    "title": request.title,
                    "objective": request.objective,
                    "workspace": _ref_to_json(request.workspace_ref),
                    "workspace_mode": request.workspace_mode,
                    "project_identity": request.project_identity or "",
                    "metadata": _dump_json(dict(request.metadata)),
                }
                with conn:
                    conn.execute(
                        "INSERT INTO session_saga_ops (op_id, kind, state, session_id, "
                        "work_id, turn_id, detail_json, request_digest, created_at, "
                        "updated_at) VALUES (?, 'create_session', ?, ?, ?, NULL, ?, ?, ?, ?)",
                        (
                            request.idempotency_key,
                            SAGA_INTENT,
                            session_id,
                            work_id,
                            _dump_json(detail),
                            digest,
                            _iso(now),
                            _iso(now),
                        ),
                    )
                saga = conn.execute(
                    "SELECT * FROM session_saga_ops WHERE op_id = ?",
                    (request.idempotency_key,),
                ).fetchone()

            session_id, work_id = saga["session_id"], saga["work_id"]
            detail = _load_json(saga["detail_json"], "saga detail")

            if saga["state"] in (SAGA_INTENT, SAGA_RECOVERY_REQUIRED):
                self._fault("create_session:pre_work")
                self._create_or_confirm_work(
                    conn, request.idempotency_key, work_id, detail,
                    create_work=create_work, work_exists=work_exists,
                )
            self._fault("create_session:pre_session")
            return self._create_session_row(
                conn, request.idempotency_key, session_id, work_id, detail
            )

    def _create_or_confirm_work(
        self, conn, op_id: str, work_id: str, detail: Mapping[str, object],
        *,
        create_work: Optional[Callable[[str, str, Mapping[str, str]], str]] = None,
        work_exists: Optional[Callable[[str], bool]] = None,
    ) -> None:
        create_work = create_work or self._callbacks.create_work
        work_exists = work_exists or self._callbacks.work_exists
        if create_work is None or work_exists is None:
            raise SessionError(
                "session store is not wired to a Work authority"
            )
        metadata = _load_json(detail.get("metadata") or "{}", "saga metadata")
        try:
            if not work_exists(work_id):
                create_work(work_id, str(detail.get("objective") or ""), metadata or {})
        except RecoveryRequired:
            raise
        except Exception as exc:
            self._record_recovery(op_id, "create_session", session_id=None, detail="work creation failed")
            raise RecoveryRequired(
                "session creation saga cannot prove Work outcome; recovery required"
            ) from exc
        now = _now()
        with conn:
            conn.execute(
                "UPDATE session_saga_ops SET state = ?, updated_at = ? WHERE op_id = ?",
                ("WORK_CREATED", _iso(now), op_id),
            )

    def _create_session_row(
        self, conn, op_id: str, session_id: str, work_id: str, detail: Mapping[str, object]
    ) -> OfficialSessionV1:
        workspace_ref = _ref_from_json(detail.get("workspace"))
        if workspace_ref is None:
            raise MalformedSessionState("saga detail lost the workspace Ref")
        now = _now()
        with conn:
            row = conn.execute(
                "SELECT state, request_digest FROM session_saga_ops WHERE op_id = ?",
                (op_id,),
            ).fetchone()
            if row["state"] != SAGA_COMPLETE:
                conn.execute(
                    "INSERT INTO sessions (session_id, work_id, title, status, "
                    "workspace_mode, workspace_provider, workspace_native_id, "
                    "workspace_uri, workspace_metadata_json, project_identity, "
                    "event_seq_next, watermark, created_at) "
                    "VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, 1, 0, ?)",
                    (
                        session_id,
                        work_id,
                        str(detail.get("title") or ""),
                        str(detail.get("workspace_mode") or "live"),
                        workspace_ref.provider,
                        workspace_ref.native_id,
                        workspace_ref.uri,
                        _dump_json(dict(workspace_ref.metadata)),
                        detail.get("project_identity") or None,
                        _iso(now),
                    ),
                )
                self._append_event_tx(
                    conn,
                    session_id,
                    "SESSION_CREATED",
                    {"work_id": work_id, "workspace_mode": str(detail.get("workspace_mode") or "live")},
                )
                conn.execute(
                    "INSERT OR REPLACE INTO idempotency_receipts "
                    "(idempotency_key, scope, result_json, request_digest, created_at) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (
                        op_id,
                        "create_session",
                        _dump_json({"session_id": session_id, "work_id": work_id}),
                        row["request_digest"] or "",
                        _iso(now),
                    ),
                )
                conn.execute(
                    "UPDATE session_saga_ops SET state = ?, updated_at = ? WHERE op_id = ?",
                    (SAGA_COMPLETE, _iso(now), op_id),
                )
        return self.get_session(session_id)

    def _record_recovery(
        self,
        op_id: str,
        kind: str,
        *,
        session_id: Optional[str],
        detail: str,
    ) -> None:
        conn = self._connection()
        now = _now()
        if session_id is None:
            # Bind the operation to the session its saga is already bound
            # to (persisted at INTENT time), so recovery stays session-scoped.
            saga = conn.execute(
                "SELECT session_id FROM session_saga_ops WHERE op_id = ?", (op_id,)
            ).fetchone()
            session_id = saga["session_id"] if saga is not None else None
        with conn:
            conn.execute(
                "INSERT INTO recovery_operations (op_id, session_id, kind, state, "
                "detail, created_at, updated_at) VALUES (?, ?, ?, 'RECOVERY_REQUIRED', ?, ?, ?) "
                "ON CONFLICT(op_id) DO UPDATE SET state = 'RECOVERY_REQUIRED', "
                "session_id = excluded.session_id, "
                "detail = excluded.detail, updated_at = excluded.updated_at",
                (op_id, session_id, kind, detail, _iso(now), _iso(now)),
            )
            conn.execute(
                "UPDATE session_saga_ops SET state = ?, updated_at = ? WHERE op_id = ?",
                (SAGA_RECOVERY_REQUIRED, _iso(now), op_id),
            )

    # -- exact reads ---------------------------------------------------------

    def get_session(self, session_id: str) -> OfficialSessionV1:
        conn = self._connection()
        with self._lock:
            return self._load_session(conn, self._session_row(conn, session_id))

    def list_sessions(self) -> tuple[OfficialSessionV1, ...]:
        conn = self._connection()
        with self._lock:
            rows = conn.execute(
                "SELECT * FROM sessions ORDER BY created_at, session_id"
            ).fetchall()
            return tuple(self._load_session(conn, row) for row in rows)

    def work_id_for(self, session_id: str) -> str:
        return self.get_session(session_id).work_id

    def session_id_for_work(self, work_id: str) -> str:
        conn = self._connection()
        with self._lock:
            row = conn.execute(
                "SELECT session_id FROM sessions WHERE work_id = ?", (work_id,)
            ).fetchone()
            if row is None:
                raise SessionNotFound(f"no session mapped to work: {work_id}")
            return row["session_id"]

    def session_ref_facts(self, session_id: str) -> SessionRefFacts:
        session = self.get_session(session_id)
        return SessionRefFacts(session.session_id, session.work_id)

    # -- single-writer lease ---------------------------------------------------

    def acquire_writer_lease(self, session_id: str, owner_id: str) -> WriterLease:
        conn = self._connection()
        with self._lock, conn:
            self._session_row(conn, session_id)
            row = conn.execute(
                "SELECT owner_id, acquired_at FROM writer_leases WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            if row is not None:
                if row["owner_id"] == owner_id:
                    return WriterLease(session_id, owner_id, _parse(row["acquired_at"]))
                raise SessionWriterConflict(
                    "another writer holds the session lease; fail closed"
                )
            now = _now()
            conn.execute(
                "INSERT INTO writer_leases (session_id, owner_id, acquired_at) "
                "VALUES (?, ?, ?)",
                (session_id, owner_id, _iso(now)),
            )
            return WriterLease(session_id, owner_id, now)

    def _require_lease(self, conn, session_id: str, lease: WriterLease) -> None:
        if not isinstance(lease, WriterLease) or lease.session_id != session_id:
            raise SessionWriterConflict("writer lease does not match this session")
        row = conn.execute(
            "SELECT owner_id FROM writer_leases WHERE session_id = ?", (session_id,)
        ).fetchone()
        if row is None or row["owner_id"] != lease.owner_id:
            raise SessionWriterConflict("writer lease is not held by this owner")

    def release_writer_lease(self, session_id: str, owner_id: str) -> None:
        conn = self._connection()
        with self._lock, conn:
            cursor = conn.execute(
                "DELETE FROM writer_leases WHERE session_id = ? AND owner_id = ?",
                (session_id, owner_id),
            )
            if cursor.rowcount == 0:
                raise SessionWriterConflict(
                    "writer lease not held by this owner; nothing released"
                )

    def active_leases(self, session_id: str | None = None) -> tuple[WriterLease, ...]:
        """Read the currently held writer leases (recovery/diagnostics view).

        Exposes exactly the facts a human or API caller needs to perform a
        CAS break-lease (owner id, acquired time) — never credential or
        prompt content.
        """
        conn = self._connection()
        with self._lock:
            sql = "SELECT session_id, owner_id, acquired_at FROM writer_leases"
            params: tuple = ()
            if session_id is not None:
                sql += " WHERE session_id = ?"
                params = (session_id,)
            sql += " ORDER BY acquired_at, session_id"
            return tuple(
                WriterLease(row["session_id"], row["owner_id"], _parse(row["acquired_at"]))
                for row in conn.execute(sql, params).fetchall()
            )

    def break_writer_lease(
        self,
        session_id: str,
        *,
        reason: str,
        expected_owner_id: str,
        expected_turn_id: str | None = None,
    ) -> None:
        """Break a stale writer lease after compare-and-set re-validation.

        Fail-closed semantics: the session must exist; the current lease
        owner must still equal ``expected_owner_id`` (never delete on
        mismatch); when ``expected_turn_id`` is given, that turn must exist
        in THIS session (``TurnNotFound`` otherwise) and the session must
        not have a RUNNING turn other than it.  No lease held at all is an
        idempotent success; every attempt (successful or not, and even with
        nothing to break) records a ``break_lease`` recovery operation bound
        to the session.
        """
        if not expected_owner_id:
            raise SessionWriterConflict(
                "break_writer_lease requires the expected owner id"
            )
        if not reason:
            reason = "unspecified"
        conn = self._connection()
        with self._lock, conn:
            self._session_row(conn, session_id)
            if expected_turn_id is not None:
                turn_exists = conn.execute(
                    "SELECT 1 FROM turns WHERE turn_id = ? AND session_id = ?",
                    (expected_turn_id, session_id),
                ).fetchone()
                if turn_exists is None:
                    raise TurnNotFound(
                        "expected turn does not exist in this session"
                    )
            row = conn.execute(
                "SELECT owner_id FROM writer_leases WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            if row is not None and row["owner_id"] != expected_owner_id:
                raise SessionWriterConflict(
                    "current lease owner does not match the expected owner; "
                    "fail closed, nothing deleted"
                )
            running = conn.execute(
                "SELECT turn_id FROM turns WHERE session_id = ? AND state = ?",
                (session_id, TurnState.RUNNING.value),
            ).fetchall()
            if running and (
                expected_turn_id is None
                or all(item["turn_id"] != expected_turn_id for item in running)
            ):
                raise SessionWriterConflict(
                    "session has a running turn; breaking the lease is unsafe"
                )
            now = _iso(_now())
            conn.execute("DELETE FROM writer_leases WHERE session_id = ?", (session_id,))
            conn.execute(
                "INSERT INTO recovery_operations (op_id, session_id, kind, state, "
                "detail, created_at, updated_at) VALUES (?, ?, 'break_lease', 'RESOLVED', ?, ?, ?)",
                (_new_id("rec"), session_id, reason[:256], now, now),
            )

    # -- turns -----------------------------------------------------------------

    def begin_turn(
        self,
        request: TurnBeginRequest,
        lease: WriterLease,
        *,
        create_execution: Optional[Callable[[str, str, str], str]] = None,
    ) -> TurnBeginResult:
        """Durable, idempotent turn+execution creation saga.

        Steps: INTENT (turn facts + canonical request digest persisted) →
        turn row + run journal (``turn_runs`` at PREPARED) + binding + input
        + TURN_STARTED event → TURN_CREATED → create/confirm Execution
        (external authority) → link + receipt → COMPLETE.

        Strict idempotency: the digest check happens at saga lookup time,
        before ANY callback or write.  Same key + same digest replays
        exactly (``replayed=True`` for a COMPLETE saga); same key + a
        different digest raises ``IdempotencyConflict`` before any external
        side effect; a key bound to another operation scope conflicts.

        A fresh or resuming begin requires the writer lease; a replay of a
        COMPLETE saga is read-only and needs no lease.
        """
        if not isinstance(request, TurnBeginRequest):
            raise TypeError("begin_turn requires TurnBeginRequest")
        conn = self._connection()
        with self._lock:
            digest = _begin_turn_digest(request)
            saga = conn.execute(
                "SELECT * FROM session_saga_ops WHERE op_id = ?",
                (request.idempotency_key,),
            ).fetchone()
            if saga is not None:
                if saga["kind"] != "begin_turn":
                    raise IdempotencyConflict(
                        "idempotency key already used for a different operation scope"
                    )
                if saga["request_digest"] != digest:
                    raise IdempotencyConflict(
                        "idempotency key reused with different request facts"
                    )
                if saga["session_id"] != request.session_id:
                    raise IdempotencyConflict(
                        "idempotency key belongs to another session"
                    )
                if saga["state"] == SAGA_COMPLETE:
                    turn = self._load_turn(conn, request.session_id, saga["turn_id"])
                    return TurnBeginResult(
                        turn_id=turn.turn_id,
                        session_id=request.session_id,
                        state=turn.state,
                        execution_id=(
                            turn.execution_ids[0] if turn.execution_ids else None
                        ),
                        replayed=True,
                        frozen_watermark=turn.binding.session_watermark,
                    )
                if saga["state"] == SAGA_RECOVERY_REQUIRED:
                    raise RecoveryRequired(
                        "turn creation saga requires recovery before writing again"
                    )
                if saga["state"] == SAGA_TURN_CREATED:
                    # Crash window between the durable turn creation and the
                    # external Execution creation: resume under the lease.
                    with conn:
                        self._require_lease(conn, request.session_id, lease)
                    self._fault("begin_turn:pre_execution")
                    return self._link_execution(
                        conn, request.idempotency_key, request.session_id,
                        saga["turn_id"], create_execution=create_execution,
                    )
                raise IdempotencyConflict(
                    "begin_turn saga is in an unexpected state for this key"
                )

            # A fresh begin requires the writer lease.
            with conn:
                self._require_lease(conn, request.session_id, lease)
                session = self._load_session(conn, self._session_row(conn, request.session_id))
                if session.status != "open":
                    raise InvalidTurnTransition("session is not open for new turns")
                pending = conn.execute(
                    "SELECT turn_id FROM turns WHERE session_id = ? AND state = ?",
                    (request.session_id, TurnState.RUNNING.value),
                ).fetchall()
                if pending:
                    raise SessionWriterConflict(
                        "session already has a running turn; single-writer invariant"
                    )
                now = _now()
                turn_id = _new_id("turn")
                detail = {
                    "input_text": request.input_text,
                    "binding": _binding_to_json(request.binding, turn_id),
                }
                conn.execute(
                    "INSERT INTO session_saga_ops (op_id, kind, state, session_id, "
                    "work_id, turn_id, detail_json, request_digest, created_at, "
                    "updated_at) VALUES (?, 'begin_turn', ?, ?, NULL, ?, ?, ?, ?, ?)",
                    (
                        request.idempotency_key,
                        SAGA_INTENT,
                        request.session_id,
                        turn_id,
                        _dump_json(detail),
                        digest,
                        _iso(now),
                        _iso(now),
                    ),
                )
                conn.execute(
                    "INSERT INTO turns (turn_id, session_id, state, idempotency_key, "
                    "binding_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (
                        turn_id,
                        request.session_id,
                        TurnState.RUNNING.value,
                        request.idempotency_key,
                        _binding_to_json(request.binding, turn_id),
                        _iso(now),
                        _iso(now),
                    ),
                )
                # The run-transaction journal row is created in the SAME
                # transaction as the turn row: from this point on, a
                # restarted process can always discover this run.
                conn.execute(
                    "INSERT INTO turn_runs (turn_id, session_id, execution_id, "
                    "dispatch_id, dispatch_digest, phase, recovery_facts_json, "
                    "created_at, updated_at) VALUES (?, ?, NULL, NULL, NULL, ?, '{}', ?, ?)",
                    (
                        turn_id,
                        request.session_id,
                        TurnRunPhase.PREPARED.value,
                        _iso(now),
                        _iso(now),
                    ),
                )
                conn.execute(
                    "INSERT INTO turn_inputs (turn_id, text) VALUES (?, ?)",
                    (turn_id, request.input_text),
                )
                self._append_event_tx(
                    conn,
                    request.session_id,
                    "TURN_STARTED",
                    {"turn_id": turn_id},
                    turn_id=turn_id,
                )
                conn.execute(
                    "UPDATE session_saga_ops SET state = ?, updated_at = ? WHERE op_id = ?",
                    (SAGA_TURN_CREATED, _iso(now), request.idempotency_key),
                )
            self._fault("begin_turn:pre_execution")
            return self._link_execution(
                conn, request.idempotency_key, request.session_id, turn_id,
                create_execution=create_execution,
            )

    def _link_execution(
        self, conn, op_id: str, session_id: str, turn_id: str,
        *,
        create_execution: Optional[Callable[[str, str, str], str]] = None,
    ) -> TurnBeginResult:
        create_execution = create_execution or self._callbacks.create_execution
        if create_execution is None:
            raise SessionError("session store is not wired to an Execution authority")
        with self._lock:
            work_id = self.work_id_for(session_id)
            provider_id = self._load_turn(conn, session_id, turn_id).binding.harness_provider_id
            if not provider_id:
                raise SessionError(
                    "turn binding does not freeze a harness provider id"
                )
            try:
                self._fault("begin_turn:execution")
                execution_id = create_execution(work_id, turn_id, provider_id)
            except RecoveryRequired:
                raise
            except Exception as exc:
                self._record_recovery(op_id, "begin_turn", session_id=session_id, detail="execution creation failed")
                raise RecoveryRequired(
                    "turn creation saga cannot prove Execution outcome; recovery required"
                ) from exc
            now = _now()
            with conn:
                conn.execute(
                    "INSERT OR IGNORE INTO turn_executions (turn_id, execution_id, linked_at) "
                    "VALUES (?, ?, ?)",
                    (turn_id, execution_id, _iso(now)),
                )
                # Record the execution identity on the run journal row (not a
                # phase change: the run stays at its current phase).
                conn.execute(
                    "UPDATE turn_runs SET execution_id = ?, updated_at = ? "
                    "WHERE turn_id = ?",
                    (execution_id, _iso(now), turn_id),
                )
                saga_row = conn.execute(
                    "SELECT request_digest FROM session_saga_ops WHERE op_id = ?",
                    (op_id,),
                ).fetchone()
                conn.execute(
                    "INSERT OR REPLACE INTO idempotency_receipts "
                    "(idempotency_key, scope, result_json, request_digest, created_at) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (
                        op_id,
                        "begin_turn",
                        _dump_json({
                            "session_id": session_id,
                            "turn_id": turn_id,
                            "execution_id": execution_id,
                        }),
                        (saga_row["request_digest"] if saga_row is not None else "") or "",
                        _iso(now),
                    ),
                )
                self._append_event_tx(
                    conn,
                    session_id,
                    "EXECUTION_LINKED",
                    {"turn_id": turn_id, "execution_id": execution_id},
                    turn_id=turn_id,
                    execution_id=execution_id,
                )
                conn.execute(
                    "UPDATE session_saga_ops SET state = ?, updated_at = ? WHERE op_id = ?",
                    (SAGA_COMPLETE, _iso(now), op_id),
                )
            turn = self._load_turn(conn, session_id, turn_id)
            return TurnBeginResult(
                turn_id=turn.turn_id,
                session_id=session_id,
                state=turn.state,
                execution_id=execution_id,
                replayed=False,
                frozen_watermark=turn.binding.session_watermark,
            )

    def get_turn(self, session_id: str, turn_id: str) -> TurnView:
        conn = self._connection()
        with self._lock:
            self._session_row(conn, session_id)
            return self._load_turn(conn, session_id, turn_id)

    def link_execution(
        self,
        session_id: str,
        turn_id: str,
        execution_id: str,
        lease: WriterLease,
        *,
        parent_execution_id: Optional[str] = None,
        input_session_ref: Optional[Ref] = None,
        workspace_input_ref: Optional[Ref] = None,
    ) -> TurnExecutionLink:
        """Attach one more Execution to a Turn (Turn = 1..N Executions).

        The optional facts are reserved set-once provenance for the future
        Execution-DAG design (see :class:`TurnExecutionLink`); they never
        carry translation semantics.
        """
        conn = self._connection()
        with self._lock, conn:
            self._session_row(conn, session_id)
            turn = self._load_turn(conn, session_id, turn_id)
            if turn.state.terminal:
                raise InvalidTurnTransition(
                    "cannot link an Execution to a terminal turn"
                )
            self._require_lease(conn, session_id, lease)
            linked_at = _iso(_now())
            conn.execute(
                "INSERT INTO turn_executions (turn_id, execution_id, linked_at, "
                "parent_execution_id, input_session_ref_json, workspace_input_ref_json) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    turn_id,
                    execution_id,
                    linked_at,
                    parent_execution_id,
                    _ref_to_json(input_session_ref),
                    _ref_to_json(workspace_input_ref),
                ),
            )
            self._append_event_tx(
                conn,
                session_id,
                "EXECUTION_LINKED",
                {"turn_id": turn_id, "execution_id": execution_id},
                turn_id=turn_id,
                execution_id=execution_id,
            )
        return TurnExecutionLink(
            turn_id=turn_id,
            execution_id=execution_id,
            linked_at=_parse(linked_at),
            parent_execution_id=parent_execution_id,
            input_session_ref=input_session_ref,
            workspace_input_ref=workspace_input_ref,
        )

    # -- reserved per-Execution facts (set-once, immutable) -----------------

    def _load_link(self, conn, session_id: str, turn_id: str, execution_id: str) -> TurnExecutionLink:
        """Ownership-checked exact read of one Turn↔Execution link.

        The JOIN constrains the Turn to belong to ``session_id``; a foreign
        (turn, execution) pair is indistinguishable from a missing one —
        the same typed not-found, no cross-Session existence leak.
        """
        self._session_row(conn, session_id)
        row = conn.execute(
            "SELECT te.* FROM turn_executions te "
            "JOIN turns t ON te.turn_id = t.turn_id "
            "WHERE te.turn_id = ? AND te.execution_id = ? AND t.session_id = ?",
            (turn_id, execution_id, session_id),
        ).fetchone()
        if row is None:
            raise TurnNotFound(f"execution link not found: {execution_id}")
        return TurnExecutionLink(
            turn_id=row["turn_id"],
            execution_id=row["execution_id"],
            linked_at=_parse(row["linked_at"]),
            parent_execution_id=row["parent_execution_id"],
            input_session_ref=_ref_from_json(row["input_session_ref_json"]),
            output_native_session_ref=_ref_from_json(
                row["output_native_session_ref_json"]
            ),
            workspace_input_ref=_ref_from_json(row["workspace_input_ref_json"]),
            workspace_output_ref=_ref_from_json(row["workspace_output_ref_json"]),
        )

    def _set_once_fact_tx(
        self,
        conn,
        session_id: str,
        turn_id: str,
        execution_id: str,
        column: str,
        value: Optional[str],
        lease: WriterLease,
    ) -> None:
        """Write one reserved set-once link fact inside an open transaction.

        Idempotent when the stored value is identical; a DIFFERENT value is
        an ``ExecutionFactConflict`` (provenance is never rewritten).
        """
        self._session_row(conn, session_id)
        turn = self._load_turn(conn, session_id, turn_id)
        if execution_id not in turn.execution_ids:
            raise TurnNotFound(f"execution link not found: {execution_id}")
        self._require_lease(conn, session_id, lease)
        row = conn.execute(
            f"SELECT {column} FROM turn_executions WHERE turn_id = ? AND execution_id = ?",
            (turn_id, execution_id),
        ).fetchone()
        existing = row[column]
        if existing is not None:
            if existing != value:
                raise ExecutionFactConflict(
                    f"set-once execution fact {column} already recorded with a "
                    "different value; provenance is immutable"
                )
            return
        conn.execute(
            f"UPDATE turn_executions SET {column} = ? WHERE turn_id = ? AND execution_id = ?",
            (value, turn_id, execution_id),
        )

    def record_execution_input_facts(
        self,
        session_id: str,
        turn_id: str,
        execution_id: str,
        lease: WriterLease,
        *,
        parent_execution_id: Optional[str] = None,
        input_session_ref: Optional[Ref] = None,
        workspace_input_ref: Optional[Ref] = None,
    ) -> TurnExecutionLink:
        """Set-once input-side provenance facts of one Execution."""
        conn = self._connection()
        with self._lock, conn:
            if parent_execution_id is not None:
                self._set_once_fact_tx(
                    conn, session_id, turn_id, execution_id,
                    "parent_execution_id", parent_execution_id, lease,
                )
            if input_session_ref is not None:
                self._set_once_fact_tx(
                    conn, session_id, turn_id, execution_id,
                    "input_session_ref_json", _ref_to_json(input_session_ref), lease,
                )
            if workspace_input_ref is not None:
                self._set_once_fact_tx(
                    conn, session_id, turn_id, execution_id,
                    "workspace_input_ref_json", _ref_to_json(workspace_input_ref), lease,
                )
            return self._load_link(conn, session_id, turn_id, execution_id)

    def record_execution_output_facts(
        self,
        session_id: str,
        turn_id: str,
        execution_id: str,
        lease: WriterLease,
        *,
        output_native_session_ref: Optional[Ref] = None,
        workspace_output_ref: Optional[Ref] = None,
    ) -> TurnExecutionLink:
        """Set-once output-side provenance facts of one Execution."""
        conn = self._connection()
        with self._lock, conn:
            if output_native_session_ref is not None:
                self._set_once_fact_tx(
                    conn, session_id, turn_id, execution_id,
                    "output_native_session_ref_json",
                    _ref_to_json(output_native_session_ref), lease,
                )
            if workspace_output_ref is not None:
                self._set_once_fact_tx(
                    conn, session_id, turn_id, execution_id,
                    "workspace_output_ref_json", _ref_to_json(workspace_output_ref), lease,
                )
            return self._load_link(conn, session_id, turn_id, execution_id)

    def execution_link(self, session_id: str, turn_id: str, execution_id: str) -> TurnExecutionLink:
        """Exact current facts of one Turn↔Execution link (reserved fields included)."""
        conn = self._connection()
        with self._lock:
            return self._load_link(conn, session_id, turn_id, execution_id)

    # -- turn run transaction (durable journal of the EXECUTION phase) ----------
    #
    # Phase machine (fail-closed; see TurnRunPhase for exact semantics):
    #   PREPARED → DISPATCH_REQUESTED → DISPATCH_ACCEPTED → RUNNING →
    #   EXECUTION_TERMINAL → FINALIZATION_APPLIED → SESSION_COMMITTED/FAILED
    # and any non-terminal phase → RECOVERY_REQUIRED (explicit recovery only).
    # Setting the same phase again with identical facts is idempotent.

    def _turn_run_row(self, conn, turn_id: str):
        row = conn.execute(
            "SELECT * FROM turn_runs WHERE turn_id = ?", (turn_id,)
        ).fetchone()
        if row is None:
            raise TurnNotFound(f"turn run journal not found: {turn_id}")
        return row

    def _load_turn_run(self, row) -> TurnRunView:
        return TurnRunView(
            turn_id=row["turn_id"],
            session_id=row["session_id"],
            execution_id=row["execution_id"],
            dispatch_id=row["dispatch_id"],
            dispatch_digest=row["dispatch_digest"],
            phase=TurnRunPhase(row["phase"]),
            recovery_facts=_load_json(row["recovery_facts_json"], "turn run facts") or {},
            created_at=_parse(row["created_at"]),
            updated_at=_parse(row["updated_at"]),
        )

    def record_dispatch_intent(
        self,
        turn_id: str,
        execution_id: str,
        *,
        dispatch_id: str,
        dispatch_digest: str,
        lease: WriterLease,
    ) -> None:
        """Journal the dispatch intent BEFORE any irreversible dispatch side
        effect: phase PREPARED → DISPATCH_REQUESTED.

        Idempotent when re-recorded with identical (execution_id, dispatch_id,
        dispatch_digest); any other phase or a different intent fails closed.
        """
        if not dispatch_id or not dispatch_digest:
            raise ValueError("dispatch intent requires dispatch_id and dispatch_digest")
        conn = self._connection()
        with self._lock, conn:
            run = self._turn_run_row(conn, turn_id)
            self._require_lease(conn, run["session_id"], lease)
            phase = TurnRunPhase(run["phase"])
            if phase is TurnRunPhase.DISPATCH_REQUESTED:
                if (
                    run["execution_id"],
                    run["dispatch_id"],
                    run["dispatch_digest"],
                ) == (execution_id, dispatch_id, dispatch_digest):
                    return
                raise InvalidTurnTransition(
                    "dispatch intent already recorded with different facts"
                )
            if phase is not TurnRunPhase.PREPARED:
                raise InvalidTurnTransition(
                    f"dispatch intent requires phase prepared; run is {phase.value}"
                )
            self._fault("run:pre_dispatch_intent")
            conn.execute(
                "UPDATE turn_runs SET phase = ?, execution_id = ?, dispatch_id = ?, "
                "dispatch_digest = ?, updated_at = ? WHERE turn_id = ?",
                (
                    TurnRunPhase.DISPATCH_REQUESTED.value,
                    execution_id,
                    dispatch_id,
                    dispatch_digest,
                    _iso(_now()),
                    turn_id,
                ),
            )

    def record_dispatch_accepted(
        self, turn_id: str, execution_id: str, *, dispatch_id: str, lease: WriterLease
    ) -> None:
        """Journal the external authority's acceptance of the exact recorded
        dispatch id: phase DISPATCH_REQUESTED → DISPATCH_ACCEPTED."""
        conn = self._connection()
        with self._lock, conn:
            run = self._turn_run_row(conn, turn_id)
            self._require_lease(conn, run["session_id"], lease)
            phase = TurnRunPhase(run["phase"])
            if phase is TurnRunPhase.DISPATCH_ACCEPTED:
                if (run["execution_id"], run["dispatch_id"]) == (
                    execution_id,
                    dispatch_id,
                ):
                    return
                raise InvalidTurnTransition(
                    "dispatch acceptance already recorded with different facts"
                )
            if phase is not TurnRunPhase.DISPATCH_REQUESTED:
                raise InvalidTurnTransition(
                    f"dispatch acceptance requires phase dispatch_requested; "
                    f"run is {phase.value}"
                )
            if run["dispatch_id"] != dispatch_id:
                raise InvalidTurnTransition(
                    "dispatch_id does not match the recorded dispatch intent"
                )
            if run["execution_id"] != execution_id:
                raise InvalidTurnTransition(
                    "execution_id does not match the recorded dispatch intent"
                )
            self._fault("run:pre_dispatch_accepted")
            conn.execute(
                "UPDATE turn_runs SET phase = ?, updated_at = ? WHERE turn_id = ?",
                (TurnRunPhase.DISPATCH_ACCEPTED.value, _iso(_now()), turn_id),
            )

    def record_turn_running(self, turn_id: str, *, lease: WriterLease) -> None:
        """Journal the first live observation of the run: → RUNNING.

        Normally reached from DISPATCH_ACCEPTED; a start directly from
        DISPATCH_REQUESTED is explicitly allowed and journaled as-is (the
        provider may begin executing without an accepted callback).
        """
        conn = self._connection()
        with self._lock, conn:
            run = self._turn_run_row(conn, turn_id)
            self._require_lease(conn, run["session_id"], lease)
            phase = TurnRunPhase(run["phase"])
            if phase is TurnRunPhase.RUNNING:
                return
            if phase not in (TurnRunPhase.DISPATCH_ACCEPTED, TurnRunPhase.DISPATCH_REQUESTED):
                raise InvalidTurnTransition(
                    f"running requires phase dispatch_accepted (or "
                    f"dispatch_requested); run is {phase.value}"
                )
            self._fault("run:pre_running")
            conn.execute(
                "UPDATE turn_runs SET phase = ?, updated_at = ? WHERE turn_id = ?",
                (TurnRunPhase.RUNNING.value, _iso(_now()), turn_id),
            )

    def record_execution_terminal(
        self,
        turn_id: str,
        *,
        outcome: TerminalOutcome,
        evidence: Mapping[str, str],
        lease: WriterLease,
    ) -> None:
        """Journal the provider-reported execution outcome with bounded
        recovery evidence: → EXECUTION_TERMINAL.

        The store never fabricates evidence: the caller supplies the bounded
        provider recovery facts (e.g. execution projection phase/outcome/
        freshness, receipt id).  Allowed from DISPATCH_REQUESTED,
        DISPATCH_ACCEPTED or RUNNING (the first observation may already be
        the terminal one); idempotent with identical evidence.
        """
        if not isinstance(outcome, TerminalOutcome):
            raise TypeError("record_execution_terminal requires a TerminalOutcome")
        facts = _bounded_facts(evidence, "execution terminal evidence")
        facts["run_outcome"] = outcome.value
        conn = self._connection()
        with self._lock, conn:
            run = self._turn_run_row(conn, turn_id)
            self._require_lease(conn, run["session_id"], lease)
            phase = TurnRunPhase(run["phase"])
            if phase is TurnRunPhase.EXECUTION_TERMINAL:
                if run["recovery_facts_json"] == _dump_json(facts):
                    return
                raise InvalidTurnTransition(
                    "execution terminal already recorded with different evidence"
                )
            if phase not in (
                TurnRunPhase.DISPATCH_REQUESTED,
                TurnRunPhase.DISPATCH_ACCEPTED,
                TurnRunPhase.RUNNING,
            ):
                raise InvalidTurnTransition(
                    f"execution terminal requires a dispatched or running run; "
                    f"run is {phase.value}"
                )
            self._fault("run:pre_execution_terminal")
            conn.execute(
                "UPDATE turn_runs SET phase = ?, recovery_facts_json = ?, "
                "updated_at = ? WHERE turn_id = ?",
                (
                    TurnRunPhase.EXECUTION_TERMINAL.value,
                    _dump_json(facts),
                    _iso(_now()),
                    turn_id,
                ),
            )

    def record_finalization_applied(self, turn_id: str, *, lease: WriterLease) -> None:
        """Journal that atomic finalization was applied: phase
        EXECUTION_TERMINAL → FINALIZATION_APPLIED."""
        conn = self._connection()
        with self._lock, conn:
            run = self._turn_run_row(conn, turn_id)
            self._require_lease(conn, run["session_id"], lease)
            phase = TurnRunPhase(run["phase"])
            if phase is TurnRunPhase.FINALIZATION_APPLIED:
                return
            if phase is not TurnRunPhase.EXECUTION_TERMINAL:
                raise InvalidTurnTransition(
                    f"finalization requires phase execution_terminal; "
                    f"run is {phase.value}"
                )
            self._fault("run:pre_finalization")
            conn.execute(
                "UPDATE turn_runs SET phase = ?, updated_at = ? WHERE turn_id = ?",
                (TurnRunPhase.FINALIZATION_APPLIED.value, _iso(_now()), turn_id),
            )

    def mark_turn_recovery_required(
        self,
        turn_id: str,
        *,
        facts: Mapping[str, str],
        lease: WriterLease | None = None,
    ) -> str:
        """Mark a run RECOVERY_REQUIRED and open (or update) a ``turn_run``
        recovery operation bound to the session; returns the op id.

        This is NOT a fabricated terminal outcome: the Turn row's
        ``terminal_outcome`` is never touched.  The Turn state moves to
        RECOVERY_REQUIRED only from RUNNING.  May run lease-less during
        recovery (the operation is still bound to the run's session);
        idempotent for the same turn and facts.
        """
        bounded = _bounded_facts(facts, "turn run recovery facts")
        op_id = f"rec_turnrun_{turn_id}"
        conn = self._connection()
        with self._lock, conn:
            run = self._turn_run_row(conn, turn_id)
            session_id = run["session_id"]
            if lease is not None:
                self._require_lease(conn, session_id, lease)
            phase = TurnRunPhase(run["phase"])
            now = _iso(_now())
            if phase is TurnRunPhase.RECOVERY_REQUIRED:
                if run["recovery_facts_json"] == _dump_json(bounded):
                    return op_id
                conn.execute(
                    "UPDATE turn_runs SET recovery_facts_json = ?, updated_at = ? "
                    "WHERE turn_id = ?",
                    (_dump_json(bounded), now, turn_id),
                )
            elif phase.terminal:
                raise InvalidTurnTransition(
                    f"cannot mark a {phase.value} run as recovery required"
                )
            else:
                conn.execute(
                    "UPDATE turn_runs SET phase = ?, recovery_facts_json = ?, "
                    "updated_at = ? WHERE turn_id = ?",
                    (
                        TurnRunPhase.RECOVERY_REQUIRED.value,
                        _dump_json(bounded),
                        now,
                        turn_id,
                    ),
                )
                turn_state = conn.execute(
                    "SELECT state FROM turns WHERE turn_id = ?", (turn_id,)
                ).fetchone()
                if turn_state is not None and turn_state["state"] == TurnState.RUNNING.value:
                    conn.execute(
                        "UPDATE turns SET state = ?, updated_at = ? WHERE turn_id = ?",
                        (TurnState.RECOVERY_REQUIRED.value, now, turn_id),
                    )
            conn.execute(
                "INSERT INTO recovery_operations (op_id, session_id, kind, state, "
                "detail, created_at, updated_at) VALUES (?, ?, 'turn_run', "
                "'RECOVERY_REQUIRED', ?, ?, ?) "
                "ON CONFLICT(op_id) DO UPDATE SET state = 'RECOVERY_REQUIRED', "
                "detail = excluded.detail, updated_at = excluded.updated_at",
                (op_id, session_id, "turn run journal requires recovery", now, now),
            )
        return op_id

    def turn_run(self, turn_id: str) -> TurnRunView:
        """Exact current facts of one run-transaction journal row."""
        conn = self._connection()
        with self._lock:
            return self._load_turn_run(self._turn_run_row(conn, turn_id))

    def unfinished_turn_runs(
        self, session_id: str | None = None
    ) -> tuple[TurnRunView, ...]:
        """All run-transaction journal rows in non-terminal phases.

        Restart discovery: after a crash, every phase in PREPARED through
        FINALIZATION_APPLIED is unfinished work that a recovering process
        must reconcile.  Terminal phases (including RECOVERY_REQUIRED, which
        only explicit recovery may move) are surfaced through
        :meth:`recovery_operations` instead.
        """
        terminal_values = tuple(phase.value for phase in TurnRunPhase if phase.terminal)
        placeholders = ", ".join("?" for _ in terminal_values)
        conn = self._connection()
        with self._lock:
            sql = (
                "SELECT * FROM turn_runs WHERE phase NOT IN "
                f"({placeholders}) ORDER BY created_at, turn_id"
            )
            params: list = list(terminal_values)
            if session_id is not None:
                sql = sql.replace("ORDER BY", "AND session_id = ? ORDER BY")
                params.append(session_id)
            rows = conn.execute(sql, params).fetchall()
            return tuple(self._load_turn_run(row) for row in rows)

    # -- ledger ------------------------------------------------------------------

    def append_event(
        self,
        session_id: str,
        event_type: str,
        payload: Mapping[str, str],
        lease: WriterLease,
        *,
        turn_id: Optional[str] = None,
        execution_id: Optional[str] = None,
        terminal: bool = False,
    ) -> SessionEvent:
        conn = self._connection()
        with self._lock, conn:
            self._session_row(conn, session_id)
            self._require_lease(conn, session_id, lease)
            return self._append_event_tx(
                conn,
                session_id,
                event_type,
                payload,
                turn_id=turn_id,
                execution_id=execution_id,
                terminal=terminal,
            )

    def record_terminal(
        self,
        session_id: str,
        turn_id: str,
        outcome: TerminalOutcome,
        lease: WriterLease,
        *,
        execution_id: Optional[str] = None,
    ) -> SessionEvent:
        """Record the Turn's terminal outcome exactly once (terminal-once)."""
        conn = self._connection()
        with self._lock, conn:
            self._session_row(conn, session_id)
            self._require_lease(conn, session_id, lease)
            turn = self._load_turn(conn, session_id, turn_id)
            if turn.state is TurnState.COMPLETED or turn.state is TurnState.FAILED:
                raise InvalidTurnTransition("turn is already committed")
            event = self._append_event_tx(
                conn,
                session_id,
                "TURN_TERMINAL",
                {"outcome": outcome.value},
                turn_id=turn_id,
                execution_id=execution_id,
                terminal=True,
            )
            conn.execute(
                "UPDATE turns SET terminal_outcome = ?, updated_at = ? WHERE turn_id = ?",
                (outcome.value, _iso(_now()), turn_id),
            )
            return event

    def transcript(
        self,
        session_id: str,
        *,
        after_seq: int = 0,
        limit: Optional[int] = None,
    ) -> tuple[SessionEvent, ...]:
        """Exact ledger read: all durable events after ``after_seq``.

        Includes events of a still-running turn (real-time observability).
        Replay-cursor validation against the committed watermark is the
        stream caller's concern; use :meth:`assert_replay_cursor` for the
        typed resync vocabulary.
        """
        if after_seq < 0:
            raise InvalidCursor("event cursor must be non-negative")
        conn = self._connection()
        with self._lock:
            self._session_row(conn, session_id)
            sql = (
                "SELECT * FROM session_events WHERE session_id = ? AND seq > ? "
                "ORDER BY seq"
            )
            params: list = [session_id, after_seq]
            if limit is not None:
                sql += " LIMIT ?"
                params.append(limit)
            rows = conn.execute(sql, params).fetchall()
            events = []
            for item in rows:
                events.append(
                    SessionEvent(
                        session_id=item["session_id"],
                        seq=item["seq"],
                        event_id=item["event_id"],
                        event_type=item["event_type"],
                        turn_id=item["turn_id"],
                        execution_id=item["execution_id"],
                        payload=_load_json(item["payload_json"], "event payload") or {},
                        created_at=_parse(item["created_at"]),
                        terminal=bool(item["terminal"]),
                    )
                )
            return tuple(events)

    def watermark(self, session_id: str) -> int:
        conn = self._connection()
        with self._lock:
            return self._session_row(conn, session_id)["watermark"]

    def assert_replay_cursor(self, session_id: str, after_seq: int) -> int:
        """Typed replay-cursor gate for resumable event streams.

        Returns the committed watermark.  Raises ``InvalidCursor`` for a
        negative cursor and ``ResyncRequired`` when the consumer claims a
        position beyond the committed watermark (a gap or forged cursor the
        ledger cannot serve).
        """
        if after_seq < 0:
            raise InvalidCursor("event cursor must be non-negative")
        watermark = self.watermark(session_id)
        if after_seq > watermark:
            raise ResyncRequired(
                session_id,
                "cursor is ahead of the committed watermark",
                current_watermark=watermark,
            )
        return watermark

    def turn_input_text(self, turn_id: str) -> str:
        """Read one Turn's frozen input text (dispatch-only, not public API)."""
        conn = self._connection()
        with self._lock:
            row = conn.execute(
                "SELECT text FROM turn_inputs WHERE turn_id = ?", (turn_id,)
            ).fetchone()
            if row is None:
                raise TurnNotFound(f"turn input not found: {turn_id}")
            return row["text"]

    # -- commit / fail -------------------------------------------------------------

    def commit_turn(self, session_id: str, turn_id: str, lease: WriterLease) -> int:
        """Commit a terminal-outcome Turn and advance the watermark.

        The whole commit batch — sealing the turn, appending the
        TURN_COMMITTED event, advancing the watermark to that event's seq,
        and stamping the run-transaction journal's terminal phase — is one
        transaction.  The watermark therefore never points short of any
        committed ledger event.  The run journal's terminal phase is derived
        from the committed outcome: SESSION_COMMITTED for SUCCEEDED, FAILED
        otherwise.  A run left at RECOVERY_REQUIRED may be committed here
        only because the Turn row's terminal outcome was already proven and
        recorded (never fabricated by recovery).
        """
        conn = self._connection()
        with self._lock, conn:
            self._session_row(conn, session_id)
            self._require_lease(conn, session_id, lease)
            turn = self._load_turn(conn, session_id, turn_id)
            if turn.terminal_outcome is None:
                raise InvalidTurnTransition(
                    "commit_turn requires a recorded terminal outcome"
                )
            if turn.state not in (TurnState.RUNNING, TurnState.RECOVERY_REQUIRED):
                raise InvalidTurnTransition(
                    f"turn {turn_id} is {turn.state.value}; completed turns never re-enter running"
                )
            if not conn.execute(
                "SELECT 1 FROM session_events WHERE session_id = ? AND terminal = 1 "
                "AND turn_id = ?",
                (session_id, turn_id),
            ).fetchone():
                raise WatermarkViolation("no terminal event found for this turn")
            next_state = (
                TurnState.COMPLETED
                if turn.terminal_outcome is TerminalOutcome.SUCCEEDED
                else TurnState.FAILED
            )
            committed = self._append_event_tx(
                conn,
                session_id,
                "TURN_COMMITTED",
                {"turn_id": turn_id},
                turn_id=turn_id,
            )
            conn.execute(
                "UPDATE turns SET state = ?, committed_watermark = ?, updated_at = ? "
                "WHERE turn_id = ?",
                (next_state.value, committed.seq, _iso(_now()), turn_id),
            )
            conn.execute(
                "UPDATE sessions SET watermark = ? WHERE session_id = ?",
                (committed.seq, session_id),
            )
            run_row = conn.execute(
                "SELECT phase FROM turn_runs WHERE turn_id = ?", (turn_id,)
            ).fetchone()
            if run_row is not None:
                run_phase = TurnRunPhase(run_row["phase"])
                if run_phase in (
                    TurnRunPhase.SESSION_COMMITTED,
                    TurnRunPhase.COMPLETED,
                    TurnRunPhase.FAILED,
                ):
                    raise InvalidTurnTransition(
                        "run journal is already sealed at a terminal phase"
                    )
                run_terminal = (
                    TurnRunPhase.SESSION_COMMITTED
                    if turn.terminal_outcome is TerminalOutcome.SUCCEEDED
                    else TurnRunPhase.FAILED
                )
                conn.execute(
                    "UPDATE turn_runs SET phase = ?, recovery_facts_json = '{}', "
                    "updated_at = ? WHERE turn_id = ?",
                    (run_terminal.value, _iso(_now()), turn_id),
                )
            return committed.seq

    def fail_turn(self, session_id: str, turn_id: str, reason: str, lease: WriterLease) -> TurnView:
        """Record a failed outcome, seal the turn and advance the watermark."""
        self.record_terminal(
            session_id,
            turn_id,
            TerminalOutcome.FAILED,
            lease,
        )
        self.commit_turn(session_id, turn_id, lease)
        return self.get_turn(session_id, turn_id)

    # -- idempotency -----------------------------------------------------------------

    def get_receipt(self, idempotency_key: str) -> Optional[Mapping[str, str]]:
        conn = self._connection()
        with self._lock:
            row = conn.execute(
                "SELECT scope, result_json, request_digest FROM idempotency_receipts "
                "WHERE idempotency_key = ?",
                (idempotency_key,),
            ).fetchone()
            if row is None:
                return None
            result = _load_json(row["result_json"], "idempotency receipt")
            return {
                "scope": row["scope"],
                "request_digest": row["request_digest"] or "",
                **{k: str(v) for k, v in dict(result).items()},
            }

    # -- recovery ------------------------------------------------------------------

    def recovery_operations(
        self, *, session_id: Optional[str] = None
    ) -> tuple[RecoveryOperation, ...]:
        """Recovery operations, strictly scoped.

        With ``session_id`` set, ONLY operations bound to that session are
        returned — including pending sagas.  Session isolation is enforced
        here and in :meth:`recover`; operations of session B never surface
        for session A.
        """
        conn = self._connection()
        with self._lock:
            ops: list[RecoveryOperation] = []
            sql = "SELECT * FROM recovery_operations"
            params: list = []
            if session_id is not None:
                sql += " WHERE session_id = ?"
                params.append(session_id)
            sql += " ORDER BY created_at, op_id"
            for row in conn.execute(sql, params).fetchall():
                ops.append(
                    RecoveryOperation(
                        op_id=row["op_id"],
                        session_id=row["session_id"],
                        kind=row["kind"],
                        state=row["state"],
                        detail=row["detail"],
                    )
                )
            saga_sql = "SELECT * FROM session_saga_ops WHERE state != ?"
            saga_params: list = [SAGA_COMPLETE]
            if session_id is not None:
                saga_sql += " AND session_id = ?"
                saga_params.append(session_id)
            saga_sql += " ORDER BY created_at, op_id"
            for row in conn.execute(saga_sql, saga_params).fetchall():
                ops.append(
                    RecoveryOperation(
                        op_id=row["op_id"],
                        session_id=row["session_id"],
                        kind=row["kind"],
                        state="PENDING_SAGA",
                        detail=f"saga state: {row['state']}",
                    )
                )
            ops.sort(key=lambda op: (op.op_id,))
            return tuple(ops)

    def recover(self, session_id: str, op_id: str) -> RecoveryOperation:
        """Reconcile one pending operation bound EXACTLY to ``session_id``.

        The session scope is mandatory and verified before anything else:
        an unknown operation for this session raises ``SessionError``; an
        operation bound to another session raises ``RecoveryScopeMismatch``
        without leaking any fact about it.  Roll-forward is deterministic
        because every saga persists its full request facts (and canonical
        digest) at INTENT time.  Recovery never fabricates a terminal
        outcome: a turn whose Execution outcome cannot be proven stays in
        RECOVERY_REQUIRED.
        """
        if not session_id:
            raise RecoveryScopeMismatch(
                "recovery requires a mandatory session scope"
            )
        conn = self._connection()
        with self._lock:
            saga = conn.execute(
                "SELECT * FROM session_saga_ops WHERE op_id = ?", (op_id,)
            ).fetchone()
            op_row = conn.execute(
                "SELECT * FROM recovery_operations WHERE op_id = ?", (op_id,)
            ).fetchone()
            if saga is None and op_row is None:
                raise SessionError(f"unknown recovery operation: {op_id}")
            bound = saga["session_id"] if saga is not None else op_row["session_id"]
            if bound != session_id:
                raise RecoveryScopeMismatch(
                    "recovery operation is not bound to this session"
                )
            if saga is None:
                return self._recover_bound_operation(conn, op_row)
            if saga["state"] == SAGA_COMPLETE:
                return RecoveryOperation(op_id, saga["session_id"], saga["kind"], "RESOLVED", "already complete")
            if saga["kind"] == "create_session":
                detail = _load_json(saga["detail_json"], "saga detail")
                if saga["state"] == SAGA_INTENT:
                    self._create_or_confirm_work(conn, op_id, saga["work_id"], detail)
                session = self._create_session_row(conn, op_id, saga["session_id"], saga["work_id"], detail)
                self._resolve_recovery(op_id, "rolled forward to COMPLETE")
                return RecoveryOperation(op_id, session.session_id, "create_session", "RESOLVED", "session created")
            if saga["kind"] == "begin_turn":
                if saga["state"] == SAGA_INTENT:
                    # Turn row was never durably created; roll back.
                    with conn:
                        conn.execute("DELETE FROM session_saga_ops WHERE op_id = ?", (op_id,))
                    return RecoveryOperation(op_id, saga["session_id"], "begin_turn", "ROLLED_BACK", "no durable turn row")
                if saga["state"] in (SAGA_TURN_CREATED, SAGA_RECOVERY_REQUIRED):
                    turn = self._load_turn(conn, saga["session_id"], saga["turn_id"])
                    if not turn.execution_ids:
                        with conn:
                            conn.execute(
                                "UPDATE turns SET state = ?, updated_at = ? WHERE turn_id = ?",
                                (TurnState.RECOVERY_REQUIRED.value, _iso(_now()), turn.turn_id),
                            )
                        self._resolve_recovery(op_id, "turn moved to RECOVERY_REQUIRED (execution outcome unprovable)")
                        return RecoveryOperation(op_id, saga["session_id"], "begin_turn", "RESOLVED", "turn marked RECOVERY_REQUIRED")
                    self._link_execution(conn, op_id, saga["session_id"], turn.turn_id)
                    self._resolve_recovery(op_id, "rolled forward to COMPLETE")
                    return RecoveryOperation(op_id, saga["session_id"], "begin_turn", "RESOLVED", "turn saga completed")
            raise SessionError(f"recovery path unavailable for operation {op_id}")

    def _recover_bound_operation(self, conn, op_row) -> RecoveryOperation:
        """Recover a non-saga recovery_operations row (e.g. a turn run)."""
        if op_row["state"] == "RESOLVED":
            return RecoveryOperation(
                op_row["op_id"],
                op_row["session_id"],
                op_row["kind"],
                "RESOLVED",
                op_row["detail"],
            )
        if op_row["kind"] == "turn_run":
            return self._recover_turn_run(conn, op_row)
        raise SessionError(f"recovery path unavailable for operation {op_row['op_id']}")

    def _recover_turn_run(self, conn, op_row) -> RecoveryOperation:
        """Reconcile a RECOVERY_REQUIRED run journal from persisted facts.

        Only an already-sealed Turn state may be copied into the journal
        (reconciliation, never fabrication); otherwise the run stays in
        RECOVERY_REQUIRED.
        """
        op_id, session_id = op_row["op_id"], op_row["session_id"]
        turn_id = op_id[len("rec_turnrun_"):]
        turn = self._load_turn(conn, session_id, turn_id)
        if turn.state is TurnState.COMPLETED or turn.state is TurnState.FAILED:
            phase = (
                TurnRunPhase.COMPLETED
                if turn.state is TurnState.COMPLETED
                else TurnRunPhase.FAILED
            )
            with conn:
                conn.execute(
                    "UPDATE turn_runs SET phase = ?, updated_at = ? WHERE turn_id = ?",
                    (phase.value, _iso(_now()), turn_id),
                )
            detail = f"run journal reconciled to {phase.value} turn"
            self._resolve_recovery(op_id, detail)
            return RecoveryOperation(op_id, session_id, "turn_run", "RESOLVED", detail)
        return RecoveryOperation(
            op_id,
            session_id,
            "turn_run",
            "RECOVERY_REQUIRED",
            "execution outcome still unprovable; no terminal fact fabricated",
        )

    def _resolve_recovery(self, op_id: str, detail: str) -> None:
        conn = self._connection()
        with conn:
            conn.execute(
                "UPDATE recovery_operations SET state = 'RESOLVED', detail = ?, "
                "updated_at = ? WHERE op_id = ?",
                (detail, _iso(_now()), op_id),
            )

    # -- diagnostics ------------------------------------------------------------

    def diagnostics(self) -> Mapping[str, object]:
        """Bounded, redacted operational facts.

        Never includes host paths, raw prompts, credentials or tracebacks.
        """
        conn = self._connection()
        with self._lock:
            def scalar(sql: str, params: tuple = ()) -> int:
                return conn.execute(sql, params).fetchone()[0]

            return {
                "store_id": STORE_ID,
                "schema_version": schema.SCHEMA_VERSION,
                "sessions": scalar("SELECT COUNT(*) FROM sessions"),
                "open_sessions": scalar(
                    "SELECT COUNT(*) FROM sessions WHERE status = 'open'"
                ),
                "turns": scalar("SELECT COUNT(*) FROM turns"),
                "running_turns": scalar(
                    "SELECT COUNT(*) FROM turns WHERE state = 'running'"
                ),
                "recovery_required_turns": scalar(
                    "SELECT COUNT(*) FROM turns WHERE state = 'recovery_required'"
                ),
                "unfinished_turn_runs": scalar(
                    "SELECT COUNT(*) FROM turn_runs WHERE phase IN "
                    "('prepared', 'dispatch_requested', 'dispatch_accepted', "
                    "'running', 'execution_terminal', 'finalization_applied')"
                ),
                "events": scalar("SELECT COUNT(*) FROM session_events"),
                "idempotency_receipts": scalar(
                    "SELECT COUNT(*) FROM idempotency_receipts"
                ),
                "leases_held": scalar("SELECT COUNT(*) FROM writer_leases"),
                "pending_recoveries": scalar(
                    "SELECT COUNT(*) FROM session_saga_ops WHERE state != ?",
                    (SAGA_COMPLETE,),
                ),
            }
