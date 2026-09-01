"""Architecture Repair Phase 3: canonical ExtensionCatalog / Environment.

Covers catalog immutability and queries, ownership provenance, transactional
loading (no orphans, duplicates fail closed for every contribution kind),
materializer registration and discovery, explicit registry binding, the
compatibility wrapper, and Web boundary scans.
"""
from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import ClassVar

import pytest

import agent_box.extensions as extensions
from agent_box.extensions.bootstrap import (
    build_extension_environment,
    build_extension_registry,
    register_shared_runtime_contracts,
)
from agent_box.extensions.catalog import (
    CREDENTIAL_MATERIALIZER,
    ExtensionCatalog,
    ExtensionCatalogBuilder,
    ExtensionContribution,
)
from agent_box.extensions import PluginDescriptor, PluginRegistration
from agent_box.extensions.credentials import CredentialMaterializer
from agent_box.resource_contracts import CredentialRefV1
from agent_box.work_core import ExtensionRegistry, ProviderDescriptor
from agent_box.extensions.loader import load_installed_plugins

REPO_ROOT = Path(__file__).resolve().parents[3]


class _FakeEntryPoint:
    def __init__(self, name: str, factory, dist=None) -> None:
        self.name = name
        self.value = f"{name}:create_plugin"
        self._factory = factory
        self.dist = dist

    def load(self):
        factory = self._factory
        if callable(factory):
            return factory
        return lambda: factory


class _Distribution:
    name = "fake-dist"
    version = "9.9.9"


@dataclass(frozen=True)
class _Contract:
    contract_id: ClassVar[str] = "fake.catalog@1"
    value: str


class _FakeComponent:
    """Minimal component that can serve as selector or control by id."""

    def __init__(self, component_id: str) -> None:
        self.id = component_id
        self.provider_id = component_id
        self.contract_id = _Contract.contract_id
        self.title = "fake"
        self.fields = ()
        self.supported_contract_ids = frozenset({_Contract.contract_id})

    def prepare(self, parameters, *, execution_id):
        raise AssertionError("not used")

    def attach_command(self, facts):
        return None

    def observe(self, facts, handle=None):
        return None

    def finish(self, facts, handle=None):
        return None


class _FakeResource:
    supported_contract_ids = frozenset({_Contract.contract_id})

    def __init__(self, provider_id: str) -> None:
        self._provider_id = provider_id

    def descriptor(self):
        return ProviderDescriptor(self._provider_id, "fake resource", "1")

    def resolve(self, contract_id, ref, context=None):
        return _Contract(ref.native_id)








class _BindCounter:
    calls: list = []
    id = "binding-counter"
    contract_id = _Contract.contract_id
    title = "binding counter"
    fields = ()

    def prepare(self, parameters, *, execution_id):
        raise AssertionError("not used")

    def bind_registry(self, registry):
        _BindCounter.calls.append(registry)


class _BindFails:
    id = "binding-fails"
    contract_id = _Contract.contract_id
    title = "binding failure"
    fields = ()

    def prepare(self, parameters, *, execution_id):
        raise AssertionError("not used")

    def bind_registry(self, registry):
        raise RuntimeError("BINDING_EXPLODED")


class _SameIdControl:
    provider_id = "selector-only-selector"

    def attach_command(self, facts):
        return None

    def observe(self, facts, handle=None):
        return None

    def finish(self, facts, handle=None):
        return None


