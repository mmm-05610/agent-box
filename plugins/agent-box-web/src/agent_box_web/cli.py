"""Command-line entry point for the optional Web Host package."""
from __future__ import annotations

import threading
import webbrowser


def web_readiness() -> dict[str, object]:
    from .server.static import locate_web_static

    static_dir = locate_web_static()
    return {
        "web_plugin": True,
        "frontend_static_build": static_dir is not None,
        "frontend_static_dir": str(static_dir) if static_dir else None,
    }


def run(*, host: str = "127.0.0.1", port: int = 4173, open_browser: bool = True, initial_route: str = "/works") -> int:
    from .server.host import run_server

    if open_browser:
        threading.Timer(0.6, lambda: webbrowser.open(f"http://{host}:{port}#{initial_route}")).start()
    run_server(host, port)
    return 0
