from __future__ import annotations
import os, re, shutil
from pathlib import Path
from agent_box.launch import LaunchPlan
from agent_box.resource_contracts import AgentBoxProfileV1, WorkspaceV1
from agent_box.work_core import Ref
from ..profiles.models import ProfileRef
from ..profiles.projection import Projection

class CodexLaunchAdapter:
    """Official Codex launch adapter; intentionally independent of bwrap."""
    def __init__(self, projection: Projection, *, binary: str | None = None):
        self.projection=projection; self.binary=binary or shutil.which("codex")
    def plan(self, *, execution_id: str, profile_ref: Ref, profile: AgentBoxProfileV1, workspace: WorkspaceV1) -> LaunchPlan:
        if not self.binary: raise RuntimeError("CODEX_BINARY_UNAVAILABLE")
        metadata=profile_ref.metadata
        exact=ProfileRef("codex",profile_ref.native_id,int(metadata.get("revision","0")),metadata.get("digest", ""),profile_ref.provider)
        materialized=self.projection.materialize(execution_id,exact)
        inherited={
            "PATH","HOME","USER","LOGNAME","LANG","LC_ALL","LC_CTYPE","LC_MESSAGES",
            "SSL_CERT_FILE","SSL_CERT_DIR","REQUESTS_CA_BUNDLE",
            # Network transport belongs to the native Harness process. These
            # values are passed through at launch time only; they are not
            # copied into the Profile, projection manifest, Binding, or
            # Evidence. Both cases are supported because common WSL tooling
            # uses either spelling.
            "HTTP_PROXY","HTTPS_PROXY","ALL_PROXY","NO_PROXY",
            "http_proxy","https_proxy","all_proxy","no_proxy",
        }
        env={key:value for key,value in os.environ.items() if key in inherited and value}
        env.update({"CODEX_HOME":materialized["directory"],"AGENT_BOX_PROFILE_REF":f"{exact.profile_id}@{exact.revision}"})
        stored=self.projection.repo.get(exact.profile_id,exact.revision)
        values=(stored.get("config") or {}).get("environment") or {}
        for key,value in values.items():
            if isinstance(key,str) and re.fullmatch(r"[A-Z][A-Z0-9_]{0,63}",key) and not re.search(r"(TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL|AUTH)",key):
                env[key]=str(value)
        return LaunchPlan([self.binary,"app-server","--stdio"],env,workspace.path,"codex",self.binary,[])
    def cleanup(self, execution_id: str) -> None:
        self.projection.cleanup(execution_id)
