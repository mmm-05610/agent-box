# Qoder 原生循环能力核实记录（本机实测，不据网页猜参数）

核实时间：2026-09-21。方法：本机命令与工具定义。**网页仅作对照，未据其推断任何参数。**

## 1. CLI 侧（`qodercli 1.1.60`，`--help` 全量读数）

- **不存在 `loop` 子命令。** 子命令只有：
  `mcp plugins skills hooks agents login rollback update remote-control status commit feedback security wiki`。
  ⇒ 外层循环不在 CLI 参数层，而在会话内机制层。
- 角色隔离可用的实参（本机实测通过）：
  `-p/--print`、`--model <name>`、`--tools ""`（禁用全部内建工具）、`--no-session-persistence`、
  `--session-id <uuid>`、`--fork-session`、`-r/--resume [id]`、`-c/--continue`、`--list-sessions`、
  `--output-format text|json|stream-json`、`--max-output-tokens`、`--reasoning-effort`、`--thinking`。
- 实测证据：`qodercli -p --model Efficient --tools "" --no-session-persistence --output-format text`
  经 stdin 投喂提示词，返回预期文本、退出码 0。
- **不使用** `--dangerously-skip-permissions`、`--permission-mode bypass_permissions`、`--yolo`。

## 2. 会话内机制（本机工具定义与实跑确认）

| 机制 | 本机实际支持面 | 对设计循环的意义 |
| --- | --- | --- |
| `/loop` skill | dynamic 模式：执行→用 `ScheduleWakeup` 自选下次时机；`prompt` 原样再入；`stop:true` 结束；`delaySeconds` 被运行时夹在 **[60,3600]** | 外层"一轮一轮往前推"的驱动器 |
| `ScheduleWakeup` | `delaySeconds`/`reason`/`prompt`/`stop`；另有 `maxTurns`（跨整任务生命周期计数，重启不清零）、`maxCredits` | 循环的**轮次/额度**上界——但**不是 Sol 调用次数**上界 |
| `CronCreate` | 5 段 cron、`recurring`、`durable:true`（存盘、重启存活）、`expiresDays`、`maxTurns`、`maxCredits` | 固定节拍；本任务不需要 |
| `Monitor` | 每行 stdout 一次唤醒，`persistent` | 事件驱动唤醒（本项目无外部事件源，暂不用） |
| 子代理 | 每次 `Agent` 调用 = 新上下文；本机 5 个内置 agent（Explore/general-purpose/Plan/qoder-guide/statusline-setup） | 满足"每个角色独立上下文 + 文件交接" |
| `TaskCreate/Update/List` | 会话内任务清单 | 阶段边界与轮次记账（提示性，非强制） |

## 3. 覆盖判定

**原生足够**：外层持续循环、唤醒/停止、每角色独立上下文、会话与恢复、阶段清单。
⇒ 不需要自研守护进程、单实例锁、子进程表或 detach 机制。

**原生缺失**（正是允许补的最小适配件）：

1. **反例账与候选的强制持久化语义** —— 原生只有"自觉写文件"。
   需要：`design-loop/lib/ledger.sh` + `lib/material.sh`（未决项整表进 prompt、不截断）。
2. **输出不合格不得记为通过** —— 原生把子代理返回即视为完成。
   需要：`design-loop/lib/validate.sh`（区块标记、行法、词数下限、判定枚举）。
3. **Sol 十次调用的强制计数入口** —— `maxCredits/maxTurns` 约束的是循环轮次与额度，
   与"某模型的调用次数、失败也计次、重启不重置"不是一层。
   需要：`design-loop/lib/sol.sh`，且 `codex exec -m gpt-5.6-sol` **只能**经由它发出。

## 4. 未采用项

- 外部循环项目（brief 提到的 ralph-loop 等）与 `oh-my-qoder`：**未安装、未启用、未执行其代码**。
  如需考察，只在隔离目录阅读，不接入本任务运行时。
- 未安装任何全局插件，未修改任何共享配置（`~/.qoder/settings.json` 未被写入）。
