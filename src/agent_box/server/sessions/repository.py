"""Storage for Sessions, Turns, and durable session events.

Each business acceptance runs inside exactly one `BEGIN IMMEDIATE`
transaction that also inserts its idempotency row, so concurrent racers
cannot both own an acceptance: the loser observes the committed receipt.
"""
from __future__ import annotations

import json
from typing import Any, Mapping

from agent_box.server.errors import ServerError
from agent_box.server.idempotency import IdempotentRecords
from agent_box.server.ids import now, opaque_id
from agent_box.storage import Database


WIRE_VISIBLE_EVENT_KINDS = frozenset({
    "turn.accepted", "turn.state", "message.delta", "message.final", "tool.update",
    "approval.requested", "approval.settled", "config.changed", "queue.updated",
    "workspace.connection",
})


def _version_error(message: str, current: dict[str, Any]) -> ServerError:
    error = ServerError("RECORD_VERSION_CONFLICT", message, status=409)
    error.current = current  # type: ignore[attr-defined]
    return error


class SessionRecords:
    def __init__(self, database: Database, idempotency: IdempotentRecords) -> None:
        self.database = database
        self.idempotency = idempotency

    # -- session records -------------------------------------------------

    def create_session(
        self, *, key: str, request_digest: str, workspace_id: str, profile_id: str,
    ) -> tuple[int, dict[str, Any]]:
        with self.database.transaction() as conn:
            prior = self.idempotency.check(conn, "POST:/sessions", key, request_digest)
            if prior:
                return prior
            if conn.execute(
                "SELECT 1 FROM server_workspaces WHERE id=?", (workspace_id,),
            ).fetchone() is None:
                raise ServerError("WORKSPACE_NOT_FOUND", "Workspace was not found", status=404)
            if conn.execute(
                "SELECT 1 FROM server_profiles WHERE id=?", (profile_id,),
            ).fetchone() is None:
                raise ServerError("PROFILE_NOT_FOUND", "Profile was not found", status=404)
            timestamp = now()
            body = {
                "session_id": opaque_id("session"), "workspace_id": workspace_id,
                "profile_id": profile_id, "status": "ready", "checkpoint": None,
            }
            conn.execute(
                "INSERT INTO server_sessions(id,workspace_id,profile_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?)",
                (body["session_id"], workspace_id, profile_id, "ready", timestamp, timestamp),
            )
            self.idempotency.insert(conn, "POST:/sessions", key, request_digest, 201, body)
            return 201, body

    # -- wire/1 intent acceptance (one transaction owns it) ---------------

    def accept_intent(
        self, *, session_id: str | None, workspace_id: str | None, profile_id: str,
        request_id: str, request_digest: str, message_object_digest: str,
        public_message: Mapping[str, Any],
        overrides: list[dict[str, Any]] | None = None,
        expected_version: int | None = None, queue_records=None,
        resolve_config_version=None,
        effective_config_object_digest: str | None = None,
    ) -> tuple[str, dict[str, Any]]:
        """Accept one send intent atomically.

        Returns `(outcome, body)` where outcome is `accepted` for the winner and
        `replay` for a duplicate delivery of the same requestId. One
        transaction either creates the Session with its first execution, or
        enqueues a follow-up item behind the running execution; a duplicate
        requestId never creates or dispatches anything.
        """
        scope = "sessions.send"
        with self.database.transaction() as conn:
            prior = self.idempotency.check(conn, scope, request_id, request_digest)
            if prior:
                return "replay", prior[1]

            if session_id is None:
                if workspace_id is None:
                    raise ServerError("WORKSPACE_NOT_FOUND", "Workspace was not found", status=404)
                if conn.execute(
                    "SELECT 1 FROM server_workspaces WHERE id=?", (workspace_id,),
                ).fetchone() is None:
                    raise ServerError("WORKSPACE_NOT_FOUND", "Workspace was not found", status=404)
                session_id = opaque_id("session")
                timestamp = now()
                conn.execute(
                    "INSERT INTO server_sessions(id,workspace_id,profile_id,status,display_name,version,created_at,updated_at) "
                    "VALUES (?,?,?,?,?,?,?,?)",
                    (session_id, workspace_id, profile_id, "ready", None, 1, timestamp, timestamp),
                )
            else:
                session = conn.execute(
                    "SELECT * FROM server_sessions WHERE id=?", (session_id,),
                ).fetchone()
                if session is None:
                    raise ServerError("SESSION_NOT_FOUND", "Session was not found", status=404)
                if bool(session["archived_at"]):
                    raise ServerError("SESSION_ARCHIVED", "Session is archived", status=409)
                if expected_version is not None and int(session["version"]) != expected_version:
                    raise ServerError(
                        "RECORD_VERSION_CONFLICT",
                        "Session changed before the send was accepted",
                        status=409,
                    )
                if session["profile_id"] != profile_id:
                    # A running Session may only switch role through the
                    # explicit switch method, which can be refused.
                    raise ServerError(
                        "CAPABILITY_UNSUPPORTED",
                        "Session is bound to a different role; switch the role first",
                        status=409,
                    )

            profile = conn.execute(
                "SELECT * FROM server_profiles WHERE id=?", (profile_id,),
            ).fetchone()
            if profile is None:
                raise ServerError("PROFILE_NOT_FOUND", "Profile was not found", status=404)
            if bool(profile["archived_at"]):
                raise ServerError("PROFILE_ARCHIVED", "Profile is archived", status=409)
            if bool(profile["recovery_pending"]):
                raise ServerError(
                    "PROFILE_RECOVERY_REQUIRED",
                    "Profile has unresolved recovery evidence",
                    status=409,
                )
            config_version = int(profile["config_revision"])
            if resolve_config_version is not None:
                config_version = int(resolve_config_version(conn, profile, overrides))

            self._append_session_event(
                conn, session_id, None, "message.final",
                {
                    "message_id": opaque_id("message"), "role": "user",
                    "display_kind": "visible", "text": str(public_message.get("text", "")),
                },
            )

            active = conn.execute(
                "SELECT * FROM server_turns WHERE session_id=? AND state IN "
                "('accepted','dispatching','running','capturing') ORDER BY created_at LIMIT 1",
                (session_id,),
            ).fetchone()
            if active is None:
                execution_id = self._insert_execution(
                    conn, session_id=session_id, profile=profile,
                    config_version=config_version,
                    input_object_digest=message_object_digest,
                    effective_config_object_digest=effective_config_object_digest,
                )
                body = {
                    "outcome": "accepted", "sessionId": session_id,
                    "executionId": execution_id, "configVersion": config_version,
                    "queued": False,
                }
            else:
                if queue_records is None:
                    raise ServerError(
                        "QUEUE_ITEM_NOT_FOUND", "Queue storage is unavailable", status=503,
                    )
                item = queue_records.enqueue_in_transaction(
                    conn, session_id=session_id, profile_id=profile_id,
                    config_version=config_version, request_id=request_id,
                    request_digest=request_digest,
                    message_object_digest=message_object_digest,
                    effective_config_object_digest=effective_config_object_digest,
                    public_message=public_message,
                )
                body = {
                    "outcome": "accepted", "sessionId": session_id,
                    "executionId": None, "configVersion": config_version,
                    "queued": True, "queueItemId": item["itemId"],
                }

            self.idempotency.insert(conn, scope, request_id, request_digest, 202, body)
            return "accepted", body

    def _insert_execution(
        self, conn, *, session_id: str, profile, config_version: int,
        input_object_digest: str, effective_config_object_digest: str | None = None,
        queue_item_id: str | None = None,
    ) -> str:
        execution_id = opaque_id("execution")
        timestamp = now()
        try:
            conn.execute(
                "INSERT INTO server_turns(id,session_id,profile_id,profile_revision,native_generation,"
                "state,capture_state,cleanup_state,input_object_digest,effective_config_object_digest,"
                "queue_item_id,created_at,updated_at) "
                "VALUES (?,?,?,?,?,'accepted','pending','pending',?,?,?,?,?)",
                (execution_id, session_id, profile["id"], config_version,
                 int(profile["native_generation"]), input_object_digest,
                 effective_config_object_digest, queue_item_id, timestamp, timestamp),
            )
        except Exception as exc:
            if "UNIQUE constraint failed" in str(exc):
                raise ServerError(
                    "TURN_CONCURRENCY_CONFLICT",
                    "Session or Profile already has an active execution",
                    status=409,
                ) from exc
            raise
        conn.execute(
            "UPDATE server_profiles SET run_state='active',updated_at=? WHERE id=?",
            (timestamp, profile["id"]),
        )
        conn.execute(
            "UPDATE server_sessions SET status='active',version=version+1,updated_at=? WHERE id=?",
            (timestamp, session_id),
        )
        self._append_session_event(
            conn, session_id, execution_id, "turn.accepted",
            {"state": "accepted", "profile_revision": config_version},
        )
        return execution_id

    def switch_profile(
        self, *, session_id: str, profile_id: str, expected_version: int, request_id: str,
        request_digest: str,
    ) -> tuple[str, dict[str, Any]]:
        """Switch a Session's role, or refuse while an execution is running.

        The old link is returned on refusal so the client keeps the real state
        instead of the selection it attempted.
        """
        scope = f"sessions.switchProfile:{session_id}"
        with self.database.transaction() as conn:
            prior = self.idempotency.check(conn, scope, request_id, request_digest)
            if prior:
                return "replay", prior[1]
            session = conn.execute(
                "SELECT * FROM server_sessions WHERE id=?", (session_id,),
            ).fetchone()
            if session is None:
                raise ServerError("SESSION_NOT_FOUND", "Session was not found", status=404)
            if int(session["version"]) != expected_version:
                raise _version_error(
                    "Session changed before the role switch", self._session_view(conn, session_id),
                )
            target = conn.execute(
                "SELECT * FROM server_profiles WHERE id=?", (profile_id,),
            ).fetchone()
            if target is None:
                raise ServerError("PROFILE_NOT_FOUND", "Profile was not found", status=404)
            if bool(target["archived_at"]):
                raise ServerError("PROFILE_ARCHIVED", "Profile is archived", status=409)
            active = conn.execute(
                "SELECT 1 FROM server_turns WHERE session_id=? AND state IN "
                "('accepted','dispatching','running','capturing') LIMIT 1",
                (session_id,),
            ).fetchone()
            if active is not None:
                body = {
                    "outcome": "rejected",
                    "reason": "execution_running",
                    "session": self._session_view(conn, session_id),
                }
                self.idempotency.insert(conn, scope, request_id, request_digest, 200, body)
                return "rejected", body
            timestamp = now()
            conn.execute(
                "UPDATE server_sessions SET profile_id=?,version=version+1,updated_at=? WHERE id=?",
                (profile_id, timestamp, session_id),
            )
            # The Session's effective configuration just changed identity, and
            # the contract delivers that to clients as `config.changed` with the
            # window it applies to. It is `next_send` because this backend
            # freezes a configuration per execution: nothing already running is
            # rewritten (the refusal above is the running case). A replayed
            # request returns before this point, so it never emits a second one.
            self._append_session_event(
                conn, session_id, None, "config.changed", {"effective_for": "next_send"},
            )
            body = {"outcome": "confirmed", "session": self._session_view(conn, session_id)}
            self.idempotency.insert(conn, scope, request_id, request_digest, 200, body)
            return "confirmed", body

    def list_sessions(
        self, *, workspace_id: str | None, include_archived: bool,
        after_rowid: int = 0, limit: int = 200,
    ) -> list[dict[str, Any]]:
        """Return a stable keyset page of authoritative Session records."""
        clauses = ["rowid>?"]
        values: list[Any] = [after_rowid]
        if workspace_id is not None:
            clauses.append("workspace_id=?")
            values.append(workspace_id)
        if not include_archived:
            clauses.append("archived_at IS NULL")
        values.append(limit)
        with self.database.read() as conn:
            if workspace_id is not None and conn.execute(
                "SELECT 1 FROM server_workspaces WHERE id=?", (workspace_id,),
            ).fetchone() is None:
                raise ServerError("WORKSPACE_NOT_FOUND", "Workspace was not found", status=404)
            rows = conn.execute(
                "SELECT rowid AS catalog_rowid,* FROM server_sessions WHERE "
                + " AND ".join(clauses) + " ORDER BY rowid LIMIT ?",
                tuple(values),
            ).fetchall()
        return [dict(row) for row in rows]

    def update_session(
        self, *, session_id: str, expected_version: int, request_id: str,
        request_digest: str, display_name: str | None = None,
        pinned: bool | None = None, workspace_id: str | None = None,
    ) -> dict[str, Any]:
        scope = f"sessions.update:{session_id}"
        with self.database.transaction() as conn:
            prior = self.idempotency.check(conn, scope, request_id, request_digest)
            if prior:
                return prior[1]["session"]
            row = conn.execute(
                "SELECT * FROM server_sessions WHERE id=?", (session_id,),
            ).fetchone()
            if row is None:
                raise ServerError("SESSION_NOT_FOUND", "Session was not found", status=404)
            current = self._session_view(conn, session_id)
            if int(row["version"]) != expected_version:
                raise _version_error("Session changed before the update", current)
            if workspace_id is not None and workspace_id != row["workspace_id"]:
                target = conn.execute(
                    "SELECT * FROM server_workspaces WHERE id=?", (workspace_id,),
                ).fetchone()
                if target is None:
                    raise ServerError("WORKSPACE_NOT_FOUND", "Workspace was not found", status=404)
                if bool(target["archived_at"]):
                    raise ServerError("WORKSPACE_ARCHIVED", "Workspace is archived", status=409)
                active = conn.execute(
                    "SELECT 1 FROM server_turns WHERE session_id=? AND state IN "
                    "('accepted','dispatching','running','capturing') LIMIT 1",
                    (session_id,),
                ).fetchone()
                if active is not None:
                    raise ServerError(
                        "CAPABILITY_UNSUPPORTED",
                        "Session workspace cannot change while an execution is active",
                        status=409,
                    )
            timestamp = now()
            conn.execute(
                "UPDATE server_sessions SET display_name=COALESCE(?,display_name),"
                "pinned=COALESCE(?,pinned),workspace_id=COALESCE(?,workspace_id),"
                "version=version+1,updated_at=? WHERE id=?",
                (display_name, None if pinned is None else int(pinned), workspace_id,
                 timestamp, session_id),
            )
            updated = self._session_view(conn, session_id)
            self.idempotency.insert(
                conn, scope, request_id, request_digest, 200, {"session": updated},
            )
            return updated

    def archive_session(
        self, *, session_id: str, expected_version: int, request_id: str,
        request_digest: str,
    ) -> dict[str, Any]:
        scope = f"sessions.archive:{session_id}"
        with self.database.transaction() as conn:
            prior = self.idempotency.check(conn, scope, request_id, request_digest)
            if prior:
                return prior[1]["session"]
            row = conn.execute(
                "SELECT * FROM server_sessions WHERE id=?", (session_id,),
            ).fetchone()
            if row is None:
                raise ServerError("SESSION_NOT_FOUND", "Session was not found", status=404)
            if int(row["version"]) != expected_version:
                raise _version_error(
                    "Session changed before it was archived", self._session_view(conn, session_id),
                )
            timestamp = now()
            conn.execute(
                "UPDATE server_sessions SET archived_at=COALESCE(archived_at,?),"
                "version=version+1,updated_at=? WHERE id=?",
                (timestamp, timestamp, session_id),
            )
            updated = self._session_view(conn, session_id)
            self.idempotency.insert(
                conn, scope, request_id, request_digest, 200, {"session": updated},
            )
            return updated

    def intent_outcome(self, request_id: str) -> dict[str, Any]:
        with self.database.read() as conn:
            row = conn.execute(
                "SELECT * FROM server_idempotency WHERE scope=? AND key=?",
                ("sessions.send", request_id),
            ).fetchone()
        if row is None:
            # "unknown" is not a safe-to-resend signal; the client must query
            # with the original identifier rather than minting a new one.
            return {"outcome": "unknown"}
        body = json.loads(row["response_json"])
        return {
            "outcome": "accepted",
            "sessionId": body["sessionId"],
            "executionId": body.get("executionId"),
            "configVersion": body["configVersion"],
            "queueItemId": body.get("queueItemId"),
        }

    @staticmethod
    def _session_view(conn, session_id: str) -> dict[str, Any]:
        row = conn.execute("SELECT * FROM server_sessions WHERE id=?", (session_id,)).fetchone()
        return {
            "id": row["id"], "version": int(row["version"]),
            "workspaceId": row["workspace_id"], "profileId": row["profile_id"],
            "displayName": row["display_name"] or row["id"],
            "pinned": bool(row["pinned"]),
            "archivedAt": row["archived_at"],
            "createdAt": row["created_at"], "updatedAt": row["updated_at"],
        }

    # -- turn acceptance (one transaction owns it) ------------------------

    def create_turn(
        self, *, session_id: str, key: str, request_digest: str,
        input_object_digest: str, expected_profile_revision: int,
    ) -> tuple[bool, int, dict[str, Any]]:
        """Accept one business intent.

        Returns `(claimed, status, body)`. `claimed` is true only for the
        racer whose transaction inserted the idempotency row; that racer —
        and no replay — owns the right to dispatch.
        """
        scope = f"POST:/sessions/{session_id}/turns"
        with self.database.transaction() as conn:
            prior = self.idempotency.check(conn, scope, key, request_digest)
            if prior:
                return False, prior[0], prior[1]
            session = conn.execute(
                "SELECT * FROM server_sessions WHERE id=?", (session_id,),
            ).fetchone()
            if session is None:
                raise ServerError("SESSION_NOT_FOUND", "Session was not found", status=404)
            profile = conn.execute(
                "SELECT * FROM server_profiles WHERE id=?", (session["profile_id"],),
            ).fetchone()
            if profile is None:
                raise ServerError("PROFILE_NOT_FOUND", "Profile was not found", status=404)
            if int(profile["config_revision"]) != expected_profile_revision:
                raise ServerError(
                    "PROFILE_REVISION_CONFLICT",
                    "Profile revision changed before Turn creation",
                    status=409,
                )
            if bool(profile["recovery_pending"]):
                raise ServerError(
                    "PROFILE_RECOVERY_REQUIRED",
                    "Profile has unresolved recovery evidence",
                    status=409,
                )
            turn_id = opaque_id("turn")
            timestamp = now()
            try:
                conn.execute(
                    "INSERT INTO server_turns(id,session_id,profile_id,profile_revision,native_generation,state,capture_state,cleanup_state,input_object_digest,created_at,updated_at) "
                    "VALUES (?,?,?,?,?,'accepted','pending','pending',?,?,?)",
                    (turn_id, session_id, session["profile_id"], expected_profile_revision,
                     int(profile["native_generation"]), input_object_digest, timestamp, timestamp),
                )
            except Exception as exc:
                if "UNIQUE constraint failed" in str(exc):
                    raise ServerError(
                        "TURN_CONCURRENCY_CONFLICT",
                        "Session or Profile already has an active Turn",
                        status=409,
                    ) from exc
                raise
            conn.execute(
                "UPDATE server_profiles SET run_state='active',updated_at=? WHERE id=?",
                (timestamp, session["profile_id"]),
            )
            conn.execute(
                "UPDATE server_sessions SET status='active',updated_at=? WHERE id=?",
                (timestamp, session_id),
            )
            event = self._append_session_event(
                conn, session_id, turn_id, "turn.accepted",
                {"state": "accepted", "profile_revision": expected_profile_revision},
            )
            body = {
                "turn_id": turn_id, "session_id": session_id, "state": "accepted",
                "event_seq": event["seq"],
            }
            self.idempotency.insert(conn, scope, key, request_digest, 202, body)
            return True, 202, body

    # -- restart recovery evidence ----------------------------------------

    def seal_interrupted_turns(self) -> int:
        """Seal pre-restart active Turns as unknown; never redispatch them."""
        active_states = ("accepted", "dispatching", "running", "capturing")
        with self.database.transaction() as conn:
            rows = conn.execute(
                "SELECT * FROM server_turns WHERE state IN (?,?,?,?) ORDER BY created_at,id",
                active_states,
            ).fetchall()
            timestamp = now()
            for row in rows:
                conn.execute(
                    "UPDATE server_turns SET state='unknown',capture_state='unknown',"
                    "cleanup_state='unknown',error_code='SERVER_RESTART_INTERRUPTED',updated_at=? "
                    "WHERE id=?",
                    (timestamp, row["id"]),
                )
                conn.execute(
                    "UPDATE server_sessions SET status='recovery_required',updated_at=? WHERE id=?",
                    (timestamp, row["session_id"]),
                )
                conn.execute(
                    "UPDATE server_profiles SET run_state='idle',recovery_pending=1,updated_at=? WHERE id=?",
                    (timestamp, row["profile_id"]),
                )
                self._append_session_event(
                    conn, row["session_id"], row["id"], "turn.capture",
                    {"state": "unknown", "error_code": "SERVER_RESTART_INTERRUPTED"},
                )
                self._append_session_event(
                    conn, row["session_id"], row["id"], "turn.state",
                    {"state": "unknown", "error_code": "SERVER_RESTART_INTERRUPTED"},
                )
            return len(rows)

    # -- dispatch/cancel/terminal transitions ------------------------------

    def get_turn_context(self, turn_id: str) -> dict[str, Any]:
        with self.database.read() as conn:
            row = conn.execute(
                "SELECT t.*,s.workspace_id,s.checkpoint_object_digest,s.checkpoint_native_id,"
                "p.harness_type,p.config_object_digest AS profile_config_object_digest,"
                "COALESCE(t.effective_config_object_digest,p.config_object_digest) "
                "AS config_object_digest,p.credential_id,"
                "w.connection_id,w.distribution,w.remote_user,w.remote_path "
                "FROM server_turns t JOIN server_sessions s ON s.id=t.session_id "
                "JOIN server_profiles p ON p.id=t.profile_id "
                "JOIN server_workspaces w ON w.id=s.workspace_id WHERE t.id=?",
                (turn_id,),
            ).fetchone()
        if row is None:
            raise ServerError("TURN_NOT_FOUND", "Turn was not found", status=404)
        return dict(row)

    def set_turn_dispatch(
        self, turn_id: str, *, work_id: str, execution_id: str,
        dispatch_id: str, state: str = "running",
    ) -> dict[str, Any]:
        with self.database.transaction() as conn:
            row = conn.execute("SELECT * FROM server_turns WHERE id=?", (turn_id,)).fetchone()
            if row is None:
                raise ServerError("TURN_NOT_FOUND", "Turn was not found", status=404)
            conn.execute(
                "UPDATE server_turns SET work_id=?,execution_id=?,dispatch_id=?,state=?,updated_at=? WHERE id=?",
                (work_id, execution_id, dispatch_id, state, now(), turn_id),
            )
            return self._append_session_event(
                conn, row["session_id"], turn_id, "turn.state", {"state": state},
            )

    def append_turn_event(self, turn_id: str, kind: str, data: dict[str, Any]) -> dict[str, Any]:
        with self.database.transaction() as conn:
            row = conn.execute("SELECT session_id FROM server_turns WHERE id=?", (turn_id,)).fetchone()
            if row is None:
                raise ServerError("TURN_NOT_FOUND", "Turn was not found", status=404)
            return self._append_session_event(conn, row["session_id"], turn_id, kind, data)

    def complete_turn(
        self, turn_id: str, *, checkpoint_object_digest: str,
        checkpoint_native_id: str, result_object_digest: str, queue_records=None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        with self.database.transaction() as conn:
            row = conn.execute("SELECT * FROM server_turns WHERE id=?", (turn_id,)).fetchone()
            if row is None:
                raise ServerError("TURN_NOT_FOUND", "Turn was not found", status=404)
            if row["state"] == "completed":
                events = conn.execute(
                    "SELECT * FROM server_session_events WHERE turn_id=? AND kind='turn.capture' ORDER BY seq DESC LIMIT 1",
                    (turn_id,),
                ).fetchone()
                return dict(row), self._event_dict(events)
            if row["state"] not in {"running", "capturing"}:
                raise ServerError("TURN_STATE_CONFLICT", "Turn cannot complete from its current state", status=409)
            timestamp = now()
            conn.execute(
                "UPDATE server_turns SET state='completed',capture_state='captured',cleanup_state='pending',result_object_digest=?,updated_at=? WHERE id=?",
                (result_object_digest, timestamp, turn_id),
            )
            conn.execute(
                "UPDATE server_sessions SET status='ready',checkpoint_object_digest=?,checkpoint_native_id=?,updated_at=? WHERE id=?",
                (checkpoint_object_digest, checkpoint_native_id, timestamp, row["session_id"]),
            )
            updated_profile = conn.execute(
                "UPDATE server_profiles SET run_state='idle',native_generation=native_generation+1,"
                "updated_at=? WHERE id=? AND native_generation=?",
                (timestamp, row["profile_id"], row["native_generation"]),
            )
            if updated_profile.rowcount != 1:
                raise ServerError(
                    "PROFILE_GENERATION_CONFLICT",
                    "Profile native generation changed during the Turn",
                    status=409,
                )
            event = self._append_session_event(
                conn, row["session_id"], turn_id, "turn.capture",
                {"state": "captured", "checkpoint_native_id": checkpoint_native_id,
                 "checkpoint_object_digest": checkpoint_object_digest,
                 "result_object_digest": result_object_digest},
            )
            self._append_session_event(
                conn, row["session_id"], turn_id, "turn.state", {"state": "completed"},
            )
            next_execution_id = None
            if queue_records is not None:
                if row["queue_item_id"] is not None:
                    queue_records.mark_terminal(conn, row["queue_item_id"], "completed")
                item = queue_records.claim_next(conn, row["session_id"])
                if item is not None:
                    profile = conn.execute(
                        "SELECT * FROM server_profiles WHERE id=?", (item["profileId"],),
                    ).fetchone()
                    if profile is None:
                        raise ServerError("PROFILE_NOT_FOUND", "Queued Profile was not found", status=404)
                    next_execution_id = self._insert_execution(
                        conn, session_id=row["session_id"], profile=profile,
                        config_version=item["configVersion"],
                        input_object_digest=item["_messageObjectDigest"],
                        effective_config_object_digest=item["_effectiveConfigObjectDigest"],
                        queue_item_id=item["itemId"],
                    )
            updated = conn.execute("SELECT * FROM server_turns WHERE id=?", (turn_id,)).fetchone()
            result = dict(updated)
            result["next_execution_id"] = next_execution_id
            return result, event

    def mark_turn_cleanup(self, turn_id: str, state: str) -> None:
        with self.database.transaction() as conn:
            conn.execute(
                "UPDATE server_turns SET cleanup_state=?,updated_at=? WHERE id=?",
                (state, now(), turn_id),
            )

    def record_cancel_request(self, turn_id: str) -> dict[str, Any]:
        with self.database.transaction() as conn:
            row = conn.execute("SELECT * FROM server_turns WHERE id=?", (turn_id,)).fetchone()
            if row is None:
                raise ServerError("TURN_NOT_FOUND", "Turn was not found", status=404)
            timestamp = now()
            conn.execute(
                "UPDATE server_turns SET stop_requested_at=COALESCE(stop_requested_at,?),updated_at=? "
                "WHERE id=?",
                (timestamp, timestamp, turn_id),
            )
            return self._append_session_event(
                conn, row["session_id"], turn_id, "turn.state",
                {"state": row["state"], "cancel_requested": True},
            )

    def finish_cancelled(self, turn_id: str, *, queue_records=None) -> dict[str, Any]:
        with self.database.transaction() as conn:
            row = conn.execute("SELECT * FROM server_turns WHERE id=?", (turn_id,)).fetchone()
            if row is None:
                raise ServerError("TURN_NOT_FOUND", "Turn was not found", status=404)
            if row["state"] in {"completed", "failed", "cancelled", "unknown"}:
                return dict(row)
            timestamp = now()
            conn.execute(
                "UPDATE server_turns SET state='cancelled',capture_state='not-captured',"
                "error_code='TURN_CANCELLED',updated_at=? WHERE id=?",
                (timestamp, turn_id),
            )
            conn.execute(
                "UPDATE server_sessions SET status='ready',updated_at=? WHERE id=?",
                (timestamp, row["session_id"]),
            )
            conn.execute(
                "UPDATE server_profiles SET run_state='idle',updated_at=? WHERE id=?",
                (timestamp, row["profile_id"]),
            )
            if queue_records is not None:
                if row["queue_item_id"] is not None:
                    queue_records.mark_terminal(conn, row["queue_item_id"], "cancelled")
                queue_records.pause_pending(conn, row["session_id"], "cancelled")
            return self._append_session_event(
                conn, row["session_id"], turn_id, "turn.state",
                {"state": "cancelled", "error_code": "TURN_CANCELLED"},
            )

    def fail_turn(
        self, turn_id: str, code: str, *, capture_state: str = "failed", queue_records=None,
    ) -> dict[str, Any]:
        with self.database.transaction() as conn:
            row = conn.execute("SELECT * FROM server_turns WHERE id=?", (turn_id,)).fetchone()
            if row is None:
                raise ServerError("TURN_NOT_FOUND", "Turn was not found", status=404)
            if row["state"] in {"completed", "failed", "cancelled", "unknown"}:
                return dict(row)
            state = "unknown" if code in {"WORKER_DISCONNECTED", "DISPATCH_AMBIGUOUS"} else "failed"
            recovery_required = state == "unknown" or (
                row["state"] in {"running", "capturing"} and capture_state == "failed"
            )
            timestamp = now()
            conn.execute(
                "UPDATE server_turns SET state=?,capture_state=?,error_code=?,updated_at=? WHERE id=?",
                (state, capture_state, code[:128], timestamp, turn_id),
            )
            conn.execute(
                "UPDATE server_sessions SET status=?,updated_at=? WHERE id=?",
                ("recovery_required" if recovery_required else "ready", timestamp, row["session_id"]),
            )
            conn.execute(
                "UPDATE server_profiles SET run_state='idle',recovery_pending=?,updated_at=? WHERE id=?",
                (1 if recovery_required else 0, timestamp, row["profile_id"]),
            )
            if queue_records is not None:
                if row["queue_item_id"] is not None:
                    queue_records.mark_terminal(conn, row["queue_item_id"], "failed")
                queue_records.pause_pending(conn, row["session_id"], code)
            self._append_session_event(
                conn, row["session_id"], turn_id, "turn.capture",
                {"state": capture_state, "error_code": code[:128]},
            )
            return self._append_session_event(
                conn, row["session_id"], turn_id, "turn.state",
                {"state": state, "error_code": code[:128]},
            )

    # -- reads --------------------------------------------------------------

    def get_session(self, session_id: str, *, event_limit: int = 200) -> dict[str, Any]:
        with self.database.read() as conn:
            row = conn.execute("SELECT * FROM server_sessions WHERE id=?", (session_id,)).fetchone()
            if row is None:
                raise ServerError("SESSION_NOT_FOUND", "Session was not found", status=404)
            turns = conn.execute(
                "SELECT id,state,capture_state,cleanup_state,profile_revision,native_generation,"
                "work_id,execution_id,dispatch_id,result_object_digest,error_code,"
                "stop_requested_at,created_at "
                "FROM server_turns WHERE session_id=? ORDER BY created_at,id LIMIT ?",
                (session_id, event_limit),
            ).fetchall()
            events = conn.execute(
                "SELECT seq,event_id,turn_id,kind,schema_version,data_json,created_at "
                "FROM server_session_events WHERE session_id=? ORDER BY seq LIMIT ?",
                (session_id, event_limit),
            ).fetchall()
        return {
            "session_id": row["id"], "workspace_id": row["workspace_id"],
            "profile_id": row["profile_id"], "status": row["status"],
            "version": int(row["version"] or 1),
            "display_name": row["display_name"], "pinned": bool(row["pinned"]),
            "archived_at": row["archived_at"],
            "checkpoint": ({"object_digest": row["checkpoint_object_digest"],
                            "native_id": row["checkpoint_native_id"]}
                           if row["checkpoint_object_digest"] else None),
            "turns": [dict(item) for item in turns],
            "events": [self._event_dict(item) for item in events],
            "created_at": row["created_at"], "updated_at": row["updated_at"],
        }

    def raw_events(self, session_id: str, after: int, *, limit: int = 500) -> list[Any]:
        """Return stored event rows after `after`, for wire frame projection.

        Deliberately returns raw rows: the wire layer owns kind projection, and
        internal bookkeeping kinds must not be re-encoded here.
        """
        with self.database.read() as conn:
            if conn.execute("SELECT 1 FROM server_sessions WHERE id=?", (session_id,)).fetchone() is None:
                raise ServerError("SESSION_NOT_FOUND", "Session was not found", status=404)
            maximum = conn.execute(
                "SELECT COALESCE(MAX(seq),0) FROM server_session_events WHERE session_id=?", (session_id,)
            ).fetchone()[0]
            if after > maximum:
                raise ServerError("EVENT_CURSOR_AHEAD", "Event cursor is beyond current history", status=409)
            return conn.execute(
                "SELECT seq,wire_seq,event_id,session_id,turn_id,kind,schema_version,data_json,created_at "
                "FROM server_session_events WHERE session_id=? AND seq>? ORDER BY seq LIMIT ?",
                (session_id, after, limit),
            ).fetchall()

    def history_page(
        self, session_id: str, *, after: int | None = None,
        before: int | None = None, limit: int = 200,
    ) -> tuple[list[Any], int, bool]:
        """Read a consistent history page and its raw event-log head.

        `after` is a forward/live position. `before` is an exclusive backward
        boundary. The returned rows are always in durable ascending order and
        `has_older` only describes the backward view.
        """
        if after is not None and before is not None:
            raise ValueError("history directions are mutually exclusive")
        with self.database.read() as conn:
            conn.execute("BEGIN")
            if conn.execute(
                "SELECT 1 FROM server_sessions WHERE id=?", (session_id,),
            ).fetchone() is None:
                raise ServerError("SESSION_NOT_FOUND", "Session was not found", status=404)
            head = int(conn.execute(
                "SELECT COALESCE(MAX(seq),0) FROM server_session_events WHERE session_id=?",
                (session_id,),
            ).fetchone()[0])
            if after is not None:
                if after > head:
                    raise ServerError(
                        "EVENT_CURSOR_AHEAD", "Event cursor is beyond current history", status=409,
                    )
                rows = conn.execute(
                    "SELECT seq,wire_seq,event_id,session_id,turn_id,kind,schema_version,"
                    "data_json,created_at FROM server_session_events "
                    "WHERE session_id=? AND seq>? ORDER BY seq LIMIT ?",
                    (session_id, after, limit),
                ).fetchall()
                return rows, head, False
            boundary = head + 1 if before is None else before
            if boundary > head + 1:
                raise ServerError(
                    "EVENT_CURSOR_AHEAD", "History page cursor is beyond current history", status=409,
                )
            descending = conn.execute(
                "SELECT seq,wire_seq,event_id,session_id,turn_id,kind,schema_version,"
                "data_json,created_at FROM server_session_events "
                "WHERE session_id=? AND seq<? ORDER BY seq DESC LIMIT ?",
                (session_id, boundary, limit),
            ).fetchall()
            rows = list(reversed(descending))
            earliest = int(rows[0]["seq"]) if rows else boundary
            has_older = conn.execute(
                "SELECT 1 FROM server_session_events WHERE session_id=? AND seq<? LIMIT 1",
                (session_id, earliest),
            ).fetchone() is not None
            return rows, head, has_older

    def list_events(self, session_id: str, after: int, *, limit: int = 500) -> list[dict[str, Any]]:
        with self.database.read() as conn:
            if conn.execute("SELECT 1 FROM server_sessions WHERE id=?", (session_id,)).fetchone() is None:
                raise ServerError("SESSION_NOT_FOUND", "Session was not found", status=404)
            maximum = conn.execute(
                "SELECT COALESCE(MAX(seq),0) FROM server_session_events WHERE session_id=?", (session_id,)
            ).fetchone()[0]
            if after > maximum:
                raise ServerError("EVENT_CURSOR_AHEAD", "Event cursor is beyond current history", status=409)
            rows = conn.execute(
                "SELECT seq,wire_seq,event_id,turn_id,kind,schema_version,data_json,created_at "
                "FROM server_session_events WHERE session_id=? AND seq>? ORDER BY seq LIMIT ?",
                (session_id, after, limit),
            ).fetchall()
        return [self._event_dict(row) for row in rows]

    # -- internals ------------------------------------------------------------

    @staticmethod
    def _append_session_event(
        conn, session_id: str, turn_id: str | None, kind: str,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        seq = int(conn.execute(
            "SELECT COALESCE(MAX(seq),0)+1 FROM server_session_events WHERE session_id=?",
            (session_id,),
        ).fetchone()[0])
        event_id = opaque_id("event")
        created_at = now()
        wire_seq = None
        if kind in WIRE_VISIBLE_EVENT_KINDS:
            wire_seq = int(conn.execute(
                "SELECT COALESCE(MAX(wire_seq),0)+1 FROM server_session_events WHERE session_id=?",
                (session_id,),
            ).fetchone()[0])
        conn.execute(
            "INSERT INTO server_session_events(session_id,seq,wire_seq,event_id,turn_id,kind,schema_version,data_json,created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (session_id, seq, wire_seq, event_id, turn_id, kind, 1,
             json.dumps(data, ensure_ascii=False, sort_keys=True), created_at),
        )
        return {
            "session_id": session_id, "seq": seq, "wire_seq": wire_seq, "event_id": event_id,
            "turn_id": turn_id, "kind": kind, "schema_version": 1,
            "data": data, "created_at": created_at,
        }

    @staticmethod
    def _event_dict(row) -> dict[str, Any]:
        item = dict(row)
        item["data"] = json.loads(item.pop("data_json"))
        return item
