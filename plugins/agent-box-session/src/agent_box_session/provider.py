"""Dispatch input surface for frozen per-turn session input."""
from __future__ import annotations

import hashlib
from typing import Any, Optional

from agent_box.protocols.session import SESSION_TURN_INPUT_CONTRACT_ID
from agent_box.protocols.session.contracts import SessionTurnInputV1
from agent_box.resource_contracts import PromptFragmentV1
from agent_box.work_core.models import Ref
from agent_box.work_core.registry import ProviderDescriptor

from .store import STORE_ID, SQLiteSessionStore

PROVIDER_ID = "agent-box-session-inputs"


class SessionInputResourceProvider:
    """Resolves a frozen Turn-input Ref into the typed dispatch input values.

    Raw input text is only ever handed to a dispatching Execution through
    these typed contracts — never through event payloads or diagnostics.
    Two contracts are served from the same frozen turn input:

    - ``agent-box.session-turn-input@1`` (neutral session input), and
    - ``agent-box.prompt-fragment@1`` (the prompt-rendering contract the
      official Harness launch chain consumes).
    """

    supported_contract_ids = frozenset({SESSION_TURN_INPUT_CONTRACT_ID, PromptFragmentV1.contract_id})

    def __init__(self, store: SQLiteSessionStore) -> None:
        self._store = store

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(PROVIDER_ID, "Official Session turn inputs", "1")

    def make_ref(self, turn_id: str) -> Ref:
        from .store import turn_input_ref

        return turn_input_ref(turn_id)

    def _turn_text(self, ref: Ref) -> str:
        if ref.provider != PROVIDER_ID or not ref.native_id.startswith("turn-input:"):
            raise ValueError("ref does not belong to this turn-input provider")
        turn_id = ref.native_id.split(":", 1)[1]
        return turn_id, self._store.turn_input_text(turn_id)

    def resolve(
        self,
        contract_id: str,
        ref: Ref,
        *,
        context: Optional[Any] = None,
    ):
        if contract_id == SESSION_TURN_INPUT_CONTRACT_ID:
            turn_id, text = self._turn_text(ref)
            return SessionTurnInputV1(turn_id=turn_id, text=text)
        if contract_id == PromptFragmentV1.contract_id:
            turn_id, text = self._turn_text(ref)
            digest = "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()
            return PromptFragmentV1(title=f"turn {turn_id}", content=text, digest=digest)
        raise ValueError(f"unsupported contract: {contract_id}")
