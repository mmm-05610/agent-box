from datetime import datetime, timezone

from agent_box.work_core.events import EventType
from agent_box.work_core.models import Ref, RefType
from agent_box.work_core.projection import ExecutionProjection, Freshness, Outcome, Phase
from agent_box.work_core.repository import CoreRepository
from agent_box.work_core.services import ExecutionService, WorkService


def test_work_lifecycle_is_explicit_and_independent_from_terminal_execution(tmp_agent_box_home):
    repo = CoreRepository(); works = WorkService(repo); executions = ExecutionService(repo)
    work = works.create_work("make a change")
    execution = executions.create_execution(work.id, "fake")
    terminal = ExecutionProjection(Phase.TERMINAL, Outcome.FAILED, False, Freshness.OBSERVED, datetime.now(timezone.utc))
    executions.observe_projection(execution.id, terminal)
    assert repo.get_work(work.id).lifecycle.value == "open"
    completed = works.complete_work(work.id, "user accepted evidence")
    assert completed.lifecycle.value == "completed"
    assert works.reopen_work(work.id, "new scope").lifecycle.value == "open"


def test_dispatch_intent_is_idempotent_and_projection_event_is_material(tmp_agent_box_home):
    repo = CoreRepository(); work = WorkService(repo).create_work("dispatch")
    execution = ExecutionService(repo).create_execution(work.id, "fake")
    service = ExecutionService(repo)
    first = service.request_dispatch(execution.id, "request-1")
    assert service.request_dispatch(execution.id, "request-1") == first
    events = repo.list_events(execution.id)
    assert [item.type for item in events].count(EventType.EXECUTION_DISPATCH_REQUESTED) == 1


def test_reobservation_does_not_duplicate_material_events_or_refs(tmp_agent_box_home):
    repo = CoreRepository(); work = WorkService(repo).create_work("observe")
    execution = ExecutionService(repo).create_execution(work.id, "fake")
    service = ExecutionService(repo)
    ref = Ref(RefType.SESSION, "fake", "session-1")
    first = ExecutionProjection(Phase.ACTIVE, None, True, Freshness.OBSERVED, datetime.now(timezone.utc))
    service.apply_observation(execution.id, first, native_refs=(ref,))
    later_same_state = ExecutionProjection(Phase.ACTIVE, None, True, Freshness.OBSERVED, datetime.now(timezone.utc))
    service.apply_observation(execution.id, later_same_state, native_refs=(ref,))
    event_types = [item.type for item in repo.list_events(execution.id)]
    assert event_types.count(EventType.EXECUTION_PROJECTION_CHANGED) == 1
    assert event_types.count(EventType.NATIVE_REF_DISCOVERED) == 1
    assert repo.list_refs(execution.id) == [ref]
