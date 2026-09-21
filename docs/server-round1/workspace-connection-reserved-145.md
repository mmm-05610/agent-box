# 145 — `workspace.connection`：声明与编号都在、**发射点为零** ⇒ 定档 **2(b)**（`AUD-B-011` needs_validation）

**终态**：`WORKSPACE_CONNECTION_NO_PRODUCER_DONE`
**写面**（本单声明）：`src/agent_box/server/wire/**` · `src/agent_box/server/sessions/repository.py`（**一次性例外只准动那一行**）· `tests/**` · `docs/server-round1/**` · status
**真实模型调用 0 / ¥0**（本地 SQLite ＋ 假执行后端；凭据未访问）。

---

## 1 三源对账（`defect-mining-method §2.1` 的形制；grep 原件在本单的门里，不靠这段散文）

| 源 | 事实（一手，2026-09-19 17:5x） | 出处 |
| --- | --- | --- |
| **声明** | 名字在线名集合里，且内→线映射是恒等 | `wire/projection.py:19`（`WIRE_EVENT_KINDS`）与 `:38`（`_EVENT_KIND_MAP["workspace.connection"]`） |
| **编号** | 在 `WIRE_VISIBLE_EVENT_KINDS` 里 ⇒ 一旦有行就**占线序号**（128 刚把这套归一为 14 项） | `sessions/repository.py:38` |
| **产生** | **零**：全树 `append_turn_event(` 的调用点里没有任何一处吃这个 kind；唯一按**变量** kind 转发的桥是 `_native_event`，它的分支表也不含它 | `execution/sidecar_backend.py:339-401`（桥）＋ 门里两条源码扫描 |
| **投递** | 管道是活的：`projection.py:342` 会把它投影成 `{kind, workspaceId, connection}`，缺 `connection` 时兜底 `{"state":"connecting"}`；手写一行 ⇒ 真 `history.snapshot` 里**确实出帧**（见 §3 反例） | `wire/projection.py:342-347` ＋ 门 |
| **第四处（审阅者 grep 的盲区，如实补上）** | 该名字还出现在**历史回填**的 `IN` 清单里 | `storage/database.py:582`（不在本单写面，只登记） |

⇒ 审阅者的 `needs_validation` 定档为**事实**：**没有生产者**（既不是"我 grep 漏了"，也不是"生产者藏在别的树上"——本树全源码扫过）。

## 2 定档：选 **2(b)**（保留 id ＋ 写明"预留、服务端暂不出"＋ 门咬住"它不出"）

**为什么不选 1（补生产者）**：发射这个事件要改的是 `execution/**` / `workspaces/**`（放置与通道路径都在 runtime 线，章程 §3），
本单只被开了 `sessions/repository.py` 的**一行**例外——**结果那一行也没动**（门里 `test_the_numbering_set_still_carries_it_unchanged` 钉住 14 项不变）。

**为什么不选 2(a)（删名字）**：阻塞它的不是"忘了接"，而是**结构性**的——
`server_session_events.session_id` 是 `NOT NULL`、`EventFrame.sessionId` 必填，
于是"浏览阶段/还没有 Session"的时候**没有任何一条流能承载这一帧**。
把这个键从词汇里抹掉，等于替合同层回答"那这味儿该走哪儿"，而后端不该猜（`R-0032 ⑤` 的另一面）。
主树账上同一条口径已写在前头：`agent-box-server-round1/docs/implementation/status.md`（"需前端在合同层裁决：同步结果 or 第二条会话无关通道，后端不猜语义"）——
本报告的**依据**指向那一行，而不是我自己新造一条。

**落地（只加事实，不加协议）**：
- `wire/projection.py`：紧挨线名集合写清"reserved / **no producer** / 为什么不能删 / 门在哪"（`test_the_reservation_is_written_next_to_the_name` 盯着这段字）。
- 顺手修掉同文件 docstring 里一句**已经错了的声明**："the eight wire event kinds" 而集合早已更大 ⇒ 改成"这套由本模块自己拥有，这里不写数字"。
  这正是 097 那一族（手写计数与集合分叉），改在 145 的写面内、零行为变化。
- **门**（`tests/server/test_workspace_connection_reserved_145.py`，7 条）：真 Session 里跑邻近 kind，读真 `history.snapshot` ⇒
  邻近的都在、**这一味不在**。

## 3 反例（不是"注释掉断言"，是把缺席变成可证的）

| 反例 | 一手 |
| --- | --- |
| **管道活着**：手写一行 `workspace.connection` ⇒ 帧真的出来（`workspaceId` ＋ `connection.state=disconnected`），缺 `connection` 时兜底 `connecting`，帧键集合恰 `{kind, workspaceId, connection}` | 两条门：`test_counter_example_a_hand_written_row_does_produce_a_frame`、`test_the_frame_shape_is_the_one_the_projection_defines` |
| ⇒ 所以 §2 那条"不出"**不是**投影器把它滤掉了；今天它不出**只可能**因为没人产生。**将来谁接上生产者，那条门自己变红**（这正是选 2(b) 必须带门的理由） | 同上 |
| 源码级咬合：`append_turn_event(` 的每个调用点里出现这个 kind ⇒ 第一条门红；`_native_event` 桥的分支表里出现它 ⇒ 第二条门红 | `test_the_name_is_declared_and_numbered_but_nothing_appends_it`、`test_the_sidecar_event_vocabulary_does_not_name_it` |

## 4 与 `097`/`132` 的关系（点名这一对，供批末对账门吸收）

- `097`＝**漏报**（实现有 64 法、表上写 27）；`145`＝**多报**（表上有这一味、实现永不出）；`129`＝**半报**（形状必填、函数体不读）。
  同一条形制的三个面：**声明与实装在两处记账，就必须有一处把它们绑在一起比**。
- `132`（批末对账门）该收的正是这一族：本单把"声明/编号/产生/投递"四源做成了**四条可跑的断言**，
  不是一张表——`132` 若要通用化，形制可直接取 `145` 的门（**同一事实只允许一处记账**，其余都是**引用＋比对**）。

## 5 计数与终态

```
定向：python3 -m pytest tests/server/test_workspace_connection_reserved_145.py -q → 7 passed / 1.37s
批末：见 status.md 本单终态行（自报行由 118 的 conftest 挂钩自动带出）
```

DoD 五项：1 三源对账（§1，含第四处回填站点）· 2 定档 2(b) ＋ 判据（§2，指向主树那一行而非自造）·
3 落地（§2：projection 旁写事实 ＋ docstring 的错声明就地改对；`sessions/repository.py` 那一行**未用**）·
4 门与反例（§3）· 5 账与证据。

**终态 `WORKSPACE_CONNECTION_NO_PRODUCER_DONE`**；
仍开着的**不是本单的事**：这一味将来走"同步结果"还是"第二条会话无关通道"——`需用户裁定/合同层`（主树已记），
本单只保证：**账上写得清清楚楚，且它今天不出，出了就会有人知道**。
