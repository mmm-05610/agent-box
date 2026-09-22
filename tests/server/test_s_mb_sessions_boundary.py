"""MB-S2c1 sessions package boundary pins: single implementation, module-identity aliases.

Locks the equivalent physical move of the sessions package (approvals
MB-S2c1-sessions-package-release.md, baseline fe59016b):
- exactly one implementation, in `agent_box.service.sessions`;
- the legacy entry `agent_box.server.sessions` resolves to the SAME module
  objects (M1-P-A① alias discipline, P-QWEN-001 precedent): package and all
  three submodules are identical objects and the legacy files carry zero
  def/class implementation;
- the composition root and the persistence view import from the new entry;
- `agent_box.service.sessions` never imports `agent_box.server.sessions`;
- the transitional `agent_box.server.*` edges are exactly the declared set;
- public surface identity: SessionService / SessionRecords / QueueRecords.
"""
from __future__ import annotations

import ast
import importlib
from pathlib import Path

import agent_box.service.sessions.queue as new_queue
import agent_box.service.sessions.repository as new_repository
import agent_box.service.sessions.service as new_service
import agent_box.service.sessions as new_package
from agent_box.service.sessions.queue import QueueRecords as new_records_queue


REPO_ROOT = Path(__file__).resolve().parents[2]
NEW_PACKAGE_DIR = REPO_ROOT / "src" / "agent_box" / "service" / "sessions"
LEGACY_PACKAGE_DIR = REPO_ROOT / "src" / "agent_box" / "server" / "sessions"

TRANSITIONAL_EDGES = frozenset((
    "agent_box.server.errors",
    "agent_box.server.execution",
    "agent_box.server.execution.session_store_guard",
    "agent_box.server.idempotency",
    "agent_box.server.ids",
    "agent_box.server.profiles.permissions",
    "agent_box.server.records",
))


def _tree(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"))


def _imports(source: str) -> list[ast.Import | ast.ImportFrom]:
    return [node for node in ast.walk(ast.parse(source))
            if isinstance(node, (ast.Import, ast.ImportFrom))]


def _absolute_module(node: ast.Import | ast.ImportFrom, module: str) -> list[str]:
    if isinstance(node, ast.Import):
        return [alias.name for alias in node.names]
    assert node.level == 0, f"relative import in the sessions package ({module})"
    return [node.module] if node.module else []


def test_legacy_paths_resolve_to_the_same_module_objects():
    assert importlib.import_module("agent_box.server.sessions") is new_package
    assert importlib.import_module("agent_box.server.sessions.service") is new_service
    assert importlib.import_module("agent_box.server.sessions.repository") is new_repository
    assert importlib.import_module("agent_box.server.sessions.queue") is new_queue


def test_public_names_are_the_same_objects():
    legacy_package = importlib.import_module("agent_box.server.sessions")
    assert legacy_package.SessionRecords is new_package.SessionRecords
    assert legacy_package.SessionService is new_package.SessionService
    assert new_package.__all__ == ["SessionRecords", "SessionService"]
    legacy_queue = importlib.import_module("agent_box.server.sessions.queue")
    assert legacy_queue.QueueRecords is new_records_queue


def test_legacy_files_carry_no_implementation():
    for name in ("__init__.py", "service.py", "repository.py", "queue.py"):
        source = (LEGACY_PACKAGE_DIR / name).read_text(encoding="utf-8")
        offenders = [node for node in ast.walk(ast.parse(source))
                     if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))]
        assert offenders == [], f"second implementation in legacy {name}"


def test_new_package_never_imports_server_sessions():
    for path in sorted(NEW_PACKAGE_DIR.rglob("*.py")):
        for node in _imports(path.read_text(encoding="utf-8")):
            for name in _absolute_module(node, str(path)):
                assert name != "agent_box.server.sessions", path
                assert not name.startswith("agent_box.server.sessions."), path


def test_transitional_edges_are_exactly_declared():
    edges: set[str] = set()
    for path in sorted(NEW_PACKAGE_DIR.rglob("*.py")):
        for node in _imports(path.read_text(encoding="utf-8")):
            edges.update(name for name in _absolute_module(node, str(path))
                         if name == "agent_box.server" or name.startswith("agent_box.server."))
    assert edges == TRANSITIONAL_EDGES, edges ^ TRANSITIONAL_EDGES


def test_composition_root_and_persistence_anchor_new_entry():
    runtime = (REPO_ROOT / "src" / "agent_box" / "server" / "bootstrap" / "runtime.py").read_text(encoding="utf-8")
    assert "from agent_box.service.sessions import SessionRecords, SessionService" in runtime
    assert "from agent_box.service.sessions.queue import QueueRecords" in runtime
    assert "from agent_box.server.sessions" not in runtime
    persistence = (REPO_ROOT / "src" / "agent_box" / "server" / "persistence.py").read_text(encoding="utf-8")
    assert "from agent_box.service.sessions import SessionRecords" in persistence
    assert "from agent_box.server.sessions" not in persistence


def test_new_package_class_inventory_matches_the_moved_implementation():
    inventory: dict[str, list[str]] = {}
    for path in sorted(NEW_PACKAGE_DIR.rglob("*.py")):
        names = [node.name for node in _tree(path).body if isinstance(node, ast.ClassDef)]
        if names:
            inventory[path.relative_to(NEW_PACKAGE_DIR).as_posix()] = names
    assert inventory == {
        "service.py": ["SessionService"],
        "repository.py": ["SessionRecords"],
        "queue.py": ["QueueRecords"],
    }
