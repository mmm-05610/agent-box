"""Canonical Observation decoder fixtures for the five Harnesses.

Native sample lines are taken from the documented/observed envelopes in
docs/research/harness-native-knowledge-2026-09-01 (matrices/event-and-
observation.md, harnesses/<id>/FACTS.md §H).  Unknown native events must be
tolerated as bounded, schema-tagged opaque values.
"""
import pytest

from agent_box_harnesses.adapters import ADAPTERS
from agent_box_harnesses.adapters.observation import ObservationKind, TerminalCondition

FIVE = ("codex", "claude", "opencode", "hermes", "pi")


def observations(adapter, lines):
    return adapter.decode_native_events(lines)


def test_codex_exec_json_stream(tmp_path):
    adapter = ADAPTERS["codex"]
    events = observations(adapter, (
        '{"type":"thread.started","thread_id":"0aa1c3d4-1111-4aaa-8ccc-example000001"}',
        '{"type":"turn.started"}',
        '{"type":"item.completed","item":{"type":"agent_message","text":"final answer"}}',
        '{"type":"turn.completed","usage":{"input_tokens":12,"cached_input_tokens":0,"output_tokens":7,"reasoning_output_tokens":0}}',
    ))
    kinds = [o.kind for o in events]
    assert ObservationKind.SESSION in kinds and ObservationKind.MESSAGE in kinds and ObservationKind.USAGE in kinds
    session = next(o for o in events if o.kind is ObservationKind.SESSION)
    assert session.session_locator == "0aa1c3d4-1111-4aaa-8ccc-example000001"
    terminal = next(o for o in events if o.kind is ObservationKind.TERMINAL)
    assert terminal.terminal_condition is TerminalCondition.TURN_COMPLETED


def test_codex_failure_events_are_terminal_errors():
    events = observations(ADAPTERS["codex"], (
        '{"type":"turn.failed","error":{"message":"model rejected the request"}}',
    ))
    terminal = events[-1]
    assert terminal.kind is ObservationKind.TERMINAL and terminal.is_error
    assert terminal.terminal_condition is TerminalCondition.FAILED


def test_claude_stream_json_stream():
    adapter = ADAPTERS["claude"]
    events = observations(adapter, (
        '{"type":"system","subtype":"init","session_id":"s-1","model":"claude-fable-5","tools":[],"slash_commands":[],"mcp_servers":[],"permissionMode":"default"}',
        '{"type":"assistant","message":{"content":[{"type":"text","text":"hi"},{"type":"tool_use","name":"Bash","id":"t1","input":{}}]},"session_id":"s-1"}',
        '{"type":"result","subtype":"success","is_error":false,"session_id":"s-1","total_cost_usd":0.01,"usage":{"input_tokens":3,"output_tokens":4},"result":"hi"}',
    ))
    kinds = [o.kind for o in events]
    assert ObservationKind.SESSION in kinds and ObservationKind.MESSAGE in kinds
    assert kinds.count(ObservationKind.TOOL_REQUEST) == 1
    assert ObservationKind.USAGE in kinds and ObservationKind.TERMINAL in kinds
    terminal = next(o for o in events if o.kind is ObservationKind.TERMINAL)
    assert terminal.terminal_condition is TerminalCondition.COMPLETED
    assert terminal.session_locator == "s-1"


def test_claude_control_request_is_a_permission_observation():
    events = observations(ADAPTERS["claude"], (
        '{"type":"control_request","request_id":"r1","request":{"subtype":"can_use_tool","tool_name":"Bash","input":{}}}',
    ))
    assert events[0].kind is ObservationKind.PERMISSION_REQUEST


def test_opencode_run_json_stream():
    adapter = ADAPTERS["opencode"]
    events = observations(adapter, (
        '{"type":"session.status","sessionID":"ses_1","status":{"type":"busy"}}',
        '{"type":"message.updated","sessionID":"ses_1"}',
        '{"type":"permission.asked","sessionID":"ses_1","permission":"bash"}',
        '{"type":"session.status","sessionID":"ses_1","status":{"type":"idle"}}',
    ))
    kinds = [o.kind for o in events]
    assert kinds[0] is ObservationKind.LIFECYCLE
    assert ObservationKind.PERMISSION_REQUEST in kinds
    terminal = next(o for o in events if o.kind is ObservationKind.TERMINAL)
    assert terminal.terminal_condition is TerminalCondition.COMPLETED


