# Repository Restructure: Core Freeze Audit
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

审计范围：`src/agent_box/work_core/`、`resource_contracts/`、`extensions/`、
`migrations/`、`cli/` 及 Work Core/extension 相关测试。本文只记录只读审计
结果；未修改运行时代码，也未执行 Git 操作。

## 结论（Verdict）

**不能在当前形态冻结整个 Core；可以冻结其领域协议的主体，条件是先完成边界清理。**

当前 `work_core` 的主要领域对象和状态转换已经很接近目标边界：Work、Execution、
Ref、Projection、Dispatch、Evidence/ResourceObservation、原子 Finalization 和
Provider-neutral Registry 都已有明确实现和测试。主要阻塞项不是 Core 语义缺失，
而是正式包内仍带有具体 Provider/产品实现，且根 CLI 和数据库 migration runner
同时承载旧版 Profile、固定 workflow、Git、Web 和 Harness 生命周期。

针对性的 Core 测试审计集实测通过：

```text
pytest -q tests/test_work_core_contracts.py tests/test_work_core_responsibility.py \
  tests/test_work_core_input_dispatch.py tests/test_work_core_finalization.py \
  tests/test_work_core_resource_observation.py tests/test_extensions.py \
  tests/test_resource_contracts.py tests/test_work_core_cli.py
58 passed
```

这证明当前行为契约较完整，不等于目录边界已经合格。

## 1. 责任映射

| 路径 | 当前责任 | 结论 | 目标归属 |
|---|---|---|---|
| `work_core/models.py` | `Work`、`Execution`、`Ref`、生命周期及有界 metadata | 保留 | Core |
| `work_core/projection.py` | provider observation 的通用 phase/outcome/freshness | 保留 | Core |
| `work_core/events.py` | 跨系统 material facts 与责任意图 | 保留 | Core |
| `work_core/errors.py` | Dispatch、Projection、Ref、Input、Finalization 错误 | 保留 | Core |
| `work_core/finalization.py` | 原子终态 bundle DTO/receipt | 保留 | Core |
| `work_core/resource_observations.py` | frozen input 上的 typed claims/evidence | 保留 | Core |
| `work_core/repository.py` | Core SQLite state、events、refs、dispatch、observation ledger、finalization | 保留，拆分 DB 基础设施时保持 API | Core persistence |
| `work_core/services.py` | Work/Execution 创建、输入冻结、resolve、Dispatch、projection、finalization | 保留，继续去除 legacy 分支 | Core application service |
| `work_core/registry.py` | Contract/ResourceProvider/ExecutionProvider 注册和能力检查 | 保留，但移除具体 built-in contract 假设 | Core SDK |
| `work_core/cli.py` | 两个 opt-in 的 provider-neutral create/complete 命令 | 可保留 | Core diagnostic CLI |
| `work_core/providers/resources.py` | Git worktree、文件 artifact、Agent-Box Profile 的具体解析/物化 | **移出** | Git/Preview resources/Harness plugins |
| `resource_contracts/workspace_v1.py` | frozen workspace 的跨 Provider value | 保留 | SDK contract |
| `resource_contracts/prompt_fragment_v1.py` | immutable prompt text value | 保留 | SDK contract；具体文件 provider 在插件 |
| `resource_contracts/agent_box_profile_v1.py` | `name/agent_type/digest/revision/provider` 的 Agent-Box Profile value | **移出或改成插件注册 contract** | Harness plugin；Core 不硬编码 |
| `extensions/api.py` | Plugin descriptor/registration、selectors、HostControl、Harness manager 协议 | 作为 Plugin/Host SDK 保留，不归 Work Core | Plugin/Host SDK |
| `extensions/loader.py` | entry point discovery、atomic registration、重复 ID 检查 | 保留在 extension host 层 | Host/SDK |
| `extensions/diagnostics.py` | 结构检查，不启动 provider | 保留在 extension host 层 | Host/SDK |
| `extensions/finalization.py` | 收集插件贡献并调用 Core finalization | 保留在 Host orchestration 层 | Host/SDK |
| `cli/commands/plugins.py` | 通用插件 list/inspect/doctor | 保留，改为只依赖 extension host facade | Host CLI |
| `cli/commands/core.py`、`profile.py` | 旧 Profile/Session/MCP/Skills/Hooks/launch REPL | **移出** | Harness/Web plugin 或兼容壳 |
| `cli/commands/work.py` | 旧固定 plan-execute-review、ACP、Git worktree、角色 Profile | **移出** | workflow/Host/legacy compatibility；不能叫 Core |
| `cli/__init__.py` | Web 启动、Web doctor、Git/Codex 检查、插件 CLI | 拆薄 | root dispatch；实现放 Web/Harness plugins |
| `cli/shell.py` | 把旧 Core/Profile/Work command sets 装进 REPL | **移出旧产品实现** | Host/compatibility CLI |

