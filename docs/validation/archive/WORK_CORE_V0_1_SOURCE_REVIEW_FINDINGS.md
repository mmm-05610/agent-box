# Production Minimal Work Core v0.1 源码审阅问题清单
>
> Historical record — describes an earlier architecture or validation state and is not current implementation guidance.
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 文档导航：[总目录](../README.md)

日期：2026-08-23
范围：`src/agent_box/work_core/`、migration 004、相关契约测试与 Codex Phase 1 接线
性质：源码审阅记录，不是已批准的修改方案

## 1. 结论

当前 `work_core` 已经建立了一个方向正确且足够小的领域骨架：

```text
Work identity / explicit closure
→ Execution identity
→ provider-neutral Projection
→ typed Ref relations
→ durable dispatch intent
→ material EventLedger
→ provider registry
```

它已经通过真实 Codex start/resume 的 happy-path vertical slice，但尚未形成可靠的 operational loop。最关键的缺口不在对象数量，而在：

```text
Execution
→ Dispatch claim
→ Provider correlation
→ Observation
→ crash/restart reconciliation
```

此外，Provider Registry 目前只是一个最小的内存映射，尚不足以承载 Governed Binding 所需的 enforcement、actual evidence 和 RefAuthority capability。

审阅结论不建议推翻 Work/Execution/Ref/Projection 的基础分离；建议在合入 Binding 前先闭合 Execution operational spine，并明确 Execution continuity/resume 语义。

## 2. 审阅边界

### 2.1 Production Minimal Work Core

本报告审阅的是：

- `src/agent_box/work_core/models.py`
- `src/agent_box/work_core/projection.py`
- `src/agent_box/work_core/services.py`
- `src/agent_box/work_core/repository.py`
- `src/agent_box/work_core/events.py`
- `src/agent_box/work_core/registry.py`
- `src/agent_box/work_core/providers/`
- `src/agent_box/work_core/cli.py`
- `src/agent_box/migrations/004_minimal_work_core.sql`
- `tests/test_work_core_*.py`

### 2.2 不要混淆旧 Work runtime

仓库同时存在：

```text
src/agent_box/work/
src/agent_box/migrations/003_work_core.sql
```

该实现包含 workflow、attempt、handoff、artifact 等另一套模型，不是本报告所称的 Production Minimal Work Core v0.1。Minimal Core 的真实 schema 是 migration 004，表名均以 `core_` 开头。

命名上的并存已经构成维护风险：新读者很容易误把 migration 003 当作 `work_core/` 的 schema。

## 3. 当前数据库结构

```text
core_works
    │ 1:N
    ▼
core_executions
    ├── 1:N → core_execution_refs
    └── 1:N → core_dispatches

core_events
    └── 通过 subject_id 逻辑关联 Work/Execution
```

当前 schema 没有独立 Ref aggregate、Provider、Binding、Validation、ResourceFact、Workflow、Scheduler 或 Artifact Store 表。

## 4. 已确认的设计优点

这些不是问题，后续修改应保留。

### S-01 Work closure 与 Execution outcome 分离

Execution terminal/succeeded 不会自动关闭 Work。Work 必须通过 `complete_work()` 显式关闭，vertical slice 已验证该语义。

### S-02 Core identity 与 Provider native identity 分离

Execution ID 在 Provider 启动前存在；SessionRef、RunRef 等 native identities 通过 relation 附加，不污染 Execution identity。

### S-03 Projection 是 Provider-neutral observation

`phase/outcome/resumable_now/freshness/observed_at` 没有复制 Codex/CI/shell 原生状态全集。

### S-04 unknown 与 false/failure 分离

`resumable_now=None` 和 `Phase.UNKNOWN` 不会被猜成 false/failed，resume 默认 fail-closed。

### S-05 current state 与 material event 同事务

Work/Execution 状态变化和对应 Event 在 Repository 的同一 SQLite transaction 中提交；CAS 失败时 Event 同时回滚。

### S-06 EventLedger 不是 telemetry，也不是 event sourcing

重复的同语义 poll 不制造 version/event；restart 从 current-state tables 读取，而不是 replay EventLedger。

### S-07 Provider-specific branching 未进入 Core

Core 通过 Registry 和 capability lookup 调用 Provider，没有 `if provider == codex`。

## 5. Models 层问题

### M-01 `frozen=True` 没有使 metadata/provenance 严格不可变

严重度：Low
类型：implementation defect

