"""Deterministic view failures survive the state-capture settle loop.

`_WorkerChannels._settled_state` keeps taking snapshots while the native state
subtree is still moving, so the set of codes it treats as "still moving" decides
whether a real refusal is reported or silently waited out. The defect this file
pins: the Worker reported every view problem with one code (`VIEW_INVALID`) and
the sidecar retried that code unconditionally, so a special file, a traversal
overflow or a file-count overflow all ended as `SIDECAR_STATE_NOT_SETTLED` after
the deadline - a verdict that names neither the cause nor the layer.

Two layers are held together here:

* which code each audited Worker site emits is proven by the Rust tests beside
  `list_view_files` in `workers/agent-box-worker/src/main.rs`. The
  source-contract tests below read that same file and take the codes from those
  audited sites, so the codes this file drives the loop with are the codes the
  Worker actually emits; none of them is invented here.
* the sidecar's classification is exercised by driving the real settle loop with
  those codes.

Audited Worker sites and their classification:

    list_view_files: special file (FIFO/socket/device)   deterministic refusal
    list_view_files: traversal bound (4096)              deterministic refusal
    list_view_files: file-count bound (1024)             deterministic refusal
    view.list:       file-count bound (1024)             deterministic refusal
    view.prepare:    manifest file-count bound (1024)    deterministic refusal
    view.get:        vanished / non-regular / oversize   refusal (vanish: churn)
    view.get:        file shrank under the read          live-state change
    view.get:        offset range malformed              deterministic refusal
    view.get:        plain read fault                    deterministic refusal
    view.list/get:   view not committed                  deterministic refusal
    view.commit:     incomplete file / digest mismatch   deterministic refusal

Nothing here matches English error text: the classification tests deliberately
cross a refusal's code with a live-state message, and a live-state code with a
refusal's message, to prove only the code decides.
"""
from __future__ import annotations

import base64
import hashlib
import os
import threading
import time
from functools import lru_cache
from pathlib import Path
import re

import pytest

from agent_box.server.execution.sidecar import (
    SidecarError, _STATE_TRANSIENT_CODES, _WorkerChannels,
)
from agent_box_runtime_wsl import WorkerError


REPO_ROOT = Path(__file__).resolve().parents[2]
WORKER_SOURCE_PATH = REPO_ROOT / "workers" / "agent-box-worker" / "src" / "main.rs"

PREFIX = "deployment/fixture/native-state"
STATE_FILE = f"{PREFIX}/state.db"

#: Error codes are the only string literals a Worker view site returns.
_CODE = re.compile(r'"([A-Z][A-Z0-9_]*)"')


# --------------------------------------------------------------------------
# The Worker's audited sites, read from its source.
# --------------------------------------------------------------------------

@lru_cache(maxsize=1)
def worker_source() -> str:
    return WORKER_SOURCE_PATH.read_text(encoding="utf-8")


def span(start: str, end: str) -> str:
    """The Worker source between two structural markers."""
    source = worker_source()
    start_index = source.find(start)
    assert start_index >= 0, f"the Worker no longer contains {start!r}"
    end_index = source.find(end, start_index + len(start))
    assert end_index > start_index, f"{start!r} is no longer followed by {end!r}"
    return source[start_index + len(start):end_index]


@lru_cache(maxsize=1)
def listing_span() -> str:
    return span("fn list_view_files(", "fn handle_secret(")


@lru_cache(maxsize=1)
def view_get_span() -> str:
    return span('"view.get" =>', '"view.cleanup" =>')


def code_after(text: str, marker: str, *, window: int = 300) -> str:
    """The first error code a site emits after a structural marker."""
    index = text.find(marker)
    assert index >= 0, f"no audited site matches {marker!r} any more"
    found = _CODE.search(text, index + len(marker), index + len(marker) + window)
    assert found is not None, f"no error code follows {marker!r}"
    return found.group(1)


