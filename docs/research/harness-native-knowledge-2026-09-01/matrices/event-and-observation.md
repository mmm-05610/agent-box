# 矩阵：事件与观测（event-and-observation）

来源：各 harness FACTS.md H 节 + candidate.toml `[events]`。观察 2026-09-01/02。
此矩阵是 Agent-Box "Observation/Event envelope candidate" 的直接输入。

## 1. headless 结构化输出信封对照

| harness | 信封 | wire 形态 | 完成标记 | session 定位 |
| --- | --- | --- | --- | --- |
| codex | `--json`：封闭事件集 `thread.started{thread_id}` / `turn.started` / `turn.completed{usage}` / `turn.failed{error}` / `item.started\|updated\|completed{item}` / `error{message}` | stdout 纯 JSONL（serde tag `type`）；banner/诊断走 **stderr** | `turn.completed`（每 turn）+ exit 0；无独立 session-ended | `thread.started.thread_id`（UUID，即 resume 句柄）；rollout：`sessions/YYYY/MM/DD/rollout-<ts>-<thread_id>.jsonl` |
| claude-code | `-p --output-format stream-json --verbose`：`system/init`（session_id/model/cwd/tools/slash_commands/mcp_servers/permissionMode）→ `assistant`/`user` 内容块 → `stream_event`（增量，需 `--include-partial-messages`）→ `result`（终态） | stdout NDJSON；`result` 字段含 subtype/duration/is_error/num_turns/session_id/usage{...costUSD}；SDK 警告勿跨长连接累加 total_cost_usd | `result` 事件（每 turn 终点） | init/result 的 `session_id`；transcript：`<config>/projects/<dash-cwd>/<session-id>.jsonl`（**内部格式，官方建议用 hooks 的 transcript_path 而非解析**） |
| opencode | `run --format json`：SDK v2 事件原流（headless 循环事件：`session.status`（idle 即终）、`session.error`、`permission.asked`） | stdout JSON；server 面 SSE `/event`、`/global/event`；part 类型 text/reasoning/file/tool(state)/step-start/step-finish | `session.status idle` | ses_*/msg_*/part_* id 族；存储 **SQLite `opencode.db`**（可用 `opencode db <sql>`/`export [--sanitize]` 观测） |
| hermes | `-z` 默认只回最终文本；结构化面 = `--usage-file <path>` JSON（estimated_cost_usd/cost_source/各 token 计数/api_calls/model/provider/session_id/completed/failed；**失败也写**） | ACP（`hermes-acp`）与 `hermes serve`（JSON-RPC/WS）是结构化事件通道 | usage-file 的 completed/failed 字段；state.db 会话记录（含 oneshot） | usage 报告与 state.db；`--pass-session-id` 可注入 system prompt |
| pi | `--mode json`：首行 session header `{type:session,version:3,id,timestamp,cwd}`，随后 agent_start/end、turn_start/end、message_start/update/end（delta-only + usage）、tool_execution_start/update/end、queue_update、compaction_start/end | stdout JSONL；`message_end` 为权威 | turn_end + exit 码（1=末条 stopReason error/aborted） | header `id`；RPC `get_state.data.sessionId`；bash 子进程注入 `PI_SESSION_ID/PI_SESSION_FILE/PI_PROVIDER/PI_MODEL/PI_REASONING_LEVEL` |
| grok-build | `--output-format streaming-json`：NDJSON ACP session updates → 10 变体 StreamEvent 枚举（AgentMessage/AgentThought/ToolCall/ToolCallUpdate/Plan/AvailableCommands/Lifecycle/ResponseStarted/ReasoningCompleted/ResponseCompleted） | stdout NDJSON | ResponseCompleted（源码级） | ACP session 语义（源码 reducer 文件级引用） |
| kilo-code | 无 per-run JSON 流（仅 `kilo export` JSON 与 ACP 面） | — | 退出码契约 0/124/1 | 未文档化 |

## 2. usage/cost/token 观测

| harness | 字段来源 | 稳定性 |
| --- | --- | --- |
| codex | `turn.completed.usage`：input/cached_input/cache_write_output/output/reasoning_output tokens | VERSION_SENSITIVE |
| claude-code | result.usage（inputTokens/outputTokens/cacheRead/cacheCreation/webSearchRequests/costUSD） | VERSION_SENSITIVE |
| opencode | per message/model usage（session.getUsage）；`opencode stats` | VERSION_SENSITIVE |
| hermes | usage-file JSON（唯一 headless 结构化面） | STABLE-ish（文档化 flag） |
| pi | message_update.usage + cost{...total}（provider 报告前可为 0） | VERSION_SENSITIVE |

## 3. 容错与一致性

- **unknown 事件容忍**：codex 为封闭 serde enum（未知事件行为 unknown）；claude 对 system 类
  有宽松透传（generic SystemMessage），完整行为未验证；opencode/pi 未文档化 →
  Agent-Box envelope 必须自带"unknown 事件计数/旁路"设计，不能假设闭合枚举。
- **stdout/stdin 分工**：codex 是"stdout=数据、stderr=人类诊断"的典范；claude 用 hooks 的
  `--include-hook-events` 走事件流而非 stderr；opencode 日志可 `--print-logs` 到 stderr。
- **session log 一致性**：claude 明确"transcript 内部格式会跨版本变化，勿解析"；codex rollout
  jsonl + sqlite（WAL）；opencode 已从 JSON storage 迁 SQLite（legacy 布局仅迁移源）；
  hermes SQLite state.db 为权威（FTS5，自修复）；pi JSONL v3 有版本号与迁移。
  → 共同结论：**adapter 应消费 CLI 的结构化 stdout，而非解析 session 存储**；
  session 存储只作为 locator/continuation 的只读证据。

## 4. 对 Agent-Box 的观测差距（对照现状）

1. `GenericCliAdapter.observe/finish` 直通 handle —— 五个 harness 的全部上述信封无一处被解码。
2. `capabilities=["observe","stream"]` 回显 "supported" 但无 decoder —— 建议方向是
   observation-envelope-candidate：以 pi `--mode json` / codex `--json` / claude stream-json /
   opencode `--format json` 为四个先例设计 canonical frame 集（借 lite-harness 词表：
   system/init、assistant、user、stream_event、result + control_request/response）。
3. session locator（resume 句柄）在五个 harness 中都有原子来源（thread_id / session_id /
   ses_* / state.db / header id）—— 现链路无提取点（continuation spec 未消费）。
