"""Environment provider gate: one placement, end to end, through the product path.

Work Order 44's acceptance core. The claim under test is that a workspace's
placement - `local` on this machine, `ssh` on the experiment host - decides which
channel carries a turn, and that both placements run the *same* deployment
document, the *same* command, and the *same* product flow with nothing renamed,
nothing re-pathed, and nothing quietly moved to an easier machine.

The flow is the product's own: workspaces.open through placement resolution
(never a directly-constructed channel), one profile, one streaming round, one
attachment round that proves a workspace file was read on the machine the
workspace names, then capture and cleanup.

No model is called. The harness is the controlled ACP peer; the gate's report
separates that mechanism evidence from any real-model evidence (of which there
is none here) rather than letting one stand for the other.

usage: env-provider-gate.py --placement local|ssh [--report PATH] [--keep]
       [--worker-bundle DIR] [--ssh-host H] [--ssh-user U] [--ssh-workspace P]
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

REPO = Path(__file__).resolve().parents[2]
PLUGIN = REPO / "plugins" / "agent-box-harnesses"
PEER_SOURCE = "tests/harness_remote/fake_acp_peer.mjs"
SCRIPT = "scripts/server-round1/env-provider-gate.py"
NONCE = "ENV-PROVIDER-NONCE-44F3"

#: The one deployment document both placements run. It names no host path and
#: carries no placement: the harness source is plugin-relative (staged into the
#: reviewed bundle), the command is the guest's, and the workspace is supplied
#: per open by whoever asks for it.
DEPLOYMENT_DOCUMENT = {
    "schemaVersion": 1,
    "harnesses": [{
        "id": "pi",
        "capabilityClaims": {"stream": True, "attach": True, "native_continuation": True},
        "adapter": {"command": "/usr/bin/node", "args": [], "source": PEER_SOURCE},
        "timeoutMs": 60_000,
    }],
}

REPORT: dict = {"result": "ENV_PROVIDER_GATE_FAILED", "script": SCRIPT}


def fail(code: str, message: str) -> None:
    REPORT["result"] = "ENV_PROVIDER_GATE_FAILED"
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
        fail("ENV_PROVIDER_GATE_WIRE_REFUSED", f"{method}: {json.dumps(body['error'])}")
    return body["result"]


def wait_for_turn(runtime, session_id: str, index: int, state: str, timeout: float = 90.0):
    deadline = time.monotonic() + timeout
    session = None
    while time.monotonic() < deadline:
        session = runtime.repository.get_session(session_id)
        if session["turns"][index]["state"] == state:
            return settle_cleanup(runtime, session_id, index, timeout=timeout)
        time.sleep(0.05)
    fail("ENV_PROVIDER_GATE_TURN_TIMEOUT",
         f"turn {index} never reached {state}: {json.dumps(session['turns'][index]) if session else 'none'}")


def settle_cleanup(runtime, session_id: str, index: int, timeout: float = 30.0):
    """A terminal turn is not a closed one: wait, bounded, for the room's release.

    `completed` is durable before the channel tears its room down, so the cleanup
    fact has to be waited for rather than read at the same instant.
    """
    deadline = time.monotonic() + timeout
    session = runtime.repository.get_session(session_id)
    while time.monotonic() < deadline:
        session = runtime.repository.get_session(session_id)
        if session["turns"][index].get("cleanup_state") != "pending":
            return session
        time.sleep(0.05)
    return session


def summarize_turn(session: dict, index: int) -> dict:
    turn = session["turns"][index]
    deltas = [item for item in session["events"]
              if item.get("turn_id") == turn["id"] and item["kind"] == "message.delta"]
    terminal = [item for item in session["events"]
                if item.get("turn_id") == turn["id"] and item["kind"] == "turn.state"
                and item["data"].get("state") == "completed"]
    capture = [item for item in session["events"]
               if item.get("turn_id") == turn["id"] and item["kind"] == "turn.capture"]
    return {
        "turnId": turn["id"],
        "state": turn["state"],
        "deltas": len(deltas),
        "deltaTexts": [item["data"].get("text") for item in deltas],
        "deltaBeforeCompleted": bool(deltas and terminal and deltas[0]["seq"] < terminal[0]["seq"]),
        "captureState": turn.get("capture_state"),
        "cleanupState": turn.get("cleanup_state"),
        "captureEvents": [
            {"code": item["data"].get("error_code"), "files": item["data"].get("files")}
            for item in capture
        ],
    }


def leftover_local_rooms() -> list[str]:
    """Channel staging roots this gate's run should not have left behind."""
    return sorted(
        item.name for item in Path(tempfile.gettempdir()).iterdir()
        if item.name.startswith("agentbox-local-channel-")
    )


