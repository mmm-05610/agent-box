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

REPO_ROOT = Path(__file__).resolve().parents[3]
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

    module_harness = module.matching_processes
    try:
        module.matching_processes = lambda temporary, rows=None: [
            {"pid": 4242, "started": "Mon Sep 15 10:00:00 2026",
             "args": f"/usr/bin/bwrap {root}/app-server"}]
        watcher.harness_identities = [(4242, "Mon Sep 15 10:00:00 2026")]
        evidence = module.settle_after_attempt(watcher, root, timeout_s=0.2, interval_s=0.05)
        assert evidence["harnessExited"] is False
        verdict, detail = module.credential_scan_verdict(
            [], None, True, False, None, 1, [], [], 0, None, None,
            evidence["harnessExited"], None, {"stateScan": None})
        assert verdict == "CODEX_GATE_STATE_SCAN_INCOMPLETE", detail

        module.matching_processes = lambda temporary, rows=None: []
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
        module.matching_processes = module_harness


def test_resolve_run_failure_drives_the_real_control_flow(tmp_path):
    """The post-run decision reads every phase's own scanner, settled scan and
    capture evidence: a hit from the reopen phase fails as hard as one from the
    turn chain, and a phase with neither a settled view nor capture evidence
    fails closed - whatever the other phase did."""
    module = load_gate()
    root = tmp_path / "worker-root"
    state = root / "views" / "view-1" / "ready" / "agentbox-sidecar" / "deployment" / "codex" / "native-state"
    state.mkdir(parents=True)
    (state / "state.db").write_text("clean", encoding="utf-8")

    def phase(name: str, **overrides) -> dict:
        evidence = {"phase": name, "harnessExited": True, "settledComplete": True,
                    "settledCycles": 1, "settledScan": "view", "settledIncomplete": None,
                    "hits": [], "races": [], "incompleteEvents": [], "scanError": None,
                    "stoppedCleanly": True, "filesObserved": 1, "cyclesCompleted": 1,
                    "captureEvidence": None}
        evidence.update(overrides)
        return evidence

    # Both phases settled in a view: clean.
    assert module.resolve_run_failure({}, [phase("turn-chain"), phase("reopen")]) is None

    # A phase with no settled view but its own capture evidence: clean.
    capture = {"files": 3, "bytes": 10, "tokenHits": [], "nativeSessionId": True}
    assert module.resolve_run_failure(
        {}, [phase("turn-chain", settledComplete=False, settledCycles=0,
                   captureEvidence=capture), phase("reopen")]) is None

    # A phase with neither: incomplete, even though the other phase settled.
    failure = module.resolve_run_failure(
        {}, [phase("turn-chain", settledComplete=False, settledCycles=0),
             phase("reopen")])
    assert failure is not None and failure.code == "CODEX_GATE_STATE_SCAN_INCOMPLETE"

    # A hit from the reopen phase (active or settled) is the primary failure.
    hit_phase = phase("reopen", hits=[{"path": "native-state/shell_snapshots/x.sh",
                                       "phase": "settled"}])
    report: dict = {}
    failure = module.resolve_run_failure(report, [phase("turn-chain"), hit_phase])
    assert failure is not None and failure.code == "CODEX_GATE_CREDENTIAL_IN_NATIVE_STATE"
    assert report["credentialPathHits"]

    # The harness still alive in any phase fails closed.
    alive = module.resolve_run_failure({}, [phase("turn-chain", harnessExited=False)])
    assert alive is not None and alive.code == "CODEX_GATE_STATE_SCAN_INCOMPLETE"


