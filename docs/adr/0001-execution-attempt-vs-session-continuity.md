# ADR-0001：Execution Attempt 与 Session Continuity 分离

Status: Current — retained as an active architectural decision.

- 状态：Accepted — Semantic Frozen
- 日期：2026-08-23
- 决策范围：Production Minimal Work Core、Governed Binding、Execution Provider contract
- 实现状态：Pending；本 ADR 不修改 production code

## Context

Production Work Core v0.1 当前同时存在两种互相冲突的 Execution 解释：

1. `Execution` 拥有单组 `created_at/dispatched_at/started_at/ended_at`、单一 outcome 和 version，看起来是一次实际执行尝试；
2. `resume_execution()` 和 vertical slice 在 terminal Execution 上直接调用 Provider resume，并把后续 observation 写回同一个 Execution，看起来又把 Execution 当作可反复 active/terminal 的 native session continuity。

这两种解释无法同时稳定支持：

- terminal 不可逆；
- 一次 Execution 一个 dispatch；
- 一次 Execution 一个 frozen Binding；
- 单周期 timestamps；
- crash/restart reconciliation；
- requested/frozen 与 actual consumption 一一对应；
- 每次执行的 outcome、conformance 和 contribution responsibility。

真实 Codex 已证明 native thread/session identity 可以跨独立 CLI invocation 保留，而每次 invocation 有新的 PID、输入依据和 side-effect boundary。因此 Core 不需要让旧 Execution 重新 active；它只需要让新 Execution 引用同一个 SessionRef。

## Decision

### Execution

`Execution` 是一次具有独立输入依据、至多一个 accepted dispatch、独立 side-effect responsibility、actual facts、output、outcome 和 conformance 的实际执行尝试。

它的粒度由“一次 Core dispatch responsibility boundary”定义，不由单次 tool call、model token/turn、Provider poll 或内部 subprocess 定义。

### SessionRef

`SessionRef` 是 Provider-native/context continuity identity。它可以被多个 Execution 引用，但不拥有 Work progression、Binding、approval、outcome、completion 或 contribution 语义。

### Frozen boundary

Core 不定义“恢复旧 Execution”这一领域操作。`resume`、`continue`、`reconnect` 等词属于 Host 意图或 Provider-native 命令，不进入 Execution 状态机。

continuation 统一表达为：

```text
new Execution
+ SessionRef / other context Refs
+ new Binding and Dispatch
+ Provider-native continuation command
```

因此，Core 只记录新 Execution 使用了哪些上下文 Ref 以及本次执行的独立责任事实；Provider 负责把这些 Ref 翻译成自己的 `resume`、`continue` 或等价启动操作。

### Canonical example

```text
Work W1

Execution E1
  Binding B1
  Dispatch D1
  native SessionRef S1
  active
  terminal/succeeded
  outputs O1

用户随后继续同一 native context：

Execution E2
  Binding B2
  Dispatch D2
  input/continuation SessionRef S1
  active
  terminal
  outputs O2

E1 永远保持 terminal。
E2 是新 Execution，但复用 S1 的 native context。
```

## Formal invariants

### Invariant 1：Terminal irreversible

Execution 一旦进入 `phase=terminal`，永久保持 terminal。普通 observation、resume、retry、rerun 或用户 continue 均不得执行：

```text
terminal → active
terminal → unknown
```

terminal 后到达的冲突 native observation 应被记录为 reconciliation anomaly/evidence，不得静默改写 Execution responsibility history。

### Invariant 2：Resume creates a new Execution

resume native session 的含义是：

```text
创建新 Execution
+ 引用已有 SessionRef
+ 构造新 input basis/Binding
+ 创建新 dispatch
+ 调 Provider continuation operation
```

不是唤醒旧 Execution。

### Invariant 3：SessionRef may be shared

同一个 SessionRef 可以被多个 Execution 引用：

