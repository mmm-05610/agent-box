"""Bubblewrap Sandbox wrapper; it compiles specs and never launches targets."""
from __future__ import annotations
from dataclasses import dataclass
import hashlib, json, re, shutil, subprocess, tempfile
from pathlib import Path, PurePosixPath
from typing import Any, Mapping

from agent_box.extensions.runtime_composition import (
    SANDBOX_CONTRACT_ID, HarnessCommandSpec, IsolatedProcessSpec, MountPlan,
    PreparedMountSource, SandboxRef, SandboxRequirements, SandboxUnavailable,
    SandboxUnsupported, SandboxV1, ProjectionRejected, digest, digest_json,
    guest_path,
)
from agent_box.extensions.credentials import PreparedSecretMount
from agent_box.work_core.models import Ref, RefType
from agent_box.work_core.registry import ProviderDescriptor, ResourceResolutionContext

PROVIDER_ID = "bwrap-sandbox"
_CAPS = ("filesystem.mounts@1", "filesystem.readonly@1", "filesystem.writable@1", "filesystem.tmpfs@1", "filesystem.symlink-safe@1", "network.none@1", "network.inherit@1", "env.bounded@1", "home.workspace@1", "digest.read-back@1")
_ENV_KEY = re.compile(r"^[A-Z_][A-Z0-9_]{0,63}$")
_UNSAFE_RW = {"/", "/usr", "/etc", "/bin", "/lib", "/lib64", "/proc", "/dev"}
_SYSTEM_MOUNTS = ("/usr", "/bin", "/lib", "/lib64", "/etc")

def _tree_digest(path: Path) -> str:
    if path.is_symlink() or not path.is_dir(): raise ProjectionRejected("tree source must be a real directory")
    rows = []
    for item in sorted(path.rglob("*")):
        rel = item.relative_to(path).as_posix()
        if item.is_symlink() or not (item.is_file() or item.is_dir()): raise ProjectionRejected("tree contains symlink or special file")
        rows.append((rel, "dir" if item.is_dir() else "file", hashlib.sha256(item.read_bytes()).hexdigest() if item.is_file() else ""))
    return digest_json(rows)

def _source_digest(path: Path) -> str:
    return _tree_digest(path) if path.is_dir() else "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()

def _guest(value: str) -> str:
    try: result = guest_path(value)
    except Exception as exc: raise ProjectionRejected("guest path is not canonical") from exc
    if result == "/" or "//" in result or str(PurePosixPath(result)) != result: raise ProjectionRejected("guest path is not canonical")
    return result


def _minimal_rootfs_argv(binary: Path, network_mode: str = "none") -> list[str]:
    """The bounded guest root shared by production wrapping and native probe."""
    if network_mode not in {"none", "inherit"}:
        raise ValueError("unsupported sandbox network mode")
    argv = [str(binary), "--die-with-parent", "--new-session", "--unshare-user",
            "--unshare-pid", "--unshare-ipc", "--unshare-uts", "--dir", "/"]
    if network_mode == "none":
        argv.insert(7, "--unshare-net")
    for system in _SYSTEM_MOUNTS:
        if Path(system).exists():
            argv += ["--ro-bind", system, system]
    # Native Codex (and many static ELF runtimes) use /proc/self/exe during
    # early configuration validation.  This is the procfs namespace mount,
    # not a host directory or a HOME/package projection.
    argv += ["--proc", "/proc"]
    return argv

@dataclass(frozen=True)
class NegotiatedSandboxCapabilities:
    digest: str
    values: Mapping[str, str]

