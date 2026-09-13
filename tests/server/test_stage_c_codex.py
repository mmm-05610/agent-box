from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import socket
import threading
import time
from urllib.request import Request, urlopen

from fastapi.testclient import TestClient
import uvicorn

from agent_box.server.bootstrap import build_runtime
from agent_box.server.execution import HarnessDescriptor, HarnessRegistry
from agent_box.server.legacy_codex import CodexExecutionBackend
from agent_box.server.transport.http import create_app
from agent_box.storage import MemorySecretStore
from agent_box_harnesses.codex.remote import validate_remote_configuration


def codex_registry():
    registry = HarnessRegistry()
    registry.register(HarnessDescriptor(
        "codex", credential_kind="codex-login",
        configuration_validator=validate_remote_configuration,
    ))
    return registry


THREAD_ID = "01999999-aaaa-7777-bbbb-cccccccccccc"
SESSION_PATH = f"sessions/2026/09/13/rollout-fixture-{THREAD_ID}.jsonl"


def _digest(content: bytes) -> str:
    return "sha256:" + hashlib.sha256(content).hexdigest()


@dataclass
class FakeAttempt:
    index: int
    cancelled: bool = False


class FakeCodexTransport:
    def __init__(self, *, blocked: bool = False, omit_native_state: bool = False):
        self.starts = []
        self.cancel_calls = 0
        self.cleanup_calls = 0
        self.abandon_calls = 0
        self.omit_native_state = omit_native_state
        self.release = threading.Event()
        if not blocked:
            self.release.set()

    def start(self, **values):
        attempt = FakeAttempt(len(self.starts))
        self.starts.append({**values, "attempt": attempt})
        return attempt

    def wait(self, attempt, *, timeout):
        assert self.release.wait(min(timeout, 5))
        return {
            "exitCode": None if attempt.cancelled else 0,
            "cancelled": attempt.cancelled,
            "timedOut": False,
        }

    def result_bytes(self, attempt, artifact):
        if artifact == "stderr":
            content = b""
        else:
            message = "first fixture answer" if attempt.index == 0 else "continued fixture answer"
            events = [
                {"type": "thread.started", "thread_id": THREAD_ID},
                {"type": "item.completed", "item": {"type": "agent_message", "text": message}},
                {"type": "turn.completed", "usage": {"input_tokens": 3, "output_tokens": 4}},
            ]
            content = b"\n".join(json.dumps(item).encode() for item in events) + b"\n"
        return content, _digest(content)

    def list_view(self, attempt):
        if self.omit_native_state:
            return ()
        content = self._native_content(attempt)
        return (
            {"path": "auth.json", "size": 999},
            {"path": SESSION_PATH, "size": len(content)},
        )

    def view_bytes(self, attempt, path):
        assert path == SESSION_PATH
        content = self._native_content(attempt)
        return content, _digest(content)

    @staticmethod
    def _native_content(attempt):
        return json.dumps({"thread_id": THREAD_ID, "turn": attempt.index + 1}).encode()

    def cancel(self, attempt):
        self.cancel_calls += 1
        attempt.cancelled = True
        self.release.set()
        return True

    def acknowledge_and_cleanup(self, attempt):
        self.cleanup_calls += 1

    def abandon(self, attempt):
        self.abandon_calls += 1


class WslFixture:
    def distributions(self):
        return [{"name": "Ubuntu"}]

    def probe(self, distribution, user):
        return {"probe_id": "probe", "distribution": distribution, "user": user or "tester"}

    def browse(self, probe_id, path):
        return {"probe_id": probe_id, "path": path, "directories": []}

    def open_workspace(self, probe_id, path):
        return {
            "connection_id": "connection-fixture", "distribution": "Ubuntu",
            "user": "tester", "path": path,
        }


def _post(client, headers, path, body, key):
    return client.post(path, headers={**headers, "Idempotency-Key": key}, json=body)


