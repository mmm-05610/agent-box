"""Synthetic ACP vertical: real subprocess fake agent + PipeDuplexTransport.

Covers the full transport lifecycle the engine cannot exercise through the
memory peer: process spawn-by-test (the Runtime remains the spawn authority
in production), stderr draining, malformed frames, unknown methods,
oversized frames, early process exit, permission flow, cancel and cleanup.
No model request is ever made; no credential is read.
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

from agent_box_acp import AcpClientEngine, PipeDuplexTransport

FIXTURE = Path(__file__).parent / "fixtures" / "fake_acp_agent.py"

PYTHON = sys.executable


def spawn(mode: str) -> subprocess.Popen:
    env = dict(os.environ)
    env["FAKE_ACP_MODE"] = mode
    env["HOME"] = str(Path(__file__).parent / "isolated-home")
    return subprocess.Popen(
        [PYTHON, str(FIXTURE)],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=env,
    )


def bind(process: subprocess.Popen, **kwargs) -> AcpClientEngine:
    transport = PipeDuplexTransport(process.stdin, process.stdout, process.stderr)
    return AcpClientEngine(transport, **kwargs), transport


def test_vertical_normal_flow():
    process = spawn("normal")
    engine, transport = bind(process)
    try:
        info = engine.initialize(timeout=10)
        assert info.protocol_version == "1"
        session_id = engine.new_session(timeout=10)
        assert session_id == "fake-session-1"
        assert engine.prompt(session_id, "hi")
        from agent_box_acp import UpdateEvent

        seen = []
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and not any(
            isinstance(e, UpdateEvent) and _has_stop(e) for e in seen
        ):
            event = engine.poll(timeout=0.5)
            if event is not None:
                seen.append(event)
        updates = [e for e in seen if isinstance(e, UpdateEvent)]
        assert len(updates) >= 4
        assert updates[0].kind == "agent_message_chunk"
        assert any(e.kind == "tool_call" for e in updates)
        engine.end_turn(session_id)
        engine.close()
    finally:
        process.wait(timeout=5)
    assert process.returncode == 0


def test_vertical_permission_flow_and_cancel():
    process = spawn("permission")
    engine, transport = bind(process)
    try:
        engine.initialize(timeout=10)
        session_id = engine.new_session(timeout=10)
        engine.prompt(session_id, "hi")
        request = None
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and request is None:
            engine.poll(timeout=0.5)
            request = engine.pending_permission()
        assert request is not None and request.request_id == "perm-1"
        assert request.options[0].option_id == "allow"
        assert engine.select_permission(request.request_id, "allow")
        engine.cancel(session_id)
        engine.end_turn(session_id)
        engine.close()
    finally:
        process.wait(timeout=5)
    assert process.returncode == 0


def test_vertical_malformed_and_unknown_method_resync():
    process = spawn("malformed")
    engine, transport = bind(process)
    try:
        info = engine.initialize(timeout=10)
        assert info.protocol_version == "1"
        session_id = engine.new_session(timeout=10)
        assert session_id == "fake-session-1"
        codes = [item.code for item in engine.diagnostics()]
        assert "MALFORMED_PROTOCOL_MESSAGE" in codes
        engine.close()
    finally:
        process.wait(timeout=5)


def test_vertical_unknown_method_rejected():
    process = spawn("unknown-rt")
    engine, transport = bind(process)
    try:
        engine.initialize(timeout=10)
        from agent_box_acp.errors import PROTOCOL_METHOD_NOT_FOUND, AcpEngineError

        with pytest.raises(AcpEngineError) as exc:
            engine.new_session(timeout=10)
        assert exc.value.code == PROTOCOL_METHOD_NOT_FOUND
        engine.close()
    finally:
        process.wait(timeout=5)


def test_vertical_oversized_frame():
    process = spawn("oversized")
    engine, transport = bind(process, max_frame_bytes=1024)
    try:
        engine.initialize(timeout=10)
        engine.close()
    finally:
        process.wait(timeout=5)
    assert process.returncode == 0


def test_vertical_early_process_exit():
    process = spawn("early-exit")
    engine, transport = bind(process)
    try:
        with pytest.raises(Exception):
            engine.initialize(timeout=5)
    finally:
        process.wait(timeout=5)
    assert process.returncode == 0
    assert transport.closed()


def test_vertical_silent_peer_times_out_and_cleans_up():
    process = spawn("silent")
    engine, transport = bind(process, request_timeout_s=1.0)
    try:
        from agent_box_acp.errors import InitializeFailed

        with pytest.raises(InitializeFailed):
            engine.initialize(timeout=1.5)
    finally:
        engine.close()
        process.kill()
        process.wait(timeout=5)


def test_stderr_is_drained_and_bounded():
    process = spawn("normal")
    transport = PipeDuplexTransport(process.stdin, process.stdout, process.stderr)
    engine = AcpClientEngine(transport)
    try:
        engine.initialize(timeout=10)
        engine.close()
    finally:
        process.wait(timeout=5)
    tail = transport.stderr_tail()
    assert b"fake-acp" in tail  # agent diagnostics were drained, not lost


def test_transport_closed_detected_on_eof():
    process = spawn("early-exit")
    engine, transport = bind(process)
    deadline = time.monotonic() + 10
    while not transport.closed() and time.monotonic() < deadline:
        time.sleep(0.05)
    assert transport.closed()
    engine.close()


def _has_stop(event) -> bool:
    payload = getattr(event, "payload", {}) or {}
    return bool(payload.get("stopReason") or payload.get("stop_reason"))