"""Engine protocol-behavior tests over the in-memory duplex peer.

These tests drive the engine against a synthetic thread peer speaking the
ACP wire protocol on a MemoryDuplexTransport.  No real agent, no network,
no credentials, no model request.
"""
from __future__ import annotations

import threading
import time

import pytest

from agent_box_acp import (
    AcpClientEngine, DiagnosticEvent, MemoryDuplexTransport, PermissionRequest,
    UpdateEvent,
)
from agent_box_acp.errors import (
    CANCEL_FAILED, PROTOCOL_INITIALIZE_FAILED, PROTOCOL_VERSION_INCOMPATIBLE,
    SESSION_START_AMBIGUOUS, SESSION_START_REJECTED,
    AcpEngineError, InitializeFailed, ProtocolVersionIncompatible,
    SessionStartAmbiguous, SessionStartRejected, TransportClosed,
)

INIT_RESULT = {
    "protocolVersion": "1",
    "implementation": {"name": "peer", "version": "1.0.0"},
    "agentCapabilities": {"loadSession": True, "sessionCapabilities": ["new", "load", "resume"],
                          "promptCapabilities": ["embeddedContext"], "mcpCapabilities": [],
                          "authMethods": ["noop"]},
}


class Peer:
    """Scripted memory peer: responds to known methods, records outbound."""

    def __init__(self, transport: MemoryDuplexTransport) -> None:
        self.transport = transport
        self.outbound: list[dict] = []
        self.gate = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self) -> None:
        while True:
            line = self.transport.peer_read_line()
            if line is None:
                return
            try:
                import json

                message = json.loads(line)
            except ValueError:
                continue
            self.outbound.append(message)
            self._handle(message)

    def _handle(self, message: dict) -> None:
        method = message.get("method")
        if method == "initialize":
            self.transport.feed_line(_reply(message["id"], INIT_RESULT))
        elif method == "session/new":
            self.transport.feed_line(_reply(message["id"], {"sessionID": "s1"}))
        elif method == "session/load":
            self.transport.feed_line(_reply(message["id"], {"sessionID": "s1"}))
        elif method == "session/resume":
            self.transport.feed_line(_reply(message["id"], {"sessionID": "s1"}))
        elif method == "session/cancel":
            self.transport.feed_line(_notification("session/update", {
                "sessionID": "s1",
                "update": {"kind": "agent_message_chunk", "payload": {"content": "c", "stopReason": "cancelled"}},
            }))
        elif method == "session/respond_permission":
            self.transport.feed_line(_notification("session/update", {
                "sessionID": "s1",
                "update": {"kind": "tool_call_update", "payload": {"name": "bash", "status": "completed"}},
            }))


def _reply(request_id, result):
    return (json_dumps({"jsonrpc": "2.0", "id": request_id, "result": result}) + "\n").encode()


def _notification(method, params):
    return (json_dumps({"jsonrpc": "2.0", "method": method, "params": params}) + "\n").encode()


def json_dumps(value: dict) -> str:
    import json

    return json.dumps(value, separators=(",", ":"))


def make_engine(**kwargs) -> tuple[AcpClientEngine, MemoryDuplexTransport, Peer]:
    transport = MemoryDuplexTransport()
    peer = Peer(transport)
    engine = AcpClientEngine(transport, **kwargs)
    return engine, transport, peer


def drain(engine: AcpClientEngine, timeout: float = 2.0) -> list:
    events = []
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        event = engine.poll(timeout=0.05)
        if event is not None:
            events.append(event)
            if len(events) > 64:
                break
    return events


def test_initialize_ok():
    engine, _, peer = make_engine()
    info = engine.initialize(timeout=5)
    assert info.protocol_version == "1"
    assert info.capabilities.load_session is True
    assert "new" in info.capabilities.session_capabilities
    engine.close()


def test_initialize_version_mismatch_rejected():
    transport = MemoryDuplexTransport()
    engine = AcpClientEngine(transport)

    def override():
        line = transport.peer_read_line(timeout=5)
        assert line is not None
        import json

        message = json.loads(line)
        assert message.get("method") == "initialize"
        result = dict(INIT_RESULT)
        result["protocolVersion"] = "2"
        transport.feed_line(_reply(message["id"], result))

    threading.Thread(target=override, daemon=True).start()
    with pytest.raises(ProtocolVersionIncompatible) as exc:
        engine.initialize(timeout=5)
    assert exc.value.code == PROTOCOL_VERSION_INCOMPATIBLE
    engine.close()


