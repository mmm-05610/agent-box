"""Codex provider boundary; it exposes no Codex state to Work Core."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable

from ..registry import ProviderDescriptor
from .codex_jsonl import CodexJsonlParser, CodexObservation
from .codex_launch import CodexLaunchFacade, CodexLaunchRequest, ManagedCodexProcess


class CodexExecutionProvider:
    def __init__(self, launch: CodexLaunchFacade | None = None, parser: CodexJsonlParser | None = None) -> None:
        self._launch = launch or CodexLaunchFacade()
        self._parser = parser or CodexJsonlParser()

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor("codex-cli", "Codex CLI", "jsonl-v1")

    def capabilities(self):
        return {"start": "supported", "observe": "supported", "resume": "supported", "cancel": "emulated", "stream": "supported"}

    def start(self, request: CodexLaunchRequest) -> ManagedCodexProcess:
        return self._launch.start(request)

    def resume(self, request: CodexLaunchRequest) -> ManagedCodexProcess:
        """Resume request already carries the original native thread id."""
        return self._launch.start(request)

    def observe(self, native_ref) -> CodexObservation:
        # Codex CLI has no documented standalone non-interactive query by thread id.
        # Absence of a live stream must remain unknown/unreachable rather than guessed.
        return self._parser.parse((), observed_at=datetime.now(timezone.utc), returncode=1)

    def parse_stream(self, lines: Iterable[str], *, returncode: int | None = None) -> CodexObservation:
        return self._parser.parse(lines, observed_at=datetime.now(timezone.utc), returncode=returncode)
