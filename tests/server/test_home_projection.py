"""One isolated guest home, generic projections, and protected native state.

Nothing in this file names a Harness: the fixture declares a made-up tool whose
home layout is spelled with the same generic fields a production deployment
uses (``projectionFiles`` / ``stateProjection`` / ``adapter.environment``).  What
is asserted is the *contract* every family shares:

* one guest home root, and every XDG root derived from it, so a Harness's
  default location (``$HOME``- or ``$XDG_*``-derived) and the dedicated variable
  a deployment declares resolve to the same projection;
* the guest sees the reviewed Profile projection and nothing of the host home -
  verified against a controlled temporary host home carrying its own sentinel,
  never against the user's real home directory;
* a declaration in the retired ``/tmp/agentbox-home`` layout is refused, and so
  is every other spelling outside the grammar;
* read-only files that live inside the writable state directory are *protected*:
  they are excluded from a checkpoint by name, and restoring one is refused.

The last two groups exercise the real Server loader and the real sidecar
channels; the sentinel group runs the real bwrap template with the host's
bubblewrap, because "the layout says so" is not the same claim as "the guest
sees exactly this".
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

import pytest

from agent_box.server.execution.sidecar import (
    SidecarError, WslSidecarLauncher, _WorkerChannels,
)
# The guest home is the sandbox layer's constant; the channel layer no longer
# spells it.
from agent_box_sandbox_bwrap import GUEST_HOME, compile_remote_sidecar_bwrap_argv

REPO = Path(__file__).resolve().parents[2]
BWRAP = shutil.which("bwrap")

#: The generic fixture: one tool, one agent directory below the isolated home,
#: one XDG configuration file and one XDG data directory.  These are *not*
#: Harness names; they are the shape every family's declaration reduces to.
AGENT_DIRECTORY = f"{GUEST_HOME}/.fixture"
AGENT_DIRECTORY_ENVIRONMENT = "FIXTURE_AGENT_DIR"
CONFIG_TARGET = f"{GUEST_HOME}/.config/fixture/config.json"
STATE_TARGET = f"{GUEST_HOME}/.local/share/fixture"
WINDOW = ".fixture"  # role-relative audit window for the fixture
PROFILE_SENTINEL = "PROFILE-PROJECTION-SENTINEL"
HOST_HOME_SENTINEL = "HOST-HOME-SENTINEL"


class _RecordingWorkerClient:
    """The smallest Worker client the launcher needs to compile an argv."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []
        self.closed = False
        self.started = False

    def start(self) -> None:
        self.started = True

    def request(self, op, arguments=None, **_identity):
        self.calls.append((op, dict(arguments or {})))
        if op == "view.commit":
            return {"path": "/worker/views/view-1"}
        if op == "secret.put":
            return {"path": "/worker/secrets/a/frame"}
        if op == "view.list":
            return {"files": []}
        if op == "home.prepare":
            locator = arguments["locator"]
            return {"path": f"/home/agent/.agent-box/profiles/{locator}",
                    "created": True, "markerState": "written"}
        return {"accepted": True}

    def subscribe_output(self, _callback):
        return lambda: None

    def subscribe_disconnect(self, _callback):
        return lambda: None

    def keep_lease(self, **_kwargs):
        class _Lease:
            failure = None

            def start(self) -> None:
                pass

            def stop(self) -> None:
                pass

        return _Lease()

    def write_stdin(self, *_args, **_kwargs) -> None:
        pass

    def close_stdin(self, *_args, **_kwargs) -> None:
        pass

    def wait_terminal(self, *_args, **_kwargs):
        return {}

    def close(self) -> None:
        self.closed = True


class _RecordingConnector:
    def __init__(self, client) -> None:
        self.client = client

    def client_for_workspace(self, **_kwargs):
        return self.client


def spawn_argv(client) -> list[str]:
    return next(payload["argv"] for op, payload in client.calls if op == "spawn")


def _bwrap_room_port():
    """The real bwrap port: this module asserts the room argv itself."""
    from agent_box.extensions.runtime_composition.sandbox_port import (
        resolve_sandbox_port,
    )

    return resolve_sandbox_port("sandbox-bwrap")