```text
E1 → S1
E2 → S1
E3 → S1
```

当前 `core_execution_refs` 的复合主键已经允许这种关系，不需要 Session aggregate。

首次发现 native session 时通常记录：

```text
E1 --NATIVE--> S1
```

后续 continuation 使用时应记录：

```text
E2 --INPUT--> S1
```

Provider observation 若再次确认同一个 native session，也可以附加 native relation；责任链以 E2 的 input relation/Binding provenance 为准。

### Invariant 4：At most one accepted dispatch

一个 Execution 最多接受一个 dispatch。相同 dispatch 的 API delivery retry、claim 或 reconciliation 必须用同一 dispatch ID/idempotency key 收敛。

新的 Provider side-effect attempt 必须创建新 Execution，不得在同一 Execution 下创建 D2。

### Invariant 5：At most one accepted frozen Binding

一个 Execution 最多接受一个 frozen Binding。Binding 一旦进入 dispatch responsibility boundary，该 Execution 的 input basis 永久固定。

dispatch 前可以存在多个未接受 revision；真正 accept/dispatch 的只有一个。dispatch 后输入变化要求：

```text
new Execution
+ new Binding
+ new dispatch
```

### Invariant 6：Outcome is attempt-local

Execution outcome 只描述该次 attempt：

```text
E1 failed    ≠ Session S1 unusable
E1 succeeded ≠ Work completed
E1 failed    ≠ Work failed
```

### Invariant 7：Session has no Work progression semantics

SessionRef 不拥有：

- Work lifecycle；
- current/next Execution；
- Binding 或 approval；
- outcome/conformance；
- completion；
- contribution graph。

它只是外部 context identity。

### Invariant 8：RunRef is not Execution identity

PID、process ID、CI native run/job ID 等以 RunRef/native Ref 表达。一个 Execution 可以关联一个或多个 Provider-native objects，但 Execution identity 由 Core 在 Provider start 前创建。

### Invariant 9：Timestamps are single-cycle

每个 Execution 的 timestamps 只表达一次责任周期：

```text
created_at
→ dispatched_at（最多一次）
→ started_at（最多一次）
→ ended_at（最多一次）
```

Execution 不需要表达多轮 active/terminal。Provider 内部多个 tool call、model turn、poll 或 subprocess 留在同一次 cycle 中。

### Invariant 10：Contribution responsibility uses Execution

Provenance/contribution 以 Execution 为责任节点：

```text
E1 produced commit B
E2 consumed commit B
```

即使 E1/E2 共享 Session S1，它们仍是两个独立 contribution steps。

## Resume semantics

### Preconditions

Host 收到“continue/resume”意图时：

1. 从先前 Execution 的 native/input refs 选择 SessionRef；
2. 向 Provider 查询或在 dispatch 时重新验证该 SessionRef 当前可作为 continuation source；
3. 创建新的 Execution；
4. 将 SessionRef 作为 continuation input 关联到新 Execution；
5. 为新 Execution resolve/freeze/validate Binding；
6. accept 新 Binding 与新 dispatch；
7. Provider 使用 native resume operation 启动新 Execution。

旧 Execution 的 phase、outcome、timestamps、Binding、facts 和 outputs 不再改变。

### Provider `resume` method

Provider 可以继续拥有 native `resume` operation，但它的语义改为：

> 使用已有 SessionRef 启动一个新的 Core Execution/dispatch。

它不是 `ExecutionService.resume_execution(old_execution_id, ...)` 对旧对象的状态转换。

规范性规则：Core API 不应暴露会让旧 Execution 重新 active 的 `resume_execution(old_execution_id)`。应用层可以提供名为 `resume` 的用户操作，但其结果必须是创建并 dispatch 一个新的 Execution。

### Cross-Work Session reuse

Core 数据模型允许同一 SessionRef 被不同 Work 的 Execution 引用，因为 Ref 是外部 identity，不拥有 Work。

