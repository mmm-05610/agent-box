# Agent-Box Preview 最小 Core 补齐计划
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> **计划状态：Preview 后硬化参考。** 当前一天工期的实施基准请使用：[PREVIEW_ONE_DAY_CORE_COMPLETION_CUT.md](PREVIEW_ONE_DAY_CORE_COMPLETION_CUT.md)。本文八天拆解不再作为当前排期。

> 文档导航：[总目录](../README.md)
> 日期：2026-08-24
> 决策：**冻结 Core 模型，只补齐 Preview 所需的最小责任闭环**

# Executive verdict

Agent-Box 现在不需要重新设计 Core，也不需要把 Demo 的外部系统语义塞进 Core。需要补的是最小核心模型外侧缺失的一圈：

```text
已有：Work / Execution / Ref / Provider / Projection / Event

补齐：Execution objective
   → Production Binding + freeze
   → frozen Binding 对应的 Dispatch request/acceptance
   → interactive Finish intent + recoverable finalization
   → Evidence / ExecutionResourceFact
   → new-Execution continuation
   → Work-level material Ref
```

这圈能力不是 Demo 特供。任何真实 Provider integration 都需要回答：本次责任是什么、依据是什么、何时正式提交、外部系统是否接受、实际发生了什么、如何结束，以及如何在不重开历史责任的前提下延续 native session。

目标不是把 Core 从 90% 做到 150%，而是把缺失的 10% 圆环补齐，使现有模型成为一个能跑真实 Preview 的闭合产品面。

# Current Core baseline

当前 `src/agent_box/work_core` 已经具备：

- `Work`：objective、open/completed/abandoned、显式 complete/reopen；
- `Execution`：work/provider 归属和 provider-neutral projection；
- `Ref`：SessionRef、RunRef、WorkspaceRef、WorkflowInstanceRef、ArtifactRef；
- `ExecutionProjection`：active/terminal/unknown、operational outcome、freshness；
- `ExtensionRegistry`：Provider descriptor/capability 注册；
- `CoreEvent`：material event ledger；
- `core_execution_refs`：native/input/output Ref 关系；
- `core_dispatches`：idempotent requested dispatch 记录；
- SQLite optimistic version 和基础 provider observation persistence。

当前不能诚实跑 Preview 的缺口：

1. `Execution` 没有自己的 objective，责任窗口无法独立于 Work objective 表达；
2. Production Core 没有 Binding；
3. Dispatch 只会写 `requested`，没有绑定 frozen revision、accepted boundary 或 recovery closure；
4. 没有 Evidence / ExecutionResourceFact persistence；
5. 没有显式 Finish/Submit intent 和可恢复 finalization；
6. 当前 `resume_execution(execution_id, ...)` 会恢复原 Execution，违反 continuation 已冻结语义；
7. Human decision artifact 等 Work-level material 没有进入新 `work_core` 的统一 Ref 关系；
8. Provider contract 只有 start/observe，无法标准化 accepted correlation、finalize 和 dispatch recovery。

仓库中的 `src/agent_box/work`、migration `003_work_core.sql` 和固定 Plan/Execute/Review workflow 属于旧实现路径。Preview 补齐只扩展 `src/agent_box/work_core` 与 `004_minimal_work_core.sql` 建立的新表族，不把旧 workflow phase、role、outcome 或 progression 语义迁入 Production Core。

开工时的测试基线：新 `work_core` contract/repository/service/vertical-slice 等定向套件 **19 passed**。但旧 `tests/test_work_core.py::test_migration_creates_work_tables` 仍硬编码 `MAX(schema_versions) == 3`，而仓库已经存在 migration 004，因此实际失败为 `4 != 3`。这是 Day 0 测试卫生问题：只修正过时的migration断言或将legacy suite明确隔离，不借此重构旧fixed workflow。

# The minimum Preview Core ring

