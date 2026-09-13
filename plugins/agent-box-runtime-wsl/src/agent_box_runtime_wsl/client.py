"""ABW1 client; Worker control frames never share child output streams."""
from __future__ import annotations

import base64
import hashlib
import json
import queue
import struct
import subprocess
import threading
import time
from typing import Any, BinaryIO, Callable, Sequence
from uuid import uuid4


MAGIC = b"ABW1"
VERSION = 1
HEADER_LEN = 60
MAX_PAYLOAD = 64 * 1024
HELLO = 1
HELLO_ACK = 2
DATA = 5
EXIT = 7
WORKER_ERROR = 8
# Control-protocol generation. The frame format is unchanged; version 2 adds
# interactive spawn, attempt.write, and pre-terminal process.output events.
# The mismatch is a loud handshake failure, never silent one-shot fallback.
PROTOCOL_VERSION = 2


class WorkerError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def encode_frame(kind: int, stream_id: int, sequence: int, payload: bytes) -> bytes:
    if len(payload) > MAX_PAYLOAD:
        raise ValueError("worker payload exceeds bounded frame size")
    return b"".join((
        MAGIC, struct.pack(">HBBQQI", VERSION, kind, 0, stream_id, sequence, len(payload)),
        hashlib.sha256(payload).digest(), payload,
    ))


def read_frame(stream: BinaryIO) -> tuple[int, int, int, bytes]:
    header = _read_exact(stream, HEADER_LEN)
    if header[:4] != MAGIC:
        raise WorkerError("FRAME_BAD_MAGIC", "Worker frame magic did not match")
    version, kind, reserved, stream_id, sequence, size = struct.unpack(">HBBQQI", header[4:28])
    if version != VERSION or reserved != 0 or size > MAX_PAYLOAD:
        raise WorkerError("FRAME_INVALID", "Worker frame header is invalid")
    payload = _read_exact(stream, size)
    if not hashlib.sha256(payload).digest() == header[28:60]:
        raise WorkerError("FRAME_DIGEST_MISMATCH", "Worker frame digest did not match")
    return kind, stream_id, sequence, payload


def _read_exact(stream: BinaryIO, size: int) -> bytes:
    chunks = bytearray()
    while len(chunks) < size:
        value = stream.read(size - len(chunks))
        if not value:
            raise EOFError("Worker control stream closed")
        chunks.extend(value)
    return bytes(chunks)


