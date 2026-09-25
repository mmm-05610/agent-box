"""Order LNX-002 phase-2 夹具自证 (scratch, outside the repo test tree).

Mirrors tests/acp_orchestration/conftest.py's production composition, with one
honest substitution: a STUB plugin root that satisfies only the existence
checks for the retired worker-entry / SOURCE.json. Those bytes are never
executed here - the new channel launch is (NODE, PEER) directly. The stub does
not restore any old-chain fallback; it isolates the one inherited breakage
from the seam this order implements.
"""
import json, os, queue, shutil, sys, tempfile, threading, time
from pathlib import Path

REPO = Path("/home/maoqh/projects/ordessa/worktrees/harness-desktop-002/bc-native")
sys.path.insert(0, str(REPO / "src"))
PEER = REPO / "tests/acp_orchestration/fixtures/bidirectional_acp_peer.mjs"
NODE = shutil.which("node")
assert NODE and PEER.is_file(), "self-check needs node + the fixture peer"

from agent_box.server.bootstrap.runtime import build_runtime_from_native_adapter
from agent_box.server.transport.http.app import create_app
from fastapi.testclient import TestClient

tmp = Path(tempfile.mkdtemp(prefix="hd003-selfcheck-"))
fake_plugin = tmp / "plugin"
(fake_plugin / "runtime").mkdir(parents=True)
(fake_plugin / "third_party" / "harness_remote").mkdir(parents=True)
(fake_plugin / "runtime" / "worker-entry.mjs").write_text("// stub, never executed\n")
(fake_plugin / "third_party" / "harness_remote" / "SOURCE.json").write_text("{}\n")

os.environ["HD003_LOG"] = str(tmp / "peer-log")
runtime = build_runtime_from_native_adapter(
    tmp / "data", plugin_root=fake_plugin, harness_id="pi",
    adapter_command=NODE, adapter_args=(str(PEER),), native_continuation=True)
client = TestClient(create_app(runtime), base_url="http://127.0.0.1")

def wire(method, params, token=None):
    r = client.post(f"/wire/v1/{method}",
                    json={"jsonrpc": "2.0", "id": method, "method": method,
                          "params": params},
                    headers={"authorization": "Bearer " + (token or runtime.token)})
    return r.json()

checks = []
def check(name, ok, detail=""):
    checks.append((name, bool(ok)))
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {str(detail)[:170]}")

