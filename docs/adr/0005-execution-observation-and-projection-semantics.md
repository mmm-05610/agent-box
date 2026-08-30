# ADR-0005：Execution Observation 与 Projection 单调语义

Status: Current — retained as an active architectural decision.

- 状态：Proposed — Accept with important amendment
- 日期：2026-08-23
- 依赖：[ADR-0001](./0001-execution-attempt-vs-session-continuity.md)、[ADR-0002](./0002-dispatch-submission-and-recovery-semantics.md)、[ADR-0003](./0003-dispatch-canonical-correlation-and-recovery.md)、[ADR-0004](./0004-execution-provider-capability-contract.md)
- 决策范围：Provider observation 如何更新 Execution 的 current projection、outcome、freshness、时间戳及同一 observation 携带的 material refs/facts
- 实现状态：Pending；本 ADR 不修改 production code

## Context

Execution 已被冻结为一次 single execution responsibility attempt。它一旦接受 terminal fact 就永久 terminal；Dispatch 与 canonical correlation 负责 native side effect 和 restart recovery 边界。

当前实现把 Provider 返回的 `ExecutionProjection` 近似当作可覆盖的 latest status：只要新的 `observed_at` 不早于当前值，就能替换 phase/outcome/freshness。这个规则存在四个结构性问题：

1. 较晚收到的旧 `active` observation 可以把已接受的 `terminal` 重新打开；
2. Provider 暂时不可访问时，`unknown` 会抹掉此前已接受的生命周期事实；
3. `observed_at` 混合了 source time、接收顺序和 freshness，却不能可靠证明 native causality；
4. Projection、Refs 与 facts 分事务写入，terminal state 可能在 output evidence 之前单独提交。

因此 Projection 不能定义为“Provider 最近返回了什么”，而必须定义为：

> Core 已接受的、单调的 Execution responsibility current view。

它仍然只是 current-state projection，不是 observation history、telemetry store 或 event-sourced aggregate。

## Decision

接受现有 `phase + outcome + freshness` 的最小结构，但作一项关键修正：

> Observation 不可用只更新 freshness，不清除已经接受的 lifecycle fact。

因此，曾经可靠观察为 `active` 的 Execution 在 Provider 暂时不可访问时表示为：

```text
phase = active
freshness = unreachable
```

而不是：

```text
phase = unknown
freshness = unreachable
```

这里的 `active + unreachable` 表示“最后一个被 Core 接受的 phase 是 active，但当前无法复验”，并不声称 native execution 此刻一定仍在运行。消费者必须联合解释 phase 与 freshness。

本 ADR 覆盖此前文档中任何“reachability loss 必须把 active 改成 unknown”的表述。

## Projection model

Production v0.1 的 lifecycle projection 保持：

```text
phase:
  active | terminal | unknown

outcome:
  succeeded | failed | cancelled | abandoned | null

freshness:
  observed | stale | unreachable

observed_at:
  Core 接受最近一次 material projection/freshness 变化的时间

last_native_sequence?:
  最近一次被接受的、Provider 保证单调且已规范化为整数的 native sequence
```

`last_native_sequence` 是可选字段，不要求所有 Provider 提供；它是 current projection 的 ordering guard，不是新实体或完整 observation history。

`resumable_now` 为兼容 v0.1 暂时保留，但不参与 phase、terminal、ordering 或 freshness 决策。按 ADR-0001，它描述 Session/native continuity 是否可作为新 Execution 的 continuation source，未来应迁移为 SessionRef/provider observation 的派生 capability。

以下组合在结构上都允许：

| Phase | observed | stale | unreachable | 含义摘要 |
|---|---:|---:|---:|---|
| active | ✓ | ✓ | ✓ | 最后接受为 active；freshness 表示当前可信度 |
| unknown | ✓ | ✓ | ✓ | 尚未接受可分类的 lifecycle fact，或 Provider 返回不可分类状态 |
| terminal | ✓ | ✓ | ✓ | terminal fact 已冻结；freshness 只表示当前能否复验 |

`terminal + stale/unreachable` 不降低已经接受的 outcome。

## Terminal monotonicity

冻结以下不变量：

