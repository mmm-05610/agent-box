"""OpenCode synthetic-executable verticals: the REAL formal launch chain.

Level 1 (unconditional, offline fake runtime ports): plan-shape truth through
the real chain stages — profile freeze into the staged execution home, exec
argv ``opencode run --format json``, XDG home relocation in the plan
environment, launch-selection dispatch (declared modes only, no silent
fallback), native continuation argv ``-s <sessionID>``, and host-path
redaction in plan environment.

Level 2 (real spawn, bwrap-gated): the synthetic "opencode" binary runs
inside the real bubblewrap sandbox through staging -> lowering -> assembler ->
coordinator -> spawn: live workspace mutation, guest-side XDG relocation,
observation decode (MESSAGE/SESSION/TERMINAL with a session locator),
nonzero exit -> failed terminal + FinishProposal (never a fabricated
success), and runtime-transport cancel honesty.

Level 3 (ACP second mode, gated on the offline ``acp --version`` probe): the
fake protocol server drives the launch-selection ``acp`` path; the session
driver streams observations and cancel flows through the session driver.

No model request, no credential read, no real OpenCode binary required.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import pytest

from agent_box.protocols.runtime import SandboxV1, content_digest
from agent_box.resource_contracts import (
    LaunchSelectionV1, PromptFragmentV1, WorkspaceV1,
)
from agent_box.work_core import ExecutionStartRequest, Ref, RefType, ResolvedExecutionInput
from agent_box_harnesses.adapters import ADAPTERS
from agent_box_harnesses.adapters.failures import PlanRejected
from agent_box_harnesses.adapters.observation import ObservationKind, TerminalCondition
from agent_box_harnesses.generic.execution_provider import GenericExecutionProvider
from agent_box_harnesses.generic.profile_envelope import ProfileEnvelope
from agent_box_harnesses.opencode.provider import OpenCodeContinuationV1
from agent_box_harnesses.resources.executable import resolve_executable
from agent_box_runtime_local.provider import LocalRuntimeHostProvider
from agent_box_sandbox_bwrap.provider import BwrapSandboxProvider
from agent_box_terminal_session.direct_stdio import DirectStdioResourceProvider
from agent_box_terminal_session.direct_stdio import DirectStdioSession
from helpers import definition_by_driver, make_fake_executable, make_request, resolved_executable_for

MODEL = "synthetic-provider/synthetic-model"

OPCODE_SUCCESS_BODY = """#!/bin/sh
printf '{"type":"message.updated","sessionID":"sess-vert-1","parts":[{"type":"text","text":"hello from synthetic opencode"}]}\\n'
printf '{"type":"message.part.updated","sessionID":"sess-vert-1","part":{"type":"text","text":"partial assistant text"}}\\n'
printf '{"type":"session.info","sessionID":"sess-vert-1","projectID":"proj-1"}\\n'
echo mutated > /workspace/mutation.txt
env > /workspace/guest-env.txt
if [ -f /runtime/home/.config/opencode/opencode.json ]; then
  cat /runtime/home/.config/opencode/opencode.json > /workspace/config-seen.json
else
  echo absent > /workspace/config-seen.json
