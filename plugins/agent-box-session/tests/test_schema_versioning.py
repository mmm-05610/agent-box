"""Schema version fail-closed tests (A8).

Covers: fresh creation stamps SCHEMA_VERSION; current-version reopen;
newer store opened by older code fails closed; older store without a
registered migration fails closed; the explicit v1→v2 migration works, is
transactional (failure rolls back the whole step), and preserves data;
corrupt or missing version metadata fails closed.
"""
from __future__ import annotations

import sqlite3

import pytest

from agent_box.protocols.session.failures import (
    MalformedSessionState,
    SchemaVersionUnsupported,
)

from agent_box_session import schema
from agent_box_session.store import SQLiteSessionStore

from agent_box.work_core.models import Ref, RefType
from conftest_store import FakeWorkAuthority, _begin, _creation_request


# The v1 shape of the store schema (turn_runs and the request_digest columns
# did not exist; this is the exact Phase 1 layout).
_V1_DDL = """
CREATE TABLE IF NOT EXISTS store_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    work_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    workspace_mode TEXT NOT NULL,
    workspace_provider TEXT NOT NULL,
    workspace_native_id TEXT NOT NULL,
    workspace_uri TEXT,
    workspace_metadata_json TEXT NOT NULL DEFAULT '{}',
    project_identity TEXT,
    event_seq_next INTEGER NOT NULL DEFAULT 1,
    watermark INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS turns (
    turn_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(session_id),
    state TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    binding_json TEXT NOT NULL,
    terminal_outcome TEXT,
    committed_watermark INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS turn_inputs (
    turn_id TEXT PRIMARY KEY REFERENCES turns(turn_id),
    text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS turn_executions (
    turn_id TEXT NOT NULL REFERENCES turns(turn_id),
    execution_id TEXT NOT NULL,
    linked_at TEXT NOT NULL,
    PRIMARY KEY (turn_id, execution_id)
);
CREATE TABLE IF NOT EXISTS session_events (
    session_id TEXT NOT NULL REFERENCES sessions(session_id),
    seq INTEGER NOT NULL,
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    turn_id TEXT,
    execution_id TEXT,
    payload_json TEXT NOT NULL DEFAULT '{}',
    terminal INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    PRIMARY KEY (session_id, seq)
);
CREATE TABLE IF NOT EXISTS idempotency_receipts (
    idempotency_key TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS writer_leases (
    session_id TEXT PRIMARY KEY REFERENCES sessions(session_id),
    owner_id TEXT NOT NULL,
    acquired_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recovery_operations (
    op_id TEXT PRIMARY KEY,
    session_id TEXT,
    kind TEXT NOT NULL,
    state TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS session_saga_ops (
    op_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    state TEXT NOT NULL,
    session_id TEXT,
    work_id TEXT,
    turn_id TEXT,
    detail_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS capability_state (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_events_turn
    ON session_events(session_id, turn_id);
CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);
"""


def _make_store(tmp_path, name="store.db", callbacks=None):
    authority = FakeWorkAuthority()
    store = SQLiteSessionStore(
        tmp_path / name, callbacks=callbacks or authority.callbacks()
    )
    return store, authority


def _stored_version(path):
    conn = sqlite3.connect(str(path))
    row = conn.execute(
        "SELECT value FROM store_meta WHERE key = 'schema_version'"
    ).fetchone()
    conn.close()
    return row[0] if row else None


def _set_version(path, value):
    conn = sqlite3.connect(str(path))
    with conn:
        conn.execute(
            "UPDATE store_meta SET value = ? WHERE key = 'schema_version'", (value,)
        )
    conn.close()


def _columns(path, table):
    conn = sqlite3.connect(str(path))
    names = [row[1] for row in conn.execute(f"PRAGMA table_info({table})")]
    conn.close()
    return names


def _tables(path):
    conn = sqlite3.connect(str(path))
    names = {row[0] for row in conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
    )}
    conn.close()
    return names


def test_fresh_store_is_created_at_current_schema_version(tmp_path):
    store, _ = _make_store(tmp_path)
    store.diagnostics()  # forces the connection
    assert _stored_version(store._path) == str(schema.SCHEMA_VERSION)
    assert schema.SCHEMA_VERSION == 3
    store.close()