def _await_state(client, headers, session_id, state, timeout=5):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = client.get(f"/api/v1/sessions/{session_id}", headers=headers).json()
        if value["turns"] and value["turns"][-1]["state"] == state:
            return value
        time.sleep(0.01)
    raise AssertionError(f"Turn did not reach {state}: {value}")


def _open_product(runtime, client, headers):
    runtime.repository.register_credential("credential-fixture", "codex-login", "fixture")
    workspace = _post(client, headers, "/api/v1/workspaces", {
        "probe_id": "probe", "path": "/home/tester/project with 空格",
    }, "workspace").json()
    profile = _post(client, headers, "/api/v1/profiles", {
        "name": "Codex role", "harness_type": "codex",
        "configuration": {"model": "fixture-model", "reasoning_effort": "low"},
        "credential_id": "credential-fixture",
    }, "profile").json()
    session = _post(client, headers, "/api/v1/sessions", {
        "workspace_id": workspace["workspace_id"], "profile_id": profile["profile_id"],
    }, "session").json()
    return workspace, profile, session


def _runtime(root, transport, secrets=None):
    """Assemble the retained Work Order 37 legacy Codex path explicitly.

    Production bootstrap no longer wires any native Harness; these 37
    regression suites construct the historical backend themselves.
    """
    runtime = build_runtime(
        root,
        harnesses=codex_registry(),
        connector=WslFixture(),
        secret_store=secrets or MemorySecretStore({"fixture": b"{}"}),
    )
    backend = CodexExecutionBackend(
        runtime.repository, runtime.objects, runtime.secret_store, transport,
        on_event=runtime.notifier.notify,
    )
    runtime.execution = backend
    runtime.service.execution = backend
    runtime.service.sessions.execution = backend
    return runtime


def test_two_turns_use_core_and_exact_native_resume(tmp_path):
    transport = FakeCodexTransport()
    runtime = _runtime(tmp_path / "two-turns", transport)
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        headers = {"Authorization": f"Bearer {runtime.token}"}
        _workspace, profile, session = _open_product(runtime, client, headers)
        first = _post(client, headers, f"/api/v1/sessions/{session['session_id']}/turns", {
            "text": "remember fixture nonce ALPHA", "expected_profile_revision": 1,
        }, "turn-1")
        assert first.status_code == 202
        first_state = _await_state(client, headers, session["session_id"], "completed")
        first_turn = first_state["turns"][0]
        assert all(first_turn[key] for key in ("work_id", "execution_id", "dispatch_id"))
        assert transport.starts[0]["plan"].command[:4] == (
            "/runtime/bin/codex", "exec", "--color", "never",
        )
        assert transport.starts[0]["plan"].stdin == b"remember fixture nonce ALPHA"
        assert transport.starts[0]["credential"] == b"{}"

        second = _post(client, headers, f"/api/v1/sessions/{session['session_id']}/turns", {
            "text": "what was the fixture value?", "expected_profile_revision": 1,
        }, "turn-2")
        assert second.status_code == 202
        final = _await_state(client, headers, session["session_id"], "completed")
        resume = transport.starts[1]["plan"]
        assert resume.command[:4] == (
            "/runtime/bin/codex", "exec", "resume", THREAD_ID,
        )
        assert b"ALPHA" not in resume.stdin
        assert transport.starts[1]["restored_files"] == {
            SESSION_PATH: FakeCodexTransport._native_content(FakeAttempt(0)),
        }
        assert final["checkpoint"]["native_id"] == THREAD_ID
        assert [event["seq"] for event in final["events"]] == list(range(1, len(final["events"]) + 1))
        assert sum(event["kind"] == "message.delta" for event in final["events"]) == 2
        current_profile = next(
            item for item in runtime.repository.list_profiles()
            if item["profile_id"] == profile["profile_id"]
        )
        assert current_profile["native_generation"] == 2
        assert current_profile["config_revision"] == 1
        assert transport.cleanup_calls == 2


