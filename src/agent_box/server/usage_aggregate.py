"""Order 53: usage aggregation over the turn ledger — real numbers only.

The aggregate answers "how many tokens did this session (or this time range)
consume" strictly from what the families' own stores reported through the
completion boundary (``server_turns.usage_*_tokens``). A turn whose family
reported nothing is counted as *unknown*, never as zero; a session with no
reported turns aggregates to an explicitly-unknown result. No estimation, no
defaults, no cross-session leakage: every query is scoped by session ids the
caller already has.
"""
from __future__ import annotations

import json
from typing import Any

from ..storage.database import Database


class UsageAggregator:
    """Read-only usage aggregation over completed turns."""

    def __init__(self, database: Database) -> None:
        self.database = database

    def aggregate_by_session(self, session_ids: list[str]) -> dict[str, Any]:
        """Per-session usage sums with honest unknown accounting.

        Returns one entry per session id: reported token sums, the count of
        turns that reported usage, the count that did not (unknown), and the
        session-level latest usage the ledger already carries. Sessions with
        no reported turns show ``totalTokens: None`` — unknown, not zero.
        """
        result: dict[str, Any] = {}
        if not session_ids:
            return result
        with self.database.read() as conn:
            for session_id in session_ids:
                rows = conn.execute(
                    "SELECT usage_input_tokens AS i, usage_output_tokens AS o, "
                    "usage_total_tokens AS t, usage_source AS src "
                    "FROM server_turns WHERE session_id=? AND state='completed' "
                    "AND usage_input_tokens IS NOT NULL",
                    (session_id,),
                ).fetchall()
                unknown_turns = conn.execute(
                    "SELECT COUNT(*) FROM server_turns WHERE session_id=? "
                    "AND state='completed' AND usage_input_tokens IS NULL",
                    (session_id,),
                ).fetchone()[0]
                latest = conn.execute(
                    "SELECT latest_usage FROM server_sessions WHERE id=?",
                    (session_id,),
                ).fetchone()
                reported = len(rows)

                latest_usage = None
                if latest and latest[0]:
                    try:
                        latest_usage = json.loads(latest[0])
                    except ValueError:
                        latest_usage = None
                if reported == 0:
                    # No reported turns: the honest answer is unknown, not a
                    # zero that would read as "measured nothing".
                    result[session_id] = {
                        "inputTokens": None, "outputTokens": None,
                        "totalTokens": None, "turnsReported": 0,
                        "turnsUnknown": unknown_turns,
                        "latestUsage": latest_usage,
                    }
                else:
                    result[session_id] = {
                        "inputTokens": sum(r["i"] or 0 for r in rows),
                        "outputTokens": sum(r["o"] or 0 for r in rows),
                        "totalTokens": sum(r["t"] or 0 for r in rows),
                        "turnsReported": reported,
                        "turnsUnknown": unknown_turns,
                        "latestUsage": latest_usage,
                    }
        return result


__all__ = ["UsageAggregator"]
