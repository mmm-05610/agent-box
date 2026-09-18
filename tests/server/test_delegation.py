"""Order 65 C: the delegation service - roster, run, linkage, cancellation.

A fake execution port stands in for the room: it drives the child turn the way
the real backend does (dispatch → complete with a summary + usage), so the
service's rules are tested without a sandbox. The order's counterexamples:
unauthorized, unavailable child, depth, cycle, cross-family continuation,
over-fan-out, and the parent's roll-up/cancel linkage.
"""
from __future__ import annotations

import pytest

from agent_box.server.errors import ServerError
from agent_box.server.execution.delegation import DelegationService, cancel_children
from agent_box.server.idempotency import IdempotentRecords
from agent_box.server.profiles import ProfileRecords
from agent_box.server.profiles.subagents import DelegationError
from agent_box.server.sessions import SessionRecords, SessionService
from agent_box.server.workspaces import WorkspaceRecords
from agent_box.storage import Database, ObjectStore


class FakeExecution:
    """Completes every accepted child turn with a summary and a usage fact."""

    def __init__(self, records, *, fail_code: str | None = None) -> None:
        self.records = records
        self.accepted: list[str] = []
        self.fail_code = fail_code

    def accept(self, turn_id: str, *, overrides=None) -> None:
        self.accepted.append(turn_id)
        row = self.records.get_turn_context(turn_id)
        session_id = row["session_id"]
        self.records.set_turn_dispatch(
            turn_id, work_id="w", execution_id="e", dispatch_id="d", state="running")
        self.records.append_turn_event(
            turn_id, "message.delta", {"text": f"summary of {turn_id}"})
        if self.fail_code:
            self.records.fail_turn(turn_id, self.fail_code)
            return
        self.records.complete_turn(
            turn_id, checkpoint_object_digest="sha256:a", checkpoint_native_id=f"native-{turn_id}",
            result_object_digest="sha256:r",
            usage={"inputTokens": 11, "outputTokens": 7, "totalTokens": 18},
            usage_source="fake")
        del session_id


def _pieces(tmp_path):
    database = Database(tmp_path / "data")
    database.initialize()
    idempotency = IdempotentRecords(database)
    profiles = ProfileRecords(database, idempotency)
    workspaces = WorkspaceRecords(database, idempotency)
    records = SessionRecords(database, idempotency)
    objects = ObjectStore(tmp_path / "data")
    execution = FakeExecution(records)
    sessions = SessionService(records, idempotency, objects, harnesses=None,
                              profiles=profiles, credentials=None, execution=execution)
    service = DelegationService(records=records, profiles=profiles, sessions=sessions,
                                execution=execution, objects=objects)
    return database, profiles, workspaces, records, sessions, execution, service


def _setup(tmp_path):
    database, profiles, workspaces, records, sessions, execution, service = _pieces(tmp_path)
    parent = profiles.create(key="p", request_digest="p", name="alpha", harness_type="codex",
                             config_digest="sha256:" + "0" * 64, credential_id=None)[1]
    child = profiles.create(key="c", request_digest="c", name="beta", harness_type="codex",
                            config_digest="sha256:" + "1" * 64, credential_id=None)[1]
    other = profiles.create(key="o", request_digest="o", name="gamma", harness_type="codex",
                            config_digest="sha256:" + "2" * 64, credential_id=None)[1]
    workspace = workspaces.create(
        key="w", request_digest="w", distribution="Ubuntu", remote_user="tester",
        remote_path="/workspace", connection_id="c")[1]
    session = sessions.create_session("parent-session", {
        "workspace_id": workspace["workspace_id"], "profile_id": parent["profile_id"]})[1]
    # A workspace for the child, so a fresh child session has somewhere to run.
    sessions.create_session("child-seed", {
        "workspace_id": workspace["workspace_id"], "profile_id": child["profile_id"]})
    with database.transaction() as conn:
        conn.execute(
            "INSERT INTO server_turns(id,session_id,profile_id,profile_revision,"
            "native_generation,state,capture_state,cleanup_state,input_object_digest,"
            "created_at,updated_at) VALUES ('parent-turn',?,?,1,0,'running','pending',"
            "'pending','x','t','t')",
            (session["session_id"], parent["profile_id"]),
        )
    return database, profiles, records, sessions, execution, service, parent, child, other


