# Qwen Code — ACP Facts (AUXILIARY dossier)

- 观察日期：2026-09-02
- 证据等级声明：**Evidence tier: AUXILIARY**（三家辅助 Harness 缩减版研究；深度低于五家必选对象，能力条目以静态源码证据为主，未做运行时 conformance。）
- 来源政策：`<workspace>/docs/research/harness-acp-viability-2026-09-02/SOURCE_POLICY.md`。
- 代码基线：QwenLM/qwen-code main @ `7df5ac689`（2026-09-02T04:58Z，shallow clone in `<temp-home>`）+ npm `@qwen-code/qwen-code` 0.22.3。
- 上一轮基线：`<workspace>/docs/research/harness-native-knowledge-2026-09-01/harnesses/qwen-code/candidate.toml`（0.22.3，非 ACP 事实直接复用）。

## Identity

| 字段 | 值 | source |
| --- | --- | --- |
| harness | Qwen Code（QwenLM/qwen-code） | repo + npm（E-1, E-2） |
| 厂商 | Alibaba Qwen Team（QwenLM org） | repo metadata |
| 发行 | npm `@qwen-code/qwen-code`（bin `qwen`）0.22.3，node >=22 | E-2 |
| 与上游关系 | gemini-cli v0.8.2 血统，但已**深度分叉**（自研 daemon/serve/acp-bridge/channels/workspace 包体系）；非 live fork（上一轮 FACTS） | VENDOR_SOURCE |
| 许可 | Apache-2.0（Google/Qwen 双版权头） | E-1 |

六类事实分离判定：

1. ACP 官方 SDK 存在：是（与本 Harness 无关）。
2. ACP Registry manifest：**有**。registry CDN 条目 id=`qwen-code`，v0.22.3，args `["--acp","--experimental-skills"]`（E-5）。
3. 第三方 wrapper：不需要 / 未发现。
4. ACP 组织专用 adapter：无。
5. **厂商官方原生支持：是**——内建 `packages/cli/src/acp-integration/`（acpAgent.ts 约 1.4 万行）+ 自研 workspace 包 `packages/acp-bridge/`（E-3, E-6）。
6. 宿主可安装性：Registry 声明 npx 分发（E-5）；本轮未实测。

## Launch

- 官方命令：`qwen --acp`；`--experimental-acp` **保留为 deprecated alias**：config.ts:633-641 定义两 flag，运行时打印 "⚠ Warning: --experimental-acp is deprecated and will be removed in a future release. Please use --acp instead." 并把值映射到 `acp`（config.ts:935-941，E-4）。cli.ts:138-139 将 `--experimental-acp` 列入 KNOWN_FAST_PATH_FLAGS（fast-path 解析，避免 --help demotion）（E-4）。
- 任务线索"确认是否保留 --experimental-acp"：**保留（deprecated alias，行为与 gemini-cli 同款改名模式，且 qwen 仍显式打印 warning）**。
- `--worktree` 与 `--acp/--experimental-acp` 互斥，报错 "--worktree cannot be combined with --acp / --experimental-acp."（llm.tsx:786-788，E-4）。
- Registry 启动：`npx @qwen-code/qwen-code@0.22.3 --acp --experimental-skills`（E-5）——注意 registry 启动参数带 `--experimental-skills`。
- SDK：`@agentclientprotocol/sdk` **^0.14.1**（packages/cli/package.json:43），低于 gemini-cli 的 0.16.1；0.14.1 的 PROTOCOL_VERSION = 1（E-8）。

## ACP coverage（粗粒度；运行时未实测）