def launch_for(*, projection_mounts=(), state_target=None, protected_state_paths=(),
               native_home=".fixture"):
    """Launch the real sidecar launcher against a recording Worker client."""
    client = _RecordingWorkerClient()
    window = None
    if state_target:
        assert state_target.startswith("/runtime/home/")
        window = state_target[len("/runtime/home/"):]
    launcher = WslSidecarLauncher(
        _RecordingConnector(client),
        workspace={"distribution": "Ubuntu", "remote_user": "tester",
                   "connection_id": "connection", "remote_path": "/workspace"},
        bundle={},
        projection_mounts=projection_mounts,
        home_locator=f"pi-test/{native_home}",
        native_home=native_home,
        profile_id="profile_test",
        harness_type="fixture",
        audit_window=window,
        protected_state_paths=protected_state_paths,
        timeout_ms=5000,
        sandbox_port=_bwrap_room_port(),
    )
    channels = launcher.launch({"AGENTBOX_SIDECAR_ISOLATED": "1"})
    channels.close()
    return client, spawn_argv(client)


def guest_environment(argv: list[str]) -> dict[str, str]:
    values: dict[str, str] = {}
    for index, token in enumerate(argv):
        if token == "--setenv" and index + 2 < len(argv):
            values[argv[index + 1]] = argv[index + 2]
    return values


def bind_index_for(argv: list[str], target: str) -> int:
    """The argv index of the bind flag whose destination is `target`.

    A directory target is also created by an earlier ``--dir``, so the *bind*
    occurrence is ``--bind <source> <target>`` - the one whose second argument
    is the target - rather than the first mention of the path.
    """
    for index, token in enumerate(argv):
        if token == target and index >= 2 and argv[index - 2] in {"--bind", "--ro-bind"}:
            return index - 2
    raise AssertionError(f"{target} is not bound anywhere in the template")


def bind_token_for(argv: list[str], target: str) -> str:
    return argv[bind_index_for(argv, target)]


def bind_source_for(argv: list[str], target: str) -> str:
    return argv[bind_index_for(argv, target) + 1]


# --------------------------------------------------------------------------
# one home root, every root derived from it
# --------------------------------------------------------------------------

def test_the_guest_environment_derives_every_root_from_the_isolated_home():
    assert GUEST_HOME == "/runtime/home"
    _client, argv = launch_for()
    environment = guest_environment(argv)
    assert environment["HOME"] == GUEST_HOME
    assert environment["XDG_CONFIG_HOME"] == f"{GUEST_HOME}/.config"
    assert environment["XDG_DATA_HOME"] == f"{GUEST_HOME}/.local/share"
    assert environment["XDG_CACHE_HOME"] == f"{GUEST_HOME}/.cache"
    # Nothing in the template resolves a host home or a Windows profile root.
    rendered = json.dumps(argv)
    assert str(Path.home()) not in rendered
    assert "/mnt/c/Users" not in rendered
    assert "--ro-bind" in argv
    # The launch always binds the Profile's own home (the locator defaults
    # from the role name) beside the workspace - and nothing resolves to a
    # host profile root.
    assert argv.count("--bind") == 2
    home_binds = [argv[i + 1] for i, token in enumerate(argv)
                  if token == "--bind" and argv[i + 2].startswith("/runtime/home/")]
    assert home_binds == ["/home/agent/.agent-box/profiles/pi-test/.fixture"]


def test_a_home_derived_default_and_a_declared_variable_are_one_directory():
    """`$HOME/.fixture` and the deployment's own variable are the same target."""
    _client, argv = launch_for(
        projection_mounts=(("agentbox-sidecar/deployment/fixture/settings.json",
                            f"{AGENT_DIRECTORY}/settings.json"),),
        state_target=f"{AGENT_DIRECTORY}/sessions",
    )
    environment = guest_environment(argv)
    by_variable = environment.get(AGENT_DIRECTORY_ENVIRONMENT, AGENT_DIRECTORY)
    by_home = f"{environment['HOME']}/.fixture"
    assert by_home == by_variable == AGENT_DIRECTORY
    assert f"{by_home}/settings.json" == f"{AGENT_DIRECTORY}/settings.json"
    state = f"{AGENT_DIRECTORY}/sessions"
    assert bind_token_for(argv, state) == "--bind"
    # The bound source is the role's own home directory on this machine, not
    # staged bytes: it ends with the locator, not a bundle prefix.
    assert argv[bind_index_for(argv, state) + 1].endswith("pi-test/.fixture/sessions")


