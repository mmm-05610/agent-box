from __future__ import annotations
import json
from pathlib import Path
import pytest
from agent_box_harnesses.importers.legacy_agent_box import candidates as legacy_candidates, preview as legacy_preview
from agent_box_harnesses.importers.cc_switch import candidates as cc_candidates, preview as cc_preview
from agent_box_harnesses.profiles.repository import ProfileRepository
from agent_box_harnesses.codex.manager import CodexHarnessManager

def test_legacy_preview_maps_capabilities_and_rejects_runtime_and_secrets(tmp_path: Path):
    source = tmp_path / "legacy.json"
    source.write_text(json.dumps({"name":"Imported", "config":{"model":"gpt-5", "instructions":"be precise", "api_key":"DO_NOT_COPY", "history":{"x":1}}, "mcp":["docs"], "skills":["review"], "credential_source_ref":{"provider":"codex", "native_locator":"codex-login/default"}}))
    candidate = legacy_candidates(tmp_path)[0]; result = legacy_preview(candidate)
    assert "model" in result.fields_to_import and "api_key" in result.fields_rejected
    assert "history" in result.fields_ignored
    assert "DO_NOT_COPY" not in json.dumps(result.public())
    assert {ref["native_id"] for ref in result.capability_refs} == {"docs", "review"}
    assert result.credential_locator == {"provider":"codex", "native_locator":"codex-login/default"}

def test_cc_switch_fixture_format_and_endpoint_are_safe(tmp_path: Path):
    source = tmp_path / "export.json"
    source.write_text(json.dumps({"source":"cc-switch", "profiles":[{"id":"p1","name":"Proxy", "endpoint":"https://example.invalid/v1", "settings":{"model":"m", "api_key":"SECRET"}, "mcp_servers":[{"id":"docs"}]}]}))
    result = cc_preview(cc_candidates(tmp_path)[0])
    assert "provider_endpoint" in result.fields_to_import
    assert "api_key" in result.fields_rejected
    assert result.credential_locator["native_locator"] == "cc-switch/login"
    assert "SECRET" not in json.dumps(result.public())

def test_nested_env_and_headers_are_redacted_from_preview(tmp_path: Path):
    source = tmp_path / "export.json"
    source.write_text(json.dumps({"source":"cc-switch", "profiles":[{"id":"p", "settings":{"model":"m", "env":{"OPENAI_API_KEY":"DO_NOT_COPY"}, "headers":{"Authorization":"DO_NOT_COPY"}}}]}))
    result = cc_preview(cc_candidates(tmp_path)[0])
    rendered = json.dumps(result.public())
    assert "DO_NOT_COPY" not in rendered
    assert "env" in result.fields_ignored

def test_import_confirm_is_immutable_and_replay_idempotent(tmp_path: Path):
    source = tmp_path / "legacy.json"; source.write_text(json.dumps({"name":"Imported", "config":{"model":"m"}}))
    manager = CodexHarnessManager(tmp_path / "plugin")
    candidate = legacy_candidates(tmp_path)[0]
    preview = legacy_preview(candidate).public()
    first = manager.confirm_import(preview)
    replay = manager.confirm_import(preview)
    assert first["revision"] == replay["revision"] == 1
    changed = dict(preview); changed["source_digest"] = "sha256:new-source"; changed["profile"] = {**preview["profile"], "config":{"model":"new"}, "import_provenance":{"source_type":"legacy-agent-box", "source_id":"legacy", "source_digest":"sha256:new-source"}}
    second = manager.confirm_import(changed, expected_revision=1)
    assert second["revision"] == 2
    assert manager.repo.get("imported", 1)["config"]["model"] == "m"

def test_import_never_accepts_secret_profile_fields(tmp_path: Path):
    repo = ProfileRepository(tmp_path / "profiles")
    with pytest.raises(ValueError, match="SECRET_FIELD_FORBIDDEN"):
        repo.save({"name":"unsafe", "config":{"token":"never"}})
