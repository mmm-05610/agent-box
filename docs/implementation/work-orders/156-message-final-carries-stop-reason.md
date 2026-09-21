---
id: "156"
slug: message-final-carries-stop-reason
batch: b2
baseline: "8a83df2"
depends_on: []
write_paths: ["src/agent_box/server/wire/**", "src/agent_box/server/credentials.py", "tests/**", "scripts/server-round1/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-runtime-round1/**", "release/**"]
ruling: R-0081
terminal: ["MESSAGE_FINAL_STOP_REASON_DONE", "MESSAGE_FINAL_STOP_REASON_PARTIAL"]
waive: []
parallel_units: ["observe", "payload-and-projection", "producer-request", "gate"]
serialize_with: ["087", "089", "097", "098", "099", "101", "103", "104", "105", "112", "113", "115", "117", "118", "119", "123", "124", "125", "128", "129", "132", "145", "147", "149", "151", "152"]
revisions: []
---

# Work Order 156 — **`message.final` 必须带 stop reason**（`R-0081 ②`；`ACC-R5-3` 转单）

## Objective

**来源：`R-0081 ②`（用户 11:50 一手报障「输出的不完整，只能输出固定长度」，截图在树根 `394d9d01-a553-4761-8ef1-08f132a939cb.png`）＋ A 的 `ACC-R5-3` ＋ ops 第 173 轮开单。**

**A 的一手读数（`ACC-R5-3`）**：同一句"数到 40"停在 **32**，终态 `completed`，而 **`message.final` 只有 6 个键、零 `stopReason`**；
**同一配方在 09:29 的副本实例上却数完了 40** ⇒ **阈值不稳定**（两台实例两种读数），**但"砍断不吭声"两处都成立**。

**用户侧一手（截图逐条，`R-0081`）**：停 **32** → 再发"你好"它**续** `31…40` → "what?" 停 **14** → "说完"**续** `15…40` → 直到"你只能一次输出这么多吗"才给全
⇒ **砍点位置是变化的（32/14/完整），不是固定长度**，用户得靠**追打**才拿全。

**`R-0081 ②` 的要求（原话）**：**`message.final` 必须带 `stopReason`**；**`122`/`134`/`137` 的可见截断信号必须覆盖 `message.final`**。
**归属（裁决原话）**：**wire／前端（A 线 ＋ 聊天线/settings）**。

**两格分离（`R-0076 ④`，不许并）**：**①「截断本身」（要么完整、要么带明确 stop reason）归 `runtime`，已并入 `154`**（`d617de8`）；
**②「截断可见要覆盖 `message.final`」＝本单**。**别两处各修一半**：`154` 只管"别静默丢尾巴"，**`message.final` 的载荷与投影归本单**。

## Current state（一手）

- **生产侧已落地**：`137`＝**`WORKER_STOP_REASON_FIELD_DONE`**（`plugins/agent-box-harnesses/runtime/worker-entry.mjs` 真填值，值取 ACP 既有四值 `end_turn`/`max_tokens`/`max_turn_requests`/`refusal`，**不新造词**；`sidecar.py` 结构化解析）；
  `134`＝**`TERMINAL_REASON_CONSUMER_DONE`**（读到 `run.result.stopReason` 就用，经 `complete_turn` 写入 `server_turns.terminal_reason`；列已在 `storage/database.py:125`）。
  ⇒ **值已经从 Worker 一路到 `server_turns`**，而 **`message.final` 这个事件本身没有它**（A 实测 6 个键、零 `stopReason`）。