def test_the_reopen_capture_evidence_is_bound_and_scanned():
    """The reopen phase's evidence is its own captured bytes, scanned for the
    injected token and bound to the native id it reopened."""
    module = load_gate()
    ok, reason = module.capture_evidence_for_phase({
        "phase": "reopen",
        "captureEvidence": {"files": 2, "bytes": 4, "tokenHits": [],
                            "nativeSessionId": True},
    })
    assert ok and not reason
    bad, reason = module.capture_evidence_for_phase({
        "phase": "reopen",
        "captureEvidence": {"files": 2, "bytes": 4, "tokenHits": ["state.db"],
                            "nativeSessionId": True},
    })
    assert not bad and "credential" in reason
    unbound, reason = module.capture_evidence_for_phase({
        "phase": "reopen",
        "captureEvidence": {"files": 2, "bytes": 4, "tokenHits": [],
                            "nativeSessionId": False},
    })
    assert not unbound and "bound" in reason
    missing, reason = module.capture_evidence_for_phase({"phase": "reopen"})
    assert not missing and "capture evidence" in reason


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
    watcher.stopped_cleanly = True
    # What the observer would have accumulated from its own scanner:
    watcher.token_hits = list(summary["hits"])
    settled = {"harnessExited": True, "settledComplete": True, "settledCycles": 1,
               "settledIncomplete": None, "settledScan": "view"}
    phase = module.normalize_phase("turn-chain", settled, watcher)
    phase["failure"] = module.GateFailure("CODEX_GATE_TURN_FAILED", "the turn failed")
    failure = module.resolve_run_failure({}, [phase])
    assert failure is not None
    assert failure.code == "CODEX_GATE_CREDENTIAL_IN_NATIVE_STATE"
    assert phase["failure"].code == "CODEX_GATE_TURN_FAILED", "kept as secondary evidence"


def test_process_identity_binds_this_run_only(tmp_path):
    """The window waits for *this run's* processes by (pid, start time) and root:
    an unrelated Codex instance never blocks it, a renamed descendant of this
    run still does, and a reused pid with a new start time is not the old one."""
    module = load_gate()
    root = tmp_path / "worker-root"
    root.mkdir(parents=True)
    mine = {"pid": 4242, "ppid": 1, "started": "Mon Sep 15 10:00:00 2026",
            "args": f"/usr/bin/bwrap --die-with-parent /runtime/entry.mjs {root}/views/view-1"}
    # A real descendant: its own argv never names this run's root.
    descendant = {"pid": 4243, "ppid": 4242, "started": "Mon Sep 15 10:00:01 2026",
                  "args": "/runtime/artifacts/codex-runtime/bin/codex app-server"}
    elsewhere = {"pid": 99, "ppid": 1, "started": "Mon Sep 15 09:00:00 2026",
                 "args": "/usr/bin/bwrap /other/tmp/agentbox-codex-gate-other/app-server"}

    matched = module.matching_processes(root, [mine, descendant, elsewhere])
    assert {row["pid"] for row in matched} == {4242, 4243}, matched
    assert 99 not in {row["pid"] for row in matched}, "an unrelated instance must not block"

    # Seen alive and still in the table: a survivor (and the pid-reuse case is
    # a different start time, so it is not counted as the old process).
    monkey_ok = module.matching_processes(root, [mine, descendant])
    assert sorted(row["pid"] for row in monkey_ok) == [4242, 4243], "the descendant belongs to this run"
    assert module._surviving_identities.__module__ == module.__name__
    # No process carries this root any more: nothing survives.
    assert module._surviving_identities(root, []) == []


def test_a_settled_only_hit_is_a_hit_for_the_turn_chain_too(tmp_path):
    """The merge is shared: a credential only the settled scan saw counts for the
    turn chain exactly as it does for the reopen phase."""
    module = load_gate()
    root = tmp_path / "worker-root"
    root.mkdir(parents=True)
    watcher = module.StateSymlinkWatcher(root)
    watcher.stopped_cleanly = True
    settled = {"harnessExited": True, "settledComplete": True, "settledCycles": 1,
               "settledScan": "view", "settledIncomplete": None,
               "settledHits": ["native-state/shell_snapshots/late.sh"]}
    phase = module.turn_chain_phase({}, module.normalize_phase("turn-chain", settled, watcher))
    assert [hit["source"] for hit in phase["hits"]] == ["settled"]
    failure = module.resolve_run_failure({}, [phase])
    assert failure is not None and failure.code == "CODEX_GATE_CREDENTIAL_IN_NATIVE_STATE"


