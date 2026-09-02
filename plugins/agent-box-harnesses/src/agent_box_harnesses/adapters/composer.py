"""Harness-owned semantic composition boundary (determined repair F).

Canonical resource fragments are produced from resource contracts (Profile,
Skill); rendering them into native target files is Harness-owned.  The
composer enforces, before any side effect:

* same semantic key + same value -> deduplicated to one file;
* same semantic key + different value -> a typed conflict (no silent merge);
* one final guest target may have exactly one artifact authority;
* priority-based override does not exist — only an explicit same-owner
  replace policy may supersede an earlier fragment of the same owner.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Sequence

MAX_FILE_BYTES = 262144
MAX_FILES = 32

_POLICIES = frozenset({"conflict", "same-owner-replace"})


def content_digest_bytes(content: bytes) -> str:
    return "sha256:" + hashlib.sha256(content).hexdigest()


@dataclass(frozen=True)
class CandidateFile:
    """One harness-rendered candidate for the native target."""

    guest_path: str
    content: bytes
    semantic_key: str
    authority: str
    policy: str = "conflict"

    def __post_init__(self) -> None:
        for name, value in (("guest_path", self.guest_path), ("semantic_key", self.semantic_key), ("authority", self.authority)):
            if not isinstance(value, str) or not value or len(value) > 256 or "\0" in value:
                raise ValueError(f"invalid candidate {name}")
        if not isinstance(self.content, bytes) or len(self.content) > MAX_FILE_BYTES:
            raise ValueError("candidate content out of bounds")
        if self.policy not in _POLICIES:
            raise ValueError("invalid candidate merge policy")
        if not self.guest_path.startswith("/") or ".." in self.guest_path.split("/") or self.guest_path.endswith("/"):
            raise ValueError("candidate guest_path must be canonical and absolute")


class CompositionConflict(ValueError):
    """Typed composition failure; carries a bounded, non-secret code."""

    def __init__(self, code: str, detail: str = "") -> None:
        self.code = code
        super().__init__(f"{code}: {detail}" if detail else code)


@dataclass(frozen=True)
class RenderedTarget:
    """The composed native target: final files plus their authorities."""

    files: tuple["FinalFile", ...]

    def __post_init__(self) -> None:
        if len(self.files) > MAX_FILES:
            raise ValueError("too many rendered files")
        paths = [item.guest_path for item in self.files]
        if len(set(paths)) != len(paths):
            raise ValueError("rendered guest path collision")

    @property
    def content_bytes(self) -> int:
        return sum(len(item.content) for item in self.files)


@dataclass(frozen=True)
class FinalFile:
    guest_path: str
    content: bytes
    semantic_key: str
    authority: str

    @property
    def digest(self) -> str:
        return content_digest_bytes(self.content)


def compose(candidates: Sequence[CandidateFile]) -> RenderedTarget:
    """Merge candidates under the semantic-key rules; fail closed on conflict."""
    by_key: dict[str, FinalFile] = {}
    for candidate in candidates:
        digest = candidate.content
        existing = by_key.get(candidate.semantic_key)
        if existing is not None:
            if existing.guest_path == candidate.guest_path and existing.content == digest:
                continue  # identical semantic key + value: dedupe
            if (candidate.policy == "same-owner-replace" and existing.semantic_key == candidate.semantic_key
                    and existing.authority == candidate.authority):
                by_key[candidate.semantic_key] = FinalFile(candidate.guest_path, candidate.content, candidate.semantic_key, candidate.authority)
                continue
            raise CompositionConflict(
                "SEMANTIC_KEY_CONFLICT",
                f"semantic key {candidate.semantic_key!r} rendered twice with different values "
                f"({existing.authority} vs {candidate.authority})",
            )
        by_key[candidate.semantic_key] = FinalFile(candidate.guest_path, candidate.content, candidate.semantic_key, candidate.authority)

    files = tuple(by_key.values())
    by_path: dict[str, FinalFile] = {}
    for item in files:
        prior = by_path.get(item.guest_path)
        if prior is not None and prior.semantic_key != item.semantic_key:
            raise CompositionConflict(
                "GUEST_TARGET_AUTHORITY_COLLISION",
                f"guest target {item.guest_path} claimed by {prior.semantic_key} and {item.semantic_key}",
            )
        by_path[item.guest_path] = item
    return RenderedTarget(files)


__all__ = [
    "CandidateFile",
    "CompositionConflict",
    "FinalFile",
    "RenderedTarget",
    "compose",
    "content_digest_bytes",
]