def test_an_xdg_derived_default_and_the_declared_targets_are_one_directory():
    """`$XDG_CONFIG_HOME/...` / `$XDG_DATA_HOME/...` are the declared targets."""
    _client, argv = launch_for(
        projection_mounts=(("agentbox-sidecar/deployment/fixture/config.json", CONFIG_TARGET),),
        state_target=STATE_TARGET,
    )
    environment = guest_environment(argv)
    assert f"{environment['XDG_CONFIG_HOME']}/fixture/config.json" == CONFIG_TARGET
    assert f"{environment['XDG_DATA_HOME']}/fixture" == STATE_TARGET
    # The state directory is inside the XDG data root, not beside it, so the
    # guest's own default resolution lands exactly on the declared target.
    assert STATE_TARGET.startswith(environment["XDG_DATA_HOME"] + "/")
    assert bind_token_for(argv, CONFIG_TARGET) == "--ro-bind"
    assert bind_token_for(argv, STATE_TARGET) == "--bind"
    # The two halves are siblings, so neither can shadow the other: the same
    # reviewed file is the one the guest's default lookup finds.
    assert not STATE_TARGET.startswith(CONFIG_TARGET + "/")
    assert not CONFIG_TARGET.startswith(STATE_TARGET + "/")


def test_a_harness_without_its_variable_still_lands_in_the_isolated_home():
    """Dropping the dedicated variable must not fall back to the host home."""
    _client, argv = launch_for(
        projection_mounts=(("agentbox-sidecar/deployment/fixture/settings.json",
                            f"{AGENT_DIRECTORY}/settings.json"),),
        state_target=f"{AGENT_DIRECTORY}/sessions",
    )
    environment = guest_environment(argv)
    assert AGENT_DIRECTORY_ENVIRONMENT not in environment
    assert environment["HOME"] == GUEST_HOME
    # The declared projection is reachable through the derived path alone.
    assert f"{environment['HOME']}/.fixture/settings.json" in argv


# --------------------------------------------------------------------------
# the real guest: sentinel isolation
# --------------------------------------------------------------------------

def run_guest(tmp_path, *, projection_text, host_home, probe):
    view = tmp_path / "view"
    (view / "deployment").mkdir(parents=True)
    (view / "deployment" / "config.json").write_text(projection_text, encoding="utf-8")
    state = view / "native-state"
    state.mkdir()
    (state / "state.db").write_text("native-state\n", encoding="utf-8")
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    argv = compile_remote_sidecar_bwrap_argv(
        workspace=str(workspace), runtime_view=str(view),
        environment={"PATH": "/usr/bin:/bin", "HOME": GUEST_HOME,
                     "XDG_CONFIG_HOME": f"{GUEST_HOME}/.config",
                     "XDG_DATA_HOME": f"{GUEST_HOME}/.local/share"},
        projection_mounts=((str(view / "deployment" / "config.json"), CONFIG_TARGET),),
        writable_projection_mounts=((str(state), STATE_TARGET),),
    )
    result = subprocess.run(
        [*argv[:-2], "/bin/sh", "-c", probe.format(host_home=host_home)],
        capture_output=True, text=True, timeout=120,
    )
    return result


