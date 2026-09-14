"""AgentBox-side client for the Harness sidecar envelope (Work Order 40 glue).

The sidecar owns ACP; this module only speaks the generic NDJSON envelope. It
never interprets a native protocol, never decides product state, and never sees
credential content: the Worker materializes credentials into the isolated
projection and the sidecar inherits nothing from this process's environment.

A launcher is injected so the same client runs over a local process (tests and
Linux acceptance) or over the Worker's interactive channel (WSL deployment).
"""
from __future__ import annotations

import json
import base64
import hashlib
from pathlib import Path, PurePosixPath
import queue
import subprocess
import threading
import time
from typing import Any, Callable, Mapping, Protocol, Sequence
from uuid import uuid4


class SidecarError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


class SidecarLauncher(Protocol):
    """Starts the sidecar and returns (write, read) byte channels plus a stopper."""

    def launch(self, environment: Mapping[str, str]) -> "SidecarChannels": ...


class SidecarChannels(Protocol):
    def write_line(self, value: str) -> None: ...
    def iter_chunks(self): ...
    def close(self) -> None: ...


class LocalProcessLauncher:
    """Launch the sidecar as a local child process (tests, Linux acceptance)."""

    def __init__(self, command: Sequence[str], *, cwd: str | None = None) -> None:
        self.command = tuple(command)
        self.cwd = cwd

    def launch(self, environment: Mapping[str, str]):
        process = subprocess.Popen(
            self.command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, bufsize=0, env=dict(environment), cwd=self.cwd,
        )
        assert process.stdin and process.stdout
        return _ProcessChannels(process)


class _ProcessChannels:
    def __init__(self, process: subprocess.Popen) -> None:
        self.process = process

    def write_line(self, value: str) -> None:
        assert self.process.stdin
        self.process.stdin.write((value + "\n").encode("utf-8"))
        self.process.stdin.flush()

    def iter_chunks(self):
        assert self.process.stdout
        return iter(lambda: self.process.stdout.readline().decode("utf-8", "replace"), "")

    def close(self) -> None:
        process = self.process
        if process.stdin:
            try:
                process.stdin.close()
            except OSError:
                pass
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)


def _advertised(capability: Any) -> bool:
    """True when a Harness advertised a capability, however ACP spelled it.

    ACP marks a session capability by its presence, conventionally as an empty
    object. Treating the value as a boolean would make every such Harness look
    incapable in Python, where `{}` is falsy but an absent or explicitly false
    value is the only honest "no".
    """
    return capability is not None and capability is not False


def _require_matching_artifact_authorizations(
    authorizations: Sequence[Mapping[str, str]],
    mounts: Sequence[tuple[str, str]],
) -> None:
    """Every runtime artifact mount must carry its own declaration.

    A mount without a declaration would reach bwrap unverified; a declaration
    without a mount would be a claim the Server silently dropped.  Both are
    refused here, before any Worker is contacted.
    """
    declared = {(str(item.get("path")), str(item.get("target"))) for item in authorizations}
    mounted = {(str(source), str(target)) for source, target in mounts}
    if len(declared) != len(authorizations) or len(mounted) != len(mounts):
        raise ValueError("SIDECAR_RUNTIME_ARTIFACT_DECLARATION_DUPLICATED")
    if declared != mounted:
        raise ValueError("SIDECAR_RUNTIME_ARTIFACT_DECLARATION_MISMATCH")


