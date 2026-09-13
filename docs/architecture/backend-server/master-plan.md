# Backend Server — construction plan

2026-09-13，owner 授权：以 80d2017 的 Core 为基础，Windows 独立服务，经 HTTP 驱动 WSL Codex。
蓝图：[v2](../agentbox-server-architecture-proposal.md)，状态：[status](status.md)，范围：[manifest](manifest.json)。

## 当前唯一后端任务

[37 — HTTP Codex 第一轮](work-orders/37-http-codex.md)：已派出，未实施。
执行者先在 `/home/maoqh/projects/agent-box` 检查 worktree 清单，再从
`80d2017e9a708421556914cd99d843573daf4c68` 新建独立工作树
`/home/maoqh/projects/agent-box-server-round1`、分支 `feature/server-http-codex-r1`。
已存在则先核对身份、commit/未提交工作；不覆盖、不 reset、不自动重建。
前端 docs 是派工权威，后端 `docs/server-round1/` 保存所领版本的蓝图/工单副本和执行报告。
报告记录派工 commit；设计有冲突先回报，不自行修改另一仓调度结论。

36 在 Desktop 的独立工作树继续。两任务代码路径不相交，可由不同执行者并行；同一执行者
在阶段边界接续即可，不中断 36、不重启已有 goal。Windows 大型构建和真实执行必须串行，
先检查已有进程归属/资源预算，不能杀其他执行者的构建或用户 Harness。
本轮不迁移 Desktop 35/36 数据、不接 Desktop、不恢复 34/其他暂停项。

## 检查点顺序

1. A：独立 Windows HTTP Server、本机存储、基础产品合同。
2. B：真实 WSL Worker 握手/目录/隔离与状态回收，无模型。
3. C：HTTP 两轮真实 Codex、事件与取消接缝。
4. D：重启续接、临时投影重建、失败恢复与用户操作手册。

每阶段定向验证后提交一次清楚检查点并汇报用户可走的验收路径；通过后可继续，不需要
每次等确认。外部条件缺失只停受阻阶段，不用全量重跑掩盖阻断。
四阶段完成即停，不自动扩展 Pi/协作/安装器/UI。

## 实施自主权

允许在职责目录内调整文件拆分、选择成熟库、添加必要的 SPI 窄接口、安排不冲突子任务。
不允许改变数据权威、绕过 Core/bwrap、猜测状态分类、用假进程替代真实门。
有子代理时最高 Sol；普通实施/机械核对用 Luna/Terra；主执行者负责集成与阶段验证。
不另开第二个长期 goal；交给现有执行者读取该增量单。
