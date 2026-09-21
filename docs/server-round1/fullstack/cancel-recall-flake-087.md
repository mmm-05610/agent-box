# 087 — 45-G8 的取消/召回间歇：定位到了，根因在门的观察方式上

Tree `agent-box-env-provider`，分支 `feature/env-provider-v1`，baseline `bca7782`。
跑在 2026-09-19 19:5x–20:4x。**真实模型调用：0**（stateful ACP peer 自己答；`R-0017` 假端点优先）。

## 1 复现（G1）

驱动器：`tests/server/test_cancel_recall_flake_087.py`。每轮把 **未改动的** 45 门整体跑一遍
（`native-home-gate.py --keep`），然后把那一轮自己的 SQLite 事件日志读出来对账——
门的断言看没看见、库里在不在、`seq` 多少。两条腿：

```bash
# 计数腿（每轮 = 一次整场 45 门，约 13 s/轮；会重写证据文件，故默认不进全量套件）
PYTHONPATH=src python3 tests/server/test_cancel_recall_flake_087.py 20
#   逐轮明细 docs/server-round1/fullstack/087-runs/rounds.json ＋ round-NN.json
#   汇总     docs/server-round1/fullstack/087-cancel-recall-flake.json
# 单轮"持久事实"腿（13 s，永远在套件里）：取消输入进 journal、召回增量落库、native id 稳定、只走 session/load
python3 -m pytest tests/server -q -k "cancel or recall"
```

（门本身要 `AGENT_BOX_SANDBOX_MODULE=agent_box_sandbox_bwrap` + 插件 `PYTHONPATH`，驱动器已带上；
不带就是 `LOCAL_SANDBOX_UNAVAILABLE` 拒开工作区，与 087 无关——本轮实测撞到一次，命令记在
`native-home-storage.md` §复跑命令。）

**两次独立的 N=20**（同一命令；第一份汇总留在提交 `9b7b754`，工作区这份是第二次）：

| 样本 | 轮 | 绿 | 红 | 红的形态 | 每轮耗时 |
| --- | --- | --- | --- | --- | --- |
| 1 | 20 | 16 | 4 | 3× `CANCEL_LOST_INPUT`（067 记的"召回流为空"，`recallDeltas: []`）＋ 1× `TURN_TIMEOUT` | 13 s（超时那轮 102.6 s）|
| 2 | 20 | 20 | 0 | — | 13.7–31.7 s |

40 轮合计 4 红（10%），与 067 的"run1 败、run2 过"同量级：**间歇，不是必然**。
而它不是"偶发一次"，是**同一个读取姿势**决定的——见 §2。

## 2 根因：门的 turn 下标差一位（40/40 都差），它断言的是它没等的那一轮

持久布局（40 轮全是这个形状；`rounds.json` 的 `readWindow.turns`，排序就是产品自己那条
`ORDER BY created_at,id`，`src/agent_box/server/sessions/repository.py:1017-1023`）：

| index | 是谁 | 实际状态 | 带 nonce 的 `message.delta` |
| --- | --- | --- | --- |
| 0 | G1 首轮 | completed | 有（seq 3/4） |
| 1 | G2 召回 | completed | 有（seq 10/11） |
| 2 | G6 漂移轮 | completed | 有（seq 17/18） |
| 3 | **G8 取消轮** | cancelled（`stop_requested_at` 有值、`TURN_CANCELLED`） | 无 |
| 4 | **G8 召回轮** | completed | **有**（n=6 的那堆 seq 29/30，n=5 的那堆 seq 32） |
| 5 | 门自己又发的一条（重试） | cancelled（`TURN_CANCELLED`，但 `stop_requested_at` 为空 ⇒ 是被上一次取消的 abort 打掉的） | 有（seq 36/37） |

门按"取消在 2、召回在 3、重试在 4"写死下标：
`scripts/server-round1/native-home-gate.py:505`（`wait_turn(..., 2, ...)`）、`:526`（`..., 3, ...`）、
`:542`（`..., 4, ...`），而筛增量用的是 `item.get("turn_id") == recall["executionId"]`
（`:529-531`、`:545-547`）。**40/40 轮取消轮都在 3、召回轮都在 4** ⇒ 门每一步等的都不是它断言的那一轮：
筛"召回增量"读的是第 4 轮的 executionId，等的却是第 3 轮（早就 terminal，立刻返回）——
**答案落库晚于这一次返回就 `recallDeltas: []`**，早于就绿。4 条红里 3 条正是这个形状（都在"有第 5 轮"那堆里，
3/25 ≈ 12%），067 的"run1 空召回、run2 通过"和 082 那句"stderr 有 `SIDECAR_CLOSED` 但 G8 仍 pass"都由它解释。

同源的另一条更糟：`REPORT["g8"]["cancelledTurnState"]` 取 `turns[2]["state"]`（`:510`、`:550`），
那是 G6 的漂移轮，永远 `completed` ⇒ `:513` 的"取消没落地就失败"**从未真的能咬**
（样本 1 的三条红里它全是 `completed`，而真取消轮在 index 3）。

