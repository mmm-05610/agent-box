# Agent-Box 当前项目架构：新开发者导览
>
> Historical record — describes an earlier architecture or validation state and is not current implementation guidance.
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 更新日期：2026-08-26
> 适用范围：当前仓库实际代码、Preview 正在建设的 Work Core，以及二者之间的边界。

这是一份“第一次接触项目时先读”的地图。它回答：Agent-Box 到底是什么、当前代码
由哪些系统组成、最重要的对象如何关联、一次 Execution 怎样自动装配资源、Provider
怎样扩展，以及哪些目录是当前主线、哪些只是历史实现或 spike。

## 1. 一分钟结论

Agent-Box 当前由两条产品能力主线和一个扩展层组成：

1. **Profile Runtime**：已经成熟的配置隔离与 Harness 启动能力。它管理 Claude
   Code、Codex、Hermes、OpenCode 的 Profile，通过 bwrap 把正确配置和项目配置
   投影给真实 CLI。
2. **Minimal Work Core**：Preview 正在建设的责任与证据层。它管理 Work、一次次
   Execution、冻结输入、Dispatch、外部 Ref 和 material events，但不决定下一步。
3. **Extension Layer**：第三方 Python distribution 可以注册 Resource Contract、
   ResourceProvider 和 ExecutionProvider，不需要修改 Agent-Box Core。

最核心的产品关系是：

```text
Human / Host / external Workflow
决定当前下一步
        │
        ▼
Work ──创建──> Execution ──冻结输入并 Dispatch──> 一个 ExecutionProvider
                    │                                  │
                    │                                  ├─启动真实 Harness / CI / runtime
                    │                                  ├─返回 native identity
                    │                                  └─观察并结束本次责任
                    │
                    └─输入、native objects、outputs 都通过 Ref 关联
```

一句话理解：

> Profile Runtime 负责“怎样把一个真实 Harness 正确启动起来”；Work Core 负责“这一次
> 为什么启动、依据什么、交给谁、最后能证明什么”。

## 2. 当前仓库里有三套容易混淆的代码

| 代码区域 | 当前定位 | 新开发是否应继续扩展 |
|---|---|---|
| `src/agent_box/resources/`、`launch.py`、`project_space.py` | 已有 Profile 管理、配置投影、bwrap 启动主路径 | **是**，用于 Profile/runtime 能力 |
| `src/agent_box/work_core/` | 当前 Minimal Work Core 与 Preview 主线 | **是**，但必须守住 Core 边界 |
| `src/agent_box/work/` | 早期固定 `plan → execute → review` Work 实现 | **否**，只作历史兼容和参考 |

旧 `work/` 自己拥有 phase、role、transition、Attempt、Decision、Handoff，并由
`FixedPlanExecuteReviewWorkflow` 自动决定下一步。这与现在“未来开放、Host 决定当前
下一步”的产品方向不同。

当前开发规则：

- 新的 Work/Execution 语义进入 `work_core/`；
- 新的 Git、Harness、CI、LangGraph、tmux 集成进入 Provider/plugin；
- 不继续向 `work/` 的固定流程模型添加 Preview 功能；
- `cli/commands/work.py` 仍连接旧 `work/`，不能把它当作新 Work Core 的最终 UI。

## 3. 全局组织关系

```text
┌──────────────────────────── Host / UI ─────────────────────────────┐
│ CLI / TUI / GUI / Preview Demo Host / Human / external Workflow   │
│ 选择当前下一次 Execution，准备输入草稿，决定是否继续或完成 Work   │
└───────────────┬──────────────────────────────┬─────────────────────┘
                │                              │
                ▼                              ▼
┌────────────────────────┐       ┌───────────────────────────────────┐
│ Profile Runtime        │       │ Minimal Work Core                 │
│                        │       │                                   │
│ Profile CRUD           │       │ Work / Execution                  │
│ ACS resource apply     │       │ frozen (contract_id, Ref) inputs  │
│ project config overlay │       │ Dispatch / current Projection     │
│ launch plan            │       │ Ref associations / material Event │
│ bwrap process launch   │       │ SQLite repository                 │
└────────────┬───────────┘       └──────────────┬────────────────────┘
             │                                  │
             └─────────────────┬────────────────┘
                               ▼
                   ┌──────────────────────────┐
                   │ Extension Registry       │
                   │ versioned Contracts      │
                   │ ResourceProviders        │
                   │ ExecutionProviders       │
                   └────────────┬─────────────┘
                                ▼
┌────────────────────── External authority domains ───────────────────────┐
│ Codex / Claude / OpenCode / Hermes / Git / GitHub Actions / LangGraph  │
│ bwrap / tmux / ACP / collaboration gateway / filesystem artifacts     │
└─────────────────────────────────────────────────────────────────────────┘
```

