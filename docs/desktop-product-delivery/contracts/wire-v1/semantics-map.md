# wire-v1 ↔ core-semantics/1 对照

语义权威：core-semantics-v1.md。本表逐能力映射到 wire 候选方法/事件/错误，并登记
幂等作用域（请求标识去重的范围，core v1 §3）。方法名/字段名为 PROPOSED 机械编码。

## §8 能力目录 → wire 面

| 能力 | wire 方法/通道 | 必要结果（合同措辞 → 编码落点） | 幂等作用域 |
| --- | --- | --- | --- |
| 服务状态/能力发现 | `server.hello` | serverId/protocolVersion/capabilities[]（缺失必带 reason）/auth 要求 | 不适用（只读握手） |
| 环境准备/浏览 | `workspaces.browse`；进度走 `workspace.connection` 事件（connecting/preparing[worker\|harness]/failed+reason） | 目录条目、canOpen/canWrite 分列、真实失败原因 | requestIds 全局唯一 |
| 工作区打开/维护 | `workspaces.open`、`workspaces.list`、`workspaces.archive` | 权威 WorkspaceRecord（同环境+规范化路径重开保 id，`created` 标记新建）；归档=记录保留 | (environment, normalizedPath)；archive 按 expectedVersion |
| 角色/模型维护 | `profiles.list/create/update/archive/updateConfig`；`providerModels.list/create/update/archive` | ProfileRecord、ProviderModelConfigRecord（harness/provider 仅作数据，credentialId 仅不透明引用）；配置只对 next_send 生效；被引用资源拒绝归档 | list 不适用；写按方法+requestId，update/archive 另带 expectedVersion |
| Session 目录/业务元数据 | `sessions.list/update/archive` | 重启可发现稳定 Session；名称/置顶/Workspace 归属/归档跨客户端一致，归档不删历史 | list 不适用；update/archive 按 requestId+expectedVersion |
| 配置描述/解析/切换 | `config.describe`、`config.resolve`、`sessions.switchProfile` | 控件描述（有限 kind 枚举）、securityLockedIds、effectTiming；解析=服务端算生效值或列 invalid；切换 confirmed/rejected+reason 且带旧记录 | switch 按 requestId |
| 首次发送/继续发送 | `sessions.createAndSend`、`sessions.send` | accepted{session,executionId,configVersion} / rejected_before_accept（无 session，草稿不动） | requestId 全局（跨方法与 sendOutcome.query 同域） |
| 查询接受结果 | `sendOutcome.query` | accepted / rejected_before_accept / **unknown**（不是安全重发信号） | 同上 |
| 队列管理 | `queue.get`、`queue.withdraw` | 权威队列项（提交时角色/内容冻结）；撤回 too_late 明示；暂停/继续由 execution.state+queue 状态表达 | withdraw 按 requestId+expectedVersion |
| 会话历史/订阅 | `history.snapshot` + `wire.eventStream/1` 帧流 | snapshot{frames,resumeCursor,olderCursor} / resync_required；消息含 role/display 并有稳定顺序；实时续订与向前分页游标分离 | 不适用（游标寻址） |
| 停止/审批决定 | `runs.stop`、`approvals.decide` | stop_requested≠已停止（终态走 execution.state）；决定 recorded/already_recorded/invalid；scope=once 或显式 bounded | stop 按 requestId；decide 按 approvalId+expectedVersion |
| 续接/重试 | 外围合同（核心仅要求"不改写旧失败"——sessions.send 以新 requestId 建**关联**新执行，关联事实由服务端事件携带） | — | — |

## 事件归一（core v1 §6/§7）

`message.delta / message.final / tool.update / approval.requested / approval.settled /
config.changed / execution.state / queue.updated / workspace.connection`。
不透传原生 raw 协议与秘密；Execution 只作后台身份字段，不进用户心智。

## §9 必测场景 → 可执行 fixture 矩阵（P07 检查点 3）

矩阵清单：`apps/desktop/src/types/wire/fixtures/core-v1.ts`；执行验证：
`core-v1.test.ts`。客户端真实序列化往返另见 `src/api/wire-v1-client.test.ts`，事件重放状态机在
`src/application/session/wire-session-projection.ts`。测试 transport 必须显式注入，生产无 mock 默认。

| # | 场景 | 已执行断言 |
| --- | --- | --- |
| 1 | 无 Server/无 Harness 仍开窗、业务写入诚实不可用 | hello→UNAVAILABLE；UI 不可用态（客户端侧测试） |
| 2 | 两环境同路径不误认；重开保 id；不建 Session | workspaces.open 反例：同 path 不同 environment → 不同 id；重复 open → same id+created=false；无 sessions.* 调用断言 |
| 3 | 首发并发/重试只接受一份；接受前后失败分开；超时查询不重派 | createAndSend 同 requestId×2 → 同一 accepted；改 payload → CONFLICT_REQUEST；accepted 后 execution.state=failed（会话保留）；query→accepted/unknown |
| 4 | Profile 版本冲突；运行配置固定；切角色失败保旧；排队不被改写 | switchProfile expectedVersion 过期 → rejected+旧 session；resolve 在接受时固定 configVersion；queue item 提交后字段冻结 |
| 5 | 完成继续队列；停止/失败暂停；停止竞态不误报 | execution.state 序列 queued→…→completed 后下一项 dispatched；runs.stop→stop_requested→stopping→stopped；already_finished 分支 |
| 6 | 两窗口审批竞争；过期/变更/取消后批准拒绝；重放不触发审批操作 | decide 同 approvalId 并发→recorded+already_recorded；expectedVersion 过期→invalid；EventFrame 重放消费仅呈现 |
| 7 | 快照到订阅间事件不丢；重复重放不重复；过期游标明确重置 | snapshot.resumeCursor 接流帧 seq 连续；eventId 去重；resync_required 分支 |
| 8 | Desktop 重连不派发；Server 重启先核对；Worker 消失不假称恢复 | 客户端重连仅 snapshot+subscribe（无 send）；execution.state=failed+reason='worker unreachable'（WORKER_UNREACHABLE） |
| 9 | 远端受管工具限时现场、回传确认与清理分离、零材料进日志 | 传输层/服务端义务——客户端 fixture 仅断言事件不含秘密字段（负例：secrets 不在 WireEvent 形状中） |

九组均已有离线可判定的 client/schema/application 行为门。真实 Server/Harness 义务仍由后端
测试与最终联调验证；Desktop fixture 不连接生产服务、不调用模型，也不把 mock 接成默认 transport。
