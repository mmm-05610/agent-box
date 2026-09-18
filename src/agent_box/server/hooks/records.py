"""Order 59: the hook ledger - create, edit, enable, disable, delete.

Every mutation validates the model against the family's schema *before* it is
stored, so an illegal event / matcher / handler / timeout cannot be saved at
all (G2: "非法配置在保存前就被拒（带原因）"). A hook is disabled until the
user enables it, and the enablement is recorded separately from the model so
the UI can show the full command that enabling will run.
"""
from __future__ import annotations

import json
from typing import Any, Mapping

from agent_box.server.errors import ServerError
from agent_box.server.hooks.model import HookModelError, command_preview, validate_model
from agent_box.server.idempotency import IdempotentRecords
from agent_box.server.ids import now, opaque_id
from agent_box.storage import Database


def _refusal(error: HookModelError) -> ServerError:
    return ServerError(error.code, error.message, status=409)


class HookRecords:
    def __init__(self, database: Database, idempotency: IdempotentRecords) -> None:
        self.database = database
        self.idempotency = idempotency

    def create(
        self, *, key: str, request_digest: str, family: str, name: str,
        model: Mapping[str, Any], source: str | None = None,
    ) -> tuple[str, dict[str, Any]]:
        scope = f"hooks.create:{family}:{name}"
        with self.database.transaction() as conn:
            prior = self.idempotency.check(conn, scope, key, request_digest)
            if prior:
                return "replay", prior[1]
            if not isinstance(name, str) or not name.strip() or len(name) > 128:
                raise ServerError("HOOK_FIELD_INVALID", "the name must be short text", status=400)
            try:
                canonical = validate_model(family, model)
            except HookModelError as error:
                raise _refusal(error) from error
            hook_id = opaque_id("hook")
            timestamp = now()
            conn.execute(
                "INSERT INTO server_hooks(id,family,name,enabled,model_json,source,"
                "created_at,updated_at) VALUES (?,?,?,0,?,?,?,?)",
                (hook_id, family, name.strip(), json.dumps(canonical, sort_keys=True),
                 source, timestamp, timestamp),
            )
            body = self._view(conn, hook_id)
            self.idempotency.insert(conn, scope, key, request_digest, 201, body)
            return "created", body

    def update(
        self, *, hook_id: str, model: Mapping[str, Any],
    ) -> dict[str, Any]:
        row = self.get(hook_id)
        try:
            canonical = validate_model(str(row["family"]), model)
        except HookModelError as error:
            raise _refusal(error) from error
        timestamp = now()
        with self.database.transaction() as conn:
            conn.execute(
                "UPDATE server_hooks SET model_json=?,updated_at=? WHERE id=?",
                (json.dumps(canonical, sort_keys=True), timestamp, hook_id),
            )
            return self._view(conn, hook_id)

    def set_enabled(self, *, hook_id: str, enabled: bool) -> dict[str, Any]:
        row = self.get(hook_id)
        if enabled and not command_preview(json.loads(row["model_json"])):
            # Enabling is what makes a hook run; a declarative hook with no
            # command would enable something that does nothing, so it is not
            # enableable (http/mcp handlers are declared but not executed by
            # this server yet, and saying so here keeps the switch honest).
            raise ServerError(
                "HOOK_NOT_EXECUTABLE",
                "this hook has no command handler, so enabling it would mean nothing",
                status=409,
            )
        timestamp = now()
        with self.database.transaction() as conn:
            conn.execute(
                "UPDATE server_hooks SET enabled=?,updated_at=? WHERE id=?",
                (1 if enabled else 0, timestamp, hook_id),
            )
            return self._view(conn, hook_id)

    def delete(self, *, hook_id: str) -> None:
        with self.database.transaction() as conn:
            removed = conn.execute("DELETE FROM server_hooks WHERE id=?", (hook_id,))
            if removed.rowcount != 1:
                raise ServerError("HOOK_NOT_FOUND", "Hook was not found", status=404)

    def get(self, hook_id: str) -> dict[str, Any]:
        with self.database.read() as conn:
            row = conn.execute("SELECT * FROM server_hooks WHERE id=?", (hook_id,)).fetchone()
        if row is None:
            raise ServerError("HOOK_NOT_FOUND", "Hook was not found", status=404)
        return dict(row)

    def list(self, *, family: str | None = None) -> list[dict[str, Any]]:
        with self.database.read() as conn:
            if family is None:
                rows = conn.execute(
                    "SELECT * FROM server_hooks ORDER BY family,name,id").fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM server_hooks WHERE family=? ORDER BY name,id",
                    (family,)).fetchall()
        return [self._view_row(row) for row in rows]

    def enabled_for_family(self, family: str) -> list[dict[str, Any]]:
        """The hooks one execution would materialise (enabled, that family)."""
        return [view for view in self.list(family=family) if view["enabled"]]

    def _view(self, conn, hook_id: str) -> dict[str, Any]:
        row = conn.execute("SELECT * FROM server_hooks WHERE id=?", (hook_id,)).fetchone()
        return self._view_row(row)

    def _view_row(self, row) -> dict[str, Any]:
        model = json.loads(row["model_json"])
        return {
            "hook_id": row["id"],
            "family": row["family"],
            "name": row["name"],
            "enabled": bool(row["enabled"]),
            "model": model,
            "commands": command_preview(model),
            "source": row["source"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }


def hook_view(row: Mapping[str, Any]) -> dict[str, Any]:
    """The wire-facing shape: the model and the exact commands it would run."""
    model = json.loads(row["model_json"])
    return {
        "hookId": row["id"],
        "family": row["family"],
        "name": row["name"],
        "enabled": bool(row["enabled"]),
        "model": model,
        "commands": command_preview(model),
        "source": row.get("source"),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }
