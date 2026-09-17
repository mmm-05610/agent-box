from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import threading
import time

import pytest

from agent_box_runtime_wsl.client import (
    DATA, LeaseKeepalive, WorkerClient, WorkerError, WorkerRequestLockTimeout,
    encode_frame, lease_heartbeat_interval, read_frame,
)


REPO = Path(__file__).resolve().parents[3]
WORKER = Path(os.environ.get(
    "AGENT_BOX_TEST_WORKER",
    REPO / "workers" / "agent-box-worker" / "target" / "debug" / "agent-box-worker",
))


def digest(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def worker_client(
    tmp_path, *, workspace=True, lease_ms=5_000, result_ttl_seconds=None,
    runtime_artifact_authorizations=(),
):
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
        runtime_artifact_authorizations=runtime_artifact_authorizations,
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
    attachment = (project / "子目录" / "attachment.bin")
    attachment_content = b"worker-authorized-attachment"
    attachment.write_bytes(attachment_content)
    outside = tmp_path / "outside.txt"
    outside.write_bytes(b"must-not-be-readable")
    (project / "escape-link").symlink_to(outside)
    client.start()
    try:
        browse = client.request("browse", {"path": str(project)})
        assert browse["directories"] == ["子目录"]

        first_chunk = client.request("workspace.get", {
            "path": "子目录/attachment.bin", "offset": 0, "maxLength": 7,
        })
        second_chunk = client.request("workspace.get", {
            "path": "子目录/attachment.bin", "offset": first_chunk["nextOffset"],
            "maxLength": 64,
        })
        assert base64.b64decode(first_chunk["data"]) + base64.b64decode(second_chunk["data"]) == attachment_content
        assert first_chunk["digest"] == second_chunk["digest"] == (
            "sha256:" + hashlib.sha256(attachment_content).hexdigest()
        )
        assert second_chunk["eof"] is True

        with pytest.raises(WorkerError) as traversal_attachment:
            client.request("workspace.get", {"path": "../outside.txt"})
        assert traversal_attachment.value.code == "PATH_INVALID"
        with pytest.raises(WorkerError) as linked_attachment:
            client.request("workspace.get", {"path": "escape-link"})
        assert linked_attachment.value.code == "ATTACHMENT_UNAUTHORIZED"

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


def artifact_tree(tmp_path, name="fixture-dep"):
    """A small immutable dependency directory, as a deployment would stage it."""
    from agent_box.resource_contracts.runtime_artifacts import (
        runtime_artifact_tree_digest,
    )

    root = tmp_path / "artifacts" / name
    (root / "nested").mkdir(parents=True)
    (root / "dep.mjs").write_text("export const VALUE = 'fixed-value'\n", encoding="utf-8")
    (root / "nested" / "extra.txt").write_text("extra\n", encoding="utf-8")
    return root, runtime_artifact_tree_digest(root)


def bwrap_argv_with_artifacts(project: Path, script: str, mounts):
    argv = bwrap_argv(project, script)
    injected = ["--dir", "/runtime/artifacts"]
    for source, target in mounts:
        injected += ["--ro-bind", str(source), target]
    marker = argv.index("--chdir")
    argv[marker:marker] = injected
    return argv


def test_real_worker_verifies_and_read_only_mounts_a_runtime_artifact_tree(tmp_path):
    """The Worker is the authority: it re-derives the digest inside WSL."""
    root, declared = artifact_tree(tmp_path)
    client, project, worker_root = worker_client(
        tmp_path,
        runtime_artifact_authorizations=({
            "path": str(root), "target": "/runtime/artifacts/fixture-dep",
            "digest": declared,
        },),
    )
    client.start()
    try:
        client.request("spawn", {
            "argv": bwrap_argv_with_artifacts(
                project,
                "cat /runtime/artifacts/fixture-dep/dep.mjs; printf '|'; "
                "cat /runtime/artifacts/fixture-dep/nested/extra.txt; "
                "printf '|write:'; "
                "(echo tampered > /runtime/artifacts/fixture-dep/written) 2>/dev/null "
                "&& printf allowed || printf refused",
                ((root, "/runtime/artifacts/fixture-dep"),),
            ),
            "timeoutMs": 20_000,
        }, attempt_id="attempt-artifact", generation=1)
        terminal = client.wait_terminal("attempt-artifact", 1, timeout=30)
        assert terminal["exitCode"] == 0
        stdout, _digest = fetch_all(client, "attempt-artifact", 1, "stdout")
        assert stdout == b"export const VALUE = 'fixed-value'\n|extra\n|write:refused"
        # The host tree is unchanged: the projection was read-only, and the
        # guest's write attempt left nothing behind.
        from agent_box.resource_contracts.runtime_artifacts import (
        runtime_artifact_tree_digest,
    )

        assert runtime_artifact_tree_digest(root) == declared
        assert not (root / "written").exists()
        assert client.request(
            "result.ack", attempt_id="attempt-artifact", generation=1,
        )["status"] == "acknowledged"
        assert client.request(
            "attempt.cleanup", attempt_id="attempt-artifact", generation=1,
        )["status"] == "cleaned"
    finally:
        client.close()
    assert not (worker_root / "views").exists()
    assert not (worker_root / "secrets").exists()


@pytest.mark.parametrize("declaration,mounts,expected", [
    # A digest that does not match the real tree is a typed bootstrap refusal.
    ("drift", (("authorized", "/runtime/artifacts/fixture-dep"),),
     "RUNTIME_ARTIFACT_DIGEST_MISMATCH"),
    # ... and so is a declaration whose root is a link, or overlaps the project.
    ("symlink", (("root", "/runtime/artifacts/fixture-dep"),), "RUNTIME_ARTIFACT_ROOT_INVALID"),
    ("workspace", (("workspace", "/runtime/artifacts/fixture-dep"),),
     "RUNTIME_ARTIFACT_ROOT_OVERLAP"),
    ("duplicate", (("authorized", "/runtime/artifacts/fixture-dep"),),
     "RUNTIME_ARTIFACT_DUPLICATE"),
])
def test_real_worker_refuses_unverifiable_artifact_declarations(
    tmp_path, declaration, mounts, expected,
):
    root, declared = artifact_tree(tmp_path)
    declared_path = str(root)
    if declaration == "drift":
        declared = "sha256:" + "0" * 64
    elif declaration == "symlink":
        link = tmp_path / "link"
        link.symlink_to(root, target_is_directory=True)
        declared_path = str(link)
    elif declaration == "workspace":
        declared_path = str(tmp_path / "中文 空格")
    item = {"path": declared_path, "target": "/runtime/artifacts/fixture-dep", "digest": declared}
    authorizations = (item, item) if declaration == "duplicate" else (item,)
    client, _project, _root = worker_client(
        tmp_path, runtime_artifact_authorizations=authorizations,
    )
    with pytest.raises(WorkerError) as refused:
        client.start()
    assert refused.value.code == expected
    client.close()


def test_real_worker_refuses_an_artifact_mount_it_did_not_verify(tmp_path):
    root, declared = artifact_tree(tmp_path)
    outside = tmp_path / "unverified"
    outside.mkdir()
    (outside / "dep.mjs").write_text("outside\n", encoding="utf-8")
    client, project, worker_root = worker_client(
        tmp_path,
        runtime_artifact_authorizations=({
            "path": str(root), "target": "/runtime/artifacts/fixture-dep",
            "digest": declared,
        },),
    )
    client.start()
    try:
        for label, argv in (
            ("unverified source", ((outside, "/runtime/artifacts/other"),)),
            ("unnamed target", ((root, "/runtime/artifacts/other"),)),
            ("host directory", ((Path("/home"), "/runtime/artifacts/home"),)),
            ("project as artifact", ((project, "/runtime/artifacts/project"),)),
        ):
            with pytest.raises(WorkerError) as refused:
                client.request(
                    "spawn",
                    {"argv": bwrap_argv_with_artifacts(
                        project, "true", argv,
                    ), "timeoutMs": 5_000},
                    attempt_id=f"attempt-{abs(hash(label))}", generation=1,
                )
            assert refused.value.code == "RUNTIME_ARTIFACT_UNAUTHORIZED", label
        # A verified artifact tree may not be mounted writable either.
        writable = bwrap_argv_with_artifacts(
            project, "true", (), )
        writable = bwrap_argv(project, "true")
        marker = writable.index("--chdir")
        writable[marker:marker] = [
            "--dir", "/runtime/artifacts", "--bind", str(root), "/runtime/artifacts/fixture-dep",
        ]
        with pytest.raises(WorkerError) as writable_refused:
            client.request(
                "spawn", {"argv": writable, "timeoutMs": 5_000},
                attempt_id="attempt-writable-artifact", generation=1,
            )
        assert writable_refused.value.code == "RUNTIME_ARTIFACT_UNAUTHORIZED"
    finally:
        client.close()
    assert not (worker_root / "views").exists()


class _StubClient:
    """最小替身：只用于确定性地触发心跳失败/锁占用路径。

    真实门禁一律走上面的真 Worker；这里不需要帧、进程或协议。
    """

    def __init__(self, *, lease_ms=5_000, error=None) -> None:
        self.lease_ms = lease_ms
        self.closed = False
        self.requests: list[tuple[str, float]] = []
        self.error = error

    def request(self, op, arguments=None, *, attempt_id=None, generation=None, timeout=10.0):
        self.requests.append((op, timeout))
        if self.error is not None:
            raise self.error
        return {"status": "ok"}


def test_keepalive_interval_and_cadence_are_derived_from_the_lease():
    """反例：间隔由租约派生（至多约 lease/3），不写死只适合 5 秒租约的常量。"""
    for lease_ms in (1_000, 5_000, 120_000):
        assert lease_heartbeat_interval(lease_ms) == pytest.approx(lease_ms / 3000)
    assert lease_heartbeat_interval(30) == pytest.approx(0.05)  # 下界保护
    client = _StubClient(lease_ms=300)
    owner = LeaseKeepalive(client, label="cadence")
    assert owner.interval == pytest.approx(0.1)
    assert owner.timeout == pytest.approx(0.1)  # ≤ min(2.0, interval)
    owner.start()
    assert owner.thread is not None and owner.thread.name == "worker-lease-cadence"
    deadline = time.monotonic() + 3
    while owner.heartbeats < 3 and time.monotonic() < deadline:
        time.sleep(0.01)
    owner.stop()
    assert owner.heartbeats >= 3
    assert [op for op, _timeout in client.requests][:3] == ["heartbeat"] * 3
    assert all(timeout <= min(2.0, owner.interval) + 1e-9 for _op, timeout in client.requests)
    frozen = owner.heartbeats
    time.sleep(0.3)
    assert owner.heartbeats == frozen
    assert owner.thread is None


def test_keepalive_surfaces_a_typed_failure_instead_of_waiting_forever():
    """反例 7（确定性替身版）：heartbeat 出错 → 类型化 failure，根因保留。

    保活绝不静默续跑、也不让调用方无限等待：错误一旦发生就记录并停止。
    """
    client = _StubClient(lease_ms=300, error=WorkerError("WORKER_ERROR", "heartbeat rejected"))
    owner = LeaseKeepalive(client, label="failing")
    owner.start()
    deadline = time.monotonic() + 3
    while owner.failure is None and time.monotonic() < deadline:
        time.sleep(0.01)
    assert owner.failure is not None
    assert owner.failure.code == "WORKER_LEASE_HEARTBEAT_FAILED"
    assert "WORKER_ERROR" in owner.failure.message
    assert "heartbeat rejected" in owner.failure.message
    assert isinstance(owner.failure.__cause__, WorkerError)
    heartbeats = owner.heartbeats
    assert client.requests  # 失败的那一拍确实发出过
    owner.stop()
    owner.close()
    owner.stop()  # 幂等
    assert owner.heartbeats == heartbeats  # 失败之后不再有 heartbeat
    assert owner.thread is None


def test_keepalive_tolerates_a_busy_lock_then_fails_closed():
    """串行化锁被占用时这一拍不发出、也不误报失败；连续跳过一整个租约周期的
    量之后按类型化失败收尾（fail-closed），因为保活实际上已经没在起作用。"""
    client = _StubClient(lease_ms=300, error=WorkerRequestLockTimeout("busy"))
    owner = LeaseKeepalive(client, label="busy-lock")
    owner.start()
    deadline = time.monotonic() + 3
    while owner.failure is None and time.monotonic() < deadline:
        time.sleep(0.01)
    assert owner.failure is not None
    assert owner.failure.code == "WORKER_LEASE_HEARTBEAT_FAILED"
    assert "WORKER_REQUEST_LOCK_TIMEOUT" in owner.failure.message
    assert owner.heartbeats == 0  # 一个帧都没有发出：跳过不等于发出
    owner.stop()
    assert owner.thread is None


def test_keepalive_stop_freezes_heartbeats_without_threads_or_residue(tmp_path):
    """反例 4：stop() 幂等、join 线程、计数冻结、_pending 无心跳残渣。"""
    client, project, _root = worker_client(tmp_path)
    client.start()
    owner = client.keep_lease(label="residue-check")
    owner.start()
    try:
        assert client.request("browse", {"path": str(project)})["directories"] == []
        deadline = time.monotonic() + 5
        while owner.heartbeats < 2 and time.monotonic() < deadline:
            time.sleep(0.02)
        assert owner.heartbeats >= 2
        assert owner.failure is None
        owner.stop()
        frozen = owner.heartbeats
        time.sleep(2 * owner.interval)
        assert owner.heartbeats == frozen
        assert owner.thread is None
        assert not [item for item in threading.enumerate() if item.name.startswith("worker-lease-")]
        assert client._pending == {}  # 心跳响应由它自己的请求路径消费
        # 停掉保活不影响连接健康：后续请求照常。
        assert client.request("browse", {"path": str(project)})["directories"] == []
    finally:
        owner.stop()
        client.close()


def test_close_stops_a_running_keepalive(tmp_path):
    """反例 4（close 那一半）：client.close() 之后不得再有 heartbeat/线程残留。"""
    client, project, _root = worker_client(tmp_path)
    client.start()
    owner = client.keep_lease(label="closed-client")
    owner.start()
    deadline = time.monotonic() + 5
    while owner.heartbeats < 1 and time.monotonic() < deadline:
        time.sleep(0.02)
    assert owner.heartbeats >= 1
    client.close()
    assert owner.thread is None
    frozen = owner.heartbeats
    time.sleep(4 * owner.interval)
    assert owner.heartbeats == frozen
    assert not [item for item in threading.enumerate() if item.name.startswith("worker-lease-")]
    assert owner.failure is None  # 正常关闭不是租约失败
    with pytest.raises(WorkerError):
        # close() 之后不可能再写向已关闭的进程：写路径必须类型化失败。
        client.request("browse", {"path": str(project)}, timeout=2)


def test_lease_expiry_still_cancels_the_attempt_after_the_keepalive_stops(tmp_path):
    """反例 8：停止保活后 Worker 的租约过期清理必须仍然生效。

    保活只覆盖 owner 活着的时间：它不能把 orphan 变成永久存活，也不能在自己
    停止后仍在刷新租约。这里全程不调用 wait_terminal，也不在停止后发任何帧，
    直接观察 Worker 写出的 result.json。
    """
    client, project, root = worker_client(tmp_path, lease_ms=2_000)
    client.start()
    owner = client.keep_lease(label="orphan-guard")
    owner.start()
    try:
        assert client.request("spawn", {
            "argv": bwrap_argv(project, "sleep 60"),
            "stdinBase64": "", "interactive": True, "timeoutMs": 60_000,
        }, attempt_id="attempt-orphan", generation=1)["status"] == "accepted"
        result = root / "results" / "attempt-orphan-1" / "result.json"
        # 跨过多个租约周期：保活让 attempt 活着。
        time.sleep(3.5)
        assert owner.failure is None
        assert not result.exists()
        owner.stop()
        # 停止之后不再有任何客户端帧，Worker 必须在一个租约边界内清掉它。
        deadline = time.monotonic() + 8
        while not result.exists() and time.monotonic() < deadline:
            time.sleep(0.05)
        assert result.exists()
        assert json.loads(result.read_text(encoding="utf-8"))["cancelled"] is True
    finally:
        owner.stop()
        client.close()


def test_concurrent_requests_with_a_keepalive_keep_sequences_monotonic(tmp_path):
    """反例 9（纯请求侧）：并发请求与保活 heartbeat 不串 requestId/序号。

    序号由串行化锁保护：严格递增、无重复，每个响应回到它的请求者。
    """
    client, project, _root = worker_client(tmp_path)
    (project / "input.txt").write_text("worker-controlled", encoding="utf-8")
    written: list[tuple[int, str]] = []
    original_write = client._write

    def spy_write(kind, stream_id, sequence, value):
        written.append((sequence, str(value.get("op"))))
        return original_write(kind, stream_id, sequence, value)

    client._write = spy_write
    client.start()
    owner = client.keep_lease(label="busy-requests")
    owner.start()
    errors: list[BaseException] = []

    def requester():
        try:
            for _ in range(4):
                assert client.request("browse", {"path": str(project)})["directories"] == []
                fetched = client.request(
                    "workspace.get", {"path": "input.txt", "offset": 0, "maxLength": 64},
                )
                assert base64.b64decode(fetched["data"]) == b"worker-controlled"
        except BaseException as exc:
            errors.append(exc)

    try:
        threads = [threading.Thread(target=requester) for _ in range(4)]
        for item in threads:
            item.start()
        for item in threads:
            item.join(timeout=30)
        assert not errors, errors
        owner.stop()  # 先冻结保活，再断言没有未消费响应
        assert client._pending == {}
        sequences = [sequence for sequence, _op in written]
        assert sequences == sorted(sequences)
        assert len(set(sequences)) == len(sequences)
        ops = [op for _sequence, op in written]
        assert "browse" in ops and "workspace.get" in ops and "heartbeat" in ops
    finally:
        owner.stop()
        client.close()
