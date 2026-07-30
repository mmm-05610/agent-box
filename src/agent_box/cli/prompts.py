"""CLI handlers — prompt apply."""
from __future__ import annotations

import argparse
import sys

from .. import config
from ..resources import profile
from ..resources.prompts import apply_prompt


def cmd_prompt_apply(args: argparse.Namespace) -> int:
    try:
        apply_prompt(args.profile, args.id)
    except (ValueError, profile.ProfileError) as exc:
        print(f"agent-box: {exc}", file=sys.stderr)
        return 2
    print(f"applied prompt {args.id!r} to profile {args.profile!r}")
    return 0
