"""Compatibility alias — the implementation moved to `agent_box.service.sessions` (MB-S2c1).

Three-line shims, M1-P-A① alias discipline: submodules are pre-registered in
`sys.modules` before this package name is replaced, so both names resolve to
the **same** module objects and no file ever executes twice.
"""
import sys as _sys

import agent_box.service.sessions as _implementation
from agent_box.service.sessions import queue as _queue
from agent_box.service.sessions import repository as _repository
from agent_box.service.sessions import service as _service

_sys.modules[__name__ + ".queue"] = _queue
_sys.modules[__name__ + ".repository"] = _repository
_sys.modules[__name__ + ".service"] = _service
_sys.modules[__name__] = _implementation
