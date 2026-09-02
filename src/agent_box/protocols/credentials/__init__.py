"""Credential protocol pack.

Only opaque, execution-scoped materialization handles cross this boundary.
"""
from .protocol import (
    CONTRACT_ID,
    CredentialMaterializer,
    PreparedSecretMount,
    ResolvedCredential,
)
from agent_box.extensions.contribution import ContributionDescriptor, CatalogContribution

CREDENTIAL_MATERIALIZER_KIND = "agent-box.credentials.materializer@1"
def credential_materializer(component):
    if not isinstance(component, CredentialMaterializer):
        raise TypeError("component is not a CredentialMaterializer")
    return CatalogContribution(ContributionDescriptor(CREDENTIAL_MATERIALIZER_KIND, component.provider_id), component)

__all__ = ["CONTRACT_ID", "CredentialMaterializer", "PreparedSecretMount", "ResolvedCredential", "CREDENTIAL_MATERIALIZER_KIND", "credential_materializer"]
