"""Neutral execution and Harness capability contracts.

Server composes extensions through these types only; concrete Harness
implementations are selected in `server/bootstrap` and owned by plugins.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Mapping, Protocol


class TurnExecutionPort(Protocol):
    """Product-facing dispatch surface; plugins own the native semantics."""

    def accept(self, turn_id: str, *, overrides: Mapping[str, Any] | None = None) -> None: ...
    def cancel(self, turn_id: str) -> bool: ...


@dataclass(frozen=True)
class HarnessDescriptor:
    """One registered Harness extension as the Server may describe it.

    `capability_claims` may contain only abilities the registered
    implementation actually demonstrates; unverified abilities stay absent
    rather than defaulting to true.
    """

    harness_type: str
    credential_kind: str | None = None
    configuration_validator: Callable[[Any], None] | None = None
    capability_claims: Mapping[str, bool] = field(default_factory=dict)
    # Optional-value controls this Harness declares, in declaration order; the
    # first entry is the access-layer default. Only declared controls are
    # offered, so a client never sees an invented option.
    control_options: Mapping[str, tuple[Any, ...]] = field(default_factory=dict)
    # Controls a security rule pins; they are reported as locked and cannot be
    # overridden by a Profile default or a temporary override.
    security_locked_controls: tuple[str, ...] = ()


class HarnessRegistry:
    """Registration state assembled at bootstrap; never brand-switched on."""

    def __init__(self) -> None:
        self._descriptors: dict[str, HarnessDescriptor] = {}

    def register(self, descriptor: HarnessDescriptor) -> None:
        if descriptor.harness_type in self._descriptors:
            raise ValueError(f"harness already registered: {descriptor.harness_type}")
        self._descriptors[descriptor.harness_type] = descriptor

    def get(self, harness_type: str) -> HarnessDescriptor:
        try:
            return self._descriptors[harness_type]
        except KeyError:
            raise KeyError("HARNESS_NOT_REGISTERED") from None

    def registered(self) -> tuple[str, ...]:
        return tuple(sorted(self._descriptors))

    def claims_for(self, harness_type: str) -> dict[str, bool]:
        descriptor = self._descriptors.get(harness_type)
        return dict(descriptor.capability_claims) if descriptor else {}

    def __contains__(self, harness_type: str) -> bool:
        return harness_type in self._descriptors


from .sidecar_backend import SidecarExecutionBackend  # noqa: E402

__all__ = [
    "HarnessDescriptor", "HarnessRegistry", "SidecarExecutionBackend", "TurnExecutionPort",
]
