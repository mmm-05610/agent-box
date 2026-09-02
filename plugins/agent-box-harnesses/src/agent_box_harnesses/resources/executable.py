"""Typed executable resolution and availability probing (Resolver/Probe owner).

This module owns the host-facing, side-effect-bounded discovery of a
Harness executable: PATH resolution, official bundle-member verification, a
safe ``--version`` probe and content digests.  Adapters never scan PATH and
never spawn processes; they only consume the typed
:class:`ResolvedExecutable` produced here.
"""
from __future__ import annotations

import hashlib
import json
import os
import platform
import stat
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping

from ..registry.schema import ExecutableSpec

GUEST_BIN_ROOT = "/runtime/bin"
PROBE_TIMEOUT_SECONDS = 10
_RESOLVER_KINDS = frozenset({"PATH", "PATH_OR_BUNDLE"})


class ExecutableResolutionError(ValueError):
    pass


@dataclass(frozen=True)
class ExecutableMember:
    """One exact member of the resolved executable bundle."""

    name: str
    path: Path
    digest: str
    mode: int
    kind: str = "executable"

    def __post_init__(self) -> None:
        if not self.name or len(self.name) > 128 or "/" in self.name or "\0" in self.name:
            raise ValueError("invalid executable member name")
        if not self.digest.startswith("sha256:"):
            raise ValueError("invalid executable member digest")


@dataclass(frozen=True)
class ResolvedExecutable:
    """Typed resolution product consumed by Adapters and lowering."""

    identity: str
    resolver_kind: str
    source_path: Path
    digest: str
    version: str
    probe_argv: tuple[str, ...]
    members: tuple[ExecutableMember, ...] = ()
    platform_metadata: Mapping[str, str] = field(default_factory=dict)
    warnings: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        for name, value in (("identity", self.identity), ("resolver_kind", self.resolver_kind), ("version", self.version)):
            if not isinstance(value, str) or not value or len(value) > 128:
                raise ValueError(f"invalid resolved executable {name}")
        if self.resolver_kind not in _RESOLVER_KINDS:
            raise ValueError("invalid resolver kind")
        if not isinstance(self.source_path, Path) or not self.source_path.is_absolute():
            raise ValueError("resolved executable path must be absolute")
        if not self.digest.startswith("sha256:"):
            raise ValueError("invalid resolved executable digest")
        if len(self.members) > 16:
            raise ValueError("too many executable members")
        if len(self.warnings) > 8:
            raise ValueError("too many executable warnings")
        object.__setattr__(self, "platform_metadata", dict(self.platform_metadata))

    def guest_target(self, name: str | None = None) -> str:
        member = name or self.identity
        return f"{GUEST_BIN_ROOT}/{member}"

    @property
    def main_member(self) -> ExecutableMember:
        for member in self.members:
            if member.name == self.identity:
                return member
        raise ExecutableResolutionError("EXECUTABLE_MAIN_MEMBER_MISSING")

    @property
    def available(self) -> bool:
        return self.version != "unavailable"


