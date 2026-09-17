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
MAX_PAYLOAD = 1024 * 1024
HELLO = 1
HELLO_ACK = 2
DATA = 5
EXIT = 7
WORKER_ERROR = 8
# Control-protocol generation. The frame format is unchanged; version 2 added
# interactive spawn, attempt.write, and pre-terminal process.output events;
# version 3 adds digest-pinned runtime artifact trees the Worker verifies
# inside WSL before bwrap may mount one read-only; version 4 adds the
# persistent home operation family (home.prepare / home.list / home.get) that
# the native-home storage model requires. Every mismatch is a loud handshake
# failure in both directions, never a silent one-shot fallback.
PROTOCOL_VERSION = 4


class WorkerError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class WorkerRequestLockTimeout(TimeoutError):
    """等待请求串行化锁超时：本次请求没有写出任何帧。

    它是 TimeoutError 的子类，所以既有的超时语义不变；保活 owner 用它区分
    "锁被别的请求占用、这一拍没发出" 与 "帧已发出但 Worker 没回应"。
    """


def lease_heartbeat_interval(lease_ms: int) -> float:
    """保活间隔：由租约派生，至多约 lease/3，且不小于 50 毫秒。

    不写死任何只适合默认 5 秒租约的常量：Worker 接受的租约范围是
    1000..=120000 毫秒，间隔必须跟着走。
    """
    return max(lease_ms / 3000, 0.05)


def _heartbeat_timeout(interval: float) -> float:
    """heartbeat 请求的超时必须短：静默期里的 cancel 要与它竞争同一把锁。"""
    return min(2.0, interval)