def _plugin(plugin_id: str, *, selector=True, contributor=True, control=True, manager=True,
            route=True, materializer=False, resource=True, contract=True, duplicate_kind=None):
    """Build one fake plugin.  Component ids are per-plugin unique unless
    ``duplicate_kind`` names the one kind whose id is deliberately shared."""
    def shared(component_id: str, kind: str) -> str:
        return "shared-id" if kind == duplicate_kind else component_id

    class _S:
        id = shared(f"{plugin_id}-selector", "selector")
        contract_id = _Contract.contract_id
        title = "fake"
        fields = ()

        def prepare(self, parameters, *, execution_id):
            raise AssertionError("not used in catalog tests")

    class _C:
        id = shared(f"{plugin_id}-contributor", "contributor")
        supported_contract_ids = frozenset({_Contract.contract_id})

    class _Ctl:
        provider_id = shared(f"{plugin_id}-provider", "control")

        def attach_command(self, facts):
            return None

        def observe(self, facts, handle=None):
            return None

        def finish(self, facts, handle=None):
            return None

    class _M:
        harness_id = shared(f"{plugin_id}-harness", "harness")

        def descriptor(self):
            return {"id": self.harness_id}

    class _R:
        def descriptor(self):
            from agent_box.extensions import ContinuationRouteDescriptor

            return ContinuationRouteDescriptor(
                shared(f"{plugin_id}-route", "route"),
                frozenset({f"{plugin_id}-provider"}), frozenset({f"{plugin_id}-provider"}),
                _Contract.contract_id, f"{plugin_id}-resource", f"{plugin_id}-selector",
                "native-session", "fake",
            )

    class _Mat:
        provider_id = shared(f"{plugin_id}-credential", "materializer")
        supported_contract_ids = frozenset({CredentialRefV1.contract_id})

        def resolve(self, contract_id, ref, *, context=None):
            raise AssertionError("catalog discovery never reads secrets")

        def prepare_mount(self, ref, execution_scope, guest_target, access):
            raise AssertionError("catalog discovery never materializes")

        def cleanup(self, prepared):
            raise AssertionError("catalog discovery never cleans up")

    selector_items = (_S(),) if selector else ()

    class _Plugin:
        def descriptor(self):
            return PluginDescriptor(plugin_id, plugin_id, "1")

        def build(self, context):
            return PluginRegistration(
                contracts=(_Contract,) if contract else (),
                resource_providers=(_FakeResource(f"{plugin_id}-resource"),) if resource else (),
                resource_selectors=selector_items,
                finalization_contributors=(_C(),) if contributor else (),
                host_controls=(_Ctl(),) if control else (),
                harness_managers=(_M(),) if manager else (),
                continuation_routes=(_R(),) if route else (),
                credential_materializers=(_Mat(),) if materializer else (),
            )

    return _Plugin()


def _bootstrap_registry() -> ExtensionRegistry:
    registry = ExtensionRegistry()
    register_shared_runtime_contracts(registry)
    return registry


def _environment(tmp_agent_box_home, *plugins):
    entry_points = tuple(_FakeEntryPoint(p.descriptor().id, p) for p in plugins)
    return build_extension_environment(entry_points=entry_points)


# 1. The catalog is immutable.
def test_catalog_is_immutable():
    contribution = ExtensionContribution("resource_selector", "s", "plugin")
    catalog = ExtensionCatalog.from_contributions([contribution])
    with pytest.raises(Exception):
        catalog._contributions = {}
    builder = ExtensionCatalogBuilder()
    builder.commit((contribution,))
    frozen = builder.build()
    with pytest.raises(Exception):
        frozen._contributions = {}
    with pytest.raises(Exception):
        contribution.component_id = "other"
    with pytest.raises(TypeError):
        catalog._contributions["other"] = contribution
    assert catalog.owner_of("resource_selector", "s") is contribution


# 2. Every contribution kind is queryable by id.
def test_every_contribution_kind_is_queryable(tmp_agent_box_home):
    environment = _environment(tmp_agent_box_home, _plugin("full", materializer=True))
    catalog = environment.catalog
    assert catalog.get_selector("full-selector").contract_id == _Contract.contract_id
    assert catalog.get_finalization_contributor("full-contributor").id == "full-contributor"
    assert catalog.get_host_control("full-provider").provider_id == "full-provider"
    assert catalog.get_harness_manager("full-harness").harness_id == "full-harness"
    assert catalog.get_continuation_route("full-route").descriptor().id == "full-route"
    assert catalog.get_credential_materializer("full-credential").provider_id == "full-credential"
    assert len(catalog.selectors()) == 1 and len(catalog.routes()) == 1
    assert len(catalog.credential_materializers()) == 1
    with pytest.raises(KeyError):
        catalog.get_selector("missing")


# 3. Ownership/provenance is recorded and bounded.
def test_catalog_records_ownership_provenance(tmp_agent_box_home):
    entry_point = _FakeEntryPoint("full", _plugin("full"), _Distribution())
    environment = build_extension_environment(entry_points=(entry_point,))
    owner = environment.catalog.owner_of("resource_selector", "full-selector")
    assert owner is not None
    assert (owner.kind, owner.plugin_id) == ("resource_selector", "full")
    assert (owner.distribution_name, owner.distribution_version) == ("fake-dist", "9.9.9")
    # The public ownership record is bounded; the live component is excluded
    # from its repr entirely.
    assert "object at 0x" not in repr(owner)


