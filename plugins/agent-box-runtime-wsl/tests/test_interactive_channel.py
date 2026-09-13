"""Work Order 40-B gates: bidirectional interactive Worker channel.

Drives the real Worker binary with bwrap-isolated fake children. No Harness,
credential, or model is involved.
"""
from __future__ import annotations

import base64
import hashlib
import os
from pathlib import Path
import shutil
import time

import pytest

from agent_box_runtime_wsl.client import WorkerClient, WorkerError


REPO = Path(__file__).resolve().parents[3]
WORKER = Path(os.environ.get(
    "AGENT_BOX_TEST_WORKER",
    REPO / "workers" / "agent-box-worker" / "target" / "debug" / "agent-box-worker",
))


def digest(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def worker_client(tmp_path, *, lease_ms=5_000):
    if not WORKER.is_file():
        pytest.skip("build the independent Worker before this test")
    project = tmp_path / "workspace"
    project.mkdir(exist_ok=True)
    command = [str(WORKER), "--root", str(tmp_path / "worker-root"), "--workspace", str(project)]
    return WorkerClient(
        command, worker_digest=digest(WORKER), worker_version="0.1.0",
        connection_id="connection-test", project_id="project-test",
        effective_user=os.environ["USER"], server_instance_id="server-test",
        lease_ms=lease_ms,
    ), project


def bwrap_argv(project: Path, script: str):
    if not shutil.which("bwrap"):
        pytest.skip("bubblewrap is unavailable")
    from agent_box_sandbox_bwrap.provider import _minimal_rootfs_argv

    argv = _minimal_rootfs_argv(Path(shutil.which("bwrap")))
    argv += [
        "--dir", "/workspace", "--bind", str(project), "/workspace",
        "--chdir", "/workspace", "--clearenv", "--", "/bin/sh", "-c", script,
    ]
    return argv


def test_worker_rejects_unsupported_protocol_version_loudly(tmp_path, monkeypatch):
    import agent_box_runtime_wsl.client as client_module

    client, _project = worker_client(tmp_path)
    monkeypatch.setattr(client_module, "PROTOCOL_VERSION", 3)
    with pytest.raises(WorkerError, match="PROTOCOL_VERSION_UNSUPPORTED"):
        client.start()


def test_interactive_attempt_streams_output_and_takes_stdin_before_terminal(tmp_path):
    client, project = worker_client(tmp_path)
    client.start()
    try:
        events = []
        client.subscribe_output(events.append)
        accepted = client.request("spawn", {
            "argv": bwrap_argv(project, "while IFS= read -r line; do echo \"ack:$line\"; done; echo final"),
            "stdinBase64": "",
            "interactive": True,
            "timeoutMs": 30_000,
        }, attempt_id="attempt-live", generation=1)
        assert accepted["status"] == "accepted"

        assert client.write_stdin("attempt-live", 1, b"first\n") == 6
        deadline = time.monotonic() + 5
        first_payload = None
        while time.monotonic() < deadline:
            payloads = [item["result"] for item in events if item["event"] == "process.output"]
            texts = [
                base64.b64decode(item["data"]) for item in payloads
                if item["stream"] == "stdout" and item["data"]
            ]
            if any(b"ack:first" in chunk for chunk in texts):
                first_payload = texts
                break
            time.sleep(0.02)
        assert first_payload, "stdout chunk with ack:first never arrived pre-terminal"

        assert client.write_stdin("attempt-live", 1, b"second\n") == 7
        client.close_stdin("attempt-live", 1)
        terminal = client.wait_terminal("attempt-live", 1, timeout=15)
        assert terminal["exitCode"] == 0
        assert terminal["cancelled"] is False

        streamed = [
            base64.b64decode(item["result"]["data"])
            for item in events
            if item["event"] == "process.output" and item["result"]["stream"] == "stdout"
        ]
        assert any(b"ack:second" in chunk for chunk in streamed)
    finally:
        client.close()


def test_interactive_cancel_terminates_the_child_tree(tmp_path):
    client, project = worker_client(tmp_path)
    client.start()
    try:
        client.request("spawn", {
            "argv": bwrap_argv(project, "while true; do echo tick; sleep 0.1; done"),
            "interactive": True,
            "timeoutMs": 30_000,
        }, attempt_id="attempt-ticks", generation=1)
        assert client.request("cancel", attempt_id="attempt-ticks", generation=1)["accepted"] is True
        terminal = client.wait_terminal("attempt-ticks", 1, timeout=10)
        assert terminal["cancelled"] is True
    finally:
        client.close()


def test_interactive_output_budget_reports_truncation(tmp_path):
    client, project = worker_client(tmp_path)
    client.start()
    try:
        events = []
        client.subscribe_output(events.append)
        client.request("spawn", {
            "argv": bwrap_argv(
                project,
                "i=0; while [ $i -lt 40000 ]; do echo '0123456789012345678901234567890123456789'; i=$((i+1)); done",
            ),
            "interactive": True,
            "timeoutMs": 60_000,
        }, attempt_id="attempt-flood", generation=1)
        terminal = client.wait_terminal("attempt-flood", 1, timeout=45)
        assert terminal["exitCode"] == 0
        outputs = [item["result"] for item in events if item["event"] == "process.output"]
        assert outputs, "no pre-terminal output was forwarded"
        assert any(item.get("truncated") for item in outputs), "truncation marker missing"
        forwarded = sum(len(item["data"]) for item in outputs if not item.get("truncated"))
        assert forwarded <= 2 * 1024 * 1024  # base64 of the 1 MiB forwarding budget
    finally:
        client.close()


def test_attempt_write_on_one_shot_attempt_is_rejected(tmp_path):
    client, project = worker_client(tmp_path)
    client.start()
    try:
        client.request("spawn", {
            "argv": bwrap_argv(project, "cat input.txt; cat; printf ':done'"),
            "stdinBase64": base64.b64encode(b":stdin").decode(),
            "timeoutMs": 5_000,
        }, attempt_id="attempt-oneshot", generation=1)
        with pytest.raises(WorkerError) as not_interactive:
            client.write_stdin("attempt-oneshot", 1, b"x")
        assert not_interactive.value.code == "ATTEMPT_NOT_INTERACTIVE"
        terminal = client.wait_terminal("attempt-oneshot", 1, timeout=10)
        assert terminal["exitCode"] == 0
    finally:
        client.close()
