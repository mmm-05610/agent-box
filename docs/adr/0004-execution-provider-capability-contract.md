# ADR-0004：ExecutionProvider v0.1 Capability Contract

Status: Current — retained as an active architectural decision.

- 状态：Accepted — Semantic Frozen（with amendment）
- 日期：2026-08-23
- 依赖：[ADR-0001](./0001-execution-attempt-vs-session-continuity.md)、[ADR-0002](./0002-dispatch-submission-and-recovery-semantics.md)、[ADR-0003](./0003-dispatch-canonical-correlation-and-recovery.md)
- 决策范围：Production Minimal Work Core 的 ExecutionProvider descriptor、capability、conditional protocols 与 registry validation
- 实现状态：Pending；本 ADR 不修改 production code

## Context

ExecutionProvider 是 Core 执行一次 Execution 的插件边界。Core 只关心会影响稳定 runtime guarantee 的能力：

- 能否提交一次 Dispatch；
- 能否产生并消费 durable canonical correlation；
- starting 且 correlation 缺失时能否恢复 submission；
- native same-key redelivery 是否具有不产生 duplicate operation 的静态保证。

Core 不关心模型、tool、web search、image generation、stream UI、resume 命令或其他 Provider 产品功能。

当前实现使用：

```python
def capabilities(self) -> Mapping[str, str]
```

并接受任意 key 和 `"supported"/"emulated"` string。这已经允许 `resume`、`cancel`、`stream` 等未经 Core contract 定义的 feature 进入同一 namespace，也无法表达 capability dependency、per-Dispatch evidence 或 method conformance。

本 ADR 的目标是冻结一个只支持真实 Work vertical slice 的 v0.1 contract，而不是设计完整 Provider SDK。

## Decision

采用三部分组合：

1. **required base Protocol**：`start()`；
2. **frozen typed capability descriptor**：只声明 Core v0.1 guarantee；
3. **conditional Protocol presence**：当 descriptor 声明 optional capability 时，registry 验证相应 method/interface 存在。

Capability 与 evidence 严格分离：

> Capability says what the Provider can guarantee in general.
>
> Evidence says whether this Dispatch may safely exercise that capability now.

### Important amendment

初始候选把以下四项都当作独立 optional capability：

```text
durable_correlation
observe
recover_start
idempotent_redelivery
```

其中 `observe` 不应是独立 capability。根据 ADR-0003，`observe(C1)` 只接受 canonical correlation，而 durable correlation 的定义本身要求 restart 后能用 C1 observe/reconcile 同一次 native execution。

因此 v0.1 将它们收敛为：

```text
correlation = DURABLE
  => Provider must implement observe(C1)
```

不存在合法的“durable correlation 但不能 observe”，也不声明“observe supported 但 correlation unsupported”。method presence 可以存在，但没有 descriptor guarantee 时 Core 不会调用。

## Required capabilities

唯一 required runtime operation：

```text
start
```

每个注册的 ExecutionProvider 必须实现：

```text
descriptor() -> ExecutionProviderDescriptor
start(DispatchStartRequest) -> DispatchStartResult
```

`start` 不在 capability descriptor 中重复声明。能被注册为 ExecutionProvider 就已经意味着 start contract 成立。

如果 Provider 无法 start，它不是一个 degraded ExecutionProvider；它不应注册。

## Optional capabilities

v0.1 只声明三个 optional guarantee。

### Durable correlation

```text
correlation = DURABLE | UNSUPPORTED
```

`DURABLE` 表示该已配置 Provider instance 具备：

- 产生符合 ADR-0003 的 canonical Ref；
- 在 recovery horizon 内解释历史 C1；
- 通过无 create-side-effect 的 `observe(C1)` 返回 normalized observation。

它不表示每次 `start()` 一定返回 C1。某次 Dispatch 仍可能是 `no_side_effect` 或 `indeterminate`。

### Start recovery

```text
start_recovery = SUPPORTED | UNSUPPORTED
```

