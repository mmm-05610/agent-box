from pathlib import Path

from types import SimpleNamespace
from agent_box.resource_contracts import (
    AgentBoxProfileV1,
    PromptFragmentV1,
    WorkspaceV1,
)
from agent_box.work_core import ExecutionStartRequest, Ref, RefType, ResolvedExecutionInput
from agent_box.work_core.projection import Outcome, Phase
from agent_box_harnesses.codex.app_server import provider as module


class _Adapter:
    def plan_app_server(self, **kwargs):
        return SimpleNamespace(argv=("codex", "app-server", "--stdio"), env={}, cwd=kwargs["workspace"].path)

    def cleanup(self, execution_id):
        pass


class _Process:
    returncode = None

    def poll(self):
        return self.returncode


class _Client:
    def __init__(self, plan, events_path):
        self.events_path = events_path
        self.events_path.parent.mkdir(parents=True, exist_ok=True)
        self.events_path.write_text('{"method":"turn/completed"}\n', encoding="utf-8")
        self.process = _Process()
        self.calls = []

    def request(self, method, params, timeout=60):
        self.calls.append((method, params))
        if method == "initialize":
            return {"userAgent": "test"}
        if method == "thread/start":
            return {"thread": {"id": "thread-1"}}
        if method == "turn/start":
            return {"turn": {"id": f"turn-{len([c for c in self.calls if c[0] == 'turn/start'])}"}}
        raise AssertionError(method)

    def notify(self, method, params):
        self.calls.append((method, params))

    def wait_turn_completed(self, turn_id, timeout=300):
        return {"threadId": "thread-1", "turn": {"id": turn_id, "status": "completed"}}

    def close(self):
        self.process.returncode = 0


def test_turn_completion_does_not_terminal_until_explicit_finish(tmp_path, monkeypatch):
    monkeypatch.setattr(module, "CodexAppServerClient", _Client)
    provider = module.CodexInteractiveExecutionProvider(
        tmp_path / "evidence", launch_adapter=_Adapter()
    )
    request = ExecutionStartRequest(
        "exec-1",
        "dispatch-1",
        "digest-1",
        (
            ResolvedExecutionInput(WorkspaceV1.contract_id, Ref(RefType.WORKSPACE, "test", "workspace"), WorkspaceV1(tmp_path, "git:abc")),
            ResolvedExecutionInput(PromptFragmentV1.contract_id, Ref(RefType.ARTIFACT, "test", "prompt"), PromptFragmentV1("Responsibility", "make the change", "sha256:prompt")),
            ResolvedExecutionInput(AgentBoxProfileV1.contract_id, Ref(RefType.ARTIFACT, "test", "profile"), AgentBoxProfileV1("codex-main", "codex", "sha256:profile")),
        ),
    )

    handle = provider.start(request)
    calls = handle.client.calls
    thread_start = next(params for method, params in calls if method == "thread/start")
    assert thread_start["approvalPolicy"] == "never"
    assert thread_start["runtimeWorkspaceRoots"] == [str(tmp_path)]
    provider.wait_current_turn(handle)
    active = provider.observe(handle)
    assert active.projection.phase is Phase.ACTIVE

    terminal = provider.finish(handle)
    assert terminal.projection.phase is Phase.TERMINAL
    assert terminal.projection.outcome is Outcome.SUCCEEDED
    assert terminal.native_refs[0].native_id == "thread-1"
    assert terminal.output_refs[0].metadata["kind"] == "app-server-events"
    turn_start = next(params for method, params in calls if method == "turn/start")
    assert turn_start["approvalPolicy"] == "never"
    assert turn_start["runtimeWorkspaceRoots"] == [str(tmp_path)]
    assert turn_start["sandboxPolicy"] == {
        "type": "workspaceWrite",
        "writableRoots": [str(tmp_path)],
    }


def test_failed_file_change_cannot_be_reported_as_success():
    handle = SimpleNamespace(
        turn_ids=["turn-1"],
        turn_results={"turn-1": {"turn": {"status": "completed"}}},
        client=SimpleNamespace(file_change_statuses=("failed",)),
    )
    assert not module.CodexInteractiveExecutionProvider._turn_succeeded(handle)