def codes_after(text: str, marker: str, *, window: int = 300) -> list[str]:
    """Every error code emitted after every occurrence of a structural marker."""
    codes = []
    index = text.find(marker)
    while index >= 0:
        found = _CODE.search(text, index + len(marker), index + len(marker) + window)
        assert found is not None, f"no error code follows {marker!r}"
        codes.append(found.group(1))
        index = text.find(marker, index + len(marker))
    assert codes, f"the Worker no longer contains {marker!r}"
    return codes


#: The audited sites, named statically so a moved marker fails inside the test
#: that reads it instead of at collection time.
REFUSED_SITES = (
    "the traversal bound",
    "the file-count bound",
    "a special file",
    "a missing entry",
    "a shortened fetch",
)
MOVED_SITES = ("an entry that changed while being read",)


@lru_cache(maxsize=1)
def refused_sites() -> dict[str, str]:
    """The codes the Worker emits for each deterministic refusal."""
    return {
        "the traversal bound": code_after(worker_source(), "*visited > MAX_VIEW_TRAVERSAL_ENTRIES"),
        "the file-count bound": code_after(worker_source(), "files.push(json!"),
        "a special file": _last_code(listing_span()),
        "a missing entry": code_after(worker_source(), "std::io::ErrorKind::NotFound"),
        "a shortened fetch": code_after(view_get_span(), "offset > file.len()"),
    }


@lru_cache(maxsize=1)
def moved_sites() -> dict[str, str]:
    """The codes the Worker emits when the bytes moved underneath a read."""
    changed = set(codes_after(worker_source(), "bytes.len() as u64 > MAX_ARTIFACT_BYTES as u64"))
    assert len(changed) == 1, (
        f"every read-identity site must name the same kind of failure, saw {sorted(changed)}"
    )
    return {"an entry that changed while being read": changed.pop()}


def _last_code(text: str) -> str:
    found = _CODE.findall(text)
    assert found, "no error code in the listing function"
    return found[-1]


def settled_codes() -> set[str]:
    """Every code the audited moved-sites emit."""
    return set(moved_sites().values())


# --------------------------------------------------------------------------
# A view the Worker would serve, scripted to fail exactly as it does.
# --------------------------------------------------------------------------

class ScriptedView:
    """Serves a committed view, and can fail chosen calls with typed codes."""

    def __init__(self, files: dict[str, bytes] | None = None) -> None:
        self.files: dict[str, bytes] = dict(files or {})
        self.list_failures: list[BaseException] = []
        self.get_failures: list[BaseException] = []
        self.list_calls = 0
        self.get_calls = 0

    def request(self, op, arguments=None, **_keywords):
        if op == "view.list":
            self.list_calls += 1
            if self.list_failures:
                raise self.list_failures.pop(0)
            return {"status": "listed", "files": [
                {"path": path, "size": len(content)}
                for path, content in sorted(self.files.items())
            ]}
        if op == "view.get":
            self.get_calls += 1
            if self.get_failures:
                raise self.get_failures.pop(0)
            content = self.files[arguments["path"]]
            offset = int(arguments.get("offset", 0))
            maximum = int(arguments.get("maxLength", 32768))
            end = min(offset + maximum, len(content))
            return {
                "path": arguments["path"], "offset": offset, "nextOffset": end,
                "totalBytes": len(content),
                "digest": "sha256:" + hashlib.sha256(content).hexdigest(),
                "data": base64.b64encode(content[offset:end]).decode(),
                "eof": end == len(content),
            }
        raise AssertionError(f"unexpected op {op}")


def channels(view: ScriptedView, **keywords) -> _WorkerChannels:
    return _WorkerChannels(
        view, "attempt-1", 1, "view-1",
        state_bundle_prefix=PREFIX,
        **keywords,
    )


def settle(view: ScriptedView, *, deadline: float = 2.0, interval: float = 0.01, **keywords):
    return channels(view, **keywords).capture_state(
        deadline_seconds=deadline, interval_seconds=interval,
    )


