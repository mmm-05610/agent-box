"""Sandbox rooms: one deployment-independent launch plan per execution shape.

This module owns every decision the *channel* must not make: the guest
environment (one home root and the XDG roots derived from it), which mounts are
read-only, which single directory is writable state, and which state paths are
attempt-ephemeral (tmpfs, never durable).

A caller supplies only facts it already holds - the staged view path, the secret
path, the reviewed mount lists, and the declared state target - and receives the
argv plus the environment of one isolated process. Nothing here knows which
machine the plan will run on: the paths it receives are token bindings produced
by the channel, and the paths it emits are all guest paths.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping, Sequence

from agent_box.resource_contracts.home_projection import GUEST_HOME
from .provider import SIDECAR_ENTRYPOINT, compile_remote_bwrap_argv, compile_remote_sidecar_bwrap_argv


@dataclass(frozen=True)
class SandboxRoom:
    """One isolated process's launch plan, in guest terms."""

    argv: tuple[str, ...]
    environment: Mapping[str, str] = field(default_factory=dict)
    #: The one writable state directory, as (staged view source, guest target).
    writable_state_mount: tuple[str, str] | None = None
    #: Guest paths shadowed by tmpfs for this attempt only.
    ephemeral_state_mounts: tuple[str, ...] = ()


def guest_environment(base: Mapping[str, str] | None = None) -> dict[str, str]:
    """The one isolated home root, and the XDG roots derived from it.

    A Harness's default location and its explicit variable resolve to the same
    projection because both are derived from this single root: the root is an
    execution-private mount-namespace directory and is never the host home.
    """
    values = dict(base or {})
    return {
        "PATH": "/usr/bin:/bin",
        "LANG": "C.UTF-8",
        "HOME": GUEST_HOME,
        "XDG_CONFIG_HOME": f"{GUEST_HOME}/.config",
        "XDG_CACHE_HOME": f"{GUEST_HOME}/.cache",
        "XDG_DATA_HOME": f"{GUEST_HOME}/.local/share",
        "AGENTBOX_SIDECAR_ISOLATED": values.get("AGENTBOX_SIDECAR_ISOLATED", "1"),
    }


def compose_sidecar_room(
    *,
    workspace: str,
    staged_view: str,
    secret: str | None,
    base_environment: Mapping[str, str] | None = None,
    executable_mounts: Sequence[tuple[str, str]] = (),
    projection_mounts: Sequence[tuple[str, str]] = (),
    runtime_artifact_mounts: Sequence[tuple[str, str]] = (),
    state_home_source: str | None = None,
    state_target: str | None = None,
    state_window_source: str | None = None,
    state_window_target: str | None = None,
    state_overlays: Sequence[tuple[str, str]] = (),
    state_ephemeral_paths: Sequence[str] = (),
    entrypoint: str = SIDECAR_ENTRYPOINT,
) -> SandboxRoom:
    """Compose the launch plan for one sidecar execution.

    ``workspace``, ``staged_view`` and ``secret`` are the channel's token
    bindings (real host locations). ``projection_mounts`` are view-relative
    sources with their guest targets; this function performs the one join that
    turns a view-relative source into a bind source, so the caller never spells
    a guest layout itself.

    ``state_home_source`` is the Profile's durable home directory on the
    machine that runs this turn, bound read-write at ``state_target`` (the
    deployment's declared native-home target inside the guest). It is a real
    directory, not staged bytes: whatever the Harness writes here outlives the
    attempt, which is the whole point of the native-home model. The depth
    ordering is unchanged, so a read-only configuration that projects inside
    the home still binds after - and therefore wins over - the home, and every
    ephemeral path is still tmpfs-shadowed after both.
    """
    environment = guest_environment(base_environment)
    #: Ephemeral paths are declared relative to the Harness's own home target:
    #: that is where a Harness writes them (`$CODEX_HOME/.tmp`), and §14's
    #: session store binds at a *deeper* target (`.codex/sessions`) than the
    #: home, so anchoring on the window would shadow the wrong tree.
    ephemeral_anchor = state_target
    writable_state_mount = (
        (str(state_home_source), str(state_target))
        if state_home_source is not None and state_target is not None
        else None
    )
    # A declared audit window that is not inside the native home (OpenCode's
    # data under `.local/share/opencode`, native home `.config/opencode`) is
    # the same role's directory and is bound separately, read-write. The depth
    # ordering below still decides who wins, so a read-only projection inside
    # either bind keeps its authority.
    writable_window_mount = (
        (str(state_window_source), str(state_window_target))
        if (state_window_source is not None and state_window_target is not None
            and str(state_window_source) != str(state_home_source))
        else None
    )
    ephemeral_state_mounts = tuple(
        f"{str(ephemeral_anchor).rstrip('/')}/{relative}"
        for relative in state_ephemeral_paths
    ) if ephemeral_anchor is not None else ()

    writable_mounts = [
        mount for mount in (writable_state_mount, writable_window_mount)
        if mount is not None
    ]
    # Order 66: the whole-db overlays ride the same writable class as the state
    # home; they sit deeper, so the depth rule already makes each one win.
    overlay_mounts = tuple(
        (str(source), str(target)) for source, target in state_overlays
    )
    argv = compile_remote_sidecar_bwrap_argv(
        workspace=workspace,
        runtime_view=staged_view,
        environment=environment,
        secret=secret,
        executable_mounts=executable_mounts,
        projection_mounts=tuple(
            (f"{staged_view}/{source}", target) for source, target in projection_mounts
        ),
        runtime_artifact_mounts=runtime_artifact_mounts,
        writable_projection_mounts=tuple(writable_mounts),
        state_overlay_mounts=overlay_mounts,
        ephemeral_state_mounts=ephemeral_state_mounts,
        entrypoint=entrypoint,
    )
    return SandboxRoom(
        argv=tuple(argv),
        environment=environment,
        writable_state_mount=writable_state_mount,
        ephemeral_state_mounts=ephemeral_state_mounts,
    )


def compose_codex_room(
    *,
    workspace: str,
    staged_home: str,
    secret: str,
    executable: str,
    secret_target: str,
    command: Sequence[str],
    environment: Mapping[str, str] | None = None,
) -> SandboxRoom:
    """Compose the launch plan for one native (non-sidecar) execution.

    The same rules hold as for the sidecar room: the caller supplies only its
    token bindings - the staged home directory, the secret's host location and
    the command to run - and receives one argv whose paths are all guest paths.
    ``secret_target`` is the guest location the deployment chose for this
    Harness's credential; it is a room decision, never the channel's.
    """
    argv = compile_remote_bwrap_argv(
        workspace=workspace,
        native_home=staged_home,
        executable=executable,
        secret=secret,
        secret_target=secret_target,
        command=tuple(command),
        environment=dict(environment or {}),
    )
    return SandboxRoom(argv=tuple(argv), environment=dict(environment or {}))
