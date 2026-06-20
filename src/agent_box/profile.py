"""Profile lifecycle: init-template, create, list, delete, show, meta IO.

The on-disk layout is documented in `config.py`. Two main operations:

* `init_template()` — read the host's *real* `~/.claude/`, strip
  per-user secrets (env, permissions, _marker), and persist a clean
  template at $AGENT_BOX_HOME/template/.

* `create(name, provider)` — copy that template into
  $AGENT_BOX_HOME/profiles/<name>/, inject the provider's settings
  into settings.json's `env` block, write CLAUDE.md, and emit
  meta.yaml.
"""
from __future__ import annotations

import datetime
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import config
from . import library as _lib
from . import providers  # legacy view (still used by `show`)


class ProfileError(Exception):
    """Raised for any profile-level operation failure."""


# --- meta.yaml (tiny stdlib YAML subset) -----------------------------------

def _meta_to_yaml(meta: Dict[str, str]) -> str:
    """Serialize a flat dict to a tiny YAML subset (string scalars only)."""
    lines = []
    for k, v in meta.items():
        if not isinstance(v, str):
            raise ProfileError(f"meta field {k!r} must be a string")
        # Conservative scalar quoting.
        if any(c in v for c in [":", "#", "\n", '"', "'"]) or v.strip() != v:
            esc = v.replace("'", "''")
            lines.append(f"{k}: '{esc}'")
        else:
            lines.append(f"{k}: {v}")
    return "\n".join(lines) + "\n"


def _parse_simple_yaml(text: str) -> Dict[str, str]:
    """Parse the very small YAML subset used in meta.yaml.

    Supports: `key: value` lines, blank lines, `# comments`. Values are taken
    verbatim after the first colon. Quoted values are unwrapped. NOT a full
    YAML parser on purpose.
    """
    out: Dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            raise ProfileError(f"malformed meta.yaml line: {raw!r}")
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if (
            len(value) >= 2
            and value[0] in ("'", '"')
            and value[-1] == value[0]
        ):
            value = value[1:-1]
        out[key] = value
    return out


def write_meta(profile_root: Path, meta: Dict[str, str]) -> None:
    profile_root.mkdir(parents=True, exist_ok=True)
    (profile_root / "meta.yaml").write_text(_meta_to_yaml(meta))


def load_meta(name: str) -> Dict[str, str]:
    meta_file = config.profile_meta(name)
    if not meta_file.is_file():
        raise ProfileError(
            f"{name}: meta.yaml missing. Try: agent-box create {name} --provider <p>"
        )
    try:
        data = _parse_simple_yaml(meta_file.read_text())
    except OSError as exc:
        raise ProfileError(f"{name}: meta.yaml unreadable: {exc}") from exc
    for required in ("name", "agent_type", "provider"):
        if required not in data:
            raise ProfileError(
                f"{name}: meta.yaml corrupted (missing {required!r}). "
                f"Try: agent-box delete {name} && agent-box create {name}"
            )
    if data["name"] != name:
        raise ProfileError(
            f"{name}: meta.yaml name mismatch ({data['name']!r}). "
            f"Try: agent-box delete {name} && agent-box create {name}"
        )
    return data


# --- file helpers ----------------------------------------------------------

def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text())


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def _load_template_settings() -> Dict[str, Any]:
    """Return the baseline settings.json for a new profile.

    Starts from ``library._TEMPLATE_SETTINGS`` (the canonical built-in
    template). If a legacy ``$AGENT_BOX_HOME/template/dot-claude/settings.json``
    exists from a pre-v0.4.0 ``init-template`` run, the constants are
    treated as defaults and that file's keys overlay on top — so a
    user's custom template customisations survive the upgrade.

    If the legacy file is unreadable / unparsable, we silently fall
    back to the constants (the warning is logged to stderr so a stray
    broken file can't break `create`).
    """
    from . import library
    settings = dict(library._TEMPLATE_SETTINGS)
    legacy = config.template_dir() / "dot-claude" / "settings.json"
    if legacy.is_file():
        try:
            data = json.loads(legacy.read_text())
        except (OSError, json.JSONDecodeError) as exc:
            print(
                f"agent-box: warning: legacy template at {legacy} is "
                f"unreadable ({exc}); using built-in defaults",
                file=sys.stderr,
            )
            data = None
        if isinstance(data, dict):
            # Library constants are defaults; legacy file wins on conflicts.
            for k, v in data.items():
                settings[k] = v
    return settings


