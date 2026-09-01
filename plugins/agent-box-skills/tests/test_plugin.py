from agent_box.extensions import PluginContext
from agent_box_skills.plugin import create_plugin


def test_plugin_is_provider_and_selector_only(tmp_path):
    registration = create_plugin().build(PluginContext("2", tmp_path / "home", tmp_path / "data"))
    assert [p.descriptor().id for p in registration.resource_providers] == ["agent-skills"]
    assert [s.id for s in registration.resource_selectors] == ["agent-skill"]
    assert not registration.execution_providers
    assert not registration.host_controls
