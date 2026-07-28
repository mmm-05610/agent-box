"""Provider CRUD + apply — operates on the ``providers`` table.

The ``settings_config`` column stores the raw JSON the user edits in
``$EDITOR`` (the same shape cc-switch uses — a top-level object with
``name`` / ``description`` / ``env`` keys). Apply extracts only the
``env`` block and merges it into the profile's ``settings.json``
under the ``env`` key, preserving every other settings key.

Only Claude Code (``agent_type == "claude"``) supports apply in v1;
other agent types raise :class:`ProfileError` with a "not yet
supported" message (cc-switch parity).
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List

from ... import config
from ...core.io import atomic_write_json, deep_merge
from ...profile import ProfileError, load_meta




def _infer_category(settings: Dict[str, Any]) -> str:
    """Infer provider category from *settings* by scanning for URLs.

    1. Explicit ``category`` key in settings → manual override.
    2. Scan all string values for URLs → match domain.
    """
    # 1. Manual override
    manual = settings.get("category")
    if manual and isinstance(manual, str):
        return manual.strip().lower()

    # 2. Scan all string values for URLs.
    def _scan(obj: Any) -> str:
        if isinstance(obj, str) and "://" in obj:
            name = _extract_provider_from_url(obj)
            if name:
                return name
        elif isinstance(obj, dict):
            for v in obj.values():
                r = _scan(v)
                if r:
                    return r
        return ""

    return _scan(settings)


def _extract_provider_from_url(url: str) -> str:
    """Extract provider name from URL domain. Returns ``""`` if unknown."""
    if not url:
        return ""
    url_clean = url.replace("https://", "").replace("http://", "")
    domain = url_clean.split("/")[0].lower()
    known = [
        ("minimaxi", "minimax"), ("xiaomimimo", "xiaomimimo"),
        ("openrouter", "openrouter"), ("deepseek", "deepseek"),
        ("anthropic", "anthropic"), ("openai", "openai"),
        ("siliconflow", "siliconflow"), ("zhipu", "zhipu"),
        ("moonshot", "moonshot"), ("qwen", "qwen"),
        ("baichuan", "baichuan"), ("volcengine", "volcengine"),
        ("baidu", "baidu"), ("tencent", "tencent"),
        ("alibaba", "alibaba"), ("google", "google"),
        ("mistral", "mistral"), ("cohere", "cohere"),
        ("groq", "groq"), ("together", "together"),
        ("fireworks", "fireworks"), ("perplexity", "perplexity"),
    ]
    for key, name in known:
        if key in domain:
            return name
    return ""


# --- list / get -----------------------------------------------------------

def list_providers(agent_type: str) -> List[Dict[str, Any]]:
    """Return one row per provider for *agent_type* (id, name, meta, settings)."""
    from ... import db
    conn = db.get_conn()
    rows = conn.execute(
        "SELECT id, name, website_url, category, sort_index, notes, icon, "
        "is_current, in_failover_queue, created_at, meta, settings_config "
        "FROM providers WHERE app_type = ? ORDER BY sort_index, name",
        (agent_type,),
    ).fetchall()
    out: List[Dict[str, Any]] = []
    for r in rows:
        settings = {}
        try:
            settings = json.loads(r["settings_config"] or "{}")
        except json.JSONDecodeError:
            pass
        out.append({
            "id": r["id"],
            "name": r["name"],
            "category": r["category"],
            "website_url": r["website_url"],
            "is_current": bool(r["is_current"]),
            "in_failover_queue": bool(r["in_failover_queue"]),
            "settings": settings,
            "meta": json.loads(r["meta"] or "{}"),
        })
    return out


def get_provider(agent_type: str, provider_id: str) -> Dict[str, Any] | None:
    """Return the full provider row + endpoints, or ``None`` if missing."""
    from ... import db
    conn = db.get_conn()
    row = conn.execute(
        "SELECT * FROM providers WHERE id = ? AND app_type = ?",
        (provider_id, agent_type),
    ).fetchone()
    if row is None:
        return None
    endpoints = conn.execute(
        "SELECT id, url, added_at FROM provider_endpoints "
        "WHERE provider_id = ? AND app_type = ? ORDER BY id",
        (provider_id, agent_type),
    ).fetchall()
    result = dict(row)
    result["endpoints"] = [dict(e) for e in endpoints]
    # Parse the stored JSON for convenience.
    try:
        result["settings"] = json.loads(result.get("settings_config") or "{}")
    except json.JSONDecodeError:
        result["settings"] = {}
    try:
        result["meta_parsed"] = json.loads(result.get("meta") or "{}")
    except json.JSONDecodeError:
        result["meta_parsed"] = {}
    return result


# --- add / edit / delete --------------------------------------------------

def _template_settings(provider_id: str) -> Dict[str, Any]:
    """Default JSON body for a fresh provider edit session."""
    return {
        "name": provider_id,
        "description": "",
        "env": {},
    }


def _open_json_in_editor(initial: Dict[str, Any]) -> Dict[str, Any]:
    """Write *initial* to a tmp file, open $EDITOR, parse the result.

    Returns the parsed JSON dict. Raises ProfileError if the file is
    missing/unreadable or the JSON is invalid. Empty ``env``/missing
    fields default to safe values — a user can wipe the whole file and
    we keep the edit open as a no-op.
    """
    from ...edit import open_editor
    fd, tmp_path = tempfile.mkstemp(prefix="agent-box-provider-", suffix=".json")
    os.close(fd)
    tmp = Path(tmp_path)
    try:
        atomic_write_json(tmp, initial)
        open_editor(tmp)
        text = tmp.read_text(encoding="utf-8")
    finally:
        try:
            tmp.unlink()
        except OSError:
            pass
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ProfileError(
            f"provider settings file is not valid JSON: {exc}"
        ) from exc
    if not isinstance(data, dict):
        raise ProfileError(
            f"provider settings must be a JSON object, got {type(data).__name__}"
        )
    data.setdefault("name", "")
    data.setdefault("env", {})
    if not isinstance(data.get("env"), dict):
        raise ProfileError("provider settings 'env' must be an object")
    return data


def add_provider(agent_type: str, provider_id: str) -> Dict[str, Any]:
    """Add a new provider for *agent_type* with id *provider_id*.

    Opens ``$EDITOR`` with a template JSON body, validates the result,
    and INSERTs the row. Refuses if a row with the same (id, app_type)
    already exists.
    """
    from ... import db
    conn = db.get_conn()
    existing = conn.execute(
        "SELECT 1 FROM providers WHERE id = ? AND app_type = ?",
        (provider_id, agent_type),
    ).fetchone()
    if existing is not None:
        raise ProfileError(
            f"provider {provider_id!r} for agent_type {agent_type!r} already exists. "
            f"Use: agent-box provider edit {agent_type} {provider_id}"
        )
    data = _open_json_in_editor(_template_settings(provider_id))
    settings_config = json.dumps(data, ensure_ascii=False)
    now_ms = int(__import__("time").time() * 1000)
    conn.execute(
        "INSERT INTO providers "
        "(id, app_type, name, settings_config, meta, created_at, sort_index) "
        "VALUES (?, ?, ?, ?, '{}', ?, 0)",
        (provider_id, agent_type, data.get("name") or provider_id,
         settings_config, now_ms),
    )
    conn.commit()
    result = get_provider(agent_type, provider_id)
    assert result is not None  # just inserted
    return result


def upsert_provider(agent_type: str, provider_id: str, settings_json: str) -> Dict[str, Any]:
    """Insert or update a provider, bypassing ``$EDITOR``.

    *settings_json* is a JSON string. It is validated with
    :func:`json.loads` and must be an object with a dict ``env`` key.
    If *provider_id* does not exist for *agent_type*, INSERT a new
    row. Otherwise UPDATE ``settings_config`` and ``name``.

    Raises :class:`ProfileError` if *settings_json* is not valid JSON
    or the parsed value is not a dict with a dict ``env`` key.
    """
    from ... import db
    try:
        data = json.loads(settings_json)
    except json.JSONDecodeError as exc:
        raise ProfileError(
            f"provider settings is not valid JSON: {exc}"
        ) from exc
    if not isinstance(data, dict):
        raise ProfileError(
            f"provider settings must be a JSON object, got {type(data).__name__}"
        )
    data.setdefault("name", "")
    data.setdefault("env", {})
    if not isinstance(data.get("env"), dict):
        raise ProfileError("provider settings 'env' must be an object")
    settings_config = json.dumps(data, ensure_ascii=False)
    category = _infer_category(data)
    now_ms = int(__import__("time").time() * 1000)
    conn = db.get_conn()
    existing = conn.execute(
        "SELECT 1 FROM providers WHERE id = ? AND app_type = ?",
        (provider_id, agent_type),
    ).fetchone()
    if existing is None:
        conn.execute(
            "INSERT INTO providers "
            "(id, app_type, name, settings_config, category, meta, "
            "created_at, sort_index) "
            "VALUES (?, ?, ?, ?, ?, '{}', ?, 0)",
            (provider_id, agent_type, data.get("name") or provider_id,
             settings_config, category or None, now_ms),
        )
    else:
        conn.execute(
            "UPDATE providers SET settings_config = ?, name = ?, category = ? "
            "WHERE id = ? AND app_type = ?",
            (settings_config, data.get("name") or provider_id,
             category or None, provider_id, agent_type),
        )
    conn.commit()
    result = get_provider(agent_type, provider_id)
    assert result is not None  # just wrote it
    return result


def edit_provider(agent_type: str, provider_id: str) -> Dict[str, Any]:
    """Edit an existing provider's settings JSON in $EDITOR."""
    current = get_provider(agent_type, provider_id)
    if current is None:
        raise ProfileError(
            f"provider {provider_id!r} for agent_type {agent_type!r} not found"
        )
    initial = current.get("settings") or _template_settings(provider_id)
    data = _open_json_in_editor(initial)
    settings_config = json.dumps(data, ensure_ascii=False)
    category = _infer_category(data)
    from ... import db
    conn = db.get_conn()
    conn.execute(
        "UPDATE providers SET settings_config = ?, name = ?, category = ? "
        "WHERE id = ? AND app_type = ?",
        (settings_config, data.get("name") or provider_id,
         category or None, provider_id, agent_type),
    )
    conn.commit()
    result = get_provider(agent_type, provider_id)
    assert result is not None
    return result


