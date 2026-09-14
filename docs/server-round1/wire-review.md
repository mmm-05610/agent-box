# Wire 反馈（后端 → P07/前端）

维护者：后端执行者（39–42）。用途：在双方锁定单一 wire 前交换事实与约束，
避免两边各造一套协议。此处只写后端事实与差异请求，不批准前端合同。

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
