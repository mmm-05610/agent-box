"""Skill apply — copy skill directories into profile skills locations."""
from __future__ import annotations

import shutil
from pathlib import Path

from ... import config
from ..profile import ProfileError, load_meta


def apply_skill(profile_name: str, skill_id: str) -> None:
    """Copy a skill's directory from ACS into the profile's skills location."""
    meta = load_meta(profile_name)
    profile_agent_type = meta["agent_type"]

    # Read from ACS (single source of truth — no agent-box DB fallback)
    from ... import ccswitch_adapter as _acs
    skills = _acs.list_skills(profile_agent_type)
    skill = next((s for s in skills if s["id"] == skill_id), None)
    if skill is None:
        raise ProfileError(
            f"skill {skill_id!r} not found in ACS for {profile_agent_type!r}"
        )

    src_dir = skill.get("directory") or ""
    candidates = [
        Path(src_dir) if src_dir.startswith("/") else None,
        Path.home() / ".agent-box" / "config" / "skills" / (src_dir or skill_id),
        Path.home() / ".claude" / "skills" / (src_dir or skill_id),
        Path.home() / ".agents" / "skills" / (src_dir or skill_id),
    ]
    src_path = next((c for c in candidates if c and c.is_dir()), None)
    if src_path is None:
        tried = [str(c) for c in candidates if c]
        raise ProfileError(f"skill {skill_id!r}: source not found (tried: {tried})")

    skills_dir = config.profile_skills_dir(profile_name, profile_agent_type)
    target = skills_dir / skill_id
    if target.exists():
        if target.is_symlink() or target.is_file():
            target.unlink()
        else:
            shutil.rmtree(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src_path, target, symlinks=True)


def remove_skill_from_profile(profile_name: str, skill_id: str) -> bool:
    """Delete a skill directory from a profile's skills location."""
    meta = load_meta(profile_name)
    profile_agent_type = meta["agent_type"]
    skills_dir = config.profile_skills_dir(profile_name, profile_agent_type)
    target = skills_dir / skill_id
    if target.exists():
        if target.is_symlink() or target.is_file():
            target.unlink()
        else:
            shutil.rmtree(target)
        return True
    return False