**没结掉的一条（如实标出，不猜）**：门有没有走到重试分支分两堆（25 轮出现第 5 轮、15 轮止于第 4 轮），
而按持久布局 `:535` 的条件（`turns[3].state == "cancelled"`）应当每轮都成立 ⇒
判定用的那一瞬间快照与轮末落库不一致。这不改上面的结论（下标差一位＋筛没等的 executionId 在两堆里都成立，
绿的一堆只是运气），但改门的人应顺手钉死它：按 executionId 定位 turn 之后，那个分支本就不该存在。
验法：在 `:535` 之前打印 `[t["state"] for t in session["turns"]]`，与轮末 `turnStates` 对表，跑 20 轮统计两堆比例。

## 3 被本轮数据否掉的两条解释（写下来，别让下一任再猜一遍）

- **"召回被读窗截断"**：`SessionRecords.get_session` 的事件窗口是 `ORDER BY seq LIMIT 200`
  （`sessions/repository.py:1012,1024`），我起初怀疑召回增量掉在窗口外。
  实测 40 轮整场会话只有 **38 个事件**（超时那轮 30），`nonceDeltasInsideEarliest200` 每轮都 > 0 ⇒ **否**。
  （窗口本身"取最早 200 条且不报告截断"仍是真隐患，但不是这条间歇的成因。）
- **"`SIDECAR_CLOSED` 就是那条竞态"**：样本 1 的 20 轮里 13 轮 stderr 有它，其中 **10 轮门是绿的**；
  另 2 轮红（12、20）根本没有它 ⇒ **无相关性，否**。它的真实身份是取消轮收尾时 `capture_execution`
  发 `{"op":"close"}` 撞上 sidecar 已退（`execution/sidecar.py:1355` → `:1049-1050`），不影响召回答案落库。

## 4 产品侧的 F4 语义：每一轮都是对的

3 条 `CANCEL_LOST_INPUT` 的轮次里，库里都**有**召回轮的 nonce 增量（seq 29/30，重试轮还有 36/37），
"取消没吃掉输入"成立；同轮一并量到：`home.journalHasWaitForCancel = true`、
`home.nativeState = STATEFUL-NONCE-7A21`、`gateG8.nativeIdStable: true`、
`home.reopenMethods` 除首轮 `session/new` 外**全是 `session/load`**（无静默重开新会话）。
⇒ **45-G8 的语义不是部分覆盖**：按持久事件日志与 home 事实判它达标；不达标的是这座门读答案的方式。

## 5 另一条独立的红：样本 1 round 4，召回轮整轮停在 `accepted` 90 s

1/40：取消轮 cancelled 之后，门的召回轮（index 4）**整轮停在 `accepted`**、没有任何增量，
`wait_turn` 90 s 超时（该轮 102.6 s，其余 ~13 s）。这不是观察问题——那一轮真的没被派发/采纳。
形态与公告 107 轮 `110` 的"stop 之后 paused 不自动采纳"是同一片语义（`sessions/repository.py`
取消/失败路径里的 `queue_records.pause_pending`）。本树不写 `sessions/**`、`execution/**`（章程 §3，属 runtime 线）⇒
登记进 `status.md` §待开单交调度者投递。原始片段：`087-runs/rounds.json` 里 `round == 4`（提交 `9b7b754` 版本）。

## 6 修复落点与提案（**本单一字未改门**）

`087` 的 `write_paths` 是 `src/agent_box/**`、`tests/**`、`docs/server-round1/fullstack/**`、`status.md`；
门在 `scripts/server-round1/**`（QA-004 定本树为其唯一 owner，但动它要调度者在单里开写面）。
最小修法（交回，落到一张有 `scripts/**` 写权的单里）：
**按 executionId 定位 turn，而不是按位置下标**——把 `:505/:510/:513/:526/:535/:542/:550` 上的
`session["turns"][2|3|4]` 换成"在 `session["turns"]` 里按 `cancel_send["executionId"]` /
`recall["executionId"]` 找那一条"，且增量筛选放在"等**那一轮** terminal 之后"。
089 开跑前该核同一习惯：它的真实 UI 门脚本若照抄位置下标，会带同一个假绿/假红。

## 7 G2 与终态

- **G1 可复现**：✅ 两轮 N=20 统计 + 每轮原始片段（`087-cancel-recall-flake.json`、`087-runs/`）。
- **G2 诚实**：✅ 没改产品（产品这一条没错），给的是**边界判据**：读窗与 `SIDECAR_CLOSED` 两条解释被否；
  成立的是"门等错轮 + 筛一个没等的 executionId"，判据可查（`readWindow.turns[*].nonceDeltaSeqs` 对 `gateG8.recallDeltas`）。
- DoD 第 1 项的"修"受写面所限未做 ⇒ 终态 **`CANCEL_RECALL_FLAKE_PARTIAL`**。
  精确剩余：① 一张能改 `native-home-gate.py` 的单（提案在 §6）；② §5 那条 `accepted` 停摆的归属单；
  ③ §2 末尾那条两堆判据的钉死。

回归计数与套件数字记在 `docs/implementation/status.md`（本树 §087 行，带「Worker 工件在/不在」）。
