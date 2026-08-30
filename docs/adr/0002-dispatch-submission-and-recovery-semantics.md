# ADR-0002：Dispatch Submission 与 Recovery Semantics

Status: Current — retained as an active architectural decision.

- 状态：Proposed — Accept with Important Amendment
- 日期：2026-08-23
- 依赖：[ADR-0001：Execution Attempt 与 Session Continuity 分离](./0001-execution-attempt-vs-session-continuity.md)
- 决策范围：Production Minimal Work Core 的 Dispatch submission、redelivery 与 crash recovery
- 实现状态：Pending；本 ADR 不修改 production code

## Context

ADR-0001 已冻结：

```text
Execution = single execution responsibility attempt
one Execution = at most one accepted Dispatch
retry / rerun / terminal continuation = new Execution + new Dispatch
crash recovery of the same native side effect = reconcile old Execution + old Dispatch
```

Production Minimal Work Core 当前只能持久化一个 `state='requested'` 的 Dispatch row。CLI 随后直接调用 `provider.start()`；没有 `starting` claim、durable correlation 写入、`started` 门槛或 restart driver。

这留下两个不能由 Execution Projection 解决的问题：

1. Provider 已经创建 native execution，但 response 或 Core 在 correlation 入库前丢失；
2. Core 在线时可以通过当前 process/stream 观察 native execution，但 Core restart 后无法重新定位它。

`Execution.phase=active` 只回答最近观察到的执行事实。它不能证明 Dispatch 已经获得 crash-safe recovery identity。因此 Dispatch submission/recovery state 必须与 Execution Projection 分离。

## Decision

采用三个单调 Dispatch state：

```text
requested → starting → started
```

`unresolved` 不增加为第四个领域状态。它是以下情况的派生 recovery disposition：

```text
Dispatch.state = starting
AND no durable correlation is persisted/reconstructible
AND no currently valid safe-redelivery evidence exists
```

### Important amendment

原始候选规则：

> unknown after entering the side-effect boundary must never call create/start again

过于严格。最终规则是：

> 禁止任何可能产生第二个 native side effect 的 blind redispatch；但 Provider-native contract 若能证明使用同一 Dispatch identity 和同一不可变请求重复提交不会产生第二个 native operation，则允许 same-dispatch idempotent redelivery，作为 reconciliation mechanism。

同时，`proven-no-side-effect` 只是 ordinary delivery retry 的必要条件，不是唯一条件。重投还必须保持同一个 immutable dispatch intent；不得在同一个 D1 下修改 Binding、provider、target 或有语义的 launch parameters。

## Requested / starting / started

### `requested`

含义：

- Core 已持久化接受 D1 的意图；
- D1 已绑定 E1、唯一 idempotency key 和不可变 submission/request digest；
- 尚未 claim Provider side-effect boundary；
- 没有 native side effect 是由这个 Dispatch delivery 产生的。

允许的行为：

- 做 local validation、serialization 和 capability/precondition checks；
- 使用 CAS claim D1；
- Core restart 后重新 claim 并首次 delivery。

本地准备失败时保持 `requested`。这些失败不是新 Dispatch，也不产生 Provider side effect。

### `starting`

含义：

- Core 已通过 CAS claim D1，并进入 Provider side-effect danger window；
- native side effect 可能尚未发生，也可能已经发生；
- Core 尚未持久化足够的 durable recovery correlation；
- 除非有强 evidence，否则 absence 和 existence 都不能猜测。

`requested → starting` 必须在调用可能产生 side effect 的 Provider API 之前提交。该保守转换允许出现“Core 写入 starting 后、真正调用前 crash”；restart 时宁可 unresolved，也不能假设安全重发。

`starting` 可以伴随下列任意 Execution Projection：

```text
unknown
active
terminal
```

这不是矛盾。Dispatch state 描述 recovery guarantee，Projection 描述观测到的 native execution truth。

### `started`

`started` 是严格的 Core guarantee，不是 Provider-native phase 名称。

只有同时满足以下条件才能持久化 `started`：