def test_zero_grants_means_no_tools_and_no_run(tmp_path):
    _db, _profiles, _records, _sessions, _execution, service, parent, _child, _other = _setup(tmp_path)
    listing = service.list_for(parent_profile_id=parent["profile_id"])
    assert listing == {"tools": [], "roster": []}
    with pytest.raises(DelegationError) as refused:
        service.run(parent_turn_id="parent-turn", parent_profile_id=parent["profile_id"],
                    arguments={"subagent": "beta", "description": "do some work", "prompt": "x"})
    assert refused.value.code == "SUBAGENT_NOT_AUTHORIZED"


def test_a_granted_run_completes_links_and_returns_the_bounded_summary(tmp_path):
    database, profiles, records, _sessions, execution, service, parent, child, _other = _setup(tmp_path)
    profiles.grant_subagent(parent_id=parent["profile_id"], child_id=child["profile_id"])

    listing = service.list_for(parent_profile_id=parent["profile_id"])
    assert [tool["name"] for tool in listing["tools"]] == ["list_subagents", "run_subagent"]
    assert [entry["name"] for entry in listing["roster"]] == ["beta"]

    result = service.run(parent_turn_id="parent-turn", parent_profile_id=parent["profile_id"],
                         arguments={"subagent": "beta", "description": "do some work",
                                    "prompt": "Summarise the thing."})
    assert result["state"] == "completed"
    assert result["summary"].startswith("summary of turn_")
    assert result["task_id"].startswith("native-turn_")
    assert result["usage"] == {"inputTokens": 11, "outputTokens": 7, "totalTokens": 18,
                               "usageSource": "fake"}
    # The child turn names the parent (attribution is one join away).
    with database.read() as conn:
        row = conn.execute("SELECT parent_turn_id FROM server_turns WHERE id=?",
                           (result["turnId"],)).fetchone()
    assert row["parent_turn_id"] == "parent-turn"
    # Cancellation propagation finds it while it is still active.
    assert cancel_children(records, parent_turn_id="parent-turn") == []
    with database.transaction() as conn:
        conn.execute("UPDATE server_turns SET state='running' WHERE id=?", (result["turnId"],))
    assert cancel_children(records, parent_turn_id="parent-turn") == [result["turnId"]]
    assert execution.accepted == [result["turnId"]]


def test_continuation_depends_on_family_and_unknown_handles_refuse(tmp_path):
    database, profiles, _records, _sessions, _execution, service, parent, child, other = _setup(tmp_path)
    profiles.grant_subagent(parent_id=parent["profile_id"], child_id=child["profile_id"])
    profiles.grant_subagent(parent_id=parent["profile_id"], child_id=other["profile_id"])

    with pytest.raises(DelegationError) as unknown:
        service.run(parent_turn_id="parent-turn", parent_profile_id=parent["profile_id"],
                    arguments={"subagent": "beta", "description": "do some work",
                               "prompt": "x", "task_id": "native-nope"})
    assert unknown.value.code == "SUBAGENT_TASK_UNKNOWN"

    # A handle from another family refuses rather than silently opening a new
    # session: create a claude-code session and hand its native id over.
    claude = profiles.create(key="cl", request_digest="cl", name="claude-role",
                             harness_type="claude-code",
                             config_digest="sha256:" + "3" * 64, credential_id=None)[1]
    workspace_id = service._shared_workspace_id(profiles.get(child["profile_id"]))
    foreign = service.sessions.create_session("foreign", {
        "workspace_id": workspace_id, "profile_id": claude["profile_id"]})[1]
    with database.transaction() as conn:
        conn.execute("UPDATE server_sessions SET checkpoint_native_id='native-foreign' "
                     "WHERE id=?", (foreign["session_id"],))
    with pytest.raises(DelegationError) as mismatch:
        service.run(parent_turn_id="parent-turn", parent_profile_id=parent["profile_id"],
                    arguments={"subagent": "beta", "description": "do some work",
                               "prompt": "x", "task_id": "native-foreign"})
    assert mismatch.value.code == "SUBAGENT_TASK_FAMILY_MISMATCH"

    # Within the same family, the handle continues the same session.
    first = service.run(parent_turn_id="parent-turn", parent_profile_id=parent["profile_id"],
                        arguments={"subagent": "beta", "description": "do some work",
                                   "prompt": "first"})
    second = service.run(parent_turn_id="parent-turn", parent_profile_id=parent["profile_id"],
                         arguments={"subagent": "beta", "description": "do more work",
                                    "prompt": "again", "task_id": first["task_id"]})
    assert second["resumed"] is True and second["sessionId"] == first["sessionId"]
    assert second["task_id"] != first["task_id"]  # each turn reports its own native id


