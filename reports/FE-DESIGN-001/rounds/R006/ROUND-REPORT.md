# R005–R006 记录（部分轮，如实标注）

## R005 —— 恢复可信核验（无设计推进）
- 对固定的 R004 候选（`candidates/best.md`，sha256 `82e626862a16…`）重跑 `candidate-reviewer`，
  全部经活动入口 `loopctl handoff/accept` 落盘。
- **核验已可信**：`independently_ruled_covered=12/12`，判定行确实写入 `review-rulings.tsv`
  并绑定该摘要；此前被第二次判定调用清空的 12 条场景判定不再丢失。
- 故障现场保留为 `review-rulings.tsv.FAULT-SCENE-before-R005`（60 行，修复前状态）。
- 未手填任何通过数；回归测试 E5a–E5d 覆盖该缺陷。单测 101/0。
- R005 没有集成阶段，故**不记入轮次台账**、不计入干净轮数。

## 归属修正
- 新增 `subject` / `subject_note` 两列（第 10/11 列）。
- `FE-CE-007` → `B-alternative`：**保留 OPEN、挂在 B 账上**，不再阻塞 A
  （`deferred_to_discarded_alternative=1`）。淘汰 B ≠ 修好 B，摘要页显式印出这一条。
- `FE-CE-009` → `A-lineage`，仍为对 A 的**最小性争议**；本轮指示中明确
  "能防外部 id 泄漏"是答非所问，需正面必要性论证或删除实验。
- 其余行按证据文本逐条标注；**归属未知一律保守计为阻塞**。

## R006 —— 按 I 的五个重点攻击面（已完成到核验）
- planner 只授权 1 个候选并给出理由（B 已降级、无必需场景要求跨 ns 中继），且明确不动 FE-CE-007。
- designer 第 1 次调用**只回 24 词**：它试图"先写一个 design-loop skill 和 memory 笔记"再作答；
  无工具配置使该动作没有发生，门拒收空输出（调用异常不计通过）。重试产出 2823 词候选：
  含 T-Pi / T-Boring / T-Static 三条有序轨迹、4 个 `EXPERIMENT:` python 块、10 行类型化接口、
  以及对 FE-CE-009 的正面回答。
- attacker（维度 D01-order-dedup）落 **3 条 major，核验后全部维持 OPEN**：
  - `FE-CE-012` 宿主按 `(ns,resource,seq)` 去重是**空转**——seq 本就是宿主单调分配的；
  - `FE-CE-013` 适配器边界规则第 7 条把同样的去重写进适配器契约；
  - `FE-CE-014` "按 `(ns,resource,seq)` 重排" 因 seq 单值而**是恒等操作**。
  ⇒ 直接命中 I 的第 1、4 点：核心把"有序可重放事件流"当核心机制，但对静态/快照类内容
  它不提供任何去重或重排效力，却要求适配器按它写规则。
- 尚未做：integrator（必须正面处置这 3 条 major，不得靠改写不变式文本消解）、candidate-reviewer。

## 当前判定
`NO: reviewed_scenarios_without_an_owner=1; open_major_CE=3; clean_streak=1<3`
（`open_major_CE=3` 全部属 A 账；B 的 1 条不计入但仍 OPEN。）
Sol 仍 0/10、自动派发关闭；本轮无 Sol 调用。

## R006 后半程（integrator → 独立核验）

- 集成通过；保存候选锚点移至 `b6da557abfc4…`（2151 词，与本轮产物逐字节一致）。
- **`FE-CE-009` 以合格方式关闭**：不是宣称"能防越权"，而是用 Model2 可执行实验比较两种机制，
  然后**删掉** per-handle spawned/accessible set（§R6.2 明确不再维护），并把 `seq` 收窄为
  仅用于 cursor resume 与逐资源投递序的单调流索引。同时正面回答了 I 的第 5 点
  （受限资源集合 vs 更简单权限方案）：更简单的同命名空间订阅作用域通过 S08 并保持 S06。
- **独立核验把覆盖从 12 打回 9，判 3 个场景 `trajectory_broken`**：
  `S03`、`S10` 依赖 `cursor.resolve(...)` + "宿主重放错过的流"，而 `S08` step5 写的是
  "新事件是 live、**不**重放"。⇒ 修去重/排序时引入了关于"是否重放"的**内部矛盾**，
  不是措辞问题而是同一份文本同时断言两种语义。
- 归属守卫补上：核验者曾对属 B 的 `FE-CE-007` 在 A 的字节上记 `pass`——那等于"淘汰 B 说成修好 B"。
  现在记为 `not_applicable`，该行仍 `OPEN`、仍挂 B 账、未被盖回放戳；
  原文件留为 `review-rulings.tsv.BEFORE-ce007-correction`。新增测试 E6a–E6d（105 通过 / 0 失败）。

## 判定
`NO: covered=9<12; scenarios_ruled_trajectory_broken=3; clean_streak=0<3`。
A 账上未决 major 0（3 条新 major 经独立回放 pass 后关闭），未决 minor 1 = B 的 FE-CE-007（不阻塞 A）。
下一轮方向：先解掉"重放语义自相矛盾"（I 的第 2、3 点），再攻默认视图可用性与适配器成本。
Sol 仍 0/10，自动派发关闭。
