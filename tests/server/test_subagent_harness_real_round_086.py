"""Order 086 stage 2: the **real** claude-code parent issues `tools/call` itself.

65 proved the delegation stack end to end with a *fixture* parent: the test
process wrote the bridge's JSON-RPC frames by hand. This file removes that
substitute. Nothing here writes to the bridge; the only way a `tools/call` can
happen is the CLI binary, inside the real bwrap sandbox, deciding to make one
after reading its own `tools` array. The deployment is the production
template's, with the two overrides registered in this docstring.

The loopback endpoint answers **structurally**, never by counting requests:

  * a request whose `tools` array carries the bridge tool and no prior
    `tool_result` gets a `tool_use` block,
  * a request that carries the `tool_result` gets text quoting it,
  * a request without the bridge tool (the child's, and the seeding round's)
    gets plain text.

So "the parent had the tool" and "the parent used it" are read off the native
process's own requests. A fixture driving the call could not produce the
`tool_use` → real MCP round-trip → `tool_result` sequence at all, which is G1's
counter-example.

Two deliberate differences from the reviewed
`claude-production-chain-gate.py` whose parts this reuses (that script is not
touched - `scripts/**` is outside this order's write paths):

  * `permissions.allow` carries the bridge tool in the projected settings file.
    The ACP adapter routes every tool permission check through `canUseTool`
    (acp-agent.js:6084), which asks the client `session/request_permission`, and
    the Worker has no answer path for that method (order 086 §9 of the evidence
    file). Without pre-approval the round stalls on a request nobody can answer.
  * `timeoutMs` stays at the family default. The Server bounds it at 1..120 000
    (`runtime.py:530`, `SIDECAR_DEPLOYMENT_INVALID` above that - measured here, first
    run), while a delegated child turn may wait up to
    `subagents.DEFAULT_TIMEOUT_SECONDS = 600`. So a nested parent round has to fit
    inside the parent's own 120 s process ceiling; that tension is recorded rather
    than papered over.

Needs the release Worker binary and bubblewrap; skipped otherwise, so the root
suite stays green where no real Harness can run.
"""
from __future__ import annotations

import http.server
import importlib.util
import json
import os
from pathlib import Path
import shutil
import socket
import socketserver
import threading
import time
import urllib.error
import urllib.request

import pytest

REPO = Path(__file__).resolve().parents[2]
GATE = REPO / "scripts" / "server-round1" / "claude-production-chain-gate.py"
WORKER = Path(os.environ.get("AGENTBOX_W43_WORKER") or
              REPO / "workers" / "agent-box-worker" / ".acceptance-bundle-c11" / "agent-box-worker")
#: An already-built runtime artifact may be handed over (the reviewed gate's
#: `--artifact` mode); otherwise the reviewed builder runs.
PREBUILT = os.environ.get("AGENTBOX_086_ARTIFACT")

BRIDGE_TOOL = "mcp__agentbox-subagents__run_subagent"
CHILD_TASK_MARK = "086-REAL-ROUND-CHILD-DONE"
PARENT_MARK = "086-REAL-ROUND-PARENT-SAW"

pytestmark = pytest.mark.skipif(
    not WORKER.is_file() or shutil.which("bwrap") is None,
    reason="the real-harness round needs the release Worker binary and bubblewrap")


