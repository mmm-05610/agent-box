"""Compatibility alias — the implementation moved to `agent_box.service.sessions.service` (MB-S2c1)."""
import sys as _sys

from agent_box.service.sessions import service as _implementation

_sys.modules[__name__] = _implementation
