---
id: "126"
slug: union-semantics-reconciliation
batch: b2
baseline: "d6fed59"
depends_on: []
write_paths: ["src/agent_box/server/model_configs/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0035
terminal: ["UNION_SEMANTICS_RECONCILED_DONE", "UNION_SEMANTICS_RECONCILED_PARTIAL"]
waive: []
parallel_units: ["composition", "guards"]
serialize_with: ["068", "069", "070", "072", "080", "081", "088", "090", "091", "092", "093", "094", "095", "096", "100", "102", "106", "107", "108", "109", "110", "111", "114", "116", "120", "121", "122", "127"]
---

# Work Order 126 — 并集回归**第一次真跑＝不绿**：`ProviderModelService.update` 上两套语义压在同一段（`QA-014`，高）

## Objective

**来源：QA/集成验证线的 `QA-014`（`confirmed` / **高** / 并集整体红，一手计数与归因）＋ ops 第 119 轮转单。**

`R-0035` 冻结合并 ⇒ **分支源码就是产品**，所以"两棵后端分支合起来还对不对"必须**真跑**。QA 线第一次跑了：

- base＝runtime `56af017`，合入 A `150c186`；`src/**`＋`tests/**` 冲突 **1**（R1 时 0）：
  **`src/…/model_configs/service.py` 的 `ProviderModelService.update`** —— A 的 `112` **`KEEP` 哨兵** vs runtime 的 `092` **`normalize_protocols/validate_endpoints`**，
  **互补却压在同一段** ⇒ **谁赢谁丢对面一条守卫**。
- **U-A（取 A 侧）**：`73 failed / 1052 passed / 21 skipped`，**退出码 1**。**U-R（取 runtime 侧）**：`48 failed / 1076 passed / 22 skipped`，**退出码 1** ⇒ **两个单边裁决都不绿**。
- 归因（每条都有同 pin 对照）：A-only 守卫 41 条（A 树同 pin `77 passed / 0 failed`）＋ runtime `092` 守卫 10 条（R 树同 pin `18 passed / 0 failed`）⇒ **≥53 条是合并引入**；20 条是**环境**（Worker 二进制不在）。
- 另一处**机械收口的代价**：`rename/rename` 的合同工件按"取 runtime 侧"收口 ⇒ 直接 8 条 `FileNotFoundError: …contract/wire-v1.schema.registered-…json`
  ⇒ 证明那条 docs 冲突**是测试承重的**，**合并不可能机械收口**。

**本单要的是**：把这两套语义**组合成一段并保住两侧的守卫**——或者**证明组合不可能**并把取舍写成**可裁决的一页**交回 ops/I。

**明确不做**：提合并、push、改 `R-0035` 的冻结；改 A 树任何文件（跨树**只读**核验允许）；删任何一侧的守卫来"让并集变绿"（那是把守卫换绿）。

## Current state（一手，`QA-014` 的 `merge-preview-r2.md` §1–§5）

| 事实 | 出处 |
| --- | --- |
| 冲突点＝`model_configs/service.py::ProviderModelService.update`（互补两段） | `QA-014` ＋ `merge-preview-r2.md` |
| U-A `73 failed / 1052 passed / 21 skipped`（EXIT=1）· U-R `48 failed / 1076 passed / 22 skipped`（EXIT=1） | 同上（命令与日志 `/tmp/qa-line/union-r2-UA.log`） |
| A-only 守卫 41 条／runtime `092` 守卫 10 条，各自同 pin 全绿 ⇒ ≥53 条合并引入 | 同上归因表 |
| 20 条环境红＝Worker `target/{release,debug}` 均不在（A/R 树同族也各红 18/19） | 同上 ＋ `E-011` |
| 机械收口 docs 冲突 ⇒ 8 条 `FileNotFoundError`（合同工件被 rename） | 同上 §附 |
| 本单持有者＝runtime（本树章程：`model_configs/**` 归本树；**共享文件必须串行**） | runtime 章程 §2 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `ProviderModelService.update` 的两段语义 | **组合**（KEEP 未识别字段 ＋ normalize/validate 已识别协议字段）——**在本树**做出组合版 | 互补不该二选一 |
| 两侧守卫 | A 的 `112` 守卫（`KEEP` 语义）**带进本树**（同 `116` 的单侧在场先例）＋ 本树 `092` 守卫**原地保留**；两者**同时绿**才算组合成功 | 守卫在场才能咬 |
| 组合不可能时 | **不许**删守卫凑绿：把"两种取舍各自的代价 ＋ 一线证据"写成**一页裁决材料**交回 ops/I（含 U-A/U-R 两侧计数） | `R-0032 ⑤`（分不清就交回） |
| 合同工件（docs 冲突那处） | 在本单**只做记录**：把"哪份工件、为什么是测试承重的、机械收口的 8 条 `FileNotFoundError`"写成可核对事实，**不**在 docs 上动手 | 归 `113`（工件/重锁） |

**必须保持不变**：`112` 的 KEEP 语义与 `092` 的 normalize 语义**各自的可判定行为**（组合后的合取必须同时满足两边的反例）；`R-0035` 冻结；`wire/**` 与本树边界。
**边界**：本单只在 `model_configs/**` 与测试内动手；**A 树只读**。

## Requirements

### Requirement: 两套语义组合后两边守卫同时绿

#### Scenario: KEEP ＋ normalize 合取

**WHEN** 同一段 `update` 同时服务"未识别字段必须原样保留"（A `112` 反例）与"已识别协议字段必须被归一/校验"（runtime `092` 反例）
**THEN** **两个反例同时绿**（不是二选一）

#### Scenario: 反例（门要能咬）

**WHEN** 把任一侧语义去掉（或让一侧赢）
**THEN** 对应的守卫**必须红**（本单的门就是这两条反例）

### Requirement: 组合不可能时交裁决，不删守卫

#### Scenario: 交回

**WHEN** 你判定组合在结构上不可能
**THEN** 交回的是一页**可裁决材料**（两种取舍各自的代价、U-A/U-R 计数、受影响守卫清单、建议），而**不是**删掉一侧守卫后的绿

## Stages

- [ ] 1. 观测：在**本树**复现两个反例各自绿（`112` KEEP 与 `092` normalize），并读 `merge-preview-r2.md` 的 U-A/U-R 计数（提交）
- [ ] 2. 组合实现（KEEP ＋ normalize/validate 合取）（提交）
- [ ] 3. 把 A 的 `112` 守卫**带进本树**（逐字或按本树路径适配，**不许改弱断言**）（提交）
- [ ] 4. 两条反例同时绿 ＋ 旧实现必红（提交）
- [ ] 5. 若不可能 ⇒ 一页裁决材料交回（含建议与代价）（提交）
- [ ] 6. 账与证据（含"并集不绿的两侧计数"引用与本次组合的定向计数）（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 合取 | KEEP 与 normalize 两个反例**同时**绿 | 去掉任一侧 ⇒ 门红 | fail (typed) |
| G2 守卫在场 | `112` 守卫在本树可跑（同 `116` 先例）＋ `092` 守卫保留 | 任一侧缺席 ⇒ 门红 | fail (typed) |
| G3 不删不弱 | 两侧守卫的断言**逐字未弱化**（diff 级） | 改弱 ⇒ 门红 | fail (typed) |
| G4 真 wire | 两条反例走**真实调用路径**（不是直调私有 helper） | 直调 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 两个反例在本树各自绿的一手 · 2. 组合实现 · 3. `112` 守卫在场 · 4. 两条反例同时绿（旧实现必红）· 5. 不可能时的一页裁决材料 · 6. 账与证据。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`UNION_SEMANTICS_RECONCILED_DONE`
- 否则：`UNION_SEMANTICS_RECONCILED_PARTIAL` + 精确剩余

## Notes for the executor

- **排序**：**插在 `120`/`122`（两条主路径）之后、`093` 之前**——它是**合并窗口**的第一硬前置（并集两个单边都不绿 ⇒ 现在提合并必红），也是 `AQ-0009`"主路径无已知未修缺陷"之外的第二条开窗前置。
- **别删守卫凑绿**：这一条写进 `Gates` 了；组合不可能时**交回**（`R-0032 ⑤`）。
- **前提待验**（`OF-02`）：计数与归因引自 QA 线一手（`merge-preview-r2.md` ＋ `/tmp/qa-line/union-r2-UA.log`）；第一步自己复核。
