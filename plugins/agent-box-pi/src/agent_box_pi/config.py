"""Pi plugin configuration — non-secret, plugin-owned.

The Pi/DeepSeek long-term configuration (binary, exact model id, thinking
level, version/update policy, agent/session/evidence roots) lives here, never
in an Execution Binding.  Credentials are intentionally absent: the provider
only references ``DEEPSEEK_API_KEY`` from the launching environment or Pi's own
auth source inside the plugin-owned ``agent_dir``.
"""
from __future__ import annotations

import json
import os
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Mapping

from agent_box import config as agent_box_config

PACKAGE = "pi"
CONFIG_FILE_NAME = "config.json"

PROVIDER = "deepseek"
THINKING_LEVELS = ("off", "minimal", "low", "medium", "high", "xhigh", "max")
UPDATE_POLICIES = ("pinned",)
BARE_MODEL_IDS = ("deepseek-v4-flash", "deepseek-v4-pro")
SUPPORTED_MODEL_PATTERNS = frozenset(
    {f"deepseek/{model}" for model in BARE_MODEL_IDS} | set(BARE_MODEL_IDS)
)

# Keys that may appear in config.json.  Nothing secret is ever accepted.
_CONFIG_KEYS = frozenset(
    {
        "binary",
        "provider",
        "model",
        "thinking",
        "version",
        "update_policy",
        "agent_dir",
        "session_root",
        "evidence_root",
        "offline",
    }
)


def plugin_config_dir() -> Path:
    """``$AGENT_BOX_HOME/plugins/pi`` — the plugin's configuration directory."""
    return agent_box_config.agent_box_home() / "plugins" / PACKAGE


def plugin_config_file() -> Path:
    return plugin_config_dir() / CONFIG_FILE_NAME


class PiConfigError(ValueError):
    """A Pi plugin configuration problem surfaced at first use, not discovery."""


