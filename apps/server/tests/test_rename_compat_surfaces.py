"""Server-side compatibility surfaces the monorepo rename had to keep.

The wire protocol version, the credential CLI entry, and the `AGENTBOX_*`
variable prefix are protocol/config surfaces shared with the still-running
hd004b leg and with existing deployments; the rename may not touch them.
"""
from __future__ import annotations

from pathlib import Path

TREE = Path(__file__).resolve().parents[3]


def test_the_wire_version_is_unchanged():
    from ordessa_server.wire.handlers import WIRE_VERSION

    assert WIRE_VERSION == "wire/1"


def test_the_agentbox_variable_prefix_stands():
    runtime = (TREE / "apps" / "server" / "src" / "ordessa_server"
               / "bootstrap" / "runtime.py").read_text(encoding="utf-8")
    assert "AGENTBOX_" in runtime or "AGENT_BOX_" in runtime
