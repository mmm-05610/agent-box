"""Hermes production template gates.

The template is only trustworthy if it is the *same* configuration Work Order
42-D prepared, if the parts the layers above must never learn stay out of it,
and if the two measured facts that shape it - where Hermes keeps its session
store, and why no product model control can be declared - are recorded rather
than assumed.
"""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

from agent_box_harnesses.hermes import production


REPO = Path(__file__).resolve().parents[3]
RUNTIME = REPO / "plugins" / "agent-box-harnesses" / "runtime"
DEPLOY = REPO / "plugins" / "agent-box-harnesses" / "deploy" / "hermes"


def as_json(value):
    """JSON-normalized comparison: key order and formatting are not identity."""
    return json.loads(json.dumps(value, sort_keys=True))


def load_bootstrap():
    """Load the artifact bootstrap by path, without writing bytecode beside it.

    The file stays the artifact copy: the builder publishes this exact file into
    the artifact's `site-packages`, so a stray `__pycache__` in `deploy/hermes`
    would be a (harmless but untidy) side effect of testing it.
    """
    previous = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        specification = importlib.util.spec_from_file_location(
            "agentbox_hermes_bootstrap_under_test", DEPLOY / "bootstrap.py",
        )
        module = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = previous
    return module


def test_native_configuration_is_the_prepared_42d_configuration(tmp_path):
    """The checked-in template must equal the 42-D prepared configuration.

    `model-validation-42d.mjs` is where Work Order 42-D prepared the Hermes
    configuration. Sweeping a second, hand-written copy into the plugin is
    exactly how the production deployment and the accepted preparation would
    drift apart, so this runs the prepared path in `--dry-run` (with a
    throwaway token file the test creates) and demands field-by-field equality.
    """
    token = tmp_path / "not-a-real-token"
    token.write_bytes(b"hermes-template-test-token")
    token.chmod(0o600)
    result = subprocess.run(
        ["node", str(REPO / "scripts" / "server-round1" / "model-validation-42d.mjs"),
         "--family", "hermes", "--secret-file", str(token), "--dry-run"],
        capture_output=True, text=True, timeout=180, cwd=str(REPO),
    )
    assert result.returncode == 0, result.stdout + result.stderr
    prepared = json.loads(result.stdout.strip().splitlines()[-1])
    assert prepared["outcome"] == "PREPARED"
    assert as_json(prepared["config"]) == as_json(production.config_document())
    assert production.config_yaml_text() == (
        REPO / "plugins" / "agent-box-harnesses" / "deploy" / "hermes" / "config.yaml"
    ).read_text(encoding="utf-8")
    # The template references an environment variable and carries no material.
    assert "hermes-template-test-token" not in production.config_yaml_text()
    assert "key_env: DEEPSEEK_API_KEY" in production.config_yaml_text()
    assert "sk-" not in production.config_yaml_text()


def test_production_template_pins_the_confirmed_model_and_official_root():
    document = production.config_document()
    provider = document["providers"][production.HERMES_PROVIDER]
    assert production.PRODUCT_MODEL_ID == "deepseek-flash"
    assert production.NATIVE_MODEL_VALUE == "deepseek-flash"
    assert production.HERMES_PROVIDER == "deepseek"
    assert provider["api"] == production.OFFICIAL_BASE_URL == "https://api.deepseek.com"
    assert document["model"]["base_url"] == production.OFFICIAL_BASE_URL
    assert document["model"]["provider"] == production.HERMES_PROVIDER
    assert document["model"]["default"] == production.PRODUCT_MODEL_ID
    assert document["model"]["max_tokens"] == production.OUTPUT_TOKEN_LIMIT == 64
    assert provider["key_env"] == production.CREDENTIAL_ENVIRONMENT == "DEEPSEEK_API_KEY"
    assert provider["extra_body"]["thinking"] == {"type": "disabled"}
    assert provider["transport"] == "chat_completions"


def test_the_retry_bound_is_the_lowest_supported_and_declared():
    """One retry is the floor: Hermes' agent retries once, so two attempts max."""
    document = production.config_document()
    assert document["agent"]["api_max_retries"] == production.API_MAX_RETRIES == 1
    assert production.MAX_PROVIDER_ATTEMPTS == production.API_MAX_RETRIES + 1 == 2
    # The gate's budget is what an endpoint may see for one prompt; it may never
    # be lowered below the declared retry bound.
    assert production.MAX_PROVIDER_ATTEMPTS >= production.API_MAX_RETRIES + 1


