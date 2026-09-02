"""Observation/Finish boundary (determined adjudication 10).

process exit != Finish: the adapter only produces terminal Observations and
FinishProposals; the Host decides whether Work Core Finish runs.
"""
import pytest

from agent_box_harnesses.adapters import ADAPTERS
from agent_box_harnesses.adapters.observation import ObservationKind, TerminalCondition
from helpers import FakeProcess, definition_by_driver, make_fake_executable, make_request, resolved_executable_for

from agent_box_harnesses.adapters.start_context import build_start_context
from agent_box_harnesses.adapters.staging import ExecutionStagingArea
from agent_box_harnesses.adapters.lowering import lower
from agent_box_harnesses.generic.execution_provider import GenericExecutionProvider


def _provider(tmp_path, driver):
    definition = definition_by_driver(driver)
    executable = resolved_executable_for(tmp_path / driver, definition)
    provider = GenericExecutionProvider(definition, ADAPTERS[driver], staging_root=tmp_path / "staging",
                                        executable_resolver=lambda spec: executable)
    return definition, executable, provider


def _start(tmp_path, driver, *, process):
    definition, executable, provider = _provider(tmp_path, driver)
    request, host_port, sandbox_port, terminal_port = make_request(
        tmp_path / driver, definition, executable=executable, execution_id="exec_obs", prompt="observe me")
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    # splice the fake process transport into the runtime handle
    object.__setattr__(handle.runtime, "transport", process)
    return provider, handle


def test_observed_process_exit_is_not_finish(tmp_path):
    provider, handle = _start(tmp_path, "pi", process=FakeProcess(
        stdout='{"type":"session","version":3,"id":"sess-1"}\n{"type":"message_end","message":{"role":"assistant","text":"done"}}\n',
        exit_code=0))
    observations = provider.observe(handle)
    kinds = [o.kind for o in observations]
    assert ObservationKind.SESSION in kinds and ObservationKind.MESSAGE in kinds
    # exit 0 without a native terminal event is recorded as PROCESS_EXIT, not completion
    terminal = observations[-1]
    assert terminal.kind is ObservationKind.TERMINAL
    assert terminal.terminal_condition is TerminalCondition.PROCESS_EXIT
    assert not terminal.is_error
    # finish still only PROPOSES; the host decides
    proposal = provider.finish(handle)
    assert proposal.decision_owner == "host"
    assert proposal.exit_code == 0
    assert proposal.terminal.kind is ObservationKind.TERMINAL


def test_live_process_yields_a_running_lifecycle_observation(tmp_path):
    provider, handle = _start(tmp_path, "codex", process=FakeProcess(stdout="", exit_code=0, alive=True))
    observations = provider.observe(handle)
    assert observations[-1].kind is ObservationKind.LIFECYCLE
    assert observations[-1].text == "running"
    assert all(o.kind is not ObservationKind.TERMINAL for o in observations)


def test_finish_proposal_requires_no_work_core_call(tmp_path):
    """A zero exit plus a successful native stream must not mark anything
    terminal in Work Core: FinishProposal carries empty output refs and the
    decision owner stays the Host."""
    provider, handle = _start(tmp_path, "claude", process=FakeProcess(
        stdout='{"type":"system","subtype":"init","session_id":"s9"}\n'
               '{"type":"result","subtype":"success","is_error":false,"session_id":"s9","result":"ok"}\n',
        exit_code=0))
    proposal = provider.finish(handle)
    assert proposal.terminal.terminal_condition is TerminalCondition.COMPLETED
    assert proposal.decision_owner == "host"
    assert not getattr(proposal, "output_refs", ()) and not getattr(proposal, "resource_observations", ())
    # handle bookkeeping marks submission but nothing else mutates Work Core
    assert handle.submitted is True


def test_failed_exit_produces_an_error_terminal_observation(tmp_path):
    provider, handle = _start(tmp_path, "opencode", process=FakeProcess(stdout="", exit_code=1))
    proposal = provider.finish(handle)
    assert proposal.terminal.is_error is True
    assert proposal.terminal.terminal_condition is TerminalCondition.PROCESS_EXIT