class LeaseKeepalive:
    """拥有一个活跃 interactive attempt 的租约保活 owner。

    已确证的缺陷：Worker 只在收到客户端帧时刷新 lease_deadline；interactive
    轮次期间 Server 线程阻塞在 sidecar prompt 上、没有任何帧发出，默认 5 秒
    租约就会让 Worker 取消仍在正常运行的进程（客户端随后看到
    ``ATTEMPT_NOT_INTERACTIVE``）。本 owner 是那段静默期唯一的保活来源，
    因此它的生命周期必须与该轮 attempt 严格绑定：

    - 间隔由租约派生（``lease_heartbeat_interval``），``start()`` 后立即发第一拍；
    - ``stop()``/``close()`` 幂等、join 线程，停止后心跳计数不再增长；
    - heartbeat 失败记录为类型化 ``failure``（``WORKER_LEASE_HEARTBEAT_FAILED``，
      根因保留在 message 与 ``__cause__`` 上）并停止保活，调用方据此把该轮变成
      类型化失败，绝不静默续跑、也绝不让 prompt 无限等待；
    - 心跳的响应只由它自己的请求路径消费；超时未消费的响应会被显式丢弃
      （见 ``WorkerClient._abandon``），``_pending`` 里不留残渣。
    """

    def __init__(self, client: "WorkerClient", *, label: str = "attempt") -> None:
        self._client = client
        self._label = label
        self._interval = lease_heartbeat_interval(client.lease_ms)
        self._timeout = _heartbeat_timeout(self._interval)
        # 串行化锁连续被别的请求占用多少拍算保活失效：3 拍 * 间隔已接近一整个
        # 租约周期，此时 fail-closed 比继续假装保活更诚实。
        self._skip_budget = 3
        self._stop_event = threading.Event()
        self._state_lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._started = False
        self._heartbeats = 0
        self._failure: WorkerError | None = None

    @property
    def label(self) -> str:
        return self._label

    @property
    def interval(self) -> float:
        """本 owner 的保活间隔（秒）。"""
        return self._interval

    @property
    def timeout(self) -> float:
        """单拍 heartbeat 请求的超时（秒）。"""
        return self._timeout

    @property
    def heartbeats(self) -> int:
        """本 owner 实际发出的 heartbeat 拍数（停止/失败后不再增长）。"""
        with self._state_lock:
            return self._heartbeats

    @property
    def failure(self) -> WorkerError | None:
        """类型化失败；为 None 表示保活期间没有发生过 heartbeat 失败。"""
        with self._state_lock:
            return self._failure

    @property
    def thread(self) -> threading.Thread | None:
        """仍在运行的保活线程（stop() join 成功后为 None）。"""
        return self._thread

    def start(self) -> None:
        """开始保活：立即发第一拍，之后按租约派生的间隔继续。"""
        with self._state_lock:
            if self._started:
                return
            self._started = True
        if self._client.closed:
            # 客户端已经 close：没有可保活的连接，直接类型化失败，不起线程。
            self._fail(WorkerError("WORKER_NOT_RUNNING", "Worker client is closed"))
            return
        self._thread = threading.Thread(
            target=self._run, name=f"worker-lease-{self._label}", daemon=True,
        )
        self._thread.start()

    def stop(self, *, join_timeout: float | None = None) -> None:
        """停止保活并 join 线程；幂等，可在 finally 里无条件调用。"""
        with self._state_lock:
            self._stop_event.set()
            thread = self._thread
        if thread is not None and thread is not threading.current_thread():
            # 线程最多再等一个在途 heartbeat（锁等待 + 响应等待都有界）。
            thread.join(timeout=2 * self._timeout + 2.0 if join_timeout is None else join_timeout)
        if thread is not None and thread.is_alive():
            # 在途请求还没回来：保留句柄以便再次 join，不谎报已停止。
            return
        self._thread = None
        forget = getattr(self._client, "_forget_keepalive", None)
        if callable(forget):
            forget(self)

    def close(self) -> None:
        """stop() 的别名：显式关闭与上下文管理器收敛到同一条路径。"""
        self.stop()

    def __enter__(self) -> "LeaseKeepalive":
        self.start()
        return self

    def __exit__(self, *_args) -> None:
        self.close()

    def _run(self) -> None:
        skips = 0
        while not self._stop_event.is_set():
            try:
                # 先发一拍再睡：start() 之后立即进入保活，第一帧不必等满间隔。
                self._beat()
            except WorkerRequestLockTimeout:
                # 锁被别的请求占用（例如静默期里的 write_stdin/cancel）：这一拍
                # 没有发出，而占用者本身就在刷新租约，所以先容忍；连续跳过整个
                # 租约周期的量之后按类型化失败收尾，绝不无限等待。
                skips += 1
                if skips > self._skip_budget:
                    self._fail(WorkerError(
                        "WORKER_REQUEST_LOCK_TIMEOUT",
                        f"{self._label}: lease keepalive could not send a heartbeat",
                    ))
                    return
            except BaseException as exc:
                if self._stop_event.is_set():
                    # stop()/close() 与在途 heartbeat 的竞态：这不是租约失败。
                    return
                self._fail(exc)
                return
            else:
                skips = 0
            if self._stop_event.wait(self._interval):
                return

    def _beat(self) -> None:
        """发出一拍 heartbeat；锁被占用（一个帧都没发出）时计数回滚并抛出。"""
        with self._state_lock:
            self._heartbeats += 1
        try:
            self._client.request("heartbeat", timeout=self._timeout)
        except WorkerRequestLockTimeout:
            with self._state_lock:
                self._heartbeats -= 1
            raise

    def _fail(self, exc: BaseException) -> None:
        """把底层失败上浮成类型化失败；根因保留在 message 与 __cause__ 上。"""
        root = getattr(exc, "code", None) or type(exc).__name__
        detail = getattr(exc, "message", None) or str(exc)
        error = WorkerError(
            "WORKER_LEASE_HEARTBEAT_FAILED",
            f"{self._label}: lease heartbeat failed ({root}): {detail}",
        )
        error.__cause__ = exc
        with self._state_lock:
            if self._failure is None:
                self._failure = error


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


def _refusal(payload: bytes) -> WorkerError:
    """Turn one Worker bootstrap refusal frame into a typed error."""
    try:
        value = json.loads(payload)
    except ValueError:
        return WorkerError("HANDSHAKE_REJECTED", "Worker refused the bootstrap")
    error = value.get("error") if isinstance(value, dict) else None
    if not isinstance(error, dict):
        return WorkerError("HANDSHAKE_REJECTED", "Worker refused the bootstrap")
    code = str(error.get("code") or "HANDSHAKE_REJECTED")
    return WorkerError(code, str(error.get("message") or code))


