"""Command line entry point for agent-box-studio."""
from __future__ import annotations

import argparse
import sys
from typing import BinaryIO

from .config import DEFAULT_HOST, DEFAULT_PORT, HOST_ENV, PORT_ENV, StudioConfig
from .server.app import create_app
from .host_bridge import (
    HostBridgeClient,
    HostBridgeHostAuthority,
    read_host_bridge_bootstrap,
)


def sidecar_host_operations(stream: BinaryIO) -> HostBridgeHostAuthority:
    """The ``--sidecar`` production ``host_operations``.

    Reads exactly one private HostBridge bootstrap frame from the given
    stream (process stdin) and wraps the bare bridge client in the host
    authority the WSL runtime/workspace providers consume
    (``resolve_connection`` / ``transport_for_wsl`` / ``resolve_runtime_ref``).
    """
    bootstrap = read_host_bridge_bootstrap(stream)
    return HostBridgeHostAuthority(HostBridgeClient(bootstrap))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="agent-box-studio",
        description="Agent-Box Studio upper-layer orchestration service",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    serve = subparsers.add_parser("serve", help="Run the Studio HTTP/WS server")
    serve.add_argument(
        "--host", default=None,
        help=f"Bind host (default: {DEFAULT_HOST}; env {HOST_ENV} overrides)",
    )
    serve.add_argument(
        "--sidecar", action="store_true",
        help="read the private HostBridge bootstrap from inherited stdin",
    )
    serve.add_argument(
        "--port", type=int, default=None,
        help=f"Bind port (default: {DEFAULT_PORT}; env {PORT_ENV} overrides)",
    )
    serve.add_argument(
        "--token", default=None,
        help="REST bearer token (default: env AGENT_BOX_STUDIO_TOKEN; "
        "otherwise an ephemeral token is generated and printed once)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "serve":
        import uvicorn

        config = StudioConfig.from_env()
        if args.host is not None:
            config = StudioConfig(
                host=args.host, port=config.port, token=config.token or args.token,
                cors_origins=config.cors_origins, agent_box_home=config.agent_box_home,
            )
        if args.port is not None:
            config = StudioConfig(
                host=config.host, port=args.port, token=config.token or args.token,
                cors_origins=config.cors_origins, agent_box_home=config.agent_box_home,
            )
        elif args.token is not None and config.token is None:
            config = StudioConfig(
                host=config.host, port=config.port, token=args.token,
                cors_origins=config.cors_origins, agent_box_home=config.agent_box_home,
            )
        host_operations = None
        if args.sidecar:
            host_operations = sidecar_host_operations(sys.stdin.buffer)
        uvicorn.run(
            create_app(config=config, host_operations=host_operations),
            host=config.host,
            port=config.port,
            log_level="warning",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
