"""Pi Continuation Contract: a provider-owned native session identity."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
from typing import ClassVar

# Mirrors Pi's SESSION_ID_PATTERN (alphanumerics, '-', '_', '.' only).
_SESSION_ID = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$")


@dataclass(frozen=True)
class PiContinuationV1:
    """Frozen identity of an existing native Pi session resumed by a new Core Execution.

    This is a Pi-plugin Contract, not an Agent-Box Core type.  The provider
    resumes the native session inside a completely new Core Execution/Dispatch;
    it never reopens a terminal Core Execution.
    """

    contract_id: ClassVar[str] = "agent-box-pi.continuation@1"

    session_id: str
    session_file: str | None = None
    provider: str = "deepseek"
    model: str = ""
    session_file_digest: str = ""

    def __post_init__(self) -> None:
        if not isinstance(self.session_id, str) or not _SESSION_ID.fullmatch(
            self.session_id
        ):
            raise ValueError(f"invalid Pi session_id: {self.session_id!r}")
        if self.provider != "deepseek":
            raise ValueError(
                "Pi Continuation only supports the DeepSeek provider; "
                f"got {self.provider!r}"
            )
        if self.session_file is not None:
            path = Path(self.session_file)
            if not path.is_absolute():
                raise ValueError("Pi continuation session_file must be absolute")
            object.__setattr__(self, "session_file", str(path))
        if self.session_file_digest and not self.session_file_digest.startswith(
            "sha256:"
        ):
            raise ValueError("Pi continuation digest must be a sha256 digest")

    @property
    def session_path(self) -> Path | None:
        return Path(self.session_file) if self.session_file else None