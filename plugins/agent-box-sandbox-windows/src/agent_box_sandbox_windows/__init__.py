"""The Windows sandbox provider: the D5-degraded shape of the neutral seam.

Order 48's spike (docs/server-round1/fullstack/windows-spike.md) found that
AppContainer cannot start a process on this machine and that its integrity
model blocks writes to ordinary user directories for a non-admin. This package
therefore implements the seam's life-cycle and materialisation half (Job
Object, environment-block credentials, in-place configuration with read-only
files, real directories) and declares the isolation half unavailable.
"""
from .provider import (
    GUEST_HOME_PREFIX,
    SIDECAR_ENTRYPOINT,
    WindowsSandboxError,
    WindowsSandboxPort,
    create_sidecar_room_port,
)

__all__ = [
    "GUEST_HOME_PREFIX",
    "SIDECAR_ENTRYPOINT",
    "WindowsSandboxError",
    "WindowsSandboxPort",
    "create_sidecar_room_port",
]
