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
from agent_box.work_core.events import EventType
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


def _fixture_capability_material(context):
    """Neutral capability material for test-local port factories (bootstrap parity).

    Production port_factory always injects a binding and declaration candidates
    before `_start_run`'s capability gate runs; the fixture launchers carry no
    mount faces, so an empty-faced neutral document satisfies the (empty) demand
    set. Tests that need the gate to refuse pass material explicitly instead.

    (Placed before the first skipif-decorated test, not between a decorator and
    its test: the source branch inserted it below `@pytest.mark.skipif`,
    silently detaching that skip guard from its test - fixed in this replay.)
    """
    from agent_box.extensions import capability as capability_api

    binding = f"fixture|{context.get('harness_type', '')}|{context.get('remote_path', '')}"
    document = capability_api.SandboxDeclarationDocument(
        provider="fixture", revision=1, environment_binding=binding,
        declarations=(), digest="0" * 64,
    )
    return {
        "capability_documents": (document,),
        "capability_grants": (),
        "capability_authorized_providers": ("fixture",),
        "capability_binding": binding,
    }


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


def test_a_missing_wsl_connector_is_refused_by_placement_not_by_construction(tmp_path, monkeypatch):
    """A placement decides whether a connector is needed, so the deployment
    builds either way; what must never happen is a wsl workspace quietly
    running somewhere else, or a failure that strands the data root."""
    from agent_box.server.execution.placement import PlacementUnsupported, resolve_placement

    deployment = tmp_path / "deployment.json"
    deployment.write_text(json.dumps({
        "schemaVersion": 1,
        "harnesses": [{
            "id": "pi", "adapter": {"command": "/usr/bin/node", "args": []},
        }],
    }), encoding="utf-8")
    import agent_box.server.bootstrap.runtime as runtime_module
    monkeypatch.setattr(runtime_module, "_builtin_connector", lambda _instance_id: None)
    root = tmp_path / "server-data"
    runtime = build_runtime_from_sidecar_deployment(root, deployment, plugin_root=PLUGIN)
    runtime.stop()

    # The typed refusal is the placement's, with the code the launcher used.
    with pytest.raises(PlacementUnsupported) as refused:
        resolve_placement("wsl", has_connector=False)
    assert refused.value.code == "WSL_CONNECTOR_UNAVAILABLE"
    # A local workspace needs no connector at all.
    assert resolve_placement("local", has_connector=False).channel == "local-process"

    # And the single-writer data-root lease is free after either outcome.
    reopened = build_runtime(root)
    reopened.stop()


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
        "schemaVersion": 1,
        "harnesses": [{
            "id": "pi", "credentialKind": "api-key",
            "credentialEnvironment": "DEEPSEEK_API_KEY",
            "preferredAuthMethod": "secret-file",
            "adapter": {"command": "/usr/bin/node", "source": source.name,
                        "args": ["--safe"], "environment": {"MODE": "fixture"}},
            "projectionFiles": [{"source": projection.name, "target": "/runtime/home/settings.json"}],
            "executableMounts": [{"token": "node", "target": "/runtime/bin/node",
                                  "digest": "sha256:" + hashlib.sha256(pathlib.Path("/usr/bin/node").read_bytes()).hexdigest()}],
        }],
    }), encoding="utf-8")
    runtime = runtime_module.build_runtime_from_sidecar_deployment(
        tmp_path / "server", deployment, plugin_root=tmp_path,
        mount_bindings={"node": "/usr/bin/node"},
    )
    try:
        assert set(captured["files"]) == {
            "agentbox-sidecar/deployment/pi/adapter.mjs",
            "agentbox-sidecar/deployment/pi/projection-0-settings.json",
        }
        assert captured["files"]["agentbox-sidecar/deployment/pi/adapter.mjs"] == source.read_bytes()
        assert captured["files"]["agentbox-sidecar/deployment/pi/projection-0-settings.json"] == projection.read_bytes()
    finally:
        runtime.stop()


ARTIFACT_DECLARED_DIGEST = "sha256:" + "a" * 64
ARTIFACT_TARGET = "/runtime/artifacts/fixture-dep"


def _artifact_mount(**changes):
    item = {"token": "fixture-dep",
            "target": "/runtime/artifacts/fixture-dep",
            "treeDigest": ARTIFACT_DECLARED_DIGEST}
    item.update(changes)
    return {"runtimeArtifactMounts": [item]}


@pytest.mark.parametrize("field", [
    {"adapter": {"command": "/usr/bin/node", "source": "../escape.mjs"}},
    {"adapter": {"command": "/usr/bin/node", "args": ["bad\x00arg"]}},
    {"projectionFiles": [{"source": "settings.json", "target": "/runtime/elsewhere/x"}]},
    {"projectionFiles": [{"source": "settings.json", "target": "/tmp/agentbox-home/settings.json"}]},
    {"timeoutMs": 120_001},
    {"timeoutMs": True},
    {"timeoutMs": "30000"},
    # The isolated home root is the template; these stay invalid because they
    # escape it, not because the root moved.
    {"stateProjection": {"target": "/tmp/agentbox-home/sub/x"}},
    {"stateProjection": {"target": "/runtime/home/sub//x"}},
    {"stateProjection": {"target": "/runtime/home/../escape"}},
    {"adapter": {"command": "/usr/bin/node", "environment": {"API_TOKEN": "secret"}}},
    # A runtime artifact declaration is validated on its shape only; the digest
    # and every overlap rule are settled by the Worker that can see the tree.
    {"runtimeArtifactMounts": {"token": "a"}},
    _artifact_mount(extra="unexpected"),
    _artifact_mount(source="relative/artifacts/a"),
    _artifact_mount(source="/opt/../artifacts/a"),
    _artifact_mount(source="/opt//artifacts/a"),
    _artifact_mount(source="/opt/artifacts/a/"),
    _artifact_mount(source="/opt\\artifacts\\a"),
    _artifact_mount(source="/opt/artifacts/a\x00"),
    _artifact_mount(source="/opt/artifacts/a\x1b"),
    _artifact_mount(source="C:/Users/tester/artifacts/a"),
    _artifact_mount(source=""),
    _artifact_mount(target="/runtime/artifacts"),
    _artifact_mount(target="/runtime/artifacts/"),
    _artifact_mount(target="/runtime/artifacts/../fixture-dep"),
    _artifact_mount(target="/runtime/artifacts/sub/fixture-dep"),
    _artifact_mount(target="/runtime/artifacts/.hidden"),
    _artifact_mount(target="/runtime/bin/fixture-dep"),
    _artifact_mount(target="/runtime/view/fixture-dep"),
    _artifact_mount(target="/runtime/secret/fixture-dep"),
    _artifact_mount(target="/tmp/agentbox-home/fixture-dep"),
    _artifact_mount(target="/runtime/home/fixture-dep"),
    _artifact_mount(target="/tmp/agentbox-sidecar-state"),
    _artifact_mount(target="/workspace"),
    _artifact_mount(target="/home/tester/.local/lib/python3.12/site-packages"),
    _artifact_mount(treeDigest="sha256:short"),
    _artifact_mount(treeDigest="md5:" + "a" * 32),
    _artifact_mount(treeDigest=ARTIFACT_DECLARED_DIGEST.upper()),
    {"runtimeArtifactMounts": [
        {"token": "a", "target": "/runtime/artifacts/a", "treeDigest": ARTIFACT_DECLARED_DIGEST},
        {"token": "a", "target": "/runtime/artifacts/b", "treeDigest": ARTIFACT_DECLARED_DIGEST},
    ]},
    {"runtimeArtifactMounts": [
        {"token": "a", "target": "/runtime/artifacts/a", "treeDigest": ARTIFACT_DECLARED_DIGEST},
        {"token": "b", "target": "/runtime/artifacts/a", "treeDigest": ARTIFACT_DECLARED_DIGEST},
    ]},
    {"runtimeArtifactMounts": [
        {"token": f"a{index}", "target": f"/runtime/artifacts/a{index}",
         "treeDigest": ARTIFACT_DECLARED_DIGEST}
        for index in range(9)
    ]},
])
def test_sidecar_deployment_rejects_unbounded_fields(tmp_path, field):
    deployment = tmp_path / "deployment.json"
    item = {"id": "pi", "adapter": {"command": "/usr/bin/node", "args": []}}
    item.update(field)
    deployment.write_text(json.dumps({
        "schemaVersion": 1, "harnesses": [item],
    }), encoding="utf-8")
    # Every one of these must be refused with a typed code. A declaration that
    # still names a host path is refused as such (`SIDECAR_DEPLOYMENT_HOST_PATH`)
    # and an unbound mount token as `SIDECAR_ARTIFACT_BINDING_*`: the document may
    # not carry a path and may not name a tree nobody bound.
    with pytest.raises(RuntimeError) as refused:
        build_runtime_from_sidecar_deployment(tmp_path / "server", deployment, plugin_root=PLUGIN)
    assert str(refused.value).startswith((
        "SIDECAR_DEPLOYMENT_INVALID", "SIDECAR_DEPLOYMENT_HOST_PATH", "SIDECAR_ARTIFACT_BINDING_",
    )), str(refused.value)


