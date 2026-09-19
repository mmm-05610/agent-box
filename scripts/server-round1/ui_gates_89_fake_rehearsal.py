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

**第 5 段（本轮补）**：让 `ui_gates_89_seed_profile.py` 真的造出 profile（凭据按路径导入 ＋ 每家一条
Provider 记录 ＋ model 控件绑定），然后**用它发一句**——`sendability:"ready"` 是投影的意见，
"发得出去并拿到回答"才是 089 要的事实。座位是假的（echo peer，`fixture-model` 是它唯一认的模型）、
key 是假的 ⇒ `realModelRequests` 仍是 0。同一段里另记一条**观察**（不作断言）：
Provider 记录发布了、但**座位不认**的模型会怎样——那条路今天只剩一个裸 `EXECUTION_FAILED`。

用法：
    PYTHONPATH=src:plugins/... python3 scripts/server-round1/ui_gates_89_fake_rehearsal.py [--report PATH]
退出码 0 = 三件事全过；任何一条不满足 ⇒ 非零并把失败项打出来。
"""
from __future__ import annotations

import argparse
import json
import os
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


#: A deployment whose seats are production-shaped: the model control resolves through the
#: Provider/Model directory (`controlOptions.model == ()`) and the seat accepts a credential
#: kind. This is what the seeded Profile binds to - the plain seats above answer `configuration: {}`.
SEED_DEPLOYMENT = json.loads(json.dumps(DEPLOYMENT))
for _seat in SEED_DEPLOYMENT["harnesses"]:
    _seat["modelControlId"] = "model"
    _seat["credentialKind"] = "api-key"
    _seat["controlOptions"] = {"model": []}


def _load(name: str):
    import importlib.util

    path = REPO / "scripts/server-round1" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def seed_leg(temporary: Path) -> None:
    """Stage 5: a Profile built by the **seed script** must actually take a message.

    Why this exists: `sendability.state == "ready"` is a projection's opinion. The fact 089 needs
    is that a seeded Profile - credential imported by path, Provider record per family, model
    control bound to `{providerId, modelId}` - sends and answers. If the only thing standing
    between QA and that answer is a shape nobody rehearsed, the real machine is where it will surface.
    Fake seat, fake key: `realModelRequests` stays 0.
    """
    from agent_box.server.bootstrap import build_runtime_from_sidecar_deployment
    from agent_box.server.transport.http import create_app
    from agent_box.storage import MemorySecretStore
    from fastapi.testclient import TestClient

    seed89 = _load("ui_gates_89_seed_profile")
    shape = _load("ui_gates_89_seed_shape_check")

    root = temporary / "seed-leg"
    root.mkdir(parents=True)
    document = root / "deployment.json"
    document.write_text(json.dumps(SEED_DEPLOYMENT, sort_keys=True, indent=1), encoding="utf-8")
    data_root = root / "server"
    workspace = root / "project"
    workspace.mkdir()
    key_file = root / "fake-key.txt"
    key_file.write_text("fake-loopback-value-not-a-secret", encoding="utf-8")
    os.chmod(key_file, 0o600)
    state_file = root / "seed-state.json"

    runtime = build_runtime_from_sidecar_deployment(data_root, document,
                                                   secret_store=MemorySecretStore({}),
                                                   plugin_root=PLUGIN)
    section: dict = {"families": {}, "counterExamples": {}}
    REPORT["seedLeg"] = section
    try:
        with TestClient(create_app(runtime), base_url="http://127.0.0.1",
                        raise_server_exceptions=False) as client:
            token_file = data_root / "secrets" / "http-token"
            check("seed_leg_composes_a_secret_store_and_a_token_file",
                  token_file.is_file(), {"expected": "secrets/http-token"})
            face = shape.TestClientFace(client, runtime.token)
            code = seed89.main(["--base-url", "http://127.0.0.1:18820",
                                "--token-file", str(token_file), "--key-file", str(key_file),
                                "--label", "rehearsal-seed",
                                *[item for family in GATE_FAMILIES
                                  for item in ("--harness", family)],
                                "--model-id", "fixture-model", "--require-ready",
                                "--state-file", str(state_file)],
                               face_factory=lambda _url, _tok: face)
            state = json.loads(state_file.read_text(encoding="utf-8")) if state_file.is_file() else {}
            verdicts = {family: (value or {}).get("state")
                        for family, value in (state.get("sendability") or {}).items()}
            check("seed_script_exits_zero_and_calls_both_ready",
                  code == 0 and set(verdicts.values()) == {"ready"} and len(verdicts) == 2,
                  {"exit": code, "verdicts": verdicts})

            _s, opened = wire(client, runtime.token, "workspaces.open", {
                "requestId": "seed-leg-open", "path": str(workspace),
                "environment": {"kind": "local", "host": None, "user": None}})
            workspace_id = opened["result"]["workspace"]["id"]

            for family, entry in (state.get("profiles") or {}).items():
                status, sent = wire(client, runtime.token, "sessions.createAndSend", {
                    "requestId": f"seed-leg-send-{family}", "workspaceId": workspace_id,
                    "profileId": entry["profileId"], "overrides": [],
                    "message": {"text": PROMPT, "attachments": []}})
                record = {"sendStatus": status}
                if "result" in sent:
                    session = wait_for_state(runtime.repository, sent["result"]["session"]["id"], 0,
                                             {"completed", "failed", "cancelled"})
                    turn = session["turns"][0] if session["turns"] else {}
                    deltas = [item["data"].get("text", "") for item in session["events"]
                              if item["kind"] == "message.delta"
                              and item.get("turn_id") == sent["result"]["executionId"]]
                    answer = "".join(text for text in deltas if text)
                    record.update({"turnState": turn.get("state"),
                                   "errorCode": turn.get("error_code"),
                                   "assistantChars": len(answer),
                                   "assistantPrefix": answer[:40]})
                else:
                    record["error"] = sent.get("error")
                section["families"][family] = record
                check(f"seeded_profile_takes_a_message:{family}",
                      record.get("turnState") == "completed"
                      and record.get("assistantChars", 0) > 0, record)

            # Counter-example: a binding to a model nobody published must be refused *before*
            # a turn exists - "ready" is not a claim we get to keep after the fact.
            before = _turn_count(runtime)
            broken = client.post("/api/v1/profiles",
                                 headers={"Authorization": f"Bearer {runtime.token}",
                                          "Idempotency-Key": "seed-leg-broken"},
                                 json={"name": "seed-leg-broken", "harness": GATE_FAMILIES[0],
                                       "configuration": {}, "credential_id": None})
            broken_id = broken.json().get("profile_id")
            version = next((item["version"] for item in
                            wire(client, runtime.token, "profiles.list",
                                 {"includeArchived": True})[1]["result"]["items"]
                            if item["id"] == broken_id), 1)
            wire(client, runtime.token, "profiles.updateConfig", {
                "requestId": "seed-leg-broken-config", "profileId": broken_id,
                "expectedVersion": version,
                "values": [{"controlId": "model",
                            "value": {"providerId": "provider_missing",
                                      "modelId": "model_missing"}}]})
            _s, refused = wire(client, runtime.token, "sessions.createAndSend", {
                "requestId": "seed-leg-broken-send", "workspaceId": workspace_id,
                "profileId": broken_id, "overrides": [],
                "message": {"text": PROMPT, "attachments": []}})
            after = _turn_count(runtime)
            error = (refused or {}).get("error") or {}
            section["counterExamples"]["unknown_model_binding"] = {
                "error": error, "turnsBefore": before, "turnsAfter": after}
            check("unknown_model_refused_before_any_turn",
                  bool(error) and after == before,
                  section["counterExamples"]["unknown_model_binding"])

            # -- an observation, deliberately NOT an assertion: a model the Provider record
            # publishes but the *seat* does not advertise (`sendability` cannot see that list -
            # it lives inside the harness). What goes on the record is which side answers: a typed
            # refusal before dispatch, or a turn that dies holding only `EXECUTION_FAILED` while
            # the seat's own `SIDECAR_OP_FAILED: Harness model is not available: <id>` survives
            # only in the log (`sidecar_backend.py:854-856` restores a code only for
            # `ExecutionStartRejected`). Whether it should surface is a ruling, not a call this
            # rehearsal gets to make - so neither branch is asserted.
            published = wire(client, runtime.token, "providerModels.create", {
                "requestId": "seed-leg-unadvertised", "displayName": "seed leg unadvertised",
                "harness": GATE_FAMILIES[0], "provider": "opaque-provider",
                "credentialId": state.get("credentialId"), "configuration": [],
                "models": [{"modelId": "not-on-this-seat", "displayName": "Not on the seat",
                            "availability": "available", "unavailableReason": None}]})
            published_id = published[1]["result"]["providerModel"]["id"]
            # Re-point the profile the seed itself built: same credential, same seat, one
            # different model id. Any other shape would measure a different path.
            stray_id = ((state.get("profiles") or {}).get(GATE_FAMILIES[0]) or {}).get("profileId")
            stray_version = next((item["version"] for item in
                                  wire(client, runtime.token, "profiles.list",
                                       {"includeArchived": True})[1]["result"]["items"]
                                  if item["id"] == stray_id), 1)
            wire(client, runtime.token, "profiles.updateConfig", {
                "requestId": "seed-leg-stray-config", "profileId": stray_id,
                "expectedVersion": stray_version,
                "values": [{"controlId": "model",
                            "value": {"providerId": published_id,
                                      "modelId": "not-on-this-seat"}}]})
            _s, stray_send = wire(client, runtime.token, "sessions.createAndSend", {
                "requestId": "seed-leg-stray-send", "workspaceId": workspace_id,
                "profileId": stray_id, "overrides": [],
                "message": {"text": PROMPT, "attachments": []}})
            outcome = {"accepted": "result" in stray_send,
                       "refusal": (stray_send or {}).get("error")}
            if "result" in stray_send:
                session = wait_for_state(runtime.repository,
                                         stray_send["result"]["session"]["id"], 0,
                                         {"completed", "failed", "cancelled"})
                turn = session["turns"][0] if session["turns"] else {}
                outcome.update({
                    "turnState": turn.get("state"), "turnCode": turn.get("error_code"),
                    "reasonFieldsOnTheTurn": sorted(k for k in turn
                                                    if "error" in k or "message" in k
                                                    or "reason" in k),
                    "dispatchIdsAssigned": [bool(turn.get("work_id")),
                                            bool(turn.get("execution_id")),
                                            bool(turn.get("dispatch_id"))],
                    "seatReason": ("SIDECAR_OP_FAILED: Harness model is not available: "
                                   "not-on-this-seat (server log only)")})
            section["seatModelAuthority"] = outcome
    finally:
        runtime.stop()
        shutil.rmtree(root, ignore_errors=True)
        section["cleanup"] = {"seedLegRootRemoved": not root.exists()}


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
        # -- 5: a Profile produced by the seed script must take a message, not just read ready --
        seed_leg(temporary)

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
