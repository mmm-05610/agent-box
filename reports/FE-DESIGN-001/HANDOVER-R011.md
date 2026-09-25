# FE-DESIGN-001 — 接管登记（R011）

登记时间：2026-09-22　接管者：mcode（前台会话，独立上下文机制）
上一执行者：Qoder 前台会话，**已由用户停止**（当日额度耗尽）。旧调度不重启。

本文件只登记事实与现状，不改写任何历史轮次的候选、反例、核验或收敛记录。

## 1. 从磁盘实际进度续接（不从头设计）

| 项 | 磁盘现状 | 出处 |
| --- | --- | --- |
| 循环状态 | `STATE=running`；`CURRENT_ROUND=9`；`CURRENT_PHASE=verify:failed`；`ROUND_STATUS=R009:verify_not_accepted` | `state.env` |
| 最近完成轮 | R008（六阶段全过；独立核验 10/12；0 判破） | `rounds.tsv` |
| 被裁定的候选字节 | `candidates/best.md` = `49df1e9345ab…`（R008 集成字节） | `candidates/best.digest` |
| 未集成的设计字节 | `rounds/R009/cand-A.md` = `cf554e67…`（补 S05/S11 删除表 + GenericWalk 契约；**因核验未过，从未集成进 best.md**） | `rounds/R009/` |
| 上一轮未完成的动作 | R010 只装配了 `verifier.prompt.txt`（10:54），调用被额度中止，**无任何产物** | `rounds/R010/` |

⇒ 续接点由记录决定，不由上一轮记忆决定：**先补 R010 的 verifier**，再开新轮。

## 2. 当前候选摘要

`candidates/best.md`（`49df1e9345ab`）核心赌注一句话：
宿主核心 = 命名空间化的 `(ns_id, local_id)` 资源目录，每资源一条单调 cursor 流；
投递规则只有一条 `subscribe(id, from_cursor=c)` 发 `seq >= c` 的**已存信封**再转 live；
`c` 的取值由订阅者自算（`0` 取新生成资源头部 / `cursor_resolve` 取 live 边 / `saved+1` 追赶，
跨 ns 重连则回 `0`）。适配器owns 开放 CapMap 与 ns 作用域类型化动作，另有类型化 `pump`。

已删除（据 `mechanisms.tsv`）：host-session、turn/role 信封字段、**host-event-store**、
host dedup/reorder、spawned set、payload 描述符存储、invoke_id、implicit live default、
持久 pair 记录、typed replay_policy、replay_mode、Subscription.last_seq、cross-ns edge。

## 3. 现账核对（未重置、未消费）

```
loopctl sol-status : cap=10 reserved=0 ok=0 bad=0 remaining=10 final_reserve=2; auto-dispatch=off; pending=0
loopctl sol-audit  : audit: budget record, reply artifacts and pending rows all reconcile
sol-budget.log     : 1 行（只有表头，即从未发生 Sol 调用）
sol/               : 空（0 个 reply 工件）
```

**结论：Sol 已消费 0/10，本次接管未重置、未改写预算记录。**

## 4. Sol 调用入口核查（结论：活动路径无有效入口 → 记录待审）

| 检查 | 结果 |
| --- | --- |
| `loopctl` 暴露的 Sol 子命令 | `sol-status / sol-init / sol-audit / sol-pending / sol-reserve / sol-complete / sol-on / sol-off` |
| `loopctl` 实际 source 的库 | `common validate ledger sol material converge handoff`（无 `solrun.sh`、无 `model.sh`、无 `phases.sh`） |
| `fn_sol_call()`（真正的模型调用）定义位置 | `lib/model.sh:60` — **退役库**，活动路径从不 source |
| `fn_sol_dispatch()` / `fn_sol_dispatch_manual()`（编排 + 材料装配 `fn_sol_pack`） | `lib/solrun.sh:126 / :178` — **活动路径从不 source** |
| 自动派发 | `auto-dispatch=off`；`sol-on` 标明 operator-only |

⇒ 活动路径保留了**额度记账**，但**没有"调用"这一步的实现**：RUNBOOK 要求的
`sol-reserve → 调用 → sol-complete` 三元组，中间一环在活动路径上不存在。
按用户指示「未获有效调用入口时记录待审，不绕过预算直调」：本轮**不发起任何 Sol 调用**，
置 `PENDING_INDEPENDENT_REVIEW=1` 待审，不手工拼 pack、不直接调 `codex`。

## 5. 未决阻塞（续接时必须先解的账）