| Ring segment | 为什么必须属于 Core | Preview 证明点 | 不进入 Core 的内容 |
|---|---|---|---|
| Execution objective | 一次责任尝试必须有独立、稳定的责任描述 | Work 模糊，但 E0/E1/E5 bounded | role prompt、workflow node、acceptance payload |
| Binding aggregate | Dispatch 前必须能指出本次冻结了什么 | exact Git、workflow checkpoint、artifacts、profiles可见 | Git/Claude/LangGraph/MCP专用字段 |
| Binding freeze | 防止正式提交后执行依据漂移 | B1 immutable、digest/revision可审计 | resolver算法、projection实现 |
| Dispatch request/accept | accepted Dispatch 是责任提交边界 | 一个Execution只有一个accountable Provider | scheduler、queue、retry policy |
| Finish intent/finalization | interactive idle或process exit不能结束责任 | ACTIVE → user Finish → terminal | TUI状态机、READY_TO_SUBMIT enum |
| Evidence/ResourceFact | Ref列表无法表达actual、authority和coverage | expected vs actual对账 | tracing backend、外部payload镜像 |
| Continuation | session连续不能修改旧责任 | E1 terminal、E5 active、same S1 | session supervisor、Execution reopen |
| Work material Ref | Human决定和最终材料需要进入Work历史 | H1/H2/H3真实改变后续Binding | Human Task、Decision workflow entity |

# Core data model: minimum additions

## 1. Execution responsibility fields

给现有 `Execution` 增加：

```text
objective: str                        required
continuation_of_execution_id: str?    optional FK, same Work only
finish_requested_at: datetime?        derived FINALIZING input
finish_idempotency_key: str?          unique when present
```

规则：

- Work objective 可以模糊；Execution objective 必须非空；
- `continuation_of_execution_id` 只表示 Core responsibility lineage，不代表旧 Execution 恢复；
- continuation 的真正 native 输入仍是新 Binding 中的 previous SessionRef；
- `finish_requested_at != null && phase != terminal` 时，Host/UI 可派生显示 `FINALIZING`；不新增 Core Phase；
- process exit、Harness idle 或一轮完成不能写 `finish_requested_at`，也不能自动构造 terminal outcome。

## 2. Binding aggregate

最小表：

```text
core_bindings
  id
  execution_id UNIQUE
  revision
  state                 draft | frozen
  digest
  created_at
  updated_at
  frozen_at
  version

core_binding_slots
  binding_id
  slot_key
  ordinal
  required
  requested_ref_json
  resolved_ref_json
  resolution_evidence_ref_json
  metadata_json          bounded, presentation only
  PRIMARY KEY(binding_id, slot_key)
```

这里的所有 slot value 都是现有 `Ref` 或 `ArtifactRef`。ParticipantSpec、review criteria、runtime policy、MCP registry snapshot、plugin set和credential source都先表现为 Ref/ArtifactRef，不新增 Core entity。

Core 只理解：

- slot key；
- required/optional；
- requested Ref；
- adapter 返回的 resolved Ref；
- resolution EvidenceRef；
- draft/frozen、revision、digest。

Core 不理解：

- `source.revision` 是否是 Git；
- `workflow.revision` 是否是 LangGraph checkpoint；
- `team.participants` 里面有几个 Harness；
- credential Ref 如何取 secret；
- MCP/plugin/config 如何 materialize。

### Draft 与 revision 的最小语义

- 每次 draft slot mutation 使用 optimistic version 并递增 revision；
- Preview 不保存每个临时 draft 的完整历史版本；material events足够记录重要变化；
- freeze 时 canonical serialize 当前 slots，计算 digest并写 `frozen_at`；
- frozen 后禁止 add/update/remove slot；
- required slot 必须具有 `resolved_ref` 才能 freeze；
- “exact” 的判定由 Authority adapter负责，Core只持久化其结果和EvidenceRef。

这避免为了 Git branch、LangGraph checkpoint 或 credential version 在 Core 内建立解析规则。

## 3. Dispatch closure

扩展现有 `core_dispatches`：

```text
binding_id
binding_revision
binding_digest
state                       requested | accepted | rejected | uncertain
provider_correlation_ref
accepted_at
last_error_ref
```

每个 Execution 最多一个 accepted Dispatch。

数据库与外部 Provider 不可能形成真正的单事务，因此正确协议是：