def test_current_version_store_reopens(tmp_path):
    store, authority = _make_store(tmp_path)
    session = store.create_session(_creation_request("v2-open"))
    path, callbacks = store._path, authority.callbacks()
    store.close()
    reopened = SQLiteSessionStore(path, callbacks=callbacks)
    assert reopened.get_session(session.session_id).title == "Probe session"
    reopened.close()


def test_newer_schema_version_fails_closed(tmp_path):
    store, _ = _make_store(tmp_path)
    store.diagnostics()
    path = store._path
    store.close()
    _set_version(path, str(schema.SCHEMA_VERSION + 1))
    with pytest.raises(SchemaVersionUnsupported):
        SQLiteSessionStore(path).diagnostics()


def test_older_schema_version_without_migration_fails_closed(tmp_path):
    store, _ = _make_store(tmp_path)
    store.diagnostics()
    path = store._path
    store.close()
    _set_version(path, "0")
    with pytest.raises(SchemaVersionUnsupported):
        SQLiteSessionStore(path).diagnostics()


def _build_v1_database(path: str) -> None:
    conn = sqlite3.connect(path)
    conn.executescript(_V1_DDL)
    conn.execute(
        "INSERT INTO store_meta (key, value) VALUES ('schema_version', '1')"
    )
    conn.execute(
        "INSERT INTO sessions (session_id, work_id, title, status, workspace_mode, "
        "workspace_provider, workspace_native_id, workspace_uri, "
        "workspace_metadata_json, project_identity, event_seq_next, watermark, "
        "created_at) VALUES ('sess_v1', 'work_v1', 'legacy', 'open', 'live', "
        "'local-live-workspace', 'proj-1', NULL, '{}', NULL, 1, 0, '2026-01-01T00:00:00')"
    )
    conn.execute(
        "INSERT INTO turns (turn_id, session_id, state, idempotency_key, binding_json, "
        "created_at, updated_at) VALUES ('turn_v1', 'sess_v1', 'completed', 'k_v1', ?, "
        "'2026-01-01T00:00:00', '2026-01-01T00:00:00')",
        ('{"turn_id": "turn_v1", "session_watermark": 0, "harness_provider_id": '
         '"legacy-harness", "harness_provider_version": "1", "model_selection": null, '
         '"profile_ref": null, "workspace_ref": null, "workspace_mode": "live", '
         '"runtime_host_ref": null, "sandbox_ref": null, "codec_id": null, '
         '"codec_version": null, "capability_digest": null, "extra": {}}',),
    )
    conn.commit()
    conn.close()


def test_explicit_v1_to_v2_migration_works_and_preserves_data(tmp_path):
    path = tmp_path / "legacy.db"
    _build_v1_database(str(path))
    store = SQLiteSessionStore(path)
    diagnostics = store.diagnostics()
    assert diagnostics["schema_version"] == schema.SCHEMA_VERSION
    assert _stored_version(path) == str(schema.SCHEMA_VERSION)
    tables = _tables(path)
    assert "turn_runs" in tables
    assert "request_digest" in _columns(path, "session_saga_ops")
    assert "request_digest" in _columns(path, "idempotency_receipts")
    # Pre-existing data survived the migration.
    session = store.get_session("sess_v1")
    assert session.work_id == "work_v1"
    turn = store.get_turn("sess_v1", "turn_v1")
    assert turn.state.value == "completed"
    # The migrated store is fully writable and journals new runs.
    authority = FakeWorkAuthority()
    store.close()
    store2 = SQLiteSessionStore(path, callbacks=authority.callbacks())
    created = store2.create_session(_creation_request("post-migration"))
    result = _begin(store2, created.session_id, "post-migration-turn")
    run = store2.turn_run(result.turn_id)
    assert run.phase.value == "prepared"
    store2.close()


def test_v1_to_v2_migration_is_transactional(tmp_path, monkeypatch):
    path = tmp_path / "legacy-tx.db"
    _build_v1_database(str(path))
    original = schema.MIGRATIONS[1]

    def failing_migration(conn):
        original(conn)  # everything up to the version stamp succeeds...
        raise RuntimeError("crash inside the migration transaction")

    monkeypatch.setitem(schema.MIGRATIONS, 1, failing_migration)
    with pytest.raises(RuntimeError):
        SQLiteSessionStore(path).diagnostics()  # forces the connection
    # Nothing leaked: version unchanged, no new table, no new columns.
    assert _stored_version(path) == "1"
    assert "turn_runs" not in _tables(path)
    assert "request_digest" not in _columns(path, "session_saga_ops")
    assert "request_digest" not in _columns(path, "idempotency_receipts")
    # With the real migration registered again, the store migrates cleanly.
    monkeypatch.setitem(schema.MIGRATIONS, 1, original)
    store = SQLiteSessionStore(path)
    assert store.diagnostics()["schema_version"] == schema.SCHEMA_VERSION
    assert _stored_version(path) == str(schema.SCHEMA_VERSION)
    store.close()


