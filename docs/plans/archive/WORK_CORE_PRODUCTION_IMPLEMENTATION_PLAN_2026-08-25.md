# Agent-Box Work Core Production Implementation Plan — 2026-08-25
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 文档导航：[总目录](../README.md)

- 计划日期：2026-08-23
- 目标日期：2026-08-25
- 输入：[ADR-0001](../adr/0001-execution-attempt-vs-session-continuity.md) 至 [ADR-0005](../adr/0005-execution-observation-and-projection-semantics.md)
- 范围：把已冻结语义落到 Production Minimal Work Core，并完成真实 Codex self-use vertical slice
- 最终判断：**READY WITH SCOPE CUT**
- 本文性质：implementation plan；不新增 ADR，不实施 production 修改

## Executive summary

当前 Work Core 已有可用的 Work/Execution/Ref/Event SQLite 骨架、真实 Codex launch facade、JSONL parser 和 opt-in CLI，但 runtime responsibility boundary 尚未闭合：Dispatch 只会写 `requested`，CLI 随后绕过 Dispatch 直接 `provider.start()`；同一 Execution resume、自由 capability dict、Projection last-write-wins 和 observation 分事务仍与 ADR-0001～0005 冲突。

8/25 前可以跑出真实 Work demo，但必须严格砍 scope。P0 只落地：

1. Execution terminal/continuation 不变量；
2. one-Dispatch、`requested → starting → started`、submission digest 与 canonical correlation transaction；
3. typed Provider capability/start result；
4. typed monotonic observation 和 refs/Event 原子提交；
5. weak Codex 在线执行与新 Execution continuation；
6. 一次性 restart recovery pass；
7. 可查询 Work/Execution/Dispatch/Refs/Events 的 opt-in CLI。

当前 Codex 不会被增强成 strong recovery Provider。它合法地声明三个 optional capability 都 unsupported；在线期间 D1 保持 `starting`，E1 可进入 active/terminal。Core crash 后若 terminal 尚未持久化，则 D1 unresolved、Projection 变成 last-known phase + unreachable，且禁止 blind redispatch。

P0 不实现完整 Binding、ExecutionResourceFact 表、no-side-effect 自动重投、native-idempotent redelivery、manual-resolution UI、poll scheduler、GUI 或多 Provider。这些 scope cuts 是 8/25 可交付性的前提。

## 8/25 demo definition

### Required vertical slice

```text
create Work W1
→ create Execution E1
→ accept Dispatch D1
→ D1 requested
→ claim D1 starting
→ launch real Codex through typed Provider.start
→ apply online authoritative/provisional observations
→ atomically persist Projection + Refs + Event
→ E1 terminal
→ W1 remains open
→ create E2 under W1
→ attach E1 SessionRef as E2 INPUT
→ accept D2 and launch Codex native continuation through Provider.start
→ E2 terminal
→ explicitly complete W1
→ query W1/E1/E2/D1/D2/Refs/Events
```

### Demo acceptance criteria

- W1 identity across E1/E2 is unchanged；
- E1 and E2 have different Core IDs、dispatch IDs、timestamps and outcomes；
- E1 remains terminal after E2 starts；
- SessionRef can be shared, but E2 records it as INPUT and it is never Dispatch correlation；
- each Execution has at most one Dispatch；
- Codex D1/D2 remain `starting` because Provider is weak；
- structured `turn.completed`/`turn.failed` can establish authoritative terminal；
- EOF/timeout/process loss cannot manufacture terminal；
- Work remains open after Execution success and closes only through `complete-work`；
- restart pass never calls `start()` for a weak `starting + correlation=NULL` Dispatch；
- refs/events/projection survive a fresh repository/Core process；
- targeted P0 suite and one gated real-Codex smoke pass。

### Explicit demo scope cuts

- Use `python -m agent_box.work_core.cli` as the production opt-in surface；do not merge with the existing legacy `agent-box work` namespace before demo；
- no real strong Provider；`started`/`observe(C1)` path is proven with a contract mock；
- no automatic no-side-effect retry or native redelivery；DTO/capability vocabulary exists, execution policy is deferred；
- no generic persisted launch-payload store；requested recovery requires Host to reconstruct and resubmit the same launch basis, verified by digest；
- no separate material-facts table；P0 material evidence is normalized lifecycle Event plus typed Refs；
- no Binding implementation。

## Current-state audit

### `src/agent_box/work_core/models.py`

| Item | Assessment |
|---|---|
| Current behavior | `Work`、`Execution`、bounded `Ref` are immutable dataclasses. Execution already has one-cycle timestamps and version, but no typed Dispatch row/value. |
| ADR conflict | No direct Work conflict. Execution itself does not guard terminal irreversibility or one-dispatch; those are currently left entirely to Service/DB. Ref has no shared versioned JSON codec for canonical correlation. |
| Modification | Keep Work/Execution/Ref ontology. Add only implementation values/helpers needed by repository: typed `DispatchState`/`DispatchRecord` or equivalent row DTO, and versioned Ref codec with bounds. Do not add Attempt/Session aggregate. |
| Blocks demo? | **Yes**, because Dispatch and correlation must stop being raw SQLite rows/strings. |
| Risk | Low. Avoid turning Dispatch row DTO into a second Execution lifecycle. |

### `src/agent_box/work_core/projection.py`

| Item | Assessment |
|---|---|
| Current behavior | Correctly rejects terminal without outcome and nonterminal with outcome. Stores `phase/outcome/resumable_now/freshness/observed_at`. |
| ADR conflict | Docstring still implies latest Provider observation. No ordering evidence. `resumable_now` is still colocated with lifecycle. |
| Modification | Clarify monotonic accepted view; add nullable `last_native_sequence`. Keep `resumable_now` for compatibility but remove it from resume authorization and ordering decisions. Define Observation authority/disposition/result enums either here or in a small `provider_contract.py`. |
| Blocks demo? | **Yes** for terminal monotonicity; `last_native_sequence` is required by P0 invariant tests even though Codex supplies none. |
| Risk | Medium. Positional constructor calls must be converted to keywords before adding a field. |

### `src/agent_box/work_core/services.py`

