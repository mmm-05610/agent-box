"""Hooks read/write — embedded in Claude Code ``settings.json``.

Claude Code reads hooks from the ``"hooks"`` key inside
``settings.json`` — there is no standalone hooks file for user or
project config (``hooks/hooks.json`` is for plugins only).

Why no DB table?
  * Hooks live inside settings.json, which agent-box reads/writes
    as a JSON object. The hooks key is extracted/merged on the fly.
  * If we ever need shared hook templates, add a ``hooks`` table then.

The on-disk shape matches Claude Code's documented schema::

    {
      "hooks": {
        "PostToolUse": [
          { "matcher": "Write|Edit",
            "hooks": [
              { "type": "command", "command": "npx biome format --write $FILE_PATH" }
            ]
          }
        ]
      }
    }

Each top-level key under ``"hooks"`` is a Claude Code event name
(PreToolUse, PostToolUse, Notification, Stop, SubagentStop,
SessionStart, SessionEnd, …). Values are arrays of matcher objects.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from .. import config
from ..core.io import read_json, read_yaml, write_json, write_yaml
from ..core.library import get_agent_config
from .profile import ProfileError, load_meta

# Registry-driven format dispatch (Rule 5).
_READERS = {"json": read_json, "yaml": read_yaml}
_WRITERS = {"json": write_json, "yaml": write_yaml}


def _hooks_format(profile_name: str) -> str:
    """Return the serialization format for hooks (``json`` / ``yaml``)."""
    meta = load_meta(profile_name)
    agent_config = get_agent_config(meta["agent_type"])
    if agent_config is None:
        raise ProfileError(f"unknown agent_type {meta['agent_type']!r}")
    fmt = agent_config.get("hooks_format")
    if fmt is None:
        raise ProfileError(
            f"hooks format not configured for {meta['agent_type']!r}"
        )
    return fmt


def _hooks_key(profile_name: str) -> str:
    """Return the top-level key that holds hooks in the config file."""
    meta = load_meta(profile_name)
    agent_config = get_agent_config(meta["agent_type"])
    if agent_config is None:
        raise ProfileError(f"unknown agent_type {meta['agent_type']!r}")
    return agent_config.get("hooks_key", "hooks")


def _settings_path(profile_name: str) -> Path:
    """Absolute path to the profile's settings file (the one that hosts hooks).

    The filename comes from the agent-type registry's ``config_files[0]``
    so adding a new agent type that supports hooks is a registry-only
    change (Rule 5).  Today only Claude has ``supports_hooks: True`` and
    lists ``settings.json`` as its first config file.
    """
    meta = load_meta(profile_name)
    agent_type = meta["agent_type"]
    agent_config = get_agent_config(agent_type)
    if agent_config is None:
        raise ProfileError(f"unknown agent_type {agent_type!r}")
    config_files = list(agent_config.get("config_files") or [])
    if not config_files:
        raise ProfileError(
            f"agent_type {agent_type!r} has no config_files"
        )
    return config.profile_agent_dir(profile_name, agent_type) / config_files[0]


def _require_hooks_support(profile_name: str) -> None:
    """Raise :class:`ProfileError` unless *profile_name* supports hooks."""
    meta = load_meta(profile_name)
    agent_config = get_agent_config(meta["agent_type"])
    if not agent_config or not agent_config.get("supports_hooks"):
        raise ProfileError(
            f"hooks are not supported for {meta['agent_type']} profiles"
        )


def _read_settings(profile_name: str) -> Dict[str, Any]:
    """Read the profile's settings file, returning an empty dict if missing.

    The file format (JSON / YAML) is determined by the agent-type
    registry's ``hooks_format`` field.
    """
    path = _settings_path(profile_name)
    if not path.is_file():
        return {}
    fmt = _hooks_format(profile_name)
    reader = _READERS[fmt]
    try:
        data = reader(path)
    except (json.JSONDecodeError, Exception) as exc:
        raise ProfileError(
            f"{profile_name}: {path.name} is not valid {fmt}: {exc}"
        ) from exc
    if not isinstance(data, dict):
        raise ProfileError(
            f"{profile_name}: {path.name} must be a dict, got "
            f"{type(data).__name__}"
        )
    return data


def get_hooks(profile_name: str) -> Dict[str, Any] | None:
    """Return the hooks from ``settings.json``, or ``None`` if not set.

    Raises :class:`ProfileError` if settings.json is invalid JSON,
    or if the profile isn't a Claude profile.
    """
    _require_hooks_support(profile_name)
    settings = _read_settings(profile_name)
    key = _hooks_key(profile_name)
    hooks = settings.get(key)
    if hooks is None:
        return None
    if not isinstance(hooks, dict):
        raise ProfileError(
            f"{profile_name}: {key!r} must be an object, "
            f"got {type(hooks).__name__}"
        )
    return hooks


def upsert_hooks(profile_name: str, data_json: str) -> Dict[str, Any]:
    """Write hooks into the profile's ``settings.json`` → ``"hooks"`` key.

    The input must be a JSON object (the top-level Claude Code hooks
    schema: event-name → array of matcher objects). All other keys in
    settings.json are preserved untouched — only ``"hooks"`` is
    overwritten.

    Raises :class:`ProfileError` for invalid JSON, non-object shapes,
    or non-Claude profiles.
    """
    _require_hooks_support(profile_name)
    try:
        data = json.loads(data_json)
    except json.JSONDecodeError as exc:
        raise ProfileError(
            f"hooks data is not valid JSON: {exc}"
        ) from exc
    if not isinstance(data, dict):
        raise ProfileError(
            f"hooks data must be an object, got {type(data).__name__}"
        )

    settings = _read_settings(profile_name)
    key = _hooks_key(profile_name)
    settings[key] = data
    target = _settings_path(profile_name)
    fmt = _hooks_format(profile_name)
    _WRITERS[fmt](target, settings)
    return data


__all__ = [
    "get_hooks",
    "upsert_hooks",
]
