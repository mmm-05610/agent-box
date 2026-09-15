"""The feature-flag differential must not encode an unproven claim as green.

Its control leg reproduces Codex's shipped defaults (the `[features]` table
removed from the loopback config); its treatment leg runs the config as
deployed. Only "the control showed the churn and every treatment run was clean"
is a pass - a clean treatment without a demonstrated control is INCONCLUSIVE
with a non-zero exit, because nothing was actually compared.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
DIFFERENTIAL = REPO_ROOT / "scripts" / "server-round1" / "codex-feature-flag-differential.py"


def load_differential():
    spec = importlib.util.spec_from_file_location("codex_feature_flag_differential", DIFFERENTIAL)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run(appeared: bool, result: str = "CODEX_PRODUCTION_CHAIN_GATE_OK") -> dict:
    return {"result": result, "exit": 0 if result.endswith("OK") else 1, "appeared": appeared}


def test_only_a_demonstrated_control_with_clean_treatment_is_ok():
    module = load_differential()
    result, code = module.classify([run(True)], [run(False), run(False)])
    assert (result, code) == ("CODEX_FEATURE_FLAG_DIFFERENTIAL_OK", 0)


def test_a_clean_treatment_without_a_control_is_inconclusive():
    module = load_differential()
    result, code = module.classify([run(False)] * 6, [run(False)] * 2)
    assert result == "CODEX_FEATURE_FLAG_DIFFERENTIAL_INCONCLUSIVE"
    assert code != 0, "an unproven differential must not exit successfully"


def test_a_treatment_that_showed_the_churn_fails():
    module = load_differential()
    result, code = module.classify([run(True)], [run(True)])
    assert (result, code)[0] == "CODEX_FEATURE_FLAG_DIFFERENTIAL_FAILED"
    assert code == 1

    module = load_differential()
    failed_leg = run(False, "CODEX_PRODUCTION_CHAIN_GATE_FAILED")
    result, code = module.classify([run(True)], [failed_leg])
    assert result == "CODEX_FEATURE_FLAG_DIFFERENTIAL_FAILED"
    assert code == 1


def test_the_control_transform_drops_only_the_features_table():
    """The control leg is a config-content change: every other line - including
    the Profile sentinel comment the guest audit verifies - is preserved."""
    import importlib.util as util

    spec = util.spec_from_file_location(
        "gate", REPO_ROOT / "scripts" / "server-round1" / "codex-production-chain-gate.py")
    gate = util.module_from_spec(spec)
    spec.loader.exec_module(gate)
    import tomllib

    original = (REPO_ROOT / "plugins" / "agent-box-harnesses" / "deploy" / "codex"
                / "config.toml").read_bytes()
    control = gate.without_feature_flags(original)
    document = tomllib.loads(control.decode("utf-8"))
    assert "features" not in document
    assert document["model"] == "deepseek-flash"
    assert document["model_providers"]["deepseek"]["env_key"] == "CODEX_API_KEY"
    assert b"[features]" not in control
    # Everything except the table's own lines survives: the table header, its
    # keys, and nothing else.
    table_lines = (b"[features]", b"plugins = false", b"shell_snapshot = false")
    preserved = [line for line in original.splitlines()
                 if line.strip() and not any(marker in line for marker in table_lines)]
    assert all(line in control for line in preserved), (
        "the control leg must keep every other line")


def test_a_single_flag_strip_keeps_the_other_flag_and_rejects_unknown_keys():
    """The per-variable leg must change exactly one variable: the other reviewed
    flag stays in the config, and a key that is not declared is refused."""
    import importlib.util as util
    import tomllib

    spec = util.spec_from_file_location(
        "gate", REPO_ROOT / "scripts" / "server-round1" / "codex-production-chain-gate.py")
    gate = util.module_from_spec(spec)
    spec.loader.exec_module(gate)
    original = (REPO_ROOT / "plugins" / "agent-box-harnesses" / "deploy" / "codex"
                / "config.toml").read_bytes()

    single = tomllib.loads(gate.without_feature_flags(original, "shell_snapshot").decode("utf-8"))
    assert single["features"] == {"plugins": False}, single["features"]
    whole = tomllib.loads(gate.without_feature_flags(original).decode("utf-8"))
    assert "features" not in whole
    with pytest.raises(ValueError, match="unknown feature flag"):
        gate.without_feature_flags(original, "not_a_flag")
