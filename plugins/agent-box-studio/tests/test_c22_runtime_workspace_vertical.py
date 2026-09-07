"""C2.2 production-composition RED tests.

These tests deliberately exercise the business service with the WSL resource
providers.  They are not renderer ports or an in-process replacement for the
HostBridge; the host fixture exposes only the typed provider-neutral seam that
the production bridge will implement.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import threading
from types import SimpleNamespace

import pytest

from conftest import production_entry_points

from agent_box.extensions.bootstrap import build_extension_environment
from agent_box.protocols.runtime import HostTransportOperation, RuntimeHostRef, RuntimeHostV1
from agent_box.resource_contracts import WorkspaceV1
from agent_box.work_core.registry import (
    ExecutionStartReceipt,
    ProviderDescriptor,
    RecoverySupport,
    ResolvedExecutionInput,
)
from agent_box_runtime_wsl import WslConnectionReceipt, WslRuntimeProvider
from agent_box_studio.config import StudioConfig
from agent_box_studio.server.app import create_app
from agent_box_studio.service import StudioService
from agent_box_workspace_wsl import WslLiveWorkspaceProvider


TEST_TOKEN = "studio-c22-token-0123456789abcdef"

# The workspace provider is constructed by these tests with a controlled
# registry path and the exact host seam under test; its production entry
# point is excluded for the duration so the SAME production class can be
# registered deterministically (never a test double).
_TEST_ENTRY_POINTS = production_entry_points(exclude=frozenset({"workspace-wsl"}))


def _receipt() -> WslConnectionReceipt:
    return WslConnectionReceipt(
        connection_id="conn-c22-1",
        revision=3,
        fingerprint="sha256:" + "d" * 64,
        distribution="Ubuntu",
        user="dev",
        os="Linux",
        arch="x86_64",
        project_root="/home/dev/project",
        capabilities=frozenset({"worker_bootstrap"}),
    )


class HostAuthority:
    def __init__(self) -> None:
        self.receipt = _receipt()
        self.connection_calls: list[tuple[str, int, str]] = []
        self.runtime_ref_calls: list[tuple[RuntimeHostRef, str]] = []
        self.transport_calls: list[tuple[str, int]] = []
        self.operations: list[HostTransportOperation] = []

    def resolve_connection(self, connection_id: str, revision: int, project_identity: str):
        self.connection_calls.append((connection_id, revision, project_identity))
        assert (connection_id, revision, project_identity) == (
            self.receipt.connection_id,
            self.receipt.revision,
            "project-wsl-1",
        )
        return self.receipt

    def resolve_runtime_ref(self, ref: RuntimeHostRef, project_identity: str):
        self.runtime_ref_calls.append((ref, project_identity))
        if project_identity != "project-wsl-1":
            raise LookupError("unknown remote project")
        return self.receipt

    def transport_for_wsl(self, connection_id: str, revision: int):
        self.transport_calls.append((connection_id, revision))
        return self

    def submit(self, operation: HostTransportOperation):
        self.operations.append(operation)
        return f"restarted:{operation.attempt_key}"


class ConnectionResolveOnlyAuthority:
    """The currently frozen HostBridge connectionResolve surface only."""

    def __init__(self) -> None:
        self.receipt = _receipt()
        self.connection_calls: list[tuple[str, int, str]] = []

    def resolve_connection(self, connection_id, revision, project_identity):
        self.connection_calls.append((connection_id, revision, project_identity))
        if (connection_id, revision, project_identity) != (
            self.receipt.connection_id,
            self.receipt.revision,
            "project-wsl-1",
        ):
            raise LookupError("unknown exact Connection/Project binding")
        return self.receipt


@pytest.fixture
def host():
    return HostAuthority()


def test_runtime_ref_re_resolves_after_provider_restart_through_host_authority():
    host = HostAuthority()
    first = WslRuntimeProvider(host).resolve_connection(
        "conn-c22-1", 3, "project-wsl-1"
    )

    restarted = WslRuntimeProvider(host)
    restored = restarted.resolve_ref(first.ref, project_identity="project-wsl-1")

    assert restored.receipt == host.receipt
    assert host.runtime_ref_calls == [(first.ref, "project-wsl-1")]


def test_restarted_runtime_ref_reconnects_typed_transport_through_host_authority():
    host = HostAuthority()
    first = WslRuntimeProvider(host).resolve_connection(
        "conn-c22-1", 3, "project-wsl-1"
    )
    host.transport_calls.clear()
    restarted = WslRuntimeProvider(host)

    restored = restarted.resolve_ref(first.ref, project_identity="project-wsl-1")
    operation = HostTransportOperation(
        attempt_key="attempt-restart",
        spawn_token="spawn-restart",
        spec_digest="sha256:" + "e" * 64,
        transport_kind="wsl-host-bridge@1",
        sealed_payload="opaque",
    )

    assert restored.transport.submit(operation) == "restarted:attempt-restart"
    assert host.transport_calls == [("conn-c22-1", 3)]


def test_wsl_workspace_resolution_revalidates_opaque_ref_via_host_authority():
    host = HostAuthority()
    runtime = WslRuntimeProvider(host).resolve_connection(
        "conn-c22-1", 3, "project-wsl-1"
    )
    workspace = WslLiveWorkspaceProvider(host_operations=host)
    registration = workspace.register_project(
        connection_id="conn-c22-1",
        project_id="project-wsl-1",
        remote_path="/home/dev/project",
        runtime_host_ref=runtime,
    )

    resolved = workspace.resolve(
        WorkspaceV1.contract_id,
        workspace.make_ref(registration.project_id),
        context=SimpleNamespace(execution_id="exec-c22-1"),
    )

    assert resolved.path == Path("/home/dev/project")
    assert host.connection_calls[-1] == ("conn-c22-1", 3, "project-wsl-1")


def test_wsl_project_ref_survives_provider_restart_without_local_path_authority(
    host, tmp_path
):
    runtime = WslRuntimeProvider(host).resolve_connection(
        "conn-c22-1", 3, "project-wsl-1"
    )
    registry_path = tmp_path / "wsl-projects.json"
    first = WslLiveWorkspaceProvider(
        host_operations=host, registry_path=registry_path
    )
    first.register_project(
        connection_id="conn-c22-1",
        project_id="project-wsl-1",
        remote_path="/home/dev/project",
        runtime_host_ref=runtime,
    )

    restarted = WslLiveWorkspaceProvider(
        host_operations=host, registry_path=registry_path
    )
    ref = restarted.make_ref("project-wsl-1")
    resolved = restarted.resolve(
        WorkspaceV1.contract_id,
        ref,
        context=SimpleNamespace(execution_id="exec-c22-restart"),
    )

    assert ref.uri is None
    assert ref.metadata == {}
    assert resolved.path == Path("/home/dev/project")


def test_durable_runtime_and_workspace_refs_revalidate_via_connection_resolve_only(
    tmp_path,
):
    issuing_host = HostAuthority()
    runtime = WslRuntimeProvider(issuing_host).resolve_connection(
        "conn-c22-1", 3, "project-wsl-1"
    )
    registry_path = tmp_path / "wsl-projects.json"
    WslLiveWorkspaceProvider(
        host_operations=issuing_host,
        registry_path=registry_path,
    ).register_project(
        connection_id="conn-c22-1",
        project_id="project-wsl-1",
        remote_path="/home/dev/project",
        runtime_host_ref=runtime,
    )

    restarted_host = ConnectionResolveOnlyAuthority()
    restarted_workspace = WslLiveWorkspaceProvider(
        host_operations=restarted_host,
        registry_path=registry_path,
    )
    runtime_input_ref = restarted_workspace.runtime_host_input_ref("project-wsl-1")
    restarted_runtime = WslRuntimeProvider(restarted_host)

    resolved_runtime = restarted_runtime.resolve(
        RuntimeHostV1.contract_id,
        runtime_input_ref,
    )
    resolved_workspace = restarted_workspace.resolve(
        WorkspaceV1.contract_id,
        restarted_workspace.make_ref("project-wsl-1"),
        context=SimpleNamespace(execution_id="exec-c22-after-restart"),
    )

    assert resolved_runtime.receipt == restarted_host.receipt
    assert resolved_workspace.path == Path("/home/dev/project")
    assert restarted_host.connection_calls == [
        ("conn-c22-1", 3, "project-wsl-1"),
        ("conn-c22-1", 3, "project-wsl-1"),
    ]


@dataclass(frozen=True)
class FakeObservation:
    event_type: str
    payload: dict[str, str]


class ScopedFakeHarness:
    def __init__(self) -> None:
        self.requests = []
        self._observations = {}

    def descriptor(self):
        return ProviderDescriptor("c22-fake-harness", "C2.2 fake harness", "1")

    def capabilities(self):
        return {
            "session_turn_execution": "supported",
            "execution": "supported",
            "start": "supported",
            "network": "offline",
        }

    def input_limits(self):
        from agent_box.protocols.session import SESSION_TURN_INPUT_CONTRACT_ID

        return {
            SESSION_TURN_INPUT_CONTRACT_ID: (1, 1),
            RuntimeHostV1.contract_id: (1, 1),
            WorkspaceV1.contract_id: (1, 1),
        }

    def start(self, request):
        self.requests.append(request)
        workspace = next(
            item.value
            for item in request.resolved_inputs
            if item.contract_id == WorkspaceV1.contract_id
        )
        runtime = next(
            item.value
            for item in request.resolved_inputs
            if item.contract_id == RuntimeHostV1.contract_id
        )
        assert workspace.source_digest.startswith("wsl-live:")
        self.bridge_operation_ref = runtime.transport.submit(
            HostTransportOperation(
                attempt_key=request.dispatch_id,
                spawn_token=request.execution_id,
                spec_digest=request.inputs_digest,
                transport_kind="wsl-host-bridge@1",
                sealed_payload="c22-fake-harness",
            )
        )
        self._observations[request.execution_id] = (
            FakeObservation("TURN_MESSAGE", {"role": "assistant", "text": "wsl fake ok"}),
            FakeObservation("TURN_RESULT", {"outcome": "succeeded"}),
        )
        return ExecutionStartReceipt(
            request.execution_id,
            request.dispatch_id,
            request.inputs_digest,
            RecoverySupport.NONE,
        )

    def observe(self, receipt):
        return self._observations.get(receipt.execution_id, ())


class CancelableScopedFakeHarness(ScopedFakeHarness):
    def __init__(self) -> None:
        super().__init__()
        self.started = threading.Event()
        self.cancelled = threading.Event()
        self._message_sent: set[str] = set()

    def capabilities(self):
        return {
            **super().capabilities(),
            "cancel": "supported",
            "stream": "supported",
        }

    def start(self, request):
        self.requests.append(request)
        runtime = next(
            item.value
            for item in request.resolved_inputs
            if item.contract_id == RuntimeHostV1.contract_id
        )
        self.bridge_operation_ref = runtime.transport.submit(
            HostTransportOperation(
                attempt_key=request.dispatch_id,
                spawn_token=request.execution_id,
                spec_digest=request.inputs_digest,
                transport_kind="wsl-host-bridge@1",
                sealed_payload="c22-cancelable-fake-harness",
            )
        )
        return ExecutionStartReceipt(
            request.execution_id,
            request.dispatch_id,
            request.inputs_digest,
            RecoverySupport.NONE,
        )

    def observe(self, receipt):
        self.started.set()
        if receipt.execution_id not in self._message_sent:
            self._message_sent.add(receipt.execution_id)
            return (
                FakeObservation(
                    "TURN_MESSAGE",
                    {"role": "assistant", "text": "remote execution started"},
                ),
            )
        return ()

    def cancel_dispatch(self, dispatch_id):
        self.cancelled.set()
        return {"state": "terminate_sent", "dispatch_id": dispatch_id}

    def dispatch_state(self, dispatch_id):
        if self.cancelled.is_set():
            return {"state": "terminal", "exit_code": -15, "dispatch_id": dispatch_id}
        return {"state": "running", "dispatch_id": dispatch_id}

    def kill_dispatch(self, dispatch_id):
        self.cancelled.set()
        return {"state": "kill_sent", "dispatch_id": dispatch_id}


def test_studio_dispatches_fake_harness_through_wsl_workspace_and_freezes_scope(
    studio_home, tmp_path
):
    host = HostAuthority()
    environment = build_extension_environment(host_operations=host, entry_points=_TEST_ENTRY_POINTS)
    workspace = WslLiveWorkspaceProvider(
        host_operations=host,
        registry_path=tmp_path / "wsl-projects.json",
    )
    environment.registry.register_resource_provider(workspace)
    fake = ScopedFakeHarness()
    environment.registry.register_execution_provider(fake)
    app = create_app(
        StudioConfig(worker_mode="inline"),
        environment=environment,
        workspace=workspace,
        token=TEST_TOKEN,
    )
    service: StudioService = app.state.service
    service.create_remote_session(
        idempotency_key="c22-session-1",
        title="WSL fake",
        connection_id="conn-c22-1",
        connection_revision=3,
        project_identity="project-wsl-1",
        project_id="project-wsl-1",
        remote_path="/home/dev/project",
    )
    session = service.list_sessions()[0]

    result = service.submit_turn(
        session.session_id,
        idempotency_key="c22-turn-1",
        input_text="inspect the WSL project",
        execution_provider_id="c22-fake-harness",
    )

    assert result["state"] in {"completed", "running"}
    assert len(fake.requests) == 1
    request = fake.requests[0]
    turn = service._store.get_turn(session.session_id, result["turn_id"])
    assert turn.state.value == "completed"
    assert turn.terminal_outcome.value == "succeeded"
    assert request.execution_id in turn.execution_ids
    assert session.workspace_ref.provider == "wsl-live-workspace"
    assert turn.binding.runtime_host_ref is not None
    assert turn.binding.runtime_host_ref.provider == "runtime-host-wsl"
    assert turn.binding.runtime_host_ref.uri is None
    assert "path" not in turn.binding.runtime_host_ref.metadata
    execution = service._repository.get_execution(request.execution_id)
    assert execution.work_id == session.work_id
    workspace_input = next(
        item
        for item in request.resolved_inputs
        if item.contract_id == WorkspaceV1.contract_id
    )
    runtime_input = next(
        item
        for item in request.resolved_inputs
        if item.contract_id == RuntimeHostV1.contract_id
    )
    assert workspace_input.ref.native_id == session.project_identity
    assert runtime_input.value.receipt.connection_id == "conn-c22-1"
    assert runtime_input.value.receipt.revision == 3
    assert fake.bridge_operation_ref == f"restarted:{request.dispatch_id}"
    assert host.operations[-1].attempt_key == request.dispatch_id
    assert host.operations[-1].spawn_token == request.execution_id
    assert host.connection_calls == [
        ("conn-c22-1", 3, "project-wsl-1"),
        ("conn-c22-1", 3, "project-wsl-1"),
        ("conn-c22-1", 3, "project-wsl-1"),
    ]
    transcript = service.transcript(session.session_id)
    assert any(
        event.event_type == "assistant.message"
        and event.payload.get("text") == "wsl fake ok"
        for event in transcript
    )
    assert sum(event.event_type == "TURN_TERMINAL" for event in transcript) == 1


def test_studio_cancel_request_stops_host_bridge_backed_fake_execution(
    studio_home, tmp_path
):
    host = HostAuthority()
    environment = build_extension_environment(host_operations=host, entry_points=_TEST_ENTRY_POINTS)
    workspace = WslLiveWorkspaceProvider(
        host_operations=host,
        registry_path=tmp_path / "wsl-projects.json",
    )
    environment.registry.register_resource_provider(workspace)
    fake = CancelableScopedFakeHarness()
    environment.registry.register_execution_provider(fake)
    app = create_app(
        StudioConfig(worker_mode="thread", poll_interval=0.001),
        environment=environment,
        workspace=workspace,
        token=TEST_TOKEN,
    )
    service: StudioService = app.state.service
    service.create_remote_session(
        idempotency_key="c22-cancel-session",
        title="WSL cancel",
        connection_id="conn-c22-1",
        connection_revision=3,
        project_identity="project-wsl-1",
        project_id="project-wsl-1",
        remote_path="/home/dev/project",
    )
    session = service.list_sessions()[0]

    result = service.submit_turn(
        session.session_id,
        idempotency_key="c22-cancel-turn",
        input_text="start a cancellable remote task",
        execution_provider_id="c22-fake-harness",
    )
    assert fake.started.wait(timeout=2)
    run = service._runs[result["turn_id"]]

    try:
        cancel = service.cancel_turn(session.session_id, result["turn_id"])
        assert cancel == {"turn_id": result["turn_id"], "cancel": "terminate_sent"}
        assert run.done.wait(timeout=2)
    finally:
        service.stop_worker()

    turn = service._store.get_turn(session.session_id, result["turn_id"])
    assert turn.state.value == "failed"
    assert turn.terminal_outcome.value == "cancelled"
    assert fake.cancelled.is_set()
    assert host.operations[-1].spawn_token == run.execution_id
    transcript = service.transcript(session.session_id)
    assert any(event.event_type == "CANCEL_REQUESTED" for event in transcript)
    assert sum(event.event_type == "TURN_TERMINAL" for event in transcript) == 1


def test_wsl_runtime_and_workspace_fail_closed_without_injected_host():
    with pytest.raises(Exception):
        WslRuntimeProvider().resolve_connection("conn-c22-1", 3, "project-wsl-1")

    workspace = WslLiveWorkspaceProvider()
    with pytest.raises(Exception):
        workspace.resolve(
            WorkspaceV1.contract_id,
            workspace.make_ref("missing-project"),
            context=SimpleNamespace(execution_id="exec-c22-1"),
        )