1. evidence 明确属于 D1 和它的 immutable request digest；
2. 已获得一个 canonical recovery locator，或者 locator 可由 D1 确定性重建；
3. locator/重建机制在 Core restart 后仍可用于定位同一次 native execution；
4. Provider 能以该 locator observe/reconcile，而不是只能再次 blind start；
5. correlation evidence 与 `state=started` 在同一 Core transaction 中持久化。

Provider 返回了 PID、SessionRef 或任意 `start()` result 都不自动满足上述条件。Core 禁止硬编码：

```text
started iff PID exists
started iff SessionRef exists
started iff provider.start() returned
started iff Execution became active
```

Provider 负责用自己的 native mechanism 提供 evidence，例如 CI `run_id`、deployment `operation_id`、可查询的 provider request token，或 provider-owned durable marker。Core 只执行统一门槛。

## Started semantic

### Durable correlation 的最小含义

这里的 durable 只针对 Core process crash/restart，而不是承诺外部 Provider 永久保存资源。

Provider 声明 `recovery_correlation=durable` 时，其 adapter 必须保证：

- correlation 不依赖原 Core process memory、stdout pipe 或仍存活的文件描述符；
- 在 native execution 可能仍需要 reconcile 的期间内有效；
- 指向本次 D1，而不只是“某个同名资源”；
- restart 后能够进行无 create-side-effect 的 lookup/observe；
- correlation 不是 bearer secret。Core 只保存 opaque identity/locator。

若 Provider 的 recovery token 有固定 retention horizon，只有满足 Core 最低 recovery horizon 才能声明 `durable`；否则声明 `unsupported`。

### Correlation 写入窗口

Provider 已经返回 correlation，但 Core 在 transaction commit 前 crash，数据库中的 D1 仍是 `starting`，不能事后假装 `started`。

restart 后：

- 若可按 D1/client token 查询同一 operation，恢复 correlation 并原子写入 `started`；
- 若 native API 支持安全的 same-key idempotent redelivery，可通过该机制取回同一 operation；
- 否则保持 `starting/unresolved`。

## Weak Provider

弱 Provider 允许注册：

```text
recovery_correlation = unsupported
```

它仍可：

- 接收 Dispatch；
- 在当前 Core process 在线时提供 stream/process observation；
- 使 Execution Projection 成为 active 或 terminal；
- 产生 actual facts、outputs 和 outcome evidence。

但它不能把 D1 标为 `started`。其 Dispatch 可以永久保持 `starting`，即使 Execution 已经 terminal。这是有意的：Dispatch state 不是第二套 Execution lifecycle。

若 Core 在危险窗口 crash 且没有新的外部 evidence：

```text
Dispatch = starting / unresolved
Execution Projection = unknown
```

Core 不得 blind redispatch、猜测 failed/cancelled/terminal，或用 E2 掩盖 E1 的不确定 side effect。只能等待/寻找 evidence，或由人工显式 resolve/abandon；用户随后仍要再执行时创建 E2/D2。

弱 Provider 的代价是较弱 recovery guarantee，而不是较弱 `started` 定义。

## Redelivery semantics

### 1. Pre-boundary delivery retry

以下情况发生在 D1 仍为 `requested` 时：

- local validation failure；
- serialization failure；
- Provider unavailable 且 adapter 能证明 request 未发送；
- capability/precondition reject before native call。

允许再次 claim/deliver 同一 D1，但 submission digest 必须相同。

### 2. Proven-no-side-effect ordinary retry

D1 已进入 `starting`，但 Provider 返回 contract-defined evidence，例如：

```text
rejected_before_create
request_not_accepted
precondition_failed_before_operation_creation
```

只有 Provider contract 保证该 reason code 意味着没有 native object、execution 或 side effect，Core 才能记录 `side_effect_absence_proven`，并允许同 D1 ordinary redelivery。

HTTP status 本身不是足够 evidence。通用 `400`、`409` 或异常类可能在不同 Provider 中发生于不同边界；必须由 adapter 映射到具有明确契约的 disposition。

如果修复需要改变 Binding 或有语义的 request parameters，则不再是同一 D1。应停止 E1，并按 ADR-0001 的责任边界创建 E2/D2。

### 3. Indeterminate submission

例如：

```text
request sent
→ response timeout / connection lost
```

无法证明 Provider 未收到，也无法证明 native operation 已创建。默认行为：