`SUPPORTED` 表示 Provider 实现 `recover_start(context)`，用于：

```text
D1.state = starting
D1.correlation_ref = NULL
```

它不保证某次调用一定找回 correlation。合法结果仍然是：

```text
correlated(C1)
no_side_effect(reason)
indeterminate(reason?)
```

### Native idempotent redelivery

```text
redelivery = NATIVE_SAME_DISPATCH | UNSUPPORTED
```

`NATIVE_SAME_DISPATCH` 表示 Provider/native API 在其声明的 scope 和 retention contract 内，对同一 D1、同一 idempotency key 和同一 submission intent 保证最多产生一个 native operation。

它是独立于 durable correlation 的 guarantee：

- Provider 可以安全 redeliver，但仍没有可 durable-observe 的 C1；
- Provider 可以有 durable C1，但 native create 不幂等。

在 v0.1 中它不是一个独立 Core operation。它只能由 `recover_start()` adapter 内部使用，因此有硬依赖：

```text
redelivery = NATIVE_SAME_DISPATCH
=> start_recovery = SUPPORTED
```

Core restart driver 不因 redelivery capability 直接再次调用 `start()`。

## Capability type design

### Recommended enums

```python
class CorrelationCapability(str, Enum):
    UNSUPPORTED = "unsupported"
    DURABLE = "durable"


class StartRecoveryCapability(str, Enum):
    UNSUPPORTED = "unsupported"
    SUPPORTED = "supported"


class RedeliveryCapability(str, Enum):
    UNSUPPORTED = "unsupported"
    NATIVE_SAME_DISPATCH = "native_same_dispatch"
```

### Typed frozen descriptor

```python
@dataclass(frozen=True)
class ProviderCapabilities:
    correlation: CorrelationCapability = CorrelationCapability.UNSUPPORTED
    start_recovery: StartRecoveryCapability = StartRecoveryCapability.UNSUPPORTED
    redelivery: RedeliveryCapability = RedeliveryCapability.UNSUPPORTED


@dataclass(frozen=True)
class ExecutionProviderDescriptor:
    id: str
    display_name: str
    version: str
    capabilities: ProviderCapabilities
```

不继续使用：

```python
dict[str, str]
bool flags
"supported" / "emulated" arbitrary strings
```

原因：

- typed descriptor 冻结 capability vocabulary；
- enum value 本身携带具体 guarantee，而不是模糊 true/false；
- constructor/registry 可以验证非法组合；
- 新增 capability 必须修改 Core contract 和测试，不能由插件任意发明 key；
- `emulated` 不是 Core guarantee 等级：只要 adapter 真正满足 contract 就声明对应 enum，否则 unsupported。

Capability 是 registered Provider instance 的 descriptor/config contract，不是数据库中的业务状态，不新增表。

## Protocol design

### Required base Protocol

```python
class ExecutionProvider(Protocol):
    def descriptor(self) -> ExecutionProviderDescriptor: ...
    def start(self, request: DispatchStartRequest) -> DispatchStartResult: ...
```

### Conditional observe Protocol

```python
class CorrelatedExecutionObserver(Protocol):
    def observe(self, correlation_ref: Ref) -> ExecutionObservation: ...
```

只有 `correlation=DURABLE` 时 registry 才要求并暴露该接口。

### Conditional recovery Protocol

```python
class StartRecoveryProvider(Protocol):
    def recover_start(
        self,
        context: DispatchRecoveryContext,
    ) -> DispatchStartResult: ...
```

只有 `start_recovery=SUPPORTED` 时 registry 才要求并暴露该接口。

### Method presence is not capability

Provider 类可能因继承、兼容 shim 或测试 stub 而拥有 `observe()`/`recover_start()` method。method 存在不等于静态 guarantee。

规则：

- descriptor 是 Core 是否可以调用 optional operation 的 authority；
- method/interface presence 是注册时的 implementation conformance；
- descriptor 声明 supported 但 method 缺失：注册失败；
- descriptor 声明 unsupported 但 method 存在：允许注册，但 Core 不调用；
- 不以 `try/except NotImplementedError` 做 capability discovery。

