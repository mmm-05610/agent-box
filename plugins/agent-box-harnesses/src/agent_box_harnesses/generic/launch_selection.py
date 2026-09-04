"""Shared, harness-neutral launch-selection dispatch input resolver.

The Studio orchestrator expresses a requested launch mode as one
``agent-box.launch-selection@1`` dispatch input; this provider resolves the
Ref into the typed value.  Whether the mode is actually declared for the
target harness is decided (fail closed) by the harness launch chain — this
resolver never validates a mode vocabulary.
"""
from __future__ import annotations

from typing import Any, Optional

from agent_box.resource_contracts import LaunchSelectionV1
from agent_box.work_core.models import Ref, RefType
from agent_box.work_core.registry import ProviderDescriptor

PROVIDER_ID = "harness-launch-selection"


class GenericLaunchSelectionProvider:
    provider_id = PROVIDER_ID
    supported_contract_ids = frozenset({LaunchSelectionV1.contract_id})

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(PROVIDER_ID, "Harness launch selection", "1")

    def make_ref(self, mode: str) -> Ref:
        # Validates the neutral shape; the target harness validates the
        # vocabulary.
        LaunchSelectionV1(mode)
        return Ref(RefType.ARTIFACT, PROVIDER_ID, mode, metadata={"mode": mode})

    def resolve(self, contract_id: str, ref: Ref, *, context: Optional[Any] = None) -> LaunchSelectionV1:
        del context
        if contract_id != LaunchSelectionV1.contract_id:
            raise ValueError(f"unsupported contract: {contract_id}")
        if ref.provider != PROVIDER_ID or not ref.native_id:
            raise ValueError("ref does not belong to this launch-selection provider")
        return LaunchSelectionV1(ref.native_id)