def test_loopback_override_changes_only_the_two_endpoint_fields():
    override = production.loopback_config_document("http://127.0.0.1:8080")
    differences = production.documented_differences("http://127.0.0.1:8080")
    assert sorted(differences) == ["model.base_url", f"providers.{production.HERMES_PROVIDER}.api"]
    for before, after in differences.values():
        assert before == "https://api.deepseek.com"
        assert after == "http://127.0.0.1:8080"
    assert override["model"]["max_tokens"] == 64
    assert override["agent"] == production.config_document()["agent"]
    assert override["providers"][production.HERMES_PROVIDER]["models"] == (
        production.config_document()["providers"][production.HERMES_PROVIDER]["models"])
    # Reproducing the override never rewrites the projection source.
    assert production.config_document()["model"]["base_url"] == production.OFFICIAL_BASE_URL
    assert "127.0.0.1" not in production.config_yaml_text()
    rendered = production.loopback_config_yaml("http://127.0.0.1:8080")
    assert "base_url: http://127.0.0.1:8080" in rendered
    assert "api: http://127.0.0.1:8080" in rendered


def test_loopback_override_refuses_anything_but_a_loopback_url():
    for value in ("https://api.deepseek.com", "http://0.0.0.0:1", "http://192.168.0.1:1", "", None):
        with pytest.raises(production.HermesProductionTemplateError):
            production.loopback_config_document(value)


def test_deployment_document_declares_the_managed_chain():
    document = production.deployment_document(
        artifact_source="/srv/agentbox/artifacts/hermes-runtime",
        tree_digest="sha256:" + "a" * 64,
    )
    assert document["schemaVersion"] == 1
    assert Path(document["pluginRoot"]) == production.PLUGIN_ROOT
    harness = document["harnesses"][0]
    assert harness["id"] == "hermes"
    assert harness["credentialKind"] == "api-key"
    assert harness["credentialEnvironment"] == "DEEPSEEK_API_KEY"
    # Measured: Hermes 0.19 advertises no ACP `configOptions`, and the pinned
    # bridge can only select a model through that list, so a declared model
    # control would make every round fail before any provider request. The
    # production template therefore declares none.
    assert production.MODEL_CONTROL_ID is None
    assert "modelControlId" not in harness
    assert "controlOptions" not in harness
    assert harness["runtimeArtifactMounts"] == [{
        "source": "/srv/agentbox/artifacts/hermes-runtime",
        "target": "/runtime/artifacts/hermes-runtime",
        "treeDigest": "sha256:" + "a" * 64,
    }]
    assert harness["stateProjection"] == {"target": "/tmp/agentbox-home/state"}
    assert harness["stateProjection"]["target"] == production.STATE_TARGET
    assert harness["projectionFiles"] == [
        {"source": "deploy/hermes/config.yaml", "target": "/tmp/agentbox-home/config.yaml"},
    ]
    # The projected configuration sits one level above the home Hermes reads it
    # from, and the artifact bootstrap is what closes that gap.
    assert harness["projectionFiles"][0]["target"] == production.CONFIG_TARGET
    assert Path(harness["projectionFiles"][0]["target"]).parent == Path(production.AGENT_HOME)
    assert Path(production.STATE_TARGET).parent == Path(production.AGENT_HOME)
    adapter = harness["adapter"]
    assert adapter["command"] == "/usr/bin/python3"
    assert adapter["args"] == ["-m", "hermes_cli.main", "acp"]
    assert production.ENTRY_RELATIVE == production.ENTRY_MODULE.replace(".", "/") + ".py"
    environment = adapter["environment"]
    assert environment["PYTHONPATH"] == (
        "/runtime/artifacts/hermes-runtime/site-packages")
    assert environment["PYTHONPATH"] == production.ARTIFACT_SITE_PACKAGES
    assert environment["HERMES_HOME"] == production.STATE_TARGET
    assert environment["PYTHONNOUSERSITE"] == "1"
    assert environment["PYTHONDONTWRITEBYTECODE"] == "1"
    assert environment["HERMES_IGNORE_USER_CONFIG"] == "1"
    assert environment["HERMES_IGNORE_RULES"] == "1"
    assert environment["HERMES_SKIP_NODE_BOOTSTRAP"] == "1"
    assert environment["HERMES_MAX_ITERATIONS"] == "1"
    # The output ceiling is not an environment key: the Server's deployment
    # validation refuses credential-shaped keys and `HERMES_MAX_TOKENS` matches
    # its `TOKEN` pattern. It is declared in the projected configuration
    # (`model.max_tokens`) and asserted on the wire by the chain gate.
    assert "HERMES_MAX_TOKENS" not in environment
    assert production.config_document()["model"]["max_tokens"] == production.OUTPUT_TOKEN_LIMIT
    assert not any("TOKEN" in key for key in environment)
    # Nothing test-only may leak into the production default: no preloaded
    # guard, no audit paths, no credential material anywhere.
    assert "DEEPSEEK_API_KEY" not in json.dumps(environment)
    for key in ("NODE_OPTIONS", "AGENTBOX_EGRESS_AUDIT", "AGENTBOX_ACP_AUDIT"):
        assert key not in environment
    assert not any(key.startswith("AGENTBOX_") for key in environment)
    rendered = json.dumps(document)
    assert "127.0.0.1" not in rendered
    assert "loopback" not in rendered
    assert "sitecustomize" not in rendered


