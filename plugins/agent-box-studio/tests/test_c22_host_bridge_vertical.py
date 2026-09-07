"""C2.2 production vertical through the real private HostBridge wire.

Unlike the sibling c22 file (typed fake host seam), these tests drive the
business pipeline through a TCP bridge that speaks the EXACT Rust wire of
``src-tauri/src/host_bridge.rs`` and the EXACT handler semantics of
``commands/execution_target.rs``: ``connectionResolve`` from a canned
catalog row, ``workerEnsure`` accepted, and every other closed operation
rejected with ``INVALID_OPERATION`` — the current Rust production truth.
"""
from __future__ import annotations

import json
import socket
import struct
import threading

from agent_box.extensions.bootstrap import build_extension_environment
from agent_box.protocols.runtime import HostTransportOperation, RuntimeHostV1
from agent_box.protocols.session import SESSION_TURN_INPUT_CONTRACT_ID
from agent_box.resource_contracts import WorkspaceV1
from agent_box.work_core.errors import ExecutionStartRejected
from agent_box.work_core.registry import (
    ExecutionStartReceipt,
    ProviderDescriptor,
    RecoverySupport,
)
from agent_box_studio.config import StudioConfig
from agent_box_studio.host_bridge import (
    HostBridgeBootstrap,
    HostBridgeClient,
    HostBridgeHostAuthority,
)
from agent_box_studio.server.app import create_app
from agent_box_workspace_wsl import WslLiveWorkspaceProvider

from conftest import TEST_TOKEN, production_entry_points


# The workspace provider is constructed with the bridge authority and a
# controlled registry path; its production entry point is excluded for the
# duration so the SAME production class can be registered deterministically.
_TEST_ENTRY_POINTS = production_entry_points(exclude=frozenset({"workspace-wsl"}))


RECEIPT = {
    "connection_id": "conn-wsl-1",
    "revision": 3,
    "fingerprint": "sha256:" + "d" * 64,
    "distribution": "Ubuntu",
    "user": "dev",
    "os": "Linux",
    "arch": "x86_64",
    "project_root": "/home/dev/project",
    "capabilities": ["worker_bootstrap"],
}


class RustShapedBridge:
    """The current production Rust handler, replicated on the wire."""

    def __init__(self, *, worker_ensure_body: dict[str, object] | None = None):
        self._worker_ensure_body = worker_ensure_body or {"status": "accepted"}
        self.requests: list[dict[str, object]] = []
        self._server = socket.socket()
        self._server.bind(("127.0.0.1", 0))
        self._server.listen(16)
        self.endpoint = f"http://127.0.0.1:{self._server.getsockname()[1]}"
        self._accept_thread = threading.Thread(target=self._accept_loop, daemon=True)

    def start(self) -> None:
        self._accept_thread.start()

    def _accept_loop(self) -> None:
        while True:
            try:
                stream, _ = self._server.accept()
            except OSError:
                return
            with stream:
                try:
                    self._serve_once(stream)
                except (OSError, ValueError):
                    return

    def _serve_once(self, stream: socket.socket) -> None:
        header = self._read_exact(stream, 4)
        body = self._read_exact(stream, struct.unpack(">I", header)[0])
        request = json.loads(body)
        self.requests.append(request)
        if request.get("capability") != "bridge-capability":
            response_body: dict[str, object] = {"status": "error", "code": "INVALID_CAPABILITY"}
        else:
            response_body = self._handle(request)
        payload = json.dumps(
            {
                "protocol": "V1",
                "requestId": request.get("requestId", "invalid-request"),
                "body": response_body,
            },
            separators=(",", ":"),
        ).encode()
        stream.sendall(struct.pack(">I", len(payload)) + payload)

    @staticmethod
    def _read_exact(stream: socket.socket, length: int) -> bytes:
        data = bytearray()
        while len(data) < length:
            chunk = stream.recv(length - len(data))
            if not chunk:
                raise OSError("bridge stream closed")
            data.extend(chunk)
        return bytes(data)

    def _handle(self, request: dict[str, object]) -> dict[str, object]:
        operation = request.get("operation") or {}
        name = operation.get("operation")
        scope = request.get("scope") or {}
        if name == "connectionResolve":
            if (
                operation.get("connectionId") != RECEIPT["connection_id"]
                or operation.get("revision") != RECEIPT["revision"]
            ):
                return {"status": "error", "code": "CONNECTION_REVISION_MISMATCH"}
            return {
                "status": "connectionResolved",
                "connectionId": RECEIPT["connection_id"],
                "revision": RECEIPT["revision"],
                "fingerprint": RECEIPT["fingerprint"],
                "distribution": RECEIPT["distribution"],
                "user": RECEIPT["user"],
                "os": RECEIPT["os"],
                "arch": RECEIPT["arch"],
                "projectRoot": RECEIPT["project_root"],
                "capabilities": RECEIPT["capabilities"],
            }
        if name == "workerEnsure":
            return dict(self._worker_ensure_body)
        return {"status": "error", "code": "INVALID_OPERATION"}

    def close(self) -> None:
        self._server.close()


