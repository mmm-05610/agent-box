from __future__ import annotations
import hashlib
import tomllib
from dataclasses import dataclass
from importlib import resources
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

def load_builtin_registry() -> HarnessRegistry:
    text = resources.files("agent_box_harnesses").joinpath("harnesses.toml").read_text(encoding="utf-8")
    return load_registry(text)
