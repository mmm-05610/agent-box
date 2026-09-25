# FE-DESIGN-001 — v0.1 交付检查点状态记录

刷新：2026-09-22T06:13Z　性质：**用户指定的评审检查点** —— 不是收敛、不是架构锁定、不是任务完成。

## 1. 当前候选摘要

```
id=A   candidates/best.md
sha256=b4f5c5cc46c41cbf59389bc99ab71b38819261b3a5da6e18a15d7a3cdd35c38e
上一代 = 25c36f4c40d8…（R012）→ R013 集成后换代，历史轮次字节仍存 rounds/、candidates/cand-A.R0xx.md
```

## 2. 实际阶段（不是"收敛"）

| 项 | 磁盘事实 |
| --- | --- |
| 轮次 | **R013 六阶段全部 `outcome=ok`**（plan / attack / verify / integrate / review）+ `rounds.tsv` 已有 R013 行 |
| 循环状态 | `STATE=paused-delivery round=13 phase=review:accepted`（**已按磁盘事实修正，见 §5**） |
| 反例账 | `CLOSED=34 / REJECTED=2 / OPEN=1`（唯一 OPEN 是 `FE-CE-007`，属已淘汰候选 B，不许动）；`open_major=0`；待独立回放 `=0` |
| 场景 | 集成者声称 12；**独立判定 5 ok / 6 判破 / 1 证据不足** |
| 干净轮次 | `0/3` |
| 收敛 | `NO: scenarios_independently_ruled_covered=5<12; scenarios_ruled_trajectory_broken=6; clean_streak=0<3` |
| Sol | `cap=10 reserved=0 ok=0 bad=0 remaining=10 final_reserve=2` —— **本次交付未新增调用** |

**下一步不由本会话开启**：等你围绕 v0.1 做取舍（见 `OPEN-QUESTIONS-V0.1.md` C 类）。

## 3. 验证来源（如实区分，不并列计数）

| 判定内容 | 产出者 | 上下文 | 模型 | 计入收敛？ |
| --- | --- | --- | --- | --- |
| **自测**：候选自带 10 个实验逐块执行 | 本会话 | 同上下文 | `mimo-v2.6-flash` | 否 |
| **同上下文复核**：结构自检（12 表、12 节、块标记、词数） | 本会话 | 同上下文 | `mimo-v2.6-flash` | 否 |
| **独立核验**：反例 `FE-CE-028…037` 成立与否 | `pi -p --no-tools --no-session` 调用 | **独立上下文** | `deepseek-v4-pro`（与本会话不同族） | 反例状态门 |
| **独立修订**：候选字节生成 | 同上机制 | 独立上下文 | `deepseek-v4-pro` | 产出字节，不自证 |
| **独立冷读**：S01–S12 轨迹判定 + 34 条反例回放 | `pi -p --no-tools --no-session`，**未看本轮任何推理** | **独立上下文** | `grok-4.7`（第三族） | **是——唯一计入收敛的判定** |
| **共享模型执行**：`python3 run.py repro / repaired` | 本会话执行 | 自测 | 模型只有 `mimo` 写的代码 | 否（只证明模型） |
| **Sol 最终独立审阅** | 未使用 | — | `gpt-5.6-sol` | **待审标记保留 `PENDING_INDEPENDENT_REVIEW=1`** |

**独立性提示（如实记录）**：verifier 的两次调用对 `FE-CE-034` 给出过**不同**结论
（首次 `does_not_hold`、因词数未过门被拒；重发后 `holds`）。按规则只有过门那次入账，
但该核验源在边缘条目上不稳定，属已知弱点。

**已知生成缺陷（未重建控制器）**：`latest-summary` 的"独立核验判定分布"块 awk 恒为空、
Sol 段为硬编码文字 —— 正确来源是本表与 `rounds/R013/*.meta`，详见 `PROVENANCE-AND-GAPS.md`。

## 4. 待审事项

1. **A 类硬伤（会让模型不成立）**：A1 场景步进表引用表内不存在的对象（6 判破 + 1 证据不足）；
   A2 候选自带实验 2/10 跑不过。二者都需一次 integrator 修订并重绑评审。
2. **B 类**：Sol 关键审阅未用（0/10）；认领机制未进共享模型；场景判定 5/12；干净轮次 0/3。
3. **C 类（等你选）**：C1 事件历史保留边界；C2 回退视图/schema 渲染是否为内置可替换扩展；
   C3 默认视图如何知道"在跑/已完成"（推荐 A / 备选 B）；C4 扩展选择策略谁赢。
4. `FE-CE-007` 维持 OPEN 在 B 账上，不结案、不修复、不阻塞 A。

## 5. 本次修正的记录（保留历史，不篡改）

| 记录 | 修正前 | 修正后 | 依据 |
| --- | --- | --- | --- |
| `state.env` | `STATE=running CURRENT_ROUND=9 CURRENT_PHASE=verify:failed LAST_DIMENSION=D05-fallback-unknown ROUND_STATUS=R009:verify_not_accepted` | `STATE=paused-delivery CURRENT_ROUND=13 CURRENT_PHASE=review:accepted LAST_DIMENSION=D11-long-run ROUND_STATUS=R013:all_phases_accepted` | `rounds/R013/*.meta` 六阶段 `outcome=ok`、`rounds.tsv` R013 行、`dimension.txt=D11-long-run` |
| `state.env` `REVIEWED_DIGEST` | `25c36f4c40d8…` | `b4f5c5cc46c4…` | **由 `loopctl accept candidate-reviewer` 自动写入**，非手工 |
| `_pt/model/run.repro.txt` | 修订前输出（S04/S11/MC_capacity_gap = GAP） | 修订后规则下的输出 | 修订前**逐字归档**为 `run.repro.pre-R013-integrate.txt` |
| `latest-summary.md` | 04:28Z 版（R012、`open_major=0 open_any=1`） | `loopctl summary` 重新生成（R013、`b4f5c5cc46c4`、实时收敛） | 控制器命令生成，非手写 |

历史文件一律未改写：`STOP-STATE-R012.md`、`HANDOVER-R011.md`、`TAKEOVER-R013.md`、
`rounds/R0xx/`、`review-rulings.tsv`、`counterexamples.tsv` 的历史行均保持原状。

## 6. 本次交付物

| 件 | 路径 |
| --- | --- |
| 1 抽象模型 | `MODEL-V0.1.md`（含职责收缩检查、推荐模型与备选） |
| 2 最小可执行模型 | `_pt/model/`（复用共享实验）+ `MODEL-V0.1-RUN.md`（一条命令 + 真实结果 + 缺陷分类） |
| 3 未决项 | `OPEN-QUESTIONS-V0.1.md`（A/B/C 各项含反例、影响、推荐、代价） |

## 7. 边界

只做设计与隔离实验；未改产品代码、未改后端任务、未重建控制器、未启停服务、未读凭据、
无提交/合并/推送、未派实现任务；Sol 预算与调用约束不变（0/10，本次未新增调用）；
后端会话不归本会话调度。**本记录不构成收敛声明或用户验收。**
