"""Storage for Workspace records; one private connection per workspace."""
from __future__ import annotations

from typing import Any

from agent_box.server.errors import ServerError
from agent_box.server.idempotency import IdempotentRecords
from agent_box.server.ids import now, opaque_id
from agent_box.storage import Database


class WorkspaceRecords:
    def __init__(self, database: Database, idempotency: IdempotentRecords) -> None:
        self.database = database
        self.idempotency = idempotency

    def create(
        self, *, key: str, request_digest: str, distribution: str,
        remote_user: str | None, remote_path: str, connection_id: str,
    ) -> tuple[int, dict[str, Any]]:
        with self.database.transaction() as conn:
            prior = self.idempotency.check(conn, "POST:/workspaces", key, request_digest)
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
            self.idempotency.insert(conn, "POST:/workspaces", key, request_digest, 201, body)
            return 201, body

    def list(self) -> list[dict[str, Any]]:
        with self.database.read() as conn:
            rows = conn.execute(
                "SELECT * FROM server_workspaces ORDER BY created_at,id"
            ).fetchall()
        return [{
            "workspace_id": row["id"], "connection_id": row["connection_id"],
            "distribution": row["distribution"], "user": row["remote_user"],
            "path": row["remote_path"], "connection_state": row["connection_state"],
        } for row in rows]

    def mark_all_unverified(self) -> None:
        with self.database.transaction() as conn:
            conn.execute(
                "UPDATE server_workspaces SET connection_state='unverified', updated_at=? "
                "WHERE connection_state!='unverified'",
                (now(),),
            )

    def get(self, workspace_id: str) -> dict[str, Any]:
        with self.database.read() as conn:
            row = conn.execute(
                "SELECT * FROM server_workspaces WHERE id=?", (workspace_id,),
            ).fetchone()
        if row is None:
            raise ServerError("WORKSPACE_NOT_FOUND", "Workspace was not found", status=404)
        return dict(row)

    def mark_verified(self, workspace_id: str) -> None:
        with self.database.transaction() as conn:
            conn.execute(
                "UPDATE server_workspaces SET connection_state='verified',updated_at=? WHERE id=?",
                (now(), workspace_id),
            )

    def exists(self, conn, workspace_id: str) -> bool:
        return conn.execute(
            "SELECT 1 FROM server_workspaces WHERE id=?", (workspace_id,),
        ).fetchone() is not None
