"""Per-provider CC configuration table.

Originally a hard-coded dict of three providers (deepseek, minimax,
anthropic). v0.2.0 still ships the same dict as a *fallback* — used only
if the SQLite component library has been wiped — but the canonical
source of truth is now `agent_box.library` (see `_BUILTIN_PROVIDERS`).

Public API kept stable:

* `ProviderSpec` namedtuple (legacy shape: name, base_url, model, label)
* `PROVIDERS` dict (fallback)
* `get(name)` — library first, fallback second
* `env_block(name)` — library first, fallback second
* `describe(name)` — library first, fallback second
* `SUPPORTED_PROVIDERS` — derived from library (cached at import time
  but cheap to recompute; the CLI uses `config.SUPPORTED_PROVIDERS` which
  is a thin wrapper that hits the library).
"""
from __future__ import annotations

from typing import Any, Dict, NamedTuple, Optional


class ProviderSpec(NamedTuple):
    name: str
    base_url: str
    model: str
    label: str


# Hard-coded fallback table — only consulted if the library has no row.
_API_KEY_PLACEHOLDER = "sk-REPLACE_ME"
_API_TIMEOUT_MS = "3000000"
_DISABLE_TRAFFIC = "1"

_FALLBACK_PROVIDERS: Dict[str, ProviderSpec] = {
    p.name: p
    for p in (
        ProviderSpec(
            name="deepseek",
            base_url="https://api.deepseek.com/anthropic",
            model="deepseek-v4-pro",
            label="DeepSeek (deepseek-v4-pro)",
        ),
        ProviderSpec(
            name="minimax",
            base_url="https://api.minimaxi.com/anthropic",
            model="MiniMax-M2.7",
            label="MiniMax (MiniMax-M2.7)",
        ),
        ProviderSpec(
            name="anthropic",
            base_url="https://api.anthropic.com",
            model="claude-sonnet-4-6",
            label="Anthropic (claude-sonnet-4-6)",
        ),
    )
}


def get(name: str) -> ProviderSpec:
    """Return the ProviderSpec for `name`. Raises KeyError if unknown.

    Library takes precedence; fallback table is consulted only if the
    library is unavailable (e.g. first-run race on a fresh checkout
    where sqlite3 has not yet been imported).
    """
    try:
        from . import library  # local import to break a cycle
        p = library.get_provider(name)
        if p is not None:
            return ProviderSpec(
                name=p.id,
                base_url=p.base_url,
                model=p.model,
                label=p.label or p.name,
            )
    except Exception:
        # Library unavailable — fall through to the hard-coded table.
        pass
    if name in _FALLBACK_PROVIDERS:
        return _FALLBACK_PROVIDERS[name]
    raise KeyError(name)


def env_block(provider: str) -> Dict[str, str]:
    """Build the settings.json `env` block for a given provider name."""
    try:
        from . import library
        p = library.get_provider(provider)
        if p is not None:
            return p.env_block()
    except Exception:
        pass
    spec = _FALLBACK_PROVIDERS.get(provider)
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
    try:
        from . import library
        p = library.get_provider(provider)
        if p is not None:
            return {
                "name": p.id,
                "label": p.label or p.name,
                "base_url": p.base_url,
                "model": p.model,
            }
    except Exception:
        pass
    spec = _FALLBACK_PROVIDERS.get(provider)
    if spec is None:
        raise KeyError(provider)
    return {
        "name": spec.name,
        "label": spec.label,
        "base_url": spec.base_url,
        "model": spec.model,
    }


# Legacy constants — still exported so older import paths keep working.
PROVIDERS = _FALLBACK_PROVIDERS
