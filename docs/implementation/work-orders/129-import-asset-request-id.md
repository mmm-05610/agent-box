---
id: "129"
slug: import-asset-request-id
batch: b2
baseline: "1753f6f"
depends_on: []
write_paths: ["src/agent_box/server/wire/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-runtime-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0046
terminal: ["IMPORT_ASSET_REQUEST_ID_DONE", "IMPORT_ASSET_REQUEST_ID_PARTIAL"]
waive: []
parallel_units: ["idempotency", "gate"]
serialize_with: ["068", "069", "070", "072", "080", "081", "082", "083", "084", "085", "086", "087", "089", "097", "098", "099", "101", "103", "104", "105", "112", "113", "115", "117", "118", "119", "123", "124", "125", "128"]
---

# Work Order 129 — `accounts.importAsset` 收了 `requestId` 却**一次都没用**：重试不回放、也不给 `CONFLICT_REQUEST`（`AUD-B-012` confirmed/medium）

## Objective

**来源：后端审阅者 `AUD-B-012`（`confirmed` / medium）＋ ops 第 120 轮转单。**

审阅者实测：**已锁的契约要求 `requestId`**，而 `accounts.importAsset` 的处理函数**一次都没用它**——
同族的 `accounts.create` / `accounts.bind` 都把它送进**幂等层**。后果：

- **重试不回放**（同一次导入重发会再执行一遍），也**不给 `CONFLICT_REQUEST`**；
- 另一处：`write_asset` **每次调用都新铸一个 locator** ⇒ 同一份资产重复导入会得到不同 locator（幂等键天然对不上）。

**本单要的是**：`importAsset` 按契约把 `requestId` 用起来（与同族两法**同一条路**），并让"重试＝回放"**被门咬住**。

**明确不做**：改契约里 `requestId` 的语义；改 `create`/`bind` 的既有幂等行为；改资产的字节/校验语义（只修"同一请求重试"与"locator 铸造时机"这两点）。

## Current state（一手，`AUD-B-012`）

| 事实 | 出处 |
| --- | --- |
| `accounts.importAsset` 契约要求 `requestId`，处理函数未使用 ⇒ 无回放、无 `CONFLICT_REQUEST` | `AUD-B-012` |
| 同族 `accounts.create` / `accounts.bind` 已把它送进幂等层（可作对表基准） | 同上 |
| `write_asset` 每次调用**新铸 locator** | 同上 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `importAsset` 的 `requestId` | 走**与同族两法相同**的幂等路径：同 requestId 重试 ⇒ **回放**；冲突 ⇒ `CONFLICT_REQUEST` | 契约已锁，实现要对齐 |
| locator 铸造时机 | 同一逻辑请求内**稳定**（幂等键才能对上）——若与 `write_asset` 的现状冲突 ⇒ 交回并附一手证据 | 幂等的必要条件 |
| 门 | **反例门**：同一 `requestId` 发两次 ⇒ 第二次**回放**（且不产生第二份 locator）；不同 requestId 的同内容 ⇒ 按契约给冲突/新建 | 让"重试=回放"可判定 |
| 对表 | 报告里给出三法（`create`/`bind`/`importAsset`）的幂等行为**对照表** | 同族不许三套 |

**必须保持不变**：`create`/`bind` 的既有幂等语义；`requestId` 的契约含义；资产内容与校验。

## Requirements

### Requirement: 重试即回放

#### Scenario: 同 requestId 两次

**WHEN** 用**同一个** `requestId` 调 `accounts.importAsset` 两次
**THEN** 第二次**回放**第一次的结果（不重复执行、不新铸 locator）；冲突语义按契约（`CONFLICT_REQUEST`）

#### Scenario: 反例（门要能咬）

**WHEN** 把实现退回当前（不用 `requestId`）
**THEN** 本单新增的门**必须红**

### Requirement: 同族一致

#### Scenario: 三法对照

**WHEN** 读报告
**THEN** `create`/`bind`/`importAsset` 的幂等行为**对照表**在场，差异处有依据

## Stages

- [ ] 1. 观测：一手复现"同 requestId 两次 ⇒ 执行两遍、locator 两个"（提交）
- [ ] 2. `importAsset` 接入幂等路径（与同族同一条）（提交）
- [ ] 3. locator 铸造时机稳定化（或交回并附证据）（提交）
- [ ] 4. 门：同 requestId 回放 ＋ 冲突语义 ＋ 反例（退回必红）（提交）
- [ ] 5. 三法对照表 ＋ 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 回放 | 同 `requestId` 两次 ⇒ 回放、不重复执行、不新铸 locator | 退回旧实现必须门红 | fail (typed) |
| G2 冲突语义 | 冲突时给 `CONFLICT_REQUEST`（与同族一致） | 给错码 ⇒ 门红 | fail (typed) |
| G3 同族一致 | 三法对照表在场且差异有据 | 只改一法、无对照 ⇒ 门红 | fail (typed) |
| G4 不回归 | `create`/`bind` 的既有幂等测试逐字不变 | 任一变红即门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 一手复现 · 2. 接入幂等路径 · 3. locator 稳定化（或交回）· 4. 门（含反例与冲突语义）· 5. 三法对照表 ＋ 账。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`IMPORT_ASSET_REQUEST_ID_DONE`
- 否则：`IMPORT_ASSET_REQUEST_ID_PARTIAL` + 精确剩余

## Notes for the executor

- **排序**：排在 `128` 之后（同为 wire 面；它与 `128` 都是"声明面 vs 实现面不一致"同族）。
- **前提待验**（`OF-02`）：引自 `AUD-B-012`；第一步自己复核（同族两法可作对表基准）。