依赖方向必须保持：

```text
Host/UI ────────> Work Core
Provider/plugin ─> Work Core public contracts
Provider/plugin ─> Profile Runtime（需要时复用 launch plan）

Work Core -X-> Codex/Git/tmux/LangGraph/GitHub 产品实现
Work Core -X-> workflow routing、Harness 配置或 pane lifecycle
```

## 4. Minimal Work Core 的对象关系

```text
Work 1 ─────────── * Execution
                       │
                       ├── 1 accountable provider_id
                       ├── 0..1 Dispatch
                       ├── * INPUT Ref association + contract_id
                       ├── * NATIVE Ref association
                       ├── * OUTPUT Ref association
                       ├── 1 current ExecutionProjection
                       └── * material CoreEvent

Binding = 一次 Execution 冻结的全部 INPUT associations + inputs_digest
          （当前不是独立数据库实体）
```

### 4.1 Work

`Work` 是长期目标和人工完成边界。

当前字段：

- `id`：Core identity；
- `objective`：允许从模糊目标开始；
- `lifecycle`：`open | completed | abandoned`；
- `closure_reason`：人工完成/关闭理由；
- `metadata`、timestamps、optimistic `version`。

Work 不拥有：

- 当前 workflow node；
- 下一次该运行谁；
- DAG、scheduler、retry；
- Harness session；
- Provider outcome 的自动聚合。

一个 Execution terminal 不会自动完成 Work。`WorkService.complete_work()` 是独立、
显式的操作，`reopen_work()` 会恢复 Work 的开放状态。

### 4.2 Execution

`Execution` 是一次独立责任尝试，不是 session，也不是 model turn。

当前字段：

- `id`、`work_id`；
- 唯一 accountable `provider_id`；
- current `ExecutionProjection`；
- created/dispatched/started/ended timestamps；
- 有界 provenance；
- optimistic `version`。

创建时的 `responsibility_intent` 保存在不可变 `ExecutionCreated` event 中，而不是
Execution 新字段。这句话回答“为什么创建这一次尝试”。只有 `open` Work 可以创建新
Execution。

同一 Execution 可以包含 Harness 内部的多个 turn，但只有一个责任窗口。交互式
Harness 一轮回答完成、进入 idle 或暂时没有输出，都不等于 Execution terminal。

### 4.3 Binding

Binding 表示：

> 这次 Execution 在正式交给 Provider 前，固定选择了哪些外部资源，并要求按什么
> Contract 解释它们。

当前实现没有 `Binding` 表或 `Binding` entity。它由两部分组成：

```text
core_execution_refs 中 relation=input 的 (contract_id, Ref)
+
core_dispatches.inputs_digest
```

Host 在 Dispatch 前持有一个普通输入草稿：

```python
inputs = [
    ("agent-box.workspace@1", workspace_ref),
    ("agent-box.prompt-fragment@1", context_ref),
    ("agent-box.profile@1", profile_ref),
]
```

`dispatch_execution()` 在同一 SQLite transaction 中写入全部 INPUT associations、
`requested` Dispatch 和事件。从这一刻开始，这个 Execution 的 INPUT 不可增加、
替换或删除。解析或 Provider start 失败也不会解冻输入；新的依据意味着新 Execution。

因此，Binding 不是“资源被模型实际使用”的证明。它只证明这次责任提交依据是什么。

### 4.4 Dispatch

