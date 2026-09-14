"""wire/1 envelope encoding and opaque cursor codec.

Envelope shape is fixed by the contract candidate: JSON-RPC 2.0 shaped
requests with `method` matched against the registered method table, and
responses that carry exactly one of `result` or `error`.

Cursors are opaque to the client. Encoding is versioned so a cursor minted by a
different server generation can be recognised and answered with
`resync_required` rather than silently misread.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
from typing import Any, Mapping

from agent_box.server.wire.errors import WireError


METHOD_PATTERN = re.compile(r"^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$")
CURSOR_PREFIX = "w1"
OLDER_CURSOR_PREFIX = "w1o"


class WireRequestError(WireError):
    pass


def decode_request(body: Any) -> tuple[Any, str, Mapping[str, Any]]:
    """Validate one wire request; returns (id, method, params)."""
    if not isinstance(body, Mapping):
        raise WireRequestError("INVALID_REQUEST", "Request must be a JSON object")
    if body.get("jsonrpc") != "2.0":
        raise WireRequestError("INVALID_REQUEST", "jsonrpc must be exactly '2.0'")
    if "id" not in body or not isinstance(body["id"], (str, int, float)) or isinstance(body["id"], bool):
        raise WireRequestError("INVALID_REQUEST", "id must be a string or number")
    method = body.get("method")
    if not isinstance(method, str) or not METHOD_PATTERN.match(method):
        raise WireRequestError("INVALID_REQUEST", "method is not a wire/1 method name")
    params = body.get("params", {})
    if not isinstance(params, Mapping):
        raise WireRequestError("INVALID_REQUEST", "params must be an object")
    if set(body) - {"jsonrpc", "id", "method", "params"}:
        raise WireRequestError("INVALID_REQUEST", "Request carries unknown members")
    return body["id"], method, params


def encode_result(request_id: Any, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def encode_error(request_id: Any, error: WireError) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "error": error.to_body()}


class CursorCodec:
    """Mint and read opaque session cursors.

    A cursor addresses one position in one session's durable event order. It is
    authenticated with the per-instance server secret so a cursor cannot be
    hand-forged into another session or an out-of-range position.
    """

    def __init__(self, secret: bytes) -> None:
        self._key = hashlib.sha256(secret).digest()

    def encode(self, session_id: str, seq: int) -> str:
        return self._encode(CURSOR_PREFIX, session_id, seq)

    def encode_older(self, session_id: str, raw_seq: int) -> str:
        """Mint a backward-history cursor that cannot resume the live feed."""
        return self._encode(OLDER_CURSOR_PREFIX, session_id, raw_seq)

    def _encode(self, prefix: str, session_id: str, seq: int) -> str:
        payload = f"{prefix}:{session_id}:{seq}".encode("utf-8")
        signature = hmac.new(self._key, payload, hashlib.sha256).digest()[:12]
        return f"{payload.decode('utf-8')}:{base64.urlsafe_b64encode(signature).decode('ascii').rstrip('=')}"

    def decode(self, cursor: str, *, expected_session: str | None = None) -> tuple[str, int]:
        return self._decode(cursor, CURSOR_PREFIX, expected_session=expected_session)

    def decode_older(self, cursor: str, *, expected_session: str | None = None) -> tuple[str, int]:
        return self._decode(cursor, OLDER_CURSOR_PREFIX, expected_session=expected_session)

    def _decode(
        self, cursor: str, expected_prefix: str, *, expected_session: str | None = None,
    ) -> tuple[str, int]:
        try:
            prefix, session_id, raw_seq, raw_signature = cursor.split(":", 3)
        except (AttributeError, ValueError) as exc:
            raise WireError("INVALID_REQUEST", "cursor is not a wire/1 cursor") from exc
        if prefix != expected_prefix:
            raise WireError("INVALID_REQUEST", "cursor generation is not supported")
        payload = f"{prefix}:{session_id}:{raw_seq}".encode("utf-8")
        padded = raw_signature + "=" * (-len(raw_signature) % 4)
        try:
            provided = base64.urlsafe_b64decode(padded)
        except (ValueError, TypeError) as exc:
            raise WireError("INVALID_REQUEST", "cursor signature is malformed") from exc
        expected = hmac.new(self._key, payload, hashlib.sha256).digest()[:12]
        if not hmac.compare_digest(provided, expected):
            raise WireError("INVALID_REQUEST", "cursor signature did not verify")
        if expected_session is not None and session_id != expected_session:
            raise WireError("INVALID_REQUEST", "cursor belongs to a different session")
        try:
            seq = int(raw_seq)
        except ValueError as exc:
            raise WireError("INVALID_REQUEST", "cursor position is malformed") from exc
        if seq < 0:
            raise WireError("INVALID_REQUEST", "cursor position is malformed")
        return session_id, seq


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
