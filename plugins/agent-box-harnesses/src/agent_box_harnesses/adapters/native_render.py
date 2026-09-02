"""Pure native-configuration renderers (in-memory only; no filesystem I/O).

Each Harness owns its native configuration format; these helpers turn an
already-validated payload mapping into file bytes for the Composer.
JSON bytes are valid YAML 1.2, which is how the Hermes YAML config is
rendered (documented native behavior, harnesses/hermes FACTS D).
"""
from __future__ import annotations

import json
from typing import Any, Mapping


def render_json(value: Mapping[str, Any]) -> bytes:
    """Strict JSON bytes (Claude settings, OpenCode config, Pi settings)."""
    return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode()


def render_yaml_via_json(value: Mapping[str, Any]) -> bytes:
    """JSON is a YAML 1.2 subset; Hermes parses it as native config.yaml."""
    return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode()


def render_toml(value: Mapping[str, Any]) -> bytes:
    """Minimal bounded TOML serializer for Codex config.toml payloads.

    Supports the shapes a validated payload can contain: tables, arrays of
    tables, scalar arrays and scalars.  ``None`` is not a TOML value and is
    rejected; the caller's validation already bounds sizes.
    """
    lines: list[str] = []
    _emit_table(value, (), lines)
    return ("\n".join(lines) + ("\n" if lines else "")).encode()


def _key(token: str) -> str:
    if token and all(character.isalnum() or character in "-_" for character in token):
        return token
    return json.dumps(token, ensure_ascii=False)


def _scalar(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    raise ValueError("TOML_VALUE_NOT_RENDERABLE")


def _scalar_array(value: list[Any]) -> str:
    if not value:
        return "[]"
    if any(isinstance(item, (dict, list)) for item in value):
        raise ValueError("TOML_VALUE_NOT_RENDERABLE")
    return "[" + ", ".join(_scalar(item) for item in value) + "]"


def _emit_table(table: Mapping[str, Any], path: tuple[str, ...], lines: list[str]) -> None:
    scalars: list[tuple[str, Any]] = []
    tables: list[tuple[str, Any]] = []
    table_arrays: list[tuple[str, list[Any]]] = []
    for key, item in table.items():
        if item is None:
            raise ValueError("TOML_VALUE_NOT_RENDERABLE")
        if isinstance(item, dict):
            tables.append((key, item))
        elif isinstance(item, list) and item and all(isinstance(entry, dict) for entry in item):
            table_arrays.append((key, item))
        elif isinstance(item, list):
            scalars.append((key, _scalar_array(item)))
        else:
            scalars.append((key, _scalar(item)))
    if path:
        header = "[" + ".".join(_key(part) for part in path) + "]"
        if lines:
            lines.append("")
        lines.append(header)
    for key, rendered in scalars:
        lines.append(f"{_key(key)} = {rendered}")
    for key, item in tables:
        _emit_table(item, (*path, key), lines)
    for key, entries in table_arrays:
        for entry in entries:
            array_path = (*path, key)
            if lines:
                lines.append("")
            lines.append("[[" + ".".join(_key(part) for part in array_path) + "]]")
            for entry_key, entry_value in entry.items():
                if isinstance(entry_value, dict) or (isinstance(entry_value, list) and entry_value and all(isinstance(e, dict) for e in entry_value)):
                    _emit_table({entry_key: entry_value}, array_path, lines)
                elif isinstance(entry_value, list):
                    lines.append(f"{_key(entry_key)} = {_scalar_array(entry_value)}")
                else:
                    lines.append(f"{_key(entry_key)} = {_scalar(entry_value)}")


__all__ = ["render_json", "render_toml", "render_yaml_via_json"]
