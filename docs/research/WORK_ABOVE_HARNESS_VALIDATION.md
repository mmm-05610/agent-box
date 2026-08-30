# Work-Above-Harness Architecture Validation

> 文档导航：[总目录](../README.md)

> **研究问题**：是否存在一个有意义的软件层，使“Work 存在于 harness 之上”，并且这一层是否已经被良好实现？
> **研究日期**：2026-08-20（Asia/Shanghai）
> **研究方法**：证伪优先；以官方文档、当前源码、schema、ADR 和协议规范为主，不以营销功能表作为 domain/ownership 证据。
> **最终判定**：**B. Partially Solved**
> **置信度**：中高。Level 3 的核心语义已在 Kandev Office、VS Code Agent Host/AHP 等处出现，但尚无一个成熟、通用、开放且跨 Claude Code / Codex / OpenCode / Hermes 的完整实现。

---

## Executive Summary

### 一句话结论

**“Work above harness” 是一个真实且正在成形的软件层，但不能据此推出 Agent-Box 应重写一套通用 Work Core。** 目前最接近完整命中的两个实现是：

1. **Kandev Office provider routing**：明确分离稳定的 `agent_profile_id` 与一次执行所选的 `execution_profile_id`；跨 provider fallback 保持 task、run、environment、worktree、instructions、skills 与历史不变，丢弃不可迁移的 native session，并记录 route attempts。它是本次研究中最直接的反例。
2. **VS Code Agent Host / Agent Host Protocol (AHP)**：Agent Host 而非 Claude/Codex adapter 拥有 session lifecycle 和权威状态；同一个 session 可承载多个 chat，并可在 Copilot、Claude、Codex 等 harness 间 handoff。它证明 IDE 可以从“多个聊天窗口”演进为真正的上层 session host。

但两者都还不能称为成熟、通用 Level 3：

- Kandev 的最强语义位于 **feature-flagged、production 默认关闭、仍 in progress 的 Office mode**；其普通 workflow portable schema 仍把 step/profile 解析到具体 `agent_name/model/mode`，而不是通用 `Role → abstract Profile → Runtime Provider`。
- VS Code Agent Host/AHP 仍处于 active development/preview；其顶层语义主要是“session/chat”，不是版本化 `Work Definition → Work Instance`；custom agent、permissions、MCP、resume 和 provider-specific configuration 在不同 harness 间并不等价。
- Goose 已能把 Claude Code/Codex ACP agent 当 provider，但 active session 仍以启动时 provider instance 为中心；跨 provider resume 和 provider reconstruction 仍暴露出真实兼容性问题。
- Temporal、LangGraph、Prefect、Agno、Mastra、PydanticAI 等已经成熟或较成熟地拥有 run ID、state、checkpoint、history、pause/resume；再造这部分通常没有价值。它们缺的是 **完整外部 coding harness session adapter 及其兼容语义**，不是数据库或状态机。

因此，当前准确判断不是 “Already Solved”，也不是 “Meaningful Gap，所以立即自建”。而是：

> **Level 0–2 已很成熟；Level 3 的关键 ownership boundary 已被多个系统独立验证，且已有两个强预览实现。剩余缺口集中在 provider-neutral definition、capability negotiation、cross-harness continuation contract 与 provenance normalization。这个缺口可能有价值，但很窄，并且正在被 Kandev/AHP/ACP 快速吸收。**

### 对 Agent-Box 的直接建议

1. **暂停实现通用 Work Instance Core。** 不要再造 workflow durability、event history、generic task DB、chat persistence 或 IDE session host。
2. **优先评估贡献/集成 Kandev**：如果目标体验接近 task/worktree/workflow/Office routing，Kandev 已有最接近的 domain model；重复实现其 Core 缺乏证据支持。
3. **把 VS Code AHP 视为第二个首选宿主/协议方向**：若目标主要在 IDE，优先做 adapter、provider conformance 与 portability experiment，而不是另建 session authority。
4. **只有在实验证明 Kandev、AHP 和 workflow-runtime mapping 均无法承载下列四个缺口后，才恢复 Core 开发**：版本化 Work Definition、抽象 Profile 绑定、fail-closed capability contract、跨 harness execution provenance。
5. 新的 `Agent-Box Work ID` 只有在它真正关联多个 native sessions、provider attempts、worktree、artifacts、approvals 和恢复链时才成立；若只是给 Temporal run、Kandev task、VS Code session 或 issue ID 再套一个 UUID，应直接 Kill。

### 最关键的证伪结果

| 原假设 | 证据 | 结论 |
|---|---|---|
| 没有人把稳定身份放在 harness 之上 | Kandev `agent_profile_id` / `execution_profile_id` 分离；VS Code Agent Host 为 session source of truth | **已被证伪** |
| multi-harness 工具都只是 launcher/UI | Kandev Office routing、VS Code handoff、Codeg WorkTask、Vibe multi-session workspace、Goose ACP providers | **已被部分证伪** |
| 必须自建 lifecycle/persistence | Temporal、LangGraph、Prefect、PydanticAI durable execution、Agno/Mastra 已提供 | **被强烈证伪** |
| 修改 `provider:` 字段即可 portability | Kandev ADR、Goose provider-resume issue、Zed provider boundary、ACP capabilities 均显示权限/session/config 差异 | **被证伪** |
| 独立 Work ID 总有价值 | 若单 harness 或已有 workflow/session/issue authority，则只是 metadata duplication | **不成立；有条件才有价值** |
| 已有成熟通用 Level 3 | 两个最强候选均为 preview/feature-flagged，且语义覆盖不完整 | **尚未证实** |

---

## Exact Hypothesis

### 待证伪命题

存在一个独立于 coding harness 的控制层，满足：

```text
Work Definition
      │ resolve / validate
      ▼
Work Instance
      ├── Workflow Provider
      ├── Role → Profile bindings
      ├── Environment / Permission intent
      ├── Harness Runtime: Claude / Codex / OpenCode / ...
      │      └── Native sessions
      ├── Workspace / worktree
      ├── Artifacts / evidence
      └── Lifecycle / recovery / history
```

该层的必要条件不是“支持多个 agent”，而是同时满足：

1. Work/Run 是独立一级实体，有稳定 identity；
2. native harness session 是 child/reference，不是顶层权威；
3. 同一 Work 可关联一个以上异构 harness；
4. provider 更换不改变 Work identity；
5. Work Definition 不直接写死具体 harness，至少存在 `Role → Profile → Execution Provider` 的解析边界；
6. 上层拥有 lifecycle correlation、effective configuration snapshot、artifacts/evidence 与 resume metadata；
7. 对权限、工具、MCP、session resume、worktree 等差异有显式兼容或降级语义，而不只是改一个字符串。

### 三个容易偷换的弱命题

- **统一启动多个 agent ≠ Work owner**：launcher 可以没有稳定 run、history 或恢复。
- **有 workflow ≠ Work owner**：workflow 只是协作控制流；同一 Work 可能更换 workflow，或包含人工阶段、外部任务和多个 workflow run。
- **有 session ID ≠ Work identity**：session 可能只是一次 conversation；Work 可以包含多个 session、失败尝试、handoff、patch、tests 和环境快照。

### 严格的“已实现”判据

一个系统只有在其**公开支持的 domain model**中满足上述必要条件，且在崩溃、resume、provider replacement、permissions 和 provenance 上有明确语义，才算成熟 Level 3。实验分支、提案 ADR、内部 schema 或可由用户手写 wrapper 实现，均只能计作“方向成立”而非“问题已解决”。

---

## Definition of Work

### 术语边界

| 概念 | 精确定义 | 不是什么 | 典型 identity |
|---|---|---|---|
| **Work Definition** | 可复用、版本化的意图声明：目标类型、角色、抽象 Profile、workflow/environment/permission intent、输入输出契约 | 不是一次执行状态；不应含 native session ID | definition name/version/digest |
| **Work Instance / Run** | 某个 Definition 或 ad-hoc objective 的一次具体化；拥有稳定业务身份、解析快照、生命周期、关联图和结果 | 不是 workflow 本身，也不是 conversation | work ID；可映射为外部 workflow ID |
| **Workflow** | 角色/步骤如何协作、何时分支/重试/等待的 provider | 不是 Work identity；可替换或不使用 | workflow definition/run ID |
| **Agent Profile** | 对“怎样执行某角色”的可复用逻辑配置；理想情况下不直接等于某个 runtime | 不是角色实例，也不必等于模型 | profile ID/version |
| **Role** | Work 内的逻辑职责，如 planner、reviewer、executor | 不是 Claude/Codex，也不是一个 session | role key within Work |
| **Harness** | 完整 coding-agent loop：context assembly、model loop、tools、approval、native memory/session | 不是 model provider | claude-code/codex/opencode |
| **Native Session** | harness 自己的 conversation/thread/session 及恢复 token | 不是 Work；只表达一个 harness 的内部连续性 | Claude session ID、Codex thread ID |
| **Project / Workspace** | 代码项目的长期引用与一次执行看到的文件空间 | 不是 Work；同一项目有多个 Work | repository/project ID, path |
| **Environment** | 运行所需的计算、文件、网络、服务、依赖与 secret bindings | 不是权限意图，也不是 UI | environment/allocation/container ID |
| **Permission Intent** | 上层声明的允许/禁止/需批准能力，如 read-only、workspace-write、network-deny | 不是实际 enforcement | policy/digest |
| **Artifact** | Work 产生或消费的可寻址结果：patch、commit、report、test log、build、截图 | 不等于聊天消息 | artifact ID/hash/URI |
| **Interaction Surface** | 用户观察、输入、批准和控制 Work 的渠道 | 不拥有推理或必然拥有 lifecycle | TUI/IDE/Slack/web |
| **Runtime Backend** | 实际承载执行的实现：harness、model/provider、sandbox、remote executor 等 | 不是抽象 Profile | provider/profile/instance ID |
| **Task** | Work 中可调度或可完成的工作单元；某些产品也把 Task 当顶层 Work | 不能凭名字判断 ownership | task ID/status |

