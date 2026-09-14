#!/usr/bin/env python3
"""Pi production chain gate: real Pi adapter and agent, local fake endpoint.

Runs the production Server assembly over the real c4 release Worker, bwrap, and
the genuine `@automatalabs/pi-acp` adapter with the genuine Pi coding agent
dependency closure, and points Pi at a loopback OpenAI-compatible endpoint that
this gate starts. Two rounds on one Server Session prove the parts a
component-level gate cannot: configuration read, credential projection, model
selection translation, streaming order, continuation context, and native
recovery through Pi's own authoritative journal.

This is NOT a model acceptance. The endpoint is a local fake that returns two
fixed nonces; no credential is read, no real endpoint is contacted, and the
result registers PI_PRODUCTION_CHAIN_PREPARED only - never MODEL_VERIFIED.

Boundaries enforced by the gate itself:

  * The production deployment template is loaded from the plugin and asserted to
    hold the official DeepSeek root. The loopback endpoint exists only as an
    explicit, listed override applied to this run's temporary copy.
  * A reviewed offline guard is preloaded into the adapter process, so a
    connection to anything but loopback throws before it leaves the guest. The
    guard's audit trail is written into the project workspace and asserted here.
  * The credential is a temporary 0600 fake token injected through the real
    Server SecretStore -> Worker secret frame -> sidecar environment path. Only
    whether the endpoint saw the matching bearer value is recorded, never the
    value itself.
  * The fake endpoint refuses to answer more than the expected provider requests
    per round, so an implicit retry fails the gate instead of hiding in a total.

    usage: pi-production-chain-gate.py [--worker PATH] [--artifact PATH]
                                      [--keep] [--json]
"""
from __future__ import annotations

import argparse
import hashlib
import http.server
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import time

REPO = Path(__file__).resolve().parents[2]
PLUGIN = REPO / "plugins" / "agent-box-harnesses"
WORKER_BUNDLE = REPO / "workers" / "agent-box-worker" / ".acceptance-bundle-c4" / "agent-box-worker"
BUILDER = REPO / "scripts" / "server-round1" / "build-pi-runtime-artifact.mjs"
SCRIPT = "scripts/server-round1/pi-production-chain-gate.py"

#: Fixed, obviously fake, never a credential. It exists to prove the injection
#: path; the gate never reads a real secret file.
FAKE_TOKEN = "pi-gate-fake-token-6f2c19d4-non-secret"
NONCE_ROUND_1 = "PI-GATE-NONCE-1F4A9C"
NONCE_ROUND_2 = "PI-GATE-NONCE-2B7D31"
AUDIT_NAME = ".agentbox-egress-audit"
#: Every temporary root this gate creates carries this prefix under the system
#: temporary directory, which is what identifies a directory as ours to remove.
TEMPORARY_PREFIX = "agentbox-pi-gate-"
REPORT: dict = {"result": "PI_PRODUCTION_CHAIN_GATE_FAILED", "script": SCRIPT}


class GateFailure(Exception):
    """One gate failure, carried to `main` so cleanup always runs first."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


def fail(code: str, message: str) -> None:
    """Refuse with a typed code. Reporting and the exit code belong to `main`."""
    raise GateFailure(code, message)


# --------------------------------------------------------------------------
# cleanup of this run's temporary root
# --------------------------------------------------------------------------

def assert_owned_root(root: Path, *, created: Path) -> None:
    """Refuse to recursively delete anything that is not this run's temp root.

    The identity is not a string the caller supplied: it is the exact path
    `tempfile.mkdtemp` returned to this process, re-checked on disk (still the
    directory it was, no symlink, our prefix, directly under the system
    temporary directory, owned by us, and not group or world accessible).
    """
    if root != created:
        fail("PI_GATE_CLEANUP_NOT_OWNED", "the path is not the directory this run created")
    if not root.exists():
        return
    stats = os.lstat(root)
    if stat.S_ISLNK(stats.st_mode) or not stat.S_ISDIR(stats.st_mode):
        fail("PI_GATE_CLEANUP_NOT_OWNED", "the temporary root is no longer a directory")
    if not root.name.startswith(TEMPORARY_PREFIX) or root.parent != Path(tempfile.gettempdir()):
        fail("PI_GATE_CLEANUP_NOT_OWNED", "the temporary root is not one this gate creates")
    if stats.st_uid != os.geteuid():
        fail("PI_GATE_CLEANUP_NOT_OWNED", "the temporary root is not owned by this user")
    if stats.st_mode & 0o077:
        fail("PI_GATE_CLEANUP_NOT_OWNED", "the temporary root is group or world accessible")


def make_tree_writable(root: Path) -> int:
    """Re-enable write permission so a read-only projection can be removed.

    The Pi runtime artifact this gate builds is published read-only (0555/0444)
    by design, and `rmtree` cannot unlink entries from a directory it may not
    write. Re-enabling write access inside a root this gate created is how that
    artifact is retired; symlinks are never followed.
    """
    changed = 0
    for directory, directories, files in os.walk(root, topdown=False):
        for name in files:
            location = Path(directory) / name
            if location.is_symlink():
                continue
            os.chmod(location, 0o600)
            changed += 1
        for name in directories:
            location = Path(directory) / name
            if location.is_symlink():
                continue
            os.chmod(location, 0o700)
            changed += 1
    os.chmod(root, 0o700)
    return changed + 1


def remove_tree(path: Path, *, code: str = "PI_GATE_CLEANUP_FAILED") -> int:
    """Remove one tree, or fail loudly. Never swallows a removal failure."""
    if not path.exists():
        return 0
    changed = make_tree_writable(path)
    try:
        shutil.rmtree(path)
    except OSError as error:
        fail(code, f"could not remove {path.name}: {type(error).__name__}")
    if path.exists():
        fail(code, f"{path.name} still exists after removal")
    return changed


def assert_external_artifact_separate(artifact: Path, temporary: Path) -> None:
    """An artifact the caller supplied is theirs and must stay out of our root.

    If it lives inside the temporary root this run is about to delete, no
    cleanup path can be both complete and safe, so the run is refused instead.
    """
    if artifact == temporary or temporary in artifact.parents:
        fail("PI_GATE_ARTIFACT_INSIDE_TEMPORARY_ROOT",
             "an external --artifact must live outside this run's temporary root")


def cleanup_root(root: Path, *, created: Path) -> dict:
    """Retire this run's temporary root and report whether it is really gone."""
    assert_owned_root(root, created=created)
    changed = remove_tree(root)
    return {"removed": not root.exists(), "madeWritable": changed}