| Item | Assessment |
|---|---|
| Current behavior | Work create/complete/reopen is explicit and CAS-backed. Execution create works. `request_dispatch()` only deduplicates by key. `observe_projection()` compares timestamps and can overwrite phase. `apply_observation()` writes Projection then Refs separately. `resume_execution()` reuses old Execution. |
| ADR conflict | Conflicts with ADR-0001 one-attempt/resume rule, ADR-0002 one-dispatch/claim rule, ADR-0005 terminal/order/transaction rules. `dispatched_at` is never set. |
| Modification | Delete `resume_execution()`. Add new-Execution continuation flow using INPUT SessionRef. Split/organize application operations into Execution/Dispatch/Observation services without introducing domain entities. Replace direct Projection submission with typed observation apply. |
| Blocks demo? | **Critical blocker**. |
| Risk | High. This is the primary semantic cutover and must be protected by tests before CLI migration. |

### `src/agent_box/work_core/repository.py`

| Item | Assessment |
|---|---|
| Current behavior | Current-state SQLite repository with thread-process write lock and Execution CAS. Dispatch supports create/get-by-key only. Each Ref attach is its own transaction. |
| ADR conflict | No one-dispatch DB invariant, no Dispatch version/CAS, no digest, no claim/mark-started/recovery queries, no Ref correlation codec, no observation-bundle transaction. |
| Modification | Add typed Dispatch reads and atomic methods: accept Dispatch + `dispatched_at`, claim, mark-started + NATIVE Ref + Event, list recovery candidates, and atomic observation apply. Preserve current-state design; no replay. |
| Blocks demo? | **Critical blocker**. |
| Risk | High around SQLite transaction boundaries and migration compatibility. |

### `src/agent_box/work_core/registry.py`

| Item | Assessment |
|---|---|
| Current behavior | `capabilities() -> Mapping[str,str]`, all Providers must expose `observe`, string `require_capability`, no dependency validation. |
| ADR conflict | Direct ADR-0004 conflict. Method presence is currently treated as capability and feature keys include resume/cancel/stream. |
| Modification | Introduce frozen typed descriptor/capabilities, base `start`, conditional observer/recovery protocols, registration-time validation and typed accessors. |
| Blocks demo? | **Yes** because weak Codex must be represented honestly and DispatchService must consume typed start results. |
| Risk | Medium. Update provider/tests atomically with registry change to avoid a long broken interval. |

### `src/agent_box/work_core/providers/codex.py`

| Item | Assessment |
|---|---|
| Current behavior | Returns raw `ManagedCodexProcess`, declares arbitrary start/observe/resume/cancel/stream capabilities, has `resume()` alias and fake `observe()` that always yields unknown/unreachable. |
| ADR conflict | Violates ADR-0001 and ADR-0004; `observe(thread_id)` does not consume a durable invocation correlation. |
| Modification | Declare weak typed capabilities. `start(DispatchStartRequest)` validates Codex launch basis and returns `Indeterminate(provider_runtime=ManagedCodexProcess)`. Remove Core-facing `resume()` and `observe()`. Keep native continuation command construction inside Codex launch adapter. |
| Blocks demo? | **Critical blocker**. |
| Risk | Medium. Do not accidentally classify SessionRef/PID as correlation. |

### `src/agent_box/work_core/providers/codex_jsonl.py`

| Item | Assessment |
|---|---|
| Current behavior | Parses cumulative JSONL into `ExecutionProjection`; thread/turn events create SessionRef/active/terminal. Malformed/empty/nonzero exit produces unknown stale/unreachable. |
| ADR conflict | Provider writes Projection shape directly; no authority/disposition. A late unknown can erase active/terminal under current Service. |
| Modification | Return `ObservedExecutionState` or `ObservationUnavailable`. Mark structured thread/turn events authoritative as appropriate. Treat EOF/nonzero/parse failure without structured terminal as unavailable/provisional. No native sequence for Codex v0.1. |
| Blocks demo? | **Critical blocker**. |
| Risk | High if terminal is applied before output Refs are ready; capture path must buffer terminal until final atomic apply. |

### `src/agent_box/work_core/providers/codex_launch.py`

| Item | Assessment |
|---|---|
| Current behavior | Real isolated Codex launch through existing LaunchPlan and `script(1)` JSONL capture; provider-native `start_args` and `resume_args` are already isolated here. |
| ADR conflict | None in the launch mechanism. The caller currently invokes it outside DispatchService. |
| Modification | Preserve facade. Keep `resume_args()` as a Provider-native launch command used for a new Execution. Add deterministic semantic digest/canonical launch-basis helper if needed, owned by Codex/Host rather than Core. |
| Blocks demo? | Reusable and already validated. Only call-path migration blocks. |
| Risk | Low. Avoid unrelated changes to profile isolation or launch.py. |

### `src/agent_box/work_core/cli.py`

| Item | Assessment |
|---|---|
| Current behavior | `start-codex` creates E/D then calls raw start. `_capture()` directly applies projections. `resume-codex` restarts the old Execution. No show/recovery commands. |
| ADR conflict | Bypasses Dispatch state machine, supports same-Execution resume, treats timeout as replacement unknown, and can persist terminal before final output Refs. |
| Modification | Route launch through DispatchService; replace `resume-codex` with `continue-codex` that creates E2 + INPUT SessionRef + D2; add show commands and one-shot recovery entry. Buffer final terminal and outputs into one observation transaction. |
| Blocks demo? | **Critical blocker**. |
| Risk | High because this is the real side-effect path. Keep module CLI opt-in to avoid touching legacy workflow CLI. |

### `src/agent_box/migrations/004_minimal_work_core.sql`

| Item | Assessment |
|---|---|
| Current behavior | Creates `core_works/executions/execution_refs/events/dispatches`. Dispatch has nullable correlation but no state constraint, digest, version or unique execution ID. |
| ADR conflict | Violates ADR-0001～0003 persistence invariants; Execution lacks optional sequence. |
| Modification | Add migration 005 that rebuilds only `core_dispatches` with constraints and adds `core_executions.last_native_sequence`. No persistent new tables. Existing pre-005 Dispatch rows migrate fail-closed to `starting` with an unverifiable legacy digest. |
| Blocks demo? | **Critical blocker**. |
| Risk | Highest single rollback risk. Must test fresh install and 004→005 upgrade. |