```text
SQLite transaction
  validate Execution dispatchable
  freeze Binding
  insert idempotent Dispatch(state=requested)
  append events
commit

external call
  Provider.start(dispatch envelope, idempotency_key)

SQLite transaction
  record Provider acceptance
  attach native correlation Ref
  set Dispatch=accepted
  set Execution.dispatched_at
  append DispatchAccepted
commit
```

如果进程在外部 Provider 已接受、Core 尚未记账之间崩溃：

- Dispatch 保持 `requested` 或被标记 `uncertain`；
- Host/adapter 使用同一 idempotency key 调用 `recover_dispatch`；
- Provider 返回既有 acceptance、明确 rejection或 unknown；
- Core 不自动创建第二个 Dispatch，也不实现 generic retry policy。

因此本阶段所说的“Binding + Dispatch atomicity”准确含义是：

1. Dispatch request 永远引用一个已经冻结、以后不可变的 Binding；
2. freeze 与本地 requested record在一个SQLite事务中；
3. accepted boundary通过idempotency和recovery与外部事实闭合；
4. 不声称跨SQLite和外部Provider exactly-once。

## 4. Evidence and ExecutionResourceFact

最小表：

```text
core_evidence
  id
  execution_id
  provider
  native_id
  uri
  digest
  authority
  method
  observed_at
  metadata_json          bounded; no secret/raw transcript

core_execution_resource_facts
  id
  execution_id
  binding_slot_key       nullable
  fact_kind              provider-namespaced string
  expected_ref_json      nullable
  actual_ref_json        nullable
  evidence_id
  coverage               complete | partial | unknown | unverifiable
  recorded_at
  idempotency_key        UNIQUE
```

设计取舍：

- Core 知道 coverage，但不知道 Git HEAD、MCP consumption 或 credential scan 的业务含义；
- `fact_kind` 使用 provider-namespaced string，例如 `git.actual_head`、`runtime.config_projection`；不建立大而全 enum；
- actual value 尽量是 Ref。无法表达为 Ref 的详细报告成为 ArtifactRef，Core只保存其digest/locator；
- assurance 的最小核心表达是“Fact 关联到哪个 Binding slot + coverage”。Preview 不实现 assurance policy/conformance engine或信任分数；
- `unknown` 和 `unverifiable` 必须是一等值，不能因没有证据而被省略；
- Evidence 不能保存 credential value、低熵secret hash、完整LangGraph checkpoint payload或raw transcript body。

## 5. Work-level material refs

增加：

```text
core_work_refs
  work_id
  relation              material | evidence
  Ref columns / json
  created_at
  PRIMARY KEY(work_id, relation, type, provider, native_id)
```

用途：

- H1 direction ArtifactRef；
- H2 repair-scope ArtifactRef；
- final acceptance/evidence ArtifactRefs；
- Work完成时引用的重要材料。

Human同步决定仍然是 Work event + ArtifactRef，不新增 HumanExecution、Decision节点或approval workflow。

# Core service contract

Preview 所需的最小 application API：

```text
create_execution(
  work_id,
  provider_id,
  objective,
  continuation_of_execution_id=None,
) -> Execution

create_binding(execution_id) -> Binding
put_binding_slot(binding_id, expected_version, slot) -> Binding
remove_binding_slot(binding_id, expected_version, slot_key) -> Binding

freeze_and_request_dispatch(
  execution_id,
  expected_binding_version,
  idempotency_key,
) -> FrozenBinding + Dispatch

record_dispatch_accepted(
  dispatch_id,
  provider_correlation_ref,
  native_refs,
) -> Dispatch

record_dispatch_rejected(...)
recover_dispatch(dispatch_id, provider_result)

observe_projection(execution_id, projection)
record_resource_facts(execution_id, facts)

request_finish(execution_id, idempotency_key)
apply_finalization(
  execution_id,
  output_refs,
  evidence,
  resource_facts,
  terminal_projection,
) -> Execution

create_continuation_execution(
  source_execution_id,
  provider_id,
  objective,
) -> new Execution

attach_work_ref(work_id, relation, ref)
complete_work(work_id, reason)
```

`apply_finalization` 必须在一个本地事务中写入 outputs、Evidence、Facts、terminal projection 和 events，且按 Provider finalization idempotency key安全重放。

# Minimal accountable Provider contract