def test_opencode_session_error_is_terminal_failure():
    events = observations(ADAPTERS["opencode"], (
        '{"type":"session.error","sessionID":"ses_2","data":{"message":"provider exploded"}}',
    ))
    terminal = events[0]
    assert terminal.is_error and terminal.terminal_condition is TerminalCondition.FAILED
    assert "provider exploded" in terminal.text


def test_hermes_usage_file_document():
    adapter = ADAPTERS["hermes"]
    events = adapter.decode_native_document({
        "estimated_cost_usd": 0.25, "cost_status": "ok", "cost_source": "native",
        "input_tokens": 100, "output_tokens": 50, "total_tokens": 150,
        "api_calls": 3, "model": "offline-1", "provider": "offline",
        "session_id": "hermes-session-1", "completed": True, "failed": False,
    })
    kinds = [o.kind for o in events]
    assert ObservationKind.USAGE in kinds and ObservationKind.TERMINAL in kinds
    usage = next(o for o in events if o.kind is ObservationKind.USAGE)
    assert usage.usage["total_tokens"] == 150.0 and usage.usage["estimated_cost_usd"] == 0.25
    assert usage.session_locator == "hermes-session-1"
    terminal = next(o for o in events if o.kind is ObservationKind.TERMINAL)
    assert terminal.terminal_condition is TerminalCondition.COMPLETED


def test_hermes_usage_file_written_on_failure():
    events = ADAPTERS["hermes"].decode_native_document({
        "estimated_cost_usd": 0.0, "session_id": "hermes-session-2",
        "completed": False, "failed": True,
    })
    terminal = next(o for o in events if o.kind is ObservationKind.TERMINAL)
    assert terminal.is_error and terminal.terminal_condition is TerminalCondition.FAILED


def test_pi_mode_json_stream():
    adapter = ADAPTERS["pi"]
    events = observations(adapter, (
        '{"type":"session","version":3,"id":"11111111-2222-4333-8444-example00000x","timestamp":"2026-09-02T00:00:00Z","cwd":"/workspace"}',
        '{"type":"agent_start"}',
        '{"type":"tool_execution_start","toolCallId":"c1","toolName":"read","args":{}}',
        '{"type":"tool_execution_end","toolCallId":"c1","result":"ok","isError":false}',
        '{"type":"message_end","message":{"role":"assistant","text":"done","usage":{"input":10,"output":5,"totalTokens":15,"cost":{"total":0.01}}}}',
    ))
    kinds = [o.kind for o in events]
    assert kinds[0] is ObservationKind.SESSION
    assert events[0].session_locator == "11111111-2222-4333-8444-example00000x"
    assert ObservationKind.TOOL_REQUEST in kinds and ObservationKind.TOOL_RESULT in kinds
    assert ObservationKind.MESSAGE in kinds and ObservationKind.USAGE in kinds


@pytest.mark.parametrize("driver", FIVE)
def test_unknown_native_events_are_bounded_and_schema_tagged(driver):
    adapter = ADAPTERS[driver]
    events = observations(adapter, ('{"type":"brand-new-future-event","payload":{"nested":{"deep":1}}}',))
    assert len(events) == 1
    unknown = events[0]
    assert unknown.kind is ObservationKind.UNKNOWN
    assert unknown.warnings == ("UNKNOWN_NATIVE_EVENT",)
    assert unknown.native is not None and unknown.native.schema.startswith(adapter.harness_type + ".")


@pytest.mark.parametrize("driver", FIVE)
def test_malformed_lines_do_not_break_the_stream(driver):
    adapter = ADAPTERS[driver]
    events = observations(adapter, ("not-json-at-all", '{"type":"session","id":"x"}' if driver == "pi" else '{"type":"thread.started","thread_id":"x"}'))
    assert events[0].kind is ObservationKind.UNKNOWN
    assert any("MALFORMED" in warning or "DECODER" in warning for warning in events[0].warnings)


@pytest.mark.parametrize("driver", FIVE)
def test_oversized_native_lines_are_rejected_bounded(driver):
    adapter = ADAPTERS["hermes" if driver == "hermes" else driver]
    huge = '{"type":"x","blob":"' + "a" * 400000 + '"}'
    events = observations(adapter, (huge,))
    assert all(len(repr(event)) < 100000 for event in events)
