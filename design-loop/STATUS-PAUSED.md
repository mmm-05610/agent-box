# FE-DESIGN-001 控制层：暂停状态与原生能力评估

状态：**自研外层循环控制器停止开发**（用户 2026-09-21 指令）。代码、报告、台账全部保留，
未删除、未回滚。**产品循环从未启动**，因此没有"暂停中的运行"，也没有需要停的进程。

## 1. 自研控制器做到哪一步

写成了一个 bash 外层控制器（`design-loop/loop.sh` + `lib/*.sh` + `roles/*.md`）：

| 已实现 | 位置 | 证据 |
| --- | --- | --- |
| start/status/stop/resume/report/step 与单实例锁（按 pid 活性判定） | `loop.sh` | 自测 S6 通过 |
| 每轮 5 阶段：plan→design→attack→verify→integrate，各自独立上下文 | `lib/phases.sh` | 自测 S1 通过 |
| 每阶段原子落盘、prompt 与原文留档、meta 记录模型与调用次数 | `fn_atomic` / `*.prompt.txt` / `*.meta` | 自测 S1 通过 |
| 输出契约机检：区块标记、词数下限、台账行法、判定枚举 | `lib/validate.sh` | 自测 S2/S3 通过 |
| 无效输出与调用失败**不计为通过**，产物不落盘 | 同上 + `fn_run_phase` | 自测 S2「无产物提交」通过 |
| 断点续跑跳过已完成阶段，且**不重置**尝试计数与审阅预算 | `fn_phase_done` / `state.env` | 自测 S2 通过 |
| stop 只杀本任务记录的子进程组 | `logs/children.pids` + `fn_kill_child` | 自测 S6「无关进程存活」通过 |
| 反例台账永久保留 + 提议 ID→规范 ID 重映射 + 引用改写 | `lib/ledger.sh` | 自测 S7 部分通过 |
| 未决反例整表随 prompt 交接，标注 authoritative、不截断 | `lib/material.sh` | 自测 S8 通过 |
| Sol 预算：调用前扣减、失败计次、8+2 分池、同候选同问题不重发 | `lib/sol.sh` | 自测 S4 部分通过 |
| 收敛与停滞的确定性算术（不靠模型自评） | `lib/converge.sh` | 自测 S5 未通过，见下 |
| 受限的模型实验执行与记录 | `lib/experiment.sh` | 自测 S9 未通过（测试夹具缺陷） |
| 写入范围守卫：只允许运行目录内写 | `fn_reserve_path` | 自测 S10 部分通过 |

**自测结果：64 通过 / 14 失败**（`tests/selftest.sh`，全部使用假模型，未消耗任何真实调用）。

失败分类（如实记录，未继续修复）：

- **已定位原因 4 项**
  - S9×3：测试夹具 `verifier_experiment.txt` 缺 `FE-VERDICT` 块 → verify 阶段被契约拦下，
    实验根本没走到执行。**这恰好证明输出门有效**。
  - S7×2 的根因是设计性的：跨轮引用必须使用台账里交接的**规范 ID**；夹具在 R002 重新提议
    `FE-CE-900`，控制器正确地分配了新的规范行。要修的是夹具与契约表述，不是台账逻辑。
- **未定位原因 10 项**：S1×3 + S6×1（Sol 首次完整候选的派发端到端未落预算，`fn_sol_trigger`
  单独调用能出结果，链路中未复现成功）、S4×1（同键拒绝的分支）、S5×3（收敛算术在 with_libs
  上下文里返回 `NO:` 未达 `FINAL_REVIEW_DUE`）、S10×1（放行分支断言）。
  **未查清即声称可用是不可接受的，故本文件不宣称控制器已达可运行状态。**

## 2. Sol 使用情况

**0 / 10。** 权威记录：`control/reports/FE-DESIGN-001/sol-budget.env` + `sol-budget.log`
（本次由 `lib/sol.sh` 生成，作为零起点凭据）。模型标识已在**本机目录**核实存在，非猜测、非替换：
`codex debug models` → `gpt-5.6-sol`（`supported_in_api: true`，`visibility: list`）。
一次真实 Sol 调用都没有发生：控制器的假模型自测把 `CODEX` 指向 `tests/fake_sol.sh`。

## 3. 保留清单（切换后仍可复用）

- 产品目标与场景：`control/product/agent-desktop-design-brief.md`（S01–S12 未被削减）。
- 角色契约与判据：`roles/{planner,designer,attacker,verifier,integrator}.md`、
  `roles/scenarios.md`、`roles/judging-rubric.md`、`roles/attack-dimensions.md`。
  这层是**设计资产**，与用哪个调度器无关，原生循环可直接引用。
- 既有架构证据：`control/reports/C1-001/architecture/`（四份）与运行目录内的只读副本
  `reports/FE-DESIGN-001/material/`。
- 台账格式与语义：`counterexamples.tsv`（10 列，含提议→规范映射与回放列）、`scenarios.tsv`、
  `mechanisms.tsv`、`rounds.tsv`。空目录，无历史负担。
