"""Minimal WSL live-workspace provider.

The provider owns only a verified mapping of a remote Project identity to a
remote POSIX path.  It does not copy files, invoke WSL, or persist business
state; connection verification and lifecycle are supplied by the host layer.
"""
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

from agent_box.resource_contracts import WorkspaceV1
from agent_box.protocols.runtime import RuntimeHostRef
from agent_box.work_core.models import Ref, RefType
from agent_box.work_core.registry import ProviderDescriptor

PROVIDER_ID = "wsl-live-workspace"
WORKSPACE_CONTRACT_ID = WorkspaceV1.contract_id


class WslWorkspaceError(RuntimeError):
    """Base fail-closed error for the WSL workspace provider."""


class ProjectIdentityConflict(WslWorkspaceError):
    """A Ref does not match the registered connection/project/path tuple."""


class ProjectPathRejected(WslWorkspaceError):
    """The remote path is not a safe absolute POSIX project path."""


@dataclass(frozen=True)
class WslProjectRegistration:
    project_id: str
    connection_id: str
    connection_revision: int
    remote_path: str
    runtime_ref_digest: str


@dataclass(frozen=True)
class WslWorkspaceObservation:
    """Content-free observation of a remote live project.

    File inventory is owned by the target/HostBridge.  Until that typed
    observation operation is available, the provider reports identity-only
    coverage rather than pretending a local filesystem walk occurred.
    """

    project_id: str
    kind: str
    git_tracked: bool = False
    git_head: str | None = None
    git_status_digest: str | None = None
    inventory_digest: str = ""
    files_seen: int = 0
    truncated: bool = False
    symlink_skipped: int = 0
    coverage: str = "unknown"
    observed_at: str = ""
    details: dict[str, str] | None = None


@dataclass(frozen=True)
class WslWorkspaceChangeReport:
    project_id: str
    changed: bool
    changed_paths: tuple[str, ...]
    source: str
    baseline: WslWorkspaceObservation
    after: WslWorkspaceObservation
    note: str = ""


