# BC 后端公开接缝事实表（v1，2026-09-23 亲读基线 92a2d2ba）

供 F1/S 接缝表对照与 C 契约裁决引用。全部为本会话源码实测（file:line 为基线 SHA 下位置），非文档转述。与 S（F1+S 联署表）冲突时以双方亲读行号复核。

## 0. 双传输面并存（重要事实）

- **wire RPC**：`POST /wire/v1/{method}`（`server/transport/http/app.py:148`）＋ **WS** `/wire/v1/event-stream`（app.py:356，EventFrame JSON，cursor 批量续传 `runtime.wire.event_stream_batch(session_id, cursor)` app.py:375）。
- **旧 REST 面** `/api/v1/*`（app.py:232-407：readiness/credentials/connections.probe/browse/workspaces/profiles/sessions/sessions.{id}/turns/sessions.{id}/events(SSE, app.py:328-354)/turns.{id}/cancel）。
- WIRE_VERSION=`wire/1`（wire/handlers.py:38）。`server.hello` 有 `clientVersions/clientPresentationSupports` 协商。**契约版本裁决归 C**；本表建议 FE 只走 wire/1＋WS，REST 面视为既有兼容层，不新增依赖。

## 1. wire 方法目录（handlers.py:40-138 `_PARAM_SHAPES`，全量）

闭环相关核心：
- 连接/发现：`server.hello`、`workspaces.open/list/browse/archive/gitStatus`、`executions.list`、`accounts.*`
- 会话：`sessions.list`(workspaceId 过滤＋page cursor)/`update`/`archive`/`switchProfile`、`sessions.createAndSend`(requestId,workspaceId,profileId,overrides,message→outcome/session/executionId/configVersion；幂等 digest＋replay 语义 handlers.py:2017+)、`sessions.send`、`sendOutcome.query`、`queue.get/withdraw`
- 运行控制：`runs.stop`(requestId,sessionId,executionId)、`approvals.decide`(approvalId,expectedVersion,decision,scope)
- 历史：`history.snapshot`(sessionId＋cursor/page)
- 非闭环面（本轮禁用扩张）：profiles.*/providerModels.*/assets.*/hooks.*/config.*/usage.* ——存在即存在，FE 不注册入口（章程"隐藏 model/provider"一致）。

## 2. 事件 kinds（wire/projection.py:24-37，单一投影表，注释明言旧文档"八种"已失准）

`message.delta, message.final, usage.updated, thought.delta, plan.updated, mode.updated, tool.update, approval.requested, approval.settled, config.changed, execution.state, queue.updated, workspace.connection`
- 内部→wire 映射见 WIRE_KIND 表（projection.py:53+；`turn.accepted/turn.state`→`execution.state`）。
- 执行态归一：queued/dispatched/running/completed/failed/**stopped**/**unknown**（projection.py:76-83；`capturing`→running；注释：late cancel 保 terminal fact）。→ 满足章程"停止确认/unknown 如实显示"，**无需新造**。
- 思考：仅 `thought.delta`，服务不提供即无帧（能力不伪造与 facade.readiness `capability_claims` 一致，service/facade.py:46-77）。

## 3. 断连/回放/隔离

- 事件持久化为按 session 的 seq 序列；`CursorCodec` 签名 cursor 绑定 session_id＋seq（wire/envelope.py:70-114），live 续传与 backward 翻页 cursor 互斥（handlers.py:2225-2233）。跨会话事件凭 `expected_session` 校验拒读——**旧事件隔离已在协议层**。
- SSE 唤醒用进程内 EventNotifier（events/notifier.py，纯 condition）；WS 每 session 批量拉取。

## 4. 会话执行目录（章程缺口）

- `SessionService.create_session` 要求 `body["workspace_id"]`（service/sessions/service.py:50-53）；`sessions.createAndSend` 同样必填 workspaceId（handlers.py:2018）。**基线无"独立会话/临时目录"概念**：一切会话挂 workspace（workspace=环境 kind/host/user＋normalizedPath）。
- 章程"独立会话执行目录明确"两案（供 C 裁）：A) FE 侧先 `workspaces.open` 一个用户不可见的专用目录（零后端改动，语义＝工作区即项目，需 UI 不列为项目）；B) 后端加 ephemeral workspace 支持（改 wire 语义＝扩面，违背最小改面）。**本方建议 A**，待 F1/F2/S 接缝表核对。

## 5. 停止/切换语义

