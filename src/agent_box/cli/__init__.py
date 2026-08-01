"""Command-line entry point for agent-box.

Three modes:

- ``agent-box`` (no args) → interactive REPL
- ``agent-box exec "<script>"`` → run commands and exit
- ``agent-box --version`` → print version
"""
from __future__ import annotations

import argparse
import sys
from typing import List

from .. import __version__, config


PROG = config.DISPLAY_NAME


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=PROG,
        description="Isolated config launcher for coding agents (bwrap bind mount).",
    )
    parser.add_argument(
        "--version", action="version",
        version=f"%(prog)s {__version__}",
    )
    sub = parser.add_subparsers(dest="command")
    parser.set_defaults(func=cmd_repl)

    p_repl = sub.add_parser("repl", help="Start the interactive agent-box REPL")
    p_repl.set_defaults(func=cmd_repl)

    p_exec = sub.add_parser("exec", help="Execute a ;-separated command script")
    p_exec.add_argument("script", nargs="?", help="Commands separated by ;")
    p_exec.set_defaults(func=cmd_exec)

    return parser


def cmd_repl(_args: argparse.Namespace) -> int:
    from .shell import run_repl
    return run_repl()


def cmd_exec(args: argparse.Namespace) -> int:
    from .shell import run_exec
    script = args.script
    if script is None and not sys.stdin.isatty():
        script = sys.stdin.read()
    if not script:
        print("agent-box exec: no script given (argument or stdin)", file=sys.stderr)
        return 2
    return run_exec(script)


def main(argv: List[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
