# R002 轮次报告

维度（planner 指定）：`D10-cross-module`。角色模型 `Qwen3.8-Flash`，无工具调用。
本轮**未消费 Sol**（0/10，`auto-dispatch=off`）。

## 候选

- `rounds/R002/cand-A.md`、`rounds/R002/cand-B.md`
- 保留候选：`candidates/best.md`，sha256 `2d2dde14…`（此前 R001 的 `b93d2dbe…` 已因集成缺陷滞留，见下）

## 结果

- 攻击落 **4 条新 major**（`FE-CE-004…007`），核验者另自行补 `FE-CE-003`；台账当前
  **未决 major 1 条：`FE-CE-007`**（扩展无法从自身句柄导出外部命名空间 id，隔离只在注册边界实施
  ⇒ "可替换 runner 位于另一命名空间"时协作路径不闭合）。
- 7 条已关闭反例（`CE-001…007`）在当前摘要上被独立回放 `pass`。
- **独立核验（对修正后的字节）：S01–S12 中 7 条 `trajectory_ok`、5 条 `insufficient_evidence`、0 条判破。**
- 收敛：`NO: covered=7<12; reviewed_scenarios_without_an_owner=1; open_major_CE=1; clean_streak=1<3`。
  集成者仍自称 11 —— 独立核验只认 7，这个 4 条差额就是本轮的实际信息量。

## 本轮暴露的真实缺陷（机制层，已部分处理）

| # | 缺陷 | 后果 | 状态 |
| --- | --- | --- | --- |
| 1 | `commit_integrate` 的分发仍用 `fn_atomic`（`mv` 会搬走源），第二个目标拿到空源 | **保存候选滞留在上一轮字节**；核验因此是对旧字节做的 | 已修（改为各自 `cp`）+ 新增后置不变式：`best.md` 必须与本轮候选**逐字节相同**，否则该轮不算通过 |
| 2 | 我原先给的后置检查只判"存在且非空" | 抓不到#1 那种"过期但存在"，正是最坏情形 | 已按 #1 收紧 |
| 3 | `commit_review` 对同一 (轮次,摘要) 会重复追加判定行 | 判定计数虚高（回放行被记成 14 条） | 已改为幂等替换 |
| 4 | `reindex`（从已存档输出重算、不发模型调用）对"提交时会消耗输入文件"的阶段不成立：`attack.sec1.md` 已被 `mv` 走 ⇒ `reindex R002/attack` 被拒 | 重索引只能前向，不能整体重放 | **未修，已登记** |
| 5 | 词数下限当语义代理：核验者把篇幅花在判定表上就被反复拒 | 连续 3 次拒收（其中 2 次确实是它没做该做的检查） | 换成可核对要求：`require_scenarios=12` + 必须写出 `BOUNDARY_SCAN:` / `ESCAPE_HATCH_SCAN:` 两行声明；散文下限降到 200。**这是收紧**：新门立刻拒掉了一份缺声明的输出 |

## 模型调用消耗（如实）

- 本轮角色调用 **12 次**：planner 1、designer 1、attacker 1、verifier 1、integrator 1、reviewer **7 次**。
  reviewer 反复是两件事造成的：一是#1 让它对旧字节做了一次无效核验，二是#5 的契约在我改动后需要重跑。
  其中 `review.R001.try3` 那一次是**我自己重复粘贴造成的纯浪费**。
- Sol：**0 次**。

## 记录修复说明

`review-rulings.tsv` 一度出现同摘要重复行；已按 (轮次,摘要,种类,id) 去重，并从
`rounds/R002/review.content.txt`（已存档的模型输出，未再调用模型）补回 12 条场景判定。
原始文件保留为 `review-rulings.tsv.bak-before-dedupe`。

## R003 方向

1. 未决项集中且明确：`FE-CE-007`（跨命名空间协作）+ 5 条 `insufficient_evidence` 场景。
   这两者其实是同一个洞：**S08/S06 需要具名归属者与有序步骤**，而候选给的是结构说明。
2. 维度建议 `D03-identity-scope` 或 `D06-adapter-burden`（与 D10 不同轴，且直接压这个洞）。
3. 若 R003 的独立核验仍停在 7 条左右，说明缺陷在"候选表达力"而非"攻击角度"，
   应转为构造替代候选而不是继续润色。
