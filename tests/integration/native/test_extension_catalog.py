"""Extension Kernel v2 transaction and generic Catalog tests."""
from dataclasses import dataclass
from typing import ClassVar
from pathlib import Path

from agent_box.extensions import (CatalogContribution, ContributionDescriptor,
    ExtensionCatalogBuilder, PluginDescriptor, PluginRegistration)
from agent_box.extensions.bootstrap import build_extension_environment
from agent_box.extensions.loader import load_installed_plugins
from agent_box.protocols.host import RESOURCE_SELECTOR_KIND, resource_selector
from agent_box.work_core import ExtensionRegistry

class EP:
    def __init__(self, name, plugin): self.name=name; self.value=name; self.plugin=plugin; self.dist=None
    def load(self): return lambda: self.plugin

class Selector:
    id="selector"; contract_id="example.contract@1"; title="Example"; fields=(); compatibility=None
    def prepare(self, parameters, *, execution_id): raise AssertionError

class Plugin:
    def __init__(self, pid="example", kind=RESOURCE_SELECTOR_KIND, component_id=None): self.pid=pid; self.kind=kind; self.component_id=component_id or pid
    def descriptor(self): return PluginDescriptor(self.pid, self.pid, "1")
    def build(self, context):
        return PluginRegistration(contributions=(CatalogContribution(ContributionDescriptor(self.kind, self.component_id), object()),))

def test_catalog_accepts_unknown_namespaced_kind_and_tracks_owner():
    builder=ExtensionCatalogBuilder(); c=CatalogContribution(ContributionDescriptor("third.party.thing@9", "x"), object())
    builder.commit(builder.prepare(PluginRegistration(contributions=(c,)), plugin_id="third"))
    catalog=builder.build()
    assert catalog.query("third.party.thing@9", "x") is c.component
    assert catalog.owner_of("third.party.thing@9", "x").plugin_id == "third"

def test_duplicate_contribution_is_transactionally_rejected():
    registry=ExtensionRegistry(); builder=ExtensionCatalogBuilder()
    report=load_installed_plugins(registry, entry_points=(EP("one", Plugin("one", component_id="same")), EP("two", Plugin("two", component_id="same"))), catalog=builder)
    assert [r.status for r in report.records] == ["READY", "FAILED"]
    assert len(builder.build().contributions()) == 1

def test_api_v1_is_incompatible_before_build():
    called=[]
    class V1:
        def descriptor(self): return PluginDescriptor("legacy", "Legacy", "1", api_version=1)
        def build(self, context): called.append(True); return PluginRegistration()
    registry=ExtensionRegistry(); report=load_installed_plugins(registry, entry_points=(EP("legacy", V1()),))
    assert report.records[0].status == "INCOMPATIBLE" and called == []
    assert registry.resource_providers() == ()

def test_profile_library_is_generic_catalog_contribution(tmp_path):
    from agent_box_harnesses.entrypoints import create_codex
    from agent_box.extensions import PluginContext
    registration=create_codex().build(PluginContext("x", tmp_path, tmp_path / "plugin"))
    kinds={item.descriptor.kind for item in registration.contributions}
    assert "agent-box.host.resource-library@1" in kinds
