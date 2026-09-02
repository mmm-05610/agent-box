"""HarnessSessionDriver SPI — Harness-owned typed session boundary.

This module owns the canonical session interface between a Harness's
session protocol (native JSONL, ACP, document) and the Agent-Box
Observation boundary.  It contains no protocol implementation: drivers
implement :class:`HarnessSessionDriver`, and the single canonical pipeline
is ``driver.poll() -> ObservationHub -> Host``.

The driver never spawns, writes files, reads credentials, mutates the
process environment, constructs Profiles or calls Work Core Finish.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Mapping, Protocol, runtime_checkable

from ..adapters.failures import LaunchStageError
from ..adapters.observation import TerminalCondition

# Session-driver failure vocabulary (stable, typed; never string routing).
DRIVER_UNAVAILABLE = "DRIVER_UNAVAILABLE"
PROTOCOL_INITIALIZE_FAILED = "PROTOCOL_INITIALIZE_FAILED"
PROTOCOL_VERSION_INCOMPATIBLE = "PROTOCOL_VERSION_INCOMPATIBLE"
SESSION_START_REJECTED = "SESSION_START_REJECTED"
SESSION_START_AMBIGUOUS = "SESSION_START_AMBIGUOUS"
TRANSPORT_CLOSED = "TRANSPORT_CLOSED"
MALFORMED_PROTOCOL_MESSAGE = "MALFORMED_PROTOCOL_MESSAGE"
PERMISSION_TIMEOUT = "PERMISSION_TIMEOUT"
CANCEL_FAILED = "CANCEL_FAILED"
CLEANUP_FAILED = "CLEANUP_FAILED"

_DRIVER_CODES = frozenset({
    DRIVER_UNAVAILABLE, PROTOCOL_INITIALIZE_FAILED, PROTOCOL_VERSION_INCOMPATIBLE,
    SESSION_START_REJECTED, SESSION_START_AMBIGUOUS, TRANSPORT_CLOSED,
    MALFORMED_PROTOCOL_MESSAGE, PERMISSION_TIMEOUT, CANCEL_FAILED, CLEANUP_FAILED,
})


class SessionDriverError(LaunchStageError):
    """Base class for session-driver failures.

    Stage layering with the launch chain: launch failures keep their
    existing stages (PLAN_REJECTED / MATERIALIZATION_FAILED /
    START_REJECTED / START_AMBIGUOUS); every failure AFTER the target was
    created belongs to the SESSION_DRIVER stage.  Session-start timeouts on
    protocols with a create-then-ack shape map to the START_AMBIGUOUS stage
    boundary via :class:`SessionStartAmbiguous`.  It shares the launch
    failure family (typed ``stage``), never its stages.
    """

    stage = "SESSION_DRIVER"

    def __init__(self, code: str, detail: str = "") -> None:
        if code not in _DRIVER_CODES:
            raise ValueError(f"unknown session driver error code: {code}")
        self.code = code
        self.detail = detail[:512]
        super().__init__(code, self.detail)


class DriverUnavailable(SessionDriverError):
    code = DRIVER_UNAVAILABLE

    def __init__(self, detail: str = "") -> None:
        super().__init__(DRIVER_UNAVAILABLE, detail)


class DriverProtocolInitializeFailed(SessionDriverError):
    code = PROTOCOL_INITIALIZE_FAILED

    def __init__(self, detail: str = "") -> None:
        super().__init__(PROTOCOL_INITIALIZE_FAILED, detail)


class DriverProtocolVersionIncompatible(SessionDriverError):
    code = PROTOCOL_VERSION_INCOMPATIBLE

    def __init__(self, detail: str = "") -> None:
        super().__init__(PROTOCOL_VERSION_INCOMPATIBLE, detail)


class DriverSessionStartRejected(SessionDriverError):
    code = SESSION_START_REJECTED

    def __init__(self, detail: str = "") -> None:
        super().__init__(SESSION_START_REJECTED, detail)


class DriverSessionStartAmbiguous(SessionDriverError):
    """Session start response lost: the target may exist; retry is forbidden."""

    code = SESSION_START_AMBIGUOUS

    def __init__(self, detail: str = "") -> None:
        super().__init__(SESSION_START_AMBIGUOUS, detail)


class DriverTransportClosed(SessionDriverError):
    code = TRANSPORT_CLOSED

    def __init__(self, detail: str = "") -> None:
        super().__init__(TRANSPORT_CLOSED, detail)


class DriverMalformedProtocol(SessionDriverError):
    code = MALFORMED_PROTOCOL_MESSAGE

    def __init__(self, detail: str = "") -> None:
        super().__init__(MALFORMED_PROTOCOL_MESSAGE, detail)


class DriverPermissionTimeout(SessionDriverError):
    code = PERMISSION_TIMEOUT

    def __init__(self, detail: str = "") -> None:
        super().__init__(PERMISSION_TIMEOUT, detail)


class DriverCancelFailed(SessionDriverError):
    code = CANCEL_FAILED

    def __init__(self, detail: str = "") -> None:
        super().__init__(CANCEL_FAILED, detail)


class DriverCleanupFailed(SessionDriverError):
    code = CLEANUP_FAILED

    def __init__(self, detail: str = "") -> None:
        super().__init__(CLEANUP_FAILED, detail)


class SessionCapability(str, Enum):
    """Four-state capability truth for a session driver (never silent no-op)."""

    SUPPORTED = "supported"
    UNSUPPORTED = "unsupported"
    UNAVAILABLE = "unavailable"
    NOT_IMPLEMENTED = "not_implemented"


@dataclass(frozen=True)
class SessionDriverDescriptor:
    """Immutable driver identity; mode names are registry launch-mode names."""

    implementation_id: str
    display_name: str
    version: str
    harness_type: str
    mode: str
    protocol: str  # e.g. "native" | "acp-v1"

    def __post_init__(self) -> None:
        for name, value, limit in (
            ("implementation_id", self.implementation_id, 128),
            ("display_name", self.display_name, 128),
            ("version", self.version, 64),
            ("harness_type", self.harness_type, 64),
            ("mode", self.mode, 64),
            ("protocol", self.protocol, 64),
        ):
            if not isinstance(value, str) or not value or len(value) > limit or "\0" in value:
                raise ValueError(f"invalid session driver descriptor {name}")


@dataclass(frozen=True)
class SessionDriverBindOptions:
    """Bounded, credential-free binding inputs for one session."""

    continuation_locator: str | None = None
    prompt: str = ""
    session_start_timeout_s: float = 15.0
    permission_timeout_s: float = 120.0
    prompt_timeout_s: float = 0.0
    metadata: Mapping[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.continuation_locator is not None and (not isinstance(self.continuation_locator, str) or not self.continuation_locator or len(self.continuation_locator) > 512):
            raise ValueError("invalid continuation locator")
        if not isinstance(self.prompt, str) or len(self.prompt) > 262144:
            raise ValueError("invalid prompt")
        for name in ("session_start_timeout_s", "permission_timeout_s", "prompt_timeout_s"):
            value = getattr(self, name)
            if not isinstance(value, (int, float)) or value < 0:
                raise ValueError(f"invalid timeout {name}")
        metadata = dict(self.metadata)
        if len(metadata) > 32 or any(not isinstance(k, str) or not isinstance(v, str) for k, v in metadata.items()):
            raise ValueError("invalid metadata")
        object.__setattr__(self, "metadata", metadata)


@dataclass(frozen=True)
class SessionDriverBinding:
    """Result of binding a driver to an already-created runtime target."""

    session_locator: str | None
    protocol_version: str
    diagnostics: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if self.session_locator is not None and (not isinstance(self.session_locator, str) or not self.session_locator or len(self.session_locator) > 512):
            raise ValueError("invalid session locator")
        if not isinstance(self.protocol_version, str) or not self.protocol_version or len(self.protocol_version) > 64:
            raise ValueError("invalid protocol version")
        if len(self.diagnostics) > 32 or any(not isinstance(d, str) or len(d) > 512 for d in self.diagnostics):
            raise ValueError("invalid diagnostics")


@dataclass(frozen=True)
class PermissionOptionView:
    option_id: str
    name: str = ""
    kind: str = "allow_once"


@dataclass(frozen=True)
class PermissionView:
    """Canonical Host-facing permission request (bounded, no raw payload)."""

    request_id: str
    session_locator: str
    tool_name: str = ""
    command: str = ""
    options: tuple[PermissionOptionView, ...] = ()
    # Policy-clock deadline (monotonic); the Host policy compares against its
    # own clock domain.  Zero = no deadline declared.
    deadline: float = 0.0

    def __post_init__(self) -> None:
        for name, value, limit in (
            ("request_id", self.request_id, 256),
            ("session_locator", self.session_locator, 512),
            ("tool_name", self.tool_name, 128),
            ("command", self.command, 1024),
        ):
            if not isinstance(value, str) or len(value) > limit:
                raise ValueError(f"invalid permission view {name}")


@runtime_checkable
class HarnessSessionDriver(Protocol):
    """One bound session driver; the Host sees only canonical values."""

    def descriptor(self) -> SessionDriverDescriptor: ...
    def capabilities(self) -> Mapping[str, SessionCapability]: ...
    def bind(self, handle: object, *, options: SessionDriverBindOptions) -> SessionDriverBinding: ...
    def poll(self, timeout: float = 0.0) -> "HubPollResult": ...
    def session_locator(self) -> str | None: ...
    def pending_permission(self) -> PermissionView | None: ...
    def respond_permission(self, option_id: str) -> bool: ...
    def reject_permission(self) -> bool: ...
    def cancel(self) -> None: ...
    def close(self) -> None: ...
    def diagnostics(self) -> Mapping[str, object]: ...
    def terminal_state(self) -> TerminalCondition | None: ...


SessionDriverFactory = "type | callable"  # factory marker for registries


def from_acp_error(exc: Exception) -> SessionDriverError:
    """Map a protocol-engine error onto the harness session taxonomy."""
    from agent_box_acp.errors import (
        CANCEL_FAILED as ACP_CANCEL,
        CLEANUP_FAILED as ACP_CLEANUP,
        MALFORMED_PROTOCOL_MESSAGE as ACP_MALFORMED,
        PERMISSION_TIMEOUT as ACP_TIMEOUT,
        PROTOCOL_INITIALIZE_FAILED as ACP_INIT,
        PROTOCOL_VERSION_INCOMPATIBLE as ACP_VERSION,
        SESSION_START_AMBIGUOUS as ACP_AMBIGUOUS,
        SESSION_START_REJECTED as ACP_REJECTED,
        TRANSPORT_CLOSED as ACP_CLOSED,
        AcpEngineError,
    )
    if not isinstance(exc, AcpEngineError):
        return SessionDriverError(DRIVER_UNAVAILABLE, type(exc).__name__)
    code = exc.code
    detail = exc.detail or str(exc)[:256]
    if code == ACP_INIT:
        return DriverProtocolInitializeFailed(detail)
    if code == ACP_VERSION:
        return DriverProtocolVersionIncompatible(detail)
    if code == ACP_REJECTED:
        return DriverSessionStartRejected(detail)
    if code == ACP_AMBIGUOUS:
        return DriverSessionStartAmbiguous(detail)
    if code == ACP_CLOSED:
        return DriverTransportClosed(detail)
    if code == ACP_MALFORMED:
        return DriverMalformedProtocol(detail)
    if code == ACP_TIMEOUT:
        return DriverPermissionTimeout(detail)
    if code == ACP_CANCEL:
        return DriverCancelFailed(detail)
    if code == ACP_CLEANUP:
        return DriverCleanupFailed(detail)
    return SessionDriverError(DRIVER_UNAVAILABLE, detail)


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
    "HarnessSessionDriver",
    "MALFORMED_PROTOCOL_MESSAGE",
    "PERMISSION_TIMEOUT",
    "PROTOCOL_INITIALIZE_FAILED",
    "PROTOCOL_VERSION_INCOMPATIBLE",
    "PermissionOptionView",
    "PermissionView",
    "SESSION_START_AMBIGUOUS",
    "SESSION_START_REJECTED",
    "TRANSPORT_CLOSED",
    "SessionCapability",
    "SessionDriverBindOptions",
    "SessionDriverBinding",
    "SessionDriverDescriptor",
    "SessionDriverError",
    "from_acp_error",
]