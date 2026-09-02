# Grok Build — ACP Facts (AUXILIARY dossier)

- 观察日期：2026-09-02
- 证据等级声明：**Evidence tier: AUXILIARY**（三家辅助 Harness 缩减版研究；深度低于五家必选对象。）
- 来源政策：`<workspace>/docs/research/harness-acp-viability-2026-09-02/SOURCE_POLICY.md`。
- 代码基线：xai-org/grok-build main @ `72a61251`（2026-09-01T22:20Z，SOURCE_REV `a549186d`，shallow clone in `<temp-home>`）。
- 上一轮基线：`<workspace>/docs/research/harness-native-knowledge-2026-09-01/harnesses/grok-build/candidate.toml`（2026-09-01，d761e8ba）。

## Identity（身份确认——任务要求先做）

任务提出"Grok Build 可能指 xAI 官方 CLI，也可能指社区 grok-cli（如 superagent-ai/grok-cli）"。本轮裁决：

| 候选 | 裁决 | 证据 |
| --- | --- | --- |
| **xAI 官方 Grok Build（grok）** | **成立，本轮对象** | 官方 repo `xai-org/grok-build`（Rust monorepo，README "Grok Build (grok)"）；官方文档 docs.x.ai/build/overview "Grok Build — a powerful and extensible coding agent"，安装 `curl -fsSL https://x.ai/cli/install.sh \| bash`；ACP Registry 条目 id=`grok-build`，"xAI's coding agent and CLI"，website https://x.ai/cli（E-1, E-2, E-5, E-12） |
| 社区 superagent-ai/grok-cli（npm `@vibe-kit/grok-cli` 0.0.34） | **另一项目，非本轮对象**；其 ACP 支持本轮未查 → UNKNOWN | npm `@vibe-kit/grok-cli` 存在 0.0.34；与 xAI 官方无关（E-11） |
| npm `@xai-official/grok` | 官方 npm wrapper 存在（"Grok CLI"，bin grok），但**版本信号矛盾**：registry manifest pin 1.0.17；本机 npm（npmmirror 镜像）latest 仅 0.1.4；上一轮 changelog 记录 0.2.97 | E-2/E-11/E-13 |

身份不确定性记录：**Grok Build = xAI 官方**（HIGH confidence，三源一致）。残余不确定性在**版本号**而非身份：1.0.17（REGISTRY_ENTRY, 2026-09-02）vs 0.2.97（上一轮 VENDOR_DOC changelog, 2026-09-01）vs 0.1.4（npm mirror latest）——本机 npm 走 npmmirror 镜像，可能滞后；**最新版本 UNKNOWN**。另：registry manifest license 字段写 "proprietary"，而 repo LICENSE 为 Apache-2.0（E-1/E-5 轻微矛盾，记录不动裁）。

六类事实分离判定：

1. ACP 官方 SDK 存在：是（Rust crate `agent-client-protocol` 与 TS SDK 均为协议方官方产物）。
2. ACP Registry manifest：**有**。id=`grok-build`，v1.0.17，args `["agent","stdio"]`，npx `@xai-official/grok@1.0.17`（E-5）。
3. 第三方 wrapper：不需要 / 未发现。
4. ACP 组织专用 adapter：无。
5. **厂商官方原生支持：是**——官方 repo 依赖协议方官方 Rust crate `agent-client-protocol 0.10.4 (features=["unstable"])`，约 14 个内部 crate 直接依赖它；官方文档明示 "through the Agent Client Protocol (ACP) in other apps"（E-3, E-4, E-12）。
6. 宿主可安装性：Registry 声明 npx 分发；未实测。

## Launch

- 官方命令：**`grok agent stdio`**。CLI 定义 `Command::Agent(Box<AgentArgs>)` + `AgentCmd::Stdio`（doc comment "Run the agent over stdio"）（xai-grok-pager/src/app/cli.rs:10,259-335, E-6）；main.rs:1504 `Some(AgentCmd::Stdio) => run_stdio_agent(...)`，`ClientMode::Stdio → Entrypoint::Embedded`（main.rs:1285,1332）（E-6）。
- 官方测试基建自己以子进程方式消费：xai-grok-test-support/src/acp_client.rs:39 `.args(["agent","stdio"])`；leader 模式 `agent --leader stdio`（E-7）。
- Registry 启动：`npx @xai-official/grok@1.0.17 agent stdio`（E-5）。
- 官方文档无独立 ACP 页：docs.x.ai/build/overview 提及 ACP 但为纯文本（无链接）；`docs.x.ai/build/acp` 404（E-12）。
- 引入版本：UNKNOWN（本轮未做历史回溯；上一轮 2026-09-01 快照已含 headless_server=ACP 记录，说明不晚于 2026-09-01）。

