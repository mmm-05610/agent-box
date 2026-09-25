"""Compatibility alias — the implementation moved to `pacthold.service.sessions.service` (MB-S2c1)."""
import sys as _sys

from pacthold.service.sessions import service as _implementation

_sys.modules[__name__] = _implementation
