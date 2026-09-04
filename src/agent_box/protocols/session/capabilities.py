"""Session capability truth vocabulary.

A capability is READY only with evidence.  Unimplemented or unadmitted
capabilities must be reported as UNAVAILABLE / NOT_IMPLEMENTED — never as
READY, and never swallowed silently.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Mapping


class CapabilityState(str, Enum):
    READY = "READY"
    UNAVAILABLE = "UNAVAILABLE"
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED"


@dataclass(frozen=True)
class SessionCapabilityTruth:
    """One honest capability fact, bounded and safe for public API output."""

    capability: str
    state: CapabilityState
    detail: str = ""

    def __post_init__(self) -> None:
        if not self.capability:
            raise ValueError("capability name is required")
        if len(self.detail) > 256:
            raise ValueError("capability detail exceeds bounded size")

    def to_dict(self) -> dict[str, str]:
        return {
            "capability": self.capability,
            "state": self.state.value,
            "detail": self.detail,
        }


def capability_map(truths: Mapping[str, CapabilityState]) -> dict[str, str]:
    return {name: state.value for name, state in sorted(truths.items())}
