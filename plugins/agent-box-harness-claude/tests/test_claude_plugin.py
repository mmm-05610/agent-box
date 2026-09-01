import json
import shutil
import subprocess
from pathlib import Path
from types import SimpleNamespace
import pytest
from agent_box_harness_claude.profile import ClaudeProfileProvider, ClaudeProjection
from agent_box_harness_claude.launch import ClaudeLaunchAdapter
from agent_box_harness_claude.composition import command_from_plan
from agent_box.extensions.runtime_composition import HarnessCommandSpec, MountPlan, PreparedMountSource, ResolvedComposition, RuntimeBinding, RuntimeBundle, RuntimeCompositionCoordinator

def test_native_projection_separates_profile_and_dynamic_sources(tmp_path):
    repo=ClaudeProfileProvider(tmp_path / "repo")
    ref=repo.put("main", {"settings":{"model":"sonnet","permissions":{"defaultMode":"dontAsk"}}, "credential_locator":{"env":"ANTHROPIC_API_KEY"}})
    root=ClaudeProjection(tmp_path / "projection", repo).materialize("exec-1", ref, resources=(("instruction", "CLAUDE.md", "dynamic instruction"), ("mcp", "local", {"command":"/runtime/bin/server"}), ("skill", "demo", "---\nname: demo\n---\nhelp")))
    assert json.loads((root / ".claude/settings.json").read_text())["model"] == "sonnet"
    assert json.loads((root / ".mcp.json").read_text())["mcpServers"]["local"]["command"] == "/runtime/bin/server"
    manifest=json.loads((root / "agent-box-manifest.json").read_text())
    assert manifest["credential_locator"] == {"env":"ANTHROPIC_API_KEY"}
    assert "CLAUDE.md" in manifest["native_files"]

def test_command_has_bounded_guest_runtime_sources(tmp_path):
    executable=tmp_path / "claude"; executable.write_text("#!/bin/sh\n", encoding="utf-8")
    home=tmp_path / "home"; home.mkdir(); (home / "settings.json").write_text("{}")
    hooks=tmp_path / "hooks"; hooks.mkdir(); (hooks / "session-start").write_text("", encoding="utf-8")
    workspace=tmp_path / "workspace"; workspace.mkdir()
    spec=command_from_plan(SimpleNamespace(argv=(str(executable), "--print", "hi"), env={}, cwd=workspace, profile_home=home, helper_dir=hooks), execution_id="e1", io_mode="stdio")
    assert spec.argv[0] == "/runtime/bin/claude"
    assert spec.cwd_token == "/workspace"
    assert {s.guest_target for s in spec.runtime_sources} == {"/workspace", "/runtime/home", "/runtime/bin/claude", "/runtime/hooks"}
    assert {s.kind for s in spec.runtime_sources if s.guest_target == "/workspace"} == {"workspace"}
    assert spec.projector_id == "claude-code"
    assert spec.environment["HOME"] == "/runtime/home"

def test_real_bwrap_direct_stdio_fake_claude_is_independently_staged(tmp_path):
    from agent_box_runtime_local.provider import LocalRuntimeHostProvider
    from agent_box_sandbox_bwrap.provider import BwrapSandboxProvider
    from agent_box_terminal_session import DirectStdioSession
    from agent_box.work_core import Ref, RefType, ResolvedExecutionInput
    from agent_box.extensions.runtime_composition import RuntimeHostV1, SandboxV1, TerminalSessionV1
    from agent_box_harness_claude.composition import composition_from_resolved_inputs
    sandbox_provider=BwrapSandboxProvider(tmp_path / "sandbox")
    if sandbox_provider.probe()["status"] != "available": pytest.skip("bwrap unavailable")
    workspace=tmp_path / "workspace"; workspace.mkdir()
    executable=tmp_path / "staged-claude"; executable.write_text("#!/usr/bin/python3\n" + Path(__file__).parents[1].joinpath("src/agent_box_harness_claude/fake_claude.py").read_text(), encoding="utf-8"); executable.chmod(0o755)
    home=tmp_path / "home"; (home / ".claude").mkdir(parents=True); (home / ".claude/settings.json").write_text("{}")
    hooks=tmp_path / "hooks"; hooks.mkdir(); (hooks / "session-start").write_text("", encoding="utf-8")
    plan=SimpleNamespace(argv=(str(executable), "--print", "offline"), env={}, cwd=workspace, profile_home=home, helper_dir=hooks)
    command=command_from_plan(plan, execution_id="native-claude", io_mode="stdio")
    host_provider=LocalRuntimeHostProvider(executor=lambda argv, **kwargs: subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, **kwargs))
    host_ref=host_provider.make_ref(); host=host_provider.resolve("agent-box.runtime-host@1", host_ref)
    sandbox_ref=sandbox_provider.make_ref(host_affinity=host.ref.affinity)
    sandbox=sandbox_provider.resolve("agent-box.sandbox@1", sandbox_ref)
    terminal=DirectStdioSession(DirectStdioSession.make_ref(host_affinity=host.ref.affinity))
    # The offline vertical runs through the one formal assembler: the Claude
    # projector declares the layout, the assembler builds the single MountPlan.
    request=SimpleNamespace(resolved_inputs=(
        ResolvedExecutionInput(RuntimeHostV1.contract_id, Ref(RefType.ARTIFACT, "runtime-host-local", "host"), host),
        ResolvedExecutionInput(SandboxV1.contract_id, sandbox_ref, sandbox),
        ResolvedExecutionInput(TerminalSessionV1.contract_id, Ref(RefType.ARTIFACT, "direct-stdio", "terminal", metadata={"session_digest": terminal.ref.session_digest, "affinity": terminal.ref.affinity}), TerminalSessionV1(terminal.ref, terminal)),
    ))
    binding, coordinator=composition_from_resolved_inputs(request, command)
    run=coordinator.start(binding, command, execution_id="native-claude", dispatch_id="native-claude")
    process=run.transport; stdout, stderr=process.communicate(timeout=5)
    assert process.returncode == 0 and "offline-fake-claude" in stdout and stderr == ""
    assert (workspace / "claude-fake-mutation.txt").read_text() == "native-claude\n"
    assert not (workspace / "staged-claude").exists()
    assert coordinator.projection_receipt(run.attempt_key)["projector_id"] == "claude-code"
    coordinator.cleanup(run.attempt_key)
