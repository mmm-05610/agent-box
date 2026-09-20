"""Work Order 148 - the two injections, run against a real service over real HTTP.

Nothing here edits `src/**`: the order forbids it and the verdict depends on the
code being untouched. Case B reaches the same pre-`try` region through ordinary
client input; case A reaches it by removing content from the data root, which is
the "injection/corruption" face the reviewer left open.

Writes the observable verdict for each case: did the turn get a 202 receipt, and
did `server_turns` reach a terminal state or stay `accepted`?

  python3 docs/server-round1/probes/sim148_dispatch_swallow_boundary.py
"""
from __future__ import annotations

import json
import os
import pathlib
import shutil
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[3]
# The verdict text is bilingual; an ascii stdout (no LANG in a tool shell) would
# die inside the reporter and print a false "unreachable".
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # noqa: BLE001 - only if the stream cannot be reconfigured
    pass
sys.path.insert(0, str(ROOT / "src"))
for _plugin in ("agent-box-harnesses", "agent-box-runtime-wsl", "agent-box-runtime-local",
                "agent-box-sandbox-bwrap", "agent-box-skills", "agent-box-terminal-session"):
    sys.path.insert(0, str(ROOT / "plugins" / _plugin / "src"))
sys.path.insert(0, str(ROOT / "tests" / "server"))

from fastapi.testclient import TestClient  # noqa: E402

from agent_box.server.bootstrap import build_runtime  # noqa: E402
from agent_box.server.execution import (  # noqa: E402
    HarnessDescriptor, HarnessRegistry, SidecarExecutionBackend,
)
from agent_box.server.execution.sidecar import (  # noqa: E402
    LocalProcessLauncher, SidecarHarnessPort,
)
from agent_box.server.transport.http import create_app  # noqa: E402
from test_harness_sidecar import (  # noqa: E402
    FAKE_PEER, PLUGIN, SIDEcar_ENTRY, _fixture_capability_material, _wire_post,
    sidecar_environment,
)


class Connector:
    def distributions(self): return [{"name": "Ubuntu"}]
    def probe(self, distribution, user):
        return {"probe_id": "probe", "distribution": distribution, "user": user}
    def browse(self, probe_id, path):
        return {"path": path, "directories": [], "files": []}
    def open_workspace(self, probe_id, path):
        return {"connection_id": "connection", "distribution": "Ubuntu",
                "user": os.environ["USER"], "path": str(path)}


def fresh_runtime(root: pathlib.Path):
    registry = HarnessRegistry()
    registry.register(HarnessDescriptor("pi", capability_claims={"stream": True}))

    def execution_factory(records, objects, approvals, notifier, _connector, _credentials,
                          _secrets):
        def port_factory(context, on_event):
            return SidecarHarnessPort(
                LocalProcessLauncher(["node", str(SIDEcar_ENTRY)], cwd=str(PLUGIN)),
                environment=sidecar_environment(root), profile=context["harness_type"],
                adapter={"command": "node", "args": [str(FAKE_PEER)]},
                state_directory=str(root / "state"), directory=str(root),
                on_event=on_event, **_fixture_capability_material(context),
            )
        return SidecarExecutionBackend(
            records, objects, approvals, port_factory=port_factory, on_event=notifier.notify,
        )

    return build_runtime(root / "server", harnesses=registry,
                         execution_factory=execution_factory, connector=Connector())


def open_workspace_and_profile(client, runtime, root, tag):
    opened = _wire_post(client, runtime.token, "workspaces.open", {
        "requestId": f"{tag}-open", "path": str(root),
        "environment": {"kind": "wsl", "host": "Ubuntu", "user": None}})["workspace"]
    profile = client.post("/api/v1/profiles", headers={
        "Authorization": f"Bearer {runtime.token}", "Idempotency-Key": f"{tag}-profile",
    }, json={"name": tag, "harness_type": "pi",
             "configuration": {"model": "initial"}, "credential_id": None}).json()
    return opened["id"], profile["profile_id"]


def send(client, runtime, workspace_id, profile_id, tag, overrides):
    return _wire_post(client, runtime.token, "sessions.createAndSend", {
        "requestId": f"{tag}-send", "workspaceId": workspace_id,
        "profileId": profile_id, "overrides": overrides,
        "message": {"text": "probe", "attachments": []}})


def turn_row(runtime, session_id):
    with runtime.repository.database.read() as conn:
        row = conn.execute(
            "SELECT id,state,error_code FROM server_turns WHERE session_id=? "
            "ORDER BY created_at LIMIT 1", (session_id,)).fetchone()
    return dict(row) if row else None


