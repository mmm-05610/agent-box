"""CLI handlers — hooks."""
from __future__ import annotations

import argparse
import json
import sys
from typing import Dict, List

from .. import config, hooks, profile


def cmd_hooks_show(args: argparse.Namespace) -> int:
    try:
        data = hooks.get_hooks(args.profile)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    if data is None:
        print(f"agent-box: profile {args.profile!r} has no hooks.json", file=sys.stderr)
        return 2
    if args.json:
        json.dump(data, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    json.dump(data, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


def cmd_hooks_upsert(args: argparse.Namespace) -> int:
    try:
        stdin_content = sys.stdin.read()
        result = hooks.upsert_hooks(args.profile, stdin_content)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    json.dump(result, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


# --- entry point ----------------------------------------------------------
