"""The fixed Worker-sidecar bwrap template and the guest-home projection layout.

Two things are asserted here that no downstream test can: the *shape* of the
argv the Worker is asked to run (which bind is emitted before which, and which
guest directories exist before a bind lands on them), and the *real* guest
semantics that shape produces - a reviewed configuration file bound read-only
inside the writable state directory must stay readable and unwritable while the
state directory beside it stays writable.  The second one is executed with the
host's own bubblewrap, because "the argv looks right" is not the same claim.
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

from agent_box.extensions.runtime_composition import ProjectionRejected
from agent_box_sandbox_bwrap import (
    GUEST_HOME, compile_remote_bwrap_argv, compile_remote_sidecar_bwrap_argv,
)
from agent_box_sandbox_bwrap.home_projection import (
    HomeProjectionRejected, home_projection_target, protected_state_paths,
)

BWRAP = shutil.which("bwrap")


def test_remote_codex_template_is_fixed_and_has_runtime_devices():
    argv = compile_remote_bwrap_argv(
        workspace="/home/tester/project", native_home="/worker/view",
        executable="/opt/codex", secret="/worker/secret",
        command=("/runtime/bin/codex", "exec", "--json", "-"),
        environment={"HOME": "/runtime/home"},
    )
    assert argv[0] == "/usr/bin/bwrap"
    assert ["--dev", "/dev"] == argv[argv.index("--dev"):argv.index("--dev") + 2]
    assert ["--tmpfs", "/tmp"] == argv[argv.index("--tmpfs"):argv.index("--tmpfs") + 2]
    assert ["--ro-bind", "/worker/secret", "/runtime/home/auth.json"] == argv[
        argv.index("/worker/secret") - 1:argv.index("/worker/secret") + 2
    ]
    resolv = argv.index("/etc/resolv.conf")
    assert argv[resolv - 1:resolv + 2] == [
        "--ro-bind", "/etc/resolv.conf", "/mnt/wsl/resolv.conf",
    ]
    assert argv[-4:] == ["/runtime/bin/codex", "exec", "--json", "-"]


@pytest.mark.parametrize("changes", [
    {"command": ("/bin/sh", "-c", "id")},
    {"workspace": "/home/tester/../escape"},
    {"environment": {"API_TOKEN": "secret"}},
])
def test_remote_template_rejects_command_path_and_credential_injection(changes):
    values = {
        "workspace": "/home/tester/project", "native_home": "/worker/view",
        "executable": "/opt/codex", "secret": "/worker/secret",
        "command": ("/runtime/bin/codex", "exec", "-"),
        "environment": {"HOME": "/runtime/home"},
    }
    values.update(changes)
    with pytest.raises(ProjectionRejected):
        compile_remote_bwrap_argv(**values)


def test_remote_template_allows_only_codex_config_secret_target():
    argv = compile_remote_bwrap_argv(
        workspace="/workspace", native_home="/worker/view", executable="/codex",
        secret="/worker/secret", secret_target="/runtime/home/config.toml",
        command=("/runtime/bin/codex", "exec", "--json", "-"),
        environment={"HOME": "/runtime/home"},
    )
    assert ["--ro-bind", "/worker/secret", "/runtime/home/config.toml"] == argv[
        argv.index("/worker/secret") - 1:argv.index("/worker/secret") + 2
    ]
    with pytest.raises(Exception):
        compile_remote_bwrap_argv(
            workspace="/workspace", native_home="/worker/view", executable="/codex",
            secret="/worker/secret", secret_target="/workspace/key",
            command=("/runtime/bin/codex", "exec", "--json", "-"),
            environment={"HOME": "/runtime/home"},
        )


# --------------------------------------------------------------------------
# guest-home projection targets (the one grammar)
# --------------------------------------------------------------------------

def test_home_projection_target_accepts_every_declared_harness_home():
    """One grammar covers the default-path layouts a deployment may declare."""
    for target in (
        "/runtime/home/.codex/config.toml",
        "/runtime/home/.pi/agent/models.json",
        "/runtime/home/.pi/agent/sessions",
        "/runtime/home/.hermes/config.yaml",
        "/runtime/home/.hermes",
        "/runtime/home/.config/opencode/opencode.json",
        "/runtime/home/.local/share/opencode",
        "/runtime/home/a",
        "/runtime/home/" + "a" * 64,
        "/runtime/home/a/b/c/d/e",
    ):
        assert home_projection_target(target, kind="file") == target
        assert home_projection_target(target, kind="directory") == target


@pytest.mark.parametrize("target", [
    "", None, 7, "relative/path", "/", "/runtime", "/runtime/bin/node",
    "/runtime/homeless/x", "/tmp/agentbox-home/settings.json",  # the retired layout
    "/tmp/agentbox-home",
    "/runtime/home", "/runtime/home/", "/runtime/home//x", "/runtime/home/x/",
    "/runtime/home/..", "/runtime/home/../x", "/runtime/home/.", "/runtime/home/./x",
    "/runtime/home/.pi/agent/sessions/../../x",
    "/runtime/home/x\x00", "/runtime/home/x\\y", "/runtime/home/x\ty",
    "/runtime/home/" + "a" * 65,
    "/runtime/home/a/b/c/d/e/f/g",
    " /runtime/home/x", "/runtime/home/x ",
])
def test_home_projection_target_refuses_everything_outside_the_grammar(target):
    with pytest.raises(HomeProjectionRejected) as refused:
        home_projection_target(target, kind="file")
    assert refused.value.code.startswith("HOME_PROJECTION_")


def test_home_projection_target_has_no_kind_outside_the_two_declared_ones():
    with pytest.raises(HomeProjectionRejected) as refused:
        home_projection_target("/runtime/home/x", kind="socket")
    assert refused.value.code == "HOME_PROJECTION_KIND_INVALID"


def test_protected_state_paths_are_derived_from_the_declaration_alone():
    """Read-only files inside the writable state directory become protected."""
    assert protected_state_paths(
        ("/runtime/home/.hermes/config.yaml",), "/runtime/home/.hermes",
    ) == ("config.yaml",)
    assert protected_state_paths(
        ("/runtime/home/.hermes/nested/config.yaml",), "/runtime/home/.hermes",
    ) == ("nested/config.yaml",)
    # A read-only file *outside* the state directory protects nothing.
    assert protected_state_paths(
        ("/runtime/home/.pi/agent/models.json",), "/runtime/home/.pi/agent/sessions",
    ) == ()
    assert protected_state_paths((), None) == ()
    assert protected_state_paths(("/runtime/home/x",), None) == ()


@pytest.mark.parametrize("targets,state,code", [
    (("/runtime/home/.hermes",), "/runtime/home/.hermes", "HOME_PROJECTION_STATE_COLLISION"),
    # Reverse shadowing: the writable state may not live inside a projected file.
    (("/runtime/home/.hermes",), "/runtime/home/.hermes/state",
     "HOME_PROJECTION_STATE_SHADOWED"),
    (("/runtime/home/a", "/runtime/home/a"), "/runtime/home/state",
     "HOME_PROJECTION_TARGET_DUPLICATED"),
    (("/runtime/home/a", "/runtime/home/a/b"), "/runtime/home/state",
     "HOME_PROJECTION_TARGET_OVERLAPS"),
    (("/runtime/home/x",), "/tmp/agentbox-home/state", "HOME_PROJECTION_TARGET_OUTSIDE_HOME"),
])
def test_protected_state_paths_refuse_declarations_that_cannot_be_expressed(
    targets, state, code,
):
    with pytest.raises(HomeProjectionRejected) as refused:
        protected_state_paths(targets, state)
    assert refused.value.code == code


# --------------------------------------------------------------------------
# the fixed sidecar template
# --------------------------------------------------------------------------

def sidecar_argv(**changes):
    """One reviewed-template argv with a Hermes-shaped home projection."""
    values = {
        "workspace": "/workspace/project", "runtime_view": "/worker/views/view-1",
        "environment": {"HOME": GUEST_HOME, "XDG_CONFIG_HOME": f"{GUEST_HOME}/.config"},
        "projection_mounts": (
            ("/worker/views/view-1/agentbox-sidecar/deployment/hermes/projection-0-config.yaml",
             "/runtime/home/.hermes/config.yaml"),
        ),
        "writable_projection_mounts": (
            ("/worker/views/view-1/agentbox-sidecar/deployment/hermes/native-state",
             "/runtime/home/.hermes"),
        ),
    }
    values.update(changes)
    return compile_remote_sidecar_bwrap_argv(**values)


def test_remote_sidecar_argv_uses_bounded_readonly_projection_targets():
    argv = sidecar_argv(
        executable_mounts=(("/worker/bin/node", "/runtime/bin/node"),),
    )
    assert argv[-2:] == ["/usr/bin/node", "/runtime/view/agentbox-sidecar/runtime/worker-entry.mjs"]
    assert ["--ro-bind", "/worker/bin/node", "/runtime/bin/node"] == argv[
        argv.index("/worker/bin/node") - 1:argv.index("/worker/bin/node") + 2
    ]
    assert ["--ro-bind", "/worker/views/view-1/agentbox-sidecar/deployment/hermes/projection-0-config.yaml",
            "/runtime/home/.hermes/config.yaml"] == argv[
        argv.index("/worker/views/view-1/agentbox-sidecar/deployment/hermes/projection-0-config.yaml") - 1:
        argv.index("/worker/views/view-1/agentbox-sidecar/deployment/hermes/projection-0-config.yaml") + 2
    ]


def test_remote_sidecar_writable_projection_is_a_direct_bind_inside_view():
    argv = sidecar_argv(
        writable_projection_mounts=(
            ("/worker/views/view-1/sessions/native-state", "/runtime/home/.pi/agent/sessions"),
        ),
    )
    marker = argv.index("/worker/views/view-1/sessions/native-state")
    assert argv[marker - 1:marker + 2] == [
        "--bind", "/worker/views/view-1/sessions/native-state",
        "/runtime/home/.pi/agent/sessions",
    ]
    assert ["--ro-bind", "/worker/views/view-1/sessions/native-state",
            "/runtime/home/.pi/agent/sessions"] not in [argv[marker - 1:marker + 2]]


def test_remote_sidecar_binds_the_writable_state_before_the_readonly_files_in_it():
    """The read-only overlay must come *after* the state directory it sits in.

    A bind of an ancestor replaces whatever was mounted below it, so emitting
    the reviewed configuration first would leave the guest an empty file (the
    mount point) instead of the configuration - the guest would read an empty
    document, which is exactly the silent failure this ordering prevents.
    """
    argv = sidecar_argv()
    state_index = argv.index("/worker/views/view-1/agentbox-sidecar/deployment/hermes/native-state")
    config_index = argv.index(
        "/worker/views/view-1/agentbox-sidecar/deployment/hermes/projection-0-config.yaml")
    assert argv[state_index - 1] == "--bind"
    assert argv[state_index + 1] == "/runtime/home/.hermes"
    assert argv[config_index - 1] == "--ro-bind"
    assert argv[config_index + 1] == "/runtime/home/.hermes/config.yaml"
    assert state_index < config_index, "the writable state bind must precede the file inside it"
    # The general invariant behind that one case: no bind may be emitted after a
    # bind of one of its own ancestors.
    binds = [
        (argv[index + 2], argv[index + 1])
        for index, token in enumerate(argv)
        if token in {"--bind", "--ro-bind"} and index + 2 < len(argv)
    ]
    for position, (target, _source) in enumerate(binds):
        for ancestor in Path(target).parents:
            for later_target, _later_source in binds[position + 1:]:
                assert str(ancestor) != later_target, (
                    f"{later_target} is bound after its descendant {target}"
                )


def test_remote_sidecar_creates_every_nested_guest_directory_before_binding():
    argv = sidecar_argv()
    directories = [argv[index + 1] for index, token in enumerate(argv) if token == "--dir"]
    assert "/runtime/home" in directories
    assert "/runtime/home/.hermes" in directories
    # Shallowest first, so a parent always exists before its child is created.
    depths = [len(Path(directory).parts) for directory in directories]
    assert depths == sorted(depths)
    assert len(set(directories)) == len(directories)
    # A *file* target is never created as a directory: bwrap must create the
    # file mount point itself, or the path would silently hold a directory.
    assert "/runtime/home/.hermes/config.yaml" not in directories
    # Directories are only ever taken from validated targets.
    for directory in directories:
        assert not any(part in {".", ".."} for part in directory.split("/"))
    nested = sidecar_argv(
        projection_mounts=(
            ("/worker/views/view-1/agentbox-sidecar/deployment/opencode/projection-0-opencode.json",
             "/runtime/home/.config/opencode/opencode.json"),
        ),
        writable_projection_mounts=(
            ("/worker/views/view-1/agentbox-sidecar/deployment/opencode/native-state",
             "/runtime/home/.local/share/opencode"),
        ),
    )
    nested_directories = [nested[index + 1] for index, token in enumerate(nested) if token == "--dir"]
    for expected in ("/runtime/home/.config", "/runtime/home/.config/opencode",
                     "/runtime/home/.local", "/runtime/home/.local/share",
                     "/runtime/home/.local/share/opencode"):
        assert expected in nested_directories
    # Every nested directory is created in one contiguous block, before any of
    # the template's own binds (the root `--dir /` is part of the prefix, and
    # the read-only system root is a separate, earlier block that mounts
    # nothing below the guest home).
    positions = [index for index, token in enumerate(nested) if token == "--dir"][1:]
    assert positions[-1] - positions[0] == 2 * (len(positions) - 1), "the dir block is contiguous"
    template_binds = [
        index for index, token in enumerate(nested)
        if token in {"--bind", "--ro-bind"} and index > positions[-1]
    ]
    assert template_binds, "the template must bind something after creating its directories"
    for expected in nested_directories:
        assert nested.index(expected) < min(template_binds)


@pytest.mark.parametrize("kwargs", [
    {"projection_mounts": (("/worker/views/view-1/file", "/runtime/home/../escape"),)},
    {"projection_mounts": (("/worker/views/view-1/file", "runtime/home/x"),)},
    {"projection_mounts": (("/worker/views/view-1/file", "/runtime/home"),)},
    {"projection_mounts": (("/worker/views/view-1/file", "/runtime/home//x"),)},
    {"projection_mounts": (("/worker/views/view-1/file", "/runtime/home/x/"),)},
    {"projection_mounts": (("/worker/views/view-1/file", "/runtime/home/x\x00"),)},
    {"projection_mounts": (("/worker/views/view-1/file", "/runtime/home/" + "a" * 65),)},
    {"projection_mounts": (("/worker/views/view-1/file", "/runtime/home/a/b/c/d/e/f/g"),)},
    # The retired layout is no longer a valid target anywhere in the template.
    {"projection_mounts": (("/worker/views/view-1/file", "/tmp/agentbox-home/x"),)},
    {"projection_mounts": (("/worker/views/other/file", "/runtime/home/x"),)},
    {"writable_projection_mounts": (("/worker/views/view-1/file", "/runtime/home/sub/x/../../y"),)},
    {"writable_projection_mounts": (("/worker/views/view-1/../outside/file", "/runtime/home/x"),)},
    # Reverse shadowing: a writable state inside a projected read-only file.
    {"projection_mounts": (("/worker/views/view-1/file", "/runtime/home/x"),),
     "writable_projection_mounts": (("/worker/views/view-1/state", "/runtime/home/x/state"),)},
    # One target may not carry two meanings.
    {"projection_mounts": (("/worker/views/view-1/file", "/runtime/home/x"),),
     "writable_projection_mounts": (("/worker/views/view-1/state", "/runtime/home/x"),)},
    {"executable_mounts": (("/worker/bin/node", "/runtime/bin/../escape"),)},
    {"executable_mounts": (("/worker/bin/../node", "/runtime/bin/node"),)},
    {"runtime_artifact_mounts": (("/opt/agentbox/artifacts/pi", "/runtime/home/pi"),)},
    {"environment": {"API_TOKEN": "secret"}},
])
def test_remote_sidecar_argv_rejects_projection_and_credential_injection(kwargs):
    values = {
        "workspace": "/workspace/project", "runtime_view": "/worker/views/view-1",
        "environment": {"HOME": GUEST_HOME},
    }
    values.update(kwargs)
    with pytest.raises(ProjectionRejected):
        compile_remote_sidecar_bwrap_argv(**values)


def test_remote_sidecar_rejects_two_projections_at_one_target():
    with pytest.raises(ProjectionRejected, match="collide|DID_NOT|OVERLAPS|targets collide"):
        compile_remote_sidecar_bwrap_argv(
            workspace="/workspace/project", runtime_view="/worker/views/view-1",
            environment={"HOME": GUEST_HOME},
            projection_mounts=(
                ("/worker/views/view-1/a.json", "/runtime/home/.config/a.json"),
                ("/worker/views/view-1/b.json", "/runtime/home/.config/a.json"),
            ),
        )


def test_remote_sidecar_mounts_runtime_artifacts_read_only_under_the_namespace():
    argv = compile_remote_sidecar_bwrap_argv(
        workspace="/workspace/project", runtime_view="/worker/views/view-1",
        environment={"HOME": GUEST_HOME},
        runtime_artifact_mounts=(
            ("/opt/agentbox/artifacts/pi-node-modules", "/runtime/artifacts/pi-node-modules"),
            ("/opt/agentbox/artifacts/hermes-python", "/runtime/artifacts/hermes-python"),
        ),
    )
    assert ["--dir", "/runtime/artifacts"] == argv[
        argv.index("/runtime/artifacts") - 1:argv.index("/runtime/artifacts") + 1
    ]
    for source, target in (
        ("/opt/agentbox/artifacts/pi-node-modules", "/runtime/artifacts/pi-node-modules"),
        ("/opt/agentbox/artifacts/hermes-python", "/runtime/artifacts/hermes-python"),
    ):
        marker = argv.index(source)
        assert argv[marker - 1:marker + 2] == ["--ro-bind", source, target]
    # A verified artifact is never writable, and never mounted anywhere but the
    # target its declaration named.
    assert not any(
        argv[index] == "--bind" and argv[index + 1].startswith("/opt/agentbox/artifacts/")
        for index in range(len(argv) - 1)
    )


@pytest.mark.parametrize("mounts", [
    (("/opt/agentbox/artifacts/pi", "/runtime/artifacts/pi/.."),),
    (("/opt/agentbox/artifacts/pi", "/runtime/artifacts"),),
    (("/opt/agentbox/artifacts/pi", "/runtime/artifacts/"),),
    (("/opt/agentbox/artifacts/pi", "/runtime/bin/artifacts"),),
    (("/opt/agentbox/artifacts/pi", "/runtime/view/artifacts"),),
    (("/opt/agentbox/artifacts/pi", "/runtime/secret/artifacts"),),
    (("/opt/agentbox/artifacts/pi", "/runtime/home/pi"),),
    (("/opt/agentbox/artifacts/pi", "/workspace/pi"),),
    (("/opt/agentbox/artifacts/../escape", "/runtime/artifacts/pi"),),
    (("relative/artifacts", "/runtime/artifacts/pi"),),
    # The project and the reviewed view may not arrive via the artifact door.
    (("/workspace/project", "/runtime/artifacts/project"),),
    (("/workspace", "/runtime/artifacts/workspace"),),
    (("/worker/views/view-1/agentbox-sidecar", "/runtime/artifacts/sidecar"),),
    (("/worker/views", "/runtime/artifacts/views"),),
])
def test_remote_sidecar_rejects_unrestricted_artifact_mounts(mounts):
    with pytest.raises(ProjectionRejected):
        compile_remote_sidecar_bwrap_argv(
            workspace="/workspace/project", runtime_view="/worker/views/view-1",
            environment={"HOME": GUEST_HOME},
            runtime_artifact_mounts=mounts,
        )


def test_remote_sidecar_rejects_duplicate_artifact_source_or_target():
    for mounts in (
        (("/opt/agentbox/artifacts/pi", "/runtime/artifacts/pi"),
         ("/opt/agentbox/artifacts/pi", "/runtime/artifacts/other")),
        (("/opt/agentbox/artifacts/pi", "/runtime/artifacts/pi"),
         ("/opt/agentbox/artifacts/other", "/runtime/artifacts/pi")),
    ):
        with pytest.raises(ProjectionRejected):
            compile_remote_sidecar_bwrap_argv(
                workspace="/workspace/project", runtime_view="/worker/views/view-1",
                environment={"HOME": GUEST_HOME},
                runtime_artifact_mounts=mounts,
            )


# --------------------------------------------------------------------------
# the real guest semantics of that argv
# --------------------------------------------------------------------------

def local_sidecar_run(tmp_path, *, projection, state, probe):
    """Run the reviewed template's own mounts against the host bubblewrap.

    The template is compiled exactly as production compiles it; only the
    trailing entrypoint is replaced by this probe, so what runs is the real
    mount policy - not a hand-written approximation of it.
    """
    view = tmp_path / "view"
    (view / "deployment").mkdir(parents=True)
    (view / "deployment" / "reviewed.json").write_text(projection, encoding="utf-8")
    (view / "native-state").mkdir()
    for name, content in state.items():
        (view / "native-state" / name).write_text(content, encoding="utf-8")
    (tmp_path / "workspace").mkdir()
    argv = compile_remote_sidecar_bwrap_argv(
        workspace=str(tmp_path / "workspace"), runtime_view=str(view),
        environment={"PATH": "/usr/bin:/bin", "HOME": GUEST_HOME},
        projection_mounts=(
            (str(view / "deployment" / "reviewed.json"),
             "/runtime/home/.hermes/config.yaml"),
        ),
        writable_projection_mounts=(
            (str(view / "native-state"), "/runtime/home/.hermes"),
        ),
    )
    assert argv[-2:] == [
        "/usr/bin/node", "/runtime/view/agentbox-sidecar/runtime/worker-entry.mjs",
    ]
    result = subprocess.run(
        [*argv[:-2], "/bin/sh", "-c", probe],
        capture_output=True, text=True, timeout=120,
    )
    return result


@pytest.mark.skipif(BWRAP is None, reason="bubblewrap is not installed on this host")
def test_a_readonly_configuration_inside_the_state_directory_is_never_writable(tmp_path):
    """Read-only configuration really is read-only, and state really is state.

    Both halves matter: a configuration file that the guest can rewrite would
    make the reviewed deployment advisory, and a state directory that turned
    out read-only would silently lose every session the Harness stores.
    """
    result = local_sidecar_run(
        tmp_path, projection='{"reviewed": true}\n', state={"state.db": "native-state\n"},
        probe=(
            'cat /runtime/home/.hermes/config.yaml; '
            'echo "write-config rc=$?"; '
            '(echo x > /runtime/home/.hermes/config.yaml) 2>&1; '
            'echo "ro-write rc=$?"; '
            '(echo y > /runtime/home/.hermes/state.db) 2>&1; '
            'echo "state-write rc=$?"; '
            'cat /runtime/home/.hermes/state.db'
        ),
    )
    assert result.returncode == 0, result.stderr
    lines = result.stdout.splitlines()
    assert lines[0] == '{"reviewed": true}'
    assert lines[1] == "write-config rc=0"
    assert "Read-only file system" in lines[2], "the reviewed configuration must not be writable"
    assert lines[3] == "ro-write rc=2", "writing the reviewed configuration must fail closed"
    assert lines[4] == "state-write rc=0", "the state directory must stay writable"
    assert lines[5] == "y"


@pytest.mark.skipif(BWRAP is None, reason="bubblewrap is not installed on this host")
def test_the_guest_home_root_never_contains_a_host_home(tmp_path):
    """The isolated home is created by the sandbox, not borrowed from the host."""
    host_home = Path.home()
    result = local_sidecar_run(
        tmp_path, projection="{}\n", state={"state.db": "x\n"},
        probe=(
            'ls -a /runtime/home; echo "---"; '
            f'test -e {host_home} && echo "host-home-visible" || echo "host-home-absent"; '
            f'test -e {host_home}/.ssh && echo "host-ssh-visible" || echo "host-ssh-absent"'
        ),
    )
    assert result.returncode == 0, result.stderr
    listing, tail = result.stdout.split("---\n", 1)
    assert sorted(name for name in listing.split() if name not in {".", ".."}) == [".hermes"]
    assert "host-home-visible" not in tail
    assert "host-ssh-visible" not in tail
