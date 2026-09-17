"""wire/1 method dispatch.

Every method here validates the request shape, calls a neutral use case, and
projects the result onto the contract. No Harness brand is branched on and no
behavior lives here: this module is the contract's edge.
"""
from __future__ import annotations

import json
import mimetypes
from pathlib import PurePosixPath
from typing import Any, Callable, Mapping

from agent_box.server.errors import ServerError
from agent_box.server.records import canonical, digest, reject_sensitive_keys
from agent_box.server.wire.envelope import CursorCodec
from agent_box.server.wire.errors import WireError
from agent_box.server.wire.projection import (
    event_frame,
    execution_state,
    profile_record,
    session_record,
    workspace_record,
)


WIRE_VERSION = "wire/1"
CAPABILITY_IDS = (
    "workspaces.browse",
    "workspaces.open",
    "workspaces.list",
    "workspaces.archive",
    "profiles.list",
    "profiles.create",
    "profiles.update",
    "profiles.updateConfig",
    "profiles.archive",
    "providerModels.list",
    "providerModels.create",
    "providerModels.update",
    "providerModels.archive",
    "config.describe",
    "config.resolve",
    "sessions.list",
    "sessions.update",
    "sessions.archive",
    "sessions.createAndSend",
    "sessions.send",
    "sessions.switchProfile",
    "sendOutcome.query",
    "queue.get",
    "queue.withdraw",
    "runs.stop",
    "approvals.decide",
    "history.snapshot",
)

_PARAM_SHAPES = {
    "server.hello": ({"clientVersions", "clientPresentationSupports"}, set()),
    "workspaces.open": ({"requestId", "environment", "path"}, {"expectedVersion"}),
    "workspaces.list": ({"includeArchived"}, set()),
    "workspaces.browse": ({"requestId", "environment", "path"}, set()),
    "workspaces.archive": ({"requestId", "workspaceId", "expectedVersion"}, set()),
    "profiles.list": ({"includeArchived"}, set()),
    "profiles.create": ({"requestId", "displayName", "harness"}, {"credentialId"}),
    "profiles.update": ({"requestId", "profileId", "expectedVersion", "displayName"}, set()),
    "profiles.updateConfig": ({"requestId", "profileId", "expectedVersion", "values"}, set()),
    "profiles.archive": ({"requestId", "profileId", "expectedVersion"}, set()),
    "providerModels.list": ({"includeArchived"}, set()),
    "providerModels.create": (
        {"requestId", "displayName", "harness", "provider", "credentialId",
         "configuration", "models"},
        {"provenance"},
    ),
    "providerModels.update": (
        {"requestId", "providerModelId", "expectedVersion", "displayName", "credentialId",
         "configuration", "models"},
        {"provenance"},
    ),
    "providerModels.archive": (
        {"requestId", "providerModelId", "expectedVersion"}, set(),
    ),
    "config.describe": ({"profileId", "workspaceId"}, set()),
    "config.resolve": ({"profileId", "workspaceId", "overrides"}, set()),
    "sessions.list": ({"includeArchived"}, {"workspaceId", "page"}),
    "sessions.update": (
        {"requestId", "sessionId", "expectedVersion"},
        {"displayName", "pinned", "workspaceId"},
    ),
    "sessions.archive": ({"requestId", "sessionId", "expectedVersion"}, set()),
    "sessions.switchProfile": (
        {"requestId", "sessionId", "profileId", "expectedVersion"}, set(),
    ),
    "sessions.createAndSend": (
        {"requestId", "workspaceId", "profileId", "overrides", "message"}, set(),
    ),
    "sessions.send": ({"requestId", "sessionId", "overrides", "message"}, set()),
    "sendOutcome.query": ({"requestId"}, set()),
    "queue.get": ({"sessionId"}, set()),
    "queue.withdraw": ({"requestId", "sessionId", "itemId", "expectedVersion"}, set()),
    "runs.stop": ({"requestId", "sessionId", "executionId"}, set()),
    "approvals.decide": (
        {"requestId", "approvalId", "expectedVersion", "decision", "scope"}, set(),
    ),
    "history.snapshot": ({"sessionId"}, {"cursor", "page"}),
}


def _require(params: Mapping[str, Any], *names: str) -> None:
    missing = [name for name in names if name not in params]
    if missing:
        raise WireError("INVALID_REQUEST", f"params is missing {', '.join(missing)}")


def _bounded(value: Any, name: str, limit: int = 4096) -> str:
    if not isinstance(value, str) or not (0 < len(value) <= limit):
        raise WireError("INVALID_REQUEST", f"{name} must be a bounded string")
    return value


def _request_id(value: Any) -> str:
    result = _bounded(value, "requestId")
    if len(result) < 8:
        raise WireError("INVALID_REQUEST", "requestId must contain at least 8 characters")
    return result


def _version(value: Any, name: str = "expectedVersion") -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not (0 <= value <= 2**53 - 1):
        raise WireError("INVALID_REQUEST", f"{name} must be a non-negative safe integer")
    return value


def _overrides(params: Mapping[str, Any]) -> list[dict[str, Any]] | None:
    value = params.get("overrides")
    if value is None:
        return None
    if not isinstance(value, list):
        raise WireError("INVALID_REQUEST", "overrides must be a list of control assignments")
    for item in value:
        if (not isinstance(item, Mapping) or set(item) != {"controlId", "value"}
                or not isinstance(item["controlId"], str)):
            raise WireError("INVALID_REQUEST", "each override needs controlId and value")
    reject_sensitive_keys(value)
    reject_sensitive_keys({item["controlId"]: item["value"] for item in value})
    return [dict(item) for item in value]


