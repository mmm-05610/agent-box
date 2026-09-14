# Wire 反馈（后端 → P07/前端）

维护者：后端执行者（39–42）。用途：在双方锁定单一 wire 前交换事实与约束，
避免两边各造一套协议。此处只写后端事实与差异请求，不批准前端合同。

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
