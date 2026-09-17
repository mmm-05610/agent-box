#!/usr/bin/env python3
"""Runtime artifact projection gate: real Worker + bwrap, no model, no network.

Runs two gates over the production Server assembly:

  A. projection — a deployment declares one immutable dependency directory, the
     Worker verifies its tree digest inside the distribution, bwrap mounts it
     read-only at /runtime/artifacts/<name>, and an adapter launched inside the
     guest loads a module from it and reports the value that module exports.
  B. refusal   — the same declaration with a digest that does not match the
     tree must fail the turn with the typed reason, and must not invent a
     session.

This gate deliberately launches the release Worker inside WSL itself and speaks
the same ABW1 control frames: it does not go through the Windows Server to
`wsl.exe` path. Re-verifying the c4 Worker on the Windows platform is still
outstanding and is not claimed here. The fixture makes no network access
and no model request; this registers runtime artifact projection only, never a
Harness or model result.

    usage: runtime-artifact-gate.py [--worker PATH] [--json]
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
import time

REPO = Path(__file__).resolve().parents[2]
PROBE = REPO / "tests" / "server" / "fixtures" / "artifact_probe_acp_peer.mjs"
ARTIFACT_TARGET = "/runtime/artifacts/fixture-dep"
DEPENDENCY = "export const VALUE = 'runtime-artifact-fixed-value'\n"
SMOKE_DEPENDENCY = "export const VALUE = 'runtime-artifact-drifted'\n"


def fail(message: str) -> None:
    print(json.dumps({"result": "RUNTIME_ARTIFACT_GATE_FAILED", "reason": message}))
    raise SystemExit(1)


def artifact_tree(root: Path, dependency: str) -> tuple[Path, str]:
    from agent_box_sandbox_bwrap import runtime_artifact_tree_digest

    tree = root / "fixture-dep"
    (tree / "nested").mkdir(parents=True)
    (tree / "dep.mjs").write_text(dependency, encoding="utf-8")
    (tree / "nested" / "extra.txt").write_text("extra\n", encoding="utf-8")
    return tree, runtime_artifact_tree_digest(tree)


def wire_post(client, token: str, method: str, params: dict) -> dict:
    response = client.post(
        f"/wire/v1/{method}",
        headers={"Authorization": f"Bearer {token}"},
        json={"jsonrpc": "2.0", "id": method, "method": method, "params": params},
    )
    body = response.json()
    if "result" not in body:
        fail(f"{method} was refused: {json.dumps(body)}")
    return body["result"]


class DirectWorkerConnector:
    """Launches the reviewed Worker binary directly, as the WSL connector does."""

    def __init__(self, root: Path, worker: Path) -> None:
        self.root = root
        self.worker = worker

    def distributions(self):
        return [{"name": "Ubuntu"}]

    def probe(self, distribution, user):
        return {"probe_id": "probe", "distribution": distribution, "user": user}

    def browse(self, probe_id, path):
        return {"path": path, "directories": [], "files": []}

    def open_workspace(self, probe_id, path):
        return {"connection_id": "connection-artifact", "distribution": "Ubuntu",
                "user": os.environ["USER"], "path": str(REPO)}

    def client_for_workspace(self, **arguments):
        from agent_box_runtime_wsl import WorkerClient

        return WorkerClient(
            [str(self.worker), "--root", str(self.root / "worker-root"),
             "--workspace", str(REPO)],
            worker_digest="sha256:" + hashlib.sha256(self.worker.read_bytes()).hexdigest(),
            worker_version="0.1.0", connection_id=arguments["connection_id"],
            project_id=arguments["connection_id"], effective_user=os.environ["USER"],
            server_instance_id="server-artifact-gate",
            executable_authorizations=arguments.get("executable_authorizations", ()),
            runtime_artifact_authorizations=arguments.get(
                "runtime_artifact_authorizations", (),
            ),
        )


def assemble(tmp_path: Path, worker: Path, tree: Path, digest: str):
    import agent_box.server.bootstrap.runtime as runtime_module
    from agent_box.server.bootstrap import build_runtime_from_sidecar_deployment

    deployment = tmp_path / "deployment.json"
    deployment.write_text(json.dumps({
        "schemaVersion": 1,
        "harnesses": [{
            "id": "pi", "timeoutMs": 30_000,
            "runtimeArtifactMounts": [{
                "token": "artifact", "target": ARTIFACT_TARGET, "treeDigest": digest,
            }],
            "adapter": {
                "command": "/usr/bin/node", "args": [],
                "source": str(PROBE.relative_to(REPO)),
                "environment": {"FAKE_PEER_ARTIFACT": ARTIFACT_TARGET},
            },
        }],
    }), encoding="utf-8")
    runtime_module._builtin_connector = lambda _id: DirectWorkerConnector(tmp_path, worker)
    original = runtime_module._sidecar_deployment_file
    runtime_module._sidecar_deployment_file = (
        lambda root, relative: PROBE.read_bytes()
        if relative == str(PROBE.relative_to(REPO)) else original(root, relative)
    )
    return build_runtime_from_sidecar_deployment(
        tmp_path / "server", deployment, plugin_root=REPO / "plugins" / "agent-box-harnesses",
        mount_bindings={"artifact": str(tree)},
    )


def open_session(client, runtime, request_id: str, profile_key: str) -> dict:
    opened = wire_post(client, runtime.token, "workspaces.open", {
        "requestId": f"open-{request_id}", "path": str(REPO),
        "environment": {"kind": "wsl", "host": "Ubuntu", "user": os.environ["USER"]},
    })["workspace"]
    profile = client.post(
        "/api/v1/profiles",
        headers={"Authorization": f"Bearer {runtime.token}", "Idempotency-Key": profile_key},
        json={"name": profile_key, "harness_type": "pi", "configuration": {},
              "credential_id": None},
    ).json()
    return wire_post(client, runtime.token, "sessions.createAndSend", {
        "requestId": f"turn-{request_id}", "workspaceId": opened["id"],
        "profileId": profile["profile_id"], "overrides": [],
        "message": {"text": "load the projected dependency", "attachments": []},
    })


def settle(runtime, session_id: str, *, timeout: float = 60.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        session = runtime.repository.get_session(session_id)
        if session["turns"] and session["turns"][0]["state"] in {"completed", "failed", "cancelled"}:
            return session
        time.sleep(0.05)
    fail("the turn did not reach a terminal state in time")


def projection_gate(tmp_path: Path, worker: Path) -> dict:
    from agent_box.server.transport.http import create_app
    from agent_box_sandbox_bwrap import runtime_artifact_tree_digest
    from fastapi.testclient import TestClient

    tree, declared = artifact_tree(tmp_path / "artifacts", DEPENDENCY)
    runtime = assemble(tmp_path, worker, tree, declared)
    try:
        with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
            sent = open_session(client, runtime, "projection", "gate-projection")
            session = settle(runtime, sent["session"]["id"])
            if session["turns"][0]["state"] != "completed":
                fail(f"the projection turn did not complete: {session['turns'][0]}")
            delta = next(
                event for event in session["events"]
                if event.get("turn_id") == sent["executionId"] and event["kind"] == "message.delta"
            )
            facts = json.loads(delta["data"]["text"].removeprefix("artifact-probe:"))
            checks = {
                "guest_read_the_projected_dependency": facts["value"] == "runtime-artifact-fixed-value",
                "guest_write_was_refused": facts["writeBlocked"] is True,
                "guest_saw_the_whole_tree": sorted(facts["entries"]) == [
                    "dep.mjs", "nested", "nested/extra.txt",
                ],
                "guest_path_is_the_declared_target": facts["directory"] == ARTIFACT_TARGET,
                "host_tree_unchanged": runtime_artifact_tree_digest(tree) == declared,
                "no_write_left_behind": not (tree / "guest-write").exists(),
            }
            if not all(checks.values()):
                fail(f"a projection check failed: {json.dumps(checks)}")
            return {"facts": facts, "checks": checks, "declared": declared}
    finally:
        runtime.stop()


def refusal_gate(tmp_path: Path, worker: Path) -> dict:
    from agent_box.server.transport.http import create_app
    from fastapi.testclient import TestClient

    tree, _real = artifact_tree(tmp_path / "artifacts", DEPENDENCY)
    _other, drifted = artifact_tree(tmp_path / "other", SMOKE_DEPENDENCY)
    if drifted == _real:
        fail("the refusal fixture must declare a different digest")
    runtime = assemble(tmp_path, worker, tree, drifted)
    try:
        with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
            sent = open_session(client, runtime, "refusal", "gate-refusal")
            session = settle(runtime, sent["session"]["id"], timeout=30)
            reasons = []
            with runtime.database.read() as conn:
                for row in conn.execute(
                    "SELECT data_json FROM core_events WHERE type=?",
                    ("ExecutionDispatchAmbiguous",),
                ):
                    reasons.append(json.loads(row["data_json"]).get("error", ""))
            checks = {
                "turn_failed": session["turns"][0]["state"] == "failed",
                "typed_reason_recorded": any(
                    "RUNTIME_ARTIFACT_DIGEST_MISMATCH" in reason for reason in reasons
                ),
                "no_session_invented": session["checkpoint"] is None,
                "no_delta_emitted": not any(
                    event["kind"] == "message.delta" for event in session["events"]
                ),
            }
            if not all(checks.values()):
                fail(f"a refusal check failed: {json.dumps(checks)} reasons={reasons}")
            return {"checks": checks, "reasons": reasons}
    finally:
        runtime.stop()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker", default=None)
    parser.add_argument("--json", action="store_true")
    arguments = parser.parse_args()
    if not arguments.worker:
        bundles = sorted(
            p.name for p in (REPO / "workers" / "agent-box-worker").glob(".acceptance-bundle-*")
        )
        fail("GATE_WORKER_REQUIRED: pass --worker <agent-box-worker binary>; "
             "bundles on disk: " + ", ".join(bundles))
    worker = Path(arguments.worker).resolve()
    if not worker.is_file():
        fail(f"the Worker binary is unavailable: {worker}")
    if not shutil.which("bwrap"):
        fail("bubblewrap is unavailable")
    if not PROBE.is_file():
        fail(f"the probe fixture is unavailable: {PROBE}")
    worker_digest = "sha256:" + hashlib.sha256(worker.read_bytes()).hexdigest()
    temporary = Path(tempfile.mkdtemp(prefix="agentbox-artifact-gate-"))
    report: dict = {"result": "RUNTIME_ARTIFACT_PROJECTION_GATE_OK",
                    "worker": {"path": str(worker), "digest": worker_digest},
                    "target": ARTIFACT_TARGET, "gates": {}}
    try:
        report["gates"]["projection"] = projection_gate(temporary / "projection", worker)
        report["gates"]["refusal"] = refusal_gate(temporary / "refusal", worker)
        for name in ("views", "secrets"):
            for root in (temporary / "projection", temporary / "refusal"):
                if (root / "worker-root" / name).exists():
                    fail(f"the Worker left a {name} projection behind")
        report["worker_left_no_projection"] = True
    finally:
        shutil.rmtree(temporary, ignore_errors=True)
    print(json.dumps(report, indent=2 if arguments.json else None, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