def _load_gate():
    spec = importlib.util.spec_from_file_location("claude_chain_gate_086", GATE)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DelegationEndpoint:
    """Loopback Anthropic Messages endpoint that branches on the tool surface."""

    def __init__(self, token: str) -> None:
        self.token = token
        self.observed: list[dict] = []
        self.unauthorized = 0
        self._lock = threading.Lock()
        endpoint = self

        class Handler(http.server.BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *_args) -> None:
                pass

            def do_POST(self) -> None:
                length = int(self.headers.get("Content-Length") or 0)
                try:
                    body = json.loads(self.rfile.read(length).decode("utf-8"))
                except ValueError:
                    body = {}
                names = [item.get("name") for item in (body.get("tools") or [])
                         if isinstance(item, dict)]
                carried = _tool_result_text(body)
                authorized = (self.headers.get("Authorization") == f"Bearer {endpoint.token}"
                              or self.headers.get("x-api-key") == endpoint.token)
                with endpoint._lock:
                    observation = {
                        "index": len(endpoint.observed) + 1,
                        "path": self.path,
                        "authorized": authorized,
                        "advertisesBridgeTool": BRIDGE_TOOL in names,
                        "mcpToolNames": sorted(name for name in names
                                               if isinstance(name, str)
                                               and name.startswith("mcp__")),
                        "carriesToolResult": carried,
                        "messageCount": len(body.get("messages") or []),
                    }
                    endpoint.observed.append(observation)
                    if not authorized:
                        endpoint.unauthorized += 1
                if not observation["advertisesBridgeTool"]:
                    payload = _sse({"type": "text",
                                    "text": f"{CHILD_TASK_MARK} from the subagent"})
                elif carried is None:
                    payload = _sse({"type": "tool_use", "id": "toolu_086_delegation",
                                    "name": BRIDGE_TOOL, "input": {
                                        "subagent": "beta",
                                        "description": "answer the question",
                                        "prompt": f"Reply with exactly {CHILD_TASK_MARK}.",
                                    }})
                else:
                    payload = _sse({"type": "text", "text": f"{PARENT_MARK} {carried[:400]}"})
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

        self.server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Handler)
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


def _sse(block: dict) -> bytes:
    index = 0
    events = [
        {"type": "message_start", "message": {
            "id": "msg_086_round", "type": "message", "role": "assistant", "content": [],
            "model": "deepseek-flash",
            "usage": {"input_tokens": 11, "output_tokens": 1}}},
    ]
    if block["type"] == "text":
        events.append({"type": "content_block_start", "index": index,
                       "content_block": {"type": "text", "text": ""}})
        events.append({"type": "content_block_delta", "index": index,
                       "delta": {"type": "text_delta", "text": block["text"]}})
        stop_reason = "end_turn"
    else:
        events.append({"type": "content_block_start", "index": index, "content_block": {
            "type": "tool_use", "id": block["id"], "name": block["name"], "input": {}}})
        events.append({"type": "content_block_delta", "index": index, "delta": {
            "type": "input_json_delta",
            "partial_json": json.dumps(block["input"], ensure_ascii=False)}})
        stop_reason = "tool_use"
    events.append({"type": "content_block_stop", "index": index})
    events.append({"type": "message_delta",
                   "delta": {"stop_reason": stop_reason, "stop_sequence": None},
                   "usage": {"output_tokens": 7}})
    events.append({"type": "message_stop"})
    payload = b""
    for event in events:
        payload += f"event: {event['type']}\n".encode()
        payload += f"data: {json.dumps(event)}\n\n".encode()
    return payload


def _tool_result_text(body: dict) -> str | None:
    """The tool result the native process fed back, if this request carries one."""
    for message in reversed(body.get("messages") or []):
        content = message.get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if isinstance(block, dict) and block.get("type") == "tool_result":
                nested = block.get("content")
                if isinstance(nested, list):
                    return " ".join(str(item.get("text") or "") for item in nested
                                    if isinstance(item, dict))
                return str(nested if nested is not None else block.get("text") or "")
    return None


