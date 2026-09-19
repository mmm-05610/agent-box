---
id: "127"
slug: gate-script-parity
batch: b2
baseline: "d6fed59"
depends_on: []
write_paths: ["scripts/server-round1/dsh-production-chain-gate.py", "scripts/server-round1/pi-production-chain-gate.py", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**"]
ruling: R-0035
terminal: ["GATE_SCRIPT_PARITY_DONE", "GATE_SCRIPT_PARITY_PARTIAL"]
waive: []
parallelism: "none"
parallelism_reason: "单线程：两份门脚本的对表与归一，产物不可拆（同一份指纹口径 + 两份文件，拆了要两次提交同一目录）。"
parallel_units: []
serialize_with: ["068", "069", "070", "072", "080", "081", "088", "090", "091", "092", "093", "094", "095", "096", "100", "102", "106", "107", "108", "109", "110", "111", "114", "116", "120", "121", "122", "126"]
---

# Work Order 127 — 门脚本的"两份真相"**已经**发生：共同 15 份里 **2 份分叉**（`QA-015`，中）

## Objective

**来源：QA/集成验证线的 `QA-015`（`confirmed` / 中 / 口径过期）＋ ops 第 119 轮转单。**

`QA-004` 立下的口径是 **`scripts/server-round1/**` 只有一个 owner 树＝A 树**，两棵树各带一份副本、靠**指纹一致**兜底。
`D-001` 曾记"两树 15 份门脚本 **md5 逐个 15/15 逐字相同**"。**QA 线本轮复算**：

- A 树现在 **16** 个门（独有 `ui_gates_89_leak_check.py`）、runtime **15** 个；
- **共同 15 个里 13 个仍逐字相同 / 2 个已分叉**：`dsh-production-chain-gate.py`、`pi-production-chain-gate.py`（**runtime 侧改**）。
- ⇒ "两份真相"从"**迟早**"变成"**已经**"，**而分叉的正是并集里 20 条环境红同族的 pi/dsh 生产链**。

**本单要的是**：把这 2 份**回归到一份**（承认 A 树是 owner），或者**把"为什么必须分叉"写成有据的一页交回**——
两条路都必须让**下一轮指纹比较**（QA 线每轮比）有确定结果：**要么 0 分叉，要么分叉已登记且有据**。

**明确不做**：改门脚本的判定语义来"让两侧看起来一样"（那是把差异藏起来）；改 `QA-004` 的 owner 口径（本单**执行**它）；动 A 树（跨树**只读**核验允许）。

## Current state（一手，`QA-015`；ops 引用）

| 事实 | 出处 |
| --- | --- |
| 门脚本数：A 树 **16** / runtime **15**；A 独有 `ui_gates_89_leak_check.py` | `QA-015`（`find … -name '*gate*.py' -o -name '*gate*.mjs'` ＋ 逐个 `md5sum`） |
| 共同 15 份里 **13 相同 / 2 分叉**：`dsh-production-chain-gate.py`、`pi-production-chain-gate.py`（**runtime 侧改**） | 同上（清单与更正见 `docs/qa/dedup-ledger.md` D-001 更正） |
| 分叉族与并集的 20 条环境红**同族**（pi/dsh 生产链） | `QA-014` 归因表 |
| owner 口径：`scripts/server-round1/**` 唯一 owner＝A 树（`QA-004`） | A 树章程 §2；本树章程 §2 同样写明「`scripts/server-round1/**` 属 A 树、本树只读引用」

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 2 份分叉的门脚本 | 与 **A 树当前版本**对表：① 若差异**无正当理由** ⇒ 归一到 A 的版本（owner 树）；② 若有正当理由 ⇒ 写成**有据的一页**（差在哪、为什么必须差、谁受影响）并**交回 ops** | `QA-004` 的 owner 口径 + `QA-015` |
| 指纹口径 | 在本树 `status.md` 记一行**可复算的指纹行**（两份文件的 md5 ＋ A 树对应 md5 ＋ 结论），供 QA 线每轮比较 | 让"0 分叉"可判定 |
| A 树独有那份 | **只在报告里引用**（它属 A 树；本树不复制、不追平） | owner 边界 |

**必须保持不变**：两份门脚本**判定语义**（归一 = 采用 owner 树版本，不是把两侧改成"都不判"）；本树 `write_paths` 外的任何文件。
**边界**：本单只写上述两份脚本 ＋ 测试 ＋ 账/报告；A 树只读。

## Requirements

### Requirement: 分叉要么归零、要么有据

#### Scenario: 指纹比较有确定结果

**WHEN** 对两份分叉脚本做归一或写清理由
**THEN** 本树 `status.md` 里出现**可复算的指纹行**：两份文件的 md5（与 A 树对应值）＋ 结论（归一／有据分叉）

#### Scenario: 反例（门要能咬）

**WHEN** 把任一份脚本改成一个**既非 A 树版本、也无据**的第三种形态
**THEN** QA 线的每轮指纹比较**必须报出分叉**（本单要把"比较命令"写进报告，使其可复算）

### Requirement: 不许藏差异

#### Scenario: 语义未被削弱

**WHEN** 读本单 diff
**THEN** 归一后的门脚本与 A 树版本**逐字一致**（或差异已在建议①里有据登记）；**没有**为了让两侧一样而删掉任何断言

## Stages

- [ ] 1. 观测：一手取两份文件的 md5 ＋ A 树对应值，`diff` 出差异点并判定"是否有正当理由"（提交）
- [ ] 2. 走两条路之一（归一 to A ／ 写有据的一页交回）（提交）
- [ ] 3. 指纹行写进 `status.md`（含比较命令原文）（提交）
- [ ] 4. 定向门 ＋ 账（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 指纹可复算 | `status.md` 的指纹行能就地复算（命令＋md5） | 只写结论不给命令 ⇒ 门红 | fail (typed) |
| G2 归一或有据 | 两份脚本与 A 树逐字一致，或差异有据登记 | 第三种形态 ⇒ 门红 | fail (typed) |
| G3 语义未削 | 归一后断言集合与 A 树版本相同（diff 级） | 删断言 ⇒ 门红 | fail (typed) |
| G4 不越界 | 只动这两份脚本 ＋ 测试 ＋ 账/报告 | 动 A 树或其它文件 ⇒ 门红 | fail (typed) |

## Validation

```bash
md5sum scripts/server-round1/dsh-production-chain-gate.py scripts/server-round1/pi-production-chain-gate.py
md5sum /home/maoqh/projects/agent-box-env-provider/scripts/server-round1/dsh-production-chain-gate.py /home/maoqh/projects/agent-box-env-provider/scripts/server-round1/pi-production-chain-gate.py
python3 -m pytest tests/server -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 差异点一手 ＋ 理由判定 · 2. 归一或有据登记 · 3. 指纹行（可复算）· 4. 定向门 ＋ 账。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`GATE_SCRIPT_PARITY_DONE`
- 否则：`GATE_SCRIPT_PARITY_PARTIAL` + 精确剩余

## Notes for the executor

- **排序（中优先，不插主路径）**：排在 `126`（并集语义，高）之后；**不阻塞** `093` 起。
- **口径提醒**：这份文件的 **owner 是 A 树**（`QA-004`）——归一是"**采用 owner 的版本**"，不是"改成你想的样子"；若你判断 owner 的版本**反而更差**，那正是要**交回**的情形（ownership 与内容质量是两件事，别自己合并）。
- **前提待验**（`OF-02`）：计数与分叉清单引自 `QA-015`；第一步自己复核（md5 就是一手）。
