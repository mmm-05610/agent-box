"""Order 58 stage A/B: the skill asset store and its refusals.

The order's G1 is "one store: id / revision / tree digest / source, in the
Agent Skills format". These tests pin the format rules and the install
boundaries, each with the counterexample the order asks for: illegal
frontmatter, an empty or link-bearing tree, an oversized install, a revision
that already exists, and a digest that no longer matches.
"""
from __future__ import annotations

import json
import os
import pathlib
import shutil
import time

import pytest

REPO = pathlib.Path(__file__).resolve().parents[2]
PLUGIN = REPO / "plugins" / "agent-box-harnesses"

from agent_box.server.assets.skills import (
    MAX_ASSET_ENTRIES,
    SkillAssetError,
    SkillAssetStore,
    parse_skill_frontmatter,
)


def _skill(root: pathlib.Path, name: str = "my-skill", body: str = "Body.\n") -> pathlib.Path:
    directory = root / name
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "SKILL.md").write_text(
        f"---\nname: {name}\ndescription: does a thing\n---\n\n{body}",
        encoding="utf-8",
    )
    return directory


def test_the_two_required_fields_and_nothing_guessed():
    fields = parse_skill_frontmatter(
        "---\nname: my-skill\ndescription: \"does a thing\"\n---\nbody\n")
    assert fields == {"name": "my-skill", "description": "does a thing"}


def test_illegal_frontmatter_is_a_typed_refusal():
    with pytest.raises(SkillAssetError) as missing:
        parse_skill_frontmatter("name: my-skill\ndescription: x\n")
    assert missing.value.code == "SKILL_FRONTMATTER_MISSING"

    with pytest.raises(SkillAssetError) as bad_name:
        parse_skill_frontmatter("---\nname: My Skill\ndescription: x\n---\n")
    assert bad_name.value.code == "SKILL_NAME_INVALID"

    with pytest.raises(SkillAssetError) as no_description:
        parse_skill_frontmatter("---\nname: my-skill\n---\n")
    assert no_description.value.code == "SKILL_DESCRIPTION_MISSING"

    with pytest.raises(SkillAssetError) as not_a_scalar:
        parse_skill_frontmatter("---\nname: my-skill\ndescription: x\ntags: [a, b]\n---\n")
    assert not_a_scalar.value.code == "SKILL_FRONTMATTER_INVALID"


def test_install_publishes_one_revision_and_verifies_its_digest(tmp_path):
    store = SkillAssetStore(tmp_path / "assets")
    source = _skill(tmp_path)
    (source / "resources").mkdir()
    (source / "resources" / "data.json").write_text('{"a": 1}\n', encoding="utf-8")
    facts = store.install(source, asset_id="my-skill", revision=1)
    assert facts["files"] == 2 and facts["tree_digest"].startswith("sha256:")
    installed = store.revision_dir("my-skill", 1)
    assert (installed / "SKILL.md").is_file()
    assert store.verify(asset_id="my-skill", revision=1,
                        expected_digest=facts["tree_digest"]) is True
    assert store.verify(asset_id="my-skill", revision=1,
                        expected_digest="sha256:" + "0" * 64) is False


def test_install_refuses_a_second_revision_at_the_same_number(tmp_path):
    store = SkillAssetStore(tmp_path / "assets")
    source = _skill(tmp_path)
    store.install(source, asset_id="my-skill", revision=1)
    with pytest.raises(SkillAssetError) as exists:
        store.install(source, asset_id="my-skill", revision=1)
    assert exists.value.code == "SKILL_REVISION_EXISTS"


def test_a_link_bearing_or_oversized_tree_is_refused(tmp_path):
    store = SkillAssetStore(tmp_path / "assets")
    source = _skill(tmp_path)
    os.symlink("/etc/hostname", source / "escape.txt")
    with pytest.raises(SkillAssetError) as linked:
        store.install(source, asset_id="my-skill", revision=1)
    assert linked.value.code == "SKILL_ASSET_INVALID"
    os.unlink(source / "escape.txt")

    for index in range(MAX_ASSET_ENTRIES + 1):
        (source / f"file-{index}.txt").write_text("x", encoding="utf-8")
    with pytest.raises(SkillAssetError) as oversized:
        store.install(source, asset_id="my-skill", revision=1)
    assert oversized.value.code == "SKILL_ASSET_OUTSIDE_BOUNDS"


