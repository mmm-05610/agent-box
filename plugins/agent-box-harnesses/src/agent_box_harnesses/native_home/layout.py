"""Authoritative plugin-local storage layout for one Profile Native Home.

Layout (frozen in the phase-2 specification):

    profiles/<harness_type>/<profile_id>/
    ├── native-home/             the ONE active native environment
    ├── profile.json             mutable current-state pointer (identity/revision/
    │                            digest/generations; never a second authority)
    ├── installed-skills.json    Agent-Box managed installation receipts index
    ├── revisions/<revision>/    immutable envelope evidence per revision
    ├── transactions/            skill-install journals + mutation lease
    └── recovery/                recovery views and generation markers

Only ``ProfileLayout`` builds these paths; nothing else may guess them.
"""
from __future__ import annotations

import re
from pathlib import Path

from ..native_home.failures import ProfileNativeHomeError

_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$")
EXECUTION_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


def validate_identity(harness_type: str, profile_id: str) -> None:
    if not _ID.fullmatch(str(harness_type)):
        raise ProfileNativeHomeError("INVALID_HARNESS_TYPE", str(harness_type)[:64])
    if not _ID.fullmatch(str(profile_id)):
        raise ProfileNativeHomeError("INVALID_PROFILE_ID", str(profile_id)[:64])


def _contained(base: Path, candidate: Path) -> Path:
    resolved = candidate.resolve()
    anchor = base.resolve()
    if resolved != anchor and anchor not in resolved.parents:
        raise ProfileNativeHomeError("PROFILE_PATH_ESCAPE", str(candidate))
    return resolved


class ProfileLayout:
    """One profile's storage topology; all paths are derived, never guessed."""

    def __init__(self, root: Path, harness_type: str, profile_id: str) -> None:
        validate_identity(harness_type, profile_id)
        self.root = Path(root).resolve()
        self.harness_type = harness_type
        self.profile_id = profile_id
        base = self.root / harness_type / profile_id
        self.base = _contained(self.root, base) if base.exists() else base
        if self.base.parent.parent != self.root:
            raise ProfileNativeHomeError("PROFILE_PATH_ESCAPE", str(base))

    @property
    def native_home(self) -> Path:
        return self.base / "native-home"

    @property
    def profile_json(self) -> Path:
        return self.base / "profile.json"

    @property
    def installed_skills_json(self) -> Path:
        return self.base / "installed-skills.json"

    @property
    def revisions(self) -> Path:
        return self.base / "revisions"

    @property
    def transactions(self) -> Path:
        return self.base / "transactions"

    @property
    def recovery(self) -> Path:
        return self.base / "recovery"

    @property
    def mutation_lease(self) -> Path:
        return self.transactions / "mutation.lease.json"

    @property
    def active_executions(self) -> Path:
        return self.transactions / "active"

    def revision_dir(self, revision: int) -> Path:
        return _contained(self.revisions, self.revisions / str(int(revision)))

    def recovery_view_dir(self, execution_id: str) -> Path:
        if not EXECUTION_ID.fullmatch(str(execution_id)):
            raise ProfileNativeHomeError("INVALID_EXECUTION_ID", str(execution_id)[:128])
        return _contained(self.recovery, self.recovery / execution_id)

    def active_execution_marker(self, execution_id: str) -> Path:
        if not EXECUTION_ID.fullmatch(str(execution_id)):
            raise ProfileNativeHomeError("INVALID_EXECUTION_ID", str(execution_id)[:128])
        return _contained(self.active_executions, self.active_executions / f"{execution_id}.json")


__all__ = ["EXECUTION_ID", "ProfileLayout", "validate_identity"]