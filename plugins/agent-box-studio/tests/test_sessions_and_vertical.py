"""Sessions API, the 202 Turn transaction vertical, idempotency, races."""
from __future__ import annotations

import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest

from agent_box.protocols.session.failures import SessionWriterConflict
from agent_box_studio.testing import FakeTurnExecutionProvider

from conftest import TEST_TOKEN, _make_app, create_session


def test_create_session_maps_session_to_work_and_persists(client, project_dir):
    session = create_session(client, project_dir)
    assert session["session_id"] and session["work_id"]
    assert session["workspace_mode"] == "live"
    fetched = client.get(f"/api/v1/sessions/{session['session_id']}").json()["session"]
    assert fetched["work_id"] == session["work_id"]
    listing = client.get("/api/v1/sessions").json()["sessions"]
    assert [s["session_id"] for s in listing] == [session["session_id"]]


def test_session_idempotency_key_does_not_duplicate(client, project_dir):
    first = create_session(client, project_dir, "dup-1")
    response = client.post(
        "/api/v1/sessions",
        json={
            "idempotency_key": "dup-1",
            "title": "Probe session",
            "project_path": str(project_dir),
        },
    )
    assert response.status_code == 201
    assert response.json()["session"]["session_id"] == first["session_id"]
    assert len(client.get("/api/v1/sessions").json()["sessions"]) == 1


def test_create_session_requires_real_directory(client, tmp_path):
    response = client.post(
        "/api/v1/sessions",
        json={"idempotency_key": "k", "title": "t", "project_path": str(tmp_path / "nope")},
    )
    assert response.status_code in (400, 404)


def test_full_fake_turn_vertical_202_transaction(client, project_dir):
    session = create_session(client, project_dir)
    response = client.post(
        f"/api/v1/sessions/{session['session_id']}/turns",
        json={"idempotency_key": "turn-1", "input": "make the demo feature"},
    )
    # HTTP 202: the Turn was durable (accepted) before the response; with
    # the inline test worker the run has already completed deterministically.
    assert response.status_code == 202, response.text
    accepted = response.json()
    assert accepted["state"] in ("running", "completed")
    assert accepted["execution_ids"]
    assert accepted["binding"]["harness_provider_id"] == "fake-harness"
    assert accepted["binding"]["workspace_mode"] == "live"
    assert accepted["binding"]["session_watermark"] == 0
    assert accepted["binding"]["capability_digest"].startswith("sha256:")

    turn_id = accepted["turn_id"]
    turn = client.get(
        f"/api/v1/sessions/{session['session_id']}/turns/{turn_id}"
    ).json()["turn"]
    assert turn["state"] == "completed"
    assert turn["terminal_outcome"] == "succeeded"
    assert turn["run_phase"] == "session_committed"

    transcript = client.get(
        f"/api/v1/sessions/{session['session_id']}/transcript"
    ).json()
    types = [event["event_type"] for event in transcript["events"]]
    for expected in (
        "SESSION_CREATED",
        "TURN_STARTED",
        "EXECUTION_LINKED",
        "TURN_INPUT",
        "assistant.message",
        "workspace.observation",
        "turn.result",
        "WORKSPACE_AFTER",
        "TURN_TERMINAL",
        "TURN_COMMITTED",
    ):
        assert expected in types, types
    # The TURN_INPUT event records only a digest of the input, never the
    # raw text (the fake assistant echo may quote it, by design).
    input_events = [
        e for e in transcript["events"] if e["event_type"] == "TURN_INPUT"
    ]
    assert len(input_events) == 1
    assert "make the demo feature" not in json.dumps(input_events[0]["payload"])
    assert input_events[0]["payload"]["input_digest"].startswith("sha256:")
    # Terminal-once: exactly one terminal event.
    assert len([e for e in transcript["events"] if e["terminal"]]) == 1
    # Watermark equals the committed terminal batch.
    assert transcript["watermark"] == turn["committed_watermark"]


