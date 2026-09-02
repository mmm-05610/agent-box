"""Permission decision policy for session drivers.

The protocol carries permission requests; the Host policy decides.  This
module owns the minimal policy seams: a decision type, a pluggable policy
protocol with a fail-closed default, and the timeout policy that turns a
protocol request with no answer into a recorded, cancelled, diagnosed
outcome — never an infinite wait.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Protocol


class PermissionDecisionKind(str, Enum):
    ALLOW = "allow"
    DENY = "deny"
    CANCEL = "cancel"
    DEFER = "defer"  # no decision yet; still awaiting Host input


@dataclass(frozen=True)
class PermissionDecision:
    kind: PermissionDecisionKind
    option_id: str = ""
    reason: str = ""

    def __post_init__(self) -> None:
        if not isinstance(self.kind, PermissionDecisionKind):
            raise ValueError("invalid permission decision kind")
        if self.kind in (PermissionDecisionKind.ALLOW,) and not self.option_id:
            raise ValueError("allow requires an option id")
        object.__setattr__(self, "reason", self.reason[:256])


@dataclass
class PermissionRequestState:
    """Driver-held permission bookkeeping (bounded)."""

    request_id: str
    session_id: str = ""
    option_ids: tuple[str, ...] = ()
    tool_name: str = ""
    received_at: float = field(default_factory=time.monotonic)
    deadline: float = 0.0
    answered: bool = False

    def __post_init__(self) -> None:
        if not isinstance(self.request_id, str) or not self.request_id or len(self.request_id) > 256:
            raise ValueError("invalid permission request id")
        object.__setattr__(self, "option_ids", tuple(self.option_ids))

    def expired(self, now: float | None = None) -> bool:
        return (now if now is not None else time.monotonic()) > self.deadline


class PermissionPolicy(Protocol):
    """Host-side policy; the driver enforces whatever the policy decides."""

    def decide(self, request: PermissionRequestState) -> PermissionDecision: ...
    def on_timeout(self, request: PermissionRequestState) -> PermissionDecision: ...


class FailClosedPermissionPolicy:
    """Default policy: every presented request is denied unless allowed.

    ``on_timeout`` records the timeout and cancels the request (the driver
    turns the cancellation into a canonical permission diagnostic and, when
    the turn is still pending, an interrupt path).
    """

    def decide(self, request: PermissionRequestState) -> PermissionDecision:
        return PermissionDecision(PermissionDecisionKind.CANCEL, reason="fail-closed default")

    def on_timeout(self, request: PermissionRequestState) -> PermissionDecision:
        return PermissionDecision(PermissionDecisionKind.CANCEL, reason="PERMISSION_TIMEOUT")


class StaticAllowPolicy:
    """Test/policy-fixture policy: allow the named option of the first request."""

    def __init__(self, option_id: str = "", *, timeout_cancel: bool = True) -> None:
        self.option_id = option_id
        self.timeout_cancel = timeout_cancel

    def decide(self, request: PermissionRequestState) -> PermissionDecision:
        chosen = self.option_id or (request.option_ids[0] if request.option_ids else "")
        return PermissionDecision(PermissionDecisionKind.ALLOW, chosen, "static allow policy")

    def on_timeout(self, request: PermissionRequestState) -> PermissionDecision:
        if self.timeout_cancel:
            return PermissionDecision(PermissionDecisionKind.CANCEL, reason="PERMISSION_TIMEOUT")
        return PermissionDecision(PermissionDecisionKind.ALLOW, self.option_id, "timeout allow policy")


__all__ = [
    "FailClosedPermissionPolicy",
    "PermissionDecision",
    "PermissionDecisionKind",
    "PermissionPolicy",
    "PermissionRequestState",
    "StaticAllowPolicy",
]