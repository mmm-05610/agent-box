#!/usr/bin/env python3
"""Order 66 G5 (real harness): two real OpenCode processes race one fresh shared library.

Why this gate exists
--------------------
The whole-db shared library is opened by *two* real harness processes at once,
and its first run can collide on the library's singleton rows (the `project`
table's literal `'global'` id - Work Order 66 section 1.7). The fixture-level
G5 test proves our orchestration (two profiles, two sessions, real Server);
this gate produces the SQLite-level facts a fixture cannot: with the real
OpenCode binary (pinned by the family's production packaging), a **fresh
library** and **two concurrent first runs**,

  * both processes finish (exit 0),
  * the library holds exactly one `project` row,
  * `project_directory` has no duplicate (project_id, directory) rows,
  * neither process, the harness's own log, nor the library scrolls back
    `SQLITE_BUSY` / `database is locked`,
  * the library stays readable afterwards.

Setup notes (recorded, not hidden)
----------------------------------
* No model call leaves this machine: the provider document points at a
  loopback fake endpoint that answers with a fixed reply.
* Both processes use one data directory: the library, `-wal` and `-shm` are
  therefore literally the same files (a bind-mounted room is the product's
  real shape; a directory keeps the same SQLite lock identity without a
  room). Per-profile materialisation is out of scope here - it is covered by
  the fixture-level G5 round and the 66 stage A/B tests.
* The library is made fresh *after* a warm-up run materialised the provider
  package, so the race is the cold start of the library, not of npm.

    usage: shared-store-concurrency-gate.py [--opencode PATH] [--expect-version V]
                                            [--attempts N] [--keep] [--json]
"""
from __future__ import annotations

import argparse
import http.server
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

SCRIPT = "scripts/server-round1/shared-store-concurrency-gate.py"
FAKE_TOKEN = "shared-store-gate-fake-token-3f1c8a-non-secret"
REPLY = "STORE-GATE-ACK ONE TWO"


class GateFailure(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


def fail(code: str, message: str) -> None:
    raise GateFailure(code, message)


# --------------------------------------------------------------------------
# loopback fake endpoint (OpenAI chat-completions, streaming)
# --------------------------------------------------------------------------

def _chunk(payload: dict, finish: str | None = None, usage: bool = False) -> bytes:
    body = {
        "id": "chatcmpl-shared-store-gate", "object": "chat.completion.chunk",
        "created": 1, "model": "deepseek-flash",
        "choices": [{"index": 0, "delta": payload, "finish_reason": finish}],
    }
    if usage:
        body["usage"] = {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8}
    return f"data: {json.dumps(body)}\n\n".encode()


class FakeEndpoint:
    """A loopback OpenAI-compatible stream. Records requests; prints nothing."""

    def __init__(self) -> None:
        self.requests: list[dict] = []
        endpoint = self

        class Handler(http.server.BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *_args) -> None:
                pass

            def _write_chunk(self, payload: bytes) -> None:
                self.wfile.write(f"{len(payload):X}\r\n".encode() + payload + b"\r\n")
                self.wfile.flush()

            def do_POST(self) -> None:
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length)
                try:
                    body = json.loads(raw.decode("utf-8"))
                except ValueError:
                    body = {}
                endpoint.requests.append({
                    "path": self.path,
                    "authorizationMatches": (
                        self.headers.get("Authorization") == f"Bearer {FAKE_TOKEN}"),
                    "model": body.get("model"),
                    "stream": body.get("stream"),
                })
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Transfer-Encoding", "chunked")
                self.end_headers()
                self._write_chunk(_chunk({"role": "assistant", "content": ""}))
                for word in REPLY.split(" "):
                    self._write_chunk(_chunk({"content": word + " "}))
                    time.sleep(0.02)
                self._write_chunk(_chunk({}, finish="stop", usage=True))
                self._write_chunk(b"data: [DONE]\n\n")
                self.wfile.write(b"0\r\n\r\n")
                self.wfile.flush()

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self._started = False

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def start(self) -> None:
        self.thread.start()
        self._started = True

    def stop(self) -> None:
        if not self._started:
            return
        self._started = False
        self.server.shutdown()
        self.server.server_close()


