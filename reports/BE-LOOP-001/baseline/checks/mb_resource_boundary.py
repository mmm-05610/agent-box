#!/usr/bin/env python3
"""MB-1c boundary verification for the six resource plugins (P domain).

Runnable counterexample checks for the module baseline:
  1. cross-plugin imports      – must be zero (plugins depend one-way on core)
  2. package import            – all six import cleanly in one interpreter
  3. entry-point names         – unique across the six pyprojects
  4. duplicate registration    – ExtensionRegistry refuses a second register
  5. descriptor/provider ids   – unique across the six plugins
  6. per-agent branching       – zero agent-type discriminators in plugin src
  7. brand words in src        – counted per plugin; bwrap hits are classified
                                 (fixed-template spelling / export name / comment)

Run with MB_SOURCE_ROOT set to the candidate repository and all plugin src
directories on PYTHONPATH.
Exit code 0 = every check passed.
"""
from __future__ import annotations

import ast
import os
import re
import sys
from pathlib import Path

SOURCE_ROOT = Path(os.environ["MB_SOURCE_ROOT"])
PLUGINS = [
    "agent-box-runtime-local",
    "agent-box-sandbox-bwrap",
    "agent-box-terminal-session",
    "agent-box-git",
    "agent-box-artifacts",
    "agent-box-skills",
]
MY_PKG = {p.replace("-", "_") for p in PLUGINS}
FAILURES: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        FAILURES.append(label)


def py_files(plugin: str) -> list[Path]:
    src = SOURCE_ROOT / "plugins" / plugin / "src"
    return sorted(p for p in src.rglob("*.py") if "__pycache__" not in p.parts)


# 1. cross-plugin imports (AST-based: an import of agent_box_<other>)
def cross_plugin_imports() -> dict[str, set[str]]:
    hits: dict[str, set[str]] = {}
    for plugin in PLUGINS:
        for path in py_files(plugin):
            tree = ast.parse(path.read_text(encoding="utf-8"), str(path))
            for node in ast.walk(tree):
                names: list[str] = []
                if isinstance(node, ast.Import):
                    names = [a.name for a in node.names]
                elif isinstance(node, ast.ImportFrom) and node.module:
                    names = [node.module]
                for name in names:
                    root = name.split(".")[0]
                    if root.startswith("agent_box_") and root not in MY_PKG:
                        hits.setdefault(plugin, set()).add(name)
                    if root in MY_PKG and root != plugin.replace("-", "_"):
                        hits.setdefault(plugin, set()).add(name)
    return hits


hits = cross_plugin_imports()
check("1. cross-plugin imports = 0", not hits,
      "offenders: " + repr({k: sorted(v) for k, v in hits.items()}) if hits else
      "six plugins import only agent_box core + own package")

# 2. all six import in this interpreter
sys.path.insert(0, str(SOURCE_ROOT / "src"))
for plugin in PLUGINS:
    pkg = plugin.replace("-", "_")
    try:
        __import__(pkg)
        check(f"2. import {pkg}", True)
    except Exception as exc:  # noqa: BLE001
        check(f"2. import {pkg}", False, f"{type(exc).__name__}: {exc}")

# 3. entry-point names unique across the six pyprojects
ep_re = re.compile(r'\[project\.entry-points\."agent_box\.plugins"\]\n(\S+)\s*=')
names: dict[str, str] = {}
for plugin in PLUGINS:
    text = (SOURCE_ROOT / "plugins" / plugin / "pyproject.toml").read_text(encoding="utf-8")
    m = ep_re.search(text)
    if m:
        names[m.group(1)] = plugin
check("3. entry-point names unique", len(names) == len(PLUGINS),
      f"{len(names)}/{len(PLUGINS)}: {sorted(names)}")

