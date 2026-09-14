"""Pi production template gates.

The template is only trustworthy if it is the *same* configuration Work Order
42-D prepared and if the parts the layers above must never learn stay out of it.
Both are asserted here, including the one place a second copy could hide: the
model id Pi's own catalogue uses, which lives in the sidecar glue that has to
apply it.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

from agent_box_harnesses.pi import production


REPO = Path(__file__).resolve().parents[3]
RUNTIME = REPO / "plugins" / "agent-box-harnesses" / "runtime"


def as_json(value):
    """JSON-normalized comparison: key order and formatting are not identity."""
    return json.loads(json.dumps(value, sort_keys=True))


def test_native_configuration_is_the_prepared_42d_configuration(tmp_path):
    """The checked-in template must equal the 42-D prepared configuration.

    `model-validation-42d.mjs` is where Work Order 42-D prepared the Pi
    configuration. Sweeping a second, hand-written copy into the plugin is
    exactly how the production deployment and the accepted preparation would
    drift apart, so this runs the prepared path in `--dry-run` (with a
    throwaway token file the test creates) and demands equality.
    """
    token = tmp_path / "not-a-real-token"
    token.write_bytes(b"pi-template-test-token")
    token.chmod(0o600)
    result = subprocess.run(
        ["node", str(REPO / "scripts" / "server-round1" / "model-validation-42d.mjs"),
         "--family", "pi", "--secret-file", str(token), "--dry-run"],
        capture_output=True, text=True, timeout=180, cwd=str(REPO),
    )
    assert result.returncode == 0, result.stdout + result.stderr
    prepared = json.loads(result.stdout.strip().splitlines()[-1])
    assert prepared["outcome"] == "PREPARED"
    assert as_json(prepared["config"]) == as_json(production.models_document())
    assert as_json(prepared["settings"]) == as_json(production.settings_document())
    # The template references an environment variable and carries no material.
    assert "pi-template-test-token" not in json.dumps(production.models_document())
    assert "$DEEPSEEK_API_KEY" in json.dumps(production.models_document())


def test_production_template_pins_the_confirmed_model_and_official_root():
    models = production.models_document()
    provider = models["providers"][production.PI_PROVIDER]
    assert production.PRODUCT_MODEL_ID == "deepseek-flash"
    assert production.NATIVE_MODEL_VALUE == "deepseek/deepseek-flash"
    assert provider["baseUrl"] == production.OFFICIAL_BASE_URL == "https://api.deepseek.com"
    assert provider["api"] == "openai-completions"
    assert provider["apiKey"] == "$DEEPSEEK_API_KEY"
    model = provider["models"][0]
    assert model["id"] == production.PRODUCT_MODEL_ID
    assert model["maxTokens"] == production.OUTPUT_TOKEN_LIMIT == 64
    assert model["reasoning"] is False
    assert model["samplingParams"]["thinking"] == {"type": "disabled"}
    settings = production.settings_document()
    assert settings["retry"]["enabled"] is False
    assert settings["retry"]["maxRetries"] == 0
    assert settings["retry"]["provider"]["maxRetries"] == 0


def test_loopback_override_changes_only_the_base_url():
    override = production.loopback_models_document("http://127.0.0.1:8080")
    differences = production.documented_differences("http://127.0.0.1:8080")
    assert list(differences) == [f"providers.{production.PI_PROVIDER}.baseUrl"]
    assert differences[f"providers.{production.PI_PROVIDER}.baseUrl"] == (
        "https://api.deepseek.com", "http://127.0.0.1:8080")
    assert override["providers"][production.PI_PROVIDER]["models"] == (
        production.models_document()["providers"][production.PI_PROVIDER]["models"])
    # The production template on disk is never rewritten by producing an override.
    assert production.models_document()["providers"][production.PI_PROVIDER]["baseUrl"] == (
        production.OFFICIAL_BASE_URL)


def test_loopback_override_refuses_anything_but_a_loopback_url():
    for value in ("https://api.deepseek.com", "http://0.0.0.0:1", "http://192.168.0.1:1", "", None):
        with pytest.raises(production.PiProductionTemplateError):
            production.loopback_models_document(value)


def test_deployment_document_declares_the_managed_chain():
    document = production.deployment_document(
        artifact_source="/srv/agentbox/artifacts/pi-runtime",
        tree_digest="sha256:" + "a" * 64,
    )
    assert document["schemaVersion"] == 1
    assert Path(document["pluginRoot"]) == production.PLUGIN_ROOT
    harness = document["harnesses"][0]
    assert harness["id"] == "pi"
    assert harness["credentialKind"] == "api-key"
    assert harness["credentialEnvironment"] == "DEEPSEEK_API_KEY"
    assert harness["modelControlId"] == production.MODEL_CONTROL_ID
    assert harness["controlOptions"] == {production.MODEL_CONTROL_ID: []}
    assert harness["runtimeArtifactMounts"] == [{
        "source": "/srv/agentbox/artifacts/pi-runtime",
        "target": "/runtime/artifacts/pi-runtime",
        "treeDigest": "sha256:" + "a" * 64,
    }]
    assert harness["stateProjection"] == {"target": "/tmp/agentbox-home/sessions"}
    assert harness["projectionFiles"] == [
        {"source": "deploy/pi/models.json", "target": "/tmp/agentbox-home/models.json"},
        {"source": "deploy/pi/settings.json", "target": "/tmp/agentbox-home/settings.json"},
    ]
    adapter = harness["adapter"]
    assert adapter["command"] == "/usr/bin/node"
    assert adapter["args"] == [
        "/runtime/artifacts/pi-runtime/node_modules/@automatalabs/pi-acp/dist/index.js"]
    assert adapter["environment"]["PI_CODING_AGENT_DIR"] == "/tmp/agentbox-home"
    assert adapter["environment"]["PI_OFFLINE"] == "1"
    # Nothing test-only may leak into the production default: no preloaded
    # guard, no audit path, and no credential material anywhere.
    assert "NODE_OPTIONS" not in adapter["environment"]
    assert "AGENTBOX_EGRESS_AUDIT" not in adapter["environment"]
    assert "DEEPSEEK_API_KEY" not in json.dumps(adapter["environment"])


def test_projection_sources_exist_next_to_the_deployment_template():
    for projection in production.projection_files():
        assert (production.PLUGIN_ROOT / projection["source"]).is_file()
        assert projection["target"].startswith(f"{production.AGENT_HOME}/")
    assert production.LOOPBACK_GUARD.is_file()
    assert production.LOOPBACK_GUARD_TARGET.startswith(f"{production.AGENT_HOME}/")


def test_adapter_entry_is_derived_from_the_artifact_target():
    assert production.ADAPTER_ARTIFACT_ENTRY == (
        "/runtime/artifacts/pi-runtime/node_modules/@automatalabs/pi-acp/dist/index.js")
    assert production.ADAPTER_ARTIFACT_ENTRY.startswith(production.ARTIFACT_TARGET + "/")
    assert production.ADAPTER_ARTIFACT_ENTRY.endswith(production.ADAPTER_ARTIFACT_RELATIVE_ENTRY)
    assert production.STATE_TARGET == f"{production.AGENT_HOME}/sessions"


def test_deployment_document_refuses_an_invalid_artifact_declaration():
    for source, digest in ((("relative/path"), "sha256:" + "a" * 64),
                           ("/srv/pi", "sha256:short"), ("/srv/pi", "md5:" + "a" * 32)):
        with pytest.raises(production.PiProductionTemplateError):
            production.deployment_document(artifact_source=source, tree_digest=digest)


def test_product_model_translates_to_the_native_catalogue_value():
    assert production.native_model("deepseek-flash") == "deepseek/deepseek-flash"
    assert production.native_model("something-else") == "something-else"
    assert production.native_model(None) is None


def test_the_sidecar_glue_owns_the_same_model_mapping():
    """The alias must exist in one place only, and the two must not disagree.

    The deployment template is Python; the translation is applied inside the
    sidecar process, which is JavaScript. Rather than keep two copies in step by
    hand, the JavaScript module is asked for its table and compared. The table
    may hold other families, but it may not hold one without a production
    template here - an alias with no template is drift by construction.
    """
    script = (
        "import('" + (RUNTIME / "profile_extensions.mjs").as_uri() + "').then((module) =>"
        " process.stdout.write(JSON.stringify({"
        " aliases: module.AGENTBOX_MODEL_ALIASES,"
        " translated: module.resolveNativeModel('pi', 'deepseek-flash'),"
        " passthrough: module.resolveNativeModel('hermes', 'deepseek-flash'),"
        " empty: module.resolveNativeModel('pi', undefined) ?? null })))"
    )
    result = subprocess.run(["node", "-e", script], capture_output=True, text=True,
                            timeout=60, cwd=str(REPO))
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["aliases"]["pi"] == production.model_aliases()
    families = {
        path.parent.name for path in (REPO / "plugins" / "agent-box-harnesses" / "src"
                                      / "agent_box_harnesses").glob("*/production.py")
    }
    assert set(payload["aliases"]) <= families, "an alias without a production template is drift"
    assert payload["translated"] == production.NATIVE_MODEL_VALUE
    assert payload["passthrough"] == "deepseek-flash"
    assert payload["empty"] is None


def test_the_sidecar_applies_the_mapping_to_every_model_carrying_operation():
    """Every envelope op that carries a model translates it, on both routes.

    The sidecar has two routes now: the ACP registration (`create`, `prompt`)
    and a deployment-declared native driver (`create`, `open`, `prompt`). A
    model-bearing op on either route that skipped the translation would send the
    product model id to a native catalogue that spells it differently.
    """
    entry = (RUNTIME / "worker-entry.mjs").read_text(encoding="utf-8")
    translation = "resolveNativeModel(registeredProfileID, request.model)"
    head, rest = entry.split("if (driver) {", 1)
    assert translation not in head, "no model-bearing op precedes the route split"
    driver_block, acp_block = rest.split("\n    switch (op) {", 1)
    assert driver_block.count(translation) == 3, "driver create/open/prompt must translate"
    assert acp_block.count(translation) == 2, "ACP create/prompt must translate"
    # No Harness name is branched on inside the sidecar entry point.
    for name in ("pi-acp", "automatalabs", "deepseek"):
        assert name not in entry, f"{name} must not appear in the generic sidecar entry"


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
