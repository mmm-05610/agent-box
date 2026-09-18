"""wire/1 error families and the mapping from internal ServerError codes.

The client branches on the small closed family set from the contract; the
precise internal code survives in `details.internalCode` so diagnostics are not
lost and a wire family never has to be guessed from an arbitrary string.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping


FAMILIES = frozenset({
    "UNAVAILABLE",
    "UNAUTHENTICATED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT_VERSION",
    "CONFLICT_REQUEST",
    "CONFLICT_REFERENCE",
    "INVALID_REQUEST",
    "CAPABILITY_UNSUPPORTED",
    "OUTCOME_UNKNOWN",
    "WORKER_UNREACHABLE",
    "APPROVAL_INVALID",
})

# Internal code -> wire family. Codes are matched longest-first so a specific
# code is never swallowed by a shorter prefix.
_BY_CODE: Mapping[str, str] = {
    "IDEMPOTENCY_CONFLICT": "CONFLICT_REQUEST",
    "ENTERPRISE_STATE_CONFLICT": "CONFLICT_REQUEST",
    "PROFILE_REVISION_CONFLICT": "CONFLICT_VERSION",
    "RECORD_VERSION_CONFLICT": "CONFLICT_VERSION",
    "QUEUE_VERSION_CONFLICT": "CONFLICT_VERSION",
    "APPROVAL_VERSION_CONFLICT": "CONFLICT_VERSION",
    "REFERENCE_CONFLICT": "CONFLICT_REFERENCE",
    "APPROVAL_INVALID": "APPROVAL_INVALID",
    "APPROVAL_STALE": "APPROVAL_INVALID",
    "APPROVAL_EXPIRED": "APPROVAL_INVALID",
    "WORKSPACE_NOT_FOUND": "NOT_FOUND",
    "PROFILE_NOT_FOUND": "NOT_FOUND",
    "SESSION_NOT_FOUND": "NOT_FOUND",
    "TURN_NOT_FOUND": "NOT_FOUND",
    "QUEUE_ITEM_NOT_FOUND": "NOT_FOUND",
    "APPROVAL_NOT_FOUND": "NOT_FOUND",
    "CREDENTIAL_NOT_FOUND": "NOT_FOUND",
    "PROVIDER_MODEL_NOT_FOUND": "NOT_FOUND",
    "REQUEST_INVALID": "INVALID_REQUEST",
    "REQUEST_TOO_LARGE": "INVALID_REQUEST",
    "SECRET_FIELD_FORBIDDEN": "INVALID_REQUEST",
    "PROFILE_CONFIGURATION_INVALID": "INVALID_REQUEST",
    "TURN_OVERRIDES_INVALID": "INVALID_REQUEST",
    "ENVIRONMENT_INVALID": "INVALID_REQUEST",
    "LOCAL_PATH_INVALID": "INVALID_REQUEST",
    "LOCAL_PATH_NOT_DIRECTORY": "INVALID_REQUEST",
    "LOCAL_PATH_MISSING": "NOT_FOUND",
    "LOCAL_PATH_NOT_READABLE": "FORBIDDEN",
    "LOCAL_PATH_FORBIDDEN": "FORBIDDEN",
    "SSH_TARGET_INVALID": "INVALID_REQUEST",
    "SSH_IDENTITY_INVALID": "INVALID_REQUEST",
    "ATTACHMENT_INVALID": "INVALID_REQUEST",
    "AUTHENTICATION_REQUIRED": "UNAUTHENTICATED",
    "LOOPBACK_POLICY_REJECTED": "FORBIDDEN",
    "CAPABILITY_UNSUPPORTED": "CAPABILITY_UNSUPPORTED",
    "HARNESS_UNAVAILABLE": "CAPABILITY_UNSUPPORTED",
    "EXECUTION_CAPABILITY_UNAVAILABLE": "UNAVAILABLE",
    "WSL_CONNECTOR_UNAVAILABLE": "UNAVAILABLE",
    "SSH_CONNECTOR_UNAVAILABLE": "UNAVAILABLE",
    "SSH_WORKER_UNAVAILABLE": "UNAVAILABLE",
    "SSH_WORKER_DIGEST_MISMATCH": "UNAVAILABLE",
    "SSH_UNREACHABLE": "WORKER_UNREACHABLE",
    "LOCAL_SANDBOX_UNAVAILABLE": "UNAVAILABLE",
    "LOCAL_PATH_UNAVAILABLE": "UNAVAILABLE",
    "CREDENTIAL_SOURCE_NOT_AUTHORIZED": "UNAVAILABLE",
    "SERVICE_UNAVAILABLE": "UNAVAILABLE",
    "WORKER_DISCONNECTED": "WORKER_UNREACHABLE",
    "WORKER_UNREACHABLE": "WORKER_UNREACHABLE",
    "DISPATCH_AMBIGUOUS": "OUTCOME_UNKNOWN",
    "OUTCOME_UNKNOWN": "OUTCOME_UNKNOWN",
    "QUEUE_ITEM_TOO_LATE": "CONFLICT_REQUEST",
    "PROFILE_RECOVERY_REQUIRED": "CONFLICT_REQUEST",
    "PROFILE_ARCHIVED": "CONFLICT_REQUEST",
    "SESSION_ARCHIVED": "CONFLICT_REQUEST",
    "WORKSPACE_ARCHIVED": "CONFLICT_REQUEST",
    "TURN_CONCURRENCY_CONFLICT": "CONFLICT_REQUEST",
    "PROFILE_HARNESS_MISMATCH": "CONFLICT_REQUEST",
    "SESSION_STORE_GUARD_UNAVAILABLE": "CONFLICT_REQUEST",
    "SESSION_STORE_CREDENTIALS_PRESENT": "CONFLICT_REQUEST",
    "SESSION_STORE_GUARD_STRUCTURE": "CONFLICT_REQUEST",
    "SESSION_BUSY": "CONFLICT_REQUEST",
    "EVENT_CURSOR_AHEAD": "INVALID_REQUEST",
    "EVENT_CURSOR_EXPIRED": "INVALID_REQUEST",
}


def family_for(code: str) -> str:
    if code in _BY_CODE:
        return _BY_CODE[code]
    if code in FAMILIES:
        return code
    return "UNAVAILABLE"


@dataclass
class WireError(Exception):
    family: str
    message: str
    details: dict[str, Any] = field(default_factory=dict)
    current: Any = None

    def __post_init__(self) -> None:
        if self.family not in FAMILIES:
            raise ValueError(f"unknown wire error family: {self.family}")
        super().__init__(self.message)

    @classmethod
    def from_server_error(cls, exc: Any) -> "WireError":
        """Project an internal ServerError onto the wire family set."""
        code = str(getattr(exc, "code", "UNAVAILABLE"))
        details: dict[str, Any] = {"internalCode": code}
        retryable = getattr(exc, "retryable", None)
        if retryable is not None:
            details["retryable"] = bool(retryable)
        error = cls(family_for(code), str(getattr(exc, "message", "Server operation failed")), details)
        current = getattr(exc, "current", None)
        if current is not None:
            error.current = current
        return error

    def to_body(self) -> dict[str, Any]:
        body: dict[str, Any] = {"code": self.family, "message": self.message}
        if self.details:
            body["details"] = dict(self.details)
        if self.current is not None:
            body["current"] = self.current
        return body
