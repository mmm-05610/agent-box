# Work Order 52 阶段 A —— 逐家进程事实的可得性观察

执行：2026-09-17，env-provider 工作树。**零模型调用、零代码改动**（与 51 阶段 A 同批的
只读观察：键名、列名、行类型计数；未读消息正文与凭据）。

问题：工单 52 要的"会话进程事实"——**思考文本、工具调用生命周期、计划、模式**——
各家在协议层与 native 层分别给不给。

## 协议层（第一来源）

- **ACP schema 的 sessionUpdate 词汇**（工单撰写时核实的 vendored 定义，本轮复核引用）：
  `agent_message_chunk`、`agent_thought_chunk`、`tool_call`、`tool_call_update`、
  `plan_update`、`plan_removed`、`current_mode_update`。
  ⇒ **思考/工具/计划/模式四类事实 ACP 全都有**——缺口不在上游，在**我们的桥与
  Server 的 `_forward()` 只认 `agent_message_chunk`**（工单 note 的核心判断，维持成立）。
- 非 ACP 家族：opencode/kilo 走中立 driver（上游 JSON-RPC，词汇待 B 阶段实现时逐字段
  核实）；codex 走 codex-acp（同样是 ACP 面上的一层）。

## native 层（本机真实存储的佐证，只读）

| 家族 | 载体 | thoughts | 工具生命周期 | 计划/模式 |
| --- | --- | --- | --- | --- |
| hermes | `state.db` `messages` 表 | `reasoning` / `reasoning_content` / `codex_reasoning_items` 列 ✓ | `tool_calls` / `tool_name` / `tool_call_id` 列 ✓ | 无专列 |
| codex | rollout jsonl | `response_item` 行内的 reasoning 项（本轮行类型计数：`response_item`×4、`event_msg`×3） | `event_msg` 行（工具事件族） | 无 mode |
| claude-code | `projects/*.jsonl` | `assistant` 行（thinking 块）✓ | content 内 tool_use/tool_result | `output_style` 行近似 mode |
| opencode / kilo | `*.db` `part.data`（JSON blob） | 待 B 阶段逐字段核实（无专用列） | 同左 | 同左 |
| pi / dsh / qwen | ACP（pi-acp / dsh / qwen） | 同 ACP 词汇 | 同 ACP 词汇 | 同 ACP 词汇 |

## 结论（对阶段 B–D 的输入）

1. **上游都在发**：ACP 的七类 sessionUpdate 覆盖工单要的全部四类事实；缺口是
   桥/Server 的单字段转发。52 的实现主体是**映射的补全**，不是新协议。
2. **native 层可作佐证/兜底**：hermes 的列、codex 的 response_item 都能交叉验证
   桥的映射没有丢事实；但 52 的正路是协议面（native 回读不是本单范围）。
3. **wire 约束**：中性事件映射 + 与 51 共享**一次** wire 重锁（工单已定）；本阶段
   确认 wire 现状只有 agent_message_chunk 单一转发路径可挂。
4. **"没有就显示没有"**：mode/plan 在 codex/hermes 的 native 层无专列，若其协议面
   也不播发，则 UI 对该家族显示"无计划/无模式"——不编造。