class BwrapSandboxProvider:
    provider_id = PROVIDER_ID
    supported_contract_ids = frozenset({SANDBOX_CONTRACT_ID})
    def __init__(self, data_dir=None, binary=None):
        self.data_dir = Path(data_dir or Path(tempfile.gettempdir()) / "agent-box-bwrap").resolve(); self.data_dir.mkdir(parents=True, exist_ok=True)
        self.binary = Path(binary).resolve() if binary else (Path(shutil.which("bwrap")).resolve() if shutil.which("bwrap") else None)
        self.templates = {
            "bwrap-offline": {"revision": 1, "network": "none"},
            "bwrap-cloud-harness": {"revision": 1, "network": "inherit"},
            "safe-default": {"revision": 1, "network": "none"},
        }
        self._sources: dict[str, tuple[Path, str | None]] = {}
        self._secret_sources: dict[str, tuple[Path, str]] = {}
        self._secret_leases: dict[str, tuple[str, ...]] = {}
        self._secret_attempts: dict[str, str] = {}
    def descriptor(self): return ProviderDescriptor(PROVIDER_ID, "Bubblewrap sandbox wrapper", "3.0.0a1")
    def make_ref(self, template_id="safe-default", *, revision=1, host_affinity="local:bwrap"):
        spec = self._spec(template_id, revision); td = self._template_digest(template_id, spec)
        if not isinstance(host_affinity, str) or not host_affinity:
            raise ValueError("sandbox host affinity is required")
        return Ref(RefType.ARTIFACT, PROVIDER_ID, template_id, metadata={"revision": str(revision), "digest": td, "schema_version": "1", "affinity": host_affinity, "network_mode": self.templates[template_id]["network"]})
    def _spec(self, template_id, revision):
        try: spec = self.templates[template_id]
        except KeyError as exc: raise SandboxUnsupported("unknown sandbox template") from exc
        if spec["revision"] != revision: raise SandboxUnsupported("template revision is not available")
        return spec
    @staticmethod
    def _template_digest(template_id, spec): return digest_json({"template_id": template_id, "revision": spec["revision"], "network": spec["network"], "capabilities": _CAPS})
    def register_prepared_source(self, source_token: str, path: Path, *, authorized_scope: str | None = None):
        if not source_token or "\0" in source_token or not isinstance(path, Path): raise ValueError("invalid prepared source")
        self._sources[source_token] = (path, authorized_scope)
    def register_prepared_secret_mount(self, mount: PreparedSecretMount, path: Path) -> None:
        """Bind a provider-private source to an opaque, scoped mount token."""
        if not isinstance(mount, PreparedSecretMount) or not isinstance(path, Path):
            raise ValueError("invalid prepared secret mount")
        if mount.token in self._secret_sources:
            if self._secret_sources[mount.token] != (path, mount.execution_scope):
                raise ProjectionRejected("prepared secret token collision")
            return
        if path.is_symlink() or not path.exists() or not path.is_file():
            raise ProjectionRejected("secret source must be an existing regular file")
        self._secret_sources[mount.token] = (path, mount.execution_scope)
    def resolve(self, contract_id, ref, *, context: ResourceResolutionContext | None = None):
        if contract_id != SANDBOX_CONTRACT_ID or ref.type is not RefType.ARTIFACT or ref.provider != PROVIDER_ID: raise ValueError("bwrap Ref does not match sandbox contract")
        revision = int(ref.metadata.get("revision", "0")); spec = self._spec(ref.native_id, revision); expected = self._template_digest(ref.native_id, spec)
        if ref.metadata.get("digest") != expected or ref.metadata.get("schema_version") != "1": raise ValueError("sandbox template digest drift")
        affinity = ref.metadata.get("affinity", "local:bwrap")
        resolved = ResolvedBwrapSandbox(self, SandboxRef(PROVIDER_ID, ref.native_id, expected, affinity, network_mode=spec["network"]), revision, expected)
        return SandboxV1(resolved.ref, resolved)
    def availability(self):
        result = self.probe()
        if result["status"] != "available": raise SandboxUnavailable("SandboxUnavailable: " + str(result))
        return result
    def probe(self):
        if self.binary is None or not self.binary.exists(): return {"status": "unavailable", "code": "binary_missing", "failure_class": "argv/rootfs"}
        try:
            version = subprocess.run([str(self.binary), "--version"], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5)
            text = (version.stdout + version.stderr).strip()
            if version.returncode != 0 or "bubblewrap" not in text.lower(): return {"status": "unavailable", "code": f"version_exit_{version.returncode}", "failure_class": "argv/rootfs", "stderr": text[-512:]}
            # Probe-only target: this is not a composition launch and has no
            # attempt token, but it uses precisely the production read-only
            # system root so the dynamic loader and guest executable exist.
            argv = _minimal_rootfs_argv(self.binary) + ["--tmpfs", "/tmp", "--clearenv", "--", "/usr/bin/true"]
            result = subprocess.run(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5)
        except (OSError, subprocess.TimeoutExpired) as exc: return {"status": "unavailable", "code": type(exc).__name__, "failure_class": "host capability", "stderr": str(exc)[-512:]}
        return {"status": "available", "code": "ok", "failure_class": "none"} if result.returncode == 0 else {"status": "unavailable", "code": f"probe_exit_{result.returncode}", "failure_class": "host capability", "argv_summary": ("bwrap", "minimal-system-root", "/usr/bin/true"), "stderr": result.stderr.strip()[-512:]}