- 假模型自测框架：`tests/`，可继续用来验证任何后续方案（含原生方案的记账部分）。
- 产品代码：本轮只读，未改动；无提交、无合并、无推送；未启停任何服务；未读凭据内容。

## 4. 原生能力覆盖什么、缺什么

本机实测（qodercli 1.1.60；**参数取自本机二进制与本机 skill 文本，不据网页推断**；
文档 `cli/loop-reference` 已单独用 curl 取正文核对，二者一致）：

- `qodercli --help` 的子命令里**没有** `loop`：只有
  `mcp plugins skills hooks agents login rollback update remote-control status commit feedback security wiki`。
  循环是**会话内 slash command**，不是 CLI 参数。
- `/loop` 本机实证的旗标（在 1.1.60 二进制中找到解析式）：
  `--durable [N d]`、`--permanent|-p`、`--max-turns <N>`、`--max-credits <N[.dec]>`、`every <N><s|m|h|d>`。
- 落盘位置：项目 `.qoder/scheduled_tasks.json`，字段含 `fireCount`（与 `maxTurns` 比较）、
  `creditsUsed`（与 `maxCredits` 比较）。缺失值＝从未计量，文档明确这不等于 0。
- 两种唤醒通道（本机 skill 文本）：**Monitor** 事件驱动 / **ScheduleWakeup** 时间心跳；
  `delaySeconds` 被运行时夹在 **[60,3600]**；`stop:true` 结束；`prompt` 原样再入。
- **dynamic 模式只活在当前会话**；`--durable/--permanent` 适用于 fixed-interval 模式。
- 角色隔离的 headless 实参（本机实测可用）：`-p --model <name> --tools "" --no-session-persistence`，
  另有 `--session-id`、`--fork-session`、`-r/--resume`、`-c/--continue`、`--output-format`、
  `--max-output-tokens`、`--reasoning-effort`。

| 需要 | 原生机制 | 判定 |
| --- | --- | --- |
| 外层持续循环 | `/loop`（fixed + `--durable`，或 dynamic + ScheduleWakeup） | **足够** |
| 上界且重启不重置 | `--max-turns` / `--max-credits` 存于 `scheduled_tasks.json` | **足够**（但计的是**轮次与额度**） |
| 单实例 | 一个 durable 任务一个 id；`CronList` 可查 | **足够**，不需要自研锁 |
| 停止 / 状态 / 恢复 | `ScheduleWakeup stop:true`、`TaskStop`、`CronDelete/CronList`；重开即续 | **足够** |
| 每角色独立上下文 | 子代理每次调用即新上下文（本机 5 个内置 agent）；或 headless 无工具调用 | **足够** |
| 阶段边界与轮次记账 | `TaskCreate/Update/List` + 文件 | 够用，非强制 |
| **反例账与候选的强制持久化语义** | 无 | **缺** |
| **模型输出不合格时不得记为通过** | 无——子代理返回即视为完成 | **缺** |
| **Sol 十次调用的强制计数** | 无。`max-turns/max-credits` 与"某模型调用次数、失败也计次、切换工具不重置"不同一层 | **缺** |

结论：**调度、唤醒、上界、独立上下文、会话与停止全部用原生即可，自研守护进程应当废弃。**
真正缺的只有三件事，且都是"记账与门"，不是"编排"。

## 5. 最小切换方案（待 I 确认，本轮不实施）

1. **删角色，不删账**：废弃 `loop.sh` 的进程监督部分（锁、detach、子进程表、重试循环、
   `fn_run_round` 调度）。外层由 `/loop`（dynamic，1200–1800s 心跳）或 `CronCreate durable:true`
   承担；每轮由我在本会话依次派子代理做 attack/verify/revise，产物写文件。
2. **保留三个最小适配件**（各一处、可单测、由循环在固定时刻调用，而不是靠提示词自觉）：
   - `lib/ledger.sh` + `lib/material.sh` 的**交接件**：反例/场景/机制台账读写与
     "未决项整表进 prompt、不得截断"。
   - `lib/validate.sh` 的**门**：角色返回后先机检，不合格就记 `outcome=bad` 并重问一次，
     第二次仍不合格即记为未通过并留档——**不许把无效输出当通过**。
   - `lib/sol.sh` 的**唯一扣减入口**：任何 `codex exec -m gpt-5.6-sol` 之前必须先
     `fn_sol_reserve`，落盘 `sol-budget.env`；失败也计次；8 关键节点 + 2 最终核验分池；
     同候选同问题拒绝重发；重启/跨日不重置。Sol 调用只允许经由这一个函数发出。
3. **不装全局插件、不改共享配置。** `oh-my-qoder` 与 brief 里提到的 ralph-loop 等外部循环
   控制项目**仅作隔离阅读评估**，不启用、不执行其代码。
4. 上面 4 项之外不再增加任何基础设施。前端需要的是设计循环，不是通用多团队开发平台。
