"""Launch CC inside a bwrap namespace that bind-mounts the profile's
`dot-claude/` over the real `~/.claude/`.

The launch is a single `os.execvpe("bwrap", [...], env)` — bwrap replaces our
process, then runs `claude` as its child. This preserves our PID, tty, and
signal handlers (so Ctrl-C still goes to CC).
"""
from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path
from typing import Dict, List, Optional

from . import config
from . import profile


def _load_settings_env(dot_claude: Path) -> Dict[str, str]:
    """Return the `env` block from a profile's settings.json (or {})."""
    settings_path = dot_claude / "settings.json"
    if not settings_path.is_file():
        return {}
    try:
        data = json.loads(settings_path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        print(
            f"warning: failed to read {settings_path}: {exc}",
            file=sys.stderr,
        )
        return {}
    env = data.get("env") or {}
    if not isinstance(env, dict):
        return {}
    return {str(k): str(v) for k, v in env.items()}


def _resolve_on_path(name: str, install_hint: str) -> str:
    found = shutil.which(name)
    if not found:
        raise profile.ProfileError(
            f"{name} not found in PATH. {install_hint}"
        )
    return found


def build_bwrap_argv(
    profile_dot_claude: Path,
    profile_dot_claude_json: Path,
    real_claude_dir: Path,
    real_claude_json: Path,
    claude_argv: List[str],
) -> List[str]:
    """Build the argv list passed to bwrap.

    bwrap needs the real ~/.claude/ and ~/.claude.json paths to exist (it
    bind-mounts on top of them). If they don't, create empty placeholders
    in a temp dir and bind that in — the host's real files are never
    modified (init-template is the only thing that reads them, and only
    to produce the template, never to write).
    """
    if not profile_dot_claude.is_dir():
        raise profile.ProfileError(
            f"profile dot-claude dir missing: {profile_dot_claude}"
        )
    if not profile_dot_claude_json.is_file():
        raise profile.ProfileError(
            f"profile dot-claude.json missing: {profile_dot_claude_json}"
        )

    # Ensure real ~/.claude/ and ~/.claude.json exist as bwrap mount points.
    # We do NOT touch the host's real files if they exist.
    if not real_claude_dir.exists():
        real_claude_dir.mkdir(parents=True, exist_ok=True)
    if not real_claude_json.exists():
        real_claude_json.touch()

    return [
        config.BWRAP,
        "--bind", "/", "/",
        "--bind", str(profile_dot_claude), str(real_claude_dir),
        "--bind", str(profile_dot_claude_json), str(real_claude_json),
        "--dev", "/dev",
        "--proc", "/proc",
        "--tmpfs", "/tmp",
        "--unshare-all",
        "--share-net",
        *claude_argv,
    ]


def build_child_env(settings_env: Dict[str, str]) -> Dict[str, str]:
    """Build the env dict for the bwrap/claude child process.

    We start from the current environment (so PATH, LANG, TMPDIR, etc.
    reach CC) and overlay the settings.json `env` block. The `HOME`
    variable is left pointing at the real host home so bwrap can resolve
    the bind-mount target paths; bwrap then enters the namespace and the
    child sees the bind-mounted `~/.claude/`.
    """
    env = dict(os.environ)
    for key, value in settings_env.items():
        # Don't propagate placeholders — let the user notice and fix.
        if value == "" or value == "sk-REPLACE_ME":
            continue
        env[key] = value
    return env


def launch_cc(name: str, project_dir: Optional[Path] = None) -> None:
    """Bind-mount the profile's dot-claude/ and exec bwrap -> claude.

    Never returns on success (execvpe replaces the process). Raises
    ProfileError on any failure.
    """
    meta = profile.load_meta(name)
    if meta.get("agent_type") != config.AGENT_TYPE_CC:
        raise profile.ProfileError(
            f"{name}: agent_type={meta.get('agent_type')!r} is not supported "
            f"by `cc` (only {config.AGENT_TYPE_CC!r})"
        )

    pdc = config.profile_dot_claude(name)
    pdj = config.profile_dot_claude_json(name)
    if not pdc.is_dir():
        raise profile.ProfileError(
            f"{name}: dot-claude/ missing at {pdc}. "
            f"Try: agent-box delete {name} && agent-box create {name} --provider <p>"
        )
    if not pdj.is_file():
        raise profile.ProfileError(
            f"{name}: dot-claude.json missing at {pdj}. "
            f"Try: agent-box delete {name} && agent-box create {name} --provider <p>"
        )

    claude = _resolve_on_path(
        config.CLAUDE_BIN,
        "Install with: npm install -g @anthropic-ai/claude-code",
    )
    bwrap = _resolve_on_path(
        config.BWRAP,
        "Install with: sudo apt install bubblewrap (or equivalent for your distro)",
    )

    if project_dir is not None:
        project_dir = project_dir.expanduser().resolve()
        if not project_dir.is_dir():
            raise profile.ProfileError(
                f"project directory not found: {project_dir}"
            )
        os.chdir(project_dir)

    claude_argv = [claude]
    # `--cwd` is also available on CC, but the user asked for shell chdir
    # which is the more general mechanism. Keep claude_argv minimal here.

    argv = build_bwrap_argv(
        profile_dot_claude=pdc,
        profile_dot_claude_json=pdj,
        real_claude_dir=config.real_claude_dir(),
        real_claude_json=config.real_claude_json(),
        claude_argv=claude_argv,
    )

    settings_env = _load_settings_env(pdc)
    env = build_child_env(settings_env)

    # Helpful breadcrumb on stderr so the user knows which profile is live.
    print(
        f"agent-box: launching CC as profile {name!r} "
        f"(provider={meta.get('provider')!r}, bwrap mount={pdc})",
        file=sys.stderr,
    )

    # Resolve bwrap to its absolute path while keeping the argv[0] as "bwrap"
    # so PATH lookups inside the namespace are unaffected. argv[0] for the
    # exec target is the absolute path of bwrap.
    os.execvpe(bwrap, argv, env)
    # execvpe only returns on failure.
    raise profile.ProfileError(f"failed to exec {bwrap}")