### 本报告采用的 Work 定义

> **Work 是一个跨时间、跨执行尝试、可关联多个 native agent session 的目标性执行记录。它的 identity 不依赖任何单一 harness；它拥有“为什么做、对什么项目做、由哪些逻辑角色做、实际用了什么、产生了什么、如何结束/恢复”的权威关联。**

Work 不必拥有 blob storage、sandbox、secret、UI 或 agent loop；它可以只拥有这些外部资源的选择、引用、快照和因果关系。

---

## Level 0–3 Maturity Model

| Level | 名称 | 必备语义 | 明确不算 |
|---|---|---|---|
| **L0** | Launcher | 可启动一个或多个 agent/harness；可能并行 | 没有统一稳定 run、关联图、恢复和历史 |
| **L1** | Workspace Aggregator | 统一 Project/UI/session list；可能保存聊天、diff、workspace | 多个独立聊天窗口；没有 same-work cross-harness identity |
| **L2** | Multi-Harness Orchestrator | 同一 task/workspace/flow 可协调多个执行者；有状态和 lifecycle；可能关联 worktree/artifacts | 顶层仍由主 harness/session 拥有；definition 直接绑定具体 harness；不能安全替换 |
| **L3** | Work-Above-Harness Runtime | 独立 Work identity；provider-neutral definition；异构 native sessions 是 children；跨 provider lifecycle/correlation；替换有 capability/continuation/provenance 语义 | 只把 `provider: claude` 改成 `provider: codex`；只有 model portability |

### L3 验收问题

如果以下任一核心问题答案为“否”，本报告不把它评为成熟 L3：

1. 删除某个 native session 后，Work 的身份和其余 history 是否仍完整？
2. 同一 Work 是否能同时或顺序关联 Claude 与 Codex 的 native session？
3. provider replacement 后，系统是否知道哪些状态可继承、哪些必须重建？
4. 是否能查询“这次 Work 实际用了哪些 provider/profile/model/permissions/worktree/artifacts”？
5. role binding 是否能在不改 Work Definition 的情况下重新解析？
6. 不支持某 capability 时是否 fail closed 或显式降级？
7. stop/resume/recover 是否针对 Work，而不只是某个进程或 chat？

---

## Existing Landscape

### 总体分布

```text
成熟度
L3  ── Kandev Office (feature-flagged) ─ VS Code Agent Host/AHP (preview)
          ↑ 最强的两个近似实现；均未达到成熟、通用 L3
L2  ── Codeg ─ Vibe Kanban ─ Goose ─ Cline Teams ─ Claude Teams
       LangGraph/AutoGen/CrewAI/Agents SDK/Agno/Mastra（框架内 agent）
L1  ── Zed external agents ─ JetBrains AI Agents ─ Agent Monitor
       OpenCode/Continue（model portability 为主）
L0  ── 单纯 CLI launcher / tmux scripts
```

### Landscape 的核心观察

1. **“顶层对象叫 Task/Session/Run”不是决定因素。** Kandev 的 `Task` 很像 Work；VS Code 的 `Session` 也已经超出 conversation；Codeg 的 `WorkTask` 有强 lifecycle，但直接绑定 `agent_type`。
2. **多 harness 支持已普遍化。** ACP 使 Zed、JetBrains、VS Code、Codeg、Goose 等可以接 Claude/Codex/OpenCode；这解决 transport/launch/display 的大部分问题，没有自动解决 Work semantics。
3. **跨 provider continuity 的现实契约不是搬运 native chat。** Kandev 明确选择：保持 task/run/environment/worktree，启动新的 provider-native session，让新 agent 从 durable task/repo state 重建上下文。
4. **最成熟的 identity/lifecycle 并不来自 coding-agent 产品。** Temporal Workflow ID/Run ID、event history、pause/resume/retry 已远强于多数 agent workspace。
5. **真正稀缺的是 semantic compatibility，而非 orchestration primitives。** permission、approval、MCP、skills、sandbox、headless、resume 和 tool event 的等价性没有统一标准。

---

## Kandev Deep Dive

### 证据基线

