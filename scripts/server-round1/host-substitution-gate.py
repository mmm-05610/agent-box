"""Host substitution gate: the same room, run by a different channel.

The claim under test is that the *host* is a substitution, not a rewrite: the
deployment, the command, the projection list and the state declaration are
identical, and only the channel that stages the bytes and runs the process
changes. This gate runs one Pi chain through the local channel (a bwrap room on
this machine, no Worker anywhere) and asserts the product facts a chain must
produce, plus the position-independence of the room the channel was handed.

No model is called: the endpoint is a loopback OpenAI-compatible fake, exactly as
in the family gates.

usage: host-substitution-gate.py --artifact PATH [--json] [--keep]
"""
from __future__ import annotations

import argparse
import hashlib
import http.server
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import time

REPO = Path(__file__).resolve().parents[2]
PLUGIN = REPO / "plugins" / "agent-box-harnesses"
SCRIPT = "scripts/server-round1/host-substitution-gate.py"

FAKE_TOKEN = "host-gate-fake-token-2f1c07aa-non-secret"
NONCE = "HOST-GATE-NONCE-9C31"
REPORT: dict = {"result": "HOST_SUBSTITUTION_GATE_FAILED", "script": SCRIPT}


def fail(code: str, message: str) -> None:
    REPORT["result"] = "HOST_SUBSTITUTION_GATE_FAILED"
    REPORT["code"] = code
    REPORT["error"] = message
    raise SystemExit(1)


def sha256(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


class FakeEndpoint:
    """One loopback OpenAI-compatible streaming endpoint."""

    def __init__(self, token: str) -> None:
        self.token = token
        self.requests: list[dict] = []
        self._server: http.server.ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None
        self.base_url = ""

    def start(self) -> None:
        gate = self

        class Handler(http.server.BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *_args) -> None:  # keep the gate's output clean
                return

            def do_POST(self) -> None:
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length)
                try:
                    body = json.loads(raw.decode("utf-8"))
                except ValueError:
                    body = {}
                with threading.Lock():
                    gate.requests.append({
                        "path": self.path,
                        "authorizationMatchesInjectedToken": (
                            self.headers.get("Authorization") == f"Bearer {gate.token}"
                        ),
                        "model": body.get("model"),
                        "stream": body.get("stream"),
                        "messages": len(body.get("messages") or []),
                    })
                payload = "".join([
                    'data: {"id":"cmpl","object":"chat.completion.chunk","created":1,'
                    '"model":"deepseek-flash","choices":[{"index":0,"delta":{"content":"'
                    + NONCE + '"}}]}\n\n',
                    'data: {"id":"cmpl","object":"chat.completion.chunk","created":1,'
                    '"model":"deepseek-flash","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
                    "data: [DONE]\n\n",
                ]).encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

        self._server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.base_url = f"http://127.0.0.1:{self._server.server_address[1]}"
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()


