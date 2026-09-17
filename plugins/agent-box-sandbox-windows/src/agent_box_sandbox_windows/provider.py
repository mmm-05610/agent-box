"""The Windows implementation of the neutral sandbox seam (Order 48, D5 shape).

What this provider is, first-hand (see docs/server-round1/fullstack/windows-spike.md):

* **A Job Object, not a container.** The spike's containers cannot start a
  process on this machine (0xC0000142 across six combinations), and an
  AppContainer token is Low integrity, so writes to ordinary user directories
  are denied by MIC while lowering a directory's integrity label needs rights a
  non-admin does not hold. The provider therefore delivers the life-cycle and
  materialisation half of the seam and declares the isolation half unavailable:
  * read isolation: **false** (no boundary exists: the harness process is an
    ordinary process of this user),
  * write isolation: **false** (same reason; "bounded write" means the
    declared workspace and the real home, enforced by the harness seeing no
    other paths - not by an enforced boundary),
  * process-tree life cycle: **supported** (the Job: assign at creation, one
    call kills the tree, closing the last handle reaps the rest),
  * credential_not_in_argv: **supported** (the credential enters the child's
    environment block; nothing is passed on the command line),
  * temp_no_residue: **supported** (attempt directories are removed after the
    attempt; the audit records the ephemeral subtrees as *not audited* rather
    than pretending they were masked).

* **No mount namespace.** Windows has no binds, so the "guest" paths of the
  Linux shape are the host's real paths: the profile home is the real directory
  the deployment's audit reads, projected configuration files are materialised
  in place inside that home (D4's fallback path; ACL read-only where the file
  sits), and the session window is a real subdirectory. Nothing is redirected,
  which is what the conformance gate's counter-example checks for.

The provider never calls Win32 itself: the launcher owns the Job (see
``job.py`` and the host stack in ``agent_box.server.execution.local_channel``),
so the only Windows-specific code paths stay in one place.
"""
from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path
from typing import Any, Mapping, Sequence

#: The fixed view-relative entry the sidecar bundle carries (same name the
#: Linux template uses; the shape of the bundle is platform-independent).
SIDECAR_ENTRYPOINT = "agentbox-sidecar/runtime/worker-entry.mjs"
#: The guest home root of the Linux shape; on Windows it is a *prefix to
#: rewrite*, not a directory that exists.
GUEST_HOME_PREFIX = "/runtime/home/"
#: The environment names a harness's own conventions read for its home / XDG
#: roots; on Windows they point at the real directories.
HOME_ENVIRONMENT = {
    "HOME": "{home}",
    "USERPROFILE": "{home}",
    "XDG_CONFIG_HOME": "{home}/.config",
    "XDG_CACHE_HOME": "{home}/.cache",
    "XDG_DATA_HOME": "{home}/.local/share",
}


