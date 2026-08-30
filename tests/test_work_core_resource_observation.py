from datetime import datetime, timezone
from pathlib import Path

import pytest

from agent_box.resource_contracts import WorkspaceV1
from agent_box.work_core import ExecutionStartReceipt, ExecutionStartRequest
from agent_box.work_core.errors import DispatchFailed
from agent_box.work_core.events import EventType
from agent_box.work_core.models import Ref, RefType
from agent_box.work_core.registry import ExtensionRegistry, ProviderDescriptor
from agent_box.work_core.repository import CoreRepository
from agent_box.work_core.services import ExecutionService, WorkService
from agent_box.work_core.projection import ExecutionProjection, Freshness, Phase


class ObservationResourceProvider:
    supported_contract_ids = frozenset({WorkspaceV1.contract_id})

    def resolve(self, contract_id, ref):
        return WorkspaceV1(Path("/tmp/work"), "sha256:work")


class ObservationExecutionProvider:
    def descriptor(self):
        return ProviderDescriptor("fake-observer", "Fake Observer", "test")

    def capabilities(self):
        return {"start": "supported", "observe": "supported"}

    def input_limits(self):
        return {WorkspaceV1.contract_id: (1, 1)}

    def start(self, request):
        assert isinstance(request, ExecutionStartRequest)
        return ExecutionStartReceipt(
            request.execution_id, request.dispatch_id, request.inputs_digest
        )

    def observe(self, native_ref):
        return native_ref


def _setup(tmp_agent_box_home, *, selected_ref=None):
    repo = CoreRepository()
    work = WorkService(repo).create_work("observe resource state")
    service = ExecutionService(repo)
    execution = service.create_execution(work.id, "fake-observer", responsibility_intent="observe resource")
    registry = ExtensionRegistry()
    registry.register_execution_provider(ObservationExecutionProvider())
    registry.register_resource_provider("fake-resource", ObservationResourceProvider())
    ref = selected_ref or Ref(
        RefType.WORKSPACE, "fake-resource", "workspace-1"
    )
    service.dispatch_execution(execution.id, ((WorkspaceV1.contract_id, ref),), registry, "dispatch-1")
    return repo, service, execution, ref


def test_resource_state_change_is_material_even_when_projection_is_same_and_dedupes(tmp_agent_box_home):
    repo, service, execution, ref = _setup(tmp_agent_box_home)
    active = ExecutionProjection(Phase.ACTIVE, None, True, Freshness.OBSERVED, datetime.now(timezone.utc))
    evidence = Ref(RefType.ARTIFACT, "fake-resource", "evidence-1")
    service.apply_observation(execution.id, active, resource_states=((ref, "projected", evidence),))
    first_events = repo.list_events(execution.id)
    assert any(
        event.type is EventType.EXECUTION_PROJECTION_CHANGED
        and event.data.get("observation_kind") == "resource"
        and event.data.get("resource_state") == "projected"
        for event in first_events
    )
    count = len(first_events)
    service.apply_observation(execution.id, active, resource_states=((ref, "projected", evidence),))
    assert len(repo.list_events(execution.id)) == count
    service.apply_observation(execution.id, active, resource_states=((ref, "consumed"),))
    assert len(repo.list_events(execution.id)) == count + 1


def test_resource_observation_requires_fixed_input_and_bounded_state(tmp_agent_box_home):
    repo, service, execution, _ = _setup(tmp_agent_box_home)
    unknown = Ref(RefType.WORKSPACE, "fake-resource", "not-selected")
    projection = ExecutionProjection(Phase.UNKNOWN, None, None, Freshness.STALE, datetime.now(timezone.utc))
    with pytest.raises(ValueError, match="fixed INPUT"):
        service.apply_observation(execution.id, projection, resource_states=((unknown, "projected"),))
    selected = repo.list_input_refs(execution.id)[0][1]
    with pytest.raises(ValueError, match="non-empty"):
        service.apply_observation(execution.id, projection, resource_states=((selected, ""),))


def test_resource_event_uses_bounded_identity_digest_for_large_valid_ref_metadata(
    tmp_agent_box_home,
):
    ref = Ref(
        RefType.WORKSPACE,
        "fake-resource",
        "workspace-large-metadata",
        metadata={"first": "a" * 200, "second": "b" * 200},
    )
    repo, service, execution, ref = _setup(
        tmp_agent_box_home, selected_ref=ref
    )
    active = ExecutionProjection(
        Phase.ACTIVE,
        None,
        True,
        Freshness.OBSERVED,
        datetime.now(timezone.utc),
    )

    service.apply_observation(
        execution.id, active, resource_states=((ref, "projected"),)
    )

    resource_event = next(
        event
        for event in repo.list_events(execution.id)
        if event.data.get("observation_kind") == "resource"
    )
    assert resource_event.data["ref_identity_digest"].startswith("sha256:")
    assert "ref_metadata" not in resource_event.data
