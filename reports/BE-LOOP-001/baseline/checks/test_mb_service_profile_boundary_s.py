"""MB-1c S-side import and registration boundaries, independent of code moves.

These checks inspect actual source and prove the scanner rejects representative
violations. They do not claim runtime registration or full integration coverage.
"""
from __future__ import annotations

import ast
import os
from pathlib import Path


SOURCE = (Path(os.environ["S_MB_SOURCE_ROOT"]) if "S_MB_SOURCE_ROOT" in os.environ
          else Path(__file__).resolve().parents[1] / "work" / "a3" / "src") / "agent_box" / "server"
GENERIC_PROFILE = (
    "profiles/repository.py", "profiles/service.py", "profiles/permissions.py",
    "profiles/subagents.py", "profiles/clone.py", "profiles/memory.py",
)
SERVICE_ENTRY = (
    "services.py", "sessions/service.py", "sessions/repository.py",
    "sessions/queue.py", "wire/handlers.py", "wire/projection.py",
)
FORBIDDEN_PROFILE_PREFIXES = (
    "agent_box.server.sessions", "agent_box.server.wire",
    "agent_box.server.transport", "agent_box.server.bootstrap",
)
CONCRETE_PLUGIN_PARTS = frozenset((
    "agent_box_harnesses", "agent_box_runtime_local", "agent_box_sandbox_bwrap",
    "agent_box_terminal_session", "agent_box_git", "agent_box_skills",
))


def _imports(source: str, *, module: str) -> list[str]:
    """Include imports nested in functions and conditionals, not just module top level."""
    result = []
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            result.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                package = module.split(".")[:-node.level]
                result.append(".".join(package + ([node.module] if node.module else [])))
            elif node.module is not None:
                result.append(node.module)
    return result


def _violations(source: str, *, profile: bool, module: str) -> list[str]:
    result = []
    for name in _imports(source, module=module):
        if profile and any(name == prefix or name.startswith(prefix + ".")
                           for prefix in FORBIDDEN_PROFILE_PREFIXES):
            result.append(name)
        if any(part in CONCRETE_PLUGIN_PARTS for part in name.split(".")):
            result.append(name)
    return result


def _wire_method_keys(source: str) -> list[str]:
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            targets, value = node.targets, node.value
        elif isinstance(node, ast.AnnAssign):
            targets, value = [node.target], node.value
        else:
            continue
        if not any(isinstance(target, ast.Attribute) and target.attr == "_handlers"
                   for target in targets):
            continue
        assert isinstance(value, ast.Dict), "WireService._handlers must remain explicit"
        keys = []
        for key in value.keys:
            assert isinstance(key, ast.Constant) and isinstance(key.value, str), (
                "wire method registrations must use literal keys")
            keys.append(key.value)
        return keys
    raise AssertionError("WireService._handlers registration missing")


def test_generic_profile_and_service_do_not_import_forbidden_layers():
    for relative in GENERIC_PROFILE:
        source = (SOURCE / relative).read_text(encoding="utf-8")
        module = "agent_box.server." + relative.removesuffix(".py").replace("/", ".")
        assert _violations(source, profile=True, module=module) == [], relative
    for relative in SERVICE_ENTRY:
        source = (SOURCE / relative).read_text(encoding="utf-8")
        module = "agent_box.server." + relative.removesuffix(".py").replace("/", ".")
        assert _violations(source, profile=False, module=module) == [], relative


def test_forbidden_import_counterexamples_are_detected():
    assert _violations("from agent_box.server.wire.handlers import WireService",
                       profile=True, module="agent_box.server.profiles.service") == [
                           "agent_box.server.wire.handlers"]
    assert _violations("from ..wire import handlers", profile=True,
                       module="agent_box.server.profiles.service") == [
                           "agent_box.server.wire"]
    assert _violations("def f():\n    import agent_box_harnesses.claude\n",
                       profile=False, module="agent_box.server.services") == [
                           "agent_box_harnesses.claude"]
    assert _violations("from agent_box.server.profiles import ProfileRecords",
                       profile=False, module="agent_box.server.services") == []


def test_wire_method_registration_has_no_duplicate_keys():
    source = (SOURCE / "wire/handlers.py").read_text(encoding="utf-8")
    keys = _wire_method_keys(source)
    assert keys, "wire method table must not be empty"
    assert len(keys) == len(set(keys)), "duplicate wire method overwrites an earlier handler"


def test_duplicate_wire_method_counterexample_is_detected():
    keys = _wire_method_keys(
        "class WireService:\n"
        "    def __init__(self):\n"
        "        self._handlers = {'profiles.create': self.a, 'profiles.create': self.b}\n"
    )
    assert len(keys) != len(set(keys))
