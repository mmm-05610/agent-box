from agent_box.extensions import PLUGIN_API_VERSION, PluginContext
from agent_box.resource_contracts import (
    AgentBoxProfileV1,
    PromptFragmentV1,
    WorkspaceV1,
)
from agent_box_tmux import TmuxConsoleV1, TmuxPaneV1
from agent_box_codex import CodexContinuationV1, create_plugin


def test_registers_codex_app_server_execution_provider_without_discovery_writes(
    tmp_path,
):
    context = PluginContext("1.9.0", tmp_path, tmp_path / "plugins" / "codex")

    plugin = create_plugin()
    descriptor = plugin.descriptor()
    registration = plugin.build(context)

    assert descriptor.id == "codex"
    assert descriptor.api_version == PLUGIN_API_VERSION
    assert registration.contracts == (CodexContinuationV1,)
    assert registration.resource_providers == ()
    assert len(registration.execution_providers) == 2
    providers = {
        provider.descriptor().id: provider
        for provider in registration.execution_providers
    }
    assert set(providers) == {"codex-app-server", "codex-tmux-interactive"}
    assert providers["codex-app-server"].input_limits() == {
        WorkspaceV1.contract_id: (1, 1),
        PromptFragmentV1.contract_id: (1, None),
        AgentBoxProfileV1.contract_id: (1, 1),
        CodexContinuationV1.contract_id: (0, 1),
    }
    assert providers["codex-tmux-interactive"].input_limits() == {
        WorkspaceV1.contract_id: (1, 1),
        PromptFragmentV1.contract_id: (1, None),
        AgentBoxProfileV1.contract_id: (1, 1),
        CodexContinuationV1.contract_id: (0, 1),
        TmuxConsoleV1.contract_id: (0, 1),
        TmuxPaneV1.contract_id: (0, 1),
    }
    assert not context.plugin_data_dir.exists()


def test_codex_continuation_contract_is_plugin_owned():
    assert CodexContinuationV1.contract_id == "agent-box.codex-continuation@1"
    assert CodexContinuationV1("thread-1").thread_id == "thread-1"
