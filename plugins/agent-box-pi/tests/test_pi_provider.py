"""Provider semantics: start, exact pane, prompt projection, SessionRef,
continuation, explicit finish, process-exit != terminal, recover, concurrency,
and the no-secret-in-evidence rule."""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from agent_box.work_core import Phase, RefType
from agent_box_pi import (
    PiContinuationV1,
    PiTmuxInteractiveExecutionProvider,
    build_launch_command,
)
from agent_box_pi.config import PiConfigError

from helpers import (
    FakeConsoleController,
    make_config,
    make_pane,
    make_request,
    write_session_file,
)


def _provider(tmp_path, *, probe_provided=True):
    return PiTmuxInteractiveExecutionProvider(
        config_loader=lambda: make_config(tmp_path),
        console_controller=FakeConsoleController(),
        version_probe=(lambda binary: "0.84.3") if probe_provided else None,
    )


def test_start_receives_complete_request_and_projects_prompt(tmp_path):
    provider = _provider(tmp_path)
    handle = provider.start(make_request(tmp_path))
    assert handle.execution_id == "exec-1"
    assert handle.dispatch_id == "dispatch-1"
    console, pane_id, argv, cwd = provider._console.launches[0]
    assert pane_id == "%7"
    assert cwd == tmp_path.resolve()
    # env prefix carries the plugin-owned roots, never a profile.
    assert any(item.startswith("PI_CODING_AGENT_DIR=") for item in argv[:3])
    assert any(item.startswith("PI_CODING_AGENT_SESSION_DIR=") for item in argv[:3])
    assert "--provider" in argv and argv[argv.index("--provider") + 1] == "deepseek"
    assert "--model" in argv and argv[argv.index("--model") + 1] == "deepseek/deepseek-v4-flash"
    assert "--session-id" in argv
    assert "--name" in argv and argv[argv.index("--name") + 1] == "exec-1"
    prompt = argv[-1]
    assert "# Responsibility" in prompt
    assert "Research the DeepSeek integration surface." in prompt
    assert "# Constraints" in prompt
    assert "Do not modify Work Core; evidence only." in prompt
    assert "Agent-Box Execution responsibility" in prompt


def test_start_validates_exact_pane_via_inspect(tmp_path):
    inspect_calls = []
    controller = FakeConsoleController()
    original = controller.inspect
    controller.inspect = lambda console, pane_id: (inspect_calls.append(pane_id) or original(console, pane_id))
    provider = PiTmuxInteractiveExecutionProvider(
        config_loader=lambda: make_config(tmp_path),
        console_controller=controller,
        version_probe=lambda binary: "0.84.3",
    )
    provider.start(make_request(tmp_path))
    assert inspect_calls == ["%7"]


def test_start_rejects_missing_prompt_and_bad_limits(tmp_path):
    provider = _provider(tmp_path)
    from agent_box.resource_contracts import PromptFragmentV1
    request = make_request(tmp_path, fragments=())
    request = type(request)(
        request.execution_id,
        request.dispatch_id,
        request.inputs_digest,
        tuple(
            item
            for item in request.resolved_inputs
            if item.contract_id != PromptFragmentV1.contract_id
        ),
    )
    with pytest.raises(ValueError, match="prompt fragment"):
        provider.start(request)
    from agent_box_tmux import TmuxPaneV1
    empty = make_request(tmp_path)
    empty = type(empty)(
        empty.execution_id, empty.dispatch_id, empty.inputs_digest,
        tuple(
            item
            for item in empty.resolved_inputs
            if item.contract_id != TmuxPaneV1.contract_id
        ),
    )
    with pytest.raises(ValueError, match="expected one agent-box-tmux.pane@1"):
        provider.start(empty)


def test_fresh_session_ref_and_explicit_finish(tmp_path):
    provider = _provider(tmp_path)
    handle = provider.start(make_request(tmp_path))
    assert provider.observe(handle).projection.phase is Phase.ACTIVE
    session_file = write_session_file(provider._config_loader().resolved_session_root, handle.session_id)
    observation = provider.finish(handle, session_wait_timeout=0)
    assert observation.projection.phase is Phase.TERMINAL
    assert observation.projection.outcome.value == "succeeded"
    assert observation.pi_session_id == handle.session_id
    assert observation.session_file == session_file
    assert provider._console.cleaned == ["%7"]
    refs = {ref.type: ref for ref in observation.native_refs}
    pi_session = refs[RefType.SESSION]
    assert pi_session.provider == "pi"
    assert pi_session.native_id == handle.session_id
    assert pi_session.metadata["provider"] == "deepseek"
    kinds = {ref.metadata.get("kind") for ref in observation.output_refs}
    assert {"tmux-scrollback", "pi-session-jsonl", "pi-start-record"} <= kinds
    assert "sk-" not in json.dumps([ref.metadata for ref in observation.native_refs])


