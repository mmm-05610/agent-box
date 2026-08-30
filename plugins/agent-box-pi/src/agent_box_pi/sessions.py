"""Read non-secret native Pi session metadata for Refs and selector choices.

Only session structure (id, file path, cwd, name, model/provider of recorded
turns, first message) is read.  Credentials never appear in session JSONL —
Pi keeps them in its own auth source — so scanning is safe for display.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from .config import PiPluginConfig

_SESSION_HEADER_KEYS = ("id", "timestamp", "cwd")
_INFO_KEYS = ("name",)
_MESSAGE_ROLES = ("user", "assistant")


@dataclass(frozen=True)
class PiSessionInfo:
    session_id: str
    session_file: Path
    cwd: str | None = None
    created_at: str | None = None
    name: str | None = None
    model: str | None = None
    provider: str | None = None
    first_message: str | None = None
    message_count: int = 0
    modified_at: str | None = None

    def to_dict(self) -> dict[str, str]:
        return {
            "session_id": self.session_id,
            "session_file": str(self.session_file),
            "cwd": self.cwd or "",
            "created_at": self.created_at or "",
            "name": self.name or "",
            "model": self.model or "",
            "provider": self.provider or "",
            "first_message": (self.first_message or "")[:200],
            "message_count": str(self.message_count),
            "modified_at": self.modified_at or "",
        }


def _parse_session_entries(path: Path, limit: int = 200_000) -> list[dict]:
    entries: list[dict] = []
    with path.open("r", encoding="utf-8") as stream:
        for line_number, line in enumerate(stream):
            if line_number >= limit:
                break
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return entries


def read_session_info(path: Path) -> PiSessionInfo | None:
    """Return metadata for one session JSONL, or None when unreadable."""
    try:
        entries = _parse_session_entries(path)
    except OSError:
        return None
    header = next((entry for entry in entries if entry.get("type") == "session"), None)
    if header is None or not isinstance(header.get("id"), str) or not header["id"]:
        return None
    name: str | None = None
    model: str | None = None
    provider: str | None = None
    first_message: str | None = None
    message_count = 0
    modified_at: str | None = None
    for entry in entries[1:]:
        entry_type = entry.get("type")
        if entry_type == "session_info":
            value = entry.get("name")
            if isinstance(value, str) and value:
                name = value
            continue
        if entry_type != "message":
            continue
        message = entry.get("message")
        if not isinstance(message, dict):
            continue
        role = message.get("role")
        if role not in _MESSAGE_ROLES:
            continue
        message_count += 1
        if role == "assistant":
            if isinstance(message.get("model"), str) and message["model"]:
                model = message["model"]
            if isinstance(message.get("provider"), str) and message["provider"]:
                provider = message["provider"]
        timestamp = message.get("timestamp")
        if isinstance(timestamp, (int, float)):
            as_time = datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc)
            formatted = as_time.isoformat()
            if modified_at is None or timestamp > _last_timestamp(modified_at):
                modified_at = formatted
        if first_message is None and role == "user":
            content = message.get("content")
            if isinstance(content, str) and content.strip():
                first_message = content.strip()
    return PiSessionInfo(
        session_id=str(header["id"]),
        session_file=path,
        cwd=str(header["cwd"]) if isinstance(header.get("cwd"), str) else None,
        created_at=str(header["timestamp"]) if isinstance(header.get("timestamp"), str) else None,
        name=name,
        model=model,
        provider=provider,
        first_message=first_message,
        message_count=message_count,
        modified_at=modified_at,
    )


def _last_timestamp(iso: str) -> int:
    try:
        return int(datetime.fromisoformat(iso).timestamp() * 1000)
    except ValueError:
        return 0


class PiSessionScanner:
    """List/locate native Pi sessions under the plugin-owned session root."""

    def __init__(self, config: PiPluginConfig) -> None:
        self.config = config

    def locate(self, session_id: str) -> Path | None:
        root = self.config.resolved_session_root
        if not root.is_dir():
            return None
        suffix = f"_{session_id}.jsonl"
        candidates = [path for path in root.rglob(f"*{suffix}") if path.is_file()]
        if not candidates:
            return None
        return max(candidates, key=lambda path: path.stat().st_mtime)

    def list(self) -> tuple[PiSessionInfo, ...]:
        root = self.config.resolved_session_root
        if not root.is_dir():
            return ()
        results: list[PiSessionInfo] = []
        for path in sorted(root.rglob("*.jsonl")):
            if not path.is_file():
                continue
            info = read_session_info(path)
            if info is not None:
                results.append(info)
        results.sort(
            key=lambda item: item.modified_at or item.created_at or "", reverse=True
        )
        return tuple(results)


__all__ = ["PiSessionInfo", "PiSessionScanner", "read_session_info"]
