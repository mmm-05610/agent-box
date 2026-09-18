"""Order 65 C: the delegation service behind the two MCP tools.

The bridge (a stdio MCP server the parent harness starts) forwards
`list_subagents` / `run_subagent` here, and this service answers from the same
records the rest of the Server uses:

* **list** resolves the live roster (authorized edges only) and the two tool
  definitions, including the roster summary embedded in the description;
* **run** validates the call (`validate_run_arguments` - narrowing-only,
  bounded, authorized), resolves `task_id` or a fresh child session, creates a
  **normal turn** for the child Profile, links it to the parent turn
  (`parent_turn_id`), dispatches it, waits within the ten-minute bound, and
  returns the child's **bounded final message** plus a `task_id` handle;
* **cancellation propagates**: cancelling the parent cancels its children;
* **usage attribution** is the link: the child's own usage columns stay on the
  child turn and the parent's roll-up is the join - nothing is copied between
  turns, and nothing is invented.

Cross-family continuation is refused (a native session belongs to its family's
store); an unknown handle is refused; nothing here guesses.
"""
from __future__ import annotations

import time
from typing import Any, Mapping, Sequence

from agent_box.server.errors import ServerError
from agent_box.server.profiles.subagents import (
    DEFAULT_TIMEOUT_SECONDS,
    DelegationError,
    MAX_ROSTER_ENTRIES,
    check_depth,
    grant_edges,
    has_delegation,
    inline_available,
    resolve_roster,
    tool_definitions,
    validate_run_arguments,
)

#: The final message is bounded: the subagent's summary, not its transcript.
MAX_SUMMARY_CHARS = 4096
#: Errors in the child turn become a typed tool result, never raw stdout.
TERMINAL_OK = "completed"