- **写入点（一手）**：`execution/sidecar_backend.py` 在完成路径上调 `self.records.append_turn_event(run.turn_id, "message.final", {"text": text})` ⇒ **事件载荷今天只有 `text`**（这是 **runtime 树**的代码行）。
- **投影面（本树）**：`wire/projection.py` 是 turn/session 事件的投影处（`122` 的收口账里点到 `projection.py:173` 一带的 `reason = terminal_reason or error_code`）。
- **窗口指向（`R-0081 (甲)`，必须先量清）**：**`18790` 跑的是 A 线 `b630acd` 的构建**（A 一手记），**是 Windows 侧的冻结副本** ⇒ **修了要能在窗口上看到**，否则"改了也看不到"。

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `message.final` 的**契约形状** | **明确 `message.final` 载荷里 stop reason 的键名与取值域**（**沿用** `137` 已用的 ACP 四值；缺席 ⇒ **不给键**，与今天逐字相同） | `R-0081 ②` 的本体：可见截断信号**必须覆盖 `message.final`** |
| 投影 | 让消费者**在 `message.final` 上就能读到**它（而不是要另读 `server_turns.terminal_reason` 才能判"被砍"） | A 实测：`message.final` 只 6 个键 |
| **生产侧（不在本树写面）** | **阶段 1 写清"要 producer 加的确切键与形状"**（**一行原文**）⇒ **交回 ops，我当轮开 runtime 的小单**（`sidecar_backend.py` 那个 `append_turn_event` 载荷） | `execution/**` 属 runtime 线（`R-0022`）；**别越界**，也别在两处各改一半 |
| 窗口可见（`R-0081 (甲)`） | **量清并写下一行**：`18790` 跑哪棵树哪个 sha（A 记＝A 线 `b630acd`）＋**你的修要怎样才能在那个窗上被看到**（重建副本？换现场？还是本窗看不到、需"换现场之后"复算） | 裁决硬约束：**修了必须能在窗口上看到**，否则**改了也看不到**（`R-0080 ④` 同族） |
| 门 | 见 Gates；**反例必须会红** | `OF-14` |

**硬约束**：
- **不新造词**：取值域＝`137` 已用的 ACP 四值（`end_turn`/`max_tokens`/`max_turn_requests`/`refusal`）。
- **缺席 ⇒ 与今天逐字相同**（不给键、不写 null、不改既有 6 个键的语义）——否则会给老消费者造回归。
- **不改 `execution/**`、不改 `sessions/**`**（runtime 线）；需要就**交回 ops**。
- **用户截图是原件**：`394d9d01-a553-4761-8ef1-08f132a939cb.png` **不是本单的产物、也不许被提交**（`R-0081 (乙)`；A 负责归档或删除）——**你若在证据里引用它，只引用文件名与位置，不要 `git add` 它**。

## Requirements

### Requirement: 「这一轮的回复被砍了」必须在 `message.final` 上就看得见

#### Scenario: 带 stop reason 时可见（正例，本单主目标）

**WHEN** 一轮因**输出上限**被砍（合成 `max_tokens` 的 stop reason）
**THEN** 该轮 `message.final` 的载荷**带上 stop reason**（键名与取值域按 Scope；值＝`max_tokens`），**消费者无需另读 `server_turns` 即可判"被砍"**

#### Scenario: 正常轮不给键（反例，不回归）

**WHEN** 一轮正常结束（`end_turn`）
**THEN** 与今天**逐字相同**（`end_turn` 是否显式给键由你定，但**必须在单里写明并保持既有消费者全绿**）；**缺席 ⇒ 不给键**

#### Scenario: 与 `122`/`134`/`137` 的口径一致（正例）

**WHEN** 同一轮既看 `server_turns.terminal_reason` 又看 `message.final`
**THEN** 两者**不矛盾**（同源或明写派生关系）；**不得**出现"`terminal_reason` 说 `max_tokens` 而 `message.final` 说什么都没有、而消费者只读后者"的错位

#### Scenario: 反例（门要能咬）

**WHEN** 把 `message.final` 的 stop reason 去掉
**THEN** **门必须红**

#### Scenario: 窗口可见性（正例，按 `R-0081 (甲)`）

**WHEN** 收口
**THEN** 账上有一行：**`18790` 跑的是哪个 sha** ＋ **这次修怎样才能被看到**（重建/换现场/需换现场后复算）