现有 Provider protocol 从 start/observe 最小扩充为：

```text
descriptor()
capabilities()

start(dispatch_envelope) -> DispatchAcceptance
observe(native_correlation_ref) -> ProviderObservation
finalize(finalize_request) -> FinalizationResult
recover_dispatch(idempotency_key) -> DispatchRecoveryResult
```

其中：

```text
DispatchEnvelope
  execution_id
  execution_objective
  frozen_binding_id/revision/digest
  resolved slots
  idempotency_key
  continuation input refs, if any

DispatchAcceptance
  accepted
  provider correlation Ref
  initial native Refs

FinalizationResult
  output Refs
  Evidence records
  ResourceFacts
  operational terminal projection
```

不把以下内容加入 Core Provider protocol：

- terminal pane布局；
- participant独立生命周期；
- ACP message schema；
- workflow route或next step；
- Git commit、LangGraph checkpoint、CI verdict专用字段；
- retry/backoff/scheduling；
- business verdict。

`attach/interact/steer` 可以是 Interactive Provider 的插件能力和Host handle，不需要成为所有ExecutionProvider的强制Core方法。Core只需保证attach期间Execution仍可保持ACTIVE，并通过显式Finish结束。

# Explicit Finish semantics

最小状态推导：

```text
phase=ACTIVE, finish_requested_at=null
  → ACTIVE

phase=ACTIVE, finish_requested_at!=null
  → UI derives FINALIZING

phase=TERMINAL
  → TERMINAL
```

流程：

1. Human/Host 调用 `request_finish`；
2. Core 幂等记录 finish intent；
3. Host 调用唯一 accountable Provider 的 `finalize`；
4. Provider停止接受新的本次责任交互；
5. Provider固定outputs/native refs/runtime facts；
6. Core通过 `apply_finalization` 原子持久化；
7. Execution才terminal。

Provider process提前退出时：

- Provider observation可以报告unreachable/stale或仍可恢复；
- 不能仅凭exit code自动写succeeded；
- 如果Provider明确报告不可恢复失败，可形成terminal failed observation；
- interactive责任是否提交仍由finish intent和Provider finalization contract决定。

# Continuation semantics

删除产品路径中的：

```text
resume_execution(old_execution_id)
```

替换为：

```text
new_execution = create_continuation_execution(
  source_execution_id=E1,
  objective="repair scoped concurrency bug",
  provider_id="codex-interactive",
)

new Binding B5 includes:
  continuation.session = SessionRef S1
  source.revision = C2
  review = R1
  ci.failure = F1
  repair.scope = H2
  workflow.revision = C3
```

规则：

- source Execution 必须terminal；
- source和new Execution属于同一Work；
- Core不假设所有Provider支持continuation；adapter在resolve/freeze前做capability check；
- old Execution永不变化；
- Provider的native resume是新Dispatch的start mode，不是Core reopen命令；
- same SessionRef可以同时出现在旧E的native refs和新E的input Binding中。

# What is deliberately outside Core

| Demo需要 | 放置位置 | Core只保存 |
|---|---|---|
| Git selector → commit/tree | GitAuthority plugin | resolved Ref + Evidence |
| worktree、read-only mount | Git/bwrap projector | Facts/Refs |
| LangGraph Thread/Checkpoint/context | LangGraph adapter | WorkflowInstanceRef、revision Ref、snapshot ArtifactRef |
| OpenCode/Codex/Hermes profile | Harness plugin | profile Ref/ArtifactRef、SessionRef |
| ParticipantSpec | Team Provider-owned Artifact schema | ArtifactRef Binding slot |
| ACP/acpx/Gateway messages | collaboration plugins | endpoint Ref、event-range EvidenceRef |
| MCP/plugin set | resource adapters | exact Ref/ArtifactRef |
| credential secret | external credential authority | locator/version Ref；永不保存value |
| CI verification result | GitHub Actions report adapter | RunRef、ArtifactRef、Facts |
| H1/H2 next-step decision | Host | Work event + ArtifactRef |
| FINALIZING/READY_TO_SUBMIT visual state | Host/UI derived state | finish intent + phase |
| next actions | Host/workflow | nothing unless selected and materialized |

