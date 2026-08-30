# ADR-0003：Dispatch Canonical Correlation 与 Restart Recovery

Status: Current — retained as an active architectural decision.

- 状态：Accepted — Semantic Frozen（with amendment）
- 日期：2026-08-23
- 依赖：[ADR-0001](./0001-execution-attempt-vs-session-continuity.md)、[ADR-0002](./0002-dispatch-submission-and-recovery-semantics.md)
- 决策范围：Production Minimal Work Core 的 canonical correlation Ref、Provider recovery contract 与 restart driver
- 实现状态：Pending；本 ADR 不修改 production code

## Context

前置 ADR 已确定：

```text
Execution = single execution responsibility attempt
one Execution = at most one accepted Dispatch
Dispatch = requested → starting → started
started = durable recovery guarantee
unknown = unsafe
same-D1 native-idempotent redelivery may reconcile an ambiguous submission
```

`started` 只有在 Core restart 后仍能定位并 observe/reconcile 同一次 native execution 时成立。Core 因此需要持久化一个 recovery entry point，但不应理解 CI job、deployment operation、Codex invocation 或 local process 的 native schema。

本 ADR 只裁决四件事：

1. canonical recovery locator 是否可以保持单值；
2. 是否可以复用现有 `Ref` value；
3. 已有 correlation 与尚未获得 correlation 的 recovery API 如何分开；
4. 哪些 starting 不确定性必须接受，而不是用新领域对象掩盖。

## Decision

采用以下模型：

```text
Execution E1
  → Dispatch D1
    → provider_id
    → exactly zero-or-one canonical correlation Ref C1
      → Provider.observe(C1)
      → normalized observation
      → Core updates E1 Projection
```

canonical correlation 的原则是：

> Correlation is a locator, not the recovery algorithm.

Core 保存恢复入口；Provider 生成、验证、解释并使用这个入口。

### Important amendment

ADR-0002 曾允许：

```text
started => correlation exists OR is deterministically reconstructible
```

这会使数据库中的 `started + correlation_ref=NULL` 合法，并迫使 restart driver 在一个宣称已 durable-started 的 row 上再次猜测 Provider 机制。它也与“correlation 与 started 同事务”冲突。

最终规则收紧为：

```text
Dispatch.state = started
IFF
one canonical correlation Ref is durably persisted
```

deterministic reconstruction 只属于 `starting` recovery path：Provider 可以根据 D1 重建 C1，但 Core 必须先物化并原子持久化 C1，随后才能把 D1 改为 `started`。

## Canonical correlation Ref

canonical correlation Ref 是：

> 在目标 recovery horizon 内，ExecutionProvider 能用来重新定位并 observe/reconcile 本次 D1 所对应的同一个 native execution 的唯一 Core recovery locator。

它不是：

- 所有 native refs 的集合；
- native execution payload/state snapshot；
- SessionRef、RunRef、ArtifactRef 的替代；
- Provider credentials 或 bearer token；
- recovery algorithm；
- telemetry、PID list、log bundle 或 fallback locator set。

### Ref suitability contract

现有 `Ref` value 足够，不增加 identity semantic。Provider 返回的 C1 必须满足：

1. `C1.provider == E1.provider_id`；
2. `C1.native_id` 是 Provider namespace 内的稳定 canonical identity；
3. compound native identity 必须编码进 opaque `native_id`，而不是要求 Core解释字段；
4. `uri` 只是可选 locator/hint，不改变 `type + provider + native_id` 的 identity；
5. C1 明确关联 D1 和其 `submission_digest`；
6. C1 在目标 recovery horizon 内可跨 Core process restart 解释；
7. `Provider.observe(C1)` 不会创建第二个 native operation；
8. C1 不包含 bearer secret、session credential 或只能由原进程解释的 handle。

Core 只检查通用结构、Provider namespace、Dispatch state 和 evidence association。它不根据 `Ref.type`、native ID 格式或 Provider 名称推断 durability。

### Ref type

