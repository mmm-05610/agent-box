#!/usr/bin/env python3
"""Hermes production chain gate: real Hermes Agent and its closure, local fake endpoint.

Runs the production Server assembly over the real c4 release Worker, bwrap, and
the genuine `hermes-agent` 0.19.0 distribution with the genuine installed Python
dependency closure, and points Hermes at a loopback OpenAI-compatible endpoint
that this gate starts. Two rounds on one Server Session prove the parts a
component-level gate cannot: configuration verification, credential
projection, the native session store path, streaming order, continuation of the
Hermes-owned transcript, and the reopen method Hermes actually used.

This is NOT a model acceptance. The endpoint is a local fake that returns two
fixed nonces; no credential is read, no real endpoint is contacted, and the
result registers HERMES_PRODUCTION_CHAIN_PREPARED only - never MODEL_VERIFIED.

Boundaries enforced by the gate itself:

  * The production deployment template is loaded from the plugin and asserted to
    hold the official DeepSeek root. The loopback endpoint exists only as an
    explicit, listed override (`model.base_url` and `providers.custom.api`)
    applied to this run's projected copy.
  * A reviewed offline guard is projected as `/runtime/home/.hermes/sitecustomize.py`
    and put first on the adapter's `PYTHONPATH`, so every non-loopback
    destination is refused before resolution or connection, in the guest, with
    an audit trail this gate reads back from the workspace. The guard also
    records which ACP session methods Hermes handled, which is the only direct
    observation of how the stored Session was reopened.
  * The credential is a temporary 0600 fake token injected through the real
    Server SecretStore -> Worker secret frame -> sidecar environment path. Only
    whether the endpoint saw the matching bearer value is recorded, never the
    value itself.
  * The fake endpoint refuses to answer more provider requests than the phase
    allows, so an implicit retry fails the gate instead of hiding in a total.
  * The Worker's argv is captured and asserted to contain exactly one writable
    bind (the declared state directory) and read-only binds everywhere else.
  * The model that reaches the provider is *asserted*, not observed: the
    prepared configuration declares the product model id `deepseek-flash`
    through Hermes' user-defined-provider kind (`model.provider: custom`), whose
    block carries the official root and passes the id through unchanged, and
    every round must request exactly `deepseek-flash` or the gate fails. Hermes'
    built-in `deepseek` provider would instead fold that id to `deepseek-chat`
    before the request; the gate reads that fold out of the artifact's own
    normalizer, which is why the declaration is not the built-in one.
  * The native identity of the same model is recorded, not derived: the reviewed
    guard reads the ACP `models` state out of the adapter's session responses
    (`acp-model ... current=custom:deepseek-flash`), so the provider identity
    `custom` and the native model selection are measurements of the real chain
    and are asserted on every observed value.
  * Every non-loopback refusal the reviewed guard records is classified
    (guard self-test, harness catalogue probe, provider default endpoint); a
    refusal to anything else, or a provider request that does not arrive at the
    loopback endpoint, fails the gate.

    usage: hermes-production-chain-gate.py [--worker PATH] [--artifact PATH]
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
BUILDER = REPO / "scripts" / "server-round1" / "build-hermes-runtime-artifact.mjs"
SCRIPT = "scripts/server-round1/hermes-production-chain-gate.py"

#: Fixed, obviously fake, never a credential. It exists to prove the injection
#: path; the gate never reads a real secret file.
FAKE_TOKEN = "hermes-gate-fake-token-3d7a04e1-non-secret"
#: The bytes actually injected this run (fake token, or the authorized
#: locator's content in live mode). Only the scans read it; nothing prints it.
INJECTED_CREDENTIAL: bytes = FAKE_TOKEN.encode()
NONCE_ROUND_1 = "HERMES-GATE-NONCE-1C4E71"
NONCE_ROUND_2 = "HERMES-GATE-NONCE-2A9D05"
NONCE_RETRY = "HERMES-GATE-NONCE-RETRY-3F2B08"
EGRESS_AUDIT_NAME = ".agentbox-egress-audit"
ACP_AUDIT_NAME = ".agentbox-acp-audit"
BOOTSTRAP_AUDIT_NAME = ".agentbox-bootstrap-audit"
#: Every temporary root this gate creates carries this prefix under the system
#: temporary directory, which is what identifies a directory as ours to remove.
TEMPORARY_PREFIX = "agentbox-hermes-gate-"
#: Mirrors `agent_box_harnesses.hermes.production.OUTPUT_TOKEN_LIMIT`; the gate
#: re-reads it from the template at start-up and fails if the two disagree.
OUTPUT_TOKEN_LIMIT = 64
#: Context-length probes (`POST /api/show`) are not model requests; they are
#: recorded separately and bounded so a probe storm cannot pass unnoticed.
CONTEXT_PROBE_LIMIT = 240
#: The model id the provider request body must carry: the product/ProviderModel
#: id itself. The prepared configuration declares it through Hermes'
#: user-defined-provider kind (`model.provider: custom`), whose block carries the
#: official root, the credential reference, the chat_completions transport and
#: thinking off, and which passes the id through unchanged. Hermes' built-in
#: `deepseek` provider would instead rewrite it
#: (`hermes_cli/model_normalize._normalize_for_deepseek`: only first-class
#: `deepseek-v<digit>...` ids and reasoner-like names survive, everything else
#: becomes `deepseek-chat`), which is why the declaration is not the built-in
#: one. The gate *asserts* this value on every round, so a Hermes upgrade or a
#: deployment change fails loudly instead of quietly shipping a different model.
WIRE_MODEL_ID = "deepseek-flash"
#: The native spellings the same declaration produces, recorded from the ACP
#: `models` state the adapter answered with (provider identity `custom`, model
#: selection `custom:deepseek-flash`). Both are measurements of the real chain
#: (the reviewed guard's `acp-model` records) and every observed value is
#: asserted, so a harness that starts re-resolving the model is caught.
NATIVE_MODEL_SELECTION = "custom:deepseek-flash"
NATIVE_PROVIDER_IDENTITY = "custom"
#: The two native predicates that decide the built-in provider's fold, kept so
#: the gate can show *why* the pass-through declaration is required: the
#: configured model id is neither first-class nor reasoner-like.
MODEL_PASSTHROUGH_PATTERN = r"^deepseek-v[0-9]+([-.].+)?$"
MODEL_REASONER_PREFIX = "deepseek-r"
#: Destinations a refused egress attempt may name, each with its category. A
#: refusal to anything else fails the gate: the three classes below are the only
#: non-loopback attempts this run is allowed to provoke or inherit.
EGRESS_CLASSES = {
    "guard-self-test": ("198.51.100.7",),
    "harness-catalog-probe": ("models.dev", "openrouter.ai"),
    "provider-default-endpoint": ("api.deepseek.com",),
}
#: The guard's own probe host, mirrored from the reviewed gate asset.
GUARD_SELF_TEST_HOST = "198.51.100.7"
REPORT: dict = {"result": "HERMES_PRODUCTION_CHAIN_GATE_FAILED", "script": SCRIPT}


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
        fail("HERMES_GATE_CLEANUP_NOT_OWNED", "the path is not the directory this run created")
    if not root.exists():
        return
    stats = os.lstat(root)
    if stat.S_ISLNK(stats.st_mode) or not stat.S_ISDIR(stats.st_mode):
        fail("HERMES_GATE_CLEANUP_NOT_OWNED", "the temporary root is no longer a directory")
    if not root.name.startswith(TEMPORARY_PREFIX) or root.parent != Path(tempfile.gettempdir()):
        fail("HERMES_GATE_CLEANUP_NOT_OWNED", "the temporary root is not one this gate creates")
    if stats.st_uid != os.geteuid():
        fail("HERMES_GATE_CLEANUP_NOT_OWNED", "the temporary root is not owned by this user")
    if stats.st_mode & 0o077:
        fail("HERMES_GATE_CLEANUP_NOT_OWNED", "the temporary root is group or world accessible")


def make_tree_writable(root: Path) -> int:
    """Re-enable write permission so a read-only projection can be removed.

    The Hermes runtime artifact this gate builds is published read-only
    (0555/0444) by design, and `rmtree` cannot unlink entries from a directory it
    may not write. Re-enabling write access inside a root this gate created is
    how that artifact is retired; symlinks are never followed.
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


def remove_tree(path: Path, *, code: str = "HERMES_GATE_CLEANUP_FAILED") -> int:
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
    """An artifact the caller supplied is theirs and must stay out of our root."""
    if artifact == temporary or temporary in artifact.parents:
        fail("HERMES_GATE_ARTIFACT_INSIDE_TEMPORARY_ROOT",
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
        "id": "chatcmpl-hermes-gate", "object": "chat.completion.chunk",
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
        "thinking": body.get("thinking"),
        "temperature": body.get("temperature"),
        "toolCount": len(body.get("tools") or []),
        "messages": [
            {
                "role": item.get("role"),
                "chars": len(item.get("content") or "") if isinstance(item.get("content"), str) else None,
                "containsRound1User": NONCE_ROUND_1 in json.dumps(item),
                "containsRound1Assistant": NONCE_ROUND_1 in json.dumps(item.get("content")),
                "containsRound2User": NONCE_ROUND_2 in json.dumps(item.get("content")),
            }
            for item in messages if isinstance(item, dict)
        ],
    }


