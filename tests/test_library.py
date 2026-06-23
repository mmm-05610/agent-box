"""Tests for the agent/preset registry in agent_box.library."""
from __future__ import annotations

from agent_box import library


def test_get_agent_types():
    types = library.get_agent_types()
    assert types == sorted(types)
    assert set(types) == {"cc", "codex", "hermes", "opencode"}


def test_get_agent_config_known():
    info = library.get_agent_config("cc")
    assert info is not None
    assert info["config_dir"] == "~/.claude"
    assert info["binary"] == "claude"


def test_get_agent_config_unknown():
    assert library.get_agent_config("nope") is None


def test_get_template_dir_known():
    for t in ("cc", "codex", "hermes", "opencode"):
        d = library.get_template_dir(t)
        assert d is not None
        assert d.is_dir()


def test_get_template_dir_unknown():
    assert library.get_template_dir("nope") is None


def test_get_template_data_dir_opencode():
    """OpenCode has a secondary data dir (auth.json lives separately)."""
    d = library.get_template_data_dir("opencode")
    assert d is not None
    assert d.is_dir()


def test_get_template_data_dir_cc_is_none():
    """CC has no secondary data dir."""
    assert library.get_template_data_dir("cc") is None


def test_list_presets_cc():
    presets = library.list_presets("cc")
    assert set(presets) >= {"blank", "decision-maker", "python-dev", "spec-writer"}


def test_list_presets_unknown_agent_type():
    """An unknown agent type returns an empty list, not a crash."""
    assert library.list_presets("nope") == []


def test_get_preset_dir_known():
    d = library.get_preset_dir("cc", "python-dev")
    assert d is not None
    assert d.is_dir()


def test_get_preset_dir_unknown():
    assert library.get_preset_dir("cc", "nope") is None
