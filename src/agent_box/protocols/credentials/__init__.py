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

_MATERIALIZERS: dict[str, object] = {}


def register_credential_materializer(materializer_id: str, source: object) -> None:
    if not isinstance(materializer_id, str) or not materializer_id:
        raise ValueError("credential materializer id is required")
    _MATERIALIZERS[materializer_id] = source


def lookup_credential_materializer(materializer_id: str) -> object | None:
    return _MATERIALIZERS.get(materializer_id)

CREDENTIAL_MATERIALIZER_KIND = "agent-box.credentials.materializer@1"
def credential_materializer(component):
    if not isinstance(component, CredentialMaterializer):
        raise TypeError("component is not a CredentialMaterializer")
    return CatalogContribution(ContributionDescriptor(CREDENTIAL_MATERIALIZER_KIND, component.provider_id), component)

__all__ = ["CONTRACT_ID", "CredentialMaterializer", "PreparedSecretMount", "ResolvedCredential", "CREDENTIAL_MATERIALIZER_KIND", "credential_materializer", "register_credential_materializer", "lookup_credential_materializer"]
