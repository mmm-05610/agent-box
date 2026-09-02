"""OpenCode ACP second-mode facts, probe and driver factory.

Per-Harness ACP knowledge stays with the Harness (frozen decision 10): the
generic engine in ``agent-box-acp`` contains neither OpenCode nor any other
Harness identity.  This module owns the OpenCode-specific ACP launch facts,
a bounded offline capability probe, the fidelity-gap declarations and the
session driver factory registered under ``(opencode, acp)``.
"""
from __future__ import annotations

import os
import subprocess
import tempfile
from dataclasses import dataclass, field
from typing import Mapping

from ..session.acp import GenericAcpSessionDriver
from ..session.codec import GenericAcpCodec
from ..session.permission import FailClosedPermissionPolicy
from ..session.spi import SessionCapability

IMPLEMENTATION_NAME = "opencode built-in ACP server (vendor native)"
IMPLEMENTATION_SOURCE = "https://github.com/anomalyco/opencode (packages/opencode/src/acp; in-tree since PR #2947, merged 2025-10-20)"
IMPLEMENTATION_OWNER = "OpenCode / Anomaly (vendor official)"
OFFICIALITY = "vendor_native"
PROTOCOL_VERSION = "1"
# The ACP subcommand was probed locally on 1.18.21; the earliest release that
# carries it is not independently verified (see dossier confidence note).
VERSION_RANGE = ">=1.18.21 (local probe); earlier series untested"
NODE_REQUIREMENT = "bundled runtime (no external node dependency)"

PROBE_TIMEOUT_SECONDS = 10

CAPABILITY_GAPS = (
    "question/elicitation NOT mapped (native question.asked has no ACP surface; turn stall risk)",
    "plan/todo updates NOT mapped",
    "undo/redo, session share, message operations NOT supported over ACP",
    "subagent internal streaming flattened to a single tool call",
    "ACP v2 draft not used",
    "client fs proxy partially used (fs/write_text_file for approved edits is UNSUPPORTED here)",
)


@dataclass(frozen=True)
class OpenCodeAcpModeFacts:
    mode: str = "acp"
    implementation_name: str = IMPLEMENTATION_NAME
    implementation_source: str = IMPLEMENTATION_SOURCE
    implementation_owner: str = IMPLEMENTATION_OWNER
    officiality: str = OFFICIALITY
    protocol_version: str = PROTOCOL_VERSION
    version_range: str = VERSION_RANGE
    node_requirement: str = NODE_REQUIREMENT
    capability_gaps: tuple[str, ...] = field(default_factory=lambda: CAPABILITY_GAPS)


def probe_acp_command(binary: str, *, timeout: float = PROBE_TIMEOUT_SECONDS) -> tuple[bool, str]:
    """Bounded offline probe: does this OpenCode binary support ``acp``?

    Runs ``<binary> acp --version`` with an isolated temp XDG home; no
    credential file is read, no model request is made, and nothing outside
    the temp directory is touched.
    """
    if not binary or not os.path.isfile(binary):
        return False, "executable unresolved"
    with tempfile.TemporaryDirectory(prefix="agent-box-acp-probe-") as tmp:
        env = {
            "HOME": tmp,
            "XDG_CONFIG_HOME": os.path.join(tmp, "config"),
            "XDG_DATA_HOME": os.path.join(tmp, "data"),
            "XDG_CACHE_HOME": os.path.join(tmp, "cache"),
            "XDG_STATE_HOME": os.path.join(tmp, "state"),
            "PATH": "/usr/bin:/bin",
            "NO_COLOR": "1",
        }
        try:
            result = subprocess.run(
                [binary, "acp", "--version"],
                capture_output=True, timeout=timeout, env=env,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            return False, f"probe failed: {type(exc).__name__}"
        if result.returncode != 0:
            return False, f"probe exit {result.returncode}"
        version = (result.stdout or b"").decode("utf-8", errors="replace").strip()[:128]
        return True, version or "version unknown"


class OpenCodeAcpCodec(GenericAcpCodec):
    """OpenCode ACP update mapping; generic mapping plus declared gaps.

    OpenCode's session/update stream follows the standard ACP variants, so
    the generic mapping applies.  Capabilities OpenCode does not expose over
    ACP are declared as gaps — never fabricated.
    """

    id = "opencode-acp-codec@1"
    harness = "opencode"

    def fidelity_notes(self) -> tuple[str, ...]:
        return (
            "OPENCODE_ACP_NO_QUESTION_ELICITATION",
            "OPENCODE_ACP_NO_PLAN_TODO_UPDATES",
            "OPENCODE_ACP_USAGE_COST_AVAILABLE_VIA_UPDATE",
            "OPENCODE_ACP_FS_WRITE_PROXY_UNSUPPORTED",
            "OPENCODE_ACP_UNDO_REDO_UNSUPPORTED",
        )

    def capability_overrides(self) -> Mapping[str, str]:
        return {
            "question": SessionCapability.UNSUPPORTED.value,
            "plan": SessionCapability.UNSUPPORTED.value,
            "usage_cost": SessionCapability.SUPPORTED.value,
            "filesystem_proxy": SessionCapability.UNSUPPORTED.value,
            "undo_redo": SessionCapability.UNSUPPORTED.value,
            "sub_agent_internals": SessionCapability.UNSUPPORTED.value,
        }


def opencode_acp_driver_factory(adapter: object, definition: object) -> GenericAcpSessionDriver:
    """Driver factory registered under ``(opencode, acp)``."""
    return GenericAcpSessionDriver(
        "opencode",
        implementation_id="agent-box-harnesses.opencode-acp@1",
        display_name="OpenCode ACP session driver",
        version="2.0.0a1",
        codec=OpenCodeAcpCodec(),
        policy=FailClosedPermissionPolicy(),
    )


__all__ = [
    "CAPABILITY_GAPS",
    "IMPLEMENTATION_NAME",
    "IMPLEMENTATION_OWNER",
    "IMPLEMENTATION_SOURCE",
    "NODE_REQUIREMENT",
    "OFFICIALITY",
    "OpenCodeAcpCodec",
    "OpenCodeAcpModeFacts",
    "PROBE_TIMEOUT_SECONDS",
    "PROTOCOL_VERSION",
    "VERSION_RANGE",
    "opencode_acp_driver_factory",
    "probe_acp_command",
]