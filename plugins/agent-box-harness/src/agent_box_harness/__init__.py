"""Brand-neutral Harness core (M1-P-A① extraction of `agent-box-harnesses`).

This package holds the parts that never branch on a Harness brand: the registry
that reads declarative data, the generic profile/selector/provider seats, the
generic CLI adapter, the resource helpers and the entry-point facade.

Two Module-level seams still point at the legacy `agent_box_harnesses` package,
because the per-family parts deliberately did not move in this batch
(approval `M1-P-A1-release.md` §一):

  * `generic/factory.py` imports the brand adapter map from
    `agent_box_harnesses.adapters`;
  * `plugin.py` imports Codex's credential source at call time.

`P-B` (one agent per package) moves those parts into
`plugins/agent-box-harness-<agent>/` and replaces both seams with registration.
"""
from .plugin import create_plugin

__all__ = ["create_plugin"]
