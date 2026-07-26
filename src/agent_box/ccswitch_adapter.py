"""ACS / CC Switch data adapter — read-only SQLite access.

Reads provider data from the ACS database at ``~/.agent-box/config/cc-switch.db``.
Returns dicts compatible with the existing agent-box API shape so the frontend
needs zero changes.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

_CS_DB = Path.home() / ".agent-box" / "config" / "cc-switch.db"


def _conn():
    c = sqlite3.connect(str(_CS_DB))
    c.row_factory = sqlite3.Row
    return c


def list_providers(agent_type: str) -> List[Dict[str, Any]]:
    """Return all providers for *agent_type*, compatible with the old
    ``providers.list_providers`` return shape."""
    conn = _conn()
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
        out.append(
            {
                "id": r["id"],
                "name": r["name"],
                "category": r["category"],
                "website_url": r["website_url"],
                "is_current": bool(r["is_current"]),
                "in_failover_queue": bool(r["in_failover_queue"]),
                "settings": settings,
                "meta": json.loads(r["meta"] or "{}"),
            }
        )
    conn.close()
    return out


def get_provider(agent_type: str, provider_id: str) -> Optional[Dict[str, Any]]:
    """Return a single provider, compatible with ``providers.get_provider``."""
    conn = _conn()
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


def list_skills(agent_type: str) -> List[Dict[str, Any]]:
    """Return skills enabled for *agent_type* from ACS database."""
    col = f"enabled_{agent_type}"
    conn = _conn()
    rows = conn.execute(
        f"SELECT id, name, description, directory, repo_owner, repo_name, "
        f"repo_branch, readme_url FROM skills WHERE {col} = 1 ORDER BY name, id"
    ).fetchall()
    out: List[Dict[str, Any]] = []
    for r in rows:
        src_dir = r["directory"] or ""
        # Check source availability
        src_candidates = [
            Path(src_dir) if src_dir.startswith("/") else None,
            Path.home() / ".agent-box" / "config" / "skills" / (src_dir or r["id"]),
            Path.home() / ".claude" / "skills" / (src_dir or r["id"]),
            Path.home() / ".agents" / "skills" / (src_dir or r["id"]),
        ]
        source_available = any(c and c.is_dir() for c in src_candidates)
        out.append({
            "id": r["id"],
            "name": r["name"],
            "description": r["description"] or "",
            "directory": src_dir,
            "repo_owner": r["repo_owner"] or "",
            "repo_name": r["repo_name"] or "",
            "repo_branch": r["repo_branch"] or "main",
            "readme_url": r["readme_url"] or "",
            "source_available": source_available,
        })
    conn.close()
    return out
