"""ResourceProvider that freezes/resolves Pi-native session identities.

The provider id ``pi-session`` resolves ``agent-box-pi.continuation@1`` Refs
into ``PiContinuationV1`` values at Dispatch resolution time.  This is how a
continuation stays a native Pi identity (plus provider-owned validation
fields) without ever leaking credentials or Pi internals into Core.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from agent_box.work_core import ProviderDescriptor, Ref, RefType

from .config import PiPluginConfig
from .contract import PiContinuationV1
from .sessions import PiSessionScanner

_REF_METADATA_KEYS = frozenset(
    {"session_id", "session_file", "provider", "model", "digest", "cwd", "session_root"}
)


class PiSessionResourceProvider:
    provider_id = "pi-session"
    supported_contract_ids = frozenset({PiContinuationV1.contract_id})

    def __init__(self, config_loader=PiPluginConfig.load) -> None:
        self._config_loader = config_loader

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(self.provider_id, "Pi native sessions", "0.1.0")

    def _scanner(self) -> PiSessionScanner:
        return PiSessionScanner(self._config_loader())

    def make_ref(self, continuation: PiContinuationV1) -> Ref:
        metadata = {
            "session_id": continuation.session_id,
            "provider": continuation.provider,
            "model": continuation.model,
        }
        if continuation.session_file:
            metadata["session_file"] = continuation.session_file
        if continuation.session_file_digest:
            metadata["digest"] = continuation.session_file_digest
        if continuation.session_path is not None:
            metadata["session_root"] = str(continuation.session_path.parent)
        return Ref(
            RefType.SESSION,
            self.provider_id,
            continuation.session_id,
            uri=continuation.session_path.as_uri() if continuation.session_path else None,
            metadata=metadata,
        )

    def resolve(self, contract_id: str, ref: Ref) -> PiContinuationV1:
        if contract_id != PiContinuationV1.contract_id:
            raise ValueError(f"pi-session provider does not resolve {contract_id}")
        if ref.provider != self.provider_id:
            raise ValueError("Pi Continuation Ref provider mismatch")
        unknown = set(ref.metadata).difference(_REF_METADATA_KEYS)
        if unknown:
            raise ValueError(f"Pi Continuation Ref carries unknown metadata: {sorted(unknown)}")
        session_id = ref.metadata.get("session_id") or ref.native_id
        session_file = ref.metadata.get("session_file")
        model = ref.metadata.get("model", "")

        path: Path | None = None
        if session_file:
            candidate = Path(session_file)
            if not candidate.is_absolute():
                raise ValueError("Pi Continuation Ref session_file must be absolute")
            if not candidate.is_file():
                raise ValueError(
                    f"Pi Continuation session file no longer exists: {candidate}"
                )
            path = candidate
        else:
            path = self._scanner().locate(session_id)
            if path is None:
                raise ValueError(
                    f"Pi Continuation session id not found in session root: {session_id}"
                )

        digest = ref.metadata.get("digest")
        if digest:
            actual = "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()
            if actual != digest:
                raise ValueError(
                    "Pi Continuation session file digest differs from the frozen Ref; "
                    "do not resume a drift-mutated native session"
                )
        return PiContinuationV1(
            session_id=session_id,
            session_file=str(path),
            provider=ref.metadata.get("provider", "deepseek"),
            model=model,
            session_file_digest=digest or "",
        )


def ref_to_continuation(ref: Ref) -> PiContinuationV1:
    """Parse a frozen Pi Continuation Ref without hitting the filesystem."""
    return PiContinuationV1(
        session_id=ref.metadata.get("session_id") or ref.native_id,
        session_file=ref.metadata.get("session_file"),
        provider=ref.metadata.get("provider", "deepseek"),
        model=ref.metadata.get("model", ""),
        session_file_digest=ref.metadata.get("digest", ""),
    )


__all__ = ["PiSessionResourceProvider", "ref_to_continuation"]