---
id: "145"
slug: workspace-connection-has-no-producer
batch: b2
baseline: "01d86f8"
depends_on: []
write_paths: ["src/agent_box/server/wire/**", "src/agent_box/server/sessions/repository.py", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-runtime-round1/**", "release/**"]
ruling: R-0046
terminal: ["WORKSPACE_CONNECTION_NO_PRODUCER_DONE", "WORKSPACE_CONNECTION_NO_PRODUCER_PARTIAL"]
waive: []
parallel_units: ["three-source-reconciliation", "decide-and-land", "gate"]
serialize_with: ["068", "069", "070", "072", "080", "081", "082", "083", "084", "085", "086", "087", "089", "097", "098", "099", "101", "103", "104", "105", "112", "113", "115", "117", "118", "119", "123", "124", "125", "128", "129", "132"]
---

# Work Order 145 — `workspace.connection` 在词汇表与编号集合里都在、**发射点为零**（`AUD-B-011` **needs_validation**）⇒ 「声明并预留」还是「多报」

## Objective

**来源：后端审阅者 `AUD-B-011`（`needs_validation`）＋ ops 第 132 轮转单。**

审阅者实测：`workspace.connection` 出现在**线名集合**（`wire/projection.py:31` 与 `:50` 的内→线映射）与
**`WIRE_VISIBLE_EVENT_KINDS`**（`sessions/repository.py:31`，⇒ 一旦产生就**占线序号**）里，
但 `grep -rn 'workspace.connection' --include=*.py src/agent_box` 的命中**全在声明、映射与投影消费**里——
**零个发射点**（没有任何 `_append_session_event(...)` / `append_turn_event(...)` 吃这个 kind）。

⇒ 这是 `097` 给 `server.hello` 立的那条形制的**镜像**：**097 治"漏报"（27/64），本条是"多报"**——
声明与编号都留着，服务端**永不出**这一味。**必须定档并落地**，二选一：

1. **有生产者（漏接）** ⇒ 把发射点接上（走真链，占线序号语义随之生效）；
2. **没有生产者（预留/多报）** ⇒ 二选一：**(a)** 从**线名集合**里删掉（词汇表不再是"多报"）；
   **(b)** **保留 id 但把"预留、服务端暂不出"写成事实**（照 `097` 的形制：**无规则覆盖的 id 若仍 `supported` 就要兜底钉死**）
   —— 若选 (b)，**必须**加门断言"**它不出**"（否则下一个人会以为它出）。

**明确不做**：动 runtime 两棵桌面树；改 `server.hello` 的能力计数口径（那是 `097` 的面）；改 `wire` 帧格式。

## Current state（一手，`AUD-B-011`）

| 事实 | 出处 |
| --- | --- |
| `workspace.connection` 在线名集合里（`projection.py:31`）且有内→线映射（`:50`） | `AUD-B-011` |
| 在 `WIRE_VISIBLE_EVENT_KINDS` 里（`sessions/repository.py:31`）⇒ 一旦产生就占线序号 | 同上 |
| `grep -rn 'workspace.connection' --include=*.py src/agent_box` ⇒ **零发射点**（命中全在声明/映射/消费） | 同上 |
| 形制先例＝`097`（`server.hello` 漏报 37 法：**无规则覆盖的 id 仍 `supported` 要兜底钉死**） | 同上 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 三源对账 | **声明**（词汇/映射）／**产生**（发射点）／**投递**（投影消费）三处逐一核（带 grep 原件） | `defect-mining-method §2.1` 的形制 |
| 落地 | 按上面 **1** 或 **2(a)/(b)** 落地**并写明选了哪一支＋判据** | 停在"疑似"＝这条规则最想消灭的形状 |
| 门 | **必带反例**：若选 **2(a)** ⇒ 断言"线名集合里不再有它"；若选 **2(b)** ⇒ 断言"**它不出**"（构造一次会发邻近 kind 的场景，断言这一味**不出现**）；若选 **1** ⇒ 断言发射点真跑出一帧**且占用线序号** | `OF-14`：门要走真腿 |
| 归属例外 | **本单开一次性例外**：允许改 `src/agent_box/server/sessions/repository.py` 的 `WIRE_VISIBLE_EVENT_KINDS` 行（**只那一行**） | 该文件属 runtime 树写面；先例＝`116` 在 `wire/handlers.py` 开的两处调用点例外 |

**必须保持不变**：其它线种类的集合与映射；`097` 立的 hello 形制；投影的既有键；`wire` 帧格式。

**边界**：若你判断"该不该保留这一味"属**产品语义**（例如它与未来的 workspace 事件面绑定）⇒ 按 `R-0069` 在 `status.md` 写**解卡入口＝`需用户裁定`**（附判据与代价），**当轮**由 ops 路由进 `handoffs.md`；**不要**自己拍。

## Requirements

### Requirement: 声明过的线种类必须有生产者，或**有据地声明"暂不出"**

#### Scenario: 三源对账（定档）

**WHEN** 核完声明/产生/投递三处
**THEN** 账上写明**选了 1 还是 2(a)/(b)**＋判据（grep 原件与指针）

#### Scenario: 选 2(b)（保留 id 但暂不出）

**WHEN** 跑一次会发邻近 kind 的真场景
**THEN** `workspace.connection` **不出现**（可断言），且账上有"预留"的书面依据（指向它绑定的那个未来面）

#### Scenario: 反例（门要能咬）

**WHEN** 把上面选定的断言**注释掉**（或把线名集合改回去）
**THEN** 本单的门**必须红**

## Stages

- [ ] 1. 观测：三源对账（带 grep 原件）（提交）
- [ ] 2. 定档：选 1 / 2(a) / 2(b) ＋ 判据（提交）
- [ ] 3. 落地（发射点 ／ 删名 ／ 保留＋兜底声明）（提交）
- [ ] 4. 门与反例（注释掉必须红）（提交）
- [ ] 5. 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 定档有编号 | 账上写明 1/2(a)/2(b) ＋ 判据 | 只写"疑似无生产者"⇒ 不算过 | fail (typed) |
| G2 真语料 | 断言基于真链（投影/编号路径真跑） | 只读码断言 ⇒ 门红 | fail (typed) |
| G3 反例 | 注释掉选定断言 ⇒ 门红 | 无反例 ⇒ 不算过 | fail (typed) |
| G4 例外收敛 | 若动了 `sessions/repository.py` ⇒ **只动那一行** | 改动越界 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 三源对账 · 2. 定档（1/2(a)/2(b) ＋ 判据）· 3. 落地 · 4. 门与反例 · 5. 账与证据。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`WORKSPACE_CONNECTION_NO_PRODUCER_DONE`
- 否则：`WORKSPACE_CONNECTION_NO_PRODUCER_PARTIAL` + 精确剩余（**定档未完成 ⇒ 必须写 needs_validation 仍未决 ＋ 交回**，不许静默 PARTIAL）

## Notes for the executor

- **这是 `needs_validation` 不是 confirmed** ⇒ 你的交付**首先是定档**；若查出**真有**发射点（我看漏了）⇒ 本条判 **rejected**，
  **仍要**把"三处声明 + 发射点在哪"写成一行（免得下一轮重挖）。
- **与 `097` 的关系**：**同一条形制的两面**（097＝漏报，本条＝多报）⇒ 在收口里点名这一对，供 `132` 的对账门吸收。
- **前提待验**（`OF-02`）：引自 `AUD-B-011`（含三处行号与那条 grep）；第一步自己复核。
