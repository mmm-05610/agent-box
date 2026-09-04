"""SQLite schema for the Official Session Store authority.

The store owns its own SQLite database, separate from the Work Core
``agent-box.db``.  The two are independent authorities; nothing in this
schema or code claims distributed ACID across them.

Schema versioning is fail-closed (A8):

- a fresh database is created at ``SCHEMA_VERSION``;
- an existing database is opened only when its persisted
  ``store_meta.schema_version`` equals ``SCHEMA_VERSION``;
- a newer store (version > ``SCHEMA_VERSION``) is rejected with
  ``SchemaVersionUnsupported`` (newer store opened by older code);
- an older store is rejected the same way UNLESS an explicit migration for
  that exact version is registered in ``MIGRATIONS`` (keyed by the
  from-version).  Exactly one migration (v1 → v2) ships here; it is applied
  inside a single transaction whose commit is fsync-backed via
  ``PRAGMA synchronous = FULL``;
- a missing or corrupt schema version fails closed with
  ``MalformedSessionState``.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Callable, Dict

from agent_box.protocols.session.failures import (
    MalformedSessionState,
    SchemaVersionUnsupported,
)

SCHEMA_VERSION = 3

_DDL = """
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
    parent_execution_id TEXT,
    input_session_ref_json TEXT,
    output_native_session_ref_json TEXT,
    workspace_input_ref_json TEXT,
    workspace_output_ref_json TEXT,
    PRIMARY KEY (turn_id, execution_id)
);

