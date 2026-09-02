# NATIVE_VS_ACP_FIDELITY_MATRIX — ACP 路径相对 Agent-Box 现有 native 接口的保真度损失

观察日期 2026-09-02。native 基准 = Agent-Box 现有 Adapter/Decoder（`<workspace>/plugins/agent-box-harnesses/src/agent_box_harnesses/adapters/`）
+ 上一轮 native 知识库 `docs/research/harness-native-knowledge-2026-09-01/`。
ACP 侧出处 = 各 dossier。重要度标记：**P0**（Agent-Box 现有 P0 能力受损）/ P1 / P2。

## 1. 逐家损失清单

### Codex — native `codex exec --json` / `codex app-server` vs ACP（codex-acp 1.8.0）

| native 有 | ACP 命运 | 级别 |
|---|---|---|
| `turn.completed.usage`（含 cache_write_input_tokens） | 丢 cache_write；无 cost | **P0**（usage 记账） |
| app-server 专有面：thread/rollback|revert|search|archive、review/start、skills/plugin/project/hooks 列表、account/usage、command/exec 持久终端、windowsSandbox、experimentalApi | 不可达 | P1 |
| exec 便利面：`--output-schema`/`-o`/`--ephemeral`/`-p`/`-c`/`--skip-git-repo-check`/`--thread-source` | 无 ACP 入口 | **P0**（结构化输出 contract） |
| 沙箱/审批细粒度（approval_policy、sandbox_mode 任意组合） | 收敛为 5 预设 mode + additionalDirectories | **P0**（governance 收窄） |
| 保留等价 | sessionId==threadId（与 native resume 同 id 空间）；web_search/AGENTS.md/skills/MCP 经同一 CODEX_HOME 仍生效 | — |

### Claude Code — native `--print --output-format stream-json --verbose` vs ACP（claude-agent-acp 0.73.0）

| native 有 | ACP 命运 | 级别 |
|---|---|---|
| `result` 聚合帧：num_turns/duration_ms/duration_api_ms/stop_reason/terminal_reason/permission_denials/**structured_output**/api_error_status/is_error | **全部无出口**（E-16） | **P0**（Finish 证据与结构化输出） |
| `system/init` 首帧自描述（tools[]/mcp_servers[]/apiKeySource/初始 permissionMode/model） | 丢 | P1 |
| `stream_event` 原始 Anthropic delta | 被重编码不可逆 | P2 |
| hook 观测帧（hook_started/hook_response；hooks 仍执行） | 不透传 | P2 |
| `tool_use_result` 原始结构 | 部分丢失 | P2 |
| launch flags：`--bare`/`--safe-mode`/`--no-session-persistence`/`--setting-sources`/`--append-system-prompt`/`--max-turns`/`--max-budget-usd`/`--fallback-model`/`--json-schema` | 无 ACP 入口 | **P0**（隔离/预算 governance） |
| 保留 | usage+cost、权限模式全集、resume/**fork（更强，消息级）**、@-mention/images/todo/slash/异步任务/subagents | — |

### OpenCode — native `opencode run --format json`/SSE vs ACP（vendor 内建）

| native 有 | ACP 命运 | 级别 |
|---|---|---|
| `question.asked` 原生问询 | **无 ACP 映射**——turn 停滞风险 | **P0**（若依赖 ask 交互） |
| todo/plan 更新、step-start/step-finish | 无映射 | P1 |
| /undo /redo、会话共享、消息操作 | 供应商文档明确不支持 | P1 |
| 子代理内部流、compaction 事件（仅 /compact） | 丢/降级 | P2 |
| 保留 | 文本/reasoning delta、完整 tool 生命周期、usage+cost+context window、allow_once/always 权限、模型/agent/effort 切换、session list/load/resume/fork（id==native id） | — |

### Hermes — native `-z`（批处理 JSONL，含 usage-file/cost）vs ACP（`hermes acp`）

| native 有 | ACP 命运 | 级别 |
|---|---|---|
| `estimated_cost_usd`（native `-z --usage-file`） | ACP 面无 $cost 字段 | **P0**（成本记账） |
| messaging/audio/cron 工具面 | hermes-acp toolset 有意剔除 | P1 |
| CLI 审批选项全集 | ACP 审批简化（官方自述） | P1 |
| 非 ACP 交互面（dashboard/serve 等自治模式） | 正交，不受影响 | — |
| 保留 | 流式文本/reasoning/tool 起止+diff/todo→plan/token usage/3 级审批/模型切换/load/resume/fork/list/MCP/图片/subagent/slash + `_meta.hermes.sessionProvenance` 扩展 | — |

### Pi — native `pi --mode json`（+ `--mode rpc` 升级基底）vs ACP（pi-acp 0.0.33）

| native 有 | ACP 命运 | 级别 |
|---|---|---|
| usage+cost | **全丢** | **P0** |
| fork/clone/session tree、compaction 事件 | 丢（仅 slash /compact） | P1 |
| bash_execution_update 流 | 塌缩为 tool_call_update | P2 |
| 扩展 UI、启动信息帧 | 有损映射/非规范文本注入 | P2 |
| 保留 | JSONL v3 持久化、resume、images、slash commands、模型/思考切换 | — |
| 特殊 | vendor 明拒 ACP（issue #175）；pi-acp 为单维护者社区件 | 结构性风险 |

## 2. 横向判定

1. **usage/cost 是最大公约损失**：五家 ACP 路径中三家（codex/pi/hermes）在 $cost 上残缺，
   codex/pi 连 token 都降级。Agent-Box 的 usage 记账（P0）在 ACP-only 下不可满足 →
   必须保留 native 观测通道或旁路（如 hermes `-z --usage-file`、parser 同步）。
2. **structured output / Finish 证据**：claude `result` 帧与 codex `--output-schema` 在 ACP 面
   均无出口 → explicit Finish 的证据链（exit evidence、terminal observation）在 ACP-only 下
   降级为 stopReason + 文本。与"process exit ≠ Finish、Finish 由 Host 决定"的现有边界冲突。
3. **governance 收窄**：codex 沙箱/审批 5 预设、claude 隔离 flags 不可达 → Profile 边界的
   治理强度在 ACP 路径上系统性变弱。
4. **opaque escape hatch 不存在**：native unknown 事件的唯一载体是各家 `_meta`/扩展方法
   （codex `_meta.codex.*`、claude/jetbrains AIR、hermes `_meta.hermes.sessionProvenance`、
   grok `_meta["x.ai/sessionConfig"]`），全部**可选且 per-adapter**，不是协议保证；
   Agent-Box 的 `NativePayload`（bounded_native）在 ACP 路径只能装这些 `_meta` 残片。
   per-Harness special case 并未消失——从"解码器分支"移到"`_meta` 词汇表分支"。
5. **好消息**：vendor-native 两家（OpenCode/Hermes）的 ACP 面已覆盖 streaming/permission/
   续接主干，session locator 与 native id 同空间，续接真正等价；这两家上 ACP 不产生
   P0 损失（OpenCode 的 question、Hermes 的 cost 除外——已标 P0）。
