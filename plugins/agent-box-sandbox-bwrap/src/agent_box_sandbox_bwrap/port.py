"""The bubblewrap implementation of the neutral sandbox seam.

The channel states a :class:`~agent_box.extensions.runtime_composition.sandbox_port.SidecarRoomRequest`;
this module translates it into the bwrap argv this provider knows how to build
(:func:`agent_box_sandbox_bwrap.sidecar_room.compose_sidecar_room`) and reports
its own identity and capability declaration for the assembly boundary to
cross-check.

This is the *only* place the sandbox vocabulary meets the neutral demand: the
translation is one mechanical mapping plus the invariant checks a provider must
answer honestly (this provider keeps a real home directory and immutable
read-only inputs, and it refuses a demand whose network posture it cannot keep
rather than pretending).
"""
from __future__ import annotations

from typing import Any, Sequence

from .declarations import sandbox_declaration_document
from .sidecar_room import compose_sidecar_room

#: The provider ids this factory serves, for the resolver's cross-check.
PROVIDER_IDS = ("sandbox-bwrap", "bwrap-sandbox")


class BwrapSidecarRoomPort:
    """Translate neutral room requests into bwrap argv (the seam's first impl)."""

    provider_id = "sandbox-bwrap"

    def compose_sidecar_room(self, request) -> Any:
        from agent_box.extensions.runtime_composition.sandbox_port import (
            IsolatedProcessSpec,
            SandboxInvariantUnsupported,
        )

        invariants = request.invariants
        if invariants.network_mode not in {"inherit", "none"}:
            raise SandboxInvariantUnsupported(
                "SANDBOX_NETWORK_POSTURE_UNSUPPORTED",
                f"unsupported network posture {invariants.network_mode!r}",
            )
        if invariants.network_mode == "none":
            # This template's argv carries no --unshare-net (the declaration
            # says so); a caller demanding "none" here must be refused rather
            # than told the posture is kept. The room-level network parameters
            # are the neutral plan's job, not a silent claim here.
            raise SandboxInvariantUnsupported(
                "SANDBOX_NETWORK_POSTURE_UNSUPPORTED",
                "the sidecar room template keeps the machine's network; "
                "network_mode='none' is not available on this provider",
            )
        room = compose_sidecar_room(
            workspace=request.workspace,
            staged_view=request.staged_view,
            secret=request.secret,
            base_environment=request.base_environment,
            executable_mounts=tuple(request.executable_mounts),
            projection_mounts=tuple(request.projection_mounts),
            runtime_artifact_mounts=tuple(request.runtime_artifact_mounts),
            state_home_source=request.state_home_source,
            state_target=request.state_target,
            state_window_source=request.state_window_source,
            state_window_target=request.state_window_target,
            state_ephemeral_paths=tuple(request.state_ephemeral_paths),
            entrypoint=request.entrypoint,
        )
        return IsolatedProcessSpec(
            argv=tuple(room.argv), environment=dict(room.environment),
        )

    def declaration_document(self, *, readonly_targets: Sequence[str],
                             writable_targets: Sequence[str],
                             environment_binding: str, observed_at: int) -> Any:
        return sandbox_declaration_document(
            readonly_targets=tuple(readonly_targets),
            writable_targets=tuple(writable_targets),
            environment_binding=environment_binding,
            observed_at=observed_at,
        )

    def descriptor_id(self) -> str:
        from .plugin import create_plugin

        return create_plugin().descriptor().id

    def probe(self) -> dict:
        from .provider import BwrapSandboxProvider

        return BwrapSandboxProvider().probe()


def create_sidecar_room_port() -> BwrapSidecarRoomPort:
    """The factory the resolver looks up (entry point / configured module)."""
    return BwrapSidecarRoomPort()


create_sidecar_room_port.provider_ids = PROVIDER_IDS

__all__ = ["BwrapSidecarRoomPort", "PROVIDER_IDS", "create_sidecar_room_port"]