def test_initialize_missing_method_rejected():
    transport = MemoryDuplexTransport()
    engine = AcpClientEngine(transport)

    def wrong():
        line = transport.peer_read_line(timeout=5)
        assert line is not None
        import json

        message = json.loads(line)
        transport.feed_line(_error_reply(message["id"], -32601, "method not found"))

    threading.Thread(target=wrong, daemon=True).start()
    with pytest.raises(InitializeFailed) as exc:
        engine.initialize(timeout=5)
    assert exc.value.code == PROTOCOL_INITIALIZE_FAILED
    engine.close()


def test_session_new_and_prompt_streaming():
    engine, _, _ = make_engine()
    engine.initialize(timeout=5)
    session_id = engine.new_session(timeout=5)
    assert session_id == "s1"
    assert engine.prompt(session_id, "hello")
    assert engine.busy(session_id)
    transport_feed: MemoryDuplexTransport = engine._transport
    transport_feed.feed_line(_notification("session/update", {
        "sessionID": "s1",
        "update": {"kind": "agent_message_chunk", "payload": {"content": "hi"}},
    }))
    event = engine.poll(timeout=2)
    assert isinstance(event, UpdateEvent)
    assert event.kind == "agent_message_chunk"
    engine.end_turn(session_id)
    assert not engine.busy(session_id)
    engine.close()


def test_prompt_refused_while_turn_in_flight():
    engine, transport, _ = make_engine()
    engine.initialize(timeout=5)
    session_id = engine.new_session(timeout=5)
    assert engine.prompt(session_id, "first")
    assert not engine.prompt(session_id, "second")
    diagnostics = [item.code for item in engine.diagnostics()]
    assert "TURN_IN_FLIGHT_REJECTED" in diagnostics
    engine.end_turn(session_id)
    engine.close()


def test_session_start_timeout_is_ambiguous():
    transport = MemoryDuplexTransport()
    engine = AcpClientEngine(transport)

    def silent():
        time.sleep(5)
        transport.close()

    threading.Thread(target=silent, daemon=True).start()
    with pytest.raises(SessionStartAmbiguous) as exc:
        engine.new_session(timeout=0.5)
    assert exc.value.code == SESSION_START_AMBIGUOUS
    engine.close()


def test_session_start_explicit_rejection():
    transport = MemoryDuplexTransport()
    engine = AcpClientEngine(transport)

    def scripted():
        line = transport.peer_read_line(timeout=5)
        import json

        message = json.loads(line)
        if message.get("method") == "initialize":
            transport.feed_line(_reply(message["id"], INIT_RESULT))
            line = transport.peer_read_line(timeout=5)
            message = json.loads(line)
        transport.feed_line(_error_reply(message["id"], -32602, "invalid params"))

    threading.Thread(target=scripted, daemon=True).start()
    with pytest.raises(SessionStartRejected) as exc:
        engine.initialize(timeout=5)
        engine.new_session(timeout=5)
    assert exc.value.code == SESSION_START_REJECTED
    engine.close()


def test_permission_fifo_and_head_only_answering():
    engine, transport, _ = make_engine()
    engine.initialize(timeout=5)
    engine.new_session(timeout=5)
    for index in ("p1", "p2"):
        transport.feed_line(_notification("session/request_permission", {
            "sessionID": "s1", "requestID": index,
            "toolCall": {"name": "bash"},
            "options": [{"optionId": "allow", "name": "Allow", "kind": "allow_once"}],
        }))
    events = drain(engine)
    requests = [e for e in events if isinstance(e, PermissionRequest)]
    assert [r.request_id for r in requests] == ["p1", "p2"]
    assert engine.pending_permission().request_id == "p1"
    # answering the non-head request must fail closed
    assert not engine.respond_permission("p2", {"type": "selected", "selectedOptionID": "allow"})
    assert engine.pending_permission().request_id == "p1"
    assert engine.respond_permission("p1", {"type": "selected", "selectedOptionID": "allow"})
    assert engine.pending_permission().request_id == "p2"
    assert engine.respond_permission("p2", {"type": "cancelled"})
    assert engine.pending_permission() is None
    codes = [item.code for item in engine.diagnostics()]
    assert "PERMISSION_ANSWER_OUT_OF_ORDER" in codes
    engine.close()


