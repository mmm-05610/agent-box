---
id: "102"
slug: contract-drift-two-faces
batch: b2
baseline: "fc961945b15074a710267b0ed055280b4e5495a4"
depends_on: []
write_paths: ["protocols/**", "workers/agent-box-worker/**", "src/agent_box/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0011
terminal: ["CONTRACT_DRIFT_TWO_FACES_DONE", "CONTRACT_DRIFT_TWO_FACES_PARTIAL"]
waive: []
parallel_units: []
---

# Work Order 102 — 两个合同面的漂移（Worker op 枚举落后 / 前端工件证据副本陈旧且诱导假绿）

## Objective

**来源：审阅者发现 `AUD-B-002` 与 `AUD-B-003`（均 confirmed / low），调度者合为一单**（两处都是"清单各自生长、
没人守第三个合同面"的同一形状，各一小段）。

1. **`protocols/worker/v1.schema.json` 的 `op` 枚举 22 项，实现与发送方 24 项**：缺 `home.put`（099 刚接上）、
   `workspace.get`、`workspace.list`、`attempt.write`、`stdin.close`；golden 无对应正例。
   该写面属 **45 §(a)**；**099 的 stage-3 发散门只钉 `main.rs` 的"实现集==分发集"，`protocols/**` 不在它 write_paths** ⇒ 第三个合同面无人守。
2. **后端树内的前端 wire 工件"证据副本"停在 33 方法**（`sha256:a1bd52a4…`，最后触碰 `391b76b`＝57 号单），
   与 081 登记的权威对（TS `1019b38b…` / 工件 `1a3604ee…`，**64 方法**）脱节；且它放在 `generated/` 目录、
   `wire-review.md` 四处称"证据副本" ⇒ **未来的门若把它当当前工件喂给 `AGENT_BOX_WIRE_SCHEMA`，会在只覆盖 33/64 的情况下全绿（假绿）**。

**明确不做**：改 wire 方法集或 Worker 路由行为；动 081 的登记规则；把两处漂移"顺手重构"。

## Current state（审阅者第一手，调度者核对）

| 事实 | 出处 |
| --- | --- |
| `op.enum` 22 项 vs `main.rs` 分发臂 24 项；差集恰为 5 op | `protocols/worker/v1.schema.json`；`workers/agent-box-worker/src/main.rs:318-490` |
| 发送方真实存在（不是死枚举） | `src/agent_box/server/execution/sidecar.py:593`（home.put）、`:419`、`:895`（workspace.list）、`ssh_connector.py:181`（workspace.get）、`plugins/.../client.py:334,341`（attempt.write/stdin.close） |
| 该 schema 历史上随 45 更新过 `home.*` 四 op，其后停更 ⇒ **是漂移不是冻结** | 审阅者提供 |
| 证据副本 33 方法、`sha256:a1bd52a4…`；权威工件 64 方法、`sha256:1a3604ee…` | `docs/server-round1/fullstack/generated/wire-v1.schema.json`；前端 `contracts/wire-v1/generated/` |
| 副本零消费者、事件面引用仍真（非行为缺陷） | 审阅者核对（`wire-review.md:369-371` 等四处的措辞） |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `protocols/worker/v1.schema.json` | `op.enum` 补 5 项；**golden 补 5 个正例**（沿用现有命名） | 合同跟上实现 |
| 门 | 把 099 stage-3 的"实现集==分发集"扩成**三元**（schema 枚举 / 分发臂 / golden），或在本单写面上立常驻门 | 第三个面有人守 |
| 证据副本 | 二选一：**①** 在 081 规则下刷新到权威对（`1a3604ee…`）+ 文件头写明"快照，权威在前端树 + 摘要"；**②** 移出 `generated/` 或改名带日期，消除"当前工件"暗示 | 防假绿 |
| 提示 | 在 `wire-review.md` 的引用处补一句：**门必须显式指 `AGENT_BOX_WIRE_SCHEMA`，不得默认取该副本** | 防误用 |

**必须保持不变**：Worker 的既有路由行为（099 刚接上的 `home.put` 不动）；golden 既有文件的命名与格式；
081 登记的重锁规则。

## Requirements

### Requirement: 三元一致（Worker 合同面）

#### Scenario: 补枚举与正例

**WHEN** 解析 schema 枚举、扫 `main.rs` 分发臂、列 golden 文件
**THEN** 三者的 op 集合**相等**（24 项），且 5 个新 op 各有正例 golden

#### Scenario: 反例

**WHEN** 从 schema 里删掉一个 op（或加一个没有分发臂的 op）
**THEN** 门**红**（gate 里给出这条反例的跑法）

### Requirement: 证据副本不再诱导假绿

#### Scenario: 指针或改名

**WHEN** 按 ① 刷新副本
**THEN** `sha256sum` == 前沿权威工件摘要，且文件头有"快照 + 权威位置"说明；
**WHEN** 按 ② 改名/移出
**THEN** `generated/` 下不再有可被误当"当前工件"的同名文件，`wire-review.md` 的引用同步更新

#### Scenario: 提示到位

**WHEN** 读 `wire-review.md` 相关处
**THEN** 有一句"门必须显式指 `AGENT_BOX_WIRE_SCHEMA`，不得默认取本树副本"

## Stages

- [ ] 1. 观测：三元差集与副本摘要（当场复算）（提交）
- [ ] 2. Worker 合同面：补枚举 + 5 正例 + 三元门（含反例）（提交）
- [ ] 3. 证据副本：按 ① 或 ②（写明选择理由）+ wire-review 提示（提交）
- [ ] 4. 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 三元一致 | schema 枚举 == 分发臂 == golden（24 op） | 删/加一项必须门红 | fail (typed) |
| G2 副本不诱导 | 摘要与权威一致**或**同名文件已不可误用；提示在位 | 留一个"看着像当前工件"的陈旧同名文件必须门红 | fail (typed) |
| G3 回归 | 既有 Worker/协议测试与套件计数入账 | 任一变红即门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/ -q
python3 -m pytest plugins/agent-box-harnesses/tests/ -q
sha256sum docs/server-round1/fullstack/generated/wire-v1.schema.json   # 与权威对比较
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 两处漂移都处理（或如实说明二选一的选择与理由）· 2. 反例（G1）· 3. 真机/真摘要证据 · 4. 回归计数
· 5. 账务与清理 · 6. status 分账。缺一项 ⇒ `CONTRACT_DRIFT_TWO_FACES_PARTIAL`。

## Acceptance

- 绿：`CONTRACT_DRIFT_TWO_FACES_DONE`
- 否则：`CONTRACT_DRIFT_TWO_FACES_PARTIAL` + 精确剩余

## Notes for the executor

- 来源是审阅者发现（`AUD-B-002`/`AUD-B-003`）；`docs/reviews/**` 不归你写（调度者标 `dispatched`）。
- 本单在 **b2 追加**；`protocols/**` 写权本单已声明（45 §(a) 的历史面，如与 45 的写面冲突以本单为准并在报告说明）。
