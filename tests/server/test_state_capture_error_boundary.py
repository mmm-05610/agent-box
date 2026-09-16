"""Typed Worker failures the audit and view paths can meet, named at both layers.

Under the native-home model the old capture settle loop is gone (design §12:
settle races degrade into audit facts), so this file now pins the contract that
remains, at both layers:

* which code each audited Worker site emits is proven by the Rust tests beside
  `list_view_files` and `handle_home` in `workers/agent-box-worker/src/main.rs`.
  The source-contract tests below read that same file and take the codes from
  those audited sites, so no code here is invented.
* the home operation family is driven end to end through a real Worker process:
  prepare, list, get, delete, the marker conflict, and the locator boundaries.

Nothing here matches English error text: codes, not messages, are the contract.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
from functools import lru_cache
from pathlib import Path
import re

import pytest

from agent_box_runtime_wsl import WorkerError


REPO_ROOT = Path(__file__).resolve().parents[2]
WORKER_SOURCE_PATH = REPO_ROOT / "workers" / "agent-box-worker" / "src" / "main.rs"

#: Error codes are the only string literals a Worker refusal site returns.
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


@lru_cache(maxsize=1)
def home_span() -> str:
    # The whole home family - constants, locator rule, marker, prepare, list,
    # get, delete - sits after `handle_secret` and before the test modules.
    return span("const HOME_MARKER_FILE:", "#[cfg(test)]")


def code_after(text: str, marker: str, *, window: int = 300) -> str:
    """The first error code a site emits after a structural marker."""
    index = text.find(marker)
    assert index >= 0, f"no audited site matches {marker!r} any more"
    found = _CODE.search(text, index + len(marker), index + len(marker) + window)
    assert found is not None, f"no error code follows {marker!r}"
    return found.group(1)


REFUSED_SITES = (
    "the traversal bound",
    "the file-count bound",
    "a special file",
    "a shortened fetch",
)


@lru_cache(maxsize=1)
def refused_sites() -> dict[str, str]:
    """The codes the Worker emits for each deterministic view refusal."""
    return {
        "the traversal bound": code_after(worker_source(), "*visited > MAX_VIEW_TRAVERSAL_ENTRIES"),
        "the file-count bound": code_after(worker_source(), "files.push(json!"),
        "a special file": _last_code(listing_span()),
        "a shortened fetch": code_after(view_get_span(), "offset > file.len()"),
    }


def _last_code(text: str) -> str:
    found = _CODE.findall(text)
    assert found, "no error code in the listing function"
    return found[-1]


def test_the_view_refusal_sites_keep_their_codes():
    sites = refused_sites()
    assert sites["the traversal bound"] == "VIEW_TRAVERSAL_LIMIT"
    assert sites["the file-count bound"] == "VIEW_FILE_LIMIT"
    assert sites["a special file"] == "VIEW_SPECIAL_FILE"
    assert sites["a shortened fetch"] == "VIEW_INVALID"


def test_the_home_ops_name_their_own_boundaries():
    """The new family's refusals are typed, not recycled from the view family."""
    span_text = home_span()
    for code in ("HOME_LOCATOR_INVALID", "HOME_OUTSIDE_ROOT", "HOME_NOT_FOUND",
                 "HOME_IO", "HOME_MARKER_CONFLICT"):
        assert code in span_text, f"the home ops no longer name {code}"


def test_the_locator_rule_refuses_traversal_at_the_named_boundary():
    assert code_after(worker_source(), '|| *segment == ".."') == "HOME_LOCATOR_INVALID"


# --------------------------------------------------------------------------
# The same contract, driven end to end through a real Worker process.
# --------------------------------------------------------------------------

WORKER = REPO_ROOT / "workers" / "agent-box-worker" / "target" / "debug" / "agent-box-worker"
WORKER_SOURCES = (
    REPO_ROOT / "workers" / "agent-box-worker" / "src" / "main.rs",
    REPO_ROOT / "workers" / "agent-box-worker" / "src" / "protocol.rs",
)
HOME_ROOT_NAME = "boundary-home-root"
LOCATOR = "boundary-role/.pi"


def require_worker() -> None:
    """The real Worker this file's codes come from, built from this source."""
    if not WORKER.is_file():
        pytest.skip(f"build the Worker first: cargo build ({WORKER})")
    stale = [path.name for path in WORKER_SOURCES if path.stat().st_mtime > WORKER.stat().st_mtime]
    assert not stale, f"the Worker binary is older than {stale}; run cargo build"


