"""The sidecar room: one launch plan, and the position-independence it promises.

The channel layer may only supply token bindings.  Everything else about the
room - the single guest home root, the XDG roots derived from it, which mounts
are read-only, which single directory is writable state, which state paths are
attempt-ephemeral - is decided here, and the decision must not change with the
machine the plan is staged on.
"""
from __future__ import annotations

from agent_box_sandbox_bwrap import GUEST_HOME, compose_sidecar_room, guest_environment

WORKSPACE = ("project", "/home/agent/project")
MODELS_FILE = ("deploy/pi/models.json", f"{GUEST_HOME}/.pi/agent/models.json")
SESSIONS = f"{GUEST_HOME}/.pi/agent/sessions"


def room(**overrides):
    arguments = {
        "workspace": "/wsl/workspaces/project",
        "staged_view": "/wsl/views/view-abc",
        "secret": "/wsl/views/view-abc/secret",
        "base_environment": {"AGENTBOX_SIDECAR_ISOLATED": "1"},
        "executable_mounts": (),
        "projection_mounts": (MODELS_FILE,),
        "runtime_artifact_mounts": (("/wsl/artifacts/pi-runtime", "/runtime/artifacts/pi-runtime"),),
        "state_bundle_prefix": "state",
        "state_target": SESSIONS,
        "state_ephemeral_paths": (".tmp",),
    }
    arguments.update(overrides)
    return compose_sidecar_room(**arguments)


def test_the_guest_home_is_one_root_and_the_xdg_roots_derive_from_it():
    environment = guest_environment({})
    assert environment["HOME"] == GUEST_HOME
    assert environment["XDG_CONFIG_HOME"] == f"{GUEST_HOME}/.config"
    assert environment["XDG_CACHE_HOME"] == f"{GUEST_HOME}/.cache"
    assert environment["XDG_DATA_HOME"] == f"{GUEST_HOME}/.local/share"
    assert environment["PATH"] == "/usr/bin:/bin"


def test_the_room_carries_exactly_one_writable_mount_and_it_is_the_state_target():
    plan = room()
    assert plan.writable_state_mount == ("/wsl/views/view-abc/state", SESSIONS)
    assert plan.ephemeral_state_mounts == (f"{SESSIONS}/.tmp",)
    # The workspace and the one state directory are the only writable binds.
    assert list(plan.argv).count("--bind") == 2
    assert "/wsl/views/view-abc/state" in plan.argv
    assert "/wsl/workspaces/project" in plan.argv


def test_a_room_without_declared_state_has_no_writable_mount():
    plan = room(state_bundle_prefix=None, state_target=None, state_ephemeral_paths=())
    assert plan.writable_state_mount is None
    assert plan.ephemeral_state_mounts == ()


def test_projections_are_read_only_and_joined_with_the_staged_view():
    plan = room()
    argv = list(plan.argv)
    assert "/wsl/views/view-abc/deploy/pi/models.json" in argv
    # The reviewed configuration file is read-only wherever it lands.
    assert argv[argv.index("/wsl/views/view-abc/deploy/pi/models.json") - 1] == "--ro-bind"


def test_the_same_room_on_another_machine_differs_only_in_the_bindings():
    """The plan is position-independent: staging it elsewhere moves the binding
    sources, and nothing else.  This is what lets the same upper-layer intent
    run on WSL, on the local machine, or over SSH."""
    here = room()
    there = room(
        workspace="/mnt/c/work/project",
        staged_view="/tmp/views/view-xyz",
        secret="/tmp/views/view-xyz/secret",
        runtime_artifact_mounts=(("/opt/artifacts/pi-runtime", "/runtime/artifacts/pi-runtime"),),
    )
    bindings = (
        ("/wsl/views/view-abc", "/tmp/views/view-xyz"),
        ("/wsl/workspaces/project", "/mnt/c/work/project"),
        ("/wsl/artifacts/pi-runtime", "/opt/artifacts/pi-runtime"),
    )

    def normalize(argv, index):
        values = [left if index == 0 else right for left, right in bindings]
        normalized = []
        for argument in argv:
            for value in values:
                argument = argument.replace(value, "«binding»")
            normalized.append(argument)
        return normalized

    assert here.argv != there.argv  # the bindings really moved
    assert normalize(here.argv, 0) == normalize(there.argv, 1)
    assert here.environment == there.environment
    # The guest side is identical everywhere; only the binding source moves.
    assert here.writable_state_mount[1] == there.writable_state_mount[1]
    assert here.writable_state_mount[0] != there.writable_state_mount[0]
    assert here.ephemeral_state_mounts == there.ephemeral_state_mounts
