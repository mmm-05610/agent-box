"""ACS data adapter — read-only access to the ACS SQLite database.

This is the single integration point between agent-box and ACS
(agent-config-store, the CC Switch fork). Every read of provider/MCP/
skill/prompt data from ACS goes through this module.

If the ACS database doesn't exist (not yet set up, or test environment),
all functions return empty/None gracefully so callers can fall back to
the agent-box database.

If the data source changes in the future (e.g. ACS becomes an HTTP API),
only this file needs to change.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, List

from .. import config
from ..core.library import get_agent_config, get_agent_types


_ACS_EXTRA_AGENT_TYPES = ("gemini", "grokbuild")


def _acs_column(agent_type: str) -> str:
    agent_config = get_agent_config(agent_type)
    if agent_config is None:
        raise ValueError(f"Unknown agent type: {agent_type!r}")
    return agent_config["acs_column"]


def _cs_db_path() -> Path:
    return config.agent_box_home() / "config" / "cc-switch.db"


def _conn():
    """Return a connection, or None if the ACS database doesn't exist."""
    db_path = _cs_db_path()
    if not db_path.is_file():
        return None
    c = sqlite3.connect(str(db_path))
    c.row_factory = sqlite3.Row
    return c


# ── Providers ──────────────────────────────────────────────────────────────

def list_providers(agent_type: str) -> List[Dict[str, Any]]:
    conn = _conn()
    if conn is None:
        return []
    rows = conn.execute(
        "SELECT id, name, website_url, category, sort_index, notes, icon, "
        "icon_color, is_current, in_failover_queue, meta, settings_config "
        "FROM providers WHERE app_type = ? ORDER BY sort_index, name",
        (agent_type,),
    ).fetchall()
    out: List[Dict[str, Any]] = []
    for r in rows:
        settings = {}
        try:
            settings = json.loads(r["settings_config"] or "{}")
        except json.JSONDecodeError:
            pass
        out.append({
            "id": r["id"], "name": r["name"], "category": r["category"],
            "website_url": r["website_url"], "is_current": bool(r["is_current"]),
            "in_failover_queue": bool(r["in_failover_queue"]),
            "settings": settings, "meta": json.loads(r["meta"] or "{}"),
        })
    conn.close()
    return out


def get_provider(agent_type: str, provider_id: str) -> Dict[str, Any] | None:
    conn = _conn()
    if conn is None:
        return None
    row = conn.execute(
        "SELECT * FROM providers WHERE id = ? AND app_type = ?",
        (provider_id, agent_type),
    ).fetchone()
    if row is None:
        conn.close()
        return None
    result = dict(row)
    try:
        result["settings"] = json.loads(result.get("settings_config") or "{}")
    except json.JSONDecodeError:
        result["settings"] = {}
    try:
        result["meta_parsed"] = json.loads(result.get("meta") or "{}")
    except json.JSONDecodeError:
        result["meta_parsed"] = {}
    conn.close()
    return result


# ── Skills ─────────────────────────────────────────────────────────────────

def list_skills(agent_type: str) -> List[Dict[str, Any]]:
    col = _acs_column(agent_type)
    conn = _conn()
    if conn is None:
        return []
    rows = conn.execute(
        f"SELECT id, name, description, directory, repo_owner, repo_name, "
        f"repo_branch, readme_url FROM skills WHERE {col} = 1 ORDER BY name, id"
    ).fetchall()
    out: List[Dict[str, Any]] = []
    for r in rows:
        src_dir = r["directory"] or ""
        candidates = [
            Path(src_dir) if src_dir.startswith("/") else None,
            config.agent_box_home() / "config" / "skills" / (src_dir or r["id"]),
            Path.home() / ".claude" / "skills" / (src_dir or r["id"]),
            Path.home() / ".agents" / "skills" / (src_dir or r["id"]),
        ]
        out.append({
            "id": r["id"], "name": r["name"], "description": r["description"] or "",
            "directory": src_dir, "repo_owner": r["repo_owner"] or "",
            "repo_name": r["repo_name"] or "", "repo_branch": r["repo_branch"] or "main",
            "readme_url": r["readme_url"] or "",
            "source_available": any(c and c.is_dir() for c in candidates),
        })
    conn.close()
    return out


# ── MCP Servers ───────────────────────────────────────────────────────────

def list_mcp_servers(agent_type: str) -> List[Dict[str, Any]]:
    col = _acs_column(agent_type)
    conn = _conn()
    if conn is None:
        return []
    rows = conn.execute(
        f"SELECT id, name, server_config, description, homepage, docs, tags "
        f"FROM mcp_servers WHERE {col} = 1 ORDER BY name, id"
    ).fetchall()
    out: List[Dict[str, Any]] = []
    for r in rows:
        cfg = {}
        try:
            cfg = json.loads(r["server_config"] or "{}")
        except json.JSONDecodeError:
            pass
        tags = []
        try:
            tags = json.loads(r["tags"] or "[]")
        except json.JSONDecodeError:
            pass
        out.append({
            "id": r["id"], "name": r["name"],
            "description": r["description"] or "",
            "homepage": r["homepage"] or "", "docs": r["docs"] or "",
            "tags": tags, "server_config": cfg,
        })
    conn.close()
    return out


def get_mcp_server(server_id: str) -> Dict[str, Any] | None:
    """Read a single MCP server from ACS, including enabled agent types."""
    conn = _conn()
    if conn is None:
        return None
    registered_types = get_agent_types()
    agent_columns = {
        agent_type: _acs_column(agent_type)
        for agent_type in registered_types
    }
    agent_columns.update({
        agent_type: f"enabled_{agent_type}"
        for agent_type in _ACS_EXTRA_AGENT_TYPES
    })
    column_names = ", ".join(agent_columns.values())
    row = conn.execute(
        "SELECT id, name, server_config, description, homepage, docs, tags, "
        f"{column_names} FROM mcp_servers WHERE id = ?", (server_id,)
    ).fetchone()
    if row is None:
        conn.close()
        return None
    cfg = {}
    try:
        cfg = json.loads(row["server_config"] or "{}")
    except json.JSONDecodeError:
        pass
    tags = []
    try:
        tags = json.loads(row["tags"] or "[]")
    except json.JSONDecodeError:
        pass
    enabled_agents = [
        agent_type
        for agent_type, column_name in agent_columns.items()
        if row[column_name]
    ]
    conn.close()
    return {
        "id": row["id"], "name": row["name"],
        "description": row["description"] or "",
        "homepage": row["homepage"] or "", "docs": row["docs"] or "",
        "tags": tags, "server_config": cfg,
        "server_config_parsed": cfg,
        "agent_types": enabled_agents,
    }


# ── Prompts ────────────────────────────────────────────────────────────────

def list_prompts(agent_type: str) -> List[Dict[str, Any]]:
    conn = _conn()
    if conn is None:
        return []
    rows = conn.execute(
        "SELECT id, name, content, description FROM prompts "
        "WHERE app_type = ? AND enabled = 1 ORDER BY name, id",
        (agent_type,),
    ).fetchall()
    out: List[Dict[str, Any]] = []
    for r in rows:
        out.append({
            "id": r["id"], "name": r["name"],
            "content": r["content"] or "", "description": r["description"] or "",
        })
    conn.close()
    return out
