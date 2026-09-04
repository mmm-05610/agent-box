"""Neutral, versioned launch-selection dispatch input.

Carries the caller's requested launch mode for one Execution.  The target
ExecutionProvider validates the mode against its own registry-declared
launch modes and fails closed on an undeclared value; absence of this
input means the provider's declared default mode.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import ClassVar

_MODE = re.compile(r"^[a-z][a-z0-9_-]{0,31}$")


@dataclass(frozen=True)
class LaunchSelectionV1:
    contract_id: ClassVar[str] = "agent-box.launch-selection@1"

    mode: str

    def __post_init__(self) -> None:
        if not isinstance(self.mode, str) or not _MODE.fullmatch(self.mode):
            raise ValueError("launch selection mode must be a short lowercase identifier")
