"""Typed failure taxonomy for the generic ACP client engine.

Codes are protocol-domain, bounded, and never strings smuggled as routing:
each failure is a typed class carrying ``code`` and a bounded ``detail``.
Upper layers (Harness Session Drivers) map these onto their own stage
taxonomy; the engine itself knows no Harness names.
"""
from __future__ import annotations

from enum import Enum

# Canonical protocol-domain failure codes (stable vocabulary).
PROTOCOL_INITIALIZE_FAILED = "PROTOCOL_INITIALIZE_FAILED"
PROTOCOL_VERSION_INCOMPATIBLE = "PROTOCOL_VERSION_INCOMPATIBLE"
SESSION_START_REJECTED = "SESSION_START_REJECTED"
SESSION_START_AMBIGUOUS = "SESSION_START_AMBIGUOUS"
TRANSPORT_CLOSED = "TRANSPORT_CLOSED"
MALFORMED_PROTOCOL_MESSAGE = "MALFORMED_PROTOCOL_MESSAGE"
PERMISSION_TIMEOUT = "PERMISSION_TIMEOUT"
CANCEL_FAILED = "CANCEL_FAILED"
CLEANUP_FAILED = "CLEANUP_FAILED"
FRAME_TOO_LARGE = "FRAME_TOO_LARGE"
INBOUND_QUEUE_OVERFLOW = "INBOUND_QUEUE_OVERFLOW"
PROTOCOL_METHOD_NOT_FOUND = "PROTOCOL_METHOD_NOT_FOUND"
INTERNAL = "INTERNAL"


class AcpErrorCode(str, Enum):
    PROTOCOL_INITIALIZE_FAILED = PROTOCOL_INITIALIZE_FAILED
    PROTOCOL_VERSION_INCOMPATIBLE = PROTOCOL_VERSION_INCOMPATIBLE
    SESSION_START_REJECTED = SESSION_START_REJECTED
    SESSION_START_AMBIGUOUS = SESSION_START_AMBIGUOUS
    TRANSPORT_CLOSED = TRANSPORT_CLOSED
    MALFORMED_PROTOCOL_MESSAGE = MALFORMED_PROTOCOL_MESSAGE
    PERMISSION_TIMEOUT = PERMISSION_TIMEOUT
    CANCEL_FAILED = CANCEL_FAILED
    CLEANUP_FAILED = CLEANUP_FAILED
    FRAME_TOO_LARGE = FRAME_TOO_LARGE
    INBOUND_QUEUE_OVERFLOW = INBOUND_QUEUE_OVERFLOW
    PROTOCOL_METHOD_NOT_FOUND = PROTOCOL_METHOD_NOT_FOUND
    INTERNAL = INTERNAL


class AcpEngineError(RuntimeError):
    """Base class for engine failures; ``code`` is one of the enum values."""

    code = INTERNAL
    stage = "ACP"

    def __init__(self, code: str, detail: str = "") -> None:
        self.code = code
        self.detail = detail[:512]
        super().__init__(f"ACP:{code}" + (f": {self.detail}" if self.detail else ""))


class InitializeFailed(AcpEngineError):
    code = PROTOCOL_INITIALIZE_FAILED


class ProtocolVersionIncompatible(AcpEngineError):
    code = PROTOCOL_VERSION_INCOMPATIBLE


class SessionStartRejected(AcpEngineError):
    code = SESSION_START_REJECTED


class SessionStartAmbiguous(AcpEngineError):
    code = SESSION_START_AMBIGUOUS


class TransportClosed(AcpEngineError):
    code = TRANSPORT_CLOSED


class MalformedProtocolMessage(AcpEngineError):
    code = MALFORMED_PROTOCOL_MESSAGE


class PermissionTimeoutError(AcpEngineError):
    code = PERMISSION_TIMEOUT


class CancelFailed(AcpEngineError):
    code = CANCEL_FAILED


class CleanupFailed(AcpEngineError):
    code = CLEANUP_FAILED


__all__ = [
    "CANCEL_FAILED",
    "CLEANUP_FAILED",
    "FRAME_TOO_LARGE",
    "INBOUND_QUEUE_OVERFLOW",
    "INTERNAL",
    "MALFORMED_PROTOCOL_MESSAGE",
    "PERMISSION_TIMEOUT",
    "PROTOCOL_INITIALIZE_FAILED",
    "PROTOCOL_METHOD_NOT_FOUND",
    "PROTOCOL_VERSION_INCOMPATIBLE",
    "SESSION_START_AMBIGUOUS",
    "SESSION_START_REJECTED",
    "TRANSPORT_CLOSED",
    "AcpEngineError",
    "AcpErrorCode",
    "CancelFailed",
    "CleanupFailed",
    "InitializeFailed",
    "MalformedProtocolMessage",
    "PermissionTimeoutError",
    "ProtocolVersionIncompatible",
    "SessionStartAmbiguous",
    "SessionStartRejected",
    "TransportClosed",
]