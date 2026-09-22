"""Compatibility alias — the implementation moved to `agent_box_harness.plugin` (M1-P-A①).

The module object below replaces this name in `sys.modules`, so every existing
importer keeps the same module, the same attribute objects (including private
helpers) and the same module-level state. Nothing here is a copy: the new
package holds the only implementation.

Public paths are untouched: the six `agent_box.plugins` entry points and the
`agent_box_harnesses` package resource `harnesses.toml` (which the loader still
reads from this package) keep working unchanged.
Approval: `approvals/M1-PA1-release.md` §一.
"""
import sys as _sys

from agent_box_harness import plugin as _implementation

_sys.modules[__name__] = _implementation