def refusal(code: str, message: str = "a view failure the Worker reports") -> WorkerError:
    return WorkerError(code, message)


# --------------------------------------------------------------------------
# 1 + 2: deterministic refusals are reported at once, with their own code.
# --------------------------------------------------------------------------

@pytest.mark.parametrize("site", REFUSED_SITES)
def test_a_deterministic_refusal_is_reported_at_once_with_its_own_code(site):
    """Immediately, unrewritten, and without waiting the settle deadline out."""
    code = refused_sites()[site]
    view = ScriptedView({STATE_FILE: b"state"})
    view.list_failures = [refusal(code)]
    started = time.monotonic()
    with pytest.raises(WorkerError) as refused:
        settle(view, deadline=2.0)
    elapsed = time.monotonic() - started
    assert refused.value.code == code, (
        f"{site} must reach the caller as {code}, not as {refused.value.code}"
    )
    assert refused.value.code != "SIDECAR_STATE_NOT_SETTLED"
    assert elapsed < 0.5, f"{site} waited for the deadline instead of failing"
    assert view.list_calls == 1, "a deterministic refusal must not be retried"


def test_each_deterministic_refusal_names_its_own_reason():
    """One shared code for every refusal is what made them all look transient."""
    codes = refused_sites()
    assert len(set(codes.values())) == len(codes), (
        f"these sites collapse onto the same code: {codes}"
    )


# --------------------------------------------------------------------------
# 3: a generic view failure is no longer unconditionally transient.
# --------------------------------------------------------------------------

def test_a_generic_view_invalid_is_not_retried():
    view = ScriptedView({STATE_FILE: b"state"})
    view.list_failures = [refusal("VIEW_INVALID")]
    with pytest.raises(WorkerError) as refused:
        settle(view, deadline=2.0)
    assert refused.value.code == "VIEW_INVALID"
    assert view.list_calls == 1


@pytest.mark.parametrize("code", ["VIEW_IO", "VIEW_INCOMPLETE", "VIEW_DIGEST_MISMATCH"])
def test_an_audited_deterministic_code_is_not_retried(code):
    """Each of these was audited site by site; none of them means "still moving"."""
    view = ScriptedView({STATE_FILE: b"state"})
    view.get_failures = [refusal(code)]
    with pytest.raises(WorkerError) as refused:
        settle(view, deadline=2.0)
    assert refused.value.code == code
    assert view.list_calls == 1, "a deterministic refusal must not be retried"


# --------------------------------------------------------------------------
# 4: genuine live-state change still retries, within bounds.
# --------------------------------------------------------------------------

@pytest.mark.parametrize("site", MOVED_SITES)
def test_a_live_state_change_is_retried_and_ends_bounded(site):
    code = moved_sites()[site]
    view = ScriptedView({STATE_FILE: b"state"})
    view.list_failures = [refusal(code) for _ in range(1000)]
    started = time.monotonic()
    with pytest.raises(SidecarError) as refused:
        settle(view, deadline=0.3, interval=0.05)
    assert refused.value.code == "SIDECAR_STATE_NOT_SETTLED", refused.value
    assert view.list_calls >= 3, "a moving subtree must be re-read, not abandoned"
    assert time.monotonic() - started < 3, "the deadline must bound the wait"


def test_a_missing_state_file_is_retried_through_its_identity_conflict():
    """The Worker refuses a missing path deterministically; the capture - which
    just listed the path - is the layer that knows it is churn, so it retries
    its own identity conflict and only ever reports the bounded verdict."""
    code = refused_sites()["a missing entry"]
    view = ScriptedView({STATE_FILE: b"state"})
    view.get_failures = [refusal(code) for _ in range(1000)]
    with pytest.raises(SidecarError) as refused:
        settle(view, deadline=0.3, interval=0.05)
    assert refused.value.code == "SIDECAR_STATE_NOT_SETTLED", refused.value
    assert view.get_calls >= 3, "a listed file that vanished must be re-read, not abandoned"

    brief = ScriptedView({STATE_FILE: b"state"})
    brief.get_failures = [refusal(code)]
    assert settle(brief, deadline=2.0) == {"state.db": b"state"}


