"""M1-P-A① acceptance pin: the facade and the core are the same code.

The batch moved an implementation and left the old names in place. That claim is
only worth anything if the old name and the new name resolve to one module
object, one set of attribute objects and one piece of module-level state — a
second `definitions.REGISTRY`, or two `ProfileStore` classes, would be a real
defect (two registries, `isinstance` failures across the boundary) and not a
cosmetic detail. So this file pins identity, in both import orders, in-child.
"""
from __future__ import annotations

import os
import subprocess
import sys
import textwrap
import tomllib
from pathlib import Path

import pytest

LEGACY = "agent_box_harnesses"
CORE = "agent_box_harness"

#: Every module whose implementation moved. Both names must resolve to one object.
MOVED_MODULES = (
    "plugin",
    "entrypoints",
    "registry",
    "registry.schema",
    "registry.loader",
    "registry.definitions",
    "registry.validation",
    "registry.capability_claims",
    "generic",
    "generic.factory",
    "generic.profile_store",
    "generic.profile_manager",
    "generic.profile_selector",
    "generic.profile_provider",
    "generic.execution_provider",
    "resources",
    "resources.executable",
    "resources.profile_codec",
    "adapters.base",
    "adapters.generic_cli",
)

REPO_ROOT = Path(__file__).resolve().parents[3]
CANONICAL_SRC = REPO_ROOT / "plugins" / "agent-box-harness" / "src" / "agent_box_harness"


@pytest.mark.parametrize("dotted", MOVED_MODULES)
def test_a_moved_module_is_one_object_under_both_names(dotted: str) -> None:
    old = __import__(f"{LEGACY}.{dotted}", fromlist=["*"])
    new = __import__(f"{CORE}.{dotted}", fromlist=["*"])
    assert old is new, f"{LEGACY}.{dotted} is not {CORE}.{dotted}"


def test_the_registry_object_is_not_duplicated() -> None:
    from agent_box_harness.registry.definitions import DEFINITIONS as new_definitions
    from agent_box_harness.registry.definitions import REGISTRY as new_registry
    from agent_box_harnesses.registry.definitions import DEFINITIONS as old_definitions
    from agent_box_harnesses.registry.definitions import REGISTRY as old_registry

    assert old_registry is new_registry
    assert old_definitions is new_definitions
    assert len(new_registry.all()) == 8


def test_the_brand_adapter_map_has_one_source_and_it_is_the_legacy_one() -> None:
    """The core must not re-declare the map; it imports the existing object.

    A hand-copied second literal is exactly the drift `capability_claims.py`
    warns about, so the pin is identity, not equality.
    """
    from agent_box_harness.generic.factory import ADAPTERS as used_by_the_core
    from agent_box_harnesses.adapters import ADAPTERS as declared_once

    assert used_by_the_core is declared_once
    assert sorted(used_by_the_core) == [
        "claude", "codex", "dsh", "hermes", "kilo", "opencode", "pi", "qwen",
    ]


def test_the_brand_adapters_inherit_the_core_implementation() -> None:
    from agent_box_harness.adapters.generic_cli import GenericCliAdapter
    from agent_box_harnesses.adapters.codex import CodexAdapter
    from agent_box_harnesses.adapters.kilo import KiloAdapter

    assert issubclass(CodexAdapter, GenericCliAdapter)
    assert issubclass(KiloAdapter, GenericCliAdapter)
    assert CodexAdapter.__mro__[1] is GenericCliAdapter


def test_the_registry_content_is_the_declaration_file_unchanged() -> None:
    """The digest is recomputed from the file the loader is told to read.

    The declaration file did not move, so its bytes — and therefore the digest,
    which other tests and the JS projection compare against — must be identical.
    """
    from agent_box_harness.registry.loader import _builtin_registry_resource, load_builtin_registry

    resource = _builtin_registry_resource()
    assert resource.name == "harnesses.toml"
    text = resource.read_text(encoding="utf-8")
    registry = load_builtin_registry()
    assert registry.digest == "sha256:" + __import__("hashlib").sha256(text.encode()).hexdigest()
    assert len(tomllib.loads(text)["harness"]) == len(registry.all()) == 8
    assert resource.is_relative_to(CANONICAL_SRC)


def test_the_entry_point_facade_still_builds_a_registration() -> None:
    from agent_box_harnesses.entrypoints import create_codex, create_hermes, create_profile_store

    assert create_profile_store().descriptor() is not None
    assert create_codex().descriptor() is not None
    assert create_hermes().descriptor() is not None
    assert create_codex().harness_type == "codex"
    assert create_profile_store().harness_type is None


CHILD = """
import sys

{first}
import {legacy}.registry.loader as old_loader
import {core}.registry.loader as new_loader
import {legacy}.registry.definitions as old_definitions
import {core}.registry.definitions as new_definitions
import {legacy}.generic.profile_store as old_store
import {core}.generic.profile_store as new_store

assert old_loader is new_loader, "loader module duplicated"
assert old_definitions.REGISTRY is new_definitions.REGISTRY, "registry state duplicated"
assert old_store.ProfileStore is new_store.ProfileStore, "profile store class duplicated"
assert len(new_definitions.REGISTRY.all()) == 8
print("OK")
"""


@pytest.mark.parametrize(
    "first",
    [
        f"import {CORE}.registry.loader",
        f"import {LEGACY}.registry.loader",
        f"import {CORE}.plugin",
        f"import {LEGACY}",
    ],
    ids=["core-first", "legacy-first", "core-plugin-first", "legacy-root-first"],
)
def test_identity_holds_whatever_is_imported_first(first: str) -> None:
    """Both import orders must work: a core-first import used to raise.

    Reproduced before the fix: `ImportError: cannot import name 'create_plugin'
    from partially initialized module 'agent_box_harness.plugin'`. The cause was
    the legacy root package importing `.plugin` eagerly while the core was still
    initialising, so the child process is the honest place to pin it.
    """
    script = textwrap.dedent(CHILD).format(first=first, legacy=LEGACY, core=CORE)
    environment = dict(os.environ)
    result = subprocess.run(
        [sys.executable, "-c", script], capture_output=True, text=True, env=environment,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip().endswith("OK")
