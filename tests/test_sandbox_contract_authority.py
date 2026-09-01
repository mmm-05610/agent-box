"""Architecture Repair Phase 1: agent-box.sandbox@1 contract authority.

Covers:
- exactly one Python type for ``agent-box.sandbox@1`` (the canonical SandboxV1);
- canonical value passing real Dispatch isinstance validation;
- bwrap resolve returning the canonical value with stable template digests;
- the shared assembler accepting only the canonical sandbox shape;
- Root-owned shared runtime contracts registered exactly once by the Root
  Extension bootstrap (never by work_core, never re-declared by providers);
- plugin-owned duplicate contracts still failing closed;
- the retired ``agent_box.extensions.sandbox`` shim pointing at the canonical
  module with no runnable legacy ``start()`` protocol;
- the repository defining ``list_works`` exactly once.
"""
from __future__ import annotations

import ast
import hashlib
import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
from typing import ClassVar

import pytest

from agent_box.extensions.bootstrap import (
    SHARED_RUNTIME_CONTRACTS,
    register_shared_runtime_contracts,
)
from agent_box.extensions.loader import load_installed_plugins
from agent_box.extensions.runtime_composition import (
    SANDBOX_CONTRACT_ID,
    HarnessCommandSpec,
    RuntimeHostRef,
    RuntimeHostV1,
    SandboxRef,
    SandboxV1,
    TerminalSessionRef,
    TerminalSessionV1,
    assemble_runtime_composition,
    declare_source,
)
from agent_box.extensions.runtime_composition import protocol as runtime_protocol
from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration
from agent_box.work_core import (
    ExecutionStartReceipt,
    ExtensionRegistry,
    ProviderDescriptor,
    Ref,
    RefType,
    ResolvedExecutionInput,
)
from agent_box.work_core.repository import CoreRepository
from agent_box.work_core.services import ExecutionService, WorkService
from agent_box_sandbox_bwrap.provider import BwrapSandboxProvider, _CAPS

REPO_ROOT = Path(__file__).resolve().parents[1]

SHARED_IDS = {
    "agent-box.runtime-host@1",
    "agent-box.sandbox@1",
    "agent-box.terminal-session@1",
}


def _bootstrapped_registry() -> ExtensionRegistry:
    registry = ExtensionRegistry()
    register_shared_runtime_contracts(registry)
    return registry


def _formal_sources():
    roots = [REPO_ROOT / "src" / "agent_box"]
    roots.extend(sorted((REPO_ROOT / "plugins").glob("*/src")))
    for root in roots:
        for path in sorted(root.rglob("*.py")):
            if "__pycache__" in path.parts:
                continue
            yield path


class _FakeEntryPoint:
    def __init__(self, name: str, factory) -> None:
        self.name = name
        self.value = f"{name}:create_plugin"
        self._factory = factory

    def load(self):
        return self._factory


class _SandboxOnlyExecution:
    """ExecutionProvider that accepts exactly one canonical sandbox input."""

    def descriptor(self):
        return ProviderDescriptor("sandbox-exec", "sandbox dispatch", "1")

    def capabilities(self):
        return {"start": "supported", "observe": "supported"}

    def input_limits(self):
        return {SANDBOX_CONTRACT_ID: (1, 1)}

    def start(self, request):
        self.request = request
        return ExecutionStartReceipt(
            request.execution_id, request.dispatch_id, request.inputs_digest
        )

    def observe(self, native_ref):
        return native_ref


class _SecondSandboxResource:
    def __init__(self, provider_id: str) -> None:
        self._provider_id = provider_id

    supported_contract_ids = frozenset({SANDBOX_CONTRACT_ID})

    def descriptor(self):
        return ProviderDescriptor(self._provider_id, "second sandbox", "1")

    def resolve(self, contract_id, ref, context=None):
        return SandboxV1(
            SandboxRef(self._provider_id, ref.native_id, "sha256:second", "local:test"),
            SimpleNamespace(ref=None),
        )


