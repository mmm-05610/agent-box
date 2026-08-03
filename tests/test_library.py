"""Tests for the agent/preset registry in agent_box.library."""
from __future__ import annotations

from agent_box.core import library


def test_get_agent_types():
    types = library.get_agent_types()
    assert types == sorted(types)
    assert set(types) == {"claude", "codex", "hermes", "opencode"}


def test_get_agent_config_known():
    info = library.get_agent_config("claude")
    assert info is not None
    assert info["runtime"]["config_dir"] == "~/.claude"
    assert info["identity"]["binary"] == "claude"


def test_get_agent_config_unknown():
    assert library.get_agent_config("nope") is None


def test_registry_loaded_from_json():
    """The registry ships as core/agent_types.json with all four agents."""
    import json

    from agent_box.core import library as _library

    path = _library._AGENT_TYPES_FILE
    assert path.name == "agent_types.json"
    assert path.is_file()
    data = json.loads(path.read_text(encoding="utf-8"))
    assert set(data) == {"claude", "codex", "hermes", "opencode"}


def test_registry_entries_have_required_blocks():
    """Every agent must carry identity/runtime with required core fields."""
    for agent_type in library.get_agent_types():
        info = library.get_agent_config(agent_type)
        assert info is not None
        assert {"identity", "runtime"} <= set(info)
        identity = info["identity"]
        assert {"display_name", "binary"} <= set(identity)
        runtime = info["runtime"]
        assert {"config_dir", "profile_dir_suffix", "acs_column"} <= set(runtime)


def test_get_template_dir_known():
    for t in ("claude", "codex", "hermes", "opencode"):
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
    assert library.get_template_data_dir("claude") is None


def test_list_presets_cc():
    presets = library.list_presets("claude")
    assert set(presets) >= {"blank", "decision-maker", "python-dev", "spec-writer"}


def test_list_presets_unknown_agent_type():
    """An unknown agent type returns an empty list, not a crash."""
    assert library.list_presets("nope") == []


def test_get_preset_dir_known():
    d = library.get_preset_dir("claude", "python-dev")
    assert d is not None
    assert d.is_dir()


def test_get_preset_dir_unknown():
    assert library.get_preset_dir("claude", "nope") is None
