from agent_box.extensions import PLUGIN_API_VERSION, PluginContext
from agent_box_harnesses.codex.contracts import CodexContinuationV1
from agent_box_harnesses.plugin import create_plugin


def test_registers_codex_app_server_execution_provider_without_discovery_writes(
    tmp_path,
):
    context = PluginContext("1.9.0", tmp_path, tmp_path / "plugins" / "codex")

    plugin = create_plugin()
    descriptor = plugin.descriptor()
    registration = plugin.build(context)

    assert descriptor.id == "codex"
    assert descriptor.api_version == PLUGIN_API_VERSION
    # the harness-owned native continuation contract ships with the plugin
    assert registration.contracts == (CodexContinuationV1,)
    # the continuation provider AND the locator-only credential source (the
    # Registry resolver for the credential contract) ship with the plugin
    assert [p.descriptor().id for p in registration.resource_providers] == [
        "codex-continuation",
        "codex-login",
    ]
    assert len(registration.execution_providers) == 1
    assert "codex-execution" in [c.component.provider_id for c in registration.contributions if hasattr(c.component, "provider_id")]
    provider = registration.execution_providers[0]
    assert provider.descriptor().id == "codex-execution"
    # the formal dispatch input surface is registry-declared, not empty
    limits = provider.input_limits()
    assert limits["agent-box.workspace@1"] == (1, 1)
    assert limits["agent-box.prompt-fragment@1"] == (1, 32)
    assert limits["agent-box.codex-continuation@1"] == (0, 1)
    assert "codex-profile-selector" in [c.component.id for c in registration.contributions if hasattr(c.component, "id")]
    assert not context.plugin_data_dir.exists()


def test_codex_continuation_contract_is_plugin_owned():
    assert CodexContinuationV1.contract_id == "agent-box.codex-continuation@1"
    assert CodexContinuationV1("thread-1").thread_id == "thread-1"