def test_missing_schema_version_fails_closed(tmp_path):
    store, _ = _make_store(tmp_path)
    store.diagnostics()
    path = store._path
    store.close()
    conn = sqlite3.connect(str(path))
    with conn:
        conn.execute("DELETE FROM store_meta WHERE key = 'schema_version'")
    conn.close()
    with pytest.raises(MalformedSessionState):
        SQLiteSessionStore(path).diagnostics()


def test_corrupt_schema_version_fails_closed(tmp_path):
    store, _ = _make_store(tmp_path)
    store.diagnostics()
    path = store._path
    store.close()
    _set_version(path, "not-a-version")
    with pytest.raises(MalformedSessionState):
        SQLiteSessionStore(path).diagnostics()


def test_v2_store_missing_required_table_fails_closed(tmp_path):
    store, _ = _make_store(tmp_path)
    session = store.create_session(_creation_request("drop-table"))
    path = store._path
    store.close()
    conn = sqlite3.connect(str(path))
    conn.execute("DROP TABLE turn_runs")
    conn.commit()
    conn.close()
    with pytest.raises(MalformedSessionState):
        SQLiteSessionStore(path).diagnostics()


# -- v2 → v3 migration: reserved per-Execution link facts ------------------------


def _create_v1_store(path) -> None:
    """Create a genuine v1 store (no turn_runs, no digests, no link facts)."""
    import sqlite3

    V1_DDL = """
    CREATE TABLE IF NOT EXISTS store_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY, work_id TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open', workspace_mode TEXT NOT NULL,
        workspace_provider TEXT NOT NULL, workspace_native_id TEXT NOT NULL,
        workspace_uri TEXT, workspace_metadata_json TEXT NOT NULL DEFAULT '{}',
        project_identity TEXT, event_seq_next INTEGER NOT NULL DEFAULT 1,
        watermark INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS turns (
        turn_id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(session_id),
        state TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, binding_json TEXT NOT NULL,
        terminal_outcome TEXT, committed_watermark INTEGER, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS turn_inputs (turn_id TEXT PRIMARY KEY REFERENCES turns(turn_id), text TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS turn_executions (
        turn_id TEXT NOT NULL REFERENCES turns(turn_id), execution_id TEXT NOT NULL,
        linked_at TEXT NOT NULL, PRIMARY KEY (turn_id, execution_id));
    CREATE TABLE IF NOT EXISTS session_events (
        session_id TEXT NOT NULL REFERENCES sessions(session_id), seq INTEGER NOT NULL,
        event_id TEXT NOT NULL UNIQUE, event_type TEXT NOT NULL, turn_id TEXT,
        execution_id TEXT, payload_json TEXT NOT NULL DEFAULT '{}',
        terminal INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
        PRIMARY KEY (session_id, seq));
    CREATE TABLE IF NOT EXISTS idempotency_receipts (
        idempotency_key TEXT PRIMARY KEY, scope TEXT NOT NULL, result_json TEXT NOT NULL,
        created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS writer_leases (
        session_id TEXT PRIMARY KEY REFERENCES sessions(session_id), owner_id TEXT NOT NULL,
        acquired_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS recovery_operations (
        op_id TEXT PRIMARY KEY, session_id TEXT, kind TEXT NOT NULL, state TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS session_saga_ops (
        op_id TEXT PRIMARY KEY, kind TEXT NOT NULL, state TEXT NOT NULL, session_id TEXT,
        work_id TEXT, turn_id TEXT, detail_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS capability_state (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_session_events_turn ON session_events(session_id, turn_id);
    CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);
    """
    conn = sqlite3.connect(str(path))
    conn.executescript(V1_DDL)
    conn.execute("INSERT INTO store_meta (key, value) VALUES ('schema_version', '1')")
    conn.commit()
    conn.close()