def delete_provider(agent_type: str, provider_id: str) -> None:
    """Delete a provider (CASCADE removes its endpoints)."""
    from ... import db
    conn = db.get_conn()
    cur = conn.execute(
        "DELETE FROM providers WHERE id = ? AND app_type = ?",
        (provider_id, agent_type),
    )
    conn.commit()
    if cur.rowcount == 0:
        raise ProfileError(
            f"provider {provider_id!r} for agent_type {agent_type!r} not found"
        )

def duplicate_provider(agent_type: str, provider_id: str, new_id: str) -> Dict[str, Any]:
    """Copy an existing provider under a new id."""
    original = get_provider(agent_type, provider_id)
    if original is None:
        raise ProfileError(
            f"provider {provider_id!r} for agent_type {agent_type!r} not found"
        )
    from ... import db
    conn = db.get_conn()
    existing = conn.execute(
        "SELECT 1 FROM providers WHERE id = ? AND app_type = ?",
        (new_id, agent_type),
    ).fetchone()
    if existing is not None:
        raise ProfileError(
            f"provider {new_id!r} for agent_type {agent_type!r} already exists"
        )
    now_ms = int(__import__("time").time() * 1000)
    settings_config = json.dumps(original.get("settings") or {}, ensure_ascii=False)
    conn.execute(
        "INSERT INTO providers "
        "(id, app_type, name, settings_config, category, meta, created_at, sort_index) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
        (new_id, agent_type,
         f"{original.get('name', provider_id)} (copy)",
         settings_config,
         original.get("category"),
         original.get("meta", "{}"),
         now_ms),
    )
    conn.commit()
    result = get_provider(agent_type, new_id)
    assert result is not None
    return result


def get_presets(agent_type: str) -> List[Dict[str, Any]]:
    """Return available provider presets for *agent_type*."""
    import json as _json
    presets_file = Path(__file__).resolve().parent / "presets" / "provider_presets.json"
    if not presets_file.is_file():
        return []
    try:
        data = _json.loads(presets_file.read_text(encoding="utf-8"))
    except (OSError, _json.JSONDecodeError):
        return []
    if not isinstance(data, list):
        return []
    return data


# ── Usage query ────────────────────────────────────────────────────────────

# Agent-type → which env/JSON key holds the API key (for the bash usage scripts).
# Mirrors cc-switch `Provider::resolve_usage_credentials` so per-app fallback
# chains stay in sync (OpenRouter/Google on Claude, bearer-token fallback on
# Codex, top-level keys on Hermes, options.* on OpenCode).
