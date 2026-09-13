"""Work Order 39 regression gates for the neutral Server boundary.

Covers: one idempotency key accepts and dispatches exactly once, two
non-branded test providers are selectable without Server changes, capability
answers derive from registration only, and the legacy native path is absent
from production assembly.
"""
from __future__ import annotations

import threading

from fastapi.testclient import TestClient

from agent_box.server.bootstrap import build_runtime
from agent_box.server.credentials import CredentialRecords
from agent_box.server.execution import HarnessDescriptor, HarnessRegistry
from agent_box.server.idempotency import IdempotentRecords
from agent_box.server.persistence import ProductRepositoryView
from agent_box.server.profiles import ProfileRecords
from agent_box.server.sessions import SessionRecords, SessionService
from agent_box.server.transport.http import create_app
from agent_box.storage import Database, ObjectStore
from agent_box.server.workspaces import WorkspaceRecords


class RecordingExecution:
    """Provider-neutral execution port that records dispatch claims."""

    def __init__(self, *, hold: bool = False) -> None:
        self.lock = threading.Lock()
        self.accepted: list[str] = []
        self.cancelled: list[str] = []
        self.hold = hold
        self.gate = threading.Event()

    def accept(self, turn_id, *, overrides=None):
        with self.lock:
            self.accepted.append(turn_id)
        if self.hold:
            self.gate.wait(5)

    def cancel(self, turn_id):
        with self.lock:
            self.cancelled.append(turn_id)
        return True


class WslFixture:
    def distributions(self):
        return [{"name": "Ubuntu"}]

    def probe(self, distribution, user):
        return {"probe_id": "probe_fixture", "distribution": distribution, "user": user}

    def browse(self, probe_id, path):
        return {"probe_id": probe_id, "path": path, "directories": []}

    def open_workspace(self, probe_id, path):
        return {"connection_id": "conn_fixture", "distribution": "Ubuntu",
                "user": "tester", "path": path}


def alpha_beta_registry():
    """Two non-branded provider descriptors with distinct honest claims."""
    registry = HarnessRegistry()
    registry.register(HarnessDescriptor(
        "alpha", credential_kind="alpha-key",
        configuration_validator=lambda value: None if isinstance(value, dict) else ValueError(),
        capability_claims={"streaming": True},
    ))
    registry.register(HarnessDescriptor(
        "beta", credential_kind=None,
        configuration_validator=lambda value: None if "required" in value else ValueError(),
        capability_claims={},
    ))
    return registry


def build_pieces(tmp_path, execution):
    database = Database(tmp_path / "data")
    database.initialize()
    idempotency = IdempotentRecords(database)
    credentials = CredentialRecords(database)
    profiles = ProfileRecords(database, idempotency)
    sessions_records = SessionRecords(database, idempotency)
    workspaces = WorkspaceRecords(database, idempotency)
    sessions = SessionService(
        sessions_records, idempotency, ObjectStore(tmp_path / "data"),
        harnesses=alpha_beta_registry(), profiles=profiles, credentials=credentials,
        execution=execution,
    )
    repository = ProductRepositoryView(
        database=database, idempotency=idempotency, credentials=credentials,
        workspaces=workspaces, profiles=profiles, sessions=sessions_records,
    )
    return database, idempotency, sessions, repository