# 1. Registry holds exactly one Python type for agent-box.sandbox@1.
def test_sandbox_contract_has_exactly_one_canonical_python_type():
    registry = _bootstrapped_registry()
    assert registry.get_contract_type(SANDBOX_CONTRACT_ID) is SandboxV1
    assert registry.root_shared_contract_ids() == frozenset(SHARED_IDS)


def test_formal_source_defines_no_second_sandbox_contract_type():
    offenders = []
    for path in _formal_sources():
        text = path.read_text(encoding="utf-8")
        if "class SandboxTemplateV1" in text or "SandboxTemplate =" in text:
            offenders.append(str(path))
    assert offenders == []


# 10. No runnable legacy start() protocol remains in formal source.
def test_formal_source_has_no_legacy_resolved_sandbox_start_protocol():
    offenders = []
    for path in _formal_sources():
        text = path.read_text(encoding="utf-8")
        if "class ResolvedSandbox" in text or "class SandboxedProcess" in text:
            offenders.append(str(path))
    assert offenders == []


# 5. work_core.registry never imports the extension layer.
def test_work_core_registry_does_not_import_extensions():
    code = (
        "import sys, agent_box.work_core.registry as m; "
        "loaded = sorted(x for x in sys.modules if x.startswith('agent_box.extensions')); "
        "assert not loaded, loaded"
    )
    subprocess.run([sys.executable, "-c", code], check=True, cwd=REPO_ROOT)


# 7. Root-only bootstrapping registers the shared runtime contracts.
def test_root_only_bootstrap_registers_shared_contracts_without_plugins(
    tmp_agent_box_home,
):
    registry = ExtensionRegistry()
    register_shared_runtime_contracts(registry)
    report = load_installed_plugins(registry, entry_points=())
    assert report.ready == ()
    expected = {
        "agent-box.runtime-host@1": RuntimeHostV1,
        "agent-box.sandbox@1": SandboxV1,
        "agent-box.terminal-session@1": TerminalSessionV1,
    }
    for contract_id, contract_type in expected.items():
        assert registry.get_contract_type(contract_id) is contract_type
    assert registry.root_shared_contract_ids() == frozenset(SHARED_IDS)


# 6. Shared runtime contracts are registered exactly once (idempotent for the
# identical canonical type, never a gateway for a second type).
def test_shared_runtime_contracts_register_exactly_once():
    registry = _bootstrapped_registry()
    for contract in SHARED_RUNTIME_CONTRACTS:
        registry.register_root_shared_contract(contract)
    assert registry.root_shared_contract_ids() == frozenset(SHARED_IDS)

    @dataclass(frozen=True)
    class ImpostorSandbox:
        contract_id: ClassVar[str] = SANDBOX_CONTRACT_ID
        marker: str

    with pytest.raises(ValueError, match="Root shared contract id collision"):
        registry.register_root_shared_contract(ImpostorSandbox)
    with pytest.raises(ValueError, match="Root-owned shared runtime authority"):
        registry.register_contract(ImpostorSandbox)
    assert registry.get_contract_type(SANDBOX_CONTRACT_ID) is SandboxV1


# 7b. Two providers of one kind may re-declare the identical canonical type.
def test_two_sandbox_providers_share_the_root_contract_without_failure(
    tmp_agent_box_home,
):
    class PluginA:
        def descriptor(self):
            return PluginDescriptor("sandbox-a", "Sandbox A", "1")

        def build(self, context):
            return PluginRegistration(
                contracts=(SandboxV1,),
                resource_providers=(_SecondSandboxResource("second-sandbox-a"),),
            )

    class PluginB:
        def descriptor(self):
            return PluginDescriptor("sandbox-b", "Sandbox B", "1")

        def build(self, context):
            return PluginRegistration(
                contracts=(SandboxV1,),
                resource_providers=(_SecondSandboxResource("second-sandbox-b"),),
            )

    registry = ExtensionRegistry()
    register_shared_runtime_contracts(registry)
    report = load_installed_plugins(
        registry,
        entry_points=(
            _FakeEntryPoint("sandbox-a", lambda: PluginA()),
            _FakeEntryPoint("sandbox-b", lambda: PluginB()),
        ),
    )
    assert [record.status for record in report.records] == ["READY", "READY"]
    assert registry.get_resource_provider("second-sandbox-a")
    assert registry.get_resource_provider("second-sandbox-b")
    assert registry.get_contract_type(SANDBOX_CONTRACT_ID) is SandboxV1


