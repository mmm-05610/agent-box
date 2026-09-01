from __future__ import annotations
import hashlib, json, os
from pathlib import Path
from typing import Any, Mapping
from agent_box.extensions import ResourceSelection, SelectorField, SelectorCompatibility
from agent_box.resource_contracts import AgentBoxProfileV1
from agent_box.work_core import ProviderDescriptor, Ref, RefType, ResourceResolutionContext

class ProfileRef:
    """Exact Hermes profile identity; revision and digest are never optional."""
    def __init__(self, profile_id: str, revision: int, digest: str):
        if not profile_id or revision < 1 or not digest: raise ValueError("Hermes ProfileRef is incomplete")
        self.harness_id, self.profile_id, self.revision, self.digest, self.provider = "hermes", profile_id, revision, digest, "hermes-profile"
    def as_ref(self):
        return Ref(RefType.ARTIFACT, self.provider, self.profile_id, metadata={"harness_id":self.harness_id,"revision":str(self.revision),"digest":self.digest})

def _digest(value: object) -> str:
    return "sha256:" + hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

def _safe(value: Any, key: str = "profile") -> None:
    if isinstance(value, dict):
        for k, v in value.items():
            k = str(k).lower().replace("-", "_")
            if any(x in k for x in ("secret", "token", "api_key", "password", "private_key", "credential", "authorization")):
                raise ValueError(f"SECRET_FIELD_FORBIDDEN: {key}.{k}")
            _safe(v, f"{key}.{k}")
    elif isinstance(value, list):
        for v in value: _safe(v, key)
    elif isinstance(value, str) and len(value) > 8192:
        raise ValueError("PROFILE_FIELD_TOO_LARGE")

class HermesProfileProvider:
    provider_id = "hermes-profile"
    supported_contract_ids = frozenset({AgentBoxProfileV1.contract_id})
    def __init__(self, root: Path):
        self.root = Path(root).resolve(); self.root.mkdir(parents=True, exist_ok=True)
        self.file = self.root / "profiles.json"
    def descriptor(self): return ProviderDescriptor(self.provider_id, "Hermes Profile", "0.1.0")
    def _read(self) -> list[dict[str, Any]]:
        if not self.file.exists(): return []
        value = json.loads(self.file.read_text(encoding="utf-8")); return value if isinstance(value, list) else []
    def list_profiles(self):
        latest = {}
        for row in self._read():
            if row.get("profile_id") not in latest or int(row["revision"]) > int(latest[row["profile_id"]]["revision"]):
                latest[row["profile_id"]] = row
        return tuple(latest[key] for key in sorted(latest))
    def save(self, data: Mapping[str, Any]) -> dict[str, Any]:
        name = str(data.get("name", "")).strip(); pid = str(data.get("profile_id") or name.lower().replace(" ", "-"))
        if not name or not pid: raise ValueError("PROFILE_NAME_REQUIRED")
        config = dict(data.get("config") or {})
        _safe(config); _safe(data.get("capability_refs") or [])
        previous = next((x for x in self._read() if x["profile_id"] == pid), None)
        revision = int(previous["revision"]) + 1 if previous else 1
        payload = {"name": name, "profile_id": pid, "harness_id": "hermes", "provider": self.provider_id,
                   "revision": revision, "config": config, "capability_refs": list(data.get("capability_refs") or []),
                   "credential_source_ref": data.get("credential_source_ref"), "disabled": bool(data.get("disabled", False))}
        _safe(payload["credential_source_ref"] or {})
        payload["digest"] = _digest(payload)
        rows = self._read() + [payload]
        self.file.write_text(json.dumps(rows, sort_keys=True, indent=2), encoding="utf-8")
        return payload
    def get(self, profile_id: str, revision: int | None = None):
        rows = [x for x in self._read() if x["profile_id"] == profile_id and (revision is None or x["revision"] == revision)]
        if not rows: raise KeyError(profile_id)
        return rows[-1]
    def ref(self, profile_id: str, revision: int | None = None):
        p = self.get(profile_id, revision)
        return Ref(RefType.ARTIFACT, self.provider_id, p["profile_id"], metadata={"harness_id":"hermes", "revision":str(p["revision"]), "digest":p["digest"]})
    def resolve(self, contract_id: str, ref: Ref, *, context: ResourceResolutionContext | None = None):
        if contract_id != AgentBoxProfileV1.contract_id or ref.provider != self.provider_id: raise ValueError("Hermes ProfileRef provider mismatch")
        p = self.get(ref.native_id, int(ref.metadata.get("revision", "0")))
        if p["digest"] != ref.metadata.get("digest"): raise ValueError("PROFILE_DIGEST_DRIFT")
        return AgentBoxProfileV1(p["name"], "hermes", p["digest"], p["revision"], self.provider_id)

class HermesProfileSelector:
    compatibility = SelectorCompatibility(execution_provider_ids=frozenset({"hermes-execution"}), harness_types=frozenset({"hermes"}), supports_exact_revision=True, recommended=True)
    id = "hermes-profile"; contract_id = AgentBoxProfileV1.contract_id; title = "Hermes profile"
    fields = (SelectorField("profile_id", "Profile", kind="select"),)
    def __init__(self, provider): self.provider = provider
    def bind_registry(self, registry): self.registry = registry
    def choices(self, parameters): return tuple({"value":p["profile_id"], "label":f'{p["name"]} · r{p["revision"]}', "detail":p["digest"]} for p in self.provider.list_profiles() if not p.get("disabled"))
    def prepare(self, parameters, *, execution_id):
        ref = self.provider.ref(str(parameters.get("profile_id", "")))
        return ResourceSelection(self.contract_id, ref, ref.native_id, ref.metadata["digest"])
