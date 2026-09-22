"""Official Harness integrations; Codex is the first supported Harness.

Facade (M1-P-A①): the implementation moved to `agent_box_harness`, and the
legacy submodule names in this package are aliases of the core modules.
`create_plugin` is therefore resolved lazily (PEP 562): an eager
`from .plugin import ...` here would close a cycle the extraction created —
`agent_box_harness.plugin` → `entrypoints` → `generic.factory` →
`agent_box_harnesses.adapters` → *this file* → `agent_box_harness.plugin`
(still initialising) → `ImportError: cannot import name 'create_plugin' from
partially initialized module`. Reproduced on any core-first import before this
change; the object returned is still the core's function, not a copy.

This package also remains the owner of the declaration resource
`harnesses.toml`, which `agent_box_harness.registry.loader` reads from here.
Approval: `approvals/M1-PA1-release.md` §一/§二.
"""
__all__ = ["create_plugin"]


def __getattr__(name):
    if name == "create_plugin":
        from .plugin import create_plugin
        return create_plugin
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
