"""CLI handlers — hooks."""
from __future__ import annotations

import argparse
import json
import sys

from ..resources import hooks, profile


def cmd_hooks_show(args: argparse.Namespace) -> int:
    try:
        data = hooks.get_hooks(args.profile)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    if data is None:
        print(f"(no hooks configured)", file=sys.stderr)
        return 2
    if args.json:
        json.dump(data, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    json.dump(data, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


def cmd_hooks_set(args: argparse.Namespace) -> int:
    try:
        stdin_content = sys.stdin.read()
        data = json.loads(stdin_content)
    except json.JSONDecodeError as exc:
        print(f"agent-box: invalid JSON: {exc}", file=sys.stderr)
        return 2
    try:
        result = hooks.set_hooks(args.profile, data)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    json.dump(result, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


def cmd_hooks_add(args: argparse.Namespace) -> int:
    try:
        stdin_content = sys.stdin.read()
        data = json.loads(stdin_content)
    except json.JSONDecodeError as exc:
        print(f"agent-box: invalid JSON: {exc}", file=sys.stderr)
        return 2
    try:
        result = hooks.add_hooks(args.profile, data)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    json.dump(result, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


def cmd_hooks_remove(args: argparse.Namespace) -> int:
    try:
        ok = hooks.remove_hooks(args.profile, args.key)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    print(f"{'removed' if ok else 'nothing to remove'}")
    return 0