```text
state remains starting
reconcile only
no ordinary start retry
```

unknown 必须按 unsafe 处理。

### 4. Idempotent same-key redelivery

这是第 3 类的窄例外，不是 ordinary retry。

当 Provider-native API 对 D1 提供真正的 idempotent create 时，Core 可以在结果未知后再次发送相同 create request。该调用必须满足：

1. D1 或其稳定映射作为 native client operation key；
2. 相同 key + 相同 canonical request 在同一 tenant/region/endpoint scope 内至多创建一个 native operation；
3. 并发重复请求也不会创建第二个 operation；
4. 参数变化被 Provider 拒绝，而不是被解释为新 intent；
5. idempotency retention window 在 redelivery 时仍有效；
6. Core 以持久化 submission digest 检查请求未变；
7. 重投返回同一 native operation/correlation，或安全地创建唯一 operation；
8. adapter 对以上保证有明确 contract 和契约测试。

如果 token 已过期、scope 改变、参数无法证明相同或 Provider 只保证 HTTP retry 而不保证 side effect uniqueness，则不得 redeliver。

这种操作命名为：

```text
idempotent redelivery / reconciliation-via-redelivery
```

它仍属于 E1/D1，不创建 DispatchAttempt，也不把它计为 Execution retry。

## Retry vs redelivery vs reconcile

| Operation | Execution / Dispatch | Preconditions | May create the one native operation? |
|---|---|---|---|
| Pre-boundary delivery retry | E1 / D1 | boundary 未进入；request digest 相同 | Yes, once |
| Proven-no-side-effect retry | E1 / D1 | absence proof 已持久化；request digest 相同 | Yes, once |
| Observe/reconcile | E1 / D1 | 已有 correlation 或无副作用 lookup | No |
| Idempotent redelivery | E1 / D1 | native same-key uniqueness contract 当前有效 | Yes if absent; returns same if present |
| Execution retry/rerun | E2 / D2 | E1 已产生 attempt/side effect 或已 terminal | Yes, new responsibility attempt |

## Restart semantics

| Durable state/evidence | Restart action | Forbidden action |
|---|---|---|
| `requested` | CAS claim D1，首次 delivery | 创建 D2 给 E1 |
| `starting` + persisted no-side-effect proof | same D1、same digest ordinary redelivery | 修改请求后复用 D1 |
| `starting` + currently valid native idempotency guarantee | same D1 idempotent redelivery/reconciliation | 更换 key/scope/parameters |
| `starting` + recoverable by D1/native marker | lookup，恢复 correlation，mark started | blind create |
| `starting` + no usable evidence | 保持 unresolved；寻找外部 evidence/人工处理 | start again、猜 outcome |
| `started` + correlation | `observe(correlation)` 并 reconcile E1 | 再次 create/start |
| any Dispatch + E1 terminal | 保留历史，禁止再次 delivery | 用 D1 retry Execution |

## Provider capability

第一版保持二值 capability，不增加 weak 中间等级：

```text
recovery_correlation:
  durable
  unsupported

idempotent_redelivery:
  supported
  unsupported
```

`recovery_correlation=durable` 表示 Provider 理论上具备满足 `started` contract 的机制，不表示每次 start 都成功获得 evidence。

`idempotent_redelivery=supported` 只表示 adapter 存在可验证的 native uniqueness contract。每次 redelivery 仍必须检查 scope、request digest 和 retention window。

不单独增加 `safe_not_started` capability。它是某次 Provider response 的 per-dispatch evidence；没有 evidence 时不能从静态 capability 推导。

Core 不出现：

```text
if provider == codex
if provider == ci
if correlation looks like PID
```

## Per-dispatch evidence contract

Provider start request 的最小 envelope 应包含：

```text
dispatch_id
execution_id
idempotency_key
submission_digest
provider launch request
```

`submission_digest` 覆盖会改变 native side-effect intent 的稳定字段，包括 accepted Binding identity/digest、continuation/context refs、target 和有语义的 launch parameters；排除 trace ID、deadline、transport headers 等非语义字段。Core 不保存 secret material。

Provider start result 是 DTO，不是新领域实体。最小 disposition：

