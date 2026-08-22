from pathlib import Path

import pytest

from agent_box.launch import LaunchPlan
from agent_box.work_core.providers.codex_launch import CodexLaunchFacade, CodexLaunchRequest


class CapturingPopen:
    def __init__(self):
        self.kwargs = None

    def __call__(self, *args, **kwargs):
        self.kwargs = {"args": args, **kwargs}
        return object()


def test_facade_consumes_launch_plan_without_legacy_launch(monkeypatch, tmp_path):
    seen = {}

    def plan_builder(name, *, extra_args, cwd):
        seen.update(name=name, extra_args=extra_args, cwd=cwd)
        return LaunchPlan(["bwrap", "codex", *extra_args], {"X": "1"}, tmp_path, "codex", "codex", [])

    popen = CapturingPopen()
    facade = CodexLaunchFacade(plan_builder=plan_builder, popen=popen)
    facade.start(CodexLaunchRequest("codex-main", tmp_path, facade.start_args("safe task")))
    assert seen == {"name": "codex-main", "extra_args": ["exec", "--json", "--sandbox", "workspace-write", "safe task"], "cwd": tmp_path}
    assert popen.kwargs["args"][0][0].endswith("script")
    assert popen.kwargs["stderr"] is not None
    assert popen.kwargs["stdin"] is not None
    assert "bwrap codex" in popen.kwargs["args"][0][2]


def test_facade_rejects_interactive_or_non_exec_launch(tmp_path):
    with pytest.raises(ValueError):
        CodexLaunchFacade().start(CodexLaunchRequest("codex-main", tmp_path, ("resume", "x")))


def test_resume_args_preserve_native_thread_identity():
    assert CodexLaunchFacade.resume_args("thread-1", "continue") == ("exec", "resume", "--json", "thread-1", "continue")
