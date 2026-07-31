"""CoreCommands — global context, always available.

Verb-first dispatch with resource-type sub-arguments:
``list profiles``, ``list sessions``, ``list presets``.
"""
from __future__ import annotations

import argparse
import json
from typing import TYPE_CHECKING

from cmd2 import Cmd2ArgumentParser, CommandSet, with_argparser, with_category

from ... import config, launch
from ...core import library
from ...resources import profile, sessions

if TYPE_CHECKING:
    from ..shell import AgentBoxShell

# ── list ────────────────────────────────────────────────────────────────────

list_parser = Cmd2ArgumentParser()
_LIST_RESOURCES = ["profiles", "sessions", "presets"]
_CTX_LIST_RESOURCES = ["providers", "mcp"]

list_parser.add_argument(
    "resource",
    choices=_LIST_RESOURCES + _CTX_LIST_RESOURCES,
    help="What to list",
)
list_parser.add_argument("--json", action="store_true")
list_parser.add_argument("--active", action="store_true", help="(sessions only) show only running")
list_parser.add_argument("--cleanup", action="store_true", help="(sessions only) clean up zombies")
list_parser.add_argument("--type", "-t", choices=library.get_agent_types(),
                          default=None, help="(presets only) filter by agent type")
list_parser.add_argument("--exit", dest="exit_id", type=int, default=None,
                          help="(sessions only) record exit by session ID")
list_parser.add_argument("--exit-by-pid", dest="exit_pid", type=int, default=None,
                          help="(sessions only) record exit by PID")
list_parser.add_argument("exit_code", type=int, nargs="?", default=None,
                          help="Exit code (with --exit or --exit-by-pid)")


