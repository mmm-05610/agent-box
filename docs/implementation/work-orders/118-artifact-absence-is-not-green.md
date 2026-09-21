---
id: "118"
slug: artifact-absence-is-not-green
batch: b2
baseline: "bca77821fac530133d19a48bedea1d3f02969116"
depends_on: []
write_paths: ["scripts/server-round1/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-runtime-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0054
terminal: ["ARTIFACT_ABSENCE_IS_NOT_GREEN_DONE", "ARTIFACT_ABSENCE_IS_NOT_GREEN_PARTIAL"]
waive: []
parallel_units: ["classification", "gate"]
serialize_with: ["115", "117", "119"]
---

# Work Order 118 — "工件缺席"不许再算成绿：skip 是**静默降级**，必须在门与计数口径里显形（`QA-010`）

## Objective

**来源：`QA-010`（confirmed / 中高 / 环境与可复现性）＋ ops 第 111 轮转单（`R-0054 ①` 把 QA 线的面改挂给四位 owner；`OF-08` 记录了"冻结后无主"这条空白）。**

同一个 pinned sha（`093d36c`）上，**同一套用例**给出两种"绿"：**工件缺** ⇒ `18 failed / 961 passed / 21 skipped`；**只补工件** ⇒ `1 failed / 999 passed / 0 skipped`（分母同为 1000）。
⇒ 那 **21 条 `skipped` 不是"按设计跳过"，而是工件门控用例的静默降级**——账上看起来"没有红"，实际是**没跑**。
这与 `QA-007` 已经立下的口径（报计数必须附「Worker 工件在/不在」行）是同一件事，但 `QA-007` 只要求**人**写那一行；本单要求**门自己**把这件事变成**不可忽略的事实**。

**明确不做**：改"哪些工件该进版本控制"的产品/工程策略（那是决策，不是缺陷；若判定要为 `@agentclientprotocol/claude-agent-acp` 这类 UNTRACKED 闭包立规矩 ⇒ **交回 ops/I**）；
改被测行为；把红改成绿；改 `FAMILIES`/协议。

## Current state（一手，ops 核过）

| 事实 | 出处 |
| --- | --- |
| 同一 sha 两种结论：缺工件 ⇒ `18 failed / 961 passed / 21 skipped`；补工件 ⇒ `1 failed / 999 passed / 0 skipped` | `QA-010`，`docs/qa/findings.md`；归因见 `docs/qa/env-attribution.md` |
| 工件是 **git-ignore 的构建产物**：`workers/agent-box-worker/target/{debug,release}`（另 `.acceptance-bundle-c*`） | `QA-007`（两棵树章程 §2 已引用） |
| 本树（A）**有**工件；runtime 树**没有** ⇒ 同一 pypin 下两棵树计数天然不同 | ops 第 111 轮实测：A 树 `target/{debug,release,x86_64-unknown-linux-musl}` 在；runtime 树 `target/` 空 |
| `086 真 claude 父轮` 补工件后仍红，因为 `@agentclientprotocol/claude-agent-acp` 这个 npm 闭包 **UNTRACKED** | `QA-010`（runtime 树 absent、A 树 present） |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 门/套件的跳过路径 | 工件缺席时**不静默**：要么**显式失败**并给出 `ARTIFACT_ABSENT:<path>` 一类机器可读事实，要么在报告里把该批标成**"降级、不计绿"**（二选一，写清依据） | 静默 skip ＝ 账上的假绿（本单的病灶） |
| 计数口径 | 把这层落到 `QA-007` 的**可执行**形态：门/脚本**自己**输出「Worker 工件在/不在」那一行（不再只靠人写） | 让口径**不可漏写** |
| 反例门 | 构造"工件缺席"的受控场景（或对分类函数做单元级反例），断言**不许出绿**：退回到 skip-as-green 的旧行为 ⇒ 门必须红 | 与 101/115 同族的"单元门咬不到"教训 |
| UNTRACKED 闭包 | 把 `@agentclientprotocol/claude-agent-acp` 的缺席路径也走同一条"显形"机制（**只显形，不定策略**） | 同上；策略归 ops/I |

**必须保持不变**：被测产品行为；既有门在"工件在"时的判定；`QA-007` 的既有措辞（只做加强）。
**边界**：runtime 树那一份同源文件**不在本单写面**（跨树只读核验允许）；两树一致的机制见 `115` 的"在场清单"同款要求。

## Requirements

### Requirement: 工件缺席不许算绿

#### Scenario: 缺席显形

**WHEN** 在工件缺席的环境上跑这套门/计数
**THEN** 输出里出现**机器可读**的缺席事实（显式失败或"降级不计绿"标记），并且**账上不会出现"没有红 ⇒ 通过"**的读法

#### Scenario: 反例（门要能咬）

**WHEN** 把行为退回当前实现（skip 静默算绿）
**THEN** 本单新增的门/断言**必须红**

### Requirement: 计数口径自带那一行

#### Scenario: 报告自我披露

**WHEN** 跑一次全量或门并产出计数
**THEN** 输出**自带**「Worker 工件在/不在」一行（不依赖人记得写）

## Stages

- [ ] 1. 观测：同一环境复现两种结论（缺工件 / 补工件），把 21 条 skip 的**具体用例清单**与机制落表（提交）
- [ ] 2. 缺席显形（显式失败或"降级不计绿"，写清二选一的依据）（提交）
- [ ] 3. 计数口径落成"脚本自报"（含 UNTRACKED 闭包的缺席路径）（提交）
- [ ] 4. 反例门（退回 skip-as-green 必须红）（提交）
- [ ] 5. 账与证据（含"哪些工件该进版本控制"这一层**交回 ops/I**，不自行定策）（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 缺席显形 | 工件缺席时输出机器可读缺席事实（显式失败或"不计绿"） | 退回 skip-as-green 必须门红 | fail (typed) |
| G2 自报口径 | 计数输出自带「Worker 工件在/不在」行 | 删掉该行必须门红 | fail (typed) |
| G3 不误伤 | 工件在场时既有判定不变（计数与既有绿名单逐字一致） | 任一变红即门红 | fail (typed) |
| G4 反例可跑 | 反例场景有**可复算命令**（不是靠人描述） | 反例不可跑 ⇒ fail | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 两种结论的一手复现 + 21 条清单 · 2. 缺席显形 · 3. 口径自报 · 4. 反例门 ·
5. 策略层交回（不自行定策）· 6. 账与证据。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`ARTIFACT_ABSENCE_IS_NOT_GREEN_DONE`
- 否则：`ARTIFACT_ABSENCE_IS_NOT_GREEN_PARTIAL` + 精确剩余

## Notes for the executor

- **排序**：本单排在 `115`/`117` **之后**、`103` **之前**——它直接决定我们**每一份计数是否可信**（`AQ-0009` 要求主路径无已知未修缺陷，账不可信会让那条判据失效）。
- **前提待验**（`OF-02`）：两棵树的工件在场状态是 ops 第 111 轮一手 `ls` 的；第一步请自己复核，被推翻就交回。
- **不越界**：本单**只**做"显形"，**不**决定版本控制策略（那要 ops/I 拍）。
