"""Official entry points for the agent-box-model-providers distribution."""
from __future__ import annotations

from .factory import build_registration, descriptor
from .plugin import create_model_providers


def create_plugin():
    return create_model_providers()