| ID | 轮 | 严重度 | 状态 | 一句话 |
| --- | --- | --- | --- | --- |
| `FE-CE-019` | R009 | major | **OPEN，未经核验** | `read` 路径对 `OutcomeUnknown` **没有呈现规则** ⇒ 陈旧值被当作当前值（候选自己把"藏起不确定性"列为不合格项，却只在 `status` 通道设了防护） |
| `FE-CE-020` | R009 | major | **OPEN，未经核验** | `GenericWalk` 假定 `Result` 符合声明 schema；缺字段 / `null` 列表 ⇒ 伪完成或空白，静默出错 |
| `FE-CE-021` | R009 | minor | **OPEN，未经核验** | 嵌套声明 schema 误渲染，且"渲染深度"以 schema 编写义务的形式泄漏进适配器契约 |
| `FE-CE-007` | R002 | major | **OPEN（挂在被淘汰的 B 上）** | B 的 `edges.list` 越权；A 无该机制 ≠ 修好了 B；不得经判定门或回放门把它改成 REJECTED/pass |

R009 的两次 verifier 调用都因形状不合规被门拒（`outcome=bad`），**没有写入任何判定行**，
因此 019/020/021 保持 OPEN 并继续阻塞收敛——这是安全方向：未经核验的攻击既不算成立，也不会被忘掉。

## 6. 本轮两处重点（用户指定）

1. **事件回放承诺 与「无核心事件存储」是否自洽。**
   现候选同时主张两件互斥的事：投递规则发的是「**已存**信封」（`best.md` 第 7、50 行；
   S03 step1/step3/step4 写「Host **stores** for next subscriber」「delivers **stored** seq=21..35」），
   而 `mechanisms.tsv` 第 10 行与 `best.md` 第 173 行主张
   `host-event-store|removed|none`、「no extra host store, no host event store」。
   R007 只解掉了"同一 cursor 声明两种语义"，**没有解掉"被回放的那批信封存在哪里"**。
   → 本轮立为新反例并独立核验（见 `rounds/R011/attack.md`）。
2. **默认视图是否真正可行动**（不是"非空"）。载体是 R009 的 §4 Q1–Q3 与 GenericWalk 契约，
   即 019/020/021 所在的字节面。

## 7. 本轮的独立上下文机制与已知缺口（不冒充）

- 本机无 Qoder（已停、当日额度耗尽）。本轮的"独立上下文"由 **mcode 子代理**承担：
  角色拿到的是与设计者隔离的 prompt 与磁盘材料，产出经同一道 `loopctl` 机检门落盘。
- **缺口（如实标注）**：子代理与接管会话**同属一个模型家族**，因此它是
  「同模型、独立上下文」，**不是**设计简报所要求的"不同模型"级别的独立质量证明；
  它也不能替代 `gpt-5.6-sol` 的独立审阅。凡本轮判定，一律标注 `ctx=mcode-subagent`。
- 结论口径：机检门通过 ≠ 语义通过；语义结论只来自独立判定，且不得写成"产品/协议已验证"。

## 8. 边界

产品代码只读（未改 `repos/`、`worktrees/`）；未启停服务；未读凭据；无提交/合并/推送；
未派发实现任务；未重置预算；未调用 Sol。收敛只指设计候选，不指用户批准或实施。

## 9. 接管后续进展（本节随轮次追加，上方 §1–§5 保留为接管当时的快照）

接管发生在 round 9 / `verify:failed`；此后已完成两整轮，`candidates/best.md` 已两次换代。
**上面 §1–§5 的候选摘要不是最新状态**，最新状态以本节与 `latest-summary.md` 为准：

| 阶段 | 事件 | 候选字节 | 独立核验结果 |
| --- | --- | --- | --- |
| R010 | 补做 R009 遗留 verifier | 仍 `49df1e93…`（R009 设计未集成） | `FE-CE-019/020/021` 均 **holds**；`007 does_not_hold`（属 B） |
| R011 | 主攻重点(a) 回放 vs 无存储 | `fece1121311d…` | `FE-CE-022/023` holds，并新增 `024`；评审 17 条回放全 pass、**S01 判破**、6 条证据不足 |
| R012 | 修评审发现 + 修上一轮的修 | `25c36f4c40d8…` | `FE-CE-025/026` holds，并新增 `027`；评审结果见 `rounds/R012/ROUND-REPORT.md` |

结论速览：**重点(a) 已解决并获独立回放**（`host-event-store` 假删除被正名为
`cursor-stream-log|core`，保留期=资源存活期，处置点唯一；`FE-CE-024` 的"关闭即丢弃"被删）。
反例账 `open_major` 一度归 0，仅余 `FE-CE-007`（挂 B，不许动）。
**未收敛**：收敛需同时满足 12/12 场景独立通过、连续 3 个干净轮、以及计入收敛的
`gpt-5.6-sol` 最终独立核验——最后一条因活动路径无调用入口而**待审**（见 §4 与
`PROVENANCE-AND-GAPS.md`）。`clean_streak` 恒为 0 是因为每轮都在关 major（这是"干净轮"定义使然，
不是停滞）。