## ACP coverage（粗粒度；运行时未实测）

| 能力 | 状态 | 证据 |
| --- | --- | --- |
| initialize（含 authMethods 协商、model_state meta、worktree GC/settings 副作用） | SUPPORTED | acp_agent.rs:90-140（E-4） |
| authenticate（XAI_API_KEY_METHOD_ID / CACHED_TOKEN_AUTH_METHOD_ID；preferred_method 管控：ApiKey 与 Oidc 互斥时返回 auth_required 错误） | SUPPORTED | acp_agent.rs:560-600 + auth_method.rs:187-300（E-8） |
| newSession / loadSession | SUPPORTED（mvp_agent/session_setup.rs new_session_inner / load_session_inner） | acp_agent.rs:962-998（E-4） |
| prompt / cancel | SUPPORTED | acp_agent.rs:998,2166（E-4） |
| setSessionMode / setSessionModel | SUPPORTED（set_session_model 非 unstable 命名，Rust trait 原生） | acp_agent.rs:2229,2251（E-4） |
| session/update 流（AgentMessageChunk / AgentThoughtChunk / ToolCall / ToolCallUpdate / Plan / AvailableCommandsUpdate） | SUPPORTED | headless.rs:1642-1673（E-9） |
| 协议版本 | **ProtocolVersion::V1**（InitializeResponse::new(acp::ProtocolVersion::V1)） | acp_agent.rs:493（E-4） |
| 官方 Rust crate 深度集成 | agent-client-protocol 0.10.4 features=["unstable"]；依赖它的内部 crate 含 xai-grok-active-sessions、xai-grok-mcp、xai-grok-shell(-terminal)、xai-grok-workspace、xai-acp-lib 等 | Cargo.toml:113、Cargo.lock（E-3） |
| 自有 ACP 通信库 xai-acp-lib | AcpAgentChannel/AcpClientChannel、gateway、message 类型（AcpMethod/AcpRequest/AcpArgs） | crates/codegen/xai-acp-lib/src/lib.rs（E-10） |

Coverage gaps：
- promptCapabilities / fs 代理（readTextFile/writeTextFile 走 Client）在本轮静态取证中**未直接定位到声明处** → UNKNOWN（Agent trait 由 Rust crate 定义，实现方按需实现；未逐 trait 方法枚举）。
- 官方文档无 ACP 专页，客户端接入文档薄弱（E-12）。
- 版本信号矛盾（见 Identity）。

## Process topology verdict

**单进程内嵌（in-process Agent-over-stdio）**：`AgentSideConnection::new(agent, outgoing, incoming)` 位于 xai-grok-shell/src/agent/app.rs:156/441/928、server.rs:523 及 leader/in_process.rs:38（E-4）；`agent stdio` 入口在主二进制内（Entrypoint::Embedded, main.rs:1285）。无独立 adapter 进程。另有自有 `xai-acp-lib` 通信层（channel/gateway 消息原语）在进程间复用 ACP 语义——ACP 既是外部协议也是内部总线（与 qwen 类似、程度更深：连自家 streaming-json 输出都复用 acp::SessionUpdate 类型，headless.rs）。

## Admission decision

**ACP_PRIMARY**：厂商原生（协议方官方 Rust crate 深度集成）+ Registry 条目 + 官方文档背书 + 全核心方法实现。作为 AUXILIARY 对象，其价值是"Rust 系原生 ACP"样本；接入风险主要在版本/分发信号混乱（E-2/E-11）而非协议覆盖。

## Evidence tier: AUXILIARY

未实测 `grok agent stdio`（二进制未安装于本机，全局安装被政策禁止）；未枚举完整 Agent trait 实现面；版本号存疑。以上判断均为静态证据。
