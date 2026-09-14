# Work Order 41 — 核心产品合同与后端独立验收

日期：2026-09-14。当前状态：**`BACKEND_WINDOWS_R4_READY`**（Windows r4 平台门通过；整体后端仍非
READY，**未登记** `BACKEND_IMPLEMENTATION_READY`）。
分支 `feature/server-harness-extension-v1`。三个 r4 相关检查点必须分开，不可互相替代：native-state
实现基础为 `3e4282b`、r4 验收脚本/测试代码检查点为 `713b2e3`、已提交脚本上的 r4 复跑证据检查点为
`87b17a3`；另列 25方法/Windows基线检查点 `72d6258`。`3e4282b` 只是 native-state 的实现基础，**不是**
当前 r4 后端检查点。此结论只代表后端独立门，不代表真实模型或全栈 Green。41 全程使用显式 no-model
ACP fixture，未读模型凭据、未发模型请求，费用 ¥0；42 已有费用账继续单独累计（累计 1 次/12 tokens/
`<¥0.01`，上限 ¥10；本阶段增量 ¥0）。

## E2 — Windows r4（`BACKEND_WINDOWS_R4_READY`）

2026-09-14 单次执行 `scripts/server-round1/accept-e.ps1 -Port 18744 -Cleanup`，退出码 0：
Windows `py.exe -3.12`（Python 3.12.10）启动真实 Server，真实 `wsl.exe` 启动
`sha256:bb90e346bbd857f02eba8d267f47c3ce793d30c9894ca823dc09c482d886f5eb` 的 release Worker，
经 bwrap 运行两个显式 no-model fixture（广覆盖 `fake_acp_peer.mjs` 与有状态
`tests/server/fixtures/stateful_acp_peer.mjs`），wire 为锁定的 28 方法生成工件
`sha256:5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed`。完整脱敏 JSON 与逐项
证据见 [fullstack/progress.md](fullstack/progress.md) 的 r4 小节，要点：

- 保留的旧门全部通过：Workspace、Profile/Provider-Model 维护、配置描述/拒绝、附件投递、
  终止前增量、正式 WebSocket cursor、取消、审批、归档、历史保留。
- 有状态门：第一轮写入固定 nonce 并 completed；从 Windows DataRoot ObjectStore 直接读取 Server
  返回的 checkpoint（schema 2、`resumable:true`、`harnessType` 与 Profile 一致、files 的
  path/size/digest 合法且能在 ObjectStore 命中、内容摘要与 Server 给出的 digest 一致）；该
  checkpoint 元数据经 Server 的 Session REST read projection（`GET /api/v1/sessions/{id}`）读取，
  不是 wire 方法（wire 没有 `sessions.get`）。
- 停止与重启语义：本轮实际 `stop_mode=tree_terminate`，即 `taskkill /T /F` 的**有界进程树强制终止**，
  不是正常/graceful 关闭；它验证的是强制终止后的崩溃式重启恢复。重启后 DataRoot 锁的持有实例由
  `server_6dd995a9dfd14795b6ad975f249ae9e9`（第一次停止后）变为
  `server_79296dd8029948d0bf7c18bff0ae24cf`（最终停止后），证明锁已释放并被重启实例重新获取，而稳定
  server_id `server_639bc04679554c66ac6b1e77661e70f1` 不变。
- 第二轮经正式 wire `sessions.send` 恢复同一 native id、fixture 记录 ACP 动作为 `session/resume`
  （非 `session/new`）、回出首轮 nonce，且 `message.delta`（seq 10）先于 completed（seq 12）。
- 清理：DataRoot 按 owner marker 删除、WSL workspace 删除并断言不存在、端口无监听、无残留
  Server/Worker/sidecar 进程、Worker views/secrets 无残留；随后独立进程 `-PostCheck` 再次复核通过。
- 反例：无 marker / marker 不匹配 / reparse 目标 / 非目录拒绝清理；不可用 checkpoint 的 5 种变体
  必须失败且不得新造 native 会话或静默成功。