@pytest.mark.skipif(BWRAP is None, reason="bubblewrap is not installed on this host")
def test_the_guest_sees_the_profile_projection_and_not_the_host_home(tmp_path):
    """A controlled stand-in host home, so the real one is never involved.

    The stand-in carries its own sentinel and the Profile projection carries
    another.  The guest must read the second and be unable to reach the first,
    which is what makes "the home is a projection, not a mount of the host"
    an observation instead of a claim.
    """
    host_home = tmp_path / "controlled-host-home"
    host_home.mkdir()
    (host_home / "sentinel").write_text(HOST_HOME_SENTINEL, encoding="utf-8")
    (host_home / ".config").mkdir()
    (host_home / ".config" / "fixture").mkdir()
    (host_home / ".config" / "fixture" / "config.json").write_text(
        json.dumps({"sentinel": HOST_HOME_SENTINEL}), encoding="utf-8")
    result = run_guest(
        tmp_path, projection_text=json.dumps({"sentinel": PROFILE_SENTINEL}),
        host_home=host_home,
        probe=(
            'cat /runtime/home/.config/fixture/config.json; echo; '
            'test -e {host_home} && echo "host-home-visible" || echo "host-home-absent"; '
            'test -e {host_home}/sentinel && echo "host-sentinel-visible" || echo "host-sentinel-absent"; '
            'echo "--- listing"; ls -1a /runtime/home'
        ),
    )
    assert result.returncode == 0, result.stderr
    head, listing = result.stdout.split("--- listing\n", 1)
    lines = head.splitlines()
    assert json.loads(lines[0]) == {"sentinel": PROFILE_SENTINEL}
    assert HOST_HOME_SENTINEL not in result.stdout
    assert lines[1] == "host-home-absent"
    assert lines[2] == "host-sentinel-absent"
    # The guest home holds the declared projections and nothing else.
    assert sorted(name for name in listing.split() if name not in {".", ".."}) == [".config", ".local"]


# --------------------------------------------------------------------------
# the retired layout, and every other outside-the-grammar spelling
# --------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _native_home_for_the_fixture(monkeypatch):
    """The synthetic fixture seat has a synthetic native home.

    The real registry lists the real families; these tests need a `.fixture`
    home to assert the generic derivation, so the registry lookup is stubbed
    to the same shape it really returns for e.g. `pi`.
    """
    import agent_box.server.bootstrap.runtime as runtime_module

    monkeypatch.setattr(runtime_module, "_registry_native_homes",
                        lambda: {"fixture": ".fixture"})


def write_deployment(tmp_path, harness):
    deployment = tmp_path / "deployment.json"
    deployment.write_text(json.dumps({
        "schemaVersion": 1, "harnesses": [harness],
    }), encoding="utf-8")
    return deployment


def build_deployment(tmp_path, deployment):
    import agent_box.server.bootstrap.runtime as runtime_module

    return runtime_module.build_runtime_from_sidecar_deployment(
        tmp_path / "server", deployment, plugin_root=tmp_path)


def fixture_harness(**changes):
    harness = {
        "id": "fixture",
        "adapter": {"command": "/usr/bin/node", "args": []},
        "projectionFiles": [{"source": "config.json", "target": CONFIG_TARGET}],
        "stateProjection": {"target": STATE_TARGET},
    }
    harness.update(changes)
    return harness


@pytest.fixture
def deployment_loader(tmp_path, monkeypatch):
    """The real loader, with the connector and bundle reads stubbed out."""
    import agent_box.server.bootstrap.runtime as runtime_module
    import agent_box.server.execution.sidecar as sidecar_module

    (tmp_path / "config.json").write_text("{}\n", encoding="utf-8")
    monkeypatch.setattr(runtime_module, "_builtin_connector", lambda _instance_id: object())
    monkeypatch.setattr(
        sidecar_module, "sidecar_bundle_files",
        lambda root, additional_files=None: dict(additional_files or {}),
    )
    return lambda harness: build_deployment(tmp_path, write_deployment(tmp_path, harness))


