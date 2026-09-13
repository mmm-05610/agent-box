from __future__ import annotations

import pytest

from agent_box.extensions.runtime_composition import ProjectionRejected
from agent_box_sandbox_bwrap import compile_remote_bwrap_argv


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