def _copy_dir(src: Path, dst: Path) -> None:
    """Recursively copy `src` into `dst` (both must be directories).

    Symlinks are preserved (not followed), so the template's `skills/`
    symlink survives into the new profile.
    """
    if not src.is_dir():
        raise ProfileError(f"copy source not a directory: {src}")
    if dst.exists():
        raise ProfileError(f"copy destination already exists: {dst}")
    shutil.copytree(src, dst, symlinks=True)


def _try_symlink(src: Path, dst: Path) -> None:
    """Create a symlink at `dst` pointing to `src` if the source exists.

    No-op if the source doesn't exist (avoids breaking init-template on a
    host that has no ~/.claude/skills yet).
    """
    if not src.exists():
        return
    if dst.is_symlink() or dst.exists():
        # Refresh the link if something stale is there.
        if dst.is_symlink() or dst.is_file():
            dst.unlink()
        else:
            shutil.rmtree(dst)
    os.symlink(str(src), str(dst))


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


# --- init-template ---------------------------------------------------------

# Keys stripped from the host's settings.json when building the template.
# Everything else (theme, plugins, marketplaces, autoCompactThreshold, etc.)
# is preserved as generic user preference.
_TEMPLATE_STRIP_KEYS = {
    "env",          # provider-specific base URLs and API keys
    "permissions",  # per-machine allow/deny
    "_marker",      # our own bookkeeping, if any
}

# Keys stripped from the host's .claude.json when building the template.
_DOT_CLAUDE_JSON_STRIP_KEYS = {
    "mcpServers",  # may reference host-local binaries/paths
    "oauthAccount",
}


def init_template(force: bool = False) -> Path:
    """Create the base template from the host's *real* ~/.claude/.

    The host files are read but never written. Secrets and machine-local
    blocks (`env`, `permissions`, `mcpServers`, ...) are stripped.

    Args:
        force: If True, overwrite an existing template directory.

    Returns:
        The template root path.
    """
    tpl_root = config.template_dir()
    if tpl_root.exists():
        if not force:
            raise ProfileError(
                f"template already exists at {tpl_root}. "
                f"Re-run with force=True to overwrite."
            )
        shutil.rmtree(tpl_root)

    tpl_root.mkdir(parents=True)
    tpl_dot_claude = config.template_dot_claude()
    tpl_dot_claude.mkdir(parents=True)

    # 1) settings.json (from real ~/.claude/settings.json) ---------------
    real_settings = config.real_claude_dir() / "settings.json"
    if real_settings.is_file():
        try:
            data = _read_json(real_settings)
        except (OSError, json.JSONDecodeError) as exc:
            raise ProfileError(f"failed to read {real_settings}: {exc}") from exc
        for k in _TEMPLATE_STRIP_KEYS:
            data.pop(k, None)
    else:
        # No real settings.json yet — emit a clean default.
        data = {}
    _write_json(tpl_dot_claude / "settings.json", data)

    # 2) settings.local.json (always empty {}) ---------------------------
    _write_json(tpl_dot_claude / "settings.local.json", {})

    # 3) CLAUDE.md (empty) -----------------------------------------------
    (tpl_dot_claude / "CLAUDE.md").write_text("")

    # 4) commands/ (empty) -----------------------------------------------
    _ensure_dir(tpl_dot_claude / "commands")

    # 5) skills/ -> ~/.claude/skills (best-effort symlink) ---------------
    _try_symlink(config.real_claude_dir() / "skills", tpl_dot_claude / "skills")

    # 6) dot-claude.json (from real ~/.claude.json) ----------------------
    real_dot_json = config.real_claude_json()
    if real_dot_json.is_file():
        try:
            top = _read_json(real_dot_json)
        except (OSError, json.JSONDecodeError) as exc:
            raise ProfileError(f"failed to read {real_dot_json}: {exc}") from exc
        for k in _DOT_CLAUDE_JSON_STRIP_KEYS:
            top.pop(k, None)
    else:
        top = {"hasCompletedOnboarding": True}
    top.setdefault("hasCompletedOnboarding", True)
    _write_json(config.template_dot_claude_json(), top)

    return tpl_root


