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

_AGENT_TYPES_FILE = config.agent_types_file()

# Standard resource types declared in the format spec (agent-type-format.md
# §2). Resource keys outside this set are a registry typo — warn on load.
_KNOWN_RESOURCE_TYPES = frozenset({
    "provider", "mcp", "hooks", "prompt", "skills", "permissions",
    "plugins", "rules", "memories", "instructions",
})


def _load_agent_types() -> Dict[str, Dict[str, Any]]:
    """Load and validate the agent-type registry from ``agent_types.json``.

    The registry is the single source of truth for agent types (format
    spec v1).  Every agent must carry ``identity`` and ``runtime`` with
    their required core fields; failures raise a clear error naming the
    agent type and the missing fields — never a silent fallback.
    """
    import json as _json
    import warnings as _warnings

    try:
        with open(_AGENT_TYPES_FILE, encoding="utf-8") as fh:
            data = _json.load(fh)
    except OSError as exc:
        raise RuntimeError(
            f"agent type registry missing or unreadable: "
            f"{_AGENT_TYPES_FILE}: {exc}"
        ) from exc
    except _json.JSONDecodeError as exc:
        raise RuntimeError(
            f"agent type registry is not valid JSON: {_AGENT_TYPES_FILE}: {exc}"
        ) from exc
    if not isinstance(data, dict):
        raise RuntimeError("agent type registry must be a JSON object")

    for agent_type, entry in data.items():
        if not isinstance(entry, dict):
            raise RuntimeError(
                f"agent type {agent_type!r}: registry entry must be an object"
            )
        missing = [k for k in ("identity", "runtime") if k not in entry]
        if missing:
            raise RuntimeError(
                f"agent type {agent_type!r} is missing required field(s): "
                f"{', '.join(missing)}"
            )

        identity = entry["identity"]
        if not isinstance(identity, dict):
            raise RuntimeError(
                f"agent type {agent_type!r}: 'identity' must be an object"
            )
        missing_identity = [
            k for k in ("display_name", "binary") if k not in identity
        ]
        if missing_identity:
            raise RuntimeError(
                f"agent type {agent_type!r}: identity is missing required "
                f"field(s): {', '.join(missing_identity)}"
            )

        runtime = entry["runtime"]
        if not isinstance(runtime, dict):
            raise RuntimeError(
                f"agent type {agent_type!r}: 'runtime' must be an object"
            )
        missing_runtime = [
            k for k in ("config_dir", "profile_dir_suffix", "acs_column")
            if k not in runtime
        ]
        if missing_runtime:
            raise RuntimeError(
                f"agent type {agent_type!r}: runtime is missing required "
                f"field(s): {', '.join(missing_runtime)}"
            )

        resources = entry.get("resources")
        if isinstance(resources, dict):
            unknown = sorted(set(resources) - _KNOWN_RESOURCE_TYPES)
            if unknown:
                _warnings.warn(
                    f"agent type {agent_type!r}: unknown resource type(s): "
                    f"{', '.join(unknown)}",
                    stacklevel=2,
                )
    return data


# Loaded at startup from ``core/agent_types.json`` — the registry content
# lives in the JSON file, not in code (agent-type-format.md §4).
_AGENT_TYPES: Dict[str, Dict[str, Any]] = _load_agent_types()


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
