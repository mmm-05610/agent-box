"""Tests for the profile lifecycle: meta IO, create, list, show, delete,
and the WS8 _deep_merge helper.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from agent_box import config, library, profile
from agent_box.profile import ProfileError, _deep_merge


# --- meta round-trip -------------------------------------------------------

def test_meta_round_trip(tmp_path):
    """write_meta + load_meta round-trips optional fields, including
    special chars (colon, quote) that exercise the escaping in
    _meta_to_yaml."""
    root = tmp_path / "p"
    meta = {
        "name": "x",
        "agent_type": "cc",
        "display_name": 'A "quoted" name: yes',
        "description": "with #hash and:colon",
        "provider": "custom",
        "preset": "python-dev",
    }
    profile.write_meta(root, meta)
    # Read back via the private parser to avoid touching config.profile_dir
    parsed = profile._parse_simple_yaml(
        (root / "meta.yaml").read_text(encoding="utf-8")
    )
    for k, v in meta.items():
        assert parsed.get(k) == v, f"{k!r}: {parsed.get(k)!r} != {v!r}"


def test_meta_back_compat(tmp_path):
    """A meta.yaml with ONLY name + agent_type loads with optionals = None."""
    root = tmp_path / "p"
    root.mkdir()
    (root / "meta.yaml").write_text(
        "name: legacy\nagent_type: cc\n", encoding="utf-8"
    )
    # _parse_simple_yaml is the source of truth for back-compat behavior
    # (it doesn't fill in optionals — load_meta does).
    parsed = profile._parse_simple_yaml(
        (root / "meta.yaml").read_text(encoding="utf-8")
    )
    assert parsed == {"name": "legacy", "agent_type": "cc"}
    assert parsed.get("display_name") is None
    assert parsed.get("provider") is None
    assert parsed.get("preset") is None


# --- create / delete / list / show -----------------------------------------

def test_create_creates_dirs_and_meta(tmp_agent_box_home):
    root = profile.create("t1", "cc")
    assert root == config.profile_dir("t1")
    assert (config.profile_agent_dir("t1", "cc") / "settings.json").is_file()
    meta = profile.load_meta("t1")
    assert meta["name"] == "t1"
    assert meta["agent_type"] == "cc"


def test_create_duplicate_raises(tmp_agent_box_home):
    profile.create("dup", "cc")
    with pytest.raises(ProfileError):
        profile.create("dup", "cc")


def test_delete(tmp_agent_box_home):
    profile.create("del", "cc")
    assert config.profile_dir("del").is_dir()
    assert profile.delete("del", force=True) is True
    assert not config.profile_dir("del").exists()


def test_list_profiles(tmp_agent_box_home):
    profile.create("a", "cc")
    profile.create("b", "codex")
    listed = profile.list_profiles()
    names = {p["name"] for p in listed}
    types = {p["agent_type"] for p in listed}
    assert names == {"a", "b"}
    assert types == {"cc", "codex"}


def test_show_includes_optional_fields(tmp_agent_box_home):
    profile.create(
        "shown", "cc",
        display_name="My Display",
        provider="custom",
        preset="python-dev",
    )
    info = profile.show("shown")
    assert info["display_name"] == "My Display"
    assert info["provider"] == "custom"
    assert info["preset"] == "python-dev"
    assert info["meta"]["agent_type"] == "cc"


# --- WS8 regression: _deep_merge ------------------------------------------

def test_deep_merge():
    """Overlay must not clobber sibling keys at the merged level.
    This is the WS8 V7 regression: a preset's permissions.allow must
    not erase the template's permissions.deny + defaultMode."""
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
    merged = _deep_merge(base, overlay)
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
    merged = _deep_merge(base, overlay)
    assert merged["permissions"]["allow"] == ["C"]


def test_deep_merge_scalar_overlay_wins():
    """Scalar overlay values win over base scalars at the same key."""
    base = {"a": 1, "nested": {"x": "old"}}
    overlay = {"a": 2, "nested": {"x": "new", "y": "added"}}
    merged = _deep_merge(base, overlay)
    assert merged["a"] == 2
    assert merged["nested"] == {"x": "new", "y": "added"}
