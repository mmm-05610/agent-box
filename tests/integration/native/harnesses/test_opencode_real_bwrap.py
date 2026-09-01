from __future__ import annotations

import hashlib
from pathlib import Path

from agent_box.resource_contracts import PromptFragmentV1, WorkspaceV1
from agent_box.work_core import ExecutionStartRequest, Ref, RefType, ResolvedExecutionInput
from agent_box.extensions.runtime_composition import RuntimeHostV1, SandboxV1, TerminalSessionV1, digest
from agent_box_harnesses.opencode.provider import OpenCodeExecutionProvider, OpenCodeProfileV1
from agent_box_harnesses.opencode.profiles import OpenCodeProfileAuthority


def test_offline_opencode_projection_bwrap_finish_and_output(tmp_path: Path):
    workspace = tmp_path / "workspace"; workspace.mkdir()
    executable = tmp_path / "fake-opencode"  # deliberately outside Workspace
    executable.write_text("""#!/usr/bin/python3
from pathlib import Path
Path('/workspace/mutation.txt').write_text('mutated by fake opencode')
print('OPENCODE_SESSION=fake-session-1', flush=True)
print('offline output', flush=True)
""", encoding="utf-8")
    executable.chmod(0o755)

    authority = OpenCodeProfileAuthority(tmp_path / "authority")
    profile_ref = authority.save({
        "profile_id": "offline", "config": {
            "model": "fake/model", "instructions": ["AGENTS.md"],
            "mcp": {"offline": {"type": "local", "command": ["fake-mcp"]}},
            "skills": ["offline-skill"],
        }, "credential_source_ref": {"provider": "offline", "native_locator": "keychain:opencode"},
    })

    from agent_box_runtime_local.provider import LocalRuntimeHostProvider
    from agent_box_sandbox_bwrap.provider import BwrapSandboxProvider
    from agent_box_terminal_session.direct_stdio import DirectStdioResourceProvider

    host_provider = LocalRuntimeHostProvider()
    host_ref = host_provider.make_ref("native-linux")
    host = host_provider.resolve("agent-box.runtime-host@1", host_ref).port
    sandbox_provider = BwrapSandboxProvider(data_dir=tmp_path / "bwrap")
    sandbox_ref = sandbox_provider.make_ref(host_affinity=host.ref.affinity)
    sandbox = sandbox_provider.resolve("agent-box.sandbox@1", sandbox_ref)
    terminal_ref = __import__("agent_box_terminal_session.direct_stdio", fromlist=["DirectStdioSession"]).DirectStdioSession.make_ref(host_affinity=host.ref.affinity)
    terminal = DirectStdioResourceProvider(terminal_ref, transport=host.transport)

    values = (
        ResolvedExecutionInput(WorkspaceV1.contract_id, Ref(RefType.WORKSPACE, "workspace", "w1"), WorkspaceV1(workspace, digest([]))),
        ResolvedExecutionInput(OpenCodeProfileV1.contract_id, profile_ref.as_ref(), OpenCodeProfileV1(profile_ref.profile_id, profile_ref.revision, profile_ref.digest)),
        ResolvedExecutionInput(PromptFragmentV1.contract_id, Ref(RefType.ARTIFACT, "prompt", "p1"), PromptFragmentV1("offline", "run offline", "prompt-digest")),
        ResolvedExecutionInput(RuntimeHostV1.contract_id, host_ref, RuntimeHostV1(host.ref, host)),
        ResolvedExecutionInput(SandboxV1.contract_id, sandbox_ref, sandbox),
        ResolvedExecutionInput(TerminalSessionV1.contract_id, terminal_ref.as_ref() if hasattr(terminal_ref, "as_ref") else Ref(RefType.ARTIFACT, "terminal", "direct", metadata={"affinity": host.ref.affinity}), TerminalSessionV1(terminal.ref, terminal)),
    )
    provider = OpenCodeExecutionProvider(tmp_path / "plugin", authority=authority, executable=executable)
    request = ExecutionStartRequest("exec-1", "dispatch-1", "inputs", values)
    receipt = provider.start(request)
    observation = provider.finish(receipt)
    assert observation.projection.phase.value == "terminal"
    assert (workspace / "mutation.txt").read_text() == "mutated by fake opencode"
    assert observation.output_refs and "offline output" in (tmp_path / "plugin" / "projections" / "exec-1" / "opencode" / "output.txt").read_text()
    manifest = (tmp_path / "plugin" / "projections" / "exec-1" / "opencode" / "projection-manifest.json").read_text()
    assert "keychain:opencode" in manifest and "credential_values_materialized" in manifest

    next_digest = digest([("mutation.txt", "file", hashlib.sha256(b"mutated by fake opencode").hexdigest())])
    continuation_values = tuple(
        ResolvedExecutionInput(WorkspaceV1.contract_id, item.ref, WorkspaceV1(workspace, next_digest)) if item.contract_id == WorkspaceV1.contract_id else item
        for item in values
    ) + (ResolvedExecutionInput("agent-box.opencode-continuation@1", Ref(RefType.SESSION, "opencode-direct", "fake-session-1"), __import__("agent_box_harnesses.opencode.provider", fromlist=["OpenCodeContinuationV1"]).OpenCodeContinuationV1("fake-session-1")),)
    second = provider.start(ExecutionStartRequest("exec-2", "dispatch-2", "inputs-2", continuation_values))
    second_observation = provider.finish(second)
    assert second_observation.projection.phase.value == "terminal"
    assert second.runtime_handle.session_id == "fake-session-1"


def test_direct_stdio_continuation_is_explicitly_unsupported(tmp_path: Path):
    # Continuation is a new direct Execution, never a reopen of the prior
    # terminal run. PTY is not required by this offline native CLI surface.
    assert "supported-as-new-execution" == OpenCodeExecutionProvider(tmp_path).capabilities()["continuation"]
