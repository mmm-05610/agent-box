from __future__ import annotations
import hashlib, json, shutil
from pathlib import Path
from .repository import ProfileRepository
from ..codex.credentials import CodexCredentialSource
class Projection:
    def __init__(self, root:Path, repo:ProfileRepository, credential_source=None):
        self.root=root.resolve(); self.repo=repo; self.credential_source=credential_source or CodexCredentialSource()
    def preview(self, ref):
        v=self.repo.get(ref.profile_id,ref.revision)
        if v["digest"] != ref.digest: raise ValueError("PROFILE_DIGEST_DRIFT")
        return {"profile_ref": {"harness_id":ref.harness_id,"profile_id":ref.profile_id,"revision":ref.revision,"digest":ref.digest},
          "files":[{"path":"codex/config.toml","source":"immutable base + non-secret config","writable":False},{"path":"overlay/session.json","source":"execution-local overlay","writable":True}],
          "shared_capability_refs":v["capability_refs"],"credential_source_ref":v.get("credential_source_ref"),
          "credential_projection":{"identity":(v.get("credential_source_ref") or {}).get("native_locator") if v.get("credential_source_ref") else None,"method":"controlled-symlink" if v.get("credential_source_ref") else "none","materialized":False},"environment_names":sorted((v.get("config") or {}).get("environment",{}).keys()),
          "cleanup_policy":"remove execution directory after terminal receipt; recover by exact ref", "verification":{"can_verify":["manifest","paths","digest"],"provider_self_reports":["native consumption"],"cannot_prove":["model consumed instruction/MCP/credential"]}}
    def materialize(self, execution_id, ref):
        if not execution_id or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for c in execution_id): raise ValueError("INVALID_EXECUTION_ID")
        p=(self.root/execution_id).resolve(); self.root.mkdir(parents=True,exist_ok=True)
        if p.parent != self.root: raise ValueError("INVALID_EXECUTION_ID")
        preview=self.preview(ref); v=self.repo.get(ref.profile_id,ref.revision)
        p.mkdir(mode=0o700,exist_ok=True); (p/"overlay").mkdir(exist_ok=True)
        credential_projection=self.credential_source.project(p,v.get("credential_source_ref"))
        config=v.get("config") or {}
        def toml_string(value): return json.dumps(str(value), ensure_ascii=False)
        lines=[]
        for key in ("model","model_provider","approval_policy","sandbox_mode","web_search"):
            if key in config and isinstance(config[key], (str,bool,int,float)):
                value=config[key]
                lines.append(f"{key} = {json.dumps(value) if not isinstance(value,str) else toml_string(value)}")
        env=config.get("environment") if isinstance(config.get("environment"),dict) else {}
        if env:
            lines.append("\n[agent_box_environment]")
            for key,value in sorted(env.items()):
                lines.append(f"{key} = {toml_string(value)}")
        config_path=p/"config.toml"; config_path.write_text("\n".join(lines)+"\n",encoding="utf-8")
        config_digest="sha256:"+hashlib.sha256(config_path.read_bytes()).hexdigest()
        manifest={"schema_version":1,"profile_ref":preview["profile_ref"],"shared_capability_refs":preview["shared_capability_refs"],"credential_source_ref":preview["credential_source_ref"],"credential_projection":credential_projection,"environment_names":preview["environment_names"],"config_path":"config.toml","config_digest":config_digest}
        (p/"manifest.json").write_text(json.dumps(manifest,sort_keys=True),encoding="utf-8")
        return {"execution_id":execution_id,"directory":str(p),"config_path":str(config_path),"config_digest":config_digest,"manifest":manifest}
    def cleanup(self, execution_id: str) -> None:
        p=(self.root/execution_id).resolve()
        if p.parent != self.root: raise ValueError("INVALID_EXECUTION_ID")
        self.credential_source.cleanup(p)
        if p.exists(): shutil.rmtree(p)
