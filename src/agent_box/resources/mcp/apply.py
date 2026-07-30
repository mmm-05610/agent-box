"""MCP apply — write MCP server configs to profile agent config files.

Supports Claude (dot-claude.json), Codex (config.toml), Hermes (config.yaml),
and OpenCode (opencode.jsonc) with format conversion.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from ... import config
from .._shared import resolve_profile
from ..profile import ProfileError
from ...adapters import acs as _acs
from ...core.io import read_json, read_jsonc, read_toml, read_yaml
from ...core.io import write_json, write_toml, write_yaml
from ...core.library import get_agent_config


# ── apply ───────────────────────────────────────────────────────────────────

def apply_mcp_server(profile_name: str, server_id: str) -> None:
    """Write an MCP server's config to a profile's per-agent file.

    The agent type determines the target file, root key, and I/O
    format — all resolved from the registry.  No per-agent branching.
    """
    meta, agent_config = resolve_profile(profile_name)
    profile_agent_type = meta["agent_type"]

    server = _acs.get_mcp_server(server_id)
    if server is None:
        raise ProfileError(f"mcp-server {server_id!r} not found in ACS")

    enabled_agents = set(server.get("agent_types") or [])
    if profile_agent_type not in enabled_agents:
        raise ProfileError(
            f"mcp-server {server_id!r} is not enabled for agent_type "
            f"{profile_agent_type!r}"
        )

    server_config = server.get("server_config_parsed") or {}
    if not isinstance(server_config, dict) or not server_config:
        raise ProfileError(
            f"mcp-server {server_id!r}: server_config is missing or empty"
        )

    _write_mcp(profile_name, profile_agent_type, server_id, server_config)




def _mcp_target(profile_name: str, agent_type: str) -> tuple[Path, str]:
    agent_config = get_agent_config(agent_type)
    if agent_config is None:
        raise ProfileError(f"unknown agent_type {agent_type!r}")
    mcp_config = agent_config.get("mcp_config")
    if not isinstance(mcp_config, dict):
        raise ProfileError(f"mcp config is not supported for {agent_type!r}")
    base = (
        config.profile_dir(profile_name)
        if mcp_config.get("at_profile_root")
        else config.profile_agent_dir(profile_name, agent_type)
    )
    return base / mcp_config["filename"], mcp_config["root_key"]


def _write_mcp(profile_name: str, agent_type: str,
                  server_id: str, server_config: Dict[str, Any]) -> None:
    """Merge *server_config* into the MCP section of the profile's config."""
    if "type" not in server_config:
        raise ProfileError(
            f"mcp-server {server_id!r}: server_config is missing 'type'"
        )
    target, root_key = _mcp_target(profile_name, agent_type)
    existing = _read_config(target)

    if agent_type == "opencode":
        _write_opencode(target, root_key, existing, server_id, server_config)
    else:
        mcp_section = existing.get(root_key)
        if not isinstance(mcp_section, dict):
            mcp_section = {}
        entry = server_config if agent_type == "claude" else _convert_entry(agent_type, server_config)
        mcp_section[server_id] = entry
        existing[root_key] = mcp_section
        _write_config(target, existing)


def _read_config(target: Path) -> Dict[str, Any]:
    if not target.is_file():
        return {}
    fmt = target.suffix.lstrip(".")
    if fmt == "toml":
        return read_toml(target)
    if fmt in ("yaml", "yml"):
        return read_yaml(target)
    if fmt == "jsonc":
        return read_jsonc(target)
    return read_json(target)  # .json is the default


def _write_config(target: Path, data: Dict[str, Any]) -> None:
    fmt = target.suffix.lstrip(".")
    if fmt == "toml":
        write_toml(target, data)
    elif fmt in ("yaml", "yml"):
        write_yaml(target, data)
    else:
        write_json(target, data)


def _convert_entry(agent_type: str,
                   server_config: Dict[str, Any]) -> Dict[str, Any]:
    """Convert ACS unified format → agent-specific entry shape."""
    if agent_type == "codex":
        typ = server_config.get("type")
        entry: Dict[str, Any] = {}
        if typ == "stdio":
            entry["command"] = server_config.get("command", "")
            args = server_config.get("args")
            if isinstance(args, list) and args:
                entry["args"] = [str(a) for a in args]
            env = server_config.get("env")
            if isinstance(env, dict) and env:
                entry["env"] = {str(k): str(v) for k, v in env.items()}
            cwd = server_config.get("cwd")
            if isinstance(cwd, str) and cwd:
                entry["cwd"] = cwd
        else:
            entry["url"] = server_config.get("url", "")
            headers = server_config.get("headers")
            if isinstance(headers, dict) and headers:
                entry["headers"] = {str(k): str(v) for k, v in headers.items()}
        return entry
    return {k: v for k, v in server_config.items() if k != "type"}


