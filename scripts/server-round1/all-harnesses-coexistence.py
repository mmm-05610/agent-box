import sys, json, time, shutil, importlib
from pathlib import Path
sys.path.insert(0, "scripts/server-round1")
import importlib.util
spec = importlib.util.spec_from_file_location("gate", "scripts/server-round1/native-home-gate.py")
gate = importlib.util.module_from_spec(spec); spec.loader.exec_module(gate)
import agent_box.server.bootstrap.runtime as runtime_module
original_file = runtime_module._sidecar_deployment_file
runtime_module._sidecar_deployment_file = original_file

install = json.load(open("/home/maoqh/.agentbox-all-harnesses/install-set.json"))
mount_bindings = dict(install["mountBindings"])

from agent_box.server.bootstrap import build_runtime_from_sidecar_deployment
from agent_box.server.transport.http import create_app
wire_post = None
def wire_post(client, token, method, params):
    response = client.post(f"/wire/v1/{method}", headers={
        "Authorization": f"Bearer {token}"},
        json={"jsonrpc": "2.0", "id": method, "method": method, "params": params})
    body = response.json()
    if "error" in body:
        raise RuntimeError(f"{method}: " + json.dumps(body["error"]))
    return body["result"]
from fastapi.testclient import TestClient

root = Path("/tmp/nh-coexist-run1")
shutil.rmtree(root, ignore_errors=True); root.mkdir(parents=True)
(root/"project").mkdir()
doc = root / "deployment.json"
doc.write_bytes(Path("/home/maoqh/.agentbox-all-harnesses/deployment.json").read_bytes())
(root / "project").mkdir(exist_ok=True)
rt = build_runtime_from_sidecar_deployment(
    root/"server", doc, plugin_root=gate.PLUGIN,
    mount_bindings={k: v for k, v in install["mountBindings"].items()})
FAMILIES = ["codex", "claude-code", "opencode", "hermes", "dsh", "qwen", "kilo", "pi"]
with TestClient(create_app(rt), base_url="http://127.0.0.1") as client:
    H = {"Authorization": f"Bearer {rt.token}"}
    hello = wire_post(client, rt.token, "server.hello",
                          {"clientVersions": ["wire/1"], "clientPresentationSupports": []})
    print("hello ok, protocol:", hello["protocolVersion"])
    install = json.load(open("/home/maoqh/.agentbox-all-harnesses/install-set.json"))
    sys.path.insert(0, "plugins/agent-box-harness/src")
    mods = {f: importlib.import_module(f"agent_box_harnesses.{m}.production")
            for f, m in (("codex", "codex"), ("claude-code", "claude"),
                         ("opencode", "opencode"), ("hermes", "hermes"),
                         ("dsh", "dsh"), ("qwen", "qwen"), ("kilo", "kilo"), ("pi", "pi"))}
    evidence = {"hello": hello["protocolVersion"], "families": {}}
    for family in FAMILIES:
        opened = wire_post(client, rt.token, "workspaces.open", {
            "requestId": f"open-{family}-x1", "path": str(root / "project"),
            "environment": {"kind": "local", "host": None, "user": None}})
        prof = client.post("/api/v1/profiles", headers={
            **H, "Idempotency-Key": f"prof-{family}"},
            json={"name": f"role-{family}", "harness_type": family,
                  "configuration": {}, "credential_id": None})
        module = mods[family]
        provider_id = getattr(module, "PROVIDER_ID",
                              getattr(module, "PI_PROVIDER",
                                      getattr(module, "OPENCODE_PROVIDER",
                                              getattr(module, "KILO_PROVIDER",
                                                      getattr(module, "HERMES_PROVIDER", family)))))
        model_id = module.PRODUCT_MODEL_ID
        pm = wire_post(client, rt.token, "providerModels.create", {
            "requestId": f"pm-{family}-xxxx", "displayName": f"{family} DeepSeek",
            "harness": family, "provider": provider_id, "credentialId": None,
            "configuration": [], "models": [{
                "modelId": model_id, "displayName": "DeepSeek Flash",
                "availability": "available", "unavailableReason": None,
            }],
        })["providerModel"]
        roles = client.post("/api/v1/profiles", headers={
            **H, "Idempotency-Key": f"prof2-{family}"},
            json={"name": f"role2-{family}", "harness_type": family,
                  "configuration": {}, "credential_id": None})
        evidence["families"][family] = {
            "workspaceOpened": True,
            "profileCreated": prof.status_code,
            "providerModelId": pm["id"],
            "secondRoleCreated": roles.status_code,
        }
        print(family, "profile:", prof.status_code, "providerModel:", pm["id"])
    (root / "coexistence-evidence.json").write_text(json.dumps(evidence, indent=1))
    print("EVIDENCE WRITTEN")
rt.stop()
