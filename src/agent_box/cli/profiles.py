"""CLI handlers — profiles."""
from __future__ import annotations

import argparse
import json
import sys
from typing import Dict, List

from .. import config, launch, library, profile, sessions


def cmd_create(args: argparse.Namespace) -> int:
    claude_md_body: str | None = None
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
    # --exit-by-pid PID CODE: record exit by PID and return.
    if args.exit_pid is not None:
        code = args.exit_code if args.exit_code is not None else 0
        sessions.record_exit_by_pid(args.exit_pid, code)
        print(f"recorded exit for pid {args.exit_pid} code {code}")
        return 0

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