def _write_opencode(target: Path, root_key: str,
                    existing: Dict[str, Any],
                    server_id: str,
                    server_config: Dict[str, Any]) -> None:
    """OpenCode-specific write — nested ``servers`` key + format conversion."""
    mcp_section = existing.get(root_key)
    if not isinstance(mcp_section, dict):
        mcp_section = {}
    servers = mcp_section.get("servers")
    if not isinstance(servers, dict):
        servers = {}

    typ = server_config.get("type")
    entry: Dict[str, Any] = {"enabled": True}
    if typ == "stdio":
        entry["type"] = "local"
        cmd = server_config.get("command", "")
        args = server_config.get("args") or []
        if not isinstance(args, list):
            args = [str(args)]
        entry["command"] = [str(cmd), *[str(a) for a in args]]
        env = server_config.get("env")
        if isinstance(env, dict) and env:
            entry["environment"] = {str(k): str(v) for k, v in env.items()}
    elif typ in ("sse", "http"):
        entry["type"] = "remote"
        if "url" in server_config:
            entry["url"] = server_config["url"]
        headers = server_config.get("headers")
        if isinstance(headers, dict) and headers:
            entry["headers"] = {str(k): str(v) for k, v in headers.items()}
    servers[server_id] = entry
    mcp_section["servers"] = servers
    existing[root_key] = mcp_section
    write_json(target, existing)


# ── profile-level list / remove ────────────────────────────────────────────


def list_profile_mcp_servers(profile_name: str) -> List[Dict[str, Any]]:
    """Read installed MCP servers from a profile's config file."""
    meta, agent_config = resolve_profile(profile_name)
    target, root_key = _mcp_target(profile_name, meta["agent_type"])
    existing = _read_config(target)
    root = existing.get(root_key) if isinstance(existing, dict) else None
    if meta["agent_type"] == "opencode":
        servers = root.get("servers") if isinstance(root, dict) else None
    else:
        servers = root if isinstance(root, dict) else None
    if not isinstance(servers, dict):
        return []
    return [_mcp_summary(sid, s) for sid, s in servers.items()]


def remove_mcp_from_profile(profile_name: str, mcp_id: str) -> None:
    """Remove an MCP server from a profile's config file."""
    meta, agent_config = resolve_profile(profile_name)
    target, root_key = _mcp_target(profile_name, meta["agent_type"])
    existing = _read_config(target) if target.is_file() else {}
    if not isinstance(existing, dict):
        return
    if meta["agent_type"] == "opencode":
        mcp = existing.get(root_key) if isinstance(existing, dict) else None
        if isinstance(mcp, dict):
            servers = mcp.get("servers")
            if isinstance(servers, dict) and mcp_id in servers:
                servers.pop(mcp_id)
                mcp["servers"] = servers
                existing[root_key] = mcp
    else:
        section = existing.get(root_key)
        if isinstance(section, dict) and mcp_id in section:
            section.pop(mcp_id)
            if section:
                existing[root_key] = section
            else:
                existing.pop(root_key, None)
    _write_config(target, existing)


def _list_claude_mcp(profile_name: str) -> List[Dict[str, Any]]:
    target = config.profile_dir(profile_name) / "dot-claude.json"
    if not target.is_file():
        return []
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []
    servers = data.get("mcpServers") if isinstance(data, dict) else None
    if not isinstance(servers, dict):
        return []
    return [_mcp_summary(mcp_id, s) for mcp_id, s in servers.items()]


def _list_codex_mcp(profile_name: str) -> List[Dict[str, Any]]:
    target = config.profile_agent_dir(profile_name, "codex") / "config.toml"
    existing = read_toml(target)
    mcp_section = existing.get("mcp_servers")
    if not isinstance(mcp_section, dict):
        return []
    return [_mcp_summary(mcp_id, s) for mcp_id, s in mcp_section.items()]


def _list_hermes_mcp(profile_name: str) -> List[Dict[str, Any]]:
    target = config.profile_agent_dir(profile_name, "hermes") / "config.yaml"
    existing = read_yaml(target)
    servers = existing.get("mcp_servers") if isinstance(existing, dict) else None
    if not isinstance(servers, dict):
        return []
    return [_mcp_summary(mcp_id, s) for mcp_id, s in servers.items()]


def _list_opencode_mcp(profile_name: str) -> List[Dict[str, Any]]:
    target = config.profile_agent_dir(profile_name, "opencode") / "opencode.jsonc"
    existing = read_jsonc(target)
    mcp = existing.get("mcp") if isinstance(existing, dict) else None
    if not isinstance(mcp, dict):
        return []
    servers = mcp.get("servers")
    if not isinstance(servers, dict):
        return []
    return [_mcp_summary(mcp_id, s) for mcp_id, s in servers.items()]


def _mcp_summary(mcp_id: str, server_cfg: Dict[str, Any]) -> Dict[str, Any]:
    typ = server_cfg.get("type", "")
    if typ == "local":
        typ = "stdio"
    elif typ == "remote":
        typ = "http" if isinstance(server_cfg.get("url"), str) and server_cfg["url"] else "sse"
    cmd = server_cfg.get("command")
    args = server_cfg.get("args")
    if isinstance(cmd, list):
        args = cmd[1:] if len(cmd) > 1 else []
        cmd = cmd[0] if cmd else ""
    return {
        "id": mcp_id, "name": mcp_id, "type": typ or "stdio",
        "command": cmd if isinstance(cmd, str) else "",
        "args": args if isinstance(args, list) else [],
        "url": server_cfg.get("url", ""),
        "raw": server_cfg,
    }


