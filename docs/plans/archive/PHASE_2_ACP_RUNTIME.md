# Agent Box 第二阶段：Profile ACP Runtime
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 文档导航：[总目录](../README.md)

> 状态：方向决策
>
> 日期：2026-08-19

## 决策摘要

Agent Box 第二阶段不再以自建完整的项目管理、Agent 通信协议和工作流编排平台为
目标，而是聚焦于一项更基础的能力：

> **把每个隔离、持久的 Profile 暴露为标准的 ACP Agent Runtime，并通过受控的
> 资源绑定为它提供可复用能力。**

第一阶段让 Profile 成为边界清晰的独立 Agent；第二阶段让外部客户端能够标准地
发现、调用和延续这些 Agent。至于多个 Agent 如何分工、按什么顺序执行、如何形成
工作流，由 DSH、IDE、工作流平台或用户自己的编排器决定。

Agent Box 的演进主线仍然是：**先隔离，再连接。**

## 产品定位

Agent Box 是本地 AI Agent 的运行环境管理层。它管理的基本单位不是一次模型请求，
也不是一张工作流图，而是一个长期存在的 Profile：

```text
Profile
= Agent Framework
+ Model / Provider
+ System Configuration
+ Project Configuration
+ Permissions / Skills / Hooks / MCP
+ Session State
+ Isolated Runtime View
```

第二阶段之后，一个 Profile 不仅能够由用户在终端中启动，还能够作为标准 ACP
Endpoint 被外部应用调用。

一句话定位：

> **Agent Box 把本地 Agent Profile 变成拥有独立身份、配置和项目现场的标准 ACP
> Runtime。**

## 整体架构

```text
DSH / IDE / Workflow Platform / Custom Client
                         │
                         │ ACP
                         ▼
                Agent Box Profile Runtime
              identity / config / session / cwd
                         │
             ┌───────────┴───────────┐
             │                       │
             ▼                       ▼
      Native Agent Adapter     Resource Bindings
 Claude / Codex / Hermes /    MCP / env refs / host
        OpenCode                     capabilities
             │                       │
             └───────────┬───────────┘
                         ▼
                 Project Workspace
```

这里存在三个明确边界：

1. **外部客户端负责组织。** 它决定调用谁、何时调用、是否并行、如何传递结果。
2. **Agent Box 负责运行。** 它决定 Profile 如何启动、看到什么配置、进入哪个项目、
   如何保存和恢复状态。
3. **原生 Agent 负责执行。** Claude Code、Codex、Hermes、OpenCode 保持自己的
   Agent Loop、工具系统和原生能力。

## 第一阶段资产：保留并封版

第一阶段的隔离能力是第二阶段的地基，不应删除或重新实现。当前应保留：

- 系统级 Profile 配置隔离；
- 模型、供应商、提示词、Style、Skills、Hooks、MCP 与权限配置；
- Agent 类型声明式 Registry；
- Bubblewrap 启动与原生配置路径投影；
- Session 生命周期记录；
- Profile 私有的项目级配置与多层项目投影；
- CLI、GUI 和现有配置资产管理能力。

第一阶段进入维护状态：修复阻塞使用的问题并保持上游兼容，但不再以穷举所有配置面、
重写界面或增加大量管理功能作为主要开发方向。

## 项目级 `.agent-box/` 的边界

项目级 `.agent-box/` 保留，但职责收窄。

它继续承担：

- `Profile × Project` 的私有项目配置；
- 原生 `.claude/`、`.codex/` 等项目入口的 backing storage；
- 仓库祖先到启动目录的多层配置投影；
- ACP 调用时工作目录与项目现场的恢复；
- 必要的 Profile、项目和原生 Session 关联信息。

它暂时不承担：

- 完整团队数据模型；
- 自研工作流定义；
- 项目进度与完成度管理；
- 通用消息池；
- 自动产物回收平台；
- Agent 之间的直接通信协议；
- 复杂组织结构与协作规则引擎。

项目级 `.agent-box/` 是运行现场的存储层，不是新的项目管理平台。

## ACP Runtime

### 协议角色

ACP 解决的是客户端与 Agent 之间的互操作，不直接规定 Agent-to-Agent 协作。
多 Agent 工作流由上层客户端同时调用多个 ACP Endpoint 实现。

Agent Box 的目标不是重新发明 ACP，也不是为每个 Profile 编写一套协议实现。

```text
Agent Type Adapter             Profile Runtime Instance
------------------             ------------------------
Claude ACP Adapter      ─┐     decision @ project-a
Codex ACP Adapter       ─┼──→  coder    @ project-a
Hermes ACP Adapter      ─┼──→  reviewer @ project-a
OpenCode ACP Adapter    ─┘
```

- Adapter 属于 Agent Type，负责 ACP 与原生 Agent API/CLI 之间的转换；
- Endpoint 属于 Profile，负责具体身份、配置、项目目录和 Session；
- 已有成熟 Adapter 时优先复用，不重复实现协议翻译；
- 缺少 Adapter 时，单独评估贡献上游、维护薄适配层或等待生态实现。

### 候选命令接口

以下接口只表达产品形态，最终 CLI 需要单独设计：

```bash
agent-box acp serve decision --cwd ~/projects/example
agent-box acp serve coder --cwd ~/projects/example
agent-box acp serve reviewer --cwd ~/projects/example
```

每次 `serve` 应在对应 Profile 的 Bubblewrap Namespace 中启动该 Agent Type 的 ACP
Adapter，使 Adapter 和原生 Agent 看到 Profile 私有的系统配置与项目配置。

