"""Claude.md template CRUD + apply — operates on the ``prompts`` table.

The table is named ``prompts`` (cc-switch convention); the CLI surface
calls them ``claude-md`` (matching the file ``CLAUDE.md`` they're
written to). Apply writes the prompt's ``content`` to
``profiles/<name>/dot-claude/CLAUDE.md`` for a Claude profile.
"""
from __future__ import annotations

import os
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import config
from ._io import atomic_write_text
from .profile import ProfileError, load_meta


# --- list / get -----------------------------------------------------------

def list_claude_mds(agent_type: str) -> List[Dict[str, Any]]:
    """Return one row per ClaudeMD for *agent_type* (id, name, description)."""
    from . import db
    conn = db.get_conn()
    rows = conn.execute(
        "SELECT id, name, description, enabled, created_at, updated_at "
        "FROM prompts WHERE app_type = ? ORDER BY name, id",
        (agent_type,),
    ).fetchall()
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "description": r["description"] or "",
            "enabled": bool(r["enabled"]),
        }
        for r in rows
    ]


def get_claude_md(agent_type: str, md_id: str) -> Optional[Dict[str, Any]]:
    """Return the full row, or ``None`` if missing."""
    from . import db
    conn = db.get_conn()
    row = conn.execute(
        "SELECT * FROM prompts WHERE id = ? AND app_type = ?",
        (md_id, agent_type),
    ).fetchone()
    return {k: row[k] for k in row.keys()} if row is not None else None


# --- add / edit / delete --------------------------------------------------

def _open_text_in_editor(initial: str) -> str:
    """Write *initial* to a tmp file, open $EDITOR, read back the text."""
    from .edit import open_editor
    fd, tmp_path = tempfile.mkstemp(
        prefix="agent-box-claude-md-", suffix=".md"
    )
    os.close(fd)
    tmp = Path(tmp_path)
    try:
        atomic_write_text(tmp, initial)
        open_editor(tmp)
        return tmp.read_text(encoding="utf-8")
    finally:
        try:
            tmp.unlink()
        except OSError:
            pass


def _template_claude_md(md_id: str) -> Dict[str, Any]:
    return {
        "id": md_id,
        "name": md_id,
        "description": "",
        "content": (
            f"# {md_id}\n\n"
            f"<!-- Edit this Claude.md template. It's applied to a profile with: -->\n"
            f"<!--   agent-box claude-md apply <profile> {md_id} -->\n\n"
        ),
    }


def _open_claude_md_in_editor(initial: Dict[str, Any]) -> Dict[str, Any]:
    """Open an editor with a full ClaudeMD doc (frontmatter + body).

    The on-disk file is just the body content. ``id``/``name``/``description``
    are passed in via the initial dict and preserved on the returned
    object (the user can change the body only).
    """
    body = _open_text_in_editor(initial.get("content") or "")
    return {
        "id": initial.get("id") or "",
        "name": initial.get("name") or initial.get("id") or "",
        "description": initial.get("description") or "",
        "content": body,
    }


def add_claude_md(agent_type: str, md_id: str) -> Dict[str, Any]:
    """Add a new ClaudeMD row, opened in $EDITOR for body content."""
    from . import db
    conn = db.get_conn()
    existing = conn.execute(
        "SELECT 1 FROM prompts WHERE id = ? AND app_type = ?",
        (md_id, agent_type),
    ).fetchone()
    if existing is not None:
        raise ProfileError(
            f"claude-md {md_id!r} for agent_type {agent_type!r} already exists. "
            f"Use: agent-box claude-md edit {agent_type} {md_id}"
        )
    data = _open_claude_md_in_editor(_template_claude_md(md_id))
    now_ms = int(time.time() * 1000)
    conn.execute(
        "INSERT INTO prompts "
        "(id, app_type, name, content, description, enabled, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
        (data["id"], agent_type, data["name"], data["content"],
         data["description"], now_ms, now_ms),
    )
    conn.commit()
    result = get_claude_md(agent_type, md_id)
    assert result is not None
    return result