def sidecar_bundle_files(
    plugin_root: Path | str, *, additional_files: Mapping[str, bytes] | None = None,
) -> dict[str, bytes]:
    """Load the reviewed sidecar closure for one bounded Worker projection."""
    root = Path(plugin_root).resolve()
    runtime = root / "runtime"
    snapshot = root / "third_party" / "harness_remote"
    source = json.loads((snapshot / "SOURCE.json").read_text(encoding="utf-8"))
    files = {
        "agentbox-sidecar/package.json": (runtime / "package.json").read_bytes(),
        "agentbox-sidecar/runtime/worker-entry.mjs": (runtime / "worker-entry.mjs").read_bytes(),
        "agentbox-sidecar/runtime/native-driver.mjs": (runtime / "native-driver.mjs").read_bytes(),
        "agentbox-sidecar/runtime/profile_extensions.mjs": (
            runtime / "profile_extensions.mjs"
        ).read_bytes(),
        "agentbox-sidecar/third_party/harness_remote/SOURCE.json": (
            snapshot / "SOURCE.json"
        ).read_bytes(),
    }
    for item in source.get("files", ()):
        relative = str(item["path"])
        files[f"agentbox-sidecar/third_party/harness_remote/{relative}"] = (
            snapshot / relative
        ).read_bytes()
    for relative, content in (additional_files or {}).items():
        if (not isinstance(relative, str) or relative.startswith("/")
                or "\x00" in relative or "//" in relative
                or any(part in {"", ".", ".."} for part in relative.split("/"))):
            raise ValueError("SIDECAR_BUNDLE_PATH_INVALID")
        if relative in files:
            raise ValueError("SIDECAR_BUNDLE_PATH_CONFLICT")
        files[relative] = bytes(content)
    if len(files) > 1024 or sum(map(len, files.values())) > 64 * 1024 * 1024:
        raise ValueError("SIDECAR_BUNDLE_OUTSIDE_WORKER_BOUNDS")
    return files