def test_a_missing_skill_md_is_refused(tmp_path):
    store = SkillAssetStore(tmp_path / "assets")
    bare = tmp_path / "bare"
    bare.mkdir()
    with pytest.raises(SkillAssetError) as refused:
        store.install(bare, asset_id="bare", revision=1)
    assert refused.value.code == "SKILL_ASSET_INVALID"


# -- MCP assets and the per-family spellings (order 58 G1/G2) --------------


def test_a_stdio_definition_canonicalises_and_refuses_misuse():
    from agent_box.server.assets.mcp import McpAssetError, canonical_definition

    canonical = canonical_definition({
        "name": "web-tools",
        "transport": {"stdio": {
            "command": "/runtime/bin/web-tools",
            "args": ["--stdio"],
            "env": {"API_KEY": {"credentialRef": "credential_1"}},
        }},
    })
    assert canonical["transport"]["stdio"]["env"] == {"API_KEY": "credential_1"}

    with pytest.raises(McpAssetError) as literal:
        canonical_definition({
            "name": "bad",
            "transport": {"stdio": {"command": "/bin/x", "env": {"KEY": "plain-secret"}}},
        })
    assert literal.value.code == "MCP_CREDENTIAL_REFERENCE_REQUIRED"

    with pytest.raises(McpAssetError) as relative:
        canonical_definition({"name": "bad", "transport": {"stdio": {"command": "x"}}})
    assert relative.value.code == "MCP_DEFINITION_INVALID"

    with pytest.raises(McpAssetError) as transport:
        canonical_definition({"name": "bad", "transport": {"grpc": {}}})
    assert transport.value.code == "MCP_TRANSPORT_UNSUPPORTED"

    with pytest.raises(McpAssetError) as remote:
        canonical_definition({"name": "bad", "transport": {"remote": {"url": "http://evil.test"}}})
    assert remote.value.code == "MCP_DEFINITION_INVALID"


def test_the_mcp_store_publishes_one_revision_and_verifies_it(tmp_path):
    from agent_box.server.assets.mcp import McpAssetError, McpAssetStore

    store = McpAssetStore(tmp_path / "assets")
    definition = {"name": "web-tools", "transport": {"stdio": {"command": "/bin/x", "args": []}}}
    facts = store.install(definition, asset_id="web-tools", revision=1)
    assert facts["digest"].startswith("sha256:") and facts["transport"] == "stdio"
    assert store.verify(asset_id="web-tools", revision=1, expected_digest=facts["digest"]) is True
    assert store.read(asset_id="web-tools", revision=1)["name"] == "web-tools"
    with pytest.raises(McpAssetError) as exists:
        store.install(definition, asset_id="web-tools", revision=1)
    assert exists.value.code == "MCP_REVISION_EXISTS"


def test_the_two_observed_spellings_render_and_unsupported_families_refuse():
    from agent_box.server.assets.mcp import canonical_definition
    from agent_box.server.assets.rendering import McpRenderError, render_for_family
    from agent_box_harnesses.registry.loader import load_builtin_registry

    registry = load_builtin_registry()

    def spec(name):
        return registry.get(name).profile

    canonical = canonical_definition({
        "name": "web-tools",
        "transport": {"stdio": {
            "command": "/bin/web-tools", "args": ["--stdio"],
            "env": {"API_KEY": {"credentialRef": "credential_1"}},
        }},
    })

    target, text = render_for_family(
        canonical, profile_spec=spec("claude-code"),
        resolved_env={"API_KEY": "resolved-value"})
    assert target == "/runtime/home/.claude/settings.json"
    assert json.loads(text)["mcpServers"]["web-tools"]["command"] == "/bin/web-tools"
    assert json.loads(text)["mcpServers"]["web-tools"]["env"] == {"API_KEY": "resolved-value"}

    target, text = render_for_family(
        canonical, profile_spec=spec("codex"),
        resolved_env={"API_KEY": "resolved-value"})
    assert target == "/runtime/home/.codex/config.toml"
    assert "[mcp_servers.web-tools]" in text
    assert 'command = "/bin/web-tools"' in text
    assert 'args = ["--stdio"]' in text
    assert 'API_KEY = "resolved-value"' in text

    # A family that declares no MCP slot is refused, never approximated.
    with pytest.raises(McpRenderError) as unsupported:
        render_for_family(canonical, profile_spec=spec("pi"), resolved_env={})
    assert unsupported.value.code == "ASSET_SLOT_UNSUPPORTED"

    # A missing credential value refuses before any config text exists.
    with pytest.raises(McpRenderError) as unresolved:
        render_for_family(canonical, profile_spec=spec("qwen"), resolved_env={})
    assert unresolved.value.code == "MCP_CREDENTIAL_UNRESOLVED"


