# BE-LOOP-001 启动准备 · 复用结论（一页）

状态：**READY_FOR_I_REVIEW**　作者：C（后端中央协调者）　日期：2026-09-21
本轮性质：按任务修正——**暂停从零开发通用循环/多代理调度器，先评估复用**。
未消耗 Sol、未启动真实四组、未装/启用任何插件或 hooks、未改产品代码/树/服务。
证据见同目录 `evidence.md`。

## 本机实测（非 README 声明）
- qodercli / qoder **1.1.60**；codex-cli **0.155.1**。
- Qoder 可用模型含 **`Qwen3.8-Flash`**（四组执行者用）；Qoder 侧**无 "sol"**。
  codex 默认模型 **`gpt-6-astra`**；用户指定 `gpt5.6sol` 的确切标识**本机无法无凭据核实**，列为 I 启动前待办（不可用即上报，不静默替换）。
- **物理隔离可行**：`/usr/bin/bwrap` 存在，**非特权命名空间实测可用**（`bwrap --unshare-all … true` 退出 0）；docker/podman/firejail 缺 → 逐组"只读源码+白名单写+独立 tmp/cache"的真隔离能落地，**无需开全权限**。
- 原生调度/隔离原语齐备：`/loop`(Skill)、`ScheduleWakeup`、`Cron*`(durable 跨重启、one-shot/recurring、maxTurns/maxCredits)、子代理 `--agent/--agents`、`--worktree`、`--tools/--allowed-tools/--disallowed-tools`、`--permission-mode`、`--config-dir`、`--add-dir`、`--strict-mcp-config`、`-c/-r/--fork-session/--list-sessions`；codex `review --commit/--base`（headless 审阅入口）、`exec -s read-only`、`agents`、`resume/fork/queue`、`sandbox`。

## 选择
采用 **Qoder 原生能力 + bwrap + 一个极薄的 C 控制器**。
**不采用 oh-my-qoder 作引擎**（其 team 默认动作直接违反本轮硬边界——见下）。
**不需要 Agent Orchestrator**（本机 clone 未落地；原生 + bwrap 已覆盖，故未读其代码）。

## 已有能力覆盖什么（对应五问）
1. **五角色独立运行 / 传递任务**：原生子代理各自独立上下文；任务经 `control/` 版本化文件交接，不走聊天。✓原生。
2. **中断恢复 / 停止**：`--resume/--continue/--fork-session/--list-sessions` + durable cron + `ScheduleWakeup`；停止 = CronDelete + 只停本轮 C 拥有的子进程。✓原生。
3. **中央审批后才实施**：原生**不**自带 autopilot/持续续跑；C 把每组写入与调用 gating 在 APPROVED 状态文件之后。✓（比 OMQ 更安全，不会擅自推进）。
4. **是否默认自动 commit/push/merge/绕权限**：**原生默认否**——qodercli 默认询问式权限、无自动提交；`codex review/exec` 不 push。**OMQ 则默认**：`worker-commit-cadence.ts` 跑 `git add -A && git commit`、`conflict-mailbox.ts` 产 `git merge --no-ff` 到 leader 分支、`model-contract.ts`/`mcp-team-bridge.ts` 以 `--dangerously-skip-permissions`/`--approval-mode yolo` 启动 worker，并附 `autopilot/ralph/ultrawork/persistent-mode/stop-continuation` 无人续跑——违反"禁 git add -A、保他人脏改、检查点由中央生成、不开全权限、无任务即 IDLE"，故弃用其引擎。✓
5. **外部物理隔离 + 限额 reviewer 入口**：reviewer 入口原生有（`codex review --commit <SHA>`）；但十次预算/E 两预留/H≤3/原子扣减/去重/单实例锁**非原生**，隔离**非 qodercli 原生**需 bwrap 外部包裹。→ 部分覆盖，余为最小新增。

## 缺口 / 最少要补的代码（不新建"组织系统"）
- **A. Sol 预算账本+闸门**：单 JSON 账本（总 10 / 预留 E 2 / H ≤3、调用前原子扣、失败计次、按消息 ID 去重、跨重启不重置、并发不占 E 预留）+ `codex review` 单写封装；执行者只能提交申请、无 codex 凭据。
- **B. 逐组 bwrap 启动封装**：`--ro-bind` 全源码只读 + 精确 `--bind` 白名单可写 + 独立 tmp/cache/HOME + 隐藏他组目录 / 宿主 home / 集成树 / 共享 `.git` 写 / 服务控制入口；模型认证走最小暴露通道。C 在沙箱外核验改动范围并生成检查点提交。
- **C. C 的相位状态机 + 幂等 outbox + 单实例锁 + 崩溃恢复**：durable cron 只给"唤醒"，持久状态/去重/阶段流转是 C 的一小段脚本（非框架）。
- **D. 模型标识确认**：`Qwen3.8-Flash` 就绪；Sol 确切 id 交 I 启动前安全核实。
- **E. 基线**：共同起点 `b067c571…`（integration/linux-native-0，实测 clean，与 development-baseline.json 一致）已核；Pi 线 `e2ec0ef2…`（work/pi-loop-0，含脏改）单列、不并入、不悄改基线。

## 不变项与停止点
组织边界、物理隔离要求、后端十次 Sol 预算**保持不变**。本结论通过 I 审阅后，再据 A–E 实施启动方案；本轮不自动转入正式运行。
