"""CLI handlers — skills."""
from __future__ import annotations

import argparse
import json
import sys
from typing import Dict, List

from .. import config, profile, skills


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


def cmd_skill_profile_remove(args: argparse.Namespace) -> int:
    try:
        ok = skills.remove_skill_from_profile(args.profile, args.id)
        if not ok:
            print(f"agent-box: skill {args.id!r} not found in profile {args.profile!r}", file=sys.stderr)
            return 2
        print(f"removed skill {args.id!r} from profile {args.profile!r}")
        return 0
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2


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
