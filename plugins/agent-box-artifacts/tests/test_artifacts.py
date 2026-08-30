from agent_box.resource_contracts import PromptFragmentV1
from agent_box_artifacts.plugin import ArtifactsPlugin
from agent_box.extensions import PluginContext


def test_artifact_registration_and_exact_content(tmp_path):
    registration = ArtifactsPlugin().build(PluginContext("1", tmp_path, tmp_path / "artifacts"))
    provider = registration.resource_providers[0]
    path = tmp_path / "brief.md"
    path.write_text("fixed\n", encoding="utf-8")
    ref = provider.make_ref(path, title="Brief")
    assert provider.descriptor().id == "artifact-file"
    assert provider.resolve(PromptFragmentV1.contract_id, ref).content == "fixed\n"
    path.write_text("changed\n", encoding="utf-8")
    try:
        provider.resolve(PromptFragmentV1.contract_id, ref)
    except ValueError as exc:
        assert "digest" in str(exc)
    else:
        raise AssertionError("changed artifact must fail closed")
