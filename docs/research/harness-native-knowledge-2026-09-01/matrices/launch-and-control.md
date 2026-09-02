# 矩阵：启动模式与运行控制（launch-and-control）

来源：各 harness FACTS.md C/I 节 + candidate.toml `[launch_modes]/[control]`。
观察 2026-09-01/02。对 Agent-Box `harnesses.toml` 现声明的偏差以 ⚠ 标注。

## 1. 真实启动模式总表

| harness | headless one-shot | 结构化输出 | server/协议模式 | resume | 退出语义 |
| --- | --- | --- | --- | --- | --- |
| codex | `codex exec [PROMPT]`（`-` 读 stdin；非 git 目录取 `--skip-git-repo-check`） | `--json`（stdout JSONL，stderr 承载 banner/diagnostics）、`-o <file>`、`--output-schema` | `codex app-server`（JSON-RPC/JSONL over stdio；per-user 单例 daemon；`--listen stdio/unix/ws`）；`codex mcp-server`（弃用中）；`codex review`；`codex sandbox` | `codex exec resume <id\|--last>`；`codex fork`；thread_id 即句柄 | 进程退出==任务完成；0 成功；1 配置/用法错误；观测到 101（连接失败重试后）；完整退出码表 unknown |
| claude-code | `claude -p "<prompt>"`（text/json/stream-json + `--include-partial-messages`、`--include-hook-events`） | json=单结果对象（result/session_id/usage/cost）；stream-json=事件流；`--json-schema` | stream-json **input** mode（stdin 多轮 + control_request/control_response 控制面）；Agent SDK 同一二进制；`claude mcp serve`（22 工具，免模型可用）；`--bg` 后台 agents | `--resume <id>`、`--continue`、`--fork-session`、`--session-id <uuid>`；-p 会话不可被 picker 列出但可按 id resume | result 事件为每轮终点；验证/启动失败 exit 1；hook 阻断 exit 2 |
| opencode | `opencode run [message..]`（`--format json` 原始 JSON 事件流；`-f` 附件；`--command`） | json 事件流（session.status/error、permission.asked…）；`opencode db <sql>`/`session list --format json`/`export` | `opencode serve`（HTTP，OpenAPI `/doc`，SSE `/event`、`/global/event`，basic auth）；`opencode attach <url>`（TUI 连 server）；`opencode acp` | `-c/--continue`、`-s <id>`、`--fork`（TUI/run/attach 通用） | 流式至 session idle 再退出；出错 exit 1；**无凭据时不快速失败（观测 ≥25s 静默挂起）** → Host 必须设超时 |
| hermes | `hermes -z <PROMPT>`（argv；stdout 仅最终文本；`--usage-file <path>` JSON 运行报告，失败也写） | usage-file JSON（cost/tokens/api_calls/session_id/completed/failed）；结构化事件通道在 ACP/serve ⚠ **`hermes --print` 不存在**（argparse 拒绝；Agent-Box 现声明 argv=["hermes","--print"] 无效） | `hermes serve`（JSON-RPC/WebSocket，默认 127.0.0.1:9119，公网 bind 强制 auth）；`hermes acp` / `hermes-acp`（编辑器）；`hermes mcp serve`；gateway/dashboard/send/cron/kanban 等外围 | `--resume <SESSION>`、`--continue [NAME]`（SQLite state.db） | -z 观测：无 provider 配置→exit 1、stderr 诊断；成功码 unknown（需凭据）；-z 用 `os._exit` 结束（无后置控制通道） |
| pi | `pi -p "<prompt>"`（argv + @file + stdin 合并；`--no-session` 可 ephemeral） | `--mode json`：首行 session header（version 3）+ agent/turn/message/tool_execution/queue_update/compaction 事件；`message_update` 为增量；**最佳 observation 信封候选** | `--mode rpc`（stdio 全双工 LF 分帧 JSONL；30+ 命令：prompt/steer/abort/set_model/set_thinking_level/compact/bash/session 树操作…；Node readline 对 U+2028/9 不合规的坑） | `-c/--continue`、`-r/--resume`、`--session <path\|partial-uuid>`、`--session-id <uuid>`（create-if-missing）、`--fork` | 0 正常；1 末条 stopReason error/aborted 或异常；SIGTERM→143、SIGHUP→129；无凭据不自动失败（信任策略见下） |
| grok-build | `grok -p/--single <PROMPT>` | `--output-format plain\|json\|streaming-json\|streaming-messages-json`（NDJSON ACP 会话更新映射到 10 变体 StreamEvent 枚举） | ACP agent mode | `-s/-r/-c`（续/恢复/最近） | 未本机验证 |
| kilo-code | `kilo run [message..]`；`--auto`（完成/超时自动退出） | 无 per-run JSON 流（文档级）；`kilo export` JSON；ACP server | `kilo serve`、`kilo acp`、`kilo attach <url>`、`kilo daemon` | `-c/--continue`（与 --auto 互斥） | **退出码契约**：0 成功 / 124 超时 / 1 错误；无 `--auto` 时权限请求被自动拒绝且 exit 1（fail-closed） |
| zcode | 无官方 CLI 无头入口（Tier C） | — | — | — | — |

## 2. 审批/权限机制对照