def observe(label, root, mutate=None, overrides=None, tag="case", pre_send=None):
    runtime = fresh_runtime(root)
    verdict = {}
    with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
        workspace_id, profile_id = open_workspace_and_profile(client, runtime, root, tag)
        if pre_send is not None:
            verdict["injection"] = pre_send(runtime, client, tag)
        accepted = send(client, runtime, workspace_id, profile_id, tag, overrides or [])
        session_id = accepted["session"]["id"]
        first = turn_row(runtime, session_id) or {}
        turn_id = first.get("id")
        verdict["http"] = "202 receipt" if session_id else str(accepted)[:120]
        verdict["turn_id_found"] = bool(turn_id)
        # The dispatch runs on its own thread the moment the receipt is issued, so
        # record the state *before* mutating: if it already left `accepted`, the
        # injection landed too late to answer the question and must be retried.
        verdict["state_before_injection"] = (turn_row(runtime, session_id) or {}).get("state")
        if mutate is not None:
            verdict["injection"] = mutate(runtime, turn_id, session_id)
        deadline = time.monotonic() + 12
        row = turn_row(runtime, session_id)
        while time.monotonic() < deadline and row and row["state"] == "accepted":
            time.sleep(0.2)
            row = turn_row(runtime, session_id)
        verdict["turn"] = row
    print(f"\n--- {label}")
    print(json.dumps(verdict, ensure_ascii=False, indent=2, default=str))
    return verdict


def case_b_natural_input(root):
    """Ordinary client input: an override object without `value`.

    `_override_mapping` (handlers.py:1915-1919) runs inside the try that `_dispatch`
    swallows, so if the wire layer lets this through, accept() never even starts.
    """
    return observe("B 自然输入：overrides=[{controlId}] （无 value）", root,
                   overrides=[{"controlId": "model"}], tag="caseb")


def case_a_missing_object(root):
    """Injection face: the turn's stored input object is removed after the receipt.

    Data-level only (`ObjectStore.path_for` + unlink), because the order forbids
    touching `src/**`; `accept()` re-reads that object before its `try`.
    """
    def mutate(runtime, turn_id, session_id):
        digest = runtime.repository.get_turn_context(turn_id)["input_object_digest"]
        path = runtime.objects.path_for(digest)
        path.unlink(missing_ok=True)
        return {"digest": digest, "removed": str(path), "still_there": path.exists()}
    return observe("A 注入：input 对象在回执后被移除", root, mutate=mutate, tag="casea")


def case_a2_config_object_before_send(root):
    """The same corruption, timed so the throw must land inside `accept()`.

    `accept()` is the only reader of the Profile's config object
    (`sidecar_backend.py:214`), and it runs after the 202 receipt is issued, so
    removing that object before the send puts the failure precisely in the
    pre-`try` window this order is about.
    """
    def before(runtime, client, tag):
        profiles_root = runtime.objects.root
        removed = []
        for candidate in profiles_root.glob("*/*"):
            try:
                text = candidate.read_text(encoding="utf-8")
            except OSError:
                continue
            if '"configuration"' in text and '"initial"' in text:
                candidate.unlink()
                removed.append(candidate.name)
        return {"removed_config_objects": len(removed)}
    return observe("A2 注入：发送前移除 Profile 的 config 对象（accept() 是唯一读者）",
                   root, tag="casea2", pre_send=before)


def main():
    base = pathlib.Path("/tmp/agentbox-148")
    shutil.rmtree(base, ignore_errors=True)
    results = {}
    for name, runner in (("B", case_b_natural_input), ("A", case_a_missing_object),
                         ("A2", case_a2_config_object_before_send)):
        root = base / name
        root.mkdir(parents=True)
        try:
            results[name] = runner(root)
        except Exception as exc:  # noqa: BLE001 - a refusal is itself a verdict here
            print(f"\n--- {name}: 请求在到达 accept() 之前被拒：{type(exc).__name__}: "
                  f"{str(exc)[:240]}")
            results[name] = {"raised": type(exc).__name__, "detail": str(exc)[:240]}
    print("\n=== 定档 ===")
    for name, verdict in results.items():
        turn = verdict.get("turn") if isinstance(verdict, dict) else None
        if verdict.get("raised"):
            print(f"{name}: 未到达吞异常点（被上游拒绝）=> 该路径**不可达**")
        elif turn and turn["state"] == "accepted":
            print(f"{name}: 轮停在 accepted、无终态事实 => **可达**（AUD-B-043 成立）")
        elif turn and turn["state"] in {"failed", "unknown", "cancelled", "completed"}:
            print(f"{name}: 轮进终态 {turn['state']} => 机制未致静默")
        else:
            print(f"{name}: 该轮仍在飞（{(turn or {}).get('state')}）"
                  f"⇒ 窗口未命中，本条不作结论")


if __name__ == "__main__":
    main()