@with_argparser(list_parser)
@with_category("Information")
def do_list(self, args: argparse.Namespace) -> None:
    """List resources: profiles, sessions, or presets."""
    resource = args.resource

    # ── sessions (special: has cleanup / exit sub-modes) ──
    if resource == "sessions":
        if args.exit_pid is not None:
            code = args.exit_code if args.exit_code is not None else 0
            sessions.record_exit_by_pid(args.exit_pid, code)
            self._cmd.poutput(f"recorded exit for pid {args.exit_pid} code {code}")
            return
        if args.exit_id is not None:
            if args.exit_code is None:
                self._cmd.perror("agent-box: --exit requires an exit code")
                return
            sessions.record_exit(args.exit_id, args.exit_code)
            self._cmd.poutput("ok")
            return
        if args.cleanup:
            n = sessions.cleanup_stale_sessions()
            self._cmd.poutput(str(n))
            return

        rows = sessions.fetch_sessions(active_only=args.active)
        if args.json:
            self._cmd.poutput(json.dumps(rows, indent=2, ensure_ascii=False))
            return
        if not rows:
            self._cmd.poutput("(no sessions)")
            return
        id_w = max(len(str(r["id"])) for r in rows)
        name_w = max(len(r["profile"]) for r in rows)
        type_w = max(len(r["agent_type"]) for r in rows)
        launched_w = max(len(r.get("launched_at") or "") for r in rows)
        header = (
            f"{'ID':<{id_w}}  {'PROFILE':<{name_w}}  {'AGENT':<{type_w}}  "
            f"{'LAUNCHED':<{launched_w}}"
        )
        self._cmd.poutput(header)
        for r in rows:
            line = (
                f"{r['id']:<{id_w}}  {r['profile']:<{name_w}}  "
                f"{r['agent_type']:<{type_w}}  "
                f"{(r.get('launched_at') or ''):<{launched_w}}"
            )
            if not args.active and r.get("exited_at"):
                line += f"  {r['exited_at']}  exit={r.get('exit_code')}"
            self._cmd.poutput(line)
        return

    # ── profiles ──
    if resource == "profiles":
        rows = profile.list_profiles()
        if args.type:
            rows = [r for r in rows if r.get("agent_type") == args.type]
        if args.json:
            self._cmd.poutput(json.dumps(rows, indent=2))
            return
        if not rows:
            label = f"(no {args.type} profiles)" if args.type else "(no profiles)"
            self._cmd.poutput(label)
            return
        name_w = max((len(r["name"]) for r in rows), default=4)
        type_w = max((len(r["agent_type"]) for r in rows), default=4)
        for r in rows:
            self._cmd.poutput(f"{r['name']:<{name_w}}  {r['agent_type']:<{type_w}}")
        return

    # ── presets ──
    if resource == "presets":
        if args.json:
            out = {}
            types = [args.type] if args.type else library.get_agent_types()
            for at in types:
                out[at] = library.list_presets(at)
            self._cmd.poutput(json.dumps(out, indent=2))
            return
        if args.type is not None:
            rows = library.list_presets(args.type)
            if not rows:
                self._cmd.poutput(f"(no presets for type {args.type!r})")
                return
            for name in rows:
                self._cmd.poutput(name)
            return
        any_out = False
        for at in library.get_agent_types():
            rows = library.list_presets(at)
            if not rows:
                continue
            any_out = True
            self._cmd.poutput(f"{at}:")
            for name in rows:
                self._cmd.poutput(f"  {name}")
        if not any_out:
            self._cmd.poutput("(no presets shipped)")
        return

    # ── context-only listing (providers / mcp / skills) ──
    shell: AgentBoxShell = self._cmd  # type: ignore[assignment]
    ctx = shell._profile_ctx if hasattr(shell, "_profile_ctx") else None
    if ctx is None:
        self._cmd.perror(f"list {resource}: not available in global scope — use a profile first")
        return

    if resource == "providers":
        try:
            from ...resources import providers as _prov
            entries = _prov.list_profile_providers(ctx.profile_name, ctx.agent_type)
        except Exception as exc:
            self._cmd.perror(f"agent-box: {exc}")
            return
        if args.json:
            self._cmd.poutput(json.dumps(entries, indent=2, ensure_ascii=False))
            return
        if not entries:
            self._cmd.poutput("(no providers)")
            return
        for e in entries:
            self._cmd.poutput(f"{e['id']:20s}  {e.get('name', '')}")

    elif resource == "mcp":
        try:
            from ...resources import mcp as _mcp
            entries = _mcp.list_profile_mcp_servers(ctx.profile_name)
        except Exception as exc:
            self._cmd.perror(f"agent-box: {exc}")
            return
        if args.json:
            self._cmd.poutput(json.dumps(entries, indent=2, ensure_ascii=False))
            return
        if not entries:
            self._cmd.poutput("(no MCP servers)")
            return
        for e in entries:
            self._cmd.poutput(f"{e['id']:20s}  {e.get('name', '')}")

# ── create ─────────────────────────────────────────────────────────────────

create_parser = Cmd2ArgumentParser()
create_parser.add_argument("name", help="Profile name")
create_parser.add_argument(
    "--type", "-t", choices=library.get_agent_types(),
    default=config.DEFAULT_AGENT_TYPE,
)
create_parser.add_argument("--display-name", default=None)
create_parser.add_argument("--description", default=None)
create_parser.add_argument("--provider", default=None)
create_parser.add_argument("--claude-md", default=None, help="Path to prompt file")
create_parser.add_argument("--preset", default=None)


@with_argparser(create_parser)
@with_category("Profile Management")
def do_create(self, args: argparse.Namespace) -> None:
    """Create a new profile."""
    prompt_body: str | None = None
    if args.claude_md is not None:
        try:
            with open(args.claude_md, encoding="utf-8") as fh:
                prompt_body = fh.read()
        except OSError as exc:
            self._cmd.perror(f"agent-box: cannot read {args.claude_md!r}: {exc}")
            return
    try:
        root = profile.create(
            args.name, agent_type=args.type,
            display_name=args.display_name, description=args.description,
            provider=args.provider, prompt_body=prompt_body, preset=args.preset,
        )
    except (ValueError, profile.ProfileError) as exc:
        self._cmd.perror(f"agent-box: {exc}")
        return
    self._cmd.poutput(f"created profile {args.name!r} ({args.type}) at {root}")