`Work`、`Execution`、`Ref` 是 frozen dataclass，但 `_bounded_metadata()` 返回普通 `dict`。因此字段不能重新赋值，内部 dict 仍可被修改：

```python
work.metadata["x"] = "y"
```

这会绕过 Service、version CAS 和 EventLedger。若 immutable 是 contract，应转换为只读 mapping 或真正 immutable value。

### M-02 `_bounded_metadata()` 对所有对象都抛 `InvalidRef`

严重度：Low
类型：error taxonomy

Work metadata 或 Execution provenance 非法时也抛 `InvalidRef`。错误类型与对象不匹配，应改为通用 bounded-metadata error，或由调用对象包装成对应错误。

### M-03 Work objective/closure reason 与 Event data 长度约束不一致

严重度：Medium
类型：confirmed bug

`Work.objective` 与 `closure_reason` 没有 256 字符限制，但 Service 会把它们写入 `CoreEvent.data`：

```python
{"objective": objective}
{"reason": reason}
```

`CoreEvent` 复用 `_bounded_metadata()`，value 最大 256 字符。因此合法的长 objective/reason 可以构造 Work，却在构造 Event 时意外抛 `InvalidRef`。需要统一约束或让 Event 保存摘要/引用。

### M-04 Ref Python equality 与持久 identity 不一致

严重度：Medium
类型：semantic ambiguity

dataclass equality 比较 `type/provider/native_id/uri/metadata` 全部字段；数据库 Ref relation 主键只使用：

```text
execution_id + relation + type + provider + native_id
```

设计语义上的 Ref identity 是 `type + provider + native_id`，但源码没有统一的 `identity_key`。相同 identity、不同 URI/metadata 在 Python 中不相等，在数据库中却被视为同一 relation。

### M-05 `RefType` 尚未覆盖 Binding 所需资源类型

严重度：Info
类型：planned extension gap

Production v0.1 只有 Session/WorkflowInstance/Run/Workspace/Artifact，没有 SecretRef、EnvironmentRef。对当前 Core 不是 bug，但 Binding production integration 前必须选择可扩展方式，避免频繁修改冻结 enum。

## 6. Work lifecycle 问题

### W-01 lifecycle transition 没有 guard

严重度：Medium
类型：state semantic gap

当前允许：

```text
completed → completed
abandoned → completed
open → open（reopen）
```

每次都会 version+1 并产生 Event。需要明确允许的 transition，至少拒绝无变化的 material event。

### W-02 `ABANDONED` 没有垂直实现

严重度：Medium
类型：incomplete vertical slice

Model 有 `WorkLifecycle.ABANDONED`，但缺少：

- `abandon_work()`；
- `WorkAbandoned` EventType；
- 对应测试与 CLI。

应删除未使用 vocabulary，或完成最小垂直实现。

### W-03 closed Work 仍可直接创建 Execution

严重度：Medium
类型：unfrozen policy

`create_execution()` 只验证 Work 存在，不检查 lifecycle。当前 completed/abandoned Work 可以直接增加 Execution，无需先 reopen。需要明确这是允许的审计行为，还是应强制显式 reopen。

## 7. Projection 与 observation 问题

### P-01 terminal 可以被更晚的 active observation 覆盖

严重度：High
类型：unfrozen Execution identity semantic

`observe_projection()` 只拒绝较旧 `observed_at`，没有禁止：

```text
terminal → active
```

这可能表示 resume 同一 session，也可能违反“一次 Execution attempt terminal 后不可逆”。必须先冻结 Execution 是 single attempt 还是 resumable session continuity。

### P-02 terminal → active 会保留 `ended_at`

严重度：Medium
类型：state inconsistency

更新非 terminal Projection 时，`ended_at` 保留 current value。因此可出现：

```text
phase=active
ended_at!=NULL
```

若允许 resume，需要单独表达 turn/run continuity；单一 `started_at/ended_at` 无法清楚描述多次 active/terminal 周期。

### P-03 `started_at/ended_at` 的时间语义未命名清楚

严重度：Low
类型：field clarification

当前使用 Core `_now()`，不是 Provider native timestamp，也不是传入 Projection 的 `observed_at`。实际语义是“Core 首次观察 active/terminal 的处理时间”。字段名容易被误读为 native start/end。

### P-04 同语义 observation 不刷新 `observed_at`

严重度：Medium
类型：semantic tradeoff requiring documentation

10:00 与 10:05 都观察到 `active/observed`，第二次不会写入，数据库仍保留 10:00。当前 `observed_at` 不是“最近成功观察时间”，而更像“当前 material projection 被写入的 evidence time”。