def test_hermes_usage_artifact_is_read_through_the_execution_bind(tmp_path):
    definition, executable, provider = _provider(tmp_path, "hermes")
    request, *_ = make_request(tmp_path / "hermes", definition, executable=executable,
                               execution_id="exec_usage", prompt="usage run")
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    # simulate the native usage report written through the rw home bind
    usage = handle.staged_home.root / "usage-report.json"
    usage.write_text('{"session_id":"hermes-77","completed":true,"failed":false,'
                     '"total_tokens":321,"estimated_cost_usd":0.5,"model":"offline-1"}', encoding="utf-8")
    object.__setattr__(handle.runtime, "transport", FakeProcess(stdout="", exit_code=0))
    observations = provider.observe(handle)
    usage_observation = next(o for o in observations if o.kind is ObservationKind.USAGE)
    assert usage_observation.session_locator == "hermes-77"
    assert usage_observation.usage["total_tokens"] == 321.0
    terminal = observations[-1]
    # the native usage report says completed -> terminal condition comes from
    # the native document, not merely from the process exit code
    assert terminal.terminal_condition is TerminalCondition.COMPLETED


# --------------------------------------------------------------------------- #
# terminal guard: finish is only legal on a TERMINAL process/session
# --------------------------------------------------------------------------- #

def _profile_start(tmp_path, driver="claude"):
    from agent_box_harnesses.generic.profile_store import ProfileStore
    from agent_box_harnesses.native_home.policy import FIVE_POLICIES

    definition, executable, provider = _provider(tmp_path, driver)
    store = ProfileStore(tmp_path / "profiles", policies=FIVE_POLICIES)
    store.put(definition.harness_type, {"profile_id": "main", "native_payload": {}})
    provider._profile_store = store
    request, *_ = make_request(
        tmp_path / driver, definition, executable=executable,
        profile=store.resolve("agent-box.profile@1", store.ref(definition.harness_type, "main")),
        execution_id=f"exec_guard_{driver}", prompt="guard",
    )
    receipt = provider.start(request)
    return provider, receipt.runtime_handle


def test_finish_while_running_raises_typed_and_keeps_the_view(tmp_path):
    provider, handle = _profile_start(tmp_path)
    from agent_box_harnesses.adapters.failures import FinishNotTerminal

    object.__setattr__(handle.runtime, "transport", FakeProcess(stdout="", exit_code=0, alive=True))
    with pytest.raises(FinishNotTerminal):
        provider.finish(handle)
    # no reconcile, no discard, no fabricated terminal observation
    assert handle.reconcile_report is None
    assert handle.view is not None and handle.view.root.exists()
    from agent_box_harnesses.native_home.view import ActiveExecutionRegistry

    view = handle.view
    assert ActiveExecutionRegistry(view.layout).active() == (handle.execution_id,)
    # once the process exits, finish proceeds exactly once
    object.__setattr__(handle.runtime, "transport", FakeProcess(stdout="", exit_code=0))
    proposal = provider.finish(handle)
    assert proposal.decision_owner == "host"
    assert handle.reconcile_report is not None and handle.reconcile_report.status == "ok"
    assert not handle.view.root.exists()  # discarded after ok reconcile


def test_finish_is_idempotent_after_terminal(tmp_path):
    provider, handle = _profile_start(tmp_path)
    object.__setattr__(handle.runtime, "transport", FakeProcess(stdout="", exit_code=0))
    first = provider.finish(handle)
    second = provider.finish(handle)
    assert first.exit_code == second.exit_code == 0
    assert first.terminal == second.terminal
    assert handle.reconcile_report is not None
    # reconcile happened exactly once (report set) and the view is gone
    assert handle.view is None or not handle.view.root.exists()


def test_finish_with_pending_transport_is_not_terminal(tmp_path):
    provider, handle = _profile_start(tmp_path)
    from agent_box_harnesses.adapters.failures import FinishNotTerminal

    object.__setattr__(handle.runtime, "transport", FakeProcess(stdout="", exit_code=None, alive=True))
    with pytest.raises(FinishNotTerminal):
        provider.finish(handle)
    assert handle.reconcile_report is None
    assert handle.view is not None and handle.view.root.exists()
    # the host keeps the view; explicit discard is still possible
    handle.view.discard()
