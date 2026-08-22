from datetime import datetime, timezone

import pytest

from agent_box.work_core.events import CoreEvent, EventType
from agent_box.work_core.models import Execution, Ref, RefType, Work, WorkLifecycle
from agent_box.work_core.projection import ExecutionProjection, Freshness, Phase
from agent_box.work_core.repository import ConcurrencyConflict, CoreRepository, RefRelation


NOW = datetime(2026, 8, 21, tzinfo=timezone.utc)


def event(event_id, kind, subject):
    return CoreEvent(event_id, kind, subject, NOW)


def test_persists_work_execution_refs_events_and_reloads(tmp_agent_box_home):
    repo = CoreRepository()
    work = repo.create_work(Work("work_1", "test", WorkLifecycle.OPEN, NOW, NOW), event("evt_1", EventType.WORK_CREATED, "work_1"))
    projection = ExecutionProjection(Phase.ACTIVE, None, True, Freshness.OBSERVED, NOW)
    execution = repo.create_execution(Execution("exec_1", work.id, "codex-cli", projection, NOW), event("evt_2", EventType.EXECUTION_CREATED, "exec_1"))
    repo.attach_ref(execution.id, RefRelation.NATIVE, Ref(RefType.SESSION, "codex-cli", "thread-1"), event("evt_3", EventType.NATIVE_REF_DISCOVERED, execution.id))
    assert repo.get_execution(execution.id).projection.resumable_now is True
    assert repo.list_refs(execution.id)[0].native_id == "thread-1"
    assert [item.type for item in repo.list_events(execution.id)] == [EventType.EXECUTION_CREATED, EventType.NATIVE_REF_DISCOVERED]


def test_optimistic_version_rejects_stale_projection_update(tmp_agent_box_home):
    repo = CoreRepository()
    repo.create_work(Work("work_1", "test", WorkLifecycle.OPEN, NOW, NOW), event("evt_1", EventType.WORK_CREATED, "work_1"))
    current = repo.create_execution(Execution("exec_1", "work_1", "fake", ExecutionProjection(Phase.ACTIVE, None, False, Freshness.OBSERVED, NOW), NOW), event("evt_2", EventType.EXECUTION_CREATED, "exec_1"))
    repo.update_projection(current, expected_version=0, event=event("evt_3", EventType.EXECUTION_PROJECTION_CHANGED, "exec_1"))
    with pytest.raises(ConcurrencyConflict):
        repo.update_projection(current, expected_version=0, event=event("evt_4", EventType.EXECUTION_PROJECTION_CHANGED, "exec_1"))