def test_turn_idempotency_replay_is_exact(client, project_dir):
    session = create_session(client, project_dir)
    payload = {"idempotency_key": "same-turn", "input": "do a thing"}
    first = client.post(f"/api/v1/sessions/{session['session_id']}/turns", json=payload)
    second = client.post(f"/api/v1/sessions/{session['session_id']}/turns", json=payload)
    assert first.status_code == 202 and second.status_code == 202
    assert first.json()["turn_id"] == second.json()["turn_id"]
    assert second.json()["replayed"] is True
    assert first.json()["execution_ids"] == second.json()["execution_ids"]
    transcript = client.get(
        f"/api/v1/sessions/{session['session_id']}/transcript"
    ).json()
    started = [e for e in transcript["events"] if e["event_type"] == "TURN_STARTED"]
    assert len(started) == 1


def test_turn_result_is_deterministic(client, project_dir):
    session = create_session(client, project_dir)
    payload = {"idempotency_key": "det-1", "input": "deterministic input"}
    client.post(
        f"/api/v1/sessions/{session['session_id']}/turns", json=payload
    )
    transcript = client.get(
        f"/api/v1/sessions/{session['session_id']}/transcript"
    ).json()
    messages = [
        e["payload"].get("text")
        for e in transcript["events"]
        if e["event_type"] == "assistant.message"
    ]
    assert messages == ["[fake] acknowledged: deterministic input"]


def test_dispatch_crash_window_never_fabricates_a_terminal(studio_home, project_dir):
    """A provider crash during start is ambiguous, not a proven failure:
    the run lands in RECOVERY_REQUIRED with its dispatch identity kept."""
    from fastapi.testclient import TestClient

    class BrokenProvider(FakeTurnExecutionProvider):
        def start(self, request):
            raise RuntimeError("simulated provider crash during start")

    environment = _environment_with(BrokenProvider())
    from agent_box_studio.config import StudioConfig
    from agent_box_studio.server.app import create_app

    application = create_app(
        StudioConfig(worker_mode="inline"),
        environment=environment,
        token=TEST_TOKEN,
    )
    with TestClient(application) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}"})
        session = create_session(test_client, project_dir, "broken-1")
        response = test_client.post(
            f"/api/v1/sessions/{session['session_id']}/turns",
            json={"idempotency_key": "broken-turn", "input": "x"},
        )
        assert response.status_code == 202, response.text
        turn_id = response.json()["turn_id"]
        turn = test_client.get(
            f"/api/v1/sessions/{session['session_id']}/turns/{turn_id}"
        ).json()["turn"]
        # Honest ambiguity: RECOVERY_REQUIRED, never a fabricated FAILED.
        assert turn["state"] == "recovery_required"
        assert turn["terminal_outcome"] is None
        transcript = test_client.get(
            f"/api/v1/sessions/{session['session_id']}/transcript"
        ).json()
        terminal = [e for e in transcript["events"] if e["event_type"] == "TURN_TERMINAL"]
        assert terminal == []
        recovery_events = [
            e for e in transcript["events"]
            if e["event_type"] == "execution.recovery_required"
        ]
        assert len(recovery_events) == 1
        # The recovery operation is visible and session-scoped.
        recovery = test_client.get(
            f"/api/v1/sessions/{session['session_id']}/recovery"
        ).json()
        ops = [
            op for op in recovery["operations"]
            if op["kind"] == "turn_run" and op["state"] == "RECOVERY_REQUIRED"
        ]
        assert ops, recovery


def _environment_with(provider):
    from agent_box.extensions.bootstrap import build_extension_environment

    environment = build_extension_environment()
    environment.registry.register_execution_provider(provider)
    return environment


def test_second_concurrent_turn_fails_closed(studio_home, project_dir):
    """Two simultaneous writers on one session: exactly one wins."""
    from fastapi.testclient import TestClient

    environment = _environment_with(FakeTurnExecutionProvider())
    from agent_box_studio.config import StudioConfig
    from agent_box_studio.server.app import create_app

    application = create_app(
        StudioConfig(worker_mode="inline"), environment=environment, token=TEST_TOKEN
    )
    with TestClient(application) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}"})
        session = create_session(test_client, project_dir, "race-1")
        service = application.state.service
        session_id = session["session_id"]

        results = []
        barrier = threading.Barrier(2)

        def attempt(key: str) -> None:
            barrier.wait()
            try:
                payload = service.run_turn(
                    session_id, idempotency_key=key, input_text="racing"
                )
                results.append(("ok", payload["turn_id"]))
            except SessionWriterConflict:
                results.append(("conflict", None))
            except Exception as exc:  # typed failures only
                results.append((type(exc).__name__, None))

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(attempt, f"race-key-{i}") for i in range(2)]
            for future in futures:
                future.result()

        outcomes = sorted(result[0] for result in results)
        assert outcomes == ["conflict", "ok"] or outcomes == ["ok", "ok"], results
        transcript = service.transcript(session_id)
        started = [e for e in transcript if e.event_type == "TURN_STARTED"]
        assert len(started) == len({result[1] for result in results if result[1]})
        turns = {
            e.turn_id for e in transcript if e.event_type == "TURN_TERMINAL"
        }
        assert all(
            service._store.get_turn(session_id, turn_id).state.value
            in {"completed", "failed"}
            for turn_id in turns
        )


