"""The single lowering path: private LaunchPlan -> Root Runtime inputs.

LaunchPlan intent is converted here into the existing Root
``HarnessCommandSpec`` plus declared runtime sources.  Nothing below the
Runtime boundary learns any Harness vocabulary; the Root assembler keeps
validating structure, paths, digests and overlap exactly as before.

Profile-home sources are one of two shapes:
* a ``StagedHome`` (profile-less launches): the plan's declared logical
  digest must match the staged inventory (fail closed), or
* a ``NativeHomeView`` (profile-based launches): the view is verified for
  the plan's declared overlays (managed config render) and its full,
  credential-free tree digest is computed NOW and declared to the Runtime
  (the volatile session/cache content cannot be part of plan-time intent).
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

from agent_box.protocols.credentials import PreparedSecretMount
from agent_box.protocols.runtime import HarnessCommandSpec, declare_source
from agent_box.protocols.runtime.protocol import content_digest, digest as canonical_digest

from ..native_home.view import NativeHomeView
from .failures import MaterializationFailed
from .launch_plan import LaunchPlan
from .staging import StagedHome, home_relative_path


@dataclass(frozen=True)
class LoweredLaunch:
    """The only sanctioned conversion product of a LaunchPlan."""

    command: HarnessCommandSpec
    secret_mounts: tuple[PreparedSecretMount, ...]
    plan_digest: str


# Sanctioned live-workspace marker: a live Workspace Ref carries an
# identity digest, not a content snapshot (the directory is externally
# mutable and unfrozen by contract).  The launch-time content digest is
# still computed and declared to the Runtime (assembler/sandbox verify
# against THAT value); only the identity-marker equality check is waived,
# and only for the workspace mount kind with this exact marker prefix.
LIVE_WORKSPACE_DIGEST_PREFIX = "live-unfrozen:"


def _is_live_workspace_mount(mount: MountIntent, actual: str) -> bool:
    return (
        mount.kind == "workspace"
        and isinstance(mount.source_digest, str)
        and mount.source_digest.startswith(LIVE_WORKSPACE_DIGEST_PREFIX)
        and actual.startswith("sha256:")
    )


def lower(
    plan: LaunchPlan,
    *,
    sources: Mapping[str, Path | StagedHome | NativeHomeView],
    secret_mounts: tuple[PreparedSecretMount, ...] = (),
) -> LoweredLaunch:
    """Verify every declared source, then build the Runtime command spec.

    Digest/drift verification is fail closed and happens before any attempt
    exists; the Root assembler and the Sandbox re-verify each source again at
    assembly and wrap time.
    """
    declared = []
    for mount in plan.mounts:
        resolved = sources.get(mount.source_key)
        if resolved is None:
            raise MaterializationFailed("SOURCE_UNRESOLVED", mount.source_key)
        if isinstance(resolved, NativeHomeView):
            if mount.kind != "profile-home" or mount.access != "rw":
                raise MaterializationFailed("NATIVE_VIEW_MOUNT_INVALID", mount.source_key)
            _verify_view_overlays(plan, resolved)
            host_path: Path = resolved.root
        elif isinstance(resolved, StagedHome):
            if mount.kind != "profile-home" or mount.access != "rw":
                raise MaterializationFailed("STAGED_HOME_MOUNT_INVALID", mount.source_key)
            if resolved.logical_digest != mount.source_digest:
                raise MaterializationFailed("STAGED_HOME_DIGEST_DRIFT", mount.source_key)
            host_path = resolved.root
        else:
            host_path = resolved
        try:
            actual = content_digest(host_path)
        except (OSError, ValueError) as exc:
            raise MaterializationFailed("SOURCE_UNAVAILABLE", mount.source_key) from exc
        if not isinstance(resolved, (StagedHome, NativeHomeView)) and actual != mount.source_digest:
            if not _is_live_workspace_mount(mount, actual):
                raise MaterializationFailed("SOURCE_DIGEST_DRIFT", mount.source_key)
        declared.append(declare_source(
            mount.kind, host_path, mount.guest_target, access=mount.access,
            provenance=mount.provenance or mount.kind,
        ))
    command_digest = canonical_digest({
        "launch_plan": plan.digest,
        "argv": list(plan.argv),
        "cwd": plan.cwd_token,
        "environment": dict(sorted(plan.environment.items())),
        "io": plan.io_mode,
        "network": {"control_plane": plan.requires_control_plane_network, "tool": plan.tool_network_requirement},
        "sources": [[item.kind, item.guest_target, item.access, item.expected_digest] for item in declared],
        "secret_bindings": [[binding.guest_target, binding.locator, binding.materializer_id] for binding in plan.secret_bindings],
    })
    command = HarnessCommandSpec(
        plan.argv,
        plan.cwd_token,
        dict(plan.environment),
        plan.io_mode,
        command_digest=command_digest,
        runtime_sources=tuple(declared),
        requires_control_plane_network=plan.requires_control_plane_network,
        tool_network_requirement=plan.tool_network_requirement,
        projector_id=plan.harness_type,
    )
    return LoweredLaunch(command=command, secret_mounts=tuple(secret_mounts), plan_digest=plan.digest)


def _verify_view_overlays(plan: LaunchPlan, view: NativeHomeView) -> None:
    """Fail closed on the declared overlays inside the materialized view.

    The plan declares which managed config files it rendered; the view must
    contain exactly those files with the declared digests.  The rest of the
    view (installed skills, sessions, unknown safe files) comes from the
    Profile Native Home and is verified by its tree digest above.
    """
    expected = []
    for item in plan.rendered.files:
        relative = home_relative_path(item.guest_path)
        expected.append((relative, item.content_digest))
    try:
        view.verify_overlay(expected)
    except Exception as exc:
        raise MaterializationFailed("EXECUTION_VIEW_OVERLAY_DRIFT", str(exc)[:160]) from exc


__all__ = ["LoweredLaunch", "lower"]
