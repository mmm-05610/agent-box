# Work Order 106 — 排空撞死 sidecar（`SIDECAR_CLOSED`）：观测与修法账

终态：见本树 `status.md` 106 行（`SIDECAR_DRAIN_REBUILD_DONE` / `..._PARTIAL`）。

## 1 时序钉到行级（阶段 1 观测）

验收来源 `ACC-R2-1`（第一手 DB+日志）：会话 `session_70d382e2…`（工作区 `agentbox-chat`）——
`4ba8429e`（非排队）**completed 02:17:38**；`333dc82e`（排队项 `queue_3593d8823a…`）**created 02:17:38 → failed 02:17:39**，
`error_code=SIDECAR_CLOSED`。抛错点：`sidecar.py:1050 → 1073 SidecarError("SIDECAR_CLOSED","sidecar exited before answering")`，
由 `sidecar_backend.py:331 prompt_worker → port.prompt` 走到。

排空链（当前代码，行级）：

| 步 | 位置 |
| --- | --- |
| 上一轮完成 owner 醒来 | `sidecar_backend.py:407 _complete → :408 run.done.wait()` |
| 原生会话在 envelope 仍活时先关 | `:461 _audited_home → sidecar.py:1354 capture_execution {"op":"close"}` |
| completed 事实 + 后继轮在同一事务落账 | `:511 complete_turn → repository.py:808-844`（`claim_next :831`、`_insert_execution :838`） |
| 上一轮 sidecar 关闭（finally） | `:538 run.port.close_execution → sidecar.py:1457 → envelope.close()` |
| 排空派发后继 | `:556 if next_execution_id is not None: self.accept(...)` |
| 后继 `_start_run` 新建端口→开→prompt | `:285 port_factory → :304 open_execution → :331 prompt` |
| prompt 撞已关通道 | `sidecar.py:1049 if self._closed.is_set(): raise self._closed_error()` |
| `_closed` 由读者 EOF 置位 | `sidecar.py:1132 _read_loop finally: self._closed.set()`（后继 sidecar 自己刚退出） |

## 2 与工单字面前提的偏差（如实记，不改契约）

工单 `Current state` 写"排空把消息发给**上一轮那个死进程**"。**第一手核代码：并非如此**——每轮经
`port_factory`（`runtime.py:816`，逐执行、无缓存）拿到**全新的 port / launcher / WorkerClient / envelope**，
排空不共用上一轮的 sidecar 对象。**`SIDECAR_CLOSED` 必然是后继轮自己那个 sidecar 在 `open_execution`
返回之后、prompt 答复之前退出**（`timeout=600` 下 1 秒即败＝读者 EOF）。真正的重叠是四个窗口：
①completed+后继同事务落账；②先关原生会话再关 envelope；③后继 `{"op":"open"}` 复用的是①刚写下的
`checkpoint_native_id`（`sidecar.py:1279`）；④前一轮 `first_run_hold` 在 `:563-572` 才放，晚于后继 `:301` 取。
⇒ **修法落点**：在 prompt 边界补一段"确保存活/重建"（工单 `Objective` 要求的行为），
而非去合并/串行化上述四个窗口（那会改队列/派发语义）。此偏差不构成契约缺陷，按要求的**行为**施工。

## 3 修法（阶段 2）

`sidecar_backend.py`：新增 `SidecarExecutionBackend._prompt_with_rebuild`，`prompt_worker` 改调它。
`SIDECAR_CLOSED` 时**复用新轮同一条 `open_execution` 路径**：`close_execution` 丢掉死 envelope →
`open_execution` 重开一个全新 sidecar → 重发 prompt。有界：`PROMPT_REBUILD_LIMIT=2` 次重建、
`PROMPT_REBUILD_BACKOFF_SECONDS=0.2` 总退避上界；重建仍失败 ⇒ 类型化 `SIDECAR_REBUILD_FAILED`
（**不**把 `SIDECAR_CLOSED` 粉饰成成功）。零 re-dispatch（同一 run/dispatch id）、不动 `queue.withdraw`
CAS / `server_idempotency` / wire。非 `SIDECAR_CLOSED` 的原错误原样上抛。

## 4 门（阶段 3，全绿）

`tests/server/test_harness_sidecar.py`（假端点优先、无真实模型调用）：一个逐次计数的内存 launcher
（`_DrainRaceLauncher`）令**后继轮第一个 sidecar 开完即退**（→ prompt 撞 `SIDECAR_CLOSED`），重建次恢复健康。

- **G1 正例** `test_queue_drain_rebuilds_a_sidecar_closed_at_prompt`：两轮均 `completed`，
  后继 `error_code is None`，队列清空，launches==3（死→重建）。
- **G2 反例门** `test_reverting_the_rebuild_leaves_the_drained_turn_sidecar_closed`：把
  `_prompt_with_rebuild` 猴补丁回旧的一次性 prompt ⇒ 同一竞态复现 `SIDECAR_CLOSED` 失败、launches==2（没重建）。
  退回仍绿则此断言红＝门咬住。
- **G4 有界且类型化** `test_rebuild_is_bounded_and_typed_when_sidecar_stays_closed`：sidecar 每次退 ⇒
  重建耗尽后 `error_code == "SIDECAR_REBUILD_FAILED"`，launches==`1+(LIMIT+1)`，且 <8s（不落在 600s prompt 超时上）。
- **G3 不越界**：`git diff` 面点名——仅 `src/agent_box/server/execution/sidecar_backend.py` +
  `tests/server/test_harness_sidecar.py`；无 `wire/**`、无 `sessions/queue.py`、无幂等/CAS。

定向：`PYTHONPATH=src:<plugins/*/src> python3 -m pytest tests/server/test_harness_sidecar.py -k "queue or drain or sidecar"`
→ 90 passed / 6 skipped（含三条新门单独复跑 3 passed）。

## 5 §Spend / 清理

真实模型调用：0（纯内存假 sidecar）。无临时资源需清理（`tmp_path` 自动回收；三个 runtime 均 `finally: runtime.stop()`）。
