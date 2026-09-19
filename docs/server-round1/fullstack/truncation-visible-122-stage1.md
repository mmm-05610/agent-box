# Work Order 122 — 截断必须可见：阶段 1 一手核对 + 字段需求交回 ops（主路径）

终态：**`TRUNCATION_VISIBLE_PARTIAL`**（本树执行段**手里没有这个事实**⇒ 非"有而不说"，是"根本没量出来"，
须先补 Worker/ACP 协议字段＝合同变更，122 阶段 5 明写"若必须新增 wire 字段⇒交回 ops，不许自行发明"）。
§Spend：0 真调用 / ¥0（本阶段只读源码 + 引 A 一手 T6-4，不发真实调用）。

## 1 一手核对：执行段手里到底有没有"被截断"这个事实？

沿 `_complete`（`sidecar_backend.py:468`）→ `complete_turn`（`sessions/repository.py:747`）→ `wire/projection.py:173`
逐层读：

- **完成语义**：`_complete` 正常路径**无条件**投影 `Outcome.SUCCEEDED`（`sidecar_backend.py:543-548`），
  并把 `run.result or {}` **整块**塞进结果对象的 `nativeResult`（`:539-541`）——**从不解析**其中是否含 stop/finish reason。
- **停止原因词汇在 Python 侧缺席**：`grep stopReason|stop_reason|finish_reason|end_turn|MAX_TOKENS` 在
  `execution/**`、`sessions/**`、`protocols/worker/**` **零命中**（`end_turn` 命中的是 `end_turn(...)` 方法名，不是 finish 值）。
- **`complete_turn` 根本不写 `terminal_reason`**：它 `UPDATE ... SET state='completed'`，无 `terminal_reason=`（`:785`）。
  而下游 `wire/projection.py:173` 已经 `reason = terminal_reason or error_code` ⇒ **可见通道本就在**，只是没人往里写。
- **A 的 T6-4 一手键扫描佐证**：整份 `history.snapshot` 里含 `trunc/stop/finish/max/cap` 的键 **＝ 0 个**，
  `execution.state` 仍 `completed`。⇒ 结论不是"事实被吞"，而是 **Worker/ACP 完成事件根本没带 stop reason**。

**判定（122 阶段 1 二选一）**：属"**无**⇒先把它量出来"那一侧，而"量出来"要在 **Worker 完成事件**上新增
`stopReason`（ACP 既有词表：`end_turn`/`max_tokens`/`max_turn_requests`/`refusal`——**不是新造词，但该字段在
Worker 契约上尚不存在**）⇒ **是 Worker 协议/ACP 桥的合同变更**（45/A 线写面 + `protocols/worker/v1.schema.json`），
不在本单 `execution/**`+`bootstrap/**` 写权内，也不许本树臆造。

## 2 交回 ops 的字段需求（122 阶段 5）

- **需要什么**：Worker→Server 的 turn 完成结果（`run.result`，ACP PromptResponse 形）带一个**机器可读的
  `stopReason`**（值取 ACP 既有枚举），当模型因输出上限被砍断时为 `max_tokens`（非 `end_turn`）。
- **给谁消费 / 落点**：Server 侧 `_complete` 读到 `stopReason != end_turn` 时，经 `complete_turn` 写入
  `server_turns.terminal_reason`（列已存在：`storage/database.py:125`）；`wire/projection.py:173` 的
  `reason` 已把它透给客户端 ⇒ **下游无需新字段即可"可见"**。
- **影响哪张单**：新增 Worker op 结果字段 = Worker 控制合同变更（`protocols/worker/v1.schema.json` +
  `workers/agent-box-worker/**` 出 stopReason + `sidecar.py` 解析 + 三元门 102 复算）——建议 ops 另开一张
  Worker-协议字段单（A 线出字段、QA 盯三元），本单届时只需补"读到 stopReason⇒写 terminal_reason +
  Outcome 可区分标志 + 反例门"。
- **本树为何不先做**：`terminal_reason` 的写入点在 `sessions/repository.py::complete_turn`＝**本单 write_paths 之外**；
  且上游没有 `stopReason` 源时写它＝为不存在的字段编造值（违 R-0032⑤"别把信息在中间吃掉"的反面——不许**凭空造**信息）。

## 3 一旦字段到位、本单可即刻收口的剩余（逐条）

1. `_complete` 解析 `run.result["stopReason"]`；非 `end_turn` ⇒ 不再无声 `Outcome.SUCCEEDED`（给可区分标志：
   `terminal_reason=stopReason`，必要时 Outcome 侧新增可判标志走 work_core/wire 枚举＝再一层合同变更）；
2. `complete_turn` 接 `terminal_reason=` 写列；
3. 反例门：截断（假 `stopReason=max_tokens`）⇒ `reason` 非空且 `state` 可区分；正常 `end_turn` ⇒ 无标记（不误报）；
4. 客户端读法写进报告：读 execution 结果的 `reason`（既有面）即可判"被截断"。

**结论**：本树射程内**无可诚实落地的代码改动**（改动全卡在"缺上游字段 + 写点在别单文件"）⇒ 阶段 1 一手核对 +
阶段 5 字段需求交回＝当前唯一诚实终态 **`TRUNCATION_VISIBLE_PARTIAL`**。非"无事可做"：是"要先有别人给的字段"。