第一版不增加 `OperationRef`。

- remote job/process/invocation 通常可以使用 `RunRef`；
- 已有 durable workflow instance 可以使用 `WorkflowInstanceRef`；
- `SessionRef` 只有在 Provider 证明它唯一指向本次 D1，而不是共享 context continuity 时才可能合格；
- `WorkspaceRef`、`ArtifactRef` 等不会仅因为是 Ref 就自动合格。

Ref type 是外部对象分类，不是 recovery capability。最终资格由 Provider contract 和本次 Dispatch evidence 决定。

## Single-locator rule

一个 Dispatch 第一版最多保存一个 canonical correlation Ref。

### 为什么单值足够

真实 Provider 常见 recovery surface 都可以表示为单一入口：

| Provider shape | Canonical locator example |
|---|---|
| CI/job API | provider-owned `RunRef(repo/run-or-job-id)` |
| cloud async operation | `RunRef(operation-name-or-request-token)` |
| deployment system | `RunRef(account/region/operation-id)` |
| Kubernetes-like job | `RunRef(cluster/namespace/name/uid)` |
| supervised local process | `RunRef(host/boot/unit/invocation-id)` |
| provider-owned marker | `RunRef(marker-key-or-marker-uri)` |

多个 native fields 不等于多个 Core locator。Provider 可以：

- 把 account/region/project/job ID canonicalize 为一个 opaque `native_id`；
- 使用一个 provider-owned URI；
- 让 C1 指向 Provider 自己的 durable marker，该 marker 内部保存多个 backend identifiers；
- 用 C1 查询 Provider 后，再由 Provider 内部选择 fallback locator。

Core 不解析这些组合。

### 尚无一对多证据

本轮未找到必须让 Core 同时持久化多个彼此独立 locator 才能恢复同一 operation 的真实 Provider。若 Provider 需要两个字段共同寻址，它们仍构成一个 compound locator；若 Provider 需要多个 fallback，它们属于 Provider recovery algorithm。

因此第一版不增加 correlation refs table、LocatorSet 或一对多 schema。

如果未来要推翻本规则，必须由至少两个真实 Provider 证明：

1. 无法编码为一个稳定 compound locator；
2. 无法由一个 provider-owned marker 间接解析；
3. 多 locator 必须被 Core 而非 Provider 同时理解。

## Provider ownership

Core 与 Provider 的职责严格分离。

### Core owns

- D1 identity、idempotency key、submission digest 和 state；
- C1 的完整 Ref value 持久化；
- `started ⇔ C1 persisted` invariant；
- Provider routing：使用 E1 的 `provider_id`；
- CAS、transaction、material Event 和 restart decision table；
- normalized Execution Projection 的持久化。

### Provider owns

- 哪个 native object/marker 可以作为 C1；
- compound native identity 的编码与解析；
- credentials、endpoint、tenant/region 等 native access configuration；
- C1 的 durability 和 recovery-horizon guarantee；
- `start()` 如何生成 C1；
- `recover_start()` 如何通过 client token、marker、lookup 或 idempotent redelivery 找回 C1；
- `observe(C1)` 如何产生 normalized observation。

Core 禁止：

```text
if ref.type == PID
if provider == codex
if provider == ci
if native_id looks like a job id
```

如果 ExecutionProvider 委托另一个 backend，canonical Ref 仍使用 adapter 的 Provider namespace。adapter 在内部把 C1 解析到 backend identifiers；其他 backend-native refs 可以正常附加到 Execution graph。

## Recovery API decision

选择候选 A：

```text
observe(correlation_ref)
+
recover_start(dispatch recovery envelope)
```

### `observe(C1)`

用于已经 `started` 的 D1：

- 必须是 lookup/observe existing native execution；
- 不得产生 create side effect；
- 返回 provider-neutral normalized observation；
- 不承担“找不到 C1 时重新 start”的隐含行为。

### `recover_start(envelope)`

用于 `starting + correlation_ref=NULL`：

