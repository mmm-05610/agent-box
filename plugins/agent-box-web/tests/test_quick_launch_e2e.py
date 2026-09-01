from __future__ import annotations
from dataclasses import replace
import threading
from pathlib import Path
import pytest
pytest.importorskip("playwright.sync_api")
from playwright.sync_api import expect
from agent_box.work_core.runtime import agent_box_home
from agent_box.work_core import db
from agent_box.extensions import PluginContext, PluginLoadRecord, PluginLoadReport, ResourceSelection, SelectorField
from agent_box.resource_contracts import AgentBoxProfileV1, PromptFragmentV1, WorkspaceV1
from agent_box.work_core import ExecutionStartRequest, ExecutionStartReceipt, ProviderDescriptor, Ref, RefType
from agent_box.work_core.registry import ExtensionRegistry
from agent_box.extensions.bootstrap import register_shared_runtime_contracts
from agent_box_harnesses.plugin import HarnessesPlugin
from agent_box_web.server.host import create_server
from agent_box_web.application.terminal import TerminalOpenResult

class FakeProvider:
    def __init__(self, provider_id, requirements): self.provider_id=provider_id; self.requirements=requirements
    def descriptor(self): return ProviderDescriptor(self.provider_id, self.provider_id, "test")
    def input_limits(self): return {x:(1,1) for x in self.requirements}
    def capabilities(self): return {"start":"supported", "attach":"supported", "finish":"supported"}
    def start(self, request: ExecutionStartRequest): return ExecutionStartReceipt(request.execution_id, request.dispatch_id, request.inputs_digest)

class FakeResource:
    def __init__(self, provider_id, contract_id): self.provider_id=provider_id; self.supported_contract_ids=frozenset({contract_id})
    def descriptor(self): return ProviderDescriptor(self.provider_id, self.provider_id, "test")
    def resolve(self, contract_id, ref, **kwargs): return object()
    def list_repositories(self): return ({"id":"repo-1","name":"fixture","path":"/tmp/fixture","git_root":"/tmp/fixture"},)

class Selector:
    def __init__(self, selector_id, contract_id):
        self.id=selector_id; self.contract_id=contract_id; self.title=selector_id
        self.fields=(SelectorField("repository_id", "Repository", kind="select"), SelectorField("selector", "Revision", default="HEAD")) if selector_id == "git-workspace" else (SelectorField("text", "Brief", default="fixture"),) if selector_id == "responsibility" else ()
    def choices(self, parameters):
        del parameters
        return ({"value": "repo-1", "label": "fixture"},) if self.id == "git-workspace" else ()
    def prepare(self, parameters, *, execution_id):
        native=parameters.get("profile_id") or parameters.get("selector") or parameters.get("text") or "managed"
        return ResourceSelection(self.contract_id, Ref(RefType.ARTIFACT, "fake-"+self.id, native), self.id, native)

class FakeControl:
    provider_id = "codex-interactive"
    def bind_registry(self, registry): del registry
    def attach_command(self, facts): return ("tmux", "-L", "fake", "attach", "-t", facts.execution.id)

class FakePresenter:
    def __init__(self): self.calls = []
    def open(self, argv): self.calls.append(tuple(argv)); return TerminalOpenResult("opened", "fake launcher accepted")

def test_browser_quick_launch_prepares_exact_binding(tmp_path, monkeypatch):
    monkeypatch.setenv("AGENT_BOX_HOME", str(tmp_path / "home")); db._reset_connection_for_tests()
    plugin=HarnessesPlugin(); original=plugin.build(PluginContext("1", agent_box_home(), agent_box_home()/"plugins/harnesses"))
    git=FakeResource("git-workspace", WorkspaceV1.contract_id); artifact=FakeResource("artifact-file", PromptFragmentV1.contract_id)
    execution=FakeProvider("codex-app-server", (WorkspaceV1.contract_id, PromptFragmentV1.contract_id, AgentBoxProfileV1.contract_id))
    selectors=(Selector("git-workspace", WorkspaceV1.contract_id), Selector("responsibility", PromptFragmentV1.contract_id), original.resource_selectors[0], Selector("runtime-host-local", "agent-box.runtime-host@1"), Selector("bwrap-sandbox", "agent-box.sandbox@1"), Selector("direct-stdio-session", "agent-box.terminal-session@1"), Selector("managed-tmux-session", "agent-box.terminal-session@1"))
    registration=replace(original, resource_providers=original.resource_providers+(git,artifact), execution_providers=(execution,), resource_selectors=selectors)
    registry=ExtensionRegistry(); register_shared_runtime_contracts(registry); registry.register_components(contracts=registration.contracts, resource_providers=registration.resource_providers, execution_providers=registration.execution_providers)
    report=PluginLoadReport((PluginLoadRecord("harnesses","READY",plugin.descriptor(),registration),))
    static=Path(__file__).resolve().parents[1]/"src"/"agent_box_web"/"_static"; server=create_server(port=0,static_dir=static,registry=registry,report=report); threading.Thread(target=server.serve_forever,daemon=True).start(); url=f"http://127.0.0.1:{server.server_port}"
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True); page=browser.new_page(); page.set_default_timeout(5000); page.goto(url+"#/quick-launch", wait_until="domcontentloaded"); page.wait_for_timeout(300)
            page.locator("select").nth(0).select_option("__new__"); page.get_by_label("Work objective").fill("Quick launch fixture")
            page.get_by_label("Execution responsibility").fill("Prepare exact binding")
            page.wait_for_timeout(1500)
            page.get_by_label("Repository").fill("repo-1")
            # Create the profile through the public API before choosing it.
            page.evaluate("async () => fetch('/api/v1/harnesses/codex/profiles',{method:'POST',headers:{'Content-Type':'application/json',Origin:location.origin},body:JSON.stringify({command_id:crypto.randomUUID(),name:'quick-profile',config:{model:'fixture'}})})")
            page.reload(wait_until="domcontentloaded"); page.wait_for_timeout(800); page.get_by_label("Work objective").fill("Quick launch fixture"); page.get_by_label("Execution responsibility").fill("Prepare exact binding"); page.get_by_label("Repository").fill("repo-1"); page.get_by_label("Profile").fill("quick-profile"); page.get_by_role("button", name="Prepare Binding").click()
            browser.close()
    finally:
        server.app.shutdown(); server.owner.release(); server.server_close(); db._reset_connection_for_tests()
