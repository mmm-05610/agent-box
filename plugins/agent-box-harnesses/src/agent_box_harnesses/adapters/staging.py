"""Execution-scoped materialization for rendered native artifacts.

This is the single Harnesses-owned writer for execution-scoped guest content
(rendered native configuration files).  With a Profile, the execution home
is a policy-governed copy of the Profile Native Home plus declared ephemeral
overlays (see ``native_home/view.py``); without a Profile this area writes
the rendered files into a fresh execution-scoped home.  Adapters and the
Composer never touch the filesystem; everything converges here and is then
exposed to the Root chain only as ordinary prepared runtime sources.
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Sequence

from agent_box.protocols.runtime.protocol import content_digest

from .composer import FinalFile, RenderedTarget

EXECUTION_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
MAX_STAGED_FILES = 512


@dataclass(frozen=True)
class StagedFile:
    rel_path: str
    digest: str
    size: int

    def __post_init__(self) -> None:
        if not self.digest or len(self.digest) != 64 or any(c not in "0123456789abcdef" for c in self.digest):
            raise ValueError("STAGED_FILE_DIGEST_MUST_BE_RAW_SHA256_HEX")


def logical_digest(files: Sequence[StagedFile]) -> str:
    """Canonical files-only identity of a staged tree (plan-comparable)."""
    rows = sorted(((item.rel_path, "file", item.digest) for item in files))
    return "sha256:" + hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


@dataclass(frozen=True)
class StagedHome:
    """The materialized native home for one execution."""

    root: Path
    files: tuple[StagedFile, ...]

    @property
    def logical_digest(self) -> str:
        return logical_digest(self.files)

    @property
    def tree_digest(self) -> str:
        return content_digest(self.root)


class ExecutionStagingArea:
    """Single writer for one execution's rendered native home.

    Used for profile-less launches (an empty home receiving the rendered
    files).  Profile-based launches materialize through ``NativeHomeView``
    (the same staging root), which owns its own reconcile/cleanup.
    """

    def __init__(self, root: Path, execution_id: str) -> None:
        if not EXECUTION_ID.fullmatch(str(execution_id)):
            raise ValueError("INVALID_EXECUTION_ID")
        base = Path(root).resolve()
        self._base = base
        self.root = base / str(execution_id) / "home"
        if self.root.parent.parent != base:
            raise ValueError("INVALID_EXECUTION_ID")

    def materialize(self, rendered: RenderedTarget) -> StagedHome:
        if self.root.exists():
            raise ValueError("EXECUTION_STAGING_ALREADY_MATERIALIZED")
        self.root.mkdir(mode=0o700, parents=True)
        staged: list[StagedFile] = []
        try:
            for item in rendered.files:
                staged.append(self._write_rendered(item))
        except Exception:
            shutil.rmtree(self.root, ignore_errors=True)
            raise
        return StagedHome(self.root, tuple(sorted(staged, key=lambda item: item.rel_path)))

    def cleanup(self) -> dict[str, object]:
        execution_root = self.root.parent
        if not execution_root.exists():
            return {"status": "already_cleaned"}
        shutil.rmtree(execution_root, ignore_errors=True)
        return {"status": "cleaned"}

    def _write_rendered(self, item: FinalFile) -> StagedFile:
        rel = self._rel(item.guest_path)
        target = self.root / rel
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        target.write_bytes(item.content)
        return StagedFile(rel, hashlib.sha256(item.content).hexdigest(), len(item.content))

    @staticmethod
    def _rel(guest_path: str) -> str:
        return home_relative_path(guest_path)


def plan_home_logical_digest(rendered: RenderedTarget) -> str:
    """The home digest a plan declares before materialization happens.

    Computed from the same file inventory the staging writer will produce so
    lowering can compare the plan's declared identity against the staged
    reality (fail closed) without reading any file at plan time.  For
    Profile-based launches this is the declared overlay identity; the full
    native home tree digest is verified by lowering / the assembler against
    the materialized view.
    """
    files: list[StagedFile] = []
    for item in rendered.files:
        rel = home_relative_path(item.guest_path)
        files.append(StagedFile(rel, item.digest.removeprefix("sha256:"), len(item.content)))
    return logical_digest(files)


def home_relative_path(guest_path: str) -> str:
    prefix = "/runtime/home/"
    if not guest_path.startswith(prefix):
        raise ValueError("rendered file must live under the profile home")
    rel = guest_path[len(prefix):]
    if not rel or rel.startswith("/") or ".." in rel.split("/"):
        raise ValueError("rendered file home-relative path is invalid")
    return rel


__all__ = [
    "ExecutionStagingArea",
    "StagedFile",
    "StagedHome",
    "logical_digest",
    "plan_home_logical_digest",
]