### 第一版能力范围

第一版 ACP Runtime 只要求形成一条可靠闭环：

- stdio transport；
- Profile 解析与 Agent Type Adapter 选择；
- `cwd` 与项目 Profile 投影；
- ACP 初始化和能力协商；
- 新建与延续 Session；
- 流式文本、工具事件与最终结果；
- 权限请求透传；
- Cancel、超时、进程退出与错误映射；
- 基本日志和运行状态；
- 多个 Profile 并行运行且配置、历史不互相污染。

第一版不要求网络服务、远程多租户、完整 Dashboard 或自定义编排 DSL。

## 共享资源：从“平台”收敛为“绑定层”

共享资源能力不从零开发 GitHub、数据库、云服务器或浏览器客户端，而是建立轻量的
资源声明和 Profile 绑定机制。

```text
Global Resource Registry
          │
          │ profile references + permissions
          ▼
Profile Runtime
          │
          │ MCP / env reference / host proxy
          ▼
External Capability
```

第一版只考虑：

1. 已有 MCP Server；
2. 环境变量引用；
3. 宿主已有凭证或能力的引用；
4. Profile 级启用、禁用和简单权限描述；
5. 启动时向原生 Agent 或 ACP Adapter 注入绑定结果。

原则上保存资源定义和凭证引用，而不是复制真实密钥。密钥 Vault、OAuth 托管、复杂
组织权限、资源市场与审计平台均不属于第一版范围。

## 外部平台集成

第二阶段必须通过一个真实外部客户端验证，而不是只完成内部抽象。

首个集成目标应满足：

- 已有用户和工作流入口；
- 支持插件或扩展机制；
- 能够作为 ACP Client 调用本地 Agent；
- 能处理流式事件、权限请求和 Session；
- 能够展示多个 Profile 的实际差异。

当前候选是会议中提到的 DSH，但在立项前必须确认准确项目、代码仓库、插件模型、
本地连接方式和 ACP 支持情况。

首个端到端目标：

```text
External Platform Plugin
        → ACP
        → Agent Box Profile
        → Native Agent Session
        → Streaming Result
```

## 实施顺序

### Phase 2A：单 Profile ACP 闭环

1. 调研并选择一个已有 ACP Adapter；
2. 在 Agent Box Namespace 中手工跑通 Adapter；
3. 确认系统配置、项目配置和原生 Session 均落入正确 Profile；
4. 实现 `agent-box acp serve` 的最小入口；
5. 验证初始化、消息、事件、取消和退出。

### Phase 2B：多 Profile 与 Session

1. 同一项目同时暴露两个 Profile；
2. 验证配置、历史和权限不串线；
3. 建立 ACP Session 与原生 Agent Session 的关联；
4. 验证停止后恢复和异常退出后的清理。

### Phase 2C：资源绑定

1. 复用现有 MCP 资产；
2. 增加资源引用和 Profile 绑定；
3. 在 ACP 启动路径注入 MCP 与环境引用；
4. 验证不同 Profile 获得不同能力集合。

### Phase 2D：一个外部插件

1. 确认目标平台；
2. 实现最小 ACP Client 插件；
3. 让真实用户调用至少两个不同 Profile；
4. 根据重复使用和反馈决定是否继续扩张。

## 暂不实施

- 自研 Agent 通信协议；
- Agent-to-Agent 消息总线；
- 图工作流编辑器；
- 固定主从、群聊或 Handoff 范式；
- 完整项目管理系统；
- 通用云端 Sandbox 平台；
- 自研模型与供应商路由；
- 大规模远程多租户服务；
- 为已有 ACP Adapter 重写等价实现。

这些方向不是永久否定，而是在没有真实需求前不进入主线。

## 验证标准

第二阶段不是以功能清单完成度判断成功，而以真实闭环判断：

- 外部客户端能够无需修改原生 Agent 地调用 Profile；
- 两个 Profile 在同一项目中保持配置、权限和 Session 独立；
- Session 可以停止并继续；
- 一个共享资源可以按 Profile 权限差异化注入；
- 至少一个外部平台完成集成；
- 出现非作者用户的重复使用和主动反馈。

如果只有作者本人使用，Agent Box 仍可作为稳定的个人工具和技术作品维护，但不继续
扩张为通用平台。只有真实使用证明了集成价值，才进入更大的协作、资源治理或远程
Runtime 阶段。

## 不变式

1. **原生 Agent 无感。** 不要求 Claude Code、Codex 等修改自己的配置读取方式。
2. **Profile 是核心实体。** ACP、资源和项目现场都围绕 Profile 组合，而不是另建
   一套重复身份系统。
3. **协议优先复用。** 使用 ACP、MCP 和现有 Adapter，不自建等价标准。
4. **运行与编排分离。** Agent Box 管理 Runtime，外部客户端管理 Workflow。
5. **能力显式绑定。** 公共资源统一声明，但每个 Profile 的可见范围独立控制。
6. **先完成外部闭环。** 没有真实集成和用户反馈，不扩张平台边界。

## 最终叙事

第一阶段，Agent Box 让每个本地 Agent 成为配置完整、边界清晰、项目现场独立的
Profile。

第二阶段，Agent Box 通过 ACP 为这些 Profile 提供标准调用接口，并通过受控资源
绑定赋予它们可复用能力。IDE、工作流平台和用户自己的客户端可以在此基础上组织
多个 Agent，而 Agent Box 不替它们规定协作方式。

> **Agent Box 不再尝试成为所有 Agent 工作流的终点，而是成为本地 Agent 接入不同
> 工作流的稳定运行底座。**
