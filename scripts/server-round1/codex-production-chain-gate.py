#!/usr/bin/env python3
"""Codex production chain gate: real codex-acp + real Codex app-server, local fake endpoint.

Runs the production Server assembly over the real c4 release Worker, bwrap, and
the genuine `@agentclientprotocol/codex-acp` adapter with the genuine Codex CLI
(`@openai/codex` 0.147.0, the native package the adapter resolves from its own
tree) mounted as the digest-verified runtime artifact, and points Codex at a
loopback **Responses** endpoint this gate starts. Two rounds on one Server
Session prove what a component-level gate cannot: that the isolated `CODEX_HOME`
is the one the adapter and its `app-server` child really read, that the full
official `models.json` catalogue is read from there, that the product model is
carried into a `/responses` request, that the credential's AgentBox injection
path was the real SecretStore -> Worker secret frame -> environment route (the
Harness's own behaviour after receiving the environment value is not proven
safe here and has a fail-closed counterexample), and that
the second round reopened the same native thread with the first round's context.

This is NOT a model acceptance. The endpoint is a local fake that returns two
fixed nonces; no credential is read, no real endpoint is contacted, and the
result registers CODEX_PRODUCTION_CHAIN_PREPARED only - never MODEL_VERIFIED.

Boundaries enforced by the gate itself:

  * The production deployment template is loaded from the plugin and asserted to
    hold the official DeepSeek root, `model = deepseek-flash`, the guest
    catalogue path, no loopback address and no credential material. The loopback
    endpoint exists only as an explicit, listed override applied to this run's
    temporary copy of `config.toml` (one field plus one sentinel comment line).
  * The credential is a temporary 0600 fake token injected through the real
    Server SecretStore -> Worker secret frame -> sidecar environment path under
    the deployment's declared name. Only whether the endpoint saw the matching
    bearer value is recorded, never the value itself; the token is absent from
    argv, the deployment document, events, the checkpoint and the workspace
    files this gate keeps, and it is deleted before the run ends.
  * The fake endpoint refuses to answer more than the expected provider requests
    per phase, so an implicit retry fails the gate instead of hiding in a total.
    Its first answer is deliberately silent for more than the Worker's 5 second
    lease, which is how the repaired lease keepalive is re-observed on a real
    harness instead of a fixture.
  * The host home is a controlled temporary directory carrying its own sentinel
    (never the user's real home, never `~/.codex`). A guest-side audit shim
    records what the guest can actually see: the Profile projection and its
    sentinel are present, the controlled host home is not, the two read-only
    files reject writes with EROFS while the state directory accepts one, and
    `$HOME/.codex` resolves to the same directory as `CODEX_HOME`.

**Current acceptance state** (dated snapshots, newest last): the chain ran
green end to end in both modes with c6 (2026-09-15 早) and for 10 consecutive
default-mode rounds with c7/c8; the native `.tmp/plugins`
skill-materialization burst then produced an unresolved red/green
interleave (10 green → 5 red → latest 3 green) pending the
deployment-config decision (see the state-error-boundary report §4.3). The first run did not: it stopped
at the state capture with `VIEW_INVALID` and reported the derived code
`CODEX_GATE_STATE_CONTAINS_NATIVE_ALIAS_SYMLINKS` with the observed links,
because the Worker's view listing then refused any tree containing a symlink and
the capture ran right after a `close` that does not wait for the native process
to exit. Both halves are repaired - the listing skips non-regular entries while
`view.get` keeps refusing them, and the capture retries only a genuine content
change - and the first-hand reproduction is kept in the Codex packaging report.

    usage: codex-production-chain-gate.py [--worker PATH] [--artifact PATH]
                                         [--keep] [--json]
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import http.server
import errno
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import time
import tomllib

REPO = Path(__file__).resolve().parents[2]
PLUGIN = REPO / "plugins" / "agent-box-harnesses"

# The three source roots this gate imports from. They are added here rather than
# assumed from the caller: the gate must behave the same whether it is run bare
# or with the repository's PYTHONPATH preset.
for _root in (
    REPO / "src",
    *(sorted((REPO / "plugins").glob("*/src"))),
):
    if str(_root) not in sys.path:
        sys.path.insert(0, str(_root))
WORKER_BUNDLE = REPO / "workers" / "agent-box-worker" / ".acceptance-bundle-c4" / "agent-box-worker"
BUILDER = REPO / "scripts" / "server-round1" / "build-codex-runtime-artifact.mjs"
SCRIPT = "scripts/server-round1/codex-production-chain-gate.py"

#: Fixed, obviously fake, never a credential. It exists to prove the injection
#: path; the gate never reads a real secret file. The shape matches what the
#: native Codex `env_key` lookup accepts (`sk-` prefixed), nothing more.
FAKE_TOKEN = "sk-codex-gate-fake-token-4f7ac21d-non-secret"
#: Set from --legacy-state-diagnostic in main(); read by the sidecar launcher.
LEGACY_STATE_DIAGNOSTIC = False
#: Set from --official-feature-flags in main(); read by the config builder.
FEATURE_FLAG_CONTROL = False
#: Credential-path observation budget: a regular file larger than the per-file
#: cap, or a tree larger than the file-count cap, cannot be claimed as observed
#: - that marks the scan incomplete instead of "no hit".
#: The per-file cap matches the deployment's own state-file bound (8 MiB), so
#: every file a capture could legitimately accept is fully observed here.
CREDENTIAL_SCAN_FILE_BYTES = 8 * 1024 * 1024
#: Traversal, file-count and total-byte budgets per cycle, mirroring the
#: deployment's own state bounds. Exhausting any of them means the tree
#: was not fully observed, so the cycle does not count as complete.
CREDENTIAL_SCAN_TRAVERSAL = 4096
CREDENTIAL_SCAN_FILES = 256
CREDENTIAL_SCAN_TOTAL_BYTES = 8 * 1024 * 1024
NONCE_ROUND_1 = "CODEX-GATE-NONCE-1F4A9C"
NONCE_ROUND_2 = "CODEX-GATE-NONCE-2B7D31"
#: The controlled stand-in for "the user's home": created by this run, carrying
#: its own sentinel, and never the real one.
HOST_HOME_SENTINEL = "CODEX-GATE-HOST-HOME-SENTINEL-9C31"
PROFILE_SENTINEL = "CODEX-GATE-PROFILE-SENTINEL-7D12"
#: The gate's own addition to the loopback copy: a commented line the guest-side
#: audit reads back. It changes no configuration field (see
#: `documented_differences`, which parses the document).
PROFILE_SENTINEL_COMMENT = "# agentbox-codex-gate-profile-sentinel"
ADAPTER_AUDIT_NAME = ".agentbox-codex-gate-adapter-audit.jsonl"
AUDIT_WRITE_PROBE = "codex-gate-write-probe.txt"
#: Every temporary root this gate creates carries this prefix under the system
#: temporary directory, which is what identifies a directory as ours to remove.
TEMPORARY_PREFIX = "agentbox-codex-gate-"
#: How long the fake endpoint stays silent before its first answer. The Worker's
#: default lease is 5 seconds; this must exceed it and the default must not move.
SILENT_SECONDS = 8.0
#: How long the cancel round's provider request is held open before the turn is
#: cancelled from the Server.
CANCEL_HOLD_SECONDS = 60.0
REPORT: dict = {"result": "CODEX_PRODUCTION_CHAIN_GATE_FAILED", "script": SCRIPT}


class GateFailure(Exception):
    """One gate failure, carried to `main` so cleanup always runs first."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


def fail(code: str, message: str) -> None:
    """Refuse with a typed code. Reporting and the exit code belong to `main`."""
    raise GateFailure(code, message)


# --------------------------------------------------------------------------
# cleanup of this run's temporary root
# --------------------------------------------------------------------------

def assert_owned_root(root: Path, *, created: Path) -> None:
    """Refuse to recursively delete anything that is not this run's temp root.

    The identity is not a string the caller supplied: it is the exact path
    `tempfile.mkdtemp` returned to this process, re-checked on disk (still the
    directory it was, no symlink, our prefix, directly under the system
    temporary directory, owned by us, and not group or world accessible).
    """
    if root != created:
        fail("CODEX_GATE_CLEANUP_NOT_OWNED", "the path is not the directory this run created")
    if not root.exists():
        return
    stats = os.lstat(root)
    if stat.S_ISLNK(stats.st_mode) or not stat.S_ISDIR(stats.st_mode):
        fail("CODEX_GATE_CLEANUP_NOT_OWNED", "the temporary root is no longer a directory")
    if not root.name.startswith(TEMPORARY_PREFIX) or root.parent != Path(tempfile.gettempdir()):
        fail("CODEX_GATE_CLEANUP_NOT_OWNED", "the temporary root is not one this gate creates")
    if stats.st_uid != os.geteuid():
        fail("CODEX_GATE_CLEANUP_NOT_OWNED", "the temporary root is not owned by this user")
    if stats.st_mode & 0o077:
        fail("CODEX_GATE_CLEANUP_NOT_OWNED", "the temporary root is group or world accessible")


def make_tree_writable(root: Path) -> int:
    """Re-enable write permission so a read-only artifact can be removed.

    The runtime artifact this gate builds is published read-only (0555/0444) by
    design, and `rmtree` cannot unlink entries from a directory it may not
    write. Re-enabling write access inside a root this gate created is how that
    artifact is retired; symlinks are never followed.
    """
    changed = 0
    for directory, directories, files in os.walk(root, topdown=False):
        for name in files:
            location = Path(directory) / name
            if location.is_symlink():
                continue
            os.chmod(location, 0o600)
            changed += 1
        for name in directories:
            location = Path(directory) / name
            if location.is_symlink():
                continue
            os.chmod(location, 0o700)
            changed += 1
    os.chmod(root, 0o700)
    return changed + 1


def remove_tree(path: Path, *, code: str = "CODEX_GATE_CLEANUP_FAILED") -> int:
    """Remove one tree, or fail loudly. Never swallows a removal failure."""
    if not path.exists():
        return 0
    changed = make_tree_writable(path)
    try:
        shutil.rmtree(path)
    except OSError as error:
        fail(code, f"could not remove {path.name}: {type(error).__name__}")
    if path.exists():
        fail(code, f"{path.name} still exists after removal")
    return changed


def assert_external_artifact_separate(artifact: Path, temporary: Path) -> None:
    """An artifact the caller supplied is theirs and must stay out of our root."""
    if artifact == temporary or temporary in artifact.parents:
        fail("CODEX_GATE_ARTIFACT_INSIDE_TEMPORARY_ROOT",
             "an external --artifact must live outside this run's temporary root")


def cleanup_root(root: Path, *, created: Path) -> dict:
    """Retire this run's temporary root and report whether it is really gone."""
    assert_owned_root(root, created=created)
    changed = remove_tree(root)
    return {"removed": not root.exists(), "madeWritable": changed}


# --------------------------------------------------------------------------
# local fake Responses endpoint
# --------------------------------------------------------------------------

def responses_stream(text: str) -> bytes:
    """One complete Responses SSE turn: created, delta, item done, completed."""

    def event(name: str, payload: dict) -> bytes:
        return f"event: {name}\ndata: {json.dumps(payload)}\n\n".encode()

    message = {"id": "msg_codex_gate", "type": "message", "role": "assistant",
               "status": "completed", "content": [{"type": "output_text", "text": text}]}
    return (
        event("response.created", {"type": "response.created", "response": {
            "id": "resp_codex_gate", "object": "response", "created_at": 1,
            "model": "deepseek-flash", "status": "in_progress", "output": []}})
        + event("response.output_item.added", {"type": "response.output_item.added",
               "output_index": 0, "item": {"id": "msg_codex_gate", "type": "message",
                                           "role": "assistant", "status": "in_progress",
                                           "content": []}})
        + event("response.output_text.delta", {"type": "response.output_text.delta",
               "item_id": "msg_codex_gate", "output_index": 0, "content_index": 0,
               "delta": text})
        + event("response.output_item.done", {"type": "response.output_item.done",
               "output_index": 0, "item": message})
        + event("response.completed", {"type": "response.completed", "response": {
            "id": "resp_codex_gate", "object": "response", "created_at": 1,
            "model": "deepseek-flash", "status": "completed", "output": [message],
            "usage": {"input_tokens": 11, "output_tokens": 7, "total_tokens": 18,
                      "input_tokens_details": {"cached_tokens": 0},
                      "output_tokens_details": {"reasoning_tokens": 0}}}})
    )