1. 只有 authoritative observation 可以建立 terminal；
2. terminal observation 必须同时带有合法 outcome；
3. 一旦 authoritative terminal 被原子接受，`phase`、`outcome` 与 `ended_at` 永不改变；
4. 后续 active、unknown、provisional、unavailable 或较旧 observation 都不能重新打开 Execution；
5. 后续相同 terminal/outcome 是幂等 lifecycle observation；只有具备同一或更高 ordering evidence 时，才可补充与该 terminal snapshot 对齐的新 material refs/facts；
6. 后续不同 terminal outcome 是 conflict，不是 update。

“First authoritative terminal wins”只冻结 Core 已接受的责任结论，不表示 Provider 永远不会返回矛盾数据。矛盾必须显式暴露，而不是 last-write-wins。

## Unknown and freshness

`unknown` 表示：

> Core 尚未接受一个可可靠归类为 active 或 terminal 的 lifecycle fact。

它不表示 failed、cancelled、terminal、not-started 或 abandoned，也不作为暂时网络失败的默认覆盖值。

更新规则：

- 当前 `unknown`，收到 authoritative active：进入 `active`；
- 当前 `unknown`，收到 authoritative terminal/outcome：进入 `terminal`；
- 当前 `unknown`，Provider unavailable：保持 `unknown`，freshness 变为 `unreachable`；
- 当前 `active`，Provider unavailable：保持 `active`，freshness 变为 `unreachable`；
- 当前 `terminal`，Provider unavailable：保持 terminal/outcome，freshness 变为 `unreachable`。

## Outcome rules

持久化不变量：

```text
phase != terminal  => outcome = null
phase == terminal  => outcome in {succeeded, failed, cancelled, abandoned}
```

因此：

- `active + succeeded` 非法；
- `unknown + failed` 非法；
- `terminal + null` 不能作为过渡状态写入数据库；
- Provider 只返回 `completed`、却不能给出 outcome 时，Observation 被拒绝为 `OUTCOME_MISSING`，当前 Projection 保持不变；
- `abandoned` 是 Core/Host 的显式人工责任结论，不是普通 Provider-native outcome；Provider observation 不得自行产生 `abandoned`；
- 后来的不同 terminal outcome 不覆盖已经接受的 outcome。

人工 abandon 应通过显式 Core service operation 写入 terminal/abandoned 及 material event。它不声称 native execution 被取消，只表示 Core 已人工终止对该 attempt 的自动归责与恢复。

## Observation ordering

v0.1 采用“可选 ordering evidence + 保守 fallback”，不强迫所有 Provider 支持 sequence。

### 不采用单一 receive time

Core receive time只能说明到达顺序。延迟消息可能更晚到达，因此不能证明 native 顺序。

### source timestamp 只作审计

Provider-native `source_observed_at` 可以随 observation 传入并作为 material fact/audit data 保存，但不同机器的时钟偏差、缓存和不同 endpoint 使它不能单独作为 causality guard。

### 可选 native sequence

Provider adapter 可以提供：

```text
native_sequence: int | null
```

它必须在本 canonical correlation 的 observation stream 内单调，并由 adapter 规范化。Core 不解析 Kubernetes `resourceVersion`、ETag、job update token 或其他 Provider-specific 字符串；无法保证可比较时就不提供 sequence。

排序规则：

1. 当前和 incoming 都有 sequence，incoming 较小：整个 observation bundle 为 `stale_ignored`；
2. sequence 相同且语义相同：幂等，不制造 version/event；
3. sequence 相同但 lifecycle/outcome 不同：`conflict`；
4. incoming sequence 较大：仍须经过 terminal、authority 与 outcome guards；
5. 当前有 sequence、incoming 没有：incoming 不得覆盖 ordered lifecycle 或附带的 scoped refs/facts；unavailable disposition 仍可降低 freshness；
6. 双方缺少可比较 evidence：禁止 timestamp last-write-wins，应用保守生命周期规则。

无 sequence 时的保守规则：

- terminal guard 永远优先；
- authoritative terminal 可以把 unknown/active 收敛到 terminal；
- authoritative active 可以把 unknown 收敛到 active；
- active 不能覆盖 terminal；
- unavailable 只更新 freshness；
- `stale` 本身不是 ordering proof，不能用来覆盖更强的 observed view。

这允许弱 Provider 工作，同时防止旧 observation 把新责任事实覆盖。

## Authority / trust

