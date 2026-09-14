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

## 5. 本阶段发现的通用接缝缺陷（尚未修复，阻塞四家真实模型门）

**Worker 的 5 秒租约会取消"客户端静默"的运行中 attempt —— 任何首 token 超过 5 秒的真实模型轮次都会被掐断。**

- **机制（代码级）**：Worker 引导接受 `leaseMs`（`workers/agent-box-worker/src/protocol.rs`，默认
  `5_000`，合法范围 1 000–120 000）。`main.rs` 只在**收到客户端帧**时刷新
  `lease_deadline = Instant::now() + lease`；定时分支一旦发现 `Instant::now() >= lease_deadline`
  就对**所有运行中的进程**发 cancel。客户端侧唯一的发送方是
  `WorkerClient.wait_terminal()`（`plugins/agent-box-runtime-wsl/src/.../client.py`）：它在读超时后
  发 `heartbeat`。而一轮 prompt 在飞行中时，Server 阻塞在
  `SidecarEnvelope.request({"op":"prompt"})`（最长 600s），**没有任何线程在给 Worker 发帧**，
  于是 adapter 只要静默超过 5 秒就会被取消。
- **第一手复现（本次，一次性探针，未入库）**：同一 fixture 驱动在 `prompt` 里静默 8 秒，
  经真实 Server→Core→sidecar→c4 Worker+bwrap：
  - 生产默认（`lease_ms=5000`）：轮次被取消，Server 侧最终以
    `WorkerError: attempt does not accept stdin writes` 结束（关闭阶段 abort 也写不进去）；
  - 同一代码同一静默，仅把 Worker 租约设为 `lease_ms=120000`：两轮全部 `completed`，
    checkpoint `resumable=true`、native id 稳定、state 回投正常。
  两者只差租约，故因果明确。
- **为什么既有门没暴露**：Pi/Hermes/OpenCode 的假端点**立即**应答（首 token 与增量都在毫秒级），
  每轮静默远小于 5 秒；Windows r4/41 的 fixture 同样是即时应答。真实 DeepSeek 调用在首 token
  之前就可能超过 5 秒（网关排队、长思考、工具前延迟），因此**四家真实模型门会大面积踩中**。
- **影响面**：通用（与 Harness 家无关）—— ACP 路径与 native driver 路径同样中招；这不是本阶段
  两家封装各自的缺陷，而是 Server↔Worker 的租约契约缺口。
- **本阶段处置**：**如实登记、不在本阶段扩范围修复**（修复涉及 `src/agent_box/server/**` 与
  `plugins/agent-box-runtime-wsl/**` 的租约/心跳契约，需要自己的回归与 Windows 复验）。
  候选修法（未实施、未验证）：在 `SidecarHarnessPort` 等待某个可能长时间静默的操作期间，由
  `_WorkerChannels` 所在层按 `lease/3` 周期发 `heartbeat`（与 `wait_terminal` 同一机制），
  并补上"客户端存活但 adapter 静默"的参数化测试；或由部署显式声明更长的租约。
  **在修好之前，四家真实模型门不得启动。**