def test_a_capture_hit_is_a_credential_hit_not_an_incomplete_scan(tmp_path):
    """A token found in the captured bytes is the primary failure; completeness
    is a separate question."""
    module = load_gate()
    root = tmp_path / "worker-root"
    root.mkdir(parents=True)
    watcher = module.StateSymlinkWatcher(root)
    watcher.stopped_cleanly = True
    settled = {"harnessExited": True, "settledComplete": False, "settledCycles": 0,
               "settledScan": "capture-boundary", "settledIncomplete": None}
    capture = {"files": 3, "bytes": 10, "nativeSessionId": True,
               "tokenHits": ["state.db"]}
    phase = module.normalize_phase("turn-chain", settled, watcher, capture)
    assert [hit["source"] for hit in phase["hits"]] == ["capture"]
    failure = module.resolve_run_failure({}, [phase])
    assert failure is not None and failure.code == "CODEX_GATE_CREDENTIAL_IN_NATIVE_STATE"


def test_an_unrelated_process_and_a_renamed_descendant_are_distinguished(tmp_path):
    """The exit poll is the union of what was seen and what is in the table now:
    an empty 'seen' list never looks like an exit, an unrelated instance never
    blocks, and a renamed descendant of this run still does."""
    module = load_gate()
    root = tmp_path / "worker-root"
    root.mkdir(parents=True)
    unrelated = {"pid": 7, "ppid": 1, "started": "t0", "args": "/tmp/other-run/app-server"}
    mine = {"pid": 8, "ppid": 1, "started": "t1", "args": f"renamed-binary --root {root}"}
    table = [unrelated, mine]
    module_original = module.process_table
    try:
        module.process_table = lambda: list(table)
        # Nothing seen yet, but this run's process is in the table: not exited.
        assert module._surviving_identities(root, []) == ["8@t1"]
        # Only the unrelated instance is left: nothing of this run survives, and
        # the unrelated pid is never counted even though it was passed in.
        table = [unrelated]
        assert module._surviving_identities(root, [(7, "t0")]) == []
        # A renamed descendant of this run still blocks even after being seen.
        table = [unrelated, mine]
        assert module._surviving_identities(root, [(8, "t1")]) == ["8@t1"]
    finally:
        module.process_table = module_original


def test_a_capture_credential_failure_is_promoted_to_a_hit(tmp_path):
    """A phase whose *failure* is a credential rejection (by code, never by
    message) is a credential hit, so the primary failure is the credential and
    not an incomplete scan."""
    module = load_gate()
    root = tmp_path / "worker-root"
    root.mkdir(parents=True)
    watcher = module.StateSymlinkWatcher(root)
    watcher.stopped_cleanly = True
    settled = {"harnessExited": True, "settledComplete": True, "settledCycles": 1,
               "settledScan": "view", "settledIncomplete": None}
    for code in ("CODEX_GATE_TOKEN_IN_STATE", "SIDECAR_STATE_CONTAINS_SECRET"):
        phase = module.normalize_phase(
            "turn-chain", settled, watcher, None, module.GateFailure(code, "captured state"))
        assert [hit["source"] for hit in phase["hits"]] == [f"failure:{code}"]
        failure = module.resolve_run_failure({}, [phase])
        assert failure is not None
        assert failure.code == "CODEX_GATE_CREDENTIAL_IN_NATIVE_STATE", code


