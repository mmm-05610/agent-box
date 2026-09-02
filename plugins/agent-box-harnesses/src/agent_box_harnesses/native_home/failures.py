"""Typed failure taxonomy for Profile Native Home + Skill installation.

Every failure in this plugin carries one of these typed codes; nothing is
routed by exception string matching.  The codes are stable identifiers that
survive serialization (web layer, diagnostics) and never carry secret
values or host-absolute paths.
"""
from __future__ import annotations

# Profile native home
PROFILE_NATIVE_HOME_MISSING = "PROFILE_NATIVE_HOME_MISSING"
PROFILE_NATIVE_HOME_DRIFT = "PROFILE_NATIVE_HOME_DRIFT"
PROFILE_REVISION_CONFLICT = "PROFILE_REVISION_CONFLICT"
PROFILE_MUTATION_LEASE_CONFLICT = "PROFILE_MUTATION_LEASE_CONFLICT"
PROFILE_TRANSACTION_INCOMPLETE = "PROFILE_TRANSACTION_INCOMPLETE"
PROFILE_RECOVERY_REQUIRED = "PROFILE_RECOVERY_REQUIRED"
PROFILE_POINTER_NOT_FOUND = "PROFILE_POINTER_NOT_FOUND"
PROFILE_POINTER_INVALID = "PROFILE_POINTER_INVALID"
PROFILE_FREEZE_IDENTITY_MISMATCH = "PROFILE_FREEZE_IDENTITY_MISMATCH"
PROFILE_FREEZE_REVISION_MISMATCH = "PROFILE_FREEZE_REVISION_MISMATCH"
PROFILE_FREEZE_DIGEST_MISMATCH = "PROFILE_FREEZE_DIGEST_MISMATCH"
PROFILE_FREEZE_NATIVE_HOME_DRIFT = "PROFILE_FREEZE_NATIVE_HOME_DRIFT"

# Skill installation
SKILL_INSTALL_TARGET_CONFLICT = "SKILL_INSTALL_TARGET_CONFLICT"
SKILL_INSTALL_UNMANAGED_TARGET = "SKILL_INSTALL_UNMANAGED_TARGET"
SKILL_INSTALL_DIGEST_MISMATCH = "SKILL_INSTALL_DIGEST_MISMATCH"
SKILL_INSTALL_INCOMPATIBLE = "SKILL_INSTALL_INCOMPATIBLE"
SKILL_INSTALL_DRIFTED = "SKILL_INSTALL_DRIFTED"
SKILL_INSTALL_ROLLBACK_FAILED = "SKILL_INSTALL_ROLLBACK_FAILED"
SKILL_INSTALL_RECOVERY_REQUIRED = "SKILL_INSTALL_RECOVERY_REQUIRED"

# Project skills
PROJECT_SKILL_UNTRUSTED = "PROJECT_SKILL_UNTRUSTED"
PROJECT_SKILL_DIRTY = "PROJECT_SKILL_DIRTY"
PROJECT_SKILL_PROJECTION_CONFLICT = "PROJECT_SKILL_PROJECTION_CONFLICT"

# Execution native home view
NATIVE_HOME_VIEW_PREPARE_FAILED = "NATIVE_HOME_VIEW_PREPARE_FAILED"
NATIVE_HOME_RECONCILE_FAILED = "NATIVE_HOME_RECONCILE_FAILED"
NATIVE_HOME_RECONCILE_AMBIGUOUS = "NATIVE_HOME_RECONCILE_AMBIGUOUS"

# Tree / policy walking
TREE_FORBIDDEN_KIND = "TREE_FORBIDDEN_KIND"
TREE_PATH_ESCAPE = "TREE_PATH_ESCAPE"

# Transaction journal
INSTALL_JOURNAL_INCOMPLETE = "INSTALL_JOURNAL_INCOMPLETE"