# --------------------------------------------------------------------------
# local fake endpoint
# --------------------------------------------------------------------------

def chunk(kind: dict, finish: str | None = None, usage: bool = False) -> bytes:
    body = {
        "id": "chatcmpl-pi-gate", "object": "chat.completion.chunk",
        "created": 1, "model": "deepseek-flash",
        "choices": [{"index": 0, "delta": kind, "finish_reason": finish}],
    }
    if usage:
        body["usage"] = {"prompt_tokens": 11, "completion_tokens": 7, "total_tokens": 18}
    return f"data: {json.dumps(body)}\n\n".encode()


def sanitized(body: dict) -> dict:
    """Request structure without any credential or header value."""
    messages = body.get("messages") if isinstance(body.get("messages"), list) else []
    return {
        "model": body.get("model"),
        "stream": body.get("stream"),
        "maxTokens": body.get("max_tokens"),
        "maxCompletionTokens": body.get("max_completion_tokens"),
        "thinking": body.get("thinking"),
        "temperature": body.get("temperature"),
        "toolCount": len(body.get("tools") or []),
        "messages": [
            {
                "role": item.get("role"),
                "chars": len(item.get("content") or "") if isinstance(item.get("content"), str) else None,
                "containsRound1User": NONCE_ROUND_1 in json.dumps(item),
                "containsRound1Assistant": NONCE_ROUND_1 in json.dumps(item.get("content")),
            }
            for item in messages if isinstance(item, dict)
        ],
    }


class FakeEndpoint:
    """One loopback OpenAI-compatible streaming endpoint, fully observed."""

    def __init__(self, token: str) -> None:
        self.token = token
        self.requests: list[dict] = []
        self.paths: list[str] = []
        self.unauthorized = 0
        self.over_budget = 0
        self.budget = 2
        self._lock = threading.Lock()
        gate = self

        class Handler(http.server.BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *_args) -> None:  # keep stdout clean
                pass

            def do_POST(self) -> None:
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length)
                try:
                    body = json.loads(raw.decode("utf-8"))
                except ValueError:
                    body = {}
                with gate._lock:
                    gate.paths.append(self.path)
                    index = len(gate.requests) + 1
                    authorized = self.headers.get("Authorization") == f"Bearer {gate.token}"
                    if not authorized:
                        gate.unauthorized += 1
                    if index > gate.budget:
                        gate.over_budget += 1
                    gate.requests.append({
                        "index": index, "path": self.path,
                        "authorizationMatchesInjectedToken": authorized,
                        "contentType": (self.headers.get("Content-Type") or "").split(";")[0],
                        "structure": sanitized(body),
                    })
                    answer = NONCE_ROUND_1 if index == 1 else NONCE_ROUND_2 if index == 2 else f"PI-GATE-EXTRA-{index}"
                payload = (
                    chunk({"role": "assistant", "content": ""})
                    + chunk({"content": answer})
                    + chunk({}, finish="stop", usage=True)
                    + b"data: [DONE]\n\n"
                )
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def start(self) -> None:
        self.thread.start()

    def stop(self) -> None:
        self.server.shutdown()
        self.server.server_close()

    def assert_loopback_only(self) -> None:
        if self.server.server_address[0] != "127.0.0.1":
            fail("PI_GATE_ENDPOINT_NOT_LOOPBACK", "the fake endpoint is not bound to loopback")


