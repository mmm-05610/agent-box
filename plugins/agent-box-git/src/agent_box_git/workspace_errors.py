"""Git-workspace–specific rejection codes and exception type.

These live inside the git plugin so that domain-specific vocabulary stays
with the domain; the exception still travels through the neutral
CompositionRejected channel (captured by ``except CompositionRejected``).
"""
from __future__ import annotations

from enum import Enum

from agent_box.extensions.runtime_composition import CompositionError, CompositionRejected


class GitWorkspaceErrorCode(str, Enum):
    REPOSITORY_INVALID = "REPOSITORY_INVALID"
    AUTHORITY_MISMATCH = "AUTHORITY_MISMATCH"
    EXACT_REF_MISMATCH = "EXACT_REF_MISMATCH"
    EXECUTION_SCOPE_MISSING = "EXECUTION_SCOPE_MISSING"
    OWNERSHIP_CONFLICT = "OWNERSHIP_CONFLICT"
    WORKSPACE_DRIFT = "WORKSPACE_DRIFT"
    NO_WORKSPACE_CHANGES = "NO_WORKSPACE_CHANGES"
    OUTPUT_REF_CONFLICT = "OUTPUT_REF_CONFLICT"
    UNOWNED_RESOURCE = "UNOWNED_RESOURCE"


class GitWorkspaceRejected(CompositionRejected):
    """Rejection raised by the git workspace provider.

    ``issubclass(GitWorkspaceRejected, CompositionRejected)`` is true, so
    callers catching ``CompositionRejected`` continue to work unchanged.
    The ``.code`` attribute holds a :class:`GitWorkspaceErrorCode` value.
    """

    def __init__(self, code: GitWorkspaceErrorCode, detail: str = "") -> None:
        self.code = code
        CompositionError.__init__(self, f"{code.value}: {detail}" if detail else code.value)
