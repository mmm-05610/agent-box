"""Session use cases: first-send acceptance owns exactly one dispatch."""
from __future__ import annotations

import json
from typing import Any

from agent_box.server.errors import ServerError, unavailable
from agent_box.server.execution import HarnessRegistry, TurnExecutionPort
from agent_box.server.records import digest, reject_sensitive_keys
from agent_box.server.sessions.repository import SessionRecords


class SessionService:
    def __init__(self, records: SessionRecords, idempotency, objects, *,
                 harnesses: HarnessRegistry, profiles, credentials,
                 queue=None,
                 execution: TurnExecutionPort | None = None,
                 on_event=None) -> None:
        self.records = records
        self.idempotency = idempotency
        self.objects = objects
        self.harnesses = harnesses
        self.profiles = profiles
        self.credentials = credentials
        self.queue = queue
        self.execution = execution
        self.on_event = on_event or (lambda: None)

    def create_session(self, key: str, body: dict[str, Any]):
        return self.records.create_session(
            key=key, request_digest=digest(body),
            workspace_id=body["workspace_id"], profile_id=body["profile_id"],
        )

    # -- wire/1 intent acceptance ------------------------------------------

    def accept_intent(self, **kwargs: Any):
        """Accept one send intent; the winner is the only dispatcher.

        Configuration validation happens before acceptance so a rejected send
        leaves no Session and no queued work behind (core-semantics/1 §6).
        """
        profile_id = kwargs.pop("profile_id")
        overrides = kwargs.pop("overrides", None)
        self._assert_profile_executable(profile_id)
        if overrides:
            self._validate_overrides_for(profile_id, overrides)
        kwargs["queue_records"] = self.queue
        kwargs["resolve_config_version"] = self._resolve_config_version
        return self.records.accept_intent(profile_id=profile_id, **kwargs)

    def _assert_profile_executable(self, profile_id: str) -> None:
        profile = self.profiles.get(profile_id)
        harness_type = profile["harness_type"]
        if harness_type not in self.harnesses:
            raise unavailable("CAPABILITY_UNSUPPORTED", "Session Harness is not configured")
        descriptor = self.harnesses.get(harness_type)
        if self.execution is None:
            raise unavailable("EXECUTION_CAPABILITY_UNAVAILABLE", "Turn execution is not configured")
        credential_id = profile.get("credential_id")
        if descriptor.credential_kind is not None:
            if not credential_id:
                raise ServerError(
                    "CREDENTIAL_REQUIRED", "Profile has no authorized credential", status=409,
                )
            self.credentials.get(credential_id, kind=descriptor.credential_kind)

    def _validate_overrides_for(self, profile_id: str, overrides: list[dict[str, Any]]) -> None:
        profile = self.profiles.get(profile_id)
        descriptor = self.harnesses.get(profile["harness_type"])
        locked = [item["controlId"] for item in overrides if item["controlId"] in descriptor.security_locked_controls]
        if locked:
            raise ServerError(
                "PROFILE_CONFIGURATION_INVALID",
                f"controls are security locked: {', '.join(sorted(locked))}",
                status=422,
            )
        if descriptor.configuration_validator is None:
            return
        configured = json.loads(self.objects.read(profile["config_object_digest"]))
        merged = dict(configured["configuration"])
        merged.update({item["controlId"]: item["value"] for item in overrides})
        try:
            descriptor.configuration_validator(merged)
        except (TypeError, ValueError) as exc:
            raise ServerError("TURN_OVERRIDES_INVALID", str(exc), status=422) from exc

    def _resolve_config_version(self, conn, profile, overrides) -> int:
        """Freeze the effective configuration version at acceptance time.

        The version is the Profile revision read inside the accepting
        transaction: a later Profile edit bumps the revision, so a queued item
        can still prove which configuration it was accepted under without the
        Server keeping a second copy of that configuration.
        """
        del overrides
        current = conn.execute(
            "SELECT config_revision FROM server_profiles WHERE id=?", (profile["id"],),
        ).fetchone()
        if current is None:
            raise ServerError("PROFILE_NOT_FOUND", "Profile was not found", status=404)
        return int(current["config_revision"])

    def create_turn(self, session_id: str, key: str, body: dict[str, Any]):
        if self.execution is None:
            raise unavailable("EXECUTION_CAPABILITY_UNAVAILABLE", "Turn execution is not configured")
        scope = f"POST:/sessions/{session_id}/turns"
        request_digest = digest(body)
        prior = self.idempotency.get(scope, key, request_digest)
        if prior:
            return prior
        overrides = self._validated_overrides(session_id, body)
        self._assert_session_harness(session_id)
        claimed, status, result = self.records.create_turn(
            session_id=session_id, key=key, request_digest=request_digest,
            input_object_digest=self._publish_input(body),
            expected_profile_revision=body["expected_profile_revision"],
        )
        self.on_event()
        if claimed:
            # Exactly the acceptance owner dispatches; a concurrent replay
            # observes the committed receipt and must not dispatch again.
            try:
                self.execution.accept(result["turn_id"], overrides=overrides)
            except Exception:
                # Dispatch/capture failures are durable Turn events recorded
                # by the execution port. The accepted HTTP receipt stays the
                # idempotent product answer.
                pass
        return status, result

    def cancel_turn(self, turn_id: str, key: str):
        scope = f"POST:/turns/{turn_id}/cancel"
        request_digest = digest({"turn_id": turn_id})
        prior = self.idempotency.get(scope, key, request_digest)
        if prior:
            return prior
        if self.execution is None:
            raise unavailable("EXECUTION_CAPABILITY_UNAVAILABLE", "Turn cancellation is not configured")
        self.records.record_cancel_request(turn_id)
        accepted = self.execution.cancel(turn_id)
        self.on_event()
        return self.idempotency.save(
            scope, key, request_digest, 202,
            {"turn_id": turn_id, "cancel_requested": True, "accepted": accepted},
        )

    def get_session(self, session_id: str):
        return self.records.get_session(session_id)

    def list_events(self, session_id: str, after: int):
        return self.records.list_events(session_id, after)

    # -- internals ------------------------------------------------------------

    def _publish_input(self, body: dict[str, Any]) -> str:
        record = self.objects.publish(json.dumps(
            {"schema_version": 1, "text": body["text"]},
            ensure_ascii=False, sort_keys=True, separators=(",", ":"),
        ).encode())
        return record.digest

    def _session_profile(self, session_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
        session = self.records.get_session(session_id)
        profile = self.profiles.get(session["profile_id"])
        return session, profile

    def _assert_session_harness(self, session_id: str) -> None:
        _session, profile = self._session_profile(session_id)
        harness_type = profile["harness_type"]
        if harness_type not in self.harnesses:
            raise unavailable("HARNESS_UNAVAILABLE", "Session Harness is not configured")
        descriptor = self.harnesses.get(harness_type)
        credential_id = profile.get("credential_id")
        if descriptor.credential_kind is not None:
            if not credential_id:
                raise ServerError(
                    "CREDENTIAL_REQUIRED", "Profile has no authorized credential", status=409,
                )
            self.credentials.get(credential_id, kind=descriptor.credential_kind)

    def _validated_overrides(self, session_id: str, body: dict[str, Any]):
        """Validate override merges before acceptance; None means no overrides."""
        overrides = body.get("overrides")
        if overrides is None:
            return None
        reject_sensitive_keys(overrides)
        _session, profile = self._session_profile(session_id)
        descriptor = self.harnesses.get(profile["harness_type"])
        if descriptor.configuration_validator is None:
            return overrides
        configured = json.loads(self.objects.read(profile["config_object_digest"]))
        merged = dict(configured["configuration"])
        merged.update(overrides)
        try:
            descriptor.configuration_validator(merged)
        except (TypeError, ValueError) as exc:
            raise ServerError("TURN_OVERRIDES_INVALID", str(exc), status=422) from exc
        return overrides