Host 默认不得自动跨 Work carry session，原因包括：

- context/secret/data leakage；
- 错误 provenance 归属；
- 不同 Work 的 approval/input purpose 不同。

跨 Work reuse 只在显式选择、重新 Binding/validation、记录 source Work/Execution provenance 后允许。该规则属于 Host/admission policy，不新增 Session aggregate 或 ACL ontology。

## Restart semantics

### Restart/reconcile is not resume

Core crash 时，若原 Provider execution 可能仍在运行，目标是恢复同一个 Execution：

```text
E1
D1 starting/started
Core crash
Provider process still alive

restart
→ load E1 + D1
→ correlate/observe native process
→ reconcile E1/D1
```

不得创建 E2，因为没有发生新的用户/Host side-effect decision，也没有新的 input basis。

### Decision rule

```text
旧 Execution 尚未 terminal
+ 已有 accepted dispatch
+ 行为是恢复同一 dispatch/native side effect
→ reconcile same Execution

旧 Execution 已 terminal
+ 用户/Host 决定 continue/retry/rerun
→ create new Execution
```

若 D1 处于 `starting` 且是否已产生 native side effect 不明，E1 必须保持 unresolved/unknown 并优先 correlation/observe。不得通过创建 E2 逃避不确定性，否则可能重复 side effect。

## Dispatch impact

### One responsibility boundary

```text
Execution E1
→ accepted Dispatch D1
→ requested
→ starting
→ started
→ reconcile as needed
```

同一个 D1 可以因网络重试而被重复投递，但 Provider 必须以 dispatch ID/idempotency key 收敛到同一个 native start。

### Dispatch delivery failure

默认规则：不得为 E1 创建 D2。

若 D1 明确、可证明地在任何 native object/side effect 创建前失败，implementation 可以继续用同一个 D1/idempotency key 重试 delivery；这仍是同一 dispatch，不是新 attempt。

若 D1 已终结或 side-effect absence 无法证明，而用户要求再次尝试，则创建 E2/D2。

### Schema invariant

Production schema 必须保证：

```text
UNIQUE(core_dispatches.execution_id)
```

或以等价 CAS/accepted-dispatch column 保证同一不变量。

## Binding impact

该决策使 Governed Binding 成为严格一一责任关系：

```text
Execution E1
→ accepted frozen Binding B1
→ accepted Dispatch D1
→ actual input/output facts
→ outcome
→ conformance
```

terminal 后复用 Session S1 时：

```text
Execution E2
→ Binding B2
→ Dispatch D2
```

结果：

- frozen basis 永不漂移；
- requested/frozen 与 actual consumption 一一对应；
- conformance 不跨 attempt 混合；
- outputs 和 contribution responsibility 清晰；
- crash recovery 可围绕一个 dispatch 收敛；
- 不需要 Binding revision 在 dispatch 后改变旧 Execution。

Binding acceptance 与 DispatchRequested 必须在同一事务中完成。

## Projection impact

### Phase/outcome

保留：

```text
phase   = active | terminal | unknown
outcome = succeeded | failed | cancelled | abandoned
```

outcome 仅在 terminal 时存在。新增 invariant guard：terminal phase 不可离开，outcome/ended_at 不可被普通 observation 改写。

`unknown` 只用于尚未 terminal 的 observation uncertainty。已经 materialized terminal 的 Execution 不因 Provider 后续 unreachable 而改为 unknown。

### `resumable_now`

`resumable_now` 不再解释为：

> 当前 Execution 能否重新 active。

在 v0.1 兼容期，它解释为：

> 在该 Projection 的 `observed_at`，与此 Execution 关联的 native continuity 是否被 Provider 观察为可作为新 Execution 的 continuation source。

它只是 observation snapshot/advisory evidence，不能独立授权 resume。真正创建 E2 前必须重新验证 SessionRef。

