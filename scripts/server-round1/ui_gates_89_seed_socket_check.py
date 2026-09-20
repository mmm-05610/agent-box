#!/usr/bin/env python3
"""Order 089, seed leg - socket check: run the seed's **own HTTP face** against a real bind.

The shape check drives the composed app through `TestClient`, which short-circuits the transport:
it proves the handlers accept the bodies, not that a byte-for-byte HTTP request does. This tree has
been bitten by exactly that difference (the 101 re-run over a real socket changed the conclusion
about a reported symptom), and QA calls this script over TCP on the control plane, so the part
`TestClient` cannot see is the part that matters here: uvicorn's parser, headers, the bearer token
file, idempotency replays over the wire, and the proxy-immune opener.

One throwaway instance, its own random port, its own temporary data root, fake key, fake endpoint:
**no real model call, no upstream, no shared environment touched**. The thread is stopped and the
root deleted and verified gone before this exits.

    PYTHONPATH=src python3 scripts/server-round1/ui_gates_89_seed_socket_check.py
Exit 0 = every assertion held; non-zero = the printed failure is the finding.
"""
from __future__ import annotations

import importlib.util
import json
import os
import shutil
import socket
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(REPO / "src"), str(REPO / "tests" / "server")]


def load(name: str):
    spec = importlib.util.spec_from_file_location(
        name, REPO / "scripts/server-round1" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


seed89 = load("ui_gates_89_seed_profile")

FAILURES: list[str] = []
RESULT: dict = {"order": "089", "kind": "SEED_SOCKET_CHECK", "realModelRequests": 0,
                "upstreamContacted": False}


def check(name: str, ok: bool, detail) -> None:
    RESULT.setdefault("checks", {})[name] = detail if isinstance(detail, str) else detail
    if not ok:
        FAILURES.append(f"{name}: {json.dumps(detail, ensure_ascii=False, default=str)[:260]}")


#: `/proc/net/tcp` state codes; `0A` is LISTEN and is the only one that means "someone is
#: still accepting connections here".
TCP_LISTEN = "0A"


def _listeners_on(port: int) -> list[dict]:
    """Every socket in `tcp` state LISTEN bound to `port`, with the uid that owns it.

    Judging "did we give the port back" by connecting to it is wrong on this machine: the
    proxy that lives between WSL and Windows keeps a **root-owned** socket in TIME_WAIT on
    ports we used, so `connect_ex` answers success long after our listener is gone. Measured
    first-hand (`/tmp` probe, 21:4x): after our thread returned, the only remaining entries
    were `uid=0 state=06`, and `connect_ex` still returned 0. Look for our own LISTEN instead.
    """
    found = []
    for path in ("/proc/net/tcp", "/proc/net/tcp6"):
        try:
            lines = Path(path).read_text("utf-8", "replace").splitlines()[1:]
        except OSError:
            continue
        for line in lines:
            fields = line.split()
            if len(fields) < 8:
                continue
            try:
                local_port = int(fields[1].split(":")[1], 16)
            except (IndexError, ValueError):
                continue
            if local_port == port:
                found.append({"table": path, "state": fields[3], "uid": fields[7]})
    return found


def _profile_count(runtime) -> int:
    with runtime.repository.database.read() as conn:
        return int(conn.execute("SELECT COUNT(*) FROM server_profiles").fetchone()[0])


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def main() -> int:
    import uvicorn

    from agent_box.server.bootstrap import build_runtime
    from agent_box.server.transport.http import create_app
    from agent_box.storage import MemorySecretStore
    from test_profiles_list_sendability_117 import _registry

    temporary = Path(tempfile.mkdtemp(prefix="agentbox-89-socket-"))
    port = free_port()
    base_url = f"http://127.0.0.1:{port}"
    httpd = None
    runtime = None
    try:
        data_root = temporary / "server"
        key_file = temporary / "fake-key.txt"
        key_file.write_text("fake-loopback-value-not-a-secret", encoding="utf-8")
        os.chmod(key_file, 0o600)

        runtime = build_runtime(data_root, harnesses=_registry(credential_kind="api-key"),
                                secret_store=MemorySecretStore({}))
        token_file = data_root / "secrets" / "http-token"
        check("token_file_exists_where_the_recipe_points", token_file.is_file(),
              {"path": str(token_file.relative_to(data_root))})

        config = uvicorn.Config(create_app(runtime), host="127.0.0.1", port=port,
                                log_level="warning", lifespan="on")
        httpd = uvicorn.Server(config)
        thread = threading.Thread(target=httpd.run, daemon=True)
        thread.start()

        alive = None
        for _ in range(200):
            try:
                with urllib.request.urlopen(f"{base_url}/live", timeout=2) as response:
                    alive = response.status, json.loads(response.read().decode("utf-8"))
                break
            except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
                time.sleep(0.1)
        check("the_real_bind_answers_live", alive is not None and alive[0] == 200,
              {"port": port, "live": alive})
        if alive is None:
            return 1

        def run(args: list[str]) -> tuple[int, dict]:
            import contextlib
            import io
            out = io.StringIO()
            code = None
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
                try:
                    code = seed89.main(list(args))
                except SystemExit as exc:
                    code = exc.code if isinstance(exc.code, int) else 1
                    if not isinstance(exc.code, int):
                        out.write(str(exc.code))
            text = out.getvalue()
            try:
                return code, json.loads(text)
            except json.JSONDecodeError:
                return code, {"raw": text[-400:]}

        common = ["--base-url", base_url, "--token-file", str(token_file),
                  "--key-file", str(key_file), "--model-id", "socket-model"]

        # -- 1: preflight on a root nobody has seeded (QA's `items=0`, over TCP) --
        code, pre = run(common + ["--preflight", "--label", "socket-preflight"])
        facts = pre.get("preflight", {})
        check("preflight_over_a_real_socket_sees_an_empty_root",
              code == 0 and facts.get("profiles", {}).get("total") == 0
              and facts.get("wouldSeed", {}).get("needed") is True,
              {"exit": code, "verdict": pre.get("verdict"), "profiles": facts.get("profiles")})

        # -- 2: the seed itself, over that socket --
        state_file = temporary / "state.json"
        code, report = run(common + ["--label", "socket-seed", "--require-ready",
                                     "--harness", "alpha", "--state-file", str(state_file)])
        verdicts = {family: (value or {}).get("state")
                    for family, value in (report.get("sendability") or {}).items()}
        check("seed_over_a_real_socket_reaches_ready",
              code == 0 and verdicts == {"alpha": "ready"},
              {"exit": code, "verdicts": verdicts, "raw": report.get("raw")})

        # -- 3: the same read over the socket must now say "do not seed again". Asserted as
        #        "at least one ready", because the idempotency probes below add rows on purpose.
        code, after = run(common + ["--preflight", "--label", "socket-preflight-2"])
        after_facts = after.get("preflight", {})
        check("preflight_after_seeding_says_no_seed_is_needed",
              code == 0 and after_facts.get("profiles", {}).get("ready", 0) >= 1
              and after_facts.get("wouldSeed", {}).get("needed") is False,
              {"exit": code, "profiles": after_facts.get("profiles"),
               "wouldSeed": after_facts.get("wouldSeed")})

        # -- 4: re-running the recipe under one label must not seed twice. The honest shape
        # is a typed CONFLICT on `updateConfig` (its `expectedVersion` is stateful, so the
        # request digest really does differ from the first run); what must NOT happen is a
        # second Profile row, and the refusal must arrive typed.
        before_rows = _profile_count(runtime)
        code_replay, replay = run(common + ["--label", "socket-seed", "--require-ready",
                                           "--harness", "alpha",
                                           "--state-file", str(temporary / "replay.json")])
        # Assert the two levels, not a substring: order 115's shape is
        # `code = family` plus `details.internalCode = the domain code`, so "CONFLICT" anywhere
        # would pass on a message that lost the internal code.
        refusal_text = (replay.get("raw") or "") + json.dumps(replay, ensure_ascii=False)
        # `raw` is the script's own message: `…refused {"code": …}`. Read the object out of it
        # rather than matching substrings, and count escape levels only once - the first draft
        # of this line unescaped a string that was never escaped, and came back empty.
        family = internal = ""
        marker = refusal_text.find('{"code"')
        if marker >= 0:
            try:
                fragment, _end = json.JSONDecoder().raw_decode(refusal_text[marker:])
                family = str(fragment.get("code", ""))
                internal = str((fragment.get("details") or {}).get("internalCode", ""))
            except json.JSONDecodeError:
                pass
        after_rows = _profile_count(runtime)
        check("re_running_one_label_refuses_typed_and_seeds_nothing_new",
              code_replay != 0 and family == "CONFLICT_REQUEST"
              and internal == "IDEMPOTENCY_CONFLICT" and after_rows == before_rows,
              {"exit": code_replay, "family": family, "internalCode": internal,
               "profilesBefore": before_rows, "profilesAfter": after_rows,
               "refusal": refusal_text[-200:]})

        # ...while a fresh label really is a different logical request: it must be accepted,
        # which is what makes the assertion above about idempotency and not about a stuck root.
        code_second, second = run(common + ["--label", "socket-seed-2", "--harness", "alpha",
                                            "--state-file", str(temporary / "second.json")])
        check("a_fresh_label_seeds_again", code_second == 0
              and ((second.get("sendability") or {}).get("alpha") or {}).get("state") == "ready"
              and _profile_count(runtime) == after_rows + 1,
              {"exit": code_second, "rows": _profile_count(runtime),
               "raw": second.get("raw", "")[-160:]})

        # -- 5: teardown archives exactly what the seed created (over the socket) --
        code, down = run(["--base-url", base_url, "--token-file", str(token_file),
                          "--teardown", "--state-file", str(state_file)])
        check("teardown_over_the_socket_archives_the_seeded_profile",
              code == 0 and down.get("teardown", {}).get("alpha") == "archived",
              {"exit": code, "teardown": down.get("teardown")})

        # -- 6: no bearer material and no key value in anything the script printed --
        everything = json.dumps([pre, report, replay, after, down], ensure_ascii=False)
        token_value = token_file.read_text(encoding="utf-8").strip()
        check("nothing_secret_in_any_output",
              token_value not in everything
              and "fake-loopback-value-not-a-secret" not in everything,
              {"tokenPrinted": token_value in everything,
               "keyValuePrinted": "fake-loopback-value-not-a-secret" in everything})
    finally:
        if httpd is not None:
            httpd.should_exit = True
        # Join the thread we started: `should_exit` only asks for shutdown, and a listener is
        # still answering until that thread actually returns. Polling `httpd.started` alone
        # raced it and reported a port we had not really given back.
        exited_in_time = True
        if thread is not None:
            thread.join(timeout=10)
            if thread.is_alive():
                exited_in_time = False
                httpd.force_exit = True
                thread.join(timeout=20)
        if runtime is not None:
            runtime.stop()
        leftover: list[dict] = []
        released = False
        for _ in range(60):
            leftover = [row for row in _listeners_on(port) if row["state"] == TCP_LISTEN]
            if not leftover:
                released = True
                break
            time.sleep(0.1)
        RESULT["cleanupPortProbe"] = {
            "stillListening": leftover,
            "allSocketsOnThePort": _listeners_on(port)}
        shutil.rmtree(temporary, ignore_errors=True)
        RESULT["cleanup"] = {"portReleased": released,
                             "exitedOnGracefulRequestOnly": exited_in_time,
                             "tempRootRemoved": not temporary.exists()}
        check("our_own_instance_left_nothing_running_or_behind",
              released and not temporary.exists(), RESULT["cleanup"])
        if not RESULT["cleanup"]["exitedOnGracefulRequestOnly"]:
            print("NOTE: the instance needed force_exit; recorded as a fact, not smoothed over")

    RESULT["result"] = "SOCKET_CHECK_OK" if not FAILURES else "SOCKET_CHECK_FAILED"
    RESULT["failures"] = FAILURES
    # Keep the run's own facts on disk: several of these assertions are about *which* code the
    # Server answered, and a reader must be able to see the envelope without re-running it.
    report = REPO / "docs/server-round1/fullstack/ui-gates-89-socket-check.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(RESULT, indent=1, sort_keys=True), encoding="utf-8")
    RESULT["report"] = str(report)
    print(json.dumps({"result": RESULT["result"], "checks": len(RESULT.get("checks", {})),
                      "failures": FAILURES, "cleanup": RESULT["cleanup"],
                      "report": RESULT.get("report"),
                      "realModelRequests": 0}, indent=1))
    return 0 if not FAILURES else 1


if __name__ == "__main__":
    sys.exit(main())
