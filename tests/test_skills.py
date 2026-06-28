"""Skill CRUD + apply tests (CLI side)."""
from __future__ import annotations

from pathlib import Path

import pytest

from agent_box import config, profile, skills
from agent_box.profile import ProfileError


# --- helpers --------------------------------------------------------------

@pytest.fixture
def skill_src(tmp_path):
    """A populated skill source directory used for upsert/apply tests."""
    src = tmp_path / "src" / "frontend-design"
    src.mkdir(parents=True)
    (src / "SKILL.md").write_text("# Frontend Design\n\nA skill.\n")
    (src / "examples").mkdir()
    (src / "examples" / "demo.md").write_text("Demo.\n")
    return src


# --- upsert ---------------------------------------------------------------

def test_upsert_insert_new(tmp_agent_box_home, skill_src):
    result = skills.upsert_skill(
        "frontend-design",
        name="Frontend Design",
        description="UI review and design guidance",
        directory=str(skill_src),
        repo_owner="anthropics",
        repo_name="skills",
        repo_branch="main",
    )
    assert result["id"] == "frontend-design"
    assert result["name"] == "Frontend Design"
    assert result["description"] == "UI review and design guidance"
    assert result["directory"] == str(skill_src)
    assert result["repo_owner"] == "anthropics"
    assert result["repo_name"] == "skills"
    assert result["repo_branch"] == "main"
    assert result["content_hash"]  # auto-computed
    assert result["installed_at"] > 0
    assert result["agent_types"] == []


def test_upsert_update_existing(tmp_agent_box_home, skill_src):
    skills.upsert_skill("fs", name="v1", directory=str(skill_src))
    result = skills.upsert_skill(
        "fs",
        name="v2",
        description="updated",
        directory=str(skill_src),
    )
    assert result["name"] == "v2"
    assert result["description"] == "updated"
    # installed_at preserved across updates; updated_at changes.
    assert result["installed_at"] > 0
    assert result["updated_at"] >= result["installed_at"]


def test_upsert_default_branch(tmp_agent_box_home, skill_src):
    """repo_branch defaults to 'main' when omitted."""
    result = skills.upsert_skill("fs", directory=str(skill_src))
    assert result["repo_branch"] == "main"


def test_upsert_default_name(tmp_agent_box_home, skill_src):
    """name falls back to id when not given."""
    result = skills.upsert_skill("my-skill", directory=str(skill_src))
    assert result["name"] == "my-skill"


def test_upsert_relative_directory_rejected(tmp_agent_box_home):
    with pytest.raises(ProfileError, match="absolute path"):
        skills.upsert_skill("fs", directory="relative/path")


def test_upsert_nonexistent_directory_rejected(tmp_agent_box_home, tmp_path):
    with pytest.raises(ProfileError, match="does not exist"):
        skills.upsert_skill("fs", directory=str(tmp_path / "missing"))


def test_upsert_empty_directory_allowed(tmp_agent_box_home):
    """A skill can be created with no directory yet (populated later)."""
    result = skills.upsert_skill("placeholder", name="Placeholder")
    assert result["directory"] == ""
    assert result["content_hash"] == ""


# --- list -----------------------------------------------------------------

def test_list_all(tmp_agent_box_home, skill_src):
    skills.upsert_skill("a", directory=str(skill_src))
    skills.upsert_skill("b", directory=str(skill_src), name="Bravo")
    rows = skills.list_skills()
    ids = {r["id"] for r in rows}
    assert ids == {"a", "b"}
    # Summary does not include content_hash.
    assert "content_hash" not in rows[0]


def test_list_filter_by_agent(tmp_agent_box_home, skill_src):
    skills.upsert_skill("a", directory=str(skill_src))
    skills.upsert_skill("b", directory=str(skill_src))
    assert skills.list_skills(agent_type="claude") == []
    skills.set_skill_agent("a", "claude", True)
    assert [r["id"] for r in skills.list_skills(agent_type="claude")] == ["a"]
    assert skills.list_skills(agent_type="codex") == []


def test_list_empty(tmp_agent_box_home):
    assert skills.list_skills() == []


# --- agent association ----------------------------------------------------

def test_set_agent_enable_disable(tmp_agent_box_home, skill_src):
    skills.upsert_skill("fs", directory=str(skill_src))
    assert skills.get_skill_agents("fs") == []
    skills.set_skill_agent("fs", "claude", True)
    skills.set_skill_agent("fs", "codex", True)
    assert skills.get_skill_agents("fs") == ["claude", "codex"]
    # Idempotent enable.
    skills.set_skill_agent("fs", "claude", True)
    assert skills.get_skill_agents("fs") == ["claude", "codex"]
    skills.set_skill_agent("fs", "claude", False)
    assert skills.get_skill_agents("fs") == ["codex"]


def test_set_agent_unknown_skill(tmp_agent_box_home):
    with pytest.raises(ProfileError, match="not found"):
        skills.set_skill_agent("ghost", "claude", True)


