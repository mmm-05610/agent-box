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
from types import SimpleNamespace

import pytest

from agent_box.server.bootstrap import build_runtime, build_runtime_from_sidecar_deployment
from agent_box.server.execution import HarnessDescriptor, HarnessRegistry, SidecarExecutionBackend
from agent_box.server.execution.sidecar import (
    LocalProcessLauncher,
    SidecarEnvelope,
    SidecarError,
    SidecarHarnessPort,
    WslSidecarLauncher,
    _WorkerChannels,
    sidecar_bundle_files,
)
from agent_box_runtime_wsl import WorkerClient
from agent_box.server.transport.http import create_app
from agent_box.server.model_configs.service import ProviderModelService
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


def test_sidecar_deployment_projects_bounded_files_and_register_metadata(tmp_path, monkeypatch):
    source = tmp_path / "adapter.mjs"
    source.write_text("export default {};\n", encoding="utf-8")
    projection = tmp_path / "settings.json"
    projection.write_text("{}\n", encoding="utf-8")
    captured = {}
    import agent_box.server.bootstrap.runtime as runtime_module
    import agent_box.server.execution.sidecar as sidecar_module
    monkeypatch.setattr(runtime_module, "_builtin_connector", lambda _instance_id: object())
    monkeypatch.setattr(
        sidecar_module, "sidecar_bundle_files",
        lambda root, additional_files=None: captured.update({"files": dict(additional_files or {})}) or {},
    )
    deployment = tmp_path / "deployment.json"
    deployment.write_text(json.dumps({
        "schemaVersion": 1, "pluginRoot": str(tmp_path),
        "harnesses": [{
            "id": "pi", "credentialKind": "api-key",
            "credentialEnvironment": "DEEPSEEK_API_KEY",
            "preferredAuthMethod": "secret-file",
            "adapter": {"command": "/usr/bin/node", "source": source.name,
                        "args": ["--safe"], "environment": {"MODE": "fixture"}},
            "projectionFiles": [{"source": projection.name, "target": "/tmp/agentbox-home/settings.json"}],
            "executableMounts": [{"source": "/usr/bin/node", "target": "/runtime/bin/node",
                                  "digest": "sha256:" + hashlib.sha256(pathlib.Path("/usr/bin/node").read_bytes()).hexdigest()}],
        }],
    }), encoding="utf-8")
    runtime = runtime_module.build_runtime_from_sidecar_deployment(tmp_path / "server", deployment)
    try:
        assert set(captured["files"]) == {
            "agentbox-sidecar/deployment/pi/adapter.mjs",
            "agentbox-sidecar/deployment/pi/projection-0-settings.json",
        }
        assert captured["files"]["agentbox-sidecar/deployment/pi/adapter.mjs"] == source.read_bytes()
        assert captured["files"]["agentbox-sidecar/deployment/pi/projection-0-settings.json"] == projection.read_bytes()
    finally:
        runtime.stop()


@pytest.mark.parametrize("field", [
    {"adapter": {"command": "/usr/bin/node", "source": "../escape.mjs"}},
    {"adapter": {"command": "/usr/bin/node", "args": ["bad\x00arg"]}},
    {"projectionFiles": [{"source": "settings.json", "target": "/runtime/home/x"}]},
    {"timeoutMs": 120_001},
    {"timeoutMs": True},
    {"timeoutMs": "30000"},
    {"stateProjection": {"target": "/tmp/agentbox-home/sub/x"}},
    {"stateProjection": {"target": "/runtime/home/state"}},
    {"adapter": {"command": "/usr/bin/node", "environment": {"API_TOKEN": "secret"}}},
])
def test_sidecar_deployment_rejects_unbounded_fields(tmp_path, field):
    deployment = tmp_path / "deployment.json"
    item = {"id": "pi", "adapter": {"command": "/usr/bin/node", "args": []}}
    item.update(field)
    deployment.write_text(json.dumps({
        "schemaVersion": 1, "pluginRoot": str(PLUGIN), "harnesses": [item],
    }), encoding="utf-8")
    with pytest.raises(RuntimeError, match="SIDECAR_DEPLOYMENT_INVALID"):
        build_runtime_from_sidecar_deployment(tmp_path / "server", deployment)


