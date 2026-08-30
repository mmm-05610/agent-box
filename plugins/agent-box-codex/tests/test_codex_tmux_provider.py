import json
from pathlib import Path

import pytest

from agent_box.launch import LaunchPlan
from agent_box.resource_contracts import (
    AgentBoxProfileV1,
    PromptFragmentV1,
    WorkspaceV1,
)
from agent_box.work_core import (
    ExecutionStartRequest,
    Phase,
    Ref,
    RefType,
    ResolvedExecutionInput,
)
from agent_box_codex import (
    CodexContinuationV1,
    CodexTmuxInteractiveExecutionProvider,
)
from agent_box_tmux import TmuxConsoleV1, TmuxPaneObservation, TmuxPaneV1


class FakeConsoleController:
    def __init__(self):
        self.launches = []
        self.cleaned = False
        self.dead = False

    def launch(self, console, pane_id, argv, *, cwd):
        self.launches.append((console, pane_id, tuple(argv), Path(cwd)))

    def inspect(self, console, pane_id):
        return TmuxPaneObservation(
            not self.cleaned,
            pane_id,
            1234,
            self.dead if not self.cleaned else None,
            1 if self.dead and not self.cleaned else None,
            "codex",
            "/workspace",
            "codex",
        )

    def capture(self, console, pane_id):
        return "visible Codex transcript\n"

    def cleanup(self, console):
        self.cleaned = True


def _console() -> TmuxConsoleV1:
    return TmuxConsoleV1(
        binary=Path("/usr/bin/tmux"),
        version="tmux 3.4",
        spec_digest="sha256:console",
        socket_name="abx-test",
        session_name="abx-test",
        session_id="$1",
        pane_ids=("%1",),
        attach_command=("/usr/bin/tmux", "-L", "abx-test", "attach", "-t", "abx-test"),
    )


def _pane() -> TmuxPaneV1:
    return TmuxPaneV1(
        binary=Path("/usr/bin/tmux"),
        version="tmux 3.4",
        socket_path=Path("/tmp/tmux-1000/default"),
        server_pid=42,
        session_id="$1",
        session_name="user-session",
        window_id="@2",
        pane_id="%7",
        pane_pid=43,
        original_path=Path("/workspace"),
        current_path=Path("/workspace"),
        original_command="bash",
        current_command="bash",
        attach_command=(
            "/usr/bin/tmux", "-S", "/tmp/tmux-1000/default", "attach",
            "-t", "user-session",
        ),
    )


def _request(tmp_path, *, continuation=None, resource=None, both=False):
    resource = resource or _console()
    inputs = {
        WorkspaceV1.contract_id: (WorkspaceV1(tmp_path, "sha256:source"),),
        PromptFragmentV1.contract_id: (
            PromptFragmentV1("Responsibility", "Implement the bounded change.", "sha256:prompt"),
        ),
        AgentBoxProfileV1.contract_id: (
            AgentBoxProfileV1("codex-main", "codex", "sha256:profile"),
        ),
        TmuxConsoleV1.contract_id: (resource,) if isinstance(resource, TmuxConsoleV1) else (),
        TmuxPaneV1.contract_id: (resource,) if isinstance(resource, TmuxPaneV1) else (),
    }
    if both:
        inputs[TmuxConsoleV1.contract_id] = (_console(),)
        inputs[TmuxPaneV1.contract_id] = (_pane(),)
    if continuation is not None:
        inputs[CodexContinuationV1.contract_id] = (CodexContinuationV1(continuation),)
    resolved = tuple(
        ResolvedExecutionInput(
            contract_id,
            Ref(RefType.ARTIFACT, "test-input", f"{contract_id}:{index}"),
            value,
        )
        for contract_id, values in inputs.items()
        for index, value in enumerate(values)
    )
    return ExecutionStartRequest("exec-1", "dispatch-1", "inputs-digest", resolved)


def _plan_builder(calls):
    def build(profile, *, extra_args, cwd):
        calls.append((profile, tuple(extra_args), Path(cwd)))
        return LaunchPlan(
            ["/usr/bin/bwrap", "--", "/usr/bin/codex", *extra_args],
            {},
            Path(cwd),
            "codex",
            "/usr/bin/codex",
            [],
        )

    return build


def test_starts_visible_tui_stays_active_and_only_finish_is_terminal(tmp_path):
    calls = []
    controller = FakeConsoleController()
    provider = CodexTmuxInteractiveExecutionProvider(
        tmp_path / "evidence",
        plan_builder=_plan_builder(calls),
        console_controller=controller,
    )

    handle = provider.start(_request(tmp_path))
    assert handle.attach_command[-1] == "abx-test"
    assert controller.launches[0][1] == "%1"
    argv = calls[0][1]
    assert "--no-alt-screen" in argv
    assert "--dangerously-bypass-hook-trust" in argv
    assert "Implement the bounded change." in argv[-1]
    assert provider.observe(handle).projection.phase is Phase.ACTIVE

    handle.session_event_path.write_text(
        json.dumps(
            {
                "session_id": "thread-123",
                "hook_event_name": "SessionStart",
                "source": "startup",
            }
        ),
        encoding="utf-8",
    )
    observation = provider.finish(handle, session_wait_timeout=0)
    assert observation.projection.phase is Phase.TERMINAL
    assert observation.codex_session_id == "thread-123"
    assert controller.cleaned is True
    assert {ref.type for ref in observation.native_refs} == {
        RefType.SESSION,
        RefType.RUN,
    }
    assert {ref.metadata["kind"] for ref in observation.output_refs} == {
        "tmux-scrollback",
        "codex-session-start",
    }


