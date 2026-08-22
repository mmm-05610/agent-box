"""Compatibility facade over Agent-Box profile isolation for Codex CLI."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import shlex
import shutil
import tempfile
from subprocess import DEVNULL
from typing import Callable
import subprocess

from ...launch import LaunchPlan, build_launch_plan


@dataclass(frozen=True)
class CodexLaunchRequest:
    profile_name: str
    workspace: Path
    codex_args: tuple[str, ...]
    diagnostics_path: Path | None = None


@dataclass
class ManagedCodexProcess:
    process: subprocess.Popen[str]
    plan: LaunchPlan
    diagnostics_path: Path


class CodexLaunchFacade:
    """Launches an isolated Codex process without legacy session bookkeeping."""

    def __init__(
        self,
        *,
        plan_builder: Callable[..., LaunchPlan] = build_launch_plan,
        popen: Callable[..., subprocess.Popen[str]] = subprocess.Popen,
    ) -> None:
        self._plan_builder = plan_builder
        self._popen = popen

    def start(self, request: CodexLaunchRequest) -> ManagedCodexProcess:
        if not request.codex_args or request.codex_args[0] != "exec":
            raise ValueError("Codex Phase 1 launch must use non-interactive exec")
        plan = self._plan_builder(
            request.profile_name,
            extra_args=list(request.codex_args),
            cwd=request.workspace,
        )
        script = shutil.which("script")
        if script is None:
            raise RuntimeError("Codex profile capture requires util-linux script(1)")
        diagnostics = (request.diagnostics_path or Path(tempfile.mkdtemp()) / "codex.jsonl").resolve()
        diagnostics.parent.mkdir(parents=True, exist_ok=True)
        # script(1) provides the exact controlling-PTY behavior verified by
        # the real codex-main probe and writes a provider-owned raw log.
        process = self._popen(
            [script, "-qefc", shlex.join(plan.argv), str(diagnostics)],
            env=plan.env,
            cwd=plan.cwd,
            stdout=DEVNULL,
            stderr=DEVNULL,
            stdin=DEVNULL,
            text=True,
            start_new_session=True,
        )
        return ManagedCodexProcess(process, plan, diagnostics)

    @staticmethod
    def start_args(prompt: str) -> tuple[str, ...]:
        return ("exec", "--json", "--sandbox", "workspace-write", prompt)

    @staticmethod
    def resume_args(thread_id: str, prompt: str) -> tuple[str, ...]:
        return ("exec", "resume", "--json", thread_id, prompt)