@pytest.mark.parametrize("target", [
    # The retired layout is refused in both halves of the declaration.
    {"projectionFiles": [{"source": "config.json", "target": "/tmp/agentbox-home/config.json"}]},
    {"stateProjection": {"target": "/tmp/agentbox-home/state"}},
    {"stateProjection": {"target": "/tmp/agentbox-home/sub/state"}},
    # Outside the one home root.
    {"projectionFiles": [{"source": "config.json", "target": "/runtime/bin/node"}]},
    {"projectionFiles": [{"source": "config.json", "target": "/workspace/config.json"}]},
    {"stateProjection": {"target": "/runtime/artifacts/fixture"}},
    {"projectionFiles": [{"source": "config.json", "target": "/runtime/home"}]},
    {"stateProjection": {"target": "/"}},
    # Relative, non-canonical and non-printable spellings.
    {"projectionFiles": [{"source": "config.json", "target": "runtime/home/x"}]},
    {"projectionFiles": [{"source": "config.json", "target": "/runtime/home/../escape"}]},
    {"projectionFiles": [{"source": "config.json", "target": "/runtime/home/x/.."}]},
    {"projectionFiles": [{"source": "config.json", "target": "/runtime/home//x"}]},
    {"projectionFiles": [{"source": "config.json", "target": "/runtime/home/x/"}]},
    {"projectionFiles": [{"source": "config.json", "target": "/runtime/home/x\x00"}]},
    {"projectionFiles": [{"source": "config.json", "target": "/runtime/home/x\n"}]},
    {"projectionFiles": [{"source": "config.json", "target": "/runtime/home/.config/./x"}]},
    # Six segments is the whole depth budget.
    {"projectionFiles": [{"source": "config.json", "target": f"{GUEST_HOME}/a/b/c/d/e/f/g"}]},
    # A segment longer than the bound.
    {"projectionFiles": [{"source": "config.json", "target": f"{GUEST_HOME}/" + "a" * 65}]},
    # The two halves may not name the same target.
    {"projectionFiles": [{"source": "config.json", "target": STATE_TARGET}],
     "stateProjection": {"target": STATE_TARGET}},
    # Reverse shadowing: a writable state inside a projected file.
    {"projectionFiles": [{"source": "config.json", "target": f"{GUEST_HOME}/.fixture"}],
     "stateProjection": {"target": f"{GUEST_HOME}/.fixture/state"}},
    # Two projections cannot be one path.
    {"projectionFiles": [{"source": "config.json", "target": CONFIG_TARGET},
                         {"source": "config.json", "target": CONFIG_TARGET}]},
    # One file cannot also be another file's parent directory.
    {"projectionFiles": [{"source": "config.json", "target": CONFIG_TARGET},
                         {"source": "config.json", "target": CONFIG_TARGET + "/nested"}]},
    # The declaration shape itself stays closed.
    {"projectionFiles": [{"source": "config.json", "target": CONFIG_TARGET, "extra": 1}]},
    {"stateProjection": {"target": STATE_TARGET, "source": "config.json"}},
])
def test_the_loader_refuses_every_target_outside_the_home_grammar(
    deployment_loader, target,
):
    with pytest.raises(RuntimeError, match="SIDECAR_DEPLOYMENT_INVALID"):
        deployment_loader(fixture_harness(**target))


def test_a_symlinked_projection_source_is_refused(tmp_path, monkeypatch):
    """A symlink is not a projection: the source must be a real file."""
    import agent_box.server.bootstrap.runtime as runtime_module
    import agent_box.server.execution.sidecar as sidecar_module

    real = tmp_path / "real.json"
    real.write_text("{}\n", encoding="utf-8")
    (tmp_path / "link.json").symlink_to(real)
    monkeypatch.setattr(runtime_module, "_builtin_connector", lambda _instance_id: object())
    monkeypatch.setattr(
        sidecar_module, "sidecar_bundle_files",
        lambda root, additional_files=None: dict(additional_files or {}),
    )
    deployment = write_deployment(tmp_path, fixture_harness(
        projectionFiles=[{"source": "link.json", "target": CONFIG_TARGET}],
    ))
    with pytest.raises(RuntimeError, match="SIDECAR_DEPLOYMENT_INVALID"):
        build_deployment(tmp_path, deployment)


