"""qwen production template gates (Work Order 43).

Same contract as the other family template gates; the qwen-specific parts are
the adapter-environment endpoint override (the probe-verified path - the
settings document is intentionally empty) and the runtime-composed native
model value.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

from ordessa_harness.qwen import production


REPO = Path(__file__).resolve().parents[3]
RUNTIME = REPO / "plugins" / "harness" / "runtime"


def test_no_settings_document_is_projected():
    """Env is the connection path; qwen owns its settings document as state.

    First-hand finding: qwen normalizes the settings document at first boot, so
    a read-only projection would fail the harness (EBUSY). The template
    projects no configuration file at all, and nothing credential-shaped
    travels in the environment template.
    """
    assert production.projection_files() == ()
    assert "OPENAI_API_KEY" not in json.dumps(production.ADAPTER_ENVIRONMENT)
    assert not (production.DEPLOY_DIRECTORY / "settings.json").exists()


def test_production_template_pins_the_confirmed_model_and_official_root():
    assert production.PRODUCT_MODEL_ID == "deepseek-flash"
    assert production.NATIVE_MODEL_VALUE == "$runtime|openai|deepseek-flash(openai)"
    assert production.QWEN_PROVIDER == "openai"
    assert production.CREDENTIAL_KIND == "api-key"
    assert production.CREDENTIAL_ENVIRONMENT == "OPENAI_API_KEY"
    assert production.OFFICIAL_BASE_URL == "https://api.deepseek.com"
    assert production.ADAPTER_PACKAGE == "@qwen-code/qwen-code"
    assert production.ADAPTER_VERSION == "0.23.4"
    assert production.ADAPTER_ENVIRONMENT["OPENAI_MODEL"] == "deepseek-flash"
    assert production.ADAPTER_ENVIRONMENT["OPENAI_BASE_URL"] == production.OFFICIAL_BASE_URL
    assert production.ADAPTER_ENVIRONMENT["QWEN_HOME"] == production.HARNESS_HOME


def test_loopback_override_changes_only_the_base_url():
    override = production.loopback_environment("http://127.0.0.1:8080")
    differences = production.documented_differences("http://127.0.0.1:8080")
    assert list(differences) == ["OPENAI_BASE_URL"]
    assert differences["OPENAI_BASE_URL"] == ("https://api.deepseek.com", "http://127.0.0.1:8080")
    assert override["OPENAI_MODEL"] == production.ADAPTER_ENVIRONMENT["OPENAI_MODEL"]
    assert override["QWEN_HOME"] == production.HARNESS_HOME
    # The production template values are never rewritten by producing an override.
    assert production.ADAPTER_ENVIRONMENT["OPENAI_BASE_URL"] == production.OFFICIAL_BASE_URL


def test_loopback_override_refuses_anything_but_a_loopback_url():
    for value in ("https://api.deepseek.com", "http://0.0.0.0:1", "http://192.168.0.1:1", "", None):
        with pytest.raises(production.QwenProductionTemplateError):
            production.loopback_environment(value)


def test_deployment_document_declares_the_managed_chain():
    document = production.deployment_document(
        artifact_token="qwen-runtime",
        tree_digest="sha256:" + "a" * 64,
    )
    assert document["schemaVersion"] == 1
    harness = document["harnesses"][0]
    assert harness["id"] == "qwen"
    assert harness["credentialKind"] == "api-key"
    assert harness["credentialEnvironment"] == "OPENAI_API_KEY"
    assert harness["modelControlId"] == production.MODEL_CONTROL_ID
    assert harness["runtimeArtifactMounts"] == [{
        "token": "qwen-runtime", "target": "/runtime/artifacts/qwen-runtime",
        "treeDigest": "sha256:" + "a" * 64,
    }]
    assert harness["stateProjection"] == {"target": "/runtime/home/.qwen/projects"}
    assert harness["projectionFiles"] == []
    adapter = harness["adapter"]
    assert adapter["command"] == "/usr/bin/node"
    assert adapter["args"] == [
        "/runtime/artifacts/qwen-runtime/node_modules/@qwen-code/qwen-code/cli-entry.js",
        "--acp",
    ]
    assert adapter["environment"]["QWEN_HOME"] == "/runtime/home/.qwen"
    assert adapter["environment"]["OPENAI_BASE_URL"] == "https://api.deepseek.com"
    assert adapter["environment"]["OPENAI_MODEL"] == "deepseek-flash"
    # Nothing test-only may leak into the production default, and no credential
    # material anywhere.
    assert "NODE_OPTIONS" not in adapter["environment"]
    assert "AGENTBOX_EGRESS_AUDIT" not in adapter["environment"]
    assert "OPENAI_API_KEY" not in json.dumps(adapter["environment"])


def test_gate_assets_exist_next_to_the_deployment_template():
    assert production.LOOPBACK_GUARD.is_file()
    assert production.LOOPBACK_GUARD_TARGET.startswith(f"{production.HARNESS_HOME}/")


def test_the_guest_home_is_the_one_isolated_root_and_both_paths_converge():
    assert production.HARNESS_HOME == "/runtime/home/.qwen"
    assert production.ADAPTER_ENVIRONMENT["QWEN_HOME"] == production.HARNESS_HOME
    guest_home = "/runtime/home"
    assert production.HARNESS_HOME == f"{guest_home}/.qwen"
    assert production.STATE_TARGET == f"{production.HARNESS_HOME}/projects"
    assert production.STATE_TARGET.startswith(production.HARNESS_HOME + "/")
    assert not production.LOOPBACK_GUARD_TARGET.startswith(production.STATE_TARGET + "/")


def test_adapter_entry_is_derived_from_the_artifact_target():
    assert production.ADAPTER_ARTIFACT_ENTRY == (
        "/runtime/artifacts/qwen-runtime/node_modules/@qwen-code/qwen-code/cli-entry.js")
    assert production.ADAPTER_ARTIFACT_ENTRY.startswith(production.ARTIFACT_TARGET + "/")
    assert production.ADAPTER_ARTIFACT_ENTRY.endswith(production.ADAPTER_ARTIFACT_RELATIVE_ENTRY)


def test_deployment_document_refuses_an_invalid_artifact_declaration():
    for source, digest in ((("relative/path"), "sha256:" + "a" * 64),
                           ("/srv/qwen", "sha256:short"), ("/srv/qwen", "md5:" + "a" * 32)):
        with pytest.raises(production.QwenProductionTemplateError):
            production.deployment_document(artifact_token=source, tree_digest=digest)


def test_product_model_translates_to_the_native_catalogue_value():
    assert production.native_model("deepseek-flash") == "$runtime|openai|deepseek-flash(openai)"
    assert production.native_model("something-else") == "something-else"
    assert production.native_model(None) is None


def test_capability_claims_derive_from_the_registry():
    claims = production.capability_claims()
    assert claims == {
        "start": True, "observe": True, "finish": True,
        "attach": False, "steer": False, "permissions": False,
        "stream": True, "native_continuation": True,
    }


def test_the_sidecar_glue_owns_the_same_model_mapping():
    """The alias must exist in one place only, and the two must not disagree."""
    script = (
        "import('" + (RUNTIME / "profile_extensions.mjs").as_uri() + "').then((module) =>"
        " process.stdout.write(JSON.stringify({"
        " aliases: module.AGENTBOX_MODEL_ALIASES,"
        " translated: module.resolveNativeModel('qwen', 'deepseek-flash'),"
        " passthrough: module.resolveNativeModel('hermes', 'deepseek-flash'),"
        " profileRegistered: Boolean(module.resolveHarnessProfile('qwen')),"
        " listed: module.registeredHarnessIDs() })))"
    )
    result = subprocess.run(["node", "-e", script], capture_output=True, text=True,
                            timeout=60, cwd=str(REPO))
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["aliases"]["qwen"] == production.model_aliases()
    families = {
        path.parent.name for path in (REPO / "plugins" / "harness" / "src"
                                      / "ordessa_harness").glob("*/production.py")
    }
    assert set(payload["aliases"]) <= families, "an alias without a production template is drift"
    assert payload["translated"] == production.NATIVE_MODEL_VALUE
    assert payload["passthrough"] == "deepseek-flash"
    assert payload["profileRegistered"] is True
    assert "qwen" in payload["listed"]


def test_the_loopback_guard_blocks_non_loopback_destinations(tmp_path):
    """The guard is the enforcement behind "this gate only reached loopback"."""
    audit = tmp_path / "audit"
    script = (
        "const guard = '" + str(production.LOOPBACK_GUARD) + "';"
        "require(guard);"
        "const net = require('node:net');"
        "const results = {};"
        "try { new net.Socket().connect({ host: 'api.deepseek.com', port: 443 });"
        " results.remote = 'allowed'; } catch (error) { results.remote = error.code; }"
        "try { const socket = new net.Socket();"
        " socket.on('error', () => {});"
        " socket.connect({ host: '127.0.0.1', port: 1 });"
        " results.loopback = 'allowed'; } catch (error) { results.loopback = error.code; }"
        "process.stdout.write(JSON.stringify(results));"
    )
    environment = {**os.environ, "AGENTBOX_EGRESS_AUDIT": str(audit)}
    result = subprocess.run(["node", "-e", script], capture_output=True, text=True,
                            timeout=60, env=environment, cwd=str(tmp_path))
    assert result.returncode == 0, result.stderr
    outcome = json.loads(result.stdout)
    assert outcome["remote"] == "AGENTBOX_EGRESS_BLOCKED"
    assert outcome["loopback"] != "AGENTBOX_EGRESS_BLOCKED"
    lines = audit.read_text(encoding="utf-8").splitlines()
    assert any(line.startswith("guard-loaded") for line in lines)
    assert any(line.startswith("denied connect api.deepseek.com:443") for line in lines)


if __name__ == "__main__":  # pragma: no cover
    sys.exit(pytest.main([__file__, "-q"]))
