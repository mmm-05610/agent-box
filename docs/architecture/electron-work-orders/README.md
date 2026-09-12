# Electron work orders

这里记录 Electron 主进程的增量施工队列。长期执行者继续消费现有总方针；这里不是第二个
`/goal`，也不建立第二套架构。

| work order | scope | relation to Renderer | status |
| --- | --- | --- | --- |
| [E6](E6-composition-knot.md) | 拆开 `composition/` 的 boot-progress、Hermes local backend 与 preview 实现 | 可与 Renderer Batch 30 并行；共享重型门由主执行者合并 | open |

执行权属于当前主执行者：它负责给并行工作划定互斥写区、控制 CPU/内存、统一 Git
stage/commit、合并可复用的 typecheck/lint/test。工作单规定边界和验收，不替主执行者编排
每一次工具调用。