def sanitized(body: dict) -> dict:
    """Request structure without any credential or header value."""
    items = body.get("input") if isinstance(body.get("input"), list) else []

    def describe(item: object) -> dict:
        text = json.dumps(item)
        role = item.get("role") if isinstance(item, dict) else None
        content = item.get("content") if isinstance(item, dict) else None
        return {
            "type": item.get("type") if isinstance(item, dict) else None,
            "role": role,
            "chars": len(text),
            "containsRound1User": NONCE_ROUND_1 in text,
            "containsRound1Assistant": (
                NONCE_ROUND_1 in json.dumps(content) if role == "assistant" else False),
            "containsRound2User": NONCE_ROUND_2 in text,
        }

    return {
        "model": body.get("model"),
        "stream": body.get("stream"),
        "previousResponseId": body.get("previous_response_id"),
        "store": body.get("store"),
        "instructionsChars": len(body.get("instructions") or ""),
        "toolCount": len(body.get("tools") or []),
        "reasoning": body.get("reasoning"),
        "input": [describe(item) for item in items],
    }


class FakeEndpoint:
    """One loopback Responses endpoint, fully observed.

    `silent_first` holds the first answer back for that many seconds (the lease
    keepalive observation); `hold_index` never answers that request at all (the
    cancel observation) until `release_hold` is set or the client disconnects.
    """

    def __init__(self, token: str, *, budget: int, silent_first: float = 0.0,
                 hold_index: int | None = None) -> None:
        self.token = token
        self.requests: list[dict] = []
        self.paths: list[str] = []
        self.unauthorized = 0
        self.over_budget = 0
        self.budget = budget
        self.silent_first = silent_first
        self.hold_index = hold_index
        self.release_hold = threading.Event()
        self.silent_observed = 0.0
        self._lock = threading.Lock()
        gate = self

        class Handler(http.server.BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *_args) -> None:  # keep stdout clean
                pass

            def do_POST(self) -> None:
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length)
                try:
                    body = json.loads(raw.decode("utf-8"))
                except ValueError:
                    body = {}
                with gate._lock:
                    gate.paths.append(self.path)
                    index = len(gate.requests) + 1
                    authorized = self.headers.get("Authorization") == f"Bearer {gate.token}"
                    if not authorized:
                        gate.unauthorized += 1
                    if index > gate.budget:
                        gate.over_budget += 1
                    gate.requests.append({
                        "index": index, "path": self.path,
                        "authorizationMatchesInjectedToken": authorized,
                        "contentType": (self.headers.get("Content-Type") or "").split(";")[0],
                        "structure": sanitized(body),
                    })
                    hold = gate.hold_index is not None and index == gate.hold_index
                    silent = index == 1 and gate.silent_first > 0
                if hold:
                    # The cancel round: the client is expected to abort this
                    # connection. Never answer it.
                    gate.release_hold.wait(CANCEL_HOLD_SECONDS)
                    try:
                        self.close_connection = True
                    except Exception:  # noqa: BLE001 - the peer is gone by design
                        pass
                    return
                if silent:
                    started = time.monotonic()
                    time.sleep(gate.silent_first)
                    with gate._lock:
                        gate.silent_observed = max(gate.silent_observed, time.monotonic() - started)
                answer = NONCE_ROUND_1 if index == 1 else NONCE_ROUND_2 if index == 2 else f"CODEX-GATE-EXTRA-{index}"
                payload = responses_stream(answer)
                try:
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream")
                    self.send_header("Cache-Control", "no-cache")
                    self.send_header("Content-Length", str(len(payload)))
                    self.end_headers()
                    self.wfile.write(payload)
                except OSError:
                    # The client cancelled the turn; that is the expected end of
                    # a held response, not a gate failure.
                    pass

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def start(self) -> None:
        self.thread.start()
        self._started = True

    def stop(self) -> None:
        """Stop the endpoint, or do nothing if it never served.

        `shutdown()` waits for `serve_forever` to return, so calling it on a
        server that never started blocks forever - which would turn an early
        gate failure into a hang. Stopping is idempotent.
        """
        self.release_hold.set()
        if not getattr(self, "_started", False):
            return
        self._started = False
        self.server.shutdown()
        self.server.server_close()

    def assert_loopback_only(self) -> None:
        if self.server.server_address[0] != "127.0.0.1":
            fail("CODEX_GATE_ENDPOINT_NOT_LOOPBACK", "the fake endpoint is not bound to loopback")


# --------------------------------------------------------------------------
# worker connector (same ABW1 frames the WSL connector speaks)
# --------------------------------------------------------------------------

def _open_dir_fd(path: Path) -> int:
    return os.open(path, os.O_RDONLY | os.O_CLOEXEC | os.O_DIRECTORY | os.O_NOFOLLOW)


def _read_bounded(fd: int, limit: int) -> bytes:
    """One bounded, looped read: `os.read` may return short, so keep asking
    until EOF or the observation budget is reached."""
    chunks = bytearray()
    while len(chunks) < limit:
        chunk = os.read(fd, min(65536, limit - len(chunks)))
        if not chunk:
            break
        chunks += chunk
    return bytes(chunks)


def _open_beneath_fd(
    base_fd: int, components: tuple[str, ...], final_is_directory: bool,
) -> int:
    """Open `components` under a pinned directory fd, one openat at a time,
    every component O_NOFOLLOW, so a swapped entry or parent cannot redirect
    the walk. Returns the final fd; the caller owns and closes it."""
    opened: list[int] = []
    current = base_fd
    try:
        for index, name in enumerate(components):
            flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK
            if final_is_directory or index + 1 < len(components):
                flags |= os.O_DIRECTORY
            fd = os.open(name, flags, dir_fd=current)
            opened.append(fd)
            current = fd
        final = opened.pop()
        for fd in opened:
            os.close(fd)
        return final
    except BaseException:
        for fd in opened:
            os.close(fd)
        raise


class StateSymlinkWatcher:
    """Watch the Worker's own view while an attempt runs.

    The native Codex CLI installs argv0 alias symlinks under
    `$CODEX_HOME/tmp/arg0/<random>/` for as long as it runs and removes them when
    it exits. This watcher records that first-hand evidence (paths and targets),
    which is what the view listing now skips instead of refusing and what the
    capture no longer depends on: reads only ever serve declared regular files.
    The record is kept because it is what the historical `VIEW_INVALID` failure
    was diagnosed from.

    It also samples how large that view gets, counting regular files the way the
    Worker's listing does (symlinks are never followed or counted as files). The
    listing refuses more than `VIEW_FILE_LIMIT` files, so the peak is what tells
    a capture that failed with that code whether it met a tree that was still
    being written or one that had settled.
    """

    #: The Worker's own view-listing bound, recorded next to the peak so the
    #: number can be read without opening the Worker source.
    FILE_LIMIT = 1024

    def __init__(self, worker_root: Path, *, interval: float = 0.05, limit: int = 8) -> None:
        self.worker_root = worker_root
        self.interval = interval
        self.limit = limit
        self.observed: list[dict] = []
        self.peak_files = 0
        self.peak_files_at = ""
        self.peak_sample: list[str] = []
        self.peak_directory_counts: list[tuple[str, int]] = []
        self.peak_special = 0
        self.token_hits: list[dict] = []
        self.scan_error: str | None = None
        self.scan_incomplete: str | None = None
        self.race_events: list[dict] = []
        self.incomplete_events: list[dict] = []
        #: The settled window is the phase after the run's attempts ended
        #: (harness processes gone, state tree no longer written). User
        #: decision A judges the credential verdict on that window - it must be
        #: fully observed at least once - while churn seen during the active
        #: window is recorded as an observation, not turned into a failure.
        #: A *settled* cycle is one that walked the whole tree and found it
        #: byte-identical to the previous cycle: the harness is no longer
        #: writing, which is exactly the state a capture reads. User decision A
        #: judges the credential verdict on such a cycle; churn before it is
        #: recorded as an observation.
        self.settled_cycles = 0
        self.settled_incomplete: list[dict] = []
        self.settled_races: list[dict] = []
        self._last_identity: dict[str, tuple] | None = None
        self.scan_completed = 0
        self.scanned_files = 0
        self.scanned_bytes = 0
        self.scanned_entries = 0
        self._cycle_complete = True
        self.stopped_cleanly = False
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def start(self) -> None:
        self._thread.start()

    def scan_once(self) -> dict:
        """One synchronous scan of the current tree, no thread involved.

        An incomplete scan is reported as such, never as a quiet pass. This is
        the settled-window observation: it runs after the harness exited.
        """
        views = self.worker_root / "views"
        if not views.is_dir():
            # The capture pipeline already reclaimed every view: the settled
            # evidence for this run is the capture-boundary scan instead.
            return {"settledScan": "capture-boundary", "settledCycles": 0,
                    "settledFiles": 0, "settledIncomplete": None}
        self._scan_for_credential(views)
        return {
            "settledScan": "view",
            "settledCycles": 1 if self._cycle_complete else 0,
            "settledFiles": self.scanned_files,
            "settledIncomplete": self.scan_incomplete,
        }

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=5)
        self.stopped_cleanly = not self._thread.is_alive()

    def _run(self) -> None:
        try:
            self._run_bounded()
        except BaseException as error:  # noqa: BLE001 - recorded, then surfaced
            self.scan_error = f"{type(error).__name__}: {error}"

    def _run_bounded(self) -> None:
        views = self.worker_root / "views"
        while not self._stop.is_set():
            if views.is_dir():
                for ready in sorted(views.glob("*/ready")):
                    files, special, directories = self._count(ready)
                    if files > self.peak_files:
                        self.peak_files = files
                        self.peak_files_at = self._busiest(ready)
                        self.peak_directory_counts = sorted(
                            directories.items(),
                            key=lambda item: -item[1][0],
                        )[:5]
                        self.peak_sample = self._sample(directories, ready)
                    if special > self.peak_special:
                        self.peak_special = special
                for location in sorted(views.glob("*/ready/**/native-state/**/*")):
                    if len(self.observed) >= self.limit:
                        break
                    try:
                        if location.is_symlink():
                            self.observed.append({
                                "name": location.name,
                                "target": os.readlink(location),
                            })
                    except OSError:
                        continue
                if not self._stop.is_set():
                    self._scan_for_credential(views)
            self._stop.wait(self.interval)

    def _scan_for_credential(self, views: Path) -> None:
        """Name any native-state file that contains the injected fake token.

        fd-anchored and no-follow throughout (the same discipline the Worker
        applies). A cycle counts as *complete* only when the whole active view
        tree was walked within every budget and no file was skipped for an
        unknown reason: a raced file, an exhausted budget or an unexpected
        OSError leaves the cycle incomplete, and only complete cycles advance
        the "the scan really ran" counter. Only sanitized relative paths are
        recorded; the token itself is run-generated.
        """
        token = FAKE_TOKEN.encode()
        self.scanned_files = 0
        self.scanned_bytes = 0
        self.scanned_entries = 0
        self.scan_incomplete = None
        self._cycle_complete = True
        self.observed_identity: dict[str, tuple] = {}
        views_fd = _open_dir_fd(views)
        try:
            completed_here = False
            with os.scandir(f"/proc/self/fd/{views_fd}") as entries:
                for entry in entries:
                    view_fd = None
                    try:
                        view_fd = _open_beneath_fd(views_fd, (entry.name, "ready"), True)
                        self._scan_directory(
                            view_fd, "agentbox-sidecar/deployment/codex/native-state", token)
                        completed_here = True
                    except FileNotFoundError:
                        # A view that appeared or vanished mid-scan is simply
                        # not part of this cycle.
                        continue
                    except OSError as error:
                        self._mark_incomplete(f"view {entry.name}: {error}")
                        continue
                    finally:
                        if view_fd is not None:
                            os.close(view_fd)
            if completed_here and self._cycle_complete:
                self.scan_completed += 1
                if self._last_identity is not None and self.observed_identity == self._last_identity:
                    self.settled_cycles += 1
                self._last_identity = dict(self.observed_identity)
            else:
                # An incomplete cycle proves nothing about stability, so it
                # restarts the comparison; the facts are kept for the report.
                self._last_identity = None
                if self.scan_incomplete is not None:
                    event = {"reason": self.scan_incomplete}
                    if event not in self.settled_incomplete:
                        self.settled_incomplete.append(event)
                for raced in self.race_events:
                    if raced not in self.settled_races:
                        self.settled_races.append(raced)
        finally:
            os.close(views_fd)

    def _mark_incomplete(self, reason: str) -> None:
        """Record an incompleteness that this *run* must not forget.

        The per-cycle message is cheap to overwrite, so every event is also
        kept in a persistent list: a later quiet cycle cannot wash away a tree
        that was once not fully observed."""
        self._cycle_complete = False
        if self.scan_incomplete is None:
            self.scan_incomplete = reason
        event = {"reason": reason}
        if event not in self.incomplete_events:
            self.incomplete_events.append(event)

    def _scan_directory(self, ready_fd: int, relative: str, token: bytes) -> None:
        """Open the subdirectory once and hand its fd to the entry walk."""
        directory = _open_beneath_fd(ready_fd, tuple(relative.split("/")), True)
        try:
            self._scan_entries(directory, relative, token)
        finally:
            os.close(directory)

    def _scan_entries(self, directory_fd: int, relative_dir: str, token: bytes) -> None:
        try:
            entries = os.scandir(f"/proc/self/fd/{directory_fd}")
        except OSError as error:
            self._mark_incomplete(f"cannot list {relative_dir}: {error}")
            return
        with entries:
            for entry in entries:
                self.scanned_entries += 1
                if self.scanned_entries > CREDENTIAL_SCAN_TRAVERSAL:
                    self._mark_incomplete("traversal budget exhausted")
                    return
                relative = f"{relative_dir}/{entry.name}"
                try:
                    child = _open_beneath_fd(directory_fd, (entry.name,), False)
                except OSError as error:
                    # A link is refused by O_NOFOLLOW (ELOOP): a narrow, known
                    # case that is skipped without claiming anything. Anything
                    # else (permissions, I/O) means this cycle did not observe
                    # the entry, so the cycle is incomplete.
                    if error.errno != errno.ELOOP:
                        self._mark_incomplete(f"{relative}: {error}")
                    continue
                try:
                    status = os.fstat(child)
                    if stat.S_ISDIR(status.st_mode):
                        self._scan_entries(child, relative, token)
                        continue
                    if stat.S_ISLNK(status.st_mode) or not stat.S_ISREG(status.st_mode):
                        continue
                    if self.scanned_files >= CREDENTIAL_SCAN_FILES:
                        self._mark_incomplete("file budget exhausted")
                        return
                    if status.st_size > CREDENTIAL_SCAN_FILE_BYTES:
                        self._mark_incomplete(f"{relative} exceeds the per-file budget")
                        continue
                    if self.scanned_bytes + status.st_size > CREDENTIAL_SCAN_TOTAL_BYTES:
                        self._mark_incomplete("total byte budget exhausted")
                        return
                    payload = _read_bounded(child, CREDENTIAL_SCAN_FILE_BYTES)
                    after = os.fstat(child)
                    before_identity = (status.st_mtime_ns, status.st_ctime_ns, status.st_size)
                    after_identity = (after.st_mtime_ns, after.st_ctime_ns, after.st_size)
                    self.scanned_bytes += len(payload)
                    self.scanned_files += 1
                    self.observed_identity[relative] = before_identity
                    # The payload is examined whatever the race outcome: a token
                    # that was there while the file was in flight is a fact this
                    # gate must not drop.
                    if token in payload:
                        entry_hit = {"path": relative, "phase": "during-run"}
                        if entry_hit not in self.token_hits:
                            self.token_hits.append(entry_hit)
                    if before_identity != after_identity:
                        # Persisted, never cleared: a state file this run could
                        # not fully observe is a safety fact of *this* run, and
                        # a later quiet cycle does not undo it.
                        observation = {"path": relative, "phase": "racing"}
                        if observation not in self.race_events:
                            self.race_events.append(observation)
                        self._mark_incomplete(f"{relative} changed while it was read")
                        continue
                finally:
                    os.close(child)

    @staticmethod
    def _count(ready: Path) -> tuple[int, int, dict[str, tuple[int, list[str]]]]:
        """Regular files and non-regular, non-symlink entries, as a listing sees
        them, plus per-directory counts with a few file names each. A symlink is
        skipped by the listing, so it is not counted here."""
        files = 0
        special = 0
        directories: dict[str, tuple[int, list[str]]] = {}
        for root, _directories, names in os.walk(ready):
            relative = os.path.relpath(root, ready).replace(os.sep, "/")
            for name in names:
                try:
                    status = os.lstat(os.path.join(root, name))
                except OSError:
                    continue
                if stat.S_ISLNK(status.st_mode):
                    continue
                if stat.S_ISREG(status.st_mode):
                    files += 1
                    count, sample = directories.get(relative, (0, []))
                    directories[relative] = (count + 1, sample)
                else:
                    special += 1
        return files, special, directories

    @staticmethod
    def _sample(
        directories: dict[str, tuple[int, list[str]]], ready: Path, limit: int = 12
    ) -> list[str]:
        """File names from the directory holding most of the peak, so a capture
        that hit the listing bound can be traced to what produced the files."""
        if not directories:
            return []
        busiest = max(sorted(directories), key=lambda key: directories[key][0])
        return [
            f"{busiest}/{name}"
            for name in sorted(os.listdir(ready / busiest))[:limit]
        ]

    @staticmethod
    def _busiest(ready: Path) -> str:
        """The subtree that holds most of the files, for the report."""
        counts: dict[str, int] = {}
        for root, _directories, names in os.walk(ready):
            relative = os.path.relpath(root, ready).replace(os.sep, "/")
            top = "/".join(relative.split("/")[:3]) if relative != "." else "."
            counts[top] = counts.get(top, 0) + len(names)
        if not counts:
            return ""
        return max(sorted(counts), key=lambda key: counts[key])


