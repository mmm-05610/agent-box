"""State capture is a content-stability gate, not a size heuristic.

A capture reads the declared state subtree back into a checkpoint, so it must
only accept bytes that stopped changing. Comparing path and size is not enough:
a file whose content is rewritten with the same length looks stable, and a
capture that then reports a mixture of the two contents is worse than a failed
turn.

These tests drive the channel against an in-memory view that the Worker would
serve, so the churn is exact and the deadline is short.
"""
from __future__ import annotations

import base64
import hashlib
import time

import pytest

from agent_box.server.execution.sidecar import SidecarError, _WorkerChannels


PREFIX = "deployment/fixture/native-state"
STATE_FILE = f"{PREFIX}/state.db"


class FakeView:
    """A committed view the Worker would serve, with a mutable file set."""

    def __init__(self, files: dict[str, bytes] | None = None) -> None:
        self.files: dict[str, bytes] = dict(files or {})
        self.list_calls = 0
        self.get_calls = 0
        self.before_get = None

    def request(self, op, arguments=None, **_keywords):
        if op == "view.list":
            self.list_calls += 1
            return {"status": "listed", "files": [
                {"path": path, "size": len(content)}
                for path, content in sorted(self.files.items())
            ]}
        if op == "view.get":
            if self.before_get is not None:
                self.before_get(self)
            self.get_calls += 1
            path = arguments["path"]
            content = self.files[path]
            offset = int(arguments.get("offset", 0))
            maximum = int(arguments.get("maxLength", 32768))
            end = min(offset + maximum, len(content))
            return {
                "path": path, "offset": offset, "nextOffset": end, "totalBytes": len(content),
                "digest": "sha256:" + hashlib.sha256(content).hexdigest(),
                "data": base64.b64encode(content[offset:end]).decode(),
                "eof": end == len(content),
            }
        raise AssertionError(f"unexpected op {op}")


def channels(view: FakeView, **keywords) -> _WorkerChannels:
    return _WorkerChannels(
        view, "attempt-1", 1, "view-1",
        state_bundle_prefix=PREFIX,
        **keywords,
    )


def settle_and_capture(view: FakeView, *, deadline: float, interval: float = 0.01, **keywords):
    channel = channels(view, **keywords)
    return channel.capture_state(
        deadline_seconds=deadline, interval_seconds=interval,
    )


def test_a_same_size_rewrite_is_never_accepted_as_stable():
    """Two identical (path, size) listings, different bytes: not settled."""
    view = FakeView({STATE_FILE: b"aaaa"})
    state = {"round": 0}

    def churn(_view):
        # Every read sees a different four-byte content: the size never changes.
        state["round"] += 1
        view.files[STATE_FILE] = f"{state['round']:04d}".encode()

    view.before_get = churn
    started = time.monotonic()
    with pytest.raises(SidecarError) as refused:
        settle_and_capture(view, deadline=0.4)
    assert refused.value.code == "SIDECAR_STATE_NOT_SETTLED", refused.value
    assert time.monotonic() - started < 5, "the deadline must bound the wait"


def test_a_content_that_stops_changing_is_captured_with_its_final_bytes():
    view = FakeView({STATE_FILE: b"one"})
    view.before_get = lambda _view: view.files.__setitem__(STATE_FILE, b"final-state")
    captured = settle_and_capture(view, deadline=2.0)
    assert captured == {"state.db": b"final-state"}


def test_a_change_between_the_snapshots_only_delays_the_capture():
    """Churn while settling is fine; what is returned must be the settled bytes."""
    view = FakeView({STATE_FILE: b"a"})
    seen = {"count": 0}

    def churn(_view):
        seen["count"] += 1
        if seen["count"] <= 2:
            view.files[STATE_FILE] = b"b" * seen["count"]

    view.before_get = churn
    captured = settle_and_capture(view, deadline=2.0)
    digest = "sha256:" + hashlib.sha256(captured["state.db"]).hexdigest()
    assert digest == "sha256:" + hashlib.sha256(view.files[STATE_FILE]).hexdigest()
    assert seen["count"] > 2, "the churn must have happened before the capture"


def test_an_empty_state_settles_after_two_empty_snapshots():
    view = FakeView()
    assert settle_and_capture(view, deadline=1.0) == {}
    assert view.list_calls >= 2, "an empty state still needs two identical snapshots"


def test_a_protected_path_is_not_part_of_the_stability_snapshot():
    """Read-only configuration is not state: it can never block a capture."""
    view = FakeView({STATE_FILE: b"state", f"{PREFIX}/config.yaml": b"config"})
    counter = {"reads": 0}

    def churn(_view):
        counter["reads"] += 1
        view.files[f"{PREFIX}/config.yaml"] = f"cfg{counter['reads']}".encode()

    view.before_get = churn
    captured = settle_and_capture(view, deadline=1.0, protected_state_paths=("config.yaml",))
    assert captured == {"state.db": b"state"}
    assert "config.yaml" not in captured


def test_the_captured_bytes_must_match_the_snapshot_they_were_validated_against():
    """A rewrite that lands between validation and return cannot slip through."""
    view = FakeView({STATE_FILE: b"first"})
    captured = settle_and_capture(view, deadline=2.0)
    assert captured == {"state.db": b"first"}
    # The view changed afterwards; the returned bytes are the validated ones.
    view.files[STATE_FILE] = b"second"
    assert captured != {"state.db": b"second"}


def test_secret_scanning_and_bounds_still_apply():
    view = FakeView({STATE_FILE: b"state-with-secret"})
    view.files[STATE_FILE] = b"x" * 10 + b"fake-token-abc"
    with pytest.raises(SidecarError) as refused:
        settle_and_capture(view, deadline=1.0, forbidden_content=b"fake-token-abc")
    assert refused.value.code == "SIDECAR_STATE_CONTAINS_SECRET"

    oversized = FakeView({STATE_FILE: b"x" * (9 * 1024 * 1024)})
    with pytest.raises(SidecarError) as too_big:
        settle_and_capture(oversized, deadline=1.0)
    assert too_big.value.code == "SIDECAR_STATE_OUTSIDE_BOUNDS"