本节边界：r4 证明的是 `tree_terminate` 有界强制树终止后的**崩溃式重启**、DataRoot 锁释放/重新获取
与 native `session/resume`；正常 Desktop/Server 生命周期退出（graceful 关闭路径）与最终清理仍保留为
后续全栈最终验收项，本轮不宣称已覆盖。

两个必须记录的工件更正：

1. 工作令指定的 `.acceptance-bundle-c2`（`sha256:08e4e057…`）早于 interactive channel 协议升级，
   与当前客户端 bootstrap 不兼容（旧 Worker 报 `invalid bootstrap`，Server 侧为 `WORKER_UNREACHABLE`）。
   r4 实际使用从当前源码重建的 `.acceptance-bundle-c3`，digest `sha256:bb90e346…`，与 r3 证据一致。
2. 广覆盖 fixture 原先不声明 model 目录，sidecar 的模型门因此拒绝配置的模型
   （`SIDECAR_OP_FAILED: Harness model is not available: fixture-model`）；fixture 现声明其唯一接受的
   `fixture-model`，模型门在真机链路上被真实走通。

另外，此前把 `pi`（权威 journal 档案）的无模型双轮门记作 ACP `session/resume` 是不准确的：
该档案重开走 `session/load`。r4 的有状态 fixture 绑定无 journal 的 `hermes` 注册键，才真正验证
`session/resume`；两种行为现在都有断言。

## A — 单一 wire 合同（当前增量）

前端随后在同一权威补齐已批准的 Session目录/维护、消息角色与用户消息、history双游标、queue事件
及发送结果回查，并以 `3aba5c5c` 提交队列终态修订，总计28方法。当前 TS 摘要
`11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035`，生成工件
`5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed`。后端直接按工件
**29/29通过**，当前摘要已锁定，精确确认见 [wire-review.md](wire-review.md)。Windows 平台门已通过
（r4 见下节），但整体 `BACKEND_IMPLEMENTATION_READY` 仍未登记：Pi/Hermes/OpenCode 生产封装与四家
真实模型门待完成，前端双门也未满足。

### 已完成的25方法稳定基线

后端没有另造协议，直接消费前端执行树 `9881bb821176ecb59a5e71f32cdd9493fd065f6e`
的同源 TS/JSON Schema。双方接受记录见 [wire-review.md](wire-review.md)，锁定状态为
`WIRE_LOCKED_FOR_IMPLEMENTATION`：

| 工件 | 完整 SHA-256 |
| --- | --- |
| TS 权威 | `2874fae7c763a6e7fb488159bccc64903458ec6e4c3310ba306a4e0faa0060a9` |
| 生成 JSON Schema | `c9be8a63097aa6b1658da3b3450b669e128ed1f314780c93841fd34a52e3145a` |

真实 handler 在该生成工件下 25/25 通过，覆盖所有 HTTP JSON-RPC 请求/结果/错误；正式事件订阅为
认证 WebSocket `/wire/v1/event-stream`，帧使用同一 `EventFrame` 与持久 cursor。旧 SSE 只作历史
兼容面，Desktop 不需要接它。

## B — 资源、Profile 与 Provider/Model

- Workspace 以环境身份与规范路径识别，连接私有；附件先经真实 Worker `workspace.get` 做范围、
  canonical path/symlink、8 MiB 上限和摘要校验，再进入本机 ObjectStore。公开投影不泄露对象摘要。
- Profile 已有 `profiles.list/create/update/archive/updateConfig`；记录 `version` 与
  `configVersion` 分离，全部写入幂等且 CAS。归档不删除 Session/历史/项目或 native 数据；新执行
  拒绝使用已归档 Profile。
- Provider/Model 已有 `providerModels.list/create/update/archive` 与独立持久资源；Harness/provider
  均作 opaque 数据，credentialId 只是 SecretStore 引用。配置拒绝敏感控制名/字段，模型槽用
  `{providerId, modelId}` 稳定引用；被活跃 Profile 引用时归档返回 `CONFLICT_REFERENCE`，不静默替换。
