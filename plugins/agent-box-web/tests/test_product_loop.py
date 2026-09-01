"""Real loopback browser vertical: temporary Git E1 -> E2."""
from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import subprocess
import sys
import threading
import time
import re

import pytest

from agent_box.work_core.runtime import agent_box_home
from agent_box.work_core import db
from agent_box.extensions import (
    PluginContext, PluginDescriptor, PluginLoadRecord, PluginLoadReport,
    PluginRegistration,
)
from agent_box.protocols.host import ResourceSelection, SelectorField, resource_selector, host_control
from agent_box_web.server.host import create_server
from agent_box_web.application.terminal import TerminalOpenResult
from agent_box.work_core import (
    ExecutionProjection, ExecutionStartReceipt, ExecutionStartRequest,
    Freshness, Outcome, Phase, ProviderDescriptor, Ref, RefType,
)
from agent_box.resource_contracts import WorkspaceV1

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import expect

PLUGIN_ROOT = Path(__file__).resolve().parents[1] / "plugins"
sys.path.insert(0, str(PLUGIN_ROOT / "agent-box-git" / "src"))
from agent_box_git.plugin import GitPlugin  # noqa: E402


def attach_browser_diagnostics(page, label):
    requests, responses, console_errors, page_errors = [], [], [], []
    page.on("request", lambda r: requests.append((r.method, r.url)))
    page.on("response", lambda r: responses.append((r.request.method, r.status, r.url)))
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: page_errors.append(str(e)))
    def report():
        print({"label": label, "requests": requests, "responses": responses, "url": page.url, "hash": page.url.split("#", 1)[-1], "wb_errors": page.locator(".wb-error").all_inner_texts(), "console_errors": console_errors, "page_errors": page_errors})
    return report


@dataclass
class FakeObservation:
    projection: ExecutionProjection
    native_refs: tuple[Ref, ...] = ()
    output_refs: tuple[Ref, ...] = ()
    resource_observations: tuple[object, ...] = ()


class FakeSelector:
    id = "workspace-input"
    contract_id = WorkspaceV1.contract_id
    title = "Workspace input"
    fields = (SelectorField("selector", "Revision", default="HEAD"),)

    def bind_registry(self, registry):
        self.registry = registry

    def prepare(self, parameters, *, execution_id):
        del execution_id
        ref = self.registry.get_resource_provider("git-workspace").make_ref(parameters.get("selector", "HEAD"))
        return ResourceSelection(self.contract_id, ref, parameters.get("selector", "HEAD"), f"commit {ref.native_id} · tree {ref.metadata['tree']}")


class FakeProvider:
    provider_id = "fake-provider"

    def __init__(self):
        self.handles = {}
        self.started = []

    def descriptor(self):
        return ProviderDescriptor(self.provider_id, "Controlled fake provider", "1")

    def capabilities(self):
        return {"start": "supported", "observe": "supported", "finish": "supported"}

    def input_limits(self):
        return {WorkspaceV1.contract_id: (1, 1)}

    def start(self, request: ExecutionStartRequest):
        workspace = next(item.value for item in request.resolved_inputs if item.contract_id == WorkspaceV1.contract_id)
        workspace.path.joinpath("fake-e1.txt" if not self.started else "fake-e2.txt").write_text("browser vertical\n", encoding="utf-8")
        self.started.append(request.execution_id)
        self.handles[request.execution_id] = workspace
        return ExecutionStartReceipt(request.execution_id, request.dispatch_id, request.inputs_digest, runtime_handle=request.execution_id)

    def observe(self, native_ref):
        return FakeObservation(ExecutionProjection(Phase.ACTIVE, None, False, Freshness.OBSERVED, config_time()), native_refs=(Ref(RefType.RUN, self.provider_id, str(native_ref)),))


def config_time():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)


class FakeControl:
    provider_id = FakeProvider.provider_id

    def __init__(self, provider):
        self.provider = provider

    def bind_registry(self, registry):
        del registry

    def attach_command(self, facts):
        return ("fake-native-terminal", facts.execution.id)

    def observe(self, facts, handle=None):
        del handle
        return FakeObservation(ExecutionProjection(Phase.ACTIVE, None, False, Freshness.OBSERVED, config_time()), native_refs=(Ref(RefType.RUN, self.provider_id, facts.execution.id),))

    def finish(self, facts, handle=None):
        del handle
        return FakeObservation(ExecutionProjection(Phase.TERMINAL, Outcome.SUCCEEDED, False, Freshness.OBSERVED, config_time()), native_refs=(Ref(RefType.RUN, self.provider_id, facts.execution.id),))