源码快照：[`kdlbs/kandev@84a1323`](https://github.com/kdlbs/kandev/tree/84a132399dea6988af1d73f68075765417bd77bc)，核验日期 2026-08-20。关键证据：

- [`Task` / `TaskSession` domain model](https://github.com/kdlbs/kandev/blob/84a132399dea6988af1d73f68075765417bd77bc/apps/backend/internal/task/models/models.go)
- [`Workflow` model](https://github.com/kdlbs/kandev/blob/84a132399dea6988af1d73f68075765417bd77bc/apps/backend/internal/workflow/models/models.go)
- [portable workflow export schema](https://github.com/kdlbs/kandev/blob/84a132399dea6988af1d73f68075765417bd77bc/apps/backend/internal/workflow/models/export.go)
- [`Office Run` / `RouteAttempt`](https://github.com/kdlbs/kandev/blob/84a132399dea6988af1d73f68075765417bd77bc/apps/backend/internal/office/models/models.go)
- [Office identity / execution profile routing ADR](https://github.com/kdlbs/kandev/blob/84a132399dea6988af1d73f68075765417bd77bc/docs/decisions/2026-07-15-office-agent-execution-profile-routing.md)
- [Office provider routing public docs](https://github.com/kdlbs/kandev/blob/84a132399dea6988af1d73f68075765417bd77bc/docs/public/office-provider-routing.md)
- [feature status](https://github.com/kdlbs/kandev/blob/84a132399dea6988af1d73f68075765417bd77bc/docs/public/feature-status.md)

### 最核心实体是什么？

在普通 Kanban/workflow 路径中，**Task 是最接近 Work 的持久实体**。它关联 workspace、workflow/step、project、repositories、workspace folders、父任务、metadata 和状态。`TaskSession` 是 Task 下的执行实体，持有：

- `TaskID`
- `AgentExecutionID`
- `AgentProfileID`
- `ExecutionProfileID`
- `EnvironmentID`
- repository/base SHA/workspace/worktree
- agent/executor/environment/repository snapshot
- lifecycle state

在 Office 路径中，**Task + Run** 共同形成更强的 Work/attempt 模型：Task 是稳定目标/所有权，Run 是一次执行；`RouteAttempt` 记录每个 provider candidate 的具体尝试。

因此 Kandev 并没有一个名为 `WorkInstance` 的单体实体，但其聚合边界已经非常接近：

```text
Task (stable objective / ownership)
├── Run(s)
│   └── RouteAttempt(s)
├── TaskSession(s)
├── TaskEnvironment
├── worktree/repository snapshots
├── documents/revisions/review findings
└── workflow state
```

### Workflow 是否绑定 agent/harness？

普通 workflow step 有 `AgentProfileID`。更关键的是，其 portable export 中 profile 仍展开为：

```yaml
agent_name: ...
model: ...
mode: ...
```

这说明 **普通 workflow portability 仍是“可导出的 concrete profile”，而不是 provider-neutral abstract role**。因此，不能因为 Kandev 有 Workflow + Profile 就自动判定 L3。

### Profile 是否只是配置？

Kandev 当前存在两种逻辑责任曾被放在同一物理 `agent_profiles` 表中：

1. 稳定 Office identity：name、role、hierarchy、instructions、skills、Office permissions、budget、status、history；
2. 具体 execution configuration：CLI/provider、credentials/env、model、mode、ACP config、flags、permission behavior、passthrough、MCP。

2026-07-15 ADR 正是为消除这个混合而提出：

- `agent_profile_id`：稳定身份、角色、任务/run ownership；
- `execution_profile_id`：本次启动所用的具体 CLI/provider 配置。

这是本次研究发现的最明确 `Role/Profile identity → Execution Profile → Harness` 分离。

### 是否存在稳定的跨 harness Work identity？

**在 Office routing 中，存在。** ADR 明确规定 provider fallback 时：

- 保持相同 task、run、task environment、worktree；
- 保持稳定 Office agent instructions、skills、permissions、budget、history；
- 记录 effective provider order、resolved execution profile/provider/model 和 route attempts；
- 不迁移 provider-native chat；清除/忽略旧 ACP/session token；
- 启动新的 native session，并要求其检查 durable task state、comments/messages、prior run state 和 git state。

换言之，Claude native session 和 Codex native session 都是同一 Task/Run 下的 execution attempts，而非 Work 本身。

### 是否能在同一个逻辑 Work 中替换 Claude → Codex？

**Office routing 的设计与当前实现路径支持这种替换和 fallback。** 但要加三个限定：

1. 是新建 native provider session，不是 session-format migration；
2. 依靠 durable task/repository state continuation，不保证相同 reasoning/context；
3. Office 在 production profile 默认关闭，官方 feature status 标记为 in progress。

### Environment / Permission 是否也是可替换 concern？

部分是，尚非完整 provider abstraction：

- task environment/worktree 由 Kandev 稳定持有，可跨 provider attempt 复用；
- Office permission intent 属于 stable agent identity；
- CLI permission behavior、flags、credentials、env、MCP 属于 execution profile；
- 实际 enforcement 仍由 executor/harness/sandbox 组合完成。

这种 ownership 切分是正确方向，但尚没有一个统一 capability contract 证明 `read-only`、approval、MCP、sandbox 在 Claude/Codex/OpenCode 间等价。

### Runtime lifecycle 由谁拥有？Session correlation 如何做？

Kandev backend/orchestrator 拥有 task/run/session lifecycle。`execution_profile_id` 持久化在 route attempt、run、task session 与 running executor 记录上，用于恢复时校验 native session 是否仍属于同一具体 runtime。provider 变化时拒绝复用旧 native token。

这是比“保存外部 session ID”更强的 correlation：它同时记录 logical owner 与 concrete executor。

### 是否等价于 Work Instance Core？

**Office mode 在 ownership boundary 上近似等价；整个 Kandev 产品尚不等价于成熟通用 Core。** 差异在于：

- 最强语义仅在 Office mode；普通 workflow 仍直接引用 concrete profile；
- 没有独立、版本化、provider-neutral 的通用 Work Definition schema；
- Role/Profile/ExecutionProfile 分离不是所有 workflow/task path 的统一契约；
- capability negotiation 仍不足以证明 provider replacement 的 permission/tool/resume 兼容；
- Office 是 experimental/in progress，production 默认关闭。

### 对 Agent-Box 的结论

**Agent-Box 不应重新实现 Kandev 已有的 Task/Run/TaskSession/Environment/Worktree/RouteAttempt Core。** 如果所需 UX 与 Kandev 接近，应优先：

1. 在 Kandev 上验证 Office routing；
2. 贡献 generic workflow 的 abstract role/profile binding；
3. 贡献 capability declaration/conformance；
4. 或只在 Agent-Box 中做 Kandev integration/launcher，而不是复制其 domain database。

只有当 Kandev 的产品形态、技术边界或 feature stability 明确不能承载个人 power-user 场景，才有重做依据。

---

## Codeg Deep Dive

### 证据基线

源码快照：[`xintaofei/codeg@a80ba0c`](https://github.com/xintaofei/codeg/tree/a80ba0c4ee59c9faa9eb0e20148e068204fc95fd)，核验日期 2026-08-20。关键证据：

- [`WorkTask` entity](https://github.com/xintaofei/codeg/blob/a80ba0c4ee59c9faa9eb0e20148e068204fc95fd/src-tauri/src/db/entities/work_task.rs)
- [`WorkTaskConfig`](https://github.com/xintaofei/codeg/blob/a80ba0c4ee59c9faa9eb0e20148e068204fc95fd/src-tauri/src/models/work_task.rs)
- [WorkTask migration/event table](https://github.com/xintaofei/codeg/blob/a80ba0c4ee59c9faa9eb0e20148e068204fc95fd/src-tauri/src/db/migration/m20260801_000001_work_task.rs)
- [`Conversation` entity](https://github.com/xintaofei/codeg/blob/a80ba0c4ee59c9faa9eb0e20148e068204fc95fd/src-tauri/src/db/entities/conversation.rs)
- [delegation types](https://github.com/xintaofei/codeg/blob/a80ba0c4ee59c9faa9eb0e20148e068204fc95fd/src-tauri/src/acp/delegation/types.rs)

### Workspace / Task / Session 模型

Codeg 已不是简单 chat aggregator。`WorkTask` 具有明确状态机：

```text
todo → queued → preparing → running ↔ awaiting_input
     → review → merging → done
     ↘ failed / canceled
```

它保存 folder/project、JSON config、run sequence、worktree folder、base SHA/branch、merge state、verdict、summary、diff stats、preflight、timestamps，并通过 append-only `work_task_event` 记录 `created`、`status_changed`、`config_effective`、`agent_progress`、`resume_fallback`、`user_action`、`diff_stat` 等。

这意味着 Codeg 已拥有：

- 稳定 task identity；
- lifecycle；
- effective config event；
- worktree/merge/diff relation；
- recovery/fallback evidence。

### Main agent / delegated agent / harness abstraction

Codeg 通过 ACP registry 支持多个 agent，并允许 main agent 委派异构 child agent。`Conversation` 保存 `agent_type`、external/native ID、`parent_id`、tool/delegation call；delegation request 直接指定 `AgentType`、task、working directory，child conversation 记录其 agent type。

但其 ownership 结构仍是：

```text
WorkTask
└── main Conversation (one conversation_id, concrete agent_type)
    └── delegated child Conversation(s), concrete AgentType
```

`WorkTaskConfig` 直接包含 `agent_type`，folder settings 也有 `default_agent_type`。因此：

- main harness 是 task config 的一部分；
- child harness 是 main conversation delegation graph 的一部分；
- 没有 `Role → abstract Profile → Runtime`；
- 没有在保持 definition 不变时迁移 main harness 的通用语义；
- heterogeneous agents 可参与 same task，但 authority 仍明显偏向 main session/delegation。

### Persistence / recovery / artifacts

Codeg 在这一点很强：WorkTask、event log、conversation tree、worktree、diff、merge、summary、preflight 都是持久化关系。它已经实现了大量 Agent-Box 不应重复开发的 Level 2 基础设施。

### 判定

**Codeg 是强 Level 2 Multi-Harness Orchestrator，不是完整 Work-Above-Harness Runtime。** 它比“session aggregator”更强，但 provider selection 仍直接进入 task/conversation config，异构子 agent 仍是 main agent 的 delegated children。

对 Agent-Box 的含义：如果目标主要是“统一桌面 UI + 多 ACP agent + task/worktree/history”，应直接采用或贡献 Codeg；只有抽象 role/profile replacement 和跨 main-harness continuity 是明显增量。

---

## Native Harness Analysis

### Claude Code

[Claude Code subagents](https://code.claude.com/docs/en/sub-agents) 在主 session 内运行独立 context；[Agent Teams](https://code.claude.com/docs/en/agent-teams) 由一个 team lead session 创建其他 Claude Code session、shared task list 和 mailbox。官方文档也明确其 experimental，并列出 session resume、shutdown、permission 等限制。

如果 Claude 主 agent 调用 Codex CLI：

```text
Claude session (owner)
└── tool call / shell process
    └── Codex process/session
```

Work identity、用户对话、计划、重试与最终综合仍由 Claude session 或 Claude team lead 拥有。Codex 是 tool/subordinate；即使它有自己的 thread ID，也只是 Claude 执行图中的嵌套资源。

这与目标模型有本质区别：

```text
Work (owner)
├── Claude session (peer execution reference)
└── Codex thread (peer execution reference)
```

后者可在 Claude 崩溃、替换或删除后继续拥有身份；前者通常不能。

### Codex

[Codex app-server](https://learn.chatgpt.com/docs/app-server) 把 thread 作为目标和状态的根，支持 start/resume/fork/read、sandbox、approval、MCP 与 event stream；[Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) 仍由 main thread 汇总和拥有。

如果 Codex 通过 shell/MCP 调用其他 agent，默认结构仍是：

```text
Codex main thread (owner)
└── tool/MCP call
    └── external agent
```

反过来，如果 [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) workflow 把 Codex CLI 暴露为 MCP tool，则 SDK run/trace 可以成为 owner，Codex 退化为执行工具。但 SDK 不会自动获得 Codex native thread、approval UX、worktree、permissions 与 resume 的统一语义；这些仍需 adapter。

### OpenCode

[OpenCode agents](https://opencode.ai/docs/agents) 支持 primary/subagent、不同 model provider、tools 与 permissions；[headless server](https://opencode.ai/docs/server) 提供 session CRUD/status/children/fork/abort/diff/permission API。

但 OpenCode 内部从 Anthropic model 切到 OpenAI model 是 **model portability**：

- harness loop 不变；
- session schema 不变；
- tool implementation 不变；
- permissions/approval 不变；
- workspace/context assembly 不变。

从 OpenCode 切到 Claude Code/Codex 是 **harness portability**：上述所有控制面都可能变化。前者不能证明后者。

### Roo Code、Cline、Hermes、Continue、Goose

- [Roo Code Boomerang Tasks](https://github.com/RooCodeInc/Roo-Code) 用 orchestrator mode 创建 specialist mode subtasks并回收结果，是同一 Roo harness 内的 role/workflow orchestration，属于同构 L2。
- [Cline Agent Teams](https://docs.cline.bot/cli/agent-teams) 持久化 shared task board、mailbox、mission log，并可跨 session resume；但当前只适用于 Cline SDK/CLI/Kanban，执行者仍是 Cline runtime，属于强同构 L2。
- [Hermes sessions](https://hermes-agent.nousresearch.com/docs/user-guide/sessions) 保存完整消息、model/config、system prompt snapshot、parent lineage；delegate/subagent 仍是 Hermes 所有的子 session。
- [Continue Agent mode](https://docs.continue.dev/features/agent/how-it-works) 统一 model/tool loop，并提供 model capability detection/system-message tool fallback；这是 model/provider portability，不是外部 harness portability。
- [Goose architecture](https://github.com/aaif-goose/goose/blob/main/documentation/docs/goose-architecture/goose-architecture.md) 已可把 Claude Code/Codex ACP agent 当 provider，这是重要跨界趋势。但当前 [provider configuration](https://github.com/aaif-goose/goose/blob/main/documentation/docs/guides/config-files.md) 仍指出 active sessions 使用启动时 provider instance；“用另一个 provider 恢复旧 session”直到 2026 年仍是显式问题。Goose 接近 L2.5：上层 Goose session 高于 provider，但缺 Work Definition、角色绑定、多 provider 同一 Work graph 和完整迁移契约。

### Native harness 结论

原生 team/subagent 功能可以满足大量实际需求，因此是强 Kill pressure；但它们通常是：

> `Harness owns Work; other agents are children/tools`

而不是：

> `Work owns multiple peer harness sessions`

---

## IDE Host Analysis

### Zed

[Zed external agents](https://zed.dev/docs/ai/external-agents) 通过 ACP 托管 Claude Code、Codex、OpenCode 等。Zed 拥有 editor UI、project/workspace、thread presentation 和 client-side file/terminal integration；外部 agent 拥有 runtime、auth、model、tools、native config。官方边界还明确说明 Zed profiles 不自动适用于 external agents，权限和 config 因 agent 而异。

结论：**Level 1 Workspace Aggregator**。它是优秀的多 harness host，但每个 thread 仍基本独立，没有跨 agent Work identity、workflow role binding 或 unified lifecycle。

### JetBrains AI Agents

[JetBrains AI Agents](https://www.jetbrains.com/help/ai-assistant/agents.html) 可在 IDE 内运行 Junie、Claude、Codex、Copilot 与 custom ACP agent，共享 project UI，并可配置 instructions/MCP。公开模型仍是“选择一个 agent，开始一个 chat/session”；没有证据表明多个 harness 共同属于一个稳定 Work run，或存在 provider-neutral role binding。

结论：**Level 1**。

### VS Code：最强 IDE 反例

VS Code 2026 年的架构已显著超出“多个聊天窗口”：

- [Sessions](https://code.visualstudio.com/docs/agents/concepts/sessions)：官方把 session 称为 unit of work；一个 session 可有多个 chat，共享 workspace/code isolation；支持 parallel、fork、checkpoint/rollback 与 handoff。
- [Agent Host](https://code.visualstudio.com/docs/agents/concepts/agent-host)：Agent Host 独立于 client 拥有 sessions；editor 关闭后 session 可继续；host 是 authoritative state/source of truth。
- [Agent harnesses](https://code.visualstudio.com/docs/agents/concepts/agent-harnesses)：明确区分 harness、execution environment、agent role、language model；可选 Local/Copilot/Claude/Codex session target。
- [Agent Host Protocol](https://github.com/microsoft/agent-host-protocol)：AHP 位于 ACP 之上，解决多 client、共享 session 与 host-owned state；[AHP 与 ACP 的关系](https://github.com/microsoft/agent-host-protocol/blob/main/docs/guide/ahp-and-acp.md) 明确指出 ACP 通常由 agent 拥有 session state，而 AHP 由 host 统一协调。
- [Custom agents](https://code.visualstudio.com/docs/agent-customization/custom-agents)：以 `.agent.md` 定义角色、instructions、tools 和 handoff。

这已经满足多个 Level 3 核心条件：上层稳定 session、harness adapters、handoff、host-owned lifecycle、workspace、multiple chats、provider-specific target。

但仍有不足：

1. 顶层 `session` 的语义仍接近 conversation/workspace unit，没有公开的 Work Definition/Instance 分离；
2. custom agent 对不同 harness 的支持与映射不一致；
3. provider-specific config、permissions、MCP、native resume 仍由 adapter/harness 决定；
4. 没有通用 effective configuration/capability compatibility snapshot；
5. artifacts/evidence 主要围绕 changes/session UI，不是通用 execution provenance ledger；
6. Agent Host/AHP 仍在 active development，Agents window 等能力带 preview/experimental 边界。

结论：**Level 3 preview，未成熟。** 对 IDE 场景，它是比自建 Core 更强的默认起点。

### IDE 是否就是 Work-above-Harness？

一般不是；VS Code Agent Host 是例外趋势。IDE 天然拥有 Project + UI + filesystem，但只有当它还拥有跨 agent 的稳定 session、handoff、lifecycle 与 authority 时才接近 Work owner。Zed/JetBrains 目前主要是多个 agent thread 的宿主；VS Code 已开始成为 session control plane。

---

## Agent Framework Analysis

### 为什么不能简单说“直接用 LangGraph 就解决”

普通 agent framework 的 `Agent` 通常是框架内对象：框架拥有 model calls、tool loop、state 和 checkpoints。Claude Code/Codex 是外部完整 harness，自带：

- native session/thread；
- native tool loop 与 context compaction；
- project instruction discovery；
- approval UX 与 permission modes；
- sandbox/worktree behavior；
- native MCP、skills、memory；
- provider auth/subscription；
- resume/fork/session events。

把 Claude SDK model call 放进 LangGraph node 并没有保留 Claude Code 的上述语义。把 Claude Code CLI/ACP 放进 node 则需要 adapter 处理启动、stream、cancel、approval、native ID、resume、worktree、idempotency 与 recovery。

### 框架逐项判断

| Framework | 已拥有 | 与完整外部 harness 的缺口 | 判定 |
|---|---|---|---|
| [LangGraph](https://docs.langchain.com/oss/python/langgraph/persistence) | thread ID、state、checkpoint、history、replay、fault tolerance、HITL | external native session/approval/worktree/capability adapter | 极强 L2 substrate；可承载 Work ID |
| [AutoGen](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/graph-flow.html) | agents/teams/GraphFlow、save/load state | GraphFlow 仍 experimental；agents 多为框架内 loop | L2 framework |
| [CrewAI](https://docs.crewai.com/) | Crew、Flow、Task、process、state/persistence/resume | 外部 coding harness 不是一等 execution provider | L2 framework |
| [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) | Runner、handoffs、sessions、run state、tracing、group/trace ID、Temporal integration | Codex CLI/native thread 需 MCP/app-server adapter；仅 OpenAI 官方域证据 | L2 framework |
| [Semantic Kernel](https://learn.microsoft.com/en-us/semantic-kernel/frameworks/agent/agent-architecture) | Agent、AgentThread、orchestration、provider-specific thread types | stateful agent 需匹配 thread type，本身证明 native state 不可直接互换 | L2 framework |
| [PydanticAI](https://pydantic.dev/docs/ai/capabilities/durable_execution/overview/) | typed agent、graph、MCP、Temporal/DBOS/Prefect/Restate durable execution | durable agent loop 不等于 durable external harness session | L2 substrate，durability 很强 |
| [Mastra](https://mastra.ai/en/reference/workflows/snapshots) | workflow run、snapshot、suspend/resume、storage | external harness adapter/capability semantics | L2 framework |
| [Agno](https://docs.agno.com/sessions/workflow-sessions) | workflow/session/run IDs、step results、state、history、pause/resume | agents/teams/functions 在 Agno runtime 内；无 native harness graph | L2 framework |

### 是否只需一个 LangGraph wrapper 就能解决 90%？

按代码量，可能；按语义，不一定。

LangGraph 已解决的 90% 是：状态机、checkpoint、replay、interrupt、thread history。剩余 10% 恰好是产品风险最高的部分：

- 一次 node retry 是否会重复启动/修改代码？
- native session ID 在什么时候可安全 resume？
- provider replacement 时传递 conversation、summary、git state 还是 task ledger？
- read-only intent 在不同 harness 中是否真的 read-only？
- approval 正在等待时，workflow crash/recover 怎么处理？
- worktree 与 harness cwd/native config 如何一致？

因此 **LangGraph wrapper 是优先验证的替代方案，而不是自动成立的完整答案**。如果一个短 spike 能以少量 adapter 代码可靠通过这些测试，Agent-Box Core 应停止。

---

## Workflow Runtime Analysis

### Temporal

[Temporal Workflow Execution](https://docs.temporal.io/workflow-execution) 已是 durable、recoverable、可运行数秒到数年的一级执行实体；Workflow Definition 与 Workflow Execution 明确分离。其 [Workflow ID / Run ID](https://docs.temporal.io/workflow-execution/workflowid-runid) 还区分稳定的业务过程 ID 与每次具体 run，event history、retry、continue-as-new、pause/cancel/terminate 等均成熟。

这与候选 Work Core 高度重叠：

```text
Agent-Box Work ID        ≈ Temporal Workflow ID
Work attempt             ≈ Temporal Run ID / execution chain
Harness invocation       ≈ Activity / child workflow
Work lifecycle/history   ≈ Workflow state / Event History
```

但 harness CLI 是有副作用的长活动，不能直接当确定性 workflow code；需要 activity heartbeat、idempotency key、external session correlation 和 cancellation adapter。

### LangGraph durable execution

LangGraph 用 `thread_id` 作为 checkpoint key，保存每个 super-step 的 state，支持 history/replay/fault tolerance/HITL。对本地个人工具，它比 Temporal 轻。缺点是业务 identity、artifact/provenance schema 和 external harness exactly-once 语义仍由应用定义。

### Prefect

[Prefect flow/task run events](https://docs.prefect.io/v3/api-ref/events/index) 提供 run state transitions、worker/work-pool/infrastructure correlation；[Artifacts](https://docs.prefect.io/v3/concepts/artifacts) 可关联 flow/task run 和版本。其 work pool/worker 把 execution environment 与 flow run 解耦。它能成为 Work runtime，但更偏数据/automation flow，不懂 coding session。

### Dagster

[Dagster](https://docs.dagster.io/) 的核心是 asset/job/run、event log、resource 和 executor；它擅长数据资产 provenance，而非交互式长会话、approval 与 native coding-agent resume。若成果主要是可重建 asset，它很合适；若 Work 是交互式 coding mission，适配成本较高。

### Dagger

[Dagger](https://docs.dagger.io/) 以可组合函数、容器化环境、cache 和 pipeline execution 为中心，适合可重复 build/test environment provider。它不是长生命周期 human-in-the-loop Work owner，也不拥有 native agent session graph。

### 三种 ownership 方案比较

| 方案 | A. Agent-Box 自有 Work | B. Work 映射为 Temporal/LangGraph Run | C. 外部 runtime 拥有 Work，Agent-Box 只供 adapters |
|---|---|---|---|
| Identity/lifecycle | 全部自建 | 复用稳定 ID、状态、恢复 | 完全复用外部 authority |
| 自由度 | 最高 | 高；受 runtime semantics 约束 | 最低 |
| 开发/维护 | 最高 | 中 | 最低 |
| Durable correctness | 风险最高 | Temporal 高；LangGraph 中高 | 由宿主承担 |
| 本地 power-user UX | 可最贴合 | LangGraph 较贴合；Temporal 偏重 | 取决于 Kandev/VS Code |
| 多 harness adapter | 仍需 | 仍需 | 仍需，但无需再造 Core |
| ID 重复风险 | 高 | 可让 workflow ID 即 Work ID | 最低 |
| 建议 | 当前不选 | 作为 fallback/spike | **默认优先** |

### 判断

**Work Instance Core 在通用 lifecycle 层面确实就是 workflow runtime + domain schema + coding-agent adapters。** 新价值不能来自重新实现 run DB/state machine；只能来自 coding-specific ownership/compatibility schema。优先顺序应是 C → B → A。

---

## Traditional Architecture Analogy

“Work above execution backend” 不是新理论；它是 control plane / desired state / allocation / driver 分离在 coding agents 上的重演。

| 模式 | 对应关系 | 可借鉴 | 错误类比 |
|---|---|---|---|
| Kubernetes Job/Pod | Job/Workload 管 Pod；Pod 再由 runtime 执行 | declarative spec、owner reference、status、controller reconciliation、finalizer | agent provider 有语义差异，不是 OCI runtime 那样的窄执行 ABI |
| Nomad Job/Allocation/Driver | Job desired state → evaluation → allocation → task driver | 最接近：stable job、concrete allocation、pluggable driver、capability/constraint placement | Nomad task config 仍含 driver-specific block；driver replacement不保证应用语义相同 |
| Terraform graph/provider/state | config + state 高于 provider API | provider schema、plan、state lineage、version lock、drift detection | provider 资源类型并非自由互换；恰好提醒 portability 不应虚构 |
| CI/CD workflow/job/runner | workflow run 高于具体 runner/process | run ID、attempt、artifact、log、approval/environment | job steps通常确定且短；agent loop交互性和非确定性更强 |
| IDE Workspace | workspace 高于多个 tools/sessions | project authority、file diff、interaction、approval | workspace 不是 objective/run；多个 chats 不自动成为同一 Work |
| OS process/job control | job/process group 高于 child processes | parent/child、signals、exit status、cleanup | 不表达 objective、artifact 或 provider-neutral semantics |
| Actor system | stable actor identity/location transparency | identity 与当前 process/location 分离、mailbox、supervision | actor interface稳定；不同 harness 行为契约远不稳定 |
| DI composition root | abstract role/interface → concrete implementation | resolution、scope、effective graph、validation | 运行中迁移 state 不是 DI 的职责 |
| Service mesh control plane | policy/identity/telemetry 与 workload process 分离 | intent vs enforcement、observed state、mTLS-like identity | mesh不拥有业务 workflow/objective |
| Build system | target graph高于 executor/cache | content-addressed artifacts、incrementality、evidence | LLM agent steps通常不纯、不可可靠缓存 |
| Nomad Allocation | 一次具体 placement 对应一次 harness attempt | allocation ID 与 job ID分离、reschedule chain | allocation不等于跨 attempt Work |
| Docker Compose Project | project name关联 services/networks/volumes | 简单本地 grouping、cleanup scope | 只有 namespace/grouping，没有 workflow/history |

### Kubernetes 类比有多相似？

```text
PodSpec / JobSpec       Work Definition
      ↓ resolve             ↓ resolve
Pod / Job instance      Work Instance
      ↓ CRI/runtime          ↓ harness adapter
container process       native agent session
```

相似之处是 owner reference、desired/effective state、runtime child、status 和 cleanup。最大差异是：容器 runtime 有相对严格的 OCI/CRI 契约，而 coding harness 的 context、permission、tool、memory、resume、approval 均不是等价 ABI。因此真正需要借鉴的不是 Kubernetes 对象数量，而是：

- spec/status 分离；
- declared/observed/effective configuration；
- owner references 与 garbage collection；
- capability/constraint scheduling；
- fail-closed validation；
- attempt/allocation lineage。

---

## Provider Portability Analysis

### 三层解耦是否已存在？

目标：

```text
Role → abstract Profile → Runtime Provider
```

现状：

- **Kandev Office**：最明确命中。stable Office agent/profile identity 绑定 provider-tier execution profile；routing 选择 Claude/Codex concrete profile。
- **VS Code**：custom agent/role 与 session target/harness 有一定分离，但跨 harness 支持不完全一致。
- **Continue**：model role → model/provider，属于 model portability，不是 harness portability。
- **Goose**：Goose session → provider（包括 ACP harness），但缺一个 Work 内的 logical roles/profile graph。
- **Codeg/Vibe**：task/workspace 可选择 agent，但主要直接绑定 concrete agent type。
- **Agent frameworks**：role/agent/runtime 可抽象，但 runtime 通常是框架内 model/tool loop，不是完整外部 harness。

结论：**三层模式已有局部实现，Kandev Office 最接近；还没有普适 schema/standard。**

### 为什么替换一个字段不等于 portability

| 维度 | Claude Code | Codex | OpenCode/其他 | 替换风险 |
|---|---|---|---|---|
| Permission semantics | 自身 modes/settings/approval | sandbox + approval policy | 各自 allow/ask/deny | 同名 `read-only` 未必同边界 |
| MCP | native config/继承规则 | native MCP/app-server config | ACP/MCP 传递方式各异 | server availability 与 auth 漂移 |
| Skills/instructions | CLAUDE.md、skills、subagent fields | AGENTS/config/skills | agent-specific files | context 丢失或重复注入 |
| Native context | Claude transcript/compaction | Codex thread/rollout | 自有 session DB | 无统一可迁移格式 |
| Worktree | native flags/agent team behavior | app/CLI-specific cwd/sandbox | client-managed 或自有 | cwd 与 isolation 不一致 |
| Resume | Claude session token/limitations | thread ID/resume/fork | ACP `session/load` 可选 | token 只对原 provider 有效 |
| Output/events | Claude stream/events | app-server events | ACP subset/custom updates | evidence 归一化有损 |
| Headless | CLI/SDK 语义 | `codex exec`/app-server | server/CLI 差异 | approval 阻塞、TTY 依赖 |
| Sandbox | harness/OS组合 | workspace-write/read-only等 | client/harness自定义 | intent 可能被弱化 |
| Capability gaps | team/subagent/tool特性 | thread/subagent/app-server | modes/plugins/extensions | workflow 可能无法替换 |

### 是否存在成熟 capability negotiation / compatibility layer？

[ACP](https://agentclientprotocol.com/) 已经协商 `session/load`、filesystem、terminal、prompt content、auth 等 transport/session capabilities，并标准化 permission request 与 tool-call updates。[MCP](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle) 也有连接级 capability negotiation。

但它们尚未表达完整的上层兼容语义，例如：

- “workspace-write 但禁止 project 外路径”是否被强制；
- “支持 skills”具体读取哪些 scope 与 precedence；
- native memory/compaction 能否禁用或快照；
- worktree isolation 是否与主 workspace 一致；
- session load 是恢复原生状态还是仅重放消息；
- approval decision 是否可持久恢复；
- agent 能否给出可验证的 effective config；
- provider replacement 后哪些 invariants 必须保持。

因此当前只有 **protocol capability negotiation**，没有成熟的 **Work portability compatibility contract**。

### 可接受的 portability 定义

“architect-profile 从 Claude 切到 OpenCode”只有在以下条件同时成立时才算成功：

1. Work Definition、role、environment binding、permission intent 不变；
2. resolver 产出新的 effective execution snapshot；
3. capability check 无缺口，或缺口被用户显式接受；
4. 新 native session 与同一 Work/role/attempt 关联；
5. continuation contract 明确选择 durable task/repo/artifacts，而不伪装成 native chat migration；
6. history 能解释前后 provider、配置、降级、approval 与结果。

---

## Work Identity Analysis

### 为什么可能需要独立 Work ID

Claude session ID、Codex thread ID、LangGraph run/thread ID、git worktree 与 Slack thread 分别只覆盖一个局部边界：

```text
Issue/Objective
└── Work ID
    ├── Workflow run/thread
    ├── Claude native session A
    ├── Codex native thread B
    ├── worktree / base SHA / final commit
    ├── approvals / permission intent
    ├── artifacts / test evidence
    └── environment / effective config snapshots
```

独立 Work ID 的真实价值：

- correlation：把不同 provider 的事件和成果放在一条因果链；
- cross-harness continuation：原 session 不可恢复时仍有稳定 owner；
- lifecycle：stop/resume/inspect/cleanup 针对目标而非进程；
- audit/provenance：知道谁、何时、以何权限和配置产生 patch；
- artifact ownership：patch/test/report 不依附某段聊天；
- reproducibility：保存 project revision、environment 和 effective resolution；
- history：任务目标与结果高于 conversation turns。

### 为什么可能不需要

- Temporal Workflow ID、LangGraph thread ID、Kandev Task ID、VS Code Agent Host session ID 已可成为 Work ID；
- GitHub issue/Linear task 可能已是用户真正关心的稳定目标；
- 单 harness、短时、一次性任务不需要跨 provider correlation；
- provider migration 若很少发生，额外 ID/schema/UI 是持续认知成本；
- 如果 Core 只存外键和 JSON metadata，它没有独立行为，只是 metadata database；
- 新 ID 还会制造映射问题：issue ↔ work ↔ workflow run ↔ session ↔ worktree。

### 最终判断

**需要的是稳定 business-process identity，不一定需要一个新的 Agent-Box UUID。**

优先复用顺序：

1. 已有 Kandev Task / VS Code Agent Host session；
2. Temporal Workflow ID / LangGraph thread ID；
3. 外部 issue ID（若生命周期一致）；
4. 只有上述均不能表达 multi-session/multi-attempt ownership 时，才新增 Agent-Box Work ID。

一个独立 ID 的进入门槛应是：至少关联两个 execution attempts 或两个不同资源域，并驱动 resume/cleanup/audit 中至少一种实际行为。否则应 Kill。

---

## Work History vs Conversation History

### 区分有实际价值

Conversation history：

```text
Claude session A
├── user/assistant messages
├── tool calls/results
└── native compaction/memory
```

Work history：

```text
Work #42
├── objective / definition version
├── resolution snapshot
├── planner: Claude session A
├── executor: Codex thread B
├── route/failure/approval events
├── base SHA / worktree / patch / commit
├── test and review evidence
├── environment snapshot
└── final disposition
```

后者对 audit、debug、handoff、恢复与比较 provider 有明确价值；它不应复制全部 conversation，而应引用/摘要 native transcript 并保存跨系统事实。

### 已有相似实现

| 系统 | 类似结构 | 强项 | 缺口 |
|---|---|---|---|
| Kandev | Task/Run/RouteAttempt/TaskSession/doc revisions/review | 最接近 coding Work ledger | Office 稳定性与通用 schema不足 |
| Codeg | WorkTask + append-only WorkTaskEvent + conversation tree + worktree/diff | 强本地 task ledger | main agent 直接绑定 |
| Cline Teams | task board + mailbox + mission log | 跨 session team history | Cline-only |
| Temporal | Workflow Event History / execution chain | 最成熟因果与恢复历史 | 不懂 code artifacts/native sessions |
| Prefect | flow/task events + artifacts | run/artifact关联与 UI | coding语义需自定义 |
| Agno | workflow session存完整 runs/step results，区别于 agent conversation | 明确区分 run history 与 chat history | framework内 agent |
| OpenAI Agents SDK | traces/spans/group ID/session | observability/correlation | 外部 harness native state需 adapter |
| Hermes | session lineage/export manifest/hash | transcript lineage和可验证导出 | 仍是conversation-centric |
| VS Code Agent Host | host session、多 chat、workspace changes、handoff | IDE内统一 session authority | 通用 artifact/provenance ledger不足 |

### 设计约束结论

Work history 有价值，但**不应成为另一份统一 conversation database**。正确最小内容是：identity、causal links、effective snapshots、state transitions、artifact/evidence refs、native session refs。全文 transcript 留给 native harness 或专门存储。

---

## Alternative Implementations

以下方案均不要求先写 Agent-Box Core。

### Alternative A — 直接使用/贡献 Kandev

```text
Kandev Task/Run/Office routing
├── Claude/Codex/OpenCode profiles
├── task environment/worktree
├── workflow/docs/review
└── route attempts/native sessions
```

| 维度 | 评估 |
|---|---|
| 实现复杂度 | **低–中**：配置、少量 adapter/上游贡献 |
| 用户操作复杂度 | 中：需接受 Kandev 产品模型 |
| Persistence | 强 |
| Portability | Office 路径强；generic workflow 中等 |
| Same-work cross-harness | 已有 fallback/route semantics；并行角色需验证 |
| Maintenance | 最低之一；跟随上游 |
| 缺失语义 | 通用 Work Definition、capability contract、Office 稳定性 |

**推荐优先级：1。** 如果它满足 70–80% 体验，应停止自建 Core并贡献上游。

### Alternative B — VS Code Agent Host/AHP + ACP adapters

```text
VS Code Agent Host session
├── custom role / handoff
├── Claude adapter
├── Codex adapter
└── workspace/worktree/UI
```

| 维度 | 评估 |
|---|---|
| 实现复杂度 | 低–中（以 extension/adapter 为主） |
| 用户操作复杂度 | 低，适合 IDE 用户 |
| Persistence | 中高，由 Agent Host 负责 |
| Portability | handoff 强；配置/permission 等价性不足 |
| Same-work cross-harness | 支持 session handoff，多 chat；复杂 workflow 尚弱 |
| Maintenance | 中，AHP 正在快速变化 |
| 缺失语义 | versioned definition、provenance/capability contract |

**推荐优先级：2。** IDE-first 场景优先于自建 TUI/Core。

### Alternative C — LangGraph + ACP/app-server adapters

```text
LangGraph thread_id = Work ID
├── role nodes
├── Claude ACP session adapter
├── Codex app-server/ACP adapter
├── OpenCode ACP adapter
└── artifact/worktree refs in graph state
```

| 维度 | 评估 |
|---|---|
| 实现复杂度 | 中 |
| 用户操作复杂度 | 中；需自建薄 UI/CLI |
| Persistence | 强，checkpoint/replay/HITL |
| Portability | 取决于 adapter/conformance |
| Same-work cross-harness | 可表达 |
| Maintenance | 中；避免自建状态机 |
| 缺失语义 | external side-effect idempotency、permission/continuation schema |

若 spike 的 glue 很少且通过恢复测试，**直接采用，Kill 独立 Core**。

### Alternative D — Temporal + ACP/MCP + thin launcher

```text
Temporal Workflow ID = Work ID
├── activities: start/prompt/cancel/resume harness
├── child workflows: roles
└── external artifact/environment providers
```

| 维度 | 评估 |
|---|---|
| 实现复杂度 | 高 |
| 用户操作复杂度 | 高，需 server/worker |
| Persistence | 最强 |
| Portability | adapter决定 |
| Same-work cross-harness | 强 |
| Maintenance | 中高，但 durability 不自建 |
| 缺失语义 | coding-specific adapter、interactive streaming bridge |

适合服务化、长运行、强恢复；对个人本地工具可能过重。

### Alternative E — Goose / native teams

| 维度 | Goose ACP provider | Claude/Cline/Roo native team |
|---|---|---|
| 实现复杂度 | 很低 | 很低 |
| 用户复杂度 | 低 | 最低 |
| Persistence | 中 | Cline强、Claude限制较多 |
| Portability | provider可换但 Work graph弱 | 无跨 harness |
| 维护 | 低 | 最低 |
| 适合 | 单 session 选不同 harness/provider | 同构多 agent 高频任务 |

如果真实需求主要是“偶尔换 agent”或“同一 harness 多角色”，这是最诚实的选择，也直接削弱新 Core 的必要性。

---

## Ownership Analysis

### 标记说明

- **Own**：权威身份/状态；
- **Select/Ref**：选择或保存引用/快照，不执行；
- **Execute/Enforce**：实施行为；
- **Present**：展示/交互；
- **Optional**：可由此层拥有，但不构成必要性。

| Concern | Harness | Workflow Runtime | IDE | External Provider | Work Core | Why |
|---|---|---|---|---|---|---|
| Work identity | child ref | 可 **Own** | AHP 可 **Own** | no | **Own 或映射外部 owner** | 必须高于 native session；避免重复 ID |
| Role | execute/materialize | workflow node | present/edit | no | **Own definition binding** | 角色是逻辑职责，不是实现 |
| Profile | consume | resolve可选 | edit/present | store可选 | **Select/Ref + version** | 保持 role 与 concrete runtime 分离 |
| Harness selection | selected | route | user choice | registry | **Own effective resolution** | 必须解释实际用了什么 |
| Native session | **Own native state** | child ref | display/control | adapter may proxy | **Ref/correlate only** | 不能伪造或复制 native authority |
| Workflow state | no | **Own** | present | no | Ref；除非无外部 runtime | 不应重写 durable engine |
| Task state | subtask可选 | Own/coordinate | present | issue tracker may Own | **Own cross-provider task relation** | 只拥有 Work 内状态或映射外部 task |
| Project | consume | ref | often **Own UI context** | Git forge may Own | **Ref + revision snapshot** | 项目长期存在，不属于单 Work |
| Workspace/worktree | operate in | allocate/ref | create/manage | env provider may Own | **Select/Ref + base/final SHA** | storage/lifecycle可外置，因果关联需保留 |
| Environment | consume | provision via activity | local context | **Own/Provision** | **Select/Ref + snapshot** | Work 不应自建 container/SSH/store |
| Permission intent | interpret | gate | collect/display | policy service可 Own | **Own resolved intent** | 跨 provider 的用户意图需稳定 |
| Permission enforcement | **Enforce 部分** | gate/retry | client FS/terminal可 enforce | sandbox/policy **Enforce** | Verify/evidence only | metadata 不能声称完成安全隔离 |
| Secrets | consume handles | ref | credential UI | vault/keychain **Own** | **Never own values**；只 ref | 降低泄漏与生命周期责任 |
| Tools/MCP | **Own native inventory/use** | invoke adapter | client capabilities | MCP servers **Own** | **Select/Ref + effective inventory snapshot** | 需审计，但不应实现所有工具 |
| Artifacts | produce | correlate | preview | artifact store **Own blob** | **Own index/causal relation** | Work history需要跨 session 结果 |
| Interaction UI | stream | event source | **Own/Present** | Slack/web transport | Select surface/ref | Core 不需拥有 UI |
| Human approval | request | suspend/wait | **Present/collect** | policy service可 decide | **Correlate intent/decision** | 决策与具体 enforcement 分离 |
| Logs | native logs | event history | present | log store | **Ref + normalized key events** | 不要复制所有 raw logs |
| Execution evidence | emit | collect | present | test/CI stores | **Own normalized ledger** | 这是跨 provider可审计性的核心 |
| Resume | native resume | **Own workflow resume** | session reconnect | environment restore | **Own policy/correlation，delegate mechanism** | 决定继续哪个 attempt/何时新 session |
| Cleanup | child shutdown | orchestrate | user trigger | resource provider executes | **Own desired cleanup/finalizers** | 需按 Work owner refs清理，不自己执行全部 |
| History | conversation | workflow event history | session view | external task/audit store | **Own cross-system index** | Work history高于单 conversation |

### 真正必须由 Work-above-Harness 层拥有的最小集合

在已有 workflow/IDE host 可复用时，只剩：

1. 稳定 Work/business identity（或明确映射）；
2. logical role/profile binding 与 effective resolution snapshot；
3. native sessions/provider attempts 的 correlation graph；
4. permission/environment intent 的引用与实际执行证据；
5. artifact/evidence 的因果索引；
6. cross-provider continuation/resume decision。

这不是空集合，但明显小于一个完整 orchestration platform。若实现最终只剩第 1、3 项的外键表，价值不足，应 Kill。

---

## Competitive Matrix

> “Multi-Harness”表示可接多个完整 coding harness，而非只接多个模型。`部分`表示通过 ACP/CLI/MCP 可接，但不是统一第一类 domain provider。Level 是本报告的严格分类，不是项目自称。

| System | Top-level Object | Multi-Harness | Stable Work ID | Multi-Harness Same Work | Provider Replaceable | Lifecycle | Artifact Correlation | Environment | Workflow | Overlap |
|---|---|---:|---:|---:|---:|---|---|---|---|---|
| [Kandev](https://github.com/kdlbs/kandev) | Task + Run/Session | 是 | 是 | Office 是 | Office 是，普通 flow 部分 | 强 | 强：worktree/docs/review | local/worktree/Docker/SSH等 | 是 | **L3 preview；最高** |
| [VS Code Agent Host/AHP](https://code.visualstudio.com/docs/agents/concepts/agent-host) | Session + chats | 是 | 是 | handoff/多 chat | 部分 | 强，host-owned | changes/checkpoints，中强 | local/background/cloud/worktree | handoff/roles，部分 | **L3 preview；很高** |
| [Codeg](https://github.com/xintaofei/codeg) | WorkTask | 是 | 是 | 是，main+delegates | 弱，直接 agent_type | 强状态机/event | 强：diff/worktree/merge | local/remote workspace | delegation | **L2；高** |
| [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) | Task attempt / Workspace | 是 | 是 | workspace内多 sessions | 选择可换，抽象弱 | 中强 | worktree/diff | workspace/worktree | task/session flow | **L2；高** |
| [Goose](https://github.com/aaif-goose/goose) | Session/Recipe | 是，ACP providers | 是 | 通常单 active provider | runtime支持replace但resume不完整 | 中 | session/tool outputs | local/MCP extensions | recipes/subagents | **L2.5；高** |
| [Agent Monitor](https://github.com/jiweiyeah/AgentMonitor) | observed Session | 是，只监控 | native IDs | 否 | 否 | 观察型 | 弱 | 无 | 无 | **L1；低** |
| [Zed external agents](https://zed.dev/docs/ai/external-agents) | Thread | 是 | per thread | 否 | 新 thread可选 | per-thread | diff/UI | IDE workspace | 无统一 flow | **L1；中** |
| [JetBrains AI Agents](https://www.jetbrains.com/help/ai-assistant/agents.html) | Agent chat | 是 | per chat | 未证实 | 新 chat可选 | per-chat | IDE changes | IDE project | 无统一 flow | **L1；中** |
| [Claude Code Teams](https://code.claude.com/docs/en/agent-teams) | Lead session/team | 否，Claude-only | team/session ID | 否（同构多 agent） | 否 | 实验性，中 | shared task/git | cwd/worktree | team/task list | **L2 homogeneous；中** |
| [Codex app-server/subagents](https://learn.chatgpt.com/docs/app-server) | Thread | 否，Codex-owned | thread ID | 外部 agent只是 tool | 否 | 强 native | diff/tool events | sandbox/workspace | subagents | **L1/2 native；中** |
| [OpenCode](https://opencode.ai/docs/server) | Session | 否；多 model provider | session ID | 同 harness children | model可换，harness不可换 | 强 native | diff/messages | cwd/server | primary/subagents | **L1/2；中** |
| [Cline Teams](https://docs.cline.bot/cli/agent-teams) | Team/Task | 否，Cline-only | team name/state | 否（同构） | 否 | 强：可跨 session | mission log/task board | cwd/Kanban | coordinator/team | **L2 homogeneous；中** |
| [Roo Code](https://github.com/RooCodeInc/Roo-Code) | Task/Mode | 否，Roo-only | task/session | 否（modes） | model可换 | 中 | task results/diff | IDE workspace | Boomerang tasks | **L2 homogeneous；中** |
| [Hermes](https://hermes-agent.nousresearch.com/docs/user-guide/sessions) | Session | 否，Hermes-only | session + lineage | 否（delegates） | model/provider可换 | 中强 native | transcript/export manifest | terminal/cwd | delegation | **L1/2；低中** |
| [Continue](https://docs.continue.dev/) | Agent config/chat | 否；多 model provider | chat/session | 否 | model高、harness无 | 中 | IDE diff | IDE workspace | modes | **L1；低中** |
| [LangGraph](https://docs.langchain.com/oss/python/langgraph/persistence) | Thread/Graph run | adapter后可 | 是 | 可建模 | 可建模 | 强 | state自定义 | 外置 | 强 | **L2 substrate；高但需 glue** |
| [AutoGen](https://microsoft.github.io/autogen/stable/) | Team/run | adapter后可 | state/run | framework内是 | agent可替换 | 中强 | messages/state | 外置 | GraphFlow/teams | **L2 framework；中** |
| [CrewAI](https://docs.crewai.com/) | Crew/Flow | adapter后可 | flow/run | framework内是 | agent config可换 | 中强 | outputs/state | 外置 | 强 | **L2 framework；中** |
| [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) | Runner run/trace | MCP adapter后可 | run/session/trace | 可编排 | framework agent可换 | 中强；可接 Temporal | trace/spans | 外置 | handoffs/agents | **L2 framework；中高** |
| [Semantic Kernel](https://learn.microsoft.com/en-us/semantic-kernel/frameworks/agent/agent-architecture) | AgentThread/orchestration | adapter后可 | thread | framework内是 | provider thread有类型约束 | 中 | chat state | 外置 | orchestration | **L2 framework；中** |
| [PydanticAI](https://pydantic.dev/docs/ai/capabilities/durable_execution/overview/) | Agent run/workflow | adapter后可 | durable runtime ID | 可建模 | model/provider可换 | 强（Temporal/DBOS/Prefect） | typed outputs/trace | 外置 | graph/durable flow | **L2 substrate；高** |
| [Mastra](https://mastra.ai/en/reference/workflows/snapshots) | Workflow run | adapter后可 | run ID | 可建模 | agent/model可换 | 强 snapshot/resume | step outputs | storage provider | 强 | **L2 framework；中** |
| [Agno](https://docs.agno.com/sessions/workflow-sessions) | Workflow Session/Run | adapter后可 | session/run ID | framework内是 | model/agent可换 | 强 persistence | step/run results | 外置 | 强 | **L2 framework；中** |
| [Temporal](https://docs.temporal.io/workflow-execution) | Workflow ID/Execution | 通过 activity | 是，最强 | 可建模 | activity implementation可换 | 最强 | event history；artifact外置 | worker/task queue | 最强 durable | **L2 substrate；很高** |
| [Prefect](https://docs.prefect.io/v3/concepts/workers) | Flow Run | 通过 task | 是 | 可建模 | worker/infrastructure可换 | 强 | 原生 artifacts | work pool/worker | 强 | **L2 substrate；中高** |
| [Dagster](https://docs.dagster.io/) | Asset/Job Run | 通过 op/resource | 是 | 可建模 | resource/executor可换 | 强 | asset provenance强 | executor/resource | 强 | **L2 substrate；中** |
| [Dagger](https://docs.dagger.io/) | Function/Pipeline call | 可调用 CLI | call ID，非长期 Work | 可编排 | environment/runtime强 | build执行强，HITL弱 | outputs/cache | 容器环境强 | pipeline | **L1/2 substrate；低中** |

### 分级汇总

- **Level 0**：纯 launcher/tmux scripts；本矩阵未逐个列举。
- **Level 1**：Agent Monitor、Zed、JetBrains、Continue；以及只在 native session 内工作的单 harness。
- **Level 2**：Codeg、Vibe Kanban、Goose、Cline Teams、Claude Teams、Roo；所有主流 agent/workflow framework 和 durable runtime 都能成为 L2 substrate。
- **Level 3 preview**：Kandev Office、VS Code Agent Host/AHP。
- **成熟 Level 3**：**本次研究未发现。**

---

## Strongest Case Against

这是反对 Agent-Box 继续实现该 Core 的最强论证：

1. **Kandev 已几乎画出了同一条边界。** stable identity 与 execution profile 分离、跨 provider fallback、route attempts、task environment/worktree、native token invalidation 都已进入源码和 ADR。
2. **VS Code 正在把 IDE session 做成上层 authority。** AHP 的目标就是 host-owned state、多 client、adapter/harness separation；Agent-Box 若再做一套 session control plane，很可能与大平台正面重复。
3. **ACP 已快速成为 harness adapter 协议。** Zed、JetBrains、Codeg、Goose、VS Code 都在使用；自定义另一套通用 harness protocol 价值很低。
4. **durability 已被成熟 runtime 解决。** Temporal/LangGraph/Prefect/DBOS 等对 ID、event history、checkpoint、retry、pause/resume 的正确性远高于新本地 Core。
5. **大多数用户不需要 same-work multi-harness。** 他们需要的是选择一个更好的 agent，或同一 harness 的 subagents/teams；OpenCode/Continue 的 model portability、Claude/Cline native team 已足够。
6. **provider replacement 可能是伪承诺。** 复杂 Work 常依赖 harness-specific skills、MCP、permission、context、approval 和 native memory；真正迁移常等同于“新 agent 读 task + git state 重新开始”。
7. **独立 Work ID 很容易退化为 metadata tax。** 若 Kandev Task、VS Code session、Temporal Workflow ID 或 issue ID 已够，新增 UUID 只增加 mapping 与 UI。
8. **剩余缺口可能只需 conformance tests + adapters。** 如果如此，应该做 adapter library/compatibility suite，而不是产品级 Core。

最不利但很可能真实的描述是：

> Agent-Box Core 最终只是一个 SQLite 表，记录 `work_id → issue_id/worktree/session_ids/artifacts`，而真正的 lifecycle 在 Temporal/Kandev/VS Code，真正的执行在 harness，真正的安全在 sandbox。这样的 Core 没有足够独立行为。

---

## Strongest Case For

支持这一层存在的最强论证不是“统一 UI”，而是以下故障和审计场景：

1. planner 使用 Claude、executor 使用 Codex、reviewer 使用 OpenCode；任何一个 native session 都不能代表整体 objective；
2. provider 因额度、故障、权限或能力被替换，但 task/worktree/artifacts/approvals 必须延续；
3. 主 harness 崩溃或 native transcript 损坏，仍需从 task ledger、git state 与 evidence 恢复；
4. 用户要回答“这份 patch 是哪个 role、哪个 profile、哪个实际 provider、在什么权限与环境下产生，并通过了哪些测试”；
5. 一个 Work 跨越 IDE、TUI、Slack 和后台 worker，interaction surface 不能成为 authority；
6. workflow engine 可替换或一个 Work 跨多个 workflow run，单个 LangGraph/Temporal run 不再等同于 business Work；
7. native harness history 以 conversation 为中心，无法自然表达 failed attempt、artifact lineage、environment snapshot 与 final disposition。

Kandev 和 VS Code 的独立演进本身就是需求存在的证据：两个不同产品都开始把 identity/session authority 提升到 harness 之上。

但这个 case 支持的是**薄的 ownership/correlation/compatibility layer**，不是支持自建 workflow engine、IDE、sandbox、secret store 或 agent loop。

---

## Is There a Mature Level 3?

### 答案：没有找到成熟、通用 Level 3

最接近者：

| 候选 | 已满足 | 未满足/不成熟 |
|---|---|---|
| Kandev Office | stable logical identity、execution profile routing、task/run/session/worktree/environment correlation、cross-provider fallback、route evidence | Office feature-flagged/in progress；普通 workflow非抽象 role binding；无完整 capability contract |
| VS Code Agent Host/AHP | host-owned session、multiple chats、harness adapters、handoff、workspace/lifecycle source of truth | preview/active development；session≠versioned Work Definition；role/config/permission portability不完整 |
| Goose | session高于 ACP harness provider、可替换 provider instance、MCP传递 | session仍 provider-coupled；无多 role/attempt Work graph；resume compatibility不足 |
| Temporal/LangGraph + adapters | 完整 durable identity/lifecycle/history | adapters和coding semantics不是现成产品；需自行定义 portability contract |

### “完整实现”缺失的具体语义

不是笼统的“跨 harness 不够”，而是五项：

1. **统一、版本化、provider-neutral Work Definition**：与具体 run/state 分离；
2. **通用于 workflow 的 `Role → abstract Profile → Execution Profile/Provider`**：不是只在某个 Office/route 模式成立；
3. **fail-closed capability/compatibility contract**：覆盖 permission、approval、MCP、skills、context、sandbox、worktree、headless、resume 与 event fidelity；
4. **明确 cross-harness continuation semantics**：哪些状态是 durable handoff contract，哪些 native state 必须丢弃；
5. **跨 harness execution provenance schema**：effective config、native IDs、attempts、artifacts、tests、approvals、environment 与 cleanup 的因果链。

其中第 1–2 项 Kandev/VS Code 已部分实现；第 3–5 项仍最薄弱。

---

## Final Verdict

# B. Partially Solved

### 判定理由

Level 0–2 已成熟且竞争拥挤；Level 3 的架构边界已被 Kandev Office 与 VS Code Agent Host 独立实现到可观察程度，因此不能声称市场/开源世界完全缺失这一层。但截至研究日，没有一个成熟系统同时提供：

- provider-neutral Work Definition；
- 通用 role/profile/runtime 三层解析；
- 同一 Work 的异构 native session graph；
- 完整 lifecycle/provenance；
- 对 permission/MCP/skills/sandbox/resume 的可验证兼容契约。

### “是否需要新的 Work Instance Core？”

**目前证据不足以支持新的通用 Core。** 更准确的技术机会是：

> 在现有 Work owner（优先 Kandev、VS Code Agent Host、Temporal/LangGraph）之上或之内，补充 coding-harness adapter conformance、role-to-execution resolution 与 provenance/continuation semantics。

只有当下一阶段实验证明这些宿主不能承载同一套最小语义时，才应考虑 Agent-Box 自有 Work Instance。

### 立即行动建议

1. **Stop broad Core implementation**：停止 task DB、generic lifecycle、workflow engine、chat/session store 的重复建设。
2. **Integrate/learn first**：先对 Kandev Office 做真实 provider-fallback 验证；同时用 VS Code AHP 做 handoff/authority 验证。
3. **Build only probes/adapters**：允许做临时 ACP/app-server adapters、capability matrix、recovery tests；不要先固化产品 schema。
4. **Reuse identity**：实验中直接使用 Kandev Task ID、AHP Session ID 或 Temporal/LangGraph ID，不新增 Agent-Box Work ID。
5. **Decision gate**：只有四个下一阶段问题得到支持新层的证据后，再恢复设计。

这不是建议完全停止 Agent-Box；是建议**停止把“通用 Work Core”视为已被证明的差异化**。如果继续，差异必须落在第 3–5 个缺失语义，而非“我们也有 project/profile/workflow/session/worktree”。

---

## Kill Metrics

任一强条件命中，或多项弱条件共同命中，应停止该方向，不考虑 sunk cost。

### 立即 Kill 条件

1. **Kandev Office 达到 production-supported**，并把 identity/execution-profile routing 推广到普通 workflow，且通过 Claude↔Codex fallback/recovery 测试；
2. **VS Code Agent Host/AHP 稳定发布**，提供可扩展 role/harness mapping、durable session authority 与所需 provenance hooks；
3. **LangGraph/Temporal + ACP adapters 的 spike 小于约 1–2k 行核心 glue**，且通过 crash、approval、cancel、resume、provider replacement、duplicate side-effect 测试；
4. provider replacement 实验显示，多数真实 Work 都因 skills/MCP/permission/context 差异需要 workflow-specific rewrite，无法保持 definition；
5. 使用者无法给出独立 Work ID 驱动的实际操作；它只用于列表、标签或外键 correlation；
6. same-work heterogeneous harness 在目标用户样本中是低频需求，native teams 或“重新开一个 agent 读 git state”已足够；
7. Agent-Box Core 的持久状态可被无损替换为 `workflow_run_id + JSON metadata`，没有独立 state transition、invariant 或 recovery decision；
8. native harness team/IDE host 已覆盖 planner/executor/reviewer 的主要使用方式，跨 harness 收益不足以抵消不一致性。

### 量化验证阈值

下一阶段 prototype 若出现以下任一结果，应判定失败：

- 10 个真实 Work 中少于 3 个使用两个不同 harness；
- provider replacement 成功率低于 80%，且失败主要来自不可抽象的 harness semantics；
- 超过 20% 的 replacement 静默扩大 permission 或丢失 required MCP/tool；
- 新 Work ID 在 80% 以上 Work 中与一个既有 session/run/issue ID 一一对应；
- 每个新增 harness 需要修改 Core schema/state machine，而不只是 adapter；
- 为持久化/恢复编写的 Core 代码多于 adapter/conformance 代码，却仍弱于 LangGraph/Temporal；
- 用户在 blind test 中无法从 Work history 比 native conversation + git log 更快完成 resume/audit；
- Kandev/AHP 在验证周期内补齐同等能力，使差异缩小为 UI preference。

### 非 Kill、但需降级定位的结果

如果 Work identity 有价值，但仅用于 correlation/audit，而不拥有 workflow/lifecycle，则应把方向降为：

> **Cross-harness execution ledger / provenance index**

而不是 Work Runtime。

---

## Questions for Next Design Phase

> 按本次结论，不在本文展开完整架构。下一轮只应研究以下四个问题。

### 1. Work 应该如何定义？

需要验证：Work Definition 与 Work Instance 的最小字段、版本/解析时机、与 issue/workflow/session 的 identity mapping，以及 ad-hoc Work 是否需要 Definition。

### 2. 最小 MVP 应验证什么？

需要用真实 Claude↔Codex/OpenCode Work 验证：stable identity、role/profile re-resolution、crash/recovery、permission fail-closed、durable-state handoff 和 audit usefulness；不得先做完整 UI/数据库。

### 3. Core 必须拥有什么？

需要证明哪些 invariant 无法由 Kandev、AHP、Temporal/LangGraph 拥有；候选仅限 identity mapping、resolution snapshot、session/attempt correlation、continuation decision、artifact/evidence ledger。

### 4. 哪些必须由下游 provider 提供？

需要定义 harness/environment/permission/workflow/UI provider 的最小 capability contract、native session ownership、enforcement evidence、cancellation/resume/idempotency 与明确的 unsupported/degraded 行为。

---

## Source Notes and Evidence Quality

### 主要一手来源

- Kandev：当前源码、domain structs、migration/ADR、public feature status；Office 的 strongest evidence 同时也明确标注 proposed/in progress，故未过度推断为 mature。
- Codeg：当前 `WorkTask`、event、conversation、delegation、ACP registry 源码；README 只用于产品范围，不用于 ownership 结论。
- VS Code/AHP：官方概念文档、AHP 官方仓库与协议说明；preview 状态纳入成熟度折扣。
- Claude Code/Codex/OpenCode：官方 session/subagent/team/app-server/server 文档；OpenAI 相关判断仅使用 OpenAI 官方文档域。
- ACP/MCP：官方协议文档与 schema；区分 transport capability 与 semantic portability。
- Framework/runtime：各项目官方 persistence/session/run 文档；“可通过 adapter 实现”没有当作 out-of-box 命中。

### 研究限制

1. Kandev 与 Codeg 在研究日仍高速提交；本文固定到上述 commit，后续可能很快过时。
2. 某些 IDE/cloud agent 能力可能分阶段 rollout；未在公开 schema/source 中出现的 ownership 不作肯定判断。
3. 本报告评估 architecture/domain model，不评估模型质量、商业模式或团队执行能力。
4. “成熟”不仅指代码存在，还要求公开支持、稳定 schema、恢复语义、兼容性与可验证运行证据。

---

## Final Answer to the Core Question

> **Is there a meaningful software layer where “the work exists above the harness”, and has that layer already been implemented well?**

**有意义：是。** Kandev Office 与 VS Code Agent Host 的独立演进、Temporal 类系统的成熟 business-process identity，以及 Codeg/Vibe/Goose 对 task/session 的提升，共同证明该层有工程一致性和重度 multi-harness 用户价值。

**已经被良好、完整实现：尚未。** 最强实现仍是 preview/feature-flagged 或只覆盖 session/Office 特定路径；通用的 provider-neutral Work Definition、capability compatibility、cross-harness continuation 和 provenance 尚未同时成立。

**是否应由 Agent-Box 重新实现：当前不应。** 先集成 Kandev/AHP 或映射到成熟 workflow runtime；只有在最小实验明确证明剩余语义无法通过薄 adapter/ledger 实现时，才有理由恢复新的 Work Instance Core。
