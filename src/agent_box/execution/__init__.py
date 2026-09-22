"""Neutral execution composition package (MB-E2a).

Contract-only in this batch: the pure standard-library DTOs, enumerations and
the ``TurnExecutionPort`` protocol live once in ``agent_box.execution.contracts``
and the historical ``agent_box.server.execution`` entries re-export the same
objects. Nothing in this package may import the product Server, a Work Core
repository, or a concrete H/P plugin - the pins in
``tests/server/test_e_modular_execution_boundary.py`` lock that direction.
"""
from __future__ import annotations

from agent_box.execution.contracts import (
    CancelOutcome, DeadlinePolicy, DeliveryOutcome, EvidenceClass,
    ExecutionObservation, ExecutionReceipt, ExecutionRequest, NeutralBinding,
    ObservationState, TurnExecutionPort,
)

__all__ = [
    "CancelOutcome", "DeadlinePolicy", "DeliveryOutcome", "EvidenceClass",
    "ExecutionObservation", "ExecutionReceipt", "ExecutionRequest",
    "NeutralBinding", "ObservationState", "TurnExecutionPort",
]
