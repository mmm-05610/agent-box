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
#: The bytes actually injected this run (the fake token, or the authorized
#: locator's content in live mode). Only the scans read it; nothing prints it.
INJECTED_CREDENTIAL: bytes = FAKE_TOKEN.encode()
#: Set from --live in main(). The phases that keep their own loopback audit
#: endpoint read it so the report says which endpoint their request counts
#: belong to, instead of letting a mechanism-audit count look like a model call.
LIVE_MODE = False
#: Set from --legacy-state-diagnostic in main(); read by the sidecar launcher.
LEGACY_STATE_DIAGNOSTIC = False
#: Set from --official-feature-flags in main(); read by the config builder.
FEATURE_FLAG_CONTROL = False
#: Set from --strip-flags: None means the whole [features] table.
FEATURE_FLAG_STRIP: str | None = None
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
#: Live cancel bounds: how long to wait for the real answer's first streamed
#: delta (that is what a live in-flight window is measured by), how long the
#: cancel itself may take to end the turn, and the hard wait for that terminal
#: state. These are observations of the Server's own state, not of the endpoint.
LIVE_CANCEL_STREAM_SECONDS = 120.0
LIVE_CANCEL_SECONDS = 30.0
LIVE_CANCEL_TERMINAL_SECONDS = 60.0
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


class CredentialStateScanner:
    """One scanner instance, one owner: nothing here is shared between a
    background observer and a synchronous settled-window scan.

    The state subtree is Harness-writable, so every walk is fd-anchored and
    opens each component with O_NOFOLLOW (the Worker's own discipline). A scan
    is *complete* only when the whole active tree was walked within every budget
    and no file was skipped for an unknown reason; a raced file is recorded and
    makes the scan incomplete, and an unobservable file (past a budget) always
    makes it incomplete. Only sanitized relative paths are recorded.
    """

    def __init__(self, worker_root: Path, token: bytes) -> None:
        self.worker_root = worker_root
        self.token = token
        self.observed_identity: dict[str, tuple] = {}
        self.scanned_entries = 0
        self.scanned_files = 0
        self.scanned_bytes = 0
        self.cycle_complete = True
        self.incomplete: str | None = None
        self.races: list[dict] = []
        self.hits: list[dict] = []
        self.cycles_completed = 0
        self.targets_scanned = 0
        self.peak_files = 0
        self.peak_directory_counts: list[tuple[str, int]] = []
        self.peak_sample: list[str] = []
        self.peak_special = 0

    # -- public -----------------------------------------------------------

    def scan(self, *, sample_peak: bool = False) -> dict:
        """Walk the tree once and report exactly what this pass observed."""
        self.observed_identity = {}
        self.scanned_entries = 0
        self.scanned_files = 0
        self.scanned_bytes = 0
        self.cycle_complete = True
        self.incomplete = None
        self.races = []
        self.hits = []
        views = self.worker_root / "views"
        if not views.is_dir():
            # No view is *not* an unobserved tree: the capture pipeline already
            # reclaimed it, and the caller judges that window on the
            # capture-boundary evidence instead. `viewsOnDisk` says which it was.
            self.incomplete = None
            return self._summary(views_exist=False)
        views_fd = _open_dir_fd(views)
        completed_here = 0
        try:
            with os.scandir(f"/proc/self/fd/{views_fd}") as entries:
                for entry in entries:
                    view_fd = None
                    try:
                        view_fd = _open_beneath_fd(views_fd, (entry.name, "ready"), True)
                        self._scan_directory(
                            view_fd, "agentbox-sidecar/deployment/codex/native-state")
                        completed_here += 1
                    except FileNotFoundError:
                        continue
                    except OSError as error:
                        self._mark_incomplete(f"view {entry.name}: {error}")
                        continue
                    finally:
                        if view_fd is not None:
                            os.close(view_fd)
            self.targets_scanned = completed_here
            if completed_here and self.cycle_complete:
                self.cycles_completed += 1
        finally:
            os.close(views_fd)
        return self._summary(views_exist=True, sample_peak=sample_peak)

    # -- internals --------------------------------------------------------

    def _summary(self, *, views_exist: bool, sample_peak: bool = False) -> dict:
        return {
            "viewsOnDisk": views_exist,
            "targetsScanned": self.targets_scanned,
            # A pass that scanned no target view proves nothing: an empty
            # views/ directory (or one whose views all vanished) must fall back
            # to the capture-boundary evidence instead of counting as complete.
            "complete": self.cycle_complete and views_exist and self.targets_scanned > 0,
            "cyclesCompleted": self.cycles_completed,
            "files": self.scanned_files,
            "bytes": self.scanned_bytes,
            "entries": self.scanned_entries,
            "incomplete": self.incomplete,
            "races": list(self.races),
            "hits": list(self.hits),
            "identity": dict(self.observed_identity),
        }

    def _mark_incomplete(self, reason: str) -> None:
        self.cycle_complete = False
        if self.incomplete is None:
            self.incomplete = reason

    def _scan_directory(self, ready_fd: int, relative: str) -> None:
        directory = _open_beneath_fd(ready_fd, tuple(relative.split("/")), True)
        try:
            self._scan_entries(directory, relative)
        finally:
            os.close(directory)

    def _scan_entries(self, directory_fd: int, relative_dir: str) -> None:
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
                    if error.errno != errno.ELOOP:
                        self._mark_incomplete(f"{relative}: {error}")
                    continue
                try:
                    status = os.fstat(child)
                    if stat.S_ISDIR(status.st_mode):
                        self._scan_entries(child, relative)
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
                    if self.token in payload:
                        hit = {"path": relative, "phase": "during-run"}
                        if hit not in self.hits:
                            self.hits.append(hit)
                    if before_identity != after_identity:
                        raced = {"path": relative, "phase": "racing"}
                        if raced not in self.races:
                            self.races.append(raced)
                        self._mark_incomplete(f"{relative} changed while it was read")
                        continue
                finally:
                    os.close(child)


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
        #: Churn the observer saw while the attempts were running is recorded
        #: as an observation; the *settled* window (after the harness exited) is
        #: scanned by a separate, synchronous scanner - never by this thread.
        self.scan_completed = 0
        self.stopped_cleanly = False
        #: This thread owns one scanner and nothing else owns it. The settled
        #: window uses a *fresh* scanner, so no mutable scan state is ever
        #: shared between the observer and the synchronous pass.
        self._scanner = CredentialStateScanner(worker_root, FAKE_TOKEN.encode())
        self.harness_seen = False
        #: (pid, start time) of the Harness processes this run was seen running.
        self.harness_identities: list[tuple[int, str]] = []
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def start(self) -> None:
        self._thread.start()

    #: The observer's own scanner owns these; exposed so the report reads the
    #: same numbers whether they came from the thread or the settled pass.
    @property
    def scanned_files(self) -> int:
        return self._scanner.scanned_files

    def stop(self) -> None:
        """Stop the observer and answer whether it really stopped.

        Joining a thread that was never started raises, and a caller may settle a
        watcher whose start failed; in that case nothing was observing, which is
        reported honestly as "not stopped cleanly" rather than crashing.
        """
        self._stop.set()
        started = self._thread.ident is not None
        if started:
            self._thread.join(timeout=5)
        self.stopped_cleanly = started and not self._thread.is_alive()

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
                    self._observe_once(views)
                for row in matching_processes(self.worker_root.parent):
                    self.harness_seen = True
                    identity = (row["pid"], row["started"])
                    if identity not in self.harness_identities:
                        self.harness_identities.append(identity)
            self._stop.wait(self.interval)

    def _observe_once(self, views: Path) -> None:
        """One background observation: the scan plus the peak sampler."""
        if not views.is_dir():
            return
        summary = self._scanner.scan()
        for hit in summary.get("hits", ()):
            if hit not in self.token_hits:
                self.token_hits.append(hit)
        for raced in summary.get("races", ()):
            if raced not in self.race_events:
                self.race_events.append(raced)
        if summary.get("incomplete"):
            event = {"reason": summary["incomplete"]}
            if event not in self.incomplete_events:
                self.incomplete_events.append(event)
        self.scan_completed = self._scanner.cycles_completed
        self.scan_incomplete = summary.get("incomplete")

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


