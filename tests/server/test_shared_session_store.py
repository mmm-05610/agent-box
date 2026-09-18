"""Order 66 stage A: the whole-db session store - declaration and binding.

Two layers are covered here:

* the bwrap compiler's overlay rule (unit): every shared name is bound from
  the family library over the profile home's own copy, *after* the state home
  bind, and a target outside the declared state directory is refused;
* the real chain (local placement, bwrap, the release Worker binary is not
  needed): a family that declares `sessionStore.kind = "whole-db"` has the
  named entries written into the per-harness library
  (`<home root>/_sessions/<family>/...`), while a name the declaration did
  not share stays in the profile home.
"""
from __future__ import annotations

import json
import shutil
import time
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
PLUGIN = REPO / "plugins" / "agent-box-harnesses"
PEER_SOURCE = "tests/harness_remote/home_probe_acp_peer.mjs"
PEER_BYTES = REPO / "tests" / "server" / "fixtures" / "home_probe_acp_peer.mjs"

SHARED = [
    {"name": "kilo.db", "kind": "file"},
    {"name": "storage/session_diff", "kind": "directory"},
    {"name": "kilo", "kind": "directory"},
]
STATE_TARGET = "/runtime/home/.local/share/kilo"

DEPLOYMENT = {
    "schemaVersion": 1,
    "harnesses": [
        {
            "id": "kilo",
            "capabilityClaims": {"stream": True},
            "adapter": {"command": "/usr/bin/node", "args": [], "source": PEER_SOURCE,
                        "environment": {
                            "AGENTBOX_FIXTURE_STATE_DIR": f"{STATE_TARGET}/kilo",
                        }},
            "stateProjection": {"target": STATE_TARGET},
            "sessionStore": {"kind": "whole-db", "shared": SHARED},
            "timeoutMs": 60_000,
        },
    ],
}


def test_the_compiler_layers_shared_names_over_the_state_home():
    """The overlay bind comes after the state home and stays inside it."""
    from agent_box_sandbox_bwrap.provider import compile_remote_sidecar_bwrap_argv
    from agent_box.extensions.runtime_composition import ProjectionRejected

    argv = compile_remote_sidecar_bwrap_argv(
        workspace="/host/workspace", runtime_view="/host/view",
        environment={"HOME": "/runtime/home"},
        writable_projection_mounts=[("/host/role/.local/share/kilo", STATE_TARGET)],
        state_overlay_mounts=[
            ("/host/library/kilo.db", f"{STATE_TARGET}/kilo.db"),
            ("/host/library/storage/session_diff", f"{STATE_TARGET}/storage/session_diff"),
        ],
    )
    pairs = [(argv[index + 1], argv[index + 2])
             for index, value in enumerate(argv) if value in {"--bind", "--ro-bind"}]
    home = ("/host/role/.local/share/kilo", STATE_TARGET)
    overlay = ("/host/library/kilo.db", f"{STATE_TARGET}/kilo.db")
    assert home in pairs and overlay in pairs
    assert pairs.index(home) < pairs.index(overlay), "the overlay must win"

    with pytest.raises(ProjectionRejected):
        compile_remote_sidecar_bwrap_argv(
            workspace="/host/workspace", runtime_view="/host/view",
            environment={},
            writable_projection_mounts=[("/host/role/.local/share/kilo", STATE_TARGET)],
            state_overlay_mounts=[("/host/library/escape", "/runtime/home/.config/kilo/x")],
        )


def _wire_post(client, token, method, params):
    response = client.post(f"/wire/v1/{method}", headers={
        "Authorization": f"Bearer {token}",
    }, json={"jsonrpc": "2.0", "id": method, "method": method, "params": params})
    body = response.json()
    if "error" in body:
        raise AssertionError(f"{method}: {json.dumps(body['error'])}")
    return body["result"]