# 8. Plugin-owned duplicate contracts stay fail closed.
def test_plugin_owned_duplicate_contract_fails_closed(tmp_agent_box_home):
    @dataclass(frozen=True)
    class ExampleV1:
        contract_id: ClassVar[str] = "example.dupe@1"
        value: str

    class DupePlugin:
        def __init__(self, plugin_id: str) -> None:
            self._plugin_id = plugin_id

        def descriptor(self):
            return PluginDescriptor(self._plugin_id, self._plugin_id, "1")

        def build(self, context):
            return PluginRegistration(contracts=(ExampleV1,))

    registry = ExtensionRegistry()
    with pytest.raises(ValueError, match="already registered"):
        registry.register_contract(ExampleV1)
        registry.register_contract(ExampleV1)
    report = load_installed_plugins(
        ExtensionRegistry(),
        entry_points=(
            _FakeEntryPoint("dupe-one", lambda: DupePlugin("dupe-one")),
            _FakeEntryPoint("dupe-two", lambda: DupePlugin("dupe-two")),
        ),
    )
    assert [record.status for record in report.records] == ["READY", "FAILED"]
    assert "already registered" in (report.records[1].error or "")


# 3. bwrap resolve returns the canonical value.
def test_bwrap_resolve_returns_canonical_sandbox_v1(tmp_path):
    provider = BwrapSandboxProvider(tmp_path / "data")
    value = provider.resolve(SANDBOX_CONTRACT_ID, provider.make_ref(host_affinity="local:test"))
    assert isinstance(value, SandboxV1)
    assert isinstance(value.ref, SandboxRef)
    assert value.ref.provider == "bwrap-sandbox"
    assert hasattr(value.port, "wrap")
    assert not hasattr(value.port, "contract_id")


def test_bwrap_template_digest_is_stable_across_retired_module(tmp_path):
    spec = {"revision": 1, "network": "none"}
    expected = "sha256:" + hashlib.sha256(
        json.dumps(
            {
                "template_id": "bwrap-offline",
                "revision": spec["revision"],
                "network": spec["network"],
                "capabilities": _CAPS,
            },
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        ).encode()
    ).hexdigest()
    provider = BwrapSandboxProvider(tmp_path / "data")
    assert provider._template_digest("bwrap-offline", spec) == expected


# 2. The canonical value passes real Dispatch isinstance validation.
def test_canonical_sandbox_value_passes_real_dispatch_validation(
    tmp_path, tmp_agent_box_home
):
    provider = BwrapSandboxProvider(tmp_path / "data")
    execution_provider = _SandboxOnlyExecution()
    registry = _bootstrapped_registry()
    registry.register_resource_provider(provider)
    registry.register_execution_provider(execution_provider)
    repository = CoreRepository()
    service = ExecutionService(repository)
    work = WorkService(repository).create_work("sandbox authority")
    execution = service.create_execution(
        work.id, "sandbox-exec", responsibility_intent="validate canonical value"
    )
    receipt = service.dispatch_execution(
        execution.id,
        ((SANDBOX_CONTRACT_ID, provider.make_ref(host_affinity="local:t")),),
        registry,
        "sandbox-authority-key",
    )
    assert receipt.state == "accepted"
    resolved = execution_provider.request.resolved_inputs[0]
    assert resolved.contract_id == SANDBOX_CONTRACT_ID
    assert isinstance(resolved.value, SandboxV1)


