"""Provider-neutral, versioned values exchanged during Execution dispatch.

This package deliberately contains no persistence, lifecycle, Ref, provider,
or Work Core imports.  A ``contract_id`` is an incompatible-version boundary.
"""
from __future__ import annotations

from types import MappingProxyType
from typing import Mapping

from .agent_box_profile_v1 import AgentBoxProfileV1
from .credential_v1 import CredentialRefV1
from .prompt_fragment_v1 import PromptFragmentV1
from .workspace_v1 import WorkspaceV1


CONTRACT_TYPES: Mapping[str, type] = MappingProxyType(
    {
        WorkspaceV1.contract_id: WorkspaceV1,
        PromptFragmentV1.contract_id: PromptFragmentV1,
        AgentBoxProfileV1.contract_id: AgentBoxProfileV1,
        CredentialRefV1.contract_id: CredentialRefV1,
    }
)


def contract_type(contract_id: str) -> type:
    """Return the Python type registered for ``contract_id``."""
    try:
        return CONTRACT_TYPES[contract_id]
    except KeyError as exc:
        raise ValueError(f"unknown resource contract: {contract_id}") from exc


__all__ = [
    "AgentBoxProfileV1",
    "CredentialRefV1",
    "CONTRACT_TYPES",
    "PromptFragmentV1",
    "WorkspaceV1",
    "contract_type",
]