def test_restart_rebuilds_view_from_windows_checkpoint(tmp_path):
    root = tmp_path / "cold-resume"
    secrets = MemorySecretStore({"fixture": b"{}"})
    first_transport = FakeCodexTransport()
    first = _runtime(root, first_transport, secrets)
    with TestClient(create_app(first), base_url="http://127.0.0.1") as client:
        headers = {"Authorization": f"Bearer {first.token}"}
        _workspace, _profile, session = _open_product(first, client, headers)
        _post(client, headers, f"/api/v1/sessions/{session['session_id']}/turns", {
            "text": "first", "expected_profile_revision": 1,
        }, "first")
        _await_state(client, headers, session["session_id"], "completed")
        token = first.token

    second_transport = FakeCodexTransport()
    second = _runtime(root, second_transport, secrets)
    with TestClient(create_app(second), base_url="http://127.0.0.1") as client:
        headers = {"Authorization": f"Bearer {token}"}
        response = _post(client, headers, f"/api/v1/sessions/{session['session_id']}/turns", {
            "text": "second after restart", "expected_profile_revision": 1,
        }, "second")
        assert response.status_code == 202
        _await_state(client, headers, session["session_id"], "completed")
        assert second_transport.starts[0]["plan"].continuation_thread_id == THREAD_ID
        assert second_transport.starts[0]["restored_files"]
        assert second_transport.starts[0]["generation"] == 2


def test_profile_concurrency_and_idempotent_cancel(tmp_path):
    transport = FakeCodexTransport(blocked=True)
    runtime = _runtime(tmp_path / "cancel", transport)
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        headers = {"Authorization": f"Bearer {runtime.token}"}
        workspace, profile, session = _open_product(runtime, client, headers)
        other = _post(client, headers, "/api/v1/sessions", {
            "workspace_id": workspace["workspace_id"], "profile_id": profile["profile_id"],
        }, "other-session").json()
        turn = _post(client, headers, f"/api/v1/sessions/{session['session_id']}/turns", {
            "text": "blocked", "expected_profile_revision": 1,
        }, "blocked-turn").json()
        conflict = _post(client, headers, f"/api/v1/sessions/{other['session_id']}/turns", {
            "text": "conflict", "expected_profile_revision": 1,
        }, "conflict-turn")
        assert conflict.status_code == 409
        assert conflict.json()["error"]["code"] == "TURN_CONCURRENCY_CONFLICT"
        cancel = _post(client, headers, f"/api/v1/turns/{turn['turn_id']}/cancel", {}, "cancel")
        assert cancel.status_code == 202
        assert cancel.json()["accepted"] is True
        assert _post(client, headers, f"/api/v1/turns/{turn['turn_id']}/cancel", {}, "cancel").json() == cancel.json()
        assert transport.cancel_calls == 1
        _await_state(client, headers, session["session_id"], "cancelled")


def test_capture_failure_blocks_later_turn_and_never_acks(tmp_path):
    transport = FakeCodexTransport(omit_native_state=True)
    runtime = _runtime(tmp_path / "capture-failure", transport)
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        headers = {"Authorization": f"Bearer {runtime.token}"}
        _workspace, profile, session = _open_product(runtime, client, headers)
        _post(client, headers, f"/api/v1/sessions/{session['session_id']}/turns", {
            "text": "cannot capture", "expected_profile_revision": 1,
        }, "capture")
        failed = _await_state(client, headers, session["session_id"], "failed")
        assert failed["status"] == "recovery_required"
        assert failed["turns"][0]["error_code"] == "CODEX_NATIVE_STATE_MISSING"
        assert transport.cleanup_calls == 0
        assert transport.abandon_calls == 1
        assert next(item for item in runtime.repository.list_profiles()
                    if item["profile_id"] == profile["profile_id"])["recovery_pending"] is True
        blocked = _post(client, headers, f"/api/v1/sessions/{session['session_id']}/turns", {
            "text": "must refuse", "expected_profile_revision": 1,
        }, "after-failure")
        assert blocked.status_code == 409
        assert blocked.json()["error"]["code"] == "PROFILE_RECOVERY_REQUIRED"