class WslSidecarLauncher:
    """Launch the reviewed sidecar through Worker interactive + bwrap."""

    def __init__(
        self, connector, *, workspace: Mapping[str, Any], bundle: Mapping[str, bytes],
        credential: bytes | None = None,
        executable_authorizations: Sequence[Mapping[str, str]] = (),
        executable_mounts: Sequence[tuple[str, str]] = (),
        runtime_artifact_authorizations: Sequence[Mapping[str, str]] = (),
        runtime_artifact_mounts: Sequence[tuple[str, str]] = (),
        projection_mounts: Sequence[tuple[str, str]] = (),
        state_bundle_prefix: str | None = None,
        state_target: str | None = None,
        restored_state: Mapping[str, bytes] | None = None,
        timeout_ms: int = 120_000,
    ) -> None:
        self.connector = connector
        self.workspace = dict(workspace)
        self.bundle = {str(path): bytes(content) for path, content in bundle.items()}
        self.credential = None if credential is None else bytes(credential)
        self.executable_authorizations = tuple(dict(item) for item in executable_authorizations)
        self.executable_mounts = tuple((str(source), str(target)) for source, target in executable_mounts)
        self.runtime_artifact_authorizations = tuple(
            dict(item) for item in runtime_artifact_authorizations
        )
        self.runtime_artifact_mounts = tuple(
            (str(source), str(target)) for source, target in runtime_artifact_mounts
        )
        _require_matching_artifact_authorizations(
            self.runtime_artifact_authorizations, self.runtime_artifact_mounts,
        )
        self.projection_mounts = tuple((str(source), str(target)) for source, target in projection_mounts)
        self.state_bundle_prefix = state_bundle_prefix
        self.state_target = state_target
        if (state_bundle_prefix is None) != (state_target is None):
            raise ValueError("SIDECAR_STATE_PROJECTION_INVALID")
        if state_bundle_prefix is not None:
            _safe_relative_state_path(state_bundle_prefix)
            marker_path = f"{state_bundle_prefix}/.agentbox-state"
            if marker_path in self.bundle:
                raise ValueError("SIDECAR_STATE_PATH_CONFLICT")
            self.bundle[marker_path] = b"state-v1\n"
            for relative, content in (restored_state or {}).items():
                _safe_relative_state_path(relative)
                bundle_path = f"{state_bundle_prefix}/{relative}"
                if bundle_path in self.bundle:
                    raise ValueError("SIDECAR_STATE_PATH_CONFLICT")
                self.bundle[bundle_path] = bytes(content)
            if len(self.bundle) > 1024 or sum(map(len, self.bundle.values())) > 64 * 1024 * 1024:
                raise ValueError("SIDECAR_BUNDLE_OUTSIDE_WORKER_BOUNDS")
        self.timeout_ms = timeout_ms

    def launch(self, environment: Mapping[str, str]):
        from agent_box_sandbox_bwrap import compile_remote_sidecar_bwrap_argv

        attempt_id = f"sidecar-{uuid4().hex}"
        view_id = f"view-{attempt_id}"
        secret_frame_id = "harness-credential"
        credential_material, self.credential = self.credential, None
        client = self.connector.client_for_workspace(
            distribution=self.workspace["distribution"],
            user=self.workspace["remote_user"],
            connection_id=self.workspace["connection_id"],
            workspace_path=self.workspace["remote_path"],
            executable_authorizations=self.executable_authorizations,
            runtime_artifact_authorizations=self.runtime_artifact_authorizations,
        )
        try:
            client.start()
        except BaseException as error:
            client.close()
            # A Worker bootstrap refusal carries a code (an unsupported control
            # protocol, or a runtime artifact tree whose digest did not match
            # its declaration). Re-raise it as this layer's typed error so the
            # reason survives into durable product state instead of a bare
            # disconnect message.
            code = getattr(error, "code", None)
            if isinstance(code, str) and code:
                raise SidecarError(code, str(error)) from error
            raise
        try:
            manifest = [
                {"path": path, "size": len(content), "digest": _sha256(content)}
                for path, content in sorted(self.bundle.items())
            ]
            client.request("view.prepare", {"viewId": view_id, "files": manifest})
            for path, content in sorted(self.bundle.items()):
                for offset in range(0, len(content), 32 * 1024):
                    client.request("view.put", {
                        "viewId": view_id, "path": path, "offset": offset,
                        "data": base64.b64encode(content[offset:offset + 32 * 1024]).decode(),
                    })
            runtime_view = client.request("view.commit", {"viewId": view_id})["path"]
            guest_environment = {
                "PATH": "/usr/bin:/bin", "LANG": "C.UTF-8",
                "HOME": "/tmp/agentbox-home",
                "XDG_CONFIG_HOME": "/tmp/agentbox-home/xdg",
                "XDG_CACHE_HOME": "/tmp/agentbox-home/xdg",
                "XDG_DATA_HOME": "/tmp/agentbox-home/xdg",
                "AGENTBOX_SIDECAR_ISOLATED": environment.get(
                    "AGENTBOX_SIDECAR_ISOLATED", "1",
                ),
            }
            secret = None
            if credential_material is not None:
                secret = client.request("secret.put", {
                    "attemptId": attempt_id, "frameId": secret_frame_id,
                    "data": base64.b64encode(credential_material).decode(),
                })["path"]
            writable_projection_mounts = ()
            if self.state_bundle_prefix is not None:
                writable_projection_mounts = ((
                    runtime_view + "/" + self.state_bundle_prefix, str(self.state_target),
                ),)
            argv = compile_remote_sidecar_bwrap_argv(
                workspace=self.workspace["remote_path"], runtime_view=runtime_view,
                environment=guest_environment, secret=secret,
                executable_mounts=self.executable_mounts,
                projection_mounts=tuple(
                    (runtime_view + "/" + source, target)
                    for source, target in self.projection_mounts
                ),
                runtime_artifact_mounts=self.runtime_artifact_mounts,
                writable_projection_mounts=writable_projection_mounts,
            )
            channels = _WorkerChannels(
                client, attempt_id, 1, view_id,
                secret_frame_id if secret is not None else None,
                state_bundle_prefix=self.state_bundle_prefix,
                forbidden_content=(credential_material or b"").strip(),
            )
            channels.subscribe()
            client.request(
                "spawn", {"argv": argv, "timeoutMs": self.timeout_ms,
                          "stdinBase64": "", "interactive": True},
                attempt_id=attempt_id, generation=1,
            )
            return channels
        except BaseException:
            if credential_material is not None:
                try:
                    client.request("secret.cleanup", {
                        "attemptId": attempt_id, "frameId": secret_frame_id,
                    }, timeout=2)
                except BaseException:
                    pass
            try:
                client.request("view.cleanup", {"viewId": view_id}, timeout=2)
            except BaseException:
                pass
            client.close()
            raise