class BridgeFakeHarness:
    """The fake vertical: submits the typed attempt through the WSL runtime."""

    def __init__(self) -> None:
        self.requests = []
        self.rejection: Exception | None = None

    def descriptor(self):
        return ProviderDescriptor("bridge-fake-harness", "Bridge fake harness", "1")

    def capabilities(self):
        return {
            "session_turn_execution": "supported",
            "execution": "supported",
            "start": "supported",
            "network": "offline",
        }

    def input_limits(self):
        return {
            SESSION_TURN_INPUT_CONTRACT_ID: (1, 1),
            RuntimeHostV1.contract_id: (1, 1),
            WorkspaceV1.contract_id: (1, 1),
        }

    def start(self, request):
        self.requests.append(request)
        runtime = next(
            item.value
            for item in request.resolved_inputs
            if item.contract_id == RuntimeHostV1.contract_id
        )
        try:
            self.bridge_operation_ref = runtime.transport.submit(
                HostTransportOperation(
                    attempt_key=request.dispatch_id,
                    spawn_token=request.execution_id,
                    spec_digest=request.inputs_digest,
                    transport_kind="wsl-host-bridge@1",
                    sealed_payload="bridge-fake-harness",
                )
            )
        except Exception as exc:  # the typed host rejection rides to Core
            self.rejection = exc
            raise
        return ExecutionStartReceipt(
            request.execution_id,
            request.dispatch_id,
            request.inputs_digest,
            RecoverySupport.NONE,
        )


def _make_service(bridge: RustShapedBridge, registry_path):
    bootstrap = HostBridgeBootstrap(bridge.endpoint, "bridge-capability", "V1")
    authority = HostBridgeHostAuthority(HostBridgeClient(bootstrap))
    environment = build_extension_environment(
        host_operations=authority, entry_points=_TEST_ENTRY_POINTS
    )
    workspace = WslLiveWorkspaceProvider(
        host_operations=authority,
        registry_path=registry_path,
    )
    environment.registry.register_resource_provider(workspace)
    harness = BridgeFakeHarness()
    environment.registry.register_execution_provider(harness)
    app = create_app(
        StudioConfig(worker_mode="inline"),
        environment=environment,
        workspace=workspace,
        token=TEST_TOKEN,
    )
    return app.state.service, harness