- `runs.stop` → lifecycle 三态 cancel（execution/lifecycle.py：cancel_lock/cancel_confirmed；observation 分类＋evidence append，E2b 已闭单实现机）。切换会话＝FE 改 selectedSessionId，wire 层无任何隐式 cancel 调用——**切换不等于取消在协议上成立**，FE 只要不调 runs.stop 即保持运行。
- "运行或待审批时禁切 Harness"判定源：`executions.list`＋`execution.state` 帧＋session 的 profile/harness 绑定（sessions.switchProfile 存在＝同会话换 profile 是既有语义，Harness 切换=profile 维度，服务事实可由 in-flight execution 判）。

## 6. C-0010 两问答案（reply_to=C-0010 并入，2026-09-23 亲读）

**Q1 项目目录权威接口（F2×S）**：现成只读面即够用——`workspaces.list`(includeArchived)＝后端权威工作区列表；`workspaces.browse`(requestId,environment,path)＋`/api/v1/connections/probe|browse`＝目录选择（环境探测后浏览）；`workspaces.open`＝确认选择。REST GET `/api/v1/workspaces`（app.py:295）同形。**最小缺口≈0**：FE 轻量项目选择可直接消费 workspaces.list＋browse，不需新接口、不建项目管理平台。缺口仅命名语义：wire 里"项目"＝workspace 记录（含 environment kind/host/user＋normalizedPath，projection.py:91-107），F2 需按此形消费。

**Q2 Harness 切换闸**：
- (a) **跨 Harness 混排**：事件流按 session 隔离（cursor 绑 session_id，envelope.py:70-114），会话同时只绑一个 profile（session→profile_id 单值），且 **`switch_profile` 在存在 active execution 时服务端直接拒绝并回旧链接**（service/sessions/repository.py:296-326 docstring "refuse while an execution is running"）——混排在服务端已被拒；残留风险＝"待审批但 run 仍 active"窗口本就被同一守卫覆盖。审批 pending 时 execution 未终态→active，故闸成立（待 H/E 用 Pi/Codex 夹具复核"active"列定义恰含 awaiting-approval 态）。
- (b) Pi/Codex adapter 完备性：两包不在基线（be-baseline-audit §3），本问移交 H 域批后验证；`AgentSnapshot.runs 仅存最后一 run`属 FE 投影问题——后端权威面是 executions.list 台账直读（handlers.py executions_list："straight from the ledger"，有界行数、超限类型化拒绝），**不受 FE 快照只存一 run 限制**。
- (c) **更权威 busy 信号＝有**：`executions.list`（wire 全量在跑台账）＋`execution.state` 帧（7 态含 unknown）＋switchProfile 服务端拒绝＝三保险。建议契约：FE 闸用本地 runs/interactions 预测，服务端拒绝/台账为最终事实，UI 如实回退（与"不能凭页面猜"一致）。queue.get 另提供待排队目。

## 7. 缺口/待他组事实（本组不越权定）

1. Pi/Codex 接入包不在基线（见 be-baseline-audit §3）——H 域批文候发。
2. wire 物理包 S2c2 未合：不阻塞 FE 接线（方法面在 server/wire 即公开面）；仅当 HD-001 要改 wire 实现才申请独立批。
3. `approvals.decide` 的 scope 值域、`tool.update` 载荷形、`plan.updated`/`mode.updated` 各 harness 实际是否发——需 H/E 用夹具或真实链验证后登记。
4. profile↔harness 绑定与 `credential_registered`→available 判定（facade.py:53-66）＝"连接区域二级选择 Harness"的数据源候选，等 F1 事实表对齐。

## REST 兼容层 seeding 调用面事实（2026-09-23 01:21 BC 实测 @92a2d2ba，配 BC-0014 口径修正）
- 鉴权＝Authorization: Bearer <runtime.token>（app.py:131,142）；每个写操作必带 Idempotency-Key 头（1..160 字符，缺失=IDEMPOTENCY_KEY_REQUIRED 400，app.py:135-140）。
- POST /api/v1/workspaces（:290，body=WorkspaceRequest≡BrowseRequest）→ POST /api/v1/profiles（:300；ProfileRequest 必填 name/harness_type/configuration，credential_id 可空——REST 形与 wire profiles.create 的 {requestId,displayName,harness} 字段名不同族，脚本按各自 schema 用）→ POST /api/v1/sessions（:309；SessionRequest 仅 workspace_id+profile_id，纯创建零派发，实证 BC-0014 §3）。
- 发消息另走 POST /api/v1/sessions/{id}/turns（:319；TurnRequest.text 1..4096）——R1 边界内脚本**不得**触 turns。
- 注意：workspace 创建是否 seeding 必经前置（sessions 需 workspace_id）——REST 链＝workspaces→profiles→sessions 三步；wire 链 profiles.create 不涉 workspace。H 脚本选择面以 C 对 BC-0014 的裁定为准。
