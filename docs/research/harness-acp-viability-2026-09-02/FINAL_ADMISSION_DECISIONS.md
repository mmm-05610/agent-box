# FINAL_ADMISSION_DECISIONS — 每 Harness 最终 admission decision

观察日期 2026-09-02。裁决等级定义见 [SOURCE_POLICY.md](SOURCE_POLICY.md) §7；
拓扑裁决 §8；方案比较见 [AGENT_BOX_INTEGRATION_OPTIONS.md](AGENT_BOX_INTEGRATION_OPTIONS.md)。

## 总判决（回答任务书核心问题）

> Agent-Box 是否可以保留现有 Harness planning/governance 链，同时在运行阶段优先使用 ACP，
> 把 native session driver 降为兼容兜底？

**可以保留 planning/governance 链（架构上无冲突），但"运行阶段优先 ACP"对五个必选
Harness 不成立**：只有 OpenCode/Hermes 有厂商原生 ACP（且各有 P0 缺口：question / cost）；
Codex/Claude 的 ACP 走协议组织第三方 adapter 且 fidelity P0 损失（usage/cost、structured
output、governance 收窄）；Pi 无任何 ACP 实现（厂商明拒）。协议本身缺 durable replay、
permission 超时、reconnect。**结论：否决 ACP-primary；采纳 per-Harness 固定选择
（Option D）+ vendor-native 家的第二 launch mode；native driver 必须保留。**
READY FOR HUMAN ARCHITECTURE DECISION（证据链完整，缺口均为 OPEN_QUESTIONS 显式登记）。

## 五家必选对象

### Codex — `NATIVE_PRIMARY`

- 推荐 ACP implementation（互操作时）：`@agentclientprotocol/codex-acp@1.8.0`（ACP 协议组织；
  OpenAI/JetBrains/Zed 署名；包装 `codex app-server`；deps `@openai/codex ^0.152.0`；node≥20）
- 最小启动配方：预装 pin → `codex-acp`（或 `npx -y @agentclientprotocol/codex-acp@1.8.0`）
  + `CODEX_PATH` pin 到 0.152.0 + `CODEX_HOME` 指向 guest + stdio ndjson JSON-RPC
- 缺失能力：cost（无）、fs/terminal 客户端代理（无）、`--output-schema` 等 exec 面（无）、
  沙箱收敛 5 预设、cache_write_input_tokens 丢
- native fallback 条件：**默认即 native**（app-server/exec --json 已接入、fidelity 更高）；
  ACP 仅在需要 Zed/Codeg 线程互通或官方原生 ACP（issue #30052）落地时启用
- 今天进入 Agent-Box？ACP 路径否（native 已占位）；架构位预留是
- 复杂度：ACP 接入 S~M（fidelity 补齐 L）｜ confidence HIGH（拓扑/隔离/initialize 实测）

### Claude Code — `NATIVE_PRIMARY`

- 推荐实现：`@agentclientprotocol/claude-agent-acp@0.73.0`（协议组织，Zed 起源维护；
  包装 Claude Agent SDK→内嵌 claude；node≥22）
- 最小启动配方：`npx @agentclientprotocol/claude-agent-acp@0.73.0`（可 `--cli` 透传；
  `CLAUDE_CONFIG_DIR` 指向 guest；`CLAUDE_CODE_EXECUTABLE` 可 pin 已审计 CLI）
- 缺失能力：`result` 聚合帧 9 字段全无出口（**P0**）、system/init 自描述、hook 观测帧、
  9 个隔离/预算 launch flags、terminal 能力
- native fallback 条件：**默认即 native**（stream-json 解码器已落地且不可复用于 ACP）；
  重评触发=Anthropic 原生实现（#24411）或外部互操作需求
- 今天进入？否（adapter 路线拓扑 REQUIRES_RUNTIME_CHANGE + P0 损失）
- 复杂度：L ｜ confidence HIGH（identity/officiality/launch/topology 四源交叉）

### OpenCode — `NATIVE_PRIMARY`（ACP 为最廉价的第二 launch mode）

- 推荐实现：**vendor 内建 `opencode acp`**（PR #2947 合入；官方 `@agentclientprotocol/sdk`；
  registry 条目带 sha256）
- 最小启动配方：`opencode acp --cwd <workspace>`（沙箱内；mdns 保持关；建议
  OPENCODE_SERVER_PASSWORD 或 netns；客户端须实现 request_permission + fs/write_text_file）
- 缺失能力：question/elicitation（**P0：turn 停滞风险**）、todo/plan、undo/share、
  subagent 流、config options 仅 model/effort/mode
- native fallback 条件：依赖 question/plan 交互或 P0 完整观测（usage+cost+todo）时走 native
  `run --format json`
- 今天进入？ACP 作为第二模式可以（S 级工作）；主路仍 native
- 复杂度：S ｜ confidence HIGH

### Hermes — `ACP_OPTIONAL`