with client:
    proj = tmp / "project"
    proj.mkdir()
    opened = wire("workspaces.open", {
        "requestId": "selfcheck-open-1", "path": str(proj),
        "environment": {"kind": "local", "host": None, "user": None}})
    if "result" not in opened:
        print("workspaces.open failed:", json.dumps(opened)[:600])
    project_id = opened["result"]["workspace"]["id"]

    hello = wire("server.hello", {"clientVersions": ["wire/1"],
                                  "clientPresentationSupports": []})["result"]
    ne = hello["nativeExecution"]
    check("hello answers native identity (pi)", ne["mode"] == "native" and ne["harness"] == "pi", ne)

    a = wire("acp.channel.open", {"harnessId": "pi", "projectId": project_id})
    res = a.get("result", {})
    cid, eid = res.get("connectionId"), res.get("executionId")
    binding = res.get("binding", {})
    check("open -> connectionId+executionId+authoritative cwd",
          bool(cid and eid) and binding.get("cwd") == str(proj), res)

    bad = wire("acp.channel.open", {"harnessId": "codex", "projectId": project_id})
    check("foreign harnessId refused before any launch",
          bad.get("error", {}).get("code") == "CAPABILITY_UNSUPPORTED", bad)

    # -- peer-side evidence helpers (conftest 同一日志约定: ${HD003_LOG}.${pid}) --
    import glob as _glob
    def peer_rows():
        rows = []
        for path in _glob.glob(str(tmp / "peer-log") + ".*"):
            for line in Path(path).read_text().splitlines():
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
        return rows
    def peer_pids():
        return {row.get("pid") for row in peer_rows() if row.get("pid")}

    time.sleep(0.5)  # let the legitimately-opened peer's start row land first
    pids_before = peer_pids()   # the legitimate open above may already own its peer
    wrong = client.post("/wire/v1/acp.channel.open", json={
        "jsonrpc": "2.0", "id": "m", "method": "acp.channel.open",
        "params": {"harnessId": "pi", "projectId": "anything"}},
        headers={"authorization": "Bearer wrong-token"})
    wj = wrong.json()
    werr = wj.get("error", {})
    check("wrong-bearer channel open -> 401 UNAUTHENTICATED/AUTHENTICATION_REQUIRED",
          wrong.status_code == 401 and werr.get("code") == "UNAUTHENTICATED"
          and (werr.get("details") or {}).get("internalCode") == "AUTHENTICATION_REQUIRED", wj)
    never = tmp / "never-opened"
    never.mkdir()
    unbound = wire("acp.channel.open", {"harnessId": "pi", "projectId": str(never)})
    check("unbound project refused with a NOT_FOUND-family error",
          "NOT_FOUND" in str(unbound.get("error", {}).get("code", "")), unbound)
    time.sleep(0.5)
    check("all three refusals launched no additional Agent",
          peer_pids() == pids_before, (pids_before, peer_pids()))
    starts = [r for r in peer_rows() if r.get("event") == "peer-start"]
    check("the Agent really starts at open time, in the authoritative project cwd",
          any((r.get("cwd") or "") in (str(proj), str(proj.resolve())) for r in starts),
          starts)

    def close_code(exc):
        return getattr(exc, "code", None) or repr(exc)

    try:
        with client.websocket_connect("/wire/v1/acp-channel/" + cid) as ws:
            check("WS without bearer refused (4401)", False, "accepted anonymously")
    except Exception as exc:
        check("WS without bearer refused (4401)", "4401" in str(close_code(exc)), close_code(exc))

    try:
        with client.websocket_connect("/wire/v1/acp-channel/" + cid,
                                      headers={"authorization": "Bearer wrong"}) as ws:
            check("WS wrong bearer refused (4401)", False, "accepted wrong bearer")
    except Exception as exc:
        check("WS wrong bearer refused (4401)", "4401" in str(close_code(exc)), close_code(exc))

    try:
        with client.websocket_connect("/wire/v1/acp-channel/" + cid,
                                      headers={"authorization": "Bearer " + runtime.token,
                                               "origin": "http://evil.example"}) as ws:
            check("WS non-loopback Origin refused (4403)", False, "accepted evil origin")
    except Exception as exc:
        check("WS non-loopback Origin refused (4403)", "4403" in str(close_code(exc)),
              close_code(exc))

    with client.websocket_connect(
            "/wire/v1/acp-channel/" + cid,
            headers={"authorization": "Bearer " + runtime.token}) as ws:
        inbox: queue.Queue = queue.Queue()
        def reader():
            while True:
                try:
                    inbox.put(ws.receive_text())
                except Exception as exc:
                    inbox.put(("CLOSED", repr(exc)))
                    return
        threading.Thread(target=reader, daemon=True).start()
        def next_line(timeout=25):
            try:
                return inbox.get(timeout=timeout)
            except queue.Empty:
                return "TIMEOUT"

        time.sleep(1.0)  # give the Server any chance to act on the client's behalf
        recv_at_setup = [r for r in peer_rows() if r.get("dir") == "recv"]
        check("establishment performs no initialize/session/new/prompt for the client",
              not recv_at_setup, recv_at_setup[:2])

        ws.send_text(json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize",
                                 "params": {"protocolVersion": 1, "clientCapabilities": {}}}))
        line = next_line()
        f = json.loads(line) if isinstance(line, str) else line
        check("client initialize frame relayed verbatim, peer answered",
              isinstance(f, dict) and f.get("id") == 1 and "result" in f, line)
        init_result = f.get("result", {}) if isinstance(f, dict) else {}
        check("initialize extension fields arrive untouched (agentInfo/vendorExtensions/"
              "advertised capabilities)",
              "hd003" in json.dumps(init_result)
              and init_result.get("agentCapabilities", {}).get("hd003_custom_capability", {})
              and init_result.get("agentCapabilities", {}).get("sessionCapabilities", {})
              .get("resume") is not None,
              str(init_result)[:200])

        ws.send_text(json.dumps({"jsonrpc": "2.0", "id": 2, "method": "session/new",
                                 "params": {"cwd": str(proj), "mcpServers": []}}))
        line = next_line()
        f = json.loads(line) if isinstance(line, str) else line
        check("session/new answered by the peer through the relay",
              isinstance(f, dict) and f.get("id") == 2 and "result" in f, line)
        check("connectionId is a separate identity from the native sessionId",
              bool(cid) and cid != f.get("result", {}).get("sessionId"),
              (cid, f.get("result", {}).get("sessionId")))

        a2 = wire("acp.channel.open", {"harnessId": "pi", "projectId": project_id})
        check("re-acquire returns the same live connection (no second run)",
              a2["result"].get("connectionId") == cid and a2["result"].get("executionId") == eid,
              a2)

        inv = wire("executions.list", {"requestId": "selfcheck-inv-1"})["result"]["executions"]
        mine = [r for r in inv if r.get("executionId") == eid]
        check("exactly one execution for the whole channel run (in-flight ledger)",
              len(mine) == 1, f"{len(mine)} of {len(inv)} rows")

    run = wire("executions.get", {"requestId": "selfcheck-run-1", "executionId": eid})["result"]
    check("run view is in-flight, not a fabricated end",
          run.get("state") not in ("closed", "interrupted"), run)

    rel = wire("acp.channel.release", {"connectionId": cid})
    rr = rel.get("result", {})
    check("explicit release acknowledged",
          rr.get("released") is True and rr.get("connectionId") == cid and rr.get("endReason"), rr)

    run2 = wire("executions.get", {"requestId": "selfcheck-run-2", "executionId": eid})["result"]
    check("run record positively closed with reason",
          run2.get("state") == "closed" and run2.get("endReason"), run2)

    try:
        with client.websocket_connect(
                f"/wire/v1/acp-channel/{cid}",
                headers={"authorization": "Bearer " + runtime.token}):
            check("released connectionId refused (4400)", False, "accepted after release")
    except Exception as exc:
        check("released connectionId refused (4400)", "4400" in str(close_code(exc)), close_code(exc))

    # -- detach is not release; a peer crash records the real end --------------
    b = wire("acp.channel.open", {"harnessId": "pi", "projectId": project_id})["result"]
    cid_b, eid_b = b["connectionId"], b["executionId"]
    check("re-open after release starts a fresh run", cid_b != cid and eid_b != eid, b)

    with client.websocket_connect("/wire/v1/acp-channel/" + cid_b,
                                  headers={"authorization": "Bearer " + runtime.token}):
        pass  # attach and walk away without releasing
    time.sleep(1.0)  # the client "switches away": quiet, no frames either way
    view = wire("executions.get", {"requestId": "selfcheck-run-3", "executionId": eid_b})["result"]
    check("detach is not release (run stays live)", view.get("state") == "accepted", view)
    cancels = [r for r in peer_rows() if r.get("dir") == "recv"
               and (r.get("frame") or {}).get("method") in ("session/cancel", "$/cancel")]
    check("quiet/detach forges no cancel toward any Agent", not cancels, cancels[:1])

    with client.websocket_connect("/wire/v1/acp-channel/" + cid_b,
                                  headers={"authorization": "Bearer " + runtime.token}) as ws2:
        inbox2: queue.Queue = queue.Queue()
        def reader2():
            while True:
                try:
                    inbox2.put(ws2.receive_text())
                except Exception as exc:
                    inbox2.put(("CLOSED", repr(exc)))
                    return
        threading.Thread(target=reader2, daemon=True).start()
        def next2(timeout=25):
            try:
                return inbox2.get(timeout=timeout)
            except queue.Empty:
                return "TIMEOUT"

        ws2.send_text(json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize",
                                  "params": {"protocolVersion": 1, "clientCapabilities": {}}}))
        next2()
        ws2.send_text(json.dumps({"jsonrpc": "2.0", "id": 2, "method": "session/new",
                                  "params": {"cwd": str(proj), "mcpServers": []}}))
        nxt = next2()
        sid2 = json.loads(nxt)["result"]["sessionId"] if isinstance(nxt, str) else None
        ws2.send_text(json.dumps({"jsonrpc": "2.0", "id": 3, "method": "session/prompt",
                                  "params": {"sessionId": sid2, "prompt": [
                                      {"type": "text", "text": "scenario:die"}]}}))
        seen_chunk = isinstance(next2(), str)      # pre-death chunk arrives
        ended = next2()                             # then the relay must close
        check("peer death closes the relay honestly", seen_chunk and isinstance(ended, tuple),
              f"chunk={seen_chunk} end={str(ended)[:80]}")

    time.sleep(0.5)
    view2 = wire("executions.get", {"requestId": "selfcheck-run-4", "executionId": eid_b})["result"]
    check("abnormal exit records the real reason, no fabricated answer",
          view2.get("state") == "interrupted"
          and str(view2.get("endReason")).startswith("ACP_AGENT_EXITED-3"), view2)

    # -- same request id across two live channels must not cross ---------------
    proj_x, proj_y = tmp / "project-x", tmp / "project-y"
    proj_x.mkdir(); proj_y.mkdir()
    env = {"kind": "local", "host": None, "user": None}
    x_pid = wire("workspaces.open", {"requestId": "selfcheck-open-x",
                                     "path": str(proj_x), "environment": env}
                 )["result"]["workspace"]["id"]
    y_pid = wire("workspaces.open", {"requestId": "selfcheck-open-y",
                                     "path": str(proj_y), "environment": env}
                 )["result"]["workspace"]["id"]
    ox = wire("acp.channel.open", {"harnessId": "pi", "projectId": x_pid})["result"]
    oy = wire("acp.channel.open", {"harnessId": "pi", "projectId": y_pid})["result"]
    check("two channels: distinct identities, each with its own authoritative cwd",
          ox["connectionId"] != oy["connectionId"] and ox["executionId"] != oy["executionId"]
          and ox["binding"]["cwd"] == str(proj_x) and oy["binding"]["cwd"] == str(proj_y),
          (ox["binding"], oy["binding"]))

    def attach(connection_id):
        cm = client.websocket_connect("/wire/v1/acp-channel/" + connection_id,
                                      headers={"authorization": "Bearer " + runtime.token})
        ws = cm.__enter__()
        box: queue.Queue = queue.Queue()
        def pump():
            while True:
                try:
                    box.put(ws.receive_text())
                except Exception as exc:
                    box.put(("CLOSED", repr(exc)))
                    return
        threading.Thread(target=pump, daemon=True).start()
        def grab(timeout=25):
            try:
                raw = box.get(timeout=timeout)
            except queue.Empty:
                return {"id": "TIMEOUT"}
            return json.loads(raw) if isinstance(raw, str) else {"id": raw}
        def say(frame):
            ws.send_text(json.dumps(frame))
        return cm, say, grab

    cmx, say_x, grab_x = attach(ox["connectionId"])
    cmy, say_y, grab_y = attach(oy["connectionId"])
    try:
        init = {"jsonrpc": "2.0", "id": 1, "method": "initialize",
                "params": {"protocolVersion": 1, "clientCapabilities": {}}}
        say_x(init); say_y(dict(init))
        say_x({"jsonrpc": "2.0", "id": 2, "method": "session/new",
               "params": {"cwd": str(proj_x), "mcpServers": []}})
        say_y({"jsonrpc": "2.0", "id": 2, "method": "session/new",
               "params": {"cwd": str(proj_y), "mcpServers": []}})
        x_open, y_open = [grab_x() for _ in range(2)], [grab_y() for _ in range(2)]
        x_sid = x_open[1]["result"]["sessionId"]
        y_sid = y_open[1]["result"]["sessionId"]
        check("parallel channels answer their own frames only",
              {f.get("id") for f in x_open} == {1, 2} and {f.get("id") for f in y_open} == {1, 2}
              and x_sid != y_sid, (x_sid, y_sid))

        say_x({"jsonrpc": "2.0", "id": 7, "method": "session/prompt",
               "params": {"sessionId": x_sid, "prompt": [
                   {"type": "text", "text": "ping-X-42"}]}})
        say_y({"jsonrpc": "2.0", "id": 7, "method": "session/prompt",
               "params": {"sessionId": y_sid, "prompt": [
                   {"type": "text", "text": "ping-Y-42"}]}})
        x7, y7 = [grab_x() for _ in range(2)], [grab_y() for _ in range(2)]
        def clean(frames, own_text, other_text):
            blob = json.dumps(frames)
            return (own_text in blob and other_text not in blob
                    and any(f.get("id") == 7 and f.get("result", {}).get("stopReason") == "end_turn"
                            for f in frames))
        check("same request id on two channels: answers never cross lines",
              clean(x7, "ping-X-42", "ping-Y-42") and clean(y7, "ping-Y-42", "ping-X-42"),
              (x7, y7))

        say_x({"jsonrpc": "2.0", "id": 8, "method": "session/prompt",
               "params": {"sessionId": x_sid, "prompt": [
                   {"type": "text", "text": "scenario:rpc-error"}]}})
        err8 = grab_x()   # this scenario answers with exactly one error frame
        check("peer error relayed verbatim, extension payload inside data kept",
              err8.get("error", {}).get("code") == -32603
              and err8["error"]["data"]["vendorDetail"] == "keep-me", err8)

        say_x({"jsonrpc": "2.0", "id": 9, "method": "session/prompt",
               "params": {"sessionId": x_sid, "prompt": [
                   {"type": "text", "text": "scenario:meta"}]}})
        meta9 = [grab_x(), grab_x()]
        check("_meta extension survives the relay untouched",
              any(f.get("method") == "session/update"
                  and f.get("params", {}).get("update", {}).get("_meta", {}).get("vendor") == "hd003"
                  for f in meta9), str(meta9)[:160])

        say_x({"jsonrpc": "2.0", "id": 10, "method": "session/prompt",
               "params": {"sessionId": x_sid, "prompt": [
                   {"type": "text", "text": "scenario:hang"}]}})
        quiet10 = grab_x(timeout=3)   # the in-flight prompt must stay unanswered
        say_x({"jsonrpc": "2.0", "method": "session/cancel",
               "params": {"sessionId": x_sid}})
        f10 = grab_x()
        check("Server never answers an in-flight prompt; downstream session/cancel "
              "reaches the peer, which settles it cancelled",
              quiet10.get("id") == "TIMEOUT" and f10.get("id") == 10
              and f10.get("result", {}).get("stopReason") == "cancelled", (quiet10, f10))

        say_x({"jsonrpc": "2.0", "id": 12, "method": "session/prompt",
               "params": {"sessionId": x_sid, "prompt": [
                   {"type": "text", "text": "scenario:custom-update"}]}})
        cu = [grab_x(), grab_x(), grab_x()]
        check("unknown sessionUpdate kind relays through unfiltered",
              any(f.get("method") == "session/update"
                  and f.get("params", {}).get("update", {}).get("sessionUpdate")
                  == "hd003_extension"
                  and f["params"]["update"].get("payload", {}).get("keep") == "me"
                  for f in cu), str(cu)[:160])

        rel_x = wire("acp.channel.release", {"connectionId": ox["connectionId"]})["result"]
        rel_y = wire("acp.channel.release", {"connectionId": oy["connectionId"]})["result"]
        check("concurrent channels release independently, each its own run",
              rel_x["released"] and rel_y["released"] and rel_x["endReason"] and rel_y["endReason"]
              and rel_x["executionId"] == ox["executionId"]
              and rel_y["executionId"] == oy["executionId"], (rel_x, rel_y))
    finally:
        cmx.__exit__(None, None, None)
        cmy.__exit__(None, None, None)

    # -- peer-initiated request reaches the client, client answer reaches back --
    oz = wire("acp.channel.open", {"harnessId": "pi", "projectId": x_pid})["result"]
    cmz, say_z, grab_z = attach(oz["connectionId"])
    try:
        say_z({"jsonrpc": "2.0", "id": 1, "method": "initialize",
               "params": {"protocolVersion": 1, "clientCapabilities": {}}})
        grab_z()
        say_z({"jsonrpc": "2.0", "id": 2, "method": "session/new",
               "params": {"cwd": str(proj_x), "mcpServers": []}})
        z_sid = grab_z()["result"]["sessionId"]
        say_z({"jsonrpc": "2.0", "id": 5, "method": "session/prompt",
               "params": {"sessionId": z_sid, "prompt": [
                   {"type": "text", "text": "scenario:permission"}]}})
        rev = grab_z()
        options = rev.get("params", {}).get("options", [])
        check("peer-initiated request arrives verbatim (id, method, options)",
              rev.get("jsonrpc") == "2.0" and rev.get("id") == 7777
              and rev.get("method") == "session/request_permission"
              and [o.get("kind") for o in options] == ["allow_once", "reject_once"]
              and all(str(o.get("optionId", "")).startswith(("grant-", "reject-"))
                      for o in options), rev)
        say_z({"jsonrpc": "2.0", "id": 7777,
               "result": {"outcome": {"outcomeSelected": {
                   "optionId": options[0]["optionId"]}}}})
        answered = grab_z()
        check("client answer travels the reverse direction and completes the prompt",
              answered.get("id") == 5
              and answered.get("result", {}).get("stopReason") == "end_turn", answered)
        time.sleep(0.3)
        picked = options[0]["optionId"]
        echoes = [r for r in peer_rows() if r.get("event") == "permission-answer"
                  and picked in json.dumps((r.get("frame") or {}).get("result", {}))]
        check("the client's chosen optionId reaches the peer verbatim, not a kind-guess",
              bool(echoes), echoes[:1])
        # 多轮复用同通道同进程：再来两轮 prompt，账本仍只有一条 in-flight 行。
        for round_id in (6, 7):
            say_z({"jsonrpc": "2.0", "id": round_id, "method": "session/prompt",
                   "params": {"sessionId": z_sid, "prompt": [
                       {"type": "text", "text": f"round-{round_id}"}]}})
            rounds = [grab_z(), grab_z()]
            if not any(f.get("id") == round_id and "result" in f for f in rounds):
                break
        inv_live = wire("executions.list", {"requestId": "selfcheck-inv-2"})["result"]["executions"]
        z_rows = [r for r in inv_live if r.get("executionId") == oz["executionId"]]
        check("multi-round ACP reuses channel+process: still one execution",
              len(z_rows) == 1 and len(inv_live) == 1, f"{len(z_rows)}/{len(inv_live)} rows")
        rel_z = wire("acp.channel.release", {"connectionId": oz["connectionId"]})["result"]
        check("reverse-request channel releases cleanly too",
              rel_z["released"] is True and rel_z["endReason"], rel_z)
    finally:
        cmz.__exit__(None, None, None)

    # -- twin native session ids across two channels must not cross -------------
    os.environ["HD003_FORCE_SESSION_ID"] = "hd003-forced-twin"
    try:
        fx = wire("acp.channel.open", {"harnessId": "pi", "projectId": x_pid})["result"]
        fy = wire("acp.channel.open", {"harnessId": "pi", "projectId": y_pid})["result"]
        cmfx, say_fx, grab_fx = attach(fx["connectionId"])
        cmfy, say_fy, grab_fy = attach(fy["connectionId"])
        try:
            for say, cwd in ((say_fx, proj_x), (say_fy, proj_y)):
                say({"jsonrpc": "2.0", "id": 1, "method": "initialize",
                     "params": {"protocolVersion": 1, "clientCapabilities": {}}})
                say({"jsonrpc": "2.0", "id": 2, "method": "session/new",
                     "params": {"cwd": str(cwd), "mcpServers": []}})
            rx = [grab_fx(), grab_fx()]
            ry = [grab_fy(), grab_fy()]
            sid_fx = rx[1]["result"]["sessionId"]
            sid_fy = ry[1]["result"]["sessionId"]
            check("premise: both peers really report the SAME native session id",
                  sid_fx == sid_fy == "hd003-forced-twin", (sid_fx, sid_fy))
            say_fx({"jsonrpc": "2.0", "id": 7, "method": "session/prompt",
                    "params": {"sessionId": sid_fx, "prompt": [
                        {"type": "text", "text": "twin-X-99"}]}})
            say_fy({"jsonrpc": "2.0", "id": 7, "method": "session/prompt",
                    "params": {"sessionId": sid_fy, "prompt": [
                        {"type": "text", "text": "twin-Y-99"}]}})
            tx = [grab_fx(), grab_fx()]
            ty = [grab_fy(), grab_fy()]
            check("identical jsonrpc ids AND identical native session ids: no cross-talk",
                  clean(tx, "twin-X-99", "twin-Y-99")
                  and clean(ty, "twin-Y-99", "twin-X-99"), (tx, ty))
            rfx = wire("acp.channel.release", {"connectionId": fx["connectionId"]})["result"]
            rfy = wire("acp.channel.release", {"connectionId": fy["connectionId"]})["result"]
            check("twin-id channels release independently, each its own run",
                  rfx["released"] and rfy["released"]
                  and rfx["executionId"] != rfy["executionId"], (rfx, rfy))
        finally:
            cmfx.__exit__(None, None, None)
            cmfy.__exit__(None, None, None)
    finally:
        del os.environ["HD003_FORCE_SESSION_ID"]

    # -- release is authorization-gated; ending never answers the in-flight ----
    orz = wire("acp.channel.open", {"harnessId": "pi", "projectId": x_pid})["result"]
    cmr, say_r, grab_r = attach(orz["connectionId"])
    try:
        say_r({"jsonrpc": "2.0", "id": 1, "method": "initialize",
               "params": {"protocolVersion": 1, "clientCapabilities": {}}})
        grab_r()
        say_r({"jsonrpc": "2.0", "id": 2, "method": "session/new",
               "params": {"cwd": str(proj_x), "mcpServers": []}})
        sid_r = grab_r()["result"]["sessionId"]
        say_r({"jsonrpc": "2.0", "id": 6, "method": "session/prompt",
               "params": {"sessionId": sid_r, "prompt": [
                   {"type": "text", "text": "scenario:hang"}]}})
        quiet6 = grab_r(timeout=3)   # deliberately left unfinished
        rj = client.post("/wire/v1/acp.channel.release", json={
            "jsonrpc": "2.0", "id": "m", "method": "acp.channel.release",
            "params": {"connectionId": orz["connectionId"]}},
            headers={"authorization": "Bearer nope"})
        rjj = rj.json()
        check("unauthorised release attempt -> 401 UNAUTHENTICATED",
              rj.status_code == 401 and rjj.get("error", {}).get("code") == "UNAUTHENTICATED",
              rjj)
        say_r({"jsonrpc": "2.0", "id": 7, "method": "session/prompt",
               "params": {"sessionId": sid_r, "prompt": [
                   {"type": "text", "text": "still-ours"}]}})
        f7 = [grab_r(), grab_r()]
        check("a refused release leaves the channel fully usable (real round trip)",
              any(f.get("id") == 7 and f.get("result", {}).get("stopReason") == "end_turn"
                  for f in f7), f7)
        ack = wire("acp.channel.release", {"connectionId": orz["connectionId"]})["result"]
        check("a client-initiated close names exactly the reason released",
              ack.get("endReason") == "released", ack)
        left = [grab_r(timeout=2) for _ in range(3)]
        fabricated6 = [f for f in left
                       if isinstance(f, dict) and f.get("id") == 6 and "result" in f]
        check("the unfinished in-flight prompt is never answered when the run closes",
              not fabricated6 and quiet6.get("id") == "TIMEOUT", left)
    finally:
        cmr.__exit__(None, None, None)

    # -- seam 2's promised double attach: broadcast, single serial stdin write --
    pids_pre_open = peer_pids()
    od = wire("acp.channel.open", {"harnessId": "pi", "projectId": y_pid})["result"]
    od_pid = None
    for _ in range(50):  # the Agent launches at open time; wait for its own pid
        fresh = peer_pids() - pids_pre_open
        if fresh:
            od_pid = fresh.pop()
            break
        time.sleep(0.1)
    cm1, say1, grab1 = attach(od["connectionId"])
    cm2, say2, grab2 = attach(od["connectionId"])
    try:
        say1({"jsonrpc": "2.0", "id": 1, "method": "initialize",
              "params": {"protocolVersion": 1, "clientCapabilities": {}}})
        d1, d2 = grab1(), grab2()
        check("two live attaches on one channel: the answer is broadcast to both",
              d1.get("id") == 1 and d2.get("id") == 1
              and "result" in d1 and "result" in d2, (d1, d2))
        recv_init = [r for r in peer_rows() if r.get("pid") == od_pid
                     and r.get("dir") == "recv"
                     and (r.get("frame") or {}).get("method") == "initialize"]
        check("double attach writes the peer's stdin exactly once (serial, not duplicated)",
              od_pid is not None and len(recv_init) == 1, (od_pid, recv_init))
        say2({"jsonrpc": "2.0", "id": 2, "method": "session/new",
              "params": {"cwd": str(proj_y), "mcpServers": []}})
        e1, e2 = grab1(), grab2()
        check("a frame sent on either attach answers once and reaches every attach",
              e1.get("id") == 2 and e2.get("id") == 2, (e1, e2))
    finally:
        cm1.__exit__(None, None, None)
        cm2.__exit__(None, None, None)
    rel_od = wire("acp.channel.release", {"connectionId": od["connectionId"]})["result"]
    check("a double-attached channel releases once, ending its single run",
          rel_od["released"] and rel_od["executionId"] == od["executionId"], rel_od)

    # -- concurrent open on one pair: ownership converges, the loser leaves nothing
    def live_peer_pids():
        found = set()
        for proc in Path("/proc").glob("[0-9]*/cmdline"):
            try:
                if b"bidirectional_acp_peer" in proc.read_bytes():
                    found.add(proc.parent.name)
            except OSError:
                pass
        return found

    proj_r = tmp / "project-race"
    proj_r.mkdir()
    r_ws = wire("workspaces.open", {"requestId": "selfcheck-open-race",
                                    "path": str(proj_r), "environment": env}
                )["result"]["workspace"]["id"]
    converged_rounds = []
    for round_no in range(4):
        baseline = {x["executionId"] for x in
                    wire("executions.list",
                         {"requestId": f"selfcheck-race-base-{round_no}"})
                    ["result"]["executions"]}
        gate = threading.Barrier(2)
        out: dict[int, dict] = {}
        def fired(idx):
            gate.wait()          # both threads enter acp.channel.open together
            out[idx] = wire("acp.channel.open",
                            {"harnessId": "pi", "projectId": r_ws})
        ts = [threading.Thread(target=fired, args=(i,)) for i in (0, 1)]
        for t in ts:
            t.start()
        for t in ts:
            t.join(60)
        ra = out.get(0, {}).get("result")
        rb = out.get(1, {}).get("result")
        if not (ra and rb) or ra != rb:
            converged_rounds.append((round_no, False, (out.get(0), out.get(1))))
            continue
        # One live Agent for the pair, whatever the loser did; watch the window.
        saw_extra_live = False
        live_final: set = set()
        for _ in range(80):      # up to 8s: spawn + terminate of a superseded peer
            live_final = live_peer_pids()
            if len(live_final) > 1:
                saw_extra_live = True
            if len(live_final) == 1:
                break
            time.sleep(0.1)
        mine = {x["executionId"] for x in
                wire("executions.list", {"requestId": f"selfcheck-race-{round_no}"})
                ["result"]["executions"]} - baseline
        ok = (len(live_final) == 1 and mine == {ra["executionId"]})
        converged_rounds.append((round_no, ok,
                                 f"live={sorted(live_final)} new-inflight={mine} "
                                 f"race-window-hit={saw_extra_live}"))
        wire("acp.channel.release", {"connectionId": ra["connectionId"]})
        time.sleep(0.4)          # let the released Agent actually go away

    check("simultaneous same-pair opens always converge to one identical connection",
          all(ok for _, ok, _ in converged_rounds),
          "; ".join(f"r{round_no}:{detail}" for round_no, ok, detail in converged_rounds))
    check("a raced open leaves exactly one live Agent and exactly one in-flight run (no orphan)",
          all(ok for _, ok, _ in converged_rounds),
          "; ".join(f"r{round_no}:{detail}" for round_no, ok, detail in converged_rounds))
    check("after releasing each raced channel no race peer stays alive",
          not live_peer_pids(), live_peer_pids())

    # -- force the superseded branch on the real registry (see seam doc note:  --
    # -- the HTTP wire route dispatches synchronously on one event loop, so    --
    # -- two wire opens can never overlap inside acquire; the race guard is    --
    # -- exercised here by calling the registry concurrently, real components, --
    # -- no logic changed).                                                    --
    def race_started_pids():
        paths = {str(proj_r), str(proj_r.resolve())}
        return {str(r.get("pid")) for r in peer_rows()
                if r.get("event") == "peer-start" and str(r.get("cwd")) in paths}

    prof_id = wire("server.hello", {"clientVersions": ["wire/1"],
                                    "clientPresentationSupports": []}
                   )["result"]["nativeExecution"].get("profileId")
    reg = runtime.acp_channels
    original_launch = reg._launch
    widened_calls = []
    def widened_launch(**kw):
        widened_calls.append(kw.get("cwd"))
        time.sleep(0.6)   # park both racers inside acquire's pre-registration window
        return original_launch(**kw)
    widened_pids: list[int] = []
    def launch_and_note(**kw):
        transport = widened_launch(**kw)
        widened_pids.append(transport.pid)
        return transport
    reg._launch = launch_and_note
    try:
        started_before = race_started_pids()
        gate = threading.Barrier(2)
        out2: dict[int, dict] = {}
        err2: dict[int, str] = {}
        def acquire_direct(idx):
            gate.wait()
            try:
                out2[idx] = reg.acquire(harness_id="pi", workspace_id=r_ws,
                                        profile_id=str(prof_id), cwd=str(proj_r))
            except BaseException as exc:  # noqa: BLE001 - reported, never swallowed
                err2[idx] = type(exc).__name__ + ": " + str(exc)[:200]
        ts = [threading.Thread(target=acquire_direct, args=(i,)) for i in (0, 1)]
        for t in ts:
            t.start()
        for t in ts:
            t.join(90)
        # Evidence of two REAL OS spawns (the loser may die before node flushes
        # its first log row, so Popen pids, not rows, are the honest premise).
        live_final: set = set()
        for _ in range(100):
            live_final = {str(p) for p in widened_pids
                          if Path("/proc/" + str(int(p)) + "/cmdline").exists()}
            if len(live_final) == 1:
                break
            time.sleep(0.1)
        check("premise: concurrent acquire really spawned TWO OS Agents (superseded branch ran)",
              not err2 and len(set(widened_pids)) == 2,
              {"pids": widened_pids, "calls": widened_calls, "errors": err2,
               "rows": sorted(race_started_pids() - started_before)})
        ra2 = out2.get(0)
        rb2 = out2.get(1)
        check("the superseded loser converges to the winner's identical connection identity",
              bool(ra2) and ra2 == rb2, (ra2, rb2))
        check("the superseded loser's Agent is terminated: exactly one of the two stays alive",
              len(live_final) == 1, {"started": sorted(str(p) for p in widened_pids),
                                     "alive": sorted(live_final)})
        mine3 = {x["executionId"] for x in
                 wire("executions.list", {"requestId": "selfcheck-race-direct"})
                 ["result"]["executions"]}
        check("the superseded race leaves exactly one in-flight run in the shared ledger",
              ra2 is not None and mine3 == {ra2["executionId"]}, mine3)
        rel_sup = (wire("acp.channel.release", {"connectionId": ra2["connectionId"]})["result"]
                   if ra2 else {})
        check("the surviving winner of a superseded race releases as any normal channel",
              rel_sup["released"] and rel_sup["endReason"] == "released", rel_sup)
    finally:
        reg._launch = original_launch
        time.sleep(0.4)

    # -- an abnormally ended run never blocks a fresh one ----------------------
    reo = wire("acp.channel.open", {"harnessId": "pi", "projectId": project_id})["result"]
    check("after the crash the same pair re-opens as a NEW live channel",
          reo["connectionId"] != cid_b and reo["executionId"] != eid_b, reo)
    cmm, say_m, grab_m = attach(reo["connectionId"])
    try:
        say_m({"jsonrpc": "2.0", "id": 1, "method": "initialize",
               "params": {"protocolVersion": 1, "clientCapabilities": {}}})
        first = grab_m()
        say_m({"jsonrpc": "2.0", "id": 2, "method": "session/new",
               "params": {"cwd": str(proj), "mcpServers": []}})
        second = grab_m()
        check("the replacement channel really round-trips (no zombie reuse)",
              first.get("id") == 1 and second.get("id") == 2
              and "result" in first and "result" in second, (first, second))
    finally:
        cmm.__exit__(None, None, None)
    wire("acp.channel.release", {"connectionId": reo["connectionId"]})

    # -- verbatim full-frame relay + exact multi-round accounting ---------------
    proj_v = tmp / "project-verbatim"
    proj_v.mkdir()
    v_ws = wire("workspaces.open", {"requestId": "selfcheck-open-verbatim",
                                    "path": str(proj_v), "environment": env}
                )["result"]["workspace"]["id"]
    pids_pre_v = peer_pids()
    ov = wire("acp.channel.open", {"harnessId": "pi", "projectId": v_ws})["result"]
    vpeer = None
    for _ in range(80):
        fresh = peer_pids() - pids_pre_v
        if fresh:
            vpeer = fresh.pop()
            break
        time.sleep(0.1)
    cmv, say_v, grab_v = attach(ov["connectionId"])
    received: list = []
    sent_by_client: list = []
    try:
        def v_say(frame):
            sent_by_client.append(frame)
            say_v(frame)

        def grab_one(timeout=25):
            f = grab_v(timeout=timeout)
            received.append(f)
            return f

        v_say({"jsonrpc": "2.0", "id": 1, "method": "initialize",
               "params": {"protocolVersion": 1, "clientCapabilities": {}}})
        grab_one()
        v_say({"jsonrpc": "2.0", "id": 2, "method": "session/new",
               "params": {"cwd": str(proj_v), "mcpServers": []}})
        grab_one()
        sid_v = received[-1]["result"]["sessionId"]

        def prompt(rid, text):
            v_say({"jsonrpc": "2.0", "id": rid, "method": "session/prompt",
                   "params": {"sessionId": sid_v, "prompt": [
                       {"type": "text", "text": text}]}})

        prompt(10, "scenario:meta")
        while not any(f.get("id") == 10 and "result" in f for f in received):
            grab_one()
        prompt(11, "scenario:custom-update")
        while not any(f.get("id") == 11 and "result" in f for f in received):
            grab_one()
        prompt(13, "scenario:rpc-error")
        while not any(f.get("id") == 13 and "error" in f for f in received):
            grab_one()
        prompt(12, "scenario:permission twin-options")
        rev = None
        while rev is None:
            grab_one()
            rev = next((f for f in received
                        if f.get("method") == "session/request_permission"), None)
        allow = [o for o in rev["params"]["options"] if o.get("kind") == "allow_once"]
        check("premise: twin-options really offers two same-kind allow options",
              len(allow) == 2, rev["params"]["options"])
        chosen = next(o["optionId"] for o in allow
                      if str(o["optionId"]).startswith("pick-2-"))
        client_answer = {"jsonrpc": "2.0", "id": rev["id"], "result": {
            "outcome": {"outcome": "selected", "optionId": chosen}}}
        v_say(client_answer)
        while not any(f.get("id") == 12 and "result" in f for f in received):
            grab_one()

        # quiet viewing: nothing restarts, nothing cancels, then a real round trip
        pids_quiet = set(peer_pids())
        time.sleep(2.0)
        prompt(20, "still-alive-after-quiet")
        while not any(f.get("id") == 20 and "result" in f for f in received):
            grab_one()
        time.sleep(0.8)  # let the peer's own log flush the tail frames
        rows_v = [r for r in peer_rows() if r.get("pid") == vpeer]
        sent_rows = [r["frame"] for r in rows_v if r.get("dir") == "send"]
        recv_rows = [r["frame"] for r in rows_v if r.get("dir") == "recv"]
        missing_in = [f for f in sent_rows if f not in received]
        check("every frame the peer sent arrives WHOLE-IDENTICAL at the client (no coercion)",
              sent_rows and not missing_in, missing_in[:2])
        missing_out = [f for f in sent_by_client if f not in recv_rows]
        check("every frame the client sent reaches the peer WHOLE-IDENTICAL (serial relay)",
              len(recv_rows) == len(sent_by_client) and not missing_out, missing_out[:2])
        starts_v = [r for r in rows_v if r.get("event") == "peer-start"]
        prompts_v = [r for r in recv_rows if r.get("method") == "session/prompt"]
        news_v = [r for r in recv_rows if r.get("method") == "session/new"]
        check("multi-round accounting: 5 prompts, ONE process, one start row, one session/new",
              len(prompts_v) == 5 and len(starts_v) == 1 and len(news_v) == 1
              and set(peer_pids()) == pids_quiet,
              {"prompts": len(prompts_v), "starts": len(starts_v), "news": len(news_v)})
        check("quiet viewing forged no session/cancel and answered no pending request",
              not any(r.get("method") == "session/cancel" for r in recv_rows), recv_rows)
        answers_v = [r for r in rows_v if r.get("event") == "permission-answer"]
        check("the client's pick-2 answer reaches the peer EXACTLY, exactly once",
              len(answers_v) == 1 and answers_v[0]["frame"] == client_answer,
              [r.get("frame") for r in answers_v])
        err13 = next(f for f in received if f.get("id") == 13 and "error" in f)
        err_sent = [f for f in sent_rows if f.get("id") == 13 and "error" in f]
        check("the peer's error frame is relayed whole-identical, not rebuilt",
              len(err_sent) == 1 and err13 == err_sent[0], (err13, err_sent))
    finally:
        cmv.__exit__(None, None, None)
    rel_v = wire("acp.channel.release", {"connectionId": ov["connectionId"]})["result"]
    check("the verbatim channel releases as any normal channel",
          rel_v["released"] and rel_v["endReason"] == "released", rel_v)

    # -- an externally SIGKILLed Agent ends the run honestly -------------------
    import signal as _signal
    pids_pre_k = peer_pids()
    ook = wire("acp.channel.open", {"harnessId": "pi", "projectId": v_ws})["result"]
    kpeer = None
    for _ in range(80):
        fresh = peer_pids() - pids_pre_k
        if fresh:
            kpeer = fresh.pop()
            break
        time.sleep(0.1)
    cmk, say_k, grab_k = attach(ook["connectionId"])
    try:
        say_k({"jsonrpc": "2.0", "id": 1, "method": "initialize",
               "params": {"protocolVersion": 1, "clientCapabilities": {}}})
        grab_k()
        say_k({"jsonrpc": "2.0", "id": 2, "method": "session/new",
               "params": {"cwd": str(proj_v), "mcpServers": []}})
        sid_k = grab_k()["result"]["sessionId"]
        say_k({"jsonrpc": "2.0", "id": 7, "method": "session/prompt",
               "params": {"sessionId": sid_k, "prompt": [
                   {"type": "text", "text": "scenario:hang"}]}})
        time.sleep(0.5)          # the prompt is really in flight (peer never answers it)
        os.kill(kpeer, _signal.SIGKILL)
        kframes = []
        kclosed = False
        for _ in range(6):
            f = grab_k(timeout=25)
            if isinstance(f, dict) and f.get("id") == "TIMEOUT":
                continue
            if isinstance(f, dict) and str(f.get("id", "")).startswith("('CLOSED'"):
                kclosed = True
                break
            kframes.append(f)
        check("SIGKILL of the owned Agent closes the relay (no silent half-open channel)",
              kclosed, kframes)
        fab = [f for f in kframes if f.get("id") == 7 and "result" in f]
        check("the in-flight prompt is never answered as success after an external kill",
              not fab, fab)
        krun = wire("executions.get", {"requestId": "selfcheck-run-kill",
                                       "executionId": ook["executionId"]})["result"]
        check("an externally killed run ends as interrupted with a real reason",
              krun.get("state") == "interrupted" and krun.get("endReason"), krun)
    finally:
        cmk.__exit__(None, None, None)

    # -- unknown ids are answered honestly, never with a fabricated record -----
    unk = wire("acp.channel.release", {"connectionId": "conn_does-not-exist"})
    check("release of an unknown connectionId is an honest error, not a fake ack",
          "error" in unk, unk)
    unkr = wire("executions.get", {"requestId": "selfcheck-run-6",
                                   "executionId": "turn_does-not-exist"})
    check("executions.get for a never-existing id is an honest error",
          "error" in unkr, unkr)

time.sleep(0.5)  # lifespan has run runtime.stop() -> channels.stop_all()
leaked = []
for proc in Path("/proc").glob("[0-9]*/cmdline"):
    try:
        if b"bidirectional_acp_peer" in proc.read_bytes():
            leaked.append(proc.parent.name)
    except OSError:
        pass
check("no peer process outlives the Server runtime", not leaked, leaked)

fails = [n for n, ok in checks if not ok]
print(f"SELFCHECK {'GREEN' if not fails else 'RED'}: {len(checks) - len(fails)}/{len(checks)}"
      + (f" | failed: {fails}" if fails else ""))
shutil.rmtree(tmp, ignore_errors=True)
sys.exit(1 if fails else 0)
