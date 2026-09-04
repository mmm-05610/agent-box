"""Studio service configuration."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 3081

HOST_ENV = "AGENT_BOX_STUDIO_HOST"
PORT_ENV = "AGENT_BOX_STUDIO_PORT"
TOKEN_ENV = "AGENT_BOX_STUDIO_TOKEN"
CORS_ENV = "AGENT_BOX_STUDIO_CORS_ORIGINS"
AGENT_BOX_HOME_ENV = "AGENT_BOX_HOME"
WORKER_MODE_ENV = "AGENT_BOX_STUDIO_WORKER_MODE"
TURN_TIMEOUT_ENV = "AGENT_BOX_STUDIO_TURN_TIMEOUT_SECONDS"

WS_TICKET_TTL_SECONDS = 30


@dataclass(frozen=True)
class StudioConfig:
    """Runtime configuration of the Studio service process.

    ``token`` is the REST bearer credential.  When unset the service
    generates an ephemeral token at startup and prints it once to stderr;
    loopback binds still require the token.

    ``worker_mode`` selects how accepted turns execute: ``thread`` (the
    production single-process background worker) or ``inline`` (tests and
    embedders that execute on the submitting thread).  ``turn_timeout_seconds``
    bounds a background run; on expiry the run is cancelled through its
    runtime authority and, absent proof of termination, becomes
    RECOVERY_REQUIRED — never a fabricated terminal.
    """

    host: str = DEFAULT_HOST
    port: int = DEFAULT_PORT
    token: str | None = None
    cors_origins: tuple[str, ...] = ()
    agent_box_home: Path | None = None
    worker_mode: str = "thread"
    poll_interval: float = 0.1
    turn_timeout_seconds: float = 600.0

    @classmethod
    def from_env(cls) -> "StudioConfig":
        host = os.environ.get(HOST_ENV, DEFAULT_HOST)
        port = int(os.environ.get(PORT_ENV, DEFAULT_PORT))
        token = os.environ.get(TOKEN_ENV) or None
        cors_raw = os.environ.get(CORS_ENV, "")
        cors = tuple(
            origin.strip() for origin in cors_raw.split(",") if origin.strip()
        )
        home_value = os.environ.get(AGENT_BOX_HOME_ENV)
        worker_mode = os.environ.get(WORKER_MODE_ENV, "thread")
        if worker_mode not in ("thread", "inline"):
            raise ValueError("AGENT_BOX_STUDIO_WORKER_MODE must be thread or inline")
        turn_timeout = float(os.environ.get(TURN_TIMEOUT_ENV, "600"))
        return cls(
            host=host,
            port=port,
            token=token,
            cors_origins=cors,
            agent_box_home=Path(home_value).expanduser() if home_value else None,
            worker_mode=worker_mode,
            turn_timeout_seconds=turn_timeout,
        )