def ssh_remote(command: str) -> str:
    locator = os.environ["AGENT_BOX_SSH_IDENTITY_FILE"]
    result = subprocess.run(
        ["ssh", "-i", locator, "-o", "BatchMode=yes",
         f"{REPORT['ssh']['user']}@{REPORT['ssh']['host']}", command],
        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        timeout=60,
    )
    if result.returncode != 0:
        fail("ENV_PROVIDER_GATE_SSH_CLEANUP_CHECK_FAILED",
             result.stderr.decode("utf-8", "replace")[-400:])
    return result.stdout.decode("utf-8", "replace").strip()


def prepare_ssh_workspace() -> str:
    """One fresh workspace directory per run, on the machine the record names."""
    workspace = REPORT["ssh"]["workspace"]
    ssh_remote(f"rm -rf {workspace} && mkdir -p {workspace}")
    return workspace


def run_gate(options) -> dict:
    placement = options.placement
    REPORT["placement"] = placement
    REPORT["beforeRooms"] = sorted(leftover_local_rooms()) if placement == "local" else []
    temporary = Path(tempfile.mkdtemp(prefix=f"agentbox-{placement}-env-gate-"))
    REPORT["temporaryRoot"] = str(temporary)
    document_path = temporary / "deployment.json"
    document_bytes = json.dumps(DEPLOYMENT_DOCUMENT, sort_keys=True, indent=1).encode()
    document_path.write_bytes(document_bytes)
    REPORT["deploymentDocument"] = {
        "path": str(document_path),
        "sha256": sha256(document_bytes),
        "hostPaths": False,
        "note": "the same document runs both placements; placement is chosen per open",
    }

    if placement == "ssh":
        locator = os.environ.get("AGENT_BOX_SSH_IDENTITY_FILE")
        if not locator:
            fail("ENV_PROVIDER_GATE_IDENTITY_LOCATOR_UNSET",
                 "set AGENT_BOX_SSH_IDENTITY_FILE to the key locator; it is never an argument")
        manifest = os.environ.get("AGENT_BOX_SSH_WORKER_MANIFEST")
        if not manifest:
            fail("ENV_PROVIDER_GATE_WORKER_MANIFEST_UNSET",
                 "set AGENT_BOX_SSH_WORKER_MANIFEST to the pinned Worker manifest")
        REPORT["ssh"] = {
            "host": options.ssh_host,
            "user": options.ssh_user,
            "workspace": options.ssh_workspace,
            "remoteWorker": options.ssh_worker_remote_path,
            "identityLocator": locator,
            "identityPermissions": oct(os.stat(locator).st_mode & 0o777),
        }
        os.environ["AGENT_BOX_SSH_WORKER_REMOTE_PATH"] = options.ssh_worker_remote_path
        workspace = prepare_ssh_workspace()
    else:
        workspace = temporary / "project"
        workspace.mkdir()

    from agent_box.server.bootstrap import build_runtime_from_sidecar_deployment

    runtime = build_runtime_from_sidecar_deployment(
        temporary / "server", document_path, plugin_root=PLUGIN,
    )
    try:
        result = drive_product(runtime, placement, workspace, temporary)
    finally:
        runtime.stop()

    # Cleanup is part of the claim: nothing the channel staged may outlive it.
    # The check is a delta - roots that predate this run are not its residue.
    for name in ("roundOne", "roundTwo"):
        if result[name]["cleanupState"] != "cleaned":
            fail("ENV_PROVIDER_GATE_CLEANUP_UNCONFIRMED",
                 f"{name} ended with cleanup_state={result[name]['cleanupState']!r}")
    if placement == "local":
        after = set(leftover_local_rooms())
        before = set(REPORT["beforeRooms"])
        result["cleanup"] = {
            "leftoverLocalChannelRoots": sorted(after - before),
            "preexistingRootsIgnored": sorted(before),
            "workspaceFilesKept": sorted(item.name for item in workspace.iterdir()),
        }
        if result["cleanup"]["leftoverLocalChannelRoots"]:
            fail("ENV_PROVIDER_GATE_LOCAL_ROOM_LEFTOVER",
                 f"local channel staging roots remain: {result['cleanup']['leftoverLocalChannelRoots']}")
    else:
        deadline = time.monotonic() + 30
        files, processes = "waiting", "waiting"
        while time.monotonic() < deadline:
            # The root marker file is the Worker's own identity record, present
            # on every placement; views, secrets and results must be gone.
            files = ssh_remote(
                "find /tmp/agentbox-worker-r1 -type f ! -name .agentbox-worker-root 2>/dev/null | wc -l")
            # `-x` matches the process name only: a `-f` pattern would match
            # the very shell that runs this check. `pgrep -c` prints 0 and
            # exits 1 when none match, so `|| true` keeps the exit code honest
            # without printing a second count.
            processes = ssh_remote("pgrep -c -x agent-box-worker 2>/dev/null || true")
            if files in {"0", ""} and processes in {"0", ""}:
                break
            time.sleep(1)
        ssh_remote(f"rm -rf {workspace}")
        result["cleanup"] = {
            "remoteWorkerFiles": files,
            "remoteWorkerProcesses": processes,
            "remoteWorkspaceRemoved": ssh_remote(f"test -e {workspace} && echo present || echo removed"),
        }
        if result["cleanup"]["remoteWorkerProcesses"] not in {"0", ""}:
            fail("ENV_PROVIDER_GATE_REMOTE_WORKER_LEFTOVER",
                 f"worker processes remain on the remote host: {processes}")
        if files not in {"0", ""}:
            fail("ENV_PROVIDER_GATE_REMOTE_ROOT_LEFTOVER",
                 f"worker projection files remain on the remote host: {files}")

    result["model"] = {
        "mode": "no-model-fixture",
        "harness": "controlled ACP peer (fake_acp_peer.mjs)",
        "realModelRequests": 0,
        "endpoint": "none; the peer answers from a fixed script",
        "note": "mechanism evidence only; no real-model evidence is claimed by this gate",
    }
    result["cost"] = {"authorizedRealModelCalls": 0, "estimatedCny": 0}
    REPORT.update(result)
    REPORT["result"] = f"{'LOCAL' if placement == 'local' else 'SSH'}_ENV_GATE_OK"
    if not options.keep:
        shutil.rmtree(temporary, ignore_errors=True)
        REPORT["temporaryRootRemoved"] = True
    return REPORT