## Stages

- [ ] 1. 观测：一手读 `message.final` 今天的载荷（键集）＋写清**要 producer 加的确切键与形状**（一行原文）＋**量清窗口指向哪个 sha 与怎样能看到**（提交）
- [ ] 2. 契约与投影（沿用 ACP 四值；缺席不给键）（提交）
- [ ] 3. 与 `122`/`134`/`137` 的口径对齐（不矛盾、不错位）（提交）
- [ ] 4. 门与反例（合成 `max_tokens` ⇒ 可见／去掉 ⇒ 红／正常轮不回归）（提交）
- [ ] 5. 账：producer 侧请求原文 ＋ 窗口可见性一行（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 可见 | 合成 `max_tokens` ⇒ `message.final` 带 stop reason | 不带 ⇒ 门红 | fail (typed) |
| G2 不回归 | 正常轮与缺席情形 ⇒ 既有 6 键语义逐字不变、既有消费者全绿 | 改动既有键 ⇒ 门红 | fail (typed) |
| G3 同源不矛盾 | `terminal_reason` 与 `message.final` 的口径一致（同源或明写派生） | 两者矛盾 ⇒ 门红 | fail (typed) |
| G4 不造词 | 取值域＝ACP 四值（与 `137` 相同） | 自造第五个值 ⇒ 门红 | fail (typed) |
| G5 真链 | 门走真 wire／真事件路径，非直调投影函数 | 直调 ⇒ 门红 | fail (typed) |
| G6 窗口可见性 | 账上有"`18790` 跑哪个 sha ＋ 怎样看到本次修" | 缺 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict --legacy-ok
git diff --check && git status --short
```

## DoD

1. 一手载荷读数 ＋ producer 请求原文 ＋ **窗口指向与可见性一行** · 2. 契约与投影落地（沿用四值、缺席不给键） ·
3. 与 `122`/`134`/`137` 不矛盾 · 4. 门与反例（G1–G5） · 5. 账。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`MESSAGE_FINAL_STOP_REASON_DONE`
- 否则：`MESSAGE_FINAL_STOP_REASON_PARTIAL` + 精确剩余

## Notes for the executor

- **排序（`R-0081` ⇒ `R-0080` 之后的最新裁决）**：**本单是本树第一梯队**——它是**用户报的实测缺陷**那一族的可见侧，且 `R-0080 ⑤`（失败可见）直点它。`089` 收尾 / `103` / `099` **继续让位**。
- **`R-0081` 点破的流程病（与我有关，如实转达并已修）**：裁决原话——**「`ACC-R5-3` 与 `ACC-R5-7` 都是 A 一手记下、明写『要转单』的条目，而 ops 已连续 5+ 轮没消费 `docs/acceptance/`」** ⇒ **`R-0068` 机检加一条「验收线新条目须当轮被引用（未引用即 red）」**。
  **我已把「读验收线新发现」定为每轮头一件事**（轮 167 起），本轮补上机检口径（见公告轮 173）。**这一条迟到，是我的账。**
- **`R-0081 (乙)`**：**用户截图 `394d9d01-….png` 不许提交**（A 负责归档或删除）；**引用它只写文件名与位置**。
- **与 `154` 的边界**：`154`（runtime）＝"要么完整、要么带明确 stop reason"＋"上限配在哪一层"；**本单＝`message.final` 的载荷与投影**。**互不重叠、不许各修一半**：**若你的修需要 producer 加键 ⇒ 阶段 1 交回 ops，我当轮开 runtime 的兄弟单。**
- **前提待验（`OF-02`）**：`sidecar_backend.py` 的 `append_turn_event("message.final", {"text": text})`、A 的 6 键读数、`18790`＝A 线 `b630acd` 都是 ops/A 一手读的；**第一步自己复核**，不符 ⇒ `status.md` 写明并交回。
