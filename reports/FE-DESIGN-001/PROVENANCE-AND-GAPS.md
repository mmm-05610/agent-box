# 核验来源与报告缺口（非生成文件，持久记录）

本文件补记 `latest-summary.md`（由 `loopctl summary` 生成）在当前阶段无法准确记录的两件事。
`latest-summary.md` 每次重新生成都会覆盖自身，所以正确来源记在这里。

## 1. 本阶段独立判定的真实来源（`latest-summary.md` 的 Sol 段落已过时）

`latest-summary.md` 的「Sol 审阅」段落是一段硬编码文字，写着
「上面 `sc_*` 判定来自 Qoder 角色的独立上下文，**不是** gpt-5.6-sol 的核验结论」。
这句在 R010/R011 已经**不成立**：Qoder 已被用户停止，本阶段所有角色判定来自
**mcode 子代理的独立上下文**（`ctx=mcode-subagent`）。

| 判定 | 产出者 | 上下文 | 模型独立性 |
| --- | --- | --- | --- |
| R010 `FE-CE-019/020/021` 判定 | mcode `verifier` 子代理（独立上下文，隔离 prompt + 磁盘材料） | 独立 | **同模型家族**，非设计简报要求的"不同模型"级独立 |
| R011 `FE-CE-022/023` 判定 + 新立 `FE-CE-024` | 同上 | 独立 | 同上 |
| R011 `S01–S12` 判定与 16 条回放 | mcode `verifier` 子代理（候选评审角色） | 独立 | 同上 |

**结论口径**：本阶段存在「独立上下文核验」，**不存在** `gpt-5.6-sol` 的独立审阅。
`PENDING_INDEPENDENT_REVIEW=1` 已置位。不得把同模型新上下文的判定冒充"不同模型独立核验"。

## 2. Sol 调用入口：活动路径缺失（结论：待审）

`loopctl` 暴露 `sol-reserve` / `sol-complete`（记账），但 RUNBOOK 要求的
`sol-reserve → 调用 → sol-complete` 三元组里，**中间"调用"一环在活动路径上不存在**：
`fn_sol_call()` 定义在退役的 `lib/model.sh`，编排与材料装配 `fn_sol_dispatch()` /
`fn_sol_dispatch_manual()` / `fn_sol_pack()` 在 `lib/solrun.sh`，
而 `loopctl` 只 source `common validate ledger sol material converge handoff` 六个库。

⇒ 既不能自动派发（`auto-dispatch=off`，`sol-on` 为 operator-only），也没有可照用的手工调用实现。
按用户指示「未获有效调用入口时记录待审，不绕过预算直调」：本阶段**零 Sol 调用**，
`cap=10 reserved=0 ok=0 bad=0 remaining=10 final_reserve=2`，未重置、未改写预算记录。

## 3. 控制器报告缺口（已观察，未修改控制器）

1. `fn_summary_write`（`lib/handoff.sh`）的「独立核验判定分布」块 awk 有语法错误
   （`END{x for (i in c) print i, c[x=i]}`），因此该块**恒为空**——虽然
   `review-rulings.tsv` 里 17 条 `ce` + 12 条 `sc` 判定都真实存在。
2. 同函数的 Sol 段落是硬编码，不随实际调用方变化（见第 1 节）。

按接管约束「不重建控制器」，以上只登记不改动。本阶段的实际判定分布见
`rounds/R011/ROUND-REPORT.md`。
