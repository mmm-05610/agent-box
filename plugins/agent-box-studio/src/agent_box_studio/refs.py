"""Neutral Ref helpers for the Studio service.

These construct the protocol-level Refs whose shapes are defined by the
Root Session protocol pack and the Official Session Store contribution.
No vendor vocabulary appears here.
"""
from __future__ import annotations

from agent_box.protocols.session import SESSION_TURN_INPUT_CONTRACT_ID
from agent_box.work_core.models import Ref, RefType

# The Official Session Store contribution's input-provider component id.
SESSION_INPUTS_PROVIDER_ID = "agent-box-session-inputs"
live_workspace_provider_id = "local-live-workspace"


def turn_input_ref(turn_id: str) -> Ref:
    """The stable dispatch input Ref for one Turn's frozen user input."""
    return Ref(
        RefType.SESSION,
        SESSION_INPUTS_PROVIDER_ID,
        f"turn-input:{turn_id}",
        metadata={"contract": SESSION_TURN_INPUT_CONTRACT_ID},
    )
