"""Prompt apply — write Claude.md content to profile CLAUDE.md files."""
from __future__ import annotations

from ... import config
from ..._io import atomic_write_text
from ...profile import ProfileError, load_meta
from .crud import get_claude_md


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

    from ... import db
    conn = db.get_conn()
    conn.execute(
        "UPDATE profiles SET claude_md_ref = ? WHERE name = ?",
        (md_id, profile_name),
    )
    conn.commit()
