# Agent Workspace / Run Composer 深入调研
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 文档导航：[总目录](../README.md)

> 研究对象：`Project + Profiles + Environment + Workflow + Permissions + Interaction Surface → Launch Run`
>
> 研究日期：2026-08-20
>
> 结论类型：候选 Core 证伪与边界研究，不是 Agent-Box 设计稿

### 研究方法与证据口径

- 以 2026-08-20 可访问的官方产品文档、协议规范和 GitHub 主仓库为主；OpenAI/Codex 能力仅采用 OpenAI 官方文档。
- 产品 README 中的能力按“项目自述”处理；除非有规范、文档和可见实现共同支持，不把 roadmap 当成已交付能力。
- “成熟”同时考虑能力完整度、协议稳定性、项目活动与实际采用；GitHub star 只作为弱信号，不作为产品价值证明。
- 对快速变化的 beta/experimental 功能明确降低置信度，例如 Claude Agent Teams、MCP Tasks、部分 ACP adapter。
- 研究优先寻找反例与 80% 替代品；结论不假设 Agent-Box 必须继续该方向。

## Executive Summary

### 最终判断

**按当前宽泛定义，不建议把 “Agent Workspace / Run Composer” 直接确立为 Agent-Box Core。推荐结论：`Modify`，不是 `Go`，也不是立即彻底 `Kill`。**

原因不是这个场景无用，而是它由多种已经成熟或正在快速成熟的模式叠加而成：

- coding harness 原生的 subagent/team/profile/session/permission；
- LangGraph、CrewAI、OpenAI Agents SDK 等框架的 agent + workflow + runtime；
- ACP、A2A、MCP、AG-UI 的会话、任务、资源与 UI 协议；
- Kubernetes/Nomad Job、Dev Container、Temporal、CI/CD 的 manifest、环境、权限与生命周期模式；
- Kandev、Codeg、Vibe Kanban、Agent Monitor 等已经出现的多 coding-agent 工作空间。

最直接的证伪证据是：

