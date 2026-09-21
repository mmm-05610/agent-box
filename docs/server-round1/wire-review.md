# Wire 反馈（后端 → P07/前端）

维护者：后端执行者（39–42）。用途：在双方锁定单一 wire 前交换事实与约束，
避免两边各造一套协议。此处只写后端事实与差异请求，不批准前端合同。

## 2026-09-15 22:1x +08:00 · `profiles.create` 增加可选 `credentialId`（合同增补，两端重锁）

真实 UI 模型门发现：**Hermes 无法从产品路径被授权**。Hermes 的部署按既有设计不声明 model 控件
（0.19 不播发 configOptions），凭据只能挂在角色上；而 `profiles.create` 没有这个字段
（`profiles/service.py` 的 `create_wire` 硬编码 `credential_id: None`），角色永远拿不到凭据，
派发被 `CREDENTIAL_REQUIRED` 拒绝。另外三家有 model 控件，凭据随所选 Provider/Model 配置进入
执行上下文，故掩盖了它。（历史四道后端门建角色走的是保留 REST `POST /api/v1/profiles`，
那条路接受 `credential_id`，所以门的结论"带真实凭据时链路可跑通"为真，但未覆盖产品自己的路径。）

后端已实现：`profiles.create` 的 `credentialId` **可选且可空**（缺省/`null` = 角色不携带凭据；
给值时校验存在性与 kind 与 Harness 声明一致，否则类型化拒绝）。前端新增同形可选字段并重生成工件：

| 工件 | 新摘要 |
| --- | --- |
| TS 权威 `apps/desktop/src/types/wire/wire-v1.ts` | `774640498429ca9f501dcddd3c7f434e58af3c60a7360578e0387e8aca356276` |
| 生成工件 `generated/wire-v1.schema.json` | `14f7f73605bb6f048a09a8e7faa93f15ca77d4d66a0b38439a9e9cf2bc6428c7` |

后端对**新工件**跑 `tests/server/test_wire_v1.py`：**32 passed**（含本次新增用例）。
旧摘要（`11e3b3e7…` / `5d4fa3bf…`）标记为**已被本次增补取代**，不再作为锁定值。

## 2026-09-15 19:40 +08:00 · 事件层补齐与两处声明-生产者缺口（只登记事实，不改合同）

后端在不改 28 方法的前提下，把 schema 门扩到**事件帧**层：`tests/server/test_wire_v1.py` 新增
`test_every_projected_frame_matches_the_strict_frontend_event_schema`，驱动真实生产者（排队发送、
审批请求与决定、sidecar 桥写入的增量与工具事件），把 `history.snapshot`（走 `olderCursor` 向旧翻页）
与实时批量两条路径的每一帧都拿前端的 `EventFrame` 校验。前端 `EventFrame` 是
`additionalProperties: false` 的严格对象、事件联合的 `state`/`role`/`decision` 均为闭枚举，
所以一个多余字段或一个枚举外取值就会打挂真实客户端，而方法级测试仍然全绿。
**带工件跑法**（`AGENT_BOX_WIRE_SCHEMA=<生成工件>`）才校验 schema：**30 passed**；
**不带工件**的同一文件也 **30 passed**，但那条路径只断言帧的六个信封键与事件 `kind`，
**不足以支持 schema 结论**——两种跑法分别记账，不互相替代。
结论（仅由带工件的跑法支持）：**后端当前产出的帧全部满足该严格 schema**。

同时登记两处“合同已声明、后端无生产者”的缺口，供前端在锁后修订或由后端补生产者时对齐：

| 事件 kind | 前端声明 | 后端事实 |
| --- | --- | --- |
| `workspace.connection` | `semantics-map.md` “环境准备/浏览…进度走 `workspace.connection` 事件（connecting/preparing[worker\|harness]/failed+reason）” | 后端**没有异步准备阶段**：`workspaces.open` 通过 connector probe 同步验证（`workspaces/service.py:145`），重启把全部工作区标为 `unverified`（`bootstrap/runtime.py:175`）。**没有任何生产者**写这个 kind；记录里只出现 `{state:"connected"\|"connecting"}`（`wire/projection.py:73`），`preparing[*]` 与 `failed+reason` 不可达 |
| `config.changed` | `wire-v1.ts:468` 声明 `effectiveFor: next_send\|immediate`；`wire-session-projection.ts:155` 用它更新 `configEffectiveFor` | 投影支持（`wire/projection.py:237`）。**生产者已补（2026-09-15，合同内实现缺口，不改 28 方法）**：`sessions.switchProfile` 确认成功后在同一事务写入 `config.changed{effective_for:"next_send"}`（`sessions/repository.py:273` 起），重放请求在写入前返回、不重复发；正在运行的会话本就拒绝切换，故 `immediate` 在本后端不可达（配置按执行冻结）。`profiles.updateConfig` **仍未发事件**：它改的是 Profile，受影响 Session 在下一次发送时使用新版本；若前端需要该路径也有事件，请反馈（后端可对绑定该 Profile 的未归档 Session 逐条追加）。 |

同轮按前端合同的**语义**（不只是形状）逐条核对，另发现并修复一处：`execution.state` 的停止相位。
core v1 §6 要求 request → stopping → confirmed 三事实分离，前端 `wire-session-control.ts:133` 的
stop phase **正是**由 `state === "stopping"` 的帧驱动；而后端 `record_cancel_request` 写的事件里
`state` 是请求到达时的原状态（`sessions/repository.py:667`），投影又只查 `_EXECUTION_STATE_MAP`，
于是取消一个 running 执行时客户端收到的是 `running`，停止相位直到终态帧才出现。**已修**：投影在
`cancel_requested` 为真时发 `stopping`（终态 `stopped` 仍是唯一确认，测试断言未确认期间不出现
`stopped`）。前端无需改动。

仍未闭合、需要前端或集成阶段裁决的两项（后端不猜）：
① `workspace.connection` 无生产者（本轮上文，含会话作用域的结构性理由）；
② **`tool.update` 只有失败用例**：全链只有 `sidecar_backend.py:306` 在 harness 失败时写一条
`state="failed"` 的 tool.update，`sidecar.py` 的端口事件词汇只有 `started/message.delta/failed/
approval.requested`，**没有任何工具进度（requested/running/completed/denied）映射**。前端
`tool.update` 的状态枚举与 UI 工具时间线依赖它。ACP 的 `tool_call`/`tool_call_update` 是
agent→客户端方向的通知，现有门内的审计 shim 只记录 client→agent 方向，**本轮无法从既有证据判定
四家是否真的播发工具调用**；需要一次"强制工具调用"的提示（例如“列出工作区文件”）并观测是否出现
原生工具通知，才能判定是后端漏映射还是本来就无工具流——属集成阶段检查项，不在此处臆断。

补充核对（同轮，机械比对合同工件）：错误码家族集合**完全一致**——工件 `WireError.properties.code.enum`
的 12 个家族与后端 `wire/errors.py` 的 `FAMILIES` 集合逐项相等（无单边项）；后端内部码经
`family_for()` 收敛到该闭集，精确内部码保留在 `details.internalCode`，因此方法级错误信封不会打挂
前端。事件帧层已如上一段所述逐帧校验通过。

**一个必须由前端确认的结构事实**：`server_session_events.session_id` 是 `NOT NULL REFERENCES
server_sessions(id)`（`storage/database.py:116`），而 `EventFrame.sessionId` 必填——所以
`wire.eventStream/1` 的帧**始终属于某个 Session**。于是 `semantics-map.md` 里“浏览/打开阶段的
连接进度走事件”在无 Session 时无法成立：浏览阶段还没有 Session，也就没有可承载该帧的流。若要让
连接进度可观察，只能二选一：(a) 前端合同把浏览/打开阶段改为同步结果（后端现状），
`workspace.connection` 只用于“已有 Session 的链路在运行中变化”；(b) 引入会话无关的第二条通道
（新合同面，超出当前锁定的 28 方法）。后端不改合同、不猜语义，等前端反馈。

以上两条不影响已锁定的 28 方法摘要（TS `11e3b3e7…` / 工件 `5d4fa3bf…` 就地重算未变），
也不构成 `WIRE_LOCKED_FOR_IMPLEMENTATION` 的失效。

## 2026-09-14 12:15 +08:00 · `WIRE_LOCKED_FOR_IMPLEMENTATION`（28 方法 + 队列终态）

前端已在提交 `3aba5c5c8743401b964f80c88bd43e847fa3d5a8` 消费唯一待改项：
`QueueItem.state` 增加 `completed/failed/cancelled`，`queue.get` 改用只含
`pending/dispatched/paused` 的 `ActiveQueueItem`，客户端 reducer 对四种终态
`withdrawn/completed/failed/cancelled` 均移除活动投影。提交后的完整摘要与前端
`backend-response.md` 登记一致：

