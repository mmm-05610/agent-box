"""Session Codec SPI skeleton.

Concrete codecs belong to Harness plugins.  This pack only fixes the
request/result shapes and the admission contract: unknown versions fail
closed, ``materialize`` is the only sanctioned write path into a target
native format, and every materialization produces a verifiable view.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping, Optional, Protocol, runtime_checkable

from ...work_core.models import Ref
from .contracts import CanonicalRecord
from .loss import LossReport


@dataclass(frozen=True)
class CodecProbeRequest:
    harness_type: str
    harness_version: str
    native_format_version: str
    codec_version: str


@dataclass(frozen=True)
class CodecProbeResult:
    admitted: bool
    can_decode: bool
    can_materialize: bool
    reason: str = ""


@dataclass(frozen=True)
class MaterializationRequest:
    session_id: str
    execution_id: str
    target_harness: str
    native_format_version: str
    records: tuple[CanonicalRecord, ...]
    staging_root_hint: Optional[str] = None


@dataclass(frozen=True)
class NativeSessionView:
    """A temporary materialized native view; never a persistent authority."""

    execution_id: str
    harness_type: str
    root_ref: Ref
    input_watermark: int
    manifest_digest: str
    import_cursor: str


@dataclass(frozen=True)
class ImportRequest:
    session_id: str
    execution_id: str
    view: NativeSessionView
    cursor: str


@dataclass(frozen=True)
class NativeImportBatch:
    execution_id: str
    cursor: str
    complete: bool
    native_original_ref: Optional[Ref] = None
    content_digest: str = ""


@dataclass(frozen=True)
class CanonicalRecordDraft:
    """A decoded draft awaiting Store-side identity assignment and commit."""

    event_type: str
    turn_id: str
    payload: Mapping[str, str] = field(default_factory=dict)
    origin_harness: str = ""


@dataclass(frozen=True)
class NativeValidationResult:
    valid: bool
    reason: str = ""


@dataclass(frozen=True)
class NativeCompactRequest:
    session_id: str
    execution_id: str
    view: NativeSessionView


@dataclass(frozen=True)
class NativeCompactResult:
    supported: bool
    checkpoint_ref: Optional[Ref] = None
    reason: str = ""


@runtime_checkable
class HarnessSessionCodec(Protocol):
    """The SPI Harness plugins implement; unknown versions fail closed."""

    harness_type: str

    def probe(self, request: CodecProbeRequest) -> CodecProbeResult: ...

    def analyze(self, request: MaterializationRequest) -> LossReport: ...

    def materialize(self, request: MaterializationRequest) -> NativeSessionView: ...

    def read_incremental(self, request: ImportRequest) -> NativeImportBatch: ...

    def decode(self, batch: NativeImportBatch) -> tuple[CanonicalRecordDraft, ...]: ...

    def validate(self, view: NativeSessionView) -> NativeValidationResult: ...

    def compact(self, request: NativeCompactRequest) -> NativeCompactResult: ...