def test_the_loader_accepts_a_readonly_file_inside_the_state_directory(tmp_path, monkeypatch):
    """The one nesting that is allowed: a reviewed file inside the state dir."""
    import agent_box.server.bootstrap.runtime as runtime_module
    import agent_box.server.execution.sidecar as sidecar_module

    (tmp_path / "config.json").write_text("{}\n", encoding="utf-8")
    monkeypatch.setattr(runtime_module, "_builtin_connector", lambda _instance_id: object())
    monkeypatch.setattr(
        sidecar_module, "sidecar_bundle_files",
        lambda root, additional_files=None: dict(additional_files or {}),
    )
    deployment = write_deployment(tmp_path, fixture_harness(
        projectionFiles=[{"source": "config.json", "target": f"{AGENT_DIRECTORY}/config.json"}],
        stateProjection={"target": AGENT_DIRECTORY},
    ))
    runtime = build_deployment(tmp_path, deployment)
    try:
        assert (tmp_path / "server").is_dir()
    finally:
        runtime.stop()


# --------------------------------------------------------------------------
# protected state paths
# --------------------------------------------------------------------------

def test_the_loader_derives_protected_paths_and_hands_them_to_the_launcher(
    tmp_path, monkeypatch,
):
    """The derivation is generic: it comes from this declaration, not a name."""
    import agent_box.server.bootstrap.runtime as runtime_module
    import agent_box.server.execution.sidecar as sidecar_module

    (tmp_path / "config.json").write_text("{}\n", encoding="utf-8")
    captured: dict = {}

    class RecordingLauncher:
        def __init__(self, _connector, **kwargs) -> None:
            captured.update(kwargs)

        def launch(self, _environment):
            raise SidecarError("SIDECAR_TEST_ONLY", "the recording launcher never launches")

    monkeypatch.setattr(runtime_module, "_builtin_connector", lambda _instance_id: object())
    monkeypatch.setattr(
        sidecar_module, "sidecar_bundle_files",
        lambda root, additional_files=None: dict(additional_files or {}),
    )
    monkeypatch.setattr(sidecar_module, "WorkerSidecarLauncher", RecordingLauncher)
    deployment = write_deployment(tmp_path, fixture_harness(
        projectionFiles=[
            {"source": "config.json", "target": f"{AGENT_DIRECTORY}/config.json"},
            {"source": "config.json", "target": f"{GUEST_HOME}/.config/fixture/config.json"},
        ],
        stateProjection={"target": AGENT_DIRECTORY},
        adapter={"command": "/usr/bin/node", "args": [],
                 "environment": {AGENT_DIRECTORY_ENVIRONMENT: AGENT_DIRECTORY}},
    ))
    runtime = build_deployment(tmp_path, deployment)
    try:
        frozen = runtime.objects.publish(json.dumps({"execution": {}}).encode())
        port_factory = runtime.execution.port_factory
        port_factory({
            "harness_type": "fixture", "distribution": "Ubuntu", "remote_user": "tester",
            "connection_id": "connection", "remote_path": "/workspace",
            # The placement the workspace record carries; it decides the channel.
            "env_kind": "wsl", "env_host": "Ubuntu", "normalized_path": "/workspace",
            "profile_id": "profile_test", "profile_name": "Fixture",
            "config_object_digest": frozen.digest,
        }, lambda *_args: None)
    finally:
        runtime.stop()
    assert captured["audit_window"] == ".fixture"
    # The locator carries the Profile's identity suffix (its last eight
    # characters): "profile_test" -> "filetest". Two Profiles that share a
    # display name therefore never collide on one home.
    assert captured["home_locator"] == "fixture-filetest/.fixture"
    assert captured["protected_state_paths"] == ("config.json",)
    assert [target for _source, target in captured["projection_mounts"]] == [
        f"{AGENT_DIRECTORY}/config.json",
        f"{GUEST_HOME}/.config/fixture/config.json",
    ]


