"""Launch an agent profile inside a bwrap namespace.

The profile's config directory copy is bind-mounted over the agent's
real config directory, isolating each role's configuration.
"""
from __future__ import annotations

import os
import shutil
import sys

from . import config
from .core.library import get_agent_config
from .resources import profile
from .resources import sessions


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
    agent_config = get_agent_config(agent_type)
    if agent_config is None:
        raise profile.ProfileError(f"unknown agent_type {agent_type!r}")

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

    for relative_path in agent_config.get("extra_profile_files", []):
        extra_name = relative_path.rstrip("/")
        profile_extra = config.profile_dir(name) / extra_name
        real_name = f".{profile_extra.name.removeprefix('dot-')}"
        real_extra = rdir.with_name(real_name)
        if relative_path.endswith("/"):
            profile_extra.mkdir(parents=True, exist_ok=True)
            real_extra.mkdir(parents=True, exist_ok=True)
        elif profile_extra.is_file():
            if not real_extra.exists():
                real_extra.touch()
        else:
            continue
        argv.insert(4, str(real_extra))
        argv.insert(4, str(profile_extra))
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

    # Hermes: preserve hermes-agent/ (venv) from host — profile config
    # dirs don't ship a Python virtualenv. Append mount AFTER the main
    # config-dir mount so it overrides the hermes-agent/ subdirectory.
    if agent_type == "hermes":
        agent_dir = rdir / "hermes-agent"
        profile_agent_dir = pdir / "hermes-agent"
        venv_binary = profile_agent_dir / "venv" / "bin" / "hermes"
        if agent_dir.is_dir() and not venv_binary.is_file():
            argv.append("--bind")
            argv.append(str(agent_dir))
            argv.append(str(agent_dir))

    argv.append(binary)
    if extra_args:
        argv.extend(extra_args)

    env = dict(os.environ)
    print(
        f"agent-box: launching {agent_type} as profile {name!r} "
        f"(mount: {pdir} → {rdir})",
        file=sys.stderr,
    )

    import subprocess as _sp

    mode = MODE_RESUME if extra_args else MODE_NEW
    pid = os.getpid()
    sid = sessions.record_launch(name, agent_type, os.getcwd(), mode, pid)

    # Use subprocess instead of execvpe so we can record exit
    proc = _sp.Popen(argv, env=env)
    exit_code = proc.wait()
    sessions.record_exit(sid, exit_code)
    # Exit with the same code so the shell script can report failures
    raise SystemExit(exit_code)
