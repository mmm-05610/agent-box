"""wire/1 transport: envelope, error families, cursors, and projections.

This package implements the Desktop↔Server contract candidate produced by the
frontend P07 checkpoint 2 (`contracts/wire-v1`). It owns encoding only: the
neutral use cases in `server/workspaces|profiles|sessions|approvals|events`
own behavior, and no Harness brand appears here.
"""
from agent_box.server.wire.envelope import (
    CursorCodec,
    WireRequestError,
    decode_request,
    encode_error,
    encode_result,
)
from agent_box.server.wire.errors import WireError, family_for

__all__ = [
    "CursorCodec",
    "WireError",
    "WireRequestError",
    "decode_request",
    "encode_error",
    "encode_result",
    "family_for",
]