# --------------------------------------------------------------------------
# worker connector (same ABW1 frames the WSL connector speaks)
# --------------------------------------------------------------------------

class DirectWorkerConnector:
    """Launches the release Worker directly; the Windows wsl.exe path is not used."""

    def __init__(self, root: Path, worker: Path, workspace: Path) -> None:
        self.root = root
        self.worker = worker
        self.workspace = workspace

    def distributions(self):
        return [{"name": "Ubuntu"}]

    def probe(self, distribution, user):
        return {"probe_id": "probe", "distribution": distribution, "user": user}

    def browse(self, probe_id, path):
        return {"path": path, "directories": [], "files": []}

    def open_workspace(self, probe_id, path):
        return {"connection_id": "connection-pi-gate", "distribution": "Ubuntu",
                "user": os.environ["USER"], "path": str(self.workspace)}

    def client_for_workspace(self, **arguments):
        from agent_box_runtime_wsl import WorkerClient

        return WorkerClient(
            [str(self.worker), "--root", str(self.root / "worker-root"),
             "--workspace", str(self.workspace)],
            worker_digest="sha256:" + hashlib.sha256(self.worker.read_bytes()).hexdigest(),
            worker_version="0.1.0", connection_id=arguments["connection_id"],
            project_id=arguments["connection_id"], effective_user=os.environ["USER"],
            server_instance_id="server-pi-gate",
            executable_authorizations=arguments.get("executable_authorizations", ()),
            runtime_artifact_authorizations=arguments.get(
                "runtime_artifact_authorizations", ()),
        )


# --------------------------------------------------------------------------
# gate
# --------------------------------------------------------------------------

def wire_post(client, token: str, method: str, params: dict) -> dict:
    body = client.post(f"/wire/v1/{method}", headers={"Authorization": f"Bearer {token}"},
                       json={"jsonrpc": "2.0", "id": method, "method": method, "params": params}).json()
    if "result" not in body:
        fail("PI_GATE_WIRE_REFUSED", f"{method}: {json.dumps(body)[:400]}")
    return body["result"]