def bundle_for(production, endpoint, artifact: Path) -> dict[str, bytes]:
    from agent_box.server.execution.sidecar import sidecar_bundle_files

    bundle = sidecar_bundle_files(PLUGIN)
    catalog = production.loopback_models_document(endpoint.base_url)
    bundle[f"agentbox-sidecar/deployment/pi/{production.MODELS_SOURCE.rsplit('/', 1)[-1]}"] = json.dumps(
        catalog).encode()
    bundle["agentbox-sidecar/deployment/pi/settings.json"] = production.SETTINGS_TEMPLATE.read_bytes()
    return bundle


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact", required=True,
                        help="built Pi runtime artifact (see build-pi-runtime-artifact.mjs)")
    parser.add_argument("--keep", action="store_true")
    parser.add_argument("--json", action="store_true")
    options = parser.parse_args()

    artifact = Path(options.artifact).resolve()
    if not artifact.is_dir():
        fail("HOST_SUBSTITUTION_ARTIFACT_MISSING", f"no artifact directory at {artifact}")

    sys.path.insert(0, str(PLUGIN / "src"))
    from agent_box_harnesses.pi import production  # noqa: E402

    from agent_box.server.execution.local_channel import LocalSidecarLauncher  # noqa: E402
    from agent_box.server.execution.sidecar import SidecarHarnessPort  # noqa: E402

    temporary = Path(tempfile.mkdtemp(prefix="agentbox-host-gate-"))
    workspace = temporary / "workspace"
    workspace.mkdir()
    (workspace / "README.md").write_text("host substitution gate\n")
    endpoint = FakeEndpoint(FAKE_TOKEN)
    endpoint.start()
    events: list[dict] = []
    port = None
    try:
        bundle = bundle_for(production, endpoint, artifact)
        state_directory = temporary / "sidecar-state"
        state_directory.mkdir()
        # Order 45 moved the native state from projected bytes to a real home
        # directory on the machine that runs the turn; the gate stages that
        # directory itself, exactly as the channel would.
        homes = temporary / "homes"
        (homes / "pi-gate" / ".pi").mkdir(parents=True)
        from agent_box.extensions.runtime_composition.sandbox_port import (
            resolve_sandbox_port,
        )

        launcher = LocalSidecarLauncher(
            workspace_path=str(workspace),
            bundle=bundle,
            credential=FAKE_TOKEN.encode(),
            runtime_artifact_mounts=((str(artifact), production.ARTIFACT_TARGET),),
            projection_mounts=(
                ("agentbox-sidecar/deployment/pi/models.json", f"{production.AGENT_HOME}/models.json"),
                ("agentbox-sidecar/deployment/pi/settings.json", f"{production.AGENT_HOME}/settings.json"),
            ),
            home_root=str(homes), home_locator="pi-gate/.pi",
            profile_id="profile-host-gate", harness_type="pi", native_home=".pi",
            state_target=production.STATE_TARGET,
            sandbox_port=resolve_sandbox_port("sandbox-bwrap"),
        )
        port = SidecarHarnessPort(
            launcher, environment={"AGENTBOX_SIDECAR_ISOLATED": "1"}, profile="pi",
            adapter={"command": "/usr/bin/node", "args": [production.ADAPTER_ARTIFACT_ENTRY],
                     "environment": dict(production.ADAPTER_ENVIRONMENT)},
            model=production.PRODUCT_MODEL_ID,
            credential_environment=production.CREDENTIAL_ENVIRONMENT,
            state_directory=str(state_directory), directory="/workspace",
            on_event=lambda _execution, kind, data: events.append(
                {"kind": kind, "text": str((data or {}).get("text") or "")[:120]}),
        )

        native = port.open_execution("substitution-1")
        # The completion contract is the prompt op's own answer: the sidecar
        # reports done, exactly as it does through the Worker-hosted channel.
        answer = port.prompt("substitution-1", f"Remember {NONCE} and reply with it.")
        REPORT["promptResult"] = answer
        state, resumable = port.capture_execution("substitution-1")
        REPORT["nativeSessionId"] = native
        # Order 45 changed the capture contract: it returns audit *facts* about
        # the real home directory (paths, digests, counts), never the bytes.
        RECORD = state if isinstance(state, dict) else {}
        REPORT["stateFiles"] = sorted(
            entry.get("path") for entry in RECORD.get("files", ()) if entry.get("path")
        )
        REPORT["stateAuditTruncated"] = RECORD.get("truncated")
        # `resumable` is the *advertised* capability (Pi's adapter advertises no
        # resume, so it is false in every Pi chain); the continuity fact this
        # gate can prove is that the audit carries this turn's journal file.
        REPORT["stateAdvertisedResumable"] = bool(resumable)
        REPORT["stateCarriesTheTurn"] = any(
            str(path).endswith(".jsonl") for path in REPORT["stateFiles"]
        )
        REPORT["events"] = events
        REPORT["providerRequests"] = endpoint.requests

        # The room the channel ran is the deployable shape: one writable state
        # directory and read-only projections, whatever machine it lands on.
        from agent_box_sandbox_bwrap import compose_sidecar_room

        here = compose_sidecar_room(
            workspace="/local/workspace", staged_view="/local/view", secret="/local/secret",
            base_environment={"AGENTBOX_SIDECAR_ISOLATED": "1"},
            projection_mounts=(("deployment/models.json", f"{production.AGENT_HOME}/models.json"),),
            runtime_artifact_mounts=(("/local/artifact", production.ARTIFACT_TARGET),),
            state_home_source="/local/homes/pi-gate/.pi", state_target=production.STATE_TARGET,
        )
        there = compose_sidecar_room(
            workspace="/wsl/workspace", staged_view="/wsl/view", secret="/wsl/secret",
            base_environment={"AGENTBOX_SIDECAR_ISOLATED": "1"},
            projection_mounts=(("deployment/models.json", f"{production.AGENT_HOME}/models.json"),),
            runtime_artifact_mounts=(("/wsl/artifact", production.ARTIFACT_TARGET),),
            state_home_source="/wsl/homes/pi-gate/.pi", state_target=production.STATE_TARGET,
        )
        bindings = (("/local/view", "/wsl/view"), ("/local/workspace", "/wsl/workspace"),
                    ("/local/secret", "/wsl/secret"), ("/local/artifact", "/wsl/artifact"),
                    ("/local/homes", "/wsl/homes"))

        def normalize(argv, index):
            values = [pair[index] for pair in bindings]
            return [value if not any(v in value for v in values) else
                    next(f"«{i}»" for i, v in enumerate(values) if v in value) for value in argv]

        REPORT["roomDiffersOnlyInBindings"] = normalize(here.argv, 0) == normalize(there.argv, 1)
        REPORT["roomWritableMount"] = here.writable_state_mount
    finally:
        if port is not None:
            try:
                port.stop()
            except BaseException:
                pass
        endpoint.stop()
        if not options.keep:
            shutil.rmtree(temporary, ignore_errors=True)
        roots = sorted(Path(tempfile.gettempdir()).glob("agentbox-local-channel-*"))
        REPORT["cleanup"] = {
            "temporaryRemoved": not temporary.exists(),
            "localChannelRoots": len(roots) if options.keep else 0,
        }
        if roots:
            # A failure needs the child's own words. The launcher writes them to
            # a file precisely so nothing here can block on a pipe.
            tails = []
            for root in roots[:2]:
                stderr = root / "stderr.log"
                if stderr.exists():
                    tails.append({"root": root.name, "stderrTail": stderr.read_text(errors="replace")[-1200:]})
            REPORT["localChannelStderr"] = tails

    deltas = [item for item in events if item["kind"] == "message.delta"]
    if not deltas:
        fail("HOST_SUBSTITUTION_NO_STREAM", "the local channel produced no streamed output")
    if NONCE not in "".join(item["text"] for item in deltas):
        fail("HOST_SUBSTITUTION_WRONG_ANSWER", "the streamed output did not carry the endpoint's answer")
    if REPORT.get("promptResult", {}).get("done") is not True:
        fail("HOST_SUBSTITUTION_NOT_COMPLETED", "the prompt op did not report the turn done")
    if not REPORT["providerRequests"]:
        fail("HOST_SUBSTITUTION_NO_REQUEST", "no provider request reached the fake endpoint")
    if not REPORT["providerRequests"][0]["authorizationMatchesInjectedToken"]:
        fail("HOST_SUBSTITUTION_CREDENTIAL_PATH", "the injected credential did not reach the endpoint")
    if not REPORT["stateFiles"]:
        fail("HOST_SUBSTITUTION_NO_STATE", "the capture returned no native state")
    if not any(path.endswith(".jsonl") for path in REPORT["stateFiles"]):
        fail("HOST_SUBSTITUTION_STATE_SHAPE", "the captured state did not carry the journal")
    if not REPORT["stateCarriesTheTurn"]:
        fail("HOST_SUBSTITUTION_STATE_EMPTY_OF_TURN",
             "the captured journal did not carry this turn")
    if not REPORT["roomDiffersOnlyInBindings"]:
        fail("HOST_SUBSTITUTION_ROOM_DRIFT", "the room changed with the machine, not only its bindings")
    if not REPORT["cleanup"]["temporaryRemoved"]:
        fail("HOST_SUBSTITUTION_RESIDUE", "the gate left its temporary root behind")

    REPORT["result"] = "HOST_SUBSTITUTION_GATE_OK"
    return 0


if __name__ == "__main__":
    try:
        code = main()
    except SystemExit as failure:  # fail() records before it stops
        code = failure.code if isinstance(failure.code, int) else 1
    print(json.dumps(REPORT, ensure_ascii=False, sort_keys=True))
    sys.exit(code)
