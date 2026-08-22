"""Material Codex JSONL mapping; raw stream remains provider-owned diagnostics."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
import json
import re
from typing import Iterable

from ..models import Ref, RefType
from ..projection import ExecutionProjection, Freshness, Outcome, Phase


@dataclass(frozen=True)
class CodexObservation:
    projection: ExecutionProjection
    refs: tuple[Ref, ...] = field(default_factory=tuple)
    diagnostic_summary: str | None = None


class CodexJsonlParser:
    provider_id = "codex-cli"
    _ANSI_CONTROL = re.compile(r"\x1b(?:\][^\x07]*(?:\x07|\x1b\\)|\[[0-?]*[ -/]*[@-~])")

    def parse(self, lines: Iterable[str], *, observed_at: datetime, returncode: int | None = None) -> CodexObservation:
        thread_id = None
        turn_started = turn_completed = turn_failed = False
        malformed = 0
        error_summary = None
        for line in lines:
            try:
                # A profile/bwrap launch may allocate a PTY. The native JSONL
                # facts are unchanged, but terminal mode sequences must not
                # make their enclosing line unparsable.
                event = json.loads(self._ANSI_CONTROL.sub("", line).strip())
            except json.JSONDecodeError:
                malformed += 1
                continue
            kind = event.get("type")
            if kind == "thread.started" and isinstance(event.get("thread_id"), str):
                thread_id = event["thread_id"]
            elif kind == "turn.started":
                turn_started = True
            elif kind == "turn.completed":
                turn_completed = True
            elif kind == "turn.failed":
                turn_failed = True
                error = event.get("error")
                if isinstance(error, dict) and isinstance(error.get("message"), str):
                    error_summary = error["message"][:256]
        refs = (Ref(RefType.SESSION, self.provider_id, thread_id),) if thread_id else ()
        if turn_completed:
            projection = ExecutionProjection(Phase.TERMINAL, Outcome.SUCCEEDED, bool(thread_id), Freshness.OBSERVED, observed_at)
        elif turn_failed:
            projection = ExecutionProjection(Phase.TERMINAL, Outcome.FAILED, bool(thread_id), Freshness.OBSERVED, observed_at)
        elif turn_started:
            projection = ExecutionProjection(Phase.ACTIVE, None, bool(thread_id) if thread_id else None, Freshness.OBSERVED, observed_at)
        else:
            freshness = Freshness.STALE if malformed or returncode is None else Freshness.UNREACHABLE
            projection = ExecutionProjection(Phase.UNKNOWN, None, None, freshness, observed_at)
        if returncode not in (None, 0) and not (turn_completed or turn_failed):
            projection = ExecutionProjection(Phase.UNKNOWN, None, None, Freshness.UNREACHABLE, observed_at)
            error_summary = error_summary or f"Codex process exited with code {returncode}"
        if malformed and error_summary is None:
            error_summary = f"ignored {malformed} malformed JSONL event(s)"
        return CodexObservation(projection, refs, error_summary)
