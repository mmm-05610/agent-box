from __future__ import annotations
from dataclasses import dataclass
from typing import Any

@dataclass(frozen=True)
class ProfileRef:
    harness_id: str
    profile_id: str
    revision: int
    digest: str
    provider: str = "codex-profile"
    def as_ref(self):
        from agent_box.work_core import Ref, RefType
        return Ref(RefType.ARTIFACT, self.provider, self.profile_id,
                   metadata={"harness_id": self.harness_id, "revision": str(self.revision), "digest": self.digest})

def public_profile(value: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in value.items() if k not in {"secret", "token", "api_key", "private_key"}}
