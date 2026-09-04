"""Durable SQLite project registry for the local live workspace provider.

Backend decision (A7 hardening): the registry is the provider's own SQLite
database.  The constructor argument ``registry_path`` is now interpreted as
the registry *database* path (conventionally ``workspace-registry.db`` next
to the plugin data directory).  The Phase-1 ``projects.json`` file was a
Phase-1 test-artifact format only; there is no data to migrate and no
migration is performed.

Durability and fail-closed semantics:

- WAL journal mode and ``synchronous = FULL`` make every committed
  registration durable; a crash mid-registration leaves either the old or
  the new state, never a partial row.
- ``registry_meta`` carries ``schema_version``: a fresh database is created
  at the current version, the current version opens as-is, an unknown
  newer version fails closed, and corrupt/missing meta fails closed.  A
  malformed registry is never treated as empty.
- All writes run inside one transaction guarded by a threading lock plus
  SQLite locking (``busy_timeout``), so concurrent registration from
  multiple threads or multiple provider instances is exactly-once.
- A documented ``fault_hook`` test seam lets tests crash the process
  between durable steps (mirrors the Session Store's seam).
"""
from __future__ import annotations

import sqlite3
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

REGISTRY_SCHEMA_VERSION = 1

_BUSY_TIMEOUT_MS = 30_000

_DDL = """
CREATE TABLE IF NOT EXISTS registry_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
    project_id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    registered_at TEXT NOT NULL
);
"""