若 admission/recovery 依赖 observation freshness，不能直接把该字段当 last-seen-at。

### P-05 相同 timestamp 的冲突 observation 可覆盖

严重度：Low
类型：ordering ambiguity

Service 只使用 `<`，不是 `<=`。两个相同 `observed_at`、语义不同的 Projection，后写者可以覆盖前者。需要 event sequence/provider cursor 或明确 last-write-wins。

### P-06 Provider observation trust boundary 很弱

严重度：Medium
类型：interface limitation

`observe_projection()` 信任调用方传入的归一化 Projection，只检查内部组合、时间和 version，不校验：

- observation 来自哪个 Provider；
- 是否匹配 `Execution.provider_id`；
- native Ref/correlation 是否一致；
- evidence reference/assurance。

当前由 Host/adapter 正确性承担全部信任责任。

## 8. `apply_observation()` 问题

### O-01 未使用的 `current` 查询

严重度：Low
类型：implementation cleanup

`apply_observation()` 首行读取 `current`，随后不使用；`observe_projection()` 又读取一次。删除不会改变当前行为。

### O-02 Projection 与多个 Ref 不是原子 observation

严重度：Medium
类型：recovery gap

Projection update 与每个 `attach_ref()` 是独立 transaction。Crash 可留下：

```text
Projection 已 terminal
SessionRef 已写
ArtifactRef 未写
```

部分事实可幂等补写本身可以接受，但当前没有 observation/correlation ID 或 recovery driver 判断缺失部分。

### O-03 被判旧的 observation 仍可附加 Ref

严重度：Medium
类型：semantic bug/ambiguity

即使 `observe_projection()` 因时间较旧而返回 current，`apply_observation()` 仍继续附加 native/output refs。稳定 native identity 的迟到发现可能合理，但过期 output 也会进入 current relation graph。需要按 relation/evidence 明确规则。

### O-04 Service 无法附加 INPUT relation

严重度：Medium
类型：vertical API gap

Repository 和 schema 支持 `RefRelation.INPUT`，但 `apply_observation()` 只有 `native_refs` 与 `output_refs` 参数。当前 input refs 只能绕过 Service 直接调用 Repository，说明 INPUT vocabulary 没有完整接线。

### O-05 Ref discovery Event 使用 Core `_now()`，与 Projection observation 不关联

严重度：Low
类型：audit correlation gap

同一 Provider observation 产生的 Projection 和 refs 没有共同 observation ID，Event 时间也分别生成，事故后无法证明它们来自同一原生 observation envelope。

## 9. Dispatch 问题

### D-01 一个 Execution 可以创建多个 dispatch

严重度：High
类型：schema invariant gap

`core_dispatches.idempotency_key` 唯一，但 `execution_id` 不唯一。不同 idempotency key 可为同一个 Execution 创建多个 dispatch，与“Execution 是一次具体执行尝试”的直觉冲突。

### D-02 idempotency 是 check-then-insert，race 不会优雅收敛

严重度：Medium
类型：concurrency implementation gap

两个进程同时使用相同 key 时，UNIQUE constraint 会阻止重复 row，但后写者可能收到原生 SQLite integrity error，而不是重新读取并返回现有 dispatch ID。

### D-03 `dispatched_at` 从未更新

严重度：Medium
类型：field/behavior mismatch

Execution 有 `dispatched_at`，但 `request_dispatch()` 只创建 dispatch row/Event，不更新 Execution。字段在正常首次启动路径中可长期为 NULL。

### D-04 dispatch lifecycle 只实现 `requested`

严重度：Critical
类型：operational loop gap

Schema 预留 state 和 correlation，但 Repository/Service 没有：

```text
claim
requested → starting
starting → started
observe/reconcile
terminal/failure handling
```

因此 dispatch 目前只是 durable intent，不是 crash-safe execution protocol。

### D-05 `provider_correlation_ref` 字段未使用

严重度：High
类型：incomplete recovery contract

PID、Codex SessionRef/RunRef 已能获得，但没有写入 dispatch correlation 字段。Provider start 后、Ref 持久化前 crash 时无法区分“未启动”和“已启动但 Core 丢失引用”。

### D-06 CLI 忽略 `dispatch_id`

严重度：High
类型：vertical slice reliability gap

CLI 调用 `request_dispatch()` 后不保存返回值，直接 `provider.start()`。dispatch ID 没传入 Provider，也没有进入 native correlation，无法约束重复 side effect。