def test_a_file_truncated_between_chunks_is_retried_and_never_mixed():
    """A genuine shortening mid-read surfaces in the chunk identity checks and
    the capture converges on the settled bytes - never a mixture of the two
    moments, and never a Worker guess about who is to blame for an offset."""
    # The file must span more than one fetch, so the truncation lands on a
    # chunk the caller reads after the first one.
    view = ScriptedView({STATE_FILE: b"x" * 40_000})
    original = view.request

    def truncate_on_second_chunk(op, arguments=None, **keywords):
        if op == "view.get" and int(arguments.get("offset", 0)) > 0:
            view.files[STATE_FILE] = b"short"
        return original(op, arguments, **keywords)

    view.request = truncate_on_second_chunk
    captured = settle(view, deadline=2.0)
    assert captured == {"state.db": b"short"}, captured
    assert captured["state.db"] == view.files[STATE_FILE]
    assert view.get_calls >= 3, "the truncated read must have been retried"


def test_an_unknown_code_fails_closed():
    """A code this generation does not know is a refusal and is never retried."""
    view = ScriptedView({STATE_FILE: b"state"})
    view.list_failures = [refusal("VIEW_UNSPECIFIED_FUTURE")]
    with pytest.raises(WorkerError) as refused:
        settle(view, deadline=2.0)
    assert refused.value.code == "VIEW_UNSPECIFIED_FUTURE"
    assert view.list_calls == 1


# --------------------------------------------------------------------------
# 6: the code decides, never the English message.
# --------------------------------------------------------------------------

def test_the_classification_never_reads_the_error_message():
    """Codes and messages are crossed in both directions on purpose."""
    live = moved_sites()["an entry that changed while being read"]
    deterministic = refused_sites()["a special file"]
    view = ScriptedView({STATE_FILE: b"state"})
    # A refusal's wording on a live-state code: still retried, still bounded.
    view.list_failures = [refusal(live, "view contains a special file") for _ in range(1000)]
    with pytest.raises(SidecarError) as retried:
        settle(view, deadline=0.3, interval=0.05)
    assert retried.value.code == "SIDECAR_STATE_NOT_SETTLED"
    assert view.list_calls >= 3

    # A live-state wording on a refusal's code: reported at once, unrewritten.
    other = ScriptedView({STATE_FILE: b"state"})
    other.list_failures = [refusal(
        deterministic, "the native state subtree did not stop changing before the deadline",
    )]
    with pytest.raises(WorkerError) as refused:
        settle(other, deadline=2.0)
    assert refused.value.code == deterministic
    assert other.list_calls == 1


# --------------------------------------------------------------------------
# 5: credentials and bounds still hard-fail at once.
# --------------------------------------------------------------------------

def test_a_credential_in_native_state_still_fails_at_once():
    view = ScriptedView({STATE_FILE: b"x" * 8 + b"fake-token-abc"})
    started = time.monotonic()
    with pytest.raises(SidecarError) as refused:
        settle(view, deadline=2.0, forbidden_content=b"fake-token-abc")
    assert refused.value.code == "SIDECAR_STATE_CONTAINS_SECRET"
    assert time.monotonic() - started < 0.5
    assert view.list_calls == 1


def test_state_bounds_still_fail_at_once():
    oversized = ScriptedView({STATE_FILE: b"x" * (9 * 1024 * 1024)})
    started = time.monotonic()
    with pytest.raises(SidecarError) as too_big:
        settle(oversized, deadline=2.0)
    assert too_big.value.code == "SIDECAR_STATE_OUTSIDE_BOUNDS"
    assert time.monotonic() - started < 0.5
    assert oversized.list_calls == 1

    crowded = ScriptedView({f"{PREFIX}/f{index:03d}": b"x" for index in range(257)})
    with pytest.raises(SidecarError) as too_many:
        settle(crowded, deadline=2.0)
    assert too_many.value.code == "SIDECAR_STATE_OUTSIDE_BOUNDS"
    assert crowded.list_calls == 1


