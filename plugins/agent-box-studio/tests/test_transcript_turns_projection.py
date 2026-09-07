"""P4 transcript turns projection (RED first, 2026-09-05).

The GUI's approved flat-transcript restore consumes a ``turns`` array
(``{turn_id, input, assistant_text, status, usage}``).  The transcript
endpoint previously returned only the raw event ledger, so restore could
never render the user's input or a per-turn assistant text.

The projection is derived from durable authority only: turn rows
(state/terminal outcome), the frozen turn input (the user's own text,
display-bounded), and the assistant.message events.  No fabrication.
"""
from __future__ import annotations

from conftest import TEST_TOKEN, create_session

from fastapi.testclient import TestClient


def test_transcript_projection_carries_flat_turns(client, project_dir):
    session = create_session(client, project_dir, "proj-turns-1")
    sid = session["session_id"]
    first = client.post(
        f"/api/v1/sessions/{sid}/turns",
        json={"idempotency_key": "proj-t1", "input": "hello projection"},
    )
    assert first.status_code == 202, first.text
    turn_id = first.json()["turn_id"]

    got = client.get(f"/api/v1/sessions/{sid}/transcript")
    assert got.status_code == 200, got.text
    body = got.json()
    assert body["session_id"] == sid
    assert isinstance(body["watermark"], int)
    turns = body["turns"]
    assert len(turns) == 1, turns
    row = turns[0]
    assert row["turn_id"] == turn_id
    assert row["input"] == "hello projection"
    assert "[fake] acknowledged" in (row["assistant_text"] or "")
    # terminal state vocabulary: the committed outcome, not a bare boolean
    assert row["status"] in {"succeeded", "failed", "cancelled", "completed"}
    usage = row.get("usage")
    assert usage is None or isinstance(usage, dict)


def test_transcript_projection_orders_and_bounds_multi_turn(client, project_dir):
    session = create_session(client, project_dir, "proj-turns-2")
    sid = session["session_id"]
    ids = []
    for i in range(2):
        response = client.post(
            f"/api/v1/sessions/{sid}/turns",
            json={"idempotency_key": f"proj-t2-{i}", "input": f"msg-{i}"},
        )
        assert response.status_code == 202, response.text
        ids.append(response.json()["turn_id"])
    got = client.get(f"/api/v1/sessions/{sid}/transcript")
    turns = got.json()["turns"]
    assert [t["turn_id"] for t in turns] == ids
    assert [t["input"] for t in turns] == ["msg-0", "msg-1"]
    # unknown session → typed 404, never a projection
    missing = client.get("/api/v1/sessions/sess_missing/transcript")
    assert missing.status_code == 404
