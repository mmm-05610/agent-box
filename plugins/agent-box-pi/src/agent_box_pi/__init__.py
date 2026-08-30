"""Public values supplied by the agent-box-pi plugin.

The package deliberately exposes a small surface: the native Pi continuity
contract, the accountable Pi ExecutionProvider, and provider-owned resource
resolution.  Host control and selector adapters live in extension modules.
"""

from .config import PiConfigError, PiPluginConfig
from .contract import PiContinuationV1
from .provider import (
    PiObservation,
    PiTmuxHandle,
    PiTmuxInteractiveExecutionProvider,
    build_launch_command,
)
from .resources import PiSessionResourceProvider
from .sessions import PiSessionInfo, PiSessionScanner, read_session_info

__all__ = [
    "PiConfigError",
    "PiContinuationV1",
    "PiObservation",
    "PiPluginConfig",
    "PiSessionInfo",
    "PiSessionResourceProvider",
    "PiSessionScanner",
    "PiTmuxHandle",
    "PiTmuxInteractiveExecutionProvider",
    "build_launch_command",
    "read_session_info",
]
