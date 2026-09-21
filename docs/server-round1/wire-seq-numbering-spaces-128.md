# 128 — 帧上的 `seq` 现在只有一个含义，而且"两套名单"不许再各写各的

Tree `agent-box-env-provider`，baseline `1753f6f`，run 2026-09-19 15:2x UTC。
来源：后端审阅者 `AUD-B-010`（confirmed/medium）＋ ops 第 120 轮转单。**真实模型调用 0**。

## 1 一手复现（DoD 第 1 项：那张"交替序列的 seq 取值表"）

三张名单各自生长，彼此不认识（这就是病根，不是那四个漏网的键）：

| 名单 | 在哪 | 有几项 |
| --- | --- | --- |
| 编号名单（决定谁拿到 `wire_seq`） | `sessions/repository.py:28` `WIRE_VISIBLE_EVENT_KINDS` | **10** |
| 产帧名单（决定谁会变成一帧） | `wire/projection.py:36` `_EVENT_KIND_MAP` | **14** |
| 对外声明的帧种类 | `wire/projection.py:18` `WIRE_EVENT_KINDS` | 13（`turn.accepted`/`turn.state` 合成 `execution.state`） |

差集实测：`usage.updated`、`thought.delta`、`plan.updated`、`mode.updated` 会产帧但**不参与编号**。
而 `event_frame` 在没有编号时**退回存储层的 `seq`**（`projection.py:206`：`seq = int(normalized.get("wire_seq") or raw_seq)`）
⇒ 同一条流里 `seq` 在两个数字空间之间来回跳：编号空间是"第几帧"，`raw seq` 是"第几条事件"。
用 14 类交替两轮（28 条）实测的旧行为：编号被跳过的那些帧**复用同一个数字**（门里那条
`test_the_history_face_rejects_a_second_row_with_the_same_number` 量的就是这个 reuse > 0），
而 `server_session_wire_order` 是 **UNIQUE** 索引（`storage/database.py:592`）⇒ 这不只是"难看"，是**同一编号会撞**。

## 2 归一（走的是单里的默认路：所有产帧事件同一编号空间）

`sessions/repository.py` 的编号名单补上那四类；`from_server_error`／事件种类／载荷／`server.hello` 方法集一字未动（G4 有门）。

真正的修复不是那四行键名，而是**让两份名单不能再各写各的**：
`tests/server/test_wire_seq_numbering_spaces_128.py::test_the_numbered_set_is_exactly_the_frame_set`
双向断言 `编号集合 == 产帧集合`，并再钉一层 `产帧映射的值集合 == 对外声明的帧种类集合`。
**这正是 097 学过的东西**（能力表 27 声明 vs 64 派发、差 37 条）——同一族缺陷换个字段复发。

## 3 门（7 条，全走真 HTTP `history.snapshot`，不直调编号函数）

| Gate | 覆盖 | 反例 |
| --- | --- | --- |
| G1 不丢帧 | `test_alternating_frames_survive_a_clients_sort_and_dedupe`（14 类交替两轮 ⇒ `seq` 严格递增、无重复、无空洞；再按客户端口径排序＋去重，**一条不丢**） | `test_counter_example_the_pre_128_numbering_breaks_the_same_assertion`：把编号名单换回 128 之前那份 ⇒ 同一断言必须红（实测报 "`seq` means two things at once"） |
| G2 单义 | `test_the_numbered_set_is_exactly_the_frame_set`（双向）＋ `test_the_four_kinds_aud_b_010_named_are_numbered_now` | 任一侧多一项/少一项即红 |
| G3 真 wire | `test_the_gate_reads_frames_over_http_and_not_the_helper`（帧从 socket 的 `history.snapshot` 读；并断言内部列名 `wire_seq` 不外泄） | 直调 `event_frame` 就没有这层证据 |
| G4 不越界 | `test_no_event_kind_or_payload_was_invented`（`_EVENT_KIND_MAP` 键集合不变；`server.hello` 仍 64 法） | 多一类/少一类即红 |
| 撞号这一面 | `test_the_history_face_rejects_a_second_row_with_the_same_number` | 旧形状 reuse>0 必须成立，否则这条门什么也没说 |

**一条一手教训（这条门第一次全量才红）**：那条"换回旧名单"的反例原本用 `monkeypatch.undo()` 还原常量，
而 `monkeypatch` 是函数级的、和 `server` fixture 用同一个对象 ⇒ `undo()` 顺手把 fixture 里那条
`sandbox_available` 替身也撤了，于是同一测试**后半段**的 `workspaces.open` 被按真实主机条件拒掉
（`LOCAL_SANDBOX_UNAVAILABLE`），报出来的却是 `KeyError: 'result'`。
带 `AGENT_BOX_SANDBOX_MODULE` 跑就全绿、不带就红 ⇒ **典型的"环境决定的绿"**。
现在改成就地 `try/finally` 只还原那一个常量，两种环境都实测绿。
和 123 的教训同族：**改全局状态的门要精确说明它撤回了什么**。

## 4 边界：历史数据没被本单改（如实）

`storage/database.py:_migrate_4_to_5` 里那段 `UPDATE … SET wire_seq=(SELECT COUNT(*) …)` 是**当年**按**十项**名单回填的，
而该文件不在 128 的 `write_paths`（`wire/**`、`sessions/**`、`tests/**`、`docs/**`、`status`）。⇒

- **新写入**：一律同一编号空间（本单已修）。
- **已存在的库**：那四类**旧行**仍是 `wire_seq IS NULL`，投影时继续回落到 `raw seq` ⇒ **一个老 Session 里仍可能混两套**。
  要一次修干净需要一条同款回填（按**新**的 14 项名单重算 `wire_seq`，并注意 UNIQUE 索引与既有编号不能撞）。
  这条**不是"可以不管"**：它是"用户已有的会话会不会显示错序"的问题 ⇒ 登记成一张能写 `storage/**` 的单（见本树 §待开单）。
  另注：回填之后 `history.snapshot` 的游标语义不变（游标编码的是 `raw seq`，不是 `seq`）。

## 5 客户端口径（一页，写清"该怎么排、怎么去重"）

1. **按帧的 `seq` 升序排**——它是"这个 Session 里第几帧"，从 1 连续、唯一。
2. **去重键用 `eventId`**（每帧都带），**不要**用 `seq`：`seq` 在混空间的历史库里可能重复（见 §4）。
3. **断线重连用 `cursor`**（服务端编码的内部位点），不要用 `seq` 自己拼：`cursor` 覆盖"含不产帧事件的全部历史位点"。
4. 需要"这条属于哪一轮"用 `event.turnId` / 帧里的 `turnId`；不要用 `seq` 的连续性去猜轮次边界。
5. 若一个 Session 的帧里出现 `seq` 重复（历史数据），**按 `eventId` 保留先到的一条、其余照 `cursor` 序落位**，
   并把这条 Session 标成"待回填"——这是 §4 那张单落地前的临时口径。

## 6 计数与终态

```
定向：python3 -m pytest tests/server/test_wire_seq_numbering_spaces_128.py -q → 7 passed in 3.42 s
（批末全量与 Worker 工件行、以及"编号改动有没有碰到别的门"的复算，写在 status.md 的本单终态行里）
```
真实模型调用 **0**。DoD 四项：一手复现 §1 · 归一 §2 · 门含反例＋客户端口径 §3/§5 · 账与证据 §4/§6。
终态 **`WIRE_SEQ_SPACES_DONE`**（历史库回填作为**独立一张单**交回，不影响本单四项；理由见 §4）。