### `events.py` / `errors.py` / `__init__.py`

| Item | Assessment |
|---|---|
| Current behavior | Material event enum and a few errors exist; package exports old ProviderDescriptor. |
| ADR conflict | No DispatchStarting/DispatchStarted/ObservationConflict events or typed conflict/rejection errors/results. |
| Modification | Add only bounded material event/reason values; export new typed contract; delete `ExecutionNotResumable` after old service removal. Do not add telemetry events. |
| Blocks demo? | Yes as supporting code. |
| Risk | Low. Event names must not conflate Execution active with Dispatch started. |

### Tests

| Item | Assessment |
|---|---|
| Current behavior | 25 current Production Work Core directed tests pass. The legacy `tests/test_work_core.py` has a stale exact schema-version assertion (`3` while migration 004 already exists). Existing vertical slice explicitly resumes the same Execution. |
| ADR conflict | Major invariants and crash windows are untested; several tests freeze rejected semantics. |
| Modification | Replace same-E resume/arbitrary capability tests, add dispatch/observation/restart contract tests, migration upgrade tests and gated real Codex smoke. Update legacy migration assertion to version 5 as a real self-use fix. |
| Blocks demo? | **Yes**. Red tests must represent intended change, not be disabled. |
| Risk | Medium. Real Codex test must be opt-in, not part of deterministic unit suite. |

### Legacy `src/agent_box/work/` and `agent-box work`

| Item | Assessment |
|---|---|
| Current behavior | A separate fixed plan/execute/review Work system from migration 003 is registered in the main REPL as `work`. |
| ADR conflict | It is not the Production Minimal Work Core described by ADR-0001～0005 and has overlapping product naming. |
| Modification | **Do not modify in P0.** Use the isolated `agent_box.work_core.cli` module for the demo. Naming/deprecation/integration is P1. |
| Blocks demo? | No if demo commands are explicit. |
| Risk | User confusion; demo must say which runtime is being shown. |

## ADR-to-code conflict matrix

| ADR | Frozen invariant | Current conflict | Production resolution | Batch |
|---|---|---|---|---|
| 0001 | Execution is one attempt; terminal irreversible | `resume_execution()` and `resume-codex` mutate E1 again | Delete same-E resume; `continue-codex` creates E2 and attaches S1 INPUT | 1, 6 |
| 0001 | 0..1 Dispatch per Execution | DB only has unique idempotency key | `UNIQUE(execution_id)` plus service/database convergence | 1, 3 |
| 0001 | single-cycle timestamps | `dispatched_at` unused; terminal→active can retain ended_at | write-once timestamps in atomic services; block reopening | 1, 4 |
| 0002 | requested→starting→started | only requested is persisted | Dispatch state enum, claim CAS, mark-started transaction | 1, 3 |
| 0002 | immutable dispatch intent | no digest | persist non-empty SHA-256 submission digest; reject mismatch | 1, 3 |
| 0002 | unknown unsafe | CLI raw-starts after request | all side effects pass through claim/delivery service; starting never blindly restarts | 3, 6 |
| 0003 | started iff canonical Ref persisted | correlation field unused/raw | versioned Ref JSON and state/correlation CHECK; atomic mark-started + NATIVE ref | 1, 3 |
| 0003 | observe vs recover_start separated | generic fake `observe(native_ref)` | conditional typed protocols and recovery driver routing | 2, 6 |
| 0004 | typed static capability | arbitrary dict and string lookup | typed enum descriptor, registry validation/accessors | 2 |
| 0004 | evidence is per Dispatch | raw ManagedCodexProcess returned as if start result | sealed correlated/no-side-effect/indeterminate results | 2, 5 |
| 0005 | Projection monotonic | timestamp last-write-wins | typed authority + sequence guard + terminal freeze | 4 |
| 0005 | unavailable only changes freshness | Codex returns replacement unknown | `ObservationUnavailable`; preserve last lifecycle | 4, 5 |
| 0005 | observation bundle atomic | Projection and every Ref use separate transaction | single repository apply transaction with CAS/Event | 4 |

No matrix row requires a new first-class entity or persistent table.

## P0 implementation scope

### Batch 1 — Persistence and frozen identity guards

Purpose：先建立无法被上层绕过的数据边界。

Changes：

- migration 005；
- dispatch state/ref codec values；
- one-dispatch uniqueness；
- Dispatch version and submission digest；
- state/correlation CHECK；
- optional `last_native_sequence`；
- terminal/nonterminal structural constraints remain in model/service；
- remove `resume_execution()` contract test expectation before adding replacement。

Independent acceptance：

- fresh database reaches schema 5；
- 004 database upgrades without deleting Work/Execution/Refs/Events；
- existing legacy Dispatch rows become fail-closed starting/unresolved；
- second Dispatch for same Execution fails at DB boundary；
- started+NULL and starting+correlation are rejected；
- Ref JSON round trips。

### Batch 2 — Typed Provider v0.1 contract

Purpose：让所有后续 side-effect/recovery decisions 基于 typed guarantee，而非 method probing。

Changes：

- descriptor/capability enums；
- start/recovery/result/observation DTO definitions；
- base and conditional Protocols；
- registry dependency validation and typed accessors；
- weak/strong/intermediate contract fakes。

Independent acceptance：

- weak Provider can register with start only；
- durable correlation without observe is rejected；
- native redelivery without start recovery is rejected；
- method presence without descriptor claim is never called；
- correlated result from unsupported Provider is rejected by Core。

### Batch 3 — Dispatch application service

Purpose：把 CLI/raw Provider call 之前的 responsibility boundary真正跑通。

Changes：

- atomic `request_dispatch(execution_id, idempotency_key, submission_digest)`；
- same key + same execution + same digest reloads canonical D1；
- same key/different digest or same E/different key rejects；
- accept D1 与 `Execution.dispatched_at` 同事务；
- `claim_dispatch()` CAS requested→starting；
- `deliver_requested()` validates/reconstructs request before claim, then calls Provider once；
- correlated result triggers atomic mark-started + correlation Ref + NATIVE relation + Event；
- indeterminate/exception leaves starting；
- P0 NoSideEffect只返回/记录结果，不自动 redeliver。