## 2. Core 当前已经满足的边界

### 2.1 Domain values and lifecycle

`models.py` 只包含 Work、Execution、Ref 和生命周期/引用类型；`Execution` 通过
`provider_id` 关联抽象 Provider，而不是内嵌 Provider state。`projection.py` 明确把
状态定义为 provider observation，不宣称 native truth。`events.py` 的
`CoreEvent` 是有限 metadata 的 material fact，不是 provider telemetry。

`WorkService` 的 `create_work/complete_work/reopen_work`（`services.py:58-76`）只
处理 Work lifecycle；`ExecutionService.create_execution` 要求调用方明确
`responsibility_intent`，不会从 Work objective 推导。相关责任意图测试已覆盖。

### 2.2 Binding/Input association and Dispatch

`ExecutionService.dispatch_execution`（`services.py:102` 起）完成：

1. canonicalize `(contract_id, Ref)` 输入并计算 digest；
2. 检查 registry contract/provider input limits；
3. 持久化并冻结 INPUT association；
4. 按 provider 声明的 preflight/resolution effect resolve；
5. 调用抽象 `ExecutionProvider.start`；
6. 严格验证 typed `ExecutionStartReceipt`；
7. 对失败和不确定 start 分别记录 failed/ambiguous。

这里没有 Codex/Pi/Claude/Git 分支。`ExecutionStartRequest`、
`ExecutionPreflightRequest`、`ExecutionStartReceipt` 和 `DispatchReceipt` 都是
provider-neutral DTO；`runtime_handle` 明确是 ephemeral、不得持久化。

### 2.3 Ref、Evidence 和 Atomic Finalization

`Ref` 是 bounded flat value，不承载 native payload；`attach_ref` 在 Dispatch 后
冻结 INPUT。`ResourceObservation` 只记录 observer 对 frozen `(contract_id, Ref)` 的
typed claim，Core 不比较 observer、不给出最终 truth。

`ExecutionService.apply_finalization` 和 `CoreRepository.finalize_execution`
将 terminal projection、native/output refs、observation ledger、receipt 和
idempotency key 在单个 SQLite transaction 中处理。首次 terminal projection 被
强制要求走 Finalization API；晚到 observation 不改变 outcome/lifecycle。相关
finalization、input freeze、late evidence 测试通过。

## 3. 边界泄漏与风险

### P0：具体 ResourceProvider 仍放在 `work_core`

`src/agent_box/work_core/providers/resources.py` 直接：

- import `subprocess` 并执行 `git`；
- 实现 `GitWorktreeResourceProvider`、包含 worktree add/remove/snapshot；
- import `config` 和 `resources.profile.ProfileRepo`；
- 实现 `AgentBoxProfileResourceProvider` 及 Profile digest；
- 实现 `ArtifactPromptResourceProvider`。