class _WorkerChannels:
    def __init__(
        self, client, attempt_id: str, generation: int, view_id: str,
        secret_frame_id: str | None = None,
        state_bundle_prefix: str | None = None,
        forbidden_content: bytes = b"",
    ) -> None:
        self.client = client
        self.attempt_id = attempt_id
        self.generation = generation
        self.view_id = view_id
        self.secret_frame_id = secret_frame_id
        self.state_bundle_prefix = state_bundle_prefix
        self._forbidden_content = forbidden_content
        self._chunks: queue.Queue = queue.Queue()
        self._unsubscribe = None
        self._disconnect_unsubscribe = None
        self._closed = False

    def subscribe(self) -> None:
        self._unsubscribe = self.client.subscribe_output(self._worker_event)
        subscribe_disconnect = getattr(self.client, "subscribe_disconnect", None)
        if callable(subscribe_disconnect):
            self._disconnect_unsubscribe = subscribe_disconnect(self._worker_disconnect)

    def _worker_disconnect(self, error) -> None:
        if not self._closed:
            self._chunks.put(SidecarError(
                "WORKER_DISCONNECTED", getattr(error, "message", str(error)),
            ))

    def _worker_event(self, event: Mapping[str, Any]) -> None:
        result = event.get("result") or {}
        if (result.get("attemptId") != self.attempt_id
                or int(result.get("generation", -1)) != self.generation):
            return
        if event.get("event") == "process.terminal":
            self._chunks.put(None)
            return
        if event.get("event") != "process.output" or result.get("stream") != "stdout":
            return
        if result.get("truncated"):
            self._chunks.put(SidecarError("SIDECAR_OUTPUT_TRUNCATED", "Worker stream budget exceeded"))
            return
        try:
            content = base64.b64decode(result.get("data", ""), validate=True)
        except ValueError as exc:
            self._chunks.put(SidecarError("SIDECAR_OUTPUT_INVALID", str(exc)))
            return
        if content:
            self._chunks.put(content.decode("utf-8", "replace"))

    def write_line(self, value: str) -> None:
        if self._closed:
            raise SidecarError("SIDECAR_CLOSED", "Worker sidecar is closed")
        content = (value + "\n").encode("utf-8")
        for offset in range(0, len(content), 60 * 1024):
            chunk = content[offset:offset + 60 * 1024]
            deadline = time.monotonic() + 2
            while True:
                try:
                    self.client.write_stdin(
                        self.attempt_id, self.generation, chunk, timeout=10,
                    )
                    break
                except BaseException as exc:
                    # spawn acknowledgement precedes child-pipe installation.
                    # ATTEMPT_NOT_READY is issued before any byte is written,
                    # so this one narrow retry cannot duplicate input.
                    if (getattr(exc, "code", None) != "ATTEMPT_NOT_READY"
                            or time.monotonic() >= deadline):
                        raise
                    time.sleep(0.01)

    def iter_chunks(self):
        while True:
            item = self._chunks.get()
            if item is None:
                return
            if isinstance(item, BaseException):
                raise item
            yield item

    def capture_state(self) -> dict[str, bytes]:
        """Read back only the deployment-declared writable state subtree."""
        if self.state_bundle_prefix is None:
            return {}
        prefix = self.state_bundle_prefix + "/"
        listing = self.client.request("view.list", {"viewId": self.view_id})
        selected: list[tuple[str, str, int]] = []
        total = 0
        for item in listing.get("files", ()):
            path = item.get("path")
            size = item.get("size")
            if not isinstance(path, str) or not path.startswith(prefix):
                continue
            relative = path[len(prefix):]
            if relative == ".agentbox-state":
                continue
            _safe_relative_state_path(relative)
            if not isinstance(size, int) or size < 0 or size > 8 * 1024 * 1024:
                raise SidecarError("SIDECAR_STATE_OUTSIDE_BOUNDS", "state file exceeds bound")
            total += size
            if len(selected) >= 256 or total > 8 * 1024 * 1024:
                raise SidecarError("SIDECAR_STATE_OUTSIDE_BOUNDS", "state projection exceeds bound")
            selected.append((path, relative, size))
        captured: dict[str, bytes] = {}
        for path, relative, size in selected:
            content, _digest_value = self._view_bytes(path)
            if len(content) != size:
                raise SidecarError("SIDECAR_STATE_IDENTITY_CONFLICT", "state size changed during capture")
            if self._forbidden_content and self._forbidden_content in content:
                raise SidecarError("SIDECAR_STATE_CONTAINS_SECRET", "credential material found in native state")
            captured[relative] = content
        return captured

    def _view_bytes(self, path: str) -> tuple[bytes, str]:
        chunks = bytearray()
        expected = None
        while True:
            item = self.client.request("view.get", {
                "viewId": self.view_id, "path": path,
                "offset": len(chunks), "maxLength": 32 * 1024,
            })
            if expected is None:
                expected = item.get("digest")
            if (item.get("digest") != expected or item.get("offset") != len(chunks)
                    or not isinstance(item.get("data"), str)):
                raise SidecarError("SIDECAR_STATE_IDENTITY_CONFLICT", "state fetch identity changed")
            try:
                chunks.extend(base64.b64decode(item["data"], validate=True))
            except ValueError as exc:
                raise SidecarError("SIDECAR_STATE_INVALID", "state chunk is invalid") from exc
            if item.get("nextOffset") != len(chunks):
                raise SidecarError("SIDECAR_STATE_IDENTITY_CONFLICT", "state fetch offset changed")
            if item.get("eof") is True:
                break
            if item.get("nextOffset") == item.get("offset"):
                raise SidecarError("SIDECAR_STATE_INVALID", "state fetch made no progress")
        content = bytes(chunks)
        if expected != _sha256(content):
            raise SidecarError("SIDECAR_STATE_DIGEST_MISMATCH", "state digest did not match")
        return content, str(expected)

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        try:
            try:
                self.client.close_stdin(self.attempt_id, self.generation, timeout=3)
            except BaseException:
                self.client.request(
                    "cancel", attempt_id=self.attempt_id, generation=self.generation, timeout=3,
                )
            try:
                self.client.wait_terminal(self.attempt_id, self.generation, timeout=10)
            finally:
                operations = [("result.ack", {}, True)]
                if self.secret_frame_id is not None:
                    operations.append(("secret.cleanup", {
                        "attemptId": self.attempt_id, "frameId": self.secret_frame_id,
                    }, False))
                operations.extend((
                    ("view.cleanup", {"viewId": self.view_id}, False),
                    ("attempt.cleanup", {}, True),
                ))
                for op, arguments, identified in operations:
                    try:
                        self.client.request(
                            op, arguments,
                            **({"attempt_id": self.attempt_id, "generation": self.generation}
                               if identified else {}), timeout=3,
                        )
                    except BaseException:
                        pass
        finally:
            self._forbidden_content = b""
            if self._unsubscribe:
                self._unsubscribe()
            if self._disconnect_unsubscribe:
                self._disconnect_unsubscribe()
            self.client.close()
            self._chunks.put(None)