def test_assets_are_catalogued_bound_and_never_carry_content(tmp_path):
    from agent_box.server.assets.records import AssetRecords, asset_view
    from agent_box.server.idempotency import IdempotentRecords
    from agent_box.storage import Database

    database = Database(tmp_path / "data")
    database.initialize()
    records = AssetRecords(database, IdempotentRecords(database))
    kind, published = records.publish(
        key="a", request_digest="a", kind="mcp", name="web-tools", revision=1,
        digest="sha256:" + "1" * 64, source="hub:example.test/catalog")
    assert kind == "published" and published["source"].startswith("hub:")

    # One more revision of the same asset moves `latest_revision` and keeps
    # the source unless the caller states a new one.
    updated = records.publish(
        key="b", request_digest="b", kind="mcp", name="web-tools", revision=2,
        digest="sha256:" + "2" * 64, asset_id=published["asset_id"])[1]
    assert updated["latest_revision"] == 2 and updated["source"].startswith("hub:")

    with database.transaction() as conn:
        conn.execute(
            "INSERT INTO server_profiles(id,version,name,harness_type,config_revision,"
            "native_generation,config_object_digest,created_at,updated_at) "
            "VALUES ('profile_1',1,'role','codex',1,0,'sha256:x','t','t')"
        )
    binding = records.bind(profile_id="profile_1", asset_id=published["asset_id"])
    assert binding["enabled"] is True and binding["revision"] == 2
    assert records.bindings("profile_1") == [binding]
    records.bind(profile_id="profile_1", asset_id=published["asset_id"], revision=1,
                 enabled=False)
    disabled = records.bindings("profile_1")[0]
    assert disabled["revision"] == 1 and disabled["enabled"] is False
    assert records.bindings("profile_1", enabled_only=True) == []

    view = asset_view(records.get(published["asset_id"]))
    assert "content" not in json.dumps(view) and view["digest"].startswith("sha256:")

    # An unpublished revision cannot be bound.
    from agent_box.server.errors import ServerError

    with pytest.raises(ServerError) as unknown:
        records.bind(profile_id="profile_1", asset_id=published["asset_id"], revision=9)
    assert unknown.value.code == "ASSET_REVISION_UNKNOWN"


