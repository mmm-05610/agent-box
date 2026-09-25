# FE-DESIGN-001 — 运行手册（原生循环 + 三个适配件）

外层调度交给 Qoder 原生 `/loop`。本目录只保留原生做不到、且必须被强制的三件事：
交接、机检门、预算扣减。产品代码只读；不启停服务；不提交/合并/推送；不派实现任务。

## 每轮做什么（顺序固定）

```
1  loopctl handoff planner   RNNN                    # 装配 planner 的只读材料
   <无工具子调用，产出文本>                            # 角色 = qodercli -p --tools "" …
   loopctl accept planner    RNNN <file>              # 过门并落盘，不过门则记 bad
2  同上 designer   → 每个候选一份 cand-<id>.md
3  同上 attacker   → 反例行并入 counterexamples.tsv（提议 ID 会被重编号为规范 ID）
4  同上 verifier   → 判定 holds / does_not_hold / insufficient_evidence
5  同上 integrator → 修订、删减、候选与场景归属
6  同上 candidate-reviewer → 绑定候选字节摘要的独立核验（唯一计入收敛的判定）
   loopctl status                                     # 一页状态
   loopctl convergence                                # 确定性收敛答案
```

角色调用形态（能力被移除，不是请求它自律）：

```
qodercli -p --model Efficient --tools "" --no-session-persistence \
         --output-format text < rounds/RNNN/<role>.prompt.txt
```

## 命令

| 目的 | 命令 |
| --- | --- |
| 当前状态 | `control/design-loop/loopctl status` |
| 装配某角色的材料 | `loopctl handoff <role> RNNN [附加文件…]` |
| 接收并落盘角色输出 | `loopctl accept <role> RNNN <输出文件>` |
| 收敛判定 | `loopctl convergence` |
| 预算 | `loopctl sol-status` / `sol-reserve` / `sol-complete` / `sol-audit` |
| 自动派发开关（默认关） | `loopctl sol-on` / `sol-off` |
| 循环本体 | `/loop`（dynamic）；停止=本轮不再排程；重开=再输一次 `/loop` |

## 停止与恢复

- **停止**：不再调用 `ScheduleWakeup`，或调用 `stop:true`。
- **恢复**：重新 `/loop`。计数、反例、候选全部来自磁盘，因此恢复点由记录决定，
  不由上一轮的记忆决定（已实测：重开后第一拍从 tick=5 续到 tick=6）。
- **无总轮数、无总时长上限**；唯一的上界是单次调用超时与连续失败阈值（那是故障保护，不是轮数）。

## 三条不可违反的规则

1. Sol 只能通过 `loopctl sol-reserve` → 调用 → `sol-complete` 这条路径发生；
   预留先于调用，失败也计次，重启/换工具/跨日均不重置。
2. 角色输出未过机检门 = 记为 bad 且**不落任何产物**；机检门通过也**不等于**语义通过，
   语义结论只来自 candidate-reviewer 对同一字节摘要的判定。
3. 反例只增不改：状态可变、严重度只可升级、原始不变式文本永不覆盖；
   未决项整表进入下一次材料，不得截断。
