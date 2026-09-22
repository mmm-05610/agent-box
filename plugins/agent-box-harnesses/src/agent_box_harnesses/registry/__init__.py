"""Compatibility alias — the implementation moved to `agent_box_harness.registry` (M1-P-A①).

Every submodule name below is registered in `sys.modules` as the core module
itself before this package name is replaced, so each implementation file has
exactly one module object under both names — no duplicate module state (a
second `definitions.REGISTRY` would be a real defect, not a cosmetic one).
Approval: `approvals/M1-PA1-release.md` §一.
"""
import sys as _sys

from agent_box_harness import registry as _implementation
import agent_box_harness.registry.schema as _m_schema  # noqa: E402  (registered below)
import agent_box_harness.registry.loader as _m_loader  # noqa: E402  (registered below)
import agent_box_harness.registry.definitions as _m_definitions  # noqa: E402  (registered below)
import agent_box_harness.registry.validation as _m_validation  # noqa: E402  (registered below)
import agent_box_harness.registry.capability_claims as _m_capability_claims  # noqa: E402  (registered below)

_sys.modules[__name__ + ".schema"] = _m_schema
_sys.modules[__name__ + ".loader"] = _m_loader
_sys.modules[__name__ + ".definitions"] = _m_definitions
_sys.modules[__name__ + ".validation"] = _m_validation
_sys.modules[__name__ + ".capability_claims"] = _m_capability_claims

_sys.modules[__name__] = _implementation