@dataclass(frozen=True)
class PiPluginConfig:
    binary: str
    model: str = "deepseek/deepseek-v4-flash"
    provider: str = PROVIDER
    thinking: str = "high"
    version: str = "0.84.3"
    update_policy: str = "pinned"
    agent_dir: Path | None = None
    session_root: Path | None = None
    evidence_root: Path | None = None
    offline: bool = False
    source: Path | None = None
    extra: Mapping[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.provider != PROVIDER:
            raise PiConfigError(
                f"Pi plugin config only supports provider 'deepseek', got {self.provider!r}"
            )
        if self.update_policy not in UPDATE_POLICIES:
            raise PiConfigError(
                f"Pi update_policy must be one of {UPDATE_POLICIES}, got {self.update_policy!r}"
            )
        if self.thinking not in THINKING_LEVELS:
            raise PiConfigError(
                f"Pi thinking must be one of {THINKING_LEVELS}, got {self.thinking!r}"
            )
        if self.model not in SUPPORTED_MODEL_PATTERNS:
            raise PiConfigError(
                "Pi plugin config model must be a current documented DeepSeek id "
                f"from {sorted(SUPPORTED_MODEL_PATTERNS)}, got {self.model!r}"
            )
        if not self.binary.strip():
            raise PiConfigError("Pi plugin config binary is required")
        if self.binary not in {"pi"} and not Path(self.binary).is_absolute():
            raise PiConfigError("Pi plugin config binary must be 'pi' or an absolute path")

    @property
    def resolved_binary(self) -> str:
        """Executable path (or 'pi' resolved through PATH) validated at use time."""
        if self.binary == "pi":
            return shutil.which("pi") or "pi"
        return self.binary

    @property
    def canonical_model(self) -> str:
        return self.model if "/" in self.model else f"deepseek/{self.model}"

    @property
    def resolved_agent_dir(self) -> Path:
        return (self.agent_dir or (plugin_config_dir() / "agent")).resolve()

    @property
    def resolved_session_root(self) -> Path:
        return (self.session_root or (plugin_config_dir() / "sessions")).resolve()

    @property
    def resolved_evidence_root(self) -> Path:
        return (self.evidence_root or (plugin_config_dir() / "evidence")).resolve()

    def to_json_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "binary": self.binary,
            "provider": self.provider,
            "model": self.model,
            "thinking": self.thinking,
            "version": self.version,
            "update_policy": self.update_policy,
        }
        if self.agent_dir is not None:
            data["agent_dir"] = str(self.agent_dir)
        if self.session_root is not None:
            data["session_root"] = str(self.session_root)
        if self.evidence_root is not None:
            data["evidence_root"] = str(self.evidence_root)
        if self.offline:
            data["offline"] = True
        return data

    @classmethod
    def load(cls, path: Path | None = None, *, env: Mapping[str, str] | None = None) -> "PiPluginConfig":
        env = dict(os.environ if env is None else env)
        target = Path(path) if path is not None else plugin_config_file()
        if not target.is_file():
            raise PiConfigError(
                f"Pi plugin config not found at {target}. Create it with "
                "agent-box-pi setup or point binary/model/version in it first."
            )
        try:
            raw = json.loads(target.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise PiConfigError(f"Pi plugin config is not valid JSON: {target}: {exc}") from exc
        if not isinstance(raw, dict):
            raise PiConfigError(f"Pi plugin config must be a JSON object: {target}")
        unknown = set(raw).difference(_CONFIG_KEYS)
        if unknown:
            raise PiConfigError(f"Pi plugin config has unknown keys: {sorted(unknown)}")
        extra = {key: str(value) for key, value in raw.items() if key not in {"binary"}}
        if "offline" in raw and isinstance(raw["offline"], bool):
            extra.pop("offline")
        binary = raw.get("binary", "pi")
        return cls(
            binary=str(binary),
            provider=str(raw.get("provider", PROVIDER)),
            model=str(raw.get("model", "deepseek/deepseek-v4-flash")),
            thinking=str(raw.get("thinking", "high")),
            version=str(raw.get("version", "0.84.3")),
            update_policy=str(raw.get("update_policy", "pinned")),
            agent_dir=Path(raw["agent_dir"]).expanduser() if raw.get("agent_dir") else None,
            session_root=Path(raw["session_root"]).expanduser() if raw.get("session_root") else None,
            evidence_root=Path(raw["evidence_root"]).expanduser() if raw.get("evidence_root") else None,
            offline=bool(raw.get("offline", False)),
            source=target,
            extra=extra,
        )

    @classmethod
    def defaults(cls, *, binary: str = "pi", version: str = "0.84.3") -> "PiPluginConfig":
        """A validated default config used when materializing setup files."""
        return cls(binary=binary, version=version)

    def verify_installed_version(self, stdout: str | None = None) -> None:
        """Compare the pinned version with an installed ``pi --version`` output.

        Called lazily at start; a drift is a configuration error, never a
        reason to mutate the pinned checkout during an Execution.
        """
        if stdout is None:
            return
        actual = stdout.strip().splitlines()[0].strip() if stdout.strip() else ""
        if actual and actual.splitlines()[0].strip() != self.version:
            raise PiConfigError(
                f"Pi installed version {actual} differs from pinned config "
                f"version {self.version}"
            )


def materialize_default_config(binary: str = "pi", version: str = "0.84.3") -> Path:
    """Write a valid non-secret default config and return its path.

    Only used by setup tooling / preview seeding; provider start never writes
    config.  Fails atomically if an existing config is present.
    """
    target = plugin_config_file()
    if target.exists():
        raise PiConfigError(f"Pi plugin config already exists: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = PiPluginConfig.defaults(binary=binary, version=version).to_json_dict()
    target.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    target.chmod(0o600)
    return target


__all__ = [
    "CONFIG_FILE_NAME",
    "PACKAGE",
    "PiConfigError",
    "PiPluginConfig",
    "materialize_default_config",
    "plugin_config_dir",
    "plugin_config_file",
]