# --------------------------------------------------------------------------
# harness configuration
# --------------------------------------------------------------------------

def config_document(base_url: str) -> dict:
    """The production document with the provider pointed at the loopback fake."""
    return {
        "$schema": "https://opencode.ai/config.json",
        "provider": {
            "deepseek": {
                "npm": "@ai-sdk/openai-compatible",
                "name": "DeepSeek official (loopback fake)",
                "options": {"baseURL": base_url, "apiKey": FAKE_TOKEN},
                "models": {
                    "deepseek-flash": {
                        "name": "DeepSeek Flash (bounded acceptance)",
                        "reasoning": False,
                        "options": {"thinking": {"type": "disabled"}},
                        "limit": {"context": 1000, "output": 64},
                    },
                },
            },
        },
    }


def probe_version(binary: str, expect: str | None) -> str:
    result = subprocess.run([binary, "--version"], capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        fail("STORE_GATE_VERSION_PROBE_FAILED", (result.stderr or result.stdout)[:200])
    version = (result.stdout or "").strip().splitlines()[-1].strip()
    if expect and version != expect:
        fail("STORE_GATE_VERSION_MISMATCH", f"{version!r} != expected {expect!r}")
    return version


def run_opencode(binary: str, root: Path, project: Path, config: Path,
                 prompt: str, timeout: float) -> dict:
    """One real `opencode run`; returns timing, exit code and a redacted stderr tail."""
    environment = dict(os.environ)
    environment.update({
        "HOME": str(root / "home"),
        "XDG_DATA_HOME": str(root / "data"),
        "XDG_CONFIG_HOME": str(root / "config"),
        "OPENCODE_CONFIG": str(config),
        "OPENCODE_DISABLE_AUTOUPDATE": "1",
        # `cwd=` does not update an inherited PWD; opencode derives the
        # project from it, so the two racers must each carry their own.
        "PWD": str(project),
    })
    started = time.monotonic()
    process = subprocess.run(
        [binary, "run", prompt, "--model", "deepseek/deepseek-flash"],
        cwd=project, env=environment, capture_output=True, text=True, timeout=timeout)
    return {
        "exit": process.returncode,
        "seconds": round(time.monotonic() - started, 2),
        "stdoutTail": "\n".join((process.stdout or "").splitlines()[-3:]),
        "stderrTail": "\n".join((process.stderr or "").splitlines()[-40:]),
    }


def library_state(database: Path) -> dict:
    import sqlite3

    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    try:
        tables = {row[0] for row in connection.execute(
            "select name from sqlite_master where type='table'")}
        state: dict = {"tables": sorted(tables)}
        if "project" in tables:
            rows = connection.execute("select id, worktree from project").fetchall()
            state["projectRows"] = [list(row) for row in rows]
            state["projectWorktrees"] = len({row[1] for row in rows})
            state["projectGlobals"] = sum(1 for row in rows if row[0] == "global")
        if "project_directory" in tables:
            total = connection.execute("select count(*) from project_directory").fetchone()[0]
            distinct = connection.execute(
                "select count(*) from (select distinct project_id, directory from project_directory)"
            ).fetchone()[0]
            state["projectDirectoryRows"] = total
            state["projectDirectoryDistinct"] = distinct
        if "session" in tables:
            state["sessionRows"] = connection.execute("select count(*) from session").fetchone()[0]
        return state
    finally:
        connection.close()


def scan_locked(*texts: str) -> list[str]:
    hits = []
    for text in texts:
        for needle in ("SQLITE_BUSY", "database is locked", "SQLITE_LOCKED"):
            if needle in text:
                hits.append(needle)
    return hits


def _race_pair(binary: str, root: Path, endpoint: FakeEndpoint, timeout: float,
               tag: str) -> tuple[dict, dict]:
    """Two real runs, both at once, against the library as it currently is."""
    config = root / "opencode.json"
    config.write_text(json.dumps(config_document(endpoint.base_url)), encoding="utf-8")
    project_a = root / "project-a"
    project_b = root / "project-b"
    for project in (project_a, project_b):
        project.mkdir(parents=True, exist_ok=True)

    before = len(endpoint.requests)
    results: dict[str, dict] = {}
    errors: list[str] = []

    def run(name: str, project: Path) -> None:
        try:
            results[name] = run_opencode(
                binary, root, project, config, f"{tag} {name}: reply with the ack", timeout)
        except BaseException as caught:  # noqa: BLE001
            errors.append(f"{name}: {type(caught).__name__}: {caught}"[:300])

    threads = [
        threading.Thread(target=run, args=("alpha", project_a)),
        threading.Thread(target=run, args=("bravo", project_b)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    if errors:
        fail("STORE_GATE_PROCESS_ERROR", "; ".join(errors))
    return results, {"providerRequests": len(endpoint.requests) - before}


def _library_report(root: Path, results: dict, extra: dict) -> dict:
    data = root / "data"
    library_dir = data / "opencode"
    database = library_dir / "opencode.db"
    state = library_state(database)
    log_text = ""
    log_file = library_dir / "log" / "opencode.log"
    if log_file.exists():
        log_text = log_file.read_text(encoding="utf-8", errors="replace")[-20000:]
    stderr_text = "\n".join(item["stderrTail"] for item in results.values())
    locked = sorted(set(scan_locked(stderr_text, log_text)))
    return {"processes": results, "library": state, "lockedMentions": locked, **extra}


def _assert_pair(report: dict, *, label: str, minimum_sessions: int) -> None:
    results = report["processes"]
    if results["alpha"]["exit"] != 0 or results["bravo"]["exit"] != 0:
        fail("STORE_GATE_RUN_FAILED", f"{label}: " + json.dumps(report, ensure_ascii=False)[:2400])
    # First-hand (2026-09-18): the `project` table is not one singleton row -
    # it holds a literal `global` row *and* one hashed row per worktree. The
    # singleton-race invariants are therefore: every worktree exactly once,
    # exactly one `global`, and no duplicate (project_id, directory) pairs.
    state = report["library"]
    projects = state.get("projectRows") or []
    if len(projects) != state.get("projectWorktrees", -1) or state.get("projectGlobals") != 1:
        fail("STORE_GATE_PROJECT_ROWS_DUPLICATED", json.dumps(state, ensure_ascii=False)[:400])
    if state.get("projectDirectoryRows", 0) != state.get("projectDirectoryDistinct", 0):
        fail("STORE_GATE_PROJECT_DIRECTORY_DUPLICATED", json.dumps(state, ensure_ascii=False)[:400])
    if report["lockedMentions"]:
        fail("STORE_GATE_SQLITE_BUSY_SURFACED", ",".join(report["lockedMentions"]))
    if (state.get("sessionRows") or 0) < minimum_sessions:
        fail("STORE_GATE_NO_SESSION_ROWS",
             f"{label}: the runs created fewer than {minimum_sessions} session rows")


def attempt(binary: str, root: Path, endpoint: FakeEndpoint, timeout: float) -> dict:
    """One cold-start race, then one post-initialisation concurrent pair.

    The cold phase is the scenario under test (a fresh shared library, two
    real first runs at once). The initialised phase answers the follow-up the
    first-run-lock design needs: after the library exists, plain concurrency
    must be safe - otherwise a lock would have to cover every run.
    """
    data = root / "data"
    library_dir = data / "opencode"
    library_dir.mkdir(parents=True, exist_ok=True)
    database = library_dir / "opencode.db"
    if database.exists():
        database.unlink()
    for suffix in ("-wal", "-shm"):
        companion = library_dir / f"opencode.db{suffix}"
        if companion.exists():
            companion.unlink()
    snapshot = library_dir / "snapshot"
    if snapshot.exists():
        shutil.rmtree(snapshot)
    # Our room seeding creates the zero-byte placeholder before the room exists.
    database.write_bytes(b"")

    report: dict = {"cold": None, "initialized": None}
    try:
        results, extra = _race_pair(binary, root, endpoint, timeout, "COLD")
        report["cold"] = _library_report(root, results, extra)
        _assert_pair(report["cold"], label="cold-start race", minimum_sessions=2)
    except GateFailure as failure:
        report["cold"] = {
            "failed": True, "code": failure.code, "message": failure.message,
        }
        # The library may have been initialised by whichever process won;
        # the initialised phase still runs, so its facts are on record too.
    results, extra = _race_pair(binary, root, endpoint, timeout, "WARM")
    report["initialized"] = _library_report(root, results, extra)
    _assert_pair(report["initialized"], label="initialised concurrency", minimum_sessions=3)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--opencode", default=shutil.which("opencode"))
    parser.add_argument("--expect-version", default="1.18.21")
    parser.add_argument("--attempts", type=int, default=1)
    parser.add_argument("--timeout", type=float, default=180.0)
    parser.add_argument("--keep", action="store_true")
    parser.add_argument("--json", action="store_true")
    options = parser.parse_args()
    if not options.opencode:
        print("STORE_GATE_OPENCODE_NOT_FOUND", file=sys.stderr)
        return 2
    binary = str(Path(options.opencode).resolve())

    report: dict = {"script": SCRIPT, "binary": binary, "attempts": []}
    root = Path(tempfile.mkdtemp(prefix="agentbox-shared-store-gate-"))
    endpoint = FakeEndpoint()
    endpoint.start()
    try:
        report["version"] = probe_version(binary, options.expect_version)

        # Warm-up: materialise the provider package outside the race.
        warm = root / "warm-up"
        (warm / "project").mkdir(parents=True, exist_ok=True)
        config = root / "warm.json"
        config.write_text(json.dumps(config_document(endpoint.base_url)), encoding="utf-8")
        warm_result = run_opencode(binary, warm, warm / "project", config,
                                   f"{SCRIPT}: warm-up", options.timeout)
        report["warmUp"] = warm_result
        if warm_result["exit"] != 0:
            fail("STORE_GATE_WARMUP_FAILED", json.dumps(warm_result, ensure_ascii=False)[:400])
        # The race uses the warmed data directory: node_modules stay, the
        # library files are removed inside `attempt` to restore the cold start.
        shutil.copytree(warm / "data", root / "data")
        shutil.copytree(warm / "home", root / "home")

        for index in range(options.attempts):
            try:
                report["attempts"].append(attempt(binary, root, endpoint, options.timeout))
            except GateFailure as failure:
                # One racing attempt can fail without aborting the run: the
                # per-attempt outcome is the evidence (a lock window is racy).
                report["attempts"].append({
                    "failed": True, "code": failure.code, "message": failure.message})
        cold_failures = [
            item for item in report["attempts"]
            if item.get("failed") or (item.get("cold") or {}).get("failed")
        ]
        if cold_failures:
            report["result"] = "SHARED_STORE_CONCURRENCY_FAILED"
            report["failure"] = {
                "coldStartAttemptsFailed": len(cold_failures),
                "attempts": len(report["attempts"]),
                "codes": sorted({
                    item.get("code") or (item.get("cold") or {}).get("code")
                    for item in cold_failures}),
                "note": ("the cold-start race failed; Order 66 G5 iii asked for a "
                         "first-run lock scheme and the accounting in that case"),
            }
        else:
            report["result"] = "SHARED_STORE_CONCURRENCY_OK"
        report["providerRequests"] = len(endpoint.requests)
    except GateFailure as failure:
        report["result"] = "SHARED_STORE_CONCURRENCY_FAILED"
        report["failure"] = {"code": failure.code, "message": failure.message}
    finally:
        endpoint.stop()
        if options.keep:
            report["root"] = str(root)
        else:
            shutil.rmtree(root, ignore_errors=True)
    if options.json:
        print(json.dumps(report, ensure_ascii=False, indent=1, sort_keys=True))
    else:
        print(report["result"])
        if report.get("failure"):
            print(json.dumps(report["failure"], ensure_ascii=False))
    return 0 if report["result"] == "SHARED_STORE_CONCURRENCY_OK" else 1


if __name__ == "__main__":
    raise SystemExit(main())
