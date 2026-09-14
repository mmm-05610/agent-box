"""Neutral execution and Harness capability contracts.

Server composes extensions through these types only; concrete Harness
implementations are selected in `server/bootstrap` and owned by plugins.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Mapping, Protocol

from agent_box.resource_contracts.harness_capabilities import (
    CapabilityDeclaration,
    capability_view as _capability_view,
    merge_capabilities,
    validate_claims,
)


class TurnExecutionPort(Protocol):
    """Product-facing dispatch surface; plugins own the native semantics."""

    def accept(self, turn_id: str, *, overrides: Mapping[str, Any] | None = None) -> None: ...
    def cancel(self, turn_id: str) -> bool: ...


@dataclass(frozen=True)
class HarnessDescriptor:
    """One registered Harness extension as the Server may describe it.

    `capability_claims` is the *static ceiling*: it is validated against the
    versioned canonical contract at construction time, so a production template
    cannot smuggle in a second, unchecked dictionary. Unverified abilities stay
    false rather than defaulting to true.
    """

    harness_type: str
    credential_kind: str | None = None
    # A Harness deployment may declare which provider/model reference control
    # selects the native model.  The Server resolves and freezes that reference
    # generically; the plugin still owns what the native control means.
    model_control_id: str | None = None
    # Optional, declarative adapter environment key.  Credential bytes are
    # never stored in this descriptor or in a configuration object.
    credential_environment: str | None = None
    configuration_validator: Callable[[Any], None] | None = None
    capability_claims: Mapping[str, bool] = field(default_factory=dict)
    # Optional-value controls this Harness declares, in declaration order; the
    # first entry is the access-layer default. Only declared controls are
    # offered, so a client never sees an invented option.
    control_options: Mapping[str, tuple[Any, ...]] = field(default_factory=dict)
    # Controls a security rule pins; they are reported as locked and cannot be
    # overridden by a Profile default or a temporary override.
    security_locked_controls: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        # 声明只能是 canonical id + 真 bool；装配期就失败，而不是等到某次执行
        # 才把漂移写法当成“支持”。校验后按 canonical 次序冻结为普通字典快照。
        object.__setattr__(
            self, "capability_claims", validate_claims(self.capability_claims),
        )


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
        """External-compatible shape: {canonical id: declared}; unknown → {}."""
        return self.canonical_claims(harness_type)

    def canonical_claims(self, harness_type: str) -> dict[str, bool]:
        """registry 派生的 canonical 静态声明（Profile 视图的唯一来源）。"""
        descriptor = self._descriptors.get(harness_type)
        return dict(descriptor.capability_claims) if descriptor else {}

    def capability_declarations(self, harness_type: str) -> tuple[CapabilityDeclaration, ...]:
        """静态 canonical 视图（无任何运行时观测；未注册 → 空）。"""
        descriptor = self._descriptors.get(harness_type)
        if descriptor is None:
            return ()
        return merge_capabilities(descriptor.capability_claims, {})

    def capability_view(self, harness_type: str) -> dict[str, Any]:
        """静态 canonical 视图字典，形状与运行时视图一致。"""
        return _capability_view(harness_type, self.capability_declarations(harness_type))

    def __contains__(self, harness_type: str) -> bool:
        return harness_type in self._descriptors


from .sidecar_backend import SidecarExecutionBackend  # noqa: E402

__all__ = [
    "HarnessDescriptor", "HarnessRegistry", "SidecarExecutionBackend", "TurnExecutionPort",
]
