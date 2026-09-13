from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import time

import pytest

from agent_box_runtime_wsl.client import WorkerClient, WorkerError, encode_frame, read_frame, DATA


REPO = Path(__file__).resolve().parents[3]
WORKER = Path(os.environ.get(
    "AGENT_BOX_TEST_WORKER",
    REPO / "workers" / "agent-box-worker" / "target" / "debug" / "agent-box-worker",
))


def digest(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def worker_client(tmp_path, *, workspace=True, lease_ms=5_000, result_ttl_seconds=None):
    if not WORKER.is_file():
        pytest.skip("build the independent Worker before this test")
    project = tmp_path / "中文 空格"
    project.mkdir(exist_ok=True)
    root = tmp_path / "worker-root"
    command = [str(WORKER), "--root", str(root)]
    if workspace:
        command += ["--workspace", str(project)]
    if result_ttl_seconds is not None:
        command += ["--result-ttl-seconds", str(result_ttl_seconds)]
    client = WorkerClient(
        command, worker_digest=digest(WORKER), worker_version="0.1.0",
        connection_id="connection-test", project_id="project-test",
        effective_user=os.environ["USER"], server_instance_id="server-test",
        lease_ms=lease_ms,
    )
    return client, project, root


def test_python_frame_matches_rust_golden():
    expected = (REPO / "protocols" / "worker" / "golden" / "empty-frame.hex")
    if not expected.exists():
        expected = REPO / "protocols" / "worker" / "golden" / "empty-data-frame.hex"
    assert encode_frame(DATA, 7, 9, b"").hex() == expected.read_text().strip()


def test_real_worker_browse_view_secret_and_identity_guards(tmp_path):
    client, project, root = worker_client(tmp_path)
    (project / "子目录").mkdir()
    client.start()
    try:
        browse = client.request("browse", {"path": str(project)})
        assert browse["directories"] == ["子目录"]

        content = "受控内容\n".encode()
        view_digest = "sha256:" + hashlib.sha256(content).hexdigest()
        assert client.request("view.prepare", {
            "viewId": "view-test", "files": [
                {"path": "配置/input.txt", "digest": view_digest, "size": len(content)},
                {"path": "配置/empty.txt", "digest": "sha256:" + hashlib.sha256(b"").hexdigest(), "size": 0},
            ],
        })["status"] == "prepared"
        split = len(content) // 2
        first = client.request("view.put", {
            "viewId": "view-test", "path": "配置/input.txt", "offset": 0,
            "data": base64.b64encode(content[:split]).decode(),
        })
        assert first["complete"] is False
        second = client.request("view.put", {
            "viewId": "view-test", "path": "配置/input.txt", "offset": split,
            "data": base64.b64encode(content[split:]).decode(),
        })
        assert second["complete"] is True
        assert client.request("view.commit", {"viewId": "view-test"})["status"] == "ready"
        assert (root / "views" / "view-test" / "ready" / "配置" / "empty.txt").read_bytes() == b""
        generated = root / "views" / "view-test" / "ready" / "sessions" / "rollout-thread.jsonl"
        generated.parent.mkdir()
        generated.write_bytes(b"native-state")
        listed = client.request("view.list", {"viewId": "view-test"})
        assert {item["path"] for item in listed["files"]} >= {
            "配置/input.txt", "配置/empty.txt", "sessions/rollout-thread.jsonl",
        }
        captured = client.request("view.get", {
            "viewId": "view-test", "path": "sessions/rollout-thread.jsonl",
            "offset": 0, "maxLength": 32,
        })
        assert base64.b64decode(captured["data"]) == b"native-state"
        assert captured["digest"] == "sha256:" + hashlib.sha256(b"native-state").hexdigest()

        fixture = base64.b64encode(b"non-credential-fixture").decode()
        assert client.request("secret.put", {
            "attemptId": "attempt-secret", "frameId": "frame-one", "data": fixture,
        })["status"] == "materialized"
        secret_path = root / "secrets" / "attempt-secret" / "frame-one"
        assert secret_path.stat().st_mode & 0o777 == 0o600
        with pytest.raises(WorkerError, match="one-shot") as duplicate:
            client.request("secret.put", {
                "attemptId": "attempt-secret", "frameId": "frame-one", "data": fixture,
            })
        assert duplicate.value.code == "SECRET_REJECTED"
        assert client.request("secret.cleanup", {
            "attemptId": "attempt-secret", "frameId": "frame-one",
        })["status"] == "cleaned"
        assert not secret_path.exists()

        with pytest.raises(WorkerError) as traversal:
            client.request("view.put", {
                "viewId": "view-test", "path": "../escape", "offset": 0,
                "data": base64.b64encode(b"x").decode(),
            })
        assert traversal.value.code == "PATH_INVALID"
        assert client.request("view.cleanup", {"viewId": "view-test"})["status"] == "cleaned"
        with pytest.raises(WorkerError) as duplicate:
            client.request("view.prepare", {
                "viewId": "view-duplicate", "files": [
                    {"path": "same", "digest": view_digest, "size": len(content)},
                    {"path": "same", "digest": view_digest, "size": len(content)},
                ],
            })
        assert duplicate.value.code == "VIEW_INVALID"
        assert not (root / "views" / "view-duplicate").exists()
    finally:
        client.close()


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


def fetch_all(client, attempt_id, generation, artifact):
    chunks = []
    offset = 0
    expected_digest = None
    while True:
        item = client.request("result.get", {"artifact": artifact, "offset": offset, "maxLength": 7}, attempt_id=attempt_id, generation=generation)
        chunks.append(base64.b64decode(item["data"]))
        expected_digest = expected_digest or item["digest"]
        assert item["digest"] == expected_digest
        offset = item["nextOffset"]
        if item["eof"]:
            data = b"".join(chunks)
            assert "sha256:" + hashlib.sha256(data).hexdigest() == expected_digest
            return data, expected_digest


def test_real_worker_runs_fake_task_only_through_bwrap_and_captures_before_cleanup(tmp_path):
    client, project, root = worker_client(tmp_path)
    (project / "input.txt").write_text("worker-controlled", encoding="utf-8")
    client.start()
    try:
        attempt = "attempt-fake"
        generation = 3
        accepted = client.request("spawn", {
            "argv": bwrap_argv(project, "cat input.txt; cat; printf ':done'; printf 'artifact' > output.txt"),
            "stdinBase64": base64.b64encode(b":stdin").decode(),
            "timeoutMs": 5_000,
        }, attempt_id=attempt, generation=generation)
        assert accepted["status"] == "accepted"
        terminal = client.wait_terminal(attempt, generation)
        assert terminal["exitCode"] == 0
        stdout, stdout_digest = fetch_all(client, attempt, generation, "stdout")
        assert stdout == b"worker-controlled:stdin:done"
        assert (project / "output.txt").read_text() == "artifact"
        assert client.request("result.ack", attempt_id=attempt, generation=generation)["status"] == "acknowledged"
        assert client.request("result.ack", attempt_id=attempt, generation=generation)["status"] == "acknowledged"
        assert (root / "results" / f"{attempt}-{generation}" / "stdout").is_file()
        assert client.request("attempt.cleanup", attempt_id=attempt, generation=generation)["status"] == "cleaned"
        assert not (root / "results" / f"{attempt}-{generation}").exists()

        outside = bwrap_argv(project, "true")
        separator = outside.index("--")
        outside[separator:separator] = ["--ro-bind", "/home", "/stolen"]
        with pytest.raises(WorkerError) as ownership:
            client.request("spawn", {"argv": outside}, attempt_id="attempt-outside", generation=1)
        assert ownership.value.code == "WORKSPACE_UNAUTHORIZED"
    finally:
        client.close()


def test_real_worker_cancel_timeout_and_lease_are_terminal(tmp_path):
    client, project, _root = worker_client(tmp_path, lease_ms=1_000)
    client.start()
    try:
        client.request("spawn", {"argv": bwrap_argv(project, "sleep 30"), "timeoutMs": 20_000}, attempt_id="cancelled", generation=1)
        assert client.request("cancel", attempt_id="cancelled", generation=1)["accepted"] is True
        assert client.wait_terminal("cancelled", 1)["cancelled"] is True

        client.request("spawn", {"argv": bwrap_argv(project, "sleep 30"), "timeoutMs": 250}, attempt_id="timed", generation=1)
        assert client.wait_terminal("timed", 1)["timedOut"] is True

        client.request("spawn", {"argv": bwrap_argv(project, "sleep 30"), "timeoutMs": 20_000}, attempt_id="leased", generation=1)
        time.sleep(1.4)
        observed = client.request("observe", attempt_id="leased", generation=1)
        assert observed["status"] == "terminal"
        assert observed["result"]["cancelled"] is True
    finally:
        client.close()


def test_disconnect_cancels_execution_reclaims_secret_and_expires_isolated_result(tmp_path):
    client, project, root = worker_client(tmp_path, result_ttl_seconds=1)
    client.start()
    client.request("secret.put", {
        "attemptId": "disconnecting", "frameId": "fixture",
        "data": base64.b64encode(b"non-credential-fixture").decode(),
    })
    client.request(
        "spawn",
        {"argv": bwrap_argv(project, "sleep 30"), "timeoutMs": 20_000},
        attempt_id="disconnecting",
        generation=1,
    )
    client.close()

    result = root / "results" / "disconnecting-1"
    assert json.loads((result / "result.json").read_text())["cancelled"] is True
    assert not (root / "secrets").exists()
    deadline = time.monotonic() + 3
    while result.exists() and time.monotonic() < deadline:
        time.sleep(0.05)
    assert not result.exists()