def upsert_claude_md(agent_type: str, md_id: str, content: str, *,
                     name: Optional[str] = None,
                     description: Optional[str] = None) -> Dict[str, Any]:
    """Insert or update a ClaudeMD row, bypassing ``$EDITOR``.

    *content* is the markdown body. If *md_id* already exists for
    *agent_type*, UPDATE ``content`` (and *name* / *description* if
    provided). Otherwise INSERT a new row with the given *name* (or
    *md_id* as a fallback) and the *description* (defaulting to
    empty).
    """
    from . import db
    now_ms = int(time.time() * 1000)
    conn = db.get_conn()
    existing = conn.execute(
        "SELECT 1 FROM prompts WHERE id = ? AND app_type = ?",
        (md_id, agent_type),
    ).fetchone()
    if existing is None:
        row_name = name if name else md_id
        row_desc = description if description is not None else ""
        conn.execute(
            "INSERT INTO prompts "
            "(id, app_type, name, content, description, enabled, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
            (md_id, agent_type, row_name, content, row_desc, now_ms, now_ms),
        )
    else:
        # Build dynamic UPDATE: name / description are optional, but
        # content and updated_at always change.
        set_parts = ["content = ?", "updated_at = ?"]
        params: List[Any] = [content, now_ms]
        if name is not None:
            set_parts.append("name = ?")
            params.append(name)
        if description is not None:
            set_parts.append("description = ?")
            params.append(description)
        params.extend([md_id, agent_type])
        conn.execute(
            f"UPDATE prompts SET {', '.join(set_parts)} "
            "WHERE id = ? AND app_type = ?",
            params,
        )
    conn.commit()
    result = get_claude_md(agent_type, md_id)
    assert result is not None
    return result


def edit_claude_md(agent_type: str, md_id: str) -> Dict[str, Any]:
    """Edit an existing ClaudeMD's body in $EDITOR."""
    current = get_claude_md(agent_type, md_id)
    if current is None:
        raise ProfileError(
            f"claude-md {md_id!r} for agent_type {agent_type!r} not found"
        )
    data = _open_claude_md_in_editor({
        "id": current["id"],
        "name": current["name"],
        "description": current["description"] or "",
        "content": current["content"] or "",
    })
    now_ms = int(time.time() * 1000)
    from . import db
    conn = db.get_conn()
    conn.execute(
        "UPDATE prompts SET name = ?, content = ?, description = ?, "
        "updated_at = ? WHERE id = ? AND app_type = ?",
        (data["name"], data["content"], data["description"],
         now_ms, md_id, agent_type),
    )
    conn.commit()
    result = get_claude_md(agent_type, md_id)
    assert result is not None
    return result


def delete_claude_md(agent_type: str, md_id: str) -> None:
    """Delete a ClaudeMD row."""
    from . import db
    conn = db.get_conn()
    cur = conn.execute(
        "DELETE FROM prompts WHERE id = ? AND app_type = ?",
        (md_id, agent_type),
    )
    conn.commit()
    if cur.rowcount == 0:
        raise ProfileError(
            f"claude-md {md_id!r} for agent_type {agent_type!r} not found"
        )


# --- apply ----------------------------------------------------------------

def apply_claude_md(profile_name: str, md_id: str) -> None:
    """Write a ClaudeMD's content to a profile's CLAUDE.md (overwrite)."""
    meta = load_meta(profile_name)
    agent_type = meta["agent_type"]
    if agent_type != "claude":
        raise ProfileError(
            f"claude-md apply is not yet supported for agent_type {agent_type!r} "
            f"(v1 supports: claude)"
        )
    row = get_claude_md(agent_type, md_id)
    if row is None:
        raise ProfileError(
            f"claude-md {md_id!r} for agent_type {agent_type!r} not found"
        )
    target = config.profile_agent_dir(profile_name, agent_type) / "CLAUDE.md"
    atomic_write_text(target, row["content"] or "")

    from . import db
    conn = db.get_conn()
    conn.execute(
        "UPDATE profiles SET claude_md_ref = ? WHERE name = ?",
        (md_id, profile_name),
    )
    conn.commit()


__all__ = [
    "add_claude_md",
    "apply_claude_md",
    "delete_claude_md",
    "edit_claude_md",
    "get_claude_md",
    "list_claude_mds",
    "upsert_claude_md",
]
