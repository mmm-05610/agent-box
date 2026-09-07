"""Harness-scoped model provider authority plugin.

Two layers, per the user's model:

- :mod:`.accounts` — the user-view ProviderAccount store (never enters
  Execution Bindings; proposes derived config changes only);
- :mod:`.configs` — the harness-scoped HarnessProviderConfig store whose
  immutable revisions are the Execution-Binding authority;
- :mod:`.credentials` — the write-only credential authority plus
  execution-scoped secret staging;
- :mod:`.probe` — the bounded probe runner (migrated unchanged);
- :mod:`.references` — the deletion guard's turn-Binding reference scan;
- :mod:`.resource` — the registry-facing resource providers and the
  plain accessors the studio REST layer calls through the registry.
"""
from __future__ import annotations

from .accounts import ProviderAccountStore
from .configs import PROVIDER_ID, HarnessProviderConfigStore
from .credentials import CredentialAuthority
from .errors import ProviderAuthorityError
from .factory import build_registration, descriptor
from .plugin import create_model_providers
from .references import find_config_references
from .resource import (
    GatewayCredentialSource,
    HarnessModelProviderConfigResolver,
    HarnessModelProviderLibrary,
    gateway_credential_source,
    model_provider_config_store,
    provider_account_store,
)

__all__ = [
    "GatewayCredentialSource",
    "HarnessModelProviderConfigResolver",
    "HarnessModelProviderLibrary",
    "HarnessProviderConfigStore",
    "PROVIDER_ID",
    "ProviderAccountStore",
    "ProviderAuthorityError",
    "CredentialAuthority",
    "build_registration",
    "create_model_providers",
    "descriptor",
    "find_config_references",
    "gateway_credential_source",
    "model_provider_config_store",
    "provider_account_store",
]
