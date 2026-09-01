"""Claude-owned ProfileRef and native settings projection.

The repository stores only non-secret profile material. Session trees, caches,
credential values and native runtime residue are deliberately not accepted.
"""
from __future__ import annotations
import hashlib, json, re, shutil
from pathlib import Path
from dataclasses import dataclass
from typing import Any
from agent_box.resource_contracts import AgentBoxProfileV1
from agent_box.work_core import Ref, RefType, ProviderDescriptor
from agent_box.work_core.registry import ResourceResolutionContext

SECRET = re.compile(r"(secret|token|api.?key|password|private.?key|authorization|cookie|credential|auth.?json)", re.I)

def _check(value: Any):
    if isinstance(value, dict):
        for k, v in value.items():
            if SECRET.search(str(k)) and str(k) != "credential_locator":
                raise ValueError("SECRET_FIELD_FORBIDDEN")
            if str(k) == "credential_locator" and not isinstance(v, dict):
                raise ValueError("INVALID_CREDENTIAL_LOCATOR")
            _check(v)
    elif isinstance(value, list):
        for item in value: _check(item)
    elif isinstance(value, str) and len(value) > 8192:
        raise ValueError("PROFILE_FIELD_TOO_LARGE")

def _digest(value: Any) -> str:
    return "sha256:" + hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()

@dataclass(frozen=True)
class ClaudeProfileRef:
    profile_id: str
    revision: int
    digest: str
    provider: str = "claude-code-profile"
    harness_id: str = "claude-code"
    def as_ref(self):
        return Ref(RefType.ARTIFACT, self.provider, self.profile_id,
                   metadata={"harness_id": self.harness_id, "revision": str(self.revision), "digest": self.digest})

class ClaudeProfileProvider:
    provider_id = "claude-code-profile"
    supported_contract_ids = frozenset({AgentBoxProfileV1.contract_id})
    def __init__(self, root: Path):
        self.root = Path(root).resolve() / "profiles"
        self.root.mkdir(parents=True, exist_ok=True)
    def descriptor(self): return ProviderDescriptor(self.provider_id, "Claude Code Profile", "0.1.0")
    def _path(self, profile_id, revision): return self.root / profile_id / f"{revision}.json"
    @staticmethod
    def _valid_id(profile_id):
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,96}", str(profile_id)): raise ValueError("INVALID_PROFILE_ID")
    def put(self, profile_id: str, value: dict[str, Any], revision: int = 1) -> ClaudeProfileRef:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,96}", profile_id) or revision < 1: raise ValueError("INVALID_PROFILE_ID")
        _check(value); payload = {"profile_id": profile_id, "revision": revision, "harness_id": "claude-code", "profile": value}
        path = self._path(profile_id, revision); path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, sort_keys=True, ensure_ascii=False), encoding="utf-8")
        return ClaudeProfileRef(profile_id, revision, _digest(payload))
    def get(self, profile_id, revision):
        self._valid_id(profile_id)
        value = json.loads(self._path(profile_id, revision).read_text(encoding="utf-8"))
        if value["harness_id"] != "claude-code" or value["profile_id"] != profile_id or value["revision"] != revision: raise ValueError("PROFILE_CORRUPT")
        return value
    def make_ref(self, profile_id, revision=1):
        value = self.get(profile_id, revision)
        return ClaudeProfileRef(profile_id, revision, _digest(value))
    def list_profiles(self):
        rows=[]
        for directory in sorted(self.root.iterdir()) if self.root.exists() else ():
            if directory.is_dir():
                for path in sorted(directory.glob("*.json")):
                    value=json.loads(path.read_text(encoding="utf-8")); rows.append(ClaudeProfileRef(directory.name, int(value["revision"]), _digest(value)))
        return tuple(rows)

class ClaudeContinuationResourceProvider:
    provider_id="claude-code-continuation"
    supported_contract_ids=frozenset({"agent-box.claude-continuation@1"})
    def descriptor(self): return ProviderDescriptor(self.provider_id,"Claude native continuation","0.1.0")
    def resolve(self, contract_id, ref, *, context: ResourceResolutionContext | None=None):
        from .contracts import ClaudeContinuationV1
        del context
        if contract_id != ClaudeContinuationV1.contract_id or ref.provider != self.provider_id or ref.type is not RefType.SESSION: raise ValueError("Claude continuation Ref mismatch")
        return ClaudeContinuationV1(ref.native_id, ref.metadata.get("project_key", ""))
    def resolve(self, contract_id, ref, *, context=None):
        del context
        if contract_id != AgentBoxProfileV1.contract_id: raise ValueError("PROFILE_CONTRACT_MISMATCH")
        if ref.provider != self.provider_id or ref.type is not RefType.ARTIFACT: raise ValueError("PROFILE_REF_MISMATCH")
        revision = int(ref.metadata.get("revision", "0")); value = self.get(ref.native_id, revision)
        if _digest(value) != ref.metadata.get("digest"): raise ValueError("PROFILE_DIGEST_DRIFT")
        return AgentBoxProfileV1(ref.native_id, "claude-code", ref.metadata["digest"], revision, self.provider_id)

class ClaudeProjection:
    """Materializes actual Claude Code native files under an execution home."""
    def __init__(self, root: Path, repository: ClaudeProfileProvider): self.root, self.repository = Path(root).resolve(), repository
    def materialize(self, execution_id: str, ref: ClaudeProfileRef, *, resources=()):
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", execution_id): raise ValueError("INVALID_EXECUTION_ID")
        data = self.repository.get(ref.profile_id, ref.revision)["profile"]
        root = self.root / execution_id; claude = root / ".claude"; claude.mkdir(parents=True, exist_ok=True)
        settings = dict(data.get("settings", {})); _check(settings)
        (claude / "settings.json").write_text(json.dumps(settings, sort_keys=True, indent=2) + "\n", encoding="utf-8")
        # Dynamic resources are execution inputs, never Profile content.
        for resource in resources:
            kind, name, content = resource
            if kind == "instruction":
                (root / name).parent.mkdir(parents=True, exist_ok=True); (root / name).write_text(content, encoding="utf-8")
            elif kind == "mcp":
                (root / ".mcp.json").write_text(json.dumps({"mcpServers": {name: content}}, sort_keys=True, indent=2) + "\n", encoding="utf-8")
            elif kind == "skill":
                target = root / ".claude" / "skills" / name / "SKILL.md"; target.parent.mkdir(parents=True, exist_ok=True); target.write_text(content, encoding="utf-8")
        manifest = {"profile_ref": {"id": ref.profile_id, "revision": ref.revision, "digest": ref.digest}, "native_files": sorted(str(p.relative_to(root)) for p in root.rglob("*") if p.is_file()), "credential_locator": data.get("credential_locator"), "dynamic_resource_kinds": sorted({r[0] for r in resources})}
        (root / "agent-box-manifest.json").write_text(json.dumps(manifest, sort_keys=True, indent=2) + "\n", encoding="utf-8")
        return root
    def cleanup(self, execution_id):
        target = (self.root / execution_id).resolve()
        if target.parent != self.root: raise ValueError("INVALID_EXECUTION_ID")
        if target.exists(): shutil.rmtree(target)