```text
correlated
  correlation_ref required

no_side_effect
  evidence_code required

indeterminate
  evidence_code optional
```

`correlated` result 只有在 correlation 与 `started` state 原子持久化后，才使 D1 成为 `started`。

`no_side_effect` 必须来自 adapter contract 定义的强 reason code。布尔字段本身不能绕过 Provider contract。

`indeterminate` 保持 `starting`。

### Canonical correlation cardinality

当前 `provider_correlation_ref` 单值字段足以保存 Core recovery 所需的 canonical locator：

- Provider namespace 可由 E1 的 `provider_id` 得到；
- compound native key 可编码为 provider-owned opaque locator/URI；
- 其他 SessionRef、RunRef、job/artifact refs 继续使用现有 Execution Ref relation。

第一版不需要一对多 Dispatch correlation 表。只有真实 Provider 证明“必须同时持久化多个独立 locator 才能恢复同一次 operation”时再评估；不能为了可能性扩 schema。

correlation ref 禁止包含 bearer token、secret 或只能在原进程内解释的 handle。

## Relationship to Execution

1. 一个 Execution 最多一个 accepted Dispatch，数据库必须约束 `UNIQUE(core_dispatches.execution_id)`。
2. D1 的 provider、Binding/input basis 和 submission digest 一旦 accepted 不可改变。
3. D1 的 delivery retry/redelivery 不产生新的 Execution。
4. 如果 D1 已产生 native attempt/side effect、E1 已 terminal，或用户改变执行意图，则再次执行必须创建 E2/D2。
5. `Execution.dispatched_at` 表示 Core 接受并持久化唯一 Dispatch 的时刻，不表示 Provider 已 durable-started。

## Relationship to Projection

Dispatch state 与 Execution Projection 是正交维度：

| Dispatch | Execution Projection | 合法含义 |
|---|---|---|
| requested | unknown | 尚未进入 Provider boundary |
| starting | unknown | native truth/correlation 均不确定 |
| starting | active | 当前 stream/process 可见，但 restart recovery 未建立 |
| starting | terminal | 在线期间得到 terminal evidence，但从未建立 durable correlation |
| started | active | 可 durable reconcile 的运行中 execution |
| started | terminal | 可审计的已结束 execution |
| started | unknown | correlation 存在，但 Provider 当前 unreachable/stale |

因此：

```text
Dispatch.started != Execution.active
Dispatch.unresolved != Execution.failed
Execution.started_at != durable Dispatch correlation timestamp
```

不要把 Dispatch 扩成第二套 native execution lifecycle。它只描述 submission boundary 与 recovery guarantee。

## Failure examples

### Scenario A：Strong Provider normal start — PASS

```text
D1 requested → starting
API returns run_id
Core transaction persists run_id + started
restart → observe(run_id) → reconcile E1
```

不需要 blind start。

### Scenario B：Provider start succeeded, crash before correlation commit — PASS, conditional

- Provider 可按 D1/idempotency marker lookup：恢复同一 operation，mark started；
- Provider 支持安全 idempotent redelivery：用同 D1 取回/创建唯一 operation；
- 两者都不支持：保持 starting/unresolved，E1 unknown。

不能从“Provider 通常支持 correlation”推导本次 D1 已 started。

### Scenario C：Weak CLI Provider — PASS with explicit limitation

无 query API、durable marker 或 recoverable ID 时，D1 不能成为 started。在线期间 process/stream 可使 E1 active/terminal；Core crash 后无法恢复则 D1 unresolved、E1 unknown。没有新增状态机或实体。

当前 Codex CLI adapter 属于该类，除非后续证明 thread/native marker 能从独立 Core restart 可靠查询该次 invocation。

### Scenario D：HTTP 400 / validation reject — PASS only with contract evidence

“HTTP 400”本身不足。若 adapter 能证明具体 response 发生在 operation creation 之前，并映射为 `no_side_effect`，相同 request digest 可重投 D1。若需要修改请求，不能复用 D1。

### Scenario E：Network timeout — PASS

普通 Provider：starting/unresolved，reconcile only，不再次 start。

支持 Scenario F 的 Provider：进入 idempotent redelivery 分支。

