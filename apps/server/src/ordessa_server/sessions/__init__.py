"""Compatibility alias — the implementation moved to `pacthold.service.sessions` (MB-S2c1).

Three-line shims, M1-P-A① alias discipline: submodules are pre-registered in
`sys.modules` before this package name is replaced, so both names resolve to
the **same** module objects and no file ever executes twice.
"""
import sys as _sys

import pacthold.service.sessions as _implementation
from pacthold.service.sessions import queue as _queue
from pacthold.service.sessions import repository as _repository
from pacthold.service.sessions import service as _service

_sys.modules[__name__ + ".queue"] = _queue
_sys.modules[__name__ + ".repository"] = _repository
_sys.modules[__name__ + ".service"] = _service
_sys.modules[__name__] = _implementation
