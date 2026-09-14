# 前端对后端 wire-review 的回应（2026-09-14）

核对输入：后端 `9bd2a80` 的 `docs/server-round1/wire-review.md`、`server/wire/*.py`、
`server/transport/http/app.py` 与 `tests/server/test_wire_v1.py`。后端仓只读。

## 三项正式反馈

1. **接受 `server.hello` 也需要认证。** Electron 宿主在握手前取得实例 token；renderer
   不接触 token。所有 `/wire/v1/{method}` 请求均使用 `Authorization: Bearer`。
2. **接受受保护 token 文件作为同机引导。** 文件位于 Server data root，权限仅当前用户；
   token 不进入 URL、argv、renderer、日志、事件或错误体。具体读取和轮换失败映射由 P04
   Electron 服务层实现并测试，不在 React 中读文件。
3. **确认 `ProfileRecord.harness` 只作不透明展示数据。** 前端不按 `codex`、`claude` 等值
   分派行为；可用性和控件仅消费 Server capability/config 描述。

## 本次机械修订

- 请求/错误信封改为 strict；响应运行时校验“result/error 恰有一个”。
- `capabilities[].supported=false` 运行时强制非空 `reason`。
- `config.describe.controls` 采用后端已实现的 `controlId / values / editable /
  currentValue` 词汇，保留有限 kind，不引入 Harness 品牌分支。
- Profile capability claims 缺失时解析为空映射，绝不按品牌猜 `native_memory` 等能力。
- `execution.state` 接受诚实 `unknown`；未给 reason 不伪造。`tool.update` 的摘要字段在服务
  尚未提供时可缺省。
- `sessions.send` 把立即派发与 Server 队列接受编码为互斥形状：`executionId` 或
  `queueItemId` 恰有一个；`QueueItem` 明确携带提交时冻结的 `configVersion`。

当前权威摘要：`sha256:793bc995fd8199df…`；当前生成工件：
`sha256:5f6bc31dd63444f6…`（P07 检查点 3 加入鉴权前错误的 null id 编码及可执行 fixture 后更新）。
在后端登记并通过同一工件前状态是
`WIRE_REVISION_PENDING_BACKEND`，不冒称已锁定。

## 从实际源码发现、需后端按新工件补齐的机械差异

- `sessions.send` 内部已有 `queued`/`queueItemId`，但 wire handler 丢弃了队列身份；需按
  新结果互斥形状投影。`_queue_item` 也需投影已有 `configVersion`。
- `approval.requested` 当前发 `{approvalId, executionId, request}`，未满足单一
  `ApprovalRequest` 所需的 `version / operation / expiresAt`；`approval.settled` 当前
  `decision=allow|deny`，应投影合同 outcome 词汇。审批版本是已批准的竞争保护，不能由前端
  降断言迁就。
- `config.changed` 当前只有 `configVersion`，缺“影响 next_send 还是声明的 immediate”；
  应补 `effectiveFor`（可同时保留版本，但双方 schema 必须一致）。
- `workspace.connection` 当前多带 `sessionId`；工作区连接并非 Session 所有，按 schema 删除
  该多余字段。
- 实际只存在旧 `/api/v1/sessions/{id}/events` SSE，尚无携带 `EventFrame`、cursor 恢复语义的
  `wire.eventStream/1` 生产通道。`history.snapshot` 只证明帧投影，不等于连续订阅已实现。

这些差异不阻止前端继续 P02/P03/P04 独立实现和隔离 fixture 验收；它们是最终全栈接管前的
明确联调项，测试不得改接旧 SSE 或放宽审批/游标断言来凑绿。
