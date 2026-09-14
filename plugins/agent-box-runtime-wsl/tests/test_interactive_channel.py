"""Work Order 40-B gates: bidirectional interactive Worker channel.

Drives the real Worker binary with bwrap-isolated fake children. No Harness,
credential, or model is involved.
"""
from __future__ import annotations

import base64
import hashlib
import json
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
    """A client one generation ahead is refused, never silently downgraded."""
    import agent_box_runtime_wsl.client as client_module

    client, _project = worker_client(tmp_path)
    monkeypatch.setattr(client_module, "PROTOCOL_VERSION", client_module.PROTOCOL_VERSION + 1)
    with pytest.raises(WorkerError, match="PROTOCOL_VERSION_UNSUPPORTED"):
        client.start()


def test_worker_refuses_a_previous_generation_client(tmp_path, monkeypatch):
    """A client one generation behind is refused too, in the other direction."""
    import agent_box_runtime_wsl.client as client_module

    client, _project = worker_client(tmp_path)
    monkeypatch.setattr(client_module, "PROTOCOL_VERSION", client_module.PROTOCOL_VERSION - 1)
    with pytest.raises(WorkerError, match="PROTOCOL_VERSION_UNSUPPORTED"):
        client.start()


def test_current_client_refuses_the_preserved_previous_generation_worker(tmp_path):
    """The same refusal against a real previous-generation Worker binary.

    `.acceptance-bundle-c3` is the Worker that shipped with the r3/r4 Windows
    evidence: protocol generation 2, before runtime artifact trees. A current
    client must fail loudly against it rather than reach a Worker that would
    bind a declared directory without verifying its digest.
    """
    bundle = REPO / "workers" / "agent-box-worker" / ".acceptance-bundle-c3"
    binary = bundle / "agent-box-worker"
    manifest = bundle / "manifest.json"
    if not binary.is_file() or not manifest.is_file():
        pytest.skip("the preserved previous-generation acceptance bundle is unavailable")
    recorded = json.loads(manifest.read_text(encoding="utf-8"))
    # The bundle is only usable evidence if it is the binary it claims to be.
    assert recorded["sha256"] == digest(binary)
    project = tmp_path / "workspace"
    project.mkdir()
    client = WorkerClient(
        [str(binary), "--root", str(tmp_path / "worker-root"), "--workspace", str(project)],
        worker_digest=recorded["sha256"], worker_version=recorded["workerVersion"],
        connection_id="connection-test", project_id="project-test",
        effective_user=os.environ["USER"], server_instance_id="server-test",
    )
    with pytest.raises(WorkerError) as refused:
        client.start()
    # That Worker refuses the whole bootstrap before it ever compares
    # generations, because `deny_unknown_fields` rejects the field it never
    # knew. The refusal is loud and fail-closed — a v2 Worker can never be
    # handed a runtime artifact declaration — and this is exactly the
    # generation break the version bump records.
    assert refused.value.code == "WORKER_DISCONNECTED"
    assert "invalid bootstrap" in refused.value.message
    client.close()
    # The generations really are different, so the case above is not a typo in
    # the fixture: this client speaks 3, that Worker speaks 2.
    import agent_box_runtime_wsl.client as client_module

    assert client_module.PROTOCOL_VERSION == 3


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


def test_worker_disconnect_wakes_long_lived_channel_owner(tmp_path):
    client, _project = worker_client(tmp_path)
    disconnected = []
    client.subscribe_disconnect(disconnected.append)
    client.start()
    assert client._process is not None  # controlled crash fixture
    client._process.kill()
    deadline = time.monotonic() + 5
    while not disconnected and time.monotonic() < deadline:
        time.sleep(0.02)
    try:
        assert len(disconnected) == 1
        assert disconnected[0].code == "WORKER_DISCONNECTED"
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
