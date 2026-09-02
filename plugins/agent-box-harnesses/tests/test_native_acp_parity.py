"""Native vs ACP parity fixture: same canonical boundary, honest delta."""
from __future__ import annotations

from agent_box_acp import PermissionRequest, UpdateEvent
from agent_box_harnesses.adapters.opencode import OpenCodeJsonDecoder
from agent_box_harnesses.adapters.observation import ObservationKind, TerminalCondition
from agent_box_harnesses.session.codec import GenericAcpCodec
from agent_box_harnesses.opencode.acp import OpenCodeAcpCodec
from agent_box_harnesses.session.hub import ObservationHub

# A native turn: opened, one message, one tool, idle terminal (fixture).
NATIVE_LINES = [
    '{"type":"session.status","sessionID":"sess-1","status":{"type":"running"}}',
    '{"type":"message.updated","sessionID":"sess-1","message":{"id":"m1","parts":[{"type":"text","text":"hello native"}]}}',
    '{"type":"message.part.updated","sessionID":"sess-1","messageID":"m1","partID":"p1","part":{"type":"tool","tool":"bash","state":{"status":"running"}}}',
    '{"type":"message.part.updated","sessionID":"sess-1","messageID":"m1","partID":"p1","part":{"type":"tool","tool":"bash","state":{"status":"completed","output":"ok"}}}',
    '{"type":"session.status","sessionID":"sess-1","status":{"type":"idle"}}',
]

# The same turn expressed as ACP session/update variants.
ACP_UPDATES = [
    UpdateEvent("sess-1", "agent_message_chunk", {"kind": "agent_message_chunk", "payload": {"content": "hello native"}}),
    UpdateEvent("sess-1", "tool_call", {"kind": "tool_call", "payload": {"name": "bash", "args": {"command": "x"}}}),
    UpdateEvent("sess-1", "tool_call_update", {"kind": "tool_call_update", "payload": {"name": "bash", "status": "completed"}}),
    UpdateEvent("sess-1", "agent_message_chunk", {"kind": "agent_message_chunk", "payload": {"content": "", "stopReason": "end_turn"}}),
]


def native_observations() -> tuple:
    return OpenCodeJsonDecoder().decode_stream(NATIVE_LINES)


def acp_observations() -> tuple:
    codec = OpenCodeAcpCodec()
    out = []
    for update in ACP_UPDATES:
        out.extend(codec.decode_update(update))
    return tuple(out)


def test_parity_canonical_kinds_native_vs_acp():
    native = native_observations()
    acp = acp_observations()
    native_kinds = {item.kind for item in native}
    acp_kinds = {item.kind for item in acp}
    # both modes express the same turn through canonical kinds
    assert ObservationKind.MESSAGE in native_kinds
    assert ObservationKind.MESSAGE in acp_kinds
    assert ObservationKind.TOOL_REQUEST in acp_kinds
    # documented delta: the native decoder keeps tool parts message-embedded
    # (decoder choice from the native round); the ACP codec lifts them
    assert ObservationKind.TOOL_REQUEST not in native_kinds
    assert ObservationKind.TERMINAL in acp_kinds
    assert any(item.kind is ObservationKind.TERMINAL and item.terminal_condition in
               (TerminalCondition.TURN_COMPLETED, TerminalCondition.COMPLETED) for item in native)


def test_parity_session_locator_and_terminal_state():
    native = native_observations()
    acp = acp_observations()
    native_locators = {item.session_locator for item in native if item.session_locator}
    acp_locators = {item.session_locator for item in acp if item.session_locator}
    assert "sess-1" in native_locators and "sess-1" in acp_locators
    acp_terminal = next(item for item in acp if item.kind is ObservationKind.TERMINAL)
    assert acp_terminal.terminal_condition is TerminalCondition.TURN_COMPLETED


def test_parity_hub_pipeline_applies_to_both_modes():
    for observations in (native_observations(), acp_observations()):
        hub = ObservationHub()
        for observation in observations:
            hub.push(observation)
        assert hub.snapshot().seq == len(observations)
        assert hub.snapshot().terminal_condition is not None


def test_fidelity_delta_is_honest_no_fabricated_usage():
    # ACP stream without a usage update must NOT fabricate a USAGE observation
    acp = acp_observations()
    assert all(item.kind is not ObservationKind.USAGE for item in acp)
    # native stream without explicit usage likewise stays silent
    native = native_observations()
    assert all(item.kind is not ObservationKind.USAGE for item in native)
    # when the protocol DOES carry usage, the codec surfaces it
    with_usage = GenericAcpCodec().decode_update(UpdateEvent(
        "sess-2", "session_info_update",
        {"kind": "session_info_update", "usage": {"inputTokens": 10, "cost": 0.01}},
    ))
    usage_items = [item for item in with_usage if item.kind is ObservationKind.USAGE]
    assert len(usage_items) == 1
    assert usage_items[0].usage.get("cost_usd") == 0.01


def test_fidelity_gap_declaration_is_visible_to_hosts():
    codec = OpenCodeAcpCodec()
    notes = codec.fidelity_notes()
    assert any("NO_QUESTION_ELICITATION" in note for note in notes)
    assert any("USAGE_COST_AVAILABLE_VIA_UPDATE" in note for note in notes)
    overrides = codec.capability_overrides()
    assert overrides["question"] == "unsupported"
    assert overrides["usage_cost"] == "supported"


def test_native_unknown_event_escape_hatch_and_acp_unknown_variant():
    native = OpenCodeJsonDecoder().decode_stream([
        '{"type":"future.event.xyz","sessionID":"sess-9","data":{}}',
    ])
    assert len(native) == 1
    assert native[0].kind is ObservationKind.UNKNOWN
    assert native[0].warnings and any("UNKNOWN_NATIVE_EVENT" in w for w in native[0].warnings)
    acp = OpenCodeAcpCodec().decode_update(UpdateEvent(
        "sess-9", "generic",
        {"kind": "future.variant.xyz", "payload": {}},
    ))
    assert acp[0].kind is ObservationKind.UNKNOWN
    assert any("UNKNOWN_UPDATE_VARIANT" in w for w in acp[0].warnings)


def test_permission_request_decode_native_and_acp():
    native = OpenCodeJsonDecoder().decode_stream([
        '{"type":"permission.asked","sessionID":"sess-3","permission":"bash"}',
    ])
    assert native[0].kind is ObservationKind.PERMISSION_REQUEST
    acp = OpenCodeAcpCodec().decode_permission(PermissionRequest(
        request_id="perm-1", session_id="sess-3",
        options=(), tool_call={"name": "bash"}, deadline=0.0, received_at=0.0,
    ))
    assert acp.kind is ObservationKind.PERMISSION_REQUEST
    assert acp.tool_name == "bash"


def test_finish_boundary_identical_across_modes():
    """The driver never finishes; only the adapter proposes."""
    from agent_box_harnesses.session.spi import HarnessSessionDriver

    assert not hasattr(HarnessSessionDriver, "finish_proposal")
    from agent_box_harnesses.opencode.acp import opencode_acp_driver_factory
    from agent_box_harnesses.adapters import ADAPTERS
    from agent_box_harnesses.registry import load_builtin_registry

    driver = opencode_acp_driver_factory(ADAPTERS["opencode"], load_builtin_registry().get("opencode"))
    assert not hasattr(driver, "finish_proposal")