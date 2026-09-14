# 通用原生 driver 接缝（provider-neutral）

日期：2026-09-14。分支 `feature/server-harness-extension-v1`。本文件登记 **42-D 阶段新增的中立
接缝**：让「不使用 ACP 的原生 Harness」也能在同一套 Server→Core→sidecar→Worker→bwrap 链路上被驱动，
而 Server/Core/Worker/bwrap **不需要认识任何 Harness 品牌**。

它服务的是 OpenCode 这类原生 host/CLI Harness（本阶段另一条并行工作），但接缝本身与家无关：
Pi 模板与 Hermes 用 ACP 注册路径，OpenCode 用 driver 路径，两者由 **deployment 数据**选择。

## 1. 为什么需要接缝

Pi 与 Hermes 都通过上游 ACP 注册（`createAcpRegistration`）接入 sidecar：ACP 的
`session/new`、`session/prompt`、`session/load` 等由上游组件翻译成通用操作。OpenCode 明确**不**走
ACP（禁止伪装成 ACP profile），它是一条原生 host/CLI 路径，因此需要一个"谁来翻译原生协议"的位置。

约束是不允许在 Server/Worker/Core/bwrap 里写 `if opencode`。于是接缝的形态是：

- **deployment 声明**：`adapter.driver = {"source": "<插件内相对路径>"}`（数据，不是代码分支）；
- **Server**：只把它当成一个普通的插件文件读进评审过的 bundle，并把规范化后的
  `{"module": "/runtime/view/agentbox-sidecar/deployment/<id>/driver.mjs"}` 放进通用 `adapter` 字段；
- **sidecar**：仅从**同一 bundle 的 `deployment/` 目录**加载该模块，用同一套通用操作（start/create/
  open/prompt/abort/close）驱动它；
- **向上事件**：driver 只能播发中性事实（`message_delta`、`driver_exit`），由 Server 侧映射成产品事实
  （`message.delta` / 失败）。

## 2. 精确接口

声明（deployment）：

```json
{"id": "opencode", "adapter": {
   "command": "/runtime/bin/opencode", "args": ["run", "..."],
   "environment": {"...": "..."},
   "driver": {"source": "deploy/opencode/driver-native.mjs"}}}
```

加载规则（`plugins/agent-box-harnesses/runtime/native-driver.mjs`）：

- 只接受绝对路径、无 `..`/`\`、必须以 `.mjs` 结尾，且解析后位于
  **本 bundle 的 `deployment/` 目录**（guest 内即 `/runtime/view/agentbox-sidecar/deployment/…`）；
  越界即类型化错误 `DRIVER_MODULE_OUTSIDE_BUNDLE`（不会 fallback 到 ACP 路径）；
- 模块必须导出 `createDriver(context)`，返回带 `start/create/open/prompt/abort/close`
  （`status` 可选）的对象；缺入口/缺方法分别报 `DRIVER_ENTRYPOINT_MISSING` / `DRIVER_METHOD_MISSING`；
- `context` 提供 `profileID/command/args/environment/credentialEnvironment/hasCredential/directory/
  stateDirectory/emit/redact/spawnProcess`；**凭据值从不交给 driver**，只用
  `spawnProcess(command,args,options)` 注入到子进程环境；
- `capabilities.sessionCapabilities.resume` 是"能重开已存 native session"的声明，产品据此把
  checkpoint 标为 `resumable`；
- `emit({event:"message_delta",data:{text}})` → 产品 `message.delta`；`emit({event:"driver_exit",...})`
  → 该轮失败；所有 driver 事件在进入 envelope 前做**凭据深红删**（`redactDeep`）。

## 3. 本阶段实测（真实 Worker + bwrap，非交付门，仅接缝自证）

一次性探针（临时 fixture driver，未入库、用后删除）通过真实
`build_runtime_from_sidecar_deployment` + c4 release Worker + bwrap 跑通两轮：

```json
{"checkpoint": {"files": ["native-session.txt"], "harnessType": "fixture-native",
                "resumable": true, "schemaVersion": 2},
 "checkpointAfterRound2": ["native-session.txt", "reopened.txt"],
 "round1": {"state": "completed", "nativeId": "probe-native-1",
            "deltas": ["probe cred=CRED_OK node=v22.23.2 model=probe-model session=probe-native-1 text=probe round one"]},
 "round2": {"state": "completed", "nativeIdStable": true,
            "deltas": ["probe cred=CRED_OK node=v22.23.2 model=probe-model session=probe-native-1 text=probe round two"]},
 "stateScan": [], "tokenInEvents": false, "tokenInReport": false}
