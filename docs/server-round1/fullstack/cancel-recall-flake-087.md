# 087 — 45-G8 的取消/召回间歇：定位到了，根因在门的观察方式上

Tree `agent-box-env-provider`, baseline `bca7782`. Run 2026-09-19 12:0x UTC+…（本地 19:5x–20:2x）.
**Real model calls: 0**（stateful ACP peer 自己答；`R-0017` 假端点优先）。

## 1 复现（G1）

驱动器：`tests/server/test_cancel_recall_flake_087.py`（可直接跑，也可 pytest 收）。
每轮把 **未改动的** 45 门整体跑一遍（`native-home-gate.py --keep`），然后把那一轮自己的
SQLite 事件日志读出来对账——门的断言看没看见、库里在不在、`seq` 多少。

```bash
PYTHONPATH=src python3 tests/server/test_cancel_recall_flake_087.py 20
# 逐轮明细 docs/server-round1/fullstack/087-runs/rounds.json
# 汇总     docs/server-round1/fullstack/087-cancel-recall-flake.json
```

（门本身需要 `AGENT_BOX_SANDBOX_MODULE=agent_box_sandbox_bwrap` + 插件 `PYTHONPATH`，
驱动器已经带上；不带就是 `LOCAL_SANDBOX_UNAVAILABLE` 拒开工作区，与 087 无关——本轮实测撞到过一次。）

**N=20：16 绿 / 4 红，每轮约 13 s。** 红的三条是 `NATIVE_HOME_GATE_CANCEL_LOST_INPUT`
（= 067 记的"召回流为空"形态，`recallDeltas: []`），一条是 `NATIVE_HOME_GATE_TURN_TIMEOUT`。

## 2 根因：门的 turn 下标整体差一位，它断言的是它没等的那一轮

每轮的持久 turn 布局（20/20 一致，`rounds.json` 的 `readWindow.turns`）：

| index | 是谁 | state | 带 nonce 的 `message.delta` |
| --- | --- | --- | --- |
| 0 | G1 首轮 | completed | 有（seq 3/4） |
| 1 | G2 召回 | completed | 有（seq 10/11） |
| 2 | G6 漂移轮 | completed | 有（seq 17/18） |
| 3 | **G8 取消轮** | cancelled（`TURN_CANCELLED`，`stop_requested_at` 有值） | 无 |
| 4 | **G8 召回轮** | completed | **有**（seq 29/30） |
| 5 | G8 重试轮（门自己发的） | cancelled | 有（seq 36/37）——**迟到** |

门却按"取消在 2、召回在 3、重试在 4"写死了下标：
`scripts/server-round1/native-home-gate.py:505`（`wait_turn(..., 2, ...)`）、
`:526`（`wait_turn(..., 3, ...)`）、`:542`（`wait_turn(..., 4, ...)`），
而它筛增量用的是 `item.get("turn_id") == recall["executionId"]`（`:529-531`、`:545-547`）——
`recall` 在重试分支里是**第 5 轮**的 executionId。

于是：等的是第 4 轮（早就 terminal，立刻返回），筛的是第 5 轮的增量，**第 5 轮还在路上**。
读赢了就 `recallDeltas: []` → `CANCEL_LOST_INPUT`。这就是 067 的"run1 空召回、run2 通过"，
也是 082 复跑里"stderr 有 `SIDECAR_CLOSED` 但 G8 仍 pass"那句的由来。

顺带一条同源的更糟事实：`REPORT["g8"]["cancelledTurnState"]` 取 `turns[2]["state"]`（`:510`、`:550`），
那是 G6 的漂移轮，永远 `completed`；`:513` 那句"取消没落地就失败"因此**从未真的能咬**——
门在这条断言上是绿的假象（本轮 4 红里 `cancelledTurnState` 全是 `completed`，而真取消轮在 index 3）。

## 3 被本轮数据否掉的两条解释（写下来，别让下一任再猜一遍）

- **"召回被读窗截断"**：`SessionRecords.get_session` 的事件窗口是 `ORDER BY seq LIMIT 200`
  （`src/agent_box/server/sessions/repository.py:1012,1024`），我起初怀疑第 4 轮的增量掉在窗口外。
  实测 20 轮整场会话只有 **38 个事件**（round 4 是 30），`nonceDeltasInsideEarliest200` 每轮都 > 0 ⇒ **否**。
  （窗口本身"取最早的 200 条且不报告截断"仍是真的隐患，但它不是这条间歇的成因。）
