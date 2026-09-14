"""OpenCode 全链门的清理与失败语义门。

门先跑一条真链路，然后必须把本次运行创建的一切收干净（包括只读投影、托管 host、
临时假 token、Worker view/secret）。"报告成功但临时根还在"正是这些测试要防的假绿：
每个清理结论都对着文件系统断言，而不是只看报告。

同时断言失败语义：清理失败必须非零退出、且不得覆盖真正的主失败。
"""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile

import pytest


GATE = (Path(__file__).resolve().parents[2] / "scripts" / "server-round1"
        / "opencode-production-chain-gate.py")
WORKER = (Path(__file__).resolve().parents[2] / "workers" / "agent-box-worker"
          / ".acceptance-bundle-c4" / "agent-box-worker")


def load_gate():
    spec = importlib.util.spec_from_file_location("opencode_gate_under_test", GATE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def gate(monkeypatch):
    module = load_gate()
    saved = dict(module.REPORT)
    yield module
    module.REPORT.clear()
    module.REPORT.update(saved)


def temporary_roots():
    """当前磁盘上所有本次门的临时根（按名字）。"""
    return {path.name for path in Path(tempfile.gettempdir()).glob("agentbox-opencode-gate-*")}


def stub_gate(gate, monkeypatch, *, failure=None, chain_audit=True, retry_attempts=6):
    """替换掉昂贵部分，保留门自己的流程与清理语义。"""
    binary = Path("/home/maoqh/.npm-global/lib/node_modules/opencode-ai/bin/opencode.exe")

    def authorize_binary(requested, report):
        report["binary"] = {"source": str(binary), "digest": "sha256:" + "a" * 64,
                            "sizeBytes": 1, "version": "1.18.21", "entry": str(binary),
                            "external": requested is not None}
        return {"source": str(binary), "digest": "sha256:" + "a" * 64,
                "sizeBytes": 1, "version": "1.18.21", "entry": str(binary)}

    def compile_guard(temporary, report):
        guard = temporary / "opencode-egress-guard.so"
        guard.write_bytes(b"\x7fELFstub")
        report["egressGuard"] = {"compiledAt": str(guard), "sha256": "sha256:stub"}
        return guard

    def run_chain(temporary, workspace, worker, authorization, endpoint, production, token_path, guard):
        if failure is not None:
            raise gate.GateFailure(*failure)
        if chain_audit:
            (workspace / gate.AUDIT_NAME).write_text(
                "guard-loaded pid=1\n", encoding="utf-8")
        return {
            "rounds": {"first": {"state": "completed", "deltaSeq": [1, 2], "completedSeq": 3},
                       "second": {"state": "completed", "deltaSeq": [4], "completedSeq": 5}},
            "driverAuditServerPath": {"opens": [{"created": False}]},
        }

    monkeypatch.setattr(gate, "authorize_binary", authorize_binary)
    monkeypatch.setattr(gate, "compile_guard", compile_guard)
    monkeypatch.setattr(gate, "run_chain", run_chain)
    monkeypatch.setattr(gate, "observe_driver", lambda *arguments: {
        "roundA": {}, "roundB": {}, "driverAudit": {"hostPorts": []},
        "retryExperiment": {"providerAttempts": 3, "attemptSeconds": [1.0, 3.0, 8.0],
                            "cappedInHorizon": False},
        "retryObservation": {"providerAttempts": retry_attempts, "attemptSeconds": [1.0, 3.0, 8.0],
                             "cappedInHorizon": retry_attempts < 6},
    })
    monkeypatch.setattr(gate, "driver_negatives", lambda *arguments: {"refused": True})
    monkeypatch.setattr(gate, "guest_probes", lambda *arguments: {"version": "1.18.21",
                                                                  "runtimeBinWritable": False,
                                                                  "workspaceWritable": True,
                                                                  "egress": {"remote": "EACCES",
                                                                             "loopback": "ECONNREFUSED"}})
    monkeypatch.setattr(gate, "authorization_negatives", lambda *arguments: {"digestDrift": "OPENCODE_DIGEST_DRIFT"})
    monkeypatch.setattr(gate, "worker_digest_refusal", lambda *arguments: {"refused": True})


def run_gate(gate, monkeypatch, capsys, *arguments):
    monkeypatch.setattr(sys, "argv", ["opencode-production-chain-gate.py", *arguments])
    code = gate.main()
    captured = capsys.readouterr()
    return code, json.loads(captured.out)


def assert_temporary_root_gone(report):
    path = Path(report["run"]["temporary"])
    assert report["run"]["removed"] is True, report["run"]
    assert not path.exists(), f"{path} survived a successful run"
    assert not any(
        child.name == path.name for child in Path(tempfile.gettempdir()).glob("agentbox-opencode-gate-*")
    ), "a gate temporary root is still on disk"


def test_default_run_removes_everything_it_created(gate, monkeypatch, capsys):
    stub_gate(gate, monkeypatch)
    before = temporary_roots()
    code, report = run_gate(gate, monkeypatch, capsys, "--worker", str(WORKER), "--json")
    assert code == 0, report
    assert report["result"] == "OPENCODE_PRODUCTION_CHAIN_PREPARED"
    assert_temporary_root_gone(report)
    assert report["cleanup"]["madeWritable"] > 0, "the read-only projections had to be made writable"
    assert temporary_roots() - before == set(), "cleanup left a new temporary root behind"
    assert report["cleanup"]["fakeTokenRemoved"] is True
    assert report["cleanup"]["tokenInTrackedGitContent"] is False


def test_keep_retains_the_tree_and_never_claims_removal(gate, monkeypatch, capsys):
    stub_gate(gate, monkeypatch)
    code, report = run_gate(gate, monkeypatch, capsys, "--worker", str(WORKER), "--keep", "--json")
    try:
        assert code == 0, report
        kept = Path(report["kept"])
        assert report["run"]["removed"] is False, report["run"]
        assert report["run"]["kept"] == str(kept)
        assert kept.is_dir(), "--keep must retain the tree it reports"
    finally:
        if "kept" in report and Path(report["kept"]).exists():
            os.chmod(report["kept"], 0o700)
            gate.cleanup_root(Path(report["kept"]), created=Path(report["kept"]))
    assert not Path(report["kept"]).exists()


def test_an_external_binary_is_neither_deleted_nor_chmodded(gate, monkeypatch, capsys, tmp_path):
    stub_gate(gate, monkeypatch)
    external = tmp_path / "opencode-copy"
    external.write_bytes(b"\x7fELF" + b"\x00" * 64)
    external.chmod(0o755)
    before = (external.stat().st_size, stat.S_IMODE(external.stat().st_mode))
    expected_digest = gate.digest_of(external.read_bytes())

    def authorize_binary(requested, report):
        declaration = {"source": str(external), "digest": expected_digest, "sizeBytes": before[0],
                       "version": "1.18.21", "entry": str(external)}
        report["binary"] = {**declaration, "external": True}
        return declaration

    monkeypatch.setattr(gate, "authorize_binary", authorize_binary)
    code, report = run_gate(gate, monkeypatch, capsys,
                            "--worker", str(WORKER), "--binary", str(external), "--json")
    assert code == 0, report
    assert report["binary"]["external"] is True
    assert report["binary"]["preservedAfterCleanup"] is True
    assert external.is_file(), "the caller's binary must survive cleanup"
    assert (external.stat().st_size, stat.S_IMODE(external.stat().st_mode)) == before
    assert report["binary"]["digestAfterCleanup"] == expected_digest
    assert_temporary_root_gone(report)


def test_an_external_binary_inside_the_temporary_root_is_refused(gate, tmp_path):
    temporary = tmp_path / "agentbox-opencode-gate-owned"
    (temporary / "bin").mkdir(parents=True)
    inside = temporary / "bin" / "opencode"
    inside.write_bytes(b"\x7fELF")
    with pytest.raises(gate.GateFailure) as refused:
        gate.assert_external_binary_separate(inside, temporary)
    assert refused.value.code == "OPENCODE_GATE_BINARY_INSIDE_TEMPORARY_ROOT"
    assert inside.is_file(), "the refusal must not touch the path"
    gate.assert_external_binary_separate(tmp_path / "elsewhere", temporary)


def test_a_binary_that_changed_during_the_run_fails_the_gate(gate, monkeypatch, capsys, tmp_path):
    stub_gate(gate, monkeypatch)
    external = tmp_path / "opencode-copy"
    external.write_bytes(b"\x7fELF" + b"\x00" * 64)

    def authorize_binary(requested, report):
        declaration = {"source": str(external), "digest": "sha256:" + "c" * 64, "sizeBytes": 4,
                       "version": "1.18.21", "entry": str(external)}
        report["binary"] = {**declaration, "external": True}
        return declaration

    monkeypatch.setattr(gate, "authorize_binary", authorize_binary)
    code, report = run_gate(gate, monkeypatch, capsys,
                            "--worker", str(WORKER), "--binary", str(external), "--json")
    assert code == 1, report
    assert report["code"] == "OPENCODE_GATE_EXTERNAL_BINARY_DAMAGED", report


@pytest.mark.parametrize("case", ["different_path", "symlink", "world_accessible", "wrong_prefix", "a_file"])
def test_cleanup_refuses_a_path_it_did_not_create(gate, tmp_path, case):
    created = Path(tempfile.mkdtemp(prefix=gate.TEMPORARY_PREFIX))
    user_directory = tmp_path / "user-data"
    user_directory.mkdir()
    (user_directory / "keep-me").write_text("mine", encoding="utf-8")
    try:
        if case == "different_path":
            with pytest.raises(gate.GateFailure) as refused:
                gate.cleanup_root(user_directory, created=created)
            assert refused.value.code == "OPENCODE_GATE_CLEANUP_NOT_OWNED"
            assert (user_directory / "keep-me").read_text(encoding="utf-8") == "mine"
        elif case == "symlink":
            link = Path(tempfile.gettempdir()) / f"{gate.TEMPORARY_PREFIX}link"
            link.unlink(missing_ok=True)
            link.symlink_to(user_directory)
            try:
                with pytest.raises(gate.GateFailure) as refused:
                    gate.cleanup_root(link, created=link)
                assert refused.value.code == "OPENCODE_GATE_CLEANUP_NOT_OWNED"
                assert link.is_symlink()
            finally:
                link.unlink(missing_ok=True)
        elif case == "world_accessible":
            os.chmod(created, 0o755)
            with pytest.raises(gate.GateFailure) as refused:
                gate.cleanup_root(created, created=created)
            assert refused.value.code == "OPENCODE_GATE_CLEANUP_NOT_OWNED"
            assert created.exists()
        elif case == "wrong_prefix":
            other = Path(tempfile.mkdtemp(prefix="not-our-prefix-"))
            try:
                with pytest.raises(gate.GateFailure) as refused:
                    gate.cleanup_root(other, created=other)
                assert refused.value.code == "OPENCODE_GATE_CLEANUP_NOT_OWNED"
                assert other.exists()
            finally:
                shutil.rmtree(other)
        else:
            a_file = tmp_path / "a-file"
            a_file.write_text("x", encoding="utf-8")
            with pytest.raises(gate.GateFailure) as refused:
                gate.cleanup_root(a_file, created=a_file)
            assert refused.value.code == "OPENCODE_GATE_CLEANUP_NOT_OWNED"
            assert a_file.is_file()
    finally:
        if created.exists():
            os.chmod(created, 0o700)
            gate.cleanup_root(created, created=created)


def test_an_injected_removal_failure_exits_nonzero(gate, monkeypatch, capsys):
    stub_gate(gate, monkeypatch)

    def broken_rmtree(*_arguments, **_keywords):
        raise OSError("injected removal failure")

    monkeypatch.setattr(gate.shutil, "rmtree", broken_rmtree)
    code, report = run_gate(gate, monkeypatch, capsys, "--worker", str(WORKER), "--json")
    leftover = Path(report["run"]["temporary"])
    try:
        assert code == 1, report
        assert report["result"] == "OPENCODE_PRODUCTION_CHAIN_GATE_FAILED"
        assert report["code"] == "OPENCODE_GATE_CLEANUP_FAILED", report
        assert report["run"]["removed"] is False, report["run"]
        assert leftover.exists()
    finally:
        monkeypatch.undo()
        if leftover.exists():
            gate.remove_tree(leftover)
    assert not leftover.exists()


def test_a_primary_failure_is_not_masked_by_a_cleanup_failure(gate, monkeypatch, capsys):
    stub_gate(gate, monkeypatch, failure=("OPENCODE_GATE_STUB_PRIMARY", "the stub chain failed first"))

    def broken_rmtree(*_arguments, **_keywords):
        raise OSError("injected removal failure")

    monkeypatch.setattr(gate.shutil, "rmtree", broken_rmtree)
    code, report = run_gate(gate, monkeypatch, capsys, "--worker", str(WORKER), "--json")
    leftover = Path(report["run"]["temporary"])
    try:
        assert code == 1, report
        assert report["code"] == "OPENCODE_GATE_STUB_PRIMARY", report
        assert report["error"] == "the stub chain failed first"
        assert report["cleanupFailure"]["code"] == "OPENCODE_GATE_CLEANUP_FAILED"
        # 主失败自己的证据仍然在报告里。
        assert report["template"]["officialBaseUrl"] == "https://api.deepseek.com"
        assert report["run"]["removed"] is False
    finally:
        monkeypatch.undo()
        if leftover.exists():
            gate.remove_tree(leftover)


def test_a_cleanup_failure_alone_is_the_primary_failure(gate, monkeypatch, capsys):
    """主链成功但清理失败：退出码必须非零，原因就是清理。"""
    stub_gate(gate, monkeypatch)

    def broken_rmtree(*_arguments, **_keywords):
        raise OSError("injected removal failure")

    monkeypatch.setattr(gate.shutil, "rmtree", broken_rmtree)
    code, report = run_gate(gate, monkeypatch, capsys, "--worker", str(WORKER), "--json")
    leftover = Path(report["run"]["temporary"])
    try:
        assert code == 1
        assert report["code"] == "OPENCODE_GATE_CLEANUP_FAILED"
        assert report["result"] == "OPENCODE_PRODUCTION_CHAIN_GATE_FAILED"
    finally:
        monkeypatch.undo()
        if leftover.exists():
            gate.remove_tree(leftover)


def test_the_retry_bound_is_enforced_by_the_gate(gate, monkeypatch, capsys):
    """超过实测上界（6）的尝试次数必须让门失败。"""
    stub_gate(gate, monkeypatch, retry_attempts=7)
    code, report = run_gate(gate, monkeypatch, capsys, "--worker", str(WORKER), "--json")
    assert code == 1, report
    assert report["code"] == "OPENCODE_GATE_RETRY_BOUND_VIOLATED"


def test_the_gate_never_swallows_a_removal_failure_in_source():
    """任何清理路径都不得用 ignore_errors 藏失败，也不得把观测断言降级。"""
    source = GATE.read_text(encoding="utf-8")
    assert "ignore_errors" not in source
    assert "assert_owned_root" in source and "TEMPORARY_PREFIX" in source
    # 相位隔离与"重开必须命中存储"的断言仍然在源码里（不得被换成"任意一条即可"）。
    assert "DRIVER_AUDIT_OBSERVE" in source and "DRIVER_AUDIT_NEGATIVE" in source
    assert "OPENCODE_GATE_REOPEN_NOT_BY_STORAGE" in source
    assert "OPENCODE_GATE_STALE_SESSION_ACCEPTED" in source


# --------------------------------------------------------------------------
# 提交态回归：假 token 每次运行现生成，被扫描的永远是本次那个值
# --------------------------------------------------------------------------

#: 受扫描的 tracked fixture 路径（测试期间临时登记为 tracked，结束时完整撤销）。
TOKEN_PROBE = (Path(__file__).resolve().parents[2] / "tests" / "server" / "fixtures"
               / ".opencode-gate-token-probe")


def frozen_token(module, monkeypatch, digit: str) -> str:
    """把本次运行的 token_hex 固定下来，好让测试知道被扫描的确切值。

    完整值只在运行期拼出来（前缀来自源码、后缀由测试计算），所以任何 tracked 文件里
    都不存在这个字符串——这正是"扫描的是本次实际生成值"的前提。
    """
    monkeypatch.setattr(module.secrets, "token_hex", lambda length: digit * (2 * length))
    return module.TOKEN_PREFIX + digit * 32


def restore_probe(repo: Path, probe: Path) -> None:
    """把临时登记的 fixture 从 index 与工作树里完整撤销。"""
    subprocess.run(["git", "-C", str(repo), "reset", "-q", "--", str(probe)],
                   check=False, capture_output=True, text=True, timeout=120)
    probe.unlink(missing_ok=True)


def test_the_dynamic_token_is_not_tracked_content(gate, monkeypatch, capsys):
    """提交态下，本次运行的假 token 不得出现在 tracked 内容里。

    门源码自己就在被扫描的树里：固定 token 会命中自己（这正是返修前提交后必红的
    原因）。这里冻结生成值跑完整流程，再对**运行期实际生成的那个值**做 git 扫描。
    """
    token = frozen_token(gate, monkeypatch, "a")
    restore_probe(gate.REPO, TOKEN_PROBE)
    with pytest.raises(RuntimeError) as outside:
        gate.current_token()
    assert "OPENCODE_GATE_NO_ACTIVE_RUN" in str(outside.value), (
        "运行窗口之外不得有可用的假 token")
    assert gate.token_appears_in_tracked_content(gate.REPO, token) is False

    stub_gate(gate, monkeypatch)
    code, report = run_gate(gate, monkeypatch, capsys, "--worker", str(WORKER), "--json")
    assert code == 0, report
    assert report["cleanup"]["tokenInTrackedGitContent"] is False
    assert gate.token_appears_in_tracked_content(gate.REPO, token) is False, (
        "本次运行的假 token 出现在 tracked 内容里")
    # 生成值不打印：门的输出里不得出现 token 本体。
    assert token not in json.dumps(report)
    # 运行窗口关闭后，token 不可再被取用。
    with pytest.raises(RuntimeError):
        gate.current_token()


def test_each_run_generates_its_own_token(gate, monkeypatch, capsys):
    """两次运行必须是两个不同的假 token（不是固定值换皮）。"""
    seen: list[str] = []
    real_scan = gate.token_appears_in_tracked_content

    def recording_scan(root, value):
        seen.append(value)
        return real_scan(root, value)

    monkeypatch.setattr(gate, "token_appears_in_tracked_content", recording_scan)
    stub_gate(gate, monkeypatch)
    for _ in range(2):
        code, report = run_gate(gate, monkeypatch, capsys, "--worker", str(WORKER), "--json")
        assert code == 0, report
    assert len(seen) == 2
    assert seen[0] != seen[1], "两次运行复用了同一个假 token"
    for value in seen:
        assert value.startswith(gate.TOKEN_PREFIX)
        assert len(value) == len(gate.TOKEN_PREFIX) + 32
        assert value not in GATE.read_text(encoding="utf-8"), "token 本体不得写回源码"


def test_a_token_that_reaches_tracked_content_fails_the_gate(gate, monkeypatch, capsys):
    """反证：本次 token 一旦进入受扫描的 tracked fixture，门必须以类型化错误失败。

    fixture 只在本测试期间被登记为 tracked（intent-to-add），结束时连同 index 条目
    一起撤销，工作树不留任何修改。
    """
    token = frozen_token(gate, monkeypatch, "b")
    restore_probe(gate.REPO, TOKEN_PROBE)
    TOKEN_PROBE.write_text(f"{token}\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(gate.REPO), "add", "-N", "--", str(TOKEN_PROBE)],
                   check=True, capture_output=True, text=True, timeout=120)
    try:
        assert gate.token_appears_in_tracked_content(gate.REPO, token) is True, (
            "被登记为 tracked 的 fixture 没有被扫描到，反证失去意义")
        stub_gate(gate, monkeypatch)
        code, report = run_gate(gate, monkeypatch, capsys, "--worker", str(WORKER), "--json")
        assert code == 1, report
        assert report["code"] == "OPENCODE_GATE_TOKEN_IN_GIT", report
        assert report["cleanup"]["tokenInTrackedGitContent"] is True
    finally:
        restore_probe(gate.REPO, TOKEN_PROBE)
    # 完整恢复：路径不存在、index 无条目、扫描重新归零。
    assert not TOKEN_PROBE.exists()
    status = subprocess.run(
        ["git", "-C", str(gate.REPO), "status", "--porcelain", "--", str(TOKEN_PROBE)],
        capture_output=True, text=True, timeout=120,
    ).stdout.strip()
    assert status == "", f"the token probe left tracked state behind: {status!r}"
    assert gate.token_appears_in_tracked_content(gate.REPO, token) is False
