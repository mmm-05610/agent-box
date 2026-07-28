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




_AGENT_API_KEY_VARS: Dict[str, tuple] = {
    "claude": ("ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY",
               "OPENROUTER_API_KEY", "GOOGLE_API_KEY"),
    "gemini": ("GEMINI_API_KEY", "GOOGLE_API_KEY"),
    # codex/hermes/opencode use non-env shapes — see resolve_usage_credentials
}

# Regex used to lift ``base_url = "..."`` out of a Codex TOML config string.
# Matches the active ``[model_providers.<X>]`` section first; falls back to
# the top-level ``base_url`` key. Mirrors cc-switch's extractCodexBaseUrl
# (providerConfigUtils.ts) which has the same precedence rules.
_COEX_M = re.MULTILINE  # local alias — the per-line patterns below
# require MULTILINE so ``$`` anchors per-line end-of-string, not end-of-buffer.
# (Without it, a TOML body with multiple lines silently fails to match —
# re.search without MULTILINE anchors ``$`` to the end of the whole string.)
_CODEX_SECTION_HEADER_RE = re.compile(r"^\s*\[([^\]\r\n]+)\]\s*$", _COEX_M)
_CODEX_BASE_URL_RE = re.compile(
    r"""^[ \t]*base_url[ \t]*=[ \t]*(?:"((?:\\.|[^"\\\r\n])*)"|'([^'\r\n]*)')(?:[ \t]*(?:#[^\r\n]*)?)?$""",
    _COEX_M,
)
_CODEX_BEARER_TOKEN_RE = re.compile(
    r"""^[ \t]*experimental_bearer_token[ \t]*=[ \t]*(["'])([^"'\r\n]+)\1(?:[ \t]*(?:#[^\r\n]*)?)?$""",
    _COEX_M,
)
_CODEX_MODEL_PROVIDER_RE = re.compile(
    r"""^[ \t]*model_provider[ \t]*=[ \t]*(["'])([^"'\r\n]+)\1(?:[ \t]*(?:#[^\r\n]*)?)?$""",
    _COEX_M,
)
del _COEX_M
_CODEX_RESERVED_PROVIDER_IDS = frozenset({
    "amazon-bedrock", "openai", "ollama", "lmstudio",
})


def _first_non_empty(mapping: Dict[str, Any] | None, keys: tuple) -> str:
    """Return the first value among *keys* that is a non-empty string.

    Mirrors the JS ``a || b || c`` semantics: keys that are absent *or*
    present-but-empty are both skipped. Presets seed ``ANTHROPIC_AUTH_TOKEN``
    as a present-but-empty placeholder, so a plain ``mapping.get(k) or ...``
    chain would stop at the first empty value — this helper continues.
    """
    if not mapping:
        return ""
    for k in keys:
        v = mapping.get(k)
        if isinstance(v, str) and v.strip():
            return v
    return ""


def _extract_codex_active_provider(config_text: str) -> str | None:
    """Return the active ``model_provider`` name from a Codex config.toml body.

    Returns None if unset. Reserved provider ids (openai, ollama, ...) are
    still returned — cc-switch filters them for *experimental_bearer_token*
    fallback only, not for base_url extraction.
    """
    m = _CODEX_MODEL_PROVIDER_RE.search(config_text)
    if not m:
        return None
    name = m.group(2).strip()
    return name or None


def _extract_codex_base_url(config_text: str) -> str | None:
    """Resolve Codex base_url, preferring the active ``[model_providers.<X>]``
    section over the top-level ``base_url`` key.

    Mirrors ``extractCodexBaseUrl`` in cc-switch (TS). Returns None on any
    parse failure (the TS version swallows errors too).
    """
    if not config_text:
        return None
    active = _extract_codex_active_provider(config_text)
    in_active_section = False
    in_top_level = True  # top-level assignments end at the first [section]
    for raw_line in config_text.splitlines():
        section = _CODEX_SECTION_HEADER_RE.match(raw_line)
        if section:
            header = section.group(1).strip()
            in_active_section = bool(
                active and header == f"model_providers.{active}"
            )
            in_top_level = False
            continue
        m = _CODEX_BASE_URL_RE.match(raw_line)
        if not m:
            continue
        value = (m.group(1) or m.group(2) or "").strip()
        if in_active_section:
            return value
        # Top-level: only valid before any [section] appears
        if in_top_level:
            return value
    return None


def _extract_codex_bearer_token(config_text: str) -> str | None:
    """Resolve ``experimental_bearer_token`` for Codex, preferring the active
    custom provider's section over the top-level key.

    Mirrors ``extractCodexExperimentalBearerToken`` in cc-switch (TS).
    Reserved provider ids (openai/ollama/...) are skipped — only custom
    providers get the section-scoped lookup; for those we still fall back to
    the top-level value.
    """
    if not config_text:
        return None
    active = _extract_codex_active_provider(config_text)
    # If active is a reserved id, don't look in [model_providers.<active>].
    want_section = bool(
        active and active not in _CODEX_RESERVED_PROVIDER_IDS
    )
    in_active_section = False
    in_top_level = True
    for raw_line in config_text.splitlines():
        section = _CODEX_SECTION_HEADER_RE.match(raw_line)
        if section:
            header = section.group(1).strip()
            in_active_section = want_section and header == f"model_providers.{active}"
            in_top_level = False
            continue
        m = _CODEX_BEARER_TOKEN_RE.match(raw_line)
        if not m:
            continue
        value = m.group(2).strip()
        if in_active_section:
            return value
        if in_top_level:
            return value
    return None


