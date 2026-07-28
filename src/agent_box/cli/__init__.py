"""Command-line entry point for agent-box."""
from __future__ import annotations

import argparse
import json
import sys
from typing import Dict, List

from .. import __version__
from .. import config
from ..resources import hooks
from .. import launch
from ..core import library
from .. import profile
from .. import sessions


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

    pp = sub_provider.add_parser("apply", help="Apply provider to a profile")
    pp.add_argument("profile", help="Target profile name")
    pp.add_argument("id", help="Provider id in ACS")
    pp.set_defaults(func=cmd_provider_apply)

    pp = sub_provider.add_parser("profile-list", help="List providers added to a profile (Hermes/OpenCode)")
    pp.add_argument("profile", help="Profile name")
    pp.add_argument("--type", "-t", choices=library.get_agent_types(), required=True,
                     help="Agent type whose _providers.json to read")
    pp.add_argument("--json", action="store_true", help="Emit JSON")
    pp.set_defaults(func=cmd_provider_profile_list)

    pp = sub_provider.add_parser("profile-remove", help="Remove a provider from a profile (Hermes/OpenCode)")
    pp.add_argument("profile", help="Profile name")
    pp.add_argument("--type", "-t", choices=library.get_agent_types(), required=True,
                     help="Agent type whose _providers.json to mutate")
    pp.add_argument("id", help="Provider id to remove")
    pp.set_defaults(func=cmd_provider_profile_remove)

    # claude-md ---------------------------------------------------------
    p_md = sub.add_parser("claude-md", help="Manage Claude.md templates")
    sub_md = p_md.add_subparsers(dest="claude_md_command", required=True)

    pm = sub_md.add_parser("apply", help="Apply a Claude.md template to a profile (overwrites CLAUDE.md)")
    pm.add_argument("profile", help="Target profile name")
    pm.add_argument("id", help="Claude.md id in ACS")
    pm.set_defaults(func=cmd_claude_md_apply)

    # mcp-server -------------------------------------------------------
    p_mcp = sub.add_parser("mcp-server", help="Manage MCP server library entries")
    sub_mcp = p_mcp.add_subparsers(dest="mcp_command", required=True)

    pmcp = sub_mcp.add_parser("apply", help="Apply an MCP server to a profile's agent config")
    pmcp.add_argument("profile", help="Target profile name")
    pmcp.add_argument("id", help="MCP server id in ACS")
    pmcp.set_defaults(func=cmd_mcp_apply)

    pmcp = sub_mcp.add_parser("profile-remove", help="Remove an MCP server from a profile")
    pmcp.add_argument("profile", help="Target profile name")
    pmcp.add_argument("id", help="MCP server id")
    pmcp.set_defaults(func=cmd_mcp_profile_remove)

    # skill ------------------------------------------------------------
    p_skill = sub.add_parser("skill", help="Manage skill library entries")
    sub_skill = p_skill.add_subparsers(dest="skill_command", required=True)

    psk = sub_skill.add_parser("apply", help="Copy a skill directory into a profile's agent skills dir")
    psk.add_argument("profile", help="Target profile name")
    psk.add_argument("id", help="Skill id in ACS")
    psk.set_defaults(func=cmd_skill_apply)

    psk = sub_skill.add_parser("profile-remove", help="Remove a skill from a profile")
    psk.add_argument("profile", help="Target profile name")
    psk.add_argument("id", help="Skill id to remove")
    psk.set_defaults(func=cmd_skill_profile_remove)

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
        "--exit-by-pid", dest="exit_pid", type=int, default=None, metavar="PID",
        help="Record exit for the most recent session with this PID",
    )
    p_sessions.add_argument(
        "exit_code", type=int, nargs="?", default=None, metavar="CODE",
        help="Exit code (with --exit or --exit-by-pid)",
    )
    p_sessions.set_defaults(func=cmd_sessions)

    return parser


# --- subcommand implementations -------------------------------------------

# ── Handler imports ──────────────────────────────────────────────────────
from .profiles import cmd_create, cmd_delete, cmd_edit, cmd_launch, cmd_list, cmd_presets, cmd_sessions, cmd_show
from .providers import cmd_provider_apply, cmd_provider_profile_list, cmd_provider_profile_remove
from .mcp import cmd_mcp_apply, cmd_mcp_profile_remove
from .skills import cmd_skill_apply, cmd_skill_profile_remove
from .prompts import cmd_claude_md_apply
from .hooks import cmd_hooks_show, cmd_hooks_upsert

# --- entry point ----------------------------------------------------------

def main(argv: List[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
