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
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import config
from ._io import atomic_write_json, deep_merge
from .profile import ProfileError, load_meta


# --- category inference --------------------------------------------------

# env key → category (checked against the ``env`` dict in settings_config).
_ENV_CATEGORY: Dict[str, str] = {
    "ANTHROPIC_API_KEY": "anthropic",
    "ANTHROPIC_AUTH_TOKEN": "anthropic",
    "OPENAI_API_KEY": "openai",
    "GOOGLE_API_KEY": "google",
    "GEMINI_API_KEY": "google",
    "AWS_ACCESS_KEY_ID": "aws",
    "AWS_SECRET_ACCESS_KEY": "aws",
    "AWS_BEDROCK_API_KEY": "aws",
    "DEEPSEEK_API_KEY": "deepseek",
    "OPENROUTER_API_KEY": "openrouter",
    "MISTRAL_API_KEY": "mistral",
    "GROQ_API_KEY": "groq",
    "TOGETHER_API_KEY": "together",
    "COHERE_API_KEY": "cohere",
    "REPLICATE_API_TOKEN": "replicate",
    "HF_TOKEN": "huggingface",
    "HUGGING_FACE_HUB_TOKEN": "huggingface",
    "FIREWORKS_API_KEY": "fireworks",
    "PERPLEXITY_API_KEY": "perplexity",
    "SILICONFLOW_API_KEY": "siliconflow",
}

# URL domain substring → category (checked against any URL found in env).
_URL_CATEGORY: List[tuple] = [
    ("anthropic", "anthropic"),
    ("openai", "openai"),
    ("deepseek", "deepseek"),
    ("openrouter", "openrouter"),
    ("google", "google"),
    ("gemini", "google"),
    ("bedrock", "aws"),
    ("mistral", "mistral"),
    ("groq", "groq"),
    ("together", "together"),
    ("fireworks", "fireworks"),
    ("perplexity", "perplexity"),
    ("siliconflow", "siliconflow"),
    ("minimaxi", "minimax"),
    ("xiaomimimo", "xiaomimimo"),
    ("zhipu", "zhipu"),
    ("moonshot", "moonshot"),
    ("qwen", "qwen"),
    ("baichuan", "baichuan"),
    ("volcengine", "volcengine"),
    ("baidu", "baidu"),
    ("tencent", "tencent"),
    ("alibaba", "alibaba"),
    ("cohere", "cohere"),
    ("replicate", "replicate"),
]


def _infer_category(settings: Dict[str, Any]) -> str:
    """Infer provider category from *settings*.

    Resolution order:
    1. Explicit ``category`` key in settings → manual override (highest priority).
    2. Env key match (e.g. ``ANTHROPIC_API_KEY`` → ``"anthropic"``).
    3. URL domain match in any env value.

    Returns a lowercase string like ``"anthropic"`` or ``""`` if unknown.
    """
    # 1. Manual override
    manual = settings.get("category")
    if manual and isinstance(manual, str):
        return manual.strip().lower()

    env = settings.get("env") or {}
    # 2. Direct env key match
    for key, cat in _ENV_CATEGORY.items():
        if key in env:
            return cat
    # 3. URL domain match (check all values that look like URLs)
    for val in env.values():
        if not isinstance(val, str):
            continue
        val_lower = val.lower()
        if "://" in val_lower or val_lower.startswith("http"):
            for domain_key, cat in _URL_CATEGORY:
                if domain_key in val_lower:
                    return cat
    return ""


# --- list / get -----------------------------------------------------------

def list_providers(agent_type: str) -> List[Dict[str, Any]]:
    """Return one row per provider for *agent_type* (id, name, meta)."""
    from . import db
    conn = db.get_conn()
    rows = conn.execute(
        "SELECT id, name, website_url, category, sort_index, notes, icon, "
        "is_current, in_failover_queue, created_at, meta "
        "FROM providers WHERE app_type = ? ORDER BY sort_index, name",
        (agent_type,),
    ).fetchall()
    out: List[Dict[str, Any]] = []
    for r in rows:
        out.append({
            "id": r["id"],
            "name": r["name"],
            "category": r["category"],
            "website_url": r["website_url"],
            "is_current": bool(r["is_current"]),
            "in_failover_queue": bool(r["in_failover_queue"]),
        })
    return out


def get_provider(agent_type: str, provider_id: str) -> Optional[Dict[str, Any]]:
    """Return the full provider row + endpoints, or ``None`` if missing."""
    from . import db
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
    from .edit import open_editor
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
    from . import db
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
    from . import db
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
    from . import db
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
    from . import db
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


# --- apply ----------------------------------------------------------------

# Agent types that support apply in v1. Non-CC apply raises ProfileError.
APPLY_SUPPORTED = {"claude"}


def apply_provider(profile_name: str, provider_id: str) -> None:
    """Merge a provider's ``env`` block into a profile's settings.json.

    Steps:
      1. load_meta → resolve the profile's agent_type
      2. non-claude → raise ProfileError (apply not yet supported)
      3. read provider.settings_config → extract ``env`` object
      4. read profile's settings.json (if any)
      5. deep_merge(provider_env, existing_settings["env"])
         (provider wins on conflict, other top-level settings keys untouched)
      6. atomic write the result
      7. UPDATE profiles SET provider_ref = provider_id
    """
    meta = load_meta(profile_name)
    agent_type = meta["agent_type"]
    if agent_type not in APPLY_SUPPORTED:
        raise ProfileError(
            f"apply is not yet supported for agent_type {agent_type!r} "
            f"(v1 supports: {', '.join(sorted(APPLY_SUPPORTED))})"
        )

    provider = get_provider(agent_type, provider_id)
    if provider is None:
        raise ProfileError(
            f"provider {provider_id!r} for agent_type {agent_type!r} not found"
        )
    provider_env = (provider.get("settings") or {}).get("env") or {}
    if not isinstance(provider_env, dict):
        raise ProfileError(
            f"provider {provider_id!r}: env must be a JSON object"
        )

    settings_path = config.profile_agent_dir(profile_name, agent_type) / "settings.json"
    existing: Dict[str, Any] = {}
    if settings_path.is_file():
        try:
            existing = json.loads(settings_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ProfileError(
                f"{profile_name}: settings.json is not valid JSON: {exc}"
            ) from exc
        if not isinstance(existing, dict):
            existing = {}

    existing_env = existing.get("env")
    if not isinstance(existing_env, dict):
        existing_env = {}
    merged_env = deep_merge(existing_env, provider_env)
    existing["env"] = merged_env

    atomic_write_json(settings_path, existing)

    from . import db
    conn = db.get_conn()
    conn.execute(
        "UPDATE profiles SET provider_ref = ? WHERE name = ?",
        (provider_id, profile_name),
    )
    conn.commit()


__all__ = [
    "APPLY_SUPPORTED",
    "add_provider",
    "apply_provider",
    "delete_provider",
    "edit_provider",
    "get_provider",
    "list_providers",
    "upsert_provider",
]