# --------------------------------------------------------------------------
# The contract between the two layers.
# --------------------------------------------------------------------------

def test_only_a_live_state_change_is_retried():
    """The allowlist is exactly the moved-bytes codes, and nothing else."""
    assert _STATE_TRANSIENT_CODES == {
        "SIDECAR_STATE_IDENTITY_CONFLICT",  # raised here: size/offset/digest moved
    } | settled_codes(), sorted(_STATE_TRANSIENT_CODES)


def test_no_deterministic_refusal_is_retried():
    assert set(refused_sites().values()) & _STATE_TRANSIENT_CODES == set(), (
        "a refusal the Worker reports must never be waited out as churn"
    )


def test_every_retried_code_has_a_producer():
    """Nothing is retried on the strength of a code no layer emits."""
    sidecar_source = (
        REPO_ROOT / "src" / "agent_box" / "server" / "execution" / "sidecar.py"
    ).read_text(encoding="utf-8")
    for code in sorted(_STATE_TRANSIENT_CODES):
        assert f'"{code}"' in worker_source() or f'"{code}"' in sidecar_source, (
            f"{code} is retried but no layer emits it"
        )


# --------------------------------------------------------------------------
# The same contract, driven end to end through a real Worker process.
# --------------------------------------------------------------------------

WORKER = REPO_ROOT / "workers" / "agent-box-worker" / "target" / "debug" / "agent-box-worker"
WORKER_SOURCES = (
    REPO_ROOT / "workers" / "agent-box-worker" / "src" / "main.rs",
    REPO_ROOT / "workers" / "agent-box-worker" / "src" / "protocol.rs",
)
VIEW_ID = "boundary-view"


def require_worker() -> None:
    """The real Worker this file's codes come from, built from this source."""
    if not WORKER.is_file():
        pytest.skip(f"build the Worker first: cargo build ({WORKER})")
    stale = [path.name for path in WORKER_SOURCES if path.stat().st_mtime > WORKER.stat().st_mtime]
    assert not stale, f"the Worker binary is older than {stale}; run cargo build"


def real_worker(worker_tmp_path: Path):
    """A started Worker whose root the test can also inspect directly."""
    from agent_box_runtime_wsl import WorkerClient

    root = worker_tmp_path / "worker-root"
    client = WorkerClient(
        [str(WORKER), "--root", str(root)],
        worker_digest="sha256:" + hashlib.sha256(WORKER.read_bytes()).hexdigest(),
        worker_version="0.1.0", connection_id="boundary", project_id="boundary",
        effective_user=os.environ["USER"], server_instance_id="boundary",
    )
    client.start()
    return client, root


def prepare_state_view(client) -> Path:
    """A committed view with one regular file inside the state subtree."""
    content = b'{"native":"state"}'
    digest_value = "sha256:" + hashlib.sha256(content).hexdigest()
    assert client.request("view.prepare", {"viewId": VIEW_ID, "files": [
        {"path": f"{PREFIX}/state.db", "digest": digest_value, "size": len(content)},
    ]})["status"] == "prepared"
    client.request("view.put", {
        "viewId": VIEW_ID, "path": f"{PREFIX}/state.db", "offset": 0,
        "data": base64.b64encode(content).decode(),
    })
    assert client.request("view.commit", {"viewId": VIEW_ID})["status"] == "ready"
    return content


