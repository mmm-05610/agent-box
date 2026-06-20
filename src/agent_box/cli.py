"""Command-line entry point for agent-box v2 (bwrap edition)."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import List, Optional

from . import config
from . import launch
from . import library
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
        help="Create a new profile (auto-inits the template for CC)",
    )
    p_create.add_argument("name", help="Profile name")
    p_create.add_argument(
        "--type", "-t",
        choices=library.get_agent_types(),
        default="cc",
        help="Agent family (default: cc). Non-CC profiles do not need --provider.",
    )
    p_create.add_argument(
        "--provider",
        choices=config.supported_providers(),
        help="Model provider for CC profiles "
             "(run \'agent-box component list --type provider\' for all). "
             "Ignored for non-CC agent types.",
    )
    p_create.set_defaults(func=cmd_create)

    # list ----------------------------------------------------------------
    p_list = sub.add_parser("list", help="List all profiles")
    p_list.add_argument("--json", action="store_true", help="Emit JSON")
    p_list.set_defaults(func=cmd_list)

    # cc ------------------------------------------------------------------
    p_cc = sub.add_parser("cc", help="Launch Claude Code under a profile (bwrap)")
    p_cc.add_argument("name", help="Profile name to launch as")
    # (no --cwd — use cd before launching: cd ~/projects/xxx && agent-box cc <profile>)
    p_cc.add_argument(
        "--provider",
        help="Switch this profile to <provider> before launching "
             "(overwrites settings.json env block)",
    )
    p_cc.add_argument(
        "--resume", action="store_true",
        help="Resume the previous CC session (passes --continue)",
    )
    p_cc.set_defaults(func=cmd_cc)

    # launch -------------------------------------------------------------
    p_launch = sub.add_parser(
        "launch",
        help="Launch a profile using the agent declared in its meta.yaml "
             "(bwrap + per-agent config dir mount)",
    )
    p_launch.add_argument("name", help="Profile name to launch")
    p_launch.set_defaults(func=cmd_launch)

    # codex / hermes / opencode -----------------------------------------
    p_codex = sub.add_parser("codex", help="Shortcut for: agent-box launch <name> (codex profile)")
    p_codex.add_argument("name", help="Codex profile name to launch")
    p_codex.set_defaults(func=cmd_codex)

    p_hermes = sub.add_parser("hermes", help="Shortcut for: agent-box launch <name> (hermes profile)")
    p_hermes.add_argument("name", help="Hermes profile name to launch")
    p_hermes.set_defaults(func=cmd_hermes)

    p_opencode = sub.add_parser("opencode", help="Shortcut for: agent-box launch <name> (opencode profile)")
    p_opencode.add_argument("name", help="OpenCode profile name to launch")
    p_opencode.set_defaults(func=cmd_opencode)

    # gui ----------------------------------------------------------------
    p_gui = sub.add_parser(
        "gui",
        help="Launch the NiceGUI web admin panel (http://127.0.0.1:8080)",
    )
    p_gui.set_defaults(func=cmd_gui)

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

    # component (v0.2.0: library catalog) -------------------------------
    p_comp = sub.add_parser(
        "component",
        help="Manage the component library (providers, MCP servers, ...)",
    )
    comp_sub = p_comp.add_subparsers(dest="component_command", required=True)

    # component list
    p_clist = comp_sub.add_parser("list", help="List components")
    p_clist.add_argument(
        "--type", "-t",
        choices=["provider", "mcp_server"],
        help="Filter by component type",
    )
    p_clist.add_argument(
        "--region",
        help="Filter by region (e.g. cn, us, eu, local, global)",
    )
    p_clist.add_argument(
        "--tag",
        help="Filter by tag (e.g. cn, aggregator, hosting)",
    )
    p_clist.add_argument(
        "--json", action="store_true",
        help="Emit JSON",
    )
    p_clist.add_argument(
        "--user-only", action="store_true",
        help="Only show user-added components (hide built-ins)",
    )
    p_clist.set_defaults(func=cmd_component_list)

    # component show
    p_cshow = comp_sub.add_parser("show", help="Show one component")
    p_cshow.add_argument("id", help="Component id")
    p_cshow.add_argument(
        "--type", "-t",
        choices=["provider", "mcp_server"],
        help="Component type (default: search both)",
    )
    p_cshow.add_argument("--json", action="store_true", help="Emit JSON")
    p_cshow.set_defaults(func=cmd_component_show)

    # component add
    p_cadd = comp_sub.add_parser("add", help="Add a user-defined component")
    p_cadd.add_argument(
        "--type", "-t", required=True,
        choices=["provider", "mcp_server"],
        help="Component type",
    )
    p_cadd.add_argument("--id", required=True, help="Component id (must be unique within type)")
    p_cadd.add_argument("--name", required=True, help="Human-readable name")
    p_cadd.add_argument(
        "--config", required=True,
        help="Component config (JSON string). For provider: {\"base_url\": \"...\", \"model\": \"...\"}",
    )
    p_cadd.add_argument("--label", default="", help="Short label (CN/EN)")
    p_cadd.add_argument("--region", default="", help="Region (cn, us, eu, global, local, ...)")
    p_cadd.add_argument(
        "--tag", action="append", default=[],
        help="Tag (can be repeated)",
    )
    p_cadd.set_defaults(func=cmd_component_add)

    # component delete
    p_cdel = comp_sub.add_parser("delete", help="Delete a user-defined component")
    p_cdel.add_argument("id", help="Component id")
    p_cdel.add_argument(
        "--type", "-t",
        choices=["provider", "mcp_server"],
        help="Component type (default: search both)",
    )
    p_cdel.add_argument(
        "--force", action="store_true",
        help="Don't error if the component does not exist",
    )
    p_cdel.set_defaults(func=cmd_component_delete)

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
        # For non-CC profiles, --provider is ignored. We still call
        # profile.create with provider=None so the create() function
        # takes its non-CC branch.
        provider = args.provider if args.type == "cc" else None
        root = profile.create(args.name, agent_type=args.type, provider=provider)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    if args.type == "cc":
        pdc = config.profile_dot_claude(args.name)
        print(f"created profile {args.name!r} (cc/{args.provider}) at {root}")
        print(
            f"  next: edit {pdc}/settings.json to set your ANTHROPIC_AUTH_TOKEN,\n"
            f"        then run: agent-box cc {args.name}"
        )
    else:
        pdir = config.profile_agent_dir(args.name, args.type)
        print(f"created profile {args.name!r} ({args.type}) at {root}")
        print(
            f"  next: edit {pdir}/ to fill in your API key and model,\n"
            f"        then run: agent-box launch {args.name}  (or: agent-box {args.type} {args.name})"
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
        if args.provider:
            profile.apply_provider(args.name, args.provider)
        launch.launch_cc(
            args.name,
            provider_id=args.provider,
            resume=bool(args.resume),
        )
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    # launch.launch_cc only returns on error (execvpe replaces the process).
    return 1


def cmd_launch(args: argparse.Namespace) -> int:
    """Generic launcher: dispatches to CC or the per-agent mount path."""
    try:
        config.validate_profile_name(args.name)
        launch.launch(args.name)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    # launch.launch only returns on error (execvpe replaces the process).
    return 1


def cmd_codex(args: argparse.Namespace) -> int:
    return cmd_launch(args)


def cmd_hermes(args: argparse.Namespace) -> int:
    return cmd_launch(args)


def cmd_opencode(args: argparse.Namespace) -> int:
    return cmd_launch(args)


def cmd_gui(args: argparse.Namespace) -> int:
    """Start the NiceGUI web admin panel."""
    try:
        from . import gui as _gui
    except ImportError as exc:
        print(
            f"agent-box: {exc}\n"
            f"  Install the GUI extra with: pip install 'agent-box[gui]' (or: pip install nicegui)",
            file=sys.stderr,
        )
        return 2
    _gui.main()
    # ui.run() blocks; we only get here on a clean shutdown.
    return 0


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
    print(f"config_dir: {info.get('config_dir', '-')}")
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


# --- component subcommand implementations --------------------------------

def cmd_component_list(args: argparse.Namespace) -> int:
    try:
        rows = library.list_components(
            type=args.type,
            region=args.region,
            tag=args.tag,
            include_builtin=not args.user_only,
        )
    except library.LibraryError as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2

    if args.json:
        json.dump(rows, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0

    if not rows:
        print("(no components)")
        return 0

    # Tabular output: built-in marked with *, custom with +, MCP rows get
    # an icon. Width auto-derived from the rows.
    id_w = max(len(r["id"]) for r in rows)
    name_w = max(_visible_len(r["name"]) for r in rows)
    type_w = max(len(r["type"]) for r in rows)
    region_w = max(len(r["region"] or "-") for r in rows)

    builtin_count = library.builtin_count()
    for r in rows:
        marker = "*" if r["built_in"] else "+"
        name_disp = r["name"]
        if r["type"] == "mcp_server":
            cmd = r.get("command", "")
            name_disp = f"{r['name']}  ({cmd})"
        print(
            f"{marker} {r['id']:<{id_w}}  {r['type']:<{type_w}}  "
            f"{r['region'] or '-':<{region_w}}  {name_disp}"
        )

    # Footer summary
    print()
    print(
        f"total: {len(rows)}  "
        f"(built-in: provider={builtin_count.get('provider', 0)}, "
        f"mcp_server={builtin_count.get('mcp_server', 0)})"
    )
    print("  * = built-in   + = user-added")
    return 0


def _visible_len(s: str) -> int:
    """Width for table layout (we don't go full wcwidth, ASCII is fine)."""
    return len(s)


def cmd_component_show(args: argparse.Namespace) -> int:
    # If --type omitted, search both types. If multiple matches, error
    # with a disambiguation hint. If none, error.
    if args.type:
        try:
            info = library.show_component(args.type, args.id)
        except library.LibraryError as exc:
            print(f"agent-box: {exc}", file=sys.stderr)
            return 2
    else:
        matches = []
        for t in ("provider", "mcp_server"):
            try:
                matches.append(library.show_component(t, args.id))
            except library.LibraryError:
                continue
        if not matches:
            print(
                f"agent-box: component not found: {args.id!r}. "
                f"Try: agent-box component list",
                file=sys.stderr,
            )
            return 2
        if len(matches) > 1:
            types = ", ".join(m["type"] for m in matches)
            print(
                f"agent-box: {args.id!r} is ambiguous ({types}); "
                f"re-run with --type",
                file=sys.stderr,
            )
            return 2
        info = matches[0]

    if args.json:
        json.dump(info, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0

    print(f"id:        {info['id']}")
    print(f"type:      {info['type']}")
    print(f"name:      {info['name']}")
    if info.get("label"):
        print(f"label:     {info['label']}")
    if info.get("region"):
        print(f"region:    {info['region']}")
    if info.get("tags"):
        print(f"tags:      {', '.join(info['tags'])}")
    print(f"built_in:  {bool(info['built_in'])}")
    print("config:")
    if info["type"] == "mcp_server":
        cfg = {"command": info.get("command", ""), "args": info.get("args", []), "env": info.get("env", {})}
    else:
        cfg = info.get("env", {})
    print(json.dumps(cfg, indent=2, ensure_ascii=False))
    return 0


def cmd_component_add(args: argparse.Namespace) -> int:
    try:
        cfg = json.loads(args.config)
    except json.JSONDecodeError as exc:
        print(f"agent-box: --config is not valid JSON: {exc}", file=sys.stderr)
        return 2
    if not isinstance(cfg, dict):
        print("agent-box: --config must be a JSON object", file=sys.stderr)
        return 2
    try:
        library.add_component(
            type=args.type,
            id=args.id,
            name=args.name,
            config=cfg,
            label=args.label or "",
            region=args.region or "",
            tags=args.tag or [],
        )
    except library.LibraryError as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    print(f"added {args.type} {args.id!r} ({args.name})")
    return 0


def cmd_component_delete(args: argparse.Namespace) -> int:
    if not args.type:
        # Same lookup logic as `show`
        target_type = None
        for t in ("provider", "mcp_server"):
            try:
                library.show_component(t, args.id)
                if target_type:
                    print(
                        f"agent-box: {args.id!r} is ambiguous "
                        f"(in both {target_type} and {t}); re-run with --type",
                        file=sys.stderr,
                    )
                    return 2
                target_type = t
            except library.LibraryError:
                continue
        if not target_type:
            if args.force:
                print(f"no such component {args.id!r} (nothing to delete)")
                return 0
            print(
                f"agent-box: component not found: {args.id!r}",
                file=sys.stderr,
            )
            return 2
        args.type = target_type
    try:
        ok = library.delete_component(args.type, args.id, force=args.force)
    except library.LibraryError as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    if ok:
        print(f"deleted {args.type} {args.id!r}")
    else:
        print(f"no such {args.type} {args.id!r} (nothing to delete)")
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