Independent acceptance：

- no Provider call occurs before starting commit；
- start is called once on normal path；
- starting Dispatch cannot call ordinary start again；
- weak result remains starting；
- strong result becomes started atomically。

### Batch 4 — Monotonic observation transaction

Purpose：让 current responsibility view、evidence 和 terminal 单调性可靠。

Changes：

- typed observed/unavailable DTO；
- `ObservationApplyResult`；
- Core-owned accepted `observed_at`；
- optional sequence comparison；
- first-authoritative-terminal-wins；
- unavailable freshness-only；
- stale/conflict/rejected bundle不附加 Refs；
- Projection/timestamps/sequence/Refs/Event/version 单事务；
- deterministic conflict idempotency key。

Independent acceptance：

- terminal cannot reopen；
- conflicting outcome leaves original terminal untouched；
- unavailable preserves active/terminal lifecycle；
- stale sequence cannot attach output；
- injected Ref failure rolls back terminal、Event and version together。

P0 对“facts”的精确定义：现有 normalized lifecycle Event 与 typed Refs。没有独立 ExecutionResourceFact table；该对象属于后续 Binding integration。

### Batch 5 — Codex weak Provider migration

Purpose：让真实 Codex 经过新 contract，而不伪造 recovery guarantee。

Changes：

- weak descriptor；
- typed start request/result；
- remove Core-facing resume/observe；
- provider-local continuation args preserved；
- parser emits authoritative/provisional/unavailable DTO；
- SessionRef/PID are ordinary NATIVE Refs；
- terminal event buffered until final output refs are available for atomic apply；
- timeout/EOF/nonterminal process failure becomes unavailable；
- diagnostic JSONL remains Provider-owned file, only ArtifactRef is persisted。

Independent acceptance：

- real launch still uses profile isolation/PTY capture；
- turn.started produces active；
- turn.completed/failed produces terminal；
- no structured terminal means no guessed outcome；
- D1 remains starting even after terminal；
- SessionRef is never written to `provider_correlation_ref`。

### Batch 6 — Continuation, restart pass and demo CLI

Purpose：闭合真实 Work self-use 路径。

Changes：

- `continue-codex SOURCE_EXECUTION_ID` creates E2 under same Work；
- atomically/explicitly attach selected S1 as E2 INPUT；
- create D2 with new idempotency key/digest；
- one-shot `DispatchRecoveryService.run_once()` in `work_core/recovery.py`；
- repository recovery queries；
- `show-work`/`show-execution` output current records、refs、dispatch and events；
- optional `recover-codex D1 ...launch args...` lets Host resubmit a reconstructible requested basis after digest verification；
- terminal execution is skipped by recovery；
- starting weak Provider returns unresolved and never starts；
- started strong mock calls observe(C1) and applies observation。

Independent acceptance：

- E1 terminal remains unchanged while E2 runs；
- E2 INPUT contains the same SessionRef value；
- restart pass satisfies the full decision table without loop/lease/backoff；
- a fresh process can query persisted Work and explicitly complete it；
- gated real Codex E1→E2 smoke succeeds。

## P1 scope

Target：2026 年 9 月 Preview 前，但不阻塞 8/25。

- persist contract-defined no-side-effect evidence and allow deliberate same-D1 ordinary redelivery；
- implement/test native same-dispatch redelivery on a real strong Provider；
- integrate one real durable job/CI Provider for correlation/observe/recover_start；
- add manual resolve/abandon command for weak starting/unresolved；
- define and enforce recovery horizon/Provider upgrade compatibility；
- move `resumable_now` toward SessionRef/provider-derived capability；
- settle public CLI naming and retire or clearly separate legacy `agent-box work`；
- expand cross-process SQLite concurrency/race coverage；
- add Ref length/URI/provider-version compatibility hardening；
- decide whether current unreachable reason must be persisted in Projection；
- add explicit independent material-ref command for facts arriving after terminal snapshot。

## Post-demo backlog

- full Execution Binding/approval/validation/conformance implementation；
- ExecutionResourceFact storage and derived contribution graph；
- GUI/TUI Work Core integration；
- poll daemon、queue、scheduler、leases、backoff；
- cancellation and provider lifecycle management；
- multi-Provider marketplace/SDK；
- telemetry/log ingestion；
- workflow/DAG/retry policy；
- generic persisted Provider launch payload；
- artifact store or secret management；
- automatic cross-Work SessionRef reuse policy。

## Database migration plan

### Reused schema

- `core_works`：unchanged；
- `core_executions`：reuse phase/outcome/freshness/timestamps/version；add one nullable sequence column；
- `core_execution_refs`：reuse INPUT/NATIVE/OUTPUT relations and compound primary key；
- `core_events`：reuse EventLedger and unique idempotency key；
- `core_dispatches.provider_correlation_ref`：reuse single TEXT column, but redefine content as versioned Ref JSON。

### Migration 005

Suggested file：

```text
src/agent_box/migrations/005_work_core_runtime_invariants.sql
```

Add to executions：

```sql
ALTER TABLE core_executions
ADD COLUMN last_native_sequence INTEGER
CHECK (last_native_sequence IS NULL OR last_native_sequence >= 0);
```

Rebuild `core_dispatches` to the exact final shape：

```sql
CREATE TABLE core_dispatches_v005 (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL UNIQUE
        REFERENCES core_executions(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL UNIQUE,
    submission_digest TEXT NOT NULL
        CHECK (length(submission_digest) > 0),
    state TEXT NOT NULL
        CHECK (state IN ('requested', 'starting', 'started')),
    provider_correlation_ref TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 0,
    CHECK (
        (state = 'started' AND provider_correlation_ref IS NOT NULL)
        OR
        (state IN ('requested', 'starting') AND provider_correlation_ref IS NULL)
    )
);
```

### Existing-row migration rule

Pre-005 CLI may already have launched a Provider after writing only `requested`. Therefore existing `requested` cannot safely remain requested. Copy rule：

```text
old requested + correlation NULL
→ starting + correlation NULL
→ submission_digest = legacy-unverifiable:v0
```

This intentionally makes legacy rows unresolved/fail-closed. Do not infer “not delivered”. Current code never writes started/correlation, so any non-NULL correlation or duplicate execution rows found by preflight is an operator-visible migration blocker; do not silently discard rows。

