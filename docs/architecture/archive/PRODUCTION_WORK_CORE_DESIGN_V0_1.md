# Production Minimal Work Core Design v0.1
>
> Historical record — describes an earlier architecture or validation state and is not current implementation guidance.

> 文档导航：[总目录](../README.md)

状态：**Design candidate — Phase 1 implementation input**
权威输入：`docs/contracts/work-core/v0_1/` 的九份冻结 contract。
范围：production Minimal Work Core 的 additive Phase 1；不采用 spike 实现代码。

## 1. 目标与冻结设计律

Phase 1 的唯一闭环是：创建 Work → 创建 Codex Execution → 通过既有 profile isolation dispatch → 发现 Codex thread ID → 保存 material projection/refs/events → 同一 Execution resume → 用户/host 显式关闭 Work。

设计遵守十条冻结律：Work 是有界工作的稳定 identity；Work 独立于 Execution；Execution 不决定 closure；native state provider-owned；连续 native identity 的 resume 不新建 Execution；provider replacement 新建 Execution 但不新建 Work；workflow 不属于 Core orchestration；ledger 只记 cross-system facts；Core 无 provider branch；外部资源只通过 Ref 引用。

## 2. Existing Repository Inventory

| Existing capability | Reuse decision | Boundary |
| --- | --- | --- |
| `core.db` | Reuse | SQLite connection、migration discovery、shared write lock；Phase 1 增量 migration，而非 spike JSON store |
| `config.agent_box_home()` | Reuse | storage root resolution；tests 继续通过 `AGENT_BOX_HOME` 隔离 |
| `resources.profile` / agent registry | Consume | Codex profile validation、metadata lookup；Core 不读取 profile config payload |
| `launch.build_launch_plan()` | Consume via facade | 提供 bwrap argv/env/cwd；Core 绝不调用 `launch.launch()` |
| `resources.sessions` | Preserve, not depend on | legacy profile-launch process record，不能作为 Execution/native-session persistence |
| `project_space` | Preserve, optional Workspace authority | Phase 1 可接 WorkspaceRef，不重写 workspace lifecycle |
| current `work/` package / migration 003 / work CLI | Preserve, not reuse | 当前未提交实现有 roles、fixed workflow、phase、workspace、attempt/handoff；与冻结 contract 不兼容，必须双轨运行 |
| ACP adapter | Preserve, not use in Phase 1 | ACP session model 不等价于 Codex CLI JSONL thread identity |

### Compatibility conclusion

旧 Profile/launch/session/GUI 保留。新的 Core 应新增独立 `work_core` package 和 optional future CLI command；不改变 legacy `work` package。Phase 1 需要一个 **CodexLaunchFacade**：它消费 `build_launch_plan()`，自行以 `Popen` 启动 JSONL command，并将 process observation 与 legacy sessions record 分离。这样既复用 bwrap/profile isolation，也不让 Core 承担 `launch.launch()` 的 `SystemExit` 与 legacy session side effect。

## 3. Domain Core

### Work

```text
Work(id, objective, lifecycle, closure_reason?, metadata, created_at, updated_at, version)
```

`lifecycle ∈ {open, completed, abandoned}`。`reopen` 是明确 transition。metadata 是受限平面 `str -> str`，有长度/项数限制。

Work 不包含 profile、provider、session、workflow、phase、workspace bytes、artifact bytes、retry、scheduling、permissions 或 transcript。Execution outcome 不自动更新 Work lifecycle。

### Execution

```text
Execution(id, work_id, provider_id, projection, provenance, created_at,
          dispatched_at?, started_at?, ended_at?, version)
```

Native/input/output refs 均通过 relation table 关联。Execution 不包含 native JSONL、Codex config、thread history、checkpoint、process internals 或 arbitrary provider payload。

### Projection

```text
ExecutionProjection(
  phase: active | terminal | unknown,
  outcome: succeeded | failed | cancelled | abandoned | null,
  resumable_now: bool | null,
  freshness: observed | stale | unreachable,
  observed_at: timestamp
)
```

