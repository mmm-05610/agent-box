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

from agent_box.resource_contracts.harness_capabilities import (
    CapabilityDeclaration, capability_view, merge_capabilities, validate_claims,
)


#: How often a blocked channel reader re-checks its keepalive. Small enough that
#: a failed lease ends the turn promptly, large enough not to spin.
LEASE_POLL_SECONDS = 0.25

#: Failures while reading a state subtree that mean "it is still moving", so the
#: capture keeps waiting (bounded) instead of accepting a mixed snapshot. The
#: list is deliberately short: everything else - a refusal, a bound violation,
#: credential material, a plain I/O fault - is reported as it happened, with the
#: code that names it. Classification reads the code alone, never the message.
#:
#: Audited Worker view sites, and what their codes mean here:
#:
#:   VIEW_CHANGED          an entry changed identity while the Worker was
#:                         reading it from an already-opened fd - churn
#:   VIEW_MISSING          an entry is not there - a refusal by the Worker
#:                         (it cannot know the caller ever saw it); this
#:                         capture converts it to its identity conflict
#:                         because it just listed the path
#:   VIEW_SPECIAL_FILE     a FIFO, socket or device, or a path resolving
#:                         through a symlink - a refusal, never churn
#:   VIEW_TRAVERSAL_LIMIT  more than 4096 visited entries - a refusal
#:   VIEW_FILE_LIMIT       more than 1024 files, in a listing or a manifest
#:   VIEW_INVALID          malformed identity, manifest, path or fetch range
#:                         (including a first fetch past the end of a file)
#:   VIEW_IO               a real listing, metadata, read or write fault
#:   VIEW_INCOMPLETE       the view is not committed, or a file is missing
#:   VIEW_DIGEST_MISMATCH  read-back did not match what was declared
_STATE_TRANSIENT_CODES = frozenset({
    "SIDECAR_STATE_IDENTITY_CONFLICT",  # raised here: size, offset or digest moved
    "VIEW_CHANGED",                     # the Worker's own "the bytes moved" code
})


def _state_error_is_transient(error: BaseException) -> bool:
    """Whether a capture may wait for this failure to go away.

    Only the code decides. The same sentence can describe churn or a refusal, so
    no message text is inspected here: an untyped or unknown failure is reported
    as it arrived.
    """
    code = getattr(error, "code", None)
    return isinstance(code, str) and code in _STATE_TRANSIENT_CODES


#: The guest's isolated home root. Every Harness home is a projection inside it:
#: read-only configuration files and one bounded writable state subtree, both
#: declared by the deployment. It is never the host home and never a Windows
#: profile root.
GUEST_HOME = "/runtime/home"


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
        """Write one envelope line, or refuse with the same typed error as the
        Worker channels do.

        A cancelled or already-finished execution can reach this after its
        channel was closed; the caller (`SidecarHarnessPort.cancel`) treats a
        typed closed-sidecar error as "nothing left to cancel", while a bare
        ValueError from a closed file object would escape it and fail the whole
        server shutdown.
        """
        stream = self.process.stdin
        if stream is None or getattr(stream, "closed", False):
            raise SidecarError("SIDECAR_CLOSED", "sidecar channel is closed")
        try:
            stream.write((value + "\n").encode("utf-8"))
            stream.flush()
        except (ValueError, OSError) as exc:
            raise SidecarError("SIDECAR_CLOSED", "sidecar channel is closed") from exc

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


def _advertised(capability: Any) -> bool | None:
    """A native capability advertisement, read as the tri-state it really is.

    ACP marks a session capability by its presence, conventionally as an empty
    object. Treating the value as a boolean would make every such Harness look
    incapable in Python, where `{}` is falsy but an absent or explicitly false
    value is the only honest "no". A missing key (or an explicit null) is not an
    advertisement at all and stays "not observed".
    """
    if capability is None:
        return None
    if capability is False:
        return False
    return True


