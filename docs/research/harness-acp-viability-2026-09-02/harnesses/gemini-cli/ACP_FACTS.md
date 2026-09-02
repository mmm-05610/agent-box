# Gemini CLI — ACP Facts (AUXILIARY dossier)

- 观察日期：2026-09-02
- 证据等级声明：**Evidence tier: AUXILIARY**（本 dossier 属于三家辅助 Harness 缩减版研究，深度低于五家必选对象；除已验证事实外，多数能力条目仅覆盖"存在性"层面，未做运行时 conformance 验证。）
- 来源政策：见 `<workspace>/docs/research/harness-acp-viability-2026-09-02/SOURCE_POLICY.md`（六类事实分离、UNKNOWN 语义、脱敏规则全程遵守）。
- 代码基线：google-gemini/gemini-cli main @ `4963a4456`（2026-09-01，shallow clone in `<temp-home>`）+ npm `@google/gemini-cli` dist-tag latest 0.58.0。
- 上一轮基线：`<workspace>/docs/research/harness-native-knowledge-2026-09-01/harnesses/gemini-cli/candidate.toml`（同 commit 4963a4456，本 dossier 复用其非 ACP 事实，仅引用不重复取证）。

## Identity

| 字段 | 值 | source |
| --- | --- | --- |
| harness | Gemini CLI（google-gemini/gemini-cli） | repo + npm（E-1, E-2） |
| 厂商 | Google（google-gemini org） | VENDOR_SOURCE |
| 发行 | npm `@google/gemini-cli`（bin `gemini`），stable 0.58.0 | REGISTRY/NPM（E-2） |
| 许可 | Apache-2.0 | E-1 |

六类事实分离判定：

1. ACP 官方 SDK 存在：是（`@agentclientprotocol/sdk`，npm latest 1.4.0）——与 Harness 无关。
2. ACP Registry manifest：**有**。registry CDN 条目 id=`gemini`，v0.58.0，launch args `--acp`（E-5）。
3. 第三方 wrapper：不需要 / 未发现（厂商原生实现）。
4. ACP 组织专用 adapter：无（gemini-cli 不是 adapter，是原生 Agent 实现）。
5. **厂商官方原生支持：是**（packages/cli/src/acp/ 内建实现 + 官方文档页 docs/cli/acp-mode.md）（E-3, E-4）。
6. 宿主可安装性：Registry 声明 npx 分发（E-5）；本轮未在 Zed/Codeg 中实测。

## Launch

- 官方命令：`gemini --acp`（docs/cli/acp-mode.md:8-12）。
- `--experimental-acp` 仍存在，为**deprecated alias**：config.ts:367-372 description 为 "Starts the agent in ACP mode (deprecated, use --acp instead)"（E-4）。任务给出的"官方原生 --experimental-acp flag"线索已验证为**过时命名**：主 flag 于 2026-03-05 由 `--experimental-acp` 改名为 `--acp`（commit 0135b03c8a, PR #21171，首个 stable 版本 v0.33.0 2026-03-11，E-7/E-8）。
- 版本时间线：ACP 代码不晚于 2025-08-13 已存在（zed-integration 模块最早 commit `d3fda9dafb` 2025-08-13, PR #5536, E-6）；2025-12-16 切换到官方 ACP SDK（#13856, E-9）；2026-02-01 增加 session resume（#18043, E-9）；2026-03-27 官方文档页落地（#22254, E-10）。**精确引入版本 UNKNOWN**（需完整历史分页，超出缩减版范围）。
- 当前状态：代码层面已**不再标记 experimental**（flag description 无 "experimental" 字样，E-4）；但 docs/cli/cli-reference.md:59 的表格行仍写 `--experimental-acp ... ACP (Agent Code Pilot) mode. Experimental feature.`——文档滞后（还把 ACP 展开成 "Agent Code Pilot"，与 acp-mode.md 的 "Agent Client Protocol" 矛盾，E-11）。裁决：**产品化中的 experimental 遗留**，协议入口名 `--acp` 为准。
- Registry 启动：`npx @google/gemini-cli@0.58.0 --acp`（E-5）。

## ACP coverage（粗粒度；运行时未实测）