这违反“Core 不知道 Git/Profile/产品资源”的目录约束。尤其
`plugins/agent-box-preview-resources/plugin.py` 仍从此路径 import
`ArtifactPromptResourceProvider`，而 Harness 的 `codex/runtime.py` 又从此路径
继承 `AgentBoxProfileResourceProvider`。应按以下方式迁移：

- Git worktree/materialization/capture → `agent-box-git`；
- artifact prompt → `agent-box-preview-resources` 或独立 artifact plugin；
- Profile contract provider → `agent-box-harnesses`；
- Core 只保留 `ResourceProvider` protocol 和 `ResourceResolutionContext`。

现有 `plugins/agent-box-git/src/agent_box_git/provider.py` 已经有更严格的 execution
scoped implementation，应优先作为正式实现；不要在 Core 和插件同时保留两套。

### P0：Registry 把 Agent-Box Profile 当作 Core built-in

`work_core/registry.py:12` 从 `resource_contracts` import `CONTRACT_TYPES`，而
`resource_contracts/__init__.py:11-21` 无条件注册 `agent-box.profile@1`。
因此 Core 仍知道 Agent-Box Profile 这一产品概念；`test_resource_contracts.py`
也把它视为初始固定三件套。

建议：

1. `WorkspaceV1`、`PromptFragmentV1` 是否随 SDK 出厂需要单独决定；
2. `AgentBoxProfileV1` 改为 Harness plugin registration contract；
3. `ExtensionRegistry` 初始 catalog 不再硬编码 Profile，插件在 build 时注册；
4. 旧 import 只保留明确期限的 compatibility shim，并增加移除日期/测试。

若暂时保留 `CONTRACT_TYPES`，应把它定义为 SDK catalog 而不是 Core domain
knowledge，并明确 profile contract 不得由 Work Core 直接构造或解析。

### P1：Resource contract 仍有产品命名和语义

`AgentBoxProfileV1` 字段和错误消息直接使用 “Agent-Box profile”，并包含
`agent_type`、默认 provider `agent-box-profile`。这不是通用 Resource Contract；
它应属于 Harness/Profile plugin。`WorkspaceV1` 和 `PromptFragmentV1` 是可保留的
通用 immutable values，但具体 provider 不应回到 Core。

### P1：旧 CLI 把 Harness、Git、Workflow、ACP 都命名为 Core

`cli/commands/work.py:12-18` 直接 import：

- `work.acp.AcpProcessSessionProvider`；
- `work.artifacts.FilesystemArtifactProvider`；
- `work.workflow.FixedPlanExecuteReviewWorkflow`；
- `work.workspace.GitWorktreeProvider`；
- legacy `work.service.WorkService`/`WorkRepository`。

该 command set 的 create 参数还要求 planner/executor/reviewer Profile，方法名包含
`run/replace/stop/cleanup`，属于旧固定 workflow + Harness Host，不是 frozen Core。
这与 `work_core/cli.py` 的 provider-neutral create/complete CLI 是两套并列实现，
存在命名误导和双实现风险。

`cli/commands/core.py`、`profile.py` 和 `cli/shell.py` 还直接管理 Profile、sessions、
MCP、skills、hooks、prompt、bwrap launch；它们必须迁到 Harness/Web/compatibility
层。根 `cli/__init__.py` 的 `cmd_doctor`（约 103-128 行）直接检查 `git`、`codex`、
Web static、MutationOwner，也应变成插件提供的 readiness checks，root 只聚合结果。

### P1：Extension API 混合了 Host 协议，但尚未泄漏进 Work Core

`extensions/api.py` 定义 `ResourceSelector`、`HarnessProfileManager`、`HostControl`
和 `PluginRegistration.host_controls/harness_managers`。这些是合理的 Host/Plugin
扩展面，但不是 Work Core domain API。当前它们位于 `extensions/`，没有被
`work_core` domain service 直接 import，因而是可接受的外层边界；应在重构后继续
保持这一点，不要为了方便把这些协议搬入 `work_core`。

