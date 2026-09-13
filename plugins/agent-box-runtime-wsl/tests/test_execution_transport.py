from __future__ import annotations

import base64
import hashlib
import os
from pathlib import Path
import shutil
from types import SimpleNamespace

import pytest

from agent_box_runtime_wsl.client import WorkerClient
from agent_box_runtime_wsl.execution import WslExecutionTransport


class Client:
    def __init__(self):
        self.calls = []
        self.closed = False

    def start(self):
        self.calls.append(("start", {}))

    def request(self, op, arguments=None, **identity):
        arguments = arguments or {}
        self.calls.append((op, {**arguments, **identity}))
        if op == "view.commit":
            return {"path": "/worker/views/v/ready"}
        if op == "secret.put":
            return {"path": "/worker/secrets/a/auth"}
        return {"accepted": True}

    def close(self):
        self.closed = True


class Connector:
    def __init__(self):
        self.client = Client()
        self.arguments = None

    def client_for_workspace(self, **arguments):
        self.arguments = arguments
        return self.client


def test_transport_projects_secret_and_prompt_outside_argv():
    connector = Connector()
    executable_digest = "sha256:" + "a" * 64
    transport = WslExecutionTransport(
        connector, codex_linux_path="/opt/codex/bin/codex",
        codex_digest=executable_digest,
    )
    plan = SimpleNamespace(
        command=("/runtime/bin/codex", "exec", "--json", "-"),
        environment={"HOME": "/runtime/home"}, stdin=b"private prompt", timeout_ms=5000,
    )
    attempt = transport.start(
        workspace={
            "distribution": "Ubuntu", "remote_user": "tester",
            "connection_id": "connection", "remote_path": "/home/tester/project",
        },
        attempt_id="attempt", generation=1, plan=plan,
        credential=b'{"credential":"private"}',
        restored_files={"sessions/x/rollout-thread.jsonl": b"prior"},
    )
    assert connector.arguments["executable_authorizations"] == ({
        "path": "/opt/codex/bin/codex", "digest": executable_digest,
    },)
    calls = dict(connector.client.calls)
    spawn = calls["spawn"]
    assert base64.b64decode(spawn["stdinBase64"]) == b"private prompt"
    joined = "\0".join(spawn["argv"])
    assert "private prompt" not in joined
    assert "credential" not in joined
    assert "/runtime/home/auth.json" in spawn["argv"]
    assert base64.b64decode(calls["secret.put"]["data"]) == b'{"credential":"private"}'
    assert attempt.generation == 1


def test_success_cleanup_attempts_every_operation_and_closes():
    connector = Connector()
    transport = WslExecutionTransport(
        connector, codex_linux_path="/codex", codex_digest="sha256:" + "b" * 64,
    )
    attempt = SimpleNamespace(
        client=connector.client, attempt_id="attempt", generation=2,
        view_id="view-attempt", secret_frame_id="auth",
    )
    transport.acknowledge_and_cleanup(attempt)
    assert [item[0] for item in connector.client.calls] == [
        "result.ack", "secret.cleanup", "view.cleanup", "attempt.cleanup",
    ]
    assert connector.client.closed


def test_transport_projects_deepseek_config_at_bounded_target():
    connector = Connector()
    transport = WslExecutionTransport(
        connector, codex_linux_path="/codex", codex_digest="sha256:" + "c" * 64,
    )
    plan = SimpleNamespace(
        command=("/runtime/bin/codex", "exec", "--json", "-"),
        environment={"HOME": "/runtime/home"}, stdin=b"prompt", timeout_ms=5000,
    )
    transport.start(
        workspace={"distribution": "Ubuntu", "remote_user": "tester",
                   "connection_id": "connection", "remote_path": "/workspace"},
        attempt_id="attempt", generation=1, plan=plan,
        credential=b"secret config", credential_target="/runtime/home/config.toml",
        projected_files={"models.json": b'{"models":[]}'}, restored_files={},
    )
    calls = dict(connector.client.calls)
    assert "/runtime/home/config.toml" in calls["spawn"]["argv"]
    assert base64.b64decode(calls["secret.put"]["data"]) == b"secret config"
    assert calls["view.prepare"]["files"][0]["path"] == "models.json"


def test_real_worker_bwrap_runs_authorized_fake_codex_without_model(tmp_path):
    worker = Path(os.environ.get(
        "AGENT_BOX_TEST_WORKER",
        Path(__file__).resolve().parents[3] / "workers/agent-box-worker/target/debug/agent-box-worker",
    ))
    if not worker.is_file() or not shutil.which("bwrap"):
        pytest.skip("current Worker and bwrap are required")
    workspace = tmp_path / "project with 空格"
    workspace.mkdir()
    worker_root = tmp_path / "worker-root"
    executable = tmp_path / "fake-codex"
    executable.write_text("""#!/bin/sh
set -eu
test -r "$CODEX_HOME/auth.json"
test "$(cat)" = "offline prompt"
thread="offline-thread-123"
path="$CODEX_HOME/sessions/2026/09/13/rollout-$thread.jsonl"
mkdir -p "$(dirname "$path")"
printf '{"thread_id":"%s"}\n' "$thread" > "$path"
printf '{"type":"thread.started","thread_id":"%s"}\n' "$thread"
printf '{"type":"item.completed","item":{"type":"agent_message","text":"offline answer"}}\n'
printf '{"type":"turn.completed","usage":{"output_tokens":2}}\n'
""", encoding="utf-8")
    executable.chmod(0o755)

    class RealConnector:
        def client_for_workspace(self, **arguments):
            return WorkerClient(
                [str(worker), "--root", str(worker_root), "--workspace", str(workspace)],
                worker_digest=_file_digest(worker), worker_version="0.1.0",
                connection_id=arguments["connection_id"], project_id=arguments["connection_id"],
                effective_user=os.environ["USER"], server_instance_id="server-offline",
                executable_authorizations=arguments["executable_authorizations"],
            )

    transport = WslExecutionTransport(
        RealConnector(), codex_linux_path=str(executable),
        codex_digest=_file_digest(executable),
    )
    attempt = transport.start(
        workspace={
            "distribution": "Ubuntu", "remote_user": os.environ["USER"],
            "connection_id": "connection-offline", "remote_path": str(workspace),
        }, attempt_id="attempt-offline", generation=1,
        plan=SimpleNamespace(
            command=("/runtime/bin/codex", "exec", "--json", "-"),
            environment={
                "HOME": "/runtime/home", "CODEX_HOME": "/runtime/home",
                "PATH": "/usr/bin:/bin", "LANG": "C.UTF-8",
            },
            stdin=b"offline prompt", timeout_ms=5000,
        ),
        credential=b'{"offline":"fixture"}', restored_files={},
    )
    terminal = transport.wait(attempt, timeout=10)
    assert terminal["exitCode"] == 0
    stdout, _stdout_digest = transport.result_bytes(attempt, "stdout")
    assert b"offline answer" in stdout
    files = transport.list_view(attempt)
    assert {item["path"] for item in files} == {
        "auth.json", "sessions/2026/09/13/rollout-offline-thread-123.jsonl",
    }
    session_path = next(item["path"] for item in files if item["path"].startswith("sessions/"))
    native, native_digest = transport.view_bytes(attempt, session_path)
    assert "sha256:" + hashlib.sha256(native).hexdigest() == native_digest
    transport.acknowledge_and_cleanup(attempt)
    assert not (worker_root / "results" / "attempt-offline-1").exists()
    assert not (worker_root / "secrets").exists()
    assert not (worker_root / "views" / "view-attempt-offline").exists()


def _file_digest(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()
