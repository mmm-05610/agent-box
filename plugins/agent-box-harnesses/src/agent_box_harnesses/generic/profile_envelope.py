"""Harness-owned immutable profile envelope and typed management adapter.

``ProfileEnvelope`` is the typed resolve product of the official Profile
Store: it IS an ``AgentBoxProfileV1`` (so the Root contract type check
passes) and additionally carries the native payload, capability refs and the
opaque credential locator — the fields the formal launch chain previously
lost between the Store and the Adapter.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping

from agent_box.resource_contracts import AgentBoxProfileV1


@dataclass(frozen=True)
class ProfileEnvelope(AgentBoxProfileV1):
    """Typed profile envelope: exact Ref identity plus the native payload.

    Plugin-local native-home state fields (generation, tree digest,
    recovery generation, skill receipts digest) ride along so the Web and
    diagnostics can display native home truth without a second lookup.
    """

    native_payload: Mapping[str, Any] = field(default_factory=dict)
    capability_refs: tuple[Mapping[str, str], ...] = ()
    credential_source_ref: Mapping[str, str] | None = None
    session_overlay_policy: Mapping[str, str] = field(default_factory=dict)
    import_provenance: Mapping[str, str] | None = None
    disabled: bool = False
    schema_version: int = 2
    skill_receipts_digest: str = ""
    native_state_generation: int = 0
    native_tree_digest: str = ""
    recovery_generation: int = 0
    profile_id: str = ""

    def __post_init__(self) -> None:
        super().__post_init__()
        if self.credential_source_ref and any(k in self.credential_source_ref for k in ("value", "secret", "token", "path")):
            raise ValueError("credential envelope must contain a locator only")
        if self.skill_receipts_digest and not self.skill_receipts_digest.startswith("sha256:"):
            raise ValueError("skill receipts digest must be a sha256 digest or empty")


def to_profile_envelope(value: Mapping[str, Any] | ProfileEnvelope, *, harness_type: str, provider_id: str) -> ProfileEnvelope:
    if isinstance(value, ProfileEnvelope):
        return value
    if not isinstance(value, Mapping):
        raise TypeError("profile must be a mapping")
    if str(value.get("harness_type", harness_type)) != harness_type:
        raise ValueError("profile envelope harness_type mismatch")
    return ProfileEnvelope(
        name=str(value.get("name", value.get("profile_id", ""))),
        agent_type=harness_type,
        digest=str(value["digest"]),
        revision=int(value["revision"]),
        provider=provider_id,
        profile_id=str(value.get("profile_id", "")),
        native_payload=value.get("native_payload", value.get("config", {})),
        capability_refs=tuple(value.get("capability_refs", ())),
        credential_source_ref=value.get("credential_source_ref"),
        session_overlay_policy=value.get("session_overlay_policy", {}),
        import_provenance=value.get("import_provenance"),
        disabled=bool(value.get("disabled", False)),
        schema_version=int(value.get("schema_version", 2)),
        skill_receipts_digest=str(value.get("skill_receipts_digest", "")),
        native_state_generation=int(value.get("native_state_generation", 0)),
        native_tree_digest=str(value.get("native_tree_digest", "")),
        recovery_generation=int(value.get("recovery_generation", 0)),
    )


class ProfileEnvelopeManager:
    """Typed facade over a GenericProfileManager; no reflective mutation path."""

    def __init__(self, manager, *, harness_type: str, provider_id: str):
        self.manager, self.harness_type, self.provider_id = manager, harness_type, provider_id

    def descriptor(self):
        return self.manager.descriptor()

    def list_resources(self):
        return tuple(to_profile_envelope(x, harness_type=self.harness_type, provider_id=self.provider_id) for x in self.manager.list_profiles())

    def get_resource(self, ref):
        return to_profile_envelope(self.manager.get_profile(ref.native_id, int(ref.metadata.get("revision", "0"))), harness_type=self.harness_type, provider_id=self.provider_id)

    def create_revision(self, data, expected_revision=None):
        return self.manager.create_revision(data, expected_revision=expected_revision)

    def disable(self, profile_id, revision):
        return self.manager.disable(profile_id, revision)