```text
DispatchRecoveryEnvelope
  dispatch_id
  execution_id
  provider_id
  idempotency_key
  submission_digest
  reconstructible accepted input/launch basis, if available
```

返回与 start result 相同的最小 disposition DTO：

```text
correlated(C1)
no_side_effect(evidence_code)
indeterminate(evidence_code?)
```

Provider 可以在内部：

- lookup by client token/D1；
- 查询 provider-owned marker；
- 读取 durable submission record；
- 在 native guarantee 有效时做 same-D1 idempotent redelivery；
- 或承认 indeterminate。

`submission_digest` 只能证明重建请求没有漂移，不能自行重建 Provider payload。若 exact launch request 既不能由 accepted Binding/config 重建，也没有 Provider-owned durable copy/marker，则 idempotent redelivery 不可用，必须返回 indeterminate。Core 不为此新增通用 Provider payload store。

### 为什么不选统一 `reconcile(dispatch_id, correlation_ref?)`

统一 optional-correlation operation 混合了两个不同安全边界：

- known C1：只允许 observe existing operation；
- missing C1：可能需要 lookup、absence proof 或 native-idempotent create-shaped call。

分成 `observe` 与 `recover_start` 可以让 Core 明确何时允许具有 submission 语义的 recovery，而不需要理解 Provider schema。

### 为什么不选 Provider-specific hooks

如果没有统一 `recover_start` disposition，restart driver 必须按 Provider 分支，或无法区分 correlated/no-side-effect/indeterminate。统一的是安全结果，不是 native algorithm。

`recover_start` 是 optional capability；弱 Provider可以声明 unsupported。

## Started recovery path

正常强 Provider：

```text
D1 requested
→ Core CAS claim
→ D1 starting committed
→ provider.start(DispatchStartEnvelope)
→ correlated(C1)
→ Core validates Ref/provider/evidence/digest
→ one transaction:
     UPDATE D1 starting → started
     SET provider_correlation_ref = serialize(C1)
     attach C1 to E1 as RefRelation.NATIVE (idempotent)
     append DispatchStarted material event
→ commit
```

transaction 必须满足：

```text
started AND C1
or
starting AND NULL
```

不允许部分提交。

如果 commit 前 crash，start result 中的 C1 只存在于内存，数据库仍是 `starting + NULL`；restart 进入 `recover_start` path。

## Starting recovery path

危险窗口：

```text
D1 = starting
C1 = NULL
native execution may or may not exist
Core restarts
```

Core 自己不尝试解释 Provider native state。它：

1. 从 repository 读取 E1、D1、idempotency key、submission digest；
2. 用 E1.provider_id 从 registry 选择 Provider；
3. 调用 optional `recover_start(envelope)`；
4. 根据 disposition 执行统一 Core transition。

### `correlated(C1)`

Core 验证后原子持久化 C1 + `started` + NATIVE relation + Event，然后调用 `observe(C1)`。

### `no_side_effect`

Core 持久化 contract-defined absence evidence。只有 immutable submission basis 可重建且 ADR-0002 redelivery conditions 仍成立时，才允许 same-D1 delivery。

### `indeterminate`

保持：

```text
D1 = starting / unresolved
C1 = NULL
E1 = unknown, unless an irreversible terminal fact was already persisted
```

禁止 blind start、猜 outcome、自动创建 E2 或把 arbitrary Ref 提升为 correlation。

### 接受不可控窗口

若 Provider 没有 lookup、marker、idempotent create 或 absence proof，restart 后可能永久无法知道 native truth。这是外部 side-effect 与本地 transaction 之间的真实不确定窗口。

Core 不用 Recovery aggregate、额外状态机或事件重放消灭它。人工 abandon 表示 Core 终止追踪责任，不证明 native operation 被取消或不存在。

## Weak Provider

弱 CLI Provider：

```text
query API = none
durable run ID = none
provider marker = none
idempotent create = none
current process/stdout observation = available only while Core is online
```

正常在线：

