#!/usr/bin/env python3
"""Order 089 的门机械预演（假端点，真实模型调用 0）——**这不是 089 的真门证据**。

089 要的是"真 Electron → Windows Server → Worker → bwrap → 该家 harness → 真 DeepSeek"，
那条腿已按用户裁定交回调度者派 QA/人执行
（照抄件：`docs/server-round1/fullstack/ui-gates-89-windows-handoff.md`）。
这份预演只做一件事：**在真跑之前**把门本身的三件事钉住——

1. **正向形状**：一家一个 seat（`pi`、`codex` 两个座位都跑），从 wire 发一句、拿到 assistant 增量、
   走到 `completed`，并按 089 的记账形状写一份报告（`realModelRequests: 0` 明写在这）。
2. **"无环境 ⇒ 派发前类型化拒绝"的反例**（089 的 `§Requirements` 第二条 + `R-0032 ⑤`）：
   给一个**没有 seat** 的 harness 发一句，断言拿到的是**类型化**错误、**没有产生任何 execution**，
   而不是"发出去以后在执行段崩"——那正是试用轮 `T6-1`/`T6-2` 的形状。
3. **出站合同形状**（`115` 的闭合在这条链上的实效）：三种坏输入（族位误用的同形请求、未知方法、
   缺参数）都必须回 JSON-RPC 错误对象，**没有一条是裸 500**。

外加把 `117` 的 `sendability` 在同一次装配里读一遍——这样 QA 拿到的不只是"命令能抄"，
还有"这台装配上它确实回了我该看的键"。

用法：
    PYTHONPATH=src:plugins/... python3 scripts/server-round1/ui_gates_89_fake_rehearsal.py [--report PATH]
退出码 0 = 三件事全过；任何一条不满足 ⇒ 非零并把失败项打出来。
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import sys
import tempfile
import time

REPO = Path(__file__).resolve().parents[2]
PLUGIN = REPO / "plugins" / "agent-box-harnesses"
ECHO_PEER = PLUGIN / "tests" / "harness_remote" / "fake_acp_peer.mjs"
DEFAULT_REPORT = REPO / "docs/server-round1/fullstack/ui-gates-89-rehearsal.json"

#: 089 修订 v2 的两家（R-0015：Stage 1 广度＝pi + codex）。
GATE_FAMILIES = ("pi", "codex")
#: 故意不给座位的一家：正例的反面必须**在派发之前**被拒。
SEATLESS_FAMILY = "qwen"

DEPLOYMENT = {
    "schemaVersion": 1,
    "harnesses": [
        {
            "id": family,
            "capabilityClaims": {"stream": True},
            # The echo peer answers from its own script: no upstream, no key, no bytes spent.
            "adapter": {"command": "/usr/bin/node", "args": [],
                        "source": "tests/harness_remote/fake_acp_peer.mjs"},
            "timeoutMs": 60_000,
        }
        for family in GATE_FAMILIES
    ],
}

PROMPT = "Reply with exactly: AGENTBOX-89-REHEARSAL"
FAILURES: list[str] = []
REPORT: dict = {"order": "089", "kind": "REHEARSAL_FAKE_ENDPOINT", "realModelRequests": 0,
                "notAcceptanceEvidence": "089 的真门证据只在 ui-gates-89/ 里；这份是门机械的预演"}


def check(name: str, ok: bool, detail: dict | str) -> None:
    REPORT["checks"] = REPORT.get("checks", {})
    REPORT["checks"][name] = {"pass": bool(ok), "detail": detail}
    if not ok:
        FAILURES.append(f"{name}: {json.dumps(detail, default=str)[:400]}")


def wire(client, token: str, method: str, params: dict):
    """Returns (status_code, parsed_body_or_text) — deliberately does not fail the run."""
    response = client.post(f"/wire/v1/{method}", headers={"Authorization": f"Bearer {token}"},
                           json={"jsonrpc": "2.0", "id": method, "method": method, "params": params})
    try:
        return response.status_code, response.json()
    except ValueError:
        return response.status_code, response.text


def wait_for_state(repository, session_id: str, index: int, states: set[str], timeout: float = 60.0):
    deadline = time.monotonic() + timeout
    session = None
    while time.monotonic() < deadline:
        session = repository.get_session(session_id)
        if len(session["turns"]) > index and session["turns"][index]["state"] in states:
            return session
        time.sleep(0.05)
    return session


def _body(response):
    try:
        return response.json()
    except ValueError:
        return {"raw": response.text[:200]}


def _turn_count(runtime) -> int:
    """Every accepted send creates a turn; 'refused before dispatch' means the count did not move."""
    with runtime.repository.database.read() as conn:
        return int(conn.execute("SELECT COUNT(*) FROM server_turns").fetchone()[0])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    options = parser.parse_args()

    from agent_box.server.bootstrap import build_runtime_from_sidecar_deployment
    from agent_box.server.transport.http import create_app
    from fastapi.testclient import TestClient

    import agent_box.server.bootstrap.runtime as runtime_module
    original_file = runtime_module._sidecar_deployment_file

    def deployment_file(root, relative):
        if relative.endswith("fake_acp_peer.mjs"):
            return ECHO_PEER.read_bytes()
        return original_file(root, relative)

    temporary = Path(tempfile.mkdtemp(prefix="agentbox-89-rehearsal-"))
    document = temporary / "deployment.json"
    document.write_text(json.dumps(DEPLOYMENT, sort_keys=True, indent=1), encoding="utf-8")
    data_root = temporary / "server"
    workspace = temporary / "project"
    workspace.mkdir()
    runtime_module._sidecar_deployment_file = deployment_file
    runtime = build_runtime_from_sidecar_deployment(data_root, document, plugin_root=PLUGIN)
    token = runtime.token

    try:
        with TestClient(create_app(runtime), base_url="http://127.0.0.1",
                        raise_server_exceptions=False) as client:
            _status, opened = wire(client, token, "workspaces.open", {
                "requestId": "rehearsal-open", "path": str(workspace),
                "environment": {"kind": "local", "host": None, "user": None},
            })
            workspace_id = opened["result"]["workspace"]["id"]

            # -- 1: each of the two Stage-1 families answers over the real wire --
            for family in GATE_FAMILIES:
                profile_response = client.post(
                    "/api/v1/profiles", headers={"Authorization": f"Bearer {token}",
                                                 "Idempotency-Key": f"rehearsal-{family}"},
                    json={"name": f"rehearsal-{family}", "harness_type": family,
                          "configuration": {}, "credential_id": None})
                if profile_response.status_code != 201:
                    check(f"roundtrip:{family}", False, {"profileCreate": profile_response.text[:200]})
                    continue
                profile_id = profile_response.json()["profile_id"]
                _s, sent = wire(client, token, "sessions.createAndSend", {
                    "requestId": f"rehearsal-send-{family}", "workspaceId": workspace_id,
                    "profileId": profile_id, "overrides": [],
                    "message": {"text": PROMPT, "attachments": []},
                })
                if "result" not in sent:
                    check(f"roundtrip:{family}", False, {"send": sent})
                    continue
                session_id = sent["result"]["session"]["id"]
                execution_id = sent["result"]["executionId"]
                session = wait_for_state(runtime.repository, session_id, 0,
                                         {"completed", "failed", "cancelled"})
                turn = session["turns"][0] if session["turns"] else {}
                deltas = [item["data"].get("text", "") for item in session["events"]
                          if item["kind"] == "message.delta" and item.get("turn_id") == execution_id]
                assistant = "".join(text for text in deltas if text)
                check(f"roundtrip:{family}",
                      turn.get("state") == "completed" and bool(assistant.strip()),
                      {"turnState": turn.get("state"), "errorCode": turn.get("error_code"),
                       "assistantChars": len(assistant), "assistantPrefix": assistant[:60],
                       "realModelRequests": 0})

            # -- 2: no seat for this family => typed refusal, and nothing dispatched --
            # This is the shape T6-1/T6-2 wore in the field: a message that looks accepted and
            # only dies later, inside execution. The refusal has to be typed AND earlier than
            # any turn exists, so a missing environment cannot cost the user a request.
            from agent_box.server.wire.errors import FAMILIES as WIRE_FAMILIES
            before = _turn_count(runtime)
            seatless_profile_response = client.post(
                "/api/v1/profiles", headers={"Authorization": f"Bearer {token}",
                                             "Idempotency-Key": "rehearsal-seatless"},
                json={"name": f"rehearsal-{SEATLESS_FAMILY}", "harness_type": SEATLESS_FAMILY,
                      "configuration": {}, "credential_id": None})
            seatless_body = _body(seatless_profile_response)
            early_error = seatless_body.get("error") if isinstance(seatless_body, dict) else None
            # The REST face nests it: {"error": {"code": …}} — the first draft compared the
            # dict to a string and the gate went red for the right reason (it does bite).
            refused_early = (seatless_profile_response.status_code >= 400
                             and isinstance(early_error, dict)
                             and early_error.get("code") == "HARNESS_UNAVAILABLE")
            _s, refused_send = wire(client, token, "sessions.createAndSend", {
                "requestId": "rehearsal-seatless-send", "workspaceId": workspace_id,
                "profileId": f"absent-{SEATLESS_FAMILY}", "overrides": [],
                "message": {"text": PROMPT, "attachments": []},
            })
            error = refused_send.get("error") if isinstance(refused_send, dict) else None
            after = _turn_count(runtime)
            check("seatless_refused_typed_before_dispatch",
                  refused_early and bool(error) and error.get("code") in WIRE_FAMILIES
                  and after == before,
                  {"profileCreateStatus": seatless_profile_response.status_code,
                   "profileCreateError": early_error,
                   "sendError": error, "turnsBefore": before, "turnsAfter": after,
                   "note": "两处都要成立：装配里没有这个座位 ⇒ 建档即类型化拒；"
                           "并且**一条 turn 都没被创建**（缺环境不能花掉用户一次请求）"})

            # -- 3: nothing on this face may leave as a bare 500 (order 115) --
            probes = {
                "unknown.method": {"requestId": "rehearsal-unknown"},
                "profiles.list": {"includeArchived": "not-a-bool"},
                "sessions.createAndSend": {"requestId": "x"},
            }
            shapes = {}
            for method, params in probes.items():
                status, body = wire(client, token, method, params)
                typed = isinstance(body, dict) and ("error" in body or "result" in body)
                shapes[method] = {"status": status, "jsonRpcEnvelope": typed}
                check(f"no_bare_500:{method}", status != 500 and typed, shapes[method])

            # -- 4: order 117's face is present on a real composition --
            _s, listing = wire(client, token, "profiles.list", {"includeArchived": True})
            items = (listing.get("result") or {}).get("items") or []
            carries = [item for item in items
                       if "sendability" in item and "recoveryPending" in item]
            states = {item["id"]: (item["sendability"]["state"], item["sendability"]["reason"])
                      for item in carries}
            check("profiles_list_carries_sendability",
                  bool(items) and len(carries) == len(items),
                  {"profiles": len(items), "states": list(states.values())[:5]})
    finally:
        runtime.stop()
        shutil.rmtree(temporary, ignore_errors=True)
        REPORT["cleanup"] = {"temporaryRootRemoved": not temporary.exists()}

    REPORT["result"] = "REHEARSAL_OK" if not FAILURES else "REHEARSAL_FAILED"
    REPORT["failures"] = FAILURES
    options.report.parent.mkdir(parents=True, exist_ok=True)
    options.report.write_text(json.dumps(REPORT, indent=1, sort_keys=True), encoding="utf-8")
    print(json.dumps({"result": REPORT["result"], "failures": FAILURES,
                      "report": str(options.report)}, indent=1))
    return 0 if not FAILURES else 1


if __name__ == "__main__":
    sys.exit(main())
