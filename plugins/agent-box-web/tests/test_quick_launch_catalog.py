from agent_box.extensions import PluginContext
from agent_box_harnesses.plugin import create_codex


def test_quick_launch_uses_generic_harness_registry_contracts(tmp_path):
    registration = create_codex().build(PluginContext("1", tmp_path, tmp_path / "plugins" / "harnesses"))
    provider = registration.execution_providers[0]
    assert provider.descriptor().id == "codex-execution"
    # the dispatch input surface is registry-declared; ordinary Executions
    # still carry NO SkillRef slot (skills reach the harness through the
    # profile's native home and the workspace)
    limits = provider.input_limits()
    assert "agent-box.skill@1" not in limits
    assert limits["agent-box.workspace@1"] == (1, 1)
    assert limits["agent-box.prompt-fragment@1"] == (1, 32)
    assert limits["agent-box.codex-continuation@1"] == (0, 1)
    assert "codex-profile-selector" in [c.component.id for c in registration.contributions if hasattr(c.component, "id")]