| 工件 | 双方锁定的完整 sha256 |
| --- | --- |
| TS 权威 `apps/desktop/src/types/wire/wire-v1.ts` | `11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035` |
| 生成工件 `generated/wire-v1.schema.json` | `5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed` |

后端以 `AGENT_BOX_WIRE_SCHEMA=<上述前端生成工件>` 直接校验 28 个方法、成功结果、错误信封与
终态事件：`tests/server/test_wire_v1.py` **29 passed in 67.57s**。此前唯一 schema 失败已消失，
没有新增差异。顶层 history `cursor` 继续只作实时恢复/订阅续点，`page.cursor` 只作向旧历史翻页；
后端拒绝二者同请求并以不同签名域解析，`resumeCursor` 与 `olderCursor` 不互换。该行为已属于当前
实现合同，无需再扩方法或另造 schema。

结论：当前 28 方法工件状态为 **`WIRE_LOCKED_FOR_IMPLEMENTATION`**。Windows r4 复验与前端
生产接线继续分别记账；它们不改变本节摘要，也不由本次 schema 门冒充。

## 2026-09-14 11:47 +08:00 · 28 方法提交已回归，等待队列终态机械更正

前端已将上一节草稿原样提交为 `b10e455f763b964b99b489b4e66cfd4ae50d86a7`；两份完整摘要仍为
TS `986889e47bcf5f25353bf8cb62afb009cd367ece7b90cbcbf8ce89bd5ed4c257`、生成工件
`d3f7412710e7e951674922aebdb72ffbb028fc76b2e353a86b53097fd02abe22`。

后端已实现并直接对该生成工件运行全部 28 个 wire 方法：`tests/server/test_wire_v1.py`
**28 passed**。这证明 Session 目录/维护、用户与助手消息形状、独立历史游标、发送回查和当前四态
队列事件的请求/结果均机械一致。随后新增真实队列终态门；不带 schema 时 **29 passed**，而对
当前生成工件定向运行按预期失败，唯一差异是：
`queue.updated.item.state='completed' is not one of pending/dispatched/withdrawn/paused`。

因此当前 28 方法提交状态是 **`WIRE_REVISION_PENDING_QUEUE_TERMINALS`**，不是实现失败或外部阻断；
除上一节所列最小枚举/reducer 更正外无新增差异。后端继续完成迁移、Windows 回归和其他独立任务；
前端在当前施工阶段自行消费反馈并提交新摘要即可。

## 2026-09-14 11:36 +08:00 · Session/history 当前候选核对（施工中反馈）

只读核对前端实际 HEAD `3f3bbb96f52e471925ff521fed3038a2c67278b3` 及其当前未提交候选；
前端 writer lease 仍为 ACTIVE，后端没有修改前端文件。当前草稿摘要（仅用于精确定位，**不是锁定摘要**）：

| 工件 | 当前工作树 sha256 |
| --- | --- |
| TS 权威 `apps/desktop/src/types/wire/wire-v1.ts` | `986889e47bcf5f25353bf8cb62afb009cd367ece7b90cbcbf8ce89bd5ed4c257` |
| 生成工件 `generated/wire-v1.schema.json` | `d3f7412710e7e951674922aebdb72ffbb028fc76b2e353a86b53097fd02abe22` |

`sessions.list/update/archive`、`SessionRecord.pinned`、发送结果的 `configVersion/queueItemId`、
消息的 `role/displayKind`、`tool.update.messageId` 与 history 的独立 `olderCursor` 都是
`core-semantics/1` §3、§6–§8 已批准语义的机械编码，后端接受其方向并在 41 内立即实现。
此前 25 方法摘要仍是双方已接受、已验证的稳定施工检查点；但既然同一 `wire-v1` 正在补齐
已批准 Session/history 覆盖，它不能冒充最终联调摘要。后端会在前端提交新权威后按新生成工件
回归并登记新的双方摘要。

当前草稿有一项会造成权威投影残留的机械缺口，结论为
**`CHANGES_REQUESTED_QUEUE_TERMINAL_ENCODING`**：

- `queue.updated` 目前只携带一个 `QueueItem`，而 `QueueItem.state` 只有
  `pending/dispatched/withdrawn/paused`；正常完成、执行失败或取消后，Server 权威队列不再包含
  已派发项，但事件没有任何合法形状能通知客户端移除它。当前 reducer 也只过滤 `withdrawn`，
  因而 `dispatched` 项会永久残留。
- 最小机械更正：把 `QueueItem.state` 增加 `completed/failed/cancelled`，Server 在对应持久化事务内
  发出最终 `queue.updated`，客户端从活动队列投影中过滤
  `withdrawn/completed/failed/cancelled`。`queue.get` 仍只返回活动
  `pending/dispatched/paused` 项。若前端更倾向显式 removed 事件，也可采用等价单一编码，不能把
  `completed` 伪装成 `withdrawn`。
- 正常完成并续派时，Server 必须先持久化当前项 `completed`，再持久化下一项 `dispatched`；
  失败/停止时先持久化当前项 `failed/cancelled`，再把尚未派发项逐项变为 `paused`。所有通知必须
  来自这些已提交事实，不能只靠 renderer 猜 execution 终态。

另请前端在 `backend-response.md` 消费本节时明确 history 编码：顶层 `cursor` 只作向前恢复/
订阅续点；`page.cursor` 只作向旧历史翻页，二者同请求出现应拒绝。后端将使用不同签名域生成两类
不透明游标，初始快照返回最新一页、按 `seq` 升序呈现，`resumeCursor` 指向同一数据库快照的事件
头，`olderCursor` 指向更旧一页；旧页游标不能喂给 WebSocket。该编码不改变已批准语义。

## 2026-09-14 11:21 +08:00 · `WIRE_LOCKED_FOR_IMPLEMENTATION`

前端已在干净检查点 `9881bb821176ecb59a5e71f32cdd9493fd065f6e` 消费下节
`CHANGES_REQUESTED_CORE_COVERAGE`，把 Profile 与 Provider/Model 维护加入原有同一份
`wire-v1`，总计 25 方法；没有产生第二份协议。后端逐项核对实际 TS 与生成工件并完成实现：

| 工件 | 双方锁定的完整 sha256 |
| --- | --- |
| TS 权威 `apps/desktop/src/types/wire/wire-v1.ts` | `2874fae7c763a6e7fb488159bccc64903458ec6e4c3310ba306a4e0faa0060a9` |
| 生成工件 `generated/wire-v1.schema.json` | `c9be8a63097aa6b1658da3b3450b669e128ed1f314780c93841fd34a52e3145a` |

后端以环境变量 `AGENT_BOX_WIRE_SCHEMA=<上述生成工件>` 直接验证真实 wire handler 的请求、
成功结果与错误信封：`tests/server/test_wire_v1.py` **25 passed**。新增门覆盖
Profile create/update/archive/updateConfig、Provider/Model list/create/update/archive、记录版本与
配置版本分离、模型槽稳定引用、归档引用冲突和秘密字段拒绝。已有 17 方法及正式 WS 事件流继续
通过同一工件。

结论：后端接受前端登记的上述两个完整摘要；前端 `backend-response.md` 已接受后端机械/安全项，
所以双方接受记录齐备，状态锁定为 **`WIRE_LOCKED_FOR_IMPLEMENTATION`**。这表示实现合同可稳定
施工，不替代各端独立验收或最终真实全栈验收。

## 2026-09-14 11:05 +08:00 · 检查点 3 摘要核对与核心维护方法补齐请求

只读核对前端执行树 HEAD `fffbf443dec52e6da0e3f979bdb545103028887d`；合同文件无
未提交改动（当时 dirty 仅 P03 send-intent 三个新文件）。当前权威与生成工件的完整摘要为：

| 工件 | sha256 |
| --- | --- |
| `apps/desktop/src/types/wire/wire-v1.ts` | `793bc995fd8199df5dfbc4b5a942a29f6fd5f514c56447d223e535a2960c7baf` |
| `contracts/wire-v1/generated/wire-v1.schema.json` | `5f6bc31dd63444f6beb6c02e1769c2f1e142b5ad9b57a9b73c6587016dd45791` |

后端已按这份生成工件校验当前 17 方法与正式事件流：`tests/server/test_wire_v1.py`
24 passed。前端 `backend-response.md` 所列 `sessions.send`、审批、`config.changed`、
`workspace.connection` 和正式 `wire.eventStream/1` 五组机械差异均已在后端实现并通过该工件。
三项安全反馈也已双方接受。因此，**上述 17 方法子集摘要已机械对齐**。