def test_sidecar_deployment_rejects_readonly_and_writable_target_collision(tmp_path):
    settings = tmp_path / "settings.json"
    settings.write_text("{}", encoding="utf-8")
    deployment = tmp_path / "deployment.json"
    deployment.write_text(json.dumps({
        "schemaVersion": 1, "pluginRoot": str(PLUGIN),
        "harnesses": [{
            "id": "pi", "adapter": {"command": "/usr/bin/node", "args": []},
            "projectionFiles": [{
                "source": settings.name, "target": "/tmp/agentbox-home/sessions",
            }],
            "stateProjection": {"target": "/tmp/agentbox-home/sessions"},
        }],
    }), encoding="utf-8")
    with pytest.raises(RuntimeError, match="SIDECAR_DEPLOYMENT_INVALID"):
        build_runtime_from_sidecar_deployment(tmp_path / "server", deployment)


def test_sidecar_checkpoint_manifest_rejects_wrong_schema_and_bounds():
    from agent_box.server.bootstrap.runtime import _restore_sidecar_state

    class Objects:
        def __init__(self, value): self.value = value
        def read(self, _digest): return self.value

    bad = [
        {"schema_version": 1, "resumable": True, "nativeSessionId": "native", "files": []},
        {"schema_version": 2, "resumable": True, "nativeSessionId": "native",
         "files": [{"path": "../escape", "digest": "sha256:" + "0" * 64, "size": 1}]},
    ]
    for manifest in bad:
        import json as _json
        with pytest.raises(RuntimeError, match="SIDECAR_CHECKPOINT_INVALID"):
            _restore_sidecar_state(Objects(_json.dumps(manifest)), {
                "checkpoint_object_digest": "checkpoint", "checkpoint_native_id": "native",
            }, enabled=True)


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


