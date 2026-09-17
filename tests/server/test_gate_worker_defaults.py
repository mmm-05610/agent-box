"""Order 49 G1 counter-examples: an omitted worker must be a typed refusal.

Every full-chain gate and the runtime artifact gate used to fall back to a
hard-coded acceptance bundle (c4 or the build tree), so a bare invocation
produced green evidence from stale artifacts. The default is now ``None`` and
the gate must fail fast with ``GATE_WORKER_REQUIRED`` before creating any
temporary state.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

CHAIN_GATES = [
    "pi",
    "hermes",
    "opencode",
    "codex",
    "kilo",
    "claude",
    "dsh",
    "qwen",
]


def _run(script: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(REPO / "scripts" / "server-round1" / script), "--json"],
        capture_output=True,
        text=True,
        cwd=REPO,
        timeout=120,
    )


def test_chain_gate_without_worker_fails_typed() -> None:
    for name in CHAIN_GATES:
        script = f"{name}-production-chain-gate.py"
        done = _run(script)
        assert done.returncode != 0, f"{script} exited 0 without --worker"
        report = json.loads(done.stdout)
        assert report.get("code") == "GATE_WORKER_REQUIRED", (script, report)
        assert ".acceptance-bundle-" in report.get("error", ""), (
            script,
            "the refusal must name the bundles that exist on disk",
        )


def test_runtime_artifact_gate_without_worker_fails_typed() -> None:
    done = _run("runtime-artifact-gate.py")
    assert done.returncode != 0, "runtime-artifact-gate.py exited 0 without --worker"
    report = json.loads(done.stdout)
    assert report.get("result") == "RUNTIME_ARTIFACT_GATE_FAILED", report
    assert report.get("reason", "").startswith("GATE_WORKER_REQUIRED"), report