# 4. The shared assembler accepts only the canonical sandbox shape.
def _composition_request(tmp_path, sandbox_value):
    workspace = tmp_path / "workspace"
    workspace.mkdir(exist_ok=True)
    (workspace / "f.txt").write_text("x", encoding="utf-8")
    host = RuntimeHostV1(
        RuntimeHostRef("runtime-host-local", "h", "sha256:host", "aff"),
        SimpleNamespace(ref=None),
    )
    terminal = TerminalSessionV1(
        TerminalSessionRef("terminal", "t", "sha256:term", "aff"),
        SimpleNamespace(ref=None),
    )
    return SimpleNamespace(
        resolved_inputs=(
            ResolvedExecutionInput(
                "agent-box.workspace@1",
                Ref(RefType.WORKSPACE, "workspace", "w"),
                SimpleNamespace(path=workspace),
            ),
            ResolvedExecutionInput(
                RuntimeHostV1.contract_id, Ref(RefType.ARTIFACT, "h", "h"), host
            ),
            ResolvedExecutionInput(
                SANDBOX_CONTRACT_ID, Ref(RefType.ARTIFACT, "s", "s"), sandbox_value
            ),
            ResolvedExecutionInput(
                TerminalSessionV1.contract_id,
                Ref(RefType.ARTIFACT, "t", "t"),
                terminal,
            ),
        )
    )


def test_assembler_rejects_non_canonical_sandbox_shape(tmp_path):
    class LegacySandboxPort:
        def __init__(self) -> None:
            self.ref = SandboxRef("bwrap-sandbox", "safe-default", "sha256:legacy", "aff")

    with pytest.raises(TypeError):
        assemble_runtime_composition(
            _composition_request(tmp_path, LegacySandboxPort()),
            HarnessCommandSpec(("x",), "/workspace"),
        )


def test_assembler_unwraps_exactly_the_canonical_ports(tmp_path):
    provider = BwrapSandboxProvider(tmp_path / "bwrap")
    workspace = tmp_path / "workspace"
    workspace.mkdir(exist_ok=True)
    (workspace / "f.txt").write_text("x", encoding="utf-8")
    sandbox_value = provider.resolve(
        SANDBOX_CONTRACT_ID, provider.make_ref(host_affinity="aff")
    )
    command = HarnessCommandSpec(
        ("x",), "/workspace",
        runtime_sources=(declare_source("workspace", workspace, "/workspace", access="rw"),),
    )
    binding, coordinator = assemble_runtime_composition(
        _composition_request(tmp_path, sandbox_value),
        command,
    )
    assert binding.sandbox_ref is sandbox_value.ref
    resolved = coordinator._resolver(binding)
    assert resolved.sandbox is sandbox_value.port


# 9. The legacy import shim points at the canonical module.
def test_legacy_sandbox_shim_points_at_canonical_types():
    import agent_box.extensions.sandbox as shim

    assert shim.CONTRACT_ID == SANDBOX_CONTRACT_ID == SandboxV1.contract_id
    assert shim.SandboxRequirements is runtime_protocol.SandboxRequirements
    assert shim.SandboxError is runtime_protocol.SandboxError
    assert shim.SandboxUnavailable is runtime_protocol.SandboxUnavailable
    assert shim.SandboxUnsupported is runtime_protocol.SandboxUnsupported
    assert shim.SandboxAmbiguous is runtime_protocol.SandboxAmbiguous
    assert shim.ProjectionRejected is runtime_protocol.ProjectionRejected
    assert shim.guest_path is runtime_protocol.guest_path
    assert shim.digest_json is runtime_protocol.digest_json
    assert not hasattr(shim, "SandboxTemplateV1")
    assert not hasattr(shim, "SandboxTemplate")
    assert not hasattr(shim, "ResolvedSandbox")
    assert not hasattr(shim, "SandboxedProcess")


# 12. The repository defines list_works exactly once.
def test_repository_defines_list_works_exactly_once():
    tree = ast.parse(
        (REPO_ROOT / "src" / "agent_box" / "work_core" / "repository.py").read_text(
            encoding="utf-8"
        )
    )
    names = [
        node.name
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef) and node.name == "list_works"
    ]
    assert names == ["list_works"]