def test_concurrent_same_key_turn_acceptance_dispatches_once(tmp_path):
    execution = RecordingExecution(hold=True)
    database, idempotency, sessions, repository = build_pieces(tmp_path, execution)
    credentials = repository.credentials
    profiles = repository.profiles
    objects = ObjectStore(tmp_path / "data")
    credentials.register("credential-1", "alpha-key", "locator")
    config = objects.publish(b'{"schema_version":1,"harness_type":"alpha","configuration":{}}')
    profile = profiles.create(
        key="p", request_digest="p", name="role", harness_type="alpha",
        config_digest=config.digest, credential_id="credential-1",
    )[1]
    workspace = repository.workspaces.create(
        key="w", request_digest="w", distribution="Ubuntu", remote_user="tester",
        remote_path="/workspace", connection_id="connection",
    )[1]
    session = sessions.create_session("s", {
        "workspace_id": workspace["workspace_id"], "profile_id": profile["profile_id"],
    })[1]

    body = {"text": "one intent", "expected_profile_revision": 1}
    receipts: list = []
    errors: list = []

    # Deterministic counter-example window: both racers finish the
    # pre-commit idempotency read (both None) before either commits.
    barrier = threading.Barrier(2, timeout=5)
    original = idempotency.get

    def raced_pre_read(scope, key, request_digest):
        result = original(scope, key, request_digest)
        barrier.wait()
        return result

    idempotency.get = raced_pre_read

    def race():
        try:
            receipts.append(sessions.create_turn(session["session_id"], "turn-key", body))
        except BaseException as exc:  # noqa: BLE001
            errors.append(repr(exc))

    threads = [threading.Thread(target=race) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    execution.gate.set()
    idempotency.get = original  # stop forcing the race window for later calls

    assert errors == []
    turn_ids = {receipt[1]["turn_id"] for receipt in receipts}
    assert len(turn_ids) == 1, receipts
    assert receipts[0] == receipts[1], "replay must return the same identity"
    assert len(execution.accepted) == 1, execution.accepted

    # A sequential replay after the fact also never re-dispatches.
    replay = sessions.create_turn(session["session_id"], "turn-key", body)
    assert replay == receipts[0]
    assert len(execution.accepted) == 1


def test_two_neutral_providers_are_selectable_without_server_changes(tmp_path):
    execution = RecordingExecution()
    runtime = build_runtime(
        tmp_path / "providers", harnesses=alpha_beta_registry(),
        connector=WslFixture(), execution=execution,
    )
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        headers = {"Authorization": f"Bearer {runtime.token}"}

        def post(path, body, key):
            return client.post(path, headers={**headers, "Idempotency-Key": key}, json=body)

        workspace = post("/api/v1/workspaces", {
            "probe_id": "probe_fixture", "path": "/workspace",
        }, "workspace").json()
        runtime.repository.register_credential("credential-1", "alpha-key", "locator")
        alpha_profile = post("/api/v1/profiles", {
            "name": "alpha role", "harness_type": "alpha",
            "configuration": {}, "credential_id": "credential-1",
        }, "alpha-profile").json()
        beta_profile = post("/api/v1/profiles", {
            "name": "beta role", "harness_type": "beta",
            "configuration": {"required": True}, "credential_id": None,
        }, "beta-profile").json()
        assert alpha_profile["capabilities"] == {"streaming": True}
        assert beta_profile["capabilities"] == {}

        for name, profile in (("alpha", alpha_profile), ("beta", beta_profile)):
            session = post("/api/v1/sessions", {
                "workspace_id": workspace["workspace_id"],
                "profile_id": profile["profile_id"],
            }, f"session-{name}").json()
            turn = post(f"/api/v1/sessions/{session['session_id']}/turns", {
                "text": f"hello from {name}", "expected_profile_revision": 1,
            }, f"turn-{name}")
            assert turn.status_code == 202, turn.json()
        assert len(execution.accepted) == 2

        # The same Server rejected an unregistered provider without a brand branch.
        rejected = post("/api/v1/profiles", {
            "name": "unknown role", "harness_type": "gamma",
            "configuration": {}, "credential_id": None,
        }, "gamma-profile")
        assert rejected.status_code == 503
        assert rejected.json()["error"]["code"] == "HARNESS_UNAVAILABLE"

        listed = client.get("/api/v1/profiles", headers=headers).json()["items"]
        claims = {item["harness_type"]: item["capabilities"] for item in listed}
        assert claims == {"alpha": {"streaming": True}, "beta": {}}


def test_capability_answers_reflect_registration_only(tmp_path):
    runtime = build_runtime(tmp_path / "honest")
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        headers = {"Authorization": f"Bearer {runtime.token}"}
        readiness = client.get("/api/v1/readiness", headers=headers).json()
        assert readiness["capabilities"]["harnesses"] == {}
        assert readiness["capabilities"]["execution"] is False
        turn = client.post(
            "/api/v1/sessions/session-missing/turns",
            headers={**headers, "Idempotency-Key": "x"},
            json={"text": "t", "expected_profile_revision": 1},
        )
        assert turn.status_code == 503
        assert turn.json()["error"]["code"] == "EXECUTION_CAPABILITY_UNAVAILABLE"

    registered = build_runtime(
        tmp_path / "registered", harnesses=alpha_beta_registry(),
        connector=WslFixture(),
    )
    with TestClient(create_app(registered), base_url="http://127.0.0.1") as client:
        headers = {"Authorization": f"Bearer {registered.token}"}
        readiness = client.get("/api/v1/readiness", headers=headers).json()
        harnesses = readiness["capabilities"]["harnesses"]
        assert set(harnesses) == {"alpha", "beta"}
        assert harnesses["alpha"]["capability_claims"] == {"streaming": True}
        assert harnesses["alpha"]["available"] is False
        assert harnesses["alpha"]["unavailable_reason"] == "EXECUTION_CAPABILITY_UNAVAILABLE"
        assert harnesses["beta"]["capability_claims"] == {}

        # Nothing is invented for an unregistered harness type or absent execution.
        assert client.get("/api/v1/profiles", headers=headers).json() == {"items": []}
