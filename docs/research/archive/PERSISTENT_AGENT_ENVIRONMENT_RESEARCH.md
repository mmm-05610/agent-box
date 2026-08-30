# Persistent Agent Environment 研究报告
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 文档导航：[总目录](../README.md)

> 跨 Harness 的持久工作环境、共享资源与共享知识
> 研究对象：Agent-Box
> 研究日期：2026-08-20
> 结论：**Modify / Conditional Go**——否决宽泛的“Persistent Agent Environment”产品；仅建议验证一个更窄的 **Cross-Harness Environment Binding & Explain Layer（跨 Harness 环境绑定与解释层）**。

## Executive Summary

这个问题真实存在，但它并不是一个尚未被解决的“Agent 长期记忆”问题，也不是一个完整的新型开发环境问题。今天的 Claude Code、Codex、OpenCode、Hermes 已经分别具备用户级与项目级长期指令、MCP、Skills、会话恢复或记忆机制；AGENTS.md、Agent Skills 和 MCP 也正在把多个 harness 的底层接口拉向共同标准。传统的 SSH config、ssh-agent、devcontainer、direnv、mise、Nix/devenv、Docker Compose 和 secret manager 已经负责运行环境、连接方式及凭据。Basic Memory、ai-memory、ByteRover、Mem0 等又能单独解决共享知识或跨 agent 记忆。

因此，“让三个 harness 都读到同一段服务器说明”本身没有足够的独立产品价值。用户今天通过一份共享 Markdown、少量 import/symlink、Ruler 或 Rulesync、共享 MCP 配置、SSH alias 和一个 MCP 知识库，已经能得到约 80% 的效果。如果 Agent-Box 的实现只是生成 `CLAUDE.md`、`AGENTS.md` 和几份 MCP config，应当 **Kill**：现有工具已经覆盖，而且上游兼容性还在继续收敛。

剩余的真实缺口更窄：在一次启动时，从“用户长期资源”“当前项目对资源的绑定”“Profile 的选择或覆盖”“临时 session 状态”中计算出一个可解释的有效环境；只把相关内容投影给当前 harness；不修改用户的原始配置；能说明每条信息来自哪里、为何被纳入或省略、最终落到哪个原生机制；同时把资源的存在、实际访问能力、秘密和权限严格分开。

围绕 `server-a` 场景，推荐边界是：Agent-Box 可以知道当前项目把 `staging` 绑定到资源 `server-a`，并把“2C2G、禁止高内存服务、通过 SSH host alias `server-a` 使用”投影为上下文；但它不应保存私钥、不应发明 IAM，也不应承诺该规则已经被安全强制执行。真实 SSH 能力仍来自 SSH config、ssh-agent/短期证书、外部 credential broker 或受控 MCP/proxy，并由 harness 的权限与 sandbox 决定是否可调用。

三个维度的判断如下：

- **Engineering usefulness：中高。** Agent-Box 已经拥有 Profile、harness 配置隔离和启动时投影位置，这一层与现有架构天然相邻。
- **Independent product value：当前偏低。** 没有运行时只读投影、来源解释、Profile 差异和生命周期诊断，它就只是 config generator；即使具备这些，也更像 Agent-Box 的差异化能力，而不是独立平台。
- **Demo / resume value：高。** `server-a`、共享知识库、Claude Coder 与 Codex Reviewer 的演示清晰，能直接暴露“少复制文字”之外是否真有价值。

最终建议：用 2–3 周做一个 Claude Code + Codex 的验证型 MVP，但预先设置 Kill Metrics。不要把 MVP 命名或承诺成通用 Persistent Environment；把它定义为 **Environment Binding & Explain**。若真实用户不频繁切换 harness、`explain` 无人使用，或 Ruler/Rulesync + AGENTS.md + MCP 已能低成本满足需求，就停止该方向。

## Research Method and Evidence Scope

本报告优先采用截至研究日期可访问的官方文档、协议规范和真实开源实现；对产品价值的判断是基于这些机制的推论，而不是官方声明。Codex 部分只使用 OpenAI 官方文档；Claude Code、OpenCode、Hermes 和 MCP 部分使用其官方文档与官方仓库。Agent-Box 的判断同时参考了仓库内现有架构、Profile 隔离规范和已有的 Project Resource Capability Runtime 研究，避免重新提出一个已被否决的 IAM/sandbox 大模块。

这里的“支持”按三档理解：原生表达、可经适配表达、仅能把自由文本塞入 prompt。三者不能等价。例如，把私钥路径写进 `CLAUDE.md` 技术上“可表达”，但不代表它是安全、可治理或值得推荐的实现。

## Problem Definition

### 这到底是什么问题

它同时触及以下概念，但核心不是其中任意一个单项：

| Concept | 在本议题中的准确含义 | 是否为核心 |
|---|---|---|
| Persistent context | 跨 session 保留长期有效信息 | 是，但原生 memory/instruction 已大量覆盖 |
| Environment management | 组合当前启动所需的上下文、配置和运行绑定 | 是，需限定为 agent-facing view |
| Resource registry | 记录资源身份、用途和引用 | 部分；不能演化成通用 CMDB |
| Resource context | 告诉模型资源是什么、何时用、有哪些限制 | 是 |
| Workspace context | 当前 repo、目录、命令和局部文档 | 是，项目层的一部分 |
| Agent memory | 从交互中学习并长期回忆事实/偏好 | 否，应为独立系统或输入源 |
| Knowledge management | 存储、索引、检索文档与经验 | 否，应复用文件、wiki、MCP、RAG |
| Configuration management | 管理 harness 原生配置及 precedence | 是适配手段，不是产品目的 |
| Capability/tool discovery | 发现可调用工具或 MCP server | 部分，由 MCP/harness 承担 |
| Project environment | 当前项目的命令、服务、资源绑定 | 是 |
| Developer/runtime environment | 包、进程、环境变量、挂载、网络 | 否，复用 devcontainer/Nix/mise 等 |
| Context projection | 将共同语义映射到不同 harness 原生入口 | 是，但单独做会退化为模板生成器 |
| Personal developer infrastructure | 用户所有机器、账号、知识和习惯的总体 | 过宽，不应成为 Agent-Box 的领域 |

更严格的定义是：

> **在不接管秘密、权限、运行环境和知识存储的前提下，于 agent 启动时选择并组合与当前项目及 Profile 有关的长期资源引用、使用约束、知识入口和项目事实，再通过 harness 原生机制产生一个可追溯、可诊断、短生命周期的有效视图。**

这一定义把问题从“持久保存一切”改成了“绑定与投影”。持久性属于输入源；Agent-Box 的潜在核心是组合过程及其可解释性。

### “共享资源”不是一个单一对象

`server-a` 至少包含七种不同性质的数据，不能塞进一个自由结构对象后一起注入模型：

1. **Resource metadata**：身份、类型、hostname、容量提示、用途、标签、状态。
2. **Usage instruction**：用于 staging；不要部署高内存服务；推荐命令或运行手册。
3. **Credential reference**：使用 SSH host alias、某个 ssh-agent identity 或外部 secret reference。
4. **Secret**：私钥内容、token、密码。不得进入 prompt 或环境清单。
5. **Permission**：谁可以连接、允许哪些操作、是否需审批。必须由 harness、OS、远端主机或代理执行。
6. **Runtime binding**：在当前项目中，逻辑角色 `staging` 指向 `server-a`。
7. **Knowledge**：部署手册、故障记录、架构文档，应该是独立文档引用或可检索知识源。

第 2 项中的“禁止跑高内存服务”若只写进上下文，是行为提示，不是策略强制。产品界面和 `explain` 必须明确这种差异，否则会制造错误安全感。

## Concrete User Story

用户长期拥有：

- `server-a`：2 CPU / 2 GB RAM，staging，用 SSH alias `server-a`；不适合大型模型或高内存服务。
- `server-b`：2 CPU / 2 GB RAM，API Gateway 与临时服务，用 SSH alias `server-b`。
- `shared-dev-kb`：长期维护的个人开发知识库。
- 全局约定：Git commit 规范、部署习惯、常用 CLI 与排障笔记。

进入 `~/projects/agent-box` 后，项目补充：

- `staging` 绑定 `server-a`；
- 测试命令是 `pytest`；
- 项目知识入口是 `./docs`；
- 项目需要 GitHub 与 docs MCP。

理想启动不是“把全部全局事实倒进 prompt”，而是计算下面这个选择结果：

| Source layer | 选择结果 | 原因 |
|---|---|---|
| User resources | `server-a`、`shared-dev-kb`、global conventions | 项目或 Profile 实际引用 |
| User resources | `server-b` 省略或仅按需发现 | 当前项目没有绑定，避免污染上下文 |
| Project | `staging → server-a`、`pytest`、`./docs`、github/docs MCP | 当前 workspace 声明 |
| Claude Coder Profile | 部署相关说明与可写工具 | 角色需要；实际权限仍由 Claude 设置执行 |
| Codex Reviewer Profile | 资源拓扑、文档与测试命令；省略部署动作建议 | 角色只需评审；省略是上下文选择，不是安全边界 |
| Session overlay | 临时 endpoint 或一次性 note | 仅本次运行，结束即失效 |

可验证体验应包括：两个 agent 都能准确复述当前 staging、资源限制、测试命令和知识入口；更新一次 `server-a` 的容量或限制后，下次两个 harness 都得到新版本；`agent-box environment explain` 能说明每条信息的来源和目标；仓库内原有 `CLAUDE.md`/`AGENTS.md` 不被永久改写。

## Terminology and Concept Boundaries

建议采用以下边界：

