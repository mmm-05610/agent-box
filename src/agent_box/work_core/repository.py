"""SQLite persistence for the additive Minimal Work Core."""
from __future__ import annotations

import json
from datetime import datetime
from enum import Enum
from typing import Iterable, Mapping, Optional

from ..core import db
from .errors import WorkCoreError
from .events import CoreEvent, EventType
from .models import Execution, Ref, RefType, Work, WorkLifecycle
from .projection import ExecutionProjection, Freshness, Outcome, Phase


class WorkNotFound(WorkCoreError):
    pass


class ExecutionNotFound(WorkCoreError):
    pass


class ConcurrencyConflict(WorkCoreError):
    pass


class RefRelation(str, Enum):
    NATIVE = "native"
    INPUT = "input"
    OUTPUT = "output"


def _dump(value: Mapping[str, str]) -> str:
    return json.dumps(dict(value), ensure_ascii=False, sort_keys=True)


def _load(value: str) -> dict[str, str]:
    return json.loads(value)


def _time(value: datetime) -> str:
    return value.isoformat()


def _parse_time(value: Optional[str]) -> Optional[datetime]:
    return datetime.fromisoformat(value) if value else None


class CoreRepository:
    """Current-state repository; callers define all native/provider semantics."""

    def create_work(self, work: Work, event: CoreEvent) -> Work:
        conn = db.get_conn()
        with db.write_lock, conn:
            conn.execute(
                "INSERT INTO core_works (id, objective, lifecycle, closure_reason, metadata_json, created_at, updated_at, version) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (work.id, work.objective, work.lifecycle.value, work.closure_reason, _dump(work.metadata), _time(work.created_at), _time(work.updated_at), work.version),
            )
            self._append_event(conn, event)
        return self.get_work(work.id)

    def get_work(self, work_id: str) -> Work:
        row = db.get_conn().execute("SELECT * FROM core_works WHERE id = ?", (work_id,)).fetchone()
        if row is None:
            raise WorkNotFound(work_id)
        return Work(row["id"], row["objective"], WorkLifecycle(row["lifecycle"]), _parse_time(row["created_at"]), _parse_time(row["updated_at"]), row["closure_reason"], _load(row["metadata_json"]), row["version"])

    def update_work(self, work: Work, *, expected_version: int, event: CoreEvent) -> Work:
        conn = db.get_conn()
        with db.write_lock, conn:
            cursor = conn.execute(
                "UPDATE core_works SET lifecycle = ?, closure_reason = ?, metadata_json = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ?",
                (work.lifecycle.value, work.closure_reason, _dump(work.metadata), _time(work.updated_at), work.id, expected_version),
            )
            if cursor.rowcount != 1:
                raise ConcurrencyConflict(f"work version changed: {work.id}")
            self._append_event(conn, event)
        return self.get_work(work.id)

    def create_execution(self, execution: Execution, event: CoreEvent) -> Execution:
        conn = db.get_conn()
        p = execution.projection
        with db.write_lock, conn:
            conn.execute(
                "INSERT INTO core_executions (id, work_id, provider_id, phase, outcome, resumable_now, freshness, observed_at, provenance_json, created_at, dispatched_at, started_at, ended_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (execution.id, execution.work_id, execution.provider_id, p.phase.value, p.outcome.value if p.outcome else None, p.resumable_now, p.freshness.value, _time(p.observed_at), _dump(execution.provenance), _time(execution.created_at), _time(execution.dispatched_at) if execution.dispatched_at else None, _time(execution.started_at) if execution.started_at else None, _time(execution.ended_at) if execution.ended_at else None, execution.version),
            )
            self._append_event(conn, event)
        return self.get_execution(execution.id)

    def get_execution(self, execution_id: str) -> Execution:
        row = db.get_conn().execute("SELECT * FROM core_executions WHERE id = ?", (execution_id,)).fetchone()
        if row is None:
            raise ExecutionNotFound(execution_id)
        projection = ExecutionProjection(Phase(row["phase"]), Outcome(row["outcome"]) if row["outcome"] else None, None if row["resumable_now"] is None else bool(row["resumable_now"]), Freshness(row["freshness"]), _parse_time(row["observed_at"]))
        return Execution(row["id"], row["work_id"], row["provider_id"], projection, _parse_time(row["created_at"]), _parse_time(row["dispatched_at"]), _parse_time(row["started_at"]), _parse_time(row["ended_at"]), _load(row["provenance_json"]), row["version"])

    def update_projection(self, execution: Execution, *, expected_version: int, event: CoreEvent) -> Execution:
        conn = db.get_conn(); p = execution.projection
        with db.write_lock, conn:
            cursor = conn.execute(
                "UPDATE core_executions SET phase = ?, outcome = ?, resumable_now = ?, freshness = ?, observed_at = ?, started_at = ?, ended_at = ?, version = version + 1 WHERE id = ? AND version = ?",
                (p.phase.value, p.outcome.value if p.outcome else None, p.resumable_now, p.freshness.value, _time(p.observed_at), _time(execution.started_at) if execution.started_at else None, _time(execution.ended_at) if execution.ended_at else None, execution.id, expected_version),
            )
            if cursor.rowcount != 1:
                raise ConcurrencyConflict(f"execution version changed: {execution.id}")
            self._append_event(conn, event)
        return self.get_execution(execution.id)

    def attach_ref(self, execution_id: str, relation: RefRelation, ref: Ref, event: CoreEvent) -> None:
        conn = db.get_conn()
        with db.write_lock, conn:
            cursor = conn.execute(
                "INSERT OR IGNORE INTO core_execution_refs (execution_id, relation, type, provider, native_id, uri, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (execution_id, relation.value, ref.type.value, ref.provider, ref.native_id, ref.uri, _dump(ref.metadata), _time(event.occurred_at)),
            )
            # A ref-discovery event is a material fact only when the ref was
            # actually added. Re-observation must not manufacture telemetry.
            if cursor.rowcount == 1:
                self._append_event(conn, event)

    def list_refs(self, execution_id: str, relation: RefRelation | None = None) -> list[Ref]:
        query = "SELECT * FROM core_execution_refs WHERE execution_id = ?"; params: tuple = (execution_id,)
        if relation:
            query += " AND relation = ?"; params = (execution_id, relation.value)
        rows = db.get_conn().execute(query, params).fetchall()
        return [Ref(RefType(row["type"]), row["provider"], row["native_id"], row["uri"], _load(row["metadata_json"])) for row in rows]

    def list_events(self, subject_id: str) -> list[CoreEvent]:
        rows = db.get_conn().execute("SELECT * FROM core_events WHERE subject_id = ? ORDER BY occurred_at, id", (subject_id,)).fetchall()
        return [CoreEvent(row["id"], EventType(row["type"]), row["subject_id"], _parse_time(row["occurred_at"]), _load(row["data_json"]), row["idempotency_key"]) for row in rows]

    def create_dispatch(self, dispatch_id: str, execution_id: str, idempotency_key: str, event: CoreEvent) -> None:
        conn = db.get_conn()
        with db.write_lock, conn:
            conn.execute(
                "INSERT INTO core_dispatches (id, execution_id, idempotency_key, state, created_at, updated_at) VALUES (?, ?, ?, 'requested', ?, ?)",
                (dispatch_id, execution_id, idempotency_key, _time(event.occurred_at), _time(event.occurred_at)),
            )
            self._append_event(conn, event)

    def get_dispatch_by_key(self, idempotency_key: str):
        return db.get_conn().execute("SELECT * FROM core_dispatches WHERE idempotency_key = ?", (idempotency_key,)).fetchone()

    @staticmethod
    def _append_event(conn, event: CoreEvent) -> None:
        conn.execute("INSERT INTO core_events (id, subject_id, type, occurred_at, data_json, idempotency_key) VALUES (?, ?, ?, ?, ?, ?)", (event.id, event.subject_id, event.type.value, _time(event.occurred_at), _dump(event.data), event.idempotency_key))
