"""Opt-in Phase 1 Work Core CLI; deliberately not wired into legacy cmd2 CLI."""
from __future__ import annotations

import argparse
from agent_box import config
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import selectors
import signal
import subprocess
import time
from uuid import uuid4

from .models import Ref, RefType
from .projection import ExecutionProjection, Freshness, Phase
from .providers.codex import CodexExecutionProvider
from .providers.codex_launch import CodexLaunchFacade, CodexLaunchRequest
from .registry import ExtensionRegistry
from .repository import CoreRepository, RefRelation
from .services import ExecutionService, WorkService


def _registry() -> ExtensionRegistry:
    registry = ExtensionRegistry()
    registry.register_execution_provider(CodexExecutionProvider())
    return registry


def _stop_process_group(process) -> None:
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait(timeout=5)


def _capture(provider: CodexExecutionProvider, process, execution_id: str, workspace: Path, service: ExecutionService, *, timeout_seconds: int) -> None:
    lines: list[str] = []
    native_refs = [Ref(RefType.RUN, "codex-cli", str(process.process.pid))]
    service.apply_observation(
        execution_id,
        ExecutionProjection(Phase.UNKNOWN, None, None, Freshness.STALE, datetime.now(timezone.utc)),
        native_refs=native_refs,
    )
    deadline = time.monotonic() + timeout_seconds
    try:
        offset = 0
        def read_new_lines() -> None:
            nonlocal offset
            if not process.diagnostics_path.exists():
                return
            with process.diagnostics_path.open("r", encoding="utf-8", errors="replace") as log:
                log.seek(offset)
                while True:
                    beginning = log.tell()
                    line = log.readline()
                    if not line:
                        break
                    if not line.endswith("\n"):
                        log.seek(beginning)
                        break
                    offset = log.tell()
                    lines.append(line)
                    try:
                        kind = json.loads(line).get("type")
                    except json.JSONDecodeError:
                        continue
                    if kind in {"thread.started", "turn.started", "turn.completed", "turn.failed"}:
                        observation = provider.parse_stream(lines)
                        service.apply_observation(execution_id, observation.projection, native_refs=[*native_refs, *observation.refs])
        while True:
            if process.process.poll() is not None:
                read_new_lines()
                break
            read_new_lines()
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                _stop_process_group(process.process)
                read_new_lines()
                service.apply_observation(execution_id, ExecutionProjection(Phase.UNKNOWN, None, None, Freshness.UNREACHABLE, datetime.now(timezone.utc)), native_refs=native_refs)
                raise TimeoutError(f"Codex emitted no terminal result within {timeout_seconds}s")
            time.sleep(min(remaining, 0.2))
        returncode = process.process.wait(timeout=5)
    except KeyboardInterrupt:
        # The local client was interrupted; native runtime truth is unknown.
        _stop_process_group(process.process)
        service.apply_observation(
            execution_id,
            ExecutionProjection(Phase.UNKNOWN, None, None, Freshness.UNREACHABLE, datetime.now(timezone.utc)),
            native_refs=native_refs,
        )
        raise
    observation = provider.parse_stream(lines, returncode=returncode)
    service.apply_observation(
        execution_id,
        observation.projection,
        native_refs=[*native_refs, *observation.refs],
        output_refs=[
            Ref(RefType.WORKSPACE, "workspace", str(workspace.resolve())),
            Ref(RefType.ARTIFACT, "codex-cli", str(process.diagnostics_path), uri=process.diagnostics_path.as_uri(), metadata={"kind": "jsonl-diagnostic"}),
        ],
    )


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Opt-in Production Minimal Work Core Phase 1 CLI")
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create-work"); create.add_argument("objective")
    complete = commands.add_parser("complete-work"); complete.add_argument("work_id"); complete.add_argument("reason")
    start = commands.add_parser("start-codex"); start.add_argument("work_id"); start.add_argument("--profile", required=True); start.add_argument("--workspace", type=Path, required=True); start.add_argument("--prompt", required=True); start.add_argument("--idempotency-key", required=True); start.add_argument("--timeout-seconds", type=int, default=120)
    resume = commands.add_parser("resume-codex"); resume.add_argument("execution_id"); resume.add_argument("--profile", required=True); resume.add_argument("--workspace", type=Path, required=True); resume.add_argument("--prompt", required=True); resume.add_argument("--timeout-seconds", type=int, default=120)
    args = parser.parse_args(argv)
    repo = CoreRepository(); works = WorkService(repo); executions = ExecutionService(repo)
    if args.command == "create-work":
        print(works.create_work(args.objective).id); return 0
    if args.command == "complete-work":
        print(works.complete_work(args.work_id, args.reason).id); return 0
    registry = _registry(); provider = registry.get("codex-cli")
    if args.command == "start-codex":
        execution = executions.create_execution(args.work_id, "codex-cli", provenance={"profile": args.profile})
        executions.request_dispatch(execution.id, args.idempotency_key)
        diagnostic = config.agent_box_home() / "work-core-diagnostics" / f"{execution.id}-{uuid4().hex}.log"
        process = provider.start(CodexLaunchRequest(args.profile, args.workspace, CodexLaunchFacade.start_args(args.prompt), diagnostic))
        _capture(provider, process, execution.id, args.workspace, executions, timeout_seconds=args.timeout_seconds)
        print(execution.id); return 0
    session_refs = repo.list_refs(args.execution_id, RefRelation.NATIVE)
    thread = next((ref for ref in session_refs if ref.type is RefType.SESSION and ref.provider == "codex-cli"), None)
    if thread is None:
        parser.error("execution has no Codex SessionRef")
    diagnostic = config.agent_box_home() / "work-core-diagnostics" / f"{args.execution_id}-{uuid4().hex}.log"
    process = executions.resume_execution(args.execution_id, registry, CodexLaunchRequest(args.profile, args.workspace, CodexLaunchFacade.resume_args(thread.native_id, args.prompt), diagnostic))
    _capture(provider, process, args.execution_id, args.workspace, executions, timeout_seconds=args.timeout_seconds)
    print(args.execution_id); return 0


if __name__ == "__main__":
    raise SystemExit(main())