Registry 应提供 typed accessor，而不是 string lookup：

```text
require_observer(provider_id)
require_start_recovery(provider_id)
```

## Minimal DTOs

这些是 request/response value，不是一级领域实体。

```python
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

`DispatchStartResult` 是 sealed/discriminated union：

```text
Correlated(correlation_ref: Ref, provider_runtime?: opaque)
NoSideEffect(reason_code)
Indeterminate(reason_code?, provider_runtime?: opaque)
```

`provider_runtime` 仅表示当前 process 内的 Provider-owned handle/stream pump，不持久化，也不构成 capability 或 correlation。它允许 weak CLI 在线期间提供 active/terminal observation，而不伪装 durable recovery。

`ExecutionObservation` 是现有 normalized Projection + typed refs/facts 的 DTO；不复制 Provider telemetry。

## Dependency matrix

| Claim / result | Hard dependency | Reason |
|---|---|---|
| Provider registered | required `start()` | 基础执行边界 |
| `correlation=DURABLE` | callable `observe(C1)` | C1 必须能在 restart 后被消费 |
| `observe(C1)` Core call | `correlation=DURABLE` + persisted C1 | method presence 不够 |
| `start_recovery=SUPPORTED` | callable `recover_start(context)` | descriptor/implementation一致 |
| `redelivery=NATIVE_SAME_DISPATCH` | `start_recovery=SUPPORTED` | redelivery 只能在 recovery contract 内使用 |
| `start()` returns `Correlated(C1)` | `correlation=DURABLE` | 否则 Provider 声明与 evidence 冲突 |
| `recover_start()` returns `Correlated(C1)` | `correlation=DURABLE` | Core 必须能随后 observe C1 |
| `recover_start()` returns `NoSideEffect` | no correlation dependency | absence evidence 可独立成立 |
| `recover_start()` returns `Indeterminate` | no correlation dependency | 不确定性总是合法结果 |

合法组合包括：

| Correlation | Start recovery | Redelivery | Meaning |
|---|---|---|---|
| unsupported | unsupported | unsupported | weak Provider |
| durable | unsupported | unsupported | normal start 可恢复；commit 前 crash 无 start recovery |
| durable | supported | unsupported | marker/token lookup recovery |
| durable | supported | native same-dispatch | strongest v0.1 Provider |
| unsupported | supported | unsupported | 只能证明 absence 或 indeterminate |
| unsupported | supported | native same-dispatch | 可安全收敛 submission，但仍可能无 durable observe locator |

非法组合：

```text
correlation=DURABLE without observe method
redelivery=NATIVE_SAME_DISPATCH with start_recovery=UNSUPPORTED
Correlated result while correlation=UNSUPPORTED
```

## Invalid inference rules

Core 禁止进行以下推导：

1. capability supported ⇒ 本次 D1 已获得 evidence；
2. `correlation=DURABLE` ⇒ 每次 start 都 correlated；
3. `correlation=DURABLE` ⇒ `recover_start=SUPPORTED`；
4. `start_recovery=SUPPORTED` ⇒ 能返回 correlated；
5. `start_recovery=SUPPORTED` ⇒ native redelivery 幂等；
6. `redelivery=NATIVE_SAME_DISPATCH` ⇒ 当前 D1 token/scope/retention 仍有效；
7. method exists ⇒ capability supported；
8. start returned/provider runtime handle exists ⇒ Dispatch started；
9. PID/SessionRef exists ⇒ durable correlation；
10. 某次 `NoSideEffect` ⇒ Provider 静态 `safe_not_started`；
11. observe unsupported ⇒ Provider 在线期间不能产生 stream observation；
12. Provider unsupported 某 optional capability ⇒ Provider不能注册或 start。

## Per-Dispatch evidence

Capability 不存放：

- 本次 C1；
- side-effect absence proof；
- start/recovery disposition；
- idempotency token 当前是否仍在 retention window；
- 本次 scope、tenant、region 或 request digest 是否匹配；
- observed native outcome。

这些必须来自本次 `start/recover_start/observe` DTO，并按 ADR-0002/0003 持久化为 Dispatch evidence、Ref、Event 或 Projection。

### Native idempotency retention

“Provider/native API 存在 same-key idempotency mechanism”是静态 capability。

“D1 的 token 在此刻、此 scope、此参数下仍可安全 redeliver”是 per-Dispatch evidence，由 Provider 在 `recover_start()` 内判断。Core 不从 descriptor 中的 duration 自行计算安全性。

v0.1 不把 retention duration 扩进 capability descriptor；若 Provider 无法确认当前有效，返回 `Indeterminate`。

### Safe-not-started

不增加 `safe_not_started` 静态 capability。

即使 Provider 有能力在某些情况下证明 absence，也不能保证所有 submission 都如此。只有某次 response 映射出的 contract-defined `NoSideEffect(reason_code)` 才允许 ordinary same-D1 retry。

## Provider examples

### Weak CLI Provider

```python
ProviderCapabilities(
    correlation=UNSUPPORTED,
    start_recovery=UNSUPPORTED,
    redelivery=UNSUPPORTED,
)
```

实现：

- required `start()`；
- 不要求 `observe()`；
- 不要求 `recover_start()`；
- `start()` 可以返回当前进程内 runtime handle 和 durable-dispatch perspective 的 `Indeterminate`；
- 在线 stream 可以产生 E1 active/terminal observation；
- Core crash 后 D1 starting/unresolved。

这是合法 Provider，不降低 `started` 定义。

### Strong remote job Provider

```python
ProviderCapabilities(
    correlation=DURABLE,
    start_recovery=SUPPORTED,
    redelivery=NATIVE_SAME_DISPATCH,  # native API 有该保证时
)
```

实现：

- `start(D1)` 通常返回 `Correlated(RunRef(job_id))`；
- `observe(job_ref)` 查询同一 remote job；
- `recover_start(D1)` 通过 client token/marker 找回 job；
- network timeout 时可在 token retention 仍有效且 digest/scope 匹配时安全 redeliver；
- 每次结果仍可能是 NoSideEffect/Indeterminate，Core 不从 capability 猜测。

若 native create 不幂等，保持 correlation/start recovery supported，但 redelivery unsupported。

### Intermediate Provider

```python
ProviderCapabilities(
    correlation=DURABLE,
    start_recovery=UNSUPPORTED,
    redelivery=UNSUPPORTED,
)
```

实现：

- 正常 `start()` 返回 durable C1；
- `observe(C1)` restart-safe；
- Core 若在 C1 commit 前 crash，无法按 D1 找回，D1 保持 starting/unresolved；
- C1 已提交后 restart 可以正常 observe。

这个组合证明 durable correlation 与 recover_start 不能被错误绑定为同一个 capability。

### Recovery-without-correlation Provider

以下组合虽然不是本轮要求的三类，但用于证明 dependency：

```python
ProviderCapabilities(
    correlation=UNSUPPORTED,
    start_recovery=SUPPORTED,
    redelivery=UNSUPPORTED,
)
```

它的 `recover_start()` 可以返回 `NoSideEffect` 或 `Indeterminate`，但不得返回 `Correlated`。这仍能安全解开部分 starting window。

## Restart driver consumption

Restart driver 只消费 frozen enum，不解析 string 或探测异常。

```text
D1=requested
  → registry.get(provider).start(...)

