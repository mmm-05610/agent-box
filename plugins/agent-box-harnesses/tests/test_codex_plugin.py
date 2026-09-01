from agent_box.extensions import PLUGIN_API_VERSION, PluginContext
from agent_box.resource_contracts import (
    AgentBoxProfileV1,
    PromptFragmentV1,
    WorkspaceV1,
)
from agent_box_harnesses.codex.contracts import CodexContinuationV1
from agent_box_harnesses.plugin import create_plugin


def test_registers_codex_app_server_execution_provider_without_discovery_writes(
    tmp_path,
):
    context = PluginContext("1.9.0", tmp_path, tmp_path / "plugins" / "codex")

    plugin = create_plugin()
    descriptor = plugin.descriptor()
    registration = plugin.build(context)

    assert descriptor.id == "harnesses"
    assert descriptor.api_version == PLUGIN_API_VERSION
    assert registration.contracts == (CodexContinuationV1,)
    assert [p.descriptor().id for p in registration.resource_providers] == ["codex-profile", "codex-continuation", "codex-login"]
    assert len(registration.execution_providers) == 2
    assert [control.provider_id for control in registration.host_controls] == ["codex-app-server", "codex-interactive"]
    providers = {
        provider.descriptor().id: provider
        for provider in registration.execution_providers
    }
    assert set(providers) == {"codex-app-server", "codex-interactive"}
    assert providers["codex-app-server"].input_limits() == {
        WorkspaceV1.contract_id: (1, 1),
        PromptFragmentV1.contract_id: (1, None),
        AgentBoxProfileV1.contract_id: (1, 1),
        CodexContinuationV1.contract_id: (0, 1),
        "agent-box.runtime-host@1": (1, 1),
        "agent-box.sandbox@1": (1, 1),
        "agent-box.terminal-session@1": (1, 1),
        "agent-box.credential@1": (0, 1),
    }
    assert providers["codex-interactive"].input_limits() == {
        WorkspaceV1.contract_id: (1, 1),
        PromptFragmentV1.contract_id: (1, None),
        AgentBoxProfileV1.contract_id: (1, 1),
        CodexContinuationV1.contract_id: (0, 1),
        "agent-box.runtime-host@1": (1, 1),
        "agent-box.sandbox@1": (1, 1),
        "agent-box.terminal-session@1": (1, 1),
        "agent-box.credential@1": (0, 1),
    }
    assert context.plugin_data_dir.is_dir()


def test_codex_continuation_contract_is_plugin_owned():
    assert CodexContinuationV1.contract_id == "agent-box.codex-continuation@1"
    assert CodexContinuationV1("thread-1").thread_id == "thread-1"