def test_the_loader_bounds_and_validates_ephemeral_paths(tmp_path, monkeypatch):
    (tmp_path / "config.json").write_text("{}\n", encoding="utf-8")
    """The deployment layer refuses an oversized, illegal or duplicated
    ephemeral declaration with the same typed error as every other field."""
    import agent_box.server.bootstrap.runtime as runtime_module
    import agent_box.server.execution.sidecar as sidecar_module

    monkeypatch.setattr(runtime_module, "_builtin_connector", lambda _instance_id: object())
    monkeypatch.setattr(
        sidecar_module, "sidecar_bundle_files",
        lambda root, additional_files=None: dict(additional_files or {}),
    )

    def load(ephemeral):
        deployment = write_deployment(tmp_path, fixture_harness(
            stateProjection={"target": AGENT_DIRECTORY, "ephemeralPaths": ephemeral},
        ))
        runtime = build_deployment(tmp_path, deployment)
        try:
            return runtime
        except BaseException:
            runtime.stop()
            raise

    with pytest.raises(RuntimeError, match="SIDECAR_DEPLOYMENT_INVALID"):
        load([f"d{index}" for index in range(9)])
    with pytest.raises(RuntimeError, match="SIDECAR_DEPLOYMENT_INVALID"):
        load(["../escape"])
    # 重复/嵌套/与只读投影的重叠由 bwrap 编译器在其校验层拒绝（见
    # plugins/agent-box-sandbox-bwrap/tests/test_remote_bwrap.py）。
    runtime = load([".tmp"])
    try:
        pass
    finally:
        runtime.stop()


def test_an_ephemeral_path_is_never_audited_by_name():
    """The exclusion is by name: attempt-ephemeral scratch is tmpfs inside the
    sandbox, so it is not state even if a listing catches it mid-flight."""
    state_file = b"native-state"
    ephemeral_file = b"plugin-skill-blob"
    files = [
        {"path": "state.db", "size": len(state_file)},
        {"path": ".tmp/plugins/blob", "size": len(ephemeral_file)},
    ]

    class Client(_RecordingWorkerClient):
        def request(self, op, arguments=None, **_identity):
            if op == "home.list":
                assert arguments["relative"] == WINDOW
                return {"files": files,
                        "truncated": {"entries": 0, "bytes": 0, "oversize": 0}, "skipped": 0}
            if op == "home.get":
                value = state_file
                offset = arguments["offset"]
                chunk = value[offset:offset + arguments["maxLength"]]
                return {"data": base64.b64encode(chunk).decode(), "offset": offset,
                        "digest": "sha256:" + hashlib.sha256(value).hexdigest(),
                        "nextOffset": offset + len(chunk),
                        "eof": offset + len(chunk) == len(value)}
            return super().request(op, arguments, **_identity)

    channels = _WorkerChannels(
        Client(), "attempt", 1, "view",
        home_locator="fixture-test/.fixture", audit_window=WINDOW,
        state_ephemeral_paths=(".tmp",),
    )
    audit = channels.audit_state()
    assert [item["path"] for item in audit["files"]] == ["state.db"]


def test_a_protected_path_is_never_audited_by_name():
    """The exclusion is by name, not by "the overlay happens to hide it"."""
    state_file = b"native-state"
    protected_file = b"reviewed-configuration"
    files = [
        {"path": "state.db", "size": len(state_file)},
        {"path": "config.json", "size": len(protected_file)},
    ]

    class Client(_RecordingWorkerClient):
        def request(self, op, arguments=None, **_identity):
            if op == "home.list":
                assert arguments["relative"] == WINDOW
                return {"files": files,
                        "truncated": {"entries": 0, "bytes": 0, "oversize": 0}, "skipped": 0}
            if op == "home.get":
                value = payloads[arguments["path"]]
                offset = arguments["offset"]
                chunk = value[offset:offset + arguments["maxLength"]]
                return {"data": base64.b64encode(chunk).decode(), "offset": offset,
                        "digest": "sha256:" + hashlib.sha256(value).hexdigest(),
                        "nextOffset": offset + len(chunk),
                        "eof": offset + len(chunk) == len(value)}
            return super().request(op, arguments, **_identity)

    payloads = {
        f"{WINDOW}/state.db": state_file,
        f"{WINDOW}/config.json": protected_file,
    }
    channels = _WorkerChannels(
        Client(), "attempt", 1, "view",
        home_locator="fixture-test/.fixture", audit_window=WINDOW,
        protected_state_paths=("config.json",),
    )
    audit = channels.audit_state()
    assert [item["path"] for item in audit["files"]] == ["state.db"]