Dispatch 是把本次 Execution 正式交给唯一 accountable ExecutionProvider 的责任提交
边界。

当前实现保证：

- 每个 Execution 最多一个 Dispatch（数据库 unique index）；
- idempotency key 不能被另一个 Execution 复用；
- 相同 key 重放时 inputs digest 必须一致；
- INPUT freeze 与 requested Dispatch 原子写入；
- Provider start 返回后记录 `accepted` 和可选 native correlation；
- resolve/start 异常记录 `failed`。

Dispatch 不是 workflow step、queue job、retry policy 或 scheduler。

### 4.5 Ref

`Ref` 是 Core 对外部对象的有界 identity，不是外部 payload。

当前类型：

| RefType | 常见 native identity |
|---|---|
| `SessionRef` | Codex thread ID、Harness native session |
| `WorkflowInstanceRef` | LangGraph thread ID |
| `RunRef` | Codex turn、CI run、process/run identity |
| `WorkspaceRef` | exact Git commit/workspace locator |
| `ArtifactRef` | content digest、报告、context snapshot |

结构只有：`type`、`provider`、`native_id`、可选 `uri` 和有界扁平字符串 metadata。
transcript、checkpoint payload、secret、完整配置和任意嵌套 JSON 不允许塞进 Ref。

Ref 与 Execution 的关系有三种：

- `input`：Binding 的固定依据，必须有 `contract_id`；
- `native`：Provider 实际产生或确认的 native object；
- `output`：本次 Execution 产生的 workspace/artifact 等结果。

### 4.6 Resource Contract

Ref 只回答“外部对象是谁”；Contract 回答“ExecutionProvider 最终会收到什么结构”。

例如：

```text
WorkspaceRef(commit C)
    ── GitWorktreeResourceProvider.resolve ──>
WorkspaceV1(path=/managed/worktree, source_digest=git:C)
```

内置 Contract：

| contract_id | Python value | 用途 |
|---|---|---|
| `agent-box.workspace@1` | `WorkspaceV1` | 已物化且可验证的工作目录 |
| `agent-box.prompt-fragment@1` | `PromptFragmentV1` | 有摘要的执行上下文文本 |
| `agent-box.profile@1` | `AgentBoxProfileV1` | 固定的非 secret Profile 配置 identity |
| `agent-box.codex-continuation@1` | `CodexContinuationV1` | 新 Execution 使用旧 Codex thread |

Contract 是 versioned frozen dataclass，不是 Core entity，不持久化实例。第三方插件也
可以注册自己的 Contract。

### 4.7 ExecutionProjection

Projection 是 Core 当前接受的 Provider 观察摘要，不是 Provider native state 镜像。

- phase：`unknown | active | terminal`；
- terminal outcome：`succeeded | failed | cancelled | abandoned`；
- freshness：`observed | stale | unreachable`；
- `resumable_now`：当前兼容字段；
- `observed_at`。

正确理解：`Execution succeeded` 只表示本次责任执行完成，不表示测试通过、产品正确
或 Work 已完成。业务/验证结论应放在 output artifact 或外部 authority evidence 中。

### 4.8 CoreEvent 与 evidence

`CoreEvent` 是有界的 material cross-system fact，不是 tracing/telemetry backend。

当前会记录 Work 创建/完成/重开、Execution 创建、Dispatch requested/accepted/
failed、Projection material change、terminal、native/output Ref 等。

当前没有独立 `Evidence` entity、Coverage enum 或通用 attestation model。实际证据由：

- native/output `ArtifactRef`；
- Git commit/tree/diff digest；
- Provider event/log artifact；
- INPUT resource state event；
- 外部系统自己的 native locator；

共同表达。`resource_state` 是 Provider 定义的有界字符串，可带一个 evidence
ArtifactRef；它不证明模型语义上消费了全部资源。

## 5. Provider 的准确分工

### ExecutionProvider

每个 Execution 只有一个 accountable ExecutionProvider。它负责：

- 接收本次 Dispatch；
- 启动一个真实 native responsibility；
- 返回 correlation；
- observe/recover 自己的 native system；
- 给出本次 Execution 的 terminal observation。