@pytest.fixture
def worker(tmp_path):
    """A started Worker with its home root outside its ephemeral root."""
    from agent_box_runtime_wsl import WorkerClient

    require_worker()
    root = tmp_path / "worker-root"
    home_root = tmp_path / HOME_ROOT_NAME
    client = WorkerClient(
        [str(WORKER), "--root", str(root), "--home-root", str(home_root)],
        worker_digest="sha256:" + hashlib.sha256(WORKER.read_bytes()).hexdigest(),
        worker_version="0.1.0", connection_id="boundary", project_id="boundary",
        effective_user=os.environ["USER"], server_instance_id="boundary",
    )
    client.start()
    yield client, home_root
    client.close()


def test_a_real_worker_prepares_audits_and_cleans_one_leak(worker, tmp_path):
    """prepare -> write -> list -> get -> delete, against the real binary."""
    client, home_root = worker
    marker = {"profileId": "profile_boundary", "harnessType": "pi", "nativeHome": ".pi"}
    prepared = client.request("home.prepare", {"locator": LOCATOR, "marker": marker})
    assert prepared["markerState"] == "written"

    # A second prepare verifies the same marker instead of rewriting it.
    again = client.request("home.prepare", {"locator": LOCATOR, "marker": marker})
    assert again["markerState"] == "verified"
    assert again["created"] is False

    # The marker lives at the role directory and pins this profile's identity.
    marker_file = home_root / "boundary-role" / ".agentbox-profile.json"
    assert marker_file.is_file()
    assert json.loads(marker_file.read_text())["profileId"] == "profile_boundary"

    # A foreign identity is a typed refusal, before anything else happens.
    foreign = dict(marker, profileId="profile_other")
    with pytest.raises(WorkerError) as conflict:
        client.request("home.prepare", {"locator": LOCATOR, "marker": foreign})
    assert conflict.value.code == "HOME_MARKER_CONFLICT"

    # A window directory declared by the deployment is created by prepare.
    client.request("home.prepare", {
        "locator": LOCATOR, "marker": marker, "window": ".pi/sessions",
    })
    session_dir = home_root / "boundary-role" / ".pi" / "sessions"
    assert session_dir.is_dir()

    # A file the harness wrote is listed with its digest and read in chunks.
    content = b'{"native":"facts"}\n'
    (session_dir / "journal.jsonl").write_bytes(content)
    listed = client.request("home.list", {
        "locator": LOCATOR, "relative": ".pi/sessions",
    })
    # Listing paths are window-relative - the same convention the audit
    # manifest's files[].path keeps (work order 45, section 2b).
    assert [item["path"] for item in listed["files"]] == ["journal.jsonl"]
    assert listed["files"][0]["size"] == len(content)
    assert listed["files"][0]["digest"] == "sha256:" + hashlib.sha256(content).hexdigest()
    chunk = client.request("home.get", {
        "locator": LOCATOR, "path": ".pi/sessions/journal.jsonl",
        "offset": 0, "maxLength": 4,
    })
    assert base64.b64decode(chunk["data"]) == content[:4]
    assert chunk["eof"] is False

    # The credential rule's clean-up: exactly one file goes.
    client.request("home.delete", {
        "locator": LOCATOR, "path": ".pi/sessions/journal.jsonl",
    })
    assert not (session_dir / "journal.jsonl").exists()


def test_a_real_worker_refuses_an_unsafe_locator(worker):
    client, _home_root = worker
    marker = {"profileId": "profile_boundary", "harnessType": "pi", "nativeHome": ".pi"}
    for locator in ("../escape", "role/../escape", "/absolute", "role//double"):
        with pytest.raises(WorkerError) as refused:
            client.request("home.prepare", {"locator": locator, "marker": marker})
        assert refused.value.code == "HOME_LOCATOR_INVALID", locator


def test_a_real_worker_refuses_reads_of_an_unprepared_home(worker):
    client, _home_root = worker
    with pytest.raises(WorkerError) as refused:
        client.request("home.list", {"locator": "never/.pi"})
    assert refused.value.code == "HOME_NOT_FOUND"


def test_a_real_worker_symlink_escape_is_refused(worker, tmp_path):
    client, home_root = worker
    outside = tmp_path / "outside-the-root"
    outside.mkdir()
    (home_root / "linked-role").symlink_to(outside, target_is_directory=True)
    marker = {"profileId": "profile_boundary", "harnessType": "pi", "nativeHome": ".pi"}
    with pytest.raises(WorkerError) as refused:
        client.request("home.prepare", {
            "locator": "linked-role/.pi", "marker": marker,
        })
    assert refused.value.code == "HOME_OUTSIDE_ROOT"


def test_the_control_protocol_is_named_in_the_worker_source():
    protocol_source = (
        REPO_ROOT / "workers" / "agent-box-worker" / "src" / "protocol.rs"
    ).read_text(encoding="utf-8")
    match = re.search(r"PROTOCOL_VERSION: u32 = (\d+)", protocol_source)
    assert match and match.group(1) == "4"