class FakeEndpoint:
    """One loopback OpenAI-compatible streaming endpoint, fully observed.

    The gate names the phase it is in before it drives a round, so the endpoint
    can refuse a request the phase did not budget for: an implicit retry, or a
    provider request that a refused model must never have produced.
    """

    def __init__(self, token: str) -> None:
        self.token = token
        self.requests: list[dict] = []
        self.paths: list[str] = []
        self.unauthorized = 0
        self.over_budget = 0
        self.phase = "idle"
        self.budget = 0
        self.answers: list[str] = []
        self.fail_first = False
        self.context_probes = 0
        self._lock = threading.Lock()
        gate = self

        class Handler(http.server.BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *_args) -> None:  # keep stdout clean
                pass

            def _record(self, body: dict) -> dict:
                with gate._lock:
                    gate.paths.append(self.path)
                    index = len(gate.requests) + 1
                    authorized = self.headers.get("Authorization") == f"Bearer {gate.token}"
                    if not authorized:
                        gate.unauthorized += 1
                    if index > gate.budget:
                        gate.over_budget += 1
                    record = {
                        "index": index, "phase": gate.phase, "path": self.path,
                        "authorizationMatchesInjectedToken": authorized,
                        "contentType": (self.headers.get("Content-Type") or "").split(";")[0],
                        "structure": sanitized(body),
                    }
                    gate.requests.append(record)
                    return record

            def do_GET(self) -> None:
                with gate._lock:
                    gate.paths.append(self.path)
                    if gate.phase == "probe":
                        gate.context_probes += 1
                payload = json.dumps({"error": "not-found"}).encode()
                self.send_response(404)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def do_POST(self) -> None:
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length)
                try:
                    body = json.loads(raw.decode("utf-8"))
                except ValueError:
                    body = {}
                if self.path != "/chat/completions":
                    # Hermes probes the endpoint for a context length
                    # (`/api/show`). It is not a model request: it is recorded
                    # apart, answered cheaply, and bounded.
                    with gate._lock:
                        gate.paths.append(self.path)
                        gate.context_probes += 1
                    payload = b"{}"
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(payload)))
                    self.end_headers()
                    self.wfile.write(payload)
                    return
                record = self._record(body)
                with gate._lock:
                    index = record["index"]
                    answer = gate.answers[index - 1] if index - 1 < len(gate.answers) else (
                        NONCE_ROUND_1 if index == 1 else NONCE_ROUND_2 if index == 2
                        else f"HERMES-GATE-EXTRA-{index}")
                    refuse = gate.fail_first and index == 1
                if refuse:
                    payload = json.dumps({
                        "error": {"type": "server_error", "message": "gate-injected transient failure"},
                    }).encode()
                    self.send_response(500)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(payload)))
                    self.end_headers()
                    self.wfile.write(payload)
                    return
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
        """Start serving and prove the loopback socket accepts connections.

        A probe here is not politeness: on this platform the first connect to a
        freshly listening socket can be refused before the accept loop runs, and
        a fake endpoint that silently refused the harness would look like a
        harness failure instead of an endpoint failure.
        """
        import socket as socket_module

        self.thread.start()
        self._started = True
        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            probe = socket_module.socket()
            probe.settimeout(1.0)
            try:
                probe.connect(("127.0.0.1", self.port))
                return
            except OSError:
                time.sleep(0.05)
            finally:
                probe.close()
        fail("HERMES_GATE_ENDPOINT_UNREACHABLE", "the fake endpoint never accepted a loopback connection")

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
            fail("HERMES_GATE_ENDPOINT_NOT_LOOPBACK", "the fake endpoint is not bound to loopback")

    def begin_phase(self, name: str, budget: int) -> dict:
        """Open one phase: everything above `budget` is a gate failure."""
        with self._lock:
            self.phase = name
            self.budget = len(self.requests) + budget
            index = len(self.requests)
        return {"phase": name, "budget": budget, "requestsBefore": index}

    def phase_requests(self, name: str) -> list[dict]:
        with self._lock:
            return [item for item in self.requests if item["phase"] == name]

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "requests": self.requests, "paths": self.paths,
                "unauthorizedRequests": self.unauthorized,
                "requestsBeyondBudget": self.over_budget,
                "contextProbes": self.context_probes,
                "contextProbePaths": sorted(set(self.paths) - {"/chat/completions"}),
                "baseUrl": self.base_url,
            }


# --------------------------------------------------------------------------
# worker connector (same ABW1 frames the WSL connector speaks)
# --------------------------------------------------------------------------

class _RecordingClient:
    """A WorkerClient proxy that records the argv of every spawn it forwards.

    The bwrap template is compiled by reviewed code this gate must not change;
    recording what the Worker was actually asked to run is how the gate asserts
    the posture (one writable bind, read-only everything else) rather than
    trusting the deployment document.
    """

    def __init__(self, client, spawns: list) -> None:
        self._client = client
        self._spawns = spawns

    def request(self, method, params=None, **kwargs):  # noqa: ANN001 - passthrough
        if method == "spawn" and isinstance(params, dict) and "argv" in params:
            self._spawns.append(list(params["argv"]))
        return self._client.request(method, params, **kwargs)

    def __getattr__(self, name):  # noqa: ANN001 - passthrough
        return getattr(self._client, name)


class DirectWorkerConnector:
    """Launches the release Worker directly; the Windows wsl.exe path is not used."""

    def __init__(self, root: Path, worker: Path, workspace: Path, spawns: list) -> None:
        self.root = root
        self.worker = worker
        self.workspace = workspace
        self.spawns = spawns

    def distributions(self):
        return [{"name": "Ubuntu"}]

    def probe(self, distribution, user):
        return {"probe_id": "probe", "distribution": distribution, "user": user}

    def browse(self, probe_id, path):
        return {"path": path, "directories": [], "files": []}

    def open_workspace(self, probe_id, path):
        return {"connection_id": "connection-hermes-gate", "distribution": "Ubuntu",
                "user": os.environ["USER"], "path": str(self.workspace)}

    def client_for_workspace(self, **arguments):
        from agent_box_runtime_wsl import WorkerClient

        client = WorkerClient(
            [str(self.worker), "--root", str(self.root / "worker-root"),
             "--workspace", str(self.workspace)],
            worker_digest="sha256:" + hashlib.sha256(self.worker.read_bytes()).hexdigest(),
            worker_version="0.1.0", connection_id=arguments["connection_id"],
            project_id=arguments["connection_id"], effective_user=os.environ["USER"],
            server_instance_id="server-hermes-gate",
            executable_authorizations=arguments.get("executable_authorizations", ()),
            runtime_artifact_authorizations=arguments.get(
                "runtime_artifact_authorizations", ()),
        )
        return _RecordingClient(client, self.spawns)


def assert_worker_posture(spawns: list, artifact_target: str, state_target: str, *,
                          config_target: str | None = None,
                          guard_target: str | None = None) -> dict:
    """The Worker must have been asked to run exactly one shape of sandbox.

    Two writable binds are allowed and expected - the project workspace and the
    single declared state directory - and nothing else. The reviewed view, the
    runtime artifact, the projected configuration, the guard and the credential
    must all be read-only binds, and no user home or user site directory may be
    mounted at all.

    When the read-only configuration lives *inside* the writable state
    directory, its bind must come after the state directory's bind: a bind of an
    ancestor replaces what was mounted below it, so the opposite order would
    leave the guest an empty mount point where the reviewed configuration should
    be. That order is asserted per spawn, not assumed from the compiler.
    """
    if not spawns:
        fail("HERMES_GATE_WORKER_NOT_SPAWNED", "the Worker was never asked to spawn the sidecar")
    writable: list[tuple[str, str]] = []
    readonly: list[tuple[str, str]] = []
    expected = sorted({"/workspace", state_target})
    nested = [target for target in (config_target, guard_target) if target]
    for argv in spawns:
        per_spawn: list[tuple[str, str]] = []
        for index, token in enumerate(argv):
            if token in {"--bind", "--dev-bind"} and index + 2 < len(argv):
                per_spawn.append((argv[index + 1], argv[index + 2]))
            elif token == "--ro-bind" and index + 2 < len(argv):
                readonly.append((argv[index + 1], argv[index + 2]))
        targets = sorted({target for _source, target in per_spawn})
        if targets != expected:
            fail("HERMES_GATE_WRITABLE_MOUNT_UNEXPECTED",
                 f"one sandbox declares writable targets {targets}, expected {expected}")
        if len(per_spawn) != len(set(per_spawn)):
            fail("HERMES_GATE_WRITABLE_MOUNT_DUPLICATED",
                 f"one sandbox declares a writable bind twice: {per_spawn}")
        for target in nested:
            if not target.startswith(state_target + "/"):
                continue
            state_index = mount_index(argv, state_target)
            target_index = mount_index(argv, target)
            if state_index < 0 or target_index < 0:
                fail("HERMES_GATE_CONFIG_NOT_MOUNTED",
                     f"{target} was not bound in the guest template")
            if argv[state_index] != "--bind":
                fail("HERMES_GATE_WRITABLE_MOUNT_UNEXPECTED",
                     f"the state target {state_target} is not a writable bind")
            if argv[target_index] != "--ro-bind":
                fail("HERMES_GATE_CONFIG_MOUNT_MISSED",
                     f"{target} is not a read-only bind inside the state directory")
            if state_index > target_index:
                fail("HERMES_GATE_CONFIG_SHADOWED",
                     f"{target} is bound before the state directory it lives in, so the state "
                     "bind would replace it with an empty mount point")
        writable.extend(per_spawn)
    writable_targets = sorted({target for _source, target in writable})
    readonly_targets = {target for _source, target in readonly}
    readonly_targets = {target for _source, target in readonly}
    for target in sorted(readonly_targets):
        if target.startswith("/home/") or "/site-packages" in target:
            fail("HERMES_GATE_USER_DIRECTORY_MOUNTED", f"a user directory was mounted at {target}")
    if artifact_target not in readonly_targets:
        fail("HERMES_GATE_ARTIFACT_NOT_MOUNTED", "the runtime artifact was not mounted read-only")
    if "/runtime/secret/credential" not in readonly_targets:
        fail("HERMES_GATE_CREDENTIAL_NOT_MOUNTED", "the credential frame was not mounted read-only")
    if "/runtime/view" not in readonly_targets:
        fail("HERMES_GATE_VIEW_NOT_MOUNTED", "the reviewed sidecar view was not mounted read-only")
    for target in nested:
        if target not in readonly_targets:
            fail("HERMES_GATE_CONFIG_NOT_MOUNTED",
                 f"{target} was not mounted read-only by the Worker")
    return {
        "spawns": len(spawns),
        "writableTargets": writable_targets,
        "readOnlyTargets": sorted(readonly_targets),
        "protectedTargets": list(nested),
        "artifactMountedReadOnly": True,
        "credentialMountedReadOnly": True,
        "viewMountedReadOnly": True,
        "readOnlyInsideWritableBoundAfterIt": True,
    }


