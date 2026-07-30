"""Prompt apply — write Claude.md content from ACS to profile files."""
from __future__ import annotations

from ... import config
from ...adapters import acs as _acs
from ...core.io import write_text
from ...core.library import get_agent_config
from ..profile import ProfileError, _repo, load_meta


def apply_claude_md(profile_name: str, md_id: str) -> None:
    """Write a prompt's content from ACS to a profile's prompt file (overwrite).

    Only agent types whose registry entry has ``supports_prompt_apply: True``
    support this operation — currently only Claude (via ``CLAUDE.md``).
    """
    meta = load_meta(profile_name)
    agent_type = meta["agent_type"]
    agent_config = get_agent_config(agent_type)
    if agent_config is None:
        raise ProfileError(f"unknown agent_type {agent_type!r}")
    if not agent_config.get("supports_prompt_apply"):
        raise ProfileError(
            f"claude-md apply is not yet supported for agent_type {agent_type!r}"
        )
    prompt = _acs.get_prompt(agent_type, md_id)
    if prompt is None:
        raise ProfileError(
            f"claude-md {md_id!r} not found in ACS for {agent_type!r}"
        )
    target = (
        config.profile_agent_dir(profile_name, agent_type)
        / agent_config["prompt_file"]
    )
    write_text(target, prompt.get("content") or "")

    _repo.set_prompt_ref(profile_name, md_id)
