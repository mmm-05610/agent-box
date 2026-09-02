"""Typed failure stages for the Harness launch chain.

PLAN_REJECTED          — planning/validation failed; no side effect exists.
MATERIALIZATION_FAILED — staging/lowering failed before any attempt started.
START_REJECTED         — the Runtime rejected the attempt before its start
                         authority was consumed.
START_AMBIGUOUS        — the Runtime could not confirm whether a target was
                         created; automatic retry is forbidden.

The existing single-spawn, replay and ambiguity semantics of the Root
composition coordinator are preserved unchanged.
"""
from __future__ import annotations

PLAN_REJECTED = "PLAN_REJECTED"
MATERIALIZATION_FAILED = "MATERIALIZATION_FAILED"
START_REJECTED = "START_REJECTED"
START_AMBIGUOUS = "START_AMBIGUOUS"
FINISH_NOT_TERMINAL = "FINISH_NOT_TERMINAL"

_STAGES = frozenset({PLAN_REJECTED, MATERIALIZATION_FAILED, START_REJECTED, START_AMBIGUOUS, FINISH_NOT_TERMINAL})


class LaunchStageError(RuntimeError):
    """Base class for stage-tagged launch failures."""

    stage = "UNKNOWN"

    def __init__(self, code: str, detail: str = "") -> None:
        self.code = code
        self.stage = type(self).stage
        super().__init__(f"{self.stage}: {code}" + (f": {detail}" if detail else ""))


class PlanRejected(LaunchStageError):
    stage = PLAN_REJECTED


class MaterializationFailed(LaunchStageError):
    stage = MATERIALIZATION_FAILED


class StartRejected(LaunchStageError):
    stage = START_REJECTED


class StartAmbiguous(LaunchStageError):
    stage = START_AMBIGUOUS


class FinishNotTerminal(LaunchStageError):
    """Finish was requested while the process/session is still running.

    No reconcile, no discard and no fabricated terminal Observation; the
    execution-scoped view stays in place for the Host to decide.
    """

    stage = FINISH_NOT_TERMINAL


__all__ = [
    "FINISH_NOT_TERMINAL",
    "MATERIALIZATION_FAILED",
    "PLAN_REJECTED",
    "START_AMBIGUOUS",
    "START_REJECTED",
    "FinishNotTerminal",
    "LaunchStageError",
    "MaterializationFailed",
    "PlanRejected",
    "StartAmbiguous",
    "StartRejected",
]