def test_real_worker_state_projection_resumes_two_fresh_sidecars(tmp_path, monkeypatch):
    """Two Core executions must resume the fixture's one native session."""
    worker = REPO / "workers" / "agent-box-worker" / "target" / "debug" / "agent-box-worker"
    if not worker.is_file() or not shutil.which("bwrap"):
        pytest.skip("current Worker and bwrap are required")

    class Connector:
        def distributions(self): return [{"name": "Ubuntu"}]
        def probe(self, distribution, user): return {"probe_id": "probe", "distribution": distribution, "user": user}
        def browse(self, probe_id, path): return {"path": path, "directories": [], "files": []}
        def open_workspace(self, probe_id, path):
            return {"connection_id": "connection-stateful", "distribution": "Ubuntu",
                    "user": os.environ["USER"], "path": str(REPO)}
        def client_for_workspace(self, **arguments):
            return WorkerClient(
                [str(worker), "--root", str(tmp_path / "worker-root"), "--workspace", str(REPO)],
                worker_digest="sha256:" + hashlib.sha256(worker.read_bytes()).hexdigest(),
                worker_version="0.1.0", connection_id=arguments["connection_id"],
                project_id=arguments["connection_id"], effective_user=os.environ["USER"],
                server_instance_id="server-stateful", executable_authorizations=(),
            )

    deployment = tmp_path / "stateful-deployment.json"
    deployment.write_text(json.dumps({
        "schemaVersion": 1, "pluginRoot": str(PLUGIN),
        "harnesses": [{"id": "pi", "timeoutMs": 30_000,
                       "stateProjection": {"target": "/tmp/agentbox-home/sessions"},
                       "adapter": {"command": "/usr/bin/node", "args": [],
                                   "source": "tests/server/fixtures/stateful_acp_peer.mjs"}}],
    }), encoding="utf-8")
    import agent_box.server.bootstrap.runtime as runtime_module
    monkeypatch.setattr(runtime_module, "_builtin_connector", lambda _id: Connector())
    original_file = runtime_module._sidecar_deployment_file
    monkeypatch.setattr(
        runtime_module, "_sidecar_deployment_file",
        lambda root, value, relative: (pathlib.Path(__file__).parent / "fixtures" / "stateful_acp_peer.mjs").read_bytes()
        if relative == "tests/server/fixtures/stateful_acp_peer.mjs"
        else original_file(root, value, relative),
    )
    runtime = build_runtime_from_sidecar_deployment(tmp_path / "server", deployment)
    try:
        with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
            headers = {"Authorization": f"Bearer {runtime.token}"}
            opened_response = client.post("/wire/v1/workspaces.open", headers=headers, json={
                "jsonrpc": "2.0", "id": "open", "method": "workspaces.open",
                "params": {"requestId": "open-stateful", "path": str(REPO),
                           "environment": {"kind": "wsl", "host": "Ubuntu", "user": os.environ["USER"]}},
            })
            assert "result" in opened_response.json(), opened_response.json()
            opened = opened_response.json()["result"]["workspace"]
            profile = client.post("/api/v1/profiles", headers={**headers, "Idempotency-Key": "profile"},
                                  json={"name": "stateful", "harness_type": "pi", "configuration": {},
                                        "credential_id": None}).json()
            first = client.post("/wire/v1/sessions.createAndSend", headers=headers, json={
                "jsonrpc": "2.0", "id": "first", "method": "sessions.createAndSend",
                "params": {"requestId": "first-stateful", "workspaceId": opened["id"],
                           "profileId": profile["profile_id"], "overrides": [],
                           "message": {"text": "remember STATEFUL-NONCE-ABC123", "attachments": []}},
            }).json()["result"]
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                session = runtime.repository.get_session(first["session"]["id"])
                if session["turns"][0]["state"] == "completed": break
                time.sleep(0.02)
            assert session["turns"][0]["state"] == "completed", {"turn": session["turns"][0], "events": session["events"]}
            checkpoint = json.loads(runtime.objects.read(session["checkpoint"]["object_digest"]))
            assert checkpoint["schema_version"] == 2 and checkpoint["resumable"] is True
            assert checkpoint["harnessType"] == "pi" and checkpoint["files"]
            native_id = checkpoint["nativeSessionId"]
            second = client.post("/wire/v1/sessions.send", headers=headers, json={
                "jsonrpc": "2.0", "id": "second", "method": "sessions.send",
                "params": {"requestId": "second-stateful", "sessionId": first["session"]["id"],
                           "overrides": [], "message": {"text": "recall", "attachments": []}},
            }).json()["result"]
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                session = runtime.repository.get_session(first["session"]["id"])
                if len(session["turns"]) == 2 and session["turns"][1]["state"] == "completed": break
                time.sleep(0.02)
            assert session["turns"][1]["state"] == "completed", {
                "error_code": session["turns"][1]["error_code"],
                "dispatch_id": session["turns"][1]["dispatch_id"],
            }
            assert session["checkpoint"]["native_id"] == native_id
            events = [e for e in session["events"] if e.get("turn_id") == second["executionId"]]
            delta = next(e for e in events if e["kind"] == "message.delta")
            terminal = next(e for e in events if e["kind"] == "turn.state" and e["data"].get("state") == "completed")
            assert delta["data"]["text"] == "STATEFUL-NONCE-ABC123" and delta["seq"] < terminal["seq"]
    finally:
        runtime.stop()
    assert not (tmp_path / "worker-root" / "views").exists()
    assert not (tmp_path / "worker-root" / "secrets").exists()


