# BE-LOOP-001 四组任务卡索引与共同规则

> 2026-09-22：先读 [GOAL-START.md](../GOAL-START.md)。已切换原生 goal，
> 允许中央批准后实施；下文旧沙箱路径、fake 启动与只准准备限制由该文件覆盖。

任务卡是**研究与审批的静态凭据**；正式状态另落 `control/reports/BE-LOOP-001/`。
本轮 I 只批准"启动准备"，**未批准启动正式四组**。这些卡供 I 审阅后、由 C 逐组开启研究阶段时下发。

## 共同规则（适用 S/E/H/P）
- **输入 SHA（共同起点）**：`b067c5718556c8efa93b054e6573ad3d186b3cf6`
  （`worktrees/integration-linux/backend`，分支 `integration/linux-native-0`）。只读视图 = 沙箱 `/source`。
  Pi 线 `e2ec0ef2…`（`work/pi-loop-0`）含未提交改动，**单列、不自动并入、不悄改基线**（见 `baseline.md`）。
- **运行方式**：本组 = 独立 `bwrap` 内独立 `qodercli` 进程（非原生子代理）。C：
  `be-loop.sh start <group>`（研究阶段，源码只读）。停止：`be-loop.sh stop <group>`。
- **状态机**：`IDLE → RESEARCH → DESIGN_READY → CENTRAL_REVIEW →(可选 SOL_REVIEW)→ APPROVED
  → IMPLEMENTING → CHECKPOINT_READY → INTEGRATION_VERIFY → DONE`；驳回回相应阶段；**无已批准任务则 IDLE**。
- **不得自主扩功能**：把"跑一晚"翻译成无限加功能是被禁止的。**没有已批准任务就等待**，不自己创造工作。
  外部阻塞则落盘 BLOCKED 交 C，不无限付费重试。
- **Sol**：执行者**无** Sol 凭据、沙箱内无 codex。需审阅只在 outbox 投 `REVIEW_REQUEST`，由 C 的
  `sol-review` 唯一入口按预算调用。执行者不得改 `APPROVED`/预算/控制器（沙箱内只读，实测）。
- **秘密**：不读取、打印、复制任何凭据内容；只记 locator 与存在性/权限。
- **写入**：研究阶段仅 `/outbox /reports /tests /work /home /tmp` 可写；产品源码只读。实施路径仅在
  本组该任务 `APPROVED` 后由 C 逐条开放。详见 `permissions/allowlist.md`、`permissions/research-vs-implementation.md`。

## 各卡入口
| 组 | 目录 | 卡 |
| --- | --- | --- |
| S Server 产品服务 | server | `S-server.md` |
| E 执行组合枢纽 | execution | `E-execution.md` |
| H ACP / Harness 接入 | harness | `H-harness-acp.md` |
| P 运行环境与资源插件 | platform | `P-runtime-resource.md` |