- **Resource**：一个可引用的外部或本地实体，例如 server、database、service、repository、KB endpoint。只包含最小身份和非秘密元数据。
- **Binding**：把项目语义角色映射到资源，例如 `staging → server-a`。Binding 是本议题最关键、而原生 Markdown 最难结构化表达的部分。
- **Instruction**：对模型行为的自然语言约束或惯例。可进入 CLAUDE.md/AGENTS.md/skill，但不等同于 permission。
- **Knowledge**：为理解或推理提供的内容；可由文件、MCP Resource、搜索或外部 KB 承载。Agent-Box 只保存入口与选择规则。
- **Memory**：从历史交互或事件中沉淀并在未来召回的事实/偏好/经验。Memory 可以成为输入源，但不属于 Environment 的内核。
- **Runtime**：进程实际看到的文件、环境变量、socket、网络和可执行工具。由 harness 与传统开发环境负责。
- **Capability**：agent 实际能够完成的操作，取决于工具、凭据、sandbox、权限和远端控制，不由一段上下文授予。
- **Projection**：将有效环境适配成各 harness 的 instruction、MCP、skill、settings、environment 等原生入口。
- **Provenance**：每条有效信息的来源、覆盖链、选择原因、目标位置和验证状态。

“System Environment + Project Environment + Profile”方向基本成立，但还缺少两个层次和三个语义：应增加 **Session Overlay** 与 **External Source References**；必须定义 precedence、trust boundary 和 freshness。推荐的抽象顺序是：

> 外部真实来源 / 用户目录 → 项目绑定 → Profile 选择或覆盖 → Session 临时覆盖 → Effective Environment → Harness Projection

这里的 Profile 不应复制一份资源事实；它只选择或覆盖视图。项目也尽量引用 `server-a`，而不是复制它的 hostname、容量和凭据路径。

## Resource vs Knowledge vs Instruction vs Secret

### Table 2

| Information Type | Example | Environment / Memory / Secret / Permission / External | Recommended Storage |
|---|---|---|---|
| Resource identity | `server-a` 是一台 Linux server | Environment | Agent-Box 最小 registry 或外部 inventory reference |
| Resource metadata | 2 CPU / 2 GB、hostname、用途 | Environment；动态监控状态属于 External | 最小 registry；动态值引用真实监控源并带 `last_verified` |
| Project binding | `staging = server-a` | Environment | 项目级 binding，提交与否由用户决定 |
| Usage instruction | 不运行大型模型/高内存服务 | Environment / Instruction | 独立 instruction ref，投影到原生 instruction；明确“未强制” |
| Test/build fact | `pytest`、build command | Environment / Project fact | 优先复用项目任务定义；Agent-Box 保存引用或覆盖 |
| Architecture document | `./docs/architecture.md` | Knowledge | 原文件；只在环境中保存 path/URI 与加载策略 |
| Troubleshooting note | 长期排障笔记 | Knowledge / Memory | Markdown KB、Basic Memory 或其他 memory system |
| Learned preference | 用户从多次会话形成的偏好 | Memory | harness memory 或独立 memory provider，不进入资源 registry |
| SSH host alias | `ssh server-a` | Environment / External binding | `~/.ssh/config` 是真实来源；环境只引用 alias |
| Credential binding | `server-a` 由 1Password SSH agent 签名 | External / capability reference | credential broker/ssh-agent；Agent-Box 只保存 provider ref |
| Private key bytes | OpenSSH private key | Secret | ssh-agent、OS keychain、1Password/Vault；绝不进入 prompt/manifest/log |
| Key file path | `~/.ssh/server-a` | Sensitive metadata / External | 最好隐藏在 SSH config；确需时只在运行层使用，不投影给模型 |
| Access rule | Reviewer 不允许部署 | Permission（若需强制）/ Instruction（若仅提示） | harness allow/deny、OS/remote ACL/proxy；MVP 仅可标注提示态 |
| MCP server config | github/docs server endpoint | External tool configuration | harness 原生 MCP config 或共享 source；Agent-Box 只做选择与适配 |
| MCP OAuth token | Bearer/OAuth credential | Secret / External | MCP OAuth/token env/credential store，不进入 Environment |
| Runtime environment variable | `DATABASE_URL` | External runtime；值常为 Secret | direnv/mise/devcontainer/secret manager；只允许白名单引用 |
| Session endpoint | 本次临时 preview URL | Environment / State | Session overlay，自动过期，不写入长期 registry |
| Availability/health | server 当前在线、磁盘占用 | State / External | 监控或按需 probe；不作为长期静态事实 |
| Git commit convention | Conventional Commits | Instruction | 共享 AGENTS.md/CLAUDE.md 或 skill；无需资源对象 |

关键规则是：**资源记录可以引用知识、凭据和权限系统，但不能吞并它们。** 一个对象中出现 `credentialRef` 没有问题；出现 secret value 就越界。一个对象中出现 `instructionRef` 没有问题；把 instruction 当成已执行 policy 就越界。

## Claude Code Existing Mechanisms

Claude Code 已经原生支持高度完整的 user-level + project-level persistent context。

### 长期上下文与记忆