但完整 wire 暂不能登记 `WIRE_LOCKED_FOR_IMPLEMENTATION`：最新权威仍只有
`profiles.list`，而前端 `ProfileMaintenancePort` 明确标作 `INTERNAL_NOT_WIRE`；
Provider/Model 也只有 `ProviderModelRef`，没有维护资源。它遗漏了已批准
`core-semantics/1` §3、§5、§8 的 Profile 创建/更新/归档与可复用 Provider/Model
配置维护。这些是 41 核心范围，不是外围增量。结论为：
**`CHANGES_REQUESTED_CORE_COVERAGE`（既有 17 方法不回退，仅向同一 wire-v1 增补）**。

### 单一 wire-v1 的机械增量（请前端编入同一 TS 权威并重生成摘要）

保留现有 `ProfileRecord` 与 `ProviderModelRef`，新增以下中立类型；所有对象继续 strict：

```text
ProviderModelConfigRecord = {
  id: WireId, version: RecordVersion, displayName: string,
  harness: string, provider: string,
  credentialId: WireId | null,                 // 仅不透明引用，不含秘密内容/locator
  configuration: ConfigOverride[],             // reject sensitive keys；由接入层校验
  models: [{ modelId: string, displayName: string,
             availability: unknown|available|unavailable,
             unavailableReason: string|null }],
  archivedAt: WireTimestamp|null, createdAt: WireTimestamp, updatedAt: WireTimestamp
}
```

方法增量与结果（沿用现有 `requestId`、`expectedVersion`、错误族及分页编码）：

| 方法 | 必需 params | result |
| --- | --- | --- |
| `profiles.create` | `requestId, displayName, harness` | `{profile}` |
| `profiles.update` | `requestId, profileId, expectedVersion, displayName` | `{profile}` |
| `profiles.archive` | `requestId, profileId, expectedVersion` | `{profile}` |
| `providerModels.list` | `includeArchived` | `paginated(ProviderModelConfigRecord)` |
| `providerModels.create` | `requestId, displayName, harness, provider, credentialId, configuration, models` | `{providerModel}` |
| `providerModels.update` | `requestId, providerModelId, expectedVersion, displayName, credentialId, configuration, models` | `{providerModel}` |
| `providerModels.archive` | `requestId, providerModelId, expectedVersion` | `{providerModel}` |

机械约束：

- Profile 创建只选择后端 `server.hello`/能力描述列出的 opaque Harness；不允许客户端按品牌
  推断默认配置。创建后通过已有 `config.describe` 取得完整描述，配置默认值仍由接入层提供。
- Profile update 本增量只修改 `displayName`。Harness 身份不可原地换家；完整配置修改随后应由
  `profiles.updateConfig(requestId, profileId, expectedVersion, values: ConfigOverride[])`
  单独编码，以便 `configVersion` 与普通记录 `version` 都返回并保持运行中“next_send”语义。
  请把该方法同时纳入本轮；结果 `{profile, configVersion, effectiveFor:'next_send'}`。
- Profile archive 不删 Session、历史、项目文件或 native memory；已运行任务收尾，新发送/新选择
  拒绝。归档本身不是永久删除。
- `provider` 与 `harness` 都是不透明接入层数据。Provider/Model 可用性由后端验证结果给出，
  “保存成功”不等于“模型可运行”。`credentialId` 只是 Server SecretStore 记录引用，秘密内容、
  locator、Authorization header 均不得进入 wire/事件/日志。
- Provider/Model 配置 archive 前做引用检查；仍被任一未归档 Profile 的模型槽引用时返回
  `CONFLICT_VERSION` 不合语义，故请在现有错误族增加机械错误 `CONFLICT_REFERENCE`，错误 data
  只含稳定引用对象 id。不得静默替换 Profile 选择。
- Profile 的模型槽引用继续只使用现有 `{providerId, modelId}`，其中 `providerId` 精确指向
  `ProviderModelConfigRecord.id`；模型 id 不用字符串拆分。具体多槽位仍由 `config.describe`
  的 `model_slot` 控件声明，不在 Server 或 Desktop 按 Harness 品牌硬编码。
- create/update/archive 幂等 scope 分别为方法名+`requestId`；同 id 异 payload 继续
  `CONFLICT_REQUEST`。所有 update/archive 使用 CAS，冲突 data 携带当前权威记录。

后端会在 41 内按上述增量实现持久化、引用完整性和行为测试。前端只需扩展现有同源 TS 权威、
生成 JSON Schema 并把 `ProfileMaintenancePort` 接到新增方法；不要另建 REST/fixture-only 合同。
前端提交新完整摘要后，后端再用该同一工件运行 schema 回归并登记
`WIRE_LOCKED_FOR_IMPLEMENTATION`。

## 2026-09-14 · 对 P07 检查点 2 候选 `wire-v1` 的答复

核对对象（只读）：
`/home/maoqh/projects/agent-box-desktop-next-wsl-round1/docs/desktop-product-delivery/contracts/wire-v1/`

| 工件 | sha256 |
| --- | --- |
| `README.md` | `bbb22a25fb1f15d4…` |
| `semantics-map.md` | `3a7fd66d51dac9b1…` |
| `generated/wire-v1.schema.json` | `cd80103b3effbc4e…` |
| 权威（前端登记的 `src/types/wire/wire-v1.ts`） | `8e20ccd3e0718214…`（前端登记，本侧无法直读 TS 权威，以生成工件为准） |

**结论：ACCEPTED_WITH_MECHANICAL_CORRECTIONS。** 后端已按该候选实现 wire/1 绑定
（`POST /wire/v1/{method}`，JSON-RPC 形信封、错误族枚举、事件帧、游标语义、幂等作用域），
并按 41 编制了行为回归。下列更正均为机械层，不改动已批准语义。

### 已接受并实现（无需前端变更）

- 信封、11 个错误族、`EventFrame`（eventId/seq/cursor/emittedAt/event）、
  8 个事件 kind、`history.snapshot` 的 `resumeCursor` 与 `resync_required`、
  `expectedVersion` 版本冲突（回 `current`）、请求标识幂等（同 id 同 payload 回原回执，
  不同 payload → `CONFLICT_REQUEST`）。
- 能力发现：`capabilities[].supported=false` 必带 `reason`；本部署未接的
  执行/连接能力如实报 `EXECUTION_CAPABILITY_UNAVAILABLE` / `WSL_CONNECTOR_UNAVAILABLE`。
- `workspaces.browse` 的 `canOpen`/`canWrite` 分列：只读目录仍可打开；
  非目录条目带 `reason`，不静默丢弃。
- `workspaces.open` 的 `created` 标记与「同环境+规范化路径重开保 id」；
  不同 environment 的同路径是不同 Workspace。
- 归档保留记录、按 `expectedVersion` 变化版本、归档后从默认列表消失但 `includeArchived` 仍在。
- `config.resolve` 计算生效值：接入默认 → Profile 默认 → 明确临时覆盖，
  安全锁定项最后覆盖且拒绝被覆盖（回 `invalidControls[{controlId,reason}]`）。
- `sessions.createAndSend` 原子接受：接受前校验失败不建 Session、不排队；
  接受后派发失败保留会话（`execution.state=failed`）。
- `queue.get` / `queue.withdraw`：提交时冻结角色与内容；`withdraw` 已派发回 `too_late`；
  版本过期回 `CONFLICT_VERSION`。
- `runs.stop` 三态：`stop_requested` / `already_finished` / `unconfirmed`——
  无法确认停止时明确 `unconfirmed`，不报已停止。
- `approvals.decide`：`recorded` / `already_recorded`（同 requestId 重试）/ `invalid`
  （已结束、取消、版本过期、矛盾决定），首个有效决定原子接受。
- `sessions.switchProfile`：运行中被拒并回旧 session 记录。

### 机械更正 / 需前端确认（3 项）

1. **`server.hello` 也必须认证**（差异请求）。
   候选把 hello 设计为握手，但未说明其认证状态。本实现要求所有 wire 方法（含 hello）
   携带 `Authorization: Bearer <session_token>`，理由：未认证的本地进程不应能枚举
   服务能力与 `serverId`。若前端希望 hello 免认证，请明确；否则请按此实现。
2. **认证引导的具体编码**（候选「开放差异 1」，本侧给出可实现的提案，待确认）。
   提案：token 由 Server 生成并写入数据根下受保护文件
   `<data_root>/secrets/http-token`（POSIX 0600 / Windows ACL 仅当前用户）；
   Electron 宿主同机同用户直接读该文件，作为 `Authorization: Bearer` 头随每次
   `/wire/v1/{method}` 发送。token **不**进 URL、argv、日志、事件或错误体；
   每实例随机，重启复用同一文件，删除文件即轮换。承认差异：本提案与候选「scheme 交换
   流程未编码」不冲突，但需要前端确认「读保护文件」是其可接受的引导方式。
