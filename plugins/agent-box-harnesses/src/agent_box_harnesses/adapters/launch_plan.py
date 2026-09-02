"""Private, immutable Harness LaunchPlan (Harnesses-plugin owned).

A LaunchPlan is the typed, canonical, digestable description of one launch
intent.  It is produced by a per-Harness Adapter from a typed
HarnessStartContext, is never a Runtime or Work Core type, contains no
secret values (only opaque locator refs), and performs no side effects.
Exactly one lowering path converts it into the existing Root Runtime
concrete inputs (:class:`agent_box.protocols.runtime.HarnessCommandSpec`).
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from typing import Mapping

from .native_guard import secret_field_forbidden

_ENV_KEY = re.compile(r"^[A-Z_][A-Z0-9_]{0,63}$")
_GUEST_PATH = re.compile(r"^/[A-Za-z0-9._/-]{0,255}$")
_STAGING_POLICIES = frozenset({"stage-ro", "reference"})
_MOUNT_KINDS = frozenset({"workspace", "profile-home", "executable", "skill-tree", "native-artifact"})


def _guest_path(value: str, name: str) -> str:
    if not isinstance(value, str) or not _GUEST_PATH.match(value) or ".." in value.split("/") or value.endswith("/"):
        raise ValueError(f"invalid {name}: must be a canonical absolute guest path")
    if "//" in value:
        raise ValueError(f"invalid {name}: must be a canonical absolute guest path")
    return value


def _token(value: str, name: str, limit: int = 256) -> str:
    if not isinstance(value, str) or not value or len(value) > limit or "\0" in value:
        raise ValueError(f"invalid {name}")
    return value


def _canonical_digest(payload: Mapping[str, object]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)
    return "sha256:" + hashlib.sha256(encoded.encode()).hexdigest()


@dataclass(frozen=True)
class ExecutableMemberPlan:
    """One read-only guest member of the resolved executable bundle."""

    name: str
    guest_target: str
    content_digest: str
    source_key: str

    def __post_init__(self) -> None:
        _token(self.name, "executable member name", 128)
        _guest_path(self.guest_target, "executable member guest_target")
        _token(self.content_digest, "executable member digest", 128)
        _token(self.source_key, "executable member source_key", 128)


@dataclass(frozen=True)
class ExecutablePlan:
    """How the plan consumes the typed ResolvedExecutable resolved earlier."""

    identity: str
    staging_policy: str
    members: tuple[ExecutableMemberPlan, ...] = ()
    source_digest: str = ""
    version: str = "unknown"
    warnings: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        _token(self.identity, "executable identity", 128)
        if self.staging_policy not in _STAGING_POLICIES:
            raise ValueError("invalid executable staging policy")
        if len(self.members) > 16:
            raise ValueError("too many executable members")
        if self.warnings and len(self.warnings) > 16:
            raise ValueError("too many executable warnings")
        for warning in self.warnings:
            _token(warning, "executable warning", 256)


@dataclass(frozen=True)
class MountIntent:
    """One execution-scoped source the plan intends to expose to the guest.

    ``source_key`` is resolved to a concrete host path by the single lowering
    path; the plan itself never carries a host path.
    """

    kind: str
    source_key: str
    source_digest: str
    guest_target: str
    access: str
    provenance: str = ""

    def __post_init__(self) -> None:
        if self.kind not in _MOUNT_KINDS:
            raise ValueError("invalid mount kind")
        _token(self.source_key, "mount source_key", 128)
        _token(self.source_digest, "mount source digest", 128)
        _guest_path(self.guest_target, "mount guest_target")
        if self.access not in {"ro", "rw"}:
            raise ValueError("mount access must be ro or rw")
        if self.provenance:
            _token(self.provenance, "mount provenance", 256)


@dataclass(frozen=True)
class RenderedFile:
    """One rendered native configuration file inside the profile home.

    ``authority`` names the single semantic owner; two authorities rendering
    one guest path is a composer collision, never a merge.
    """

    guest_path: str
    content_digest: str
    semantic_key: str
    authority: str
    size: int

    def __post_init__(self) -> None:
        _guest_path(self.guest_path, "rendered file guest_path")
        _token(self.content_digest, "rendered file digest", 128)
        _token(self.semantic_key, "rendered file semantic key", 128)
        _token(self.authority, "rendered file authority", 128)
        if not isinstance(self.size, int) or self.size < 0 or self.size > 262144:
            raise ValueError("rendered file size out of bounds")


@dataclass(frozen=True)
class RenderedNativeTarget:
    """In-memory rendered configuration content owned by the Composer."""

    files: tuple[RenderedFile, ...] = ()

    def __post_init__(self) -> None:
        if len(self.files) > 32:
            raise ValueError("too many rendered files")
        paths = [item.guest_path for item in self.files]
        if len(set(paths)) != len(paths):
            raise ValueError("rendered guest path collision")

    @property
    def digest(self) -> str:
        return _canonical_digest({
            "files": [(f.guest_path, f.content_digest, f.semantic_key, f.authority, f.size) for f in self.files],
        })


@dataclass(frozen=True)
class ContinuationPlan:
    """Native resume intent: a session locator plus the argv that resumes it."""

    kind: str
    session_locator: str
    argv: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        # "driver_resume" resumes through the session driver's own protocol
        # (e.g. ACP session/resume -> load -> new); its argv is empty by
        # contract because no native argv tokens may be injected.
        if self.kind not in {"native_session", "transcript_handoff", "driver_resume"}:
            raise ValueError("invalid continuation kind")
        _token(self.session_locator, "continuation session locator", 256)
        if len(self.argv) > 8 or any(not isinstance(x, str) or not x or "\0" in x or len(x) > 256 for x in self.argv):
            raise ValueError("invalid continuation argv")
        if self.kind == "driver_resume" and self.argv:
            raise ValueError("driver_resume continuation must not carry native argv")


@dataclass(frozen=True)
class SecretBinding:
    """Opaque, locator-only credential binding; never a secret value."""

    guest_target: str
    locator: str
    materializer_id: str
    access: str = "ro"

    def __post_init__(self) -> None:
        _guest_path(self.guest_target, "secret binding guest_target")
        _token(self.locator, "secret binding locator", 256)
        _token(self.materializer_id, "secret binding materializer", 128)
        if self.access != "ro":
            raise ValueError("secret bindings are read-only")
        if not self.guest_target.startswith("/runtime/home/"):
            raise ValueError("secret binding must live under the writable profile home")


@dataclass(frozen=True)
class ObservationContract:
    """Which Harness-owned decoder consumes this launch's native output."""

    decoder_id: str
    stdout_events: bool = True
    artifacts: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        _token(self.decoder_id, "observation decoder id", 128)
        if len(self.artifacts) > 8:
            raise ValueError("too many observation artifacts")
        for artifact in self.artifacts:
            _guest_path(artifact, "observation artifact")