def test_depth_cycle_and_fan_out_refuse(tmp_path):
    _db, profiles, _records, _sessions, _execution, service, parent, child, _other = _setup(tmp_path)
    profiles.grant_subagent(parent_id=parent["profile_id"], child_id=child["profile_id"])

    with pytest.raises(DelegationError) as deep:
        service.run(parent_turn_id="parent-turn", parent_profile_id=parent["profile_id"],
                    arguments={"subagent": "beta", "description": "do some work", "prompt": "x"},
                    chain=[parent["profile_id"], parent["profile_id"]])
    assert deep.value.code in {"SUBAGENT_DEPTH_EXCEEDED", "SUBAGENT_CYCLE"}

    with pytest.raises(DelegationError) as fan_out:
        service.run(parent_turn_id="parent-turn", parent_profile_id=parent["profile_id"],
                    arguments={"subagent": "beta", "description": "do some work", "prompt": "x"},
                    calls_this_turn=4)
    assert fan_out.value.code == "SUBAGENT_TURNS_EXCEEDED"


def test_a_failed_child_returns_its_typed_code_not_raw_output(tmp_path):
    database, profiles, records, sessions, _execution, _service, parent, child, _other = _setup(tmp_path)
    profiles.grant_subagent(parent_id=parent["profile_id"], child_id=child["profile_id"])
    failing = FakeExecution(records, fail_code="TURN_FAILED_FOR_TEST")
    service = DelegationService(records=records, profiles=profiles,
                                sessions=SessionService(
                                    records, IdempotentRecords(database), ObjectStore(tmp_path / "data"),
                                    harnesses=None, profiles=profiles, credentials=None,
                                    execution=failing),
                                execution=failing)
    result = service.run(parent_turn_id="parent-turn", parent_profile_id=parent["profile_id"],
                         arguments={"subagent": "beta", "description": "do some work",
                                    "prompt": "x"})
    assert result["state"] == "failed" and result["errorCode"] == "TURN_FAILED_FOR_TEST"
    assert "summary" in result  # the bounded text, never a raw stdout dump
    del sessions


def test_the_delegation_endpoint_resolves_only_its_own_token(tmp_path):
    from fastapi.testclient import TestClient

    from agent_box.server.bootstrap import build_runtime
    from agent_box.server.transport.http import create_app

    runtime = build_runtime(tmp_path / "server")
    runtime.start()
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        # An unknown token is a 404: the surface resolves tokens, not callers.
        unknown = client.post("/internal/delegation/not-a-token", json={"op": "list"})
        assert unknown.status_code == 404 and unknown.json()["error"] == "DELEGATION_TOKEN_UNKNOWN"

        profile = runtime.repository.profiles.create(
            key="p", request_digest="p", name="alpha", harness_type="codex",
            config_digest=runtime.objects.publish(
                b'{"schema_version":1,"harness_type":"codex","configuration":{}}').digest,
            credential_id=None)[1]
        runtime.delegation_tokens["token-1"] = {
            "turnId": "parent-turn", "profileId": profile["profile_id"],
        }
        listed = client.post("/internal/delegation/token-1", json={"op": "list"})
        assert listed.status_code == 200
        # Zero grants: no tools at all - the pair is not materialised.
        assert listed.json()["result"] == {"tools": [], "roster": []}
        refused = client.post("/internal/delegation/token-1", json={
            "op": "run", "arguments": {"subagent": "beta", "description": "do some work",
                                       "prompt": "x"}})
        assert refused.status_code == 409
        assert refused.json()["error"] == "SUBAGENT_NOT_AUTHORIZED"
        unknown_op = client.post("/internal/delegation/token-1", json={"op": "nope"})
        assert unknown_op.status_code == 400