def drive_product(runtime, placement: str, workspace: Path, temporary: Path) -> dict:
    """The product flow: open by placement, profile, stream, attach, capture."""
    from agent_box.server.transport.http import create_app
    from fastapi.testclient import TestClient

    result: dict = {}
    environment = (
        {"kind": "local", "host": None, "user": None} if placement == "local"
        else {"kind": "ssh", "host": REPORT["ssh"]["host"], "user": REPORT["ssh"]["user"]}
    )
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        hello = wire_post(client, runtime.token, "server.hello", {
            "clientVersions": ["wire/1"], "clientPresentationSupports": [],
        })
        capabilities = {item["id"]: item for item in hello["capabilities"]}
        result["capability"] = {
            "workspacesOpen": capabilities["workspaces.open"],
            "sessionsSend": capabilities["sessions.send"],
        }

        opened = wire_post(client, runtime.token, "workspaces.open", {
            "requestId": "env-gate-open", "path": str(workspace),
            "environment": environment,
        })
        workspace_row = opened["workspace"]
        result["workspace"] = {
            "id": workspace_row["id"], "created": opened["created"],
            "environment": workspace_row["environment"],
            "normalizedPath": workspace_row["normalizedPath"],
        }
        if workspace_row["environment"]["kind"] != placement:
            fail("ENV_PROVIDER_GATE_PLACEMENT_NOT_RECORDED",
                 f"the record names {workspace_row['environment']}, not {placement}")
        if placement == "local" and workspace_row["environment"]["host"] is not None:
            fail("ENV_PROVIDER_GATE_LOCAL_HOST_INVENTED",
                 "a local workspace was recorded with a host")
        reopened = wire_post(client, runtime.token, "workspaces.open", {
            "requestId": "env-gate-reopen", "path": str(workspace),
            "environment": environment,
        })
        result["reopened"] = {
            "created": reopened["created"],
            "sameId": reopened["workspace"]["id"] == workspace_row["id"],
        }
        if not result["reopened"]["sameId"]:
            fail("ENV_PROVIDER_GATE_REOPEN_ID_CHANGED", "the same location opened twice as two workspaces")

        # The channel is the placement's, resolved by the product port factory -
        # this gate never constructs one, so what ran is what a client would get.
        result["placementResolution"] = resolve_for(runtime, workspace_row)

        # Browsing is part of every producer's contract, on the same path.
        browsed = wire_post(client, runtime.token, "workspaces.browse", {
            "requestId": "env-gate-browse", "path": str(workspace),
            "environment": environment,
        })
        result["browse"] = {"path": browsed["path"], "entries": len(browsed["entries"])}

        profile = client.post("/api/v1/profiles", headers={
            "Authorization": f"Bearer {runtime.token}", "Idempotency-Key": "env-gate-profile",
        }, json={"name": "Environment provider gate", "harness_type": "pi",
                 "configuration": {}, "credential_id": None})
        if profile.status_code != 201:
            fail("ENV_PROVIDER_GATE_PROFILE_REFUSED", profile.text[:400])
        profile_id = profile.json()["profile_id"]

        first = wire_post(client, runtime.token, "sessions.createAndSend", {
            "requestId": "env-gate-round-1", "workspaceId": workspace_row["id"],
            "profileId": profile_id, "overrides": [],
            "message": {"text": f"Remember {NONCE} and answer.", "attachments": []},
        })
        session = wait_for_turn(runtime, first["session"]["id"], 0, "completed")
        result["roundOne"] = summarize_turn(session, 0)
        if not result["roundOne"]["deltaBeforeCompleted"]:
            fail("ENV_PROVIDER_GATE_NO_STREAM", "no delta was observed before the turn completed")
        checkpoint = session["checkpoint"]
        result["checkpoint"] = None if checkpoint is None else {
            "nativeId": checkpoint["native_id"], "resumable": None,
        }
        if checkpoint is None:
            fail("ENV_PROVIDER_GATE_NO_CHECKPOINT", "the streaming round produced no checkpoint")
        stored = json.loads(runtime.objects.read(checkpoint["object_digest"]))
        result["checkpoint"]["resumable"] = stored.get("resumable")
        result["checkpoint"]["files"] = sorted(
            item["path"] for item in stored.get("files", []))

        # One workspace file, read on the machine the workspace names: the
        # attachment digest is the proof that the room saw these exact bytes. A
        # second Session keeps this round independent of any checkpoint restore,
        # so what it proves is the workspace binding, not continuity.
        note = f"{NONCE}\n"
        expected_digest = hashlib.sha256(note.encode()).hexdigest()
        if placement == "local":
            (workspace / "note.txt").write_text(note, encoding="utf-8")
        else:
            # The workspace lives on the remote host, so its file is written
            # there too - and the host's own digest of it is what must agree.
            encoded = base64.b64encode(note.encode()).decode()
            observed = ssh_remote(
                f"printf %s {encoded} | base64 -d > {workspace}/note.txt && sha256sum {workspace}/note.txt"
            ).split(" ", 1)[0]
            if observed != expected_digest:
                fail("ENV_PROVIDER_GATE_NOTE_NOT_WRITTEN",
                     f"the remote workspace file hashed to {observed}, not {expected_digest}")
        second = wire_post(client, runtime.token, "sessions.createAndSend", {
            "requestId": "env-gate-round-2", "workspaceId": workspace_row["id"],
            "profileId": profile_id, "overrides": [],
            "message": {"text": "read the note", "attachments": [{
                "ref": "note.txt", "displayName": "note.txt", "mediaKind": "image",
            }]},
        })
        session = wait_for_turn(runtime, second["session"]["id"], 0, "completed")
        result["roundTwo"] = summarize_turn(session, 0)
        if result["roundTwo"]["deltaTexts"] != [f"image:text/plain:{expected_digest}"]:
            fail("ENV_PROVIDER_GATE_WORKSPACE_BYTES_DIFFERED",
                 f"the room saw {result['roundTwo']['deltaTexts']}, not the workspace file")
        result["executionIds"] = [first["executionId"], second["executionId"]]
    return result


