"""Exact native-session continuation authority for new Executions."""
from __future__ import annotations
from dataclasses import dataclass
import re
from typing import Sequence

from agent_box.work_core import Ref, RefType
from agent_box.work_core.registry import ProviderDescriptor
from ..adapters.observation import Observation, ObservationKind, TerminalCondition
from .contracts import CodexContinuationV1


_DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
_SOURCES = frozenset({"codex", "codex-app-server", "codex-interactive"})


@dataclass(frozen=True)
class CodexNativeCheckpoint:
    """Content-free identity of locally frozen Codex native state."""

    thread_id: str
    source_execution_id: str
    source_provider: str
    artifact_digest: str

    def __post_init__(self) -> None:
        if not self.thread_id or len(self.thread_id) > 256:
            raise ValueError("NATIVE_SESSION_LOCATOR_REQUIRED")
        if not self.source_execution_id or len(self.source_execution_id) > 256:
            raise ValueError("SOURCE_EXECUTION_REQUIRED")
        if self.source_provider not in _SOURCES:
            raise ValueError("CONTINUATION_SOURCE_UNSUPPORTED")
        if not _DIGEST.fullmatch(self.artifact_digest):
            raise ValueError("NATIVE_CHECKPOINT_DIGEST_INVALID")


@dataclass(frozen=True)
class CodexResumeState:
    """Adapter-owned state consumed after checkpoint materialization."""

    continuation: CodexContinuationV1
    checkpoint_digest: str
    official_exec_argv: tuple[str, str]
    materialization_required: bool = True

class CodexContinuationResourceProvider:
    provider_id = "codex-continuation"
    supported_contract_ids = frozenset({CodexContinuationV1.contract_id})
    def descriptor(self): return ProviderDescriptor(self.provider_id, "Codex native continuation", "1")
    def make_ref(self, native_id: str, source_provider: str) -> Ref:
        if source_provider not in _SOURCES or not native_id.strip():
            raise ValueError("CONTINUATION_SOURCE_UNSUPPORTED")
        return Ref(RefType.SESSION, self.provider_id, native_id, metadata={"source_provider": source_provider})
    def resolve(self, contract_id, ref, *, context=None):
        del context
        if contract_id != CodexContinuationV1.contract_id or ref.type is not RefType.SESSION or ref.provider != self.provider_id:
            raise ValueError("CONTINUATION_REF_MISMATCH")
        if ref.metadata.get("source_provider") not in _SOURCES:
            raise ValueError("CONTINUATION_SOURCE_UNSUPPORTED")
        return CodexContinuationV1(ref.native_id)

    def resolve_committed_parent(
        self,
        contract_id,
        ref,
        *,
        parent_execution_id: str,
        committed_execution_id: str | None,
        committed_output_ref: Ref | None,
    ) -> CodexContinuationV1:
        """Resolve only the exact output Ref of the committed parent run."""
        if committed_execution_id != parent_execution_id or committed_output_ref != ref:
            raise ValueError("COMMITTED_PARENT_OUTPUT_REF_REQUIRED")
        return self.resolve(contract_id, ref)

    def capture_checkpoint(
        self,
        *,
        source_execution_id: str,
        source_provider: str,
        observations: Sequence[Observation],
        artifact_digest: str,
    ) -> CodexNativeCheckpoint:
        """Capture identity only after one successful native terminal.

        ``artifact_digest`` identifies bytes already frozen by the local
        native-home authority.  This adapter never reads a remote path or
        checkpoint file itself.
        """
        if len(observations) > 4096:
            raise ValueError("OBSERVATION_BOUND_EXCEEDED")
        locators = {
            item.session_locator
            for item in observations
            if item.kind is ObservationKind.SESSION and item.session_locator
        }
        if not locators:
            raise ValueError("NATIVE_SESSION_LOCATOR_REQUIRED")
        if len(locators) != 1:
            raise ValueError("NATIVE_SESSION_LOCATOR_AMBIGUOUS")
        terminals = [
            item for item in observations if item.kind is ObservationKind.TERMINAL
        ]
        if (
            len(terminals) != 1
            or terminals[0].is_error
            or terminals[0].terminal_condition is not TerminalCondition.TURN_COMPLETED
        ):
            raise ValueError("SUCCESSFUL_TERMINAL_REQUIRED")
        return CodexNativeCheckpoint(
            thread_id=next(iter(locators)),
            source_execution_id=source_execution_id,
            source_provider=source_provider,
            artifact_digest=artifact_digest,
        )

    def output_ref(self, checkpoint: CodexNativeCheckpoint) -> Ref:
        if not isinstance(checkpoint, CodexNativeCheckpoint):
            raise TypeError("CodexNativeCheckpoint required")
        return Ref(
            RefType.SESSION,
            self.provider_id,
            checkpoint.thread_id,
            metadata={
                "source_provider": checkpoint.source_provider,
                "source_execution_id": checkpoint.source_execution_id,
                "checkpoint_digest": checkpoint.artifact_digest,
            },
        )

    def resolve_resume_state(
        self,
        contract_id,
        ref,
        *,
        parent_execution_id: str,
        committed_execution_id: str | None,
        committed_output_ref: Ref | None,
        locally_frozen_checkpoint: CodexNativeCheckpoint,
    ) -> CodexResumeState:
        continuation = self.resolve_committed_parent(
            contract_id,
            ref,
            parent_execution_id=parent_execution_id,
            committed_execution_id=committed_execution_id,
            committed_output_ref=committed_output_ref,
        )
        checkpoint = locally_frozen_checkpoint
        if (
            not isinstance(checkpoint, CodexNativeCheckpoint)
            or checkpoint.thread_id != ref.native_id
            or checkpoint.source_execution_id != parent_execution_id
            or checkpoint.source_provider != ref.metadata.get("source_provider")
            or checkpoint.artifact_digest != ref.metadata.get("checkpoint_digest")
        ):
            raise ValueError("COMMITTED_NATIVE_CHECKPOINT_REQUIRED")
        return CodexResumeState(
            continuation=continuation,
            checkpoint_digest=checkpoint.artifact_digest,
            official_exec_argv=("resume", continuation.thread_id),
        )


__all__ = [
    "CodexContinuationResourceProvider",
    "CodexNativeCheckpoint",
    "CodexResumeState",
]
