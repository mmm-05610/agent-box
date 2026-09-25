from pathlib import Path


HARNESS_SRC = Path(__file__).resolve().parents[1] / "src" / "ordessa_harness"
FORBIDDEN = (
    "pacthold." + "launch",
    "pacthold.work_core." + "providers.resources",
    "pacthold." + "resources",
    "pacthold." + "application",
    "pacthold." + "server",
    "agent_box_" + "web",
)


def test_harness_source_has_no_legacy_or_web_imports():
    violations = []
    for path in HARNESS_SRC.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        for forbidden in FORBIDDEN:
            if forbidden in text:
                violations.append(f"{path}: {forbidden}")
    assert violations == []


def test_codex_launch_spec_is_harness_owned():
    launch = (HARNESS_SRC / "codex" / "launch.py").read_text(encoding="utf-8")
    assert "class CodexLaunchSpec" in launch
    assert "LaunchPlan" not in launch