它不一定是 AI Harness。Codex、GitHub Actions、长期 Human Task 或外部 workflow run
都可能实现这个协议。

“一个 Provider”指一个责任边界，不代表一个进程。只有当一次 Execution 的整体责任
确实由多个 Harness 联合承担时，第三方 Team ExecutionProvider 才有意义；它不能包住
整个 Work。

### ResourceProvider

ResourceProvider 根据 `Ref.provider` 解释外部 identity，解析、校验或物化一个
Contract value。例如：

- Git selector/commit → verified worktree；
- ArtifactRef → digest-verified prompt fragment；
- ProfileRef → non-secret profile contract；
- tmux console spec → tmux console resource。

ResourceProvider 不拥有 Execution outcome，也不决定 Finish 或下一步。tmux 永远是
资源，不因为它承载了多个终端就成为整个 Work 的 ExecutionProvider。

### Host / external Workflow

Host 可以是 CLI、TUI、GUI、Demo app、Human interaction layer 或 LangGraph adapter。
它负责：

- 根据当前事实决定是否创建下一次 Execution；
- 选择 accountable ExecutionProvider；
- 准备 `(contract_id, Ref)` 输入草稿；
- 请求 Dispatch；
- 在 Execution 结束后提出下一步；
- 最终由 Human 完成 Work。

Host 不是 Core entity。LangGraph 可以拥有 graph、routing、checkpoint 和 workflow
state；Agent-Box 只绑定其 exact identity/context，不镜像这些状态。

## 6. 一次自动装配到底怎样发生

以 Codex Author Execution 为例：

```text
1. Host 创建 Execution E1，provider_id=codex-app-server
2. Host 选择：
   - WorkspaceRef exact commit C1
   - requirements ArtifactRef R1
   - ProfileRef demo-codex
3. Core 校验 Codex provider 的 input_limits
4. Core canonicalize inputs 并计算 inputs_digest
5. Core 原子写入 frozen INPUTs + Dispatch D1
6. 每个 ResourceProvider 根据 Ref resolve：
   - Git 创建 worktree并验证 HEAD=C1
   - Artifact 读取内容并验证 digest
   - Profile 验证非 secret 配置 digest
7. Core 验证返回值确实是注册的 Contract Python 类型
8. Core 构造 ExecutionStartRequest，按 contract_id 保留全部值
9. CodexExecutionProvider 消费这些值：
   - workspace.path → cwd
   - prompt fragments → initial context
   - profile.name → build_launch_plan
10. Profile Runtime 生成 bwrap argv/mount/env
11. Provider 启动真实 Codex App Server thread/turn
12. Core 保存 Dispatch accepted 和 native correlation
```

“自动装配协议”由双方共同完成，但职责不同：

- ResourceProvider 实现“怎样从这个 Ref 产生标准 Contract value”；
- ExecutionProvider 实现“我怎样使用这种 Contract”；
- Core 只负责固定选择、查找双方、类型/数量验证和完整传递。

Core 不理解 workspace mount、prompt rendering、Codex resume 或 tmux pane。

## 7. 交互式 Execution 与 continuation

当前 `CodexInteractiveExecutionProvider` 已验证：

- App Server `thread/start` / `thread/resume`；
- 一个 Execution 内多次 `turn/start` 和 steer；
- turn complete 后 Execution 仍为 active；
- Provider `finish()` 后才关闭 client、固定 event artifact 并返回 terminal；
- thread ID 作为 SessionRef，turn IDs 作为 RunRefs。

Session continuity 不等于 Execution continuity：

```text
E1 terminal ──produced──> SessionRef S1

E2 new Binding includes S1
E2 new Dispatch
Provider executes native thread/resume(S1)
```

永远不是“重新打开 E1”。当前 `ExecutionService.resume_execution(old_execution_id,
...)` 是仍待移除/替换的旧 API，Preview 主路径不得使用。正确路径已经可以通过
`agent-box.codex-continuation@1` 和新 Execution 表达。

## 8. Profile Runtime

Profile Runtime 是当前产品已经成熟的基础设施，与 Work Core 互补。

### Profile 是什么

