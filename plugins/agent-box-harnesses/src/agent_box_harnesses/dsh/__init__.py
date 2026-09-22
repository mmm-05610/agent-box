"""Compatibility alias — the implementation moved to `agent_box_harness_dsh` (P-B pilot).

Three-line shim, M1-P-A① alias discipline: both names resolve to the **same**
module objects (submodules are pre-registered in `sys.modules` before this
package name is replaced, so no file ever executes twice).
"""
import sys as _sys

import agent_box_harness_dsh as _implementation
from agent_box_harness_dsh import native as _native
from agent_box_harness_dsh import production as _production

_sys.modules[__name__ + ".native"] = _native
_sys.modules[__name__ + ".production"] = _production
_sys.modules[__name__] = _implementation
