"""Workspace use cases: probe environments, browse, and open workspaces."""
from __future__ import annotations

from typing import Any, Mapping, Protocol

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

    def archive(self, *, workspace_id: str, expected_version: int) -> dict[str, Any]:
        return self.records.archive(workspace_id=workspace_id, expected_version=expected_version)

    def list(self, *, include_archived: bool) -> list[dict[str, Any]]:
        return self.records.list_active(include_archived=include_archived)

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

    # -- wire/1 environment-addressed use cases --------------------------

    @staticmethod
    def _validate_environment(environment: Any) -> tuple[str, str | None, str | None]:
        if not isinstance(environment, Mapping):
            raise ServerError("ENVIRONMENT_INVALID", "environment must be an object", status=422)
        kind = environment.get("kind")
        if kind not in {"local", "wsl", "ssh"}:
            raise ServerError("ENVIRONMENT_INVALID", "environment.kind is not supported", status=422)
        return kind, environment.get("host"), environment.get("user")

    def _wsl_probe(self, host: str | None, user: str | None) -> dict[str, Any]:
        if self.connector is None:
            raise unavailable("WSL_CONNECTOR_UNAVAILABLE", "WSL connector is not configured")
        if not host:
            raise ServerError("ENVIRONMENT_INVALID", "wsl environment needs a host", status=422)
        return self._connector_call(self.connector.probe, host, user)

    def browse_environment(self, *, environment: Any, path: str) -> dict[str, Any]:
        """Browse one environment's directory without opening a Session.

        Readable and writable are reported separately and a directory is never
        refused merely for being read-only (core-semantics/1 §4).
        """
        kind, host, user = self._validate_environment(environment)
        if kind != "wsl":
            # Local selection belongs to the Electron host, and no SSH
            # execution端 is wired in this deployment; saying so is the honest
            # answer instead of pretending to browse.
            raise ServerError(
                "CAPABILITY_UNSUPPORTED",
                f"{kind} browsing is not provided by this Server",
                status=503,
            )
        probe = self._wsl_probe(host, user)
        result = self._connector_call(self.connector.browse, probe["probe_id"], path)
        entries = []
        for item in result.get("directories", ()):
            name = item if isinstance(item, str) else str(item.get("name", ""))
            entries.append({
                "name": name, "kind": "directory", "canOpen": True, "canWrite": True,
                "reason": None,
            })
        for item in result.get("files", ()):
            name = item if isinstance(item, str) else str(item.get("name", ""))
            entries.append({
                "name": name, "kind": "file", "canOpen": False, "canWrite": False,
                "reason": "not_a_directory",
            })
        return {"path": result.get("path", path), "entries": entries}

    def open_environment(
        self, *, environment: Any, path: str, expected_version: int | None,
    ) -> tuple[bool, dict[str, Any]]:
        kind, host, user = self._validate_environment(environment)
        if kind != "wsl":
            raise ServerError(
                "CAPABILITY_UNSUPPORTED",
                f"{kind} workspaces are not provided by this Server",
                status=503,
            )
        probe = self._wsl_probe(host, user)
        verified = self._connector_call(self.connector.open_workspace, probe["probe_id"], path)
        return self.records.upsert_by_location(
            env_kind=kind, env_host=host, remote_user=verified.get("user") or user,
            normalized_path=verified["path"], connection_id=verified["connection_id"],
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
