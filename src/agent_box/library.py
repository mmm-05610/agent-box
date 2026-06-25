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
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Agent type registry
# ---------------------------------------------------------------------------
# config_dir — the real (host) directory that bwrap bind-mounts over.
# binary     — the executable invoked as bwrap's child.
# data_dir   — optional second config directory (e.g. OpenCode auth).
# ---------------------------------------------------------------------------

_AGENT_TYPES: Dict[str, Dict[str, Any]] = {
    "claude":   {"config_dir": "~/.claude",          "binary": "claude"},
    "codex":    {"config_dir": "~/.codex",           "binary": "codex"},
    "hermes":   {"config_dir": "~/.hermes",          "binary": "hermes"},
    "opencode": {"config_dir": "~/.config/opencode", "binary": "opencode",
                 "data_dir": "~/.local/share/opencode"},
}


def get_agent_types() -> List[str]:
    """Sorted list of supported agent type ids."""
    return sorted(_AGENT_TYPES.keys())


def get_agent_config(agent_type: str) -> Optional[Dict[str, Any]]:
    """Return {config_dir, binary [, data_dir]} for an agent type, or None."""
    return _AGENT_TYPES.get(agent_type)


def get_template_dir(agent_type: str) -> Optional[Path]:
    """Absolute path to the template directory for *agent_type*.

    Returns *None* for unknown types. The directory is guaranteed to
    exist on disk for all types shipped with the package.
    """
    p = Path(__file__).resolve().parent / "templates" / agent_type
    return p if p.is_dir() else None


def get_template_data_dir(agent_type: str) -> Optional[Path]:
    """Absolute path to the secondary data template directory, or *None*.

    Only relevant for agents that split config across two locations
    (e.g. OpenCode).
    """
    p = Path(__file__).resolve().parent / "templates" / f"{agent_type}-data"
    return p if p.is_dir() else None


# ---------------------------------------------------------------------------
# Preset registry (WS5)
# ---------------------------------------------------------------------------

def list_presets(agent_type: str) -> List[str]:
    """Sorted preset names for *agent_type* (empty list if none / unknown type)."""
    base = Path(__file__).resolve().parent / "presets" / agent_type
    if not base.is_dir():
        return []
    return sorted(d.name for d in base.iterdir() if d.is_dir())


def get_preset_dir(agent_type: str, name: str) -> Optional[Path]:
    """Absolute path to a preset dir, or None if the preset doesn't exist."""
    p = Path(__file__).resolve().parent / "presets" / agent_type / name
    return p if p.is_dir() else None
