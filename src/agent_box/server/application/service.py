"""Provider-neutral product use cases."""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Callable, Mapping, Protocol

from agent_box.server.errors import ServerError, unavailable
from agent_box.server.persistence import ProductRepository
from agent_box.storage import ObjectStore


_SENSITIVE = re.compile(r"(secret|token|api[_-]?key|password|private[_-]?key|authorization|cookie|credential_value)", re.I)


def canonical(value: Any) -> bytes:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    if len(encoded) > 262_144:
        raise ServerError("REQUEST_TOO_LARGE", "Request content exceeds the product record limit", status=422)
    return encoded


def digest(value: Any) -> str:
    return "sha256:" + hashlib.sha256(canonical(value)).hexdigest()


def reject_sensitive_keys(value: Any) -> None:
    if isinstance(value, Mapping):
        for key, child in value.items():
            if _SENSITIVE.search(str(key)):
                raise ServerError("SECRET_FIELD_FORBIDDEN", "Configuration contains a forbidden secret field", status=422)
            reject_sensitive_keys(child)
    elif isinstance(value, list):
        for child in value:
            reject_sensitive_keys(child)


class WslConnectionPort(Protocol):
    def distributions(self) -> list[dict[str, Any]]: ...
    def probe(self, distribution: str, user: str | None) -> dict[str, Any]: ...
    def browse(self, probe_id: str, path: str) -> dict[str, Any]: ...
    def open_workspace(self, probe_id: str, path: str) -> dict[str, Any]: ...


class TurnExecutionPort(Protocol):
    def accept(self, turn_id: str, *, overrides: Mapping[str, Any] | None = None) -> None: ...
    def cancel(self, turn_id: str) -> bool: ...


