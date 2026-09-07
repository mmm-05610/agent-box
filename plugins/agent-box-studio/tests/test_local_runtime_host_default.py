"""Auditable default RuntimeHost selection for LOCAL sessions.

Production installs load every registered runtime provider, so an omitted
launch selection is ambiguous exactly when more than one runtime host is
installed.  Local sessions must resolve the omission to the auditable
local default (mirroring the terminal/sandbox auditable defaults) and must
reject a WSL runtime host for a local Session: the Session freezes one
execution environment kind.
"""
from __future__ import annotations

import pytest

from agent_box.extensions.bootstrap import build_extension_environment
from agent_box.protocols.runtime import RuntimeHostV1
from agent_box.protocols.session import SESSION_TURN_INPUT_CONTRACT_ID
from agent_box.resource_contracts import WorkspaceV1
from agent_box.work_core.registry import (
    ExecutionStartReceipt,
    ProviderDescriptor,
    RecoverySupport,
    ResolvedExecutionInput,
)
from agent_box_studio.config import StudioConfig
from agent_box_studio.server.app import create_app
from agent_box_studio.service import LaunchSelectionError, StudioService
from agent_box_studio.testing import FakeTurnExecutionProvider

from conftest import TEST_TOKEN


class RuntimeHostRequiringFake(FakeTurnExecutionProvider):
    """The fake vertical the real Codex chain uses: it consumes the frozen
    RuntimeHost Ref as a dispatch input."""

    def input_limits(self):
        return {
            **super().input_limits(),
            RuntimeHostV1.contract_id: (1, 1),
        }


def _installed_environment():
    """The production install state: every registered plugin loads."""
    return build_extension_environment()


def _runtime_provider_ids(environment) -> set[str]:
    return {
        provider.descriptor().id
        for provider in environment.registry.resource_providers()
        if RuntimeHostV1.contract_id in set(getattr(provider, "supported_contract_ids", ()) or ())
    }


def test_local_session_defaults_to_the_local_runtime_host(studio_home, tmp_path):
    if "runtime-host-wsl" not in _runtime_provider_ids(_installed_environment()):
        pytest.skip("runtime-wsl plugin is not installed in this environment")
    environment = _installed_environment()
    environment.registry.register_execution_provider(RuntimeHostRequiringFake())
    project = tmp_path / "local-project"
    project.mkdir()
    workspace = next(
        provider
        for provider in environment.registry.resource_providers()
        if provider.descriptor().id == "local-live-workspace"
    )
    workspace.register_project(str(project))
    app = create_app(
        StudioConfig(worker_mode="inline"),
        environment=environment,
        token=TEST_TOKEN,
    )
    service: StudioService = app.state.service
    created = service.create_session(
        idempotency_key="default-runtime-1",
        title="local default",
        project_path=str(project),
    )
    session = created["session"]

    result = service.submit_turn(
        session.session_id,
        idempotency_key="default-runtime-turn-1",
        input_text="run locally",
        execution_provider_id="fake-harness",
    )
    # Inline worker mode executes the run before returning.
    turn = service._store.get_turn(session.session_id, result["turn_id"])
    assert turn.state.value == "completed"
    assert turn.binding.runtime_host_ref is not None
    assert turn.binding.runtime_host_ref.provider == "runtime-host-local"


def test_local_session_rejects_a_wsl_runtime_host(studio_home, tmp_path):
    if "runtime-host-wsl" not in _runtime_provider_ids(_installed_environment()):
        pytest.skip("runtime-wsl plugin is not installed in this environment")
    environment = _installed_environment()
    environment.registry.register_execution_provider(RuntimeHostRequiringFake())
    project = tmp_path / "local-project-2"
    project.mkdir()
    workspace = next(
        provider
        for provider in environment.registry.resource_providers()
        if provider.descriptor().id == "local-live-workspace"
    )
    workspace.register_project(str(project))
    app = create_app(
        StudioConfig(worker_mode="inline"),
        environment=environment,
        token=TEST_TOKEN,
    )
    service: StudioService = app.state.service
    created = service.create_session(
        idempotency_key="default-runtime-2",
        title="local wsl reject",
        project_path=str(project),
    )
    session = created["session"]

    with pytest.raises(LaunchSelectionError):
        service.submit_turn(
            session.session_id,
            idempotency_key="default-runtime-turn-2",
            input_text="wrong environment",
            execution_provider_id="fake-harness",
            runtime_host="runtime-host-wsl",
        )
