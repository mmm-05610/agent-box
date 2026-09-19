---
id: "133"
slug: subagent-roster-truncation-visible
batch: b2
baseline: "d3802aa"
depends_on: []
write_paths: ["src/agent_box/server/profiles/**", "src/agent_box/server/execution/**", "plugins/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**", "src/agent_box/server/wire/**"]
ruling: R-0046
terminal: ["SUBAGENT_ROSTER_TRUNCATION_VISIBLE_DONE", "SUBAGENT_ROSTER_TRUNCATION_VISIBLE_PARTIAL"]
waive: []
parallel_units: ["facts", "gate"]
serialize_with: ["068", "069", "070", "072", "080", "081", "088", "090", "091", "092", "093", "094", "095", "096", "100", "102", "106", "107", "108", "109", "110", "111", "114", "116", "120", "121", "122", "126", "127", "130", "131"]
---

# Work Order 133 — `list_subagents` 两处上限**静默截断**：描述超 160 直接切片、名册超 32 直接 `[:32]`（`AUD-B-017` confirmed/low）

## Objective

**来源：后端审阅者 `AUD-B-017`（`confirmed` / low）＋ ops 第 123 轮转单（含 ops 对"两案择一"的裁决）。**

审阅者实测：`list_subagents` 的两处上限都**静默截断**——描述超 160 字符**直接切片**、名册超 32 条**直接 `roster[:32]`**，
**两处都不记"发生了截断"这件事**。而 `65` 号单 `:35` **明确要求**「输出有界（条数与描述长度上限，**超限记截断事实**）」；
**同仓 hook 侧就有做对的对照**：`server_hook_triggers.summary_truncated`（列 ＋ 返回体 `"truncated": bool(...)`）——
即"**截断必须成为一个事实位**"，而不是让客户端从长度反推。

**ops 裁决（审阅者在 finding 里点名请 ops 裁"两案择一"）**：**取①＋②-as-facts**——
**加截断事实位**（沿用 hook 侧的命名形状，别另造一套）＋ 返回体带 `rosterTruncated`/`rosterTotal`（或同义键）；
**不取"类型化拒绝"**：名册是 **MCP 工具定义的内嵌部分**，拒绝会让**整个工具不可用**（与 `executions.list` 的语义不同）。
⇒ **若你一手证据表明"事实位"这种形状会让客户端误用**（例如工具定义消费方无法表达"被截断"），**交回 ops 复议**，**不要**自行改成拒绝。

**明确不做**：改 `65` 号单的上限数值（160/32 是那单定的）；改名册的语义（谁是子代理）；改 `wire/**`；改 hook 侧既有形状（**只对齐命名**）。

## Current state（一手，`AUD-B-017`；ops 逐行核过本树）

| 事实 | 出处 |
| --- | --- |
| 描述超 160 ⇒ 直接切片；名册超 32 ⇒ 直接 `roster[:32]`；**都不记截断事实** | `AUD-B-017` |
| `65` 号单 `:35` 明确要求「超限**记截断事实**」 | 同上 |
| 同仓对照：hook 侧 `server_hook_triggers.summary_truncated`（列＋`"truncated": bool(row[...])`） | 本树 `src/agent_box/server/hooks/triggers.py:81,114`（ops 实读） |
| 相关实现位置 | `src/agent_box/server/profiles/subagents.py:63`（`resolve_roster`）· `src/agent_box/server/execution/delegation.py:64`（`list_for`） |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 描述截断（>160） | 该条**带截断事实位**（**沿用 hook 侧命名形状**；含原长度或剩余字数，二选一说清） | 客户端不许从长度反推 |
| 名册截断（>32） | 返回体带 `rosterTruncated`/`rosterTotal`（或与 hook 侧对齐的命名）；**不做类型化拒绝**（ops 已裁） | 工具定义内嵌，拒绝会让工具不可用 |
| 门 | **两条反例**：`>160` 字符与 `>32` 条**各一条**（审阅者指出"今天两条都写不出来，因为返回体里根本没有可断言的事实位"）⇒ 门在两个方向上都必须能咬 | 让"记事实"可判定 |
| 命名对齐 | 报告里给出与 hook 侧的**命名对照**（同形状、不另造） | 一处真相 |

**必须保持不变**：上限数值（160/32）；名册/描述的既有内容语义；hook 侧既有形状；`wire/**`。
**边界**：若改动需要落到 `server/profiles/**` 之外的第三处（或你判断该路径不在本树写面）⇒ **交回 ops** 并附行号。

## Requirements

### Requirement: 截断成为事实位

#### Scenario: 描述超限

**WHEN** 某子代理描述超 160 字符
**THEN** 该条带**可断言的截断事实**（含原长度或剩余字数），命名与 hook 侧同形

#### Scenario: 名册超限

**WHEN** 名册超过 32 条
**THEN** 返回体带 `rosterTruncated`/`rosterTotal`（或同义键）——**不是**类型化拒绝

#### Scenario: 反例（门要能咬）

**WHEN** 把实现退回当前（静默截断）
**THEN** 本单新增的**两条**门**必须红**

## Stages

- [ ] 1. 观测：一手复现两处静默截断（两方向各造一次，记返回体原文）（提交）
- [ ] 2. 描述侧事实位（对齐 hook 命名）（提交）
- [ ] 3. 名册侧 `rosterTruncated`/`rosterTotal`（**不拒绝**）（提交）
- [ ] 4. 两条反例门（退回即红）＋ 命名对照表（提交）
- [ ] 5. 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 描述事实 | `>160` ⇒ 该条带截断事实（可断言） | 退回静默切片必须门红 | fail (typed) |
| G2 名册事实 | `>32` ⇒ 返回体带 `rosterTruncated`/`rosterTotal`（**非拒绝**） | 退回静默 `[:32]` ⇒ 门红 | fail (typed) |
| G3 命名对齐 | 与 hook 侧同形（对照表在场） | 另造一套命名 ⇒ 门红 | fail (typed) |
| G4 不回归 | 上限数值、名册与描述内容语义、hook 侧形状不变 | 任一变红即门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 两处静默截断的一手复现（返回体原文）· 2. 描述侧事实位 · 3. 名册侧两键 · 4. 两条反例门 ＋ 命名对照 · 5. 账与证据。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`SUBAGENT_ROSTER_TRUNCATION_VISIBLE_DONE`
- 否则：`SUBAGENT_ROSTER_TRUNCATION_VISIBLE_PARTIAL` + 精确剩余

## Notes for the executor

- **排序**：**排在 `122`/`126` 之后**（非主路径）；与 `131` 同族（"声明/执行各记一本账"），批末由 `132`（A 线）统一对账。
- **ops 已裁的那一条别自己改**：**不做类型化拒绝**（工具定义内嵌）；有反证 ⇒ **交回**。
- **前提待验**（`OF-02`）：行号引自 `AUD-B-017` 与 ops 实读；第一步自己复核。