### Scenario F：Native idempotent create — PASS, amends original rule

在 native API 对同 key、同参数、同 scope 保证至多一个 operation 且 guarantee 尚未过期时，同 D1 redelivery 不会制造第二次 side-effect attempt。因此它是 E1/D1 的 reconciliation mechanism，不是 E2/D2 retry。

### Scenario G：Definitive not-started — PASS

Provider contract 返回并由 Core持久化 `side_effect_absence_proven` 后，相同 request digest 可重投 D1。

### Scenario H：Terminal failure then user retry — PASS

```text
E1 / D1 / terminal failed
→ user retry
→ E2 / D2
```

禁止 E1/D2 或重投 D1。

## Formal invariants after attack

1. **PASS**：一个 Execution 最多一个 accepted Dispatch。
2. **PASS**：只有 durable recovery correlation 对本次 D1 成立并已持久化/可确定重建，Dispatch 才是 started。
3. **PASS**：native identity 只是 evidence，不定义 Core state。
4. **PASS**：弱 Provider 可接入，但不降低 started guarantee。
5. **PASS**：starting/unresolved 禁止可能产生第二个 operation 的 blind redispatch。
6. **AMENDED**：ordinary same-D1 retry 要求 proven-no-side-effect **且 immutable request digest 相同**。
7. **PASS**：native-idempotent same-key redelivery 可作为 reconciliation，但 uniqueness/scope/retention/request-equivalence 必须被证明。
8. **PASS**：Dispatch.started 与 Execution.active 独立。
9. **PASS**：Dispatch unresolved 不等于 Execution failed。
10. **PASS**：新的 actual side-effect attempt 必须使用 E2/D2。

## Mature-system sanity check

该 decomposition 与成熟 API 的失败处理一致，但 Agent-Box 不复制它们的完整 runtime。

### Native idempotency keys