# Must build before any Provider polish

按阻塞关系排序：

## P0-A — Responsibility identity

- Execution objective；
- continuation source字段/约束；
- migration/repository/model round trip；
- Work必须Open才能创建新Execution。

完成判据：同一模糊Work下可创建objective不同的E0/E1；E1 terminal不关闭Work。

## P0-B — Binding and freeze

- Binding/slot persistence；
- draft mutation、revision、optimistic concurrency；
- resolve result/EvidenceRef；
- canonical digest、freeze、immutable enforcement。

完成判据：B1冻结后任何slot mutation失败；mutable requested Ref不直接冒充resolved Ref。

## P0-C — Dispatch boundary

- freeze + requested dispatch本地事务；
- accepted/rejected/uncertain；
- provider correlation Ref；
- one accepted Dispatch per Execution；
- idempotent recovery接口。

完成判据：任何accepted Dispatch都能追溯到唯一frozen Binding；crash-window测试不会启动第二场责任。

## P0-D — Facts and evidence

- Evidence persistence；
- per-slot ResourceFact和coverage；
- idempotent fact ingestion；
- Work-level material refs。

完成判据：UI/query能从真实记录生成requested/frozen/actual/partial/unknown，而不是硬编码Demo JSON。

## P0-E — Finish and finalization

- finish intent；
- Provider finalize contract；
- atomic local finalization；
- crash/retry幂等。

完成判据：Harness三轮后仍active；Finish后outputs/evidence完整才terminal；重复Finish不重复写fact。

## P0-F — Correct continuation

- new-Execution continuation service；
- previous SessionRef进入new Binding；
- 删除/禁用old Execution原地resume；
- provider capability gate。

完成判据：E1 terminal不变；E5有new ID/B/D；native session仍为S1。

# Acceptance test suite

至少新增以下 Core contract tests：

1. Execution objective required，Work objective不被复制成隐式责任；
2. closed Work不能创建Execution，explicit reopen后才可；
3. required unresolved slot不能freeze；
4. concurrent draft update产生version conflict；
5. frozen Binding不可变且digest稳定；
6. Dispatch request不能绕过Binding；
7. freeze + requested Dispatch本地事务失败时不留下半成品；
8. 一个Execution不能出现两个accepted Dispatch；
9. Provider接受/Core未记账的crash window可用相同idempotency key恢复；
10. native error event不能因process exit 0变成succeeded；
11. repeated observation/fact/finalization幂等；
12. Fact必须保留partial/unknown/unverifiable；
13. Fact可关联Binding slot，Evidence可被多个Fact引用；
14. finish request前interactive Execution保持active；
15. finish finalization中断后可恢复；
16. finalization在一个事务中写outputs/facts/terminal；
17. continuation创建new Execution并保留old terminal；
18. new Binding含previous SessionRef但不复制native transcript；
19. Work不会因Execution或CI terminal自动complete；
20. Work material ArtifactRef可被后续Binding引用；
21. metadata边界拒绝secret-sized/raw payload滥用；
22. `work_core` 不导入 Git、LangGraph、ACP、MCP、Harness或旧fixed workflow模块。

# Tight schedule

按半天基线清理 + 8 个核心工作日 + 1.5 个缓冲/集成日估算；Provider/UI 不计入本表。

| Day | 交付 | 当日必须通过 |
|---:|---|---|
| 0（半天） | 锁定新`work_core` 19-pass基线；修旧migration version断言/legacy标记 | 全套红灯都代表真实回归，不再有`3 != 4`噪音 |
| 1 | migration 005、Execution objective/continuation fields、models | round-trip、closed Work guard |
| 2 | Binding/BindingSlot repository + mutations | revision/concurrency tests |
| 3 | resolve record、canonical digest、freeze | unresolved reject、frozen immutable |
| 4 | Dispatch request/accept/reject/uncertain + correlation | one accepted、binding traceability |
| 5 | dispatch crash-window recovery + idempotency | recovered acceptance、不重复start |
| 6 | Evidence/ResourceFact + Work refs | per-slot coverage、dedupe、no secret payload |
| 7 | finish intent + Provider finalize + atomic finalization | crash/retry、outputs/facts/terminal一致 |
| 8 | new-Execution continuation、移除原地resume | E1 terminal/E5 active/same S1 contract |
| 9 | vertical Core scenario + query DTOs；半日buffer | Work→E0→H1→E1→finish→E5→complete |
| 10 | buffer、migration/restart/concurrency review | full Core tests、restart recovery |