`HostFinalizationCoordinator` 也应保持在 extension/Host 层：它收集插件贡献后才
调用 Core `ExecutionFinalizationRequest`，Core 不应反向发现 Host controls。

### P1：Migration 目录混合旧产品 schema 与 Core schema

当前 migration runner 在 `core/db.py:31-72` 只扫描一个全局 `migrations/` 目录，
按单一版本号顺序执行：

- `001_init.sql`：`profiles`、`sessions`，注释已经明确是本地 profile/session
  lifecycle，不是 Work Core；
- `002_rename_claude_md_ref.sql`：旧 Claude-specific column 改名；
- `003_work_core.sql`：旧 `works/work_attempts/work_decisions/work_artifacts/
  work_handoffs` 固定 workflow schema；
- `004_minimal_work_core.sql`：真正的 Minimal Core tables；
- `005_resource_contract_inputs.sql`：reserved migration；
- `006_resource_contract_inputs.sql`：重建 dispatch table，并保留旧 archive；
- `007`/`008`：ResourceObservation ledger/evidence metadata；
- `009`：Finalization receipt persistence。

`004-009` 应归 Core persistence。`001-003` 是历史/legacy schema：不能从已安装用户
数据库中删除，但不应继续作为新的 Core public model。建议 migration runner 支持
Core namespace 与 plugin namespace，或者至少把新安装默认 schema 与历史 upgrade
路径分开；`006` 的 archive 必须继续保留用于升级可追溯性。`005` 仅保留为历史占位，
不要继续在 reserved number 上添加语义。

### P2：Repository 小问题

`work_core/repository.py` 中 `list_works` 在约 138 和 142 行重复定义；后者覆盖前者。
这不改变当前结果，但应在正式冻结前删除重复定义，避免以后出现仅修改了被覆盖版本
的错误。

## 4. 应冻结的公共 API

以下接口已经有足够稳定的 provider-neutral 形状，建议作为 Core v1 freeze 候选：

### Values

- `Work`、`WorkLifecycle`；
- `Execution`、`ExecutionProjection`、`Phase`、`Outcome`、`Freshness`；
- `Ref`、`RefType` 及 bounded metadata 约束；
- `CoreEvent`、`EventType`；
- `ResourceObservation` 及其 `Kind/Result/Role/Coverage`；
- `ExecutionFinalizationRequest`、`FinalizationReceipt`。

### Registry/Provider protocol

- `ProviderDescriptor`；
- `ResourceProvider.resolve(contract_id, ref, context)`；
- `ExecutionProvider.descriptor/capabilities/input_limits/start/observe`；
- `ExecutionStartRequest`、`ExecutionPreflightRequest`、
  `ExecutionStartReceipt`、`DispatchReceipt`；
- `ExtensionRegistry.register_contract/register_*_provider/get/require_capability`。

### Service/repository boundary

- `WorkService.create_work/complete_work/reopen_work`；
- `ExecutionService.create_execution/dispatch_execution/observe_projection/`
  `apply_finalization/record_resource_observations`；
- CoreRepository 的 Work/Execution/Ref/Event/Dispatch/observation/finalization
  读写 API。

冻结时应明确以下项目不是 v1 public API：

- `ExtensionRegistry.register_resource_provider(provider_id, provider)` 的 legacy
  双参数形式；
- `ExecutionStartRequest.inputs` grouped compatibility view；
- `DispatchReceipt.legacy_correlation`；
- `work_core.providers.*` concrete classes；
- `resource_contracts.CONTRACT_TYPES` 中 Harness-specific built-ins；
- `work_core/cli.py` 以外的旧 REPL/work command set。

## 5. migrations 归属建议

推荐目标布局：

```text
Core migration namespace
  core_works
  core_executions
  core_execution_refs
  core_events
  core_dispatches
  core_resource_observations
  core_execution_finalizations

Harness plugin namespace
  profile revisions / projection / credentials metadata

Git plugin namespace (如需要持久化 ownership)
  execution-scoped worktree ownership/output metadata

Web plugin namespace (如需要)
  operation persistence / host mutation records

Legacy upgrade namespace
  001-003 compatibility reads and one-way migrations
```