def test_sse_wakeup_is_history_backed_and_disconnect_does_not_cancel(tmp_path):
    transport = FakeCodexTransport(blocked=True)
    runtime = _runtime(tmp_path / "events", transport)
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        headers = {"Authorization": f"Bearer {runtime.token}"}
        _workspace, _profile, session = _open_product(runtime, client, headers)
        generation = runtime.notifier.generation()
        turn = _post(client, headers, f"/api/v1/sessions/{session['session_id']}/turns", {
            "text": "keep running", "expected_profile_profile_revision": 1,
        }, "bad-schema")
        assert turn.status_code == 422
        turn = _post(client, headers, f"/api/v1/sessions/{session['session_id']}/turns", {
            "text": "keep running", "expected_profile_revision": 1,
        }, "running")
        assert turn.status_code == 202
        assert runtime.notifier.wait_after(generation, timeout=0.1) != generation
        replay = runtime.repository.list_events(session["session_id"], 0)
        assert replay[0]["kind"] == "turn.accepted"
        cursor = replay[-1]["seq"]
        assert runtime.repository.list_events(session["session_id"], cursor) == []
        assert transport.cancel_calls == 0
        transport.release.set()
        _await_state(client, headers, session["session_id"], "completed")
        followed = runtime.repository.list_events(session["session_id"], cursor)
        assert followed
        assert followed[-1]["data"]["state"] == "completed"
        assert transport.cancel_calls == 0


def test_generation_conflict_rolls_back_capture_and_requires_recovery(tmp_path):
    transport = FakeCodexTransport(blocked=True)
    runtime = _runtime(tmp_path / "generation-conflict", transport)
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        headers = {"Authorization": f"Bearer {runtime.token}"}
        _workspace, profile, session = _open_product(runtime, client, headers)
        _post(client, headers, f"/api/v1/sessions/{session['session_id']}/turns", {
            "text": "generation conflict", "expected_profile_revision": 1,
        }, "generation-conflict")
        with runtime.database.transaction() as conn:
            conn.execute(
                "UPDATE server_profiles SET native_generation=native_generation+1 WHERE id=?",
                (profile["profile_id"],),
            )
        transport.release.set()
        failed = _await_state(client, headers, session["session_id"], "failed")
        assert failed["turns"][0]["error_code"] == "PROFILE_GENERATION_CONFLICT"
        assert failed["checkpoint"] is None
        assert transport.cleanup_calls == 0
        assert transport.abandon_calls == 1


def test_second_session_never_receives_first_session_transcript(tmp_path):
    transport = FakeCodexTransport()
    runtime = _runtime(tmp_path / "session-isolation", transport)
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        headers = {"Authorization": f"Bearer {runtime.token}"}
        workspace, profile, first_session = _open_product(runtime, client, headers)
        _post(client, headers, f"/api/v1/sessions/{first_session['session_id']}/turns", {
            "text": "private first-session transcript", "expected_profile_revision": 1,
        }, "first-session-turn")
        _await_state(client, headers, first_session["session_id"], "completed")
        second_session = _post(client, headers, "/api/v1/sessions", {
            "workspace_id": workspace["workspace_id"], "profile_id": profile["profile_id"],
        }, "second-session").json()
        _post(client, headers, f"/api/v1/sessions/{second_session['session_id']}/turns", {
            "text": "independent session", "expected_profile_revision": 1,
        }, "second-session-turn")
        _await_state(client, headers, second_session["session_id"], "completed")
        second_start = transport.starts[1]
        assert second_start["plan"].continuation_thread_id is None
        assert second_start["restored_files"] == {}
        assert b"private first-session transcript" not in second_start["plan"].stdin