class WorkerClient:
    def __init__(
        self, command: Sequence[str], *, worker_digest: str, worker_version: str,
        connection_id: str, project_id: str, effective_user: str,
        server_instance_id: str, lease_ms: int = 5_000,
        executable_authorizations: Sequence[dict[str, str]] = (),
    ) -> None:
        self.command = tuple(command)
        self.worker_digest = worker_digest
        self.worker_version = worker_version
        self.connection_id = connection_id
        self.project_id = project_id
        self.effective_user = effective_user
        self.server_instance_id = server_instance_id
        self.lease_ms = lease_ms
        self.executable_authorizations = tuple(
            dict(item) for item in executable_authorizations
        )
        self._process: subprocess.Popen | None = None
        self._frames: queue.Queue = queue.Queue()
        self._reader: threading.Thread | None = None
        self._request_sequence = 2
        self._terminals: dict[tuple[str, int], dict[str, Any]] = {}
        self._pending: dict[str, dict[str, Any]] = {}
        self._event_listeners: list[Callable[[dict[str, Any]], None]] = []

    def subscribe_output(self, listener: Callable[[dict[str, Any]], None]) -> Callable[[], None]:
        """Receive pre-terminal worker events (process.output, ...)."""
        self._event_listeners.append(listener)
        return lambda: self._event_listeners.remove(listener) if listener in self._event_listeners else None

    def _dispatch_event(self, value: dict[str, Any]) -> bool:
        if not value.get("event") or value.get("event") == "process.terminal":
            return False
        for listener in tuple(self._event_listeners):
            try:
                listener(value)
            except Exception:
                pass
        return True

    def write_stdin(self, attempt_id: str, generation: int, data: bytes, *, timeout: float = 10.0) -> int:
        """Append one bounded stdin chunk to a live interactive attempt."""
        result = self.request(
            "attempt.write", {"data": base64.b64encode(data).decode()},
            attempt_id=attempt_id, generation=generation, timeout=timeout,
        )
        return int(result["written"])

    def close_stdin(self, attempt_id: str, generation: int, *, timeout: float = 10.0) -> None:
        """Deliver EOF to a live interactive attempt's stdin."""
        self.request("stdin.close", {}, attempt_id=attempt_id, generation=generation, timeout=timeout)

    def start(self, *, timeout: float = 10.0) -> dict[str, Any]:
        if self._process is not None:
            raise RuntimeError("Worker client is already started")
        self._process = subprocess.Popen(
            self.command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, bufsize=0,
        )
        assert self._process.stdin and self._process.stdout
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()
        bootstrap = {
            "workerVersion": self.worker_version, "workerDigest": self.worker_digest,
            "connectionId": self.connection_id, "projectId": self.project_id,
            "effectiveUser": self.effective_user, "instanceNonce": f"nonce-{uuid4().hex}",
            "serverInstanceId": self.server_instance_id, "leaseMs": self.lease_ms,
            "protocolVersion": PROTOCOL_VERSION,
            "executables": list(self.executable_authorizations),
        }
        self._write(HELLO, 0, 1, bootstrap)
        kind, _stream, _sequence, payload = self._next(timeout)
        if kind != HELLO_ACK:
            self.close()
            raise WorkerError("HANDSHAKE_REJECTED", "Worker did not acknowledge bootstrap")
        value = json.loads(payload)
        if value.get("protocolVersion") != PROTOCOL_VERSION:
            self.close()
            raise WorkerError(
                "HANDSHAKE_VERSION_UNSUPPORTED",
                f"Worker control protocol {value.get('protocolVersion')!r} != required {PROTOCOL_VERSION}",
            )
        if (value.get("workerVersion") != self.worker_version
                or value.get("workerDigest") != self.worker_digest
                or value.get("connectionId") != self.connection_id
                or value.get("serverInstanceId") != self.server_instance_id):
            self.close()
            raise WorkerError("HANDSHAKE_IDENTITY_MISMATCH", "Worker handshake identity did not match")
        return value

    def request(
        self, op: str, arguments: dict[str, Any] | None = None, *,
        attempt_id: str | None = None, generation: int | None = None,
        timeout: float = 10.0,
    ) -> dict[str, Any]:
        request_id = f"request-{uuid4().hex}"
        body: dict[str, Any] = {
            "requestId": request_id, "connectionId": self.connection_id,
            "serverInstanceId": self.server_instance_id, "op": op,
            "arguments": arguments or {},
        }
        if attempt_id is not None:
            body["attemptId"] = attempt_id
        if generation is not None:
            body["generation"] = generation
        self._write(DATA, 0, self._request_sequence, body)
        self._request_sequence += 1
        deadline = time.monotonic() + timeout
        while True:
            if request_id in self._pending:
                value = self._pending.pop(request_id)
            else:
                value = self._receive_json(max(0.01, deadline - time.monotonic()))
            if value.get("event") == "process.terminal":
                result = value["result"]
                self._terminals[(result["attemptId"], result["generation"])] = result
                continue
            if self._dispatch_event(value):
                continue
            target = value.get("requestId")
            if target != request_id:
                if target:
                    self._pending[target] = value
                continue
            if not value.get("ok"):
                error = value.get("error") or {}
                raise WorkerError(str(error.get("code", "WORKER_ERROR")), str(error.get("message", "Worker request failed")))
            return value["result"]

    def wait_terminal(self, attempt_id: str, generation: int, *, timeout: float = 35.0) -> dict[str, Any]:
        key = (attempt_id, generation)
        deadline = time.monotonic() + timeout
        heartbeat_at = time.monotonic() + self.lease_ms / 3000
        while time.monotonic() < deadline:
            if key in self._terminals:
                return self._terminals.pop(key)
            remaining = min(deadline - time.monotonic(), max(0.05, heartbeat_at - time.monotonic()))
            try:
                value = self._receive_json(remaining)
            except TimeoutError:
                self.request("heartbeat", timeout=2.0)
                heartbeat_at = time.monotonic() + self.lease_ms / 3000
                continue
            if value.get("event") == "process.terminal":
                result = value["result"]
                target = (result["attemptId"], result["generation"])
                if target == key:
                    return result
                self._terminals[target] = result
            elif self._dispatch_event(value):
                pass
            elif value.get("requestId"):
                self._pending[value["requestId"]] = value
        raise TimeoutError("Worker terminal result timed out")

    def close(self) -> None:
        process, self._process = self._process, None
        if process is None:
            return
        if process.stdin:
            try:
                process.stdin.close()
            except OSError:
                pass
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.terminate()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=2)

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *_args):
        self.close()

    def _write(self, kind: int, stream_id: int, sequence: int, value: dict[str, Any]) -> None:
        process = self._process
        if process is None or process.stdin is None:
            raise WorkerError("WORKER_NOT_RUNNING", "Worker is not running")
        payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        process.stdin.write(encode_frame(kind, stream_id, sequence, payload))
        process.stdin.flush()

    def _read_loop(self) -> None:
        try:
            assert self._process and self._process.stdout
            while True:
                kind, stream_id, sequence, payload = read_frame(self._process.stdout)
                if kind == DATA:
                    # Pre-terminal worker events go straight to subscribers from
                    # the reader thread: nobody may be inside a receive loop
                    # between prompts, yet streamed output must still arrive.
                    try:
                        value = json.loads(payload)
                    except ValueError:
                        value = None
                    if isinstance(value, dict) and value.get("event"):
                        self._dispatch_event(value)
                        continue
                self._frames.put((kind, stream_id, sequence, payload))
        except BaseException as exc:
            self._frames.put(exc)

    def _next(self, timeout: float):
        try:
            value = self._frames.get(timeout=timeout)
        except queue.Empty as exc:
            raise TimeoutError("Worker response timed out") from exc
        if isinstance(value, BaseException):
            message = "Worker control stream closed"
            if self._process and self._process.poll() is not None and self._process.stderr:
                diagnostic = self._process.stderr.read(4096).decode("utf-8", "replace").strip()
                if diagnostic:
                    message = diagnostic[-1024:]
            raise WorkerError("WORKER_DISCONNECTED", message) from value
        return value

    def _receive_json(self, timeout: float) -> dict[str, Any]:
        kind, _stream, _sequence, payload = self._next(timeout)
        if kind not in {DATA, EXIT, WORKER_ERROR}:
            raise WorkerError("FRAME_KIND_INVALID", "Unexpected Worker response kind")
        return json.loads(payload)