D1=starting, C1=NULL
  → if start_recovery=UNSUPPORTED:
       unresolved
    else:
       registry.require_start_recovery(provider).recover_start(context)
       correlated(C1): validate capability/evidence, atomic mark started
       no_side_effect: persist evidence; ADR-0002 safe retry rules
       indeterminate: unresolved

D1=started, C1 exists
  → require correlation=DURABLE
  → registry.require_observer(provider).observe(C1)
  → normalized Projection
```

Restart driver 不直接消费 redelivery capability 来调用 `start()`。Provider 在 `recover_start()` 内判断当前 D1 是否满足 native idempotency scope/retention 并执行或拒绝 redelivery。

若 persisted started Dispatch 对应的当前 Provider version 不再声明/实现 observe，Core 保持 D1 started，但把 Provider 视为 unavailable/contract-incompatible，并使最新 observation unknown；不得降级 state 或 blind start。Provider upgrade 必须在 recovery horizon 内向后兼容历史 correlation Ref。

## Registry validation

注册时至少验证：

1. descriptor ID、version 和 typed capabilities 有效；
2. Provider ID 唯一；
3. `start()` callable；
4. `correlation=DURABLE` 时 `observe()` callable；
5. `start_recovery=SUPPORTED` 时 `recover_start()` callable；
6. native redelivery 时 start recovery supported；
7. capability enum 是已知 frozen value；
8. 不接受自由 capability keys 或 `emulated` level。

运行时还要验证：

- Correlated result 只能来自 durable-correlation Provider；
- C1.provider 等于 Execution.provider_id；
- result 对应 D1/submission digest；
- NoSideEffect reason 是该 Provider contract 认可的 typed reason；
- optional method 只通过 registry typed accessor调用。

## Current-code conflicts

### `registry.py`

1. `ProviderDescriptor` 不包含 typed capabilities。
2. `capabilities() -> Mapping[str, str]` 是自由扩展 dict。
3. `ExecutionProvider` 强制所有 Provider 实现 `observe()`，无法表达合法 weak Provider。
4. `start(Any) -> Any`、`observe(Any) -> Any` 没有稳定 DTO。
5. `require_capability(provider_id, operation: str)` 依赖 arbitrary string。
6. `"emulated"` 被视为 supported，但没有说明是否满足同一 Core guarantee。
7. registry 不验证 capability dependency 或 method conformance。

### Codex Provider

1. capability dict 包含 `resume/cancel/stream`，超出 v0.1 runtime contract。
2. 声明 `observe=supported`，但 `observe(thread_id)` 只能返回 unknown/unreachable，不能消费 canonical Dispatch correlation。
3. 当前应注册为 weak Provider：三个 optional capability 都 unsupported。
4. `parse_stream()` 和当前 process handle 可以继续用于在线 observation，但不构成 capability。

### Services / CLI

1. `resume_execution()` 使用 arbitrary `require_capability(..., "resume")` 和 `getattr()`，与 ADR-0001 冻结语义冲突。
2. CLI 直接调用 raw `start()`，没有 DispatchStartRequest/Result envelope。
3. 尚无 restart driver、`recover_start` 或 typed observe path。

### Tests

当前测试仍断言：

- arbitrary capability dict；
- string `require_capability("start"/"resume")`；
- same Execution resume；
- method presence 与 capability 的关系未验证。

缺少 weak/strong/intermediate matrix、invalid dependency、supported-without-method、method-without-claim、per-Dispatch result/capability mismatch 和 restart-driver tests。

## Required implementation changes

本 ADR 不实施 production 修改。

| Priority | Change | Classification |
|---|---|---|
| P0 | 引入三个 frozen enum 和 `ProviderCapabilities` | typed contract |
| P0 | capability 合并进 `ExecutionProviderDescriptor` | descriptor change |
| P0 | base Protocol 只要求 descriptor + start | protocol correction |
| P0 | 增加 conditional observer/recovery Protocol | interface capability |
| P0 | registry 注册时验证 dependency + method conformance | invariant guard |
| P0 | string `require_capability` 改为 typed accessor | registry/service change |
| P0 | 增加 typed start/recovery result union | DTO contract |
| P0 | Codex 改为三个 optional capability unsupported | provider correction |
| P1 | restart driver 按 typed capability消费 | runtime/service change |
| P1 | 删除 capability namespace 中 resume/cancel/stream | semantic cleanup |
| P1 | 替换同 Execution resume 测试与 arbitrary dict 测试 | test change |
| P1 | 增加 dependency/provider matrix/restart tests | test addition |

数据库变化：

```text
none
```

## Alternatives rejected

### `dict[str, str]`

无法冻结 vocabulary、依赖或 guarantee，最终会变成 Provider feature catalog。

### 全部使用 bool

`True` 无法表达具体 guarantee，例如 native same-key idempotency 的 scope，也容易发生默认推导。二值 enum 名称更明确并可安全演进。

### 只依赖 method presence

method 可能是 stub、兼容 shim 或继承实现。它不能声明 durability、idempotency 或 Core 是否可安全调用。

### 所有 optional methods 都必需并返回 Unsupported

统一 method surface 可实现，但会再次让 method presence 失去意义，并弱化静态/类型检查。conditional Protocol + registry validation 更清晰。

### 调用后捕获 `NotImplementedError`

restart 安全决策不能用异常探测。它可能已进入 side-effect boundary，且异常无法区分 unsupported、indeterminate 或 provider bug。

### 独立 `observe` capability

在本 Core 中 observe 的唯一合法输入是 durable canonical correlation，因此它与 durable-correlation guarantee 是同一 contract 的消费端，不应产生非法组合。

### 静态 `safe_not_started`

absence 只能针对一次 D1 和一次 recovery response 成立，不能由 Provider 静态声明。

### 把所有 Provider features 加入 capability

cancel、resume、stream、tools、models、search 等不影响当前 Dispatch recovery contract；加入会使 Core 依赖产品功能目录。

## Consequences

### Positive

- capability vocabulary 小且不可由插件扩张；
- weak Provider 不再需要伪造 observe support；
- invalid capability combinations 在注册时失败；
- restart driver 无 Provider-specific branching 或 NotImplementedError probing；
- static guarantee 与 per-Dispatch evidence 清晰分离；
- durable correlation、recover-start 和 idempotency 的真实依赖被表达；
- 新实体、数据库表和业务状态均为 0。

### Costs

- Provider adapter 需要迁移 descriptor 和 typed DTO；
- registry 需要 conditional interface validation；
- Python typing 无法单靠 Protocol 静态表达所有 descriptor-dependent method，需要 runtime registration guard；
- Provider upgrade 必须保持历史 correlation codec/observe 兼容；
- 当前 Codex 会明确暴露为 weak Provider，而不是通过 method 名称看起来更强。

## Non-goals

v0.1 不设计：

- cancel、pause、resume、retry scheduler；
- stream/telemetry capability；
- model/tool/web/image/search feature discovery；
- Provider marketplace metadata；
- authority/resource validation capability；
- capability negotiation protocol；
- capability 数据库、历史快照或 migration table；
- 完整 Provider SDK。

## First-class entity delta

```text
0
```

Database table delta：

```text
0
```

新增内容只包括 enum、frozen descriptor、conditional Protocol、DTO、registry validation 和测试。

## Open questions

不影响 v0.1 capability boundary 的实现问题：

1. conditional Protocol 使用 `runtime_checkable`，还是 registry 显式检查 callable；
2. typed accessor 返回原 Provider、validated wrapper 还是窄 Protocol view；
3. `provider_runtime` opaque handle 的 Python typing；
4. Provider descriptor version 与历史 correlation codec compatibility 如何在部署检查中验证；
5. NoSideEffect reason code 是 Core enum 还是 Provider code + Core disposition。

## Decision outcome

**B. ACCEPT WITH AMENDMENT — accepted and frozen**

候选冻结语义：

```text
required: start

optional typed guarantees:
  correlation = durable | unsupported
  start_recovery = supported | unsupported
  redelivery = native_same_dispatch | unsupported

correlation=durable activates observe(C1)
start_recovery activates recover_start(context)
native redelivery requires start_recovery

capability is static contract
evidence is per Dispatch
method presence is not capability
```
