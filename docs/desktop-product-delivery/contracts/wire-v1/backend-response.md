# 前端对后端 wire-review 的回应（2026-09-14）

## 11:34 Session 目录与可恢复 transcript 必要补差

P03 生产接线审计发现：25 方法版本仍无法满足已批准的 Desktop 重启恢复，因为没有 Server
Session 目录；同时 `message.*` 无角色、用户消息与顺序语义，`history.snapshot` 也把实时续订
cursor 与向前分页位置混成一个字段。若直接接 UI，只能拿 renderer 旧缓存伪装历史。

因此本端在**同一 wire-v1** 继续机械补齐，不改变已批准行为：

- `SessionRecord.pinned` 明确为 Server 业务元数据；新增 `sessions.list/update/archive`，总方法数
  28。列表是重启发现入口；rename/pin/move 使用 CAS；archive 保留身份和历史。
- `message.delta` 固定 `role:'assistant'`；`message.final` 必带 `role` 与 visible/hidden；Server 在
  send 接受后须持久化 user final，才能恢复用户输入。`tool.update` 增加可空 `messageId`。
- `history.snapshot` 分开 live `resumeCursor` 与 backward `olderCursor`；事件投影维护稳定消息顺序。
- 新增 `queue.updated`，多窗口按 Server 事实同步队列；withdrawn 只在服务事件/回执后移除。
- `sendOutcome.query.accepted` 补 `configVersion/queueItemId`，模糊发送确认后仍能判定立即执行或排队。
- 停止 transport 失败落 `unconfirmed` 并保留原 execution，不再永久卡在 requesting。

当前权威完整 SHA-256：
`986889e47bcf5f25353bf8cb62afb009cd367ece7b90cbcbf8ce89bd5ed4c257`；
当前生成工件完整 SHA-256：
`d3f7412710e7e951674922aebdb72ffbb028fc76b2e353a86b53097fd02abe22`。
这两个摘要**取代**下节 25 方法的中间摘要；请以后端对当前 28 方法工件的回归登记为准。

## 11:05 `CHANGES_REQUESTED_CORE_COVERAGE` 回应

已按后端列出的机械增量扩展**同一** TS 权威，没有新建竞争协议：

- 保留已对齐的 17 方法，新增 `profiles.create/update/archive/updateConfig` 与
  `providerModels.list/create/update/archive`，总计 25 方法；所有维护写入沿用 `requestId`，
  update/archive 沿用 `expectedVersion`。
- 新增 `ProviderModelConfigRecord`；`credentialId` 仅为不透明引用，配置/模型可用性为服务数据，
  `provider` 与 `harness` 不参与客户端行为分派。
- 新增 `CONFLICT_REFERENCE`，引用详情只允许稳定对象 id；归档绝不静默改写 Profile。
- `profiles.updateConfig` 固定返回 `configVersion` 与 `effectiveFor:'next_send'`，不把运行中配置
  悄悄改成即时生效。
- 原 `ProfileMaintenancePort` 已接到上述 wire 方法；创建对话框的 Harness 候选仅从已认证服务
  返回的 Profile 记录去重得到。若服务尚无可列出的 Harness，则维护入口诚实不可用，不制造
  `codex`/`claude` 等品牌默认值。独立 Harness catalog 的精确编码仍可在联调时补齐。

新权威完整 SHA-256：
`2874fae7c763a6e7fb488159bccc64903458ec6e4c3310ba306a4e0faa0060a9`；
新生成工件完整 SHA-256：
`c9be8a63097aa6b1658da3b3450b669e128ed1f314780c93841fd34a52e3145a`。
本端 4 files / 29 tests 与三项目 typecheck 已通过。请后端按此同一工件回归并登记；登记前状态
保持 `WIRE_REVISION_PENDING_BACKEND`。

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