长期看，该事实更自然属于 SessionRef 的 Provider observation/derived capability，而不是 Execution lifecycle Projection。迁移位置属于后续接口设计，不阻塞本 ADR 冻结；本轮不新增 Session aggregate。

## Granularity rules

### Same Execution

以下行为仍属于同一 Execution：

- 一次 Core dispatch 内的多个 Codex model turns；
- read/edit/test/edit/test 等内部 tool calls；
- Provider wrapper 与其 child processes；
- CI job 运行两小时期间的多次 poll/webhook；
- crash 后对同一 dispatch/native process 的 reconcile；
- 相同 dispatch ID 的幂等 delivery retry。

### New Execution

以下行为创建新 Execution：

- terminal 后 continue/resume；
- terminal failure 后 retry；
- CI rerun；
- Human reviewer 完成一次 review 后再次 review 新结果；
- input/Binding 改变后的再次执行；
- 新的 Provider side-effect attempt。

## Adversarial scenarios

### A. Simple resume — PASS

E1 terminal、S1 resumable，用户 continue：创建 E2，记录 S1 为 continuation input，E1 永久 terminal。无需新实体。

### B. Workspace changes before resume — PASS

E1 使用 commit A 并输出 B；repo/artifact/environment 后续变化。E2 必须重新 resolve/freeze/validate B2。若复用 E1/B1，会破坏 frozen basis、timestamps、actual facts 和 conformance 一一对应。

### C. Retry after failure — PASS

E1 failed 只描述第一次 attempt；S1 仍可作为 E2 continuation source。E2 拥有独立 outcome、dispatch 和 provenance。复用 E1 会覆写失败证据并使 idempotency 边界不清。

### D. Provider start crash — PASS, correlation required

D1 已 starting、Provider 可能已启动、Core crash：restart 必须 reconcile E1/D1，不能创建 E2。若 native truth 不明，保持 unknown/starting，禁止 blind redispatch。

### E. Internal multi-tool calls — PASS

一次 dispatch 内 read/edit/test 等都属于 E1。Execution 粒度不是 tool call 或单个 model turn。

### F. Long-running provider — PASS

同一 shell process/CI job 的多次 observation 不创建新 Execution；它们更新同一 E1，直至一次 terminal。

### G. Human execution — PASS

Human Review E1 完成后再次检查新结果形成 E2。若外部 review thread 可复用，则用 Ref 表达 continuity；模型不依赖 AI session。

### H. CI rerun — PASS

失败 CI attempt 的 rerun 形成 E2。即使外部 CI 保留 workflow run ID，新的 run-attempt identity 仍映射到新的 Core Execution responsibility。

### I. Same Session, different Work — CONDITIONAL

Core 允许；Host 默认禁止自动复用。显式选择、全量新 Binding/validation 和 provenance 后可允许。风险可由现有 Ref/relation/admission 表达，不新增 ontology。

## Mature-system sanity check

该 identity decomposition 是成熟系统中常见的共同语义，虽然名称不同。

### POSIX process vs session

POSIX 把 process 定义为具有独立 lifetime/PID 的执行实例，同时把 session 定义为可包含多个 process groups 的长期 job-control collection。一个 session 可以覆盖多个 process lifetimes，支持“执行实例”和“上下文容器”分离。[POSIX Definitions](https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap03.html)

### GitHub Actions run vs run attempt

GitHub workflow re-run 保留 `run_id`，但为每次重跑递增独立的 `run_attempt`；官方 context 明确区分稳定 workflow run identity 与每次 attempt。Agent-Box 不照搬其命名，而是把每个责任 attempt 映射为 Execution，把长期关联留给 Work/Ref。[GitHub contexts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts)、[Re-running workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)

### Temporal long identity vs new execution/attempt