class FakeTerminalPresenter:
    def __init__(self): self.calls = []
    def open(self, argv): self.calls.append(tuple(argv)); return TerminalOpenResult("opened", "fake terminal launcher accepted")


class FakePlugin:
    def __init__(self, provider):
        self.provider, self.selector = provider, FakeSelector()

    def descriptor(self):
        return PluginDescriptor("fake", "Controlled fake", "1")

    def build(self, context):
        del context
        return PluginRegistration(execution_providers=(self.provider,), contributions=(resource_selector(self.selector), host_control(FakeControl(self.provider))))


def git(cwd: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(cwd), *args], check=True, text=True, stdout=subprocess.PIPE).stdout.strip()


@pytest.mark.skipif(__import__("shutil").which("git") is None, reason="git is required")
def test_browser_e1_e2_product_loop(tmp_path, monkeypatch):
    monkeypatch.setenv("AGENT_BOX_HOME", str(tmp_path / "home"))
    db._reset_connection_for_tests()
    repo = tmp_path / "repo"
    repo.mkdir()
    git(repo, "init", "-q")
    subprocess.run(["git", "-C", str(repo), "config", "user.email", "agent-box@test"], check=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.name", "Agent Box"], check=True)
    (repo / "README.md").write_text("seed\n", encoding="utf-8")
    git(repo, "add", "README.md")
    git(repo, "commit", "-qm", "seed")
    home = agent_box_home()
    cfg = home / "plugins" / "git" / "config.json"
    cfg.parent.mkdir(parents=True)
    cfg.write_text(json.dumps({"repo": str(repo), "managed_root": str(tmp_path / "worktrees")}), encoding="utf-8")

    git_plugin = GitPlugin()
    git_registration = git_plugin.build(PluginContext("1", home, home / "plugins" / "git"))
    fake_provider = FakeProvider()
    fake_plugin = FakePlugin(fake_provider)
    fake_registration = fake_plugin.build(PluginContext("1", home, home / "plugins" / "fake"))
    from agent_box.work_core.registry import ExtensionRegistry
    registry = ExtensionRegistry()
    registry.register_components(contracts=git_registration.contracts, resource_providers=git_registration.resource_providers, execution_providers=git_registration.execution_providers)
    registry.register_components(contracts=fake_registration.contracts, resource_providers=fake_registration.resource_providers, execution_providers=fake_registration.execution_providers)
    report = PluginLoadReport((
        PluginLoadRecord("git", "READY", git_plugin.descriptor(), git_registration),
        PluginLoadRecord("fake", "READY", fake_plugin.descriptor(), fake_registration),
    ))
    server = create_server(port=0, static_dir=Path(__file__).resolve().parents[1] / "src" / "agent_box_web" / "_static", registry=registry, report=report)
    presenter = FakeTerminalPresenter(); server.app.terminal_presenter = presenter
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{server.server_port}"
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page()
            report_browser = attach_browser_diagnostics(page, "product-loop")
            page.goto(url, wait_until="domcontentloaded", timeout=5000)
            page.set_default_timeout(3000)
            page.wait_for_load_state("domcontentloaded")
            page.wait_for_timeout(300)
            page.get_by_test_id("create-work").click()
            page.get_by_placeholder("Describe the objective").fill("Browser E1 to E2")
            page.get_by_role("button", name="Create Work", exact=True).click()
            page.get_by_test_id("new-execution").click()
            page.get_by_placeholder("Describe the outcome this execution owns").fill("Make a browser-verified change")
            page.locator(".wb-modal select").select_option(FakeProvider.provider_id)
            page.get_by_role("button", name="Create draft").click()
            page.get_by_test_id("selector-workspace-input").click()
            page.get_by_role("button", name="Resolve exact Ref").click()
            page.get_by_test_id("review-binding").click()
            page.get_by_test_id("freeze-dispatch").click()
            page.wait_for_timeout(1000)
            page.reload(wait_until="domcontentloaded")
            page.goto(url + "#" + page.url.split("#")[1].replace("/binding", "/activity"), wait_until="domcontentloaded")
            page.wait_for_timeout(800)
            page.get_by_role("button", name="Observe").click(); page.wait_for_timeout(300)
            page.get_by_role("button", name="Attach").click()
            expect(page.get_by_test_id("open-terminal")).to_be_visible()
            terminal_requests = []
            page.on("request", lambda request: terminal_requests.append(request.post_data or "") if request.url.endswith("/terminal") else None)
            page.get_by_test_id("open-terminal").click()
            expect(page.get_by_test_id("terminal-succeeded")).to_be_visible()
            assert presenter.calls and "argv" not in terminal_requests[-1] and "shell" not in terminal_requests[-1]
            assert "active" in page.locator("body").inner_text().lower()
            page.get_by_test_id("finish-execution").click()
            page.wait_for_timeout(1200)
            page.screenshot(path=str(tmp_path / "web-e1-finalizing.png"), full_page=True)
            deadline = time.time() + 10
            while time.time() < deadline and page.get_by_test_id("status-terminal").count() == 0:
                page.wait_for_timeout(1000)
            assert page.get_by_test_id("status-terminal").count() > 0
            page.goto(url + "#" + page.url.split("#")[1].replace("/activity", "/outputs"), wait_until="domcontentloaded")
            page.wait_for_timeout(800)
            assert page.get_by_test_id("continue-output").count() > 0
            e1_route = page.url.split("#")[1]
            page.goto(url + "#" + e1_route.replace("/outputs", "/evidence"), wait_until="domcontentloaded")
            page.wait_for_timeout(500)
            assert "Evidence reconciliation" in page.content()
            page.goto(url + "#" + e1_route, wait_until="domcontentloaded")
            page.wait_for_timeout(500)
            page.screenshot(path=str(tmp_path / "agent-box-web-e1-e2.png"), full_page=True)
            page.get_by_test_id("continue-output").first.click()
            page.locator(".wb-modal textarea").fill("Review the captured workspace")
            page.locator(".wb-modal select").select_option(FakeProvider.provider_id)
            page.get_by_role("button", name="Create continuation draft").click()
            expect(page).to_have_url(re.compile(r"#/executions/[^/]+/binding$"), timeout=5000)
            expect(page.locator(".wb-modal")).to_have_count(0, timeout=5000)
            expect(page.get_by_role("heading", name="Binding", exact=True)).to_be_visible(timeout=5000)
            page.get_by_role("link", name="← Back to Work").click()
            expect(page).to_have_url(re.compile(r"#/works/[^/]+$"), timeout=5000)
            page.get_by_test_id("complete-work").click()
            page.locator(".wb-modal textarea").fill("Human accepted the captured E1 and E2 record")
            page.get_by_role("button", name="Confirm Complete Work").click()
            page.wait_for_timeout(300)
            report_browser()
            browser.close()

        from urllib.request import Request, urlopen
        def request(path, method="GET", payload=None):
            data = json.dumps(payload).encode() if payload is not None else None
            headers = {"Content-Type": "application/json", "Origin": url} if data is not None else {}
            with urlopen(Request(url + path, data=data, headers=headers, method=method)) as response:
                return json.loads(response.read())
        work = request("/api/v1/works")["works"][0]
        detail = request("/api/v1/works/" + work["id"])
        e1, e2 = detail["executions"][-2:]
        output = request(f"/api/v1/executions/{e1['id']}/outputs")["outputs"][0]
        draft = request(f"/api/v1/executions/{e2['id']}/binding-draft")
        source = next(slot for slot in draft["slots"] if slot["selector_id"] == "source-output")
        assert output["native_id"] == source["ref"]["native_id"]
        frozen = request(f"/api/v1/executions/{e1['id']}/binding")["inputs"]
        assert e1["id"] != e2["id"]
        e2_frozen = request(f"/api/v1/executions/{e2['id']}/binding-review", "POST", {})
        assert e2_frozen["reviewed"]
        request(f"/api/v1/executions/{e2['id']}/freeze-dispatch", "POST", {"command_id": command_id(), "expected_draft_revision": e2_frozen["revision"]})
        assert len(fake_provider.started) == 2
        w1, w2 = fake_provider.handles[e1["id"]].path, fake_provider.handles[e2["id"]].path
        assert w1 != w2
        assert git(w2, "rev-parse", "HEAD^{commit}") == output["native_id"]
        assert git(w2, "rev-parse", "HEAD^{tree}") == output["metadata"]["tree"]
        e2_operation = request(f"/api/v1/executions/{e2['id']}/finish", "POST", {"operation_id": command_id()})
        deadline = time.time() + 10
        while time.time() < deadline:
            e2_operation = request(f"/api/v1/operations/{e2_operation['operation_id']}")
            if e2_operation["status"] == "succeeded":
                break
            time.sleep(0.05)
        assert e2_operation["status"] == "succeeded"
        # The Git contributor captures a durable output commit in the source
        # repository; the mutable E1 worktree itself remains disposable.
        assert git(repo, "rev-parse", output["native_id"] + "^{tree}") == output["metadata"]["tree"]
        assert request(f"/api/v1/works/{work['id']}")["lifecycle"] == "completed"
    finally:
        server.app.shutdown()
        server.owner.release()
        server.server_close()
        db._reset_connection_for_tests()


def command_id():
    from uuid import uuid4
    return str(uuid4())
