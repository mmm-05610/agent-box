"""Launch an agent profile inside a bwrap namespace.

The profile's config directory copy is bind-mounted over the agent's
real config directory, isolating each role's configuration.
"""
from __future__ import annotations

import os
import shutil
import sys

from . import config
from . import profile


def launch(name: str) -> None:
    """Bind-mount the profile's config dir and exec the agent binary.

    Reads ``meta.yaml`` to determine agent_type. Never returns on
    success (os.execvpe replaces the process).
    """
    meta = profile.load_meta(name)
    agent_type = meta.get("agent_type") or config.AGENT_TYPE_CC

    # --- resolve paths ---
    pdir = config.profile_agent_dir(name, agent_type)
    rdir = config.real_agent_dir(agent_type)
    binary = shutil.which(config.agent_binary(agent_type))
    bwrap = shutil.which(config.BWRAP)

    if not bwrap:
        raise profile.ProfileError(
            "bwrap not found in PATH. "
            "Install with: sudo apt install bubblewrap"
        )
    if not binary:
        raise profile.ProfileError(
            f"{config.agent_binary(agent_type)!r} not found in PATH"
        )
    if not pdir.is_dir():
        raise profile.ProfileError(
            f"{name}: profile config dir missing: {pdir}"
        )

    # Ensure real config dir exists as a bwrap mount point
    if not rdir.exists():
        rdir.mkdir(parents=True, exist_ok=True)

    # Build bwrap argv
    argv = [
        bwrap,
        "--bind", "/", "/",
        "--bind", str(pdir), str(rdir),
        "--dev", "/dev",
        "--proc", "/proc",
        "--tmpfs", "/tmp",
        "--unshare-ipc",
        "--unshare-pid",
        "--unshare-uts",
        "--share-net",
    ]

    # Secondary data dir mount (e.g. OpenCode auth)
    pdata = config.profile_agent_data_dir(name, agent_type)
    rdata = config.real_agent_data_dir(agent_type)
    if pdata is not None and pdata.is_dir() and rdata is not None:
        if not rdata.exists():
            rdata.mkdir(parents=True, exist_ok=True)
        argv.insert(4, str(rdata))
        argv.insert(4, str(pdata))
        argv.insert(4, "--bind")

    argv.append(binary)

    env = dict(os.environ)
    print(
        f"agent-box: launching {agent_type} as profile {name!r} "
        f"(mount: {pdir} → {rdir})",
        file=sys.stderr,
    )
    os.execvpe(bwrap, argv, env)
    raise profile.ProfileError(f"failed to exec {bwrap}")
