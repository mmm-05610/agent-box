"""Profile use cases: validated creation and registry-backed capability views."""
from __future__ import annotations

import json
from typing import Any

from agent_box.server.errors import ServerError, unavailable
from agent_box.server.execution import HarnessRegistry
from agent_box.server.profiles.repository import ProfileRecords
from agent_box.server.records import canonical, digest, reject_sensitive_keys


class ProfileService:
    def __init__(self, records: ProfileRecords, idempotency, objects, *,
                 harnesses: HarnessRegistry,
                 credentials) -> None:
        self.records = records
        self.idempotency = idempotency
        self.objects = objects
        self.harnesses = harnesses
        self.credentials = credentials

    def create(self, key: str, body: dict[str, Any]):
        harness_type = body["harness_type"]
        if harness_type not in self.harnesses:
            raise unavailable("HARNESS_UNAVAILABLE", "Requested Harness is not configured")
        descriptor = self.harnesses.get(harness_type)
        reject_sensitive_keys(body["configuration"])
        if body.get("credential_id") is not None:
            if descriptor.credential_kind is None:
                raise unavailable("HARNESS_UNAVAILABLE", "Requested Harness is not configured")
            self.credentials.get(body["credential_id"], kind=descriptor.credential_kind)
        if descriptor.configuration_validator is not None:
            try:
                descriptor.configuration_validator(body["configuration"])
            except ServerError:
                raise
            except (TypeError, ValueError) as exc:
                raise ServerError("PROFILE_CONFIGURATION_INVALID", str(exc), status=422) from exc
        record = self.objects.publish(canonical({
            "schema_version": 1, "harness_type": harness_type,
            "configuration": body["configuration"],
        }))
        status, result = self.records.create(
            key=key, request_digest=digest(body), name=body["name"],
            harness_type=harness_type, config_digest=record.digest,
            credential_id=body.get("credential_id"),
        )
        result["capabilities"] = self.harnesses.claims_for(harness_type)
        return status, result

    def list(self, *, include_archived: bool = True) -> list[dict[str, Any]]:
        items = []
        for row in self.records.list(include_archived=include_archived):
            items.append({
                "profile_id": row["id"], "name": row["name"],
                "harness_type": row["harness_type"],
                "config_revision": row["config_revision"],
                "native_generation": row["native_generation"],
                "credential_id": row["credential_id"], "run_state": row["run_state"],
                "recovery_pending": bool(row["recovery_pending"]),
                "capabilities": self.harnesses.claims_for(row["harness_type"]),
            })
        return items
