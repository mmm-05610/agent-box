"""Skill CRUD + apply — operates on the ``skills`` and ``skill_agents``
tables.

Unlike MCP, a skill's payload is a directory on disk (the ``directory``
column). Apply copies that directory into the profile's per-agent
skills location, which is bind-mounted into the agent's home by bwrap.

  * Claude   → ``profiles/<name>/dot-claude/skills/<skill_id>/``
  * Codex    → ``profiles/<name>/dot-codex/skills/<skill_id>/``
  * Hermes   → ``profiles/<name>/dot-hermes/skills/<skill_id>/``
  * OpenCode → ``profiles/<name>/dot-opencode/skills/<skill_id>/``

Agent association lives in the join table ``skill_agents`` (replaces
cc-switch's per-agent ``enabled_*`` columns).
"""
from __future__ import annotations

import hashlib
import os
import shutil
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import config
from .profile import ProfileError, load_meta


# Per-agent skills directory. For Claude, skills go under dot-claude/
# (bind-mounted to ~/.claude/skills/), not dot-agents/ (which is
# separately bind-mounted for isolation of ~/.agents/).
def _skills_dir_for(agent_type: str, profile_name: str) -> Path:
    if agent_type == "claude":
        return config.profile_agent_dir(profile_name, "claude") / "skills"
    return config.profile_agent_dir(profile_name, agent_type) / "skills"


# --- list / get -----------------------------------------------------------

def list_skills(agent_type: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return one entry per skill, optionally filtered by agent_type."""
    from . import db
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


def get_skill(skill_id: str) -> Optional[Dict[str, Any]]:
    """Return the full skill row + agent_types, or ``None`` if missing."""
    from . import db
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
    """Compute a SHA256 hash of the directory's file contents.

    Walks the tree in sorted order so the hash is stable across runs.
    Returns an empty string if the directory doesn't exist.
    """
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
    """Insert or update a skill row.

    All fields default to empty strings; *skill_id* is the only required
    argument. *name* falls back to *skill_id* if empty. *directory*
    must be an absolute path (or empty) — apply uses it to copy the
    skill's payload into a profile.

    On insert, the ``skill_agents`` table is left untouched (use the
    ``agents`` subcommand to manage associations).
    """
    if not skill_id:
        raise ProfileError("skill id must not be empty")
    if directory and not os.path.isabs(directory):
        raise ProfileError(
            f"skill directory must be an absolute path (got {directory!r})"
        )
    if not directory:
        # Allow empty for now (user can populate later); reject at apply time.
        pass
    elif not Path(directory).exists():
        raise ProfileError(
            f"skill directory does not exist: {directory!r}"
        )

    row_name = name or skill_id
    now_ms = int(time.time() * 1000)
    content_hash = _compute_content_hash(directory) if directory else ""

    from . import db
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
    assert result is not None  # just wrote it
    return result


def delete_skill(skill_id: str) -> bool:
    """Delete a skill (CASCADE removes agent associations)."""
    from . import db
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
    from . import db
    from . import library
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
    from . import db
    conn = db.get_conn()
    rows = conn.execute(
        "SELECT agent_type FROM skill_agents WHERE skill_id = ? "
        "ORDER BY agent_type",
        (skill_id,),
    ).fetchall()
    return [r["agent_type"] for r in rows]


# --- apply ----------------------------------------------------------------

def apply_skill(profile_name: str, skill_id: str) -> None:
    """Copy a skill's directory into the profile's per-agent skills location.

    Steps:
      1. load_meta → resolve the profile's agent_type
      2. fetch the skill row + its enabled agent_types
      3. for the profile's agent_type: copy directory to
         ``<profile>/<agent-skills-dir>/<skill_id>/`` (overwrite if
         present, symlinks are followed).
    """
    meta = load_meta(profile_name)
    profile_agent_type = meta["agent_type"]

    skill = get_skill(skill_id)
    if skill is None:
        raise ProfileError(f"skill {skill_id!r} not found")

    enabled_agents = set(skill.get("agent_types") or [])
    if profile_agent_type not in enabled_agents:
        raise ProfileError(
            f"skill {skill_id!r} is not enabled for agent_type "
            f"{profile_agent_type!r}. Use: agent-box skill agents "
            f"{skill_id} --enable {profile_agent_type}"
        )

    src = skill.get("directory") or ""
    if not src:
        raise ProfileError(
            f"skill {skill_id!r}: directory is empty (set it via: "
            f"agent-box skill upsert {skill_id} --directory <path>)"
        )
    src_path = Path(src)
    if not src_path.is_dir():
        raise ProfileError(
            f"skill {skill_id!r}: directory does not exist: {src!r}"
        )

    skills_dir = _skills_dir_for(profile_agent_type, profile_name)
    target = skills_dir / skill_id
    # Remove existing copy so deletions in the source propagate.
    if target.exists():
        if target.is_symlink() or target.is_file():
            target.unlink()
        else:
            shutil.rmtree(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src_path, target, symlinks=True)


__all__ = [
    "apply_skill",
    "delete_skill",
    "get_skill",
    "get_skill_agents",
    "list_skills",
    "set_skill_agent",
    "upsert_skill",
]
