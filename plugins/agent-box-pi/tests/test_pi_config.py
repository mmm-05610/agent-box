"""DeepSeek-only plugin configuration tests (config.json owns no secrets)."""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from agent_box_pi.config import (
    PiConfigError,
    PiPluginConfig,
    materialize_default_config,
    plugin_config_dir,
    plugin_config_file,
)


def _write(tmp_path: Path, payload: dict) -> Path:
    path = tmp_path / "plugins" / "pi" / "config.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def _load(tmp_path: Path, payload: dict, *, env: dict | None = None) -> PiPluginConfig:
    path = _write(tmp_path, payload)
    monkey = None
    return PiPluginConfig.load(path, env=env)


def test_deepseek_only_provider_rejected(tmp_path: Path) -> None:
    with pytest.raises(PiConfigError, match="only supports provider 'deepseek'"):
        _load(tmp_path, {"binary": "pi", "provider": "openai", "model": "deepseek/deepseek-v4-flash"})


def test_model_must_be_a_current_deepseek_catalog_id(tmp_path: Path) -> None:
    with pytest.raises(PiConfigError, match="model"):
        _load(tmp_path, {"binary": "pi", "model": "anthropic/claude-sonnet"})
    with pytest.raises(PiConfigError, match="model"):
        _load(tmp_path, {"binary": "pi", "model": "deepseek/deepseek-r1-unknown"})
    ok = _load(tmp_path, {"binary": "pi", "model": "deepseek/deepseek-v4-pro"})
    assert ok.canonical_model == "deepseek/deepseek-v4-pro"
    bare = _load(tmp_path, {"binary": "pi", "model": "deepseek-v4-flash"})
    assert bare.canonical_model == "deepseek/deepseek-v4-flash"


def test_unknown_config_keys_rejected(tmp_path: Path) -> None:
    with pytest.raises(PiConfigError, match="unknown keys"):
        _load(tmp_path, {"binary": "pi", "api_key": "sk-secret"})


def test_thinking_and_update_policy_validation(tmp_path: Path) -> None:
    with pytest.raises(PiConfigError, match="thinking"):
        _load(tmp_path, {"binary": "pi", "thinking": "extreme"})
    with pytest.raises(PiConfigError, match="update_policy"):
        _load(tmp_path, {"binary": "pi", "update_policy": "latest"})
    ok = _load(tmp_path, {"binary": "pi", "thinking": "medium", "update_policy": "pinned"})
    assert ok.thinking == "medium"


def test_roots_default_into_plugin_home(tmp_path: Path, monkeypatch) -> None:
    home = tmp_path / "home"
    monkeypatch.setenv("AGENT_BOX_HOME", str(home))
    config = PiPluginConfig.load(_write(tmp_path, {"binary": "pi"}))
    assert config.resolved_agent_dir == (home / "plugins" / "pi" / "agent").resolve()
    assert config.resolved_session_root == (home / "plugins" / "pi" / "sessions").resolve()
    assert config.resolved_evidence_root == (home / "plugins" / "pi" / "evidence").resolve()


def test_materialized_default_config_never_contains_secret_fields(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("AGENT_BOX_HOME", str(tmp_path / "home"))
    path = materialize_default_config(binary="/opt/pi/bin/pi", version="0.84.3")
    assert path == plugin_config_file()
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload["provider"] == "deepseek"
    assert payload["binary"] == "/opt/pi/bin/pi"
    for forbidden in ("api_key", "DEEPSEEK_API_KEY", "auth", "token", "secret"):
        assert forbidden not in payload
    assert "sk-" not in path.read_text(encoding="utf-8")
    with pytest.raises(PiConfigError, match="already exists"):
        materialize_default_config()


def test_config_roundtrip_preserves_non_secret_fields(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        {
            "binary": "/opt/pi/bin/pi",
            "provider": "deepseek",
            "model": "deepseek/deepseek-v4-pro",
            "thinking": "xhigh",
            "version": "0.84.3",
            "update_policy": "pinned",
            "session_root": "/srv/pi-sessions",
        },
    )
    loaded = PiPluginConfig.load(path)
    assert loaded.model == "deepseek/deepseek-v4-pro"
    assert loaded.resolved_session_root == Path("/srv/pi-sessions").resolve()
    dumped = json.loads(json.dumps(loaded.to_json_dict()))
    assert dumped["model"] == "deepseek/deepseek-v4-pro"


def test_version_drift_detected(tmp_path: Path) -> None:
    config = PiPluginConfig.load(
        _write(tmp_path, {"binary": "pi", "version": "0.84.2"}), env={}
    )
    with pytest.raises(PiConfigError, match="differs from pinned"):
        config.verify_installed_version("0.84.3")
    config.verify_installed_version("0.84.2")