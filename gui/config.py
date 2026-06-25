"""Configuration reader for different agent types.

Reads and parses configuration files for CC, Codex, Hermes, and OpenCode.
Based on cc-switch's configuration handling patterns.

Each agent type has different config formats:
- CC:       settings.json (JSON)
- Codex:    config.toml (TOML) + auth.json (JSON)
- Hermes:   config.yaml (YAML)
- OpenCode: opencode.jsonc (JSON5/JSONC)
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Agent type → config directory mapping
# ---------------------------------------------------------------------------

CONFIG_DIR_NAMES: Dict[str, str] = {
    "claude":   "dot-claude",
    "cc":       "dot-claude",  # deprecated key, kept for back-compat
    "codex":    "dot-codex",
    "hermes":   "dot-hermes",
    "opencode": "dot-opencode",
}

# Data directory (separate from config for some agents)
DATA_DIR_NAMES: Dict[str, Optional[str]] = {
    "claude":   None,
    "cc":       None,  # deprecated key
    "codex":    None,
    "hermes":   None,
    "opencode": "dot-opencode-data",
}


def get_config_dir(profile_root: Path, agent_type: str) -> Path:
    """Get the config directory for a profile."""
    dir_name = CONFIG_DIR_NAMES.get(agent_type, "dot-claude")
    return profile_root / dir_name


def get_data_dir(profile_root: Path, agent_type: str) -> Optional[Path]:
    """Get the data directory for a profile (if applicable)."""
    dir_name = DATA_DIR_NAMES.get(agent_type)
    if dir_name:
        return profile_root / dir_name
    return None


# ---------------------------------------------------------------------------
# Generic file readers
# ---------------------------------------------------------------------------

def _read_file_via_wsl(path: Path) -> Optional[str]:
    """Read a file from WSL using wsl.exe cat."""
    import shutil
    import subprocess
    import sys

    wsl = shutil.which("wsl.exe")
    if not wsl:
        return None

    # On Windows, hide the console window
    kwargs = {}
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW

    # Use forward slashes for WSL paths (critical for Windows)
    wsl_path = path.as_posix() if hasattr(path, 'as_posix') else str(path).replace('\\', '/')

    try:
        proc = subprocess.run(
            [wsl, "cat", wsl_path],
            capture_output=True, timeout=5,
            **kwargs,
        )
        if proc.returncode == 0:
            return proc.stdout.decode("utf-8", errors="replace")
        return None
    except (subprocess.TimeoutExpired, OSError):
        return None


def _read_file_content(path: Path) -> Optional[str]:
    """Read file content.

    On Windows: always use wsl.exe (paths are WSL-side paths).
    On Linux: direct file access.
    """
    import platform

    # On Windows, always use wsl.exe
    if platform.system() == "Windows":
        return _read_file_via_wsl(path)

    # On Linux/WSL, direct access
    if path.exists():
        try:
            return path.read_text(encoding="utf-8")
        except OSError:
            pass

    return None


def read_json_file(path: Path) -> Optional[Dict[str, Any]]:
    """Read and parse a JSON file."""
    content = _read_file_content(path)
    if content is None:
        return None
    try:
        return json.loads(content)
    except (json.JSONDecodeError, ValueError):
        return None


def read_text_file(path: Path) -> Optional[str]:
    """Read a text file."""
    return _read_file_content(path)


def read_toml_file(path: Path) -> Optional[Dict[str, Any]]:
    """Read and parse a TOML file."""
    content = _read_file_content(path)
    if content is None:
        return None
    try:
        import tomllib
        return tomllib.loads(content)
    except (ImportError, Exception):
        # Fallback: try toml package
        try:
            import toml
            return toml.loads(content)
        except Exception:
            return None


def read_yaml_file(path: Path) -> Optional[Dict[str, Any]]:
    """Read and parse a YAML file."""
    content = _read_file_content(path)
    if content is None:
        return None
    try:
        import yaml
        return yaml.safe_load(content)
    except (ImportError, Exception):
        return None


def read_jsonc_file(path: Path) -> Optional[Dict[str, Any]]:
    """Read and parse a JSONC/JSON5 file (strips comments)."""
    content = _read_file_content(path)
    if content is None:
        return None
    try:
        # Strip single-line comments (but not URLs like https://)
        # Only match // that is NOT preceded by : (which would be part of a URL)
        content = re.sub(r'(?<!:)//.*$', '', content, flags=re.MULTILINE)
        # Strip multi-line comments
        content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
        return json.loads(content)
    except (json.JSONDecodeError, ValueError):
        return None


def list_dir_via_wsl(dir_path: Path) -> List[str]:
    """List directory contents using wsl.exe ls."""
    import shutil
    import subprocess
    import sys

    wsl = shutil.which("wsl.exe")
    if not wsl:
        return []

    # On Windows, hide the console window
    kwargs = {}
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW

    # Use forward slashes for WSL paths
    wsl_path = dir_path.as_posix() if hasattr(dir_path, 'as_posix') else str(dir_path).replace('\\', '/')

    try:
        proc = subprocess.run(
            [wsl, "ls", "-1", wsl_path],
            capture_output=True, timeout=5,
            **kwargs,
        )
        if proc.returncode == 0:
            output = proc.stdout.decode("utf-8", errors="replace")
            return [name for name in output.strip().split("\n") if name]
        return []
    except (subprocess.TimeoutExpired, OSError):
        return []


def dir_exists_via_wsl(dir_path: Path) -> bool:
    """Check if directory exists using wsl.exe."""
    import shutil
    import subprocess
    import sys

    wsl = shutil.which("wsl.exe")
    if not wsl:
        return False

    # On Windows, hide the console window
    kwargs = {}
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW

    # Use forward slashes for WSL paths
    wsl_path = dir_path.as_posix() if hasattr(dir_path, 'as_posix') else str(dir_path).replace('\\', '/')

    try:
        proc = subprocess.run(
            [wsl, "test", "-d", wsl_path, "&&", "echo", "yes"],
            capture_output=True, text=True, timeout=5,
            **kwargs,
        )
        return proc.returncode == 0 and "yes" in proc.stdout
    except (subprocess.TimeoutExpired, OSError):
        return False


# ---------------------------------------------------------------------------
# Agent-specific config readers
# ---------------------------------------------------------------------------

class CCConfig:
    """Claude Code configuration reader."""

    @staticmethod
    def read(config_dir: Path) -> Dict[str, Any]:
        """Read CC settings.json."""
        settings_path = config_dir / "settings.json"
        settings = read_json_file(settings_path) or {}

        # Also read settings.local.json if it exists
        local_path = config_dir / "settings.local.json"
        local = read_json_file(local_path) or {}

        # Merge (local overrides settings)
        merged = {**settings, **local}
        return merged

    @staticmethod
    def read_claude_md(config_dir: Path) -> Optional[str]:
        """Read CLAUDE.md content."""
        return read_text_file(config_dir / "CLAUDE.md")

    @staticmethod
    def get_hooks(config_dir: Path) -> Dict[str, List[Dict]]:
        """Extract hooks from settings.json."""
        settings = CCConfig.read(config_dir)
        return settings.get("hooks", {})

    @staticmethod
    def get_plugins(config_dir: Path) -> Dict[str, bool]:
        """Extract enabled plugins from settings.json."""
        settings = CCConfig.read(config_dir)
        return settings.get("enabledPlugins", {})

    @staticmethod
    def get_env(config_dir: Path) -> Dict[str, str]:
        """Extract environment variables from settings.json."""
        settings = CCConfig.read(config_dir)
        return settings.get("env", {})

    @staticmethod
    def get_permissions(config_dir: Path) -> Dict[str, List[str]]:
        """Extract permissions from settings.json."""
        settings = CCConfig.read(config_dir)
        return settings.get("permissions", {})

    @staticmethod
    def get_model(config_dir: Path) -> str:
        """Get the configured model.

        Priority:
        1. env.ANTHROPIC_MODEL (actual model being used)
        2. model field (Claude alias like "sonnet")
        """
        settings = CCConfig.read(config_dir)
        env = settings.get("env", {})

        # ANTHROPIC_MODEL is the actual model (e.g. "deepseek-v4-pro")
        actual_model = env.get("ANTHROPIC_MODEL", "")
        if actual_model:
            return actual_model

        # Fallback to model field (Claude alias like "sonnet")
        return settings.get("model", "—")

    @staticmethod
    def get_provider(config_dir: Path) -> str:
        """Get the configured provider (from env)."""
        env = CCConfig.get_env(config_dir)
        base_url = env.get("ANTHROPIC_BASE_URL", "")
        if not base_url or "anthropic.com" in base_url:
            return "Anthropic (Official)"
        return base_url


class CodexConfig:
    """Codex configuration reader."""

    @staticmethod
    def read(config_dir: Path) -> Dict[str, Any]:
        """Read Codex config.toml."""
        return read_toml_file(config_dir / "config.toml") or {}

    @staticmethod
    def read_auth(config_dir: Path) -> Dict[str, Any]:
        """Read Codex auth.json."""
        return read_json_file(config_dir / "auth.json") or {}

    @staticmethod
    def get_model(config_dir: Path) -> str:
        """Get the configured model."""
        config = CodexConfig.read(config_dir)
        return config.get("model", "—")

    @staticmethod
    def get_provider(config_dir: Path) -> str:
        """Get the configured provider."""
        config = CodexConfig.read(config_dir)
        provider_id = config.get("model_provider", "—")
        providers = config.get("model_providers", {})
        if provider_id in providers:
            return providers[provider_id].get("name", provider_id)
        return provider_id

    @staticmethod
    def get_rules(config_dir: Path) -> List[str]:
        """List rule file names."""
        rules_dir = config_dir / "rules"
        names = list_dir_via_wsl(rules_dir)
        return sorted(names)

    @staticmethod
    def get_skills(config_dir: Path) -> List[str]:
        """List skill names."""
        skills_dir = config_dir / "skills"
        names = list_dir_via_wsl(skills_dir)
        return sorted(names)


class HermesConfig:
    """Hermes configuration reader."""

    @staticmethod
    def read(config_dir: Path) -> Dict[str, Any]:
        """Read Hermes config.yaml."""
        return read_yaml_file(config_dir / "config.yaml") or {}

    @staticmethod
    def read_env(config_dir: Path) -> Optional[str]:
        """Read .env file content."""
        return read_text_file(config_dir / ".env")

    @staticmethod
    def read_soul(config_dir: Path) -> Optional[str]:
        """Read SOUL.md content."""
        return read_text_file(config_dir / "SOUL.md")

    @staticmethod
    def get_model(config_dir: Path) -> str:
        """Get the configured model."""
        config = HermesConfig.read(config_dir)
        model = config.get("model", {})
        if isinstance(model, dict):
            return model.get("default", "—")
        return str(model) if model else "—"

    @staticmethod
    def get_provider(config_dir: Path) -> str:
        """Get the configured provider."""
        config = HermesConfig.read(config_dir)
        model = config.get("model", {})
        if isinstance(model, dict):
            provider = model.get("provider", "—")
            base_url = model.get("base_url", "")
            if base_url:
                return f"{provider} ({base_url})"
            return provider
        return "—"

    @staticmethod
    def get_skills(config_dir: Path) -> List[str]:
        """List skill names."""
        skills_dir = config_dir / "skills"
        names = list_dir_via_wsl(skills_dir)
        return sorted(names)


class OpenCodeConfig:
    """OpenCode configuration reader."""

    @staticmethod
    def read(config_dir: Path) -> Dict[str, Any]:
        """Read OpenCode opencode.jsonc."""
        return read_jsonc_file(config_dir / "opencode.jsonc") or {}

    @staticmethod
    def read_auth(data_dir: Path) -> Dict[str, Any]:
        """Read OpenCode auth.json from data directory."""
        return read_json_file(data_dir / "auth.json") or {}

    @staticmethod
    def read_account(data_dir: Path) -> Dict[str, Any]:
        """Read OpenCode account.json from data directory."""
        return read_json_file(data_dir / "account.json") or {}

    @staticmethod
    def get_providers(config_dir: Path) -> Dict[str, Any]:
        """Get configured providers."""
        config = OpenCodeConfig.read(config_dir)
        return config.get("provider", {})


# ---------------------------------------------------------------------------
# Unified config reader
# ---------------------------------------------------------------------------

def _extract_provider_name(url: str) -> str:
    """Extract a friendly provider name from a URL.

    Only checks the DOMAIN part, not the full URL path.

    Examples:
        https://api.minimaxi.com/anthropic → minimax
        https://api.deepseek.com/anthropic → deepseek
        https://token-plan-cn.xiaomimimo.com/v1 → xiaomimimo
        https://openrouter.ai/api/v1 → openrouter
        https://api.anthropic.com/v1 → anthropic
    """
    if not url:
        return ""

    # Extract domain only (before first /)
    url_clean = url.replace("https://", "").replace("http://", "")
    domain = url_clean.split("/")[0].lower()

    # Known provider mappings (domain substring → friendly name)
    known_providers = [
        ("minimaxi", "minimax"),
        ("xiaomimimo", "xiaomimimo"),
        ("openrouter", "openrouter"),
        ("deepseek", "deepseek"),
        ("anthropic", "anthropic"),
        ("openai", "openai"),
        ("siliconflow", "siliconflow"),
        ("zhipu", "zhipu"),
        ("moonshot", "moonshot"),
        ("qwen", "qwen"),
        ("baichuan", "baichuan"),
        ("volcengine", "volcengine"),
        ("baidu", "baidu"),
        ("tencent", "tencent"),
        ("alibaba", "alibaba"),
        ("google", "google"),
        ("mistral", "mistral"),
        ("cohere", "cohere"),
        ("groq", "groq"),
        ("together", "together"),
        ("fireworks", "fireworks"),
        ("perplexity", "perplexity"),
    ]

    # Check domain only (not full URL)
    for domain_key, name in known_providers:
        if domain_key in domain:
            return name

    # Fallback: clean up domain
    for prefix in ["api.", "token-plan-cn.", "api-"]:
        if domain.startswith(prefix):
            domain = domain[len(prefix):]

    for suffix in [".com", ".ai", ".io", ".cn", ".top", ".app"]:
        if domain.endswith(suffix):
            domain = domain[:-len(suffix)]

    return domain if domain else ""


class ProfileConfigReader:
    """Unified interface for reading profile configurations."""

    def __init__(self, profile_root: Path, agent_type: str):
        self.profile_root = profile_root
        self.agent_type = agent_type
        self.config_dir = get_config_dir(profile_root, agent_type)
        self.data_dir = get_data_dir(profile_root, agent_type)

    def exists(self) -> bool:
        """Check if the config directory exists."""
        return self.config_dir.exists() and self.config_dir.is_dir()

    def get_meta(self) -> Dict[str, Any]:
        """Read meta.yaml."""
        meta_path = self.profile_root / "meta.yaml"
        return read_yaml_file(meta_path) or {}

    def get_model(self) -> str:
        """Get the configured model from actual config files."""
        if self.agent_type in ("cc", "claude"):
            return CCConfig.get_model(self.config_dir)
        elif self.agent_type == "codex":
            return CodexConfig.get_model(self.config_dir)
        elif self.agent_type == "hermes":
            return HermesConfig.get_model(self.config_dir)
        return "—"

    def get_provider(self) -> str:
        """Get the configured provider from actual config files.

        Always reads from settings.json / config.toml / config.yaml.
        Extracts friendly name from URL if possible.
        """
        if self.agent_type in ("cc", "claude"):
            raw = CCConfig.get_provider(self.config_dir)
        elif self.agent_type == "codex":
            raw = CodexConfig.get_provider(self.config_dir)
        elif self.agent_type == "hermes":
            raw = HermesConfig.get_provider(self.config_dir)
        else:
            return "—"

        # Extract friendly name from URL
        friendly = _extract_provider_name(raw)
        return friendly if friendly else raw

    def get_config(self) -> Dict[str, Any]:
        """Get the full configuration."""
        if self.agent_type in ("cc", "claude"):
            return CCConfig.read(self.config_dir)
        elif self.agent_type == "codex":
            return CodexConfig.read(self.config_dir)
        elif self.agent_type == "hermes":
            return HermesConfig.read(self.config_dir)
        elif self.agent_type == "opencode":
            return OpenCodeConfig.read(self.config_dir)
        return {}

    def get_config_text(self) -> str:
        """Get the configuration as formatted text."""
        config = self.get_config()
        if not config:
            return "(empty)"
        return json.dumps(config, indent=2, ensure_ascii=False)

    def get_tabs(self) -> List[tuple]:
        """Get the list of tabs for this agent type."""
        from .pages.detail import AGENT_TABS
        return AGENT_TABS.get(self.agent_type, AGENT_TABS["claude"])


__all__ = [
    "CCConfig",
    "CodexConfig",
    "HermesConfig",
    "OpenCodeConfig",
    "ProfileConfigReader",
    "get_config_dir",
    "get_data_dir",
    "read_json_file",
    "read_text_file",
    "read_toml_file",
    "read_yaml_file",
    "read_jsonc_file",
]