```text
D1 = starting
E1 = active
eventually E1 = terminal if authoritative terminal evidence is persisted
```

Core crash：

- 若 E1 terminal 已持久化，terminal 根据 ADR-0001 保持不可逆；D1 可以历史性保持 starting；
- 若只存在当前 stream/process active observation且无法重新验证，E1 变为 unknown/unreachable；
- D1 保持 starting/unresolved；
- `recover_start` unsupported 或返回 indeterminate。

最终需要人工 resolve/abandon 是 Provider limitation，不是 Core defect。

## Strong Provider scenarios

### Remote job API

```text
start(D1) → job_id
C1 = RunRef(provider, canonical-job-id)
restart → observe(C1) → GET job → normalized Projection
```

job ID 若需要 repository/tenant/region scope，由 Provider 编码进 canonical native_id，Core 不拆字段。

### Provider-owned marker

Provider 可以在 side-effect boundary 附近建立以 D1 为 key 的 durable marker。

两种实现都符合 Core contract：

1. marker 本身可被 `observe(marker Ref)` 解析到 native execution，因此 marker Ref 就是 C1；
2. marker 只是 Provider 内部 recovery index，`recover_start(D1)` 用它重建真正的 RunRef C1。

Core 不知道也不关心 marker 的内部结构。只要最终 persisted C1 能被 `observe(C1)` 使用即可。

## Codex implications

当前 Codex `SessionRef(thread_id)` 表示长期 native/context continuity，而不是一次 Dispatch invocation identity。

```text
E1 → SessionRef S1
E2 → same SessionRef S1
```

因此 S1 不能同时作为 E1/D1 与 E2/D2 的 canonical correlation，否则 `observe(S1)` 无法确定要恢复哪次 submission、PID、stream 或 output responsibility。

当前 adapter 还有两个直接限制：

1. thread ID 由 JSONL `thread.started` 在启动后发现，correlation commit 前有 crash window；
2. `observe(thread_id)` 没有独立 query API，只能返回 unknown/unreachable，无法定位具体 invocation。

结论：当前 Codex SessionRef 继续作为 Execution `NATIVE`/continuity Ref，但不能作为 canonical Dispatch correlation。当前 Codex Provider 是 weak recovery Provider，D1 不能 durable-started。

未来若要满足 strong contract，Provider 可以提供一个 D1-keyed durable invocation marker/locator，例如：

```text
RunRef(codex-cli, provider-owned-dispatch-locator)
```

该 locator 内部可以关联 thread ID、native invocation/process marker 和 diagnostic state。Core 无需 Codex 特判，也不修改 SessionRef 语义。

## RunRef / PID implications

`RunRef` 是类型，不是 durability guarantee。

裸 PID 通常不能单独成为 C1，因为：

- PID 只在特定 host/PID namespace 内有意义；
- process exit 后 PID 可以被复用；
- host reboot 会破坏原 PID identity；
- container namespace 可能让同一数字指向不同 process；
- process exit 后 `/proc/PID` 不再提供长期 operation record；
- Core restart 后可能缺少原 process handle/permissions。

PID 可以继续作为普通 RunRef/native observation aid。

若 local process Provider 使用 supervisor、systemd unit、container runtime 或 durable marker，canonical C1 应是包含 host/boot/unit/invocation identity 的 provider-owned locator。Provider 可以在内部使用 PID，但 Core 不把 PID existence 解释为 started。

## Restart decision table

| Durable Core state | Provider call | Core result |
|---|---|---|
| `requested` | first `start(envelope)` after CAS claim | D1 becomes starting before call |
| `starting + C1=NULL` | `recover_start(envelope)` | correlated / no-side-effect / indeterminate |
| `starting + recovered C1` in memory | none before validation | atomic persist C1 + mark started |
| `starting + no-side-effect` | same-D1 start only if ADR-0002 conditions hold | remain D1; no new Execution |
| `starting + native-idempotent redelivery` | Provider may redeliver inside `recover_start` | same operation or unique first creation |
| `starting + indeterminate` | none | unresolved; E1 unknown unless terminal persisted |
| `started + C1` | `observe(C1)` | reconcile same E1/D1 |
| terminal E1 | no new delivery | preserve E1/D1/C1 history |

