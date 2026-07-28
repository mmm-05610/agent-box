"""CLI handlers — claude-md apply."""
from __future__ import annotations

import argparse
import sys

from .. import config
from ..resources import profile


def cmd_claude_md_apply(args: argparse.Namespace) -> int:
    try:
        claude_mds.apply_claude_md(args.profile, args.id)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    print(f"applied claude-md {args.id!r} to profile {args.profile!r}")
    return 0
