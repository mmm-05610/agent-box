# Wire 反馈（后端 → P07/前端）

维护者：后端执行者（39–42）。用途：在双方锁定单一 wire 前交换事实与约束，
避免两边各造一套协议。此处只写后端事实与差异请求，不批准前端合同。

## 2026-09-14（WO39 完成时）

后端现状（前端 P07 检查点 2 尚未产出，故以 37 已有 HTTP 合同作为后端事实候选）：

1. 后端当前候选形状：`/api/v1/*` REST + SSE 事件流；错误信封
   `{error:{code,message,retryable,request_id}}`；幂等经 `Idempotency-Key` 头，
   作用域=路由+会话（scope,key,request_digest 三元组，同键不同体=409
   `IDEMPOTENCY_CONFLICT`，同键同体重放=原回执）。
2. readiness 能力发现契约在本轮变更（前端如已消费旧形状请停止）：
   - 移除品牌字段 `capabilities.codex` / `capabilities.cold_resume` 与
     `CODEX_HARNESS_UNAVAILABLE` / `CREDENTIAL_SOURCE_NOT_AUTHORIZED` 顶层 blocker；
   - 新增 `capabilities.execution`（bool）、`capabilities.harnesses`
     （逐注册 Harness：`available`、`capability_claims`、`credential_registered`、
     `unavailable_reason`）；顶层 blocker 仅
     `WSL_CONNECTOR_UNAVAILABLE` / `EXECUTION_CAPABILITY_UNAVAILABLE`。
   - 原因：39-C 能力诚实性——能力只能来自注册实现与验证结果（core-semantics v1 §5/§8）。
3. Profile 响应的 `capabilities` 现由注册描述符联接，未注册/未验证的 Harness 一律
   `{}`；前端不得对任何品牌默认 `native_memory=true`。
4. 幂等接受语义（core-semantics v1 §6/§9.3）：并发同键首发恰好一次业务接受，
   重放返回同一身份与回执；接受后派发失败不回滚接受，重放不二次派发；
   "已接受/已拒绝/仍未知"以原请求标识查询，未知不得解释为可安全重发。
   请 P07 wire 的首发/查询端点保留请求标识与幂等作用域字段。
5. 事件流：SSE `id:`=会话内单调 seq，`event:`=kind，快照(历史)+续流同一游标语义；
   游标超前返回 409 `EVENT_CURSOR_AHEAD`（要求重新取快照，不静默丢事件）。
   请 P07 在事件信封中保留 `seq/event_id/kind/schema_version/data/created_at` 与
   快照-订阅衔接字段。
6. 后端对 P07 候选的承诺：产出后即做机械 schema 核对（字段名/枚举/信封对齐），
   不重做协议研究；锁定登记将写 status 与 `protocols/desktop/`（41）。

差异/请求清单（供 P07 检查点 2 参考）：
- 认证引导：后端已实现 loopback-only + 每实例随机 bearer token（0600/ACL），
  wire 请定义 token 发现/轮换的机械编码（不进 URL/argv/日志）。
- 能力发现需要一个稳定的版本字段：后端现提供 `api_version:"v1"` 与
  `worker_protocol:"1"`，请 P07 采用单一 `contract_version` 命名并对齐。
- 队列/撤回、审批、续接端点当前未实现：wire 可先定义，后端按 41 逐项标
  未实现而不是假成功。
