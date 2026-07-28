"""CLI handlers — provider apply + profile-level."""
from __future__ import annotations

import argparse
import json
import sys

from .. import config, profile, providers


def cmd_provider_apply(args: argparse.Namespace) -> int:
    try:
        providers.apply_provider(args.profile, args.id)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    print(f"applied provider {args.id!r} to profile {args.profile!r}")
    return 0


def cmd_provider_profile_list(args: argparse.Namespace) -> int:
    try:
        entries = providers.list_profile_providers(args.profile, args.type)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    if args.json:
        json.dump(entries, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    if not entries:
        print(f"(no providers added to profile {args.profile!r})")
        return 0
    for e in entries:
        print(f"{e['id']:20s}  {e.get('name', '')}")
    return 0


def cmd_provider_profile_remove(args: argparse.Namespace) -> int:
    try:
        ok = providers.remove_profile_provider(args.profile, args.type, args.id)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    print(f"{'removed' if ok else 'not found'}: provider {args.id!r} from profile {args.profile!r}")
    return 0
