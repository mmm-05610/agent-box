"""Generic JSON-RPC 2.0 message values for the ACP stdio transport.

The wire vocabulary stays protocol-generic: methods, ids and params are
plain, bounded values.  No Harness identity appears here.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping

# JSON-RPC 2.0 reserved error codes (bounded constant set).
PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603
# Protocol-level client error range used by ACP clients for custom rejections.
CLIENT_REJECTION_ERROR = -32800

MAX_METHOD_LEN = 128
MAX_ID_LEN = 128


@dataclass(frozen=True)
class RpcRequest:
    method: str
    id: object
    params: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not isinstance(self.method, str) or not self.method or len(self.method) > MAX_METHOD_LEN or "\0" in self.method:
            raise ValueError("invalid rpc method")
        if not isinstance(self.id, (str, int)) or isinstance(self.id, bool) or (
            isinstance(self.id, str) and (not self.id or len(self.id) > MAX_ID_LEN)
        ):
            raise ValueError("invalid rpc id")
        object.__setattr__(self, "params", dict(self.params))


@dataclass(frozen=True)
class RpcNotification:
    method: str
    params: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not isinstance(self.method, str) or not self.method or len(self.method) > MAX_METHOD_LEN or "\0" in self.method:
            raise ValueError("invalid rpc method")
        object.__setattr__(self, "params", dict(self.params))


@dataclass(frozen=True)
class RpcSuccess:
    id: object
    result: Any = None


@dataclass(frozen=True)
class RpcFailure:
    id: object
    code: int
    message: str = ""
    data: Any = None

    def __post_init__(self) -> None:
        if not isinstance(self.code, int):
            raise ValueError("rpc error code must be an integer")
        object.__setattr__(self, "message", str(self.message)[:256])


@dataclass(frozen=True)
class RpcMessage:
    """One decoded JSON-RPC message, classified by shape (never by method)."""

    request: RpcRequest | None = None
    notification: RpcNotification | None = None
    success: RpcSuccess | None = None
    failure: RpcFailure | None = None

    @property
    def kind(self) -> str:
        if self.request is not None:
            return "request"
        if self.notification is not None:
            return "notification"
        if self.success is not None:
            return "success"
        if self.failure is not None:
            return "failure"
        return "invalid"


def _id_of(value: object) -> object:
    if not isinstance(value, (str, int)) or isinstance(value, bool):
        raise ValueError("invalid rpc id")
    return value


def classify(raw: Mapping[str, Any]) -> RpcMessage:
    """Classify one decoded JSON-RPC object into a typed message.

    Unknown shapes are rejected (fail closed) rather than guessed.
    """
    if not isinstance(raw, dict):
        raise ValueError("rpc message must be an object")
    has_method = isinstance(raw.get("method"), str)
    has_id = "id" in raw
    if has_method and not has_id:
        return RpcMessage(notification=RpcNotification(raw["method"], dict(raw.get("params", {})) if isinstance(raw.get("params"), dict) else {}))
    if has_method and has_id:
        return RpcMessage(request=RpcRequest(raw["method"], _id_of(raw["id"]), dict(raw.get("params", {})) if isinstance(raw.get("params"), dict) else {}))
    if has_id and "result" in raw:
        return RpcMessage(success=RpcSuccess(_id_of(raw["id"]), raw.get("result")))
    if has_id and "error" in raw:
        error = raw["error"]
        if not isinstance(error, dict) or "code" not in error:
            raise ValueError("rpc error object is malformed")
        return RpcMessage(failure=RpcFailure(_id_of(raw["id"]), int(error.get("code", 0)), str(error.get("message", "")), error.get("data")))
    raise ValueError("rpc message shape is not request/notification/success/failure")


__all__ = [
    "CLIENT_REJECTION_ERROR",
    "INVALID_PARAMS",
    "INVALID_REQUEST",
    "INTERNAL_ERROR",
    "METHOD_NOT_FOUND",
    "PARSE_ERROR",
    "RpcFailure",
    "RpcMessage",
    "RpcNotification",
    "RpcRequest",
    "RpcSuccess",
    "classify",
]