3. **`profiles.list` 的 `harness` 字段仅作数据**（确认项）。
   后端按候选把 Harness 名作为不透明数据字段返回（`harness: "codex"` 等），
   不做任何品牌分支；能力差异以 `config.describe.controls` 与事件声明表达。
   请确认前端同样不对 `harness` 值做行为分派。

### 后端未实现 / 明确不在本候选范围

- 需登录态的凭据采集、OAuth device、api_key 采集流程：wire 定义了 `auth.schemes`
  枚举但本实现只提供 `session_token`；其余 schemes 未实现，`server.hello` 只声明已实现的。
- `queue` 的 `paused` 状态：可表示（枚举已含），但「失败/停止后暂停队列」的自动策略
  目前只在执行终态时把 pending 标记 paused，**不**自动重新派发（core §6 要求「恢复队列
  记录但不自动派发」）。
- 附件内容的读取与投递：`message.attachments[].ref` 目前只作为不透明引用存储与回传，
  未实现文件内容读取/投递（core §8 要求携带环境/范围并校验授权，属后续增量）。
- 真实模型执行：wire 面已就绪，但 Harness 真实模型门未通过（见 42 §D）。

### 摘要登记请求

后端实现所对的候选摘要为 `cd80103b3effbc4e`（生成工件）。
请前端确认是否可以此为 `WIRE_LOCKED_FOR_IMPLEMENTATION` 的工件摘要；
若前端在检查点 3 期间机械更正候选，请更新摘要并通知，后端按其更新实现与回归。
在双方登记同一摘要前，本侧状态保持 **WIRE_CANDIDATE_ACCEPTED_BY_BACKEND**，不称已锁定。

---

## 2026-09-14（WO39 完成时，历史）

后端现状（前端 P07 检查点 2 尚未产出时，以 37 已有 HTTP 合同作为后端事实候选）：

1. 后端当时候选形状：`/api/v1/*` REST + SSE 事件流；错误信封
   `{error:{code,message,retryable,request_id}}`；幂等经 `Idempotency-Key` 头。
   该 REST 面在 41 实现后作为**保留的 37 历史产品面**继续存在并可测试，
   产品合同以 wire/1 JSON-RPC 面为准（两套并存，前端只需接 wire/1）。
2. readiness 能力发现契约在 39 变更：移除品牌字段 `capabilities.codex` /
   `capabilities.cold_resume` 与顶层品牌 blocker，新增
   `capabilities.execution` 与逐注册 Harness 的
   `available / capability_claims / credential_registered / unavailable_reason`。
3. Profile 响应的 `capabilities` 由注册描述符联接；未注册/未验证的 Harness 一律 `{}`，
   前端不得对任何品牌默认 `native_memory=true`。
4. 幂等接受语义：并发同键首发恰好一次业务接受，重放返回同一身份与回执；
   接受后派发失败不回滚接受；「已接受/已拒绝/仍未知」以原请求标识查询。
5. SSE 游标：`id:`=会话内单调 seq；游标超前 409 `EVENT_CURSOR_AHEAD`
   （wire 面投影为 `resync_required`）。


## Order 51 D — `usage.updated` 事件与会话最新值（2026-09-17，env-provider 工作树）

- **动机与来源**：用量事实（tokens）在 ACP 协议面不可靠（`PromptResponse.usage` UNSTABLE/
  optional），各家的权威数字在自己的 native journal/数据库里（51 阶段 A 逐家观察：
  usage-context-observation-51.md）。Server 在 capture 完成后、channel 存活期内，按部署的
  `usageProbe {journalSuffix, format}` 声明经既有 `home.list`/`home.get` 受控回读并解析为
  中立字段（tokens only；缺失即缺失，禁止估算）。
- **新增事件 kind**：`usage.updated`（WireEvent oneOf 新成员）——每个完成且该家族报了
  数字的 turn 一帧：`{kind, sessionId, turnId, usage: {inputTokens?, outputTokens?,
  totalTokens?}}`（严格，整型非负，缺省字段缺失）。
- **会话最新值**：`SessionRecord.latestUsage`（nullable optional）——`{turnId, usageSource,
  inputTokens?, outputTokens?, totalTokens?}`，后加入的客户端无需重放即可读到。
- **两仓摘要（前端 HEAD bd5336bb，分支 feature/agentbox-desktop-product，lease RELEASED）**：
  TS 合同 `apps/desktop/src/types/wire/wire-v1.ts` sha256
  `990cf905586791c0b8a78ed5fd04431b4119f9229faeb00863e7d39cc9c902b7`；
  生成工件 `wire-v1.schema.json` sha256
  `9e7f28381fdb5db91873d85e26acbd0ca3237737d4d5b4c4b8524d04a4b8b0f4`
  （后端侧证据副本：`docs/server-round1/fullstack/generated/wire-v1.schema.snapshot-33methods-stale.json`）。
- **严格校验**：`AGENT_BOX_WIRE_SCHEMA=<工件>` 下 `tests/server/test_wire_v1.py`
  **37 passed**——含 FRAME_COVERAGE 注入的 `usage.updated` 帧（positive）与会话投影的
  `latestUsage`；pi 全链门（c10）在工件在位时 exit 0，真实 usage.updated 帧通过前端
  严格 schema。
- **不动的**：28 方法集、wire/1、既有 9 个事件 kind 与载荷、既有方法语义——纯新增面。


## Order 52 B/D — `thought.delta` / `plan.updated` / `mode.updated`（2026-09-17，env-provider）

- **动机**：ACP 的 sessionUpdate 词汇早已覆盖思考/计划/模式（`agent_thought_chunk`、`plan`、
  `current_mode_update`），而桥也已在内部处理（todos、message parts 的 reasoning/tool）——
  缺口只在 Server 的 `_forward()` 把它们丢弃。本单把四类事实映射为中立事件并落到账本与
  wire（工具生命周期复用既有 `tool.update`，无新 kind）。
- **新增事件 kind**（WireEvent oneOf 新成员，均严格）：
  - `thought.delta {sessionId, text}`——harness 自身的 reasoning 流；
  - `plan.updated {sessionId, entries: [{id, content, status, priority?}]}`——计划快照；
  - `mode.updated {sessionId, currentModeId}`——harness 选定的交互模式。
- **映射位置**：Server `_forward()` 的 `acp_notification` 分支（上游通知原样可达该层）；
  `tool_call`/`tool_call_update` 映射到既有 `tool.update`（无新 kind）。账本由
  `_native_event` 落（thought 文本、工具生命周期、计划快照、模式 id）。
- **两仓摘要（前端 HEAD b1f44a23，分支 feature/agentbox-desktop-product）**：
  TS 合同 sha256 `8ff6d183732b20979d9226c5abe84ea47eaa952c2feef701e2f87fdeed968f83`；
  生成工件 sha256 `0cdc459cd8b8a5bc34d86fe61595bcbd7aea7648be9ef974020f6b5616c348a7`
  （证据副本：`docs/server-round1/fullstack/generated/wire-v1.schema.snapshot-33methods-stale.json`，13 个事件 kind）。
- **严格校验**：`AGENT_BOX_WIRE_SCHEMA=<工件>` 下 test_wire_v1 **37 passed**——
  FRAME_COVERAGE 新增三条 produced 条目（thought/plan/mode），声明-观测对照平衡。
- **不动的**：28 方法、wire/1、既有事件 kind 与载荷——纯新增面（52 D 与 51 D 本计划共享
  一次重锁，51 先行落地后 52 的三 kind 为追加的一次小重锁，如实记录）。

## Order 55 G1 — provider-model provenance（2026-09-17，env-provider）

- **记录扩展**（schema 8）：`server_provider_models` 增 `base_url / auth_style /
  wire_api / fields_source` 四列（全部可选；旧记录 NULL = 未知，不阻塞既有路径）。
  迁移同批非破坏加列；"新字段落库并有迁移"由 schema 8 满足。
- **wire 面（新增可选参数/字段，不改既有语义）**：`providerModels.create/update`
  的 params 增可选 `provenance {baseUrl?, authStyle?, wireApi?, fieldsSource?}`；
  providerModel 投影增 `provenance`（四字段全空则投影为 null = unknown）。
- **枚举**：authStyle = api_key/oauth/none；wireApi = chat_completions/responses；
  fieldsSource = preset/pulled/manual。未知值/未知字段类型化拒绝。
