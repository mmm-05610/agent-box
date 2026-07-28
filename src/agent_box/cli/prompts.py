"""CLI handlers — prompts."""
from __future__ import annotations

import argparse
import json
import sys
from typing import Dict, List, Optional

from .. import claude_mds, config, profile


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