def test_remote_session_creation_resolves_through_the_bridge_wire(studio_home, tmp_path):
    bridge = RustShapedBridge()
    bridge.start()
    try:
        service, _harness = _make_service(bridge, tmp_path / "wsl-projects.json")
        created = service.create_remote_session(
            idempotency_key="bridge-session-1",
            title="bridge vertical",
            connection_id=RECEIPT["connection_id"],
            connection_revision=RECEIPT["revision"],
            project_identity="project-wsl-1",
            project_id="project-wsl-1",
            remote_path="/home/dev/project",
        )
    finally:
        bridge.close()

    session = created["session"]
    assert session.workspace_ref.provider == "wsl-live-workspace"
    resolves = [
        request
        for request in bridge.requests
        if (request.get("operation") or {}).get("operation") == "connectionResolve"
    ]
    assert resolves, "the business pipeline never reached the private bridge"
    for request in resolves:
        assert request["protocol"] == "V1"
        assert request["capability"] == "bridge-capability"
        assert request["operation"] == {
            "operation": "connectionResolve",
            "connectionId": "conn-wsl-1",
            "revision": 3,
            "projectIdentity": "project-wsl-1",
        }


def test_dispatch_fails_closed_when_the_wire_cannot_carry_spawn_facts(studio_home, tmp_path):
    bridge = RustShapedBridge()
    bridge.start()
    try:
        service, harness = _make_service(bridge, tmp_path / "wsl-projects.json")
        created = service.create_remote_session(
            idempotency_key="bridge-session-2",
            title="bridge dispatch",
            connection_id=RECEIPT["connection_id"],
            connection_revision=RECEIPT["revision"],
            project_identity="project-wsl-1",
            project_id="project-wsl-1",
            remote_path="/home/dev/project",
        )
        session = created["session"]
        result = service.submit_turn(
            session.session_id,
            idempotency_key="bridge-turn-1",
            input_text="run the remote attempt",
            execution_provider_id="bridge-fake-harness",
        )
    finally:
        bridge.close()

    turn = service._store.get_turn(session.session_id, result["turn_id"])
    # Determinate, honest failure: the host wire cannot carry the spawn
    # facts, the transport proved nothing was started, and the run never
    # fabricates a completion.
    assert turn.state.value == "failed"
    assert turn.terminal_outcome.value == "failed"
    assert isinstance(harness.rejection, ExecutionStartRejected)
    assert "HOST_BRIDGE_PROCESS_SPAWN_FACTS_ABSENT" in str(harness.rejection)
    ensures = [
        request
        for request in bridge.requests
        if (request.get("operation") or {}).get("operation") == "workerEnsure"
    ]
    assert ensures, "the attempt never reached the private bridge"
    for request in ensures:
        assert request["scope"] == {
            "connectionId": "conn-wsl-1",
            "projectIdentity": "project-wsl-1",
        }
    transcript = service.transcript(session.session_id)
    assert any(event.event_type == "execution.failed" for event in transcript)
    assert not any(
        event.event_type == "turn.result" and event.payload.get("outcome") == "succeeded"
        for event in transcript
    )


def test_worker_ensure_rejection_surfaces_the_host_error_code(studio_home, tmp_path):
    bridge = RustShapedBridge(
        worker_ensure_body={"status": "error", "code": "CONNECTION_FACTS_UNAVAILABLE"}
    )
    bridge.start()
    try:
        service, harness = _make_service(bridge, tmp_path / "wsl-projects.json")
        created = service.create_remote_session(
            idempotency_key="bridge-session-3",
            title="bridge ensure failure",
            connection_id=RECEIPT["connection_id"],
            connection_revision=RECEIPT["revision"],
            project_identity="project-wsl-1",
            project_id="project-wsl-1",
            remote_path="/home/dev/project",
        )
        session = created["session"]
        result = service.submit_turn(
            session.session_id,
            idempotency_key="bridge-turn-2",
            input_text="run with a broken worker gate",
            execution_provider_id="bridge-fake-harness",
        )
    finally:
        bridge.close()

    assert isinstance(harness.rejection, ExecutionStartRejected)
    assert "CONNECTION_FACTS_UNAVAILABLE" in str(harness.rejection)
    turn = service._store.get_turn(session.session_id, result["turn_id"])
    assert turn.state.value == "failed"