Validation：non-terminal phase 不得有 outcome；terminal phase 必须有 outcome；unknown 的 outcome 为 null；`resumable_now` 可为 null（native query unavailable）。`waiting/queued/retrying/paused` 不进入 Core vocabulary。

## 4. Runtime and Provider Contract

```text
ExecutionProvider
  descriptor() -> ProviderDescriptor
  capabilities() -> ProviderCapabilities
  start(StartRequest) -> DispatchReceipt
  observe(NativeRef) -> ProviderObservation

optional, capability-qualified:
  resume(ResumeRequest), cancel(...), send_input(...), stream(...),
  pause(...), retry(...), approve(...), attach(...), reconnect(...)
```

`ProviderCapabilities.supports_resume` 描述 provider 的通用能力；Execution 的 `projection.resumable_now` 描述该 native instance 的当前事实。ExecutionService 在调用 `resume` 时必须同时检查二者。

Provider 只返回 provider-neutral `ProviderObservation`（projection、new refs、bounded diagnostic summary、optional native error code）。Core 不具有 `if provider == "codex"`。

## 5. Ref and Event Ledger

Ref 是 immutable value：`type`、`provider`、`native_id`、optional `uri`、bounded `str -> str` metadata。语义 type：SessionRef、WorkflowInstanceRef、RunRef、WorkspaceRef、ArtifactRef。禁止 nested payload、transcript、checkpoint blob、command output、graph 和 artifact bytes。

Event ledger 只写 material facts：WorkCreated、WorkCompleted、WorkReopened、ExecutionCreated、ExecutionDispatchRequested、NativeRefDiscovered、ExecutionStarted、ExecutionProjectionChanged、ExecutionTerminal、RefAttached。poll 没有 material change 时不写 event。

## 6. Persistence Proposal

在现有 `agent-box.db` 新增单一增量 migration（建议 `004_minimal_work_core.sql`），不改已有 001–003 表：

| Table | Purpose |
| --- | --- |
| `core_works` | Work current state、closure、bounded metadata、optimistic version |
| `core_executions` | Execution current projection、provider id、timestamps、optimistic version |
| `core_execution_refs` | input/output/native ref rows；type/provider/native_id/uri/metadata JSON（仅 flat map） |
| `core_events` | append-only material fact ledger；subject/idempotency key/type/data JSON（bounded fact data） |
| `core_dispatches` | durable dispatch intent, idempotency key, state (`requested/dispatched/reconciled`) and provider correlation ref |

`projection` 使用显式 scalar columns，不存 JSON blob。Ref metadata/event data 由 repository validation 后编码。SQLite transaction 覆盖“current state update + event append + version check”；native dispatch 永远在 transaction 之外。

### Idempotency and restart recovery

1. 先在 transaction 内创建 Execution + `ExecutionDispatchRequested` + dispatch intent（caller idempotency key 唯一）。
2. 再调用 provider。thread ID 一旦从 JSONL 出现，transaction 原子地保存 SessionRef、projection、NativeRefDiscovered/Started。
3. 若 process/Core 在两者之间崩溃，dispatch 保持 `requested`，Execution projection 为 `unknown/stale`；recovery 不重新盲发，而是按 provider-native correlation 能力 reconcile。Codex Phase 1 若没有已知 thread ID，标记 `unknown` 并要求显式 host recovery/abandon，而非猜测。

## 7. Error Model and Concurrency

Provider-neutral errors：`ProviderUnavailable`、`DispatchFailed`、`NativeIdentityMissing`、`ObservationFailed`、`CapabilityUnsupported`、`ExecutionNotResumable`、`InvalidProjection`、`ConcurrencyConflict`。

每个 command 用 expected `version` compare-and-swap。并发 observe 只接受较新 `observed_at` 或返回 conflict；resume/cancel 以 Execution version 串行；close Work 不取消 active Execution，只记录显式 closure，host policy 决定后续行为。同一 Work 可以关联多个 Execution。

