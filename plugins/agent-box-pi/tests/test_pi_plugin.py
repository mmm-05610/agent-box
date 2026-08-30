"""Plugin registration, descriptor, capabilities, and input limit tests."""
from __future__ import annotations

from pathlib import Path

from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration
from agent_box.resource_contracts import PromptFragmentV1, WorkspaceV1
from agent_box.work_core import ExtensionRegistry
from agent_box_tmux import TmuxPaneV1

from agent_box_pi import PiContinuationV1, PiSessionResourceProvider, PiTmuxInteractiveExecutionProvider
from agent_box_pi.plugin import PiPlugin


def test_plugin_registration_and_registry_lookup(tmp_path: Path) -> None:
    plugin = PiPlugin()
    descriptor = plugin.descriptor()
    assert isinstance(descriptor, PluginDescriptor)
    assert descriptor.id == "pi"
    assert descriptor.api_version == 1
    context = PluginContext(
        agent_box_version="1.9.0", agent_box_home=tmp_path, plugin_data_dir=tmp_path / "plugins" / "pi"
    )
    registration = plugin.build(context)
    assert isinstance(registration, PluginRegistration)
    assert PiContinuationV1 in registration.contracts
    assert any(isinstance(item, PiSessionResourceProvider) for item in registration.resource_providers)
    assert any(isinstance(item, PiTmuxInteractiveExecutionProvider) for item in registration.execution_providers)

    registry = ExtensionRegistry()
    registry.register_components(
        contracts=registration.contracts,
        resource_providers=registration.resource_providers,
        execution_providers=registration.execution_providers,
    )
    provider = registry.get("pi")
    assert isinstance(provider, PiTmuxInteractiveExecutionProvider)
    assert registry.get_resource_provider("pi-session").supported_contract_ids == frozenset(
        {PiContinuationV1.contract_id}
    )
    ids = [item.id for item in registry.descriptors()]
    assert "pi" in ids


def test_descriptor_display_capabilities(tmp_path: Path) -> None:
    provider = PiTmuxInteractiveExecutionProvider()
    descriptor = provider.descriptor()
    assert descriptor.id == "pi"
    assert descriptor.display_name == "Pi / DeepSeek"
    assert "deepseek" in descriptor.display_name.lower()

    capabilities = provider.capabilities()
    for operation in ("start", "observe", "attach", "finish", "continuation-input"):
        assert capabilities.get(operation) in {"supported", "emulated"}
    assert capabilities.get("attach-transport") == "tmux"
    assert capabilities.get("completion-signal") == "explicit"
    assert capabilities.get("provider") == "deepseek"


def test_input_limits_are_exact_pi_contract_shape(tmp_path: Path) -> None:
    limits = PiTmuxInteractiveExecutionProvider().input_limits()
    assert limits[WorkspaceV1.contract_id] == (1, 1)
    assert limits[PromptFragmentV1.contract_id] == (1, None)
    assert limits[TmuxPaneV1.contract_id] == (1, 1)
    assert limits[PiContinuationV1.contract_id] == (0, 1)
    assert set(limits) == {
        WorkspaceV1.contract_id,
        PromptFragmentV1.contract_id,
        TmuxPaneV1.contract_id,
        PiContinuationV1.contract_id,
    }


def test_no_agent_box_profile_contract_declared(tmp_path: Path) -> None:
    limits = PiTmuxInteractiveExecutionProvider().input_limits()
    assert "agent-box.profile@1" not in limits