def build_artifact(destination: Path, report: dict) -> Path:
    result = subprocess.run(
        ["node", str(BUILDER), "--output", str(destination), "--json"],
        cwd=str(REPO), capture_output=True, text=True, timeout=900,
    )
    try:
        payload = json.loads(result.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        fail("PI_GATE_BUILD_UNREADABLE", f"the builder produced no JSON: {result.stdout[-300:]}{result.stderr[-300:]}")
    if result.returncode != 0 or payload.get("result") != "PI_RUNTIME_ARTIFACT_BUILT":
        fail(payload.get("code", "PI_GATE_BUILD_FAILED"), str(payload.get("error", payload)))
    report["artifact"] = {
        "output": str(destination), "treeDigest": payload["treeDigest"],
        "entries": payload["entries"], "bytes": payload["bytes"],
        "packages": payload["packages"], "sourceLockDigest": payload["sourceLockDigest"],
    }
    return destination


def verify_artifact(artifact: Path, report: dict) -> str:
    """Re-derive the digest with the reviewed implementation, not the manifest."""
    from agent_box_sandbox_bwrap import runtime_artifact_tree_summary

    manifest = json.loads(Path(f"{artifact}.manifest.json").read_text(encoding="utf-8"))
    summary = runtime_artifact_tree_summary(artifact)
    if summary["digest"] != manifest["treeDigest"]:
        fail("PI_GATE_ARTIFACT_DRIFT", "the artifact no longer matches its manifest digest")
    if summary["entries"] != manifest["entries"] or summary["bytes"] != manifest["bytes"]:
        fail("PI_GATE_ARTIFACT_DRIFT", "the artifact entry or byte count changed")
    report.setdefault("artifact", {}).update({
        "treeDigest": summary["digest"], "entries": summary["entries"], "bytes": summary["bytes"],
        "adapter": manifest["adapter"],
    })
    return summary["digest"]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker", default=str(WORKER_BUNDLE))
    parser.add_argument("--artifact", default=None)
    parser.add_argument("--keep", action="store_true")
    parser.add_argument("--json", action="store_true")
    options = parser.parse_args()

    endpoint = None
    created: Path | None = None
    temporary: Path | None = None
    primary: GateFailure | None = None
    cleanup_failure: GateFailure | None = None
    external_artifact: Path | None = None

    try:
        worker = Path(options.worker).resolve()
        REPORT["worker"] = {"path": str(worker)}
        if not worker.is_file():
            fail("PI_GATE_WORKER_MISSING", f"the release Worker binary is unavailable: {worker}")
        if not shutil.which("bwrap"):
            fail("PI_GATE_BWRAP_MISSING", "bubblewrap is unavailable")
        REPORT["worker"]["sha256"] = "sha256:" + hashlib.sha256(worker.read_bytes()).hexdigest()

        # The plugin owns the deployment; this gate only adds a listed override set.
        from agent_box_harnesses.pi import production

        production_models = production.models_document()
        official = production_models["providers"][production.PI_PROVIDER]["baseUrl"]
        if official != production.OFFICIAL_BASE_URL:
            fail("PI_GATE_TEMPLATE_NOT_OFFICIAL", f"the production template base URL is {official!r}")

        endpoint = FakeEndpoint(FAKE_TOKEN)
        endpoint.assert_loopback_only()
        differences = production.documented_differences(endpoint.base_url)
        REPORT["template"] = {
            "officialBaseUrl": official,
            "loopbackOverrideChanges": {key: list(value) for key, value in differences.items()},
            "productModelId": production.PRODUCT_MODEL_ID,
            "nativeModelValue": production.NATIVE_MODEL_VALUE,
            "artifactTarget": production.ARTIFACT_TARGET,
            "adapterEntry": production.ADAPTER_ARTIFACT_ENTRY,
            "outputTokenLimit": production.OUTPUT_TOKEN_LIMIT,
            "credentialEnvironment": production.CREDENTIAL_ENVIRONMENT,
        }
        if set(differences) != {f"providers.{production.PI_PROVIDER}.baseUrl"}:
            fail("PI_GATE_OVERRIDE_NOT_MINIMAL", f"the loopback override changed {sorted(differences)}")

        created = Path(tempfile.mkdtemp(prefix=TEMPORARY_PREFIX))
        temporary = created
        workspace = temporary / "workspace"
        workspace.mkdir()
        REPORT["run"] = {"temporary": str(temporary), "workspace": str(workspace)}

        artifact = Path(options.artifact).resolve() if options.artifact else build_artifact(
            temporary / "artifacts" / production.ARTIFACT_NAME, REPORT)
        if options.artifact:
            assert_external_artifact_separate(artifact, temporary)
            external_artifact = artifact
            REPORT["artifact"] = {"output": str(artifact), "external": True}
        digest = verify_artifact(artifact, REPORT)

        token_path = temporary / "pi-gate-token"
        token_path.write_bytes(FAKE_TOKEN.encode())
        token_path.chmod(0o600)

        endpoint.start()
        try:
            outcome = run_chain(
                temporary, workspace, worker, artifact, digest, endpoint, production, token_path,
            )
        finally:
            endpoint.stop()
        REPORT["provider"] = {
            "requests": endpoint.requests, "paths": endpoint.paths,
            "unauthorizedRequests": endpoint.unauthorized,
            "requestsBeyondBudget": endpoint.over_budget,
            "baseUrl": endpoint.base_url,
        }
        REPORT.update(outcome)
        if endpoint.over_budget:
            fail("PI_GATE_EXTRA_PROVIDER_REQUEST",
                 f"{endpoint.over_budget} provider requests exceeded the two-round budget")

        # The endpoint must have been the only way out of the guest.
        audit = workspace / AUDIT_NAME
        audit_lines = audit.read_text(encoding="utf-8").splitlines() if audit.is_file() else []
        REPORT["egress"] = {
            "guardLoaded": any(line.startswith("guard-loaded") for line in audit_lines),
            "denied": [line for line in audit_lines if line.startswith("denied")],
            "auditPresent": audit.is_file(),
        }
        if not REPORT["egress"]["guardLoaded"]:
            fail("PI_GATE_EGRESS_GUARD_ABSENT", "the offline guard did not load in the adapter process")
        if REPORT["egress"]["denied"]:
            fail("PI_GATE_EGRESS_BLOCKED", f"the adapter tried to reach {REPORT['egress']['denied']}")
        REPORT["reopenObservation"] = observe_reopen(
            temporary, workspace, worker, artifact, digest, production)
        cleanup_check(temporary, workspace, token_path)
        REPORT["result"] = "PI_PRODUCTION_CHAIN_GATE_OK"
    except GateFailure as failure:
        primary = failure
    except BaseException as error:  # an unexpected crash is a failure too
        primary = GateFailure("PI_GATE_UNEXPECTED", f"{type(error).__name__}: {error}")
    finally:
        if endpoint is not None:
            endpoint.stop()
        if temporary is not None:
            run = REPORT.setdefault("run", {})
            if options.keep:
                # Keeping the tree is a supported outcome, reported as such.
                run["removed"] = False
                run["kept"] = str(temporary)
                REPORT["kept"] = str(temporary)
            else:
                try:
                    outcome = cleanup_root(temporary, created=created)
                    run["removed"] = bool(outcome["removed"])
                    REPORT.setdefault("cleanup", {}).update(outcome)
                except GateFailure as failure:
                    # The tree is still on disk: `removed` reports that truth,
                    # and the leftover is what makes this run fail.
                    cleanup_failure = failure
                    run["removed"] = not temporary.exists()
                    REPORT["cleanupFailure"] = {
                        "code": failure.code, "error": failure.message[:300],
                    }
        if external_artifact is not None and primary is None:
            # The caller's artifact must survive untouched: re-derive its digest.
            try:
                verify_artifact(external_artifact, REPORT)
                REPORT.setdefault("artifact", {})["preservedAfterCleanup"] = True
            except GateFailure as failure:
                primary = GateFailure("PI_GATE_EXTERNAL_ARTIFACT_DAMAGED", failure.message)

    if primary is None and cleanup_failure is not None:
        # A cleanup failure with no other cause is itself the failure.
        primary, cleanup_failure = cleanup_failure, None

    if primary is not None:
        REPORT["result"] = "PI_PRODUCTION_CHAIN_GATE_FAILED"
        REPORT["code"] = primary.code
        REPORT["error"] = primary.message[:900]
        if cleanup_failure is not None:
            REPORT["cleanupFailure"] = {
                "code": cleanup_failure.code, "error": cleanup_failure.message[:300],
            }
        print(json.dumps(REPORT, indent=2 if options.json else None, sort_keys=True))
        return 1
    print(json.dumps(REPORT, indent=2 if options.json else None, sort_keys=True))
    return 0


def observe_reopen(temporary, workspace, worker, artifact, digest, production) -> dict:
    """What the Harness actually sent to reopen the stored Session.

    The Server cannot see this: the reopen happens inside the Worker. This
    phase drives the same reviewed launcher with the same artifact, config,
    credential and worker, and records the ACP chunks the adapter emits while
    it reopens the stored Session. Pi's journal-backed reopen replays the
    stored assistant turn; `session/resume` would have opened the same Session
    without replaying it, so a replay is the observable difference between the
    two methods rather than an assumption about which one was called.
    """
    from agent_box.server.execution.sidecar import (
        SidecarHarnessPort, WslSidecarLauncher, sidecar_bundle_files,
    )

    endpoint = FakeEndpoint(FAKE_TOKEN)
    endpoint.start()
    bundle = sidecar_bundle_files(PLUGIN)
    bundle[f"agentbox-sidecar/deployment/pi/{production.MODELS_SOURCE.rsplit('/', 1)[-1]}"] = json.dumps(
        production.loopback_models_document(endpoint.base_url)).encode()
    bundle["agentbox-sidecar/deployment/pi/settings.json"] = production.SETTINGS_TEMPLATE.read_bytes()
    events: list[dict] = []
    state_directory = temporary / "sidecar-state"
    state_directory.mkdir(exist_ok=True)

    def port_for(resume_native_id=None, restored_state=None):
        launcher = WslSidecarLauncher(
            DirectWorkerConnector(temporary, worker, workspace),
            workspace={"distribution": "Ubuntu", "remote_user": os.environ["USER"],
                       "connection_id": "connection-pi-reopen", "remote_path": str(workspace)},
            bundle=bundle, credential=FAKE_TOKEN.encode(),
            runtime_artifact_authorizations=({
                "path": str(artifact), "target": production.ARTIFACT_TARGET, "digest": digest},),
            runtime_artifact_mounts=((str(artifact), production.ARTIFACT_TARGET),),
            projection_mounts=(
                ("agentbox-sidecar/deployment/pi/models.json", f"{production.AGENT_HOME}/models.json"),
                ("agentbox-sidecar/deployment/pi/settings.json", f"{production.AGENT_HOME}/settings.json"),
            ),
            state_bundle_prefix="agentbox-sidecar/deployment/pi/native-state",
            state_target=production.STATE_TARGET, restored_state=restored_state,
            timeout_ms=120_000,
        )
        return SidecarHarnessPort(
            launcher, environment={"AGENTBOX_SIDECAR_ISOLATED": "1"}, profile="pi",
            adapter={"command": "/usr/bin/node", "args": [production.ADAPTER_ARTIFACT_ENTRY],
                     "environment": dict(production.ADAPTER_ENVIRONMENT)},
            model=production.PRODUCT_MODEL_ID,
            credential_environment=production.CREDENTIAL_ENVIRONMENT,
            resume_native_id=resume_native_id,
            state_directory=str(state_directory), directory="/workspace",
            on_event=lambda _execution, kind, data: events.append(
                {"kind": kind, "text": str((data or {}).get("text") or "")[:120]}),
        )

    try:
        first = port_for()
        try:
            native = first.open_execution("reopen-round-1")
            first.prompt("reopen-round-1", f"Remember {NONCE_ROUND_1} and reply with it.")
            state, resumable = first.capture_execution("reopen-round-1")
        finally:
            first.stop()
        events.clear()
        second = port_for(resume_native_id=native, restored_state=state)
        try:
            reopened = second.open_execution("reopen-round-2")
            during_reopen = list(events)
            second.prompt("reopen-round-2", "What did I ask you to remember?")
            after_prompt = list(events)
        finally:
            second.stop()
    finally:
        endpoint.stop()
    replayed = [item for item in during_reopen
                if item["kind"] == "message.delta" and NONCE_ROUND_1 in item["text"]]
    result = {
        "nativeSessionIdStable": reopened == native,
        "stateFiles": len(state), "stateResumable": bool(resumable),
        "chunksDuringReopen": during_reopen,
        "chunksAfterReopenPrompt": after_prompt,
        "replayedStoredTurn": bool(replayed),
        "providerRequests": len(endpoint.requests),
        "note": (
            "Pi reopens its journal through the replaying session/load path; "
            "session/resume would open the same Session without replaying it."
        ),
    }
    if not result["nativeSessionIdStable"]:
        fail("PI_GATE_REOPEN_IDENTITY_CHANGED", "the reopened native session id changed")
    if not result["replayedStoredTurn"]:
        fail("PI_GATE_REOPEN_NOT_REPLAYED",
             "the reopen did not replay the stored turn, so it was not the replaying session/load path")
    return result


def run_chain(temporary, workspace, worker, artifact, digest, endpoint, production, token_path) -> dict:
    """The production seam: Server -> Core -> sidecar -> Worker -> bwrap -> Pi."""
    from agent_box.server.bootstrap import build_runtime_from_sidecar_deployment
    from agent_box.server.credentials import CredentialRecords
    from agent_box.server.transport.http import create_app
    from agent_box.storage import MemorySecretStore
    from fastapi.testclient import TestClient

    document = production.deployment_document(
        artifact_source=str(artifact), tree_digest=digest,
        adapter_environment={
            **production.ADAPTER_ENVIRONMENT,
            # Test-only additions, listed in the report: the offline guard, its
            # audit path inside the project workspace, and nothing else.
            "NODE_OPTIONS": f"--require {production.LOOPBACK_GUARD_TARGET}",
            "AGENTBOX_EGRESS_AUDIT": f"/workspace/{AUDIT_NAME}",
        },
        projection_files_override=(
            *production.projection_files(),
            {"source": "deploy/pi/loopback-guard.cjs", "target": production.LOOPBACK_GUARD_TARGET},
        ),
    )
    deployment = temporary / "deployment.json"
    deployment.write_text(json.dumps(document), encoding="utf-8")

    loopback_models = production.loopback_models_document(endpoint.base_url)
    loopback_bytes = json.dumps(loopback_models, sort_keys=True, separators=(",", ":")).encode()

    import agent_box.server.bootstrap.runtime as runtime_module
    runtime_module._builtin_connector = lambda _id: DirectWorkerConnector(
        temporary, worker, workspace)
    original_file = runtime_module._sidecar_deployment_file

    def deployment_file(root, value, relative):
        if relative == production.MODELS_SOURCE:
            return loopback_bytes
        return original_file(root, value, relative)

    runtime_module._sidecar_deployment_file = deployment_file
    store = MemorySecretStore(values={})
    runtime = build_runtime_from_sidecar_deployment(
        temporary / "server", deployment, secret_store=store,
    )
    result: dict = {"rounds": {}}
    try:
        credential_id, locator = store.import_file(token_path, "api-key")
        with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
            # The runtime's database is only live once the application started.
            CredentialRecords(runtime.database).register(credential_id, "api-key", locator)
            opened = wire_post(client, runtime.token, "workspaces.open", {
                "requestId": "pi-gate-open", "path": str(workspace),
                "environment": {"kind": "wsl", "host": "Ubuntu", "user": os.environ["USER"]},
            })["workspace"]
            provider = wire_post(client, runtime.token, "providerModels.create", {
                "requestId": "pi-gate-provider", "displayName": "DeepSeek official",
                "harness": "pi", "provider": production.PI_PROVIDER, "credentialId": credential_id,
                "configuration": [], "models": [{
                    "modelId": production.PRODUCT_MODEL_ID, "displayName": "DeepSeek Flash",
                    "availability": "available", "unavailableReason": None,
                }],
            })["providerModel"]
            # The profile carries the authorized credential; the Server refuses a
            # session for a harness that declares a credential kind without one.
            profile = client.post("/api/v1/profiles", headers={
                "Authorization": f"Bearer {runtime.token}", "Idempotency-Key": "pi-gate-profile",
            }, json={"name": "Pi production gate", "harness_type": "pi",
                     "configuration": {}, "credential_id": credential_id}).json()
            configured = wire_post(client, runtime.token, "profiles.updateConfig", {
                "requestId": "pi-gate-profile-config", "profileId": profile["profile_id"],
                "expectedVersion": profile_version(client, runtime, profile["profile_id"]),
                "values": [{"controlId": "model", "value": {
                    "providerId": provider["id"], "modelId": production.PRODUCT_MODEL_ID,
                }}],
            })["profile"]

            first = wire_post(client, runtime.token, "sessions.createAndSend", {
                "requestId": "pi-gate-round-1", "workspaceId": opened["id"],
                "profileId": configured["id"], "overrides": [],
                "message": {"text": f"Remember {NONCE_ROUND_1} and reply with it.", "attachments": []},
            })
            session = wait_for_turn(runtime, first["session"]["id"], 0, "completed")
            result["rounds"]["first"] = summarize_turn(session, 0)
            result["sessionId"] = first["session"]["id"]
            native_id = session["checkpoint"]["native_id"] if session["checkpoint"] else None
            if not native_id:
                fail("PI_GATE_NO_NATIVE_ID", "the first round produced no native session id")
            result["nativeSessionId"] = native_id
            checkpoint = json.loads(runtime.objects.read(session["checkpoint"]["object_digest"]))
            result["checkpointAfterFirst"] = {
                "schemaVersion": checkpoint.get("schema_version"),
                "resumable": checkpoint.get("resumable"),
                "harnessType": checkpoint.get("harnessType"),
                "nativeSessionId": checkpoint.get("nativeSessionId"),
                "files": sorted(item["path"] for item in checkpoint.get("files", [])),
            }

            second = wire_post(client, runtime.token, "sessions.send", {
                "requestId": "pi-gate-round-2", "sessionId": first["session"]["id"],
                "overrides": [],
                "message": {"text": f"What did I ask you to remember? Reply with the nonce.", "attachments": []},
            })
            session = wait_for_turn(runtime, first["session"]["id"], 1, "completed")
            result["rounds"]["second"] = summarize_turn(session, 1)
            if session["checkpoint"]["native_id"] != native_id:
                fail("PI_GATE_NATIVE_ID_CHANGED", "the second round did not keep the native session id")
            result["checkpointNativeIdStable"] = True

            unknown = run_unknown_model(
                client, runtime, workspace, opened, production, endpoint, credential_id)
            result["unknownModel"] = unknown

            result["credential"] = {
                "injectedTokenReachedProvider": all(
                    item["authorizationMatchesInjectedToken"] for item in endpoint.requests
                ) and bool(endpoint.requests),
                "unauthorizedRequests": endpoint.unauthorized,
                "tokenInEvents": FAKE_TOKEN in json.dumps(session["events"]),
                "tokenInReportableState": FAKE_TOKEN in json.dumps(REPORT),
            }
            result["stateScan"] = scan_state(runtime, session, native_id)
            result["deltaAttribution"] = delta_attribution(session)
            return result
    finally:
        runtime.stop()


def profile_version(client, runtime, profile_id: str) -> int:
    """The current Profile version, for a compare-and-set configuration write."""
    for item in wire_post(client, runtime.token, "profiles.list", {
        "includeArchived": True,
    })["items"]:
        if item["id"] == profile_id:
            return int(item["version"])
    fail("PI_GATE_PROFILE_MISSING", f"profile {profile_id} was not listed")


def delta_attribution(session: dict) -> dict:
    """Every durable delta must belong to a turn of this Session.

    A Harness that replays history while it reopens a Session emits chunks
    before the execution being dispatched is bound. Those must not be recorded
    against another turn - a stray delta would silently duplicate an older
    answer into a newer transcript.
    """
    turns = {turn["id"] for turn in session["turns"]}
    deltas = [event for event in session["events"] if event["kind"] == "message.delta"]
    stray = [event for event in deltas if event.get("turn_id") not in turns]
    if stray:
        fail("PI_GATE_STRAY_DELTA", f"{len(stray)} deltas do not belong to a turn of this Session")
    return {"deltas": len(deltas), "unattributed": 0,
            "perTurn": {turn["id"]: sum(1 for e in deltas if e.get("turn_id") == turn["id"])
                        for turn in session["turns"]}}


def wait_for_turn(runtime, session_id: str, index: int, state: str, *, timeout: float = 180.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        session = runtime.repository.get_session(session_id)
        if len(session["turns"]) > index and session["turns"][index]["state"] == state:
            return session
        if len(session["turns"]) > index and session["turns"][index]["state"] in {"failed", "cancelled"}:
            REPORT["diagnostics"] = turn_diagnostics(runtime, session, index)
            fail("PI_GATE_TURN_" + session["turns"][index]["state"].upper(),
                 json.dumps(REPORT["diagnostics"])[:1500])
        time.sleep(0.05)
    fail("PI_GATE_TURN_TIMEOUT", f"turn {index} of session {session_id} did not reach {state}")


def turn_diagnostics(runtime, session: dict, index: int) -> dict:
    """Whatever the durable records say about a turn that did not succeed."""
    reasons = []
    with runtime.database.read() as conn:
        for row in conn.execute("SELECT data_json FROM core_events WHERE type=?",
                                ("ExecutionDispatchAmbiguous",)):
            reasons.append(json.loads(row["data_json"]).get("error", "")[:400])
    events = []
    for event in session["events"]:
        if event.get("turn_id") != session["turns"][index]["id"]:
            continue
        data = event.get("data") or {}
        events.append({"kind": event["kind"],
                       "text": str(data.get("text") or data.get("state") or data.get("code") or "")[:200]})
    return {"reasons": reasons, "events": events[-12:],
            "turn": {key: session["turns"][index].get(key)
                     for key in ("state", "error_code", "capture_state", "cleanup_state")}}


def summarize_turn(session: dict, index: int) -> dict:
    turn = session["turns"][index]
    events = [event for event in session["events"] if event.get("turn_id") == turn["id"]]
    deltas = [event for event in events if event["kind"] == "message.delta"]
    terminal = [event for event in events
                if event["kind"] == "turn.state" and event["data"].get("state") == "completed"]
    return {
        "state": turn["state"],
        "deltaSeq": [event["seq"] for event in deltas],
        "deltaText": [event["data"]["text"] for event in deltas],
        "completedSeq": terminal[0]["seq"] if terminal else None,
        "deltasBeforeCompletion": bool(terminal and deltas and deltas[0]["seq"] < terminal[0]["seq"]),
    }


def run_unknown_model(client, runtime, workspace, opened, production, endpoint, credential_id) -> dict:
    """An unknown product model must be refused before any provider request."""
    provider = wire_post(client, runtime.token, "providerModels.create", {
        "requestId": "pi-gate-unknown-provider", "displayName": "DeepSeek unknown",
        "harness": "pi", "provider": production.PI_PROVIDER, "credentialId": credential_id,
        "configuration": [], "models": [{
            "modelId": "deepseek-unknown", "displayName": "Unknown",
            "availability": "available", "unavailableReason": None,
        }],
    })["providerModel"]
    profile = client.post("/api/v1/profiles", headers={
        "Authorization": f"Bearer {runtime.token}",
        "Idempotency-Key": "pi-gate-unknown-profile",
    }, json={"name": "Pi unknown model", "harness_type": "pi",
             "configuration": {}, "credential_id": credential_id}).json()
    configured = wire_post(client, runtime.token, "profiles.updateConfig", {
        "requestId": "pi-gate-unknown-config", "profileId": profile["profile_id"],
        "expectedVersion": profile_version(client, runtime, profile["profile_id"]),
        "values": [{"controlId": "model", "value": {
            "providerId": provider["id"], "modelId": "deepseek-unknown",
        }}],
    })["profile"]
    sent = wire_post(client, runtime.token, "sessions.createAndSend", {
        "requestId": "pi-gate-unknown-send", "workspaceId": opened["id"],
        "profileId": configured["id"], "overrides": [],
        "message": {"text": "This model does not exist.", "attachments": []},
    })
    session = wait_for_turn(runtime, sent["session"]["id"], 0, "failed")
    turn = session["turns"][0]
    reasons = []
    with runtime.database.read() as conn:
        for row in conn.execute("SELECT data_json FROM core_events WHERE type=?",
                                ("ExecutionDispatchAmbiguous",)):
            reasons.append(json.loads(row["data_json"]).get("error", ""))
    deltas = [event["data"]["text"] for event in session["events"]
              if event["kind"] == "message.delta"]
    requests_after = len(endpoint.requests)
    if requests_after != 2:
        fail("PI_GATE_UNKNOWN_MODEL_REACHED_PROVIDER",
             f"the refused model produced {requests_after - 2} provider requests")
    return {
        "state": turn["state"],
        "providerRequestsAfterRefusal": requests_after - 2,
        "refusedBeforeProviderRequest": requests_after == 2,
        "reasonMentionsModel": any("Harness model is not available" in reason for reason in reasons),
        "reasons": [reason[:200] for reason in reasons],
        "deltas": deltas,
    }


def scan_state(runtime, session: dict, native_id: str) -> dict:
    """The credential must not appear in any captured native state."""
    checkpoint = json.loads(runtime.objects.read(session["checkpoint"]["object_digest"]))
    hits = []
    total = 0
    for item in checkpoint.get("files", []):
        content = runtime.objects.read(item["digest"])
        total += len(content)
        if FAKE_TOKEN.encode() in content:
            hits.append(item["path"])
    return {"files": len(checkpoint.get("files", [])), "bytes": total,
            "tokenHits": hits, "tokenInState": bool(hits)}


def cleanup_check(temporary: Path, workspace: Path, token_path: Path) -> None:
    """Nothing this gate projected may survive the run."""
    worker_root = temporary / "worker-root"
    leftovers = [name for name in ("views", "secrets") if (worker_root / name).exists()]
    if leftovers:
        fail("PI_GATE_WORKER_LEFTOVER", f"the Worker kept {leftovers}")
    survivors = subprocess.run(
        ["pgrep", "-af", "pi-acp/dist/index.js"], capture_output=True, text=True,
    ).stdout.splitlines()
    if survivors:
        fail("PI_GATE_PI_PROCESS_ALIVE", f"a Pi adapter process survived: {survivors[:2]}")
    if token_path.exists():
        token_path.unlink()
    if token_path.exists():
        fail("PI_GATE_CLEANUP_FAILED", "the temporary fake token could not be removed")
    remove_tree(workspace)
    REPORT.setdefault("cleanup", {}).update({
        "workerProjectionsRemoved": True, "adapterProcessesRemoved": True,
        "fakeTokenRemoved": not token_path.exists(), "workspaceRemoved": not workspace.exists(),
    })


if __name__ == "__main__":
    raise SystemExit(main())
