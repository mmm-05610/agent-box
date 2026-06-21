"""Command-line entry point for agent-box."""
from __future__ import annotations

import argparse
import json
import sys
from typing import List, Optional

from . import config
from . import launch
from . import library
from . import profile


PROG = "agent-box"


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=PROG,
        description="Isolated config launcher for coding agents (bwrap bind mount).",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # create --------------------------------------------------------------
    p_create = sub.add_parser("create", help="Create a new profile")
    p_create.add_argument("name", help="Profile name")
    p_create.add_argument(
        "--type", "-t",
        choices=library.get_agent_types(),
        default="cc",
        help="Agent type (default: cc)",
    )
    p_create.set_defaults(func=cmd_create)

    # list ----------------------------------------------------------------
    p_list = sub.add_parser("list", help="List all profiles")
    p_list.add_argument("--json", action="store_true", help="Emit JSON")
    p_list.set_defaults(func=cmd_list)

    # launch ---------------------------------------------------------------
    p_launch = sub.add_parser("launch", help="Launch a profile (bwrap)")
    p_launch.add_argument("name", help="Profile name")
    p_launch.add_argument("extra", nargs=argparse.REMAINDER,
                          help="Extra args passed through to the agent binary")
    p_launch.set_defaults(func=cmd_launch)

    # cc / codex / hermes / opencode ---------------------------------------
    for at in library.get_agent_types():
        p = sub.add_parser(at, help=f"Shortcut for: agent-box launch <name> ({at} profile)")
        p.add_argument("name", help=f"{at} profile name to launch")
        p.add_argument("extra", nargs=argparse.REMAINDER,
                       help="Extra args passed through to the agent binary")
        p.set_defaults(func=cmd_launch)

    # show ----------------------------------------------------------------
    p_show = sub.add_parser("show", help="Show profile info")
    p_show.add_argument("name", help="Profile name")
    p_show.set_defaults(func=cmd_show)

    # edit ----------------------------------------------------------------
    p_edit = sub.add_parser("edit", help="Open profile config dir in $EDITOR")
    p_edit.add_argument("name", help="Profile name")
    p_edit.set_defaults(func=cmd_edit)

    # delete --------------------------------------------------------------
    p_delete = sub.add_parser("delete", help="Delete a profile")
    p_delete.add_argument("name", help="Profile name")
    p_delete.add_argument("--force", action="store_true", help="Skip confirmation")
    p_delete.set_defaults(func=cmd_delete)

    return parser


# --- subcommand implementations -------------------------------------------

def cmd_create(args: argparse.Namespace) -> int:
    try:
        root = profile.create(args.name, agent_type=args.type)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    print(f"created profile {args.name!r} ({args.type}) at {root}")
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    rows = profile.list_profiles()
    if args.json:
        json.dump(rows, sys.stdout, indent=2)
        sys.stdout.write("\n")
        return 0
    if not rows:
        print("(no profiles — create one with: agent-box create <name>)")
        return 0
    name_w = max((len(r["name"]) for r in rows), default=4)
    type_w = max((len(r["agent_type"]) for r in rows), default=4)
    for r in rows:
        print(f"{r['name']:<{name_w}}  {r['agent_type']:<{type_w}}")
    return 0


def cmd_launch(args: argparse.Namespace) -> int:
    try:
        config.validate_profile_name(args.name)
        launch.launch(args.name, extra_args=args.extra)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    return 1  # unreachable; launch execvpe's


def cmd_show(args: argparse.Namespace) -> int:
    try:
        info = profile.show(args.name)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    print(f"name:       {info['meta'].get('name')}")
    print(f"agent_type: {info['meta'].get('agent_type')}")
    print(f"config_dir: {info['config_dir']}")
    if info.get("data_dir"):
        print(f"data_dir:   {info['data_dir']}")
    return 0


def cmd_edit(args: argparse.Namespace) -> int:
    try:
        config.validate_profile_name(args.name)
        meta = profile.load_meta(args.name)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    agent_type = meta.get("agent_type", "cc")
    target = config.profile_agent_dir(args.name, agent_type)
    from . import edit as edit_mod
    edit_mod.open_editor(target)
    return 0


def cmd_delete(args: argparse.Namespace) -> int:
    try:
        ok = profile.delete(args.name, force=args.force)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    if ok:
        print(f"deleted profile {args.name!r}")
    return 0


# --- entry point ----------------------------------------------------------

def main(argv: Optional[List[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
