"""Migration of legacy profile inputs into the one Profile Native Home.

Two inputs are covered:

1. Agent-Box 1.x full directory (``~/.claude``, ``~/.codex``, ...):
   preview inventory -> exclude known credential/special paths -> preserve
   unknown safe files -> import under the policy's guest-relative location
   -> record provenance.  The source directory is never deleted.
2. Current envelope-only profiles: seed a minimum, correct native config
   (rendered by the Harness owner) into one fresh native home and mark
   provenance ``MIGRATED_FROM_ENVELOPE``; never claims to restore files
   that never existed.

Credential content is never read; dangerous symlinks are never followed;
nothing unknown is silently deleted.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping, Sequence

from .failures import (
    PROFILE_NATIVE_HOME_MISSING,
    ProfileNativeHomeError,
)
from .layout import ProfileLayout
from .policy import CONFIG_AUTHORITY, NativeHomePolicy, policy_for
from .tree import NativeHomeTreeError, TREE_FORBIDDEN_KIND, walk_tree

# Canonical legacy import locations and their guest-home-relative mapping.
# Evidence: harness-native-knowledge-2026-09-01/harnesses/<id>/FACTS.md.
LEGACY_IMPORT_SOURCES: Mapping[str, tuple[str, str]] = {
    # (default source directory, guest-relative target below native-home)
    "codex": ("~/.codex", ".codex"),               # FACTS D1
    "claude-code": ("~/.claude", ".claude"),       # FACTS D1/E5
    "opencode": ("~/.config/opencode", ".config/opencode"),  # FACTS D (XDG config)
    "hermes": ("~/.hermes", ".hermes"),            # FACTS E28
    "pi": ("~/.pi/agent", ""),                     # FACTS D1/D2 (agent dir root)
}

MIGRATED_FROM_ENVELOPE = "MIGRATED_FROM_ENVELOPE"
IMPORTED_FROM_LEGACY = "IMPORTED_FROM_LEGACY_DIR"


@dataclass(frozen=True)
class LegacyImportPreview:
    source: str
    guest_relative: str
    entries: int = 0
    by_kind: Mapping[str, int] = field(default_factory=dict)
    excluded: tuple[str, ...] = ()      # credential/ephemeral/special skipped
    forbidden: tuple[str, ...] = ()     # symlinks -> reject (never followed)
    conflicts: tuple[str, ...] = ()     # already present in the native home
    digest: str = ""

    def public(self) -> dict[str, object]:
        # frozen: never expose the host-absolute source path; the content
        # digest is the bounded, path-free provenance fingerprint
        return {
            "source_fingerprint": self.digest[:16],
            "guest_relative": self.guest_relative,
            "entries": self.entries,
            "by_kind": dict(self.by_kind),
            "excluded": list(self.excluded)[:64],
            "forbidden": list(self.forbidden)[:64],
            "conflicts": list(self.conflicts)[:64],
            "digest": self.digest,
        }


def import_source_for(harness_type: str) -> tuple[str, str]:
    try:
        return LEGACY_IMPORT_SOURCES[harness_type]
    except KeyError as exc:
        raise KeyError(f"NO_LEGACY_IMPORT_SOURCE:{harness_type}") from exc


def preview_legacy_import(policy: NativeHomePolicy, source: Path, *, guest_relative: str = "") -> LegacyImportPreview:
    """Preview a legacy directory; never reads credential content."""
    source = Path(source).expanduser().resolve()
    if not source.is_dir() or source.is_symlink():
        raise ProfileNativeHomeError("LEGACY_SOURCE_DIRECTORY_REQUIRED", str(source))
    if guest_relative and (guest_relative.startswith("/") or ".." in guest_relative.split("/")):
        raise ProfileNativeHomeError("LEGACY_GUEST_RELATIVE_INVALID", guest_relative)
    try:
        walk, digest = _walk_digest(policy, source, guest_relative)
    except NativeHomeTreeError as exc:
        if exc.code == TREE_FORBIDDEN_KIND:
            # surfaced as a preview-time exit; the caller owns the decision
            # (the import itself stays fail closed)
            raise ProfileNativeHomeError("LEGACY_IMPORT_FORBIDDEN", exc.args[0][:256]) from exc
        raise
    counts: dict[str, int] = {}
    for entry in walk.entries:
        counts[entry.kind] = counts.get(entry.kind, 0) + 1
    return LegacyImportPreview(
        source=str(source),
        guest_relative=guest_relative,
        entries=len(walk.entries),
        by_kind=counts,
        excluded=walk.skipped,
        forbidden=(),
        conflicts=(),
        digest=digest,
    )


def preview_conflicts(policy: NativeHomePolicy, layout: ProfileLayout, preview: LegacyImportPreview) -> LegacyImportPreview:
    """Compute conflicts against the current native home (read-only).

    A conflict is a file the import would bring that already exists in the
    native home; conflicting targets are skipped at perform time (the
    existing file wins, nothing is overwritten without a new revision).
    """
    source = Path(preview.source).expanduser().resolve()
    if not source.is_dir() or source.is_symlink():
        return preview
    legacy_walk = walk_tree(policy, source, guest_prefix=preview.guest_relative)
    legacy_files = {entry.relative for entry in legacy_walk.entries if not entry.is_dir}
    home = layout.native_home
    if home.is_dir() and not home.is_symlink():
        home_files = {entry.relative for entry in walk_tree(policy, home).entries if not entry.is_dir}
    else:
        home_files = set()
    conflicts = tuple(sorted(legacy_files & home_files))
    return LegacyImportPreview(
        source=preview.source, guest_relative=preview.guest_relative,
        entries=preview.entries, by_kind=preview.by_kind,
        excluded=preview.excluded, forbidden=preview.forbidden,
        conflicts=conflicts, digest=preview.digest,
    )


def perform_legacy_import(policy: NativeHomePolicy, layout: ProfileLayout, source: Path, *, guest_relative: str = "", expected_preview_digest: str | None = None) -> dict[str, object]:
    """Import one legacy directory into the native home.

    Fail closed when the tree changed since preview; credential/ephemeral
    paths are skipped; conflicts keep the existing native-home file (the
    legacy source is never altered).  Returns bounded import statistics.
    """
    source = Path(source).expanduser().resolve()
    if not source.is_dir() or source.is_symlink():
        raise ProfileNativeHomeError("LEGACY_SOURCE_DIRECTORY_REQUIRED", str(source))
    walk, preview_digest = _walk_digest(policy, source, guest_relative)
    if expected_preview_digest and preview_digest != expected_preview_digest:
        raise ProfileNativeHomeError("LEGACY_IMPORT_PREVIEW_DRIFT", preview_digest[:24])
    if not layout.native_home.exists():
        raise ProfileNativeHomeError(PROFILE_NATIVE_HOME_MISSING, layout.profile_id)
    copied: list[str] = []
    skipped_visible: list[str] = []
    prefix = f"{guest_relative}/" if guest_relative else ""
    for entry in walk.entries:
        if entry.is_dir:
            continue
        raw = entry.relative[len(prefix):] if prefix else entry.relative
        destination = (layout.native_home / entry.relative).resolve()
        if layout.native_home not in destination.parents or destination == layout.native_home:
            raise ProfileNativeHomeError("LEGACY_IMPORT_PATH_ESCAPE", entry.relative)
        if destination.exists():
            skipped_visible.append(entry.relative)
            continue
        destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        shutil.copy2(source / raw, destination)
        try:
            os.chmod(destination, 0o600)
        except OSError:
            pass
        copied.append(entry.relative)
    return {
        "copied": len(copied),
        "copied_paths": tuple(copied)[:128],
        "skipped": tuple((*walk.skipped, *skipped_visible))[:128],
        "source_untouched": True,
        "guest_relative": guest_relative,
    }


def seed_envelope_config(layout: ProfileLayout, payload: Mapping[str, object], render_config) -> dict[str, object]:
    """Seed a minimal native home from an envelope payload (7.2).

    ``render_config`` is the Harness-owned renderer: payload -> sequence of
    (guest-home-relative path, bytes).  Only paths classified as
    ``CONFIG_AUTHORITY`` by the policy are written; the renderer decides the
    content, Agent-Box never invents native files.  Idempotent: an existing
    managed config file is left untouched.
    """
    home = layout.native_home
    if not home.exists():
        home.mkdir(mode=0o700, parents=True)
    policy = policy_for(layout.harness_type)
    written: list[str] = []
    for relative, content in render_config(payload):
        if policy.classify(relative) != CONFIG_AUTHORITY:
            continue
        target = (home / relative).resolve()
        if layout.native_home not in target.parents and target != home:
            raise ProfileNativeHomeError("SEED_PATH_ESCAPE", relative[:128])
        if target.exists():
            continue
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        target.write_bytes(content)
        try:
            os.chmod(target, 0o600)
        except OSError:
            pass
        written.append(relative)
    return {"seeded": len(written), "seeded_paths": tuple(written)}


def walk_legacy_source(policy: NativeHomePolicy, source: Path, guest_relative: str):
    """Public helper: classified walk + content-aware digest (path-free).

    Credential paths are classified BEFORE any read; the returned digest is
    the bounded provenance fingerprint of the source.
    """
    return _walk_digest(policy, source, guest_relative)


def _walk_digest(policy: NativeHomePolicy, source: Path, guest_relative: str) -> tuple[object, str]:
    """Walk + content-aware inventory digest (credential paths never read)."""
    walk = walk_tree(policy, source, guest_prefix=guest_relative)
    prefix = f"{guest_relative}/" if guest_relative else ""
    rows: list[tuple[str, str, str]] = []
    for entry in walk.entries:
        if entry.is_dir:
            rows.append((entry.relative, "dir", ""))
            continue
        raw = entry.relative[len(prefix):] if prefix else entry.relative
        rows.append((entry.relative, "file", hashlib.sha256((source / raw).read_bytes()).hexdigest()))
    digest = "sha256:" + hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return walk, digest


__all__ = [
    "IMPORTED_FROM_LEGACY",
    "LEGACY_IMPORT_SOURCES",
    "LegacyImportPreview",
    "MIGRATED_FROM_ENVELOPE",
    "import_source_for",
    "perform_legacy_import",
    "preview_conflicts",
    "preview_legacy_import",
    "seed_envelope_config",
]