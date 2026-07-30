"""Skill apply — copy skill directories into profile skills locations."""
from __future__ import annotations

import shutil

from ... import config
from ...adapters import acs as _acs
from .._shared import fetch_from_acs
from ..profile import ProfileError, load_meta


def apply_skill(profile_name: str, skill_id: str) -> None:
    """Copy a skill's directory from ACS into the profile's skills location."""
    meta, skill = fetch_from_acs(
        profile_name, skill_id, _acs.get_skill, label="skill"
    )
    source_path = skill.get("source_path")
    if not source_path:
        raise ProfileError(f"skill {skill_id!r}: source not found on disk")

    target = config.profile_skills_dir(profile_name, meta["agent_type"]) / skill_id
    if target.exists():
        if target.is_symlink() or target.is_file():
            target.unlink()
        else:
            shutil.rmtree(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source_path, target, symlinks=True)


def remove_skill_from_profile(profile_name: str, skill_id: str) -> bool:
    """Delete a skill directory from a profile's skills location."""
    meta = load_meta(profile_name)
    target = config.profile_skills_dir(profile_name, meta["agent_type"]) / skill_id
    if target.exists():
        if target.is_symlink() or target.is_file():
            target.unlink()
        else:
            shutil.rmtree(target)
        return True
    return False
