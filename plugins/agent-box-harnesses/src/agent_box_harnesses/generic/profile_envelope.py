"""Harness-owned immutable profile envelope and typed management adapter."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Mapping

@dataclass(frozen=True)
class ProfileEnvelope:
    profile_id: str; harness_type: str; provider_id: str; name: str; schema_version: str; revision: int; digest: str
    disabled: bool = False
    credential_source_ref: Mapping[str, str] | None = None
    capability_refs: tuple[Mapping[str, str], ...] = ()
    session_overlay_policy: Mapping[str, str] = field(default_factory=dict)
    import_provenance: Mapping[str, str] | None = None
    native_payload: Mapping[str, Any] = field(default_factory=dict)
    def __post_init__(self):
        if self.revision < 1 or not self.digest or not self.profile_id or not self.harness_type: raise ValueError("invalid profile envelope identity")
        if self.credential_source_ref and any(k in self.credential_source_ref for k in ("value", "secret", "token", "path")): raise ValueError("credential envelope must contain a locator only")

def to_profile_envelope(value: Mapping[str, Any] | ProfileEnvelope, *, harness_type: str, provider_id: str) -> ProfileEnvelope:
    if isinstance(value, ProfileEnvelope): return value
    if not isinstance(value, Mapping): raise TypeError("profile must be a mapping")
    return ProfileEnvelope(str(value["profile_id"]), harness_type, provider_id, str(value.get("name", value["profile_id"])), str(value.get("schema_version", "1")), int(value["revision"]), str(value["digest"]), bool(value.get("disabled", False)), value.get("credential_source_ref"), tuple(value.get("capability_refs", ())), value.get("session_overlay_policy", {}), value.get("import_provenance"), value.get("native_payload", value.get("config", {})))

class ProfileEnvelopeManager:
    """Typed facade over a GenericProfileManager; no reflective mutation path."""
    def __init__(self, manager, *, harness_type: str, provider_id: str): self.manager, self.harness_type, self.provider_id = manager, harness_type, provider_id
    def descriptor(self): return self.manager.descriptor()
    def list_resources(self): return tuple(to_profile_envelope(x, harness_type=self.harness_type, provider_id=self.provider_id) for x in self.manager.list_profiles())
    def get_resource(self, ref): return to_profile_envelope(self.manager.get_profile(ref.native_id, int(ref.metadata.get("revision", "0"))), harness_type=self.harness_type, provider_id=self.provider_id)
    def create_revision(self, data, expected_revision=None): return self.manager.create(data)
    def disable(self, profile_id, revision): return self.manager.disable(profile_id, revision)
