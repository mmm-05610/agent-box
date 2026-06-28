"""Command-line entry point for agent-box."""
from __future__ import annotations

import argparse
import json
import sys
from typing import Dict, List, Optional

from . import __version__
from . import claude_mds
from . import config
from . import hooks
from . import launch
from . import library
from . import mcp
from . import profile
from . import providers
from . import sessions
from . import skills


PROG = "agent-box"


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=PROG,
        description="Isolated config launcher for coding agents (bwrap bind mount).",
    )
    parser.add_argument(
        "--version", action="version",
        version=f"%(prog)s {__version__}",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # create --------------------------------------------------------------
    p_create = sub.add_parser("create", help="Create a new profile")
    p_create.add_argument("name", help="Profile name")
    p_create.add_argument(
        "--type", "-t",
        choices=library.get_agent_types(),
        default="claude",
        help="Agent type (default: cc)",
    )
    p_create.add_argument(
        "--display-name", default=None,
        help="Human-readable profile display name (stored in meta.yaml)",
    )
    p_create.add_argument(
        "--description", default=None,
        help="Free-form description of what this profile is for (stored in meta.yaml)",
    )
    p_create.add_argument(
        "--provider", default=None,
        help="Provider key (e.g. anthropic, bedrock, vertex) — record-only in v0.4 "
             "(stored in meta.yaml; no apply logic). v0.5: apply_provider.",
    )
    p_create.add_argument(
        "--claude-md", default=None,
        help="Path to a file whose contents become the new profile's CLAUDE.md "
             "(CC profiles only in v0.4). Avoids shell-quoting a multi-line body.",
    )
    p_create.add_argument(
        "--preset", default=None,
        help="Optional preset name (see: agent-box presets). Copies a preset's "
             "CLAUDE.md, hooks.json, and settings.overlay.json onto the new "
             "profile (CC only in v0.4). Overrides --claude-md if both given.",
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
    p_show.add_argument("--json", action="store_true", help="Emit JSON")
    p_show.set_defaults(func=cmd_show)

    # edit ----------------------------------------------------------------
    p_edit = sub.add_parser(
        "edit",
        help="Edit profile metadata or open config dir in $EDITOR",
        description=(
            "Without any flags, opens the profile's config directory "
            "in $EDITOR. With one or more flags, updates the profile's "
            "metadata in the profiles table (structured, fast, no editor)."
        ),
    )
    p_edit.add_argument("name", help="Profile name")
    p_edit.add_argument("--display-name", default=None,
                       help="Set the human-readable display name")
    p_edit.add_argument("--description", default=None,
                       help="Set the free-form description")
    p_edit.add_argument("--provider", default=None,
                       help="Set the provider key (record-only)")
    p_edit.add_argument("--claude-md", default=None,
                       help="Set the claude-md reference")
    p_edit.set_defaults(func=cmd_edit)

    # presets ------------------------------------------------------------
    p_presets = sub.add_parser(
        "presets", help="List available presets (optionally per agent type)"
    )
    p_presets.add_argument(
        "--type", "-t",
        choices=library.get_agent_types(),
        default=None,
        help="Restrict to one agent type (default: all types)",
    )
    p_presets.add_argument(
        "--json", action="store_true",
        help="Emit JSON (object: {agent_type: [preset_name, ...]})",
    )
    p_presets.set_defaults(func=cmd_presets)

    # delete --------------------------------------------------------------
    p_delete = sub.add_parser("delete", help="Delete a profile")
    p_delete.add_argument("name", help="Profile name")
    p_delete.add_argument("--force", action="store_true", help="Skip confirmation")
    p_delete.set_defaults(func=cmd_delete)

    # provider ---------------------------------------------------------
    p_provider = sub.add_parser("provider", help="Manage provider configurations")
    sub_provider = p_provider.add_subparsers(dest="provider_command", required=True)

    pp = sub_provider.add_parser("list", help="List providers for an agent type")
    pp.add_argument("--type", "-t", choices=library.get_agent_types(), required=True)
    pp.add_argument("--json", action="store_true", help="Emit JSON")
    pp.set_defaults(func=cmd_provider_list)

    pp = sub_provider.add_parser("show", help="Show provider details")
    pp.add_argument("type", choices=library.get_agent_types())
    pp.add_argument("id")
    pp.add_argument("--json", action="store_true", help="Emit JSON")
    pp.set_defaults(func=cmd_provider_show)

    pp = sub_provider.add_parser("add", help="Add a new provider (opens $EDITOR)")
    pp.add_argument("type", choices=library.get_agent_types())
    pp.add_argument("id")
    pp.set_defaults(func=cmd_provider_add)

    pp = sub_provider.add_parser("edit", help="Edit an existing provider")
    pp.add_argument("type", choices=library.get_agent_types())
    pp.add_argument("id")
    pp.set_defaults(func=cmd_provider_edit)

    pp = sub_provider.add_parser("upsert", help="Insert or update a provider (JSON from stdin)")
    pp.add_argument("type", choices=library.get_agent_types())
    pp.add_argument("id")
    pp.set_defaults(func=cmd_provider_upsert)

    pp = sub_provider.add_parser("delete", help="Delete a provider")
    pp.add_argument("type", choices=library.get_agent_types())
    pp.add_argument("id")
    pp.set_defaults(func=cmd_provider_delete)

    pp = sub_provider.add_parser("apply", help="Apply provider env to a profile's settings.json")
    pp.add_argument("profile", help="Target profile name")
    pp.add_argument("provider", help="Provider id (must match the provider's DB id)")
    pp.set_defaults(func=cmd_provider_apply)

    # claude-md ---------------------------------------------------------
    p_md = sub.add_parser("claude-md", help="Manage Claude.md templates")
    sub_md = p_md.add_subparsers(dest="claude_md_command", required=True)

    pm = sub_md.add_parser("list", help="List Claude.md templates")
    pm.add_argument("--type", "-t", choices=library.get_agent_types(), required=True)
    pm.add_argument("--json", action="store_true", help="Emit JSON")
    pm.set_defaults(func=cmd_claude_md_list)

    pm = sub_md.add_parser("show", help="Show Claude.md template details")
    pm.add_argument("type", choices=library.get_agent_types())
    pm.add_argument("id")
    pm.add_argument("--json", action="store_true", help="Emit JSON")
    pm.set_defaults(func=cmd_claude_md_show)

    pm = sub_md.add_parser("add", help="Add a new Claude.md template (opens $EDITOR)")
    pm.add_argument("type", choices=library.get_agent_types())
    pm.add_argument("id")
    pm.set_defaults(func=cmd_claude_md_add)

    pm = sub_md.add_parser("edit", help="Edit an existing Claude.md template")
    pm.add_argument("type", choices=library.get_agent_types())
    pm.add_argument("id")
    pm.set_defaults(func=cmd_claude_md_edit)

    pm = sub_md.add_parser("upsert", help="Insert or update a Claude.md template (content from stdin)")
    pm.add_argument("type", choices=library.get_agent_types())
    pm.add_argument("id")
    pm.add_argument("--name", default=None)
    pm.add_argument("--description", default=None)
    pm.set_defaults(func=cmd_claude_md_upsert)

    pm = sub_md.add_parser("delete", help="Delete a Claude.md template")
    pm.add_argument("type", choices=library.get_agent_types())
    pm.add_argument("id")
    pm.set_defaults(func=cmd_claude_md_delete)

    pm = sub_md.add_parser("apply", help="Apply a Claude.md template to a profile (overwrites CLAUDE.md)")
    pm.add_argument("profile", help="Target profile name")
    pm.add_argument("id", help="Claude.md id to apply")
    pm.set_defaults(func=cmd_claude_md_apply)

    # mcp-server -------------------------------------------------------
    p_mcp = sub.add_parser("mcp-server", help="Manage MCP server library entries")
    sub_mcp = p_mcp.add_subparsers(dest="mcp_command", required=True)

    pmcp = sub_mcp.add_parser("list", help="List MCP servers")
    pmcp.add_argument("--type", "-t", choices=library.get_agent_types(), default=None,
                      help="Filter by agent_type (shows only servers enabled for that type)")
    pmcp.add_argument("--json", action="store_true", help="Emit JSON")
    pmcp.set_defaults(func=cmd_mcp_list)

    pmcp = sub_mcp.add_parser("show", help="Show MCP server details")
    pmcp.add_argument("id", help="MCP server id")
    pmcp.add_argument("--json", action="store_true", help="Emit JSON")
    pmcp.set_defaults(func=cmd_mcp_show)

    pmcp = sub_mcp.add_parser("upsert", help="Insert or update an MCP server (JSON from stdin)")
    pmcp.add_argument("id", help="MCP server id")
    pmcp.add_argument("--name", default=None, help="Display name (defaults to id)")
    pmcp.set_defaults(func=cmd_mcp_upsert)

    pmcp = sub_mcp.add_parser("delete", help="Delete an MCP server")
    pmcp.add_argument("id", help="MCP server id")
    pmcp.add_argument("--force", action="store_true", help="Skip confirmation")
    pmcp.set_defaults(func=cmd_mcp_delete)

    pmcp = sub_mcp.add_parser("apply", help="Apply an MCP server to a profile's agent config")
    pmcp.add_argument("profile", help="Target profile name")
    pmcp.add_argument("id", help="MCP server id")
    pmcp.set_defaults(func=cmd_mcp_apply)

    pmcp = sub_mcp.add_parser("agents", help="Enable/disable an MCP server for an agent type")
    pmcp.add_argument("id", help="MCP server id")
    pmcp.add_argument("--enable", dest="agent_type", default=None,
                      help="Agent type to enable (e.g. claude, codex, hermes, opencode)")
    pmcp.add_argument("--disable", dest="disable_type", default=None,
                      help="Agent type to disable")
    pmcp.set_defaults(func=cmd_mcp_agents)

    # skill ------------------------------------------------------------
    p_skill = sub.add_parser("skill", help="Manage skill library entries")
    sub_skill = p_skill.add_subparsers(dest="skill_command", required=True)

    psk = sub_skill.add_parser("list", help="List skills")
    psk.add_argument("--type", "-t", choices=library.get_agent_types(), default=None,
                     help="Filter by agent_type")
    psk.add_argument("--json", action="store_true", help="Emit JSON")
    psk.set_defaults(func=cmd_skill_list)

    psk = sub_skill.add_parser("show", help="Show skill details")
    psk.add_argument("id", help="Skill id")
    psk.add_argument("--json", action="store_true", help="Emit JSON")
    psk.set_defaults(func=cmd_skill_show)

    psk = sub_skill.add_parser("upsert", help="Insert or update a skill")
    psk.add_argument("id", help="Skill id")
    psk.add_argument("--name", default=None, help="Display name (defaults to id)")
    psk.add_argument("--description", default=None, help="Skill description")
    psk.add_argument("--directory", default=None, help="Absolute path to the skill's source directory")
    psk.add_argument("--repo-owner", default=None, help="GitHub repo owner (optional)")
    psk.add_argument("--repo-name", default=None, help="GitHub repo name (optional)")
    psk.add_argument("--repo-branch", default=None, help="GitHub repo branch (default: main)")
    psk.add_argument("--readme-url", default=None, help="README URL (optional)")
    psk.set_defaults(func=cmd_skill_upsert)

    psk = sub_skill.add_parser("delete", help="Delete a skill")
    psk.add_argument("id", help="Skill id")
    psk.add_argument("--force", action="store_true", help="Skip confirmation")
    psk.set_defaults(func=cmd_skill_delete)

    psk = sub_skill.add_parser("apply", help="Copy a skill directory into a profile's agent skills dir")
    psk.add_argument("profile", help="Target profile name")
    psk.add_argument("id", help="Skill id")
    psk.set_defaults(func=cmd_skill_apply)

    psk = sub_skill.add_parser("agents", help="Enable/disable a skill for an agent type")
    psk.add_argument("id", help="Skill id")
    psk.add_argument("--enable", dest="agent_type", default=None,
                     help="Agent type to enable")
    psk.add_argument("--disable", dest="disable_type", default=None,
                     help="Agent type to disable")
    psk.set_defaults(func=cmd_skill_agents)

    # hooks ------------------------------------------------------------
    p_hooks = sub.add_parser("hooks", help="Manage Claude Code hooks.json (file-level)")
    sub_hooks = p_hooks.add_subparsers(dest="hooks_command", required=True)

    ph = sub_hooks.add_parser("show", help="Show a profile's hooks.json")
    ph.add_argument("profile", help="Target profile name")
    ph.add_argument("--json", action="store_true", help="Emit JSON")
    ph.set_defaults(func=cmd_hooks_show)

    ph = sub_hooks.add_parser("upsert", help="Overwrite a profile's hooks.json (JSON from stdin)")
    ph.add_argument("profile", help="Target profile name")
    ph.set_defaults(func=cmd_hooks_upsert)

    # sessions ----------------------------------------------------------
    p_sessions = sub.add_parser(
        "sessions",
        help="List/manage recorded launch sessions",
    )
    p_sessions.add_argument(
        "--json", action="store_true",
        help="Emit sessions as JSON",
    )
    p_sessions.add_argument(
        "--active", action="store_true",
        help="Only show currently-running sessions (no exited_at/exit_code)",
    )
    p_sessions.add_argument(
        "--cleanup", action="store_true",
        help="Mark zombie sessions as exited and print the cleanup count",
    )
    p_sessions.add_argument(
        "--exit", dest="exit_id", type=int, default=None, metavar="ID",
        help="Record exit for session ID (used by the GUI watcher)",
    )
    p_sessions.add_argument(
        "exit_code", type=int, nargs="?", default=None, metavar="CODE",
        help="Exit code (with --exit)",
    )
    p_sessions.set_defaults(func=cmd_sessions)

    return parser


# --- subcommand implementations -------------------------------------------

def cmd_create(args: argparse.Namespace) -> int:
    claude_md_body: Optional[str] = None
    if args.claude_md is not None:
        try:
            with open(args.claude_md, "r", encoding="utf-8") as fh:
                claude_md_body = fh.read()
        except OSError as exc:
            print(
                f"agent-box: cannot read --claude-md {args.claude_md!r}: {exc}",
                file=sys.stderr,
            )
            return 2
    try:
        root = profile.create(
            args.name,
            agent_type=args.type,
            display_name=args.display_name,
            description=args.description,
            provider=args.provider,
            claude_md=claude_md_body,
            preset=args.preset,
        )
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
    if args.json:
        import json
        json.dump(info, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    print(f"name:       {info['meta'].get('name')}")
    print(f"agent_type: {info['meta'].get('agent_type')}")
    print(f"config_dir: {info['config_dir']}")
    if info.get("data_dir"):
        print(f"data_dir:   {info['data_dir']}")
    # v0.4: surface optional meta fields in plain `show` output.
    for k in ("display_name", "description", "provider", "preset"):
        v = info["meta"].get(k)
        if v:
            print(f"{k + ':':<11} {v}")
    return 0


def cmd_presets(args: argparse.Namespace) -> int:
    if args.json:
        out: Dict[str, List[str]] = {}
        types = [args.type] if args.type else library.get_agent_types()
        for at in types:
            out[at] = library.list_presets(at)
        json.dump(out, sys.stdout, indent=2)
        sys.stdout.write("\n")
        return 0
    if args.type is not None:
        rows = library.list_presets(args.type)
        if not rows:
            print(f"(no presets for type {args.type!r})")
            return 0
        for name in rows:
            print(name)
        return 0
    # No type filter: list per type, grouped.
    any_out = False
    for at in library.get_agent_types():
        rows = library.list_presets(at)
        if not rows:
            continue
        any_out = True
        print(f"{at}:")
        for name in rows:
            print(f"  {name}")
    if not any_out:
        print("(no presets shipped)")
    return 0


def cmd_edit(args: argparse.Namespace) -> int:
    # If any structured flags are set, do a DB-level meta update.
    if any(getattr(args, f, None) is not None
           for f in ("display_name", "description", "provider", "claude_md")):
        try:
            result = profile.update_meta(
                args.name,
                display_name=args.display_name,
                description=args.description,
                provider=args.provider,
                claude_md=args.claude_md,
            )
        except (ValueError, profile.ProfileError) as exc:
            print(f"agent-box: {exc}", file=sys.stderr)
            return 2
        print(f"updated profile {args.name!r}")
        if args.display_name is not None:
            print(f"  display_name: {result['display_name']}")
        if args.description is not None:
            print(f"  description: {result['description']}")
        if args.provider is not None:
            print(f"  provider: {result['provider']}")
        if args.claude_md is not None:
            print(f"  claude_md: {result['claude_md']}")
        return 0

    # No flags → open config dir in $EDITOR (legacy behaviour).
    try:
        config.validate_profile_name(args.name)
        meta = profile.load_meta(args.name)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    agent_type = meta.get("agent_type", "claude")
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


def cmd_sessions(args: argparse.Namespace) -> int:
    # --exit ID CODE: record exit and return.
    if args.exit_id is not None:
        code = args.exit_code
        if code is None:
            print("agent-box: --exit requires an exit code", file=sys.stderr)
            return 2
        sessions.record_exit(args.exit_id, code)
        print("ok")
        return 0

    # --cleanup: print count to stdout (pure integer) and return.
    if args.cleanup:
        n = sessions.cleanup_stale_sessions()
        print(n)
        return 0

    # Otherwise: list sessions.
    rows = sessions.fetch_sessions(active_only=args.active)

    if args.json:
        json.dump(rows, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0

    if not rows:
        print("(no sessions)")
        return 0

    # Table layout: id, profile, agent_type, mode, pid, launched_at, [exited_at, exit_code]
    id_w = max(len(str(r["id"])) for r in rows)
    name_w = max(len(r["profile"]) for r in rows)
    type_w = max(len(r["agent_type"]) for r in rows)
    mode_w = max(len(r.get("mode") or "") for r in rows)
    pid_w = max(len(str(r.get("pid") or "")) for r in rows)
    launched_w = max(len(r.get("launched_at") or "") for r in rows)

    header = (
        f"{'ID':<{id_w}}  {'PROFILE':<{name_w}}  {'AGENT':<{type_w}}  "
        f"{'MODE':<{mode_w}}  {'PID':<{pid_w}}  {'LAUNCHED':<{launched_w}}"
    )
    print(header)
    for r in rows:
        line = (
            f"{r['id']:<{id_w}}  {r['profile']:<{name_w}}  "
            f"{r['agent_type']:<{type_w}}  "
            f"{(r.get('mode') or ''):<{mode_w}}  "
            f"{str(r.get('pid') or ''):<{pid_w}}  "
            f"{(r.get('launched_at') or ''):<{launched_w}}"
        )
        if not args.active and r.get("exited_at"):
            line += f"  {r['exited_at']}  exit={r.get('exit_code')}"
        print(line)
    return 0


# --- provider subcommands --------------------------------------------------

def cmd_provider_list(args: argparse.Namespace) -> int:
    try:
        rows = providers.list_providers(args.type)
    except Exception as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    if args.json:
        json.dump(rows, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    if not rows:
        print(f"(no providers for {args.type!r})")
        return 0
    id_w = max((len(r["id"]) for r in rows), default=2)
    name_w = max((len(r["name"]) for r in rows), default=4)
    for r in rows:
        marker = "*" if r["is_current"] else " "
        fq = "F" if r["in_failover_queue"] else " "
        cat = f"  [{r['category']}]" if r["category"] else ""
        print(f"{marker}{fq} {r['id']:<{id_w}}  {r['name']:<{name_w}}{cat}")
    return 0


def cmd_provider_show(args: argparse.Namespace) -> int:
    try:
        row = providers.get_provider(args.type, args.id)
    except Exception as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    if row is None:
        print(f"agent-box: provider {args.id!r} for {args.type!r} not found", file=sys.stderr)
        return 2
    if args.json:
        json.dump(row, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    print(f"id:          {row['id']}")
    print(f"app_type:    {row['app_type']}")
    print(f"name:        {row['name']}")
    if row["website_url"]:
        print(f"website:     {row['website_url']}")
    if row["category"]:
        print(f"category:    {row['category']}")
    if row["endpoints"]:
        print("endpoints:")
        for ep in row["endpoints"]:
            print(f"  - {ep['url']}")
    print("settings:")
    print(json.dumps(row["settings"], indent=2, ensure_ascii=False))
    return 0


def cmd_provider_add(args: argparse.Namespace) -> int:
    try:
        providers.add_provider(args.type, args.id)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    print(f"added provider {args.id!r} for {args.type!r}")
    return 0


def cmd_provider_edit(args: argparse.Namespace) -> int:
    try:
        providers.edit_provider(args.type, args.id)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    print(f"updated provider {args.id!r}")
    return 0


def cmd_provider_delete(args: argparse.Namespace) -> int:
    try:
        providers.delete_provider(args.type, args.id)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    print(f"deleted provider {args.id!r}")
    return 0


def cmd_provider_apply(args: argparse.Namespace) -> int:
    try:
        providers.apply_provider(args.profile, args.provider)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    print(f"applied provider {args.provider!r} to profile {args.profile!r}")
    return 0


def cmd_provider_upsert(args: argparse.Namespace) -> int:
    try:
        stdin_content = sys.stdin.read()
        result = providers.upsert_provider(args.type, args.id, stdin_content)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    json.dump(result, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


# --- claude-md subcommands ------------------------------------------------

def cmd_claude_md_list(args: argparse.Namespace) -> int:
    try:
        rows = claude_mds.list_claude_mds(args.type)
    except Exception as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    if args.json:
        json.dump(rows, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    if not rows:
        print(f"(no claude-md templates for {args.type!r})")
        return 0
    id_w = max((len(r["id"]) for r in rows), default=2)
    name_w = max((len(r["name"]) for r in rows), default=4)
    for r in rows:
        marker = "*" if r["enabled"] else " "
        print(f"{marker} {r['id']:<{id_w}}  {r['name']:<{name_w}}")
    return 0


def cmd_claude_md_show(args: argparse.Namespace) -> int:
    try:
        row = claude_mds.get_claude_md(args.type, args.id)
    except Exception as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    if row is None:
        print(f"agent-box: claude-md {args.id!r} for {args.type!r} not found", file=sys.stderr)
        return 2
    if args.json:
        json.dump(row, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    print(f"id:          {row['id']}")
    print(f"app_type:    {row['app_type']}")
    print(f"name:        {row['name']}")
    if row["description"]:
        print(f"description: {row['description']}")
    print("---")
    print(row["content"] or "")
    return 0


def cmd_claude_md_add(args: argparse.Namespace) -> int:
    try:
        claude_mds.add_claude_md(args.type, args.id)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    print(f"added claude-md {args.id!r} for {args.type!r}")
    return 0


def cmd_claude_md_edit(args: argparse.Namespace) -> int:
    try:
        claude_mds.edit_claude_md(args.type, args.id)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    print(f"updated claude-md {args.id!r}")
    return 0


def cmd_claude_md_upsert(args: argparse.Namespace) -> int:
    try:
        stdin_content = sys.stdin.read()
        result = claude_mds.upsert_claude_md(
            args.type, args.id, stdin_content,
            name=args.name, description=args.description,
        )
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    json.dump(result, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


def cmd_claude_md_delete(args: argparse.Namespace) -> int:
    try:
        claude_mds.delete_claude_md(args.type, args.id)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    print(f"deleted claude-md {args.id!r}")
    return 0


def cmd_claude_md_apply(args: argparse.Namespace) -> int:
    try:
        claude_mds.apply_claude_md(args.profile, args.id)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    print(f"applied claude-md {args.id!r} to profile {args.profile!r}")
    return 0


# --- mcp-server subcommands -----------------------------------------------

def cmd_mcp_list(args: argparse.Namespace) -> int:
    try:
        rows = mcp.list_mcp_servers(agent_type=args.type)
    except Exception as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    if args.json:
        json.dump(rows, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    if not rows:
        msg = f"(no mcp-servers{' for type ' + args.type if args.type else ''})"
        print(msg)
        return 0
    id_w = max((len(r["id"]) for r in rows), default=2)
    name_w = max((len(r["name"]) for r in rows), default=4)
    for r in rows:
        print(f"{r['id']:<{id_w}}  {r['name']:<{name_w}}")
    return 0


def cmd_mcp_show(args: argparse.Namespace) -> int:
    try:
        row = mcp.get_mcp_server(args.id)
    except Exception as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    if row is None:
        print(f"agent-box: mcp-server {args.id!r} not found", file=sys.stderr)
        return 2
    if args.json:
        json.dump(row, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    print(f"id:          {row['id']}")
    print(f"name:        {row['name']}")
    if row.get("description"):
        print(f"description: {row['description']}")
    if row.get("homepage"):
        print(f"homepage:    {row['homepage']}")
    if row.get("docs"):
        print(f"docs:        {row['docs']}")
    if row.get("tags"):
        print(f"tags:        {', '.join(row['tags'])}")
    if row.get("agent_types"):
        print(f"agent_types: {', '.join(row['agent_types'])}")
    print("server_config:")
    print(json.dumps(row.get("server_config_parsed") or {}, indent=2, ensure_ascii=False))
    return 0


def cmd_mcp_upsert(args: argparse.Namespace) -> int:
    try:
        stdin_content = sys.stdin.read()
        # Allow the user to override the name from --name. If they passed
        # --name, inject it into the JSON payload before validation.
        if args.name:
            try:
                payload = json.loads(stdin_content) if stdin_content.strip() else {}
            except json.JSONDecodeError:
                payload = {}
            if not isinstance(payload, dict):
                payload = {}
            payload["name"] = args.name
            stdin_content = json.dumps(payload, ensure_ascii=False)
        result = mcp.upsert_mcp_server(args.id, stdin_content)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    json.dump(result, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


def cmd_mcp_delete(args: argparse.Namespace) -> int:
    if not args.force:
        confirm = input(f"Delete mcp-server {args.id!r}? [y/N] ").strip().lower()
        if confirm not in ("y", "yes"):
            print("aborted.", file=sys.stderr)
            return 0
    try:
        deleted = mcp.delete_mcp_server(args.id)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    if not deleted:
        print(f"agent-box: mcp-server {args.id!r} not found", file=sys.stderr)
        return 2
    print(f"deleted mcp-server {args.id!r}")
    return 0


def cmd_mcp_apply(args: argparse.Namespace) -> int:
    try:
        mcp.apply_mcp_server(args.profile, args.id)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    print(f"applied mcp-server {args.id!r} to profile {args.profile!r}")
    return 0


def cmd_mcp_agents(args: argparse.Namespace) -> int:
    if not args.agent_type and not args.disable_type:
        print("agent-box: --enable or --disable is required", file=sys.stderr)
        return 2
    if args.agent_type and args.disable_type:
        print("agent-box: --enable and --disable are mutually exclusive", file=sys.stderr)
        return 2
    target = args.agent_type or args.disable_type
    enabled = bool(args.agent_type)
    try:
        mcp.set_mcp_agent(args.id, target, enabled)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    action = "enabled" if enabled else "disabled"
    print(f"{action} mcp-server {args.id!r} for {target!r}")
    return 0


# --- skill subcommands ----------------------------------------------------

def cmd_skill_list(args: argparse.Namespace) -> int:
    try:
        rows = skills.list_skills(agent_type=args.type)
    except Exception as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    if args.json:
        json.dump(rows, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    if not rows:
        msg = f"(no skills{' for type ' + args.type if args.type else ''})"
        print(msg)
        return 0
    id_w = max((len(r["id"]) for r in rows), default=2)
    name_w = max((len(r["name"]) for r in rows), default=4)
    for r in rows:
        print(f"{r['id']:<{id_w}}  {r['name']:<{name_w}}")
    return 0


def cmd_skill_show(args: argparse.Namespace) -> int:
    try:
        row = skills.get_skill(args.id)
    except Exception as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    if row is None:
        print(f"agent-box: skill {args.id!r} not found", file=sys.stderr)
        return 2
    if args.json:
        json.dump(row, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    print(f"id:          {row['id']}")
    print(f"name:        {row['name']}")
    if row.get("description"):
        print(f"description: {row['description']}")
    if row.get("directory"):
        print(f"directory:   {row['directory']}")
    if row.get("repo_owner") or row.get("repo_name"):
        repo = f"{row.get('repo_owner') or ''}/{row.get('repo_name') or ''}"
        branch = f"@{row.get('repo_branch') or 'main'}"
        print(f"repo:        {repo}{branch}")
    if row.get("readme_url"):
        print(f"readme_url:  {row['readme_url']}")
    if row.get("agent_types"):
        print(f"agent_types: {', '.join(row['agent_types'])}")
    if row.get("content_hash"):
        print(f"hash:        {row['content_hash'][:16]}…")
    return 0


def cmd_skill_upsert(args: argparse.Namespace) -> int:
    try:
        result = skills.upsert_skill(
            args.id,
            name=args.name or "",
            description=args.description or "",
            directory=args.directory or "",
            repo_owner=args.repo_owner or "",
            repo_name=args.repo_name or "",
            repo_branch=args.repo_branch or "main",
            readme_url=args.readme_url or "",
        )
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    json.dump(result, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


def cmd_skill_delete(args: argparse.Namespace) -> int:
    if not args.force:
        confirm = input(f"Delete skill {args.id!r}? [y/N] ").strip().lower()
        if confirm not in ("y", "yes"):
            print("aborted.", file=sys.stderr)
            return 0
    try:
        deleted = skills.delete_skill(args.id)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    if not deleted:
        print(f"agent-box: skill {args.id!r} not found", file=sys.stderr)
        return 2
    print(f"deleted skill {args.id!r}")
    return 0


def cmd_skill_apply(args: argparse.Namespace) -> int:
    try:
        skills.apply_skill(args.profile, args.id)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    print(f"applied skill {args.id!r} to profile {args.profile!r}")
    return 0


def cmd_skill_agents(args: argparse.Namespace) -> int:
    if not args.agent_type and not args.disable_type:
        print("agent-box: --enable or --disable is required", file=sys.stderr)
        return 2
    if args.agent_type and args.disable_type:
        print("agent-box: --enable and --disable are mutually exclusive", file=sys.stderr)
        return 2
    target = args.agent_type or args.disable_type
    enabled = bool(args.agent_type)
    try:
        skills.set_skill_agent(args.id, target, enabled)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    action = "enabled" if enabled else "disabled"
    print(f"{action} skill {args.id!r} for {target!r}")
    return 0


# --- hooks subcommands ----------------------------------------------------

def cmd_hooks_show(args: argparse.Namespace) -> int:
    try:
        data = hooks.get_hooks(args.profile)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    if data is None:
        print(f"agent-box: profile {args.profile!r} has no hooks.json", file=sys.stderr)
        return 2
    if args.json:
        json.dump(data, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    json.dump(data, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


def cmd_hooks_upsert(args: argparse.Namespace) -> int:
    try:
        stdin_content = sys.stdin.read()
        result = hooks.upsert_hooks(args.profile, stdin_content)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    json.dump(result, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


# --- entry point ----------------------------------------------------------

def main(argv: Optional[List[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