如果工期继续压缩，不能删除 Binding freeze、accepted Dispatch、Finish或continuation。可以延后：

- assurance自动roll-up；
- rich query filters；
- cleanup facts；
- evidence attestation；
- multiple Dispatch attempts；
- generic cancellation；
- retention policy；
-历史draft Binding版本浏览。

# Minimal implementation files

建议只集中修改：

```text
src/agent_box/migrations/005_preview_core_completion.sql
src/agent_box/work_core/models.py
src/agent_box/work_core/events.py
src/agent_box/work_core/repository.py
src/agent_box/work_core/services.py
src/agent_box/work_core/registry.py
src/agent_box/work_core/errors.py
tests/test_preview_core_binding.py
tests/test_preview_core_dispatch.py
tests/test_preview_core_finalization.py
tests/test_preview_core_continuation.py
tests/test_preview_core_evidence.py
```

不要在本阶段重构旧 `src/agent_box/work`。新Preview路径完成后，只需要明确旧路径deprecated/隔离，避免同时修两套模型拖垮工期。

# Explicit non-goals

本阶段不实现：

- Workflow/DAG/node/edge/route；
- scheduler、timer、retry/backoff engine；
- WorkController、ProgressionAuthority；
- Agent/Harness/Participant/Message Core entity；
- Team内部participant lifecycle；
- Human Task Provider；
- generic business verdict；
- policy/conformance engine；
- tracing backend或event streaming platform；
- generic sandbox或workspace平台；
- Git/LangGraph/GitHub/ACP/MCP专用Core表；
- credential store；
- full attestation/SLSA subsystem；
-完整workflow/history replay engine。

# Stop conditions against scope creep

任何拟加入 Core 的字段必须同时满足：

1. 至少两个不同 Provider domain都需要；
2. 它描述责任、identity、frozen basis或actual evidence，而不是外部产品业务语义；
3. 不加入它就无法诚实恢复或审计一次Execution；
4. Ref/ArtifactRef/Binding slot/ResourceFact/Provider-owned manifest无法表达；
5. 有对应Core contract test。

只要任一条件不满足，默认放入 Plugin 或 Host。

# Definition of Preview Core complete

Core 达到 Preview 完成线，当且仅当一个完全provider-neutral的测试场景能够证明：

```text
Create fuzzy Work W (OPEN)

Create bounded Execution E1(objective, accountable provider)
Draft Binding B1 with opaque Ref slots
Resolve slots through fake authorities
Freeze B1
Persist Dispatch request
Record external Provider acceptance and native SessionRef S1
Observe E1 ACTIVE
Record projected/observed facts with mixed coverage
Request Finish
Atomically persist outputs/evidence/facts/terminal

Create E2 as continuation of E1
Draft/freeze new Binding B2 including S1 as input
Accept new Dispatch

Assert:
  E1 remains TERMINAL
  E2 is independent
  same native S1 may continue
  W remains OPEN

Attach Human material ArtifactRef
Human explicitly completes W
```

这个测试不得导入 Codex、OpenCode、Hermes、Git、LangGraph、GitHub Actions、ACP、MCP、bwrap 或 DSH。真实 adapters随后只需要实现同一 contract。

# Final recommendation

立即冻结架构讨论并按 P0-A → P0-F 实现。

最先补的不是 Team Provider，也不是 Demo UI，而是：

1. Execution objective；
2. Binding/freeze；
3. Dispatch acceptance/recovery；
4. Evidence/ResourceFact；
5. explicit Finish/finalization；
6. new-Execution continuation。

这六组能力就是 Preview 前缺失的最小 Core 圆环。完成后，OpenCode projector、Hermes ACP participant、Codex author/reviewer、Git、LangGraph、GitHub Actions和Gateway都可以作为插件沿同一边界接入；在此之前继续堆 Provider 只会产生更多无法被 Core 正确记录的成功动画。
