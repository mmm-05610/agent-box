"""Plugin factory for the model-provider authority (mirrors the harnesses
plugin's factory pattern: one registration, Root contract resolved not
re-declared, stores reachable as ResourceProviders + one Resource Library
contribution).
"""
from __future__ import annotations

from pathlib import Path

from agent_box.extensions import PluginDescriptor, PluginRegistration
from agent_box.protocols.host import resource_library
from agent_box.resource_contracts import CredentialRefV1, HarnessModelProviderV1

from .accounts import ProviderAccountStore
from .configs import HarnessProviderConfigStore
from .resource import (
    GatewayCredentialSource,
    HarnessModelProviderConfigResolver,
    HarnessModelProviderLibrary,
)

# The Root-built-in contract this plugin RESOLVES (pre-seeded in every
# ExtensionRegistry from CONTRACT_TYPES; re-declaring an already-known
# contract id is fail-closed by design — the skills plugin sets the same
# precedent for agent-box.agent-skill@1).
ROOT_CONTRACTS = (HarnessModelProviderV1,)


def _plugin_contracts() -> tuple[type, ...]:
    """Contracts this dist declares, minus anything Root already seeds.

    ``agent-box.credential@1`` is not part of root CONTRACT_TYPES, so this
    plugin declares it exactly once before its gateway resource provider
    (filtered dynamically so a future root seeding of the same id can
    never hard-break the declaration).
    """
    from agent_box.resource_contracts import CONTRACT_TYPES

    declared = (CredentialRefV1,)
    return tuple(
        contract
        for contract in declared
        if getattr(contract, "contract_id", None) not in CONTRACT_TYPES
    )


PLUGIN_CONTRACTS = _plugin_contracts()

DESCRIPTOR_ID = "model-providers"


def build_registration(context) -> PluginRegistration:
    home = Path(context.agent_box_home)
    # The shared provider is deliberately the only component which owns
    # persistence: one config store + one account store per home, and one
    # credential authority shared by both consumers.
    config_store = HarnessProviderConfigStore(home)
    account_store = ProviderAccountStore(home)
    resolver = HarnessModelProviderConfigResolver(config_store, account_store)
    gateway = GatewayCredentialSource(
        authority=config_store.credentials, config_store=config_store
    )
    # Register the gateway credential materializer in the provider-neutral
    # SPI: the harnesses plugin looks it up lazily at execution start (no
    # imports between plugins).
    from agent_box.protocols.credentials import (
        register_credential_materializer,
    )

    register_credential_materializer("gateway-provider", gateway)

    return PluginRegistration(
        contracts=PLUGIN_CONTRACTS,
        resource_providers=(resolver, gateway),
        contributions=(
            resource_library(HarnessModelProviderLibrary(resolver)),
        ),
    )


def descriptor() -> PluginDescriptor:
    return PluginDescriptor(
        DESCRIPTOR_ID,
        "Model Providers",
        "2.0.0a1",
        description="Harness-scoped model provider authority (accounts + immutable config revisions)",
        config_namespace="model-providers",
    )
