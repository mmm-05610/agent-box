from __future__ import annotations

import argparse
import os
from pathlib import Path


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description="Run the independent AgentBox loopback Server")
    value.add_argument("--data-root", type=Path, required=True)
    value.add_argument("--port", type=int, default=8732)
    value.add_argument(
        "--sidecar-deployment", type=Path,
        help="non-secret Harness sidecar deployment JSON",
    )
    return value


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser().error("--port must be between 1 and 65535")
    from uvicorn import run
    from agent_box.server.bootstrap import build_runtime, build_runtime_from_sidecar_deployment
    from agent_box.server.transport.http import create_app

    runtime = (
        build_runtime_from_sidecar_deployment(args.data_root, args.sidecar_deployment)
        if args.sidecar_deployment else build_runtime(args.data_root)
    )
    # One ASGI worker is an invariant: no CLI knob exposes a multi-worker mode.
    run(create_app(runtime), host="127.0.0.1", port=args.port, workers=1, log_config=None)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