def _advertised_image(capability: Any) -> bool | None:
    """`promptCapabilities.image`: only an explicit truth is an observation.

    A missing or explicitly false value stays "not observed": attachment
    support is never inferred from a default policy or from a nearby ability.
    """
    if capability is None or capability is False:
        return None
    return True


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
        # The validated static ceiling, so the sidecar can refuse to project a
        # capability its Harness never declared instead of guessing.
        "agentbox-sidecar/runtime/capability_declarations.json": (
            runtime / "capability_declarations.json"
        ).read_bytes(),
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
        protected_state_paths: Sequence[str] = (),
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
        #: Paths (relative to the state target) that a read-only projection owns
        #: inside the writable state subtree. They are excluded from the
        #: checkpoint by name and refused when a checkpoint tries to restore
        #: one, rather than relying on the read-only overlay happening to hide
        #: them.
        self.protected_state_paths = tuple(_safe_relative_state_path(path) for path in protected_state_paths)
        if (state_bundle_prefix is None) != (state_target is None):
            raise ValueError("SIDECAR_STATE_PROJECTION_INVALID")
        if self.protected_state_paths and state_bundle_prefix is None:
            raise ValueError("SIDECAR_STATE_PROJECTION_INVALID")
        if state_bundle_prefix is not None:
            _safe_relative_state_path(state_bundle_prefix)
            marker_path = f"{state_bundle_prefix}/.agentbox-state"
            if marker_path in self.bundle:
                raise ValueError("SIDECAR_STATE_PATH_CONFLICT")
            self.bundle[marker_path] = b"state-v1\n"
            for relative, content in (restored_state or {}).items():
                _safe_relative_state_path(relative)
                if relative in self.protected_state_paths:
                    raise ValueError("SIDECAR_STATE_PROTECTED_PATH")
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
            # One isolated home root, and the XDG roots derived from it, so a
            # Harness's default location and its explicit variable resolve to
            # the same projection. The root is an execution-private mount
            # namespace directory; the host home is never bound here.
            guest_environment = {
                "PATH": "/usr/bin:/bin", "LANG": "C.UTF-8",
                "HOME": GUEST_HOME,
                "XDG_CONFIG_HOME": f"{GUEST_HOME}/.config",
                "XDG_CACHE_HOME": f"{GUEST_HOME}/.cache",
                "XDG_DATA_HOME": f"{GUEST_HOME}/.local/share",
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
                protected_state_paths=self.protected_state_paths,
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
        protected_state_paths: Sequence[str] = (),
        forbidden_content: bytes = b"",
    ) -> None:
        self.client = client
        self.attempt_id = attempt_id
        self.generation = generation
        self.view_id = view_id
        self.secret_frame_id = secret_frame_id
        self.state_bundle_prefix = state_bundle_prefix
        #: Read-only configuration that lives *inside* the writable state
        #: subtree. It is not state: it must not be captured into a checkpoint.
        self.protected_state_paths = frozenset(protected_state_paths)
        self._forbidden_content = forbidden_content
        self._chunks: queue.Queue = queue.Queue()
        self._unsubscribe = None
        self._disconnect_unsubscribe = None
        self._closed = False
        # The Worker cancels any attempt whose client stays quiet past its
        # lease, and a sidecar prompt is exactly such a client. This owner keeps
        # the lease alive for as long as the attempt does; it is started in
        # `subscribe()` (not here) because the launcher may hand us a client
        # substitute that has no lease support at all.
        self._lease_keepalive = None

    def subscribe(self) -> None:
        self._unsubscribe = self.client.subscribe_output(self._worker_event)
        subscribe_disconnect = getattr(self.client, "subscribe_disconnect", None)
        if callable(subscribe_disconnect):
            self._disconnect_unsubscribe = subscribe_disconnect(self._worker_disconnect)
        keep_lease = getattr(self.client, "keep_lease", None)
        if callable(keep_lease):
            # Before `spawn`, so the very first silent stretch is covered too.
            self._lease_keepalive = keep_lease(label=f"channels-{self.attempt_id}")
            self._lease_keepalive.start()

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
            self._stop_lease()  # the attempt is over; nothing left to keep alive
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
            try:
                item = self._chunks.get(timeout=LEASE_POLL_SECONDS)
            except queue.Empty:
                # A failed keepalive must end this turn - typed, and without
                # waiting for a frame that will never arrive.
                failure = self._lease_failure()
                if failure is not None:
                    raise failure
                continue
            if item is None:
                return
            if isinstance(item, BaseException):
                raise item
            yield item

    def _lease_failure(self) -> SidecarError | None:
        """The keepalive's typed failure, if the lease could not be kept."""
        owner = self._lease_keepalive
        failure = getattr(owner, "failure", None) if owner is not None else None
        if failure is None:
            return None
        code = getattr(failure, "code", None) or "WORKER_LEASE_HEARTBEAT_FAILED"
        message = getattr(failure, "message", None) or str(failure)
        return SidecarError(str(code), str(message))

    def _stop_lease(self) -> None:
        owner, self._lease_keepalive = self._lease_keepalive, None
        if owner is not None:
            try:
                owner.stop()
            except BaseException:  # noqa: BLE001 - stopping must never mask the turn
                pass

    #: A capture accepts only bytes that stopped changing. Comparing paths and
    #: sizes is not enough - a rewrite that keeps its length looks stable - so two
    #: consecutive snapshots must agree on path, size *and* digest, and the bytes
    #: returned are exactly the ones that matched.
    STATE_SETTLE_INTERVAL_SECONDS = 0.25
    STATE_SETTLE_DEADLINE_SECONDS = 10.0

    def _state_snapshot(self) -> tuple[dict[str, tuple[int, str]], dict[str, bytes]]:
        """List the declared state subtree and read it, within every bound.

        Returns the content identity of what was read plus the bytes themselves.
        Bound violations and credential material are typed failures; a file that
        changes while it is being read surfaces as an identity conflict, and a
        file or directory that moves under the Worker's own read surfaces as
        `VIEW_CHANGED`. Both mean "not settled yet" to the settle loop, which is
        the only place that decides to wait - a special file, a traversal or
        file-count overflow, or a plain fault is reported straight through.
        """
        if self.state_bundle_prefix is None:
            return {}, {}
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
            if relative in self.protected_state_paths:
                # Declared read-only configuration, not captured state.
                continue
            if not isinstance(size, int) or size < 0 or size > 8 * 1024 * 1024:
                raise SidecarError("SIDECAR_STATE_OUTSIDE_BOUNDS", "state file exceeds bound")
            total += size
            if len(selected) >= 256 or total > 8 * 1024 * 1024:
                raise SidecarError("SIDECAR_STATE_OUTSIDE_BOUNDS", "state projection exceeds bound")
            selected.append((path, relative, size))
        contents: dict[str, bytes] = {}
        identity: dict[str, tuple[int, str]] = {}
        for path, relative, size in selected:
            content, digest_value = self._view_bytes(path)
            if len(content) != size:
                raise SidecarError(
                    "SIDECAR_STATE_IDENTITY_CONFLICT", "state size changed during capture",
                )
            if self._forbidden_content and self._forbidden_content in content:
                # The path is diagnostics and names the file to investigate;
                # the message never carries the matched material itself.
                raise SidecarError(
                    "SIDECAR_STATE_CONTAINS_SECRET",
                    f"credential material found in native state: {relative}",
                )
            contents[relative] = content
            identity[relative] = (size, digest_value)
        return identity, contents

    def _settled_state(self, *, deadline_seconds: float | None = None,
                       interval_seconds: float | None = None) -> dict[str, bytes]:
        """Wait, bounded, until the state subtree stops changing, then return it.

        A native Harness may still be finishing its own writes right after
        `close` - appending transcripts, removing the short-lived alias links it
        created - so the first snapshots can differ. Two identical consecutive
        snapshots mean it stopped, and only then are those bytes returned; a
        subtree that never stops changing fails with `SIDECAR_STATE_NOT_SETTLED`
        rather than producing a checkpoint that mixes two moments.
        """
        if self.state_bundle_prefix is None:
            return {}
        deadline = time.monotonic() + (
            self.STATE_SETTLE_DEADLINE_SECONDS if deadline_seconds is None else deadline_seconds
        )
        pause = (self.STATE_SETTLE_INTERVAL_SECONDS
                 if interval_seconds is None else interval_seconds)
        previous: dict[str, tuple[int, str]] | None = None
        while True:
            try:
                identity, contents = self._state_snapshot()
            except BaseException as error:  # noqa: BLE001 - classified, not swallowed
                if not _state_error_is_transient(error):
                    raise
                identity, contents = None, None
            if identity is not None and previous is not None and identity == previous:
                return contents
            previous = identity
            if time.monotonic() >= deadline:
                raise SidecarError(
                    "SIDECAR_STATE_NOT_SETTLED",
                    "the native state subtree did not stop changing before the deadline",
                )
            time.sleep(pause)

    def capture_state(self, *, deadline_seconds: float | None = None,
                      interval_seconds: float | None = None) -> dict[str, bytes]:
        """Read back only the deployment-declared writable state subtree, once it
        has stopped changing."""
        return self._settled_state(
            deadline_seconds=deadline_seconds, interval_seconds=interval_seconds,
        )

    def settle_state(self, *, deadline_seconds: float | None = None,
                     interval_seconds: float | None = None) -> None:
        """Wait until the state subtree stops changing, without reading it out."""
        self._settled_state(
            deadline_seconds=deadline_seconds, interval_seconds=interval_seconds,
        )

    def _view_bytes(self, path: str) -> tuple[bytes, str]:
        chunks = bytearray()
        expected = None
        while True:
            try:
                item = self.client.request("view.get", {
                    "viewId": self.view_id, "path": path,
                    "offset": len(chunks), "maxLength": 32 * 1024,
                })
            except BaseException as error:  # noqa: BLE001 - classified, not swallowed
                code = getattr(error, "code", None)
                # The Worker refuses a missing path as a deterministic
                # VIEW_MISSING because it cannot know whether the caller ever
                # saw the file. This capture just listed it, so here - and only
                # here - the refusal means "the bytes moved": retry, bounded.
                if code == "VIEW_MISSING":
                    raise SidecarError(
                        "SIDECAR_STATE_IDENTITY_CONFLICT", "state file is gone",
                    ) from error
                # A range refusal mid-read means the file no longer reaches the
                # offset this capture was served a moment ago - it got shorter
                # under the read. The first request has no such history, so its
                # range refusal stays the deterministic error it arrived as.
                if code == "VIEW_INVALID" and chunks:
                    raise SidecarError(
                        "SIDECAR_STATE_IDENTITY_CONFLICT", "state fetch offset moved",
                    ) from error
                raise
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
            self._stop_lease()
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
        # Set when the channel reader itself failed (for example a keepalive
        # that could not keep the lease). The pending request must see that
        # reason and its code, not a generic "sidecar exited".
        self._reader_error: BaseException | None = None
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
                    raise self._closed_error()
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise SidecarError("SIDECAR_TIMEOUT", f"no answer for {payload.get('op')}")
                self._condition.wait(min(remaining, 1.0))
            answer = self._responses.pop(request_id)
        if not answer.get("ok"):
            error = answer.get("error") or {}
            raise SidecarError(str(error.get("code", "SIDECAR_ERROR")), str(error.get("message", "")))
        return answer.get("result") or {}

    def _closed_error(self) -> "SidecarError":
        """The reason the channel ended: the reader's own typed failure first.

        A keepalive failure is a real cause and must reach the caller with its
        code; "sidecar exited before answering" stays the fallback for every
        ordinary close.
        """
        reader_error = self._reader_error
        if isinstance(reader_error, SidecarError):
            return reader_error
        if reader_error is not None and getattr(reader_error, "code", None):
            return SidecarError(str(reader_error.code), str(getattr(reader_error, "message", reader_error)))
        return SidecarError("SIDECAR_CLOSED", "sidecar exited before answering")

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

    def settle_state(self) -> None:
        settle = getattr(self._channels, "settle_state", None)
        if callable(settle):
            settle()

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
            self._reader_error = exc
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

    The port also owns the *effective* capability view of each execution: the
    deployment's static declaration intersected with what the native side really
    demonstrated during that execution. Downstream behaviour (checkpoint
    resumability, attachment dispatch) reads that view, so a declared ability
    never becomes a product promise on its own, and an observed ability never
    exceeds what was declared.
    """

    def __init__(
        self, launcher: SidecarLauncher, *, environment: Mapping[str, str],
        profile: str = "", adapter: Mapping[str, Any] | None = None,
        model: str | None = None, credential_environment: str | None = None,
        preferred_auth_method: str | None = None,
        resume_native_id: str | None = None,
        state_directory: str = "/tmp/agentbox-sidecar",
        directory: str = "/workspace", on_event=None,
        declared_capabilities: Mapping[str, bool] | None = None,
    ) -> None:
        self.launcher = launcher
        self.environment = dict(environment)
        # 调用方必须给出部署声明的 harness 类型；空值会在 register 时被 sidecar
        # 以 HARNESS_PROFILE_UNREGISTERED 拒绝，这里不替任何一家猜一个默认名字。
        self.profile = profile
        self.adapter = dict(adapter or {})
        self.model = model
        self.credential_environment = credential_environment
        self.preferred_auth_method = preferred_auth_method
        self.resume_native_id = resume_native_id
        self.state_directory = state_directory
        self.directory = directory
        self.on_event = on_event or (lambda *_: None)
        # 静态上限：只能来自部署/插件声明（经 canonical 校验）；缺省按“全部 false”
        # 处理——不猜、不默认 true。
        if declared_capabilities is None:
            self.declared_capabilities: dict[str, bool] = {}
        else:
            self.declared_capabilities = validate_claims(declared_capabilities)
        self._sessions: dict[str, SidecarEnvelope] = {}
        self._native_sessions: dict[str, str] = {}
        self._approvals: dict[str, tuple[str, str]] = {}
        self._native_closed: set[str] = set()
        # 本次执行的原生观测与观测来源；observed 只反映这一次执行，绝不回写静态声明。
        self._observed: dict[str, dict[str, bool | None]] = {}
        self._evidence: dict[str, dict[str, str]] = {}
        self._current: str = ""
        self._lock = threading.RLock()

    def open_execution(self, execution_id: str) -> str:
        """Open a sidecar, register the profile, and open one native session.

        Returns the opaque native session id. Credentials are never passed here:
        the Worker materializes them inside the isolated projection.
        """
        with self._lock:
            if execution_id in self._sessions:
                return self._native_sessions[execution_id]
            # 早于 start/create 设置：原生在打开会话时播发的事件也属于这次执行。
            self._current = execution_id
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
                session_operation = "create"
            else:
                session = envelope.request({"op": "open", "sessionId": self.resume_native_id})
                session_operation = "open"
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
            self._current = execution_id
            # 运行时观测只记录原生真正给出的事实，且只属于本次执行：
            # - start 操作合同已注册且被真实调用，这就是 start 的观测来源；
            # - create/open 返回了原生会话身份，这就是 observe 的观测来源；
            # - 会话/提示能力按原生播发读取（空对象算播发，null/缺失是“未观测”）。
            self._record_observation(execution_id, "start", True, "sidecar.operation.start")
            self._record_observation(
                execution_id, "observe", True, f"sidecar.operation.{session_operation}",
            )
            self._record_observation(
                execution_id, "native_continuation",
                _advertised((started.get("sessionCapabilities") or {}).get("resume")),
                "sessionCapabilities.resume",
            )
            self._record_observation(
                execution_id, "attach",
                _advertised_image((started.get("promptCapabilities") or {}).get("image")),
                "promptCapabilities.image",
            )
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
        # checkpoint 的可续接性读的是有效能力：静态声明了 native_continuation
        # 且本次执行真的被原生播发过，才允许声明 resumable。
        resumable = self._effective_supported(execution_id, "native_continuation")
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
        items = [dict(item) for item in attachments]
        if items and not self._effective_supported(execution_id, "attach"):
            # 有效 attach=false 时在派发前类型化拒绝：附件要么被原生真正支持，
            # 要么带着明确错误失败，绝不静默丢弃。
            raise SidecarError(
                "ATTACHMENT_UNSUPPORTED",
                "this execution has no effective 'attach' capability",
            )
        with self._lock:
            self._current = execution_id
        result = envelope.request(
            {"op": "prompt", "sessionId": self._native_sessions[execution_id], "text": text,
             "model": self.model, "attachments": items},
            timeout=600,
        )
        # prompt 返回即完成合同被真实调用，这是 finish 的观测来源。
        self._record_observation(execution_id, "finish", True, "sidecar.operation.prompt")
        return result

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
            self._observed.pop(execution_id, None)
            self._evidence.pop(execution_id, None)
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
            self._observed.clear()
            self._evidence.clear()
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

    def effective_capabilities(self, execution_id: str) -> dict:
        """该 execution 的 canonical 能力视图（静态声明 ∩ 本次运行时观测）。

        形状与 ``harness_capabilities.capability_view`` 一致：``declared`` 永远是静态
        上限，``observed`` 三态且随执行过程更新（例如首条 delta 到达后
        ``stream.observed=true``），``supported`` 是两者合并后的结论。未知 execution
        抛出与 `_native`/`_require` 一致的 ``EXECUTION_UNKNOWN``。
        """
        with self._lock:
            if execution_id not in self._sessions:
                raise SidecarError("EXECUTION_UNKNOWN", "no sidecar for this execution")
        return capability_view(self.profile, self._effective(execution_id))

    def _effective(self, execution_id: str) -> tuple[CapabilityDeclaration, ...]:
        with self._lock:
            observed = dict(self._observed.get(execution_id) or {})
            evidence = dict(self._evidence.get(execution_id) or {})
        return merge_capabilities(self.declared_capabilities, observed, evidence=evidence)

    def _effective_supported(self, execution_id: str, capability_id: str) -> bool:
        for declaration in self._effective(execution_id):
            if declaration.id == capability_id:
                return declaration.supported
        return False

    def _record_observation(
        self, execution_id: str, capability_id: str, value: bool | None,
        evidence: str | None = None,
    ) -> None:
        """记录一条本次执行的原生事实。

        ``None`` 表示"没有观测到"，既不写观测也不覆盖已有观测——观测是单调事实，
        而且它只影响本次执行的合并结果，不会回写任何静态声明。
        """
        if value is None:
            return
        with self._lock:
            self._observed.setdefault(execution_id, {})[capability_id] = value
            if evidence is not None:
                self._evidence.setdefault(execution_id, {})[capability_id] = evidence

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
                    # 收到一条流式增量，就是 stream 被真实观测到的证据；两条传输
                    # （ACP 与 deployment-declared driver）在这里汇成同一个产品事实。
                    self._record_observation(
                        execution_id, "stream", True, "sidecar.event.message.delta",
                    )
                    self.on_event(execution_id, "message.delta", {"text": text})
        elif event == "message_delta":
            # A deployment-declared native driver reports the same product fact
            # as an ACP message chunk. The event name is the driver contract's,
            # never a Harness's, so this mapping stays brand-free.
            text = str(data.get("text") or "")
            if text:
                self._record_observation(
                    execution_id, "stream", True, "sidecar.event.message.delta",
                )
                self.on_event(execution_id, "message.delta", {"text": text})
        elif event == "driver_exit":
            self.on_event(execution_id, "failed", {"code": "ADAPTER_EXIT"})
        elif event == "adapter_exit":
            self.on_event(execution_id, "failed", {"code": "ADAPTER_EXIT"})
        elif event == "permission_request":
            # 只有真实发生了 permission round-trip、并且插件静态声明了
            # permissions 时，才把它算作观测；否则保持“未观测”，绝不因为一次
            # 原生请求或某种 deny 默认就宣称支持审批。请求本身仍然如实上报。
            if self.declared_capabilities.get("permissions"):
                self._record_observation(
                    execution_id, "permissions", True,
                    "sidecar.operation.permission_request",
                )
            self.on_event(execution_id, "approval.requested", {"request": data})