class WorkerClient:
    def __init__(
        self, command: Sequence[str], *, worker_digest: str, worker_version: str,
        connection_id: str, project_id: str, effective_user: str,
        server_instance_id: str, lease_ms: int = 5_000,
        executable_authorizations: Sequence[dict[str, str]] = (),
        runtime_artifact_authorizations: Sequence[dict[str, str]] = (),
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
        self.runtime_artifact_authorizations = tuple(
            dict(item) for item in runtime_artifact_authorizations
        )
        self._process: subprocess.Popen | None = None
        self._frames: queue.Queue = queue.Queue()
        self._reader: threading.Thread | None = None
        self._request_sequence = 2
        self._terminals: dict[tuple[str, int], dict[str, Any]] = {}
        self._pending: dict[str, dict[str, Any]] = {}
        # 已放弃请求的迟到响应：到达时显式丢弃，绝不留进 _pending。
        self._abandoned: dict[str, None] = {}
        # 请求串行化锁：序号递增、_write、响应路由只允许一个消费者进入。
        self._request_lock = threading.RLock()
        self._keepalive_lock = threading.Lock()
        self._live_keepalives: list[LeaseKeepalive] = []
        self._closed = False
        self._event_listeners: list[Callable[[dict[str, Any]], None]] = []
        self._disconnect_listeners: list[Callable[[WorkerError], None]] = []

    def subscribe_output(self, listener: Callable[[dict[str, Any]], None]) -> Callable[[], None]:
        """Receive pre-terminal worker events (process.output, ...)."""
        self._event_listeners.append(listener)
        return lambda: self._event_listeners.remove(listener) if listener in self._event_listeners else None

    def subscribe_disconnect(self, listener: Callable[[WorkerError], None]) -> Callable[[], None]:
        """Wake long-lived channel owners when the Worker control stream dies."""
        self._disconnect_listeners.append(listener)
        return lambda: (
            self._disconnect_listeners.remove(listener)
            if listener in self._disconnect_listeners else None
        )

    def _dispatch_event(self, value: dict[str, Any]) -> bool:
        if not value.get("event"):
            return False
        for listener in tuple(self._event_listeners):
            try:
                listener(value)
            except Exception:
                pass
        # Terminal frames are also queued for wait_terminal after listeners
        # observe them; other pre-terminal events are subscriber-only.
        return value.get("event") != "process.terminal"

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
            "runtimeArtifacts": list(self.runtime_artifact_authorizations),
        }
        self._write(HELLO, 0, 1, bootstrap)
        kind, _stream, _sequence, payload = self._next(timeout)
        if kind == WORKER_ERROR:
            # A bootstrap refusal is typed: the Worker answers the handshake it
            # will not accept with a code, so a digest mismatch is never
            # flattened into a generic disconnect.
            self.close()
            raise _refusal(payload)
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
        # 所有出站请求共用一把互斥锁：_request_sequence 递增、帧写入与响应路由
        # 必须串行，两个 request 消费者绝不交错到同一条 Worker 控制流上。
        # 锁等待有界（不超过本次请求的超时），静默期的 cancel 不会被 heartbeat
        # 无限饿死；拿不到锁时一个帧都没发出，所以这里可以安全地类型化上报。
        if not self._request_lock.acquire(timeout=max(0.01, timeout)):
            raise WorkerRequestLockTimeout(
                "Worker request lock was busy; this request sent no frame"
            )
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
        deferred: list[dict[str, Any]] = []
        responded = False
        try:
            deadline = time.monotonic() + timeout
            self._write(DATA, 0, self._request_sequence, body)
            self._request_sequence += 1
            while True:
                if request_id in self._pending:
                    value = self._pending.pop(request_id)
                else:
                    try:
                        # 短切片轮询：响应帧可能先被并发的 wait_terminal 消费者
                        # 取走并回投到 _pending，切片保证我们很快重新检查它，
                        # 而不是一直阻塞在自己那一次超时上。
                        value = self._receive_json(
                            min(0.05, max(0.01, deadline - time.monotonic()))
                        )
                    except TimeoutError:
                        if time.monotonic() < deadline:
                            continue
                        raise
                if value.get("event") == "process.terminal":
                    result = value["result"]
                    self._terminals[(result["attemptId"], result["generation"])] = result
                    continue
                if value.get("event"):
                    # 事件分发放到锁外：监听器若在同一线程里再发请求也不会自锁。
                    deferred.append(value)
                    continue
                target = value.get("requestId")
                if target != request_id:
                    if target:
                        self._route(str(target), value)
                    continue
                responded = True
                if not value.get("ok"):
                    error = value.get("error") or {}
                    raise WorkerError(str(error.get("code", "WORKER_ERROR")), str(error.get("message", "Worker request failed")))
                return value["result"]
        except BaseException:
            if not responded:
                # 超时/中断后才到达的响应会在路由处被显式丢弃，_pending 不留残渣。
                self._abandon(request_id)
            raise
        finally:
            self._request_lock.release()
            for value in deferred:
                self._dispatch_event(value)

    def wait_terminal(self, attempt_id: str, generation: int, *, timeout: float = 35.0) -> dict[str, Any]:
        key = (attempt_id, generation)
        deadline = time.monotonic() + timeout
        # 既有语义原样保留：wait_terminal 仍然是第二个帧消费者，仍然自己发
        # heartbeat（节拍与超时都不变）。
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
                # 既有语义不变：他人响应回投；已放弃请求的迟到响应直接丢弃。
                self._route(str(value["requestId"]), value)
        raise TimeoutError("Worker terminal result timed out")

    def _route(self, request_id: str, value: dict[str, Any]) -> None:
        """把不属于当前消费者的响应回投给它的请求者。

        已被放弃（超时/中断）的请求不会再有人消费，响应在这里显式丢弃，
        保证 ``_pending`` 里不残留 heartbeat 之类的迟到响应。
        """
        if request_id in self._abandoned:
            self._abandoned.pop(request_id, None)
            return
        self._pending[request_id] = value

    def _abandon(self, request_id: str) -> None:
        self._pending.pop(request_id, None)
        self._abandoned[request_id] = None
        while len(self._abandoned) > 64:  # 有界：断开连接时不会无限增长
            self._abandoned.pop(next(iter(self._abandoned)))

    def keep_lease(self, *, label: str = "attempt") -> LeaseKeepalive:
        """为一个活跃 interactive attempt 创建租约保活 owner。

        返回的 owner 由调用方负责 ``start()``/``stop()``；``close()`` 会兜底停止
        所有仍然登记着的 owner，保证不存在遗留线程。
        """
        owner = LeaseKeepalive(self, label=label)
        with self._keepalive_lock:
            self._live_keepalives.append(owner)
        return owner

    def _forget_keepalive(self, owner: LeaseKeepalive) -> None:
        with self._keepalive_lock:
            if owner in self._live_keepalives:
                self._live_keepalives.remove(owner)

    def _stop_keepalives(self) -> None:
        with self._keepalive_lock:
            owners = list(self._live_keepalives)
        for owner in owners:
            owner.stop()

    @property
    def closed(self) -> bool:
        return self._closed

    def close(self) -> None:
        self._closed = True
        # 先停保活（join 线程），再拿串行化锁：之后不可能还有 _write 打向
        # 正在被关闭的进程，也不可能再有新的 heartbeat 发出。
        self._stop_keepalives()
        acquired = self._request_lock.acquire(timeout=5.0)
        try:
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
        finally:
            if acquired:
                self._request_lock.release()

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
        try:
            process.stdin.write(encode_frame(kind, stream_id, sequence, payload))
            process.stdin.flush()
        except OSError as exc:
            # 写侧断连与读侧同型化：Worker 进程消失时调用方看到的工作流错误
            # 必须是 WORKER_DISCONNECTED，而不是裸的 BrokenPipeError。
            raise WorkerError("WORKER_DISCONNECTED", f"Worker control stream closed: {exc}") from exc

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
            disconnected = WorkerError("WORKER_DISCONNECTED", "Worker control stream closed")
            for listener in tuple(self._disconnect_listeners):
                try:
                    listener(disconnected)
                except Exception:
                    pass
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