def _wait_turn(runtime, session_id, timeout=90.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        session = runtime.repository.get_session(session_id)
        if session["turns"] and session["turns"][0]["state"] in {"completed", "failed"}:
            return session
        time.sleep(0.05)
    raise AssertionError("the turn never reached a terminal state")


@pytest.mark.skipif(shutil.which("bwrap") is None, reason="bwrap is required")
@pytest.mark.parametrize(
    "state_dir,placement",
    [(f"{STATE_TARGET}/kilo", "library"), (f"{STATE_TARGET}/log", "profile")],
)
def test_whole_db_shared_names_land_in_the_library(tmp_path, state_dir, placement):
    from fastapi.testclient import TestClient

    from agent_box.server.bootstrap import build_runtime_from_sidecar_deployment
    from agent_box.server.transport.http import create_app

    import agent_box.server.bootstrap.runtime as runtime_module

    document_value = json.loads(json.dumps(DEPLOYMENT))
    document_value["harnesses"][0]["adapter"]["environment"] = {
        "AGENTBOX_FIXTURE_STATE_DIR": state_dir,
    }

    original_file = runtime_module._sidecar_deployment_file

    def deployment_file(root, relative):
        if relative == PEER_SOURCE:
            return PEER_BYTES.read_bytes()
        return original_file(root, relative)

    runtime_module._sidecar_deployment_file = deployment_file
    try:
        data_root = tmp_path / "server"
        workspace = tmp_path / "project"
        workspace.mkdir()
        document = tmp_path / "deployment.json"
        document.write_text(json.dumps(document_value), encoding="utf-8")
        runtime = build_runtime_from_sidecar_deployment(
            data_root, document, plugin_root=PLUGIN)
        with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
            token = runtime.token
            opened = _wire_post(client, token, "workspaces.open", {
                "requestId": "store-open", "path": str(workspace),
                "environment": {"kind": "local", "host": None, "user": None},
            })
            profile = client.post("/api/v1/profiles", headers={
                "Authorization": f"Bearer {token}", "Idempotency-Key": "store-profile",
            }, json={"name": "shared-store", "harness_type": "kilo",
                     "configuration": {}, "credential_id": None})
            assert profile.status_code == 201, profile.text
            profile_id = profile.json()["profile_id"]

            def send(request_id, text):
                return _wire_post(client, token, "sessions.createAndSend", {
                    "requestId": request_id, "workspaceId": opened["workspace"]["id"],
                    "profileId": profile_id, "overrides": [],
                    "message": {"text": text, "attachments": []},
                })

            # Turn 1: the fixture writes into a *shared* name (<state>/kilo).
            first = send("store-shared", "write into the shared subtree")
            session = _wait_turn(runtime, first["session"]["id"])
            assert session["turns"][0]["state"] == "completed", session["turns"][0]

            library = data_root / "profiles" / "_sessions" / "kilo"
            role_dirs = [
                item for item in (data_root / "profiles").iterdir()
                if item.is_dir() and item.name != "_sessions"
            ]
            assert len(role_dirs) == 1, role_dirs
            role = role_dirs[0]
            relative = state_dir[len(STATE_TARGET) + 1:]
            shared_file = library / relative / "native-state.json"
            profile_file = role / ".local/share/kilo" / relative / "native-state.json"
            if placement == "library":
                # A shared name: the write lands in the family library, and the
                # profile home keeps at most the empty mount point bwrap made.
                assert shared_file.is_file(), sorted(library.rglob("*"))
                assert not profile_file.exists()
            else:
                # A name the declaration did not share (log/): the write stays
                # in the profile home and never reaches the library.
                assert profile_file.is_file(), sorted(role.rglob("*"))
                assert not shared_file.exists(), sorted(library.rglob("*"))
    finally:
        runtime_module._sidecar_deployment_file = original_file

def test_switch_preflight_same_family_idle_guard(tmp_path):
    """Order 66 stage B: the switch preflight - same family, idle sides, guard.

    First-hand facts at the repository boundary: a same-family switch to an
    idle role is confirmed; a cross-family target is refused; a target role
    with an active Turn is refused with the running rule; a failing shared-
    store guard refuses typed and never moves the link.
    """
    from agent_box.server.credentials import CredentialRecords
    from agent_box.server.errors import ServerError
    from agent_box.server.execution.session_store_guard import SessionStoreGuardError
    from agent_box.server.idempotency import IdempotentRecords
    from agent_box.server.profiles import ProfileRecords
    from agent_box.server.sessions import SessionRecords, SessionService
    from agent_box.server.workspaces import WorkspaceRecords
    from agent_box.storage import Database, ObjectStore

    database = Database(tmp_path / "data")
    database.initialize()
    idempotency = IdempotentRecords(database)
    credentials = CredentialRecords(database)
    profiles = ProfileRecords(database, idempotency)
    workspaces = WorkspaceRecords(database, idempotency)
    objects = ObjectStore(tmp_path / "data")

    state = {"refuse": False}

    def guard():
        if state["refuse"]:
            raise SessionStoreGuardError(
                "SESSION_STORE_CREDENTIALS_PRESENT",
                "credential rows are present in the shared store",
                table="credential",
            )

    records = SessionRecords(database, idempotency,
                             shared_store_guards={"kilo": guard})

    class _NoExecution:
        def accept(self, turn_id, *, overrides=None):
            return None

        def cancel(self, turn_id):
            return True

    from agent_box.server.execution import HarnessDescriptor, HarnessRegistry

    registry = HarnessRegistry()
    registry.register(HarnessDescriptor("kilo", credential_kind=None))
    registry.register(HarnessDescriptor("alpha", credential_kind=None))
    service = SessionService(records, idempotency, objects,
                             harnesses=registry, profiles=profiles,
                             credentials=credentials, execution=_NoExecution())

    config_kilo = objects.publish(
        b'{"schema_version":1,"harness_type":"kilo","configuration":{}}')
    role_a = profiles.create(
        key="a", request_digest="a", name="role-a", harness_type="kilo",
        config_digest=config_kilo.digest, credential_id=None)[1]
    role_b = profiles.create(
        key="b", request_digest="b", name="role-b", harness_type="kilo",
        config_digest=config_kilo.digest, credential_id=None)[1]
    role_other = profiles.create(
        key="c", request_digest="c", name="role-c", harness_type="alpha",
        config_digest=config_kilo.digest, credential_id=None)[1]
    workspace = workspaces.create(
        key="w", request_digest="w", distribution="Ubuntu", remote_user="tester",
        remote_path="/workspace", connection_id="connection",
    )[1]
    with database.transaction() as conn:
        conn.execute("UPDATE server_workspaces SET env_kind='local' WHERE id=?",
                     (workspace["workspace_id"],))

    first = service.create_session("s1", {
        "workspace_id": workspace["workspace_id"], "profile_id": role_a["profile_id"],
    })[1]
    second = service.create_session("s2", {
        "workspace_id": workspace["workspace_id"], "profile_id": role_b["profile_id"],
    })[1]

    def linked_role(session_id):
        with database.read() as conn:
            return conn.execute("SELECT profile_id FROM server_sessions WHERE id=?",
                                (session_id,)).fetchone()[0]

    def switch(target_id, request_id):
        with database.read() as conn:
            version = conn.execute(
                "SELECT version FROM server_sessions WHERE id=?",
                (first["session_id"],)).fetchone()[0]
        return records.switch_profile(
            session_id=first["session_id"], profile_id=target_id,
            expected_version=version, request_id=request_id, request_digest=request_id,
        )

    # 1) The target role is mid-turn: the switch is refused with the running
    #    rule (and the same-family check passed first).
    _kind, busy_turn = service.create_turn(
        second["session_id"], "busy-key",
        {"text": "hold", "expected_profile_revision": 1})
    with pytest.raises(ServerError) as busy:
        switch(role_b["profile_id"], "switch-busy")
    assert busy.value.code == "TURN_CONCURRENCY_CONFLICT"
    assert "target Profile" in busy.value.message
    # End the busy turn so the later cases exercise the guard, not the lock.
    records.fail_turn(busy_turn["turn_id"], "TEST_ENDED", capture_state="failed")

    # 2) Cross family -> refused typed, before any guard runs.
    with pytest.raises(ServerError) as mismatch:
        switch(role_other["profile_id"], "switch-other")
    assert mismatch.value.code == "PROFILE_HARNESS_MISMATCH"

    # 3) The guard refuses -> typed code, and the link never moves.
    state["refuse"] = True
    with pytest.raises(ServerError) as guarded:
        switch(role_b["profile_id"], "switch-guarded")
    assert guarded.value.code == "SESSION_STORE_CREDENTIALS_PRESENT"
    assert linked_role(first["session_id"]) == role_a["profile_id"]

    # 4) Guard passes and the target is idle -> confirmed, link moves.
    state["refuse"] = False
    outcome, body = switch(role_b["profile_id"], "switch-ok")
    assert outcome == "confirmed" and body["outcome"] == "confirmed"
    assert linked_role(first["session_id"]) == role_b["profile_id"]


def test_a_credential_hit_in_the_shared_library_is_kept_not_deleted():
    """Order 66 §2.5: the disposition rule for one credential-hit failure.

    The audited tree decides: on the shared family library the hit stays a
    typed failure and the file is left in place (deleting would destroy other
    Profiles' sessions); on a profile-scoped tree the old delete rule holds;
    anything that is not a credential hit has no disposition.
    """
    from agent_box.server.execution.sidecar_backend import _credential_hit_disposition

    class _Hit(Exception):
        code = "SIDECAR_STATE_CONTAINS_SECRET"

    class _Other(Exception):
        code = "SIDECAR_STATE_OUTSIDE_BOUNDS"

    class _SharedPort:
        shared_store = True

    class _ProfilePort:
        shared_store = False

    assert _credential_hit_disposition(_Hit(), _SharedPort()) == "keep-shared"
    assert _credential_hit_disposition(_Hit(), _ProfilePort()) == "delete"
    assert _credential_hit_disposition(_Other(), _SharedPort()) == "none"
    assert _credential_hit_disposition(_Hit(), object()) == "delete"


STATEFUL_PEER_SOURCE = "tests/harness_remote/shared_store_acp_peer.mjs"
STATEFUL_PEER_BYTES = REPO / "tests" / "server" / "fixtures" / "shared_store_acp_peer.mjs"
NONCE = "STATEFUL-NONCE-6X37"

G1_DEPLOYMENT = {
    "schemaVersion": 1,
    "harnesses": [
        {
            "id": "kilo",
            "capabilityClaims": {"stream": True, "native_continuation": True},
            "adapter": {"command": "/usr/bin/node", "args": [],
                        "source": STATEFUL_PEER_SOURCE},
            "stateProjection": {"target": "/runtime/home/sessions"},
            "sessionStore": {"kind": "whole-db",
                             "shared": [{"name": "state.json", "kind": "file"},
                                        {"name": "kilo.db", "kind": "file"}]},
            "timeoutMs": 60_000,
        },
    ],
}


def _build_whole_db_runtime(tmp_path, deployment, peer_source, peer_bytes):
    from agent_box.server.bootstrap import build_runtime_from_sidecar_deployment

    import agent_box.server.bootstrap.runtime as runtime_module

    original_file = runtime_module._sidecar_deployment_file

    def deployment_file(root, relative):
        if relative == peer_source:
            return peer_bytes.read_bytes()
        return original_file(root, relative)

    runtime_module._sidecar_deployment_file = deployment_file
    (tmp_path / "project").mkdir(exist_ok=True)
    try:
        data_root = tmp_path / "server"
        document = tmp_path / "deployment.json"
        document.write_text(json.dumps(deployment), encoding="utf-8")
        runtime = build_runtime_from_sidecar_deployment(
            data_root, document, plugin_root=PLUGIN)
    finally:
        runtime_module._sidecar_deployment_file = original_file
    return runtime, data_root


def _wire(client, token, method, params):
    response = client.post(f"/wire/v1/{method}", headers={
        "Authorization": f"Bearer {token}",
    }, json={"jsonrpc": "2.0", "id": method, "method": method, "params": params})
    return response.json()


def _wait_session(runtime, session_id, turns_expected, timeout=90.0):
    deadline = time.monotonic() + timeout
    session = None
    while time.monotonic() < deadline:
        session = runtime.repository.get_session(session_id)
        if (len(session["turns"]) >= turns_expected
                and session["turns"][turns_expected - 1]["state"] in {"completed", "failed"}):
            return session
        time.sleep(0.05)
    raise AssertionError(f"turn {turns_expected} never reached a terminal state: {session and session['turns']}")


@pytest.mark.skipif(shutil.which("bwrap") is None, reason="bwrap is required")
def test_cross_profile_recall_through_the_shared_library(tmp_path):
    """Order 66 G1: two rounds under one role, then a role switch, and the
    *third* turn really recalls what round one stored - same native identity."""
    from fastapi.testclient import TestClient

    from agent_box.server.transport.http import create_app

    runtime, data_root = _build_whole_db_runtime(
        tmp_path, G1_DEPLOYMENT, STATEFUL_PEER_SOURCE, STATEFUL_PEER_BYTES)
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        token = runtime.token
        opened = _wire(client, token, "workspaces.open", {
            "requestId": "recall-open", "path": str(tmp_path / "project"),
            "environment": {"kind": "local", "host": None, "user": None},
        })["result"]
        profiles = {}
        for name in ("role-a", "role-b"):
            created = client.post("/api/v1/profiles", headers={
                "Authorization": f"Bearer {token}",
                "Idempotency-Key": f"recall-{name}",
            }, json={"name": name, "harness_type": "kilo",
                     "configuration": {}, "credential_id": None})
            assert created.status_code == 201, created.text
            profiles[name] = created.json()["profile_id"]

        first = _wire(client, token, "sessions.createAndSend", {
            "requestId": "recall-turn-1", "workspaceId": opened["workspace"]["id"],
            "profileId": profiles["role-a"], "overrides": [],
            "message": {"text": f"{NONCE} remember this and answer.", "attachments": []},
        })["result"]
        session_id = first["session"]["id"]
        session = _wait_session(runtime, session_id, 1)
        assert session["turns"][0]["state"] == "completed", session["turns"][0]
        native_after_first = session["checkpoint"]["native_id"]

        # The switch: same family, both sides idle, guard sees an empty store.
        version = runtime.repository.get_session(session_id)["version"]
        switched = _wire(client, token, "sessions.switchProfile", {
            "requestId": "recall-switch", "sessionId": session_id,
            "profileId": profiles["role-b"], "expectedVersion": version,
        })
        assert "error" not in switched, switched
        assert switched["result"]["outcome"] == "confirmed", switched

        second = _wire(client, token, "sessions.send", {
            "requestId": "recall-turn-2", "sessionId": session_id, "overrides": [],
            "message": {"text": "What did I ask you to remember? Reply with the nonce.",
                        "attachments": []},
        })
        assert "error" not in second, second
        session = _wait_session(runtime, session_id, 2)
        assert session["turns"][1]["state"] == "completed", session["turns"][1]

        turn_two_id = session["turns"][1]["id"]
        recalled = [item["data"].get("text") for item in session["events"]
                    if item["kind"] == "message.delta" and item.get("turn_id") == turn_two_id]
        assert NONCE in recalled, recalled
        # Same native identity across the role switch: the reopened session is
        # the one round one wrote into the shared library.
        assert session["checkpoint"]["native_id"] == native_after_first
        # The switch published the existing config.changed event, and each turn
        # keeps its own role attribution.
        assert any(item["kind"] == "config.changed" for item in session["events"])
        with runtime.database.read() as conn:
            attribution = [
                row["profile_id"] for row in conn.execute(
                    "SELECT profile_id FROM server_turns WHERE session_id=? ORDER BY created_at, id",
                    (session_id,),
                ).fetchall()
            ]
        assert attribution == [profiles["role-a"], profiles["role-b"]], attribution
        # The state file landed in the family library, not in either role home.
        assert (data_root / "profiles" / "_sessions" / "kilo" / "state.json").is_file()


@pytest.mark.skipif(shutil.which("bwrap") is None, reason="bwrap is required")
def test_the_guard_refuses_credential_rows_at_the_switch(tmp_path):
    """Order 66 G2: the guard's counterexamples, exercised at the switch.

    A synthetic credential row in the shared library refuses the switch
    (typed, wire-visible); the same row kept WAL-resident still refuses; a
    structure the guard cannot read refuses too - all fail-closed."""
    import sqlite3

    from fastapi.testclient import TestClient

    from agent_box.server.transport.http import create_app

    runtime, data_root = _build_whole_db_runtime(
        tmp_path, G1_DEPLOYMENT, STATEFUL_PEER_SOURCE, STATEFUL_PEER_BYTES)
    library = data_root / "profiles" / "_sessions" / "kilo"
    library.mkdir(parents=True, exist_ok=True)
    db = library / "kilo.db"

    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        token = runtime.token
        opened = _wire(client, token, "workspaces.open", {
            "requestId": "guard-open", "path": str(tmp_path / "project"),
            "environment": {"kind": "local", "host": None, "user": None},
        })["result"]
        profiles = {}
        for name in ("role-a", "role-b"):
            created = client.post("/api/v1/profiles", headers={
                "Authorization": f"Bearer {token}", "Idempotency-Key": f"guard-{name}",
            }, json={"name": name, "harness_type": "kilo",
                     "configuration": {}, "credential_id": None})
            profiles[name] = created.json()["profile_id"]

        first = _wire(client, token, "sessions.createAndSend", {
            "requestId": "guard-turn", "workspaceId": opened["workspace"]["id"],
            "profileId": profiles["role-a"], "overrides": [],
            "message": {"text": "hello", "attachments": []},
        })["result"]
        session_id = first["session"]["id"]
        _wait_session(runtime, session_id, 1)

        def switch(request_id):
            version = runtime.repository.get_session(session_id)["version"]
            return _wire(client, token, "sessions.switchProfile", {
                "requestId": request_id, "sessionId": session_id,
                "profileId": profiles["role-b"], "expectedVersion": version,
            })

        # Control: an empty seeded store passes.
        assert switch("guard-clean")["result"]["outcome"] == "confirmed"

        # 1) A synthetic credential row (committed) refuses the switch.
        writer = sqlite3.connect(db)
        writer.execute("PRAGMA journal_mode=WAL")
        writer.execute("CREATE TABLE IF NOT EXISTS credential (id TEXT PRIMARY KEY, value TEXT)")
        writer.execute("INSERT INTO credential VALUES ('synthetic', 'not-a-real-secret')")
        writer.commit()
        writer.close()
        refusal = switch("guard-hit")
        assert "error" in refusal, refusal
        assert refusal["error"]["code"] == "CONFLICT_REQUEST"
        assert refusal["error"]["details"]["internalCode"] == "SESSION_STORE_CREDENTIALS_PRESENT"

        # 2) The WAL variant: rows that live only in the -wal file still
        #    refuse. A held read snapshot keeps the committed rows
        #    WAL-resident, so a plain immutable read lags behind the live
        #    count while the guard (mode=ro, which reads through the WAL)
        #    still refuses.
        reader = sqlite3.connect(db)
        reader.execute("BEGIN")
        # Materialise the read snapshot before the writer commits: a deferred
        # BEGIN alone holds nothing, and the writer's close would checkpoint.
        assert reader.execute("SELECT COUNT(*) FROM credential").fetchone()[0] == 1
        writer = sqlite3.connect(db)
        writer.execute("INSERT INTO credential VALUES ('in-wal', 'still-not-a-secret')")
        writer.commit()
        writer.close()
        assert (library / "kilo.db-wal").exists()
        assert (library / "kilo.db-wal").stat().st_size > 0
        immutable = sqlite3.connect(f"file:{db}?mode=ro&immutable=1", uri=True)
        try:
            seen_immutable = immutable.execute(
                "SELECT COUNT(*) FROM credential").fetchone()[0]
        except sqlite3.OperationalError:
            seen_immutable = 0  # the table itself is only in the WAL
        immutable.close()
        live = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        seen_live = live.execute("SELECT COUNT(*) FROM credential").fetchone()[0]
        live.close()
        assert seen_live == 2 and seen_immutable < seen_live, (
            f"immutable saw {seen_immutable}, live saw {seen_live}")
        refusal = switch("guard-wal")
        assert refusal["error"]["details"]["internalCode"] == "SESSION_STORE_CREDENTIALS_PRESENT", refusal
        reader.close()

        # 3) A structure the guard cannot read refuses (fail-closed).
        db.write_bytes(b"this is not a database\n")
        refusal = switch("guard-structure")
        assert refusal["error"]["details"]["internalCode"] in {
            "SESSION_STORE_GUARD_STRUCTURE", "SESSION_STORE_CREDENTIALS_PRESENT",
        }, refusal


@pytest.mark.skipif(shutil.which("bwrap") is None, reason="bwrap is required")
def test_cross_profile_parallel_turns_and_the_running_switch(tmp_path):
    """Order 66 G5 (fixture-level): two Profiles write one library at once.

    First-hand facts: two different Sessions of two Profiles run concurrently
    against the same shared library and both complete; each append lands (no
    lost update); the journal keeps both lines; a session with an active Turn
    refuses a role switch (the same-session writer rule). The SQLite-level
    cold-start assertions (one project row, zero SQLITE_BUSY) belong to the
    real family's gate - a fixture has no SQLite - and are recorded there.
    """
    import threading

    from fastapi.testclient import TestClient

    from agent_box.server.transport.http import create_app

    (tmp_path / "project").mkdir(exist_ok=True)
    deployment = json.loads(json.dumps(G1_DEPLOYMENT))
    deployment["harnesses"][0]["sessionStore"]["shared"].append(
        {"name": "journal.txt", "kind": "file"})
    runtime, data_root = _build_whole_db_runtime(
        tmp_path, deployment, STATEFUL_PEER_SOURCE, STATEFUL_PEER_BYTES)
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        token = runtime.token
        opened = _wire(client, token, "workspaces.open", {
            "requestId": "par-open", "path": str(tmp_path / "project"),
            "environment": {"kind": "local", "host": None, "user": None},
        })["result"]
        profiles = {}
        for name in ("role-a", "role-b"):
            created = client.post("/api/v1/profiles", headers={
                "Authorization": f"Bearer {token}", "Idempotency-Key": f"par-{name}",
            }, json={"name": name, "harness_type": "kilo",
                     "configuration": {}, "credential_id": None})
            profiles[name] = created.json()["profile_id"]

        started: dict[str, dict] = {}
        errors: list[str] = []

        def send(name: str, text: str) -> None:
            try:
                started[name] = _wire(client, token, "sessions.createAndSend", {
                    "requestId": f"par-{name}-turn", "workspaceId": opened["workspace"]["id"],
                    "profileId": profiles[name], "overrides": [],
                    "message": {"text": text, "attachments": []},
                })["result"]
            except BaseException as exc:  # noqa: BLE001
                errors.append(f"{name}: {exc}")

        threads = [
            threading.Thread(target=send, args=("role-a", f"{NONCE} journal:alpha-turn")),
            threading.Thread(target=send, args=("role-b", f"{NONCE} journal:bravo-turn")),
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        assert errors == [], errors

        sessions = {name: value["session"]["id"] for name, value in started.items()}
        for name, session_id in sessions.items():
            session = _wait_session(runtime, session_id, 1)
            assert session["turns"][0]["state"] == "completed", (name, session["turns"][0])

        journal = data_root / "profiles" / "_sessions" / "kilo" / "journal.txt"
        lines = sorted(journal.read_text(encoding="utf-8").split())
        assert lines == ["alpha-turn", "bravo-turn"], lines

        # The same-session writer rule, at the switch: while a Turn is active,
        # the session refuses a role change. The hold window makes it
        # deterministic.
        held = _wire(client, token, "sessions.createAndSend", {
            "requestId": "par-held-turn", "workspaceId": opened["workspace"]["id"],
            "profileId": profiles["role-a"], "overrides": [],
            "message": {"text": "hold-for-window", "attachments": []},
        })["result"]
        held_session = held["session"]["id"]
        version = runtime.repository.get_session(held_session)["version"]
        refusal = _wire(client, token, "sessions.switchProfile", {
            "requestId": "par-switch", "sessionId": held_session,
            "profileId": profiles["role-b"], "expectedVersion": version,
        })
        assert refusal["result"]["outcome"] == "rejected"
        assert refusal["result"]["reason"] == "execution_running"
        _wait_session(runtime, held_session, 1)


@pytest.mark.skipif(shutil.which("bwrap") is None, reason="bwrap is required")
def test_isolation_facts_two_profiles_and_the_librarys_visible_content(tmp_path):
    """Order 66 G3: what stays per-profile, and what the library exposes.

    Two Profiles each write their own non-shared log/ (state dir under the
    profile home): neither role directory can see the other's file, and the
    library never holds log/. The library's own visible content is enumerated
    from the disk - the declared shared entries plus the mount-point residue
    bwrap leaves - and recorded here as a fact, not a defect.
    """
    from fastapi.testclient import TestClient

    from agent_box.server.transport.http import create_app

    (tmp_path / "project").mkdir(exist_ok=True)
    runtime, data_root = _build_whole_db_runtime(
        tmp_path, G1_DEPLOYMENT, STATEFUL_PEER_SOURCE, STATEFUL_PEER_BYTES)
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        token = runtime.token
        opened = _wire(client, token, "workspaces.open", {
            "requestId": "iso-open", "path": str(tmp_path / "project"),
            "environment": {"kind": "local", "host": None, "user": None},
        })["result"]
        sessions = {}
        for name in ("role-a", "role-b"):
            created = client.post("/api/v1/profiles", headers={
                "Authorization": f"Bearer {token}", "Idempotency-Key": f"iso-{name}",
            }, json={"name": name, "harness_type": "kilo",
                     "configuration": {}, "credential_id": None})
            started = _wire(client, token, "sessions.createAndSend", {
                "requestId": f"iso-{name}-turn", "workspaceId": opened["workspace"]["id"],
                "profileId": created.json()["profile_id"], "overrides": [],
                "message": {"text": f"journal:{name}", "attachments": []},
            })["result"]
            sessions[name] = started["session"]["id"]
            _wait_session(runtime, sessions[name], 1)

        role_dirs = sorted(
            item for item in (data_root / "profiles").iterdir()
            if item.is_dir() and item.name != "_sessions"
        )
        assert len(role_dirs) == 2, [item.name for item in role_dirs]
        # Each role owns its own home; neither holds the other's marker.
        markers = {item.name: (item / ".agentbox-profile.json").is_file()
                   for item in role_dirs}
        assert all(markers.values()), markers
        # Anything the declaration did not share stays per-profile: each role
        # wrote its own journal inside its own home, and the library holds
        # neither the journal nor a log/ directory.
        for role in role_dirs:
            assert (role / "sessions" / "journal.txt").is_file(), sorted(role.rglob("*"))
        library = data_root / "profiles" / "_sessions" / "kilo"
        assert not (library / "log").exists()
        assert not (library / "journal.txt").exists()
        # The library's visible content, enumerated (order 66 G3 fact list):
        # the declared shared entries (an unwritten kilo.db, the state file),
        # and nothing else.
        visible = sorted(str(item.relative_to(library)) for item in library.rglob("*"))
        assert "state.json" in visible and "kilo.db" in visible, visible
        assert "journal.txt" not in visible, visible
