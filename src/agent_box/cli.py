"""Command-line entry point for agent-box v2 (bwrap edition)."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import List, Optional

from . import config
from . import launch
from . import profile


PROG = "agent-box"


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=PROG,
        description=(
            "Isolated config launcher for coding agents (v2: bwrap bind mount). "
            "Phase 1: Claude Code only."
        ),
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # init-template --------------------------------------------------------
    p_init = sub.add_parser(
        "init-template",
        help="Generate ~/.agent-box/template/ from the real ~/.claude/ "
             "(strips env/permissions/mcpServers).",
    )
    p_init.add_argument(
        "--force",
        action="store_true",
        help="Overwrite an existing template",
    )
    p_init.set_defaults(func=cmd_init_template)

    # create --------------------------------------------------------------
    p_create = sub.add_parser(
        "create",
        help="Create a new CC profile (auto-inits the template if missing)",
    )
    p_create.add_argument("name", help="Profile name")
    p_create.add_argument(
        "--provider",
        required=True,
        choices=list(config.SUPPORTED_PROVIDERS),
        help="Model provider for this profile",
    )
    p_create.set_defaults(func=cmd_create)

    # list ----------------------------------------------------------------
    p_list = sub.add_parser("list", help="List all profiles")
    p_list.add_argument("--json", action="store_true", help="Emit JSON")
    p_list.set_defaults(func=cmd_list)

    # cc ------------------------------------------------------------------
    p_cc = sub.add_parser("cc", help="Launch Claude Code under a profile (bwrap)")
    p_cc.add_argument("name", help="Profile name to launch as")
    p_cc.add_argument(
        "--cwd",
        type=Path,
        default=None,
        help="Project directory to chdir into before exec",
    )
    p_cc.set_defaults(func=cmd_cc)

    # delete --------------------------------------------------------------
    p_delete = sub.add_parser("delete", help="Delete a profile")
    p_delete.add_argument("name", help="Profile name to delete")
    p_delete.add_argument(
        "--force", action="store_true", help="Skip the confirmation prompt"
    )
    p_delete.set_defaults(func=cmd_delete)

    # show ----------------------------------------------------------------
    p_show = sub.add_parser(
        "show",
        help="Show metadata + provider info for a profile",
    )
    p_show.add_argument("name", help="Profile name to show")
    p_show.set_defaults(func=cmd_show)

    # edit ----------------------------------------------------------------
    p_edit = sub.add_parser("edit", help="Open profile settings in $EDITOR")
    p_edit.add_argument("name", help="Profile name")
    p_edit.add_argument(
        "--claude-md", action="store_true",
        help="Edit CLAUDE.md instead of settings.json",
    )
    p_edit.add_argument(
        "--local", action="store_true",
        help="Edit settings.local.json instead of settings.json",
    )
    p_edit.set_defaults(func=cmd_edit)

    # config --------------------------------------------------------------
    p_config = sub.add_parser("config", help="Get/set individual config values")
    p_config.add_argument("name", help="Profile name")
    p_config.add_argument("key", nargs="?", default=None,
                          help="Config key (api-key, model, base-url, "
                               "or dot-path like env.ANTHROPIC_MODEL)")
    p_config.add_argument("value", nargs="?", default=None,
                          help="New value (omit to read)")
    p_config.set_defaults(func=cmd_config)

    # test ----------------------------------------------------------------
    p_test = sub.add_parser("test", help="Test API connectivity for a profile")
    p_test.add_argument("name", help="Profile name")
    p_test.set_defaults(func=cmd_test)

    return parser


# --- subcommand implementations -------------------------------------------

def cmd_init_template(args: argparse.Namespace) -> int:
    try:
        root = profile.init_template(force=args.force)
    except profile.ProfileError as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    print(f"initialized template at {root}")
    print(f"  next: agent-box create <name> --provider <deepseek|minimax|anthropic>")
    return 0


def cmd_create(args: argparse.Namespace) -> int:
    try:
        config.validate_profile_name(args.name)
        root = profile.create(args.name, args.provider)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    pdc = config.profile_dot_claude(args.name)
    print(f"created profile {args.name!r} ({args.provider}) at {root}")
    print(
        f"  next: edit {pdc}/settings.json to set your ANTHROPIC_AUTH_TOKEN,\n"
        f"        then run: agent-box cc {args.name}"
    )
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    rows = profile.list_profiles()
    if args.json:
        json.dump(rows, sys.stdout, indent=2)
        sys.stdout.write("\n")
        return 0
    if not rows:
        print("(no profiles — create one with: agent-box create <name> --provider deepseek)")
        return 0
    name_w = max((len(r["name"]) for r in rows), default=4)
    type_w = max((len(r["agent_type"]) for r in rows), default=9)
    for r in rows:
        print(f"{r['name']:<{name_w}}  {r['agent_type']:<{type_w}}  {r['provider']}")
    return 0


def cmd_cc(args: argparse.Namespace) -> int:
    try:
        config.validate_profile_name(args.name)
        launch.launch_cc(args.name, project_dir=args.cwd)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    # launch.launch_cc only returns on error (execvpe replaces the process).
    return 1


def cmd_delete(args: argparse.Namespace) -> int:
    try:
        config.validate_profile_name(args.name)
        ok = profile.delete(args.name, force=args.force)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    if ok:
        print(f"deleted profile {args.name!r}")
    return 0


def cmd_show(args: argparse.Namespace) -> int:
    try:
        info = profile.show(args.name)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    meta = info["meta"]
    print(f"name:       {meta.get('name')}")
    print(f"agent_type: {meta.get('agent_type')}")
    print(f"provider:   {meta.get('provider')}")
    prov = info.get("provider")
    if prov:
        print(f"label:      {prov.get('label')}")
    if "model" in info:
        print(f"model:      {info['model']}")
    if "base_url" in info:
        print(f"base_url:   {info['base_url']}")
    print(f"path:       {info['path']}")
    return 0


# --- entry point ----------------------------------------------------------

def cmd_edit(args: argparse.Namespace) -> int:
    config.validate_profile_name(args.name)
    meta_path = config.profile_meta(args.name)
    if not meta_path.exists():
        print(
            f"agent-box: {args.name!r}: profile not found. Try: agent-box list",
            file=sys.stderr,
        )
        return 2

    if args.claude_md and args.local:
        print("agent-box: --claude-md and --local are mutually exclusive", file=sys.stderr)
        return 2

    if args.claude_md:
        target = config.profile_claude_md(args.name)
    elif args.local:
        target = config.profile_settings_local_json(args.name)
    else:
        target = config.profile_settings_json(args.name)

    from . import edit as edit_mod
    edit_mod.open_editor(target)
    return 0  # unreachable


def cmd_config(args: argparse.Namespace) -> int:
    config.validate_profile_name(args.name)
    meta_path = config.profile_meta(args.name)
    if not meta_path.exists():
        print(
            f"agent-box: {args.name!r}: profile not found. Try: agent-box list",
            file=sys.stderr,
        )
        return 2

    try:
        if args.key is None:
            print(profile.pretty_config(args.name))
            return 0

        if args.value is None:
            val = profile.get_config(args.name, args.key)
            if val is None:
                print("(not set)")
            else:
                print(val)
            return 0

        changed = profile.set_config(args.name, args.key, args.value)
        if changed:
            print(f"set {args.key} = {args.value}")
        else:
            print(f"{args.key}: already set to {args.value} (no change)")
        return 0
    except profile.ProfileError as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2


def cmd_test(args: argparse.Namespace) -> int:
    config.validate_profile_name(args.name)
    meta_path = config.profile_meta(args.name)
    if not meta_path.exists():
        print(
            f"agent-box: {args.name!r}: profile not found. Try: agent-box list",
            file=sys.stderr,
        )
        return 2

    try:
        print(f"Testing {args.name!r}...")
        ok, msg = profile.test_connection(args.name)
        if ok:
            print(f"  OK  {msg}")
        else:
            print(f"  FAIL  {msg}")
        return 0 if ok else 1
    except profile.ProfileError as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2


def main(argv: Optional[List[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
