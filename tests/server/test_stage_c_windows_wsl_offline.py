from __future__ import annotations

import hashlib
import os
from pathlib import Path
import time

from fastapi.testclient import TestClient
import pytest

from agent_box.server.bootstrap import build_runtime
from agent_box.server.execution import HarnessDescriptor, HarnessRegistry
from agent_box.server.legacy_codex import CodexExecutionBackend
from agent_box.server.transport.http import create_app
from agent_box.storage import MemorySecretStore
from agent_box_harnesses.codex.remote import validate_remote_configuration
from agent_box_runtime_wsl import WslConnector, WslExecutionTransport


def codex_registry():
    registry = HarnessRegistry()
    registry.register(HarnessDescriptor(
        "codex", credential_kind="codex-login",
        configuration_validator=validate_remote_configuration,
    ))
    return registry


pytestmark = pytest.mark.skipif(
    os.name != "nt" or not os.environ.get("AGENT_BOX_TEST_WSL_MANIFEST"),
    reason="explicit Windows/WSL offline platform gate",
)


def _digest(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def _post(client, headers, path, body, key):
    return client.post(path, headers={**headers, "Idempotency-Key": key}, json=body)


def _wait(client, headers, session_id, count):
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        value = client.get(f"/api/v1/sessions/{session_id}", headers=headers).json()
        if len(value["turns"]) == count and value["turns"][-1]["state"] == "completed":
            return value
        if value["turns"] and value["turns"][-1]["state"] in {"failed", "cancelled", "unknown"}:
            raise AssertionError(value)
        time.sleep(0.05)
    raise AssertionError(value)


def _runtime(root, instance, secrets):
    connector = WslConnector(
        manifest_path=os.environ["AGENT_BOX_TEST_WSL_MANIFEST"],
        linux_worker_path=os.environ["AGENT_BOX_TEST_WORKER"],
        server_instance_id=instance,
    )
    executable = Path(os.environ["AGENT_BOX_TEST_CODEX_WINDOWS_PATH"])
    transport = WslExecutionTransport(
        connector, codex_linux_path=os.environ["AGENT_BOX_TEST_CODEX_LINUX_PATH"],
        codex_digest=_digest(executable),
    )
    runtime = build_runtime(
        root, harnesses=codex_registry(),
        connector=connector, secret_store=secrets,
    )
    backend = CodexExecutionBackend(
        runtime.repository, runtime.objects, runtime.secret_store, transport,
        on_event=runtime.notifier.notify,
    )
    runtime.execution = backend
    runtime.service.execution = backend
    runtime.service.sessions.execution = backend
    return runtime


def test_windows_http_wsl_bwrap_two_turns_and_restart(tmp_path):
    root = tmp_path / "server"
    secrets = MemorySecretStore({"fixture": b'{"offline":"fixture"}'})
    first = _runtime(root, "server_11111111111111111111111111111111", secrets)
    with TestClient(create_app(first), base_url="http://127.0.0.1") as client:
        headers = {"Authorization": f"Bearer {first.token}"}
        first.repository.register_credential("credential-offline", "codex-login", "fixture")
        probe_response = _post(client, headers, "/api/v1/connections/probe", {
            "kind": "wsl", "distribution": os.environ.get("AGENT_BOX_TEST_WSL_DISTRIBUTION", "Ubuntu"),
        }, "probe")
        assert probe_response.status_code == 201, probe_response.json()
        probe = probe_response.json()
        workspace_response = _post(client, headers, "/api/v1/workspaces", {
            "probe_id": probe["probe_id"], "path": os.environ["AGENT_BOX_TEST_WSL_WORKSPACE"],
        }, "workspace")
        assert workspace_response.status_code == 201, workspace_response.json()
        workspace = workspace_response.json()
        profile = _post(client, headers, "/api/v1/profiles", {
            "name": "offline", "harness_type": "codex",
            "configuration": {"model": "offline-fixture", "reasoning_effort": "low"},
            "credential_id": "credential-offline",
        }, "profile").json()
        session = _post(client, headers, "/api/v1/sessions", {
            "workspace_id": workspace["workspace_id"], "profile_id": profile["profile_id"],
        }, "session").json()
        first_turn = _post(client, headers, f"/api/v1/sessions/{session['session_id']}/turns", {
            "text": "remember OFFLINE-FIXTURE-123", "expected_profile_revision": 1,
        }, "turn-one")
        assert first_turn.status_code == 202
        one = _wait(client, headers, session["session_id"], 1)
        native_id = one["checkpoint"]["native_id"]
        second_turn = _post(client, headers, f"/api/v1/sessions/{session['session_id']}/turns", {
            "text": "recall without value", "expected_profile_revision": 1,
        }, "turn-two")
        assert second_turn.status_code == 202
        two = _wait(client, headers, session["session_id"], 2)
        assert two["checkpoint"]["native_id"] == native_id
        assert any(
            event["kind"] == "message.delta" and event["data"]["text"] == "OFFLINE-FIXTURE-123"
            for event in two["events"] if event["turn_id"] == second_turn.json()["turn_id"]
        )
        token = first.token

    second = _runtime(root, "server_22222222222222222222222222222222", secrets)
    with TestClient(create_app(second), base_url="http://127.0.0.1") as client:
        headers = {"Authorization": f"Bearer {token}"}
        third_turn = _post(client, headers, f"/api/v1/sessions/{session['session_id']}/turns", {
            "text": "recall after restart", "expected_profile_revision": 1,
        }, "turn-three")
        assert third_turn.status_code == 202
        three = _wait(client, headers, session["session_id"], 3)
        assert three["checkpoint"]["native_id"] == native_id
        assert any(
            event["kind"] == "message.delta" and event["data"]["text"] == "OFFLINE-FIXTURE-123"
            for event in three["events"] if event["turn_id"] == third_turn.json()["turn_id"]
        )
