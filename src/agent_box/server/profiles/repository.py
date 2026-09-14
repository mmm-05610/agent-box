"""Storage for Profile role records; capability claims are not stored here.

Stored rows carry configuration identity only. Any capability statement in
a response is joined by the use case from the registered Harness descriptor,
so an unregistered or unverified Harness can never look capable.
"""
from __future__ import annotations

from typing import Any

from agent_box.server.errors import ServerError
from agent_box.server.idempotency import IdempotentRecords
from agent_box.server.ids import now, opaque_id
from agent_box.storage import Database


class ProfileRecords:
    def __init__(self, database: Database, idempotency: IdempotentRecords) -> None:
        self.database = database
        self.idempotency = idempotency

    def create(
        self, *, key: str, request_digest: str, name: str, harness_type: str,
        config_digest: str, credential_id: str | None,
    ) -> tuple[int, dict[str, Any]]:
        with self.database.transaction() as conn:
            prior = self.idempotency.check(conn, "POST:/profiles", key, request_digest)
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
                "run_state": "idle",
            }
            conn.execute(
                "INSERT INTO server_profiles(id,name,harness_type,config_revision,native_generation,config_object_digest,credential_id,created_at,updated_at) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (body["profile_id"], name, harness_type, 1, 0, config_digest,
                 credential_id, timestamp, timestamp),
            )
            self.idempotency.insert(conn, "POST:/profiles", key, request_digest, 201, body)
            return 201, body

    def get(self, profile_id: str) -> dict[str, Any]:
        with self.database.read() as conn:
            row = conn.execute(
                "SELECT * FROM server_profiles WHERE id=?", (profile_id,),
            ).fetchone()
        if row is None:
            raise ServerError("PROFILE_NOT_FOUND", "Profile was not found", status=404)
        return dict(row)

    def exists(self, conn, profile_id: str) -> bool:
        return conn.execute(
            "SELECT 1 FROM server_profiles WHERE id=?", (profile_id,),
        ).fetchone() is not None

    def list(self, *, include_archived: bool = True) -> list[dict[str, Any]]:
        with self.database.read() as conn:
            if include_archived:
                rows = conn.execute("SELECT * FROM server_profiles ORDER BY created_at,id").fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM server_profiles WHERE archived_at IS NULL ORDER BY created_at,id"
                ).fetchall()
        return [dict(row) for row in rows]
