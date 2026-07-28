"""Command-line entry point for agent-box."""
from __future__ import annotations

import argparse
import json
import sys
from typing import Dict, List

from .. import __version__
from .. import claude_mds
from .. import config
from .. import hooks
from .. import launch
from .. import library
from .. import mcp
from .. import profile
from .. import providers
from .. import sessions
from .. import skills


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

    pp = sub_provider.add_parser("duplicate", help="Copy a provider under a new id")
    pp.add_argument("type", choices=library.get_agent_types())
    pp.add_argument("id")
    pp.add_argument("new_id")
    pp.set_defaults(func=cmd_provider_duplicate)

    pp = sub_provider.add_parser("presets", help="List provider presets (JSON)")
    pp.add_argument("--type", "-t", choices=library.get_agent_types(), default="claude")
    pp.set_defaults(func=cmd_provider_presets)

    pp = sub_provider.add_parser("usage", help="Query provider usage (runs usage script)")
    pp.add_argument("type", choices=library.get_agent_types())
    pp.add_argument("id")
    pp.set_defaults(func=cmd_provider_usage)

    pp = sub_provider.add_parser("usage-script", help="Save usage script for a provider (JSON from stdin)")
    pp.add_argument("type", choices=library.get_agent_types())
    pp.add_argument("id")
    pp.set_defaults(func=cmd_provider_usage_script)

    pp = sub_provider.add_parser("apply", help="Apply provider to a profile")
    pp.add_argument("profile", help="Target profile name")
    pp.add_argument("provider", help="Provider id (must match the provider's DB id)")
    pp.set_defaults(func=cmd_provider_apply)

    pp = sub_provider.add_parser("profile-list", help="List providers added to a profile (Hermes/OpenCode)")
    pp.add_argument("profile", help="Profile name")
    pp.set_defaults(func=cmd_provider_profile_list)

    pp = sub_provider.add_parser("profile-remove", help="Remove a provider from a profile (Hermes/OpenCode)")
    pp.add_argument("profile", help="Profile name")
    pp.add_argument("provider", help="Provider id to remove")
    pp.set_defaults(func=cmd_provider_profile_remove)

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

    pmcp = sub_mcp.add_parser("profile-remove", help="Remove an MCP server from a profile")
    pmcp.add_argument("profile", help="Target profile name")
    pmcp.add_argument("id", help="MCP server id")
    pmcp.set_defaults(func=cmd_mcp_profile_remove)

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

    psk = sub_skill.add_parser("profile-remove", help="Remove a skill from a profile")
    psk.add_argument("profile", help="Target profile name")
    psk.add_argument("id", help="Skill id to remove")
    psk.set_defaults(func=cmd_skill_profile_remove)

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
from .providers import cmd_provider_add, cmd_provider_apply, cmd_provider_delete, cmd_provider_duplicate, cmd_provider_edit, cmd_provider_list, cmd_provider_presets, cmd_provider_profile_list, cmd_provider_profile_remove, cmd_provider_show, cmd_provider_upsert, cmd_provider_usage, cmd_provider_usage_script
from .prompts import cmd_claude_md_add, cmd_claude_md_apply, cmd_claude_md_delete, cmd_claude_md_edit, cmd_claude_md_list, cmd_claude_md_show, cmd_claude_md_upsert
from .mcp import cmd_mcp_agents, cmd_mcp_apply, cmd_mcp_delete, cmd_mcp_list, cmd_mcp_profile_remove, cmd_mcp_show, cmd_mcp_upsert
from .skills import cmd_skill_agents, cmd_skill_apply, cmd_skill_delete, cmd_skill_list, cmd_skill_profile_remove, cmd_skill_show, cmd_skill_upsert
from .hooks import cmd_hooks_show, cmd_hooks_upsert

# --- entry point ----------------------------------------------------------

def main(argv: List[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
