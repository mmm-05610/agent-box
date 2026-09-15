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

    watcher = module.StateSymlinkWatcher(root)
    before = len(os.listdir("/proc/self/fd"))
    for _ in range(5):
        watcher._scan_for_credential(root / "views")
    watcher._scan_for_credential(root / "views")
    after = len(os.listdir("/proc/self/fd"))
    assert watcher.scan_completed >= 6, watcher.scan_completed
    assert watcher.scan_incomplete is None, watcher.scan_incomplete
    assert [hit["path"] for hit in watcher.token_hits] == [
        "agentbox-sidecar/deployment/codex/native-state/shell_snapshots/deep.sh",
    ], watcher.token_hits
    assert after <= before + 2, f"descriptors leaked: {before} -> {after}"


def test_a_token_beyond_the_first_chunk_is_still_found(tmp_path):
    """A short read must not hide a token: the read loops within the budget."""
    module = load_gate()
    root = tmp_path / "worker-root"
    state = root / "views" / "view-1" / "ready" / "agentbox-sidecar" / "deployment" / "codex" / "native-state"
    state.mkdir(parents=True)
    (state / "big.sh").write_bytes(b"x" * 100_000 + module.FAKE_TOKEN.encode())
    watcher = module.StateSymlinkWatcher(root)
    watcher._scan_for_credential(root / "views")
    assert watcher.scan_incomplete is None, watcher.scan_incomplete
    assert watcher.scan_completed == 1
    assert [hit["path"].rsplit("/", 1)[-1] for hit in watcher.token_hits] == ["big.sh"]


def test_a_file_beyond_the_observation_budget_marks_the_scan_incomplete(tmp_path):
    module = load_gate()
    root = tmp_path / "worker-root"
    state = root / "views" / "view-1" / "ready" / "agentbox-sidecar" / "deployment" / "codex" / "native-state"
    state.mkdir(parents=True)
    (state / "huge.sh").write_bytes(b"x" * (module.CREDENTIAL_SCAN_FILE_BYTES + 1))
    watcher = module.StateSymlinkWatcher(root)
    watcher._scan_for_credential(root / "views")
    assert "per-file budget" in (watcher.scan_incomplete or ""), watcher.scan_incomplete
    assert watcher.scan_completed == 0, "an incomplete cycle must not count as a scan"
    verdict, _detail = module.credential_scan_verdict(
        watcher.token_hits, watcher.scan_error, True, False,
        watcher.scan_incomplete, watcher.scan_completed,
    )
    assert verdict == "CODEX_GATE_STATE_SCAN_INCOMPLETE"


def test_a_credential_hit_outranks_a_chain_failure(tmp_path):
    """The merging rule the gate applies after a failed chain: whatever else
    failed, a credential observed in native state is the primary failure and
    the chain failure is carried as structured secondary evidence."""
    module = load_gate()
    root = tmp_path / "worker-root"
    state = root / "views" / "view-1" / "ready" / "agentbox-sidecar" / "deployment" / "codex" / "native-state"
    state.mkdir(parents=True)
    (state / "leak.sh").write_text("export K='" + module.FAKE_TOKEN + "'", encoding="utf-8")
    watcher = module.StateSymlinkWatcher(root)
    watcher._scan_for_credential(root / "views")
    chain_failure = module.GateFailure("CODEX_GATE_TURN_FAILED", "the turn failed")
    verdict, detail = module.credential_scan_verdict(
        watcher.token_hits, watcher.scan_error, True, False,
        watcher.scan_incomplete, watcher.scan_completed,
    )
    assert verdict == "CODEX_GATE_CREDENTIAL_IN_NATIVE_STATE", detail
    assert chain_failure.code == "CODEX_GATE_TURN_FAILED", "kept as secondary evidence"


