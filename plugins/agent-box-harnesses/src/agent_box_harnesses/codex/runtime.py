from pathlib import Path
from agent_box.work_core.providers.resources import AgentBoxProfileResourceProvider
from agent_box_harnesses.profiles.repository import ProfileRepository
from agent_box_harnesses.profiles.projection import Projection
from .credentials import CodexCredentialSource
class CodexProfileProvider(AgentBoxProfileResourceProvider):
    provider_id="codex-profile"
    def __init__(self,root):
        self.repo=ProfileRepository(Path(root)/"profiles"); self.projection=Projection(Path(root)/"projections",self.repo,CodexCredentialSource())
    def descriptor(self):
        from agent_box.work_core.registry import ProviderDescriptor
        return ProviderDescriptor(self.provider_id,"Codex Profile","1")
    def make_ref(self,name,revision=None): return self.repo.ref(name,revision).as_ref()
    def resolve(self,contract_id,ref):
        if ref.provider != self.provider_id: raise ValueError("PROFILE_PROVIDER_MISMATCH")
        v=self.repo.get(ref.native_id,int(ref.metadata.get("revision","0")))
        if v["digest"] != ref.metadata.get("digest"): raise ValueError("PROFILE_DIGEST_DRIFT")
        return __import__("agent_box.resource_contracts",fromlist=["AgentBoxProfileV1"]).AgentBoxProfileV1(v["profile_id"],"codex",v["digest"],v["revision"],self.provider_id)
