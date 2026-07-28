"""Prompt apply — write Claude.md content from ACS to profile files."""
from __future__ import annotations

from ... import config
from ... import ccswitch_adapter as _acs
from ...core.io import atomic_write_text
from ...profile import ProfileError, load_meta


def apply_claude_md(profile_name: str, md_id: str) -> None:
    """Write a prompt's content from ACS to a profile's CLAUDE.md (overwrite)."""
    meta = load_meta(profile_name)
    agent_type = meta["agent_type"]
    if agent_type != "claude":
        raise ProfileError(
            f"claude-md apply is not yet supported for agent_type {agent_type!r}"
        )
    prompts = _acs.list_prompts(agent_type)
    prompt = next((p for p in prompts if p["id"] == md_id), None)
    if prompt is None:
        raise ProfileError(
            f"claude-md {md_id!r} not found in ACS for {agent_type!r}"
        )
    target = config.profile_agent_dir(profile_name, agent_type) / "CLAUDE.md"
    atomic_write_text(target, prompt.get("content") or "")

    from ...core import db
    conn = db.get_conn()
    conn.execute(
        "UPDATE profiles SET claude_md_ref = ? WHERE name = ?",
        (md_id, profile_name),
    )
    conn.commit()
