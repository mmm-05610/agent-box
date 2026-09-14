"""wire/1 method dispatch.

Every method here validates the request shape, calls a neutral use case, and
projects the result onto the contract. No Harness brand is branched on and no
behavior lives here: this module is the contract's edge.
"""
from __future__ import annotations

import json
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
    "config.describe",
    "config.resolve",
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


def _require(params: Mapping[str, Any], *names: str) -> None:
    missing = [name for name in names if name not in params]
    if missing:
        raise WireError("INVALID_REQUEST", f"params is missing {', '.join(missing)}")


def _bounded(value: Any, name: str, limit: int = 4096) -> str:
    if not isinstance(value, str) or not (0 < len(value) <= limit):
        raise WireError("INVALID_REQUEST", f"{name} must be a bounded string")
    return value


def _overrides(params: Mapping[str, Any]) -> list[dict[str, Any]] | None:
    value = params.get("overrides")
    if value is None:
        return None
    if not isinstance(value, list):
        raise WireError("INVALID_REQUEST", "overrides must be a list of control assignments")
    for item in value:
        if not isinstance(item, Mapping) or "controlId" not in item or "value" not in item:
            raise WireError("INVALID_REQUEST", "each override needs controlId and value")
    reject_sensitive_keys(value)
    return [dict(item) for item in value]


