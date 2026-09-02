"""Permission policy semantics: allow, deny, timeout, fail-closed defaults."""
from __future__ import annotations

import time

import pytest

from agent_box_harnesses.session.permission import (
    FailClosedPermissionPolicy, PermissionDecisionKind, PermissionRequestState,
    StaticAllowPolicy,
)


def state(request_id: str = "perm-1", deadline_in: float = 1.0) -> PermissionRequestState:
    return PermissionRequestState(
        request_id=request_id, session_id="s1",
        option_ids=("allow", "always", "deny"),
        deadline=time.monotonic() + deadline_in,
    )


def test_fail_closed_default_never_allows():
    policy = FailClosedPermissionPolicy()
    decision = policy.decide(state())
    assert decision.kind is PermissionDecisionKind.CANCEL
    assert decision.option_id == ""


def test_fail_closed_timeout_cancels_with_diagnostic_code():
    policy = FailClosedPermissionPolicy()
    decision = policy.on_timeout(state(deadline_in=-0.5))
    assert decision.kind is PermissionDecisionKind.CANCEL
    assert decision.reason == "PERMISSION_TIMEOUT"


def test_static_allow_policy_selects_named_option():
    policy = StaticAllowPolicy(option_id="always")
    decision = policy.decide(state())
    assert decision.kind is PermissionDecisionKind.ALLOW
    assert decision.option_id == "always"


def test_static_allow_policy_first_option_when_unnamed():
    policy = StaticAllowPolicy()
    decision = policy.decide(state())
    assert decision.option_id == "allow"


def test_expired_state_detection():
    fresh = state(deadline_in=10.0)
    stale = state(deadline_in=-0.5)
    assert not fresh.expired()
    assert stale.expired()


def test_allow_without_option_id_is_invalid():
    from agent_box_harnesses.session.permission import PermissionDecision

    with pytest.raises(ValueError):
        PermissionDecision(PermissionDecisionKind.ALLOW, option_id="")
    with pytest.raises(ValueError):
        PermissionDecision(PermissionDecisionKind.ALLOW, option_id="", reason="x")


def test_decision_field_bounds():
    from agent_box_harnesses.session.permission import PermissionDecision

    decision = PermissionDecision(PermissionDecisionKind.DENY, reason="r" * 1000)
    assert len(decision.reason) == 256