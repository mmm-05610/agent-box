"""Typed Harness Adapter SPI (post-determined-repair).

Adapters are pure planners/codecs: they validate native payloads, build
private immutable LaunchPlans from a typed HarnessStartContext, and decode
native events into canonical Observations.  The former decorative SPI
(``declare_runtime_sources``) is gone — runtime sources are declared by the
single lowering path from the LaunchPlan; ``decode_observation`` is revived
as the real canonical decode entry points below.
"""
from __future__ import annotations

from typing import Any, Mapping, Protocol, Sequence, runtime_checkable

from .launch_plan import LaunchPlan
from .observation import FinishProposal, Observation


@runtime_checkable
class HarnessAdapter(Protocol):
    key: str
    harness_type: str
    implemented_capabilities: frozenset[str]

    def validate_native_payload(self, payload: Any) -> tuple[str, ...]: ...
    def plan(self, context: Any) -> LaunchPlan: ...
    def decode_native_events(self, lines: Sequence[str]) -> tuple[Observation, ...]: ...
    def decode_native_document(self, payload: Mapping[str, Any]) -> tuple[Observation, ...]: ...
    def finish_proposal(self, *, execution_id: str, dispatch_id: str,
                        observations: Sequence[Observation], exit_code: int | None) -> FinishProposal: ...


__all__ = ["HarnessAdapter"]
