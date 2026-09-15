#!/usr/bin/env python3
"""The feature-flag differential for the Codex deployment config.

Two first-hand observations made the Codex chain unusable, both from official
feature flags that default to *on*:

  * `features.plugins` materializes the bundled plugin/skill corpus into
    `$CODEX_HOME/.tmp/plugins/` (measured peak 5,529 files, which is the
    deterministic `VIEW_FILE_LIMIT` failure), and
  * `features.shell_snapshot` writes `$CODEX_HOME/shell_snapshots/*.sh`, the
    file the injected credential environment variable was first-hand found in.

The reviewed config turns both off. This script proves it the only way that
counts: it runs the same gate, on the same pinned artifact (0.147.0) and the
same worker, with **no attempt-ephemeral tmpfs shadow at all**, twice:

  * control leg  - `--feature-flag-control-leg` strips the `[features]` table, so
    Codex behaves as shipped. The churners are expected to appear here (that is
    what makes the treatment leg meaningful), and a credential hit is recorded
    as the strongest form of that appearance.
  * treatment leg - the config exactly as deployed. Neither churner may appear,
    in any run, and no credential may be observed anywhere.

The control leg is repeated up to `--control-runs` times because the churners
are timing-dependent; the treatment leg is repeated `--treatment-runs` times
because it is the leg that must never show them. Exit code 0 means the
differential held: every treatment run clean, and the control leg either
demonstrated an appearance or is reported honestly as not observed in its runs.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys


GATE = Path(__file__).resolve().parent / "codex-production-chain-gate.py"


def run_gate(worker: str, *, control: bool, extra: list[str]) -> dict:
    command = [sys.executable, str(GATE), "--worker", worker,
               "--legacy-state-diagnostic", "--json"]
    if control:
        command.append("--feature-flag-control-leg")
    command += extra
    done = subprocess.run(command, capture_output=True, text=True, timeout=1800)
    try:
        report = json.loads(done.stdout[done.stdout.index("{"):])
    except (ValueError, json.JSONDecodeError):
        report = {"result": "CODEX_FLAG_DIFFERENTIAL_UNPARSEABLE",
                  "stdout_tail": done.stdout[-400:], "stderr_tail": done.stderr[-400:]}
    report["_exit"] = done.returncode
    return report


def churn_appeared(report: dict) -> dict:
    """What this run showed of the two churners, in report terms."""
    observation = report.get("stateProjectionObservation") or {}
    hits = report.get("credentialPathHits") or []
    return {
        "peakRegularFiles": observation.get("peakRegularFiles"),
        "peakDirectoryCounts": observation.get("peakDirectoryCounts"),
        "peakSamplePaths": observation.get("peakSamplePaths"),
        "credentialPathHits": [hit.get("path") for hit in hits],
        "appeared": bool(
            hits
            or (observation.get("peakRegularFiles") or 0) > 1000
            or any("shell_snapshots" in json.dumps(item)
                   for item in (observation.get("peakDirectoryCounts") or []))
            or any("shell_snapshots" in str(path) or "/.tmp/" in str(path)
                   for path in (observation.get("peakSamplePaths") or []))
        ),
    }


#: The differential has three possible answers, and only one of them is a
#: pass: the control leg must have *demonstrated* the churn (otherwise nothing
#: is being compared) and every treatment run must be clean. A clean treatment
#: without a demonstrated control is INCONCLUSIVE, never OK - the machine
#: interface must not encode an unproven causal claim as green.
def classify(control_runs: list[dict], treatment_runs: list[dict]) -> tuple[str, int]:
    treatment_clean = all(
        not run["appeared"] and run["result"] == "CODEX_PRODUCTION_CHAIN_GATE_OK"
        for run in treatment_runs
    )
    control_demonstrated = any(run["appeared"] for run in control_runs)
    if not treatment_clean:
        return "CODEX_FEATURE_FLAG_DIFFERENTIAL_FAILED", 1
    if not control_demonstrated:
        return "CODEX_FEATURE_FLAG_DIFFERENTIAL_INCONCLUSIVE", 2
    return "CODEX_FEATURE_FLAG_DIFFERENTIAL_OK", 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker", required=True)
    parser.add_argument("--control-runs", type=int, default=5)
    parser.add_argument("--treatment-runs", type=int, default=2)
    options = parser.parse_args()

    control_runs = []
    for _ in range(max(1, options.control_runs)):
        report = run_gate(options.worker, control=True, extra=[])
        control_runs.append({"result": report.get("result"), "exit": report["_exit"],
                             **churn_appeared(report)})
        if control_runs[-1]["appeared"]:
            break

    treatment_runs = []
    for _ in range(max(1, options.treatment_runs)):
        report = run_gate(options.worker, control=False, extra=[])
        treatment_runs.append({"result": report.get("result"), "exit": report["_exit"],
                               **churn_appeared(report)})

    result, exit_code = classify(control_runs, treatment_runs)
    verdict = {
        "result": result,
        "controlRuns": control_runs,
        "treatmentRuns": treatment_runs,
        "controlDemonstratedChurn": any(run["appeared"] for run in control_runs),
        "treatmentClean": all(
            not run["appeared"] and run["result"] == "CODEX_PRODUCTION_CHAIN_GATE_OK"
            for run in treatment_runs),
        "controlNotObservedInRuns": (None if any(run["appeared"] for run in control_runs)
                                     else len(control_runs)),
    }
    print(json.dumps(verdict, indent=1, sort_keys=True))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
