"""Structured translation-loss reporting for cross-format materialization."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class LossSeverity(str, Enum):
    NON_SEMANTIC = "non_semantic"
    CONFIRMABLE = "confirmable"
    BLOCKING = "blocking"


@dataclass(frozen=True)
class TranslationLoss:
    record_id: str | None
    field: str
    severity: LossSeverity
    reason_code: str
    description: str

    def __post_init__(self) -> None:
        if not self.field or not self.reason_code:
            raise ValueError("translation loss field and reason_code are required")


@dataclass(frozen=True)
class LossReport:
    source_watermark: int
    target_harness: str
    target_format_version: str
    losses: tuple[TranslationLoss, ...] = ()

    @property
    def blocking(self) -> tuple[TranslationLoss, ...]:
        return tuple(loss for loss in self.losses if loss.severity is LossSeverity.BLOCKING)

    @property
    def confirmable(self) -> tuple[TranslationLoss, ...]:
        return tuple(loss for loss in self.losses if loss.severity is LossSeverity.CONFIRMABLE)
