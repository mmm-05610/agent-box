"""Agent type registry for agent-box.

Each agent type maps to the host config directory (bind-mounted inside
bwrap) and the binary to execute. Profile creation copies from
``templates/<type>/`` — a directory representing a fresh install of
that agent's default config.

In addition to the required ``templates/`` tree, the package ships
``presets/<type>/<name>/`` — optional profile seeds (CLAUDE.md,
hooks.json, settings.overlay.json). A preset is a starting point
applied on top of the base template, not a replacement for it. See
:func:`list_presets` and :func:`get_preset_dir`.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from .. import config

# ---------------------------------------------------------------------------
# Agent type registry
# ---------------------------------------------------------------------------
# config_dir — the real (host) directory that bwrap bind-mounts over.
# binary     — the executable invoked as bwrap's child.
# data_dir   — optional second config directory (e.g. OpenCode auth).
# ---------------------------------------------------------------------------

_AGENT_TYPES: Dict[str, Dict[str, Any]] = {
    "claude": {
        "config_dir": "~/.claude",
        "binary": "claude",
        "prompt_file": "CLAUDE.md",
        "resume_args": ("--continue",),
        "acs_column": "enabled_claude",
        "supports_hooks": True,
        "supports_prompt_apply": True,
        "features": ("permissions", "plugins"),
        "config_files": ["settings.json"],
        "extra_profile_files": ["dot-claude.json", "dot-agents/"],
        "mcp_config": None,
        "provider_apply_mode": "overwrite",
        "preset_files": {
            "CLAUDE.md":             {"dest": "CLAUDE.md",        "merge": "copy"},
            "hooks.json":            {"dest": "hooks/hooks.json", "merge": "copy"},
            "settings.overlay.json": {"dest": "settings.json",    "merge": "deep_merge"},
        },
    },
    "codex": {
        "config_dir": "~/.codex",
        "binary": "codex",
        "prompt_file": "AGENTS.md",
        "resume_args": ("resume", "--last"),
        "acs_column": "enabled_codex",
        "supports_hooks": False,
        "features": ("rules",),
        "config_files": ["config.toml", "auth.json"],
        "mcp_config": {"filename": "config.toml", "root_key": "mcp_servers"},
        "provider_apply_mode": "overwrite",
    },
    "hermes": {
        "config_dir": "~/.hermes",
        "binary": "hermes",
        "prompt_file": "SOUL.md",
        "resume_args": ("-c",),
        "acs_column": "enabled_hermes",
        "supports_hooks": True,
        "features": ("memories",),
        "config_files": ["config.yaml", ".env"],
        "venv_preserve": "hermes-agent/venv/",
        "mcp_config": {"filename": "config.yaml", "root_key": "mcp_servers"},
        "provider_apply_mode": "additive",
    },
    "opencode": {
        "config_dir": "~/.config/opencode",
        "binary": "opencode",
        "data_dir": "~/.local/share/opencode",
        "prompt_file": "AGENTS.md",
        "resume_args": None,
        "acs_column": "enabled_opencode",
        "supports_hooks": False,
        "features": ("instructions",),
        "config_files": ["opencode.jsonc"],
        "mcp_config": {"filename": "opencode.jsonc", "root_key": "mcp"},
        "provider_apply_mode": "additive",
    },
}



# Agent types that exist in the ACS database but are not yet
# supported as agent-box profile types. Their ``enabled_*`` columns
# must still be read when querying per-type metadata from ACS.
ACS_EXTRA_TYPES: tuple[str, ...] = ("gemini", "grokbuild")


def get_agent_types() -> List[str]:
    """Sorted list of supported agent type ids."""
    return sorted(_AGENT_TYPES.keys())


def get_agent_config(agent_type: str) -> Dict[str, Any] | None:
    """Return the registry entry for an agent type, or None."""
    return _AGENT_TYPES.get(agent_type)


def get_template_dir(agent_type: str) -> Path | None:
    """Absolute path to the template directory for *agent_type*.

    Returns *None* for unknown types. The directory is guaranteed to
    exist on disk for all types shipped with the package.
    """
    p = config.package_dir() / "templates" / agent_type
    return p if p.is_dir() else None


def get_template_data_dir(agent_type: str) -> Path | None:
    """Absolute path to the secondary data template directory, or *None*.

    Only relevant for agents that split config across two locations
    (e.g. OpenCode).
    """
    p = config.package_dir() / "templates" / f"{agent_type}-data"
    return p if p.is_dir() else None


# ---------------------------------------------------------------------------
# Preset registry (WS5)
# ---------------------------------------------------------------------------

def list_presets(agent_type: str) -> List[str]:
    """Sorted preset names for *agent_type* (empty list if none / unknown type)."""
    base = config.package_dir() / "presets" / agent_type
    if not base.is_dir():
        return []
    return sorted(d.name for d in base.iterdir() if d.is_dir())


def get_preset_dir(agent_type: str, name: str) -> Path | None:
    """Absolute path to a preset dir, or None if the preset doesn't exist."""
    p = config.package_dir() / "presets" / agent_type / name
    return p if p.is_dir() else None
