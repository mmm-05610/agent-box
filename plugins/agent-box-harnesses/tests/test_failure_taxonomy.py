"""Failure taxonomy: launch stages vs session-driver stage, typed codes."""
from __future__ import annotations

import pytest

from agent_box_harnesses.adapters.failures import (
    MATERIALIZATION_FAILED, PLAN_REJECTED, START_AMBIGUOUS, START_REJECTED,
    LaunchStageError,
)
from agent_box_harnesses.session.spi import (
    CANCEL_FAILED, CLEANUP_FAILED, DRIVER_UNAVAILABLE, MALFORMED_PROTOCOL_MESSAGE,
    PERMISSION_TIMEOUT, PROTOCOL_INITIALIZE_FAILED, PROTOCOL_VERSION_INCOMPATIBLE,
    SESSION_START_AMBIGUOUS, SESSION_START_REJECTED, TRANSPORT_CLOSED,
    DriverCancelFailed, DriverCleanupFailed, DriverMalformedProtocol,
    DriverPermissionTimeout, DriverProtocolInitializeFailed,
    DriverProtocolVersionIncompatible, DriverSessionStartAmbiguous,
    DriverSessionStartRejected, DriverTransportClosed, DriverUnavailable,
    SessionDriverError,
)

SESSION_CODES = (
    DRIVER_UNAVAILABLE, PROTOCOL_INITIALIZE_FAILED, PROTOCOL_VERSION_INCOMPATIBLE,
    SESSION_START_REJECTED, SESSION_START_AMBIGUOUS, TRANSPORT_CLOSED,
    MALFORMED_PROTOCOL_MESSAGE, PERMISSION_TIMEOUT, CANCEL_FAILED, CLEANUP_FAILED,
)

CODE_TO_CLASS = {
    DRIVER_UNAVAILABLE: DriverUnavailable,
    PROTOCOL_INITIALIZE_FAILED: DriverProtocolInitializeFailed,
    PROTOCOL_VERSION_INCOMPATIBLE: DriverProtocolVersionIncompatible,
    SESSION_START_REJECTED: DriverSessionStartRejected,
    SESSION_START_AMBIGUOUS: DriverSessionStartAmbiguous,
    TRANSPORT_CLOSED: DriverTransportClosed,
    MALFORMED_PROTOCOL_MESSAGE: DriverMalformedProtocol,
    PERMISSION_TIMEOUT: DriverPermissionTimeout,
    CANCEL_FAILED: DriverCancelFailed,
    CLEANUP_FAILED: DriverCleanupFailed,
}


def test_all_ten_driver_codes_have_typed_classes():
    for code in SESSION_CODES:
        cls = CODE_TO_CLASS[code]
        instance = cls("detail")
        assert isinstance(instance, SessionDriverError)
        assert instance.code == code
        assert instance.stage == "SESSION_DRIVER"


def test_launch_stages_remain_unchanged():
    assert PLAN_REJECTED == "PLAN_REJECTED"
    assert MATERIALIZATION_FAILED == "MATERIALIZATION_FAILED"
    assert START_REJECTED == "START_REJECTED"
    assert START_AMBIGUOUS == "START_AMBIGUOUS"
    for stage in (PLAN_REJECTED, MATERIALIZATION_FAILED, START_REJECTED, START_AMBIGUOUS):
        from agent_box_harnesses.adapters.failures import LaunchStageError
        assert LaunchStageError  # stage vocabulary shared


def test_stage_layering_is_clearly_separated():
    # launch failures keep their existing stages; session-driver failures
    # are a distinct stage with the same base class shape
    assert DriverTransportClosed("x").stage == "SESSION_DRIVER"
    from agent_box_harnesses.adapters.failures import StartRejected as LaunchStartRejected

    assert LaunchStartRejected("START_REJECTED", "x").stage == "START_REJECTED"
    assert isinstance(DriverTransportClosed("x"), LaunchStageError)


def test_ambiguous_session_start_is_typed_not_a_string():
    error = DriverSessionStartAmbiguous("response lost; target may exist")
    assert error.code == SESSION_START_AMBIGUOUS
    assert "target may exist" in error.detail


def test_permission_timeout_is_a_typed_policy_failure():
    error = DriverPermissionTimeout("no host answer within deadline")
    assert error.code == PERMISSION_TIMEOUT
    assert error.stage == "SESSION_DRIVER"


def test_launch_mode_plan_errors_map_into_launch_stage():
    from agent_box_harnesses.adapters.failures import PlanRejected

    error = PlanRejected("LAUNCH_MODE_UNDECLARED", "acp")
    assert error.code == "LAUNCH_MODE_UNDECLARED"
    assert error.stage == PLAN_REJECTED