class WindowsSandboxError(RuntimeError):
    """A typed refusal from the Windows provider."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code


class WindowsSandboxPort:
    """Translate a neutral room demand into a plain Windows process spec."""

    provider_id = "sandbox-windows"

    def __init__(self, *, node_path: str | None = None,
                 materialization_root: str | os.PathLike[str] | None = None,
                 credential_environment: str | None = None) -> None:
        self.node_path = node_path or os.environ.get("AGENT_BOX_NODE_PATH") or "node.exe"
        self.materialization_root = Path(
            materialization_root
            or os.environ.get("AGENT_BOX_MATERIALIZATION_ROOT")
            or (Path(os.environ.get("LOCALAPPDATA", Path.home())) / "AgentBox" / "materialized")
        )
        #: The environment variable a harness reads its credential from; the
        #: value goes into the child's environment block, never argv.
        self.credential_environment = credential_environment

    # -- the seam ----------------------------------------------------------

    def compose_sidecar_room(self, request: Any) -> Any:
        from agent_box.extensions.runtime_composition.sandbox_port import (
            IsolatedProcessSpec, SandboxInvariantUnsupported,
        )

        invariants = request.invariants
        if invariants.network_mode not in {"inherit", "none"}:
            raise SandboxInvariantUnsupported(
                "SANDBOX_NETWORK_POSTURE_UNSUPPORTED",
                f"unsupported network posture {invariants.network_mode!r}",
            )
        if invariants.network_mode == "none":
            # No boundary exists on this platform; claiming "none" would be a
            # self-report without evidence.
            raise SandboxInvariantUnsupported(
                "SANDBOX_NETWORK_POSTURE_UNSUPPORTED",
                "this provider keeps the machine's network; network_mode='none' "
                "is not available (no container, no namespace)",
            )
        if not request.state_home_source:
            raise WindowsSandboxError(
                "WINDOWS_HOME_REQUIRED",
                "the Windows shape needs the profile's real home directory",
            )
        home = Path(request.state_home_source)
        if not home.is_dir():
            raise WindowsSandboxError("WINDOWS_HOME_MISSING", f"home is not a directory: {home}")
        # The role directory is the home's ancestor above the declared native
        # home (`.pi/agent` is two segments); guest targets under
        # /runtime/home map back onto it one-to-one.
        native_home = str(getattr(request, "native_home", "") or "")
        segments = [item for item in native_home.split("/") if item]
        role_dir = home
        for _segment in segments:
            role_dir = role_dir.parent
        if len(segments) and home == role_dir:
            raise WindowsSandboxError(
                "WINDOWS_NATIVE_HOME_INVALID",
                f"native home {native_home!r} does not sit under the home path",
            )

        view = Path(request.staged_view)
        entrypoint = view.joinpath(*SIDECAR_ENTRYPOINT.split("/"))
        if not entrypoint.is_file():
            raise WindowsSandboxError(
                "WINDOWS_VIEW_INCOMPLETE", f"the staged view carries no entrypoint: {entrypoint}",
            )

        # Materialise the read-only projections in place (D4 fallback): the
        # guest targets under /runtime/home are real paths inside the role
        # directory on this platform.
        for source, target in request.projection_mounts:
            relative = _guest_to_relative(target, GUEST_HOME_PREFIX)
            destination = role_dir.joinpath(*relative.split("/"))
            source_path = view.joinpath(*str(source).split("/"))
            if not source_path.is_file():
                raise WindowsSandboxError(
                    "WINDOWS_PROJECTION_MISSING", f"projection source is absent: {source}",
                )
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source_path, destination)
            _mark_read_only(destination)

        environment: dict[str, str] = dict(request.base_environment or {})
        rendered = {
            name: template.format(home=_windows_path(home))
            for name, template in HOME_ENVIRONMENT.items()
        }
        environment.update(rendered)

        if request.secret and self.credential_environment:
            # The credential enters the environment block; the caller removed
            # the file's content from argv by construction, and the audit's
            # fail-closed scan still runs over the home afterwards.
            environment[self.credential_environment] = Path(request.secret).read_text(
                encoding="utf-8",
            ).strip()

        argv = (self.node_path, _windows_path(entrypoint))
        return IsolatedProcessSpec(argv=argv, environment=environment)

    def declaration_document(self, *, readonly_targets: Sequence[str],
                             writable_targets: Sequence[str],
                             environment_binding: str, observed_at: int) -> Any:
        """This platform's declaration: life-cycle yes, isolation no.

        The document carries the spike's verdict as data so the capability
        gate refuses anything that needs a boundary this platform does not
        have, instead of trusting a claim.
        """
        from agent_box.extensions import capability as capability_api

        evidence = (
            capability_api.EvidenceRef(
                kind="file-symbol",
                locator="docs/server-round1/fullstack/windows-spike.md",
                environment_binding=environment_binding,
                observed_at=observed_at,
                expires_at=None,
            ),
        )
        declarations = []
        for capability_id, support, targets in (
            ("filesystem.readonly@1", "unavailable", ()),
            ("filesystem.writable@1", "supported", tuple(sorted(writable_targets))),
            ("network.inherit@1", "supported", ()),
            ("network.none@1", "unavailable", ()),
        ):
            declarations.append(capability_api.SandboxDeclaration(
                capability_id=capability_api.require_capability_id(capability_id),
                support_state=support,
                condition=None,
                parameters=(
                    capability_api.RequirementParameterSet(targets=targets)
                    if targets else None
                ),
                evidence=evidence,
                provider=self.provider_id,
            ))
        fields = {
            "provider": self.provider_id,
            "revision": 1,
            "environment_binding": environment_binding,
            "declarations": [
                {
                    "capabilityId": item.capability_id,
                    "supportState": item.support_state,
                    "targets": list(item.parameters.targets) if item.parameters is not None else [],
                }
                for item in declarations
            ],
        }
        import hashlib

        canonical = json.dumps(fields, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        return capability_api.SandboxDeclarationDocument(
            provider=self.provider_id, revision=1, environment_binding=environment_binding,
            declarations=tuple(declarations), digest=digest,
        )

    def descriptor_id(self) -> str:
        return self.provider_id

    def probe(self) -> Mapping[str, Any]:
        """Whether this provider can run a room here (no container involved)."""
        if sys.platform != "win32" and os.environ.get("AGENT_BOX_WINDOWS_FORCE") != "1":
            return {"status": "unavailable", "code": "not_windows", "failure_class": "host platform"}
        node = shutil.which(self.node_path) or (
            self.node_path if Path(self.node_path).is_file() else None
        )
        if node is None:
            return {"status": "unavailable", "code": "node_missing", "failure_class": "argv/rootfs"}
        return {
            "status": "available", "code": "ok", "failure_class": "none",
            "node": node,
            "isolation": "none",
        }

    # -- helpers used by the host stack ------------------------------------

    def materialize_attempt_root(self, attempt_id: str) -> Path:
        """A per-attempt directory for D4's one-shot configuration carrier."""
        root = self.materialization_root / attempt_id
        root.mkdir(parents=True, exist_ok=True)
        return root

    def cleanup(self, attempt_id: str) -> bool:
        """Remove the attempt directory; True when nothing is left behind."""
        root = self.materialization_root / attempt_id
        shutil.rmtree(root, ignore_errors=True)
        return not root.exists()