@pytest.mark.skipif(shutil.which("bwrap") is None, reason="bwrap is required")
def test_a_bound_mcp_asset_is_rendered_and_materialised_without_writeback(tmp_path):
    """Order 58 G2/G3/G4 on the local channel, end to end.

    A bound MCP asset is rendered for the family (registry-declared target and
    key), the credential reference resolves through the secret store, and the
    file appears in the Profile's own home at the declared path - while the
    stored definition keeps the reference, not the value, and nothing is read
    back (assets have zero writeback).
    """
    from fastapi.testclient import TestClient

    from agent_box.server.bootstrap import build_runtime_from_sidecar_deployment
    from agent_box.server.transport.http import create_app
    from agent_box.storage.secrets import MemorySecretStore

    import agent_box.server.bootstrap.runtime as runtime_module

    peer_source = "tests/harness_remote/home_probe_acp_peer.mjs"
    peer_bytes = REPO / "tests" / "server" / "fixtures" / "home_probe_acp_peer.mjs"
    deployment = {
        "schemaVersion": 1,
        "harnesses": [{
            "id": "claude-code", "capabilityClaims": {"stream": True},
            "adapter": {"command": "/usr/bin/node", "args": [], "source": peer_source},
            "stateProjection": {"target": "/runtime/home/.claude"},
            "timeoutMs": 60_000,
        }],
    }
    original_file = runtime_module._sidecar_deployment_file

    def deployment_file(root, relative):
        if relative == peer_source:
            return peer_bytes.read_bytes()
        return original_file(root, relative)

    runtime_module._sidecar_deployment_file = deployment_file
    secrets = MemorySecretStore(values={"locator_1": b"resolved-secret"})
    try:
        (tmp_path / "project").mkdir(exist_ok=True)
        document = tmp_path / "deployment.json"
        document.write_text(json.dumps(deployment), encoding="utf-8")
        runtime = build_runtime_from_sidecar_deployment(
            tmp_path / "server", document, plugin_root=PLUGIN, secret_store=secrets)
        runtime.start()
        runtime.repository.register_credential("credential_1", "api-key", "locator_1")
        facts = runtime.mcp_assets.install({
            "name": "web-tools",
            "transport": {"stdio": {"command": "/bin/web-tools", "args": ["--stdio"]}},
        }, asset_id="web-tools", revision=1)
        published = runtime.asset_records.publish(
            key="a", request_digest="a", kind="mcp", name="web-tools", revision=1,
            digest=facts["digest"], source="local:test", asset_id="web-tools")[1]
        assert published["asset_id"] == "web-tools", published
        profile = runtime.repository.profiles.create(
            key="p", request_digest="p", name="role", harness_type="claude-code",
            config_digest=runtime.objects.publish(
                b'{"schema_version":1,"harness_type":"claude-code","configuration":{}}').digest,
            credential_id="credential_1")[1]
        runtime.asset_records.bind(profile_id=profile["profile_id"],
                                   asset_id=published["asset_id"])

        with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
            token = runtime.token
            opened = client.post("/wire/v1/workspaces.open", headers={
                "Authorization": f"Bearer {token}"}, json={
                "jsonrpc": "2.0", "id": "o", "method": "workspaces.open",
                "params": {"requestId": "asset-open-1", "path": str(tmp_path / "project"),
                           "environment": {"kind": "local", "host": None, "user": None}},
            }).json()["result"]
            sent = client.post("/wire/v1/sessions.createAndSend", headers={
                "Authorization": f"Bearer {token}"}, json={
                "jsonrpc": "2.0", "id": "s", "method": "sessions.createAndSend",
                "params": {"requestId": "asset-turn-1", "workspaceId": opened["workspace"]["id"],
                           "profileId": profile["profile_id"], "overrides": [],
                           "message": {"text": "hello", "attachments": []}},
            }).json()["result"]
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                session = runtime.repository.get_session(sent["session"]["id"])
                if session["turns"] and session["turns"][0]["state"] in {"completed", "failed"}:
                    break
                time.sleep(0.05)
            assert session["turns"][0]["state"] == "completed", session["turns"][0]

        role = next(item for item in (tmp_path / "server" / "profiles").iterdir()
                    if item.is_dir() and item.name != "_sessions")
        rendered = json.loads((role / ".claude" / "settings.json").read_text(encoding="utf-8"))
        assert rendered["mcpServers"]["web-tools"]["command"] == "/bin/web-tools"
        assert rendered["mcpServers"]["web-tools"]["args"] == ["--stdio"]
        # Nothing in the file is a credential value, and the audit (which
        # scans the home for the injected material) passed on this turn.
        assert "resolved-secret" not in (role / ".claude" / "settings.json").read_text()

        # A server that carries credential references is refused until the
        # family's injection path is pinned: the value must never land in a
        # durable config file (order 58 G5; the audit enforces it too).
        runtime.mcp_assets.install({
            "name": "needs-key",
            "transport": {"stdio": {
                "command": "/bin/needs-key",
                "env": {"API_KEY": {"credentialRef": "credential_1"}},
            }},
        }, asset_id="needs-key", revision=1)
        from agent_box.server.assets.mcp import definition_digest

        needs_key = runtime.mcp_assets.read(asset_id="needs-key", revision=1)
        runtime.asset_records.publish(
            key="b", request_digest="b", kind="mcp", name="needs-key", revision=1,
            digest=definition_digest(needs_key), asset_id="needs-key")
        runtime.asset_records.bind(profile_id=profile["profile_id"], asset_id="needs-key")
        with TestClient(create_app(runtime), base_url="http://127.0.0.1") as client:
            token = runtime.token
            refused = client.post("/wire/v1/sessions.send", headers={
                "Authorization": f"Bearer {token}"}, json={
                "jsonrpc": "2.0", "id": "s2", "method": "sessions.send",
                "params": {"requestId": "asset-turn-2", "sessionId": sent["session"]["id"],
                           "overrides": [],
                           "message": {"text": "hello again", "attachments": []}},
            }).json()
            assert "error" not in refused, refused
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                session = runtime.repository.get_session(sent["session"]["id"])
                if (len(session["turns"]) >= 2
                        and session["turns"][1]["state"] in {"completed", "failed"}):
                    break
                time.sleep(0.05)
            assert session["turns"][1]["state"] == "failed"
            assert session["turns"][1]["error_code"] in {
                "EXECUTION_FAILED", "MCP_CREDENTIAL_INJECTION_UNVERIFIED",
            }
    finally:
        runtime_module._sidecar_deployment_file = original_file
