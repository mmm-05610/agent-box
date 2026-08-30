from agent_box.extensions import PluginContext
from agent_box_artifacts.plugin import ArtifactsPlugin


def test_artifacts_plugin_has_one_provider_and_stable_selector(tmp_path):
    registration = ArtifactsPlugin().build(
        PluginContext("1", tmp_path, tmp_path / "artifacts")
    )
    assert [p.descriptor().id for p in registration.resource_providers] == ["artifact-file"]
    assert [s.id for s in registration.resource_selectors] == ["responsibility"]
