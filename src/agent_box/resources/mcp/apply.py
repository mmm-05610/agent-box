"""MCP apply — write MCP server configs to profile agent config files.

Supports Claude (dot-claude.json), Codex (config.toml), Hermes (config.yaml),
and OpenCode (opencode.jsonc) with format conversion.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from ... import config
from ..profile import ProfileError, load_meta
from ... import ccswitch_adapter as _acs
from ...core.io import read_jsonc, read_toml, write_toml, write_yaml


# --- apply ----------------------------------------------------------------

# Per-agent MCP file locations. For Claude, the MCP servers live in
# ``dot-claude.json`` at the profile root (bind-mounted to
# ``~/.claude.json``) — NOT in ``dot-claude/claude.json``. The file
# is dual-purpose: CC stores app state there, so we must merge
# ``mcpServers`` without touching those fields.
_AGENT_PATHS: Dict[str, Dict[str, str]] = {
    # claude is special — handled in _apply_claude() via profile_dir(), not
    # profile_agent_dir(). Included here for reference only.
    "codex":    {"filename": "config.toml",   "root_key": "mcp_servers"},
    "hermes":   {"filename": "config.yaml",   "root_key": "mcp_servers"},
    "opencode": {"filename": "opencode.jsonc", "root_key": "mcp"},
}


def apply_mcp_server(profile_name: str, server_id: str) -> None:
    """Write an MCP server's config to a profile's per-agent file.

    Steps:
      1. load_meta → resolve the profile's agent_type
      2. fetch the server row + its enabled agent_types
      3. for the profile's agent_type: dispatch to the per-agent writer
         (with format conversion for OpenCode)
    """
    meta = load_meta(profile_name)
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

    if profile_agent_type == "claude":
        _apply_claude(profile_name, server_id, server_config)
    elif profile_agent_type == "codex":
        _apply_codex(profile_name, server_id, server_config)
    elif profile_agent_type == "hermes":
        _apply_hermes(profile_name, server_id, server_config)
    elif profile_agent_type == "opencode":
        _apply_opencode(profile_name, server_id, server_config)
    else:
        raise ProfileError(
            f"mcp-server apply is not yet supported for agent_type "
            f"{profile_agent_type!r}"
        )


def _apply_claude(profile_name: str, server_id: str,
                  server_config: Dict[str, Any]) -> None:
    """Merge this server into ``dot-claude.json::mcpServers``.

    ``dot-claude.json`` is at the profile root (bind-mounted to
    ``~/.claude.json``). CC stores its own state in this file
    (firstStartTime, userID, machineID, projects, …), so we must
    only touch the ``mcpServers`` key and leave everything else
    untouched.
    """
    target = config.profile_dir(profile_name) / "dot-claude.json"
    existing: Dict[str, Any] = {}
    if target.is_file():
        try:
            existing = json.loads(target.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ProfileError(
                f"{profile_name}: dot-claude.json is not valid JSON: {exc}"
            ) from exc
        if not isinstance(existing, dict):
            existing = {}
    servers = existing.get("mcpServers")
    if not isinstance(servers, dict):
        servers = {}
    # Reject unknown types early (defense in depth — upsert already validated).
    if "type" not in server_config:
        raise ProfileError(
            f"mcp-server {server_id!r}: server_config is missing 'type'"
        )
    servers[server_id] = server_config
    existing["mcpServers"] = servers
    from ...core.io import atomic_write_json
    atomic_write_json(target, existing)


def _apply_codex(profile_name: str, server_id: str,
                 server_config: Dict[str, Any]) -> None:
    """Merge this server into ``config.toml`` under ``[mcp_servers.<id>]``.

    Uses ``tomllib`` for reading (Python 3.11+ stdlib; 3.9/3.10 need
    ``tomli``, which is the standard pattern). Writes a minimal TOML
    representation — Codex accepts a flat ``command``/``args``/``env``
    table for stdio and ``url``/``headers`` for sse/http.
    """
    target = config.profile_agent_dir(profile_name, "codex") / "config.toml"
    existing = read_toml(target)
    mcp_section = existing.get("mcp_servers")
    if not isinstance(mcp_section, dict):
        mcp_section = {}
    mcp_section[server_id] = _codex_entry(server_config)
    existing["mcp_servers"] = mcp_section
    write_toml(target, existing)


def _codex_entry(server_config: Dict[str, Any]) -> Dict[str, Any]:
    """Translate unified format → Codex TOML shape."""
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
    else:  # sse / http
        entry["url"] = server_config.get("url", "")
        headers = server_config.get("headers")
        if isinstance(headers, dict) and headers:
            entry["headers"] = {str(k): str(v) for k, v in headers.items()}
    return entry


def _apply_hermes(profile_name: str, server_id: str,
                  server_config: Dict[str, Any]) -> None:
    """Merge this server into ``config.yaml::mcp_servers`` (no ``type`` field).

    Hermes infers the transport from presence of ``command`` (stdio)
    or ``url`` (sse/http). We strip the unified ``type`` key.
    """
    target = config.profile_agent_dir(profile_name, "hermes") / "config.yaml"
    existing: Dict[str, Any] = {}
    if target.is_file():
        try:
            import yaml
        except ImportError as exc:
            raise ProfileError(
                "PyYAML is required to read/write Hermes config.yaml "
                "(install with: pip install pyyaml)"
            ) from exc
        try:
            existing = yaml.safe_load(target.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError as exc:
            raise ProfileError(
                f"{profile_name}: config.yaml is not valid YAML: {exc}"
            ) from exc
        if not isinstance(existing, dict):
            existing = {}
    mcp_section = existing.get("mcp_servers")
    if not isinstance(mcp_section, dict):
        mcp_section = {}
    entry = {k: v for k, v in server_config.items() if k != "type"}
    mcp_section[server_id] = entry
    existing["mcp_servers"] = mcp_section
    write_yaml(target, existing)


def _apply_opencode(profile_name: str, server_id: str,
                    server_config: Dict[str, Any]) -> None:
    """Merge this server into ``opencode.jsonc::mcp.servers`` after conversion.

    Unified → OpenCode conversion:
      * stdio → local (command+args → command array, env → environment)
      * sse/http → remote (url + headers preserved)
    """
    target = config.profile_agent_dir(profile_name, "opencode") / "opencode.jsonc"
    existing: Dict[str, Any] = {}
    if target.is_file():
        text = target.read_text(encoding="utf-8")
        try:
            existing = read_jsonc(text)
        except json.JSONDecodeError as exc:
            raise ProfileError(
                f"{profile_name}: opencode.jsonc is not valid JSON: {exc}"
            ) from exc
        if not isinstance(existing, dict):
            existing = {}
    mcp_section = existing.get("mcp")
    if not isinstance(mcp_section, dict):
        mcp_section = {}
    servers = mcp_section.get("servers")
    if not isinstance(servers, dict):
        servers = {}
    servers[server_id] = _to_opencode_format(server_config)
    mcp_section["servers"] = servers
    existing["mcp"] = mcp_section
    from ...core.io import atomic_write_json
    atomic_write_json(target, existing)


def _to_opencode_format(server_config: Dict[str, Any]) -> Dict[str, Any]:
    """Convert unified MCP spec → OpenCode ``mcp.servers`` entry."""
    typ = server_config.get("type")
    out: Dict[str, Any] = {}
    if typ == "stdio":
        out["type"] = "local"
        cmd = server_config.get("command", "")
        args = server_config.get("args") or []
        if not isinstance(args, list):
            args = [str(args)]
        out["command"] = [str(cmd), *[str(a) for a in args]]
        env = server_config.get("env")
        if isinstance(env, dict) and env:
            out["environment"] = {str(k): str(v) for k, v in env.items()}
    elif typ in ("sse", "http"):
        out["type"] = "remote"
        if "url" in server_config:
            out["url"] = server_config["url"]
        headers = server_config.get("headers")
        if isinstance(headers, dict) and headers:
            out["headers"] = {str(k): str(v) for k, v in headers.items()}
    else:
        raise ProfileError(
            f"opencode apply: unknown MCP type {typ!r}"
        )
    out["enabled"] = True
    return out


def list_profile_mcp_servers(profile_name: str) -> List[Dict[str, Any]]:
    """Read a profile's agent config file and return its installed MCP servers.

    Returns ``[{id, name, type, command, args, url, raw}]``.
    """
    meta = load_meta(profile_name)
    at = meta["agent_type"]

    if at == "claude":
        return _list_claude_mcp(profile_name)
    elif at == "codex":
        return _list_codex_mcp(profile_name)
    elif at == "hermes":
        return _list_hermes_mcp(profile_name)
    elif at == "opencode":
        return _list_opencode_mcp(profile_name)
    raise ProfileError(f"list mcp not supported for {at!r}")


def remove_mcp_from_profile(profile_name: str, mcp_id: str) -> None:
    """Remove an MCP server entry from a profile's agent config file."""
    meta = load_meta(profile_name)
    at = meta["agent_type"]

    if at == "claude":
        _remove_claude_mcp(profile_name, mcp_id)
    elif at == "codex":
        _remove_codex_mcp(profile_name, mcp_id)
    elif at == "hermes":
        _remove_hermes_mcp(profile_name, mcp_id)
    elif at == "opencode":
        _remove_opencode_mcp(profile_name, mcp_id)
    else:
        raise ProfileError(f"remove mcp not supported for {at!r}")


