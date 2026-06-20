"""Legacy per-provider view, derived from the new library.

v0.3.0 keeps these helpers around as a thin compatibility layer for
older code paths (e.g. `profile.show`) that still ask for a
ProviderSpec-style object.

The library is the single source of truth; this module just re-shapes
it.  The hard-coded ``_FALLBACK_PROVIDERS`` table is *only* used when
sqlite3 is somehow unavailable and the constant list itself cannot be
imported.
"""
from __future__ import annotations

from typing import Any, Dict, NamedTuple, Optional

from . import library


class ProviderSpec(NamedTuple):
    name: str
    base_url: str
    model: str
    label: str


# Hard-coded fallback used only in the unlikely event both the library
# constants *and* sqlite3 are unavailable (e.g. broken install).  Kept
# in sync with the deepseek / minimax / anthropic entries in
# ``library._BUILTIN_PROVIDERS``.
_API_KEY_PLACEHOLDER = "sk-REPLACE_ME"
_API_TIMEOUT_MS = "3000000"
_DISABLE_TRAFFIC = "1"


def _fallback_spec(name: str) -> Optional[ProviderSpec]:
    table = {
        "deepseek": ProviderSpec(
            name="deepseek",
            base_url="https://api.deepseek.com/anthropic",
            model="deepseek-v4-pro",
            label="DeepSeek (deepseek-v4-pro)",
        ),
        "minimax": ProviderSpec(
            name="minimax",
            base_url="https://api.minimaxi.com/anthropic",
            model="MiniMax-M3",
            label="MiniMax (MiniMax-M3)",
        ),
        "anthropic": ProviderSpec(
            name="anthropic",
            base_url="https://api.anthropic.com",
            model="claude-sonnet-4-6",
            label="Anthropic (claude-sonnet-4-6)",
        ),
    }
    return table.get(name)


def get(name: str) -> ProviderSpec:
    """Return a ProviderSpec for `name`; raises KeyError if unknown."""
    p = library.get_provider(name)
    if p is not None:
        return ProviderSpec(
            name=p["id"],
            base_url=p["env"].get("ANTHROPIC_BASE_URL", ""),
            model=p["env"].get("ANTHROPIC_MODEL", ""),
            label=p.get("label") or p.get("name") or name,
        )
    spec = _fallback_spec(name)
    if spec is not None:
        return spec
    raise KeyError(name)


def env_block(provider: str) -> Dict[str, str]:
    """Return the (string-ified) settings.json `env` block for a provider.

    Mirrors the new library.get_provider_env shape: every value is
    rendered as a string because that's what CC expects in the file.
    """
    env = library.get_provider_env(provider)
    if env is not None:
        return {k: _stringify(v) for k, v in env.items()}
    spec = _fallback_spec(provider)
    if spec is None:
        raise KeyError(provider)
    return {
        "ANTHROPIC_BASE_URL": spec.base_url,
        "ANTHROPIC_MODEL": spec.model,
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": spec.model,
        "ANTHROPIC_DEFAULT_SONNET_MODEL": spec.model,
        "ANTHROPIC_DEFAULT_OPUS_MODEL": spec.model,
        "ANTHROPIC_AUTH_TOKEN": _API_KEY_PLACEHOLDER,
        "API_TIMEOUT_MS": _API_TIMEOUT_MS,
        "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": _DISABLE_TRAFFIC,
    }


def describe(provider: str) -> Dict[str, Any]:
    """Return a display-friendly dict for `show`."""
    p = library.get_provider(provider)
    if p is not None:
        return {
            "name": p["id"],
            "label": p.get("label") or p.get("name") or provider,
            "base_url": p["env"].get("ANTHROPIC_BASE_URL", ""),
            "model": p["env"].get("ANTHROPIC_MODEL", ""),
        }
    spec = _fallback_spec(provider)
    if spec is None:
        raise KeyError(provider)
    return {
        "name": spec.name,
        "label": spec.label,
        "base_url": spec.base_url,
        "model": spec.model,
    }


def _stringify(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    # Fallback: JSON.
    import json
    return json.dumps(value, ensure_ascii=False)


# Legacy constant: derived from the library constants on demand.
def _legacy_providers() -> Dict[str, ProviderSpec]:
    out: Dict[str, ProviderSpec] = {}
    for row in library._BUILTIN_PROVIDERS:  # noqa: SLF001
        env = row["env"]
        out[row["id"]] = ProviderSpec(
            name=row["id"],
            base_url=env.get("ANTHROPIC_BASE_URL", ""),
            model=env.get("ANTHROPIC_MODEL", ""),
            label=row.get("label", row.get("name", row["id"])),
        )
    return out


PROVIDERS = _legacy_providers()
