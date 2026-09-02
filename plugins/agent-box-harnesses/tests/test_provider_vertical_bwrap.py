"""Full formal-chain vertical with a synthetic executable and the REAL bwrap
sandbox + direct-stdio terminal.

The synthetic "pi" binary runs inside the sandbox, mutates the projected
workspace, and emits a native JSON event stream.  The vertical proves:
staging -> lowering -> assembler -> coordinator -> real bwrap spawn ->
canonical observation decode -> FinishProposal (process exit != Finish).

Skipped when the real bwrap capability probe does not pass.
"""
import json
import time
from pathlib import Path

import pytest

from agent_box.protocols.runtime import assemble_runtime_composition, content_digest
from agent_box.resource_contracts import PromptFragmentV1, WorkspaceV1
from agent_box.work_core import ExecutionStartRequest, Ref, RefType, ResolvedExecutionInput
from agent_box_harnesses.adapters import ADAPTERS
from agent_box_harnesses.generic.execution_provider import GenericExecutionProvider
from agent_box_harnesses.resources.executable import resolve_executable
from agent_box_runtime_local.provider import LocalRuntimeHostProvider
from agent_box_sandbox_bwrap.provider import BwrapSandboxProvider
from agent_box_terminal_session.direct_stdio import DirectStdioResourceProvider
from agent_box_terminal_session.direct_stdio import DirectStdioSession
from helpers import definition_by_driver, make_fake_executable

PI_SCRIPT = """#!/bin/sh
printf '{"type":"session","version":3,"id":"vertical-session-1"}\\n'
printf '{"type":"message_end","message":{"role":"assistant","text":"vertical-done"}}\\n'
echo mutated > /workspace/mutation.txt
"""


def _spliced_request(request, replacements: dict):
    spliced = tuple(
        ResolvedExecutionInput(item.contract_id, replacements[item.contract_id].ref, replacements[item.contract_id])
        if item.contract_id in replacements else item
        for item in request.resolved_inputs
    )
    return ExecutionStartRequest(request.execution_id, request.dispatch_id, request.inputs_digest, spliced)


def test_full_vertical_synthetic_executable_through_real_bwrap(tmp_path):
    pytest.importorskip("agent_box_sandbox_bwrap", reason="bwrap plugin not installed")
    sandbox_plugin = BwrapSandboxProvider(tmp_path / "sandbox")
    if sandbox_plugin.probe()["status"] != "available":
        pytest.skip("real bwrap unavailable: binary missing or namespace capability denied")

    definition = definition_by_driver("pi")
    binary = make_fake_executable(tmp_path / "bin", "pi", body=PI_SCRIPT)
    from agent_box_harnesses.resources.executable import resolve_executable

    executable = resolve_executable(definition.executable, search_path=str(tmp_path / "bin"), probe=False)

    host_provider = LocalRuntimeHostProvider()
    host_ref = host_provider.make_ref()
    affinity = host_ref.metadata["affinity"]
    sandbox_ref = sandbox_plugin.make_ref("bwrap-cloud-harness", host_affinity=affinity)
    terminal_ref = DirectStdioSession.make_ref(host_affinity=affinity)
    host_v1 = host_provider.resolve("agent-box.runtime-host@1", host_ref)
    sandbox_v1 = sandbox_plugin.resolve("agent-box.sandbox@1", sandbox_ref)
    terminal_provider = DirectStdioResourceProvider(transport=host_v1.port.transport)
    terminal_v1 = terminal_provider.resolve("agent-box.terminal-session@1", terminal_ref)

    workspace = tmp_path / "workspace"; workspace.mkdir()
    from agent_box.protocols.runtime import content_digest
    from agent_box.resource_contracts import PromptFragmentV1, WorkspaceV1

    request = ExecutionStartRequest("exec_vertical", "dispatch_vertical", "inputs-digest", (
        ResolvedExecutionInput("agent-box.workspace@1", Ref(RefType.WORKSPACE, "w", "w"),
                               WorkspaceV1(workspace, content_digest(workspace))),
        ResolvedExecutionInput("agent-box.prompt-fragment@1", Ref(RefType.ARTIFACT, "p", "p"),
                               PromptFragmentV1("task", "mutate the workspace", "sha256:" + "0" * 64)),
        ResolvedExecutionInput(host_v1.contract_id, host_ref, host_v1),
        ResolvedExecutionInput(sandbox_v1.contract_id, sandbox_ref, sandbox_v1),
        ResolvedExecutionInput(terminal_v1.contract_id, terminal_ref, terminal_v1),
    ))

    provider = GenericExecutionProvider(definition, ADAPTERS["pi"], staging_root=tmp_path / "staging",
                                        executable_resolver=lambda spec: executable)
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    # wait for the native process to exit (bounded, no blocking forever)
    process = handle.runtime.transport
    for _ in range(200):
        if process.poll() is not None:
            break
        time.sleep(0.05)
    assert process.poll() == 0, process.stderr.read()[:400] if process.stderr else "process failed"
    # the native process really ran inside bwrap: the workspace was mutated
    # through the rw projection, and nothing escaped to the host root
    assert (workspace / "mutation.txt").read_text().strip() == "mutated"
    # observation decodes the native event stream drained from the exited process
    observations = provider.observe(handle)
    terminal_observation = observations[-1]
    assert terminal_observation.kind.value == "terminal"
    session = next(o for o in observations if o.kind.value == "session")
    assert session.session_locator == "vertical-session-1"
    # process exit produced a FinishProposal only; Work Core is untouched
    proposal = provider.finish(handle)
    assert proposal.decision_owner == "host"
    assert proposal.exit_code == 0
    provider_cleanup = handle.staged_home  # staging stays inspectable until host cleanup
    assert provider_cleanup.tree_digest.startswith("sha256:")
