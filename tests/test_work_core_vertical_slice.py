from datetime import datetime, timezone

import pytest

from agent_box.work_core.errors import ExecutionNotResumable
from agent_box.work_core.models import Ref, RefType
from agent_box.work_core.projection import ExecutionProjection, Freshness, Outcome, Phase
from agent_box.work_core.registry import ExtensionRegistry, ProviderDescriptor
from agent_box.work_core.repository import CoreRepository, RefRelation
from agent_box.work_core.services import ExecutionService, WorkService


def now():
    return datetime.now(timezone.utc)


class FakeCodexProvider:
    def __init__(self):
        self.resume_requests = []

    def descriptor(self):
        return ProviderDescriptor("codex-cli", "Fake Codex", "test")

    def capabilities(self):
        return {"start": "supported", "observe": "supported", "resume": "supported"}

    def start(self, request):
        return request

    def observe(self, native_ref):
        return native_ref

    def resume(self, request):
        self.resume_requests.append(request)
        return "resumed-process"


def test_phase_one_service_slice_preserves_execution_through_resume_and_explicit_close(tmp_agent_box_home):
    repo = CoreRepository(); works = WorkService(repo); executions = ExecutionService(repo)
    work = works.create_work("safe coding work")
    execution = executions.create_execution(work.id, "codex-cli")
    executions.request_dispatch(execution.id, "dispatch-1")
    active = ExecutionProjection(Phase.ACTIVE, None, True, Freshness.OBSERVED, now())
    executions.apply_observation(execution.id, active, native_refs=[Ref(RefType.SESSION, "codex-cli", "thread-1")])
    completed = ExecutionProjection(Phase.TERMINAL, Outcome.SUCCEEDED, True, Freshness.OBSERVED, now())
    executions.apply_observation(execution.id, completed, output_refs=[Ref(RefType.ARTIFACT, "codex-cli", "result-1")])
    assert repo.get_work(work.id).lifecycle.value == "open"
    registry = ExtensionRegistry(); provider = FakeCodexProvider(); registry.register_execution_provider(provider)
    assert executions.resume_execution(execution.id, registry, {"thread": "thread-1"}) == "resumed-process"
    assert provider.resume_requests == [{"thread": "thread-1"}]
    assert repo.get_execution(execution.id).id == execution.id
    assert {ref.native_id for ref in repo.list_refs(execution.id)} == {"thread-1", "result-1"}
    assert works.complete_work(work.id, "user accepts result").lifecycle.value == "completed"


def test_restart_reload_and_resume_rejection_are_explicit(tmp_agent_box_home):
    repo = CoreRepository(); work = WorkService(repo).create_work("restart")
    execution = ExecutionService(repo).create_execution(work.id, "codex-cli")
    # A new repository object represents a process/service restart over SQLite.
    reloaded = CoreRepository().get_execution(execution.id)
    assert reloaded.id == execution.id and reloaded.projection.phase is Phase.UNKNOWN
    registry = ExtensionRegistry(); registry.register_execution_provider(FakeCodexProvider())
    with pytest.raises(ExecutionNotResumable):
        ExecutionService(CoreRepository()).resume_execution(execution.id, registry, {})
