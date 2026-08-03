"""Hooks read/write — embedded in agent config files.

Hooks live inside the main config file (``settings.json`` for Claude,
``config.yaml`` for Hermes) under a top-level key named in the registry
(``resources.hooks.key``).  The on-disk format (JSON / YAML) is
dispatched from the registry's ``resources.hooks.format`` field.

The public API follows a uniform CRUD convention:
  get_hooks(name)        — read all hooks
  set_hooks(name, data)  — replace all hooks
  add_hooks(name, data)  — merge new hooks on top of existing
  remove_hooks(name, key?) — remove one hook event or clear all
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from .. import config
from ..core.io import deep_merge, read_json, read_yaml, write_json, write_yaml
from ..core.library import get_agent_config
from .profile import ProfileError, load_meta

# Registry-driven format dispatch (Rule 5).
_READERS = {"json": read_json, "yaml": read_yaml}
_WRITERS = {"json": write_json, "yaml": write_yaml}


def _hooks_config(profile_name: str) -> tuple[Path, str, str, str]:
    """Return (path, format, key, agent_type) from resources.hooks."""
    meta = load_meta(profile_name)
    agent_type = meta["agent_type"]
    agent_config = get_agent_config(agent_type)
    if agent_config is None:
        raise ProfileError(f"unknown agent_type {agent_type!r}")
    hooks_res = (agent_config.get("resources") or {}).get("hooks")
    if not isinstance(hooks_res, dict):
        raise ProfileError(
            f"hooks are not supported for {agent_type!r} profiles"
        )
    filename = hooks_res.get("config_file")
    if not filename:
        raise ProfileError(f"hooks config_file not configured for {agent_type!r}")
    fmt = hooks_res.get("format")
    if fmt is None:
        raise ProfileError(f"hooks format not configured for {agent_type!r}")
    key = hooks_res.get("key", "hooks")
    path = config.profile_agent_dir(profile_name, agent_type) / filename
    return path, fmt, key, agent_type


def _read_settings(path: Path, fmt: str) -> Dict[str, Any]:
    """Read a profile's config file, returning empty dict if missing."""
    if not path.is_file():
        return {}
    try:
        data = _READERS[fmt](path)
    except Exception as exc:
        raise ProfileError(
            f"{path.name} is not valid {fmt}: {exc}"
        ) from exc
    if not isinstance(data, dict):
        raise ProfileError(
            f"{path.name} must be a dict, got {type(data).__name__}"
        )
    return data


def _write_settings(path: Path, fmt: str, data: Dict[str, Any]) -> None:
    """Write *data* back to *path* using the correct format."""
    _WRITERS[fmt](path, data)


# ── public API ────────────────────────────────────────────────────────────

def get_hooks(profile_name: str) -> Dict[str, Any] | None:
    """Return the hooks dict, or ``None`` if no hooks are configured."""
    path, fmt, key, _ = _hooks_config(profile_name)
    settings = _read_settings(path, fmt)
    hooks = settings.get(key)
    if hooks is None:
        return None
    if not isinstance(hooks, dict):
        raise ProfileError(
            f"{profile_name}: hooks key {key!r} must be an object, "
            f"got {type(hooks).__name__}"
        )
    return hooks


def _require_hooks_dict(data: Any) -> Dict[str, Any]:
    """Raise if *data* isn't a dict."""
    if not isinstance(data, dict):
        raise ProfileError(
            f"hooks data must be an object, got {type(data).__name__}"
        )
    return data


def set_hooks(profile_name: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Replace the entire hooks key with *data*."""
    data = _require_hooks_dict(data)
    path, fmt, key, _ = _hooks_config(profile_name)
    settings = _read_settings(path, fmt)
    settings[key] = data
    _write_settings(path, fmt, settings)
    return data


def add_hooks(profile_name: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Merge *data* on top of existing hooks (``deep_merge`` semantics)."""
    data = _require_hooks_dict(data)
    path, fmt, key, _ = _hooks_config(profile_name)
    settings = _read_settings(path, fmt)
    hooks = settings.get(key)
    if not isinstance(hooks, dict):
        hooks = {}
    settings[key] = deep_merge(hooks, data)
    _write_settings(path, fmt, settings)
    return settings[key]


def remove_hooks(profile_name: str, event_key: str | None = None) -> bool:
    """Remove *event_key* from hooks, or clear all hooks if no key given.

    Returns ``True`` if something was removed, ``False`` if there was
    nothing to remove.
    """
    path, fmt, key, _ = _hooks_config(profile_name)
    settings = _read_settings(path, fmt)
    hooks = settings.get(key)
    if not isinstance(hooks, dict):
        return False
    if event_key is None:
        del settings[key]
        _write_settings(path, fmt, settings)
        return True
    if event_key in hooks:
        del hooks[event_key]
        settings[key] = hooks
        _write_settings(path, fmt, settings)
        return True
    return False


__all__ = [
    "add_hooks",
    "get_hooks",
    "remove_hooks",
    "set_hooks",
]
