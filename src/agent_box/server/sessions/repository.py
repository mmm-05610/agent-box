"""Compatibility alias — the implementation moved to `agent_box.service.sessions.repository` (MB-S2c1)."""
import sys as _sys

from agent_box.service.sessions import repository as _implementation

_sys.modules[__name__] = _implementation