| 能力 | 状态 | 证据 |
| --- | --- | --- |
| initialize | SUPPORTED（protocolVersion=PROTOCOL_VERSION=1） | acpAgent.ts:4648-4694（E-3） |
| authenticate | SUPPORTED（但 ACP 通道只对外暴露一种 auth method，见下 gap） | acpAgent.ts:4805 + authMethods.ts:10-24（E-3/E-9） |
| newSession / loadSession | SUPPORTED（带 startup profiler 包裹） | acpAgent.ts:4902,5026（E-3） |
| prompt / cancel | SUPPORTED | acpAgent.ts:5980,6103（E-3） |
| setSessionMode | SUPPORTED | acpAgent.ts:5792（E-3） |
| unstable_setSessionModel | SUPPORTED | acpAgent.ts:5808（E-3） |
| 非标准扩展方法 unstable_resumeSession / unstable_listSessions | SUPPORTED（qwen 自有扩展） | acpAgent.ts:5499,5751（E-3） |
| fs 代理（readTextFile/writeTextFile 等） | SUPPORTED（AcpFileSystemService + BridgeFileSystem；daemon 场景同机 runtime 宣告 readTextFile:false 以走本地捷径） | acp-integration/service/filesystem.ts + daemon/03-acp-bridge.md（E-3/E-6） |
| 进程外 daemon 复用（qwen serve → 每 WorkspaceRuntime spawn `qwen --acp` 子进程，多路复用 N session） | SUPPORTED（上游 gemini-cli 没有的自有架构） | docs/developers/daemon/03-acp-bridge.md（E-6） |
| ACP over HTTP/WebSocket（qwen serve 的 acp-http listener） | SUPPORTED（实验 Stage 1，express + ws） | packages/cli/src/serve/acp-http/index.ts（E-7） |
| restrictive sandbox 防护 | SUPPORTED（fs 操作在 config.isRestrictiveSandbox() 时抛 RequestError(-32003,'Restrictive sandbox mode active', errorKind:'restrictive_sandbox')） | acpAgent.ts:10266-10271（E-10） |

Coverage gaps / 与上游差异：
- **ACP auth 面窄**：`buildAuthMethods()` 只返回 `USE_OPENAI`（"Use OpenAI API key"，要求 OPENAI_API_KEY 环境变量，_meta.type=terminal）；CLI 交互态的 qwen-oauth / DASHSCOPE / anthropic / gemini / vertex-ai 多 provider 不经 ACP authMethods 暴露（E-9）。ACP 客户端接入时实际上假定 OPENAI 兼容 key 或既有 settings/登录态。
- 依赖 SDK ^0.14.1（旧于 0.16.1/1.4.0），且大量依赖 unstable_ 扩展（含自有 unstable_resumeSession/unstable_listSessions）→ VERSION_SENSITIVE。
- --worktree 与 ACP 互斥（E-4）。

## Process topology verdict

**双拓扑**：
1. 直连（标准 ACP）：`qwen --acp` 在 qwen 进程内 `runAcpAgent` → `ndJsonStream(process.stdin/stdout)` 内嵌 AgentSideConnection（acpAgent.ts:2688,2770-2781）；ACP 模式下 console.log/info/debug 被重定向到 stderr 以免污染协议流（E-3）。
2. 自有 daemon（超集，上游无）：`qwen serve` daemon 对每个 WorkspaceRuntime 经 `packages/acp-bridge` spawn/attach 一个 `qwen --acp` 子进程（defaultSpawnChannelFactory），在其上多路复用 N 个 session（promptQueue 串行化、MultiClientPermissionMediator、extMethod RPC、10s kill 硬限期）（E-6）。
Agent-Box 若接 Qwen，按标准客户端只需拓扑 1；拓扑 2 说明 qwen 把 ACP 当作其内部 RPC 骨架（IDE companion / channels 共用 acp-bridge）。

## Admission decision

**ACP_PRIMARY**（厂商原生 + Registry + 官方文档 + 全核心方法 + 自有扩展），但带两条注意：ACP auth 面窄（E-9）、SDK 版本旧且 unstable 依赖多（E-8/E-3）。作为 AUXILIARY 对象，其"daemon 以 ACP 子进程为内部总线"是**唯一把 ACP 用作内部架构骨架**的案例，对 Agent-Box 双 spawn 设计有参考价值。

## Evidence tier: AUXILIARY

未做 fake Client initialize 实测；未验证 restrictive sandbox 触发条件全集；daemon acp-http 未连测。以上均为静态证据。
