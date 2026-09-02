"""Generic catalog contribution kinds owned by the Harnesses plugin.

The Extension Catalog only stores/queries generic typed contributions; these
kind strings are the ONLY discovery metadata the Web uses to reach a
Harness-owned installer — the Catalog never understands Profile/Skill
semantics and no PluginRegistration gains skill-specific fields.
"""
from __future__ import annotations

# Namespaced typed contribution: one per Harness, discovered by the Web.
SKILL_INSTALLER_KIND = "agent-box.harness.skill-installer@1"
NATIVE_HOME_KIND = "agent-box.harness.native-home@1"

__all__ = ["NATIVE_HOME_KIND", "SKILL_INSTALLER_KIND"]