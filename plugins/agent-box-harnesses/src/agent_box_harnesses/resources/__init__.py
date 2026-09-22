"""Compatibility alias — the implementation moved to `agent_box_harness.resources` (M1-P-A①).

Every submodule name below is registered in `sys.modules` as the core module
itself before this package name is replaced, so each implementation file has
exactly one module object under both names — no duplicate module state (a
second `definitions.REGISTRY` would be a real defect, not a cosmetic one).
Approval: `approvals/M1-PA1-release.md` §一.
"""
import sys as _sys

from agent_box_harness import resources as _implementation
import agent_box_harness.resources.executable as _m_executable  # noqa: E402  (registered below)
import agent_box_harness.resources.profile_codec as _m_profile_codec  # noqa: E402  (registered below)

_sys.modules[__name__ + ".executable"] = _m_executable
_sys.modules[__name__ + ".profile_codec"] = _m_profile_codec

_sys.modules[__name__] = _implementation
