from pathlib import Path
from agent_box.resource_contracts import AgentBoxProfileV1, PromptFragmentV1, WorkspaceV1
from agent_box.work_core import ExecutionStartRequest, Ref, RefType, ResolvedExecutionInput
from agent_box.extensions.runtime_composition import RuntimeHostV1, SandboxV1, TerminalSessionV1
from agent_box_harnesses.hermes.profile import HermesProfileProvider
from agent_box_harnesses.hermes.projection import HermesProjection
from agent_box_harnesses.hermes.launch import HermesLaunchAdapter
from agent_box_harnesses.hermes.provider import HermesExecutionProvider
from agent_box_runtime_local.provider import LocalRuntimeHostProvider
from agent_box_sandbox_bwrap.provider import BwrapSandboxProvider
from agent_box_terminal_session.direct_stdio import DirectStdioResourceProvider

def test_offline_fake_hermes_real_bwrap_finish(tmp_path):
    fake = tmp_path / "fake-hermes"
    fake.write_text("#!/bin/sh\nread prompt\nprintf 'HERMES_OFFLINE_OK\\n'\n", encoding="utf-8")
    fake.chmod(0o755)
    workspace = tmp_path / "workspace"; workspace.mkdir(); (workspace / "input.txt").write_text("shared")
    profiles = HermesProfileProvider(tmp_path / "profiles")
    profiles.save({"name":"offline", "config":{"model":{"default":"offline"}, "skills":["shared"], "mcp":["shared"], "instructions":["shared"], "resources":["shared"]}, "credential_source_ref":{"provider":"hermes", "native_locator":"login/default"}})
    adapter = HermesLaunchAdapter(HermesProjection(tmp_path / "projection", profiles), binary=str(fake))
    host = LocalRuntimeHostProvider(); host_ref = host.make_ref()
    sandbox = BwrapSandboxProvider(tmp_path / "sandbox"); sandbox_ref = sandbox.make_ref(host_affinity=host_ref.metadata["affinity"])
    terminal = DirectStdioResourceProvider(); terminal_ref = terminal.make_ref(host_affinity=host_ref.metadata["affinity"])
    terminal_input = Ref(RefType.ARTIFACT, "direct-stdio", "direct-stdio", metadata={"session_digest":terminal_ref.session_digest, "affinity":terminal_ref.affinity})
    profile_ref = profiles.ref("offline")
    request = ExecutionStartRequest("execution-1", "dispatch-1", "inputs", (
        ResolvedExecutionInput(WorkspaceV1.contract_id, Ref(RefType.WORKSPACE, "test", "workspace"), WorkspaceV1(workspace, "sha256:workspace")),
        ResolvedExecutionInput(PromptFragmentV1.contract_id, Ref(RefType.ARTIFACT, "test", "prompt"), PromptFragmentV1("task", "hello", "sha256:prompt")),
        ResolvedExecutionInput(AgentBoxProfileV1.contract_id, profile_ref, profiles.resolve(AgentBoxProfileV1.contract_id, profile_ref)),
        ResolvedExecutionInput(RuntimeHostV1.contract_id, host_ref, host.resolve("agent-box.runtime-host@1", host_ref)),
        ResolvedExecutionInput(SandboxV1.contract_id, sandbox_ref, sandbox.resolve("agent-box.sandbox@1", sandbox_ref)),
        ResolvedExecutionInput(TerminalSessionV1.contract_id, terminal_input, terminal.resolve(TerminalSessionV1.contract_id, terminal_input)),
    ))
    provider = HermesExecutionProvider(tmp_path / "evidence", launch_adapter=adapter)
    receipt = provider.start(request)
    assert provider.observe(receipt.runtime_handle)["projection"].phase.value == "active"
    result = provider.finish(receipt)
    assert result["projection"].terminal
    assert result["projection"].outcome.value == "succeeded"
    assert "HERMES_OFFLINE_OK" in (tmp_path / "evidence" / "dispatch-1.txt").read_text()
    assert not (tmp_path / "projection" / "execution-1").exists()
