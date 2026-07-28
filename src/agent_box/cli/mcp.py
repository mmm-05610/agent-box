"""CLI handlers — mcp."""
from __future__ import annotations

import argparse
import json
import sys
from typing import Dict, List

from .. import config, mcp, profile


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


def cmd_mcp_profile_remove(args: argparse.Namespace) -> int:
    try:
        mcp.remove_mcp_from_profile(args.profile, args.id)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    print(f"removed mcp-server {args.id!r} from profile {args.profile!r}")
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