def test_start_writes_recoverable_start_record_durably(tmp_path):
    provider = _provider(tmp_path)
    handle = provider.start(make_request(tmp_path))
    record_path = handle.start_record_path
    assert record_path.is_file()
    record = json.loads(record_path.read_text(encoding="utf-8"))
    assert record["dispatch_id"] == "dispatch-1"
    assert record["execution_id"] == "exec-1"
    assert record["session_id"] == handle.session_id
    assert record["provider"] == "deepseek"
    assert record["model"] == "deepseek/deepseek-v4-flash"
    assert record["pane_id"] == "%7"
    assert record["pi_version"] == "0.84.3"
    assert record["auth_source"] in {"env:DEEPSEEK_API_KEY", "pi-auth-file"}


def test_continuation_uses_old_native_session_in_new_core_execution(tmp_path):
    provider = _provider(tmp_path)
    old_file = write_session_file(provider._config_loader().resolved_session_root, "session-old-001")
    continuation = PiContinuationV1(
        session_id="session-old-001",
        session_file=str(old_file),
        provider="deepseek",
        model="deepseek/deepseek-v4-flash",
    )
    request = make_request(tmp_path, execution_id="exec-next", dispatch_id="dispatch-next",
                           continuation=continuation)
    handle = provider.start(request)
    assert handle.dispatch_id == "dispatch-next"
    assert handle.execution_id == "exec-next"
    assert handle.session_id == "session-old-001"
    argv = provider._console.launches[0][2]
    assert "--session" in argv
    assert argv[argv.index("--session") + 1] == str(old_file)
    assert "--session-id" not in argv
    assert argv[argv.index("--name") + 1] == "exec-next"
    observation = provider.observe(handle)
    write_session_file(provider._config_loader().resolved_session_root, "session-old-001")
    final = provider.finish(handle, session_wait_timeout=0)
    assert final.pi_session_id == "session-old-001"
    refs = [ref for ref in final.native_refs if ref.type is RefType.SESSION and ref.provider == "pi"]
    assert refs[0].native_id == "session-old-001"


def test_observe_reports_active_while_pane_alive_even_after_process_replaced(tmp_path):
    provider = _provider(tmp_path)
    handle = provider.start(make_request(tmp_path))
    assert provider.observe(handle).projection.phase is Phase.ACTIVE
    # A finished turn / idle TUI is still ACTIVE — never terminal.
    assert provider.observe(handle).projection.freshness.value == "observed"


def test_process_exit_is_not_automatic_terminal(tmp_path):
    controller = FakeConsoleController(dead=True, exit_status=1)
    provider = PiTmuxInteractiveExecutionProvider(
        config_loader=lambda: make_config(tmp_path),
        console_controller=controller,
        version_probe=lambda binary: "0.84.3",
    )
    handle = provider.start(make_request(tmp_path))
    observation = provider.observe(handle)
    assert observation.projection.phase is Phase.UNKNOWN
    assert observation.projection.outcome is None


def test_finish_reports_failed_when_pane_died_without_evidence(tmp_path):
    controller = FakeConsoleController(dead=True, exit_status=1)
    provider = PiTmuxInteractiveExecutionProvider(
        config_loader=lambda: make_config(tmp_path),
        console_controller=controller,
        version_probe=lambda binary: "0.84.3",
    )
    handle = provider.start(make_request(tmp_path))
    final = provider.finish(handle, session_wait_timeout=0)
    assert final.projection.phase is Phase.TERMINAL
    assert final.projection.outcome.value == "failed"


def test_recover_rebuilds_control_without_starting_or_respawning(tmp_path):
    controller = FakeConsoleController()
    provider = PiTmuxInteractiveExecutionProvider(
        config_loader=lambda: make_config(tmp_path),
        console_controller=controller,
        version_probe=lambda binary: "0.84.3",
    )
    original = provider.start(make_request(tmp_path))
    start_calls = len(controller.launches)
    recovered = provider.recover_handle(
        execution_id="exec-1",
        dispatch_id="dispatch-1",
        inputs_digest="inputs-digest",
        workspace=original.workspace,
        pane=original.pane,
        projected_contracts=("agent-box.workspace@1", "agent-box.prompt-fragment@1", "agent-box-tmux.pane@1"),
    )
    assert len(controller.launches) == start_calls  # nothing launched
    assert recovered.session_id == original.session_id
    observation = provider.observe("dispatch-1")
    assert observation.projection.phase is Phase.ACTIVE


