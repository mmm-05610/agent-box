#!/usr/bin/env python3
"""claude production chain gate: real Claude Code ACP adapter, local fake endpoint.

Work Order 43's clone of the reviewed dsh/Pi production chain gates, adapted
to the two structural facts of the claude-code family:

  * The provider protocol is Anthropic Messages (`/v1/messages` SSE), not
    OpenAI chat completions - the local fake endpoint in this gate speaks
    that protocol, and its `model` field must equal the product model.
  * The native process is a compiled CLI binary spawned by the node adapter,
    so the loopback enforcement is the reviewed C guard preloaded with
    LD_PRELOAD (a NODE_OPTIONS hook would never reach the binary); the
    environment the adapter gets is inherited by the binary.

Everything else follows the family template: two rounds on one Server Session
prove configuration read, credential projection, model selection, streaming
order, continuation context, and native recovery - with the loopback mode
registered as CLAUDE_PRODUCTION_CHAIN_PREPARED only, never MODEL_VERIFIED.

    usage: claude-production-chain-gate.py [--worker PATH] [--artifact PATH]
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
WORKER_BUNDLE = Path(os.environ.get("AGENTBOX_W43_WORKER", str(REPO / "workers" / "agent-box-worker" / ".acceptance-bundle-c8" / "agent-box-worker")))
BUILDER = REPO / "scripts" / "server-round1" / "build-claude-runtime-artifact.mjs"
SCRIPT = "scripts/server-round1/claude-production-chain-gate.py"

#: Fixed, obviously fake, never a credential. It exists to prove the injection
#: path; the gate never reads a real secret file.
FAKE_TOKEN = "claude-gate-fake-token-4d92b6a1-non-secret"
#: The bytes actually injected this run: the fake token in the no-model gate,
#: the authorized locator's content in live mode. Only the scans read it, and
#: nothing prints it.
INJECTED_CREDENTIAL: bytes = FAKE_TOKEN.encode()
NONCE_ROUND_1 = "CLAUDE-GATE-NONCE-1F4A9C"
NONCE_ROUND_2 = "CLAUDE-GATE-NONCE-2B7D31"
AUDIT_NAME = ".agentbox-egress-audit"
#: Deploy-relative name the compiled guard is served under (the hook in
#: run_chain supplies the compiled bytes; the C source itself is never
#: projected).
GUARD_DEPLOY_SOURCE = "deploy/claude/egress-guard.so"
#: Every temporary root this gate creates carries this prefix under the system
#: temporary directory, which is what identifies a directory as ours to remove.
TEMPORARY_PREFIX = "agentbox-claude-gate-"
REPORT: dict = {"result": "CLAUDE_PRODUCTION_CHAIN_GATE_FAILED", "script": SCRIPT}


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
        fail("CLAUDE_GATE_CLEANUP_NOT_OWNED", "the path is not the directory this run created")
    if not root.exists():
        return
    stats = os.lstat(root)
    if stat.S_ISLNK(stats.st_mode) or not stat.S_ISDIR(stats.st_mode):
        fail("CLAUDE_GATE_CLEANUP_NOT_OWNED", "the temporary root is no longer a directory")
    if not root.name.startswith(TEMPORARY_PREFIX) or root.parent != Path(tempfile.gettempdir()):
        fail("CLAUDE_GATE_CLEANUP_NOT_OWNED", "the temporary root is not one this gate creates")
    if stats.st_uid != os.geteuid():
        fail("CLAUDE_GATE_CLEANUP_NOT_OWNED", "the temporary root is not owned by this user")
    if stats.st_mode & 0o077:
        fail("CLAUDE_GATE_CLEANUP_NOT_OWNED", "the temporary root is group or world accessible")


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


def remove_tree(path: Path, *, code: str = "CLAUDE_GATE_CLEANUP_FAILED") -> int:
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
        fail("CLAUDE_GATE_ARTIFACT_INSIDE_TEMPORARY_ROOT",
             "an external --artifact must live outside this run's temporary root")


def cleanup_root(root: Path, *, created: Path) -> dict:
    """Retire this run's temporary root and report whether it is really gone."""
    assert_owned_root(root, created=created)
    changed = remove_tree(root)
    return {"removed": not root.exists(), "madeWritable": changed}


# --------------------------------------------------------------------------
# local fake endpoint
# --------------------------------------------------------------------------