def test_permission_duplicate_answer_refused():
    engine, transport, _ = make_engine()
    engine.initialize(timeout=5)
    engine.new_session(timeout=5)
    transport.feed_line(_notification("session/request_permission", {
        "sessionID": "s1", "requestID": "p1",
        "toolCall": {"name": "bash"},
        "options": [{"optionId": "allow", "name": "Allow", "kind": "allow_once"}],
    }))
    drain(engine)
    assert engine.respond_permission("p1", {"type": "selected", "selectedOptionID": "allow"})
    assert not engine.respond_permission("p1", {"type": "selected", "selectedOptionID": "allow"})
    engine.close()


def test_permission_expiry_detection():
    engine, transport, _ = make_engine(permission_timeout_s=1.0)
    engine.initialize(timeout=5)
    engine.new_session(timeout=5)
    transport.feed_line(_notification("session/request_permission", {
        "sessionID": "s1", "requestID": "p1",
        "toolCall": {"name": "bash"},
        "options": [{"optionId": "allow", "name": "Allow", "kind": "allow_once"}],
    }))
    drain(engine)
    time.sleep(1.2)
    expired = engine.expired_permissions()
    assert len(expired) == 1 and expired[0].request_id == "p1"
    engine.close()


def test_unknown_notification_and_stray_response_diagnostics():
    engine, transport, _ = make_engine()
    engine.initialize(timeout=5)
    transport.feed_line(_notification("session/unknown_thing", {"x": 1}))
    transport.feed_line((json_dumps({"jsonrpc": "2.0", "id": "ghost", "result": {}}) + "\n").encode())
    codes = [item.code for item in drain(engine)]
    assert "UNKNOWN_NOTIFICATION_METHOD" in codes
    assert "STRAY_RESPONSE" in codes
    engine.close()


def test_malformed_line_diagnostic_and_resync():
    engine, transport, _ = make_engine()
    engine.initialize(timeout=5)
    transport.feed_line(b"{\"broken\":\n")
    transport.feed_line(b"\xff\xfe not json\n")
    engine.new_session(timeout=5)  # still works after resync
    assert any(item.code == "MALFORMED_PROTOCOL_MESSAGE" for item in engine.diagnostics())
    engine.close()


def test_oversized_line_handled_with_diagnostic():
    engine, transport, _ = make_engine(max_frame_bytes=1024)
    engine.initialize(timeout=5)
    transport.feed_line(("x" * 4096 + "\n").encode())
    codes = [item.code for item in drain(engine)]
    assert "MALFORMED_PROTOCOL_MESSAGE" in codes or "FRAME_TOO_LARGE" in codes
    assert engine.new_session(timeout=5) == "s1"
    engine.close()


def test_prompt_after_transport_close_fails():
    engine, transport, _ = make_engine()
    engine.initialize(timeout=5)
    engine.new_session(timeout=5)
    transport.close()
    with pytest.raises(TransportClosed):
        engine.prompt("s1", "hello")
    engine.close()


def test_cancel_after_close_fails():
    engine, transport, _ = make_engine()
    engine.initialize(timeout=5)
    engine.new_session(timeout=5)
    transport.close()
    from agent_box_acp.errors import CancelFailed

    with pytest.raises(CancelFailed) as exc:
        engine.cancel("s1")
    assert exc.value.code == CANCEL_FAILED
    engine.close()


def test_close_is_idempotent_and_clean():
    engine, transport, _ = make_engine()
    engine.initialize(timeout=5)
    engine.close()
    engine.close()
    assert engine.closed()


def _error_reply(request_id, code, message):
    import json

    return (json.dumps({"jsonrpc": "2.0", "id": request_id,
                        "error": {"code": code, "message": message}},
                       separators=(",", ":")) + "\n").encode()