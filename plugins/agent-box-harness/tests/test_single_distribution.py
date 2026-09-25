"""Compatibility is import-only: no second registry, classes, or source tree."""
import importlib
import os
from pathlib import Path
import subprocess
import sys

import pytest


@pytest.mark.parametrize("legacy_first", [True, False])
def test_every_legacy_module_is_canonical_in_both_import_orders(legacy_first):
    script = '''
import importlib
from pathlib import Path
import agent_box_harness
root = Path(agent_box_harness.__file__).parent
names = []
for source in root.rglob("*.py"):
    relative = source.relative_to(root).with_suffix("")
    parts = list(relative.parts)
    if parts[-1] == "__init__":
        parts.pop()
    if not parts or parts[0].startswith("_"):
        continue
    names.append(".".join(parts))
for suffix in sorted(names):
    old, new = "agent_box_harnesses." + suffix, "agent_box_harness." + suffix
    order = (old, new) if LEGACY_FIRST else (new, old)
    first, second = map(importlib.import_module, order)
    assert first is second, suffix
    assert first.__spec__.name == new, (suffix, first.__spec__)
for brand in ("dsh", "qwen", "kilo"):
    for suffix in ("", ".native", ".production"):
        old = importlib.import_module("agent_box_harness_" + brand + suffix)
        new = importlib.import_module("agent_box_harness." + brand + suffix)
        assert old is new
print("all aliases share canonical modules and specs")
'''.replace("LEGACY_FIRST", repr(legacy_first))
    result = subprocess.run([sys.executable, "-c", script], env=os.environ.copy(),
                            text=True, capture_output=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr


def test_compatibility_unknown_module_is_not_silently_created():
    with pytest.raises(ModuleNotFoundError):
        importlib.import_module("agent_box_harnesses.not_a_real_module")


def test_shared_adapter_exports_are_preserved():
    from agent_box_harness.adapters import HarnessAdapter, GenericCliAdapter
    from agent_box_harness.adapters.base import HarnessAdapter as protocol
    from agent_box_harnesses.adapters import GenericCliAdapter as legacy
    assert HarnessAdapter is protocol
    assert GenericCliAdapter is legacy


def test_dsh_qwen_kilo_assets_use_the_single_plugin_root():
    root = Path(__file__).resolve().parents[1]
    for brand in ("dsh", "qwen", "kilo"):
        production = importlib.import_module("agent_box_harness." + brand + ".production")
        assert production.PLUGIN_ROOT == root
        assert (root / "deploy" / brand).is_dir()
