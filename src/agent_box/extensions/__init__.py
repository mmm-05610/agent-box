"""Public extension API and entry-point loader for third-party integrations."""

from .api import (
    PLUGIN_API_VERSION,
    AgentBoxPlugin,
    PluginContext,
    PluginDescriptor,
    PluginRegistration,
    FinalizationContribution,
    FinalizationContributor,
    ResourceSelection,
    ResourceSelector,
    SelectorField,
    HostControl,
)
from .loader import (
    ENTRY_POINT_GROUP,
    PluginLoadRecord,
    PluginLoadReport,
    load_installed_plugins,
)
from .diagnostics import (
    DiagnosticSeverity,
    PluginDiagnostic,
    PluginDiagnosticReport,
    check_registration_conformance,
)
from .conformance import assert_plugin_conforms, check_plugin_conformance

__all__ = [
    "AgentBoxPlugin",
    "ENTRY_POINT_GROUP",
    "PLUGIN_API_VERSION",
    "PluginContext",
    "PluginDescriptor",
    "PluginLoadRecord",
    "PluginLoadReport",
    "PluginRegistration",
    "FinalizationContribution",
    "FinalizationContributor",
    "ResourceSelection",
    "ResourceSelector",
    "SelectorField",
    "HostControl",
    "load_installed_plugins",
    "DiagnosticSeverity",
    "PluginDiagnostic",
    "PluginDiagnosticReport",
    "check_registration_conformance",
    "assert_plugin_conforms",
    "check_plugin_conformance",
]
