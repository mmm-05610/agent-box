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
    assert registration.contracts == ()
    assert registration.resource_providers == ()
    assert len(registration.execution_providers) == 1
    assert "codex-execution" in [c.component.provider_id for c in registration.contributions if hasattr(c.component, "provider_id")]
    provider = registration.execution_providers[0]
    assert provider.descriptor().id == "codex-execution"
    # ordinary Executions no longer carry SkillRef inputs; the provider
    # declares no skill slot
    assert provider.input_limits() == {}
    assert "codex-profile-selector" in [c.component.id for c in registration.contributions if hasattr(c.component, "id")]
    assert not context.plugin_data_dir.exists()


def test_codex_continuation_contract_is_plugin_owned():
    assert CodexContinuationV1.contract_id == "agent-box.codex-continuation@1"
    assert CodexContinuationV1("thread-1").thread_id == "thread-1"