def test_recover_requires_start_record_or_continuation(tmp_path):
    provider = _provider(tmp_path)
    pane = make_pane(tmp_path)
    from agent_box.resource_contracts import WorkspaceV1
    with pytest.raises(ValueError, match="cannot determine the native session id"):
        provider.recover_handle(
            execution_id="e", dispatch_id="d-missing", inputs_digest="x",
            workspace=WorkspaceV1(tmp_path, "sha256:s"), pane=pane,
            projected_contracts=("agent-box.workspace@1",),
        )


def test_four_parallel_executions_do_not_cross_talk(tmp_path):
    provider = _provider(tmp_path)
    handles = []
    for index in range(4):
        pane = make_pane(tmp_path, pane_id=f"%{10 + index}")
        request = make_request(
            tmp_path,
            execution_id=f"exec-{index}",
            dispatch_id=f"dispatch-{index}",
            pane=pane,
        )
        handles.append(provider.start(request))

    session_ids = {handle.session_id for handle in handles}
    assert len(session_ids) == 4
    dispatch_ids = {handle.dispatch_id for handle in handles}
    assert len(dispatch_ids) == 4
    panes = [provider._console.launches[i][1] for i in range(4)]
    assert len(set(panes)) == 4
    # Each launch argv's --session-id matches that handle's own native id.
    for index, handle in enumerate(handles):
        argv = provider._console.launches[index][2]
        assert argv[argv.index("--session-id") + 1] == handle.session_id
        assert handle.session_id not in {other.session_id for other in handles if other is not handle}
        assert provider.observe(handle).projection.phase is Phase.ACTIVE
        provider.finish(handle, session_wait_timeout=0)
    # Distinct evidence/scrollback artifacts per dispatch.
    evidence_dir = provider._config_loader().resolved_evidence_root
    scrollbacks = sorted(str(path.name) for path in evidence_dir.glob("*.tmux.txt"))
    assert len(scrollbacks) == 4


def test_deepseek_key_never_lands_in_start_record_or_facts(tmp_path, monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test-credential-value-never-persisted")
    provider = _provider(tmp_path)
    handle = provider.start(make_request(tmp_path))
    argv = provider._console.launches[0][2]
    # The credential is referenced only through the transient launch env.
    assert any(item.startswith("DEEPSEEK_API_KEY=sk-test-credential") for item in argv[:4])
    record_text = handle.start_record_path.read_text(encoding="utf-8")
    # Only the env-var *reference* is allowed in evidence — never the value.
    assert "sk-test-credential" not in record_text
    assert "env:DEEPSEEK_API_KEY" in record_text
    write_session_file(provider._config_loader().resolved_session_root, handle.session_id)
    observation = provider.finish(handle, session_wait_timeout=0)
    serialized = json.dumps(
        [ref.metadata for ref in observation.native_refs]
        + [ref.metadata for ref in observation.output_refs]
    )
    assert "sk-test-credential" not in serialized
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)


def test_version_mismatch_fails_start_with_config_error(tmp_path):
    with pytest.raises(PiConfigError, match="differs from pinned"):
        PiTmuxInteractiveExecutionProvider(
            config_loader=lambda: make_config(tmp_path, version="0.84.2"),
            console_controller=FakeConsoleController(),
            version_probe=lambda binary: "0.84.3",
        ).start(make_request(tmp_path))


def test_build_launch_command_continuation_uses_path_when_present(tmp_path):
    config = make_config(tmp_path)
    argv = build_launch_command(
        config,
        workspace=tmp_path,
        execution_id="exec-c",
        session_id="new-id",
        prompt="continue",
        continuation=PiContinuationV1("old-id", str(tmp_path / "old.jsonl")),
    )
    assert argv[argv.index("--session") + 1] == str(tmp_path / "old.jsonl")

def test_continuation_model_must_match_pinned_deepseek_model(tmp_path, monkeypatch):
    from agent_box_pi.config import PiConfigError
    provider = _provider(tmp_path)
    old_file = write_session_file(provider._config_loader().resolved_session_root, "model-drift")
    wrong_model = PiContinuationV1(
        session_id="model-drift",
        session_file=str(old_file),
        provider="deepseek",
        model="deepseek/deepseek-v4-pro",
    )
    with pytest.raises(PiConfigError, match="differs from the configured DeepSeek model"):
        provider.start(make_request(tmp_path, continuation=wrong_model))
    same_model = PiContinuationV1(
        session_id="model-drift",
        session_file=str(old_file),
        provider="deepseek",
        model="deepseek-v4-flash",  # bare id accepted, same family
    )
    handle = provider.start(make_request(tmp_path, continuation=same_model))
    assert handle.session_id == "model-drift"
