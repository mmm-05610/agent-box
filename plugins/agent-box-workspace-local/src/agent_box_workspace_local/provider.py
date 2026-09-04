"""Local live workspace: honest semantics for operating on real user projects.

The provider registers real project directories and resolves them to the
live Workspace contract.  It never copies, never creates detached worktrees,
and never pretends the execution input is frozen: Refs, metadata and
digests always carry the live/externally-mutable facts.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Optional

from agent_box.resource_contracts import WorkspaceV1
from agent_box.work_core.models import Ref, RefType
from agent_box.work_core.registry import ProviderDescriptor

PROVIDER_ID = "local-live-workspace"
WORKSPACE_CONTRACT_ID = WorkspaceV1.contract_id

WORKSPACE_META_MODE = "workspace_mode"
WORKSPACE_META_MUTABILITY = "mutability"
WORKSPACE_META_FROZEN = "input_frozen"
OBSERVATION_SOURCE_SHARED = "shared_live_workspace"

DEFAULT_MAX_FILES = 500
DEFAULT_MAX_DEPTH = 6
DEFAULT_MAX_TOTAL_BYTES = 4_000_000
DEFAULT_TIME_BUDGET_SECONDS = 2.0


class WorkspaceLocalError(RuntimeError):
    """Typed fail-closed error for the local live workspace provider."""


class ProjectNotRegistered(WorkspaceLocalError):
    pass


class ProjectIdentityConflict(WorkspaceLocalError):
    """The registered root moved, was replaced by a symlink, or no longer
    matches its registered canonical identity."""


class ProjectPathRejected(WorkspaceLocalError):
    """The registration request itself is refused fail-closed: an empty or
    whitespace path, or a path that is itself a symlink."""


@dataclass(frozen=True)
class InventoryLimits:
    max_files: int = DEFAULT_MAX_FILES
    max_depth: int = DEFAULT_MAX_DEPTH
    max_total_bytes: int = DEFAULT_MAX_TOTAL_BYTES
    time_budget_seconds: float = DEFAULT_TIME_BUDGET_SECONDS


@dataclass(frozen=True)
class ProjectRegistration:
    project_id: str
    path: str
    registered_at: str


@dataclass(frozen=True)
class WorkspaceObservation:
    """A bounded baseline/after observation of one live project root.

    ``coverage`` is honest: ``partial`` means the walk hit a hard boundary.
    """

    project_id: str
    kind: str  # "baseline" | "after"
    git_tracked: bool
    git_head: Optional[str]
    git_status_digest: Optional[str]
    inventory_digest: str
    files_seen: int
    truncated: bool
    symlink_skipped: int
    coverage: str  # "complete" | "partial"
    observed_at: str
    details: Mapping[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class WorkspaceChangeReport:
    """Diff between a baseline and an after observation.

    Live mode can never attribute changes to one actor: the user, an
    editor, and the Harness share the same directory.  Any change is
    therefore reported with ``source=shared_live_workspace``.
    """

    project_id: str
    changed: bool
    changed_paths: tuple[str, ...]
    source: str
    baseline: WorkspaceObservation
    after: WorkspaceObservation
    note: str = ""


def _digest(payload: object) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


REGISTRY_DB_FILENAME = "workspace-registry.db"


class LocalLiveWorkspaceProvider:
    """Resource Provider for `agent-box.workspace@1` in live mode.

    The registry backend is the provider's own SQLite database.  The
    ``registry_path`` constructor argument is the registry *database* path
    (Phase 1 passed a ``projects.json`` path here; that JSON format was a
    Phase-1 test artifact only and is neither read nor migrated — no
    migration is needed or performed).
    """

    supported_contract_ids = frozenset({WORKSPACE_CONTRACT_ID})

    def __init__(
        self,
        registry_path: Path,
        *,
        limits: InventoryLimits | None = None,
        fault_hook: Any | None = None,
    ) -> None:
        self._registry_path = Path(registry_path)
        self._limits = limits or InventoryLimits()
        self._lock = threading.Lock()
        # Documented test seam, mirroring the Session Store: lets tests
        # crash between durable registration steps.
        self._fault_hook = fault_hook
        from .registry import ProjectRegistry

        self._registry = ProjectRegistry(
            self._registry_path, fault_hook=fault_hook
        )

    def close(self) -> None:
        """Close the registry database connection (test/teardown helper)."""
        self._registry.close()

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(
            PROVIDER_ID, "Local live workspace", "1",
        )

    # -- project registry -------------------------------------------------

    def register_project(self, path: Path | str) -> ProjectRegistration:
        """Register one real user directory as a live project root.

        The path is canonicalized once at registration; it must be a
        non-empty existing directory and must not itself be a symlink.
        Nothing is copied or materialized.  The canonical resolved path is
        stored and drives all identity checks.
        """
        # Checked on the raw argument before any Path normalization: Path("")
        # would otherwise collapse to "." (the CWD) and get registered.
        raw_text = path if isinstance(path, str) else str(path)
        if not raw_text.strip():
            raise ProjectPathRejected(
                "project path must be a non-empty directory path"
            )
        raw = Path(path)
        if raw.is_symlink():  # lstat-based: rejects symlinked roots themselves
            raise ProjectPathRejected(
                "project root must be a real directory, not a symlink"
            )
        if not raw.exists() or not raw.is_dir():
            raise WorkspaceLocalError("project root must be an existing directory")
        canonical = str(raw.resolve())
        project_id = "proj_" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]
        with self._lock:
            project_id, canonical, registered_at = self._registry.register(
                project_id, canonical
            )
        return ProjectRegistration(
            project_id=project_id, path=canonical, registered_at=registered_at
        )

    def list_projects(self) -> tuple[ProjectRegistration, ...]:
        return tuple(
            ProjectRegistration(project_id, path, registered_at)
            for project_id, path, registered_at in self._registry.list()
        )

    def get_project(self, project_id: str) -> ProjectRegistration:
        row = self._registry.get(project_id)
        if row is None:
            raise ProjectNotRegistered(f"project not registered: {project_id}")
        return ProjectRegistration(*row)

    def _verified_root(self, project_id: str) -> Path:
        """The registered root, re-verified against its canonical identity.

        Fails closed when the directory was moved, replaced by a symlink, or
        otherwise no longer matches the registered canonical path.
        """
        project = self.get_project(project_id)
        registered = Path(project.path)
        if not registered.exists() or not registered.is_dir():
            raise ProjectIdentityConflict(
                "registered project root is missing or not a directory"
            )
        current = registered.resolve()
        if current != registered:
            raise ProjectIdentityConflict(
                "registered project root no longer matches its canonical identity"
            )
        return registered

    # -- Ref surface --------------------------------------------------------

    def make_ref(self, project_id: str) -> Ref:
        project = self.get_project(project_id)
        return Ref(
            RefType.WORKSPACE,
            PROVIDER_ID,
            project.project_id,
            metadata={
                WORKSPACE_META_MODE: "live",
                WORKSPACE_META_MUTABILITY: "externally_mutable",
                WORKSPACE_META_FROZEN: "false",
            },
        )

    def resolve(
        self,
        contract_id: str,
        ref: Ref,
        *,
        context: Any = None,
    ) -> WorkspaceV1:
        if contract_id != WORKSPACE_CONTRACT_ID:
            raise WorkspaceLocalError(f"unsupported contract: {contract_id}")
        if ref.provider != PROVIDER_ID:
            raise WorkspaceLocalError("ref does not belong to this provider")
        # A live workspace must never be presented as a frozen input.
        if ref.metadata.get(WORKSPACE_META_FROZEN) == "true":
            raise WorkspaceLocalError(
                "ref claims a frozen input but this provider is live/unfrozen"
            )
        if ref.metadata.get(WORKSPACE_META_MODE, "live") != "live":
            raise WorkspaceLocalError("ref workspace_mode is not live")
        root = self._verified_root(ref.native_id)
        identity_digest = _digest(
            {"provider": PROVIDER_ID, "project_id": ref.native_id, "mode": "live"}
        )
        return WorkspaceV1(path=root, source_digest=f"live-unfrozen:{identity_digest}")

    # -- observations ---------------------------------------------------------

    def _is_git(self, root: Path) -> bool:
        marker = root / ".git"
        return marker.exists()

    def _git_facts(self, root: Path) -> tuple[Optional[str], Optional[str]]:
        head = None
        try:
            result = subprocess.run(
                ["git", "-C", str(root), "rev-parse", "HEAD"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                head = result.stdout.strip() or None
            status = subprocess.run(
                ["git", "-C", str(root), "status", "--porcelain"],
                capture_output=True, text=True, timeout=10,
            )
            status_digest = _digest(status.stdout) if status.returncode == 0 else None
        except (OSError, subprocess.TimeoutExpired):
            return None, None
        return head, status_digest

    def _walk_inventory(self, root: Path) -> tuple[str, int, bool, int, dict[str, str]]:
        """Bounded tree inventory with hard files/depth/bytes/time limits."""
        limits = self._limits
        deadline = time.monotonic() + limits.time_budget_seconds
        manifest: dict[str, str] = {}
        files_seen = 0
        truncated = False
        symlink_skipped = 0
        total_bytes = 0
        root_depth = len(root.parts)
        for current, dirs, names in os.walk(root, followlinks=False):
            here = Path(current)
            depth = len(here.parts) - root_depth
            if depth >= limits.max_depth:
                dirs[:] = []
                truncated = True
            kept_dirs = []
            for name in dirs:
                if (here / name).is_symlink():
                    symlink_skipped += 1
                    truncated = True
                else:
                    kept_dirs.append(name)
            dirs[:] = kept_dirs
            for name in sorted(names):
                entry = here / name
                rel = entry.relative_to(root).as_posix()
                if rel.startswith("..") or "/../" in f"/{rel}":
                    raise WorkspaceLocalError("inventory path escaped the root")
                if entry.is_symlink():
                    symlink_skipped += 1
                    truncated = True
                    continue
                if not entry.is_file():
                    continue
                if files_seen >= limits.max_files:
                    truncated = True
                    break
                try:
                    stat = entry.stat()
                except OSError:
                    truncated = True
                    continue
                files_seen += 1
                total_bytes += stat.st_size
                manifest[rel] = f"{stat.st_size}:{stat.st_mtime_ns}"
                if total_bytes >= limits.max_total_bytes:
                    truncated = True
                    break
            if truncated:
                break
            if time.monotonic() > deadline:
                truncated = True
                break
        return _digest(manifest), files_seen, truncated, symlink_skipped, manifest

    def observe(self, project_id: str, *, kind: str) -> WorkspaceObservation:
        root = self._verified_root(project_id)
        git_tracked = self._is_git(root)
        head = status_digest = None
        if git_tracked:
            head, status_digest = self._git_facts(root)
        inventory_digest, files_seen, truncated, symlink_skipped, manifest = (
            self._walk_inventory(root)
        )
        coverage = "partial" if truncated else "complete"
        details: dict[str, str] = {
            "source": OBSERVATION_SOURCE_SHARED,
            "mode": "live",
            "mutability": "externally_mutable",
            "input_frozen": "false",
            "inventory_files": str(files_seen),
        }
        if status_digest is not None:
            details["git_status_digest"] = status_digest
        if truncated:
            details["truncation"] = (
                "inventory hit a bounded files/depth/bytes/time limit"
            )
        return WorkspaceObservation(
            project_id=project_id,
            kind=kind,
            git_tracked=git_tracked,
            git_head=head,
            git_status_digest=status_digest,
            inventory_digest=inventory_digest,
            files_seen=files_seen,
            truncated=truncated,
            symlink_skipped=symlink_skipped,
            coverage=coverage,
            observed_at=_now_iso(),
            details=details,
        )

    def baseline_observation(self, project_id: str) -> WorkspaceObservation:
        """Capture the pre-dispatch baseline of the live root."""
        return self.observe(project_id, kind="baseline")

    def after_observation(
        self, project_id: str, baseline: WorkspaceObservation
    ) -> WorkspaceChangeReport:
        """Re-observe after a Turn and diff against the baseline.

        Changes are never attributed to a single actor in live mode; they
        are always reported as ``shared_live_workspace`` facts.
        """
        after = self.observe(project_id, kind="after")
        if baseline.project_id != after.project_id:
            raise WorkspaceLocalError("baseline belongs to another project")
        changed_paths: list[str] = []
        if (
            baseline.git_head != after.git_head
            or baseline.git_status_digest != after.git_status_digest
            or baseline.inventory_digest != after.inventory_digest
        ):
            changed_paths = ["<workspace-state>"]
        report = WorkspaceChangeReport(
            project_id=project_id,
            changed=bool(changed_paths),
            changed_paths=tuple(changed_paths),
            source=OBSERVATION_SOURCE_SHARED if changed_paths else "none",
            baseline=baseline,
            after=after,
            note=(
                "live workspace changes cannot be attributed to one actor"
                if changed_paths
                else "no observable change since baseline"
            ),
        )
        return report
