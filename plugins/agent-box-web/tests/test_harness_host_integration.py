from pathlib import Path

from agent_box.extensions import PluginContext
from agent_box_harnesses.plugin import HarnessesPlugin


def test_web_boundary_uses_catalog_credential_materializer_and_terminal_contracts(tmp_path: Path):
    context = PluginContext("1", tmp_path / "home", tmp_path / "plugins" / "harnesses")
    registration = HarnessesPlugin().build(context)
    assert registration.execution_providers
    assert any(c.descriptor.kind == "agent-box.credentials.materializer@1" for c in registration.contributions)
    manager = next(c.component for c in registration.contributions if c.descriptor.kind == "agent-box.host.resource-library@1")
    assert not hasattr(manager, "credentials")
    assert all("tmux" not in provider.provider_id for provider in registration.resource_providers)
