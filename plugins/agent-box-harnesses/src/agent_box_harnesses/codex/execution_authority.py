"""Codex-owned launch authority for exact, locator-only dispatch facts.

This module validates the non-secret inputs which must be frozen before a
credential materializer is called.  It intentionally does not resolve,
open, copy, hash, or inspect credential content, and it never adopts a
remote native home.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping

from agent_box.resource_contracts import (
    AgentBoxProfileV1,
    CredentialRefV1,
    HarnessModelProviderV1,
)

from ..adapters.failures import PlanRejected


@dataclass(frozen=True)
class CodexLaunchFacts:
    """Immutable, public-safe facts for one Codex launch.

    Credential identity is represented only by its revision.  The locator is
    deliberately absent so that repr/diagnostics cannot disclose it.
    """

    harness_type: str
    execution_id: str
    dispatch_id: str
    executable_identity: str
    executable_version: str
    executable_digest: str
    profile_revision: int | None
    profile_digest: str | None
    provider_config_id: str | None
    provider_revision: int | None
    provider_digest: str | None
    model: str | None
    credential_revision: int | None


@dataclass(frozen=True)
class CodexSecretDeliveryContract:
    """Ephemeral locator handoff for the designated secret frame only."""

    execution_id: str
    credential_revision: int
    credential_ref: CredentialRefV1 = field(repr=False, compare=False)
    delivery_class: str = "designated-secret-file"
    guest_target: str = "/runtime/home/.codex/auth.json"
    access: str = "read-only"
    replayable: bool = False
    cleanup_required: bool = True

    def public_facts(self) -> Mapping[str, object]:
        """Return only non-secret audit facts; omit the locator entirely."""
        return {
            "delivery_class": self.delivery_class,
            "guest_target": self.guest_target,
            "access": self.access,
            "replayable": self.replayable,
            "cleanup_required": self.cleanup_required,
            "credential_revision": self.credential_revision,
        }


@dataclass(frozen=True)
class CodexExecCapabilityContract:
    """Honest capability truth of the current ``codex exec --json`` mode."""

    streaming: str = "stdout-ndjson"
    cancel: str = "runtime-process-tree-required"
    permission: str = "unavailable-in-exec-json"
    question: str = "unavailable-in-exec-json"
    terminal: str = "observed-once-after-native-terminal-or-exit"


def _inputs(request: Any, contract_id: str) -> tuple[Any, ...]:
    return tuple(
        item.value for item in getattr(request, "resolved_inputs", ())
        if item.contract_id == contract_id
    )


def _ref_for(request: Any, contract_id: str):
    matches = tuple(
        item.ref for item in getattr(request, "resolved_inputs", ())
        if item.contract_id == contract_id
    )
    if len(matches) > 1:
        raise PlanRejected("INPUT_CARDINALITY_VIOLATION", contract_id)
    return matches[0] if matches else None


class CodexExecutionAuthority:
    """Freeze Codex's exact launch inputs before secret projection."""

    harness_type = "codex"
    # Official Codex config accepts only ``wire_api = "responses"`` for
    # model providers.  Keep the Studio protocol spelling exact and reject
    # other OpenAI-compatible families before credential resolution.
    supported_protocol_families = frozenset({"openai-responses"})

    def __init__(self, *, selected_model: str | None = None) -> None:
        if selected_model is not None and (
            not isinstance(selected_model, str) or not selected_model.strip()
        ):
            raise ValueError("selected model is required when supplied")
        self.selected_model = selected_model.strip() if selected_model else None

    def freeze(self, request: Any, executable: Any) -> CodexLaunchFacts:
        """Validate exact non-secret identity and return immutable facts.

        Provider eligibility is checked before touching the credential value
        or locator.  Credential validation is intentionally the final step.
        """
        if executable is None or not getattr(executable, "available", True):
            raise PlanRejected("EXECUTABLE_UNAVAILABLE")
        executable_digest = getattr(executable, "digest", None)
        if not isinstance(executable_digest, str) or not executable_digest:
            raise PlanRejected("EXECUTABLE_FACTS_INVALID")

        profiles = _inputs(request, AgentBoxProfileV1.contract_id)
        if len(profiles) > 1:
            raise PlanRejected("PROFILE_CARDINALITY_VIOLATION")
        profile = profiles[0] if profiles else None
        profile_ref = _ref_for(request, AgentBoxProfileV1.contract_id)
        if profile is not None and not isinstance(profile, AgentBoxProfileV1):
            raise PlanRejected("PROFILE_TYPE_MISMATCH")
        if profile is not None:
            if profile.agent_type != self.harness_type:
                raise PlanRejected("PROFILE_HARNESS_MISMATCH")
            if profile_ref is not None:
                _match_ref_metadata(
                    profile_ref.metadata,
                    revision=profile.revision,
                    digest=profile.digest,
                    harness_type=self.harness_type,
                    code="PROFILE_REF_STALE",
                )

        providers = _inputs(request, HarnessModelProviderV1.contract_id)
        if len(providers) != 1:
            raise PlanRejected("MODEL_PROVIDER_REQUIRED")
        provider = providers[0]
        if not isinstance(provider, HarnessModelProviderV1):
            raise PlanRejected("MODEL_PROVIDER_TYPE_MISMATCH")
        if provider.harness_type != self.harness_type:
            raise PlanRejected("MODEL_PROVIDER_HARNESS_MISMATCH")
        if provider.protocol_family not in self.supported_protocol_families:
            raise PlanRejected("MODEL_PROVIDER_PROTOCOL_UNSUPPORTED")
        provider_ref = _ref_for(request, HarnessModelProviderV1.contract_id)
        if provider_ref is not None:
            _match_ref_metadata(
                provider_ref.metadata,
                revision=provider.revision,
                digest=provider.digest,
                harness_type=self.harness_type,
                code="MODEL_PROVIDER_REF_STALE",
            )
        if not provider.enabled:
            raise PlanRejected("MODEL_PROVIDER_DISABLED")
        model = self.selected_model
        if model is None and profile is not None:
            payload = getattr(profile, "native_payload", None)
            if isinstance(payload, dict):
                value = payload.get("model")
                model = value.strip() if isinstance(value, str) and value.strip() else None
        if model is None:
            raise PlanRejected("MODEL_REQUIRED")
        if not provider.has_model(model):
            raise PlanRejected("MODEL_NOT_ELIGIBLE")

        credentials = _inputs(request, CredentialRefV1.contract_id)
        if provider.credential_ref:
            if len(credentials) != 1:
                raise PlanRejected("CREDENTIAL_REF_REQUIRED")
            credential = credentials[0]
            if not isinstance(credential, CredentialRefV1):
                raise PlanRejected("CREDENTIAL_REF_TYPE_MISMATCH")
            if credential.native_locator != provider.credential_ref:
                raise PlanRejected("CREDENTIAL_REF_MISMATCH")
            credential_revision: int | None = credential.revision
        else:
            if credentials:
                raise PlanRejected("CREDENTIAL_REF_UNEXPECTED")
            credential_revision = None

        return CodexLaunchFacts(
            harness_type=self.harness_type,
            execution_id=str(request.execution_id),
            dispatch_id=str(request.dispatch_id),
            executable_identity=str(getattr(executable, "identity", "codex")),
            executable_version=str(getattr(executable, "version", "unknown")),
            executable_digest=executable_digest,
            profile_revision=profile.revision if profile is not None else None,
            profile_digest=profile.digest if profile is not None else None,
            provider_config_id=provider.config_id,
            provider_revision=provider.revision,
            provider_digest=provider.digest,
            model=model,
            credential_revision=credential_revision,
        )

    def secret_delivery(
        self, request: Any, facts: CodexLaunchFacts
    ) -> CodexSecretDeliveryContract:
        """Create the post-freeze designated secret handoff.

        This method never obtains secret bytes.  The opaque CredentialRef is
        consumed only by the local credential authority after every launch
        fact has been validated and frozen.
        """
        if (
            not isinstance(facts, CodexLaunchFacts)
            or facts.harness_type != self.harness_type
            or facts.execution_id != getattr(request, "execution_id", None)
            or facts.dispatch_id != getattr(request, "dispatch_id", None)
        ):
            raise PlanRejected("LAUNCH_FACTS_SCOPE_MISMATCH")
        credentials = _inputs(request, CredentialRefV1.contract_id)
        if len(credentials) != 1 or not isinstance(credentials[0], CredentialRefV1):
            raise PlanRejected("CREDENTIAL_REF_REQUIRED")
        credential = credentials[0]
        if facts.credential_revision != credential.revision:
            raise PlanRejected("CREDENTIAL_REVISION_MISMATCH")
        return CodexSecretDeliveryContract(
            execution_id=facts.execution_id,
            credential_revision=credential.revision,
            credential_ref=credential,
        )

    @staticmethod
    def capability_contract() -> CodexExecCapabilityContract:
        return CodexExecCapabilityContract()


def _match_ref_metadata(
    metadata: Any, *, revision: int, digest: str, harness_type: str, code: str
) -> None:
    if not isinstance(metadata, dict):
        raise PlanRejected(code)
    if (
        metadata.get("revision") != str(revision)
        or metadata.get("digest") != digest
        or metadata.get("harness_type") != harness_type
    ):
        raise PlanRejected(code)


__all__ = [
    "CodexExecCapabilityContract",
    "CodexExecutionAuthority",
    "CodexLaunchFacts",
    "CodexSecretDeliveryContract",
]
