"""Pi native-session continuation authority for new Executions."""
from __future__ import annotations

from pathlib import Path

from agent_box.work_core import Ref, RefType
from agent_box.work_core.registry import ProviderDescriptor

from .contract import PiContinuationV1, _ID


class PiContinuationResourceProvider:
    provider_id = "pi-session"
    supported_contract_ids = frozenset({PiContinuationV1.contract_id})

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(self.provider_id, "Pi native continuation", "1")

    def make_ref(self, session_id: str, session_file: str = "") -> Ref:
        # Fail closed on exactly the shapes the PiContinuationV1 contract
        # accepts: a make_ref that could never resolve is a typed reject, not
        # a truncated locator (truncation would silently fabricate a
        # different session identity).
        if not isinstance(session_id, str) or not session_id.strip() or not _ID.fullmatch(session_id.strip()):
            raise ValueError("CONTINUATION_LOCATOR_INVALID")
        if session_file and (len(session_file) > 256 or not Path(session_file).is_absolute()):
            raise ValueError("CONTINUATION_LOCATOR_INVALID")
        metadata = {"harness_type": "pi", "source_provider": "pi"}
        if session_file:
            metadata["session_file"] = session_file[:256]
        return Ref(RefType.SESSION, self.provider_id, session_id.strip(), metadata=metadata)

    def resolve(self, contract_id, ref, *, context=None):
        del context
        if (
            contract_id != PiContinuationV1.contract_id
            or ref.type is not RefType.SESSION
            or ref.provider != self.provider_id
        ):
            raise ValueError("CONTINUATION_REF_MISMATCH")
        return PiContinuationV1(
            ref.native_id,
            session_file=str(ref.metadata.get("session_file", "")) or None,
        )
