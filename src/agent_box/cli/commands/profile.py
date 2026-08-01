"""ProfileCommands — loaded dynamically via ``use <profile>``.

Verb-first with resource-type sub-arguments:
``apply provider <id>``, ``remove mcp <id>``, ``hooks show``, etc.
"""
from __future__ import annotations

import argparse
import json
import sys

from cmd2 import Cmd2ArgumentParser, CommandSet, with_argparser, with_category

from ... import config
from ...resources import hooks, mcp, profile, providers, skills
from ...resources.prompts import apply_prompt
from .core import _PROFILE_DISPLAY_FIELDS, _list_entries


class ProfileCommands(CommandSet):
    """Commands available when a profile context is active."""

    def __init__(self, profile_name: str, agent_type: str):
        super().__init__()
        self.profile_name = profile_name
        self.agent_type = agent_type

    # ── options ─────────────────────────────────────────────────────────

    @with_category("Information")
    def do_options(self, _args: argparse.Namespace) -> None:
        """Show full configuration overview for the current profile."""
        try:
            info = profile.show(self.profile_name)
        except (ValueError, profile.ProfileError) as exc:
            self._cmd.perror(f"{config.DISPLAY_NAME}: {exc}")
            return

        meta = info["meta"]
        self._cmd.poutput(
            f"Profile: {self.profile_name} ({meta.get('agent_type')})"
        )
        for k in _PROFILE_DISPLAY_FIELDS:
            v = meta.get(k)
            if v:
                self._cmd.poutput(f"{k.capitalize()}: {v}")
        self._cmd.poutput(f"Config dir: {info['config_dir']}")

        # Providers
        try:
            provs = providers.list_profile_providers(
                self.profile_name, self.agent_type,
            )
        except Exception:
            provs = []
        if provs:
            self._cmd.poutput(f"\nProviders ({len(provs)}):")
            for p in provs:
                self._cmd.poutput(f"  {p['id']:20s}  {p.get('name', '')}")

        # MCP servers
        try:
            servers = mcp.list_profile_mcp_servers(self.profile_name)
        except Exception:
            servers = []
        if servers:
            self._cmd.poutput(f"\nMCP Servers ({len(servers)}):")
            for s in servers:
                self._cmd.poutput(f"  {s.get('id', '?'):20s}  {s.get('name', '')}")

        # Hooks
        try:
            h = hooks.get_hooks(self.profile_name)
        except Exception:
            h = None
        self._cmd.poutput(
            f"\nHooks: {len(h)} event(s) configured" if h else "\nHooks: (none)"
        )

    # ── apply ───────────────────────────────────────────────────────────

    apply_parser = Cmd2ArgumentParser()
    apply_parser.add_argument(
        "resource", choices=["provider", "mcp", "skill", "prompt"],
        help="What to apply",
    )
    apply_parser.add_argument("id", help="Resource id in ACS")

    _APPLY_HANDLERS = {
        "provider": (providers.apply_provider, "provider"),
        "mcp":      (mcp.apply_mcp_server, "mcp-server"),
        "skill":    (skills.apply_skill, "skill"),
        "prompt":   (apply_prompt, "prompt"),
    }

    @with_argparser(apply_parser)
    @with_category("Resource Management")
    def do_apply(self, args: argparse.Namespace) -> None:
        """Apply a resource to the current profile."""
        handler, label = self._APPLY_HANDLERS[args.resource]
        try:
            handler(self.profile_name, args.id)
        except (ValueError, profile.ProfileError) as exc:
            self._cmd.perror(f"{config.DISPLAY_NAME}: {exc}")
            return
        self._cmd.poutput(f"applied {label} {args.id!r}")

    # ── remove ──────────────────────────────────────────────────────────

    remove_parser = Cmd2ArgumentParser()
    remove_parser.add_argument(
        "resource", choices=["provider", "mcp", "skill"],
        help="What to remove",
    )
    remove_parser.add_argument("id", help="Resource id to remove")

    @with_argparser(remove_parser)
    @with_category("Resource Management")
    def do_remove(self, args: argparse.Namespace) -> None:
        """Remove a resource from the current profile."""
        resource = args.resource

        if resource == "provider":
            try:
                ok = providers.remove_profile_provider(
                    self.profile_name, self.agent_type, args.id
                )
            except (ValueError, profile.ProfileError) as exc:
                self._cmd.perror(f"{config.DISPLAY_NAME}: {exc}")
                return
            self._cmd.poutput(
                f"{'removed' if ok else 'not found'}: provider {args.id!r}"
            )
        elif resource == "mcp":
            try:
                mcp.remove_mcp_from_profile(self.profile_name, args.id)
            except (ValueError, profile.ProfileError) as exc:
                self._cmd.perror(f"{config.DISPLAY_NAME}: {exc}")
                return
            self._cmd.poutput(f"removed mcp-server {args.id!r}")
        elif resource == "skill":
            try:
                skills.remove_skill_from_profile(self.profile_name, args.id)
            except (ValueError, profile.ProfileError) as exc:
                self._cmd.perror(f"{config.DISPLAY_NAME}: {exc}")
                return
            self._cmd.poutput(f"removed skill {args.id!r}")

    # ── hooks ───────────────────────────────────────────────────────────

    hooks_parser = Cmd2ArgumentParser()
    hooks_sub = hooks_parser.add_subparsers(dest="hooks_action", required=True)

    hooks_sub.add_parser("show").add_argument("--json", action="store_true")

    hooks_sub_set = hooks_sub.add_parser("set")
    hooks_sub_set.add_argument(
        "--file", default=None,
        help="Read JSON from file instead of stdin",
    )

    hooks_sub_add = hooks_sub.add_parser("add")
    hooks_sub_add.add_argument(
        "--file", default=None,
        help="Read JSON from file instead of stdin",
    )

    hooks_sub_remove = hooks_sub.add_parser("remove")
    hooks_sub_remove.add_argument(
        "--key", default=None,
        help="Event key to remove (omit to clear all)",
    )

    @with_argparser(hooks_parser)
    @with_category("Configuration")
    def do_hooks(self, args: argparse.Namespace) -> None:
        """Manage hooks: show, set, add, remove.

        ``set`` and ``add`` accept JSON from stdin (or ``--file <path>``).
        """
        action = args.hooks_action
        if action == "show":
            self._hooks_show(args)
        elif action == "set":
            self._hooks_set(args)
        elif action == "add":
            self._hooks_add(args)
        elif action == "remove":
            self._hooks_remove(args)

    def _read_hooks_json(self, args: argparse.Namespace) -> dict:
        """Read JSON for hooks set/add from --file or stdin."""
        if args.file:
            try:
                with open(args.file, encoding="utf-8") as fh:
                    return json.load(fh)
            except OSError as exc:
                raise ValueError(f"cannot read {args.file!r}: {exc}")
            except json.JSONDecodeError as exc:
                raise ValueError(f"invalid JSON in {args.file!r}: {exc}")
        try:
            return json.loads(sys.stdin.read())
        except json.JSONDecodeError as exc:
            raise ValueError(f"invalid JSON from stdin: {exc}")

    def _hooks_show(self, args: argparse.Namespace) -> None:
        try:
            data = hooks.get_hooks(self.profile_name)
        except (ValueError, profile.ProfileError) as exc:
            self._cmd.perror(f"{config.DISPLAY_NAME}: {exc}")
            return
        if data is None:
            self._cmd.perror("(no hooks configured)")
            return
        self._cmd.poutput(json.dumps(data, indent=2, ensure_ascii=False))

    def _hooks_set(self, args: argparse.Namespace) -> None:
        try:
            data = self._read_hooks_json(args)
        except ValueError as exc:
            self._cmd.perror(f"{config.DISPLAY_NAME}: {exc}")
            return
        try:
            result = hooks.set_hooks(self.profile_name, data)
        except (ValueError, profile.ProfileError) as exc:
            self._cmd.perror(f"{config.DISPLAY_NAME}: {exc}")
            return
        self._cmd.poutput(json.dumps(result, indent=2, ensure_ascii=False))

    def _hooks_add(self, args: argparse.Namespace) -> None:
        try:
            data = self._read_hooks_json(args)
        except ValueError as exc:
            self._cmd.perror(f"{config.DISPLAY_NAME}: {exc}")
            return
        try:
            result = hooks.add_hooks(self.profile_name, data)
        except (ValueError, profile.ProfileError) as exc:
            self._cmd.perror(f"{config.DISPLAY_NAME}: {exc}")
            return
        self._cmd.poutput(json.dumps(result, indent=2, ensure_ascii=False))

    def _hooks_remove(self, args: argparse.Namespace) -> None:
        try:
            ok = hooks.remove_hooks(self.profile_name, args.key)
        except (ValueError, profile.ProfileError) as exc:
            self._cmd.perror(f"{config.DISPLAY_NAME}: {exc}")
            return
        self._cmd.poutput(f"{'removed' if ok else 'nothing to remove'}")

    # ── back ────────────────────────────────────────────────────────────

    @with_category("Session & Context")
    def do_back(self, _args: argparse.Namespace) -> None:
        """Exit this profile context, return to global scope."""
        self._cmd.poutput("back to global scope")
        self._cmd.leave_context()
