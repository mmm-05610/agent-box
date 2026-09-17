# P20 evidence — 工作状态浮窗

工单：[`P20-work-status-panel.md`](../work-orders/P20-work-status-panel.md)（基线 P19 之后）
配对后端单：59（逐家 schema）/ 52（plan/todo）/ **未开单**（子代理、进程清单）。

## 状态：**未开始**

P20 需要创建全新面板组件（收起/展开外壳 + 五卡 + 动画 + 状态管理），以及与
`agentbox-queue-panel` / `useAgentBoxMainChat` 的集成。当前会话的上下文预算已耗尽于
P08–P19 的实现与门；P20 无法在本会话内诚实完成。

## G1 四栏表（元素 / 数据源 / 可用性 / 交互逻辑出处）

| 元素 | 数据来源 | 可用性 | 交互逻辑出处 |
| --- | --- | --- | --- |
| 收起态：运行中 + 时长 + 队列数 | `$agentBoxQueues` + `execution.state` + `run-ticker` | **可用** | Goose status line（收起态单行模式） |
| 展开：进程/运行态卡 | 同上 + `agentbox-queue-panel` | **可用** | P08 已有队列面板 |
| 展开：Git 工具卡 | wire 28 方法无 git 面 | **不可用**：只定字段（branch/changedFiles/additions/deletions/ahead/behind） | Goose GitBranchIndicator（Apache-2.0，只学逻辑） |
| 展开：目标卡 | 后端 52 的 plan/todo | **等 52** | — |
| 展开：智能体卡 | profile 调用 profile（未开单） | **等该项** | claudecodeui SubagentPanel 形态（AGPL-3.0，只看形态） |
| 展开：后台程序卡 | 沙箱内进程清单 | **无事实** | — |
| 进度条（h-1.5、>80% 变红） | 目标 3/5 或用量百分比 | **等数据** | OpenHands budget-progress-bar（MIT，只学逻辑） |
| 聚焦刷新 | window focus 监听 + cancelled 标志 | **可实现** | Goose GitBranchIndicator 的 focus/refresh 模式 |

## 下一步（给后续执行者）

1. 在 `features/chat/` 创建 `WorkStatusPanel` 组件（收起态单行 + 展开态竖排卡）
2. 进程卡接 `$agentBoxQueues` + execution.state + `ActivityTimerText`
3. 其余四卡按工单表的诚实边界：无事实→不渲染
4. 挂载到产品 surface（会话区或侧栏），截图对照（G2）
5. 后端 59/52/子代理落地后增量接入其余卡片
