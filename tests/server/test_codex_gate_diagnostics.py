"""The Codex gate's alias-symlink annotation must be causal, not correlational.

The gate observes the native CLI's argv0 alias links while an attempt runs.
Those links are normal, so they may only be promoted to a *blocker* diagnosis
when the turn actually failed in the state-capture step with a view/state code;
any other failure is recorded as a co-observation so the blocker evidence stays
clean. Neither branch ever changes an outcome - this is diagnostics only.
"""
from __future__ import annotations

import importlib.util
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


def test_a_capture_failure_with_a_state_code_is_the_blocker():
    report = annotate({
        "state": "failed", "capture_state": "failed", "error_code": "VIEW_SPECIAL_FILE",
    })
    blocker = report["blocker"]
    assert blocker["code"] == "CODEX_GATE_STATE_CONTAINS_NATIVE_ALIAS_SYMLINKS"
    assert blocker["turnErrorCode"] == "VIEW_SPECIAL_FILE"
    assert "stateSymlinkCoObservation" not in report


def test_file_limit_and_secret_scan_never_become_alias_blockers():
    """Both codes have first-hand unrelated causes (the plugin file burst;
    credential material in native state), so they must stay co-observations."""
    for error_code in ("VIEW_FILE_LIMIT", "SIDECAR_STATE_CONTAINS_SECRET"):
        report = annotate({
            "state": "failed", "capture_state": "failed", "error_code": error_code,
        })
        assert "blocker" not in report, error_code
        assert report["stateSymlinkCoObservation"]["turnErrorCode"] == error_code


def test_an_unrelated_turn_failure_is_only_a_co_observation():
    for error_code in ("CREDENTIAL_REQUIRED", "SIDECAR_OP_FAILED", "ADAPTER_EXITED"):
        report = annotate({"state": "failed", "capture_state": "pending", "error_code": error_code})
        assert "blocker" not in report, error_code
        co_observation = report["stateSymlinkCoObservation"]
        assert co_observation["turnErrorCode"] == error_code
        assert "co-observation" in co_observation["note"]


def test_a_capture_failure_with_an_out_of_scope_code_stays_a_co_observation():
    report = annotate({"state": "failed", "capture_state": "failed", "error_code": "WORKER_ERROR"})
    assert "blocker" not in report
    assert report["stateSymlinkCoObservation"]["turnCaptureState"] == "failed"


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
