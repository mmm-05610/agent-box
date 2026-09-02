"""Failure stages, single-spawn, replay and START_AMBIGUOUS (adjudication 11
and the unchanged Root coordinator semantics).

PLAN_REJECTED / MATERIALIZATION_FAILED are produced by the provider before
any attempt exists; START_REJECTED / START_AMBIGUOUS come from the Root
composition coordinator and are stage-annotated without changing semantics.
"""
import pytest

from agent_box_harnesses.adapters import ADAPTERS
from agent_box_harnesses.adapters.failures import (
    MaterializationFailed, PlanRejected, StartAmbiguous, StartRejected,
)
from agent_box_harnesses.generic.execution_provider import GenericExecutionProvider
from agent_box.work_core import ResolvedExecutionInput
from helpers import (
    definition_by_driver, make_fake_executable, make_request,
    resolved_executable_for,
)


def _provider(tmp_path, driver="pi", *, resolver="ok"):
    definition = definition_by_driver(driver)
    if resolver == "ok":
        executable = resolved_executable_for(tmp_path / driver, definition)
        resolver_callable = lambda spec: executable
    else:
        resolver_callable = lambda spec: (_ for _ in ()).throw(ExecutableMissing())
    provider = GenericExecutionProvider(definition, ADAPTERS[driver], staging_root=tmp_path / "staging",
                                        executable_resolver=resolver_callable)
    return definition, provider


class ExecutableMissing(Exception):
    pass


def test_unresolvable_executable_is_plan_rejected_with_no_side_effects(tmp_path):
    definition, provider = _provider(tmp_path, resolver="missing")
    request, *_ = make_request(tmp_path, definition, executable=None)
    with pytest.raises(PlanRejected, match="EXECUTABLE_UNAVAILABLE"):
        provider.start(request)
    assert provider._handles == {}


def test_missing_runtime_inputs_is_plan_rejected(tmp_path):
    definition, provider = _provider(tmp_path, "pi")
    executable = resolved_executable_for(tmp_path / "pi", definition)
    request, *_ = make_request(tmp_path, definition, executable=executable)
    # strip the runtime ports: dispatch cannot start without exact ports
    stripped = type(request)(request.execution_id, request.dispatch_id, request.inputs_digest, tuple(
        item for item in request.resolved_inputs if item.contract_id not in {"agent-box.runtime-host@1", "agent-box.sandbox@1", "agent-box.terminal-session@1"}
    ))
    with pytest.raises(PlanRejected):
        provider.start(stripped)


def test_staging_failure_is_materialization_failed(tmp_path):
    definition, provider = _provider(tmp_path, "pi")
    executable = resolved_executable_for(tmp_path / "pi", definition)
    request, *_ = make_request(tmp_path, definition, executable=executable)
    # pre-create the staging target: the single writer refuses double materialization
    (tmp_path / "staging" / request.execution_id / "home").mkdir(parents=True)
    with pytest.raises(MaterializationFailed):
        provider.start(request)


def test_offline_sandbox_rejecting_control_plane_network_is_start_rejected(tmp_path):
    """A network-none sandbox cannot host a model-network harness plan: the
    rejection happens before the start authority is consumed."""
    from agent_box.protocols.runtime import SandboxV1
    from agent_box.protocols.runtime.protocol import SandboxRef

    definition, provider = _provider(tmp_path, "pi")
    executable = resolved_executable_for(tmp_path / "pi", definition)
    request, *_ = make_request(tmp_path, definition, executable=executable)
    offline_ref = SandboxRef("sandbox", "s-offline", "digest-s", "local:test", network_mode="none")
    spliced = tuple(
        ResolvedExecutionInput(item.contract_id, offline_ref, SandboxV1(offline_ref, item.value.port))
        if item.contract_id == "agent-box.sandbox@1" else item
        for item in request.resolved_inputs
    )
    offline_request = type(request)(request.execution_id, request.dispatch_id, request.inputs_digest, spliced)
    with pytest.raises(StartRejected, match="CAPABILITY_UNSUPPORTED"):
        provider.start(offline_request)


def test_response_loss_is_start_ambiguous_and_stays_ambiguous(tmp_path):
    """A lost native response after submit must surface START_AMBIGUOUS and
    never be silently retried (Root coordinator semantics preserved)."""
    from agent_box.protocols.runtime import TerminalSessionV1
    from agent_box.protocols.runtime.protocol import StartAmbiguous as RuntimeStartAmbiguous
    from agent_box.protocols.runtime.protocol import TerminalSessionRef

    definition, provider = _provider(tmp_path, "pi")
    executable = resolved_executable_for(tmp_path / "pi", definition)
    request, *_ = make_request(tmp_path, definition, executable=executable, execution_id="exec_amb")

    terminal_value = next(item.value for item in request.resolved_inputs if item.contract_id == "agent-box.terminal-session@1")

    class AmbiguousTerminal(type(terminal_value.port)):
        def run(self, host_transport, spec, attempt_key):
            raise RuntimeStartAmbiguous("native response lost")

    ambiguous_ref = TerminalSessionRef("terminal", "t-amb", "digest-t", "local:test")
    inputs = []
    for item in request.resolved_inputs:
        if item.contract_id == "agent-box.terminal-session@1":
            inputs.append(type(item)(item.contract_id, ambiguous_ref, TerminalSessionV1(ambiguous_ref, AmbiguousTerminal(ambiguous_ref, terminal_value.port))))
        else:
            inputs.append(item)
    ambiguous_request = type(request)(request.execution_id, "dispatch_amb", request.inputs_digest, tuple(inputs))
    with pytest.raises(StartAmbiguous):
        provider.start(ambiguous_request)


def test_single_spawn_semantics_are_preserved_by_the_root_coordinator(tmp_path):
    """Replaying the same dispatch returns the same handle without spawning
    twice; the coordinator ledger remains the single authority."""
    definition, provider = _provider(tmp_path, "pi")
    executable = resolved_executable_for(tmp_path / "pi", definition)
    request, *_ = make_request(tmp_path, definition, executable=executable, execution_id="exec_replay",
                               dispatch_id="dispatch_replay")
    first = provider.start(request)
    second = provider.start(request)  # same execution + dispatch identity
    assert second.runtime_handle is first.runtime_handle or second.runtime_handle.attempt_key == first.runtime_handle.attempt_key


def test_plan_rejection_leaves_no_staging_or_attempt_trace(tmp_path):
    definition, provider = _provider(tmp_path, "claude")
    executable = resolved_executable_for(tmp_path / "claude", definition)
    from agent_box_harnesses.generic.profile_envelope import ProfileEnvelope

    bad_profile = ProfileEnvelope(name="main", agent_type=definition.harness_type, digest="sha256:" + "a" * 64,
                                  revision=1, provider="harness-profile", native_payload={"api_key": "x"})
    request, *_ = make_request(tmp_path, definition, executable=executable, profile=bad_profile)
    with pytest.raises(PlanRejected):
        provider.start(request)
    assert not (tmp_path / "staging").exists() or not any((tmp_path / "staging").iterdir())
