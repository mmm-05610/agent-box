"""Bounded, immutable local Agent Skills snapshot store."""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import stat
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping, Protocol

from agent_box.resource_contracts import AgentSkillV1
from agent_box.work_core import ProviderDescriptor, Ref, RefType, ResourceResolutionContext
from agent_box.protocols.host import ResourceLibraryDescriptor

PROVIDER_ID = "agent-skills"
_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$")
MAX_FILES, MAX_FILE, MAX_TOTAL, MAX_DEPTH = 128, 1024 * 1024, 8 * 1024 * 1024, 8
_FRONT = re.compile(r"^---\r?\n(?P<body>.*?)\r?\n---\r?\n", re.S)
_LINK = re.compile(r"\]\(([^)]+)\)")


def _json(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def _digest(files: list[dict[str, Any]], blobs: Mapping[str, bytes]) -> str:
    manifest: list[tuple[str, str, str]] = []
    directories: set[str] = set()
    for item in files:
        path = item["path"]
        parent = Path(path).parent
        while str(parent) != ".":
            directories.add(parent.as_posix()); parent = parent.parent
        manifest.append((path, "file", hashlib.sha256(blobs[path]).hexdigest()))
    manifest.extend((path, "dir", "") for path in directories)
    manifest.sort()
    canonical = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    return "sha256:" + hashlib.sha256(canonical).hexdigest()


def _slug(value: str) -> str:
    value = value.strip()
    if not _ID.fullmatch(value):
        raise ValueError("INVALID_SKILL_ID")
    return value


@dataclass(frozen=True)
class LocalSkillSource:
    """Private source capability used by a Harness adapter during projection."""
    _tree: Path = field(init=False, repr=False)

    def __init__(self, tree: Path):
        object.__setattr__(self, "_tree", tree)

    @property
    def path(self) -> Path:
        return self._tree

    def projection_source(self) -> Path:
        return self._tree


class SkillSourcePort(Protocol):
    """Private provider-to-projector port; never part of a public contract."""
    def projection_source(self) -> Path: ...


@dataclass(frozen=True)
class ResolvedAgentSkill:
    """Exact resolved Skill contract plus its ephemeral authorized source port."""
    contract: AgentSkillV1
    source: SkillSourcePort = field(repr=False, compare=False)

    @property
    def skill_id(self): return self.contract.skill_id
    @property
    def name(self): return self.contract.name
    @property
    def revision(self): return self.contract.revision
    @property
    def digest(self): return self.contract.digest

    def public_dict(self): return self.contract.public_dict()


class SkillStore:
    provider_id = PROVIDER_ID
    supported_contract_ids = frozenset({AgentSkillV1.contract_id})

    def __init__(self, root: Path):
        self.root = Path(root).resolve()

    def _ensure_storage(self) -> None:
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        (self.root / "skills").mkdir(mode=0o700, exist_ok=True)

    def _write_index(self) -> None:
        rows = []
        skills = self.root / "skills"
        for directory in sorted((p for p in skills.iterdir() if p.is_dir() and not p.is_symlink()), key=lambda p: p.name):
            value = self._latest(directory.name)
            if value is not None:
                rows.append({"skill_id": value["skill_id"], "revision": value["revision"], "digest": value["digest"], "disabled": bool(value.get("disabled"))})
        temporary = self.root / ".index.json.tmp"
        temporary.write_bytes(_json({"schema_version": 1, "skills": rows}))
        os.chmod(temporary, 0o600)
        os.replace(temporary, self.root / "index.json")

    def descriptor(self):
        return ProviderDescriptor(self.provider_id, "Agent Skills", "1")

    def library_descriptor(self):
        return ResourceLibraryDescriptor(self.provider_id, AgentSkillV1.contract_id, "Agent Skills", frozenset({"list", "get", "create_revision", "disable"}))
    def list_resources(self): return self.list()
    def get_resource(self, ref): return self.get(ref.native_id, int(ref.metadata.get("revision", "0")))
    def create_revision(self, source, **kwargs): return self.import_directory(source, **kwargs)

    @staticmethod
    def tree_digest(files, blobs):
        return _digest(files, blobs)

    def _skill_dir(self, skill_id: str) -> Path:
        skill_id = _slug(skill_id)
        path = (self.root / "skills" / skill_id).resolve()
        if path.parent != (self.root / "skills").resolve():
            raise ValueError("SKILL_PATH_ESCAPE")
        return path

    def _read_metadata(self, skill_id: str, revision: int) -> dict[str, Any]:
        if revision < 1:
            raise KeyError("SKILL_NOT_FOUND")
        path = self._skill_dir(skill_id) / "revisions" / str(revision) / "metadata.json"
        if path.is_symlink():
            raise ValueError("SKILL_SYMLINK_FORBIDDEN")
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError as exc:
            raise KeyError("SKILL_NOT_FOUND") from exc
        if value.get("skill_id") != skill_id or int(value.get("revision", 0)) != revision:
            raise ValueError("SKILL_IDENTITY_MISMATCH")
        if value.get("digest") != _digest(value["files"], self._blobs(skill_id, revision)):
            raise ValueError("SKILL_DIGEST_DRIFT")
        return value

    def _blobs(self, skill_id: str, revision: int) -> dict[str, bytes]:
        root = self._skill_dir(skill_id) / "revisions" / str(revision) / "tree"
        result = {}
        for item in sorted(root.rglob("*")):
            if item.is_symlink() or not item.is_file():
                raise ValueError("SKILL_TREE_UNSAFE")
            result[item.relative_to(root).as_posix()] = item.read_bytes()
        return result

    def _latest(self, skill_id: str) -> dict[str, Any] | None:
        revisions = self._skill_dir(skill_id) / "revisions"
        if not revisions.is_dir() or revisions.is_symlink():
            return None
        nums = [int(p.name) for p in revisions.iterdir() if p.is_dir() and not p.is_symlink() and p.name.isdigit()]
        return self._read_metadata(skill_id, max(nums)) if nums else None

    def _snapshot(self, source: Path) -> tuple[str, str, str, list[dict[str, Any]], dict[str, bytes]]:
        source = Path(source).expanduser()
        if not source.is_absolute():
            source = source.absolute()
        source = source.resolve(strict=True)
        if not source.is_dir() or source.is_symlink():
            raise ValueError("SKILL_DIRECTORY_REQUIRED")
        files: list[dict[str, Any]] = []; blobs: dict[str, bytes] = {}; total = 0
        for item in sorted(source.rglob("*")):
            rel = item.relative_to(source); parts = rel.parts
            if len(parts) > MAX_DEPTH or any(not part or part in {".", ".."} or len(part) > 96 for part in parts) or len(rel.as_posix()) > 256:
                raise ValueError("SKILL_PATH_LIMIT")
            if item.is_symlink() or not item.is_file() or not stat.S_ISREG(item.stat(follow_symlinks=False).st_mode):
                raise ValueError("SKILL_UNSAFE_FILE")
            data = item.read_bytes()
            if len(data) > MAX_FILE or total + len(data) > MAX_TOTAL:
                raise ValueError("SKILL_SIZE_LIMIT")
            path = rel.as_posix(); blobs[path] = data; files.append({"path": path, "size": len(data), "sha256": hashlib.sha256(data).hexdigest()}); total += len(data)
            if len(files) > MAX_FILES:
                raise ValueError("SKILL_FILE_COUNT_LIMIT")
        if "SKILL.md" not in blobs:
            raise ValueError("SKILL_MANIFEST_REQUIRED")
        try:
            text = blobs["SKILL.md"].decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError("SKILL_MANIFEST_UTF8_REQUIRED") from exc
        match = _FRONT.match(text)
        if not match:
            raise ValueError("SKILL_FRONTMATTER_REQUIRED")
        values: dict[str, str] = {}
        for line in match.group("body").splitlines():
            if ":" not in line:
                continue
            key, val = line.split(":", 1); key = key.strip(); val = val.strip().strip("\"'")
            if key in {"name", "description"}: values[key] = val
        name, description = values.get("name", ""), values.get("description", "")
        if not name or len(name) > 128 or not description or len(description) > 512:
            raise ValueError("SKILL_FRONTMATTER_INVALID")
        for target in _LINK.findall(text):
            if target.startswith(("/", "\\")) or ".." in Path(target).parts:
                raise ValueError("SKILL_REFERENCE_ESCAPE")
        return _slug(name), name, description, files, blobs

    def import_directory(self, source: Path, *, expected_revision: int | None = None, provenance: Mapping[str, str] | None = None) -> AgentSkillV1:
        self._ensure_storage()
        skill_id, name, description, files, blobs = self._snapshot(source)
        current = self._latest(skill_id); actual = int(current["revision"]) if current else 0
        if expected_revision is not None and actual != expected_revision:
            raise ValueError("REVISION_CONFLICT")
        digest = _digest(files, blobs)
        if current and expected_revision is None and current["digest"] == digest and not current.get("disabled", False):
            return self._value(current)
        revision = actual + 1; base = self._skill_dir(skill_id) / "revisions"; base.mkdir(mode=0o700, parents=True, exist_ok=True)
        tmp = Path(tempfile.mkdtemp(prefix=f".{revision}.", dir=base)); tree = tmp / "tree"; tree.mkdir(mode=0o700)
        try:
            for path, data in blobs.items():
                target = tree / path; target.parent.mkdir(mode=0o700, exist_ok=True); target.write_bytes(data); os.chmod(target, 0o600)
            metadata = {"skill_id": skill_id, "name": name, "description": description, "provider_id": PROVIDER_ID, "revision": revision, "digest": digest, "format": "agent-skills", "manifest_name": "SKILL.md", "disabled": False, "provenance": dict(provenance or {}), "files": files}
            (tmp / "metadata.json").write_bytes(_json(metadata)); os.chmod(tmp / "metadata.json", 0o600); os.replace(tmp, base / str(revision))
        except Exception:
            shutil.rmtree(tmp, ignore_errors=True); raise
        self._write_index()
        return self._value(metadata)

    def _source(self, skill_id: str, revision: int) -> LocalSkillSource:
        return LocalSkillSource(self._skill_dir(skill_id) / "revisions" / str(revision) / "tree")

    def _value(self, value: Mapping[str, Any]) -> AgentSkillV1:
        return AgentSkillV1(value["skill_id"], value["name"], value["description"], int(value["revision"]), value["digest"], provenance=value.get("provenance", {}), files=tuple(value["files"]))

    def _resolved(self, value: Mapping[str, Any]) -> ResolvedAgentSkill:
        return ResolvedAgentSkill(self._value(value), self._source(value["skill_id"], int(value["revision"])))

    def get(self, skill_id: str, revision: int | None = None) -> AgentSkillV1:
        value = self._latest(skill_id) if revision is None else self._read_metadata(skill_id, revision)
        if value is None or value.get("disabled"):
            raise KeyError("SKILL_NOT_FOUND" if value is None else "SKILL_DISABLED")
        return self._value(value)

    def list(self) -> tuple[AgentSkillV1, ...]:
        skills = self.root / "skills"
        if not skills.is_dir(): return ()
        values = []
        for item in sorted((p for p in skills.iterdir() if p.is_dir() and not p.is_symlink()), key=lambda p: p.name):
            value = self._latest(item.name)
            if value is not None and not value.get("disabled"):
                values.append(self._value(value))
        return tuple(values)

    def disable(self, skill_id: str, expected_revision: int) -> AgentSkillV1:
        current = self._read_metadata(skill_id, expected_revision)
        if current.get("disabled"): return self._value(current)
        source = self._source(skill_id, expected_revision); revision = expected_revision + 1; base = self._skill_dir(skill_id) / "revisions"; tmp = Path(tempfile.mkdtemp(prefix=f".{revision}.", dir=base)); shutil.copytree(source.path, tmp / "tree"); metadata = dict(current, revision=revision, disabled=True); (tmp / "metadata.json").write_bytes(_json(metadata)); os.replace(tmp, base / str(revision)); self._write_index(); return self._value(metadata)

    def ref(self, skill_id: str, revision: int | None = None) -> Ref:
        value = self.get(skill_id, revision)
        return Ref(RefType.ARTIFACT, PROVIDER_ID, value.skill_id, metadata={"revision": str(value.revision), "digest": value.digest, "format": value.format})

    def resolve(self, contract_id: str, ref: Ref, *, context: ResourceResolutionContext | None = None) -> ResolvedAgentSkill:
        del context
        if contract_id != AgentSkillV1.contract_id or ref.provider != PROVIDER_ID or ref.type is not RefType.ARTIFACT:
            raise ValueError("SKILL_REF_MISMATCH")
        value = self._read_metadata(ref.native_id, int(ref.metadata.get("revision", "0")))
        if value.get("disabled") or value.get("digest") != ref.metadata.get("digest") or ref.metadata.get("format") != "agent-skills":
            raise ValueError("SKILL_EXACT_RESOLVE_FAILED")
        return self._resolved(value)

class SkillLibrary:
    """Management view over the single SkillStore authority."""
    def __init__(self, store: SkillStore): self.store = store
    def descriptor(self): return self.store.library_descriptor()
    def list_resources(self): return self.store.list()
    def get_resource(self, ref): return self.store.get(ref.native_id, int(ref.metadata.get("revision", "0")))
    def create_revision(self, source, **kwargs): return self.store.import_directory(source, **kwargs)
    def disable(self, skill_id, revision): return self.store.disable(skill_id, revision)