def test_the_capture_scan_reports_hits_instead_of_escaping(tmp_path):
    """scan_state returns structured token hits; the single verdict entry point
    turns them into the credential failure."""
    module = load_gate()
    root = tmp_path / "worker-root"
    (root / "views").mkdir(parents=True)

    class Objects:
        def __init__(self, payloads):
            self.payloads = payloads

        def read(self, digest):
            return self.payloads[digest]

    class Runtime:
        def __init__(self, payloads):
            self.objects = Objects(payloads)

    checkpoint = {"schema_version": 3, "nativeSessionId": "native-1",
                  "audited": {"files": 2, "bytes": 40, "truncated":
                              {"entries": 0, "bytes": 0, "oversize": 0}},
                  "files": [{"path": "state.db", "digest": "d1", "size": 6},
                            {"path": "leak.sh", "digest": "d2", "size": 34}]}
    payloads = {"c1": __import__("json").dumps(checkpoint).encode(),
                "d1": b"clean\n", "d2": b"export K='" + module.FAKE_TOKEN.encode() + b"'"}
    scan = module.scan_state(Runtime(payloads), {"checkpoint": {"object_digest": "c1"}}, "native-1")
    # The manifest-level scan reports the audit's facts; the leak itself is
    # caught during the turn by the audit's fail-closed credential scan (a hit
    # fails the turn typed and deletes the file), so a completed turn's scan
    # reads clean with the audit record attached.
    assert scan["tokenHits"] == [] and scan["tokenInState"] is False
    assert scan["files"] == 2 and scan["nativeSessionId"] is True


def test_both_phase_failures_are_kept_in_order():
    """When both phases fail, every independent failure is preserved in order.

    The list is produced by the gate's own collector, not rebuilt inside the
    test: an earlier version of this test compared its own literal to itself and
    could never fail, which is precisely the kind of test that certifies nothing.
    """
    module = load_gate()
    phases = [
        {"phase": "turn-chain", "hits": [], "races": [], "incompleteEvents": [],
         "scanError": None, "stoppedCleanly": True, "settledComplete": True,
         "settledCycles": 1, "harnessExited": True, "captureEvidence": None,
         "failure": module.GateFailure("CODEX_GATE_TURN_FAILED", "turn")},
        {"phase": "reopen", "hits": [], "races": [], "incompleteEvents": [],
         "scanError": "ps failed", "stoppedCleanly": True, "settledComplete": False,
         "settledCycles": 0, "harnessExited": True, "captureEvidence": None,
         "failure": module.GateFailure("CODEX_GATE_REOPEN_FAILED", "reopen")},
    ]
    failure = module.resolve_run_failure({}, phases)
    assert failure is not None and failure.code == "CODEX_GATE_STATE_SCAN_INCOMPLETE"

    secondaries = module.collect_secondary_failures(phases)
    assert [(item["phase"], item["code"]) for item in secondaries] == [
        ("turn-chain", "CODEX_GATE_TURN_FAILED"),
        ("reopen", "CODEX_GATE_REOPEN_FAILED"),
        ("reopen", "CODEX_GATE_STATE_SCAN_INCOMPLETE"),
    ], secondaries
    assert secondaries[0]["message"] == "turn", secondaries
    assert secondaries[2]["message"] == "ps failed", secondaries

    # A phase that failed without an exception still contributes its scanner
    # incompleteness, and a clean pair contributes nothing at all.
    assert module.collect_secondary_failures([
        {"phase": "reopen", "scanError": None, "settleError": None},
        {"phase": "turn-chain", "hits": []},
    ]) == []