# ── delete ─────────────────────────────────────────────────────────────────

delete_parser = Cmd2ArgumentParser()
delete_parser.add_argument("name", help="Profile name")
delete_parser.add_argument("--force", action="store_true")


@with_argparser(delete_parser)
@with_category("Profile Management")
def do_delete(self, args: argparse.Namespace) -> None:
    """Delete a profile."""
    try:
        ok = profile.delete(args.name, force=args.force)
    except (ValueError, profile.ProfileError) as exc:
        self._cmd.perror(f"agent-box: {exc}")
        return
    if ok:
        self._cmd.poutput(f"deleted profile {args.name!r}")


# ── show ───────────────────────────────────────────────────────────────────

show_parser = Cmd2ArgumentParser()
show_parser.add_argument("target", nargs="?", default=None,
                          help="Profile name, or 'options' for full config")
show_parser.add_argument("--json", action="store_true")


@with_argparser(show_parser)
@with_category("Information")
def do_show(self, args: argparse.Namespace) -> None:
    """Show profile details or full configuration overview."""
    shell: AgentBoxShell = self._cmd  # type: ignore[assignment]
    ctx = shell._profile_ctx if hasattr(shell, "_profile_ctx") else None

    # ── profile context ──
    if ctx is not None:
        if args.target == "options":
            ctx.do_options(args)
            return
        if args.target is None:
            _show_profile(self, ctx.profile_name, args)
            return
        # explicit name given — fall through to global lookup

    # ── global context ──
    if args.target is None or args.target == "options":
        _show_global_options(self, args)
        return
    _show_profile(self, args.target, args)


def _show_profile(self, profile_name: str, args: argparse.Namespace) -> None:
    """Display a single profile's details."""
    try:
        info = profile.show(profile_name)
    except (ValueError, profile.ProfileError) as exc:
        self._cmd.perror(f"agent-box: {exc}")
        return
    if args.json:
        self._cmd.poutput(json.dumps(info, indent=2, ensure_ascii=False))
        return
    meta = info["meta"]
    self._cmd.poutput(f"name:       {meta.get('name')}")
    self._cmd.poutput(f"agent_type: {meta.get('agent_type')}")
    self._cmd.poutput(f"config_dir: {info['config_dir']}")
    if info.get("data_dir"):
        self._cmd.poutput(f"data_dir:   {info['data_dir']}")
    for k in ("display_name", "description", "provider", "preset", "prompt"):
        v = meta.get(k)
        if v:
            self._cmd.poutput(f"{k + ':':<11} {v}")


def _show_global_options(self, args: argparse.Namespace) -> None:
    """Show global overview — all profiles, summaries."""
    rows = profile.list_profiles()
    if args.json:
        self._cmd.poutput(json.dumps({
            "profile_count": len(rows),
            "profiles": rows,
        }, indent=2, ensure_ascii=False))
        return
    if not rows:
        self._cmd.poutput("(no profiles)")
        return
    type_counts: dict[str, int] = {}
    for r in rows:
        t = r.get("agent_type", "?")
        type_counts[t] = type_counts.get(t, 0) + 1
    parts = [f"{t}: {c}" for t, c in sorted(type_counts.items())]
    self._cmd.poutput(f"{len(rows)} profile(s)  [{', '.join(parts)}]")


# ── configure ──────────────────────────────────────────────────────────────

configure_parser = Cmd2ArgumentParser(
    description="Update profile metadata or open config dir in $EDITOR",
)
configure_parser.add_argument("name", nargs="?", default=None,
                              help="Profile name (omit to edit current context)")
configure_parser.add_argument("--display-name", default=None)
configure_parser.add_argument("--description", default=None)
configure_parser.add_argument("--provider", default=None)
configure_parser.add_argument("--claude-md", default=None, help="Set the prompt reference")