- **"`SIDECAR_CLOSED` 就是那条竞态"**：20 轮里 13 轮 stderr 有它，其中 **10 轮门是绿的**；
  另外 2 轮红（12、20）压根没有它 ⇒ **无相关性，否**。它的真实身份是取消轮收尾时
  `capture_execution` 发 `{"op":"close"}` 撞上 sidecar 已退（`sidecar.py:1355` → `:1049-1050`），
  不影响召回答案落库。

## 4 产品侧的 F4 语义：每一轮都是对的

3 条 `CANCEL_LOST_INPUT` 的轮次里，库里都**有**召回轮的 nonce 增量（第 4 轮 seq 29/30，第 5 轮 seq 36/37），
所以"取消没吃掉输入"成立；同轮还一并量到：
`home.journalHasWaitForCancel = true`（取消轮的输入进了 home journal）、
`home.nativeState = STATEFUL-NONCE-7A21`、`checkpoint.native_id` 稳定（`gateG8.nativeIdStable: true`）、
`home.reopenMethods` 在首轮 `session/new` 之后**全是 `session/load`**（无静默重开新会话）。
⇒ 45-G8 的语义**不是**部分覆盖：按持久事件日志与 home 事实判，它是达标的；
不达标的是这座门自己读答案的方式。

## 5 另一条独立的红：round 4，召回轮停在 `accepted` 90 s 不动

1/20：取消轮 cancelled 之后，门的召回轮（index 4）**整轮停在 `accepted`**、没有任何增量，
`settle/ wait_turn` 90 s 超时（该轮 102.6 s，其余 13 s）。这不是观察问题——那一轮真的没有被派发/采纳。
本树 `wire/**` 之外不写（`sessions/**`、`execution/**` 属 runtime 线，章程 §3），
且形态与公告 107 轮 `110` 的"stop 之后 paused 不自动采纳"是同一片语义 ⇒
登记进 §待开单交调度者投递，归 runtime 线；原始片段在 `rounds.json` 的 `round == 4`。

## 6 修复的落点与提案（**本单一字未改门**）

`087` 的 `write_paths` 是 `src/agent_box/**`、`tests/**`、`docs/server-round1/fullstack/**`、`status.md`；
门在 `scripts/server-round1/**`（QA-004 定本树为唯一 owner，但改它要调度者在单里开写面）。
建议的最小修法（交回，由调度者决定并落到一张有 `scripts/**` 写权的单）：
**按 executionId 定位 turn，而不是按位置下标**——即把 `:505/:510/:513/:526/:535/:542/:550` 上的
`session["turns"][2|3|4]` 换成"在 `session["turns"]` 里按 `cancel_send["executionId"]` /
`recall["executionId"]` 找那一条"，并且重试分支的增量筛选放在"等那一轮 terminal **之后**"。
同一处习惯要一起核：`089` 的真实 UI 门脚本如果照抄了位置下标，会带同一个假绿/假红（本树 `089` 的
门禁工具 `scripts/server-round1/ui_gates_89_leak_check.py` 管的是泄漏、与此无关，但 089 开跑前该核这一条）。

## 7 G2 与终态

- G1 可复现：✅ N=20 统计 + 每轮原始片段（`087-cancel-recall-flake.json` / `rounds.json`）。
- G2 诚实：✅ 没改产品（因为产品这一条没错），给出**边界判据**：读窗与 `SIDECAR_CLOSED`
  两条解释被否；成立的是"门的下标差一位 + 筛一个还没等的 executionId"，
  并且给了可判据（`readWindow.turns[*].nonceDeltaSeqs` 对 `gateG8.recallDeltas`）。
- DoD 缺第 1 项的"修"（写面所限）⇒ 终态 **`CANCEL_RECALL_FLAKE_PARTIAL`**，
  剩余＝一张能改 `native-home-gate.py` 的单（提案在 §6）+ §5 那条 `accepted` 停摆的新单归属。

回归计数与套件数字记在 `docs/implementation/status.md`（本树 §087 行）。