class ProductService:
    def __init__(
        self, repository: ProductRepository, objects: ObjectStore, *,
        profile_validators: Mapping[str, Callable[[dict[str, Any]], None]] | None = None,
        wsl: WslConnectionPort | None = None,
        execution: TurnExecutionPort | None = None,
        on_event: Callable[[], None] | None = None,
        credential_kinds: Mapping[str, str] | None = None,
    ) -> None:
        self.repository = repository
        self.objects = objects
        self.profile_validators = dict(profile_validators or {})
        self.wsl = wsl
        self.execution = execution
        self.on_event = on_event or (lambda: None)
        self.credential_kinds = dict(credential_kinds or {})

    def readiness(self) -> dict[str, Any]:
        blockers = []
        if self.wsl is None:
            blockers.append({"code": "WSL_CONNECTOR_UNAVAILABLE", "retryable": True})
        if "codex" not in self.profile_validators:
            blockers.append({"code": "CODEX_HARNESS_UNAVAILABLE", "retryable": False})
        if self.execution is None:
            blockers.append({"code": "CODEX_EXECUTION_UNAVAILABLE", "retryable": True})
        if not self.repository.has_credentials(kind="codex-login"):
            blockers.append({"code": "CREDENTIAL_SOURCE_NOT_AUTHORIZED", "retryable": False})
        return {
            "service": "ready", "api_version": "v1", "storage": "ready",
            "worker_protocol": "1", "capabilities": {
                "product_records": True, "wsl": self.wsl is not None,
                "codex": self.execution is not None,
                "cold_resume": self.execution is not None,
            }, "blockers": blockers,
        }

    def distributions(self):
        if self.wsl is None:
            raise unavailable("WSL_CONNECTOR_UNAVAILABLE", "WSL connector is not configured")
        return self.wsl.distributions()

    def probe(self, key: str, distribution: str, user: str | None):
        if self.wsl is None:
            raise unavailable("WSL_CONNECTOR_UNAVAILABLE", "WSL connector is not configured")
        body = {"kind": "wsl", "distribution": distribution, "user": user}
        request_digest = digest(body)
        prior = self.repository.get_idempotent("POST:/connections/probe", key, request_digest)
        if prior:
            return prior
        result = self._wsl_call(self.wsl.probe, distribution, user)
        return self.repository.save_idempotent("POST:/connections/probe", key, request_digest, 201, result)

    def browse(self, key: str, probe_id: str, path: str):
        if self.wsl is None:
            raise unavailable("WSL_CONNECTOR_UNAVAILABLE", "WSL connector is not configured")
        body = {"probe_id": probe_id, "path": path}
        request_digest = digest(body)
        prior = self.repository.get_idempotent("POST:/connections/browse", key, request_digest)
        if prior:
            return prior
        result = self._wsl_call(self.wsl.browse, probe_id, path)
        return self.repository.save_idempotent("POST:/connections/browse", key, request_digest, 200, result)

    def create_workspace(self, key: str, body: dict[str, Any]):
        if self.wsl is None:
            raise unavailable("WSL_CONNECTOR_UNAVAILABLE", "WSL connector is not configured")
        request_digest = digest(body)
        prior = self.repository.get_idempotent("POST:/workspaces", key, request_digest)
        if prior:
            return prior
        verified = self._wsl_call(self.wsl.open_workspace, body["probe_id"], body["path"])
        return self.repository.create_workspace(
            key=key, request_digest=request_digest, distribution=verified["distribution"],
            remote_user=verified.get("user"), remote_path=verified["path"],
            connection_id=verified["connection_id"],
        )

    def create_profile(self, key: str, body: dict[str, Any]):
        reject_sensitive_keys(body["configuration"])
        credential_kind = self.credential_kinds.get(body["harness_type"])
        if body.get("credential_id") is not None:
            if credential_kind is None:
                raise unavailable("HARNESS_UNAVAILABLE", "Requested Harness is not configured")
            self.repository.get_credential(body["credential_id"], kind=credential_kind)
        validator = self.profile_validators.get(body["harness_type"])
        if validator is None:
            raise unavailable("HARNESS_UNAVAILABLE", "Requested Harness is not configured")
        try:
            validator(body["configuration"])
        except ServerError:
            raise
        except (TypeError, ValueError) as exc:
            raise ServerError("PROFILE_CONFIGURATION_INVALID", str(exc), status=422) from exc
        record = self.objects.publish(canonical({
            "schema_version": 1, "harness_type": body["harness_type"],
            "configuration": body["configuration"],
        }))
        return self.repository.create_profile(
            key=key, request_digest=digest(body), name=body["name"],
            harness_type=body["harness_type"], config_digest=record.digest,
            credential_id=body.get("credential_id"),
        )

    def create_session(self, key: str, body: dict[str, Any]):
        return self.repository.create_session(key=key, request_digest=digest(body), **body)

    def create_turn(self, session_id: str, key: str, body: dict[str, Any]):
        if self.execution is None:
            raise unavailable("EXECUTION_CAPABILITY_UNAVAILABLE", "Turn execution is not configured")
        scope = f"POST:/sessions/{session_id}/turns"
        request_digest = digest(body)
        prior = self.repository.get_idempotent(scope, key, request_digest)
        if prior:
            return prior
        context = self.repository.get_session(session_id)
        profile = self.repository.get_profile_record(context["profile_id"])
        harness_type = profile["harness_type"]
        validator = self.profile_validators.get(harness_type)
        credential_kind = self.credential_kinds.get(harness_type)
        if validator is None or credential_kind is None:
            raise unavailable("HARNESS_UNAVAILABLE", "Session Harness is not configured")
        credential_id = profile.get("credential_id")
        if not credential_id:
            raise ServerError(
                "CREDENTIAL_REQUIRED", "Profile has no authorized credential", status=409,
            )
        self.repository.get_credential(credential_id, kind=credential_kind)
        overrides = body.get("overrides")
        if overrides is not None:
            reject_sensitive_keys(overrides)
            configured = json.loads(self.objects.read(profile["config_object_digest"]))
            merged = dict(configured["configuration"])
            merged.update(overrides)
            try:
                validator(merged)
            except (TypeError, ValueError) as exc:
                raise ServerError("TURN_OVERRIDES_INVALID", str(exc), status=422) from exc
        record = self.objects.publish(canonical({"schema_version": 1, "text": body["text"]}))
        result = self.repository.create_turn(
            session_id=session_id, key=key, request_digest=request_digest,
            input_object_digest=record.digest,
            expected_profile_revision=body["expected_profile_revision"],
        )
        self.on_event()
        try:
            self.execution.accept(result[1]["turn_id"], overrides=overrides)
        except Exception:
            # Dispatch/capture failures are durable Turn events. The accepted
            # HTTP result remains the idempotent product receipt.
            pass
        return result

    def cancel_turn(self, turn_id: str, key: str):
        body = {"turn_id": turn_id}
        request_digest = digest(body)
        scope = f"POST:/turns/{turn_id}/cancel"
        prior = self.repository.get_idempotent(scope, key, request_digest)
        if prior:
            return prior
        if self.execution is None:
            raise unavailable("EXECUTION_CAPABILITY_UNAVAILABLE", "Turn cancellation is not configured")
        accepted = self.execution.cancel(turn_id)
        self.repository.cancel_turn(turn_id)
        self.on_event()
        return self.repository.save_idempotent(
            scope, key, request_digest, 202,
            {"turn_id": turn_id, "cancel_requested": True, "accepted": accepted},
        )

    @staticmethod
    def _wsl_call(method, *args):
        try:
            return method(*args)
        except ServerError:
            raise
        except Exception as exc:
            code = str(getattr(exc, "code", "WSL_OPERATION_FAILED"))
            status = 409 if code == "PROBE_EXPIRED" else (404 if code == "WSL_DISTRIBUTION_UNKNOWN" else 422)
            raise ServerError(code, str(getattr(exc, "message", "WSL operation failed")), status=status) from exc
