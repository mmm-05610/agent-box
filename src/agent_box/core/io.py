"""Format-agnostic I/O for profile configuration files.

Every write uses :func:`write_text` internally — data is first serialised
to a string, then written to a temp file + fsync + atomic rename. Every
read accepts a :class:`pathlib.Path` and returns a ``dict`` (or empty
dict when the file is missing / unreadable).
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List


# ── Atomic write primitives ────────────────────────────────────────────────

def write_text(path: Path, text: str) -> None:
    """Write *text* to *path* atomically.

    Writes to a temp file in the same directory, fsyncs, then renames
    over the destination.  Readers see either the old content or the
    complete new content — never a partial write.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + f".tmp.{os.getpid()}")
    try:
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        os.rename(tmp, path)
    except OSError:
        try:
            tmp.unlink()
        except OSError:
            pass
        raise


# ── JSON ───────────────────────────────────────────────────────────────────

def read_json(path: Path) -> Dict[str, Any]:
    """Return the parsed JSON object, or ``{}`` when the file is absent."""
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    """Atomic JSON dump with sorted keys for deterministic output."""
    text = json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    write_text(path, text)


# ── JSONC (JSON with Comments) ────────────────────────────────────────────

def read_jsonc(path: Path) -> Dict[str, Any]:
    """Parse a JSONC file — ``//`` and ``/* */`` comments, trailing commas.

    String-aware: does **not** strip ``//`` or ``/*`` inside quoted
    strings, so URLs like ``https://api.example.com/v1`` are preserved.
    Returns ``{}`` when the file is absent.
    """
    if not path.is_file():
        return {}
    return _parse_jsonc(path.read_text(encoding="utf-8"))


def _parse_jsonc(text: str) -> Dict[str, Any]:
    cleaned: List[str] = []
    i = 0
    in_string = False
    string_quote = ""
    while i < len(text):
        c = text[i]
        if in_string:
            cleaned.append(c)
            if c == "\\" and i + 1 < len(text):
                cleaned.append(text[i + 1])
                i += 2
                continue
            if c == string_quote:
                in_string = False
            i += 1
            continue
        if c == "/" and i + 1 < len(text):
            nxt = text[i + 1]
            if nxt == "/":
                while i < len(text) and text[i] != "\n":
                    i += 1
                continue
            if nxt == "*":
                i += 2
                while i + 1 < len(text) and not (text[i] == "*" and text[i + 1] == "/"):
                    i += 1
                i += 2
                continue
        if c in ('"', "'"):
            in_string = True
            string_quote = c
        cleaned.append(c)
        i += 1
    raw = "".join(cleaned)
    raw = re.sub(r",(\s*[}\]])", r"\1", raw)
    return json.loads(raw)


# ── TOML ───────────────────────────────────────────────────────────────────

def read_toml(path: Path) -> Dict[str, Any]:
    """Read a TOML file. Returns empty dict if missing / empty."""
    if not path.is_file():
        return {}
    try:
        import tomllib  # Python 3.11+
    except ImportError:
        import tomli as tomllib  # type: ignore[no-redef]
    with open(path, "rb") as fh:
        return tomllib.load(fh) or {}


def write_toml(path: Path, data: Dict[str, Any]) -> None:
    """Write *data* to *path* as TOML (no third-party dependency)."""
    lines: List[str] = []
    top_scalars: Dict[str, Any] = {}
    top_tables: Dict[str, Dict[str, Any]] = {}
    for k, v in data.items():
        if isinstance(v, dict):
            top_tables[str(k)] = v
        else:
            top_scalars[str(k)] = v
    for k, v in top_scalars.items():
        lines.append(f"{k} = {_toml_literal(v)}")
    if top_scalars and top_tables:
        lines.append("")
    for name, value in top_tables.items():
        if lines and lines[-1] != "":
            lines.append("")
        _emit_toml_section(lines, [name], value)
    text = "\n".join(lines).rstrip("\n") + "\n"
    write_text(path, text)


def _emit_toml_section(lines: List[str], path_parts: List[str],
                       value: Dict[str, Any]) -> None:
    lines.append(f"[{'.'.join(path_parts)}]")
    sub_scalars: Dict[str, Any] = {}
    sub_tables: Dict[str, Dict[str, Any]] = {}
    for k, v in value.items():
        if isinstance(v, dict):
            sub_tables[str(k)] = v
        else:
            sub_scalars[str(k)] = v
    for k, v in sub_scalars.items():
        lines.append(f"{k} = {_toml_literal(v)}")
    for sub_name, sub_value in sub_tables.items():
        lines.append("")
        _emit_toml_section(lines, path_parts + [sub_name], sub_value)


def _toml_literal(v: Any) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return repr(v)
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, list):
        return "[" + ", ".join(_toml_literal(x) for x in v) + "]"
    if isinstance(v, dict):
        items = ", ".join(f"{k} = {_toml_literal(val)}" for k, val in v.items())
        return "{" + items + "}"
    raise ValueError(f"unsupported TOML value type: {type(v).__name__}")


# ── YAML ───────────────────────────────────────────────────────────────────

def read_yaml(path: Path) -> Dict[str, Any]:
    """Read a YAML file. Returns empty dict if missing / unreadable."""
    if not path.is_file():
        return {}
    try:
        import yaml
    except ImportError:
        raise RuntimeError(
            "PyYAML is required to read Hermes config.yaml "
            "(install with: pip install pyyaml)"
        )
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError:
        return {}
    return data if isinstance(data, dict) else {}


def write_yaml(path: Path, data: Dict[str, Any]) -> None:
    """Write *data* to *path* as YAML (requires PyYAML)."""
    try:
        import yaml
    except ImportError as exc:
        raise RuntimeError(
            "PyYAML is required to write Hermes config.yaml "
            "(install with: pip install pyyaml)"
        ) from exc
    text = yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
    write_text(path, text)


# ── Dict utilities ─────────────────────────────────────────────────────────

def deep_merge(base: Dict[str, Any], overlay: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively merge *overlay* onto *base*. Returns a new dict."""
    out: Dict[str, Any] = dict(base)
    for k, v in overlay.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = v
    return out