Core 只需要最小、封闭的 trust classification，不建立 Evidence ontology。

建议使用两个 typed DTO variant：

```python
@dataclass(frozen=True)
class ObservedExecutionState:
    phase: Phase
    outcome: Outcome | None
    authority: ObservationAuthority  # authoritative | provisional
    freshness: Freshness              # observed | stale
    native_sequence: int | None = None
    source_observed_at: datetime | None = None
    native_refs: tuple[Ref, ...] = ()
    output_refs: tuple[Ref, ...] = ()
    material_facts: tuple[ExecutionResourceFact, ...] = ()


@dataclass(frozen=True)
class ObservationUnavailable:
    freshness: Freshness              # stale | unreachable
    reason: ObservationReason
```

规则：

- `authoritative`：Provider adapter 对该 normalized lifecycle fact 作 contract-level assertion，可建立 active 或 terminal；
- `provisional`：只是一份提示性/cached/stream-derived view，不能建立 terminal/outcome，也不能覆盖更强的已接受 lifecycle；
- `unavailable`：没有 phase/outcome/refs/facts，只更新 freshness。

method 存在、stream EOF、PID 不可见或 request timeout 本身都不是 authoritative terminal evidence。Adapter 必须根据其 native contract 分类。

`ObservationReason` 只需要封闭的粗粒度 reason code，例如：

```text
provider_unavailable
correlation_not_found
retention_expired
permission_denied
malformed_correlation
unclassified_native_state
outcome_missing
```

reason 存入 apply result/material event；v0.1 不必把它加入 current Projection row。若未来 UI 明确需要展示“当前为什么 unreachable”，可作为字段补充，而不是新实体。

## Ref and fact application

Projection 是 current normalized view；material refs/facts 是已接受的历史事实。两者必须保持区别：

- materialize：稳定 native Ref、output Artifact/Workspace Ref、actual consumption/output fact、首次 start fact、authoritative terminal fact；
- 不 materialize：raw poll payload、heartbeat、日志行、stream chunk、timeout stack、重复无变化 observation。

Observation 中的 refs/facts 默认与该 observation snapshot 同一 evidence scope。因此：

- stale、rejected 或 conflicting observation 的 scoped refs/facts 全部忽略；
- terminal/A2 已接受后，延迟的 active/A1 不能附加 A1 为 terminal output；
- 若晚到的 Ref/fact 具有独立的 authoritative provenance，而不依赖那个 stale lifecycle snapshot，Provider/Host 应通过独立 material-fact/ref command 提交，不得把它夹带在 stale observation 中。

此规则不需要 Observation 实体或 observation history association。

## Transaction boundary

一次 accepted observation 中的以下内容必须在同一数据库事务内提交：

1. CAS 检查当前 Execution version；
2. Projection、timestamps 与可选 `last_native_sequence` 更新；
3. 同一 evidence bundle 的 material refs/facts；
4. 一个 material Event；
5. Execution version 增量。

terminal/succeeded 与同次产生的 ArtifactRef A1 不允许部分提交。

v0.1 不做 partial apply。推荐结果 DTO：

```text
ObservationApplyResult:
  applied
  stale_ignored
  conflict
  rejected
```

它只是 service result，不是一级实体。重复提交通过 normalized observation fingerprint/native sequence、现有 Ref/fact 唯一约束和 EventLedger idempotency key 收敛，不要求保存 raw observation。

### apply_observation 伪代码

```python
def apply_observation(execution_id, observation):
    with repository.transaction():
        current = repository.get_execution_for_update(execution_id)

        if observation is unavailable:
            next_projection = replace(
                current.projection,
                freshness=observation.freshness,
                observed_at=core_now(),
            )
            return persist_if_material_change(current, next_projection)

        validate_dto_shape(observation)
        ordering = compare_optional_sequence(current, observation)

        if ordering is older:
            return STALE_IGNORED
        if ordering is same_but_conflicting:
            append_idempotent_conflict_event()
            return CONFLICT

        if current.phase is terminal:
            if observation.phase is terminal and observation.outcome != current.outcome:
                append_idempotent_conflict_event()
                return CONFLICT
            if observation.phase is not terminal:
                # active/unknown cannot reopen terminal; no scoped refs/facts.
                return apply_freshness_only_if_material(current, observation)
            if observation.authority is authoritative and ordering is same_or_newer:
                # Lifecycle/outcome remain frozen; accept only idempotent/new
                # refs/facts proven to belong to this terminal snapshot.
                return apply_terminal_evidence_atomically(current, observation)
            return apply_freshness_only_if_material(current, observation)

        if observation.phase is terminal:
            require observation.authority is authoritative
            require observation.outcome is not None

        if observation.authority is provisional:
            return apply_freshness_only_if_material(current, observation)

        next_execution = monotonic_transition(current, observation)
        persist_projection_refs_facts_and_event_with_cas(next_execution, observation)
        return APPLIED
```