Preflight queries：

```sql
SELECT execution_id, COUNT(*)
FROM core_dispatches
GROUP BY execution_id
HAVING COUNT(*) > 1;

SELECT id, state, provider_correlation_ref
FROM core_dispatches
WHERE state NOT IN ('requested', 'starting', 'started')
   OR provider_correlation_ref IS NOT NULL;
```

### Correlation serialization

```json
{
  "v": 1,
  "type": "RunRef",
  "provider": "provider-id",
  "native_id": "opaque-canonical-id",
  "uri": null,
  "metadata": {}
}
```

Core validates version, Ref bounds and `ref.provider == execution.provider_id`; it never parses native ID semantics。

### Deferred fields

Do not add in migration 005：

- `evidence_code/evidence_at`；
- Provider payload JSON；
- delivery attempt count；
- lease/owner/next_retry_at；
- accepted Binding ID；
- observation history；
- current failure reason；
- ExecutionResourceFact table。

Final persistent table delta：

```text
NEW TABLE COUNT = 0
```

The temporary rebuild table is a migration mechanism, not a new production table。

## Provider contract implementation

Recommended code location：`work_core/provider_contract.py` for DTOs/enums and `registry.py` for registration/routing. This is file organization, not a new architecture layer。

### Required now

```python
@dataclass(frozen=True)
class ProviderCapabilities:
    correlation: CorrelationCapability = UNSUPPORTED
    start_recovery: StartRecoveryCapability = UNSUPPORTED
    redelivery: RedeliveryCapability = UNSUPPORTED


@dataclass(frozen=True)
class ExecutionProviderDescriptor:
    id: str
    display_name: str
    version: str
    capabilities: ProviderCapabilities


@dataclass(frozen=True)
class DispatchStartRequest:
    dispatch_id: str
    execution_id: str
    idempotency_key: str
    submission_digest: str
    launch_basis: object


@dataclass(frozen=True)
class DispatchRecoveryContext:
    dispatch_id: str
    execution_id: str
    idempotency_key: str
    submission_digest: str
    reconstructible_launch_basis: object | None
```

`DispatchStartResult` sealed variants：

```text
Correlated(correlation_ref, provider_runtime?)
NoSideEffect(reason_code)
Indeterminate(reason_code?, provider_runtime?)
```

`provider_runtime` is process-local only and must never be serialized。

Provider protocols：

```python
class ExecutionProvider(Protocol):
    def descriptor(self) -> ExecutionProviderDescriptor: ...
    def start(self, request: DispatchStartRequest) -> DispatchStartResult: ...


class CorrelatedExecutionObserver(Protocol):
    def observe(self, correlation_ref: Ref) -> ExecutionObservation: ...


class StartRecoveryProvider(Protocol):
    def recover_start(
        self, context: DispatchRecoveryContext
    ) -> DispatchStartResult: ...
```

### Observation DTOs required now

```python
@dataclass(frozen=True)
class ObservedExecutionState:
    phase: Phase
    outcome: Outcome | None
    authority: ObservationAuthority
    freshness: Freshness
    resumable_now: bool | None = None
    native_sequence: int | None = None
    native_refs: tuple[Ref, ...] = ()
    output_refs: tuple[Ref, ...] = ()


@dataclass(frozen=True)
class ObservationUnavailable:
    freshness: Freshness
    reason: ObservationReason


@dataclass(frozen=True)
class ObservationApplyResult:
    disposition: ObservationApplyDisposition
    execution: Execution
    reason: ObservationReason | None = None
```

### Deferred DTO fields

- `source_observed_at` until a real Provider needs native audit timestamps；
- generic `material_facts` until ExecutionResourceFact production storage exists；
- Provider payload/config snapshots；
- recovery retention duration；
- telemetry/traces/log chunks。

## Dispatch implementation

### Application API

```text
request_dispatch(E1, key, digest) -> D1
deliver_requested(D1, launch_basis) -> DispatchDeliveryResult
recover_dispatch_once(D1, launch_basis_resolver?) -> RecoveryDisposition
```

### Request transaction

In one transaction：

1. load E1；
2. reject terminal E1；
3. if E1 already has D1, require same key and digest then return it；
4. insert requested D1；
5. set `E1.dispatched_at` write-once；
6. increment E1 version；
7. append `ExecutionDispatchRequested`。

Unique conflicts reload the canonical D1 and compare execution/key/digest. No check-then-insert race is allowed to escape as a duplicate。

### Delivery

1. Resolve Provider and validate launch basis/digest before side-effect claim；
2. CAS `requested → starting` and append `ExecutionDispatchStarting`；
3. call `provider.start(DispatchStartRequest)` exactly once；
4. handle result：
   - `Correlated(C1)`：validate capability/Provider/digest, atomic mark-started；
   - `Indeterminate(runtime)`：leave starting, return runtime for online capture；
   - `NoSideEffect`：leave starting and expose disposition; no automatic P0 retry；
   - exception after claim：leave starting/indeterminate；
5. never call start from a generic `starting` path。

### Atomic mark-started

One transaction：

- CAS D1 starting/version；
- verify E1 nonterminal or allow correlation materialization for already-observed terminal from the same attempt；
- set state started and serialized C1；
- attach C1 to E1 NATIVE idempotently；
- append `ExecutionDispatchStarted`；
- increment Dispatch version。

`ExecutionStarted` remains an observation event and must not be reused for durable Dispatch started。

## Observation implementation

### Service decision order

```text
validate DTO shape
→ compare optional native sequence
→ terminal monotonic guard
→ authority guard
→ determine applied/stale/conflict/rejected
→ one repository transaction
```

### Required rules

- Core generates accepted `observed_at`; Provider receive/source time is not ordering；
- lower sequence rejects the whole scoped bundle；
- same sequence/same semantics is idempotent；
- same sequence/different semantics is conflict；
- missing sequence uses conservative phase rules；
- authoritative terminal requires outcome；
- `abandoned` cannot come from Provider observation；
- terminal→active/unknown is rejected for lifecycle and scoped Refs；
- unavailable only changes freshness；
- same authoritative terminal/outcome may add idempotent/new Refs only when ordering evidence proves the same/newer snapshot；
- no semantic change means no version/Event write。

