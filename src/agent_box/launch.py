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
from . import sessions


# Mode labels stored in sessions.db. The GUI uses the same strings.
MODE_NEW = "新会话"
MODE_RESUME = "继续上次"


def launch(name: str, extra_args: list | None = None) -> None:
    """Bind-mount the profile's config dir and exec the agent binary.

    Reads ``meta.yaml`` to determine agent_type. ``extra_args`` are
    passed through to the agent binary (e.g. ``-c`` for hermes,
    ``--continue`` for claude). Never returns on success.
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

    # CC: also bind-mount dot-claude.json → ~/.claude.json
    if agent_type == "cc":
        pjson = config.profile_dir(name) / "dot-claude.json"
        rjson = config.real_agent_dir("cc").with_name(".claude.json")
        if pjson.is_file():
            if not rjson.exists():
                rjson.touch()
            argv.insert(4, str(rjson))
            argv.insert(4, str(pjson))
            argv.insert(4, "--bind")

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
    if extra_args:
        argv.extend(extra_args)

    env = dict(os.environ)
    print(
        f"agent-box: launching {agent_type} as profile {name!r} "
        f"(mount: {pdir} → {rdir})",
        file=sys.stderr,
    )

    # Record the launch BEFORE execvpe replaces this process. bwrap
    # inherits our PID, so the recorded pid matches the long-running
    # namespace process. The GUI's watcher will later call
    # `agent-box sessions --exit <id> <code>` to close the row.
    mode = MODE_RESUME if extra_args else MODE_NEW
    sessions.record_launch(name, agent_type, os.getcwd(), mode, os.getpid())

    os.execvpe(bwrap, argv, env)
    raise profile.ProfileError(f"failed to exec {bwrap}")
