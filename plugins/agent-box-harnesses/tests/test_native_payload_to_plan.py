"""Determined repair B: the typed ProfileEnvelope actually reaches the plan.

The native payload must influence the LaunchPlan's rendered configuration
fragment for all five Harnesses — it may no longer die inside the Profile
Store.  Credential-shaped payload fields are banned everywhere.
"""
import json

import pytest

from agent_box.resource_contracts import AgentBoxProfileV1
from agent_box_harnesses.adapters import ADAPTERS
from agent_box_harnesses.adapters.start_context import build_start_context
from agent_box_harnesses.generic.profile_envelope import ProfileEnvelope
from agent_box_harnesses.generic.profile_store import ProfileStore
from helpers import definition_by_driver, make_request, resolved_executable_for


def _envelope(driver: str, payload: dict) -> ProfileEnvelope:
    return ProfileEnvelope(
        name="main", agent_type=definition_by_driver(driver).harness_type,
        digest="sha256:" + "a" * 64, revision=3, provider="harness-profile",
        native_payload=payload,
    )


@pytest.mark.parametrize("driver,config_relpath", [
    ("codex", ".codex/config.toml"),
    ("claude", ".claude/settings.json"),
    ("opencode", ".config/opencode/opencode.json"),
    ("hermes", ".hermes/config.yaml"),
    ("pi", "settings.json"),
])
def test_native_payload_renders_into_the_native_config_fragment(tmp_path, driver, config_relpath):
    definition = definition_by_driver(driver)
    executable = resolved_executable_for(tmp_path, definition)
    payload = {"model": "offline-model"} if driver != "codex" else {"model": "offline-model", "approval_policy": "never"}
    profile = _envelope(driver, payload)
    request, *_ = make_request(tmp_path, definition, executable=executable, profile=profile)
    context = build_start_context(definition, request, executable=executable)
    plan = ADAPTERS[definition.driver].plan(context)

    guest_path = "/runtime/home/" + config_relpath
    assert guest_path in plan.rendered_content
    content = plan.rendered_content[guest_path].decode()
    assert "offline-model" in content
    if driver == "codex":
        # TOML rendering: the dotted key/value pair must appear verbatim
        assert 'model = "offline-model"' in content
    else:
        assert json.loads(content)["model"] == "offline-model"
    # the fragment is backed by exactly one authority and one semantic key
    files = [f for f in plan.rendered.files if f.guest_path == guest_path]
    assert len(files) == 1
    assert files[0].semantic_key == "profile-config"
    assert files[0].authority == AgentBoxProfileV1.contract_id


def test_no_profile_means_no_rendered_config(tmp_path):
    definition = definition_by_driver("pi")
    executable = resolved_executable_for(tmp_path, definition)
    request, *_ = make_request(tmp_path, definition, executable=executable, profile=None)
    context = build_start_context(definition, request, executable=executable)
    plan = ADAPTERS[definition.driver].plan(context)
    assert plan.rendered.files == () and plan.rendered_content == {}


def test_secret_shaped_payload_fields_never_reach_a_plan(tmp_path):
    definition = definition_by_driver("claude")
    executable = resolved_executable_for(tmp_path, definition)
    profile = _envelope("claude", {"apiKey": "should-never-exist"})
    request, *_ = make_request(tmp_path, definition, executable=executable, profile=profile)
    context = build_start_context(definition, request, executable=executable)
    with pytest.raises(ValueError, match="SECRET_FIELD_FORBIDDEN"):
        ADAPTERS[definition.driver].plan(context)


def test_store_resolve_returns_typed_envelope_with_native_payload(tmp_path):
    store = ProfileStore(tmp_path / "profiles")
    stored = store.put("pi", {"profile_id": "main", "native_payload": {"defaultModel": "offline"}})
    ref = store.ref("pi", "main", 1)
    envelope = store.resolve("agent-box.profile@1", ref)
    assert isinstance(envelope, AgentBoxProfileV1)  # contract type check passes
    assert isinstance(envelope, ProfileEnvelope)
    assert envelope.native_payload == {"defaultModel": "offline"}
    assert envelope.revision == stored["revision"] and envelope.digest == stored["digest"]


def test_store_resolve_rescans_tampered_envelopes(tmp_path):
    import hashlib

    from agent_box.work_core import Ref, RefType

    store = ProfileStore(tmp_path / "profiles")
    store.put("pi", {"profile_id": "main", "native_payload": {"defaultModel": "offline"}})
    envelope_path = store.root / "pi" / "main" / "revisions" / "1" / "envelope.json"
    value = json.loads(envelope_path.read_text())
    value["native_payload"] = {"api_key": "injected"}
    # re-sign the digest the same way the store does, and mirror it into the
    # Ref metadata, so only the credential-shaped-field scan can catch this
    # re-sign with the store's own identity digest (which excludes the
    # plugin-local native-state fields), so only the credential-shaped-field
    # scan can catch the injection.
    from agent_box_harnesses.generic.profile_store import _digest as store_digest

    value["digest"] = store_digest(value)
    envelope_path.write_text(json.dumps(value))
    ref = Ref(RefType.ARTIFACT, "harness-profile", "main", metadata={"harness_type": "pi", "revision": "1", "digest": value["digest"]})
    with pytest.raises(ValueError, match="SECRET_FIELD_FORBIDDEN"):
        store.resolve("agent-box.profile@1", ref)


def test_harness_env_facts_reach_the_plan_environment(tmp_path):
    expected_env = {
        "codex": {"CODEX_HOME": "/runtime/home/.codex"},
        "claude": {"CLAUDE_CONFIG_DIR": "/runtime/home/.claude", "HOME": "/runtime/home"},
        "opencode": {"XDG_CONFIG_HOME": "/runtime/home/.config"},
        "hermes": {"HERMES_HOME": "/runtime/home/.hermes"},
        "pi": {"PI_CODING_AGENT_DIR": "/runtime/home", "PI_OFFLINE": "1"},
    }
    for driver, expected in expected_env.items():
        definition = definition_by_driver(driver)
        executable = resolved_executable_for(tmp_path / driver, definition)
        request, *_ = make_request(tmp_path / driver, definition, executable=executable)
        plan = ADAPTERS[definition.driver].plan(build_start_context(definition, request, executable=executable))
        for key, value in expected.items():
            assert plan.environment.get(key) == value, (driver, key)
