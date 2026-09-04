"""Claude Code native-session continuation authority for new Executions."""
from __future__ import annotations

from agent_box.work_core import Ref, RefType
from agent_box.work_core.registry import ProviderDescriptor

from .contracts import ClaudeContinuationV1


class ClaudeContinuationResourceProvider:
    provider_id = "claude-code-continuation"
    supported_contract_ids = frozenset({ClaudeContinuationV1.contract_id})

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(self.provider_id, "Claude Code native continuation", "1")

    def make_ref(self, session_id: str, project_key: str = "") -> Ref:
        if not session_id.strip():
            raise ValueError("CONTINUATION_LOCATOR_INVALID")
        metadata = {"harness_type": "claude-code", "source_provider": "claude-code"}
        if project_key:
            metadata["project_key"] = project_key[:512]
        return Ref(RefType.SESSION, self.provider_id, session_id.strip()[:256], metadata=metadata)

    def resolve(self, contract_id, ref, *, context=None):
        del context
        if (
            contract_id != ClaudeContinuationV1.contract_id
            or ref.type is not RefType.SESSION
            or ref.provider != self.provider_id
        ):
            raise ValueError("CONTINUATION_REF_MISMATCH")
        return ClaudeContinuationV1(
            ref.native_id,
            project_key=str(ref.metadata.get("project_key", ""))[:512],
        )