class NativeHomeError(RuntimeError):
    """Base typed failure; carries a stable code and a bounded detail."""

    code = "NATIVE_HOME_ERROR"

    def __init__(self, code: str, detail: str = "") -> None:
        self.code = code
        super().__init__(f"{code}" + (f": {detail}" if detail else ""))


class ProfileNativeHomeError(NativeHomeError):
    pass


class SkillInstallError(NativeHomeError):
    pass


class ProjectSkillError(NativeHomeError):
    pass


class NativeHomeViewError(NativeHomeError):
    pass


PROFILE_MUTATION_COMMITTED = "PROFILE_MUTATION_COMMITTED"


class CommittedMutationError(NativeHomeError):
    """Typed committed outcome: the mutation IS committed even though a
    response-stage failure occurred.  Carries the safe committed identity
    (revision/digest) so callers can distinguish 'committed' from a plain
    failure and retry with exact/CAS semantics instead of guessing.

    This is NOT an ordinary failure: status = COMMITTED.
    """

    code = PROFILE_MUTATION_COMMITTED

    def __init__(self, *, profile_id: str, harness_type: str, committed_revision: int,
                 committed_digest: str, operation: str, diagnostic_code: str = "") -> None:
        self.profile_id = profile_id
        self.harness_type = harness_type
        self.committed_revision = committed_revision
        self.committed_digest = committed_digest
        self.operation = operation
        self.diagnostic_code = diagnostic_code
        detail = f"{harness_type}/{profile_id} r{committed_revision} {operation}"
        super().__init__(self.code, detail)

    def public(self) -> dict[str, object]:
        return {
            "status": "COMMITTED",
            "code": self.code,
            "harness_type": self.harness_type,
            "profile_id": self.profile_id,
            "committed_revision": self.committed_revision,
            "committed_digest": self.committed_digest,
            "operation": self.operation,
            "diagnostic_code": self.diagnostic_code,
        }


__all__ = [
    "INSTALL_JOURNAL_INCOMPLETE",
    "NATIVE_HOME_RECONCILE_AMBIGUOUS",
    "NATIVE_HOME_RECONCILE_FAILED",
    "NATIVE_HOME_VIEW_PREPARE_FAILED",
    "NativeHomeError",
    "NativeHomeViewError",
    "PROFILE_MUTATION_COMMITTED",
    "PROFILE_MUTATION_LEASE_CONFLICT",
    "PROFILE_NATIVE_HOME_DRIFT",
    "PROFILE_NATIVE_HOME_MISSING",
    "PROFILE_FREEZE_DIGEST_MISMATCH",
    "PROFILE_FREEZE_IDENTITY_MISMATCH",
    "PROFILE_FREEZE_NATIVE_HOME_DRIFT",
    "PROFILE_FREEZE_REVISION_MISMATCH",
    "PROFILE_POINTER_INVALID",
    "PROFILE_POINTER_NOT_FOUND",
    "PROFILE_RECOVERY_REQUIRED",
    "PROFILE_REVISION_CONFLICT",
    "PROFILE_TRANSACTION_INCOMPLETE",
    "PROJECT_SKILL_DIRTY",
    "PROJECT_SKILL_PROJECTION_CONFLICT",
    "PROJECT_SKILL_UNTRUSTED",
    "ProfileNativeHomeError",
    "ProjectSkillError",
    "SKILL_INSTALL_DIGEST_MISMATCH",
    "SKILL_INSTALL_DRIFTED",
    "SKILL_INSTALL_INCOMPATIBLE",
    "SKILL_INSTALL_RECOVERY_REQUIRED",
    "SKILL_INSTALL_ROLLBACK_FAILED",
    "SKILL_INSTALL_TARGET_CONFLICT",
    "SKILL_INSTALL_UNMANAGED_TARGET",
    "SkillInstallError",
    "TREE_FORBIDDEN_KIND",
    "TREE_PATH_ESCAPE",
]