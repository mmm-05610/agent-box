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

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator


class ProfileSelection(BaseModel):
    """Profile pin: which governed profile (and optionally which revision
    or digest) the turn must run under."""

    model_config = ConfigDict(extra="forbid")

    profile_id: str = Field(min_length=1, max_length=128)
    revision: Optional[str] = Field(default=None, max_length=128)
    digest: Optional[str] = Field(default=None, max_length=128)


class ModelSelection(BaseModel):
    """Model pin: which model (and optionally provider) the turn requests."""

    model_config = ConfigDict(extra="forbid")

    model_id: str = Field(min_length=1, max_length=128)
    provider: Optional[str] = Field(default=None, max_length=128)


class CreateSessionRequest(BaseModel):
    """POST /api/v1/sessions request body."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    idempotency_key: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=200)
    project_path: str = Field(min_length=1, max_length=1024)


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