def test_v2_store_migrates_to_v3_and_preserves_facts(tmp_path):
    """Opening a v2 store applies the explicit v2→v3 migration (reserved
    link facts columns) inside one transaction and keeps all data."""
    from agent_box_session.schema import (
        SCHEMA_VERSION,
        _apply_migration,
        _migrate_v1_to_v2,
        _migrate_v2_to_v3,
    )

    path = tmp_path / "migrated-v3.db"
    _create_v1_store(path)
    conn = sqlite3.connect(str(path), isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    _apply_migration(conn, _migrate_v1_to_v2, expected_source_version=1)
    # Seed a link row at v2, then migrate to v3.
    conn.execute(
        "INSERT INTO sessions (session_id, work_id, title, workspace_mode, "
        "workspace_provider, workspace_native_id, created_at) VALUES "
        "('sess_m', 'work_m', 'M', 'live', 'local-live-workspace', 'p', 't')"
    )
    conn.execute(
        "INSERT INTO turns (turn_id, session_id, state, idempotency_key, binding_json, "
        "created_at, updated_at) VALUES ('turn_m', 'sess_m', 'running', 'k_m', '{}', 't', 't')"
    )
    conn.execute(
        "INSERT INTO turn_executions (turn_id, execution_id, linked_at) "
        "VALUES ('turn_m', 'exec_m', 't')"
    )
    _apply_migration(conn, _migrate_v2_to_v3, expected_source_version=2)
    columns = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(turn_executions)").fetchall()
    }
    assert {
        "parent_execution_id",
        "input_session_ref_json",
        "output_native_session_ref_json",
        "workspace_input_ref_json",
        "workspace_output_ref_json",
    } <= columns
    conn.close()
    version_row = sqlite3.connect(str(path)).execute(
        "SELECT value FROM store_meta WHERE key = 'schema_version'"
    ).fetchone()
    assert version_row[0] == str(SCHEMA_VERSION)


def test_multi_version_chain_migrates_v1_to_current(tmp_path):
    """A v1 store opens through the full registered migration chain."""
    from agent_box_session.store import SQLiteSessionStore, StoreCallbacks

    path = tmp_path / "chain.db"
    _create_v1_store(path)
    store = SQLiteSessionStore(path, callbacks=StoreCallbacks())
    from agent_box_session.schema import SCHEMA_VERSION

    assert store.diagnostics()["schema_version"] == SCHEMA_VERSION
    store.close()


# -- official connect() path: real v1 database through the full chain ------------
#
# These tests call ONLY the official entry point (SQLiteSessionStore /
# connect()).  Migration functions are hand-applied ONLY to construct a
# genuine v2 fixture; the migration itself is always driven by connect().


def _seed_v1_data(path) -> None:
    """Insert rows into a genuine v1 store to prove data preservation."""
    import sqlite3

    conn = sqlite3.connect(str(path))
    conn.execute(
        "INSERT INTO sessions (session_id, work_id, title, workspace_mode, "
        "workspace_provider, workspace_native_id, created_at) VALUES "
        "('sess_v1', 'work_v1', 'legacy session', 'live', "
        "'local-live-workspace', 'proj-legacy', '2026-01-01T00:00:00+00:00')"
    )
    conn.execute(
        "INSERT INTO turns (turn_id, session_id, state, idempotency_key, "
        "binding_json, created_at, updated_at) VALUES "
        "('turn_v1', 'sess_v1', 'completed', 'k_v1', '{}', '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00')"
    )
    conn.execute(
        "INSERT INTO turn_executions (turn_id, execution_id, linked_at) "
        "VALUES ('turn_v1', 'exec_v1', '2026-01-01T00:00:00+00:00')"
    )
    conn.commit()
    conn.close()


def _v3_columns(path):
    import sqlite3

    return {
        row[1]
        for row in sqlite3.connect(str(path)).execute(
            "PRAGMA table_info(turn_executions)"
        ).fetchall()
    }


