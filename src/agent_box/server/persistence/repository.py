"""Product-owned records; Core tables remain accessible only through Core."""
from __future__ import annotations

from datetime import datetime, timezone
import json
from typing import Any, Callable
from uuid import uuid4

from agent_box.storage import Database
from agent_box.server.errors import ServerError


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def opaque_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


class ProductRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    @staticmethod
    def _idempotent(conn, scope: str, key: str, request_digest: str):
        row = conn.execute(
            "SELECT * FROM server_idempotency WHERE scope=? AND key=?", (scope, key)
        ).fetchone()
        if row is None:
            return None
        if row["request_digest"] != request_digest:
            raise ServerError(
                "IDEMPOTENCY_CONFLICT",
                "Idempotency-Key was already used with a different request",
                status=409,
            )
        return int(row["status_code"]), json.loads(row["response_json"])

    @staticmethod
    def _save_idempotent(conn, scope, key, request_digest, status, body) -> None:
        conn.execute(
            "INSERT INTO server_idempotency(scope,key,request_digest,status_code,response_json,created_at) "
            "VALUES (?,?,?,?,?,?)",
            (scope, key, request_digest, status, json.dumps(body, sort_keys=True), now()),
        )

    def get_idempotent(self, scope: str, key: str, request_digest: str):
        with self.database.read() as conn:
            return self._idempotent(conn, scope, key, request_digest)

    def save_idempotent(self, scope: str, key: str, request_digest: str, status: int, body: dict[str, Any]):
        with self.database.transaction() as conn:
            prior = self._idempotent(conn, scope, key, request_digest)
            if prior:
                return prior
            self._save_idempotent(conn, scope, key, request_digest, status, body)
            return status, body

    def create_workspace(
        self, *, key: str, request_digest: str, distribution: str,
        remote_user: str | None, remote_path: str, connection_id: str,
    ) -> tuple[int, dict[str, Any]]:
        with self.database.transaction() as conn:
            prior = self._idempotent(conn, "POST:/workspaces", key, request_digest)
            if prior:
                return prior
            timestamp = now()
            body = {
                "workspace_id": opaque_id("ws"), "connection_id": connection_id,
                "distribution": distribution, "user": remote_user,
                "path": remote_path, "connection_state": "verified",
            }
            conn.execute(
                "INSERT INTO server_workspaces(id,connection_id,distribution,remote_user,remote_path,connection_state,created_at,updated_at) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (body["workspace_id"], connection_id, distribution, remote_user, remote_path,
                 "verified", timestamp, timestamp),
            )
            self._save_idempotent(conn, "POST:/workspaces", key, request_digest, 201, body)
            return 201, body

    def list_workspaces(self) -> list[dict[str, Any]]:
        with self.database.read() as conn:
            rows = conn.execute(
                "SELECT * FROM server_workspaces ORDER BY created_at,id"
            ).fetchall()
        return [{
            "workspace_id": row["id"], "connection_id": row["connection_id"],
            "distribution": row["distribution"], "user": row["remote_user"],
            "path": row["remote_path"], "connection_state": row["connection_state"],
        } for row in rows]

    def mark_workspaces_unverified(self) -> None:
        with self.database.transaction() as conn:
            conn.execute(
                "UPDATE server_workspaces SET connection_state='unverified', updated_at=? "
                "WHERE connection_state!='unverified'",
                (now(),),
            )

    def recover_interrupted_turns(self) -> int:
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

    def register_credential(
        self, credential_id: str, kind: str, secret_locator: str,
    ) -> dict[str, Any]:
        with self.database.transaction() as conn:
            conn.execute(
                "INSERT INTO server_credentials(id,kind,secret_locator,created_at) VALUES (?,?,?,?)",
                (credential_id, kind, secret_locator, now()),
            )
        return {"credential_id": credential_id, "kind": kind}

    def get_credential(self, credential_id: str, *, kind: str | None = None) -> dict[str, Any]:
        with self.database.read() as conn:
            row = conn.execute(
                "SELECT * FROM server_credentials WHERE id=?", (credential_id,),
            ).fetchone()
        if row is None or (kind is not None and row["kind"] != kind):
            raise ServerError("CREDENTIAL_NOT_FOUND", "Credential was not found", status=404)
        return dict(row)

    def has_credentials(self, *, kind: str | None = None) -> bool:
        with self.database.read() as conn:
            if kind is None:
                row = conn.execute("SELECT 1 FROM server_credentials LIMIT 1").fetchone()
            else:
                row = conn.execute(
                    "SELECT 1 FROM server_credentials WHERE kind=? LIMIT 1", (kind,),
                ).fetchone()
        return row is not None

    def get_workspace_record(self, workspace_id: str) -> dict[str, Any]:
        with self.database.read() as conn:
            row = conn.execute(
                "SELECT * FROM server_workspaces WHERE id=?", (workspace_id,),
            ).fetchone()
        if row is None:
            raise ServerError("WORKSPACE_NOT_FOUND", "Workspace was not found", status=404)
        return dict(row)

    def mark_workspace_verified(self, workspace_id: str) -> None:
        with self.database.transaction() as conn:
            conn.execute(
                "UPDATE server_workspaces SET connection_state='verified',updated_at=? WHERE id=?",
                (now(), workspace_id),
            )

    def get_profile_record(self, profile_id: str) -> dict[str, Any]:
        with self.database.read() as conn:
            row = conn.execute(
                "SELECT * FROM server_profiles WHERE id=?", (profile_id,),
            ).fetchone()
        if row is None:
            raise ServerError("PROFILE_NOT_FOUND", "Profile was not found", status=404)
        return dict(row)

    def create_profile(
        self, *, key: str, request_digest: str, name: str, harness_type: str,
        config_digest: str, credential_id: str | None,
    ) -> tuple[int, dict[str, Any]]:
        with self.database.transaction() as conn:
            prior = self._idempotent(conn, "POST:/profiles", key, request_digest)
            if prior:
                return prior
            if credential_id is not None and conn.execute(
                "SELECT 1 FROM server_credentials WHERE id=?", (credential_id,),
            ).fetchone() is None:
                raise ServerError("CREDENTIAL_NOT_FOUND", "Credential was not found", status=404)
            timestamp = now()
            body = {
                "profile_id": opaque_id("profile"), "name": name,
                "harness_type": harness_type, "config_revision": 1,
                "native_generation": 0, "credential_id": credential_id,
                "run_state": "idle", "capabilities": {"native_memory": harness_type == "codex"},
            }
            conn.execute(
                "INSERT INTO server_profiles(id,name,harness_type,config_revision,native_generation,config_object_digest,credential_id,created_at,updated_at) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (body["profile_id"], name, harness_type, 1, 0, config_digest,
                 credential_id, timestamp, timestamp),
            )
            self._save_idempotent(conn, "POST:/profiles", key, request_digest, 201, body)
            return 201, body

    def list_profiles(self) -> list[dict[str, Any]]:
        with self.database.read() as conn:
            rows = conn.execute("SELECT * FROM server_profiles ORDER BY created_at,id").fetchall()
        return [{
            "profile_id": row["id"], "name": row["name"],
            "harness_type": row["harness_type"],
            "config_revision": row["config_revision"],
            "native_generation": row["native_generation"],
            "credential_id": row["credential_id"], "run_state": row["run_state"],
            "recovery_pending": bool(row["recovery_pending"]),
            "capabilities": {"native_memory": row["harness_type"] == "codex"},
        } for row in rows]

    def create_session(
        self, *, key: str, request_digest: str, workspace_id: str, profile_id: str,
    ) -> tuple[int, dict[str, Any]]:
        with self.database.transaction() as conn:
            prior = self._idempotent(conn, "POST:/sessions", key, request_digest)
            if prior:
                return prior
            if conn.execute("SELECT 1 FROM server_workspaces WHERE id=?", (workspace_id,)).fetchone() is None:
                raise ServerError("WORKSPACE_NOT_FOUND", "Workspace was not found", status=404)
            if conn.execute("SELECT 1 FROM server_profiles WHERE id=?", (profile_id,)).fetchone() is None:
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
            self._save_idempotent(conn, "POST:/sessions", key, request_digest, 201, body)
            return 201, body

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
        conn.execute(
            "INSERT INTO server_session_events(session_id,seq,event_id,turn_id,kind,schema_version,data_json,created_at) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (session_id, seq, event_id, turn_id, kind, 1,
             json.dumps(data, ensure_ascii=False, sort_keys=True), created_at),
        )
        return {
            "session_id": session_id, "seq": seq, "event_id": event_id,
            "turn_id": turn_id, "kind": kind, "schema_version": 1,
            "data": data, "created_at": created_at,
        }

    def create_turn(
        self, *, session_id: str, key: str, request_digest: str,
        input_object_digest: str, expected_profile_revision: int,
    ) -> tuple[int, dict[str, Any]]:
        scope = f"POST:/sessions/{session_id}/turns"
        with self.database.transaction() as conn:
            prior = self._idempotent(conn, scope, key, request_digest)
            if prior:
                return prior
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
            self._save_idempotent(conn, scope, key, request_digest, 202, body)
            return 202, body

    def get_turn_context(self, turn_id: str) -> dict[str, Any]:
        with self.database.read() as conn:
            row = conn.execute(
                "SELECT t.*,s.workspace_id,s.checkpoint_object_digest,s.checkpoint_native_id,"
                "p.harness_type,p.config_object_digest,p.credential_id,"
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
        checkpoint_native_id: str, result_object_digest: str,
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
            updated = conn.execute("SELECT * FROM server_turns WHERE id=?", (turn_id,)).fetchone()
            return dict(updated), event

    def mark_turn_cleanup(self, turn_id: str, state: str) -> None:
        with self.database.transaction() as conn:
            conn.execute(
                "UPDATE server_turns SET cleanup_state=?,updated_at=? WHERE id=?",
                (state, now(), turn_id),
            )

    def cancel_turn(self, turn_id: str) -> dict[str, Any]:
        with self.database.transaction() as conn:
            row = conn.execute("SELECT * FROM server_turns WHERE id=?", (turn_id,)).fetchone()
            if row is None:
                raise ServerError("TURN_NOT_FOUND", "Turn was not found", status=404)
            return self._append_session_event(
                conn, row["session_id"], turn_id, "turn.state",
                {"state": row["state"], "cancel_requested": True},
            )

    def finish_cancelled(self, turn_id: str) -> dict[str, Any]:
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
            return self._append_session_event(
                conn, row["session_id"], turn_id, "turn.state",
                {"state": "cancelled", "error_code": "TURN_CANCELLED"},
            )

    def fail_turn(self, turn_id: str, code: str, *, capture_state: str = "failed") -> dict[str, Any]:
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
            self._append_session_event(
                conn, row["session_id"], turn_id, "turn.capture",
                {"state": capture_state, "error_code": code[:128]},
            )
            return self._append_session_event(
                conn, row["session_id"], turn_id, "turn.state",
                {"state": state, "error_code": code[:128]},
            )

    def get_session(self, session_id: str, *, event_limit: int = 200) -> dict[str, Any]:
        with self.database.read() as conn:
            row = conn.execute("SELECT * FROM server_sessions WHERE id=?", (session_id,)).fetchone()
            if row is None:
                raise ServerError("SESSION_NOT_FOUND", "Session was not found", status=404)
            turns = conn.execute(
                "SELECT id,state,capture_state,cleanup_state,profile_revision,native_generation,"
                "work_id,execution_id,dispatch_id,result_object_digest,error_code,created_at "
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
            "checkpoint": ({"object_digest": row["checkpoint_object_digest"],
                            "native_id": row["checkpoint_native_id"]}
                           if row["checkpoint_object_digest"] else None),
            "turns": [dict(item) for item in turns],
            "events": [self._event_dict(item) for item in events],
        }

    @staticmethod
    def _event_dict(row) -> dict[str, Any]:
        item = dict(row)
        item["data"] = json.loads(item.pop("data_json"))
        return item

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
                "SELECT seq,event_id,turn_id,kind,schema_version,data_json,created_at "
                "FROM server_session_events WHERE session_id=? AND seq>? ORDER BY seq LIMIT ?",
                (session_id, after, limit),
            ).fetchall()
        result = []
        for row in rows:
            result.append(self._event_dict(row))
        return result
