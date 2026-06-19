"""Per-provider CC configuration table.

Each provider entry maps a logical name (deepseek, minimax, anthropic, ...) to
the settings.json `env` block that CC consumes, plus display metadata.

All three tier model env vars (DEFAULT_HAIKU/SONNET/OPUS_MODEL) are set to the
same value as the primary ANTHROPIC_MODEL so that /model inside CC consistently
shows the provider's flagship model regardless of the tier CC picks internally.
"""
from __future__ import annotations

from typing import Any, Dict, NamedTuple


class ProviderSpec(NamedTuple):
    name: str
    base_url: str          # value of ANTHROPIC_BASE_URL (empty = use CC default)
    model: str             # primary ANTHROPIC_MODEL
    label: str             # human-readable name for `show` / `list`


# Keep the spec table tiny and explicit. The official CC tier env vars all
# default to the same model per the v2 spec, so we always set them equal.
#
# Default CC settings we apply to every profile (tier models + timeouts +
# telemetry opt-out). The actual API key is a placeholder; users fill it in.
_API_KEY_PLACEHOLDER = "sk-REPLACE_ME"
_API_TIMEOUT_MS = "3000000"
_DISABLE_TRAFFIC = "1"


def _spec(name: str, base_url: str, model: str, label: str) -> ProviderSpec:
    return ProviderSpec(name=name, base_url=base_url, model=model, label=label)


# (name -> ProviderSpec)
PROVIDERS: Dict[str, ProviderSpec] = {
    p.name: p
    for p in (
        _spec(
            "deepseek",
            "https://api.deepseek.com/anthropic",
            "deepseek-v4-pro",
            "DeepSeek (deepseek-v4-pro)",
        ),
        _spec(
            "minimax",
            "https://api.minimaxi.com/anthropic",
            "MiniMax-M2.7",
            "MiniMax (MiniMax-M2.7)",
        ),
        _spec(
            "anthropic",
            "https://api.anthropic.com",
            "claude-sonnet-4-6",
            "Anthropic (claude-sonnet-4-6)",
        ),
    )
}


def get(name: str) -> ProviderSpec:
    if name not in PROVIDERS:
        raise KeyError(name)
    return PROVIDERS[name]


def env_block(provider: str) -> Dict[str, str]:
    """Build the settings.json `env` block for a given provider name.

    Raises KeyError if `provider` is unknown (caller maps to a friendly error).
    """
    spec = get(provider)
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
    spec = get(provider)
    return {
        "name": spec.name,
        "label": spec.label,
        "base_url": spec.base_url,
        "model": spec.model,
    }
