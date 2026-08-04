"""MCP apply — write MCP server configs to profile agent config files.

Supports Claude (dot-claude.json), Codex (config.toml), Hermes (config.yaml),
and OpenCode (opencode.jsonc) with format conversion.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from ... import config
from .._shared import resolve_profile
from ..profile import ProfileError
from ...adapters import acs as _acs
from ...core.io import read_config, write_config
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
    mcp_config = (agent_config.get("resources") or {}).get("mcp")
    if not isinstance(mcp_config, dict):
        raise ProfileError(f"mcp config is not supported for {agent_type!r}")
    if mcp_config.get("at_profile_root"):
        base = config.profile_dir(profile_name)
    else:
        base = config.profile_agent_dir(profile_name, agent_type)
    return base / mcp_config["config_file"], mcp_config["root_key"]


def _mcp_servers_dict(existing: Dict[str, Any], agent_type: str,
                      mcp_config: Dict[str, Any]) -> tuple[Dict[str, Any], str]:
    """Return ``(servers_dict, sub_key)`` for the given MCP config section.

    For most types *sub_key* is the same as *mcp_config["root_key"]*.
    For OpenCode it's ``mcp_config["servers_key"]`` (one level deeper).
    """
    section = existing.get(mcp_config["root_key"])
    if not isinstance(section, dict):
        return {}, mcp_config["root_key"]
    sub_key = mcp_config.get("servers_key")
    if sub_key:
        servers = section.get(sub_key)
        if not isinstance(servers, dict):
            servers = {}
        return servers, sub_key
    return section, mcp_config["root_key"]


def _write_mcp(profile_name: str, agent_type: str,
                  server_id: str, server_config: Dict[str, Any]) -> None:
    """Merge *server_config* into the MCP section of the profile's config.

    The target file, root key, and optional sub-key are resolved from
    the agent-type registry — no per-agent branching.
    """
    if "type" not in server_config:
        raise ProfileError(
            f"mcp-server {server_id!r}: server_config is missing 'type'"
        )
    target, root_key = _mcp_target(profile_name, agent_type)
    existing = read_config(target)
    mcp_config = get_agent_config(agent_type).get("resources", {}).get("mcp") or {}

    servers, _ = _mcp_servers_dict(existing, agent_type, mcp_config)
    fmt = mcp_config.get("entry_format", "default")
    if fmt == "passthrough":
        entry = server_config
    elif fmt == "structured":
        entry = _convert_entry(server_config, structured=True)
    else:
        entry = _convert_entry(server_config)
    servers[server_id] = entry

    if mcp_config.get("servers_key"):
        existing.setdefault(root_key, {})[mcp_config["servers_key"]] = servers
    else:
        existing[root_key] = servers
    write_config(target, existing)


def _convert_entry(server_config: Dict[str, Any],
                   structured: bool = False) -> Dict[str, Any]:
    """Convert ACS unified MCP format to a per-server entry.

    When *structured* is True, uses ``local``/``remote`` type names
    and nests ``command`` as a list (the format expected by config
    files whose ``entry_format`` is ``"structured"``).  Otherwise a
    flat format with ``command``/``args``/``env`` keys is used.
    """
    typ = server_config.get("type")
    entry: Dict[str, Any] = {}

    if typ == "stdio":
        if structured:
            entry["type"] = "local"
            cmd = server_config.get("command", "")
            args = server_config.get("args") or []
            if not isinstance(args, list):
                args = [str(args)]
            entry["command"] = [str(cmd), *[str(a) for a in args]]
            env = server_config.get("env")
            if isinstance(env, dict) and env:
                entry["environment"] = {str(k): str(v) for k, v in env.items()}
        else:
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
        if structured:
            entry["type"] = "remote"
        entry["url"] = server_config.get("url", "")
        headers = server_config.get("headers")
        if isinstance(headers, dict) and headers:
            entry["headers"] = {str(k): str(v) for k, v in headers.items()}
    return entry



def _mcp_summary(server_id: str, entry: Dict[str, Any]) -> Dict[str, Any]:
    """Build the frontend-facing ProfileMcp summary for an installed server.

    ``entry`` is the converted per-server config block; the summary flattens
    the command list (``command`` + ``args``) and keeps the raw block for the
    detail viewer.
    """
    name = entry.get("name") or server_id
    summary: Dict[str, Any] = {"id": server_id, "name": name, "raw": entry}
    typ = entry.get("type")
    if typ:
        summary["type"] = typ
    command = entry.get("command")
    if isinstance(command, str):
        summary["command"] = command
    elif isinstance(command, list) and command:
        summary["command"] = str(command[0])
        summary["args"] = [str(a) for a in command[1:]]
    if entry.get("url"):
        summary["url"] = entry["url"]
    return summary


def list_profile_mcp_servers(profile_name: str) -> List[Dict[str, Any]]:
    """Read installed MCP servers from a profile's config file."""
    meta, agent_config = resolve_profile(profile_name)
    mcp_config = (agent_config.get("resources") or {}).get("mcp") or {}
    target, _ = _mcp_target(profile_name, meta["agent_type"])
    existing = read_config(target)
    servers, _ = _mcp_servers_dict(existing, meta["agent_type"], mcp_config)
    return [_mcp_summary(sid, s) for sid, s in servers.items()] if servers else []


def remove_mcp_from_profile(profile_name: str, mcp_id: str) -> None:
    """Remove an MCP server from a profile's config file."""
    meta, agent_config = resolve_profile(profile_name)
    mcp_config = (agent_config.get("resources") or {}).get("mcp") or {}
    target, root_key = _mcp_target(profile_name, meta["agent_type"])
    existing = read_config(target) if target.is_file() else {}
    servers, sub_key = _mcp_servers_dict(existing, meta["agent_type"], mcp_config)
    if mcp_id not in servers:
        return
    servers.pop(mcp_id)
    if sub_key != root_key:
        existing.setdefault(root_key, {})[sub_key] = servers
    elif servers:
        existing[root_key] = servers
    else:
        existing.pop(root_key, None)
    write_config(target, existing)