`started + NULL` 和 persisted `starting + C1` 都是 invalid database states，不是 restart branches。

## Persistence invariants

1. `provider_correlation_ref` 只允许在 `state=started` 时非 NULL。
2. `state=started` 必须有一个已持久化 canonical Ref；不允许 deterministic reconstruction 例外。
3. C1 必须由本次 D1/submission digest 的 correlated evidence 产生。
4. C1 不得包含 bearer secret 或原进程内 handle。
5. C1 必须可跨 Core process restart解释，并满足 recovery horizon。
6. C1 不等于所有 native refs；其他 refs 继续属于 Execution relation graph。
7. canonical correlation 第一版严格单值。
8. `C1.provider` 必须等于 `E1.provider_id`；Core 不猜 native namespace。
9. C1、D1 started、Execution NATIVE relation 与 material Event 同事务。
10. transaction commit 前丢失 C1 时，持久状态必须仍是 `starting + NULL`。

建议数据库约束表达为：

```sql
CHECK (
  (state = 'started' AND provider_correlation_ref IS NOT NULL)
  OR
  (state IN ('requested', 'starting') AND provider_correlation_ref IS NULL)
)
```

Service 还必须 decode/validate Ref、Provider namespace 和 evidence association；SQL `NOT NULL` 不能替代 contract validation。

## Correlation Ref persistence

当前 `provider_correlation_ref TEXT` 的 cardinality 足够，但裸字符串语义不够。

第一版可以使用 versioned Ref serialization：

```json
{
  "v": 1,
  "type": "RunRef",
  "provider": "ci-provider",
  "native_id": "repo/run/123",
  "uri": "https://provider.example/runs/123",
  "metadata": {}
}
```

这是一个 Ref value 的序列化，不是新的 Correlation entity。必须复用与其他 Ref 相同的 validation/bounds。

不需要 FK 或独立 refs table，因为 `Ref` 是外部 identity value，不是 Core-owned aggregate。`provider_correlation_ref` 是 Dispatch 上 canonical role 的权威位置。

同一个 C1 应在 mark-started transaction 中以 `RefRelation.NATIVE` 幂等附加到 E1，使统一 Ref graph 可以查询它。NATIVE relation 不声明 canonical role；只有 D1 的单值字段声明。无需新增 `CORRELATION` relation。

## Mature-system sanity check

成熟系统普遍使用“单 canonical locator + service-owned interpretation”：

