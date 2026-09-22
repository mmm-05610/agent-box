"""Compatibility alias — the implementation moved to `agent_box_harness_dsh.native` (P-B)."""
import sys as _sys

from agent_box_harness_dsh import native as _implementation

_sys.modules[__name__] = _implementation
