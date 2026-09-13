"""Short-lived SQLite units of work for the local AgentBox data root."""
from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
import sqlite3
import threading
from typing import Iterator


PRODUCT_SCHEMA_VERSION = 2


class FutureSchemaError(RuntimeError):
    """The data root was written by a newer, unsupported Server."""


_SCHEMA = """
CREATE TABLE IF NOT EXISTS agentbox_product_schema (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    version INTEGER NOT NULL,
    applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS server_workspaces (
    id TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL UNIQUE,
    distribution TEXT NOT NULL,
    remote_user TEXT,
    remote_path TEXT NOT NULL,
    connection_state TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS server_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    harness_type TEXT NOT NULL,
    config_revision INTEGER NOT NULL CHECK (config_revision >= 1),
    native_generation INTEGER NOT NULL DEFAULT 0 CHECK (native_generation >= 0),
    config_object_digest TEXT NOT NULL,
    credential_id TEXT,
    run_state TEXT NOT NULL DEFAULT 'idle',
    recovery_pending INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS server_credentials (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    secret_locator TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS server_sessions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES server_workspaces(id),
    profile_id TEXT NOT NULL REFERENCES server_profiles(id),
    checkpoint_object_digest TEXT,
    checkpoint_native_id TEXT,
    status TEXT NOT NULL DEFAULT 'ready',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS server_turns (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES server_sessions(id),
    profile_id TEXT NOT NULL REFERENCES server_profiles(id),
    profile_revision INTEGER NOT NULL,
    native_generation INTEGER NOT NULL,
    state TEXT NOT NULL,
    capture_state TEXT NOT NULL,
    cleanup_state TEXT NOT NULL,
    input_object_digest TEXT NOT NULL,
    work_id TEXT,
    execution_id TEXT,
    dispatch_id TEXT,
    result_object_digest TEXT,
    error_code TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS server_one_active_turn_per_session
ON server_turns(session_id) WHERE state IN ('accepted', 'dispatching', 'running', 'capturing');
CREATE UNIQUE INDEX IF NOT EXISTS server_one_active_turn_per_profile
ON server_turns(profile_id) WHERE state IN ('accepted', 'dispatching', 'running', 'capturing');
CREATE TABLE IF NOT EXISTS server_session_events (
    session_id TEXT NOT NULL REFERENCES server_sessions(id),
    seq INTEGER NOT NULL,
    event_id TEXT NOT NULL UNIQUE,
    turn_id TEXT,
    kind TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (session_id, seq)
);
CREATE TABLE IF NOT EXISTS server_idempotency (
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    request_digest TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    response_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (scope, key)
);
"""

def _migrate_1_to_2(conn: sqlite3.Connection) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS server_credentials ("
        "id TEXT PRIMARY KEY,kind TEXT NOT NULL,secret_locator TEXT NOT NULL UNIQUE,"
        "created_at TEXT NOT NULL)"
    )
    columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(server_turns)").fetchall()
    }
    additions = {
        "profile_id": "TEXT REFERENCES server_profiles(id)",
        "work_id": "TEXT",
        "execution_id": "TEXT",
        "dispatch_id": "TEXT",
        "result_object_digest": "TEXT",
        "error_code": "TEXT",
    }
    for name, declaration in additions.items():
        if name not in columns:
            conn.execute(f"ALTER TABLE server_turns ADD COLUMN {name} {declaration}")
    conn.execute(
        "UPDATE server_turns SET profile_id=(SELECT profile_id FROM server_sessions "
        "WHERE server_sessions.id=server_turns.session_id) WHERE profile_id IS NULL"
    )
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS server_one_active_turn_per_profile "
        "ON server_turns(profile_id) WHERE state IN "
        "('accepted','dispatching','running','capturing')"
    )


class Database:
    """One local SQLite file with explicit, bounded transaction scopes."""

    def __init__(self, data_root: Path | str, *, timeout: float = 5.0) -> None:
        self.data_root = Path(data_root).resolve()
        self.path = self.data_root / "state" / "agentbox.sqlite"
        self.timeout = timeout
        self._write_lock = threading.RLock()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.path), timeout=self.timeout)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 5000")
        return conn

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._write_lock, self._connect() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            row = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='agentbox_product_schema'"
            ).fetchone()
            current = 0
            if row is not None:
                version = conn.execute(
                    "SELECT version FROM agentbox_product_schema WHERE singleton=1"
                ).fetchone()
                if version is not None and int(version[0]) > PRODUCT_SCHEMA_VERSION:
                    raise FutureSchemaError(
                        f"data schema {version[0]} is newer than supported {PRODUCT_SCHEMA_VERSION}"
                    )
                current = int(version[0]) if version is not None else 0
            if current == 1:
                _migrate_1_to_2(conn)
            conn.executescript(_SCHEMA)
            conn.execute(
                "INSERT OR IGNORE INTO agentbox_product_schema(singleton, version, applied_at) "
                "VALUES (1, ?, datetime('now'))",
                (PRODUCT_SCHEMA_VERSION,),
            )
            conn.execute(
                "UPDATE agentbox_product_schema SET version=?, applied_at=datetime('now') WHERE singleton=1",
                (PRODUCT_SCHEMA_VERSION,),
            )

    @contextmanager
    def read(self) -> Iterator[sqlite3.Connection]:
        conn = self._connect()
        try:
            yield conn
        finally:
            conn.close()

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        conn = self._connect()
        with self._write_lock:
            try:
                conn.execute("BEGIN IMMEDIATE")
                yield conn
                conn.commit()
            except BaseException:
                conn.rollback()
                raise
            finally:
                conn.close()