- **两仓摘要（前端合同提交 73ea5d59）**：TS
  `182e7adb0be6d8ec07426433f2ad38e58230089b516e575a9927daa2f57d253b`；
  生成工件 `ec37b9623e8a9dba335f75ffb9cc245f581daa85db123885a5ea4990b6e888ba`
  （后端证据副本：`docs/server-round1/fullstack/generated/wire-v1.schema.snapshot-33methods-stale.json`）。
- **严格校验**：`AGENT_BOX_WIRE_SCHEMA=<工件>` 下 test_wire_v1 **47 passed**
  （含 usage/进程事实与 provenance 的全部严格帧）。
- **探测（models.list / connection.test）**：G2–G3 的有界探测与 SSRF 防护为
  本单的下一切片（wire 两个新动作与后端探测器），未开始——如实记录。

## Order 55 G2 — 两个有界探测的 wire 面（2026-09-17，env-provider）

- **新方法**（WireMethods 新条目，28→30 方法集；纯新增面，既有 28 方法语义不动）：
  - `providerModels.probeModels {requestId, baseUrl, credentialId?} →
     {status: ok|failed, models: string[], code?}`——一次有界 GET `{baseUrl}/models`，
     解析 data[].id（条目上限 512、响应上限 1 MiB、连接/总超时 10s/30s）；
  - `providerModels.probeConnection {requestId, baseUrl, credentialId?} →
     {status: reachable|unreachable|failed, code?, detail?}`——轻量可达性检查。
- **边界**（后端 probe.py）：https-only（loopback http 例外）；非 loopback 私网地址
  类型化拒绝（`PROBE_ENDPOINT_BLOCKED`）；凭据仅在调用时经 SecretStore 读入请求头
  （内存内、零 argv/零日志/零事件——错误消息只引用状态码）；响应超限
  `PROBE_RESPONSE_TOO_LARGE`；格式不符 `PROBE_FORMAT_INVALID`；认证失败
  `PROBE_AUTH_FAILED`；超时 `PROBE_TIMEOUT`；不可达 `PROBE_UNREACHABLE`。
  **探测结果不写任何记录/配置**（由用户确认后另写）——工单 G3。
- **两仓摘要（前端提交 b284f70c）**：TS
  `64dc99610b15360d4d114cb377b9034efeab127d5d15a34da5b7db8f42d8e08f`；
  工件 `42a164a47697f7481f4e5a224e7e2f5241719c1fa3fa476fa54f824c2096433d`
  （后端证据副本：`docs/server-round1/fullstack/generated/wire-v1.schema.snapshot-33methods-stale.json`）。
- **定向测试**：13 项（探测器反例：SSRF 三形态拒绝、loopback 假端点的
  认证失败/成功/可达、超大响应上限、格式不符）——`tests/server/test_usage_parsing.py`。

## Order 67 — 准入按会话（2026-09-18，env-provider）

- **方法集与两摘要不变**（仍 30 方法；无新方法、无签名变化）。
- **触发条件收窄（语义变更，形状不变）**：`TURN_CONCURRENCY_CONFLICT`（family
  CONFLICT_REQUEST）由"Session 或 Profile 已有活跃执行"收窄为**只讲会话**——同 profile
  的不同会话不再触发它；两处 409 文案改为 `Session already has an active execution` /
  `Session already has an active Turn`。错误码与 family 映射不变。
- **内部码消失**：`PROFILE_GENERATION_CONFLICT` 不再有抛出点（完成轮改无条件推进
  `native_generation`）；它从未出现在 wire 映射表中，故 wire 面无变化。
- **忙会话的客户端可见路径**：第二条消息回到既有**队列**语义（回执含 `queueItemId`，
  `executionId: null`），不是错误——这与 60 的队列面一致，非本单新增。
- **部署面新增非 wire 字段**：`homeConcurrency: "shared" | "exclusive"`（装配解析，
  默认 shared；其它值 `SIDECAR_DEPLOYMENT_INVALID`）——不进 wire 契约。

## Order 56 — 托管订阅账户（accounts.*，2026-09-18，env-provider）

- **新方法（+4，纯新增面）**：
  - `accounts.list {} → {accounts: AccountView[]}`；
  - `accounts.create {requestId, harness, accountIdentifier} → {account}`；
  - `accounts.bind {requestId, profileId, expectedVersion, accountId|null} →
    {profile}`（null=解绑；版本化冲突走既有 `RECORD_VERSION_CONFLICT`）；
  - `accounts.importAsset {requestId, accountId, sourcePath} → {account}`
    （单文件导入：常规文件、非链接、≤256 KiB；字节直接进平台 SecretStore，
    只回引用）。
- **AccountView**（新投影）：`{accountId, harnessType, accountIdentifier, state,
  hasAsset, lastVerifiedAt, createdAt, updatedAt}`——**零令牌、零 locator、零摘要**。
- **profiles 投影 +1 字段**：`accountId`（绑定的订阅账户或 null）；wire 形状有变
  ⇒ **需前端同步（P12）并重锁两仓摘要**（本工作树未动前端仓）。
- **无 SecretStore 的组合**：四个方法类型化拒绝 `UNAVAILABLE`（不落明文资产）。

## Order 58 — 受管资产（assets.*，2026-09-18，env-provider）

- **新方法（+6，纯新增面）**：
  - `assets.list {} → {assets: AssetView[]}`（目录：kind/name/latestRevision/digest/source，
    **零内容、零 host 路径**）；
  - `assets.publishSkill {requestId, assetId, revision, sourcePath} → {asset}`
    （安装一个**本机目录**为一修订；frontmatter 规则由存储层类型化拒绝，
    经 wire 以 `INVALID_REQUEST` + 具体码回传）；
  - `assets.publishMcp {requestId, assetId, revision, definition} → {asset}`
    （标准 server 定义；env/headers 只收 `{"credentialRef": …}`）；
  - `assets.bind {requestId, profileId, assetId, revision?, enabled?} → {binding}`；
  - `assets.unbind {requestId, profileId, assetId} → {unbound}`；
  - `assets.bindings {profileId} → {bindings: [{assetId, kind, name, revision, digest, enabled}]}`。
- **身份**：assetId 是稳定 slug，目录行/存储目录/绑定共用同一身份。
- **物化时机**：绑定在**下一轮**生效（执行前按启用绑定渲染并写入执行内，零回写）；
  带凭据引用的 MCP 服务器当前**类型化拒绝**（逐家注入路径未钉死前不落秘密）。
- **需前端同步（P15）与两仓重锁**；本工作树未动前端仓。

## Order 58 G6/G7 — 目录式来源与 MCP 探测（2026-09-18，env-provider）

- **新方法（+4，纯新增面）**：
  - `assets.syncCatalog {requestId, sourceId, sourcePath} → {catalog}`
    （读目录索引成快照；无效索引/源缺失=类型化拒绝，**失败不落地**）；
  - `assets.catalog {sourceId} → {catalog}`（快照 + 逐条 installed/installedDigest 标注）；
  - `assets.installFromCatalog {requestId, sourceId, entryName, revision} → {installed}`
    （用户动作；provenance `<快照摘要>:<条目 origin>` 写进记录，**不静默换源**）；
  - `assets.probe {definition} → {probe}`（一次有界 stdio 握手：超时/上限/可取消/类型化码
    `PROBE_TIMEOUT`/`PROBE_FORMAT_INVALID`/`PROBE_RESPONSE_TOO_LARGE`/`PROBE_SPAWN_FAILED`；
    **不写配置、零凭据、零补全**）。
- 需前端同步（P15）与两仓重锁。

## Order 59 — 受管 hooks（hooks.*，2026-09-18，env-provider）

- **新方法（+6，纯新增面）**：
  - `hooks.list {requestId, family?} → {hooks: HookView[]}`；
  - `hooks.create {requestId, family, name, model, source?} → {hook}`（**默认停用**；
    非法模型在保存前以具体码拒绝：`HOOK_EVENT_UNSUPPORTED`/`HOOK_HANDLER_UNSUPPORTED`/
    `HOOK_TIMEOUT_INVALID`/`HOOK_FIELD_INVALID`/`HOOK_FAMILY_UNSUPPORTED`）；
  - `hooks.update {requestId, hookId, model} → {hook}`；
  - `hooks.setEnabled {requestId, hookId, enabled} → {hook}`（无命令处理器的 hook
    不可启用：`HOOK_NOT_EXECUTABLE`）；
  - `hooks.delete {requestId, hookId} → {deleted, triggersRemoved}`（**显式**级联其触发历史）；
  - `hooks.triggers {requestId, hookId?, limit?} → {triggers: TriggerView[]}`。
- **HookView**：`{hookId, family, name, enabled, model, commands[], source, createdAt, updatedAt}`
  ——`commands` 是该 hook 会跑的**完整命令**（与投影同源派生，启用前可见）。