# 4 + 5. A failing plugin enters neither Catalog nor Registry.
def test_failed_plugin_leaves_no_catalog_or_registry_trace(tmp_agent_box_home):
    registry = _bootstrap_registry()
    builder = extensions.ExtensionCatalogBuilder()

    class _UnknownContractResource:
        supported_contract_ids = frozenset({"missing.contract@1"})

        def descriptor(self):
            return ProviderDescriptor("bad-resource", "bad resource", "1")

        def resolve(self, contract_id, ref, context=None):
            raise AssertionError

    class _BadPlugin:
        def descriptor(self):
            return PluginDescriptor("bad", "Bad", "1")

        def build(self, context):
            # Catalog-side contributions validate fine; the registry-side
            # provider is broken, so the whole plugin must commit nowhere.
            return PluginRegistration(
                resource_providers=(_UnknownContractResource(),),
                resource_selectors=(_FakeComponent("bad-selector"),),
                host_controls=(_FakeComponent("bad-provider"),),
            )

    report = load_installed_plugins(
        registry, entry_points=(
            _FakeEntryPoint("bad", _BadPlugin()),
            _FakeEntryPoint("good", _plugin("good")),
        ), catalog=builder,
    )
    assert [r.status for r in report.records] == ["FAILED", "READY"]
    catalog = builder.build()
    assert catalog.owner_of("resource_selector", "good-selector").plugin_id == "good"
    # The broken plugin contributed nothing anywhere.
    assert catalog.owner_of("resource_selector", "bad-selector") is None
    assert catalog.owner_of("host_control", "bad-provider") is None
    from agent_box.work_core.errors import ProviderUnavailable
    with pytest.raises(ProviderUnavailable):
        registry.get_resource_provider("bad-resource")


# 6-11. Duplicates fail closed for every contribution kind.
@pytest.mark.parametrize("kind_kw,label", [
    ({"selector": True, "duplicate_kind": "selector"}, "selector"),
    ({"contributor": True, "duplicate_kind": "contributor"}, "contributor"),
    ({"control": True, "duplicate_kind": "control"}, "control"),
    ({"manager": True, "duplicate_kind": "harness"}, "harness"),
    ({"route": True, "duplicate_kind": "route"}, "route"),
    ({"materializer": True, "duplicate_kind": "materializer"}, "materializer"),
])
def test_duplicate_contributions_fail_closed(tmp_agent_box_home, kind_kw, label):
    registry = _bootstrap_registry()
    builder = extensions.ExtensionCatalogBuilder()
    report = load_installed_plugins(
        registry, entry_points=(
            _FakeEntryPoint("one", _plugin("one", **{**{k: False for k in ("selector", "contributor", "control", "manager", "route", "materializer", "resource", "contract")}, **kind_kw})),
            _FakeEntryPoint("two", _plugin("two", **{**{k: False for k in ("selector", "contributor", "control", "manager", "route", "materializer", "resource", "contract")}, **kind_kw})),
        ), catalog=builder,
    )
    assert [r.status for r in report.records] == ["READY", "FAILED"], [
        (r.entry_point, r.error) for r in report.records
    ]
    assert f"duplicate {label} id" in (report.records[1].error or "")


# 12. The same id in two different component namespaces is legal.
def test_same_id_across_namespaces_is_legal(tmp_agent_box_home):
    class _ControlOnlyPlugin:
        def descriptor(self):
            return PluginDescriptor("control-only", "control-only", "1")

        def build(self, context):
            return PluginRegistration(host_controls=(_SameIdControl(),))

    environment = _environment(tmp_agent_box_home, _plugin("selector-only", selector=True, contributor=False, control=False, manager=False, route=False, resource=False, contract=False), _ControlOnlyPlugin())
    catalog = environment.catalog
    assert catalog.get_selector("selector-only-selector") is not None
    assert catalog.get_host_control("selector-only-selector") is not None
    assert catalog.owner_of("resource_selector", "selector-only-selector").kind == "resource_selector"
    assert catalog.owner_of("host_control", "selector-only-selector").kind == "host_control"


# 13. The real Codex materializer is discoverable through the Catalog.
def test_codex_materializer_discoverable_via_catalog(tmp_agent_box_home):
    from agent_box_harnesses.plugin import HarnessesPlugin

    environment = _environment(tmp_agent_box_home, HarnessesPlugin())
    materializer = environment.catalog.get_credential_materializer("codex-login")
    assert isinstance(materializer, CredentialMaterializer)
    owner = environment.catalog.owner_of(CREDENTIAL_MATERIALIZER, "codex-login")
    assert owner.plugin_id == "harnesses"
    # Claude/OpenCode/Hermes/Pi do not fake-register materializers.
    assert len(environment.catalog.credential_materializers()) == 1


# 14. Catalog provenance never leaks credential paths, tokens, or values.
def test_catalog_provenance_does_not_leak_credential_material(tmp_agent_box_home):
    from agent_box_harnesses.plugin import HarnessesPlugin

    environment = _environment(tmp_agent_box_home, HarnessesPlugin())
    rendered = repr(environment.catalog.contributions())
    assert "auth.json" not in rendered
    assert "codex-secret" not in rendered
    assert str(tmp_agent_box_home) not in rendered
    owner = environment.catalog.owner_of(CREDENTIAL_MATERIALIZER, "codex-login")
    for name in ("kind", "component_id", "plugin_id", "distribution_name", "distribution_version"):
        assert "auth" not in str(getattr(owner, name))


