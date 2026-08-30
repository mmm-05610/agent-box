"""CLI control plane for Work Core v0.1."""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict, is_dataclass
from enum import Enum
from typing import Any, Dict, List

from cmd2 import Cmd2ArgumentParser, CommandSet, with_argparser, with_category

from ... import config
from ...work.acp import AcpProcessSessionProvider
from ...work.artifacts import FilesystemArtifactProvider
from ...work.repository import WorkNotFoundError, WorkRepository
from ...work.service import WorkService, WorkServiceError
from ...work.workflow import FixedPlanExecuteReviewWorkflow
from ...work.workspace import GitWorktreeProvider, WorkspaceError


def _jsonable(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if is_dataclass(value):
        return {key: _jsonable(item) for key, item in asdict(value).items()}
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    return value


def _approval_handler(session_id: str, options: List[Dict[str, Any]]) -> str:
    print(f"ACP permission request for session {session_id}:")
    for index, option in enumerate(options, 1):
        print(
            f"  {index}. {option.get('name') or option.get('optionId')} "
            f"({option.get('kind', 'unknown')})"
        )
    answer = input("Select option number, or Enter to deny: ").strip()
    if not answer.isdigit():
        return ""
    index = int(answer) - 1
    if index < 0 or index >= len(options):
        return ""
    return str(options[index].get("optionId") or options[index].get("option_id") or "")


def build_work_service() -> WorkService:
    repository = WorkRepository()
    workspace = GitWorktreeProvider()
    return WorkService(
        repository,
        FixedPlanExecuteReviewWorkflow(),
        workspace,
        FilesystemArtifactProvider(),
        AcpProcessSessionProvider(approval_handler=_approval_handler),
    )


work_parser = Cmd2ArgumentParser(description="Manage Work Core v0.1")
work_sub = work_parser.add_subparsers(dest="action", required=True)

create_parser = work_sub.add_parser("create", help="Create a Work and Git worktree")
create_parser.add_argument("--objective", required=True)
create_parser.add_argument("--accept", action="append", default=[])
create_parser.add_argument("--project", required=True)
create_parser.add_argument("--planner", required=True)
create_parser.add_argument("--executor", required=True)
create_parser.add_argument("--reviewer", required=True)
create_parser.add_argument("--id", dest="work_id", default=None)
create_parser.add_argument("--json", action="store_true")

list_parser = work_sub.add_parser("list", help="List Works")
list_parser.add_argument("--json", action="store_true")

show_parser = work_sub.add_parser("show", help="Show Work and correlation records")
show_parser.add_argument("work_id")
show_parser.add_argument("--json", action="store_true")

state_parser = work_sub.add_parser("state", help="Project Effective Work State")
state_parser.add_argument("work_id")
state_parser.add_argument("--json", action="store_true")

step_parser = work_sub.add_parser("step", help="Dispatch the current Role once")
step_parser.add_argument("work_id")
step_parser.add_argument("--json", action="store_true")

run_parser = work_sub.add_parser("run", help="Run until complete/waiting/failed")
run_parser.add_argument("work_id")
run_parser.add_argument("--max-steps", type=int, default=20)
run_parser.add_argument("--json", action="store_true")

replace_parser = work_sub.add_parser("replace", help="Replace a Role Profile")
replace_parser.add_argument("work_id")
replace_parser.add_argument("role", choices=["planner", "executor", "reviewer"])
replace_parser.add_argument("profile")
replace_parser.add_argument("--reason", default="profile replacement")
replace_parser.add_argument("--json", action="store_true")

stop_parser = work_sub.add_parser("stop", help="Cancel active Attempts and stop Work")
stop_parser.add_argument("work_id")
stop_parser.add_argument("--json", action="store_true")

cleanup_parser = work_sub.add_parser("cleanup", help="Safely remove completed worktree")
cleanup_parser.add_argument("work_id")
cleanup_parser.add_argument("--json", action="store_true")


def _emit(cmd, value: Any, *, as_json: bool, summary: str) -> None:
    if as_json:
        cmd.poutput(json.dumps(_jsonable(value), indent=2, ensure_ascii=False))
    else:
        cmd.poutput(summary)


@with_argparser(work_parser)
@with_category("Work Core")
def do_work(self, args: argparse.Namespace) -> None:
    """Create, run, inspect, replace and clean up provider-neutral Work."""
    service = build_work_service()
    try:
        if args.action == "create":
            work = service.create_work(
                work_id=args.work_id,
                objective=args.objective,
                acceptance_criteria=args.accept,
                project_path=args.project,
                role_profiles={
                    "planner": args.planner,
                    "executor": args.executor,
                    "reviewer": args.reviewer,
                },
            )
            _emit(
                self._cmd,
                work,
                as_json=args.json,
                summary=f"created Work {work.id} at {work.workspace_ref['path']}",
            )
            return
        if args.action == "list":
            works = service.repository.list()
            if args.json:
                _emit(self._cmd, works, as_json=True, summary="")
            elif not works:
                self._cmd.poutput("(no Works)")
            else:
                for work in works:
                    self._cmd.poutput(
                        f"{work.id}  {work.status.value:<9}  "
                        f"{work.phase.value:<8}  {work.objective}"
                    )
            return
        if args.action == "show":
            work = service.repository.get(args.work_id)
            detail = {
                "work": work,
                "attempts": service.repository.list_attempts(work.id),
                "decisions": service.repository.list_decisions(work.id),
                "handoffs": service.repository.list_handoffs(work.id),
                "artifacts": service.repository.list_artifacts(work.id),
            }
            _emit(
                self._cmd,
                detail,
                as_json=args.json,
                summary=(
                    f"{work.id}: {work.status.value}/{work.phase.value} "
                    f"attempts={len(detail['attempts'])} objective={work.objective}"
                ),
            )
            return
        if args.action == "state":
            work = service.repository.get(args.work_id)
            state = service.state.project(work)
            role = (
                "completed-work"
                if work.phase.value == "complete"
                else service.workflow.role_for_phase(work.phase)
            )
            _emit(
                self._cmd,
                state,
                as_json=args.json,
                summary=service.state.render_for_role(
                    state,
                    role,
                ),
            )
            return
        if args.action == "step":
            attempt = service.dispatch_next(args.work_id)
            _emit(
                self._cmd,
                attempt,
                as_json=args.json,
                summary=(
                    f"{attempt.id}: {attempt.role_key} -> "
                    f"{attempt.outcome or attempt.status.value}"
                ),
            )
            return
        if args.action == "run":
            work = service.run(args.work_id, max_steps=args.max_steps)
            _emit(
                self._cmd,
                work,
                as_json=args.json,
                summary=f"{work.id}: {work.status.value}/{work.phase.value}",
            )
            return
        if args.action == "replace":
            work = service.replace_profile(
                args.work_id,
                args.role,
                args.profile,
                reason=args.reason,
            )
            binding = work.role_bindings[args.role]
            _emit(
                self._cmd,
                work,
                as_json=args.json,
                summary=(
                    f"{work.id}: {args.role} -> {binding.profile_ref} "
                    f"(binding revision {binding.revision})"
                ),
            )
            return
        if args.action == "stop":
            work = service.stop(args.work_id)
            _emit(
                self._cmd,
                work,
                as_json=args.json,
                summary=f"{work.id}: stopped",
            )
            return
        if args.action == "cleanup":
            result = service.cleanup(args.work_id)
            _emit(
                self._cmd,
                result,
                as_json=args.json,
                summary=(
                    "worktree removed"
                    if result.get("removed")
                    else f"cleanup pending: {result.get('reason')}"
                ),
            )
            return
    except (WorkServiceError, WorkNotFoundError, WorkspaceError, ValueError) as exc:
        self._cmd.perror(f"{config.DISPLAY_NAME}: {exc}")


class WorkCommands(CommandSet):
    """Independent command set so legacy CoreCommands remains unchanged."""

    do_work = do_work
