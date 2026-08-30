"""Formal browser vertical for the real Harness/Profile API with fake native start."""
from __future__ import annotations
from dataclasses import replace
import json, threading
import re
from pathlib import Path
import pytest

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import expect

from agent_box.work_core.runtime import agent_box_home
from agent_box.work_core import db
from agent_box.extensions import PluginContext, PluginLoadRecord, PluginLoadReport
from agent_box_web.server.host import create_server
from agent_box.resource_contracts import AgentBoxProfileV1
from agent_box.work_core import ExecutionStartReceipt, ExecutionStartRequest, ProviderDescriptor
from agent_box_harnesses.plugin import HarnessesPlugin

class FakeCodexProvider:
    provider_id = "codex-app-server"
    def descriptor(self): return ProviderDescriptor(self.provider_id, "Codex App Server (controlled fake)", "test")
    def capabilities(self): return {"start":"supported"}
    def input_limits(self): return {AgentBoxProfileV1.contract_id:(1,1)}
    def start(self, request: ExecutionStartRequest):
        profile=next(x.value for x in request.resolved_inputs if x.contract_id==AgentBoxProfileV1.contract_id)
        assert profile.revision == 2
        return ExecutionStartReceipt(request.execution_id, request.dispatch_id, request.inputs_digest, runtime_handle="controlled-native")


def attach_browser_diagnostics(page):
    requests, responses, console_errors, page_errors = [], [], [], []
    page.on("request", lambda r: requests.append((r.method, r.url)))
    page.on("response", lambda r: responses.append((r.request.method, r.status, r.url)))
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: page_errors.append(str(e)))
    def report():
        print({"requests": requests, "responses": responses, "url": page.url, "hash": page.url.split("#", 1)[-1], "wb_errors": page.locator(".wb-error").all_inner_texts(), "console_errors": console_errors, "page_errors": page_errors})
    return report

def test_browser_harness_profile_binding_vertical(tmp_path, monkeypatch):
    monkeypatch.setenv("AGENT_BOX_HOME", str(tmp_path / "home")); db._reset_connection_for_tests()
    home=agent_box_home(); plugin=HarnessesPlugin(); original=plugin.build(PluginContext("1",home,home/"plugins/harnesses"))
    registration=replace(original, execution_providers=(FakeCodexProvider(),))
    from agent_box.work_core.registry import ExtensionRegistry
    registry=ExtensionRegistry(); registry.register_components(contracts=registration.contracts,resource_providers=registration.resource_providers,execution_providers=registration.execution_providers)
    report=PluginLoadReport((PluginLoadRecord("harnesses","READY",plugin.descriptor(),registration),))
    server=create_server(port=0,static_dir=Path(__file__).resolve().parents[1]/"src"/"agent_box_web"/"_static",registry=registry,report=report)
    threading.Thread(target=server.serve_forever,daemon=True).start(); url=f"http://127.0.0.1:{server.server_port}"
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True); page=browser.new_page(); page.set_default_timeout(5000); report_browser=attach_browser_diagnostics(page)
            page.add_init_script("localStorage.setItem('agent-box-language','en')")
            page.goto(url+"#/harnesses",wait_until="networkidle")
            assert page.get_by_text("Codex",exact=True).count() > 0
            page.get_by_text("Codex",exact=True).click(); page.wait_for_load_state("networkidle")
            page.get_by_role("button",name="Create Profile").click()
            page.get_by_label("Profile name").fill("browser-profile")
            page.get_by_role("button",name="Create Profile",exact=True).last.click()
            expect(page).to_have_url(re.compile(r"#/harnesses/codex/profiles/browser-profile$"), timeout=5000)
            expect(page.locator(".wb-form")).to_have_count(0, timeout=5000)
            expect(page.get_by_text("Revision 1", exact=True)).to_be_visible(timeout=5000)
            page.get_by_role("button",name="Edit").click(); page.get_by_label("Profile name").fill("browser-profile")
            page.get_by_role("button",name="Save new revision").click()
            expect(page.get_by_text("Revision 2", exact=True)).to_be_visible(timeout=5000)
            page.get_by_role("button",name="Projection Preview").click(); page.wait_for_timeout(300)
            assert "Execution-scoped projection" in page.content()
            page.goto(url+"#/works",wait_until="networkidle"); page.get_by_test_id("create-work").click()
            page.get_by_placeholder("Describe the objective").fill("Harness Profile E2E")
            page.get_by_role("button",name="Create Work",exact=True).click(); page.get_by_test_id("new-execution").click()
            page.get_by_placeholder("Describe the outcome this execution owns").fill("Freeze exact Codex Profile")
            page.locator(".wb-modal select").select_option("codex-app-server"); page.get_by_role("button",name="Create draft").click(); page.wait_for_timeout(250)
            page.get_by_test_id("selector-agent-box-profile").click(); page.locator(".choice-list select").select_option("browser-profile")
            page.get_by_role("button",name="Resolve exact Ref").click(); page.wait_for_timeout(250)
            page.get_by_test_id("review-binding").click(); page.wait_for_timeout(250); assert "browser-profile" in page.content()
            page.get_by_test_id("freeze-dispatch").click(); page.wait_for_timeout(500)
            report_browser()
            browser.close()
        from urllib.request import Request, urlopen
        def get(path,method="GET",payload=None):
            data=json.dumps(payload).encode() if payload is not None else None; headers={"Content-Type":"application/json","Origin":url} if data else {}
            with urlopen(Request(url+path,data=data,headers=headers,method=method)) as r:return json.loads(r.read())
        works=get("/api/v1/works")["works"]; execution=get(f"/api/v1/works/{works[0]['id']}")["executions"][0]
        frozen=get(f"/api/v1/executions/{execution['id']}/binding")["inputs"][0]
        assert frozen["ref"]["provider"]=="codex-profile" and frozen["ref"]["metadata"]["revision"]=="2"
        assert frozen["ref"]["metadata"]["digest"].startswith("sha256:")
    finally:
        server.app.shutdown(); server.owner.release(); server.server_close(); db._reset_connection_for_tests()
