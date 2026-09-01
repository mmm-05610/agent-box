"""Formal Core Dispatch vertical using the current wrapper/carrier protocol."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest

from agent_box.extensions.bootstrap import register_shared_runtime_contracts
from agent_box.extensions.runtime_composition import (
    SANDBOX_CONTRACT_ID as CONTRACT_ID,
    HarnessCommandSpec, RuntimeHostV1, TerminalSessionV1,
    assemble_runtime_composition, declare_source,
)
from agent_box.work_core import (
    ExecutionFinalizationRequest, ExecutionProjection, ExecutionStartReceipt,
    Freshness, Outcome, Phase, ProviderDescriptor, Ref, RefType,
)
from agent_box.work_core.registry import ExtensionRegistry
from agent_box.work_core.repository import CoreRepository
from agent_box.work_core.services import ExecutionService, WorkService
from agent_box_runtime_local.provider import LocalRuntimeHostProvider
from agent_box_sandbox_bwrap.provider import BwrapSandboxProvider
from agent_box_terminal_session import DirectStdioResourceProvider, DirectStdioSession


class FormalHarness:
    """A fake Harness projector: it declares its layout and uses the one
    shared Root assembler — no second assembly path exists."""

    def __init__(self, source: Path):
        self.source = source
        self.started = []
        self.coordinator = None

    def descriptor(self): return ProviderDescriptor("formal-composition", "formal composition", "1")
    def capabilities(self): return {"start": "supported", "observe": "supported"}
    def input_limits(self):
        return {RuntimeHostV1.contract_id: (1, 1), CONTRACT_ID: (1, 1), TerminalSessionV1.contract_id: (1, 1)}

    def start(self, request):
        self.started.append(request)
        command = HarnessCommandSpec(
            ("/workspace/offline-fake-codex",), "/workspace",
            runtime_sources=(declare_source("workspace", self.source, "/workspace", access="ro", provenance="formal"),),
            projector_id="formal-harness",
        )
        binding, coordinator = assemble_runtime_composition(request, command)
        self.coordinator = coordinator
        handle = coordinator.start(binding, command, execution_id=request.execution_id, dispatch_id=request.dispatch_id)
        return ExecutionStartReceipt(request.execution_id, request.dispatch_id, request.inputs_digest,
                                     correlation_ref=Ref(RefType.RUN, "formal-composition", request.dispatch_id), runtime_handle=handle)

    def observe(self, native_ref): return native_ref


def test_formal_dispatch_wrap_allocate_run_replay_cleanup_and_finish(tmp_path, tmp_agent_box_home):
    source = tmp_path / "workspace"; source.mkdir()
    fake = source / "offline-fake-codex"; fake.write_text("#!/bin/sh\nexit 0\n"); fake.chmod(0o755)
    native_calls = []
    host_provider = LocalRuntimeHostProvider(executor=lambda argv, **kw: native_calls.append((argv, kw)) or "native")
    sandbox_provider = BwrapSandboxProvider(tmp_path / "sandbox")
    if sandbox_provider.probe()["status"] != "available":
        pytest.skip("real bwrap unavailable: binary missing or namespace capability denied")
    terminal_provider = DirectStdioResourceProvider()
    harness = FormalHarness(source)
    registry = ExtensionRegistry()
    register_shared_runtime_contracts(registry)
    registry.register_components(contracts=(), resource_providers=(host_provider, sandbox_provider, terminal_provider), execution_providers=(harness,))
    repo = CoreRepository(); service = ExecutionService(repo)
    work = WorkService(repo).create_work("formal composition")
    execution = service.create_execution(work.id, "formal-composition", responsibility_intent="offline fake")
    host_ref = host_provider.make_ref()
    sandbox_ref = sandbox_provider.make_ref(host_affinity=host_ref.metadata["affinity"])
    terminal_ref = DirectStdioSession.make_ref(host_affinity=host_ref.metadata["affinity"])
    refs = (
        (RuntimeHostV1.contract_id, host_ref), (CONTRACT_ID, sandbox_ref),
        (TerminalSessionV1.contract_id, Ref(RefType.ARTIFACT, terminal_ref.provider, terminal_ref.native_id, metadata={"session_digest": terminal_ref.session_digest, "affinity": terminal_ref.affinity})),
    )
    receipt = service.dispatch_execution(execution.id, refs, registry, "formal-carrier")
    assert [item.contract_id for item in harness.started[0].resolved_inputs].count(RuntimeHostV1.contract_id) == 1
    assert [item.contract_id for item in harness.started[0].resolved_inputs].count(CONTRACT_ID) == 1
    assert [item.contract_id for item in harness.started[0].resolved_inputs].count(TerminalSessionV1.contract_id) == 1
    assert len(native_calls) == 1  # wrap/allocate were zero; run is the only creation seam
    attempt = next(iter(harness.coordinator.ledger))
    assert harness.coordinator.cleanup(attempt)["sandbox"]["status"] == "cleaned"
    assert harness.coordinator.cleanup(attempt) == {"status": "already_cleaned"}
    assert len(native_calls) == 1
    assert service.dispatch_execution(execution.id, refs, registry, "formal-carrier") == receipt
    assert len(native_calls) == 1
    assert repo.get_execution(execution.id).projection.phase is not Phase.TERMINAL
    projection = ExecutionProjection(Phase.TERMINAL, Outcome.SUCCEEDED, False, Freshness.OBSERVED, datetime.now(timezone.utc))
    service.apply_finalization(ExecutionFinalizationRequest(execution.id, "explicit-finish", projection, native_refs=(receipt.correlation_ref,)))
    assert repo.get_execution(execution.id).projection.phase is Phase.TERMINAL
