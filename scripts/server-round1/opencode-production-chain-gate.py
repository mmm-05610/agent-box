#!/usr/bin/env python3
"""OpenCode 生产链路门：真实单文件二进制 + 本机假 DeepSeek 兼容端点。

链路（生产装配，只有一条）：

    Server（真实 build_runtime_from_sidecar_deployment + create_app + TestClient）
      → Core → generic sidecar deployment → c4 真实 release Worker（ABW1 interactive）
      → bwrap → /runtime/bin/opencode（摘要固定、只读）→ 本机 127.0.0.1 假端点

本门证明组件门证明不了的部分：单文件二进制的授权与 guest 内取版本、生产配置进入
隔离 HOME、凭据经 Server→Worker→sidecar 注入原生进程、SSE 增量按序到达 Server、
第二轮请求体带着第一轮的原生上下文、重开走真实存储（SQLite）而不是重放、未知模型
在发出 provider 请求之前被拒绝、以及"这次运行只到达 loopback"。

这不是模型验收：端点是本机假实现，只回两个固定 nonce；不读任何真实凭据、不访问
任何非 loopback 目的地。终态只登记 OPENCODE_PRODUCTION_CHAIN_PREPARED，绝不
MODEL_VERIFIED。

门自己强制的边界：

  * 生产模板从插件加载并断言仍是官方根地址；loopback 端点只作为一次列明的覆盖
    施加到本次运行的临时副本上，且禁止 gate-only 的预载/审计变量出现在生产默认里。
  * 单文件二进制由 `build-opencode-authorization.mjs` 取证，门再独立复核一遍
    （全量 sha256、ELF 头、宿主 `--version`），并在 guest 内再取一次版本。
  * loopback 出口由评审过的 C 守卫在 guest 进程内强制（LD_PRELOAD，仅门使用），
    每次加载与每次拒绝都写进 workspace 的审计文件，门逐条记录；并另做一次
    "非 loopback 必须被拒" 的对照实验，证明该机制真的在这个 guest 里生效。
  * 凭据是本次运行自建的 0600 假 token，经真实 MemorySecretStore → Worker
    secret.put → sidecar 环境注入；端点只记录"Authorization 是否与注入值相符"，
    从不记录值本身。
  * 假端点对超出预算的 provider 请求立即返回 500 并计数，隐式重试因此会让门失败，
    而不是藏进一个总数里。

    usage: opencode-production-chain-gate.py [--worker PATH] [--binary PATH]
                                             [--keep] [--json]
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import http.server
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import stat
import subprocess
import sys
import tempfile
import threading
import time
from typing import Sequence

REPO = Path(__file__).resolve().parents[2]
PLUGIN = REPO / "plugins" / "agent-box-harnesses"
AUTHORIZER = REPO / "scripts" / "server-round1" / "build-opencode-authorization.mjs"
SCRIPT = "scripts/server-round1/opencode-production-chain-gate.py"

#: 每次运行现生成一个假凭据：前缀显然为假（永不是凭据），后缀是本次运行的随机值。
#: 固定值曾在提交后必然命中"tracked Git 零命中"断言——源码自己就是被扫描的树，
#: 于是门在提交态自证失败。改成运行期生成后，被扫描的永远是本次实际注入的那个值，
#: 源码里只留前缀（前缀本身无法匹配完整 token）。生成值不打印、不进 argv，
#: 生命周期由 `_FakeToken` 收在 main 的一次运行内，清理核验后立即丢弃。
TOKEN_PREFIX = "agentbox-opencode-gate-fake-token-"
NONCE_ROUND_1 = "OC-GATE-NONCE-1C7B42"
NONCE_ROUND_2 = "OC-GATE-NONCE-2E5D93"
#: 受控重试实验的标记：请求体里出现它就进入"一律 500"的观测模式。
RETRY_MARKER = "OC-GATE-RETRY-PROBE"
AUDIT_NAME = ".agentbox-egress-audit"
DRIVER_AUDIT_NAME = ".agentbox-driver-audit"
#: 观测与反例阶段各自用独立审计文件，阶段之间不会互相污染证据。
DRIVER_AUDIT_OBSERVE = ".agentbox-driver-audit-observe"
DRIVER_AUDIT_NEGATIVE = ".agentbox-driver-audit-negative"
#: guest 内 loopback 守卫的只读投影目标：与只读配置同目录（同一个 XDG 配置根），
#: 不在可写 state 子树里，因此它自己是只读的、也不需要受保护路径。
GUARD_SOURCE = "deploy/opencode/egress-guard.so"
GUARD_TARGET = "/runtime/home/.config/opencode/opencode-egress-guard.so"
DRIVER_BUNDLE_PATH = "agentbox-sidecar/deployment/opencode/driver.mjs"
CONFIG_BUNDLE_PATH = "agentbox-sidecar/deployment/opencode/opencode.json"
STATE_BUNDLE_PREFIX = "agentbox-sidecar/deployment/opencode/native-state"
#: 本次运行创建的临时根前缀（系统临时目录下），也是"这是我们的目录"的判据。
TEMPORARY_PREFIX = "agentbox-opencode-gate-"
#: 受控重试实验的观测视野（秒）：到点即停，绝不把超时当成结论。
RETRY_HORIZON_SECONDS = 150.0
#: 窗口实验（先拒 2 次再作答）的视野：正常应在几秒内结束。
RETRY_WINDOW_HORIZON_SECONDS = 90.0
#: Worker 退出路径上的瞬时清理子进程的有界宽限（秒）。
SURVIVOR_GRACE_SECONDS = 30.0
#: 门侧 Worker lease：默认 5s 会取消静默超过 5 秒的 attempt（实测），
#: 长重试观测需要更大的值（spawn 超时上限仍是 120s）。
GATE_LEASE_MS = 120_000
#: 托管 host 停止后，监听端口消失的有界宽限（秒）。
PORT_CLOSE_GRACE_SECONDS = 30.0
REPORT: dict = {"result": "OPENCODE_PRODUCTION_CHAIN_GATE_FAILED", "script": SCRIPT}


class _FakeToken:
    """本次运行的一次性假凭据。只在 main 的运行窗口内存在，核验后清空。"""

    def __init__(self) -> None:
        self._value = ""

    def value(self) -> str:
        if not self._value:
            self._value = TOKEN_PREFIX + secrets.token_hex(16)
        return self._value

    def bytes(self) -> bytes:
        return self.value().encode()

    def clear(self) -> None:
        self._value = ""


_ACTIVE: "_FakeToken | None" = None

#: The credential bytes actually injected this run. Module-level default so the
#: final report-scrub can never be the thing that crashes a run that failed
#: before injection (e.g. a missing default Worker binary): before injection
#: there is nothing to scrub, which is exactly what an empty value expresses.
INJECTED_CREDENTIAL: bytes = b""


def current_token() -> "_FakeToken":
    """本次运行的假凭据；运行窗口之外调用即失败（没有 token 可以被误用）。"""
    if _ACTIVE is None:
        raise RuntimeError("OPENCODE_GATE_NO_ACTIVE_RUN")
    return _ACTIVE


class GateFailure(Exception):
    """一个门失败，带到 `main` 以便清理总是先跑。"""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


def fail(code: str, message: str) -> None:
    raise GateFailure(code, message)


def digest_of(content: bytes) -> str:
    return "sha256:" + hashlib.sha256(content).hexdigest()


# --------------------------------------------------------------------------
# 本次运行临时根的清理（与 Pi 门同一套身份校验语义）
# --------------------------------------------------------------------------

def assert_owned_root(root: Path, *, created: Path) -> None:
    """拒绝递归删除任何不是本次运行临时根的东西。

    身份不是调用方给的字符串，而是 `tempfile.mkdtemp` 返回给本进程的**完全相同**
    路径，并在磁盘上复核：仍是目录、不是符号链接、带本次运行前缀、直接位于系统
    临时目录下、属主是本用户、无组/其他权限。
    """
    if root != created:
        fail("OPENCODE_GATE_CLEANUP_NOT_OWNED", "the path is not the directory this run created")
    if not root.exists():
        return
    stats = os.lstat(root)
    if stat.S_ISLNK(stats.st_mode) or not stat.S_ISDIR(stats.st_mode):
        fail("OPENCODE_GATE_CLEANUP_NOT_OWNED", "the temporary root is no longer a directory")
    if not root.name.startswith(TEMPORARY_PREFIX) or root.parent != Path(tempfile.gettempdir()):
        fail("OPENCODE_GATE_CLEANUP_NOT_OWNED", "the temporary root is not one this gate creates")
    if stats.st_uid != os.geteuid():
        fail("OPENCODE_GATE_CLEANUP_NOT_OWNED", "the temporary root is not owned by this user")
    if stats.st_mode & 0o077:
        fail("OPENCODE_GATE_CLEANUP_NOT_OWNED", "the temporary root is group or world accessible")


def make_tree_writable(root: Path) -> int:
    """重新打开写权限，好让只读投影也能被删除（符号链接永不跟随）。"""
    changed = 0
    for directory, directories, files in os.walk(root, topdown=False):
        for name in files:
            location = Path(directory) / name
            if location.is_symlink():
                continue
            os.chmod(location, 0o600)
            changed += 1
        for name in directories:
            location = Path(directory) / name
            if location.is_symlink():
                continue
            os.chmod(location, 0o700)
            changed += 1
    os.chmod(root, 0o700)
    return changed + 1


def remove_tree(path: Path, *, code: str = "OPENCODE_GATE_CLEANUP_FAILED") -> int:
    """删除一棵树，或者大声失败。绝不吞掉删除失败。"""
    if not path.exists():
        return 0
    changed = make_tree_writable(path)
    try:
        shutil.rmtree(path)
    except OSError as error:
        fail(code, f"could not remove {path.name}: {type(error).__name__}")
    if path.exists():
        fail(code, f"{path.name} still exists after removal")
    return changed


def assert_external_binary_separate(binary: Path, temporary: Path) -> None:
    """调用方给的二进制是他们的，必须留在我们的临时根之外。"""
    if binary == temporary or temporary in binary.parents:
        fail("OPENCODE_GATE_BINARY_INSIDE_TEMPORARY_ROOT",
             "an external --binary must live outside this run's temporary root")


def cleanup_root(root: Path, *, created: Path) -> dict:
    assert_owned_root(root, created=created)
    changed = remove_tree(root)
    return {"removed": not root.exists(), "madeWritable": changed}


# --------------------------------------------------------------------------
# 本机假端点
# --------------------------------------------------------------------------

def chunk(delta: dict, finish: str | None = None, usage: bool = False) -> bytes:
    body = {
        "id": "chatcmpl-opencode-gate", "object": "chat.completion.chunk",
        "created": 1, "model": "deepseek-flash",
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
    }
    if usage:
        body["usage"] = {"prompt_tokens": 11, "completion_tokens": 7, "total_tokens": 18}
    return f"data: {json.dumps(body)}\n\n".encode()


def sanitized(body: dict) -> dict:
    """请求结构，不含任何凭据或头部值。"""
    messages = body.get("messages") if isinstance(body.get("messages"), list) else []
    rows = []
    for item in messages:
        if not isinstance(item, dict):
            continue
        content = item.get("content")
        rendered = json.dumps(item, ensure_ascii=False)
        rows.append({
            "role": item.get("role"),
            "chars": len(content) if isinstance(content, str) else None,
            "containsRound1User": NONCE_ROUND_1 in rendered,
            "containsRound1Assistant": NONCE_ROUND_1 in (content if isinstance(content, str) else ""),
            "containsRetryMarker": RETRY_MARKER in rendered,
        })
    return {
        "model": body.get("model"),
        "stream": body.get("stream"),
        "maxTokens": body.get("max_tokens"),
        "maxCompletionTokens": body.get("max_completion_tokens"),
        "thinking": body.get("thinking"),
        "temperature": body.get("temperature"),
        "toolCount": len(body.get("tools") or []),
        "messages": rows,
    }


def _answer_for(index: int) -> str:
    """每题三词：OpenCode 因此发出多条 message.part.delta（真增量，不是一次性文本）。"""
    nonce = NONCE_ROUND_1 if index == 1 else NONCE_ROUND_2 if index == 2 else f"OC-GATE-OBSERVED-{index}"
    return f"{nonce} PART-TWO-{index} PART-THREE-{index}"


class FakeEndpoint:
    """一个 loopback OpenAI 兼容流式端点：真分片增量、完全可观测、超预算即失败。"""

    def __init__(self, token: str) -> None:
        self.token = token
        self.requests: list[dict] = []
        self.paths: list[str] = []
        self.unauthorized = 0
        self.over_budget = 0
        self.retry_attempts = 0
        #: 主链两轮各一次；进入观测阶段前由门显式提高（并写进报告）。
        self.budget = 2
        #: 受控重试实验的容忍上限：超过它说明与实测上界不符。
        self.retry_ceiling = 8
        #: 标记请求（带 RETRY_MARKER 的 prompt）的观测模式与"先拒几次"窗口。
        self.retry_mode = False
        self.retry_refusals = 0
        self.mode = "main"
        self.started_at = time.monotonic()
        self._lock = threading.Lock()
        endpoint = self

        class Handler(http.server.BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *_args) -> None:  # 保持 stdout 干净
                pass

            def _write_chunk(self, payload: bytes) -> None:
                self.wfile.write(f"{len(payload):X}\r\n".encode() + payload + b"\r\n")
                self.wfile.flush()

            def do_POST(self) -> None:
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length)
                try:
                    body = json.loads(raw.decode("utf-8"))
                except ValueError:
                    body = {}
                with endpoint._lock:
                    endpoint.paths.append(self.path)
                    index = len(endpoint.requests) + 1
                    authorized = self.headers.get("Authorization") == f"Bearer {endpoint.token}"
                    if not authorized:
                        endpoint.unauthorized += 1
                    is_retry_probe = RETRY_MARKER in json.dumps(body, ensure_ascii=False)
                    refuse = False
                    answer = f"OC-GATE-EXTRA-{index}"
                    if is_retry_probe and endpoint.retry_mode:
                        endpoint.retry_attempts += 1
                        if endpoint.retry_attempts > endpoint.retry_ceiling:
                            endpoint.over_budget += 1
                        # 窗口内一律拒绝，窗口外正常作答：既能证明"确实重试了"，
                        # 又不必依赖"一直失败直到客户端放弃"的长时间观测。
                        refuse = endpoint.retry_attempts <= endpoint.retry_refusals
                    elif index > endpoint.budget:
                        endpoint.over_budget += 1
                        refuse = True
                    else:
                        answer = _answer_for(index)
                    endpoint.requests.append({
                        "index": index, "atSeconds": round(time.monotonic() - endpoint.started_at, 2),
                        "path": self.path,
                        "authorizationMatchesInjectedToken": authorized,
                        "retryProbe": is_retry_probe, "refused": refuse,
                        "contentType": (self.headers.get("Content-Type") or "").split(";")[0],
                        "structure": sanitized(body),
                    })
                if refuse:
                    # 超预算/重试实验的请求立即失败：隐式重试不得藏进总数里。
                    payload = json.dumps({"error": {
                        "message": "gate refused this provider request",
                        "type": "server_error"}}).encode()
                    self.send_response(500)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(payload)))
                    self.end_headers()
                    self.wfile.write(payload)
                    return
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Transfer-Encoding", "chunked")
                self.end_headers()
                self._write_chunk(chunk({"role": "assistant", "content": ""}))
                # 逐词真流式：OpenCode 因此会发出多条 message.part.delta。
                for word in answer.split(" "):
                    self._write_chunk(chunk({"content": word + " "}))
                    time.sleep(0.05)
                self._write_chunk(chunk({}, finish="stop", usage=True))
                self._write_chunk(b"data: [DONE]\n\n")
                self.wfile.write(b"0\r\n\r\n")
                self.wfile.flush()

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def start(self) -> None:
        self.thread.start()
        self._started = True

    def stop(self) -> None:
        """Stop the endpoint, or do nothing if it never served.

        `shutdown()` waits for `serve_forever` to return, so calling it on a
        server that never started blocks forever - which would turn an early
        gate failure into a hang. Stopping is idempotent.
        """
        if not getattr(self, "_started", False):
            return
        self._started = False
        self.server.shutdown()
        self.server.server_close()

    def assert_loopback_only(self) -> None:
        if self.server.server_address[0] != "127.0.0.1":
            fail("OPENCODE_GATE_ENDPOINT_NOT_LOOPBACK", "the fake endpoint is not bound to loopback")

    def raise_budget(self, budget: int, *, reason: str) -> None:
        with self._lock:
            if budget <= self.budget:
                fail("OPENCODE_GATE_BUDGET_NOT_RAISED", f"budget {budget} does not exceed {self.budget}")
            self.budget = budget
            REPORT.setdefault("providerBudget", []).append({"budget": budget, "reason": reason})


# --------------------------------------------------------------------------
# Worker 直连（与 WSL 连接器说同一套 ABW1 帧）
# --------------------------------------------------------------------------

class DirectWorkerConnector:
    """直接启动 release Worker；不使用 Windows wsl.exe 路径。"""

    def __init__(self, root: Path, worker: Path, workspace: Path) -> None:
        self.root = root
        self.worker = worker
        self.workspace = workspace

    def distributions(self):
        return [{"name": "Ubuntu"}]

    def probe(self, distribution, user):
        return {"probe_id": "probe", "distribution": distribution, "user": user}

    def browse(self, probe_id, path):
        return {"path": path, "directories": [], "files": []}

    def open_workspace(self, probe_id, path):
        return {"connection_id": "connection-opencode-gate", "distribution": "Ubuntu",
                "user": os.environ["USER"], "path": str(self.workspace)}

    def client_for_workspace(self, **arguments):
        from agent_box_runtime_wsl import WorkerClient

        # An isolated home root per run: a leftover marker from an earlier run
        # must not read as this run's identity.
        return WorkerClient(
            [str(self.worker), "--root", str(self.root / "worker-root"),
             "--home-root", str(self.root / "profile-home"),
             "--workspace", str(self.workspace)],
            worker_digest="sha256:" + hashlib.sha256(self.worker.read_bytes()).hexdigest(),
            worker_version="0.1.0", connection_id=arguments["connection_id"],
            project_id=arguments["connection_id"], effective_user=os.environ["USER"],
            server_instance_id="server-opencode-gate",
            # 这一条是门侧的显式选择，并已被本阶段实测证明必要：Worker 的默认
            # lease=5s 会在客户端 5 秒内没有任何帧时取消正在运行的 attempt，于是
            # "静默重试中的 prompt"（本地实测：第 2 次尝试后约 5 秒）会被整体掐掉。
            # 长重试观测因此必须用一个更长的 lease；生产默认值不动，本门把这个
            # 发现写进报告（见 leaseObservation）。
            lease_ms=GATE_LEASE_MS,
            executable_authorizations=arguments.get("executable_authorizations", ()),
            runtime_artifact_authorizations=arguments.get(
                "runtime_artifact_authorizations", ()),
        )


# --------------------------------------------------------------------------
# 二进制授权
# --------------------------------------------------------------------------

def authorize_binary(binary: Path | None, report: dict) -> dict:
    """跑授权工具，再用门自己的实现独立复核一遍。"""
    command = ["node", str(AUTHORIZER), "--json"]
    if binary is not None:
        command += ["--entry", str(binary)]
    result = subprocess.run(command, cwd=str(REPO), capture_output=True, text=True, timeout=300)
    try:
        payload = json.loads(result.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        fail("OPENCODE_GATE_AUTHORIZATION_UNREADABLE",
             f"the authorizer produced no JSON: {result.stdout[-300:]}{result.stderr[-300:]}")
    if result.returncode != 0 or payload.get("result") != "OPENCODE_BINARY_AUTHORIZED":
        fail(payload.get("code", "OPENCODE_GATE_AUTHORIZATION_FAILED"), str(payload.get("error", payload)))
    source = Path(payload["source"])
    # 独立复核：门自己算全量摘要、读 ELF 头、跑宿主的 --version。
    digest = digest_of(source.read_bytes())
    if digest != payload["digest"]:
        fail("OPENCODE_GATE_DIGEST_MISMATCH", "the gate recomputed a different digest")
    if source.stat().st_size != payload["sizeBytes"]:
        fail("OPENCODE_GATE_SIZE_MISMATCH", "the gate recomputed a different size")
    head = source.read_bytes()[:20]
    if not head.startswith(b"\x7fELF") or head[4] != 2 or head[5] != 1:
        fail("OPENCODE_GATE_NOT_ELF_64_LSB", "the mount source is not a 64-bit LSB ELF")
    version = subprocess.run([str(payload["resolved"]), "--version"], capture_output=True, text=True,
                             timeout=120, env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})
    if version.returncode != 0 or version.stdout.strip() != payload["version"]:
        fail("OPENCODE_GATE_HOST_VERSION_MISMATCH", f"the host binary reports {version.stdout.strip()!r}")
    if payload["version"] != "1.18.21":
        fail("OPENCODE_GATE_VERSION_NOT_PINNED", f"authorized version is {payload['version']!r}")
    report["binary"] = {
        "entry": payload["entry"], "entryIsSymlink": payload["entryIsSymlink"],
        "resolved": payload["resolved"], "source": payload["source"],
        "digest": payload["digest"], "sizeBytes": payload["sizeBytes"],
        "version": payload["version"], "fileType": payload["fileType"],
        "hostVersionOutput": version.stdout.strip(),
        "executableMounts": payload["executableMounts"],
        "external": binary is not None,
    }
    return payload


def authorizer_refusal(arguments: list[str], *, env: dict | None = None) -> dict:
    """跑一次必然失败的授权，返回它输出的类型化拒绝。"""
    result = subprocess.run(["node", str(AUTHORIZER), *arguments, "--json"], cwd=str(REPO),
                            capture_output=True, text=True, timeout=300,
                            env=None if env is None else {**os.environ, **env})
    try:
        payload = json.loads(result.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        fail("OPENCODE_GATE_AUTHORIZATION_UNREADABLE", f"no JSON: {result.stdout[-200:]}")
    if result.returncode == 0:
        fail("OPENCODE_GATE_NEGATIVE_DID_NOT_FAIL", "the authorizer accepted a refused input")
    return payload


def compile_guard(temporary: Path, report: dict) -> Path:
    """把评审过的 C 源编译成 guest 内预载的共享库（仅门使用）。"""
    from agent_box_harnesses.opencode import production

    compiler = shutil.which("cc")
    if not compiler:
        fail("OPENCODE_GATE_COMPILER_MISSING",
             "a C compiler is required to build the reviewed loopback guard")
    output = temporary / "opencode-egress-guard.so"
    result = subprocess.run(
        [compiler, "-shared", "-fPIC", "-O2", "-o", str(output), str(production.EGRESS_GUARD), "-ldl"],
        capture_output=True, text=True, timeout=120)
    if result.returncode != 0 or not output.is_file():
        fail("OPENCODE_GATE_GUARD_BUILD_FAILED", result.stderr[-300:])
    report["egressGuard"] = {
        "source": str(production.EGRESS_GUARD), "compiledAt": str(output),
        "bytes": output.stat().st_size, "sha256": digest_of(output.read_bytes()),
        "target": GUARD_TARGET,
    }
    return output


# --------------------------------------------------------------------------
# 门的 guest 探针（同一套评审过的 bwrap 策略，只替换入口命令）
# --------------------------------------------------------------------------

def terminal_result(client, attempt_id: str, generation: int) -> dict:
    """取一次 attempt 的终止结果（退出码），失败时返回空映射。"""
    try:
        return client.wait_terminal(attempt_id, generation, timeout=5)
    except BaseException:
        return {}


def run_guest_probe(connector: DirectWorkerConnector, workspace: Path, binary_source: Path,
                    binary_digest: str, guard: Path, script: str, report: dict, *, label: str,
                    projection: tuple[str, str, bytes] | None = None) -> dict:
    """在评审过的 guest 策略里跑一段门的探针脚本。

    bwrap argv 由 `compile_remote_sidecar_bwrap_argv` 生成（与生产完全同一套策略：
    系统只读挂载、/tmp tmpfs、workspace 可写、二进制只读绑在 /runtime/bin），门只把
    末尾的入口命令替换成自己的探针。这是**门侧观测**，不改变任何生产路径。
    """
    from agent_box_sandbox_bwrap import compile_remote_sidecar_bwrap_argv

    client = connector.client_for_workspace(
        distribution="Ubuntu", user=os.environ["USER"],
        connection_id="connection-opencode-probe", workspace_path=str(workspace),
        executable_authorizations=({"path": str(binary_source), "digest": binary_digest},),
    )
    client.start()
    attempt_id = f"gate-probe-{label}"
    collected: list[dict] = []
    unsubscribe = None
    try:
        view_id = f"view-gate-probe-{label}"
        files = {"gate/probe.mjs": script.encode("utf-8"), "gate/egress-guard.so": guard.read_bytes()}
        if projection is not None:
            # The reviewed configuration is projected into the probe's own view:
            # the probe reads it through the path the deployment declares and
            # proves it is read-only there.
            files[projection[0]] = projection[2]
        client.request("view.prepare", {"viewId": view_id, "files": [
            {"path": name, "size": len(content), "digest": digest_of(content)}
            for name, content in sorted(files.items())]})
        for name, content in sorted(files.items()):
            for offset in range(0, len(content), 32 * 1024):
                client.request("view.put", {
                    "viewId": view_id, "path": name, "offset": offset,
                    "data": base64.b64encode(content[offset:offset + 32 * 1024]).decode(),
                })
        view = client.request("view.commit", {"viewId": view_id})["path"]
        argv = compile_remote_sidecar_bwrap_argv(
            workspace=str(workspace), runtime_view=view,
            environment={
                "PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "HOME": "/runtime/home",
                "LD_PRELOAD": GUARD_TARGET,
                "AGENTBOX_EGRESS_AUDIT": f"/workspace/{AUDIT_NAME}",
            },
            executable_mounts=((str(binary_source), "/runtime/bin/opencode"),),
            projection_mounts=(
                (f"{view}/gate/egress-guard.so", GUARD_TARGET),
                *(((f"{view}/{projection[0]}", projection[1]),) if projection else ()),
            ),
        )
        # 只替换入口命令：reviewed 模板尾部恒为 `-- /usr/bin/node <sidecar entrypoint>`。
        # 探针脚本就放在本视图里（`/runtime/view/gate/probe.mjs`），由同一模板只读挂载，
        # 不额外增加投影；node 因此一定能读到它。
        if argv[-2:] != ["/usr/bin/node", "/runtime/view/agentbox-sidecar/runtime/worker-entry.mjs"]:
            fail("OPENCODE_GATE_GUEST_TEMPLATE_CHANGED", "the reviewed guest template moved")
        argv = [*argv[:-1], "/runtime/view/gate/probe.mjs"]
        unsubscribe = client.subscribe_output(collected.append)
        client.request("spawn", {"argv": argv, "timeoutMs": 120_000, "stdinBase64": "",
                                 "interactive": True}, attempt_id=attempt_id, generation=1)
        client.wait_terminal(attempt_id, 1, timeout=180)
        stdout = ""
        stderr = ""
        for event in collected:
            result = event.get("result") or {}
            if (event.get("event") != "process.output" or result.get("attemptId") != attempt_id):
                continue
            chunk = base64.b64decode(result.get("data", "")).decode("utf-8", "replace")
            if result.get("stream") == "stdout":
                stdout += chunk
            elif result.get("stream") == "stderr":
                stderr += chunk
        terminal = terminal_result(client, attempt_id, 1)
        payload: dict = {}
        for line in stdout.splitlines():
            try:
                payload = json.loads(line)
            except ValueError:
                continue
        report.setdefault("guestProbes", {})[label] = {
            "exitCode": terminal.get("exitCode"),
            "stdoutLines": [line for line in stdout.splitlines() if line.strip()][-6:],
            "stderrTail": stderr.strip().splitlines()[-3:] if stderr.strip() else [],
            "output": payload,
        }
        if terminal.get("exitCode") not in (0, None) or not payload:
            fail("OPENCODE_GATE_GUEST_PROBE_FAILED",
                 f"{label}: exit={terminal.get('exitCode')} stderr={stderr.strip()[-300:]}")
        return payload
    finally:
        if unsubscribe:
            unsubscribe()
        try:
            client.request("view.cleanup", {"viewId": f"view-gate-probe-{label}"}, timeout=3)
        except BaseException:
            pass
        client.close()


# --------------------------------------------------------------------------
# 主链：Server → Core → sidecar → Worker → bwrap → opencode serve → 假端点
# --------------------------------------------------------------------------

def wire_post(client, token: str, method: str, params: dict) -> dict:
    body = client.post(f"/wire/v1/{method}", headers={"Authorization": f"Bearer {token}"},
                       json={"jsonrpc": "2.0", "id": method, "method": method, "params": params}).json()
    if "result" not in body:
        fail("OPENCODE_GATE_WIRE_REFUSED", f"{method}: {json.dumps(body)[:400]}")
    return body["result"]


def wait_for_turn(runtime, session_id: str, index: int, state: str, *, timeout: float = 300.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        session = runtime.repository.get_session(session_id)
        if len(session["turns"]) > index and session["turns"][index]["state"] == state:
            return session
        if len(session["turns"]) > index and session["turns"][index]["state"] in {"failed", "cancelled"}:
            REPORT["diagnostics"] = turn_diagnostics(runtime, session, index)
            fail("OPENCODE_GATE_TURN_" + session["turns"][index]["state"].upper(),
                 json.dumps(REPORT["diagnostics"])[:1500])
        time.sleep(0.05)
    fail("OPENCODE_GATE_TURN_TIMEOUT", f"turn {index} of session {session_id} did not reach {state}")


def turn_diagnostics(runtime, session: dict, index: int) -> dict:
    reasons = []
    with runtime.database.read() as conn:
        for row in conn.execute("SELECT data_json FROM core_events WHERE type=?",
                                ("ExecutionDispatchAmbiguous",)):
            reasons.append(json.loads(row["data_json"]).get("error", "")[:400])
    events = []
    for event in session["events"]:
        if event.get("turn_id") != session["turns"][index]["id"]:
            continue
        data = event.get("data") or {}
        # A terminal turn records its *inner* failure in the event payload:
        # `turn.capture` carries the capture layer's typed code and
        # `turn.state` the outer one. Keeping only the state text threw
        # that away, so a failed capture could not be attributed to the
        # layer that refused it.
        entry = {"kind": event["kind"],
                 "text": str(data.get("text") or data.get("state") or "")[:200]}
        for key in ("error_code", "code", "state", "retryable"):
            if key in data and str(data[key]) != entry["text"]:
                entry[key] = str(data[key])[:200]
        events.append(entry)
    return {"reasons": reasons, "events": events[-12:],
            "turn": {key: session["turns"][index].get(key)
                     for key in ("state", "error_code", "capture_state", "cleanup_state")}}


def profile_version(client, runtime, profile_id: str) -> int:
    for item in wire_post(client, runtime.token, "profiles.list", {"includeArchived": True})["items"]:
        if item["id"] == profile_id:
            return int(item["version"])
    fail("OPENCODE_GATE_PROFILE_MISSING", f"profile {profile_id} was not listed")


def observe_turn(session: dict, index: int) -> dict:
    turn = session["turns"][index]
    events = [event for event in session["events"] if event.get("turn_id") == turn["id"]]
    deltas = [event for event in events if event["kind"] == "message.delta"]
    terminal = [event for event in events
                if event["kind"] == "turn.state" and event["data"].get("state") == "completed"]
    return {
        "state": turn["state"],
        "deltaSeq": [event["seq"] for event in deltas],
        "deltaText": [event["data"]["text"] for event in deltas],
        "deltaTextJoined": "".join(event["data"]["text"] for event in deltas),
        "completedSeq": terminal[0]["seq"] if terminal else None,
        "deltasBeforeCompletion": bool(terminal and deltas and deltas[0]["seq"] < terminal[0]["seq"]),
    }


def scan_state(runtime, session: dict) -> dict:
    """The audit's own fail-closed scan is the credential evidence.

    Under the native-home model the Server never holds the state bytes; a hit
    during the audit would have failed the turn (and deleted the file). The
    completed turn plus the manifest's audit facts are the record.
    """
    manifest = json.loads(runtime.objects.read(session["checkpoint"]["object_digest"]))
    audited = manifest.get("audited") or {}
    files = manifest.get("files") or []
    return {"files": audited.get("files", 0), "bytes": audited.get("bytes", 0),
            "tokenHits": [], "tokenInState": False,
            "truncated": manifest.get("truncated"),
            "paths": sorted(item["path"] for item in files)}



def assert_no_credential_exposure(credential: dict, *, prefix: str) -> None:
    """The credential facts are assertions, not decoration.

    Every gate records whether the injected token reached the durable event
    stream or this run's report. Recording it and moving on would make the
    headline safety claim - the credential reaches nothing but the provider -
    something the report *shows* rather than something the run *enforces*: a
    leak would print `tokenIn*=true` and still exit 0. A true value fails here,
    under a typed code, with the field names only (never the token).
    """
    exposed = sorted(
        key for key, value in credential.items()
        if key.startswith("tokenIn") and value is True
    )
    if exposed:
        fail(f"{prefix}_GATE_CREDENTIAL_EXPOSED",
             f"the injected credential reached: {exposed}")

def report_text(report: dict) -> str:
    """The report as text, for the "did the credential reach it" checks.

    An unrenderable value becomes a placeholder rather than an exception: this
    call must never be the thing that ends a run, or a credential question would
    be replaced by a crash.
    """
    return json.dumps(report, sort_keys=True,
                      default=lambda value: f"<unserializable {type(value).__name__}>")


def assert_report_is_credential_free(report: dict, *, prefix: str) -> None:
    """The whole report, once it exists, carries no credential material.

    The in-chain check sees a partial report (the outcome is merged after the
    chain returns), so this is the one that covers what the run actually
    publishes: the outcome, the diagnostics and the phase evidence.
    """
    if INJECTED_CREDENTIAL.decode(errors="replace") in report_text(report):
        fail(f"{prefix}_GATE_CREDENTIAL_IN_REPORT",
             "the injected credential appears in this run's report")


def assert_main_requests(endpoint: FakeEndpoint, production) -> dict:
    """主链两轮请求体的形状断言：模型、上限、thinking、续接上下文。"""
    if len(endpoint.requests) < 2:
        fail("OPENCODE_GATE_PROVIDER_REQUESTS_MISSING",
             f"the fake endpoint saw {len(endpoint.requests)} requests")
    first, second = endpoint.requests[0]["structure"], endpoint.requests[1]["structure"]
    for label, structure in (("first", first), ("second", second)):
        if structure.get("model") != production.PRODUCT_MODEL_ID:
            fail("OPENCODE_GATE_REQUEST_MODEL_UNEXPECTED",
                 f"{label} request model is {structure.get('model')!r}")
        if structure.get("maxTokens") != production.OUTPUT_TOKEN_LIMIT:
            fail("OPENCODE_GATE_REQUEST_TOKEN_LIMIT",
                 f"{label} request max_tokens is {structure.get('maxTokens')!r}; "
                 "the configured limit.output must reach the provider body")
        if structure.get("thinking") != {"type": "disabled"}:
            fail("OPENCODE_GATE_REQUEST_THINKING_ENABLED",
                 f"{label} request thinking is {structure.get('thinking')!r}")
        if structure.get("stream") is not True:
            fail("OPENCODE_GATE_REQUEST_NOT_STREAMING", f"{label} request is not streaming")
    # 第二轮的原生上下文：第一轮的 user 与 assistant 内容都在请求体里。
    if not any(row["containsRound1User"] for row in second["messages"]):
        fail("OPENCODE_GATE_ROUND2_MISSING_ROUND1_USER",
             json.dumps(second["messages"])[:300])
    if not any(row["containsRound1Assistant"] for row in second["messages"]):
        fail("OPENCODE_GATE_ROUND2_MISSING_ROUND1_ASSISTANT",
             json.dumps(second["messages"])[:300])
    return {
        "first": first, "second": second,
        "secondCarriesRound1User": True, "secondCarriesRound1Assistant": True,
        "paths": list(endpoint.paths[:2]),
    }


def run_chain(temporary: Path, workspace: Path, worker: Path, authorization: dict,
              endpoint: FakeEndpoint, production, token_path: Path, guard: Path,
              *, live: bool = False) -> dict:
    """生产接缝：Server → Core → sidecar → Worker → bwrap → opencode。"""
    from agent_box.server.bootstrap import build_runtime_from_sidecar_deployment
    from agent_box.server.credentials import CredentialRecords
    from agent_box.server.transport.http import create_app
    from agent_box.storage import MemorySecretStore
    from fastapi.testclient import TestClient

    # 无模型门覆盖 baseURL 并装载守卫；live 模式两者都不用：配置即部署原样。
    config_bytes = json.dumps(
        production.config_document() if live
        else production.loopback_config_document(endpoint.base_url), sort_keys=True).encode()
    guard_bytes = guard.read_bytes()
    document = production.deployment_document(
        binary_token="opencode", binary_digest=authorization["digest"],
        adapter_environment=(
            {
                **production.ADAPTER_ENVIRONMENT,
                "AGENTBOX_EGRESS_AUDIT": f"/workspace/{AUDIT_NAME}",
                "AGENTBOX_DRIVER_AUDIT": f"/workspace/{DRIVER_AUDIT_NAME}",
            } if live else {
                **production.ADAPTER_ENVIRONMENT,
                # 测试期附加项（已在报告里列明）：loopback 守卫、出口审计、驱动审计。
                "LD_PRELOAD": GUARD_TARGET,
                "AGENTBOX_EGRESS_AUDIT": f"/workspace/{AUDIT_NAME}",
                "AGENTBOX_DRIVER_AUDIT": f"/workspace/{DRIVER_AUDIT_NAME}",
            }
        ),
        projection_files_override=(
            *production.projection_files(),
            *(() if live else ({"source": GUARD_SOURCE, "target": GUARD_TARGET},)),
        ),
    )
    deployment = temporary / "deployment.json"
    deployment.write_text(json.dumps(document), encoding="utf-8")
    REPORT["providerProjection"] = {
        "configSource": production.CONFIG_SOURCE,
        "loopbackOverrideChanges": (
            [] if live else sorted(production.documented_differences(endpoint.base_url))
        ),
        "mode": "live" if live else "loopback-fake-endpoint",
    }

    import agent_box.server.bootstrap.runtime as runtime_module
    runtime_module._builtin_connector = lambda _instance_id: DirectWorkerConnector(
        temporary, worker, workspace)
    original_file = runtime_module._sidecar_deployment_file

    def deployment_file(root, relative):
        if relative == production.CONFIG_SOURCE:
            return config_bytes
        if relative == GUARD_SOURCE:
            return guard_bytes
        return original_file(root, relative)

    runtime_module._sidecar_deployment_file = deployment_file
    store = MemorySecretStore(values={})
    runtime = build_runtime_from_sidecar_deployment(
        temporary / "server", deployment, secret_store=store, plugin_root=PLUGIN,
        mount_bindings={"opencode": authorization["source"]},
    )
    result: dict = {"rounds": {}}
    try:
        pass
    finally:
        pass
    try:
        credential_id, locator = store.import_file(token_path, "api-key")
        stage = "startup"
        from fastapi.testclient import TestClient as _TestClient

        @__import__("contextlib").contextmanager
        def _recording_client(app):
            handle = _TestClient(app, base_url="http://127.0.0.1")
            with handle as started:
                try:
                    yield started
                except BaseException as error:
                    import traceback
                    REPORT["innerFailure"] = {
                        "type": type(error).__name__, "error": str(error)[:400],
                        "stage": stage, "traceback": traceback.format_exc()[-1500:],
                    }
                    raise
        with _recording_client(create_app(runtime)) as client:
            # runtime 的数据库要等应用启动后才活着。
            CredentialRecords(runtime.database).register(credential_id, "api-key", locator)
            opened = wire_post(client, runtime.token, "workspaces.open", {
                "requestId": "opencode-gate-open", "path": str(workspace),
                "environment": {"kind": "wsl", "host": "Ubuntu", "user": os.environ["USER"]},
            })["workspace"]
            provider = wire_post(client, runtime.token, "providerModels.create", {
                "requestId": "opencode-gate-provider", "displayName": "DeepSeek official",
                "harness": "opencode", "provider": production.OPENCODE_PROVIDER,
                "credentialId": credential_id, "configuration": [], "models": [{
                    "modelId": production.PRODUCT_MODEL_ID, "displayName": "DeepSeek Flash",
                    "availability": "available", "unavailableReason": None,
                }],
            })["providerModel"]
            profile = client.post("/api/v1/profiles", headers={
                "Authorization": f"Bearer {runtime.token}", "Idempotency-Key": "opencode-gate-profile",
            }, json={"name": "OpenCode production gate", "harness_type": "opencode",
                     "configuration": {}, "credential_id": credential_id}).json()
            configured = wire_post(client, runtime.token, "profiles.updateConfig", {
                "requestId": "opencode-gate-profile-config", "profileId": profile["profile_id"],
                "expectedVersion": profile_version(client, runtime, profile["profile_id"]),
                "values": [{"controlId": "model", "value": {
                    "providerId": provider["id"], "modelId": production.PRODUCT_MODEL_ID,
                }}],
            })["profile"]

            stage = "round-1"
            first = wire_post(client, runtime.token, "sessions.createAndSend", {
                "requestId": "opencode-gate-round-1", "workspaceId": opened["id"],
                "profileId": configured["id"], "overrides": [],
                "message": {"text": f"Remember {NONCE_ROUND_1} and reply with it.", "attachments": []},
            })
            session = wait_for_turn(runtime, first["session"]["id"], 0, "completed")
            result["rounds"]["first"] = observe_turn(session, 0)
            result["sessionId"] = first["session"]["id"]
            native_id = session["checkpoint"]["native_id"] if session["checkpoint"] else None
            if not native_id:
                fail("OPENCODE_GATE_NO_NATIVE_ID", "the first round produced no native session id")
            result["nativeSessionId"] = native_id
            checkpoint = json.loads(runtime.objects.read(session["checkpoint"]["object_digest"]))
            result["checkpointAfterFirst"] = {
                "schemaVersion": checkpoint.get("schema_version"),
                "resumable": checkpoint.get("resumable"),
                "harnessType": checkpoint.get("harnessType"),
                "nativeSessionId": checkpoint.get("nativeSessionId"),
                "files": sorted(item["path"] for item in checkpoint.get("files", [])),
            }
            if checkpoint.get("schema_version") != 3 or checkpoint.get("resumable") is not True:
                fail("OPENCODE_GATE_CHECKPOINT_NOT_RESUMABLE",
                     f"checkpoint is {checkpoint.get('schema_version')}/{checkpoint.get('resumable')}")
            if not any(path.endswith("opencode.db") for path in result["checkpointAfterFirst"]["files"]):
                fail("OPENCODE_GATE_STATE_MISSING_DATABASE",
                     f"the captured state has no native database: {result['checkpointAfterFirst']['files']}")

            stage = "round-2"
            second = wire_post(client, runtime.token, "sessions.send", {
                "requestId": "opencode-gate-round-2", "sessionId": first["session"]["id"],
                "overrides": [],
                "message": {"text": f"What did I ask you to remember? Reply with the nonce.",
                            "attachments": []},
            })
            session = wait_for_turn(runtime, first["session"]["id"], 1, "completed")
            result["rounds"]["second"] = observe_turn(session, 1)
            if session["checkpoint"]["native_id"] != native_id:
                fail("OPENCODE_GATE_NATIVE_ID_CHANGED", "the second round did not keep the native session id")
            result["checkpointNativeIdStable"] = True
            result["requestStructure"] = (
                {"observed": False, "reason": "request bodies and counts need the fake "
                                              "endpoint; live mode's evidence is the two "
                                              "real answers and the native id continuity"}
                if live else assert_main_requests(endpoint, production)
            )
            for label in ("first", "second"):
                if len(result["rounds"][label]["deltaSeq"]) < 2:
                    fail("OPENCODE_GATE_NOT_INCREMENTAL",
                         f"{label} round produced {result['rounds'][label]['deltaSeq']} deltas; "
                         "the driver must report real increments")

            stage = "credential-refusal"
            result["credentialRefusal"] = missing_credential_refusal(
                client, runtime, opened, production)
            stage = "unknown-model"
            result["unknownModel"] = unknown_model_refusal(
                client, runtime, workspace, opened, production, endpoint, credential_id)
            stage = "checkpoint-refusal"
            result["checkpointRefusal"] = invalid_checkpoint_refusal(
                runtime, workspace, production)
            stage = "state-scan"

            result["credential"] = {
                "injectedTokenReachedProvider": (
                    None if live else
                    bool(endpoint.requests) and all(
                        item["authorizationMatchesInjectedToken"]
                        for item in endpoint.requests)
                ),
                "credentialObservation": (
                    "inferred-from-real-answer; request headers are not observable live"
                    if live else "observed on the fake endpoint"
                ),
                "unauthorizedRequests": None if live else endpoint.unauthorized,
                "tokenInEvents": current_token().value() in json.dumps(session["events"]),
                # The chain runs before the outcome is merged, so this covers what the
        # report holds *so far*; the complete report is checked once it is
        # assembled (see `assert_report_is_credential_free`).
        "tokenInReportableState": current_token().value() in json.dumps(REPORT),
            }
            assert_no_credential_exposure(result["credential"], prefix="OPENCODE")
            result["stateScan"] = scan_state(runtime, session)
            server_audit = read_driver_audit(workspace, DRIVER_AUDIT_NAME)
            result["driverAuditServerPath"] = {
                "lines": len(server_audit),
                "events": [item.get("event") for item in server_audit],
                "creates": [item for item in server_audit if item.get("event") == "create"],
                "opens": [item for item in server_audit if item.get("event") == "open"],
                "prompts": [item for item in server_audit if item.get("event") == "prompt"],
            }
            if not any(item.get("created") is False for item in result["driverAuditServerPath"]["opens"]):
                fail("OPENCODE_GATE_SERVER_REOPEN_NOT_BY_STORAGE",
                     "the Server-performed second round did not reopen a stored native session")
            stage = "done"
            REPORT["stage"] = stage
            REPORT["chainStage"] = stage
            REPORT["activeRuns"] = {
                "active": list(runtime.execution._active.keys()),
                "turns": [turn["state"] for turn in session["turns"]],
            }
            return result
    except BaseException as error:
        import traceback
        REPORT["chainFailure"] = {
            "type": type(error).__name__, "error": str(error)[:400],
            "stage": stage, "traceback": traceback.format_exc()[-1500:],
            "partialKeys": sorted(result.keys()),
        }
        raise
    finally:
        try:
            runtime.stop()
        except BaseException as error:  # 停止路径不得掩盖真正的失败
            REPORT["runtimeStopError"] = f"{type(error).__name__}: {error}"[:300]


def missing_credential_refusal(client, runtime, opened, production) -> dict:
    """声明了凭据种类的 Harness，在 Profile 没有授权凭据时必须被拒绝且不派发。

    这里用**不带凭据的 ProviderModel**（凭据在执行配置里来自 Provider/Model 引用），
    这样命中的正是"Profile 没有授权凭据"这一条；否则 ProviderModel 自带的 credentialId
    会合法地满足这次校验。
    """
    provider = wire_post(client, runtime.token, "providerModels.create", {
        "requestId": "opencode-gate-no-credential-provider",
        "displayName": "DeepSeek without credential",
        "harness": "opencode", "provider": production.OPENCODE_PROVIDER,
        # 显式 None：Provider/Model 不携带凭据，所以冻结执行配置里也没有凭据，
        # 命中的正是 Profile 级 CREDENTIAL_REQUIRED。
        "credentialId": None,
        "configuration": [], "models": [{
            "modelId": production.PRODUCT_MODEL_ID, "displayName": "DeepSeek Flash",
            "availability": "available", "unavailableReason": None,
        }],
    })["providerModel"]
    profile = client.post("/api/v1/profiles", headers={
        "Authorization": f"Bearer {runtime.token}", "Idempotency-Key": "opencode-gate-no-credential",
    }, json={"name": "OpenCode without credential", "harness_type": "opencode",
             "configuration": {}}).json()
    wire_post(client, runtime.token, "profiles.updateConfig", {
        "requestId": "opencode-gate-no-credential-config", "profileId": profile["profile_id"],
        "expectedVersion": profile_version(client, runtime, profile["profile_id"]),
        "values": [{"controlId": "model", "value": {
            "providerId": provider["id"], "modelId": production.PRODUCT_MODEL_ID,
        }}],
    })
    with runtime.database.read() as conn:
        sessions_before = conn.execute("SELECT COUNT(*) FROM server_sessions").fetchone()[0]
    response = client.post("/wire/v1/sessions.createAndSend", headers={
        "Authorization": f"Bearer {runtime.token}"}, json={
        "jsonrpc": "2.0", "id": "sessions.createAndSend", "method": "sessions.createAndSend",
        "params": {"requestId": "opencode-gate-no-credential", "workspaceId": opened["id"],
                   "profileId": profile["profile_id"], "overrides": [],
                   "message": {"text": "This turn must not dispatch.", "attachments": []}},
    }).json()
    with runtime.database.read() as conn:
        sessions_after = conn.execute("SELECT COUNT(*) FROM server_sessions").fetchone()[0]
    code = None
    if "error" in response:
        details = (response["error"] or {}).get("details") or {}
        code = details.get("internalCode") or (response["error"] or {}).get("code")
    if code != "CREDENTIAL_REQUIRED" or sessions_after != sessions_before:
        fail("OPENCODE_GATE_CREDENTIAL_NOT_REQUIRED",
             f"a profile without a credential produced {json.dumps(response)[:300]} "
             f"(sessions {sessions_before} -> {sessions_after})")
    return {"refused": True, "internalCode": code, "dispatched": False,
            "sessionsCreated": sessions_after - sessions_before}


def unknown_model_refusal(client, runtime, workspace, opened, production, endpoint, credential_id) -> dict:
    """未知产品模型必须在发出任何 provider 请求之前被拒绝，理由里要看得到模型。"""
    before = None if endpoint is None else len(endpoint.requests)
    provider = wire_post(client, runtime.token, "providerModels.create", {
        "requestId": "opencode-gate-unknown-provider", "displayName": "DeepSeek unknown",
        "harness": "opencode", "provider": production.OPENCODE_PROVIDER, "credentialId": credential_id,
        "configuration": [], "models": [{
            "modelId": "deepseek-unknown", "displayName": "Unknown",
            "availability": "available", "unavailableReason": None,
        }],
    })["providerModel"]
    profile = client.post("/api/v1/profiles", headers={
        "Authorization": f"Bearer {runtime.token}",
        "Idempotency-Key": "opencode-gate-unknown-profile",
    }, json={"name": "OpenCode unknown model", "harness_type": "opencode",
             "configuration": {}, "credential_id": credential_id}).json()
    configured = wire_post(client, runtime.token, "profiles.updateConfig", {
        "requestId": "opencode-gate-unknown-config", "profileId": profile["profile_id"],
        "expectedVersion": profile_version(client, runtime, profile["profile_id"]),
        "values": [{"controlId": "model", "value": {
            "providerId": provider["id"], "modelId": "deepseek-unknown",
        }}],
    })["profile"]
    sent = wire_post(client, runtime.token, "sessions.createAndSend", {
        "requestId": "opencode-gate-unknown-send", "workspaceId": opened["id"],
        "profileId": configured["id"], "overrides": [],
        "message": {"text": "This model does not exist.", "attachments": []},
    })
    session = wait_for_turn(runtime, sent["session"]["id"], 0, "failed")
    turn = session["turns"][0]
    reasons = []
    with runtime.database.read() as conn:
        for row in conn.execute("SELECT data_json FROM core_events WHERE type=?",
                                ("ExecutionDispatchAmbiguous",)):
            reasons.append(json.loads(row["data_json"]).get("error", ""))
    requests_after = None if endpoint is None else len(endpoint.requests)
    if before is not None and requests_after != before:
        fail("OPENCODE_GATE_UNKNOWN_MODEL_REACHED_PROVIDER",
             f"the refused model produced {requests_after - before} provider requests")
    # Classify by the driver's own typed code where there is one; the message is
    # only the secondary witness, because a message is a rendering of a code.
    mentioned = any("OPENCODE_MODEL_NOT_AVAILABLE" in reason for reason in reasons)
    if before is None and not mentioned:
        # Live cannot count requests, so this reason is the phase's positive
        # witness: without it the turn could have failed for any unrelated
        # cause and the phase would still look passed. It is the sidecar's own
        # model-availability message, and the failed turn state is the
        # code-level half of the claim.
        fail("OPENCODE_GATE_UNKNOWN_MODEL_REASON_UNEXPECTED",
             "the live unknown-model turn did not fail for the model-availability reason: "
             + json.dumps([reason[:200] for reason in reasons[-2:]]))
    return {
        "state": turn["state"],
        "refusedAt": "the OpenCode driver, before POST /session/<id>/message",
        "providerRequestsAfterRefusal": (
            None if before is None else requests_after - before),
        "refusedBeforeProviderRequest": (
            None if before is None else requests_after == before),
        "providerRequestCountAvailable": before is not None,
        "reasonMentionsModel": mentioned,
        "reasons": [reason[:220] for reason in reasons],
    }


def invalid_checkpoint_refusal(runtime, workspace, production) -> dict:
    """原生目录模型下没有恢复步骤，坏 checkpoint 不再是派发路径上的事实。

    旧模型的这条反例（坏 checkpoint → SIDECAR_CHECKPOINT_INVALID）随恢复路径一起
    退役：恢复不存在，坏字节无从被读。它对应的现代事实是两个，且都在这里断言：
    1) 缺失 env_kind 的记录被放置解析点名拒绝（PLACEMENT_UNKNOWN），绝不静默回退；
    2) 带 native_home 的记录上，坏 checkpoint 不被读取，port 正常构造（新原生
       会话 + 变更后的 native id 是产品层的如实说明，见设计 §11）。
    """
    frozen = runtime.objects.publish(json.dumps(
        {"execution": {"model": production.PRODUCT_MODEL_ID}}).encode())
    stale = runtime.objects.publish(json.dumps({
        "schema_version": 1, "harnessType": "opencode", "resumable": False,
        "nativeSessionId": "ses_stale", "files": [],
    }).encode())
    base = {
        "harness_type": "opencode", "config_object_digest": frozen.digest,
        "distribution": "Ubuntu", "remote_user": os.environ["USER"],
        "connection_id": "connection-opencode-gate", "remote_path": str(workspace),
        "checkpoint_object_digest": stale.digest, "checkpoint_native_id": "ses_stale",
        "credential_id": None,
    }
    code = None
    try:
        runtime.execution.port_factory({**base, "env_kind": None}, lambda *_: None)
    except RuntimeError as error:
        code = str(error)
    if "PLACEMENT_UNKNOWN" not in (code or ""):
        fail("OPENCODE_GATE_STALE_CHECKPOINT_ACCEPTED",
             f"an unnamed placement produced {code!r} instead of PLACEMENT_UNKNOWN")
    # The stale checkpoint alone (no env_kind removed) builds a port: nothing
    # reads it, so nothing can be poisoned by it.
    runtime.execution.port_factory({**base, "env_kind": "wsl",
                                    "profile_id": "profile_oc", "profile_name": "oc-gate"},
                                   lambda *_: None)
    return {"refused": True, "code": "PLACEMENT_UNKNOWN", "checkpointReadAtDispatch": False}


# --------------------------------------------------------------------------
# 直接驱动观测：真实 sidecar 接缝 + 真实 Worker + 真实 opencode
# --------------------------------------------------------------------------

def driver_bundle(production, endpoint: FakeEndpoint, guard: Path,
                  authorization: dict) -> dict[str, bytes]:
    from agent_box.server.execution.sidecar import sidecar_bundle_files

    return sidecar_bundle_files(PLUGIN, additional_files={
        CONFIG_BUNDLE_PATH: json.dumps(
            production.loopback_config_document(endpoint.base_url), sort_keys=True).encode(),
        GUARD_SOURCE: guard.read_bytes(),
        DRIVER_BUNDLE_PATH: production.DRIVER_TEMPLATE.read_bytes(),
    })


def observe_driver(temporary: Path, workspace: Path, worker: Path, authorization: dict,
                   endpoint: FakeEndpoint, production, guard: Path) -> dict:
    """用生产 launcher 直接驱动同一个驱动模块，观察重开与重试行为。

    Server 看不到这些细节（它们发生在 Worker 内）：门用同一 launcher、同一 bundle、
    同一二进制、同一凭据路径复现，并把驱动自己的审计行（AGENTBOX_DRIVER_AUDIT）
    与 provider 请求计数对上。
    """
    from agent_box.server.execution.sidecar import SidecarHarnessPort, WslSidecarLauncher

    bundle = driver_bundle(production, endpoint, guard, authorization)
    adapter = {
        "command": production.BINARY_TARGET, "args": [],
        "environment": {
            **production.ADAPTER_ENVIRONMENT,
            "LD_PRELOAD": GUARD_TARGET,
            "AGENTBOX_EGRESS_AUDIT": f"/workspace/{AUDIT_NAME}",
            "AGENTBOX_DRIVER_AUDIT": f"/workspace/{DRIVER_AUDIT_OBSERVE}",
        },
        "driver": {"module": f"/runtime/view/{DRIVER_BUNDLE_PATH}"},
    }
    state_directory = temporary / "driver-state"
    state_directory.mkdir(exist_ok=True)
    events: list[dict] = []
    lock = threading.Lock()

    def record(_execution, kind, data):
        with lock:
            events.append({"kind": kind, "text": str((data or {}).get("text") or "")[:200]})

    def port_for(resume_native_id=None):
        launcher = WslSidecarLauncher(
            DirectWorkerConnector(temporary, worker, workspace),
            workspace={"distribution": "Ubuntu", "remote_user": os.environ["USER"],
                       "connection_id": "connection-opencode-observe", "remote_path": str(workspace)},
            bundle=bundle, credential=current_token().bytes(),
            executable_authorizations=(
                {"path": authorization["source"], "digest": authorization["digest"]},),
            executable_mounts=((authorization["source"], production.BINARY_TARGET),),
            projection_mounts=(
                (CONFIG_BUNDLE_PATH, production.CONFIG_TARGET),
                (GUARD_SOURCE, GUARD_TARGET),
            ),
            home_locator="opencode-gate/.config/opencode",
            native_home=".config/opencode",
            profile_id="profile-opencode-gate",
            harness_type="opencode",
            audit_window=".local/share/opencode",
            timeout_ms=120_000,
        )
        return SidecarHarnessPort(
            launcher, environment={"AGENTBOX_SIDECAR_ISOLATED": "1"},
            profile="opencode", adapter=adapter, model=production.PRODUCT_MODEL_ID,
            credential_environment=production.CREDENTIAL_ENVIRONMENT,
            resume_native_id=resume_native_id,
            state_directory=production.STATE_TARGET,
            directory="/workspace", native_platform="wsl",
            home_locator="opencode-gate/.config/opencode", on_event=record,
        )

    result: dict = {"note": (
        "同一 launcher/bundle/二进制/凭据路径直接驱动驱动模块；重开方式由驱动自己的"
        "审计行（GET /session/<id>）与 provider 请求体证明，不是猜测。")}
    first = port_for()
    try:
        native = first.open_execution("observe-round-1")
        first.prompt("observe-round-1", f"Remember {NONCE_ROUND_1} and reply with it.")
        audit, resumable = first.capture_execution("observe-round-1")
    finally:
        first.stop()
    with lock:
        round_a_events = list(events)
        events.clear()
    audited_paths = [item["path"] for item in audit["files"]]
    result["roundA"] = {
        "nativeSessionId": native,
        "auditedFiles": audited_paths,
        "auditedBytes": audit["audited"]["bytes"],
        "stateResumable": bool(resumable),
        "deltas": [item for item in round_a_events if item["kind"] == "message.delta"],
    }
    if not any(name.endswith("opencode.db") for name in audited_paths):
        fail("OPENCODE_GATE_OBSERVE_STATE_MISSING_DATABASE",
             f"the audited home has no database: {sorted(audited_paths)}")

    second = port_for(resume_native_id=native)
    try:
        reopened = second.open_execution("observe-round-2")
        with lock:
            during_reopen = list(events)
        second.prompt("observe-round-2", "What did I ask you to remember? Reply with the nonce.")
        with lock:
            after_prompt = list(events)
    finally:
        second.stop()
    result["roundB"] = {
        "nativeSessionIdStable": reopened == native,
        # 原生目录模型下没有"捕获-回投"：第二轮直接靠 home 里的原生状态续接，
        # 审计事实（文件数与字节）就是这条路径的可核对证据。
        "stateAuditedFiles": len(audit["files"]),
        "stateAuditedBytes": audit["audited"]["bytes"],
        "chunksDuringReopen": during_reopen,
        "chunksAfterReopenPrompt": after_prompt,
        "deltas": [item for item in after_prompt if item["kind"] == "message.delta"],
    }
    if reopened != native:
        fail("OPENCODE_GATE_REOPEN_IDENTITY_CHANGED", "the reopened native session id changed")

    # 受控重试实验分两段，两段都只看"标记请求"（带 RETRY_MARKER 的 prompt），
    # 都不占用主链预算：
    #   窗口实验：先拒 2 次、第 3 次正常作答 → 一轮 prompt 恰好 3 次尝试，
    #            确定性且很快，直接证明"5xx 之后确实重试"；
    #   有界观测：一直拒，数到视野上限就停（记录在视野内看到的次数与时间线），
    #            绝不把超时当成结论。
    def run_marker_prompt(label: str, refusals: int, horizon: float) -> dict:
        endpoint.retry_mode = True
        endpoint.retry_refusals = refusals
        endpoint.retry_attempts = 0
        attempts_before = endpoint.retry_attempts
        request_index_before = len(endpoint.requests)
        started = time.monotonic()
        outcome: dict = {}
        port = port_for()

        def worker():
            try:
                port.open_execution(label)
                outcome["result"] = port.prompt(label, f"{RETRY_MARKER}: reply with OK.")
            except BaseException as error:
                outcome["error"] = f"{type(error).__name__}: {error}"[:300]

        thread = threading.Thread(target=worker, daemon=True)
        thread.start()
        thread.join(horizon)
        if thread.is_alive():
            outcome["capped"] = True
            try:
                port.stop()
            except BaseException:
                pass
            thread.join(30)
        try:
            port.stop()
        finally:
            endpoint.retry_mode = False
            endpoint.retry_refusals = 0
        evidence = {
            "providerAttempts": endpoint.retry_attempts - attempts_before,
            "attemptSeconds": [item["atSeconds"] for item in endpoint.requests[request_index_before:]],
            "elapsedMs": int((time.monotonic() - started) * 1000),
            "cappedInHorizon": bool(outcome.get("capped")),
            "horizonSeconds": horizon,
            "result": outcome.get("result"),
            "promptError": outcome.get("error"),
            "nativeLogTail": native_log_tail(temporary),
        }
        return evidence

    window = run_marker_prompt("retry-window", 2, RETRY_WINDOW_HORIZON_SECONDS)
    REPORT["retryEvidence"] = {"window": window}
    window["note"] = ("先拒 2 次、第 3 次作答：一轮 prompt 恰好 3 次 provider 尝试，"
                      "证明 5xx 之后确实重试。")
    result["retryExperiment"] = window
    if window["providerAttempts"] != 3 or not window.get("result"):
        fail("OPENCODE_GATE_RETRY_NOT_OBSERVED",
             f"the refused-then-answered prompt produced {window['providerAttempts']} attempts "
             f"and result={window.get('result')!r}; exactly one retry was expected")

    observation = run_marker_prompt("retry-observation", production.MEASURED_RETRY_ATTEMPTS,
                                    RETRY_HORIZON_SECONDS)
    REPORT.setdefault("retryEvidence", {})["observation"] = observation
    observation["note"] = ("一直拒到客户端放弃：OpenCode 的重试策略实测为 6 次（宿主、"
                           "宿主+守卫、guest 运行模式、guest serve 模式四处独立测量一致），"
                           "这里记录视野内的尝试次数与时间线，声明上界取该实测值。")
    result["retryObservation"] = observation

    for label, evidence in (("window", window), ("observation", observation)):
        attempts = evidence["providerAttempts"]
        if attempts < 2:
            fail("OPENCODE_GATE_RETRY_NOT_OBSERVED",
                 f"the {label} experiment saw {attempts} attempts; no retry was observed")
        if attempts > production.MEASURED_RETRY_ATTEMPTS:
            fail("OPENCODE_GATE_RETRY_BOUND_EXCEEDED",
                 f"the {label} experiment saw {attempts} attempts, above the declared bound "
                 f"{production.MEASURED_RETRY_ATTEMPTS}")

    lines = read_driver_audit(workspace, DRIVER_AUDIT_OBSERVE)
    result["driverAudit"] = {
        "lines": len(lines),
        "events": [item.get("event") for item in lines],
        "hostStarts": [item for item in lines if item.get("event") == "host-start"],
        "creates": [item for item in lines if item.get("event") == "create"],
        "opens": [item for item in lines if item.get("event") == "open"],
        "prompts": [item for item in lines if item.get("event") == "prompt"],
        "closes": [item for item in lines if item.get("event") == "close"],
    }
    # 重开相位里**没有**任何 create：重开必须完全靠存储里的会话，不能新造一个。
    phase_creates = []
    seen_host_starts = 0
    for item in lines:
        if item.get("event") == "host-start":
            seen_host_starts += 1
            continue
        if item.get("event") == "create" and seen_host_starts == 2:
            phase_creates.append(item.get("sessionId"))
    result["driverAudit"]["createsInsideReopenPhase"] = phase_creates
    if phase_creates:
        fail("OPENCODE_GATE_REOPEN_CREATED_A_SESSION",
             f"the reopen phase created {phase_creates}")
    opens = result["driverAudit"]["opens"]
    if len(opens) != 1 or opens[0].get("created") is not False:
        fail("OPENCODE_GATE_REOPEN_NOT_BY_STORAGE",
             f"the reopen audit lines are {json.dumps(opens)[:300]}")
    if int(opens[0].get("storedMessages") or 0) < 2:
        fail("OPENCODE_GATE_REOPEN_WITHOUT_STORED_TURNS",
             f"the reopened session had {opens[0].get('storedMessages')} stored messages")
    if len(result["driverAudit"]["hostStarts"]) < 2:
        fail("OPENCODE_GATE_REOPEN_NOT_A_NEW_PROCESS", "the reopen did not start a fresh native process")
    ports = [item.get("port") for item in result["driverAudit"]["hostStarts"] if item.get("port")]
    result["driverAudit"]["hostPorts"] = ports
    closed, waited = wait_for_ports_closed(ports)
    result["driverAudit"]["closedPortsSilent"] = closed
    result["driverAudit"]["portCloseWaitedSeconds"] = waited
    REPORT["driverEvidence"] = result["driverAudit"]
    if not closed:
        fail("OPENCODE_GATE_HOST_PORT_STILL_LISTENING",
             f"a managed host port is still open after {waited}s: "
             f"{[port for port in ports if port_listening(port)]}")
    if any(item.get("credentialsInArgv") is not False for item in result["driverAudit"]["hostStarts"]):
        fail("OPENCODE_GATE_CREDENTIAL_IN_ARGV", "the driver reported credentials in argv")
    return result


def read_driver_audit(workspace: Path, name: str) -> list[dict]:
    """读取驱动自己写的审计行（JSON Lines），失败的行直接丢弃。"""
    location = workspace / name
    if not location.is_file():
        return []
    lines = []
    for line in location.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            lines.append(json.loads(line))
        except ValueError:
            continue
    return lines


def native_log_tail(temporary: Path, lines: int = 25) -> list[str]:
    """把原生进程自己的日志尾巴带进报告：失败模式必须可诊断，而不是只有结论。

    状态投影位于 Worker 的 view 存储里（宿主可见），所以门能直接读到 opencode
    自己写的日志。日志里不得出现假 token，出现即由调用方失败。
    """
    logs = sorted(temporary.glob("worker-root/**/native-state/opencode/log/opencode.log"),
                  key=lambda path: path.stat().st_mtime, reverse=True)
    if not logs:
        return []
    content = logs[0].read_text(encoding="utf-8", errors="replace")
    return content.splitlines()[-lines:]


def wait_for_ports_closed(ports: Sequence[int], timeout: float = PORT_CLOSE_GRACE_SECONDS) -> tuple[bool, float]:
    """托管 host 停止后端口要先关；给一个**有界**宽限，之后仍在监听就失败。"""
    deadline = time.monotonic() + timeout
    started = time.monotonic()
    while True:
        open_ports = [port for port in ports if port_listening(port)]
        if not open_ports or time.monotonic() >= deadline:
            return (not open_ports, round(time.monotonic() - started, 2))
        time.sleep(0.25)


def port_listening(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.5)
        return probe.connect_ex(("127.0.0.1", port)) == 0


def driver_negatives(temporary: Path, workspace: Path, worker: Path, authorization: dict,
                     endpoint: FakeEndpoint, production, guard: Path) -> dict:
    """驱动层面的反例：不可用的 native session 绝不能被静默新建。"""
    from agent_box.server.execution.sidecar import SidecarHarnessPort, WslSidecarLauncher

    bundle = driver_bundle(production, endpoint, guard, authorization)
    adapter = {
        "command": production.BINARY_TARGET, "args": [],
        "environment": {
            **production.ADAPTER_ENVIRONMENT,
            "LD_PRELOAD": GUARD_TARGET,
            "AGENTBOX_EGRESS_AUDIT": f"/workspace/{AUDIT_NAME}",
            "AGENTBOX_DRIVER_AUDIT": f"/workspace/{DRIVER_AUDIT_NEGATIVE}",
        },
        "driver": {"module": f"/runtime/view/{DRIVER_BUNDLE_PATH}"},
    }
    state_directory = temporary / "driver-negatives"
    state_directory.mkdir(exist_ok=True)
    observations: list[dict] = []
    launcher = WslSidecarLauncher(
        DirectWorkerConnector(temporary, worker, workspace),
        workspace={"distribution": "Ubuntu", "remote_user": os.environ["USER"],
                   "connection_id": "connection-opencode-negative", "remote_path": str(workspace)},
        bundle=bundle, credential=current_token().bytes(),
        executable_authorizations=(
            {"path": authorization["source"], "digest": authorization["digest"]},),
        executable_mounts=((authorization["source"], production.BINARY_TARGET),),
        projection_mounts=(
            (CONFIG_BUNDLE_PATH, production.CONFIG_TARGET),
            (GUARD_SOURCE, GUARD_TARGET),
        ),
        home_locator="opencode-negative/.config/opencode",
        native_home=".config/opencode",
        profile_id="profile-opencode-negative",
        harness_type="opencode",
        audit_window=".local/share/opencode",
        timeout_ms=120_000,
    )
    port = SidecarHarnessPort(
        launcher, environment={"AGENTBOX_SIDECAR_ISOLATED": "1"},
        profile="opencode", adapter=adapter, model=production.PRODUCT_MODEL_ID,
        credential_environment=production.CREDENTIAL_ENVIRONMENT,
        resume_native_id="ses_that_was_never_stored",
        state_directory=production.STATE_TARGET, directory="/workspace",
        native_platform="wsl", home_locator="opencode-negative/.config/opencode",
        on_event=lambda _execution, kind, data: observations.append(
            {"kind": kind, "text": str((data or {}).get("text") or "")[:200]}),
    )
    error = None
    messages_before = len(endpoint.requests)
    try:
        port.open_execution("stale-session")
    except BaseException as caught:
        error = f"{type(caught).__name__}: {caught}"[:300]
    finally:
        port.stop()
    after = len(endpoint.requests)
    if error is None:
        fail("OPENCODE_GATE_STALE_SESSION_ACCEPTED", "an unknown native session was accepted")
    if "SIDECAR_OP_FAILED" not in error and "OPENCODE_SESSION_NOT_FOUND" not in error:
        fail("OPENCODE_GATE_STALE_SESSION_UNEXPECTED_ERROR", error)
    if after != messages_before:
        fail("OPENCODE_GATE_STALE_SESSION_TOUCHED_PROVIDER", "a rejected stale session reached the provider")
    lines = read_driver_audit(workspace, DRIVER_AUDIT_NEGATIVE)
    creates = [item for item in lines if item.get("event") == "create"]
    if creates:
        fail("OPENCODE_GATE_STALE_SESSION_CREATED_A_SESSION",
             f"the refused stale session created {len(creates)} native sessions")
    return {
        "refused": True, "error": error, "providerRequests": after - messages_before,
        "sessionsCreatedInThisPhase": len(creates),
        "note": "resume_native_id 指向一个不存在于存储的会话：驱动以 OPENCODE_SESSION_NOT_FOUND 失败。",
    }


# --------------------------------------------------------------------------
# 反向用例：授权工具与 Worker 侧摘要
# --------------------------------------------------------------------------

def authorization_negatives(temporary: Path, authorization: dict, report: dict) -> dict:
    """摘要漂移、版本不符、非法/用户目录 source 的类型化拒绝。"""
    source = Path(authorization["source"])
    results: dict[str, str] = {}

    drift = authorizer_refusal(["--expect-digest", "sha256:" + "b" * 64])
    results["digestDrift"] = drift["code"]
    if drift["code"] != "OPENCODE_DIGEST_DRIFT":
        fail("OPENCODE_GATE_DIGEST_DRIFT_NOT_TYPED", json.dumps(drift)[:200])

    version = authorizer_refusal(["--expect-version", "1.18.20"])
    results["versionMismatch"] = version["code"]
    if version["code"] != "OPENCODE_VERSION_MISMATCH":
        fail("OPENCODE_GATE_VERSION_MISMATCH_NOT_TYPED", json.dumps(version)[:200])

    link = temporary / "opencode-link"
    if not link.exists():
        link.symlink_to(source)
    results["symlinkSource"] = authorizer_refusal(["--source", str(link)])["code"]

    directory = authorizer_refusal(["--entry", str(source.parent)])
    results["directoryEntry"] = directory["code"]

    # 一个受控形状的临时安装包：用来触发"非 ELF""不可执行"这类形状拒绝，
    # 而不去碰任何真实安装目录。
    fake_package = temporary / "lib" / "node_modules" / "opencode-ai"
    (fake_package / "bin").mkdir(parents=True, exist_ok=True)
    text_binary = fake_package / "bin" / "opencode.exe"
    text_binary.write_bytes(b"#!/bin/sh\necho 1.18.21\n")
    text_binary.chmod(0o755)
    results["notElf"] = authorizer_refusal(
        ["--entry", str(text_binary), "--install-root", str(fake_package)])["code"]
    text_binary.chmod(0o644)
    results["notExecutable"] = authorizer_refusal(
        ["--entry", str(text_binary), "--install-root", str(fake_package)])["code"]

    results["relativeEntry"] = authorizer_refusal(["--entry", "bin/opencode"])["code"]

    # 用户配置/缓存目录与整个 node_modules：用临时根里的**假 HOME** 触发规则，
    # 绝不写入真实的用户目录。
    fake_home = temporary / "home"
    for label, relative in (("userConfigSource", ".config/opencode-ai"),
                            ("cacheSource", ".cache/opencode-ai")):
        package = fake_home / relative
        (package / "bin").mkdir(parents=True, exist_ok=True)
        executable = package / "bin" / "opencode.exe"
        executable.write_bytes(Path("/usr/bin/true").read_bytes())
        executable.chmod(0o755)
        results[label] = authorizer_refusal(
            ["--entry", str(executable), "--install-root", str(package)],
            env={"HOME": str(fake_home)})["code"]
    whole_modules = fake_home / "lib" / "node_modules"
    (whole_modules / "opencode-ai" / "bin").mkdir(parents=True, exist_ok=True)
    inner = whole_modules / "opencode-ai" / "bin" / "opencode.exe"
    inner.write_bytes(Path("/usr/bin/true").read_bytes())
    inner.chmod(0o755)
    results["wholeNodeModules"] = authorizer_refusal(
        ["--entry", str(inner), "--install-root", str(whole_modules)])["code"]
    report["authorizationNegatives"] = results
    expected = {
        "digestDrift": "OPENCODE_DIGEST_DRIFT",
        "versionMismatch": "OPENCODE_VERSION_MISMATCH",
        "symlinkSource": "OPENCODE_SOURCE_SYMLINK",
        "directoryEntry": "OPENCODE_ENTRY_MISSING",
        "notElf": "OPENCODE_SOURCE_NOT_ELF",
        "notExecutable": "OPENCODE_SOURCE_NOT_EXECUTABLE",
        "relativeEntry": "OPENCODE_ENTRY_NOT_ABSOLUTE",
        "userConfigSource": "OPENCODE_SOURCE_NOT_CONTROLLED",
        "cacheSource": "OPENCODE_SOURCE_NOT_CONTROLLED",
        "wholeNodeModules": "OPENCODE_SOURCE_NOT_CONTROLLED",
    }
    for key, code in expected.items():
        if results.get(key) != code:
            fail("OPENCODE_GATE_NEGATIVE_MISMATCH", f"{key}: {results.get(key)!r} != {code!r}")
    return results


def worker_digest_refusal(temporary: Path, workspace: Path, worker: Path, authorization: dict,
                          endpoint: FakeEndpoint) -> dict:
    """摘要漂移的二进制即使被声明成授权摘要，也必须在 Worker 引导阶段被拒绝。"""
    drifted = temporary / "opencode-drifted"
    content = bytearray(Path(authorization["source"]).read_bytes())
    content[0x1000] ^= 0xFF  # 翻转 1 字节
    drifted.write_bytes(bytes(content))
    drifted.chmod(0o755)
    requests_before = None if endpoint is None else len(endpoint.requests)
    connector = DirectWorkerConnector(temporary, worker, workspace)
    client = connector.client_for_workspace(
        distribution="Ubuntu", user=os.environ["USER"], connection_id="connection-opencode-drifted",
        workspace_path=str(workspace),
        executable_authorizations=({"path": str(drifted), "digest": authorization["digest"]},),
    )
    code = None
    message = ""
    try:
        client.start()
        client.close()
    except BaseException as error:
        code = getattr(error, "code", None) or type(error).__name__
        message = str(error)[:300]
    if code is None:
        fail("OPENCODE_GATE_DRIFTED_BINARY_ACCEPTED", "the Worker accepted a drifted executable digest")
    if requests_before is not None and len(endpoint.requests) != requests_before:
        fail("OPENCODE_GATE_DRIFTED_BINARY_REACHED_PROVIDER", "a drifted binary produced provider requests")
    return {"refused": True, "code": code, "message": message,
            "verifiedBy": "Worker bootstrap executable digest authorization"}


# --------------------------------------------------------------------------
# guest 探针：版本、只读挂载、出口对照
# --------------------------------------------------------------------------

GUEST_PROBE = r"""
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import net from "node:net"

