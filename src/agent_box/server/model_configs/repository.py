"""Transactional Provider/Model records with idempotency and CAS."""
from __future__ import annotations

from typing import Any

from agent_box.server.errors import ServerError
from agent_box.server.idempotency import IdempotentRecords
from agent_box.server.ids import now, opaque_id
from agent_box.storage import Database


class ProviderModelRecords:
    def __init__(self, database: Database, idempotency: IdempotentRecords) -> None:
        self.database = database
        self.idempotency = idempotency

    def get(self, record_id: str) -> dict[str, Any]:
        with self.database.read() as conn:
            row = conn.execute(
                "SELECT * FROM server_provider_models WHERE id=?", (record_id,),
            ).fetchone()
        if row is None:
            raise ServerError("PROVIDER_MODEL_NOT_FOUND", "Provider/Model config was not found", status=404)
        return dict(row)

    def list(self, *, include_archived: bool = False) -> list[dict[str, Any]]:
        with self.database.read() as conn:
            where = "" if include_archived else " WHERE archived_at IS NULL"
            rows = conn.execute(
                "SELECT * FROM server_provider_models" + where + " ORDER BY created_at,id"
            ).fetchall()
        return [dict(row) for row in rows]

    def create(
        self, *, key: str, request_digest: str, display_name: str,
        harness_type: str, provider_type: str, credential_id: str | None,
        config_digest: str, models_digest: str,
    ) -> tuple[int, dict[str, Any]]:
        scope = "providerModels.create"
        with self.database.transaction() as conn:
            prior = self.idempotency.check(conn, scope, key, request_digest)
            if prior:
                return prior
            if credential_id is not None and conn.execute(
                "SELECT 1 FROM server_credentials WHERE id=?", (credential_id,),
            ).fetchone() is None:
                raise ServerError("CREDENTIAL_NOT_FOUND", "Credential was not found", status=404)
            timestamp = now()
            record_id = opaque_id("provider")
            conn.execute(
                "INSERT INTO server_provider_models(id,version,display_name,harness_type,"
                "provider_type,credential_id,config_object_digest,models_object_digest,"
                "created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (record_id, 1, display_name, harness_type, provider_type, credential_id,
                 config_digest, models_digest, timestamp, timestamp),
            )
            body = {"providerModelId": record_id}
            self.idempotency.insert(conn, scope, key, request_digest, 201, body)
            return 201, body

    def update(
        self, *, record_id: str, expected_version: int, key: str, request_digest: str,
        display_name: str, credential_id: str | None, config_digest: str, models_digest: str,
    ) -> tuple[int, dict[str, Any]]:
        scope = f"providerModels.update:{record_id}"
        with self.database.transaction() as conn:
            prior = self.idempotency.check(conn, scope, key, request_digest)
            if prior:
                return prior
            row = self._require(conn, record_id)
            self._expect_version(row, expected_version)
            if credential_id is not None and conn.execute(
                "SELECT 1 FROM server_credentials WHERE id=?", (credential_id,),
            ).fetchone() is None:
                raise ServerError("CREDENTIAL_NOT_FOUND", "Credential was not found", status=404)
            conn.execute(
                "UPDATE server_provider_models SET display_name=?,credential_id=?,"
                "config_object_digest=?,models_object_digest=?,version=version+1,updated_at=? "
                "WHERE id=?",
                (display_name, credential_id, config_digest, models_digest, now(), record_id),
            )
            body = {"providerModelId": record_id}
            self.idempotency.insert(conn, scope, key, request_digest, 200, body)
            return 200, body

    def archive(
        self, *, record_id: str, expected_version: int, key: str, request_digest: str,
    ) -> tuple[int, dict[str, Any]]:
        scope = f"providerModels.archive:{record_id}"
        with self.database.transaction() as conn:
            prior = self.idempotency.check(conn, scope, key, request_digest)
            if prior:
                return prior
            row = self._require(conn, record_id)
            self._expect_version(row, expected_version)
            conn.execute(
                "UPDATE server_provider_models SET archived_at=COALESCE(archived_at,?),"
                "version=version+1,updated_at=? WHERE id=?",
                (now(), now(), record_id),
            )
            body = {"providerModelId": record_id}
            self.idempotency.insert(conn, scope, key, request_digest, 200, body)
            return 200, body

    @staticmethod
    def _require(conn, record_id: str):
        row = conn.execute("SELECT * FROM server_provider_models WHERE id=?", (record_id,)).fetchone()
        if row is None:
            raise ServerError("PROVIDER_MODEL_NOT_FOUND", "Provider/Model config was not found", status=404)
        return row

    @staticmethod
    def _expect_version(row, expected_version: int) -> None:
        if int(row["version"]) == expected_version:
            return
        error = ServerError(
            "RECORD_VERSION_CONFLICT", "Provider/Model config changed before the update", status=409,
        )
        error.current = dict(row)  # type: ignore[attr-defined]
        raise error
