from __future__ import annotations

import json
import os
from pathlib import Path
import sqlite3

from fastapi.testclient import TestClient
import pytest

from agent_box.server.bootstrap import build_runtime
from agent_box.server.credentials import CredentialRecords
from agent_box.server.execution import HarnessDescriptor, HarnessRegistry
from agent_box.server.idempotency import IdempotentRecords
from agent_box.server.profiles import ProfileRecords, ProfileService
from agent_box.server.transport.http import create_app
from agent_box.storage import Database, FutureSchemaError, ObjectStore
from agent_box.work_core import db as core_db


def codex_validator(value):
    if not isinstance(value, dict):
        raise ValueError()
    return None


def codex_registry(claims=None):
    registry = HarnessRegistry()
    registry.register(HarnessDescriptor(
        "codex", credential_kind="codex-login",
        configuration_validator=codex_validator, capability_claims=claims or {},
    ))
    return registry


class WslFixture:
    def __init__(self):
        self.open_calls = 0

    def distributions(self):
        return [{"name": "Ubuntu", "state": "running", "version": 2}]

    def probe(self, distribution, user):
        return {"probe_id": "probe_fixture", "distribution": distribution, "user": user, "expires_in": 30}

    def browse(self, probe_id, path):
        return {"probe_id": probe_id, "path": path, "directories": ["中文 空格"]}

    def open_workspace(self, probe_id, path):
        self.open_calls += 1
        return {"connection_id": "conn_fixture", "distribution": "Ubuntu", "user": "tester", "path": path}


@pytest.fixture
def server(tmp_path):
    root = tmp_path / "server-data"
    runtime = build_runtime(
        root,
        harnesses=codex_registry(),
        connector=WslFixture(),
    )
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        headers = {"Authorization": f"Bearer {runtime.token}"}
        yield runtime, client, headers


def post(client, headers, path, body, key):
    return client.post(path, headers={**headers, "Idempotency-Key": key}, json=body)


def test_liveness_is_minimal_and_every_product_route_requires_auth(server):
    _runtime, client, headers = server
    assert client.get("/live").json() == {"status": "alive"}
    denied = client.get("/api/v1/readiness")
    assert denied.status_code == 401
    assert denied.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"
    ready = client.get("/api/v1/readiness", headers=headers)
    assert ready.status_code == 200
    codex = ready.json()["capabilities"]["harnesses"]["codex"]
    assert codex["available"] is False
    assert codex["capability_claims"] == {}
    assert codex["unavailable_reason"] == "EXECUTION_CAPABILITY_UNAVAILABLE"
    assert client.get("/openapi.json").status_code == 404
    assert client.get("/api/v1/openapi.json").status_code == 401
    assert client.get("/api/v1/openapi.json", headers=headers).status_code == 200


def test_host_origin_and_strict_json_are_independent_guards(server):
    _runtime, client, headers = server
    assert client.get("/live", headers={"Host": "evil.example"}).status_code == 403
    assert client.get("/api/v1/readiness", headers={**headers, "Origin": "https://evil.example"}).status_code == 403
    invalid = post(client, headers, "/api/v1/profiles", {
        "name": "role", "harness_type": "codex", "configuration": {}, "extra": True,
    }, "profile-extra")
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "REQUEST_INVALID"


def test_profile_workspace_and_session_records_are_idempotent(server):
    runtime, client, headers = server
    workspace_body = {"probe_id": "probe_fixture", "path": "/home/tester/中文 空格"}
    first_workspace = post(client, headers, "/api/v1/workspaces", workspace_body, "workspace-1")
    assert first_workspace.status_code == 201
    assert post(client, headers, "/api/v1/workspaces", workspace_body, "workspace-1").json() == first_workspace.json()
    assert runtime.service.workspaces.connector.open_calls == 1

    profile_body = {
        "name": "Codex role", "harness_type": "codex",
        "configuration": {"model": "configured-later"}, "credential_id": None,
    }
    first_profile = post(client, headers, "/api/v1/profiles", profile_body, "profile-1")
    assert first_profile.status_code == 201
    assert post(client, headers, "/api/v1/profiles", profile_body, "profile-1").json() == first_profile.json()
    conflict = post(client, headers, "/api/v1/profiles", {**profile_body, "name": "other"}, "profile-1")
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"

    session_body = {
        "workspace_id": first_workspace.json()["workspace_id"],
        "profile_id": first_profile.json()["profile_id"],
    }
    session = post(client, headers, "/api/v1/sessions", session_body, "session-1")
    assert session.status_code == 201
    assert client.get(f"/api/v1/sessions/{session.json()['session_id']}", headers=headers).status_code == 200