- **TriggerView**：`{triggerId, hookId, event, at, exitCode, outputSummary, truncated,
  blocking, effect}`——`exit 2 → blocking=true, effect="blocked"`，**阻断语义如实呈现**。
- **可观测的生产端**：本工作树交付账本与契约；hook 触发事实的采集端（各家 journal/受控包装）
  未接线，如实记账。
- 需前端同步（P16）与两仓重锁。

## Order 59 — 代码资产 `assets.publishPlugin`（2026-09-18，env-provider）

- **新方法（+1）**：`assets.publishPlugin {requestId, assetId, revision, sourcePath} →
  {asset, preview}`——OpenCode 形态的 hook 是**代码资产**：用户提供源码（`.js/.mjs/.ts`、
  UTF-8 文本、≤256 KiB），我们**逐字存储**（摘要覆盖原字节）并回**有界预览**
  （≤24 行/4096 字符，自带截断标记），**绝不由表单拼装代码**。
- 反例：二进制（`PLUGIN_NOT_TEXT`）、符号链接、后缀不符、超限、重复修订各有类型化码。
- 逐家物化槽位（opencode 的 plugins 目录）**未一手钉死 ⇒ 不声明、不物化**（如实记账）。

## Order 60 — Profile 绑定点（2026-09-18，env-provider）

- **新方法（+1）**：`profiles.clone {requestId, profileId, displayName, harness?} →
  {profile, migration}`——`migration` 是逐项 `{item, migrated, reason}` 报告（含
  `native-sessions` 恒为未迁移）。
- **profiles 投影 +3 字段**：`permissionPreset`、`permissionRules`、`originProfileId`
  （P17 需要编辑权限姿态与显示克隆出处）。
- **权限姿态进冻结配置**：该轮 effective config 增 `permissions`（`resolve_all` 的逐键/逐目标
  动作集）；`ask` 仍走既有审批往返，不新增审批面。
- 需前端同步（P17）与两仓重锁。

## Order 62 — 工作区 Git 状态（2026-09-18，env-provider）

- **新方法（+1，纯只读）**：`workspaces.gitStatus {requestId, workspaceId} → {git}`；
  `git` = `{branch, changedFiles, additions, deletions, ahead, behind, reason}`，
  **六字段各自可为 null**（null=拿不到），`reason` 为类型化码之一。
- 只读且固定 argv（`--no-optional-locks status --porcelain=v2 --branch` + `diff --numstat HEAD`）；
  答案与记录里**无宿主路径**；不改 Worker/Rust 协议；`ssh` 侧返回 `GIT_UNAVAILABLE`。
- 需前端同步（P20）与两仓重锁。

## Order 63 — Profile 记忆读取（2026-09-18，env-provider）

- **新方法（+1，纯只读）**：`profiles.memory {requestId, profileId} → {memory}`；
  `memory = {available, reason, files[], note?}`，文件项含 `{path, size, digest, content}`，
  凭据命中项为 `{path, size, reason: "MEMORY_CONTAINS_SECRET", refused: true}`（无内容）。
- **注册表新字段** `memory_paths`（≤8、guest-home 相对）；未声明的家 `available:false`
  且前端**隐藏分区**（不画假开关）。
- 只从 profile 的原生 home 读、符号链接不跟随、答案零宿主路径；WSL 侧返回 `MEMORY_UNAVAILABLE`。
- 需前端同步（P17 修订）与两仓重锁。

## Order 64 — 运行中执行清单（2026-09-18，env-provider）

- **新方法（+1，纯只读）**：`executions.list {requestId, limit?} → {executions[]}`；
  行含 `executionId/turnId/sessionId/profileId/profile/harness/placement/state/startedAt/
  workspaceId/workspace/queueItemId/pid/pidReason/adapterPid/adapterPidReason`。
- 只从执行账本读（活动 turn），**无机器级进程枚举、无取消面**；`pid` 仅本机通道填，
  否则 `null + PID_NOT_REPORTED`；答案零宿主路径；上限 200 行（超限类型化失败）。
- 需前端同步（P20）与两仓重锁。

## Order 81 — 两仓重锁登记：前端 P21 交回的工件（2026-09-19，env-provider）

**背景**：前端 P21（2026-09-18）把 56/58/59/60/62/63/64 的新面编入合同并交回**阶段 2 提案**；
本单在**后端侧**逐字复核并登记（只写评审面，不改前端、不改实现）。
前端留档：`agent-box-desktop-next-wsl-round1/docs/desktop-product-delivery/contracts/wire-v1/README.md`（§摘要登记）
+ `evidence/P21-stage2-contract.md` + 其 `status.md`。

### 1 逐字复核（第一手；命令与值）

```bash
sha256sum /home/maoqh/projects/agent-box-desktop-next-wsl-round1/docs/desktop-product-delivery/contracts/wire-v1/generated/wire-v1.schema.json
#   f5d27269184aa387ce1227dbf8497e25b51e0d7ba5d3360f412e9b8cda33a583
sha256sum /home/maoqh/projects/agent-box-desktop-next-wsl-round1/apps/desktop/src/types/wire/wire-v1.ts
#   6e8ae84a1abeb32c89b6761068ec3f380991bbf8497645626b700ed70cd5dedb
sha256sum docs/server-round1/fullstack/generated/wire-v1.schema.snapshot-33methods-stale.json
#   a1bd52a4fb68436079ae2d2e439953e8ac7f345ab5934a936a9434952bee0729
```

| 面 | 值 | 出处 |
| --- | --- | --- |
| **前端交回对（阶段 2，2026-09-18）** | TS `6e8ae84a1abeb32c89b6761068ec3f380991bbf8497645626b700ed70cd5dedb`；工件 `f5d27269184aa387ce1227dbf8497e25b51e0d7ba5d3360f412e9b8cda33a583`（**59 方法**） | 前端 `contracts/wire-v1/README.md` §摘要登记 + 现物本体（本单就地计算，与前端记录值**逐字一致**，前端内部自洽） |
| 后端**最后一条**登记（55-G2，2026-09-17） | TS `64dc99610b15360d4d114cb377b9034efeab127d5d15a34da5b7db8f42d8e08f`；工件 `42a164a47697f7481f4e5a224e7e2f5241719c1fa3fa476fa54f824c2096433d` | 本文件 Order 55 G2 节（434–437 行） |
| 后端工件**陈旧快照**（本树，**非当前工件**） | `a1bd52a4fb68436079ae2d2e439953e8ac7f345ab5934a936a9434952bee0729`（**33 方法**，缺 081/105 起的 31 个方法） | `docs/server-round1/fullstack/generated/wire-v1.schema.snapshot-33methods-stale.json`（order 102 已从 `wire-v1.schema.json` 改名，消除"当前工件"暗示） |

> **Order 102（AUD-B-003）防假绿提示**：本树那份只有 33 个方法，是历史快照，**不是**当前 wire 工件。
> 权威工件（现 64 方法）在**前端树** `contracts/wire-v1/generated/`（081 登记的重锁规则管辖其配对）。
> **任何严格校验的门必须显式 `AGENT_BOX_WIRE_SCHEMA=<前端权威工件>`**，**不得**默认取本树这份快照——
> 否则会在只覆盖 33/64 的情况下"全绿"（这就是改名要根除的假绿）。改名后 `generated/` 下不再有
> 同名 `wire-v1.schema.json` 可被误当当前工件；此快照仅留作历史数值互证的记录。

**方法集比对（本单从两份工件与代码方法表各取一次）**：

| 面 | 方法数 |
| --- | --- |
| 前端現物 | **59** |
| 后端工件副本 | **33**（差 26：`accounts.*`×4、`assets.*`×10、`executions.list`、`hooks.*`×6、`profiles.clone/memory/setPermissions`、`workspaces.gitStatus`——**后端代码均已实现**，副本停在 Order 57 代） |
| 后端代码（`_PARAM_SHAPES`） | **64** |
| 前端 ⊂ 后端代码 | 是（无孤儿方法）；差 5 个：`profiles.subagentGrants/grantSubagent/revokeSubagent`（Order 65）与 `usage.aggregate/export`（Order 53）——前端 README **明示"刻意不编入"**（不是遗漏） |

**同时记录一处评审面缺口（第一手）**：`grep -c providerArtifacts docs/server-round1/wire-review.md` = **0**；
Order 57/58/59/65 的方法在代码与前端工件里都在，但本文件**没有对应小节**（前端也已指出 57 C 的重锁"零登记"）。

### 2 登记与结论（差异已登记；两端**仍未锁定**）

