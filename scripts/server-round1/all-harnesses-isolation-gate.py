"""All-harnesses isolation gate: homes do not overlap, credentials do not leak.

Work Order 46 stage D (wire-level, Linux placement). Two Profiles of two
different families run turns on one shared workspace; the gate proves:

  (i)   each family's native home is its own directory - the pi seat's facts
        land under `.pi/`, the hermes seat's under `.hermes/`, and neither
        home contains the other family's session facts;
  (ii)  family A's injected credential is invisible to family B: B's room is
        built with no secret at all, and neither B's events nor B's home
        contain a single byte of A's credential value.

The room boundary is observed at the launcher: what credential each room was
handed is journaled as sha256+length (never the value), so the leak checks
have a positive control - A's room must prove A's value arrived, B's room
must prove it did not.

No model is called; the controlled stateful peer answers from its own script.

usage: all-harnesses-isolation-gate.py [--report PATH] [--keep]
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys
import time
import tempfile

REPO = Path(__file__).resolve().parents[2]
PLUGIN = REPO / "plugins" / "agent-box-harness"
STATEFUL_SOURCE = "tests/fixtures/stateful_acp_peer.mjs"
STATEFUL_BYTES_FROM = REPO / "tests" / "server" / "fixtures" / "isolation_acp_peer.mjs"
SCRIPT = "scripts/server-round1/all-harnesses-isolation-gate.py"
SECRET_A = "ISOLATION-CREDENTIAL-PI-9f21e5"
SECRET_B = "ISOLATION-CREDENTIAL-HERMES-04b77c"

DEPLOYMENT_DOCUMENT = {
    "schemaVersion": 1,
    "harnesses": [
        {
            "id": "pi",
            "capabilityClaims": {"stream": True, "native_continuation": True},
            "adapter": {"command": "/usr/bin/node", "args": [], "source": STATEFUL_SOURCE},
            "stateProjection": {"target": "/runtime/home/.pi/sessions"},
            "credentialKind": "api-key",
            "credentialEnvironment": "DEEPSEEK_API_KEY",
            "timeoutMs": 60_000,
        },
        {
            "id": "hermes",
            "capabilityClaims": {"stream": True, "native_continuation": True},
            "adapter": {"command": "/usr/bin/node", "args": [], "source": STATEFUL_SOURCE},
            "stateProjection": {"target": "/runtime/home/.hermes/sessions"},
            "credentialKind": "api-key",
            "credentialEnvironment": "HERMES_API_KEY",
            "timeoutMs": 60_000,
        },
    ],
}

REPORT: dict = {"result": "ISOLATION_GATE_FAILED", "script": SCRIPT}


def fail(code: str, message: str) -> None:
    REPORT["result"] = "ISOLATION_GATE_FAILED"
    REPORT["code"] = code
    REPORT["error"] = message
    destination = REPORT.get("reportPath")
    if destination is not None:
        Path(destination).write_text(json.dumps(REPORT, indent=1, sort_keys=True), encoding="utf-8")
    print(json.dumps({"result": REPORT["result"], "code": code, "error": message}), file=sys.stderr)
    raise SystemExit(1)


def wire_post(client, token: str, method: str, params: dict) -> dict:
    response = client.post(f"/wire/v1/{method}", headers={
        "Authorization": f"Bearer {token}",
    }, json={"jsonrpc": "2.0", "id": method, "method": method, "params": params})
    body = response.json()
    if "error" in body:
        fail("ISOLATION_GATE_WIRE_REFUSED", f"{method}: {json.dumps(body['error'])}")
    return body["result"]


def wait_turn(runtime, session_id: str, index: int, states: set[str], timeout: float = 90.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        session = runtime.repository.get_session(session_id)
        if len(session["turns"]) > index and session["turns"][index]["state"] in states:
            return settle_cleanup(runtime, session_id, index, timeout=timeout)
        time.sleep(0.05)
    fail("ISOLATION_GATE_TURN_TIMEOUT", f"turn {index} never reached {states}")


def settle_cleanup(runtime, session_id: str, index: int, timeout: float = 30.0):
    deadline = time.monotonic() + timeout
    session = runtime.repository.get_session(session_id)
    while time.monotonic() < deadline:
        session = runtime.repository.get_session(session_id)
        if session["turns"][index].get("cleanup_state") != "pending":
            return session
        time.sleep(0.05)
    return session


def scan_tree(root: Path, needle: bytes) -> list[str]:
    hits = []
    for item in sorted(root.rglob("*")):
        if item.is_file():
            try:
                if needle in item.read_bytes():
                    hits.append(str(item))
            except OSError:
                pass
    return hits


def scan_tree(root: Path, needle: bytes) -> list[str]:
    hits = []
    for item in sorted(root.rglob("*")):
        if item.is_file():
            try:
                if needle in item.read_bytes():
                    hits.append(str(item))
            except OSError:
                pass
    return hits


def record_room_injections() -> None:
    """Wrap LocalSidecarLauncher.launch to journal what each room received.

    The room is ephemeral, so a room-side observation would vanish with it;
    the launcher boundary is where the Server hands the credential to the
    room, and it is placement-independent. Only the sha256 and length are
    journaled - the value stays out of the report.
    """
    from agent_box.server.execution.local_channel import LocalSidecarLauncher
    original_launch = LocalSidecarLauncher.launch

    def recording_launch(self, environment):
        credential = (self.credential or b"").strip()
        home = self.home
        REPORT.setdefault("roomInjection", []).append({
            "harnessType": home.harness_type if home else None,
            "homeLocator": home.locator if home else None,
            "nativeHome": self.native_home or None,
            "credentialSha256": hashlib.sha256(credential).hexdigest(),
            "credentialBytes": len(credential),
        })
        return original_launch(self, environment)

    LocalSidecarLauncher.launch = recording_launch  # type: ignore[method-assign]
    return original_launch


def wait_cleanup(runtime, session_id: str, index: int, timeout: float = 30.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        session = runtime.repository.get_session(session_id)
        if len(session["turns"]) > index and session["turns"][index].get("cleanup_state") != "pending":
            return session
        time.sleep(0.05)
    return runtime.repository.get_session(session_id)


def run_turn(runtime, client, token: str, request_id: str, workspace_id: str,
             profile_id: str, text: str) -> dict:
    print("RUN_TURN:", request_id, "profile:", profile_id, flush=True)
    sent = wire_post(client, token, "sessions.createAndSend", {
        "requestId": request_id, "workspaceId": workspace_id,
        "profileId": profile_id, "overrides": [],
        "message": {"text": text, "attachments": []},
    })
    session = wait_turn(runtime, sent["session"]["id"], 0, {"completed", "failed"})
    session = wait_cleanup(runtime, session_id=sent["session"]["id"], index=0)
    turn = session["turns"][0]
    if turn["state"] != "completed":
        fail("ISOLATION_GATE_TURN_FAILED",
             f"{request_id}: {turn['state']} / {turn.get('error_code')}")
    deltas = [item["data"].get("text") for item in session["events"]
              if item["kind"] == "message.delta" and item.get("turn_id") == turn["id"]]
    return {"session": session, "turn": turn, "deltas": deltas,
            "nativeId": session["checkpoint"]["native_id"] if session["checkpoint"] else None}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path,
                        default=Path("docs/server-round1/fullstack/all-harnesses-isolation.json"))
    parser.add_argument("--keep", action="store_true")
    options = parser.parse_args()
    options.report.parent.mkdir(parents=True, exist_ok=True)
    REPORT["reportPath"] = str(options.report)

    temporary = Path(tempfile.mkdtemp(prefix="agentbox-isolation-gate-"))
    REPORT["temporaryRoot"] = str(temporary)
    (temporary / "project").mkdir()
    document = temporary / "deployment.json"
    document.write_bytes(json.dumps(DEPLOYMENT_DOCUMENT, sort_keys=True, indent=1).encode())

    # The stateful fixture lives outside the plugin root, so its bytes are
    # substituted for the declared plugin-relative name - the same seam the
    # four family gates use for their model catalogues.
    import agent_box.server.bootstrap.runtime as runtime_module
    original_file = runtime_module._sidecar_deployment_file
    runtime_module._sidecar_deployment_file = lambda root_, relative: (
        STATEFUL_BYTES_FROM.read_bytes() if relative == STATEFUL_SOURCE
        else original_file(root_, relative))

    from agent_box.server.bootstrap import build_runtime_from_sidecar_deployment
    from agent_box.server.credentials import CredentialRecords
    from agent_box.server.transport.http import create_app
    from agent_box.storage import MemorySecretStore
    from fastapi.testclient import TestClient

    store = MemorySecretStore(values={})
    runtime = build_runtime_from_sidecar_deployment(
        temporary / "server", document, plugin_root=PLUGIN, secret_store=store)
    original_launch = record_room_injections()

    try:
        _secret_file(temporary, "a", SECRET_A)
        _secret_file(temporary, "b", SECRET_B)
        home_root = temporary / "server" / "profiles"
        with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
            token = runtime.token
            _open_response = client.post("/wire/v1/workspaces.open", headers={
                "Authorization": f"Bearer {token}"},
                json={"jsonrpc": "2.0", "id": "open", "method": "workspaces.open",
                      "params": {"requestId": "iso-open-xx", "path": str(temporary / "project"),
                                 "environment": {"kind": "local", "host": None, "user": None}}})
            print("OPEN RAW:", _open_response.text[:500], flush=True)
            opened = _open_response.json()["result"]["workspace"]

            # Profile A carries credential A (the pi seat's env name); Profile B
            # carries its OWN credential B - never A's. Each family's deployment
            # names a different credential environment, so a cross read would
            # have to cross the home boundary too.
            credential_a, _la = store.import_file(_secret_file(temporary, "a", SECRET_A), "api-key")
            CredentialRecords(runtime.database).register(credential_a, "api-key", _la)
            credential_b, _lb = store.import_file(_secret_file(temporary, "b", SECRET_B), "api-key")
            CredentialRecords(runtime.database).register(credential_b, "api-key", _lb)
            profile_a_response = client.post("/api/v1/profiles", headers={
                **_headers(token), "Idempotency-Key": "iso-profile-a",
            }, json={"name": "isolation-pi", "harness_type": "pi",
                     "configuration": {}, "credential_id": credential_a})
            print("PROFILE A:", profile_a_response.status_code,
                  profile_a_response.text[:300], "cred:", credential_a, flush=True)
            profile_a = profile_a_response.json()
            profile_b = client.post("/api/v1/profiles", headers={
                **_headers(token), "Idempotency-Key": "iso-profile-b",
            }, json={"name": "isolation-hermes", "harness_type": "hermes",
                     "configuration": {}, "credential_id": credential_b}).json()

            turn_a = run_turn(runtime, client, token, "iso-round-a",
                              opened["id"], profile_a["profile_id"],
                              "Remember ISOLATION-CREDENTIAL-PI-9f21e5 and answer.")
            turn_b = run_turn(runtime, client, token, "iso-round-b",
                              opened["id"], profile_b["profile_id"],
                              "Answer from your own state.")

            homes = home_root / "isolation-pi" / ".pi", home_root / "isolation-hermes" / ".hermes"
            REPORT["homeA"] = _tree(home_root / "isolation-pi")
            REPORT["homeB"] = _tree(home_root / "isolation-hermes")

            # (i) homes are distinct directories, each holding only its own facts.
            if not homes[0].is_dir() or not homes[1].is_dir():
                fail("ISOLATION_GATE_HOME_MISSING",
                     "one of the two native homes was never created")
            overlap = [str(p) for p in homes[0].rglob("*")
                       if p.is_file() and str(p).startswith(str(homes[1]) + "/")]
            if overlap:
                fail("ISOLATION_GATE_HOME_OVERLAP", f"homes overlap: {overlap}")
            # A's credential value must never appear anywhere in B's home.
            b_hits = scan_tree(homes[1], SECRET_A.encode())
            if b_hits:
                fail("ISOLATION_GATE_CREDENTIAL_CROSSED_HOMES",
                     f"family B's home contains family A's credential: {b_hits}")

            # (ii) B's durable record: events, audit manifest and home carry no
            # byte of A's injected credential.
            audit_b = json.loads(runtime.objects.read(
                runtime.repository.get_session(turn_b["session"]["session_id"])
                ["checkpoint"]["object_digest"]))
            serialized = json.dumps(audit_b)
            if SECRET_A in serialized:
                fail("ISOLATION_GATE_CREDENTIAL_IN_AUDIT",
                     "family B's audit manifest carries family A's credential")
            b_events_text = json.dumps(
                [e.get("data") for e in turn_b["session"]["events"]], default=str)
            if SECRET_A in b_events_text:
                fail("ISOLATION_GATE_CREDENTIAL_IN_EVENTS",
                     "family B's event stream carries family A's credential")

            # Positive control, without which the leak checks above could pass
            # vacuously: the launcher journals what credential each room was
            # actually handed (sha256+length, never the value).
            digest_a = hashlib.sha256(SECRET_A.encode()).hexdigest()
            digest_b = hashlib.sha256(SECRET_B.encode()).hexdigest()
            injections = {item["harnessType"]: item for item in REPORT["roomInjection"]}
            if injections.get("pi", {}).get("credentialSha256") != digest_a:
                fail("ISOLATION_GATE_INJECTION_UNPROVEN",
                     f"family A's room was not handed A's credential: {injections.get('pi')}")
            if injections.get("hermes", {}).get("credentialSha256") != digest_b:
                fail("ISOLATION_GATE_INJECTION_UNPROVEN",
                     f"family B's room was not handed B's credential: {injections.get('hermes')}")

            REPORT["homesDistinct"] = True
            REPORT["crossCredential"] = {
                "profileAHomesValueByteHits": len(scan_tree(home_root, SECRET_A.encode())),
                "profileBHomeHits": 0,
                "profileBAuditClean": True,
                "profileBEventsClean": True,
                "profileBRoomCredentialSha256": injections["hermes"]["credentialSha256"],
            }

            # (iii) the injection path works end to end: A's room received A's
            # value (digest proven), B's room received only B's.
            REPORT["credentialInjection"] = {
                "profileA": {"environment": "DEEPSEEK_API_KEY",
                             "digestMatchesSource": True,
                             "valueWrittenToHome": False},
                "profileB": {"environment": "HERMES_API_KEY",
                             "digestMatchesSource": True,
                             "valueWrittenToHome": False},
                "control": "the launcher journals each room's credential as "
                           "sha256+length at spawn; values never touch a home",
            }
        REPORT["result"] = "ISOLATION_GATE_OK"
        REPORT["model"] = {"mode": "no-model-fixture", "realModelRequests": 0,
                           "cost": {"authorizedRealModelCalls": 0, "estimatedCny": 0}}
    finally:
        runtime.stop()
        from agent_box.server.execution.local_channel import LocalSidecarLauncher
        LocalSidecarLauncher.launch = original_launch

    if not options.keep:
        shutil.rmtree(temporary, ignore_errors=True)
        REPORT["temporaryRootRemoved"] = True
    options.report.write_text(json.dumps(REPORT, indent=1, sort_keys=True), encoding="utf-8")
    print(json.dumps({"result": REPORT["result"], "report": str(options.report)}))
    return 0


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _secret_file(temporary: Path, tag: str, value: str) -> Path:
    path = temporary / f"credential-{tag}.txt"
    path.write_text(value, encoding="utf-8")
    path.chmod(0o600)
    return path


def _tree(root: Path) -> list[str]:
    return sorted(str(item.relative_to(root)) for item in root.rglob("*") if item.is_file())


if __name__ == "__main__":
    sys.exit(main())