class DelegationService:
    def __init__(
        self, *, records, profiles, sessions, execution=None, registry=None,
        data_root=None, objects=None,
    ) -> None:
        self.records = records            # SessionRecords (the ledger layer)
        self.profiles = profiles
        self.sessions = sessions          # SessionService (creates Sessions)
        self.execution = execution        # TurnExecutionPort (may be None)
        self.registry = registry
        self.data_root = data_root
        self.objects = objects

    # -- shared resolution --------------------------------------------------

    def list_for(self, *, parent_profile_id: str) -> dict[str, Any]:
        """The two tools' definitions and the live roster for one parent."""
        edges = grant_edges(self.profiles.subagent_grants())
        if not has_delegation(edges, parent_profile_id):
            return {"tools": [], "roster": []}
        profiles = self.profiles.list(include_archived=False)
        roster = resolve_roster(
            parent_id=parent_profile_id, edges=edges, profiles=profiles)
        return {
            "tools": tool_definitions(roster=roster),
            "roster": roster[:MAX_ROSTER_ENTRIES],
        }

    # -- run ----------------------------------------------------------------

    def run(
        self, *, parent_turn_id: str, parent_profile_id: str, arguments: Mapping[str, Any],
        chain: Sequence[str] = (), calls_this_turn: int = 0,
    ) -> dict[str, Any]:
        edges = grant_edges(self.profiles.subagent_grants())
        if not has_delegation(edges, parent_profile_id):
            raise DelegationError(
                "SUBAGENT_NOT_AUTHORIZED", "this role has no authorized subagents")
        profiles = self.profiles.list(include_archived=False)
        roster = resolve_roster(parent_id=parent_profile_id, edges=edges, profiles=profiles)
        try:
            validated = validate_run_arguments(arguments, roster=roster)
        except DelegationError:
            raise
        if calls_this_turn >= 4:
            raise DelegationError(
                "SUBAGENT_TURNS_EXCEEDED", "at most 4 subagent calls are allowed per turn")
        chosen = next(
            entry for entry in roster if entry["name"] == validated["subagent"])
        if not chosen["available"]:
            raise DelegationError(
                "SUBAGENT_UNAVAILABLE",
                f"the subagent is not available: {chosen['reason']}",
                available=[entry["name"] for entry in roster],
            )
        child_profile = self.profiles.get(chosen["profileId"])
        if bool(child_profile.get("archived_at")):
            raise ServerError("PROFILE_ARCHIVED", "Profile is archived", status=409)

        # Depth: the chain is (root ... parent); appending the child must stay
        # within the bound, and a cycle refuses by name.
        next_chain = [*chain, str(parent_profile_id), chosen["profileId"]]
        check_depth(next_chain)

        # The child's own edges decide whether *it* may delegate on; that is
        # the default-refusal depth rule, and it is recorded on the result so
        # the parent can relay it honestly.
        child_may_delegate = has_delegation(edges, chosen["profileId"])

        session_id, native_id, resumed = self._resolve_child_session(
            child_profile=child_profile, chosen=chosen, validated=validated)

        # Create the child turn as a normal turn, linked to the parent.
        merged_posture = self._merged_posture(
            parent_profile_id=parent_profile_id, child_profile=child_profile)
        turn_id = self._create_child_turn(
            session_id=session_id, child_profile=child_profile,
            parent_turn_id=parent_turn_id, prompt=validated["prompt"],
            model=validated.get("model"), posture=merged_posture,
        )
        if self.execution is None:
            raise ServerError(
                "EXECUTION_CAPABILITY_UNAVAILABLE", "no execution port is composed",
                status=503,
            )
        self.execution.accept(turn_id)
        outcome = self._await_terminal(
            session_id=session_id, turn_id=turn_id, timeout=validated["timeout"])
        # The continuable handle is the child session's own native id, read
        # after the turn ran: a fresh session only has one once it has been
        # opened for real (`native_id` covers the continuation case).
        session_after = self.records.get_session(session_id)
        checkpoint = session_after.get("checkpoint") or {}
        handle = checkpoint.get("native_id") or native_id
        summary = self._final_message(session_id=session_id, turn_id=turn_id)
        usage = self._usage_of(turn_id)
        return {
            "subagent": chosen["name"],
            "task_id": handle,
            "resumed": resumed,
            "state": outcome["state"],
            "summary": summary,
            "errorCode": outcome.get("error_code"),
            "canDelegate": child_may_delegate,
            "turnId": turn_id,
            "sessionId": session_id,
            "usage": usage,
        }

    # -- internals ----------------------------------------------------------

    def _resolve_child_session(
        self, *, child_profile: Mapping[str, Any], chosen: Mapping[str, Any],
        validated: Mapping[str, Any],
    ) -> tuple[str, str | None, bool]:
        task_id = validated.get("task_id")
        if task_id is None:
            workspace_id = self._shared_workspace_id(child_profile)
            session = self.sessions.create_session(
                f"subagent-{int(time.time()*1000)}",
                {"workspace_id": workspace_id, "profile_id": chosen["profileId"]},
            )[1]
            return session["session_id"], None, False
        # Continuation: the handle is a native session id of the *same family*.
        with self.records.database.read() as conn:
            row = conn.execute(
                "SELECT id,profile_id FROM server_sessions "
                "WHERE checkpoint_native_id=?", (task_id,),
            ).fetchone()
        if row is None:
            raise DelegationError(
                "SUBAGENT_TASK_UNKNOWN", "no subagent session carries that task_id")
        session = self.records.get_session(str(row["id"]))
        owner = self.profiles.get(str(session["profile_id"]))
        if str(owner["harness_type"]) != str(child_profile["harness_type"]):
            # A native session lives in its family's store: continuing it from
            # another family is impossible, and silently opening a fresh one
            # would pretend continuity.
            raise DelegationError(
                "SUBAGENT_TASK_FAMILY_MISMATCH",
                "a subagent session can only be continued within its own family",
            )
        return str(row["id"]), task_id, True

    def _shared_workspace_id(self, child_profile: Mapping[str, Any]) -> str:
        with self.records.database.read() as conn:
            row = conn.execute(
                "SELECT s.workspace_id FROM server_sessions s "
                "WHERE s.profile_id=? ORDER BY s.updated_at DESC LIMIT 1",
                (child_profile["id"],),
            ).fetchone()
        if row is not None:
            return str(row["workspace_id"])
        raise DelegationError(
            "SUBAGENT_WORKSPACE_UNKNOWN",
            "the subagent Profile has no workspace to run in yet",
        )

    def _merged_posture(
        self, *, parent_profile_id: str, child_profile: Mapping[str, Any],
    ) -> dict[str, Any]:
        """The child's posture, narrowed by the parent's prohibitions.

        Only the parent's `deny`s (and its neutral limits, which are those
        `deny`s) travel: the child's own allow/ask set stays the child's, so a
        delegation can tighten a key but never widen one. The result is frozen
        into the child turn's effective configuration, exactly where the
        runtime reads a turn's posture from.
        """
        import json

        from agent_box.server.profiles.permissions import resolve_all

        def posture_of(row: Mapping[str, Any]) -> dict[str, Any]:
            raw = row.get("permission_rules_json")
            rules = json.loads(raw) if raw else []
            return resolve_all(rules, preset=str(row.get("permission_preset") or "default"))

        parent = self.profiles.get(parent_profile_id)
        parent_posture = posture_of(parent)
        child = self.profiles.get(str(child_profile["id"]))
        child_posture = posture_of(child)
        merged_keys = {
            key: "deny" if parent_posture["keys"].get(key) == "deny" else action
            for key, action in child_posture["keys"].items()
        }
        return {"preset": child_posture["preset"], "keys": merged_keys,
                "inheritedFrom": parent_profile_id}

    def _create_child_turn(
        self, *, session_id: str, child_profile: Mapping[str, Any],
        parent_turn_id: str, prompt: str, model: str | None,
        posture: Mapping[str, Any] | None = None,
    ) -> str:
        import json

        from agent_box.server.ids import now, opaque_id

        turn_id = opaque_id("turn")
        timestamp = now()
        effective_digest: str | None = None
        if self.objects is not None and posture is not None:
            child_value = {
                "schema_version": 1,
                "harness_type": str(child_profile["harness_type"]),
                "configuration": {},
                "permissions": dict(posture),
            }
            effective_digest = self.objects.publish(json.dumps(
                child_value, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
            ).encode()).digest
        with self.records.database.transaction() as conn:
            conn.execute(
                "INSERT INTO server_turns(id,session_id,profile_id,profile_revision,"
                "native_generation,state,capture_state,cleanup_state,input_object_digest,"
                "effective_config_object_digest,parent_turn_id,created_at,updated_at) "
                "VALUES (?,?,?,1,0,'accepted','pending','pending','x',?,?,?,?)",
                (turn_id, session_id, child_profile["id"], effective_digest,
                 parent_turn_id, timestamp, timestamp),
            )
            conn.execute(
                "UPDATE server_sessions SET status='active',version=version+1,"
                "updated_at=? WHERE id=?", (timestamp, session_id),
            )
            self.records._append_session_event(
                conn, session_id, turn_id, "turn.accepted",
                {"state": "accepted", "parent_turn_id": parent_turn_id,
                 "model": model, "prompt_preview": prompt[:200]},
            )
        return turn_id

    def _await_terminal(self, *, session_id: str, turn_id: str, timeout: int) -> dict[str, Any]:
        deadline = time.monotonic() + min(timeout, DEFAULT_TIMEOUT_SECONDS)
        while time.monotonic() < deadline:
            session = self.records.get_session(session_id)
            for turn in session["turns"]:
                if turn["id"] == turn_id and turn["state"] in {
                    "completed", "failed", "cancelled", "unknown",
                }:
                    return dict(turn)
            time.sleep(0.05)
        raise DelegationError(
            "SUBAGENT_TIMEOUT", f"the subagent did not finish within {timeout}s")

    def _final_message(self, *, session_id: str, turn_id: str) -> str:
        session = self.records.get_session(session_id)
        pieces: list[str] = []
        for event in session["events"]:
            if event.get("turn_id") != turn_id:
                continue
            if event["kind"] == "message.delta":
                pieces.append(str(event["data"].get("text") or ""))
        summary = "".join(pieces)
        if len(summary) > MAX_SUMMARY_CHARS:
            summary = summary[:MAX_SUMMARY_CHARS] + "…"
        return summary

    def _usage_of(self, turn_id: str) -> dict[str, Any] | None:
        with self.records.database.read() as conn:
            row = conn.execute(
                "SELECT usage_input_tokens,usage_output_tokens,usage_total_tokens,"
                "usage_source FROM server_turns WHERE id=?", (turn_id,),
            ).fetchone()
        if row is None or row["usage_source"] is None:
            return None
        return {
            "inputTokens": row["usage_input_tokens"],
            "outputTokens": row["usage_output_tokens"],
            "totalTokens": row["usage_total_tokens"],
            "usageSource": row["usage_source"],
        }


def cancel_children(records, *, parent_turn_id: str) -> list[str]:
    """Every child turn of one parent turn (order 65: cancellation propagates)."""
    with records.database.read() as conn:
        rows = conn.execute(
            "SELECT id FROM server_turns WHERE parent_turn_id=? "
            "AND state IN ('accepted','dispatching','running','capturing')",
            (parent_turn_id,),
        ).fetchall()
    return [str(row["id"]) for row in rows]