# 15. Registry binding happens exactly once per contribution.
def test_registry_binding_happens_exactly_once(tmp_agent_box_home):
    _BindCounter.calls.clear()

    class _BoundPlugin:
        def descriptor(self):
            return PluginDescriptor("bound", "bound", "1")

        def build(self, context):
            return PluginRegistration(resource_selectors=(_BindCounter(),))

    build_extension_environment(entry_points=(_FakeEntryPoint("bound", _BoundPlugin()),))
    assert len(_BindCounter.calls) == 1


# 16. A binding failure never masquerades as READY.
def test_binding_failure_fails_the_environment(tmp_agent_box_home):
    class _ExplodingPlugin:
        def descriptor(self):
            return PluginDescriptor("exploding", "boom", "1")

        def build(self, context):
            return PluginRegistration(resource_selectors=(_BindFails(),))

    with pytest.raises(RuntimeError, match="BINDING_EXPLODED"):
        build_extension_environment(entry_points=(_FakeEntryPoint("exploding", _ExplodingPlugin()),))


# 17 + boundary. Web no longer aggregates extensions or sniffs bind.
def test_web_does_not_aggregate_report_or_sniff_bind():
    web_root = REPO_ROOT / "plugins" / "agent-box-web" / "src"
    offenders = []
    for path in web_root.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if "for r in report.ready" in text or "for record in report.ready" in text:
            offenders.append(f"{path}: report aggregation")
        if 'hasattr(x,"bind")' in text or 'hasattr(x, "bind")' in text:
            offenders.append(f"{path}: bind sniffing")
    assert offenders == []


# 18. A third-party Host consumes the Catalog without importing Web.
def test_fake_host_consumes_catalog_without_web(tmp_path):
    code = "\n".join([
        "import sys",
        "from agent_box.extensions.bootstrap import (",
        "    build_extension_environment_from_parts, register_shared_runtime_contracts)",
        "from agent_box.work_core import ExtensionRegistry",
        "from agent_box.extensions import PluginDescriptor, PluginRegistration",
        "from agent_box.extensions.loader import load_installed_plugins",
        "class Selector:",
        "    id = 's'; contract_id = 'agent-box.prompt-fragment@1'; title = 's'; fields = ()",
        "    def prepare(self, parameters, *, execution_id): raise AssertionError",
        "class Plugin:",
        "    def descriptor(self): return PluginDescriptor('hostless', 'hostless', '1')",
        "    def build(self, context): return PluginRegistration(resource_selectors=(Selector(),))",
        "class EP:",
        "    name = 'hostless'; value = 'hostless'",
        "    def load(self): return Plugin",
        "registry = ExtensionRegistry()",
        "register_shared_runtime_contracts(registry)",
        "report = load_installed_plugins(registry, entry_points=(EP(),))",
        "environment = build_extension_environment_from_parts(registry, report)",
        "assert environment.catalog.get_selector('s') is not None",
        "assert 'agent_box_web' not in sys.modules, sorted(m for m in sys.modules if 'box' in m)",
        "print('ok')",
    ])
    subprocess.run(
        [sys.executable, "-c", code], check=True, cwd=REPO_ROOT,
        env={"PATH": "/usr/bin:/bin", "AGENT_BOX_HOME": str(tmp_path), "PYTHONPATH": str(REPO_ROOT / "src")},
    )


# 19. The compatibility wrapper keeps its contract.
def test_build_extension_registry_wrapper_behavior(tmp_agent_box_home):
    registry, report = build_extension_registry(entry_points=())
    assert isinstance(registry, ExtensionRegistry)
    assert report.ready == () and report.failed == ()
    assert registry.get_contract_type("agent-box.sandbox@1").__name__ == "SandboxV1"


# 20. build_extension_environment is the single canonical loader path.
def test_build_extension_environment_is_canonical(tmp_agent_box_home):
    environment = _environment(tmp_agent_box_home, _plugin("full", materializer=True))
    assert isinstance(environment.registry, ExtensionRegistry)
    assert isinstance(environment.catalog, ExtensionCatalog)
    assert environment.report.ready[0].descriptor.id == "full"
    assert environment.catalog.get_credential_materializer("full-credential") is not None
    # The compatibility wrapper delegates to this exact path.
    source = (REPO_ROOT / "src" / "agent_box" / "extensions" / "bootstrap.py").read_text(encoding="utf-8")
    assert source.count("load_installed_plugins(") == 1
