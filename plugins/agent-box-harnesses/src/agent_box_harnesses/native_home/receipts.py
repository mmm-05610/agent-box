"""Typed ProfileSkillInstallation receipts (Agent-Box managed, not native).

A receipt records ONE central SkillRef installed into ONE Profile Native
Home at ONE native target, with the installed tree digest and the managed
file inventory — the authority for install/update/remove/drift decisions.

The central SkillStore never learns a Harness-specific target; the Harnesses
installer never redefines Skill content authority (it verifies the source
tree against the central digest).  Receipts are stored at
``installed-skills.json`` inside the profile layout.
"""
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Mapping, Sequence

from .failures import ProfileNativeHomeError
from .layout import ProfileLayout

RECEIPT_SCHEMA_VERSION = 1

# Receipt states: INSTALLED is persisted; the rest are computed at inventory
# time from the receipt + central store + native tree.
INSTALLED = "INSTALLED"
UPDATE_AVAILABLE = "UPDATE_AVAILABLE"
DRIFTED = "DRIFTED"
DISABLED = "DISABLED"
CONFLICTED = "CONFLICTED"

_ID = __import__("re").compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$")


def _token(value: str, name: str, limit: int = 256) -> str:
    if not isinstance(value, str) or not value or len(value) > limit or "\0" in value:
        raise ProfileNativeHomeError(f"INVALID_RECEIPT_{name}", str(value)[:64])
    return value


