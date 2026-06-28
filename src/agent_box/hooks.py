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
from typing import Any, Dict, Optional

from . import config
from ._io import atomic_write_json
from .profile import ProfileError, load_meta


def _settings_path(profile_name: str) -> Path:
    """Absolute path to the profile's ``dot-claude/settings.json``."""
    return config.profile_agent_dir(profile_name, "claude") / "settings.json"


def _require_claude_profile(profile_name: str) -> None:
    """Raise :class:`ProfileError` unless *profile_name* is a Claude profile."""
    meta = load_meta(profile_name)
    if meta["agent_type"] != "claude":
        raise ProfileError(
            f"hooks are only supported for claude profiles "
            f"(profile {profile_name!r} is {meta['agent_type']!r})"
        )


def _read_settings(profile_name: str) -> Dict[str, Any]:
    """Read the profile's settings.json, returning an empty dict if missing.

    Raises :class:`ProfileError` if the file exists but isn't valid JSON.
    """
    path = _settings_path(profile_name)
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ProfileError(
            f"{profile_name}: settings.json is not valid JSON: {exc}"
        ) from exc
    if not isinstance(data, dict):
        raise ProfileError(
            f"{profile_name}: settings.json must be a JSON object, got "
            f"{type(data).__name__}"
        )
    return data


def get_hooks(profile_name: str) -> Optional[Dict[str, Any]]:
    """Return the hooks from ``settings.json``, or ``None`` if not set.

    Raises :class:`ProfileError` if settings.json is invalid JSON,
    or if the profile isn't a Claude profile.
    """
    _require_claude_profile(profile_name)
    settings = _read_settings(profile_name)
    hooks = settings.get("hooks")
    if hooks is None:
        return None
    if not isinstance(hooks, dict):
        raise ProfileError(
            f"{profile_name}: settings.json 'hooks' must be a JSON object, "
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
    _require_claude_profile(profile_name)
    try:
        data = json.loads(data_json)
    except json.JSONDecodeError as exc:
        raise ProfileError(
            f"hooks data is not valid JSON: {exc}"
        ) from exc
    if not isinstance(data, dict):
        raise ProfileError(
            f"hooks data must be a JSON object, got {type(data).__name__}"
        )

    # Read existing settings, replace only the hooks key, write back.
    settings = _read_settings(profile_name)
    settings["hooks"] = data
    target = _settings_path(profile_name)
    atomic_write_json(target, settings)
    return data


__all__ = [
    "get_hooks",
    "upsert_hooks",
]
