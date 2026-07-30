"""Tests for the profile lifecycle: DB-backed meta IO, create, list,
show, delete, legacy meta.yaml migration, and the WS8 _deep_merge
helper.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from agent_box import config
from agent_box.core import library
from agent_box.resources import profile
from agent_box.core.io import deep_merge
from agent_box.resources.profile import ProfileError


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
        prompt_body="# custom body\n",
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


def test_load_meta_missing_raises(tmp_agent_box_home):
    """Unknown profile raises ProfileError."""
    with pytest.raises(ProfileError, match="not found"):
        profile.load_meta("nope")


# --- update_meta -----------------------------------------------------------

def test_update_meta_single_field(tmp_agent_box_home):
    """Update one field, verify only that field changes."""
    profile.create("mycc", "claude", display_name="Original")
    result = profile.update_meta("mycc", display_name="Updated")
    assert result["display_name"] == "Updated"
    assert result["agent_type"] == "claude"


def test_update_meta_multiple_fields(tmp_agent_box_home):
    """Update several fields at once."""
    profile.create("mycc", "claude")
    result = profile.update_meta(
        "mycc",
        display_name="Test Profile",
        description="A test profile",
        provider="anthropic",
    )
    assert result["display_name"] == "Test Profile"
    assert result["description"] == "A test profile"
    assert result["provider"] == "anthropic"


def test_update_meta_no_flags_is_noop(tmp_agent_box_home):
    """Calling update_meta with no kwargs returns current meta unchanged."""
    profile.create("mycc", "claude", display_name="Keep")
    result = profile.update_meta("mycc")
    assert result["display_name"] == "Keep"


def test_update_meta_unknown_profile(tmp_agent_box_home):
    with pytest.raises(ProfileError, match="not found"):
        profile.update_meta("nope", display_name="x")


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
