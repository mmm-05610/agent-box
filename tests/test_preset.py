"""Integration tests for preset resolution (WS5 + WS8 together).

Uses the ``tmp_agent_box_home`` fixture so all profile IO is isolated
to a tmp dir via ``AGENT_BOX_HOME`` — the real ``~/.agent-box`` is
never touched.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from agent_box import config, library, profile
from agent_box.profile import ProfileError


def _settings_json(profile_name: str) -> dict:
    """Load the freshly-created profile's settings.json as a dict."""
    p = config.profile_agent_dir(profile_name, "claude") / "settings.json"
    return json.loads(p.read_text(encoding="utf-8"))


# --- WS5: preset copies its files into the profile ------------------------

def test_preset_applies_claude_md(tmp_agent_box_home):
    profile.create("p1", "claude", preset="python-dev")
    claude_md = (config.profile_agent_dir("p1", "claude") / "CLAUDE.md")
    assert claude_md.is_file()
    assert claude_md.stat().st_size > 0
    # Matches the preset's CLAUDE.md
    preset_md = (library.get_preset_dir("claude", "python-dev") / "CLAUDE.md")
    assert claude_md.read_text(encoding="utf-8") == \
        preset_md.read_text(encoding="utf-8")


def test_preset_applies_hooks(tmp_agent_box_home):
    profile.create("p2", "claude", preset="python-dev")
    # _apply_preset copies hooks.json into <target>/hooks/hooks.json
    # where target = config.profile_agent_dir(name, "claude") = dot-claude/
    # so the hooks live at dot-claude/hooks/hooks.json.
    hooks_file = (config.profile_agent_dir("p2", "claude")
                  / "hooks" / "hooks.json")
    assert hooks_file.is_file()
    preset_hooks = library.get_preset_dir("claude", "python-dev") / "hooks.json"
    assert hooks_file.read_text(encoding="utf-8") == \
        preset_hooks.read_text(encoding="utf-8")


# --- WS8 regression: deep-merge keeps template's permissions.deny --------

def test_preset_deep_merges_settings(tmp_agent_box_home):
    """The template ships permissions.deny + defaultMode.  The
    python-dev preset's settings.overlay.json has permissions.allow.
    After deep-merge: deny + defaultMode survive, allow is added.

    This is the WS8 V7 regression automated — pre-fix, deny and
    defaultMode would be missing."""
    profile.create("p3", "claude", preset="python-dev")
    settings = _settings_json("p3")
    perms = settings["permissions"]
    # Template's defaults must survive the preset overlay
    assert "deny" in perms
    assert perms["defaultMode"] == "default"
    # Preset's allow is added (not replacing — deep-merge, not shallow)
    assert "allow" in perms
    assert "Bash(pytest:*)" in perms["allow"]
    # The template's deny list still has the safe defaults
    assert "Bash(rm -rf *)" in perms["deny"]


# --- meta + error paths --------------------------------------------------

def test_preset_records_in_meta(tmp_agent_box_home):
    """v1 contract: ``preset`` is preserved in the meta dict for v0.4
    back-compat, but always reads as ``""`` (v1 does not persist it;
    the preset is applied at create-time and the resulting files live
    on disk under ``dot-claude/``)."""
    profile.create("p4", "claude", preset="python-dev")
    meta = profile.load_meta("p4")
    assert meta["preset"] == ""  # v1: not persisted, but key still present


def test_unknown_preset_raises(tmp_agent_box_home):
    with pytest.raises(ProfileError, match="unknown preset"):
        profile.create("p5", "claude", preset="nope")
