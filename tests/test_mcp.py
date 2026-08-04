"""MCP apply tests — agent-box reads MCP servers from ACS only."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from agent_box import config
from agent_box.resources import mcp, profile
from agent_box.resources.profile import ProfileError


# --- apply ----------------------------------------------------------------

def _stdio_payload() -> dict:
    return {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@anthropic/mcp-server-filesystem"],
        "env": {"HOME": "/tmp"},
    }


def _sse_payload() -> dict:
    return {
        "type": "sse",
        "url": "https://mcp.example.com/sse",
        "headers": {"Authorization": "Bearer x"},
    }


def test_apply_claude(tmp_agent_box_home, acs_stub):
    """apply writes into dot-claude.json::mcpServers (profile root, NOT
    dot-claude/claude.json)."""
    profile.create("mycc", "claude")
    acs_stub.add_mcp("fs", _stdio_payload(), enabled_agents=["claude"])

    mcp.apply_mcp_server("mycc", "fs")

    target = config.profile_dir("mycc") / "dot-claude.json"
    assert target.is_file()
    data = json.loads(target.read_text(encoding="utf-8"))
    assert "mcpServers" in data
    assert "fs" in data["mcpServers"]
    assert data["mcpServers"]["fs"]["type"] == "stdio"
    assert data["mcpServers"]["fs"]["command"] == "npx"


def test_apply_codex(tmp_agent_box_home, acs_stub):
    """apply writes into dot-codex/config.toml under [mcp_servers.<id>]."""
    profile.create("mycodex", "codex")
    acs_stub.add_mcp("fs", _stdio_payload(), enabled_agents=["codex"])

    mcp.apply_mcp_server("mycodex", "fs")

    target = config.profile_agent_dir("mycodex", "codex") / "config.toml"
    assert target.is_file()
    text = target.read_text(encoding="utf-8")
    assert "[mcp_servers.fs]" in text
    assert "command = " in text
    assert "npx" in text
    # Top-level template keys preserved.
    assert "[model_providers.custom]" in text


def test_apply_hermes(tmp_agent_box_home, acs_stub):
    """apply writes into dot-hermes/config.yaml::mcp_servers, no type field."""
    profile.create("myhermes", "hermes")
    acs_stub.add_mcp("fs", _stdio_payload(), enabled_agents=["hermes"])

    mcp.apply_mcp_server("myhermes", "fs")

    target = config.profile_agent_dir("myhermes", "hermes") / "config.yaml"
    assert target.is_file()
    import yaml
    data = yaml.safe_load(target.read_text(encoding="utf-8"))
    assert "mcp_servers" in data
    assert "fs" in data["mcp_servers"]
    entry = data["mcp_servers"]["fs"]
    assert "type" not in entry
    assert entry["command"] == "npx"
    assert "model" in data
    assert "terminal" in data


def test_apply_opencode(tmp_agent_box_home, acs_stub):
    """apply converts stdio→local and sse→remote for OpenCode format."""
    profile.create("myoc", "opencode")
    acs_stub.add_mcp("fs", _stdio_payload(), enabled_agents=["opencode"])
    acs_stub.add_mcp("remote", _sse_payload(), enabled_agents=["opencode"])

    mcp.apply_mcp_server("myoc", "fs")
    mcp.apply_mcp_server("myoc", "remote")

    target = config.profile_agent_dir("myoc", "opencode") / "opencode.jsonc"
    data = json.loads(target.read_text(encoding="utf-8"))
    servers = data["mcp"]["servers"]
    # stdio → local, command+args merged into array
    assert servers["fs"]["type"] == "local"
    assert servers["fs"]["command"] == ["npx", "-y", "@anthropic/mcp-server-filesystem"]
    assert servers["fs"]["environment"]["HOME"] == "/tmp"
    # sse → remote
    assert servers["remote"]["type"] == "remote"
    assert servers["remote"]["url"] == "https://mcp.example.com/sse"
    assert servers["remote"]["headers"]["Authorization"] == "Bearer x"
    # Top-level template keys preserved (the opencode template has "provider").
    assert "provider" in data


def test_apply_merges_existing_claude(tmp_agent_box_home, acs_stub):
    """apply merges into existing mcpServers in dot-claude.json, preserves
    other top-level keys (including CC state fields)."""
    profile.create("mycc", "claude")
    target = config.profile_dir("mycc") / "dot-claude.json"
    target.write_text(json.dumps({
        "firstStartTime": "2026-06-28T00:00:00.000Z",
        "userID": "abc123",
        "machineID": "def456",
        "projects": {"/home/user/proj": {}},
        "mcpServers": {"existing": {"type": "stdio", "command": "old"}},
        "extraKey": {"keep": "me"},
    }))

    acs_stub.add_mcp("fs", _stdio_payload(), enabled_agents=["claude"])
    mcp.apply_mcp_server("mycc", "fs")

    data = json.loads(target.read_text(encoding="utf-8"))
    assert data["firstStartTime"] == "2026-06-28T00:00:00.000Z"
    assert data["userID"] == "abc123"
    assert data["machineID"] == "def456"
    assert data["projects"] == {"/home/user/proj": {}}
    assert "existing" in data["mcpServers"]
    assert "fs" in data["mcpServers"]
    assert data["extraKey"] == {"keep": "me"}


def test_apply_not_enabled_for_agent(tmp_agent_box_home, acs_stub):
    """apply fails if the server isn't enabled for the profile's agent_type."""
    profile.create("mycc", "claude")
    acs_stub.add_mcp("fs", _stdio_payload(), enabled_agents=["codex"])
    with pytest.raises(ProfileError, match="not enabled for agent_type"):
        mcp.apply_mcp_server("mycc", "fs")