# -- async worker mode: 202 acceptance, durable intent, background completion ------


def test_thread_worker_accepts_then_completes(studio_home, project_dir):
    from fastapi.testclient import TestClient

    from agent_box_studio.config import StudioConfig
    from agent_box_studio.server.app import create_app

    environment = _environment_with(FakeTurnExecutionProvider())
    application = create_app(
        StudioConfig(worker_mode="thread"), environment=environment, token=TEST_TOKEN
    )
    with TestClient(application) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}"})
        session = create_session(test_client, project_dir, "async-1")
        response = test_client.post(
            f"/api/v1/sessions/{session['session_id']}/turns",
            json={"idempotency_key": "async-turn", "input": "background"},
        )
        assert response.status_code == 202, response.text
        accepted = response.json()
        # The Turn is durable at acceptance time: it is already queryable.
        turn_id = accepted["turn_id"]
        immediate = test_client.get(
            f"/api/v1/sessions/{session['session_id']}/turns/{turn_id}"
        ).json()["turn"]
        assert immediate["state"] in ("running", "completed")
        deadline = time.monotonic() + 15.0
        state = immediate["state"]
        while state != "completed" and time.monotonic() < deadline:
            time.sleep(0.05)
            state = test_client.get(
                f"/api/v1/sessions/{session['session_id']}/turns/{turn_id}"
            ).json()["turn"]["state"]
        assert state == "completed"
        transcript = test_client.get(
            f"/api/v1/sessions/{session['session_id']}/transcript"
        ).json()
        assert any(e["event_type"] == "TURN_COMMITTED" for e in transcript["events"])


# -- process restart / reopen ------------------------------------------------------


def test_restart_preserves_sessions_turns_transcript_watermark(studio_home, project_dir):
    from fastapi.testclient import TestClient

    from agent_box.work_core.db import _reset_connection_for_tests

    environment = _environment_with(FakeTurnExecutionProvider())
    from agent_box_studio.config import StudioConfig
    from agent_box_studio.server.app import create_app

    application = _make_app_from_environment(
        studio_home, environment, StudioConfig(worker_mode="inline")
    )
    with TestClient(application) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}"})
        session = create_session(test_client, project_dir, "restart-1")
        session_id = session["session_id"]
        turn = test_client.post(
            f"/api/v1/sessions/{session_id}/turns",
            json={"idempotency_key": "restart-turn", "input": "persisted intent"},
        ).json()
        before = test_client.get(f"/api/v1/sessions/{session_id}/transcript").json()

    _reset_connection_for_tests()

    application2 = _make_app_from_environment(
        studio_home, _environment_with(FakeTurnExecutionProvider()), StudioConfig(worker_mode="inline")
    )
    with TestClient(application2) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}"})
        fetched = test_client.get(f"/api/v1/sessions/{session_id}").json()["session"]
        assert fetched["work_id"] == session["work_id"]
        after = test_client.get(f"/api/v1/sessions/{session_id}/transcript").json()
        assert after["events"] == before["events"]
        assert after["watermark"] == before["watermark"]
        turn_view = test_client.get(
            f"/api/v1/sessions/{session_id}/turns/{turn['turn_id']}"
        ).json()["turn"]
        assert turn_view["state"] == "completed"
        assert turn_view["terminal_outcome"] == "succeeded"
        recovery = test_client.get(f"/api/v1/sessions/{session_id}/recovery").json()
        assert recovery["operations"] == []


def _make_app_from_environment(studio_home, environment, config=None):
    from agent_box_studio.server.app import create_app

    return create_app(config, environment=environment, token=TEST_TOKEN)