Profile 是某个 Harness 的独立配置目录和元数据，例如 `demo-codex`、
`demo-opencode`、`demo-hermes`。它可以包含 native settings、instructions、hooks、
MCP、skills、provider/model config 和 credential reference/source。

Profile 不是 Work、ExecutionProvider 或 Session。一次 Execution 可以选择某个
ProfileRef，ResourceProvider 把它解析成 `AgentBoxProfileV1`，随后具体
ExecutionProvider 决定怎样启动。

### launch plan

`build_launch_plan()`：

1. 读取 Profile 和声明式 agent type registry；
2. 解析实际 binary、cwd 和项目配置 surfaces；
3. 物化 Profile 私有的项目配置 backing；
4. 生成有序 bwrap bind mounts；
5. 返回 `LaunchPlan(argv, env, cwd, agent_type, binary, mounts)`。

当前 bwrap 主要提供配置/runtime projection 和部分本地隔离。默认共享网络，且现有
策略包含较宽的 root visibility，不能宣传为高可信 sandbox。

## 9. 插件系统

第三方插件是独立 Python distribution，通过标准 entry point 注册：

```toml
[project.entry-points."agent_box.plugins"]
my_plugin = "my_package.plugin:create_plugin"
```

factory 返回：

```python
PluginDescriptor
PluginRegistration(
    contracts=(...),
    resource_providers=(...),
    execution_providers=(...),
)
```

加载器会检查 plugin API version、ID、frozen/versioned Contract 和 Provider 声明，
再把一个插件 bundle 原子注册进进程级 `ExtensionRegistry`。插件失败显示为
`FAILED`/`INCOMPATIBLE`。

```bash
agent-box plugins list
agent-box plugins list --json
```

插件是可信的 Python 代码，不是沙箱。当前不提供插件市场、权限系统、热更新或插件间
依赖求解。

仓库中的 `plugins/agent-box-tmux/` 是第一个独立 distribution 示例。目前它已验证
真实 tmux session/pane materialization，但其 Contract 仍偏 execution-scoped；如果
将 tmux 用作整个 Work 的长期终端看板，应在插件内调整为可复用 Work console
resource，不需要修改 Core。

## 10. 持久化布局

所有主包 SQLite 数据目前共用：

```text
$AGENT_BOX_HOME/agent-box.db
```

迁移分成三组历史：

| Migration | 表 | 定位 |
|---|---|---|
| `001` / `002` | `profiles`、`sessions` | 当前 Profile Runtime |
| `003` | `works`、`work_attempts`、`work_decisions`、`work_artifacts`、`work_handoffs` | 旧固定流程 Work |
| `004` / `005` / `006` | `core_works`、`core_executions`、`core_execution_refs`、`core_dispatches`、`core_events` | 当前 Minimal Work Core；`005` 保留，Resource Contract inputs 在 `006` |

不要跨用 `works` 与 `core_works`，也不要让新代码继续依赖 `work_attempts`。

外部大对象不进入 SQLite：Git objects 留在 Git，transcript 留在 Harness/native event
file，workflow state 留在 LangGraph，CI logs/artifacts 留在 GitHub。Core 保存它们的
Ref、digest、相关 material event 和 current projection。

## 11. 代码目录地图

```text
src/agent_box/
├── cli/                    主 CLI/TUI 入口；work command 目前仍连旧 work/
├── core/                   SQLite、文件 IO、agent type/profile library
├── resources/              Profile CRUD 与 ACS resource apply
├── adapters/               ACS、model endpoint 等外部数据适配
├── launch.py               bwrap LaunchPlan 与真实 Profile 启动
├── project_space.py        项目级配置 surface/backing/mount 计划
├── resource_contracts/     内置 versioned immutable Contract values
├── work_core/              当前 Minimal Work Core 主线
│   ├── models.py           Work / Execution / Ref
│   ├── projection.py       phase/outcome/freshness
│   ├── events.py           material CoreEvent
│   ├── repository.py       core_* SQLite persistence
│   ├── services.py         Work/Execution application services
│   ├── registry.py         Contract/Provider process registry
│   └── providers/          当前内置/Preview Provider adapters
├── extensions/             第三方 plugin API、loader、bootstrap
└── work/                   旧固定流程实现；不要作为 Preview 主线扩展

plugins/
├── agent-box-tmux/         tmux console ResourceProvider 与产品专属控制面
└── agent-box-codex/        Codex App Server 与 tmux TUI ExecutionProviders

gui-web/                    React + PyWebView GUI；当前主要覆盖 Profile/session
spikes/                     可复现实验，不是 production import surface
docs/adr/                   已接受或候选语义决策
docs/validation/            真实验证记录
docs/demos/                 Demo storyboard，不代表代码已全部实现
```