# Executed statement-by-statement inside the initialization transaction
# (sqlite3's executescript would commit it away).
_DDL_STATEMENTS = tuple(
    statement.strip() for statement in _DDL.split(";") if statement.strip()
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _identity_conflict() -> Exception:
    # Imported lazily: the error vocabulary lives in the provider module,
    # which imports this module.
    from .provider import ProjectIdentityConflict

    return ProjectIdentityConflict(
        "project identity collision with a different path"
    )


class RegistryCorrupt(Exception):
    """The persisted registry is malformed; fail closed."""


class RegistryVersionUnsupported(Exception):
    """The registry was written by a different (newer/older) schema."""


class ProjectRegistry:
    """SQLite-backed registry of live project roots."""

    def __init__(
        self,
        db_path: Path,
        *,
        fault_hook: Optional[Callable[[str], None]] = None,
    ) -> None:
        self._db_path = Path(db_path)
        # Documented test seam: invoked before critical steps so fault
        # injection can crash between durable steps.
        self._fault_hook = fault_hook
        self._lock = threading.Lock()
        self._conn: Optional[sqlite3.Connection] = None

    # -- plumbing ------------------------------------------------------------

    def _fault(self, step: str) -> None:
        if self._fault_hook is not None:
            self._fault_hook(step)

    def close(self) -> None:
        with self._lock:
            if self._conn is not None:
                self._conn.close()
                self._conn = None

    def _connection(self) -> sqlite3.Connection:
        with self._lock:
            if self._conn is not None:
                return self._conn
            last_busy: Optional[Exception] = None
            for attempt in range(3):
                try:
                    self._conn = self._open_connection()
                    return self._conn
                except sqlite3.OperationalError as exc:
                    # A concurrent writer holds the database briefly;
                    # opening must retry, never misreport as corruption.
                    if "locked" in str(exc) or "busy" in str(exc):
                        last_busy = exc
                        time.sleep(0.2 * (attempt + 1))
                        continue
                    raise RegistryCorrupt(
                        "workspace registry is unreadable or corrupt"
                    ) from exc
                except (sqlite3.DatabaseError, ValueError) as exc:
                    raise RegistryCorrupt(
                        "workspace registry is unreadable or corrupt"
                    ) from exc
            raise RegistryCorrupt(
                "workspace registry stayed locked; fail closed"
            ) from last_busy

    def _open_connection(self) -> sqlite3.Connection:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(
            str(self._db_path),
            timeout=_BUSY_TIMEOUT_MS / 1000.0,
            check_same_thread=False,
        )
        conn.row_factory = sqlite3.Row
        conn.execute(f"PRAGMA busy_timeout = {_BUSY_TIMEOUT_MS}")
        conn.execute("PRAGMA synchronous = FULL")
        # WAL is a persistent database property: it only needs to be set on
        # a database with no schema yet (no other committed writers can
        # exist then), so concurrent openers never race on this pragma.
        tables = self._table_names(conn)
        if not tables:
            conn.execute("PRAGMA journal_mode = WAL")
        self._initialize(conn, tables)
        return conn

    @staticmethod
    def _table_names(conn: sqlite3.Connection) -> set[str]:
        return {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }

    def _initialize(self, conn: sqlite3.Connection, tables: set[str]) -> None:
        """Create, open, or fail closed on the persisted schema version.

        ``BEGIN IMMEDIATE`` serializes creation and the version check
        across processes: a concurrent opener waits and then re-reads the
        fully-created schema instead of an intermediate DDL state.
        """
        conn.execute("BEGIN IMMEDIATE")
        try:
            # Re-read under the write lock: the snapshot taken outside may
            # predate another opener's committed creation.
            tables = self._table_names(conn)
            if not tables:
                for statement in _DDL_STATEMENTS:
                    conn.execute(statement)
                conn.execute(
                    "INSERT INTO registry_meta (key, value) "
                    "VALUES ('schema_version', ?)",
                    (str(REGISTRY_SCHEMA_VERSION),),
                )
            elif "registry_meta" not in tables or "projects" not in tables:
                raise RegistryCorrupt(
                    "workspace registry is missing required tables"
                )
            else:
                row = conn.execute(
                    "SELECT value FROM registry_meta WHERE key = 'schema_version'"
                ).fetchone()
                if row is None:
                    raise RegistryCorrupt("workspace registry meta is corrupt")
                raw = row["value"]
                if not isinstance(raw, str) or not raw.isdigit():
                    raise RegistryCorrupt("workspace registry meta is corrupt")
                version = int(raw)
                if version != REGISTRY_SCHEMA_VERSION:
                    raise RegistryVersionUnsupported(
                        "workspace registry schema version "
                        f"{version} is not supported "
                        f"(current: {REGISTRY_SCHEMA_VERSION})"
                    )
        except Exception:
            conn.rollback()
            raise
        else:
            conn.commit()

    # -- registration ----------------------------------------------------------

    def register(self, project_id: str, canonical_path: str) -> tuple[str, str, str]:
        """Insert or confirm one registration; returns (id, path, registered_at).

        Idempotent: the same canonical path always maps to the same
        project id and the original ``registered_at`` is preserved.  A path
        collision with a different identity fails closed.
        """
        conn = self._connection()
        with self._lock:
            self._fault("register_project:pre_insert")
            for _attempt in range(2):
                existing = conn.execute(
                    "SELECT project_id, path, registered_at FROM projects "
                    "WHERE project_id = ? OR path = ?",
                    (project_id, canonical_path),
                ).fetchone()
                if existing is not None:
                    if (
                        existing["project_id"] != project_id
                        or existing["path"] != canonical_path
                    ):
                        raise _identity_conflict()
                    return (
                        existing["project_id"],
                        existing["path"],
                        existing["registered_at"],
                    )
                try:
                    with conn:
                        conn.execute(
                            "INSERT INTO projects (project_id, path, registered_at) "
                            "VALUES (?, ?, ?)",
                            (project_id, canonical_path, _now_iso()),
                        )
                    break
                except sqlite3.IntegrityError:
                    # Another thread/instance won the race; re-read and
                    # confirm identity instead of duplicating.
                    self._fault("register_project:integrity_retry")
                    continue
            else:  # pragma: no cover - defensive
                raise _identity_conflict()
            row = conn.execute(
                "SELECT project_id, path, registered_at FROM projects "
                "WHERE project_id = ?",
                (project_id,),
            ).fetchone()
            return row["project_id"], row["path"], row["registered_at"]

    def get(self, project_id: str) -> Optional[tuple[str, str, str]]:
        conn = self._connection()
        with self._lock:
            row = conn.execute(
                "SELECT project_id, path, registered_at FROM projects "
                "WHERE project_id = ?",
                (project_id,),
            ).fetchone()
        if row is None:
            return None
        return row["project_id"], row["path"], row["registered_at"]

    def list(self) -> tuple[tuple[str, str, str], ...]:
        conn = self._connection()
        with self._lock:
            rows = conn.execute(
                "SELECT project_id, path, registered_at FROM projects "
                "ORDER BY project_id"
            ).fetchall()
        return tuple((row["project_id"], row["path"], row["registered_at"]) for row in rows)