def test_resume_is_a_new_dispatch_that_uses_the_frozen_codex_session(tmp_path):
    calls = []
    controller = FakeConsoleController()
    provider = CodexTmuxInteractiveExecutionProvider(
        tmp_path / "evidence",
        plan_builder=_plan_builder(calls),
        console_controller=controller,
    )

    handle = provider.start(_request(tmp_path, continuation="thread-old"))
    argv = calls[0][1]
    assert argv[0] == "resume"
    assert "thread-old" in argv
    handle.session_event_path.write_text(
        json.dumps(
            {
                "session_id": "thread-old",
                "hook_event_name": "SessionStart",
                "source": "resume",
            }
        ),
        encoding="utf-8",
    )
    assert provider.observe(handle).codex_session_id == "thread-old"


def test_explicit_finish_reports_a_dead_failed_tui_as_failed(tmp_path):
    calls = []
    controller = FakeConsoleController()
    provider = CodexTmuxInteractiveExecutionProvider(
        tmp_path / "evidence",
        plan_builder=_plan_builder(calls),
        console_controller=controller,
    )
    handle = provider.start(_request(tmp_path))
    controller.dead = True

    assert provider.observe(handle).projection.phase is Phase.UNKNOWN
    final = provider.finish(handle, session_wait_timeout=0)
    assert final.projection.phase is Phase.TERMINAL
    assert final.projection.outcome.value == "failed"


def test_existing_pane_starts_with_exact_attach_and_identity_refs(tmp_path):
    calls = []
    controller = FakeConsoleController()
    provider = CodexTmuxInteractiveExecutionProvider(
        tmp_path / "evidence",
        plan_builder=_plan_builder(calls),
        console_controller=controller,
    )

    handle = provider.start(_request(tmp_path, resource=_pane()))
    assert handle.pane_id == "%7"
    assert handle.attach_command == (
        "/usr/bin/tmux", "-S", "/tmp/tmux-1000/default", "attach", "-t", "user-session"
    )
    handle.session_event_path.write_text(
        json.dumps({"session_id": "thread-pane", "hook_event_name": "SessionStart"}),
        encoding="utf-8",
    )
    observation = provider.finish(handle, session_wait_timeout=0)
    tmux_refs = [ref for ref in observation.native_refs if ref.provider == "tmux-console"]
    assert all(ref.uri and "%7" in ref.uri for ref in tmux_refs)
    assert tmux_refs[0].metadata["server_pid"] == "42"
    assert observation.codex_session_id == "thread-pane"


def test_console_and_existing_pane_are_xor_inputs(tmp_path):
    provider = CodexTmuxInteractiveExecutionProvider(
        tmp_path / "evidence",
        plan_builder=_plan_builder([]),
        console_controller=FakeConsoleController(),
    )
    with pytest.raises(ValueError, match="exactly one"):
        provider.start(_request(tmp_path, both=True))
    base = _request(tmp_path)
    empty = ExecutionStartRequest(
        base.execution_id,
        base.dispatch_id,
        base.inputs_digest,
        tuple(
            item
            for item in base.resolved_inputs
            if item.contract_id != TmuxConsoleV1.contract_id
        ),
    )
    empty = ExecutionStartRequest(
        empty.execution_id,
        empty.dispatch_id,
        empty.inputs_digest,
        tuple(
            item
            for item in empty.resolved_inputs
            if item.contract_id != TmuxPaneV1.contract_id
        ),
    )
    with pytest.raises(ValueError, match="exactly one"):
        provider.start(empty)


def test_recovers_existing_handle_without_launching_or_creating_a_dispatch(tmp_path):
    controller = FakeConsoleController()
    provider = CodexTmuxInteractiveExecutionProvider(
        tmp_path / "evidence", plan_builder=_plan_builder([]), console_controller=controller
    )
    handle = provider.recover_handle(
        execution_id="exec-existing", dispatch_id="dispatch-existing", inputs_digest="frozen",
        workspace=WorkspaceV1(tmp_path, "sha256:source"),
        profile=AgentBoxProfileV1("codex-main", "codex", "sha256:profile"),
        console=_console(),
        projected_contracts=(WorkspaceV1.contract_id, AgentBoxProfileV1.contract_id),
    )
    assert handle.dispatch_id == "dispatch-existing"
    assert controller.launches == []
    assert provider.observe("dispatch-existing").projection.phase is Phase.ACTIVE