class ResolvedBwrapSandbox:
    """Immutable policy view.  No PID, process, stream, or runtime instance.

    This is the Sandbox *port* object handed to composition through the
    canonical ``SandboxV1`` registry value; it is deliberately not itself a
    contract type.
    """
    def __init__(self, provider, ref: SandboxRef, revision: int, template_digest: str):
        self.provider = provider
        self.ref = ref
        self.template_id = ref.native_id
        self.revision = revision
        self.template_digest = template_digest
        self.capabilities = {name: "supported" for name in _CAPS}
    def negotiate(self, requirements: SandboxRequirements | Mapping[str, Any] | None = None):
        required = tuple(requirements.required) if isinstance(requirements, SandboxRequirements) else tuple((requirements or {}).get("required", ()))
        network = requirements.network if isinstance(requirements, SandboxRequirements) else (requirements or {}).get("network", "none")
        if network == "host": network = "inherit"
        if network not in {"none", "inherit"}: raise SandboxUnsupported("network mode")
        if network == "none" and "network.none@1" not in self.capabilities: raise SandboxUnsupported("network.none@1")
        if network == "inherit" and "network.inherit@1" not in self.capabilities: raise SandboxUnsupported("network.inherit@1")
        missing = [name for name in required if name not in self.capabilities]
        if missing: raise SandboxUnsupported(missing[0])
        values = {name: self.capabilities[name] for name in sorted(set(required) | set(_CAPS))}
        return NegotiatedSandboxCapabilities(digest=digest({"ref": self.ref.policy_digest, "values": values}), values=values)
    def _source_path(self, source: PreparedMountSource) -> Path:
        try: path, bound_scope = self.provider._sources[source.source_token]
        except KeyError as exc: raise ProjectionRejected("prepared source token is unknown") from exc
        if not source.authorized_scope or (bound_scope is not None and bound_scope != source.authorized_scope):
            raise ProjectionRejected("mount source authorization scope mismatch")
        if path.is_symlink() or not path.exists(): raise ProjectionRejected("mount source is unavailable or symlinked")
        resolved = path.resolve(strict=True)
        if _source_digest(resolved) != source.content_digest: raise ProjectionRejected("source digest mismatch")
        return resolved
    def _secret_path(self, mount: PreparedSecretMount, attempt_key: str) -> Path:
        try: path, scope = self.provider._secret_sources[mount.token]
        except KeyError as exc: raise ProjectionRejected("prepared secret token is unknown") from exc
        if scope != mount.execution_scope or not scope.startswith("execution:"):
            raise ProjectionRejected("prepared secret token scope mismatch")
        prior_attempt = self.provider._secret_attempts.get(mount.token)
        if prior_attempt is not None and prior_attempt != attempt_key:
            raise ProjectionRejected("prepared secret token was prepared for another attempt")
        self.provider._secret_attempts[mount.token] = attempt_key
        if path.is_symlink() or not path.exists() or not path.is_file():
            raise ProjectionRejected("secret source is unavailable or not a regular file")
        return path
    def _validate(self, mounts: MountPlan, command: HarnessCommandSpec, attempt_key: str):
        self.negotiate({"required": ("filesystem.mounts@1", "env.bounded@1"), "network": self.ref.network_mode})
        if command.requires_control_plane_network and self.ref.network_mode != "inherit":
            raise ProjectionRejected("control-plane network is required by command")
        if len(command.environment) > 64: raise ProjectionRejected("environment allowlist too large")
        for key, value in command.environment.items():
            if not _ENV_KEY.fullmatch(key) or not isinstance(value, str) or len(value) > 512 or "\0" in value: raise ProjectionRejected(f"invalid bounded environment key: {key}")
            if any(word in key.lower() for word in ("secret", "token", "password", "api_key", "credential")): raise ProjectionRejected(f"credential-shaped environment key: {key}")
        targets = []
        for source, target, access in mounts.mounts:
            target = _guest(target)
            if access not in {"ro", "rw"}: raise ProjectionRejected("mount access must be ro or rw")
            path = self._source_path(source)
            if access == "rw" and (target in _UNSAFE_RW or path in {Path("/"), Path.home()}): raise ProjectionRejected("unsafe writable mount")
            targets.append(target)
        normal_targets = set(targets)
        for target in mounts.tmpfs_targets: targets.append(_guest(target))
        secret_targets = []
        for secret in mounts.secret_mounts:
            target = _guest(secret.guest_target)
            if secret.access != "ro": raise ProjectionRejected("secret mounts must be read-only")
            self._secret_path(secret, attempt_key)
            if target in normal_targets or target in secret_targets or target in mounts.tmpfs_targets:
                raise ProjectionRejected("secret mount target collides")
            # A secret may be nested only below an explicitly writable profile
            # parent.  It may never overlap workspace, executable, config, or
            # a tmpfs; the exact parent/child exception is typed and narrow.
            parents = [t for _, t, access in mounts.mounts if access == "rw" and target.startswith(_guest(t) + "/")]
            if parents != ["/runtime/home"]:
                raise ProjectionRejected("secret mount requires the profile home parent")
            secret_targets.append(target)
        targets.extend(secret_targets)
        if len(targets) > 64 or len(set(targets)) != len(targets): raise ProjectionRejected("mount targets collide")
        for index, target in enumerate(targets):
            if any(target.startswith(other + "/") or other.startswith(target + "/") for other in targets[index + 1:]):
                if not (target in secret_targets or any(other in secret_targets for other in targets[index + 1:])):
                    raise ProjectionRejected("parent/child mount targets collide")
        if not command.cwd_token.startswith("/"): raise ProjectionRejected("cwd must be an authorized guest path")
        cwd = _guest(command.cwd_token)
        if not any(cwd == target or cwd.startswith(target + "/") for target in targets if target not in mounts.tmpfs_targets): raise ProjectionRejected("cwd is not inside an authorized guest mount")
        return cwd
    def wrap(self, mount_plan: MountPlan, command: HarnessCommandSpec, *, attempt_key: str) -> IsolatedProcessSpec:
        if not attempt_key: raise ValueError("attempt_key is required")
        cwd = self._validate(mount_plan, command, attempt_key)
        binary = self.provider.binary
        if binary is None:
            raise SandboxUnavailable("bwrap binary is unavailable")
        argv = _minimal_rootfs_argv(binary, self.ref.network_mode)
        for directory in ("/runtime", "/runtime/home", "/runtime/bin", "/runtime/hooks"):
            argv += ["--dir", directory]
        for source, target, access in mount_plan.mounts: argv += ["--bind" if access == "rw" else "--ro-bind", str(self._source_path(source)), target]
        # Secret mounts are emitted after their writable profile parent so the
        # exact read-only child wins.  Paths are not included in public records.
        for secret in mount_plan.secret_mounts:
            argv += ["--ro-bind", str(self._secret_path(secret, attempt_key)), secret.guest_target]
        for target in mount_plan.tmpfs_targets: argv += ["--tmpfs", target]
        argv += ["--chdir", cwd, "--clearenv"]
        for key, value in sorted(command.environment.items()): argv += ["--setenv", key, value]
        argv += ["--"] + list(command.argv)
        public_argv = tuple("<secret-source>" if any(str(value) == str(self._secret_path(secret, attempt_key)) for secret in mount_plan.secret_mounts) else value for value in argv)
        spec_digest = digest({"policy": self.ref.policy_digest, "mounts": mount_plan.digest, "command": command.digest, "argv": public_argv})
        record = self.provider.data_dir / "leases" / f"{spec_digest.removeprefix('sha256:')}.json"; record.parent.mkdir(parents=True, exist_ok=True)
        if not record.exists(): record.write_text(json.dumps({"spec_digest": spec_digest, "state": "wrapped", "secret_mounts": len(mount_plan.secret_mounts)}, sort_keys=True))
        self.provider._secret_leases[spec_digest] = tuple(m.token for m in mount_plan.secret_mounts)
        # Token contents are opaque to the Sandbox, but its prefix identifies
        # the only HostTransport-consumable capability class.
        return IsolatedProcessSpec("spawn:" + digest({"attempt": attempt_key, "spec": spec_digest}), attempt_key, spec_digest, command.io_mode, public_argv, carrier_argv=tuple(argv))
    def observe(self, spec: IsolatedProcessSpec | str):
        value = spec.spec_digest if isinstance(spec, IsolatedProcessSpec) else str(spec)
        return {"kind": "sandbox", "status": "wrapped", "spec_digest": value, "target_creation_count": 0, "detail": "wrapper compiled; target not spawned"}
    def cleanup(self, spec: IsolatedProcessSpec | str):
        value = spec.spec_digest if isinstance(spec, IsolatedProcessSpec) else str(spec); record = self.provider.data_dir / "leases" / f"{value.removeprefix('sha256:')}.json"
        if not record.exists(): return {"status": "already_cleaned", "spec_digest": value}
        record.unlink()
        # Revocation is deliberately tied to the wrapper receipt; no public
        # response contains the provider-private source path.
        for token in self.provider._secret_leases.pop(value, ()):
            self.provider._secret_sources.pop(token, None)
        return {"status": "cleaned", "spec_digest": value}