def without_feature_flags(config: bytes, strip: str | None = None) -> bytes:
    """The same config with `[features]` (or only some of its keys) removed.

    The control leg of the differential. `strip` selects individual flags
    (`--strip shell_snapshot`), which is how the causal influence of each one is
    separated; without it the whole table goes.

    Only that one table's lines are dropped: every other line - including the
    Profile sentinel comment the guest audit verifies - stays exactly as the
    deployment declared it. What is emitted must parse, so a malformed control
    config can never masquerade as a behaviour difference.
    """
    keys = {name.strip() for name in (strip or "").split(",") if name.strip()}
    out: list[str] = []
    skipping_table = False
    for line in config.decode("utf-8").splitlines(keepends=True):
        stripped = line.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            skipping_table = stripped == "[features]"
            if skipping_table and keys:
                out.append(line)          # keep the header for a per-key strip
                continue
            if skipping_table:
                continue
        if skipping_table:
            if keys and stripped and not stripped.startswith("#"):
                if stripped.split("=")[0].strip() in keys:
                    continue
        out.append(line)
    control = "".join(out)
    document = tomllib.loads(control)
    if keys:
        remaining = set(document.get("features", {}) or {})
        unknown = keys - set(
            tomllib.loads(config.decode("utf-8")).get("features", {}) or {})
        if unknown:
            raise ValueError(f"unknown feature flag to strip: {sorted(unknown)}")
        # A single-flag strip leaves every other reviewed flag in place.
        for name in ("plugins", "shell_snapshot"):
            if name not in keys and name not in remaining:
                raise ValueError(f"stripping {sorted(keys)} removed {name} as well")
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
        config = without_feature_flags(config, FEATURE_FLAG_STRIP)
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
        "--live", action="store_true",
        help="paid mode: the official endpoint and an authorized credential locator "
             "instead of the loopback fake endpoint (see "
             "docs/server-round1/fullstack/live-model-preflight.md)",
    )
    parser.add_argument(
        "--authorized-secret", default=None,
        help="path of the authorized credential file (only with --live)",
    )
    parser.add_argument(
        "--strip-flags", default=None,
        help="with --feature-flag-control-leg: strip only these feature keys "
             "(comma-separated) instead of the whole [features] table",
    )
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
    global LEGACY_STATE_DIAGNOSTIC, FEATURE_FLAG_CONTROL, FEATURE_FLAG_STRIP
    LEGACY_STATE_DIAGNOSTIC = bool(options.legacy_state_diagnostic)
    FEATURE_FLAG_CONTROL = bool(options.feature_flag_control_leg)
    FEATURE_FLAG_STRIP = options.strip_flags

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
        live = bool(options.live)
        global LIVE_MODE
        LIVE_MODE = live
        REPORT["mode"] = "live" if live else "loopback-fake-endpoint"
        secret_path = None
        if live:
            global INJECTED_CREDENTIAL
            secret_path = Path(options.authorized_secret).resolve()
            mode = secret_path.stat().st_mode & 0o777
            if mode & 0o077:
                fail("CODEX_GATE_LIVE_SECRET_PERMISSIONS", f"authorized secret mode is {oct(mode)}")
            endpoint = None
            differences = {}
        else:
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
        if not live and set(differences) != {f"model_providers.{production.PROVIDER_ID}.base_url"}:
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

        global INJECTED_CREDENTIAL
        token_path = temporary / "codex-gate-token"
        if live:
            token_path.write_bytes(secret_path.read_bytes())
        else:
            token_path.write_bytes(FAKE_TOKEN.encode())
        token_path.chmod(0o600)
        INJECTED_CREDENTIAL = token_path.read_bytes().strip()

        watcher = StateSymlinkWatcher(temporary / "worker-root")
        watcher.start()
        if endpoint is not None:
            endpoint.start()
        chain_failure = None
        outcome: dict = {}
        try:
            # The turn chain runs as a phase exactly like the reopen: its own
            # observer, its own post-exit settled scan, and settle/stop failures
            # collected into the phase instead of escaping the verdict.
            chain_evidence = observe_phase(
                temporary / "worker-root", temporary,
                lambda: run_chain(
                    temporary, workspace, worker, artifact, digest, endpoint, production,
                    token_path, host_home, live=live,
                ),
                name="turn-chain",
                existing_watcher=watcher,
            )
            outcome = chain_evidence.get("result") or {}
            chain_failure = chain_evidence.get("failure")
            if chain_failure is not None:
                chain_failure = GateFailure(
                    getattr(chain_failure, "code", None) or "CODEX_GATE_UNEXPECTED",
                    getattr(chain_failure, "message", None)
                    or f"{type(chain_failure).__name__}: {chain_failure}",
                )
            settled_window = chain_evidence
        finally:
            if endpoint is not None:
                endpoint.stop()
            # The endpoint's own record is the evidence for several requirements,
            # so it is reported even when the chain failed after it answered.
            REPORT["provider"] = (
                {"requests": None, "paths": [], "unauthorizedRequests": None,
                 "requestsBeyondBudget": None, "baseUrl": production.OFFICIAL_BASE_URL,
                 "silentFirstAnswerObservedSeconds": None, "mode": "live"}
                if endpoint is None else {
                    "requests": endpoint.requests, "paths": endpoint.paths,
                    "unauthorizedRequests": endpoint.unauthorized,
                    "requestsBeyondBudget": endpoint.over_budget,
                    "baseUrl": endpoint.base_url,
                    "silentFirstAnswerObservedSeconds": round(endpoint.silent_observed, 3),
                }
            )
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
        REPORT["settledWindow"] = phase_evidence_for_report(settled_window)
        # The reopen observation starts the adapter twice more with the same
        # injected token, so it runs as its own phase with its own observer and
        # its own settled scan; its failure is held, not raised, because the
        # credential verdict must be computed over every phase first.
        reopen_evidence = observe_phase(
            temporary / "worker-root", temporary,
            lambda: observe_reopen(temporary, workspace, worker, artifact, digest,
                                   production, token_path, host_home),
            name="reopen",
        )
        REPORT["reopenObservation"] = reopen_evidence.get("result")
        chain_phase = turn_chain_phase(REPORT, chain_evidence, watcher)
        failure = resolve_run_failure(REPORT, [chain_phase, reopen_evidence])
        secondaries = collect_secondary_failures([chain_phase, reopen_evidence])
        if secondaries:
            REPORT["secondaryFailures"] = secondaries
            REPORT["secondaryFailure"] = secondaries[0]
        if failure is not None:
            raise failure
        if chain_failure is not None:
            raise chain_failure
        if reopen_evidence.get("failure") is not None:
            raise reopen_evidence["failure"]
        if endpoint is not None and endpoint.over_budget:
            fail("CODEX_GATE_EXTRA_PROVIDER_REQUEST",
                 f"{endpoint.over_budget} provider requests exceeded the phase budget")
        if endpoint is not None and endpoint.unauthorized:
            fail("CODEX_GATE_UNAUTHORIZED_PROVIDER_REQUEST",
                 f"{endpoint.unauthorized} provider requests did not carry the injected token")
        cleanup_check(temporary, workspace, token_path)
        if secret_path is not None:
            # The authorized locator is the user's file, not this gate's output:
            # the run reads it into its own 0600 token file and never writes to
            # or removes it. A run that removed it would be a defect, so the
            # fact is asserted here rather than assumed from the code.
            REPORT["authorizedLocatorDeleted"] = not secret_path.exists()
            if REPORT["authorizedLocatorDeleted"]:
                fail("CODEX_GATE_AUTHORIZED_LOCATOR_DELETED",
                     "the authorized credential locator no longer exists after the run")
        REPORT["result"] = "CODEX_PRODUCTION_CHAIN_GATE_OK"
    except GateFailure as failure:
        primary = failure
    except BaseException as error:  # an unexpected crash is a failure too
        primary = GateFailure("CODEX_GATE_UNEXPECTED", f"{type(error).__name__}: {error}")
    finally:
        if endpoint is not None:
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
        print(json.dumps(REPORT, indent=2 if options.json else None, sort_keys=True,
                         default=unserializable_value))
        return 1
    print(json.dumps(REPORT, indent=2 if options.json else None, sort_keys=True,
                     default=unserializable_value))
    return 0


