"""WS transport helper: durable-store replay plus in-process notifications.

Business assumptions stay out: the helper works over any store exposing
``transcript``/``assert_replay_cursor``/``watermark``.  The durable ledger —
not an in-memory ring buffer — is always the replay source of truth; the
notification hub only avoids polling latency within one process.
"""
from __future__ import annotations

import asyncio
import threading
from typing import Any, Optional


class SessionEventStream:
    def __init__(self, store: Any, *, poll_seconds: float = 1.0) -> None:
        self._store = store
        self._poll_seconds = poll_seconds
        self._lock = threading.Lock()
        self._subs: dict[str, dict[int, asyncio.Queue]] = {}
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._next_token = 0

    def attach_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def notify(self, session_id: str) -> None:
        """Wake subscribers of one session (thread-safe, best-effort)."""
        loop = self._loop
        with self._lock:
            targets = list(self._subs.get(session_id, {}).values())
        if not targets:
            return
        if loop is not None and loop.is_running():
            loop.call_soon_threadsafe(self._deliver, targets)
        else:
            self._deliver(targets)

    @staticmethod
    def _deliver(targets: list[asyncio.Queue]) -> None:
        for queue in targets:
            queue.put_nowait("events")

    def subscribe(self, session_id: str) -> tuple[int, asyncio.Queue]:
        queue: asyncio.Queue = asyncio.Queue()
        with self._lock:
            self._next_token += 1
            token = self._next_token
            self._subs.setdefault(session_id, {})[token] = queue
        return token, queue

    def unsubscribe(self, session_id: str, token: int) -> None:
        with self._lock:
            subscribers = self._subs.get(session_id)
            if subscribers is not None:
                subscribers.pop(token, None)
                if not subscribers:
                    self._subs.pop(session_id, None)

    def replay_batch(self, session_id: str, after_seq: int) -> dict[str, Any]:
        """Validated replay read straight from the durable ledger.

        Strict gate: a reconnecting consumer claiming a position beyond the
        committed watermark must resync.
        """
        watermark = self._store.assert_replay_cursor(session_id, after_seq)
        events = self._store.transcript(session_id, after_seq=after_seq)
        return {
            "events": [_event_payload(event) for event in events],
            "watermark": watermark,
        }

    def tail_batch(self, session_id: str, after_seq: int) -> dict[str, Any]:
        """Live-tail read from the ledger.

        Deliberately not gated by the committed watermark: a live consumer
        may legitimately observe in-flight events of a running turn.  If the
        turn never commits, the consumer's next *reconnect* hits the strict
        replay gate and resyncs — the ledger stays the only authority.
        """
        events = self._store.transcript(session_id, after_seq=after_seq)
        return {"events": [_event_payload(event) for event in events]}


def _event_payload(event: Any) -> dict[str, Any]:
    return {
        "seq": event.seq,
        "event_id": event.event_id,
        "event_type": event.event_type,
        "turn_id": event.turn_id,
        "execution_id": event.execution_id,
        "payload": dict(event.payload),
        "terminal": bool(event.terminal),
        "created_at": event.created_at.isoformat() if event.created_at else None,
    }


async def stream_session_events(
    websocket: Any,
    stream: SessionEventStream,
    session_id: str,
    after_seq: int,
) -> None:
    """Serve one resumable event stream until the client disconnects.

    Replay first, then live tailing.  Every batch is read from the durable
    store; the notification queue only controls when we look again.  Bad
    cursors produce a typed ``resync_required`` message, never silence.
    """
    import json

    from agent_box.protocols.session.failures import (
        InvalidCursor,
        ResyncRequired,
        SessionError,
    )

    token, queue = stream.subscribe(session_id)
    cursor = after_seq
    try:
        try:
            batch = stream.replay_batch(session_id, cursor)
        except ResyncRequired as exc:
            await websocket.send_text(
                json.dumps({
                    "type": "resync_required",
                    "reason": exc.reason,
                    "current_watermark": exc.current_watermark,
                })
            )
            await websocket.close(code=4409)
            return
        except InvalidCursor as exc:
            await websocket.send_text(
                json.dumps({"type": "invalid_cursor", "reason": str(exc)})
            )
            await websocket.close(code=4410)
            return
        except SessionError as exc:
            await websocket.send_text(
                json.dumps({"type": "session_error", "reason": str(exc)})
            )
            await websocket.close(code=4404)
            return
        cursor = max(
            cursor,
            max((event["seq"] for event in batch["events"]), default=after_seq),
        )
        await websocket.send_text(
            json.dumps({"type": "replay", **batch}, ensure_ascii=False)
        )
        while True:
            try:
                await asyncio.wait_for(queue.get(), timeout=stream._poll_seconds)
            except asyncio.TimeoutError:
                pass
            batch = stream.tail_batch(session_id, cursor)
            if batch["events"]:
                cursor = max(
                    cursor,
                    max(event["seq"] for event in batch["events"]),
                )
                await websocket.send_text(
                    json.dumps({"type": "events", **batch}, ensure_ascii=False)
                )
    except Exception:
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
        return
    finally:
        stream.unsubscribe(session_id, token)
