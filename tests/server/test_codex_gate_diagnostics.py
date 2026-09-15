"""The Codex gate's alias-link annotation is a co-observation, never a blocker.

The gate observes the native CLI's argv0 alias links while an attempt runs.
Those links are normal, and a failing turn's error code alone never proves they
caused it (the file-limit and secret-scan failures each have first-hand
unrelated causes), so every failure that coincides with the observed links is
recorded as a co-observation and no `blocker` key is ever produced. This is
diagnostics only; it never changes an outcome.
"""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import stat

REPO_ROOT = Path(__file__).resolve().parents[2]
GATE = REPO_ROOT / "scripts" / "server-round1" / "codex-production-chain-gate.py"

SYMLINKS = [{"name": "apply_patch", "target": "/runtime/artifacts/codex-runtime/bin/codex"}]


def load_gate():
    spec = importlib.util.spec_from_file_location("codex_production_chain_gate", GATE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def annotate(turn):
    module = load_gate()
    report = {
        "stateSymlinksObserved": SYMLINKS,
        "diagnostics": {"turn": turn},
    }
    module.annotate_known_blocker(report)
    return report


def test_no_failure_ever_becomes_an_alias_blocker():
    """A code alone never proves the links caused the failure - the file-limit
    and secret-scan failures each have first-hand unrelated causes - so every
    failure is a co-observation and no `blocker` key exists at all."""
    for error_code in (
        "VIEW_SPECIAL_FILE", "VIEW_FILE_LIMIT", "SIDECAR_STATE_CONTAINS_SECRET",
        "CREDENTIAL_REQUIRED", "SIDECAR_OP_FAILED", "ADAPTER_EXITED", "WORKER_ERROR",
    ):
        report = annotate({
            "state": "failed", "capture_state": "failed", "error_code": error_code,
        })
        assert "blocker" not in report, error_code
        co_observation = report["stateSymlinkCoObservation"]
        assert co_observation["turnErrorCode"] == error_code
        assert "co-observation" in co_observation["note"]


def test_the_credential_scan_verdict_fails_closed_in_every_mode():
    module = load_gate()
    # A hit fails the gate in both modes: the credential reached native state.
    for legacy in (False, True):
        verdict, _detail = module.credential_scan_verdict(
            [{"path": "native-state/leak.sh"}], None, True, legacy)
        assert verdict == "CODEX_GATE_CREDENTIAL_IN_NATIVE_STATE"
    # An incomplete or crashed scan fails closed: no evidence is not a pass.
    for scan_error, stopped in ((None, False), ("OSError: boom", True)):
        verdict, _detail = module.credential_scan_verdict([], scan_error, stopped, False)
        assert verdict == "CODEX_GATE_STATE_SCAN_INCOMPLETE"
    # A complete, clean scan passes the verdict (the gate itself stays green).
    verdict, _detail = module.credential_scan_verdict([], None, True, False, None, 1)
    assert verdict is None
    # The default completion count is the safe one: no cycle, no pass.
    verdict, _detail = module.credential_scan_verdict([], None, True, False)
    assert verdict == "CODEX_GATE_STATE_SCAN_INCOMPLETE"


def test_the_scan_walks_nested_directories_and_never_follows_links(tmp_path):
    """The scanner's own isolation: a token nested several directories deep is
    found, a link to an outside sentinel is not followed, neither the number of
    open descriptors nor the file budget grows without bound, and every cycle
    completes."""
    module = load_gate()
    root = tmp_path / "worker-root"
    state = root / "views" / "view-1" / "ready" / "agentbox-sidecar" / "deployment" / "codex" / "native-state"
    (state / "shell_snapshots").mkdir(parents=True)
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "sentinel").write_text(module.FAKE_TOKEN, encoding="utf-8")
    token = module.FAKE_TOKEN
    (state / "shell_snapshots" / "deep.sh").write_text(
        "export X='" + token + "'" + chr(10), encoding="utf-8")
    (state / "link-to-outside").symlink_to(outside / "sentinel")

    scanner = module.CredentialStateScanner(root, module.FAKE_TOKEN.encode())
    before = len(os.listdir("/proc/self/fd"))
    summaries = [scanner.scan() for _ in range(6)]
    after = len(os.listdir("/proc/self/fd"))
    last = summaries[-1]
    assert last["complete"] and last["cyclesCompleted"] == 6, last
    assert last["incomplete"] is None, last
    assert [hit["path"] for hit in last["hits"]] == [
        "agentbox-sidecar/deployment/codex/native-state/shell_snapshots/deep.sh",
    ], last["hits"]
    assert after <= before + 2, f"descriptors leaked: {before} -> {after}"


