"""Pi synthetic-executable verticals through the REAL production launch chain.

Every spawn-bearing test drives the real formal chain — staging/native-home
view -> lowering -> Root Runtime assembler -> composition coordinator -> real
bwrap sandbox spawn — with a synthetic ``pi`` binary that emits the
``--mode json`` native event stream (FACTS C.3/H1).  Planning, decode, argv
and continuation facts are proven offline and NEVER skip.  Spawn-bearing
tests are gated on the real bwrap capability probe only.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from agent_box.extensions import PluginContext
from agent_box.extensions.bootstrap import register_shared_runtime_contracts
from agent_box.protocols.runtime import content_digest
from agent_box.resource_contracts import LaunchSelectionV1, PromptFragmentV1, WorkspaceV1
from agent_box.work_core import (
    ExecutionStartRequest, ExecutionStartRequest as _ESR,  # noqa: F401 (clarity)
    ProviderDescriptor, Ref, RefType, ResolvedExecutionInput,
)
from agent_box.work_core.db import _reset_connection_for_tests
from agent_box.work_core.errors import ContractViolation
from agent_box.work_core.registry import ExtensionRegistry
from agent_box.work_core.repository import CoreRepository
from agent_box.work_core.services import ExecutionService, WorkService

from agent_box_artifacts.provider import ArtifactPromptResourceProvider
from agent_box_runtime_local.provider import LocalRuntimeHostProvider
from agent_box_sandbox_bwrap.provider import BwrapSandboxProvider
from agent_box_terminal_session.direct_stdio import (
    DirectStdioResourceProvider, DirectStdioSession,
)

from agent_box_harnesses.adapters import ADAPTERS
from agent_box_harnesses.adapters.failures import MaterializationFailed, PlanRejected
from agent_box_harnesses.entrypoints import (
    create_claude, create_codex, create_hermes, create_opencode, create_pi,
)
from agent_box_harnesses.generic.execution_provider import GenericExecutionProvider
from agent_box_harnesses.generic.factory import _config_renderers
from agent_box_harnesses.generic.profile_store import ProfileStore
from agent_box_harnesses.native_home.policy import FIVE_POLICIES
from agent_box_harnesses.pi.contract import PiContinuationV1
from agent_box_harnesses.resources.executable import resolve_executable

from helpers import definition_by_driver, make_fake_executable, make_request, resolved_executable_for


PI_SESSION_ID = "pi-vertical-session-7"
PI_VERTICAL_SCRIPT = """#!/bin/sh
printf '%s\\n' '{"type":"session","version":3,"id":"pi-vertical-session-7","cwd":"/workspace"}'
printf '%s\\n' '{"type":"message_end","message":{"role":"assistant","text":"pi-vertical-done","usage":{"inputTokens":12,"outputTokens":34}}}'
printf '%s\\n' '{"type":"tool_execution_start","toolName":"write","args":{"path":"/workspace/pi-mutation.txt"}}'
printf 'pi-was-here' > /workspace/pi-mutation.txt
printf '%s\\n' '{"type":"tool_execution_end","toolName":"write","isError":false}'
"""

PI_FAILED_SCRIPT = """#!/bin/sh
printf '%s\\n' '{"type":"session","version":3,"id":"pi-failed-session-9"}'
printf '%s\\n' '{"type":"message_end","message":{"role":"assistant","text":"partial work"}}'
printf '%s\\n' '{"type":"tool_execution_end","toolName":"bash","isError":true}'
exit 3
"""

PI_SLEEP_SCRIPT = "#!/bin/sh\nsleep 30\n"

PI_PROFILE_PAYLOAD = {
    "defaultProvider": "deepseek",
    "defaultModel": "deepseek/deepseek-v4-flash",
    "defaultThinkingLevel": "high",
    "theme": "dark",
}


# --------------------------------------------------------------------- #
# shared setup
# --------------------------------------------------------------------- #
def _resolved_synthetic_pi(tmp_path: Path, *, body: str):
    definition = definition_by_driver("pi")
    make_fake_executable(tmp_path / "bin", "pi", body=body)
    return resolve_executable(definition.executable, search_path=str(tmp_path / "bin"), probe=False)


def _pi_provider(tmp_path: Path, *, body: str, profile_store: ProfileStore | None = None) -> GenericExecutionProvider:
    definition = definition_by_driver("pi")
    provider = GenericExecutionProvider(
        definition, ADAPTERS["pi"], staging_root=tmp_path / "staging",
        profile_store=profile_store,
    )
    provider.install_executable_for_tests(_resolved_synthetic_pi(tmp_path, body=body))
    return provider


def _real_bwrap(tmp_path: Path) -> BwrapSandboxProvider:
    pytest.importorskip("agent_box_sandbox_bwrap", reason="bwrap plugin not installed")
    sandbox = BwrapSandboxProvider(tmp_path / "sandbox")
    if sandbox.probe()["status"] != "available":
        pytest.skip("real bwrap unavailable: binary missing or namespace capability denied")
    return sandbox


def _bwrap_runtime_inputs(tmp_path: Path) -> tuple[ResolvedExecutionInput, ...]:
    host_provider = LocalRuntimeHostProvider()
    host_ref = host_provider.make_ref()
    affinity = host_ref.metadata["affinity"]
    sandbox = _real_bwrap(tmp_path)
    sandbox_ref = sandbox.make_ref("bwrap-cloud-harness", host_affinity=affinity)
    terminal_ref = DirectStdioSession.make_ref(host_affinity=affinity)
    host_v1 = host_provider.resolve("agent-box.runtime-host@1", host_ref)
    sandbox_v1 = sandbox.resolve("agent-box.sandbox@1", sandbox_ref)
    terminal_provider = DirectStdioResourceProvider(transport=host_v1.port.transport)
    terminal_v1 = terminal_provider.resolve("agent-box.terminal-session@1", terminal_ref)
    return (
        ResolvedExecutionInput(host_v1.contract_id, host_ref, host_v1),
        ResolvedExecutionInput(sandbox_v1.contract_id, sandbox_ref, sandbox_v1),
        ResolvedExecutionInput(terminal_v1.contract_id, terminal_ref, terminal_v1),
    )


def _bwrap_request(tmp_path: Path, *, prompt: str, dispatch_id: str) -> ExecutionStartRequest:
    workspace = tmp_path / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)
    inputs = (
        ResolvedExecutionInput(WorkspaceV1.contract_id, Ref(RefType.WORKSPACE, "w", "w"),
                               WorkspaceV1(workspace, content_digest(workspace))),
        ResolvedExecutionInput(PromptFragmentV1.contract_id, Ref(RefType.ARTIFACT, "prompt", "p"),
                               PromptFragmentV1("task", prompt, "sha256:" + "0" * 64)),
        *_bwrap_runtime_inputs(tmp_path),
    )
    return ExecutionStartRequest(f"exec_{dispatch_id}", dispatch_id, "inputs-digest", inputs)


def _wait_exit(handle, timeout_seconds: float = 20.0) -> int:
    process = handle.runtime.transport
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        code = process.poll()
        if code is not None:
            return code
        time.sleep(0.05)
    raise AssertionError("synthetic pi process did not exit in time")


# --------------------------------------------------------------------- #
# offline facts (NEVER skip)
# --------------------------------------------------------------------- #
def test_exact_profile_freeze_renders_settings_into_the_native_view(tmp_path):
    definition = definition_by_driver("pi")
    harness_type = definition.harness_type
    store = ProfileStore(
        tmp_path / "profiles", policies=FIVE_POLICIES,
        config_renderers={harness_type: _config_renderers()[harness_type]},
    )
    store.put(harness_type, {"profile_id": "main", "native_payload": dict(PI_PROFILE_PAYLOAD)})
    envelope = store.resolve("agent-box.profile@1", store.ref(harness_type, "main"))
    assert envelope.revision == 1

    executable = resolved_executable_for(tmp_path, definition, probe=False)
    provider = GenericExecutionProvider(
        definition, ADAPTERS["pi"], staging_root=tmp_path / "staging", profile_store=store,
    )
    provider.install_executable_for_tests(executable)
    request, *_ = make_request(tmp_path, definition, executable=executable, profile=envelope)
    handle = provider.start(request).runtime_handle

    # the rendered managed config inside the staged/native-home view carries
    # exactly the payload facts
    rendered = json.loads((handle.view.root / "settings.json").read_text(encoding="utf-8"))
    assert rendered["defaultModel"] == "deepseek/deepseek-v4-flash"
    assert rendered["defaultProvider"] == "deepseek"
    assert rendered["theme"] == "dark"

    # revision + digest are frozen into the view at launch time
    assert handle.expected_generation == envelope.native_state_generation
    assert handle.view.frozen_tree_digest() == envelope.native_tree_digest
    # adapter-owned model selection fact
    assert provider.profile_model_selection(envelope) == "deepseek/deepseek-v4-flash"

    # exact freeze: a moved pointer makes the stale envelope a typed reject
    # for any NEW launch (the first execution's active marker is released
    # first — a running view would fail closed on the mutation lease)
    handle.view.discard()
    store.put(harness_type, {"profile_id": "main", "native_payload": {**PI_PROFILE_PAYLOAD, "theme": "light"}},
              expected_revision=1)
    stale_request, *_ = make_request(tmp_path, definition, executable=executable, profile=envelope,
                                     dispatch_id="dispatch_stale")
    with pytest.raises(MaterializationFailed) as exc:
        provider.start(stale_request)
    assert exc.value.code == "NATIVE_HOME_VIEW_PREPARE_FAILED"
    assert "PROFILE_FREEZE_REVISION_MISMATCH" in str(exc.value)


def test_profile_model_payload_vocabulary(tmp_path):
    adapter = ADAPTERS["pi"]
    definition = definition_by_driver("pi")
    provider = GenericExecutionProvider(definition, adapter, staging_root=tmp_path / "staging")
    # preferred key: namespaced identity returned as-is
    assert adapter.profile_model({"defaultModel": "deepseek/deepseek-v4-flash"}) == "deepseek/deepseek-v4-flash"
    # bare model id combines with the declared provider (pi's <provider>/<model> form)
    assert adapter.profile_model({"defaultProvider": "deepseek", "defaultModel": "deepseek-v4-flash"}) == "deepseek/deepseek-v4-flash"
    # bare model id without a provider stays the bare identity
    assert adapter.profile_model({"defaultModel": "deepseek-v4-flash"}) == "deepseek-v4-flash"
    # a provider alone selects no model (honest absence)
    assert adapter.profile_model({"defaultProvider": "deepseek"}) is None
    assert adapter.profile_model({}) is None
    assert adapter.profile_model({"defaultModel": "   "}) is None
    assert adapter.profile_model({"defaultModel": 7}) is None
    # bounded selection through the generic surface
    class _P:
        native_payload = {"defaultModel": "m/" + "x" * 300}

    selected = provider.profile_model_selection(_P())
    assert selected is not None and len(selected) <= 128
    class _Empty:
        native_payload = {}

    assert provider.profile_model_selection(_Empty()) is None


def test_argv_env_facts_and_undeclared_launch_mode(tmp_path):
    definition = definition_by_driver("pi")
    executable = resolved_executable_for(tmp_path, definition, probe=False)
    provider = GenericExecutionProvider(definition, ADAPTERS["pi"], staging_root=tmp_path / "staging")
    provider.install_executable_for_tests(executable)

    request, *_ = make_request(tmp_path, definition, executable=executable, prompt="pi task prompt")
    handle = provider.start(request).runtime_handle
    # exec argv: `pi --mode json` with the prompt as the argv tail (prompt
    # fragments are rendered "# <title>\n\n<content>" by the start context)
    assert handle.plan.argv == ("/runtime/bin/pi", "--mode", "json", "# task\n\npi task prompt")
    assert handle.command.argv == handle.plan.argv
    env = handle.plan.environment
    # agent-dir relocation is ENV-ONLY (pi has no --agent-dir flag, FACTS B5)
    assert env["PI_CODING_AGENT_DIR"] == "/runtime/home"
    assert env["HOME"] == "/runtime/home"
    assert env["PI_OFFLINE"] == "1"
    assert env["AGENT_BOX_EXECUTION_ID"] == "exec_test"

    # declared launch mode through the launch-selection input passes through
    selected, *_ = make_request(tmp_path, definition, executable=executable,
                                extra_inputs=(LaunchSelectionV1("exec"),), dispatch_id="dispatch_mode",
                                execution_id="exec_mode")
    assert provider.start(selected).runtime_handle.plan.launch_mode_name == "exec"

    # an undeclared mode through the resolved launch-selection input is a
    # PLAN_REJECTED — never an implicit fallback to the first declared mode
    bad, *_ = make_request(tmp_path, definition, executable=executable,
                           extra_inputs=(LaunchSelectionV1("rpc-tui"),), dispatch_id="dispatch_badmode",
                           execution_id="exec_badmode")
    with pytest.raises(PlanRejected) as exc:
        provider.start(bad)
    assert exc.value.code == "LAUNCH_MODE_UNDECLARED"

    # the explicit start_mode surface carries the same fail-closed truth
    with pytest.raises(PlanRejected) as exc2:
        provider.start_mode(request, launch_mode="rpc-tui")
    assert exc2.value.code == "LAUNCH_MODE_UNDECLARED"
    with pytest.raises(PlanRejected) as exc3:
        provider.start_mode(request, launch_mode="")
    assert exc3.value.code == "LAUNCH_MODE_INVALID"


def test_continuation_argv_exact_placement(tmp_path):
    definition = definition_by_driver("pi")
    executable = resolved_executable_for(tmp_path, definition, probe=False)
    provider = GenericExecutionProvider(definition, ADAPTERS["pi"], staging_root=tmp_path / "staging")
    provider.install_executable_for_tests(executable)

    continuation = PiContinuationV1("sess-cont-1")
    request, *_ = make_request(tmp_path, definition, executable=executable,
                               prompt="resume the task", extra_inputs=(continuation,))
    handle = provider.start(request).runtime_handle
    # Exact placement: the pi adapter overrides the generic insertion point
    # so continuation tokens enter AFTER the full launch-mode head — they
    # must never split pi's `--mode json` flag pair.
    assert handle.plan.argv == (
        "/runtime/bin/pi", "--mode", "json", "--session", "sess-cont-1", "# task\n\nresume the task",
    )
    assert handle.plan.continuation.session_locator == "sess-cont-1"
    assert handle.plan.continuation.argv == ("--session", "sess-cont-1")


def test_capability_truth_honest_without_a_real_pi_binary(tmp_path):
    """With no real pi binary the start capability is honestly unavailable."""
    definition = definition_by_driver("pi")
    provider = GenericExecutionProvider(definition, ADAPTERS["pi"], staging_root=tmp_path / "staging")
    executable = provider._resolve_executable()
    if executable is not None and getattr(executable, "available", False):
        pytest.skip("a real pi binary is present on PATH; unavailable-truth is not exercisable here")
    assert provider.capabilities()["start"] == "unavailable"
    diagnostics = provider.diagnostics()
    assert diagnostics["capabilities"]["start"]["state"] == "unavailable"
    assert diagnostics["executable"]["status"] == "unavailable"


# --------------------------------------------------------------------- #
# spawn-bearing verticals (gated on the real bwrap probe only)
# --------------------------------------------------------------------- #
def test_full_vertical_observation_decode_and_workspace_mutation(tmp_path):
    provider = _pi_provider(tmp_path, body=PI_VERTICAL_SCRIPT)
    handle = provider.start(_bwrap_request(tmp_path, prompt="mutate the workspace",
                                           dispatch_id="dispatch_vertical")).runtime_handle
    assert _wait_exit(handle) == 0

    # live workspace mutation visible in the REAL directory after exit
    assert (tmp_path / "workspace" / "pi-mutation.txt").read_text() == "pi-was-here"

    observations = provider.observe(handle)
    session = next(o for o in observations if o.kind.value == "session")
    assert session.session_locator == PI_SESSION_ID
    message = next(o for o in observations if o.kind.value == "message")
    assert message.text == "pi-vertical-done"
    tool_request = next(o for o in observations if o.kind.value == "tool_request")
    assert tool_request.tool_name == "write"
    tool_result = next(o for o in observations if o.kind.value == "tool_result")
    assert tool_result.is_error is False
    usage = next(o for o in observations if o.kind.value == "usage")
    assert usage.usage == {"inputTokens": 12.0, "outputTokens": 34.0}
    terminal = observations[-1]
    assert terminal.kind.value == "terminal"
    assert terminal.is_error is False
    assert terminal.terminal_condition is not None and terminal.terminal_condition.value == "process_exit"

    # process exit produced a FinishProposal only; the Host decides Finish
    proposal = provider.finish(handle)
    assert proposal.decision_owner == "host"
    assert proposal.exit_code == 0
    assert proposal.harness_type == "pi"


def test_nonzero_exit_is_a_failed_terminal_never_fabricated_success(tmp_path):
    provider = _pi_provider(tmp_path, body=PI_FAILED_SCRIPT)
    handle = provider.start(_bwrap_request(tmp_path, prompt="fail on purpose",
                                           dispatch_id="dispatch_failed")).runtime_handle
    assert _wait_exit(handle) == 3

    observations = provider.observe(handle)
    terminal = observations[-1]
    assert terminal.kind.value == "terminal"
    assert terminal.is_error is True
    assert "TERMINAL_FROM_PROCESS_EXIT" in terminal.warnings

    proposal = provider.finish(handle)
    assert proposal.decision_owner == "host"
    assert proposal.exit_code == 3
    assert proposal.terminal.is_error is True


def test_cancellation_honesty_through_runtime_transport(tmp_path):
    provider = _pi_provider(tmp_path, body=PI_SLEEP_SCRIPT)
    handle = provider.start(_bwrap_request(tmp_path, prompt="sleep forever",
                                           dispatch_id="dispatch_cancel")).runtime_handle
    time.sleep(0.5)  # let the synthetic enter its long sleep

    result = provider.cancel_dispatch("dispatch_cancel")
    assert result == {"state": "terminate_sent", "via": "runtime-transport"}
    exit_code = _wait_exit(handle)
    state = provider.dispatch_state("dispatch_cancel")
    # dispatch_state proves real termination; a cancelled run is terminal
    # with the truthful kill exit code, never a fabricated completion
    assert state["state"] == "terminal"
    assert state["exit_code"] == exit_code
    assert exit_code != 0
    observations = provider.observe(handle)
    assert observations[-1].kind.value == "terminal"
    assert observations[-1].is_error is True

    # a dispatch that completed BEFORE cancel keeps its true completion:
    # cancellation never rewrites a sealed terminal outcome
    done_provider = _pi_provider(tmp_path, body=PI_VERTICAL_SCRIPT)
    done_handle = done_provider.start(_bwrap_request(tmp_path, prompt="finish quickly",
                                                     dispatch_id="dispatch_done")).runtime_handle
    assert _wait_exit(done_handle) == 0
    done_provider.cancel_dispatch("dispatch_done")
    done_state = done_provider.dispatch_state("dispatch_done")
    assert done_state["state"] == "terminal"
    assert done_state["exit_code"] == 0

    # unknown dispatch ids are unknown on both surfaces
    assert provider.dispatch_state("no-such-dispatch") == {"state": "unknown"}
    assert provider.cancel_dispatch("no-such-dispatch")["state"] == "unknown"


def test_observations_and_diagnostics_leak_no_host_facts_or_credentials(tmp_path):
    provider = _pi_provider(tmp_path, body=PI_VERTICAL_SCRIPT)
    handle = provider.start(_bwrap_request(tmp_path, prompt="mutate the workspace",
                                           dispatch_id="dispatch_redaction")).runtime_handle
    assert _wait_exit(handle) == 0
    observations = provider.observe(handle)
    provider.finish(handle)

    def observation_text(o) -> str:
        native = json.dumps(o.native.data if o.native is not None else {}, default=str)
        return "|".join((o.kind.value, o.text, o.session_locator or "", o.tool_name or "",
                         json.dumps(o.usage or {}, default=str), native))

    blob = "\n".join(observation_text(o) for o in observations)
    blob += "\n" + json.dumps(provider.diagnostics(), default=str)
    for marker in (str(tmp_path), "/home/", "SECRET", "sk-live-", "api_key_value"):
        assert marker not in blob, f"host/credential fact leaked: {marker}"


# --------------------------------------------------------------------- #
# Work-Core-level dispatch through the real extension registry
# --------------------------------------------------------------------- #
class _ContentWorkspaceProvider:
    """Contract-faithful workspace ResourceProvider for dispatch verticals.

    The REAL workspace plugins resolve live/unfrozen identity digests
    ("live-unfrozen:...", "git:<commit>"), which the harness lowering
    verification (SOURCE_DIGEST_DRIFT by design) cannot execute against.
    Until a frozen-snapshot workspace provider exists, this test supplies
    exactly the WorkspaceV1 the launch contract requires (path +
    content_digest) — the same value tests/helpers.py builds.  A cross-file
    change request is recorded in the task report.
    """

    provider_id = "content-workspace"
    supported_contract_ids = frozenset({WorkspaceV1.contract_id})

    def __init__(self, root: Path):
        self._root = root

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(self.provider_id, "Content workspace (dispatch vertical)", "1")

    def make_ref(self) -> Ref:
        return Ref(RefType.WORKSPACE, self.provider_id, "ws-1")

    def resolve(self, contract_id, ref, *, context=None) -> WorkspaceV1:
        if contract_id != WorkspaceV1.contract_id or ref.provider != self.provider_id:
            raise ValueError("workspace ref mismatch")
        return WorkspaceV1(self._root, content_digest(self._root))


def _harness_registry(tmp_path: Path) -> ExtensionRegistry:
    """A real ExtensionRegistry populated from the five harness plugins."""
    registry = ExtensionRegistry()
    register_shared_runtime_contracts(registry)
    context = PluginContext(
        agent_box_version="test",
        agent_box_home=tmp_path / "agent-box-home",
        plugin_data_dir=tmp_path / "plugin-data",
    )
    for create in (create_codex, create_claude, create_opencode, create_hermes, create_pi):
        registration = create().build(context)
        registry.register_components(
            contracts=registration.contracts,
            resource_providers=registration.resource_providers,
            execution_providers=registration.execution_providers,
        )
    return registry


def test_work_core_dispatch_pi_execution_end_to_end(tmp_path, monkeypatch):
    _real_bwrap(tmp_path)  # spawn-bearing: gate the whole vertical on bwrap
    monkeypatch.setenv("AGENT_BOX_HOME", str(tmp_path / "agent-box-home"))
    _reset_connection_for_tests()
    try:
        registry = _harness_registry(tmp_path)
        # real runtime/sandbox/terminal/artifact resource providers join the
        # five harness plugins in ONE dispatch registry
        workspace = tmp_path / "workspace"
        workspace.mkdir()
        registry.register_components(resource_providers=(
            LocalRuntimeHostProvider(),
            BwrapSandboxProvider(tmp_path / "sandbox-dispatch"),
            DirectStdioResourceProvider(),
            _ContentWorkspaceProvider(workspace),
            ArtifactPromptResourceProvider(),
        ))

        provider = registry.get("pi-execution")
        definition = definition_by_driver("pi")
        provider.install_executable_for_tests(_resolved_synthetic_pi(tmp_path, body=PI_VERTICAL_SCRIPT))

        # the new input-limits path: registry-declared cardinality on the
        # generic provider, including the 0..1 launch-selection/continuation
        limits = provider.input_limits()
        assert limits["agent-box.launch-selection@1"] == (0, 1)
        assert limits[PiContinuationV1.contract_id] == (0, 1)
        assert limits["agent-box.prompt-fragment@1"] == (1, 32)
        assert limits["agent-box.workspace@1"] == (1, 1)

        repo = CoreRepository()
        service = ExecutionService(repo)
        work = WorkService(repo).create_work("pi dispatch vertical")
        execution = service.create_execution(work.id, "pi-execution", responsibility_intent="pi dispatch vertical")

        host_ref = LocalRuntimeHostProvider().make_ref()
        affinity = host_ref.metadata["affinity"]
        terminal_ref = DirectStdioSession.make_ref(host_affinity=affinity)
        prompt_file = tmp_path / "prompt.txt"
        prompt_file.write_text("mutate the workspace", encoding="utf-8")
        workspace_provider = registry.get_resource_provider("content-workspace")
        inputs = (
            (WorkspaceV1.contract_id, workspace_provider.make_ref()),
            (PromptFragmentV1.contract_id, registry.get_resource_provider("artifact-file").make_ref(prompt_file, title="task")),
            ("agent-box.runtime-host@1", host_ref),
            ("agent-box.sandbox@1", BwrapSandboxProvider(tmp_path / "sandbox-dispatch").make_ref(
                "bwrap-cloud-harness", host_affinity=affinity)),
            ("agent-box.terminal-session@1", Ref(RefType.ARTIFACT, terminal_ref.provider, terminal_ref.native_id,
                                                 metadata={"session_digest": terminal_ref.session_digest,
                                                           "affinity": terminal_ref.affinity})),
        )
        receipt = service.dispatch_execution(execution.id, inputs, registry, "pi-dispatch-1")
        assert receipt.state == "accepted"
        assert receipt.correlation_ref.provider == "pi-execution"

        handle = provider.get_handle(receipt.dispatch_id)
        assert _wait_exit(handle) == 0
        assert (workspace / "pi-mutation.txt").read_text() == "pi-was-here"
        observations = provider.observe(handle)
        session = next(o for o in observations if o.kind.value == "session")
        assert session.session_locator == PI_SESSION_ID

        # cardinality outside input_limits is a Work-Core ContractViolation
        work2 = WorkService(repo).create_work("pi dispatch over-limit")
        execution2 = service.create_execution(work2.id, "pi-execution", responsibility_intent="over-limit")
        doubled = inputs + ((WorkspaceV1.contract_id, Ref(RefType.WORKSPACE, "content-workspace", "ws-2")),)
        with pytest.raises(ContractViolation):
            service.dispatch_execution(execution2.id, doubled, registry, "pi-dispatch-2")
    finally:
        _reset_connection_for_tests()
