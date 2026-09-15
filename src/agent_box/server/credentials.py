"""Credential registration records; secret contents stay in the SecretStore."""
from __future__ import annotations

from typing import Any

from agent_box.server.errors import ServerError
from agent_box.server.ids import now
from agent_box.storage import Database


class CredentialRecords:
    def __init__(self, database: Database) -> None:
        self.database = database

    def register(self, credential_id: str, kind: str, secret_locator: str) -> dict[str, Any]:
        with self.database.transaction() as conn:
            conn.execute(
                "INSERT INTO server_credentials(id,kind,secret_locator,created_at) VALUES (?,?,?,?)",
                (credential_id, kind, secret_locator, now()),
            )
        return {"credential_id": credential_id, "kind": kind}

    def list(self) -> list[dict[str, Any]]:
        """Every registered credential, without its locator.

        The locator is where the secret lives, so it stays inside the Server: a
        client that offers a choice needs the id and the kind, not the address.
        """
        with self.database.read() as conn:
            rows = conn.execute(
                "SELECT id,kind,created_at FROM server_credentials ORDER BY created_at,id",
            ).fetchall()
        return [
            {"credentialId": row["id"], "kind": row["kind"], "createdAt": row["created_at"]}
            for row in rows
        ]

    def exists(self, credential_id: str) -> bool:
        """Whether this id already resolves; used to make a restart idempotent.

        Registration names an identity, so re-declaring it in a deployment must
        satisfy it rather than duplicate it (the id is the primary key) or
        re-read its source.
        """
        with self.database.read() as conn:
            row = conn.execute(
                "SELECT 1 FROM server_credentials WHERE id=?", (credential_id,),
            ).fetchone()
        return row is not None

    def get(self, credential_id: str, *, kind: str | None = None) -> dict[str, Any]:
        with self.database.read() as conn:
            row = conn.execute(
                "SELECT * FROM server_credentials WHERE id=?", (credential_id,),
            ).fetchone()
        if row is None or (kind is not None and row["kind"] != kind):
            raise ServerError("CREDENTIAL_NOT_FOUND", "Credential was not found", status=404)
        return dict(row)

    def has(self, *, kind: str | None = None) -> bool:
        with self.database.read() as conn:
            if kind is None:
                row = conn.execute("SELECT 1 FROM server_credentials LIMIT 1").fetchone()
            else:
                row = conn.execute(
                    "SELECT 1 FROM server_credentials WHERE kind=? LIMIT 1", (kind,),
                ).fetchone()
        return row is not None