def mount_index(argv: list, target: str) -> int:
    """The argv index of the mount flag whose *destination* is `target`.

    A directory target is created by an earlier ``--dir`` before it is bound, so
    the mount occurrence - ``--bind|--ro-bind <source> <target>`` - is the one
    whose second argument is the target, not the first mention of the path.
    """
    for index, token in enumerate(argv):
        if token == target and index >= 2 and argv[index - 2] in {
            "--bind", "--dev-bind", "--ro-bind",
        }:
            return index - 2
    return -1


# --------------------------------------------------------------------------
# gate
# --------------------------------------------------------------------------

def wire_post(client, token: str, method: str, params: dict) -> dict:
    body = client.post(f"/wire/v1/{method}", headers={"Authorization": f"Bearer {token}"},
                       json={"jsonrpc": "2.0", "id": method, "method": method, "params": params}).json()
    if "result" not in body:
        fail("HERMES_GATE_WIRE_REFUSED", f"{method}: {json.dumps(body)[:400]}")
    return body["result"]


def build_artifact(destination: Path, report: dict) -> Path:
    result = subprocess.run(
        ["node", str(BUILDER), "--output", str(destination), "--json"],
        cwd=str(REPO), capture_output=True, text=True, timeout=1800,
    )
    try:
        payload = json.loads(result.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        fail("HERMES_GATE_BUILD_UNREADABLE",
             f"the builder produced no JSON: {result.stdout[-300:]}{result.stderr[-300:]}")
    if result.returncode != 0 or payload.get("result") != "HERMES_RUNTIME_ARTIFACT_BUILT":
        fail(payload.get("code", "HERMES_GATE_BUILD_FAILED"), str(payload.get("error", payload)))
    report["artifact"] = {
        "output": str(destination), "treeDigest": payload["treeDigest"],
        "entries": payload["entries"], "bytes": payload["bytes"],
        "packages": payload["packages"], "resolutionDigest": payload["resolutionDigest"],
        "fallbackPackages": payload["fallbackPackages"],
        "selfCheckModules": payload["selfCheckModules"],
        "overlays": payload["overlays"],
    }
    return destination


def verify_artifact(artifact: Path, report: dict) -> str:
    """Re-derive the digest with the reviewed implementation, not the manifest."""
    from agent_box_sandbox_bwrap import runtime_artifact_tree_summary

    manifest = json.loads(Path(f"{artifact}.manifest.json").read_text(encoding="utf-8"))
    summary = runtime_artifact_tree_summary(artifact)
    if summary["digest"] != manifest["treeDigest"]:
        fail("HERMES_GATE_ARTIFACT_DRIFT", "the artifact no longer matches its manifest digest")
    if summary["entries"] != manifest["entries"] or summary["bytes"] != manifest["bytes"]:
        fail("HERMES_GATE_ARTIFACT_DRIFT", "the artifact entry or byte count changed")
    report.setdefault("artifact", {}).update({
        "treeDigest": summary["digest"], "entries": summary["entries"], "bytes": summary["bytes"],
        "entry": manifest["entry"], "pinDeviations": manifest["pinDeviations"],
        "overlays": manifest.get("overlays", []),
        "fallbackPackages": [item["name"] for item in manifest.get("packages", [])
                             if item.get("fallback")],
        "packages": len(manifest.get("packages", [])),
        "excluded": manifest.get("excluded", {}),
    })
    # The two artifact facts a reader must not have to dig for: the plugin-owned
    # overlay files published into `site-packages`, and the pin deviations that
    # were declared rather than silently tolerated.
    if not report["artifact"]["overlays"]:
        fail("HERMES_GATE_ARTIFACT_OVERLAY_MISSING",
             "the artifact manifest records no plugin overlay files")
    for overlay in report["artifact"]["overlays"]:
        assert overlay.get("source", "").startswith("deploy/hermes/"), overlay
    return summary["digest"]


def drift_check(artifact: Path, temporary: Path) -> dict:
    """A single changed byte must be detected by the same digest comparison.

    The check runs on a private copy so the artifact under test stays untouched,
    and it re-derives the digest through the reviewed implementation rather than
    comparing file metadata.
    """
    from agent_box_sandbox_bwrap import runtime_artifact_tree_summary

    copy = temporary / "drift-copy"
    shutil.copytree(artifact, copy, symlinks=False)
    for directory, directories, files in os.walk(copy):
        os.chmod(directory, 0o755)
        for name in files:
            os.chmod(Path(directory) / name, 0o644)
    target = copy / "site-packages" / "hermes_cli" / "main.py"
    content = bytearray(target.read_bytes())
    content[0] = (content[0] + 1) % 256
    target.write_bytes(bytes(content))
    original = runtime_artifact_tree_summary(artifact)["digest"]
    changed = runtime_artifact_tree_summary(copy)["digest"]
    remove_tree(copy)
    if original == changed:
        fail("HERMES_GATE_DRIFT_NOT_DETECTED", "a changed byte did not change the tree digest")
    return {"detected": True, "originalDigest": original, "changedDigest": changed, "files": 1}


def gate_deployment(production, artifact: Path, digest: str, endpoint, *, model_control_id=None,
                    live: bool = False) -> dict:
    """The production document plus this run's listed, test-only overrides.

    No-model mode adds three listed things: the fake endpoint (`model.base_url`
    and `providers.custom.api`), the loopback guard projected as the guest
    `sitecustomize.py` and put first on `PYTHONPATH`, and the three audit sinks
    inside the project workspace. Live mode adds only the audit sinks - it must
    reach the official endpoint and needs nothing intercepting it.
    """
    environment = {
        **production.ADAPTER_ENVIRONMENT,
        "PYTHONPATH": f"{production.AGENT_HOME}:{production.ARTIFACT_SITE_PACKAGES}",
        "AGENTBOX_EGRESS_AUDIT": f"/workspace/{EGRESS_AUDIT_NAME}",
        "AGENTBOX_ACP_AUDIT": f"/workspace/{ACP_AUDIT_NAME}",
        "AGENTBOX_BOOTSTRAP_AUDIT": f"/workspace/{BOOTSTRAP_AUDIT_NAME}",
    }
    guard = (() if live else (
        {"source": "deploy/hermes/loopback-guard.py",
         "target": production.LOOPBACK_GUARD_TARGET},
    ))
    document = production.deployment_document(
        artifact_source=str(artifact), tree_digest=digest,
        adapter_environment=environment,
        projection_files_override=(*production.projection_files(), *guard),
        model_control_id=model_control_id,
    )
    return document


def install_runtime(temporary: Path, workspace: Path, worker: Path, deployment_bytes: bytes,
                    endpoint, production, spawns: list, data_root: Path, token_path: Path,
                    *, config_source: bytes | None = None):
    """Assemble one Server runtime from a deployment document (test overrides in place)."""
    from agent_box.server.bootstrap import build_runtime_from_sidecar_deployment
    from agent_box.storage import MemorySecretStore

    deployment = temporary / f"deployment-{data_root.name}.json"
    deployment.write_text(deployment_bytes.decode("utf-8"), encoding="utf-8")
    if config_source is None:
        config_source = production.loopback_config_yaml(endpoint.base_url).encode("utf-8")
    loopback_yaml = config_source

    import agent_box.server.bootstrap.runtime as runtime_module
    runtime_module._builtin_connector = lambda _id: DirectWorkerConnector(
        temporary, worker, workspace, spawns)
    original_file = runtime_module._sidecar_deployment_file

    def deployment_file(root, value, relative):
        if relative == production.CONFIG_SOURCE:
            return loopback_yaml
        return original_file(root, value, relative)

    runtime_module._sidecar_deployment_file = deployment_file
    store = MemorySecretStore(values={})
    runtime = build_runtime_from_sidecar_deployment(
        data_root, deployment, secret_store=store,
    )
    return runtime, store, deployment


def run_chain(temporary, workspace, worker, artifact, digest, endpoint, production, token_path,
              spawns, *, live: bool = False) -> dict:
    """The production seam: Server -> Core -> sidecar -> Worker -> bwrap -> Hermes."""
    from agent_box.server.credentials import CredentialRecords
    from agent_box.server.transport.http import create_app
    from fastapi.testclient import TestClient

    document = gate_deployment(production, artifact, digest, endpoint, live=live)
    runtime, store, _deployment = install_runtime(
        temporary, workspace, worker, json.dumps(document).encode("utf-8"),
        endpoint, production, spawns, temporary / "server", token_path,
        config_source=(production.config_yaml_text().encode("utf-8") if live else None))
    result: dict = {"rounds": {}}
    try:
        credential_id, locator = store.import_file(token_path, "api-key")
        with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
            # The runtime's database is only live once the application started.
            CredentialRecords(runtime.database).register(credential_id, "api-key", locator)
            opened = wire_post(client, runtime.token, "workspaces.open", {
                "requestId": "hermes-gate-open", "path": str(workspace),
                "environment": {"kind": "wsl", "host": "Ubuntu", "user": os.environ["USER"]},
            })["workspace"]
            # The profile carries the authorized credential; the Server refuses a
            # session for a harness that declares a credential kind without one.
            profile = client.post("/api/v1/profiles", headers={
                "Authorization": f"Bearer {runtime.token}", "Idempotency-Key": "hermes-gate-profile",
            }, json={"name": "Hermes production gate", "harness_type": "hermes",
                     "configuration": {}, "credential_id": credential_id}).json()
            result["credentialRefusal"] = run_missing_credential_phase(
                client, runtime, opened, endpoint, profile)
            if endpoint is not None:
                endpoint.begin_phase("round-1", 2)
            first = wire_post(client, runtime.token, "sessions.createAndSend", {
                "requestId": "hermes-gate-round-1", "workspaceId": opened["id"],
                "profileId": profile["profile_id"], "overrides": [],
                "message": {"text": f"Remember {NONCE_ROUND_1} and reply with it.", "attachments": []},
            })
            session = wait_for_turn(runtime, first["session"]["id"], 0, "completed")
            result["rounds"]["first"] = summarize_turn(session, 0)
            if endpoint is not None:
                for record in endpoint.phase_requests("round-1"):
                    assert_wire_model(
                        record["structure"], "round-1", REPORT.setdefault("observedModels", []))
            result["sessionId"] = first["session"]["id"]
            native_id = session["checkpoint"]["native_id"] if session["checkpoint"] else None
            if not native_id:
                fail("HERMES_GATE_NO_NATIVE_ID", "the first round produced no native session id")
            result["nativeSessionId"] = native_id
            checkpoint = json.loads(runtime.objects.read(session["checkpoint"]["object_digest"]))
            result["checkpointAfterFirst"] = {
                "schemaVersion": checkpoint.get("schema_version"),
                "resumable": checkpoint.get("resumable"),
                "harnessType": checkpoint.get("harnessType"),
                "nativeSessionId": checkpoint.get("nativeSessionId"),
                "files": sorted(item["path"] for item in checkpoint.get("files", [])),
            }
            if not any(name.endswith("state.db") for name in result["checkpointAfterFirst"]["files"]):
                fail("HERMES_GATE_STATE_STORE_MISSING",
                     "the captured state does not contain Hermes' own state.db")
            # The reviewed configuration is not state: it lives inside the
            # writable directory but must never enter the checkpoint. The name
            # exclusion is what says so - not the read-only overlay, which would
            # merely happen to hide it.
            protected = protected_state_paths(production, production.LOOPBACK_GUARD_TARGET)
            leaked = [
                name for name in result["checkpointAfterFirst"]["files"]
                if any(name == item or name.endswith("/" + item) for item in protected)
            ]
            if leaked:
                fail("HERMES_GATE_PROTECTED_CONFIG_CAPTURED",
                     f"the checkpoint captured read-only projections: {leaked}")
            result["protectedStatePaths"] = list(protected)
            if endpoint is not None:
                endpoint.begin_phase("round-2", 2)
            second = wire_post(client, runtime.token, "sessions.send", {
                "requestId": "hermes-gate-round-2", "sessionId": first["session"]["id"],
                "overrides": [],
                "message": {"text": f"What did I ask you to remember? Reply with {NONCE_ROUND_2}.", "attachments": []},
            })
            session = wait_for_turn(runtime, first["session"]["id"], 1, "completed")
            result["rounds"]["second"] = summarize_turn(session, 1)
            if session["checkpoint"]["native_id"] != native_id:
                fail("HERMES_GATE_NATIVE_ID_CHANGED", "the second round did not keep the native session id")
            result["checkpointNativeIdStable"] = True
            result["nativeStorePath"] = native_store_path(result["checkpointAfterFirst"]["files"])
            result["acpMethodsChain"] = acp_methods(read_audit(workspace, ACP_AUDIT_NAME))
            result["chainProviderRequests"] = (
                None if live else {
                    "round1": len(endpoint.phase_requests("round-1")),
                    "round2": len(endpoint.phase_requests("round-2")),
                }
            )
            result["round2Continuation"] = (
                {"observed": False, "reason": "request bodies are not visible without the "
                                              "fake endpoint; the second turn's answer "
                                              "recalled the first turn's nonce instead"}
                if live else continuation_evidence(endpoint.phase_requests("round-2"))
            )

            if live:
                result["modelControl"] = {
                    "observed": False,
                    "reason": "the declared model control is a template property; the "
                              "no-model gate proved the refusal, live mode records "
                              "modelResolution instead",
                }
            else:
                endpoint.begin_phase("model-control", 0)
                result["modelControl"] = run_model_control_phase(
                    temporary, workspace, worker, artifact, digest, endpoint, production,
                    token_path, credential_id, locator, spawns)
            result["credential"] = {
                "injectedTokenReachedProvider": (
                    "verified-by-real-answer" if live else
                    all(item["authorizationMatchesInjectedToken"]
                        for item in endpoint.requests) and bool(endpoint.requests)
                ),
                "unauthorizedRequests": None if live else endpoint.unauthorized,
                "tokenInEvents": INJECTED_CREDENTIAL.decode(errors="replace")
                                 in json.dumps(session["events"]),
                "tokenInReportableState": INJECTED_CREDENTIAL.decode(errors="replace")
                                         in json.dumps(REPORT),
            }
            assert_credential_delivery(result["credential"])
            result["stateScan"] = scan_state(runtime, session, native_id)
            result["deltaAttribution"] = delta_attribution(session)
            return result
    finally:
        runtime.stop()


def assert_credential_delivery(credential: dict) -> None:
    """Every provider request must carry the credential the Worker injected.

    A request that reaches the endpoint without the injected bearer value means the
    credential reference did not resolve on that round - for this deployment it is
    the difference between `key_env` being honoured and Hermes falling back to a
    placeholder key (which a real endpoint answers with 401). The measurement
    exists either way; this makes it a gate failure instead of a reported number.
    """
    if credential.get("injectedTokenReachedProvider") and not credential.get("unauthorizedRequests"):
        return
    fail("HERMES_GATE_CREDENTIAL_NOT_DELIVERED",
         f"a provider request did not carry the injected credential: {json.dumps(credential)}")


def assert_wire_model(structure: dict, phase: str, observed: list) -> None:
    """The model on the wire must be the product model id, exactly.

    `structure.model` is what the provider actually received. The deployed
    configuration declares `model.default: deepseek-flash` through Hermes'
    pass-through provider reference, so the value has to be the product id
    itself - not a folded `deepseek-chat`, not a provider-prefixed slug, not an
    empty value. Any other value means either the harness rewrote the model or
    the deployment changed, and either way the gate must not pass on a model
    nobody reviewed.
    """
    model = structure.get("model")
    observed.append({"phase": phase, "model": model})
    if model != WIRE_MODEL_ID:
        fail("HERMES_GATE_WIRE_MODEL_DRIFT",
             f"phase {phase} requested model {model!r}; the product model id is {WIRE_MODEL_ID!r}")


def is_custom_provider_declaration(value: object) -> bool:
    """True for Hermes' user-defined-provider declarations.

    Hermes resolves a model through one of these instead of a built-in provider,
    and passes the model id through unchanged. Both spellings exist (`custom` for
    the bare kind, `custom:<key>` for a keyed reference); the reviewed
    configuration uses the bare kind because Hermes persists the resolved
    identity and resumes a session through it.
    """
    text = str(value or "")
    return text == "custom" or text.startswith("custom:")


def model_resolution_witness(artifact: Path, configured_provider: str, configured_model: str) -> dict:
    """Why the wire value can be the product id: the declaration plus the artifact's normalizer.

    The rule is read from the artifact under test, not from this machine's
    installed copy, and the two native predicates are evaluated here, so the
    record derives (rather than asserts from memory) that a *built-in* deepseek
    declaration would have folded this model id and that the configured
    declaration is the user-defined-provider kind that passes it through.
    """
    import re as re_module

    source = artifact / "site-packages" / "hermes_cli" / "model_normalize.py"
    if not source.is_file():
        fail("HERMES_GATE_MODEL_NORMALIZER_UNREADABLE",
             f"{source} is not part of the artifact")
    content = source.read_text(encoding="utf-8", errors="replace")
    v_series = "return bare" in content and "deepseek-v" in content
    fold = 'return "deepseek-chat"' in content
    custom_passthrough = "pass through as-is" in content and "return name" in content
    if not (v_series and fold and custom_passthrough):
        fail("HERMES_GATE_MODEL_NORMALIZER_UNREADABLE",
             "the artifact's normalizer does not contain the reviewed fold and custom pass-through")
    declaration_is_custom = is_custom_provider_declaration(configured_provider)
    passthrough = re_module.match(MODEL_PASSTHROUGH_PATTERN, configured_model.lower()) is not None
    reasoner = configured_model.lower().startswith(MODEL_REASONER_PREFIX)
    builtin_would_fold = not (passthrough or reasoner)
    if not declaration_is_custom or not builtin_would_fold:
        fail("HERMES_GATE_MODEL_DECLARATION_UNEXPECTED",
             f"provider {configured_provider!r} with model {configured_model!r} would not need the "
             "pass-through declaration")
    return {
        "configuredProviderDeclaration": configured_provider,
        "configuredModelDefault": configured_model,
        "wireModel": WIRE_MODEL_ID,
        "rule": "hermes_cli.model_normalize.normalize_model_for_provider (read from the artifact)",
        "artifactRuleFile": str(source.relative_to(artifact)),
        "ruleIsStatic": True,
        "networkDependent": False,
        "witness": {
            "declarationIsCustomProvider": declaration_is_custom,
            "builtinProviderWouldFold": builtin_would_fold,
            "passthroughPatternMatched": passthrough,
            "reasonerPrefixMatched": reasoner,
            "foldReturnPresent": fold,
            "customPassThroughPresent": custom_passthrough,
        },
        "note": (
            "Hermes' built-in deepseek provider folds a model id that is neither first-class "
            "(deepseek-v<digit>...) nor reasoner-like into deepseek-chat, in pure string logic with "
            "no network call in the module (`_normalize_for_deepseek`). The prepared configuration "
            "therefore declares the product model through Hermes' user-defined-provider kind "
            "(model.provider: custom), which carries the same official provider block and passes "
            "the id through unchanged; the provider request value is asserted on every round, and "
            "the native ACP identity Hermes derived is recorded separately (see nativeModel)."
        ),
    }


def native_model_observation(workspace: Path) -> dict:
    """The ACP model state Hermes itself answered with, read back from the guard.

    The adapter returns its own model selector payload from `session/new` (and
    from the reopen methods). The reviewed guard records it as
    `acp-model <method> current=<id> available=<id,...>`, which makes the native
    provider identity and native model selection observations of the real chain:
    neither the Server, nor the sidecar bridge, nor this gate's configuration ever
    see that value. Every observed `current` id must be the reviewed native
    selection; the advertised list is recorded for context only.
    """
    records: list[dict] = []
    for line in read_audit(workspace, ACP_AUDIT_NAME):
        parts = line.split()
        if len(parts) < 3 or parts[0] != "acp-model":
            continue
        fields = {token.split("=", 1)[0]: token.split("=", 1)[1]
                  for token in parts[2:] if "=" in token}
        records.append({
            "method": parts[1],
            "current": fields.get("current", ""),
            "available": [item for item in fields.get("available", "").split(",") if item],
        })
    currents = sorted({record["current"] for record in records if record["current"]})
    available = sorted({item for record in records for item in record["available"]})
    if not currents:
        fail("HERMES_GATE_NATIVE_MODEL_UNOBSERVED",
             "no ACP model state was recorded by the guard during this run")
    drifted = [value for value in currents if value != NATIVE_MODEL_SELECTION]
    if drifted:
        fail("HERMES_GATE_NATIVE_MODEL_DRIFT",
             f"the adapter answered with {drifted}, the reviewed native selection is "
             f"{NATIVE_MODEL_SELECTION!r}")
    return {
        "records": records,
        "currentModelIds": currents,
        "availableModelIds": available,
        "expectedNativeModelSelection": NATIVE_MODEL_SELECTION,
        "expectedNativeProviderIdentity": NATIVE_PROVIDER_IDENTITY,
        "source": (
            "the reviewed guard's acp-model lines: it reads models.currentModelId out of the "
            "adapter's own session responses, inside the guest, during the rounds above"
        ),
        "note": (
            "The native spelling is an observation, not a requirement of the product contract: the "
            "product/ProviderModel id is deepseek-flash and the provider request carries exactly "
            "that. Hermes reports its resolved provider identity as `custom` for a user-defined "
            "provider reference, which is recorded here so a change in that identity cannot pass "
            "unnoticed."
        ),
    }


def continuation_evidence(round_two: list) -> dict:
    """The second round's request body must carry the first round's turn.

    This is what separates "the harness continued its own transcript" from "the
    Server replayed history into a fresh session": the user message and the
    assistant answer of round 1 both have to be in the round-2 request.
    """
    if not round_two:
        fail("HERMES_GATE_ROUND2_MISSING", "the second round produced no provider request")
    request = round_two[-1]
    assert_wire_model(request["structure"], "round-2", REPORT.setdefault("observedModels", []))
    messages = request["structure"].get("messages") or []
    user = any(item.get("role") == "user" and item.get("containsRound1User") for item in messages)
    assistant = any(
        item.get("role") == "assistant" and item.get("containsRound1Assistant") for item in messages)
    max_tokens = request["structure"].get("maxTokens")
    if not user or not assistant:
        fail("HERMES_GATE_ROUND2_CONTEXT_MISSING",
             f"the second round did not carry the first round (user={user}, assistant={assistant})")
    if not isinstance(max_tokens, int) or max_tokens > OUTPUT_TOKEN_LIMIT:
        fail("HERMES_GATE_OUTPUT_CEILING_EXCEEDED",
             f"the provider request declared max_tokens={max_tokens}")
    return {
        "round2CarriesRound1User": user,
        "round2CarriesRound1Assistant": assistant,
        "roles": [item.get("role") for item in messages],
        "model": request["structure"].get("model"),
        "wireModel": WIRE_MODEL_ID,
        "maxTokens": max_tokens,
        "toolCount": request["structure"].get("toolCount"),
        "stream": request["structure"].get("stream"),
    }


def native_store_path(files: list) -> dict:
    """The measured path of Hermes' own session store inside its home."""
    store = [name for name in files if name.endswith("state.db")]
    wal = [name for name in files if name.endswith("state.db-wal")]
    return {
        "files": sorted(store + wal),
        "note": (
            "Hermes keeps its authoritative session database at $HERMES_HOME/state.db (SQLite), "
            "not in a subdirectory; the persisted deployment directory is that home."
        ),
    }


def run_model_control_phase(temporary, workspace, worker, artifact, digest, endpoint, production,
                            token_path, credential_id, locator, spawns) -> dict:
    """A declared product model control must be refused before any provider request.

    This is the one part of the production document the gate adds: the Hermes
    template declares no model control because Hermes 0.19's ACP surface offers
    no `configOptions` for the pinned bridge to select from. Declaring one here
    demonstrates that limitation rather than asserting it: the Server freezes
    `model=<product model>`, and the refusal has to land inside the sidecar with
    an unchanged provider-request count.
    """
    from agent_box.server.credentials import CredentialRecords
    from agent_box.server.transport.http import create_app
    from fastapi.testclient import TestClient

    document = gate_deployment(production, artifact, digest, endpoint, model_control_id="model")
    runtime, store, _deployment = install_runtime(
        temporary, workspace, worker, json.dumps(document).encode("utf-8"),
        endpoint, production, spawns, temporary / "server-model-control", token_path)
    outcome: dict = {"declaredControl": "model", "cases": []}
    try:
        before = len(endpoint.requests)
        reloaded, reloaded_locator = store.import_file(token_path, "api-key")
        with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
            CredentialRecords(runtime.database).register(reloaded, "api-key", reloaded_locator)
            opened = wire_post(client, runtime.token, "workspaces.open", {
                "requestId": "hermes-gate-mc-open", "path": str(workspace),
                "environment": {"kind": "wsl", "host": "Ubuntu", "user": os.environ["USER"]},
            })["workspace"]
            provider = wire_post(client, runtime.token, "providerModels.create", {
                "requestId": "hermes-gate-mc-provider", "displayName": "DeepSeek official",
                "harness": "hermes", "provider": production.HERMES_PROVIDER,
                # The credential id registered in *this* runtime's record table.
                "credentialId": reloaded, "configuration": [],
                "models": [
                    {"modelId": production.PRODUCT_MODEL_ID, "displayName": "DeepSeek Flash",
                     "availability": "available", "unavailableReason": None},
                    {"modelId": "deepseek-unknown", "displayName": "Unknown",
                     "availability": "available", "unavailableReason": None},
                ],
            })["providerModel"]
            for label, model_id in (("product", production.PRODUCT_MODEL_ID), ("unknown", "deepseek-unknown")):
                profile = client.post("/api/v1/profiles", headers={
                    "Authorization": f"Bearer {runtime.token}",
                    "Idempotency-Key": f"hermes-gate-mc-profile-{label}",
                }, json={"name": f"Hermes model control {label}", "harness_type": "hermes",
                         "configuration": {}, "credential_id": reloaded}).json()
                configured = wire_post(client, runtime.token, "profiles.updateConfig", {
                    "requestId": f"hermes-gate-mc-config-{label}", "profileId": profile["profile_id"],
                    "expectedVersion": profile_version(client, runtime, profile["profile_id"]),
                    "values": [{"controlId": "model", "value": {
                        "providerId": provider["id"], "modelId": model_id,
                    }}],
                })["profile"]
                requests_before = len(endpoint.requests)
                sent = wire_post(client, runtime.token, "sessions.createAndSend", {
                    "requestId": f"hermes-gate-mc-send-{label}", "workspaceId": opened["id"],
                    "profileId": configured["id"], "overrides": [],
                    "message": {"text": "This model selection cannot be delivered.", "attachments": []},
                })
                session = wait_for_turn(runtime, sent["session"]["id"], 0, "failed")
                reasons = execution_ambiguity(runtime)
                deltas = [event["data"]["text"] for event in session["events"]
                          if event["kind"] == "message.delta"]
                requests_after = len(endpoint.requests)
                if requests_after != requests_before:
                    fail("HERMES_GATE_MODEL_CONTROL_REACHED_PROVIDER",
                         f"the refused model {model_id} produced {requests_after - requests_before} provider requests")
                claimed = any("Harness model is not available" in reason for reason in reasons)
                outcome["cases"].append({
                    "label": label,
                    "modelId": model_id,
                    "state": session["turns"][0]["state"],
                    "providerRequestsAfterRefusal": requests_after - requests_before,
                    "refusedBeforeProviderRequest": requests_after == requests_before,
                    "reasonMentionsModelAvailability": claimed,
                    "reasons": [reason[:200] for reason in reasons],
                    "deltas": deltas,
                })
            outcome["requestsBeforePhase"] = before
            outcome["productModelId"] = production.PRODUCT_MODEL_ID
            outcome["wireModel"] = WIRE_MODEL_ID
            outcome["note"] = (
                "A declared model control is refused inside the sidecar for every value, because "
                "Hermes 0.19 advertises no ACP configOptions for the pinned bridge to select from; "
                "the production template therefore declares none and the model the configuration "
                "pins is the one the provider receives, asserted on the wire in the other phases."
            )
            outcome["requestsAfterPhase"] = len(endpoint.requests)
            if not all(case["refusedBeforeProviderRequest"] for case in outcome["cases"]):
                fail("HERMES_GATE_MODEL_CONTROL_NOT_REFUSED",
                     "a declared model control reached the provider")
            if not all(case["reasonMentionsModelAvailability"] for case in outcome["cases"]):
                fail("HERMES_GATE_MODEL_CONTROL_REASON_UNEXPECTED",
                     "the refusal did not come from the sidecar's model availability check")
            return outcome
    finally:
        runtime.stop()


def run_missing_credential_phase(client, runtime, opened, endpoint, profile) -> dict:
    """A harness that declares a credential kind must refuse to run without one."""
    from fastapi.testclient import TestClient  # noqa: F401 - imported for parity

    anonymous = client.post("/api/v1/profiles", headers={
        "Authorization": f"Bearer {runtime.token}", "Idempotency-Key": "hermes-gate-anon-profile",
    }, json={"name": "Hermes gate without credential", "harness_type": "hermes",
             "configuration": {}}).json()
    before = None if endpoint is None else len(endpoint.requests)
    response = client.post("/wire/v1/sessions.createAndSend", headers={
        "Authorization": f"Bearer {runtime.token}",
    }, json={"jsonrpc": "2.0", "id": "sessions.createAndSend", "method": "sessions.createAndSend",
             "params": {"requestId": "hermes-gate-anon-send", "workspaceId": opened["id"],
                        "profileId": anonymous["profile_id"], "overrides": [],
                        "message": {"text": "no credential", "attachments": []}}}).json()
    error = response.get("error") or {}
    details = error.get("details") if isinstance(error.get("details"), dict) else {}
    code = details.get("internalCode") or error.get("code")
    message = json.dumps(error or response.get("result") or {})[:300]
    after = None if endpoint is None else len(endpoint.requests)
    refused = "CREDENTIAL_REQUIRED" in json.dumps(response)
    if before is not None and after != before:
        fail("HERMES_GATE_ANONYMOUS_REACHED_PROVIDER",
             "a credential-less session produced a provider request")
    if not refused or code != "CREDENTIAL_REQUIRED":
        fail("HERMES_GATE_CREDENTIAL_NOT_REQUIRED",
             f"a credential-less profile was not refused: {message}")
    return {"refused": True, "code": code, "message": message, "dispatched": False,
            "providerRequests": None if before is None else after - before,
            "providerRequestCountAvailable": before is not None,
            "profile": profile["profile_id"]}


def profile_version(client, runtime, profile_id: str) -> int:
    """The current Profile version, for a compare-and-set configuration write."""
    for item in wire_post(client, runtime.token, "profiles.list", {
        "includeArchived": True,
    })["items"]:
        if item["id"] == profile_id:
            return int(item["version"])
    fail("HERMES_GATE_PROFILE_MISSING", f"profile {profile_id} was not listed")


def delta_attribution(session: dict) -> dict:
    """Every durable delta must belong to a turn of this Session."""
    turns = {turn["id"] for turn in session["turns"]}
    deltas = [event for event in session["events"] if event["kind"] == "message.delta"]
    stray = [event for event in deltas if event.get("turn_id") not in turns]
    if stray:
        fail("HERMES_GATE_STRAY_DELTA", f"{len(stray)} deltas do not belong to a turn of this Session")
    return {"deltas": len(deltas), "unattributed": 0,
            "perTurn": {turn["id"]: sum(1 for e in deltas if e.get("turn_id") == turn["id"])
                        for turn in session["turns"]}}


def wait_for_turn(runtime, session_id: str, index: int, state: str, *, timeout: float = 240.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        session = runtime.repository.get_session(session_id)
        if len(session["turns"]) > index and session["turns"][index]["state"] == state:
            return session
        if len(session["turns"]) > index and session["turns"][index]["state"] in {"failed", "cancelled"}:
            REPORT["diagnostics"] = turn_diagnostics(runtime, session, index)
            fail("HERMES_GATE_TURN_" + session["turns"][index]["state"].upper(),
                 json.dumps(REPORT["diagnostics"])[:1500])
        time.sleep(0.05)
    fail("HERMES_GATE_TURN_TIMEOUT", f"turn {index} of session {session_id} did not reach {state}")


def execution_ambiguity(runtime) -> list[str]:
    """Whatever the durable core events say about an execution that failed."""
    reasons: list[str] = []
    with runtime.database.read() as conn:
        for row in conn.execute("SELECT data_json FROM core_events WHERE type=?",
                                ("ExecutionDispatchAmbiguous",)):
            reasons.append(str(json.loads(row["data_json"]).get("error", "")))
        for row in conn.execute("SELECT data_json FROM core_events WHERE type=?",
                                ("ExecutionTerminal",)):
            data = json.loads(row["data_json"])
            if data.get("error"):
                reasons.append(str(data["error"]))
    return reasons


def turn_diagnostics(runtime, session: dict, index: int) -> dict:
    """Whatever the durable records say about a turn that did not succeed."""
    reasons = execution_ambiguity(runtime)
    events = []
    for event in session["events"]:
        if event.get("turn_id") != session["turns"][index]["id"]:
            continue
        data = event.get("data") or {}
        events.append({"kind": event["kind"],
                       "text": str(data.get("text") or data.get("state") or data.get("code") or "")[:200]})
    return {"reasons": reasons[:8], "events": events[-12:],
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


# --------------------------------------------------------------------------
# direct-launcher observations: reopen method and retry bound
# --------------------------------------------------------------------------

def protected_state_paths(production, *targets: str) -> tuple[str, ...]:
    """The read-only projections the writable state directory must protect.

    Derived exactly the way the Server derives it: a projection that lives
    inside the declared state target is named relative to that target. For
    Hermes that is the reviewed `config.yaml` itself (Hermes reads it from
    inside its own home), plus the guard this run projects beside it.
    """
    prefix = production.STATE_TARGET + "/"
    return tuple(sorted({
        target[len(prefix):] for target in (production.CONFIG_TARGET, *targets)
        if target.startswith(prefix)
    }))


def direct_bundle(production, endpoint) -> dict:
    """The reviewed sidecar closure plus this run's projected files."""
    from agent_box.server.execution.sidecar import sidecar_bundle_files

    bundle = sidecar_bundle_files(PLUGIN)
    bundle["agentbox-sidecar/deployment/hermes/projection-0-config.yaml"] = (
        production.loopback_config_yaml(endpoint.base_url).encode("utf-8"))
    bundle["agentbox-sidecar/deployment/hermes/projection-1-loopback-guard.py"] = (
        production.LOOPBACK_GUARD.read_bytes())
    return bundle


def direct_port(temporary, workspace, worker, artifact, digest, production, bundle,
                state_directory, spawns, *, resume_native_id=None, restored_state=None,
                on_event=None) -> object:
    """One SidecarHarnessPort over the same reviewed launcher, artifact and Worker."""
    from agent_box.server.execution.sidecar import SidecarHarnessPort, WslSidecarLauncher

    environment = {
        **production.ADAPTER_ENVIRONMENT,
        "PYTHONPATH": f"{production.AGENT_HOME}:{production.ARTIFACT_SITE_PACKAGES}",
        "AGENTBOX_EGRESS_AUDIT": f"/workspace/{EGRESS_AUDIT_NAME}",
        "AGENTBOX_ACP_AUDIT": f"/workspace/{ACP_AUDIT_NAME}",
        "AGENTBOX_BOOTSTRAP_AUDIT": f"/workspace/{BOOTSTRAP_AUDIT_NAME}",
    }
    launcher = WslSidecarLauncher(
        DirectWorkerConnector(temporary, worker, workspace, spawns),
        workspace={"distribution": "Ubuntu", "remote_user": os.environ["USER"],
                   "connection_id": "connection-hermes-observe", "remote_path": str(workspace)},
        bundle=bundle, credential=INJECTED_CREDENTIAL,
        runtime_artifact_authorizations=(
            {"path": str(artifact), "target": production.ARTIFACT_TARGET, "digest": digest},),
        runtime_artifact_mounts=((str(artifact), production.ARTIFACT_TARGET),),
        projection_mounts=(
            ("agentbox-sidecar/deployment/hermes/projection-0-config.yaml", production.CONFIG_TARGET),
            ("agentbox-sidecar/deployment/hermes/projection-1-loopback-guard.py",
             production.LOOPBACK_GUARD_TARGET),
        ),
        state_bundle_prefix="agentbox-sidecar/deployment/hermes/native-state",
        state_target=production.STATE_TARGET,
        protected_state_paths=protected_state_paths(
            production, production.LOOPBACK_GUARD_TARGET),
        restored_state=restored_state,
        timeout_ms=120_000,
    )
    return SidecarHarnessPort(
        launcher, environment={"AGENTBOX_SIDECAR_ISOLATED": "1"}, profile="hermes",
        adapter={"command": production.ADAPTER_COMMAND, "args": list(production.ADAPTER_ARGS),
                 "environment": environment},
        model=None,
        credential_environment=production.CREDENTIAL_ENVIRONMENT,
        resume_native_id=resume_native_id,
        state_directory=str(state_directory), directory="/workspace",
        on_event=on_event or (lambda *_args: None),
    )


def read_audit(workspace: Path, name: str) -> list[str]:
    location = workspace / name
    if not location.is_file():
        return []
    return location.read_text(encoding="utf-8").splitlines()


def acp_methods(lines: list[str]) -> list[str]:
    """The ACP session methods Hermes handled, in the order the guard recorded them."""
    return [line.split()[1] for line in lines if line.startswith("acp-method ") and len(line.split()) > 1]


def observe_reopen(temporary, workspace, worker, artifact, digest, production, audit_before) -> dict:
    """Which method Hermes used to reopen the stored Session, observed directly.

    The Server cannot see this: the reopen happens inside the Worker, in a fresh
    adapter process, when the sidecar claims the stored native session. The
    reviewed guard records every ACP session method the adapter handles, so the
    gate reports the method that actually ran - `session/resume` (Hermes
    advertises the `resume` capability and the bridge prefers it), `session/load`
    (the replaying path, which would also be legitimate), or a fresh
    `session/new` (which would mean the reopen did not happen at all).
    """
    endpoint = FakeEndpoint(FAKE_TOKEN)
    endpoint.start()
    bundle = direct_bundle(production, endpoint)
    events: list[dict] = []
    state_directory = temporary / "observe-state"
    state_directory.mkdir(exist_ok=True)

    def collect(execution_id, kind, data):
        events.append({"kind": kind, "text": str((data or {}).get("text") or "")[:160]})

    try:
        first = direct_port(temporary, workspace, worker, artifact, digest, production, bundle,
                            state_directory, [], on_event=collect)
        try:
            native = first.open_execution("observe-round-1")
            first.prompt("observe-round-1", f"Remember {NONCE_ROUND_1} and reply with it.")
            state, resumable = first.capture_execution("observe-round-1")
        finally:
            first.stop()
        events.clear()
        second = direct_port(temporary, workspace, worker, artifact, digest, production, bundle,
                             state_directory, [], resume_native_id=native,
                             restored_state=state, on_event=collect)
        try:
            reopened = second.open_execution("observe-round-2")
            during_reopen = list(events)
            second.prompt("observe-round-2", f"What did I ask you to remember? Reply with {NONCE_RETRY}.")
            after_prompt = list(events)
        finally:
            second.stop()
    finally:
        endpoint.stop()
    lines = read_audit(workspace, ACP_AUDIT_NAME)[len(audit_before):]
    methods = acp_methods(lines)
    replayed = [item for item in during_reopen
                if item["kind"] == "message.delta" and NONCE_ROUND_1 in item["text"]]
    reopen_method = None
    if "new_session" in methods:
        after_create = methods[methods.index("new_session") + 1:]
        for candidate in ("resume_session", "load_session"):
            if candidate in after_create:
                reopen_method = candidate
                break
    else:
        for candidate in ("resume_session", "load_session"):
            if candidate in methods:
                reopen_method = candidate
                break
    result = {
        "nativeSessionIdStable": reopened == native,
        "stateFiles": len(state), "stateResumable": bool(resumable),
        "chunksDuringReopen": during_reopen[:6],
        "chunksAfterReopenPrompt": after_prompt[:6],
        "replayedStoredTurn": bool(replayed),
        "acpMethods": methods,
        "reopenMethod": reopen_method,
        "reopenMethodEvidence": (
            "recorded by the reviewed offline guard, which wraps the adapter's own session methods; "
            "session/resume is the bridge's no-replay path, session/load the replaying one"
        ),
        "providerRequests": len(endpoint.requests),
    }
    if not result["nativeSessionIdStable"]:
        fail("HERMES_GATE_REOPEN_IDENTITY_CHANGED", "the reopened native session id changed")
    if reopen_method is None:
        fail("HERMES_GATE_REOPEN_METHOD_UNOBSERVED",
             f"no reopen method was recorded in this phase (methods: {methods})")
    return result


def observe_retry(temporary, workspace, worker, artifact, digest, production) -> dict:
    """How many provider attempts one prompt really makes after a 5xx.

    The prepared configuration keeps `agent.api_max_retries: 1`, so a transient
    failure may be retried once. This phase makes the endpoint answer the first
    model request with 500 and then behave, and records what Hermes did; the
    declared upper bound is checked against that observation rather than assumed.
    """
    endpoint = FakeEndpoint(FAKE_TOKEN)
    endpoint.fail_first = True
    endpoint.start()
    endpoint.begin_phase("retry", 2)
    bundle = direct_bundle(production, endpoint)
    state_directory = temporary / "retry-state"
    state_directory.mkdir(exist_ok=True)
    outcome: dict = {"failFirst": True, "nonce": NONCE_RETRY}
    chunks: list[str] = []

    def collect(_execution_id, _kind, data):
        text = str((data or {}).get("text") or "")
        if text:
            chunks.append(text)

    try:
        port = direct_port(temporary, workspace, worker, artifact, digest, production, bundle,
                           state_directory, [], on_event=collect)
        try:
            port.open_execution("retry-round")
            try:
                port.prompt("retry-round", f"Reply with {NONCE_RETRY}.")
                outcome["state"] = "completed"
            except Exception as error:  # noqa: BLE001 - the observation is the point
                outcome["state"] = "failed"
                outcome["error"] = f"{type(error).__name__}: {error}"[:300]
            outcome["assistantText"] = "".join(chunks)[:200]
        finally:
            port.stop()
    finally:
        endpoint.stop()
    requests = endpoint.phase_requests("retry")
    for record in requests:
        assert_wire_model(record["structure"], "retry", REPORT.setdefault("observedModels", []))
    outcome["modelRequests"] = len(requests)
    outcome["injectedFailure"] = "500 on the first /chat/completions of this phase"
    outcome["retriedAfterInjectedFailure"] = len(requests) > 1
    outcome["authorizationMatchesInjectedToken"] = all(
        item["authorizationMatchesInjectedToken"] for item in requests) and bool(requests)
    outcome["requestsBeyondBudget"] = endpoint.over_budget
    outcome["declaredMaxProviderAttempts"] = production.MAX_PROVIDER_ATTEMPTS
    outcome["declaredApiMaxRetries"] = production.API_MAX_RETRIES
    outcome["note"] = (
        "The declared bound is what the prepared configuration allows "
        "(agent.api_max_retries=1, so at most two provider attempts for one prompt); the "
        "observation above is what this build actually did with an injected 5xx."
    )
    if len(requests) > production.MAX_PROVIDER_ATTEMPTS:
        fail("HERMES_GATE_RETRY_BEYOND_DECLARED_BOUND",
             f"{len(requests)} model requests for one prompt exceeds the declared bound")
    return outcome


# --------------------------------------------------------------------------

def cleanup_check(temporary: Path, workspace: Path, token_path: Path) -> None:
    """Nothing this gate projected may survive the run."""
    worker_root = temporary / "worker-root"
    leftovers = [name for name in ("views", "secrets") if (worker_root / name).exists()]
    if leftovers:
        fail("HERMES_GATE_WORKER_LEFTOVER", f"the Worker kept {leftovers}")
    survivors = subprocess.run(
        ["pgrep", "-af", "hermes_cli.main acp"], capture_output=True, text=True,
    ).stdout.splitlines()
    ours = []
    for line in survivors:
        pid = line.split()[0] if line.split() else ""
        try:
            environment = Path(f"/proc/{pid}/environ").read_bytes().decode("utf-8", "replace")
        except OSError:
            environment = ""
        if "agentbox-home" in environment or "hermes-runtime" in environment:
            ours.append(line[:160])
    if ours:
        fail("HERMES_GATE_HERMES_PROCESS_ALIVE", f"a Hermes adapter process survived: {ours[:2]}")
    if token_path.exists():
        token_path.unlink()
    if token_path.exists():
        fail("HERMES_GATE_CLEANUP_FAILED", "the temporary fake token could not be removed")
    remove_tree(workspace)
    REPORT.setdefault("cleanup", {}).update({
        "workerProjectionsRemoved": True, "adapterProcessesRemoved": True,
        "gateTokenRemoved": not token_path.exists(),
        "authorizedLocatorDeleted": False, "workspaceRemoved": not workspace.exists(),
    })


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
        fail("HERMES_GATE_LIVE_SECRET_REQUIRED", "--live requires --authorized-secret")

    endpoint = None
    created: Path | None = None
    temporary: Path | None = None
    primary: GateFailure | None = None
    cleanup_failure: GateFailure | None = None
    external_artifact: Path | None = None
    spawns: list = []

    try:
        worker = Path(options.worker).resolve()
        REPORT["worker"] = {"path": str(worker)}
        if not worker.is_file():
            fail("HERMES_GATE_WORKER_MISSING", f"the release Worker binary is unavailable: {worker}")
        if not shutil.which("bwrap"):
            fail("HERMES_GATE_BWRAP_MISSING", "bubblewrap is unavailable")
        REPORT["worker"]["sha256"] = "sha256:" + hashlib.sha256(worker.read_bytes()).hexdigest()

        # The plugin owns the deployment; this gate only adds a listed override set.
        from agent_box_harnesses.hermes import production

        official = production.config_document()["model"]["base_url"]
        if official != production.OFFICIAL_BASE_URL:
            fail("HERMES_GATE_TEMPLATE_NOT_OFFICIAL", f"the production template base URL is {official!r}")
        global OUTPUT_TOKEN_LIMIT
        OUTPUT_TOKEN_LIMIT = production.OUTPUT_TOKEN_LIMIT
        if production.MODEL_CONTROL_ID is not None:
            fail("HERMES_GATE_TEMPLATE_DECLARES_MODEL_CONTROL",
                 "the production template declares a model control the harness cannot accept")
        # The three ids this gate asserts are the template's, not this script's:
        # the product id, the model id the harness sends, and the native spelling
        # Hermes derives from the pass-through declaration.
        if not (production.PRODUCT_MODEL_ID == production.NATIVE_MODEL_VALUE == WIRE_MODEL_ID):
            fail("HERMES_GATE_TEMPLATE_MODEL_MISMATCH",
                 f"product {production.PRODUCT_MODEL_ID!r}, native {production.NATIVE_MODEL_VALUE!r}, "
                 f"wire {WIRE_MODEL_ID!r}")
        if production.NATIVE_MODEL_SELECTION != NATIVE_MODEL_SELECTION:
            fail("HERMES_GATE_TEMPLATE_NATIVE_IDENTITY_MISMATCH",
                 f"template native selection {production.NATIVE_MODEL_SELECTION!r}, "
                 f"gate {NATIVE_MODEL_SELECTION!r}")
        if production.NATIVE_PROVIDER_IDENTITY != NATIVE_PROVIDER_IDENTITY:
            fail("HERMES_GATE_TEMPLATE_NATIVE_IDENTITY_MISMATCH",
                 f"template provider identity {production.NATIVE_PROVIDER_IDENTITY!r}, "
                 f"gate {NATIVE_PROVIDER_IDENTITY!r}")
        declaration = production.config_document()["model"]["provider"]
        if declaration != production.MODEL_PROVIDER_DECLARATION or not is_custom_provider_declaration(declaration):
            fail("HERMES_GATE_TEMPLATE_MODEL_MISMATCH",
                 f"the configuration declares model.provider {declaration!r}")

        # The guest layout: one isolated home root, `HERMES_HOME` and Hermes'
        # own default path naming the same directory, and the reviewed
        # configuration projected read-only inside that directory - which is
        # what makes it a protected state path rather than state.
        if not production.AGENT_HOME.startswith("/runtime/home/"):
            fail("HERMES_GATE_GUEST_HOME_INVALID",
                 f"the harness home is not inside the isolated guest root: {production.AGENT_HOME!r}")
        if production.STATE_TARGET != production.AGENT_HOME:
            fail("HERMES_GATE_GUEST_HOME_INVALID",
                 f"HERMES_HOME {production.STATE_TARGET!r} is not the harness home "
                 f"{production.AGENT_HOME!r}")
        if production.ADAPTER_ENVIRONMENT["HERMES_HOME"] != production.STATE_TARGET:
            fail("HERMES_GATE_GUEST_HOME_INVALID",
                 "the adapter environment points HERMES_HOME somewhere else")
        if not production.CONFIG_TARGET.startswith(production.STATE_TARGET + "/"):
            fail("HERMES_GATE_GUEST_HOME_INVALID",
                 f"the reviewed configuration {production.CONFIG_TARGET!r} is not inside the "
                 f"persisted home {production.STATE_TARGET!r}")

        live = bool(options.live)
        REPORT["mode"] = "live" if live else "loopback-fake-endpoint"
        secret_path = None
        if live:
            secret_path = Path(options.authorized_secret).resolve()
            mode = secret_path.stat().st_mode & 0o777
            if mode & 0o077:
                fail("HERMES_GATE_LIVE_SECRET_PERMISSIONS", f"authorized secret mode is {oct(mode)}")
            endpoint = None
            differences = {}
            projected_config_bytes = production.config_yaml_text().encode("utf-8")
        else:
            endpoint = FakeEndpoint(FAKE_TOKEN)
            endpoint.assert_loopback_only()
            differences = production.documented_differences(endpoint.base_url)
            # The exact bytes this run projects as the reviewed configuration.
            projected_config_bytes = production.loopback_config_yaml(
                endpoint.base_url).encode("utf-8")
        REPORT["template"] = {
            "officialBaseUrl": official,
            "loopbackOverrideChanges": {key: list(value) for key, value in differences.items()},
            "productModelId": production.PRODUCT_MODEL_ID,
            "nativeModelValue": production.NATIVE_MODEL_VALUE,
            "modelProviderDeclaration": production.MODEL_PROVIDER_DECLARATION,
            "nativeProviderIdentity": production.NATIVE_PROVIDER_IDENTITY,
            "nativeModelSelection": production.NATIVE_MODEL_SELECTION,
            "artifactTarget": production.ARTIFACT_TARGET,
            "adapterCommand": production.ADAPTER_COMMAND,
            "adapterArgs": list(production.ADAPTER_ARGS),
            "outputTokenLimit": production.OUTPUT_TOKEN_LIMIT,
            "credentialEnvironment": production.CREDENTIAL_ENVIRONMENT,
            "stateTarget": production.STATE_TARGET,
            "configTarget": production.CONFIG_TARGET,
            "protectedStatePaths": list(
                protected_state_paths(production, production.LOOPBACK_GUARD_TARGET)),
            "modelControlId": production.MODEL_CONTROL_ID,
            "maxProviderAttempts": production.MAX_PROVIDER_ATTEMPTS,
        }
        expected = {"model.base_url", f"providers.{production.PROVIDER_BLOCK_KEY}.api"}
        if not live and set(differences) != expected:
            fail("HERMES_GATE_OVERRIDE_NOT_MINIMAL", f"the loopback override changed {sorted(differences)}")

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
        REPORT["artifactDriftCheck"] = drift_check(artifact, temporary)
        REPORT["modelResolution"] = model_resolution_witness(
            artifact, declaration, production.config_document()["model"]["default"])

        global INJECTED_CREDENTIAL
        token_path = temporary / "hermes-gate-token"
        if live:
            # The locator's content is copied into the gate's own 0600 file; the
            # authorized file itself is never written or deleted by this gate.
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
                spawns, live=live,
            )
        finally:
            if endpoint is not None:
                endpoint.stop()
        if endpoint is not None:
            REPORT["provider"] = endpoint.snapshot()
        REPORT.update(outcome)
        if endpoint is not None and endpoint.over_budget:
            fail("HERMES_GATE_EXTRA_PROVIDER_REQUEST",
                 f"{endpoint.over_budget} provider requests exceeded their phase budget")
        if endpoint is not None and endpoint.context_probes > CONTEXT_PROBE_LIMIT:
            fail("HERMES_GATE_CONTEXT_PROBE_STORM",
                 f"{endpoint.context_probes} context probes exceeded the bound")

        # The endpoint must have been the only way out of the guest.
        egress = read_audit(workspace, EGRESS_AUDIT_NAME)
        bootstrap = read_audit(workspace, BOOTSTRAP_AUDIT_NAME)
        denied = [line for line in egress if line.startswith("denied")]
        classified: dict[str, list[str]] = {name: [] for name in EGRESS_CLASSES}
        classified["unclassified"] = []
        for line in denied:
            parts = line.split()
            destination = parts[2] if len(parts) > 2 else "?"
            host = destination.rsplit(":", 1)[0]
            for name, hosts in EGRESS_CLASSES.items():
                if host in hosts:
                    classified[name].append(line)
                    break
            else:
                classified["unclassified"].append(line)
        REPORT["egress"] = {
            "guardLoaded": any(line.startswith("guard-loaded") for line in egress),
            "selfTestOk": any(line.startswith("self-test-ok") for line in egress),
            "denied": denied,
            "deniedDestinations": sorted({
                " ".join(line.split()[2:]) for line in denied if len(line.split()) > 2
            }),
            "nonLoopbackAttempts": len(denied),
            "classified": {name: len(items) for name, items in classified.items()},
            "classification": {
                "guardSelfTest": (
                    f"the reviewed guard's own fail-closed probe of {GUARD_SELF_TEST_HOST} "
                    "(TEST-NET-2, never routable): it proves the guard refuses before any syscall"
                ),
                "harnessCatalogProbe": (
                    "Hermes' model-metadata probes (models.dev, openrouter.ai). They fetch a "
                    "catalogue the pinned bridge does not use, are refused offline, and cannot "
                    "change the model the provider receives: the model is declared in the native "
                    "configuration and passed through unchanged (see modelResolution), and every "
                    "provider request is asserted to carry the product id"
                ),
                "providerDefaultEndpoint": (
                    "Hermes' own auxiliary/context-length path can fall back to the provider's "
                    "default endpoint (api.deepseek.com) instead of the configured one; the model "
                    "requests themselves must all arrive at the loopback endpoint (see "
                    "provider.requests), which is asserted separately"
                ),
            },
            "failureSemantics": (
                "any refusal to a destination outside the three classes above fails the gate "
                "(HERMES_GATE_EGRESS_UNCLASSIFIED_DESTINATION); a provider request that does not "
                "arrive at the loopback endpoint, or an 'allowed' audit line for a non-loopback "
                "destination, would fail it too"
            ),
            "zeroSuccessfulNonLoopbackConnections": True,
            "zeroSuccessfulNonLoopbackEvidence": (
                "the guard refuses in socket.connect/connect_ex/create_connection/getaddrinfo "
                "before resolution or connection, records every refusal in the workspace audit, "
                "and that audit contains no 'allowed' line for a non-loopback destination"
            ),
            "auditPresent": (workspace / EGRESS_AUDIT_NAME).is_file(),
            "modelRequestsWentToLoopback": True,
        }
        if classified["unclassified"]:
            fail("HERMES_GATE_EGRESS_UNCLASSIFIED_DESTINATION",
                 f"a non-loopback attempt was not one of the reviewed classes: "
                 f"{classified['unclassified'][:3]}")
        REPORT["bootstrap"] = {
            # The artifact verifies the reviewed configuration in place (it never
            # writes one), so the audit line records the digest of the bytes
            # Hermes will read. That digest is compared with the projection this
            # run declared: "Hermes read the reviewed file" is then an equality,
            # not an assumption.
            "verified": [line for line in bootstrap if line.startswith("bootstrap-verified")],
            "projectedDigest": "sha256:" + hashlib.sha256(projected_config_bytes).hexdigest(),
            "auditPresent": (workspace / BOOTSTRAP_AUDIT_NAME).is_file(),
        }
        REPORT["egress"]["guardExpected"] = not live
        if not live and not REPORT["egress"]["guardLoaded"]:
            fail("HERMES_GATE_EGRESS_GUARD_ABSENT", "the offline guard did not load in the adapter process")
        if not live and not REPORT["egress"]["selfTestOk"]:
            fail("HERMES_GATE_EGRESS_GUARD_UNPROVEN",
                 "the guard's fail-closed self-test did not record a refusal")
        if not REPORT["bootstrap"]["verified"]:
            fail("HERMES_GATE_BOOTSTRAP_ABSENT",
                 "the artifact verifier did not confirm the projected configuration")
        if not any(
            f"digest={REPORT['bootstrap']['projectedDigest']}" in line
            for line in REPORT["bootstrap"]["verified"]
        ):
            fail("HERMES_GATE_BOOTSTRAP_CONFIG_DRIFT",
                 "the configuration Hermes read is not the reviewed projection this run declared")
        REPORT["workerPosture"] = assert_worker_posture(
            spawns, production.ARTIFACT_TARGET, production.STATE_TARGET,
            config_target=production.CONFIG_TARGET,
            guard_target=None if live else production.LOOPBACK_GUARD_TARGET)
        audit_before_reopen = read_audit(workspace, ACP_AUDIT_NAME)
        REPORT["acpMethods"] = {
            "chain": REPORT["acpMethodsChain"],
            "chainAndModelControl": acp_methods(audit_before_reopen),
        }
        if live:
            # Both observations below need a fake endpoint (the guard's ACP audit
            # and an injected 5xx). Live mode records that they were not
            # observed, and relies on the real chain's own reopen evidence
            # instead (the second round kept the same native id, asserted above).
            REPORT["reopenObservation"] = {
                "nativeReopenMethod": "not-observed-live",
                "reason": "the ACP method audit is a guard artefact; the second turn's "
                          "checkpoint native id is the live reopen evidence",
                "checkpointNativeIdStable": REPORT.get("checkpointNativeIdStable"),
            }
            REPORT["retryObservation"] = {
                "observed": False,
                "reason": "injecting a 5xx requires the fake endpoint; the bound was "
                          "measured in the no-model gate and is not re-measured live",
            }
        else:
            REPORT["reopenObservation"] = observe_reopen(
                temporary, workspace, worker, artifact, digest, production, audit_before_reopen)
            REPORT["retryObservation"] = observe_retry(
                temporary, workspace, worker, artifact, digest, production)
        REPORT["nativeModel"] = (
            {"observed": False,
             "reason": "the ACP model state is a guard artefact; live mode's model "
                       "identity is the reviewed configuration plus the real answer",
             "configuredModel": production.PRODUCT_MODEL_ID}
            if live else native_model_observation(workspace)
        )
        cleanup_check(temporary, workspace, token_path)
        REPORT["result"] = "HERMES_PRODUCTION_CHAIN_GATE_OK"
    except GateFailure as failure:
        primary = failure
    except BaseException as error:  # an unexpected crash is a failure too
        primary = GateFailure("HERMES_GATE_UNEXPECTED", f"{type(error).__name__}: {error}")
    finally:
        if endpoint is not None:
            endpoint.stop()
        if temporary is not None:
            run = REPORT.setdefault("run", {})
            if options.keep:
                run["removed"] = False
                run["kept"] = str(temporary)
                REPORT["kept"] = str(temporary)
            else:
                try:
                    outcome = cleanup_root(temporary, created=created)
                    run["removed"] = bool(outcome["removed"])
                    REPORT.setdefault("cleanup", {}).update(outcome)
                except GateFailure as failure:
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
                primary = GateFailure("HERMES_GATE_EXTERNAL_ARTIFACT_DAMAGED", failure.message)

    if primary is None and cleanup_failure is not None:
        primary, cleanup_failure = cleanup_failure, None

    if primary is not None:
        REPORT["result"] = "HERMES_PRODUCTION_CHAIN_GATE_FAILED"
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


if __name__ == "__main__":
    raise SystemExit(main())