def test_product_records_survive_server_restart(tmp_path):
    root = tmp_path / "restart"
    first = build_runtime(root, harnesses=codex_registry(), connector=WslFixture())
    with TestClient(create_app(first), base_url="http://127.0.0.1") as client:
        headers = {"Authorization": f"Bearer {first.token}"}
        workspace = post(client, headers, "/api/v1/workspaces", {"probe_id": "probe_fixture", "path": "/workspace"}, "w")
        profile = post(client, headers, "/api/v1/profiles", {"name": "role", "harness_type": "codex", "configuration": {}}, "p")
        session = post(client, headers, "/api/v1/sessions", {
            "workspace_id": workspace.json()["workspace_id"], "profile_id": profile.json()["profile_id"],
        }, "s")
        session_id = session.json()["session_id"]
        token = first.token
    second = build_runtime(root, harnesses=codex_registry(), connector=WslFixture())
    assert second.token == token
    with TestClient(create_app(second), base_url="http://127.0.0.1") as client:
        headers = {"Authorization": f"Bearer {token}"}
        assert len(client.get("/api/v1/workspaces", headers=headers).json()["items"]) == 1
        assert len(client.get("/api/v1/profiles", headers=headers).json()["items"]) == 1
        assert client.get(f"/api/v1/sessions/{session_id}", headers=headers).status_code == 200


def test_secret_shaped_configuration_is_rejected_before_object_publication(server):
    runtime, client, headers = server
    response = post(client, headers, "/api/v1/profiles", {
        "name": "unsafe", "harness_type": "codex",
        "configuration": {"api_token": "must-not-be-read-or-stored"},
    }, "unsafe-profile")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "SECRET_FIELD_FORBIDDEN"
    assert not list((runtime.data_root / "objects").rglob("*"))


def test_unconfigured_runtime_reports_typed_capability_blockers(tmp_path):
    runtime = build_runtime(tmp_path / "unavailable")
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        headers = {"Authorization": f"Bearer {runtime.token}"}
        readiness = client.get("/api/v1/readiness", headers=headers).json()
        assert {item["code"] for item in readiness["blockers"]} == {
            "WSL_CONNECTOR_UNAVAILABLE", "EXECUTION_CAPABILITY_UNAVAILABLE",
        }
        assert readiness["capabilities"]["harnesses"] == {}
        assert readiness["capabilities"]["execution"] is False
        response = client.get("/api/v1/wsl/distributions", headers=headers)
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "WSL_CONNECTOR_UNAVAILABLE"


def test_future_schema_refuses_startup_without_overwrite(tmp_path):
    root = tmp_path / "future"
    runtime = build_runtime(root)
    runtime.start()
    runtime.stop()
    with sqlite3.connect(root / "state" / "agentbox.sqlite") as conn:
        conn.execute("UPDATE agentbox_product_schema SET version=999 WHERE singleton=1")
    newer = build_runtime(root)
    with pytest.raises(FutureSchemaError):
        newer.start()
    with sqlite3.connect(root / "state" / "agentbox.sqlite") as conn:
        assert conn.execute("SELECT version FROM agentbox_product_schema").fetchone()[0] == 999


def test_existing_unowned_directory_is_refused_without_modification(tmp_path):
    root = tmp_path / "unowned"
    root.mkdir()
    sentinel = root / "sentinel.txt"
    sentinel.write_text("preserve", encoding="utf-8")
    with pytest.raises(RuntimeError, match="DATA_ROOT_UNOWNED"):
        build_runtime(root)
    assert sentinel.read_text(encoding="utf-8") == "preserve"
    assert set(path.name for path in root.iterdir()) == {"sentinel.txt"}


@pytest.mark.skipif(os.name == "nt", reason="POSIX mode bits are not Windows ACL evidence")
def test_bootstrap_token_is_owner_only_on_posix(tmp_path):
    runtime = build_runtime(tmp_path / "protected-token")
    try:
        assert runtime.token_path.stat().st_mode & 0o777 == 0o600
    finally:
        runtime.stop()


def test_data_roots_are_isolated_and_single_owner_is_enforced(tmp_path):
    first = build_runtime(tmp_path / "one")
    second = build_runtime(tmp_path / "two")
    first.start()
    try:
        with pytest.raises(RuntimeError, match="DATA_ROOT_IN_USE"):
            build_runtime(tmp_path / "one")
        second.start()
        try:
            assert first.database.path != second.database.path
            with first.database.read() as first_conn, second.database.read() as second_conn:
                assert first_conn.execute("PRAGMA database_list").fetchone()[2] != second_conn.execute("PRAGMA database_list").fetchone()[2]
        finally:
            second.stop()
    finally:
        first.stop()