@dataclass(frozen=True)
class LaunchPlan:
    """Private launch intent; the only side-effect-free planning product."""

    harness_type: str
    launch_mode_name: str
    argv: tuple[str, ...]
    cwd_token: str
    environment: Mapping[str, str] = field(default_factory=dict)
    io_mode: str = "stdio"
    requires_control_plane_network: bool = False
    tool_network_requirement: str = "unspecified"
    guest_directories: tuple[str, ...] = ()
    mounts: tuple[MountIntent, ...] = ()
    rendered: RenderedNativeTarget = field(default_factory=RenderedNativeTarget)
    # Content backing `rendered`, keyed by guest path.  Carried so the single
    # staging writer can materialize exactly what the plan declares; the
    # canonical digest is computed from digests only, so it stays stable.
    rendered_content: Mapping[str, bytes] = field(default_factory=dict, compare=False, repr=False)
    executable: ExecutablePlan | None = None
    continuation: ContinuationPlan | None = None
    secret_bindings: tuple[SecretBinding, ...] = ()
    observation: ObservationContract = field(default_factory=lambda: ObservationContract(decoder_id="opaque"))
    warnings: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        _token(self.harness_type, "harness_type", 128)
        _token(self.launch_mode_name, "launch_mode_name", 64)
        if not self.argv or len(self.argv) > 64 or any(not isinstance(x, str) or not x or "\0" in x or len(x) > 1024 for x in self.argv):
            raise ValueError("invalid plan argv")
        _token(self.cwd_token, "cwd_token")
        if self.io_mode not in {"stdio", "pty"}:
            raise ValueError("invalid plan io_mode")
        if not isinstance(self.requires_control_plane_network, bool):
            raise ValueError("invalid control-plane network flag")
        if self.tool_network_requirement not in {"unspecified", "none", "inherit"}:
            raise ValueError("invalid tool network requirement")
        if len(self.guest_directories) > 16:
            raise ValueError("too many guest directory requirements")
        for directory in self.guest_directories:
            _guest_path(directory, "guest directory")
        if len(self.mounts) > 16:
            raise ValueError("too many mount intents")
        if len(self.secret_bindings) > 4:
            raise ValueError("too many secret bindings")
        if len(self.warnings) > 16:
            raise ValueError("too many plan warnings")
        environment = dict(self.environment)
        if len(environment) > 64:
            raise ValueError("plan environment is too large")
        for key, value in environment.items():
            if not isinstance(key, str) or not _ENV_KEY.match(key):
                raise ValueError(f"invalid plan environment key: {key!r}")
            if secret_field_forbidden(key):
                raise ValueError("credential-shaped environment key is forbidden in a LaunchPlan")
            if not isinstance(value, str) or len(value) > 512 or "\0" in value:
                raise ValueError("invalid plan environment value")
        object.__setattr__(self, "environment", environment)
        for warning in self.warnings:
            _token(warning, "plan warning", 256)
        content = dict(self.rendered_content)
        if set(content) != {item.guest_path for item in self.rendered.files}:
            raise ValueError("rendered content does not match the rendered digest view")
        for item in self.rendered.files:
            value = content[item.guest_path]
            if not isinstance(value, bytes) or len(value) != item.size:
                raise ValueError("rendered content size mismatch")
            if hashlib.sha256(value).hexdigest() != item.content_digest.removeprefix("sha256:"):
                raise ValueError("rendered content digest mismatch")
        object.__setattr__(self, "rendered_content", content)

    def canonical(self) -> dict[str, object]:
        """Host-path-free canonical form; the digest identity of this plan."""
        return {
            "harness_type": self.harness_type,
            "launch_mode": self.launch_mode_name,
            "argv": list(self.argv),
            "cwd": self.cwd_token,
            "environment": dict(sorted(self.environment.items())),
            "io": self.io_mode,
            "network": {
                "control_plane": self.requires_control_plane_network,
                "tool": self.tool_network_requirement,
            },
            "guest_directories": list(self.guest_directories),
            "mounts": [[m.kind, m.source_key, m.source_digest, m.guest_target, m.access, m.provenance] for m in self.mounts],
            "rendered": self.rendered.digest,
            "executable": None if self.executable is None else {
                "identity": self.executable.identity,
                "staging_policy": self.executable.staging_policy,
                "version": self.executable.version,
                "members": [[m.name, m.guest_target, m.content_digest] for m in self.executable.members],
                "warnings": list(self.executable.warnings),
            },
            "continuation": None if self.continuation is None else {
                "kind": self.continuation.kind,
                "locator": self.continuation.session_locator,
                "argv": list(self.continuation.argv),
            },
            "secret_bindings": [[s.guest_target, s.locator, s.materializer_id] for s in self.secret_bindings],
            "observation": {
                "decoder_id": self.observation.decoder_id,
                "stdout_events": self.observation.stdout_events,
                "artifacts": list(self.observation.artifacts),
            },
            "warnings": list(self.warnings),
        }

    @property
    def digest(self) -> str:
        return _canonical_digest(self.canonical())

    def rendered_target(self):
        """Rebuild the composer-level RenderedTarget from carried content."""
        from .composer import FinalFile, RenderedTarget

        return RenderedTarget(tuple(
            FinalFile(item.guest_path, self.rendered_content[item.guest_path], item.semantic_key, item.authority)
            for item in self.rendered.files
        ))


__all__ = [
    "ContinuationPlan",
    "ExecutableMemberPlan",
    "ExecutablePlan",
    "LaunchPlan",
    "MountIntent",
    "ObservationContract",
    "RenderedFile",
    "RenderedNativeTarget",
    "SecretBinding",
]