### D-07 `DispatchFailed` error 未使用

严重度：Low
类型：dead vocabulary

`errors.py` 定义 `DispatchFailed`，当前 Service/CLI/Provider 均未使用。应删除或在完整 dispatch protocol 中赋予明确语义。

## 10. Resume 与 restart 问题

### R-01 resume 完全绕过 dispatch

严重度：Critical
类型：operational loop gap

首次 start 有 durable dispatch intent，resume 只有：

```text
检查 resumable_now
→ provider.resume(request)
```

没有 dispatch ID、idempotency、resume event、native correlation 或 crash recovery。

### R-02 resume 存在 observation-to-use TOCTOU

严重度：Medium
类型：boundary limitation

`resumable_now=True` 是历史 observation。检查后 native session 可立即失效；当前只能让 Provider resume 失败，没有 conditional-use 保证。

### R-03 Execution continuity 语义未冻结

严重度：High
类型：domain semantic decision

当前测试允许 terminal Execution resume，并可能再次 active。必须明确：

- Execution 是单次 Provider attempt；还是
- Execution 是跨多个 turn 的 native session continuity。

Governed Binding 下，输入发生 rebind 后绝不能在同一已 dispatch Execution 上继续，这进一步要求冻结该语义。

### R-04 没有 restart observation driver

严重度：High
类型：runtime gap

系统没有组件在 restart 后：

```text
枚举 active/unknown Execution
→ 找 native/correlation Ref
→ 调 provider.observe
→ reconcile current Projection
```

### R-05 当前 Codex 无 standalone observe 能力

严重度：High for Codex recovery
类型：provider boundary limitation

Codex adapter 的 `observe(native_ref)` 明确返回 unknown/unreachable，因为 Codex CLI 无可靠的独立 thread query。真实状态主要依赖启动进程期间的 JSONL stream，Core crash 后恢复能力弱。

## 11. Events 与审计问题

### E-01 `ExecutionStarted` EventType 未使用

严重度：Low
类型：event vocabulary mismatch

第一次观察 active 时写 `ExecutionProjectionChanged`，不写 `ExecutionStarted`。应删除未用事件，或明确第一次 active 的 material event。

### E-02 缺少 `WorkAbandoned`

严重度：Medium
类型：incomplete lifecycle vocabulary

与 W-02 同源，ABANDONED 无法形成完整 audit fact。

### E-03 `ExecutionTerminal` Event data 缺少 outcome

严重度：Medium
类型：audit evidence weakness

Service 只写：

```text
phase
freshness
```

没有 outcome、resumable_now 或 Provider evidence ref。EventLedger 单独无法回答 terminal 是 succeeded、failed 还是 cancelled。虽然系统不是 event sourcing，作为 material audit event 仍过于稀薄。

### E-04 Ref Event data 无法识别具体 Ref

严重度：Low/Medium
类型：audit tradeoff

`NativeRefDiscovered`/`RefAttached` data 只保存 Ref type，不保存 relation、provider、native ID。完整事实只能查询 current relation table。

### E-05 append-only 仅是应用约定

严重度：Low
类型：persistence hardening

数据库没有 trigger 或权限阻止 UPDATE/DELETE `core_events`。当前 Repository 不暴露修改方法，但 SQLite 文件的其他调用者仍可改写。

### E-06 Event subject 没有 foreign key

严重度：Info
类型：deliberate polymorphic tradeoff

`subject_id` 可逻辑指向 Work/Execution，数据库不能保证 subject 存在，也不会随 subject 删除。该设计适合跨类型 ledger，但必须接受 orphan event 的可能性。

## 12. Registry 与 Provider contract 问题

### G-01 Protocol 与实际 optional operations 不一致

严重度：Medium
类型：interface mismatch

`ExecutionProvider` Protocol 只声明 start/observe；Codex 与 Service 实际还使用 resume、cancel、stream。resume 通过 `getattr()` 动态调用，静态协议无法表达声明与实现一致性。

### G-02 capabilities 是自由字符串

严重度：Medium
类型：stringly-typed contract

`Mapping[str, str]` 容易产生 operation/value 拼写和语义漂移。Registry 仅把 `supported`、`emulated` 视为可用，没有 enum/DTO 或 capability schema。

### G-03 request/response 全部是 `Any`

严重度：High for reliable dispatch
类型：interface capability gap

Provider-specific launch payload 可以 opaque，但 Core 仍需要最小统一 envelope 表达：