def resolve_for(runtime, workspace_row: dict) -> dict:
    """What the product's own resolution answers for this record - read, not used."""
    from agent_box.server.execution.placement import resolve_placement

    placement = resolve_placement(
        workspace_row["environment"]["kind"],
        has_connector=runtime.service.workspaces.connector is not None
        or runtime.service.workspaces.ssh_connector is not None,
    )
    return {"envKind": placement.kind, "channel": placement.channel}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--placement", required=True, choices=["local", "ssh"])
    parser.add_argument("--report", type=Path)
    parser.add_argument("--keep", action="store_true")
    parser.add_argument("--ssh-host", default="121.40.184.111")
    parser.add_argument("--ssh-user", default="root")
    parser.add_argument("--ssh-workspace",
                        default="/root/agentbox-env-gate/run")
    parser.add_argument("--ssh-worker-remote-path",
                        default="/root/agentbox-worker/agent-box-worker")
    options = parser.parse_args()

    if options.report is None:
        options.report = Path(f"docs/server-round1/fullstack/env-provider-gate-{options.placement}.json")
    options.report.parent.mkdir(parents=True, exist_ok=True)
    REPORT["reportPath"] = str(options.report)
    report = run_gate(options)
    options.report.write_text(json.dumps(report, indent=1, sort_keys=True), encoding="utf-8")
    print(json.dumps({"result": report["result"], "report": str(options.report)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
