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
import threading
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
    # the fixture: this client speaks the current generation, that Worker
    # speaks one behind it. The pin moves exactly when the generation moves -
    # order 45's home operation family is what moved it to 4.
    import agent_box_runtime_wsl.client as client_module

    assert client_module.PROTOCOL_VERSION == 4


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


def lease_threads() -> list[threading.Thread]:
    """还在运行的租约保活线程（残留检查用）。"""
    return [item for item in threading.enumerate() if item.name.startswith("worker-lease-")]


def stdout_chunks(events) -> list[bytes]:
    """把订阅到的 process.output 事件解码成 stdout 字节块。"""
    return [
        base64.b64decode(item["result"].get("data", ""))
        for item in events
        if item.get("event") == "process.output"
        and item["result"].get("stream") == "stdout"
        and item["result"].get("data")
    ]


def wait_for_output(events, needle: bytes, *, timeout: float) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if any(needle in chunk for chunk in stdout_chunks(events)):
            return True
        time.sleep(0.02)
    return False


def spawn_interactive(client, project, script, attempt_id, generation=1):
    return client.request("spawn", {
        "argv": bwrap_argv(project, script),
        "stdinBase64": "",
        "interactive": True,
        "timeoutMs": 60_000,
    }, attempt_id=attempt_id, generation=generation)


def test_silent_interactive_prompt_survives_the_default_five_second_lease(tmp_path):
    """回归：默认 5 秒租约下，8 秒无输出的 prompt 必须正常完成。

    原始缺陷：Worker 只在收到客户端帧时才刷新 lease_deadline，而 interactive
    轮次期间 Server 线程阻塞在 sidecar prompt 上、没有任何帧发出，默认租约一到
    Worker 就取消仍在正常运行的进程（客户端随后写 stdin 得到
    ATTEMPT_NOT_INTERACTIVE）。这里刻意模仿 sidecar 的形状：静默期不调用
    wait_terminal，保活 owner 是唯一的帧来源。lease_ms 必须保持生产默认值。
    """
    client, project = worker_client(tmp_path)  # 默认 lease_ms=5_000，不得覆盖
    client.start()
    events: list[dict] = []
    client.subscribe_output(events.append)
    owner = client.keep_lease(label="silent-prompt")
    owner.start()
    try:
        spawn_interactive(
            client, project,
            "sleep 8; echo survived; IFS= read -r line; echo \"echo:$line\"",
            "attempt-silent",
        )
        assert wait_for_output(events, b"survived", timeout=20), "静默 8 秒后的输出没有到达"
        # 反例 2：静默期里实际观察到多个 heartbeat（间隔 = lease/3 ≈ 1.67 秒）。
        assert owner.heartbeats >= 2, owner.heartbeats
        assert owner.failure is None
        # 缺陷现场的那一次写：修复前这里是 ATTEMPT_NOT_INTERACTIVE。
        assert client.write_stdin("attempt-silent", 1, b"alive\n", timeout=5) == 6
        terminal = client.wait_terminal("attempt-silent", 1, timeout=15)
        assert terminal["exitCode"] == 0
        assert terminal["cancelled"] is False
        assert any(b"echo:alive" in chunk for chunk in stdout_chunks(events))
        # 反例 3：terminal 之后停掉 owner，心跳计数不再增长。
        owner.stop()
        frozen = owner.heartbeats
        time.sleep(2 * owner.interval)
        assert owner.heartbeats == frozen
        assert not lease_threads()
    finally:
        owner.stop()
        client.close()


def test_cancel_during_a_silent_prompt_stays_bounded_with_a_keepalive(tmp_path):
    """反例 6：静默期内 cancel 仍然成功，且不会被保活 heartbeat 阻塞住。

    cancel 与 heartbeat 竞争同一把 request 串行化锁，等待必须有界：默认 5 秒
    租约下整拍超时约 1.67 秒，所以 3 秒上限足以区分"有界"与"被饿死"。
    """
    client, project = worker_client(tmp_path)
    client.start()
    owner = client.keep_lease(label="silent-cancel")
    owner.start()
    try:
        spawn_interactive(client, project, "sleep 30", "attempt-silent-cancel")
        time.sleep(6.0)  # 跨过一个完整租约周期：保活确实在起作用
        assert owner.failure is None
        started = time.monotonic()
        accepted = client.request(
            "cancel", attempt_id="attempt-silent-cancel", generation=1, timeout=5,
        )
        elapsed = time.monotonic() - started
        assert accepted["accepted"] is True
        assert elapsed < 3.0, elapsed
        terminal = client.wait_terminal("attempt-silent-cancel", 1, timeout=10)
        assert terminal["cancelled"] is True
    finally:
        owner.stop()
        client.close()


