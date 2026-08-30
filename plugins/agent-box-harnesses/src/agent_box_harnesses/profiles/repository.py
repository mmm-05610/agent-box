from __future__ import annotations
import hashlib, json, os, re
from pathlib import Path
from typing import Any
from .models import ProfileRef
from .schema import normalize_profile, validate_public_value

_ID = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$")
_SECRET = re.compile(r"(secret|token|api[_-]?key|private[_-]?key|password|authorization|credential_value)", re.I)
_MAX = 64 * 1024

def _canonical(v: Any) -> bytes:
    return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
def _check(v: Any, path="root") -> None:
    if len(_canonical(v)) > _MAX: raise ValueError("PROFILE_TOO_LARGE")
    if isinstance(v, dict):
        for k, x in v.items():
            if not isinstance(k, str) or len(k) > 80 or _SECRET.search(k): raise ValueError("SECRET_FIELD_FORBIDDEN")
            _check(x, f"{path}.{k}")
    elif isinstance(v, list):
        if len(v) > 128: raise ValueError("FIELD_LIMIT_EXCEEDED")
        for x in v: _check(x, path)
    elif isinstance(v, str) and len(v) > 8192: raise ValueError("FIELD_TOO_LARGE")

class ProfileRepository:
    def __init__(self, root: Path):
        self.root = root.resolve(); self.root.mkdir(parents=True, exist_ok=True)
    def _dir(self, pid):
        if not isinstance(pid, str) or not _ID.fullmatch(pid): raise ValueError("INVALID_PROFILE_ID")
        p=(self.root/pid).resolve()
        if p.parent != self.root: raise ValueError("INVALID_PROFILE_ID")
        return p
    def _read(self, pid, rev):
        p=self._dir(pid)/f"r{rev}.json"
        try: return json.loads(p.read_text(encoding="utf-8"))
        except FileNotFoundError: raise KeyError("PROFILE_NOT_FOUND")
    def list(self):
        out=[]
        for d in sorted(self.root.iterdir() if self.root.exists() else [], key=lambda x:x.name):
            if not d.is_dir() or not _ID.fullmatch(d.name): continue
            versions=sorted(d.glob("r*.json"), key=lambda x:int(x.stem[1:]))
            if versions:
                v=json.loads(versions[-1].read_text()); out.append(self.summary(v))
        return tuple(out)
    @staticmethod
    def summary(v):
        return {k:v[k] for k in ("harness_id","profile_id","name","revision","digest","provider","disabled")}
    def get(self,pid,rev=None):
        if rev is None:
            versions=sorted(self._dir(pid).glob("r*.json"), key=lambda x:int(x.stem[1:]))
            if not versions: raise KeyError("PROFILE_NOT_FOUND")
            rev=int(versions[-1].stem[1:])
        return self._read(pid,int(rev))
    def save(self, data: dict, expected_revision: int|None=None):
        pid=data.get("profile_id") or data.get("name","").strip().lower().replace(" ","-")
        if not _ID.fullmatch(pid): raise ValueError("INVALID_PROFILE_ID")
        d=self._dir(pid); versions=sorted(d.glob("r*.json")) if d.exists() else []
        current=int(versions[-1].stem[1:]) if versions else 0
        if expected_revision is not None and current != expected_revision: raise ValueError("REVISION_CONFLICT")
        revision=current+1
        # Keep the legacy v1 digest byte-for-byte compatible when callers use
        # the established ``config`` input. New importer/UI fields are
        # normalized into config only when no explicit config was supplied.
        if isinstance(data.get("config"), dict):
            validate_public_value(data["config"])
            config = data["config"]
        else:
            config = normalize_profile(data)
        payload={"schema_version":1,"harness_id":"codex","profile_id":pid,"name":str(data.get("name") or pid)[:128],
                 "provider":str(data.get("provider") or "codex-profile"),"revision":revision,"disabled":bool(data.get("disabled",False)),
                 "config":config,"capability_refs":data.get("capability_refs") or [],"credential_source_ref":data.get("credential_source_ref"),
                 "session_overlay_policy":data.get("session_overlay_policy") or {"mode":"execution-local"}}
        if "import_provenance" in data:
            payload["import_provenance"] = data["import_provenance"]
        _check(payload["config"]); _check(payload["capability_refs"]); _check(payload["credential_source_ref"])
        payload["digest"]="sha256:"+hashlib.sha256(_canonical({k:v for k,v in payload.items() if k not in {"digest","revision"}})).hexdigest()
        d.mkdir(mode=0o700, parents=True, exist_ok=True); target=d/f"r{revision}.json"; tmp=target.with_suffix(".tmp")
        tmp.write_bytes(_canonical(payload)); os.chmod(tmp,0o600); tmp.replace(target)
        return payload
    def ref(self,pid,rev=None):
        v=self.get(pid,rev); return ProfileRef(v["harness_id"],pid,v["revision"],v["digest"],v["provider"])
