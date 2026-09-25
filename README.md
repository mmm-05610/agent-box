# control/ — the single current scheduling and decision record

**当前编队（2026-09-23 用户重开授权）：** [HD-002](missions/HD-002/README.md)，[启动命令与提示词](missions/HD-002/START.md)。上级 Codex/gpt-6-sol，下级 Qoder；旧会话已由用户关闭，新树承接交付，主线与隔离 Profile 插件并行。Provider/Model 仅设计，预算沿用 HD-001 原账本。下文旧派工保留历史，不能复活旧队列。

This directory is a **dedicated Git repository** that holds only non-secret
scheduling and decision text. It replaces the old `docs/implementation/` authority
in `agent-box-server-round1`, which is now **retired history**.

## What is in force

**后端恢复（D-0031）：**[协调 v2](backend-loop/COORDINATION-V2.md)，
五会话完成暂停交接后按中央任务板恢复；阶段交付不等于整体完成，单项阻塞不停止全队。

**当前启动方式（D-0029）：**[原生 goal](backend-loop/GOAL-START.md)，
五个 Qoder 会话，允许研究、中央审批后实施和集成。不再以 G1/G2 或完整沙箱为启动门槛；
旧 fake 控制器不用于正式派发，物理隔离未启用，原有职责与预算约束保留。

**后端组织方案（D-0028）：**[BE-LOOP-001](product/backend-coordinated-loop.md)
定义 S/E/H/P 四组、中央协调、物理隔离和独立十次 Sol 预算。
方案已定，尚未启动；先验收启动准备，再进入研究、审批与实施循环。

**最新方向（D-0027）：**前端实施暂停；正在确认
[Agent Desktop 设计目标与循环场景](product/agent-desktop-design-brief.md)。
下列 C1-001 实施任务已被此决定暂停，不能继续据旧范围执行。

**当前派工：**[C1-001 前端扩展架构](tasks/C1-001-frontend-first.md)，原 mcode
单写者继续；D-0026 暂停后端工作，优先通用核心、服务适配与组件插槽，待 ACK。

产品梳理入口：[C1 通用 Agent 会话](product/C1-agent-conversation.md)，含用户路径、
当前代码映射及模块边界；这是规划记录，尚未派发实现。

**当前入口：**[开发组织](development-layout.md) 与
[固定开发基线](development-baseline.json)。LNX-001/002/003 均已交付；
下表旧任务/审阅入口保留追溯，不能据其旧状态继续派工。

| File | Holds |
| --- | --- |
| [LNX-003-review.md](LNX-003-review.md) | 补查审阅及 LNX-002 测试阶段指导修正；等待执行者 ACK |
| [LNX-001-review.md](LNX-001-review.md) | I 的调查审阅、限定、集成决定及 LNX-002 / LNX-003 派工入口 |
| [tasks/LNX-001-qoder-audit.md](tasks/LNX-001-qoder-audit.md) | 已签发给 Qoder 的只读调查任务；报告写入 reports/LNX-001/ |
| [linux-native-baseline-plan.md](linux-native-baseline-plan.md) | 2026-09-21 实测盘点、Linux 优先统一检查点与业务分工提案（尚未派工） |
| [current-state.md](current-state.md) | what the product can do today, in three separate layers: implemented / integrated / user-tryable |
| [decisions.md](decisions.md) | the decisions currently in force, which ones replaced which, and what is unresolved |
| [backlog.md](backlog.md) | unfinished work, its source, dependency and the gap that blocks it |
| [workspaces.md](workspaces.md) | each preserved repository / worktree: purpose, owner status, how to restore it |
| [environments.md](environments.md) | known services, version sources, ports, data-root references, whether they may be touched |
| [migration-log.md](migration-log.md) | every move / archive / retirement performed by the cleanup and its verification result |

## Rules of use

1. **One writer per fact.** If you change a fact in one file, do not restate it
   in another; link to it. `current-state.md` describes, `decisions.md` authorises,
   `backlog.md` schedules; none of them may contradict another.
2. **`decisions.md` is append-only in substance.** To overturn a decision, add a
   new numbered entry that names the entry it replaces
   (`supersedes: D-0007`). Do not rewrite or delete the old entry.
3. **Never resolve a conflict by timestamp.** If two records disagree, keep both
   and mark the disagreement. `decisions.md` §"Unresolved" is where those go.
4. **This control directory does not inherit the old machinery.** It does not
   carry the `incremental-work-order` skill's mandatory polling loop, and it does
   not carry any previous session's writer identity. The old scheduler's loop
   stopped with its session; nothing here restarts it.
5. **No dispatch while no executor is appointed.** `backlog.md` is a record, not
   a queue. `I` appoints executors before anything is dispatched.
6. **No secrets.** This repository is a Git repository. Never record credential
   contents, tokens or key material here — only file paths, permission bits and
   the fact that a locator exists. `environments.md` documents credential
   *locators* only.

## Relationship to the archive

The full history of the old regime — its 81 numbered rulings, its 156 order
definitions, its daily polling ledger, its acceptance windows — is preserved
verbatim under [../archive/legacy-scheduling/](../archive/legacy-scheduling/)
with its provenance. This directory holds the *distilled present*, not a copy of
that history. Where this directory cites something, it cites it by id and points
at the archive rather than quoting thousands of lines.

## The one thing that must be asked about

Whether the product is usable by the user is a **user decision**. Nothing in
this directory may promote "the code is finished" into "the user can use it", and
no agent may write a user-acceptance verdict here.
