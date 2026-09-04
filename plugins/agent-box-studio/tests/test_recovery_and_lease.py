"""Recovery + break-lease HTTP API: cross-session denial, CAS, fault windows."""
from __future__ import annotations

import pytest

from conftest import TEST_TOKEN, create_session


def _create_two_sessions(client, tmp_path):
    dir_a = tmp_path / "project-a"
    dir_b = tmp_path / "project-b"
    for directory in (dir_a, dir_b):
        directory.mkdir()
        (directory / "README.md").write_text("demo\n")
    session_a = create_session(client, dir_a, "recovery-a")["session_id"]
    session_b = create_session(client, dir_b, "recovery-b")["session_id"]
    return session_a, session_b


def _fault_once(step: str):
    state = {"fired": False}

    def hook(fired_step: str):
        if fired_step == step and not state["fired"]:
            state["fired"] = True
            raise RuntimeError("simulated crash between durable steps")

    return hook


def test_recovery_op_of_another_session_is_not_found(
    app, client, studio_home, tmp_path, monkeypatch
):
    """A recovery op belongs to its session: asking another session for it
    must 404 with RECOVERY_OP_NOT_FOUND, never leaking its existence."""
    session_a, session_b = _create_two_sessions(client, tmp_path)
    store = app.state.store
    store._fault_hook = _fault_once("begin_turn:execution")
    try:
        response = client.post(
            f"/api/v1/sessions/{session_a}/turns",
            json={"idempotency_key": "fault-turn", "input": "crash me"},
        )
        # The store converts the faulted execution window into a typed
        # RECOVERY_REQUIRED (409); anything untyped would surface as 500.
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "RECOVERY_REQUIRED"
    finally:
        store._fault_hook = None

    recovery_a = client.get(f"/api/v1/sessions/{session_a}/recovery").json()
    op_ids = [op["op_id"] for op in recovery_a["operations"]]
    assert "fault-turn" in op_ids

    # Session B sees nothing of session A's recovery surface.
    recovery_b = client.get(f"/api/v1/sessions/{session_b}/recovery").json()
    assert recovery_b["operations"] == []

    denied = client.post(f"/api/v1/sessions/{session_b}/recovery/fault-turn")
    assert denied.status_code == 404
    error = denied.json()["error"]
    assert error["code"] == "RECOVERY_OP_NOT_FOUND"
    # A random op id is indistinguishable from a foreign one.
    unknown = client.post(f"/api/v1/sessions/{session_a}/recovery/rec_unknown")
    assert unknown.status_code == 404
    assert unknown.json()["error"]["code"] == "RECOVERY_OP_NOT_FOUND"


def test_recovery_of_own_pending_op_resolves(app, client, studio_home, tmp_path):
    session_a, _ = _create_two_sessions(client, tmp_path)
    store = app.state.store
    store._fault_hook = _fault_once("begin_turn:execution")
    try:
        response = client.post(
            f"/api/v1/sessions/{session_a}/turns",
            json={"idempotency_key": "recover-turn", "input": "crash me"},
        )
        assert response.status_code == 409
    finally:
        store._fault_hook = None

    resolved = client.post(f"/api/v1/sessions/{session_a}/recovery/recover-turn")
    assert resolved.status_code == 200, resolved.text
    body = resolved.json()
    assert body["op_id"] == "recover-turn"
    assert body["state"] in {"RESOLVED", "ROLLED_BACK"}
    assert isinstance(body["detail"], str) and body["detail"]


def test_recovery_on_unknown_session_is_404_session_not_found(client, tmp_path):
    response = client.post("/api/v1/sessions/sess-missing/recovery/any-op")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SESSION_NOT_FOUND"


def _create_turn(client, session_id: str, key: str) -> dict:
    response = client.post(
        f"/api/v1/sessions/{session_id}/turns",
        json={"idempotency_key": key, "input": "x"},
    )
    assert response.status_code == 202, response.text
    return response.json()


def test_break_lease_cas_revalidates_owner(app, client, project_dir):
    session = create_session(client, project_dir, "lease-cas")
    sid = session["session_id"]
    turn = _create_turn(client, sid, "lease-turn-1")
    store = app.state.store
    store.acquire_writer_lease(sid, "writer-A")

    url = f"/api/v1/sessions/{sid}/lease/break"
    wrong_owner = client.post(
        url,
        json={
            "expected_owner_id": "writer-B",
            "expected_turn_id": turn["turn_id"],
            "reason": "operator believes the writer is stale",
            "confirm": True,
        },
    )
    assert wrong_owner.status_code == 409
    assert wrong_owner.json()["error"]["code"] == "SESSION_WRITER_CONFLICT"
    # CAS fail-closed: the lease is still held by writer-A.
    row = store._connection().execute(
        "SELECT owner_id FROM writer_leases WHERE session_id = ?", (sid,)
    ).fetchone()
    assert row["owner_id"] == "writer-A"

    correct = client.post(
        url,
        json={
            "expected_owner_id": "writer-A",
            "expected_turn_id": turn["turn_id"],
            "reason": "confirmed stale writer",
            "confirm": True,
        },
    )
    assert correct.status_code == 200, correct.text
    assert correct.json() == {"session_id": sid, "lease": "broken"}
    assert store._connection().execute(
        "SELECT 1 FROM writer_leases WHERE session_id = ?", (sid,)
    ).fetchone() is None


def test_break_lease_rejects_turn_of_another_session(app, client, tmp_path):
    session_a, session_b = _create_two_sessions(client, tmp_path)
    turn_b = _create_turn(client, session_b, "lease-turn-b")
    store = app.state.store
    store.acquire_writer_lease(session_a, "writer-A")
    response = client.post(
        f"/api/v1/sessions/{session_a}/lease/break",
        json={
            "expected_owner_id": "writer-A",
            "expected_turn_id": turn_b["turn_id"],
            "reason": "cross-session turn id",
            "confirm": True,
        },
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "TURN_NOT_FOUND"


def test_break_lease_on_unknown_session_is_404(client):
    response = client.post(
        "/api/v1/sessions/sess-missing/lease/break",
        json={
            "expected_owner_id": "writer-A",
            "expected_turn_id": "turn_x",
            "reason": "r",
            "confirm": True,
        },
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SESSION_NOT_FOUND"
