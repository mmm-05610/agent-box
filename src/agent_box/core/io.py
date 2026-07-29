"""Format-agnostic I/O for profile configuration files.

Every write uses :func:`write_text` internally — data is first serialised
to a string, then written to a temp file + fsync + atomic rename. Every
read accepts a :class:`pathlib.Path` and returns a ``dict`` (or empty
dict when the file is missing / unreadable).
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict

import json5
import tomli_w

# Python 3.11+ ships tomllib in stdlib; fall back to tomli for 3.9/3.10.
try:
    import tomllib
except ImportError:
    import tomli as tomllib  # type: ignore[no-redef]


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


# ── Read primitive ──────────────────────────────────────────────────────────

def read_text(path: Path) -> str | None:
    """Return file contents as a string, or ``None`` when the file is absent."""
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8")


# ── JSON ───────────────────────────────────────────────────────────────────

def read_json(path: Path) -> Dict[str, Any]:
    """Return the parsed JSON object, or ``{}`` when the file is absent."""
    text = read_text(path)
    if text is None:
        return {}
    return json.loads(text)


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
    text = read_text(path)
    if text is None:
        return {}
    return json5.loads(text)


# ── TOML ───────────────────────────────────────────────────────────────────

def read_toml(path: Path) -> Dict[str, Any]:
    """Read a TOML file. Returns empty dict if missing / empty."""
    if not path.is_file():
        return {}
    with open(path, "rb") as fh:
        return tomllib.load(fh) or {}


def write_toml(path: Path, data: Dict[str, Any]) -> None:
    """Write *data* to *path* as TOML."""
    write_text(path, tomli_w.dumps(data))

# ── YAML ───────────────────────────────────────────────────────────────────

def _require_yaml():
    """Import PyYAML (optional dep, only needed for Hermes)."""
    try:
        import yaml
        return yaml
    except ImportError:
        raise RuntimeError(
            "PyYAML is required to read/write Hermes config.yaml "
            "(install with: pip install pyyaml)"
        )


def read_yaml(path: Path) -> Dict[str, Any]:
    """Read a YAML file. Returns empty dict if missing / unreadable."""
    text = read_text(path)
    if text is None:
        return {}
    yaml = _require_yaml()
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError:
        return {}
    return data if isinstance(data, dict) else {}


def write_yaml(path: Path, data: Dict[str, Any]) -> None:
    """Write *data* to *path* as YAML (requires PyYAML)."""
    yaml = _require_yaml()
    text = yaml.safe_dump(data, sort_keys=True, allow_unicode=True)
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
