"""Third-party DeepSeek dsh Harness; runtime ownership remains with composition ports.

Work Order 43. The family currently consists of the production deployment
template only: the managed sidecar chain composes the pinned artifact's
``dsh --profile acp`` entry through the generic ACP registration, so no branded
provider or projection module exists - exactly the property the registry's
``driver`` field and the capability contract assert.

P-A② note (``approvals/PA2-dialect-release.md``, declared in ``goal-H-027``):
``production`` is resolved lazily (PEP 562, same pattern as the M1-P-A① root
facade) because ``production.py`` imports PyYAML at module top (``:50``). The
eager ``from .production import ...`` here made ``import
agent_box_harnesses.dsh`` - and therefore the shared
``native_materialization`` aggregation, which pins this family's empty dialect
table - fail in any environment without PyYAML. Reproduced before this change:
``python3.12 -c "import agent_box_harnesses.dsh"`` -> ``ModuleNotFoundError:
No module named 'yaml'``. After it, the package import needs no YAML;
``dsh.<NAME>`` resolves on first use and returns the very object from
``production`` (same module object, not a copy); ``from agent_box_harnesses.dsh
import production`` keeps working through the standard submodule fallback.
"""
from __future__ import annotations

_LAZY_NAMES = (
    "ADAPTER_ARTIFACT_ENTRY",
    "ADAPTER_PACKAGE",
    "ADAPTER_VERSION",
    "ARTIFACT_NAME",
    "ARTIFACT_TARGET",
    "CREDENTIAL_ENVIRONMENT",
    "CREDENTIAL_KIND",
    "DSH_PROVIDER",
    "DshProductionTemplateError",
    "HARNESS_HOME",
    "MODEL_CONTROL_ID",
    "NATIVE_MODEL_VALUE",
    "OFFICIAL_BASE_URL",
    "OUTPUT_TOKEN_LIMIT",
    "PRODUCT_MODEL_ID",
    "STATE_TARGET",
    "capability_claims",
    "deployment_document",
    "documented_differences",
    "harness_deployment",
    "loopback_settings_document",
    "model_aliases",
    "native_model",
    "projection_files",
    "settings_document",
)

__all__ = list(_LAZY_NAMES)


def __getattr__(name):
    if name in _LAZY_NAMES:
        from . import production as _production
        return getattr(_production, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