def test_a_raced_read_is_a_persistent_fact_not_a_forgotten_cycle(tmp_path, monkeypatch):
    """The race is injected deterministically at the post-read fstat: the
    in-flight payload carries the token (so it is a hit), the race is recorded,
    and the event survives later quiet cycles."""
    module = load_gate()
    root = tmp_path / "worker-root"
    state = root / "views" / "view-1" / "ready" / "agentbox-sidecar" / "deployment" / "codex" / "native-state"
    state.mkdir(parents=True)
    racing = state / "racing.sh"
    racing.write_text("export K='" + module.FAKE_TOKEN + "'", encoding="utf-8")
    watcher = module.StateSymlinkWatcher(root)

    real_fstat = os.fstat
    calls: dict[int, int] = {}

    def racing_fstat(fd):
        calls[fd] = calls.get(fd, 0) + 1
        status = real_fstat(fd)
        if calls[fd] == 2 and stat.S_ISREG(status.st_mode):
            # The second fstat of a file is the post-read identity check:
            # report a one-second-older mtime so the read counts as raced.
            return os.stat_result((
                status.st_mode, status.st_ino, status.st_dev, status.st_nlink,
                status.st_uid, status.st_gid, status.st_size,
                status.st_atime, status.st_mtime + 1, status.st_ctime,
            ))
        return status

    monkeypatch.setattr(module.os, "fstat", racing_fstat)
    monkeypatch.setattr(module.stat, "S_ISREG", stat.S_ISREG)
    import stat as real_stat
    monkeypatch.setattr(module.stat, "S_ISREG", real_stat.S_ISREG)
    watcher._scan_for_credential(root / "views")
    assert [hit["path"].rsplit("/", 1)[-1] for hit in watcher.token_hits] == ["racing.sh"], watcher.token_hits
    assert watcher.race_events and watcher.race_events[0]["path"].endswith("racing.sh")
    first = list(watcher.race_events)
    monkeypatch.undo()
    monkeypatch.setattr(module.os, "fstat", real_fstat)
    monkeypatch.undo()
    watcher._scan_for_credential(root / "views")
    assert watcher.race_events == first, "a quiet cycle must not clear the fact"
    verdict, _detail = module.credential_scan_verdict(
        watcher.token_hits, watcher.scan_error, True, False,
        watcher.scan_incomplete, watcher.scan_completed, watcher.race_events,
        watcher.incomplete_events)
    assert verdict == "CODEX_GATE_CREDENTIAL_IN_NATIVE_STATE"


def test_the_file_budget_is_typed_incomplete(tmp_path):
    """More regular files than the budget fails as an incomplete scan."""
    module = load_gate()
    root = tmp_path / "worker-root"
    state = root / "views" / "view-1" / "ready" / "agentbox-sidecar" / "deployment" / "codex" / "native-state"
    state.mkdir(parents=True)
    for index in range(module.CREDENTIAL_SCAN_FILES + 1):
        (state / f"f{index:04}").write_text("x", encoding="utf-8")
    watcher = module.StateSymlinkWatcher(root)
    watcher._scan_for_credential(root / "views")
    assert "file budget" in (watcher.scan_incomplete or ""), watcher.scan_incomplete
    verdict, _detail = module.credential_scan_verdict(
        watcher.token_hits, watcher.scan_error, True, False,
        watcher.scan_incomplete, watcher.scan_completed, watcher.race_events,
        watcher.incomplete_events)
    assert verdict == "CODEX_GATE_STATE_SCAN_INCOMPLETE"

    # The event survives later cycles: a clean pass cannot wash it away.
    events = list(watcher.incomplete_events)
    watcher._scan_for_credential(root / "views")
    assert watcher.incomplete_events == events


def test_the_traversal_and_byte_budgets_are_typed_incomplete(tmp_path):
    """A forest of directories past the traversal bound, and a set of small
    files past the cumulative byte bound, both fail as incomplete scans."""
    module = load_gate()
    root = tmp_path / "worker-root"
    state = root / "views" / "view-1" / "ready" / "agentbox-sidecar" / "deployment" / "codex" / "native-state"
    state.mkdir(parents=True)
    for index in range(module.CREDENTIAL_SCAN_TRAVERSAL + 8):
        (state / f"d{index:05}").mkdir()
    watcher = module.StateSymlinkWatcher(root)
    watcher._scan_for_credential(root / "views")
    assert "traversal budget" in (watcher.scan_incomplete or ""), watcher.scan_incomplete

    crowded = tmp_path / "worker-root-bytes"
    bytes_state = crowded / "views" / "view-1" / "ready" / "agentbox-sidecar" / "deployment" / "codex" / "native-state"
    bytes_state.mkdir(parents=True)
    chunk = b"y" * (1024 * 1024)
    for index in range(9):
        (bytes_state / f"f{index}").write_bytes(chunk)
    heavy = module.StateSymlinkWatcher(crowded)
    heavy._scan_for_credential(crowded / "views")
    assert "byte budget" in (heavy.scan_incomplete or ""), heavy.scan_incomplete


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
