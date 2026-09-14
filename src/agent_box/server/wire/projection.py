"""wire/1 record and event projections.

Internal storage keeps the 37-era names (`turn`, `connection_state`, internal
event kinds) so retained evidence stays meaningful. This module is the single
place that translates them into the contract's vocabulary: `executionId`,
`version`, `environment`, `connection`, and the eight wire event kinds.

No Harness brand is interpreted here; `harness` travels as an opaque data field.
"""
from __future__ import annotations

import json
from typing import Any, Mapping

from agent_box.server.wire.errors import WireError


WIRE_EVENT_KINDS = frozenset({
    "message.delta",
    "message.final",
    "tool.update",
    "approval.requested",
    "approval.settled",
    "config.changed",
    "execution.state",
    "workspace.connection",
})

# Internal kind -> wire kind. Kinds absent here are internal bookkeeping and are
# not projected onto the event stream at all (for example turn.capture).
_EVENT_KIND_MAP = {
    "turn.accepted": "execution.state",
    "turn.state": "execution.state",
    "message.delta": "message.delta",
    "message.final": "message.final",
    "tool.update": "tool.update",
    "approval.requested": "approval.requested",
    "approval.settled": "approval.settled",
    "config.changed": "config.changed",
    "workspace.connection": "workspace.connection",
}

_EXECUTION_STATE_MAP = {
    "accepted": "queued",
    "dispatching": "dispatched",
    "running": "running",
    "capturing": "running",
    "completed": "completed",
    "failed": "failed",
    "cancelled": "stopped",
    "unknown": "unknown",
}


def environment(kind: str, host: str | None, user: str | None) -> dict[str, Any]:
    return {"kind": kind, "host": host, "user": user}


def workspace_record(row: Mapping[str, Any]) -> dict[str, Any]:
    """Project a stored workspace row onto the contract's WorkspaceRecord."""
    archived_at = row.get("archived_at")
    return {
        "id": row["id"],
        "version": int(row.get("version") or 1),
        "displayName": row.get("display_name") or row.get("remote_path") or row["id"],
        "normalizedPath": row.get("normalized_path") or row["remote_path"],
        "environment": environment(
            row.get("env_kind") or "wsl", row.get("env_host"), row.get("remote_user"),
        ),
        "accessibility": accessibility_for(row),
        "connection": {"state": "connected"} if row.get("connection_state") == "verified"
        else {"state": "connecting"},
        "archivedAt": archived_at,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def accessibility_for(row: Mapping[str, Any]) -> dict[str, Any]:
    """Readable/writable/executable are independent, per the contract.

    A verified connection is what this deployment can actually attest; whether a
    role can execute is reported as unknown (null) rather than assumed true.
    """
    verified = row.get("connection_state") == "verified"
    reasons = [] if verified else ["connection_state_unverified"]
    return {
        "readable": verified,
        "writable": verified,
        "executableForRole": None,
        "reasons": reasons,
    }


def profile_record(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "version": int(row.get("version") or 1),
        "displayName": row.get("display_name") or row.get("name") or row["id"],
        "harness": row["harness_type"],
        "archivedAt": row.get("archived_at"),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def session_record(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "version": int(row.get("version") or 1),
        "workspaceId": row["workspace_id"],
        "profileId": row.get("profile_id"),
        "displayName": row.get("display_name") or row["id"],
        "archivedAt": row.get("archived_at"),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def execution_state(row: Mapping[str, Any]) -> dict[str, Any]:
    """Project a stored Turn row onto the contract's execution state.

    `stop_requested_at` distinguishes "stop asked for" from "actually stopped",
    which the contract requires not to be conflated.
    """
    state = _EXECUTION_STATE_MAP.get(str(row.get("state")), "unknown")
    if row.get("stop_requested_at") and state == "running":
        state = "stopping"
    body: dict[str, Any] = {"state": state}
    reason = row.get("terminal_reason") or row.get("error_code")
    if reason:
        body["reason"] = str(reason)
    return body


def event_frame(row: Mapping[str, Any], codec: Any) -> dict[str, Any] | None:
    """Project one stored event onto an EventFrame, or None if not wire-visible."""
    kind = _EVENT_KIND_MAP.get(str(row["kind"]))
    if kind is None:
        return None
    normalized = dict(row)
    raw = normalized.get("data_json")
    data = json.loads(raw) if isinstance(raw, str) else dict(normalized.get("data") or {})
    event = _event_body(kind, normalized, data)
    seq = int(normalized["seq"])
    return {
        "eventId": normalized["event_id"],
        "sessionId": normalized["session_id"],
        "seq": seq,
        "cursor": codec.encode(normalized["session_id"], seq),
        "emittedAt": normalized["created_at"],
        "event": event,
    }


def _event_body(kind: str, row: Mapping[str, Any], data: Mapping[str, Any]) -> dict[str, Any]:
    session_id = row["session_id"]
    if kind == "execution.state":
        body: dict[str, Any] = {
            "kind": kind,
            "sessionId": session_id,
            "executionId": row.get("turn_id"),
            "state": _EXECUTION_STATE_MAP.get(str(data.get("state")), "unknown"),
        }
        reason = data.get("error_code")
        if reason:
            body["reason"] = str(reason)
        return body
    if kind in {"message.delta", "message.final"}:
        return {
            "kind": kind,
            "sessionId": session_id,
            "messageId": str(data.get("message_id") or row.get("turn_id") or "message"),
            "text": str(data.get("text", "")),
        }
    if kind == "tool.update":
        return {
            "kind": kind,
            "sessionId": session_id,
            "toolCallId": str(data.get("tool_call_id", "tool")),
            "tool": data.get("tool"),
            "state": str(data.get("state", "requested")),
        }
    if kind == "approval.requested":
        request = data.get("request") if isinstance(data.get("request"), Mapping) else {}
        operation = request.get("operation") if isinstance(request.get("operation"), Mapping) else None
        if operation is None:
            tool_call = request.get("toolCall") if isinstance(request.get("toolCall"), Mapping) else {}
            tool = request.get("tool") or tool_call.get("name") or tool_call.get("kind")
            detail = []
            for label, value in sorted(request.items()):
                if label in {"requestId", "operation", "expiresAt", "toolCall", "options", "tool", "title"}:
                    continue
                if isinstance(value, (str, int, float, bool)):
                    detail.append({"label": str(label), "value": str(value)})
            operation = {
                "title": str(request.get("title") or tool or "Approval required"),
                "detail": detail,
                "tool": str(tool) if tool is not None else None,
            }
        return {
            "kind": kind,
            "sessionId": session_id,
            "approval": {
                "approvalId": str(data.get("approval_id")),
                "sessionId": session_id,
                "executionId": row.get("turn_id"),
                "version": int(data.get("version") or 1),
                "operation": dict(operation),
                "expiresAt": request.get("expiresAt"),
            },
        }
    if kind == "approval.settled":
        return {
            "kind": kind,
            "sessionId": session_id,
            "approvalId": str(data.get("approval_id")),
            "outcome": {
                "allow": "allowed", "deny": "denied",
                "expired": "expired", "invalidated": "invalidated",
            }.get(str(data.get("decision")), "invalidated"),
        }
    if kind == "config.changed":
        return {
            "kind": kind,
            "sessionId": session_id,
            "effectiveFor": str(data.get("effective_for") or "next_send"),
        }
    if kind == "workspace.connection":
        return {
            "kind": kind,
            "workspaceId": str(data.get("workspace_id", "")),
            "connection": data.get("connection") or {"state": "connecting"},
        }
    raise WireError("UNAVAILABLE", f"event kind {kind} has no projection")