[Claude Code Memory 官方文档](https://code.claude.com/docs/en/memory)定义了多层 `CLAUDE.md`：managed、用户级 `~/.claude/CLAUDE.md`、项目根或 `.claude/CLAUDE.md`、本地 `CLAUDE.local.md`；项目路径上的文件会按层加载，子目录指令按需加载。`@path` 可以导入其他文件，外部导入首次需要批准。`.claude/rules/` 还能提供用户级、项目级和 path-scoped 规则。官方同时建议保持内容简短，因为加载内容会消耗上下文。

Auto memory 是另一套机制：Claude 会按 repository 保存 build/debug insight、偏好等经验，启动时加载受限摘要。它适合“Claude 学到的经验”，不适合充当服务器 inventory 的权威来源。Session resume 恢复的是对话及其 transcript，不等于跨项目、跨 harness 的环境描述。[Sessions 文档](https://code.claude.com/docs/en/sessions)支持命名、恢复和分支，但状态仍属于 Claude Code。

因此，两台服务器及使用规范完全可以写进用户级 `CLAUDE.md`，并自动跨项目继承；项目再声明 `staging = server-a`。这解决了“Claude 是否知道”问题，却没有解决结构化引用、按项目选择、事实新鲜度、credential 与 instruction 分离，或向 Codex/OpenCode 同步。

### Settings、MCP、Skills、Hooks、环境和权限

[Settings 官方文档](https://code.claude.com/docs/en/settings)提供 managed、user、project、local 多层配置；项目可提交 `.claude/settings.json`，本地覆盖放在 `.claude/settings.local.json`。MCP 也有 local、project、user scope，项目级通常由 `.mcp.json` 承载。[MCP 文档](https://code.claude.com/docs/en/mcp)说明 Claude Code 支持 tools、prompts、resources、OAuth、动态更新和 roots；资源可显式通过 `@server:URI` 引用。它非常适合把共享知识库或受控服务器操作接入 Claude，但“当前项目应该绑定哪台服务器”仍需由配置或说明决定。

[Skills 文档](https://code.claude.com/docs/en/skills)支持用户、项目和 plugin scope，并遵循 Agent Skills 开放规范；它适合部署/排障等可复用操作说明，而不是资源真实状态。Hooks 能在工具调用前后校验、拒绝或注入上下文，[Hooks 指南](https://code.claude.com/docs/en/hooks-guide)说明其可来自 user/project/local/plugin/skill/subagent；但 hooks 是 Claude-specific 适配，跨 harness 产品不应复制其执行语义。[Permissions 文档](https://code.claude.com/docs/en/permissions)中的 allow/ask/deny 与 sandbox 才是实际执行控制，`CLAUDE.md` 不是 enforcement。

环境变量可以由 shell、settings 或启动过程提供，但 secret 不应进入 instruction。MCP 的 OAuth 或 bearer-token environment、SSH agent、外部 secret manager 比把 token/key path 写进 `CLAUDE.md` 更合适。Subagents 可以有自己的定义和 memory，但它们继承或选择上下文的方式属于 Claude Code 内部，不是通用环境层应拥有的抽象；见 [Subagents 文档](https://code.claude.com/docs/en/sub-agents)。

### 对本场景的覆盖判断

- **已解决**：用户级 + 项目级 persistent instructions；跨 session；用户级自动跨项目；项目规则；MCP 与 skill；session resume；可表达服务器与知识入口。
- **部分解决**：共享 KB 可通过导入或 MCP 接入，但选择、检索和 token 成本由用户设计；资源发现依赖已配置 MCP 或文字说明。
- **未解决**：与其他 harness 的单一来源；结构化项目 binding；Profile-specific view；跨机制 precedence/explain；资源事实 freshness；运行时只读投影。

若用户只用 Claude Code，这一需求已被原生机制解决约 **80–90%**。剩余部分主要是更好的治理与诊断，不足以单独成立一个大产品。

## Codex Existing Mechanisms

### AGENTS.md 与配置层级

Codex 的用户/项目上下文与 Claude Code 已高度相似。[AGENTS.md 官方文档](https://learn.chatgpt.com/docs/agent-configuration/agents-md)说明：每次运行会从 `~/.codex/AGENTS.override.md` 或 `~/.codex/AGENTS.md` 建立用户级指令，再从项目根到当前目录逐层加入 `AGENTS.override.md`/`AGENTS.md`；更近目录的内容后加载。默认总量有 32 KiB 上限，可用 `project_doc_max_bytes` 调整。`CODEX_HOME` 还能选择不同配置根。

[基础配置文档](https://learn.chatgpt.com/docs/config-file/config-basic)定义了用户 `~/.codex/config.toml`、受信任项目中的 `.codex/config.toml`、profile 与 CLI override；[高级配置文档](https://learn.chatgpt.com/docs/config-file/config-advanced)进一步描述 project/user/profile precedence、hooks、sandbox writable roots、网络和 shell environment policy。Codex 可以严格控制继承哪些 shell 变量，并过滤 `KEY`、`SECRET`、`TOKEN` 等名称。这比把所有宿主环境无差别传给 agent 更适合作为 projection adapter。

### Skills、MCP、sandbox、memory 与 resume

[Codex Skills 文档](https://learn.chatgpt.com/docs/build-skills)遵循 Agent Skills 规范，支持 repo `.agents/skills`、用户 `~/.agents/skills`、管理员和系统层，并支持 symlink。共享操作说明因此已有通用承载方式。

[Codex MCP 文档](https://learn.chatgpt.com/docs/extend/mcp)说明 CLI、IDE 与 desktop 共享 MCP 配置，支持 user/project 配置、stdio environment、HTTP OAuth、bearer-token env、server instructions 与逐工具审批。它适合接入 GitHub/docs KB/运维工具，但仍不负责把项目角色 `staging` 自动绑定到某个资源。

[Sandboxing 文档](https://learn.chatgpt.com/docs/sandboxing)区分 sandbox 与 approval：前者限制命令、文件和网络，后者决定何时请求提升。它们不是 secret manager；只要 agent 能调用带有有效 ssh-agent socket 的 `ssh`，它就获得了签名能力，即使没有看到私钥内容。

Codex 当前还提供本地 memory 功能，但[官方 Memories 文档](https://learn.chatgpt.com/docs/customization/memories)把它定位为从合格会话中产生的本地摘要，并明确提供开关与删除控制；当前配置中该能力仍属于可选/实验性。它不应作为权威资源 registry，也不应保存 secret。`codex resume` 恢复本地 session，而不是跨 harness 环境；见 [CLI 文档](https://learn.chatgpt.com/docs/codex/cli)。

### 与 Claude Code 的直接比较

两者在长期上下文的结构上已经高度同构：

- Claude：用户 `~/.claude/CLAUDE.md` + 项目/目录 `CLAUDE.md` + local/rules。
- Codex：用户 `~/.codex/AGENTS.md` + 项目/目录 `AGENTS.md` + override/config。
- 两者都有用户/项目 MCP、Skills、permissions/sandbox、session resume 和某种 memory。
- 差异主要在文件名、precedence、配置格式、scope、具体权限/沙箱语义与注入方式，而不在是否拥有“持久上下文”这一基本能力。

若用户只用 Codex，服务器事实、项目绑定和知识入口同样可由 AGENTS.md + MCP + config 解决约 **75–85%**。真正缺口仍是跨 harness 单一来源、Profile-specific composition、runtime-only view 和 explain。

## OpenCode / Other Harnesses

### OpenCode

[OpenCode Rules 文档](https://opencode.ai/docs/rules/)同时支持项目 `AGENTS.md` 和全局 `~/.config/opencode/AGENTS.md`，并能回退读取项目/用户 `CLAUDE.md`。`opencode.json` 的 `instructions` 还可引用本地文件、glob 与远程 URL。它已经直接降低了跨 harness 文件名不兼容问题。

[Config 文档](https://opencode.ai/docs/config/)提供全局、项目、`.opencode` 目录、环境内容和 managed 等合并层；[MCP 文档](https://opencode.ai/docs/mcp-servers/)支持 local/remote server、OAuth、全局及 per-agent tool 开关；[Skills 文档](https://opencode.ai/docs/skills/)会查找 `.opencode/skills`、`.claude/skills` 和 `.agents/skills`；[Permissions 文档](https://opencode.ai/docs/permissions/)提供 allow/ask/deny 及 per-agent 设置。

在当前官方文档与实现清单中，没有发现与 Claude auto memory 或 Hermes MEMORY.md 等价、明确承诺的 first-party 自动长期 memory；OpenCode 有持久 session/数据库与 compaction，但不能把它推断成共享长期环境。即便如此，global/project instructions、MCP、Skills、session state 已覆盖本场景的大部分静态需求。官方实现可在 [anomalyco/opencode](https://github.com/anomalyco/opencode)核查。

### Hermes

[Hermes Context Files 文档](https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files)支持 `HERMES.md`、`AGENTS.override.md`、`AGENTS.md`、`CLAUDE.md` 与 `.cursorrules`，项目内还会沿目录层级加载；这再次说明跨格式兼容已成为 harness 自己的能力。[Hermes Memory 文档](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)提供用户级 `MEMORY.md`、`USER.md`、会话搜索和外部 memory provider，并明确建议多 agent 共享 memory 时使用外部提供者。[Hermes MCP 文档](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp)支持 tools/resources/prompts、OAuth 和从 Claude Code 导入配置；Skills 也遵循开放格式。实现见 [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)。

### Cursor、Windsurf、Cline、Continue、Goose、Aider 等

其他 coding harness 的共同趋势不是“都没有长期环境”，而是都在发明或兼容类似的规则层：

- [Windsurf Memories](https://docs.windsurf.com/windsurf/cascade/memories)把自动 memory 限定在 workspace，同时提供 global/workspace rules 与 AGENTS 支持。
- [Cline Rules](https://docs.cline.bot/features/cline-rules)支持 workspace/global rules、AGENTS.md 及 Cursor/Windsurf 兼容文件。
- [Continue Rules](https://docs.continue.dev/customize/deep-dives/rules)支持 workspace rules 和按 glob/regex/model decision 激活。
- [Goose `.goosehints` 实现文档](https://github.com/aaif-goose/goose/blob/main/documentation/docs/guides/context-engineering/using-goosehints.md)支持 global/local 持久指令，并讨论 AGENTS.md 等 context file。
- [Aider conventions](https://aider.chat/docs/usage/conventions.html)可通过 `--read` 或配置文件持续加载约定，包括 AGENTS.md。

结论是：**相似但不完全兼容的长期环境描述机制确实广泛存在，但最基础的指令与 skill 格式正在收敛。** 跨 harness 统一仍有价值，却不能把“统一文件名”当作长期护城河。

## Capability Comparison

### Table 3

| Capability | Claude Code | Codex | OpenCode | Cross-Harness Gap |
|---|---|---|---|---|
| User-level instructions | `~/.claude/CLAUDE.md`、rules | `~/.codex/AGENTS.md` | `~/.config/opencode/AGENTS.md`，可回退 Claude | 文件、precedence、加载细节不同；基本能力已齐全 |
| Project/directory instructions | CLAUDE.md、local、path-scoped rules | AGENTS/override 根到 cwd | AGENTS、instructions、项目 config | 能力相似；共同事实仍可能复制 |
| Auto/learned memory | repo-scoped auto memory | 可选/实验性 local memories | 未发现等价的已文档化 auto-memory | 语义和生命周期不兼容；不应由 Environment 统一 |
| Session resume | 原生 | 原生 | 持久 session | 不能跨 harness resume 同一对话状态 |
| Agent Skills | 用户/项目/plugin | repo/user/admin/system | 原生并兼容 Claude/Agent Skills 目录 | 已高度收敛，直接复用开放规范 |
| MCP tools | user/project/local scopes | user/project config | global/project/per-agent | config schema、scope、审批和 UX 不同 |
| MCP resources/prompts | 支持且可显式引用 | 协议支持，客户端呈现不同 | MCP server 接入 | “可协议化”不等于自动纳入上下文 |
| Environment variable policy | settings/hooks/launch env | `shell_environment_policy` | config/process env | 过滤、precedence、secret 注入语义不同 |
| Permissions/sandbox | allow/ask/deny + sandbox | approvals + sandbox | allow/ask/deny | 无可安全抽象为共同最低层的执行语义 |
| User + project inheritance | 原生 | 原生 | 原生/兼容 | 缺口较小 |
| Structured resource binding | 自由文本或自定义 MCP | 自由文本或自定义 MCP | 自由文本或自定义 MCP | 没有共同的 `staging → server-a` 绑定与 provenance |
| Profile-specific projection | subagent/settings 可局部实现 | profile/CODEX_HOME 可局部实现 | per-agent config 可局部实现 | Agent-Box Profile 跨 harness 的统一选择仍缺失 |
| Runtime-only composed view | 可通过启动/config dir 等适配 | CODEX_HOME/CLI/config 适配 | env/inline config 适配 | 无共同 launch plan 和 explain |
| Provenance/explain | 各自可检查部分来源 | 各自可检查配置层 | 合并 config 但非跨 harness | 这是最明确的剩余缺口 |

## MCP Coverage

MCP 对本问题很重要，但只覆盖其中一部分。

### MCP 原语能够表达什么

根据 [MCP Resources 规范（2025-11-25）](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)，Resource 是 application-controlled context，具有 URI、name/title、description、MIME、size 与 audience/priority/lastModified 等 annotations，并支持 list/read/templates/subscriptions。它适合表示共享 KB 文档、runbook、数据库 schema、服务目录页面，甚至可由自定义 server 暴露一份资源 registry。

[Tools 规范](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)把可执行操作暴露给模型，并要求 server 做输入验证、访问控制和速率限制，client 对敏感调用保留确认能力。SSH、部署、健康检查等若封装成受控操作，MCP tool 比直接把私钥路径告诉 agent 更合适。

[Prompts 规范](https://modelcontextprotocol.io/specification/2025-11-25/server/prompts)提供用户控制的模板；[Roots 规范](https://modelcontextprotocol.io/specification/2025-11-25/client/roots)由 client 向 server 告知文件系统根。Roots 是 workspace 边界提示，不是完整 project environment，也不决定当前项目应使用哪台服务器。[Authorization 规范](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)覆盖 HTTP transport 的 OAuth 2.1 等授权；stdio 推荐依赖环境凭据。它不是通用 IAM，也不是任意资源权限模型。

### 逐项判断

| Question | Judgment |
|---|---|
| MCP 可以表达 resource metadata 吗？ | **部分。** 通用字段足以发现文档/endpoint；CPU、RAM、用途、credential binding、生命周期需自定义 schema 或 resource content。 |
| MCP Resource 适合长期知识吗？ | **适合做访问协议。** 内容仍应由 Markdown/wiki/DB/KB 保存；是否自动加载与如何检索由 host 决定。 |
| MCP Tools 适合服务器操作吗？ | **适合，常优于裸 SSH。** Server 可缩小动作面并在服务端执行控制；但建设运维 MCP 不属于本 MVP。 |
| MCP 负责 Project scope 吗？ | **不完整。** Roots 和 project-scoped config 可提供线索；项目选择、binding 与 precedence 是 host/harness 责任。 |
| MCP 负责 user-level resource registry 吗？ | **不负责。** 可以实现一个 registry server，但协议没有规定用户资产模型、真值源或生命周期。 |
| MCP 负责 usage conventions 吗？ | **可传递，不治理。** Server instructions、prompts/resources 可承载文字；scope、冲突、激活仍由 host 处理。 |
| MCP 负责 credential location 吗？ | **不应。** OAuth、token env、stdio process environment 解决 transport credential；不应把私钥路径作为通用 resource 内容。 |
| MCP 能给三个 harness 统一体验吗？ | **协议层接近，体验层不能保证。** 三者对 resources、prompts、审批、tool search、配置 scope 和展示均不同。 |

### Persistent Environment 是否只是 MCP Gateway / Registry

不是。MCP Gateway 的中心问题是：连接哪些 server，如何发现/代理 tools、resources、prompts，怎样处理 transport credential、策略、审计或路由。Environment Binding 的中心问题是：当前 workspace 与 Profile 为什么选择 `server-a` 而不是 `server-b`，哪些事实需要预先告诉模型，哪些知识按需访问，哪些原生设置要生效，以及这些结果来自哪里。

两者的关系是：

> Environment layer 选择并绑定逻辑资源；MCP 是其中一种 projection target 或 capability carrier。

如果 Agent-Box 把自己的 registry 强制包装成 MCP server，却没有 binding、provenance、runtime view 和 lifecycle，它只是又一个 MCP catalog。反过来，若已有 MCP registry，Agent-Box 应引用并筛选它，而不是复制。

## Existing Cross-Agent / Cross-Harness Solutions

搜索结果显示，市场并非空白，而且已经存在两类会直接削弱“config generator”价值的项目。

第一类是跨 harness 规则/配置生成：

- [Ruler](https://github.com/intellectronica/ruler)以 `.ruler` 为共同来源，为 Claude Code、Codex、OpenCode、Cursor、Windsurf、Cline、Aider 等生成原生规则，并覆盖嵌套规则、MCP、skills、subagents、global config 与 dry-run。
- [Rulesync](https://github.com/dyoshikawa/rulesync)支持统一规则、MCP、commands、subagents、skills、hooks、permissions/checks 的生成、导入与导出，目标同样包括大量 coding agents。
- [PRPM](https://github.com/pr-pm/prpm)更偏规则、prompt、skill、agent 的 registry/package manager 与格式转换。

第二类是共享知识与跨 agent 记忆：

- [Basic Memory](https://github.com/basicmachines-co/basic-memory)是 local-first Markdown knowledge graph，并通过 MCP 给 Claude、Codex、Cursor、VS Code 等共享同一个 KB；它非常适合 `shared-dev-kb`。
- [ai-memory](https://github.com/akitaonrails/ai-memory)明确面向 Claude、Codex、OpenCode、Cursor、Gemini 等 coding agent 的持久项目记忆与 handoff，使用 hooks/MCP/managed workstreams，提供项目隔离与全局偏好。
- [ByteRover CLI](https://github.com/campfirein/byterover-cli)提供可移植的 coding-agent memory/context tree。
- [Mem0](https://github.com/mem0ai/mem0)提供 user/session/agent 等通用记忆 scope，但需要产品自行做 coding-workspace 集成。

这些项目已经分别覆盖了“同一内容生成多份 agent 配置”和“同一知识库给多个 agent 使用”。它们通常没有覆盖的是：非秘密开发资源的最小 inventory、项目角色到资源的 binding、Agent-Box Profile 的选择、启动时不落盘的有效视图、跨 instruction/MCP/runtime 的统一 provenance，以及资源陈旧诊断。

### Table 1

| Existing Solution | Solves | Does Not Solve | Overlap | Reuse Recommendation |
|---|---|---|---|---|
| Claude `CLAUDE.md` / rules / auto memory | 用户与项目指令、Claude 内长期经验 | 跨 harness 单一来源、结构化 binding、统一 explain | 高 | 原生 projection target；不重做 memory |
| Codex `AGENTS.md` / config / memories | 用户与项目指令、配置、Codex 内经验 | 跨 harness、binding、共同 provenance | 高 | 原生 projection target；不重做 sandbox/memory |
| OpenCode AGENTS/config | 全局与项目规则、合并 config、per-agent tool | 共同 source 生命周期与跨 harness explain | 高 | 原生 adapter；利用其 AGENTS/Claude 兼容 |
| Agent Skills | 可移植操作说明、渐进加载 | 资源实例、秘密、运行时 binding | 中 | 直接采用开放规范，不发明 skill 格式 |
| MCP | tools/resources/prompts/discovery/OAuth transport | user/project/profile composition、通用 registry、secret/IAM | 高 | 作为工具与知识载体；不建另一个 gateway |
| Ruler | 多 harness 规则、MCP、skill 等生成 | 实例资源 binding、runtime-only view、freshness | 很高 | 首先集成或比较；若 MVP 只是其子集则 Kill |
| Rulesync | 多格式双向生成/导入导出，覆盖面广 | 资源生命周期、Profile launch binding、统一 runtime explain | 很高 | 复用/借鉴 adapter，不重复做格式转换器 |
| PRPM | 规则/skill/prompt 包分发与转换 | 本机资源、project binding、credential/runtime | 中 | 若需生态分发再用；MVP 不建 registry marketplace |
| Basic Memory | 本地 Markdown KB、MCP 跨客户端共享 | server inventory、project binding、runtime | 中 | `shared-dev-kb` 首选替代；Agent-Box 只存引用 |
| ai-memory / ByteRover / Mem0 | 跨 agent 记忆、handoff、检索 | 权威资源事实、凭据与运行时 composition | 中 | Memory 独立集成，禁止并入环境核心 |
| SSH config + ssh-agent | 主机 alias、连接参数、不暴露私钥内容 | Agent 为什么/何时使用资源、项目选择 | 高 | SSH 连接真值源；只投影 alias 与用途 |
| 1Password/Vault/OS keychain | secret 存储、短期注入或签名 | 语义上下文、项目 binding | 中 | 强制外部复用；Agent-Box 只持有 reference |
| devcontainer / Docker Compose | 可复现 runtime、服务、mount、port | 模型应知道的语义、跨 harness instruction | 中 | 若项目已有则读取引用；绝不重做 runtime |
| direnv / mise | 目录级 env、工具和任务 | 资源知识、权限与跨 harness explain | 中 | 作为 runtime source；仅白名单 projection |
| Nix / devenv / Home Manager | 可复现系统/开发环境、服务、用户配置 | Agent semantic context、项目资源用途 | 低到中 | 复用现有声明，不生成替代物 |
| chezmoi / dotfiles / symlink | 跨机器同步原生配置与共享文本 | 情境化选择、Profile 差异、运行时 provenance | 中 | 是强力 80% 替代；不要重做 dotfile manager |

## Traditional Developer Environment Comparison

传统 developer environment 解决的是：**人或进程进入项目后拥有什么包、变量、文件、服务和命令。** 本议题真正新增的只可能是：**模型在本次任务中应该知道哪些资源、如何理解其用途、哪些入口按需发现，以及这些信息为什么被选择。**

[Dev Container Specification](https://containers.dev/implementors/json_reference)可声明 image/Dockerfile/Compose、workspace、mount、environment、ports、features、lifecycle commands；[Docker Compose](https://docs.docker.com/compose/)描述多服务 runtime。[direnv](https://direnv.net/)按目录加载/卸载受信任的环境变量；[mise environments](https://mise.jdx.dev/environments/)组合项目工具、任务和环境；[devenv](https://devenv.sh/)与 [Nix `mkShell`](https://nixos.org/manual/nixpkgs/stable/#sec-pkgs-mkShell)提供可复现包、服务、进程和 shell。Home Manager、asdf、Environment Modules、shell profile 分别覆盖用户环境、tool version 和模块化 shell 状态。

这些工具已经知道很多事实，例如测试命令、服务端口和需要的 CLI。Agent-Box 不应复制它们，而应优先引用或摘要。例如项目已有 mise task `test` 时，环境可投影“使用项目 task `test`”，不再维护第二个 `pytest` 真值；项目已有 devcontainer 时，Agent-Box 不应设计自己的 package/runtime schema。

dotfiles 与 [chezmoi 的 machine-specific templates](https://www.chezmoi.io/user-guide/manage-machine-to-machine-differences/)可以同步 `CLAUDE.md`、`AGENTS.md`、MCP config 和 SSH config；[chezmoi 的 password-manager integration](https://www.chezmoi.io/user-guide/password-managers/)还能避免把 secret 明文写入 dotfiles。这是“Agent-Box 只少复制文字”假设的最强替代方案之一。

仍然存在的差异有三个：

1. 传统声明通常为 shell/process 消费，不说明“server-a 为什么是这个项目的 staging”及模型应怎样解释资源。
2. 它们一般不按 Agent-Box Profile 选择不同语义视图，也不同时解释 instruction、MCP 与 runtime 的来源。
3. 它们把环境实现出来，却不控制给模型的 token 预算和信息选择。

如果用户只需要一致的 CLI、env 和容器，应该直接用传统工具，本方向没有新增价值。只有当“语义选择与跨 harness 投影”本身带来可测收益时，它才是一层新的产品能力。

## Memory / Knowledge Comparison

共享知识应该与 Persistent Environment 有关系，但不应该属于同一个存储内核。

- **Facts**：稳定且可验证的当前事实，如 `server-a` 的用途、`pytest` 是测试入口。属于 environment source，但要记录来源与验证时间。
- **Resources**：可引用实体，如 server、database、KB endpoint。属于 environment registry/reference。
- **Instructions**：行为约定，如 commit 规范、部署注意事项。属于 instruction system，可由 AGENTS.md/CLAUDE.md/skill 承载。
- **Knowledge**：架构文档、排障笔记、历史决策。属于 KB，通常按需检索而不是全量注入。
- **Memory**：从会话中学习的偏好与经验。属于 memory system，可能不准确，不能覆盖权威配置。
- **State**：在线状态、当前部署版本、临时 URL。属于 runtime/monitoring/session source，必须过期。
- **Secrets**：key/token/password。属于外部 secret manager。

Claude auto memory、Codex local memories、Hermes MEMORY.md 和第三方 memory provider 都有不同的生命周期、信任和召回策略。把它们统一进 Environment 会产生四个问题：事实与推测混淆、冲突 precedence 不清、垃圾信息无限增长、删除/隐私语义失控。

推荐关系是：Environment 只保存 `knowledgeRef` 或 `memoryProviderRef`，并声明“启动摘要”“按需搜索”“完全不加载”等策略。`shared-dev-kb` 的内容仍由 Markdown/Basic Memory/MCP 保存；环境层只决定当前项目可以看见哪个入口，并在 `explain` 中显示其来源。

服务器说明也应拆开：资源卡片保存可验证的 hostname/capacity/purpose；runbook 是 knowledge；“不要跑高内存服务”是 instruction；最近一次 OOM 及修复经验是 memory；实时内存占用是 state。这样才能避免 Environment 变成万能垃圾桶。

## Credential and Secret Analysis

### “知道资源存在”与“获得访问能力”

两种需求必须分开：

- A：agent 只需要知道 `server-a` 是 staging、有 2 GB 内存、应避免高内存服务。
- B：agent 需要真正执行 `ssh server-a`、部署或查询日志。

A 只需要非秘密 metadata、instruction 和项目 binding。B 还需要 executable/tool、network、credential capability、permission/approval 与远端访问控制。A 不应自动升级为 B。

### SSH key path 是否应告诉 Agent

推荐不直接告诉模型 `~/.ssh/server-a`。更好的外部接口是 [OpenSSH `ssh_config`](https://man.openbsd.org/ssh_config)中的 Host alias，由 SSH 自己解析 `Hostname`、`User`、`IdentityFile` 或 `IdentityAgent`。上下文只需写“通过 `ssh server-a` 访问”；私钥内容永远不出现，文件路径也不会不必要地泄露宿主目录结构。

如果可用，[1Password SSH Agent](https://www.1password.dev/ssh/agent)或系统 ssh-agent 能让 `ssh` 请求签名而不把 private key 文件暴露给 agent。短期 SSH certificate、bastion、受限远端用户、forced command 或运维 MCP/proxy 可进一步缩小能力。

但 ssh-agent socket 本身就是能力：任何能访问 socket 并运行 SSH 的进程，通常都能请求已加载身份签名。harness sandbox 只能限制进程/文件/网络，无法在已经授予有效 socket 与网络后“保护”这项能力。真正的最小权限仍需独立用户、受限 key、远端 ACL、短期证书、proxy/MCP server 或人工审批。

### 推荐边界

- Agent-Box 可保存 `credentialRef = ssh-host:server-a` 或 `provider: 1password-ssh-agent` 之类的不透明引用。
- Agent-Box 不保存、复制、渲染或记录 secret value。
- 环境 projection 默认只给 agent host alias；只有 runtime adapter 才连接 socket/环境，并接受 harness 原生 sandbox/approval。
- `explain` 只显示“credential binding present / unavailable / externally managed”，不打印路径、token 或可逆详情。
- MVP 不实现 secret manager、IAM、远端策略或 MCP proxy。

## Environment Projection Analysis

### Projection 思路是否成立

成立，但前提是 projection 是 launch-time compilation，而不是永久改写用户配置。共同语义可以统一，执行和安全语义必须保留 harness-specific。

可统一的内容：

- 最小资源身份、用途、capacity hint 与 freshness；
- 项目角色到资源的 binding；
- instruction/knowledge/tool reference；
- source scope、precedence、Profile selector、session overlay；
- inclusion policy（always / on-demand / omitted）与 provenance；
- secret redaction 与静态冲突诊断。

必须 harness-specific 的内容：

- `CLAUDE.md` 与 `AGENTS.md` 的加载顺序、size/token 限制；
- settings/config 文件、MCP schema 与 server scope；
- permission、approval、sandbox 和 environment inheritance；
- hook、subagent、skill 激活语义；
- session storage 与 resume；
- resources/prompts 在 UI 中如何被发现或加载。

### 为什么优先 ephemeral runtime view

永久生成/修改项目文件会导致 source-of-truth 冲突、git dirty、用户手工编辑被覆盖、不同 Profile 互相污染，以及生成物长期陈旧。Agent-Box 已经通过隔离的 Profile 配置和启动挂载为 harness 提供独立视图，因此更合适的做法是在每次启动生成只读、短生命周期的 launch plan 与 projection，并通过独立 config home、overlay/mount、CLI override 或 harness 支持的环境入口提供。

可利用的原生适配点包括：Claude Code 的配置目录/settings/MCP 与 instruction 层，Codex 的 `CODEX_HOME`、profile、CLI override 与 `shell_environment_policy`，OpenCode 的项目/global config 与 inline environment config。具体 adapter 不能假设共同语义完全相同。

项目原有的 CLAUDE.md/AGENTS.md 仍是输入层之一，而不是被覆盖的输出目标。运行时视图应合并或追加经过标识的 generated segment，并能在 launch 结束后丢弃。

### `environment explain` 是不是装饰功能

不是。如果没有它，central composition 很难证明优于 dotfiles/template。最小 explain 必须显示：

- 当前 user/project/profile/session sources；
- 每条 binding 或 instruction 的原始来源；
- precedence 与 override 链；
- 被省略的资源及原因，例如 `server-b: project did not bind`；
- 投影目的地，例如 Claude instruction、Codex MCP config、runtime env；
- secret redaction 与“instruction only / not enforced”标识；
- missing path、unknown SSH alias、unconfigured MCP、stale `last_verified` 等诊断；
- 常驻注入的估算字符/token 与按需入口。

这使问题从“模板生成”变成“可审计的 launch-time selection”。若 MVP 无法让 explain 帮用户发现一次真实冲突、陈旧或错误绑定，该价值仍未被验证。

### 推荐 Projection Model

| Effective element | Claude Code projection | Codex projection | OpenCode projection | Rule |
|---|---|---|---|---|
| Short resource summary | Runtime `CLAUDE.md` segment / imported view | Runtime `AGENTS.md` segment | Runtime AGENTS/instructions | 只放当前任务高概率相关信息 |
| Global conventions | 用户 instruction 或 shared file import | 用户 AGENTS/skill | global AGENTS/instructions | 优先共享原文件，不复制正文 |
| Project facts | project/runtime instruction | project/runtime AGENTS | project instruction | 项目原文件优先，binding 只补足缺口 |
| Knowledge path | file import、skill 或 MCP resource | AGENTS reference、skill 或 MCP | instructions/skill/MCP | 大内容按需加载 |
| MCP server | Claude 原生 MCP scope/config | Codex config.toml MCP | OpenCode MCP config | 只适配 schema，不重做协议 |
| Runtime variable | settings/launch env allowlist | shell environment policy/launch env | process/config env | secret 值不进入 explain/context |
| Credential | ssh-agent/MCP/OAuth external | 同左 | 同左 | 只传 capability，不传 secret |
| Permission | Claude permissions/sandbox | Codex approval/sandbox | OpenCode permission | 不抽象成虚假共同 policy；MVP 只报告 |
| Session state | 临时 context/overlay | 临时 context/override | 临时 config/context | 自动过期 |

## Substitute Solutions / 80% Solution

一个不使用 Agent-Box 新模块的现实组合如下：

1. 把共同开发约定写在一份共享 `AGENTS.md` 或 Markdown 中；Codex 直接使用，OpenCode/Hermes/Goose 等直接读取或兼容，Claude 的用户 `CLAUDE.md` 通过 import 指向它。Claude 当前还提供一次性导入其他 agent config 的能力，但不应把一次性导入误当作长期同步。
2. 项目根以 AGENTS.md 作为共同项目说明，Claude 项目文件 import 或 symlink；若目标更多，用 Ruler/Rulesync 生成各 harness 原生文件。
3. 用户级和项目级 MCP config 通过 Ruler/Rulesync/dotfiles 管理；GitHub/docs 使用现成 MCP server。
4. `shared-dev-kb` 由 Basic Memory 或普通 Markdown + filesystem/docs MCP 暴露，不复制到每个 Profile。
5. `server-a`、`server-b` 写在 SSH config，以 host alias 使用；认证来自 ssh-agent/1Password，不在 prompt 中公开 key path。
6. `pytest`、local services、env vars 由 mise/direnv/devcontainer/Compose 声明，instructions 只引用项目任务名。
7. chezmoi/Home Manager/dotfiles 同步用户级配置。

对于单用户、少量项目，这个方案可达到约 80%，一次设置成本通常低于引入新平台。其缺点是：项目对资源的选择仍散落在 Markdown；不同 Profile 需要手工条件化；生成配置与运行权限缺少统一 provenance；变更后是否被每个 harness 正确加载难以解释；临时视图和陈旧诊断较弱。

因此，Agent-Box 必须证明自己解决的是这些剩余问题，而不是重新打包前六项。

## Strongest Arguments Against

先从反方出发，宽泛方向有至少十二个致命风险：

1. **原生层已经存在。** Claude Code、Codex、OpenCode 都有 user + project instructions、MCP、skills 和配置 precedence。
2. **开放格式正在收敛。** AGENTS.md 与 [Agent Skills 规范](https://agentskills.io/specification)已跨产品采用；OpenCode/Hermes/Cline/Goose 主动兼容其他格式，Claude 也可 import。格式适配的长期价值会下降。
3. **生成器赛道已拥挤。** Ruler 与 Rulesync 覆盖的 harness 和 config 类型比一个 2–3 周实现更广。
4. **MCP 已解决工具与知识入口。** 再建 resource gateway 容易重复。
5. **传统工具已解决 runtime。** devcontainer/Nix/mise/direnv/Compose 比 Agent-Box 更适合声明包、服务和变量。
6. **Secret/SSH 已有成熟来源。** SSH config、ssh-agent、1Password/Vault 不应被复制。
7. **共享知识已有独立产品。** Basic Memory、ai-memory 等更擅长检索、生命周期和跨客户端同步。
8. **跨 harness 频率可能很低。** 用户可能固定在一个工具，偶尔切换不值得维护另一层 schema。
9. **上下文污染。** 全局服务器、CLI 和知识库若每次注入，会浪费 token、分散注意力并增加错误工具使用。
10. **资源很快陈旧。** RAM、用途、endpoint 和部署状态改变后，错误的持久上下文比没有上下文更危险。
11. **permission 语义不可安全统一。** 自然语言“Reviewer 不部署”很容易被误认为 enforcement。
12. **万能对象会失控。** Resource、memory、secret、runtime、workflow、IAM 一旦混合，会复制完整 developer platform。

此外，“用户重新描述成本越来越低”虽不是决定性反对理由，却削弱了纯文本同步价值。模型可从 repo、任务文件和 SSH config 自行发现不少事实；只有发现成本高、事实不在 repo 或错误代价高时，预先组合才值得。

## Strongest Arguments For

独立增量价值只在以下条件同时出现时成立：

1. 用户每周实际使用至少两个 coding harness，而不是仅为备用安装。
2. 存在跨项目长期资源，且同一资源被多个项目/agent 引用。
3. 每个项目只应看到资源全集的一个 subset；全量 global prompt 会污染上下文。
4. Profile 对上下文和能力视图确实不同，例如 Coder 与 Reviewer。
5. 用户不愿维护多份 CLAUDE.md/AGENTS.md/MCP config，而且现有 generator 无法表达 launch-time selection。
6. 资源、instruction、knowledge、state 有不同生命周期，需要组合但不能合并存储。
7. 用户需要知道“为什么 agent 认为 staging 是 server-a”，并能定位覆盖与陈旧来源。
8. 运行时投影不应永久写入 repo，尤其同一 repo 同时被不同 Profile 使用。
9. Agent-Box 已经处在启动路径和 Profile 配置边界上，能低成本创建隔离视图。

满足这些条件时，增量不只是少复制文字，而是：

- **Provenance**：将模型看到的事实连接回源文件、项目 binding 和 Profile override。
- **Hierarchical composition**：跨不同 native config 共同计算有效结果，而不是各自合并。
- **Profile-specific projection**：Coder/Reviewer 看到不同相关 subset；不等于安全权限。
- **Automatic project binding**：进入 repo 后自动把逻辑 `staging` 解析到正确资源。
- **Runtime-only context**：同一 repo 不产生多套 tracked 文件，也不污染用户原生配置。
- **Centralized update**：资源事实变一次，下次多个 harness 同步采用。
- **Stale-resource detection**：至少能检查引用、文件、SSH alias、MCP config 与验证时间。
- **Unified explain/debugging**：把 instruction、knowledge、MCP 与 runtime 的来源在同一启动计划中解释。

其中 strongest moat 不是 portability，而是 **Agent-Box Profile × Project Binding × Runtime Projection × Explain** 的组合。Portability 单独一项最容易被上游吞掉。

## Independent Product Value

### 用户已经维护五套东西时，Agent-Box 到底多了什么

如果用户已经有 `~/.claude/CLAUDE.md`、`~/.codex/AGENTS.md`、MCP config、SSH config 和共享 KB，逐项看增量：

| Claimed increment | Native/现有工具已有多少 | Agent-Box 只有怎样做才有新增价值 | Judgment |
|---|---|---|---|
| 少维护重复文字 | symlink、import、Ruler、Rulesync 已解决 | 不足 | 单独应 Kill |
| 层级组合 | 每个 harness 内已有 user/project hierarchy | 跨 harness 用同一 binding graph 计算结果 | 中等 |
| Profile-specific view | 各 harness 有 profile/subagent/per-agent 局部能力 | 由 Agent-Box Profile 在启动时选择相同资源的不同视图 | 强，与现有产品高度吻合 |
| Cross-harness portability | AGENTS/Skills/MCP 正在标准化 | 只适配剩余差异，并避免共同最低层丢失语义 | 中，且 upstream 风险高 |
| Automatic project binding | Markdown 可手写，但不结构化 | `staging → server-a` 单一引用、变更集中、启动自动选取 | 强，需用户验证 |
| Runtime-only context | 可手工临时文件/独立 config home | 原生利用 Agent-Box 隔离，在不改 repo 下产生每 Profile 视图 | 强 |
| Provenance / explain | harness 各自只能看部分层 | 一次解释跨 source、Profile、MCP、env 与 omission | 强，前提是用户真会诊断 |
| Resource lifecycle | SSH/config/monitoring 各管部分 | 引用有效性、`last_verified`、stale warning，不复制监控 | 中 |
| Secret safety | secret manager/ssh-agent 已解决 | 防止 secret 被投影、对 capability 与 knowledge 分层 | 必要卫生，不是独立卖点 |
| Permission | 原生 sandbox/remote ACL | 只展示实际 adapter 状态，不承诺共同 policy | 不应建设 |

所以答案是：只有后五项形成一个 launch-time system 时，Agent-Box 才提供了“少复制”之外的价值。它不是新的 knowledge base，不是新的 server manager，而是把现有真值源变成与 workspace/Profile 对应的 **有效环境视图**，并能解释这份视图。

即使如此，它更适合作为 Agent-Box 内建能力，而不是独立产品。独立出售需要稳定的跨 harness adapter、丰富 source integrations、生命周期服务和更广用户群，这会迅速扩大 scope，并与 Ruler/Rulesync、MCP gateway、dev environment 产品竞争。

## Recommended Product Boundary

### Candidate Comparison

| Candidate | User value | Overlap / upstream risk | Scope | 2–3 week validation | Fit with Agent-Box Profile |
|---|---|---|---|---|---|
| A. Shared Resource Registry | 统一看见资产 | 与 SSH config、CMDB、MCP catalog 重合；ontology 膨胀 | 大 | 只能做浅 demo | 中 |
| B. Persistent Agent Environment | 叙事完整但含义模糊 | 几乎与所有 env/memory/config 工具重合 | 极大 | 不可证伪 | 中 |
| C. Environment Projection Engine | 减少重复配置 | Ruler/Rulesync/upstream 兼容可吞掉 | 中 | 可 | 高 |
| D. Cross-Harness Context Layer | 共同指令 | AGENTS.md/Skills 正快速标准化 | 中 | 可，但差异弱 | 高 |
| E. Project Workspace Environment | 项目即开即用 | devcontainer/Nix/mise/IDE workspace 已成熟 | 大 | 易重复造轮子 | 中 |
| **推荐：Environment Binding & Explain** | 项目自动选择资源、Profile 视图、可追溯 launch | 现有工具只部分覆盖；仍有 upstream 风险 | **窄** | **可用单场景证伪** | **很高** |

推荐的产品边界：

> Agent-Box 拥有“从外部与原生来源解析引用、按项目和 Profile 绑定、编译出一次启动的有效视图并解释其来源”的能力；不拥有资源本体、知识内容、secret、permission、runtime platform 或 memory engine。

名称建议避免 “Persistent Agent Environment”，因为它暗示一个长期保存所有状态的平台。更准确的内部名称是 `Environment Binding & Projection`，用户功能名可突出 `Environment View` 和 `Explain`。

## Recommended Core Data Model

不要设计通用 Resource Ontology。MVP 只需要一组可扩展但极小的引用模型：

| Entity | Minimal responsibility | Explicit exclusion |
|---|---|---|
| ResourceRef | stable id、type hint、display name、purpose、non-secret endpoint/alias、tags、source、last_verified | secret、完整运维状态、任意云资源 schema |
| InstructionRef | content/path、scope、activation、priority、“提示/可执行策略”标识 | 自称 permission enforcement |
| KnowledgeRef | path/URI/MCP resource、加载策略、scope | 文档内容、embedding/vector store |
| ToolRef | MCP server/tool group 或 native CLI reference | MCP gateway 实现、tool protocol |
| CredentialBindingRef | provider + opaque ref + availability hint | secret value、私钥复制、通用 IAM |
| ProjectBinding | logical role → ResourceRef、project-specific usage、required knowledge/tools | 复制资源 metadata |
| ProfileSelection | include/exclude、display mode、harness-specific override | Profile 自己的资源副本 |
| SessionOverlay | 临时 binding/fact、expiry | 长期 truth |
| EffectiveEnvironment | resolved immutable launch plan、provenance、diagnostics、redactions | 新的持久真值源 |

### Precedence 与冲突

推荐原则不是简单的“后者覆盖前者”，而是按字段类型处理：

- Identity/reference：同一 id 必须唯一，冲突报错，不静默覆盖。
- Project binding：项目可选择用户资源；Profile 可选择/省略或改变展示，但不应偷偷改变资源身份。
- Instructions：按 native precedence 组合；相互矛盾时给诊断。
- Session state：可临时覆盖 endpoint/status，但必须有 expiry，并在 explain 中标识。
- Secrets：不存在于 graph 中，因此没有 merge。
- Harness-specific config：在共同模型外保存 adapter extension；禁止为了统一而丢失原生能力。

### Freshness

MVP 不做自动扫描或监控，只做廉价验证：文件/目录存在、SSH alias 可解析、声明的 MCP server 已配置、外部 reference 格式有效、`last_verified` 是否超阈值。动态 health 只显示“未查询”或由外部 provider 提供，不能把一周前的检查伪装成当前状态。

## Recommended Projection Model

一次启动应有四个阶段：

1. **Resolve**：读取用户 registry/refs、项目原生说明与 binding、Profile、session overlay；不读取 secret 内容。
2. **Select**：按项目引用、Profile 与 token policy 选择 relevant subset；默认不注入未绑定的 `server-b`。
3. **Compile**：生成 immutable Effective Environment，做冲突、freshness、secret leak 与 adapter capability 诊断。
4. **Project & launch**：向隔离的 Claude/Codex 配置根、临时 instruction segment、MCP config 和白名单 runtime env 投影；退出后临时视图可删除或仅保留经过脱敏的 explain record。

投影应遵循三条底线：

- **Native first**：CLAUDE.md、AGENTS.md、Agent Skills、MCP、devcontainer、SSH config 都是复用目标。
- **Reference over copy**：能引用原文件/alias/provider 就不复制正文和值。
- **View, not authority**：Effective Environment 是这次启动的派生视图，不成为新的永久真值源。

Agent-Box 现有 Profile 隔离层已经能为 Claude `.claude`/CLAUDE files 和 Codex `.codex`/`.agents`/AGENTS files 提供独立 backing，这使 runtime-only projection 比在一般 dotfile manager 中更自然；参见仓库内 [Architecture](../ARCHITECTURE.md) 与 [Project Profile Isolation](../specs/project-profile-isolation.md)。不过当前 Agent-Box 的进程/文件/网络边界不应被描述成安全 enforcement；此前的 [Project Resource Capability Runtime Research](PROJECT_RESOURCE_CAPABILITY_RUNTIME_RESEARCH.md)已经指出其现有启动隔离并不是完整 security boundary。本议题不得借此扩张成 capability runtime。

## What Must Be Reused

### Table 4

| Component | Build / Reuse / Drop / Later | Reason |
|---|---|---|
| CLAUDE.md / Claude rules loader | Reuse | Claude 原生 precedence 与语义不断演进 |
| AGENTS.md | Reuse | 已是跨工具开放约定；[agents.md](https://agents.md/)现由 Agentic AI Foundation 体系推进 |
| Agent Skills | Reuse | 开放规范与渐进披露已经成熟 |
| MCP protocol / servers | Reuse | tools/resources/prompts/OAuth 不应重做 |
| SSH config / ssh-agent | Reuse | 主机连接与签名能力的标准真值源 |
| Secret manager | Reuse | Agent-Box 不应持有 secret value |
| devcontainer/Nix/devenv/mise/direnv/Compose | Reuse | runtime、service、env、task 已有成熟工具 |
| Markdown KB / Basic Memory | Reuse | shared-dev-kb 内容与检索不属于环境核心 |
| Ruler/Rulesync adapter ideas or integration | Reuse | 防止重复构建广泛格式生成器 |
| Minimal ResourceRef + ProjectBinding | Build | 现有原生文件缺少共同、可解释的实例 binding |
| EffectiveEnvironment compiler | Build | 这是项目/Profile/Session composition 的核心 |
| Runtime-only Claude/Codex adapters | Build | 与 Agent-Box Profile 隔离的主要协同点 |
| Provenance / explain / dry-run | Build | 区分于模板生成器的关键价值 |
| Lightweight reference validation | Build | 可验证 stale/missing，避免错误持久上下文 |
| OpenCode/Hermes adapters | Later | 先用两个 harness 证明价值，避免 adapter 数量伪装 PMF |
| Automatic machine-wide resource discovery | Drop | 隐私、噪声和 ontology 风险过高 |
| Generic resource ontology / CMDB | Drop | scope 无限，与现有 inventory 重叠 |
| Memory/RAG/vector store | Drop | 独立产品已有更成熟实现 |
| Secret Manager / IAM / policy engine | Drop | 高风险且非本问题必要条件 |
| MCP Gateway | Drop | 与 binding/explain 不同，生态已有大量实现 |
| Workflow/orchestration/ACP/sandbox | Drop | 与本验证目标无关，且仓库已有单独研究边界 |
| Web dashboard / cloud / team sharing | Later | 单用户 CLI 先验证问题是否存在 |

## MVP

### Scope

MVP 只服务一个本地用户、一个项目、Claude Code 与 Codex 两个 harness。它必须使用真实场景，而不是展示一个任意 schema 编辑器。

Global 输入：`server-a`、`server-b`、`shared-dev-kb`、global conventions。Project 输入：`staging → server-a`、项目 docs、`pytest`、github/docs MCP。Profiles：Claude Coder 与 Codex Reviewer。

### Must Have

- 一个最小、非秘密的用户资源目录，可声明两个 server 的 identity、purpose、capacity hint、SSH alias、instruction reference 与 `last_verified`。
- 项目级 bindings：`staging → server-a`，以及 docs/test/MCP references。
- Profile selection：Coder 与 Reviewer 可选择不同 subset；明确“省略部署说明”不是 permission enforcement。
- Effective Environment resolver，具有确定的 precedence、冲突检测和 secret-field rejection/redaction。
- Claude Code 与 Codex 两个 runtime-only adapter；不得永久改写项目原生文件或覆盖用户手工配置。
- `environment explain`/dry-run：展示 source、override、omission、projection target、stale/missing、redaction、instruction-not-enforced。
- 轻量 validation：项目 docs 存在、SSH alias 可解析、MCP reference 有对应原生配置、`last_verified` 可报告。
- 对 always-loaded 内容给出长度/近似 token 预算，KB 文档默认按需引用。

### Should Have

- 切换 Profile 后并排比较 effective view。
- 对原生 CLAUDE.md/AGENTS.md 与 generated segment 做冲突提示。
- 下一次启动自动采用 resource metadata 更新，而不重新生成/提交项目文件。
- 脱敏 launch record，便于复现“agent 当时看到了什么”；默认不包含会话内容与 secret。
- 一条从现有 SSH config/项目 task 读取 reference 的窄路径，用来证明“复用真值源”而不是复制。

### Do Not Build

- 权限系统、Secret Manager、完整 Web Dashboard、workflow、ACP、sandbox；
- 通用 Resource Ontology、自动发现整台机器资源、复杂 RAG；
- 多人共享、云平台、MCP Gateway、server health monitoring；
- OpenCode/Hermes 全量 adapter；
- 原生文件双向同步编辑器；
- 对自然语言 instruction 的安全承诺。

### Table 5

| MVP Feature | Value | Complexity | Validation Goal |
|---|---|---|---|
| Global ResourceRef | 单一位置更新 server facts | Low | 用户是否有 3 个以上长期资源值得维护 |
| Project binding `staging → server-a` | 自动选择正确资源 | Low | binding 是否比自由文本更易理解/少出错 |
| Profile-specific selection | Coder/Reviewer 获得不同相关视图 | Medium | Profile 差异是否真实且高频 |
| Claude runtime projection | 不改 repo 即获得环境 | Medium | Claude 能准确说明场景且不破坏原生配置 |
| Codex runtime projection | 同一来源跨 harness | Medium | Codex 得到等价语义，adapter 差异可控 |
| Explain + provenance | 调试 precedence、遗漏和来源 | Medium | 至少发现一次真实冲突/错误/陈旧信息 |
| Missing/stale validation | 降低错误持久上下文风险 | Low–Medium | 警告是否被用户采取行动 |
| Token/inclusion report | 防止 global context pollution | Low | `server-b` 等无关项是否能默认省略 |
| Secret redaction / ref-only | 防止把 key/token 投影进模型 | Medium | 生成物、日志、explain 中无秘密材料 |
| Dry-run Profile diff | 清楚展示增量价值 | Low | 用户能否在启动前理解两种 view 的差异 |

### Definition of Done

1. 用户只维护一处 `server-a` 事实和一处项目 binding。
2. 从同一 repo 启动 Claude Coder 与 Codex Reviewer，二者都能正确回答：staging 是谁、内存限制、测试命令、项目 docs 与共享 KB 在哪里。
3. 未绑定的 `server-b` 默认不进入常驻上下文，但 explain 显示其为何被省略；若要求资源发现，可按需列出。
4. 修改一次 `server-a` 的 usage instruction 后，下一次两个 harness 都采用新值。
5. 两次启动不永久修改 repo 的 CLAUDE.md/AGENTS.md/MCP config，不产生 git dirty。
6. explain 能逐项显示 user → project → profile → session → target 的 provenance，并标记 instruction 不等于 permission。
7. 模拟删除 docs、移除 SSH alias 或使验证时间过期时，启动前得到明确诊断。
8. private key、token、credential value 不出现在 manifest、runtime instruction、日志或 explain 中。
9. 用户能在 30 分钟内从已有原生配置迁入示例；否则“省维护”很难成立。

## Non-goals

本方向明确不负责：

- 让 agent 获得服务器、数据库或云账号权限；
- 远程执行的安全隔离、审批与审计；
- 保存或轮换 secret；
- 构建个人 CMDB、资产扫描器或云 inventory；
- 替代 MCP server、gateway 或 registry；
- 替代 devcontainer、Nix/devenv、mise、direnv、Compose；
- 替代 CLAUDE.md、AGENTS.md、Agent Skills 或 harness memory；
- 存储、索引或训练共享知识库；
- 跨 harness 恢复同一模型会话/隐状态；
- workflow、multi-agent orchestration、ACP、多人协作与云同步。

## Risks

| Risk | Consequence | Mitigation / Stop signal |
|---|---|---|
| Context pollution | token 浪费、模型分心、误用资源 | 默认 project-bound subset；KB 按需；报告 token |
| Stale facts | 部署到错误资源或违反容量限制 | source + last_verified + cheap validation；不声称实时 |
| False security | 用户把 instruction 当权限 | UI/explain 标注 not enforced；不建抽象 permission |
| Native config conflict | agent 收到相反指令 | 冲突诊断、precedence 可见、保留 native source |
| Adapter drift | 上游文件/flags变化导致错误 | native-first、最少 adapter、官方兼容测试 |
| Upstream convergence | 产品被 AGENTS/Skills/MCP 吞掉 | 把 moat 放在 binding/Profile/runtime explain；否则 Kill |
| Ontology expansion | 变成 CMDB/IAM/workflow | MVP type hint + opaque refs；拒绝 provider-specific schema |
| Secret leakage | key/token 进入上下文或日志 | ref-only、deny known secret fields、脱敏测试 |
| Double source of truth | Agent-Box 与 SSH/devcontainer 不一致 | reference over copy；明确 authoritative source |
| Hidden mutation | 覆盖用户配置、git dirty | ephemeral read-only projection、dry-run、launch cleanup |
| Low switching frequency | 节省不足以覆盖学习成本 | 先测目标用户实际使用频率 |
| “Explain”无人使用 | 核心差异只是理论 | 以真实问题发现率和复用率作为 Kill Metric |

## Unknowns Requiring User Validation

在扩展到第三个 harness 前，必须访谈或遥测回答：

1. 目标用户每周实际切换几个 harness？同一 repo 还是不同 repo？
2. 用户反复描述的究竟是 server/KB 等跨项目资源，还是只是项目命令？后者 AGENTS.md 已足够。
3. 用户主要需要“agent 知道”还是“agent 真能执行”？若主要是执行，本方向会被 capability/permission 问题牵引，应另立项目。
4. 用户是否已经使用 SSH aliases、devcontainer/mise、MCP 与 shared AGENTS.md？迁移成本如何？
5. `server-a` 这类事实多久变化一次，由谁更新？用户愿意维护 `last_verified` 吗？
6. Profile 之间的环境差异是真实工作流，还是 demo 角色差异？
7. 用户是否愿意让 Agent-Box 在启动时自动注入 context？他们希望预览/批准到什么粒度？
8. 多少知识需要启动时摘要，多少应按需检索？
9. 用户是否能理解 instruction 与 enforced permission 的差异？
10. `explain` 是否解决过实际失败，例如错误 staging、未加载 MCP、旧文档或覆盖冲突？
11. 用户会选择 Agent-Box 作为 source of truth，还是只让它引用现有 dotfiles/SSH/devcontainer？
12. Windows/macOS/Linux 路径和配置根差异会不会让 adapter 成本超过收益？

## Kill Metrics

MVP 前就应约定以下停止条件；满足任意两到三项即不继续扩展：

- 目标用户中每周使用两个以上 harness 的比例低于 20%，或中位数每月同 repo 切换不足 2 次。
- 大多数环境只有自由文本 conventions，没有至少 3 个长期资源与 1 个 project binding。
- Ruler/Rulesync + shared AGENTS.md + MCP + Basic Memory 能在 30 分钟内满足 80% 需求。
- MVP 的 70% 以上实现/维护工作是文件格式模板，binding、runtime-only 与 explain 很薄。
- 用户每月节省的设置/重复说明时间中位数不足 5 分钟，或新 schema 的维护时间更高。
- `explain` 在首次设置后几乎不再使用，且没有发现真实 config drift、错误 binding 或 stale reference。
- 超过 30% 的 launch 仍需手工修改 harness 原生配置才能正确工作。
- 30 天内超过 10% 的资源事实变陈旧，且用户不响应 freshness warning。
- 用户期待的核心是权限、远程执行或 secret 管理，而不是 context binding；这说明产品问题已变成另一个高风险方向。
- 上游对 AGENTS.md、Skills、MCP 与 profile composition 的兼容使同样能力可以直接原生实现。

继续投入的正向门槛应至少包括：5–10 个真实多-harness 用户中，过半每周复用；两种 Profile 的有效视图确有差异；一次变更能稳定更新两个 harness；explain 至少帮助每位测试用户发现一个真实问题；且 repo/native config 零持久 mutation。

## Final Go / Modify / Kill Recommendation

### 对宽泛命题：Kill

不要建设名为“Persistent Agent Environment”的大模块。该名称把 resource registry、memory、knowledge、runtime、secret、permission、MCP gateway 和 developer environment 暗示成一个统一系统。现有生态已经分别解决它们，Agent-Box 既没有必要也不应成为新的个人开发基础设施控制面。

### 对纯 Projection / Config Generator：Kill

如果方案的主要产物是把同一段文字生成到 `CLAUDE.md`、`AGENTS.md` 和 OpenCode config，或复制 MCP config，那么 Ruler、Rulesync、AGENTS.md、Agent Skills、dotfiles 和 harness 自身兼容已经足够。这里没有独立价值，也没有可靠护城河。

### 对窄化后的 Binding & Explain：Modify / Conditional Go

建议做 2–3 周验证型 MVP，且只拥有以下最小核心：

> **Project/Profile-aware resource binding + ephemeral native projection + provenance/explain + lightweight freshness diagnostics.**

它的价值不是保存 context，而是回答并执行四个问题：

1. 这个项目现在把什么逻辑角色绑定到哪个已有资源？
2. 当前 Profile 应看到哪些资源、instructions、knowledge 与 tools？
3. 这些信息怎样以当前 harness 的原生机制生效，而不永久改写配置？
4. 每个结果来自哪里、为何出现或被省略、是否陈旧、是否只是一条未强制的 instruction？

MVP 成功后再考虑 OpenCode/Hermes adapter 和更多外部 source；不要先做 UI、云、多用户或 ontology。若它不能在真实多-harness 用户中证明上述四点比 80% 替代组合明显更好，则按 Kill Metrics 停止。

最终判断可以浓缩为一句话：

> **“跨 harness 的持久 Agent 工作环境”作为宽泛产品不成立；“跨 harness 的环境绑定、运行时视图与来源解释”是一个真实但窄、必须靠用户频率和诊断价值验证的 Agent-Box 能力。**

## Selected Sources

### Harness official documentation

- Claude Code：[Memory](https://code.claude.com/docs/en/memory)、[Settings](https://code.claude.com/docs/en/settings)、[MCP](https://code.claude.com/docs/en/mcp)、[Skills](https://code.claude.com/docs/en/skills)、[Permissions](https://code.claude.com/docs/en/permissions)、[Hooks](https://code.claude.com/docs/en/hooks-guide)、[Sessions](https://code.claude.com/docs/en/sessions)、[Subagents](https://code.claude.com/docs/en/sub-agents)
- Codex：[AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)、[Basic config](https://learn.chatgpt.com/docs/config-file/config-basic)、[Advanced config](https://learn.chatgpt.com/docs/config-file/config-advanced)、[MCP](https://learn.chatgpt.com/docs/extend/mcp)、[Skills](https://learn.chatgpt.com/docs/build-skills)、[Memories](https://learn.chatgpt.com/docs/customization/memories)、[Sandboxing](https://learn.chatgpt.com/docs/sandboxing)、[CLI resume](https://learn.chatgpt.com/docs/codex/cli)
- OpenCode：[Rules](https://opencode.ai/docs/rules/)、[Config](https://opencode.ai/docs/config/)、[MCP](https://opencode.ai/docs/mcp-servers/)、[Skills](https://opencode.ai/docs/skills/)、[Permissions](https://opencode.ai/docs/permissions/)、[repository](https://github.com/anomalyco/opencode)
- Hermes：[Context files](https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files)、[Memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)、[MCP](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp)、[Skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)、[repository](https://github.com/NousResearch/hermes-agent)

### Standards, shared context, and environment tools

- MCP 2025-11-25：[Resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)、[Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)、[Prompts](https://modelcontextprotocol.io/specification/2025-11-25/server/prompts)、[Roots](https://modelcontextprotocol.io/specification/2025-11-25/client/roots)、[Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [AGENTS.md](https://agents.md/)、[Agent Skills specification](https://agentskills.io/specification)
- [Ruler](https://github.com/intellectronica/ruler)、[Rulesync](https://github.com/dyoshikawa/rulesync)、[PRPM](https://github.com/pr-pm/prpm)
- [Basic Memory](https://github.com/basicmachines-co/basic-memory)、[ai-memory](https://github.com/akitaonrails/ai-memory)、[ByteRover](https://github.com/campfirein/byterover-cli)、[Mem0](https://github.com/mem0ai/mem0)
- [Dev Container specification](https://containers.dev/implementors/json_reference/)、[direnv](https://direnv.net/)、[mise](https://mise.jdx.dev/environments/)、[devenv](https://devenv.sh/)、[Docker Compose](https://docs.docker.com/compose/)、[chezmoi](https://www.chezmoi.io/user-guide/manage-machine-to-machine-differences/)
- Credentials：[OpenSSH config](https://man.openbsd.org/ssh_config)、[1Password SSH Agent](https://www.1password.dev/ssh/agent)
