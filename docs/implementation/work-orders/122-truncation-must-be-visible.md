---
id: "122"
slug: truncation-must-be-visible
batch: b2
baseline: "d12e9917771f4be4972a8abd194b0b1fb8393e67"
depends_on: []
write_paths: ["src/agent_box/server/execution/**", "src/agent_box/server/bootstrap/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**", "src/agent_box/server/wire/**"]
ruling: R-0032
terminal: ["TRUNCATION_VISIBLE_DONE", "TRUNCATION_VISIBLE_PARTIAL"]
waive: []
parallel_units: ["stop-reason", "state-honesty"]
serialize_with: ["092", "108", "120", "121"]
---

# Work Order 122 — 回答被砍断时**系统必须知道并说出来**：状态不许照样写 `completed`（**主路径**，A 的第一手 T6-4）

## Objective

**来源：验收轮询 A 的第二轮 T6 第一手探针**（`docs/acceptance/t6-e2e-chain.md` 轮 2 §Y2 与 §9 的 `T6-4`）——A 明确要求**别并进 `108`**（`108` 是"64 token 太小"这个**量**的问题；本条是"截断**不可见**"这个**诚实性**问题）。

A 的判据是硬的：要 30 条成语，**只到第 4 条**、`text_len=89`、**句中停**，而

- 整份 `history.snapshot` 结果里**含 `trunc`/`stop`/`finish`/`max`/`cap` 的键＝0 个**；
- `execution.state` 照样是 **`completed`**。

⇒ 用户看到的是一句"完成了"的话说到一半没了，**而系统自己不知道/不说这件事**。这正是 `R-0032 ⑤`（别让信息在系统中间被吃掉）与
`R-0036`（失败可见）要防的形状；也让 `AQ-0009` 的"主路径无已知未修缺陷"无法成立。

**本单要的是**：**截断＝一个可判定的事实**，并且**在既有面可见**（执行结果/状态/转录）。

**明确不做**：把 `108` 的 `maxTokens` 参数化并进本单（那单已存在，且**量**与**可见性**是两个面）；
改 wire 方法集/协议字段（**见下"若必须新增 wire 字段"**）；改 `FAMILIES`；动 `092/120/121` 正在动的东西。

## Current state（一手，A 在 18790 上实测；ops 逐字引用）

| 事实 | 出处 |
| --- | --- |
| 长回答被截断：要 30 条，得 4 条，`text_len=89`，**句中停**；帧 81 条、`message.delta` 一路正常 | A 的 T6 轮 2 §Y2（`a-e2e-followup3.json`） |
| **快照里零个**含 `trunc`/`stop`/`finish`/`max`/`cap` 的键（A 做了整份键扫描） | 同处（判据＝键扫描，不是印象） |
| `execution.state` 仍是 `completed` | 同处 |
| 相关单：`108`＝`maxTokens` 参数化到部署（**量**，runtime 线） | manifest `108` |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 执行段的结果语义 | 被"上限/停止"砍断时，执行结果**带类型化 stop reason**（例：`MAX_TOKENS`／`OUTPUT_CAP`；**名字取既有词汇，不新造协议**），而不是无声 `completed` | 系统必须知道这件事 |
| 状态诚实 | 该情形下 `execution.state` **不许**只是 `completed`：要么给一个可区分的终态/标志，要么在既有 outcome 面带上那个 stop reason | `R-0032 ⑤` |
| 转录/客户端可见 | 让客户端**能**判出"这话被截断了"（哪怕只是既有字段的一个可区分值）；写清客户端该怎么读 | 用户视角 |
| **若必须新增 wire 字段** | **阶段 1 交回 ops**（不许自行发明字段）：我需要据 `AQ-0008`/`113` 的两仓重锁链（A 线出字段 → settings 线编 `wire-v1.ts`＋重生成工件＋登记新摘要对 → 桌面消费）另开**字段单** | 新增协议字段＝合同变更（`R-0032 ⑤`／审批口径） |

**必须保持不变**：既有终态词汇与 `EXECUTION_FAILED` 等既有码的语义；`108` 的射程；`wire/**`（属 A 树）。
**边界**：本单**只**做"生产侧 + 既有面可见"；字段级的新增走上面那条交回路径。

## Requirements

### Requirement: 截断是可判定的事实

#### Scenario: 触发上限

**WHEN** 一轮回答因输出上限被砍断（如 `108` 描述的 64 token 情形）
**THEN** 执行结果里出现**可判定**的 stop reason（机器可读），并且**不是**无声的 `completed`

#### Scenario: 反例（门要能咬）

**WHEN** 把行为退回当前实现（截断后仍报 `completed` 且无任何 stop reason）
**THEN** 本单新增的门**必须红**

### Requirement: 不误报

#### Scenario: 正常结束

**WHEN** 一轮回答**正常**结束（没有触发上限）
**THEN** 不出现任何"被截断"的标记（不许为了这单把所有轮次都标成可疑）

## Stages

- [ ] 1. 观测 + 定性：在本树复现"截断但 `completed`"（一手键扫描），并**第一手核对**执行段手里到底有没有这个事实（有 ⇒ 只是没说出来；无 ⇒ 先把它量出来）（提交）
- [ ] 2. 类型化 stop reason（沿用既有词汇，不新造协议）（提交）
- [ ] 3. 既有面可见（状态/outcome 的可区分值）＋ 客户端读法写进报告（提交）
- [ ] 4. 反例门（旧实现必红 + 正常结束不误报）（提交）
- [ ] 5. **若需要新 wire 字段 ⇒ 交回 ops**（写明"需要什么字段、给谁消费、影响哪张单"）（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 事实存在 | 截断 ⇒ 执行结果带类型化 stop reason | 退回旧实现（无声 completed）必须门红 | fail (typed) |
| G2 不误报 | 正常结束**不带**截断标记 | 全标可疑 ⇒ 门红 | fail (typed) |
| G3 可判定 | 客户端能用**既有**面判出该情形（报告写清读法） | 只有日志里有、客户端看不到 ⇒ 门红 | fail (typed) |
| G4 边界 | 未新增/未改 wire 字段；若确需 ⇒ 已交回 ops 并写明 | 自行发明字段 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 一手复现（键扫描）· 2. stop reason 类型化 · 3. 既有面可见 + 客户端读法 · 4. 反例门（含不误报）·
5. 字段需求（若有）交回 · 6. 账与证据。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`TRUNCATION_VISIBLE_DONE`
- 否则：`TRUNCATION_VISIBLE_PARTIAL` + 精确剩余

## Notes for the executor

- **排序**：**主路径**，与 `120` 同级 ⇒ **排在 `092/093…` 之前**（`AQ-0009`：主路径不得有已知未修缺陷；A 已把它列为 ACC-R4 的硬前置 ④）。
- **与 `108` 的关系**：`108` 解决"太短"；本单解决"砍了不说"。**两单各自收口**，不要互相吞并。
- **前提待验**（`OF-02`）：A 的键扫描与帧序是它第一手的；第一步自己复核，被推翻就交回。
