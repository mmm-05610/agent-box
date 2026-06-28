"""MCP server CRUD + apply — operates on the ``mcp_servers`` and
``mcp_server_agents`` tables.

The ``server_config`` column stores the raw JSON the user pipes in
(via stdin for ``upsert``) — a top-level object with a ``type`` key
(``"stdio"`` / ``"sse"`` / ``"http"``). Apply writes per-agent:

  * Claude   → ``profiles/<name>/dot-claude/claude.json``  ``mcpServers``
  * Codex    → ``profiles/<name>/dot-codex/config.toml``   ``[mcp_servers.<id>]``
  * Hermes   → ``profiles/<name>/dot-hermes/config.yaml``  ``mcp_servers``
  * OpenCode → ``profiles/<name>/dot-opencode/opencode.jsonc`` ``mcp.servers``
               (with unified → OpenCode format conversion:
                stdio→local, sse/http→remote)

Agent association is stored in the join table ``mcp_server_agents``
(replaces cc-switch's per-agent ``enabled_*`` columns). The
``agents`` subcommand toggles rows there.
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import config
from .profile import ProfileError, load_meta


# --- list / get -----------------------------------------------------------

def list_mcp_servers(agent_type: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return one entry per MCP server, optionally filtered by agent_type.

    When *agent_type* is given, only servers with a row in
    ``mcp_server_agents`` for that type are returned.
    """
    from . import db
    conn = db.get_conn()
    if agent_type is None:
        rows = conn.execute(
            "SELECT id, name, description, homepage, docs, tags "
            "FROM mcp_servers ORDER BY name, id"
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT s.id, s.name, s.description, s.homepage, s.docs, s.tags "
            "FROM mcp_servers s "
            "INNER JOIN mcp_server_agents a ON a.mcp_server_id = s.id "
            "WHERE a.agent_type = ? "
            "ORDER BY s.name, s.id",
            (agent_type,),
        ).fetchall()
    return [_row_to_summary(r) for r in rows]


def get_mcp_server(server_id: str) -> Optional[Dict[str, Any]]:
    """Return the full MCP server row + agent_types, or ``None`` if missing."""
    from . import db
    conn = db.get_conn()
    row = conn.execute(
        "SELECT id, name, server_config, description, homepage, docs, tags "
        "FROM mcp_servers WHERE id = ?",
        (server_id,),
    ).fetchone()
    if row is None:
        return None
    result = dict(row)
    try:
        result["server_config_parsed"] = json.loads(result.get("server_config") or "{}")
    except json.JSONDecodeError:
        result["server_config_parsed"] = {}
    try:
        result["tags_parsed"] = json.loads(result.get("tags") or "[]")
    except json.JSONDecodeError:
        result["tags_parsed"] = []
    # Resolve agent_types from join table
    agent_rows = conn.execute(
        "SELECT agent_type FROM mcp_server_agents WHERE mcp_server_id = ? ORDER BY agent_type",
        (server_id,),
    ).fetchall()
    result["agent_types"] = [r["agent_type"] for r in agent_rows]
    return result


def _row_to_summary(row: Any) -> Dict[str, Any]:
    """Build the compact dict returned by :func:`list_mcp_servers`."""
    out: Dict[str, Any] = {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"] or "",
        "homepage": row["homepage"] or "",
        "docs": row["docs"] or "",
    }
    try:
        out["tags"] = json.loads(row["tags"] or "[]")
    except json.JSONDecodeError:
        out["tags"] = []
    return out


# --- upsert / delete ------------------------------------------------------

def upsert_mcp_server(server_id: str, data_json: str) -> Dict[str, Any]:
    """Insert or update an MCP server, bypassing ``$EDITOR``.

    *data_json* is a JSON string with shape::

        {
          "name": "Filesystem",
          "server_config": { "type": "stdio", "command": "npx", ... },
          "description": "...",
          "homepage": "...",
          "docs": "...",
          "tags": ["filesystem"]
        }

    ``server_config`` is required and must be an object with a string
    ``type`` (``"stdio"`` / ``"sse"`` / ``"http"``). Stdio entries
    require a non-empty ``command``. ``tags`` defaults to ``[]``.

    On insert, the ``mcp_server_agents`` table is left untouched
    (use ``agents`` subcommand to manage associations).
    """
    try:
        data = json.loads(data_json)
    except json.JSONDecodeError as exc:
        raise ProfileError(
            f"mcp-server data is not valid JSON: {exc}"
        ) from exc
    if not isinstance(data, dict):
        raise ProfileError(
            f"mcp-server data must be a JSON object, got {type(data).__name__}"
        )

    name = data.get("name") or server_id
    if not isinstance(name, str) or not name.strip():
        raise ProfileError("mcp-server 'name' must be a non-empty string")

    server_config = data.get("server_config")
    if not isinstance(server_config, dict):
        raise ProfileError("mcp-server 'server_config' is required and must be a JSON object")
    _validate_server_config(server_config)

    description = data.get("description") or ""
    homepage = data.get("homepage") or ""
    docs = data.get("docs") or ""
    tags = data.get("tags") or []
    if not isinstance(tags, list):
        raise ProfileError("mcp-server 'tags' must be a list of strings")
    tags = [str(t) for t in tags]

    server_config_str = json.dumps(server_config, ensure_ascii=False)
    tags_str = json.dumps(tags, ensure_ascii=False)

    from . import db
    conn = db.get_conn()
    conn.execute(
        "INSERT OR REPLACE INTO mcp_servers "
        "(id, name, server_config, description, homepage, docs, tags) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (server_id, name, server_config_str, description, homepage, docs, tags_str),
    )
    conn.commit()

    result = get_mcp_server(server_id)
    assert result is not None  # just wrote it
    return result


