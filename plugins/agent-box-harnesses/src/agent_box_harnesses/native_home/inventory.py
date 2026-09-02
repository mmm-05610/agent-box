"""EffectiveSkillInventory: bounded, credential-free skill facts at launch.

Derived from exactly two authorities (frozen):

    Profile   -> central-installed Skills (receipts) + Profile-local Skills
    Workspace -> Project Skills (native discovery roots of each Harness)

Entries are typed and bounded; the inventory NEVER claims a skill was
CONSUMED — only AVAILABLE / DISCOVERABLE / PROJECTED.  It carries no host
absolute paths, no credential paths, and no unbounded native payloads; it is
safe for Web read-only display and diagnostics.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping, Sequence

from .layout import ProfileLayout
from .policy import NativeHomePolicy
from .receipts import DRIFTED, INSTALLED, UPDATE_AVAILABLE, ReceiptStore

AVAILABLE = "AVAILABLE"
DISCOVERABLE = "DISCOVERABLE"
PROJECTED = "PROJECTED"
OVER_LIMIT = "OVER_LIMIT"
UNSUPPORTED = "UNSUPPORTED"
UNKNOWN = "UNKNOWN"

GIT_TIMEOUT_SECONDS = 5

# Bounded derivation limits for PROJECT skills.  Rationale: mirrors the
# central SkillStore import bounds (https: MAX_FILES=128, MAX_FILE=1 MiB,
# MAX_TOTAL=8 MiB, MAX_DEPTH=8) while tolerating richer project trees:
# project skills routinely carry scripts/assets, so files are capped at
# 2 MiB each and 32 MiB total; the directory fan-out is bounded to keep a
# single launch inventory cheap and honest.
MAX_PROJECT_SKILL_DIRECTORIES = 64       # scanned skill dirs per workspace
MAX_PROJECT_SKILL_FILES = 128            # files per project skill
MAX_PROJECT_SKILL_DEPTH = 16             # max directory depth below the skill
MAX_PROJECT_SKILL_FILE_BYTES = 2 * 1024 * 1024
MAX_PROJECT_SKILL_TOTAL_BYTES = 32 * 1024 * 1024
MAX_PUBLIC_INVENTORY_ENTRIES = 256
MAX_PUBLIC_FIELD_LENGTH = 256            # per-public-field byte bound


@dataclass(frozen=True)
class EffectiveSkillEntry:
    """One bounded skill fact (never CONSUMED)."""

    identity: str
    source_kind: str  # central-installed | profile-local | project
    claim: str        # AVAILABLE | DISCOVERABLE | PROJECTED
    revision: int = 0
    digest: str = ""
    native_target: str = ""   # guest-home-relative (central-installed/profile-local)
    project_path: str = ""    # worktree-relative (project)
    state: str = ""
    trust: str = "unknown"
    detail: str = ""

    def public(self) -> dict[str, object]:
        return {
            "identity": self.identity,
            "source_kind": self.source_kind,
            "claim": self.claim,
            "revision": self.revision,
            "digest": self.digest,
            "native_target": self.native_target,
            "project_path": self.project_path,
            "state": self.state,
            "trust": self.trust,
            "detail": self.detail[:256],
        }


@dataclass(frozen=True)
class ProjectSkillIdentity:
    """Typed identity of one project (worktree-owned) skill.

    ``repository_identity`` is the host worktree root; it is plugin-local
    and NEVER exposed in ``public()`` (frozen: no host absolute private
    paths in inventories).  The worktree-relative path is the public id.
    """

    repository_identity: str          # git worktree root (host path, plugin-local)
    relative_path: str                # worktree-relative dir e.g. ".claude/skills/review"
    skill_id: str
    git_commit: str | None = None
    tree_digest: str = ""
    dirty: bool | None = None
    ignored: bool | None = None
    trust_state: str = "untrusted"
    digest_warnings: tuple[str, ...] = ()

    def public(self) -> dict[str, object]:
        return {
            "relative_path": self.relative_path,
            "skill_id": self.skill_id,
            "git_commit": self.git_commit,
            "tree_digest": self.tree_digest,
            "dirty": self.dirty,
            "ignored": self.ignored,
            "trust_state": self.trust_state,
        }


@dataclass(frozen=True)
class EffectiveSkillInventory:
    harness_type: str
    profile_id: str | None = None
    entries: tuple[EffectiveSkillEntry, ...] = ()
    project_skills: tuple[ProjectSkillIdentity, ...] = ()
    warnings: tuple[str, ...] = ()

    def public(self) -> dict[str, object]:
        bounded = _bound(self.entries)
        return {
            "harness_type": self.harness_type,
            "profile_id": self.profile_id,
            "entries": [entry.public() for entry in bounded],
            "project_skills": [skill.public() for skill in self.project_skills[:MAX_PUBLIC_INVENTORY_ENTRIES]],
            "warnings": [_trim(warning) for warning in self.warnings[:16]],
            "summary": {
                "total": len(bounded),
                "total_unbounded": len(self.entries),
                "by_source": _count_by(bounded, "source_kind"),
                "by_claim": _count_by(bounded, "claim"),
            },
        }


def _count_by(entries: Sequence[EffectiveSkillEntry], key: str) -> Mapping[str, int]:
    counts: dict[str, int] = {}
    for entry in entries:
        value = getattr(entry, key)
        counts[value] = counts.get(value, 0) + 1
    return counts


def _tree_digest(root: Path, subdir: Path) -> tuple[str | None, tuple[str, ...]]:
    """Bounded, credential-free digest of one project skill tree.

    Returns (digest, warnings).  Over-limit or unsupported trees return
    ``digest=None`` with a typed warning — they are NEVER presented as
    complete/reproducible; symlinks and special files are never followed
    (fail closed as UNSUPPORTED).
    """
    rows: list[tuple[str, str, str]] = []
    total = 0
    files = 0
    warnings: list[str] = []
    for item in sorted(subdir.rglob("*")):
        try:
            relative = item.relative_to(subdir).as_posix()
        except ValueError:
            continue
        if len(relative.split("/")) > MAX_PROJECT_SKILL_DEPTH:
            warnings.append(f"depth-limit:{subdir.name}")
            return None, tuple(warnings[:4])
        if item.is_symlink():
            # fail closed: any symlink makes the whole tree UNSUPPORTED (a
            # partial digest would mislead as reproducible)
            warnings.append(f"unsupported:symlink:{subdir.name}:{relative[:96]}")
            return None, tuple(warnings[:4])
        if not (item.is_file() or item.is_dir()):
            warnings.append(f"unsupported:special:{subdir.name}:{relative[:96]}")
            return None, tuple(warnings[:4])
        if item.is_dir():
            rows.append((relative, "dir", ""))
            continue
        files += 1
        if files > MAX_PROJECT_SKILL_FILES:
            warnings.append(f"file-count-limit:{subdir.name}")
            return None, tuple(warnings[:4])
        data = item.read_bytes()
        if len(data) > MAX_PROJECT_SKILL_FILE_BYTES:
            warnings.append(f"file-size-limit:{subdir.name}:{relative[:96]}")
            return None, tuple(warnings[:4])
        total += len(data)
        if total > MAX_PROJECT_SKILL_TOTAL_BYTES:
            warnings.append(f"total-size-limit:{subdir.name}")
            return None, tuple(warnings[:4])
        rows.append((relative, "file", hashlib.sha256(data).hexdigest()))
    return "sha256:" + hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()).hexdigest(), tuple(warnings[:4])


def _is_skill_dir(directory: Path) -> bool:
    return directory.is_dir() and not directory.is_symlink() and (directory / "SKILL.md").is_file() and not (directory / "SKILL.md").is_symlink()


def _bound(entries: Sequence[EffectiveSkillEntry]) -> tuple[EffectiveSkillEntry, ...]:
    """Cap the public entry count (bounded inventories, frozen)."""
    return tuple(entries[:MAX_PUBLIC_INVENTORY_ENTRIES])


def _trim(value: object, limit: int = MAX_PUBLIC_FIELD_LENGTH) -> str:
    text = str(value)
    if len(text) <= limit:
        return text
    return text[:limit] + "…"


# --------------------------------------------------------------------------- #
# profile-local skills (no receipt, native home, unmanaged)
# --------------------------------------------------------------------------- #
def profile_skill_inventory(store, layout: ProfileLayout, policy: NativeHomePolicy, *, central_latest: Mapping[str, int] | None = None) -> EffectiveSkillInventory:
    """Central-installed (receipts) + Profile-local (unmanaged) skills."""
    entries: list[EffectiveSkillEntry] = []
    receipts = ReceiptStore(layout).list()
    managed_ids = set()
    if not layout.native_home.exists():
        return EffectiveSkillInventory(policy.harness_type, layout.profile_id, warnings=("native_home_missing",))
    for receipt in receipts:
        managed_ids.add(receipt.skill_id)
        target = layout.native_home / receipt.native_target
        actual = ""
        try:
            if target.is_dir():
                rows: list[tuple[str, str, str]] = []
                for relative in sorted(receipt.managed_files):
                    item = (target / relative).resolve()
                    if layout.native_home not in item.parents or not item.is_file():
                        raise ValueError("drift")
                    rows.append((relative, "file", hashlib.sha256(item.read_bytes()).hexdigest()))
                actual = "sha256:" + hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        except Exception:
            actual = ""
        state = INSTALLED
        detail = ""
        if actual != receipt.installed_tree_digest:
            state = DRIFTED
            detail = "installed tree digest mismatch"
        elif central_latest is not None and central_latest.get(receipt.skill_id, 0) > receipt.central_revision:
            state = UPDATE_AVAILABLE
            detail = "newer central revision available"
        entries.append(EffectiveSkillEntry(
            identity=receipt.skill_id,
            source_kind="central-installed",
            claim=AVAILABLE,
            revision=receipt.central_revision,
            digest=receipt.central_digest,
            native_target=receipt.native_target,
            state=state,
            trust="managed",
            detail=detail,
        ))
    # profile-local: unmanaged skill dirs under the skill target root
    skill_root = layout.native_home / policy.skill_targets[0]
    if skill_root.is_dir() and not skill_root.is_symlink():
        for candidate in sorted(skill_root.iterdir()):
            if not _is_skill_dir(candidate):
                continue
            skill_id = candidate.name
            if skill_id in managed_ids:
                continue
            entries.append(EffectiveSkillEntry(
                identity=skill_id,
                source_kind="profile-local",
                claim=DISCOVERABLE,
                native_target=f"{policy.skill_targets[0]}/{skill_id}",
                state="UNMANAGED",
                trust="profile-local",
                detail="present in the native home without a management receipt",
            ))
    return EffectiveSkillInventory(policy.harness_type, layout.profile_id, tuple(entries))


# --------------------------------------------------------------------------- #
# project skills (worktree authority; never imported, never modified)
# --------------------------------------------------------------------------- #
def _git(root: Path, *args: str) -> tuple[str | None, bool]:
    """Read-only git facts; returns (value, ok).  Never mutates the project."""
    try:
        result = subprocess.run(
            ["git", *args], cwd=str(root), capture_output=True, text=True,
            timeout=GIT_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return None, False
    if result.returncode != 0:
        return None, False
    return result.stdout.strip(), True


def project_skill_inventory(workspace_root: Path | None, harness_type: str, policy: NativeHomePolicy,
                            *, limit: int = MAX_PROJECT_SKILL_DIRECTORIES) -> tuple[ProjectSkillIdentity, ...]:
    """Discover project skills under the Harness's native project roots.

    Honest by construction: clean tracked skills record commit/tree digest;
    dirty skills are marked (never pretended reproducible); ignored skills
    are not auto-trusted; worktree root is the actual root; monorepos use
    the Harness official scope facts (the policy roots themselves).

    Bounds (frozen): at most ``limit`` skill directories per workspace are
    scanned; per-skill file/depth/byte limits are enforced inside
    ``_tree_digest``; over-limit or unsupported trees report
    state=OVER_LIMIT/UNSUPPORTED with an empty digest — never a pretend
    reproducible digest.  Git failure reports UNKNOWN (dirty=None,
    commit=None), never false "clean".
    """
    if workspace_root is None or not workspace_root.is_dir():
        return ()
    worktree, ok = _git(workspace_root, "rev-parse", "--show-toplevel")
    root = Path(worktree) if ok and worktree else workspace_root.resolve()
    commit, commit_ok = _git(root, "rev-parse", "HEAD")
    identities: list[ProjectSkillIdentity] = []
    for root_name in policy.project_skill_roots:
        base = root / root_name
        if not base.is_dir() or base.is_symlink():
            continue
        for candidate in sorted(base.iterdir()):
            if not _is_skill_dir(candidate):
                continue
            if len(identities) >= limit:
                break
            relative = candidate.relative_to(root).as_posix()
            dirty: bool | None = None
            if commit_ok:
                status, status_ok = _git(root, "status", "--porcelain", "--", relative)
                dirty = bool(status_ok and status) if status_ok else None
            else:
                dirty = None  # git unavailable: UNKNOWN, never "clean"
            _, ignored_ok = _git(root, "check-ignore", "--quiet", relative)
            ignored = bool(ignored_ok) if ignored_ok else None
            digest, warnings = _tree_digest(root, candidate)
            identities.append(ProjectSkillIdentity(
                repository_identity=str(root),
                relative_path=relative,
                skill_id=candidate.name,
                git_commit=commit,
                tree_digest=digest or "",
                dirty=dirty,
                ignored=ignored,
                trust_state="untrusted",
                digest_warnings=warnings,
            ))
    return tuple(identities)


def effective_skill_inventory(store, layout: ProfileLayout | None, policy: NativeHomePolicy, *, workspace_root: Path | None = None, central_latest: Mapping[str, int] | None = None) -> EffectiveSkillInventory:
    """The full, bounded launch-time inventory (profile + workspace)."""
    warnings: list[str] = []
    if layout is not None:
        inventory = profile_skill_inventory(store, layout, policy, central_latest=central_latest)
        entries = list(inventory.entries)
        if inventory.warnings:
            warnings.extend(inventory.warnings)
        profile_id = layout.profile_id
    else:
        entries = []
        profile_id = None
    project = project_skill_inventory(workspace_root, policy.harness_type, policy)
    for identity in project:
        if identity.digest_warnings:
            state = "OVER_LIMIT" if any("limit" in w for w in identity.digest_warnings) else UNSUPPORTED
            entry_digest = ""
            detail = "bounded derivation blocked: " + identity.digest_warnings[0]
            warnings.append(detail)
        else:
            state = ("DIRTY" if identity.dirty else ("IGNORED" if identity.ignored else "CLEAN"))
            entry_digest = identity.tree_digest
            if identity.dirty is None or identity.git_commit is None:
                state = UNKNOWN  # git facts unavailable: never pretend clean
            detail = "native project discovery root; not auto-imported, not auto-installed"
        entries.append(EffectiveSkillEntry(
            identity=identity.skill_id,
            source_kind="project",
            claim=DISCOVERABLE,
            digest=entry_digest,
            project_path=identity.relative_path,
            state=state,
            trust=identity.trust_state,
            detail=detail,
        ))
    return EffectiveSkillInventory(policy.harness_type, profile_id, tuple(entries), project, tuple(warnings))


__all__ = [
    "AVAILABLE",
    "DISCOVERABLE",
    "PROJECTED",
    "EffectiveSkillEntry",
    "EffectiveSkillInventory",
    "ProjectSkillIdentity",
    "effective_skill_inventory",
    "profile_skill_inventory",
    "project_skill_inventory",
]