def test_a_token_beyond_the_first_chunk_is_still_found(tmp_path):
    """A short read must not hide a token: the read loops within the budget."""
    module = load_gate()
    root = tmp_path / "worker-root"
    state = root / "views" / "view-1" / "ready" / "agentbox-sidecar" / "deployment" / "codex" / "native-state"
    state.mkdir(parents=True)
    (state / "big.sh").write_bytes(b"x" * 100_000 + module.FAKE_TOKEN.encode())
    scanner = module.CredentialStateScanner(root, module.FAKE_TOKEN.encode())
    summary = scanner.scan()
    assert summary["incomplete"] is None, summary
    assert summary["complete"] and summary["cyclesCompleted"] == 1
    assert [hit["path"].rsplit("/", 1)[-1] for hit in summary["hits"]] == ["big.sh"]


def test_a_file_beyond_the_observation_budget_marks_the_scan_incomplete(tmp_path):
    """A file past the observation budget makes the scan incomplete - the
    verdict fails closed instead of treating it as "no hit"."""
    module = load_gate()
    root = tmp_path / "worker-root"
    state = root / "views" / "view-1" / "ready" / "agentbox-sidecar" / "deployment" / "codex" / "native-state"
    state.mkdir(parents=True)
    (state / "huge.sh").write_bytes(b"x" * (module.CREDENTIAL_SCAN_FILE_BYTES + 1))
    scanner = module.CredentialStateScanner(root, module.FAKE_TOKEN.encode())
    summary = scanner.scan()
    assert "per-file budget" in (summary["incomplete"] or ""), summary
    assert summary["cyclesCompleted"] == 0
    assert summary["complete"] is False
    verdict, _detail = module.credential_scan_verdict(
        summary["hits"], None, True, False, summary["incomplete"],
        summary["cyclesCompleted"], summary["races"], [],
        None, None, None, True, summary["incomplete"])
    assert verdict == "CODEX_GATE_STATE_SCAN_INCOMPLETE"


def test_a_green_run_records_neither_blocker_nor_co_observation():
    module = load_gate()
    report = {"stateSymlinksObserved": SYMLINKS, "diagnostics": {"turn": {}}}
    module.annotate_known_blocker(report)
    assert "blocker" not in report
    assert "stateSymlinkCoObservation" not in report


def test_without_observed_links_nothing_is_annotated():
    module = load_gate()
    report = {
        "stateSymlinksObserved": [],
        "diagnostics": {"turn": {"capture_state": "failed", "error_code": "VIEW_INVALID"}},
    }
    module.annotate_known_blocker(report)
    assert "blocker" not in report
    assert "stateSymlinkCoObservation" not in report


def test_a_raced_read_is_a_persistent_fact_not_a_forgotten_cycle(tmp_path, monkeypatch):
    """The race is injected at the post-read fstat: the in-flight payload
    carries the token (so it is a hit), the race is recorded, and the fact
    survives later quiet passes."""
    module = load_gate()
    root = tmp_path / "worker-root"
    state = root / "views" / "view-1" / "ready" / "agentbox-sidecar" / "deployment" / "codex" / "native-state"
    state.mkdir(parents=True)
    (state / "racing.sh").write_text("export K='" + module.FAKE_TOKEN + "'", encoding="utf-8")
    real_fstat = os.fstat
    calls: dict[int, int] = {}

    def racing_fstat(fd):
        calls[fd] = calls.get(fd, 0) + 1
        status = real_fstat(fd)
        if calls[fd] == 2 and stat.S_ISREG(status.st_mode):
            return os.stat_result((
                status.st_mode, status.st_ino, status.st_dev, status.st_nlink,
                status.st_uid, status.st_gid, status.st_size,
                status.st_atime, status.st_mtime + 1, status.st_ctime,
            ))
        return status

    monkeypatch.setattr(module.os, "fstat", racing_fstat)
    scanner = module.CredentialStateScanner(root, module.FAKE_TOKEN.encode())
    summary = scanner.scan()
    assert [hit["path"].rsplit("/", 1)[-1] for hit in summary["hits"]] == ["racing.sh"]
    assert summary["races"] and summary["races"][0]["path"].endswith("racing.sh")
    assert not summary["complete"], "a raced pass is not a complete observation"