def _guest_to_relative(target: str, prefix: str) -> str:
    text = str(target)
    if not text.startswith(prefix):
        raise WindowsSandboxError(
            "WINDOWS_TARGET_OUTSIDE_HOME",
            f"a guest target outside {prefix} has no Windows meaning: {text}",
        )
    relative = text[len(prefix):]
    if not relative or relative.startswith("/") or ".." in relative.split("/"):
        raise WindowsSandboxError("WINDOWS_TARGET_INVALID", f"invalid guest target: {text}")
    return relative


def _windows_path(path: Path) -> str:
    return str(path).replace("/", "\\") if sys.platform == "win32" else str(path)


def _mark_read_only(path: Path) -> None:
    """D4 fallback: the materialised configuration is read-only where it sits.

    On Windows this is the file attribute (the ACL route needs a SID to grant
    to, and no container SID exists in this shape); the attribute is what keeps
    an ordinary harness process from rewriting its own configuration.
    """
    try:
        os.chmod(path, 0o444)
    except OSError:
        pass


def create_sidecar_room_port() -> WindowsSandboxPort:
    """The factory the resolver looks up (entry point / configured module)."""
    return WindowsSandboxPort()


create_sidecar_room_port.provider_ids = ("sandbox-windows",)

__all__ = [
    "GUEST_HOME_PREFIX",
    "HOME_ENVIRONMENT",
    "SIDECAR_ENTRYPOINT",
    "WindowsSandboxError",
    "WindowsSandboxPort",
    "create_sidecar_room_port",
]