# --------------------------------------------------------------------------
# gate: the production seam
# --------------------------------------------------------------------------

def run_chain(temporary, workspace, worker, artifact, digest, endpoint, production,
              token_path, host_home, *, live: bool = False) -> dict:
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
    if INJECTED_CREDENTIAL.decode(errors="replace") in deployment.read_text(encoding="utf-8"):
        fail("CODEX_GATE_TOKEN_IN_DEPLOYMENT", "the credential reached the deployment document")

    # The no-model gate overrides base_url and carries a sentinel comment so the
    # guest audit can prove *which* config it read. Live mode projects the
    # deployed bytes unchanged: there is no override to make, and the sentinel's
    # job (proving the projected copy is the one the Harness read) is done by the
    # real answer instead.
    config_bytes = (
        production.config_bytes() if live else loopback_config_bytes(endpoint, production))

    import agent_box.server.bootstrap.runtime as runtime_module
    runtime_module._builtin_connector = lambda _id: DirectWorkerConnector(
        temporary, worker, workspace)
    original_file = runtime_module._sidecar_deployment_file

    def deployment_file(root, value, relative):
        if relative == production.CONFIG_SOURCE:
            return config_bytes
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
    result["configProjection"] = {
        "mode": "live" if live else "loopback-fake-endpoint",
        "projectedBytes": len(config_bytes),
        "projectedSha256": "sha256:" + hashlib.sha256(config_bytes).hexdigest(),
        "deployedBytes": len(production.config_bytes()),
        "unchangedFromDeployment": config_bytes == production.config_bytes(),
    }
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
            if live:
                # The silent window is a property of the fake endpoint, so it is
                # not observed live; what the real round shows instead is that
                # the answer the user asked for actually came back.
                answer = "".join(result["rounds"]["first"]["deltaText"])
                if NONCE_ROUND_1 not in answer:
                    fail("CODEX_GATE_FIRST_ROUND_ANSWER_MISSING",
                         f"the live first answer did not recall the nonce: {answer[:200]!r}")
                result["silenceObservation"] = {
                    "observed": False, "mode": "live",
                    "reason": "holding an answer back is a property of the fake endpoint",
                    "nonceRecalledLive": True, "answerChars": len(answer),
                }
            else:
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

            if live:
                # The live witness for "the second round carries the first
                # round's context" is the answer itself: only a request that
                # carried round one's nonce can have recalled it.
                recalled = "".join(result["rounds"]["second"]["deltaText"])
                if NONCE_ROUND_1 not in recalled:
                    fail("CODEX_GATE_SECOND_ROUND_CONTEXT_MISSING",
                         "the live second answer did not recall the round-one nonce: "
                         f"{recalled[:200]!r}")
                result["providerRequestShape"] = {
                    "observed": False, "mode": "live",
                    "reason": "request bodies are not visible without the fake endpoint",
                    "secondRoundContextEvidence": "the live second answer recalled the "
                                                  "round-one nonce",
                    "secondRoundNonceRecalled": True,
                }
            else:
                result["providerRequestShape"] = provider_request_shape(endpoint, result["rounds"])
            REPORT["providerRequestShape"] = result["providerRequestShape"]
            result["unknownModel"] = run_unknown_model(
                client, runtime, workspace, opened, production, endpoint, credential_id)
            REPORT["unknownModel"] = result["unknownModel"]
            result["cancel"] = (
                run_cancel_round_live(client, runtime, opened, credential_id, production)
                if live else
                run_cancel_round(client, runtime, opened, endpoint, credential_id, production)
            )
            REPORT["cancel"] = result["cancel"]

            result["credential"] = {
                "injectedTokenReachedProvider": (
                    "verified-by-real-answer" if live else
                    all(item["authorizationMatchesInjectedToken"] for item in endpoint.requests)
                    and bool(endpoint.requests)
                ),
                "unauthorizedRequests": None if live else endpoint.unauthorized,
                "tokenInEvents": INJECTED_CREDENTIAL.decode(errors="replace")
                                 in json.dumps(session["events"]),
                "tokenInReportableState": INJECTED_CREDENTIAL.decode(errors="replace")
                                         in report_text(),
                "tokenInDeployment": INJECTED_CREDENTIAL.decode(errors="replace")
                                     in deployment.read_text(encoding="utf-8"),
                "tokenInWorkspace": token_in_workspace(workspace),
                "noCredentialMaterialInProductionConfig": (
                    INJECTED_CREDENTIAL.decode(errors="replace")
                    not in production.config_bytes().decode("utf-8")),
            }
            # The four claims above are assertions, not decoration: a credential
            # that reached the durable event stream, the deployment document, the
            # workspace or this report is a failure of the run that produced it.
            exposed = sorted(key for key, value in result["credential"].items()
                             if key.startswith("tokenIn") and value is True)
            if exposed:
                fail("CODEX_GATE_CREDENTIAL_EXPOSED",
                     f"the injected credential reached: {exposed}")
            if not result["credential"]["noCredentialMaterialInProductionConfig"]:
                fail("CODEX_GATE_TOKEN_IN_PRODUCTION_CONFIG",
                     "the deployed production configuration carries credential material")
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
            if INJECTED_CREDENTIAL in location.read_bytes():
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
        # A terminal turn records its *inner* failure in the event payload:
        # `turn.capture` carries the capture layer's typed code and
        # `turn.state` the outer one. Keeping only the state text threw
        # that away, so a failed capture could not be attributed to the
        # layer that refused it.
        entry = {"kind": event["kind"],
                 "text": str(data.get("text") or data.get("state") or "")[:200]}
        for key in ("error_code", "code", "state", "retryable"):
            if key in data and str(data[key]) != entry["text"]:
                entry[key] = str(data[key])[:200]
        events.append(entry)
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
    requests_after = None if endpoint is None else len(endpoint.requests)
    if requests_after is not None and requests_after != 2:
        fail("CODEX_GATE_UNKNOWN_MODEL_REACHED_PROVIDER",
             f"the refused model produced {requests_after - 2} provider requests")
    mentioned = any("Harness model is not available" in reason for reason in reasons)
    if requests_after is None and not mentioned:
        # Live has no endpoint to count on, so this reason *is* the positive
        # witness of the phase: without it the turn could have failed for any
        # unrelated cause and the phase would still look passed. The string is
        # the sidecar's own model-availability message, and the failed turn
        # state above is the code-level half of the same claim.
        fail("CODEX_GATE_UNKNOWN_MODEL_REASON_UNEXPECTED",
             "the live unknown-model turn did not fail for the model-availability reason: "
             + json.dumps([reason[:200] for reason in reasons[-2:]]))
    return {
        "state": turn["state"],
        # Live there is no endpoint to count on, so the positive witness is the
        # refusal itself: the turn failed with the model-availability reason,
        # which the bridge raises before it creates any provider request.
        "providerRequestsAfterRefusal": (
            None if requests_after is None else requests_after - 2),
        "refusedBeforeProviderRequest": (
            None if requests_after is None else requests_after == 2),
        "refusalCounted": requests_after is not None,
        "reasonMentionsModel": mentioned,
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


def run_cancel_round_live(client, runtime, opened, credential_id, production) -> dict:
    """Cancel a live turn while its answer is still streaming.

    The no-model gate holds provider request three open, which is what makes
    "the cancel, and nothing else, ended this turn" exact. Live there is no held
    request to point at, so the in-flight window is established from the
    Server's own records instead: the turn must already have streamed at least
    one delta (the real provider is answering) and must not be terminal, and the
    cancel must then end it as `cancelled` within the bound below. The prompt
    asks for a long answer precisely so that the streamed window is wide enough
    for the cancel to land inside it.
    """
    profile = client.post("/api/v1/profiles", headers={
        "Authorization": f"Bearer {runtime.token}",
        "Idempotency-Key": "codex-gate-cancel-profile",
    }, json={"name": "Codex cancel gate", "harness_type": "codex",
             "configuration": {}, "credential_id": credential_id}).json()
    provider = wire_post(client, runtime.token, "providerModels.create", {
        "requestId": "codex-gate-cancel-provider", "displayName": "DeepSeek official",
        "harness": "codex", "provider": production.PROVIDER_ID, "credentialId": credential_id,
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
        "message": {"text": "Count from one to four hundred, one number per line.",
                    "attachments": []},
    })
    session_id = sent["session"]["id"]

    def streamed_deltas() -> int:
        current = runtime.repository.get_session(session_id)
        if not current["turns"]:
            return 0
        turn_id = current["turns"][0]["id"]
        return sum(1 for event in current["events"]
                   if event["kind"] == "message.delta" and event.get("turn_id") == turn_id)

    deadline = time.monotonic() + LIVE_CANCEL_STREAM_SECONDS
    deltas = 0
    while time.monotonic() < deadline:
        session = runtime.repository.get_session(session_id)
        if session["turns"] and session["turns"][0]["state"] in {"failed", "cancelled", "completed"}:
            REPORT["diagnostics"] = turn_diagnostics(runtime, session, 0)
            fail("CODEX_GATE_CANCEL_ROUND_EARLY_FAILURE",
                 f"the live cancel round ended as {session['turns'][0]['state']!r} "
                 "before the cancel was issued")
        deltas = streamed_deltas()
        if deltas:
            break
        time.sleep(0.05)
    if not deltas:
        fail("CODEX_GATE_CANCEL_STREAM_NOT_OBSERVED",
             "the live turn never streamed a delta, so no in-flight cancel window was reached")
    session = runtime.repository.get_session(session_id)
    turn_id = session["turns"][0]["id"]
    started = time.monotonic()
    response = client.post(f"/api/v1/turns/{turn_id}/cancel", headers={
        "Authorization": f"Bearer {runtime.token}", "Idempotency-Key": "codex-gate-cancel",
    }, json={})
    requested = response.status_code
    session = wait_for_terminal(runtime, session_id, 0, timeout=LIVE_CANCEL_TERMINAL_SECONDS)
    elapsed = time.monotonic() - started
    turn = session["turns"][0]
    if turn["state"] != "cancelled":
        REPORT["diagnostics"] = turn_diagnostics(runtime, session, 0)
        fail("CODEX_GATE_CANCEL_NOT_HONOURED",
             f"the live cancelled turn ended as {turn['state']!r}")
    if elapsed > LIVE_CANCEL_SECONDS:
        fail("CODEX_GATE_CANCEL_TOO_SLOW",
             f"the live cancel took {elapsed:.1f}s, past the {LIVE_CANCEL_SECONDS:.0f}s bound")
    return {
        "cancelStatus": requested,
        "turnState": turn["state"],
        "elapsedSeconds": round(elapsed, 3),
        "deltasBeforeCancel": deltas,
        "providerRequestsBeforeCancel": None,
        "providerRequestCountObserved": False,
        "cancelWindow": "the turn was already streaming its real answer when the cancel was sent",
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
        if INJECTED_CREDENTIAL in content:
            hits.append(item["path"])
    # Structured, never a bare escape: the credential fact is recorded here and
    # the one verdict entry point turns it into CODEX_GATE_CREDENTIAL_IN_NATIVE_STATE,
    # so it can never be demoted to a secondary failure by an unrelated error.
    return {"files": len(checkpoint.get("files", [])), "bytes": total,
            "tokenHits": hits, "tokenInState": bool(hits),
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
                bundle=bundle, credential=INJECTED_CREDENTIAL,
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
                # The resumed execution gets its own capture: a credential written
                # while it ran must have evidence of its own, never the first
                # execution's.
                reopened_state, reopened_resumable = second.capture_execution("reopen-round-2")
            finally:
                second.stop()
        finally:
            if endpoint is not None:
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

    # This phase's own capture-boundary evidence: the bytes capture_execution
    # returned, scanned for the injected token, bound to the native id it
    # reopened. It is what lets the reopen phase be judged on the same footing
    # as the turn chain even after its view is reclaimed.
    token = INJECTED_CREDENTIAL
    captured = {**state, **{f"round2/{key}": value for key, value in reopened_state.items()}}
    captured_hits = [relative for relative, content in captured.items() if token in content]
    capture_evidence = {
        "files": len(captured),
        "bytes": sum(len(content) for content in captured.values()),
        "tokenHits": captured_hits,
        # Both executions must be binds to the same native session: the first
        # captured it, the second resumed it.
        "nativeSessionId": bool(state) and bool(reopened_state) and reopened == native,
        "capturedRounds": 2,
    }
    result = {
        "nativeSessionIdStable": reopened == native,
        "stateFiles": len(state), "stateResumable": bool(resumable),
        "reopenedStateFiles": len(reopened_state), "reopenedStateResumable": bool(reopened_resumable),
        "captureEvidence": capture_evidence,
        "acpMethodsFirstRun": methods_first,
        "acpMethodsSecondRun": methods_second,
        "nativeReopenMethod": reopen_method,
        "chunksDuringReopen": during_reopen[:8],
        "chunksAfterReopenPrompt": after_prompt[:8],
        # This phase always drives its own loopback endpoint: it is a mechanism
        # audit (which ACP method reopens, what the child processes inherit),
        # not a model call. In live mode the run's real continuation evidence is
        # the turn chain's second round, which kept this native id and recalled
        # round one's nonce.
        "providerRequests": len(answered),
        "providerEndpoint": "loopback-mechanism-audit",
        "providerEndpointMode": "live" if LIVE_MODE else "loopback-fake-endpoint",
        "providerRequestsAreModelCalls": False,
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
    if INJECTED_CREDENTIAL.decode(errors="replace") in json.dumps(result):
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

#: Failure codes that *are* a credential observation: a capture whose bytes (or
#: the sidecar's own capture-time scan) found the injected token. They are
#: promoted to credential hits by code - never by matching an English message.
CREDENTIAL_FAILURE_CODES = frozenset({
    "CODEX_GATE_TOKEN_IN_STATE", "SIDECAR_STATE_CONTAINS_SECRET",
})


def process_table() -> list[dict]:
    """The live process table as (pid, ppid, start time, command line) rows.

    Read once per poll from `ps`, which gives a stable start-time identity per
    pid: a process that dies and whose pid is reused is a *different* process,
    so "the ones we saw are gone" cannot be faked by pid reuse. The parent pid
    is what lets a descendant be attributed to this run even when its own argv
    does not carry the run's root.
    """
    done = subprocess.run(
        ["ps", "-eo", "pid=,ppid=,lstart=,args="], capture_output=True, text=True)
    if done.returncode != 0 or not done.stdout.strip():
        # No process table means no evidence that the harness exited; the caller
        # treats this as "not exited" rather than as a quiet machine.
        raise RuntimeError(f"ps failed: {done.returncode} {done.stderr.strip()[:120]}")
    rows = []
    for line in done.stdout.splitlines():
        fields = line.strip().split(None, 7)
        if len(fields) < 8 or not fields[0].isdigit() or not fields[1].isdigit():
            continue
        rows.append({
            "pid": int(fields[0]),
            "ppid": int(fields[1]),
            "started": " ".join(fields[2:7]),
            "args": fields[7],
        })
    return rows


def matching_processes(temporary: Path, rows: list[dict] | None = None) -> list[dict]:
    """This run's Harness processes, bound to this run's own temporary root.

    The root is what every wrapper of this run carries in its argv whatever the
    binary inside is called, so a renamed descendant is still matched; another
    Codex instance elsewhere on the machine carries a different root and is
    neither matched nor able to block the window. Descendants are additionally
    covered by the sandbox template: the Worker runs bwrap with
    `--die-with-parent`, so a surviving wrapper is the only thing that can keep
    this run's process tree alive.
    """
    table = process_table() if rows is None else rows
    root = str(temporary)
    # Identity is bound two ways: a process of this run carries this run's root
    # in its argv (the bwrap wrapper always does), or it descends from one that
    # does - a descendant may have rewritten its own argv, and it is still this
    # run's process for as long as its ancestor is alive.
    by_pid = {row["pid"]: row for row in table}
    attributed = {row["pid"] for row in table if root in row["args"]}

    def descends_from_run(pid: int) -> bool:
        seen = set()
        current = by_pid.get(pid)
        while current is not None and current["pid"] not in seen:
            seen.add(current["pid"])
            if current["pid"] in attributed:
                return True
            current = by_pid.get(current["ppid"])
        return False

    return [row for row in table
            if row["pid"] in attributed or descends_from_run(row["pid"])]


def harness_processes(temporary: Path) -> list[str]:
    """Command lines of this run's live Harness processes (compatibility view)."""
    return [row["args"] for row in matching_processes(temporary)]


def _surviving_identities(temporary: Path, seen: list[tuple[int, str]]) -> list[str]:
    """The identities of this run that are still alive after this poll.

    Identity is (pid, start time) plus this run's root in the command line, so a
    renamed descendant is still matched and an unrelated Codex process - a
    different root - is never counted as surviving. The poll is the *union* of
    what was seen earlier and what is in the table right now: an empty "seen"
    list is not evidence of an exit, so a process that appeared after the last
    sample still counts.
    """
    live = {(row["pid"], row["started"]) for row in matching_processes(temporary)}
    survivors = {f"{pid}@{started}" for pid, started in seen if (pid, started) in live}
    survivors.update(f"{row['pid']}@{row['started']}" for row in matching_processes(temporary))
    return sorted(survivors)


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
    seen: list[tuple[int, str]] = list(watcher.harness_identities)

    def poll() -> list[str]:
        return _surviving_identities(temporary, seen)

    try:
        survivors = poll()
    except RuntimeError as error:
        survivors = [f"process table unavailable: {error}"]
    while survivors and time.monotonic() < deadline:
        time.sleep(interval_s)
        if watcher.harness_identities:
            seen = list(watcher.harness_identities)
        try:
            survivors = poll()
        except RuntimeError as error:
            survivors = [f"process table unavailable: {error}"]
    evidence: dict = {
        "harnessExited": not survivors,
        "harnessSeenAlive": bool(watcher.harness_seen or survivors),
        "survivors": survivors[:2],
        "settledScan": "capture-boundary",
        "settledCycles": 0,
    }
    if survivors:
        return evidence
    # Strict order: the harness is gone, so the observer is stopped and joined
    # *before* the settled scan - and that scan is a fresh scanner, so no state
    # is shared with the thread.
    watcher.stop()
    scanner = CredentialStateScanner(watcher.worker_root, INJECTED_CREDENTIAL)
    summary = scanner.scan()
    reclaimed = not summary.get("viewsOnDisk")
    evidence.update({
        "settledScan": "capture-boundary" if reclaimed else "view",
        "settledComplete": bool(summary.get("complete")),
        "settledCycles": 1 if summary.get("complete") else 0,
        "settledFiles": summary.get("files"),
        "settledIncomplete": summary.get("incomplete"),
        "settledHits": [hit.get("path") for hit in summary.get("hits", ())],
        "settledRaces": [raced.get("path") for raced in summary.get("races", ())],
        "settledViewsReclaimed": reclaimed,
    })
    return evidence


def capture_boundary_evidence(report: dict) -> tuple[bool, str]:
    """Whether this run's *captured state* is usable evidence.

    The settled fallback may only pass on structured capture evidence: the
    capture-boundary scan must have run on a checkpoint whose stored native id
    matches the run's, whose captured bytes carry no token, and whose rounds all
    reported a captured state. Anything missing or inconsistent is an
    incomplete observation, never a quiet pass.
    """
    scan = report.get("stateScan")
    if not isinstance(scan, dict):
        return False, "no captured-state scan was recorded for this run"
    if scan.get("tokenInState"):
        return False, "the captured state carried the credential"
    if scan.get("nativeSessionId") is not True:
        return False, "the captured checkpoint is not bound to this run's native id"
    if not scan.get("files"):
        return False, "the captured state held no files to observe"
    rounds = report.get("rounds") or {}
    if not rounds:
        return False, "no round recorded a completed capture"
    for name, summary in rounds.items():
        if summary.get("state") != "completed":
            return False, f"round {name} did not complete its capture"
    return True, ""


def normalize_phase(name: str, settled_window: dict, watcher=None,
                    capture_raw: dict | None = None, failure=None) -> dict:
    """The one place a phase's evidence is assembled - identical for both phases.

    Active observations, the phase's own settled scan and its capture-boundary
    scan are all reduced to one fact set here, so a credential found by *any* of
    the three is a hit of that phase. Nothing downstream has to remember which
    phase used which path.
    """
    hits: list[dict] = []
    # Idempotent: an already-normalized phase hands its own hits back in, so a
    # second pass can never drop what the first one found.
    for hit in list(settled_window.get("hits") or ()):
        entry = dict(hit)
        if entry not in hits:
            hits.append(entry)
    for hit in list(getattr(watcher, "token_hits", ()) or ()):
        entry = dict(hit, phase=name, source="active")
        if entry not in hits:
            hits.append(entry)
    for path in settled_window.get("settledHits") or ():
        entry = {"path": path, "phase": name, "source": "settled"}
        if entry not in hits:
            hits.append(entry)
    if failure is not None:
        code = getattr(failure, "code", None)
        if code in CREDENTIAL_FAILURE_CODES:
            entry = {"path": f"<{code}>", "phase": name, "source": f"failure:{code}"}
            if entry not in hits:
                hits.append(entry)
    capture_evidence = None
    if capture_raw is not None:
        capture_hits = list(capture_raw.get("tokenHits") or ())
        capture_evidence = {
            "files": capture_raw.get("files"),
            "bytes": capture_raw.get("bytes"),
            "nativeSessionId": capture_raw.get("nativeSessionId"),
            "tokenHits": capture_hits,
        }
        for path in capture_hits:
            entry = {"path": path, "phase": name, "source": "capture"}
            if entry not in hits:
                hits.append(entry)
    races = list(getattr(watcher, "race_events", ()) or ())
    for path in settled_window.get("settledRaces") or ():
        raced = {"path": path, "phase": name, "source": "settled"}
        if raced not in races:
            races.append(raced)
    incomplete = list(getattr(watcher, "incomplete_events", ()) or ())
    return {
        "phase": name,
        "hits": hits,
        "races": races,
        "incompleteEvents": incomplete,
        "scanError": getattr(watcher, "scan_error", None) or settled_window.get("settleError"),
        "stoppedCleanly": bool(getattr(watcher, "stopped_cleanly", False)),
        "filesObserved": (getattr(watcher, "scanned_files", 0) or 0)
                         + (settled_window.get("settledFiles") or 0),
        "settledHits": list(settled_window.get("settledHits") or ()),
        "cyclesCompleted": getattr(watcher, "scan_completed", 0) or 0,
        "settledComplete": bool(settled_window.get("settledComplete")),
        "settledCycles": settled_window.get("settledCycles"),
        "settledScan": settled_window.get("settledScan"),
        "settledIncomplete": settled_window.get("settledIncomplete"),
        "harnessExited": settled_window.get("harnessExited"),
        "harnessSeenAlive": settled_window.get("harnessSeenAlive"),
        "captureEvidence": capture_evidence,
        "failure": failure,
    }


def turn_chain_phase(report: dict, chain_evidence: dict, watcher=None) -> dict:
    """The turn chain's phase evidence, with its capture scan attached.

    The phase was already normalized where it ran; this only adds what the
    report knows about the capture boundary (its scan and the captured hits), so
    nothing that phase found can be dropped on the way to the verdict.
    """
    phase = dict(chain_evidence)
    phase["phase"] = "turn-chain"
    scan = report.get("stateScan") if isinstance(report.get("stateScan"), dict) else None
    rounds = report.get("rounds") or {}
    if scan is None or not rounds or not all(
            summary.get("state") == "completed" for summary in rounds.values()):
        return phase
    capture_hits = ["<captured:tokenInState>"] if scan.get("tokenInState") else []
    phase["captureEvidence"] = {
        "files": scan.get("files"),
        "bytes": scan.get("bytes"),
        "nativeSessionId": scan.get("nativeSessionId"),
        "tokenHits": capture_hits,
    }
    hits = list(phase.get("hits") or ())
    for path in capture_hits:
        entry = {"path": path, "phase": "turn-chain", "source": "capture"}
        if entry not in hits:
            hits.append(entry)
    phase["hits"] = hits
    return phase


def collect_secondary_failures(phases: list[dict]) -> list[dict]:
    """Every independent failure a phase carries, in phase order.

    A run that ends must not lose the *other* thing that also went wrong: the
    primary failure is chosen by the credential-first rule, and whatever else
    failed is preserved here so a later reader sees both. Each phase contributes
    its own failure (by typed code, with the exception's own message) and its
    own scanner incompleteness - two different facts that can both be true.
    """
    collected: list[dict] = []
    for phase in phases:
        if phase.get("failure") is not None:
            collected.append({
                "phase": phase.get("phase"),
                "code": getattr(phase["failure"], "code", None) or "CODEX_GATE_UNEXPECTED",
                "message": getattr(phase["failure"], "message", None) or str(phase["failure"]),
            })
        if phase.get("scanError") or phase.get("settleError"):
            collected.append({
                "phase": phase.get("phase"), "code": "CODEX_GATE_STATE_SCAN_INCOMPLETE",
                "message": phase.get("scanError") or phase.get("settleError"),
            })
    return collected


def resolve_run_failure(report: dict, phases: list[dict]) -> "GateFailure | None":
    """The one place that decides what ends the run, over every phase.

    Each phase contributes its own evidence: the observer's hits *and* the hits
    its independent settled scan found, its races and incompleteness, whether
    its harness exited, and whether *that phase* left either a fully walked
    settled view or its own capture-boundary scan. A credential observed in any
    phase - active or settled, turn chain or reopen - is the primary failure.
    """
    aggregate = merge_phase_evidence(phases)
    report["credentialScan"] = {
        "phases": len(phases),
        "perPhase": [
            {
                "phase": phase.get("phase"),
                "settledComplete": bool(phase.get("settledComplete")),
                "settledScan": phase.get("settledScan"),
                "captureEvidence": phase.get("captureEvidence"),
                "harnessExited": phase.get("harnessExited"),
                "hits": [hit.get("path") for hit in phase.get("hits", ())],
                "settledHits": list(phase.get("settledHits") or ()),
                "races": len(phase.get("races") or ()),
                "incompleteEvents": len(phase.get("incompleteEvents") or ()),
                "scanError": phase.get("scanError"),
                "stoppedCleanly": phase.get("stoppedCleanly"),
            }
            for phase in phases
        ],
        "filesObserved": aggregate["files"],
        "cyclesCompleted": aggregate["cycles"],
        "settledCycles": aggregate["settledCycles"],
        "settledIncomplete": aggregate["settledIncomplete"],
        "harnessExited": aggregate["harnessExited"],
        "raceEvents": aggregate["races"],
        "incompleteEvents": aggregate["incomplete"],
        "error": aggregate["scanError"],
        "stoppedCleanly": aggregate["stoppedCleanly"],
    }
    report["credentialPathHits"] = aggregate["hits"]
    verdict, detail = credential_scan_verdict(
        aggregate["hits"], aggregate["scanError"], aggregate["stoppedCleanly"],
        LEGACY_STATE_DIAGNOSTIC, None, aggregate["cycles"],
        aggregate["races"], aggregate["incomplete"],
        aggregate["settledCycles"], None, None,
        aggregate["harnessExited"], aggregate["settledIncomplete"],
        report,
    )
    if verdict is None:
        return None
    return GateFailure(verdict, detail)


def observe_phase(worker_root: Path, temporary: Path, work, *, name: str,
                  existing_watcher: "StateSymlinkWatcher | None" = None) -> dict:
    """Run one phase of the gate with its own observer, then settle it.

    Every phase that starts a native Harness with the injected token gets its
    own watcher (its own scanner) and its own post-exit settled scan. The phase
    never raises: it returns what it produced plus the failure it hit, so the
    caller can compute the credential verdict over *all* phases before letting
    any chain failure end the run.
    """
    phase_watcher = existing_watcher or StateSymlinkWatcher(worker_root)
    if existing_watcher is None:
        phase_watcher.start()
    result = None
    failure: BaseException | None = None
    try:
        result = work()
    except BaseException as error:  # noqa: BLE001 - handed back to the caller
        failure = error
    finally:
        try:
            settled = settle_after_attempt(phase_watcher, temporary)
            evidence = settled
        except BaseException as error:  # noqa: BLE001 - collected, judged later
            settled = {"harnessExited": False, "settledComplete": False,
                       "settledCycles": 0, "settleError": f"{type(error).__name__}: {error}"}
            evidence = settled
        try:
            phase_watcher.stop()
        except BaseException as error:  # noqa: BLE001 - collected, judged later
            settled["settleError"] = settled.get("settleError") or (
                f"stop failed: {type(error).__name__}: {error}")
    capture_raw = (result.get("captureEvidence")
                   if isinstance(result, dict) and isinstance(result.get("captureEvidence"), dict)
                   else None)
    evidence = normalize_phase(name, settled, phase_watcher, capture_raw, failure)
    evidence["result"] = result
    return evidence


def phase_evidence_for_report(evidence: dict) -> dict:
    """A phase's evidence with its live exception rendered as text.

    The evidence dict carries the exception *object* for the verdict logic; a
    report is JSON, so the same facts are recorded there as a code/message pair.
    Without this the report cannot be serialized at all, which would turn any
    failing phase into a bare traceback and lose the evidence it collected.
    """
    recorded = dict(evidence)
    failure = recorded.get("failure")
    if failure is not None:
        recorded["failure"] = {
            "code": getattr(failure, "code", None) or "CODEX_GATE_UNEXPECTED",
            "message": getattr(failure, "message", None)
                       or f"{type(failure).__name__}: {failure}",
        }
        recorded["failed"] = True
    return recorded


def unserializable_value(value):
    """The last resort for a report value that is not JSON.

    Every evidence field is meant to be JSON already and a phase failure is
    converted where it is stored, so reaching this hook is itself a defect. It
    still exits as a labelled entry plus a note on stderr rather than a
    traceback, because the report *is* the evidence of a failing run.
    """
    print(f"warning: non-JSON report value {type(value).__name__}: {value!r}"[:400],
          file=sys.stderr)
    return {"unserializable": type(value).__name__, "text": str(value)[:300]}


def report_text() -> str:
    """The report so far as text, for the "did the credential reach it" check.

    Mid-run the report holds no exception objects, but this must never be the
    call that ends a run: an unrenderable value becomes a placeholder string, so
    the credential question is still answered rather than replaced by a crash.
    """
    return json.dumps(REPORT, sort_keys=True,
                      default=lambda value: f"<unserializable {type(value).__name__}>")


def merge_phase_evidence(phases: list[dict]) -> dict:
    """One aggregate over every phase that ran a Harness.

    Completeness is judged *per phase*: each phase must either have fully walked
    a settled view or carry its own capture-boundary evidence. A phase that had
    neither is incomplete no matter how well the other phases did, because a
    credential written in it would never have been observed.
    """
    hits: list[dict] = []
    races: list[dict] = []
    incomplete: list[dict] = []
    scan_error: str | None = None
    stopped_cleanly = True
    cycles = 0
    files = 0
    settled_cycles = 0
    settled_incomplete: str | None = None
    harness_exited = True
    for phase in phases:
        for hit in phase.get("hits", ()):
            if hit not in hits:
                hits.append(hit)
        for raced in phase.get("races", ()):
            if raced not in races:
                races.append(raced)
        for event in phase.get("incompleteEvents", ()):
            if event not in incomplete:
                incomplete.append(event)
        scan_error = scan_error or phase.get("scanError")
        stopped_cleanly = stopped_cleanly and bool(phase.get("stoppedCleanly"))
        cycles += phase.get("cyclesCompleted") or 0
        files += phase.get("filesObserved") or 0
        if phase.get("harnessExited") is False:
            harness_exited = False
        if phase.get("settledComplete"):
            settled_cycles += 1
            continue
        # This phase left no settled view: it must carry its own capture scan.
        capture_ok, capture_reason = capture_evidence_for_phase(phase)
        if capture_ok:
            settled_cycles += 1
            continue
        if settled_incomplete is None:
            settled_incomplete = f"{phase.get('phase')}: {capture_reason or 'no settled view'}"
    return {
        "hits": hits, "races": races, "incomplete": incomplete,
        "scanError": scan_error, "stoppedCleanly": stopped_cleanly,
        "cycles": cycles, "files": files, "settledCycles": settled_cycles,
        "settledIncomplete": settled_incomplete, "harnessExited": harness_exited,
    }


def capture_evidence_for_phase(phase: dict) -> tuple[bool, str]:
    """That phase's own capture-boundary evidence, if any.

    The turn chain records it in the report (`stateScan`); the reopen phase
    records the same facts next to its own captured bytes (`captureEvidence`).
    Both are native-id bound, token-free and non-empty, or they do not count.
    """
    evidence = phase.get("captureEvidence")
    if evidence is None:
        return False, "the phase left no settled view and no capture evidence"
    if evidence.get("tokenHits"):
        return False, "the captured state carried the credential"
    if evidence.get("nativeSessionId") is not True:
        return False, "the captured state is not bound to this phase's native id"
    if not evidence.get("files"):
        return False, "the captured state held no files to observe"
    return True, ""


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
    report: dict | None = None,
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
        if settled_cycles > 0:
            return None, ""
        # No view was left to scan: the evidence for the same window is the
        # capture-boundary scan, and it must be structurally usable.
        ok, reason = capture_boundary_evidence(report)
        if not ok:
            return "CODEX_GATE_STATE_SCAN_INCOMPLETE", reason
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
