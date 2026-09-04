"""Testing-only fake execution provider for the offline Turn vertical.

This module exists purely for tests and offline rehearsals.  It is never
registered by the plugin's production entry point, never ships as a default
Harness, and never performs real model or credential work.
"""
from __future__ import annotations

from typing import Any, Mapping

from agent_box.protocols.session import SESSION_TURN_INPUT_CONTRACT_ID
from agent_box.protocols.session.contracts import SessionTurnInputV1
from agent_box.resource_contracts import WorkspaceV1
from agent_box.work_core.registry import (
    ExecutionStartReceipt,
    ProviderDescriptor,
    RecoverySupport,
    ResolvedExecutionInput,
)

FAKE_PROVIDER_ID = "fake-harness"
MAX_ECHO_LENGTH = 200


class FakeTurnObservation:
    """One deterministic, bounded fake observation."""

    def __init__(self, event_type: str, payload: Mapping[str, str]) -> None:
        self.event_type = event_type
        self.payload = dict(payload)


class FakeTurnExecutionProvider:
    """Deterministic offline ExecutionProvider.

    Given the frozen turn input and live workspace it emits a fixed sequence
    of observations: an acknowledgement message, a workspace fact, and a
    deterministic result.  No randomness, no IO beyond reading nothing —
    the workspace fact only records that a live root was received.
    """

    def __init__(self) -> None:
        self._observations: dict[str, tuple[FakeTurnObservation, ...]] = {}

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(FAKE_PROVIDER_ID, "Fake offline harness", "1")

    def capabilities(self) -> Mapping[str, str]:
        return {
            "session_turn_execution": "supported",
            "execution": "supported",
            "start": "supported",
            "network": "offline",
        }

    def input_limits(self) -> Mapping[str, tuple[int, int | None]]:
        return {
            SESSION_TURN_INPUT_CONTRACT_ID: (1, 1),
            WorkspaceV1.contract_id: (1, 1),
        }

    def start(self, request: Any) -> ExecutionStartReceipt:
        turn_input: SessionTurnInputV1 | None = None
        workspace: WorkspaceV1 | None = None
        for item in request.resolved_inputs:
            if not isinstance(item, ResolvedExecutionInput):
                raise TypeError("fake provider requires ResolvedExecutionInput items")
            if item.contract_id == SESSION_TURN_INPUT_CONTRACT_ID:
                turn_input = item.value
            elif item.contract_id == WorkspaceV1.contract_id:
                workspace = item.value
        if turn_input is None or workspace is None:
            raise ValueError(
                "fake provider requires one turn input and one live workspace"
            )
        # The live workspace must arrive honestly marked.
        if not workspace.source_digest.startswith("live-unfrozen:"):
            raise ValueError("fake provider requires an honestly-marked live workspace")
        self._observations[request.execution_id] = (
            FakeTurnObservation(
                "TURN_MESSAGE",
                {
                    "role": "assistant",
                    "text": f"[fake] acknowledged: {turn_input.text[:MAX_ECHO_LENGTH]}",
                },
            ),
            FakeTurnObservation(
                "WORKSPACE_FACT",
                {
                    "workspace_mode": "live",
                    "input_frozen": "false",
                    "detail": "fake execution observed the live root without modifying it",
                },
            ),
            FakeTurnObservation(
                "TURN_RESULT",
                {"outcome": "succeeded", "note": "deterministic fake vertical"},
            ),
        )
        return ExecutionStartReceipt(
            execution_id=request.execution_id,
            dispatch_id=request.dispatch_id,
            inputs_digest=request.inputs_digest,
            recovery_support=RecoverySupport.NONE,
        )

    def observe(self, native_ref: Any) -> tuple[FakeTurnObservation, ...]:
        """Return the deterministic observations of a started execution."""
        execution_id = getattr(native_ref, "execution_id", None) or str(native_ref)
        return self._observations.get(execution_id, ())
