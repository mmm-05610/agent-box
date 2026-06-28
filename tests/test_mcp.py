"""MCP server CRUD + apply tests (CLI side)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from agent_box import config, mcp, profile
from agent_box.profile import ProfileError


# --- helpers --------------------------------------------------------------

def _stdio_payload(server_id: str = "fs") -> str:
    return json.dumps({
        "name": "Filesystem",
        "server_config": {
            "type": "stdio",
            "command": "npx",
            "args": ["-y", "@anthropic/mcp-server-filesystem"],
            "env": {"HOME": "/tmp"},
        },
        "description": "Filesystem operations via MCP",
        "homepage": "https://example.com",
        "tags": ["filesystem", "tools"],
    })


def _sse_payload() -> str:
    return json.dumps({
        "name": "Remote",
        "server_config": {
            "type": "sse",
            "url": "https://mcp.example.com/sse",
            "headers": {"Authorization": "Bearer x"},
        },
    })


# --- upsert ---------------------------------------------------------------

def test_upsert_insert_new(tmp_agent_box_home):
    """upsert creates a fresh row with all fields populated."""
    result = mcp.upsert_mcp_server("fs", _stdio_payload())
    assert result is not None
    assert result["id"] == "fs"
    assert result["name"] == "Filesystem"
    assert result["description"] == "Filesystem operations via MCP"
    assert result["homepage"] == "https://example.com"
    assert result["tags_parsed"] == ["filesystem", "tools"]
    assert result["server_config_parsed"]["type"] == "stdio"
    assert result["server_config_parsed"]["command"] == "npx"
    assert result["agent_types"] == []  # not yet associated


def test_upsert_update_existing(tmp_agent_box_home):
    """upsert on an existing id updates the row in place."""
    mcp.upsert_mcp_server("fs", _stdio_payload())
    new_payload = json.dumps({
        "name": "Filesystem v2",
        "server_config": {"type": "stdio", "command": "node", "args": ["fs.js"]},
        "description": "updated",
    })
    result = mcp.upsert_mcp_server("fs", new_payload)
    assert result["name"] == "Filesystem v2"
    assert result["description"] == "updated"
    assert result["server_config_parsed"]["command"] == "node"
    # Old tags are gone (upsert overwrites the row).
    assert result["tags_parsed"] == []


def test_upsert_invalid_json(tmp_agent_box_home):
    with pytest.raises(ProfileError, match="not valid JSON"):
        mcp.upsert_mcp_server("bad", "not-json")


def test_upsert_missing_server_config(tmp_agent_box_home):
    with pytest.raises(ProfileError, match="server_config"):
        mcp.upsert_mcp_server("bad", json.dumps({"name": "x"}))


def test_upsert_stdio_missing_command(tmp_agent_box_home):
    payload = json.dumps({"server_config": {"type": "stdio"}})
    with pytest.raises(ProfileError, match="command"):
        mcp.upsert_mcp_server("bad", payload)


def test_upsert_unknown_type(tmp_agent_box_home):
    payload = json.dumps({"server_config": {"type": "weird"}})
    with pytest.raises(ProfileError, match="type"):
        mcp.upsert_mcp_server("bad", payload)


# --- list -----------------------------------------------------------------

def test_list_all(tmp_agent_box_home):
    mcp.upsert_mcp_server("fs", _stdio_payload())
    mcp.upsert_mcp_server("remote", _sse_payload())
    rows = mcp.list_mcp_servers()
    ids = {r["id"] for r in rows}
    assert ids == {"fs", "remote"}


def test_list_filter_by_agent(tmp_agent_box_home):
    """list_mcp_servers(agent_type=...) only returns rows with that agent enabled."""
    mcp.upsert_mcp_server("fs", _stdio_payload())
    mcp.upsert_mcp_server("remote", _sse_payload())
    # No agents enabled → empty when filtered.
    assert mcp.list_mcp_servers(agent_type="claude") == []
    mcp.set_mcp_agent("fs", "claude", True)
    rows = mcp.list_mcp_servers(agent_type="claude")
    assert [r["id"] for r in rows] == ["fs"]
    rows = mcp.list_mcp_servers(agent_type="codex")
    assert rows == []


def test_list_empty(tmp_agent_box_home):
    assert mcp.list_mcp_servers() == []


# --- agent association ----------------------------------------------------

def test_set_agent_enable_disable(tmp_agent_box_home):
    mcp.upsert_mcp_server("fs", _stdio_payload())
    # Initially empty.
    assert mcp.get_mcp_agents("fs") == []
    # Enable.
    mcp.set_mcp_agent("fs", "claude", True)
    mcp.set_mcp_agent("fs", "codex", True)
    assert mcp.get_mcp_agents("fs") == ["claude", "codex"]
    # Idempotent enable.
    mcp.set_mcp_agent("fs", "claude", True)
    assert mcp.get_mcp_agents("fs") == ["claude", "codex"]
    # Disable.
    mcp.set_mcp_agent("fs", "claude", False)
    assert mcp.get_mcp_agents("fs") == ["codex"]
    # Idempotent disable.
    mcp.set_mcp_agent("fs", "claude", False)
    assert mcp.get_mcp_agents("fs") == ["codex"]


def test_set_agent_unknown_server(tmp_agent_box_home):
    with pytest.raises(ProfileError, match="not found"):
        mcp.set_mcp_agent("does-not-exist", "claude", True)


def test_set_agent_unknown_agent_type(tmp_agent_box_home):
    mcp.upsert_mcp_server("fs", _stdio_payload())
    with pytest.raises(ProfileError, match="unknown agent_type"):
        mcp.set_mcp_agent("fs", "ghost", True)


# --- apply ----------------------------------------------------------------

def test_apply_claude(tmp_agent_box_home):
    """apply writes into dot-claude.json::mcpServers (profile root, NOT
    dot-claude/claude.json)."""
    profile.create("mycc", "claude")
    mcp.upsert_mcp_server("fs", _stdio_payload())
    mcp.set_mcp_agent("fs", "claude", True)

    mcp.apply_mcp_server("mycc", "fs")

    target = config.profile_dir("mycc") / "dot-claude.json"
    assert target.is_file()
    data = json.loads(target.read_text(encoding="utf-8"))
    assert "mcpServers" in data
    assert "fs" in data["mcpServers"]
    assert data["mcpServers"]["fs"]["type"] == "stdio"
    assert data["mcpServers"]["fs"]["command"] == "npx"


def test_apply_codex(tmp_agent_box_home):
    """apply writes into dot-codex/config.toml under [mcp_servers.<id>]."""
    profile.create("mycodex", "codex")
    mcp.upsert_mcp_server("fs", _stdio_payload())
    mcp.set_mcp_agent("fs", "codex", True)

    mcp.apply_mcp_server("mycodex", "fs")

    target = config.profile_agent_dir("mycodex", "codex") / "config.toml"
    assert target.is_file()
    text = target.read_text(encoding="utf-8")
    # TOML section header present.
    assert "[mcp_servers]" in text
    # Codex entry uses a flat command (no "type" field).
    assert "command = " in text
    assert "npx" in text
    # Top-level template keys preserved.
    assert "[model_providers.custom]" in text


def test_apply_hermes(tmp_agent_box_home):
    """apply writes into dot-hermes/config.yaml::mcp_servers, no type field."""
    profile.create("myhermes", "hermes")
    mcp.upsert_mcp_server("fs", _stdio_payload())
    mcp.set_mcp_agent("fs", "hermes", True)

    mcp.apply_mcp_server("myhermes", "fs")

    target = config.profile_agent_dir("myhermes", "hermes") / "config.yaml"
    assert target.is_file()
    import yaml
    data = yaml.safe_load(target.read_text(encoding="utf-8"))
    assert "mcp_servers" in data
    assert "fs" in data["mcp_servers"]
    entry = data["mcp_servers"]["fs"]
    # Hermes infers type from command/url — no type field.
    assert "type" not in entry
    assert entry["command"] == "npx"
    # Top-level template keys preserved.
    assert "model" in data
    assert "terminal" in data


def test_apply_opencode(tmp_agent_box_home):
    """apply converts stdio→local and sse→remote for OpenCode format."""
    profile.create("myoc", "opencode")
    mcp.upsert_mcp_server("fs", _stdio_payload())
    mcp.upsert_mcp_server("remote", _sse_payload())
    mcp.set_mcp_agent("fs", "opencode", True)
    mcp.set_mcp_agent("remote", "opencode", True)

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


def test_apply_merges_existing_claude(tmp_agent_box_home):
    """apply merges into existing mcpServers in dot-claude.json, preserves
    other top-level keys (including CC state fields)."""
    profile.create("mycc", "claude")
    target = config.profile_dir("mycc") / "dot-claude.json"
    # Seed dot-claude.json with CC-like state + an existing MCP entry.
    target.write_text(json.dumps({
        "firstStartTime": "2026-06-28T00:00:00.000Z",
        "userID": "abc123",
        "machineID": "def456",
        "projects": {"/home/user/proj": {}},
        "mcpServers": {"existing": {"type": "stdio", "command": "old"}},
        "extraKey": {"keep": "me"},
    }))

    mcp.upsert_mcp_server("fs", _stdio_payload())
    mcp.set_mcp_agent("fs", "claude", True)
    mcp.apply_mcp_server("mycc", "fs")

    data = json.loads(target.read_text(encoding="utf-8"))
    # CC state fields preserved.
    assert data["firstStartTime"] == "2026-06-28T00:00:00.000Z"
    assert data["userID"] == "abc123"
    assert data["machineID"] == "def456"
    assert data["projects"] == {"/home/user/proj": {}}
    # MCP entries merged.
    assert "existing" in data["mcpServers"]  # preserved
    assert "fs" in data["mcpServers"]        # new
    # Other user keys preserved.
    assert data["extraKey"] == {"keep": "me"}


def test_apply_unknown_profile(tmp_agent_box_home):
    mcp.upsert_mcp_server("fs", _stdio_payload())
    mcp.set_mcp_agent("fs", "claude", True)
    with pytest.raises(ProfileError, match="profile not found"):
        mcp.apply_mcp_server("nope", "fs")


def test_apply_unknown_server(tmp_agent_box_home):
    profile.create("mycc", "claude")
    with pytest.raises(ProfileError, match="mcp-server .* not found"):
        mcp.apply_mcp_server("mycc", "nope")


def test_apply_not_enabled_for_agent(tmp_agent_box_home):
    """apply fails if the server isn't enabled for the profile's agent_type."""
    profile.create("mycc", "claude")
    mcp.upsert_mcp_server("fs", _stdio_payload())
    # Don't enable for claude.
    with pytest.raises(ProfileError, match="not enabled for agent_type"):
        mcp.apply_mcp_server("mycc", "fs")


# --- delete ---------------------------------------------------------------

def test_delete(tmp_agent_box_home):
    mcp.upsert_mcp_server("fs", _stdio_payload())
    mcp.set_mcp_agent("fs", "claude", True)
    assert mcp.delete_mcp_server("fs") is True
    assert mcp.get_mcp_server("fs") is None
    # Agent associations cascade.
    assert mcp.get_mcp_agents("fs") == []


def test_delete_missing(tmp_agent_box_home):
    assert mcp.delete_mcp_server("nope") is False


# --- get ------------------------------------------------------------------

def test_get_missing(tmp_agent_box_home):
    assert mcp.get_mcp_server("nope") is None