1. [Kandev](https://github.com/kdlbs/kandev) 已明确提供 agent profiles、可混合 Claude Code/Codex/OpenCode 等 harness 的多步 workflow、local/Docker/SSH/cloud runtimes、worktree、review gate、session management 和 portable YAML。候选产品描述与它高度重合。
2. [Codeg](https://github.com/xintaofei/codeg) 已将多种 agent CLI 的 session 聚合进同一 workspace，并允许主 Agent 在同一任务中委派其他类型的子 Agent。
3. Claude Code、Codex、OpenCode、Roo Code、Cline、VS Code 均已原生吸收不同程度的角色、模型、工具、权限、后台子 Agent、任务和会话能力。
4. [Oracle Open Agent Specification](https://oracle.github.io/agent-spec/development/) 已在尝试成为框架无关的 Agent/Flow 中间表示，并提供 LangGraph、AutoGen、CrewAI adapter；自行发明“通用 Agent Run YAML”并非空白创新。
5. 2026 年 4 月，Vibe Kanban 团队在已有数千日活工程师的情况下仍因未找到满意商业模式而关闭公司、转为社区维护。这说明“多 Agent 本地工作区/漂亮 launcher”可以有高使用价值，却未必有独立产品价值。[官方公告](https://www.vibekanban.com/blog/shutdown)

### 这个模式究竟是什么

最准确的技术描述不是新的 “Agent OS”，而是：

> **一个面向异构 coding harness 的 composition root / run instantiation boundary：把长期意图解析成某次运行的有效计划，并负责跨系统关联。**

它最接近以下成熟模式的组合：

- Kubernetes `PodSpec/Job` 的声明式 workload 实例化；
- Dependency Injection 的 composition root；
- Dev Container 的环境物化；
- Workflow DAG 的节点与依赖；
- IDE workspace 的项目上下文；
- control plane 对 data plane 的配置解析和状态关联。

“组合已有能力，然后实例化一次 Agent 工作”已经是常见软件模式；在 Agent 领域也已经快速常态化。新的部分不是 composition 本身，而是 **把跨 harness 的不兼容语义安全地编译、验证并关联起来**。

### Agent-Box 可能仍值得拥有的窄 Core

如果继续，Agent-Box 不应拥有通用 workflow engine、sandbox、secret manager、MCP runtime、memory、chat platform 或完整 Agent loop。应只拥有：

1. `ProfileRef + ProjectRef + EnvironmentRef + WorkflowRole + PermissionIntent` 的解析；
2. 选择 harness/backend，并进行 capability negotiation；
3. 生成可解释、不可变的 `EffectiveRunPlan`；
4. 把抽象权限意图 fail-closed 地投影到 harness/sandbox；
5. 为一次 Run 关联多个原生 harness session、worktree、artifact 与 task ID；
6. 记录“请求了什么、实际解析成什么、由谁执行”，而不复制原生 transcript；
7. 对 ACP/App Server/SDK/CLI adapter 做薄适配。

一个更诚实的 Core 名称是：

> **Multi-Harness Run Instantiation & Correlation Core**

产品层可以称 Agent Run Composer，但不能把“工作流画布 + 工作区 UI + runtime 平台”都算进 Core。

### 严格评分

| 维度 | 当前宽定义 | 窄化后的 Instantiation Core | 解释 |
|---|---|---|---|
| Engineering usefulness | High | High | 统一解析、权限投影、session 关联确实减少工程胶水 |
| Independent product value | Low | Medium（有条件） | 单纯 launcher 很弱；可重复、可审计、跨 harness 的运行控制才可能成立 |
| Resume / demo value | High | High | Plan→Execute、Claude→Codex 的演示直观且适合履历 |
| Risk of upstream absorption | High | High | harness、IDE、协议和 Kandev 类项目都在快速吸收该能力 |

### 2–3 周建议

**不实现题目中完整的可配置产品面。实现一个用来证伪商业和工程假设的窄 MVP。**

- 固定一个 `plan-execute` 状态机；
- 只支持 Claude Code Planner + Codex Executor 两个 adapter；
- Profile 是可复用引用，Run 生成不可变快照；
- local TUI 只展示 Planner；Executor headless；
- 显示 `explain/doctor`：有效 prompt、cwd、MCP、模型、权限、sandbox 和降级项；
- 记录 Run 与两个原生 session 的关联；
- 与三个基线比较：100 行左右 shell/SDK glue、Claude Code 原生 subagent、Kandev/OpenCode 原生方案。

若不能量化地降低交接摩擦、提高可恢复性，或真实用户并不持续使用两个 harness，应直接 Kill 此候选 Core。

---

## Problem Definition

### 候选命题

候选产品将六类输入组合为一次可运行工作空间：

```text
Project
  × Agent Profiles
  × Environment
  × Workflow
  × Permission Intent
  × Interaction Surface
        ↓ resolve / validate / bind
Effective Run Plan
        ↓ instantiate
Planner session + headless worker sessions + workspace + lifecycle
```

这里有两个容易混淆的问题：

1. **用户问题是否真实？** 是。跨工具配置、权限、工作目录、会话与人工交接存在摩擦。
2. **解决方案是否构成独立 Core？** 尚未被证明。真实问题可以只需要 adapter、模板或现有产品集成。

### 需要被证伪的五个假设

| 假设 | 初步结论 |
|---|---|
| 用户会高频组合多个完整 coding harness | 未证明；强用户存在，但多数用户倾向固定主 harness |
| 不同 harness 的互补性显著高于同一 harness 内不同 model/role | 未证明；OpenCode/Roo/Codex 已支持节点级模型和角色 |
| Profile 是跨 harness 的稳定身份，而非配置包 | 只有在拥有长期策略、历史与可验证投影时成立 |
| Run Composer 能显著减少脚本/框架 glue | 对 2 节点流程可能不成立；对恢复、审计、多项目复用才可能成立 |
| 上游不会迅速原生覆盖 | 明显不成立；2026 年上游吸收速度很高 |

## Concrete User Flow

候选用户流可形式化为：

1. 用户选中 Project `agent-box`；
2. 选择 workflow template `plan-execute`；
3. 将角色 `planner` 绑定 Profile `architect-claude`；
4. 将角色 `executor` 绑定 Profile `coder-codex`；
5. 选择 system/project environment resources；
6. 为每个角色声明 permission intent；
7. 选择 local TUI；
8. Core 解析引用、检查能力、生成 EffectiveRunPlan；
9. 启动 Planner 的可见 session；
10. Planner 产生结构化 task/artifact；
11. 后台启动 Executor，返回 patch、test result 和摘要；
12. Planner 向用户解释、复核或继续委派；
13. Run 可中止、恢复、重放其配置，但不假装可确定性重放模型行为。

关键不是能不能 `subprocess.Popen("codex exec ...")`，而是：

- Planner 的抽象只读权限是否真的被目标后端执行；
- Executor 得到的是哪一个 repo snapshot/worktree；
- 哪些 MCP、skills、rules 被有效注入；
- 断线后哪个 session 可恢复；
- 结果属于哪个 Run、Task 和 Profile；
- adapter 不支持某项能力时是拒绝、降级还是静默忽略。

如果产品不能解决这些语义问题，它就只是 launcher。

## Terminology

### 概念区分

| 概念 | 核心职责 | 是否应描述候选 Core |
|---|---|---|
| Agent workspace | 项目文件、环境、会话与 UI 的工作上下文 | 用户心智上接近，但过宽 |
| Agent runtime | 执行 agent loop、tool calls、state、streaming | 不准确；主要由 harness/SDK 拥有 |
| Run composer | 选择并组合引用，生成一次运行实例 | 最接近产品动作 |
| Control plane | 配置、策略、调度、观测 data plane | 若发展为远程/多租户才成立；当前称呼过重 |
| Orchestration layer | 决定节点顺序、路由、并发、重试 | 只覆盖 Workflow，不覆盖 Project/Profile 解析 |
| Workflow runtime | 持久执行 DAG/state machine | 应复用，不应自建 |
| Multi-agent runtime | 执行多个 agent object 及通信 | 候选管理的是外部 harness，不能等同 |
| Agent operating environment | 文件、工具、凭据、sandbox、进程环境 | Environment 子域，容易滑向 Agent OS |
| Developer agent platform | 构建、运行、治理、评估的全平台 | scope 远超当前候选 |
| Agent launcher | 启动命令/进程 | 若无解析、验证与关联，候选会退化为此 |
| Session manager | 创建、恢复、关闭会话 | ACP/harness 已大量覆盖，只需跨系统关联 |
| Task runtime | task 状态、队列、重试、worker | A2A/MCP Tasks/Temporal 等已有实现 |
| Agent composition layer | 组合 agent、tool、model、prompt | 框架内非常常见；跨 harness 尚碎片化 |
| Runtime instantiation core | 将意图编译成有效计划并物化 | 最精确的技术边界 |

### 回答核心问题

> “组合已有能力，然后实例化一次 Agent 工作”是否已经是业界常见模式？

**是。** 通用软件领域早已常见，Agent 领域也已出现大量实现。其创新性不能来自“组合”这一动作，只能来自具体的互操作语义、策略正确性和跨系统连续性。

## Existing Pattern Landscape

行业实现可以分为六层：

| 层 | 已有主流抽象 | 候选缺口 |
|---|---|---|
| Harness | session、subagent、tool loop、native permissions | 跨 harness 选择与语义归一 |
| Agent framework | Agent、Team、Flow、Runner、Memory | 外部完整 coding harness 不是普通 framework Agent |
| Protocol | ACP、A2A、MCP、AG-UI | 不负责组合策略与本地运行意图 |
| Workspace product | IDE、Kanban、review、worktree | Profile/permission/environment 的可移植语义不稳定 |
| Workflow/runtime | DAG、durable task、worker、retry | 不懂 coding session、repo、prompt 与 approval |
| Workload environment | Pod/Job、devcontainer、sandbox | 不懂 agent role、context handoff、native session |

因此市场空白不是一整层，而是一条较窄的接缝：

> **Framework-style composition 与完整外部 coding-harness session 之间的互操作接缝。**

这条接缝是真实的，但它更像 adapter/control integration wedge，而不是全新 runtime 类别。

## Coding Harness Native Capabilities

### Claude Code

[Claude Code subagents](https://code.claude.com/docs/en/sub-agents) 可为每个 subagent 配置独立 system prompt、tools、model、skills、MCP、permission mode 和 worktree isolation；可以前台或后台运行，后台 Agent 遇到授权请求会自动拒绝。它已可实现：

```text
Planner（只读 / plan model / 可见）
  → Executor（写权限 / coding model / 后台）
  → result 回传 Planner
```

[Agent teams](https://code.claude.com/docs/en/agent-teams) 提供 lead、完整 teammate session、共享 task list 和 mailbox；[headless mode](https://code.claude.com/docs/en/headless) 提供 `-p`、JSON/stream-json 和 schema output；[Agent SDK sessions](https://code.claude.com/docs/en/agent-sdk/sessions) 提供持久 session、resume/fork；[worktrees](https://code.claude.com/docs/en/worktrees)、hooks、project instructions 和 permission modes 补齐环境与控制。

限制同样重要：

- 团队成员仍都是 Claude harness；
- teammate 在 spawn 时的 per-agent permission 隔离仍有限；
- 某些 subagent 配置不会完整应用到 agent-team teammate；
- 跨 harness 需要把 Codex/OpenCode 包装成 MCP/tool/外部服务。

**覆盖候选场景：约 80–90%，缺口主要是跨 harness，而不是 workflow。**

### Codex

[Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) 已支持项目级自定义 agent，分别设置 instructions、model、reasoning、sandbox、MCP 和 skills；主 Agent 负责 spawn、route、wait、collect。它对 Profile/worker 的重合非常直接。

[Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode) 提供 `codex exec`、JSONL events、JSON Schema output、只读/工作区写入 sandbox 和 session resume；[App Server](https://learn.chatgpt.com/docs/app-server) 提供 thread start/resume/fork、cwd、model、approval policy、sandbox、MCP 状态和授权事件；[Codex SDK](https://learn.chatgpt.com/docs/codex-sdk) 可在程序中创建与恢复 thread。

更关键的是，[Codex MCP server](https://learn.chatgpt.com/docs/mcp-server) 官方就展示了由 OpenAI Agents SDK 的上层 Agent 调用 Codex CLI 作为实现 worker 的模式。这已经是“完整 coding harness 作为外部 backend”的官方组合方案。

[Codex permissions](https://learn.chatgpt.com/docs/permissions) 还提供命名 permission profiles；但 profile 网络域规则依赖网络代理，说明抽象权限不能仅靠翻译 CLI flag。

**覆盖候选场景：约 75–85%；跨非 Codex harness 与统一身份仍是缺口。**

### OpenCode

[OpenCode agents](https://dev.opencode.ai/docs/agents/) 分 primary agent 与 subagent，内置 Plan/Build/General/Explore/Scout；自定义 agent 可设置 prompt、provider/model、tool permissions，并用 `permission.task` 限制可调用的 subagent。Plan 可只读，Build 可写。

其优势是一个 harness 内就能使用多个 provider/model，因此“Claude 模型负责规划、OpenAI 模型负责执行”不必等于“Claude Code + Codex 两个 harness”。[OpenCode CLI](https://dev.opencode.ai/docs/cli) 同时提供 headless server、HTTP API、session 管理、`run` 与原生 ACP。

**覆盖候选场景：约 80–90%；若用户只需要模型互补，它几乎直接消解 multi-harness 需求。**

### Roo Code

[Roo custom modes](https://github.com/RooCodeInc/Roo-Code-Docs/blob/main/docs/features/custom-modes.mdx) 可定义角色、指令、模型、tool groups 和文件限制；[Boomerang Tasks](https://roocodeinc.github.io/Roo-Code/features/boomerang-tasks/) 由 Orchestrator 向隔离上下文的 mode 委派并收回结果。

这与 Planner→Executor 几乎同构，但仍在 Roo harness 内。

### Cline

[Cline CLI](https://docs.cline.bot/usage/cli-overview) 支持 TUI/headless、JSON、plan mode、模型/provider/cwd、auto-approval、独立 data directory、history 与 session；[Agent Teams](https://docs.cline.bot/cli/agent-teams) 提供持久 team state、task board、mailbox、mission log；[Connectors](https://docs.cline.bot/cli/connectors) 已将 Slack、Discord、Telegram、Google Chat、WhatsApp 解耦到 session adapter。

其 subagent 仍偏实验性，跨 harness 不是中心目标，但“Profile + team + background + interaction adapters”的产品模式已经出现。

### VS Code / JetBrains / Zed

- [VS Code custom agents](https://code.visualstudio.com/docs/agent-customization/custom-agents) 允许定义 model、tools、instructions 与可调用 agent allowlist；[subagents](https://code.visualstudio.com/docs/agents/run/subagents) 文档甚至给出 Red→Green→Refactor coordinator 示例。
- [JetBrains AI agents](https://www.jetbrains.com/help/ai-assistant/agents.html) 在一个 IDE 中集成 Junie、Claude Agent、Codex、Copilot 和任意 ACP agent，已经是成熟的 multi-harness interaction/launcher surface。
- [Zed external agents](https://zed.dev/docs/ai/external-agents) 通过 ACP 运行 Claude、Codex、OpenCode、Copilot 等外部 Agent，Zed 托管 thread/UI 并转发 MCP；但 [Zed profiles](https://zed.dev/docs/ai/agent-profiles) 只适用于其原生 agent，不自动作用于外部 agents。

它们证明：**multi-harness 的统一 UI 与 session surface 本身已不是空白。** 候选差异必须落在跨 harness workflow、权限投影和运行连续性上。

### Cursor / Windsurf / Continue / Aider

- [Cursor background agents](https://docs.cursor.com/background-agent) 提供远程异步 VM、repo/environment snapshot、branch 与 follow-up API，但不做多 harness workflow。
- Windsurf 的 rules、memories、skills、workflows 主要是单 harness 内配置和 prompt template。
- [Continue headless mode](https://docs.continue.dev/cli/headless-mode) 与 [tool permissions](https://docs.continue.dev/cli/tool-permissions) 提供配置化 headless Agent，但多 Agent 编排有限。
- [Aider](https://aider.chat/docs/faq.html) 可脚本化、支持 repo map 和 conventions，但不是 profile/workflow/runtime 产品。

## Multi-Agent Framework Comparison

### 它们已经覆盖什么

| Framework | Agent definition | Resources/tools | Workflow/team | Runtime/session | Human interaction |
|---|---|---|---|---|---|
| [LangGraph](https://docs.langchain.com/oss/python/langgraph/overview) | graph node / agent | tools/context | graph、branch、loop | durable execution、checkpoint、time travel | interrupt/HITL、Studio |
| [AutoGen](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/graph-flow.html) | agent/role/model | tools/workbench | team、GraphFlow | state/save/load | user proxy/HITL |
| [CrewAI](https://docs.crewai.com/) | role/goal/backstory | tools/knowledge/memory | crews、tasks、flows | persistence/resume | HITL/observability |
| [Semantic Kernel](https://learn.microsoft.com/en-us/semantic-kernel/frameworks/agent/agent-orchestration/) | agent | plugins/services | sequential/concurrent/handoff/group/Magentic | runtime | callbacks/HITL |
| [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/agents/) | instructions/model/tools/MCP | tools、MCP、context | handoff、manager-as-tools | sessions、RunState、durable integrations | approval/HITL |
| [Pydantic AI](https://pydantic.dev/docs/ai/guides/multi-agent-applications/) | typed agent/deps | tools/dependencies | delegation、graph、deep agents | durable integrations | approval/HITL |
| [Mastra](https://mastra.ai/ai-agent-framework) | agent/model/instructions | MCP/tools/memory/workspace | supervisor/workflows | persistence/replay/sandbox | Studio/HITL |
| [Agno AgentOS](https://docs.agno.com/agent-os/introduction) | agent/team | tools/knowledge/memory | teams/workflows | sessions/traces/API | Control Plane/Studio |

### 与 Agent-Box 的真实差异

这些框架通常拥有 agent loop：它们调模型、执行 tool call、保存框架 state。Claude Code/Codex/OpenCode 则是已经封装好的完整进程或服务，包含：

- 自己的 prompt hierarchy 与 project instructions；
- 自己的身份认证与 provider 配置；
- 自己的 tool loop、diff、shell、approval、compaction；
- 自己的 session store 与 resume 语义；
- 自己的 subagent/worktree/permission 实现。

因此“外部完整 harness”差异是真实且重要的。把它当普通 LLM node 会丢失其原生能力，甚至导致双重 agent loop。

但这个差异正在被协议和 SDK 压缩：ACP、Codex App Server/SDK、Claude Agent SDK、OpenCode server 都把完整 harness 暴露为可调用 runtime。**Agent-Box 的机会是适配和策略编译，不是重新实现框架。**

## Coding-Agent Orchestration Projects

### 高重合项目

#### Kandev：几乎完整的直接覆盖

[Kandev](https://github.com/kdlbs/kandev) 当前 README 明确包含：

- 20+ coding agents，全部通过原生 ACP 或 adapter；
- agent profiles、prompts、executor profiles、secrets；
- 多步 pipeline 在不同步骤混合不同 Agent；
- local process、Docker、SSH、cloud executor；
- worktree、多 repo、subtask、session resume；
- integrated chat/TUI passthrough/editor/terminal/review；
- workflow portable YAML。

它不是“相邻竞品”，而是候选定义的近似现成实现。Agent-Box 若走宽产品路线，首先需要回答：为何不直接贡献、fork 或集成 Kandev？

#### Codeg：workspace/session/跨类型委派

[Codeg](https://github.com/xintaofei/codeg) 聚合 14 类 Agent CLI 的 session，提供桌面、server、Docker、移动端；主 Agent 可在一个 task 中委派不同类型的 subagent，后台 task 各自使用 branch 并等待 review。它对 workflow 的声明性弱于 Kandev，但在“统一工作空间 + 跨 harness 委派”上高度重合。

#### Goose：harness 可以成为另一 harness 的 provider

[Goose](https://github.com/aaif-goose/goose) 既能作为 ACP server，也能通过 ACP 使用现有 Claude/ChatGPT/Gemini 订阅；其 provider 文档列出 Claude ACP、Codex ACP，并把 Goose extensions 作为 MCP 传给外部 Agent。它证明“上层 harness 使用完整下层 harness”已可通过 ACP 形成产品能力。

#### Vibe Kanban：产品价值的反例

[Vibe Kanban](https://github.com/BloopAI/vibe-kanban) 提供 10+ coding agents、branch/workspace、terminal、dev server、diff review、preview 与 PR。其公司关闭公告称已有数千工程师日用，但绝大多数是免费用户，未找到令人满意的商业模式。[公告](https://www.vibekanban.com/blog/shutdown)

这不是证明所有同类产品都不能商业化，但它直接反驳了“使用价值高 ⇒ 独立产品价值高”。

### 其他项目与成熟度判断

- [Agent Monitor](https://github.com/Ericonaldo/AgentMonitor)：Claude/Codex dashboard、模板、顺序/并行 pipeline、worktree、session import、Slack 等通知；已有真实实现但规模较小。
- [Agent Deck](https://github.com/rkunnamp/agent-deck)：基于 tmux 的多 CLI session manager，偏 launcher/session surface。
- [Vibe Board](https://github.com/DevMikeRoberts/vibe-board)：多 provider Kanban、worktree、review。
- [SoulACP](https://github.com/AIXP-Labs/SoulACP)：广泛 harness registry 的 Python ACP client library，适合作 adapter 基础。
- [Muster](https://github.com/lploc94/muster)：把多个 ACP adapter 归一为 prompt/resume/MCP/cancel/events。
- [codex-orchestrator](https://github.com/zm2231/codex-orchestrator)：TOML role/backend/sandbox、persistent agents、workflows、HTTP/SSE/worktree/HITL，概念高度重合但成熟度有限。
- [AgentOps](https://github.com/pomerium/agentops)：chat platform + Kubernetes agent sandbox + ACP harness templates，当前更像架构样板。

GitHub 中还有大量近零星项目使用 “agent control plane / multi-harness orchestrator / YAML manifest” 叙事。它们共同说明模式已出现，也说明生态碎片化和长期维护仍未解决。不能把“没有单一赢家”误判成“没有竞品”。

## Workspace / Team Products

用户创建 Workspace/Team，为 A/B/C Agent 指定模型、工具、角色、权限、workflow、launch 与统一 chat 的形态已经存在：

- Agno Studio/Control Plane：Agent、Team、Workflow、registry、versioning、session、trace；绑定其 runtime/支持的框架对象。
- CrewAI Enterprise/Studio 类产品：role/task/process/flow，可视化运行；绑定 CrewAI agent loop。
- Cline Agent Teams：持久 task board/mailbox/mission log；绑定 Cline。
- Claude Code Agent Teams：lead/teammate/task list/mailbox；绑定 Claude Code。
- Kandev/Codeg：真正支持外部本地 coding harness，重合最大。
- Zed/JetBrains：真正支持外部 ACP coding harness，但更偏交互与 session surface，跨 harness workflow 较弱。

结论：

> “Workspace/Team” 不是新产品形态；“不绑定自家 framework、保留本地完整 harness 原生能力”是较窄的差异，但已有 Kandev、Codeg、Zed、JetBrains、Goose 进入。

## Protocol Landscape

### ACP：client ↔ coding agent session

[ACP v1](https://agentclientprotocol.com/protocol/v1/overview) 已定义 JSON-RPC 初始化、认证、session new/load/resume/list/delete/close、prompt、streaming update、cancel、tool call、permission request、file system、terminal、plan、mode、config options 与 elicitation。[Session setup](https://agentclientprotocol.com/protocol/v1/session-setup) 还把 cwd、additional directories 和 MCP servers 纳入 session 创建/恢复。

ACP 已解决：

- 外部 client 驱动 coding agent；
- session 与 prompt turn；
- streaming/tool/plan 事件；
- permission 交互；
- 文件、terminal 和 MCP 注入；
- 部分 resume/close 生命周期。

ACP 未解决：

- 为什么这次选 Claude 而不是 Codex；
- Profile 与 Project 的长期身份；
- 多 session 属于哪个上层 Run；
- workflow 拓扑与 task ownership；
- 抽象权限 intent 如何映射到具体 agent/sandbox；
- project snapshot/worktree/merge 策略。

### A2A：remote agent ↔ remote agent task

[A2A 1.0 specification](https://a2a-protocol.org/latest/specification/) 定义 Agent Card/skills/capabilities、messages、tasks、artifacts、task states、streaming、push notification、subscription、cancel 与多轮 context。

A2A 已解决远程 Agent 的发现、调用与 task lifecycle；未解决本地进程启动、repo mount、worktree、harness 原生配置、sandbox 与 profile compilation。对于本地 Claude/Codex CLI，它通常过重；若 worker 已是远程服务则适用。

### MCP：agent ↔ tools/resources

[MCP 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/index) 的核心是 prompts、resources、tools；也新增了[实验性 Tasks](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks)，可轮询、取消和延迟取回昂贵请求。

MCP 不定义多 Agent topology、project identity、workspace materialization 或真正的执行权限边界。MCP tool 描述不是 sandbox policy；允许某个 tool 也不代表限制了 shell、文件或网络侧信道。

### AG-UI：runtime ↔ human frontend

[AG-UI](https://docs.ag-ui.com/introduction) 是 agent backend 与用户应用间的双向事件协议，覆盖 streaming、shared state、frontend/backend tool calls、interrupt、steering 与 subagent composition；其 [event model](https://docs.ag-ui.com/concepts/events) 明确区分 threadId/runId/parentRunId 和 run/step lifecycle。

它说明 interaction surface 应被抽象成 adapter。但 AG-UI 不选择 Profile、Project 或 harness，也不执行权限。

### 四个协议拼起来还剩什么

```text
AG-UI: User/UI events
   ↓
Agent-Box: resolve intent, choose backend, compile policy, correlate identities
   ↓ ACP                 ↓ A2A
local coding harness     remote agent service
   ↓
MCP tools/resources
```

剩余层确实可能薄到只是“配置 + UI”。只有当它拥有 **可验证的解析、能力协商、权限投影、不可变 run snapshot、跨 session correlation** 时，才不是胶水。

## Traditional Runtime / Workflow Analogy

### 成熟类比

| 系统 | 已有模式 | 可直接借鉴 | 不应复制 |
|---|---|---|---|
| [Kubernetes Pod/Job](https://kubernetes.io/docs/concepts/workloads/pods/) | spec→controller→ephemeral workload；container、volume、securityContext | desired/effective spec、immutable snapshot、status、owner refs | 自建 scheduler/container runtime |
| [Nomad Jobspec](https://developer.hashicorp.com/nomad/docs/job-specification) | job→group→task，driver、env、resource、volume、Vault、lifecycle | driver adapter、plan before run、task grouping | placement/reconciliation engine |
| [Dev Container](https://containers.dev/implementors/spec/) | repo 环境的 image/features/mounts/env/lifecycle commands | 环境引用与 materialization | 另造 container schema |
| [Temporal](https://docs.temporal.io/workflow-execution) | Workflow Definition→durable Execution，Run ID、event history、retry/resume | workflow/run 分离、durable wait、correlation | 自建 durable engine |
| [GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) | workflow→jobs→steps，needs、permissions、environment、secrets | node-level permission/env、reusable workflow | 用 YAML 表达一切 |
| [Airflow](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/overview.html) | DAG/task instance/executor/metadata DB/UI | definition vs instance、pluggable executor | 数据 pipeline 控制面的复杂度 |
| [Prefect](https://docs.prefect.io/v3/concepts/flows) | flow/task/deployment/work pool，动态 Python workflow | 小团队可用的 state、retry、deployment 与 infrastructure adapter | 把交互式 conversation 塞进 flow state |
| [Dagster](https://docs.dagster.io/guides/build/jobs) | asset/job/op/resource/run launcher | resource injection、typed config、run/event observability | 复制 data/asset orchestration 模型 |
| [Dagger](https://docs.dagger.io/) | programmable container graph / function | 可测试、可缓存的环境与 task function | 重造 CI engine |
| tmux | session/window/process continuity | 本地进程 attach/detach | 把 PTY 当 Agent protocol |

这些系统的定位差异也决定复用方式：

- Temporal 适合需要跨天等待、可靠重试和人类中断的长流程；固定两节点 MVP 不需要先引入它。
- Prefect 更适合以 Python 动态描述运维/数据型 flow，并通过 work pool 选择基础设施；可把 harness invocation 包成 task，但它不理解原生 Agent session。
- Dagster 强项是 asset lineage、resource injection 与可观测 run；对代码 Agent 的 conversation/worktree 不是原生抽象。
- Airflow 强于计划型 DAG、executor 和运营 UI，交互式、动态递归 Agent 工作并非其自然负载。
- Dagger/GitHub Actions 适合把测试、构建、review gate 作为确定性节点，不应负责 Planner 与用户的多轮会话。
- Kubernetes/Nomad 负责“在哪里、以什么资源和边界运行”，不负责“Agent 为何委派给谁”。

### 本质判断

“定义执行角色 + 环境 + 权限 + workflow，然后 launch”本质上就是成熟的 workload orchestration 模式。Agent 新增价值主要是：

- 非确定性、多轮、可被用户实时 steer；
- tool call 需要动态 approval；
- conversation session 与 process/workspace 生命周期不同步；
- context/artifact handoff 既有结构化数据也有自然语言；
- harness 自带嵌套 runtime，不能像普通 container command 一样完全透明；
- VCS worktree、diff、review 与 merge 是一等对象；
- 同一 permission intent 在不同 harness 中不可等价表达。

这些差异支持一个 agent-aware adapter/control layer，却不支持重新实现通用 scheduler、sandbox 或 workflow runtime。

## Run Definition / Manifest Patterns

### 已有相似 manifest

1. Kubernetes/Nomad：完整 workload、environment、identity、volume、policy 与 lifecycle manifest。
2. Dev Container：project development environment manifest。
3. GitHub Actions/Airflow/Temporal：workflow definition 与 run instance。
4. A2A Agent Card：remote agent 能力与 endpoint 描述。
5. ACP initialization/session config：coding session 的实际协议输入。
6. [Oracle Agent Spec](https://github.com/oracle/agent-spec)：框架无关的 Agent、Flow、多 Agent composition IR，可经 adapter 执行到 LangGraph/AutoGen/CrewAI。
7. [Agent Manifest v1.0](https://agent-manifest-spec.org/spec/v1.0/)：身份、authority、risk、forbidden actions、audit surface；但生态采用度尚低，且不是 coding run spec。
8. [OpenAI SandboxAgent manifest concepts](https://openai.github.io/openai-agents-js/guides/sandbox-agents/concepts/)：workspace root、files、clone、mount、env、user/group、额外路径与 snapshot；文档明确它不等于 model permissions、approval policy 或 credentials。

### 是否已有 Agent 领域标准

没有一个被广泛采用、同时覆盖 `Project + Profile + Workflow + Permission + Interaction + external coding harness` 的标准。但已有多个部分标准与竞争中的 IR。结论是：

- **可以有内部 Run Definition；**
- **不应现在宣称或设计新的通用行业标准；**
- schema 应引用现有对象，而不是复制其内部字段；
- 对外 interchange 可优先试验 Oracle Agent Spec/ACP/A2A，而非自创完整 DSL。

### 推荐的内部结构

Run Definition 应是用户意图，EffectiveRunPlan 应是解析产物：

```yaml
apiVersion: agent-box.dev/v0alpha1
kind: Run
metadata:
  name: agent-box-plan-execute
spec:
  projectRef: agent-box
  workflowRef: plan-execute
  roles:
    planner:
      profileRef: architect-claude
      permissionIntentRef: repo-read-only
    executor:
      profileRef: coder-codex
      permissionIntentRef: repo-write-test-staging
  environmentRefs:
    - shared-dev-kb
    - agent-box-project
  interactionRef: local-tui
```

不要把 resolved CLI flags、秘密值、完整 MCP command、绝对临时目录和 session transcript 写入这个用户 manifest。它们属于 EffectiveRunPlan 或外部 secret/runtime。

## Profile Analysis

### Profile 应绑定角色，而不是直接绑定 harness

`Planner = architect-claude` 比 `Planner = Claude Code` 更合理，因为 workflow 关心的是能力与行为意图，不应直接依赖执行器品牌。类似传统 workflow 的 task 绑定 worker capability，而不是硬编码机器。

但是 Profile 不能声称完全跨 harness 等价。以下内容可移植性不同：

| Profile 内容 | 可移植性 | 建议 |
|---|---|---|
| role/name/description | 高 | Core 拥有 |
| prompt/instructions | 中高 | Core 保存源；adapter 编译 |
| model capability intent | 中 | 用 capability/quality/cost intent，允许 backend-specific override |
| skills/MCP refs | 中高 | 引用外部资源；通过原生机制绑定 |
| permission intent | 中 | Core 保存意图；外部强制执行 |
| harness config | 低 | adapter-specific overlay，不放公共 Profile 核心 |
| memory | 低到中 | 只保存 store ref/namespace；不内嵌 memory runtime |
| persistent session | 低 | 属于 Run/Profile correlation，不是 Profile 本身 |
| preferred harness | 高 | 作为 preference/constraint，而非身份本体 |

### 行业已经有的同类抽象

- Claude Code/Codex/OpenCode/VS Code 的 custom agent/subagent definition；
- Kandev agent/executor profiles；
- Agent Monitor cloneable agent template；
- CrewAI role、Agno Agent、OpenAI Agents SDK Agent；
- [Anthropic Managed Agents](https://platform.claude.com/docs/en/managed-agents/agent-setup) 已把 agent 定义为可复用、版本化配置，包含 model、system、tools、MCP、skills 和 multiagent，并允许 session override；
- A2A Agent Card 描述远程 Agent capability，但不等于本地 Profile identity。

所以 Profile 不是新概念。其独立价值只可能来自：

1. 跨 harness 的稳定引用；
2. 版本、来源、兼容性与策略审计；
3. 每次 Run 的有效快照；
4. 可测量的 behavior continuity；
5. harness-specific overlay 与 fail-closed compilation。

“长期 Agent Identity”要谨慎。prompt + config 包不等于 identity；若没有稳定 memory namespace、执行历史、版本和责任边界，称 identity 是营销膨胀。MVP 应叫 Profile，不叫数字员工。

## Headless Worker Analysis

### 可实现性

Headless worker 已非常容易：

- Claude Code：`claude -p`、stream-json、session resume、后台 subagent；
- Codex：`codex exec`、JSONL、schema、resume，或 App Server/SDK/MCP server；
- OpenCode：`run`、server/API、ACP；
- Cline/Continue：headless CLI；
- ACP：统一 session/prompt/update/cancel/permission；
- Kandev/Codeg 已经运行 unattended worker。

最小实现可能只是几十到几百行 glue。真正难点不是启动，而是：

- worktree/snapshot 一致性；
- context 与 artifact 的大小、结构和 provenance；
- approval 无人可见时的处理；
- cancel/timeout 后的进程树清理；
- 原生 session 是否可恢复；
- Planner 与 Executor 的权限是否真实隔离；
- 并发写入和 merge conflict；
- 失败分类、重试与幂等性。

因此 Agent-Box 的价值不能写成“后台启动第二个 CLI”。

## Interaction Surface Analysis

### 是否属于 Core

**不属于。Interaction Surface 应是 adapter。**

证据：

- AG-UI 专门标准化 agent runtime 与 frontend 的事件；
- ACP 把 client 定义为 IDE 或其他 UI；
- Cline connectors 已把 Slack/Discord/Telegram 等接到相同 session；
- Claude Code remote control/channels、Codex Slack、Agno Control Plane 都证明 surface 可替换。

Core 只应暴露标准化事件与 command：start、prompt、approve、cancel、status、artifact、resume。local TUI、Slack、Coze、Discord、Web UI 各自处理身份、thread mapping、rate limit 与渲染。

### 短期选择

只保留 local TUI，而且不做“通用交互平台”。理由：

- 无外部 OAuth/webhook/channel state；
- 能直接显示原生 permission/streaming 差异；
- 能验证“用户只看 Planner”是否好用；
- 后续可以 AG-UI 或内部 event interface 接其他 surface。

## 80% Substitute Solution

### 最简单替代方案 A：Claude Code 原生

```text
.claude/agents/planner.md     # model + tools + permissionMode + prompt
.claude/agents/executor.md    # model + tools + permissionMode + worktree
CLAUDE.md / skills / MCP
Claude lead invokes planner → executor in background
```

优点：零跨 harness adapter、原生 session/task/mailbox/hooks。缺点：全是 Claude harness。

### 最简单替代方案 B：OpenCode 原生

```text
Plan primary agent (read-only, provider/model A)
  → task permission allows Build subagent
Build subagent (write, provider/model B)
  → child session result
OpenCode serve/ACP supplies UI
```

它保留多 provider/model，同时避免 multi-harness。若质量足够，这是最强替代品。

### 最简单替代方案 C：shell/SDK + ACP

```text
devcontainer/Docker prepares repo and tools
Claude Code headless or ACP = planner
small controller parses structured plan
Codex App Server / codex exec / ACP = executor
MCP injects shared tools/resources
SQLite stores run_id → native_session_ids
local terminal tails planner events
```

Plan→Execute 的 controller 不需要 LangGraph；一个明确的状态机即可。需要 durable retry/HITL 时再把节点封装为 Temporal/LangGraph activity。

### 最简单替代方案 D：直接采用 Kandev

配置 workflow：Claude Code plan → Codex implement → review gate，选择 local/Docker executor 和 profiles。它已经满足候选流的大部分内容，是必须纳入 build-vs-integrate 的基线。

### Agent-Box 能减少的真实复杂度

只有以下四项值得计入：

1. 不必为每个 project 重写 profile/environment/permission glue；
2. 不必人工复制 Planner 输出、session ID、worktree 与 patch；
3. 对不兼容能力可在 launch 前检测并 fail closed；
4. 一次运行可被解释、关联、恢复和审计。

它不能声称减少 model orchestration、sandbox、MCP、workflow durability 或 chat adapter 的全部复杂度，因为这些应由现有系统承担。

## Competitive Matrix

说明：`Profile` 指可复用 Agent/role definition，而不是单纯选择模型；`Multi-Harness` 指能运行不同完整 coding-agent harness，不只是多模型。符号：✅ 原生/明确支持，◐ 部分或通过 adapter，— 基本无。

| Project/Product | Main Abstraction | Multi-Harness? | Profiles? | Workflow? | Environment? | Permissions? | Headless Agents? | Human UI? | Overlap |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| [Claude Code](https://code.claude.com/docs/en/agents) | session/subagent/team | — | ✅ | ✅ | ✅ | ✅ | ✅ | TUI/remote | 同 harness 内 80–90% |
| [Codex](https://learn.chatgpt.com/docs/agent-configuration/subagents) | thread/custom agent | — | ✅ | ◐ | ✅ | ✅ | ✅ | CLI/app/IDE/Slack | 同 harness 内高重合 |
| [OpenCode](https://dev.opencode.ai/docs/agents/) | primary/subagent | — | ✅ | ✅ | ✅ | ✅ | ✅ | TUI/Web/ACP | 多模型替代跨 harness |
| [Roo Code](https://roocodeinc.github.io/Roo-Code/features/boomerang-tasks/) | modes/orchestrator | — | ✅ | ✅ | ◐ | ✅ | ◐ | VS Code | Planner→Executor 高重合 |
| [Cline](https://docs.cline.bot/cli/agent-teams) | agent team/session | — | ✅ | ✅ | ✅ | ✅ | ✅ | IDE/CLI/connectors | team + surface 高重合 |
| [VS Code Agent Mode](https://code.visualstudio.com/docs/agents/run/subagents) | custom agents/subagents | ◐ | ✅ | ✅ | ✅ | ✅ | ✅ | IDE | IDE 内 role workflow |
| [JetBrains AI](https://www.jetbrains.com/help/ai-assistant/agents.html) | ACP agent UI | ✅ | ◐ | — | ✅ | ◐ | ✅ | IDE | multi-harness surface |
| [Zed](https://zed.dev/docs/ai/external-agents) | ACP thread/client | ✅ | ◐ | — | ✅ | ◐ | ✅ | IDE | multi-harness session |
| [Cursor](https://docs.cursor.com/background-agent) | remote background agent | — | ◐ | ◐ | ✅ | ◐ | ✅ | IDE/Web | environment + async run |
| [Continue](https://docs.continue.dev/cli/headless-mode) | assistant/config | — | ✅ | ◐ | ◐ | ✅ | ✅ | IDE/TUI | profile/headless 部分重合 |
| [Goose](https://github.com/aaif-goose/goose) | agent/provider/recipe | ✅（ACP provider） | ✅ | ◐ | ✅ | ✅ | ✅ | Desktop/CLI/API | harness-as-provider |
| [Kandev](https://github.com/kdlbs/kandev) | task/workflow/workspace | ✅ | ✅ | ✅ | ✅ | ◐ | ✅ | Web/TUI passthrough | 几乎完整直接竞品 |
| [Codeg](https://github.com/xintaofei/codeg) | multi-agent workspace | ✅ | ◐ | ✅ | ✅ | ◐ | ✅ | Desktop/Web/Mobile | workspace + cross delegation |
| [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) | issue/workspace/review | ✅ | ◐ | ◐ | ✅ | ◐ | ✅ | Web | launcher/workspace；公司已关闭 |
| [Agent Monitor](https://github.com/Ericonaldo/AgentMonitor) | dashboard/pipeline | ✅（Claude/Codex） | ✅ | ✅ | ✅ | ◐ | ✅ | Web/PTY | 高重合、小规模 |
| [LangGraph](https://docs.langchain.com/oss/python/langgraph/overview) | graph/runtime | — | ✅ | ✅ | ◐ | ◐ | ✅ | Studio/API | framework 内完整 composer |
| [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/multi_agent/) | Agent/Runner/handoff | ◐（MCP/SDK） | ✅ | ✅ | ✅ | ✅ | ✅ | adapter | 可把 Codex 作为 worker |
| [CrewAI](https://docs.crewai.com/) | crew/task/flow | — | ✅ | ✅ | ◐ | ◐ | ✅ | Studio/API | framework 内 team/workflow |
| [Mastra](https://mastra.ai/ai-agent-framework) | agent/workflow/workspace | — | ✅ | ✅ | ✅ | ✅ | ✅ | Studio/API | framework 内高重合 |
| [Agno AgentOS](https://docs.agno.com/agent-os/studio/introduction) | runtime/control plane | ◐（多 framework） | ✅ | ✅ | ✅ | ✅ | ✅ | Studio/Control Plane | 平台形态高度重合 |

### 矩阵结论

- 同 harness 内的全部元素已经成熟；
- multi-harness UI/session 也已成熟；
- multi-harness workflow/workspace 已有至少 Kandev、Codeg、Agent Monitor；
- 唯一仍普遍薄弱的是 **跨 harness permission semantics、effective config explanation 和可恢复的上层 correlation**。

## Strongest Arguments Against

### 1. 上游覆盖速度比产品建设速度快

2026 年的 Claude Code/Codex/OpenCode 已经不是单 Agent CLI。它们原生有 custom agents、不同模型/工具/权限、后台执行、session resume、worktree、team/task。Anthropic 甚至已有版本化 Managed Agent resource。一个 2–3 周 MVP 发布时，核心卖点可能已成为上游 checkbox。

### 2. “跨 harness”可能是技术人员偏好，不是高频用户需求

大多数开发者会选择一个主 harness，并在其内部切模型、mode 或 subagent。跨 harness 会带来两套登录、账单、prompt 语义、session、权限、工具和故障模式。互补质量若没有稳定测量，用户不会为理论上的 best-of-breed 付出配置成本。

### 3. 模型互补不等于 harness 互补

OpenCode、Roo、Cline 等可在同一 harness 中使用不同 provider/model。若 Planner 用 Claude、Executor 用 GPT 的效果已能实现，使用 Claude Code + Codex 的必要性大幅下降。

### 4. ACP + SDK + 小状态机已经够用

两节点顺序流程没有资格要求一套 workflow platform。Claude headless/ACP + Codex App Server/exec + SQLite + devcontainer 就能实现 80%。若 Agent-Box 只是把这些写成 YAML 和表单，价值是便利性，不是 Core。

### 5. 已有直接竞品，不是空白市场

Kandev 的功能描述几乎逐条覆盖候选定义；Codeg 已跨类型委派。继续宽做意味着重造它们的 workspace、editor、review、runtime、adapter 与 workflow。

### 6. adapter maintenance 会爆炸

每个 harness 的 CLI flag、config precedence、permission、event schema、session location 和 ACP adapter 都会变。最危险的不是启动失败，而是静默语义漂移：表面显示 read-only，实际某个 shell/MCP 仍可写。

### 7. Profile 可能只是配置包

若 Profile 没有版本、memory namespace、策略、provenance、compatibility 和运行历史，它就是 prompt + config preset。把 preset 命名成 persistent identity 不会产生价值。

### 8. Environment 可能只是 context template

shared knowledge、server、docs、test command 最终可能只被翻译成 cwd、env vars、MCP config 和 instruction files。若 Agent-Box 不负责物化和验证，就只是配置聚合；若负责，又会重造 devcontainer、MCP host、secret manager 与 sandbox。

### 9. Permission 可能只是危险的配置翻译

不同 harness 的 read-only/workspace/network/approval 并不等价。抽象会制造虚假安全感。真正 enforcement 仍在 OS/container/network proxy/harness。一个漂亮的权限表单反而可能降低可信度。

### 10. Interaction UI 容易吞噬 Core

Slack、Coze、Discord、Web、TUI 各有 thread、identity、attachments、approval、rate limit 与 reconnect。把它们纳入 Core 会迅速变成 bot platform，而不是 run instantiation。

### 11. 工作流切换频率可能很低

用户常见工作并非每次精心组合 workflow/profile/environment；更可能是进入 repo 后持续使用同一个 Agent。配置 UI 的认知成本可能高于复制一段命令或保存一个脚本。

### 12. 独立产品价值已有负面市场信号

Vibe Kanban 的关闭表明：即使多 Agent workspace 有大量日用免费用户，也可能缺乏付费意愿和差异化。Agent-Box 必须验证谁为治理、审计、复用或企业策略买单，不能只验证用户觉得 demo 很酷。

## Strongest Arguments For

该方向在以下条件同时成立时有独立价值：

1. 用户真实、持续地使用至少两个 coding harness，而不是偶尔尝鲜；
2. harness 间存在可重复测量的互补性，例如规划质量、长任务实现、review 或成本；
3. 手工复制 plan/context/patch/session 每周发生多次且明显打断工作；
4. Profile 在不同 project/run 中被重复引用，并拥有版本、策略和兼容性；
5. Environment 选择独立于 harness，可映射到 devcontainer/MCP/sandbox 等后端；
6. Workflow 节点引用 Profile 后可以替换 harness，而无需改业务拓扑；
7. Run 能可靠保存/恢复，且统一关联原生 session、worktree、artifact；
8. 权限意图能够被验证和 fail closed，而不是 best-effort 翻译；
9. 团队需要知道“谁用什么配置在哪个 repo 做了什么”，现有 harness 历史无法统一回答；
10. 用户愿意把 Agent-Box 当日常入口，而不只是在演示时打开。

满足这些条件时，价值不是“启动多个 Agent”，而是：

> **一次定义、重复实例化；角色与执行器解耦；运行可解释、可替换、可恢复、可审计。**

## Ownership Analysis

标记说明：`Primary` = 权威拥有者，`Reference` = 只保存引用/关联，`Projection` = 负责投影但不强制执行，`Mirror` = 非权威缓存，`—` = 不应拥有。

| State / Decision | Harness | Workflow Engine | External Service | Agent-Box Core | Why |
|---|---|---|---|---|---|
| Profile identity | native config overlay | — | optional registry/memory | **Primary** | 跨 harness 的稳定引用与版本是少数独有状态 |
| Project identity | cwd/native instructions | — | Git host/workspace service | **Primary** | 需要稳定关联 repo、docs、environment refs；内容仍归 Git/FS |
| Run identity | native session IDs | run/workflow ID | trace store | **Primary** | 唯一负责把异构实例关联成一次用户运行 |
| Session state | **Primary** | — | session store | Reference/Mirror | transcript、compaction、resume 语义必须由 harness 权威保存 |
| Workflow definition | — | **Primary** | definition registry | Reference + snapshot | 除固定 MVP 状态机外，不应自建通用 engine |
| Task state | worker-native subtask | **Primary** | A2A/MCP Tasks/queue | correlation only | 避免双状态机；Core 只映射 task IDs |
| Environment selection | consumes binding | — | devcontainer/sandbox/MCP | **Primary intent** | Core 选择引用；物化由专业 runtime 完成 |
| Resource binding | consumes resources | — | **Primary enforcement/data** | Projection/verification | MCP、mount、server、secret 均应外包 |
| Permission intent | native policy input | node policy | sandbox/IAM/proxy | **Primary intent + compiler** | Core 拥有声明和映射；强制执行留在边界系统 |
| Harness selection | executes | may constrain worker | registry/availability | **Primary** | 这是跨 harness 产品最核心决策 |
| Interaction surface | emits native events | emits run events | AG-UI/Slack/bot adapter | — / interface only | surface 应可替换，不能污染 Core |
| Execution history | native transcript/log | event history | observability store | **cross-run ledger only** | 记录 effective plan、关联和结果摘要，不复制完整历史 |
| Agent communication state | native team/mailbox | **Primary routing** | ACP/A2A/MCP | correlation/artifact refs | 消息协议和 task state 不应重复实现 |

### 最后真正不能合理外包的部分

1. Profile、Project、Run 三类上层身份；
2. 从意图到 `EffectiveRunPlan` 的解析过程；
3. harness/backend 选择与 capability negotiation；
4. permission intent 的 adapter 编译、验证与拒绝策略；
5. Run → workflow/task → native sessions/workspaces/artifacts 的 correlation graph；
6. 解析与执行证据的不可变摘要。

其他部分原则上均可外包。

## Core Candidate Comparison

| Candidate | 用户心智 | Core entities/actions | Differentiation | 复杂度 / scope risk | 成熟竞品 | Upstream risk | 2–3 周可验证性 |
|---|---|---|---|---|---|---|---|
| A Multi-Harness Launcher | “一个地方启动所有 CLI” | harness、command、session；launch/attach | 低 | 低 / 中 | Zed、JetBrains、Agent Deck、Vibe Kanban | 极高 | 高，但验证价值有限 |
| B Agent Workspace Manager | “项目、Agent、worktree、review 都在这里” | project、workspace、task、session、diff | 中 | 高 / 极高 | Kandev、Codeg、Vibe Kanban | 高 | 低，2–3 周只能做壳 |
| C Agent Run Composer | “选择角色/环境，一键组成一次 Run” | profile refs、run definition、effective plan | 中 | 中高 / 高 | Kandev、framework Studios | 高 | 中高，可固定 workflow |
| D Multi-Harness Agent Control Plane | “统一治理全部 Agent 执行” | registry、policy、scheduler、audit、remote worker | 潜在高（企业） | 极高 / 极高 | Kandev、Agno、企业平台 | 中高 | 极低 |
| E Agent Runtime Instantiation Core | “把运行意图安全物化” | refs、resolver、capabilities、policy projection、correlation | 中高但偏底层 | 中 / 可控 | 尚无单一标准实现，但有大量组件 | 高 | **高** |

### 推荐

- 不推荐 A：很容易成为漂亮 launcher。
- 不推荐 B：直接撞 Kandev/Codeg，且 UI/review/worktree 吞噬研发。
- 不推荐 D：当前没有规模、企业需求与基础设施支撑 “control plane” 叙事。
- C 可以作为产品描述，但必须由 E 的窄技术边界实现。

**推荐：对外暂称 `Agent Run Composer`，对内 Core 明确定义为 `Run Instantiation & Correlation Core`。** 若不能保持这个边界，则当前不应定义 Core。

## Recommended Boundary

### Core owns

```text
Intent refs
  → resolve versions and precedence
  → capability negotiation
  → select harness adapter
  → compile permission/environment bindings
  → produce EffectiveRunPlan + diagnostics
  → instantiate and correlate native sessions
  → emit normalized lifecycle events
```

### Core does not own

- LLM agent loop；
- 通用 DAG/durable workflow engine；
- sandbox/container runtime；
- secret storage；
- MCP server implementation；
- long-term memory engine；
- IAM/network proxy；
- full transcript store；
- Git forge/PR system；
- Slack/Discord/Coze/Web product；
- universal agent manifest standard。

### 必须遵守的设计不变量

1. **No silent downgrade**：不支持的权限或能力必须显式拒绝或获得用户批准。
2. **Intent ≠ enforcement**：UI 必须标明谁真正执行权限。
3. **Definition ≠ effective plan ≠ run state**：三者不能混在一个 YAML/数据库对象中。
4. **Harness remains source of truth for session**：不解析私有日志充当主要 session API，除非 adapter 明确降级。
5. **External references over copied configuration**：MCP、secret、environment、workflow 都保存引用与版本。
6. **Capability matrix is executable**：不是文档表格，而是 launch 前验证逻辑。
7. **Local-first, not local-only**：MVP 本地执行，但 ID/event/adapter 不阻止远程 ACP/A2A。

## MVP Recommendation

### 2–3 周是否值得实现

**值得实现证伪型 MVP；不值得实现题目中完整产品。**

### MVP 范围

#### 必做

- 一个 Project：当前 Git repo；
- 一个固定 `plan-execute` workflow；
- Planner Profile：Claude Code；
- Executor Profile：Codex；
- 两档 permission intent：`repo_read_only`、`repo_write_and_test`；
- local TUI 只展示 Planner；
- Executor headless；
- 一个结构化 handoff artifact（plan/task JSON）；
- `agent-box run explain` 输出 EffectiveRunPlan；
- `doctor` 校验二进制、认证、ACP/SDK capability、repo、worktree 与权限映射；
- SQLite/JSONL 只保存 run ledger 和 native IDs；
- cancel、failure、resume 的最小闭环。

#### 复用

- ACP 或官方 SDK/App Server 驱动 harness；
- git worktree；
- devcontainer/Docker（若需要隔离）；
- harness 自己的 session store；
- MCP 传工具/资源；
- 现有本地 TUI 基础。

#### 不做

- 可视化 workflow builder；
- 任意 DAG、循环、并行调度；
- Slack/Coze/Discord；
- 自研 sandbox、secret、memory；
- Profile marketplace；
- remote control plane；
- 团队/RBAC/计费；
- 通用 YAML 标准化宣言。

### MVP 实验设计

对同一批真实 coding task 运行四组：

1. 手工 Claude plan → 复制给 Codex；
2. Claude Code 原生 Planner→Executor subagent；
3. OpenCode 单 harness、双 provider agent；
4. Agent-Box 双 harness MVP。

收集：

- 配置到开始工作的时间；
- 用户复制粘贴/切窗口次数；
- 完成率、测试通过率、人工修复量；
- permission mismatch/approval deadlock；
- cancel/resume 成功率；
- 用户是否第二周仍复用同一 Run Definition；
- 用户是否真的因 harness 互补选择第 4 组。

## Non-goals

- 成为新的 Agent framework；
- 统一所有 harness 的每一个配置字段；
- 保证不同 harness 的行为等价；
- 以 Profile 模拟人格或“数字员工”；
- 取代 Kubernetes、Docker、devcontainer、Temporal；
- 取代 MCP/A2A/ACP/AG-UI；
- 管理生产 IAM、密钥和网络边界；
- 复制 IDE、Kanban、diff review 和 PR 管理；
- 对用户承诺不可执行的抽象权限；
- 在需求验证前做公有 schema/标准。

## Risks

| Risk | 严重度 | 缓解 |
|---|---:|---|
| Kandev/Codeg 已直接覆盖 | High | 先集成/对比，不假设自建优越 |
| Claude/Codex/OpenCode 上游吸收 | High | Core 只保留跨 harness correlation/compilation |
| ACP adapter 能力不一致 | High | capability negotiation、conformance tests、fail closed |
| 权限抽象制造虚假安全 | Critical | 区分 intent/enforcement；用 OS/container/proxy 验证 |
| Profile 语义漂移 | High | versioned source + harness overlay + effective snapshot |
| 双状态源导致不可恢复 | High | harness/session 与 workflow/task 各有唯一权威 owner |
| 多 harness 真实需求不足 | High | 先做用户行为实验，禁止用 demo 兴奋度替代留存 |
| UI scope explosion | High | TUI 是 adapter；不做 workspace IDE |
| 商业价值弱 | High | 验证治理/团队/审计付费，不只验证免费个人用户 |
| 配置复杂度高于收益 | High | defaults-first；explainable compiled plan；衡量 setup time |

## Unknowns

1. 有多少目标用户每周同时使用至少两个 harness？
2. 他们选择不同 harness 是模型、价格、订阅，还是 harness 特性？
3. Planner→Executor 比单个强 harness 的质量增益是否稳定？
4. 用户是否愿意维护 Profile，还是只想使用 repo 内原生配置？
5. ACP v1 adapter 对权限、resume、MCP、additional roots 的一致性如何？
6. Planner 只读、Executor 可写是否可在所有目标 OS 上真正强制？
7. 用户需要恢复 conversation，还是只需恢复 task/worktree？
8. Run Definition 的复用频率是否足以超过临时命令？
9. Kandev 当前 workflow/profile 已覆盖多少 Agent-Box 特有需求？
10. 独立产品的付费主体是个人、团队负责人、安全/平台团队，还是不存在？

## Kill Metrics

MVP 后满足任一组，应 Kill 或退化为小工具/adapter library：

### 需求 Kill

- 少于 30% 目标用户在连续 4 周内每周使用两个以上 harness；
- 少于 25% 创建过 Run Definition 的用户会再次运行；
- 多数用户选择同一 harness 的 native subagents 后不再回来；
- 真实任务中跨 harness 质量/成本/速度没有可重复优势。

### 工程 Kill

- 80% 场景可由少于约 100–150 行可靠脚本/SDK glue 覆盖；
- 任一核心 permission intent 只能静默 best-effort 映射；
- resume 成功率低于 90%，且失败主要由 adapter drift 造成；
- 每个后端每月维护成本持续超过 1 个工程日；
- 两个以上后端无法稳定提供结构化事件和 session correlation。

### 产品 Kill

- 用户只把它当启动菜单，不使用 explain/resume/re-run/correlation；
- 用户不愿为治理、审计、团队复用或远程运行付费；
- Kandev 或 Codeg 能以更低迁移成本满足目标用户；
- 新增 interaction surface 的需求显著高于核心 run semantics，说明产品已偏成 bot UI。

## Final Go / Modify / Kill Recommendation

### Recommendation: MODIFY

**Kill 以下定义：**

> Agent-Box 是一个拥有 Project、Profiles、Environment、Workflow、Permissions、Interaction Surface，并负责完整 workspace/runtime/control plane 的跨 harness 平台。

它过宽、已有强重合实现、上游吸收风险高，且会把 Agent-Box拖进 workflow engine、IDE、sandbox、IAM、bot platform 和 session store 的 scope explosion。

**保留并验证以下定义：**

> Agent-Box resolves reusable Project/Profile/Environment intent into an explainable, policy-checked multi-harness run, then correlates the native sessions and artifacts without replacing their runtimes.

中文：

> **Agent-Box 将可复用的 Project、Profile、Environment 与权限意图解析为可解释、经过策略校验的跨 harness Run，并关联原生会话与产物，但不替代它们的 runtime。**

### 创新、集成，还是重复造轮子

- Workflow、session、headless、sandbox、MCP、UI adapter：**重复造轮子，必须复用。**
- 多 harness 工作空间/launcher：**已有产品，属于集成竞争，不是类别创新。**
- 通用 Agent/Flow manifest：**已有 Oracle Agent Spec 等尝试，不应急于自创标准。**
- Profile→EffectiveRunPlan 编译、capability negotiation、permission projection、cross-session correlation：**仍有可做的窄创新/工程差异。**

### 最终一句话

`Project + Profiles + Environment + Workflow + Permissions + Interaction → Launch Run` 不是一个新的基础软件原语；它是 PodSpec、DI composition root、Dev Container、workflow run 与 IDE workspace 在 coding-agent 场景中的再组合。

**它只有在“跨 harness 的语义正确性与连续性”成为核心，而不是“把几个协议和配置文件绑进 UI”时，才值得 Agent-Box 拥有。否则应直接采用 Kandev/OpenCode/Claude Code 原生能力或一段小型 ACP/SDK controller。**

---

## 主要资料索引

### Coding harness / IDE

- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)
- [Claude Code agent teams](https://code.claude.com/docs/en/agent-teams)
- [Claude Code headless mode](https://code.claude.com/docs/en/headless)
- [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)
- [Codex MCP server](https://learn.chatgpt.com/docs/mcp-server)
- [OpenCode agents](https://dev.opencode.ai/docs/agents/)
- [Cline Agent Teams](https://docs.cline.bot/cli/agent-teams)
- [Zed external agents](https://zed.dev/docs/ai/external-agents)
- [JetBrains AI agents](https://www.jetbrains.com/help/ai-assistant/agents.html)

### Framework / platform

- [LangGraph overview](https://docs.langchain.com/oss/python/langgraph/overview)
- [AutoGen GraphFlow](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/graph-flow.html)
- [CrewAI docs](https://docs.crewai.com/)
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/agents/)
- [Pydantic AI multi-agent](https://pydantic.dev/docs/ai/guides/multi-agent-applications/)
- [Mastra](https://mastra.ai/ai-agent-framework)
- [Agno AgentOS](https://docs.agno.com/agent-os/introduction)

### Protocol / spec / runtime

- [ACP v1](https://agentclientprotocol.com/protocol/v1/overview)
- [A2A 1.0](https://a2a-protocol.org/latest/specification/)
- [MCP 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/index)
- [AG-UI](https://docs.ag-ui.com/introduction)
- [Oracle Open Agent Specification](https://oracle.github.io/agent-spec/development/)
- [Kubernetes Pods](https://kubernetes.io/docs/concepts/workloads/pods/)
- [Nomad Jobspec](https://developer.hashicorp.com/nomad/docs/job-specification)
- [Temporal Workflow Execution](https://docs.temporal.io/workflow-execution)
- [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)

### Direct competitors

- [Kandev](https://github.com/kdlbs/kandev)
- [Codeg](https://github.com/xintaofei/codeg)
- [Goose](https://github.com/aaif-goose/goose)
- [Vibe Kanban](https://github.com/BloopAI/vibe-kanban)
- [Vibe Kanban shutdown announcement](https://www.vibekanban.com/blog/shutdown)
- [Agent Monitor](https://github.com/Ericonaldo/AgentMonitor)