- execution/dispatch correlation；
- idempotency；
- native refs；
- initial observation；
- actual evidence coverage。

当前 Registry 无法检查 start 返回了什么，也无法支持统一 recovery。

### G-04 注册时不验证 capability 与方法一致

严重度：Medium
类型：runtime validation gap

Provider 可声明 `resume=supported` 却不实现 callable `resume`，直到调用时才失败。应在注册阶段做最小 consistency validation。

### G-05 Descriptor version 语义不清

严重度：Low
类型：field clarification

Codex 填入 `jsonl-v1`，说明字段更像 adapter/protocol version，而不是 Provider binary/version。建议明确命名和兼容规则。

### G-06 Descriptor 只验证 ID 非空

严重度：Low
类型：validation gap

display name/version 为空、capability shape 非法等均可注册。

### G-07 Registry 是手工、内存 composition root

严重度：Info/Product gap
类型：product integration limitation

CLI `_registry()` 只手工注册 Codex。Provider instance 不需要持久化，但生产需要稳定启动注册、诊断、版本/capability inventory 和 unavailable reason。

### G-08 Registry 没有并发保护

严重度：Low
类型：operational assumption

当前假设 Provider 只在 startup 注册。若支持运行时热插拔，需要 lock/copy-on-write；否则应明确 Registry freeze-after-build。

### G-09 缺少独立 RefAuthority registry

严重度：High for Binding integration
类型：new interface, not new entity

Git/Vault/Environment 等资源真相不能归 ExecutionProvider 所有。Binding 接入需要并列的 authority routing/capability registry，同时避免 Registry 变成 resource lifecycle manager。

### G-10 缺少 enforcement/evidence capability

严重度：High for Binding integration
类型：interface capability

真实 Provider 强验证表明，Provider 必须按 Ref type 声明：

- immutable-address/conditional-use/observe-only；
- actual pin observability；
- required-slot evidence completeness；
- undeclared-input coverage；
- assurance level。

当前 `start/observe/resume` operation map 无法表达这些能力。

## 13. Schema 约束问题

### DB-01 多个领域组合只由 Python 保证

严重度：Low/Medium
类型：defense-in-depth gap

数据库没有 CHECK constraint 保证：

- Work lifecycle 合法；
- terminal 必须有 outcome；
- nonterminal 不得有 outcome；
- Ref relation/type 合法；
- dispatch state 合法；
- version 非负。

通过 Repository 构造时 Python enum/dataclass 可拦截，但直接 SQL 或旧数据可写入非法组合。

### DB-02 进程内写锁不等于多进程协调

严重度：Info
类型：operational boundary

`threading.Lock` 只保护同一进程共享 connection。多进程依赖 SQLite file lock、UNIQUE 和 version CAS。当前未启用 WAL，也没有系统性多进程 dispatch concurrency 测试。

### DB-03 Ref 不是独立 aggregate

严重度：Info
类型：deliberate design

没有全局 refs table；Ref 是 execution relation 中的 value。Work 的 Ref graph 必须经 Work→Execution→relations 派生。Binding 接入时不应误建资源 lifecycle aggregate。

## 14. CLI/Codex vertical slice 问题

### C-01 CLI 是顺序 happy path，不是 dispatcher

严重度：High
类型：product/runtime gap

CLI 同一进程中顺序执行 create Execution、request dispatch、provider start、capture。没有 worker claim、restart recovery 或 durable continuation。

### C-02 初次 PID observation 仍写 `unknown/stale`

严重度：Low
类型：semantic choice

CLI 已获得真实 PID 后仍先写 unknown/stale + RunRef，而不是 active。这是保守选择，但需要明确“process exists”是否足以投影 active。

### C-03 Workspace output Ref 没有版本 pin

严重度：High for governed handoff
类型：current model capability gap

CLI terminal capture 记录的是 workspace path Ref，无法回答实际输入 commit、输出 commit/tree 或 dirty state。它能持久化关系，但不能形成可重现 handoff。

### C-04 Diagnostic ArtifactRef 是 Provider log locator，不是完整 output declaration

严重度：Info
类型：deliberate limitation

当前 output refs 只有 workspace path 与 JSONL diagnostics，不能证明业务 artifact、test report 或 actual consumption。

### C-05 原生 JSONL 留在 diagnostics，边界正确但恢复弱

严重度：Info
类型：tradeoff

不把完整 JSONL 塞入 Core 是正确的；但如果 diagnostics locator 尚未持久化就 crash，Core 无法重建 stream observation。

## 15. Binding 尚未进入 Production Core