- `config.describe` 对模型槽返回后端验证的 availability；保存成功和模型可运行性分开。Harness
  默认/校验仍由注册扩展提供，Server 无品牌分支。

数据 schema v5 非破坏迁移：在 v4 的 Profile/执行/Provider-Model 基础上增加 Session `pinned`、
队列公开消息投影与 gap-free wire 序号；v1→v5 连续迁移与二次初始化通过。

## C — 会话、队列、事件、审批与取消

- 首发在单事务中保存 Session、消息、执行及幂等回执，事务提交后唯一 owner 才派发；接受前失败
  不造空 Session，接受后启动失败保留事实。
- 排队项冻结消息、Profile、configVersion 与 effective config digest。正常完成在同一终态事务中
  claim 下一项并创建执行，清理前任隔离投影后续派；失败或确认取消则暂停所有 pending 项。
  回归直接证明后续 Profile 改动不会改写已排队配置。
- `message.delta` 在终止前抵达 Server 并先持久化再通知；快照/cursor 与 WS 续流无窗口丢失，
  越界/过期明确要求 resync。
- sidecar permission request 先进入 Server 审批仓储，再返回 native adapter；版本、operation、
  expiresAt 与决定均持久化。首个有效决定胜出，运行终止后不能批准。
- 停止为请求→sidecar/原生确认→`cancelled`；停止意图先持久化。完成/取消竞态由每运行锁裁决，
  无法确认不报已停止。Worker 断连主动唤醒 owner 并持久化 `WORKER_DISCONNECTED`。

## D — Core、Worker、隔离与恢复

生产装配入口 `build_runtime_from_sidecar_deployment` / CLI `--sidecar-deployment` 实际路径为：

```text
Windows Server → SessionService → Work Core → Harness extension port
  → wsl.exe / real Worker ABW1 interactive → bwrap
  → vendored harness-remote sidecar → native adapter
```

Worker 只持有带生命周期的运行投影；Server 是 Session/Profile/队列/事件权威。每个执行保存 Core
work/execution/dispatch identity 与原生 Session id。`399d78d` 已把摘要固定的 adapter/native executable、
只读非敏感配置、完整官方目录和一次性凭据接入同一生产链。`3e4282b` 进一步增加部署声明的唯一可写
native-state 子树：sidecar 结束前先关闭原生 adapter 促使其落盘，再由 Worker 的 `view.list/view.get`
在 256 文件/8 MiB 总量内回读，逐文件验证路径、size、offset 与 SHA-256，并拒绝出现本次凭据原文。
Server 把文件作为不可变对象保存，在 schema 2 checkpoint 中绑定 harness/native id，下一 turn 只从
Windows ObjectStore 校验后回投；Harness 类型切换不会误用旧状态。Core 与 Server 没有新增品牌分支。

真实无模型门使用两个全新的 sidecar/ACP 进程：首轮 fixture 把 nonce 写入隔离 `$HOME/sessions`，首个
checkpoint 为 `resumable:true`；第二轮必须从回投状态列出并以 `session/resume` 打开同一个 native id，
然后回出首轮 nonce。该门真实经过 Server→SessionService→Core→Worker ABW1 interactive→bwrap→sidecar，
并断言第二轮 `message.delta` 序号早于 completed、最终 Worker views/secrets 均清理。Server 重启仍把
未完成执行封为 unknown/recovery_required；Worker 失联、投影回收和清理失败均有持久状态。

## E — Windows 独立验收

入口：`scripts/server-round1/accept-e.ps1`。最终轮使用 Windows `py.exe -3.12` 启动真实 Server，
由真实 `wsl.exe` 启动 digest 固定的 release Worker，再经 bwrap 运行显式 no-model ACP fixture。
验证了 hello、Workspace、Profile/Provider-Model 维护、配置描述/拒绝、附件投递、终止前增量、
WebSocket cursor、取消、审批和清理。28方法增量后又在隔离 r3 重跑，并新增验证 Session目录、
置顶/重命名/归档及归档后历史保留、用户消息角色恢复。结果：