def _free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def _http(base_url: str, path: str, body: dict, token: str,
          idempotency_key: str | None = None) -> dict:
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    if idempotency_key is not None:
        headers["Idempotency-Key"] = idempotency_key
    request = urllib.request.Request(
        f"{base_url}{path}", data=json.dumps(body).encode(), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raise AssertionError(
            f"{path} -> {error.code}: {error.read()[:600]!r}") from None


def _wire(base_url: str, token: str, method: str, params: dict) -> dict:
    body = _http(base_url, f"/wire/v1/{method}",
                 {"jsonrpc": "2.0", "id": method, "method": method, "params": params}, token)
    assert "result" in body, f"{method}: {json.dumps(body)[:900]}"
    return body["result"]


def test_a_real_claude_parent_round_calls_run_subagent_itself(tmp_path):
    gate = _load_gate()
    from agent_box.server.bootstrap import build_runtime_from_sidecar_deployment
    from agent_box.server.bootstrap import runtime as runtime_module
    from agent_box.server.credentials import CredentialRecords
    from agent_box.server.transport.http import create_app
    from agent_box.storage import MemorySecretStore
    from agent_box_harnesses.claude import production
    import uvicorn

    report: dict = {"result": "SUBAGENT_REAL_ROUND_FAILED", "order": "086 stage 2"}
    temporary = tmp_path / "run"
    temporary.mkdir()
    workspace = temporary / "workspace"
    workspace.mkdir()
    endpoint = DelegationEndpoint(gate.FAKE_TOKEN)
    endpoint.start()
    port = _free_port()
    previous_port = os.environ.get("AGENT_BOX_HTTP_PORT")
    os.environ["AGENT_BOX_HTTP_PORT"] = str(port)
    base_url = f"http://127.0.0.1:{port}"
    server = None
    thread = None
    runtime = None
    token_path = None
    original_file = runtime_module._sidecar_deployment_file
    original_connector = runtime_module._builtin_connector
    try:
        guard = gate.compile_guard(temporary, report)
        if PREBUILT:
            artifact = Path(PREBUILT).resolve()
            report["artifact"] = {"reused": str(artifact)}
        else:
            artifact = gate.build_artifact(
                temporary / "artifacts" / production.ARTIFACT_NAME, report)
        digest = gate.verify_artifact(artifact, report)

        document = production.deployment_document(
            artifact_token=f"{production.ARTIFACT_NAME}", tree_digest=digest,
            adapter_environment={
                **production.ADAPTER_ENVIRONMENT,
                "LD_PRELOAD": production.EGRESS_GUARD_TARGET,
                "AGENTBOX_EGRESS_AUDIT": f"/workspace/{gate.AUDIT_NAME}",
            },
            projection_files_override=(
                *production.projection_files(),
                {"source": gate.GUARD_DEPLOY_SOURCE,
                 "target": production.EGRESS_GUARD_TARGET},
            ),
        )
        deployment = temporary / "deployment.json"
        deployment.write_text(json.dumps(document), encoding="utf-8")

        settings = dict(production.loopback_settings_document(endpoint.base_url))
        settings["permissions"] = {"allow": [BRIDGE_TOOL]}
        settings_bytes = json.dumps(settings, indent=2, sort_keys=True).encode() + b"\n"

        def deployment_file(root, relative):
            if relative == production.SETTINGS_SOURCE:
                return settings_bytes
            if relative == gate.GUARD_DEPLOY_SOURCE:
                return guard.read_bytes()
            return original_file(root, relative)

        runtime_module._sidecar_deployment_file = deployment_file
        runtime_module._builtin_connector = lambda _id: gate.DirectWorkerConnector(
            temporary, WORKER, workspace)
        store = MemorySecretStore(values={})
        runtime = build_runtime_from_sidecar_deployment(
            temporary / "server", deployment, secret_store=store,
            plugin_root=gate.PLUGIN,
            mount_bindings={production.ARTIFACT_NAME: str(artifact)})
        server = uvicorn.Server(uvicorn.Config(
            create_app(runtime), host="127.0.0.1", port=port, log_level="warning"))
        thread = threading.Thread(target=server.run, daemon=True)
        thread.start()
        deadline = time.monotonic() + 60
        while not server.started and time.monotonic() < deadline:
            time.sleep(0.05)
        assert server.started, "the Server did not start listening on loopback"

        token_path = temporary / "claude-gate-token"
        # The bytes injected as the provider key are exactly what the loopback
        # endpoint authenticates against - one constant, so an unauthorized
        # observation can only mean the injection path is broken.
        token_path.write_bytes(gate.FAKE_TOKEN.encode())
        token_path.chmod(0o600)
        credential_id, locator = store.import_file(token_path, "api-key")
        CredentialRecords(runtime.database).register(credential_id, "api-key", locator)
        token = runtime.token

        opened = _wire(base_url, token, "workspaces.open", {
            "requestId": "086-round-open", "path": str(workspace),
            "environment": {"kind": "wsl", "host": "Ubuntu",
                            "user": os.environ["USER"]}})["workspace"]
        provider = _wire(base_url, token, "providerModels.create", {
            "requestId": "086-round-provider", "displayName": "086 loopback",
            "harness": "claude-code", "provider": production.CLAUDE_PROVIDER,
            "credentialId": credential_id, "configuration": [], "models": [{
                "modelId": production.PRODUCT_MODEL_ID, "displayName": "086 model",
                "availability": "available", "unavailableReason": None}],
        })["providerModel"]
        profiles = {}
        for name in ("alpha", "beta"):
            created = _http(base_url, "/api/v1/profiles", {
                "name": f"086 {name}", "harness_type": "claude-code",
                "configuration": {}, "credential_id": credential_id},
                token, f"086-round-profile-{name}")
            profile_id = created["profile_id"]
            configured = _wire(base_url, token, "profiles.updateConfig", {
                "requestId": f"086-round-config-{name}", "profileId": profile_id,
                "expectedVersion": _version(base_url, token, profile_id),
                "values": [{"controlId": "model", "value": {
                    "providerId": provider["id"],
                    "modelId": production.PRODUCT_MODEL_ID}}]})["profile"]
            profiles[name] = configured["id"]

        # ---- the seeding round: beta alone, with **no** grants at all. ----
        # This is the counter-example against "the tools are always there": the
        # same Profile, same deployment, same CLI, and the bridge tool is absent
        # because nothing is granted. It also gives beta a workspace to be
        # delegated into (`_shared_workspace_id` reads the child's own sessions).
        seeding = _wire(base_url, token, "sessions.createAndSend", {
            "requestId": "086-round-seed", "workspaceId": opened["id"],
            "profileId": profiles["beta"], "overrides": [],
            "message": {"text": "Reply with the single word ready.", "attachments": []}})
        seed_session = _await_state(
            runtime, seeding["session"]["id"], 0, "completed", timeout=600)
        report["seeding"] = gate.summarize_turn(seed_session, 0)
        seed_requests = [item for item in endpoint.observed]
        assert seed_requests and not any(item["advertisesBridgeTool"] for item in seed_requests), (
            "a Profile with zero grants advertised the bridge tool: the entry is not "
            "grant-scoped")

        _wire(base_url, token, "profiles.grantSubagent", {
            "requestId": "086-round-grant", "profileId": profiles["alpha"],
            "childProfileId": profiles["beta"]})

        # ---- the real parent round. ----
        started = _wire(base_url, token, "sessions.createAndSend", {
            "requestId": "086-round-parent", "workspaceId": opened["id"],
            "profileId": profiles["alpha"], "overrides": [],
            "message": {"text": "Use your run_subagent tool on beta, then tell me "
                                "exactly what it answered.", "attachments": []}})
        session_id = started["session"]["id"]
        session = _await_state(runtime, session_id, 0, "completed", timeout=900)
        parent_turn_id = session["turns"][0]["id"]
        report["parent"] = gate.summarize_turn(session, 0)
        report["endpoint"] = endpoint.observed
        report["unauthorizedProviderRequests"] = endpoint.unauthorized

        # --- G1: the call came from the native process, not from this test. ---
        parent_requests = [item for item in endpoint.observed
                           if item["advertisesBridgeTool"]]
        assert parent_requests, (
            "no model request from this round advertised the bridge tool: the real CLI "
            f"never read `.claude.json`; observed {json.dumps(endpoint.observed)[:900]}")
        assert all(item["authorized"] for item in parent_requests), (
            "a parent request carried no injected key")
        assert any("agentbox-subagents" in json.dumps(item["mcpToolNames"])
                   for item in parent_requests), "the MCP server never reached the tool surface"
        with_result = [item for item in parent_requests if item["carriesToolResult"]]
        assert with_result, (
            "the CLI never fed a tool_result back: nothing executed the MCP call")
        quoted = str(with_result[0]["carriesToolResult"])
        assert CHILD_TASK_MARK in quoted, (
            f"what the parent got back is not the child's summary: {quoted[:300]}")

        # --- G2: attribution - one real child turn under this parent turn. ---
        with runtime.database.read() as conn:
            children = conn.execute(
                "SELECT id, state, profile_id, usage_input_tokens, usage_total_tokens, "
                "usage_source FROM server_turns WHERE parent_turn_id=?",
                (parent_turn_id,)).fetchall()
        assert len(children) == 1, [dict(row) for row in children]
        assert children[0]["state"] == "completed", dict(children[0])
        assert children[0]["profile_id"] == profiles["beta"], (
            "the delegated turn ran under the wrong Profile")
        child_requests = [item for item in endpoint.observed
                          if not item["advertisesBridgeTool"]]
        assert len(child_requests) >= 2, (
            f"expected a seeding round and a delegated round from beta, saw "
            f"{len(child_requests)}")
        report["child"] = dict(children[0])

        deltas = [event for event in session["events"]
                  if event.get("turn_id") == parent_turn_id and event["kind"] == "message.delta"]
        final_text = "".join(str((event.get("data") or {}).get("text") or "") for event in deltas)
        assert PARENT_MARK in final_text, final_text[:300]
        report["parentFinalText"] = final_text[:400]

        # --- the run stayed confined: the guard loaded, nothing else was reached. ---
        audit = workspace / gate.AUDIT_NAME
        lines = audit.read_text(encoding="utf-8").splitlines() if audit.is_file() else []
        unexpected = [line for line in lines if line.startswith("denied")
                      and not line.startswith("denied resolve api.anthropic.com")]
        report["egress"] = {
            "guardLoaded": any(line.startswith("guard-loaded") for line in lines),
            "unexpectedDenies": unexpected,
            "bridgeCallbackPathRecorded": any(
                line.startswith("allowed connect 127.0.0.1") for line in lines),
        }
        assert report["egress"]["guardLoaded"], "the egress guard never loaded in the adapter"
        assert not unexpected, f"the guest reached a non-loopback destination: {unexpected}"
        assert endpoint.unauthorized == 0, "a provider request arrived without the injected key"
        report["result"] = "SUBAGENT_REAL_ROUND_OK"
    finally:
        os.environ.pop("AGENT_BOX_HTTP_PORT", None)
        if previous_port is not None:
            os.environ["AGENT_BOX_HTTP_PORT"] = previous_port
        endpoint.stop()
        if server is not None:
            server.should_exit = True
        if thread is not None:
            thread.join(timeout=20)
        if runtime is not None:
            try:
                runtime.stop()
            except BaseException as error:  # a stuck stop is reported, not swallowed
                report["runtimeStopError"] = f"{type(error).__name__}: {error}"
        runtime_module._sidecar_deployment_file = original_file
        runtime_module._builtin_connector = original_connector
        try:
            gate.cleanup_check(temporary, workspace, token_path, None)
            report["cleanup"] = dict(gate.REPORT.get("cleanup") or {})
        except BaseException as error:  # a leftover is reported, not swallowed
            report["cleanupError"] = f"{type(error).__name__}: {error}"
            report["cleanup"] = dict(gate.REPORT.get("cleanup") or {})
        report["worker"] = {"path": str(WORKER)}
        destination = os.environ.get("AGENTBOX_086_ROUND_REPORT")
        if destination:
            Path(destination).write_text(
                json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        else:
            print(json.dumps(report, sort_keys=True)[:6000])
        gate.make_tree_writable(temporary)
        shutil.rmtree(temporary, ignore_errors=True)


def _version(base_url: str, token: str, profile_id: str) -> int:
    items = _wire(base_url, token, "profiles.list", {"includeArchived": True})["items"]
    return next(int(item["version"]) for item in items if item["id"] == profile_id)


def _await_state(runtime, session_id: str, index: int, state: str, *, timeout: float) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        session = runtime.repository.get_session(session_id)
        if len(session["turns"]) > index:
            if session["turns"][index]["state"] == state:
                return session
            if session["turns"][index]["state"] in {"failed", "cancelled"}:
                raise AssertionError(json.dumps(
                    _diagnostics(runtime, session, index), ensure_ascii=False)[:3000])
        time.sleep(0.2)
    raise AssertionError(f"turn {index} of {session_id} did not reach {state} in {timeout}s")


def _diagnostics(runtime, session: dict, index: int) -> dict:
    turn = session["turns"][index]
    return {"state": turn["state"], "errorCode": turn.get("error_code"),
            "captureState": turn.get("capture_state"),
            "cleanupState": turn.get("cleanup_state"),
            "events": [{"kind": event["kind"],
                        "data": {key: str(value)[:200]
                                 for key, value in (event.get("data") or {}).items()}}
                       for event in session["events"][-16:]]}
