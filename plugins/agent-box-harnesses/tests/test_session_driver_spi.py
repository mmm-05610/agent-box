"""HarnessSessionDriver SPI: registration, lookup, descriptors, taxonomy."""
from __future__ import annotations

import pytest

from agent_box_harnesses.session import (
    SESSION_DRIVERS, SessionDriverDescriptor, SessionDriverError,
    register_session_driver, registered_session_drivers,
    session_driver_factory,
)
from agent_box_harnesses.session.registry import ensure_session_drivers
from agent_box_harnesses.session.spi import (
    DRIVER_UNAVAILABLE, PROTOCOL_INITIALIZE_FAILED, PROTOCOL_VERSION_INCOMPATIBLE,
    SESSION_START_AMBIGUOUS, SESSION_START_REJECTED, SessionCapability,
    SessionDriverBindOptions, SessionDriverBinding,
    from_acp_error,
)


def test_driver_registry_rejects_duplicate_and_invalid_keys():
    ensure_session_drivers()
    with pytest.raises(ValueError):
        register_session_driver("codex", "exec", None)
    with pytest.raises(ValueError):
        register_session_driver("codex", "bad/mode", None)
    with pytest.raises(ValueError):
        register_session_driver("", "exec", None)


def test_lookup_is_explicit_and_fails_closed():
    ensure_session_drivers()
    assert session_driver_factory("opencode", "acp") is not None
    with pytest.raises(SessionDriverError) as exc:
        session_driver_factory("opencode", "not-a-mode")
    assert exc.value.code == DRIVER_UNAVAILABLE


def test_default_registration_covers_five_native_plus_opencode_acp():
    ensure_session_drivers()
    registered = set(registered_session_drivers())
    for harness_type in ("codex", "claude-code", "opencode", "hermes", "pi"):
        assert (harness_type, "exec") in registered, harness_type
    assert ("opencode", "acp") in registered


def test_four_state_capability_enum():
    assert SessionCapability.SUPPORTED.value == "supported"
    assert SessionCapability.UNSUPPORTED.value == "unsupported"
    assert SessionCapability.UNAVAILABLE.value == "unavailable"
    assert SessionCapability.NOT_IMPLEMENTED.value == "not_implemented"


def test_descriptor_validation():
    valid = SessionDriverDescriptor("agent-box-harnesses.opencode-acp@1", "OpenCode ACP", "2.0.0a1", "opencode", "acp", "acp-v1")
    assert valid.mode == "acp"
    with pytest.raises(ValueError):
        SessionDriverDescriptor("", "x", "1", "opencode", "acp", "acp-v1")
    with pytest.raises(ValueError):
        SessionDriverDescriptor("id", "x", "1", "opencode", "bad\0mode", "acp-v1")


def test_bind_options_bounds():
    SessionDriverBindOptions(prompt="hello", continuation_locator="sess-1")
    with pytest.raises(ValueError):
        SessionDriverBindOptions(prompt="x" * 300000)
    with pytest.raises(ValueError):
        SessionDriverBindOptions(session_start_timeout_s=-1)


def test_binding_validation():
    SessionDriverBinding("sess-1", "1")
    with pytest.raises(ValueError):
        SessionDriverBinding("", "1")
    with pytest.raises(ValueError):
        SessionDriverBinding("s", "")


def test_error_code_vocabulary_is_closed():
    with pytest.raises(ValueError):
        SessionDriverError("SOME_UNKNOWN_CODE")


def test_from_acp_error_maps_typed_codes():
    from agent_box_acp.errors import (
        CancelFailed, CleanupFailed, InitializeFailed, MalformedProtocolMessage,
        PermissionTimeoutError, ProtocolVersionIncompatible, SessionStartAmbiguous,
        SessionStartRejected, TransportClosed,
    )

    cases = [
        (InitializeFailed(PROTOCOL_INITIALIZE_FAILED, "x"), PROTOCOL_INITIALIZE_FAILED),
        (ProtocolVersionIncompatible(PROTOCOL_VERSION_INCOMPATIBLE, "x"), PROTOCOL_VERSION_INCOMPATIBLE),
        (SessionStartRejected(SESSION_START_REJECTED, "x"), SESSION_START_REJECTED),
        (SessionStartAmbiguous(SESSION_START_AMBIGUOUS, "x"), SESSION_START_AMBIGUOUS),
        (TransportClosed("TRANSPORT_CLOSED", "x"), "TRANSPORT_CLOSED"),
        (MalformedProtocolMessage("MALFORMED_PROTOCOL_MESSAGE", "x"), "MALFORMED_PROTOCOL_MESSAGE"),
        (PermissionTimeoutError("PERMISSION_TIMEOUT", "x"), "PERMISSION_TIMEOUT"),
        (CancelFailed("CANCEL_FAILED", "x"), "CANCEL_FAILED"),
        (CleanupFailed("CLEANUP_FAILED", "x"), "CLEANUP_FAILED"),
    ]
    for error, expected in cases:
        mapped = from_acp_error(error)
        assert isinstance(mapped, SessionDriverError), error
        assert mapped.code == expected, error


def test_from_acp_error_maps_unknown_to_driver_unavailable():
    mapped = from_acp_error(ValueError("boom"))
    assert mapped.code == DRIVER_UNAVAILABLE


def test_session_driver_interface_protocol_shape():
    """The SPI surface exists and is runtime-checkable."""
    from agent_box_harnesses.session.spi import HarnessSessionDriver

    assert hasattr(HarnessSessionDriver, "bind")
    assert hasattr(HarnessSessionDriver, "poll")
    assert hasattr(HarnessSessionDriver, "respond_permission")
    assert hasattr(HarnessSessionDriver, "cancel")
    assert hasattr(HarnessSessionDriver, "close")