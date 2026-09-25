# R003 轮次报告（**未完成**，如实记录）

维度：`D08-reduction`。角色模型 `Qwen3.8-Flash`，无工具调用。Sol：**0 次**。

## 阶段结果

| 阶段 | 结果 | 说明 |
| --- | --- | --- |
| planner | ok | 换维度到 D08，问题直接对准 R002 独立核验失败的 5 个场景 |
| designer | ok | 2 个候选，3295 词，逐段过门 |
| attacker | ok | 新增 4 条反例 `FE-CE-008…011`（均 minor） |
| verifier | ok（第 2 次调用） | 第 1 次被词数下限拒；`FE-CE-009` 判 `insufficient_evidence` → 台账 DISPUTED |
| **integrator** | **bad — 未提交任何产物** | 两次重试用尽，见下 |
| candidate-reviewer | **未执行** | 没有新保存候选，跑了只会对旧字节产出失效判定（R002 已踩过这个坑） |

`rounds.tsv` 没有 R003 行：未完成的轮次不计入干净轮数。`candidates/best.md` 仍是 R002 的
`2d2dde14…`。

## integrator 两次拒收的实情（不都怪代理指标）

1. 第 1 次：报告段 1163 词 vs 下限 1200，第 2 段是 2577 词的完整候选 —— **误伤**，内容是实的。
   据此把该角色下限校准到 600，同时新增可核对要求 `CHANGES_VS_PREVIOUS:`
   （顺带补上摘要页里那个一直静默落空的"相对上版变化"字段）。
2. 第 2 次：`CHANGES_VS_PREVIOUS:` **确实没写** —— 这次不是误伤，是合格缺失。
3. 第 3 次：只输出了 1 个 `FE-OUT` 段（报告有了，修订后的完整候选没给）—— 契约要求两段，拒得对。

⇒ 结论：R003 的集成没有完成，且第 2、3 次是模型输出问题而非门的问题。按"失败也计消耗"的规则，
本轮 integrator 记 3 次调用，不再重试。

## 本轮机制层收获（校准，不是扩建）

- **词数下限当语义代理已在 3 个角色上误伤**（candidate-reviewer、verifier、integrator）。
  统一改成"较小下限 + 必须写出的具名声明"：
  reviewer 要 `BOUNDARY_SCAN:`/`ESCAPE_HATCH_SCAN:`；verifier 要
  `FABRICATION_CHECK:`/`CONTRADICTION_CHECK:`/`MISSED_CHECK:`；integrator 要 `CHANGES_VS_PREVIOUS:`。
  新门立刻各自抓到过一次真实缺失（缺扫描声明、缺变化说明），所以这是**收紧后被验证**，不是放水。
- 交接材料现在带**当前摘要下的未决核验判定**，并对失效判定显式标注
  `_N ruling set(s) above are VOID_`——之前把对空候选做的 12 条失效判定当未决项端给设计者，会误导。

## R004 安排

1. 从未完成处续做，不重跑已 ok 的阶段：把 R003 的 integrator 输出（`outs/integrator.R003.txt`
   报告 + `try2` 的候选）作为素材，让**新一轮 integrator** 在完整契约下重写并过门。
   已 ok 的 attack/verify 结论保留在台账里（`FE-CE-008…011`）。
2. 未决项不变：major `FE-CE-007`（跨命名空间协作不闭合）+ DISPUTED `FE-CE-009`
   + 独立核验仍未通过的 5 个场景（S01/S02/S04/S10/S12）。
3. 若 R004 的独立核验仍停在 7 条，就按 R002 报告的判断执行：问题在候选表达力，
   转构造替代候选，不再润色现版。