def anthropic_events(answer: str) -> bytes:
    """One Anthropic Messages SSE response carrying `answer` as its text."""
    events = [
        {"type": "message_start", "message": {"id": "msg_claude_gate", "type": "message",
                                              "role": "assistant", "content": [],
                                              "model": "deepseek-flash",
                                              "usage": {"input_tokens": 11, "output_tokens": 1}}},
        {"type": "content_block_start", "index": 0,
         "content_block": {"type": "text", "text": ""}},
        {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": answer}},
        {"type": "content_block_stop", "index": 0},
        {"type": "message_delta", "delta": {"stop_reason": "end_turn", "stop_sequence": None},
         "usage": {"output_tokens": 7}},
        {"type": "message_stop"},
    ]
    payload = b""
    for event in events:
        payload += f"event: {event['type']}\n".encode()
        payload += f"data: {json.dumps(event)}\n\n".encode()
    return payload


def sanitized(body: dict) -> dict:
    """Request structure without any credential or header value."""
    messages = body.get("messages") if isinstance(body.get("messages"), list) else []
    return {
        "model": body.get("model"),
        "stream": body.get("stream"),
        "maxTokens": body.get("max_tokens"),
        "phaseMarkers": {
            "round1": NONCE_ROUND_1 in json.dumps(body),
            "round2Marker": "What did I ask you to remember" in json.dumps(body),
            "unknownMarker": "This model does not exist" in json.dumps(body),
        },
        "systemContainsRound1": NONCE_ROUND_1 in json.dumps(body.get("system")),
        "messages": [
            {
                "role": item.get("role"),
                "chars": len(json.dumps(item.get("content") or "")),
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
        # An upper clamp against runaway retries, not the expected count: the
        # expected per-phase request counts are asserted from what this gate
        # records. Claude Code may issue background model calls (session
        # title generation), so the clamp is generous but finite.
        self.budget = 8
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
                    bearer = self.headers.get("Authorization")
                    xapi = self.headers.get("x-api-key")
                    authorized = (bearer == f"Bearer {gate.token}"
                                  or xapi == gate.token)
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
                    answer = NONCE_ROUND_1 if index == 1 else NONCE_ROUND_2 if index == 2 else f"CLAUDE-GATE-EXTRA-{index}"
                payload = anthropic_events(answer)
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
        self._started = True

    def stop(self) -> None:
        """Stop the endpoint, or do nothing if it never served.

        `shutdown()` waits for `serve_forever` to return, so calling it on a
        server that never started blocks forever - which would turn an early
        gate failure into a hang. Stopping is idempotent.
        """
        if not getattr(self, "_started", False):
            return
        self._started = False
        self.server.shutdown()
        self.server.server_close()

    def assert_loopback_only(self) -> None:
        if self.server.server_address[0] != "127.0.0.1":
            fail("CLAUDE_GATE_ENDPOINT_NOT_LOOPBACK", "the fake endpoint is not bound to loopback")


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
        return {"connection_id": "connection-claude-gate", "distribution": "Ubuntu",
                "user": os.environ["USER"], "path": str(self.workspace)}

    def client_for_workspace(self, **arguments):
        from agent_box_runtime_wsl import WorkerClient

        return WorkerClient(
            [str(self.worker), "--root", str(self.root / "worker-root"),
             "--workspace", str(self.workspace)],
            worker_digest="sha256:" + hashlib.sha256(self.worker.read_bytes()).hexdigest(),
            worker_version="0.1.0", connection_id=arguments["connection_id"],
            project_id=arguments["connection_id"], effective_user=os.environ["USER"],
            server_instance_id="server-claude-gate",
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
        fail("CLAUDE_GATE_WIRE_REFUSED", f"{method}: {json.dumps(body)[:400]}")
    return body["result"]


def build_artifact(destination: Path, report: dict) -> Path:
    result = subprocess.run(
        ["node", str(BUILDER), "--output", str(destination), "--json"],
        cwd=str(REPO), capture_output=True, text=True, timeout=900,
    )
    try:
        payload = json.loads(result.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        fail("CLAUDE_GATE_BUILD_UNREADABLE", f"the builder produced no JSON: {result.stdout[-300:]}{result.stderr[-300:]}")
    if result.returncode != 0 or payload.get("result") != "CLAUDE_RUNTIME_ARTIFACT_BUILT":
        fail(payload.get("code", "CLAUDE_GATE_BUILD_FAILED"), str(payload.get("error", payload)))
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
        fail("CLAUDE_GATE_ARTIFACT_DRIFT", "the artifact no longer matches its manifest digest")
    if summary["entries"] != manifest["entries"] or summary["bytes"] != manifest["bytes"]:
        fail("CLAUDE_GATE_ARTIFACT_DRIFT", "the artifact entry or byte count changed")
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
    parser.add_argument(
        "--live", action="store_true",
        help="paid mode: the official endpoint and an authorized credential "
             "locator instead of the loopback fake endpoint (see "
             "docs/server-round1/fullstack/live-model-preflight.md)",
    )
    parser.add_argument(
        "--authorized-secret", default=None,
        help="path of the authorized credential file (only with --live)",
    )
    options = parser.parse_args()
    if options.live and not options.authorized_secret:
        fail("CLAUDE_GATE_LIVE_SECRET_REQUIRED", "--live requires --authorized-secret")

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
            fail("CLAUDE_GATE_WORKER_MISSING", f"the release Worker binary is unavailable: {worker}")
        if not shutil.which("bwrap"):
            fail("CLAUDE_GATE_BWRAP_MISSING", "bubblewrap is unavailable")
        REPORT["worker"]["sha256"] = "sha256:" + hashlib.sha256(worker.read_bytes()).hexdigest()

        # The plugin owns the deployment; this gate only adds a listed override set.
        from agent_box_harnesses.claude import production

        official = production.settings_document()["env"]["ANTHROPIC_BASE_URL"]
        if official != production.OFFICIAL_BASE_URL:
            fail("CLAUDE_GATE_TEMPLATE_NOT_OFFICIAL", f"the production template base URL is {official!r}")

        live = bool(options.live)
        REPORT["mode"] = "live" if live else "loopback-fake-endpoint"
        # None outside live mode: there is no authorized locator to check then,
        # and the cleanup report says exactly that rather than a bare `false`.
        secret_path = None
        if live:
            # Paid mode: the official template is used exactly as declared, so
            # there is no override to audit - and no fake endpoint to count
            # requests for. The credential is an authorized locator; its content
            # is never printed, only injected.
            secret_path = Path(options.authorized_secret).resolve()
            mode = secret_path.stat().st_mode & 0o777
            if mode & 0o077:
                fail("CLAUDE_GATE_LIVE_SECRET_PERMISSIONS", f"authorized secret mode is {oct(mode)}")
            endpoint = None
            differences = {}
            REPORT["template"] = {
                "officialBaseUrl": official,
                "loopbackOverrideChanges": {},
                "productModelId": production.PRODUCT_MODEL_ID,
                "nativeModelValue": production.NATIVE_MODEL_VALUE,
                "artifactTarget": production.ARTIFACT_TARGET,
                "adapterEntry": production.ADAPTER_ARTIFACT_ENTRY,
                "credentialEnvironment": production.CREDENTIAL_ENVIRONMENT,
                "credentialSource": "authorized-locator",
            }
        else:
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
                "credentialEnvironment": production.CREDENTIAL_ENVIRONMENT,
            }
            if set(differences) != {"env.ANTHROPIC_BASE_URL"}:
                fail("CLAUDE_GATE_OVERRIDE_NOT_MINIMAL",
                     f"the loopback override changed {sorted(differences)}")

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

        global INJECTED_CREDENTIAL
        token_path = temporary / "claude-gate-token"
        if live:
            # The authorized locator is imported by path: its content is read by
            # the SecretStore, never printed by this gate. The gate still owns a
            # temporary token file of its own so cleanup never touches the user's.
            token_path.write_bytes(secret_path.read_bytes())
            token_path.chmod(0o600)
            INJECTED_CREDENTIAL = token_path.read_bytes().strip()
        else:
            token_path.write_bytes(FAKE_TOKEN.encode())
            token_path.chmod(0o600)
            INJECTED_CREDENTIAL = FAKE_TOKEN.encode()

        if endpoint is not None:
            endpoint.start()
        try:
            outcome = run_chain(
                temporary, workspace, worker, artifact, digest, endpoint, production, token_path,
                live=live,
            )
        finally:
            if endpoint is not None:
                endpoint.stop()
        if endpoint is not None:
            REPORT["provider"] = {
                "requests": endpoint.requests, "paths": endpoint.paths,
                "unauthorizedRequests": endpoint.unauthorized,
                "requestsBeyondBudget": endpoint.over_budget,
                "baseUrl": endpoint.base_url,
            }
        REPORT.update(outcome)
        if endpoint is not None and endpoint.over_budget:
            fail("CLAUDE_GATE_EXTRA_PROVIDER_REQUEST",
                 f"{endpoint.over_budget} provider requests exceeded the two-round budget")

        # The endpoint must have been the only way out of the guest. That is a
        # property of the no-model gate's guard, which live mode deliberately
        # does not install - there the provider request is the point.
        audit = workspace / AUDIT_NAME
        audit_lines = audit.read_text(encoding="utf-8").splitlines() if audit.is_file() else []
        REPORT["egress"] = {
            "guardLoaded": any(line.startswith("guard-loaded") for line in audit_lines),
            "denied": [line for line in audit_lines if line.startswith("denied")],
            "auditPresent": audit.is_file(),
            "guardExpected": not live,
        }
        if not live and not REPORT["egress"]["guardLoaded"]:
            fail("CLAUDE_GATE_EGRESS_GUARD_ABSENT", "the offline guard did not load in the adapter process")
        # The guard records every refused destination. Claude Code attempts
        # calls to its own vendor host for non-model purposes (telemetry,
        # feature flags) even when the model endpoint is redirected; those
        # RESOLVE attempts are expected, documented here, and were BLOCKED -
        # nothing non-loopback was actually contacted. Any other destination,
        # and any connect-level attempt, is a failure.
        vendor_denies = [line for line in REPORT["egress"]["denied"]
                         if line.startswith("denied resolve api.anthropic.com")]
        other_denies = [line for line in REPORT["egress"]["denied"]
                        if line not in vendor_denies]
        REPORT["egress"]["expectedVendorResolveDenies"] = len(vendor_denies)
        REPORT["egress"]["unexpectedDenies"] = other_denies
        if other_denies:
            fail("CLAUDE_GATE_EGRESS_BLOCKED", f"the adapter tried to reach {other_denies}")
        REPORT["reopenObservation"] = observe_reopen(
            temporary, workspace, worker, artifact, digest, production, live=live)
        cleanup_check(temporary, workspace, token_path, secret_path)
        REPORT["result"] = "CLAUDE_PRODUCTION_CHAIN_GATE_OK"
    except GateFailure as failure:
        primary = failure
    except BaseException as error:  # an unexpected crash is a failure too
        primary = GateFailure("CLAUDE_GATE_UNEXPECTED", f"{type(error).__name__}: {error}")
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
                primary = GateFailure("CLAUDE_GATE_EXTERNAL_ARTIFACT_DAMAGED", failure.message)

    if primary is None and cleanup_failure is not None:
        # A cleanup failure with no other cause is itself the failure.
        primary, cleanup_failure = cleanup_failure, None
    # The complete report - outcome, diagnostics, phase evidence - is what a
    # failing run publishes, so the credential question is asked once more
    # here, after everything that could carry it has been merged in.
    try:
        assert_report_is_credential_free(REPORT, prefix="CLAUDE")
    except GateFailure as exposure:
        if primary is None:
            primary = exposure

    if primary is not None:
        REPORT["result"] = "CLAUDE_PRODUCTION_CHAIN_GATE_FAILED"
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


def compile_guard(temporary: Path, report: dict) -> Path:
    """Compile the reviewed C guard into the shared library the guest preloads."""
    from agent_box_harnesses.claude import production as guard_production

    compiler = shutil.which("cc")
    if not compiler:
        fail("CLAUDE_GATE_COMPILER_MISSING",
             "a C compiler is required to build the reviewed loopback guard")
    output = temporary / "claude-egress-guard.so"
    result = subprocess.run(
        [compiler, "-shared", "-fPIC", "-O2", "-o", str(output),
         str(PLUGIN / guard_production.LOOPBACK_GUARD_SOURCE), "-ldl"],
        capture_output=True, text=True, timeout=120)
    if result.returncode != 0 or not output.is_file():
        fail("CLAUDE_GATE_GUARD_BUILD_FAILED", result.stderr[-300:])
    report["egressGuard"] = {
        "source": str(PLUGIN / guard_production.LOOPBACK_GUARD_SOURCE), "compiledAt": str(output),
        "bytes": output.stat().st_size,
        "sha256": "sha256:" + hashlib.sha256(output.read_bytes()).hexdigest(),
        "target": guard_production.EGRESS_GUARD_TARGET,
    }
    return output


def observe_reopen(temporary, workspace, worker, artifact, digest, production,
                   *, live: bool = False) -> dict:
    """What the Harness actually sent to reopen the stored Session.

    The Server cannot see this: the reopen happens inside the Worker. This
    phase drives the same reviewed launcher with the same artifact, config,
    credential and worker, and records the ACP chunks the adapter emits while
    it reopens the stored Session. The adapter's reopen method (replaying
    session/load or non-replaying session/resume) is recorded rather than
    assumed; what must hold either way is the same native id coming back and
    the stored turn's context surfacing in the round-2 model request.
    """
    from agent_box.server.execution.sidecar import (
        SidecarHarnessPort, WslSidecarLauncher, sidecar_bundle_files,
    )

    endpoint = None if live else FakeEndpoint(FAKE_TOKEN)
    if endpoint is not None:
        endpoint.start()
    guard = None if live else compile_guard(temporary, REPORT)
    bundle = sidecar_bundle_files(PLUGIN)
    if guard is not None:
        bundle["agentbox-sidecar/deployment/claude/egress-guard.so"] = guard.read_bytes()
    settings_document = (production.settings_document() if live
                         else production.loopback_settings_document(endpoint.base_url))
    bundle[f"agentbox-sidecar/deployment/claude/{production.SETTINGS_SOURCE.rsplit('/', 1)[-1]}"] = (
        json.dumps(settings_document, indent=2, sort_keys=True).encode() + b"\n")
    events: list[dict] = []
    state_directory = temporary / "sidecar-state"
    state_directory.mkdir(exist_ok=True)

    def port_for(resume_native_id=None, restored_state=None):
        launcher = WslSidecarLauncher(
            DirectWorkerConnector(temporary, worker, workspace),
            workspace={"distribution": "Ubuntu", "remote_user": os.environ["USER"],
                       "connection_id": "connection-claude-reopen", "remote_path": str(workspace)},
            bundle=bundle,
            # The reopen injects the credential this run actually uses: the real
            # one in live mode, the fake token in the no-model gate.
            credential=(FAKE_TOKEN.encode() if not live else INJECTED_CREDENTIAL),
            runtime_artifact_authorizations=({
                "path": str(artifact), "target": production.ARTIFACT_TARGET, "digest": digest},),
            runtime_artifact_mounts=((str(artifact), production.ARTIFACT_TARGET),),
            projection_mounts=tuple(
                [("agentbox-sidecar/deployment/claude/settings.json", f"{production.CONFIG_HOME}/settings.json")]
                + ([] if live or guard is None else [
                    ("agentbox-sidecar/deployment/claude/egress-guard.so", production.EGRESS_GUARD_TARGET)])
            ),
            state_bundle_prefix="agentbox-sidecar/deployment/claude/native-state",
            state_target=production.STATE_TARGET, restored_state=restored_state,
            timeout_ms=120_000,
        )
        return SidecarHarnessPort(
            launcher, environment={"AGENTBOX_SIDECAR_ISOLATED": "1"}, profile="claude-code",
            adapter={"command": "/usr/bin/node",
                     "args": [production.ADAPTER_ARTIFACT_ENTRY],
                     "environment": dict(
                         production.ADAPTER_ENVIRONMENT
                         if live or guard is None else {
                             **production.ADAPTER_ENVIRONMENT,
                             "LD_PRELOAD": production.EGRESS_GUARD_TARGET,
                             "AGENTBOX_EGRESS_AUDIT": f"/workspace/{AUDIT_NAME}",
                         })},
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
        if endpoint is not None:
            endpoint.stop()
    replayed = [item for item in during_reopen
                if item["kind"] == "message.delta" and NONCE_ROUND_1 in item["text"]]
    # The fake endpoint dictates the answer text (its second response is
    # NONCE_ROUND_2), so "the model remembered" cannot be read from the
    # answer. The context evidence is structural instead: this phase's own
    # endpoint saw exactly two requests, and the second request's messages
    # carry the round-1 nonce - which is only possible if the resumed session
    # still held the stored conversation.
    round2_request = next((item for item in endpoint.requests if item["index"] == 2), None) if endpoint else None
    context_carried = bool(round2_request and round2_request["structure"]["messages"] and any(
        item.get("containsRound1User") for item in round2_request["structure"]["messages"]))
    result = {
        "nativeSessionIdStable": reopened == native,
        "stateFiles": len(state), "stateResumable": bool(resumable),
        "chunksDuringReopen": during_reopen,
        "chunksAfterReopenPrompt": after_prompt,
        # Recorded, not assumed: which reopen method the adapter actually took.
        "replayedStoredTurn": bool(replayed),
        "round2RequestCarriedRound1Context": context_carried,
        "providerRequests": None if endpoint is None else len(endpoint.requests),
        "note": (
            "The reopen method is recorded, not assumed: the adapter may "
            "expose session/load (replaying) or session/resume; either way the "
            "same native id must come back and the stored turn must surface "
            "in the round-2 provider request's context."
        ),
    }
    if not result["nativeSessionIdStable"]:
        fail("CLAUDE_GATE_REOPEN_IDENTITY_CHANGED", "the reopened native session id changed")
    if not result["round2RequestCarriedRound1Context"]:
        fail("CLAUDE_GATE_REOPEN_CONTEXT_MISSING",
             "the round-2 provider request did not carry the round-1 context, "
             "so the resumed session did not hold the stored conversation")
    result["reopenMethod"] = ("session/load-replay" if result["replayedStoredTurn"]
                              else "session/resume")
    # Measured on 2026-09-16 and then pinned: the claude adapter advertises the
    # resume capability and the bridge reopens through non-replaying
    # session/resume. A replay would mean the path changed.
    if result["replayedStoredTurn"]:
        fail("CLAUDE_GATE_REOPEN_METHOD_CHANGED",
             "the reopen replayed the stored turn; the measured path was "
             "non-replaying session/resume")
    return result


def run_chain(temporary, workspace, worker, artifact, digest, endpoint, production, token_path,
              *, live: bool = False) -> dict:
    """The production seam: Server -> Core -> sidecar -> Worker -> bwrap -> Pi.

    `live` is the paid mode: the deployment keeps its official base URL and the
    workspace carries no loopback guard, so the only difference from the
    no-model gate is where the provider request goes and which credential is
    injected.
    """
    from agent_box.server.bootstrap import build_runtime_from_sidecar_deployment
    from agent_box.server.credentials import CredentialRecords
    from agent_box.server.transport.http import create_app
    from agent_box.storage import MemorySecretStore
    from fastapi.testclient import TestClient

    guard = None if live else compile_guard(temporary, REPORT)
    document = production.deployment_document(
        artifact_source=str(artifact), tree_digest=digest,
        adapter_environment=(
            dict(production.ADAPTER_ENVIRONMENT) if live else {
                **production.ADAPTER_ENVIRONMENT,
                # Test-only additions, listed in the report: the offline guard
                # (preloaded so it reaches the native CLI binary the adapter
                # spawns, which a NODE_OPTIONS hook would not) and its audit
                # path inside the project workspace - nothing else. The guard
                # is inherited by the binary through the adapter's environment.
                "LD_PRELOAD": production.EGRESS_GUARD_TARGET,
                "AGENTBOX_EGRESS_AUDIT": f"/workspace/{AUDIT_NAME}",
            }
        ),
        projection_files_override=(
            tuple(production.projection_files()) if live or guard is None else (
                *production.projection_files(),
                # The compiled guard shared library, keyed by a deploy-relative
                # name the hook below serves with the compiled bytes - never
                # the C source text.
                {"source": GUARD_DEPLOY_SOURCE, "target": production.EGRESS_GUARD_TARGET},
            )
        ),
    )
    deployment = temporary / "deployment.json"
    deployment.write_text(json.dumps(document), encoding="utf-8")

    # Live mode projects the official settings document byte-for-byte; the
    # no-model mode rewrites only baseURL, so the two differ in exactly that
    # one field. The bytes are the checked-in document's exact encoding.
    settings_bytes = (
        production.SETTINGS_TEMPLATE.read_bytes()
        if live else json.dumps(
            production.loopback_settings_document(endpoint.base_url),
            indent=2, sort_keys=True).encode() + b"\n"
    )

    import agent_box.server.bootstrap.runtime as runtime_module
    runtime_module._builtin_connector = lambda _id: DirectWorkerConnector(
        temporary, worker, workspace)
    original_file = runtime_module._sidecar_deployment_file

    def deployment_file(root, value, relative):
        if relative == production.SETTINGS_SOURCE:
            return settings_bytes
        if relative == GUARD_DEPLOY_SOURCE:
            return guard.read_bytes()
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
                "requestId": "claude-gate-open", "path": str(workspace),
                "environment": {"kind": "wsl", "host": "Ubuntu", "user": os.environ["USER"]},
            })["workspace"]
            provider = wire_post(client, runtime.token, "providerModels.create", {
                "requestId": "claude-gate-provider", "displayName": "DeepSeek official",
                "harness": "claude-code", "provider": production.CLAUDE_PROVIDER, "credentialId": credential_id,
                "configuration": [], "models": [{
                    "modelId": production.PRODUCT_MODEL_ID, "displayName": "DeepSeek Flash",
                    "availability": "available", "unavailableReason": None,
                }],
            })["providerModel"]
            # The profile carries the authorized credential; the Server refuses a
            # session for a harness that declares a credential kind without one.
            profile = client.post("/api/v1/profiles", headers={
                "Authorization": f"Bearer {runtime.token}", "Idempotency-Key": "claude-gate-profile",
            }, json={"name": "claude-code production gate", "harness_type": "claude-code",
                     "configuration": {}, "credential_id": credential_id}).json()
            configured = wire_post(client, runtime.token, "profiles.updateConfig", {
                "requestId": "claude-gate-profile-config", "profileId": profile["profile_id"],
                "expectedVersion": profile_version(client, runtime, profile["profile_id"]),
                "values": [{"controlId": "model", "value": {
                    "providerId": provider["id"], "modelId": production.PRODUCT_MODEL_ID,
                }}],
            })["profile"]

            first = wire_post(client, runtime.token, "sessions.createAndSend", {
                "requestId": "claude-gate-round-1", "workspaceId": opened["id"],
                "profileId": configured["id"], "overrides": [],
                "message": {"text": f"Remember {NONCE_ROUND_1} and reply with it.", "attachments": []},
            })
            session = wait_for_turn(runtime, first["session"]["id"], 0, "completed")
            result["rounds"]["first"] = summarize_turn(session, 0)
            result["sessionId"] = first["session"]["id"]
            native_id = session["checkpoint"]["native_id"] if session["checkpoint"] else None
            if not native_id:
                fail("CLAUDE_GATE_NO_NATIVE_ID", "the first round produced no native session id")
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
                "requestId": "claude-gate-round-2", "sessionId": first["session"]["id"],
                "overrides": [],
                "message": {"text": f"What did I ask you to remember? Reply with the nonce.", "attachments": []},
            })
            session = wait_for_turn(runtime, first["session"]["id"], 1, "completed")
            result["rounds"]["second"] = summarize_turn(session, 1)
            if session["checkpoint"]["native_id"] != native_id:
                fail("CLAUDE_GATE_NATIVE_ID_CHANGED", "the second round did not keep the native session id")
            result["checkpointNativeIdStable"] = True
            # Continuation is proven on the wire, not assumed from the state
            # projection: the request that carries the round-2 prompt marker
            # must also carry the round-1 nonce and a stored assistant turn.
            # (Claude Code also issues background model calls - title/topic
            # generation - which carry only the new user message; the report
            # lists them separately rather than pretending they do not exist.)
            live_requests = None if live else endpoint.requests
            if live_requests is not None:
                round2_requests = [item for item in live_requests
                                   if item["structure"]["phaseMarkers"]["round2Marker"]]
                if not round2_requests:
                    fail("CLAUDE_GATE_ROUND2_REQUEST_MISSING",
                         "no provider request carried the round-2 prompt")
                carried = any(
                    item["structure"]["phaseMarkers"]["round1"]
                    and any(message.get("containsRound1Assistant") or message["role"] == "assistant"
                            for message in item["structure"]["messages"])
                    for item in round2_requests)
                result["round2RequestCarriedRound1Context"] = carried
                if not carried:
                    fail("CLAUDE_GATE_ROUND2_CONTEXT_MISSING",
                         "the round-2 provider request did not carry the round-1 conversation")
                result["backgroundRequests"] = [
                    {"model": item["structure"].get("model"),
                     "markers": item["structure"]["phaseMarkers"],
                     "roles": [message["role"] for message in item["structure"]["messages"]]}
                    for item in live_requests
                    if not any(item["structure"]["phaseMarkers"].values())]

            unknown = run_unknown_model(
                client, runtime, workspace, opened, production, endpoint, credential_id,
                live=live)
            result["unknownModel"] = unknown

            result["credential"] = {
                # The fake endpoint can see the bearer token; a real endpoint
                # cannot be asked, so live mode records that the answer itself
                # (rounds completed with the model's reply) is the evidence.
                # In live mode the request headers are not observable, so the
                # field stays boolean-or-null and the *inference* is recorded
                # separately: only an authenticated request can produce a real
                # answer. Naming the inference where a reader looks for the
                # observation is what "verified-by-real-answer" used to hide.
                "injectedTokenReachedProvider": (
                    None if live else
                    all(item["authorizationMatchesInjectedToken"]
                        for item in endpoint.requests) and bool(endpoint.requests)
                ),
                "credentialObservation": (
                    "inferred-from-real-answer; request headers are not observable live"
                    if live else "observed on the fake endpoint"
                ),
                "unauthorizedRequests": None if live else endpoint.unauthorized,
                "tokenInEvents": INJECTED_CREDENTIAL.decode(errors="replace") in json.dumps(
                    session["events"]),
                # The chain runs before the outcome is merged, so this covers what the
        # report holds *so far*; the complete report is checked once it is
        # assembled (see `assert_report_is_credential_free`).
        "tokenInReportableState": INJECTED_CREDENTIAL.decode(errors="replace")
                                         in json.dumps(REPORT),
            }
            assert_no_credential_exposure(result["credential"], prefix="CLAUDE")
            result["stateScan"] = scan_state(runtime, session, native_id)
            result["deltaAttribution"] = delta_attribution(session)
            return result
    finally:
        runtime.stop()



def assert_no_credential_exposure(credential: dict, *, prefix: str) -> None:
    """The credential facts are assertions, not decoration.

    Every gate records whether the injected token reached the durable event
    stream or this run's report. Recording it and moving on would make the
    headline safety claim - the credential reaches nothing but the provider -
    something the report *shows* rather than something the run *enforces*: a
    leak would print `tokenIn*=true` and still exit 0. A true value fails here,
    under a typed code, with the field names only (never the token).
    """
    exposed = sorted(
        key for key, value in credential.items()
        if key.startswith("tokenIn") and value is True
    )
    if exposed:
        fail(f"{prefix}_GATE_CREDENTIAL_EXPOSED",
             f"the injected credential reached: {exposed}")

def report_text(report: dict) -> str:
    """The report as text, for the "did the credential reach it" checks.

    An unrenderable value becomes a placeholder rather than an exception: this
    call must never be the thing that ends a run, or a credential question would
    be replaced by a crash.
    """
    return json.dumps(report, sort_keys=True,
                      default=lambda value: f"<unserializable {type(value).__name__}>")


def assert_report_is_credential_free(report: dict, *, prefix: str) -> None:
    """The whole report, once it exists, carries no credential material.

    The in-chain check sees a partial report (the outcome is merged after the
    chain returns), so this is the one that covers what the run actually
    publishes: the outcome, the diagnostics and the phase evidence.
    """
    if INJECTED_CREDENTIAL.decode(errors="replace") in report_text(report):
        fail(f"{prefix}_GATE_CREDENTIAL_IN_REPORT",
             "the injected credential appears in this run's report")


def profile_version(client, runtime, profile_id: str) -> int:
    """The current Profile version, for a compare-and-set configuration write."""
    for item in wire_post(client, runtime.token, "profiles.list", {
        "includeArchived": True,
    })["items"]:
        if item["id"] == profile_id:
            return int(item["version"])
    fail("CLAUDE_GATE_PROFILE_MISSING", f"profile {profile_id} was not listed")


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
        fail("CLAUDE_GATE_STRAY_DELTA", f"{len(stray)} deltas do not belong to a turn of this Session")
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
            fail("CLAUDE_GATE_TURN_" + session["turns"][index]["state"].upper(),
                 json.dumps(REPORT["diagnostics"])[:1500])
        time.sleep(0.05)
    fail("CLAUDE_GATE_TURN_TIMEOUT", f"turn {index} of session {session_id} did not reach {state}")


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
        # A terminal turn records its *inner* failure in the event payload:
        # `turn.capture` carries the capture layer's typed code and
        # `turn.state` the outer one. Keeping only the state text threw
        # that away, so a failed capture could not be attributed to the
        # layer that refused it.
        entry = {"kind": event["kind"],
                 "text": str(data.get("text") or data.get("state") or "")[:200]}
        for key in ("error_code", "code", "state", "retryable"):
            if key in data and str(data[key]) != entry["text"]:
                entry[key] = str(data[key])[:200]
        events.append(entry)
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


def run_unknown_model(client, runtime, workspace, opened, production, endpoint,
                      credential_id, *, live: bool = False) -> dict:
    """An unknown product model: observe what this harness actually does.

    Deliberate difference from the pi/hermes/opencode gates, recorded instead
    of asserted: Claude Code documents that it accepts any model id ("Claude
    Code skips validation for the model ID ... so you can use any string your
    API endpoint accepts"), and its adapter mirrors a custom-model row for the
    configured value. The harness-side "refused before any provider request"
    invariant therefore does not hold for this family - the model-validation
    boundary lives at the endpoint, not in the harness. This phase records the
    turn outcome and exactly which requests left, so the report shows what an
    unsupported model id does on this chain.
    """
    provider = wire_post(client, runtime.token, "providerModels.create", {
        "requestId": "claude-gate-unknown-provider", "displayName": "DeepSeek unknown",
        "harness": "claude-code", "provider": production.CLAUDE_PROVIDER, "credentialId": credential_id,
        "configuration": [], "models": [{
            "modelId": "deepseek-unknown", "displayName": "Unknown",
            "availability": "available", "unavailableReason": None,
        }],
    })["providerModel"]
    profile = client.post("/api/v1/profiles", headers={
        "Authorization": f"Bearer {runtime.token}",
        "Idempotency-Key": "claude-gate-unknown-profile",
    }, json={"name": "claude-code unknown model", "harness_type": "claude-code",
             "configuration": {}, "credential_id": credential_id}).json()
    configured = wire_post(client, runtime.token, "profiles.updateConfig", {
        "requestId": "claude-gate-unknown-config", "profileId": profile["profile_id"],
        "expectedVersion": profile_version(client, runtime, profile["profile_id"]),
        "values": [{"controlId": "model", "value": {
            "providerId": provider["id"], "modelId": "deepseek-unknown",
        }}],
    })["profile"]
    before = None if live else len(endpoint.requests)
    sent = wire_post(client, runtime.token, "sessions.createAndSend", {
        "requestId": "claude-gate-unknown-send", "workspaceId": opened["id"],
        "profileId": configured["id"], "overrides": [],
        "message": {"text": "This model does not exist.", "attachments": []},
    })
    deadline = time.monotonic() + 120.0
    while time.monotonic() < deadline:
        session = runtime.repository.get_session(sent["session"]["id"])
        if session["turns"] and session["turns"][0]["state"] in {"completed", "failed", "cancelled"}:
            break
        time.sleep(0.05)
    else:
        fail("CLAUDE_GATE_TURN_TIMEOUT", "the unknown-model turn never reached a terminal state")
    turn = session["turns"][0]
    deltas = [event["data"]["text"] for event in session["events"]
              if event.get("turn_id") == turn["id"] and event["kind"] == "message.delta"]
    requests_after = None if live else len(endpoint.requests)
    extra = None if requests_after is None else requests_after - (before or 0)
    models_seen = None if live else [
        item["structure"].get("model") for item in endpoint.requests[(before or 0):]]
    # Measured on 2026-09-16 and then pinned: the bridge's model-availability
    # check refuses an unadvertised id before any provider request, exactly
    # like the other ACP families - the "any model id accepted" clause in
    # Claude Code's docs applies to the endpoint's ids, not to the adapter's
    # advertised config options.
    if extra is not None and extra != 0:
        fail("CLAUDE_GATE_UNKNOWN_MODEL_REACHED_PROVIDER",
             f"the refused model produced {extra} provider requests")
    if turn["state"] != "failed":
        fail("CLAUDE_GATE_UNKNOWN_MODEL_TURN_NOT_FAILED",
             f"the unknown-model turn ended {turn['state']!r}")
    return {
        "state": turn["state"],
        "errorCode": turn.get("error_code"),
        "providerRequestsAfter": extra,
        "modelsSeenOnWire": models_seen,
        "deltas": deltas,
        "note": (
            "claude-code accepts arbitrary model ids by design (validation "
            "belongs to the endpoint); this phase records what an unlisted id "
            "does instead of asserting a harness-side refusal."
        ),
    }


def scan_state(runtime, session: dict, native_id: str) -> dict:
    """The credential must not appear in any captured native state."""
    checkpoint = json.loads(runtime.objects.read(session["checkpoint"]["object_digest"]))
    hits = []
    total = 0
    for item in checkpoint.get("files", []):
        content = runtime.objects.read(item["digest"])
        total += len(content)
        if INJECTED_CREDENTIAL in content:
            hits.append(item["path"])
    return {"files": len(checkpoint.get("files", [])), "bytes": total,
            "tokenHits": hits, "tokenInState": bool(hits)}


def cleanup_check(temporary: Path, workspace: Path, token_path: Path | None,
                  authorized_secret: Path | None = None) -> None:
    """Nothing this gate projected may survive the run.

    `token_path` is the gate's own temporary token. `authorized_secret` is the
    user's locator in live mode, and the run proves it is still there rather than
    asserting it in prose: this gate reads it and never writes or deletes it.
    """
    worker_root = temporary / "worker-root"
    leftovers = [name for name in ("views", "secrets") if (worker_root / name).exists()]
    if leftovers:
        fail("CLAUDE_GATE_WORKER_LEFTOVER", f"the Worker kept {leftovers}")
    survivors = subprocess.run(
        ["pgrep", "-af", "claude-agent-acp"], capture_output=True, text=True,
    ).stdout.splitlines()
    if survivors:
        fail("CLAUDE_GATE_DSH_PROCESS_ALIVE", f"a Pi adapter process survived: {survivors[:2]}")
    token_removed = True
    if token_path is not None:
        if token_path.exists():
            token_path.unlink()
        token_removed = not token_path.exists()
        if not token_removed:
            fail("CLAUDE_GATE_CLEANUP_FAILED", "the temporary fake token could not be removed")
    remove_tree(workspace)
    REPORT.setdefault("cleanup", {}).update({
        "workerProjectionsRemoved": True, "adapterProcessesRemoved": True,
        "gateTokenRemoved": token_removed,
        # A real check, not a literal: the authorized locator is the user's file
        # and this run must leave it exactly where it found it.
        "authorizedLocatorDeleted": (
            None if authorized_secret is None else not Path(authorized_secret).exists()
        ),
        "workspaceRemoved": not workspace.exists(),
    })


if __name__ == "__main__":
    raise SystemExit(main())
