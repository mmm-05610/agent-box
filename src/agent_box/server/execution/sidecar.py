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
        state_directory: str = "/tmp/agentbox-sidecar",
        directory: str = "/workspace", on_event=None,
    ) -> None:
        self.launcher = launcher
        self.environment = dict(environment)
        self.profile = profile
        self.adapter = dict(adapter or {})
        self.state_directory = state_directory
        self.directory = directory
        self.on_event = on_event or (lambda *_: None)
        self._sessions: dict[str, SidecarEnvelope] = {}
        self._native_sessions: dict[str, str] = {}
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
                "stateDirectory": self.state_directory, "directory": self.directory,
                "permissionRoundTrip": True, "permissionTimeoutMs": 60_000,
            })
            envelope.request({"op": "start"})
            session = envelope.request({"op": "create", "title": execution_id})
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
        self.on_event(execution_id, "started", {
            "nativeSessionId": native, "provenance": registered.get("provenance"),
        })
        return native

    def accept(self, execution_id: str, *, overrides: Mapping[str, Any] | None = None) -> None:
        """Open the execution; the prompt is issued by `prompt`."""
        del overrides
        self.open_execution(execution_id)

    def prompt(self, execution_id: str, text: str) -> dict[str, Any]:
        envelope = self._require(execution_id)
        with self._lock:
            self._current = execution_id
        return envelope.request(
            {"op": "prompt", "sessionId": self._native_sessions[execution_id], "text": text},
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
        if envelope is not None:
            try:
                envelope.request({"op": "close"}, timeout=5)
            except BaseException:
                pass
            envelope.close()

    def stop(self) -> bool:
        with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
            self._native_sessions.clear()
        for envelope in sessions:
            try:
                envelope.close()
            except BaseException:
                pass
        return True

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
        elif event == "adapter_exit":
            self.on_event(execution_id, "failed", {"code": "ADAPTER_EXIT"})
        elif event == "permission_request":
            self.on_event(execution_id, "approval.requested", {"request": data})
