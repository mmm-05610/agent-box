"""P0 vertical: the executable is an independent temporary fixture, never a workspace asset."""
from agent_box.extensions.runtime_composition import RuntimeHostV1, SandboxV1, TerminalSessionV1
from agent_box.resource_contracts import PromptFragmentV1, WorkspaceV1
from agent_box.work_core import ExecutionStartRequest, ResolvedExecutionInput, Ref, RefType
from agent_box_harnesses.pi import PiExecutionProvider, PiPluginConfig, PiProfile, PiContinuationV1
from agent_box_harnesses.pi.projection import composition_from_resolved_inputs
from agent_box_runtime_local import LocalRuntimeHostProvider
from agent_box_sandbox_bwrap import BwrapSandboxProvider
from agent_box_terminal_session.direct_stdio import DirectStdioResourceProvider, DirectStdioSession

def test_e1_finish_and_e2_continuation(tmp_path):
    fake = tmp_path / "offline-fake-pi"
    fake.write_text("#!/bin/sh\nprintf 'fake-pi:%s\\n' \"$AGENT_BOX_EXECUTION_ID\"\necho mutation > /workspace/mutation.txt\n", encoding="utf-8")
    fake.chmod(0o755)
    home, sessions = tmp_path / "pi-home", tmp_path / "sessions"
    home.mkdir(); sessions.mkdir(); workspace = tmp_path / "workspace"; workspace.mkdir()
    profile = PiProfile("offline", 1, "sha256:offline", str(fake), agent_dir=home, session_root=sessions)
    host_p = LocalRuntimeHostProvider(); host_ref = host_p.make_ref(); host = host_p.resolve("agent-box.runtime-host@1", host_ref)
    sandbox_p = BwrapSandboxProvider(data_dir=tmp_path / "bwrap"); sandbox_ref = sandbox_p.make_ref(host_affinity=host.port.ref.affinity)
    sandbox = sandbox_p.resolve("agent-box.sandbox@1", sandbox_ref)
    terminal_ref = DirectStdioSession.make_ref(host_affinity=host.port.ref.affinity)
    terminal = DirectStdioResourceProvider(transport=host.port.transport).resolve("agent-box.terminal-session@1", Ref(RefType.ARTIFACT, terminal_ref.provider, terminal_ref.native_id, metadata={"session_digest":terminal_ref.session_digest,"affinity":terminal_ref.affinity}))
    def request(e, d, continuation=None):
        values = [ResolvedExecutionInput(WorkspaceV1.contract_id, Ref(RefType.ARTIFACT,"workspace","w"), WorkspaceV1(workspace,"sha256:workspace")), ResolvedExecutionInput(PromptFragmentV1.contract_id, Ref(RefType.ARTIFACT,"prompt","p"), PromptFragmentV1("task","mutate","sha256:prompt")), ResolvedExecutionInput(PiProfile.contract_id, Ref(RefType.ARTIFACT,"pi-profile","offline"), profile), ResolvedExecutionInput(RuntimeHostV1.contract_id, host_ref, host), ResolvedExecutionInput(SandboxV1.contract_id, sandbox_ref, sandbox), ResolvedExecutionInput(TerminalSessionV1.contract_id, terminal_ref, terminal)]
        if continuation: values.append(ResolvedExecutionInput(continuation.contract_id, Ref(RefType.SESSION,"pi-session",continuation.session_id), continuation))
        return ExecutionStartRequest(e,d,"sha256:inputs",tuple(values))
    provider = PiExecutionProvider(config_loader=lambda: PiPluginConfig(str(fake), agent_dir=home, session_root=sessions), composition_factory=composition_from_resolved_inputs)
    first = provider.start(request("e1","d1")); handle = first.runtime_handle
    assert not (workspace / "mutation.txt").exists()
    obs = provider.finish(handle)
    assert obs.projection.terminal and (workspace / "mutation.txt").read_text().strip() == "mutation"
    continuation = PiContinuationV1("e1", provider="deepseek")
    second = provider.start(request("e2","d2", continuation)); assert second.execution_id == "e2"
    assert second.correlation_ref.native_id == "e1"
