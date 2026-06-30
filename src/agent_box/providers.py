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
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import config
from ._io import atomic_write_json, deep_merge
from .profile import ProfileError, load_meta




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
    from . import db
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


def duplicate_provider(agent_type: str, provider_id: str, new_id: str) -> Dict[str, Any]:
    """Copy an existing provider under a new id."""
    original = get_provider(agent_type, provider_id)
    if original is None:
        raise ProfileError(
            f"provider {provider_id!r} for agent_type {agent_type!r} not found"
        )
    from . import db
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

def _get_usage_credentials(provider: Dict[str, Any]) -> Dict[str, str]:
    """Extract API key and base URL from provider settings for usage queries."""
    settings = provider.get("settings") or {}
    env = settings.get("env", {}) if isinstance(settings.get("env"), dict) else {}
    api_key = env.get("ANTHROPIC_API_KEY") or env.get("ANTHROPIC_AUTH_TOKEN") or ""
    base_url = env.get("ANTHROPIC_BASE_URL") or ""
    return {"ANTHROPIC_AUTH_TOKEN": api_key, "ANTHROPIC_BASE_URL": base_url.rstrip("/")}


# ── Native balance queries for known providers ──────────────────────────

# ── Token Plan / Coding Plan providers ─────────────────────────────────

CODING_PLAN_PROVIDERS = {
    "kimi": {
        "pattern": "api.kimi.com/coding",
        "label": "Kimi",
        "endpoint": "https://api.kimi.com/coding/v1/usages",
        "extract": "kimi",
    },
    "zhipu-cn": {
        "pattern": "bigmodel.cn",
        "label": "Zhipu",
        "endpoint": "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
        "extract": "zhipu",
    },
    "zhipu-en": {
        "pattern": "api.z.ai",
        "label": "Zhipu",
        "endpoint": "https://api.z.ai/api/monitor/usage/quota/limit",
        "extract": "zhipu",
    },
    "minimax": {
        "pattern": "api.minimaxi.com",
        "label": "MiniMax",
        "endpoint": "https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains",
        "extract": "minimax",
    },
    "minimax-en": {
        "pattern": "api.minimax.io",
        "label": "MiniMax",
        "endpoint": "https://api.minimax.io/v1/api/openplatform/coding_plan/remains",
        "extract": "minimax",
    },
}

def _detect_coding_plan_provider(base_url: str) -> Optional[Dict[str, Any]]:
    """Detect which coding plan provider matches the given base_url."""
    if not base_url:
        return None
    url_lower = base_url.lower()
    for _key, info in CODING_PLAN_PROVIDERS.items():
        if info["pattern"] in url_lower:
            return info
    return None


