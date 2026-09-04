"""WS cursor replay, gap/resync, and live tail tests."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from conftest import TEST_TOKEN, _make_app, create_session

from agent_box_studio.server.events import SessionEventStream


def _ticket(client) -> str:
    return client.post("/api/v1/ws-ticket").json()["ticket"]


def _ws(client, session_id: str, after: int):
    return client.websocket_connect(
        f"/api/v1/sessions/{session_id}/events?ticket={_ticket(client)}&after={after}"
    )


def test_replay_after_zero_returns_all_events(client, project_dir):
    session = create_session(client, project_dir)
    client.post(
        f"/api/v1/sessions/{session['session_id']}/turns",
        json={"idempotency_key": "ws-1", "input": "hello"},
    )
    with _ws(client, session["session_id"], 0) as websocket:
        batch = websocket.receive_json()
        assert batch["type"] == "replay"
        seqs = [event["seq"] for event in batch["events"]]
        assert seqs == sorted(seqs)
        assert len(seqs) >= 8
        assert batch["watermark"] == seqs[-1] or batch["watermark"] >= seqs[-1]


def test_replay_after_cursor_serves_only_later_events(client, project_dir):
    session = create_session(client, project_dir)
    client.post(
        f"/api/v1/sessions/{session['session_id']}/turns",
        json={"idempotency_key": "ws-2", "input": "hello"},
    )
    watermark = client.get(
        f"/api/v1/sessions/{session['session_id']}/transcript"
    ).json()["watermark"]
    with _ws(client, session["session_id"], watermark - 2) as websocket:
        batch = websocket.receive_json()
        assert batch["type"] == "replay"
        seqs = [event["seq"] for event in batch["events"]]
        assert all(seq > watermark - 2 for seq in seqs)
        assert len(seqs) == 2


def test_replay_at_watermark_is_empty_no_duplicates(client, project_dir):
    session = create_session(client, project_dir)
    client.post(
        f"/api/v1/sessions/{session['session_id']}/turns",
        json={"idempotency_key": "ws-3", "input": "hello"},
    )
    watermark = client.get(
        f"/api/v1/sessions/{session['session_id']}/transcript"
    ).json()["watermark"]
    with _ws(client, session["session_id"], watermark) as websocket:
        batch = websocket.receive_json()
        assert batch["type"] == "replay"
        assert batch["events"] == []


def test_cursor_beyond_watermark_returns_typed_resync(client, project_dir):
    session = create_session(client, project_dir)
    with _ws(client, session["session_id"], 99999) as websocket:
        message = websocket.receive_json()
        assert message["type"] == "resync_required"
        assert "reason" in message


def test_invalid_ticket_is_rejected(app, studio_home):
    with TestClient(app) as test_client:
        with pytest.raises(Exception):
            with test_client.websocket_connect(
                "/api/v1/sessions/sess/events?ticket=forged&after=0"
            ):
                pass


def test_live_tail_pushes_new_events(client, project_dir):
    session = create_session(client, project_dir, "live-1")
    stream: SessionEventStream = client.app.state.stream
    with _ws(client, session["session_id"], 0) as websocket:
        replay = websocket.receive_json()
        assert replay["type"] == "replay"
        # A second turn lands while the socket is open.
        client.post(
            f"/api/v1/sessions/{session['session_id']}/turns",
            json={"idempotency_key": "live-turn", "input": "while open"},
        )
        # Live batches may split across in-flight appends; keep consuming
        # until the committed event arrives.
        seen_types: list[str] = []
        got_cursor = None
        # Live batches may split across in-flight appends; keep consuming
        # (bounded, with breathing room for the notify thread) until the
        # committed event arrives.
        for _ in range(60):
            message = websocket.receive_json()
            if message["type"] == "resync_required":
                pytest.fail(f"unexpected resync: {message}")
            if message["type"] != "events":
                continue
            seen_types.extend(e["event_type"] for e in message["events"])
            if any(e["event_type"] == "TURN_COMMITTED" for e in message["events"]):
                got_cursor = max(e["seq"] for e in message["events"])
                break
        assert "TURN_COMMITTED" in seen_types
        assert got_cursor is not None
        cursor = got_cursor
        # The delivered cursor never exceeds the durable ledger.
        final = client.get(
            f"/api/v1/sessions/{session['session_id']}/transcript"
        ).json()
        assert cursor <= final["watermark"]


# -- regression: WS auth boundary + cursor replay after hardening -----------------

from starlette.websockets import WebSocketDisconnect


def _connect(client, session_id: str, *, ticket=None, after: int = 0):
    query = f"after={after}"
    if ticket is not None:
        query = f"ticket={ticket}&{query}"
    return client.websocket_connect(
        f"/api/v1/sessions/{session_id}/events?{query}"
    )


def _assert_ws_rejected_4401(client, session_id: str, *, ticket=None, after: int = 0):
    with pytest.raises(WebSocketDisconnect) as excinfo:
        with _connect(client, session_id, ticket=ticket, after=after):
            pass
    assert excinfo.value.code == 4401


def test_ws_without_ticket_closes_4401(app, project_dir):
    with TestClient(app) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}"})
        session = create_session(test_client, project_dir, "ws-4401-0")
        _assert_ws_rejected_4401(test_client, session["session_id"])


def test_ws_invalid_ticket_closes_4401(app, project_dir):
    with TestClient(app) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}"})
        session = create_session(test_client, project_dir, "ws-4401-1")
        _assert_ws_rejected_4401(
            test_client, session["session_id"], ticket="forged-ticket"
        )


def test_ws_expired_ticket_closes_4401(app, project_dir, monkeypatch):
    import time as real_time_module

    import agent_box_studio.auth as auth_module

    with TestClient(app) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}"})
        session = create_session(test_client, project_dir, "ws-4401-2")
        ticket = test_client.post("/api/v1/ws-ticket").json()["ticket"]

        class ShiftedClock:
            @staticmethod
            def time():
                return real_time_module.time() + 3600

        monkeypatch.setattr(auth_module, "time", ShiftedClock)
        _assert_ws_rejected_4401(test_client, session["session_id"], ticket=ticket)


def test_ws_reused_ticket_closes_4401(app, project_dir):
    with TestClient(app) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}"})
        session = create_session(test_client, project_dir, "ws-4401-3")
        ticket = test_client.post("/api/v1/ws-ticket").json()["ticket"]
        sid = session["session_id"]
        with _connect(test_client, sid, ticket=ticket) as websocket:
            assert websocket.receive_json()["type"] == "replay"
        _assert_ws_rejected_4401(test_client, sid, ticket=ticket)


def test_valid_ticket_replay_matches_transcript(client, project_dir):
    """Regression: after the DTO/envelope hardening, valid tickets still
    replay durable events and the transcript endpoint is unaffected."""
    session = create_session(client, project_dir, "ws-replay-regression")
    sid = session["session_id"]
    client.post(
        f"/api/v1/sessions/{sid}/turns",
        json={"idempotency_key": "ws-regr-turn", "input": "hello"},
    )
    rest = client.get(f"/api/v1/sessions/{sid}/transcript").json()
    assert rest["events"]
    with _ws(client, sid, 0) as websocket:
        batch = websocket.receive_json()
        assert batch["type"] == "replay"
        ws_seqs = [event["seq"] for event in batch["events"]]
        assert ws_seqs == [event["seq"] for event in rest["events"]]
        assert batch["watermark"] == rest["watermark"]
