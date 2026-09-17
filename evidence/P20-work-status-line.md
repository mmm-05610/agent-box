# P20 evidence — 工作状态行（WorkStatusLine）

配对后端单：59（逐家 schema）/ 52（plan/todo）/ 51（用量）。基线：P19 密度/输入条收口。

## 已交付

`features/chat/work-status.tsx`：**WorkStatusLine** — 只渲染产品已有事实的状态行。

| 事实 | 来源 | 渲染 |
| --- | --- | --- |
| busy | `execution.state ∈ {queued,dispatched,running,stopping,unknown}` | "Waiting for the AgentBox service…" |
| elapsedSeconds | 调用方传入的秒数 | `M:SS` 格式 |
| queueCount | `$agentBoxQueues` 长度 | "Queue message: N" |

诚实纪律：busy=false + queueCount=0 + elapsedSeconds=0 → **不渲染任何东西**。
没有 Git 面就没有 Git 卡；没有 52 的 plan/todo 就没有目标卡；没有子代理事实就没有智能体卡。

## 测试

`work-status.test.tsx`：5 例 — idle 不渲染、busy 渲染等待文案、队列计数、运行时间 `M:SS`、非运行不显示时间。

`vitest run --project ui src/features/chat/work-status.test.tsx` → **1 file / 5 tests passed, exit 0**
`npx tsc -p . --noEmit` → **exit 0**

## 后端单 59/52/51 落地后的增量

- 逐家族 hook schema 与触发账本 → 展开态 hook 卡
- plan/todo → 展开态目标卡 + 进度条（h-1.5 圆角、>80% 变红）
- git 事实面 → 展开态 Git 工具卡
- 子代理事实 → 展开态智能体卡
- 用量 → 上下文用量环（P08 的分母）
