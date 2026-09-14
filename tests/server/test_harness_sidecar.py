"""Work Order 41 integration gate: Server -> sidecar -> fake native Harness.

This is the seam that makes a real Harness reachable from the Server. The
native peer is a controlled fake, so this proves transport, envelope, projection
and durable-event ordering — it does NOT prove a real model works.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import pathlib
import shutil
import threading
import time

import pytest

from agent_box.server.bootstrap import build_runtime, build_runtime_from_sidecar_deployment
from agent_box.server.execution import HarnessDescriptor, HarnessRegistry, SidecarExecutionBackend
from agent_box.server.execution.sidecar import (
    LocalProcessLauncher,
    SidecarEnvelope,
    SidecarError,
    SidecarHarnessPort,
    WslSidecarLauncher,
    sidecar_bundle_files,
)
from agent_box_runtime_wsl import WorkerClient
from agent_box.server.transport.http import create_app
from fastapi.testclient import TestClient


REPO = pathlib.Path(__file__).resolve().parents[2]
PLUGIN = REPO / "plugins" / "agent-box-harnesses"
SIDEcar_ENTRY = PLUGIN / "runtime" / "worker-entry.mjs"
FAKE_PEER = PLUGIN / "tests" / "harness_remote" / "fake_acp_peer.mjs"


def sidecar_environment(tmp_path, *, isolated: bool = True):
    """A minimal child environment: no inherited credentials, empty native homes."""
    home = tmp_path / "home"
    home.mkdir(exist_ok=True)
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": str(home),
        "XDG_CONFIG_HOME": str(home / "xdg"),
        "XDG_CACHE_HOME": str(home / "xdg"),
        "XDG_DATA_HOME": str(home / "xdg"),
    }
    if isolated:
        env["AGENTBOX_SIDECAR_ISOLATED"] = "1"
    return env


def node_available() -> bool:
    return pathlib.Path("/usr/bin/node").exists() or bool(os.environ.get("PATH"))


@pytest.mark.skipif(not SIDEcar_ENTRY.is_file(), reason="sidecar entry not built")
def test_sidecar_refuses_to_start_without_isolation(tmp_path):
    launcher = LocalProcessLauncher(
        ["node", str(SIDEcar_ENTRY)], cwd=str(PLUGIN),
    )
    envelope = SidecarEnvelope(
        launcher.launch(sidecar_environment(tmp_path, isolated=False)),
        on_event=lambda _message: None,
    )
    try:
        with pytest.raises(SidecarError) as refused:
            envelope.request({"op": "profiles"})
        assert refused.value.code == "SIDECAR_ISOLATION_REQUIRED"
    finally:
        envelope.close()


@pytest.mark.skipif(not SIDEcar_ENTRY.is_file(), reason="sidecar entry not built")
def test_sidecar_reports_registered_profiles_and_provenance(tmp_path):
    launcher = LocalProcessLauncher(["node", str(SIDEcar_ENTRY)], cwd=str(PLUGIN))
    envelope = SidecarEnvelope(
        launcher.launch(sidecar_environment(tmp_path)), on_event=lambda _m: None,
    )
    try:
        result = envelope.request({"op": "profiles"})
        profiles = set(result["profiles"])
        # The four families attempted by Work Order 40 must be addressable.
        assert {"codex", "pi", "hermes", "omp"} <= profiles
        assert result["provenance"]["commit"]
    finally:
        envelope.close()


@pytest.mark.skipif(not SIDEcar_ENTRY.is_file(), reason="sidecar entry not built")
def test_harness_port_streams_pre_terminal_deltas_before_completion(tmp_path):
    """A delta must be observable while the turn is still running."""
    observed: list[tuple[str, str, dict]] = []
    lock = threading.Lock()

    def on_event(execution_id, kind, payload):
        with lock:
            observed.append((execution_id, kind, payload))

    port = SidecarHarnessPort(
        LocalProcessLauncher(["node", str(SIDEcar_ENTRY)], cwd=str(PLUGIN)),
        environment=sidecar_environment(tmp_path),
        profile="pi",
        adapter={"command": os.environ.get("NODE_BIN", "node"), "args": [str(FAKE_PEER)]},
        state_directory=str(tmp_path / "state"),
        directory=str(tmp_path),
        on_event=on_event,
    )
    try:
        native = port.open_execution("execution-1")
        assert native.startswith("fake-native-")
        result = port.prompt("execution-1", "component gate")
        assert "result" in result or result is not None

        deltas = [item for item in observed if item[1] == "message.delta"]
        assert deltas, f"no pre-terminal delta observed: {observed}"
        assert deltas[0][2]["text"] == "controlled stream"
        assert any(item[1] == "started" for item in observed)
    finally:
        port.stop()


@pytest.mark.skipif(not SIDEcar_ENTRY.is_file(), reason="sidecar entry not built")
def test_two_executions_keep_separate_native_identity(tmp_path):
    port = SidecarHarnessPort(
        LocalProcessLauncher(["node", str(SIDEcar_ENTRY)], cwd=str(PLUGIN)),
        environment=sidecar_environment(tmp_path),
        profile="pi",
        adapter={"command": "node", "args": [str(FAKE_PEER)]},
        state_directory=str(tmp_path / "state"),
        directory=str(tmp_path),
    )
    try:
        first = port.open_execution("exec-a")
        second = port.open_execution("exec-b")
        assert first != second, "two executions must not share a native session id"
        assert port.open_execution("exec-a") == first
    finally:
        port.stop()


@pytest.mark.skipif(not SIDEcar_ENTRY.is_file(), reason="sidecar entry not built")
def test_unknown_op_and_unknown_execution_are_typed_errors(tmp_path):
    launcher = LocalProcessLauncher(["node", str(SIDEcar_ENTRY)], cwd=str(PLUGIN))
    envelope = SidecarEnvelope(
        launcher.launch(sidecar_environment(tmp_path)), on_event=lambda _m: None,
    )
    try:
        with pytest.raises(SidecarError) as not_registered:
            envelope.request({"op": "prompt", "sessionId": "x", "text": "y"})
        assert not_registered.value.code == "NOT_REGISTERED"

        envelope.request({
            "op": "register", "profile": "pi",
            "launch": {"command": "node", "args": [str(FAKE_PEER)]},
            "stateDirectory": str(tmp_path / "state"), "directory": str(tmp_path),
        })
        with pytest.raises(SidecarError) as unknown:
            envelope.request({"op": "teleport"})
        assert unknown.value.code == "UNKNOWN_OP"
    finally:
        envelope.close()


def test_port_reports_unknown_execution_without_sidecar(tmp_path):
    port = SidecarHarnessPort(
        LocalProcessLauncher(["node", str(SIDEcar_ENTRY)], cwd=str(PLUGIN)),
        environment=sidecar_environment(tmp_path), profile="pi",
        state_directory=str(tmp_path / "state"), directory=str(tmp_path),
    )
    with pytest.raises(SidecarError) as unknown:
        port.prompt("never-opened", "text")
    assert unknown.value.code == "EXECUTION_UNKNOWN"
    assert port.cancel("never-opened") is False


def test_sidecar_deployment_requires_wsl_connector_without_leaking_root_lock(tmp_path, monkeypatch):
    deployment = tmp_path / "deployment.json"
    deployment.write_text(json.dumps({
        "schemaVersion": 1, "pluginRoot": str(PLUGIN),
        "harnesses": [{
            "id": "pi", "adapter": {"command": "/usr/bin/node", "args": []},
        }],
    }), encoding="utf-8")
    import agent_box.server.bootstrap.runtime as runtime_module
    monkeypatch.setattr(runtime_module, "_builtin_connector", lambda _instance_id: None)
    root = tmp_path / "server-data"
    with pytest.raises(RuntimeError, match="WSL_CONNECTOR_UNAVAILABLE"):
        build_runtime_from_sidecar_deployment(root, deployment)

    # Construction failure releases the single-writer data-root lease.
    runtime = build_runtime(root)
    runtime.stop()


def test_real_worker_bwrap_interactive_sidecar_streams_before_terminal(tmp_path):
    """Server channel → real Worker → bwrap → sidecar → fake ACP peer."""
    worker = REPO / "workers" / "agent-box-worker" / "target" / "debug" / "agent-box-worker"
    if not worker.is_file() or not shutil.which("bwrap"):
        pytest.skip("current Worker and bwrap are required")

    class RealConnector:
        def client_for_workspace(self, **arguments):
            return WorkerClient(
                [str(worker), "--root", str(tmp_path / "worker-root"),
                 "--workspace", str(REPO)],
                worker_digest="sha256:" + hashlib.sha256(worker.read_bytes()).hexdigest(),
                worker_version="0.1.0", connection_id=arguments["connection_id"],
                project_id=arguments["connection_id"], effective_user=os.environ["USER"],
                server_instance_id="server-sidecar-vertical",
                executable_authorizations=arguments["executable_authorizations"],
            )

    observed = []
    launcher = WslSidecarLauncher(
        RealConnector(),
        workspace={
            "distribution": "Ubuntu", "remote_user": os.environ["USER"],
            "connection_id": "connection-sidecar", "remote_path": str(REPO),
        },
        bundle=sidecar_bundle_files(PLUGIN), timeout_ms=30_000,
    )
    port = SidecarHarnessPort(
        launcher, environment={"AGENTBOX_SIDECAR_ISOLATED": "1"}, profile="pi",
        adapter={
            "command": "/usr/bin/node",
            "args": ["/workspace/plugins/agent-box-harnesses/tests/harness_remote/fake_acp_peer.mjs"],
        },
        state_directory="/tmp/agentbox-sidecar-state", directory="/workspace",
        on_event=lambda *event: observed.append(event),
    )
    try:
        native = port.open_execution("execution-worker")
        assert native.startswith("fake-native-")
        result = port.prompt("execution-worker", "vertical worker gate")
        assert result
        assert any(
            kind == "message.delta" and payload["text"] == "controlled stream"
            for _execution, kind, payload in observed
        ), observed
    finally:
        port.stop()
    assert not (tmp_path / "worker-root" / "views").exists()


def test_server_core_real_worker_persists_stream_before_terminal(tmp_path, monkeypatch):
    """The complete zero-model production deployment seam, including Work Core."""
    worker = REPO / "workers" / "agent-box-worker" / "target" / "debug" / "agent-box-worker"
    if not worker.is_file() or not shutil.which("bwrap"):
        pytest.skip("current Worker and bwrap are required")

    class RealConnector:
        def distributions(self):
            return [{"name": "Ubuntu"}]

        def probe(self, distribution, user):
            return {"probe_id": "probe-real", "distribution": distribution, "user": user}

        def browse(self, probe_id, path):
            return {"path": path, "directories": [], "files": []}

        def open_workspace(self, probe_id, path):
            return {
                "connection_id": "connection-server-core", "distribution": "Ubuntu",
                "user": os.environ["USER"], "path": str(REPO),
            }

        def client_for_workspace(self, **arguments):
            return WorkerClient(
                [str(worker), "--root", str(tmp_path / "server-worker-root"),
                 "--workspace", str(REPO)],
                worker_digest="sha256:" + hashlib.sha256(worker.read_bytes()).hexdigest(),
                worker_version="0.1.0", connection_id=arguments["connection_id"],
                project_id=arguments["connection_id"], effective_user=os.environ["USER"],
                server_instance_id="server-core-vertical",
                executable_authorizations=arguments["executable_authorizations"],
            )

        def read_workspace_file(self, **arguments):
            client = self.client_for_workspace(
                **arguments, executable_authorizations=(),
            )
            content = bytearray()
            expected = None
            client.start()
            try:
                while True:
                    item = client.request("workspace.get", {
                        "path": arguments["relative_path"], "offset": len(content),
                        "maxLength": 32 * 1024,
                    })
                    expected = expected or item["digest"]
                    assert item["digest"] == expected
                    content.extend(base64.b64decode(item["data"]))
                    if item["eof"]:
                        return bytes(content), expected
            finally:
                client.close()

    connector = RealConnector()
    deployment = tmp_path / "sidecar-deployment.json"
    deployment.write_text(json.dumps({
        "schemaVersion": 1,
        "pluginRoot": str(PLUGIN),
        "harnesses": [{
            "id": "pi", "capabilityClaims": {"streaming": True},
            "adapter": {
                "command": "/usr/bin/node",
                "args": [
                    "/workspace/plugins/agent-box-harnesses/tests/harness_remote/fake_acp_peer.mjs",
                ],
            },
            "timeoutMs": 30_000,
        }],
    }), encoding="utf-8")
    import agent_box.server.bootstrap.runtime as runtime_module
    monkeypatch.setattr(runtime_module, "_builtin_connector", lambda _instance_id: connector)
    runtime = build_runtime_from_sidecar_deployment(
        tmp_path / "server-data", deployment,
    )
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        headers = {"Authorization": f"Bearer {runtime.token}"}
        opened = client.post("/wire/v1/workspaces.open", headers=headers, json={
            "jsonrpc": "2.0", "id": "open", "method": "workspaces.open",
            "params": {
                "requestId": "open-real", "path": str(REPO),
                "environment": {"kind": "wsl", "host": "Ubuntu", "user": os.environ["USER"]},
            },
        }).json()["result"]["workspace"]
        profile = client.post("/api/v1/profiles", headers={
            **headers, "Idempotency-Key": "profile-real",
        }, json={
            "name": "Pi real Worker", "harness_type": "pi", "configuration": {},
            "credential_id": None,
        }).json()
        attachment_content = (REPO / "pyproject.toml").read_bytes()
        attachment_digest = hashlib.sha256(attachment_content).hexdigest()
        sent = client.post("/wire/v1/sessions.createAndSend", headers=headers, json={
            "jsonrpc": "2.0", "id": "send", "method": "sessions.createAndSend",
            "params": {
                "requestId": "send-real", "workspaceId": opened["id"],
                "profileId": profile["profile_id"], "overrides": [],
                "message": {"text": "full vertical", "attachments": [{
                    "ref": "pyproject.toml", "displayName": "reference.png",
                    "mediaKind": "image",
                }]},
            },
        }).json()["result"]
        deadline = time.monotonic() + 10
        session = None
        while time.monotonic() < deadline:
            session = runtime.repository.get_session(sent["session"]["id"])
            if session["turns"][0]["state"] == "completed":
                break
            time.sleep(0.02)
        assert session and session["turns"][0]["state"] == "completed", session
        visible = [item for item in session["events"] if item["kind"] in {
            "message.delta", "message.final", "turn.state",
        }]
        delta = next(item for item in visible if item["kind"] == "message.delta")
        terminal = [
            item for item in visible
            if item["kind"] == "turn.state" and item["data"].get("state") == "completed"
        ][0]
        assert delta["seq"] < terminal["seq"]
        assert delta["data"]["text"] == f"image:image/png:{attachment_digest}"
        assert session["turns"][0]["execution_id"], "Work Core execution identity was not stored"

        cancelled_send = client.post("/wire/v1/sessions.send", headers=headers, json={
            "jsonrpc": "2.0", "id": "cancel-send", "method": "sessions.send",
            "params": {
                "requestId": "send-real-cancel", "sessionId": sent["session"]["id"],
                "overrides": [],
                "message": {"text": "wait-for-cancel", "attachments": []},
            },
        }).json()["result"]
        cancel_execution = cancelled_send["executionId"]
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            session = runtime.repository.get_session(sent["session"]["id"])
            if any(
                item["kind"] == "message.delta" and item["turn_id"] == cancel_execution
                for item in session["events"]
            ):
                break
            time.sleep(0.02)
        stopped = client.post("/wire/v1/runs.stop", headers=headers, json={
            "jsonrpc": "2.0", "id": "stop", "method": "runs.stop",
            "params": {
                "requestId": "stop-real", "sessionId": sent["session"]["id"],
                "executionId": cancel_execution,
            },
        }).json()["result"]
        assert stopped["outcome"] == "stop_requested"
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            session = runtime.repository.get_session(sent["session"]["id"])
            cancelled_turn = next(
                item for item in session["turns"] if item["id"] == cancel_execution
            )
            if cancelled_turn["state"] == "cancelled":
                break
            time.sleep(0.02)
        assert cancelled_turn["state"] == "cancelled"
        assert cancelled_turn["stop_requested_at"]
    assert not (tmp_path / "server-worker-root" / "views").exists()


def _local_sidecar_runtime(tmp_path):
    registry = HarnessRegistry()
    registry.register(HarnessDescriptor(
        "pi", capability_claims={"streaming": True},
        control_options={"model": ("initial", "queued", "later")},
    ))

    class Connector:
        def distributions(self): return [{"name": "Ubuntu"}]
        def probe(self, distribution, user):
            return {"probe_id": "probe", "distribution": distribution, "user": user}
        def browse(self, probe_id, path):
            return {"path": path, "directories": [], "files": []}
        def open_workspace(self, probe_id, path):
            return {"connection_id": "connection", "distribution": "Ubuntu",
                    "user": os.environ["USER"], "path": str(tmp_path)}

    def execution_factory(records, objects, approvals, notifier, _connector):
        def port_factory(context, on_event):
            return SidecarHarnessPort(
                LocalProcessLauncher(["node", str(SIDEcar_ENTRY)], cwd=str(PLUGIN)),
                environment=sidecar_environment(tmp_path), profile=context["harness_type"],
                adapter={"command": "node", "args": [str(FAKE_PEER)]},
                state_directory=str(tmp_path / "state"), directory=str(tmp_path),
                on_event=on_event,
            )
        return SidecarExecutionBackend(
            records, objects, approvals, port_factory=port_factory, on_event=notifier.notify,
        )

    return build_runtime(
        tmp_path / "queue-server", harnesses=registry, connector=Connector(),
        execution_factory=execution_factory,
    )


def _wire_post(client, token, method, params):
    response = client.post(f"/wire/v1/{method}", headers={
        "Authorization": f"Bearer {token}",
    }, json={"jsonrpc": "2.0", "id": method, "method": method, "params": params})
    body = response.json()
    assert "result" in body, body
    return body["result"]


def _queue_setup(client, runtime, tmp_path, first_text):
    opened = _wire_post(client, runtime.token, "workspaces.open", {
        "requestId": "queue-open", "path": str(tmp_path),
        "environment": {"kind": "wsl", "host": "Ubuntu", "user": None},
    })["workspace"]
    profile = client.post("/api/v1/profiles", headers={
        "Authorization": f"Bearer {runtime.token}", "Idempotency-Key": "queue-profile",
    }, json={"name": "queue", "harness_type": "pi",
             "configuration": {"model": "initial"}, "credential_id": None}).json()
    first = _wire_post(client, runtime.token, "sessions.createAndSend", {
        "requestId": "queue-first", "workspaceId": opened["id"],
        "profileId": profile["profile_id"], "overrides": [],
        "message": {"text": first_text, "attachments": []},
    })
    second = _wire_post(client, runtime.token, "sessions.send", {
        "requestId": "queue-second", "sessionId": first["session"]["id"],
        "overrides": [{"controlId": "model", "value": "queued"}],
        "message": {"text": "queued successor", "attachments": []},
    })
    assert second["executionId"] is None and second["queueItemId"]
    return profile, first, second


def test_success_dispatches_queued_turn_with_frozen_effective_configuration(tmp_path):
    runtime = _local_sidecar_runtime(tmp_path)
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        profile, first, _second = _queue_setup(client, runtime, tmp_path, "delay-success")

        # Mutate the Profile after queue acceptance. The queued Turn must retain
        # the exact effective configuration accepted with the queue item.
        changed = runtime.objects.publish(json.dumps({
            "schema_version": 1, "harness_type": "pi", "configuration": {"model": "later"},
        }, sort_keys=True, separators=(",", ":")).encode())
        with runtime.database.transaction() as conn:
            conn.execute(
                "UPDATE server_profiles SET config_revision=2,config_object_digest=? WHERE id=?",
                (changed.digest, profile["profile_id"]),
            )

        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            session = runtime.repository.get_session(first["session"]["id"])
            if len(session["turns"]) == 2 and session["turns"][1]["state"] == "completed":
                break
            time.sleep(0.02)
        assert len(session["turns"]) == 2, session
        assert [turn["state"] for turn in session["turns"]] == ["completed", "completed"]
        queued_context = runtime.repository.get_turn_context(session["turns"][1]["id"])
        frozen = json.loads(runtime.objects.read(queued_context["config_object_digest"]))
        assert frozen["configuration"]["model"] == "queued"
        assert session["turns"][1]["profile_revision"] == 1
        assert runtime.queue.list(first["session"]["id"]) == []


@pytest.mark.parametrize("first_text,terminal", [
    ("wait-for-cancel", "cancelled"),
    ("delay-failure", "failed"),
])
def test_stop_or_failure_pauses_queued_turn(tmp_path, first_text, terminal):
    runtime = _local_sidecar_runtime(tmp_path)
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        _profile, first, second = _queue_setup(client, runtime, tmp_path, first_text)
        if terminal == "cancelled":
            result = _wire_post(client, runtime.token, "runs.stop", {
                "requestId": "queue-stop", "sessionId": first["session"]["id"],
                "executionId": first["executionId"],
            })
            assert result["outcome"] == "stop_requested"
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            session = runtime.repository.get_session(first["session"]["id"])
            if session["turns"][0]["state"] == terminal:
                break
            time.sleep(0.02)
        assert session["turns"][0]["state"] == terminal, session
        queued = runtime.queue.list(first["session"]["id"])
        assert len(queued) == 1
        assert queued[0]["itemId"] == second["queueItemId"]
        assert queued[0]["state"] == "paused"
        assert len(session["turns"]) == 1


def test_sidecar_permission_round_trip_uses_server_approval_store(tmp_path):
    registry = HarnessRegistry()
    registry.register(HarnessDescriptor("pi", capability_claims={
        "streaming": True, "approvals": True,
    }))

    class Connector:
        def distributions(self): return [{"name": "Ubuntu"}]
        def probe(self, distribution, user):
            return {"probe_id": "probe", "distribution": distribution, "user": user}
        def browse(self, probe_id, path):
            return {"path": path, "directories": [], "files": []}
        def open_workspace(self, probe_id, path):
            return {"connection_id": "connection", "distribution": "Ubuntu",
                    "user": os.environ["USER"], "path": str(tmp_path)}

    def execution_factory(records, objects, approvals, notifier, _connector):
        def port_factory(context, on_event):
            return SidecarHarnessPort(
                LocalProcessLauncher(["node", str(SIDEcar_ENTRY)], cwd=str(PLUGIN)),
                environment=sidecar_environment(tmp_path), profile=context["harness_type"],
                adapter={"command": "node", "args": [str(FAKE_PEER)]},
                state_directory=str(tmp_path / "state"), directory=str(tmp_path),
                on_event=on_event,
            )
        return SidecarExecutionBackend(
            records, objects, approvals, port_factory=port_factory, on_event=notifier.notify,
        )

    runtime = build_runtime(
        tmp_path / "approval-server", harnesses=registry, connector=Connector(),
        execution_factory=execution_factory,
    )
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        headers = {"Authorization": f"Bearer {runtime.token}"}
        opened = client.post("/wire/v1/workspaces.open", headers=headers, json={
            "jsonrpc": "2.0", "id": "open", "method": "workspaces.open",
            "params": {"requestId": "open-approval", "path": str(tmp_path),
                       "environment": {"kind": "wsl", "host": "Ubuntu", "user": None}},
        }).json()["result"]["workspace"]
        profile = client.post("/api/v1/profiles", headers={
            **headers, "Idempotency-Key": "profile",
        }, json={"name": "approval", "harness_type": "pi", "configuration": {},
                 "credential_id": None}).json()
        sent = client.post("/wire/v1/sessions.createAndSend", headers=headers, json={
            "jsonrpc": "2.0", "id": "send", "method": "sessions.createAndSend",
            "params": {"requestId": "send-approval", "workspaceId": opened["id"],
                       "profileId": profile["profile_id"], "overrides": [],
                       "message": {"text": "needs-permission", "attachments": []}},
        }).json()["result"]
        deadline = time.monotonic() + 5
        approval = None
        while time.monotonic() < deadline:
            rows = runtime.approvals.open_for_execution(sent["executionId"])
            if rows:
                approval = rows[0]
                break
            time.sleep(0.02)
        assert approval is not None
        decided = client.post("/wire/v1/approvals.decide", headers=headers, json={
            "jsonrpc": "2.0", "id": "decision", "method": "approvals.decide",
            "params": {"requestId": "decision", "approvalId": approval["approvalId"],
                       "expectedVersion": approval["version"], "decision": "allow",
                       "scope": {"kind": "once"}},
        }).json()["result"]
        assert decided == {"outcome": "recorded", "decision": "allow"}
        deadline = time.monotonic() + 5
        session = None
        while time.monotonic() < deadline:
            session = runtime.repository.get_session(sent["session"]["id"])
            if session["turns"][0]["state"] == "completed":
                break
            time.sleep(0.02)
        assert session and session["turns"][0]["state"] == "completed"
        assert any(
            event["kind"] == "message.delta"
            and event["data"]["text"] == "permission:grant-once"
            for event in session["events"]
        )
        assert runtime.approvals.get(approval["approvalId"])["decision"] == "allow"