```json
{"result":"BACKEND_41_E_WINDOWS_WSL_WIRE_OK","windows_server":true,"distribution":"Ubuntu","server_id":"server_9eab21747f244cdbadf90640c9225237","workspace_id":"ws_62b4cf6c24144f09aba84e61d75a9994","session_id":"session_d4b2dce5deae4bc487d005b2e182dc96","attachment_execution":"execution_81921ef3716149f7b59df6fe91d64d5d","cancelled_execution":"execution_4405d51ef2624043a90e620c51ff6b89","approval_execution":"execution_6d114a16de354c85ad3c0e94a14866f5","profile_id":"profile_4c5c25e96dbc4e6f9ccd1daf170c25fe","provider_model_id":"provider_6c195f2d68c744ccb86910780dbb300e","wire_event_stream":"wire.eventStream/1","worker_digest":"sha256:bb90e346bbd857f02eba8d267f47c3ce793d30c9894ca823dc09c482d886f5eb","fixture":"explicit no-model ACP peer"}
```

退出后复核（r3端口18743）：Windows data root=`false`、端口监听=`false`、WSL workspace cleanup exit=0，且无
Worker/Server/sidecar 残留进程。WSL 输出含本机 NAT/localhost 警告乱码，但进程 exit 0、所有断言通过。

首次尝试把 manifest 放 `/tmp`，Windows UNC 不可见，脚本在服务/数据创建前 exit 1；改为同一用户
缓存目录后通过。没有绕过权限或把此误记为平台阻断。

历史轮说明：r3（端口 18743）为旧代码证据；r4 的验收脚本/测试代码检查点为 `713b2e3`，其证据是在该
已提交脚本上复跑取得（记录检查点 `87b17a3`），运行在 `3e4282b` 的 native-state 实现基础上并关闭 41
平台门；`3e4282b` 本身不是 r4 检查点。但整体后端 READY 仍受 Pi/Hermes/OpenCode 生产封装、逐家真实
模型门与前端双门约束，见 [fullstack/progress.md](fullstack/progress.md)。

## 最终验证账

```text
AGENT_BOX_WIRE_SCHEMA=<d3f74127…28方法生成工件> pytest tests/server/test_wire_v1.py
→ 28 passed（队列终态门加入前）

pytest tests/server/test_wire_v1.py
→ 29 passed；对当前schema定向执行终态门按预期1 failed，唯一差异为缺completed枚举

pytest tests plugins/agent-box-runtime-wsl/tests plugins/agent-box-harnesses/tests
→ 270 passed, 4 skipped, 0 failed

node --test plugins/agent-box-harnesses/tests/harness_remote/*.test.mjs
→ 25 passed, 0 failed

cargo fmt --check && cargo test --locked --release
→ 4 passed, 0 failed

python -m pytest -q tests plugins/agent-box-harnesses/tests plugins/agent-box-runtime-wsl/tests \
  plugins/agent-box-sandbox-bwrap/tests plugins/agent-box-runtime-local/tests
→ 348 passed, 4 skipped, 0 failed（r4 增量后）

python -m pytest -q tests/server/test_harness_sidecar.py -k "state_projection|unusable_checkpoint"
→ 7 passed（ACP resume 门 2 + 不可用 checkpoint 反例 5）

node --test scripts/server-round1/model-validation-42d.test.mjs
→ 4 passed, 0 failed
```

4 个 skip 是既有平台/显式环境条件项，未扩大。本轮增量全套首次命令再次因 `PYTHONPATH` 漏
runtime-local/skills 等插件目录在收集期 7 errors、0 tests，补齐全部插件 src 后取得270/4；
原25方法基线曾有一次收集期21 errors、0 tests；一次 Node 从 Worker 子目录展开通配符
得到 0 tests，回仓根重跑取得 25/25。两次命令错误均不计作通过。

### 28 方法队列终态重锁（12:15）

前端提交 `3aba5c5c` 后，TS 权威摘要为
`11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035`，生成工件摘要为
`5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed`。后端直接读取该工件执行：