Core migration 不应创建 `profiles`、`sessions`、Codex/Harness config 或固定
workflow tables。Plugin migration 的执行应由 plugin/host migration registry 显式
注册，不能让 Core repository 读取 plugin tables。

## 6. CLI 最小职责

Root CLI 只应负责：

1. 解析全局参数和命令路由；
2. 注册/调用 extension host；
3. 提供 `plugins list/inspect/doctor` 这类通用 extension diagnostics；
4. 提供 `work-core` 或等价命名的薄 Core diagnostic commands（create、complete、
   必要的 inspect），不构造 Git/Harness/workflow；
5. 聚合插件提供的 Web/Harness/Git readiness checks。

以下命令不应在 root Core CLI 内实现：

- Profile 创建/修改/删除和具体 config projection；
- MCP、Skills、Hooks、Instructions、Permissions 管理；
- `agent-box web` 的 server/static/browser 启动细节；
- Codex/Pi/Claude binary 检查和 session lifecycle；
- 固定 plan-execute-review workflow；
- Git worktree 创建、清理和 output capture；
- bwrap/sandbox 产品参数。

## 7. Core freeze 验收测试

现有测试覆盖了大部分正向语义，但冻结前应补上以下静态和架构验收：

### 必须新增

- **全目录 import guard**：对 `work_core/**/*.py`（包括 `providers/`）禁止
  `git/codex/pi/claude/opencode/tmux/mcp/acp/bwrap/web` 的实现 import；允许
  provider-neutral 字符串出现在测试 fixture 或 Ref provider id 中，但不能有
  subprocess/native implementation。
- **No concrete provider implementation**：Core 源码不得 import
  `resources.profile`、`config`（除可独立的 DB adapter）、任何 plugin package。
- **Dynamic contract test**：在空 registry 中由 plugin 注册 Profile-like contract；
  Core 不应依赖初始 `AgentBoxProfileV1`。
- **CLI dependency guard**：`work_core/cli.py` 只能 import Core；root/legacy CLI
  不得被伪装成 `Work Core` command set。
- **Migration ownership test**：新安装只创建 Core tables；历史 001-003 数据升级
  可读且不被错误解释为 frozen Core state；plugin migration 不能由 Core 自动扫描。
- **Public API surface test**：明确导出列表，防止 `providers.*` concrete class
  或 Host protocol 被意外加入 Core exports。
- **Duplicate implementation test**：根 CLI 不得同时构造 legacy WorkService 和
  Minimal Work Core service；旧入口只能是带期限的 compatibility shim。

### 现有且应继续保留

- Work lifecycle 与 execution responsibility isolation；
- Ref boundedness/immutability；
- input canonicalization/digest/freeze；
- provider preflight/resolution effects；
- accepted/failed/ambiguous Dispatch replay；
- projection monotonicity 与首次 terminal 必须 Finalization；
- atomic finalization idempotency/conflict；
- append-only observations、frozen input 校验、late evidence；
- third-party plugin registration atomicity/conformance；
- provider-neutral Core vertical slice（fake ResourceProvider + fake ExecutionProvider）。

## 8. Freeze gate

建议按四个 gate 执行后再宣布 Core freeze：

1. 将 `work_core/providers/resources.py` 全部迁出，并让正式插件只提供一套实现；
2. 从 Core built-in catalog 移除 Harness/Profile-specific contract，保留有期限的
   import shim；
3. 把旧 CLI/workflow/Profile/Web/Git 代码改成插件或明确兼容层，Core CLI 改名/隔离；
4. 拆分 migration ownership，并通过上面的静态 import、clean install、历史升级
   和 full test matrix。

完成这四项后，**Core domain/API 可以冻结；当前版本不应直接标记为 fully frozen**。
