from datetime import datetime, timezone

from agent_box.work_core.projection import Freshness, Outcome, Phase
from agent_box.work_core.providers.codex_jsonl import CodexJsonlParser


NOW = datetime(2026, 8, 21, tzinfo=timezone.utc)


def test_discovers_thread_and_maps_completed_turn_without_transcript():
    observed = CodexJsonlParser().parse([
        '{"type":"thread.started","thread_id":"thread-1"}',
        '{"type":"turn.started"}',
        '{"type":"item.completed","item":{"text":"not persisted"}}',
        '{"type":"turn.completed"}',
    ], observed_at=NOW, returncode=0)
    assert observed.refs[0].native_id == "thread-1"
    assert (observed.projection.phase, observed.projection.outcome, observed.projection.resumable_now) == (Phase.TERMINAL, Outcome.SUCCEEDED, True)
    assert not hasattr(observed, "transcript")


def test_maps_failed_turn_and_malformed_or_process_failure_without_fabrication():
    failed = CodexJsonlParser().parse(['{"type":"thread.started","thread_id":"thread-1"}', '{"type":"turn.failed","error":{"message":"quota"}}'], observed_at=NOW, returncode=1)
    assert (failed.projection.phase, failed.projection.outcome, failed.diagnostic_summary) == (Phase.TERMINAL, Outcome.FAILED, "quota")
    malformed = CodexJsonlParser().parse(["not json"], observed_at=NOW)
    assert malformed.projection.freshness is Freshness.STALE
    process_failure = CodexJsonlParser().parse([], observed_at=NOW, returncode=2)
    assert (process_failure.projection.phase, process_failure.projection.freshness) == (Phase.UNKNOWN, Freshness.UNREACHABLE)


def test_accepts_jsonl_wrapped_by_pty_control_sequences():
    observed = CodexJsonlParser().parse([
        '\x1b[?2004h{"type":"thread.started","thread_id":"thread-pty"}\x1b[?2004l',
        '{"type":"turn.completed"}',
    ], observed_at=NOW, returncode=0)
    assert observed.refs[0].native_id == "thread-pty"
    assert observed.projection.outcome is Outcome.SUCCEEDED