```text
AGENT_BOX_WIRE_SCHEMA=<5d4fa3bf…前端生成工件> pytest -q tests/server/test_wire_v1.py
→ 29 passed in 67.57s
```

新工件接受 `completed/failed/cancelled` 终态事件，同时将 `queue.get` 限定为活动三态；此前唯一
schema 失败关闭。当前 wire 已恢复 `WIRE_LOCKED_FOR_IMPLEMENTATION`。Windows r3 证据仍有效，
但按本轮调度另跑 r4 重确认后才关闭41平台门；这不替代42-D逐家真实验证。

## 终态边界

`72d6258` 已满足当时25方法的 `BACKEND_IMPLEMENTATION_READY`；当前同一合同的28方法及队列终态
已经锁定。`502f4b5` 又补齐了 Provider/Model 精确版本冻结、Provider credential 优先解析、
SecretStore 按 locator 读取、Worker `secret.put` 一次性帧、bwrap 固定只读秘密挂载、adapter 声明式
环境注入以及所有退出路径的 `secret.cleanup`；模型进入 sidecar `create`/`prompt`，密钥不进入 argv、
普通对象或事件。相关回归为 Server 45 passed、Worker/bwrap 32 passed、Node envelope 4 passed。
这些是代码/组件证据，尚未冒充真实 Harness 模型证据。r4 相关检查点为 native-state 实现基础
`3e4282b`、r4 验收脚本/测试代码 `713b2e3`、已提交脚本上的 r4 复跑证据 `87b17a3`；41 的独立
Windows 门已由 r4 对锁定工件与最新 native-state 路径重确认（见 E2），且 r4 的停止路径是
`tree_terminate` 有界强制终止，不是正常退出。整个后端 READY 仍另受四家生产封装/真实模型门约束，
当前**未登记** `BACKEND_IMPLEMENTATION_READY`；`workbench_model_verified_count=0`（四家真实模型验证
数仍为 0），累计费用 1 次/12 tokens/`<¥0.01`（上限 ¥10），本阶段增量 ¥0。
四家组件仍保持 40 的
`COMPONENT_VERIFIED / MODEL_NOT_VERIFIED` 分账。Pi/Hermes/OpenCode 的 DeepSeek Provider 配置与
独立真实模型门以及 Codex 官方 Responses 隔离配置验证进入 42-D；前端仍由其独立 writer 施工，当前不具备跨仓
写权，未执行全栈联调。前端只读观察（2026-09-14 14:24 +08:00）：HEAD `b02093ce`、
`frontend_implementation=PARTIAL`、`writer_lease=ACTIVE`、工作树 dirty，详见
[fullstack/progress.md](fullstack/progress.md) §A。

### Native state / 官方 Codex 隔离配置增量（13:24）

- 代码检查点：`3e4282b3f0b113a2573354c94465d872ac9a95e4`。
- 无模型配置读取门：真实 Worker→bwrap→`codex-acp 1.1.14`→Codex app-server `0.147.0` 成功读取
  AgentBox 隔离 `config.toml` 与官方完整 `models.json`，只执行 register/start/create 后退出；使用测试值
  而非授权密钥，结果 `CODEX_ACP_APP_SERVER_CONFIG_READ_OK`，未发送 prompt、未产生付费请求。首次使用
  已有临时 root 时按预期拒绝 `worker root owner marker is missing`，改用新的受管子目录后通过。
- 受影响 Server 全套：`98 passed, 1 skipped`；WSL runtime+bwrap：`43 passed`；本阶段定向 Python：
  `71 passed`；sidecar/四家 Node 合同：`13 passed`；`py_compile` 与 `git diff --check` 通过。
- wheel 构建确认同时包含 76107 字节官方 `deepseek-models.json` 与 332 字节
  `deepseek-sidecar-config.toml`。配置固定 `deepseek-flash`、DeepSeek 根 URL、Responses、high reasoning、
  disabled web search 及隔离内绝对 catalog 路径，不含 token/bearer。
- 本阶段未读取授权 locator、未发真实模型请求、未运行 Windows build；42 累计费用仍为 1 次/12 tokens/
  `<¥0.01`。