def _remote_path(value: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ProjectPathRejected("remote project path is required")
    if "\x00" in value or "\\" in value:
        raise ProjectPathRejected("remote project path must be a POSIX path")
    path = PurePosixPath(value)
    if not path.is_absolute() or ".." in path.parts:
        raise ProjectPathRejected("remote project path must be absolute and confined")
    return str(path)


def _identity_digest(registration: WslProjectRegistration) -> str:
    payload = {
        "provider": PROVIDER_ID,
        "connection_id": registration.connection_id,
        "connection_revision": registration.connection_revision,
        "project_id": registration.project_id,
        "remote_path": registration.remote_path,
        "runtime_ref_digest": registration.runtime_ref_digest,
        "mode": "wsl-live",
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


class WslLiveWorkspaceProvider:
    """C2.2 skeleton for a live workspace located in WSL.

    Registration is deliberately in-memory at this stage.  The host
    Connection catalog remains the authority for connection identity; this
    provider only validates the exact tuple handed to it.
    """

    supported_contract_ids = frozenset({WORKSPACE_CONTRACT_ID})

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(PROVIDER_ID, "Agent-Box WSL Live Workspace", "0.1.0a1")

    def __init__(
        self,
        host_operations: object | None = None,
        registry_path: Path | None = None,
    ) -> None:
        self._projects: dict[str, WslProjectRegistration] = {}
        self._runtime_refs: dict[str, object] = {}
        self.host_operations = host_operations
        self._registry_path = Path(registry_path) if registry_path is not None else None
        self._load_registry()

    def _load_registry(self) -> None:
        if self._registry_path is None or not self._registry_path.exists():
            return
        try:
            payload = json.loads(self._registry_path.read_text(encoding="utf-8"))
            if payload.get("version") != 1 or not isinstance(payload.get("projects"), list):
                raise ValueError("unsupported WSL workspace registry")
            for item in payload["projects"]:
                if not isinstance(item, dict):
                    raise ValueError("malformed WSL workspace registry entry")
                registration = WslProjectRegistration(
                    project_id=item["project_id"],
                    connection_id=item["connection_id"],
                    connection_revision=int(item["connection_revision"]),
                    remote_path=_remote_path(item["remote_path"]),
                    runtime_ref_digest=item["runtime_ref_digest"],
                )
                if registration.connection_revision <= 0:
                    raise ValueError("invalid WSL Connection revision")
                ref_data = item["runtime_ref"]
                runtime_ref = RuntimeHostRef(
                    provider=ref_data["provider"],
                    native_id=ref_data["native_id"],
                    identity_digest=ref_data["identity_digest"],
                    affinity=ref_data["affinity"],
                    schema_version=ref_data.get("schema_version", 1),
                )
                if runtime_ref.identity_digest != registration.runtime_ref_digest:
                    raise ValueError("WSL workspace runtime ref digest mismatch")
                self._projects[registration.project_id] = registration
                self._runtime_refs[registration.project_id] = runtime_ref
        except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
            raise WslWorkspaceError("WSL workspace registry is invalid") from error

    def _persist_registry(self) -> None:
        if self._registry_path is None:
            return
        projects = []
        for project_id, registration in sorted(self._projects.items()):
            runtime_ref = self._runtime_refs.get(project_id)
            if not isinstance(runtime_ref, RuntimeHostRef):
                raise WslWorkspaceError(
                    "durable WSL workspace registration requires a typed RuntimeHostRef"
                )
            projects.append(
                {
                    "project_id": registration.project_id,
                    "connection_id": registration.connection_id,
                    "connection_revision": registration.connection_revision,
                    "remote_path": registration.remote_path,
                    "runtime_ref_digest": registration.runtime_ref_digest,
                    "runtime_ref": {
                        "provider": runtime_ref.provider,
                        "native_id": runtime_ref.native_id,
                        "identity_digest": runtime_ref.identity_digest,
                        "affinity": runtime_ref.affinity,
                        "schema_version": runtime_ref.schema_version,
                    },
                }
            )
        self._registry_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self._registry_path.with_suffix(self._registry_path.suffix + ".tmp")
        temporary.write_text(
            json.dumps({"version": 1, "projects": projects}, sort_keys=True),
            encoding="utf-8",
        )
        os.replace(temporary, self._registry_path)

    def register_project(
        self,
        *,
        connection_id: str,
        project_id: str,
        remote_path: str,
        runtime_host_ref: object,
    ) -> WslProjectRegistration:
        if not connection_id or not project_id:
            raise ProjectIdentityConflict("connection and project identities are required")
        runtime_ref = getattr(runtime_host_ref, "ref", None)
        receipt = getattr(getattr(runtime_host_ref, "port", None), "receipt", None)
        runtime_ref_digest = getattr(runtime_ref, "identity_digest", None)
        if not isinstance(runtime_ref_digest, str) or receipt is None:
            raise ProjectIdentityConflict("workspace requires a verified runtime ref")
        connection_revision = getattr(receipt, "revision", None)
        if not isinstance(connection_revision, int) or connection_revision <= 0:
            raise ProjectIdentityConflict("workspace requires an exact Connection revision")
        if (
            getattr(receipt, "connection_id", None) != connection_id
            or getattr(receipt, "project_root", None) != _remote_path(remote_path)
        ):
            raise ProjectIdentityConflict("workspace does not match the host receipt")
        registration = WslProjectRegistration(
            project_id=project_id,
            connection_id=connection_id,
            connection_revision=connection_revision,
            remote_path=_remote_path(remote_path),
            runtime_ref_digest=runtime_ref_digest,
        )
        existing = self._projects.get(project_id)
        if existing is not None and existing != registration:
            raise ProjectIdentityConflict("project identity is already bound differently")
        self._projects[project_id] = registration
        self._runtime_refs[project_id] = runtime_ref
        self._persist_registry()
        return registration

    def list_remote_projects(self) -> list[dict[str, object]]:
        """Saved WSL Project identities for the GUI's project selector.

        Derived from the registration rows only: exactly the non-secret
        identity fields (project id, Connection id/revision, remote path),
        in a stable project-id order.  Runtime ref digests and other
        provider-private values never cross this surface.
        """
        return [
            {
                "project_id": registration.project_id,
                "connection_id": registration.connection_id,
                "connection_revision": registration.connection_revision,
                "remote_path": registration.remote_path,
            }
            for project_id, registration in sorted(self._projects.items())
        ]

    def make_ref(self, project_id: str) -> Ref:
        registration = self._projects.get(project_id)
        if registration is None:
            raise ProjectIdentityConflict("project is not registered")
        return Ref(
            RefType.WORKSPACE,
            PROVIDER_ID,
            registration.project_id,
        )

    def runtime_host_input_ref(self, project_id: str) -> Ref:
        """Issue the opaque RuntimeHost input frozen for this remote Project.

        The Ref carries only provider-private identity values required to
        reconstruct the durable RuntimeHostRef.  Connection facts remain
        Host Authority data and the remote path remains workspace authority.
        """
        registration = self._projects.get(project_id)
        runtime_ref = self._runtime_refs.get(project_id)
        if registration is None or not isinstance(runtime_ref, RuntimeHostRef):
            raise ProjectIdentityConflict("project has no durable RuntimeHost ref")
        if runtime_ref.identity_digest != registration.runtime_ref_digest:
            raise ProjectIdentityConflict("project RuntimeHost ref identity drift")
        return Ref(
            RefType.ARTIFACT,
            runtime_ref.provider,
            registration.project_id,
            metadata={
                "runtime_native_id": runtime_ref.native_id,
                "identity_digest": runtime_ref.identity_digest,
                "affinity": runtime_ref.affinity,
                "schema_version": str(runtime_ref.schema_version),
                "connection_id": registration.connection_id,
                "connection_revision": str(registration.connection_revision),
            },
        )

    def resolve(self, contract_id: str, ref: Ref, *, context: object = None) -> WorkspaceV1:
        if contract_id != WORKSPACE_CONTRACT_ID or ref.type is not RefType.WORKSPACE:
            raise WslWorkspaceError("unsupported workspace contract or ref type")
        if ref.provider != PROVIDER_ID:
            raise ProjectIdentityConflict("ref does not belong to this provider")
        registration = self._projects.get(ref.native_id)
        expected = self.make_ref(ref.native_id) if registration is not None else None
        if expected is None or ref != expected:
            raise ProjectIdentityConflict("ref facts do not match registered project identity")
        receipt = getattr(getattr(context, "port", None), "receipt", None)
        runtime_ref = getattr(context, "ref", None) or self._runtime_refs.get(ref.native_id)
        if receipt is None and runtime_ref is not None:
            resolver = getattr(self.host_operations, "resolve_connection", None)
            if not callable(resolver):
                raise ProjectIdentityConflict(
                    "workspace requires a Host Authority for remote resolution"
                )
            try:
                receipt = resolver(
                    registration.connection_id,
                    registration.connection_revision,
                    ref.native_id,
                )
            except Exception as error:
                raise ProjectIdentityConflict(
                    "Host Authority rejected the remote workspace identity"
                ) from error
        if receipt is None:
            raise ProjectIdentityConflict("workspace requires a host-verified WSL receipt")
        if (
            getattr(runtime_ref, "identity_digest", None) != registration.runtime_ref_digest
            or
            getattr(receipt, "connection_id", None) != registration.connection_id
            or getattr(receipt, "revision", None) != registration.connection_revision
            or getattr(receipt, "project_root", None) != registration.remote_path
        ):
            raise ProjectIdentityConflict("workspace does not match the host receipt")
        return WorkspaceV1(
            path=Path(registration.remote_path),
            source_digest=f"wsl-live:{_identity_digest(registration)}",
        )

    def _identity_observation(self, project_id: str, kind: str) -> WslWorkspaceObservation:
        registration = self._projects.get(project_id)
        if registration is None:
            raise ProjectIdentityConflict("project is not registered")
        digest = "wsl-live:" + _identity_digest(registration)
        return WslWorkspaceObservation(
            project_id=project_id,
            kind=kind,
            inventory_digest=digest,
            observed_at=datetime.now(timezone.utc).isoformat(),
            details={
                "source": "remote_identity_only",
                "mode": "live",
                "mutability": "externally_mutable",
                "input_frozen": "false",
            },
        )

    def baseline_observation(self, project_id: str) -> WslWorkspaceObservation:
        """Return bounded remote identity facts without touching a local path."""
        return self._identity_observation(project_id, "baseline")

    def after_observation(
        self, project_id: str, baseline: WslWorkspaceObservation
    ) -> WslWorkspaceChangeReport:
        after = self._identity_observation(project_id, "after")
        if baseline.project_id != project_id:
            raise ProjectIdentityConflict("baseline belongs to another project")
        return WslWorkspaceChangeReport(
            project_id=project_id,
            changed=False,
            changed_paths=(),
            source="none",
            baseline=baseline,
            after=after,
            note="remote inventory observation is not available in this provider slice",
        )

    def map_workspace_path(self, project_id: str, relative_path: str) -> str:
        registration = self._projects.get(project_id)
        if registration is None:
            raise ProjectIdentityConflict("project is not registered")
        if not isinstance(relative_path, str) or not relative_path or "\x00" in relative_path:
            raise ProjectPathRejected("relative workspace path is required")
        relative = PurePosixPath(relative_path)
        if relative.is_absolute() or ".." in relative.parts:
            raise ProjectPathRejected("workspace path escapes the remote project")
        return str(PurePosixPath(registration.remote_path) / relative)