AWS EC2 对支持 client token 的 create API 保证：相同 token 与相同参数重复请求不会执行额外 action，参数变化则返回 `IdempotentParameterMismatch`。这支持“unknown 后 same-D1 redelivery 可以安全收敛”，也证明 request equivalence 是必要条件。[AWS EC2 idempotency](https://docs.aws.amazon.com/ec2/latest/devguide/ec2-api-idempotency.html)

Stripe 明确建议网络错误后以同一 idempotency key 和相同参数重试；它同时说明 key 过期/被清理后会成为新请求，而且参数不同会拒绝。这支持 scope、retention 和 request digest 约束。[Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)、[Stripe advanced error handling](https://docs.stripe.com/error-low-level)

AWS Builders' Library 将 response-lost 后直接重试可能产生多个资源的问题，与 client request ID 提供的幂等重投明确区分。这与 blind redispatch / idempotent redelivery 的边界一致。[Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)

### Durable operation correlation

AWS Cloud Control 返回 `RequestToken`，并允许之后用它查询同一异步 resource operation；Azure Resource Manager 返回 `Azure-AsyncOperation`/`Location` URL 供客户端轮询。这些都是“Provider mechanism 满足 Core durable started threshold”的成熟实例。[AWS ProgressEvent](https://docs.aws.amazon.com/cloudcontrolapi/latest/APIReference/API_ProgressEvent.html)、[Azure async operations](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/async-operations)

### Decomposition sanity check

成熟系统共同区分：

```text
durably recorded local intent
→ submission may have crossed side-effect boundary
→ durable remote correlation established
```

并在 response lost 时区分普通重复 create 与 native-idempotent same-key redelivery。因此 `requested → starting → started`、proven-not-started retry、unknown reconcile 和 idempotent redelivery 是合理的最小 decomposition。

## Concurrency and idempotency rules

不需要 distributed workflow engine。普通数据库约束和 CAS 足够：

1. `UNIQUE(execution_id)` 保证 E1 只能 accept D1；
2. `UNIQUE(idempotency_key)` 保证同一个 caller intent 收敛；
3. `request_dispatch()` 的 check-and-insert race 由数据库 unique conflict 后 reload canonical row 收敛；
4. `claim_dispatch()` 用 row version/CAS 执行 `requested → starting`；
5. `mark_started()` 用 CAS 在一个 transaction 中写 canonical correlation、state 和 material Event；
6. ordinary redelivery 只在持久化 absence evidence 后执行，并用 row version/claim 防止多个 worker并发 delivery；
7. idempotent redelivery 即便网络层重复，也必须由 native contract 保证只产生一个 operation；Core 仍应减少并发噪声，但其正确性不依赖单进程锁。

不新增 DeliveryAttempt、lease aggregate 或 retry scheduler。退避与自动重试策略属于 Host/runtime policy；本 ADR 只定义一次调用是否安全。

## Current-code conflicts

### `services.py`

1. `request_dispatch()` 只按 caller idempotency key 预查，不拒绝同一 Execution 的第二个不同 key。
2. pre-check 与 insert 有 race；数据库冲突不会 reload canonical D1。
3. 没有 `claim_dispatch()`、`mark_started()` 或 `record_start_evidence()`。
4. 不设置 `Execution.dispatched_at`。
5. 不持久化 immutable submission digest。

### `repository.py` / migration 004

1. `core_dispatches.state` 当前只写 `requested`，没有 update/CAS API。
2. `provider_correlation_ref` 已存在但从未写入或读取。
3. `execution_id` 没有 UNIQUE constraint。
4. Dispatch row 没有 version/CAS 字段。
5. 缺少 request/submission digest 和最小 material evidence code/time。
6. `provider_correlation_ref` 单值对第一版足够，不需要一对多 schema。

### `registry.py` / Provider contract

1. `start(request: Any) -> Any` 不接收 D1/idempotency/submission digest envelope。
2. 没有 recovery correlation 或 idempotent redelivery capability contract。
3. start result 没有 `correlated/no_side_effect/indeterminate` disposition。
4. `observe()` 未规定必须基于 durable correlation。

### Codex Provider / CLI

1. CLI 持久化 `requested` 后直接调用 `provider.start()`，没有 starting claim。
2. `ManagedCodexProcess` 只是当前进程 handle，不是 Core durable start receipt。
3. PID 被 attach 为 RunRef，但没有证明其跨 Core restart 足以恢复同一 execution。
4. thread/session ID 从后续 JSONL 流发现；crash 在发现/入库前会丢失 correlation。
5. Codex `observe()` 明确无法仅凭 thread ID独立查询当前 invocation，因此当前 adapter 应声明 `recovery_correlation=unsupported`。
6. 没有 restart driver；不会从 requested/starting/started 做确定性恢复。

### Events and tests

1. `ExecutionDispatchRequested` 存在；缺少 Dispatch starting 与 durable-started material events/更新路径。
2. `ExecutionStarted` 不应被误用为 Dispatch durable-started；Execution active observation 是另一维度。
3. 当前测试只覆盖同 idempotency key 返回同 D1。
4. 缺少 one-dispatch-per-execution、same-key race、claim race、correlation crash window、weak Provider、no-side-effect proof、network timeout 和 native-idempotent redelivery tests。

## Required production changes

本 ADR 不实施这些变化。

| Priority | Change | Classification |
|---|---|---|
| P0 | 冻结 `requested → starting → started` 和严格 started contract | semantic clarification |
| P0 | `UNIQUE(core_dispatches.execution_id)` | schema constraint |
| P0 | Dispatch row 增加 version/CAS | field addition / repository change |
| P0 | request/accept D1 时持久化 immutable submission digest | field addition / service change |
| P0 | 增加 claim、evidence、mark-started、get-by-id repository methods | service/repository change |
| P0 | correlation + started + material event 原子持久化 | transaction invariant |
| P0 | Provider request 携带 D1/idempotency key/digest | provider contract change |
| P0 | Provider start result 使用三类 disposition DTO | provider contract change |
| P0 | restart driver 按 Dispatch state/evidence 决策 | runtime/service change |
| P1 | capability 增加 recovery correlation 与 idempotent redelivery 二值声明 | interface capability |
| P1 | 持久化最小 evidence code/time；不保存 transport telemetry | field addition |
| P1 | `request_dispatch()` unique race 后 reload canonical D1 | concurrency fix |
| P1 | 设置 `Execution.dispatched_at`，但不与 Dispatch.started 混淆 | service change |
| P1 | Codex 当前声明 recovery unsupported | provider descriptor change |
| P1 | 增加 Scenario A-H 契约测试和 crash/race tests | test addition |

## Alternatives rejected

### `provider.start()` 返回即标 started

response 可以只包含临时 process handle，且 Core 可能在 durable write 前 crash。返回成功不等于 restart 后可恢复。

### PID 或 SessionRef 存在即标 started

Provider-specific identity 可能复用、过期、不可查询或只描述上下文而不是本次 Dispatch。Core 不能从 Ref type 猜 recovery guarantee。

### 为弱 Provider 降低 started 门槛

这会让同一个 Core state 对不同 Provider 表示不同 guarantee，使 restart driver 无法安全决策。

### 禁止所有弱 Provider

不必要。弱 Provider 在线期间仍能提供真实 execution value；只需明确其 crash recovery limitation。

### Timeout 后直接再次调用 start

若第一次已创建 operation，会产生 duplicate side effect。只有 native-idempotent same-key contract 能让该动作安全。

### Unknown 后永远禁止任何 create-shaped call

过于严格。它错误排除了 EC2/Stripe 风格的 native-idempotent create，而这种 redelivery 本身就是可靠 reconciliation mechanism。

### 给 Dispatch 增加完整 execution lifecycle

Dispatch 只描述 submission/recovery guarantee。active、terminal、outcome 属于 Execution Projection；复制它们会制造两套相互冲突的状态机。

### 新增 DispatchAttempt / DeliveryAttempt

当前安全性只需要 D1、状态、digest、evidence、correlation 和 CAS。网络调用次数是 telemetry/operation detail，不值得成为领域 identity。

## Consequences

### Positive

- `started` 在所有 Provider 上有一致、可用于 restart 决策的 guarantee；
- response-lost 不会导致 duplicate native side effects；
- 强 Provider 可自动 reconcile，弱 Provider 仍可接入但不会伪装能力；
- native idempotency 能被利用，而不需要 retry engine；
- Dispatch 与 Projection、Execution retry 的责任边界清晰；
- 仍保持零 Provider-specific Core branching 和零新一级实体。

### Costs

- 弱 Provider 的 Dispatch 可能永久显示 starting，即使 Execution 已 terminal；UI/查询必须解释两个维度；
- Provider adapter 必须对 correlation、absence proof 和 idempotency scope 做真实契约测试；
- Core 需要持久化 submission digest 和少量 material evidence；
- idempotency token 有效期会限制自动 redelivery 窗口；
- crash 在 starting window 且无 recovery capability 时必须接受人工 unresolved handling。

## Non-goals

本 ADR 不定义：

- retry/backoff scheduler；
- queue、worker orchestration 或 lease runtime；
- Provider native job/resource lifecycle；
- Execution Projection lifecycle；
- Binding validation/approval；
- cancel semantics；
- telemetry、request log 或 delivery-attempt history；
- 人工 resolution UI/RBAC；
- exactly-once distributed transaction。

目标是阻止 duplicate side effect，并在真实能力允许时有效收敛；不是声称跨 Core 与 Provider 建立 exactly-once transaction。

## First-class entity delta

```text
0
```

只需要 DTO、capability、reason code、Dispatch 字段、Ref/Event 和 repository CAS method。

## Open questions

这些问题不改变语义边界：

1. Core 对 `recovery_correlation=durable` 要求的最低 retention horizon 是多少；
2. `submission_digest` 的 canonicalization 由通用 envelope 还是 Provider adapter 实现；
3. minimal evidence 字段采用 `evidence_code/evidence_at`，还是由 material Event 加当前 derived column 组合；
4. 人工 resolve/abandon starting-unresolved 的首版 CLI 形态；
5. canonical correlation 未来是否需要升级为 typed Ref；只有真实一对多需求出现后再决定。

## Decision outcome

**B. ACCEPT WITH IMPORTANT AMENDMENT**

冻结 amended semantics：

```text
Core defines guarantees.
Provider declares capabilities.
Each Dispatch supplies evidence.
Unknown is unsafe.
No blind duplicate side effects.
Same-D1 native-idempotent redelivery is reconciliation, not Execution retry.
```
