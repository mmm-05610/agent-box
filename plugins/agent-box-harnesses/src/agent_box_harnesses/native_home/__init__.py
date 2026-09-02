"""Harnesses-owned Profile Native Home domain.

Ownership boundary (frozen): everything about a Profile's native
environment — policy, storage layout, execution views, reconciliation,
skill installation, project/profile-local inventories — lives in this
package.  The Root never learns any Harness path semantics.
"""
from .failures import (
    INSTALL_JOURNAL_INCOMPLETE, NATIVE_HOME_RECONCILE_AMBIGUOUS,
    NATIVE_HOME_RECONCILE_FAILED, NATIVE_HOME_VIEW_PREPARE_FAILED,
    PROFILE_MUTATION_LEASE_CONFLICT, PROFILE_NATIVE_HOME_DRIFT,
    PROFILE_NATIVE_HOME_MISSING, PROFILE_RECOVERY_REQUIRED,
    PROFILE_REVISION_CONFLICT, PROFILE_TRANSACTION_INCOMPLETE,
    PROJECT_SKILL_DIRTY, PROJECT_SKILL_PROJECTION_CONFLICT,
    PROJECT_SKILL_UNTRUSTED, SKILL_INSTALL_DIGEST_MISMATCH,
    SKILL_INSTALL_DRIFTED, SKILL_INSTALL_INCOMPATIBLE,
    SKILL_INSTALL_RECOVERY_REQUIRED, SKILL_INSTALL_ROLLBACK_FAILED,
    SKILL_INSTALL_TARGET_CONFLICT, SKILL_INSTALL_UNMANAGED_TARGET,
    NativeHomeError,
)
from .layout import ProfileLayout, validate_identity
from .policy import FIVE_POLICIES, NativeHomePolicy, policy_for
from .view import (
    ActiveExecutionRegistry, NativeHomeView, ProfileMutationLease,
    ReconcileReport, generation_of,
)

__all__ = [
    "ActiveExecutionRegistry",
    "FIVE_POLICIES",
    "INSTALL_JOURNAL_INCOMPLETE",
    "NATIVE_HOME_RECONCILE_AMBIGUOUS",
    "NATIVE_HOME_RECONCILE_FAILED",
    "NATIVE_HOME_VIEW_PREPARE_FAILED",
    "NativeHomeError",
    "NativeHomePolicy",
    "NativeHomeView",
    "PROFILE_MUTATION_LEASE_CONFLICT",
    "PROFILE_NATIVE_HOME_DRIFT",
    "PROFILE_NATIVE_HOME_MISSING",
    "PROFILE_RECOVERY_REQUIRED",
    "PROFILE_REVISION_CONFLICT",
    "PROFILE_TRANSACTION_INCOMPLETE",
    "PROJECT_SKILL_DIRTY",
    "PROJECT_SKILL_PROJECTION_CONFLICT",
    "PROJECT_SKILL_UNTRUSTED",
    "ProfileLayout",
    "ProfileMutationLease",
    "ReconcileReport",
    "SKILL_INSTALL_DIGEST_MISMATCH",
    "SKILL_INSTALL_DRIFTED",
    "SKILL_INSTALL_INCOMPATIBLE",
    "SKILL_INSTALL_RECOVERY_REQUIRED",
    "SKILL_INSTALL_ROLLBACK_FAILED",
    "SKILL_INSTALL_TARGET_CONFLICT",
    "SKILL_INSTALL_UNMANAGED_TARGET",
    "generation_of",
    "policy_for",
    "validate_identity",
]