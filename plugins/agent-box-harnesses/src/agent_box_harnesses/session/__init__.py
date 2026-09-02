"""Harness SessionDrivers: canonical session boundary for harnesses.

Registry of drivers keyed by ``(harness_type, launch_mode_name)``; every
official Harness registers its native driver, and a Harness may register an
alternative mode driver (e.g. OpenCode ``acp``).  The generic ACP engine
lives in the separate ``agent-box-acp`` wheel; this package only hosts
drivers that consume it.
"""
from __future__ import annotations

from typing import Any, Mapping

from .hub import HubObservation, HubPollResult, HubSnapshot, ObservationHub
from .permission import (
    FailClosedPermissionPolicy, PermissionDecision, PermissionDecisionKind,
    PermissionPolicy, PermissionRequestState, StaticAllowPolicy,
)
from .spi import (
    CANCEL_FAILED, CLEANUP_FAILED, DRIVER_UNAVAILABLE, MALFORMED_PROTOCOL_MESSAGE,
    PERMISSION_TIMEOUT, PROTOCOL_INITIALIZE_FAILED, PROTOCOL_VERSION_INCOMPATIBLE,
    SESSION_START_AMBIGUOUS, SESSION_START_REJECTED, TRANSPORT_CLOSED,
    DriverCancelFailed, DriverCleanupFailed, DriverMalformedProtocol,
    DriverPermissionTimeout, DriverProtocolInitializeFailed,
    DriverProtocolVersionIncompatible, DriverSessionStartAmbiguous,
    DriverSessionStartRejected, DriverTransportClosed, DriverUnavailable,
    HarnessSessionDriver, PermissionOptionView, PermissionView,
    SessionCapability, SessionDriverBindOptions, SessionDriverBinding,
    SessionDriverDescriptor, SessionDriverError, from_acp_error,
)
from .codec import AcpSessionCodec, GenericAcpCodec
from .acp import GenericAcpSessionDriver
from .native import NativeSessionDriver

SESSION_DRIVERS: dict[tuple[str, str], Any] = {}


def register_session_driver(harness_type: str, mode: str, factory: Any) -> None:
    """Register one driver factory for ``(harness_type, launch_mode_name)``.

    Registration is Harness-owned; the generic ACP engine never appears here
    as a key (it has no Harness identity).
    """
    if not harness_type or not mode or "/" in mode or "\\" in mode:
        raise ValueError("invalid session driver registration key")
    key = (harness_type, mode)
    if key in SESSION_DRIVERS:
        raise ValueError(f"session driver already registered: {key}")
    SESSION_DRIVERS[key] = factory


def session_driver_factory(harness_type: str, mode: str) -> Any:
    """Explicit driver lookup; unknown modes fail closed (no first-match)."""
    try:
        return SESSION_DRIVERS[(harness_type, mode)]
    except KeyError as exc:
        raise SessionDriverError(
            DRIVER_UNAVAILABLE, f"no session driver for {harness_type}/{mode}"
        ) from exc


def registered_session_drivers() -> tuple[tuple[str, str], ...]:
    return tuple(sorted(SESSION_DRIVERS))


__all__ = [
    "CANCEL_FAILED",
    "CLEANUP_FAILED",
    "DRIVER_UNAVAILABLE",
    "DriverCancelFailed",
    "DriverCleanupFailed",
    "DriverMalformedProtocol",
    "DriverPermissionTimeout",
    "DriverProtocolInitializeFailed",
    "DriverProtocolVersionIncompatible",
    "DriverSessionStartAmbiguous",
    "DriverSessionStartRejected",
    "DriverTransportClosed",
    "DriverUnavailable",
    "FailClosedPermissionPolicy",
    "GenericAcpCodec",
    "GenericAcpSessionDriver",
    "HarnessSessionDriver",
    "HubObservation",
    "HubPollResult",
    "HubSnapshot",
    "MALFORMED_PROTOCOL_MESSAGE",
    "NativeSessionDriver",
    "ObservationHub",
    "PERMISSION_TIMEOUT",
    "PROTOCOL_INITIALIZE_FAILED",
    "PROTOCOL_VERSION_INCOMPATIBLE",
    "PermissionDecision",
    "PermissionDecisionKind",
    "PermissionOptionView",
    "PermissionPolicy",
    "PermissionRequestState",
    "PermissionView",
    "SESSION_START_AMBIGUOUS",
    "SESSION_START_REJECTED",
    "SESSION_DRIVERS",
    "StaticAllowPolicy",
    "TRANSPORT_CLOSED",
    "AcpSessionCodec",
    "SessionCapability",
    "SessionDriverBindOptions",
    "SessionDriverBinding",
    "SessionDriverDescriptor",
    "SessionDriverError",
    "from_acp_error",
    "register_session_driver",
    "registered_session_drivers",
    "session_driver_factory",
]