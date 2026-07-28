"""CLI handlers — skill apply + profile-level."""
from __future__ import annotations

import argparse
import sys

from .. import config, profile, skills


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
        skills.remove_skill_from_profile(args.profile, args.id)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    print(f"removed skill {args.id!r} from profile {args.profile!r}")
    return 0
