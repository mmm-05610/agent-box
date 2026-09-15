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
    verdict, _detail = module.credential_scan_verdict([], None, True, False)
    assert verdict is None


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
    assert watcher.scan_incomplete is None
    assert [hit["path"].rsplit("/", 1)[-1] for hit in watcher.token_hits] == ["big.sh"]


def test_a_file_beyond_the_observation_budget_marks_the_scan_incomplete(tmp_path):
    module = load_gate()
    root = tmp_path / "worker-root"
    state = root / "views" / "view-1" / "ready" / "agentbox-sidecar" / "deployment" / "codex" / "native-state"
    state.mkdir(parents=True)
    (state / "huge.sh").write_bytes(b"x" * (module.CREDENTIAL_SCAN_FILE_BYTES + 1))
    watcher = module.StateSymlinkWatcher(root)
    watcher._scan_for_credential(root / "views")
    assert "observation budget" in (watcher.scan_incomplete or "")
    verdict, _detail = module.credential_scan_verdict(
        watcher.token_hits, watcher.scan_error, True, False,
        watcher.scan_incomplete, watcher.scan_completed,
    )
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
