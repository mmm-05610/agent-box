"""Hermes synthetic-executable verticals: the REAL formal launch chain.

Level 1 (unconditional, offline fake runtime ports): plan-shape truth —
profile freeze into the staged execution home (``.hermes/config.yaml`` with
the model key), exec argv ``hermes -z`` with the injected ``--usage-file``
observation artifact, native ``--resume`` continuation argv shape, the
transcript-handoff continuation Ref round-trip (locator + context digest
metadata), and host-path-free guest environment.

Level 2 (real spawn, bwrap-gated): the synthetic "hermes" binary runs inside
the real bubblewrap sandbox through staging -> lowering -> assembler ->
coordinator -> spawn: it prints unstructured stdout lines and writes the
usage-report JSON document at ``/runtime/home/usage-report.json``.  Proves
USAGE observation decode (model + session locator + token usage), TERMINAL
from the native document, nonzero-exit honesty, host-path redaction, and
runtime-transport cancel truth (exec mode has no driver cancel).

No model request, no credential read, no real Hermes binary required.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from agent_box.protocols.runtime import content_digest
from agent_box.resource_contracts import PromptFragmentV1, WorkspaceV1
from agent_box.work_core import ExecutionStartRequest, Ref, RefType, ResolvedExecutionInput
from agent_box_harnesses.adapters import ADAPTERS
from agent_box_harnesses.adapters.failures import PlanRejected
from agent_box_harnesses.adapters.observation import ObservationKind, TerminalCondition
from agent_box_harnesses.generic.execution_provider import GenericExecutionProvider
from agent_box_harnesses.generic.profile_envelope import ProfileEnvelope
from agent_box_harnesses.hermes.continuation import HermesContinuationResourceProvider
from agent_box_harnesses.hermes.contracts import HermesContinuationV1
from agent_box_harnesses.resources.executable import resolve_executable
from agent_box_runtime_local.provider import LocalRuntimeHostProvider
from agent_box_sandbox_bwrap.provider import BwrapSandboxProvider
from agent_box_terminal_session.direct_stdio import DirectStdioResourceProvider
from agent_box_terminal_session.direct_stdio import DirectStdioSession
from helpers import definition_by_driver, make_fake_executable, make_request, resolved_executable_for

MODEL = "synthetic-hermes-model"
PROFILE_MODEL = "synthetic-hermes-profile-model"
USAGE_DOCUMENT = (
    '{"session_id":"hermes-vert-7","completed":true,"failed":false,'
    '"total_tokens":321,"estimated_cost_usd":0.5,"model":"' + MODEL + '"}'
)

HERMES_SUCCESS_BODY = """#!/bin/sh
printf 'hermes oneshot stdout line 1\\n'
printf 'hermes oneshot stdout line 2\\n'
if [ -f /runtime/home/.hermes/config.yaml ]; then
  cat /runtime/home/.hermes/config.yaml > /workspace/config-seen.txt
else
  echo absent > /workspace/config-seen.txt