def test_a_granted_parent_renders_the_bridge_entry_and_zero_grants_does_not(tmp_path):
    import json
    import shutil

    from fastapi.testclient import TestClient

    from agent_box.server.bootstrap import build_runtime_from_sidecar_deployment
    from agent_box.server.transport.http import create_app
    from agent_box.storage.secrets import MemorySecretStore

    import agent_box.server.bootstrap.runtime as runtime_module

    REPO = __import__("pathlib").Path(__file__).resolve().parents[2]
    PLUGIN = REPO / "plugins" / "agent-box-harnesses"
    peer_source = "tests/harness_remote/home_probe_acp_peer.mjs"
    peer_bytes = REPO / "tests" / "server" / "fixtures" / "home_probe_acp_peer.mjs"
    deployment = {"schemaVersion": 1, "harnesses": [{
        "id": "claude-code", "capabilityClaims": {"stream": True},
        "adapter": {"command": "/usr/bin/node", "args": [], "source": peer_source},
        "stateProjection": {"target": "/runtime/home/.claude"},
        "timeoutMs": 60_000}]}
    original_file = runtime_module._sidecar_deployment_file

    def deployment_file(root, relative):
        if relative == peer_source:
            return peer_bytes.read_bytes()
        return original_file(root, relative)

    runtime_module._sidecar_deployment_file = deployment_file
    try:
        (tmp_path / "project").mkdir(exist_ok=True)
        document = tmp_path / "deployment.json"
        document.write_text(json.dumps(deployment), encoding="utf-8")
        runtime = build_runtime_from_sidecar_deployment(
            tmp_path / "server", document, plugin_root=PLUGIN,
            secret_store=MemorySecretStore(values={"locator_1": b"fake-key"}))
        runtime.start()
        runtime.repository.register_credential("credential_1", "api-key", "locator_1")
        parent = runtime.repository.profiles.create(
            key="p", request_digest="p", name="alpha", harness_type="claude-code",
            config_digest=runtime.objects.publish(
                b'{"schema_version":1,"harness_type":"claude-code","configuration":{}}').digest,
            credential_id="credential_1")[1]
        child = runtime.repository.profiles.create(
            key="c", request_digest="c", name="beta", harness_type="claude-code",
            config_digest=runtime.objects.publish(
                b'{"schema_version":1,"harness_type":"claude-code","configuration":{}}').digest,
            credential_id="credential_1")[1]

        with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
            token = runtime.token
            opened = client.post("/wire/v1/workspaces.open", headers={
                "Authorization": f"Bearer {token}"}, json={
                "jsonrpc": "2.0", "id": "o", "method": "workspaces.open",
                "params": {"requestId": "bridge-open-1", "path": str(tmp_path / "project"),
                           "environment": {"kind": "local", "host": None, "user": None}},
            }).json()["result"]

            def send(request_id: str):
                return client.post("/wire/v1/sessions.createAndSend", headers={
                    "Authorization": f"Bearer {token}"}, json={
                    "jsonrpc": "2.0", "id": "s", "method": "sessions.createAndSend",
                    "params": {"requestId": request_id,
                               "workspaceId": opened["workspace"]["id"],
                               "profileId": parent["profile_id"], "overrides": [],
                               "message": {"text": "hello", "attachments": []}},
                }).json()["result"]

            import time
            first = send("bridge-turn-1")
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                session = runtime.repository.get_session(first["session"]["id"])
                if session["turns"] and session["turns"][0]["state"] in {"completed", "failed"}:
                    break
                time.sleep(0.05)
            role = next(item for item in (tmp_path / "server" / "profiles").iterdir()
                        if item.is_dir() and item.name != "_sessions")
            candidate = role / ".claude" / "settings.json"
            rendered = (json.loads(candidate.read_text(encoding="utf-8"))
                        if candidate.is_file() else {})
            assert "agentbox-subagents" not in rendered.get("mcpServers", {}), \
                "zero grants must not materialise the bridge"

            runtime.repository.profiles.grant_subagent(
                parent_id=parent["profile_id"], child_id=child["profile_id"])
            second = send("bridge-turn-2")
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                session = runtime.repository.get_session(second["session"]["id"])
                if session["turns"] and session["turns"][0]["state"] in {"completed", "failed"}:
                    break
                time.sleep(0.05)
            # The second session's role directory holds its own settings.json.
            role_dirs = [item for item in (tmp_path / "server" / "profiles").iterdir()
                         if item.is_dir() and item.name != "_sessions"]
            found = None
            for role in sorted(role_dirs, key=lambda item: item.stat().st_mtime, reverse=True):
                candidate = role / ".claude" / "settings.json"
                if candidate.is_file():
                    document_value = json.loads(candidate.read_text(encoding="utf-8"))
                    if "agentbox-subagents" in document_value.get("mcpServers", {}):
                        found = document_value
                        break
            assert found is not None, "a granted parent must materialise the bridge"
            entry = found["mcpServers"]["agentbox-subagents"]
            assert entry["command"] == "/usr/bin/node"
            assert entry["args"][0].endswith("subagent-bridge.mjs")
            assert entry["env"]["AGENTBOX_BRIDGE_TOKEN"]
            assert any(
                grant["profileId"] == parent["profile_id"]
                for grant in runtime.delegation_tokens.values()
            ) or runtime.delegation_tokens, "a token is minted for the attempt"
    finally:
        runtime_module._sidecar_deployment_file = original_file
        del shutil