def _local_sidecar_runtime(tmp_path, *, provider_model=False):
    registry = HarnessRegistry()
    registry.register(HarnessDescriptor(
        "pi", capability_claims={"streaming": True},
        model_control_id="model" if provider_model else None,
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

    def execution_factory(records, objects, approvals, notifier, _connector, _credentials, _secrets):
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


def test_wire_queue_freezes_provider_model_version_model_and_credential_id(tmp_path):
    runtime = _local_sidecar_runtime(tmp_path, provider_model=True)
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        provider = _wire_post(client, runtime.token, "providerModels.create", {
            "requestId": "provider-freeze-create", "displayName": "DeepSeek",
            "harness": "pi", "provider": "deepseek", "credentialId": None,
            "configuration": [], "models": [{
                "modelId": "deepseek-flash", "displayName": "Flash",
                "availability": "available", "unavailableReason": None,
            }],
        })["providerModel"]
        profile = _wire_post(client, runtime.token, "profiles.create", {
            "requestId": "profile-freeze", "displayName": "Frozen", "harness": "pi",
        })["profile"]
        reference = {"providerId": provider["id"], "modelId": "deepseek-flash"}
        configured = _wire_post(client, runtime.token, "profiles.updateConfig", {
            "requestId": "profile-freeze-config", "profileId": profile["id"],
            "expectedVersion": profile["version"],
            "values": [{"controlId": "model", "value": reference}],
        })["profile"]
        opened = _wire_post(client, runtime.token, "workspaces.open", {
            "requestId": "workspace-freeze", "path": str(tmp_path),
            "environment": {"kind": "wsl", "host": "Ubuntu", "user": None},
        })["workspace"]
        first = _wire_post(client, runtime.token, "sessions.createAndSend", {
            "requestId": "send-freeze-first", "workspaceId": opened["id"],
            "profileId": configured["id"], "overrides": [],
            "message": {"text": "delay-success", "attachments": []},
        })
        queued = _wire_post(client, runtime.token, "sessions.send", {
            "requestId": "send-freeze-second", "sessionId": first["session"]["id"],
            "overrides": [], "message": {"text": "queued", "attachments": []},
        })
        assert queued["queueItemId"] and queued["executionId"] is None
        updated = _wire_post(client, runtime.token, "providerModels.update", {
            "requestId": "provider-freeze-update", "providerModelId": provider["id"],
            "expectedVersion": 1, "displayName": "Changed", "credentialId": None,
            "configuration": [], "models": [{
                "modelId": "new-model", "displayName": "New",
                "availability": "available", "unavailableReason": None,
            }],
        })["providerModel"]
        assert updated["version"] == 2
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            session = runtime.repository.get_session(first["session"]["id"])
            if len(session["turns"]) == 2 and session["turns"][1]["state"] == "completed":
                break
            time.sleep(0.02)
        assert len(session["turns"]) == 2, session
        context = runtime.repository.get_turn_context(session["turns"][1]["id"])
        execution = json.loads(runtime.objects.read(context["config_object_digest"]))["execution"]
        assert execution == {
            "providerModelId": provider["id"], "providerModelVersion": 1,
            "provider": "deepseek", "model": "deepseek-flash", "credentialId": None,
            "configuration": {},
        }


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

    def execution_factory(records, objects, approvals, notifier, _connector, _credentials, _secrets):
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


class _EnvelopeChannels:
    """In-memory sidecar envelope peer; never starts a process or opens a socket."""

    def __init__(self):
        self.requests = []
        self.lines = []
        self.closed = False
        self._condition = threading.Condition()

    def write_line(self, value):
        request = json.loads(value)
        self.requests.append(request)
        op = request.get("op")
        if op == "register":
            result = {"profile": request["profile"], "provenance": {"commit": "fake"}}
        elif op == "create":
            result = {"sessionId": "native-fake"}
        else:
            result = {}
        with self._condition:
            self.lines.append(json.dumps({"id": request["id"], "ok": True, "result": result}) + "\n")
            self._condition.notify_all()

    def iter_chunks(self):
        while True:
            with self._condition:
                while not self.lines and not self.closed:
                    self._condition.wait(timeout=1)
                if self.lines:
                    yield self.lines.pop(0)
                elif self.closed:
                    return

    def close(self):
        with self._condition:
            self.closed = True
            self._condition.notify_all()


class _CaptureLauncher:
    def __init__(self):
        self.channels = _EnvelopeChannels()

    def launch(self, _environment):
        return self.channels


def test_sidecar_create_carries_model_and_only_credential_environment_declaration():
    launcher = _CaptureLauncher()
    port = SidecarHarnessPort(
        launcher, environment={"AGENTBOX_SIDECAR_ISOLATED": "1"}, profile="pi",
        model="deepseek-flash", credential_environment="DEEPSEEK_API_KEY",
    )
    try:
        assert port.open_execution("exec-model") == "native-fake"
        register, create = launcher.channels.requests[0], launcher.channels.requests[2]
        assert register["credentialEnvironment"] == "DEEPSEEK_API_KEY"
        assert "credential" not in register
        assert create["model"] == "deepseek-flash"
        assert "DEEPSEEK_API_KEY" not in json.dumps(create)
    finally:
        port.stop()


def test_provider_model_freeze_checks_credential_kind_and_returns_immutable_projection():
    descriptor = HarnessDescriptor(
        "pi", credential_kind="api-key", model_control_id="model",
    )
    registry = HarnessRegistry()
    registry.register(descriptor)
    row = {
        "id": "provider-1", "version": 3, "archived_at": None,
        "harness_type": "pi", "provider_type": "deepseek", "credential_id": "cred-1",
        "config_object_digest": "config", "models_object_digest": "models",
    }

    class Records:
        def get(self, _id):
            assert _id == "provider-1"
            return dict(row)

    class Objects:
        def read(self, digest):
            return json.dumps({"configuration": {"endpoint": "official"}} if digest == "config"
                              else {"models": [{"modelId": "deepseek-flash", "availability": "available"}]})

    class Credentials:
        def __init__(self, accepted_kind): self.accepted_kind = accepted_kind; self.calls = []
        def get(self, credential_id, *, kind):
            self.calls.append((credential_id, kind))
            if kind != self.accepted_kind:
                raise SidecarError("CREDENTIAL_KIND_MISMATCH", "credential kind rejected")
            return {"id": credential_id}

    credentials = Credentials("api-key")
    service = ProviderModelService(Records(), Objects(), harnesses=registry,
                                   credentials=credentials, profiles=SimpleNamespace())
    frozen = service.freeze_execution_configuration("pi", {
        "model": {"providerId": "provider-1", "modelId": "deepseek-flash"},
    })
    assert frozen == {
        "providerModelId": "provider-1", "providerModelVersion": 3,
        "provider": "deepseek", "model": "deepseek-flash", "credentialId": "cred-1",
        "configuration": {"endpoint": "official"},
    }
    row["version"] = 4
    row["credential_id"] = "changed"
    assert frozen["providerModelVersion"] == 3 and frozen["credentialId"] == "cred-1"
    credentials.accepted_kind = "wrong-kind"
    with pytest.raises(SidecarError, match="CREDENTIAL_KIND_MISMATCH"):
        service.freeze_execution_configuration("pi", {
            "model": {"providerId": "provider-1", "modelId": "deepseek-flash"},
        })


class _WorkerClientFake:
    def __init__(self, *, fail_spawn=False):
        self.calls = []
        self.fail_spawn = fail_spawn
        self.closed = False

    def start(self): self.calls.append(("start", {}))
    def request(self, op, arguments=None, **identity):
        payload = {**(arguments or {}), **identity}
        self.calls.append((op, payload))
        if op == "view.commit": return {"path": "/worker/views/v/ready"}
        if op == "secret.put": return {"path": "/worker/secrets/a/frame"}
        if op == "spawn" and self.fail_spawn: raise RuntimeError("fake spawn refusal")
        return {"accepted": True}
    def subscribe_output(self, _listener): return lambda: None
    def subscribe_disconnect(self, _listener): return lambda: None
    def close_stdin(self, *_args, **_kwargs): self.calls.append(("close_stdin", {}))
    def wait_terminal(self, *_args, **_kwargs): self.calls.append(("wait_terminal", {})); return {}
    def close(self): self.closed = True


class _WorkerConnectorFake:
    def __init__(self, client): self.client = client
    def client_for_workspace(self, **_kwargs): return self.client


def _launcher_for_test(client):
    return WslSidecarLauncher(
        _WorkerConnectorFake(client),
        workspace={"distribution": "Ubuntu", "remote_user": "tester",
                   "connection_id": "connection", "remote_path": "/workspace"},
        bundle={}, credential=b"fixture-secret", timeout_ms=5000,
    )


def test_wsl_sidecar_secret_is_readonly_mounted_and_cleanup_on_close(tmp_path):
    client = _WorkerClientFake()
    launcher = _launcher_for_test(client)
    channels = launcher.launch({"AGENTBOX_SIDECAR_ISOLATED": "1"})
    spawn_call = next(payload for op, payload in client.calls if op == "spawn")
    argv = spawn_call["argv"]
    assert "--ro-bind" in argv
    assert "/worker/secrets/a/frame" in argv
    assert "fixture-secret" not in "\0".join(argv)
    channels.close()
    ops = [op for op, _payload in client.calls]
    assert ops.index("secret.put") < ops.index("spawn") < ops.index("secret.cleanup")
    assert client.closed


def test_wsl_sidecar_secret_cleanup_on_spawn_failure():
    client = _WorkerClientFake(fail_spawn=True)
    with pytest.raises(RuntimeError, match="fake spawn refusal"):
        _launcher_for_test(client).launch({})
    ops = [op for op, _payload in client.calls]
    assert "secret.cleanup" in ops
    assert "fixture-secret" not in json.dumps(client.calls)
    assert client.closed


class _StdinRetryClient:
    def __init__(self, failures):
        self.failures = list(failures)
        self.writes = []

    def write_stdin(self, attempt_id, generation, chunk, *, timeout):
        self.writes.append((attempt_id, generation, chunk, timeout))
        if self.failures:
            error = self.failures.pop(0)
            raise error


def test_worker_channels_retries_only_attempt_not_ready_without_duplicate_bytes():
    retry = SidecarError("ATTEMPT_NOT_READY", "child pipe is not installed")
    client = _StdinRetryClient([retry])
    channels = _WorkerChannels(client, "attempt-1", 1, "view-1")
    channels.write_line("hello")
    assert [item[2] for item in client.writes] == [b"hello\n", b"hello\n"]


def test_worker_channels_does_not_retry_other_stdin_errors():
    client = _StdinRetryClient([SidecarError("WORKER_DISCONNECTED", "gone")])
    channels = _WorkerChannels(client, "attempt-1", 1, "view-1")
    with pytest.raises(SidecarError, match="WORKER_DISCONNECTED"):
        channels.write_line("hello")
    assert len(client.writes) == 1


class _StateCaptureClient:
    def __init__(self, files, payloads):
        self.files = files
        self.payloads = payloads
        self.calls = []

    def request(self, op, arguments=None, **_identity):
        self.calls.append((op, arguments or {}))
        if op == "view.list":
            return {"files": self.files}
        if op == "view.get":
            path = arguments["path"]
            value = self.payloads[path]
            offset = arguments["offset"]
            chunk = value[offset:offset + arguments["maxLength"]]
            return {"data": base64.b64encode(chunk).decode(), "offset": offset,
                    "digest": "sha256:" + hashlib.sha256(value).hexdigest(),
                    "nextOffset": offset + len(chunk),
                    "eof": offset + len(chunk) == len(value)}
        return {"accepted": True}

    def close(self):
        pass

    def close_stdin(self, *_args, **_kwargs):
        pass

    def wait_terminal(self, *_args, **_kwargs):
        return {}


def test_worker_channels_captures_declared_state_only_and_excludes_marker():
    value = b"native-state"
    prefix = "agentbox-sidecar/deployment/pi/native-state"
    client = _StateCaptureClient([
        {"path": prefix + "/.agentbox-state", "size": 10},
        {"path": prefix + "/sessions/thread.jsonl", "size": len(value)},
        {"path": "other/secret", "size": 99},
    ], {prefix + "/sessions/thread.jsonl": value})
    channels = _WorkerChannels(client, "attempt", 1, "view", state_bundle_prefix=prefix)
    assert channels.capture_state() == {"sessions/thread.jsonl": value}


@pytest.mark.parametrize("files", [
    [{"path": "agentbox-sidecar/deployment/pi/native-state/x", "size": 8 * 1024 * 1024 + 1}],
    [{"path": "agentbox-sidecar/deployment/pi/native-state/a/../x", "size": 1}],
])
def test_worker_channels_rejects_state_bounds_and_path_identity(files):
    client = _StateCaptureClient(files, {files[0]["path"]: b"x"})
    channels = _WorkerChannels(
        client, "attempt", 1, "view",
        state_bundle_prefix="agentbox-sidecar/deployment/pi/native-state",
    )
    with pytest.raises((SidecarError, ValueError)):
        channels.capture_state()


def test_worker_channels_rejects_state_digest_change_and_secret_bytes():
    prefix = "agentbox-sidecar/deployment/pi/native-state"
    value = b"not-the-secret"
    client = _StateCaptureClient(
        [{"path": prefix + "/state.json", "size": len(value)}],
        {prefix + "/state.json": value},
    )
    channels = _WorkerChannels(client, "attempt", 1, "view", state_bundle_prefix=prefix,
                               forbidden_content=b"secret")
    with pytest.raises(SidecarError, match="SECRET"):
        channels.capture_state()
    assert channels._forbidden_content == b"secret"
    channels.close()
    assert channels._forbidden_content == b""


def test_worker_channels_rejects_state_digest_change():
    prefix = "agentbox-sidecar/deployment/pi/native-state"
    value = b"native-state"
    client = _StateCaptureClient(
        [{"path": prefix + "/state.json", "size": len(value)}],
        {prefix + "/state.json": value},
    )
    original = client.request
    def wrong_digest(op, arguments=None, **identity):
        result = original(op, arguments, **identity)
        if op == "view.get":
            result["digest"] = "sha256:" + "0" * 64
        return result
    client.request = wrong_digest
    channels = _WorkerChannels(client, "attempt", 1, "view", state_bundle_prefix=prefix)
    with pytest.raises(SidecarError, match="DIGEST"):
        channels.capture_state()
