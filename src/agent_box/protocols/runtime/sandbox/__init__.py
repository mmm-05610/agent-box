"""Optional namespace for Runtime sandbox support types.

The canonical ``agent-box.sandbox@1`` value (``SandboxV1``) and every still
supported sandbox support type now live in
 :mod:`agent_box.protocols.runtime`.  The former ``SandboxTemplateV1`` contract type, the
``SandboxTemplate`` alias and the runnable ``ResolvedSandbox.start()`` /
``SandboxedProcess`` protocol are intentionally gone — there is exactly one
``agent-box.sandbox@1`` Python type, and real execution only ever goes
through ``Sandbox.wrap()``.
"""
from ..protocol import (
    SANDBOX_CONTRACT_ID as CONTRACT_ID,
    ProjectionRejected,
    SandboxAmbiguous,
    SandboxError,
    SandboxRequirements,
    SandboxUnavailable,
    SandboxUnsupported,
    digest_json,
    guest_path,
)

__all__ = [
    "CONTRACT_ID",
    "ProjectionRejected",
    "SandboxAmbiguous",
    "SandboxError",
    "SandboxRequirements",
    "SandboxUnavailable",
    "SandboxUnsupported",
    "digest_json",
    "guest_path",
]
