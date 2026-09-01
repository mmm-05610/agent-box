from __future__ import annotations
import json, os, stat, time
from pathlib import Path
from agent_box.work_core.runtime import agent_box_home
from agent_box_web.application.facade import HostApplication
from agent_box.extensions import PluginContext, PluginLoadRecord, PluginLoadReport
from agent_box.extensions.bootstrap import register_shared_runtime_contracts
from agent_box.resource_contracts import AgentBoxProfileV1, PromptFragmentV1, WorkspaceV1
from agent_box.work_core import Ref, RefType, ProviderDescriptor
from agent_box_harnesses.codex.contracts import CodexContinuationV1
from agent_box_harnesses.codex.launch import CodexLaunchAdapter
from agent_box_harnesses.plugin import HarnessesPlugin
from agent_box_runtime_local.plugin import LocalRuntimeHostPlugin
from agent_box_sandbox_bwrap.plugin import BwrapSandboxPlugin
from agent_box_terminal_session.plugin import TerminalSessionPlugin

def _fake_server(path: Path):
    path.write_text('''#!/usr/bin/python3
import json,sys,os
thread="fake-thread"
for line in sys.stdin:
 m=json.loads(line); method=m.get("method"); ident=m.get("id")
 try:
  open(os.path.join(os.environ["CODEX_HOME"],"protocol.log"),"a").write(json.dumps(m,sort_keys=True)+"\\n")
 except Exception: pass
 if method=="initialize": out={"jsonrpc":"2.0","id":ident,"result":{"protocolVersion":1}}
 elif method=="thread/start": out={"jsonrpc":"2.0","id":ident,"result":{"thread":{"id":thread}}}
 elif method=="thread/resume": out={"jsonrpc":"2.0","id":ident,"result":{"thread":{"id":thread}}}
 elif method=="turn/start":
  turn="fake-turn"; out={"jsonrpc":"2.0","id":ident,"result":{"turn":{"id":turn}}}
  print(json.dumps(out),flush=True)
  print(json.dumps({"jsonrpc":"2.0","method":"turn/completed","params":{"turn":{"id":turn,"status":"completed"}}}),flush=True)
  continue
 elif method is None: continue
 else: out={"jsonrpc":"2.0","id":ident,"result":{}}
 print(json.dumps(out),flush=True)
''',encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)

class WorkspaceProvider:
    provider_id="test-workspace"
    supported_contract_ids=frozenset({WorkspaceV1.contract_id})
    def descriptor(self): return ProviderDescriptor(self.provider_id,"Test workspace","1")
    def resolve(self,contract_id,ref,context=None): return WorkspaceV1(Path(ref.uri.removeprefix("file://")),"test")

class PromptProvider:
    provider_id="test-prompt"
    supported_contract_ids=frozenset({PromptFragmentV1.contract_id})
    def descriptor(self): return ProviderDescriptor(self.provider_id,"Test prompt","1")
    def resolve(self,contract_id,ref,context=None): return PromptFragmentV1("test","fake protocol responsibility","sha256:test")

class ContinuationProvider:
    provider_id="test-continuation"
    supported_contract_ids=frozenset({CodexContinuationV1.contract_id})
    def descriptor(self): return ProviderDescriptor(self.provider_id,"Test continuation","1")
    def resolve(self,contract_id,ref,context=None): return CodexContinuationV1(ref.native_id)

