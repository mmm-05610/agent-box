"""MCP server CRUD — database operations on mcp_servers table."""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from ...profile import ProfileError


# --- list / get -----------------------------------------------------------

def list_mcp_servers(agent_type: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return one entry per MCP server, optionally filtered by agent_type.

    When *agent_type* is given, only servers with a row in
    ``mcp_server_agents`` for that type are returned.
    """
    from ... import db
    conn = db.get_conn()
    if agent_type is None:
        rows = conn.execute(
            "SELECT id, name, description, homepage, docs, tags "
            "FROM mcp_servers ORDER BY name, id"
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT s.id, s.name, s.description, s.homepage, s.docs, s.tags "
            "FROM mcp_servers s "
            "INNER JOIN mcp_server_agents a ON a.mcp_server_id = s.id "
            "WHERE a.agent_type = ? "
            "ORDER BY s.name, s.id",
            (agent_type,),
        ).fetchall()
    return [_row_to_summary(r) for r in rows]


def get_mcp_server(server_id: str) -> Optional[Dict[str, Any]]:
    """Return the full MCP server row + agent_types, or ``None`` if missing."""
    from ... import db
    conn = db.get_conn()
    row = conn.execute(
        "SELECT id, name, server_config, description, homepage, docs, tags "
        "FROM mcp_servers WHERE id = ?",
        (server_id,),
    ).fetchone()
    if row is None:
        return None
    result = dict(row)
    try:
        result["server_config_parsed"] = json.loads(result.get("server_config") or "{}")
    except json.JSONDecodeError:
        result["server_config_parsed"] = {}
    try:
        result["tags_parsed"] = json.loads(result.get("tags") or "[]")
    except json.JSONDecodeError:
        result["tags_parsed"] = []
    # Resolve agent_types from join table
    agent_rows = conn.execute(
        "SELECT agent_type FROM mcp_server_agents WHERE mcp_server_id = ? ORDER BY agent_type",
        (server_id,),
    ).fetchall()
    result["agent_types"] = [r["agent_type"] for r in agent_rows]
    return result


def _row_to_summary(row: Any) -> Dict[str, Any]:
    """Build the compact dict returned by :func:`list_mcp_servers`."""
    out: Dict[str, Any] = {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"] or "",
        "homepage": row["homepage"] or "",
        "docs": row["docs"] or "",
    }
    try:
        out["tags"] = json.loads(row["tags"] or "[]")
    except json.JSONDecodeError:
        out["tags"] = []
    return out


# --- upsert / delete ------------------------------------------------------

def upsert_mcp_server(server_id: str, data_json: str) -> Dict[str, Any]:
    """Insert or update an MCP server, bypassing ``$EDITOR``.

    *data_json* is a JSON string with shape::

        {
          "name": "Filesystem",
          "server_config": { "type": "stdio", "command": "npx", ... },
          "description": "...",
          "homepage": "...",
          "docs": "...",
          "tags": ["filesystem"]
        }

    ``server_config`` is required and must be an object with a string
    ``type`` (``"stdio"`` / ``"sse"`` / ``"http"``). Stdio entries
    require a non-empty ``command``. ``tags`` defaults to ``[]``.

    On insert, the ``mcp_server_agents`` table is left untouched
    (use ``agents`` subcommand to manage associations).
    """
    try:
        data = json.loads(data_json)
    except json.JSONDecodeError as exc:
        raise ProfileError(
            f"mcp-server data is not valid JSON: {exc}"
        ) from exc
    if not isinstance(data, dict):
        raise ProfileError(
            f"mcp-server data must be a JSON object, got {type(data).__name__}"
        )

    name = data.get("name") or server_id
    if not isinstance(name, str) or not name.strip():
        raise ProfileError("mcp-server 'name' must be a non-empty string")

    server_config = data.get("server_config")
    if not isinstance(server_config, dict):
        raise ProfileError("mcp-server 'server_config' is required and must be a JSON object")
    _validate_server_config(server_config)

    description = data.get("description") or ""
    homepage = data.get("homepage") or ""
    docs = data.get("docs") or ""
    tags = data.get("tags") or []
    if not isinstance(tags, list):
        raise ProfileError("mcp-server 'tags' must be a list of strings")
    tags = [str(t) for t in tags]

    server_config_str = json.dumps(server_config, ensure_ascii=False)
    tags_str = json.dumps(tags, ensure_ascii=False)

    from ... import db
    conn = db.get_conn()
    conn.execute(
        "INSERT OR REPLACE INTO mcp_servers "
        "(id, name, server_config, description, homepage, docs, tags) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (server_id, name, server_config_str, description, homepage, docs, tags_str),
    )
    conn.commit()

    result = get_mcp_server(server_id)
    assert result is not None  # just wrote it
    return result


def _validate_server_config(server_config: Dict[str, Any]) -> None:
    """Validate the unified MCP server_config shape."""
    typ = server_config.get("type")
    if typ not in ("stdio", "sse", "http"):
        raise ProfileError(
            f"mcp-server_config.type must be 'stdio', 'sse', or 'http' (got {typ!r})"
        )
    if typ == "stdio":
        cmd = server_config.get("command")
        if not isinstance(cmd, str) or not cmd:
            raise ProfileError(
                "mcp-server_config of type 'stdio' requires a non-empty 'command'"
            )
    else:  # sse / http
        url = server_config.get("url")
        if not isinstance(url, str) or not url:
            raise ProfileError(
                f"mcp-server_config of type {typ!r} requires a non-empty 'url'"
            )


def delete_mcp_server(server_id: str) -> bool:
    """Delete an MCP server (CASCADE removes agent associations)."""
    from ... import db
    conn = db.get_conn()
    cur = conn.execute(
        "DELETE FROM mcp_servers WHERE id = ?",
        (server_id,),
    )
    conn.commit()
    return cur.rowcount > 0


# --- agent association ----------------------------------------------------

def set_mcp_agent(server_id: str, agent_type: str, enabled: bool) -> None:
    """Enable or disable an MCP server for *agent_type*.

    The server must exist (FK from mcp_server_agents). Enabling when
    already enabled / disabling when already absent is a no-op.
    """
    from ... import db
    from ... import library
    if agent_type not in library.get_agent_types():
        raise ProfileError(
            f"unknown agent_type {agent_type!r}. "
            f"Valid: {', '.join(library.get_agent_types())}"
        )
    conn = db.get_conn()
    exists = conn.execute(
        "SELECT 1 FROM mcp_servers WHERE id = ?",
        (server_id,),
    ).fetchone()
    if exists is None:
        raise ProfileError(f"mcp-server {server_id!r} not found")
    if enabled:
        conn.execute(
            "INSERT OR IGNORE INTO mcp_server_agents (mcp_server_id, agent_type) "
            "VALUES (?, ?)",
            (server_id, agent_type),
        )
    else:
        conn.execute(
            "DELETE FROM mcp_server_agents WHERE mcp_server_id = ? AND agent_type = ?",
            (server_id, agent_type),
        )
    conn.commit()


def get_mcp_agents(server_id: str) -> List[str]:
    """Return the list of agent_types enabled for *server_id* (sorted)."""
    from ... import db
    conn = db.get_conn()
    rows = conn.execute(
        "SELECT agent_type FROM mcp_server_agents WHERE mcp_server_id = ? "
        "ORDER BY agent_type",
        (server_id,),
    ).fetchall()
    return [r["agent_type"] for r in rows]

