"""Stable Server-assigned opaque identifiers and record timestamps."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def opaque_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"