def test_real_connect_migrates_v1_to_v3_without_skipping(tmp_path):
    """A genuine v1 database opened through the OFFICIAL entry point must
    end at version 3 with all five v3 link-fact columns present and the
    legacy rows intact."""
    from agent_box_session.store import SQLiteSessionStore
    from conftest_store import FakeWorkAuthority, _creation_request

    path = tmp_path / "legacy.db"
    _create_v1_store(path)
    _seed_v1_data(path)

    authority = FakeWorkAuthority()
    store = SQLiteSessionStore(path, callbacks=authority.callbacks())
    assert store.diagnostics()["schema_version"] == 3
    assert {
        "parent_execution_id",
        "input_session_ref_json",
        "output_native_session_ref_json",
        "workspace_input_ref_json",
        "workspace_output_ref_json",
    } <= _v3_columns(path)
    # legacy v1 rows survive the chain
    legacy = store.get_session("sess_v1")
    assert legacy.title == "legacy session"
    assert legacy.work_id == "work_v1"

    # the facts APIs are truly usable on the migrated store
    lease = store.acquire_writer_lease("sess_v1", "w")
    begin = _begin(store, "sess_v1", "post-migration-turn")
    store.record_execution_input_facts(
        "sess_v1", begin.turn_id, begin.execution_id, lease,
        parent_execution_id="exec_v1",
        workspace_input_ref=Ref(RefType.WORKSPACE, "local-live-workspace", "proj-legacy"),
    )
    store.record_execution_output_facts(
        "sess_v1", begin.turn_id, begin.execution_id, lease,
        output_native_session_ref=Ref(
            RefType.SESSION, "pi-session", "legacy-loc",
            metadata={"harness_type": "pi"},
        ),
    )
    link = store.execution_link("sess_v1", begin.turn_id, begin.execution_id)
    assert link.parent_execution_id == "exec_v1"
    assert link.output_native_session_ref is not None
    store.close()


def test_migration_stamps_its_own_exact_target(tmp_path):
    """v1→v2 alone must stamp exactly '2' — never the global highest."""
    from agent_box_session import schema
    from agent_box_session.schema import _apply_migration

    path = tmp_path / "step.db"
    _create_v1_store(path)
    conn = sqlite3.connect(str(path), isolation_level=None)
    conn.execute("PRAGMA journal_mode = WAL")
    _apply_migration(conn, schema._migrate_v1_to_v2, expected_source_version=1)
    stamped = conn.execute(
        "SELECT value FROM store_meta WHERE key = 'schema_version'"
    ).fetchone()[0]
    conn.close()
    assert stamped == "2"


def test_connect_rejects_a_version_skipping_migration(tmp_path, monkeypatch):
    """A migration that jumps v1 → v3 must fail closed BEFORE its
    transaction commits: the whole step rolls back, the database stays a
    legitimate v1 (no turn_runs, no digest columns), and after the normal
    MIGRATIONS are restored it migrates cleanly to v3."""
    from agent_box_session import schema
    from agent_box_session.store import SQLiteSessionStore

    path = tmp_path / "skipper.db"
    _create_v1_store(path)

    def jumping_v1_to_v3(conn):
        # the real-world bug shape: do the v1→v2 work, then stamp the HIGH
        # version so the v2→v3 step is skipped
        schema._migrate_v1_to_v2(conn)
        conn.execute(
            "UPDATE store_meta SET value = '3' WHERE key = 'schema_version'"
        )

    monkeypatch.setitem(schema.MIGRATIONS, 1, jumping_v1_to_v3)
    store = SQLiteSessionStore(path, callbacks=FakeWorkAuthority().callbacks())
    with pytest.raises(schema.SchemaVersionUnsupported) as excinfo:
        store.diagnostics()  # forces the real connect() migration chain
    assert "exactly one version" in str(excinfo.value)
    store.close()

    # the failed step was rolled back in full: still a legitimate v1
    raw = sqlite3.connect(str(path))
    version = raw.execute(
        "SELECT value FROM store_meta WHERE key = 'schema_version'"
    ).fetchone()[0]
    tables = {
        row[0] for row in raw.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).fetchall()
    }
    digest_columns = {
        row[1] for row in raw.execute(
            "PRAGMA table_info(session_saga_ops)"
        ).fetchall()
    }
    raw.close()
    assert version == "1"
    assert "turn_runs" not in tables
    assert "request_digest" not in digest_columns

    # with the normal MIGRATIONS restored the store migrates cleanly
    monkeypatch.undo()
    store = SQLiteSessionStore(path, callbacks=FakeWorkAuthority().callbacks())
    assert store.diagnostics()["schema_version"] == 3
    assert "parent_execution_id" in _v3_columns(path)
    store.close()


