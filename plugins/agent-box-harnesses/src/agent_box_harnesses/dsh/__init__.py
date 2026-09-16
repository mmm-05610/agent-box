"""Third-party DeepSeek dsh Harness; runtime ownership remains with composition ports.

Work Order 43. The family currently consists of the production deployment
template only: the managed sidecar chain composes the pinned artifact's
`dsh --profile acp` entry through the generic ACP registration, so no branded
provider or projection module exists - exactly the property the registry's
`driver` field and the capability contract assert.
"""
from .production import (
    ADAPTER_ARTIFACT_ENTRY,
    ADAPTER_PACKAGE,
    ADAPTER_VERSION,
    ARTIFACT_NAME,
    ARTIFACT_TARGET,
    CREDENTIAL_ENVIRONMENT,
    CREDENTIAL_KIND,
    DSH_PROVIDER,
    DshProductionTemplateError,
    HARNESS_HOME,
    MODEL_CONTROL_ID,
    NATIVE_MODEL_VALUE,
    OFFICIAL_BASE_URL,
    OUTPUT_TOKEN_LIMIT,
    PRODUCT_MODEL_ID,
    STATE_TARGET,
    capability_claims,
    deployment_document,
    documented_differences,
    harness_deployment,
    loopback_settings_document,
    model_aliases,
    native_model,
    projection_files,
    settings_document,
)

__all__ = [
    "ADAPTER_ARTIFACT_ENTRY", "ADAPTER_PACKAGE", "ADAPTER_VERSION", "ARTIFACT_NAME",
    "ARTIFACT_TARGET", "CREDENTIAL_ENVIRONMENT", "CREDENTIAL_KIND", "DSH_PROVIDER",
    "DshProductionTemplateError", "HARNESS_HOME", "MODEL_CONTROL_ID",
    "NATIVE_MODEL_VALUE", "OFFICIAL_BASE_URL", "OUTPUT_TOKEN_LIMIT", "PRODUCT_MODEL_ID",
    "STATE_TARGET", "capability_claims", "deployment_document",
    "documented_differences", "harness_deployment", "loopback_settings_document",
    "model_aliases", "native_model", "projection_files", "settings_document",
]