class DirectWorkerConnector:
    """Launches the release Worker directly; the Windows wsl.exe path is not used."""

    def __init__(self, root: Path, worker: Path, workspace: Path) -> None:
        self.root = root
        self.worker = worker
        self.workspace = workspace

    def distributions(self):
        return [{"name": "Ubuntu"}]

    def probe(self, distribution, user):
        return {"probe_id": "probe", "distribution": distribution, "user": user}

    def browse(self, probe_id, path):
        return {"path": path, "directories": [], "files": []}

    def open_workspace(self, probe_id, path):
        return {"connection_id": "connection-codex-gate", "distribution": "Ubuntu",
                "user": os.environ["USER"], "path": str(self.workspace)}

    def client_for_workspace(self, **arguments):
        from agent_box_runtime_wsl import WorkerClient

        return WorkerClient(
            [str(self.worker), "--root", str(self.root / "worker-root"),
             "--workspace", str(self.workspace)],
            worker_digest="sha256:" + hashlib.sha256(self.worker.read_bytes()).hexdigest(),
            worker_version="0.1.0", connection_id=arguments["connection_id"],
            project_id=arguments["connection_id"], effective_user=os.environ["USER"],
            server_instance_id="server-codex-gate",
            executable_authorizations=arguments.get("executable_authorizations", ()),
            runtime_artifact_authorizations=arguments.get(
                "runtime_artifact_authorizations", ()),
        )


# --------------------------------------------------------------------------
# gate: host side
# --------------------------------------------------------------------------

def wire_post(client, token: str, method: str, params: dict) -> dict:
    body = client.post(f"/wire/v1/{method}", headers={"Authorization": f"Bearer {token}"},
                       json={"jsonrpc": "2.0", "id": method, "method": method, "params": params}).json()
    if "result" not in body:
        fail("CODEX_GATE_WIRE_REFUSED", f"{method}: {json.dumps(body)[:400]}")
    return body["result"]