def test_connect_rejects_a_stagnating_migration(tmp_path, monkeypatch):
    """A migration that runs but writes NO version advance must be caught
    BEFORE commit: the step rolls back and the database stays a legitimate
    v1; normal migration resumes afterwards."""
    from agent_box_session import schema
    from agent_box_session.store import SQLiteSessionStore

    path = tmp_path / "stagnate.db"
    _create_v1_store(path)

    def stagnating_v1_to_v2(conn):
        # do the schema work, then (bug) leave the version stamp at 1
        conn.execute(
            "CREATE TABLE IF NOT EXISTS turn_runs ("
            "turn_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, execution_id TEXT,"
            "dispatch_id TEXT, dispatch_digest TEXT, phase TEXT NOT NULL,"
            "recovery_facts_json TEXT NOT NULL DEFAULT '{}',"
            "created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
        )
        conn.execute(
            "ALTER TABLE session_saga_ops ADD COLUMN request_digest "
            "TEXT NOT NULL DEFAULT ''"
        )

    monkeypatch.setitem(schema.MIGRATIONS, 1, stagnating_v1_to_v2)
    store = SQLiteSessionStore(path, callbacks=FakeWorkAuthority().callbacks())
    with pytest.raises(schema.SchemaVersionUnsupported) as excinfo:
        store.diagnostics()
    assert "exactly one version" in str(excinfo.value)
    store.close()

    # full rollback: still a legitimate v1 with none of the step's DDL
    raw = sqlite3.connect(str(path))
    version = raw.execute(
        "SELECT value FROM store_meta WHERE key = 'schema_version'"
    ).fetchone()[0]
    tables = {
        row[0] for row in raw.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).fetchall()
    }
    digest_columns = {
        row[1] for row in raw.execute(
            "PRAGMA table_info(session_saga_ops)"
        ).fetchall()
    }
    raw.close()
    assert version == "1"
    assert "turn_runs" not in tables
    assert "request_digest" not in digest_columns

    monkeypatch.undo()
    store = SQLiteSessionStore(path, callbacks=FakeWorkAuthority().callbacks())
    assert store.diagnostics()["schema_version"] == 3
    store.close()


def test_mid_chain_failure_rolls_back_and_resumes(tmp_path, monkeypatch):
    """A v2→v3 migration that fails midway leaves a durably v2 store with
    no partial columns; reopening resumes the chain exactly once."""
    from agent_box_session import schema
    from agent_box_session.store import SQLiteSessionStore
    from agent_box_session.schema import _apply_migration

    path = tmp_path / "resume.db"
    _create_v1_store(path)
    # genuine v2 fixture: v1 → v2 applied alone (fixture construction only)
    conn = sqlite3.connect(str(path), isolation_level=None)
    conn.execute("PRAGMA journal_mode = WAL")
    _apply_migration(conn, schema._migrate_v1_to_v2, expected_source_version=1)
    conn.close()

    def failing_v2_to_v3(conn):
        conn.execute(
            "ALTER TABLE turn_executions ADD COLUMN parent_execution_id TEXT"
        )
        raise RuntimeError("simulated crash mid-migration")

    monkeypatch.setitem(schema.MIGRATIONS, 2, failing_v2_to_v3)
    store = SQLiteSessionStore(path, callbacks=FakeWorkAuthority().callbacks())
    with pytest.raises(RuntimeError):
        store.diagnostics()  # forces the real connect() migration chain
    try:
        store.close()
    except Exception:
        pass
    # rollback: still v2, the partial column is gone
    assert sqlite3.connect(str(path)).execute(
        "SELECT value FROM store_meta WHERE key = 'schema_version'"
    ).fetchone()[0] == "2"
    assert "parent_execution_id" not in _v3_columns(path)

    # reopen with the real chain: v2 → v3 applies exactly once
    monkeypatch.undo()
    store = SQLiteSessionStore(path, callbacks=FakeWorkAuthority().callbacks())
    assert store.diagnostics()["schema_version"] == 3
    assert {
        "parent_execution_id",
        "input_session_ref_json",
        "output_native_session_ref_json",
        "workspace_input_ref_json",
        "workspace_output_ref_json",
    } <= _v3_columns(path)
    store.close()


def test_multi_version_chain_migrates_v1_to_current_schema_content(tmp_path):
    """Strengthened chain test: asserts schema CONTENT (columns), not the
    self-reported version that previously masked the skip bug."""
    from agent_box_session.store import SQLiteSessionStore
    from agent_box_session.schema import SCHEMA_VERSION

    path = tmp_path / "chain-content.db"
    _create_v1_store(path)
    store = SQLiteSessionStore(path, callbacks=FakeWorkAuthority().callbacks())
    assert store.diagnostics()["schema_version"] == SCHEMA_VERSION
    assert "parent_execution_id" in _v3_columns(path)
    assert "output_native_session_ref_json" in _v3_columns(path)
    store.close()
