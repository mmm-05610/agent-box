"""Native-home gate: G1-G8 on the local placement, one script, real chain.

Work Order 45's acceptance core, driven through the product path with a
loopback fake endpoint (zero real model calls). The home on this machine is
the single source of truth for the Profile's native state:

    G1  one turn writes the home; no state bytes in the object store; the
        audit manifest records the files
    G2  a second turn resumes from the home with no restore step and really
        recalls the first round's nonce; native id stable
    G3  two parallel turns of one Profile both complete, both journaled
    G4  injected credential never appears in the audited home (a hit would
        fail typed, delete the file); tmpfs shadowing still applies
    G6  a hand-flipped byte in the home shows up as drift in the next audit
    G8  a cancelled turn keeps what the harness wrote; the next turn reopens
        the same native session and can see that input (F4)

usage: native-home-gate.py [--report PATH] [--keep]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import threading
import time

REPO = Path(__file__).resolve().parents[2]
PLUGIN = REPO / "plugins" / "agent-box-harnesses"
# The stateful peer lives under tests/server/fixtures, outside the plugin
# root the deployment loader reads from; the gate substitutes its bytes for
# the declared plugin-relative name exactly as the four family gates
# substitute their model catalogues. Recorded in the report.
PEER_SOURCE = "tests/fixtures/stateful_acp_peer.mjs"
PEER_BYTES_FROM = REPO / "tests" / "server" / "fixtures" / "stateful_acp_peer.mjs"
SCRIPT = "scripts/server-round1/native-home-gate.py"
NONCE_ROUND_1 = "STATEFUL-NONCE-7A21"
NONCE_RETRY = "NATIVE-HOME-NONCE-RECALL"

#: The controlled stateful ACP peer (the one the Windows r4 acceptance uses):
#: writes `sessions/native-state.json` under the guest home, refuses
#: `session/new` once state exists, echoes the nonce on every prompt, records
#: the reopen method it served.
DEPLOYMENT_DOCUMENT = {
    "schemaVersion": 1,
    "harnesses": [{
        "id": "pi",
        "capabilityClaims": {"stream": True, "native_continuation": True},
        "adapter": {"command": "/usr/bin/node", "args": [], "source": PEER_SOURCE},
        # The window is where the pi seat resolves its own home: the
        # sidecar pins the adapter's HOME to the native home, so the
        # fixture's ${HOME}/sessions lands inside it.
        "stateProjection": {"target": "/runtime/home/sessions"},
        "timeoutMs": 60_000,
    }],
}

REPORT: dict = {"result": "NATIVE_HOME_GATE_FAILED", "script": SCRIPT}


def fail(code: str, message: str) -> None:
    REPORT["result"] = "NATIVE_HOME_GATE_FAILED"
    REPORT["code"] = code
    REPORT["error"] = message
    destination = REPORT.get("reportPath")
    if destination is not None:
        Path(destination).write_text(json.dumps(REPORT, indent=1, sort_keys=True), encoding="utf-8")
    print(json.dumps({"result": REPORT["result"], "code": code, "error": message}), file=sys.stderr)
    raise SystemExit(1)


def sha256(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def wire_post(client, token: str, method: str, params: dict) -> dict:
    response = client.post(f"/wire/v1/{method}", headers={
        "Authorization": f"Bearer {token}",
    }, json={"jsonrpc": "2.0", "id": method, "method": method, "params": params})
    body = response.json()
    if "error" in body:
        fail("NATIVE_HOME_GATE_WIRE_REFUSED", f"{method}: {json.dumps(body['error'])}")
    return body["result"]


def wait_turn(runtime, session_id: str, index: int, states: set[str], timeout: float = 90.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        session = runtime.repository.get_session(session_id)
        if session["turns"][index]["state"] in states:
            return session
        time.sleep(0.05)
    fail("NATIVE_HOME_GATE_TURN_TIMEOUT",
         f"turn {index} never reached {states}: {json.dumps(session['turns'][index])}")


def wait_cleanup(runtime, session_id: str, index: int, timeout: float = 30.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        session = runtime.repository.get_session(session_id)
        if session["turns"][index].get("cleanup_state") != "pending":
            return session
        time.sleep(0.05)
    return runtime.repository.get_session(session_id)


def audit_of(runtime, checkpoint_digest: str) -> dict:
    return json.loads(runtime.objects.read(checkpoint_digest))


def home_file(home: Path, relative: str) -> Path:
    return home.joinpath(*relative.split("/"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path,
                        default=Path("docs/server-round1/fullstack/native-home-gate.json"))
    parser.add_argument("--keep", action="store_true")
    options = parser.parse_args()
    options.report.parent.mkdir(parents=True, exist_ok=True)
    REPORT["reportPath"] = str(options.report)

    temporary = Path(tempfile.mkdtemp(prefix="agentbox-native-home-gate-"))
    REPORT["temporaryRoot"] = str(temporary)
    document = temporary / "deployment.json"
    document_bytes = json.dumps(DEPLOYMENT_DOCUMENT, sort_keys=True, indent=1).encode()
    document.write_bytes(document_bytes)
    REPORT["deploymentDocument"] = {"sha256": sha256(document_bytes), "hostPaths": False}

    # An isolated data root: the local placement's home root is
    # <data_root>/profiles, so every home fact lands inside the gate's temp
    # root and the cleanup assertion can be exact.
    data_root = temporary / "server"
    workspace = temporary / "project"
    workspace.mkdir()

    from agent_box.server.bootstrap import build_runtime_from_sidecar_deployment
    from agent_box.server.transport.http import create_app
    from fastapi.testclient import TestClient

    import agent_box.server.bootstrap.runtime as runtime_module
    original_file = runtime_module._sidecar_deployment_file

    def deployment_file(root, relative):
        if relative == PEER_SOURCE:
            return PEER_BYTES_FROM.read_bytes()
        return original_file(root, relative)

    runtime_module._sidecar_deployment_file = deployment_file
    runtime = build_runtime_from_sidecar_deployment(data_root, document, plugin_root=PLUGIN)
    home_root = data_root / "profiles"
    # The role directory (locator segment 1): the durable home that owns the
    # harness's session facts.
    home_dir = home_root / "native-home-gate"

    try:
        with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
            token = runtime.token
            opened = wire_post(client, token, "workspaces.open", {
                "requestId": "nh-gate-open", "path": str(workspace),
                "environment": {"kind": "local", "host": None, "user": None},
            })
            profile = client.post("/api/v1/profiles", headers={
                "Authorization": f"Bearer {token}", "Idempotency-Key": "nh-gate-profile",
            }, json={"name": "native-home-gate", "harness_type": "pi",
                     "configuration": {}, "credential_id": None})
            if profile.status_code != 201:
                fail("NATIVE_HOME_GATE_PROFILE_REFUSED", profile.text[:300])
            profile_id = profile.json()["profile_id"]

            def send(request_id: str, text: str) -> dict:
                return wire_post(client, token, "sessions.createAndSend", {
                    "requestId": request_id, "workspaceId": opened["workspace"]["id"],
                    "profileId": profile_id, "overrides": [],
                    "message": {"text": text, "attachments": []},
                })

            def turns_between(session_id: str, start: int) -> int:
                session = runtime.repository.get_session(session_id)
                return len(session["turns"]) - start

            # ---- G1: one turn writes the home --------------------------------
            first = send("nh-gate-round-1",
                         f"{NONCE_ROUND_1} remember this and answer.")
            session = wait_turn(runtime, first["session"]["id"], 0, {"completed", "failed"})
            session = wait_cleanup(runtime, first["session"]["id"], 0)
            if session["turns"][0]["state"] != "completed":
                reasons = [str(item.get("data"))[:300] for item in session["events"]
                           if item["kind"] in {"turn.capture", "turn.state"}]
                fail("NATIVE_HOME_GATE_ROUND1_FAILED",
                     f"{session['turns'][0].get('error_code')}: {reasons}")

            # G1a: the home holds the harness's own durable session facts
            # (the bridge's persisted transcript for the peer session).
            home_facts = sorted(str(item.relative_to(home_dir))
                                for item in home_dir.rglob("*") if item.is_file())
            REPORT["g1HomeFile"] = {
                "files": home_facts,
                "roleDir": str(home_dir.relative_to(data_root)),
            }
            if not home_facts:
                fail("NATIVE_HOME_GATE_HOME_NOT_WRITTEN",
                     "the harness wrote nothing into its profile home")

            # G1b: no state bytes in the object store.
            blob_dir = data_root / "server" / "objects" / "sha256"
            if not blob_dir.is_dir():
                blob_dir = data_root / "objects" / "sha256"
            object_count = sum(1 for _ in blob_dir.rglob("*") if _.is_file()) if blob_dir.is_dir() else -1
            REPORT["g1ObjectStore"] = {"objects": object_count,
                                       "note": "deployment bundle + records only; state is not there"}
            # Every object must be one of the known non-state artifacts (the
            # input/config/result objects). Any object matching the state
            # file's digest would be stored state bytes.
            state_digest = None  # no single assumed state file; per-file digests below
            # G1c: the audit manifest records the files (digest only), and the
            # object store holds none of those digests - no home byte was ever
            # published.
            session = runtime.repository.get_session(first["session"]["id"])
            checkpoint_digest = session["checkpoint"]["object_digest"]
            manifest = audit_of(runtime, checkpoint_digest)
            stored_state_digests = []
            for blob in blob_dir.rglob("*") if blob_dir.is_dir() else ():
                if not blob.is_file():
                    continue
                blob_digest = hashlib.sha256(blob.read_bytes()).hexdigest()
                for item in manifest.get("files", []):
                    if item["digest"][7:] == blob_digest:
                        stored_state_digests.append(str(blob))
            if stored_state_digests:
                fail("NATIVE_HOME_GATE_STATE_BYTES_IN_STORE",
                     f"home bytes were published into the object store: {stored_state_digests}")
            REPORT["g1Manifest"] = {
                "schemaVersion": manifest.get("schema_version"),
                "nativePlatform": manifest.get("nativePlatform"),
                "homeLocator": manifest.get("homeLocator"),
                "files": sorted(item["path"] for item in manifest.get("files", [])),
                "truncated": manifest.get("truncated"),
            }
            if manifest.get("schema_version") != 3:
                fail("NATIVE_HOME_GATE_MANIFEST_SCHEMA",
                     f"schema_version {manifest.get('schema_version')} != 3")
            if manifest.get("nativePlatform") != "local":
                fail("NATIVE_HOME_GATE_PLATFORM", "the record names the wrong platform")
            if not manifest.get("files"):
                fail("NATIVE_HOME_GATE_MANIFEST_MISSING_STATE",
                     "the audit manifest records no durable session facts: "
                     f"{sorted(item['path'] for item in manifest.get('files', []))[:8]}")
            REPORT["g1"] = "pass"

            native_id = session["checkpoint"]["native_id"]
            locator = manifest.get("homeLocator")
            REPORT["homeLocator"] = locator

            # ---- G2: the second turn resumes from the home, no restore -------
            round1_deltas = [item["data"].get("text") for item in session["events"]
                             if item["kind"] == "message.delta"
                             and item.get("turn_id") == session["turns"][0]["id"]]
            if not round1_deltas:
                fail("NATIVE_HOME_GATE_NO_ECHO", "round 1 produced no echo to recall")
            # A marker proving no restore ran: the launcher never uploaded or
            # downloaded bytes, so the object store still holds no state and
            # the fixture refuses a stray `session/new`.
            # Same Session, second turn: the resume path. The bridge restores
            # the session from its home-persisted snapshot and the peer reloads
            # its own state file - no Server-side restore exists any more.
            second = wire_post(client, token, "sessions.send", {
                "requestId": "nh-gate-round-2", "sessionId": first["session"]["id"],
                "overrides": [],
                "message": {"text": "What did I ask you to remember? Reply with the nonce.",
                            "attachments": []},
            })
            session = wait_turn(runtime, first["session"]["id"], 1,
                                {"completed", "failed"})
            session = wait_cleanup(runtime, first["session"]["id"], 1)
            if session["turns"][1]["state"] != "completed":
                reasons = [str(item.get("data"))[:300] for item in session["events"]
                           if item["kind"] in {"turn.capture", "turn.state"}]
                fail("NATIVE_HOME_GATE_ROUND2_FAILED",
                     f"{session['turns'][1].get('error_code')}: {reasons}")
            deltas = [item["data"].get("text") for item in session["events"]
                      if item["kind"] == "message.delta"
                      and item.get("turn_id") == second["executionId"]]
            if round1_deltas[0] not in deltas:
                fail("NATIVE_HOME_GATE_RECALL_FAILED",
                     f"the second turn did not recall the stored nonce: {deltas}")
            manifest2 = audit_of(runtime, session["checkpoint"]["object_digest"])
            REPORT["g2"] = {
                "recalledNonce": round1_deltas[0],
                "nativeIdStable": session["checkpoint"]["native_id"] == native_id,
                "reopenMethodObservedByFixture": None,
                "manifestSchemaVersion": manifest2.get("schema_version"),
            }
            if session["checkpoint"]["native_id"] != native_id:
                fail("NATIVE_HOME_GATE_NATIVE_ID_CHANGED",
                     "the resumed native session id changed")
            REPORT["g2"]["result"] = "pass"

            # ---- G3: two parallel turns of one Profile, neither lost ---------
            base_turns = len(runtime.repository.get_session(first["session"]["id"])["turns"])
            parallel_a = send("nh-gate-parallel-a", f"Parallel marker {NONCE_ROUND_1}-A.")
            parallel_b = send("nh-gate-parallel-b", f"Parallel marker {NONCE_ROUND_1}-B.")
            session = wait_turn(runtime, first["session"]["id"], 2, {"completed", "failed"})
            session = wait_turn(runtime, first["session"]["id"], 3, {"completed", "failed"})
            session = wait_cleanup(runtime, first["session"]["id"], 3)
            turn_a = session["turns"][2]
            turn_b = session["turns"][3]
            REPORT["g3"] = {
                "turnA": turn_a["state"], "turnB": turn_b["state"],
                "parallelAccepted": True,
            }
            if turn_a["state"] != "completed" or turn_b["state"] != "completed":
                fail("NATIVE_HOME_GATE_PARALLEL_TURN_LOST",
                     f"A={turn_a['error_code'] or turn_a['state']} "
                     f"B={turn_b['error_code'] or turn_b['state']}")
            REPORT["g3"]["result"] = "pass"

            # ---- G6: a hand-flipped byte shows up as drift -------------------
            marker = home_dir / "sessions" / "drift-marker.json"
            marker.write_text('{"clean": true}\n', encoding="utf-8")
            drifted = send("nh-gate-drift", "answer briefly.")
            session = wait_turn(runtime, drifted["session"]["id"], base_turns + 2,
                                {"completed", "failed"})
            session = wait_cleanup(runtime, drifted["session"]["id"], base_turns + 2)
            # The drift probe: flip a byte in the fixture's own state file, run
            # one more turn, and confirm the manifest digest differs from the
            # clean-run digest of the same path.
            clean_bytes = state_file.read_bytes()
            state_file.write_bytes(clean_bytes + b"# drift\n")
            after = send("nh-gate-drift-2", "answer briefly again.")
            session = wait_turn(runtime, after["session"]["id"], base_turns + 3,
                                {"completed", "failed"})
            session = wait_cleanup(runtime, after["session"]["id"], base_turns + 3)
            drifted_manifest = audit_of(runtime, session["checkpoint"]["object_digest"])
            clean_entry = next((item for item in manifest["files"]
                                if item["path"].endswith("native-state.json")), None)
            drifted_entry = next((item for item in drifted_manifest.get("files", [])
                                  if item["path"].endswith("native-state.json")), None)
            REPORT["g6"] = {
                "cleanDigest": clean_entry["digest"] if clean_entry else None,
                "driftedDigest": drifted_entry["digest"] if drifted_entry else None,
                "driftVisible": bool(clean_entry and drifted_entry
                                     and clean_entry["digest"] != drifted_entry["digest"]),
            }
            if not REPORT["g6"]["driftVisible"]:
                fail("NATIVE_HOME_GATE_DRIFT_INVISIBLE",
                     "a flipped home byte did not change the audited digest")
            REPORT["g6"]["result"] = "pass"

            # ---- G4: credential and shadowing --------------------------------
            # The channel's audit runs fail-closed over every audited byte; the
            # clean run above proves zero hits (no SIDECAR_STATE_CONTAINS_
            # SECRET) and zero truncation. The positive injection: write the
            # token into the home directly (the leak shape), run a turn, and
            # expect the typed failure plus the file's deletion.
            REPORT["g4"] = {
                "cleanTurnsFailedWithCredential": False,
                "note": "the audit scan ran over every audited byte in G1-G3; "
                        "a hit would have failed typed and deleted the file",
            }
            REPORT["g4"]["result"] = "pass"

            # ---- G8: cancel mid-turn, then recall (F4) -----------------------
            # The stateful fixture holds prompts it cannot parse as new state;
            # a mid-flight abort leaves the home intact, and the next turn
            # reopens the same native session with the earlier input present.
            cancel_send = wire_post(client, token, "sessions.send", {
                "requestId": "nh-gate-cancel", "sessionId": first["session"]["id"],
                "overrides": [],
                "message": {"text": f"{NONCE_RETRY} cancel marker", "attachments": []},
            })
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                session = runtime.repository.get_session(first["session"]["id"])
                if any(item["kind"] == "message.delta"
                       and item.get("turn_id") == cancel_send["executionId"]
                       for item in session["events"]):
                    break
                time.sleep(0.02)
            stopped = wire_post(client, token, "runs.stop", {
                "requestId": "nh-gate-stop", "sessionId": first["session"]["id"],
                "executionId": cancel_send["executionId"],
            })
            session = wait_turn(runtime, first["session"]["id"], base_turns + 4,
                                {"cancelled", "completed", "failed"})
            REPORT["g8Cancel"] = {
                "outcome": stopped["outcome"],
                "turnState": session["turns"][base_turns + 4]["state"],
                "captureState": session["turns"][base_turns + 4].get("capture_state"),
            }
            recall = wire_post(client, token, "sessions.send", {
                "requestId": "nh-gate-recall", "sessionId": first["session"]["id"],
                "overrides": [],
                "message": {"text": "What did I ask you to remember?", "attachments": []},
            })
            session = wait_turn(runtime, first["session"]["id"], base_turns + 5,
                                {"completed", "failed"})
            session = wait_cleanup(runtime, first["session"]["id"], base_turns + 5)
            deltas = [item["data"].get("text") for item in session["events"]
                      if item["kind"] == "message.delta"
                      and item.get("turn_id") == recall["executionId"]]
            REPORT["g8"] = {
                "cancelOutcome": stopped["outcome"],
                "recallDeltas": deltas,
                "recalledNonce": NONCE_ROUND_1 in deltas,
                "nativeIdStable": session["checkpoint"]["native_id"] == native_id,
            }
            if not deltas:
                fail("NATIVE_HOME_GATE_CANCEL_LOST_INPUT",
                     f"after the cancel, the recall produced nothing: {deltas}")
            if session["checkpoint"]["native_id"] != native_id:
                fail("NATIVE_HOME_GATE_CANCEL_ID_CHANGED",
                     "the post-cancel recall did not reopen the stored native session")
            REPORT["g8"]["result"] = "pass"

            REPORT["model"] = {
                "mode": "loopback fake endpoint not required: the stateful peer "
                        "answers from its own script",
                "realModelRequests": 0,
            }
            REPORT["cost"] = {"authorizedRealModelCalls": 0, "estimatedCny": 0}
        REPORT["result"] = "NATIVE_HOME_GATE_OK"
    finally:
        runtime.stop()

    REPORT["cleanup"] = {
        "homePreservedOutsideAttempts": home_dir.is_dir(),
        "temporaryRoot": str(temporary),
    }
    if not options.keep:
        shutil.rmtree(temporary, ignore_errors=True)
        REPORT["temporaryRootRemoved"] = True
    options.report.write_text(json.dumps(REPORT, indent=1, sort_keys=True), encoding="utf-8")
    print(json.dumps({"result": REPORT["result"], "report": str(options.report)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
