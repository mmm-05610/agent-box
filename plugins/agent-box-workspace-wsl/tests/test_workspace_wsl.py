"""C2.2 RED/GREEN tests for the WSL live workspace provider skeleton."""
from __future__ import annotations

import tomllib
from pathlib import Path
from types import SimpleNamespace

import pytest

from agent_box.resource_contracts import WorkspaceV1
from agent_box.work_core.models import Ref, RefType
from agent_box.extensions import PluginContext

from agent_box_workspace_wsl import (
    PROVIDER_ID,
    ProjectIdentityConflict,
    ProjectPathRejected,
    WslLiveWorkspaceProvider,
)


@pytest.fixture
def provider():
    return WslLiveWorkspaceProvider()


@pytest.fixture
def host_context():
    return _host_context("/home/dev/project")


def _host_context(project_root: str):
    receipt = SimpleNamespace(
        connection_id="conn-wsl-1",
        revision=1,
        project_root=project_root,
    )
    return SimpleNamespace(
        ref=SimpleNamespace(identity_digest="runtime-digest-1"),
        port=SimpleNamespace(receipt=receipt),
    )


def test_register_and_resolve_keeps_remote_project_authority(provider, host_context):
    registration = provider.register_project(
        connection_id="conn-wsl-1",
        project_id="project-wsl-1",
        remote_path="/home/dev/project",
        runtime_host_ref=host_context,
    )

    ref = provider.make_ref(registration.project_id)
    resolved = provider.resolve(WorkspaceV1.contract_id, ref, context=host_context)

    assert registration.project_id == "project-wsl-1"
    assert registration.connection_id == "conn-wsl-1"
    assert registration.remote_path == "/home/dev/project"
    assert resolved.path == Path("/home/dev/project")
    assert resolved.path.is_absolute()
    assert resolved.source_digest.startswith("wsl-live:")


def test_public_workspace_ref_is_opaque_and_carries_no_host_path_authority(
    provider, host_context
):
    host_context = _host_context("/workspace/app")
    registration = provider.register_project(
        connection_id="conn-wsl-1",
        project_id="project-wsl-1",
        remote_path="/workspace/app",
        runtime_host_ref=host_context,
    )

    ref = provider.make_ref(registration.project_id)

    assert ref.type is RefType.WORKSPACE
    assert ref.provider == PROVIDER_ID
    assert ref.native_id == "project-wsl-1"
    assert ref.uri is None
    assert ref.metadata == {}
    serialized = repr(ref)
    assert "conn-wsl-1" not in serialized
    assert "/workspace/app" not in serialized
    assert "runtime-digest-1" not in serialized


def test_forged_connection_path_or_project_ref_is_rejected(provider, host_context):
    host_context = _host_context("/workspace/app")
    provider.register_project(
        connection_id="conn-wsl-1",
        project_id="project-wsl-1",
        remote_path="/workspace/app",
        runtime_host_ref=host_context,
    )

    forged_refs = (
        Ref(
            RefType.WORKSPACE,
            PROVIDER_ID,
            "project-wsl-1",
            metadata={
                "connection_id": "conn-other",
                "project_id": "project-wsl-1",
                "remote_path": "/workspace/app",
                "workspace_mode": "wsl-live",
                "input_frozen": "false",
            },
        ),
        Ref(
            RefType.WORKSPACE,
            PROVIDER_ID,
            "project-wsl-1",
            metadata={
                "connection_id": "conn-wsl-1",
                "project_id": "project-wsl-1",
                "remote_path": "/workspace/forged",
                "workspace_mode": "wsl-live",
                "input_frozen": "false",
            },
        ),
        Ref(
            RefType.WORKSPACE,
            PROVIDER_ID,
            "project-other",
            metadata={
                "connection_id": "conn-wsl-1",
                "project_id": "project-other",
                "remote_path": "/workspace/app",
                "workspace_mode": "wsl-live",
                "input_frozen": "false",
            },
        ),
    )

    for forged in forged_refs:
        with pytest.raises(ProjectIdentityConflict):
            provider.resolve(WorkspaceV1.contract_id, forged, context=host_context)


def test_remote_path_mapping_is_not_a_local_copy(provider, host_context):
    registration = provider.register_project(
        connection_id="conn-wsl-1",
        project_id="project-wsl-1",
        remote_path="/home/dev/project",
        runtime_host_ref=host_context,
    )

    assert provider.map_workspace_path(registration.project_id, "src/main.py") == (
        "/home/dev/project/src/main.py"
    )
    assert not hasattr(
        provider.resolve(
            WorkspaceV1.contract_id,
            provider.make_ref(registration.project_id),
            context=host_context,
        ),
        "local_copy",
    )


def test_registration_and_mapping_reject_path_escape(provider, host_context):
    host_context = _host_context("/workspace/app")
    with pytest.raises(ProjectPathRejected):
        provider.register_project(
            connection_id="conn-wsl-1",
            project_id="project-wsl-1",
            remote_path="/workspace/../outside",
            runtime_host_ref=host_context,
        )
    provider.register_project(
        connection_id="conn-wsl-1",
        project_id="project-wsl-1",
        remote_path="/workspace/app",
        runtime_host_ref=host_context,
    )
    with pytest.raises(ProjectPathRejected):
        provider.map_workspace_path("project-wsl-1", "../outside")


def test_list_remote_projects_reports_non_secret_identity_rows(provider):
    provider.register_project(
        connection_id="conn-wsl-1",
        project_id="project-wsl-1",
        remote_path="/workspace/app",
        runtime_host_ref=_host_context("/workspace/app"),
    )
    provider.register_project(
        connection_id="conn-wsl-1",
        project_id="project-wsl-2",
        remote_path="/workspace/other",
        runtime_host_ref=_host_context("/workspace/other"),
    )

    listing = provider.list_remote_projects()

    assert listing == [
        {
            "project_id": "project-wsl-1",
            "connection_id": "conn-wsl-1",
            "connection_revision": 1,
            "remote_path": "/workspace/app",
        },
        {
            "project_id": "project-wsl-2",
            "connection_id": "conn-wsl-1",
            "connection_revision": 1,
            "remote_path": "/workspace/other",
        },
    ]
    # No runtime ref digest or other provider-private identity leaks through
    # the GUI enumeration surface.
    serialized = repr(listing)
    assert "runtime-digest-1" not in serialized


def test_list_remote_projects_is_empty_without_registrations(provider):
    assert provider.list_remote_projects() == []


def test_plugin_registration_exposes_a_registry_provider_descriptor(tmp_path):
    from agent_box_workspace_wsl.plugin import WorkspaceWslPlugin

    registration = WorkspaceWslPlugin().build(
        PluginContext("2.0.0a1", tmp_path, tmp_path / "plugin-data")
    )
    provider = registration.resource_providers[0]
    descriptor = provider.descriptor()
    assert descriptor.id == "wsl-live-workspace"
    assert descriptor.version == "0.1.0a1"


def test_workspace_plugin_declares_canonical_installed_entry_point():
    pyproject = Path(__file__).parents[1] / "pyproject.toml"
    metadata = tomllib.loads(pyproject.read_text(encoding="utf-8"))

    entry_points = metadata["project"]["entry-points"]["agent_box.plugins"]
    assert entry_points["workspace-wsl"] == "agent_box_workspace_wsl.plugin:create_plugin"