以下能力目前只在 Spike 中验证，不在 production schema/contract：

- ExecutionBinding/BindingSlot/BoundRef；
- BindingValidation/ApprovalDecision；
- accepted_binding_id；
- ExecutionResourceFact；
- requested/frozen 与 actual consumed 分离；
- conformance derivation；
- RefAuthority；
- native conditional-use；
- contribution derived view。

这不是 v0.1 的回归，但意味着当前 Core 只能回答“关系存在”，不能回答“下一次应使用什么、是否有效、实际用了什么”。

## 16. 测试覆盖缺口

现有测试覆盖了：

- Work closure 独立于 Execution outcome；
- dispatch 同 key 顺序重试幂等；
- stale version CAS；
- 重复 Projection/Ref 不制造重复 Event；
- restart 后 current state 可重载；
- Provider capability 不进入 Core 分支；
- Codex JSONL/launch happy path。

尚缺 Production Core 层测试：

- 并发相同 dispatch key；
- 同 Execution 不同 dispatch key；
- provider started/native ref 未写时 crash；
- partial `apply_observation()` recovery；
- terminal→active/resume timestamp；
- closed Work 创建 Execution；
- abandon lifecycle；
- stale observation 携带新 output Ref；
- 长 objective/reason；
- metadata nested mutation；
- Registry 声明/方法不一致；
- multiprocess CAS/SQLite contention。

Binding Stress Spike 已覆盖部分未来语义，但不能替代 production contract tests。

## 17. 优先级建议

### P0：闭合 Execution operational spine

1. 冻结 Execution identity/continuity：single attempt 还是 resumable session。
2. 强制一个 Execution 只能 accept 一个 dispatch。
3. 实现 dispatch claim：`requested → starting → started`。
4. 将 dispatch ID 传入 Provider correlation。
5. restart 时 `starting` 必须 observe/reconcile，不得 blind redispatch。
6. resume 使用同一 durable dispatch/correlation protocol，或明确创建新 Execution。
7. facts/refs 可按 correlation 幂等补写。

### P1：收紧 Provider extension contract

1. 定义 bounded/typed capability DTO。
2. 保留 Provider-specific payload，但增加统一 start/observe result envelope。
3. 注册时验证 capability 与 callable 一致。
4. 明确 descriptor adapter version。
5. 增加独立 RefAuthority routing/capability interface。
6. 声明 enforcement、actual evidence 与 coverage 能力。

### P2：清理领域垂直缺口

1. 决定并实现 Work lifecycle transition guard。
2. 完成或删除 ABANDONED vocabulary。
3. 统一 objective/reason 与 Event data 限制。
4. 修复 Ref identity equality 语义。
5. 删除冗余查询和未使用 error/event vocabulary。
6. 明确 observed/start/end timestamp 含义。

### P3：再接入 Governed Binding

只有在可靠 dispatch 边界存在后，才将以下操作做成一个事务：

```text
verify frozen Binding
+ accept valid Validation
+ set accepted_binding_id
+ create DispatchRequested
```

否则 Binding 即使正确，也会挂在一个不能可靠恢复的 Provider start 边界上。

## 18. Freeze gate

### 可以保留并准备冻结

- Work 与 Execution 分离；
- Ref 只指向外部 identity；
- Provider-neutral Projection；
- Work closure 显式发生；
- current-state + material EventLedger；
- Registry 避免 Provider-specific Core branching；
- Provider diagnostics 不进入 Core telemetry store。

### 冻结前必须裁决

- Execution terminal 后能否 resume 为 active；
- resume 是同一 Execution 还是新 Execution；
- 一个 Execution 是否严格只有一个 dispatch；
- dispatch/restart correlation protocol；
- `observed_at/started_at/ended_at` 的精确定义；
- Work closed 后创建 Execution 的规则；
- Provider/Authority capability contract；
- Binding acceptance 与 dispatch 的事务边界。

## 19. 最终判断

当前 Work Core 的主要问题不是 ontology 膨胀，而是实现停在“可持久化 happy path”与“可靠 runtime”之间。应继续保持小模型，但不能把已有真实 Codex demo 等同于完整 operational closure。

最值得优先处理的不是 CLI 功能，而是：

```text
Execution continuity
Dispatch single-accept
Provider correlation
Restart reconciliation
Typed capability/evidence boundary
```

完成这些后，Execution Binding 才能作为受治理的执行合同进入 production，而不会退化成附着在 prompt/start 调用前的一份 manifest。