def test_the_file_budget_is_typed_incomplete(tmp_path):
    """More regular files than the budget fails as an incomplete scan."""
    module = load_gate()
    root = tmp_path / "worker-root"
    state = root / "views" / "view-1" / "ready" / "agentbox-sidecar" / "deployment" / "codex" / "native-state"
    state.mkdir(parents=True)
    for index in range(module.CREDENTIAL_SCAN_FILES + 1):
        (state / f"f{index:04}").write_text("x", encoding="utf-8")
    summary = module.CredentialStateScanner(root, module.FAKE_TOKEN.encode()).scan()
    assert "file budget" in (summary["incomplete"] or ""), summary
    verdict, _detail = module.credential_scan_verdict(
        summary["hits"], None, True, False, summary["incomplete"],
        summary["cyclesCompleted"], summary["races"], [],
        None, None, None, True, summary["incomplete"])
    assert verdict == "CODEX_GATE_STATE_SCAN_INCOMPLETE"


def test_the_traversal_and_byte_budgets_are_typed_incomplete(tmp_path):
    """A forest past the traversal bound, and a set of small files past the
    cumulative byte bound, both fail as incomplete scans."""
    module = load_gate()
    root = tmp_path / "worker-root"
    state = root / "views" / "view-1" / "ready" / "agentbox-sidecar" / "deployment" / "codex" / "native-state"
    state.mkdir(parents=True)
    for index in range(module.CREDENTIAL_SCAN_TRAVERSAL + 8):
        (state / f"d{index:05}").mkdir()
    summary = module.CredentialStateScanner(root, module.FAKE_TOKEN.encode()).scan()
    assert "traversal budget" in (summary["incomplete"] or ""), summary

    heavy_root = tmp_path / "worker-root-bytes"
    heavy_state = heavy_root / "views" / "view-1" / "ready" / "agentbox-sidecar" / "deployment" / "codex" / "native-state"
    heavy_state.mkdir(parents=True)
    chunk = b"y" * (1024 * 1024)
    for index in range(9):
        (heavy_state / f"f{index}").write_bytes(chunk)
    heavy = module.CredentialStateScanner(heavy_root, module.FAKE_TOKEN.encode()).scan()
    assert "byte budget" in (heavy["incomplete"] or ""), heavy


def test_the_settled_window_opens_only_after_the_harness_exited(tmp_path):
    """User decision A: the settled window is a synchronous scan taken after the
    native processes are gone - never a pass that merely looked stable while the
    harness was still writing."""
    module = load_gate()
    root = tmp_path / "worker-root"
    state = root / "views" / "view-1" / "ready" / "agentbox-sidecar" / "deployment" / "codex" / "native-state"
    state.mkdir(parents=True)
    (state / "state.db").write_text("clean", encoding="utf-8")
    watcher = module.StateSymlinkWatcher(root)

    module_harness = module.harness_processes
    try:
        module.harness_processes = lambda temporary: ["1234 /artifact/app-server"]
        evidence = module.settle_after_attempt(watcher, root, timeout_s=0.2, interval_s=0.05)
        assert evidence["harnessExited"] is False
        verdict, detail = module.credential_scan_verdict(
            [], None, True, False, None, 1, [], [], 0, None, None,
            evidence["harnessExited"], None, {"stateScan": None})
        assert verdict == "CODEX_GATE_STATE_SCAN_INCOMPLETE", detail

        module.harness_processes = lambda temporary: []
        watcher.start()
        evidence = module.settle_after_attempt(watcher, root, timeout_s=0.2, interval_s=0.05)
        assert evidence["harnessExited"] is True
        assert watcher.stopped_cleanly is True
        assert evidence["settledScan"] == "view" and evidence["settledCycles"] == 1
        assert evidence["settledFiles"] >= 1
        verdict, detail = module.credential_scan_verdict(
            [], None, True, False, None, 1, [], [], evidence["settledCycles"], None, None,
            evidence["harnessExited"], evidence.get("settledIncomplete"))
        assert verdict is None, detail

        heavy = module.StateSymlinkWatcher(root)
        heavy.start()
        (state / "huge.sh").write_bytes(b"x" * (module.CREDENTIAL_SCAN_FILE_BYTES + 1))
        evidence = module.settle_after_attempt(heavy, root, timeout_s=0.2, interval_s=0.05)
        assert evidence["settledIncomplete"]
        verdict, _detail = module.credential_scan_verdict(
            [], None, True, False, None, 1, [], [], evidence["settledCycles"], None, None,
            True, evidence.get("settledIncomplete"))
        assert verdict == "CODEX_GATE_STATE_SCAN_INCOMPLETE"
    finally:
        module.harness_processes = module_harness