### Atomic repository operation

```text
apply_observation_atomic(
  execution_id,
  expected_version,
  next_projection,
  started_at?,
  ended_at?,
  last_native_sequence?,
  native_refs,
  output_refs,
  event,
)
```

Within one SQLite transaction：

- CAS update Execution；
- insert refs with existing compound uniqueness；
- append exactly one material projection/terminal Event plus only necessary Ref discovery events, or encode newly attached Ref types in the main observation Event；
- commit all or none。

Prefer one observation Event with bounded summary over one transaction-internal Event per repeated Ref. Do not store raw Provider payload。

CAS conflict handling：reload current and rerun semantic decision. Do not blindly retry the stale UPDATE。

## Codex migration

### Descriptor

```text
correlation = unsupported
start_recovery = unsupported
redelivery = unsupported
```

### Start

- `CodexExecutionProvider.start()` accepts the generic Dispatch envelope；
- `launch_basis` must be `CodexLaunchRequest`；
- call existing facade exactly once；
- return `Indeterminate(reason=weak_runtime_only, provider_runtime=ManagedCodexProcess)`；
- D1 remains starting。

### Native continuation

- Keep `CodexLaunchFacade.resume_args(thread_id, prompt)`；
- remove Provider/Core `resume(old_execution)` operation；
- Host selects S1 from source Execution；
- create E2 under the same Work and attach S1 INPUT；
- call ordinary Provider `start()` with E2/D2 and resume-shaped Codex args。

### Parser/capture

- `thread.started`：authoritative SessionRef discovery；phase may remain unknown；
- `turn.started`：authoritative active；
- `turn.completed`：authoritative terminal/succeeded；
- `turn.failed`：authoritative terminal/failed；
- malformed/EOF/nonzero without structured terminal：unavailable/provisional；
- PID is an ordinary RunRef and never canonical correlation；
- terminal observation is applied after process completion with WorkspaceRef and diagnostic ArtifactRef in the same transaction；
- online active/SessionRef observations can be applied earlier；
- do not persist transcript/raw JSONL in Core; only the Provider-owned diagnostic ArtifactRef。

### Submission digest

Codex/Host canonicalizes only semantic launch fields：

```text
provider_id
profile name or stable profile digest if available
canonical workspace path
codex args including native continuation thread ID and prompt
sorted continuation/input Ref identities
```

Exclude diagnostic path、trace IDs、timeouts and temporary transport fields. Core stores only SHA-256, not the prompt payload。

## Restart driver

### Location

```text
src/agent_box/work_core/recovery.py
```

`DispatchRecoveryService` is an application service/helper, not a new domain entity。CLI only invokes it and renders the disposition；CLI does not switch on Provider IDs or mutate Dispatch rows directly。

### One-pass decision table

| Persisted state | One-pass action |
|---|---|
| terminal Execution | preserve history; no delivery |
| requested | obtain reconstructible launch basis from Host, verify digest, then claim + first delivery |
| requested without basis | report `needs_launch_basis`; remain requested |
| starting + NULL, recovery unsupported | unresolved; for nonterminal Execution apply unavailable freshness only |
| starting + NULL, recovery supported | call `recover_start(context)` and handle typed disposition |
| starting + recovered C1 | atomic mark-started, then observe |
| starting + NoSideEffect | P0 report safe evidence; no automatic redelivery |
| starting + Indeterminate | unresolved; no start |
| started + C1 | require durable observer, call `observe(C1)`, apply observation |

### Requested launch-basis constraint

Core intentionally does not persist generic Provider payload. Therefore requested recovery is possible only when a Host can reconstruct the exact basis and reproduce the stored digest。

For the demo, `recover-codex D1 --profile ... --workspace ... --prompt ...` is a Provider-specific Host command that reconstructs `CodexLaunchRequest`; the generic recovery service still receives only a verified basis and has no Codex branch。Normal A→B handoff does not require this manual input；it is only a crash-recovery operation。

### Explicit non-features

No daemon、loop、sleep、backoff、worker queue、lease、scheduler or automatic polling。

## Legacy behavior removals

Remove/disable in P0：

- `ExecutionService.resume_execution(old_execution_id, ...)`；
- string `require_capability("resume")` and arbitrary capability dictionary；
- Codex Core-facing `resume()` and fake `observe(thread_id)`；
- Provider direct return of `ExecutionProjection`；
- timestamp-based Projection last-write-wins；
- terminal→active/unknown；
- `resume-codex` mutating the old Execution；
- CLI `provider.start()` call after merely writing requested；
- any use of SessionRef/PID as Dispatch correlation；
- multiple Dispatch rows per Execution。

Keep, with changed interpretation：

- Provider-local `resume_args()` because it is a launch command for E2；
- `resumable_now` as compatibility/advisory snapshot only；
- ordinary NATIVE SessionRef/RunRef attachments；
- legacy `src/agent_box/work/` untouched until P1 namespace decision。

## Test plan

### P0 deterministic tests

Execution：

- terminal requires outcome；
- terminal cannot become active/unknown；
- terminal outcome is write-once；
- continuation creates E2 and leaves E1 unchanged；
- E2 INPUT SessionRef equals E1 NATIVE SessionRef。

Dispatch：

- one accepted Dispatch per Execution at DB and service layers；
- same key/digest returns same D1；mismatched digest rejects；
- accept D1 sets `dispatched_at` once；
- requested→starting occurs before Provider call；
- started requires correlation；
- correlation + state + NATIVE Ref + Event atomic；
- starting path cannot call ordinary start again；
- terminal E cannot be newly dispatched。

Capability：

- weak Provider legal；
- durable without observer invalid；
- recovery claim without method invalid；
- redelivery without recovery invalid；
- method presence does not enable capability；
- correlated result from weak Provider rejected。

Observation：

- terminal→active rejected；
- unavailable preserves unknown/active/terminal lifecycle；
- conflicting terminal outcome returns conflict and preserves first；
- lower native sequence ignored；
- stale/conflict/rejected refs are not attached；
- duplicate observation produces no duplicate Event/Ref；
- injected transaction failure rolls back Projection、Refs、Event and version；
- terminal-first allows null `started_at` and writes `ended_at` once。