```

证明的四件事：**bundle 投递与模块加载**在 bwrap 内可用；`spawnProcess` 把凭据送进 driver 的**孙进程**
（`CRED_OK`）且不进 argv/事件；**可写 state 投影**被回读为 checkpoint 并在下一轮**回投**
（第二轮 `open` 在同一 state 目录写出 `reopened.txt`，checkpoint 同时含两文件）；native id 两轮稳定。
探针的假 token 未出现在事件、captured state 或报告中。

## 4. 回归与边界

- 通用测试：`tests/server/test_sidecar_native_driver.py`（17 项）覆盖驱动路由、向上事件映射、
  `resumable` 声明、模块越界/缺入口拒绝、deployment 形状拒绝、以及"未声明 driver 时仍走 ACP 注册"。
- ACP 路径未受影响：`tests/server/test_harness_sidecar.py` 91 passed；Node 侧 25/25。
- 边界与残余：driver 模块与 sidecar 同进程（与 ACP adapter 一样是评审过的插件代码，非沙箱外代码）；
  模块大小受 `_sidecar_deployment_file` 的 8 MiB 上限约束；`AGENTBOX_DRIVER_AUDIT` 之类的测试期
  审计开关只允许出现在 gate 运行期，生产模板不得声明（各家 gate 有断言）。

## 5. 本阶段发现的通用接缝缺陷（已修复：WORKER_LEASE_KEEPALIVE_FIXED）

**缺陷**：Worker 的 5 秒租约会取消"客户端静默"的运行中 attempt——任何首 token 超过 5 秒的真实模型
轮次都会被掐断。

- **机制（代码级）**：Worker 引导接受 `leaseMs`（`workers/agent-box-worker/src/protocol.rs`，默认
  `5_000`，合法范围 1 000–120 000）。`main.rs` 只在**收到客户端帧**时刷新
  `lease_deadline = Instant::now() + lease`；定时分支一旦发现 `Instant::now() >= lease_deadline`
  就对**所有运行中的进程**发 cancel。客户端侧唯一的发送方曾是
  `WorkerClient.wait_terminal()`（`plugins/agent-box-runtime-wsl/src/agent_box_runtime_wsl/client.py`）。
- **为什么一轮 prompt 会中招**：Server 阻塞在 `SidecarEnvelope.request({"op":"prompt"})`，而
  `_WorkerChannels.iter_chunks()` 阻塞在自己的队列上；**没有任何线程进入 `wait_terminal`**，于是
  adapter 只要静默超过 5 秒就被取消。
- **第一手复现（修复前）**：同一 fixture 驱动在 prompt 里静默 8 秒，生产默认 `lease_ms=5000` 下轮次被
  取消并最终报 `WorkerError: attempt does not accept stdin writes`；仅把租约改成 `120000` 后两轮
  `completed`。既有假端点门因毫秒级应答从未暴露。

### 修复设计（租约 owner）

- `WorkerClient` 新增**保活 owner**：间隔由租约派生（`max(lease_ms/3000, 0.05)`，即至多约 `lease/3`，
  不写死只适合 5 秒）；`start()` 在 attempt spawn **之前**进入保活，`stop()` 幂等并 join 线程；
  生命周期在 terminal、`close()`、disconnect 与异常时都被显式收束，不留后台线程、timer 或未消费的
  heartbeat 响应。
- `request()` 全程串行化（一把锁覆盖帧号递增、写入与响应路由），因此 heartbeat **不会**与 `cancel`
  或 `attempt.write` 交错；并发场景下没有两个 request 消费者争抢同一响应队列。`wait_terminal` 的既有
  语义（回投非 terminal 帧、收 terminal 帧）保持不变。
- heartbeat 失败**类型化上浮**为 `WORKER_LEASE_HEARTBEAT_FAILED`：owner 记录 failure，channel 的
  `_WorkerChannels.iter_chunks()` 以有界轮询（0.25s）发现它并抛出，`SidecarEnvelope` 把该原因与 code
  交给正在等待的调用方——**prompt 不会无限等待**。
- sidecar 侧由 `_WorkerChannels` 拥有保活：`subscribe()` 启动、terminal/`close()`/disconnect 停止；
  只有声明了 `keep_lease` 的客户端才启用（测试替身不受影响）。
- **默认租约未改**（仍 5000，生产 connector 不传覆盖）；**Worker 的过期取消未关**：保活停止后，静默
  attempt 仍会在租约边界内被 Worker 取消（有专门反例）。

### 反例与证据

- 客户端层 13 条门禁（`plugins/agent-box-runtime-wsl/tests/`）：默认 5s 租约 + 8s 静默完成（期间实测
  **5 次 heartbeat**）、terminal 后计数冻结、`stop()`/`close()` 后无线程无残留、disconnect 在读/写两侧
  均类型化、静默中 cancel 有界（<3s，实测 <0.1s）、heartbeat 出错类型化且不无限等待、**停止保活后
  2.1s 内** Worker 仍写出 `cancelled=true`、并发事件与 heartbeat 不串 `requestId`/`sequence`、
  `wait_terminal` 既有 heartbeat 行为不退化、间隔随租约派生（1000/5000/120000 → lease/3）。
- sidecar 层 5 条门禁（`tests/server/test_sidecar_lease_keepalive.py`）：默认租约值未被覆盖、**8 秒静默
  的 prompt 正常完成**（`elapsed >= 8s`，delta 到达，无 failed）、一轮结束后无保活线程残留、注入
  heartbeat 失败时该轮以 `WORKER_LEASE_HEARTBEAT_FAILED` 结束（且**快于** fixture 的静默），静默中
  cancel 不被饿死（<3s）。
- **Windows 真机证据**（c4 release Worker `sha256:31e92959…`，未重建）：Windows Server→`wsl.exe`→Worker
  →bwrap 的验收新增"默认租约 + 8 秒静默"一步，实测
  `elapsed_ms=8839`、`turn_state=completed`、`delta_text="controlled stream"`、
  `lease_ms=5000`、`lease_override=false`；整轮 exit 0，`-PostCheck` 为 `…_POSTCHECK_CLEAN`。
- 残余（如实登记）：保活是 **fail-closed** 的——若某个请求长时间独占串行化锁（超过约一个租约周期），
  owner 会判 `WORKER_LEASE_HEARTBEAT_FAILED` 并让该轮失败；当前无已知正常路径会这样做，但这是一个需要
  在真实模型门里观察的自伤面。`_read_loop` 在 reader 线程同步调用事件监听器这一既有约束未改变。
