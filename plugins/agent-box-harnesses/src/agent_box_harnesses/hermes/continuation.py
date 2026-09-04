"""Hermes transcript-handoff continuation authority for new Executions.

The Hermes continuation contract is explicitly a portable transcript
handoff, not a native resume; both the transcript ref and the context
digest travel in the Ref (locator + bounded metadata).
"""
from __future__ import annotations

from agent_box.work_core import Ref, RefType
from agent_box.work_core.registry import ProviderDescriptor

from .contracts import HermesContinuationV1


class HermesContinuationResourceProvider:
    provider_id = "hermes-continuation"
    supported_contract_ids = frozenset({HermesContinuationV1.contract_id})

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(self.provider_id, "Hermes transcript continuation", "1")

    def make_ref(self, transcript_ref: str, context_digest: str) -> Ref:
        if not transcript_ref.strip() or not context_digest.strip():
            raise ValueError("CONTINUATION_LOCATOR_INVALID")
        return Ref(
            RefType.SESSION,
            self.provider_id,
            transcript_ref.strip()[:256],
            metadata={
                "harness_type": "hermes",
                "source_provider": "hermes",
                "context_digest": context_digest.strip()[:256],
            },
        )

    def resolve(self, contract_id, ref, *, context=None):
        del context
        if (
            contract_id != HermesContinuationV1.contract_id
            or ref.type is not RefType.SESSION
            or ref.provider != self.provider_id
        ):
            raise ValueError("CONTINUATION_REF_MISMATCH")
        context_digest = str(ref.metadata.get("context_digest", ""))
        if not context_digest:
            raise ValueError("CONTINUATION_CONTEXT_DIGEST_REQUIRED")
        return HermesContinuationV1(ref.native_id, context_digest)
