"""Cancel and permission/question respond API tests.

The fake provider has no runtime handle, so cancel exercises the honest
idempotency paths; real process-cancellation proof is covered by the
harness synthetic verticals (test_*_vertical.py) and the studio-level
real-chain vertical (test_harness_vertical.py).
"""
from __future__ import annotations

import threading

from conftest import TEST_TOKEN, create_session


class _GatedTerminalPollProvider:
    """Offline execution provider for the cancel/terminal-poll race test.

    ``observe()`` never emits a terminal observation: it signals the test
    that the observation loop is inside the polling iteration, then blocks
    until the test releases it.  ``dispatch_state()`` always reports a
    terminal process with exit code -15, so the in-loop polling path (not
    the post-loop cancel branch) is the path that proves the process exit.
    """

    def __init__(self) -> None:
        self.entered = threading.Event()
        self._gate = threading.Event()

    def descriptor(self):
        from agent_box.work_core.registry import ProviderDescriptor

        return ProviderDescriptor("gated-poll-harness", "Gated poll harness", "1")

    def capabilities(self) -> dict[str, str]:
        return {
            "session_turn_execution": "supported",
            "execution": "supported",
            "start": "supported",
            "network": "offline",
        }

    def input_limits(self) -> dict[str, tuple[int, int | None]]:
        from agent_box.protocols.session import SESSION_TURN_INPUT_CONTRACT_ID
        from agent_box.resource_contracts import WorkspaceV1

        return {
            SESSION_TURN_INPUT_CONTRACT_ID: (1, 1),
            WorkspaceV1.contract_id: (1, 1),
        }

    def start(self, request):
        from agent_box.work_core.registry import ExecutionStartReceipt, RecoverySupport

        return ExecutionStartReceipt(
            execution_id=request.execution_id,
            dispatch_id=request.dispatch_id,
            inputs_digest=request.inputs_digest,
            recovery_support=RecoverySupport.NONE,
        )

    def observe(self, native_ref):
        self.entered.set()
        self._gate.wait(timeout=30)
        return ()

    def dispatch_state(self, dispatch_id):
        return {"state": "terminal", "exit_code": -15}

    def cancel_dispatch(self, dispatch_id):
        pass

    def kill_dispatch(self, dispatch_id):
        pass


def test_cancel_racing_process_poll_terminal_commits_cancelled(studio_home, project_dir):
    """A cancel requested while the polling path proves process exit must
    commit CANCELLED with synchronized terminal evidence.

    The worker is parked inside the gated ``observe()`` when the test flips
    the run's cancel flag, so the terminal block runs with
    ``cancel_requested`` set and the process-poll terminal (exit -15)
    observed in the same iteration.  The committed turn outcome must be
    ``cancelled`` — never the pre-conversion ``failed`` evidence leaking
    into the commit authority.
    """
    from fastapi.testclient import TestClient

    from agent_box.extensions.bootstrap import build_extension_environment
    from agent_box_studio.config import StudioConfig
    from agent_box_studio.server.app import create_app

    provider = _GatedTerminalPollProvider()
    environment = build_extension_environment()
    environment.registry.register_execution_provider(provider)
    application = create_app(
        StudioConfig(worker_mode="thread"), environment=environment, token=TEST_TOKEN
    )
    with TestClient(application) as client:
        client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}"})
        service = application.state.service
        session = create_session(client, project_dir, "cancel-poll-1")
        sid = session["session_id"]
        accepted = client.post(
            f"/api/v1/sessions/{sid}/turns",
            json={"idempotency_key": "cancel-poll-turn", "input": "work"},
        )
        assert accepted.status_code == 202, accepted.text
        turn_id = accepted.json()["turn_id"]
        # The worker is past the loop-top cancel check and parked inside
        # observe(); the run control is still live.
        assert provider.entered.wait(timeout=30)
        run = service._runs.get(turn_id)
        assert run is not None, "run control vanished before the cancel flag was set"
        run.cancel_requested = True
        run.cancel_reason = "test"
        provider._gate.set()
        assert run.done.wait(timeout=30)
        turn = client.get(f"/api/v1/sessions/{sid}/turns/{turn_id}").json()["turn"]
        assert turn["terminal_outcome"] == "cancelled"


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
