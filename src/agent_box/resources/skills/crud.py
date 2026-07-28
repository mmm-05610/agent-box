"""Skill CRUD — database operations on the skills and skill_agents tables."""
from __future__ import annotations

import hashlib
import os
import time
from pathlib import Path
from typing import Any, Dict, List

from ... import config
from ...profile import ProfileError


# Per-agent skills directory.
def _skills_dir_for(agent_type: str, profile_name: str) -> Path:
    if agent_type == "claude":
        return config.profile_agent_dir(profile_name, "claude") / "skills"
    return config.profile_agent_dir(profile_name, agent_type) / "skills"


# --- list / get -----------------------------------------------------------

def list_skills(agent_type: str | None = None) -> List[Dict[str, Any]]:
    """Return one entry per skill, optionally filtered by agent_type."""
    from ... import db
    conn = db.get_conn()
    if agent_type is None:
        rows = conn.execute(
            "SELECT id, name, description, directory, repo_owner, repo_name, "
            "repo_branch, readme_url, installed_at, content_hash, updated_at "
            "FROM skills ORDER BY name, id"
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT s.id, s.name, s.description, s.directory, s.repo_owner, "
            "s.repo_name, s.repo_branch, s.readme_url, s.installed_at, "
            "s.content_hash, s.updated_at "
            "FROM skills s "
            "INNER JOIN skill_agents a ON a.skill_id = s.id "
            "WHERE a.agent_type = ? "
            "ORDER BY s.name, s.id",
            (agent_type,),
        ).fetchall()
    return [_row_to_summary(r) for r in rows]


def get_skill(skill_id: str) -> Dict[str, Any] | None:
    """Return the full skill row + agent_types, or ``None`` if missing."""
    from ... import db
    conn = db.get_conn()
    row = conn.execute(
        "SELECT id, name, description, directory, repo_owner, repo_name, "
        "repo_branch, readme_url, installed_at, content_hash, updated_at "
        "FROM skills WHERE id = ?",
        (skill_id,),
    ).fetchone()
    if row is None:
        return None
    result = dict(row)
    agent_rows = conn.execute(
        "SELECT agent_type FROM skill_agents WHERE skill_id = ? ORDER BY agent_type",
        (skill_id,),
    ).fetchall()
    result["agent_types"] = [r["agent_type"] for r in agent_rows]
    return result


def _row_to_summary(row: Any) -> Dict[str, Any]:
    """Build the compact dict returned by :func:`list_skills`."""
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"] or "",
        "directory": row["directory"] or "",
        "repo_owner": row["repo_owner"] or "",
        "repo_name": row["repo_name"] or "",
        "repo_branch": row["repo_branch"] or "main",
    }


# --- upsert / delete ------------------------------------------------------

def _compute_content_hash(directory: str) -> str:
    """Compute a SHA256 hash of the directory's file contents."""
    p = Path(directory)
    if not p.is_dir():
        return ""
    h = hashlib.sha256()
    for root, _dirs, files in os.walk(p):
        rel_root = Path(root).relative_to(p)
        for name in sorted(files):
            fpath = Path(root) / name
            rel = (rel_root / name).as_posix()
            try:
                data = fpath.read_bytes()
            except OSError:
                continue
            h.update(rel.encode("utf-8"))
            h.update(b"\0")
            h.update(data)
            h.update(b"\0")
    return h.hexdigest()


def upsert_skill(
    skill_id: str,
    name: str = "",
    description: str = "",
    directory: str = "",
    repo_owner: str = "",
    repo_name: str = "",
    repo_branch: str = "main",
    readme_url: str = "",
) -> Dict[str, Any]:
    """Insert or update a skill row."""
    if not skill_id:
        raise ProfileError("skill id must not be empty")
    if directory and not os.path.isabs(directory):
        raise ProfileError(
            f"skill directory must be an absolute path (got {directory!r})"
        )
    if not directory:
        pass
    elif not Path(directory).exists():
        raise ProfileError(
            f"skill directory does not exist: {directory!r}"
        )

    row_name = name or skill_id
    now_ms = int(time.time() * 1000)
    content_hash = _compute_content_hash(directory) if directory else ""

    from ... import db
    conn = db.get_conn()
    existing = conn.execute(
        "SELECT installed_at FROM skills WHERE id = ?",
        (skill_id,),
    ).fetchone()
    installed_at = existing["installed_at"] if existing else now_ms

    conn.execute(
        "INSERT OR REPLACE INTO skills "
        "(id, name, description, directory, repo_owner, repo_name, "
        "repo_branch, readme_url, installed_at, content_hash, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (skill_id, row_name, description, directory, repo_owner, repo_name,
         repo_branch, readme_url, installed_at, content_hash, now_ms),
    )
    conn.commit()

    result = get_skill(skill_id)
    assert result is not None
    return result


def delete_skill(skill_id: str) -> bool:
    """Delete a skill (CASCADE removes agent associations)."""
    from ... import db
    conn = db.get_conn()
    cur = conn.execute(
        "DELETE FROM skills WHERE id = ?",
        (skill_id,),
    )
    conn.commit()
    return cur.rowcount > 0


# --- agent association ----------------------------------------------------

def set_skill_agent(skill_id: str, agent_type: str, enabled: bool) -> None:
    """Enable or disable a skill for *agent_type*."""
    from ... import db
    from ... import library
    if agent_type not in library.get_agent_types():
        raise ProfileError(
            f"unknown agent_type {agent_type!r}. "
            f"Valid: {', '.join(library.get_agent_types())}"
        )
    conn = db.get_conn()
    exists = conn.execute(
        "SELECT 1 FROM skills WHERE id = ?",
        (skill_id,),
    ).fetchone()
    if exists is None:
        raise ProfileError(f"skill {skill_id!r} not found")
    if enabled:
        conn.execute(
            "INSERT OR IGNORE INTO skill_agents (skill_id, agent_type) "
            "VALUES (?, ?)",
            (skill_id, agent_type),
        )
    else:
        conn.execute(
            "DELETE FROM skill_agents WHERE skill_id = ? AND agent_type = ?",
            (skill_id, agent_type),
        )
    conn.commit()


def get_skill_agents(skill_id: str) -> List[str]:
    """Return the list of agent_types enabled for *skill_id* (sorted)."""
    from ... import db
    conn = db.get_conn()
    rows = conn.execute(
        "SELECT agent_type FROM skill_agents WHERE skill_id = ? "
        "ORDER BY agent_type",
        (skill_id,),
    ).fetchall()
    return [r["agent_type"] for r in rows]
