"""Small Host-owned operation journal for bounded Web mutations."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import threading
from typing import Any
from uuid import uuid4

STATES = frozenset({"accepted", "running", "succeeded", "failed", "interrupted", "ambiguous"})

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _safe(value: Any, limit: int = 2048) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value if not isinstance(value, str) else value[:limit]
    if isinstance(value, dict):
        return {str(k)[:80]: _safe(v) for k, v in list(value.items())[:32]}
    if isinstance(value, (tuple, list)):
        return [_safe(v) for v in value[:32]]
    return str(value)[:limit]

@dataclass(frozen=True)
class OperationRecord:
    operation_id: str
    execution_id: str
    operation_type: str
    idempotency_key: str
    status: str
    result: Any = None
    error: str | None = None
    progress: tuple[str, ...] = ()
    created_at: str = ""
    updated_at: str = ""

    def public(self) -> dict[str, Any]:
        return asdict(self)

class OperationStore:
    """Atomic JSON records; deliberately not a Core entity or job queue."""

    def __init__(self, root: Path) -> None:
        self.root = root / "operations"
        self.root.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._recover_incomplete()

    def _path(self, operation_id: str) -> Path:
        if not operation_id or len(operation_id) > 128 or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for c in operation_id):
            raise ValueError("invalid operation_id")
        return self.root / f"{operation_id}.json"

    def _read(self, operation_id: str) -> OperationRecord | None:
        try:
            data = json.loads(self._path(operation_id).read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None
        except (OSError, json.JSONDecodeError) as exc:
            raise ValueError("operation record is unreadable") from exc
        if not isinstance(data, dict) or data.get("status") not in STATES:
            raise ValueError("operation record is invalid")
        return OperationRecord(
            str(data.get("operation_id", operation_id)), str(data.get("execution_id", "")),
            str(data.get("operation_type", "")), str(data.get("idempotency_key", "")),
            str(data["status"]), _safe(data.get("result")),
            str(data["error"])[:512] if data.get("error") else None,
            tuple(str(x)[:160] for x in data.get("progress", ()) if isinstance(x, str)),
            str(data.get("created_at", "")), str(data.get("updated_at", "")),
        )

    def get(self, operation_id: str) -> OperationRecord | None:
        with self._lock:
            return self._read(operation_id)

    def latest_for_execution(self, execution_id: str) -> OperationRecord | None:
        with self._lock:
            records = [self._read(path.stem) for path in self.root.glob("*.json")]
            records = [r for r in records if r and r.execution_id == execution_id]
            return max(records, key=lambda r: r.updated_at or r.created_at, default=None)

    def create(self, operation_id: str, execution_id: str, operation_type: str, idempotency_key: str) -> OperationRecord:
        with self._lock:
            existing = self._read(operation_id)
            if existing:
                if existing.execution_id != execution_id or existing.operation_type != operation_type or existing.idempotency_key != idempotency_key:
                    raise ValueError("OPERATION_ID_CONFLICT")
                return existing
            now = _now()
            record = OperationRecord(operation_id, execution_id, operation_type, idempotency_key, "accepted", progress=("accepted",), created_at=now, updated_at=now)
            self._write(record)
            return record

    def update(self, operation_id: str, *, status: str | None = None, result: Any = None, error: str | None = None, progress: tuple[str, ...] | None = None) -> OperationRecord:
        if status is not None and status not in STATES:
            raise ValueError("invalid operation status")
        with self._lock:
            current = self._read(operation_id)
            if current is None:
                raise ValueError("operation not found")
            record = OperationRecord(current.operation_id, current.execution_id, current.operation_type, current.idempotency_key, status or current.status, _safe(result) if result is not None else current.result, _safe(error, 512) if error else current.error, progress if progress is not None else current.progress, current.created_at, _now())
            self._write(record)
            return record

    def _write(self, record: OperationRecord) -> None:
        path = self._path(record.operation_id)
        tmp = path.with_suffix(f".{uuid4().hex}.tmp")
        tmp.write_text(json.dumps(record.public(), ensure_ascii=False, sort_keys=True), encoding="utf-8")
        tmp.replace(path)

    def _recover_incomplete(self) -> None:
        with self._lock:
            for path in self.root.glob("*.json"):
                try:
                    record = self._read(path.stem)
                    if record and record.status in {"accepted", "running"}:
                        self._write(OperationRecord(record.operation_id, record.execution_id, record.operation_type, record.idempotency_key, "interrupted", record.result, "Host stopped before operation completed", record.progress + ("interrupted",), record.created_at, _now()))
                except (OSError, ValueError):
                    continue
