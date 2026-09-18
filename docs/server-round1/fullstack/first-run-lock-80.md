# 工单 080 报告 —— 共享库"首次运行"锁（066-G5 的实测失败）

执行：2026-09-19，env-provider 工作树。终态：**FIRST_RUN_LOCK_DONE**。
基线：`f819ad3`（checkpoint/b1）。真实模型调用 **0 次**（本地 opencode + loopback 假端点）。

## 1 复现（阶段 1）

用 066 交付的**无锁**并发门（`scripts/server-round1/shared-store-concurrency-gate.py`，设计上不含锁）
复跑，真 opencode 1.18.21、两进程、一个全新库：

- 本轮演练：**冷启动 2/3 失败**（`STORE_GATE_RUN_FAILED`，`database is locked`），初始化后 3/3 绿；
- 与 066 首次实测（**6/7 失败**：5×`database is locked`、1× workspace 外键竞态）一致 ⇒ 缺陷稳定复现。

## 2 实现（阶段 2）：按库首跑锁

**语义**：键 = **（放置，家族）**（如 `local:kilo`、`wsl:opencode`）。第一次对该键的轮次
**独占**（持锁至该轮**终态**）；并发首跑**有界等待**（超时类型化 `FIRST_RUN_LOCK_TIMEOUT`，不永久阻塞）；
首轮终态之后该键标记 **ready**，之后所有轮次**直接放行**（不引入全局串行）。

**落点**（`src/agent_box/server/`）：

| 文件 | 位置 | 作用 |
| --- | --- | --- |
| `execution/first_run_lock.py`（新） | `FirstRunGate.acquire/release_all/reset` | 门本体：独占、有界等待、类型化超时、ready 放行 |
| `execution/sidecar.py` | `SidecarHarnessPort.whole_db_store`（新属性） | 只在 **whole-db**（launcher 带 `shared` 条目）生效；`sessions-subtree` 无共享库不需要 |
| `execution/sidecar_backend.py` | `_start_run`：`open_execution` **之前** acquire | 锁在"房间存在之前"取，正对建库窗口；`open_execution`/附件拒绝等失败路径立即释放 |
| 同文件 | `_complete_then_retire` 的 `finally` | 首轮终态（成功/失败/取消）→ 标记 ready 并放行等待者 |
| 同文件 | `stop()` | 强制释放未终结的首轮（同一进程内的后续 runtime 不会被死锁持有者挡住） |

**两个设计取舍（如实记录）**：

1. **就绪判定 = "首轮终态"**，不是"库文件已初始化"：后者需要跨通道的库状态探测（WSL 侧库在
   worker 机器上，Server 不可见；Worker 没有"看库状态"的 op）。代价：**每个库一生一次**，并发的
   第二个首跑要等第一个首跑**整轮**结束；收益：两侧通道同一实现、无新的跨通道协议面。
2. **键故意粗**（放置+家族）：键太细会静默停止加锁（"假放行"是本模块唯一不能有的失败模式）；
   太粗只多一次一次性等待。**同键的第二个不同的库**（如数据根被重建）不会再被锁——记账为已知边界。

## 3 门（阶段 3）

### 3.1 单元：门的语义（`tests/server/test_first_run_lock.py`）

- 首跑独占：第二个 acquire 在持有者释放前**阻塞**（实测等待 ≥0.15 s）→ 释放后**立即**放行；
- 有界等待超时 → **`FIRST_RUN_LOCK_TIMEOUT`**（类型化，含键名），不是静默进入。

### 3.2 Server 接线（同一文件，真 Server + 本机通道 + whole-db 夹具）

- 两个 profile 各起一个**首跑**（同库、并发、`hold-for-window` 造 500 ms 重叠窗）：
  夹具把每轮的 `start/end` 时间戳写进**共享** `windows.txt` ⇒ **两窗口不相交**（串行化生效）、
  两轮都 completed、`first_run_gate().in_flight("local:kilo") == False`；
- **反例（门有牙）**：把门换成 no-op 后**同一形状两窗口相交**（正是真 harness 相撞的那个窗）。

### 3.3 真 harness：七轮冷库双首跑

`test_seven_cold_library_first_run_races_stay_green_with_the_gate`（真 opencode 1.18.21，无 bwrap 时跳过）：

- **7/7 轮全绿**（每轮 = 新库 + 两个真进程；每轮重建门 = 每库一次首跑），stderr 零 `database is locked`，
  库内 `project` 行不重复、`project_directory` 无重复；耗时 36 s；
- **反例（同一形状、无锁）**：066 的无锁门复跑 **2/3 冷启动失败**（§1）——同一命令、同一二进制、
  同一库形态，唯一差别是那道锁。设计如此：无锁门**保持无锁**作为反例常备证据，不写进套件
  （它注定会失败，进套件只会制造 flaky）。

**组合论证（不夸大）**：真 harness 轮证明"门能挡住这个竞态"（进程级）；接线轮证明"Server 确实用门、
且拿去门就重叠"（产品路径）。二者合起来覆盖"产品路径上的首跑被串行化"；**未**做的是一条把
真 opencode 经 WSL worker 打进 Server 的全栈并发轮（成本高、收益与上述组合重叠），如实记账。

## 4 回归与账

- 全量套件：**887 passed / 0 failed**（本轮实测，233 s；批内基线 882 + 本单新增 5 条测试）。
- 66 的 9 条既有测试在新 peer（windows.txt 为**独立文件**，journal 断言形状未变）与门在场下 **9 passed**。
- 清理：无临时根残留（测试用 tmp_path）；无真实模型调用。
- **66 行刷新**：`SHARED_SESSION_STORE_PARTIAL → SHARED_SESSION_STORE_DONE`（G5 由本条补齐：
  ①夹具级 ②真 harness 7/7 ③零 busy ④同会话拒绝）；`status.md` 同步。
