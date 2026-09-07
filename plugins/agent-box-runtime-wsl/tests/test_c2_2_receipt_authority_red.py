"""Formal C2.2 RED tests for WSL Host/workspace receipt authority.

These tests are deliberately offline.  They encode the missing authority
boundary: a WSL identity is not a Host verification, a receipt ref must be
resolvable by exact equality, and a workspace must be bound to that receipt.
"""
from __future__ import annotations

import pytest
from pathlib import Path

from agent_box.resource_contracts import WorkspaceV1
from agent_box.protocols.runtime import HostTransportOperation
from agent_box.protocols.runtime.protocol import CompositionRejected
from agent_box_runtime_wsl import (
    WslConnectionReceipt,
    WslRuntimeIdentity,
    WslRuntimeProvider,
)
from agent_box_workspace_wsl import (
    ProjectIdentityConflict,
    WslLiveWorkspaceProvider,
)
from agent_box.extensions import PluginContext


def _receipt(*, project_root: str = "/home/dev/project") -> WslConnectionReceipt:
    return WslConnectionReceipt(
        connection_id="conn-wsl-1",
        revision=7,
        fingerprint="sha256:" + "b" * 64,
        distribution="Ubuntu",
        user="dev",
        os="Linux",
        arch="x86_64",
        project_root=project_root,
        capabilities=frozenset({"worker_bootstrap"}),
    )


class _HostAuthority:
    def __init__(self, receipt: WslConnectionReceipt) -> None:
        self.receipt = receipt

    def resolve_wsl_receipt(self, connection_id: str, revision: int) -> WslConnectionReceipt:
        if (connection_id, revision) != (self.receipt.connection_id, self.receipt.revision):
            raise LookupError("receipt not found")
        return self.receipt


class _TypedBridge:
    def __init__(self) -> None:
        self.operations = []

    def submit(self, operation: HostTransportOperation) -> str:
        self.operations.append(operation)
        return "bridge-operation-1"


def _runtime(*, project_root: str = "/home/dev/project"):
    receipt = _receipt(project_root=project_root)
    return WslRuntimeProvider().resolve_verified_receipt(
        _HostAuthority(receipt),
        connection_id=receipt.connection_id,
        revision=receipt.revision,
    )


def test_identity_only_resolution_is_rejected_without_host_verified_receipt():
    provider = WslRuntimeProvider()
    identity = WslRuntimeIdentity("Ubuntu", "dev", "x86_64")

    with pytest.raises((CompositionRejected, TypeError, ValueError)):
        provider.resolve(identity)


def test_receipt_ref_is_exactly_resolvable_and_remains_receipt_backed():
    provider = WslRuntimeProvider()
    receipt = _receipt()
    resolved = provider.resolve_verified_receipt(
        _HostAuthority(receipt),
        connection_id=receipt.connection_id,
        revision=receipt.revision,
    )

    round_tripped = provider.resolve_ref(resolved.ref)

    assert round_tripped.receipt == receipt
    assert round_tripped.ref == resolved.ref


def test_workspace_resolution_requires_the_host_receipt_binding():
    runtime = _runtime()
    workspace = WslLiveWorkspaceProvider()
    workspace.register_project(
        connection_id="conn-wsl-1",
        project_id="project-wsl-1",
        remote_path="/home/dev/project",
        runtime_host_ref=runtime,
    )
    ref = workspace.make_ref("project-wsl-1")

    with pytest.raises(ProjectIdentityConflict):
        workspace.resolve(WorkspaceV1.contract_id, ref)

    resolved = workspace.resolve(WorkspaceV1.contract_id, ref, context=runtime)
    assert resolved.path.as_posix() == "/home/dev/project"


def test_workspace_rejects_a_receipt_for_a_different_exact_project_root():
    registered_runtime = _runtime()
    wrong_runtime = _runtime(project_root="/home/dev/other-project")
    workspace = WslLiveWorkspaceProvider()
    workspace.register_project(
        connection_id="conn-wsl-1",
        project_id="project-wsl-1",
        remote_path="/home/dev/project",
        runtime_host_ref=registered_runtime,
    )

    with pytest.raises(ProjectIdentityConflict):
        workspace.resolve(
            WorkspaceV1.contract_id,
            workspace.make_ref("project-wsl-1"),
            context=wrong_runtime,
        )


def test_verified_runtime_delegates_only_typed_transport_operations_to_host_bridge():
    receipt = _receipt()
    bridge = _TypedBridge()

    class HostAuthority(_HostAuthority):
        def transport_for_wsl(self, connection_id: str, revision: int):
            assert (connection_id, revision) == (receipt.connection_id, receipt.revision)
            return bridge

    runtime = WslRuntimeProvider().resolve_verified_receipt(
        HostAuthority(receipt),
        connection_id=receipt.connection_id,
        revision=receipt.revision,
    )
    operation = HostTransportOperation(
        attempt_key="attempt-1",
        spawn_token="spawn-1",
        spec_digest="sha256:" + "c" * 64,
        transport_kind="wsl-host-bridge@1",
        sealed_payload="opaque-operation",
    )

    assert runtime.transport.submit(operation) == "bridge-operation-1"
    assert bridge.operations == [operation]


def test_canonical_runtime_plugin_injects_provider_neutral_host_operations():
    from agent_box_runtime_wsl.plugin import RuntimeWslPlugin

    host_operations = object()
    registration = RuntimeWslPlugin().build(
        PluginContext("2.0.0a1", Path("/tmp"), Path("/tmp"), host_operations)
    )
    provider = registration.resource_providers[0]
    assert provider.host_operations is host_operations


def test_runtime_resolves_connection_through_injected_host_port_with_exact_inputs():
    class HostOperations:
        def __init__(self):
            self.calls = []

        def resolve_connection(self, connection_id, revision, project_identity):
            self.calls.append((connection_id, revision, project_identity))
            return _receipt()

    host_operations = HostOperations()
    runtime = WslRuntimeProvider(host_operations).resolve_connection(
        "conn-wsl-1", 7, "project-identity-digest"
    )

    assert runtime.port.receipt == _receipt()
    assert host_operations.calls == [("conn-wsl-1", 7, "project-identity-digest")]
