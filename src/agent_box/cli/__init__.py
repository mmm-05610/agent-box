"""Command-line entry point for agent-box.

Modes:

- ``agent-box`` (no args) → help
- ``agent-box repl`` → interactive cmd2 REPL
- ``agent-box exec "<script>"`` → run commands and exit
- ``agent-box --version`` → print version
"""
from __future__ import annotations

import argparse
import json
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
    parser.set_defaults(func=cmd_help)

    p_repl = sub.add_parser("repl", help="Start the interactive agent-box REPL")
    p_repl.set_defaults(func=cmd_repl)

    p_exec = sub.add_parser("exec", help="Execute a ;-separated command script")
    p_exec.add_argument("script", nargs="?", help="Commands separated by ;")
    p_exec.set_defaults(func=cmd_exec)

    p_web = sub.add_parser("web", help="Start the local Web Workbench Host")
    p_web.add_argument("--host", default="127.0.0.1")
    p_web.add_argument("--port", type=int, default=4173)
    p_web.add_argument("--no-browser", action="store_true")
    p_web.set_defaults(func=cmd_web)

    p_doctor = sub.add_parser("doctor", help="Check local Web Host readiness")
    p_doctor.add_argument("--json", action="store_true", dest="as_json")
    p_doctor.set_defaults(func=cmd_doctor)

    p_plugins = sub.add_parser(
        "plugins", help="Inspect installed third-party Agent-Box plugins"
    )
    plugins_sub = p_plugins.add_subparsers(dest="plugins_command", required=True)
    p_plugins_list = plugins_sub.add_parser("list", help="List plugin load status")
    p_plugins_list.add_argument("--json", action="store_true", dest="as_json")
    p_plugins_list.set_defaults(func=cmd_plugins_list)

    p_plugins_inspect = plugins_sub.add_parser("inspect", help="Inspect one plugin")
    p_plugins_inspect.add_argument("plugin_id")
    p_plugins_inspect.add_argument("--json", action="store_true", dest="as_json")
    from .commands.plugins import cmd_plugins_inspect, cmd_plugins_doctor
    p_plugins_inspect.set_defaults(func=cmd_plugins_inspect)
    p_plugins_doctor = plugins_sub.add_parser("doctor", help="Diagnose plugin structure")
    p_plugins_doctor.add_argument("plugin_id", nargs="?")
    p_plugins_doctor.add_argument("--json", action="store_true", dest="as_json")
    p_plugins_doctor.set_defaults(func=cmd_plugins_doctor)

    return parser


def cmd_help(_args: argparse.Namespace) -> int:
    print(f"{PROG}: use `agent-box web` to start the Local Web Workbench")
    return 0


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


def cmd_web(args: argparse.Namespace) -> int:
    from ..server.host import run_server
    if not args.no_browser:
        import threading, webbrowser
        threading.Timer(0.6, lambda: webbrowser.open(f"http://{args.host}:{args.port}")).start()
    run_server(args.host, args.port)
    return 0


def cmd_doctor(args: argparse.Namespace) -> int:
    from shutil import which
    from ..extensions.bootstrap import build_extension_registry
    from ..server.static import locate_web_static
    static_dir = locate_web_static()
    checks = {"AGENT_BOX_HOME": str(config.agent_box_home()), "git": bool(which("git")), "codex": bool(which("codex")), "frontend_static_build": static_dir is not None, "frontend_static_dir": str(static_dir) if static_dir else None}
    try:
        registry, report = build_extension_registry(strict=False)
        checks["plugin_registry"] = not bool(report.failed)
        checks["execution_providers"] = len(registry.descriptors()) > 0
    except Exception:
        checks["plugin_registry"] = False
        checks["execution_providers"] = False
    from ..application.ownership import MutationOwner
    owner = MutationOwner(config.agent_box_home())
    try:
        owner.acquire(); checks["mutation_lock"] = True
    except (RuntimeError, OSError):
        checks["mutation_lock"] = False
    finally:
        owner.release()
    if args.as_json:
        print(json.dumps(checks, ensure_ascii=False, sort_keys=True))
    else:
        for key, value in checks.items(): print(f"{key}: {'ok' if value else 'missing'}")
    return 0 if all(checks.values()) else 1


def cmd_plugins_list(args: argparse.Namespace) -> int:
    from ..extensions.bootstrap import build_extension_registry

    _registry, report = build_extension_registry(strict=False)
    rows = []
    for record in report.records:
        descriptor = record.descriptor
        registration = record.registration
        rows.append(
            {
                "entry_point": record.entry_point,
                "id": descriptor.id if descriptor else None,
                "display_name": descriptor.display_name if descriptor else None,
                "version": descriptor.version if descriptor else None,
                "api_version": descriptor.api_version if descriptor else None,
                "status": record.status,
                "contracts": sorted(
                    contract.contract_id for contract in registration.contracts
                ) if registration else [],
                "resource_providers": sorted(
                    provider.descriptor().id
                    for provider in registration.resource_providers
                ) if registration else [],
                "execution_providers": sorted(
                    provider.descriptor().id
                    for provider in registration.execution_providers
                ) if registration else [],
                "error": record.error,
                "distribution_name": record.distribution_name,
                "distribution_version": record.distribution_version,
            }
        )
    if args.as_json:
        print(json.dumps(rows, ensure_ascii=False, indent=2, sort_keys=True))
    elif not rows:
        print("No third-party Agent-Box plugins discovered.")
    else:
        for row in rows:
            identity = row["id"] or row["entry_point"]
            version = f" {row['version']}" if row["version"] else ""
            print(f"{row['status']:<12} {identity}{version}")
            if row["error"]:
                print(f"  {row['error']}")
    return 1 if any(row["status"] != "READY" for row in rows) else 0


def main(argv: List[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
