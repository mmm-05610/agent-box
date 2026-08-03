"""Model catalog adapter — fetch a provider's model list via curl.

The models-endpoint knowledge for known providers (e.g. DeepSeek exposes
its catalog at the root ``/models``, not ``/v1/models``) lives in
``core/provider_endpoints.json`` as declarative data — NOT in code.  For
anything not in that table we fall back to the generic OpenAI-compatible
convention (``/v1/models``), which is a universal protocol, not
provider-specific knowledge.

Both GUI data paths delegate to this module: LinuxDataAccess imports it
directly, WslDataAccess runs it via ``python3 -c`` inside WSL.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from typing import Any, Dict, List

from .. import config

# Provider base URL → known models-endpoint candidates.  Exact match on the
# normalized base URL (stripped, no trailing slash).  A single string is
# accepted as a one-element list.  Curated from the ACS provider presets
# (claudeProviderPresets.ts etc.) — the authoritative source for these paths.
# Resolved via config (package-relative), like agent_types.json.
_endpoint_table_cache: Dict[str, List[str]] | None = None


class ModelFetchError(RuntimeError):
    """Raised when no candidate models URL could be fetched."""


def _endpoint_table() -> Dict[str, List[str]]:
    """Load the base-URL → models-endpoint table (cached)."""
    global _endpoint_table_cache
    if _endpoint_table_cache is not None:
        return _endpoint_table_cache
    table: Dict[str, List[str]] = {}
    try:
        raw = json.loads(config.provider_endpoints_file().read_text(encoding="utf-8"))
        for key, value in raw.items():
            if isinstance(value, str):
                table[str(key)] = [value]
            elif isinstance(value, list):
                table[str(key)] = [str(v) for v in value if isinstance(v, str)]
    except (OSError, json.JSONDecodeError):
        pass
    _endpoint_table_cache = table
    return table


def _build_generic_candidates(base: str, is_full_url: bool) -> List[str]:
    """Generic OpenAI-compatible models-endpoint guessing.

    Pure protocol convention (``/v1/models``; ``{base}/models`` when the
    base already ends in a version segment like ``/v1`` or ``/v4``) — no
    provider-specific knowledge here.  Provider specifics are handled by
    the endpoint table.
    """
    if is_full_url:
        idx = base.find("/v1/")
        if idx != -1:
            return [f"{base[:idx]}/v1/models"]
        idx = base.rfind("/")
        if idx > 0:
            root = base[:idx]
            if "://" in root and len(root) > root.index("://") + 3:
                return [f"{root}/v1/models"]
        return []
    last = base.rsplit("/", 1)[-1]
    if re.match(r"^v\d+$", last):
        candidates = [f"{base}/models"]
        # Version segment other than /v1 (e.g. 智谱 .../paas/v4) — keep the
        # old /v1/models as a secondary fallback.
        if not base.endswith("/v1"):
            candidates.append(f"{base}/v1/models")
        return candidates
    return [f"{base}/v1/models"]


def _candidates_for(base_url: str, is_full_url: bool, override: str) -> List[str]:
    """Curated override → endpoint table → generic guess, deduped."""
    if override and override.strip():
        return [override.strip()]
    normalized = base_url.strip().rstrip("/")
    if not normalized:
        return []
    curated = _endpoint_table().get(normalized) or []
    generic = _build_generic_candidates(normalized, is_full_url)
    seen: set[str] = set()
    out: List[str] = []
    for url in [*curated, *generic]:
        if url not in seen:
            seen.add(url)
            out.append(url)
    return out


def fetch_models(
    base_url: str,
    api_key: str,
    models_url: str = "",
    is_full_url: bool = False,
    timeout_sec: int = 10,
) -> List[Dict[str, Any]]:
    """Fetch the model list from a provider API endpoint.

    Tries each candidate URL in order (override first, then the curated
    endpoint table, then the generic guess), returning the first HTTP-2xx
    list.  Raises :class:`ModelFetchError` when every candidate fails.
    Returns ``[]`` for a reachable endpoint with an empty / unknown payload.
    """
    curl = shutil.which("curl")
    if not curl:
        raise ModelFetchError("curl not found")

    candidates = _candidates_for(base_url, is_full_url, models_url)
    if not candidates:
        raise ModelFetchError("No candidate URLs")

    last_err = ""
    for url in candidates:
        try:
            auth = ["-H", f"Authorization: Bearer {api_key}"] if api_key else []
            result = subprocess.run(
                [curl, "-s", "-w", "\n%{http_code}",
                 "--connect-timeout", str(timeout_sec),
                 "--max-time", str(timeout_sec), *auth, url],
                capture_output=True, text=True, timeout=timeout_sec + 3,
            )
            out = result.stdout.strip()
            lines = out.rsplit("\n", 1)
            body = lines[0] if len(lines) > 1 else out
            code_str = lines[-1] if len(lines) > 1 else ""
            code = int(code_str) if code_str.isdigit() else 0
            if code == 0:
                last_err = f"HTTP 0: {body[:200] if body else 'no response'}"
                continue
            if 200 <= code < 300:
                data = json.loads(body)
                models_raw = data.get("data", data) if isinstance(data, dict) else data
                if isinstance(models_raw, list):
                    models = [
                        {"id": m["id"], "owned_by": m.get("owned_by")}
                        if isinstance(m, dict) and "id" in m
                        else {"id": m, "owned_by": None}
                        if isinstance(m, str) else None
                        for m in models_raw
                    ]
                    models = [m for m in models if m is not None]
                    models.sort(key=lambda x: x["id"])
                    return models
                return []
            if code in (404, 405):
                last_err = f"HTTP {code}"
                continue
            raise ModelFetchError(f"HTTP {code}: {body[:200]}")
        except ModelFetchError:
            raise
        except Exception as e:  # noqa: BLE001 — curl timeout / bad JSON / conn
            last_err = str(e)
            continue
    raise ModelFetchError(f"All candidates failed: {last_err}")