def test_concurrent_events_heartbeats_and_requests_do_not_cross_routes(tmp_path):
    """反例 9：输出事件 + 保活 heartbeat + 并发请求 + wait_terminal 不串线。

    多个消费者同时在同一控制流上时，序号必须严格递增且无重复，每个响应必须回到
    它的请求者，且静默窗口里 heartbeat 不得因为响应被别的消费者先取走而超时。
    """
    client, project = worker_client(tmp_path)
    events: list[dict] = []
    client.subscribe_output(events.append)
    written: list[tuple[int, str]] = []
    original_write = client._write

    def spy_write(kind, stream_id, sequence, value):
        written.append((sequence, str(value.get("op"))))
        return original_write(kind, stream_id, sequence, value)

    client._write = spy_write
    client.start()
    owner = client.keep_lease(label="crossed-routes")
    owner.start()
    errors: list[BaseException] = []
    terminals: list[dict] = []
    try:
        spawn_interactive(client, project, "echo burst; sleep 6; echo done", "attempt-crossed")

        def browsers():
            try:
                for _ in range(4):
                    assert client.request("browse", {"path": str(project)})["directories"] == []
            except BaseException as exc:  # 断言失败也要在下面显式暴露
                errors.append(exc)

        def waiter():
            try:
                terminals.append(client.wait_terminal("attempt-crossed", 1, timeout=40))
            except BaseException as exc:
                errors.append(exc)

        threads = [threading.Thread(target=browsers) for _ in range(3)]
        threads.append(threading.Thread(target=waiter))
        for item in threads:
            item.start()
        for item in threads:
            item.join(timeout=45)
        assert not errors, errors
        assert terminals and terminals[0]["exitCode"] == 0
        assert terminals[0]["cancelled"] is False
        # 6 秒静默窗口跨过多个租约拍：保活不得出现类型化失败。
        assert owner.failure is None
        assert owner.heartbeats >= 2, owner.heartbeats
        owner.stop()  # 先冻结保活，再断言没有未消费响应
        sequences = [sequence for sequence, _op in written]
        assert sequences == sorted(sequences)
        assert len(set(sequences)) == len(sequences)
        ops = [op for _sequence, op in written]
        assert ops.count("heartbeat") >= 2 and "browse" in ops
        assert client._pending == {}
    finally:
        owner.stop()
        client.close()


def test_wait_terminal_heartbeats_a_silent_attempt_under_the_default_lease(tmp_path):
    """反例 10：wait_terminal 既有的 heartbeat 语义不退化。

    wait_terminal 一直是第二个帧消费者，它自己的 heartbeat 必须继续让 6 秒
    静默（> 默认 5 秒租约）的 attempt 存活，并且仍然从 _terminals 正常交割。
    """
    client, project = worker_client(tmp_path)
    client.start()
    try:
        spawn_interactive(client, project, "sleep 6; echo done", "attempt-wait")
        terminal = client.wait_terminal("attempt-wait", 1, timeout=25)
        assert terminal["exitCode"] == 0
        assert terminal["cancelled"] is False
        assert client._pending == {}
    finally:
        client.close()


def test_worker_disconnect_raises_a_typed_error_on_the_read_path(tmp_path):
    """反例 5（读路径那一半）：Worker 消失必须在有界时间内唤醒读取方。

    客户端侧的另一半（subscribe_disconnect 回调）已经由
    test_worker_disconnect_wakes_long_lived_channel_owner 覆盖。
    """
    client, _project = worker_client(tmp_path)
    client.start()
    assert client._process is not None  # controlled crash fixture
    client._process.kill()
    with pytest.raises(WorkerError) as disconnected:
        client.wait_terminal("attempt-gone", 1, timeout=5)
    assert disconnected.value.code == "WORKER_DISCONNECTED"
    client.close()


def test_keepalive_surfaces_a_typed_failure_when_the_worker_dies(tmp_path):
    """反例 7（真 Worker 版）：heartbeat 失败类型化上浮，保活停止且不留线程。

    客户端绝不能因为 heartbeat 出错就静默续跑或让 prompt 无限等待：owner 必须
    记录 WORKER_LEASE_HEARTBEAT_FAILED（根因保留），并干净地退出。
    """
    client, project = worker_client(tmp_path)
    disconnected: list[WorkerError] = []
    client.subscribe_disconnect(disconnected.append)
    client.start()
    owner = client.keep_lease(label="dying-worker")
    owner.start()
    try:
        spawn_interactive(client, project, "sleep 30", "attempt-dying")
        deadline = time.monotonic() + 5
        while owner.heartbeats < 1 and time.monotonic() < deadline:
            time.sleep(0.02)
        assert owner.heartbeats >= 1
        assert client._process is not None  # controlled crash fixture
        client._process.kill()
        deadline = time.monotonic() + 8
        while owner.failure is None and time.monotonic() < deadline:
            time.sleep(0.02)
        assert owner.failure is not None
        assert owner.failure.code == "WORKER_LEASE_HEARTBEAT_FAILED"
        assert "WORKER_DISCONNECTED" in owner.failure.message
        assert isinstance(owner.failure.__cause__, WorkerError)
        assert [item.code for item in disconnected] == ["WORKER_DISCONNECTED"]
        # 断连后的请求：写路径同样类型化，不再是裸的 BrokenPipeError。
        with pytest.raises(WorkerError) as dead:
            client.request("browse", {"path": str(project)}, timeout=5)
        assert dead.value.code == "WORKER_DISCONNECTED"
        heartbeats = owner.heartbeats
        owner.stop()
        owner.close()
        owner.stop()  # 幂等
        assert owner.heartbeats == heartbeats
        assert owner.thread is None
        assert not lease_threads()
        assert client._pending == {}
    finally:
        owner.stop()
        client.close()
