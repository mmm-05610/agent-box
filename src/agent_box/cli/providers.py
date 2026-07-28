"""CLI handlers — providers."""
from __future__ import annotations

import argparse
import json
import sys
from typing import Dict, List, Optional

from .. import config, profile, providers


def cmd_provider_list(args: argparse.Namespace) -> int:
    try:
        from ..ccswitch_adapter import list_providers as cs_list_providers
        rows = cs_list_providers(args.type)
    except Exception:
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
        from ..ccswitch_adapter import get_provider as cs_get_provider
        row = cs_get_provider(args.type, args.id)
    except Exception:
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


def cmd_provider_profile_list(args: argparse.Namespace) -> int:
    try:
        meta = profile.load_meta(args.profile)
        rows = providers.list_profile_providers(args.profile, meta["agent_type"])
    except Exception as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    json.dump(rows, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


def cmd_provider_profile_remove(args: argparse.Namespace) -> int:
    try:
        meta = profile.load_meta(args.profile)
        ok = providers.remove_profile_provider(args.profile, meta["agent_type"], args.provider)
        if not ok:
            print(f"agent-box: provider {args.provider!r} not found in profile {args.profile!r}", file=sys.stderr)
            return 2
        print(f"removed provider {args.provider!r} from profile {args.profile!r}")
        return 0
    except Exception as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2


def cmd_provider_duplicate(args: argparse.Namespace) -> int:
    try:
        result = providers.duplicate_provider(args.type, args.id, args.new_id)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    json.dump(result, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


def cmd_provider_presets(args: argparse.Namespace) -> int:
    presets = providers.get_presets(args.type)
    json.dump(presets, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


def cmd_provider_usage(args: argparse.Namespace) -> int:
    result = providers.query_provider_usage(args.type, args.id)
    json.dump(result, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


def cmd_provider_usage_script(args: argparse.Namespace) -> int:
    try:
        stdin_content = sys.stdin.read()
        result = providers.save_usage_script(args.type, args.id, stdin_content)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    json.dump(result, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
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