**结论：三个摘要互不相等 ⇒ 本文件的"两端接受同一对摘要"尚未成立**（`RELOCK_REGISTERED_PARTIAL`）。
差异及其原因（均为第一手或前端实测转述，逐条标源）：

1. **前端現物 vs 后端最后登记**：不等（`f5d27269…` ≠ `42a164a4…`）。
   前端实测（其 README 三条之一）：用同一命令重生成 `b284f70c` 的权威得 `d465e526…`——
   差异是**等价的联合编码**（zod 4 输出 `anyOf`，后端登记值里是 zod 3 形 `type:[...]`），
   **语义相同、字节不同** ⇒ **文件式摘要不可跨工具链复现；重锁必须交换工件本体，不能只报摘要**。
2. **前端現物 vs 后端副本**：不等（59 方法 vs 33 方法）。差额 26 个后端**均已实现**（见 §1 表），
   本树副本停在 Order 57 代且**从未在 wire-review 登记**（§1 缺口条）。
3. **前端方法集 ⊂ 后端代码方法集**（59 ⊂ 64）；差的 5 个前端明示"刻意不编入"（Order 65 在飞、Order 53 未收口）。
4. **反例演练（工单 G1）**：若把旧值 `b284f70c` / `42a164a4…` 当作"已一致"登记，会与现物就地计算值
   `f5d27269…` 直接矛盾——本单的登记因此只认**現物计算值**（两端各引一次：前端 `contracts/wire-v1/README.md`
   与现物本体；后端 `docs/server-round1/fullstack/generated/wire-v1.schema.snapshot-33methods-stale.json`）。

**据此登记（后端侧接受的事实）**：
- 前端交回的**对**为 §1 表第一行（TS `6e8ae84a…` / 工件 `f5d27269…`，59 方法，2026-09-18）；
- 该工件**逐条编自后端实现**（前端证据列了 file:line），且其方法集是后端已实现面的**真子集**；
- **两端未锁定**：锁定需要一次"换本体"的动作，而不是再报一次摘要。

**交回项（需调度者/用户拍，或下一单执行；本单写权只到评审面与账）**：
1. **换工件本体**：由后端发布其**当前 64 方法**工件、或前端把 5 个方法补齐后重生成，两端交换**本体**后各记摘要；
2. **替换本树旧副本**（`a1bd52a4…`，33 方法）：它现在让 `test_wire_v1` 的 strict 模式在 56/60 之后的字段上失败
   （5 项既有失败），且会让任何"按本树副本对表"的核对得出过时结论；
3. **明确生成与比较口径**（哪条工具链生成、按语义还是按字节）——否则摘要永远不可复现；
4. **补 wire-review 缺失小节**：Order 57/58/59/65 的方法面（当前 0 命中）。

## Work Order 092 — provider 记录第 1 层字段（runtime 已落；wire 白名单待 A + 两仓重锁）

runtime 侧（`server/model_configs/**`、`storage/database.py`、`server/execution/**`、
`plugins/**/production.py`）已实现并带反例：记录 `harness` 可空（schema 19→20）、canonical
协议四值 + 方言归一表、记录/模型 `protocols[]`、`endpoints{}`（复用 probe URL 纪律）、
模型 `capabilities{}` 严格模式（文档化键、缺席保持缺席）、描述符 `wire_protocols`、
list 读时派生 `compatibility[]` + `protocolsDeclared`（不落库）、冻结 `PROTOCOL_INCOMPATIBLE`。

**方法/字段与摘要（供 A/settings 重生成用；本树不擅改 wire）**：
- `providerModels.create` / `.update` 入参新增可选：`harness`（→可选）、`protocols: string[]`、
  `endpoints: {protocol→url}`、`models[].protocols: string[]`、`models[].capabilities: object`。
- `providerModels.list`/`.create` 结果新增：`protocols`、`endpoints`、`protocolsDeclared: bool`、
  `compatibility: [{harness, protocol}]`；`models[]` 项透回 `protocols`/`capabilities`（缺席即无键）。
- `provenance.wireApi` 枚举：`{chat_completions, responses}` → canonical 四值
  `{openai-chat, openai-responses, anthropic-messages, gemini-generate}`，**并接受旧两值归一**
  （`chat_completions→openai-chat`、`responses→openai-responses`）。⚠ 归一改变 create 回声：
  `test_provenance_wire_098.py` 目前断言 `wireApi="chat_completions"` 原样读回——**wire 侧一旦
  接受+归一，该回声测试须同步更新**（本树为守 098 已收口成果，未在 service 改写 `wire_api` 存储，
  仅把归一表用于 compatibility 派生；wire 枚举扩 + 存储归一随本项一起做）。
- **v2 多槽（R-0013 追加）**：`config.describe` 的 `model_slot` 逐槽投影 + profile 槽表引用形状
  （`handlers.py::config_describe/_controls`，A 线）＋描述符 `model_controls` 声明＋冻结逐槽带
  `controlId`（`PROTOCOL_INCOMPATIBLE`）。

**前端工件落后＝如实记，不改工件、不跳测试**（G7）：以上到得了 wire 要靠 `wire-v1.ts`/生成工件
重生成 + 两仓重锁。092 整单在 A/settings 补齐前记 `PROVIDER_REGISTRY_PARTIAL`（wire 半路由）。

---

## 工件口径（Order 113，2026-09-19）：谁生成、怎么比、门怎么指路径

**一句话**：**后端发自己那份能证明的东西（方法集＋参数形状），前端那份带 result schema 的仍是权威**；
两边**按名字比**，差异逐条点名；**任何门显式写路径，没有默认工件**。

本节把 081 交回的三条（换本体 / 替换本树旧副本 / 明确生成与比较口径）落地成可复跑的动作，
并就地更正本文件 §081 里那份"本树副本 `a1bd52a4…`，33 方法"的描述——105 收口时该副本已被换成登记对，
它不再是"过时冒充当前"的那一份；但**"文件名长得像当前工件"这个形状仍然有害**，所以按本节改名归位。

### 1 三件东西各自是什么

| 文件 | 谁生成 | 内容 | 权威范围 |
| --- | --- | --- | --- |
| `fullstack/contract/wire-v1.server-inventory.json` | 本树 `scripts/server-round1/wire_artifact.py` | 64 个方法：方法名 → handler 属性 → Server 自己必填/可选的参数名；`result` 一律 `{"declared": false, "authority": "contract"}` | **只有**"派发表与参数门"这一件 |
| `fullstack/contract/wire-v1.schema.registered-b1eb4762.json` | 桌面 settings 线（重锁 `ed6592b7`） | params + **result** 的完整 JSON Schema（134 键 = 64×2 ＋ 6 个协议形状） | **合同工件**；本树这份只是**按摘要命名的登记副本** |
| `fullstack/generated/README.md` | 手写的指针 | 说明该目录不再放工件、以及上面两份在哪 | — |

副本**文件名里就是它自己的 sha256 前 8 位**：对不上就是过期，不会再出现"无声停在旧版却长得像当前工件"。

### 2 生成与比较（都在本树根目录跑）

```bash
# 现算后端清单摘要（确定性：同一份源码两次跑必须同值）
python3 scripts/server-round1/wire_artifact.py --print-digest
# 重新生成并写入（只允许写本仓内路径，越界即退出）
python3 scripts/server-round1/wire_artifact.py --write \
    docs/server-round1/fullstack/contract/wire-v1.server-inventory.json
# 门/脚本用：清单是否落后于源码 —— 落后退出码 1 并说"regenerate"
python3 scripts/server-round1/wire_artifact.py --check \
    docs/server-round1/fullstack/contract/wire-v1.server-inventory.json
# 两仓对表：把差异**按名字**列出来（有差异退出码 1，不是"静通过"）
python3 scripts/server-round1/wire_artifact.py --compare \
    docs/server-round1/fullstack/contract/wire-v1.schema.registered-b1eb4762.json
```

比较只走三条轴：**方法集**、每方法 **required 名集**、Server 接受但合同**没声明的属性名**。
`result` 不比（后端不声明）。"两条轴都空" 只意味着**这三条轴一致**，不意味着"合同已实现"。

### 3 门入口参数：必须显式指路径

```bash
# 唯一允许的写法：显式路径
AGENT_BOX_WIRE_SCHEMA=docs/server-round1/fullstack/contract/wire-v1.schema.registered-b1eb4762.json \
    python3 -m pytest tests/server/test_wire_v1.py -q
```

`tests/server/test_wire_v1.py` 的 `Wire.call` 只在 `AGENT_BOX_WIRE_SCHEMA` **被设**时校验；
**没有默认值，也没有"去找本树那份副本"的行为**。规则＝谁要跑 schema 门，谁在命令行/门里写死路径。
门里若要用登记工件，走 `tests/server/test_hello_harnesses_105.py` 那种**常量路径 ＋ sha 断言**的形状。