## 12. 当前 Provider 实现状态

| 能力 | 当前代码状态 | 说明 |
|---|---|---|
| Profile launch：Claude/Codex/Hermes/OpenCode | 已实现 | 通过声明式 registry + bwrap 启动 |
| Git worktree ResourceProvider | 已实现并测试 | exact commit/tree、HEAD 验证、snapshot、cleanup |
| Artifact prompt ResourceProvider | 已实现并测试 | 文件内容 digest 验证 |
| Agent-Box Profile ResourceProvider | 已实现并测试 | 固定非 secret launch config digest |
| Codex App Server interactive ExecutionProvider | 已实现并真实 E2E | thread/turn、多轮、finish、continuation input |
| Codex tmux interactive ExecutionProvider | 已实现并注册；受当前沙箱限制部分 E2E | 自动投影真实 TUI、attach、SessionStart correlation、显式 finish |
| 第三方 tmux ResourceProvider | 独立插件，真实 E2E | execution-scoped console identity/materialization/pane operations |
| Codex JSONL/CLI provider | 旧适配路径 | 与新 `ExecutionStartRequest` 主路径并不完全统一 |
| LangGraph adapter | spike/设计已验证，未 productize | 还没有正式插件注册 |
| GitHub Actions ExecutionProvider | spike 已验证，未 productize | 还没有正式 production adapter |
| ACP/acpx + Collaboration Gateway | spike 已验证，未 productize | 不要把 ACP 当 peer collaboration authority |
| OpenCode/Hermes Work Core ExecutionProvider | 未实现 | launcher/Profile 支持不等于 Work Core Provider 已有 |
| TeamInteractiveExecutionProvider | 未实现且非基础必需 | 只服务某一次真实 aggregate multi-Harness Execution |

“真实 spike 成功”与“production adapter 已注册”是两种状态。Storyboard 中出现的产品
不能因此被误读为当前应用启动时已经可用。

## 13. 当前已知的 Core 实现缺口

以下不是重开模型，而是代码尚未完全达到已确定不变量：

1. **通用 Finish/Submit orchestration**：Codex provider 已有 `finish()`，但 Core/Host
   还没有统一的 Finish → collect refs/facts → apply observation 调用面。
2. **continuation 旧 API**：`resume_execution(old_execution_id, ...)` 与 ADR-0001 冲突，
   Preview 必须使用 new Execution + continuation Ref。
3. **terminal monotonicity**：当前 `observe_projection()` 主要按 observed time 更新，
   尚未完整实现 ADR-0005 的 terminal irreversible/conflict guards。
4. **Dispatch recovery**：当前状态只有简化的 requested/accepted/failed；ADR-0002/0003
   中 starting、durable correlation 和 crash reconciliation 尚未完整实现。
5. **Evidence assurance**：当前只有 Ref/event/resource state，尚无 UI 需要的完整
   requested/projected/observed/unknown 对账层；不要先把外部 evidence ontology塞进 Core。
6. **Preview Host/UI**：新 Work Core 尚无完整 Work list、Binding selector、terminal
   attach、Finish、next decision、History/Audit 页面。

这些缺口应按 Preview vertical slice 补齐，不应引入 WorkflowStep、Agent、Harness、
Participant、Message、Scheduler 或 generic retry engine。

## 14. 不变量与常见误解