def test_a_model_control_can_only_be_declared_explicitly_for_a_gate():
    """The gate needs the declared-control variant to demonstrate the refusal."""
    variant = production.deployment_document(
        artifact_source="/srv/agentbox/artifacts/hermes-runtime",
        tree_digest="sha256:" + "a" * 64,
        model_control_id="model",
    )
    assert variant["harnesses"][0]["modelControlId"] == "model"
    assert variant["harnesses"][0]["controlOptions"] == {"model": []}
    # The production default is unaffected by producing the variant.
    assert "modelControlId" not in production.deployment_document(
        artifact_source="/srv/agentbox/artifacts/hermes-runtime",
        tree_digest="sha256:" + "a" * 64,
    )["harnesses"][0]


def test_projection_and_overlay_files_exist_next_to_the_deployment_template():
    for projection in production.projection_files():
        assert (production.PLUGIN_ROOT / projection["source"]).is_file()
        assert Path(projection["target"]).parent == Path(production.AGENT_HOME)
    assert production.CONFIG_TEMPLATE.is_file()
    assert production.LOOPBACK_GUARD.is_file()
    assert production.LOOPBACK_GUARD_TARGET == f"{production.AGENT_HOME}/sitecustomize.py"
    assert (DEPLOY / "bootstrap.py").is_file()
    assert (DEPLOY / "sitecustomize.py").is_file()
    # The artifact publishes the same two names the deployment relies on.
    assert production.BOOTSTRAP_MODULE == "agentbox_hermes_bootstrap"
    assert (DEPLOY / "bootstrap.py").read_text(encoding="utf-8").count("def apply()") == 1


def test_deployment_document_refuses_an_invalid_artifact_declaration():
    for source, digest in (("relative/path", "sha256:" + "a" * 64),
                           ("/srv/hermes", "sha256:short"), ("/srv/hermes", "md5:" + "a" * 32)):
        with pytest.raises(production.HermesProductionTemplateError):
            production.deployment_document(artifact_source=source, tree_digest=digest)


def test_product_model_passes_through_and_the_sidecar_glue_has_no_alias():
    """The alias must exist in one place only - and for Hermes there is none.

    The deployment template is Python; the translation (if any) is applied inside
    the sidecar process, which is JavaScript. Hermes resolves its model in its own
    catalogue under the same spelling, so both sides must agree that there is
    nothing to translate.
    """
    assert production.model_aliases() == {}
    assert production.native_model("deepseek-flash") == "deepseek-flash"
    script = (
        "import('" + (RUNTIME / "profile_extensions.mjs").as_uri() + "').then((module) =>"
        " process.stdout.write(JSON.stringify({"
        " aliases: module.AGENTBOX_MODEL_ALIASES,"
        " hermesAlias: module.AGENTBOX_MODEL_ALIASES.hermes ?? null,"
        " translated: module.resolveNativeModel('hermes', 'deepseek-flash'),"
        " empty: module.resolveNativeModel('hermes', undefined) ?? null })))"
    )
    result = subprocess.run(["node", "-e", script], capture_output=True, text=True,
                            timeout=60, cwd=str(REPO))
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["hermesAlias"] is None
    assert payload["translated"] == production.PRODUCT_MODEL_ID
    assert payload["empty"] is None
    assert "hermes" not in payload["aliases"]
    assert "pi" in payload["aliases"], "the alias mechanism must still be table-driven"