@with_argparser(configure_parser)
@with_category("Profile Management")
def do_configure(self, args: argparse.Namespace) -> None:
    """Edit profile metadata or open config dir in $EDITOR."""
    shell: AgentBoxShell = self._cmd  # type: ignore[assignment]
    ctx = shell._profile_ctx if hasattr(shell, "_profile_ctx") else None

    profile_name = args.name
    if profile_name is None:
        if ctx is not None:
            profile_name = ctx.profile_name
        else:
            self._cmd.perror("agent-box: specify a profile name or use a profile first")
            return

    if any(getattr(args, f, None) is not None
           for f in ("display_name", "description", "provider", "claude_md")):
        try:
            result = profile.update_meta(
                profile_name,
                display_name=args.display_name, description=args.description,
                provider=args.provider, prompt=args.claude_md,
            )
        except (ValueError, profile.ProfileError) as exc:
            self._cmd.perror(f"agent-box: {exc}")
            return
        self._cmd.poutput(f"updated profile {profile_name!r}")
        for k in ("display_name", "description", "provider"):
            if getattr(args, k, None) is not None:
                self._cmd.poutput(f"  {k}: {result[k]}")
        if args.claude_md is not None:
            self._cmd.poutput(f"  prompt: {result['prompt']}")
        return
    # Open config dir in $EDITOR
    try:
        meta = profile.load_meta(profile_name)
    except (ValueError, profile.ProfileError) as exc:
        self._cmd.perror(f"agent-box: {exc}")
        return
    target = config.profile_agent_dir(profile_name, meta["agent_type"])
    from ... import edit as edit_mod
    edit_mod.open_editor(target)


# ── use ─────────────────────────────────────────────────────────────────────

use_parser = Cmd2ArgumentParser()
use_parser.add_argument("profile", help="Profile name to enter")


@with_argparser(use_parser)
@with_category("Session & Context")
def do_use(self, args: argparse.Namespace) -> None:
    """Enter a profile context."""
    try:
        meta = profile.load_meta(args.profile)
    except (ValueError, profile.ProfileError) as exc:
        self._cmd.perror(f"agent-box: {exc}")
        return
    self._cmd.enter_context(args.profile, meta["agent_type"])
    self._cmd.poutput(
        f"switched to profile {args.profile!r} ({meta['agent_type']})"
    )


# ── launch ─────────────────────────────────────────────────────────────────

launch_parser = Cmd2ArgumentParser()
launch_parser.add_argument("name", nargs="?", default=None,
                           help="Profile name (omit to launch current context)")
launch_parser.add_argument("extra", nargs=argparse.REMAINDER,
                           help="Extra args passed to the agent binary")


@with_argparser(launch_parser)
@with_category("Session & Context")
def do_launch(self, args: argparse.Namespace) -> None:
    """Launch a profile via bwrap.  In profile context, launch the current
    profile without needing to repeat its name."""
    shell: AgentBoxShell = self._cmd  # type: ignore[assignment]
    ctx = shell._profile_ctx if hasattr(shell, "_profile_ctx") else None

    profile_name = args.name
    if profile_name is None:
        if ctx is not None:
            profile_name = ctx.profile_name
        else:
            self._cmd.perror("agent-box: specify a profile name or use a profile first")
            return

    try:
        launch.launch(profile_name, extra_args=args.extra)
    except (ValueError, profile.ProfileError) as exc:
        self._cmd.perror(f"agent-box: {exc}")


# ── CoreCommands class ─────────────────────────────────────────────────────
# All commands are module-level functions above.  We bind them onto a
# minimal CommandSet at the bottom so cmd2 picks them up.

class CoreCommands(CommandSet):
    """Global commands — profile lifecycle, sessions, presets, context entry."""

    do_list = do_list
    do_create = do_create
    do_delete = do_delete
    do_show = do_show
    do_configure = do_configure
    do_use = do_use
    do_launch = do_launch
