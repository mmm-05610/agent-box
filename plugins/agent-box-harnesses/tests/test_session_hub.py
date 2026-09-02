"""ObservationHub: seq monotonicity, same-boundary writes, bounds, replay,
snapshot resync, terminal-once, permission-once, secret rejection."""
from __future__ import annotations

import threading

import pytest

from agent_box_harnesses.session.hub import HubPollResult, ObservationHub
from agent_box_harnesses.adapters.observation import (
    Observation, ObservationKind, TerminalCondition, bounded_native,
)


def message(text: str = "hi") -> Observation:
    return Observation(ObservationKind.MESSAGE, "opencode", text=text)


def terminal(condition: TerminalCondition = TerminalCondition.TURN_COMPLETED) -> Observation:
    return Observation(ObservationKind.TERMINAL, "opencode", terminal_condition=condition)


def permission_result() -> Observation:
    return Observation(ObservationKind.PERMISSION_RESULT, "opencode", text="allowed")


def test_seq_is_monotonic_and_assigned_at_push_boundary():
    hub = ObservationHub()
    first = hub.push(message("a"))
    second = hub.push(message("b"))
    assert first.seq == 1 and second.seq == 2
    assert hub.snapshot().seq == 2


def test_concurrent_push_assigns_unique_seq_under_one_lock():
    hub = ObservationHub()
    sequences: list[int] = []

    def writer(text):
        for index in range(50):
            entry = hub.push(message(f"{text}-{index}"))
            if entry is not None:
                sequences.append(entry.seq)

    threads = [threading.Thread(target=writer, args=(f"t{n}",)) for n in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert len(sequences) == 200
    assert len(set(sequences)) == 200
    assert sequences == sorted(sequences)


def test_bounded_memory_queue_evicts_oldest_with_diagnostic():
    hub = ObservationHub(max_events=8)
    for index in range(20):
        hub.push(message(str(index)))
    snapshot = hub.snapshot()
    assert snapshot.count <= 8
    assert "RING_BUFFER_EVICTED" in hub.diagnostics()
    # cursor before the retained window -> explicit resync, not partial replay
    result = hub.poll(last_seq=0)
    assert result.resync is True
    assert result.snapshot is not None


def test_in_window_replay_and_gap_resync():
    hub = ObservationHub(max_events=4)
    for index in range(8):
        hub.push(message(str(index)))
    result = hub.poll(last_seq=6)
    assert result.resync is False
    assert [item.seq for item in result.entries] == [7, 8]
    result = hub.poll(last_seq=3)  # cursor fell out of the retained window
    assert result.resync is True
    assert result.snapshot is not None


def test_terminal_observation_can_only_produce_once():
    hub = ObservationHub()
    assert hub.push(terminal()) is not None
    assert hub.terminal_seen
    assert hub.push(terminal()) is None
    assert "TERMINAL_DUPLICATE_REJECTED" in hub.diagnostics()


def test_permission_completes_exactly_once():
    hub = ObservationHub()
    assert hub.register_permission_open("perm-1")
    assert not hub.register_permission_open("perm-1")
    assert hub.push(permission_result(), permission_request_id="perm-1") is not None
    assert hub.push(permission_result(), permission_request_id="perm-1") is None
    assert "PERMISSION_DUPLICATE_REJECTED" in hub.diagnostics()


def test_secret_shaped_observation_rejected_fail_closed():
    hub = ObservationHub()
    leak = Observation(
        ObservationKind.MESSAGE, "opencode",
        text="key is sk-ABCDEF0123456789abcdef0123456789",
    )
    assert hub.push(leak) is None
    assert hub.snapshot().count == 0
    assert any(item.startswith("SECRET_SHAPED_OBSERVATION_REJECTED") for item in hub.diagnostics())


def test_native_payload_with_secret_shape_rejected():
    hub = ObservationHub()
    leak = Observation(
        ObservationKind.UNKNOWN, "opencode",
        native=bounded_native("opencode.leak@1", {"token": "ghp_" + "A" * 24}),
    )
    assert hub.push(leak) is None


def test_oversized_event_rejected_by_byte_bound():
    hub = ObservationHub(max_bytes=4096)
    big = Observation(ObservationKind.MESSAGE, "opencode", text="x" * 6000)
    assert hub.push(big) is None
    assert hub.snapshot().count == 0
    assert "EVENT_TOO_LARGE_REJECTED" in hub.diagnostics()


def test_snapshot_surfaces_kinds_open_permissions_and_terminal():
    hub = ObservationHub()
    hub.push(message("a"))
    hub.register_permission_open("perm-9")
    hub.push(terminal())
    snapshot = hub.snapshot()
    assert snapshot.terminal_condition == "turn_completed"
    assert snapshot.permission_open == 1
    assert "message" in snapshot.kinds and "terminal" in snapshot.kinds