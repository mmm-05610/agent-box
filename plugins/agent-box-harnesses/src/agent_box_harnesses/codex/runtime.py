from pathlib import Path
from agent_box.resource_contracts import AgentBoxProfileV1
from agent_box.work_core import RefType
from agent_box_harnesses.profiles.repository import ProfileRepository
from agent_box_harnesses.profiles.projection import Projection
from .credentials import CodexCredentialSource
class CodexProfileProvider:
    """Harness-owned ResourceProvider for exact immutable Codex profiles."""

    provider_id="codex-profile"
    supported_contract_ids=frozenset({AgentBoxProfileV1.contract_id})
    def __init__(self,root):
        self.repo=ProfileRepository(Path(root)/"profiles"); self.projection=Projection(Path(root)/"projections",self.repo,CodexCredentialSource())
    def descriptor(self):
        from agent_box.work_core.registry import ProviderDescriptor
        return ProviderDescriptor(self.provider_id,"Codex Profile","1")
    def make_ref(self,name,revision=None): return self.repo.ref(name,revision).as_ref()
    def resolve(self,contract_id,ref,*,context=None):
        del context
        if contract_id != AgentBoxProfileV1.contract_id:
            raise ValueError("PROFILE_CONTRACT_MISMATCH")
        if ref.provider != self.provider_id: raise ValueError("PROFILE_PROVIDER_MISMATCH")
        if ref.type is not RefType.ARTIFACT: raise ValueError("PROFILE_REF_TYPE_MISMATCH")
        v=self.repo.get(ref.native_id,int(ref.metadata.get("revision","0")))
        if v["digest"] != ref.metadata.get("digest"): raise ValueError("PROFILE_DIGEST_DRIFT")
        if ref.metadata.get("harness_id") != v["harness_id"]:
            raise ValueError("PROFILE_HARNESS_MISMATCH")
        return AgentBoxProfileV1(v["profile_id"],v["harness_id"],v["digest"],v["revision"],self.provider_id)