def ensure_template() -> Path:
    """Return the template path, running init_template() if it doesn't exist."""
    tpl_root = config.template_dir()
    if not tpl_root.is_dir():
        init_template()
    return tpl_root


# --- create ----------------------------------------------------------------

def _inject_provider_env(settings_path: Path, provider: str) -> None:
    """Read settings.json, replace the `env` block with the provider's defaults.

    The env block comes from the merged library view (template + user
    overrides). Unknown provider ids raise ProfileError.
    """
    env = _lib.get_provider_env(provider)
    if env is None:
        raise ProfileError(
            f"unknown provider {provider!r}. "
            f"Run 'agent-box component list --type provider' for the list."
        )
    try:
        data = _read_json(settings_path)
    except (OSError, json.JSONDecodeError) as exc:
        raise ProfileError(f"failed to read {settings_path}: {exc}") from exc
    data["env"] = env
    _write_json(settings_path, data)


def apply_provider(name: str, provider: str) -> None:
    """Replace a profile's settings.json `env` block with `provider`'s env.

    Equivalent to running `agent-box create <name> --provider <provider>`
    on the env block alone — the rest of the profile (CLAUDE.md,
    settings.local.json, etc.) is left untouched.
    """
    config.validate_profile_name(name)
    root = config.profile_dir(name)
    if not root.is_dir():
        raise ProfileError(
            f"{name!r}: profile not found at {root}. "
            f"Run 'agent-box list' to see available profiles."
        )
    _inject_provider_env(config.profile_settings_json(name), provider)
    # Update meta.yaml so `agent-box list` / `show` reflect the new
    # provider without requiring a separate edit.
    meta = load_meta(name)
    meta["provider"] = provider
    write_meta(root, meta)


def create(name: str, provider: str) -> Path:
    config.validate_profile_name(name)
    # v0.2.0: provider resolution is library-driven. `providers.get(name)`
    # looks up the library first, then the hard-coded fallback. If the
    # name is unknown to both, raise with a hint to the new component command.
    try:
        providers.get(provider)
    except KeyError:
        try:
            from . import library
            n = len(library.list_components(type="provider"))
        except Exception:
            n = 0
        sample = list(config.supported_providers())[:8]
        raise ProfileError(
            f"unsupported provider {provider!r}. "
            f"Run \'agent-box component list --type provider\' "
            f"({n} available, e.g. {', '.join(sample)}). "
            f"To add a custom provider: agent-box component add --type provider --id <id> --config '{{...}}'."
        )

    root = config.profile_dir(name)
    if root.exists():
        raise ProfileError(
            f"profile {name!r} already exists at {root}. "
            f"Use: agent-box delete {name} first"
        )

    # 1) settings.json = library template constants (+ optional legacy
    #    overlay) + provider env block
    from . import library
    settings = _load_template_settings()
    settings["env"] = _lib.get_provider_env(provider)
    if settings["env"] is None:
        raise ProfileError(
            f"unknown provider {provider!r}. "
            f"Run 'agent-box component list --type provider' for the list."
        )

    # 2) build per-profile files from the rest of the constants
    settings_local = dict(library._TEMPLATE_SETTINGS_LOCAL)
    claude_md = library._TEMPLATE_CLAUDE_MD.format(
        name=name,
        date=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    )
    dot_claude_json = dict(library._TEMPLATE_CLAUDE_JSON)

    # 3) write everything
    pdc = config.profile_dot_claude(name)
    _write_json(config.profile_settings_json(name), settings)
    _write_json(config.profile_settings_local_json(name), settings_local)
    _write_text(config.profile_claude_md(name), claude_md)
    _write_json(config.profile_dot_claude_json(name), dot_claude_json)
    (pdc / "commands").mkdir(exist_ok=True)
    # skills -> best-effort symlink to host's skills dir
    real_skills = config.real_claude_dir() / "skills"
    profile_skills = pdc / "skills"
    if real_skills.exists() and not profile_skills.exists():
        profile_skills.symlink_to(real_skills)

    # 4) meta.yaml
    write_meta(
        root,
        {
            "name": name,
            "agent_type": config.AGENT_TYPE_CC,
            "provider": provider,
        },
    )

    return root


