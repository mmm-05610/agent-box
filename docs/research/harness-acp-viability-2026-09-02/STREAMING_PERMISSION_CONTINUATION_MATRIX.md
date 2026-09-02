# STREAMING_PERMISSION_CONTINUATION_MATRIX — 流式/权限/续接专项矩阵

观察日期 2026-09-02。协议级事实出处：[ACP_PROTOCOL_CAPABILITY_MATRIX.md](ACP_PROTOCOL_CAPABILITY_MATRIX.md)；
每家出处：其 dossier EVIDENCE.md（编号缩写：cx=codex, cc=claude-code, oc=opencode, he=hermes, pi=pi）。
状态词：SUPPORTED/PARTIAL/NOT_SUPPORTED/UNKNOWN/VERSION_SENSITIVE。

## 1. 逐 Harness 能力矩阵（仅列非 SUPPORTED 或有重要细节的项；空白=SUPPORTED）

| 能力 | Codex (codex-acp 1.8.0) | Claude Code (claude-agent-acp 0.73.0) | OpenCode (vendor 1.18.x) | Hermes (vendor 0.19.0) | Pi (pi-acp 0.0.33) |
|---|---|---|---|---|---|
| initialize / capabilities | ✔ 实测 | ✔（air/steering/providers 等 _meta 面） | ✔ 实测（loadSession/fork/list/resume） | ✔ 实测（隔离握手 1s 级） | ✔ |
| session new | ✔ | ✔ | ✔ | ✔ | ✔ |
| **load** | ✔（与 resume 同 id 空间 threadId） | ✔（SDK resume） | ✔（持久 opencode.db） | ✔ | PARTIAL（JSONL 路径 resume） |
| **resume** | ✔ | ✔ | ✔ | ✔ | PARTIAL |
| **fork** | ✔（AIR thread/fork 需客户端广告） | ✔（消息级 fork 点 _meta） | ✔ | ✔ | **NOT_SUPPORTED** |
| prompt | ✔ | ✔（多轮 promptQueueing） | ✔ | ✔ | ✔ |
| streaming text | ✔ | ✔ | ✔ | ✔ | ✔（readline 解析与 pi rpc.md LF 警告冲突，潜在帧错误） |
| thinking | ✔ | ✔ | ✔（reasoning delta） | ✔（reasoning） | ✔（`max` 档被 adapter 拒，CLI 接受=VERSION_SENSITIVE） |
| tool call / update | ✔ | ✔（完整 kind 映射） | ✔（bash 快照/edit diff/图像） | ✔ | PARTIAL（bash_execution_update 塌缩为 tool_call_update） |
| file edits/diff | PARTIAL（rawInput+可选 AIR file-change-report，无标准 diff 载荷） | ✔（structuredPatch） | ✔（经客户端 fs/write_text_file 回写） | ✔（diff） | PARTIAL（有 diff 无 kind 验证） |
| **usage/token/cost** | **NOT_SUPPORTED cost**；tokens PARTIAL（丢 cache_write_input_tokens） | ✔（usage_update + 分模型 quota + 限流 meta） | ✔（usage+cost+context window） | PARTIAL（有 token 无 $cost；native `-z --usage-file` 才有） | **NOT_SUPPORTED** |
| **permission request/response** | ✔（1.7.0 重构：request 级 _meta.permission；`reject_always` 首现） | ✔（可编辑选项+效果契约 _meta.permission） | ✔（allow_once/always；客户端不答=fail-closed） | ✔（3 级 allow/deny；`.git`/`.ssh` 永不自动批；默认 deny） | PARTIAL（仅扩展 UI→requestPermission；bash/edit 无门禁） |
| **question/elicitation** | ✔（elicitation/create；需客户端广告 elicitation.form） | ✔（AskUserQuestion+MCP 表单+OAuth） | **NOT_SUPPORTED**（原生 `question.asked` 无 ACP 映射——**turn 停滞风险**） | **NOT_SUPPORTED**（无 clarify/question） | PARTIAL（扩展 UI） |
| plan approval | UNKNOWN（展示+mode 切换；显式审批门未证） | PARTIAL（ExitPlanMode→switch_mode；无专方法；0.64.2 实验已回滚） | **NOT_SUPPORTED**（todo/plan 更新无映射） | n/a（plan 经 todo→plan 映射） | **NOT_SUPPORTED** |
| cancel | ✔ | ✔ | ✔ | ✔ | ✔ |
| **steer** | 扩展 `_session/steering`（非 core v1；无 promptRequired opt-in→Codeg 弃用其 push 通道） | ✔（含 promptRequired 契约 0.65.0+） | UNKNOWN（mid-turn steer 未证） | NOT_SUPPORTED（仅 slash `/steer` 文本约定） | PARTIAL（客户端侧队列） |
| terminal | PARTIAL（输出经 tool_call_update；不用客户端 terminal 能力） | **NOT_SUPPORTED**（无 terminal 能力声明） | NOT_USED（agent 自管） | NOT_USED（agent 自有工具直执行） | NOT_SUPPORTED |
| filesystem（客户端代理） | **NOT_SUPPORTED**（codex 自行 IO） | PARTIAL（双向都有，无 workspace 边界声明） | NOT_USED（仅 fs/write_text_file 用于已批编辑） | NOT_USED | **NOT_SUPPORTED** |
| mode / config options | ✔（5 预设+additionalDirectories；1.7.0 后无 read-only sandbox 预设） | ✔（6 权限模式；bypass 双门槛） | PARTIAL（仅 model/effort/mode） | VERSION_SENSITIVE（0.19.0 用 modes 承载审批；0.20+ 改 configOptions） | PARTIAL（模型/思考切换） |
| **MCP** | ✔（注入+DISABLE_MCP_CONFIG_FILTERING 必要） | ✔（http/sse+OAuth+status 桥） | ✔（client+config；**客户端可 sdk.mcp.add→仅信任客户端**） | ✔（boot 全局发现；`HERMES_ACP_SKIP_CONFIGURED_MCP=1` 可跳） | **NOT_SUPPORTED**（pi-acp 接受 mcpServers 但丢弃） |
| images | ✔ | ✔（in/out） | ✔ | ✔（非文本块部分忽略） | ✔ |
| subagents | draft RFD（无 child cancel/close；sacp/schema 缺 catch-all → 客户端不可安全开启=Codeg 实证） | ✔（spawned/state_update+扁平回退） | PARTIAL（单个 tool_call；PR 未合） | ✔ | NOT_SUPPORTED |
| session locator | ✔（==threadId，与 native `exec resume` 同空间） | ✔（==native session id；native --resume picker 不可见=反向坑） | ✔（==native id） | ✔（list/resume/fork/load 全有） | PARTIAL |
| native errors | PARTIAL（AIR 需客户端广告） | PARTIAL（AIR 需广告） | PARTIAL（_meta 详情） | PARTIAL | PARTIAL |
| process exit | ✔（SIGKILL 孤儿 UNKNOWN） | ✔（清理链在案；kill -9 UNKNOWN） | ✔（stdin EOF→exit 0） | ✔ | PARTIAL（无 reaper） |