def _native_coding_plan_query(api_key: str, provider_info: Dict[str, Any],
                               timeout: int = 10) -> Dict[str, Any]:
    """Query coding plan quota from MiniMax/Kimi/Zhipu native APIs."""
    endpoint = provider_info["endpoint"]
    extract_type = provider_info["extract"]
    cmd = ["curl", "-s", "--max-time", str(timeout),
           "-H", f"Authorization: Bearer {api_key}",
           "-H", "Content-Type: application/json",
           endpoint]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 2)
        raw = result.stdout.strip()
        if not raw:
            return {"success": False, "error": "Empty response"}
        data = json.loads(raw)
    except subprocess.TimeoutExpired:
        return {"success": False, "error": f"Query timed out after {timeout}s"}
    except json.JSONDecodeError:
        return {"success": False, "error": "Invalid response format"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}

    # ── MiniMax ──
    if extract_type == "minimax":
        if "base_resp" in data:
            if data["base_resp"].get("status_code", -1) != 0:
                return {"success": False, "error": data["base_resp"].get("status_msg", "Unknown")}
        model_remains = data.get("model_remains", [])
        general = next((m for m in model_remains if m.get("model_name") == "general"), None)
        if not general:
            return {"success": False, "error": "No coding plan data found"}
        usage_data = []
        r5 = general.get("current_interval_remaining_percent")
        end_5h = general.get("end_time") or general.get("endTime")
        if r5 is not None:
            usage_data.append({
                "planName": "5h", "remaining": float(r5), "used": 100.0 - float(r5),
                "total": 100.0, "unit": "%",
                "extra": _format_reset_countdown(end_5h) if end_5h else None,
            })
        if general.get("current_weekly_status") == 1:
            rw = general.get("current_weekly_remaining_percent")
            end_w = general.get("weekly_end_time") or general.get("weeklyEndTime")
            if rw is not None:
                usage_data.append({
                    "planName": "7d", "remaining": float(rw), "used": 100.0 - float(rw),
                    "total": 100.0, "unit": "%",
                    "extra": _format_reset_countdown(end_w) if end_w else None,
                })
        if usage_data:
            return {"success": True, "data": usage_data}
        return {"success": False, "error": "No usage data parsed"}

    # ── Kimi ──
    elif extract_type == "kimi":
        usage_data = []
        limits = data.get("limits", [])
        for item in limits:
            detail = item.get("detail", item)
            limit = float(detail.get("limit", 1) or 1)
            remaining = float(detail.get("remaining", 0) or 0)
            usage_data.append({
                "planName": "5h window",
                "remaining": remaining,
                "used": max(0, limit - remaining),
                "total": limit,
                "unit": "tokens",
            })
            break  # Just first limit for now
        if usage_data:
            return {"success": True, "data": usage_data}
        return {"success": False, "error": "No usage data parsed"}

    # ── Zhipu ──
    elif extract_type == "zhipu":
        if data.get("success") is False:
            return {"success": False, "error": data.get("msg", "Unknown")}
        inner = data.get("data", data)
        limits = inner.get("limits", [])
        token_limits = [l for l in limits if l.get("type", "").upper() == "TOKENS_LIMIT"]
        usage_data = []
        for tl in token_limits[:2]:
            pct = float(tl.get("percentage", 0) or 0)
            usage_data.append({
                "planName": "Token Limit",
                "remaining": 100.0 - pct,
                "used": pct,
                "total": 100.0,
                "unit": "%",
            })
        if usage_data:
            return {"success": True, "data": usage_data}
        return {"success": False, "error": "No usage data parsed"}

    return {"success": False, "error": f"Unknown extract type: {extract_type}"}


BALANCE_PROVIDERS = {
    "deepseek": {
        "pattern": "api.deepseek.com",
        "label": "DeepSeek",
        "endpoint": "{base_url}/user/balance",
        "extract": "balance",
    },
    "stepfun": {
        "pattern": "api.stepfun.ai",
        "label": "StepFun",
        "endpoint": "{base_url}/v1/account/balance",
        "extract": "balance",
    },
    "siliconflow": {
        "pattern": "api.siliconflow.cn",
        "label": "SiliconFlow",
        "endpoint": "{base_url}/v1/user/info",
        "extract": "siliconflow",
    },
    "siliconflow-en": {
        "pattern": "api.siliconflow.com",
        "label": "SiliconFlow",
        "endpoint": "{base_url}/v1/user/info",
        "extract": "siliconflow",
    },
    "openrouter": {
        "pattern": "openrouter.ai",
        "label": "OpenRouter",
        "endpoint": "{base_url}/api/v1/credits",
        "extract": "openrouter",
    },
    "novita": {
        "pattern": "api.novita.ai",
        "label": "Novita AI",
        "endpoint": "{base_url}/v1/credits",
        "extract": "openrouter",
    },
}

def _detect_balance_provider(base_url: str) -> Optional[Dict[str, Any]]:
    """Detect which balance provider matches the given base_url."""
    if not base_url:
        return None
    url_lower = base_url.lower()
    for _key, info in BALANCE_PROVIDERS.items():
        if info["pattern"] in url_lower:
            return info
    return None


def _format_reset_countdown(timestamp_ms) -> Optional[str]:
    """Format reset timestamp as countdown like '1h9m' or '10h9m'."""
    import time
    if not timestamp_ms:
        return None
    try:
        now_ms = int(time.time() * 1000)
        remaining_ms = int(timestamp_ms) - now_ms
        if remaining_ms <= 0:
            return None
        hours = remaining_ms // 3_600_000
        minutes = (remaining_ms % 3_600_000) // 60_000
        if hours > 0:
            return f"{hours}h{minutes}m"
        return f"{minutes}m"
    except (ValueError, TypeError):
        return None

