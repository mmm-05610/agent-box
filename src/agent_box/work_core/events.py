"""Append-only material cross-system facts, not provider telemetry."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Mapping

from .models import _bounded_metadata


class EventType(str, Enum):
    WORK_CREATED = "WorkCreated"
    WORK_COMPLETED = "WorkCompleted"
    WORK_REOPENED = "WorkReopened"
    EXECUTION_CREATED = "ExecutionCreated"
    EXECUTION_DISPATCH_REQUESTED = "ExecutionDispatchRequested"
    NATIVE_REF_DISCOVERED = "NativeRefDiscovered"
    EXECUTION_STARTED = "ExecutionStarted"
    EXECUTION_PROJECTION_CHANGED = "ExecutionProjectionChanged"
    EXECUTION_TERMINAL = "ExecutionTerminal"
    REF_ATTACHED = "RefAttached"


@dataclass(frozen=True)
class CoreEvent:
    id: str
    type: EventType
    subject_id: str
    occurred_at: datetime
    data: Mapping[str, str] = field(default_factory=dict)
    idempotency_key: str | None = None

    def __post_init__(self) -> None:
        if not self.id or not self.subject_id:
            raise ValueError("event id and subject_id are required")
        object.__setattr__(self, "data", _bounded_metadata(self.data))
