# Work Order 110 — 停止后队列暂停必须可见/带原因/可继续（v2 裁定后）：账

终态：见本树 `status.md` 110 行。

## 1 复现与定位（阶段 1）

聊天线交回：hold 轮被 `runs.stop` 后队列 45s `left=1` 不动。交回 67 语义冲突 ⇒ 调度者裁定（R-0032 ⑤，
`d67781d`/公告第 89·93 轮）：**保留 67 的 stop/fail ⇒ `paused`（不自动采纳）**，110 改为
**"暂停必须可见、带类型化原因、可继续"**。

定位：`sessions/queue.py:pause_pending` 拿到调用方给的 `reason`（`finish_cancelled`→`"cancelled"`；
`fail_turn`→失败码）却 **`del reason`** 丢弃；`queue.updated` 事件的 public item 只带 `state`，不带原因 ⇒
状态到得了 wire、原因到不了。`queue.get` 响应由 `wire/handlers._queue_item` 逐字段白名单投影（**A 树文件，本单不碰**）。

## 2 修法（阶段 2）——只在 `src/agent_box/**`，不碰 wire/前端

- `storage/database.py`：`server_queue_items` 增可空列 `pause_reason TEXT`；`PRODUCT_SCHEMA_VERSION` 18→19；
  新增 `_migrate_18_to_19`（`_add_columns` 幂等）。旧行 NULL＝诚实的"那次暂停没记原因"，非杜撰。
- `sessions/queue.py`：
  - `pause_pending` **不再 `del reason`**，UPDATE 写 `pause_reason=?`；
  - `_row_to_item` 带 `pauseReason`（供 `QueueRecords.list` 读回）；
  - `_append_updated`：**仅当有原因时**把 `pauseReason` 放进 `queue.updated` 事件的 item 对象
    （既有事件形状、无新方法）⇒ 非暂停事件逐字段不变（G2），暂停事件可解释（G1）。

## 3 门（阶段 3，全内存假端点，零真实调用）

`tests/server/test_harness_sidecar.py::test_paused_queue_item_surfaces_its_reason_on_the_wire`：
hold 轮 + 队列项 → `runs.stop` ⇒ 队列项 `state=paused` 且 `pauseReason=="cancelled"`（queue 视图）
**且** `queue.updated` 事件带该原因；并断言**未自动采纳**（`turns==1`，67 语义保留）。
**反例（门咬）**：退回 `del reason` ⇒ `pauseReason` 缺失 ⇒ 红。
`test_stage_a_server` 的迁移版本断言随版本 18→19 更新（迁移到"当前版本"的既有不变量，非放宽）。

回归：`test_wire_v1.py`（含 `queue.*` 逐字段 exact-shape 断言，如 `test_send_while_running_queues_..._too_late`）+
`test_stop_or_failure_pauses_queued_turn` + 本单门 = **40 passed**；`test_stage_a_server`/`test_server_boundaries`
= 21 passed。⇒ **G2 队列 FIFO/幂等/CAS/withdraw 逐字不变**（withdraw-only-pending 语义未动）、
**G4 不越界**（diff 仅 `storage/database.py` + `sessions/queue.py` + 测试，无 `wire/**`/前端）。

## 4 与 106 的交叉（G3）

v2 不再要求"停止后自动开跑"。completed 之后的采纳 + sidecar 存活仍由 **106** 与既有
`test_success_dispatches_queued_turn...` 覆盖（本单未改采纳路径）；本单只补"暂停可见"。两单触发点不同、不互替。

## 5 精确剩余 / 交回点

- **继续路径的边界**：裁定称"继续＝`queue.withdraw` + 重发"。现状 `withdraw` 仅接受 `pending`，
  对 `paused` 返回 `too_late`（类型化，非静默）。⇒ 用户"可见原因后清掉这条暂停项"目前走不通。
  把 `paused` 纳入可撤回 **是队列语义改动（G2 明令逐字不变）**，非本单可自决；
  "一键恢复"= 新 wire 方法（§41 要求交回）。**均登记为待裁**，未自行发明。
- Windows↔WSL / 真机 UI 复验由验收方在真栈跑（本单服务端可见性已门住）。

## 6 §Spend / 清理 / 回归计数

真实模型调用 0；全内存假端点。清理：无残留。回归计数随 c2 批末报告。
