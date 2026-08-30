"""One locator for the Web Workbench static build."""
from __future__ import annotations

import os
import sysconfig
from pathlib import Path


def locate_web_static() -> Path | None:
    """Return the first usable Web build for source and installed layouts."""
    candidates: list[Path] = []
    explicit = os.environ.get("AGENT_BOX_WEB_STATIC")
    if explicit:
        candidates.append(Path(explicit).expanduser())
    # server/static.py -> server -> agent_box -> src -> checkout root
    candidates.append(Path(__file__).resolve().parents[3] / "gui-web" / "dist")
    candidates.append(Path(sysconfig.get_path("data")) / "share" / "agent-box" / "web")
    for candidate in candidates:
        if (candidate / "index.html").is_file():
            return candidate.resolve()
    return None


__all__ = ["locate_web_static"]