- Google long-running operation 返回单个 operation `name`，客户端使用 `operations.get(name)` 轮询同一异步工作。[Google Cloud long-running operations](https://docs.cloud.google.com/api-keys/docs/polling-operations)
- AWS Cloud Control 返回单个 `RequestToken`，之后用 `GetResourceRequestStatus(RequestToken)` 查询同一 resource operation；token/operation records 还有明确保留期限，支持 recovery horizon 必须被声明。[AWS Cloud Control getting started](https://docs.aws.amazon.com/cloudcontrolapi/latest/userguide/getting-started.html)、[Managing resource operation requests](https://docs.aws.amazon.com/cloudcontrolapi/latest/userguide/resource-operations-manage-requests.html)
- GitHub Actions 以唯一 job ID 提供 `GET .../actions/jobs/JOB_ID`，repository scope 和 job ID 可以由 adapter canonicalize 成一个 RunRef。[GitHub workflow jobs API](https://docs.github.com/en/rest/actions/workflow-jobs)
- Kubernetes object UID 用来区分同名对象的不同历史实例，证明 compound scope/identity 可以被 canonicalized，而不要求调用方保存 locator set。[Kubernetes object names and IDs](https://kubernetes.io/docs/concepts/overview/working-with-objects/names/)

Linux `/proc` 文档则显示 PID 目录随 process lifetime 存在，PID 在 process exit 后可被重新分配；这支持裸 PID 不是跨 restart/horizon 的充分 correlation。[Linux proc filesystem](https://www.kernel.org/doc/html/latest/filesystems/proc.html)

本轮没有发现必须在 Core 中保存多个 canonical recovery Ref 的反例。

## Current-code conflicts

### `models.py`

1. `Ref` value 已足够，但当前没有公共 versioned serialization codec。
2. `RefType` 没有 OperationRef；本 ADR 不要求增加，优先使用 Provider-owned RunRef/WorkflowInstanceRef。
3. Ref identity 已由 `type + provider + native_id` 表达；correlation 不能依赖 metadata 才可解释。

### `repository.py` / migration 004

1. `provider_correlation_ref` 是 nullable TEXT，但没有 Ref encode/decode、CHECK constraint 或读写 API。
2. Dispatch 没有 `get_by_id/list_for_recovery/claim/mark_started` repository methods。
3. 没有 correlation + state + NATIVE ref + Event 原子 transaction。
4. 当前 execution refs table 没有 ref ID；不需要为了 FK 改成 entity table。
5. Dispatch row 仍缺少 ADR-0002 要求的 submission digest/version/evidence fields。

### `registry.py`

1. `start(Any) -> Any` 不返回 correlation disposition DTO。
2. `observe(Any)` 没有限定输入必须是 canonical Ref，也没有 normalized result contract。
3. 缺少 optional `recover_start(DispatchRecoveryEnvelope)`。
4. capability 尚未声明 recovery correlation / start recovery / idempotent redelivery。

### Codex Provider / CLI

1. `ManagedCodexProcess` 和 PID 是当前进程 handle，不是 durable correlation receipt。
2. SessionRef 由 JSONL 延迟发现并可能跨多个 Execution 共享。
3. `observe(thread_id)` 无法独立定位具体 Dispatch invocation。
4. CLI 没有 starting claim、mark-started transaction 或 restart driver。
5. 当前 Codex adapter必须保持 weak Provider，不得把 SessionRef/PID 自动提升为 C1。

### Tests

缺少：

- Ref correlation codec round-trip/bounds；
- `started ⇔ correlation_ref` constraint；
- correlation/provider mismatch rejection；
- mark-started atomic rollback；
- same C1 NATIVE attachment idempotency；
- restart `recover_start` 三 disposition；
- SessionRef shared across E1/E2 correlation rejection；
- PID-only weak Provider；
- concurrent recover/mark-started CAS。

## Required production changes

本 ADR 不实施以下变化。

| Priority | Change | Classification |
|---|---|---|
| P0 | 冻结 `started ⇔ persisted canonical Ref`，移除 reconstructible-null 例外 | semantic amendment |
| P0 | `provider_correlation_ref` 使用 versioned Ref serialization | schema/codec clarification |
| P0 | 增加 state/correlation biconditional CHECK | schema constraint |
| P0 | 实现 atomic `mark_started(D1, C1, evidence)` | repository/service change |
| P0 | mark-started 同事务 attach E1 NATIVE Ref 和 material Event | transaction invariant |
| P0 | Provider start result 返回 correlated/no-side-effect/indeterminate DTO | provider contract change |
| P0 | 增加 optional `recover_start(envelope)` | provider contract change |
| P0 | restart driver 查询 requested/starting/started Dispatch | service/runtime change |
| P1 | 验证 `C1.provider == E1.provider_id`、digest association 和 Ref bounds | invariant guard |
| P1 | 增加 recovery capability declarations | provider capability |
| P1 | current Codex 明确声明 recovery unsupported | provider descriptor change |
| P1 | 增加 correlation/recovery/crash/concurrency contract tests | test addition |

## Alternatives rejected

### 多个 canonical correlations

没有真实证据。compound identity 可编码为一个 opaque native ID，fallback locators 和 marker lookup 属于 Provider algorithm。

### 新增 Correlation / RecoveryHandle entity

Ref 已表达 Provider 外部 identity；新增实体只会复制 type/provider/native_id/URI 和 lifecycle。

### `started + correlation_ref=NULL`，restart 时再确定性重建

这稀释 started guarantee，制造持久状态例外，并使每次 restart 都重新进入 Provider recovery algorithm。确定性重建应发生在 starting，然后物化 C1。

### 把 correlation 只放 Execution Ref graph

NATIVE relation 不能指出哪个 Ref 是本 Dispatch 的 canonical recovery locator。Dispatch 必须保存单值 canonical role；graph attachment用于查询。

### 给 Ref 增加 `durable=true`

durability 不是 Ref 的永久 identity 属性，而是 Provider capability、目标 recovery horizon 和本次 D1 evidence 的组合。给 Ref 加布尔字段会制造可漂移的全局声明。

### SessionRef 默认作为 correlation

Session continuity 可以跨多个 Execution，不能天然确定一次 Dispatch invocation。

### PID 默认作为 correlation

PID 存在不代表跨 host restart、namespace、reuse 和 process exit 的恢复能力。

### 统一 optional-correlation `reconcile()`

它把无副作用 observe 与可能执行 idempotent redelivery 的 start recovery 混为一个操作，弱化接口安全边界。

### Provider-specific recovery hooks

会让 Core restart driver出现 Provider branching，并失去统一 disposition。

## Consequences

### Positive

- Dispatch row 本身即可做确定性 restart routing；
- `started` 没有 nullable correlation 例外；
- Ref、Provider registry 和现有 relation graph得到复用；
- single locator 保持 schema 小，并隐藏 Provider compound identity；
- started/starting recovery API 的 side-effect边界清楚；
- Session continuity 与 Dispatch invocation correlation 不再混淆；
- 弱 Provider 的不确定性被如实保留；
- 新一级实体和新表均为 0。

### Costs

- Provider adapter 必须提供 canonicalization、codec round-trip 和 recovery contract tests；
- correlation token/marker 的 retention horizon 必须可声明和监控；
- Ref 会同时出现在 Dispatch canonical field 与 Execution NATIVE graph，必须同事务防止漂移；
- weak Provider 的 D1 可能永久 starting/unresolved；
- exact launch request 不可重建时，即使 native API支持 idempotency，也不能自动 redeliver。

## Non-goals

本 ADR 不定义：

- Provider native job/resource lifecycle；
- 多 locator fallback algorithm；
- credentials/secret storage；
- retry scheduler、queue、lease 或 workflow；
- observation polling cadence；
- cancellation；
- manual resolution UI/RBAC；
- telemetry/log storage；
- exactly-once distributed transaction；
- Session aggregate、Run aggregate 或 Recovery aggregate。

## First-class entity delta

```text
0
```

Schema new table count：

```text
0
```

只新增/澄清 Ref codec、DTO、Provider interface capability、reason code、repository method、constraint 和 derived disposition。

## Open questions

以下问题不改变本 ADR 的 identity boundary：

1. versioned Ref JSON 的精确 canonical encoding；
2. `recover_start` envelope 中哪些 accepted Binding/launch basis 由 application service重建；
3. Core 最低 recovery horizon 与 Provider token retention 的配置方式；
4. material Event 命名为 `DispatchStarted` 还是 `DispatchCorrelationEstablished`；
5. weak starting/unresolved 的人工 resolve CLI；
6. future real Provider 是否会提供推翻 single-locator rule 的证据。

## Decision outcome

**B. ACCEPT WITH IMPORTANT AMENDMENT — accepted and frozen**

可以冻结 amended model：

```text
one Dispatch → zero-or-one canonical Ref
started ⇔ canonical Ref durably persisted
starting recovery may reconstruct Ref, but must persist it before started
Provider owns generation, interpretation, recovery and observation
Core owns state, transaction, routing and normalized facts
unrecoverable starting uncertainty is allowed
```
