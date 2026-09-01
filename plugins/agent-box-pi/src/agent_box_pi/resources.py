"""Provider-owned Pi SessionRef resolution; continuation is a new Dispatch."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
from agent_box.work_core import ProviderDescriptor, Ref, RefType, ResourceResolutionContext
from agent_box.extensions import ResourceSelection, SelectorField, SelectorCompatibility
from agent_box.resource_contracts import AgentBoxProfileV1
from .config import PiPluginConfig
from .contract import PiContinuationV1

class PiSessionResourceProvider:
    provider_id="pi-session"
    supported_contract_ids=frozenset({PiContinuationV1.contract_id})
    def __init__(self, config_loader=PiPluginConfig.load): self._config_loader=config_loader
    def descriptor(self): return ProviderDescriptor(self.provider_id,"Pi native sessions","0.2.0")
    def resolve(self, contract_id, ref, *, context=None):
        if contract_id != PiContinuationV1.contract_id or ref.provider != self.provider_id: raise ValueError("Pi SessionRef mismatch")
        path=ref.metadata.get("session_file")
        if not path:
            root=self._config_loader().resolved_session_root
            matches=[p for p in root.rglob(f"*_{ref.native_id}.jsonl") if p.is_file()] if root.is_dir() else []
            path=str(max(matches,key=lambda p:p.stat().st_mtime)) if matches else None
        if not path or not Path(path).is_file(): raise ValueError("Pi native session is unavailable")
        digest=ref.metadata.get("digest","")
        if digest and digest != "sha256:"+hashlib.sha256(Path(path).read_bytes()).hexdigest(): raise ValueError("Pi session drift")
        return PiContinuationV1(ref.metadata.get("session_id",ref.native_id), path, ref.metadata.get("provider","deepseek"), ref.metadata.get("model",""), digest)


class PiProfileProvider:
    provider_id = "pi-profile"
    supported_contract_ids = frozenset({AgentBoxProfileV1.contract_id})
    def __init__(self, root): self.root=Path(root); self.root.mkdir(parents=True, exist_ok=True); self.file=self.root/"profiles.json"
    def descriptor(self): return ProviderDescriptor(self.provider_id, "Pi Profile", "0.2.0")
    def list_profiles(self):
        rows = [{"profile_id":"pi-default","revision":1,"digest":"sha256:pi-default","name":"Pi default","harness_id":"pi","config":{}}] if not self.file.exists() else json.loads(self.file.read_text(encoding="utf-8"))
        latest = {}
        for row in rows:
            if row["profile_id"] not in latest or int(row["revision"]) > int(latest[row["profile_id"]]["revision"]): latest[row["profile_id"]] = row
        return tuple(latest[key] for key in sorted(latest))
    def get_profile(self, profile_id, revision=None):
        all_rows = [{"profile_id":"pi-default","revision":1,"digest":"sha256:pi-default","name":"Pi default","harness_id":"pi","config":{}}] if not self.file.exists() else json.loads(self.file.read_text(encoding="utf-8"))
        latest = max((row for row in all_rows if row["profile_id"] == profile_id), key=lambda row: int(row["revision"]), default=None)
        rows = [row for row in all_rows if row["profile_id"] == profile_id and (revision is None and row is latest or revision is not None and int(row["revision"]) == revision)]
        if not rows: raise KeyError(profile_id)
        return rows[0]
    def save(self, data, *, expected_revision=None):
        pid=str(data.get("profile_id") or data.get("name") or "").strip()
        if not pid: raise ValueError("PROFILE_NAME_REQUIRED")
        rows=([{"profile_id":"pi-default","revision":1,"digest":"sha256:pi-default","name":"Pi default","harness_id":"pi","config":{}}] if not self.file.exists() else json.loads(self.file.read_text(encoding="utf-8"))); current=next((row for row in rows if row["profile_id"] == pid and int(row["revision"]) == max(int(item["revision"]) for item in rows if item["profile_id"] == pid)), None)
        if expected_revision is not None and (current is None or int(current["revision"]) != expected_revision): raise ValueError("REVISION_CONFLICT")
        value={"profile_id":pid,"name":str(data.get("name") or pid),"harness_id":"pi","config":dict(data.get("config") or {}),"capability_refs":list(data.get("capability_refs") or []),"credential_source_ref":data.get("credential_source_ref"),"session_overlay_policy":data.get("session_overlay_policy") or {}}
        revision=int(current["revision"])+1 if current else 1; value["revision"]=revision
        value["digest"]="sha256:"+hashlib.sha256(json.dumps(value,sort_keys=True,separators=(",",":")).encode()).hexdigest()
        self.file.write_text(json.dumps(rows+[value],sort_keys=True),encoding="utf-8")
        return value
    def resolve(self, contract_id, ref, *, context: ResourceResolutionContext | None = None):
        del context
        row=self.get_profile(ref.native_id, int(ref.metadata.get("revision","0")))
        if contract_id != AgentBoxProfileV1.contract_id or ref.provider != self.provider_id or ref.metadata.get("digest") != row["digest"]: raise ValueError("Pi ProfileRef mismatch or drift")
        return AgentBoxProfileV1(ref.native_id, "pi", row["digest"], 1, self.provider_id)


class PiProfileSelector:
    compatibility = SelectorCompatibility(execution_provider_ids=frozenset({"pi"}), harness_types=frozenset({"pi"}), supports_exact_revision=True, recommended=True)
    id="pi-profile-selector"; contract_id=AgentBoxProfileV1.contract_id; title="Pi profile"; fields=(SelectorField("profile_id","Profile",kind="select"),)
    def __init__(self, provider): self.provider=provider
    def prepare(self, parameters, *, execution_id):
        del execution_id
        row=self.provider.get_profile(str(parameters.get("profile_id",""))); ref=Ref(RefType.ARTIFACT,self.provider.provider_id,row["profile_id"],metadata={"harness_id":"pi","revision":"1","digest":row["digest"]})
        return ResourceSelection(self.contract_id, ref, row["profile_id"], row["digest"])


class PiManager:
    harness_id="pi"
    def __init__(self, provider): self.provider=provider
    def descriptor(self): return {"id":"pi","display_name":"Pi","version":"third-party","status":"ready","supported":True}
    def list_profiles(self): return self.provider.list_profiles()
    def get_profile(self, profile_id, revision=None): return self.provider.get_profile(profile_id, revision)
