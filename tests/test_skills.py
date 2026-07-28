"""Skill apply tests — agent-box reads skills from ACS only."""
from __future__ import annotations

from pathlib import Path

import pytest

from agent_box import config
from agent_box.resources import profile, skills
from agent_box.resources.profile import ProfileError


# --- helpers --------------------------------------------------------------

@pytest.fixture
def skill_src(tmp_path):
    """A populated skill source directory used for apply tests."""
    src = tmp_path / "src" / "frontend-design"
    src.mkdir(parents=True)
    (src / "SKILL.md").write_text("# Frontend Design\n\nA skill.\n")
    (src / "examples").mkdir()
    (src / "examples" / "demo.md").write_text("Demo.\n")
    return src


# --- apply ----------------------------------------------------------------

def test_apply_claude(tmp_agent_box_home, skill_src, acs_stub):
    profile.create("mycc", "claude")
    acs_stub.add_skill("frontend-design", directory=str(skill_src))

    skills.apply_skill("mycc", "frontend-design")

    target = config.profile_agent_dir("mycc", "claude") / "skills" / "frontend-design"
    assert target.is_dir()
    assert (target / "SKILL.md").is_file()
    assert (target / "SKILL.md").read_text(encoding="utf-8") == \
        "# Frontend Design\n\nA skill.\n"
    assert (target / "examples" / "demo.md").is_file()


def test_apply_codex(tmp_agent_box_home, skill_src, acs_stub):
    profile.create("mycodex", "codex")
    acs_stub.add_skill("fs", directory=str(skill_src))

    skills.apply_skill("mycodex", "fs")

    target = config.profile_agent_dir("mycodex", "codex") / "skills" / "fs"
    assert target.is_dir()
    assert (target / "SKILL.md").is_file()


def test_apply_hermes(tmp_agent_box_home, skill_src, acs_stub):
    profile.create("myhermes", "hermes")
    acs_stub.add_skill("fs", directory=str(skill_src))
    skills.apply_skill("myhermes", "fs")
    target = config.profile_agent_dir("myhermes", "hermes") / "skills" / "fs"
    assert target.is_dir()
    assert (target / "SKILL.md").is_file()


def test_apply_opencode(tmp_agent_box_home, skill_src, acs_stub):
    profile.create("myoc", "opencode")
    acs_stub.add_skill("fs", directory=str(skill_src))
    skills.apply_skill("myoc", "fs")
    target = config.profile_agent_dir("myoc", "opencode") / "skills" / "fs"
    assert target.is_dir()
    assert (target / "SKILL.md").is_file()


def test_apply_overwrites_existing(tmp_agent_box_home, skill_src, acs_stub):
    """Re-apply replaces the destination, propagating deletions."""
    profile.create("mycc", "claude")
    acs_stub.add_skill("fs", directory=str(skill_src))
    skills.apply_skill("mycc", "fs")

    # Mutate the source to remove a file, then re-apply.
    (skill_src / "SKILL.md").unlink()
    (skill_src / "new.md").write_text("new file")
    skills.apply_skill("mycc", "fs")

    target = config.profile_agent_dir("mycc", "claude") / "skills" / "fs"
    assert not (target / "SKILL.md").exists()
    assert (target / "new.md").is_file()


def test_apply_unknown_skill(tmp_agent_box_home):
    """apply on a skill id that isn't in ACS raises."""
    profile.create("mycc", "claude")
    with pytest.raises(ProfileError, match="not found in ACS"):
        skills.apply_skill("mycc", "nope")


def test_apply_not_enabled_for_agent(tmp_agent_box_home, skill_src):
    """apply fails if the skill isn't in ACS for the profile's agent_type."""
    profile.create("mycc", "claude")
    # No acs_stub use — the empty store mirrors the original
    # "not enabled / not in library" failure mode.
    with pytest.raises(ProfileError, match="not found in ACS"):
        skills.apply_skill("mycc", "fs")


def test_apply_empty_directory(tmp_agent_box_home, acs_stub):
    """apply fails if the skill has no directory set."""
    profile.create("mycc", "claude")
    acs_stub.add_skill("placeholder")
    with pytest.raises(ProfileError, match="source not found"):
        skills.apply_skill("mycc", "placeholder")