def _sha256(content: bytes) -> str:
    return "sha256:" + hashlib.sha256(content).hexdigest()


def _safe_relative_state_path(value: str) -> str:
    if (not isinstance(value, str) or not value or value.startswith("/")
            or "\\" in value or "\x00" in value or "//" in value
            or any(part in {"", ".", ".."} for part in value.split("/"))
            or str(PurePosixPath(value)) != value):
        raise ValueError("SIDECAR_STATE_PATH_INVALID")
    return value


class SidecarEnvelope:
    """One sidecar session: request/response plus typed upward events."""

    def __init__(self, channels: SidecarChannels, *, on_event: Callable[[dict[str, Any]], None]) -> None:
        self._channels = channels
        self._on_event = on_event
        self._responses: dict[str, dict[str, Any]] = {}
        self._fatal: dict[str, Any] | None = None
        self._condition = threading.Condition()
        self._stderr: list[str] = []
        self._closed = threading.Event()
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()

    # -- request helper ----------------------------------------------------

    def request(self, payload: Mapping[str, Any], *, timeout: float = 30.0) -> dict[str, Any]:
        request_id = f"sc-{uuid4().hex}"
        body = {**payload, "id": request_id}
        with self._condition:
            self._channels.write_line(json.dumps(body, ensure_ascii=False, separators=(",", ":")))
            deadline = time.monotonic() + timeout
            while request_id not in self._responses:
                if self._fatal is not None:
                    fatal, self._fatal = self._fatal, None
                    error = fatal.get("error") or {}
                    raise SidecarError(
                        str(error.get("code", "SIDECAR_ERROR")),
                        str(error.get("message", "")),
                    )
                if self._closed.is_set():
                    raise SidecarError("SIDECAR_CLOSED", "sidecar exited before answering")
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise SidecarError("SIDECAR_TIMEOUT", f"no answer for {payload.get('op')}")
                self._condition.wait(min(remaining, 1.0))
            answer = self._responses.pop(request_id)
        if not answer.get("ok"):
            error = answer.get("error") or {}
            raise SidecarError(str(error.get("code", "SIDECAR_ERROR")), str(error.get("message", "")))
        return answer.get("result") or {}

    def close(self) -> None:
        try:
            self._channels.close()
        finally:
            self._closed.set()
            with self._condition:
                self._condition.notify_all()

    def capture_state(self) -> dict[str, bytes]:
        capture = getattr(self._channels, "capture_state", None)
        return capture() if callable(capture) else {}

    # -- reader ------------------------------------------------------------

    def _read_loop(self) -> None:
        buffer = ""
        stream = getattr(self._channels, "stdout", None)
        try:
            for chunk in self._iter_chunks():
                buffer += chunk
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    if line.strip():
                        self._line(line)
        except BaseException as exc:  # noqa: BLE001 - surfaced to the caller
            self._stderr.append(str(exc))
        finally:
            del stream
            self._closed.set()
            with self._condition:
                self._condition.notify_all()

    def _iter_chunks(self):
        iterator = getattr(self._channels, "iter_chunks", None)
        if callable(iterator):
            return iterator()
        process = getattr(self._channels, "process", None)
        if process is None or process.stdout is None:
            return iter(())
        return iter(lambda: process.stdout.readline().decode("utf-8", "replace"), "")

    def _line(self, line: str) -> None:
        try:
            message = json.loads(line)
        except ValueError:
            return
        if "event" in message:
            try:
                self._on_event(dict(message))
            except Exception:  # noqa: BLE001 - an event consumer must not kill the reader
                pass
            return
        with self._condition:
            if message.get("id") is None and not message.get("ok", True):
                # A startup refusal (for example missing isolation) answers no
                # request; surface it to whoever is waiting.
                self._fatal = message
            else:
                self._responses[str(message.get("id"))] = message
            self._condition.notify_all()