## 8. Codex Phase 1 Adapter

```text
ExecutionService
  -> ProviderRegistry["codex-cli"]
  -> CodexExecutionProvider
  -> CodexLaunchFacade(build_launch_plan(profile, extra_args, cwd))
  -> bwrap + Codex CLI `exec --json` / `exec resume --json THREAD_ID`
```

Facade 从 `LaunchPlan` 获得隔离 argv/env/cwd，并替换末端 agent args；它不 import Work repositories。Codex provider 流式解析 JSONL：`thread.started` 发现 SessionRef；`turn.started` 投影 active；`turn.completed` 投影 terminal/succeeded 且根据 native session semantics 设置 resumable_now；`turn.failed` 投影 terminal/failed；malformed stream/exit without authoritative terminal event 为 unknown/stale 或 DispatchFailed。完整 JSONL 写入 provider-owned diagnostics location（如启用），Core 只保存 ArtifactRef/RunRef。

`resume_execution(execution_id)` 保持同一 execution_id，要求 SessionRef、provider supports resume 及 `resumable_now is True`。新 Codex thread 或 provider replacement 必须 `create_execution`。

## 9. Directory Design

建议 additive package，避免触碰已有 `agent_box.work`：

```text
src/agent_box/work_core/
  models.py          # Work, Execution, Ref value types
  projection.py      # enums + validator
  events.py          # event types/value
  repository.py      # SQLite persistence/CAS
  services.py        # WorkService + ExecutionService
  errors.py
  registry.py
  providers/
    base.py
    codex.py
    codex_jsonl.py
    codex_launch.py
```

不在 Phase 1 修改 GUI；CLI integration 作为独立、非默认 command，且只在 services/tests 已稳定后添加。

## 10. Ownership Matrix

| Concern | Owner |
| --- | --- |
| Work identity/objective/closure | Work Core + explicit host command |
| Execution identity/current projection | Execution Core from provider observation |
| dispatch intent/idempotency | ExecutionService + storage |
| native thread/process/transcript | Codex provider |
| profile/config/bwrap isolation | existing Agent-Box launch/profile capability |
| legacy launch session audit | existing sessions repository |
| workspace lifecycle | existing Workspace authority, not Phase 1 Core |
| artifact bytes | provider/artifact authority |
| event facts/refs | Core persistence |
| scheduling/notification/orchestration | host/extensions, out of scope |

## 11. Phase 1 Slice, Tests and Migration

Only Codex is wired. Tests: Work lifecycle; projection validation; Ref bounds; registry fake provider; Codex JSONL parser; resume same execution; malformed/process failure; SQLite reload/events/native ref; architecture import boundary. No real Codex invocation in unit suite; an opt-in smoke uses a profile and isolated workspace.

Additive migration sequence: Phase 1 core tables/Codex facade; Phase 2 normalize other harnesses; Phase 3 LangGraph/Human/CI extensions; Phase 4 official TUI/CLI Work UX; Phase 5 GUI/ecosystem. Existing profile system, legacy sessions, GUI and uncommitted `work/` package remain functional and untouched throughout.

## 12. Known Risks

Codex native dispatch correlation before `thread.started` is the major unresolved distributed-systems window. SQLite is single-host only but adequate for Phase 1 with explicit locks/CAS. A provider-owned diagnostic log needs retention/access control outside Core. The existing `work/` package shares a concept name but has incompatible semantics; package isolation and dual-run documentation are mandatory until a separately authorized migration.

## Contract Compliance

All ten frozen design laws are satisfied by this design. No hard architecture failure is required: no provider fields in Work; no transcript/checkpoint in Execution; Core imports provider interfaces only; no switch; completion does not close Work; same native identity resumes same Execution; Ref and EventLedger stay bounded; no scheduler/workflow engine.