def test_sidecar_deployment_carries_digest_pinned_artifact_declarations(tmp_path, monkeypatch):
    """The Server validates shape and passes the declaration through unchanged."""
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
        "schemaVersion": 1,
        "harnesses": [{
            "id": "pi", "adapter": {"command": "/usr/bin/node", "args": []},
            "runtimeArtifactMounts": [
                {"token": "pi-node-modules", "target": "/runtime/artifacts/pi-node-modules",
                 "treeDigest": ARTIFACT_DECLARED_DIGEST},
                {"token": "pi-native", "target": "/runtime/artifacts/pi-native",
                 "treeDigest": "sha256:" + "b" * 64},
            ],
        }],
    }), encoding="utf-8")
    runtime = runtime_module.build_runtime_from_sidecar_deployment(
        tmp_path / "server", deployment, plugin_root=PLUGIN,
        mount_bindings={"pi-node-modules": "/opt/agentbox/artifacts/pi-node-modules",
                        "pi-native": "/opt/agentbox/artifacts/pi-native"},
    )
    runtime.stop()
    # The declaration is not a bundle file: an artifact is a host directory the
    # Worker verifies in place, never a copy uploaded into the reviewed view.
    assert captured["files"] == {}


def test_sidecar_deployment_refuses_a_session_without_a_declared_credential(tmp_path, monkeypatch):
    """A Harness that declares a credential kind must be given one.

    The declaration is data (`credentialKind`), so the refusal is neutral: the
    Server asks for an authorized credential because the deployment said the
    Harness needs one, and no Worker, sandbox or adapter is contacted before it
    answers.
    """
    deployment = tmp_path / "deployment.json"
    deployment.write_text(json.dumps({
        "schemaVersion": 1,
        "harnesses": [{
            "id": "pi", "credentialKind": "api-key",
            "credentialEnvironment": "DEEPSEEK_API_KEY",
            "adapter": {"command": "/usr/bin/node", "args": []},
        }],
    }), encoding="utf-8")

    class StubConnector:
        def distributions(self): return [{"name": "Ubuntu"}]
        def probe(self, distribution, user):
            return {"probe_id": "probe", "distribution": distribution, "user": user}
        def browse(self, probe_id, path):
            return {"path": path, "directories": [], "files": []}
        def open_workspace(self, probe_id, path):
            return {"connection_id": "connection", "distribution": "Ubuntu",
                    "user": os.environ["USER"], "path": str(tmp_path)}

    import agent_box.server.bootstrap.runtime as runtime_module
    monkeypatch.setattr(runtime_module, "_builtin_connector", lambda _id: StubConnector())
    runtime = runtime_module.build_runtime_from_sidecar_deployment(tmp_path / "server", deployment, plugin_root=PLUGIN)
    try:
        with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
            headers = {"Authorization": f"Bearer {runtime.token}"}
            opened = _wire_post(client, runtime.token, "workspaces.open", {
                "requestId": "open-credential", "path": str(tmp_path),
                "environment": {"kind": "wsl", "host": "Ubuntu", "user": os.environ["USER"]},
            })["workspace"]
            profile = client.post("/api/v1/profiles", headers={
                **headers, "Idempotency-Key": "credential-profile",
            }, json={"name": "no credential", "harness_type": "pi", "configuration": {},
                     "credential_id": None}).json()
            refused = client.post("/wire/v1/sessions.createAndSend", headers=headers, json={
                "jsonrpc": "2.0", "id": "credential-send", "method": "sessions.createAndSend",
                "params": {"requestId": "credential-send", "workspaceId": opened["id"],
                           "profileId": profile["profile_id"], "overrides": [],
                           "message": {"text": "no credential", "attachments": []}},
            }).json()
            assert "error" in refused, refused
            assert refused["error"]["code"] == "UNAVAILABLE", refused
            assert refused["error"]["details"]["internalCode"] == "CREDENTIAL_REQUIRED"
            # Nothing was dispatched, so no Session exists to fail later.
            with runtime.database.read() as conn:
                sessions = conn.execute("SELECT COUNT(*) FROM server_sessions").fetchone()[0]
            assert sessions == 0
    finally:
        runtime.stop()


def test_sidecar_deployment_rejects_readonly_and_writable_target_collision(tmp_path):
    settings = tmp_path / "settings.json"
    settings.write_text("{}", encoding="utf-8")
    deployment = tmp_path / "deployment.json"
    deployment.write_text(json.dumps({
        "schemaVersion": 1,
        "harnesses": [{
            "id": "pi", "adapter": {"command": "/usr/bin/node", "args": []},
            "projectionFiles": [{
                "source": settings.name, "target": "/runtime/home/sessions",
            }],
            "stateProjection": {"target": "/runtime/home/sessions"},
        }],
    }), encoding="utf-8")
    with pytest.raises(RuntimeError, match="SIDECAR_DEPLOYMENT_INVALID"):
        build_runtime_from_sidecar_deployment(tmp_path / "server", deployment, plugin_root=PLUGIN)