# ── list_profile_mcp_servers helpers ──────────────────────────────────────

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
    return [_mcp_entry(mcp_id, s) for mcp_id, s in servers.items()]


def _list_codex_mcp(profile_name: str) -> List[Dict[str, Any]]:
    target = config.profile_agent_dir(profile_name, "codex") / "config.toml"
    existing = read_toml(target)
    mcp_section = existing.get("mcp_servers")
    if not isinstance(mcp_section, dict):
        return []
    return [_mcp_entry(mcp_id, s) for mcp_id, s in mcp_section.items()]


def _list_hermes_mcp(profile_name: str) -> List[Dict[str, Any]]:
    target = config.profile_agent_dir(profile_name, "hermes") / "config.yaml"
    if not target.is_file():
        return []
    try:
        import yaml
    except ImportError:
        return []
    try:
        data = yaml.safe_load(target.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError:
        return []
    if not isinstance(data, dict):
        return []
    servers = data.get("mcp_servers")
    if not isinstance(servers, dict):
        return []
    return [_mcp_entry(mcp_id, s) for mcp_id, s in servers.items()]


def _list_opencode_mcp(profile_name: str) -> List[Dict[str, Any]]:
    target = config.profile_agent_dir(profile_name, "opencode") / "opencode.jsonc"
    if not target.is_file():
        return []
    try:
        data = read_jsonc(target.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []
    if not isinstance(data, dict):
        return []
    mcp = data.get("mcp")
    if not isinstance(mcp, dict):
        return []
    servers = mcp.get("servers")
    if not isinstance(servers, dict):
        return []
    return [_mcp_entry(mcp_id, s) for mcp_id, s in servers.items()]


def _mcp_entry(mcp_id: str, server_cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Build a standardized MCP entry dict from a raw server config."""
    typ = server_cfg.get("type", "")
    # Normalize OpenCode types (local→stdio, remote→sse/http based on url)
    if typ == "local":
        typ = "stdio"
    elif typ == "remote":
        exists_url = isinstance(server_cfg.get("url"), str) and server_cfg["url"]
        typ = "http" if exists_url else "sse"
    cmd = server_cfg.get("command")
    args = server_cfg.get("args")
    # OpenCode stores command as [cmd, ...args]
    if isinstance(cmd, list):
        args = cmd[1:] if len(cmd) > 1 else []
        cmd = cmd[0] if cmd else ""
    return {
        "id": mcp_id,
        "name": mcp_id,
        "type": typ or "stdio",
        "command": cmd if isinstance(cmd, str) else "",
        "args": args if isinstance(args, list) else [],
        "url": server_cfg.get("url", ""),
        "raw": server_cfg,
    }


# ── remove_mcp_from_profile helpers ───────────────────────────────────────

def _remove_claude_mcp(profile_name: str, mcp_id: str) -> None:
    target = config.profile_dir(profile_name) / "dot-claude.json"
    data: Dict[str, Any] = {}
    if target.is_file():
        try:
            data = json.loads(target.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            data = {}
    if not isinstance(data, dict):
        data = {}
    servers = data.get("mcpServers")
    if isinstance(servers, dict):
        servers.pop(mcp_id, None)
        data["mcpServers"] = servers
    from ...core.io import atomic_write_json
    atomic_write_json(target, data)


def _remove_codex_mcp(profile_name: str, mcp_id: str) -> None:
    target = config.profile_agent_dir(profile_name, "codex") / "config.toml"
    existing = read_toml(target)
    mcp_section = existing.get("mcp_servers")
    if isinstance(mcp_section, dict):
        mcp_section.pop(mcp_id, None)
        if mcp_section:
            existing["mcp_servers"] = mcp_section
        else:
            existing.pop("mcp_servers", None)
    write_toml(target, existing)


def _remove_hermes_mcp(profile_name: str, mcp_id: str) -> None:
    target = config.profile_agent_dir(profile_name, "hermes") / "config.yaml"
    data: Dict[str, Any] = {}
    if target.is_file():
        try:
            import yaml
        except ImportError as exc:
            raise ProfileError("PyYAML is required") from exc
        try:
            data = yaml.safe_load(target.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError:
            data = {}
    if not isinstance(data, dict):
        data = {}
    servers = data.get("mcp_servers")
    if isinstance(servers, dict):
        servers.pop(mcp_id, None)
        if servers:
            data["mcp_servers"] = servers
        else:
            data.pop("mcp_servers", None)
    write_yaml(target, data)


def _remove_opencode_mcp(profile_name: str, mcp_id: str) -> None:
    target = config.profile_agent_dir(profile_name, "opencode") / "opencode.jsonc"
    data: Dict[str, Any] = {}
    if target.is_file():
        try:
            data = read_jsonc(target.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            data = {}
    if not isinstance(data, dict):
        data = {}
    mcp = data.get("mcp")
    if isinstance(mcp, dict):
        servers = mcp.get("servers")
        if isinstance(servers, dict):
            servers.pop(mcp_id, None)
            mcp["servers"] = servers
            data["mcp"] = mcp
    from ...core.io import atomic_write_json
    atomic_write_json(target, data)


__all__ = [
    "apply_mcp_server",
    "list_profile_mcp_servers",
    "remove_mcp_from_profile",
]