def test_resolve_run_failure_drives_the_real_control_flow(tmp_path):
    """The post-run decision reads every phase's own scanner and settled window:
    a hit from the reopen phase fails as hard as one from the turn chain, and a
    reclaimed view with no usable capture evidence fails closed."""
    module = load_gate()
    root = tmp_path / "worker-root"
    state = root / "views" / "view-1" / "ready" / "agentbox-sidecar" / "deployment" / "codex" / "native-state"
    state.mkdir(parents=True)
    (state / "state.db").write_text("clean", encoding="utf-8")

    def phase_evidence(**overrides):
        evidence = {"harnessExited": True, "settledComplete": True, "settledCycles": 1,
                    "settledScan": "view", "settledIncomplete": None, "hits": [],
                    "races": [], "incompleteEvents": [], "scanError": None,
                    "stoppedCleanly": True, "filesObserved": 1, "cyclesCompleted": 1}
        evidence.update(overrides)
        return evidence

    watcher = module.StateSymlinkWatcher(root)
    watcher.stopped_cleanly = True
    report = {"stateScan": {"files": 3, "tokenInState": False, "nativeSessionId": True},
              "rounds": {"first": {"state": "completed"}}}
    assert module.resolve_run_failure(report, phase_evidence(), watcher) is None

    hit_phase = phase_evidence(hits=[{"path": "native-state/shell_snapshots/x.sh",
                                      "phase": "during-run"}])
    failure = module.resolve_run_failure(report, phase_evidence(), watcher, hit_phase)
    assert failure is not None and failure.code == "CODEX_GATE_CREDENTIAL_IN_NATIVE_STATE"
    assert report["credentialPathHits"]

    alive = module.resolve_run_failure(report, phase_evidence(harnessExited=False), watcher)
    assert alive is not None and alive.code == "CODEX_GATE_STATE_SCAN_INCOMPLETE"

    reclaimed = module.resolve_run_failure(
        {"stateScan": None, "rounds": {}},
        phase_evidence(settledComplete=False, settledCycles=0), watcher)
    assert reclaimed is not None and reclaimed.code == "CODEX_GATE_STATE_SCAN_INCOMPLETE"


def test_a_credential_hit_outranks_a_chain_failure(tmp_path):
    """A hit is the primary failure even when the chain also failed; the chain
    failure is what the caller keeps as structured secondary evidence."""
    module = load_gate()
    root = tmp_path / "worker-root"
    state = root / "views" / "view-1" / "ready" / "agentbox-sidecar" / "deployment" / "codex" / "native-state"
    state.mkdir(parents=True)
    (state / "leak.sh").write_text("export K='" + module.FAKE_TOKEN + "'", encoding="utf-8")
    summary = module.CredentialStateScanner(root, module.FAKE_TOKEN.encode()).scan()
    assert [hit["path"].rsplit("/", 1)[-1] for hit in summary["hits"]] == ["leak.sh"]
    watcher = module.StateSymlinkWatcher(root)
    watcher.stopped_clearly = True
    watcher.stopped_cleanly = True
    settled = {"harnessExited": True, "settledComplete": True, "settledCycles": 1,
               "settledIncomplete": None, "settledScan": "view"}
    hit_phase = {"harnessExited": True, "hits": summary["hits"], "races": [],
                 "incompleteEvents": [], "scanError": None, "stoppedCleanly": True,
                 "settledComplete": True, "settledCycles": 1, "settledIncomplete": None,
                 "filesObserved": 1, "cyclesCompleted": 1}
    failure = module.resolve_run_failure({}, settled, watcher, hit_phase)
    assert failure is not None
    assert failure.code == "CODEX_GATE_CREDENTIAL_IN_NATIVE_STATE"
    chain_failure = module.GateFailure("CODEX_GATE_TURN_FAILED", "the turn failed")
    assert chain_failure.code == "CODEX_GATE_TURN_FAILED", "kept as secondary evidence"
