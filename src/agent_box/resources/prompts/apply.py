"""Prompt apply — write prompt content from ACS to profile files."""
from __future__ import annotations

from ... import config
from ...adapters import acs as _acs
from ...core.io import write_text
from ...core.library import get_agent_config
from .._shared import fetch_from_acs
from ..profile import ProfileError, _repo


def apply_prompt(profile_name: str, prompt_id: str) -> None:
    """Write a prompt from ACS to the profile's prompt file."""
    meta, prompt = fetch_from_acs(
        profile_name, prompt_id, _acs.get_prompt, label="prompt"
    )
    agent_config = get_agent_config(meta["agent_type"])
    if agent_config is None:
        raise ProfileError(f"unknown agent_type {meta['agent_type']!r}")
    if not (agent_config.get("resources") or {}).get("prompt"):
        raise ProfileError(
            f"prompt apply is not supported for {meta['agent_type']!r}"
        )
    target = (
        config.profile_agent_dir(profile_name, meta["agent_type"])
        / agent_config["resources"]["prompt"]["file"]
    )
    write_text(target, prompt.get("content") or "")
    _repo.set_prompt_ref(profile_name, prompt_id)