def test_object_failure_cannot_leave_a_dangling_profile_reference(tmp_path):
    class BrokenObjects(ObjectStore):
        def publish(self, content):
            raise OSError("injected publish failure")

    database = Database(tmp_path / "broken")
    database.initialize()
    idempotency = IdempotentRecords(database)
    service = ProfileService(
        ProfileRecords(database, idempotency), idempotency,
        BrokenObjects(tmp_path / "broken"),
        harnesses=codex_registry(), credentials=CredentialRecords(database),
    )
    with pytest.raises(OSError, match="injected"):
        service.create("key", {
            "name": "role", "harness_type": "codex", "configuration": {}, "credential_id": None,
        })
    with database.read() as conn:
        assert conn.execute("SELECT COUNT(*) FROM server_profiles").fetchone()[0] == 0


def test_core_uses_the_server_owned_database_file(tmp_path):
    runtime = build_runtime(tmp_path / "core-shared")
    runtime.start()
    try:
        row = core_db.get_conn().execute("PRAGMA database_list").fetchone()
        assert Path(row[2]).resolve() == runtime.database.path
        assert core_db.get_conn().execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='core_works'"
        ).fetchone() is not None
    finally:
        runtime.stop()


def test_schema_one_migrates_turn_identity_columns_idempotently(tmp_path):
    root = tmp_path / "migration"
    path = root / "state" / "agentbox.sqlite"
    path.parent.mkdir(parents=True)
    with sqlite3.connect(path) as conn:
        conn.executescript("""
        CREATE TABLE agentbox_product_schema (
          singleton INTEGER PRIMARY KEY, version INTEGER NOT NULL, applied_at TEXT NOT NULL
        );
        INSERT INTO agentbox_product_schema VALUES (1,1,'old');
        CREATE TABLE server_profiles (id TEXT PRIMARY KEY);
        CREATE TABLE server_sessions (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL);
        CREATE TABLE server_turns (
          id TEXT PRIMARY KEY, session_id TEXT NOT NULL, profile_revision INTEGER NOT NULL,
          native_generation INTEGER NOT NULL, state TEXT NOT NULL, capture_state TEXT NOT NULL,
          cleanup_state TEXT NOT NULL, input_object_digest TEXT NOT NULL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        INSERT INTO server_profiles VALUES ('profile-old');
        INSERT INTO server_sessions VALUES ('session-old','profile-old');
        INSERT INTO server_turns VALUES (
          'turn-old','session-old',1,0,'completed','captured','cleaned','sha256:old','old','old'
        );
        """)
    database = Database(root)
    database.initialize()
    database.initialize()
    with database.read() as conn:
        assert conn.execute(
            "SELECT version FROM agentbox_product_schema WHERE singleton=1"
        ).fetchone()[0] == 3
        row = conn.execute("SELECT * FROM server_turns WHERE id='turn-old'").fetchone()
        assert row["profile_id"] == "profile-old"
        assert {"work_id", "execution_id", "dispatch_id", "result_object_digest",
                "error_code", "stop_requested_at", "terminal_reason"} <= set(row.keys())
        # The wire identity fields arrived with the same non-destructive pass.
        workspace = conn.execute("SELECT * FROM server_workspaces LIMIT 1").fetchone()
        assert workspace is None or {"version", "display_name", "normalized_path"} <= set(workspace.keys())


def test_restart_seals_unfinished_turn_as_unknown_without_redispatch(tmp_path):
    root = tmp_path / "interrupted"
    first = build_runtime(root, harnesses=codex_registry(), connector=WslFixture())
    first.start()
    try:
        workspace = first.repository.create_workspace(
            key="w", request_digest="w", distribution="Ubuntu", remote_user="tester",
            remote_path="/workspace", connection_id="connection",
        )[1]
        config = first.objects.publish(b'{"schema_version":1,"harness_type":"codex","configuration":{}}')
        profile = first.repository.create_profile(
            key="p", request_digest="p", name="role", harness_type="codex",
            config_digest=config.digest, credential_id=None,
        )[1]
        session = first.repository.create_session(
            key="s", request_digest="s", workspace_id=workspace["workspace_id"],
            profile_id=profile["profile_id"],
        )[1]
        prompt = first.objects.publish(b'{"schema_version":1,"text":"pending"}')
        first.repository.create_turn(
            session_id=session["session_id"], key="t", request_digest="t",
            input_object_digest=prompt.digest, expected_profile_revision=1,
        )
    finally:
        first.stop()

    second = build_runtime(root, harnesses=codex_registry(), connector=WslFixture())
    second.start()
    try:
        recovered = second.repository.get_session(session["session_id"])
        assert recovered["status"] == "recovery_required"
        assert recovered["turns"][0]["state"] == "unknown"
        assert recovered["turns"][0]["error_code"] == "SERVER_RESTART_INTERRUPTED"
        assert recovered["events"][-1]["data"]["state"] == "unknown"
    finally:
        second.stop()