Temporal 的 retry 会创建新的 Activity Task Execution；Continue-as-New 会完成当前 Workflow execution，再用相同 Workflow ID 启动新的 execution。这验证了 crash replay/reconcile 与“完成后启动新责任周期”是不同操作。[Temporal retry policies](https://github.com/temporalio/documentation/blob/main/docs/encyclopedia/retry-policies.mdx)、[Temporal Continue as New](https://go.temporal.io/platform-hub/patterns)

### Jupyter session/kernel vs execute request

Jupyter message protocol同时携带长期 `session` identity 与每个请求唯一的 `msg_id`；同一 stateful kernel/session 可处理多个 `execute_request`，每个请求有自己的 reply/status/output correlation。这与 SessionRef + Execution decomposition 同构。[Jupyter messaging specification](https://jupyter-client.readthedocs.io/en/stable/messaging.html)

### Common abstraction

共同语义不是某个术语，而是：

```text
长期 context/container identity
≠
一次具有独立请求、side effect、结果和审计责任的 execution attempt
```

该对照支持本 ADR，但不要求新增 Run/Turn/Attempt/Continuation 实体。

## Current-code conflicts

### `services.py`

1. `resume_execution(execution_id, ...)` 读取旧 Execution，并直接调用 Provider resume；应改为创建新 Execution 的 continuation flow。
2. `observe_projection()` 没有 terminal irreversible guard，允许更晚 active 覆盖 terminal。
3. terminal→active 时保留旧 `ended_at`，产生 active + ended_at 的矛盾状态。
4. `request_dispatch()` 只按 idempotency key 去重，不拒绝同一 Execution 的第二个不同 dispatch。
5. `resumable_now=True` 当前被用作直接 resume 旧 Execution 的许可；新语义下只能作为 Session continuation snapshot。
6. `apply_observation()` 没有 input refs 参数，无法通过 Service 记录 E2 对 S1 的 continuation input relation。

### `repository.py` / migration 004

1. `core_dispatches.execution_id` 没有 UNIQUE constraint。
2. `provider_correlation_ref` 存在但没有 claim/record/reconcile API。
3. `dispatched_at` 字段存在但 request dispatch 不更新。
4. Projection update SQL 没有 terminal phase CAS guard。
5. 当前 ref schema 已允许多个 Execution 引用同一 SessionRef，无需新增表。

### `registry.py` / Provider contract

1. Protocol 未声明 optional resume operation，但 Service 动态 `getattr()` 调用。
2. start/resume request/response 为 `Any`，没有 execution/dispatch correlation envelope。
3. Provider resume 需要改为“为新 Execution 使用 continuation SessionRef 启动”，而不是旧 Execution state transition。

### Codex Provider/CLI

1. `resume-codex` 接收旧 `execution_id`，查旧 Execution 的 SessionRef，调用 resume 后把 observation/outputs 写回旧 Execution。
2. resume path 不创建新 Execution/dispatch/idempotency boundary。
3. `_capture()` 会使旧 terminal Execution 再次 active/terminal。
4. RunRef/PID attachment本身符合新语义，但 resume 的新 PID 应属于 E2。

### Tests

`test_phase_one_service_slice_preserves_execution_through_resume_and_explicit_close` 明确断言 terminal 后 resume 同一 Execution，必须替换为：

```text
E1 terminal
→ create E2
→ E2 input SessionRef == E1 native SessionRef
→ E1 remains terminal
```

当前缺少 terminal irreversibility、one-dispatch、single-cycle timestamps、crash reconcile same Execution 等契约测试。

## Mutation impact

本节只列采用该语义后的 production 变化，不在本 ADR 中实施。

| Priority | Change | Classification |
|---|---|---|
| P0 | 冻结 Execution=single dispatch responsibility attempt | semantic clarification |
| P0 | terminal 后拒绝任何 nonterminal Projection | invariant guard |
| P0 | `core_dispatches.execution_id` 唯一 | schema constraint |
| P0 | request/accept dispatch 同时一次性设置 `dispatched_at` | service/schema behavior |
| P0 | 实现 dispatch claim/correlation/reconcile | service/repository change |
| P0 | restart 对同一 D1/E1 reconcile，禁止 blind redispatch | service/runtime change |
| P0 | resume 创建 E2，并把 S1 作为 continuation input | service change |
| P0 | Codex CLI resume 输出新 execution ID，facts/refs 写入 E2 | CLI behavior change |
| P0 | Provider resume request 携带 E2/D2/S1 correlation | provider contract change |
| P1 | `resumable_now` 改为 observation-time continuation-source evidence | semantic clarification |
| P1 | 创建 E2 前重新验证 SessionRef，不能只读 E1 snapshot | provider/service change |
| P1 | `apply_observation()` 支持 INPUT refs 或等价受控 API | service change |
| P1 | started/ended timestamps write-once、single-cycle | invariant guard |
| P1 | terminal conflict observation 记录 anomaly 而非改写 | event/audit change |
| P1 | 替换同 Execution resume vertical slice | test change |
| P1 | 增加 crash reconcile、CI rerun、Human repeat tests | test addition |
| Binding | 一个 Execution 只能 accept 一个 frozen Binding | schema/invariant |
| Binding | Binding accept + DispatchRequested 同事务 | future integration |
| Binding | E2 必须新 resolve/freeze/validate B2 | future integration |
| Binding | actual facts/outcome/conformance 按 Execution 隔离 | future integration |

## Alternatives considered

### Alternative B：Execution = resumable session continuity

在该方案中，同一个 Execution 可以：

```text
active
→ terminal
→ resume
→ active
→ terminal
```

拒绝原因：

1. 单一 outcome 被多轮结果覆盖或需要复杂化；
2. `started_at/ended_at` 无法保持单周期；
3. 一个 Execution 需要多个 dispatch 或 dispatch revisions；
4. 每次 resume 的 Binding/input basis 无法一一固定；
5. actual consumption/output/conformance 混在同一责任节点；
6. crash reconciliation 与用户 resume 难以区分；
7. contribution graph 退化成 session-level 模糊归因；
8. Human/CI rerun 场景缺乏自然解释；
9. SessionRef 已经能表达 native continuity，无需让 Execution 承担第二份 continuity identity。

因此不选择。

### Alternative C：新增 ExecutionAttempt/Turn/Continuation entity

拒绝原因：当前 Execution + SessionRef 已完整表达责任 attempt 与 context continuity。新增实体只会把现有 Execution 再包一层，并迫使 Work Core承担 retry/turn ontology。

## Consequences

### Positive

- terminal 语义真正不可逆；
- timestamps 简化成一次 cycle；
- 每个 Execution/Binding/dispatch/actual facts/outcome/conformance 一一对应；
- crash recovery 与用户 resume 有可判定边界；
- retry/rerun provenance 不覆盖历史；
- Session context 可继续复用；
- CI/Human/shell/Codex 使用同一 Execution ontology；
- contribution graph 以清晰责任节点派生；
- 无需新增一级实体。

### Costs

- 每次 resume/rerun 会增加 Execution row、Binding、dispatch 和 events；
- UI 需要把多个 Execution 聚合显示为同一 Session continuity；
- CLI resume 返回新的 Execution ID，存在行为兼容变化；
- Provider adapter 必须区分 reconcile same dispatch 与 start continuation execution；
- `resumable_now` 在兼容期名称与新语义不完全匹配。

这些成本是显式审计责任的必要成本，没有引入 workflow/scheduler/resource lifecycle。

## Non-goals

本 ADR 不：

- 新增 ExecutionAttempt、Turn、Run aggregate、Session aggregate、Continuation 或 Retry 实体；
- 定义 workflow、scheduler、queue 或 retry policy；
- 管理 Session lifecycle；
- 规定 Provider 内部 tool/model turn 粒度；
- 实现完整 RBAC 或跨 Work session policy engine；
- 修改 Production Core code/schema；
- 决定 Binding 的全部字段或 migration。

## Open questions

以下问题不影响语义冻结，只影响后续接口实现：

1. `resumable_now` 在哪个版本从 ExecutionProjection 迁移为 SessionRef/provider derived observation；v0.1 先保留并重新定义。
2. Provider 如何给出“D1 确实未产生任何 native side effect”的强 evidence，以允许同 D1 delivery retry；默认没有 evidence 就只 reconcile，不新建 D2。
3. 跨 Work SessionRef reuse 的显式用户确认/approval 在 Host UX 中怎样呈现；Core 保持允许、Host 默认不自动 carry。

## Decision outcome

**C. ACCEPT AND FREEZE**

该 identity boundary 内部一致，能在 Codex/CI/shell/Human 场景下统一成立，并显著简化 terminal、timestamps、dispatch、Binding、actual facts、crash recovery 与 contribution semantics。成熟系统对照和真实 Provider evidence 均支持长期 context/session identity 与单次 execution responsibility attempt 分离。

Production 实现必须迁移到本 ADR；在迁移完成前，当前同 Execution resume vertical slice 被视为已知 legacy behavior，不再是目标 contract。

## Implementation update — 2026-08-28

same-Execution resume 已从 production Core 移除，本 ADR 的 resume 语义为 current code 所描述（本节只追加事实，不改写上文冻结语义）：

1. **`ExecutionService.resume_execution()` 已删除**，错误类型 `ExecutionNotResumable`
   一并删除（其唯一生产用途就是该入口）。Core 不再暴露任何把旧 Execution
   重新 active/重跑的 API；provider 的 native `resume` operation 只能作为
   新 Execution 的 dispatch 责任边界内的启动方式被调用。测试
   `tests/test_work_core_services.py::test_core_exposes_no_same_execution_resume_entrypoint`
   钉死方法不存在。
2. **`terminal + resumable_now=True` 是合法 projection**（ADR-0005 兼容期语义）。
   `resumable_now` 只表示 observed_at 时 native continuity 可作为**新**
   Execution 的 continuation source；terminal guard 继续密封 phase、outcome
   与 Execution 历史。同一 terminal/outcome 下，更新 freshness 或 continuation
   advisory 按 observed_at 规则接受，不视为 reopen；advisory 更新不改写
   outcome，也不改写 ended_at（ended_at write-once，见
   `test_terminal_with_resumable_now_true_is_a_legal_projection`）。
3. **continuation 表达保持不变**：new Execution + previous SessionRef 作为
   frozen INPUT + 新 Binding/Dispatch + `Provider.start()` 内执行 native
   resume。未新增 continuation_of、Resume、Session 等 Core 实体。垂直切片
   测试 `test_same_session_continuation_uses_new_execution_with_sessionref_input`
   钉死 E1 terminal 后 E2 复用其 SessionRef 且 E1 永远 terminal。
4. **In-tree Provider 的 terminal continuation advisory 依据**（按真实 native
   continuity 填写，不机械规定 terminal 一律 False）：
   - `codex-app-server`：terminal 时线程以 `ephemeral: False` 创建且
     `thread_id` 已由 app-server 确认返回，`thread/resume` + continuation
     契约消费同一 id → `True`；
   - `codex-tmux-interactive`：以 SessionStart hook 是否记录到 codex
     session id 为准（记录到 → `True`；从未捕获 → 确认无可继续的 native
     session → `False`）；
   - Pi tmux：以 terminal 时是否实际定位到 native session JSONL 文件为准
     （定位到 → `True`；未定位到 → `False`）。
   - 无法判断时（如 process/pane 不可达的 unknown projection）一律 `None`。
5. Host UI 当前不渲染 `resumable_now`；如未来渲染，文案必须是
   "Native continuation available" 类的 continuation-source 表述，不得显示
   为 "Resume this Execution"。
