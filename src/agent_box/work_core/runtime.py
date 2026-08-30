"""Provider-neutral runtime paths used by Core and installed Hosts."""
from __future__ import annotations

import os
from pathlib import Path

AGENT_BOX_HOME_ENV = "AGENT_BOX_HOME"
DISPLAY_NAME = "agent-box"


def agent_box_home() -> Path:
    value = os.environ.get(AGENT_BOX_HOME_ENV)
    return (Path(value).expanduser() if value else Path.home() / ".agent-box").resolve()


def database_path() -> Path:
    return agent_box_home() / "agent-box.db"


def migrations_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "migrations"