fi
printf '{"type":"session.status","sessionID":"sess-vert-1","status":{"type":"idle"}}\\n'
"""

OPCODE_FAILURE_BODY = """#!/bin/sh
printf '{"type":"session.error","sessionID":"sess-err-1","data":{"message":"synthetic failure"}}\\n'
exit 3
"""

OPCODE_CANCEL_BODY = """#!/bin/sh
printf '{"type":"session.info","sessionID":"sess-cancel-1"}\\n'
sleep 30
"""


def _offline_provider(tmp_path: Path) -> tuple[GenericExecutionProvider, object]:
    definition = definition_by_driver("opencode")
    executable = resolved_executable_for(tmp_path, definition, probe=False)
    provider = GenericExecutionProvider(
        definition, ADAPTERS["opencode"], staging_root=tmp_path / "staging",
        executable_resolver=lambda spec: executable,
    )
    return provider, executable


def _profile() -> ProfileEnvelope:
    return ProfileEnvelope(
        name="main", agent_type="opencode", digest="sha256:" + "2" * 64,
        native_payload={"model": MODEL, "managed_only_key": {"nested": True}},
    )


def _wait_exit(process, timeout_s: float = 15.0):
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        code = process.poll()
        if code is not None:
            return code
        time.sleep(0.05)
    return None


def _redaction_assertions(provider, observations, forbidden: list[str]):
    for observation in observations:
        rendered = repr(observation)
        for secret in forbidden:
            assert secret not in rendered
    for secret in forbidden:
        assert secret not in repr(provider.diagnostics())


# --------------------------------------------------------------------------- #
# Level 1: unconditional plan-shape truth through the real chain stages
# --------------------------------------------------------------------------- #

def test_profile_freeze_renders_model_into_staged_opencode_json(tmp_path):
    provider, executable = _offline_provider(tmp_path)
    request, *_ = make_request(tmp_path, provider.definition, executable=executable,
                               profile=_profile(), prompt="freeze me")
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    # the managed config is frozen into the execution home at the native path
    staged_config = handle.staged_home.root / ".config" / "opencode" / "opencode.json"
    assert staged_config.is_file()
    rendered = json.loads(staged_config.read_text(encoding="utf-8"))
    assert rendered == {"model": MODEL}  # managed-only vocabulary never reaches the native file
    # the adapter owns the vendor payload vocabulary for the model selection
    assert provider.profile_model_selection(_profile()) == MODEL
    assert ADAPTERS["opencode"].profile_model({"model": MODEL}) == MODEL
    assert ADAPTERS["opencode"].profile_model({}) is None  # honest absence
    assert ADAPTERS["opencode"].profile_model({"model": "   "}) is None


def test_exec_argv_is_opencode_run_format_json_and_xdg_home_relocates(tmp_path):
    provider, executable = _offline_provider(tmp_path)
    request, *_ = make_request(tmp_path, provider.definition, executable=executable,
                               prompt="run the task")
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    assert handle.plan.argv[:4] == ("/runtime/bin/opencode", "run", "--format", "json")
    # the prompt fragment is rendered last (title header + content)
    assert handle.plan.argv[4] == "# task\n\nrun the task"
    environment = handle.plan.environment
    assert environment["HOME"] == "/runtime/home"
    assert environment["XDG_CONFIG_HOME"] == "/runtime/home/.config"
    assert environment["XDG_DATA_HOME"] == "/runtime/home/.data"
    assert environment["XDG_CACHE_HOME"] == "/runtime/home/.cache"
    assert environment["XDG_STATE_HOME"] == "/runtime/home/.state"
    # no host path may leak into the guest environment
    assert not any(str(tmp_path) in value for value in environment.values())


def test_launch_selection_input_selects_declared_modes_only(tmp_path):
    provider, executable = _offline_provider(tmp_path)

    def request_with(mode: str | None, *, dispatch_id: str):
        extra = () if mode is None else (LaunchSelectionV1(mode),)
        request, *_ = make_request(tmp_path, provider.definition, executable=executable,
                                   prompt="mode probe", dispatch_id=dispatch_id,
                                   execution_id="exec_" + dispatch_id, extra_inputs=extra)
        return request

    receipt = provider.start(request_with("exec", dispatch_id="dispatch_mode_exec"))
    assert receipt.runtime_handle.plan.launch_mode_name == "exec"
    # explicit acp selection through the resolved launch-selection input
    receipt = provider.start(request_with("acp", dispatch_id="dispatch_mode_acp"))
    handle = receipt.runtime_handle
    assert handle.plan.launch_mode_name == "acp"
    assert handle.plan.argv == ("/runtime/bin/opencode", "acp")
    assert "mode probe" not in handle.plan.argv  # prompt travels over the protocol
    # an undeclared mode is a fail-closed plan rejection, never a fallback
    with pytest.raises(PlanRejected) as exc:
        provider.start(request_with("turtle-mode", dispatch_id="dispatch_mode_bad"))
    assert exc.value.code == "LAUNCH_MODE_UNDECLARED"
    # more than one launch selection is invalid
    doubled, *_ = make_request(tmp_path, provider.definition, executable=executable,
                               prompt="mode probe", dispatch_id="dispatch_mode_double",
                               execution_id="exec_dispatch_mode_double",
                               extra_inputs=(LaunchSelectionV1("exec"), LaunchSelectionV1("acp")))
    with pytest.raises(PlanRejected) as exc:
        provider.start(doubled)
    assert exc.value.code == "LAUNCH_MODE_INVALID"


def test_exec_continuation_argv_shape_is_dash_s_session_id(tmp_path):
    provider, executable = _offline_provider(tmp_path)
    request, *_ = make_request(tmp_path, provider.definition, executable=executable,
                               prompt="continue the task",
                               extra_inputs=(OpenCodeContinuationV1("sess-abc-123"),))
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    assert handle.plan.continuation is not None
    assert handle.plan.continuation.kind == "native_session"
    assert handle.plan.continuation.argv == ("-s", "sess-abc-123")
    assert handle.plan.argv[:4] == ("/runtime/bin/opencode", "run", "-s", "sess-abc-123")
    assert handle.plan.argv[4:] == ("--format", "json", "# task\n\ncontinue the task")


def test_continuation_ref_carries_registry_contract_and_target(tmp_path):
    provider, _ = _offline_provider(tmp_path)
    ref = provider.continuation_ref("sess-abc-123")
    assert ref.provider == "opencode-continuation"  # registry-declared target provider
    assert provider.continuation_contract_id() == "agent-box.opencode-continuation@1"
    assert ref.metadata["harness_type"] == "opencode"
    with pytest.raises(PlanRejected):
        provider.continuation_ref("")
    with pytest.raises(PlanRejected):
        provider.continuation_ref("sess", extra_metadata={"ok": 123})  # non-str metadata value


# --------------------------------------------------------------------------- #
# Level 2: real spawn verticals (real bwrap; skipped only when bwrap cannot run)
# --------------------------------------------------------------------------- #

def _real_chain(tmp_path: Path, body: str, *, profile=None, workspace: Path | None = None):
    definition = definition_by_driver("opencode")
    binary = make_fake_executable(tmp_path / "bin", "opencode", body=body)
    executable = resolve_executable(definition.executable, search_path=str(tmp_path / "bin"), probe=False)
    sandbox_plugin = BwrapSandboxProvider(tmp_path / "sandbox")
    if sandbox_plugin.probe()["status"] != "available":
        pytest.skip("real bwrap unavailable: binary missing or namespace capability denied")

    host_provider = LocalRuntimeHostProvider()
    host_ref = host_provider.make_ref()
    affinity = host_ref.metadata["affinity"]
    sandbox_ref = sandbox_plugin.make_ref("bwrap-cloud-harness", host_affinity=affinity)
    terminal_ref = DirectStdioSession.make_ref(host_affinity=affinity)
    host_v1 = host_provider.resolve("agent-box.runtime-host@1", host_ref)
    sandbox_v1 = sandbox_plugin.resolve("agent-box.sandbox@1", sandbox_ref)
    terminal_provider = DirectStdioResourceProvider(transport=host_v1.port.transport)
    terminal_v1 = terminal_provider.resolve("agent-box.terminal-session@1", terminal_ref)

    workspace = workspace or tmp_path / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)
    inputs = [
        ResolvedExecutionInput("agent-box.workspace@1", Ref(RefType.WORKSPACE, "w", "w"),
                               WorkspaceV1(workspace, content_digest(workspace))),
        ResolvedExecutionInput("agent-box.prompt-fragment@1", Ref(RefType.ARTIFACT, "p", "p"),
                               PromptFragmentV1("task", "mutate the workspace", "sha256:" + "0" * 64)),
        ResolvedExecutionInput(host_v1.contract_id, host_ref, host_v1),
        ResolvedExecutionInput(sandbox_v1.contract_id, sandbox_ref, sandbox_v1),
        ResolvedExecutionInput(terminal_v1.contract_id, terminal_ref, terminal_v1),
    ]
    if profile is not None:
        inputs.append(ResolvedExecutionInput(
            profile.contract_id, Ref(RefType.ARTIFACT, "harness-profile", "main",
                                     metadata={"harness_type": definition.harness_type,
                                               "revision": str(profile.revision), "digest": profile.digest}),
            profile,
        ))
    request = ExecutionStartRequest("exec_opencode_vertical", "dispatch_opencode_vertical",
                                    "inputs-digest", tuple(inputs))
    provider = GenericExecutionProvider(definition, ADAPTERS["opencode"], staging_root=tmp_path / "staging",
                                        executable_resolver=lambda spec: executable)
    return provider, request, workspace


def test_full_exec_vertical_real_sandbox(tmp_path):
    provider, request, workspace = _real_chain(tmp_path, OPCODE_SUCCESS_BODY, profile=_profile())
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    process = handle.runtime.transport
    exit_code = _wait_exit(process)
    assert exit_code == 0, process.stderr.read()[:400] if process.stderr else "process failed"

    # live workspace mutation through the rw projection
    assert (workspace / "mutation.txt").read_text().strip() == "mutated"

    # XDG env relocation observed from inside the guest, with no host paths
    guest_env = (workspace / "guest-env.txt").read_text()
    assert "HOME=/runtime/home\n" in guest_env
    assert "XDG_CONFIG_HOME=/runtime/home/.config\n" in guest_env
    assert "XDG_DATA_HOME=/runtime/home/.data\n" in guest_env
    assert "XDG_CACHE_HOME=/runtime/home/.cache\n" in guest_env
    assert "XDG_STATE_HOME=/runtime/home/.state\n" in guest_env
    assert str(tmp_path) not in guest_env and str(Path.home()) not in guest_env

    # profile freeze proven from inside the guest: the managed config is at
    # the native guest path and carries exactly the model selection
    seen = json.loads((workspace / "config-seen.json").read_text())
    assert seen == {"model": MODEL}
    host_staged = handle.staged_home.root / ".config" / "opencode" / "opencode.json"
    assert json.loads(host_staged.read_text(encoding="utf-8")) == {"model": MODEL}

    # observation decode: MESSAGE + SESSION facts and the native terminal
    observations = provider.observe(handle)
    kinds = {item.kind for item in observations}
    assert ObservationKind.MESSAGE in kinds and ObservationKind.SESSION in kinds
    terminal = observations[-1]
    assert terminal.kind is ObservationKind.TERMINAL
    assert terminal.terminal_condition is TerminalCondition.COMPLETED
    assert terminal.session_locator == "sess-vert-1"  # native sessionID fact

    # redaction: no host path in observations or diagnostics
    _redaction_assertions(provider, observations, [str(tmp_path), str(Path.home())])

    # process exit produced a FinishProposal only; the Host decides.
    # (stdout drains exactly once: the finish re-observation falls back to an
    # honest PROCESS_EXIT terminal, which is still a proposal, never a
    # Work Core Finish and never a fabricated success.)
    proposal = provider.finish(handle)
    assert proposal.decision_owner == "host"
    assert proposal.exit_code == 0
    assert proposal.terminal.is_error is False


def test_exec_vertical_session_error_exit3_is_a_failed_terminal(tmp_path):
    provider, request, workspace = _real_chain(tmp_path, OPCODE_FAILURE_BODY)
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    assert _wait_exit(handle.runtime.transport) == 3
    observations = provider.observe(handle)
    terminal = observations[-1]
    assert terminal.kind is ObservationKind.TERMINAL
    assert terminal.terminal_condition is TerminalCondition.FAILED
    assert terminal.is_error is True
    assert "synthetic failure" in terminal.text
    # no fabricated success: the FinishProposal carries the failure truth
    # (exit 3 -> is_error), and the decision stays with the Host
    proposal = provider.finish(handle)
    assert proposal.exit_code == 3
    assert proposal.decision_owner == "host"
    assert proposal.terminal.is_error is True
    assert proposal.terminal.terminal_condition is TerminalCondition.PROCESS_EXIT
    assert not (workspace / "mutation.txt").exists()


def test_cancel_dispatch_terminates_running_exec_and_never_fabricates_completion(tmp_path):
    provider, request, workspace = _real_chain(tmp_path, OPCODE_CANCEL_BODY)
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    process = handle.runtime.transport
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline and process.poll() is None:
        time.sleep(0.05)
    assert process.poll() is None  # still running

    result = provider.cancel_dispatch(receipt.dispatch_id)
    assert result["state"] == "terminate_sent"
    assert result["via"] == "runtime-transport"

    deadline = time.monotonic() + 10
    while time.monotonic() < deadline and process.poll() is None:
        time.sleep(0.05)
    exit_code = process.poll()
    assert exit_code is not None and exit_code != 0  # terminated, not completed

    state = provider.dispatch_state(receipt.dispatch_id)
    assert state["state"] == "terminal"
    assert state["exit_code"] == exit_code
    # cancelled dispatches are never recorded as native completions
    assert exit_code != 0
    assert not (workspace / "mutation.txt").exists()


# --------------------------------------------------------------------------- #
# Level 3: ACP second mode via launch-selection (gated on the offline probe)
# --------------------------------------------------------------------------- #

def test_acp_mode_via_launch_selection_streams_and_cancels_through_session_driver(tmp_path):
    pytest.importorskip("agent_box_acp", reason="agent-box-acp engine is not installed")
    fixtures = Path(__file__).resolve().parents[2] / "agent-box-acp" / "tests" / "fixtures" / "fake_acp_agent.py"
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    binary = bin_dir / "opencode"
    binary.write_text(
        "#!/bin/sh\n"
        'if [ "$1" = "acp" ] && [ "$2" = "--version" ]; then echo "opencode-fake-acp 1.0"; exit 0; fi\n'
        f'FAKE_ACP_MODE=normal exec {sys.executable} {fixtures}\n',
        encoding="utf-8",
    )
    binary.chmod(0o755)
    definition = definition_by_driver("opencode")
    executable = resolve_executable(definition.executable, search_path=str(bin_dir), probe=False)
    provider = GenericExecutionProvider(definition, ADAPTERS["opencode"], staging_root=tmp_path / "staging",
                                        executable_resolver=lambda spec: executable)
    # the offline probe must pass before this vertical is meaningful
    truth = provider.session_mode_truth()["acp"]
    if truth["state"] != "available":
        pytest.skip(f"offline ACP probe did not pass: {truth['reason']}")

    # real host spawn through a synthetic sandbox that maps the guest binary
    # onto the host fake agent (no real sandbox is required for stdio ACP)
    host_path = str(binary)
    from agent_box.protocols.runtime.protocol import IsolatedProcessSpec, SandboxRef
    from helpers import FakeSandboxPort

    host_provider = LocalRuntimeHostProvider()
    host_ref = host_provider.make_ref()
    affinity = host_ref.metadata["affinity"]
    sandbox_ref = SandboxRef("fake-sandbox", "s", "digest-s", affinity, network_mode="inherit")
    sandbox_port = FakeSandboxPort(sandbox_ref)

    def _wrap(mount_plan, command, *, attempt_key):
        argv = (host_path,) + tuple(command.argv)[1:]
        return IsolatedProcessSpec("spawn:fake", attempt_key, "digest:fake", command.io_mode, local_argv=argv)

    sandbox_port.wrap = _wrap
    sandbox_v1 = SandboxV1(sandbox_ref, sandbox_port)
    terminal_ref = DirectStdioSession.make_ref(host_affinity=affinity)
    host_v1 = host_provider.resolve("agent-box.runtime-host@1", host_ref)
    terminal_provider = DirectStdioResourceProvider(transport=host_v1.port.transport)
    terminal_v1 = terminal_provider.resolve("agent-box.terminal-session@1", terminal_ref)
    workspace = tmp_path / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)
    request = ExecutionStartRequest("exec_acp_vertical", "dispatch_acp_vertical", "inputs-digest", (
        ResolvedExecutionInput("agent-box.workspace@1", Ref(RefType.WORKSPACE, "w", "w"),
                               WorkspaceV1(workspace, content_digest(workspace))),
        ResolvedExecutionInput("agent-box.prompt-fragment@1", Ref(RefType.ARTIFACT, "p", "p"),
                               PromptFragmentV1("task", "vertical prompt", "sha256:" + "0" * 64)),
        ResolvedExecutionInput("agent-box.launch-selection@1", Ref(RefType.ARTIFACT, "ls", "ls"),
                               LaunchSelectionV1("acp")),
        ResolvedExecutionInput(host_v1.contract_id, host_ref, host_v1),
        ResolvedExecutionInput(sandbox_v1.contract_id, sandbox_ref, sandbox_v1),
        ResolvedExecutionInput(terminal_v1.contract_id, terminal_ref, terminal_v1),
    ))

    receipt = provider.start(request)  # launch-selection acp, no silent exec fallback
    handle = receipt.runtime_handle
    assert handle.plan.launch_mode_name == "acp"
    assert handle.plan.argv == ("/runtime/bin/opencode", "acp")
    assert "vertical prompt" not in handle.plan.argv

    driver = provider.attach_session_driver(receipt.dispatch_id)
    seen = []
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline and driver.terminal_state() is None:
        seen.extend(driver.poll(timeout=0.5).observations)
    kinds = {item.kind for item in seen}
    assert ObservationKind.MESSAGE in kinds
    assert driver.terminal_state() is not None

    # cancel through the session-driver path; termination is provable
    result = provider.cancel_dispatch(receipt.dispatch_id)
    assert result == {"state": "terminate_sent", "via": "session-driver"}
    state = provider.dispatch_state(receipt.dispatch_id)
    assert state["state"] == "terminal" and state["via"] == "session-driver"

    proposal = provider.finish(handle)
    assert proposal.decision_owner == "host" and proposal.harness_type == "opencode"
    driver.close()
    handle.runtime.transport.wait(timeout=5)
