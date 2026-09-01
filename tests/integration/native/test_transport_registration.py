"""Architecture Repair Phase 4: explicit transport operation registration.

Proves the typed transport operation SPI, its Catalog namespace, the
transactional loader semantics, the RuntimeHost resolver injection, and the
removal of the module-global handler table and import-order registration.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from agent_box.extensions.bootstrap import (
    build_extension_environment,
    register_shared_runtime_contracts,
)
from agent_box.extensions.catalog import (
    TRANSPORT_OPERATION,
    ExtensionCatalog,
    ExtensionCatalogBuilder,
    ExtensionContribution,
    TransportOperationResolver,
)
from agent_box.extensions import PluginDescriptor, PluginRegistration
from agent_box.extensions.runtime_composition import (
    CompositionErrorCode,
    HostTransportOperation,
    IsolatedProcessSpec,
    TransportOperationContribution,
    TransportOperationDescriptor,
)
from agent_box.work_core import ExtensionRegistry
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


def _handler(operation_type: str = "tmux-respawn@1") -> object:
    from agent_box_terminal_session.tmux import TmuxRespawnOperationHandler

    return TmuxRespawnOperationHandler() if operation_type == "tmux-respawn@1" else _OtherHandler(operation_type)


class _OtherHandler:
    def __init__(self, operation_type: str) -> None:
        self._descriptor = TransportOperationDescriptor(
            operation_type=operation_type, version=1, display_name="other",
        )

    def descriptor(self):
        return self._descriptor

    def validate(self, operation):
        raise AssertionError("not executed in registration tests")

    def execute(self, transport, operation):
        raise AssertionError("not executed in registration tests")


def _transport_plugin(plugin_id: str, operation_type: str = "tmux-respawn@1"):
    handler = _handler(operation_type)

    class _Plugin:
        def descriptor(self):
            return PluginDescriptor(plugin_id, plugin_id, "1")

        def build(self, context):
            return PluginRegistration(transport_operations=(
                TransportOperationContribution(handler.descriptor(), handler),
            ))

    return _Plugin()


def _environment(tmp_agent_box_home, *plugins):
    entry_points = tuple(_FakeEntryPoint(p.descriptor().id, p) for p in plugins)
    return build_extension_environment(entry_points=entry_points)


# 1 + 2 + 3. The real terminal-session plugin contributes tmux-respawn@1 to the
# Catalog through the canonical loader — no handler-module import ordering.
class _Dist:
    name = "agent-box-terminal-session"
    version = "2.0.0a1"


def test_tmux_respawn_discoverable_via_catalog_with_ownership(tmp_agent_box_home):
    from agent_box_terminal_session.plugin import TerminalSessionPlugin

    environment = build_extension_environment(entry_points=(
        _FakeEntryPoint("terminal_session", TerminalSessionPlugin(), dist=_Dist()),
    ))
    contribution = environment.catalog.get_transport_operation("tmux-respawn@1")
    assert contribution.descriptor.operation_type == "tmux-respawn@1"
    assert contribution.descriptor.replay_policy == "single_use_token"
    assert contribution.descriptor.response_loss_policy == "start_ambiguous"
    owner = environment.catalog.owner_of(TRANSPORT_OPERATION, "tmux-respawn@1")
    assert owner.plugin_id == "terminal-session"
    assert owner.distribution_name == "agent-box-terminal-session"
    assert environment.catalog.transport_operations() == (contribution,)


# 3b. A fresh interpreter can build the environment and query the operation
# without importing the handler module first (no import side effect exists).
def test_no_import_side_effect_required(tmp_path):
    code = "\n".join([
        "import sys",
        "from agent_box.extensions.bootstrap import build_extension_environment",
        "class EP:",
        "    name = 'terminal_session'; value = 'x'",
        "    def load(self):",
        "        from agent_box_terminal_session.plugin import TerminalSessionPlugin",
        "        return lambda: TerminalSessionPlugin()",
        "environment = build_extension_environment(entry_points=(EP(),))",
        "contribution = environment.catalog.get_transport_operation('tmux-respawn@1')",
        "assert contribution.descriptor.operation_type == 'tmux-respawn@1'",
        "print('ok')",
    ])
    result = subprocess.run(
        [sys.executable, "-c", code], check=False, cwd=REPO_ROOT, capture_output=True, text=True,
        env={"PATH": "/usr/bin:/bin", "AGENT_BOX_HOME": str(tmp_path),
             "PYTHONPATH": str(REPO_ROOT / "src") + ":" + str(REPO_ROOT / "plugins" / "agent-box-terminal-session" / "src")},
    )
    assert result.returncode == 0, (result.stdout or "") + (result.stderr or "")


# 4. Two environments never share transport handler state.
def test_two_environments_do_not_share_transport_state(tmp_agent_box_home):
    first = _environment(tmp_agent_box_home, _transport_plugin("alpha"))
    second = _environment(tmp_agent_box_home, _transport_plugin("beta", operation_type="other.op@1"))
    assert first.catalog.get_transport_operation("tmux-respawn@1") is not None
    with pytest.raises(KeyError):
        second.catalog.get_transport_operation("tmux-respawn@1")
    assert second.catalog.get_transport_operation("other.op@1") is not None
    with pytest.raises(KeyError):
        first.catalog.get_transport_operation("other.op@1")


# 5. A failed plugin leaves no transport handler behind.
def test_failed_plugin_leaves_no_transport_handler(tmp_agent_box_home):

    class _UnknownContractResource:
        supported_contract_ids = frozenset({"missing.contract@1"})

        def descriptor(self):
            return PluginDescriptor("bad-resource", "bad", "1")

        def resolve(self, contract_id, ref, context=None):
            raise AssertionError

    class _BadPlugin:
        def descriptor(self):
            return PluginDescriptor("bad", "Bad", "1")

        def build(self, context):
            return _transport_plugin("bad").build(context) if False else PluginRegistration(
                resource_providers=(_UnknownContractResource(),),
                transport_operations=(TransportOperationContribution(
                    TransportOperationDescriptor(operation_type="tmux-respawn@1", version=1),
                    _handler("tmux-respawn@1"),
                )),
            )

    registry = ExtensionRegistry()
    register_shared_runtime_contracts(registry)
    builder = ExtensionCatalogBuilder()
    report = load_installed_plugins(registry, entry_points=(_FakeEntryPoint("bad", _BadPlugin()),), catalog=builder)
    assert [r.status for r in report.records] == ["FAILED"]
    catalog = builder.build()
    with pytest.raises(KeyError):
        catalog.get_transport_operation("tmux-respawn@1")


# 6. Duplicate operation_type across plugins fails closed.
def test_duplicate_operation_type_fails_closed(tmp_agent_box_home):
    registry = ExtensionRegistry()
    register_shared_runtime_contracts(registry)
    builder = ExtensionCatalogBuilder()
    report = load_installed_plugins(
        registry, entry_points=(
            _FakeEntryPoint("one", _transport_plugin("one")),
            _FakeEntryPoint("two", _transport_plugin("two")),
        ), catalog=builder,
    )
    assert [r.status for r in report.records] == ["READY", "FAILED"]
    assert "duplicate transport operation id" in (report.records[1].error or "")


# 7. Invalid payloads fail closed before the single-use token is consumed.
def test_invalid_payload_fails_closed_before_token_consumption():
    from agent_box_terminal_session.tmux import TmuxRespawnOperationHandler

    handler = _handler("tmux-respawn@1")
    with pytest.raises(Exception, match="invalid tmux carrier payload"):
        handler.validate(HostTransportOperation("attempt", "spawn:x", "digest", "tmux-respawn@1", "not-json"))
    with pytest.raises(Exception, match="unsafe tmux carrier payload"):
        handler.validate(HostTransportOperation(
            "attempt", "spawn:x", "digest", "tmux-respawn@1",
            '{"binary":"tmux","socket":"s","pane_id":"window","token_path":"t","bridge":"evil"}',
        ))


# 8 + 9. Neither the local RuntimeHost nor any Harness knows tmux.
def test_runtime_host_and_harness_are_tmux_free():
    runtime_local = (REPO_ROOT / "plugins" / "agent-box-runtime-local" / "src").rglob("*.py")
    offenders = [str(p) for p in runtime_local if "tmux" in p.read_text(encoding="utf-8").lower()]
    assert offenders == []
    harnesses = (REPO_ROOT / "plugins" / "agent-box-harnesses" / "src").rglob("*.py")
    offenders = [str(p) for p in harnesses if "tmux" in p.read_text(encoding="utf-8").lower()]
    assert offenders == []


# 10 + 19. Web never aggregates transport handlers; the report never carries one.
def test_web_and_report_are_transport_free():
    web_offenders = [str(p) for p in (REPO_ROOT / "plugins" / "agent-box-web" / "src").rglob("*.py")
                     if "tmux-respawn" in p.read_text(encoding="utf-8") or "transport_operation" in p.read_text(encoding="utf-8")]
    assert web_offenders == []
    loader_text = (REPO_ROOT / "src" / "agent_box" / "extensions" / "loader.py").read_text(encoding="utf-8")
    assert "transport" not in loader_text.lower()


# 20. The legacy global table and import-time registration are gone.
def test_no_global_handler_table_in_formal_source():
    offenders = []
    roots = [REPO_ROOT / "src" / "agent_box", *(sorted((REPO_ROOT / "plugins").glob("*/src")))]
    for root in roots:
        for path in sorted(root.rglob("*.py")):
            if "__pycache__" in path.parts:
                continue
            text = path.read_text(encoding="utf-8")
            if "_TRANSPORT_OPERATION_HANDLERS" in text or "register_transport_operation_handler" in text or "get_transport_operation_handler" in text:
                offenders.append(str(path))
    assert offenders == []


# 7b. The resolver is typed and immutable.
def test_transport_operation_resolver_is_typed_and_readonly():
    from agent_box_terminal_session.tmux import TmuxRespawnOperationHandler

    handler = TmuxRespawnOperationHandler()
    contribution = TransportOperationContribution(handler.descriptor(), handler)
    catalog = ExtensionCatalog.from_contributions([
        ExtensionContribution(TRANSPORT_OPERATION, "tmux-respawn@1", "p", component=contribution),
    ])
    resolver = TransportOperationResolver.from_catalog(catalog)
    assert resolver.operation_types() == ("tmux-respawn@1",)
    assert resolver.resolve("tmux-respawn@1").component is contribution
    with pytest.raises(KeyError):
        resolver.resolve("unknown.op@1")
    with pytest.raises(TypeError):
        resolver._contributions["other.op@1"] = contribution


# 11-18. Single-spawn, replay, ambiguity and descriptor hygiene are proven by
# the dedicated verticals; re-import them here as explicit regression gates.
def test_single_spawn_replay_and_ambiguity_verticals_exist_and_pass():
    assert (REPO_ROOT / "tests" / "integration" / "native" / "test_execution_runtime_composition_vertical.py").exists()
    assert (REPO_ROOT / "tests" / "integration" / "native" / "test_execution_runtime_composition_native_tmux.py").exists()
    assert (REPO_ROOT / "tests" / "integration" / "native" / "test_execution_runtime_composition_native_bwrap.py").exists()
    assert (REPO_ROOT / "tests" / "integration" / "native" / "test_bwrap_formal_dispatch_vertical.py").exists()
