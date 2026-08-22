"""Small application services. Native effects remain provider work."""
from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
from uuid import uuid4

from .events import CoreEvent, EventType
from .errors import ExecutionNotResumable
from .models import Execution, Work, WorkLifecycle
from .projection import ExecutionProjection, Freshness, Phase
from .registry import ExtensionRegistry
from .repository import CoreRepository, RefRelation


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


class WorkService:
    def __init__(self, repository: CoreRepository) -> None:
        self.repository = repository

    def create_work(self, objective: str, *, metadata: dict[str, str] | None = None) -> Work:
        now, work_id = _now(), _id("work")
        work = Work(work_id, objective, WorkLifecycle.OPEN, now, now, metadata=metadata or {})
        return self.repository.create_work(work, CoreEvent(_id("evt"), EventType.WORK_CREATED, work_id, now, {"objective": objective}))

    def complete_work(self, work_id: str, reason: str) -> Work:
        current, now = self.repository.get_work(work_id), _now()
        next_value = replace(current, lifecycle=WorkLifecycle.COMPLETED, closure_reason=reason, updated_at=now)
        return self.repository.update_work(next_value, expected_version=current.version, event=CoreEvent(_id("evt"), EventType.WORK_COMPLETED, work_id, now, {"reason": reason}))

    def reopen_work(self, work_id: str, reason: str) -> Work:
        current, now = self.repository.get_work(work_id), _now()
        next_value = replace(current, lifecycle=WorkLifecycle.OPEN, closure_reason=None, updated_at=now)
        return self.repository.update_work(next_value, expected_version=current.version, event=CoreEvent(_id("evt"), EventType.WORK_REOPENED, work_id, now, {"reason": reason}))


class ExecutionService:
    def __init__(self, repository: CoreRepository) -> None:
        self.repository = repository

    def create_execution(self, work_id: str, provider_id: str, *, provenance: dict[str, str] | None = None) -> Execution:
        self.repository.get_work(work_id)
        now, execution_id = _now(), _id("exec")
        projection = ExecutionProjection(Phase.UNKNOWN, None, None, Freshness.STALE, now)
        execution = Execution(execution_id, work_id, provider_id, projection, now, provenance=provenance or {})
        return self.repository.create_execution(execution, CoreEvent(_id("evt"), EventType.EXECUTION_CREATED, execution_id, now, {"provider": provider_id}))

    def request_dispatch(self, execution_id: str, idempotency_key: str) -> str:
        existing = self.repository.get_dispatch_by_key(idempotency_key)
        if existing:
            if existing["execution_id"] != execution_id:
                raise ValueError("dispatch idempotency key belongs to another execution")
            return existing["id"]
        self.repository.get_execution(execution_id)
        now, dispatch_id = _now(), _id("dispatch")
        self.repository.create_dispatch(dispatch_id, execution_id, idempotency_key, CoreEvent(_id("evt"), EventType.EXECUTION_DISPATCH_REQUESTED, execution_id, now, {"dispatch_id": dispatch_id}, idempotency_key))
        return dispatch_id

    def observe_projection(self, execution_id: str, projection: ExecutionProjection) -> Execution:
        current = self.repository.get_execution(execution_id)
        if projection.observed_at < current.projection.observed_at:
            return current
        # ``observed_at`` is freshness evidence, not a new cross-system fact.
        # Avoid turning every provider poll into a ledger event/version write.
        if self._same_projection_semantics(projection, current.projection):
            return current
        now = _now()
        changed = replace(current, projection=projection, started_at=current.started_at or (now if projection.phase is Phase.ACTIVE else None), ended_at=now if projection.terminal else current.ended_at)
        event_type = EventType.EXECUTION_TERMINAL if projection.terminal else EventType.EXECUTION_PROJECTION_CHANGED
        return self.repository.update_projection(changed, expected_version=current.version, event=CoreEvent(_id("evt"), event_type, execution_id, now, {"phase": projection.phase.value, "freshness": projection.freshness.value}))

    @staticmethod
    def _same_projection_semantics(left: ExecutionProjection, right: ExecutionProjection) -> bool:
        return (
            left.phase is right.phase
            and left.outcome is right.outcome
            and left.resumable_now is right.resumable_now
            and left.freshness is right.freshness
        )

    def apply_observation(self, execution_id: str, projection: ExecutionProjection, *, native_refs=(), output_refs=()) -> Execution:
        """Persist material projection and typed references from any provider."""
        current = self.repository.get_execution(execution_id)
        changed = self.observe_projection(execution_id, projection)
        for ref in native_refs:
            self.repository.attach_ref(execution_id, RefRelation.NATIVE, ref, CoreEvent(_id("evt"), EventType.NATIVE_REF_DISCOVERED, execution_id, _now(), {"type": ref.type.value}))
        for ref in output_refs:
            self.repository.attach_ref(execution_id, RefRelation.OUTPUT, ref, CoreEvent(_id("evt"), EventType.REF_ATTACHED, execution_id, _now(), {"type": ref.type.value}))
        return changed

    def resume_execution(self, execution_id: str, registry: ExtensionRegistry, request):
        execution = self.repository.get_execution(execution_id)
        if execution.projection.resumable_now is not True:
            raise ExecutionNotResumable(f"execution is not resumable: {execution_id}")
        provider = registry.require_capability(execution.provider_id, "resume")
        resume = getattr(provider, "resume", None)
        if not callable(resume):
            raise ExecutionNotResumable(f"provider declared resume but has no resume operation: {execution.provider_id}")
        return resume(request)
