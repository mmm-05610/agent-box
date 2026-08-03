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




def launch(name: str, extra_args: list | None = None) -> None:
    """Bind-mount the profile's config dir and exec the agent binary.

    Reads ``meta.yaml`` to determine agent_type. ``extra_args`` are
    passed through to the agent binary (e.g. ``-c`` for hermes,
    ``--continue`` for claude). Never returns on success.
    """
    meta = profile.load_meta(name)
    agent_type = meta.get("agent_type") or config.DEFAULT_AGENT_TYPE
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

    # ── sandbox policy (registry-driven) ─────────────────────────────
    sandbox = agent_config.get("sandbox") or {}

    # Build bwrap argv
    argv = [bwrap]

    # Root filesystem + additional bind-mounts
    for mount in sandbox.get("bind_mounts") or []:
        argv.extend(["--bind", mount, mount])

    # Fresh virtual filesystems: bwrap's --dev/--proc create new
    # filesystems tied to the child namespaces.  Binding the host's
    # /dev or /proc instead breaks PID mapping (host procfs under a new
    # --unshare-pid namespace) and leaves device nodes unusable.
    for mount in sandbox.get("dev_mounts") or []:
        argv.extend(["--dev", mount])
    for mount in sandbox.get("proc_mounts") or []:
        argv.extend(["--proc", mount])

    # Profile config bind-mount (always done — core of agent-box)
    argv.extend(["--bind", str(pdir), str(rdir)])

    # tmpfs mounts
    for tmp in sandbox.get("tmpfs") or []:
        argv.extend(["--tmpfs", tmp])

    # Namespace isolation
    for flag in sandbox.get("unshare") or []:
        argv.append(f"--unshare-{flag}")
    for flag in sandbox.get("share") or []:
        argv.append(f"--share-{flag}")

    for relative_path in agent_config.get("runtime", {}).get("extra_profile_files", []):
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

    venv_preserve = agent_config.get("runtime", {}).get("venv_preserve")
    if venv_preserve:
        host_venv = rdir / venv_preserve
        profile_venv = pdir / venv_preserve
        agent_dir = host_venv.parent
        venv_binary = profile_venv / "bin" / agent_config["identity"]["binary"]
        if agent_dir.is_dir() and not venv_binary.is_file():
            argv.append("--bind")
            argv.append(str(agent_dir))
            argv.append(str(agent_dir))

    argv.append(binary)
    if extra_args:
        argv.extend(extra_args)

    env = dict(os.environ)
    print(
        f"{config.DISPLAY_NAME}: launching {agent_type} as profile {name!r} "
        f"(mount: {pdir} → {rdir})",
        file=sys.stderr,
    )

    import subprocess as _sp

    mode = config.MODE_RESUME if extra_args else config.MODE_NEW
    pid = os.getpid()
    sid = sessions.record_launch(name, agent_type, os.getcwd(), mode, pid)

    # Use subprocess instead of execvpe so we can record exit
    proc = _sp.Popen(argv, env=env)
    exit_code = proc.wait()
    sessions.record_exit(sid, exit_code)
    # Exit with the same code so the shell script can report failures
    raise SystemExit(exit_code)
