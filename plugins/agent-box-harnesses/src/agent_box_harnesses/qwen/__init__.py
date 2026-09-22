"""Compatibility alias — the implementation moved to `agent_box_harness_qwen` (P-QWEN-001).

Three-line shims, M1-P-A① alias discipline: submodules are pre-registered in
`sys.modules` before this package name is replaced, so both names resolve to
the **same** module objects and no file ever executes twice.
"""
import sys as _sys

import agent_box_harness_qwen as _implementation
from agent_box_harness_qwen import native as _native
from agent_box_harness_qwen import production as _production

_sys.modules[__name__ + ".native"] = _native
_sys.modules[__name__ + ".production"] = _production
_sys.modules[__name__] = _implementation
