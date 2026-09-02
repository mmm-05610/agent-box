"""Newline-delimited JSON framing for the ACP stdio transport.

ACP over stdio is JSON-RPC 2.0 with one JSON value per line (UTF-8, no
embedded newlines).  This module owns only framing; it has no protocol or
Harness vocabulary beyond that constraint.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Mapping

from .errors import FRAME_TOO_LARGE, MALFORMED_PROTOCOL_MESSAGE, MalformedProtocolMessage

DEFAULT_MAX_FRAME_BYTES = 1 << 20  # 1 MiB per protocol frame
DEFAULT_MAX_DEPTH = 16
MAX_LINE_BUFFER_BYTES = 4 << 20  # partial-line accumulation bound (defense in depth)


class FrameTooLarge(MalformedProtocolMessage):
    code = FRAME_TOO_LARGE


@dataclass
class FrameDecoder:
    """Incremental line splitter with a hard partial-line bound.

    Frames may arrive split across arbitrary chunk boundaries; a single
    logical line longer than ``max_frame_bytes`` is rejected fail closed and
    the accumulated partial buffer is dropped (resynchronization).
    """

    max_frame_bytes: int = DEFAULT_MAX_FRAME_BYTES

    def __post_init__(self) -> None:
        self._buffer = bytearray()

    def feed(self, chunk: bytes) -> list[bytes]:
        """Consume one byte chunk; return every complete line produced."""
        if not chunk:
            return []
        lines: list[bytes] = []
        self._buffer.extend(chunk)
        while True:
            newline = self._buffer.find(b"\n")
            if newline < 0:
                break
            raw = bytes(self._buffer[:newline])
            del self._buffer[: newline + 1]
            if raw.endswith(b"\r"):
                raw = raw[:-1]
            if len(raw) > self.max_frame_bytes:
                raise FrameTooLarge(
                    FRAME_TOO_LARGE,
                    f"frame exceeds {self.max_frame_bytes} bytes",
                )
            lines.append(raw)
        if len(self._buffer) > MAX_LINE_BUFFER_BYTES:
            raise FrameTooLarge(FRAME_TOO_LARGE, "partial line exceeds buffering bound")
        return lines

    def has_partial(self) -> bool:
        return bool(self._buffer)


def _check_depth(value: object, depth: int, bound: int) -> None:
    if depth > bound:
        raise MalformedProtocolMessage(MALFORMED_PROTOCOL_MESSAGE, "message nesting too deep")
    if isinstance(value, dict):
        for item in value.values():
            _check_depth(item, depth + 1, bound)
    elif isinstance(value, list):
        for item in value:
            _check_depth(item, depth + 1, bound)


def encode_message(payload: Mapping[str, object], *, max_bytes: int = DEFAULT_MAX_FRAME_BYTES) -> bytes:
    """Serialize one JSON-RPC payload to a single protocol line (no newline)."""
    _check_depth(payload, 0, DEFAULT_MAX_DEPTH)
    # json.dumps with ensure_ascii=True escapes every control character, so
    # an encoded frame can never contain a literal newline; only size is
    # bounded here.
    text = json.dumps(payload, separators=(",", ":"), ensure_ascii=True)
    if len(text.encode("utf-8")) > max_bytes:
        raise MalformedProtocolMessage(FRAME_TOO_LARGE, "encoded frame exceeds bound")
    return text.encode("utf-8")


def decode_line(raw: bytes, *, max_bytes: int = DEFAULT_MAX_FRAME_BYTES,
                max_depth: int = DEFAULT_MAX_DEPTH) -> Mapping[str, Any]:
    """Decode one protocol line into a JSON-RPC message mapping (bounded)."""
    if len(raw) > max_bytes:
        raise MalformedProtocolMessage(FRAME_TOO_LARGE, "frame exceeds bound")
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise MalformedProtocolMessage(MALFORMED_PROTOCOL_MESSAGE, "malformed JSON") from exc
    if not isinstance(value, dict):
        raise MalformedProtocolMessage(MALFORMED_PROTOCOL_MESSAGE, "protocol message must be a JSON object")
    _check_depth(value, 0, max_depth)
    return value


__all__ = [
    "DEFAULT_MAX_DEPTH",
    "DEFAULT_MAX_FRAME_BYTES",
    "FrameDecoder",
    "FrameTooLarge",
    "MAX_LINE_BUFFER_BYTES",
    "decode_line",
    "encode_message",
]