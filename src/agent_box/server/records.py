"""Canonical product-record encoding shared by neutral use cases."""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Mapping

from agent_box.server.errors import ServerError


_SENSITIVE = re.compile(r"(secret|token|api[_-]?key|password|private[_-]?key|authorization|cookie|credential_value)", re.I)


def canonical(value: Any) -> bytes:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    if len(encoded) > 262_144:
        raise ServerError("REQUEST_TOO_LARGE", "Request content exceeds the product record limit", status=422)
    return encoded


def digest(value: Any) -> str:
    return "sha256:" + hashlib.sha256(canonical(value)).hexdigest()


def reject_sensitive_keys(value: Any) -> None:
    if isinstance(value, Mapping):
        for key, child in value.items():
            if _SENSITIVE.search(str(key)):
                raise ServerError("SECRET_FIELD_FORBIDDEN", "Configuration contains a forbidden secret field", status=422)
            reject_sensitive_keys(child)
    elif isinstance(value, list):
        for child in value:
            reject_sensitive_keys(child)