def test_real_worker_bwrap_interactive_sidecar_streams_before_terminal(tmp_path):
    """Server channel → real Worker → bwrap → sidecar → fake ACP peer."""
    worker = REPO / "workers" / "agent-box-worker" / "target" / "debug" / "agent-box-worker"
    if not worker.is_file() or not shutil.which("bwrap"):
        pytest.skip("current Worker and bwrap are required")

    class RealConnector:
        def client_for_workspace(self, **arguments):
            return WorkerClient(
                [str(worker), "--root", str(tmp_path / "worker-root"),
                 "--home-root", str(tmp_path / "profile-home"),
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
        sandbox_port=_bwrap_test_port(),
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
    _await_worker_projection_cleanup(tmp_path / "worker-root")


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
                 "--home-root", str(tmp_path / "profile-home"),
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
        "harnesses": [{
            "id": "pi", "capabilityClaims": {"stream": True, "attach": True},
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
        tmp_path / "server-data", deployment, plugin_root=PLUGIN,
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


STATEFUL_FIXTURE_RELATIVE = "tests/server/fixtures/stateful_acp_peer.mjs"


class _StatefulWslConnector:
    """WSL connector bound to the current Worker build and this checkout."""

    def __init__(self, tmp_path, worker):
        self.tmp_path = tmp_path
        self.worker = worker

    def distributions(self): return [{"name": "Ubuntu"}]

    def probe(self, distribution, user):
        return {"probe_id": "probe", "distribution": distribution, "user": user}

    def browse(self, probe_id, path):
        return {"path": path, "directories": [], "files": []}

    def open_workspace(self, probe_id, path):
        return {"connection_id": "connection-stateful", "distribution": "Ubuntu",
                "user": os.environ["USER"], "path": str(REPO)}

    def client_for_workspace(self, **arguments):
        return WorkerClient(
            [str(self.worker), "--root", str(self.tmp_path / "worker-root"),
             "--home-root", str(self.tmp_path / "profile-home"),
             "--workspace", str(REPO)],
            worker_digest="sha256:" + hashlib.sha256(self.worker.read_bytes()).hexdigest(),
            worker_version="0.1.0", connection_id=arguments["connection_id"],
            project_id=arguments["connection_id"], effective_user=os.environ["USER"],
            server_instance_id="server-stateful", executable_authorizations=(),
        )


def _stateful_real_worker_runtime(tmp_path, monkeypatch, *, harness_id):
    """A Server whose one Harness declares a bounded writable native-state subtree."""
    worker = REPO / "workers" / "agent-box-worker" / "target" / "debug" / "agent-box-worker"
    if not worker.is_file() or not shutil.which("bwrap"):
        pytest.skip("current Worker and bwrap are required")

    deployment = tmp_path / f"stateful-{harness_id}-deployment.json"
    deployment.write_text(json.dumps({
        "schemaVersion": 1,
        "harnesses": [{"id": harness_id, "timeoutMs": 30_000,
                       # The stateful peer advertises sessionCapabilities.resume, and the
                       # unified capability contract requires the static ceiling too.
                       "capabilityClaims": {"native_continuation": True},
                       "stateProjection": {"target": "/runtime/home/sessions"},
                       "adapter": {"command": "/usr/bin/node", "args": [],
                                   "source": STATEFUL_FIXTURE_RELATIVE}}],
    }), encoding="utf-8")
    import agent_box.server.bootstrap.runtime as runtime_module
    monkeypatch.setattr(
        runtime_module, "_builtin_connector",
        lambda _id: _StatefulWslConnector(tmp_path, worker),
    )
    original_file = runtime_module._sidecar_deployment_file
    fixture = pathlib.Path(__file__).parent / "fixtures" / "stateful_acp_peer.mjs"
    monkeypatch.setattr(
        runtime_module, "_sidecar_deployment_file",
        lambda root, relative: fixture.read_bytes()
        if relative == STATEFUL_FIXTURE_RELATIVE
        else original_file(root, relative),
    )
    return build_runtime_from_sidecar_deployment(tmp_path / "server", deployment, plugin_root=PLUGIN)


def _checkpoint_manifest(runtime, session):
    return json.loads(runtime.objects.read(session["checkpoint"]["object_digest"]))


def _reopen_method(runtime, session, *, home_root, window="sessions"):
    """The ACP operation the adapter last used to open the stored native Session.

    The fixture appends every open it serves into its own home directory, and
    the home is the single source of truth: the manifest supplies the locator
    and the digest, and the file itself is read from the machine that owns it.
    """
    manifest = _checkpoint_manifest(runtime, session)
    entry = next(
        item for item in manifest["files"] if item["path"] == "reopen-method.txt"
    )
    # The window is role-relative under the machine's home root; the locator
    # names the role directory. Reading the bytes here is the test verifying
    # the home directly - the Server itself never carries them.
    role = manifest["homeLocator"].split("/", 1)[0]
    home_file = home_root / role / window / entry["path"]
    lines = [line for line in home_file.read_text().splitlines() if line]
    assert lines, "the home did not record the ACP reopen method"
    return lines[-1]


def _wait_for_turn(runtime, session_id, index, state, *, timeout=15):
    deadline = time.monotonic() + timeout
    while True:
        session = runtime.repository.get_session(session_id)
        if len(session["turns"]) > index and session["turns"][index]["state"] == state:
            return session
        assert time.monotonic() < deadline, {
            "turns": session["turns"], "events": session["events"],
        }
        time.sleep(0.02)


def _await_worker_projection_cleanup(root, *, timeout=15):
    """Wait, bounded, for the Worker to retire its per-execution projections.

    A turn becomes durably terminal before the Worker releases its view, so the
    two are not simultaneous; the assertion is that nothing is left once the run
    has settled, not that the release happened before the turn did.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not (root / "views").exists() and not (root / "secrets").exists():
            return
        time.sleep(0.05)
    assert not (root / "views").exists()
    assert not (root / "secrets").exists()


def test_real_worker_state_projection_resumes_two_fresh_sidecars(tmp_path, monkeypatch):
    """Two Core executions must resume the fixture's one native session."""
    runtime = _stateful_real_worker_runtime(tmp_path, monkeypatch, harness_id="pi")
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
            assert checkpoint["schema_version"] == 3 and checkpoint["resumable"] is True
            # The record references the home; it carries no state bytes itself.
            assert checkpoint["nativePlatform"] == "wsl"
            assert checkpoint["homeLocator"]
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
            # PI declares an authoritative journal, so the bridge reopens the stored
            # Session through the replaying `session/load` rather than `session/resume`.
            # The method the adapter really sent is read from the captured native state.
            assert _reopen_method(runtime, session, home_root=tmp_path / "profile-home") == "session/load"
            events = [e for e in session["events"] if e.get("turn_id") == second["executionId"]]
            delta = next(e for e in events if e["kind"] == "message.delta")
            terminal = next(e for e in events if e["kind"] == "turn.state" and e["data"].get("state") == "completed")
            assert delta["data"]["text"] == "STATEFUL-NONCE-ABC123" and delta["seq"] < terminal["seq"]
    finally:
        runtime.stop()
    _await_worker_projection_cleanup(tmp_path / "worker-root")


def test_real_worker_state_projection_reopens_through_acp_resume(tmp_path, monkeypatch):
    """A Harness without an authoritative journal must reopen through `session/resume`."""
    runtime = _stateful_real_worker_runtime(tmp_path, monkeypatch, harness_id="hermes")
    try:
        with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
            headers = {"Authorization": f"Bearer {runtime.token}"}
            opened = _wire_post(client, runtime.token, "workspaces.open", {
                "requestId": "open-resume", "path": str(REPO),
                "environment": {"kind": "wsl", "host": "Ubuntu", "user": os.environ["USER"]},
            })["workspace"]
            profile = client.post("/api/v1/profiles", headers={
                **headers, "Idempotency-Key": "resume-profile",
            }, json={"name": "resume", "harness_type": "hermes", "configuration": {},
                     "credential_id": None}).json()
            first = _wire_post(client, runtime.token, "sessions.createAndSend", {
                "requestId": "resume-first", "workspaceId": opened["id"],
                "profileId": profile["profile_id"], "overrides": [],
                "message": {"text": "remember STATEFUL-NONCE-RESUME-1", "attachments": []},
            })
            session = _wait_for_turn(runtime, first["session"]["id"], 0, "completed")
            assert _reopen_method(runtime, session, home_root=tmp_path / "profile-home") == "session/new"
            native_id = session["checkpoint"]["native_id"]
            _wire_post(client, runtime.token, "sessions.send", {
                "requestId": "resume-second", "sessionId": first["session"]["id"],
                "overrides": [], "message": {"text": "recall", "attachments": []},
            })
            session = _wait_for_turn(runtime, first["session"]["id"], 1, "completed")
            assert session["checkpoint"]["native_id"] == native_id
            assert _reopen_method(runtime, session, home_root=tmp_path / "profile-home") == "session/resume"
    finally:
        runtime.stop()
    _await_worker_projection_cleanup(tmp_path / "worker-root")


@pytest.mark.parametrize("poison", [
    "schema_version", "resumable", "native_id", "checkpoint_object", "state_object",
])
def _local_sidecar_runtime(tmp_path, *, provider_model=False):
    registry = HarnessRegistry()
    registry.register(HarnessDescriptor(
        "pi", capability_claims={"stream": True},
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
                **_fixture_capability_material(context),
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


def test_public_post_open_error_with_the_same_code_keeps_ambiguous_semantics(tmp_path):
    """D-R3-001: 同名码的 post-open 错误在公开路径上必须保持 ambiguous。

    能力门先通过（端口带齐中立材料），open_execution 抛出普通 SidecarError，
    code 与能力门拒绝相同（模拟 sidecar 响应错误）：公开 wire→accept→dispatch
    之后，Core 账本必须记录 ExecutionDispatchAmbiguous（而非 Failed），turn 的
    error_code 不得被误导为 CAPABILITY_REQUIREMENT_UNSATISFIED，且 open_execution
    确已到达（与本测试的对照——门拒绝测试——形成 pre/post 两条路径对照）。
    """
    registry = HarnessRegistry()
    registry.register(HarnessDescriptor("pi", capability_claims={"stream": True}))

    class Connector:
        def distributions(self): return [{"name": "Ubuntu"}]
        def probe(self, distribution, user):
            return {"probe_id": "probe", "distribution": distribution, "user": user}
        def browse(self, probe_id, path):
            return {"path": path, "directories": [], "files": []}
        def open_workspace(self, probe_id, path):
            return {"connection_id": "connection", "distribution": "Ubuntu",
                    "user": os.environ["USER"], "path": str(tmp_path)}

    class ImpostorPort(SidecarHarnessPort):
        def open_execution(self, execution_id):
            raise SidecarError(
                "CAPABILITY_REQUIREMENT_UNSATISFIED",
                "post-open impostor with reused code",
            )

    def execution_factory(records, objects, approvals, notifier, _connector, _credentials, _secrets):
        def port_factory(context, on_event):
            return ImpostorPort(
                LocalProcessLauncher(["node", str(SIDEcar_ENTRY)], cwd=str(PLUGIN)),
                environment=sidecar_environment(tmp_path), profile=context["harness_type"],
                adapter={"command": "node", "args": [str(FAKE_PEER)]},
                state_directory=str(tmp_path / "state"), directory=str(tmp_path),
                on_event=on_event,
                **_fixture_capability_material(context),
            )
        return SidecarExecutionBackend(
            records, objects, approvals, port_factory=port_factory, on_event=notifier.notify,
        )

    runtime = build_runtime(
        tmp_path / "server", harnesses=registry,
        execution_factory=execution_factory, connector=Connector(),
    )
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        opened = _wire_post(client, runtime.token, "workspaces.open", {
            "requestId": "impostor-open", "path": str(tmp_path),
            "environment": {"kind": "wsl", "host": "Ubuntu", "user": None},
        })["workspace"]
        profile = client.post("/api/v1/profiles", headers={
            "Authorization": f"Bearer {runtime.token}", "Idempotency-Key": "impostor-profile",
        }, json={"name": "impostor", "harness_type": "pi",
                 "configuration": {"model": "initial"}, "credential_id": None}).json()
        accepted = _wire_post(client, runtime.token, "sessions.createAndSend", {
            "requestId": "impostor-first", "workspaceId": opened["id"],
            "profileId": profile["profile_id"], "overrides": [],
            "message": {"text": "impostor", "attachments": []},
        })
        session_id = accepted["session"]["id"]
        deadline = time.monotonic() + 8
        session = runtime.repository.get_session(session_id)
        while time.monotonic() < deadline and session["turns"][0]["state"] == "running":
            time.sleep(0.02)
            session = runtime.repository.get_session(session_id)
        assert session["turns"][0]["state"] == "failed", session
        # 同名码未被还原：post-open 路径的归一化保持基线语义。
        assert session["turns"][0]["error_code"] == "EXECUTION_FAILED", session
        with runtime.database.read() as conn:
            ledger = [
                (row["type"], json.loads(row["data_json"]))
                for row in conn.execute(
                    "SELECT type,data_json FROM core_events WHERE type IN (?,?) "
                    "ORDER BY occurred_at,id",
                    (EventType.EXECUTION_DISPATCH_AMBIGUOUS.value,
                     EventType.EXECUTION_DISPATCH_FAILED.value),
                )
            ]
        ambiguous = [data for kind, data in ledger if kind == "ExecutionDispatchAmbiguous"]
        failed = [kind for kind, _data in ledger if kind == "ExecutionDispatchFailed"]
        assert failed == [], ledger
        assert len(ambiguous) == 1 and "impostor" in ambiguous[0]["error"], ledger


def test_public_dispatch_records_capability_refusal_as_a_failed_start(tmp_path):
    """D-002: 公开 wire→accept→dispatch 路径上的能力门拒绝证据。

    专用端口工厂**不注入**能力材料（装配边界未注入的情形），门必须在任何原生接触
    前拒绝：Work Core 记 failed（非 ambiguous），fail_turn 保留
    CAPABILITY_REQUIREMENT_UNSATISFIED；端口一旦被 open_execution 到达即抛
    AssertionError（其归一化错误码不可能是本原因码），断言因此同时证明零启动。
    """
    registry = HarnessRegistry()
    registry.register(HarnessDescriptor("pi", capability_claims={"stream": True}))

    class Connector:
        def distributions(self): return [{"name": "Ubuntu"}]
        def probe(self, distribution, user):
            return {"probe_id": "probe", "distribution": distribution, "user": user}
        def browse(self, probe_id, path):
            return {"path": path, "directories": [], "files": []}
        def open_workspace(self, probe_id, path):
            return {"connection_id": "connection", "distribution": "Ubuntu",
                    "user": os.environ["USER"], "path": str(tmp_path)}

    class NeverOpenedPort(SidecarHarnessPort):
        def open_execution(self, execution_id):  # pragma: no cover - must never run
            raise AssertionError("the capability gate must refuse before open_execution")

    def execution_factory(records, objects, approvals, notifier, _connector, _credentials, _secrets):
        def port_factory(context, on_event):
            return NeverOpenedPort(
                LocalProcessLauncher(["node", str(SIDEcar_ENTRY)], cwd=str(PLUGIN)),
                environment=sidecar_environment(tmp_path), profile=context["harness_type"],
                adapter={"command": "node", "args": [str(FAKE_PEER)]},
                state_directory=str(tmp_path / "state"), directory=str(tmp_path),
                on_event=on_event,
            )  # 刻意不带 capability_* 材料：模拟装配边界未注入
        return SidecarExecutionBackend(
            records, objects, approvals, port_factory=port_factory, on_event=notifier.notify,
        )

    runtime = build_runtime(
        tmp_path / "server", harnesses=registry,
        execution_factory=execution_factory,
        connector=Connector(),
    )
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        opened = _wire_post(client, runtime.token, "workspaces.open", {
            "requestId": "gate-open", "path": str(tmp_path),
            "environment": {"kind": "wsl", "host": "Ubuntu", "user": None},
        })["workspace"]
        profile = client.post("/api/v1/profiles", headers={
            "Authorization": f"Bearer {runtime.token}", "Idempotency-Key": "gate-profile",
        }, json={"name": "gate", "harness_type": "pi",
                 "configuration": {"model": "initial"}, "credential_id": None}).json()
        accepted = _wire_post(client, runtime.token, "sessions.createAndSend", {
            "requestId": "gate-first", "workspaceId": opened["id"],
            "profileId": profile["profile_id"], "overrides": [],
            "message": {"text": "gate", "attachments": []},
        })
        session_id = accepted["session"]["id"]
        deadline = time.monotonic() + 8
        session = runtime.repository.get_session(session_id)
        while time.monotonic() < deadline and session["turns"][0]["state"] == "running":
            time.sleep(0.02)
            session = runtime.repository.get_session(session_id)
        assert session["turns"][0]["state"] == "failed", session
        assert session["turns"][0]["error_code"] == "CAPABILITY_REQUIREMENT_UNSATISFIED", session


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


class _DrainRaceChannel:
    """In-memory sidecar peer that answers the open handshake and then either
    completes the prompt (healthy) or goes silent with the channel closed
    (the drain the same second a sidecar exits, ACC-R2-1): the prompt boundary
    then sees ``SIDECAR_CLOSED`` rather than a live sidecar.
    """

    def __init__(self, *, die_after_open=False, prompt_delay=0.0):
        self._die = die_after_open
        self._delay = prompt_delay
        self.lines: list[str] = []
        self.closed = False
        self._cond = threading.Condition()

    def write_line(self, value):
        request = json.loads(value)
        op = request.get("op")
        if op == "prompt":
            threading.Thread(target=self._answer_prompt, args=(request,), daemon=True).start()
            return
        if op == "register":
            result = {"profile": request.get("profile"), "provenance": {"commit": "drain-fake"}}
        elif op == "start":
            result = {"sessionCapabilities": {}, "promptCapabilities": {}}
        elif op in ("create", "open"):
            result = {"sessionId": "native-drain"}
        else:
            result = {}
        with self._cond:
            self.lines.append(
                json.dumps({"id": request["id"], "ok": True, "result": result}) + "\n")
            # The sidecar exits right after opening: the answer to `open` still
            # reaches the reader, then the stream ends and `_closed` is set.
            if op in ("create", "open") and self._die:
                self.closed = True
            self._cond.notify_all()

    def _answer_prompt(self, request):
        if self._delay:
            time.sleep(self._delay)
        with self._cond:
            if self._die:
                self.closed = True
            else:
                self.lines.append(json.dumps(
                    {"id": request["id"], "ok": True, "result": {"stopReason": "end_turn"}}) + "\n")
            self._cond.notify_all()

    def iter_chunks(self):
        while True:
            with self._cond:
                while not self.lines and not self.closed:
                    self._cond.wait(timeout=1)
                if self.lines:
                    yield self.lines.pop(0)
                elif self.closed:
                    return

    def close(self):
        with self._cond:
            self.closed = True
            self._cond.notify_all()


class _DrainRaceLauncher:
    """Counts launches so a chosen turn's sidecar comes up dead. Turn 1 (the
    busy turn) is always healthy; the successor turns are governed by
    ``die_counts`` (exact ordinals) and ``die_from`` (every ordinal >= N)."""

    def __init__(self, *, die_counts=(), die_from=None):
        self.count = 0
        self._die_counts = set(die_counts)
        self._die_from = die_from
        self.launches: list[tuple[int, bool]] = []

    def launch(self, _environment):
        self.count += 1
        ordinal = self.count
        dies = ordinal in self._die_counts or (
            self._die_from is not None and ordinal >= self._die_from)
        self.launches.append((ordinal, dies))
        return _DrainRaceChannel(
            die_after_open=dies, prompt_delay=0.6 if ordinal == 1 else 0.0)


def _drain_race_runtime(tmp_path, *, die_counts=(), die_from=None):
    registry = HarnessRegistry()
    registry.register(HarnessDescriptor(
        "pi", capability_claims={"stream": True},
        control_options={"model": ("initial", "queued", "later")}))

    class Connector:
        def distributions(self): return [{"name": "Ubuntu"}]
        def probe(self, distribution, user):
            return {"probe_id": "probe", "distribution": distribution, "user": user}
        def browse(self, probe_id, path):
            return {"path": path, "directories": [], "files": []}
        def open_workspace(self, probe_id, path):
            return {"connection_id": "connection", "distribution": "Ubuntu",
                    "user": os.environ["USER"], "path": str(tmp_path)}

    launcher = _DrainRaceLauncher(die_counts=die_counts, die_from=die_from)

    def execution_factory(records, objects, approvals, notifier, _c, _cr, _s):
        def port_factory(context, on_event):
            return SidecarHarnessPort(
                launcher, environment=sidecar_environment(tmp_path),
                profile=context["harness_type"], adapter={},
                state_directory=str(tmp_path / "state"), directory=str(tmp_path),
                on_event=on_event, **_fixture_capability_material(context))
        return SidecarExecutionBackend(
            records, objects, approvals, port_factory=port_factory, on_event=notifier.notify)

    runtime = build_runtime(
        tmp_path / "drain-race", harnesses=registry, connector=Connector(),
        execution_factory=execution_factory)
    return runtime, launcher


def _await_two_turns(runtime, session_id, expected_second_state):
    deadline = time.monotonic() + 12
    while time.monotonic() < deadline:
        session = runtime.repository.get_session(session_id)
        if (len(session["turns"]) == 2
                and session["turns"][1]["state"] == expected_second_state):
            return session
        time.sleep(0.02)
    return runtime.repository.get_session(session_id)


def test_queue_drain_rebuilds_a_sidecar_closed_at_prompt(tmp_path):
    """G1 (positive): the drained turn must run to completion, not to SIDECAR_CLOSED."""
    runtime, launcher = _drain_race_runtime(tmp_path, die_counts={2})
    try:
        with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
            _profile, first, second = _queue_setup(client, runtime, tmp_path, "busy first")
            session = _await_two_turns(runtime, first["session"]["id"], "completed")
            assert [t["state"] for t in session["turns"]] == ["completed", "completed"], session
            assert session["turns"][1].get("error_code") is None, session
            assert runtime.queue.list(first["session"]["id"]) == []
            # one dead successor launch (#2) then one rebuild (#3): the queue
            # item recovered by reusing the new-turn open path, no re-dispatch.
            assert launcher.count == 3, launcher.launches
    finally:
        runtime.stop()


def test_reverting_the_rebuild_leaves_the_drained_turn_sidecar_closed(tmp_path, monkeypatch):
    """G2 (counter-example): with the pre-fix one-shot prompt the same race
    reproduces the ~1s SIDECAR_CLOSED failure the user reported."""
    def _pre_fix(self, port, turn_id, prompt_content, attachments):
        return port.prompt(turn_id, prompt_content, attachments)
    monkeypatch.setattr(SidecarExecutionBackend, "_prompt_with_rebuild", _pre_fix)

    runtime, launcher = _drain_race_runtime(tmp_path, die_counts={2})
    try:
        with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
            _profile, first, second = _queue_setup(client, runtime, tmp_path, "busy first")
            session = _await_two_turns(runtime, first["session"]["id"], "failed")
            assert session["turns"][1]["state"] == "failed", session
            assert session["turns"][1]["error_code"] == "SIDECAR_CLOSED", session
            # no rebuild happened: only the successor's own dead sidecar (#2).
            assert launcher.count == 2, launcher.launches
    finally:
        runtime.stop()


def test_rebuild_is_bounded_and_typed_when_sidecar_stays_closed(tmp_path):
    """G4 (bounded + typed): a sidecar that never comes back fails with a typed
    rebuild code after the bounded attempts - never a silent or unbounded wait."""
    runtime, launcher = _drain_race_runtime(tmp_path, die_from=2)
    try:
        with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
            _profile, first, _second = _queue_setup(client, runtime, tmp_path, "busy first")
            started = time.monotonic()
            session = _await_two_turns(runtime, first["session"]["id"], "failed")
            assert session["turns"][1]["state"] == "failed", session
            assert session["turns"][1]["error_code"] == "SIDECAR_REBUILD_FAILED", session
            # bounded: exactly one initial prompt + PROMPT_REBUILD_LIMIT rebuilds.
            assert launcher.count == 1 + (SidecarExecutionBackend.PROMPT_REBUILD_LIMIT + 1), \
                launcher.launches
            # and it gave up fast, not on the 600s prompt timeout.
            assert time.monotonic() - started < 8
    finally:
        runtime.stop()


def test_sidecar_permission_round_trip_uses_server_approval_store(tmp_path):
    registry = HarnessRegistry()
    registry.register(HarnessDescriptor("pi", capability_claims={
        "stream": True, "permissions": True,
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
                **_fixture_capability_material(context),
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


class _CapabilityChannels(_EnvelopeChannels):
    """A sidecar peer whose `start` answer declares the given capabilities."""

    def __init__(self, session_capabilities):
        super().__init__()
        self.session_capabilities = session_capabilities

    def write_line(self, value):
        request = json.loads(value)
        if request.get("op") == "start":
            self.requests.append(request)
            with self._condition:
                self.lines.append(json.dumps({
                    "id": request["id"], "ok": True,
                    "result": {"sessionCapabilities": self.session_capabilities},
                }) + "\n")
                self._condition.notify_all()
            return
        super().write_line(value)


class _CapabilityLauncher:
    def __init__(self, session_capabilities):
        self.channels = _CapabilityChannels(session_capabilities)

    def launch(self, _environment):
        return self.channels


@pytest.mark.parametrize("advertised,expected", [
    # ACP marks a capability by its presence, conventionally as an empty object.
    # Reading that as a boolean made every such Harness look unable to resume.
    ({"resume": {}}, True),
    ({"resume": True}, True),
    ({"resume": {"cwd": True}}, True),
    ({"resume": False}, False),
    ({"resume": None}, False),
    ({}, False),
    ({"fork": {}}, False),
])
def test_sidecar_reports_resume_only_when_the_harness_advertised_it(advertised, expected):
    launcher = _CapabilityLauncher(advertised)
    port = SidecarHarnessPort(
        launcher, environment={"AGENTBOX_SIDECAR_ISOLATED": "1"}, profile="pi",
        declared_capabilities={"native_continuation": True},
    )
    try:
        assert port.open_execution("exec-capability") == "native-fake"
        _audit, resumable = port.capture_execution("exec-capability")
        assert resumable is expected, (
            f"advertised {advertised!r} must read as resumable={expected}"
        )
    finally:
        port.stop()


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


def _bwrap_test_port():
    """The real bwrap port for tests that exercise the room argv itself.

    These tests assert the actual room argv (`--ro-bind`, secret mount, ...), so
    they inject the real provider through the same name resolution production
    uses, rather than a stand-in that would make the assertions meaningless.
    """
    from agent_box.extensions.runtime_composition.sandbox_port import (
        resolve_sandbox_port,
    )

    return resolve_sandbox_port("sandbox-bwrap")


def _launcher_for_test(client):
    return WslSidecarLauncher(
        _WorkerConnectorFake(client),
        workspace={"distribution": "Ubuntu", "remote_user": "tester",
                   "connection_id": "connection", "remote_path": "/workspace"},
        bundle={}, credential=b"fixture-secret", timeout_ms=5000,
        sandbox_port=_bwrap_test_port(),
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


class _RecordingConnector:
    """Captures what the launcher hands to the WSL connector."""

    def __init__(self, client):
        self.client = client
        self.kwargs = None

    def client_for_workspace(self, **kwargs):
        self.kwargs = kwargs
        return self.client


ARTIFACT_SOURCE = "/opt/agentbox/artifacts/fixture-dep"


def test_wsl_sidecar_carries_runtime_artifacts_to_bootstrap_and_bwrap():
    """One declaration becomes one bootstrap authorization and one ro-bind."""
    declaration = {"path": ARTIFACT_SOURCE, "target": ARTIFACT_TARGET,
                   "digest": ARTIFACT_DECLARED_DIGEST}
    client = _RecordingWorkerClient()
    connector = _RecordingConnector(client)
    launcher = WslSidecarLauncher(
        connector,
        workspace={"distribution": "Ubuntu", "remote_user": "tester",
                   "connection_id": "connection", "remote_path": "/workspace"},
        bundle={}, timeout_ms=5000,
        runtime_artifact_authorizations=(declaration,),
        runtime_artifact_mounts=((ARTIFACT_SOURCE, ARTIFACT_TARGET),),
        sandbox_port=_bwrap_test_port(),
    )
    channels = launcher.launch({})
    try:
        assert connector.kwargs["runtime_artifact_authorizations"] == (declaration,)
        argv = next(payload for op, payload in client.calls if op == "spawn")["argv"]
        marker = argv.index(ARTIFACT_SOURCE)
        assert argv[marker - 1:marker + 2] == ["--ro-bind", ARTIFACT_SOURCE, ARTIFACT_TARGET]
        assert ["--dir", "/runtime/artifacts"] == argv[
            argv.index("/runtime/artifacts") - 1:argv.index("/runtime/artifacts") + 1
        ]
        assert ARTIFACT_DECLARED_DIGEST not in json.dumps(client.calls)
    finally:
        channels.close()


@pytest.mark.parametrize("authorizations,mounts", [
    # A mount that carries no declaration would reach bwrap unverified.
    ((), ((ARTIFACT_SOURCE, ARTIFACT_TARGET),)),
    # A declaration the Server silently dropped is equally unacceptable.
    (({"path": ARTIFACT_SOURCE, "target": ARTIFACT_TARGET,
       "digest": ARTIFACT_DECLARED_DIGEST},), ()),
    # Authorizing one directory while mounting another must not be possible.
    (({"path": ARTIFACT_SOURCE, "target": ARTIFACT_TARGET,
       "digest": ARTIFACT_DECLARED_DIGEST},),
     (("/opt/agentbox/artifacts/other", ARTIFACT_TARGET),)),
    (({"path": ARTIFACT_SOURCE, "target": ARTIFACT_TARGET,
       "digest": ARTIFACT_DECLARED_DIGEST},),
     ((ARTIFACT_SOURCE, "/runtime/artifacts/other"),)),
    (({"path": ARTIFACT_SOURCE, "target": ARTIFACT_TARGET,
       "digest": ARTIFACT_DECLARED_DIGEST},) * 2,
     ((ARTIFACT_SOURCE, ARTIFACT_TARGET), (ARTIFACT_SOURCE, ARTIFACT_TARGET))),
])
def test_wsl_sidecar_refuses_artifact_declarations_that_do_not_match(
    authorizations, mounts,
):
    with pytest.raises(ValueError, match="SIDECAR_RUNTIME_ARTIFACT_DECLARATION"):
        WslSidecarLauncher(
            _WorkerConnectorFake(_WorkerClientFake()),
            workspace={"distribution": "Ubuntu", "remote_user": "tester",
                       "connection_id": "connection", "remote_path": "/workspace"},
            bundle={}, timeout_ms=5000,
            runtime_artifact_authorizations=authorizations,
            runtime_artifact_mounts=mounts,
            sandbox_port=_bwrap_test_port(),
        )


CHUNK = 32 * 1024


class _RecordingWorkerClient:
    """Records every control request so the bundle transfer can be audited."""

    def __init__(self):
        self.calls = []
        self.closed = False

    def start(self):
        self.calls.append(("start", {}))

    def request(self, op, arguments=None, **identity):
        self.calls.append((op, dict(arguments or {})))
        if op == "view.commit":
            return {"path": "/worker/views/v/ready"}
        if op == "secret.put":
            return {"path": "/worker/secrets/a/frame"}
        return {"accepted": True}

    def subscribe_output(self, _listener): return lambda: None
    def subscribe_disconnect(self, _listener): return lambda: None
    def close_stdin(self, *_args, **_kwargs): pass
    def wait_terminal(self, *_args, **_kwargs): return {}
    def close(self): self.closed = True

    def puts(self):
        return [(payload["path"], payload["offset"]) for op, payload in self.calls if op == "view.put"]


def test_sidecar_bundle_uploads_every_chunk_offset_exactly_once():
    """Each (path, offset) is transferred once, in order, with no gap or repeat.

    A repeated offset would duplicate a chunk, and the Worker appends at the
    offset it is told the file already has — so a repeat is not a harmless
    retry, it is a corrupt projection that the Worker must reject. This asserts
    the client never emits one, by rebuilding each file from the uploaded
    chunks as well as comparing the offset sequence itself.
    """
    content = bytes(range(256)) * 400          # 102 400 bytes: 4 chunks, last partial
    small = b"small\n"
    bundle = {"agentbox-sidecar/runtime/worker-entry.mjs": content,
              "agentbox-sidecar/package.json": small}
    client = _RecordingWorkerClient()
    launcher = WslSidecarLauncher(
        _WorkerConnectorFake(client),
        workspace={"distribution": "Ubuntu", "remote_user": "tester",
                   "connection_id": "connection", "remote_path": "/workspace"},
        bundle=bundle, timeout_ms=5000,
        sandbox_port=_bwrap_test_port(),
    )
    channels = launcher.launch({})
    try:
        expected = [
            (path, offset)
            for path, value in sorted(bundle.items())
            for offset in range(0, len(value), CHUNK)
        ]
        assert client.puts() == expected
        assert len(client.puts()) == len(set(client.puts()))
        rebuilt = {path: bytearray() for path in bundle}
        for _op, payload in client.calls:
            if _op != "view.put":
                continue
            rebuilt[payload["path"]][payload["offset"]:] = base64.b64decode(payload["data"])
        assert {path: bytes(value) for path, value in rebuilt.items()} == bundle
        manifest = next(payload for op, payload in client.calls if op == "view.prepare")
        assert {item["path"]: item["size"] for item in manifest["files"]} == {
            path: len(value) for path, value in sorted(bundle.items())
        }
    finally:
        channels.close()


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


class _HomeAuditClient:
    """A Worker-shaped home: `home.list` answers, `home.get` serves bytes."""

    def __init__(self, files, payloads, *, truncated=None, skipped=0):
        self.files = files
        self.payloads = payloads
        self.truncated = truncated or {"entries": 0, "bytes": 0, "oversize": 0}
        self.skipped = skipped
        self.calls = []
        self.deleted = []

    def request(self, op, arguments=None, **_identity):
        self.calls.append((op, arguments or {}))
        if op == "home.list":
            return {"files": self.files, "truncated": self.truncated, "skipped": self.skipped}
        if op == "home.get":
            path = arguments["path"]
            value = self.payloads[path]
            offset = arguments["offset"]
            chunk = value[offset:offset + arguments["maxLength"]]
            return {"data": base64.b64encode(chunk).decode(), "offset": offset,
                    "digest": "sha256:" + hashlib.sha256(value).hexdigest(),
                    "nextOffset": offset + len(chunk),
                    "eof": offset + len(chunk) == len(value)}
        if op == "home.delete":
            self.deleted.append(arguments["path"])
            return {"deleted": arguments["path"]}
        return {"accepted": True}

    def wait_terminal(self, *_args, **_kwargs):
        return {}

    def close_stdin(self, *_args, **_kwargs):
        pass

    def close(self):
        pass


WINDOW = ".pi/agent/sessions"
LOCATOR = "pi-test/.pi"


def test_worker_channels_audit_records_the_declared_window():
    value = b"native-state"
    client = _HomeAuditClient(
        [{"path": "sessions/thread.jsonl", "size": len(value)}],
        {f"{WINDOW}/sessions/thread.jsonl": value},
    )
    channels = _WorkerChannels(client, "attempt", 1, "view",
                               home_locator=LOCATOR, audit_window=WINDOW)
    audit = channels.audit_state()
    assert audit["files"] == [{"path": "sessions/thread.jsonl", "size": len(value),
                               "digest": "sha256:" + hashlib.sha256(value).hexdigest()}]
    # The listing asked for the declared window of this home, role-relative.
    assert client.calls[0] == ("home.list", {"locator": LOCATOR, "relative": WINDOW})


def test_worker_channels_audit_reports_truncation_instead_of_refusing():
    # The Worker never lists an entry it had to truncate - the fact arrives in
    # `truncated` - so the audit carries it through without re-reading.
    client = _HomeAuditClient(
        [], {},
        truncated={"entries": 1, "bytes": 8 * 1024 * 1024 + 1, "oversize": 1},
    )
    channels = _WorkerChannels(client, "attempt", 1, "view",
                               home_locator=LOCATOR, audit_window=WINDOW)
    audit = channels.audit_state()
    assert audit["files"] == [] and audit["truncated"]["oversize"] == 1


def test_worker_channels_audit_scans_for_credential_material_fail_closed():
    value = b"not-the-secret"
    client = _HomeAuditClient(
        [{"path": "state.json", "size": len(value)}],
        {f"{WINDOW}/state.json": value},
    )
    channels = _WorkerChannels(client, "attempt", 1, "view",
                               home_locator=LOCATOR, audit_window=WINDOW,
                               forbidden_content=b"secret")
    with pytest.raises(SidecarError, match="SECRET"):
        channels.audit_state()
    assert channels._forbidden_content == b"secret"
    channels.close()
    assert channels._forbidden_content == b""


def test_worker_channels_rejects_state_digest_change():
    value = b"native-state"
    client = _HomeAuditClient(
        [{"path": "state.json", "size": len(value)}],
        {f"{WINDOW}/state.json": value},
    )
    original = client.request

    def wrong_digest(op, arguments=None, **identity):
        result = original(op, arguments, **identity)
        if op == "home.get":
            result["digest"] = "sha256:" + "0" * 64
        return result

    client.request = wrong_digest
    channels = _WorkerChannels(client, "attempt", 1, "view",
                               home_locator=LOCATOR, audit_window=WINDOW)
    # A file whose bytes moved under the read is unaudited, and the manifest
    # says so: it is a reported fact, never a silently clean scan.
    audit = channels.audit_state()
    assert audit["files"] == []
    assert audit["truncated"]["entries"] == 1
    assert audit["audited"]["files"] == 0


ARTIFACT_PROBE_RELATIVE = "tests/server/fixtures/artifact_probe_acp_peer.mjs"
ARTIFACT_DEPENDENCY = "export const VALUE = 'runtime-artifact-fixed-value'\n"


def _release_worker():
    """The release Worker under test; the acceptance bundle can be named instead."""
    override = os.environ.get("AGENT_BOX_TEST_RELEASE_WORKER")
    if override:
        return pathlib.Path(override)
    return REPO / "workers" / "agent-box-worker" / "target" / "release" / "agent-box-worker"


class _ReleaseWorkerConnector:
    """WSL connector bound to the release Worker build and this checkout.

    Every other Worker test in this module drives the debug build; the runtime
    artifact gate deliberately uses the release build so the projection is
    proven on the artifact the Windows acceptance bundle is produced from.
    """

    def __init__(self, tmp_path, worker):
        self.tmp_path = tmp_path
        self.worker = worker

    def distributions(self): return [{"name": "Ubuntu"}]

    def probe(self, distribution, user):
        return {"probe_id": "probe", "distribution": distribution, "user": user}

    def browse(self, probe_id, path):
        return {"path": path, "directories": [], "files": []}

    def open_workspace(self, probe_id, path):
        return {"connection_id": "connection-artifact", "distribution": "Ubuntu",
                "user": os.environ["USER"], "path": str(REPO)}

    def client_for_workspace(self, **arguments):
        return WorkerClient(
            [str(self.worker), "--root", str(self.tmp_path / "worker-root"),
             "--home-root", str(self.tmp_path / "profile-home"),
             "--workspace", str(REPO)],
            worker_digest="sha256:" + hashlib.sha256(self.worker.read_bytes()).hexdigest(),
            worker_version="0.1.0", connection_id=arguments["connection_id"],
            project_id=arguments["connection_id"], effective_user=os.environ["USER"],
            server_instance_id="server-artifact",
            executable_authorizations=arguments.get("executable_authorizations", ()),
            runtime_artifact_authorizations=arguments.get(
                "runtime_artifact_authorizations", (),
            ),
        )


def _artifact_runtime(tmp_path, monkeypatch, *, worker, tree, digest_value, adapter):
    """A Server whose one Harness declares one digest-pinned artifact tree."""
    deployment = tmp_path / "artifact-deployment.json"
    deployment.write_text(json.dumps({
        "schemaVersion": 1,
        "harnesses": [{
            "id": "pi", "timeoutMs": 30_000,
            "runtimeArtifactMounts": [{
                # 部署文档不携带宿主路径：令牌 + 绑定是现行合同（7011ed0 起），
                # 本 fixture 曾用已废弃的 `source` 键，只是因为基线环境里没有
                # release Worker，这两条用例一直被 skip 掩盖着。
                "token": "fixture-dep", "target": ARTIFACT_TARGET, "treeDigest": digest_value,
            }],
            "adapter": adapter,
        }],
    }), encoding="utf-8")
    import agent_box.server.bootstrap.runtime as runtime_module
    monkeypatch.setattr(
        runtime_module, "_builtin_connector",
        lambda _id: _ReleaseWorkerConnector(tmp_path, worker),
    )
    original_file = runtime_module._sidecar_deployment_file
    fixture = pathlib.Path(__file__).parent / "fixtures" / "artifact_probe_acp_peer.mjs"
    monkeypatch.setattr(
        runtime_module, "_sidecar_deployment_file",
        lambda root, relative: fixture.read_bytes()
        if relative == ARTIFACT_PROBE_RELATIVE
        else original_file(root, relative),
    )
    return build_runtime_from_sidecar_deployment(
        tmp_path / "server", deployment, plugin_root=PLUGIN,
        mount_bindings={"fixture-dep": str(tree)},
    )


def _artifact_tree(tmp_path, *, dependency=ARTIFACT_DEPENDENCY):
    from agent_box_sandbox_bwrap import runtime_artifact_tree_digest

    tree = tmp_path / "artifacts" / "fixture-dep"
    (tree / "nested").mkdir(parents=True)
    (tree / "dep.mjs").write_text(dependency, encoding="utf-8")
    (tree / "nested" / "extra.txt").write_text("extra\n", encoding="utf-8")
    return tree, runtime_artifact_tree_digest(tree)


def test_release_worker_projects_a_runtime_artifact_tree_through_the_real_chain(
    tmp_path, monkeypatch,
):
    """Server declaration -> bootstrap -> WSL Worker verification -> bwrap -> guest.

    The fixture loads a dependency from /runtime/artifacts/fixture-dep and
    reports the value that module exports, so the gate is the projected tree
    itself and not a copy that reached the workspace some other way. No model
    and no network are involved; this registers runtime artifact projection
    only, never a Harness or model result.
    """
    worker = _release_worker()
    if not worker.is_file() or not shutil.which("bwrap"):
        pytest.skip("the release Worker and bwrap are required")
    tree, declared = _artifact_tree(tmp_path)
    runtime = _artifact_runtime(
        tmp_path, monkeypatch, worker=worker, tree=tree, digest_value=declared,
        adapter={"command": "/usr/bin/node", "args": [],
                 "source": ARTIFACT_PROBE_RELATIVE,
                 "environment": {"FAKE_PEER_ARTIFACT": ARTIFACT_TARGET}},
    )
    try:
        with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
            headers = {"Authorization": f"Bearer {runtime.token}"}
            opened = _wire_post(client, runtime.token, "workspaces.open", {
                "requestId": "open-artifact", "path": str(REPO),
                "environment": {"kind": "wsl", "host": "Ubuntu", "user": os.environ["USER"]},
            })["workspace"]
            profile = client.post("/api/v1/profiles", headers={
                **headers, "Idempotency-Key": "artifact-profile",
            }, json={"name": "artifact", "harness_type": "pi", "configuration": {},
                     "credential_id": None}).json()
            sent = _wire_post(client, runtime.token, "sessions.createAndSend", {
                "requestId": "artifact-turn", "workspaceId": opened["id"],
                "profileId": profile["profile_id"], "overrides": [],
                "message": {"text": "load the projected dependency", "attachments": []},
            })
            session = _wait_for_turn(runtime, sent["session"]["id"], 0, "completed")
            delta = next(
                event for event in session["events"]
                if event.get("turn_id") == sent["executionId"] and event["kind"] == "message.delta"
            )
            declared_prefix = "artifact-probe:"
            assert delta["data"]["text"].startswith(declared_prefix), delta["data"]
            facts = json.loads(delta["data"]["text"][len(declared_prefix):])
            assert facts["error"] is None
            assert facts["value"] == "runtime-artifact-fixed-value"
            assert facts["directory"] == ARTIFACT_TARGET
            assert sorted(facts["entries"]) == ["dep.mjs", "nested", "nested/extra.txt"]
            assert facts["writeBlocked"] is True
    finally:
        runtime.stop()

    from agent_box_sandbox_bwrap import runtime_artifact_tree_digest

    # The projection was read-only: neither the guest write nor the whole
    # execution changed the declared tree.
    assert runtime_artifact_tree_digest(tree) == declared
    assert not (tree / "guest-write").exists()
    _await_worker_projection_cleanup(tmp_path / "worker-root")


def test_release_worker_refuses_a_runtime_artifact_tree_that_drifted(
    tmp_path, monkeypatch,
):
    """A declared digest that no longer matches is a typed failure, not a mount.

    The wrong digest is declared through the same production deployment file a
    real deployment uses, so this is the Server-to-Worker path and not a unit
    stub: the Worker re-derives the tree and refuses the handshake.
    """
    worker = _release_worker()
    if not worker.is_file() or not shutil.which("bwrap"):
        pytest.skip("the release Worker and bwrap are required")
    tree, _real = _artifact_tree(tmp_path)
    # A different tree: the digest is content-derived, so a copy of the same
    # tree at another path would legitimately match and prove nothing.
    _other, wrong = _artifact_tree(
        tmp_path / "other", dependency="export const VALUE = 'other-tree'\n",
    )
    runtime = _artifact_runtime(
        tmp_path, monkeypatch, worker=worker, tree=tree, digest_value=wrong,
        adapter={"command": "/usr/bin/node", "args": [],
                 "source": ARTIFACT_PROBE_RELATIVE,
                 "environment": {"FAKE_PEER_ARTIFACT": ARTIFACT_TARGET}},
    )
    try:
        with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
            opened = _wire_post(client, runtime.token, "workspaces.open", {
                "requestId": "open-drift", "path": str(REPO),
                "environment": {"kind": "wsl", "host": "Ubuntu", "user": os.environ["USER"]},
            })["workspace"]
            profile = client.post("/api/v1/profiles", headers={
                "Authorization": f"Bearer {runtime.token}", "Idempotency-Key": "drift-profile",
            }, json={"name": "drift", "harness_type": "pi", "configuration": {},
                     "credential_id": None}).json()
            sent = _wire_post(client, runtime.token, "sessions.createAndSend", {
                "requestId": "drift-turn", "workspaceId": opened["id"],
                "profileId": profile["profile_id"], "overrides": [],
                "message": {"text": "load the projected dependency", "attachments": []},
            })
            session = _wait_for_turn(runtime, sent["session"]["id"], 0, "failed")
            # No session may be invented for a Harness that never started.
            assert session["checkpoint"] is None
            with runtime.database.read() as conn:
                ledger = [
                    json.loads(row["data_json"])
                    for row in conn.execute(
                        "SELECT data_json FROM core_events WHERE type=?",
                        (EventType.EXECUTION_DISPATCH_AMBIGUOUS.value,),
                    )
                ]
            assert len(ledger) == 1 and "RUNTIME_ARTIFACT_DIGEST_MISMATCH" in ledger[0]["error"], ledger
            assert not any(
                event["kind"] == "message.delta" for event in session["events"]
            ), session["events"]
    finally:
        runtime.stop()
    _await_worker_projection_cleanup(tmp_path / "worker-root")


def test_stopping_the_runtime_waits_for_its_durable_completion_workers(tmp_path):
    """A stopped runtime leaves no completion worker writing the shared database.

    `_complete` runs on its own thread and goes through the shared Work Core
    connection after the prompt worker finished. Returning from `stop()` while it
    is still inside that connection lets the next shutdown - or the next test -
    reset it underneath the thread, which crashed the interpreter inside SQLite.
    """
    runtime = _local_sidecar_runtime(tmp_path)
    try:
        with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
            opened = _wire_post(client, runtime.token, "workspaces.open", {
                "requestId": "lifetime-open", "path": str(tmp_path),
                "environment": {"kind": "wsl", "host": "Ubuntu", "user": None},
            })["workspace"]
            profile = client.post("/api/v1/profiles", headers={
                "Authorization": f"Bearer {runtime.token}",
                "Idempotency-Key": "lifetime-profile",
            }, json={"name": "lifetime", "harness_type": "pi", "configuration": {},
                     "credential_id": None}).json()
            sent = _wire_post(client, runtime.token, "sessions.createAndSend", {
                "requestId": "lifetime-send", "workspaceId": opened["id"],
                "profileId": profile["profile_id"], "overrides": [],
                "message": {"text": "durable completion", "attachments": []},
            })
            session_id = sent["session"]["id"]
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                session = runtime.repository.get_session(session_id)
                if session["turns"] and session["turns"][0]["state"] == "completed":
                    break
                time.sleep(0.05)
            assert session["turns"][0]["state"] == "completed"

        assert runtime.execution.stop() is True
        surviving = [
            thread for thread in threading.enumerate()
            if "_complete" in (getattr(getattr(thread, "_target", None), "__qualname__", "") or "")
        ]
        assert surviving == [], f"a completion worker outlived stop(): {surviving}"
        assert runtime.execution._completion_threads == set()
    finally:
        runtime.stop()


def test_stop_blocks_until_a_live_completion_worker_finishes():
    """The wait itself is the contract, not the absence of a rare race."""
    backend = SidecarExecutionBackend(
        records=None, objects=None, approvals=None, port_factory=lambda *_: None,
    )
    started_running = threading.Event()

    def tail():
        started_running.set()
        time.sleep(0.6)

    worker = threading.Thread(target=tail, daemon=True)
    with backend._lock:
        backend._completion_threads.add(worker)
    worker.start()
    assert started_running.wait(2)

    started = time.monotonic()
    assert backend.stop() is True
    waited = time.monotonic() - started
    assert waited >= 0.4, f"stop() returned while a completion worker was running ({waited:.2f}s)"
    assert not worker.is_alive()
    assert backend._completion_threads == set()


def test_stop_reports_honestly_when_a_completion_worker_outlasts_the_deadline(monkeypatch):
    """No silent success: a worker that will not settle makes stop() return False."""
    backend = SidecarExecutionBackend(
        records=None, objects=None, approvals=None, port_factory=lambda *_: None,
    )
    monkeypatch.setattr(type(backend), "STOP_DEADLINE_SECONDS", 0.3)
    release = threading.Event()

    def tail():
        release.wait(5)

    worker = threading.Thread(target=tail, daemon=True)
    with backend._lock:
        backend._completion_threads.add(worker)
    worker.start()
    try:
        assert backend.stop() is False
    finally:
        release.set()
        worker.join(2)
        assert not worker.is_alive()


def test_process_facts_land_in_the_ledger_and_wire(tmp_path):
    """Order 52: the four ACP fact classes reach the ledger and the wire.

    The fake peer replays a thought, a tool call and its completion, a plan
    snapshot and the selected mode over the real ACP wire; the Server maps
    them onto neutral facts in the turn ledger and the wire projection
    carries them to clients — each fact exactly as reported, nothing
    synthesized for a class the harness did not emit.
    """
    runtime = _local_sidecar_runtime(tmp_path)
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        profile, first, _second = _queue_setup(client, runtime, tmp_path, "process-facts-52")
        deadline = time.monotonic() + 30
        session = runtime.repository.get_session(first["session"]["id"])
        while time.monotonic() < deadline and session["turns"][0]["state"] in {"accepted", "dispatching", "running", "capturing"}:
            time.sleep(0.05)
            session = runtime.repository.get_session(first["session"]["id"])
        assert session["turns"][0]["state"] == "completed", session["turns"][0]

        frames = _wire_post(client, runtime.token, "history.snapshot", {
            "sessionId": first["session"]["id"],
        })["frames"]
        kinds = [frame["event"]["kind"] for frame in frames]
        kinds = [frame["event"]["kind"] for frame in frames]
        print("WIRE KINDS:", sorted(set(kinds)))
        assert "thought.delta" in kinds
        assert "tool.update" in kinds
        assert "plan.updated" in kinds
        assert "mode.updated" in kinds

        by_kind: dict[str, list[dict]] = {}
        for frame in frames:
            by_kind.setdefault(frame["event"]["kind"], []).append(frame["event"])
        assert any("reasoning through the steps" in e.get("text", "")
                   for e in by_kind["thought.delta"])
        tool = [e for e in by_kind["tool.update"] if e.get("toolCallId") == "call-52"]
        assert tool and any(e.get("state") == "completed" for e in tool)
        plan = by_kind["plan.updated"][-1]
        assert [entry["content"] for entry in plan["entries"]] == ["step one", "step two"]
        assert by_kind["mode.updated"][-1]["currentModeId"] == "code"

        # The queued successor turn is still in flight; let every turn reach a
        # terminal state before the runtime stops, or the stop times out.
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            session = runtime.repository.get_session(first["session"]["id"])
            if all(t["state"] in {"completed", "failed", "cancelled"}
                   for t in session["turns"]):
                break
            time.sleep(0.05)
