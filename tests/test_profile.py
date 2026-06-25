"""Tests for the profile lifecycle: DB-backed meta IO, create, list,
show, delete, legacy meta.yaml migration, and the WS8 _deep_merge
helper.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from agent_box import config, library, profile
from agent_box._io import deep_merge
from agent_box.profile import ProfileError


# --- DB-backed create / list / show / delete ------------------------------

def test_create_creates_dirs_and_meta(tmp_agent_box_home):
    """create() copies the template and inserts a profiles row."""
    root = profile.create("t1", "claude")
    assert root == config.profile_dir("t1")
    assert (config.profile_agent_dir("t1", "claude") / "settings.json").is_file()
    meta = profile.load_meta("t1")
    assert meta["name"] == "t1"
    assert meta["agent_type"] == "claude"
    # Optional fields default to "" (not None) for v0.4 back-compat.
    assert meta["display_name"] == ""
    assert meta["description"] == ""


def test_create_with_optional_fields(tmp_agent_box_home):
    profile.create(
        "p1", "claude",
        display_name="My Display",
        description="for testing",
        provider="custom",
        claude_md="# custom body\n",
    )
    meta = profile.load_meta("p1")
    assert meta["display_name"] == "My Display"
    assert meta["description"] == "for testing"
    assert meta["provider"] == "custom"
    assert meta["claude_md"] == "# custom body\n"


def test_create_duplicate_raises(tmp_agent_box_home):
    profile.create("dup", "claude")
    with pytest.raises(ProfileError):
        profile.create("dup", "claude")


def test_delete(tmp_agent_box_home):
    profile.create("del", "claude")
    assert config.profile_dir("del").is_dir()
    assert profile.delete("del", force=True) is True
    assert not config.profile_dir("del").exists()
    # DB row is gone.
    with pytest.raises(ProfileError):
        profile.load_meta("del")


def test_list_profiles(tmp_agent_box_home):
    profile.create("a", "claude")
    profile.create("b", "codex")
    listed = profile.list_profiles()
    names = {p["name"] for p in listed}
    types = {p["agent_type"] for p in listed}
    assert names == {"a", "b"}
    assert types == {"claude", "codex"}


def test_show_includes_optional_fields(tmp_agent_box_home):
    profile.create(
        "shown", "claude",
        display_name="My Display",
        provider="custom",
    )
    info = profile.show("shown")
    assert info["display_name"] == "My Display"
    assert info["provider"] == "custom"
    assert info["meta"]["agent_type"] == "claude"


# --- legacy meta.yaml migration ------------------------------------------

def test_load_meta_migrates_legacy_yaml(tmp_agent_box_home):
    """A v0.4 meta.yaml is transparently migrated into the profiles table.

    Verifies:
      * load_meta returns the right dict after migration
      * ``agent_type: cc`` is normalized to ``claude``
      * the legacy file is renamed to ``meta.yaml.migrated``
      * the profiles table has the row (so a second load_meta is a hit,
        not another migration)
    """
    root = config.profile_dir("legacy")
    root.mkdir(parents=True)
    (root / "meta.yaml").write_text(
        "name: legacy\n"
        "agent_type: cc\n"
        "display_name: Legacy\n"
        "description: from yaml\n"
        "provider: anthropic\n"
        "preset: blank\n",
        encoding="utf-8",
    )

    meta = profile.load_meta("legacy")
    assert meta["name"] == "legacy"
    assert meta["agent_type"] == "claude"  # normalized
    assert meta["display_name"] == "Legacy"
    assert meta["description"] == "from yaml"
    assert meta["provider"] == "anthropic"
    # Preset isn't a DB column \u2014 it's dropped, which is fine for v1.

    # Legacy file renamed; profiles row inserted.
    assert not (root / "meta.yaml").exists()
    assert (root / "meta.yaml.migrated").is_file()

    # Second load_meta is a cache hit (no re-migration).
    meta2 = profile.load_meta("legacy")
    assert meta2 == meta


def test_load_meta_missing_raises(tmp_agent_box_home):
    """Unknown profile with no legacy yaml raises ProfileError."""
    with pytest.raises(ProfileError, match="not found"):
        profile.load_meta("nope")


def test_load_meta_corrupt_yaml_left_alone(tmp_agent_box_home):
    """A corrupt legacy YAML is left for the user to inspect (no raise)."""
    root = config.profile_dir("corrupt")
    root.mkdir(parents=True)
    (root / "meta.yaml").write_text(
        "this is not: valid: yaml: at all\n", encoding="utf-8"
    )
    with pytest.raises(ProfileError, match="not found"):
        profile.load_meta("corrupt")
    # Corrupt file is left in place so the user can fix it.
    assert (root / "meta.yaml").is_file()
    assert not (root / "meta.yaml.migrated").exists()


# --- WS8 _deep_merge (regression) ----------------------------------------

def test_deep_merge():
    """Overlay must not clobber sibling keys at the merged level.

    Regression: a preset's permissions.allow must not erase the
    template's permissions.deny + defaultMode.
    """
    base = {
        "permissions": {
            "deny": ["Bash(rm -rf *)", "Read(./.env)"],
            "defaultMode": "default",
        },
        "cleanupPeriodDays": 7,
    }
    overlay = {
        "permissions": {
            "allow": ["Bash(pytest:*)"],
        },
    }
    merged = deep_merge(base, overlay)
    assert merged["permissions"] == {
        "deny": ["Bash(rm -rf *)", "Read(./.env)"],
        "defaultMode": "default",
        "allow": ["Bash(pytest:*)"],
    }
    # Sibling key at the top level survives untouched
    assert merged["cleanupPeriodDays"] == 7


def test_deep_merge_list_replaces_at_leaf():
    """Standard overlay semantics: a list in overlay REPLACES the list
    at the same leaf, not concatenates."""
    base = {"permissions": {"allow": ["A", "B"]}}
    overlay = {"permissions": {"allow": ["C"]}}
    merged = deep_merge(base, overlay)
    assert merged["permissions"]["allow"] == ["C"]


def test_deep_merge_scalar_overlay_wins():
    """Scalar overlay values win over base scalars at the same key."""
    base = {"a": 1, "nested": {"x": "old"}}
    overlay = {"a": 2, "nested": {"x": "new", "y": "added"}}
    merged = deep_merge(base, overlay)
    assert merged["a"] == 2
    assert merged["nested"] == {"x": "new", "y": "added"}