| harness | headless 默认行为 | 显式跳过 | 审批响应通道 |
| --- | --- | --- | --- |
| codex | exec: `approval: never`（banner 实证）；sandbox 默认 read-only | `-a on-request\|never`、`--full-auto`（已弃用别名）、`--dangerously-bypass-approvals-and-sandbox`、`-s workspace-write` | app-server 服务器发起 RPC：accept/acceptForSession/decline/cancel/acceptWithExecpolicyAmendment |
| claude-code | `-p` 下 `.mcp.json` 等无审批提示；settings 权限照常生效 | `--permission-mode acceptEdits\|auto\|bypassPermissions\|manual\|dontAsk\|plan`（manual≡default）、`--dangerously-skip-permissions`、`--allowedTools/--disallowedTools` | stream-json input mode 的 control_request(can_use_tool) → control_response(allow/deny + updatedInput/updatedPermissions)；`--permission-prompt-tool` |
| opencode | headless **默认自动拒绝**全部权限请求（带 warning） | `--auto`（≈`--yolo`/`--dangerously-skip-permissions`） | HTTP：`POST /permission/:id/reply {once\|always\|reject}`；SSE `permission.asked` |
| hermes | `-z` 下 approvals 自动 bypass（yolo），clarify 回调自动应答 | `approvals.mode manual\|smart\|off`、`--yolo`、`HERMES_YOLO_MODE` | 交互 REPL 内；deny globs 优先于 yolo；ACP/serve 协议面 |
| pi | **无内建审批**（哲学：容器内运行/扩展把门）；headless 信任按 `defaultProjectTrust`（ask/never → 忽略项目 .pi 资源）；`-a/--approve` 单次信任 | `--tools/--exclude-tools/--no-tools` 工具门控 | RPC/扩展层；无原生 permission 事件 |
| kilo-code | 非 `--auto` 的非交互 run 自动拒绝权限请求并 exit 1 | `kilo run --auto` | ACP 面 |

## 3. 对 Agent-Box 现声明（launch_modes）的逐项纠错

| 现声明 | 官方事实 | 纠错方向 |
| --- | --- | --- |
| codex `launch_modes` 只有 interactive/exec/app-server 三条，且只消费 `[0]`（TUI） | 真实主链是 exec（headless）与 app-server（控制面）；TUI 不适合自动化 | launch mode 必须可选择（mode 参数化），exec 模板需 `--json`/-o/--skip-git-repo-check 决策位 |
| claude exec argv=`["claude","--print"]` | 缺 `--output-format`/`--verbose`/输入通道声明；TUI 需 TTY | headless 声明应指向 stream-json 家族 |
| opencode exec argv=`["opencode","run"]` | run 需决定 `--format json` 与 `--auto` 语义；无凭据会挂起 | 模板需输出格式与超时/凭据前提 |
| hermes exec argv=`["hermes","--print"]` | **`--print` 不存在**；headless 是 `-z`，且 HOME 不可单独搬家（console script 依赖 site-packages） | argv 必须改为 `["hermes","-z"]`；env 白名单必须保留 python 导入路径或整 venv staging |
| pi exec argv=`["pi","--agent-dir","<guest>","--print"]` | **无 `--agent-dir` flag**（被静默吞掉）；正确隔离是 `PI_CODING_AGENT_DIR` env；`--print` ≡ `-p` 可用但建议 `--mode json` | argv 改为 `["pi","--mode","json"]` + env 注入 |
| `runtime.io="stdio"` 全部 | codex TUI/claude TUI 需要 pty；exec 类是 stdio | io 属于 mode，而非 harness 常量 |
| `runtime.network="required"` 未消费 | 全部 harness 默认需网（模型 API；codex 走 WebSocket）；pi 有 PI_OFFLINE | 应映射到 `HarnessCommandSpec.requires_control_plane_network/tool_network_requirement` |

## 4. 控制能力对照（interrupt/steer/attach/model）

| harness | interrupt | steer/follow-up | attach | 会话中 model/effort 切换 |
| --- | --- | --- | --- | --- |
| codex | app-server `turn/interrupt` | `turn/steer`（需 expectedTurnId）；`codex queue --thread` | daemon proxy、TUI `--remote`、rollout resume | `turn/start` 参数；mid-turn 切换开发中；`model_reasoning_effort` |
| claude-code | control_request `interrupt` | input mode 继续发 user turn | SDK/`claude agents view`/`--bg` | TUI only（/model）；effort 有 `--effort`/env |
| opencode | `POST /session/:id/abort` | `prompt_async`/message 排队 | `attach <url>`；多客户端 | 支持（model-switched 事件；每 prompt 可带 model） |
| hermes | 信号（SIGINT/SIGTERM grace） | REPL 内；v0.21 起 subagent steering | dashboard/TUI/gateway attach + resume | /model；config |
| pi | RPC `abort`（先 `clear_queue`）；TUI Escape；SIGTERM/SIGHUP 有码 | RPC `steer`/`follow_up`；streamingBehavior | `--mode rpc` 长驻 + `switch_session` | RPC `set_model`/`set_thinking_level`（并作为 change 条目回放） |
| kilo-code | 未验证 | 未验证 | `attach <url>` | 未验证 |

## 5. 结论

"启动模式"必须是 Agent-Box Registry 的一等公民（mode 参数化 + 每 mode 独立
argv/env/io/output 声明），且 headless 模式的输出信封（codex --json、claude
stream-json、opencode --format json、pi --mode json、grok streaming-json）是
Observation envelope 的直接输入。现状 `launch_modes[0]` 不可修复性地错误。
