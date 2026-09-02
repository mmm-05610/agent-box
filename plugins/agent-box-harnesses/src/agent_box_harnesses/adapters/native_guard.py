"""Shared bounded, credential-free validation for Harness native payloads.

Every per-Harness adapter validates its native payload through this guard
before the payload can influence a LaunchPlan.  The guard is pure: it never
reads files, mutates state, or touches the host environment.
"""
from __future__ import annotations

import json
import re
from typing import Any, Mapping

MAX_PAYLOAD_BYTES = 65536
MAX_TOP_LEVEL_KEYS = 128
MAX_LIST_ITEMS = 128
MAX_STRING_CHARS = 8192
MAX_DEPTH = 8

# Field names that must never appear in a Profile payload, a LaunchPlan, or a
# rendered native configuration.  Mirrors the Profile Store ban list.
SECRET_FIELD = re.compile(
    r"(secret|token|api[_-]?key|password|private[_-]?key|authorization|cookie|credential_value|host_path)",
    re.I,
)


def secret_field_forbidden(key: str) -> bool:
    return bool(isinstance(key, str) and SECRET_FIELD.search(key))


def bounded_native_payload(payload: Any) -> dict[str, Any]:
    """Reject credential-shaped, oversized, or non-renderable payload shapes.

    Returns the payload unchanged when valid; raises ``ValueError`` with a
    bounded code otherwise.  Only str/int/float/bool/None/dict/list may pass.
    """
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=_unrenderable)
    if len(encoded.encode()) > MAX_PAYLOAD_BYTES:
        raise ValueError("NATIVE_PAYLOAD_TOO_LARGE")
    _scan(payload, depth=0)
    if not isinstance(payload, dict):
        raise ValueError("NATIVE_PAYLOAD_OBJECT_REQUIRED")
    return payload


def _unrenderable(value: Any) -> Any:
    raise ValueError("NATIVE_PAYLOAD_VALUE_NOT_RENDERABLE")


def _scan(value: Any, *, depth: int) -> None:
    if depth > MAX_DEPTH:
        raise ValueError("NATIVE_PAYLOAD_TOO_DEEP")
    if isinstance(value, dict):
        if len(value) > MAX_TOP_LEVEL_KEYS:
            raise ValueError("FIELD_LIMIT_EXCEEDED")
        for key, item in value.items():
            if not isinstance(key, str) or not key or len(key) > 96:
                raise ValueError("NATIVE_PAYLOAD_KEY_INVALID")
            if secret_field_forbidden(key):
                raise ValueError("SECRET_FIELD_FORBIDDEN")
            _scan(item, depth=depth + 1)
    elif isinstance(value, list):
        if len(value) > MAX_LIST_ITEMS:
            raise ValueError("FIELD_LIMIT_EXCEEDED")
        for item in value:
            _scan(item, depth=depth + 1)
    elif isinstance(value, str):
        if len(value) > MAX_STRING_CHARS:
            raise ValueError("FIELD_TOO_LARGE")
        if "\0" in value:
            raise ValueError("NATIVE_PAYLOAD_NUL_FORBIDDEN")
    elif isinstance(value, (int, float, bool)) or value is None:
        return
    else:
        raise ValueError("NATIVE_PAYLOAD_VALUE_NOT_RENDERABLE")


def unknown_keys(payload: Mapping[str, Any], known: frozenset[str]) -> tuple[str, ...]:
    """Bounded diagnostics helper: top-level keys outside a documented set."""
    return tuple(sorted(set(str(key) for key in payload) - set(known)))


__all__ = [
    "MAX_PAYLOAD_BYTES",
    "bounded_native_payload",
    "secret_field_forbidden",
    "unknown_keys",
]
