"""Adapter contracts owned by the brand-neutral core.

The core owns two things here and nothing brand-specific:

  * `base.HarnessAdapter` — the protocol a Harness adapter must satisfy;
  * `generic_cli.GenericCliAdapter` — the one generic implementation.

The brand adapter map (`ADAPTERS`, keyed by `harness_type`) still lives in the
legacy `agent_box_harnesses.adapters` package in this batch, because the eight
per-family adapter modules did not move (approval `M1-P-A1-release.md` §一:
only `adapters/{__init__,base,generic_cli}.py` move, and the legacy
`adapters/__init__.py` is not a re-export target). Keeping the map there means
there is exactly one source for it: `generic/factory.py` imports it from that
package instead of the core re-declaring a second, hand-copied literal.

One consequence, stated plainly: the brand adapter modules import
`GenericCliAdapter` through the legacy `agent_box_harnesses.adapters.generic_cli`
name, which is now an alias of this module, so both paths yield the same class
object.
"""
from .base import HarnessAdapter
from .generic_cli import GenericCliAdapter

__all__ = ["HarnessAdapter", "GenericCliAdapter"]
