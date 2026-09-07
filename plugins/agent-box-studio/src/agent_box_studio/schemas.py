"""Strict request/response DTOs for the Studio HTTP API.

Rules locked here:

- every request body is a strict Pydantic v2 model: unknown fields are
  rejected (``extra="forbid"``), and non-string JSON values (numbers,
  booleans, objects, lists) are never silently ``str()``-coerced — they
  fail validation with HTTP 422;
- ``project_path`` is NOT optional and never defaults to the CWD: a
  missing or empty ``project_path`` is a validation failure;
- field constraints are stable API facts: validation failures return the
  stable ``VALIDATION_ERROR`` envelope, never raw Pydantic diagnostics.
"""
from __future__ import annotations

import json
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator, ValidationInfo

from agent_box_model_providers.validation import validate_base_url


class ProfileSelection(BaseModel):
    """Profile pin: which governed profile (and optionally which revision
    or digest) the turn must run under."""

    model_config = ConfigDict(extra="forbid")

    profile_id: str = Field(min_length=1, max_length=128)
    revision: Optional[str] = Field(default=None, max_length=128)
    digest: Optional[str] = Field(default=None, max_length=128)


class ModelSelection(BaseModel):
    """Model pin: the exact model id (the ROUTE is a separate exact
    HarnessProviderConfigRef — never a bare provider id string)."""

    model_config = ConfigDict(extra="forbid")

    model_id: str = Field(min_length=1, max_length=128)


class ModelProviderRefSelector(BaseModel):
    """Exact HarnessProviderConfig selector (architecture override §二).

    The caller pins the exact immutable revision (obtained from the
    configs list API) — a bare provider id string is not an accepted
    form.  ``digest``, when present, is verified against the resolved
    revision (fail closed).
    """

    model_config = ConfigDict(extra="forbid")

    config_id: str = Field(min_length=1, max_length=64,
                           pattern=r"^[a-z0-9][a-z0-9-]{0,63}$")
    revision: int = Field(ge=1)
    digest: Optional[str] = Field(default=None, min_length=16, max_length=128)


class CreateSessionRequest(BaseModel):
    """POST /api/v1/sessions request body.

    The project is referenced EXACTLY one way: either a host ``project_path``
    (registered inline), the id of an ALREADY registered local project, or
    one exact Host-owned remote WSL Connection project (``connection_id`` +
    ``connection_revision`` + ``project_identity`` + ``remote_path``, with
    the WSL ``project_id``).  Local and remote references are mutually
    exclusive; the route fails the mix with a typed 400.
    """

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    idempotency_key: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=200)
    # project_id is declared first so the project_path validator (which runs
    # for the missing/default case too) can already see the validated value.
    project_id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    project_path: Optional[str] = Field(
        default=None, min_length=1, max_length=1024, validate_default=True
    )
    # Remote WSL Connection reference (GUI: a saved WSL Project).  All four
    # fields are required together; the route enforces local XOR remote.
    connection_id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    connection_revision: Optional[int] = Field(default=None, ge=1)
    project_identity: Optional[str] = Field(default=None, min_length=1, max_length=256)
    remote_path: Optional[str] = Field(default=None, min_length=1, max_length=1024)

    @field_validator("project_path")
    @classmethod
    def _exactly_one_project_reference(
        cls, value: Optional[str], info: ValidationInfo
    ) -> Optional[str]:
        project_id = (info.data or {}).get("project_id")
        if (value is None) == (project_id is None):
            raise ValueError("exactly one of project_path or project_id is required")
        return value