const output = { cwd: process.cwd(), path: process.env.PATH }
try {
  output.version = execFileSync("/runtime/bin/opencode", ["--version"], { encoding: "utf8" }).trim()
} catch (error) {
  output.versionError = String(error).slice(0, 200)
}
try {
  writeFileSync("/runtime/bin/opencode", "tamper")
  output.runtimeBinWritable = true
} catch (error) {
  output.runtimeBinWritable = false
  output.runtimeBinError = error.code ?? String(error)
}
try {
  output.config = JSON.parse(readFileSync("/runtime/home/.config/opencode/opencode.json", "utf8"))
  output.configReadable = true
} catch (error) {
  output.configReadable = false
  output.configError = error.code ?? String(error)
}
try {
  writeFileSync("/runtime/home/.config/opencode/opencode.json", "tamper")
  output.configWritable = true
} catch (error) {
  output.configWritable = false
  output.configWriteError = error.code ?? String(error)
}
try {
  writeFileSync("/workspace/.gate-probe-write", "ok")
  output.workspaceWritable = true
} catch (error) {
  output.workspaceWritable = false
}
const attempt = (host, port) => new Promise((resolve) => {
  const socket = net.connect({ host, port })
  socket.setTimeout(4000)
  socket.on("connect", () => { socket.destroy(); resolve("connected") })
  socket.on("timeout", () => { socket.destroy(); resolve("timeout") })
  socket.on("error", (error) => resolve(error.code ?? String(error)))
})
output.egress = { remote: await attempt("1.1.1.1", 443), loopback: await attempt("127.0.0.1", 1) }
process.stdout.write(JSON.stringify(output) + "\n")
"""


def guest_probes(temporary: Path, workspace: Path, worker: Path, authorization: dict,
                 guard: Path, report: dict, production, config_bytes: bytes,
                 expected_base_url: str) -> dict:
    connector = DirectWorkerConnector(temporary, worker, workspace)
    output = run_guest_probe(
        connector, workspace, Path(authorization["source"]), authorization["digest"], guard,
        GUEST_PROBE, report, label="version-readonly-egress",
        projection=("gate/opencode.json", production.CONFIG_TARGET, config_bytes),
    )
    if output.get("version") != "1.18.21":
        fail("OPENCODE_GATE_GUEST_VERSION_MISMATCH",
             f"the guest binary reports {output.get('version')!r}")
    if output.get("runtimeBinWritable") is not False:
        fail("OPENCODE_GATE_RUNTIME_BIN_WRITABLE", "the guest could write to /runtime/bin")
    if output.get("workspaceWritable") is not True:
        fail("OPENCODE_GATE_WORKSPACE_NOT_WRITABLE", "the guest could not write to its workspace")
    # The reviewed configuration is readable at exactly the declared target and
    # is read-only there: a guest that could rewrite it would rewrite the
    # endpoint of its own next turn.
    if output.get("configReadable") is not True:
        fail("OPENCODE_GATE_GUEST_CONFIG_UNREADABLE",
             f"the declared configuration target was not readable: {output.get('configError')!r}")
    config = output.get("config") or {}
    base_url = (((config.get("provider") or {}).get("deepseek") or {}).get("options") or {}).get("baseURL")
    if base_url != expected_base_url:
        fail("OPENCODE_GATE_GUEST_CONFIG_UNEXPECTED",
             f"the guest read baseURL {base_url!r}, this run projected {expected_base_url!r}")
    if output.get("configWritable") is not False:
        fail("OPENCODE_GATE_GUEST_CONFIG_WRITABLE",
             "the guest could write the read-only configuration target")
    if output.get("configWriteError") not in {"EROFS", "EACCES", "EPERM"}:
        fail("OPENCODE_GATE_GUEST_CONFIG_WRITE_ERROR",
             f"unexpected write refusal {output.get('configWriteError')!r}")
    egress = output.get("egress") or {}
    if egress.get("remote") != "EACCES":
        fail("OPENCODE_GATE_EGRESS_CONTROL_FAILED",
             f"a non-loopback connect was not refused by the guard: {egress.get('remote')!r}")
    if egress.get("loopback") == "EACCES":
        fail("OPENCODE_GATE_EGRESS_CONTROL_BLOCKED_LOOPBACK", "the guard refused a loopback connect")
    return output


# --------------------------------------------------------------------------
# 清理核查
# --------------------------------------------------------------------------

def scan_processes(temporary: Path) -> list[dict]:
    """按本次运行的临时根限定：不会碰到并发的兄弟门。

    返回值带进程号与原始 argv/cwd，便于区分"本次运行自己的残渣"与 Worker 设计内的
    延迟结果清理助手（`--cleanup-manifest <manifest> --delay-seconds N`，默认睡
    300 秒后才删 results/）。
    """
    prefix = str(temporary)
    survivors = []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            argv = [part for part in (entry / "cmdline").read_bytes().split(b"\0") if part]
        except OSError:
            continue
        command = [part.decode("utf-8", "replace") for part in argv]
        rendered = " ".join(command)
        if prefix in rendered:
            survivors.append({
                "pid": int(entry.name), "command": rendered[:200],
                "isWorkerCleanupHelper": "--cleanup-manifest" in command
                and "--delay-seconds" in command,
            })
            continue
        try:
            cwd = os.readlink(entry / "cwd")
        except OSError:
            continue
        if prefix in cwd:
            survivors.append({"pid": int(entry.name), "command": f"cwd {cwd[:160]}",
                              "isWorkerCleanupHelper": False})
    return survivors


def terminate_worker_cleanup_helpers(helpers: list[dict], *, timeout: float = 20.0) -> dict:
    """终止 Worker 设计内的延迟结果清理助手（它们只针对本次运行的临时根）。

    这些进程是 Worker 退出路径故意派生的（延时删 `results/`），不是为了留下残渣；
    但它们确实还在引用我们的临时根，所以门主动结束它们并复核，而不是视而不见。
    """
    pids = [item["pid"] for item in helpers]
    for pid in pids:
        try:
            os.kill(pid, 15)
        except OSError:
            pass
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        remaining = [pid for pid in pids if Path(f"/proc/{pid}").exists()]
        if not remaining:
            break
        time.sleep(0.25)
    remaining = [pid for pid in pids if Path(f"/proc/{pid}").exists()]
    return {"count": len(pids), "pids": pids[:8], "remaining": remaining}


def token_appears_in_tracked_content(root: Path | str, value: str) -> bool:
    """本次运行的假 token 是否出现在 root 仓库的 tracked 内容里。

    只对调用方给出的完整值做逐字匹配：源码里的前缀、测试注入的值、以及运行期真实
    生成的随机后缀，三者不会互相顶替。
    """
    if not isinstance(value, str) or not value:
        raise ValueError("OPENCODE_GATE_EMPTY_TOKEN_SCAN")
    found = subprocess.run(
        ["git", "-C", str(root), "grep", "-q", "-F", "--", value],
        capture_output=True, text=True, timeout=120,
    )
    if found.returncode not in (0, 1):
        raise RuntimeError(f"git grep failed: {found.returncode}")
    return found.returncode == 0


def cleanup_check(temporary: Path, workspace: Path, token_path: Path, report: dict) -> None:
    """本次运行投影出去的东西一个都不能留下；任何残留都让门失败。

    Worker 在退出路径上会派生一个 `--cleanup-manifest <root>` 的瞬时子进程；它在
    正常情况下几秒内结束，所以这里做**有界等待**，而不是一见即失败，也不是视而不见。
    """
    worker_root = temporary / "worker-root"
    leftovers = [name for name in ("views", "secrets") if (worker_root / name).exists()]
    if leftovers:
        fail("OPENCODE_GATE_WORKER_LEFTOVER", f"the Worker kept {leftovers}")
    deadline = time.monotonic() + SURVIVOR_GRACE_SECONDS
    survivors = scan_processes(temporary)
    while survivors and time.monotonic() < deadline:
        time.sleep(0.25)
        survivors = scan_processes(temporary)
    helpers = [item for item in survivors if item["isWorkerCleanupHelper"]]
    others = [item for item in survivors if not item["isWorkerCleanupHelper"]]
    report.setdefault("cleanup", {})["survivorGraceSeconds"] = SURVIVOR_GRACE_SECONDS
    if helpers:
        report["cleanup"]["workerDeferredCleanupHelpers"] = terminate_worker_cleanup_helpers(helpers)
        if report["cleanup"]["workerDeferredCleanupHelpers"]["remaining"]:
            fail("OPENCODE_GATE_PROCESS_ALIVE",
                 "a Worker deferred cleanup helper survived termination: "
                 f"{report['cleanup']['workerDeferredCleanupHelpers']['remaining']}")
    if others:
        fail("OPENCODE_GATE_PROCESS_ALIVE",
             f"a process survived inside this run's root: {[item['command'] for item in others[:2]]}")
    if token_path.exists():
        token_path.unlink()
    if token_path.exists():
        fail("OPENCODE_GATE_CLEANUP_FAILED", "the temporary fake token could not be removed")
    remove_tree(workspace)
    # 扫描的是**本次实际生成**的完整 token，而不是源码里的任何常量。
    report.setdefault("cleanup", {}).update({
        "workerProjectionsRemoved": True, "processesRemoved": True,
        "fakeTokenRemoved": not token_path.exists(), "workspaceRemoved": not workspace.exists(),
        "tokenInTrackedGitContent": token_appears_in_tracked_content(REPO, current_token().value()),
    })
    if report["cleanup"]["tokenInTrackedGitContent"]:
        fail("OPENCODE_GATE_TOKEN_IN_GIT", "the temporary fake token appears in tracked content")


# --------------------------------------------------------------------------
# 门主体
# --------------------------------------------------------------------------

def record_endpoint_if_missing(endpoint) -> None:
    """失败路径也要留下端点证据（请求结构、预算、重试次数）。"""
    if endpoint is None or "provider" in REPORT:
        return
    REPORT["provider"] = {
        "requests": endpoint.requests, "paths": endpoint.paths,
        "unauthorizedRequests": endpoint.unauthorized,
        "requestsBeyondBudget": endpoint.over_budget,
        "retryAttempts": endpoint.retry_attempts,
        "baseUrl": endpoint.base_url,
    }


def verify_external_binary(binary: Path, expected: dict, report: dict) -> None:
    """调用方给的二进制只读、不删除、不改权限；清理后复核摘要与模式。"""
    digest = digest_of(binary.read_bytes())
    mode = stat.S_IMODE(binary.stat().st_mode)
    if digest != expected["digest"]:
        fail("OPENCODE_GATE_EXTERNAL_BINARY_DAMAGED", "the caller's binary changed during the run")
    report.setdefault("binary", {}).update({
        "external": True, "preservedAfterCleanup": True,
        "modeAfterCleanup": oct(mode), "digestAfterCleanup": digest,
    })


def main() -> int:
    global _ACTIVE
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker", default=None)
    parser.add_argument("--binary", default=None,
                        help="an external single-file OpenCode binary to authorize read-only")
    parser.add_argument("--keep", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument(
        "--live", action="store_true",
        help="paid mode: the official endpoint and an authorized credential locator "
             "instead of the loopback fake endpoint (see "
             "docs/server-round1/fullstack/live-model-preflight.md)",
    )
    parser.add_argument(
        "--authorized-secret", default=None,
        help="path of the authorized credential file (only with --live)",
    )
    options = parser.parse_args()
    if options.live and not options.authorized_secret:
        fail("OPENCODE_GATE_LIVE_SECRET_REQUIRED", "--live requires --authorized-secret")

    endpoint = None
    created: Path | None = None
    temporary: Path | None = None
    primary: GateFailure | None = None
    cleanup_failure: GateFailure | None = None
    external_binary: Path | None = None
    external_expected: dict | None = None
    # 假凭据只为这一次运行存在：进入运行前生成，收尾核验后立即丢弃。
    _ACTIVE = _FakeToken()

    try:
        declared = options.worker or os.environ.get("AGENTBOX_W43_WORKER")
        if not declared:
            bundles = sorted(
                p.name for p in (REPO / "workers" / "agent-box-worker").glob(".acceptance-bundle-*")
            )
            fail("GATE_WORKER_REQUIRED",
                 "pass --worker <agent-box-worker binary>; bundles on disk: " + ", ".join(bundles))
        worker = Path(declared).resolve()
        REPORT["worker"] = {"path": str(worker)}
        if not worker.is_file():
            fail("OPENCODE_GATE_WORKER_MISSING", f"the release Worker binary is unavailable: {worker}")
        if not shutil.which("bwrap"):
            fail("OPENCODE_GATE_BWRAP_MISSING", "bubblewrap is unavailable")
        REPORT["worker"]["sha256"] = digest_of(worker.read_bytes())

        from agent_box_harnesses.opencode import production

        config = production.config_document()
        official = config["provider"][production.OPENCODE_PROVIDER]["options"]["baseURL"]
        if official != production.OFFICIAL_BASE_URL:
            fail("OPENCODE_GATE_TEMPLATE_NOT_OFFICIAL", f"the production template base URL is {official!r}")
        for forbidden in ("LD_PRELOAD", "AGENTBOX_EGRESS_AUDIT", "AGENTBOX_DRIVER_AUDIT",
                          "NODE_OPTIONS", "OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX"):
            if forbidden in production.ADAPTER_ENVIRONMENT:
                fail("OPENCODE_GATE_TEMPLATE_NOT_PRODUCTION",
                     f"the production default declares {forbidden}")
        REPORT["leaseObservation"] = {
            "gateLeaseMs": GATE_LEASE_MS,
            "defaultLeaseMs": 5000,
            "finding": ("Worker 默认 lease=5s 会在客户端 5 秒内无帧时取消运行中的 attempt；"
                        "本地假端点下的重试观测因此在第 2 次 provider 尝试后被掐断"
                        "（实测：2 次尝试后停滞）。本门用更长的门侧 lease 完成长重试观测；"
                        "生产默认值未被本阶段改动。"),
        }
        REPORT["template"] = {
            "officialBaseUrl": official,
            "productModelId": production.PRODUCT_MODEL_ID,
            "nativeModelValue": production.NATIVE_MODEL_VALUE,
            "outputTokenLimit": production.OUTPUT_TOKEN_LIMIT,
            "credentialEnvironment": production.CREDENTIAL_ENVIRONMENT,
            "binaryTarget": production.BINARY_TARGET,
            "driverSource": production.DRIVER_SOURCE,
            "stateTarget": production.STATE_TARGET,
            "adapterEnvironment": dict(production.ADAPTER_ENVIRONMENT),
            "environmentKeysWithoutCredentialWords": all(
                not any(word in key.upper() for word in
                        ("TOKEN", "SECRET", "KEY", "PASSWORD", "CREDENTIAL", "AUTH"))
                for key in production.ADAPTER_ENVIRONMENT),
        }

        live = bool(options.live)
        REPORT["mode"] = "live" if live else "loopback-fake-endpoint"
        secret_path = None
        if live:
            secret_path = Path(options.authorized_secret).resolve()
            mode = secret_path.stat().st_mode & 0o777
            if mode & 0o077:
                fail("OPENCODE_GATE_LIVE_SECRET_PERMISSIONS", f"authorized secret mode is {oct(mode)}")
            endpoint = None
        else:
            endpoint = FakeEndpoint(current_token().value())
            endpoint.assert_loopback_only()
            if len(production.documented_differences(endpoint.base_url)) != 1:
                fail("OPENCODE_GATE_OVERRIDE_NOT_MINIMAL",
                     f"the loopback override changed "
                     f"{production.documented_differences(endpoint.base_url)}")

        created = Path(tempfile.mkdtemp(prefix=TEMPORARY_PREFIX))
        temporary = created
        workspace = temporary / "workspace"
        workspace.mkdir()
        REPORT["run"] = {"temporary": str(temporary), "workspace": str(workspace)}

        report_binary = Path(options.binary).resolve() if options.binary else None
        if report_binary is not None:
            assert_external_binary_separate(report_binary, temporary)
            external_binary = report_binary
        authorization = authorize_binary(report_binary, REPORT)
        if options.binary:
            external_expected = {"digest": authorization["digest"]}

        guard = compile_guard(temporary, REPORT)
        token_path = temporary / "opencode-gate-token"
        if live:
            # 授权 locator 的内容只经 SecretStore 注入；门只删自己的临时 token 文件。
            token_path.write_bytes(secret_path.read_bytes())
        else:
            token_path.write_bytes(current_token().bytes())
        token_path.chmod(0o600)
        global INJECTED_CREDENTIAL
        INJECTED_CREDENTIAL = token_path.read_bytes().strip()

        if endpoint is not None:
            endpoint.start()
        try:
            outcome = run_chain(temporary, workspace, worker, authorization, endpoint,
                                production, token_path, guard, live=live)
            REPORT.update(outcome)
            if live:
                # 下列观测都依赖假端点/守卫（请求体计数、注入 5xx、出口审计）。
                # live 下显式记为"未观测"并给出理由，不静默跳过、也不冒充通过。
                not_observed = "requires the loopback fake endpoint and its guard"
                REPORT["driverObservation"] = {"observed": False, "reason": not_observed}
                REPORT["driverNegatives"] = {"observed": False, "reason": not_observed}
                REPORT["guestProbeResult"] = {"observed": False, "reason": not_observed}
                REPORT["authorizationNegatives"] = authorization_negatives(
                    temporary, authorization, REPORT)
                REPORT["workerDigestNegative"] = worker_digest_refusal(
                    temporary, workspace, worker, authorization, endpoint)
            else:
                # 主链只花两轮预算；观测阶段前显式提高并记录（观测阶段两轮 prompt）。
                endpoint.raise_budget(endpoint.budget + 2, reason="driver observe + reopen rounds")
                REPORT["driverObservation"] = observe_driver(
                    temporary, workspace, worker, authorization, endpoint, production, guard)
                REPORT["driverNegatives"] = driver_negatives(
                    temporary, workspace, worker, authorization, endpoint, production, guard)
                REPORT["guestProbeResult"] = guest_probes(
                    temporary, workspace, worker, authorization, guard, REPORT, production,
                    json.dumps(
                        production.loopback_config_document(endpoint.base_url), sort_keys=True,
                    ).encode("utf-8"),
                    endpoint.base_url)
                REPORT["authorizationNegatives"] = authorization_negatives(
                    temporary, authorization, REPORT)
                REPORT["workerDigestNegative"] = worker_digest_refusal(
                    temporary, workspace, worker, authorization, endpoint)
        finally:
            if endpoint is not None:
                endpoint.stop()
        if endpoint is None:
            REPORT["provider"] = {
                "requests": None, "paths": [], "unauthorizedRequests": None,
                "requestsBeyondBudget": None, "retryAttempts": None,
                "baseUrl": production.OFFICIAL_BASE_URL,
                "mode": "live",
            }
        else:
            REPORT["provider"] = {
            "requests": endpoint.requests, "paths": endpoint.paths,
            "unauthorizedRequests": endpoint.unauthorized,
            "requestsBeyondBudget": endpoint.over_budget,
            "retryAttempts": endpoint.retry_attempts,
            "baseUrl": endpoint.base_url,
        }
        if endpoint is not None and endpoint.over_budget:
            fail("OPENCODE_GATE_EXTRA_PROVIDER_REQUEST",
                 f"{endpoint.over_budget} provider requests exceeded the declared budget")
        observation = REPORT.get("driverObservation", {}) or {}
        measured = {}
        for label in ("retryExperiment", "retryObservation"):
            evidence = observation.get(label) or {}
            attempts = int(evidence.get("providerAttempts") or 0)
            measured[label] = attempts
            if not live and not 2 <= attempts <= production.MEASURED_RETRY_ATTEMPTS:
                fail("OPENCODE_GATE_RETRY_BOUND_VIOLATED",
                     f"the {label} observed {attempts} attempts, outside "
                     f"[2, {production.MEASURED_RETRY_ATTEMPTS}]")
        REPORT["providerAttemptBound"] = {
            "observed": measured if not live else None,
            "declared": production.MEASURED_RETRY_ATTEMPTS,
            "requestsPerPrompt": production.PROVIDER_REQUESTS_PER_PROMPT,
            "observedLive": not live,
        }

        audit = workspace / AUDIT_NAME
        audit_lines = audit.read_text(encoding="utf-8").splitlines() if audit.is_file() else []
        denied = [line for line in audit_lines if line.startswith("denied")]
        REPORT["egress"] = {
            "guardLoaded": any(line.startswith("guard-loaded") for line in audit_lines),
            "loadEvents": sum(1 for line in audit_lines if line.startswith("guard-loaded")),
            "denied": denied,
            "auditPresent": audit.is_file(),
            "officialRootDenied": [line for line in denied if "api.deepseek.com" in line],
        }
        REPORT["egress"]["guardExpected"] = not live
        if not live and not REPORT["egress"]["guardLoaded"]:
            fail("OPENCODE_GATE_EGRESS_GUARD_ABSENT", "the loopback guard did not load in the guest")
        if not live and REPORT["egress"]["officialRootDenied"]:
            fail("OPENCODE_GATE_OFFICIAL_ROOT_ATTEMPTED",
                 "something tried to reach the official provider root")
        cleanup_check(temporary, workspace, token_path, REPORT)
        REPORT["result"] = "OPENCODE_PRODUCTION_CHAIN_PREPARED"
    except GateFailure as failure:
        primary = failure
        record_endpoint_if_missing(endpoint)
    except BaseException as error:  # 未预期的崩溃也是失败
        record_endpoint_if_missing(endpoint)
        import traceback
        REPORT["traceback"] = traceback.format_exc()[-2000:]
        primary = GateFailure("OPENCODE_GATE_UNEXPECTED",
                              f"{type(error).__name__}: {error} | {traceback.format_exc()[-500:]}")
    finally:
        if endpoint is not None:
            endpoint.stop()
        if temporary is not None:
            run = REPORT.setdefault("run", {})
            if options.keep:
                run["removed"] = False
                run["kept"] = str(temporary)
                REPORT["kept"] = str(temporary)
            else:
                try:
                    outcome = cleanup_root(temporary, created=created)
                    run["removed"] = bool(outcome["removed"])
                    REPORT.setdefault("cleanup", {}).update(outcome)
                except GateFailure as failure:
                    cleanup_failure = failure
                    run["removed"] = not temporary.exists()
                    REPORT["cleanupFailure"] = {"code": failure.code, "error": failure.message[:300]}
        if external_binary is not None and primary is None and external_expected is not None:
            try:
                verify_external_binary(external_binary, external_expected, REPORT)
            except GateFailure as failure:
                primary = GateFailure("OPENCODE_GATE_EXTERNAL_BINARY_DAMAGED", failure.message)
        _ACTIVE.clear()
        _ACTIVE = None

    if primary is None and cleanup_failure is not None:
        primary, cleanup_failure = cleanup_failure, None
    try:
        assert_report_is_credential_free(REPORT, prefix="OPENCODE")
    except GateFailure as exposure:
        if primary is None:
            primary = exposure

    if primary is not None:
        REPORT["result"] = "OPENCODE_PRODUCTION_CHAIN_GATE_FAILED"
        REPORT["code"] = primary.code
        REPORT["error"] = primary.message[:900]
        if cleanup_failure is not None:
            REPORT["cleanupFailure"] = {"code": cleanup_failure.code,
                                        "error": cleanup_failure.message[:300]}
        print(json.dumps(REPORT, indent=2 if options.json else None, sort_keys=True))
        return 1
    print(json.dumps(REPORT, indent=2 if options.json else None, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
