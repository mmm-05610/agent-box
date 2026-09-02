"""Policy-aware native home tree walking, copying and digesting.

Every tree operation classifies paths through the per-Harness
``NativeHomePolicy`` and then applies the frozen rules:

* CREDENTIAL paths       -> never copied, never snapshotted, never read;
* EPHEMERAL paths        -> never copied, never snapshotted (skipped);
* SESSION paths          -> copied/persisted as native state;
* SKILL / CONFIG paths   -> copied; never reconciled back over management;
* UNKNOWN plain files    -> preserved (copied, and reconciled back);
* symlinks               -> REJECT (fail closed, no partial copy);
* socket/device/fifo     -> SKIP (runtime artifacts, never persisted);
* lock-shaped names      -> SKIP (ephemeral).

Limits (``max_files``/``max_tree_bytes``) come from the policy; a native
home beyond the bounds is rejected typed, never truncated.
"""
from __future__ import annotations

import hashlib
import json
import os
import stat
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Mapping, Sequence

from agent_box.protocols.runtime.protocol import content_digest

from .failures import NativeHomeError, TREE_FORBIDDEN_KIND, TREE_PATH_ESCAPE
from .policy import CREDENTIAL, EPHEMERAL, NativeHomePolicy

LOCK_SUFFIXES = (".lock", ".pid", ".sock")
MAX_DEPTH = 64

_NON_REGULAR = {
    "socket": lambda mode: stat.S_ISSOCK(mode),
    "device": lambda mode: stat.S_ISCHR(mode) or stat.S_ISBLK(mode),
    "fifo": lambda mode: stat.S_ISFIFO(mode),
}


class NativeHomeTreeError(NativeHomeError):
    code = "NATIVE_HOME_TREE"


@dataclass(frozen=True)
class TreeEntry:
    """One classified entry of a native home tree walk (content-free)."""

    relative: str
    kind: str  # policy classification
    is_dir: bool


@dataclass(frozen=True)
class TreeWalk:
    entries: tuple[TreeEntry, ...]
    skipped: tuple[str, ...] = ()   # ephemeral/credential/special skipped relpaths
    rejected: tuple[str, ...] = ()  # fail-closed rejected relpaths (empty on success)

    @property
    def files(self) -> tuple[str, ...]:
        return tuple(entry.relative for entry in self.entries if not entry.is_dir)


def relative_of(root: Path, item: Path) -> str:
    try:
        relative = item.relative_to(root).as_posix()
    except ValueError as exc:
        raise NativeHomeTreeError(TREE_PATH_ESCAPE, str(item)) from exc
    if relative == ".":
        raise NativeHomeTreeError(TREE_PATH_ESCAPE, "root itself is not an entry")
    return relative


def classify_path(policy: NativeHomePolicy, relative: str) -> str:
    """Classify one path, refusing escapes and special names deterministically."""
    if not relative or relative.startswith("/") or ".." in relative.split("/") or "\x00" in relative:
        raise NativeHomeTreeError(TREE_PATH_ESCAPE, relative[:128])
    return policy.classify(relative)


def walk_tree(policy: NativeHomePolicy, root: Path, *, guest_prefix: str = "") -> TreeWalk:
    """Content-free classified walk; never reads file bytes or credential paths.

    ``guest_prefix`` prefixes every entry for classification when the walked
    directory is not itself the native-home root (legacy imports map an old
    harness config dir under its guest-relative location, e.g. ``.claude``).
    """
    if guest_prefix and (guest_prefix.startswith("/") or ".." in guest_prefix.split("/")):
        raise NativeHomeTreeError(TREE_PATH_ESCAPE, guest_prefix[:128])
    if root.is_symlink() or not root.is_dir():
        raise NativeHomeTreeError("NATIVE_HOME_ROOT_INVALID", str(root))
    entries: list[TreeEntry] = []
    skipped: list[str] = []
    rejected: list[str] = []
    for item in sorted(root.rglob("*")):
        try:
            relative = relative_of(root, item)
        except NativeHomeTreeError:
            raise
        classified = f"{guest_prefix}/{relative}" if guest_prefix else relative
        if len(classified.split("/")) > MAX_DEPTH:
            raise NativeHomeTreeError("NATIVE_HOME_DEPTH_LIMIT", classified[:128])
        if item.is_symlink():
            # fail closed: a symlink inside the native home is never followed
            # and never silently dropped; the operation aborts typed.
            rejected.append(classified)
            continue
        kind = classify_path(policy, classified)
        if kind in {CREDENTIAL, EPHEMERAL}:
            skipped.append(classified)
            continue
        mode = item.stat(follow_symlinks=False).st_mode
        special = next((name for name, test in _NON_REGULAR.items() if test(mode)), None)
        if special is not None:
            # runtime artifacts (sockets/devices/fifos) are not persistable;
            # they are skipped like ephemeral state, never deleted.
            skipped.append(classified)
            continue
        if not item.is_dir() and classified.endswith(LOCK_SUFFIXES):
            skipped.append(classified)
            continue
        entries.append(TreeEntry(classified, kind, item.is_dir()))
        if len(entries) > policy.max_files:
            raise NativeHomeTreeError("NATIVE_HOME_FILE_LIMIT", str(policy.max_files))
    if rejected:
        raise NativeHomeTreeError(
            TREE_FORBIDDEN_KIND,
            "native home contains a symlink: " + ",".join(sorted(rejected)[:8]),
        )
    return TreeWalk(tuple(sorted(entries, key=lambda entry: entry.relative)), tuple(sorted(skipped)))