## 2. 三个高风险专题

### 2.1 permission 无限等待（协议无超时）

- 协议 v1/v2 schema 均无 timeout 字段；agent 可无限等待 client（协议代理 R-3，实验证实）。
- 各家 fail-closed 行为不同：OpenCode 客户端不答=fail-closed；Hermes 默认 deny（超时/桥失败）；
  Codeg 用 PermissionQueue+cancel 联动防 responder 永久 park（connection.rs:8756-8778，
  见 [CODEG_ACP_RUNTIME_ARCHAEOLOGY.md](CODEG_ACP_RUNTIME_ARCHAEOLOGY.md)）。
- **Agent-Box 义务**：无人值守场景必须有宿主侧策略层（超时→cancel 联动→TurnComplete；
  headless 默认策略），不能依赖协议。官方文档自曝 headless 桥程序化应答 permission =
  无人值守执行（Hermes dossier SECURITY 节）——Agent-Box 必须真实呈现请求。

### 2.2 续接三梯子与 replay 语义

- Codeg 实用链：`session/resume`（MUST NOT replay）→ 失败 `session/load`（MUST 全量 replay，
  无 cursor/ack，Codeg 只能排空丢弃）→ 失败 `session/new`。
- resume ≠ 事件 replay；load = 全量 replay 且粒度/质量各家参差（Grok 1.0.0 起直接跳过
  load 梯子，Codeg registry.rs:1030-1040）。
- **对 Agent-Box**：ACP 不提供 durable replay → ObservationHub 必须自建事件日志
  （或接受 UI 状态降级）；START_AMBIGUOUS/replay 语义不受 ACP 影响。

### 2.3 capability 协商不足以防 silent no-op（实证三例）

1. **subagents**（codex-acp 1.7.0+）：客户端广告后，`subagent_spawned` 通知在
   agent-client-protocol-schema 0.11.7 无 catch-all arm → 反序列化失败 → 子 session 输出
   从 timeline 消失（Codeg connection.rs:3738-3751，CONTRADICTED 广告即收益）。
2. **plan_update**（codex-acp 1.1.9）：实现存在但 gated 在 sacp 11.0.0 无法表达的
   `clientCapabilities.plan` → 静默不生效（Codeg registry.rs:660-663）。
3. **AIR agentFileChangeReport**（claude 0.69.0/codex 1.4.0）：广告即带来每 prompt 额外
   模型往返 + 报告路径被 clamp 到 cwd 子集（Codeg connection.rs:3717-3736 判定不广告）。

**结论**：capability 协商只保证"不喊不叫"，不保证"叫了就有"；宿主必须对每家维护
广告白名单（Codeg 的 build_client_capabilities 即此实践），并在 schema/SDK 滞后期
默认少广告。
