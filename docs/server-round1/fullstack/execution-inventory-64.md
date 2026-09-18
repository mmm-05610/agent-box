# 工单 64 收口报告 —— 运行中执行清单面

执行：2026-09-18，env-provider 工作树。终态：**EXECUTION_INVENTORY_DONE**（本机 pid 已接；WSL 侧按规则 null）。

## 1. 字段与来源（§0 的实现）

| 字段 | 来源（我们的记录） | 拿不到时 |
| --- | --- | --- |
| `executionId`/`turnId`/`sessionId` | `server_turns`（活动状态行） | 必有 |
| `profileId`/`profile`/`harness` | `server_profiles` join | 必有 |
| `placement` | `server_workspaces.env_kind` | 必有 |
| `state` | turn 状态映射：`accepted→queued`；`dispatching/running/capturing→running`；`stop_requested_at` 非空 ⇒ `stopping` | 必有 |
| `startedAt` | turn `created_at` | 必有 |
| `workspaceId`/`workspace` | workspace 记录 id 与 **display name** | 必有 |
| `queueItemId` | 该会话的 pending 队列项（有则填） | null |
| `pid`（执行侧） | **本机通道**：`Popen.pid`（经 `execution.pid_for(turn)`） | **null + `PID_NOT_REPORTED`** |
| `adapterPid` | 只有真拿到才报（本单未接） | **null + `ADAPTER_PID_NOT_REPORTED`** |

**只为己有**：清单只从我们自己的账本读（活动 turn 行），没有机器级进程枚举；
**与账本一致**：完成后行即刻消失（同一张表，无影子状态）。

## 2. reason 码表

`PID_NOT_REPORTED`（执行侧未报 pid——远端/WSL 按此）、`ADAPTER_PID_NOT_REPORTED`、
`INVENTORY_LIMIT_INVALID`（limit 非法）、`INVENTORY_LIMIT_EXCEEDED`（超上限=200 行
⇒ **类型化失败**，不返回部分清单）。

## 3. 验证（第一手）

- **空态**：无运行中执行 → `executions: []`（不报错）；
- **消失**：把 turn 置 `completed` → 清单即刻为空（无缓存残影）；
- **pid 三态**：无执行端口 → null+reason；假端口报 4242 → 填值且 reason=null；端口报 null → null+reason；
- **零泄漏**：答案序列化串中**不含** workspace 的宿主路径（测试用 `/workspace/secret-path` 反例），
  workspace 字段只出现记录 id/display name；
- **有界**：limit=0 → 类型化；≥2 行而 limit=1 → `INVENTORY_LIMIT_EXCEEDED`；
- **wire**：`executions.list` 空态返回 `[]`；坏 limit → `INVALID_REQUEST`；
- **回归**：全量计数见提交记录。

## 4. 未做项

- **WSL pid**：Worker 协议不传（按工单不改 Rust），故远端行恒 `null + PID_NOT_REPORTED`；
- `adapterPid`/子进程数：未接（拿不到就不报——本单明确不做机器级/孙进程视图）；
- **P20 前端同步与两仓重锁**：新增 1 个只读方法。
