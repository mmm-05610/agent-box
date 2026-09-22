"""M1-P-A① boundary pin: what the brand-neutral core must not contain.

Two rules decided this batch's shape (`control/tasks/BE-H-MINIMAL-001.md` §强制,
`contracts/C-HARNESS-v1.md` §5), and both are easy to violate by accident during
a later move:

  * the core does not recognise a brand — no brand branch, no second brand map;
  * the core does not implement a host capability (file, terminal, sandbox,
    profile authority, credential store) — those are declared and delegated, and
    an undeclared capability keeps answering `-32601` rather than gaining a
    private fallback.

The two `agent_box_harnesses` imports below are the batch's documented
transitional seams, not a licence to add more: if a third appears, this test
fails and the move has to be re-scoped rather than quietly widened.
"""
from __future__ import annotations

import ast
import re
from pathlib import Path

CORE_SRC = Path(__file__).resolve().parents[1] / "src" / "agent_box_harness"

#: The only three places the core may name the legacy package at all, by how it
#: names it: two import seams, and one string — the loader locating the
#: declaration file that deliberately did not move. Prose is ignored on purpose
#: (the module docstrings explain the seams); a *statement* that is not on this
#: list is a scope change and must fail the batch.
TRANSITIONAL_SEAMS = {
    "generic/factory.py": {("import", "agent_box_harnesses.adapters")},
    "plugin.py": {("import", "agent_box_harnesses.codex.credentials")},
    "registry/loader.py": {("literal", "agent_box_harnesses")},
}

BRANDS = ("codex", "claude", "opencode", "hermes", "dsh", "qwen", "kilo", "pi")


def _core_files() -> list[Path]:
    return sorted(path for path in CORE_SRC.rglob("*.py") if "__pycache__" not in path.parts)


def _legacy_references(text: str) -> set[tuple[str, str]]:
    """How this module names the legacy package in *executable* code."""
    found: set[tuple[str, str]] = set()
    for node in ast.walk(ast.parse(text)):
        if isinstance(node, ast.ImportFrom) and (node.module or "").startswith("agent_box_harnesses"):
            found.add(("import", node.module))
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.startswith("agent_box_harnesses"):
                    found.add(("import", alias.name))
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            if node.value == "agent_box_harnesses":
                found.add(("literal", node.value))
    return found


def test_the_core_names_the_legacy_package_only_at_the_documented_seams() -> None:
    found = {
        path.relative_to(CORE_SRC).as_posix(): _legacy_references(path.read_text(encoding="utf-8"))
        for path in _core_files()
    }
    found = {name: refs for name, refs in found.items() if refs}
    assert found == TRANSITIONAL_SEAMS, (
        "the core's references to the legacy package changed; P-B may remove a "
        f"seam but nothing may add one: {found}"
    )
    assert set(TRANSITIONAL_SEAMS) == {"generic/factory.py", "plugin.py", "registry/loader.py"}


def test_the_core_does_not_re_declare_a_brand_map() -> None:
    """`{ "codex": ... }` in core code would be a second hand-copied source."""
    offenders = []
    for path in _core_files():
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            code = line.split("#", 1)[0]
            for brand in BRANDS:
                if re.search(rf'["\']{brand}["\']\s*:', code):
                    offenders.append(f"{path.name}:{number}: {line.strip()}")
    assert offenders == []


def test_the_core_implements_no_file_or_terminal_capability() -> None:
    """Delegated to P by `C-HARNESS@v1` §5; H declares, it does not implement."""
    handlers = (
        "readTextFile", "writeTextFile", "createTerminal", "read_text_file",
        "write_text_file", "terminal/create", "fs/read_text_file", "fs/write_text_file",
    )
    offenders = []
    for path in _core_files():
        text = path.read_text(encoding="utf-8")
        for handler in handlers:
            if handler in text:
                offenders.append(f"{path.name}: {handler}")
    assert offenders == []


def test_the_core_declares_no_client_capabilities_of_its_own() -> None:
    """`exposed != executable`: an unclaimed capability must stay unclaimed."""
    offenders = []
    for path in _core_files():
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            code = line.split("#", 1)[0]
            if "clientCapabilities" in code and "{}" not in code:
                offenders.append(f"{path.name}:{number}: {line.strip()}")
    assert offenders == []


def test_the_core_keeps_the_module_inventory_of_this_batch() -> None:
    """A file appearing here means the extraction scope changed silently."""
    assert sorted(
        path.relative_to(CORE_SRC).as_posix() for path in _core_files()
    ) == [
        "__init__.py",
        "adapters/__init__.py",
        "adapters/base.py",
        "adapters/generic_cli.py",
        "entrypoints.py",
        "generic/__init__.py",
        "generic/execution_provider.py",
        "generic/factory.py",
        "generic/profile_manager.py",
        "generic/profile_provider.py",
        "generic/profile_selector.py",
        "generic/profile_store.py",
        "plugin.py",
        "registry/__init__.py",
        "registry/capability_claims.py",
        "registry/definitions.py",
        "registry/loader.py",
        "registry/schema.py",
        "registry/validation.py",
        "resources/__init__.py",
        "resources/executable.py",
        "resources/profile_codec.py",
    ]
