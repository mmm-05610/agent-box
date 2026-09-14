"""Authoritative per-Session queue records (core-semantics/1 §6).

A queued item freezes the submitting role, the resolved configuration version,
and the message content at submission time, so a later selection change cannot
rewrite what will be sent. Withdrawal is guarded by the item's own version and
is refused once the item has been dispatched.
"""
from __future__ import annotations

from typing import Any

from agent_box.server.errors import ServerError
from agent_box.server.idempotency import IdempotentRecords
from agent_box.server.ids import now, opaque_id
from agent_box.storage import Database


ACTIVE_STATES = ("pending", "dispatched", "paused")


class QueueRecords:
    def __init__(self, database: Database, idempotency: IdempotentRecords) -> None:
        self.database = database
        self.idempotency = idempotency

    def enqueue_in_transaction(
        self, conn, *, session_id: str, profile_id: str, config_version: int,
        request_id: str, request_digest: str, message_object_digest: str,
    ) -> dict[str, Any]:
        item_id = opaque_id("queue")
        timestamp = now()
        conn.execute(
            "INSERT INTO server_queue_items("
            "id,session_id,version,state,profile_id,config_version,request_id,"
            "request_digest,message_object_digest,submitted_at,updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (item_id, session_id, 1, "pending", profile_id, config_version,
             request_id, request_digest, message_object_digest, timestamp, timestamp),
        )
        return self._row_to_item(conn.execute(
            "SELECT * FROM server_queue_items WHERE id=?", (item_id,),
        ).fetchone())

    def list(self, session_id: str) -> list[dict[str, Any]]:
        with self.database.read() as conn:
            self._require_session(conn, session_id)
            rows = conn.execute(
                "SELECT * FROM server_queue_items WHERE session_id=? AND state IN (?,?,?) "
                "ORDER BY submitted_at, id",
                (session_id, *ACTIVE_STATES),
            ).fetchall()
        return [self._row_to_item(row) for row in rows]

    def withdraw(
        self, *, session_id: str, item_id: str, expected_version: int,
        request_id: str, request_digest: str,
    ) -> tuple[int, dict[str, Any]]:
        scope = f"queue.withdraw:{session_id}:{item_id}"
        with self.database.transaction() as conn:
            prior = self.idempotency.check(conn, scope, request_id, request_digest)
            if prior:
                return prior
            self._require_session(conn, session_id)
            row = conn.execute(
                "SELECT * FROM server_queue_items WHERE id=? AND session_id=?",
                (item_id, session_id),
            ).fetchone()
            if row is None:
                raise ServerError("QUEUE_ITEM_NOT_FOUND", "Queue item was not found", status=404)
            item = self._row_to_item(row)
            if int(row["version"]) != expected_version:
                error = ServerError(
                    "QUEUE_VERSION_CONFLICT",
                    "Queue item changed before the withdrawal was applied",
                    status=409,
                )
                raise _with_current(error, {"item": item})
            if row["state"] != "pending":
                # Already dispatched work is not silently withdrawn: the
                # contract requires an explicit too_late answer.
                body = {
                    "outcome": "too_late",
                    "reason": f"item_state:{row['state']}",
                    "item": item,
                }
                self.idempotency.insert(conn, scope, request_id, request_digest, 200, body)
                return 200, body
            timestamp = now()
            conn.execute(
                "UPDATE server_queue_items SET state='withdrawn',version=version+1,updated_at=? WHERE id=?",
                (timestamp, item_id),
            )
            updated = self._row_to_item(conn.execute(
                "SELECT * FROM server_queue_items WHERE id=?", (item_id,),
            ).fetchone())
            body = {"outcome": "withdrawn", "item": updated}
            self.idempotency.insert(conn, scope, request_id, request_digest, 200, body)
            return 200, body

    def claim_next(self, conn, session_id: str) -> dict[str, Any] | None:
        """Mark the oldest pending item dispatched; returns it or None."""
        row = conn.execute(
            "SELECT * FROM server_queue_items WHERE session_id=? AND state='pending' "
            "ORDER BY submitted_at, id LIMIT 1",
            (session_id,),
        ).fetchone()
        if row is None:
            return None
        conn.execute(
            "UPDATE server_queue_items SET state='dispatched',version=version+1,updated_at=? WHERE id=?",
            (now(), row["id"]),
        )
        return self._row_to_item(conn.execute(
            "SELECT * FROM server_queue_items WHERE id=?", (row["id"],),
        ).fetchone())

    def pause_pending(self, conn, session_id: str, reason: str) -> int:
        """Pause queued work after a failure or user stop (core §6)."""
        del reason
        cursor = conn.execute(
            "UPDATE server_queue_items SET state='paused',version=version+1,updated_at=? "
            "WHERE session_id=? AND state='pending'",
            (now(), session_id),
        )
        return cursor.rowcount

    @staticmethod
    def _require_session(conn, session_id: str) -> None:
        if conn.execute("SELECT 1 FROM server_sessions WHERE id=?", (session_id,)).fetchone() is None:
            raise ServerError("SESSION_NOT_FOUND", "Session was not found", status=404)

    @staticmethod
    def _row_to_item(row) -> dict[str, Any]:
        return {
            "itemId": row["id"],
            "version": int(row["version"]),
            "submittedAt": row["submitted_at"],
            "messageText": row["message_object_digest"],
            "profileId": row["profile_id"],
            "state": row["state"],
            "configVersion": int(row["config_version"]),
            "requestId": row["request_id"],
        }


def _with_current(error: ServerError, current: dict[str, Any]) -> ServerError:
    error.current = current  # type: ignore[attr-defined]
    return error