def _validate_server_config(server_config: Dict[str, Any]) -> None:
    """Validate the unified MCP server_config shape."""
    typ = server_config.get("type")
    if typ not in ("stdio", "sse", "http"):
        raise ProfileError(
            f"mcp-server_config.type must be 'stdio', 'sse', or 'http' (got {typ!r})"
        )
    if typ == "stdio":
        cmd = server_config.get("command")
        if not isinstance(cmd, str) or not cmd:
            raise ProfileError(
                "mcp-server_config of type 'stdio' requires a non-empty 'command'"
            )
    else:  # sse / http
        url = server_config.get("url")
        if not isinstance(url, str) or not url:
            raise ProfileError(
                f"mcp-server_config of type {typ!r} requires a non-empty 'url'"
            )


def delete_mcp_server(server_id: str) -> bool:
    """Delete an MCP server (CASCADE removes agent associations)."""
    from . import db
    conn = db.get_conn()
    cur = conn.execute(
        "DELETE FROM mcp_servers WHERE id = ?",
        (server_id,),
    )
    conn.commit()
    return cur.rowcount > 0


# --- agent association ----------------------------------------------------

def set_mcp_agent(server_id: str, agent_type: str, enabled: bool) -> None:
    """Enable or disable an MCP server for *agent_type*.

    The server must exist (FK from mcp_server_agents). Enabling when
    already enabled / disabling when already absent is a no-op.
    """
    from . import db
    from . import library
    if agent_type not in library.get_agent_types():
        raise ProfileError(
            f"unknown agent_type {agent_type!r}. "
            f"Valid: {', '.join(library.get_agent_types())}"
        )
    conn = db.get_conn()
    exists = conn.execute(
        "SELECT 1 FROM mcp_servers WHERE id = ?",
        (server_id,),
    ).fetchone()
    if exists is None:
        raise ProfileError(f"mcp-server {server_id!r} not found")
    if enabled:
        conn.execute(
            "INSERT OR IGNORE INTO mcp_server_agents (mcp_server_id, agent_type) "
            "VALUES (?, ?)",
            (server_id, agent_type),
        )
    else:
        conn.execute(
            "DELETE FROM mcp_server_agents WHERE mcp_server_id = ? AND agent_type = ?",
            (server_id, agent_type),
        )
    conn.commit()