def test_the_grant_wire_face_lists_grants_and_callers(tmp_path):
    from fastapi.testclient import TestClient

    from agent_box.server.bootstrap import build_runtime
    from agent_box.server.transport.http import create_app

    runtime = build_runtime(tmp_path / "server")
    runtime.start()
    profiles = runtime.repository.profiles
    parent = profiles.create(key="p", request_digest="p", name="alpha", harness_type="codex",
                             config_digest="sha256:" + "0" * 64, credential_id=None)[1]
    child = profiles.create(key="c", request_digest="c", name="beta", harness_type="codex",
                            config_digest="sha256:" + "1" * 64, credential_id=None)[1]
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        token = runtime.token

        def call(method, params):
            return client.post(f"/wire/v1/{method}", headers={
                "Authorization": f"Bearer {token}"}, json={
                "jsonrpc": "2.0", "id": method, "method": method, "params": params,
            }).json()

        empty = call("profiles.subagentGrants", {"profileId": parent["profile_id"]})["result"]
        assert empty == {"subagentGrants": [], "callableBy": []}

        granted = call("profiles.grantSubagent", {
            "requestId": "grant-req-1", "profileId": parent["profile_id"],
            "childProfileId": child["profile_id"]})["result"]["grant"]
        assert granted["parentProfileId"] == parent["profile_id"]

        seen = call("profiles.subagentGrants", {"profileId": parent["profile_id"]})["result"]
        assert seen["subagentGrants"] == [{"childProfileId": child["profile_id"]}]
        # The child sees exactly one caller - the partition has both directions.
        reverse = call("profiles.subagentGrants", {"profileId": child["profile_id"]})["result"]
        assert reverse["callableBy"] == [{"parentProfileId": parent["profile_id"]}]

        # A cycle is refused at grant time, with the same code the service uses.
        cycle = call("profiles.grantSubagent", {
            "requestId": "grant-req-2", "profileId": child["profile_id"],
            "childProfileId": parent["profile_id"]})
        assert cycle["error"]["details"]["internalCode"] == "SUBAGENT_CYCLE"

        revoked = call("profiles.revokeSubagent", {
            "requestId": "grant-req-3", "profileId": parent["profile_id"],
            "childProfileId": child["profile_id"]})["result"]
        assert revoked["revoked"] is True
        assert call("profiles.subagentGrants", {
            "profileId": parent["profile_id"]})["result"]["subagentGrants"] == []

