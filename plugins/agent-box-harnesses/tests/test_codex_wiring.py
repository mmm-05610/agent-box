from agent_box.extensions import PluginContext
from agent_box_harnesses.plugin import HarnessesPlugin
from agent_box_harnesses.codex.continuation import CodexContinuationResourceProvider
from agent_box.work_core import RefType


def test_official_registration_has_one_codex_provider_and_control(tmp_path):
    plugin = HarnessesPlugin()
    registration = plugin.build(PluginContext("1", tmp_path, tmp_path / "harnesses"))

    assert [p.descriptor().id for p in registration.execution_providers] == ["codex-execution"]
    assert [c.provider_id for c in registration.host_controls] == ["codex-execution"]
    assert registration.resource_providers == ()
    assert registration.contracts == ()
    assert [s.id for s in registration.resource_selectors] == ["codex-profile-selector"]

def test_continuation_resource_provider_accepts_only_governed_native_sources():
    provider = CodexContinuationResourceProvider()
    ref = provider.make_ref("thread-1", "codex-app-server")
    assert ref.type is RefType.SESSION
    assert provider.resolve("agent-box.codex-continuation@1", ref).thread_id == "thread-1"