在 CAS 冲突时，service 重新读取 current 并重新执行判定；不能仅重放原 UPDATE。

## Provider unavailable behavior

`ProviderUnavailable`、permission denied、retention expired、malformed correlation 和 correlation not found 都不能单独推导 Execution outcome。

| 已接受 Projection | unavailable 后 |
|---|---|
| unknown / null | unknown / null / unreachable |
| active / null | active / null / unreachable |
| terminal / succeeded | terminal / succeeded / unreachable |

差异通过 bounded reason code 保留。即使 Provider 声称 native object 已被删除，只要它不能 authoritative 地映射为 cancelled/failed，Core 就保持最后一个 lifecycle fact，不猜 terminal。

Provider 恢复可访问后，新 authoritative observation 可以把 unknown/active 收敛到 active/terminal；不能重新打开 terminal。

## Terminal conflict behavior

当已经接受：

```text
terminal / succeeded
```

后来又收到：

```text
terminal / failed
```

Core 必须：

1. 保留第一次 authoritative terminal/outcome；
2. 不接受 conflicting observation 的 refs/facts；
3. 写入幂等的 material conflict event；
4. 返回 `ObservationApplyResult.conflict`；
5. 暴露给人工/运维处理，但不在 Core 中建立 conflict workflow。

禁止 last-write-wins，也不把冲突交给 `if provider == ...` 分支。Provider adapter 可在进入 Core 前消解 native endpoint 的暂时差异；一旦向 Core 提交 authoritative terminal，就承担稳定语义。

## Timestamp semantics

| 字段 | 语义 | 更新规则 |
|---|---|---|
| `created_at` | Core 创建 Execution 的时间 | write once |
| `dispatched_at` | Core 接受该 Execution 唯一 Dispatch 的时间 | write once |
| `started_at` | Core 第一次接受 authoritative active fact 的时间 | write once；terminal-first 时可为 null |
| `observed_at` | Core 接受最近一次 material projection/freshness 变化的时间 | material change 时更新；不是 last poll time |
| `ended_at` | Core 接受 authoritative terminal/outcome 的时间 | write once |

Provider reported native start/end/source time 不覆盖这些 Core timestamps；需要审计时作为 typed material fact 保存。

`last_observation_attempt_at` 不进入 v0.1 domain/schema。它属于 operational metrics/telemetry；必要时由日志或外部监控提供。

Freshness 是显式 accepted state，不由后台 scheduler 定时改写。UI/read model 可以基于 `observed_at` 派生“已多久未验证”，但这个展示计算不制造 domain mutation。

## Weak Provider behavior

ADR-0004 capability contract无需修改。

弱 Provider 即使：

```text
correlation = unsupported
start_recovery = unsupported
redelivery = unsupported
```

仍可在 Core 在线期间提交 authoritative/provisional observation：

- Codex `turn.started` 或受控进程存活检查可建立 active；
- Codex `turn.completed` / `turn.failed` 的结构化 native event 可由 adapter 声明为 authoritative terminal；
- stream EOF、进程句柄丢失或 parser 未见 terminal event 只能产生 unavailable/provisional，不能猜 terminal。

一旦 terminal 被接受并持久化，Core restart 后保持 terminal。若 crash 前只接受到 active，restart 后又无法恢复 native truth，则保持 `active + unreachable`；这清楚表达“最后可信状态”和“当前不可验证”两个维度。

## Mature-system sanity check

该 decomposition 与成熟系统的有限对照一致：