fi
echo mutated > /workspace/mutation.txt
printf '%s\\n' '<USAGE_JSON>' > /runtime/home/usage-report.json
""".replace("<USAGE_JSON>", USAGE_DOCUMENT)

HERMES_FAILURE_BODY = """#!/bin/sh
printf 'hermes failed oneshot stdout\\n'
exit 5
"""

HERMES_CANCEL_BODY = """#!/bin/sh
sleep 30
"""


def _offline_provider(tmp_path: Path) -> tuple[GenericExecutionProvider, object]:
    definition = definition_by_driver("hermes")
    executable = resolved_executable_for(tmp_path, definition, probe=False)
    provider = GenericExecutionProvider(
        definition, ADAPTERS["hermes"], staging_root=tmp_path / "staging",
        executable_resolver=lambda spec: executable,
    )
    return provider, executable


def _profile() -> ProfileEnvelope:
    return ProfileEnvelope(
        name="main", agent_type="hermes", digest="sha256:" + "3" * 64,
        native_payload={"model": PROFILE_MODEL, "unknown_managed_key": True},
    )


def _wait_exit(process, timeout_s: float = 15.0):
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        code = process.poll()
        if code is not None:
            return code
        time.sleep(0.05)
    return None


# --------------------------------------------------------------------------- #
# Level 1: unconditional plan-shape truth through the real chain stages
# --------------------------------------------------------------------------- #

def test_profile_freeze_renders_model_into_staged_hermes_config(tmp_path):
    provider, executable = _offline_provider(tmp_path)
    request, *_ = make_request(tmp_path, provider.definition, executable=executable,
                               profile=_profile(), prompt="freeze me")
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    staged_config = handle.staged_home.root / ".hermes" / "config.yaml"
    assert staged_config.is_file()
    rendered = json.loads(staged_config.read_text(encoding="utf-8"))  # JSON is a YAML 1.2 subset
    # YAML tolerates unknown keys natively (FACTS D): the full managed payload
    # renders, and the unknown key only surfaces as a bounded diagnostic
    assert rendered["model"] == PROFILE_MODEL
    diagnostics = ADAPTERS["hermes"].validate_native_payload(_profile().native_payload)
    assert "UNKNOWN_CONFIG_KEY:unknown_managed_key" in diagnostics
    # vendor payload vocabulary for the model selection
    assert provider.profile_model_selection(_profile()) == PROFILE_MODEL
    assert ADAPTERS["hermes"].profile_model({"model": PROFILE_MODEL}) == PROFILE_MODEL
    assert ADAPTERS["hermes"].profile_model({}) is None  # honest absence


def test_exec_argv_injects_usage_file_after_dash_z(tmp_path):
    provider, executable = _offline_provider(tmp_path)
    request, *_ = make_request(tmp_path, provider.definition, executable=executable,
                               prompt="run the task")
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    assert handle.plan.argv == (
        "/runtime/bin/hermes", "-z",
        "--usage-file", "/runtime/home/usage-report.json",
        "# task\n\nrun the task",
    )
    environment = handle.plan.environment
    assert environment["HERMES_HOME"] == "/runtime/home/.hermes"
    assert environment["HOME"] == "/runtime/home"
    assert not any(str(tmp_path) in value for value in environment.values())


def test_continuation_locator_comes_from_transcript_ref_and_argv_is_resume(tmp_path):
    provider, executable = _offline_provider(tmp_path)
    digest = "sha256:" + "4" * 64
    continuation = HermesContinuationV1("transcript-ref-x", digest)
    request, *_ = make_request(tmp_path, provider.definition, executable=executable,
                               prompt="continue the task", extra_inputs=(continuation,))
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    # transcript_ref is the locator; the context digest travels as Ref metadata
    assert handle.plan.continuation is not None
    assert handle.plan.continuation.session_locator == "transcript-ref-x"
    assert handle.plan.continuation.argv == ("--resume", "transcript-ref-x")
    assert ("--resume", "transcript-ref-x") == tuple(handle.plan.argv[4:6])
    assert handle.plan.argv[2:4] == ("--usage-file", "/runtime/home/usage-report.json")


def test_continuation_ref_round_trips_through_the_hermes_resource_provider(tmp_path):
    provider, _ = _offline_provider(tmp_path)
    digest = "sha256:" + "4" * 64
    assert provider.continuation_contract_id() == "agent-box.hermes-continuation@1"
    ref = provider.continuation_ref("transcript-ref-x", extra_metadata={"context_digest": digest})
    assert ref.provider == "hermes-continuation"  # registry-declared target provider
    assert ref.metadata["context_digest"] == digest
    assert ref.metadata["harness_type"] == "hermes"

    # round-trip: the Ref resolves back to a valid typed contract value
    resource_provider = HermesContinuationResourceProvider()
    resolved = resource_provider.resolve("agent-box.hermes-continuation@1", ref)
    assert resolved == HermesContinuationV1("transcript-ref-x", digest)

    # fail closed: a context-digest-less Ref is not resolvable, and invalid
    # metadata is rejected at Ref construction time
    with pytest.raises(ValueError):
        resource_provider.resolve("agent-box.hermes-continuation@1", provider.continuation_ref("transcript-ref-x"))
    with pytest.raises(PlanRejected):
        provider.continuation_ref("transcript-ref-x", extra_metadata={"context_digest": 123})
    with pytest.raises(PlanRejected):
        provider.continuation_ref("")


# --------------------------------------------------------------------------- #
# Level 2: real spawn verticals (real bwrap; skipped only when bwrap cannot run)
# --------------------------------------------------------------------------- #

def _real_chain(tmp_path: Path, body: str, *, profile=None):
    definition = definition_by_driver("hermes")
    binary = make_fake_executable(tmp_path / "bin", "hermes", body=body)
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

    workspace = tmp_path / "workspace"
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
    request = ExecutionStartRequest("exec_hermes_vertical", "dispatch_hermes_vertical",
                                    "inputs-digest", tuple(inputs))
    provider = GenericExecutionProvider(definition, ADAPTERS["hermes"], staging_root=tmp_path / "staging",
                                        executable_resolver=lambda spec: executable)
    return provider, request, workspace


def test_full_exec_vertical_usage_document_decodes_real_sandbox(tmp_path):
    provider, request, workspace = _real_chain(tmp_path, HERMES_SUCCESS_BODY, profile=_profile())
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    process = handle.runtime.transport
    exit_code = _wait_exit(process)
    assert exit_code == 0, process.stderr.read()[:400] if process.stderr else "process failed"

    # live workspace mutation and guest-side profile freeze proof
    assert (workspace / "mutation.txt").read_text().strip() == "mutated"
    seen = json.loads((workspace / "config-seen.txt").read_text())
    assert seen["model"] == PROFILE_MODEL
    host_staged = handle.staged_home.root / ".hermes" / "config.yaml"
    assert json.loads(host_staged.read_text(encoding="utf-8"))["model"] == PROFILE_MODEL

    # the usage report was written through the rw home bind and decodes
    assert (handle.staged_home.root / "usage-report.json").is_file()
    observations = provider.observe(handle)

    usage = next(item for item in observations if item.kind is ObservationKind.USAGE)
    assert usage.session_locator == "hermes-vert-7"  # locator extracted from the usage document
    assert usage.model == MODEL
    assert usage.usage["total_tokens"] == 321.0
    assert usage.usage["estimated_cost_usd"] == 0.5

    terminal = observations[-1]
    assert terminal.kind is ObservationKind.TERMINAL
    assert terminal.terminal_condition is TerminalCondition.COMPLETED  # from the native document
    assert terminal.is_error is False
    # unstructured stdout lines decode as bounded unknowns, never as facts
    unknowns = [item for item in observations if item.kind is ObservationKind.UNKNOWN]
    assert len(unknowns) == 2

    # the extracted locator feeds a valid native continuation Ref
    ref = provider.continuation_ref(usage.session_locator,
                                    extra_metadata={"context_digest": "sha256:" + "4" * 64})
    assert ref.provider == "hermes-continuation"

    # redaction: no host path in observations or diagnostics
    for observation in observations:
        rendered = repr(observation)
        assert str(tmp_path) not in rendered and str(Path.home()) not in rendered
    diagnostics = repr(provider.diagnostics())
    assert str(tmp_path) not in diagnostics and str(Path.home()) not in diagnostics

    # process exit produced a FinishProposal only; the Host decides
    proposal = provider.finish(handle)
    assert proposal.decision_owner == "host"
    assert proposal.exit_code == 0
    assert proposal.terminal.is_error is False


def test_exec_vertical_nonzero_exit_is_honest_failure(tmp_path):
    provider, request, workspace = _real_chain(tmp_path, HERMES_FAILURE_BODY)
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    assert _wait_exit(handle.runtime.transport) == 5
    observations = provider.observe(handle)
    # no usage document was written: the terminal truth is the process exit
    assert not (handle.staged_home.root / "usage-report.json").exists()
    terminal = observations[-1]
    assert terminal.kind is ObservationKind.TERMINAL
    assert terminal.terminal_condition is TerminalCondition.PROCESS_EXIT
    assert terminal.is_error is True
    proposal = provider.finish(handle)
    assert proposal.exit_code == 5
    assert proposal.decision_owner == "host"
    assert proposal.terminal.is_error is True
    assert not (workspace / "mutation.txt").exists()


def test_cancel_dispatch_terminates_running_exec_via_runtime_transport(tmp_path):
    provider, request, workspace = _real_chain(tmp_path, HERMES_CANCEL_BODY)
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    process = handle.runtime.transport
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline and process.poll() is None:
        time.sleep(0.05)
    assert process.poll() is None  # still running

    # exec mode has no session driver: cancel goes through the runtime
    # transport and termination is provable via dispatch_state
    result = provider.cancel_dispatch(receipt.dispatch_id)
    assert result == {"state": "terminate_sent", "via": "runtime-transport"}

    deadline = time.monotonic() + 10
    while time.monotonic() < deadline and process.poll() is None:
        time.sleep(0.05)
    exit_code = process.poll()
    assert exit_code is not None and exit_code != 0  # terminated, never completed

    state = provider.dispatch_state(receipt.dispatch_id)
    assert state["state"] == "terminal"
    assert state["exit_code"] == exit_code
    assert not (workspace / "mutation.txt").exists()