| 不变量 | 容易犯的错误 |
|---|---|
| 一个 Work 有多个独立 Execution | 用一个 Team Provider 包住整个 Work |
| 一个 Execution 只有一个 accountable ExecutionProvider | 让 Core 同时管理三个 participant lifecycle |
| SessionRef 可以跨 Execution 复用 | 把 terminal E1 “resume”为 active |
| Binding 是 frozen inputs，不是消费证明 | 显示 `all resources used=true` |
| Work completion 由 Human/Host 显式决定 | Provider succeeded 后自动关闭 Work |
| Workflow/Host 决定下一步 | 给 Core 增加 route/node/edge |
| tmux 是终端资源 | 因为展示全程就把它变成 ExecutionProvider |
| Plugin 扩展外部语义 | 为每个产品增加 Core entity |

判断一段新代码应该放在哪里：

```text
它是否定义跨所有 Provider 都必须成立的责任不变量？
  是 → 考虑 Work Core

它是否知道 Git/Codex/tmux/LangGraph/CI 的 native 语义？
  是 → Provider/plugin

它是否决定当前下一步、组装 Binding draft 或更新 workflow？
  是 → Host/workflow integration

它是否只是显示 terminal、history、evidence detail？
  是 → UI

它是否是大 payload、transcript、checkpoint 或 report？
  是 → 外部 authority/artifact store，Core 只存 Ref
```

## 15. 运行入口

当前主要入口：

```bash
# Profile/TUI
agent-box
agent-box tui
agent-box repl
agent-box exec "list profiles"

# 第三方插件发现
agent-box plugins list --json
```

`src/agent_box/work_core/cli.py` 是 opt-in 的 Phase 1/验证入口，不是最终 Preview Host。
主 cmd2 CLI 中的 `work ...` 当前仍使用旧固定 workflow 实现。

开发测试：

```bash
python3 -m pytest -q

# Work Core/Binding/Provider 主线
python3 -m pytest -q \
  tests/test_work_core_services.py \
  tests/test_work_core_input_dispatch.py \
  tests/test_work_core_resource_observation.py \
  tests/test_work_core_real_resource_providers.py \
  tests/test_work_core_codex_interactive.py \
  tests/test_extensions.py

# 独立 tmux 插件
PYTHONPATH="$PWD/plugins/agent-box-tmux/src:$PWD/src" \
  python3 -m pytest -q plugins/agent-box-tmux/tests
```

## 16. 推荐阅读顺序

1. 本文：建立当前全局地图。
2. [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md)：理解成熟的 Profile/bwrap/GUI 主路径。
3. [`ADR-0001`](../adr/0001-execution-attempt-vs-session-continuity.md)：理解
   Execution 与 Session continuity。
4. [`ADR-0006`](../adr/0006-resource-contract-input-protocol.md)：理解 Binding 自动装配。
5. [`ADR-0007`](../adr/0007-third-party-provider-plugin-loading.md)：理解第三方扩展。
6. `src/agent_box/work_core/models.py` → `registry.py` → `repository.py` →
   `services.py`：按领域到运行流程阅读。
7. `tests/test_work_core_input_dispatch.py` 与 `tests/test_extensions.py`：看最短可运行实例。
8. [`Real Provider Vertical Validation`](../validation/REAL_PROVIDER_VERTICAL_2026-08-25.md)：
   看 Git/Profile/bwrap/Codex 的真实 E2E 与限制。

文档可信度顺序：

```text
当前源码与 migration
  > 标为 Accepted 且已实现的 ADR
  > validation 中的真实 spike 结果
  > plans / demos / research 中的候选与未来设计
```

当 ADR 的“实现状态”仍为 Pending 时，应把它看作目标不变量，而不是当前代码已经具备
的保证。

## 17. 开发者应该记住的最后五句话

1. Work 是长期目标；Execution 是一次责任尝试。
2. 每次 Execution 冻结自己的输入，只 Dispatch 给一个 accountable Provider。
3. Ref 保存外部 identity，Contract 负责 Provider 之间的输入类型协议。
4. Workflow、Human 和 Host 决定下一步；Core 只治理已经决定的这一次。
5. 外部产品能力优先做第三方插件，不为 Demo 把它们变成 Core ontology。
