from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from typing import Any, Mapping

from agent_box.work_core import ProviderDescriptor, Ref, RefType, ResourceResolutionContext
from agent_box.extensions import ResourceSelection, SelectorField, SelectorCompatibility
from agent_box.resource_contracts import AgentBoxProfileV1


def _digest(value: object) -> str:
    return "sha256:" + hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _reject_secrets(value: object, key: str = "") -> None:
    if any(word in key.lower() for word in ("secret", "token", "password", "api_key", "apikey", "private_key")):
        raise ValueError("OpenCode profile cannot contain credential values")
    if isinstance(value, Mapping):
        for name, child in value.items():
            _reject_secrets(child, str(name))
    elif isinstance(value, (list, tuple)):
        for child in value:
            _reject_secrets(child, key)


@dataclass(frozen=True)
class OpenCodeProfileRef:
    profile_id: str
    revision: int
    digest: str
    provider: str = "opencode-profile"

    def as_ref(self) -> Ref:
        return Ref(RefType.ARTIFACT, self.provider, self.profile_id, metadata={
            "harness_id": "opencode", "revision": str(self.revision), "digest": self.digest,
        })


class OpenCodeProfileAuthority:
    """Owns immutable, non-secret OpenCode profile revisions."""

    def __init__(self, root: Path):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def save(self, profile: Mapping[str, Any], *, expected_revision: int | None = None) -> OpenCodeProfileRef:
        value = json.loads(json.dumps(dict(profile)))
        _reject_secrets(value)
        profile_id = str(value.get("profile_id", "")).strip()
        if not profile_id or "/" in profile_id or "\\" in profile_id:
            raise ValueError("invalid OpenCode profile_id")
        current = self.list(profile_id)
        if expected_revision is not None and (not current or current[-1].revision != expected_revision):
            raise ValueError("PROFILE_REVISION_CONFLICT")
        revision = current[-1].revision + 1 if current else 1
        value.update({"profile_id": profile_id, "revision": revision})
        digest = _digest({k: v for k, v in value.items() if k not in {"revision", "digest"}})
        value["digest"] = digest
        path = self.root / profile_id / f"r{revision}.json"
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        path.write_text(json.dumps(value, sort_keys=True, indent=2) + "\n", encoding="utf-8")
        return OpenCodeProfileRef(profile_id, revision, digest)

    def list(self, profile_id: str) -> list[OpenCodeProfileRef]:
        directory = self.root / profile_id
        result = []
        for path in sorted(directory.glob("r*.json")) if directory.is_dir() else ():
            value = json.loads(path.read_text(encoding="utf-8"))
            result.append(OpenCodeProfileRef(profile_id, int(value["revision"]), value["digest"]))
        return result

    def resolve(self, ref: OpenCodeProfileRef) -> dict[str, Any]:
        path = self.root / ref.profile_id / f"r{ref.revision}.json"
        value = json.loads(path.read_text(encoding="utf-8"))
        if value.get("digest") != ref.digest:
            raise ValueError("PROFILE_DIGEST_DRIFT")
        _reject_secrets(value)
        return value


class OpenCodeProfileProvider:
    """Public Profile ResourceProvider; the binding contract is agent-box.profile@1."""
    provider_id = "opencode-profile"
    supported_contract_ids = frozenset({AgentBoxProfileV1.contract_id})
    def __init__(self, root: Path):
        self.authority = OpenCodeProfileAuthority(root)
    def descriptor(self):
        return ProviderDescriptor(self.provider_id, "OpenCode Profile", "0.1.0")
    def list_profiles(self):
        result = []
        for directory in sorted(self.authority.root.iterdir()) if self.authority.root.exists() else ():
            if directory.is_dir():
                for ref in self.authority.list(directory.name):
                    result.append({"profile_id": ref.profile_id, "revision": ref.revision, "digest": ref.digest, "name": ref.profile_id})
        return tuple(result)
    def get_profile(self, profile_id, revision=None):
        revisions = self.authority.list(profile_id)
        if not revisions: raise KeyError(profile_id)
        target = revisions[-1] if revision is None else next((item for item in revisions if item.revision == revision), None)
        if target is None: raise KeyError(profile_id)
        return self.authority.resolve(target)
    def resolve(self, contract_id, ref, *, context: ResourceResolutionContext | None = None):
        del context
        if contract_id != AgentBoxProfileV1.contract_id or ref.provider != self.provider_id:
            raise ValueError("OpenCode ProfileRef mismatch")
        revision = int(ref.metadata.get("revision", "0")); digest_value = ref.metadata.get("digest", "")
        value = self.authority.resolve(OpenCodeProfileRef(ref.native_id, revision, digest_value))
        return AgentBoxProfileV1(ref.native_id, "opencode", digest_value, revision, self.provider_id)


class OpenCodeProfileSelector:
    compatibility = SelectorCompatibility(execution_provider_ids=frozenset({"opencode-direct"}), harness_types=frozenset({"opencode"}), supports_exact_revision=True, recommended=True)
    id = "opencode-profile-selector"; contract_id = AgentBoxProfileV1.contract_id; title = "OpenCode profile"
    fields = (SelectorField("profile_id", "Profile", kind="select"),)
    def __init__(self, provider): self.provider = provider
    def prepare(self, parameters, *, execution_id):
        del execution_id
        profile_id = str(parameters.get("profile_id", "")); rows = [x for x in self.provider.list_profiles() if x["profile_id"] == profile_id]
        if not rows: raise ValueError("OpenCode profile is unavailable")
        row = rows[-1]; ref = Ref(RefType.ARTIFACT, self.provider.provider_id, profile_id, metadata={"harness_id":"opencode", "revision":str(row["revision"]), "digest":row["digest"]})
        return ResourceSelection(self.contract_id, ref, profile_id, row["digest"])


class OpenCodeManager:
    harness_id = "opencode"
    def __init__(self, provider): self.provider = provider
    def descriptor(self): return {"id":"opencode", "display_name":"OpenCode", "version":"1.18.21", "status":"ready", "supported":True}
    def list_profiles(self): return self.provider.list_profiles()
    def get_profile(self, profile_id, revision=None): return self.provider.get_profile(profile_id, revision)

class OpenCodeContinuationResourceProvider:
    provider_id="opencode-continuation"
    supported_contract_ids=frozenset({"agent-box.opencode-continuation@1"})
    def descriptor(self): return ProviderDescriptor(self.provider_id,"OpenCode native continuation","0.1.0")
    def resolve(self, contract_id, ref, *, context=None):
        from .provider import OpenCodeContinuationV1
        del context
        if contract_id != OpenCodeContinuationV1.contract_id or ref.provider != self.provider_id or ref.type is not RefType.SESSION: raise ValueError("OpenCode continuation Ref mismatch")
        return OpenCodeContinuationV1(ref.native_id)