@dataclass(frozen=True)
class ProfileSkillInstallation:
    """One managed installation receipt."""

    profile_id: str
    harness_type: str
    profile_revision: int
    skill_id: str
    central_revision: int
    central_digest: str
    installed_tree_digest: str
    native_target: str  # guest-home-relative directory, e.g. ".claude/skills/review"
    managed_files: tuple[str, ...] = ()
    state: str = INSTALLED
    installed_at: str = ""
    provenance: Mapping[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        for name, value in (("profile_id", self.profile_id), ("harness_type", self.harness_type), ("skill_id", self.skill_id)):
            if not _ID.fullmatch(str(value)):
                raise ProfileNativeHomeError(f"INVALID_RECEIPT_{name.upper()}", str(value)[:64])
        if self.profile_revision < 1 or self.central_revision < 1:
            raise ProfileNativeHomeError("INVALID_RECEIPT_REVISION")
        for name, value in (("central_digest", self.central_digest), ("installed_tree_digest", self.installed_tree_digest)):
            if not str(value).startswith("sha256:"):
                raise ProfileNativeHomeError(f"INVALID_RECEIPT_{name.upper()}", str(value)[:64])
        _token(self.native_target, "NATIVE_TARGET", 256)
        if self.native_target.startswith("/") or ".." in self.native_target.split("/"):
            raise ProfileNativeHomeError("INVALID_RECEIPT_NATIVE_TARGET", self.native_target[:128])
        if self.state not in {INSTALLED, DISABLED}:
            raise ProfileNativeHomeError("INVALID_RECEIPT_STATE", self.state)

    @property
    def skill_ref(self) -> dict[str, object]:
        return {
            "skill_id": self.skill_id,
            "revision": self.central_revision,
            "digest": self.central_digest,
        }

    def public(self) -> dict[str, object]:
        return {
            "profile_id": self.profile_id,
            "harness_type": self.harness_type,
            "profile_revision": self.profile_revision,
            "skill": self.skill_ref,
            "installed_tree_digest": self.installed_tree_digest,
            "native_target": self.native_target,
            "managed_files": list(self.managed_files)[:256],
            "state": self.state,
            "installed_at": self.installed_at,
            "provenance": dict(self.provenance),
        }

    def to_dict(self) -> dict[str, object]:
        return {
            "profile_id": self.profile_id,
            "harness_type": self.harness_type,
            "profile_revision": self.profile_revision,
            "skill_id": self.skill_id,
            "central_revision": self.central_revision,
            "central_digest": self.central_digest,
            "installed_tree_digest": self.installed_tree_digest,
            "native_target": self.native_target,
            "managed_files": list(self.managed_files),
            "state": self.state,
            "installed_at": self.installed_at,
            "provenance": dict(self.provenance),
        }

    @classmethod
    def from_dict(cls, value: Mapping[str, object]) -> "ProfileSkillInstallation":
        return cls(
            profile_id=str(value["profile_id"]),
            harness_type=str(value["harness_type"]),
            profile_revision=int(value["profile_revision"]),
            skill_id=str(value["skill_id"]),
            central_revision=int(value["central_revision"]),
            central_digest=str(value["central_digest"]),
            installed_tree_digest=str(value["installed_tree_digest"]),
            native_target=str(value["native_target"]),
            managed_files=tuple(str(item) for item in value.get("managed_files", ())),
            state=str(value.get("state", INSTALLED)),
            installed_at=str(value.get("installed_at", "")),
            provenance=dict(value.get("provenance", {})),
        )


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def receipts_digest(receipts: Sequence[ProfileSkillInstallation]) -> str:
    """Credential-free identity of the installed set (binds to profile revision)."""
    rows = sorted(
        (r.skill_id, r.central_revision, r.central_digest, r.installed_tree_digest, r.native_target)
        for r in receipts
    )
    return "sha256:" + hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


class ReceiptStore:
    """Typed, atomic installed-skills.json index per profile."""

    def __init__(self, layout: ProfileLayout) -> None:
        self.layout = layout

    def _path(self) -> Path:
        return self.layout.installed_skills_json

    def list(self) -> tuple[ProfileSkillInstallation, ...]:
        path = self._path()
        if not path.exists():
            return ()
        if path.is_symlink():
            raise ProfileNativeHomeError("RECEIPTS_SYMLINK_FORBIDDEN")
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise ProfileNativeHomeError("RECEIPTS_READ_FAILED", type(exc).__name__) from exc
        if value.get("schema_version") != RECEIPT_SCHEMA_VERSION or not isinstance(value.get("skills"), list):
            raise ProfileNativeHomeError("RECEIPTS_SCHEMA_INVALID")
        return tuple(ProfileSkillInstallation.from_dict(item) for item in value["skills"])

    def get(self, skill_id: str) -> ProfileSkillInstallation | None:
        return next((r for r in self.list() if r.skill_id == skill_id), None)

    def _write(self, receipts: Sequence[ProfileSkillInstallation]) -> None:
        payload = {"schema_version": RECEIPT_SCHEMA_VERSION, "skills": [r.to_dict() for r in receipts]}
        self.write_bytes((json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode())

    def write_bytes(self, raw: bytes) -> None:
        """Atomic durable index write (also used by rollback recovery)."""
        from .durable import atomic_write_durable

        self.layout.base.mkdir(mode=0o700, parents=True, exist_ok=True)
        atomic_write_durable(self._path(), raw)

    def put(self, receipt: ProfileSkillInstallation) -> None:
        others = [r for r in self.list() if r.skill_id != receipt.skill_id]
        self._write((*others, receipt))

    def remove(self, skill_id: str) -> ProfileSkillInstallation | None:
        receipts = self.list()
        remaining = [r for r in receipts if r.skill_id != skill_id]
        removed = next((r for r in receipts if r.skill_id == skill_id), None)
        if removed is None:
            return None
        self._write(tuple(remaining))
        return removed

    def index_bytes(self) -> bytes:
        """Raw current index bytes ('' when absent); used for tx snapshots."""
        path = self._path()
        if not path.is_file():
            return b""
        if path.is_symlink():
            raise ProfileNativeHomeError("RECEIPTS_SYMLINK_FORBIDDEN")
        return path.read_bytes()

    def restore_bytes(self, raw: bytes) -> None:
        """Atomic restore of a transaction snapshot (rollback/recovery)."""
        if not raw:
            # absence is a valid previous state: remove the index
            self._path().unlink(missing_ok=True)
            return
        self.write_bytes(raw)

    def digest(self) -> str:
        if not self._path().is_file():
            return ""
        return receipts_digest(self.list())


__all__ = [
    "CONFLICTED",
    "DISABLED",
    "DRIFTED",
    "INSTALLED",
    "ProfileSkillInstallation",
    "RECEIPT_SCHEMA_VERSION",
    "ReceiptStore",
    "UPDATE_AVAILABLE",
    "now",
    "receipts_digest",
]