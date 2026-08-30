from agent_box.extensions import PluginContext
from agent_box_preview_resources.plugin import PreviewResourcesPlugin


def test_preview_resources_has_no_git_components(tmp_path):
    registration = PreviewResourcesPlugin().build(
        PluginContext("1.9.0", tmp_path, tmp_path / "plugins" / "preview-resources")
    )
    assert [p.descriptor().id for p in registration.resource_providers] == [
        "artifact-file"
    ]
    assert [s.id for s in registration.resource_selectors] == [
        "responsibility"
    ]
    assert registration.finalization_contributors == ()