def build_artifact(destination: Path, report: dict) -> dict:
    """Build one artifact and return the builder's own recorded facts."""
    result = subprocess.run(
        ["node", str(BUILDER), "--output", str(destination), "--json"],
        cwd=str(REPO), capture_output=True, text=True, timeout=900,
    )
    try:
        payload = json.loads(result.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        fail("CODEX_GATE_BUILD_UNREADABLE",
             f"the builder produced no JSON: {result.stdout[-300:]}{result.stderr[-300:]}")
    if result.returncode != 0 or payload.get("result") != "CODEX_RUNTIME_ARTIFACT_BUILT":
        fail(payload.get("code", "CODEX_GATE_BUILD_FAILED"), str(payload.get("error", payload)))
    report["artifact"] = {
        "output": str(destination), "treeDigest": payload["treeDigest"],
        "entries": payload["entries"], "bytes": payload["bytes"],
        "packages": payload["packages"], "native": payload["native"],
        "adapter": payload["adapter"], "sourceLockDigest": payload["sourceLockDigest"],
    }
    return payload


def verify_artifact(artifact: Path, report: dict) -> str:
    """Re-derive the digest with the reviewed implementation, not the manifest."""
    from agent_box_sandbox_bwrap import runtime_artifact_tree_summary

    manifest = json.loads(Path(f"{artifact}.manifest.json").read_text(encoding="utf-8"))
    summary = runtime_artifact_tree_summary(artifact)
    if summary["digest"] != manifest["treeDigest"]:
        fail("CODEX_GATE_ARTIFACT_DRIFT", "the artifact no longer matches its manifest digest")
    if summary["entries"] != manifest["entries"] or summary["bytes"] != manifest["bytes"]:
        fail("CODEX_GATE_ARTIFACT_DRIFT", "the artifact entry or byte count changed")
    report.setdefault("artifact", {}).update({
        "treeDigest": summary["digest"], "entries": summary["entries"],
        "bytes": summary["bytes"],
    })
    return summary["digest"]


#: The two official Codex feature flags this deployment turns off live in the
#: reviewed `config.toml` itself (`[features] plugins=false / shell_snapshot=false`,
#: evidence in the state-error-boundary report), so the loopback override must
#: never add a second `[features]` table. The differential gate below instead
#: *strips* that block from the loopback config to reproduce the shipped default
#: behaviour as its control leg.
FEATURE_FLAG_CONTROL = False


def without_feature_flags(config: bytes) -> bytes:
    """The same config with the `[features]` table removed (control leg).

    Only that one table's lines are dropped: every other line - including the
    Profile sentinel comment the guest audit verifies - stays exactly as the
    deployment declared it. What is emitted must parse, so a malformed control
    config can never masquerade as a behaviour difference.
    """
    out: list[str] = []
    skipping = False
    for line in config.decode("utf-8").splitlines(keepends=True):
        stripped = line.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            skipping = stripped == "[features]"
        if skipping:
            continue
        out.append(line)
    control = "".join(out)
    tomllib.loads(control)
    return control.encode()


def loopback_config_bytes(endpoint: FakeEndpoint, production) -> bytes:
    """The production configuration with the listed loopback override applied.

    The reviewed `[features]` block stays exactly as the deployment declares it;
    the `--feature-flag-differential` control leg removes it instead (see
    `without_feature_flags`).
    """
    config = production.loopback_config_bytes(endpoint.base_url) + (
        f"{PROFILE_SENTINEL_COMMENT}: {PROFILE_SENTINEL}\n".encode())
    if FEATURE_FLAG_CONTROL:
        config = without_feature_flags(config)
    # Whatever this function emits must parse: a duplicated or malformed table
    # would silently change what the guest reads.
    tomllib.loads(config.decode("utf-8"))
    return config


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker", default=str(WORKER_BUNDLE))
    parser.add_argument("--artifact", default=None)
    parser.add_argument("--keep", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument(
        "--feature-flag-control-leg", action="store_true",
        help="strip the reviewed [features] block from the loopback config, i.e. "
             "run with Codex's shipped defaults (control leg of the differential; "
             "driven by scripts/server-round1/codex-feature-flag-differential.py)",
    )
    parser.add_argument(
        "--legacy-state-diagnostic", action="store_true",
        help="run without the attempt-ephemeral .tmp shadow so the credential "
             "scan can name the native-state file that receives the injected "
             "fake token (no-model, fake-token only; never with a real key)",
    )
    options = parser.parse_args()
    global LEGACY_STATE_DIAGNOSTIC, FEATURE_FLAG_CONTROL
    LEGACY_STATE_DIAGNOSTIC = bool(options.legacy_state_diagnostic)
    FEATURE_FLAG_CONTROL = bool(options.feature_flag_control_leg)

    endpoint: FakeEndpoint | None = None
    created: Path | None = None
    temporary: Path | None = None
    primary: GateFailure | None = None
    cleanup_failure: GateFailure | None = None
    external_artifact: Path | None = None

    try:
        worker = Path(options.worker).resolve()
        REPORT["worker"] = {"path": str(worker)}
        if not worker.is_file():
            fail("CODEX_GATE_WORKER_MISSING", f"the release Worker binary is unavailable: {worker}")
        if not shutil.which("bwrap"):
            fail("CODEX_GATE_BWRAP_MISSING", "bubblewrap is unavailable")
        REPORT["worker"]["sha256"] = "sha256:" + hashlib.sha256(worker.read_bytes()).hexdigest()

        # The plugin owns the deployment; this gate only adds a listed override.
        from agent_box_harnesses.codex import production

        config = production.config_document()
        official = config["model_providers"][production.PROVIDER_ID]["base_url"]
        if official != production.OFFICIAL_BASE_URL:
            fail("CODEX_GATE_TEMPLATE_NOT_OFFICIAL", f"the production template base URL is {official!r}")
        if config["model"] != production.PRODUCT_MODEL_ID:
            fail("CODEX_GATE_TEMPLATE_MODEL_DRIFT", f"the production model is {config['model']!r}")
        if config["model_catalog_json"] != production.MODELS_TARGET:
            fail("CODEX_GATE_TEMPLATE_CATALOG_DRIFT",
                 f"the production catalogue path is {config['model_catalog_json']!r}")

        # Three provider requests are expected: round one (answered silently),
        # round two (answered) and the cancel round (held open, never answered).
        endpoint = FakeEndpoint(
            FAKE_TOKEN, budget=3, silent_first=SILENT_SECONDS, hold_index=3)
        endpoint.assert_loopback_only()
        differences = production.documented_differences(endpoint.base_url)
        REPORT["template"] = {
            "officialBaseUrl": official,
            "loopbackOverrideChanges": {key: list(value) for key, value in differences.items()},
            "loopbackSentinel": PROFILE_SENTINEL,
            "productModelId": production.PRODUCT_MODEL_ID,
            "nativeModelId": production.NATIVE_MODEL_ID,
            "artifactTarget": production.ARTIFACT_TARGET,
            "adapterEntry": production.ADAPTER_ARTIFACT_ENTRY,
            "credentialEnvironment": production.CREDENTIAL_ENVIRONMENT,
            "preferredAuthMethod": production.PREFERRED_AUTH_METHOD,
            "configTarget": production.CONFIG_TARGET,
            "modelsTarget": production.MODELS_TARGET,
            "stateTarget": production.STATE_TARGET,
            "silentFirstAnswerSeconds": SILENT_SECONDS,
            "modelCatalogBytes": len(production.models_bytes()),
            "modelCatalogSha256": "sha256:" + hashlib.sha256(production.models_bytes()).hexdigest(),
        }
        if set(differences) != {f"model_providers.{production.PROVIDER_ID}.base_url"}:
            fail("CODEX_GATE_OVERRIDE_NOT_MINIMAL",
                 f"the loopback override changed {sorted(differences)}")

        created = Path(tempfile.mkdtemp(prefix=TEMPORARY_PREFIX))
        temporary = created
        workspace = temporary / "workspace"
        workspace.mkdir()
        host_home = temporary / "controlled-host-home"
        host_home.mkdir()
        (host_home / "sentinel").write_text(HOST_HOME_SENTINEL + "\n", encoding="utf-8")
        (host_home / ".codex").mkdir()
        (host_home / ".codex" / "sentinel").write_text(HOST_HOME_SENTINEL + "\n", encoding="utf-8")
        REPORT["run"] = {
            "temporary": str(temporary), "workspace": str(workspace),
            "controlledHostHome": str(host_home),
            "hostHomeSentinel": HOST_HOME_SENTINEL,
        }

        # (B2) the artifact is built twice and both digests must be identical; the
        # first build is the one the whole chain runs on.
        if options.artifact:
            artifact = Path(options.artifact).resolve()
            assert_external_artifact_separate(artifact, temporary)
            # An external artifact is either verified or refused: a missing path
            # must fail here, typed and immediately, rather than being silently
            # rebuilt (which would make the external evidence meaningless) or
            # left to whatever the mounting does with a path that is not there.
            if not artifact.is_dir() or not Path(f"{artifact}.manifest.json").is_file():
                fail("CODEX_GATE_ARTIFACT_MISSING",
                     f"the external artifact or its manifest is not readable: {artifact}")
            external_artifact = artifact
            REPORT["artifact"] = {"output": str(artifact), "external": True}
            digest = verify_artifact(artifact, REPORT)
        else:
            first = build_artifact(temporary / "artifacts" / "codex-runtime-a", REPORT)
            artifact = temporary / "artifacts" / "codex-runtime-a"
            digest = verify_artifact(artifact, REPORT)
            second = build_artifact(temporary / "artifacts" / "codex-runtime-b", {})
            verify_artifact(temporary / "artifacts" / "codex-runtime-b", {})
            if second["treeDigest"] != first["treeDigest"]:
                fail("CODEX_GATE_ARTIFACT_UNSTABLE",
                     f"two builds of one source produced {first['treeDigest']} and {second['treeDigest']}")
            REPORT["artifact"]["doubleBuild"] = {
                "firstDigest": first["treeDigest"], "secondDigest": second["treeDigest"],
                "identical": True, "entries": second["entries"], "bytes": second["bytes"],
            }

        token_path = temporary / "codex-gate-token"
        token_path.write_bytes(FAKE_TOKEN.encode())
        token_path.chmod(0o600)

        watcher = StateSymlinkWatcher(temporary / "worker-root")
        watcher.start()
        endpoint.start()
        chain_failure = None
        outcome: dict = {}
        try:
            outcome = run_chain(
                temporary, workspace, worker, artifact, digest, endpoint, production,
                token_path, host_home,
            )
        except BaseException as failure:  # noqa: BLE001 - held for the verdict
            # Held, not propagated: the credential verdict must be computed on
            # every path, so a concurrent credential hit can never be masked by
            # an unrelated chain failure.
            chain_failure = GateFailure(
                getattr(failure, "code", None) or "CODEX_GATE_UNEXPECTED",
                getattr(failure, "message", None) or f"{type(failure).__name__}: {failure}",
            )
        finally:
            endpoint.stop()
            # User decision A: the settled window opens only after the native
            # processes are gone, and it is observed synchronously. The
            # thread's cycles are observations, not evidence.
            settled_window = settle_after_attempt(watcher, temporary)
            watcher.stop()
            # The endpoint's own record is the evidence for several requirements,
            # so it is reported even when the chain failed after it answered.
            REPORT["provider"] = {
                "requests": endpoint.requests, "paths": endpoint.paths,
                "unauthorizedRequests": endpoint.unauthorized,
                "requestsBeyondBudget": endpoint.over_budget,
                "baseUrl": endpoint.base_url,
                "silentFirstAnswerObservedSeconds": round(endpoint.silent_observed, 3),
            }
            REPORT["stateSymlinksObserved"] = watcher.observed
            REPORT["credentialPathHits"] = watcher.token_hits
            REPORT["stateProjectionObservation"] = {
                "peakRegularFiles": watcher.peak_files,
                "peakRegularFilesSubtree": watcher.peak_files_at,
                "peakDirectoryCounts": [
                    {"directory": directory, "files": count}
                    for directory, (count, _sample) in watcher.peak_directory_counts
                ],
                "peakSamplePaths": watcher.peak_sample,
                "peakNonRegularEntries": watcher.peak_special,
                "listingFileLimit": StateSymlinkWatcher.FILE_LIMIT,
                "overListingLimit": watcher.peak_files > StateSymlinkWatcher.FILE_LIMIT,
            }
        REPORT.update(outcome)
        REPORT["settledWindow"] = settled_window
        verdict, detail = finalize_run(REPORT, settled_window, watcher) or (None, "")
        if verdict is not None and chain_failure is not None:
            REPORT["secondaryFailure"] = {
                "code": chain_failure.code, "message": chain_failure.message,
            }
        if verdict is not None:
            fail(verdict, detail)
        if chain_failure is not None:
            raise chain_failure
        if endpoint.over_budget:
            fail("CODEX_GATE_EXTRA_PROVIDER_REQUEST",
                 f"{endpoint.over_budget} provider requests exceeded the phase budget")
        if endpoint.unauthorized:
            fail("CODEX_GATE_UNAUTHORIZED_PROVIDER_REQUEST",
                 f"{endpoint.unauthorized} provider requests did not carry the injected token")

        REPORT["reopenObservation"] = observe_reopen(
            temporary, workspace, worker, artifact, digest, production, token_path, host_home)
        cleanup_check(temporary, workspace, token_path)
        REPORT["result"] = "CODEX_PRODUCTION_CHAIN_GATE_OK"
    except GateFailure as failure:
        primary = failure
    except BaseException as error:  # an unexpected crash is a failure too
        primary = GateFailure("CODEX_GATE_UNEXPECTED", f"{type(error).__name__}: {error}")
    finally:
        if endpoint is not None:
            endpoint.stop()
        if temporary is not None:
            run = REPORT.setdefault("run", {})
            if options.keep:
                run["removed"] = False
                run["kept"] = str(temporary)
                REPORT["kept"] = str(temporary)
            else:
                try:
                    outcome = cleanup_root(temporary, created=created)
                    run["removed"] = bool(outcome["removed"])
                    REPORT.setdefault("cleanup", {}).update(outcome)
                except GateFailure as failure:
                    cleanup_failure = failure
                    run["removed"] = not temporary.exists()
                    REPORT["cleanupFailure"] = {
                        "code": failure.code, "error": failure.message[:300],
                    }
        if external_artifact is not None:
            # The caller's artifact must survive untouched - in a failing run too,
            # so the check runs whatever the outcome was.
            try:
                verify_artifact(external_artifact, REPORT)
                REPORT.setdefault("artifact", {})["preservedAfterCleanup"] = True
            except GateFailure as failure:
                REPORT.setdefault("artifact", {})["preservedAfterCleanup"] = False
                if primary is None:
                    primary = GateFailure("CODEX_GATE_EXTERNAL_ARTIFACT_DAMAGED", failure.message)
                else:
                    REPORT["externalArtifactDamaged"] = failure.message[:300]

    if primary is None and cleanup_failure is not None:
        primary, cleanup_failure = cleanup_failure, None

    if primary is not None:
        REPORT["result"] = "CODEX_PRODUCTION_CHAIN_GATE_FAILED"
        REPORT["code"] = primary.code
        annotate_known_blocker()
        REPORT["error"] = primary.message[:900]
        if cleanup_failure is not None:
            REPORT["cleanupFailure"] = {
                "code": cleanup_failure.code, "error": cleanup_failure.message[:300],
            }
        print(json.dumps(REPORT, indent=2 if options.json else None, sort_keys=True))
        return 1
    print(json.dumps(REPORT, indent=2 if options.json else None, sort_keys=True))
    return 0


# --------------------------------------------------------------------------
# gate: the production seam
# --------------------------------------------------------------------------

def run_chain(temporary, workspace, worker, artifact, digest, endpoint, production,
              token_path, host_home) -> dict:
    """The production seam: Server -> Core -> sidecar -> Worker -> bwrap -> codex-acp."""
    from agent_box.server.bootstrap import build_runtime_from_sidecar_deployment
    from agent_box.server.credentials import CredentialRecords
    from agent_box.server.transport.http import create_app
    from agent_box.storage import MemorySecretStore
    from fastapi.testclient import TestClient

    document = production.deployment_document(
        artifact_source=str(artifact), tree_digest=digest,
        adapter_environment=dict(production.ADAPTER_ENVIRONMENT),
    )
    deployment = temporary / "deployment.json"
    deployment.write_text(json.dumps(document), encoding="utf-8")
    if FAKE_TOKEN in deployment.read_text(encoding="utf-8"):
        fail("CODEX_GATE_TOKEN_IN_DEPLOYMENT", "the fake token reached the deployment document")

    loopback_bytes = loopback_config_bytes(endpoint, production)

    import agent_box.server.bootstrap.runtime as runtime_module
    runtime_module._builtin_connector = lambda _id: DirectWorkerConnector(
        temporary, worker, workspace)
    original_file = runtime_module._sidecar_deployment_file

    def deployment_file(root, value, relative):
        if relative == production.CONFIG_SOURCE:
            return loopback_bytes
        return original_file(root, value, relative)

    runtime_module._sidecar_deployment_file = deployment_file
    store = MemorySecretStore(values={})
    runtime = build_runtime_from_sidecar_deployment(
        temporary / "server", deployment, secret_store=store,
    )
    # The result dict is published in the report immediately, so the evidence a
    # failed step already produced (an answered request, a streamed delta, a
    # checkpoint) survives into the failure report instead of being dropped.
    result: dict = {"rounds": {}}
    REPORT["rounds"] = result["rounds"]
    REPORT["sessionId"] = None
    try:
        credential_id, locator = store.import_file(token_path, "api-key")
        with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
            CredentialRecords(runtime.database).register(credential_id, "api-key", locator)
            opened = wire_post(client, runtime.token, "workspaces.open", {
                "requestId": "codex-gate-open", "path": str(workspace),
                "environment": {"kind": "wsl", "host": "Ubuntu", "user": os.environ["USER"]},
            })["workspace"]
            provider = wire_post(client, runtime.token, "providerModels.create", {
                "requestId": "codex-gate-provider", "displayName": "DeepSeek official",
                "harness": "codex", "provider": production.PROVIDER_ID,
                "credentialId": credential_id, "configuration": [], "models": [{
                    "modelId": production.PRODUCT_MODEL_ID, "displayName": "DeepSeek Flash",
                    "availability": "available", "unavailableReason": None,
                }],
            })["providerModel"]
            profile = client.post("/api/v1/profiles", headers={
                "Authorization": f"Bearer {runtime.token}", "Idempotency-Key": "codex-gate-profile",
            }, json={"name": "Codex production gate", "harness_type": "codex",
                     "configuration": {}, "credential_id": credential_id}).json()
            configured = wire_post(client, runtime.token, "profiles.updateConfig", {
                "requestId": "codex-gate-profile-config", "profileId": profile["profile_id"],
                "expectedVersion": profile_version(client, runtime, profile["profile_id"]),
                "values": [{"controlId": "model", "value": {
                    "providerId": provider["id"], "modelId": production.PRODUCT_MODEL_ID,
                }}],
            })["profile"]

            first = wire_post(client, runtime.token, "sessions.createAndSend", {
                "requestId": "codex-gate-round-1", "workspaceId": opened["id"],
                "profileId": configured["id"], "overrides": [],
                "message": {"text": f"Remember {NONCE_ROUND_1} and reply with it.",
                            "attachments": []},
            })
            session_id = first["session"]["id"]
            started = time.monotonic()
            session = wait_for_turn(runtime, session_id, 0, "completed", timeout=300.0)
            elapsed = time.monotonic() - started
            result["rounds"]["first"] = summarize_turn(session, 0)
            result["rounds"]["first"]["elapsedSeconds"] = round(elapsed, 3)
            # The endpoint held its first answer back; the turn must still finish.
            if endpoint.silent_observed < SILENT_SECONDS:
                fail("CODEX_GATE_SILENCE_NOT_OBSERVED",
                     "the fake endpoint never applied the silent first answer")
            if elapsed < SILENT_SECONDS:
                fail("CODEX_GATE_TURN_FASTER_THAN_SILENCE",
                     "the first turn completed before the endpoint's silent window ended")
            result["sessionId"] = session_id
            native_id = session["checkpoint"]["native_id"] if session["checkpoint"] else None
            if not native_id:
                fail("CODEX_GATE_NO_NATIVE_ID", "the first round produced no native session id")
            result["nativeSessionId"] = native_id
            REPORT["nativeSessionId"] = native_id
            checkpoint = json.loads(runtime.objects.read(session["checkpoint"]["object_digest"]))
            state_files = sorted(str(item["path"]) for item in checkpoint.get("files", []))
            result["checkpointAfterFirst"] = {
                "schemaVersion": checkpoint.get("schema_version"),
                "resumable": checkpoint.get("resumable"),
                "harnessType": checkpoint.get("harnessType"),
                "nativeSessionId": checkpoint.get("nativeSessionId"),
                "files": state_files[:64], "fileCount": len(state_files),
            }
            if not any(path.startswith("sessions/") and path.endswith(".jsonl") for path in state_files):
                fail("CODEX_GATE_NATIVE_ROLLOUT_NOT_CAPTURED",
                     "no Codex rollout was captured from the isolated CODEX_HOME")

            second = wire_post(client, runtime.token, "sessions.send", {
                "requestId": "codex-gate-round-2", "sessionId": session_id,
                "overrides": [],
                "message": {"text": "What did I ask you to remember? Reply with the nonce.",
                            "attachments": []},
            })
            wait_for_turn(runtime, session_id, 1, "completed", timeout=300.0)
            session = runtime.repository.get_session(session_id)
            result["rounds"]["second"] = summarize_turn(session, 1)
            if session["checkpoint"]["native_id"] != native_id:
                fail("CODEX_GATE_NATIVE_ID_CHANGED", "the second round did not keep the native session id")
            result["checkpointNativeIdStable"] = True

            result["providerRequestShape"] = provider_request_shape(endpoint, result["rounds"])
            REPORT["providerRequestShape"] = result["providerRequestShape"]
            result["unknownModel"] = run_unknown_model(
                client, runtime, workspace, opened, production, endpoint, credential_id)
            REPORT["unknownModel"] = result["unknownModel"]
            result["cancel"] = run_cancel_round(
                client, runtime, opened, endpoint, credential_id, production)
            REPORT["cancel"] = result["cancel"]

            result["credential"] = {
                "injectedTokenReachedProvider": all(
                    item["authorizationMatchesInjectedToken"] for item in endpoint.requests
                ) and bool(endpoint.requests),
                "unauthorizedRequests": endpoint.unauthorized,
                "tokenInEvents": FAKE_TOKEN in json.dumps(session["events"]),
                "tokenInReportableState": FAKE_TOKEN in json.dumps(REPORT),
                "tokenInDeployment": FAKE_TOKEN in deployment.read_text(encoding="utf-8"),
                "tokenInWorkspace": token_in_workspace(workspace),
                "noCredentialMaterialInProductionConfig": (
                    FAKE_TOKEN not in production.config_bytes().decode("utf-8")),
            }
            result["stateScan"] = scan_state(runtime, session, native_id)
            result["deltaAttribution"] = delta_attribution(session)
            return result
    finally:
        runtime.stop()


def token_in_workspace(workspace: Path) -> bool:
    """Whether the run's fake token landed in a file this gate keeps in the project.

    The workspace is the only writable tree inside the guest, so this is where a
    harness would leak a credential into durable product data if the environment
    injection were not the only path. The adapter is *not* given a log directory
    by this phase precisely because its log would record the login request.
    """
    for location in sorted(workspace.rglob("*")):
        if not location.is_file():
            continue
        try:
            if FAKE_TOKEN.encode() in location.read_bytes():
                return True
        except OSError:
            continue
    return False


def provider_request_shape(endpoint: FakeEndpoint, rounds: dict) -> dict:
    """The parts of the two answered requests the requirements name explicitly."""
    answered = [item for item in endpoint.requests if item["index"] <= 2]
    if len(answered) != 2:
        fail("CODEX_GATE_PROVIDER_REQUEST_COUNT",
             f"expected two answered provider requests, saw {len(answered)}")
    for item in answered:
        if item["path"] != "/responses":
            fail("CODEX_GATE_NOT_RESPONSES", f"a provider request went to {item['path']!r}")
        if item["structure"]["model"] != "deepseek-flash":
            fail("CODEX_GATE_MODEL_NOT_PRODUCT",
                 f"a provider request carried model {item['structure']['model']!r}")
        if item["structure"]["stream"] is not True:
            fail("CODEX_GATE_NOT_STREAMING", "a provider request was not streaming")
    second = answered[1]["structure"]["input"]
    if not any(item["role"] == "user" and item["containsRound1User"] for item in second):
        fail("CODEX_GATE_SECOND_ROUND_CONTEXT_MISSING",
             "the second request carries no round-one user message")
    if not any(item["containsRound1Assistant"] for item in second):
        fail("CODEX_GATE_SECOND_ROUND_CONTEXT_MISSING",
             "the second request carries no round-one assistant message")
    return {
        "paths": [item["path"] for item in answered],
        "models": [item["structure"]["model"] for item in answered],
        "secondRoundCarriesRoundOneUser": True,
        "secondRoundCarriesRoundOneAssistant": True,
        "inputCounts": [len(item["structure"]["input"]) for item in answered],
        "toolCounts": [item["structure"]["toolCount"] for item in answered],
    }


def profile_version(client, runtime, profile_id: str) -> int:
    """The current Profile version, for a compare-and-set configuration write."""
    for item in wire_post(client, runtime.token, "profiles.list", {
        "includeArchived": True,
    })["items"]:
        if item["id"] == profile_id:
            return int(item["version"])
    fail("CODEX_GATE_PROFILE_MISSING", f"profile {profile_id} was not listed")


def delta_attribution(session: dict) -> dict:
    """Every durable delta must belong to a turn of this Session."""
    turns = {turn["id"] for turn in session["turns"]}
    deltas = [event for event in session["events"] if event["kind"] == "message.delta"]
    stray = [event for event in deltas if event.get("turn_id") not in turns]
    if stray:
        fail("CODEX_GATE_STRAY_DELTA", f"{len(stray)} deltas do not belong to a turn of this Session")
    return {"deltas": len(deltas), "unattributed": 0,
            "perTurn": {turn["id"]: sum(1 for e in deltas if e.get("turn_id") == turn["id"])
                        for turn in session["turns"]}}


def wait_for_turn(runtime, session_id: str, index: int, state: str, *, timeout: float = 300.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        session = runtime.repository.get_session(session_id)
        if len(session["turns"]) > index and session["turns"][index]["state"] == state:
            return session
        if len(session["turns"]) > index and session["turns"][index]["state"] in {"failed", "cancelled"}:
            REPORT["diagnostics"] = turn_diagnostics(runtime, session, index)
            fail("CODEX_GATE_TURN_" + session["turns"][index]["state"].upper(),
                 json.dumps(REPORT["diagnostics"])[:1500])
        time.sleep(0.05)
    fail("CODEX_GATE_TURN_TIMEOUT", f"turn {index} of session {session_id} did not reach {state}")


def wait_for_terminal(runtime, session_id: str, index: int, *, timeout: float = 120.0) -> dict:
    """Wait until a turn reaches any terminal state and return the Session."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        session = runtime.repository.get_session(session_id)
        if len(session["turns"]) > index and session["turns"][index]["state"] in {
                "completed", "failed", "cancelled"}:
            return session
        time.sleep(0.05)
    session = runtime.repository.get_session(session_id)
    REPORT["diagnostics"] = turn_diagnostics(runtime, session, index)
    fail("CODEX_GATE_TURN_TIMEOUT",
         f"turn {index} of session {session_id} did not reach a terminal state")


def turn_diagnostics(runtime, session: dict, index: int) -> dict:
    """Whatever the durable records say about a turn that did not succeed."""
    reasons = []
    with runtime.database.read() as conn:
        for row in conn.execute("SELECT data_json FROM core_events WHERE type=?",
                                ("ExecutionDispatchAmbiguous",)):
            reasons.append(json.loads(row["data_json"]).get("error", "")[:400])
    events = []
    for event in session["events"]:
        if event.get("turn_id") != session["turns"][index]["id"]:
            continue
        data = event.get("data") or {}
        events.append({"kind": event["kind"],
                       "text": str(data.get("text") or data.get("state") or data.get("code") or "")[:200]})
    return {"reasons": reasons[-4:], "events": events[-12:],
            "turn": {key: session["turns"][index].get(key)
                     for key in ("state", "error_code", "capture_state", "cleanup_state")}}


def summarize_turn(session: dict, index: int) -> dict:
    turn = session["turns"][index]
    events = [event for event in session["events"] if event.get("turn_id") == turn["id"]]
    deltas = [event for event in events if event["kind"] == "message.delta"]
    terminal = [event for event in events
                if event["kind"] == "turn.state" and event["data"].get("state") == "completed"]
    return {
        "state": turn["state"],
        "deltaSeq": [event["seq"] for event in deltas],
        "deltaText": [event["data"]["text"] for event in deltas],
        "completedSeq": terminal[0]["seq"] if terminal else None,
        "deltasBeforeCompletion": bool(terminal and deltas and deltas[0]["seq"] < terminal[0]["seq"]),
    }


def run_unknown_model(client, runtime, workspace, opened, production, endpoint, credential_id) -> dict:
    """An unknown product model must be refused before any provider request.

    The adapter's ACP session advertises the catalogue it read from
    `/runtime/home/.codex/models.json`; the bridge validates the requested model
    against that list, so a model outside it fails the create step - before any
    HTTP request could leave the guest.
    """
    provider = wire_post(client, runtime.token, "providerModels.create", {
        "requestId": "codex-gate-unknown-provider", "displayName": "DeepSeek unknown",
        "harness": "codex", "provider": production.PROVIDER_ID, "credentialId": credential_id,
        "configuration": [], "models": [{
            "modelId": "deepseek-unknown", "displayName": "Unknown",
            "availability": "available", "unavailableReason": None,
        }],
    })["providerModel"]
    profile = client.post("/api/v1/profiles", headers={
        "Authorization": f"Bearer {runtime.token}",
        "Idempotency-Key": "codex-gate-unknown-profile",
    }, json={"name": "Codex unknown model", "harness_type": "codex",
             "configuration": {}, "credential_id": credential_id}).json()
    configured = wire_post(client, runtime.token, "profiles.updateConfig", {
        "requestId": "codex-gate-unknown-config", "profileId": profile["profile_id"],
        "expectedVersion": profile_version(client, runtime, profile["profile_id"]),
        "values": [{"controlId": "model", "value": {
            "providerId": provider["id"], "modelId": "deepseek-unknown",
        }}],
    })["profile"]
    sent = wire_post(client, runtime.token, "sessions.createAndSend", {
        "requestId": "codex-gate-unknown-send", "workspaceId": opened["id"],
        "profileId": configured["id"], "overrides": [],
        "message": {"text": "This model does not exist.", "attachments": []},
    })
    session = wait_for_turn(runtime, sent["session"]["id"], 0, "failed")
    turn = session["turns"][0]
    reasons = []
    with runtime.database.read() as conn:
        for row in conn.execute("SELECT data_json FROM core_events WHERE type=?",
                                ("ExecutionDispatchAmbiguous",)):
            reasons.append(json.loads(row["data_json"]).get("error", ""))
    requests_after = len(endpoint.requests)
    if requests_after != 2:
        fail("CODEX_GATE_UNKNOWN_MODEL_REACHED_PROVIDER",
             f"the refused model produced {requests_after - 2} provider requests")
    return {
        "state": turn["state"],
        "providerRequestsAfterRefusal": requests_after - 2,
        "refusedBeforeProviderRequest": requests_after == 2,
        "reasonMentionsModel": any("Harness model is not available" in reason for reason in reasons),
        "reasons": [reason[:200] for reason in reasons[-2:]],
    }


def run_cancel_round(client, runtime, opened, endpoint, credential_id, production) -> dict:
    """Cancel a turn while its provider request is still held open.

    The endpoint never answers request three, so the only way this turn can
    become terminal is the cancel the Server sends - which is also the only way
    the adapter's `abort` op (`session/cancel`) is exercised on this chain. The
    turn must reach a terminal state well before the hold would expire, and the
    attempt's own cleanup must remove its projections.
    """
    profile = client.post("/api/v1/profiles", headers={
        "Authorization": f"Bearer {runtime.token}",
        "Idempotency-Key": "codex-gate-cancel-profile",
    }, json={"name": "Codex cancel gate", "harness_type": "codex",
             "configuration": {}, "credential_id": credential_id}).json()
    provider = wire_post(client, runtime.token, "providerModels.create", {
        "requestId": "codex-gate-cancel-provider", "displayName": "DeepSeek official",
        "harness": "codex", "provider": "deepseek", "credentialId": credential_id,
        "configuration": [], "models": [{
            "modelId": production.PRODUCT_MODEL_ID, "displayName": "DeepSeek Flash",
            "availability": "available", "unavailableReason": None,
        }],
    })["providerModel"]
    configured = wire_post(client, runtime.token, "profiles.updateConfig", {
        "requestId": "codex-gate-cancel-config", "profileId": profile["profile_id"],
        "expectedVersion": profile_version(client, runtime, profile["profile_id"]),
        "values": [{"controlId": "model", "value": {
            "providerId": provider["id"], "modelId": production.PRODUCT_MODEL_ID,
        }}],
    })["profile"]
    configured_version = int(configured["version"])
    sent = wire_post(client, runtime.token, "sessions.createAndSend", {
        "requestId": "codex-gate-cancel-session", "workspaceId": opened["id"],
        "profileId": configured["id"], "overrides": [],
        "message": {"text": "This turn will be cancelled while it waits.",
                    "attachments": []},
    })
    session_id = sent["session"]["id"]
    deadline = time.monotonic() + 120.0
    while time.monotonic() < deadline and len(endpoint.requests) < 3:
        session = runtime.repository.get_session(session_id)
        if session["turns"] and session["turns"][0]["state"] in {"failed", "cancelled"}:
            REPORT["diagnostics"] = turn_diagnostics(runtime, session, 0)
            fail("CODEX_GATE_CANCEL_ROUND_EARLY_FAILURE", "the cancel round failed before its request arrived")
        time.sleep(0.05)
    if len(endpoint.requests) < 3:
        fail("CODEX_GATE_CANCEL_REQUEST_MISSING",
             "the cancel round never produced a provider request to hold open")
    session = runtime.repository.get_session(session_id)
    if not session["turns"]:
        fail("CODEX_GATE_CANCEL_TURN_MISSING", "the cancel round has no durable turn to cancel")
    turn_id = session["turns"][0]["id"]
    started = time.monotonic()
    response = client.post(f"/api/v1/turns/{turn_id}/cancel", headers={
        "Authorization": f"Bearer {runtime.token}", "Idempotency-Key": "codex-gate-cancel",
    }, json={})
    requested = response.status_code
    session = wait_for_terminal(runtime, session_id, 0, timeout=90.0)
    elapsed = time.monotonic() - started
    endpoint.release_hold.set()
    turn = session["turns"][0]
    if turn["state"] != "cancelled":
        REPORT["diagnostics"] = turn_diagnostics(runtime, session, 0)
        fail("CODEX_GATE_CANCEL_NOT_HONOURED", f"the cancelled turn ended as {turn['state']!r}")
    if elapsed > CANCEL_HOLD_SECONDS - 5:
        fail("CODEX_GATE_CANCEL_TOO_SLOW",
             f"the cancel took {elapsed:.1f}s, which is not before the hold expiries")
    return {
        "cancelStatus": requested,
        "turnState": turn["state"],
        "elapsedSeconds": round(elapsed, 3),
        "providerRequestsBeforeCancel": 3,
        "profileVersionUsed": configured_version,
        "cleanupState": turn.get("cleanup_state"),
        "captureState": turn.get("capture_state"),
    }


def scan_state(runtime, session: dict, native_id: str) -> dict:
    """The credential must not appear in any captured native state."""
    checkpoint = json.loads(runtime.objects.read(session["checkpoint"]["object_digest"]))
    hits = []
    total = 0
    for item in checkpoint.get("files", []):
        content = runtime.objects.read(item["digest"])
        total += len(content)
        if FAKE_TOKEN.encode() in content:
            hits.append(item["path"])
    if hits:
        fail("CODEX_GATE_TOKEN_IN_STATE", f"the credential appears in captured state: {hits[:3]}")
    return {"files": len(checkpoint.get("files", [])), "bytes": total,
            "tokenHits": [], "tokenInState": False,
            "nativeSessionId": checkpoint.get("nativeSessionId") == native_id}


# --------------------------------------------------------------------------
# gate: native reopen, process evidence, guest-side audit
# --------------------------------------------------------------------------

def audit_shim_source(production, workspace: Path, host_home: Path) -> str:
    del workspace  # the shim only ever names guest paths
    """The guest-side audit shim that is spawned as the adapter process.

    It is a *listed* test-only replacement for one observation phase: it records
    the process-level facts the Server cannot see (the adapter's own environment,
    the `app-server` child's environment, which ACP method the bridge uses to
    reopen, what the read-only projections do when written, and whether the two
    home spellings agree), then runs the genuine adapter unchanged, forwarding
    its stdio byte for byte.

    It records the ACP *client -> agent* direction only. That stream carries
    session ids, prompts and method names; the credential is injected as an
    environment variable and never appears in it (the adapter reads it from its
    own environment).
    """
    # The audit file is named by its *guest* path: the shim runs inside the mount
    # namespace, where the project is mounted at /workspace. It is the same file
    # the host side reads back through the bind mount.
    audit = f"/workspace/{ADAPTER_AUDIT_NAME}"
    return f"""// AgentBox Codex gate audit shim (test-only; never part of a deployment).
import {{ spawn }} from "node:child_process"
import {{ appendFileSync, existsSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync }} from "node:fs"
import {{ createHash }} from "node:crypto"
import os from "node:os"
import path from "node:path"

const AUDIT = {json.dumps(audit)}
const REAL = {json.dumps(production.ADAPTER_ARTIFACT_ENTRY)}
const HOST_HOME = {json.dumps(str(host_home))}
const CODEX_HOME = {json.dumps(production.CODEX_HOME)}
const CONFIG = {json.dumps(production.CONFIG_TARGET)}
const MODELS = {json.dumps(production.MODELS_TARGET)}
const SENTINEL = {json.dumps(PROFILE_SENTINEL)}
const WRITE_PROBE = {json.dumps(f"{production.STATE_TARGET}/{AUDIT_WRITE_PROBE}")}

let pid = process.pid
function record(kind, data) {{
  try {{
    appendFileSync(AUDIT, JSON.stringify({{ kind, pid, at: Date.now() / 1000, ...data }}) + "\\n")
  }} catch {{}}
}}

function probeWrite(target) {{
  try {{
    writeFileSync(target, "agentbox-codex-gate-write-probe\\n")
    return "wrote"
  }} catch (error) {{
    return error?.code ?? String(error)
  }}
}}

function readIfPresent(target) {{
  try {{
    const bytes = readFileSync(target)
    return {{ bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }}
  }} catch (error) {{
    return {{ error: error?.code ?? String(error) }}
  }}
}}

record("start", {{
  adapterEntry: REAL,
  cwd: process.cwd(),
  environment: {{
    CODEX_HOME: process.env.CODEX_HOME ?? null,
    HOME: process.env.HOME ?? null,
    PATH: process.env.PATH ?? null,
    noBrowser: process.env.NO_BROWSER ?? null,
  }},
  homedir: os.homedir(),
  derivedDefaultHome: path.join(os.homedir(), ".codex"),
  codexHomeMatchesDerivedDefault: (() => {{
    try {{ return realpathSync(CODEX_HOME) === realpathSync(path.join(os.homedir(), ".codex")) }}
    catch {{ return false }}
  }})(),
  credentialEnvironmentVisibleInArgv: process.argv.some((value) => /^sk-/.test(value)),
}})

record("projection", {{
  config: readIfPresent(CONFIG),
  models: readIfPresent(MODELS),
  configCarriesProfileSentinel: (() => {{
    try {{ return readFileSync(CONFIG, "utf8").includes(SENTINEL) }} catch {{ return false }}
  }})(),
  modelsListing: (() => {{
    try {{ return readdirSync(CODEX_HOME).sort() }} catch {{ return [] }}
  }})(),
  hostHomeVisible: existsSync(HOST_HOME),
  hostHomeSentinelVisible: existsSync(path.join(HOST_HOME, "sentinel")),
  hostCodexVisible: existsSync(path.join(HOST_HOME, ".codex", "sentinel")),
  writeConfig: probeWrite(CONFIG),
  writeModels: probeWrite(MODELS),
  writeState: probeWrite(WRITE_PROBE),
  stateProbeBytes: (() => {{
    try {{ return statSync(WRITE_PROBE).size }} catch {{ return null }}
  }})(),
}})

// The `app-server` grandchild is the process that reads the isolated home; its
// own environment is what proves CODEX_HOME was inherited rather than assumed.
let observed = false
const poll = setInterval(() => {{
  if (observed) return
  let entries = []
  try {{ entries = readdirSync("/proc") }} catch {{ return }}
  for (const entry of entries) {{
    if (!/^[0-9]+$/.test(entry) || entry === String(pid)) continue
    let cmdline = ""
    let environ = ""
    try {{
      cmdline = readFileSync(`/proc/${{entry}}/cmdline`, "utf8")
      if (!cmdline.includes("app-server")) continue
      environ = readFileSync(`/proc/${{entry}}/environ`, "utf8")
    }} catch {{ continue }}
    const wanted = {{}}
    for (const pair of environ.split("\\u0000")) {{
      const index = pair.indexOf("=")
      if (index <= 0) continue
      const key = pair.slice(0, index)
      if (["CODEX_HOME", "HOME", "PATH", "NO_BROWSER"].includes(key)) wanted[key] = pair.slice(index + 1)
    }}
    record("app-server", {{
      pid: Number(entry),
      cmdline: cmdline.split("\\u0000").filter(Boolean).slice(0, 4),
      environment: wanted,
      inheritsChildEnvironment: wanted.CODEX_HOME === process.env.CODEX_HOME,
    }})
    observed = true
  }}
}}, 200)
setTimeout(() => clearInterval(poll), 60000)

const child = spawn(process.execPath, [REAL], {{ stdio: ["pipe", "inherit", "pipe"] }})
let pending = ""
process.stdin.on("data", (chunk) => {{
  pending += chunk.toString("utf8")
  for (;;) {{
    const index = pending.indexOf("\\n")
    if (index < 0) break
    const line = pending.slice(0, index)
    pending = pending.slice(index + 1)
    const trimmed = line.trim()
    if (trimmed) {{
      try {{
        const message = JSON.parse(trimmed)
        record("acp-request", {{ method: message.method ?? null, id: message.id ?? null }})
      }} catch {{
        record("acp-request", {{ method: null, unparsed: true }})
      }}
    }}
    child.stdin.write(line + "\\n")
  }}
}})
process.stdin.on("end", () => child.stdin.end())
child.stderr.on("data", (chunk) => process.stderr.write(chunk))
child.on("exit", (code, signal) => {{
  clearInterval(poll)
  record("end", {{ exitCode: code, signal: signal ?? null }})
  process.exit(code ?? 0)
}})
child.on("error", (error) => {{
  record("end", {{ error: String(error?.message ?? error) }})
  process.exit(1)
}})
"""


def protected_state_paths(production) -> tuple[str, ...]:
    """The read-only paths inside the state subtree, derived the Server's way.

    The production Server derives this tuple from the deployment declaration
    itself (`runtime._protected_state_paths` -> `home_projection`); the gate's
    direct phases build the launcher by hand, so they pass the same derived
    value rather than letting the two read-only files be captured as state.
    """
    from agent_box_sandbox_bwrap import protected_state_paths as derive

    targets = tuple(item["target"] for item in production.projection_files())
    return tuple(derive(targets, production.STATE_TARGET))


def observe_reopen(temporary, workspace, worker, artifact, digest, production, token_path,
                   host_home) -> dict:
    """What the Harness actually did to reopen the stored Session, plus process evidence.

    The Server cannot see inside the guest, so this phase drives the same reviewed
    launcher with the same artifact, configuration, credential and Worker, with a
    listed guest-side audit shim in front of the genuine adapter. It records the
    ACP methods the bridge sends (so the reopen method is read off the wire, not
    guessed), the `app-server` child's inherited environment, the write behaviour
    of the two read-only projections, and the sentinel isolation of the
    controlled host home.
    """
    from agent_box.server.execution.sidecar import (
        SidecarHarnessPort, WslSidecarLauncher, sidecar_bundle_files,
    )

    endpoint = FakeEndpoint(FAKE_TOKEN, budget=2)
    endpoint.start()
    try:
        loopback = loopback_config_bytes(endpoint, production)
        bundle = sidecar_bundle_files(PLUGIN, additional_files={
            f"agentbox-sidecar/deployment/codex/projection-config.toml": loopback,
            f"agentbox-sidecar/deployment/codex/projection-models.json": production.models_bytes(),
        })
        shim = workspace / "codex-gate-audit-adapter.mjs"
        shim.write_text(audit_shim_source(production, workspace, host_home), encoding="utf-8")
        events: list[dict] = []
        state_directory = temporary / "sidecar-state"
        state_directory.mkdir(exist_ok=True)

        def port_for(resume_native_id=None, restored_state=None):
            launcher = WslSidecarLauncher(
                DirectWorkerConnector(temporary, worker, workspace),
                workspace={"distribution": "Ubuntu", "remote_user": os.environ["USER"],
                           "connection_id": "connection-codex-reopen",
                           "remote_path": str(workspace)},
                bundle=bundle, credential=FAKE_TOKEN.encode(),
                runtime_artifact_authorizations=({
                    "path": str(artifact), "target": production.ARTIFACT_TARGET,
                    "digest": digest},),
                runtime_artifact_mounts=((str(artifact), production.ARTIFACT_TARGET),),
                projection_mounts=(
                    ("agentbox-sidecar/deployment/codex/projection-config.toml",
                     production.CONFIG_TARGET),
                    ("agentbox-sidecar/deployment/codex/projection-models.json",
                     production.MODELS_TARGET),
                ),
                state_bundle_prefix="agentbox-sidecar/deployment/codex/native-state",
                state_target=production.STATE_TARGET,
                state_ephemeral_paths=(
                    () if LEGACY_STATE_DIAGNOSTIC else (".tmp", "shell_snapshots")
                ),
                protected_state_paths=protected_state_paths(production),
                restored_state=restored_state,
                timeout_ms=120_000,
            )
            return SidecarHarnessPort(
                launcher, environment={"AGENTBOX_SIDECAR_ISOLATED": "1"}, profile="codex",
                adapter={"command": "/usr/bin/node",
                         "args": [f"/workspace/{shim.name}"],
                         "environment": dict(production.ADAPTER_ENVIRONMENT)},
                model=production.PRODUCT_MODEL_ID,
                credential_environment=production.CREDENTIAL_ENVIRONMENT,
                preferred_auth_method=production.PREFERRED_AUTH_METHOD,
                resume_native_id=resume_native_id,
                state_directory=str(state_directory), directory="/workspace",
                declared_capabilities=production.capability_claims(),
                on_event=lambda _execution, kind, data: events.append(
                    {"kind": kind, "text": str((data or {}).get("text") or "")[:120]}),
            )

        try:
            first = port_for()
            try:
                native = first.open_execution("reopen-round-1")
                first.prompt("reopen-round-1", f"Remember {NONCE_ROUND_1} and reply with it.")
                state, resumable = first.capture_execution("reopen-round-1")
            finally:
                first.stop()
            events.clear()
            second = port_for(resume_native_id=native, restored_state=state)
            try:
                reopened = second.open_execution("reopen-round-2")
                during_reopen = list(events)
                second.prompt("reopen-round-2", "What did I ask you to remember? Reply with the nonce.")
                after_prompt = list(events)
            finally:
                second.stop()
        finally:
            endpoint.stop()
    finally:
        endpoint.stop()

    audit_records = read_audit(workspace)
    runs = split_runs(audit_records)
    requests = [record for record in audit_records if record["kind"] == "acp-request"]
    first_run = run_requests(runs, 1)
    second_run = run_requests(runs, 2)
    server_records = [record for record in audit_records if record["kind"] == "app-server"]
    projection = next((record for record in audit_records if record["kind"] == "projection"), {})
    start = next((record for record in audit_records if record["kind"] == "start"), {})
    REPORT["guestRuns"] = len(runs)
    if not first_run or not second_run:
        fail("CODEX_GATE_AUDIT_MISSING", "the guest-side audit shim recorded no ACP traffic")
    methods_first = [item.get("method") for item in first_run]
    methods_second = [item.get("method") for item in second_run]
    reopen_method = next((method for method in methods_second if method in {"session/resume", "session/load"}), None)
    if reopen_method is None:
        fail("CODEX_GATE_REOPEN_METHOD_UNKNOWN",
             f"no reopen method was observed; the second run sent {methods_second}")
    if "session/new" not in methods_first or "session/prompt" not in methods_first:
        fail("CODEX_GATE_FIRST_RUN_METHODS", f"the first run sent {methods_first}")

    answered = endpoint.requests
    context_in_second = bool(answered) and any(
        item["structure"]["input"] and any(
            entry["role"] == "user" and entry["containsRound1User"]
            for entry in item["structure"]["input"])
        for item in answered[-1:])

    result = {
        "nativeSessionIdStable": reopened == native,
        "stateFiles": len(state), "stateResumable": bool(resumable),
        "acpMethodsFirstRun": methods_first,
        "acpMethodsSecondRun": methods_second,
        "nativeReopenMethod": reopen_method,
        "chunksDuringReopen": during_reopen[:8],
        "chunksAfterReopenPrompt": after_prompt[:8],
        "providerRequests": len(answered),
        "secondRunCarriesRoundOneContext": context_in_second,
        "processEvidence": {
            "adapterEnvironment": start.get("environment"),
            "homedir": start.get("homedir"),
            "derivedDefaultHome": start.get("derivedDefaultHome"),
            "codexHomeMatchesDerivedDefault": start.get("codexHomeMatchesDerivedDefault"),
            "appServerChildren": [
                {"pid": item.get("pid"), "cmdline": item.get("cmdline"),
                 "environment": item.get("environment"),
                 "inheritsChildEnvironment": item.get("inheritsChildEnvironment")}
                for item in server_records[:2]
            ],
        },
        "projectionEvidence": {
            "config": projection.get("config"), "models": projection.get("models"),
            "configCarriesProfileSentinel": projection.get("configCarriesProfileSentinel"),
            "writeConfig": projection.get("writeConfig"),
            "writeModels": projection.get("writeModels"),
            "writeState": projection.get("writeState"),
            "stateProbeBytes": projection.get("stateProbeBytes"),
            "hostHomeVisible": projection.get("hostHomeVisible"),
            "hostHomeSentinelVisible": projection.get("hostHomeSentinelVisible"),
            "hostCodexVisible": projection.get("hostCodexVisible"),
            "codexHomeListing": projection.get("modelsListing"),
        },
    }
    if not result["nativeSessionIdStable"]:
        fail("CODEX_GATE_REOPEN_IDENTITY_CHANGED", "the reopened native session id changed")
    if not result["secondRunCarriesRoundOneContext"]:
        fail("CODEX_GATE_REOPEN_CONTEXT_MISSING",
             "the reopened session's request carried none of the first round's user message")
    if not start.get("codexHomeMatchesDerivedDefault"):
        fail("CODEX_GATE_HOME_DERIVATION_MISMATCH",
             "$HOME/.codex and CODEX_HOME did not resolve to the same directory")
    if projection.get("writeConfig") != "EROFS" or projection.get("writeModels") != "EROFS":
        fail("CODEX_GATE_READ_ONLY_PROJECTION_WRITABLE",
             f"writing the read-only projections returned {projection.get('writeConfig')!r}/"
             f"{projection.get('writeModels')!r}")
    if projection.get("writeState") != "wrote":
        fail("CODEX_GATE_STATE_NOT_WRITABLE",
             f"writing inside the state projection returned {projection.get('writeState')!r}")
    if projection.get("hostHomeVisible") or projection.get("hostHomeSentinelVisible") \
            or projection.get("hostCodexVisible"):
        fail("CODEX_GATE_HOST_HOME_VISIBLE", "the controlled host home is visible inside the guest")
    if not projection.get("configCarriesProfileSentinel"):
        fail("CODEX_GATE_PROFILE_SENTINEL_MISSING",
             "the Profile projection the guest reads carries no sentinel")
    expected_config = loopback_config_bytes(endpoint, production)
    if projection.get("config", {}).get("sha256") != hashlib.sha256(expected_config).hexdigest():
        fail("CODEX_GATE_CONFIG_NOT_THE_PROJECTION",
             "the guest read a different config.toml than this run projected")
    if projection.get("models", {}).get("sha256") != hashlib.sha256(
            production.models_bytes()).hexdigest():
        fail("CODEX_GATE_MODELS_NOT_THE_PROJECTION",
             "the guest read a different models.json than the full official catalogue")
    if not result["processEvidence"]["appServerChildren"]:
        fail("CODEX_GATE_APPSERVER_NOT_OBSERVED",
             "no app-server child process was observed inside the guest")
    if not all(item["inheritsChildEnvironment"]
               for item in result["processEvidence"]["appServerChildren"]):
        fail("CODEX_GATE_APPSERVER_ENVIRONMENT_MISMATCH",
             "the app-server child did not inherit the adapter's CODEX_HOME")
    if FAKE_TOKEN in json.dumps(result):
        fail("CODEX_GATE_TOKEN_IN_AUDIT", "the credential reached the guest-side audit")
    return result


def read_audit(workspace: Path) -> list[dict]:
    """Every record the guest-side shim wrote, in order."""
    audit = workspace / ADAPTER_AUDIT_NAME
    if not audit.is_file():
        fail("CODEX_GATE_AUDIT_ABSENT", "the guest-side audit file was not written")
    records = []
    for line in audit.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            records.append(json.loads(line))
        except ValueError:
            fail("CODEX_GATE_AUDIT_INVALID", "the guest-side audit file is not valid JSON lines")
    return records


def split_runs(records: list[dict]) -> list[list[dict]]:
    """The shim's records split into one group per adapter process it fronted.

    Grouping by pid is wrong here: every bwrap execution gets its own PID
    namespace, so two runs both see their shim as pid 13. The shim's own
    `start` record is the delimiter that carries no such assumption.
    """
    runs: list[list[dict]] = []
    for record in records:
        if record.get("kind") == "start" or not runs:
            runs.append([])
        runs[-1].append(record)
    return runs


def run_requests(runs: list[list[dict]], index: int) -> list[dict]:
    """The ACP requests of one run, in the order the bridge sent them."""
    if len(runs) < index:
        return []
    return [{"method": record.get("method"), "id": record.get("id")}
            for record in runs[index - 1] if record.get("kind") == "acp-request"]


# --------------------------------------------------------------------------
# cleanup
# --------------------------------------------------------------------------


#: Process patterns that mean a native Harness for this gate is still alive.
HARNESS_PROCESS_PATTERNS = ("codex-acp/dist/index.js", "app-server", "codex-gate-audit-adapter")


def harness_processes(temporary: Path) -> list[str]:
    """Harness processes of *this* run that are still alive (own-root scope)."""
    survivors = []
    for pattern in HARNESS_PROCESS_PATTERNS:
        lines = subprocess.run(
            ["pgrep", "-af", pattern], capture_output=True, text=True).stdout.splitlines()
        survivors.extend(
            line for line in lines if str(temporary) in line or "codex-runtime" in line)
    return survivors


def settle_after_attempt(watcher: "StateSymlinkWatcher", temporary: Path,
                         timeout_s: float = 10.0, interval_s: float = 0.25) -> dict:
    """Wait, bounded, until the run's Harness processes are gone, then take one
    synchronous scan of whatever state tree is still on disk.

    User decision A fixes the *settled window* here: it starts only after the
    native processes have exited (nothing can write any more) and is observed by
    a synchronous, bounded scan - never by a cycle that merely looked stable
    while the harness was still running. When the capture pipeline already
    reclaimed the view, the evidence for the same window is the
    capture-boundary scan of the captured checkpoint (`scan_state`), which is
    fatal on any hit.
    """
    deadline = time.monotonic() + timeout_s
    survivors = harness_processes(temporary)
    while survivors and time.monotonic() < deadline:
        time.sleep(interval_s)
        survivors = harness_processes(temporary)
    evidence = {
        "harnessExited": not survivors,
        "survivors": survivors[:2],
        "settledScan": "capture-boundary",
        "settledCycles": 0,
    }
    if not survivors:
        evidence.update(watcher.scan_once())
    return evidence


def finalize_run(report: dict, settled_window: dict, watcher) -> tuple[str | None, str]:
    """The one post-run decision, driven by the real scan evidence.

    Extracted so the *control flow* (not just the pure verdict) is testable: it
    reads the run's watcher and settled window, records the scan block, and
    answers what must fail. A credential hit outranks every other failure, so a
    hit that coincides with a chain failure still ends the run with the
    credential code and the chain failure is kept as structured secondary
    evidence by the caller.
    """
    verdict, detail = credential_scan_verdict(
        watcher.token_hits, watcher.scan_error, watcher.stopped_cleanly,
        LEGACY_STATE_DIAGNOSTIC, watcher.scan_incomplete, watcher.scan_completed,
        watcher.race_events, watcher.incomplete_events,
        settled_window.get("settledCycles"), None, None,
        settled_window.get("harnessExited"), settled_window.get("settledIncomplete"),
    )
    report["credentialScan"] = {
        "filesObserved": watcher.scanned_files,
        "cyclesCompleted": watcher.scan_completed,
        "incomplete": watcher.scan_incomplete,
        "raceEvents": watcher.race_events,
        "incompleteEvents": watcher.incomplete_events,
        "settledCycles": settled_window.get("settledCycles"),
        "settledScan": settled_window.get("settledScan"),
        "settledIncomplete": settled_window.get("settledIncomplete"),
        "harnessExited": settled_window.get("harnessExited"),
        "error": watcher.scan_error,
        "stoppedCleanly": watcher.stopped_cleanly,
    }
    return verdict, detail


def credential_scan_verdict(
    token_hits: list[dict], scan_error: str | None, stopped_cleanly: bool,
    legacy_diagnostic: bool = False, scan_incomplete: str | None = None,
    scan_completed: int = 0, race_events: list[dict] | None = None,
    incomplete_events: list[dict] | None = None,
    settled_cycles: int | None = None,
    settled_races: list[dict] | None = None,
    settled_incomplete: list[dict] | None = None,
    harness_exited: bool | None = None,
    settled_scan_incomplete: str | None = None,
) -> tuple[str | None, str]:
    """The typed verdict for one run's credential-path scan.

    A hit means the injected (fake) credential material reached native state -
    the exact risk the paid preflight must not carry - so it fails in every
    mode; the legacy diagnostic mode only additionally names the file. An
    incomplete scan also fails: absence of evidence is only evidence when the
    scan provably ran to completion.

    User decision A scopes the *completeness* judgement to the settled window:
    the phase after the attempts ended, when the tree is no longer written. A
    hit is fatal wherever it was seen; churn recorded during the active window
    is carried as an observation (active_races/active_incomplete) and does not
    fail the run, while the settled window must contain at least one fully
    observed cycle with no races.
    """
    if token_hits:
        # A direct observation outranks every secondary failure: the credential
        # material was seen in native state, whatever else also happened.
        paths = [hit.get("path") for hit in token_hits]
        return ("CODEX_GATE_CREDENTIAL_IN_NATIVE_STATE",
                "the injected fake token reached native state; sanitized paths: "
                + json.dumps(paths))
    if scan_error is not None:
        return "CODEX_GATE_STATE_SCAN_INCOMPLETE", f"the state credential scanner crashed: {scan_error}"
    if not stopped_cleanly:
        return ("CODEX_GATE_STATE_SCAN_INCOMPLETE",
                "the state credential scanner did not stop cleanly")
    if settled_cycles is not None:
        # Settled-window semantics: only this window has to be fully observed.
        if harness_exited is False:
            return ("CODEX_GATE_STATE_SCAN_INCOMPLETE",
                    "native Harness processes were still alive after the attempts; the "
                    "settled window could not be opened")
        if settled_scan_incomplete:
            return ("CODEX_GATE_STATE_SCAN_INCOMPLETE",
                    "the settled-window scan could not cover everything: "
                    + str(settled_scan_incomplete))
        # settled_cycles == 0 with a complete scan means the view was already
        # reclaimed by the capture pipeline: the evidence for this same window
        # is then the capture-boundary scan (`scan_state`), which is fatal on
        # any hit. Both are recorded in the report.
        # Raced or unobservable cycles after a settled one belong to the next
        # period of harness activity; they are observations in the report, not
        # failures. What the verdict requires is that the tree was fully
        # observed at least once while it held still, with no token anywhere.
        return None, ""
    if scan_incomplete is not None:
        return ("CODEX_GATE_STATE_SCAN_INCOMPLETE",
                f"the state credential scanner could not cover everything: {scan_incomplete}")
    if race_events:
        return ("CODEX_GATE_STATE_SCAN_INCOMPLETE",
                "state files changed while they were read; sanitized paths: "
                + json.dumps([event.get("path") for event in race_events]))
    if incomplete_events:
        return ("CODEX_GATE_STATE_SCAN_INCOMPLETE",
                "the state credential scanner recorded incomplete observations: "
                + json.dumps([event.get("reason") for event in incomplete_events]))
    if scan_completed <= 0:
        return ("CODEX_GATE_STATE_SCAN_INCOMPLETE",
                "the state credential scanner never completed a scan cycle")
    return None, ""


def annotate_known_blocker(report: dict | None = None) -> None:
    """Record alias-link observations next to a failed turn, without causal claims.

    Historical context: the native Codex CLI installs argv0 alias symlinks under
    `$CODEX_HOME/tmp/arg0/<random>/` while it runs, and one early run failed at
    the state capture with `VIEW_INVALID` because the listing then refused any
    tree containing a symlink. That diagnosis is preserved in the Codex
    packaging report. It cannot be re-attached automatically: a code alone does
    not prove the links caused the failure (the file-limit and secret-scan
    failures each have first-hand unrelated causes), and the annotation has no
    failing-path evidence to link. So every failure that coincides with the
    observed links is recorded as a co-observation, and no `blocker` key is
    produced at all. Nothing here changes an outcome.
    """
    report = REPORT if report is None else report
    diagnostics = report.get("diagnostics") or {}
    turn = diagnostics.get("turn") or {}
    observed = report.get("stateSymlinksObserved") or []
    if not observed or not turn.get("error_code"):
        return
    report["stateSymlinkCoObservation"] = {
        "note": (
            "alias links were observed while the turn failed; the failure cause "
            "is whatever its error code names - recorded as a co-observation, "
            "never a causal blocker (the historical alias diagnosis lives in "
            "the Codex packaging report)"
        ),
        "observedStateSymlinks": observed[:8],
        "turnErrorCode": turn.get("error_code"),
        "turnCaptureState": turn.get("capture_state"),
    }


def cleanup_check(temporary: Path, workspace: Path, token_path: Path) -> None:
    """Nothing this gate projected may survive the run."""
    worker_root = temporary / "worker-root"
    leftovers = [name for name in ("views", "secrets") if (worker_root / name).exists()]
    if leftovers:
        fail("CODEX_GATE_WORKER_LEFTOVER", f"the Worker kept {leftovers}")
    survivors = []
    for pattern in ("codex-acp/dist/index.js", "app-server", "codex-gate-audit-adapter"):
        lines = subprocess.run(["pgrep", "-af", pattern], capture_output=True, text=True).stdout.splitlines()
        survivors.extend(
            line for line in lines if str(temporary) in line or "codex-runtime" in line)
    if survivors:
        fail("CODEX_GATE_PROCESS_ALIVE", f"a Codex process survived: {survivors[:2]}")
    if token_path.exists():
        token_path.unlink()
    if token_path.exists():
        fail("CODEX_GATE_CLEANUP_FAILED", "the temporary fake token could not be removed")
    remove_tree(workspace)
    REPORT.setdefault("cleanup", {}).update({
        "workerProjectionsRemoved": True, "adapterProcessesRemoved": True,
        "fakeTokenRemoved": not token_path.exists(), "workspaceRemoved": not workspace.exists(),
    })


if __name__ == "__main__":
    raise SystemExit(main())