def digest_tree(policy: NativeHomePolicy, root: Path) -> str:
    """Credential-free canonical digest of a classified native home tree."""
    walk = walk_tree(policy, root)
    rows: list[tuple[str, str, str]] = []
    total = 0
    for entry in walk.entries:
        item = root / entry.relative
        if entry.is_dir:
            rows.append((entry.relative, "dir", ""))
            continue
        data = item.read_bytes()
        total += len(data)
        if total > policy.max_tree_bytes:
            raise NativeHomeTreeError("NATIVE_HOME_SIZE_LIMIT", str(total))
        rows.append((entry.relative, "file", hashlib.sha256(data).hexdigest()))
    canonical = json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()
    return "sha256:" + hashlib.sha256(canonical).hexdigest()


def copy_tree(policy: NativeHomePolicy, source: Path, destination: Path, *, limit_bytes: int | None = None) -> tuple[int, tuple[str, ...]]:
    """Copy a classified native home tree into a fresh destination.

    Raises typed ``NativeHomeTreeError`` on a symlink or on limit violations
    (no partial result is reported as success); never copies credential or
    ephemeral paths and never follows symlinks.  Returns the number of
    copied FILE entries plus the skipped relative paths.
    """
    if destination.exists():
        raise NativeHomeTreeError("NATIVE_HOME_DESTINATION_EXISTS", str(destination))
    walk = walk_tree(policy, source)
    destination.mkdir(mode=0o700, parents=True)
    total_bytes = 0
    file_count = 0
    try:
        for entry in walk.entries:
            src = source / entry.relative
            dst = destination / entry.relative
            if entry.is_dir:
                dst.mkdir(mode=0o700)
                continue
            data = src.read_bytes()
            total_bytes += len(data)
            if total_bytes > (limit_bytes or policy.max_tree_bytes):
                raise NativeHomeTreeError("NATIVE_HOME_SIZE_LIMIT", str(total_bytes))
            dst.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            dst.write_bytes(data)
            try:
                os.chmod(dst, 0o600)
            except OSError:
                pass
            file_count += 1
    except Exception:
        import shutil

        shutil.rmtree(destination, ignore_errors=True)
        raise
    return file_count, walk.skipped


def read_manifest(policy: NativeHomePolicy, root: Path) -> Mapping[str, str]:
    """Bounded base manifest {relative: sha256} of classified FILES at a point.

    Used by reconciliation to decide what changed in an execution view
    without reading the bytes twice.  Credential/ephemeral paths never
    appear.
    """
    walk = walk_tree(policy, root)
    manifest: dict[str, str] = {}
    total = 0
    for entry in walk.entries:
        if entry.is_dir:
            continue
        data = (root / entry.relative).read_bytes()
        total += len(data)
        if total > policy.max_tree_bytes:
            raise NativeHomeTreeError("NATIVE_HOME_SIZE_LIMIT", str(total))
        manifest[entry.relative] = hashlib.sha256(data).hexdigest()
    return manifest


def ensure_plain_directory(path: Path, mode: int = 0o700) -> None:
    """Create one host directory, refusing symlinked parents and bad modes."""
    path = Path(path).resolve()
    if path.exists():
        if path.is_symlink() or not path.is_dir():
            raise NativeHomeTreeError("NATIVE_HOME_PATH_UNSAFE", str(path))
        return
    parent = path.parent
    ensure_plain_directory(parent, mode)
    path.mkdir(mode=mode)


__all__ = [
    "NativeHomeTreeError",
    "TreeEntry",
    "TreeWalk",
    "classify_path",
    "copy_tree",
    "digest_tree",
    "ensure_plain_directory",
    "read_manifest",
    "relative_of",
    "walk_tree",
]