class WireService:
    """Dispatches wire/1 methods onto neutral use cases."""

    def __init__(
        self, *, server_id_provider: Callable[[], str], workspaces, profiles, sessions,
        queue, approvals, harnesses, objects, execution, cursor_secret: bytes,
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
        self.codec = CursorCodec(cursor_secret)
        self.token_required = token_required
        self._handlers: dict[str, Callable[[Mapping[str, Any]], Any]] = {
            "server.hello": self.hello,
            "workspaces.browse": self.workspaces_browse,
            "workspaces.open": self.workspaces_open,
            "workspaces.list": self.workspaces_list,
            "workspaces.archive": self.workspaces_archive,
            "profiles.list": self.profiles_list,
            "config.describe": self.config_describe,
            "config.resolve": self.config_resolve,
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
        try:
            return handler(params)
        except ServerError as exc:
            raise WireError.from_server_error(exc) from exc

    # -- discovery ---------------------------------------------------------

    def hello(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "clientVersions", "clientPresentationSupports")
        versions = params["clientVersions"]
        if not isinstance(versions, list) or not versions:
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
            if self.workspaces.connector is None:
                return False, "WSL_CONNECTOR_UNAVAILABLE"
            return True, None
        if capability_id.startswith("sessions.") or capability_id == "sendOutcome.query":
            if self.execution is None:
                return False, "EXECUTION_CAPABILITY_UNAVAILABLE"
            return True, None
        if capability_id in {"queue.get", "queue.withdraw"}:
            return True, None
        if capability_id == "approvals.decide":
            return True, None
        if capability_id == "profiles.list":
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
        if expected is not None and not isinstance(expected, int):
            raise WireError("INVALID_REQUEST", "expectedVersion must be an integer")
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
                expected_version=int(params["expectedVersion"]),
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
        items = [profile_record(row) for row in self.profiles.records.list(include_archived=include)]
        return {"items": items, "nextCursor": None}

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
        if harness in self.harnesses:
            descriptor = self.harnesses.get(harness)
            for control_id, values in sorted((descriptor.control_options or {}).items()):
                controls.append({
                    "kind": "enum", "controlId": control_id,
                    "values": list(values), "editable": True,
                })
        for control_id, value in sorted(self._configuration(profile).items()):
            if any(control["controlId"] == control_id for control in controls):
                continue
            controls.append({
                "kind": "boolean" if isinstance(value, bool) else "string",
                "controlId": control_id, "editable": True,
                "currentValue": value,
            })
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

    def sessions_create_and_send(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "requestId", "workspaceId", "profileId", "message", "overrides")
        message = self._message(params["message"])
        overrides = _overrides(params) or []
        request_id = _bounded(params["requestId"], "requestId")
        digest_value = digest({
            "workspaceId": params["workspaceId"], "profileId": params["profileId"],
            "message": message, "overrides": overrides,
        })
        outcome, body = self.sessions.accept_intent(
            session_id=None,
            workspace_id=_bounded(params["workspaceId"], "workspaceId"),
            profile_id=_bounded(params["profileId"], "profileId"),
            request_id=request_id, request_digest=digest_value,
            message_object_digest=self._publish_message(message), overrides=overrides,
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
        message = self._message(params["message"])
        overrides = _overrides(params) or []
        request_id = _bounded(params["requestId"], "requestId")
        session_id = _bounded(params["sessionId"], "sessionId")
        session = self.sessions.records.get_session(session_id)
        digest_value = digest({
            "sessionId": session_id, "message": message, "overrides": overrides,
        })
        outcome, body = self.sessions.accept_intent(
            session_id=session_id, workspace_id=None,
            profile_id=session["profile_id"], request_id=request_id,
            request_digest=digest_value,
            message_object_digest=self._publish_message(message), overrides=overrides,
        )
        if outcome == "accepted" and body.get("executionId"):
            self._dispatch(body["executionId"], overrides)
        if outcome == "replay":
            return {
                "outcome": "accepted",
                "executionId": body.get("executionId"),
                "configVersion": body.get("configVersion"),
            }
        return {
            "outcome": "accepted",
            "executionId": body.get("executionId"),
            "configVersion": body.get("configVersion"),
        }

    def sessions_switch_profile(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "requestId", "sessionId", "profileId", "expectedVersion")
        request_id = _bounded(params["requestId"], "requestId")
        session_id = _bounded(params["sessionId"], "sessionId")
        profile_id = _bounded(params["profileId"], "profileId")
        outcome, body = self.sessions.records.switch_profile(
            session_id=session_id, profile_id=profile_id,
            expected_version=int(params["expectedVersion"]), request_id=request_id,
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
            expected_version=int(params["expectedVersion"]), request_id=request_id,
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
        body = self._stored_message(item["messageText"])
        return {
            "itemId": item["itemId"], "version": item["version"],
            "submittedAt": item["submittedAt"], "message": body,
            "profileId": item["profileId"], "state": item["state"],
        }

    # -- runs and approvals --------------------------------------------------

    def runs_stop(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "requestId", "sessionId", "executionId")
        session_id = _bounded(params["sessionId"], "sessionId")
        execution_id = _bounded(params["executionId"], "executionId")
        context = self.sessions.records.get_turn_context(execution_id)
        if context["session_id"] != session_id:
            raise WireError("NOT_FOUND", "Execution does not belong to this Session")
        terminal = ("completed", "failed", "cancelled", "unknown")
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
        request_id = _bounded(params["requestId"], "requestId")
        _status, body = self.approvals.decide(
            approval_id=_bounded(params["approvalId"], "approvalId"),
            decision=decision, scope=dict(scope),
            expected_version=int(params["expectedVersion"]), request_id=request_id,
        )
        return body

    # -- history ------------------------------------------------------------

    def history_snapshot(self, params: Mapping[str, Any]) -> dict[str, Any]:
        _require(params, "sessionId")
        session_id = _bounded(params["sessionId"], "sessionId")
        page = params.get("page") or {}
        limit = int(page.get("limit", 200))
        if not (1 <= limit <= 500):
            raise WireError("INVALID_REQUEST", "page.limit must be between 1 and 500")
        cursor_value = params.get("cursor") or page.get("cursor")
        after = 0
        if cursor_value:
            _session, after = self.codec.decode(str(cursor_value), expected_session=session_id)
        try:
            rows = self.sessions.records.raw_events(session_id, after, limit=limit)
        except ServerError as exc:
            if exc.code == "EVENT_CURSOR_AHEAD":
                # An out-of-range cursor is answered with an explicit resync
                # rather than silently dropping events.
                return {"outcome": "resync_required", "reason": "cursor_beyond_history"}
            raise
        frames = [frame for frame in (event_frame(row, self.codec) for row in rows) if frame]
        resume_seq = max((frame["seq"] for frame in frames), default=after)
        return {
            "outcome": "snapshot",
            "frames": frames,
            "resumeCursor": self.codec.encode(session_id, resume_seq),
        }

    # -- helpers ------------------------------------------------------------

    def _message(self, value: Any) -> dict[str, Any]:
        if not isinstance(value, Mapping) or "text" not in value or "attachments" not in value:
            raise WireError("INVALID_REQUEST", "message needs text and attachments")
        text = value["text"]
        if not isinstance(text, str) or not (1 <= len(text) <= 4096):
            raise WireError("INVALID_REQUEST", "message.text must be between 1 and 4096 characters")
        attachments = value["attachments"]
        if not isinstance(attachments, list):
            raise WireError("INVALID_REQUEST", "message.attachments must be a list")
        for item in attachments:
            if not isinstance(item, Mapping) or set(item) != {"ref", "displayName", "mediaKind"}:
                raise WireError("INVALID_REQUEST", "attachment shape is invalid")
            if item["mediaKind"] not in {"file", "image", "other"}:
                raise WireError("INVALID_REQUEST", "attachment mediaKind is invalid")
        return {"text": text, "attachments": [dict(item) for item in attachments]}

    def _publish_message(self, message: Mapping[str, Any]) -> str:
        return self.objects.publish(canonical({"schema_version": 1, "message": dict(message)})).digest

    def _stored_message(self, digest_value: str) -> dict[str, Any]:
        stored = json.loads(self.objects.read(digest_value))
        return dict(stored.get("message") or stored)

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
