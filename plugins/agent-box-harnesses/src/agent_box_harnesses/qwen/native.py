"""Compatibility alias — the implementation moved to `agent_box_harness_qwen.native` (P-QWEN-001)."""
import sys as _sys

from agent_box_harness_qwen import native as _implementation

_sys.modules[__name__] = _implementation