Restart：

- requested + reconstructed matching basis performs first delivery；
- requested + mismatched digest rejects before claim；
- starting weak Provider remains unresolved and does not start；
- started strong mock Provider calls observe(C1)；
- terminal E is skipped；
- recover_start correlated/no-side-effect/indeterminate dispositions converge safely。

Codex deterministic：

- descriptor is weak；
- JSONL structured terminal authoritative；
- EOF/nonzero without terminal unavailable；
- SessionRef emitted and never correlation；
- capture delays terminal until output refs can be atomic；
- E1/E2 same Work/new Execution/new Dispatch flow with fake launch facade。

Migration：

- fresh schema 005；
- upgrade from 004 retains rows；
- old requested becomes starting/unresolved；
- duplicate execution dispatch preflight fails safely；
- invalid state/correlation combinations rejected。

### Real smoke, opt-in only

Gate with an explicit marker/environment variable, for example：

```text
AGENT_BOX_RUN_REAL_CODEX=1 pytest -m real_codex ...
```

Assert only stable contract facts：launch succeeded, active or structured terminal observed, SessionRef persisted when emitted, final terminal preserved, E2 is independent. Do not assert transcript text or exact Provider timing。

### Test command gates

Each commit：targeted changed tests first, then：

```text
pytest -q tests/test_work_core_*.py
```

Before demo：

```text
pytest -q
```

The current stale schema-version assertion must be fixed rather than excluded。

## Self-use Work demo

Use a dedicated clean Git worktree, not the current dirty development tree。

### Work 1 — centerpiece, two Executions

Objective：

```text
让 Work Core show-execution --json 的 refs/events 输出具有稳定排序，
并增加 CLI 回归测试。
```

E1：Codex implements deterministic JSON ordering and tests。

E2：new Execution using E1 SessionRef reviews failures and tightens the CLI contract test。

Human：reviews diff/test evidence, then explicitly completes Work。

This is a real operator-facing usability problem left intentionally outside the P0 correctness boundary, not a synthetic fixture task。

### Work 2 — real CLI usability

Objective：

```text
让 Work Core show-work --json 显示 Execution 数量和最新 Execution ID，
并增加查询回归测试。
```

One or two Executions depending on review result, followed by explicit completion。

### Work 3 — operator documentation

Objective：

```text
为 weak Codex Dispatch starting/unresolved 行为增加一份实际操作说明，
覆盖 restart 后禁止 blind redispatch。
```

One Codex Execution plus human review/explicit completion. This proves Work Core is useful for non-code output too。

### Suggested CLI flow

Assume：

```bash
AB='python -m agent_box.work_core.cli'
```

Conceptual commands after implementation：

```bash
$AB create-work "稳定 show-execution JSON 输出并增加回归测试"

$AB start-codex "$WORK_ID" \
  --profile codex-main \
  --workspace /path/to/clean/worktree \
  --prompt "让 show-execution --json 的 refs/events 稳定排序并增加回归测试；运行相关测试。" \
  --idempotency-key "$WORK_ID-e1" \
  --json

$AB show-execution "$E1" --json

$AB continue-codex "$E1" \
  --profile codex-main \
  --workspace /path/to/clean/worktree \
  --prompt "审阅上一轮修改，修复失败并运行 Work Core CLI 相关测试。" \
  --idempotency-key "$WORK_ID-e2" \
  --json

$AB show-work "$WORK_ID" --json
$AB show-execution "$E1" --json
$AB show-execution "$E2" --json
$AB complete-work "$WORK_ID" "human reviewed diff and tests"
$AB show-work "$WORK_ID" --json
```

Demo narration must explicitly show：

- E1 terminal before E2 exists；
- E2 has new D2；
- S1 appears as E1 NATIVE and E2 INPUT；
- D1/D2 remain starting for weak Codex；
- Work closes only on final command。

## Commit sequence

### Precondition — preserve current baseline

Current repository is on `spike/real-governed-binding` with many modified/untracked files. Before implementation：

- preserve/commit the current ADR and Work Core baseline on the intended source branch；
- create a dedicated production branch；
- do not reset/stash/drop unrelated user changes blindly；
- record the exact baseline test result。

This is not a feature commit, but it is required for independently reviewable rollback。

### Commit 1 — `work-core: enforce execution and dispatch persistence invariants`

- Purpose：migration 005、one-dispatch、digest/version/state/correlation checks、last sequence、Ref codec。
- Files：migration 005、models/projection/repository migration tests。
- Tests：fresh/upgrade/check/codec/one-dispatch。
- Rollback risk：**High**；database migration is forward-only and must be tested on a copied 004 database。

### Commit 2 — `work-core: add typed execution provider contract`

- Purpose：ADR-0004 descriptor/capability/DTO/protocol/registry validation。
- Files：provider_contract.py、registry.py、exports、contract tests。
- Tests：weak/strong/intermediate/invalid matrix。
- Rollback risk：Medium；breaks old Provider implementations intentionally。

### Commit 3 — `work-core: route starts through dispatch responsibility boundary`

- Purpose：request/claim/deliver/mark-started transactions and events。
- Files：services.py、repository.py、events/errors、dispatch tests。
- Tests：one D1、claim before call、weak indeterminate、strong correlation atomicity、no blind redispatch。
- Rollback risk：High；controls real side effects. Keep Provider fake tests exhaustive before Codex wiring。

### Commit 4 — `work-core: apply monotonic observations atomically`

- Purpose：ADR-0005 typed observations、terminal guards、ordering、freshness and atomic Ref/Event apply。
- Files：projection/provider_contract/services/repository/events、observation tests。
- Tests：terminal/unavailable/conflict/stale/rollback/CAS。
- Rollback risk：High；changes persisted lifecycle semantics, but does not launch Providers。

### Commit 5 — `work-core: migrate Codex as a weak execution provider`

- Purpose：typed start/observation, remove fake observe/resume, preserve launch facade, atomic terminal outputs。
- Files：providers/codex*.py、Codex tests。
- Tests：parser/capture/fake facade plus manual real start smoke。
- Rollback risk：Medium-high；external CLI behavior changes, but limited to opt-in Work Core path。

