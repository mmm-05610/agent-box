"""Provider management — apply only. CRUD is done in ACS."""

from .apply import (
    APPLY_SUPPORTED,
    apply_provider,
    list_profile_providers,
    remove_profile_provider,
)

__all__ = [
    "APPLY_SUPPORTED",
    "apply_provider",
    "list_profile_providers",
    "remove_profile_provider",
]