def test_a_real_worker_names_every_view_failure_the_capture_classifies(tmp_path):
    """Real process, real frames: the codes are not a fixture's invention."""
    require_worker()
    client, root = real_worker(tmp_path)
    try:
        content = prepare_state_view(client)
        ready = root / "views" / VIEW_ID / "ready"

        # A regular file: listed and readable, exactly as the capture expects.
        listed = client.request("view.list", {"viewId": VIEW_ID})["files"]
        assert [item["path"] for item in listed] == [f"{PREFIX}/state.db"]
        assert base64.b64decode(client.request("view.get", {
            "viewId": VIEW_ID, "path": f"{PREFIX}/state.db",
        })["data"]) == content

        # A FIFO inside the state subtree: one typed refusal for the listing.
        pipe = ready / PREFIX / "pipe"
        os.mkfifo(pipe)
        with pytest.raises(WorkerError) as special:
            client.request("view.list", {"viewId": VIEW_ID})
        assert special.value.code == refused_sites()["a special file"]
        pipe.unlink()

        # More regular files than the contract lists: its own code. The declared
        # manifest cannot carry this case through a bounded frame, so the bound
        # is exercised where a capture meets it, on the listing.
        extra = [ready / f"f{index:04}" for index in range(1025)]
        for path in extra:
            path.write_bytes(b"x")
        with pytest.raises(WorkerError) as crowded:
            client.request("view.list", {"viewId": VIEW_ID})
        assert crowded.value.code == refused_sites()["the file-count bound"]
        for path in extra:
            path.unlink()

        # A file that vanished between the listing and the read: the Worker
        # refuses deterministically (it cannot know the caller saw it); the
        # capture converts that refusal for a listed path.
        listed = client.request("view.list", {"viewId": VIEW_ID})["files"]
        assert listed, "the state file must be listed before it is read"
        (ready / PREFIX / "state.db").unlink()
        with pytest.raises(WorkerError) as vanished:
            client.request("view.get", {"viewId": VIEW_ID, "path": f"{PREFIX}/state.db"})
        assert vanished.value.code == refused_sites()["a missing entry"]

        # A first fetch past the end is an invalid request, never churn.
        (ready / PREFIX / "state.db").write_bytes(content)
        with pytest.raises(WorkerError) as shrunk:
            client.request("view.get", {
                "viewId": VIEW_ID, "path": f"{PREFIX}/state.db",
                "offset": len(content) + 16,
            })
        assert shrunk.value.code == refused_sites()["a shortened fetch"]

        # The classification the capture applies to exactly these codes.
        assert moved_sites()["an entry that changed while being read"] in _STATE_TRANSIENT_CODES
        assert set(refused_sites().values()) - _STATE_TRANSIENT_CODES == set(refused_sites().values())
    finally:
        client.close()


def test_a_real_worker_capture_fails_at_once_or_waits_for_a_settled_subtree(tmp_path):
    """The settle loop over a real Worker: a refusal now, a settled read later."""
    require_worker()
    client, root = real_worker(tmp_path)
    try:
        content = prepare_state_view(client)
        ready = root / "views" / VIEW_ID / "ready"
        channel = _WorkerChannels(
            client, "attempt-1", 1, VIEW_ID, state_bundle_prefix=PREFIX,
        )

        # A special file in the state subtree is not something to wait out.
        pipe = ready / PREFIX / "pipe"
        os.mkfifo(pipe)
        started = time.monotonic()
        with pytest.raises(WorkerError) as refused:
            channel.settle_state(deadline_seconds=2.0, interval_seconds=0.05)
        assert refused.value.code == refused_sites()["a special file"]
        assert time.monotonic() - started < 0.5
        pipe.unlink()

        # A subtree that is still being written settles into its final bytes.
        def churn() -> None:
            for round_number in range(6):
                (ready / PREFIX / "state.db").write_bytes(f'{{"round":{round_number}}}'.encode())
                time.sleep(0.03)

        writer = threading.Thread(target=churn)
        writer.start()
        captured = channel.capture_state(deadline_seconds=5.0, interval_seconds=0.05)
        writer.join()
        assert captured == {"state.db": (ready / PREFIX / "state.db").read_bytes()}
        assert captured["state.db"] != content, "the capture must be the settled bytes"
    finally:
        client.close()
