"""Windows wsl.exe connector. Persistent product identity stays in Server."""
from __future__ import annotations

from dataclasses import dataclass
import base64
import hashlib
import json
import locale
from pathlib import Path
import subprocess
import time
from types import SimpleNamespace
from uuid import uuid4

from .client import WorkerClient, WorkerError


PROBE_TTL_SECONDS = 60
SUBPROCESS_TIMEOUT_SECONDS = 10


@dataclass(frozen=True)
class Probe:
    probe_id: str
    distribution: str
    user: str
    expires_at: float


class WslConnector:
    def __init__(self, *, manifest_path: Path | str, linux_worker_path: str, server_instance_id: str) -> None:
        manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
        if manifest.get("schemaVersion") != 1 or manifest.get("wireVersion") != 1:
            raise RuntimeError("WORKER_MANIFEST_INCOMPATIBLE")
        digest = str(manifest.get("sha256", ""))
        if not digest.startswith("sha256:") or len(digest) != 71:
            raise RuntimeError("WORKER_MANIFEST_INVALID")
        self.manifest = manifest
        self.linux_worker_path = linux_worker_path
        self.server_instance_id = server_instance_id
        self._probes: dict[str, Probe] = {}

    def distributions(self):
        result = self._run(["wsl.exe", "--list", "--quiet"])
        names = [line.strip().replace("\x00", "") for line in result.stdout.splitlines() if line.strip().replace("\x00", "")]
        return [{"name": name} for name in names]

    def probe(self, distribution: str, user: str | None):
        known = {item["name"] for item in self.distributions()}
        if distribution not in known:
            raise WorkerError("WSL_DISTRIBUTION_UNKNOWN", "WSL distribution was not found")
        effective = self._effective_user(distribution, user)
        probe_id = f"probe-{uuid4().hex}"
        probe = Probe(probe_id, distribution, effective, time.monotonic() + PROBE_TTL_SECONDS)
        client = self._client(probe, project_id=probe_id)
        try:
            handshake = client.start()
            client.request("handshake")
        finally:
            client.close()
        self._probes[probe_id] = probe
        return {
            "probe_id": probe_id, "distribution": distribution, "user": effective,
            "expires_in": PROBE_TTL_SECONDS, "worker_version": handshake["workerVersion"],
            "worker_digest": handshake["workerDigest"],
        }

    def browse(self, probe_id: str, path: str):
        probe = self._probe(probe_id)
        client = self._client(probe, project_id=probe_id)
        try:
            client.start()
            result = client.request("browse", {"path": path})
        finally:
            client.close()
        return {"probe_id": probe_id, **result}

    def open_workspace(self, probe_id: str, path: str):
        probe = self._probe(probe_id)
        client = self._client(probe, project_id=probe_id)
        try:
            client.start()
            result = client.request("canonicalize", {"path": path})
        finally:
            client.close()
        return {
            "connection_id": f"connection-{uuid4().hex}",
            "distribution": probe.distribution, "user": probe.user,
            "path": result["path"],
        }

    def client_for_workspace(
        self, *, distribution: str, user: str, connection_id: str,
        workspace_path: str,
        executable_authorizations: tuple[dict[str, str], ...] = (),
        runtime_artifact_authorizations: tuple[dict[str, str], ...] = (),
    ) -> WorkerClient:
        probe = Probe("execution", distribution, user, float("inf"))
        return self._client(
            probe, project_id=connection_id, workspace=workspace_path,
            connection_id=connection_id,
            executable_authorizations=executable_authorizations,
            runtime_artifact_authorizations=runtime_artifact_authorizations,
        )

    def read_workspace_file(
        self, *, distribution: str, user: str, connection_id: str,
        workspace_path: str, relative_path: str,
    ) -> tuple[bytes, str]:
        """Read one bounded, Worker-authorized file for an attachment."""
        client = self.client_for_workspace(
            distribution=distribution, user=user, connection_id=connection_id,
            workspace_path=workspace_path,
        )
        chunks = bytearray()
        expected = None
        client.start()
        try:
            while True:
                item = client.request("workspace.get", {
                    "path": relative_path, "offset": len(chunks), "maxLength": 32 * 1024,
                })
                expected = expected or item["digest"]
                if item["digest"] != expected or int(item["offset"]) != len(chunks):
                    raise WorkerError(
                        "ATTACHMENT_IDENTITY_CONFLICT", "workspace file changed during delivery",
                    )
                chunks.extend(base64.b64decode(item["data"], validate=True))
                if item["eof"]:
                    break
        finally:
            client.close()
        content = bytes(chunks)
        actual = "sha256:" + hashlib.sha256(content).hexdigest()
        if actual != expected:
            raise WorkerError("ATTACHMENT_DIGEST_MISMATCH", "workspace attachment digest changed")
        return content, actual

    GIT_STATUS_ARGV = ("--no-optional-locks", "status", "--porcelain=v2", "--branch")

    def read_only_git_status(
        self, *, distribution: str, user: str | None, path: str,
        timeout: float, max_bytes: int,
    ) -> tuple[bytes, str | None]:
        """Run the *fixed* porcelain command on the WSL side; bounded.

        The argv is fixed here on purpose: the Server asks for one read-only
        fact and never supplies a command line. `--no-optional-locks` keeps the
        query from refreshing the index (a write) while the harness may be
        using the repository, and nothing in the invocation reaches the
        network.
        """
        if not isinstance(path, str) or not path.startswith("/") or "\x00" in path:
            raise WorkerError("GIT_WORKSPACE_MISSING", "the workspace path is invalid")
        command = ["wsl.exe", "--distribution", distribution]
        if user:
            command += ["--user", user]
        command += ["--exec", "/usr/bin/git", "-C", path, *self.GIT_STATUS_ARGV]
        try:
            result = subprocess.run(
                command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            return b"", "GIT_TIMEOUT"
        except OSError:
            return b"", "GIT_UNAVAILABLE"
        if len(result.stdout) > max_bytes:
            return b"", "GIT_OUTPUT_LIMIT"
        if result.returncode != 0 and not result.stdout.strip():
            return b"", "GIT_NOT_A_REPOSITORY"
        return result.stdout, None

    def _probe(self, probe_id: str) -> Probe:
        probe = self._probes.get(probe_id)
        if probe is None or time.monotonic() >= probe.expires_at:
            self._probes.pop(probe_id, None)
            raise WorkerError("PROBE_EXPIRED", "WSL probe is unknown or expired")
        return probe

    def _effective_user(self, distribution: str, user: str | None) -> str:
        command = ["wsl.exe", "--distribution", distribution]
        if user:
            command += ["--user", user]
        command += ["--exec", "/usr/bin/id", "-un"]
        result = self._run(command)
        value = result.stdout.strip().replace("\x00", "")
        if not value or any(character.isspace() for character in value):
            raise WorkerError("WSL_IDENTITY_INVALID", "WSL effective user was invalid")
        return value

    def _client(
        self, probe: Probe, *, project_id: str, workspace: str | None = None,
        connection_id: str | None = None,
        executable_authorizations: tuple[dict[str, str], ...] = (),
        runtime_artifact_authorizations: tuple[dict[str, str], ...] = (),
    ):
        command = ["wsl.exe", "--distribution", probe.distribution, "--user", probe.user,
                   "--exec", self.linux_worker_path, "--root",
                   f"/tmp/agentbox-worker-r1/{self.server_instance_id}/{project_id}"]
        if workspace:
            command += ["--workspace", workspace]
        return WorkerClient(
            command, worker_digest=self.manifest["sha256"],
            worker_version=self.manifest["workerVersion"],
            connection_id=connection_id or probe.probe_id, project_id=project_id,
            effective_user=probe.user, server_instance_id=self.server_instance_id,
            executable_authorizations=executable_authorizations,
            runtime_artifact_authorizations=runtime_artifact_authorizations,
        )

    @staticmethod
    def _run(command: list[str]):
        try:
            result = subprocess.run(
                command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, timeout=SUBPROCESS_TIMEOUT_SECONDS,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise WorkerError("WSL_COMMAND_FAILED", "WSL command could not be completed") from exc
        if result.returncode != 0:
            raise WorkerError("WSL_COMMAND_FAILED", "WSL command returned a failure")
        return SimpleNamespace(
            returncode=result.returncode,
            stdout=_decode_windows_output(result.stdout),
            stderr=_decode_windows_output(result.stderr),
        )


def _decode_windows_output(value: bytes) -> str:
    if not value:
        return ""
    if value.startswith((b"\xff\xfe", b"\xfe\xff")):
        return value.decode("utf-16")
    if len(value) >= 4 and value[1::2].count(0) >= max(1, len(value[1::2]) // 2):
        return value.decode("utf-16-le")
    try:
        return value.decode("utf-8-sig")
    except UnicodeDecodeError:
        return value.decode(locale.getpreferredencoding(False), errors="replace")
