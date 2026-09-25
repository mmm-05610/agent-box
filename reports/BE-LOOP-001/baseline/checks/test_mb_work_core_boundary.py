"""MB-1c Work Core dependency locks against MB_SOURCE_ROOT/src.

Set MB_SOURCE_ROOT to the candidate repository, and put its src on PYTHONPATH.
"""
from __future__ import annotations

import ast
import os
from pathlib import Path

from agent_box.work_core import ExtensionRegistry as PublicRegistry
from agent_box.work_core.registry import ExtensionRegistry as DefinedRegistry


CORE = Path(os.environ["MB_SOURCE_ROOT"]) / "src/agent_box/work_core"


def _forbidden_imports(source: str, *, module_name: str) -> list[str]:
    """Reject outward edges to product/plug-in implementations, including local imports."""
    root = ast.parse(source)
    offenders: list[str] = []
    forbidden = (
        "agent_box.server",
        "agent_box.extensions",
        "agent_box.plugins",
        "agent_box.harnesses",
    )
    for node in ast.walk(root):
        names: list[str] = []
        if isinstance(node, ast.Import):
            names = [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                # Package is agent_box.work_core; one dot stays in Core, two
                # reach agent_box. Resolve the latter so relative imports count.
                parent = module_name.rsplit(".", 1)[0]
                parts = parent.split(".")[: len(parent.split(".")) - node.level + 1]
                names = [".".join((*parts, *(node.module or "").split("."))).strip(".")]
            else:
                names = [node.module or ""]
        for name in names:
            if any(name == prefix or name.startswith(prefix + ".") for prefix in forbidden):
                offenders.append(f"{node.lineno}:{name}")
    return offenders


def test_core_has_no_upward_or_concrete_plugin_imports():
    files = sorted(CORE.glob("*.py"))
    assert files, "Work Core package missing"
    violations = {
        path.name: _forbidden_imports(
            path.read_text(encoding="utf-8"),
            module_name=f"agent_box.work_core.{path.stem}",
        )
        for path in files
    }
    assert {name: found for name, found in violations.items() if found} == {}


def test_import_rule_catches_top_level_function_local_and_relative_counterexamples():
    cases = (
        "from agent_box.server.sessions import SessionService",
        "def hidden():\n    from agent_box.extensions.runtime_composition import RuntimeCompositionCoordinator",
        "from ..server.profiles import ProfileService",
    )
    for case in cases:
        assert _forbidden_imports(case, module_name="agent_box.work_core.registry"), case
    assert not _forbidden_imports(
        "from ..resource_contracts import CONTRACT_TYPES",
        module_name="agent_box.work_core.registry",
    )


def test_core_registry_is_one_definition_and_public_alias_is_same_object():
    definitions = [
        (path.name, node.name)
        for path in CORE.glob("*.py")
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8")))
        if isinstance(node, ast.ClassDef) and node.name == "ExtensionRegistry"
    ]
    assert definitions == [("registry.py", "ExtensionRegistry")]
    assert PublicRegistry is DefinedRegistry