def _file_digest(path: Path) -> str:
    if path.is_symlink() or not path.exists() or not path.is_file():
        raise ExecutableResolutionError("EXECUTABLE_SOURCE_UNAVAILABLE")
    if not stat.S_ISREG(path.stat().st_mode):
        raise ExecutableResolutionError("EXECUTABLE_SOURCE_NOT_REGULAR")
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def _probe_version(path: Path, probe_argv: tuple[str, ...]) -> tuple[str, tuple[str, ...]]:
    """Safe ``--version`` probe: bounded output, no model request, no HOME writes."""
    argv = [str(path), *probe_argv]
    try:
        completed = subprocess.run(
            argv, stdin=subprocess.DEVNULL, capture_output=True, text=True,
            timeout=PROBE_TIMEOUT_SECONDS, shell=False, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return "unavailable", (f"VERSION_PROBE_FAILED:{type(exc).__name__}",)
    if completed.returncode != 0:
        return "unavailable", (f"VERSION_PROBE_EXIT_{completed.returncode}",)
    first_line = (completed.stdout or "").splitlines()
    version = first_line[0].strip()[:64] if first_line else ""
    if not version:
        return "unavailable", ("VERSION_PROBE_EMPTY",)
    if not all(character.isprintable() for character in version):
        return "unavailable", ("VERSION_PROBE_UNPRINTABLE",)
    return version, ()


def _native_elf_x86_64(path: Path) -> bool:
    try:
        with path.open("rb") as handle:
            header = handle.read(20)
        import struct

        return (header[:4] == b"\x7fELF" and header[4] == 2 and header[5] == 1
                and struct.unpack_from("<H", header, 18)[0] == 62)
    except OSError:
        return False


def _official_codex_npm_native(source: Path) -> Path | None:
    """Expand the official @openai/codex npm layout to its native binary.

    The npm `codex` entry is a Node launcher (FACTS A3); the staged guest
    binary must be the platform-native Rust binary.  Layout facts and the
    metadata contract are evidence-backed (codex FACTS B2, identity matrix
    §4; layoutVersion==1 / target / entrypoint metadata).
    """
    parts = source.parts
    if source.name != "codex.js" or len(parts) < 4:
        return None
    if source.parent.name != "bin" or source.parent.parent.name != "codex" or source.parent.parent.parent.name != "@openai":
        return None
    package_root = source.parent.parent
    vendor = package_root / "node_modules" / "@openai" / "codex-linux-x64" / "vendor" / "x86_64-unknown-linux-musl"
    metadata_path = vendor / "codex-package.json"
    native = vendor / "bin" / "codex"
    try:
        import json as _json

        metadata = _json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(metadata, dict) or metadata.get("layoutVersion") != 1 or metadata.get("entrypoint") != "bin/codex":
        return None
    if metadata.get("target") != "x86_64-unknown-linux-musl":
        return None
    if not native.is_file() or native.is_symlink() or not os.access(native, os.X_OK) or not _native_elf_x86_64(native):
        return None
    return native


def resolve_executable(spec: ExecutableSpec, *, search_path: str | None = None, probe: bool = True) -> ResolvedExecutable:
    """Resolve the declared executable identity to a typed value.

    ``search_path`` overrides the host PATH (used by offline synthetic
    fixtures); resolution never depends on a developer HOME.
    """
    if spec.resolver_kind not in _RESOLVER_KINDS:
        raise ExecutableResolutionError("UNSUPPORTED_EXECUTABLE_RESOLVER")
    identity = spec.identity
    search = search_path if search_path is not None else os.environ.get("PATH", "")
    source: Path | None = None
    for directory in search.split(":"):
        if not directory:
            continue
        candidate = Path(directory) / identity
        try:
            if not candidate.is_file() or not os.access(candidate, os.X_OK):
                continue
            # Official native layouts ship the binary behind a symlink (npm
            # bin links, `claude` native installer, ...).  Canonicalize and
            # digest the real regular file instead of rejecting the link.
            resolved = candidate.resolve(strict=True)
        except OSError:
            continue
        if resolved.is_file() and os.access(resolved, os.X_OK) and stat.S_ISREG(resolved.stat().st_mode):
            source = resolved
            break
    if source is None:
        raise ExecutableResolutionError(f"EXECUTABLE_NOT_FOUND:{identity}")

    warnings: list[str] = []
    if spec.identity == "codex" and spec.resolver_kind == "PATH_OR_BUNDLE":
        native = _official_codex_npm_native(source)
        if native is not None:
            source = native
        else:
            warnings.append("CODEX_NPM_LAUNCHER_STAGED_WITHOUT_NATIVE_BINARY")
    version = "unknown"
    if probe and spec.version_probe:
        version, probe_warnings = _probe_version(source, spec.version_probe)
        warnings.extend(probe_warnings)

    digest = _file_digest(source)
    members = [ExecutableMember(identity, source, digest, stat.S_IMODE(source.stat().st_mode))]
    for member_name in spec.bundle_members:
        sibling = source.parent / member_name
        try:
            if sibling.is_symlink():
                sibling = sibling.resolve(strict=True)
        except OSError:
            raise ExecutableResolutionError(f"EXECUTABLE_BUNDLE_MEMBER_MISSING:{member_name}") from None
        if not sibling.is_file() or sibling.is_symlink() or not os.access(sibling, os.X_OK):
            raise ExecutableResolutionError(f"EXECUTABLE_BUNDLE_MEMBER_MISSING:{member_name}")
        members.append(ExecutableMember(member_name, sibling, _file_digest(sibling), stat.S_IMODE(sibling.stat().st_mode), "companion"))

    return ResolvedExecutable(
        identity=identity,
        resolver_kind=spec.resolver_kind,
        source_path=source,
        digest=digest,
        version=version,
        probe_argv=tuple(spec.version_probe),
        members=tuple(members),
        platform_metadata={
            "system": platform.system().lower()[:32],
            "machine": platform.machine().lower()[:32],
            "bundle_members": json.dumps(list(spec.bundle_members)),
        },
        warnings=tuple(warnings),
    )


__all__ = [
    "ExecutableMember",
    "ExecutableResolutionError",
    "ResolvedExecutable",
    "GUEST_BIN_ROOT",
    "resolve_executable",
]
