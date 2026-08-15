"""Config-file registry — a generic read/write surface over agent-box's
user-editable config files, with format-aware validation.

Both the GUI settings page and the (future) CLI ``config`` command go through
this one resource, so a config file only has to be registered once.  Adding
a new editable file is a single entry in :data:`_CONFIG_FILES`.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List

from .. import config
from ..core import io


# Registry: one entry per user-editable config file, addressed by ``key``.
# ``path`` is relative to ``~/.agent-box``; ``format`` drives both the
# editor's syntax hint and how :func:`write_config_file` validates content.
_CONFIG_FILES: List[Dict[str, str]] = [
    {
        "key": "gui-settings",
        "path": "gui-settings.json",
        "format": "json",
        "description": "GUI 全局设置（projects_dir 等）",
    },
]


def _resolve(key: str) -> Dict[str, str]:
    for entry in _CONFIG_FILES:
        if entry["key"] == key:
            return entry
    raise KeyError(f"unknown config file: {key!r}")


def _path(entry: Dict[str, str]):
    return config.agent_box_home() / entry["path"]


def list_config_files() -> List[Dict[str, Any]]:
    """Registry metadata + whether each file currently exists.

    No content — cheap enough to call on every settings-page mount.
    """
    out: List[Dict[str, Any]] = []
    for entry in _CONFIG_FILES:
        p = _path(entry)
        out.append({
            **entry,
            "exists": p.is_file(),
            "size": p.stat().st_size if p.is_file() else 0,
        })
    return out


def read_config_file(key: str) -> Dict[str, Any]:
    """Return ``{key, path, format, description, content}`` for the editor.

    ``content`` is the raw file text (empty string when the file is absent),
    so the editor always shows the literal bytes the user will be editing.
    """
    entry = _resolve(key)
    content = io.read_text(_path(entry))
    return {**entry, "content": content if content is not None else ""}


def write_config_file(key: str, content: str) -> None:
    """Validate ``content`` against the entry's format, then write atomically.

    Raises ``ValueError`` with a readable message when the content doesn't
    parse as the declared format — the caller surfaces it without touching
    the file.
    """
    entry = _resolve(key)
    _validate(entry["format"], content)
    io.write_text(_path(entry), content)


def _validate(fmt: str, content: str) -> None:
    """Parse ``content`` as ``fmt``; raise ``ValueError`` on failure."""
    try:
        if fmt == "json":
            json.loads(content)
        elif fmt == "jsonc":
            import json5
            json5.loads(content)
        elif fmt == "toml":
            try:
                import tomllib  # py3.11+
            except ImportError:  # pragma: no cover — runtime bundles tomli
                import tomli as tomllib
            tomllib.loads(content)
        elif fmt in ("yaml", "yml"):
            import yaml
            yaml.safe_load(content)
        elif fmt == "text":
            pass
        else:
            raise ValueError(f"unknown format: {fmt!r}")
    except ValueError as exc:
        raise ValueError(f"{fmt} 校验失败：{exc}") from exc
