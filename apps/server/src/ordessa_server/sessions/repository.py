"""Compatibility alias — the implementation moved to `pacthold.service.sessions.repository` (MB-S2c1)."""
import sys as _sys

from pacthold.service.sessions import repository as _implementation

_sys.modules[__name__] = _implementation
