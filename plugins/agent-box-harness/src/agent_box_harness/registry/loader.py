from __future__ import annotations
import hashlib
import importlib.util
import tomllib
from dataclasses import dataclass
from pathlib import Path
from .schema import HarnessDefinition, definition_from_dict

@dataclass(frozen=True)
class RegistryDiagnostics:
    digest: str
    errors: tuple[str, ...] = ()

class HarnessRegistry:
    def __init__(self, definitions, digest, diagnostics=()):
        self._definitions = {d.harness_type: d for d in definitions}
        self.digest = digest
        self.diagnostics = RegistryDiagnostics(digest, tuple(diagnostics))
    def get(self, harness_type): return self._definitions[harness_type]
    def all(self): return tuple(self._definitions[k] for k in sorted(self._definitions))
    def __len__(self): return len(self._definitions)

def load_registry(text: str) -> HarnessRegistry:
    raw = tomllib.loads(text)
    if raw.get("schema_version") != 1: raise ValueError("unsupported registry schema_version")
    entries = raw.get("harness", [])
    if not isinstance(entries, list) or len(entries) > 16: raise ValueError("invalid harness registry")
    defs = []; seen = set(); drivers = set()
    for entry in entries:
        definition = definition_from_dict(entry)
        if definition.harness_type in seen: raise ValueError("duplicate harness_type")
        if definition.driver in drivers: raise ValueError("duplicate driver")
        seen.add(definition.harness_type); drivers.add(definition.driver); defs.append(definition)
    digest = "sha256:" + hashlib.sha256(text.encode()).hexdigest()
    return HarnessRegistry(tuple(defs), digest)

def _builtin_registry_resource() -> Path:
    """Locate the declarative registry, which batch P-A① left in the legacy package.

    The data file (`harnesses.toml`) is a declaration, not code, and the approval
    moved only code, so the one copy of it still lives in `agent_box_harnesses`.
    It is located from that package's *spec*: `importlib.util.find_spec` does not
    execute the package, and that matters here. Every legacy module name is a
    facade that imports this package, so executing the legacy package while this
    module is still initialising re-enters the core and raises
    `ImportError: cannot import name 'create_plugin' from partially initialized
    module 'agent_box_harness.plugin'` (reproduced on a core-first import before
    this fix). Reading the same file by path keeps the two import orders
    equivalent and reads byte-identical text, so the registry digest is unchanged.
    """
    spec = importlib.util.find_spec("agent_box_harnesses")
    locations = list(getattr(spec, "submodule_search_locations", None) or ())
    if not locations:
        raise RuntimeError("HARNESS_REGISTRY_RESOURCE_NOT_FOUND")
    return Path(locations[0]) / "harnesses.toml"


def load_builtin_registry() -> HarnessRegistry:
    text = _builtin_registry_resource().read_text(encoding="utf-8")
    return load_registry(text)