def test_only_one_configuration_copy_exists_in_the_plugin():
    """No second, drifting model configuration may live next to the template."""
    present = {item.name for item in DEPLOY.iterdir() if item.name != "__pycache__"}
    assert present == {"config.yaml", "bootstrap.py", "sitecustomize.py", "loopback-guard.py"}
    package_directory = Path(production.__file__).parent
    for item in package_directory.iterdir():
        assert item.suffix not in {".yaml", ".json", ".yml"}, (
            f"{item} looks like a second configuration copy; the template owns deploy/hermes/config.yaml")
    assert production.CONFIG_TEMPLATE.parent == DEPLOY


def test_the_bootstrap_materializes_the_projected_configuration(tmp_path):
    """The artifact bootstrap copies the projection into the persisted home."""
    module = load_bootstrap()
    assert module.INBOX == production.AGENT_HOME
    assert module.SOURCE_NAME == production.CONFIG_NAME
    inbox = tmp_path / "inbox"
    inbox.mkdir()
    (inbox / "config.yaml").write_text(production.config_yaml_text(), encoding="utf-8")
    state = tmp_path / "state"
    module.INBOX = str(inbox)
    os.environ["HERMES_HOME"] = str(state)
    try:
        outcome = module.apply()
        assert outcome["config"] == "written"
        target = state / "config.yaml"
        assert target.read_text(encoding="utf-8") == production.config_yaml_text()
        assert target.read_bytes() == production.CONFIG_TEMPLATE.read_bytes()
        # Idempotent, and it repairs a home whose configuration drifted.
        assert module.apply()["config"] == "unchanged"
        target.write_text("model: {}\n", encoding="utf-8")
        assert module.apply()["config"] == "written"
        assert target.read_text(encoding="utf-8") == production.config_yaml_text()
        # A home that is the inbox itself cannot hold the persisted store.
        os.environ["HERMES_HOME"] = str(inbox)
        with pytest.raises(module.HermesBootstrapError):
            module.apply()
        # Neither can a deployment without a home or without the projection.
        os.environ.pop("HERMES_HOME", None)
        with pytest.raises(module.HermesBootstrapError):
            module.apply()
        os.environ["HERMES_HOME"] = str(state)
        (inbox / "config.yaml").unlink()
        with pytest.raises(module.HermesBootstrapError):
            module.apply()
        (inbox / "config.yaml").write_text("", encoding="utf-8")
        with pytest.raises(module.HermesBootstrapError):
            module.apply()
    finally:
        os.environ.pop("HERMES_HOME", None)


def test_the_artifact_sitecustomize_fails_loudly_and_delegates():
    """A managed Hermes must never start without its reviewed configuration."""
    text = (DEPLOY / "sitecustomize.py").read_text(encoding="utf-8")
    assert "import agentbox_hermes_bootstrap" in text
    assert "SystemExit" in text
    # CPython swallows ordinary exceptions from sitecustomize, so the failure
    # must be a SystemExit to actually stop the adapter process.
    assert "raise SystemExit" in text


def test_the_gate_guard_is_test_only_and_delegates_to_the_bootstrap():
    guard = production.LOOPBACK_GUARD.read_text(encoding="utf-8")
    assert "import agentbox_hermes_bootstrap" in guard
    assert "AGENTBOX_EGRESS_AUDIT" in guard
    assert "AGENTBOX_ACP_AUDIT" in guard
    assert "self-test-ok" in guard
    # It is preloaded by the gate through PYTHONPATH only: the production
    # environment names neither the guard nor its audit sinks.
    environment = production.ADAPTER_ENVIRONMENT
    assert not any("AGENTBOX" in key for key in environment)
    assert production.LOOPBACK_GUARD_TARGET not in json.dumps(environment)
    assert production.LOOPBACK_GUARD_TARGET not in json.dumps(production.projection_files())


def test_the_gate_can_build_an_artifact_only_from_a_built_artifact_endpoint():
    """The gate needs the entry point inside the artifact, not a host path."""
    assert production.ARTIFACT_SITE_PACKAGES.startswith(production.ARTIFACT_TARGET + "/")
    assert production.ADAPTER_ARGS[0] == "-m"
    assert production.ADAPTER_ARGS[1] == production.ENTRY_MODULE
    assert production.ADAPTER_ARGS[-1] == "acp"
    assert production.ADAPTER_COMMAND == "/usr/bin/python3"


if __name__ == "__main__":  # pragma: no cover
    sys.exit(pytest.main([__file__, "-q"]))