def _get_balance_base_url(anthropic_base_url: str) -> str:
    """Extract root API base from Anthropic endpoint URL for balance queries.

    e.g. 'https://api.deepseek.com/anthropic' → 'https://api.deepseek.com'
         'https://openrouter.ai/api' → 'https://openrouter.ai'
         'https://api.siliconflow.cn' → 'https://api.siliconflow.cn'
    """
    from urllib.parse import urlparse
    parsed = urlparse(anthropic_base_url)
    return f"{parsed.scheme}://{parsed.netloc}"


def _native_balance_query(api_key: str, base_url: str,
                          provider_info: Dict[str, Any],
                          timeout: int = 10) -> Dict[str, Any]:
    """Query balance from a known provider's native API."""
    balance_base = _get_balance_base_url(base_url)
    endpoint = provider_info["endpoint"].replace("{base_url}", balance_base.rstrip("/"))
    extract_type = provider_info["extract"]

    cmd = ["curl", "-s", "--max-time", str(timeout),
           "-H", f"Authorization: Bearer {api_key}",
           "-H", "Content-Type: application/json",
           endpoint]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 2)
        raw = result.stdout.strip()
        if not raw:
            return {"success": False, "error": "Empty response from balance API"}
        data = json.loads(raw)
    except subprocess.TimeoutExpired:
        return {"success": False, "error": f"Balance query timed out after {timeout}s"}
    except json.JSONDecodeError:
        return {"success": False, "error": f"Invalid response format"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}

    # Check for API-level error
    if "error" in data and isinstance(data["error"], dict):
        err_msg = data["error"].get("message", str(data["error"]))
        return {"success": False, "error": err_msg}

    # Extract balance based on provider type
    try:
        if extract_type == "balance":
            # DeepSeek/StepFun: {"balance_infos": [{"total_balance": ...}]} or {"balance": ...}
            if "balance_infos" in data:
                total = sum(
                    float(b.get("total_balance", 0) or 0)
                    for b in data["balance_infos"]
                )
                return {"success": True, "data": [{
                    "remaining": total,
                    "total": total,
                    "used": 0,
                    "unit": data["balance_infos"][0].get("currency", "CNY") if data["balance_infos"] else "CNY",
                }]}
            elif "balance" in data:
                bal = float(data["balance"] or 0)
                return {"success": True, "data": [{"remaining": bal, "total": bal, "unit": "CNY"}]}

        elif extract_type == "openrouter":
            # OpenRouter/Novita: {"data": {"total_credits": ..., "total_usage": ...}}
            inner = data.get("data", data)
            total_credits = float(inner.get("total_credits", 0) or 0)
            total_usage = float(inner.get("total_usage", 0) or 0)
            remaining = max(0, total_credits - total_usage)
            return {"success": True, "data": [{
                "remaining": remaining,
                "total": total_credits,
                "used": total_usage,
                "unit": "USD",
            }]}

        elif extract_type == "siliconflow":
            # SiliconFlow: {"data": {"totalBalance": ..., "balance": ...}}
            inner = data.get("data", data)
            total = float(inner.get("totalBalance", 0) or inner.get("balance", 0) or 0)
            charge = float(inner.get("chargeBalance", 0) or 0)
            return {"success": True, "data": [{
                "remaining": total + charge,
                "total": total + charge,
                "unit": "CNY",
            }]}

        return {"success": False, "error": f"Unrecognized balance response: {json.dumps(data)[:200]}"}
    except (ValueError, TypeError, KeyError) as exc:
        return {"success": False, "error": f"Failed to parse balance: {exc}"}