def get_mcp_agents(server_id: str) -> List[str]:
    """Return the list of agent_types enabled for *server_id* (sorted)."""
    from . import db
    conn = db.get_conn()
    rows = conn.execute(
        "SELECT agent_type FROM mcp_server_agents WHERE mcp_server_id = ? "
        "ORDER BY agent_type",
        (server_id,),
    ).fetchall()
    return [r["agent_type"] for r in rows]


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

    server = get_mcp_server(server_id)
    if server is None:
        raise ProfileError(f"mcp-server {server_id!r} not found")

    enabled_agents = set(server.get("agent_types") or [])
    if profile_agent_type not in enabled_agents:
        raise ProfileError(
            f"mcp-server {server_id!r} is not enabled for agent_type "
            f"{profile_agent_type!r}. Use: agent-box mcp-server agents "
            f"{server_id} --enable {profile_agent_type}"
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
    from ._io import atomic_write_json
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
    existing = _read_toml(target)
    mcp_section = existing.get("mcp_servers")
    if not isinstance(mcp_section, dict):
        mcp_section = {}
    mcp_section[server_id] = _codex_entry(server_config)
    existing["mcp_servers"] = mcp_section
    _write_toml(target, existing)


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
    _write_yaml(target, existing)


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
            existing = _read_jsonc(text)
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
    from ._io import atomic_write_json
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


# --- TOML helpers ---------------------------------------------------------

def _read_toml(path: Path) -> Dict[str, Any]:
    """Read a TOML file into a dict. Returns empty dict if missing/empty."""
    if not path.is_file():
        return {}
    try:
        import tomllib  # Python 3.11+
    except ImportError:  # pragma: no cover — 3.11+ is the supported target
        import tomli as tomllib  # type: ignore[no-redef]
    with open(path, "rb") as fh:
        return tomllib.load(fh) or {}


def _write_toml(path: Path, data: Dict[str, Any]) -> None:
    """Write a dict to TOML. Codex config is small enough that a simple
    hand-rolled serializer is preferable to a third-party dep.

    Walks the structure recursively, emitting ``[a]`` / ``[a.b]`` /
    ``[a.b.c]`` table headers. Top-level scalars come first, then
    tables in declaration order, with sub-tables emitted after their
    parent's scalar fields.
    """
    lines: List[str] = []
    top_scalars: Dict[str, Any] = {}
    top_tables: Dict[str, Dict[str, Any]] = {}
    for k, v in data.items():
        if isinstance(v, dict):
            top_tables[str(k)] = v
        else:
            top_scalars[str(k)] = v
    for k, v in top_scalars.items():
        lines.append(f"{k} = {_toml_scalar(v)}")
    if top_scalars and top_tables:
        lines.append("")
    for name, value in top_tables.items():
        if lines and lines[-1] != "":
            lines.append("")
        _emit_toml_table(lines, [name], value)
    text = "\n".join(lines).rstrip("\n") + "\n"
    from ._io import atomic_write_text
    atomic_write_text(path, text)


def _emit_toml_table(lines: List[str], path_parts: List[str],
                     value: Dict[str, Any]) -> None:
    """Emit a ``[a.b.c]`` header followed by its scalar fields, then recurse
    into nested dicts as sub-tables.
    """
    lines.append(f"[{'.'.join(path_parts)}]")
    sub_scalars: Dict[str, Any] = {}
    sub_tables: Dict[str, Dict[str, Any]] = {}
    for k, v in value.items():
        if isinstance(v, dict):
            sub_tables[str(k)] = v
        else:
            sub_scalars[str(k)] = v
    for k, v in sub_scalars.items():
        lines.append(f"{k} = {_toml_scalar(v)}")
    for sub_name, sub_value in sub_tables.items():
        lines.append("")
        _emit_toml_table(lines, path_parts + [sub_name], sub_value)


def _toml_scalar(v: Any) -> str:
    """Serialize a Python scalar/list/dict value to a TOML literal."""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return repr(v)
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)  # TOML strings ≈ JSON strings
    if isinstance(v, list):
        return "[" + ", ".join(_toml_scalar(x) for x in v) + "]"
    if isinstance(v, dict):
        items = ", ".join(f"{k} = {_toml_scalar(val)}" for k, val in v.items())
        return "{" + items + "}"
    raise ProfileError(f"unsupported TOML value type: {type(v).__name__}")


# --- YAML helpers ---------------------------------------------------------

def _write_yaml(path: Path, data: Dict[str, Any]) -> None:
    """Write a dict to YAML (requires PyYAML)."""
    try:
        import yaml
    except ImportError as exc:
        raise ProfileError(
            "PyYAML is required to write Hermes config.yaml "
            "(install with: pip install pyyaml)"
        ) from exc
    from ._io import atomic_write_text
    text = yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
    atomic_write_text(path, text)


# --- JSONC helpers --------------------------------------------------------

def _read_jsonc(text: str) -> Dict[str, Any]:
    """Parse a JSONC string (// line comments, /* block comments */,
    trailing commas).

    Strips comments and trailing commas before json.loads. Doesn't
    preserve comments on write (output is plain JSON), but the user
    can re-add them.
    """
    cleaned: List[str] = []
    i = 0
    in_string = False
    string_quote = ""
    while i < len(text):
        c = text[i]
        if in_string:
            cleaned.append(c)
            if c == "\\" and i + 1 < len(text):
                cleaned.append(text[i + 1])
                i += 2
                continue
            if c == string_quote:
                in_string = False
            i += 1
            continue
        # Outside a string: look for comment starts
        if c == "/" and i + 1 < len(text):
            nxt = text[i + 1]
            if nxt == "/":
                # Line comment — skip to EOL
                while i < len(text) and text[i] != "\n":
                    i += 1
                continue
            if nxt == "*":
                # Block comment — skip to */
                i += 2
                while i + 1 < len(text) and not (text[i] == "*" and text[i + 1] == "/"):
                    i += 1
                i += 2
                continue
        if c in ('"', "'"):
            in_string = True
            string_quote = c
        cleaned.append(c)
        i += 1
    raw = "".join(cleaned)
    # Strip trailing commas: ", ]" → " ]" and ", }" → " }" (but
    # not inside strings — already handled by the in_string state above).
    import re
    raw = re.sub(r",(\s*[}\]])", r"\1", raw)
    return json.loads(raw)


__all__ = [
    "apply_mcp_server",
    "delete_mcp_server",
    "get_mcp_agents",
    "get_mcp_server",
    "list_mcp_servers",
    "set_mcp_agent",
    "upsert_mcp_server",
]
