"""Production Minimal Work Core contracts.

This package is additive and intentionally independent from the legacy
``agent_box.work`` fixed-workflow implementation.
"""

from .events import CoreEvent, EventType
from .models import Execution, Ref, RefType, Work, WorkLifecycle
from .projection import ExecutionProjection, Freshness, Outcome, Phase
from .registry import ExtensionRegistry, ProviderDescriptor

__all__ = [
    "CoreEvent",
    "EventType",
    "Execution",
    "ExecutionProjection",
    "ExtensionRegistry",
    "Freshness",
    "Outcome",
    "Phase",
    "ProviderDescriptor",
    "Ref",
    "RefType",
    "Work",
    "WorkLifecycle",
]