def _execute_script_query(code: str, creds: Dict[str, str],
                          timeout: int) -> Dict[str, Any]:
    """Execute a bash script usage query."""
    env = os.environ.copy()
    env.update(creds)
    try:
        result = subprocess.run(
            ["bash", "-c", code],
            capture_output=True, text=True, timeout=timeout, env=env)
        raw = result.stdout.strip()
        if not raw:
            return {"success": False, "error": result.stderr.strip() or "No output"}
        data = json.loads(raw)
        if isinstance(data, list):
            return {"success": True, "data": data}
        elif isinstance(data, dict):
            return {"success": True, "data": [data]}
        else:
            return {"success": False, "error": f"Unexpected output type: {type(data).__name__}"}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": f"Usage query timed out after {timeout}s"}
    except json.JSONDecodeError as exc:
        return {"success": False, "error": f"Invalid JSON output: {exc}"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


# ── Template presets for bash scripts ───────────────────────────────────

USAGE_TEMPLATES = {
    "general": (
        "# General: query /user/balance endpoint\n"
        'curl -s --max-time 10 -H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN" '
        '"$ANTHROPIC_BASE_URL/user/balance"'
    ),
    "newapi": (
        "# New-API: query /api/user/self endpoint\n"
        'RESP=$(curl -s --max-time 10 -H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN" '
        '-H "Content-Type: application/json" "$ANTHROPIC_BASE_URL/api/user/self")\n'
        'echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin).get(\'data\',json.load(sys.stdin)); '
        'print(json.dumps({'
        '\'planName\': d.get(\'group\',\'\'), '
        '\'remaining\': (d.get(\'quota\',0)-d.get(\'used_quota\',0))/500000, '
        '\'used\': d.get(\'used_quota\',0)/500000, '
        '\'total\': d.get(\'quota\',0)/500000, '
        '\'unit\': \'USD\''
        '}))"'
    ),
}


def query_provider_usage(agent_type: str, provider_id: str) -> Dict[str, Any]:
    """Execute the provider's usage query and return parsed result.

    Supports template types: balance (native), general/newapi/custom (bash).

    Returns: { success: bool, data?: UsageData[], error?: string }
    """
    provider = get_provider(agent_type, provider_id)
    if provider is None:
        return {"success": False, "error": f"Provider {provider_id!r} not found"}

    meta = provider.get("meta_parsed") or {}
    usage_script = meta.get("usage_script")
    if not usage_script or not usage_script.get("enabled"):
        return {"success": False, "error": "Usage query not enabled"}

    timeout = usage_script.get("timeout", 10) or 10
    template_type = usage_script.get("templateType", "custom")
    creds = _get_usage_credentials(provider)
    code = (usage_script.get("code") or "").strip()

    # 1) Native balance query for known providers
    if template_type == "balance":
        balance_provider = _detect_balance_provider(creds.get("ANTHROPIC_BASE_URL", ""))
        if balance_provider:
            return _native_balance_query(
                creds.get("ANTHROPIC_AUTH_TOKEN", ""),
                creds.get("ANTHROPIC_BASE_URL", ""),
                balance_provider, timeout)
        if code:
            return _execute_script_query(code, creds, timeout)
        return {"success": False, "error": "No balance provider detected"}

    # 1b) Native coding plan / token plan query
    if template_type == "token_plan":
        cp_provider = _detect_coding_plan_provider(creds.get("ANTHROPIC_BASE_URL", ""))
        if cp_provider:
            return _native_coding_plan_query(
                creds.get("ANTHROPIC_AUTH_TOKEN", ""),
                cp_provider, timeout)
        if code:
            return _execute_script_query(code, creds, timeout)
        return {"success": False, "error": "No coding plan provider detected"}

    # 2) Template-based scripts
    if template_type in USAGE_TEMPLATES and not code:
        code = USAGE_TEMPLATES[template_type]

    # 3) Execute bash script
    if code:
        return _execute_script_query(code, creds, timeout)

    return {"success": False, "error": "No usage script configured"}


def save_usage_script(agent_type: str, provider_id: str, script_json: str) -> Dict[str, Any]:
    """Save a usage script configuration into the provider's meta."""
    provider = get_provider(agent_type, provider_id)
    if provider is None:
        raise ProfileError(f"provider {provider_id!r} not found")
    try:
        script_data = json.loads(script_json)
    except json.JSONDecodeError as exc:
        raise ProfileError(f"Invalid usage script JSON: {exc}") from exc
    meta = provider.get("meta_parsed") or {}
    meta["usage_script"] = script_data
    from . import db
    conn = db.get_conn()
    conn.execute(
        "UPDATE providers SET meta = ? WHERE id = ? AND app_type = ?",
        (json.dumps(meta, ensure_ascii=False), provider_id, agent_type),
    )
    conn.commit()
    return {"ok": True}


__all__ = [
    "APPLY_SUPPORTED",
    "add_provider",
    "apply_provider",
    "delete_provider",
    "duplicate_provider",
    "edit_provider",
    "get_presets",
    "get_provider",
    "list_providers",
    "query_provider_usage",
    "save_usage_script",
    "upsert_provider",
]