### 4 摘要在哪登记

| 事实 | 值（2026-09-19） | 记在哪 |
| --- | --- | --- |
| 合同对（桌面重锁） | TS `c48d2dfc…bec58bb` / 工件 `b1eb4762b2a8e13e873967b770854e5e73a948488d4d066da07bc584e693dcd1` | **LNX-002 重锁（2026-09-21，两线合流后的第一次重生成）** ＋ 本树 `test_hello_harnesses_105.py:ARTIFACT_SHA256`、`test_wire_artifact_113.py:REGISTERED_SHA256` |
| 后端清单 | `eaae93303f2380c34256bd4ea3ab03a3e5b922e2816953de82c439aa969bc16d` | 本文件本节 ＋ `--print-digest` 现算（**不是**手填） |
| 已知漂移（清单 vs 合同） | **无（2026-09-21，LNX-002 重锁）** | `--compare` 四条轴全空、退出码 0（可复跑）；§5 那三步已执行，见 §7 |

**重锁之后要做的一件事**：把清单重生成一次并跑 `--compare`，若那两条漂移消失则该节与 `--compare`
的退出码自动变干净——**不需要有人记得改散文**。

### 5 漂移被修好时的那条门会红——预期动作写在这里

`tests/server/test_wire_artifact_113.py::test_the_two_bodies_differ_only_in_the_registered_drift`
把当前那 2 条 `provenance` 漂移钉成常量 `KNOWN_DRIFT`。**下一次重锁把 `provenance` 编进
`providerModels.update#params` / `probeModels#params` 之后，这条门会红**——那是设计，不是故障。
预期动作（按顺序）：

1. 跑 `python3 scripts/server-round1/wire_artifact.py --compare docs/server-round1/fullstack/contract/<新登记的那份>`
   ⇒ 期望 `optionalNotInContract` 变 `[]`、退出码 0；
2. 把本文件"工件口径（113）"§4 表里"已知漂移"那一行改成"无（<日期>，<哪次重锁>）"，
   并把 §1 表里副本文件名换成新摘要（副本**名字必须等于内容哈希**，这条由门钉着）；
3. 同步 `tests/server/test_wire_artifact_113.py` 的 `KNOWN_DRIFT = []` 与
   `tests/server/test_hello_harnesses_105.py:ARTIFACT_SHA256`＋那条 105 的门所指的**形状**
   （105 的门钉的是 `harnesses` 那一面；若这次重锁同时动了 hello 的形状，那条门会自己说）。

**为什么不是"自动通过"**：漂移消失是一件需要有人看一眼的事实（它意味着两份本体真的对齐了），
所以这里故意让门先红一次，而不是让常量自己跟着动。

### 6 对表必须写明"跑在哪一对摘要上"（公告第 107 轮提的要求，本树的口径本来就该这样）

一句规则：**任何"两仓一致/不一致"的结论，必须同时给出它比的是哪一对摘要**——否则等登记对前进一次，
旧结论就变成一条没有主语的断言。本树的三处已经这样写了，此处把它立成规矩：

| 位置 | 怎么写明 |
| --- | --- |
| 副本文件 | 文件名里就是它自己的 sha256 前 8 位（`wire-v1.schema.registered-<sha8>.json`）；内容与名字不符 ⇒ 门红 |
| 门 | 常量成对：路径 ＋ `ARTIFACT_SHA256`（`tests/server/test_hello_harnesses_105.py:195`、`tests/server/test_wire_artifact_113.py:REGISTERED_SHA256`） |
| 比较输出 | `--compare <显式路径>`，路径由命令行给；本文件 §4 的表把"当前登记值"与"已知漂移"并排列着 |

**当前状态（本节写作时）**：本树能读到的登记对仍是 **工件 `c4255b31…`／TS `58d61ebb…`**（公告第 58 轮）。
`110` 的 `pauseReason` 触发的那次重锁在第 100 轮是以**"该走重锁"**的形式出现的，本树侧尚未读到新登记值；
新对到达时的动作就是 §5 那三步，且**旧结论要重新跑一遍再说**——不是沿用。

### 7 LNX-002 重锁登记（2026-09-21，两线合流后）——§5 那三步的执行记录

两棵候选树由 LNX-002 合流（backend `integration/linux-native-0`），这是合流后的第一次重生成。
`§6` 那句"当前状态"是它写作时的事实，此处不改写历史，只登记新的一对。

| 事实 | 值 |
| --- | --- |
| TS 权威 `apps/desktop/src/types/wire/wire-v1.ts` | `c48d2dfcdf8d3d5f10d1837ceb793de1f6e7ff590d148cc7be7c13403bec58bb` |
| 合同工件（两树逐字节同一份） | `b1eb4762b2a8e13e873967b770854e5e73a948488d4d066da07bc584e693dcd1` |
| 后端清单 `wire-v1.server-inventory.json` | `eaae93303f2380c34256bd4ea3ab03a3e5b922e2816953de82c439aa969bc16d`（未动：`handlers.py` 本次零改动） |
| 方法数 | **64**（不变） |
| 被取代的一对（历史保留） | TS `763758f0…025b57` / 工件 `2dd26561…ccd64c` |

**关掉的两类漂移，都在生成源上改、不在合同副本上改**（§5 步骤 1 的证据是退出码，不是转述）：

1. **§4 登记过的那 2 条**（098 §9.2 / 交 102 的那批）：`providerModels.update` 与
   `providerModels.probeModels` 接受 `provenance` 而合同未声明。已在 `wire-v1.ts` 给两个
   schema 补上与 `create` 同形的 `provenance`，枚举与服务端 `_PROVENANCE_ENUMS` 逐值一致
   （`wireApi` 线上仍是两值 `chat_completions|responses`——`normalize_wire_api` 定义了但全仓零调用，
   这一点与 §3 的登记一致）。
2. **§4 从未登记过的一类**：绑定工件后跑 `AGENT_BOX_WIRE_SCHEMA=… pytest tests/server/test_wire_v1.py`
   时 5 条门红，同一根因——服务端**一直在发**而合同**从未声明**的两个 Profile 读面事实：
   `recoveryPending`（`wire/projection.py:160`，三态，`null` 是"未知"不是"没被挡"）与
   `sendability`（`wire/handlers.py:689` 挂在每个返回 Profile 的方法上，117/QA-009，152 把
   "身份解析得到但本机打不开秘密"钉成 `blocked`）。**控制实验**：用改动前的工件 `c4255b31…`
   跑同一组门，同样 5 红 ⇒ 这是合流前就存在的**跨仓漂移**，不是本次收敛引入的。

`--compare` 四条轴（`methodsOnlyInServer` / `methodsOnlyInContract` / `requiredSetDrift` /
`optionalNotInContract`）**全空、退出码 0**；`--check` 报清单现算一致。

**§5 步骤 2/3 的落点**：

- 副本换名：`contract/wire-v1.schema.registered-b1eb4762.json`（名 = 自身 sha256 前 8 位），
  旧的 `…-c4255b31.json` 移出；`fullstack/generated/README.md` 的指针同步。
- `test_wire_artifact_113.py`：`CONTRACT` 路径、`REGISTERED_SHA256`、**`KNOWN_DRIFT = []`**。
- `test_hello_harnesses_105.py`：`ARTIFACT` 路径、`ARTIFACT_SHA256`；该文件里那条
  `test_wire_protocols_is_not_published_because_the_descriptor_has_no_such_field`
  **按它自己写好的到期条件**换成 `test_wire_protocols_reached_the_descriptor_and_is_still_not_published`
  ——092 已在 runtime 线落地（`execution/__init__.py:_validate_wire_protocols`），描述符现在**有**该字段；
  hello 仍然只发 `{id, credentialKind?, modelControlId?}`，那一半断言原样保留（仍可被证伪）。
- `test_provider_update_keeps_omitted_112.py`：`ARTIFACT` 路径；属性集锁改为按名排除 `provenance`
  （它是 112 的 provenance 对象、不是列），空值表仍是整七列，不做静默放宽。
- `wire-drive-coverage.md` 按 `scripts/server-round1/wire_drive_coverage.py --markdown` 重生成（64/64，缺口 0）。
- `model_configs/repository.py` 的 `update`：arm-112 的反例门把该方法源码里扫这个 SQL 关键字当作
  "旧 null 默认 + 保留/清空不分 的形状回来了"的**代理**。合流取的 runtime 注释把它写全了，于是门打在散文上——
  机制（`KEEP` 默认，另有签名钉）本来是对的。注释改成"一条合并表达式分不清这两种意图"并写明原因，
  机制断言一字未动。