def test_the_parents_denials_narrow_the_child_and_its_own_allow_set_stands(tmp_path):
    """Order 65 §1b: the parent's `deny`s (its neutral limits) travel into the
    child's frozen posture; the child's own rules decide everything else."""
    import json

    database, profiles, _records, _sessions, _execution, service, parent, child, _other = _setup(tmp_path)
    # The parent is on `plan` (edit/bash/external_directory denied) and adds
    # its own deny on webfetch; the child is on `default` with no rules.
    profiles.set_permissions(
        profile_id=parent["profile_id"], preset="plan",
        rules=[{"key": "webfetch", "action": "deny"}],
        expected_version=profiles.get(parent["profile_id"])["version"],
        key="pp", request_digest="pp")
    profiles.grant_subagent(parent_id=parent["profile_id"], child_id=child["profile_id"])

    result = service.run(parent_turn_id="parent-turn", parent_profile_id=parent["profile_id"],
                         arguments={"subagent": "beta", "description": "do some work",
                                    "prompt": "x"})
    with database.read() as conn:
        digest = conn.execute(
            "SELECT effective_config_object_digest FROM server_turns WHERE id=?",
            (result["turnId"],)).fetchone()[0]
    assert digest, "the child turn freezes its merged posture"
    frozen = json.loads(service.objects.read(digest))
    posture = frozen["permissions"]
    # The parent's denials travelled...
    assert posture["keys"]["edit"] == "deny"
    assert posture["keys"]["bash"] == "deny"
    assert posture["keys"]["webfetch"] == "deny"
    # ...and the child's own default still decides the rest (nothing widened).
    assert posture["keys"]["read"] == "ask"
    assert posture["inheritedFrom"] == parent["profile_id"]


def test_a_child_approval_is_mirrored_into_the_parent_turn(tmp_path):
    """Order 65: the subagent's `ask` rises into the parent as the same kind
    of interruption the parent already handles (same approval id)."""
    database, _profiles, records, _sessions, _execution, service, parent, child, _other = _setup(tmp_path)
    _profiles.grant_subagent(parent_id=parent["profile_id"], child_id=child["profile_id"])
    result = service.run(parent_turn_id="parent-turn", parent_profile_id=parent["profile_id"],
                         arguments={"subagent": "beta", "description": "do some work",
                                    "prompt": "x"}, )
    child_turn = result["turnId"]

    from agent_box.server.approvals import ApprovalRecords

    class _Port:
        def register_approval(self, approval_id, turn_id, request_id):
            return None

    backend = _Backend(records, ApprovalRecords(records.database, append_event=records._append_session_event))
    backend._native_event(child_turn, "approval.requested",
                          {"request": {"requestId": "req-1", "tool": "bash",
                                       "summary": "run a command"}}, _Port())
    with database.read() as conn:
        parent_session_id = conn.execute(
            "SELECT id FROM server_sessions WHERE profile_id=? ORDER BY rowid LIMIT 1",
            (parent["profile_id"],),
        ).fetchone()[0]
    parent_session = records.get_session(parent_session_id)
    mirrored = [event for event in parent_session["events"]
                if event["kind"] == "approval.requested"
                and event.get("turn_id") == "parent-turn"]
    assert mirrored, "the interruption reached the parent turn"
    assert mirrored[-1]["data"]["from_subagent"]["turnId"] == child_turn
    assert mirrored[-1]["data"]["approval_id"].startswith("approval_")

class _Backend:
    """The minimal backend surface the approval-mirror test needs."""

    def __init__(self, records, approvals) -> None:
        self.records = records
        self.approvals = approvals
        self._lock = __import__("threading").RLock()
        self._approval_ports = {}
        self.on_event = lambda *args, **kwargs: None
        self._message_parts = {}

    from agent_box.server.execution.sidecar_backend import SidecarExecutionBackend as _B

    _native_event = _B._native_event