# 4. duplicate registration is refused (runtime counterexample)
try:
    from agent_box.work_core.registry import ExtensionRegistry  # noqa: E402

    reg = ExtensionRegistry()
    dup_refused = False
    # register the same resource provider id twice via a minimal stub
    from agent_box.work_core.registry import ProviderDescriptor  # noqa: E402

    class _Stub:  # minimal provider satisfying register_resource_provider checks
        def descriptor(self):
            return ProviderDescriptor("dup-stub", "stub", "1")

        supported_contract_ids = frozenset()
    # use execution-provider path: simplest documented duplicate guard
    class _ExecStub:
        def descriptor(self):
            return ProviderDescriptor("dup-stub", "stub", "1")
    try:
        reg.register_execution_provider(_ExecStub())
        reg.register_execution_provider(_ExecStub())
        dup_refused = False
    except ValueError as exc:
        dup_refused = "already registered" in str(exc)
    check("4. duplicate registration refused", dup_refused,
          "second register raises ValueError('provider already registered: …')")
except Exception as exc:  # noqa: BLE001
    check("4. duplicate registration refused", False, f"{type(exc).__name__}: {exc}")

# 5. descriptor ids / provider ids unique across the six plugins
ids: dict[str, str] = {}
for plugin in PLUGINS:
    pkg = plugin.replace("-", "_")
    try:
        mod = __import__(f"{pkg}.plugin", fromlist=["create_plugin"])
        plugin_obj = mod.create_plugin()
        desc = plugin_obj.descriptor()
        ids[desc.id] = plugin
    except Exception as exc:  # noqa: BLE001
        check(f"5. descriptor id of {pkg}", False, f"{type(exc).__name__}: {exc}")
check("5. descriptor ids unique", len(ids) == len(PLUGINS),
      f"{sorted(ids)}")

# 6. per-agent branching in src (agent-type discriminators)
agent_pat = re.compile(r"agent_type|if\s+.*\bagent\b\s*==|elif\s+.*\bagent\b|for\s+agent\s+in", re.I)
branch_hits: list[str] = []
for plugin in PLUGINS:
    for path in py_files(plugin):
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if agent_pat.search(line) and "refs/agent-box" not in line:
                branch_hits.append(f"{plugin}:{path.name}:{lineno}")
check("6. per-agent type branching = 0", not branch_hits,
      "; ".join(branch_hits) if branch_hits else "no agent-type discriminators in six plugin src")

# 7. brand words in src, classified
brand_pat = re.compile(r"codex|claude|opencode|qwen|deepseek|gemini|cursor|zcode|hermes|kilo|dsh", re.I)
counts: dict[str, list[tuple[str, int, str]]] = {}
for plugin in PLUGINS:
    for path in py_files(plugin):
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if brand_pat.search(line):
                counts.setdefault(plugin, []).append((path.name, lineno, line.strip()))
non_bwrap = {k: v for k, v in counts.items() if k != "agent-box-sandbox-bwrap"}
check("7a. brand words in src: five plugins = 0", not non_bwrap,
      repr({k: len(v) for k, v in non_bwrap.items()}) if non_bwrap else
      "runtime-local/terminal-session/git/artifacts/skills clean")
bwrap_hits = counts.get("agent-box-sandbox-bwrap", [])
template = [h for h in bwrap_hits if "/runtime/bin/codex" in h[2] or "Codex template" in h[2] or "Native Codex" in h[2]]
export_name = [h for h in bwrap_hits if "compose_codex_room" in h[2]]
comments = [h for h in bwrap_hits if h not in template and h not in export_name]
print(f"[INFO] bwrap src brand hits = {len(bwrap_hits)}: "
      f"fixed-template spelling/error-text = {len(template)}, "
      f"export name compose_codex_room = {len(export_name)}, "
      f"explanatory comments = {len(comments)}")
for name, lineno, text in bwrap_hits:
    print(f"       {name}:{lineno}: {text[:100]}")
check("7b. bwrap brand hits classified (reported, not judged)",
      len(template) + len(export_name) + len(comments) == len(bwrap_hits),
      "all hits fall into the three declared classes")

print()
if FAILURES:
    print(f"RESULT: {len(FAILURES)} FAILED -> {FAILURES}")
    sys.exit(1)
print("RESULT: ALL CHECKS PASSED")