- 推荐实现：**vendor 内建 `hermes acp`**（官方 in-tree acp_adapter；Py 官方 SDK pin
  `agent-client-protocol==0.9.0`；不在 Registry、4 PR open）
- 最小启动配方：`hermes acp`（stdout 必须为 pipe；`HERMES_HOME` 指 guest；
  `HERMES_ACP_SKIP_CONFIGURED_MCP=1` 可选；预置依赖防 lazy_deps 触网；`--check` 级探活
  用 initialize 握手替代）
- 缺失能力：$cost（**P0**）、clarify/question、协议级 steer、0.19.0 无 configOptions 模型通道
  （0.20+ 变更=VERSION_SENSITIVE）
- native fallback 条件：批处理/成本记账 P0 走 native `-z --usage-file`（现有 adapter 主路不变）
- 今天进入？ACP 第二模式可以（S 级）；主路 native
- 复杂度：S ｜ confidence HIGH（源码+专页+隔离握手实测三源）

### Pi — `NATIVE_PRIMARY`

- 推荐实现（若未来需要）：`pi-acp@0.0.33`（个人社区件 svkozak；spawn `pi --mode rpc`；
  34 天未发版；vendor 明拒 ACP——earendil-works/pi#175）
- 最小启动配方：预装 pi≥0.80.4 + pi-acp，`PI_ACP_PI_COMMAND` pin；**无 vendor 官方路径**
- 缺失能力：usage/cost 全丢（**P0**）、fork/compaction、fs/terminal/MCP、permission 仅扩展
- native fallback 条件：无条件——native `--mode json` 是唯一可接受路径；
  `--mode rpc`（NativeRpcDriver）是 vendor 点名的升级基底
- 今天进入？**否**（ACP_REJECTED 级别的证据画像，但按等级定义为 NATIVE_PRIMARY 更准确：
  ACP 可行性存在但全面劣于 native）
- 复杂度：M-H ｜ confidence HIGH

## 辅助对象（AUXILIARY 证据等级）

| Harness | 决策 | 一句话 |
|---|---|---|
| Gemini CLI | ACP_PRIMARY（未来 registry 对象的模板） | 厂商原生 `--acp`，覆盖最全；Agent-Box 接入即用 ACP，不建 native |
| Qwen Code | ACP_PRIMARY | 同上；auth 面窄（仅 OPENAI_API_KEY）注意 |
| Grok Build | ACP_PRIMARY | 厂商原生 `grok agent stdio`；版本信号混乱（CONTRADICTED）需 pin 实测复核 |

## 决策表汇总

| Harness | decision | 推荐实现 | pin | 拓扑 | P0 缺口 | native 保留 | 复杂度 | confidence |
|---|---|---|---|---|---|---|---|---|
| Codex | NATIVE_PRIMARY | （ACP 互操作：codex-acp） | codex-acp 1.8.0 + codex 0.152.0 | SAFE（附条件） | cost/structured-output/governance | **是** | S~M | HIGH |
| Claude Code | NATIVE_PRIMARY | （ACP 互操作：claude-agent-acp） | 0.73.0 | REQUIRES_RUNTIME_CHANGE | result 9 字段/隔离 flags | **是** | L | HIGH |
| OpenCode | NATIVE_PRIMARY | vendor `opencode acp` | 1.18.26 | SAFE | question.asked | **是** | S | HIGH |
| Hermes | ACP_OPTIONAL | vendor `hermes acp` | 0.19.0 + acp SDK 0.9.0 | SAFE | $cost | **是** | S | HIGH |
| Pi | NATIVE_PRIMARY | （仅社区 pi-acp） | pi 0.84.4 / pi-acp 0.0.33 | REQUIRES_RUNTIME_CHANGE | usage/cost/fork | **是（唯一路径）** | M-H | HIGH |
| Gemini | ACP_PRIMARY（辅助） | vendor `--acp` | 0.58.0 | SAFE | — | 否（未来对象） | S | 高 |
| Qwen | ACP_PRIMARY（辅助） | vendor `--acp` | 0.22.3 | SAFE | auth 面窄 | 否（未来对象） | S | 高 |
| Grok | ACP_PRIMARY（辅助） | vendor `agent stdio` | 1.0.5（版本存疑） | SAFE | 文档缺位 | 否（未来对象） | S | 中 |

## 今天可实施的最小范围（若采纳 Option D）

1. Registry schema 增加 `session_driver`/launch_mode 协议位（不改现有五家主路）；
2. Harnesses 插件落 `AcpSessionDriver` 接口 + 一个 vendor-native 先行试点（建议 OpenCode：
   registry sha256、单进程、initialize 本机已实测）；
3. ObservationHub（seq/ring/snapshot/事件日志）按 Codeg 语义落地——这是 ACP 与 GUI 的
   共同前置，无论 ACP 接多少家；
4. permission 策略层（超时→cancel 联动→TurnComplete；headless fail-closed）——
   协议不提供，Host 必须；
5. candidate-acp.toml → Registry 校验器 + conformance fixture。