class SidecarHarnessPort:
    """TurnExecutionPort implemented over one sidecar per execution.

    The native session id is kept per execution on the instance; nothing here
    is class-level state, so two ports in one process cannot share or overwrite
    each other's identity.
    """

    def __init__(
        self, launcher: SidecarLauncher, *, environment: Mapping[str, str],
        profile: str = "codex", adapter: Mapping[str, Any] | None = None,
        model: str | None = None, credential_environment: str | None = None,
        preferred_auth_method: str | None = None,
        resume_native_id: str | None = None,
        state_directory: str = "/tmp/agentbox-sidecar",
        directory: str = "/workspace", on_event=None,
    ) -> None:
        self.launcher = launcher
        self.environment = dict(environment)
        self.profile = profile
        self.adapter = dict(adapter or {})
        self.model = model
        self.credential_environment = credential_environment
        self.preferred_auth_method = preferred_auth_method
        self.resume_native_id = resume_native_id
        self.state_directory = state_directory
        self.directory = directory
        self.on_event = on_event or (lambda *_: None)
        self._sessions: dict[str, SidecarEnvelope] = {}
        self._native_sessions: dict[str, str] = {}
        self._approvals: dict[str, tuple[str, str]] = {}
        self._resumable: dict[str, bool] = {}
        self._native_closed: set[str] = set()
        self._current: str = ""
        self._lock = threading.Lock()

    def open_execution(self, execution_id: str) -> str:
        """Open a sidecar, register the profile, and open one native session.

        Returns the opaque native session id. Credentials are never passed here:
        the Worker materializes them inside the isolated projection.
        """
        with self._lock:
            if execution_id in self._sessions:
                return self._native_sessions[execution_id]
        envelope = SidecarEnvelope(self.launcher.launch(self.environment), on_event=self._forward)
        try:
            registered = envelope.request({
                "op": "register", "profile": self.profile, "launch": self.adapter,
                "credentialEnvironment": self.credential_environment,
                "preferredAuthMethod": self.preferred_auth_method,
                "stateDirectory": self.state_directory, "directory": self.directory,
                "permissionRoundTrip": True, "permissionTimeoutMs": 60_000,
            })
            started = envelope.request({"op": "start"})
            if self.resume_native_id is None:
                session = envelope.request({
                    "op": "create", "title": execution_id, "model": self.model,
                })
            else:
                session = envelope.request({"op": "open", "sessionId": self.resume_native_id})
        except BaseException:
            envelope.close()
            raise
        native = str(session.get("sessionId") or "")
        if not native:
            envelope.close()
            raise SidecarError("NATIVE_SESSION_MISSING", "sidecar did not report a native session id")
        with self._lock:
            self._sessions[execution_id] = envelope
            self._native_sessions[execution_id] = native
            # ACP advertises a session capability as the presence of an object
            # marker (`resume: {}`), not as a boolean, and an empty mapping is
            # falsy in Python - so raw truthiness would report every
            # conventional ACP Harness as unable to resume. A capability counts
            # as advertised when it is present and not explicitly false.
            self._resumable[execution_id] = _advertised(
                (started.get("sessionCapabilities") or {}).get("resume"),
            )
            self._current = execution_id
        self.on_event(execution_id, "started", {
            "nativeSessionId": native, "provenance": registered.get("provenance"),
        })
        return native

    def capture_execution(self, execution_id: str) -> tuple[dict[str, bytes], bool]:
        """Flush the adapter, then capture its declared native state before cleanup."""
        envelope = self._require(execution_id)
        with self._lock:
            already_closed = execution_id in self._native_closed
        if not already_closed:
            envelope.request({"op": "close"}, timeout=10)
            with self._lock:
                self._native_closed.add(execution_id)
        state = envelope.capture_state()
        with self._lock:
            resumable = self._resumable.get(execution_id, False)
        return state, resumable

    def accept(self, execution_id: str, *, overrides: Mapping[str, Any] | None = None) -> None:
        """Open the execution; the prompt is issued by `prompt`."""
        del overrides
        self.open_execution(execution_id)

    def prompt(
        self, execution_id: str, text: str,
        attachments: Sequence[Mapping[str, Any]] = (),
    ) -> dict[str, Any]:
        envelope = self._require(execution_id)
        with self._lock:
            self._current = execution_id
        return envelope.request(
            {"op": "prompt", "sessionId": self._native_sessions[execution_id], "text": text,
             "model": self.model, "attachments": [dict(item) for item in attachments]},
            timeout=600,
        )

    def cancel(self, execution_id: str) -> bool:
        with self._lock:
            envelope = self._sessions.get(execution_id)
            native = self._native_sessions.get(execution_id)
        if envelope is None or native is None:
            return False
        try:
            envelope.request({"op": "abort", "sessionId": native}, timeout=10)
            return True
        except SidecarError:
            return False

    def close_execution(self, execution_id: str) -> None:
        with self._lock:
            envelope = self._sessions.pop(execution_id, None)
            self._native_sessions.pop(execution_id, None)
            self._resumable.pop(execution_id, None)
            native_closed = execution_id in self._native_closed
            self._native_closed.discard(execution_id)
            self._approvals = {
                key: value for key, value in self._approvals.items() if value[0] != execution_id
            }
        if envelope is not None:
            try:
                if not native_closed:
                    envelope.request({"op": "close"}, timeout=5)
            except BaseException:
                pass
            envelope.close()

    def stop(self) -> bool:
        with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
            self._native_sessions.clear()
            self._resumable.clear()
            self._native_closed.clear()
            self._approvals.clear()
        for envelope in sessions:
            try:
                envelope.close()
            except BaseException:
                pass
        return True

    def register_approval(
        self, approval_id: str, execution_id: str, sidecar_request_id: str,
    ) -> None:
        with self._lock:
            if execution_id not in self._sessions:
                raise SidecarError("EXECUTION_UNKNOWN", "approval execution is no longer active")
            self._approvals[approval_id] = (execution_id, sidecar_request_id)

    def decide_approval(
        self, approval_id: str, decision: str, scope: Mapping[str, Any],
    ) -> None:
        with self._lock:
            route = self._approvals.pop(approval_id, None)
        if route is None:
            raise SidecarError("PERMISSION_REQUEST_UNKNOWN", "approval route is no longer active")
        execution_id, request_id = route
        self._require(execution_id).request({
            "op": "permission_decision", "requestId": request_id,
            "decision": decision, "scope": dict(scope),
        }, timeout=10)

    def _native(self, execution_id: str) -> str:
        native = self._native_sessions.get(execution_id)
        if native is None:
            raise SidecarError("EXECUTION_UNKNOWN", "no native session for this execution")
        return native

    def _require(self, execution_id: str) -> SidecarEnvelope:
        with self._lock:
            envelope = self._sessions.get(execution_id)
        if envelope is None:
            raise SidecarError("EXECUTION_UNKNOWN", "no sidecar for this execution")
        return envelope

    def _forward(self, message: Mapping[str, Any]) -> None:
        """Project upward sidecar events onto product-neutral callback facts."""
        event = message.get("event")
        data = message.get("data") or {}
        with self._lock:
            execution_id = self._current
        if event == "acp_notification":
            update = ((data.get("params") or {}).get("update") or {})
            if update.get("sessionUpdate") == "agent_message_chunk":
                text = ((update.get("content") or {}).get("text") or "")
                if text:
                    self.on_event(execution_id, "message.delta", {"text": text})
        elif event == "message_delta":
            # A deployment-declared native driver reports the same product fact
            # as an ACP message chunk. The event name is the driver contract's,
            # never a Harness's, so this mapping stays brand-free.
            text = str(data.get("text") or "")
            if text:
                self.on_event(execution_id, "message.delta", {"text": text})
        elif event == "driver_exit":
            self.on_event(execution_id, "failed", {"code": "ADAPTER_EXIT"})
        elif event == "adapter_exit":
            self.on_event(execution_id, "failed", {"code": "ADAPTER_EXIT"})
        elif event == "permission_request":
            self.on_event(execution_id, "approval.requested", {"request": data})
