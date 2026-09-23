"""Test face for the HD-002 BC-0034 native Pi minimal gate (mock phase).

Runs the gate as a subprocess (no agent_box import needed here; the gate puts
``src`` on its own path) and pins the honesty contract:

  * the gate exits green with the MOCK-GATE marker;
  * every item id and status equals the pinned expectation exactly - any new
    seam, any silent downgrade and this test goes red;
  * the report keeps fakePeerOnly / nativeAgentVerified=False and
    realModelCalls=0, because a fake peer is never counted as a native agent.

Run offline:  python3 -m pytest scripts/hd002/test_native_pi_min.py
"""
from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys

REPO = Path(__file__).resolve().parents[2]
GATE = REPO / "scripts" / "hd002" / "native-pi-min-gate.py"

# Pinned exactly (BC-0034: each item separately PASS / UNTESTED / UNSUPPORTED).
EXPECTED_STATUS = {
    "workspace.host_cwd.roundA": "PASS",
    "workspace.host_cwd.roundB": "PASS",
    "stop.child_exit": "PASS",
    "env.credential_scrub": "PASS",
    "turn_context.register_to_port": "PASS",
    "permission.roundtrip_mock": "PASS",
    "cancel.confirmed_tristate": "PASS",
    "cancel.replay_receipt": "PASS",
    "cancel.refused_no_active_run": "PASS",
    "cancel.unknown_injected": "PASS",
    "cancel.false_dead_channel": "PASS",
    "native_id.capture": "PASS",
    "native_id.reopen_frame": "PASS",
    "replay.history_exclusion": "PASS",
    "mcp.tool_projection_mock": "PASS",
    "capability.advertisement_negative": "PASS",
    "typed_refusal.startup_frame": "PASS",
    "acp.session_new.cwd": "UNTESTED",
    "turn_context.server_assembly": "UNTESTED",
    "permission.native_trigger": "UNTESTED",
    "native_reopen.agent_continuation": "UNTESTED",
    "usage.native": "UNTESTED",
    "endpoint.loopback_stub": "UNTESTED",
    "input.editor_choice": "UNSUPPORTED",
}


def _run_gate(report_path: Path) -> dict:
    result = subprocess.run(
        [sys.executable, str(GATE), "--report-path", str(report_path)],
        cwd=str(REPO), capture_output=True, text=True, timeout=300)
    assert result.returncode == 0, result.stderr[-4000:]
    assert "NATIVE_PI_MIN_MOCK_GATE_OK" in result.stdout, result.stdout[-2000:]
    return json.loads(report_path.read_text(encoding="utf-8"))


def test_gate_report_items_match_the_pinned_map(tmp_path):
    report = _run_gate(tmp_path / "report.json")
    items = {item["id"]: item["status"] for item in report["items"]}
    assert items == EXPECTED_STATUS
    assert report["totals"] == {"PASS": 17, "UNTESTED": 6, "UNSUPPORTED": 1}


def test_gate_never_claims_native_agent_success(tmp_path):
    report = _run_gate(tmp_path / "report.json")
    assert report["schemaVersion"] == "hd002.nativePiMinGate/1"
    assert report["fakePeerOnly"] is True
    assert report["nativeAgentVerified"] is False
    assert report["realModelCalls"] == 0
    assert report["realAgentsStarted"] == 0
    assert report["bwrapUsed"] is False
    assert report["nativeHomeRead"] is False
    assert report["userCredentialsRead"] is False
    # The fake peer is never a PASS witness: every item carries its scope.
    for item in report["items"]:
        assert item["scope"].strip(), item
        assert item["evidence"].strip(), item


def test_gate_digests_are_self_reported_and_shaped(tmp_path):
    report = _run_gate(tmp_path / "report.json")
    assert report["gateSource"]["path"] == "scripts/hd002/native-pi-min-gate.py"
    for digest in (report["gateSource"]["sha256"], report["peerSourceSha256"]):
        assert digest.startswith("sha256:") and len(digest) == len("sha256:") + 64


def test_gate_source_fetches_nothing_off_contract(tmp_path):
    # Static guard for BC-0034's construction limits: the gate must not spawn
    # agents, shells or networks itself - all process life goes through the
    # real launcher seams.
    text = GATE.read_text(encoding="utf-8")
    peer_start = text.index("FAKE_PEER_SRC")
    peer_end = text.index("'''", peer_start + 20)
    peer = text[peer_start:peer_end]
    for banned in ("import subprocess", "socket", "http", "bwrap", "pty",
                   "signal.", ".local/bin", "~/.pi", "expanduser"):
        assert banned not in peer, banned
    # The gate module itself launches nothing either: process life goes only
    # through the real LocalProcessLauncher seam imported from src.
    assert "import subprocess" not in text
    assert "Popen" not in text
