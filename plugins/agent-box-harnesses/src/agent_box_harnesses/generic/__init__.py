"""Compatibility alias — the implementation moved to `agent_box_harness.generic` (M1-P-A①).

Every submodule name below is registered in `sys.modules` as the core module
itself before this package name is replaced, so each implementation file has
exactly one module object under both names — no duplicate module state (a
second `definitions.REGISTRY` would be a real defect, not a cosmetic one).
Approval: `approvals/M1-PA1-release.md` §一.
"""
import sys as _sys

from agent_box_harness import generic as _implementation
import agent_box_harness.generic.factory as _m_factory  # noqa: E402  (registered below)
import agent_box_harness.generic.profile_store as _m_profile_store  # noqa: E402  (registered below)
import agent_box_harness.generic.profile_manager as _m_profile_manager  # noqa: E402  (registered below)
import agent_box_harness.generic.profile_selector as _m_profile_selector  # noqa: E402  (registered below)
import agent_box_harness.generic.profile_provider as _m_profile_provider  # noqa: E402  (registered below)
import agent_box_harness.generic.execution_provider as _m_execution_provider  # noqa: E402  (registered below)

_sys.modules[__name__ + ".factory"] = _m_factory
_sys.modules[__name__ + ".profile_store"] = _m_profile_store
_sys.modules[__name__ + ".profile_manager"] = _m_profile_manager
_sys.modules[__name__ + ".profile_selector"] = _m_profile_selector
_sys.modules[__name__ + ".profile_provider"] = _m_profile_provider
_sys.modules[__name__ + ".execution_provider"] = _m_execution_provider

_sys.modules[__name__] = _implementation
