"""Workspace use cases: probe environments, browse, and open workspaces."""
from __future__ import annotations

from typing import Any, Protocol

from agent_box.server.errors import ServerError, unavailable
from agent_box.server.records import digest
from agent_box.server.workspaces.repository import WorkspaceRecords


class WslConnectionPort(Protocol):
    def distributions(self) -> list[dict[str, Any]]: ...
    def probe(self, distribution: str, user: str | None) -> dict[str, Any]: ...
    def browse(self, probe_id: str, path: str) -> dict[str, Any]: ...
    def open_workspace(self, probe_id: str, path: str) -> dict[str, Any]: ...


class WorkspaceService:
    def __init__(self, records: WorkspaceRecords, idempotency, *,
                 connector: WslConnectionPort | None = None) -> None:
        self.records = records
        self.idempotency = idempotency
        self.connector = connector

    def readiness_blockers(self) -> list[dict[str, Any]]:
        return [] if self.connector is not None else [
            {"code": "WSL_CONNECTOR_UNAVAILABLE", "retryable": True},
        ]

    def distributions(self):
        if self.connector is None:
            raise unavailable("WSL_CONNECTOR_UNAVAILABLE", "WSL connector is not configured")
        return self.connector.distributions()

    def probe(self, key: str, distribution: str, user: str | None):
        if self.connector is None:
            raise unavailable("WSL_CONNECTOR_UNAVAILABLE", "WSL connector is not configured")
        body = {"kind": "wsl", "distribution": distribution, "user": user}
        request_digest = digest(body)
        prior = self.idempotency.get("POST:/connections/probe", key, request_digest)
        if prior:
            return prior
        result = self._connector_call(self.connector.probe, distribution, user)
        return self.idempotency.save("POST:/connections/probe", key, request_digest, 201, result)

    def browse(self, key: str, probe_id: str, path: str):
        if self.connector is None:
            raise unavailable("WSL_CONNECTOR_UNAVAILABLE", "WSL connector is not configured")
        body = {"probe_id": probe_id, "path": path}
        request_digest = digest(body)
        prior = self.idempotency.get("POST:/connections/browse", key, request_digest)
        if prior:
            return prior
        result = self._connector_call(self.connector.browse, probe_id, path)
        return self.idempotency.save("POST:/connections/browse", key, request_digest, 200, result)

    def create(self, key: str, body: dict[str, Any]):
        if self.connector is None:
            raise unavailable("WSL_CONNECTOR_UNAVAILABLE", "WSL connector is not configured")
        request_digest = digest(body)
        prior = self.idempotency.get("POST:/workspaces", key, request_digest)
        if prior:
            return prior
        verified = self._connector_call(self.connector.open_workspace, body["probe_id"], body["path"])
        return self.records.create(
            key=key, request_digest=request_digest, distribution=verified["distribution"],
            remote_user=verified.get("user"), remote_path=verified["path"],
            connection_id=verified["connection_id"],
        )

    @staticmethod
    def _connector_call(method, *args):
        try:
            return method(*args)
        except ServerError:
            raise
        except Exception as exc:
            code = str(getattr(exc, "code", "WSL_OPERATION_FAILED"))
            status = 409 if code == "PROBE_EXPIRED" else (404 if code == "WSL_DISTRIBUTION_UNKNOWN" else 422)
            raise ServerError(code, str(getattr(exc, "message", "WSL operation failed")), status=status) from exc
