# Work Order 109 — 同会话第二次延迟失败轮后 HTTP 全面挂起：定位与修法账

终态：见本树 `status.md` 109 行（`HTTP_HANG_AFTER_SECOND_FAILURE_DONE`）。

## 1 定位（阶段 1：本单自带夹具复现，不依赖聊天线 /tmp）

第一手（聊天线交回）：同会话**第二次** `delay-failure` 轮 ⇒ 进程存活、`/live` 无响应、wire 连接半关。

根因（`src/agent_box/server/execution/sidecar_backend.py` `_complete` 的 `finally`，改前行号 ~590-615）：
```
finally:
    try: close_execution(...)            # 半关通道时抛
         mark_turn_cleanup(turn,"...")
    except BaseException:
        mark_turn_cleanup(turn,"failed") # ← 若这一句再抛（共享 SQLite 争用，恰在第二轮失败时最易发生）
    with self._lock: _active.pop(...)     # ← 上面逃出 finally ⇒ 这段整块被跳过
    resources.release(...); provider.release_handle(...)   # ← 也跳过
```
`mark_turn_cleanup` 走**共享 SQLite 文件**（Core 与产品表同库，两把独立写锁 `database.py:604/686` 与
`work_core/db.py:13`，WAL 只有一个写者槽）。第二失败的清理记录再抛 ⇒ `finally` 逃逸 ⇒ 该轮的
`_active/_contexts/_turn_by_core/_approval_ports/resources/provider._handles` **永不释放**，且未 `close` 的
`SidecarEnvelope._reader` 守护线程留存，继续在共享文件上 `append_turn_event`。累积到第二次，与在**单一事件循环线程**
上同步派发的 wire（`app.py:163` wire dispatch 不 offload）+ `/live`（同循环）争用 ⇒ **HTTP 全面挂起**，进程仍活。

**1↔2 次不对称**：单次失败清理不抛则没事（故 `test_stop_or_failure_pauses_queued_turn` 单轮绿）；只有清理记录**二次抛**才逃逸——
这正由"紧随第一次失败的共享库争用"放大。**会话准入(order 67)不是漏点**：靠 DB 唯一索引，`fail_turn` 写终态即释放，无内存锁可漏。

## 2 修法（阶段 2）——保证释放，任何清理失败都不得跳过

`_complete` 的 `finally` 重构：`close_execution` 单独 best-effort（失败只记 `approval_cleanup_failed`）；
清理记录的兜底 `mark_turn_cleanup` 再失败 ⇒ **就地吞掉并记日志**，**绝不逃出 finally**；随后调用新的
`_retire_run(run)` **无条件**释放 `_active/_contexts/_message_parts/_turn_by_core/_approval_ports` +
`resources.release` + `provider.release_handle`，**每步各自守护**（一处抛不牵连其余）。终态码/错误码（fail_turn）
在 finally **之前**已定，**语义不变**。零改动 wire/队列/前端；无新增无界等待（close 仍 5s、无 sleep/join 入循环）。

## 3 门（阶段 3，`tests/server/test_sidecar_transport_109.py`，全内存、零真实调用）

直接构造"清理记录二次抛"这一确定性触发（fake port 的 `close_execution` 抛 + fake records 的 `mark_turn_cleanup` 抛），
驱动一轮失败轮走完 `_complete`：

- **G1 不泄漏（= 不再挂起的根因门）** `test_cleanup_record_failure_still_retires_the_run`：`_complete` 不抛且
  `_active/_contexts/_message_parts/_turn_by_core` **全空**、`provider._handles` 无该 dispatch。**退回旧 finally**
  （释放在会逃逸的那一段里）⇒ 该轮仍留在 `_active` ⇒ 红（门咬）。
- **G2 语义不变** `test_terminal_error_code_is_unchanged_by_the_release_fix`：失败轮仍 `fail_turn(turn,"HARNESS_CONTROLLED_FAILURE")`
  逐字保留错误码；修挂起没把失败改成成功。
- **G3 有界 / 兜底不抛** `test_success_turn_cleanup_failure_does_not_propagate`：清理记录抛也不从 `_complete` 冒出，run 仍退役。
- **G4 不越界**：`git diff` 面点名——仅 `src/agent_box/server/execution/sidecar_backend.py` + 新测试；无 `wire/**`/队列/前端。

回归：`tests/server/test_harness_sidecar.py`（含 106 排空/队列/failure/stop）+ 本单 = **94 passed / 6 skipped**，
`_complete` 改动无回归。`-k "delay or hang or live or transport"` 的 2 红＝既有环境项
（`opencode_gate_cleanup`、`production_default_lease` 缺预置产物 `FileNotFoundError`），非本单引入。

## 4 真实 HTTP 挂起的端到端复现（如实登记）

本单把挂起的**根因（release 逃逸→逐轮泄漏→单事件循环争用死锁）确定性复现并在源头门住**。"连开两轮真 delay-failure ⇒ 真
uvicorn 线程池/单循环被打死"的**整环活体复现**需受控多线程真传输（与 090/091 的真机腿同类）；此处以源头不变量门覆盖，
端到端活体由验收方在真栈复验（`/live` 与 `server.hello` 有界应答）。

## 5 §Spend / 清理 / 回归计数

真实模型调用 0；全内存假端口/假仓储。清理：无残留。回归计数随 c2 批末报告。
