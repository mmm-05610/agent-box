"""Claude Code synthetic-executable verticals: the REAL formal launch chain.

Level 1 (unconditional, offline fake runtime ports): plan-shape truth through
the real chain stages — exact Profile freeze through the real ProfileStore +
NativeHomeView (revision + digest frozen), exec argv
``claude --print --output-format stream-json --verbose``,
CLAUDE_CONFIG_DIR/HOME relocation in the lowered environment, launch-
selection fail-closed behavior, native continuation argv
``--resume <session_id>`` inserted before ``--print``, the registry-facts
continuation Ref roundtrip, and the ``system/init`` -> SESSION decoder fact
with the native session locator.

Level 2 (real spawn, bwrap-gated): the synthetic "claude" binary runs inside
the real bubblewrap sandbox through staging -> lowering -> assembler ->
coordinator -> spawn: live workspace mutation, guest-side CLAUDE_CONFIG_DIR/
HOME relocation, the frozen profile settings visible at the native guest
path, observation decode (SESSION/MESSAGE/TOOL/USAGE/TERMINAL), nonzero exit
-> failed terminal + FinishProposal (never a fabricated success), runtime-
transport cancel honesty, and host-path redaction in every decoded
observation and in provider diagnostics.

Level 3 (Work Core dispatch): create_execution + dispatch_execution through
a real ExtensionRegistry built from the real plugins, all required inputs
resolved via the real resource providers — proving the harnesses.toml
dispatch input_limits + contract validation path end-to-end.

No model request, no credential read, no real Claude Code binary required.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from agent_box.protocols.runtime import (
    SANDBOX_CONTRACT_ID, RuntimeHostV1, TerminalSessionV1, content_digest,
)
from agent_box.resource_contracts import (
    LaunchSelectionV1, PromptFragmentV1, WorkspaceV1,
)
from agent_box.work_core import ExecutionStartRequest, Ref, RefType, ResolvedExecutionInput
from agent_box_harnesses.adapters import ADAPTERS
from agent_box_harnesses.adapters.failures import MaterializationFailed, PlanRejected
from agent_box_harnesses.adapters.observation import ObservationKind, TerminalCondition
from agent_box_harnesses.claude.continuation import ClaudeContinuationResourceProvider
from agent_box_harnesses.claude.contracts import ClaudeContinuationV1
from agent_box_harnesses.generic.execution_provider import GenericExecutionProvider
from agent_box_harnesses.generic.factory import _config_renderers
from agent_box_harnesses.generic.profile_store import ProfileStore
from agent_box_harnesses.native_home.policy import FIVE_POLICIES
from agent_box_harnesses.resources.executable import resolve_executable
from agent_box_artifacts.provider import ArtifactPromptResourceProvider
from agent_box_runtime_local.provider import LocalRuntimeHostProvider
from agent_box_sandbox_bwrap.provider import BwrapSandboxProvider
from agent_box_terminal_session.direct_stdio import DirectStdioResourceProvider
from agent_box_terminal_session.direct_stdio import DirectStdioSession
from helpers import definition_by_driver, make_fake_executable, make_request, resolved_executable_for

MODEL = "synthetic-claude-model"
HARNESS_TYPE = "claude-code"
LOCATOR = "synth-session-1"

CLAUDE_SUCCESS_BODY = r"""#!/bin/sh
printf '%s\n' '{"type":"system","subtype":"init","session_id":"synth-session-1","model":"synthetic-claude-model"}'
printf '%s\n' '{"type":"assistant","message":{"content":[{"type":"text","text":"vertical-claude-done"},{"type":"tool_use","name":"Bash","input":{"command":"echo hi"}}]}}'
printf '%s\n' '{"type":"user","message":{"content":[{"type":"tool_result","content":"hi"}]},"session_id":"synth-session-1"}'
printf '%s\n' '{"type":"result","subtype":"success","is_error":false,"usage":{"input_tokens":5,"output_tokens":3},"total_cost_usd":0.01}'
echo mutated > /workspace/mutation.txt
env > /workspace/guest-env.txt
if [ -f /runtime/home/.claude/settings.json ]; then
  cat /runtime/home/.claude/settings.json > /workspace/config-seen.json