def test_server_shutdown_cancels_active_worker_attempt(tmp_path):
    transport = FakeCodexTransport(blocked=True)
    runtime = _runtime(tmp_path / "shutdown", transport)
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        headers = {"Authorization": f"Bearer {runtime.token}"}
        _workspace, _profile, session = _open_product(runtime, client, headers)
        _post(client, headers, f"/api/v1/sessions/{session['session_id']}/turns", {
            "text": "active during stop", "expected_profile_revision": 1,
        }, "shutdown-turn")
    assert transport.cancel_calls == 1
    assert transport.abandon_calls == 1
    assert runtime.repository.get_session(session["session_id"])["turns"][0]["state"] == "cancelled"


def _free_loopback_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def _network_post(base_url, token, path, body, key):
    request = Request(
        base_url + path, method="POST",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {token}", "Idempotency-Key": key,
                 "Content-Type": "application/json"},
    )
    with urlopen(request, timeout=5) as response:
        return response.status, json.load(response)


def _read_sse_event(response):
    value = {}
    while True:
        line = response.readline().decode("utf-8").rstrip("\r\n")
        if not line:
            if value:
                return value
            continue
        if line.startswith("id: "):
            value["id"] = int(line[4:])
        elif line.startswith("data: "):
            value["data"] = json.loads(line[6:])


def test_real_socket_sse_disconnect_and_history_reconnect_has_no_gap(tmp_path):
    transport = FakeCodexTransport(blocked=True)
    runtime = _runtime(tmp_path / "socket-sse", transport)
    port = _free_loopback_port()
    base_url = f"http://127.0.0.1:{port}"
    server = uvicorn.Server(uvicorn.Config(
        create_app(runtime), host="127.0.0.1", port=port,
        log_level="error", lifespan="on",
    ))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 5
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.01)
    try:
        assert server.started
        runtime.repository.register_credential("credential-fixture", "codex-login", "fixture")
        _, workspace = _network_post(base_url, runtime.token, "/api/v1/workspaces", {
            "probe_id": "probe", "path": "/home/tester/project with 空格",
        }, "socket-workspace")
        _, profile = _network_post(base_url, runtime.token, "/api/v1/profiles", {
            "name": "socket role", "harness_type": "codex",
            "configuration": {"model": "fixture-model", "reasoning_effort": "low"},
            "credential_id": "credential-fixture",
        }, "socket-profile")
        _, session = _network_post(base_url, runtime.token, "/api/v1/sessions", {
            "workspace_id": workspace["workspace_id"], "profile_id": profile["profile_id"],
        }, "socket-session")
        _, turn = _network_post(
            base_url, runtime.token,
            f"/api/v1/sessions/{session['session_id']}/turns",
            {"text": "continue after subscriber closes", "expected_profile_revision": 1},
            "socket-turn",
        )
        request = Request(
            f"{base_url}/api/v1/sessions/{session['session_id']}/events?after=0",
            headers={"Authorization": f"Bearer {runtime.token}"},
        )
        first_response = urlopen(request, timeout=5)
        first_event = _read_sse_event(first_response)
        cursor = first_event["id"]
        first_response.close()
        assert transport.cancel_calls == 0

        transport.release.set()
        deadline = time.monotonic() + 5
        while runtime.repository.get_session(session["session_id"])["turns"][-1]["state"] != "completed":
            assert time.monotonic() < deadline
            time.sleep(0.01)

        request = Request(
            f"{base_url}/api/v1/sessions/{session['session_id']}/events?after={cursor}",
            headers={"Authorization": f"Bearer {runtime.token}"},
        )
        with urlopen(request, timeout=5) as replay:
            received = []
            while True:
                event = _read_sse_event(replay)
                received.append(event)
                data = event["data"]
                if (data["turn_id"] == turn["turn_id"] and data["kind"] == "turn.state"
                        and data["data"].get("state") == "completed"):
                    break
        assert [event["id"] for event in received] == list(
            range(cursor + 1, received[-1]["id"] + 1),
        )
        assert transport.cancel_calls == 0
    finally:
        server.should_exit = True
        thread.join(timeout=5)
        if thread.is_alive():
            server.force_exit = True
            thread.join(timeout=5)
