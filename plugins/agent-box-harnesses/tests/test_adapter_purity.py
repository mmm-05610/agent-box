"""Adapter purity: planner/codec code must not perform side effects.

Static source scan over the adapter layer: no process spawning, no host
environment reads/writes, no filesystem writes, no credential-file access.
Side-effectful concerns live in resources/ (probe), staging.py (single
execution-scoped writer) and the Root runtime chain.
"""
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parents[1] / "src" / "agent_box_harnesses" / "adapters"

PURE_MODULES = (
    "base.py", "codex.py", "claude.py", "opencode.py", "hermes.py", "pi.py",
    "generic_cli.py", "composer.py", "launch_plan.py", "lowering.py",
    "native_guard.py", "native_render.py", "observation.py", "start_context.py",
    "skill_observation.py",
)

FORBIDDEN_TOKENS = {
    "subprocess": "process spawning belongs to the Root runtime chain",
    "os.environ": "adapters must not read or mutate the host environment",
    "shutil": "adapters must not copy or remove files",
    "write_text": "adapters must not write host files",
    "write_bytes": "adapters must not write host files",
    ".mkdir": "adapters must not create host directories",
    ".remove(": "adapters must not delete host files",
    "rmtree": "adapters must not delete trees",
    "keyring": "credential stores are out of the adapter boundary",
    "Popen": "adapters must not spawn",
}


@pytest.mark.parametrize("module", PURE_MODULES)
def test_pure_adapter_modules_have_no_side_effect_tokens(module):
    text = (SRC / module).read_text(encoding="utf-8")
    violations = [f"{token}: {reason}" for token, reason in FORBIDDEN_TOKENS.items() if token in text]
    assert violations == [], f"{module}: {violations}"


def test_staging_is_the_only_writer_and_is_confined_to_execution_scopes():
    text = (SRC / "staging.py").read_text(encoding="utf-8")
    assert "write_bytes" in text  # the single writer
    # every write target is derived from the execution-scoped root
    assert "self.root" in text
    assert "agent_box_home" not in text and "Path.home" not in text
    for pure in PURE_MODULES:
        assert pure != "staging.py"


def test_lowering_is_the_only_launchplan_to_runtime_path():
    """Within the formal chain (adapters/ + generic/), only the lowering path
    builds Root runtime command specs."""
    package_root = Path(__file__).resolve().parents[1] / "src" / "agent_box_harnesses"
    hits = []
    for folder in ("adapters", "generic"):
        for path in (package_root / folder).rglob("*.py"):
            if path.name == "lowering.py":
                continue
            text = path.read_text(encoding="utf-8")
            if "HarnessCommandSpec(" in text:
                hits.append(str(path))
    assert hits == [], f"unexpected direct HarnessCommandSpec construction: {hits}"


def test_adapters_never_import_work_core_finish_or_finalization():
    src_root = Path(__file__).resolve().parents[1] / "src" / "agent_box_harnesses" / "adapters"
    for path in src_root.glob("*.py"):
        text = path.read_text(encoding="utf-8")
        assert "apply_finalization" not in text, path
        assert "ExecutionFinalizationRequest" not in text, path
        assert "WorkService" not in text, path
