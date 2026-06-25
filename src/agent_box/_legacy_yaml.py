"""Tiny YAML subset parser used only for migrating v0.4 ``meta.yaml`` files.

v0.4 stored profile metadata in ``profiles/<name>/meta.yaml`` using a
homegrown single-line ``key: value`` writer/parser (no real YAML
library — this was a deliberate v0.4 choice to stay stdlib-only).
v1 moves that data into the ``profiles`` table, but we still need to
read existing v0.4 files during the one-time migration, hence this
helper.
"""
from __future__ import annotations


class LegacyYamlError(Exception):
    """Raised when a v0.4 ``meta.yaml`` line is malformed."""


def _parse_simple_yaml(text: str) -> dict:
    out: dict = {}
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            raise LegacyYamlError(f"malformed meta.yaml line: {raw!r}")
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] in ("'", '"') and value[-1] == value[0]:
            value = value[1:-1]
        out[key] = value
    return out
