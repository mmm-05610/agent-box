from __future__ import annotations

from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration
from .selector import SkillSelector
from .store import SkillStore


class AgentSkillsPlugin:
    def descriptor(self):
        return PluginDescriptor("skills", "Agent Skills", "2.0.0a1", description="Immutable local Agent Skills snapshots", config_namespace="skills")

    def build(self, context: PluginContext):
        store = SkillStore(context.plugin_data_dir)
        return PluginRegistration(resource_providers=(store,), resource_selectors=(SkillSelector(store),))


def create_plugin():
    return AgentSkillsPlugin()