def _assignments(value: Any, name: str) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise WireError("INVALID_REQUEST", f"{name} must be a list of control assignments")
    result = []
    for item in value:
        if (not isinstance(item, Mapping) or set(item) != {"controlId", "value"}
                or not isinstance(item["controlId"], str) or not item["controlId"]):
            raise WireError("INVALID_REQUEST", f"each {name} item needs controlId and value")
        result.append(dict(item))
    reject_sensitive_keys(result)
    reject_sensitive_keys({item["controlId"]: item["value"] for item in result})
    return result


def _models(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise WireError("INVALID_REQUEST", "models must be a list")
    result = []
    allowed = {"modelId", "displayName", "availability", "unavailableReason"}
    for item in value:
        if not isinstance(item, Mapping) or set(item) != allowed:
            raise WireError("INVALID_REQUEST", "each model has an invalid shape")
        availability = item["availability"]
        reason = item["unavailableReason"]
        if availability not in {"unknown", "available", "unavailable"}:
            raise WireError("INVALID_REQUEST", "model availability is invalid")
        if reason is not None and not isinstance(reason, str):
            raise WireError("INVALID_REQUEST", "unavailableReason must be a string or null")
        result.append({
            "modelId": _bounded(item["modelId"], "modelId", 256),
            "displayName": _bounded(item["displayName"], "displayName", 256),
            "availability": availability, "unavailableReason": reason,
        })
    return result


class WireService:
    """Dispatches wire/1 methods onto neutral use cases."""

    def __init__(
        self, *, server_id_provider: Callable[[], str], workspaces, profiles, sessions,
        queue, approvals, harnesses, objects, execution, cursor_secret: bytes,
        model_configs=None,
        token_required: bool = True,
    ) -> None:
        self._server_id_provider = server_id_provider
        self.workspaces = workspaces
        self.profiles = profiles
        self.sessions = sessions
        self.queue = queue
        self.approvals = approvals
        self.harnesses = harnesses
        self.objects = objects
        self.execution = execution
        self.model_configs = model_configs
        self.codec = CursorCodec(cursor_secret)
        self.token_required = token_required
        self._handlers: dict[str, Callable[[Mapping[str, Any]], Any]] = {
            "server.hello": self.hello,
            "workspaces.browse": self.workspaces_browse,
            "workspaces.open": self.workspaces_open,
            "workspaces.list": self.workspaces_list,
            "workspaces.archive": self.workspaces_archive,
            "profiles.list": self.profiles_list,
            "profiles.create": self.profiles_create,
            "profiles.update": self.profiles_update,
            "profiles.updateConfig": self.profiles_update_config,
            "profiles.archive": self.profiles_archive,
            "providerModels.list": self.provider_models_list,
            "providerModels.create": self.provider_models_create,
            "providerModels.update": self.provider_models_update,
            "providerModels.archive": self.provider_models_archive,
            "config.describe": self.config_describe,
            "config.resolve": self.config_resolve,
            "sessions.list": self.sessions_list,
            "sessions.update": self.sessions_update,
            "sessions.archive": self.sessions_archive,
            "sessions.createAndSend": self.sessions_create_and_send,
            "sessions.send": self.sessions_send,
            "sessions.switchProfile": self.sessions_switch_profile,
            "sendOutcome.query": self.send_outcome_query,
            "queue.get": self.queue_get,
            "queue.withdraw": self.queue_withdraw,
            "runs.stop": self.runs_stop,
            "approvals.decide": self.approvals_decide,
            "history.snapshot": self.history_snapshot,
        }

    def dispatch(self, method: str, params: Mapping[str, Any]) -> Any:
        handler = self._handlers.get(method)
        if handler is None:
            raise WireError("INVALID_REQUEST", f"{method} is not a wire/1 method")
        required, optional = _PARAM_SHAPES[method]
        missing = required - set(params)
        extra = set(params) - required - optional
        if missing or extra:
            reason = "missing " + ", ".join(sorted(missing)) if missing else (
                "unexpected " + ", ".join(sorted(extra))
            )
            raise WireError("INVALID_REQUEST", f"params shape is invalid: {reason}")
        if "requestId" in params:
            _request_id(params["requestId"])
        try:
            return handler(params)
        except ServerError as exc:
            raise WireError.from_server_error(exc) from exc

    # -- discovery ---------------------------------------------------------

    def hello(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "clientVersions", "clientPresentationSupports")
        versions = params["clientVersions"]
        presentations = params["clientPresentationSupports"]
        if (not isinstance(versions, list) or not versions
                or any(not isinstance(item, str) for item in versions)
                or not isinstance(presentations, list)
                or any(not isinstance(item, str) for item in presentations)):
            raise WireError("INVALID_REQUEST", "clientVersions must be a non-empty list")
        capabilities = []
        for capability_id in CAPABILITY_IDS:
            supported, reason = self._capability(capability_id)
            entry: dict[str, Any] = {"id": capability_id, "supported": supported}
            if not supported:
                entry["reason"] = reason
            capabilities.append(entry)
        auth = {"required": True, "schemes": ["session_token"]} if self.token_required else {"required": False}
        return {
            "serverId": self._server_id_provider(),
            "protocolVersion": WIRE_VERSION,
            "capabilities": capabilities,
            "auth": auth,
        }

    def _capability(self, capability_id: str) -> tuple[bool, str | None]:
        if capability_id.startswith("workspaces."):
            # Environments are answered per request; this is the composition's
            # one fact - whether *any* placement can be served here at all.
            blockers = self.workspaces.readiness_blockers()
            if blockers:
                return False, str(blockers[0]["code"])
            return True, None
        if capability_id.startswith("sessions.") or capability_id == "sendOutcome.query":
            if self.execution is None:
                return False, "EXECUTION_CAPABILITY_UNAVAILABLE"
            return True, None
        if capability_id in {"queue.get", "queue.withdraw"}:
            return True, None
        if capability_id == "approvals.decide":
            return True, None
        if capability_id.startswith("profiles.") or capability_id.startswith("providerModels."):
            return True, None
        return True, None

    # -- workspaces ---------------------------------------------------------

    def workspaces_browse(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "requestId", "environment", "path")
        return self.workspaces.browse_environment(
            environment=params["environment"], path=_bounded(params["path"], "path"),
        )

    def workspaces_open(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "requestId", "environment", "path")
        expected = params.get("expectedVersion")
        if expected is not None:
            expected = _version(expected)
        created, row = self.workspaces.open_environment(
            environment=params["environment"], path=_bounded(params["path"], "path"),
            expected_version=expected,
        )
        return {"created": created, "workspace": self._workspace(row)}

    def workspaces_list(self, params: Mapping[str, Any]) -> dict[str, Any]:
        include = params.get("includeArchived", False)
        if not isinstance(include, bool):
            raise WireError("INVALID_REQUEST", "includeArchived must be a boolean")
        return {"items": [self._workspace(row) for row in self.workspaces.list(include_archived=include)],
                "nextCursor": None}

    def workspaces_archive(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "requestId", "workspaceId", "expectedVersion")
        try:
            row = self.workspaces.archive(
                workspace_id=_bounded(params["workspaceId"], "workspaceId"),
                expected_version=_version(params["expectedVersion"]),
            )
        except ServerError as exc:
            current = getattr(exc, "current", None)
            error = WireError.from_server_error(exc)
            if current is not None:
                error.current = self._workspace(current)
            raise error from exc
        return {"workspace": self._workspace(row)}

    def _workspace(self, row: Mapping[str, Any]) -> dict[str, Any]:
        return workspace_record(row)

    # -- profiles ----------------------------------------------------------

    def profiles_list(self, params: Mapping[str, Any]) -> dict[str, Any]:
        include = params.get("includeArchived", False)
        if not isinstance(include, bool):
            raise WireError("INVALID_REQUEST", "includeArchived must be a boolean")
        items = []
        for row in self.profiles.records.list(include_archived=include):
            items.append(self._profile(row))
        return {"items": items, "nextCursor": None}

    def _profile(self, row: Mapping[str, Any]) -> dict[str, Any]:
        item = profile_record(row)
        descriptor = (
            self.harnesses.get(row["harness_type"])
            if row["harness_type"] in self.harnesses else None
        )
        item["capabilities"] = {
            str(key): bool(value)
            for key, value in (descriptor.capability_claims if descriptor else {}).items()
            if isinstance(value, bool)
        }
        return item

    def profiles_create(self, params: Mapping[str, Any]) -> dict[str, Any]:
        # `credentialId` is optional and nullable: a Harness whose credential
        # cannot ride a model control (Hermes declares none) needs the role
        # itself to carry one, and a role without one stays expressible.
        credential_id = params.get("credentialId")
        if credential_id is not None:
            credential_id = _bounded(credential_id, "credentialId")
        row = self.profiles.create_wire(
            _request_id(params["requestId"]),
            display_name=_bounded(params["displayName"], "displayName", 128),
            harness=_bounded(params["harness"], "harness", 64),
            credential_id=credential_id,
        )
        return {"profile": self._profile(row)}

    def profiles_update(self, params: Mapping[str, Any]) -> dict[str, Any]:
        try:
            row = self.profiles.update_display_name(
                _request_id(params["requestId"]),
                profile_id=_bounded(params["profileId"], "profileId"),
                expected_version=_version(params["expectedVersion"]),
                display_name=_bounded(params["displayName"], "displayName", 128),
            )
        except ServerError as exc:
            raise self._profile_error(exc) from exc
        return {"profile": self._profile(row)}

    def profiles_update_config(self, params: Mapping[str, Any]) -> dict[str, Any]:
        values = _assignments(params.get("values"), "values")
        try:
            row = self.profiles.update_configuration(
                _request_id(params["requestId"]),
                profile_id=_bounded(params["profileId"], "profileId"),
                expected_version=_version(params["expectedVersion"]), values=values,
            )
        except ServerError as exc:
            raise self._profile_error(exc) from exc
        return {
            "profile": self._profile(row), "configVersion": int(row["config_revision"]),
            "effectiveFor": "next_send",
        }

    def profiles_archive(self, params: Mapping[str, Any]) -> dict[str, Any]:
        try:
            row = self.profiles.archive(
                _request_id(params["requestId"]),
                profile_id=_bounded(params["profileId"], "profileId"),
                expected_version=_version(params["expectedVersion"]),
            )
        except ServerError as exc:
            raise self._profile_error(exc) from exc
        return {"profile": self._profile(row)}

    def _profile_error(self, exc: ServerError) -> WireError:
        error = WireError.from_server_error(exc)
        current = getattr(exc, "current", None)
        if current is not None:
            error.current = self._profile(current)
        return error

    def provider_models_list(self, params: Mapping[str, Any]) -> dict[str, Any]:
        self._require_model_configs()
        include = params["includeArchived"]
        if not isinstance(include, bool):
            raise WireError("INVALID_REQUEST", "includeArchived must be a boolean")
        return {"items": self.model_configs.list(include_archived=include), "nextCursor": None}

    def provider_models_create(self, params: Mapping[str, Any]) -> dict[str, Any]:
        self._require_model_configs()
        body = self._provider_model_body(params, creating=True)
        body.update(self._provenance(params) or {})
        record = self.model_configs.create(_request_id(params["requestId"]), body)
        return {"providerModel": record}

    def provider_models_update(self, params: Mapping[str, Any]) -> dict[str, Any]:
        self._require_model_configs()
        record_id = _bounded(params["providerModelId"], "providerModelId")
        try:
            body = self._provider_model_body(params, creating=False)
            body.update(self._provenance(params) or {})
            record = self.model_configs.update(
                record_id, _version(params["expectedVersion"]),
                _request_id(params["requestId"]),
                body,
            )
        except ServerError as exc:
            error = WireError.from_server_error(exc)
            current = getattr(exc, "current", None)
            if current is not None:
                error.current = self.model_configs.project(current)
            raise error from exc
        return {"providerModel": record}

    def provider_models_archive(self, params: Mapping[str, Any]) -> dict[str, Any]:
        self._require_model_configs()
        try:
            record = self.model_configs.archive(
                _bounded(params["providerModelId"], "providerModelId"),
                _version(params["expectedVersion"]), _request_id(params["requestId"]),
            )
        except ServerError as exc:
            error = WireError.from_server_error(exc)
            references = getattr(exc, "references", None)
            if references is not None:
                error.details["referenceIds"] = list(references)
            raise error from exc
        return {"providerModel": record}

    #: Order 55: where the endpoint facts came from. `fieldsSource` is one of
    #: the three honest answers (a preset catalogue, a pulled model list, or
    #: the user's own hand entry); the endpoint fields themselves are optional
    #: and stay absent when their source does not supply them.
    _PROVENANCE_ENUMS = {
        "authStyle": {"api_key", "oauth", "none"},
        "wireApi": {"chat_completions", "responses"},
        "fieldsSource": {"preset", "pulled", "manual"},
    }
    _PROVENANCE_COLUMNS = {
        "authStyle": "auth_style",
        "wireApi": "wire_api",
        "fieldsSource": "fields_source",
        "baseUrl": "base_url",
    }

    @staticmethod
    def _provenance(params: Mapping[str, Any]) -> dict[str, str] | None:
        raw = params.get("provenance")
        if raw is None:
            return None
        if (not isinstance(raw, Mapping)
                or not set(raw) <= set(_PROVENANCE_COLUMNS)):
            raise WireError("INVALID_PARAMS", "provenance carries unknown fields")
        provenance: dict[str, str] = {}
        for field, column in _PROVENANCE_COLUMNS.items():
            value = raw.get(field)
            if value is None:
                continue
            value = _bounded(str(value), f"provenance.{field}", 512)
            allowed = _PROVENANCE_ENUMS.get(field)
            if allowed is not None and value not in allowed:
                raise WireError(
                    "INVALID_PARAMS", f"provenance.{field} is not a known value",
                )
            provenance[column] = value
        return provenance or None

    def _provider_model_body(
        self, params: Mapping[str, Any], *, creating: bool,
    ) -> dict[str, Any]:
        body = {
            "displayName": _bounded(params["displayName"], "displayName", 128),
            "credentialId": params["credentialId"],
            "configuration": _assignments(params["configuration"], "configuration"),
            "models": _models(params["models"]),
        }
        if body["credentialId"] is not None:
            body["credentialId"] = _bounded(body["credentialId"], "credentialId")
        if creating:
            body["harness"] = _bounded(params["harness"], "harness", 64)
            body["provider"] = _bounded(params["provider"], "provider", 128)
        return body

    def _require_model_configs(self) -> None:
        if self.model_configs is None:
            raise WireError("UNAVAILABLE", "Provider/Model configuration storage is unavailable")

    # -- configuration -----------------------------------------------------

    def config_describe(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "profileId", "workspaceId")
        profile = self.profiles.records.get(_bounded(params["profileId"], "profileId"))
        controls = self._controls(profile)
        return {"descriptor": {
            "profileId": profile["id"],
            "workspaceId": params["workspaceId"],
            "controls": controls,
            "securityLockedIds": self._locked_controls(profile),
            "effectTiming": "next_send",
        }}

    def config_resolve(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "profileId", "workspaceId", "overrides")
        profile = self.profiles.records.get(_bounded(params["profileId"], "profileId"))
        overrides = _overrides(params) or []
        known = {control["controlId"] for control in self._controls(profile)}
        invalid = [
            {"controlId": item["controlId"], "reason": "unknown_control"}
            for item in overrides if item["controlId"] not in known
        ]
        invalid += [
            {"controlId": item["controlId"], "reason": "security_locked"}
            for item in overrides if item["controlId"] in self._locked_controls(profile)
        ]
        if invalid:
            return {"outcome": "rejected", "invalidControls": invalid}
        effective = self._effective_values(profile, overrides)
        return {"outcome": "resolved", "effective": [
            {"controlId": control_id, "value": value} for control_id, value in effective.items()
        ]}

    def _configuration(self, profile: Mapping[str, Any]) -> dict[str, Any]:
        stored = json.loads(self.objects.read(profile["config_object_digest"]))
        return dict(stored.get("configuration") or {})

    def _controls(self, profile: Mapping[str, Any]) -> list[dict[str, Any]]:
        harness = profile["harness_type"]
        controls: list[dict[str, Any]] = []
        configured = self._configuration(profile)
        if harness in self.harnesses:
            descriptor = self.harnesses.get(harness)
            for control_id, values in sorted((descriptor.control_options or {}).items()):
                current = configured.get(control_id)
                holds_reference = (
                    isinstance(current, Mapping) and self.model_configs is not None
                    and isinstance(current.get("providerId"), str)
                    and isinstance(current.get("modelId"), str)
                )
                # The control the deployment names as its model control takes a
                # Provider/Model reference and declares no static values for it
                # (the reference comes from the directory, and
                # `freeze_execution_configuration` refuses anything else). As an
                # enum of an empty list it offered a first-time reader nothing to
                # choose, and a brand-new Profile could not be given a model at
                # all; as a slot it says what it wants, and the client fills it
                # from the directory it already holds. A declared value list means
                # this really is an enumeration and stays one.
                if (descriptor.model_control_id == control_id and not values
                        and self.model_configs is not None):
                    model = (self.model_configs.reference(current["providerId"], current["modelId"])
                             if holds_reference else None)
                    controls.append({
                        "kind": "model_slot", "controlId": control_id, "editable": True,
                        "slots": [{"name": control_id, "model": model}],
                    })
                    continue
                if holds_reference:
                    model = self.model_configs.reference(current["providerId"], current["modelId"])
                    controls.append({
                        "kind": "model_slot", "controlId": control_id, "editable": True,
                        "slots": [{"name": control_id, "model": model}],
                    })
                    continue
                controls.append({
                    "kind": "enum", "controlId": control_id,
                    "values": list(values), "editable": True,
                    **({"currentValue": current} if isinstance(current, str) else {}),
                })
        for control_id, value in sorted(configured.items()):
            if any(control["controlId"] == control_id for control in controls):
                continue
            control = {
                "kind": "boolean" if isinstance(value, bool) else "string",
                "controlId": control_id, "editable": True,
                "currentValue": value,
            }
            if control["kind"] == "string":
                control["multiline"] = False
            controls.append(control)
        return controls

    def _locked_controls(self, profile: Mapping[str, Any]) -> list[str]:
        """Controls a security rule pins; they can never be overridden."""
        harness = profile["harness_type"]
        if harness in self.harnesses:
            return list(self.harnesses.get(harness).security_locked_controls or ())
        return []

    def _effective_values(
        self, profile: Mapping[str, Any], overrides: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """接入默认 < Profile 默认 < 明确临时覆盖, with locks applied last."""
        discovered: dict[str, Any] = {}
        harness = profile["harness_type"]
        if harness in self.harnesses:
            descriptor = self.harnesses.get(harness)
            for control_id, values in (descriptor.control_options or {}).items():
                if values:
                    discovered[control_id] = values[0]
        effective = {**discovered, **self._configuration(profile)}
        for item in overrides:
            effective[item["controlId"]] = item["value"]
        for control_id in self._locked_controls(profile):
            configured = self._configuration(profile)
            if control_id in configured:
                effective[control_id] = configured[control_id]
        return effective

    # -- sessions -----------------------------------------------------------

    def sessions_list(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "includeArchived")
        include_archived = params["includeArchived"]
        if not isinstance(include_archived, bool):
            raise WireError("INVALID_REQUEST", "includeArchived must be a boolean")
        workspace_id = params.get("workspaceId")
        if workspace_id is not None:
            workspace_id = _bounded(workspace_id, "workspaceId")
        page = params.get("page") or {}
        if not isinstance(page, Mapping) or set(page) - {"cursor", "limit"}:
            raise WireError("INVALID_REQUEST", "page shape is invalid")
        limit = page.get("limit", 200)
        if isinstance(limit, bool) or not isinstance(limit, int) or not (1 <= limit <= 500):
            raise WireError("INVALID_REQUEST", "page.limit must be between 1 and 500")
        catalog_scope = "sessions_" + digest({
            "workspaceId": workspace_id, "includeArchived": include_archived,
        }).split(":", 1)[1][:24]
        after_rowid = 0
        if page.get("cursor") is not None:
            _scope, after_rowid = self.codec.decode(
                str(page["cursor"]), expected_session=catalog_scope,
            )
        rows = self.sessions.records.list_sessions(
            workspace_id=workspace_id, include_archived=include_archived,
            after_rowid=after_rowid, limit=limit + 1,
        )
        has_more = len(rows) > limit
        visible = rows[:limit]
        next_cursor = None
        if has_more and visible:
            next_cursor = self.codec.encode(catalog_scope, int(visible[-1]["catalog_rowid"]))
        return {
            "items": [session_record(row) for row in visible],
            "nextCursor": next_cursor,
        }

    def sessions_update(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "requestId", "sessionId", "expectedVersion")
        supplied = {name for name in ("displayName", "pinned", "workspaceId") if name in params}
        if not supplied:
            raise WireError("INVALID_REQUEST", "a Session update must change at least one field")
        display_name = None
        if "displayName" in params:
            display_name = _bounded(params["displayName"], "displayName", 512)
        pinned = params.get("pinned")
        if "pinned" in params and not isinstance(pinned, bool):
            raise WireError("INVALID_REQUEST", "pinned must be a boolean")
        workspace_id = None
        if "workspaceId" in params:
            workspace_id = _bounded(params["workspaceId"], "workspaceId")
        session_id = _bounded(params["sessionId"], "sessionId")
        expected_version = _version(params["expectedVersion"])
        request_body = {
            "sessionId": session_id, "expectedVersion": expected_version,
            **({"displayName": display_name} if "displayName" in params else {}),
            **({"pinned": pinned} if "pinned" in params else {}),
            **({"workspaceId": workspace_id} if "workspaceId" in params else {}),
        }
        updated = self.sessions.records.update_session(
            session_id=session_id, expected_version=expected_version,
            request_id=_bounded(params["requestId"], "requestId"),
            request_digest=digest(request_body), display_name=display_name,
            pinned=pinned if "pinned" in params else None,
            workspace_id=workspace_id,
        )
        return {"session": updated}

    def sessions_archive(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "requestId", "sessionId", "expectedVersion")
        session_id = _bounded(params["sessionId"], "sessionId")
        expected_version = _version(params["expectedVersion"])
        archived = self.sessions.records.archive_session(
            session_id=session_id, expected_version=expected_version,
            request_id=_bounded(params["requestId"], "requestId"),
            request_digest=digest({
                "sessionId": session_id, "expectedVersion": expected_version,
            }),
        )
        return {"session": archived}

    def sessions_create_and_send(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "requestId", "workspaceId", "profileId", "message", "overrides")
        workspace_id = _bounded(params["workspaceId"], "workspaceId")
        workspace = self.workspaces.records.get(workspace_id)
        message = self._message(params["message"], workspace)
        overrides = _overrides(params) or []
        request_id = _bounded(params["requestId"], "requestId")
        digest_value = digest({
            "workspaceId": params["workspaceId"], "profileId": params["profileId"],
            "message": message, "overrides": overrides,
        })
        public_message = self._public_message(message)
        outcome, body = self.sessions.accept_intent(
            session_id=None,
            workspace_id=workspace_id,
            profile_id=_bounded(params["profileId"], "profileId"),
            request_id=request_id, request_digest=digest_value,
            message_object_digest=self._publish_message(message),
            public_message=public_message, overrides=overrides,
        )
        if outcome == "accepted" and body.get("executionId"):
            self._dispatch(body["executionId"], overrides)
        if outcome in {"accepted", "replay"}:
            session = self.sessions.records.get_session(body["sessionId"])
            return {
                "outcome": "accepted",
                "session": session_record({
                    "id": session["session_id"], "version": session["version"],
                    "workspace_id": session["workspace_id"], "profile_id": session["profile_id"],
                    "display_name": session.get("display_name") or session["session_id"],
                    "pinned": session.get("pinned", False),
                    "archived_at": session.get("archived_at"),
                    "created_at": session["created_at"], "updated_at": session["updated_at"],
                }),
                "executionId": body["executionId"],
                "configVersion": body["configVersion"],
            }
        return {
            "outcome": "rejected_before_accept",
            "reason": body.get("reason", "rejected"),
            "invalidControls": body.get("invalidControls"),
        }

    def sessions_send(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "requestId", "sessionId", "message", "overrides")
        overrides = _overrides(params) or []
        request_id = _bounded(params["requestId"], "requestId")
        session_id = _bounded(params["sessionId"], "sessionId")
        session = self.sessions.records.get_session(session_id)
        workspace = self.workspaces.records.get(session["workspace_id"])
        message = self._message(params["message"], workspace)
        digest_value = digest({
            "sessionId": session_id, "message": message, "overrides": overrides,
        })
        public_message = self._public_message(message)
        outcome, body = self.sessions.accept_intent(
            session_id=session_id, workspace_id=None,
            profile_id=session["profile_id"], request_id=request_id,
            request_digest=digest_value,
            message_object_digest=self._publish_message(message),
            public_message=public_message, overrides=overrides,
        )
        if outcome == "accepted" and body.get("executionId"):
            self._dispatch(body["executionId"], overrides)
        if outcome == "replay":
            return {
                "outcome": "accepted",
                "executionId": body.get("executionId"),
                "configVersion": body.get("configVersion"),
                "queueItemId": body.get("queueItemId"),
            }
        return {
            "outcome": "accepted",
            "executionId": body.get("executionId"),
            "configVersion": body.get("configVersion"),
            "queueItemId": body.get("queueItemId"),
        }

    def sessions_switch_profile(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "requestId", "sessionId", "profileId", "expectedVersion")
        request_id = _bounded(params["requestId"], "requestId")
        session_id = _bounded(params["sessionId"], "sessionId")
        profile_id = _bounded(params["profileId"], "profileId")
        outcome, body = self.sessions.records.switch_profile(
            session_id=session_id, profile_id=profile_id,
            expected_version=_version(params["expectedVersion"]), request_id=request_id,
            request_digest=digest({"sessionId": session_id, "profileId": profile_id,
                                   "expectedVersion": params["expectedVersion"]}),
        )
        if outcome == "replay":
            return body
        return body

    def send_outcome_query(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "requestId")
        return self.sessions.records.intent_outcome(_bounded(params["requestId"], "requestId"))

    def queue_get(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "sessionId")
        items = self.queue.list(_bounded(params["sessionId"], "sessionId"))
        return {"items": [self._queue_item(item) for item in items]}

    def queue_withdraw(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "requestId", "sessionId", "itemId", "expectedVersion")
        request_id = _bounded(params["requestId"], "requestId")
        status, body = self.queue.withdraw(
            session_id=_bounded(params["sessionId"], "sessionId"),
            item_id=_bounded(params["itemId"], "itemId"),
            expected_version=_version(params["expectedVersion"]), request_id=request_id,
            request_digest=digest({
                "sessionId": params["sessionId"], "itemId": params["itemId"],
                "expectedVersion": params["expectedVersion"],
            }),
        )
        if body.get("outcome") == "withdrawn":
            return {"outcome": "withdrawn", "item": self._queue_item(body["item"])}
        item = body.get("item")
        return {
            "outcome": "too_late", "reason": body.get("reason", "too_late"),
            "item": self._queue_item(item) if item else None,
        }

    def _queue_item(self, item: Mapping[str, Any]) -> dict[str, Any]:
        body = dict(item["message"]) if isinstance(item.get("message"), Mapping) else self._stored_message(item["messageText"])
        return {
            "itemId": item["itemId"], "version": item["version"],
            "submittedAt": item["submittedAt"], "message": body,
            "profileId": item["profileId"], "configVersion": item["configVersion"],
            "state": item["state"],
        }

    # -- runs and approvals --------------------------------------------------

    def runs_stop(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "requestId", "sessionId", "executionId")
        session_id = _bounded(params["sessionId"], "sessionId")
        execution_id = _bounded(params["executionId"], "executionId")
        context = self.sessions.records.get_turn_context(execution_id)
        if context["session_id"] != session_id:
            raise WireError("NOT_FOUND", "Execution does not belong to this Session")
        terminal = self.sessions.records.TERMINAL_TURN_STATES
        if context["state"] in terminal:
            return {
                "outcome": "already_finished", "executionId": execution_id,
                "reason": context.get("error_code") or context["state"],
            }
        if self.execution is None:
            return {"outcome": "unconfirmed", "reason": "EXECUTION_CAPABILITY_UNAVAILABLE"}
        self.sessions.records.record_cancel_request(execution_id)
        accepted = bool(self.execution.cancel(execution_id))
        if not accepted:
            # Stop was asked for but the process could not be confirmed stopped;
            # saying "stopped" here would be a lie.
            return {"outcome": "unconfirmed", "reason": "STOP_NOT_CONFIRMED"}
        return {"outcome": "stop_requested", "executionId": execution_id}

    def approvals_decide(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "requestId", "approvalId", "decision", "scope", "expectedVersion")
        decision = params["decision"]
        if decision not in {"allow", "deny"}:
            raise WireError("INVALID_REQUEST", "decision must be allow or deny")
        scope = params["scope"]
        if not isinstance(scope, Mapping) or scope.get("kind") not in {"once", "bounded"}:
            raise WireError("INVALID_REQUEST", "scope must be once or a bounded grant")
        if scope["kind"] == "once" and set(scope) != {"kind"}:
            raise WireError("INVALID_REQUEST", "once scope has unexpected fields")
        if scope["kind"] == "bounded" and (
            set(scope) != {"kind", "until", "environmentId"}
            or scope.get("until") != "session_end"
            or not (scope.get("environmentId") is None
                    or isinstance(scope.get("environmentId"), str)
                    and scope.get("environmentId"))
        ):
            raise WireError("INVALID_REQUEST", "bounded scope is invalid")
        request_id = _bounded(params["requestId"], "requestId")
        _status, body = self.approvals.decide(
            approval_id=_bounded(params["approvalId"], "approvalId"),
            decision=decision, scope=dict(scope),
            expected_version=_version(params["expectedVersion"]), request_id=request_id,
        )
        if body.get("outcome") == "recorded" and hasattr(self.execution, "decide_approval"):
            # The Server decision is committed first.  A transport failure may
            # fail the execution, but can never execute an unrecorded grant.
            self.execution.decide_approval(
                params["approvalId"], decision, dict(scope),
            )
        return body

    # -- history ------------------------------------------------------------

    def history_snapshot(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "sessionId")
        session_id = _bounded(params["sessionId"], "sessionId")
        page = params.get("page") or {}
        if not isinstance(page, Mapping) or set(page) - {"cursor", "limit"}:
            raise WireError("INVALID_REQUEST", "page shape is invalid")
        limit = page.get("limit", 200)
        if isinstance(limit, bool) or not isinstance(limit, int):
            raise WireError("INVALID_REQUEST", "page.limit must be an integer")
        if not (1 <= limit <= 500):
            raise WireError("INVALID_REQUEST", "page.limit must be between 1 and 500")
        live_cursor = params.get("cursor")
        older_cursor = page.get("cursor")
        if live_cursor is not None and older_cursor is not None:
            raise WireError(
                "INVALID_REQUEST", "live resume and backward page cursors are mutually exclusive",
            )
        after = None
        before = None
        if live_cursor is not None:
            _session, after = self.codec.decode(str(live_cursor), expected_session=session_id)
        if older_cursor is not None:
            _session, before = self.codec.decode_older(
                str(older_cursor), expected_session=session_id,
            )
        try:
            rows, head, has_older = self.sessions.records.history_page(
                session_id, after=after, before=before, limit=limit,
            )
        except ServerError as exc:
            if exc.code == "EVENT_CURSOR_AHEAD":
                # An out-of-range cursor is answered with an explicit resync
                # rather than silently dropping events.
                return {"outcome": "resync_required", "reason": "cursor_beyond_history"}
            raise
        frames = [frame for frame in (event_frame(row, self.codec) for row in rows) if frame]
        # Forward recovery advances by the returned raw log rows so additional
        # batches remain readable. Initial/backward snapshots join live at the
        # head read in the same SQLite snapshot, closing the subscribe window.
        resume_seq = (
            int(rows[-1]["seq"]) if after is not None and rows else
            after if after is not None else head
        )
        next_older = None
        if has_older and rows:
            next_older = self.codec.encode_older(session_id, int(rows[0]["seq"]))
        return {
            "outcome": "snapshot",
            "frames": frames,
            "resumeCursor": self.codec.encode(session_id, resume_seq),
            "olderCursor": next_older,
        }

    def event_stream_batch(
        self, session_id: str, cursor: str | None, *, limit: int = 200,
    ) -> tuple[list[dict[str, Any]], str]:
        """Read the next persisted wire frame batch for the live channel."""
        after = 0
        if cursor:
            _session, after = self.codec.decode(cursor, expected_session=session_id)
        try:
            rows = self.sessions.records.raw_events(session_id, after, limit=limit)
        except ServerError as exc:
            if exc.code == "EVENT_CURSOR_AHEAD":
                raise WireError("INVALID_REQUEST", "event cursor is beyond current history") from exc
            raise
        frames = [frame for frame in (event_frame(row, self.codec) for row in rows) if frame]
        next_seq = int(rows[-1]["seq"]) if rows else after
        return frames, self.codec.encode(session_id, next_seq)

    # -- helpers ------------------------------------------------------------

    def _message(self, value: Any, workspace: Mapping[str, Any]) -> dict[str, Any]:
        if not isinstance(value, Mapping) or "text" not in value or "attachments" not in value:
            raise WireError("INVALID_REQUEST", "message needs text and attachments")
        text = value["text"]
        if not isinstance(text, str) or not (1 <= len(text) <= 4096):
            raise WireError("INVALID_REQUEST", "message.text must be between 1 and 4096 characters")
        attachments = value["attachments"]
        if not isinstance(attachments, list):
            raise WireError("INVALID_REQUEST", "message.attachments must be a list")
        if len(attachments) > 32:
            raise WireError("INVALID_REQUEST", "message has too many attachments")
        resolved = []
        total = 0
        for item in attachments:
            if not isinstance(item, Mapping) or set(item) != {"ref", "displayName", "mediaKind"}:
                raise WireError("INVALID_REQUEST", "attachment shape is invalid")
            if (not isinstance(item["ref"], str) or len(item["ref"]) > 4096
                    or not isinstance(item["displayName"], str)
                    or len(item["displayName"]) > 512):
                raise WireError("INVALID_REQUEST", "attachment names are invalid")
            if item["mediaKind"] not in {"file", "image", "other"}:
                raise WireError("INVALID_REQUEST", "attachment mediaKind is invalid")
            relative = PurePosixPath(item["ref"])
            if (relative.is_absolute() or not relative.parts
                    or any(part in {"", ".", ".."} for part in relative.parts)
                    or relative.as_posix() != item["ref"]):
                raise WireError("INVALID_REQUEST", "attachment ref must be a normalized workspace path")
            try:
                content, content_digest = self.workspaces.read_workspace_file(
                    workspace, relative.as_posix(),
                )
            except Exception as exc:
                raise WireError("INVALID_REQUEST", "attachment is outside the authorized workspace or unreadable") from exc
            total += len(content)
            if total > 8 * 1024 * 1024:
                raise WireError("INVALID_REQUEST", "attachments exceed the bounded message size")
            record = self.objects.publish(content)
            if record.digest != content_digest:
                raise WireError("OUTCOME_UNKNOWN", "attachment changed during capture")
            resolved.append({
                **dict(item), "_contentDigest": record.digest, "_size": record.size,
                "_mime": mimetypes.guess_type(str(item["displayName"]))[0]
                or ("image/png" if item["mediaKind"] == "image" else "application/octet-stream"),
            })
        return {"text": text, "attachments": resolved}

    def _publish_message(self, message: Mapping[str, Any]) -> str:
        return self.objects.publish(canonical({"schema_version": 1, "message": dict(message)})).digest

    @staticmethod
    def _public_message(message: Mapping[str, Any]) -> dict[str, Any]:
        return {
            "text": str(message.get("text", "")),
            "attachments": [
                {key: item[key] for key in ("ref", "displayName", "mediaKind")}
                for item in message.get("attachments", ())
            ],
        }

    def _stored_message(self, digest_value: str) -> dict[str, Any]:
        stored = json.loads(self.objects.read(digest_value))
        message = dict(stored.get("message") or stored)
        message["attachments"] = [
            {key: item[key] for key in ("ref", "displayName", "mediaKind")}
            for item in message.get("attachments", ())
        ]
        return message

    def _dispatch(self, execution_id: str, overrides: list[dict[str, Any]]) -> None:
        try:
            self.execution.accept(execution_id, overrides=self._override_mapping(overrides))
        except Exception:
            # Dispatch failures are durable execution facts recorded by the
            # execution port; acceptance itself stays a valid receipt.
            pass

    @staticmethod
    def _override_mapping(overrides: list[dict[str, Any]]) -> dict[str, Any] | None:
        if not overrides:
            return None
        return {item["controlId"]: item["value"] for item in overrides}
