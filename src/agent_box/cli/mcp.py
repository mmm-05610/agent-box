"""CLI handlers — MCP apply + profile-level."""
from __future__ import annotations

import argparse
import sys

from .. import config
from ..resources import mcp, profile


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