# --- list / show / delete --------------------------------------------------

def list_profiles() -> List[Dict[str, str]]:
    pdir = config.profiles_dir()
    if not pdir.is_dir():
        return []
    out: List[Dict[str, str]] = []
    for entry in sorted(pdir.iterdir(), key=lambda p: p.name):
        if not entry.is_dir():
            continue
        meta_file = entry / "meta.yaml"
        if not meta_file.is_file():
            # Skip junk directories silently.
            continue
        try:
            meta = _parse_simple_yaml(meta_file.read_text())
        except (OSError, ProfileError):
            continue
        out.append(
            {
                "name": meta.get("name", entry.name),
                "agent_type": meta.get("agent_type", "?"),
                "provider": meta.get("provider", "?"),
            }
        )
    return out


def show(name: str) -> Dict[str, Any]:
    config.validate_profile_name(name)
    root = config.profile_dir(name)
    if not root.is_dir():
        raise ProfileError(f"{name}: profile not found at {root}")
    meta = load_meta(name)

    # Best-effort: surface the model + base URL the CC process will see.
    info: Dict[str, Any] = {
        "path": str(root),
        "meta": meta,
    }
    try:
        info["provider"] = providers.describe(meta["provider"])
    except KeyError:
        info["provider"] = None

    settings_path = config.profile_dot_claude(name) / "settings.json"
    if settings_path.is_file():
        try:
            data = _read_json(settings_path)
            env = data.get("env") or {}
            if isinstance(env, dict):
                info["model"] = env.get("ANTHROPIC_MODEL")
                info["base_url"] = env.get("ANTHROPIC_BASE_URL")
        except (OSError, json.JSONDecodeError):
            pass
    return info


def delete(name: str, force: bool = False) -> bool:
    config.validate_profile_name(name)
    root = config.profile_dir(name)
    if not root.exists():
        raise ProfileError(f"{name}: profile not found at {root}")
    if not force:
        confirm = input(f"Delete profile {name!r} at {root}? [y/N] ").strip().lower()
        if confirm not in ("y", "yes"):
            print("aborted.", file=sys.stderr)
            return False
    shutil.rmtree(root)
    return True


# --- config get/set + connection test (used by `config` / `test` cmds) ----

import tempfile
import urllib.error
import urllib.request


# ---- key alias / masking helpers ----

_KEY_ALIASES = {
    "api-key": ("env", "ANTHROPIC_AUTH_TOKEN"),
    "key": ("env", "ANTHROPIC_AUTH_TOKEN"),
    "model": ("env", "ANTHROPIC_MODEL"),
    "base-url": ("env", "ANTHROPIC_BASE_URL"),
    "timeout": ("env", "API_TIMEOUT_MS"),
}

_MASKED_KEYS = {"ANTHROPIC_AUTH_TOKEN", "api-key", "key"}

_SENTINEL = object()


def _resolve_key(key: str) -> tuple:
    """Return ((path, segments...), is_masked) for a user-facing key."""
    alias = _KEY_ALIASES.get(key)
    if alias:
        return alias, key in _MASKED_KEYS
    return tuple(key.split(".")), any(
        k in _MASKED_KEYS for k in (key, key.rsplit(".", 1)[-1] if "." in key else key)
    )


def _nested_get(data: dict, keys: tuple):
    for k in keys:
        if not isinstance(data, dict) or k not in data:
            return _SENTINEL
        data = data[k]
    return data


def _nested_set(data: dict, keys: tuple, value: object) -> dict:
    current = data
    for k in keys[:-1]:
        if k not in current or not isinstance(current[k], dict):
            current[k] = {}
        current = current[k]
    current[keys[-1]] = value
    return data


def _parse_value(raw: str):
    if raw is None:
        return None
    low = raw.lower()
    if low in ("true", "false"):
        return low == "true"
    if low in ("null", "none"):
        return None
    try:
        return int(raw)
    except ValueError:
        pass
    try:
        return float(raw)
    except ValueError:
        pass
    return raw


