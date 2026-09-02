"""Web vertical for central Skill -> Profile installation (management API).
Exercises the full HTTP surface: import into the central library, install to
a Profile native home, inventory, update, remove — no real model requests."""
from __future__ import annotations

import json
import tempfile
import threading
from pathlib import Path
from typing import Any

import pytest

from agent_box.work_core.runtime import agent_box_home
from agent_box.extensions import PluginContext, PluginLoadRecord, PluginLoadReport
from agent_box_web.server.host import create_server

PLUGIN_SOURCES = Path(__file__).resolve().parents[2] / "src"


def _build_registry_report(home: Path):
    from agent_box.work_core.registry import ExtensionRegistry
    from agent_box.extensions.bootstrap import register_shared_runtime_contracts
    from agent_box.extensions import PluginContext
    from agent_box_harnesses.entrypoints import (
        create_claude, create_codex, create_opencode, create_hermes, create_pi,
        create_profile_store,
    )
    from agent_box_skills.plugin import AgentSkillsPlugin

    registry = ExtensionRegistry()
    register_shared_runtime_contracts(registry)
    context = PluginContext("2.0.0a1", home, home / "plugins")
    records = []

    def register(plugin):
        registration = plugin.build(context)
        registry.register_components(
            contracts=registration.contracts,
            resource_providers=registration.resource_providers,
            execution_providers=registration.execution_providers,
        )
        records.append(PluginLoadRecord(plugin.descriptor().id, "READY", plugin.descriptor(), registration))

    register(create_profile_store())
    for factory in (create_codex, create_claude, create_opencode, create_hermes, create_pi):
        register(factory())
    register(AgentSkillsPlugin())
    report = PluginLoadReport(tuple(records))
    return registry, report


@pytest.fixture()
def server(tmp_path, monkeypatch):
    import time
    import urllib.request

    monkeypatch.setenv("AGENT_BOX_HOME", str(tmp_path / "home"))
    from agent_box.work_core import db

    db._reset_connection_for_tests()
    registry, report = _build_registry_report(agent_box_home())
    server = create_server(port=0, static_dir=PLUGIN_SOURCES / "agent_box_web" / "_static", registry=registry, report=report)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}"
    for _attempt in range(50):
        try:
            with urllib.request.urlopen(url + "/api/v1/health", timeout=1) as response:
                if response.status == 200:
                    break
        except Exception:
            time.sleep(0.05)
    yield url
    server.shutdown()
    server.server_close()


def _post(base, path, body):
    import urllib.request

    request = urllib.request.Request(
        base + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Origin": base},
    )
    with urllib.request.urlopen(request) as response:
        return response.status, json.loads(response.read())


def _get(base, path):
    import urllib.request

    with urllib.request.urlopen(base + path) as response:
        return response.status, json.loads(response.read())


def _expected_revision(base, harness, profile):
    _, value = _get(base, f"/api/v1/harnesses/{harness}/profiles/{profile}")
    return int(value["revision"])


def test_web_central_skill_install_to_profile_vertical(server):
    # 1. create a Profile for claude-code
    status, created = _post(server, "/api/v1/harnesses/claude-code/profiles", {
        "profile_id": "main", "name": "Main", "native_payload": {"model": "claude-sonnet"},
    })
    assert status == 201
    assert created["profile"]["revision"] == 1
    # 2. import a skill into the central library
    source = Path(tempfile.mkdtemp()) / "review"
    source.mkdir()
    (source / "SKILL.md").write_text("---\nname: review\ndescription: Review safely.\n---\n# Review\n", encoding="utf-8")
    status, preview = _post(server, "/api/v1/skills/import/preview", {"path": str(source)})
    assert status == 200 and preview["skill_id"] == "review"
    status, imported = _post(server, "/api/v1/skills/import/confirm", {"preview_id": preview["preview_id"]})
    assert status == 201 and imported["skill"]["revision"] == 1
    # 3. install-to-profile preview then confirm
    skill = {"skill_id": "review", "revision": 1, "digest": imported["skill"]["digest"]}
    status, install_preview = _post(server, "/api/v1/skills/install/preview", {
        "harness_type": "claude-code", "profile_id": "main", "skill": skill,
    })
    assert status == 200
    assert install_preview["native_target"] == ".claude/skills/review"
    assert install_preview["conflicts"] == [] and install_preview["unmanaged"] == []
    status, installed = _post(server, "/api/v1/skills/install/confirm", {
        "preview_id": install_preview["preview_id"], "expected_revision": 1,
    })
    assert status == 201
    assert installed["installation"]["skill"]["skill_id"] == "review"
    assert installed["installation"]["state"] == "INSTALLED"
    # 4. profile revision moved and receipts bound
    _, profile = _get(server, "/api/v1/harnesses/claude-code/profiles/main")
    assert profile["revision"] == 2
    assert profile["skill_receipts_digest"].startswith("sha256:")
    # 5. native-home summary shows the installation and the local skill inventory
    _, native_home = _get(server, "/api/v1/harnesses/claude-code/profiles/main/native-home")
    assert native_home["present"] is True
    assert native_home["installations"][0]["skill"]["skill_id"] == "review"
    entries = native_home["skill_inventory"]["entries"]
    assert any(e["identity"] == "review" and e["source_kind"] == "central-installed" and e["claim"] == "AVAILABLE" for e in entries)
    # 6. profile-local skill is discoverable (unmanaged)
    home_dir = agent_box_home() / "profiles" / "claude-code" / "main" / "native-home"
    local = home_dir / ".claude" / "skills" / "handmade"
    local.mkdir(parents=True)
    (local / "SKILL.md").write_text("---\nname: handmade\ndescription: local\n---\n", encoding="utf-8")
    _, native_home2 = _get(server, "/api/v1/harnesses/claude-code/profiles/main/native-home")
    entries2 = native_home2["skill_inventory"]["entries"]
    assert any(e["identity"] == "handmade" and e["source_kind"] == "profile-local" and e["state"] == "UNMANAGED" for e in entries2)
    # 7. remove from profile
    status, removed = _post(server, "/api/v1/skills/install/remove", {
        "harness_type": "claude-code", "profile_id": "main", "skill_id": "review", "expected_revision": 2,
    })
    assert status == 200 and removed["status"] == "removed"
    _, profile_end = _get(server, "/api/v1/harnesses/claude-code/profiles/main")
    assert profile_end["revision"] == 3
    assert not (home_dir / ".claude" / "skills" / "review").exists()
    # 8. unmanaged profile-local file survived the removal
    assert (local / "SKILL.md").exists()