| 能力 | 状态 | 证据 |
| --- | --- | --- |
| initialize（含 clientCapabilities、authMethods 协商） | SUPPORTED | acpRpcDispatcher.ts:41-91（E-3） |
| authenticate（api-key via _meta、gateway baseUrl/headers、切换 auth 清 credential 缓存） | SUPPORTED | acpRpcDispatcher.ts:104-130, acpSessionManager.ts:27-31（E-3） |
| newSession（客户端 MCP server 注册接入） | SUPPORTED | acpSessionManager.ts:53-63 + acp-mode.md:55-71（E-3/E-4） |
| loadSession（resume） | SUPPORTED（agentCapabilities.loadSession=true） | acpRpcDispatcher.ts:92 + acpResume.test.ts（E-3） |
| prompt / cancel | SUPPORTED | acp-mode.md:83-86（E-4） |
| setSessionMode（审批级别切换） | SUPPORTED | acp-mode.md:88-91（E-4） |
| unstable_setSessionModel | SUPPORTED（unstable_ 前缀） | acp-mode.md:92 + acpRpcDispatcher.ts:84（E-4） |
| 文件系统代理（fs read/write 走 Client、workspace 边界限制） | SUPPORTED | acpFileSystemService.ts + acp-mode.md:94-99（E-3/E-4） |
| promptCapabilities: image / audio / embeddedContext | 声明 true（源码声明，未逐项实测） | acpRpcDispatcher.ts:94-98（E-3） |
| mcpCapabilities: http / sse | 声明 true | acpRpcDispatcher.ts:99-100（E-3） |
| session/update 流（AgentMessageChunk、ToolCall 等） | SUPPORTED（经 SDK 类型 + sessionUpdate 通知） | acpStdioTransport.ts + integration-tests/acp-telemetry.test.ts（E-3/E-12） |
| 官方 SDK 依赖 | `@agentclientprotocol/sdk` **pinned 0.16.1**（npm latest 已 1.4.0，落后） | packages/cli/package.json:33（E-3） |
| 协议版本 | protocolVersion: acp.PROTOCOL_VERSION = **1** | acpRpcDispatcher.ts:84 + SDK 0.16.1 dist/schema/index.js:28（E-3/E-13） |
| slash 命令经 ACP prompt 转发（/memory、/init 拦截） | SUPPORTED | acpCommandHandler.ts + acp/README.md（E-3） |

Coverage gaps / 注意点：
- unstable_ 前缀方法依赖 SDK unstable 能力，随 SDK 版本敏感。
- pinned SDK 0.16.1 落后 npm latest（1.4.0），上游协议演进需评估兼容风险（VERSION_SENSITIVE）。
- sandbox 与 ACP 的组合行为：packages/cli/src/acp/ 内**无任何 sandbox 专属代码**（grep 无命中）；sandbox 由共享 config 路径加载（config.ts:857 loadSandboxConfig），官方文档未描述 `--sandbox` + `--acp` 组合 → **UNKNOWN**（E-14, inferred）。
- cli-reference.md 文档行滞后于代码（E-11）。

## Process topology verdict

**单进程内嵌（in-process Agent-over-stdio）**：`runAcpClient` 在 gemini 进程内用 `acp.ndJsonStream(process.stdin/stdout)` 构造 `AgentSideConnection`（acpStdioTransport.ts:12-33, E-3）。无独立 adapter 子进程、无 daemon。Agent-Box 若接入，spawn 目标就是 gemini 进程本身，stdio 即协议通道；stdout 与协议帧共享（诊断走 stderr/debug logger）。

## Admission decision

**ACP_PRIMARY**（裁决口径按 SOURCE_POLICY §7）：厂商原生实现 + 官方文档页 + Registry 条目 + 核心/会话方法全覆盖 + 官方 SDK 依赖。作为 AUXILIARY 对象，其价值主要是**协议覆盖质量的参照系**（见 research-notes 的"启示"）。

## Evidence tier: AUXILIARY

本轮为缩减版研究：未做 synthetic fake Client 对 gemini --acp 的 initialize 实测、未逐项验证 promptCapabilities 声明、未测 sandbox 组合。所有上表条目基于源码/文档/Registry 三类静态证据，confidence 以 HIGH（直接源码）与 MEDIUM（文档声明）为主。
