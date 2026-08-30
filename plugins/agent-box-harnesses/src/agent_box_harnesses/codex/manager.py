from __future__ import annotations
from agent_box.extensions import ResourceSelection, SelectorField
from agent_box.resource_contracts import AgentBoxProfileV1
from agent_box.work_core import RefType
from agent_box.work_core.providers.resources import profile_contract_digest
from .runtime import CodexProfileProvider
from ..profiles.repository import _check

class CodexHarnessManager:
    harness_id="codex"
    def __init__(self, root): self.provider=CodexProfileProvider(root); self.repo=self.provider.repo; self.credentials=self.provider.projection.credential_source
    def descriptor(self): return {"id":"codex","display_name":"Codex","version":"1","status":"ready","supported":True,"extension_points":["pi","opencode","claude"]}
    def list_profiles(self): return self.repo.list()
    def get_profile(self,pid,revision=None): return self.repo.get(pid,revision)
    def _validate_config(self, data):
        mode=(data.get("config") or {}).get("sandbox_mode", "workspace-write")
        if mode not in {"read-only", "workspace-write"}: raise ValueError("INVALID_SANDBOX_MODE")
        self.credentials.validate(data.get("credential_source_ref"))
    def create(self,data): self._validate_config(data); return self.repo.save(data)
    def update(self,pid,data,expected): self._validate_config(data); data={**data,"profile_id":pid}; return self.repo.save(data,expected)
    def disable(self,pid,revision):
        v=self.repo.get(pid,revision); return self.repo.save({**v,"config":v["config"],"disabled":True},revision)
    def validate(self,data):
        errors=[]
        if not str(data.get("name","")).strip(): errors.append("PROFILE_NAME_REQUIRED")
        try:
            _check(data.get("config") or {}); _check(data.get("capability_refs") or []); _check(data.get("credential_source_ref")); self._validate_config(data)
        except Exception as e: errors.append(str(e))
        return {"valid":not errors,"errors":errors}
    def projection_preview(self,pid,revision=None): return self.provider.projection.preview(self.repo.ref(pid,revision))
    def diagnostics(self):
        credential=self.credentials.diagnostics(); binary=self.credentials.binary; version="unavailable"
        if binary:
            import subprocess
            try: version=subprocess.run([binary,"--version"],capture_output=True,text=True,timeout=5,check=False).stdout.strip()[:128] or "unknown"
            except (OSError, subprocess.SubprocessError): version="unknown"
        return {"harness_id":"codex","status":"ready","checks":[{"id":"profile-store","status":"ok"},{"id":"codex-binary","status":"ok" if binary else "unavailable","version":version},{"id":"credential-source","status":"available" if credential["available"] else "unavailable","login_status":credential["login_status"],"locator":credential["locator"]}],"secret_policy":"credential values are never read by the Web API"}

class CodexProfileSelector:
    id="agent-box-profile"; contract_id=AgentBoxProfileV1.contract_id; title="Codex profile"; fields=(SelectorField("profile_id","Profile",kind="select"),)
    def __init__(self, manager): self.manager=manager; self.registry=None
    def bind(self,registry): self.registry=registry
    def choices(self,parameters): return tuple({"value":x["profile_id"],"label":f'{x["name"]} · r{x["revision"]}',"detail":x["digest"]} for x in self.manager.list_profiles() if not x["disabled"])
    def prepare(self,parameters,*,execution_id):
        ref=self.manager.repo.ref(parameters.get("profile_id","").strip()); return ResourceSelection(self.contract_id,ref.as_ref(),f'{ref.profile_id} · revision {ref.revision}',f'{ref.profile_id} · {ref.digest}')