CREATE TABLE IF NOT EXISTS turn_runs (
    turn_id TEXT PRIMARY KEY REFERENCES turns(turn_id),
    session_id TEXT NOT NULL,
    execution_id TEXT,
    dispatch_id TEXT,
    dispatch_digest TEXT,
    phase TEXT NOT NULL,
    recovery_facts_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
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
    request_digest TEXT NOT NULL DEFAULT '',
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
    request_digest TEXT NOT NULL DEFAULT '',
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
CREATE INDEX IF NOT EXISTS idx_turns_session
    ON turns(session_id);
CREATE INDEX IF NOT EXISTS idx_turn_runs_session_phase
    ON turn_runs(session_id, phase);
"""

_REQUIRED_TABLES = (
    "store_meta",
    "sessions",
    "turns",
    "turn_inputs",
    "turn_executions",
    "turn_runs",
    "session_events",
    "idempotency_receipts",
    "writer_leases",
    "recovery_operations",
    "session_saga_ops",
    "capability_state",
)


# Columns the CURRENT schema version guarantees.  Checked after the
# version chain so a stamp-without-work migration fails closed instead of
# opening a store whose schema content is behind its claimed version.
_REQUIRED_COLUMNS = {
    "turn_executions": (
        "parent_execution_id",
        "input_session_ref_json",
        "output_native_session_ref_json",
        "workspace_input_ref_json",
        "workspace_output_ref_json",
    ),
    "session_saga_ops": ("request_digest",),
}


def _migrate_v1_to_v2(conn: sqlite3.Connection) -> None:
    """Explicit v1 → v2 migration: turn_runs journal + request digests.

    Runs inside the single transaction opened by :func:`_apply_migration`;
    every statement here is durable-or-nothing with the version stamp.
    """
    conn.execute(
        "CREATE TABLE IF NOT EXISTS turn_runs ("
        "turn_id TEXT PRIMARY KEY REFERENCES turns(turn_id), "
        "session_id TEXT NOT NULL, "
        "execution_id TEXT, "
        "dispatch_id TEXT, "
        "dispatch_digest TEXT, "
        "phase TEXT NOT NULL, "
        "recovery_facts_json TEXT NOT NULL DEFAULT '{}', "
        "created_at TEXT NOT NULL, "
        "updated_at TEXT NOT NULL)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_turn_runs_session_phase "
        "ON turn_runs(session_id, phase)"
    )
    conn.execute(
        "ALTER TABLE session_saga_ops ADD COLUMN request_digest "
        "TEXT NOT NULL DEFAULT ''"
    )
    conn.execute(
        "ALTER TABLE idempotency_receipts ADD COLUMN request_digest "
        "TEXT NOT NULL DEFAULT ''"
    )
    conn.execute(
        "UPDATE store_meta SET value = '2' WHERE key = 'schema_version'"
    )


def _migrate_v2_to_v3(conn: sqlite3.Connection) -> None:
    """Explicit v2 → v3 migration: reserved per-Execution link facts.

    These columns are set-once reservations for the future Execution-DAG
    design (parent linkage, native session input/output Refs, workspace
    input/output Refs).  They carry no translation semantics.
    """
    for column in (
        "parent_execution_id TEXT",
        "input_session_ref_json TEXT",
        "output_native_session_ref_json TEXT",
        "workspace_input_ref_json TEXT",
        "workspace_output_ref_json TEXT",
    ):
        conn.execute(f"ALTER TABLE turn_executions ADD COLUMN {column}")
    conn.execute(
        "UPDATE store_meta SET value = '3' WHERE key = 'schema_version'"
    )


# Explicit, registered migrations keyed by the exact from-version.  Each
# migration upgrades that version by exactly one step and must assume it
# runs inside one transaction.
MIGRATIONS: Dict[int, Callable[[sqlite3.Connection], None]] = {
    1: _migrate_v1_to_v2,
    2: _migrate_v2_to_v3,
}


def _read_schema_version(conn: sqlite3.Connection) -> int:
    try:
        row = conn.execute(
            "SELECT value FROM store_meta WHERE key = 'schema_version'"
        ).fetchone()
    except sqlite3.DatabaseError as exc:
        raise MalformedSessionState(
            "persisted session store meta is unreadable"
        ) from exc
    if row is None:
        raise MalformedSessionState(
            "persisted session store is missing its schema version"
        )
    try:
        # row may be a sqlite3.Row (connect()'s connection) or a plain
        # tuple (raw fixture connections)
        value = row["value"] if isinstance(row, sqlite3.Row) else row[0]
        return int(value)
    except (TypeError, ValueError, IndexError) as exc:
        raise MalformedSessionState(
            "persisted session store schema version is corrupt"
        ) from exc


def _apply_migration(
    conn: sqlite3.Connection,
    migration: Callable[[sqlite3.Connection], None],
    *,
    expected_source_version: int,
) -> None:
    """Apply one registered migration inside a single fsync-backed transaction.

    The version-stamp verification happens INSIDE the transaction, before
    the commit: a migration that skipped a version, stayed put, or lied
    about its target is rolled back in full, so the database is never left
    persisted at a version its schema does not match.
    """
    conn.execute("BEGIN IMMEDIATE")
    try:
        migration(conn)
        migrated = _read_schema_version(conn)
        if migrated != expected_source_version + 1:
            raise SchemaVersionUnsupported(
                f"migration from schema version {expected_source_version} "
                f"reported {migrated}; a migration must advance exactly one "
                "version"
            )
        conn.commit()
    except BaseException:
        conn.rollback()
        raise


def _require_tables(conn: sqlite3.Connection) -> None:
    for table in _REQUIRED_TABLES:
        present = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            (table,),
        ).fetchone()
        if present is None:
            raise MalformedSessionState(
                "persisted session store is missing required table: " + table
            )
    # Version-stamp lies are caught by the +1 progression check; a stamp
    # that is already correct while the schema content is not (e.g. a
    # migration that stamped the target without doing its work) must also
    # fail closed: verify the current version's required columns.
    for table, columns in _REQUIRED_COLUMNS.items():
        present_columns = {
            row["name"]
            for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
        }
        missing = sorted(set(columns) - present_columns)
        if missing:
            raise MalformedSessionState(
                f"persisted session store is missing required columns on "
                f"{table}: {', '.join(missing)}"
            )


def connect(path: Path) -> sqlite3.Connection:
    """Open (creating on first use) one store database connection.

    Fail-closed versioning: see the module docstring.
    """
    conn = sqlite3.connect(str(path), timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = FULL")
    conn.execute("PRAGMA foreign_keys = ON")
    has_meta = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'store_meta'"
    ).fetchone()
    if has_meta is None:
        # Fresh database: create the current schema and stamp the version.
        conn.executescript(_DDL)
        conn.execute(
            "INSERT INTO store_meta (key, value) VALUES ('schema_version', ?)",
            (str(SCHEMA_VERSION),),
        )
        conn.commit()
        return conn
    try:
        version = _read_schema_version(conn)
        if version > SCHEMA_VERSION:
            raise SchemaVersionUnsupported(
                f"session store schema version {version} is newer than this "
                f"code's version {SCHEMA_VERSION}; refusing to open"
            )
        while version < SCHEMA_VERSION:
            migration = MIGRATIONS.get(version)
            if migration is None:
                raise SchemaVersionUnsupported(
                    f"session store schema version {version} has no registered "
                    f"migration to {SCHEMA_VERSION}; refusing to open"
                )
            _apply_migration(conn, migration, expected_source_version=version)
            # Post-commit defense in depth: the in-transaction check already
            # guarantees this; a violation here means the storage layer
            # itself misbehaved and must fail closed.
            migrated = _read_schema_version(conn)
            if migrated != version + 1:
                raise SchemaVersionUnsupported(
                    f"migration from schema version {version} reported "
                    f"{migrated}; a migration must advance exactly one version"
                )
            version = migrated
        _require_tables(conn)
    except BaseException:
        conn.close()
        raise
    return conn
