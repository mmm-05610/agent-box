"""Cancel and permission/question respond API tests.

The fake provider has no runtime handle, so cancel exercises the honest
idempotency paths; real process-cancellation proof is covered by the
harness synthetic verticals (test_*_vertical.py) and the studio-level
real-chain vertical (test_harness_vertical.py).
"""
from __future__ import annotations

from conftest import TEST_TOKEN, create_session


def test_cancel_after_terminal_is_idempotent(client, project_dir):
    session = create_session(client, project_dir, "cancel-1")
    sid = session["session_id"]
    accepted = client.post(
        f"/api/v1/sessions/{sid}/turns",
        json={"idempotency_key": "cancel-turn", "input": "work"},
    ).json()
    turn_id = accepted["turn_id"]
    response = client.post(f"/api/v1/sessions/{sid}/turns/{turn_id}/cancel")
    assert response.status_code == 200
    body = response.json()
    assert body["turn_id"] == turn_id
    # The turn already committed: the cancel is an idempotent no-op that
    # never rewrites the committed outcome.
    turn = client.get(f"/api/v1/sessions/{sid}/turns/{turn_id}").json()["turn"]
    assert turn["terminal_outcome"] == "succeeded"


def test_cancel_unknown_turn_is_404(client, project_dir):
    session = create_session(client, project_dir, "cancel-2")
    response = client.post(
        f"/api/v1/sessions/{session['session_id']}/turns/turn_missing/cancel"
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "TURN_NOT_FOUND"


def test_permission_respond_rejects_unknown_request(client, project_dir):
    session = create_session(client, project_dir, "perm-1")
    response = client.post(
        f"/api/v1/sessions/{session['session_id']}/permissions/req_missing/respond",
        json={"decision": "approve"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "SESSION_ERROR"


def test_permission_respond_validates_decision_vocabulary(client, project_dir):
    session = create_session(client, project_dir, "perm-2")
    response = client.post(
        f"/api/v1/sessions/{session['session_id']}/permissions/req_x/respond",
        json={"decision": "maybe"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_question_respond_rejects_unknown_request(client, project_dir):
    session = create_session(client, project_dir, "q-1")
    response = client.post(
        f"/api/v1/sessions/{session['session_id']}/questions/req_missing/respond",
        json={"decision": "reject"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "SESSION_ERROR"
