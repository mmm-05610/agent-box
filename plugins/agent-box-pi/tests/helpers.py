"""Shared test fixtures for the agent-box-pi plugin."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from agent_box.resource_contracts import PromptFragmentV1, WorkspaceV1
from agent_box.work_core import ExecutionStartRequest, Ref, RefType, ResolvedExecutionInput
from agent_box_tmux import TmuxPaneObservation, TmuxPaneV1

from agent_box_pi.config import PiPluginConfig
from agent_box_pi.contract import PiContinuationV1


def make_config(tmp_path: Path, *, binary: str = "pi", version: str = "0.84.3") -> PiPluginConfig:
    return PiPluginConfig(
        binary=binary,
        model="deepseek/deepseek-v4-flash",
        thinking="high",
        version=version,
        update_policy="pinned",
        agent_dir=tmp_path / "agent",
        session_root=tmp_path / "sessions",
        evidence_root=tmp_path / "evidence",
    )


def write_session_file(root: Path, session_id: str, *, name: str | None = None) -> Path:
    """Fabricate a minimal valid native Pi session JSONL for discovery tests."""
    dirs = [root, root / f"--home-projects-{session_id}--"]
    directory = dirs[1]
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"2026-08-27T08-00-00-000Z_{session_id}.jsonl"
    lines = [
        json.dumps(
            {
                "type": "session",
                "version": 3,
                "id": session_id,
                "timestamp": "2026-08-27T08:00:00.000Z",
                "cwd": "/home/projects/repo",
            }
        ),
    ]
    if name is not None:
        lines.append(json.dumps({"type": "session_info", "name": name}))
    lines.append(
        json.dumps(
            {
                "type": "message",
                "id": "1",
                "parentId": None,
                "timestamp": "2026-08-27T08:00:01.000Z",
                "message": {
                    "role": "user",
                    "content": "Investigate the architecture.",
                    "timestamp": 1784764801000,
                },
            }
        )
    )
    lines.append(
        json.dumps(
            {
                "type": "message",
                "id": "2",
                "parentId": "1",
                "timestamp": "2026-08-27T08:00:30.000Z",
                "message": {
                    "role": "assistant",
                    "content": [{"type": "text", "text": "Findings…"}],
                    "api": "openai-completions",
                    "provider": "deepseek",
                    "model": "deepseek-v4-flash",
                    "usage": {"input": 10, "output": 4, "cacheRead": 0, "cacheWrite": 0},
                    "stopReason": "stop",
                    "timestamp": 1784764830000,
                },
            }
        )
    )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def make_pane(tmp_path: Path, pane_id: str = "%7") -> TmuxPaneV1:
    return TmuxPaneV1(
        binary=Path("/usr/bin/tmux"),
        version="tmux 3.4",
        socket_path=Path("/tmp/tmux-1000/default"),
        server_pid=42,
        session_id="$1",
        session_name="user-session",
        window_id="@2",
        pane_id=pane_id,
        pane_pid=43,
        original_path=tmp_path,
        current_path=tmp_path,
        original_command="bash",
        current_command="bash",
        attach_command=(
            "/usr/bin/tmux", "-S", "/tmp/tmux-1000/default", "attach", "-t", "user-session",
        ),
    )


def make_request(
    tmp_path: Path,
    *,
    execution_id: str = "exec-1",
    dispatch_id: str = "dispatch-1",
    pane: TmuxPaneV1 | None = None,
    fragments: tuple[PromptFragmentV1, ...] | None = None,
    continuation: PiContinuationV1 | None = None,
) -> ExecutionStartRequest:
    fragments = fragments or (
        PromptFragmentV1("Responsibility", "Research the DeepSeek integration surface.", "sha256:one"),
        PromptFragmentV1("Constraints", "Do not modify Work Core; evidence only.", "sha256:two"),
    )
    inputs: dict[str, tuple[object, ...]] = {
        WorkspaceV1.contract_id: (WorkspaceV1(tmp_path, "sha256:source"),),
        PromptFragmentV1.contract_id: fragments,
        TmuxPaneV1.contract_id: (pane or make_pane(tmp_path),),
    }
    if continuation is not None:
        inputs[PiContinuationV1.contract_id] = (continuation,)
    resolved = tuple(
        ResolvedExecutionInput(
            contract_id,
            Ref(RefType.ARTIFACT, "test-input", f"{contract_id}:{index}"),
            value,
        )
        for contract_id, values in inputs.items()
        for index, value in enumerate(values)
    )
    return ExecutionStartRequest(execution_id, dispatch_id, "inputs-digest", resolved)


class FakeConsoleController:
    """Records launches and reports a configurable pane observation."""

    def __init__(self, *, dead: bool = False, exit_status: int | None = None) -> None:
        self.launches: list[tuple[TmuxPaneV1, str, tuple[str, ...], Path]] = []
        self.cleaned: list[str] = []
        self.dead = dead
        self.exit_status = exit_status

    def launch(self, console, pane_id, argv, *, cwd):
        self.launches.append((console, pane_id, tuple(argv), Path(cwd)))

    def inspect(self, console, pane_id):
        return TmuxPaneObservation(
            True,
            pane_id,
            1234,
            self.dead,
            self.exit_status,
            "pi" if not self.dead else None,
            str(console.current_path),
            "pi",
        )

    def capture(self, console, pane_id):
        return "visible Pi transcript in tmux\n"

    def cleanup(self, console):
        self.cleaned.append(console.pane_id)


@pytest.fixture
def config(tmp_path: Path) -> PiPluginConfig:
    return make_config(tmp_path)


@pytest.fixture
def probe() -> object:
    return lambda binary: "0.84.3"