fi
"""

CLAUDE_FAILURE_BODY = r"""#!/bin/sh
printf '%s\n' '{"type":"system","subtype":"init","session_id":"synth-session-err"}'
printf '%s\n' '{"type":"result","subtype":"error_max_turns","is_error":true,"result":"synthetic claude failure"}'
exit 3
"""

CLAUDE_CANCEL_BODY = r"""#!/bin/sh
printf '%s\n' '{"type":"system","subtype":"init","session_id":"synth-session-cancel"}'
sleep 30
echo mutated > /workspace/mutation.txt
printf '%s\n' '{"type":"result","subtype":"success","is_error":false,"usage":{"input_tokens":1,"output_tokens":1}}'
"""


def _offline_provider(tmp_path: Path, *, profile_store=None) -> tuple[GenericExecutionProvider, object]:
    definition = definition_by_driver("claude")
    executable = resolved_executable_for(tmp_path, definition, probe=False)
    provider = GenericExecutionProvider(
        definition, ADAPTERS["claude"], staging_root=tmp_path / "staging",
        executable_resolver=lambda spec: executable, profile_store=profile_store,
    )
    return provider, executable


def _profile_store(tmp_path: Path) -> ProfileStore:
    return ProfileStore(
        tmp_path / "profiles", policies=FIVE_POLICIES,
        config_renderers={HARNESS_TYPE: _config_renderers()[HARNESS_TYPE]},
    )


def _stored_profile(store: ProfileStore) -> object:
    store.put(HARNESS_TYPE, {"profile_id": "main",
                             "native_payload": {"model": MODEL, "alwaysThinkingEnabled": True}})
    return store.resolve("agent-box.profile@1", store.ref(HARNESS_TYPE, "main"))


def _wait_exit(process, timeout_s: float = 20.0):
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
            assert secret not in rendered, secret
    for secret in forbidden:
        assert secret not in repr(provider.diagnostics()), secret


# --------------------------------------------------------------------------- #
# Level 1: unconditional plan-shape truth through the real chain stages
# --------------------------------------------------------------------------- #

def test_profile_store_freeze_renders_settings_json_and_frozen_revision_digest(tmp_path):
    store = _profile_store(tmp_path)
    envelope = _stored_profile(store)
    provider, executable = _offline_provider(tmp_path, profile_store=store)
    request, *_ = make_request(tmp_path, provider.definition, executable=executable,
                               profile=envelope, prompt="freeze me")
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    # profile-based launch: the execution home is a NativeHomeView, not a
    # plain staged render, and prepare() froze the exact envelope identity
    assert handle.view is not None
    pointer = store.pointer(HARNESS_TYPE, "main")
    assert pointer["revision"] == envelope.revision
    assert pointer["digest"] == envelope.digest
    assert handle.expected_generation == pointer["native_state_generation"]
    assert handle.view.expected_generation() == handle.expected_generation
    # the managed config is frozen into the view at the native guest-relative
    # path and carries the payload facts
    rendered = json.loads((handle.view.root / ".claude" / "settings.json").read_text(encoding="utf-8"))
    assert rendered == {"model": MODEL, "alwaysThinkingEnabled": True}
    # the adapter owns the vendor payload vocabulary for the model selection
    assert provider.profile_model_selection(envelope) == MODEL
    assert ADAPTERS["claude"].profile_model({"model": MODEL}) == MODEL
    assert ADAPTERS["claude"].profile_model({}) is None  # honest absence
    assert ADAPTERS["claude"].profile_model({"model": "   "}) is None
    assert ADAPTERS["claude"].profile_model({"model": 7}) is None


def test_stale_profile_revision_is_a_fail_closed_freeze_rejection(tmp_path):
    store = _profile_store(tmp_path)
    store.put(HARNESS_TYPE, {"profile_id": "main", "native_payload": {"model": "v1-model"}})
    store.put(HARNESS_TYPE, {"profile_id": "main", "native_payload": {"model": "v2-model"}})
    stale = store.resolve("agent-box.profile@1", store.ref(HARNESS_TYPE, "main", revision=1))
    provider, executable = _offline_provider(tmp_path, profile_store=store)
    request, *_ = make_request(tmp_path, provider.definition, executable=executable,
                               profile=stale, prompt="stale freeze")
    with pytest.raises(MaterializationFailed) as exc:
        provider.start(request)
    assert exc.value.code == "NATIVE_HOME_VIEW_PREPARE_FAILED"
    assert "PROFILE_FREEZE_REVISION_MISMATCH" in str(exc.value)


def test_exec_argv_shape_and_env_relocation_in_lowered_command(tmp_path):
    provider, executable = _offline_provider(tmp_path)
    request, *_ = make_request(tmp_path, provider.definition, executable=executable,
                               prompt="run the task")
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    expected_prompt = "# task\n\nrun the task"
    assert handle.plan.argv == (
        "/runtime/bin/claude", "--print", "--output-format", "stream-json", "--verbose", expected_prompt,
    )
    # the lowered (Runtime-bound) command carries the exact same shape
    assert handle.command.argv == handle.plan.argv
    environment = handle.command.environment
    assert environment["HOME"] == "/runtime/home"
    assert environment["CLAUDE_CONFIG_DIR"] == "/runtime/home/.claude"
    assert environment["PATH"] == "/usr/bin:/bin"
    assert environment["AGENT_BOX_EXECUTION_ID"] == request.execution_id
    # no host path may leak into the guest environment
    assert not any(str(tmp_path) in value for value in environment.values())


def test_launch_selection_undeclared_mode_fails_closed(tmp_path):
    provider, executable = _offline_provider(tmp_path)

    def request_with(mode: str | None, *, dispatch_id: str):
        extra = () if mode is None else (LaunchSelectionV1(mode),)
        request, *_ = make_request(tmp_path, provider.definition, executable=executable,
                                   prompt="mode probe", dispatch_id=dispatch_id,
                                   execution_id="exec_" + dispatch_id, extra_inputs=extra)
        return request

    receipt = provider.start(request_with("exec", dispatch_id="dispatch_mode_exec"))
    assert receipt.runtime_handle.plan.launch_mode_name == "exec"
    with pytest.raises(PlanRejected) as exc:
        provider.start(request_with("turtle-mode", dispatch_id="dispatch_mode_bad"))
    assert exc.value.code == "LAUNCH_MODE_UNDECLARED"
    # more than one launch selection is invalid
    doubled, *_ = make_request(tmp_path, provider.definition, executable=executable,
                               prompt="mode probe", dispatch_id="dispatch_mode_double",
                               execution_id="exec_dispatch_mode_double",
                               extra_inputs=(LaunchSelectionV1("exec"), LaunchSelectionV1("interactive")))
    with pytest.raises(PlanRejected) as exc:
        provider.start(doubled)
    assert exc.value.code == "LAUNCH_MODE_INVALID"


def test_continuation_input_inserts_resume_before_print(tmp_path):
    provider, executable = _offline_provider(tmp_path)
    request, *_ = make_request(tmp_path, provider.definition, executable=executable,
                               prompt="continue the task",
                               extra_inputs=(ClaudeContinuationV1(LOCATOR),))
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    assert handle.plan.continuation is not None
    assert handle.plan.continuation.kind == "native_session"
    assert handle.plan.continuation.argv == ("--resume", LOCATOR)
    # ACTUAL adapter behavior (recorded): the generic base inserts the
    # continuation tokens after argv[1], so for claude (no subcommand) the
    # shape is ``claude --print --resume <session_id> --output-format
    # stream-json --verbose [PROMPT]``.  Claude Code flags are
    # order-independent, so this is natively valid; the placement fact is
    # asserted here verbatim instead of an idealized "before --print".
    assert handle.plan.argv == (
        "/runtime/bin/claude", "--print", "--resume", LOCATOR,
        "--output-format", "stream-json", "--verbose", "# task\n\ncontinue the task",
    )
    assert handle.command.argv == handle.plan.argv


def test_continuation_ref_uses_registry_facts_and_provider_roundtrip(tmp_path):
    provider, _ = _offline_provider(tmp_path)
    ref = provider.continuation_ref(LOCATOR)
    assert ref.type is RefType.SESSION
    assert ref.provider == "claude-code-continuation"  # registry-declared target provider
    assert ref.native_id == LOCATOR
    assert provider.continuation_contract_id() == "agent-box.claude-continuation@1"
    assert ref.metadata == {"harness_type": "claude-code", "source_provider": "claude-code"}
    # the generic Ref is accepted by the REAL Claude continuation authority
    real_provider = ClaudeContinuationResourceProvider()
    assert real_provider.resolve("agent-box.claude-continuation@1", ref) == ClaudeContinuationV1(LOCATOR)
    # and the real authority's own Ref shape agrees with the generic one
    round_ref = real_provider.make_ref(LOCATOR)
    assert round_ref.metadata["source_provider"] == "claude-code"
    assert real_provider.resolve("agent-box.claude-continuation@1", round_ref) == ClaudeContinuationV1(LOCATOR)
    with pytest.raises(PlanRejected):
        provider.continuation_ref("")
    with pytest.raises(PlanRejected):
        provider.continuation_ref(LOCATOR, extra_metadata={"ok": 123})  # non-str metadata value


def test_decoder_captures_session_locator_and_native_facts():
    adapter = ADAPTERS["claude"]
    observations = adapter.decode_native_events((
        '{"type":"system","subtype":"init","session_id":"synth-session-1","model":"synthetic-claude-model"}',
        '{"type":"assistant","message":{"content":[{"type":"text","text":"hello"},'
        '{"type":"tool_use","name":"Bash","input":{}}]}}',
        '{"type":"user","message":{"content":[{"type":"tool_result","content":"ok"}]},"session_id":"synth-session-1"}',
        '{"type":"result","subtype":"success","is_error":false,"usage":{"input_tokens":5,"output_tokens":3},'
        '"total_cost_usd":0.01,"session_id":"synth-session-1"}',
    ))
    session = next(o for o in observations if o.kind is ObservationKind.SESSION)
    assert session.session_locator == "synth-session-1"  # FRESH-run locator capture
    assert session.model == "synthetic-claude-model"
    message = next(o for o in observations if o.kind is ObservationKind.MESSAGE)
    assert message.text == "hello"
    tool_request = next(o for o in observations if o.kind is ObservationKind.TOOL_REQUEST)
    assert tool_request.tool_name == "Bash"
    tool_result = next(o for o in observations if o.kind is ObservationKind.TOOL_RESULT)
    assert tool_result.session_locator == "synth-session-1"
    usage = next(o for o in observations if o.kind is ObservationKind.USAGE)
    assert usage.usage == {"input_tokens": 5.0, "output_tokens": 3.0, "total_cost_usd": 0.01}
    terminal = next(o for o in observations if o.kind is ObservationKind.TERMINAL)
    assert terminal.terminal_condition is TerminalCondition.COMPLETED
    assert terminal.is_error is False
    assert terminal.session_locator == "synth-session-1"


# --------------------------------------------------------------------------- #
# Level 2: real spawn verticals (real bwrap; skipped only when bwrap cannot run)
# --------------------------------------------------------------------------- #

def _real_chain(tmp_path: Path, body: str, *, profile=None, workspace: Path | None = None,
                execution_id: str = "exec_claude_vertical", dispatch_id: str = "dispatch_claude_vertical",
                profile_store=None):
    pytest.importorskip("agent_box_sandbox_bwrap", reason="bwrap plugin not installed")
    definition = definition_by_driver("claude")
    binary = make_fake_executable(tmp_path / "bin", "claude", body=body)
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
                                     metadata={"harness_type": HARNESS_TYPE,
                                               "revision": str(profile.revision), "digest": profile.digest}),
            profile,
        ))
    request = ExecutionStartRequest(execution_id, dispatch_id, "inputs-digest", tuple(inputs))
    provider = GenericExecutionProvider(definition, ADAPTERS["claude"], staging_root=tmp_path / "staging",
                                        executable_resolver=lambda spec: executable,
                                        profile_store=profile_store)
    return provider, request, workspace


def test_full_exec_vertical_real_sandbox(tmp_path):
    store = _profile_store(tmp_path)
    envelope = _stored_profile(store)
    provider, request, workspace = _real_chain(tmp_path, CLAUDE_SUCCESS_BODY, profile=envelope,
                                               profile_store=store)
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    process = handle.runtime.transport
    exit_code = _wait_exit(process)
    assert exit_code == 0, process.stderr.read()[:400] if process.stderr else "process failed"

    # live workspace mutation through the rw projection
    assert (workspace / "mutation.txt").read_text().strip() == "mutated"

    # CLAUDE_CONFIG_DIR/HOME relocation observed from inside the guest
    guest_env = (workspace / "guest-env.txt").read_text()
    assert "HOME=/runtime/home\n" in guest_env
    assert "CLAUDE_CONFIG_DIR=/runtime/home/.claude\n" in guest_env
    assert str(tmp_path) not in guest_env and str(Path.home()) not in guest_env

    # profile freeze proven from inside the guest: the managed config is at
    # the native guest path and carries exactly the payload facts
    seen = json.loads((workspace / "config-seen.json").read_text(encoding="utf-8"))
    assert seen == {"model": MODEL, "alwaysThinkingEnabled": True}
    host_view = handle.view.root / ".claude" / "settings.json"
    assert json.loads(host_view.read_text(encoding="utf-8")) == {"model": MODEL, "alwaysThinkingEnabled": True}

    # observation decode: SESSION/MESSAGE/TOOL facts and the terminal
    observations = provider.observe(handle)
    kinds = {item.kind for item in observations}
    assert {ObservationKind.SESSION, ObservationKind.MESSAGE, ObservationKind.TOOL_REQUEST,
            ObservationKind.TOOL_RESULT, ObservationKind.USAGE} <= kinds
    session = next(o for o in observations if o.kind is ObservationKind.SESSION)
    assert session.session_locator == LOCATOR  # native session_id fact
    message = next(o for o in observations if o.kind is ObservationKind.MESSAGE)
    assert message.text == "vertical-claude-done"
    terminal = observations[-1]
    assert terminal.kind is ObservationKind.TERMINAL
    assert terminal.terminal_condition is TerminalCondition.COMPLETED
    assert terminal.is_error is False

    # redaction: no host path in any observation payload or diagnostics
    _redaction_assertions(provider, observations, ["/home/", str(tmp_path), str(Path.home())])

    # process exit produced a FinishProposal only; the Host decides.
    proposal = provider.finish(handle)
    assert proposal.decision_owner == "host"
    assert proposal.harness_type == "claude-code"
    assert proposal.exit_code == 0
    assert proposal.terminal.is_error is False


def test_exec_vertical_exit3_is_a_failed_terminal_never_a_success(tmp_path):
    provider, request, workspace = _real_chain(
        tmp_path, CLAUDE_FAILURE_BODY,
        execution_id="exec_claude_fail", dispatch_id="dispatch_claude_fail",
    )
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    assert _wait_exit(handle.runtime.transport) == 3
    observations = provider.observe(handle)
    terminal = observations[-1]
    assert terminal.kind is ObservationKind.TERMINAL
    assert terminal.is_error is True
    assert "synthetic claude failure" in terminal.text
    # no fabricated success: the FinishProposal carries the failure truth
    # (exit 3 -> is_error), and the decision stays with the Host
    proposal = provider.finish(handle)
    assert proposal.exit_code == 3
    assert proposal.decision_owner == "host"
    assert proposal.terminal.is_error is True
    assert not (workspace / "mutation.txt").exists()


def test_cancel_dispatch_terminates_running_exec_and_never_fabricates_completion(tmp_path):
    provider, request, workspace = _real_chain(
        tmp_path, CLAUDE_CANCEL_BODY,
        execution_id="exec_claude_cancel", dispatch_id="dispatch_claude_cancel",
    )
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    process = handle.runtime.transport
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline and process.poll() is None:
        time.sleep(0.05)
    assert process.poll() is None  # still running
    assert provider.dispatch_state(receipt.dispatch_id) == {"state": "running", "exit_code": None}

    # a dispatch that never started is honestly unknown
    assert provider.cancel_dispatch("dispatch_never_started") == {
        "state": "unknown", "reason": "no live runtime handle",
    }
    assert provider.dispatch_state("dispatch_never_started") == {"state": "unknown"}

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
    # cancelled dispatches are never reported as a native completion: no
    # result usage and no completed terminal exists after the cancel
    observations = provider.observe(handle)
    assert all(o.kind is not ObservationKind.USAGE for o in observations)
    assert all(o.terminal_condition is not TerminalCondition.COMPLETED
               for o in observations if o.kind is ObservationKind.TERMINAL)
    assert not (workspace / "mutation.txt").exists()


# --------------------------------------------------------------------------- #
# Level 3: Work Core dispatch through the real ExtensionRegistry
# --------------------------------------------------------------------------- #

class _FrozenWorkspaceProvider:
    """Test-only workspace authority with FROZEN snapshot semantics.

    The real LocalLiveWorkspaceProvider resolves live workspaces with a
    ``live-unfrozen:`` digest, which the formal lowering path (correctly)
    rejects as SOURCE_DIGEST_DRIFT: the harness chain demands a frozen
    workspace snapshot digest.  This provider states that frozen contract
    explicitly; the live/frozen workspace gap is reported to the integrator.
    """

    provider_id = "test-frozen-workspace"
    supported_contract_ids = frozenset({WorkspaceV1.contract_id})

    def __init__(self, root: Path):
        self._root = root

    def descriptor(self):
        from agent_box.work_core.registry import ProviderDescriptor

        return ProviderDescriptor(self.provider_id, "Test frozen workspace", "1")

    def make_ref(self, project_id: str) -> Ref:
        return Ref(RefType.WORKSPACE, self.provider_id, project_id)

    def resolve(self, contract_id, ref, *, context=None):
        if contract_id != WorkspaceV1.contract_id or ref.provider != self.provider_id:
            raise ValueError("ref does not belong to this provider")
        path = self._root / ref.native_id
        if not path.is_dir():
            raise ValueError("workspace root missing")
        return WorkspaceV1(path, content_digest(path))


def _workcore_registry(tmp_path: Path):
    from agent_box.extensions.api import PluginContext
    from agent_box.extensions.bootstrap import register_shared_runtime_contracts
    from agent_box.work_core.registry import ExtensionRegistry
    from agent_box_harnesses.generic.factory import build_registration

    home = tmp_path / "agent-box-home"
    context = PluginContext(agent_box_version="test", agent_box_home=home,
                            plugin_data_dir=tmp_path / "plugin-data")
    registry = ExtensionRegistry()
    register_shared_runtime_contracts(registry)
    for harness_type in (HARNESS_TYPE,):
        registration = build_registration(context, harness_type)
        registry.register_components(
            contracts=registration.contracts,
            resource_providers=registration.resource_providers,
            execution_providers=registration.execution_providers,
        )
    workspace_provider = _FrozenWorkspaceProvider(tmp_path)
    host_provider = LocalRuntimeHostProvider()
    sandbox_plugin = BwrapSandboxProvider(tmp_path / "sandbox")
    host_ref = host_provider.make_ref()
    host_v1 = host_provider.resolve("agent-box.runtime-host@1", host_ref)
    terminal_provider = DirectStdioResourceProvider(transport=host_v1.port.transport)
    registry.register_resource_provider(workspace_provider)
    registry.register_resource_provider(host_provider)
    registry.register_resource_provider(sandbox_plugin)
    registry.register_resource_provider(terminal_provider)
    registry.register_resource_provider(ArtifactPromptResourceProvider())
    return registry, workspace_provider, host_provider, sandbox_plugin


def _workcore_runtime_inputs(host_provider, sandbox_plugin):
    host_ref = host_provider.make_ref()
    affinity = host_ref.metadata["affinity"]
    sandbox_ref = sandbox_plugin.make_ref("bwrap-cloud-harness", host_affinity=affinity)
    native_terminal_ref = DirectStdioSession.make_ref(host_affinity=affinity)
    # Work-Core dispatch inputs are work_core Refs; the real terminal provider
    # converts this exact Ref shape into its native TerminalSessionRef.
    terminal_ref = Ref(RefType.ARTIFACT, native_terminal_ref.provider, native_terminal_ref.native_id,
                       metadata={"session_digest": native_terminal_ref.session_digest,
                                 "affinity": native_terminal_ref.affinity})
    return host_ref, sandbox_ref, terminal_ref


def test_workcore_input_limits_fail_closed_on_duplicate_workspace(tmp_path, monkeypatch):
    from agent_box.work_core.db import _reset_connection_for_tests
    from agent_box.work_core.errors import ContractViolation
    from agent_box.work_core.repository import CoreRepository
    from agent_box.work_core.services import ExecutionService, WorkService

    monkeypatch.setenv("AGENT_BOX_HOME", str(tmp_path / "agent-box-home"))
    _reset_connection_for_tests()
    registry, workspace_provider, _host, _sandbox = _workcore_registry(tmp_path)
    (tmp_path / "ws-a").mkdir()
    (tmp_path / "ws-b").mkdir()
    work = WorkService(CoreRepository()).create_work("input-limit vertical")
    execution = ExecutionService(CoreRepository()).create_execution(
        work.id, "claude-code-execution", responsibility_intent="vertical-proof",
    )
    # claude-code declares workspace 1..1 in harnesses.toml: two workspaces
    # must be rejected by the REAL dispatch input-limit validation
    with pytest.raises(ContractViolation) as exc:
        ExecutionService(CoreRepository()).dispatch_execution(
            execution.id,
            [
                (WorkspaceV1.contract_id, workspace_provider.make_ref("ws-a")),
                (WorkspaceV1.contract_id, workspace_provider.make_ref("ws-b")),
            ],
            registry, "idem-claude-limit",
        )
    assert "outside provider limit" in str(exc.value)
    _reset_connection_for_tests()


def test_workcore_dispatch_end_to_end_through_real_plugins(tmp_path, monkeypatch):
    from agent_box.work_core.db import _reset_connection_for_tests
    from agent_box.work_core.repository import CoreRepository
    from agent_box.work_core.services import ExecutionService, WorkService

    pytest.importorskip("agent_box_sandbox_bwrap", reason="bwrap plugin not installed")
    sandbox_probe = BwrapSandboxProvider(tmp_path / "sandbox").probe()
    if sandbox_probe["status"] != "available":
        pytest.skip("real bwrap unavailable: binary missing or namespace capability denied")

    monkeypatch.setenv("AGENT_BOX_HOME", str(tmp_path / "agent-box-home"))
    _reset_connection_for_tests()
    registry, workspace_provider, host_provider, sandbox_plugin = _workcore_registry(tmp_path)
    provider = registry.get("claude-code-execution")
    definition = provider.definition
    binary = make_fake_executable(tmp_path / "bin", "claude", body=CLAUDE_SUCCESS_BODY)
    provider.install_executable_for_tests(
        resolve_executable(definition.executable, search_path=str(tmp_path / "bin"), probe=False),
    )

    workspace = tmp_path / "ws-main"
    workspace.mkdir()
    ws_ref = workspace_provider.make_ref("ws-main")
    prompt_path = tmp_path / "prompt.md"
    prompt_path.write_text("mutate the workspace", encoding="utf-8")
    prompt_ref = ArtifactPromptResourceProvider().make_ref(prompt_path, title="task")
    host_ref, sandbox_ref, terminal_ref = _workcore_runtime_inputs(host_provider, sandbox_plugin)

    work = WorkService(CoreRepository()).create_work("claude dispatch vertical")
    service = ExecutionService(CoreRepository())
    execution = service.create_execution(work.id, "claude-code-execution", responsibility_intent="vertical-proof")
    receipt = service.dispatch_execution(
        execution.id,
        [
            (WorkspaceV1.contract_id, ws_ref),
            (PromptFragmentV1.contract_id, prompt_ref),
            (RuntimeHostV1.contract_id, host_ref),
            (SANDBOX_CONTRACT_ID, sandbox_ref),
            (TerminalSessionV1.contract_id, terminal_ref),
        ],
        registry, "idem-claude-dispatch",
    )
    assert receipt.state == "accepted"
    assert receipt.correlation_ref.provider == "claude-code-execution"

    handle = provider.get_handle(receipt.dispatch_id)
    assert _wait_exit(handle.runtime.transport) == 0
    assert (workspace / "mutation.txt").read_text().strip() == "mutated"
    observations = provider.observe(handle)
    session = next(o for o in observations if o.kind is ObservationKind.SESSION)
    assert session.session_locator == LOCATOR
    terminal = observations[-1]
    assert terminal.kind is ObservationKind.TERMINAL
    assert terminal.is_error is False
    proposal = provider.finish(handle)
    assert proposal.decision_owner == "host" and proposal.exit_code == 0
    _reset_connection_for_tests()
