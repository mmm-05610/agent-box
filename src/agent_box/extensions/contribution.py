"""Kernel-owned, semantic-free contribution records."""
from __future__ import annotations
from dataclasses import dataclass
import re

_KIND = re.compile(r"^[a-z0-9][a-z0-9.-]*\.[a-z0-9][a-z0-9.-]*@[1-9][0-9]*$")

@dataclass(frozen=True)
class ContributionDescriptor:
    kind: str
    component_id: str
    api_version: int = 1

    def __post_init__(self):
        if not isinstance(self.kind, str) or not _KIND.fullmatch(self.kind):
            raise ValueError("contribution kind must be namespaced and versioned")
        if not isinstance(self.component_id, str) or not self.component_id:
            raise ValueError("contribution component_id is required")
        if not isinstance(self.api_version, int) or self.api_version < 1:
            raise ValueError("contribution api_version must be positive")

@dataclass(frozen=True)
class CatalogContribution:
    descriptor: ContributionDescriptor
    component: object
    def __post_init__(self):
        if not isinstance(self.descriptor, ContributionDescriptor):
            raise TypeError("descriptor must be ContributionDescriptor")
        if self.component is None:
            raise TypeError("catalog contribution component is required")

__all__ = ["ContributionDescriptor", "CatalogContribution"]