def resolve_usage_credentials(
    agent_type: str, provider: Dict[str, Any]
) -> Dict[str, str]:
    """Extract ``(api_key, base_url)`` for the given agent_type's settings.

    Mirrors cc-switch's ``Provider::resolve_usage_credentials`` (provider.rs).
    Returns a dict whose keys depend on the app — callers either read the
    type-specific keys (``ANTHROPIC_AUTH_TOKEN`` for Claude, ``OPENAI_API_KEY``
    for Codex, …) or the generic ``api_key``/``base_url`` aliases.

    Each app keeps the env-var names the agent binary actually reads, so
    bash usage scripts that source ``$ANTHROPIC_AUTH_TOKEN`` or
    ``$OPENAI_API_KEY`` continue to work.
    """
    settings = provider.get("settings") or {}
    if not isinstance(settings, dict):
        settings = {}

    base: Dict[str, str] = {"api_key": "", "base_url": ""}

    if agent_type == "claude":
        env = settings.get("env") or {}
        if isinstance(env, dict):
            base["api_key"] = _first_non_empty(env, _AGENT_API_KEY_VARS["claude"])
            v = env.get("ANTHROPIC_BASE_URL")
            if isinstance(v, str):
                base["base_url"] = v
        # Mirror the legacy key names so existing bash scripts keep working.
        if base["api_key"]:
            base["ANTHROPIC_AUTH_TOKEN"] = base["api_key"]
        if base["base_url"]:
            base["ANTHROPIC_BASE_URL"] = base["base_url"]

    elif agent_type == "codex":
        auth = settings.get("auth") or {}
        config_text = settings.get("config") or ""
        if isinstance(auth, dict):
            key = auth.get("OPENAI_API_KEY")
            if isinstance(key, str) and key.strip():
                base["api_key"] = key.strip()
        if not base["api_key"] and isinstance(config_text, str):
            tok = _extract_codex_bearer_token(config_text)
            if tok:
                base["api_key"] = tok
        if isinstance(config_text, str):
            url = _extract_codex_base_url(config_text)
            if url:
                base["base_url"] = url
        if base["api_key"]:
            base["OPENAI_API_KEY"] = base["api_key"]
        if base["base_url"]:
            base["base_url"] = base["base_url"]  # already trimmed below

    elif agent_type == "gemini":
        env = settings.get("env") or {}
        if isinstance(env, dict):
            base["api_key"] = _first_non_empty(env, _AGENT_API_KEY_VARS["gemini"])
            v = env.get("GOOGLE_GEMINI_BASE_URL")
            if isinstance(v, str):
                base["base_url"] = v
        if base["api_key"]:
            base["GEMINI_API_KEY"] = base["api_key"]
        if base["base_url"]:
            base["GOOGLE_GEMINI_BASE_URL"] = base["base_url"]

    elif agent_type == "hermes":
        v = settings.get("api_key")
        if isinstance(v, str) and v.strip():
            base["api_key"] = v.strip()
        v = settings.get("base_url")
        if isinstance(v, str) and v.strip():
            base["base_url"] = v.strip()
        if base["api_key"]:
            base["API_KEY"] = base["api_key"]
        if base["base_url"]:
            base["BASE_URL"] = base["base_url"]

    elif agent_type == "opencode":
        options = settings.get("options") or {}
        if isinstance(options, dict):
            v = options.get("apiKey")
            if isinstance(v, str) and v.strip():
                base["api_key"] = v.strip()
            v = options.get("baseURL")
            if isinstance(v, str) and v.strip():
                base["base_url"] = v.strip()
        if base["api_key"]:
            base["API_KEY"] = base["api_key"]
        if base["base_url"]:
            base["BASE_URL"] = base["base_url"]

    # Trim trailing slash on base_url — matches cc-switch behavior so script
    # paths like ``$ANTHROPIC_BASE_URL/user/balance`` never double-slash.
    base["base_url"] = base["base_url"].rstrip("/")
    return base


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

def _detect_coding_plan_provider(base_url: str) -> Dict[str, Any] | None:
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

def _detect_balance_provider(base_url: str) -> Dict[str, Any] | None:
    """Detect which balance provider matches the given base_url."""
    if not base_url:
        return None
    url_lower = base_url.lower()
    for _key, info in BALANCE_PROVIDERS.items():
        if info["pattern"] in url_lower:
            return info
    return None


def _format_reset_countdown(timestamp_ms) -> str | None:
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
    creds = resolve_usage_credentials(agent_type, provider)
    code = (usage_script.get("code") or "").strip()

    # 1) Native balance query for known providers (URL pattern match on base_url)
    if template_type == "balance":
        balance_provider = _detect_balance_provider(creds.get("base_url", ""))
        if balance_provider:
            return _native_balance_query(
                creds.get("api_key", ""),
                creds.get("base_url", ""),
                balance_provider, timeout)
        if code:
            return _execute_script_query(code, creds, timeout)
        return {"success": False, "error": "No balance provider detected"}

    # 1b) Native coding plan / token plan query
    if template_type == "token_plan":
        cp_provider = _detect_coding_plan_provider(creds.get("base_url", ""))
        if cp_provider:
            return _native_coding_plan_query(
                creds.get("api_key", ""),
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
    from ... import db
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
    "list_profile_providers",
    "list_providers",
    "query_provider_usage",
    "remove_profile_provider",
    "resolve_usage_credentials",
    "save_usage_script",
    "upsert_provider",
]
