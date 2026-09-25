"""One Harness distribution owns brands; common code stays neutral."""
import ast
from pathlib import Path
import tomllib

ROOT = Path(__file__).resolve().parents[1]
CORE = ROOT / "src" / "agent_box_harness"


def test_only_one_harness_distribution_exists():
    assert sorted(p.name for p in ROOT.parent.glob("agent-box-harness*")) == ["agent-box-harness"]
    metadata = tomllib.loads((ROOT / "pyproject.toml").read_text())
    assert metadata["project"]["name"] == "agent-box-harness"
    entries = metadata["project"]["entry-points"]["agent_box.plugins"]
    assert set(entries) == {"harness-profile-store", "codex", "claude", "opencode", "hermes", "pi"}
    assert all(value.startswith("agent_box_harness.entrypoints:") for value in entries.values())


def test_canonical_implementation_does_not_import_compatibility_names():
    for path in CORE.rglob("*.py"):
        for node in ast.walk(ast.parse(path.read_text())):
            names = ([node.module or ""] if isinstance(node, ast.ImportFrom) else
                     [alias.name for alias in node.names] if isinstance(node, ast.Import) else [])
            assert not any(name.startswith(("agent_box_harnesses", "agent_box_harness_dsh",
                                           "agent_box_harness_qwen", "agent_box_harness_kilo"))
                           for name in names), path


def test_common_code_has_no_brand_dispatch_table():
    brands = {"codex", "claude", "opencode", "hermes", "dsh", "qwen", "kilo", "pi"}
    for directory in ("generic", "registry", "resources"):
        for path in (CORE / directory).rglob("*.py"):
            for node in ast.walk(ast.parse(path.read_text())):
                if isinstance(node, ast.Dict):
                    assert not any(key.value in brands for key in node.keys
                                   if isinstance(key, ast.Constant) and isinstance(key.value, str)), path


def test_common_code_does_not_implement_host_file_or_terminal_capabilities():
    forbidden = ("readTextFile", "writeTextFile", "createTerminal", "read_text_file",
                 "write_text_file", "terminal/create", "fs/read_text_file", "fs/write_text_file")
    for directory in ("generic", "registry", "resources"):
        for path in (CORE / directory).rglob("*.py"):
            assert not any(name in path.read_text() for name in forbidden), path


def test_registry_and_runtime_are_owned_here():
    assert (CORE / "harnesses.toml").is_file()
    assert (ROOT / "runtime" / "access-entry.mjs").is_file()
    assert (ROOT / "third_party" / "harness_remote" / "SOURCE.json").is_file()
    for brand in ("codex", "claude", "opencode", "hermes", "dsh", "qwen", "kilo", "pi"):
        assert (CORE / brand / "native.py").is_file()
