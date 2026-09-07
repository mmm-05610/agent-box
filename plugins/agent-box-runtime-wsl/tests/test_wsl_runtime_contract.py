"""C2.2 contract tests; no WSL, credentials, or model requests."""

import pytest

from agent_box.protocols.runtime import RuntimeHostV1
from agent_box.protocols.runtime.protocol import CapabilitySet, CapabilityStatus, CompositionRejected
from agent_box.extensions import PluginContext
from agent_box_runtime_wsl.plugin import RuntimeWslPlugin

from agent_box_runtime_wsl.provider import (
    WslPathError,
    WslConnectionReceipt,
    WslRuntimeIdentity,
    WslRuntimeProvider,
    WslWorkspacePath,
)


def test_provider_describes_a_wsl_primitive_without_business_authority():
    provider = WslRuntimeProvider()
    identity = WslRuntimeIdentity(distribution="Ubuntu", user="maoqh", arch="x86_64")

    runtime = provider.describe(identity)

    assert runtime.provider_id == "runtime-host-wsl"
    assert runtime.identity == identity
    assert runtime.capabilities == frozenset({"bounded-process", "byte-duplex", "workspace-path"})
    assert not hasattr(runtime, "database")
    assert not hasattr(runtime, "profile")
    assert not hasattr(runtime, "credential")


@pytest.mark.parametrize("value", ["", "../Ubuntu", "Ubuntu\nwest", "Ubuntu\x00"])
def test_identity_rejects_unsafe_distribution(value):
    with pytest.raises(ValueError, match="distribution"):
        WslRuntimeIdentity(distribution=value, user="maoqh", arch="x86_64")


@pytest.mark.parametrize("value", ["", "user/name", "user\n", "user\x00"])
def test_identity_rejects_unsafe_user(value):
    with pytest.raises(ValueError, match="user"):
        WslRuntimeIdentity(distribution="Ubuntu", user=value, arch="x86_64")


def test_workspace_path_requires_absolute_normalized_wsl_path():
    assert WslWorkspacePath("/home/maoqh/project").value == "/home/maoqh/project"

    for value in ("relative/project", "/home/../etc", "/home/project/", "/home/project\x00"):
        with pytest.raises(WslPathError):
            WslWorkspacePath(value)


def test_workspace_path_cannot_escape_with_dot_segments():
    with pytest.raises(WslPathError, match="traversal"):
        WslWorkspacePath("/home/maoqh/../../etc")


def test_provider_does_not_probe_or_execute_when_describing():
    provider = WslRuntimeProvider()
    identity = WslRuntimeIdentity(distribution="Ubuntu", user="maoqh", arch="x86_64")

    runtime = provider.describe(identity)

    assert runtime.workspace_root is None
    assert provider.calls == []


def test_provider_resolves_the_typed_runtime_host_v1_port_without_connecting():
    provider = WslRuntimeProvider()
    identity = WslRuntimeIdentity(distribution="Ubuntu", user="maoqh", arch="x86_64")

    with pytest.raises(CompositionRejected):
        provider.resolve(identity)
    assert provider.calls == []


def test_plugin_registration_exposes_a_registry_provider_descriptor(tmp_path):
    registration = RuntimeWslPlugin().build(
        PluginContext("2.0.0a1", tmp_path, tmp_path / "plugin-data")
    )
    provider = registration.resource_providers[0]
    descriptor = provider.descriptor()
    assert descriptor.id == "runtime-host-wsl"
    assert descriptor.version == "0.1.0a1"


def test_runtime_ref_is_bound_to_an_exact_verified_c1_receipt():
    provider = WslRuntimeProvider()
    receipt = WslConnectionReceipt(
        connection_id="conn-wsl-1",
        revision=4,
        fingerprint="sha256:" + "a" * 64,
        distribution="Ubuntu",
        user="maoqh",
        os="Linux",
        arch="x86_64",
        project_root="/home/maoqh/project",
        capabilities=frozenset({"worker_bootstrap"}),
    )

    class HostAuthority:
        def resolve_wsl_receipt(self, connection_id: str, revision: int):
            assert (connection_id, revision) == (receipt.connection_id, receipt.revision)
            return receipt

    resolved = provider.resolve_verified_receipt(
        HostAuthority(),
        connection_id=receipt.connection_id,
        revision=receipt.revision,
    )

    assert isinstance(resolved, RuntimeHostV1)
    assert resolved.ref.identity_digest.startswith("sha256:")
    assert resolved.ref.identity_digest != provider.ref_for(
        WslRuntimeIdentity("Ubuntu", "maoqh", "x86_64")
    ).identity_digest
    assert resolved.port.receipt == receipt