- Kubernetes 用 `resourceVersion` 支持一致读取/watch，并显式暴露缓存陈旧与版本过期；这说明 native ordering token 应在可用时使用，但通用 Core 不应猜测 Provider token 的比较语义；
- GitHub Actions job API 分离 job identity、status、conclusion、started/completed timestamps；
- AWS Batch 通过 durable job ID 轮询一组有序生命周期状态；
- systemd 将 active state、result 与进程/时间信息分开暴露，说明“当前状态、终止结果、native evidence”不是一个可随意覆盖的字符串。

这些系统并不证明 Agent-Box 的具体枚举唯一正确，但支持三项共同原则：terminal 结论应单调、native ordering evidence 应在可用时使用、暂时观察失败不能被当作业务 outcome。

参考：

- [Kubernetes API Concepts](https://kubernetes.io/docs/reference/using-api/api-concepts/)
- [GitHub REST API — Workflow Jobs](https://docs.github.com/en/rest/actions/workflow-jobs)
- [AWS Batch — DescribeJobs](https://docs.aws.amazon.com/batch/latest/APIReference/API_DescribeJobs.html)
- [systemd D-Bus API](https://wiki.freedesktop.org/www/Software/systemd/dbus/)

## Current code conflicts

### `projection.py`

- 已正确拒绝 `terminal + null` 和 nonterminal outcome；
- docstring “Current provider observation”容易被理解为 latest status，应改为 Core accepted monotonic view；
- 缺少 optional `last_native_sequence`；
- `resumable_now` 仍混在 Execution lifecycle projection 中，但本轮只澄清，不强行迁移。

### `services.py`

- `observe_projection()` 只比较 `observed_at`，无法识别延迟但后到的旧 observation；
- 没有 terminal irreversible guard，当前可以 terminal → active/unknown；
- terminal → active 时保留旧 `ended_at`，会产生 active + ended_at 的内部矛盾；
- 没有 authority/provisional/unavailable distinction；
- `apply_observation()` 先更新 Projection，再分别 attach refs，存在 crash partial commit；
- `apply_observation()` 读取的 `current` 未使用；
- CAS 只保护 Projection 单次 UPDATE，不保护整个 observation bundle；
- `resume_execution()` 与 ADR-0001 冲突，但该问题属于已冻结的 Execution identity production change，不由本 ADR重新裁决。

### `repository.py`

- `update_projection()` 的单行 CAS 正确，但 repository 缺少“projection + refs/facts + event”原子方法；
- `attach_ref()` 每个 Ref 单独事务，无法与 terminal observation 共命运；
- schema 没有 optional native sequence；
- EventLedger 可继续使用，无需 replay 或新 observation 表。

### Codex provider/parser

- parser 直接构造完整 `ExecutionProjection`，没有 typed authority、unavailable disposition 或 ordering evidence；
- `turn.completed` / `turn.failed` 可以作为 authoritative terminal；
- malformed stream、empty output、非零 process return 当前映射为 `unknown/unreachable`，应改为 unavailable/provisional，不覆盖已接受 phase；
- Codex 的 weak recovery capability 不妨碍在线 observation。

### CLI / registry

- CLI 当前直接应用 Provider 返回的 Projection，应改为提交 typed observation 并处理 apply result；
- registry 不需要新增 capability；authority classification 是每次 observation 的 evidence，不是 Provider static capability。

### Tests

当前测试覆盖 DTO 结构约束、按 `observed_at` 忽略较早 observation、重复 semantic poll 和 Codex parser 基本结果，但缺少：

- terminal → active/unknown 拒绝；
- active/terminal 遇到 unavailable 时保留 lifecycle；
- conflicting terminal outcome；
- optional sequence ordering；
- authority/provisional terminal 拒绝；
- terminal + refs/facts 原子 rollback；
- CAS race 后重新判定；
- stale observation 不附加 refs/facts。

## Required production changes

按优先级：

1. **Invariant guard**：在 service 层实现 terminal irreversible、outcome compatibility、first-authoritative-terminal-wins；
2. **Service contract**：用 sealed typed Observation DTO 取代 Provider 直接提交 `ExecutionProjection`；返回 typed `ObservationApplyResult`；
3. **Repository transaction**：增加一个原子 apply method，在同一事务内更新 Projection、timestamps、refs/facts、Event 与 version；
4. **Ordering field**：给 current Execution projection 增加 nullable `last_native_sequence INTEGER`；不新增表；
5. **Timestamp clarification**：让 `observed_at` 由 Core 在 material accept 时写入，Provider source time不再传入该字段；
6. **Provider adapters**：Codex adapter 标注 authoritative/provisional/unavailable；不要把 EOF/timeout当 terminal；
7. **Conflict event**：增加 bounded EventType/reason code，并用 sequence 或 normalized fingerprint 生成幂等 key；
8. **CLI behavior**：显示 apply result；unavailable 时显示 last-known phase + freshness，不显示伪造 outcome；
9. **Tests**：补齐上述 invariant、atomicity、ordering、conflict、weak-provider 与 concurrency cases；
10. **Compatibility cleanup**：后续按 ADR-0001 移除 same-Execution resume，并最终迁移 `resumable_now`，不作为本 ADR前置条件。

## Alternatives rejected

### Latest-observation-wins

拒绝。到达较晚不等于 native 更新，且会重新打开 terminal。

### Provider timestamp last-write-wins

拒绝。时钟偏差、缓存与多个 endpoint 不能提供通用 causality。

### Provider unreachable 时总是 phase=unknown

拒绝。它把 reachability quality 与已接受 lifecycle fact 混为一谈，并让 current view非单调。

### 所有 Provider 必须提供 sequence

拒绝。弱 CLI/stream Provider仍应合法；terminal guard 和保守 fallback 已能提供最小安全性。

### 保存完整 observation history/evidence graph

拒绝。Work Core 只需 current projection、material facts 与少量 material events，不需要 telemetry/event sourcing。

### 接受 stale lifecycle，但单独保留它的 refs/facts

拒绝。没有 observation association 时会污染 Ref graph；独立可靠事实应走独立 material command。

## Consequences

### Positive

- terminal responsibility 永不被晚到或不可用 observation 重新打开；
- phase 与 freshness 真正正交，既保留最后可信事实，又诚实表达当前不可验证；
- 有 sequence 的 Provider获得严格 stale guard，弱 Provider仍能接入；
- terminal/outcome/output evidence 原子提交，审计不会出现半套事实；
- Provider-specific token 与 native state 仍留在 adapter 边界；
- 不新增一级领域实体、数据库表、workflow 或 telemetry 系统。

### Costs

- Provider adapter 必须对 authoritative/provisional/unavailable 作明确判断；
- schema 需要一个 nullable ordering 字段；
- repository 需要更大的 transaction method；
- `active + unreachable` 需要 UI/调用者联合解释 phase 与 freshness；
- 不支持 sequence 的 Provider遇到无序冲突时会保守拒绝，部分信息可能只能通过独立 fact path补录。

## Non-goals

本 ADR 不设计：

- observation history 或 replay；
- logs、metrics、heartbeat store；
- workflow/scheduler/retry；
- Provider-native status taxonomy；
- 通用 evidence graph；
- Session aggregate 或 resume lifecycle；
- 冲突自动解决 workflow；
- freshness aging daemon。

## First-class entity delta

```text
NEW FIRST-CLASS ENTITY COUNT = 0
NEW DATABASE TABLE COUNT = 0
```

新增内容仅为：

- typed DTO variants；
- 两个小 enum（authority、apply result）及 bounded reason code；
- nullable current-state ordering field；
- repository transaction method；
- material conflict EventType。

## Open questions

只保留两个非冻结问题：

1. `resumable_now` 的迁移时点：本 ADR 保留兼容字段，但 ADR-0001 已决定其长期应成为 SessionRef/provider derived capability；
2. 当前 UI 是否必须持久展示最新 unreachable reason；若没有明确产品需求，reason 只保留在 material event/apply result，不增加 Projection 字段。

以下不再开放：terminal 可逆性、unavailable 覆盖 phase、outcome LWW、refs/facts 分事务，以及是否新增 Observation entity。

## Decision outcome

**B. ACCEPT WITH IMPORTANT AMENDMENT**

当前 Projection 的三个主要枚举可以保留，但必须修正“unknown = reachability loss”的混淆，并补充：

- terminal monotonicity；
- optional native ordering evidence；
- per-observation authority；
- Projection/refs/facts/Event 原子应用。

在这些语义冻结后，模型仍保持很小，且没有引入新的一级对象。完成 Required production changes 和针对性测试后，ADR 可从 Proposed 升为 Accepted。