def _mask_value(key: str, value) -> str:
    s = str(value)
    if len(s) <= 8:
        return "*" * len(s)
    return s[:3] + "..." + s[-4:]


def _is_secret_key(k: str) -> bool:
    upper = k.upper()
    return "TOKEN" in upper or "KEY" in upper or "SECRET" in upper


# ---- public API ----

def read_settings(name: str) -> dict:
    path = config.profile_settings_json(name)
    if not path.exists():
        raise ProfileError(f"{name}: settings.json not found at {path}")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except json.JSONDecodeError as exc:
        raise ProfileError(f"{name}: settings.json is corrupted: {exc}")


def write_settings(name: str, data: dict) -> None:
    path = config.profile_settings_json(name)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".settings-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        os.replace(tmp, str(path))
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def get_config(name: str, key: str) -> str:
    data = read_settings(name)
    keys, is_masked = _resolve_key(key)
    value = _nested_get(data, keys)
    if value is _SENTINEL:
        return None
    if is_masked:
        return _mask_value(key, value)
    if isinstance(value, (dict, list)):
        return json.dumps(value, indent=2, ensure_ascii=False)
    return str(value)


def set_config(name: str, key: str, value: str) -> bool:
    data = read_settings(name)
    keys, _ = _resolve_key(key)
    parsed = _parse_value(value)
    old = _nested_get(data, keys)
    if old is not _SENTINEL and old == parsed:
        return False
    _nested_set(data, keys, parsed)
    write_settings(name, data)
    return True


def pretty_config(name: str) -> str:
    data = read_settings(name)
    lines = []
    env = data.get("env", {})
    if env:
        lines.append("[env]")
        for k, v in env.items():
            if _is_secret_key(k):
                lines.append(f"  {k} = {_mask_value(k, v)}")
            else:
                lines.append(f"  {k} = {v}")
    other = {k: v for k, v in data.items() if k != "env"}
    if other:
        if lines:
            lines.append("")
        lines.append("[settings]")
        for k, v in other.items():
            if isinstance(v, (dict, list)):
                lines.append(f"  {k} = {json.dumps(v)}")
            else:
                lines.append(f"  {k} = {v}")
    return "\n".join(lines)


def test_connection(name: str) -> tuple:
    """
    Test API connectivity. Returns (ok: bool, message: str).
    """
    data = read_settings(name)
    env = data.get("env", {})
    base_url = (env.get("ANTHROPIC_BASE_URL") or "https://api.anthropic.com").rstrip("/")
    api_key = env.get("ANTHROPIC_AUTH_TOKEN") or ""
    model = env.get("ANTHROPIC_MODEL") or "claude-sonnet-4-6"

    if not api_key or api_key.startswith("sk-REPLACE"):
        return False, (
            "API key not set (still placeholder). "
            "Run: agent-box config <name> api-key <your-key>"
        )

    url = f"{base_url}/v1/messages"
    body = json.dumps({
        "model": model,
        "max_tokens": 1,
        "messages": [{"role": "user", "content": "hi"}],
    }).encode("utf-8")

    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("x-api-key", api_key)
    req.add_header("anthropic-version", "2023-06-01")

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status == 200:
                return True, f"OK — model={model}, endpoint={base_url}"
            return False, f"Unexpected status {resp.status}"
    except urllib.error.HTTPError as exc:
        body_text = ""
        try:
            body_text = exc.read().decode("utf-8", errors="replace")[:300]
        except Exception:
            pass
        if exc.code == 401:
            return False, "401 Unauthorized — API key is invalid or expired"
        if exc.code == 403:
            return False, "403 Forbidden — API key lacks permission"
        if exc.code == 404:
            return False, f"404 Not Found — endpoint or model ({url})"
        return False, f"HTTP {exc.code}: {body_text or str(exc)}"
    except urllib.error.URLError as exc:
        reason = str(exc.reason) if exc.reason else str(exc)
        return False, f"Connection failed: {reason}"
    except OSError as exc:
        return False, f"Network error: {exc}"
