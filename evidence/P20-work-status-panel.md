# P20 evidence — WorkStatusPanel 组件

工单：[`P20-work-status-panel.md`](../work-orders/P20-work-status-panel.md)
配对后端单：**59**（hook schema）/ **52**（plan/todo）。基线：P19 之后。

## 已交付

`features/chat/work-status-panel.tsx`：**WorkStatusPanel** — 收起态单行 + 展开态详情区。

| 状态 | 渲染 |
| --- | --- |
| busy | 状态点脉冲 + "Running" |
| idle + queue > 0 | 队列计数 |
| idle + queue = 0 | 不渲染 |

诚实纪律：没有后端事实的维度（git/goals/agents/background）**不渲染**。

## 测试

`work-status-panel.test.tsx`：4 例 — running 渲染、idle 隐藏、expand 显示详情、collapse 隐藏详情。

`vitest run --project ui src/features/chat/work-status-panel.test.tsx` → **4 passed, exit 0**

## 后端 59/52 落地后的增量

- Git 工具卡（branch/changedFiles/additions/deletions/ahead/behind）
- 目标卡（plan/todo + 进度条 h-1.5 圆角 >80% 变红）
- 子代理卡（分组可折叠，主转写留一行摘要）
- 后台程序卡（沙箱内进程清单）
