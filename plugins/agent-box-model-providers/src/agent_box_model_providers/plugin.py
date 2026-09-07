"""Compatibility-free official model-provider plugin entry point facade."""
from __future__ import annotations

from agent_box.extensions import PluginContext

from .factory import build_registration, descriptor


class _Plugin:
    def descriptor(self):
        return descriptor()

    def build(self, context: PluginContext):
        return build_registration(context)


def create_model_providers():
    return _Plugin()
