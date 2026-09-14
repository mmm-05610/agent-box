from __future__ import annotations

import pytest

from agent_box.extensions.runtime_composition import ProjectionRejected
from agent_box_sandbox_bwrap import (
    compile_remote_bwrap_argv, compile_remote_sidecar_bwrap_argv,
)


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


def test_remote_sidecar_argv_uses_bounded_readonly_projection_targets():
    argv = compile_remote_sidecar_bwrap_argv(
        workspace="/workspace/project", runtime_view="/worker/views/view-1",
        environment={"HOME": "/tmp/agentbox-home"},
        executable_mounts=(("/worker/bin/node", "/runtime/bin/node"),),
        projection_mounts=(("/worker/views/view-1/agentbox-sidecar/deployment/pi/settings.json",
                            "/tmp/agentbox-home/settings.json"),),
    )
    assert argv[-2:] == ["/usr/bin/node", "/runtime/view/agentbox-sidecar/runtime/worker-entry.mjs"]
    assert ["--ro-bind", "/worker/bin/node", "/runtime/bin/node"] == argv[
        argv.index("/worker/bin/node") - 1:argv.index("/worker/bin/node") + 2
    ]
    assert ["--ro-bind", "/worker/views/view-1/agentbox-sidecar/deployment/pi/settings.json",
            "/tmp/agentbox-home/settings.json"] == argv[
        argv.index("/worker/views/view-1/agentbox-sidecar/deployment/pi/settings.json") - 1:
        argv.index("/worker/views/view-1/agentbox-sidecar/deployment/pi/settings.json") + 2
    ]


def test_remote_sidecar_writable_projection_is_a_direct_bind_inside_view():
    argv = compile_remote_sidecar_bwrap_argv(
        workspace="/workspace/project", runtime_view="/worker/views/view-1",
        environment={"HOME": "/tmp/agentbox-home"},
        writable_projection_mounts=(("/worker/views/view-1/sessions/thread.jsonl",
                                     "/tmp/agentbox-home/sessions.jsonl"),),
    )
    marker = argv.index("/worker/views/view-1/sessions/thread.jsonl")
    assert argv[marker - 1:marker + 2] == [
        "--bind", "/worker/views/view-1/sessions/thread.jsonl", "/tmp/agentbox-home/sessions.jsonl",
    ]
    assert ["--ro-bind", "/worker/views/view-1/sessions/thread.jsonl",
            "/tmp/agentbox-home/sessions.jsonl"] not in [argv[marker - 1:marker + 2]]


@pytest.mark.parametrize("mounts", [
    (("/worker/views/view-1/state", "/tmp/agentbox-home/../escape"),),
    (("/worker/views/view-1/../outside", "/tmp/agentbox-home/state"),),
])
def test_remote_sidecar_writable_projection_rejects_escape(mounts):
    with pytest.raises(ProjectionRejected):
        compile_remote_sidecar_bwrap_argv(
            workspace="/workspace/project", runtime_view="/worker/views/view-1",
            environment={"HOME": "/tmp/agentbox-home"},
            writable_projection_mounts=mounts,
        )


@pytest.mark.parametrize("kwargs", [
    {"projection_mounts": (("/worker/views/view-1/file", "/runtime/home/escape"),)},
    {"projection_mounts": (("/worker/views/other/file", "/tmp/agentbox-home/x"),)},
    {"writable_projection_mounts": (("/worker/views/../outside/file", "/tmp/agentbox-home/x"),)},
    {"writable_projection_mounts": (("/worker/views/view-1/file", "/tmp/agentbox-home/sub/x"),)},
    {"executable_mounts": (("/worker/bin/node", "/runtime/bin/../escape"),)},
    {"executable_mounts": (("/worker/bin/../node", "/runtime/bin/node"),)},
    {"environment": {"API_TOKEN": "secret"}},
])
def test_remote_sidecar_argv_rejects_projection_and_credential_injection(kwargs):
    values = {
        "workspace": "/workspace/project", "runtime_view": "/worker/views/view-1",
        "environment": {"HOME": "/tmp/agentbox-home"},
    }
    values.update(kwargs)
    with pytest.raises(ProjectionRejected):
        compile_remote_sidecar_bwrap_argv(**values)


def test_remote_sidecar_mounts_runtime_artifacts_read_only_under_the_namespace():
    argv = compile_remote_sidecar_bwrap_argv(
        workspace="/workspace/project", runtime_view="/worker/views/view-1",
        environment={"HOME": "/tmp/agentbox-home"},
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
    (("/opt/agentbox/artifacts/pi", "/tmp/agentbox-home/pi"),),
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
            environment={"HOME": "/tmp/agentbox-home"},
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
                environment={"HOME": "/tmp/agentbox-home"},
                runtime_artifact_mounts=mounts,
            )