def test_set_agent_unknown_agent_type(tmp_agent_box_home, skill_src):
    skills.upsert_skill("fs", directory=str(skill_src))
    with pytest.raises(ProfileError, match="unknown agent_type"):
        skills.set_skill_agent("fs", "ghost", True)


# --- apply ----------------------------------------------------------------

def test_apply_claude(tmp_agent_box_home, skill_src):
    profile.create("mycc", "claude")
    skills.upsert_skill("frontend-design", directory=str(skill_src))
    skills.set_skill_agent("frontend-design", "claude", True)

    skills.apply_skill("mycc", "frontend-design")

    target = config.profile_agent_dir("mycc", "claude") / "skills" / "frontend-design"
    assert target.is_dir()
    assert (target / "SKILL.md").is_file()
    assert (target / "SKILL.md").read_text(encoding="utf-8") == \
        "# Frontend Design\n\nA skill.\n"
    # Subdirectory preserved.
    assert (target / "examples" / "demo.md").is_file()


def test_apply_codex(tmp_agent_box_home, skill_src):
    profile.create("mycodex", "codex")
    skills.upsert_skill("fs", directory=str(skill_src))
    skills.set_skill_agent("fs", "codex", True)

    skills.apply_skill("mycodex", "fs")

    target = config.profile_agent_dir("mycodex", "codex") / "skills" / "fs"
    assert target.is_dir()
    assert (target / "SKILL.md").is_file()


def test_apply_hermes(tmp_agent_box_home, skill_src):
    profile.create("myhermes", "hermes")
    skills.upsert_skill("fs", directory=str(skill_src))
    skills.set_skill_agent("fs", "hermes", True)
    skills.apply_skill("myhermes", "fs")
    target = config.profile_agent_dir("myhermes", "hermes") / "skills" / "fs"
    assert target.is_dir()
    assert (target / "SKILL.md").is_file()


def test_apply_opencode(tmp_agent_box_home, skill_src):
    profile.create("myoc", "opencode")
    skills.upsert_skill("fs", directory=str(skill_src))
    skills.set_skill_agent("fs", "opencode", True)
    skills.apply_skill("myoc", "fs")
    target = config.profile_agent_dir("myoc", "opencode") / "skills" / "fs"
    assert target.is_dir()
    assert (target / "SKILL.md").is_file()


def test_apply_overwrites_existing(tmp_agent_box_home, skill_src, tmp_path):
    """Re-apply replaces the destination, propagating deletions."""
    profile.create("mycc", "claude")
    skills.upsert_skill("fs", directory=str(skill_src))
    skills.set_skill_agent("fs", "claude", True)
    skills.apply_skill("mycc", "fs")

    # Mutate the source to remove a file, then re-apply.
    (skill_src / "SKILL.md").unlink()
    (skill_src / "new.md").write_text("new file")
    skills.apply_skill("mycc", "fs")

    target = config.profile_agent_dir("mycc", "claude") / "skills" / "fs"
    assert not (target / "SKILL.md").exists()
    assert (target / "new.md").is_file()


def test_apply_unknown_profile(tmp_agent_box_home, skill_src):
    skills.upsert_skill("fs", directory=str(skill_src))
    skills.set_skill_agent("fs", "claude", True)
    with pytest.raises(ProfileError, match="profile not found"):
        skills.apply_skill("nope", "fs")


def test_apply_unknown_skill(tmp_agent_box_home):
    profile.create("mycc", "claude")
    with pytest.raises(ProfileError, match="not found"):
        skills.apply_skill("mycc", "nope")


def test_apply_not_enabled_for_agent(tmp_agent_box_home, skill_src):
    profile.create("mycc", "claude")
    skills.upsert_skill("fs", directory=str(skill_src))
    with pytest.raises(ProfileError, match="not enabled for agent_type"):
        skills.apply_skill("mycc", "fs")


def test_apply_empty_directory(tmp_agent_box_home):
    """apply fails if the skill has no directory set."""
    profile.create("mycc", "claude")
    skills.upsert_skill("placeholder")
    skills.set_skill_agent("placeholder", "claude", True)
    with pytest.raises(ProfileError, match="directory is empty"):
        skills.apply_skill("mycc", "placeholder")


# --- delete ---------------------------------------------------------------

def test_delete(tmp_agent_box_home, skill_src):
    skills.upsert_skill("fs", directory=str(skill_src))
    skills.set_skill_agent("fs", "claude", True)
    assert skills.delete_skill("fs") is True
    assert skills.get_skill("fs") is None
    # Agent associations cascade.
    assert skills.get_skill_agents("fs") == []


def test_delete_missing(tmp_agent_box_home):
    assert skills.delete_skill("nope") is False


# --- get ------------------------------------------------------------------

def test_get_missing(tmp_agent_box_home):
    assert skills.get_skill("nope") is None
