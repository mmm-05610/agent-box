"""Config-file registry tests — list/read/write with format validation."""
from __future__ import annotations

import json

import pytest

from agent_box import config
from agent_box.resources import config_files


def test_list_config_files(tmp_agent_box_home):
    entries = config_files.list_config_files()
    keys = [e["key"] for e in entries]
    assert "gui-settings" in keys
    gui = next(e for e in entries if e["key"] == "gui-settings")
    assert gui["exists"] is False  # fresh home → not created yet
    assert gui["format"] == "json"


def test_write_then_read_roundtrip(tmp_agent_box_home):
    config_files.write_config_file("gui-settings", '{"projects_dir": "/tmp/x"}')
    data = config_files.read_config_file("gui-settings")
    assert json.loads(data["content"]) == {"projects_dir": "/tmp/x"}
    assert data["format"] == "json"
    # now listed as existing, at the expected path
    entry = next(e for e in config_files.list_config_files() if e["key"] == "gui-settings")
    assert entry["exists"] is True
    assert (config.agent_box_home() / "gui-settings.json").is_file()


def test_write_invalid_json_rejected(tmp_agent_box_home):
    config_files.write_config_file("gui-settings", '{"projects_dir": "/tmp/x"}')
    with pytest.raises(ValueError):
        config_files.write_config_file("gui-settings", "{ not valid json")
    # file unchanged
    data = config_files.read_config_file("gui-settings")
    assert json.loads(data["content"]) == {"projects_dir": "/tmp/x"}


def test_read_absent_returns_empty(tmp_agent_box_home):
    data = config_files.read_config_file("gui-settings")
    assert data["content"] == ""
    assert data["format"] == "json"


def test_unknown_key(tmp_agent_box_home):
    with pytest.raises(KeyError):
        config_files.read_config_file("nope")