class RegisterProjectRequest(BaseModel):
    """POST /api/v1/projects request body."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    path: str = Field(min_length=1, max_length=1024)


class CreateProfileRequest(BaseModel):
    """POST /api/v1/harnesses/{harness_type}/profiles request body.

    ``payload`` is the harness-native profile payload (bounded JSON) owned
    by the profile authority; ``expected_revision`` turns the call into a
    CAS revision update (absent = create-or-current-revision write).
    """

    model_config = ConfigDict(extra="forbid")

    profile_id: str = Field(min_length=1, max_length=128)
    payload: dict[str, Any]
    expected_revision: Optional[int] = Field(default=None, ge=1)

    @field_validator("payload")
    @classmethod
    def _payload_bounded(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value, ensure_ascii=False).encode("utf-8")) > 262144:
            raise ValueError("payload exceeds the bounded profile size")
        return value


# -- provider authority (P2: model gateway providers) ----------------------------


class ProviderModelEntry(BaseModel):
    """One explicit model of a provider (+ optional display/capability
    metadata).  Manual model entries are never altered by discovery."""

    model_config = ConfigDict(extra="forbid")

    model_id: str = Field(min_length=1, max_length=128)
    display_name: Optional[str] = Field(default=None, max_length=128)
    capabilities: Optional[list[str]] = None

    @field_validator("capabilities")
    @classmethod
    def _capabilities_bounded(cls, value: Optional[list[str]]) -> Optional[list[str]]:
        if value is None:
            return value
        if len(value) > 16 or any(not c or len(c) > 64 for c in value):
            raise ValueError("capabilities must be a bounded string list")
        return value


class CreateProviderRequest(BaseModel):
    """POST /api/v1/providers request body.

    ``credential_value`` is WRITE-ONLY: it is materialized into the
    credential authority and never echoed back.  Note this DTO deliberately
    does NOT strip whitespace (``credential_value`` integrity wins).
    """

    model_config = ConfigDict(extra="forbid")

    provider_id: str = Field(
        min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9-]{0,63}$"
    )
    display_name: str = Field(min_length=1, max_length=128)
    harness_type: str = Field(min_length=1, max_length=64)
    base_url: str = Field(min_length=1, max_length=2048)
    protocol_family: Literal[
        "openai-completions", "openai-responses", "anthropic-messages"
    ]
    models: Optional[list[ProviderModelEntry]] = None
    credential_value: Optional[str] = Field(default=None, min_length=1, max_length=8192)
    group_label: Optional[str] = Field(default=None, min_length=1, max_length=128)

    @field_validator("base_url")
    @classmethod
    def _base_url_https_or_loopback(cls, value: str) -> str:
        try:
            validate_base_url(value)
        except ValueError as exc:
            raise ValueError("base_url must be https or loopback http") from exc
        return value


class UpdateProviderRequest(BaseModel):
    """PUT /api/v1/providers/{provider_id} request body.

    ``provider_id`` and ``credential`` are structurally absent (extra=forbid
    rejects them): ids are never renamed and credentials have their own
    endpoint.  Changing ``protocol_family`` is a normal edit but resets the
    per-family probe evidence (contract §1).
    """

    model_config = ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=1)
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=128)
    base_url: Optional[str] = Field(default=None, min_length=1, max_length=2048)
    protocol_family: Optional[
        Literal["openai-completions", "openai-responses", "anthropic-messages"]
    ] = None
    models: Optional[list[ProviderModelEntry]] = None
    group_label: Optional[str] = Field(default=None, min_length=1, max_length=128)

    @field_validator("base_url")
    @classmethod
    def _base_url_https_or_loopback(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        try:
            validate_base_url(value)
        except ValueError as exc:
            raise ValueError("base_url must be https or loopback http") from exc
        return value

class SetCredentialRequest(BaseModel):
    """PUT /api/v1/providers/{provider_id}/credential request body.

    The value is write-only: accepted, materialized at mode 0600, and never
    returned by any endpoint.
    """

    model_config = ConfigDict(extra="forbid")

    value: str = Field(min_length=1, max_length=8192)


class CreateProviderAccountRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    account_id: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9-]{0,63}$")
    display_name: str = Field(min_length=1, max_length=128)
    endpoint_candidates: list[str] = Field(default_factory=list, max_length=8)
    credential_refs: list[str] = Field(default_factory=list, max_length=8)
    metadata: dict[str, str] = Field(default_factory=dict)


class UpdateProviderAccountRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=128)
    endpoint_candidates: Optional[list[str]] = Field(default=None, max_length=8)
    credential_refs: Optional[list[str]] = Field(default=None, max_length=8)
    metadata: Optional[dict[str, str]] = None


class CreateHarnessProviderConfigRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    config_id: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9-]{0,63}$")
    harness_type: str = Field(min_length=1, max_length=64)
    base_url: str = Field(min_length=1, max_length=2048)
    protocol_family: Literal["openai-completions", "openai-responses", "anthropic-messages"]
    models: Optional[list[ProviderModelEntry]] = None
    credential_ref: str = ""
    provider_account_ref: str = ""
    projection: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True

    @field_validator("base_url")
    @classmethod
    def _config_base_url(cls, value: str) -> str:
        try:
            validate_base_url(value)
        except ValueError as exc:
            raise ValueError("base_url must be https or loopback http") from exc
        return value


class UpdateHarnessProviderConfigRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=1)
    base_url: Optional[str] = Field(default=None, min_length=1, max_length=2048)
    protocol_family: Optional[Literal["openai-completions", "openai-responses", "anthropic-messages"]] = None
    models: Optional[list[ProviderModelEntry]] = None
    credential_ref: Optional[str] = None
    provider_account_ref: Optional[str] = None
    projection: Optional[dict[str, Any]] = None
    enabled: Optional[bool] = None

    @field_validator("base_url")
    @classmethod
    def _update_config_base_url(cls, value: Optional[str]) -> Optional[str]:
        if value is not None:
            try:
                validate_base_url(value)
            except ValueError as exc:
                raise ValueError("base_url must be https or loopback http") from exc
        return value


class ProbeRequest(BaseModel):
    """POST /api/v1/providers/{provider_id}/probe request body."""

    model_config = ConfigDict(extra="forbid")

    model: str = Field(min_length=1, max_length=128)


class TurnCreateRequest(BaseModel):
    """POST /api/v1/sessions/{session_id}/turns request body.

    This is the FULL final shape: the currently synchronous fake vertical
    consumes only ``idempotency_key`` and ``input``; the remaining fields
    are frozen now so the async real-harness rewire can accept the same
    DTO without another contract change.
    """

    model_config = ConfigDict(extra="forbid")

    idempotency_key: str = Field(min_length=1, max_length=200)
    input: str = Field(min_length=1, max_length=131072)
    harness_type: Optional[str] = Field(default=None, max_length=64)
    execution_provider_id: Optional[str] = Field(default=None, max_length=128)
    profile: Optional[ProfileSelection] = None
    model: Optional[ModelSelection] = None
    model_provider: Optional[ModelProviderRefSelector] = None
    launch_mode: Optional[str] = Field(default=None, max_length=32)
    runtime_host: Optional[str] = Field(default=None, max_length=64)
    sandbox: Optional[str] = Field(default=None, max_length=64)
    terminal: Optional[str] = Field(default=None, max_length=64)
    # Native same-harness continuation: the Turn to continue from (must be a
    # committed turn of THIS session that recorded a native session
    # locator).  Cross-harness history translation is explicitly out of
    # scope for this phase.
    continue_from_turn_id: Optional[str] = Field(default=None, min_length=1, max_length=128)


class PermissionResponseRequest(BaseModel):
    """POST .../permissions/{request_id}/respond request body."""

    model_config = ConfigDict(extra="forbid")

    decision: str = Field(min_length=1, max_length=16)

    @field_validator("decision")
    @classmethod
    def _decision_vocabulary(cls, value: str) -> str:
        if value not in ("approve", "reject"):
            raise ValueError("decision must be approve or reject")
        return value


class QuestionResponseRequest(PermissionResponseRequest):
    """POST .../questions/{request_id}/respond request body."""


class RespondResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: str
    decision: str
    delivered: bool


class CancelResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    turn_id: str
    cancel: str


class BreakLeaseRequest(BaseModel):
    """POST /api/v1/sessions/{session_id}/lease/break request body.

    ``confirm`` must be the literal boolean ``true``; an unconditional or
    accidental break is not possible.  CAS re-validation of
    ``expected_owner_id``/``expected_turn_id`` happens in the Session
    Store; a mismatch fails closed with a typed conflict.
    """

    model_config = ConfigDict(extra="forbid")

    expected_owner_id: str = Field(min_length=1, max_length=128)
    expected_turn_id: str = Field(min_length=1, max_length=128)
    reason: str = Field(min_length=1, max_length=256)
    # StrictBool rejects 1/0/"true"; the validator rejects literal false:
    # only the JSON boolean `true` confirms a break.
    confirm: StrictBool

    @field_validator("confirm")
    @classmethod
    def _confirm_must_be_true(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError("confirm must be the literal boolean true")
        return value


class RecoverResponse(BaseModel):
    """Response of POST /api/v1/sessions/{session_id}/recovery/{op_id}."""

    model_config = ConfigDict(extra="forbid")

    op_id: str
    state: str
    detail: str


class BreakLeaseResponse(BaseModel):
    """Response of POST /api/v1/sessions/{session_id}/lease/break."""

    model_config = ConfigDict(extra="forbid")

    session_id: str
    lease: str
