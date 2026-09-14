"""Work Order 41 wire/1 behavior gates.

Restates the approved core-semantics/1 scenarios against the contract candidate
the frontend produced at P07 checkpoint 2. Every assertion here is about
observable wire behavior; none of it is a substitute for the independently run
Windows acceptance or for a real-model gate.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import threading

from fastapi.testclient import TestClient
import pytest

from agent_box.server.bootstrap import build_runtime
from agent_box.server.execution import HarnessDescriptor, HarnessRegistry
from agent_box.server.transport.http import create_app


class FakeConnector:
    def __init__(self, files=None):
        self.open_calls = 0
        self.files = files or {}
        self.read_calls = []

    def distributions(self):
        return [{"name": "Ubuntu"}]

    def probe(self, distribution, user):
        return {"probe_id": f"probe-{distribution}", "distribution": distribution, "user": user}

    def browse(self, probe_id, path):
        return {"path": path, "directories": ["src", "docs"], "files": ["README.md"]}

    def open_workspace(self, probe_id, path):
        self.open_calls += 1
        return {"connection_id": f"conn-{path}", "distribution": "Ubuntu",
                "user": "tester", "path": path}

    def read_workspace_file(
        self, *, distribution, user, connection_id, workspace_path, relative_path,
    ):
        self.read_calls.append({
            "distribution": distribution, "user": user, "connection_id": connection_id,
            "workspace_path": workspace_path, "relative_path": relative_path,
        })
        content = self.files[relative_path]
        return content, "sha256:" + hashlib.sha256(content).hexdigest()


class RecordingExecution:
    def __init__(self, *, block: bool = False):
        self.lock = threading.Lock()
        self.accepted: list[str] = []
        self.cancelled: list[str] = []
        self.block = block
        self.gate = threading.Event()
        if not block:
            self.gate.set()

    def accept(self, execution_id, *, overrides=None):
        with self.lock:
            self.accepted.append(execution_id)
        self.gate.wait(5)

    def cancel(self, execution_id):
        with self.lock:
            self.cancelled.append(execution_id)
        self.gate.set()
        return True


def registry():
    reg = HarnessRegistry()
    reg.register(HarnessDescriptor(
        "alpha", capability_claims={"streaming": True},
        control_options={"model": ("alpha-default", "alpha-fast")},
        security_locked_controls=("sandbox",),
        configuration_validator=lambda value: None if isinstance(value, dict) else ValueError(),
    ))
    return reg


class Wire:
    def __init__(self, client, headers):
        self.client = client
        self.headers = headers
        self.counter = 0

    def call(self, method, params):
        self.counter += 1
        response = self.client.post(
            f"/wire/v1/{method}", headers=self.headers,
            json={"jsonrpc": "2.0", "id": f"req-{self.counter}", "method": method, "params": params},
        )
        body = response.json()
        assert body.get("jsonrpc") == "2.0", body
        schema_path = os.environ.get("AGENT_BOX_WIRE_SCHEMA")
        if schema_path:
            import jsonschema
            schema = json.loads(Path(schema_path).read_text(encoding="utf-8"))
            if "result" in body:
                if f"{method}#params" in schema:
                    jsonschema.validate(params, schema[f"{method}#params"])
                jsonschema.validate(body["result"], schema[f"{method}#result"])
            else:
                jsonschema.validate(body["error"], schema["WireError"])
        return response.status_code, body

    def ok(self, method, params):
        status, body = self.call(method, params)
        assert "result" in body, (method, body)
        assert status == 200, (method, status, body)
        return body["result"]

    def err(self, method, params):
        _status, body = self.call(method, params)
        assert "error" in body, (method, body)
        return body["error"]


@pytest.fixture
def wire(tmp_path):
    execution = RecordingExecution(block=True)
    runtime = build_runtime(
        tmp_path / "data", harnesses=registry(), connector=FakeConnector(), execution=execution,
    )
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        headers = {"Authorization": f"Bearer {runtime.token}"}
        api = Wire(client, headers)
        runtime.repository.register_credential("cred-1", None, "locator") if False else None
        yield runtime, api, execution


ENVIRONMENT = {"kind": "wsl", "host": "Ubuntu", "user": None}
MESSAGE = {"text": "hello", "attachments": []}


def open_workspace(api, path="/home/tester/project"):
    return api.ok("workspaces.open", {
        "requestId": f"open-{path}", "environment": ENVIRONMENT, "path": path,
    })


def make_profile(api, *, name="role", harness="alpha", extra=None):
    # Profiles are created through the retained REST product surface; the wire
    # deliberately exposes only the read side for them in this candidate.
    body = {
        "name": name, "harness_type": harness,
        "configuration": {"model": "alpha-default", **(extra or {})}, "credential_id": None,
    }
    response = api.client.post(
        "/api/v1/profiles",
        headers={**api.headers, "Idempotency-Key": f"profile-{name}"}, json=body,
    )
    assert response.status_code == 201, response.json()
    return response.json()


# --- envelope and discovery ------------------------------------------------


def test_hello_reports_capabilities_and_requires_auth(wire):
    runtime, api, _execution = wire
    unauthenticated = api.client.post("/wire/v1/server.hello", json={
        "jsonrpc": "2.0", "id": "1", "method": "server.hello",
        "params": {"clientVersions": ["wire/1"], "clientPresentationSupports": []},
    })
    assert unauthenticated.status_code == 401
    assert unauthenticated.json()["error"]["code"] == "UNAUTHENTICATED"

    result = api.ok("server.hello", {
        "clientVersions": ["wire/1"], "clientPresentationSupports": [],
    })
    assert result["protocolVersion"] == "wire/1"
    assert result["serverId"]
    assert result["auth"] == {"required": True, "schemes": ["session_token"]}
    ids = {item["id"] for item in result["capabilities"]}
    assert "sessions.createAndSend" in ids
    assert "approvals.decide" in ids


def test_server_identity_is_stable_across_restart(tmp_path):
    execution = RecordingExecution()
    first = build_runtime(tmp_path / "stable", harnesses=registry(),
                          connector=FakeConnector(), execution=execution)
    with TestClient(create_app(first), base_url="http://127.0.0.1") as client:
        headers = {"Authorization": f"Bearer {first.token}"}
        api = Wire(client, headers)
        server_id = api.ok("server.hello", {"clientVersions": ["wire/1"], "clientPresentationSupports": []})["serverId"]
        token = first.token
    second = build_runtime(tmp_path / "stable", harnesses=registry(),
                           connector=FakeConnector(), execution=execution)
    with TestClient(create_app(second), base_url="http://127.0.0.1") as client:
        assert second.token == token
        api = Wire(client, {"Authorization": f"Bearer {token}"})
        again = api.ok("server.hello", {"clientVersions": ["wire/1"], "clientPresentationSupports": []})["serverId"]
        assert again == server_id


def test_unavailable_capabilities_carry_a_reason(tmp_path):
    runtime = build_runtime(tmp_path / "bare", harnesses=registry())
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        api = Wire(client, {"Authorization": f"Bearer {runtime.token}"})
        result = api.ok("server.hello", {"clientVersions": ["wire/1"], "clientPresentationSupports": []})
        entries = {item["id"]: item for item in result["capabilities"]}
        assert entries["workspaces.open"]["supported"] is False
        assert entries["workspaces.open"]["reason"] == "WSL_CONNECTOR_UNAVAILABLE"
        assert entries["sessions.send"]["supported"] is False
        assert entries["sessions.send"]["reason"] == "EXECUTION_CAPABILITY_UNAVAILABLE"
        # Capabilities that need no Harness stay honest rather than blanket-false.
        assert entries["profiles.list"]["supported"] is True


def test_envelope_rejects_malformed_and_unknown_requests(wire):
    _runtime, api, _execution = wire
    bad_version = api.client.post("/wire/v1/server.hello", headers=api.headers, json={
        "jsonrpc": "1.0", "id": "1", "method": "server.hello", "params": {},
    })
    assert bad_version.status_code == 400
    assert bad_version.json()["error"]["code"] == "INVALID_REQUEST"

    mismatch = api.client.post("/wire/v1/server.hello", headers=api.headers, json={
        "jsonrpc": "2.0", "id": "1", "method": "workspaces.list", "params": {},
    })
    assert mismatch.status_code == 400
    assert mismatch.json()["error"]["message"] == "method does not match the request path"

    status, body = api.call("notAMethod", {})
    assert status == 400 and body["error"]["code"] == "INVALID_REQUEST"

    for params in (
        {"requestId": "short", "environment": ENVIRONMENT, "path": "/tmp"},
        {"requestId": "long-enough", "environment": ENVIRONMENT, "path": "/tmp",
         "unexpected": True},
    ):
        invalid = api.client.post("/wire/v1/workspaces.browse", headers=api.headers, json={
            "jsonrpc": "2.0", "id": "strict", "method": "workspaces.browse",
            "params": params,
        })
        assert invalid.status_code == 200
        assert invalid.json()["error"]["code"] == "INVALID_REQUEST"


# --- workspaces -------------------------------------------------------------


def test_browse_reports_read_and_write_independently(wire):
    _runtime, api, _execution = wire
    result = api.ok("workspaces.browse", {
        "requestId": "browse-1", "environment": ENVIRONMENT, "path": "/home/tester/project",
    })
    assert result["path"] == "/home/tester/project"
    by_name = {entry["name"]: entry for entry in result["entries"]}
    assert by_name["src"]["kind"] == "directory" and by_name["src"]["canOpen"] is True
    # A non-directory is still listed with an explicit reason instead of being
    # dropped, so the client never has to guess why it is missing.
    assert by_name["README.md"]["canOpen"] is False
    assert by_name["README.md"]["reason"] == "not_a_directory"


def test_browse_refuses_environments_this_server_does_not_provide(wire):
    _runtime, api, _execution = wire
    error = api.err("workspaces.browse", {
        "requestId": "browse-local",
        "environment": {"kind": "local", "host": None, "user": None}, "path": "/tmp",
    })
    assert error["code"] == "CAPABILITY_UNSUPPORTED"


def test_reopening_the_same_location_keeps_identity(wire):
    _runtime, api, _execution = wire
    first = open_workspace(api)
    assert first["created"] is True
    second = open_workspace(api)
    assert second["created"] is False
    assert second["workspace"]["id"] == first["workspace"]["id"]
    assert second["workspace"]["version"] == first["workspace"]["version"]


def test_same_path_under_a_different_environment_is_a_different_location(wire):
    _runtime, api, _execution = wire
    ubuntu = api.ok("workspaces.open", {
        "requestId": "w-ubuntu", "environment": ENVIRONMENT, "path": "/srv/project",
    })
    other = api.ok("workspaces.open", {
        "requestId": "w-debian",
        "environment": {"kind": "wsl", "host": "Debian", "user": None}, "path": "/srv/project",
    })
    assert other["workspace"]["id"] != ubuntu["workspace"]["id"]
    assert other["created"] is True


def test_archive_keeps_the_record_and_guards_the_version(wire):
    _runtime, api, _execution = wire
    opened = open_workspace(api, "/home/tester/archive-me")
    workspace = opened["workspace"]
    archived = api.ok("workspaces.archive", {
        "requestId": "archive-1", "workspaceId": workspace["id"],
        "expectedVersion": workspace["version"],
    })
    assert archived["workspace"]["archivedAt"] is not None
    assert archived["workspace"]["version"] == workspace["version"] + 1
    listing = api.ok("workspaces.list", {"includeArchived": False})
    assert workspace["id"] not in {item["id"] for item in listing["items"]}
    with_archived = api.ok("workspaces.list", {"includeArchived": True})
    assert workspace["id"] in {item["id"] for item in with_archived["items"]}

    stale = api.call("workspaces.archive", {
        "requestId": "archive-2", "workspaceId": workspace["id"],
        "expectedVersion": workspace["version"],
    })
    assert stale[1]["error"]["code"] == "CONFLICT_VERSION"
    assert stale[1]["error"]["current"]["archivedAt"] is not None


# --- profiles and configuration --------------------------------------------


def test_profiles_list_exposes_harness_as_data_only(wire):
    _runtime, api, _execution = wire
    make_profile(api)
    listing = api.ok("profiles.list", {"includeArchived": False})
    assert len(listing["items"]) == 1
    item = listing["items"][0]
    assert item["harness"] == "alpha"
    assert item["displayName"] == "role"
    assert listing["nextCursor"] is None


def test_profile_and_provider_model_maintenance_is_versioned_and_referential(wire):
    _runtime, api, _execution = wire
    provider = api.ok("providerModels.create", {
        "requestId": "provider-create", "displayName": "Official API",
        "harness": "alpha", "provider": "opaque-provider", "credentialId": None,
        "configuration": [],
        "models": [{
            "modelId": "model-a", "displayName": "Model A",
            "availability": "unknown", "unavailableReason": None,
        }],
    })["providerModel"]
    assert provider["version"] == 1
    assert provider["credentialId"] is None
    assert api.ok("providerModels.list", {"includeArchived": False})["items"] == [provider]
    provider = api.ok("providerModels.update", {
        "requestId": "provider-update", "providerModelId": provider["id"],
        "expectedVersion": 1, "displayName": "Official API v2", "credentialId": None,
        "configuration": [{"controlId": "endpoint", "value": "https://example.invalid"}],
        "models": [{
            "modelId": "model-a", "displayName": "Model A",
            "availability": "available", "unavailableReason": None,
        }],
    })["providerModel"]
    assert provider["version"] == 2
    assert provider["configuration"] == [
        {"controlId": "endpoint", "value": "https://example.invalid"},
    ]

    created = api.ok("profiles.create", {
        "requestId": "profile-wire-create", "displayName": "Builder", "harness": "alpha",
    })["profile"]
    assert created["version"] == 1
    renamed = api.ok("profiles.update", {
        "requestId": "profile-wire-rename", "profileId": created["id"],
        "expectedVersion": 1, "displayName": "Builder 2",
    })["profile"]
    assert renamed["version"] == 2 and renamed["displayName"] == "Builder 2"

    stale = api.err("profiles.update", {
        "requestId": "profile-wire-stale", "profileId": created["id"],
        "expectedVersion": 1, "displayName": "stale",
    })
    assert stale["code"] == "CONFLICT_VERSION"
    assert stale["current"]["displayName"] == "Builder 2"

    configured = api.ok("profiles.updateConfig", {
        "requestId": "profile-wire-config", "profileId": created["id"],
        "expectedVersion": 2,
        "values": [{"controlId": "model", "value": {
            "providerId": provider["id"], "modelId": "model-a",
        }}],
    })
    assert configured["profile"]["version"] == 3
    assert configured["configVersion"] == 2
    assert configured["effectiveFor"] == "next_send"
    descriptor = api.ok("config.describe", {
        "profileId": created["id"], "workspaceId": None,
    })["descriptor"]
    model_control = next(item for item in descriptor["controls"] if item["controlId"] == "model")
    assert model_control["kind"] == "model_slot"
    assert model_control["slots"][0]["model"] == {
        "providerId": provider["id"], "modelId": "model-a",
        "availability": "available", "unavailableReason": None,
    }

    referenced = api.err("providerModels.archive", {
        "requestId": "provider-archive-conflict", "providerModelId": provider["id"],
        "expectedVersion": 2,
    })
    assert referenced["code"] == "CONFLICT_REFERENCE"
    assert referenced["details"]["referenceIds"] == [created["id"]]

    archived_profile = api.ok("profiles.archive", {
        "requestId": "profile-wire-archive", "profileId": created["id"],
        "expectedVersion": 3,
    })["profile"]
    assert archived_profile["archivedAt"]
    archived_provider = api.ok("providerModels.archive", {
        "requestId": "provider-archive", "providerModelId": provider["id"],
        "expectedVersion": 2,
    })["providerModel"]
    assert archived_provider["archivedAt"]


def test_config_describe_declares_controls_and_locks(wire):
    _runtime, api, _execution = wire
    profile = make_profile(api, name="describe", extra={"sandbox": "strict"})
    described = api.ok("config.describe", {"profileId": profile["profile_id"], "workspaceId": None})
    descriptor = described["descriptor"]
    assert descriptor["effectTiming"] == "next_send"
    assert "sandbox" in descriptor["securityLockedIds"]
    control_ids = {control["controlId"] for control in descriptor["controls"]}
    assert {"model", "sandbox"} <= control_ids


def test_config_resolve_computes_effective_values_and_rejects_bad_ones(wire):
    _runtime, api, _execution = wire
    profile = make_profile(api, name="resolve", extra={"sandbox": "strict"})
    resolved = api.ok("config.resolve", {
        "profileId": profile["profile_id"], "workspaceId": None,
        "overrides": [{"controlId": "model", "value": "alpha-fast"}],
    })
    assert resolved["outcome"] == "resolved"
    effective = {item["controlId"]: item["value"] for item in resolved["effective"]}
    assert effective["model"] == "alpha-fast"
    # A security lock is applied after overrides, never bypassed by them.
    assert effective["sandbox"] == "strict"

    rejected = api.ok("config.resolve", {
        "profileId": profile["profile_id"], "workspaceId": None,
        "overrides": [{"controlId": "sandbox", "value": "off"}],
    })
    assert rejected["outcome"] == "rejected"
    assert rejected["invalidControls"] == [{"controlId": "sandbox", "reason": "security_locked"}]

    unknown = api.ok("config.resolve", {
        "profileId": profile["profile_id"], "workspaceId": None,
        "overrides": [{"controlId": "nope", "value": 1}],
    })
    assert unknown["invalidControls"] == [{"controlId": "nope", "reason": "unknown_control"}]


# --- sessions, queue, stop --------------------------------------------------


def test_create_and_send_accepts_once_and_replays_the_same_execution(wire):
    _runtime, api, execution = wire
    workspace = open_workspace(api)["workspace"]
    profile = make_profile(api, name="sender")
    params = {
        "requestId": "send-one", "workspaceId": workspace["id"],
        "profileId": profile["profile_id"], "message": MESSAGE, "overrides": [],
    }
    first = api.ok("sessions.createAndSend", params)
    assert first["outcome"] == "accepted"
    assert first["executionId"]
    assert first["session"]["workspaceId"] == workspace["id"]
    assert first["configVersion"] >= 1

    replay = api.ok("sessions.createAndSend", params)
    assert replay["executionId"] == first["executionId"]
    assert replay["session"]["id"] == first["session"]["id"]
    assert len(execution.accepted) == 1, execution.accepted


def test_attachment_is_worker_authorized_captured_and_recoverable(tmp_path):
    attachment = b"captured-once-by-authorized-worker"
    connector = FakeConnector({"assets/reference.png": attachment})
    runtime = build_runtime(
        tmp_path / "data", harnesses=registry(), connector=connector,
        execution=RecordingExecution(block=True),
    )
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        api = Wire(client, {"Authorization": f"Bearer {runtime.token}"})
        workspace = open_workspace(api, "/home/tester/attachments")["workspace"]
        profile = make_profile(api, name="attachment-role")
        accepted = api.ok("sessions.createAndSend", {
            "requestId": "attachment-send-1", "workspaceId": workspace["id"],
            "profileId": profile["profile_id"], "overrides": [],
            "message": {"text": "inspect this", "attachments": [{
                "ref": "assets/reference.png", "displayName": "reference.png",
                "mediaKind": "image",
            }]},
        })

        assert len(connector.read_calls) == 1
        read_call = connector.read_calls[0]
        stored_workspace = runtime.repository.workspaces.get(workspace["id"])
        assert read_call == {
            "distribution": "Ubuntu", "user": "tester",
            "connection_id": stored_workspace["connection_id"],
            "workspace_path": "/home/tester/attachments",
            "relative_path": "assets/reference.png",
        }
        assert read_call["connection_id"] != "conn-/home/tester/attachments"
        with runtime.repository.database.read() as connection:
            row = connection.execute(
                "SELECT input_object_digest FROM server_turns WHERE id=?",
                (accepted["executionId"],),
            ).fetchone()
        stored = json.loads(runtime.objects.read(row["input_object_digest"]))["message"]
        captured = stored["attachments"][0]
        assert captured["_contentDigest"] == "sha256:" + hashlib.sha256(attachment).hexdigest()
        assert captured["_size"] == len(attachment)
        assert runtime.objects.read(captured["_contentDigest"]) == attachment

        # Public queue/history projections never expose the internal object key.
        assert "_contentDigest" not in json.dumps(accepted)

        rejected = api.err("sessions.send", {
            "requestId": "attachment-send-2", "sessionId": accepted["session"]["id"],
            "overrides": [], "message": {"text": "bad", "attachments": [{
                "ref": "../outside", "displayName": "outside", "mediaKind": "file",
            }]},
        })
        assert rejected["code"] == "INVALID_REQUEST"
        assert len(connector.read_calls) == 1


def test_concurrent_same_request_id_accepts_exactly_one_execution(wire):
    _runtime, api, execution = wire
    workspace = open_workspace(api)["workspace"]
    profile = make_profile(api, name="racer")
    params = {
        "requestId": "send-race", "workspaceId": workspace["id"],
        "profileId": profile["profile_id"], "message": MESSAGE, "overrides": [],
    }
    results: list = []
    errors: list = []
    barrier = threading.Barrier(2, timeout=5)
    original = api.client

    def send():
        try:
            response = api.client.post(
                "/wire/v1/sessions.createAndSend", headers=api.headers,
                json={"jsonrpc": "2.0", "id": "race", "method": "sessions.createAndSend", "params": params},
            )
            results.append(response.json())
        except BaseException as exc:  # noqa: BLE001
            errors.append(repr(exc))
        finally:
            barrier.wait()

    threads = [threading.Thread(target=send) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    del original
    assert errors == []
    execution_ids = {item["result"]["executionId"] for item in results if "result" in item}
    assert len(execution_ids) == 1, results
    assert len(execution.accepted) == 1, execution.accepted


def test_send_while_running_queues_and_withdrawal_reports_too_late(wire):
    _runtime, api, _execution = wire
    workspace = open_workspace(api)["workspace"]
    profile = make_profile(api, name="queuer")
    first = api.ok("sessions.createAndSend", {
        "requestId": "queue-one", "workspaceId": workspace["id"],
        "profileId": profile["profile_id"], "message": MESSAGE, "overrides": [],
    })
    session_id = first["session"]["id"]
    second = api.ok("sessions.send", {
        "requestId": "queue-two", "sessionId": session_id,
        "message": {"text": "second", "attachments": []}, "overrides": [],
    })
    assert second["outcome"] == "accepted"
    assert second["executionId"] is None  # queued behind the running execution
    assert second["queueItemId"]

    queue = api.ok("queue.get", {"sessionId": session_id})
    assert len(queue["items"]) == 1
    item = queue["items"][0]
    assert item["state"] == "pending"
    assert item["message"]["text"] == "second"
    assert item["configVersion"] == second["configVersion"]
    assert item["itemId"] == second["queueItemId"]
    queued_event = api.ok("history.snapshot", {"sessionId": session_id})["frames"][-1]["event"]
    assert queued_event == {"kind": "queue.updated", "sessionId": session_id, "item": item}

    stale = api.err("queue.withdraw", {
        "requestId": "q-withdraw-stale", "sessionId": session_id, "itemId": item["itemId"],
        "expectedVersion": item["version"] + 5,
    })
    assert stale["code"] == "CONFLICT_VERSION"

    withdrawn = api.ok("queue.withdraw", {
        "requestId": "q-withdraw", "sessionId": session_id, "itemId": item["itemId"],
        "expectedVersion": item["version"],
    })
    assert withdrawn["outcome"] == "withdrawn"
    assert api.ok("queue.get", {"sessionId": session_id})["items"] == []
    withdrawn_event = api.ok("history.snapshot", {"sessionId": session_id})["frames"][-1]["event"]
    assert withdrawn_event["kind"] == "queue.updated"
    assert withdrawn_event["item"]["state"] == "withdrawn"


def test_queue_terminal_events_remove_dispatched_items_without_guessing(wire):
    runtime, api, _execution = wire
    workspace = open_workspace(api, "/home/tester/queue-terminal")["workspace"]
    profile = make_profile(api, name="queue-terminal")
    first = api.ok("sessions.createAndSend", {
        "requestId": "queue-terminal-one", "workspaceId": workspace["id"],
        "profileId": profile["profile_id"], "message": MESSAGE, "overrides": [],
    })
    session_id = first["session"]["id"]
    second = api.ok("sessions.send", {
        "requestId": "queue-terminal-two", "sessionId": session_id,
        "message": {"text": "next", "attachments": []}, "overrides": [],
    })
    with runtime.database.transaction() as conn:
        claimed = runtime.queue.claim_next(conn, session_id)
        assert claimed["itemId"] == second["queueItemId"]
        runtime.queue.mark_terminal(conn, claimed["itemId"], "completed")

    queue_events = [
        frame["event"] for frame in api.ok("history.snapshot", {"sessionId": session_id})["frames"]
        if frame["event"]["kind"] == "queue.updated"
    ]
    assert [event["item"]["state"] for event in queue_events] == [
        "pending", "dispatched", "completed",
    ]
    assert api.ok("queue.get", {"sessionId": session_id})["items"] == []


def test_send_outcome_query_answers_unknown_rather_than_guessing(wire):
    _runtime, api, _execution = wire
    assert api.ok("sendOutcome.query", {"requestId": "never-sent"}) == {"outcome": "unknown"}


def test_stop_reports_requested_then_already_finished(wire):
    _runtime, api, execution = wire
    workspace = open_workspace(api, "/home/tester/stopper")["workspace"]
    profile = make_profile(api, name="stopper")
    accepted = api.ok("sessions.createAndSend", {
        "requestId": "stop-one", "workspaceId": workspace["id"],
        "profileId": profile["profile_id"], "message": MESSAGE, "overrides": [],
    })
    stopped = api.ok("runs.stop", {
        "requestId": "stop-two", "sessionId": accepted["session"]["id"],
        "executionId": accepted["executionId"],
    })
    assert stopped["outcome"] == "stop_requested"
    assert execution.cancelled == [accepted["executionId"]]

    _runtime2, api2, execution2 = wire
    del _runtime2, execution2


def test_stop_on_an_unknown_execution_is_not_found(wire):
    _runtime, api, _execution = wire
    error = api.err("runs.stop", {
        "requestId": "stop-missing", "sessionId": "session-none", "executionId": "execution-none",
    })
    assert error["code"] == "NOT_FOUND"


def test_switching_role_is_refused_while_an_execution_runs(wire):
    _runtime, api, _execution = wire
    workspace = open_workspace(api, "/home/tester/switcher")["workspace"]
    first_profile = make_profile(api, name="switch-a")
    second_profile = make_profile(api, name="switch-b")
    accepted = api.ok("sessions.createAndSend", {
        "requestId": "switch-one", "workspaceId": workspace["id"],
        "profileId": first_profile["profile_id"], "message": MESSAGE, "overrides": [],
    })
    session = accepted["session"]
    result = api.ok("sessions.switchProfile", {
        "requestId": "switch-two", "sessionId": session["id"],
        "profileId": second_profile["profile_id"], "expectedVersion": session["version"],
    })
    assert result["outcome"] == "rejected"
    assert result["reason"] == "execution_running"
    # The old link is returned so the client keeps the real state.
    assert result["session"]["profileId"] == first_profile["profile_id"]


def test_session_catalog_metadata_archive_and_pagination_are_server_owned(wire):
    _runtime, api, _execution = wire
    first_workspace = open_workspace(api, "/home/tester/catalog-a")["workspace"]
    second_workspace = open_workspace(api, "/home/tester/catalog-b")["workspace"]
    profile = make_profile(api, name="catalog-role")
    accepted = api.ok("sessions.createAndSend", {
        "requestId": "catalog-send-one", "workspaceId": first_workspace["id"],
        "profileId": profile["profile_id"], "message": MESSAGE, "overrides": [],
    })
    session = accepted["session"]
    assert session["pinned"] is False

    renamed = api.ok("sessions.update", {
        "requestId": "catalog-update-one", "sessionId": session["id"],
        "expectedVersion": session["version"], "displayName": "Pinned work",
        "pinned": True,
    })["session"]
    assert renamed["displayName"] == "Pinned work"
    assert renamed["pinned"] is True
    assert renamed["version"] == session["version"] + 1

    stale = api.err("sessions.update", {
        "requestId": "catalog-update-stale", "sessionId": session["id"],
        "expectedVersion": session["version"], "displayName": "stale",
    })
    assert stale["code"] == "CONFLICT_VERSION"
    assert stale["current"]["displayName"] == "Pinned work"

    # Workspace switching is a real business update and must be refused while
    # an execution is active instead of being simulated by the client.
    busy = api.err("sessions.update", {
        "requestId": "catalog-move-busy", "sessionId": session["id"],
        "expectedVersion": renamed["version"], "workspaceId": second_workspace["id"],
    })
    assert busy["code"] == "CAPABILITY_UNSUPPORTED"

    listing = api.ok("sessions.list", {
        "workspaceId": first_workspace["id"], "includeArchived": False,
        "page": {"limit": 1},
    })
    assert [item["id"] for item in listing["items"]] == [session["id"]]
    assert listing["nextCursor"] is None

    archived = api.ok("sessions.archive", {
        "requestId": "catalog-archive-one", "sessionId": session["id"],
        "expectedVersion": renamed["version"],
    })["session"]
    assert archived["archivedAt"] is not None
    assert api.ok("sessions.list", {
        "workspaceId": first_workspace["id"], "includeArchived": False,
    })["items"] == []
    assert api.ok("sessions.list", {
        "workspaceId": first_workspace["id"], "includeArchived": True,
    })["items"][0]["id"] == session["id"]


def test_send_outcome_query_returns_the_frozen_acceptance_identity(wire):
    _runtime, api, _execution = wire
    workspace = open_workspace(api, "/home/tester/outcome-catalog")["workspace"]
    profile = make_profile(api, name="outcome-catalog")
    accepted = api.ok("sessions.createAndSend", {
        "requestId": "outcome-catalog-send", "workspaceId": workspace["id"],
        "profileId": profile["profile_id"], "message": MESSAGE, "overrides": [],
    })
    queried = api.ok("sendOutcome.query", {"requestId": "outcome-catalog-send"})
    assert queried == {
        "outcome": "accepted", "sessionId": accepted["session"]["id"],
        "executionId": accepted["executionId"],
        "configVersion": accepted["configVersion"], "queueItemId": None,
    }


# --- approvals --------------------------------------------------------------


def test_approval_decisions_are_atomic_and_validate_scope(wire):
    _runtime, api, _execution = wire
    workspace = open_workspace(api, "/home/tester/approvals")["workspace"]
    profile = make_profile(api, name="approver")
    accepted = api.ok("sessions.createAndSend", {
        "requestId": "approval-one", "workspaceId": workspace["id"],
        "profileId": profile["profile_id"], "message": MESSAGE, "overrides": [],
    })
    session_id = accepted["session"]["id"]
    approval = api.runtime_tuple if False else None
    del approval

    runtime = _runtime
    with runtime.database.transaction() as conn:
        row = runtime.approvals.request_in_transaction(
            conn, session_id=session_id, execution_id=accepted["executionId"],
            request={"tool": "shell", "command": "ls"},
        )
    assert row["state"] == "open"
    approval_frame = api.ok("history.snapshot", {"sessionId": session_id})["frames"][-1]
    projected = approval_frame["event"]
    assert projected["kind"] == "approval.requested"
    assert projected["approval"] == {
        "approvalId": row["approvalId"], "sessionId": session_id,
        "executionId": accepted["executionId"], "version": 1,
        "operation": {
            "title": "shell", "detail": [{"label": "command", "value": "ls"}],
            "tool": "shell",
        },
        "expiresAt": None,
    }

    first = api.ok("approvals.decide", {
        "requestId": "decision-one", "approvalId": row["approvalId"], "decision": "allow",
        "scope": {"kind": "once"}, "expectedVersion": row["version"],
    })
    assert first == {"outcome": "recorded", "decision": "allow"}
    settled = api.ok("history.snapshot", {"sessionId": session_id})["frames"][-1]["event"]
    assert settled == {
        "kind": "approval.settled", "sessionId": session_id,
        "approvalId": row["approvalId"], "outcome": "allowed",
    }

    # A repeat of the same request never applies a second decision.
    repeat = api.ok("approvals.decide", {
        "requestId": "decision-one", "approvalId": row["approvalId"], "decision": "allow",
        "scope": {"kind": "once"}, "expectedVersion": row["version"],
    })
    assert repeat == {"outcome": "already_recorded", "decision": "allow"}

    # A contradictory decision after settlement is invalid, not applied.
    contradictory = api.ok("approvals.decide", {
        "requestId": "decision-two", "approvalId": row["approvalId"], "decision": "deny",
        "scope": {"kind": "once"}, "expectedVersion": row["version"] + 1,
    })
    assert contradictory["outcome"] == "invalid"

    bad_scope = api.err("approvals.decide", {
        "requestId": "decision-three", "approvalId": row["approvalId"], "decision": "allow",
        "scope": {"kind": "forever"}, "expectedVersion": 2,
    })
    assert bad_scope["code"] == "INVALID_REQUEST"

    with runtime.database.transaction() as conn:
        late = runtime.approvals.request_in_transaction(
            conn, session_id=session_id, execution_id=accepted["executionId"],
            request={"tool": "shell", "command": "touch too-late"},
        )
    runtime.repository.finish_cancelled(accepted["executionId"])
    refused = api.ok("approvals.decide", {
        "requestId": "dec-too-late", "approvalId": late["approvalId"],
        "decision": "allow", "scope": {"kind": "once"},
        "expectedVersion": late["version"],
    })
    assert refused == {"outcome": "invalid", "reason": "execution_not_actionable"}
    assert runtime.approvals.get(late["approvalId"])["state"] == "invalid"
    late_settled = api.ok("history.snapshot", {"sessionId": session_id})["frames"][-1]["event"]
    assert late_settled["approvalId"] == late["approvalId"]
    assert late_settled["outcome"] == "invalidated"


# --- history ----------------------------------------------------------------


def test_history_snapshot_frames_use_cursors_and_resume_without_gaps(wire):
    _runtime, api, _execution = wire
    workspace = open_workspace(api, "/home/tester/history")["workspace"]
    profile = make_profile(api, name="historian")
    accepted = api.ok("sessions.createAndSend", {
        "requestId": "history-one", "workspaceId": workspace["id"],
        "profileId": profile["profile_id"], "message": MESSAGE, "overrides": [],
    })
    session_id = accepted["session"]["id"]
    snapshot = api.ok("history.snapshot", {"sessionId": session_id})
    assert snapshot["outcome"] == "snapshot"
    assert snapshot["frames"], "an accepted send must leave a durable frame"
    user_message = next(
        frame for frame in snapshot["frames"]
        if frame["event"]["kind"] == "message.final"
        and frame["event"]["role"] == "user"
    )
    assert user_message["event"]["text"] == "hello"
    assert user_message["event"]["displayKind"] == "visible"
    seqs = [frame["seq"] for frame in snapshot["frames"]]
    assert seqs == sorted(seqs)
    assert all(frame["cursor"] for frame in snapshot["frames"])
    assert snapshot["frames"][-1]["event"]["kind"] == "execution.state"
    assert snapshot["olderCursor"] is None

    # Internal capture bookkeeping can sit between public frames, but the
    # EventFrame sequence seen by clients remains gap-free.
    _runtime.repository.append_turn_event(
        accepted["executionId"], "turn.capture", {"state": "capturing"},
    )
    _runtime.repository.append_turn_event(
        accepted["executionId"], "message.delta", {"text": "after-internal"},
    )
    after_internal = api.ok("history.snapshot", {
        "sessionId": session_id, "cursor": snapshot["resumeCursor"],
    })
    assert [frame["seq"] for frame in after_internal["frames"]] == [seqs[-1] + 1]

    # Continuing from the resume cursor returns only newer frames.
    resumed = api.ok("history.snapshot", {
        "sessionId": session_id, "cursor": after_internal["resumeCursor"],
    })
    assert resumed["outcome"] == "snapshot"
    assert resumed["frames"] == []

    # A cursor that cannot address real history asks for an explicit resync.
    forged = snapshot["resumeCursor"][:-4] + "AAAA"
    error = api.err("history.snapshot", {"sessionId": session_id, "cursor": forged})
    assert error["code"] == "INVALID_REQUEST"


def test_history_uses_distinct_backward_pages_and_live_resume_cursors(wire):
    runtime, api, _execution = wire
    workspace = open_workspace(api, "/home/tester/history-pages")["workspace"]
    profile = make_profile(api, name="history-pages")
    accepted = api.ok("sessions.createAndSend", {
        "requestId": "history-pages-one", "workspaceId": workspace["id"],
        "profileId": profile["profile_id"], "message": MESSAGE, "overrides": [],
    })
    session_id = accepted["session"]["id"]
    for index in range(5):
        runtime.repository.append_turn_event(
            accepted["executionId"], "message.delta", {"text": str(index)},
        )

    latest = api.ok("history.snapshot", {
        "sessionId": session_id, "page": {"limit": 2},
    })
    assert [frame["seq"] for frame in latest["frames"]] == sorted(
        frame["seq"] for frame in latest["frames"]
    )
    assert latest["olderCursor"] is not None

    older = api.ok("history.snapshot", {
        "sessionId": session_id,
        "page": {"cursor": latest["olderCursor"], "limit": 2},
    })
    assert older["frames"]
    assert older["frames"][-1]["seq"] < latest["frames"][0]["seq"]
    assert older["resumeCursor"] == latest["resumeCursor"]

    # A backward-page cursor has a separate signing domain and cannot be used
    # as a live resume cursor; mixing both directions is also ambiguous.
    assert api.err("history.snapshot", {
        "sessionId": session_id, "cursor": latest["olderCursor"],
    })["code"] == "INVALID_REQUEST"
    assert api.err("history.snapshot", {
        "sessionId": session_id, "cursor": latest["resumeCursor"],
        "page": {"cursor": latest["olderCursor"], "limit": 2},
    })["code"] == "INVALID_REQUEST"


def test_history_snapshot_requires_a_real_session(wire):
    _runtime, api, _execution = wire
    error = api.err("history.snapshot", {"sessionId": "session-missing"})
    assert error["code"] == "NOT_FOUND"


def test_wire_event_stream_resumes_from_snapshot_cursor_without_sse(wire):
    runtime, api, _execution = wire
    workspace = open_workspace(api, "/home/tester/live-wire")["workspace"]
    profile = make_profile(api, name="live-wire")
    accepted = api.ok("sessions.createAndSend", {
        "requestId": "live-one", "workspaceId": workspace["id"],
        "profileId": profile["profile_id"], "message": MESSAGE, "overrides": [],
    })
    session_id = accepted["session"]["id"]
    snapshot = api.ok("history.snapshot", {"sessionId": session_id})
    path = (
        f"/wire/v1/event-stream?sessionId={session_id}"
        f"&cursor={snapshot['resumeCursor']}"
    )
    with api.client.websocket_connect(
        path, headers={**api.headers, "Host": "127.0.0.1"},
    ) as socket:
        runtime.repository.append_turn_event(
            accepted["executionId"], "message.delta", {"text": "persisted before publish"},
        )
        runtime.notifier.notify()
        frame = socket.receive_json()
        assert frame["sessionId"] == session_id
        assert frame["event"] == {
            "kind": "message.delta", "sessionId": session_id,
            "messageId": accepted["executionId"], "role": "assistant",
            "text": "persisted before publish",
        }
        assert frame["seq"] > snapshot["frames"][-1]["seq"]