def test_a_settled_hit_survives_the_whole_turn_chain_path(tmp_path):
    """Self-review regression: normalizing a phase twice (once where it ran,
    once when its capture scan is attached) must not drop what it already found.
    A settled-only hit ends as the primary credential failure."""
    module = load_gate()
    root = tmp_path / "worker-root"
    root.mkdir(parents=True)
    watcher = module.StateSymlinkWatcher(root)
    watcher.stopped_cleanly = True
    settled = {"harnessExited": True, "settledComplete": False, "settledCycles": 0,
               "settledScan": "view", "settledIncomplete": None, "settledFiles": 2,
               "settledHits": ["native-state/shell_snapshots/late.sh"],
               "settledRaces": []}
    # Exactly the pipeline: normalize where the phase ran, then attach capture.
    phase = module.normalize_phase("turn-chain", settled, watcher)
    report = {"stateScan": {"files": 3, "bytes": 9, "nativeSessionId": True,
                            "tokenInState": False},
              "rounds": {"first": {"state": "completed"}}}
    finalized = module.turn_chain_phase(report, phase)
    assert [hit["source"] for hit in finalized["hits"]] == ["settled"]
    assert finalized["captureEvidence"]["files"] == 3
    failure = module.resolve_run_failure(report, [finalized])
    assert failure is not None
    assert failure.code == "CODEX_GATE_CREDENTIAL_IN_NATIVE_STATE", failure


def test_a_token_in_state_capture_makes_the_phase_a_credential_failure(tmp_path):
    """The report's own capture scan (tokenInState) is attached as a hit, so the
    primary failure is the credential, never an incomplete scan."""
    module = load_gate()
    root = tmp_path / "worker-root"
    root.mkdir(parents=True)
    watcher = module.StateSymlinkWatcher(root)
    watcher.stopped_cleanly = True
    phase = module.normalize_phase("turn-chain", {
        "harnessExited": True, "settledComplete": True, "settledCycles": 1,
        "settledScan": "view", "settledIncomplete": None}, watcher)
    report = {"stateScan": {"files": 3, "bytes": 9, "nativeSessionId": True,
                            "tokenInState": True},
              "rounds": {"first": {"state": "completed"}}}
    finalized = module.turn_chain_phase(report, phase)
    failure = module.resolve_run_failure(report, [finalized])
    assert failure is not None and failure.code == "CODEX_GATE_CREDENTIAL_IN_NATIVE_STATE"


def test_a_failed_phase_is_serializable_where_the_report_needs_it(tmp_path):
    """A phase carries its live exception for the verdict; the report needs text.

    The first live Codex run died while printing its own report - an
    `AttributeError` from a phase had been stored under `settledWindow` - which
    replaced every fact the run had collected with a traceback. The exception is
    still kept for the verdict, and the same facts are recorded as code/message.
    """
    import json

    module = load_gate()
    phase = module.normalize_phase("turn-chain", {
        "harnessExited": True, "settledComplete": True, "settledCycles": 1,
        "settledScan": "view", "settledIncomplete": None}, _watcher(tmp_path))
    phase["failure"] = AttributeError("'NoneType' object has no attribute 'requests'")
    recorded = module.phase_evidence_for_report(phase)
    text = json.dumps(recorded, sort_keys=True)
    assert "'NoneType' object has no attribute" in text
    assert recorded["failure"]["code"] == "CODEX_GATE_UNEXPECTED"
    assert recorded["failed"] is True
    # The verdict still sees the object itself, never its rendering.
    assert isinstance(phase["failure"], AttributeError)

    typed = dict(phase, failure=module.GateFailure("CODEX_GATE_TURN_FAILED", "the turn failed"))
    assert module.phase_evidence_for_report(typed)["failure"] == {
        "code": "CODEX_GATE_TURN_FAILED", "message": "the turn failed"}


def test_the_credential_check_never_ends_a_run_by_itself():
    """`tokenInReportableState` dumps the report; an unrenderable value there
    would turn the credential question into a crash, so it renders a placeholder."""
    import json

    module = load_gate()
    module.REPORT.clear()
    module.REPORT["rounds"] = {"first": {"state": "completed"}}
    module.REPORT["leakedObject"] = object()
    text = module.report_text()
    assert "unserializable object" in text
    assert json.loads(text)["rounds"]["first"]["state"] == "completed"


def _watcher(tmp_path):
    root = tmp_path / "worker-root"
    root.mkdir(parents=True, exist_ok=True)
    module = load_gate()
    watcher = module.StateSymlinkWatcher(root)
    watcher.stopped_cleanly = True
    return watcher
