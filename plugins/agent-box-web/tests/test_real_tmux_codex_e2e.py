"""Local vertical: real plugins, real tmux, and a no-network fake Codex."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import time

from agent_box.work_core.runtime import agent_box_home
from agent_box.work_core import db
from agent_box.extensions import PluginContext, PluginLoadRecord, PluginLoadReport
from agent_box.extensions import PluginRegistration
from agent_box.work_core.registry import ExtensionRegistry
from agent_box_web.application.terminal import TerminalOpenResult
from agent_box_web.server.host import create_server


def _git(root: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(root), *args], check=True, text=True,
                          stdout=subprocess.PIPE).stdout.strip()


def _fake_codex(bin_dir: Path) -> Path:
    path = bin_dir / "codex"
    path.write_text("""#!/usr/bin/env python3
import json, os, re, signal, time
from pathlib import Path
args = sys_argv = __import__('sys').argv[1:]
event = next((Path(m.group(1)) for m in (re.search(r'([^\\" ]+\\.session-start\\.json)', a) for a in args) if m), None)
Path.cwd().joinpath('fake-codex-proof.json').write_text(json.dumps({'cwd':str(Path.cwd()), 'codex_home':os.environ.get('CODEX_HOME',''), 'argv':args}), encoding='utf-8')
Path.cwd().joinpath('fake-codex-output.txt').write_text('fake codex output\\n', encoding='utf-8')
if event: event.write_text(json.dumps({'session_id':'fake-session-1','hook_event_name':'SessionStart','source':'startup'}), encoding='utf-8')
signal.signal(signal.SIGTERM, lambda *_: raise_exit()) if False else None
while True: time.sleep(1)
""", encoding="utf-8")
    path.chmod(0o755)
    return path


class _FakePresenter:
    def __init__(self): self.calls = []
    def open(self, argv):
        self.calls.append(tuple(argv))
        return TerminalOpenResult("opened", "test launcher accepted validated attach argv")


def test_real_plugins_managed_tmux_fake_codex_finish_and_continuation(tmp_path, monkeypatch):
    tmux = subprocess.run(["which", "tmux"], check=False, text=True, stdout=subprocess.PIPE).stdout.strip()
    if not tmux:
        import pytest
        pytest.skip("tmux is required")
    home, repo, bin_dir = tmp_path / "home", tmp_path / "repo", tmp_path / "bin"
    home.mkdir(); repo.mkdir(); bin_dir.mkdir()
    monkeypatch.setenv("AGENT_BOX_HOME", str(home)); monkeypatch.setenv("PATH", str(bin_dir) + os.pathsep + os.environ["PATH"])
    db._reset_connection_for_tests()
    _fake_codex(bin_dir)
    _git(repo, "init", "-q"); _git(repo, "config", "user.email", "test@example.invalid"); _git(repo, "config", "user.name", "Agent Box Test")
    (repo / "README.md").write_text("seed\n", encoding="utf-8"); _git(repo, "add", "."); _git(repo, "commit", "-qm", "seed")
    contexts = []
    from agent_box_git.plugin import GitPlugin
    from agent_box_tmux.plugin import TmuxPlugin
    from agent_box_artifacts.plugin import ArtifactsPlugin
    from agent_box_harnesses.plugin import HarnessesPlugin
    for plugin, name in ((GitPlugin(), "git"), (TmuxPlugin(), "tmux"), (ArtifactsPlugin(), "artifacts"), (HarnessesPlugin(), "harnesses")):
        context = PluginContext("1", home, home / "plugins" / name); context.plugin_data_dir.mkdir(parents=True, exist_ok=True)
        contexts.append((name, plugin, context, plugin.build(context)))
    registrations = {name: reg for name, _, _, reg in contexts}
    git_provider = registrations["git"].resource_providers[0]
    git_provider.add_repository({"id":"repo-e2e", "name":"e2e", "path":str(repo), "managed_root":str(tmp_path / "worktrees")})
    manager = registrations["harnesses"].harness_managers[0]
    profile = manager.create({"profile_id":"fake-codex", "name":"fake-codex", "config":{"model":"offline"}})
    registry = ExtensionRegistry()
    for registration in registrations.values():
        registry.register_components(contracts=registration.contracts, resource_providers=registration.resource_providers, execution_providers=registration.execution_providers)
    report = PluginLoadReport(tuple(PluginLoadRecord(name, "READY", plugin.descriptor(), registration) for name, plugin, _, registration in contexts))
    presenter = _FakePresenter()
    server = create_server(port=0, static_dir=Path(__file__).parents[1] / "src" / "agent_box_web" / "_static", registry=registry, report=report)
    server.app.terminal_presenter = presenter
    try:
        launched = server.app.quick_launch("e2e-launch", {"objective":"real tmux rehearsal", "responsibility":"create governed fake output", "provider_id":"codex-tmux-interactive", "inputs":[
            {"selector_id":"git-workspace", "parameters":{"repository_id":"repo-e2e", "selector":"HEAD"}},
            {"selector_id":"responsibility", "parameters":{"text":"create governed fake output"}},
            {"selector_id":"agent-box-profile", "parameters":{"profile_id":"fake-codex"}},
            {"selector_id":"tmux-console", "parameters":{"layout":"tiled"}},
        ]})
        eid = launched["execution"]["id"]
        reviewed = server.app.review(eid); assert reviewed["reviewed"]
        frozen = server.app.freeze("e2e-freeze", eid, reviewed["revision"])
        assert frozen["state"] == "accepted"
        dispatch = server.app.repo.get_dispatch_for_execution(eid)
        assert dispatch["state"] == "accepted"
        attach = server.app.attach(eid); assert attach["available"] and attach["command"]
        assert server.app.open_terminal("open-1", eid, {"operation_id":"open-1"})["status"] == "opened"
        assert presenter.calls[0] == tuple(attach["command"])
        slot = next(x for x in reviewed["slots"] if x["contract_id"] == "agent-box-tmux.console@1")
        console_ref = next(ref for contract_id, ref in server.app.repo.list_input_refs(eid) if contract_id == slot["contract_id"])
        console = registry.get_resource_provider("tmux-console").resolve(slot["contract_id"], console_ref)
        assert console.session_name
        pane_probe = subprocess.run([tmux, "-L", console.socket_name, "capture-pane", "-p", "-t", console.session_name], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        assert pane_probe.returncode == 0, pane_probe.stderr
        deadline = time.time() + 5
        proof = None
        while time.time() < deadline:
            candidates = list(Path(tmp_path / "worktrees").glob("**/fake-codex-proof.json"))
            if candidates: proof = json.loads(candidates[0].read_text()); break
            time.sleep(.1)
        if not proof:
            pane_dump = subprocess.run([tmux, "-L", console.socket_name, "capture-pane", "-p", "-S", "-", "-t", console.session_name], text=True, stdout=subprocess.PIPE, check=False).stdout
            raise AssertionError(pane_dump)
        assert Path(proof["cwd"]).is_dir() and Path(proof["codex_home"]).is_dir()
        assert proof["cwd"] != str(repo) and proof["cwd"].startswith(str(tmp_path / "worktrees"))
        assert server.app.observe("observe-1", eid)["phase"] == "active"
        finish = server.app.finish("finish-1", eid); assert finish["status"] == "accepted"
        deadline = time.time() + 10
        while time.time() < deadline and server.app.get_operation("finish-1")["status"] not in {"succeeded", "failed"}: time.sleep(.1)
        assert server.app.get_operation("finish-1")["status"] == "succeeded"
        assert server.app.get_execution(eid)["phase"] == "terminal"
        assert server.app.outputs(eid)
        assert _git(repo, "status", "--porcelain") == ""
        candidates = server.app.continuation_candidates(launched["work_id"])["candidates"]
        assert any(item["source_execution_id"] == eid and item["native_id"] == "fake-session-1" for item in candidates)
        continued = server.app.quick_launch("e2e-launch-2", {"work_id":launched["work_id"], "responsibility":"continue governed fake output", "provider_id":"codex-tmux-interactive", "continuation_source_execution_id":eid, "inputs":[
            {"selector_id":"git-workspace", "parameters":{"repository_id":"repo-e2e", "selector":"HEAD"}},
            {"selector_id":"responsibility", "parameters":{"text":"continue governed fake output"}},
            {"selector_id":"agent-box-profile", "parameters":{"profile_id":"fake-codex"}},
            {"selector_id":"tmux-console", "parameters":{"layout":"tiled"}},
        ]})
        e2 = continued["execution"]["id"]
        assert any(slot["contract_id"] == "agent-box.codex-continuation@1" for slot in continued["draft"]["slots"])
        review2 = server.app.review(e2); assert review2["reviewed"]
        assert server.app.freeze("e2e-freeze-2", e2, review2["revision"])["state"] == "accepted"
        assert server.app.observe("observe-2", e2)["phase"] == "active"
        assert server.app.get_execution(eid)["phase"] == "terminal"
        server.app.finish("finish-2", e2)
        deadline = time.time() + 10
        while time.time() < deadline and server.app.get_operation("finish-2")["status"] not in {"succeeded", "failed"}: time.sleep(.1)
        assert server.app.get_operation("finish-2")["status"] == "succeeded"
    finally:
        server.app.shutdown(); server.owner.release(); server.server_close(); db._reset_connection_for_tests()