def test_official_codex_provider_consumes_projection_and_finishes(tmp_path, monkeypatch):
    monkeypatch.setenv("AGENT_BOX_HOME",str(tmp_path/"home")); workspace=tmp_path/"workspace"; workspace.mkdir(); fake=workspace/"codex-fake"; _fake_server(fake)
    plugin=HarnessesPlugin(); ctx=PluginContext("1",agent_box_home(),agent_box_home()/"plugins/harnesses")
    registration=plugin.build(ctx); provider=registration.execution_providers[0]; manager=registration.harness_managers[0]
    auth=tmp_path/"user/.codex/auth.json"; auth.parent.mkdir(parents=True); auth.write_text("SECRET_AUTH_MUST_NOT_LEAK")
    manager.credentials.home=tmp_path/"user"
    provider._launch_adapter=CodexLaunchAdapter(manager.provider.projection,binary=str(fake),allow_non_native_for_tests=True)
    runtime_regs=[]
    for runtime_plugin, name in ((LocalRuntimeHostPlugin(), "runtime-local"), (BwrapSandboxPlugin(), "sandbox-bwrap"), (TerminalSessionPlugin(), "terminal-session")):
        runtime_ctx=PluginContext("1", agent_box_home(), agent_box_home()/"plugins"/name); runtime_ctx.plugin_data_dir.mkdir(parents=True, exist_ok=True)
        runtime_regs.append((name, runtime_plugin, runtime_plugin.build(runtime_ctx)))
    registry=__import__("agent_box.work_core.registry",fromlist=["ExtensionRegistry"]).ExtensionRegistry()
    register_shared_runtime_contracts(registry)
    registry.register_components(contracts=registration.contracts,resource_providers=registration.resource_providers,execution_providers=registration.execution_providers)
    for _, _, runtime_registration in runtime_regs:
        registry.register_components(contracts=runtime_registration.contracts,resource_providers=runtime_registration.resource_providers)
    registry.register_resource_provider(WorkspaceProvider()); registry.register_resource_provider(PromptProvider()); registry.register_resource_provider(ContinuationProvider())
    report=PluginLoadReport((PluginLoadRecord("harnesses","READY",plugin.descriptor(),registration), *tuple(PluginLoadRecord(n,"READY",p.descriptor(),r) for n,p,r in runtime_regs)))
    app=HostApplication(registry,report,home=agent_box_home())
    try:
        p1=manager.create({"profile_id":"wired","name":"Wired","config":{"model":"gpt-5.6-sol","environment":{"SAFE_RUNTIME":"yes"}},"credential_source_ref":{"provider":"codex","native_locator":"codex-login/default"}})
        p2=manager.update("wired",{"name":"Wired","config":{"model":"gpt-5.6-sol"},"credential_source_ref":{"provider":"codex","native_locator":"codex-login/default"}},1)
        pref=manager.provider.make_ref("wired",2)
        wid=app.create_work("w","wire Codex")["work"]["id"]; eid=app.create_execution("e",wid,provider.provider_id,"run wired Codex")["execution"]["id"]
        slots=[
          {"slot_id":"w","contract_id":WorkspaceV1.contract_id,"ref":{"type":"WorkspaceRef","provider":"test-workspace","native_id":"w","uri":workspace.as_uri(),"metadata":{}},"requested_summary":"workspace","exact_summary":"workspace"},
          {"slot_id":"p","contract_id":PromptFragmentV1.contract_id,"ref":{"type":"ArtifactRef","provider":"test-prompt","native_id":"p","metadata":{}},"requested_summary":"prompt","exact_summary":"prompt"},
          {"slot_id":"profile","contract_id":AgentBoxProfileV1.contract_id,"ref":{"type":"ArtifactRef","provider":pref.provider,"native_id":pref.native_id,"metadata":dict(pref.metadata)},"requested_summary":"wired revision 2","exact_summary":"wired revision 2"},
          {"slot_id":"runtime-host","contract_id":"agent-box.runtime-host@1","ref":{"type":"ArtifactRef","provider":"runtime-host-local","native_id":registry.get_resource_provider("runtime-host-local").make_ref().native_id,"metadata":dict(registry.get_resource_provider("runtime-host-local").make_ref().metadata)},"requested_summary":"native Linux host","exact_summary":"native Linux host"},
          {"slot_id":"sandbox","contract_id":"agent-box.sandbox@1","ref":{"type":"ArtifactRef","provider":"bwrap-sandbox","native_id":"bwrap-cloud-harness","metadata":dict(registry.get_resource_provider("bwrap-sandbox").make_ref("bwrap-cloud-harness", host_affinity=registry.get_resource_provider("runtime-host-local").make_ref().metadata["affinity"]).metadata)},"requested_summary":"bwrap cloud harness","exact_summary":"bwrap cloud harness"},
          {"slot_id":"terminal","contract_id":"agent-box.terminal-session@1","ref":{"type":"ArtifactRef","provider":"direct-stdio","native_id":"direct-stdio","metadata":{"session_digest":registry.get_resource_provider("direct-stdio").make_ref(host_affinity=registry.get_resource_provider("runtime-host-local").make_ref().metadata["affinity"]).session_digest,"affinity":registry.get_resource_provider("runtime-host-local").make_ref().metadata["affinity"]}},"requested_summary":"direct stdio","exact_summary":"direct stdio"},
        ]
        draft=app.get_draft(eid); draft["slots"]=slots; app._save(draft)
        receipt=app.freeze("freeze",eid,0); assert receipt["state"]=="accepted"
        projection=manager.provider.projection.root/eid
        assert (projection/"config.toml").read_text().find("gpt-5.6-sol") >= 0
        manifest=(projection/"manifest.json").read_text()
        assert "codex-login/default" in manifest and "SECRET_AUTH_MUST_NOT_LEAK" not in manifest
        assert not (projection/"auth.json").exists()
        assert "SECRET_AUTH_MUST_NOT_LEAK" not in manifest
        # CODEX_HOME is intentionally mapped into the writable workspace guest
        # mount by the production composition adapter; protocol diagnostics are
        # therefore emitted beside the offline executable, not in the host
        # projection directory.
        observed=app.observe("observe",eid); assert observed["phase"]=="active"
        time.sleep(.1); assert app.get_execution(eid)["phase"]=="active"
        operation=app.finish("finish",eid); deadline=time.time()+5
        while time.time()<deadline:
            operation=app.get_operation(operation["operation_id"])
            if operation["status"]=="succeeded": break
            time.sleep(.05)
        assert operation["status"]=="succeeded" and app.get_execution(eid)["phase"]=="terminal"
        assert not (projection/"auth.json").exists() and auth.exists()
        assert app.repo.list_refs(eid, __import__("agent_box.work_core.repository",fromlist=["RefRelation"]).RefRelation.OUTPUT)
        # A continuation is a new Core Execution and a new projection; the
        # provider receives the exact native thread identity via resume.
        first_handle=provider.get_handle(receipt["dispatch_id"])
        wid2=wid; eid2=app.create_execution("e2",wid2,provider.provider_id,"resume wired Codex")["execution"]["id"]
        continuation=CodexContinuationV1(first_handle.thread_id)
        slots2=[*slots,{"slot_id":"continuation","contract_id":continuation.contract_id,"ref":{"type":"SessionRef","provider":"test-continuation","native_id":continuation.thread_id,"metadata":{}},"requested_summary":"resume","exact_summary":"resume"}]
        draft2=app.get_draft(eid2); draft2["slots"]=slots2; app._save(draft2)
        receipt2=app.freeze("freeze2",eid2,0); assert receipt2["state"]=="accepted" and eid2 != eid
        assert (manager.provider.projection.root/eid2) != projection
        assert app.get_execution(eid)["phase"]=="terminal"
    finally: app.shutdown()