### Commit 6 — `work-core: add continuation, recovery pass, and inspect CLI`

- Purpose：E2 continuation、recovery.py、show/recover commands、vertical slice。
- Files：services/recovery/repository/cli、vertical/restart/CLI tests。
- Tests：E1→E2、requested/starting/started restart table、persisted query/complete Work。
- Rollback risk：Medium；no new schema, but CLI semantics intentionally replace same-E resume。

### Commit 7 — `work-core: self-host real work demo and operator notes`

- Purpose：fix issues found by 2–3 real Works, update tests/docs/demo transcript。
- Files：only proven fixes and demo/operator documentation。
- Tests：full deterministic suite + gated real Codex smoke。
- Rollback risk：Low if fixes remain small; any architecture expansion is rejected from this commit。

## 8/23–8/25 schedule

Current planning time：2026-08-23 16:43 CST。

### 2026-08-23 remaining

17:00–18:00：preserve current dirty baseline, create production branch, capture full test baseline。

18:00–20:30：Commit 1 migration/domain invariants。Fresh + 004-upgrade tests must be green before continuing。

20:30–22:30：Commit 2 typed Provider contract and provider matrix tests。

Stop checkpoint：if migration 005 is not reliably upgradeable by 20:30, do not start Codex wiring. Fix or reduce demo to a fresh isolated database only and label that as a serious scope cut。

### 2026-08-24

09:00–12:00：Commit 3 Dispatch service/repository transactions。

13:00–17:00：Commit 4 monotonic observation atomic transaction。

17:00–20:00：Commit 5 Codex weak migration and deterministic capture tests。

20:00–21:00：first gated real Codex E1 smoke；fix only contract blockers。

Stop checkpoint：if Observation transaction or terminal guard is not green by 17:00, cut restart convenience CLI and Work 2/3, but never restore direct Projection/raw start paths。

### 2026-08-25 before demo

08:30–10:30：Commit 6 one-shot recovery、continuation and query CLI。

10:30–12:30：run Self-use Work 1 with E1→E2, verify deterministic CLI output, full deterministic suite。

13:00–14:30：run short Work 2/3 if stable；otherwise preserve one complete two-Execution Work and record the missing self-use count honestly。

14:30 onward：demo buffer, no ontology/schema expansion, no dependency upgrades。

### Scope-cut order if behind

Cut in this order：

1. Work 3；
2. Work 2；
3. `recover-codex` convenience command while retaining recovery service/tests；
4. public top-level CLI integration（already not P0）；
5. NoSideEffect/redelivery execution（already P1）；
6. native source timestamps/material facts（already deferred）。

Never cut：one-dispatch、claim-before-start、no blind redispatch、terminal irreversibility、observation atomicity、new Execution continuation。

## Risks

### 1. Dirty/uncommitted baseline — High

Work Core、ADRs、migration 004 and many unrelated files are currently untracked/modified on a spike branch. Mixing implementation with this baseline would destroy commit isolation。Mitigation：preserve baseline first and use an explicit production branch；never blanket reset or stash user work。

### 2. SQLite table rebuild — High

Adding cross-column CHECK and one-dispatch uniqueness requires rebuilding `core_dispatches`。Mitigation：fresh/upgrade copy tests, duplicate preflight, fail closed, no silent row deletion。

### 3. Terminal before outputs — High

Current cumulative parser can apply `turn.completed` before final Workspace/Artifact Refs。Mitigation：online-apply active/SessionRef, buffer terminal until the final atomic bundle。

### 4. Real Codex/environment variability — Medium-high

Codex 0.149.0 and util-linux `script` 2.39.3 are present, but auth/profile/network/model latency can still fail。Mitigation：gated smoke on 8/24, deterministic parser/facade tests remain authoritative for code correctness, demo timeout leaves unavailable rather than fake failure。

### 5. Requested recovery lacks persisted launch payload — Medium

This is deliberate boundary preservation。Mitigation：Host resubmits/reconstructs launch basis and Core verifies digest；without basis it remains requested, not blindly started。

### 6. Weak Dispatch visually remains starting after terminal — Medium

Correct but counterintuitive。Mitigation：show CLI renders Dispatch state and Execution projection as separate fields and explains weak Provider limitation。

### 7. Two Work systems share product naming — Medium

Legacy `agent-box work` is a different fixed workflow runtime。Mitigation：demo explicitly uses `python -m agent_box.work_core.cli`; public namespace consolidation is P1。

### 8. Optional ordering without sequence — Low/known limitation

Codex JSONL supplies no native monotonic sequence。Mitigation：terminal monotonic fallback and buffered single-stream capture；do not invent timestamps as ordering。

## Stop rules

Immediately stop and move the proposed change post-demo if it requires：

- a new first-class entity beyond already accepted Work/Execution/Dispatch/Ref/Event concepts；
- a new persistent table；
- workflow/scheduler/queue/lease/retry abstraction；
- generic Provider payload/state store；
- universal observation/evidence IR；
- full Binding implementation；
- GUI/TUI refactor；
- more than one real Provider；
- telemetry/log ingestion；
- Provider-specific branch inside Core services/repository。

Allowed implementation-only additions：typed DTO/enum、helper/module、repository method、Ref codec、reason/Event code、migration constraints、derived query view。

Any proposed shortcut that reintroduces direct CLI `provider.start()`、same-E resume、timestamp LWW or partial observation commit is also a stop condition；missing the demo is safer than demonstrating a knowingly contradictory responsibility model。

## Final readiness judgment

**READY WITH SCOPE CUT**

在不新增架构板块的情况下，8/25 能跑出真实 Work demo。依据是：

- Work/Execution/Ref/Event persistence and real Codex launch/parser already exist；
- `codex` and `script(1)` are available in the current environment；
- required changes are concentrated in one small Work Core package and one migration；
- weak Provider semantics removes the need to invent durable Codex recovery；
- zero new first-class entities and zero persistent tables are required。

The plan is not “ready without conditions”：production implementation must preserve the dirty baseline first, complete migration/Dispatch/Observation invariants before Codex wiring, and accept the listed scope cuts. If atomic observation or claim-before-start is not green by the 8/24 checkpoints, the correct result is to reduce the number of self-use Works, not to bypass the frozen semantics。
