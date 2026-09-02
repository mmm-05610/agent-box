from agent_box.extensions import PluginContext
from agent_box_harnesses.plugin import create_codex


def test_quick_launch_uses_generic_harness_registry_contracts(tmp_path):
    registration = create_codex().build(PluginContext("1", tmp_path, tmp_path / "plugins" / "harnesses"))
    provider = registration.execution_providers[0]
    assert provider.descriptor().id == "codex-execution"
    # ordinary Executions carry no SkillRef slot anymore
    assert provider.input_limits() == {}
    assert "codex-profile-selector" in [c.component.id for c in registration.contributions if hasattr(c.component, "id")]
