# Architecture Redesign Round 3 — Minimal Dispatch Protocol
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

日期：2026-08-28
Track：A / Dispatch 可实现性验证
范围：当前 Git、tmux、Codex、Pi 路径的只读模拟；不修改实现。

# Executive verdict

可以用**零 schema migration**修复 Round 2 的主要 Dispatch 缺口，并为官方 Harness 插件
提供足够干净的启动协议。最小方案不是恢复一套完整 `requested → starting → started`
状态机，而是收紧当前三态的语义：

```text
requested
  frozen handoff exists;
  native start may or may not have happened;
  replay is always reconcile-only, never blind start

accepted
  provider.start returned one validated receipt;
  replay returns the stored Dispatch receipt only

failed
  governed sequence failed;
  no automatic redelivery;
  it does NOT prove every resource side effect was absent
```

核心改动只有四类：

1. `ExecutionStartRequest` 以一个 canonical
   `ResolvedExecutionInput(contract_id, exact Ref, value)` tuple 为事实来源；旧 grouped
   `inputs` 只是派生 property。
2. `dispatch_execution()` 对外返回 `DispatchReceipt`，不再返回内部 start request；
   accepted replay只读row/event，绝不 resolve/start。
3. 增加 side-effect-free provider preflight，并在任何声明为 effectful 的 resource
   materialization 前调用。
4. `ExecutionProvider.start()` 返回 typed `ExecutionStartReceipt`；未知异常/无效 receipt
   保持 requested/ambiguous，只有显式 `ExecutionStartRejected` 才进入 failed。

Recovery support 使用 `none | observe | control`。新 typed receipt 的 canonical correlation
保存进现有 `provider_correlation_ref TEXT`；support level 写入同一 accepted event。无需新增
列。旧 raw string correlation 仍可读取为 legacy/`none`，不伪造恢复保证。

这不是完整 production restart protocol。它选择一个保守 Preview cut：requested crash
window可能永久 ambiguous，但绝不 blind redispatch。若产品要承诺所有 Provider 可跨 Host
restart控制，则必须另行落实 ADR-0002/0003；不能把那项承诺偷偷塞进本批。

# Goals and non-goals

## Goals

- accepted idempotency replay产生零 Provider/ResourceProvider调用；
- exact Ref/value association完整传到 accountable ExecutionProvider；
- driver/Profile/continuation/Console/Sandbox组合在effectful materialization前拒绝；
- start结果和correlation有受控类型；
- Provider恢复能力不被统一夸大；
-任意未知crash/timeout保守停在requested，不产生第二native side effect；
-保持one Execution/one Dispatch、frozen inputs、terminal sealing和new-Execution
  continuation。

## Non-goals

- generic retry/rearm engine；
- generic ResourceLease或compensation entity；
- Sandbox/Console Core protocol；
- workflow phase/state machine；
-跨Provider分布式transaction；
-强制所有Provider支持restart；
-给failed赋予“绝对无side effect”语义。

# Current implementation delta

当前关键API：

```python
ExecutionService.dispatch_execution(...) -> ExecutionStartRequest

ExecutionStartRequest(
    execution_id,
    dispatch_id,
    inputs_digest,
    inputs: Mapping[str, tuple[object, ...]],
)

ExecutionProvider.start(request: Any) -> Any
```

当前新Dispatch序列：

```text
canonicalize/limits
-> atomically freeze + requested
-> resolve all inputs in canonical order
-> provider.start
-> any exception => failed
-> start returns => accepted
```

当前accepted replay：

```text
read frozen inputs
-> resolve all inputs again
-> return reconstructed ExecutionStartRequest
```

本设计只改变invocation/receipt语义；Work/Execution/Ref/Binding/Observation schema均不变。

## Repository evidence behind the cut

这不是假设未来 Sandbox 的问题，当前受支持路径已经足以证明排序和重放必须收紧：

- `work_core/services.py::_resolve_inputs()` 按 frozen inputs 调
  `ResourceProvider.resolve()`；accepted idempotency branch也调用它，然后才返回
  `ExecutionStartRequest`。因此当前accepted replay的确会再次进入资源实现，尽管不会再次
  `provider.start()`。
- `GitWorktreeResourceProvider.resolve()` 可执行 `git worktree add`；preview Git plugin
  直接委托该实现。`TmuxConsoleResourceProvider.resolve()` 对新 console 可创建 session/panes。
  两者都说明“已accepted command replay”不能借由重新resolve来重建一个临时request。
- Codex App Server provider 的 client/stdin/stdout 和 `_handles` 都在进程内；其回传的
  `thread_id` 不是当前代码所证明的跨Host control receipt。Codex tmux虽然能由 control
  adapter重建pane handle，`finish`仍依赖重建后的运行环境。
- Pi 在 launch 前写 `dispatch_id.start.json`，并有 `recover_handle()`；这为未来实际
  restart test提供候选证据，但当前Core只持久化raw session-id string，且 explicit finish
  的submitted signal不在该journal中。因此Pi在该test完成前至多声明 `observe`，绝不能
  宣称 `control`。

这些事实也限定了本轮：不把Git/tmux的materialization移入Core，不把Codex/Pi handle变成
Core entity，更不根据一个非空correlation string推断restart能力。

# Proposed public DTOs

这些类型是进程内 invocation DTO/value，不是持久entity、Binding slot或新的Core关系。

## ResolvedExecutionInput

```python
@dataclass(frozen=True)
class ResolvedExecutionInput:
    contract_id: str
    ref: Ref
    value: object
```

约束：

- 顺序等于 Core canonical frozen input order；
- `ref` 必须与该Execution已冻结association逐字段相等；
- `value` 必须是registry中该contract_id对应的registered frozen Contract type；
-同一Ref不能重复或以两个contract_id出现；
-此DTO不持久化，不获得id/version/CRUD。

## ExecutionStartRequest

```python
@dataclass(frozen=True)
class ExecutionStartRequest:
    execution_id: str
    dispatch_id: str
    inputs_digest: str
    resolved_inputs: tuple[ResolvedExecutionInput, ...]

    @property
    def inputs(self) -> Mapping[str, tuple[object, ...]]:
        """Read-only compatibility view derived from resolved_inputs."""
```

`inputs` 不能是第二个constructor field。这样现有Codex/Pi大部分消费代码可以暂时继续
`request.inputs[contract_id]`，但任何Observation或operational routing可以使用exact
`resolved_inputs`。

## ExecutionPreflightRequest

```python
@dataclass(frozen=True)
class ExecutionPreflightRequest:
    execution_id: str
    dispatch_id: str
    inputs_digest: str
    exact_inputs: tuple[tuple[str, Ref], ...]
    resolved_non_effectful_inputs: tuple[ResolvedExecutionInput, ...]
```

Provider preflight可读取：

-全部exact Ref及其metadata/provider；
-Profile、continuation、capability definition等已声明non-effectful的resolved values；
-driver-specific input组合。

它不可获得live Sandbox instance、worktree path或tmux-created session，因为这些尚未
materialize。

## RecoverySupport

```python
class RecoverySupport(str, Enum):
    NONE = "none"
    OBSERVE = "observe"
    CONTROL = "control"
```

语义：

| 值 | 本次accepted Dispatch实际保证 |
| --- | --- |
| `none` | Host restart后只保留历史facts，不能保证重新取得native control |
| `observe` | 可凭canonical correlation无create side effect地重新observe |
| `control` | 可重新observe，并可幂等finish/cleanup/attach等Provider声明的controls |

这是本次receipt的保证，不是插件广告的最大能力。Provider descriptor可以声明maximum，
receipt实际值不得高于maximum。

## ExecutionStartReceipt

```python
@dataclass(frozen=True)
class ExecutionStartReceipt:
    execution_id: str
    dispatch_id: str
    inputs_digest: str
    recovery_support: RecoverySupport
    correlation_ref: Ref | None = None
```

校验：

-三个identity/digest字段必须等于request；
- `OBSERVE`/`CONTROL` 必须提供correlation_ref；
- correlation_ref.provider必须等于accountable ExecutionProvider descriptor id；
- correlation不能是secret/bearer token；
- `NONE`可以无correlation；有Ref时只作为locator，不得被UI升级为durable recovery；
-receipt不宣称Execution ACTIVE或terminal。

## DispatchReceipt

```python
@dataclass(frozen=True)
class DispatchReceipt:
    execution_id: str
    dispatch_id: str
    state: Literal["accepted", "failed", "requested"]
    inputs_digest: str
    recovery_support: RecoverySupport | None
    correlation_ref: Ref | None
    legacy_correlation: str | None = None
```

它是application command response/read model，不是新Core entity。初次成功与accepted
replay返回相同语义的receipt。失败仍通过受控异常返回，但query API可以构造failed
receipt。

# Proposed provider APIs

## ExecutionProvider

```python
class ExecutionProvider(Protocol):
    def descriptor(self) -> ProviderDescriptor: ...
    def capabilities(self) -> Mapping[str, str]: ...
    def input_limits(self) -> Mapping[str, tuple[int, int | None]]: ...

    def preflight(self, request: ExecutionPreflightRequest) -> None: ...
    def start(self, request: ExecutionStartRequest) -> ExecutionStartReceipt: ...
    def observe(self, correlation_ref: Ref) -> object: ...
```

Preview compatibility：

-无`preflight`的legacy Provider按no-op处理，但不能获得“preflight-safe”conformance；
-legacy `start()->str` 暂时normalize为`RecoverySupport.NONE + legacy_correlation`，只为旧
  Provider迁移，不允许新官方Harness使用；
-Plugin API下一次breaking bump后删除raw string start result。

Provider preflight硬规则：

-不得创建目录、worktree、pane、process、network request或credential session；
-不得调用Harness binary；
-必须验证selected Profile/driver、continuation类型/版本/model、Console/Sandbox组合和
  required capability结构；
-返回`None`或抛`ExecutionPreflightRejected`；
-异常发生时Coordinator可以安全记录failed，因为尚未执行effectful resolution/start。

## ResourceProvider effect declaration

最小兼容形式：

```python
class ResourceProvider(Protocol):
    supported_contract_ids: frozenset[str]
    effectful_contract_ids: frozenset[str]  # optional, legacy default = all supported

    def resolve(self, contract_id: str, ref: Ref) -> object: ...
```

`effectful_contract_ids` 只控制Dispatch内部排序，不是安全证明。trusted plugin可以撒谎；
conformance用spy fixture检查官方Provider。legacy默认“全部effectful”是保守选择，避免在
preflight前意外materialize。

当前建议分类：

| Provider/Contract | 分类 | 理由 |
| --- | --- | --- |
| ArtifactPrompt | non-effectful | read + digest validation |
| Profile immutable snapshot | non-effectful | read content-addressed declaration |
| Pi/Codex continuation | non-effectful | read native/session metadata，不恢复process |
| existing tmux pane validation | 可在未来拆为non-effectful | 当前provider可能inspect live pane；无create，但有native query |
| new tmux console spec | effectful | creates session/panes |
| Git Worktree WorkspaceV1 | effectful | may execute worktree add |
| future Sandbox policy/spec | non-effectful selection；instance create不放resolve | remote create属于start operational adapter |

“native query”是否算effectful：它不会materialize但可能unavailable/slow。对preflight排序而言
可归non-effectful；对doctor/discovery仍禁止调用。Preview可先把tmux全部保守归effectful。

# Proposed exceptions and dispositions

## Before start

```python
class ExecutionPreflightRejected(DispatchFailed): ...
class ResourceResolutionFailed(DispatchFailed): ...
```

preflight或resolve异常都可将Dispatch记为failed，因为accountable native start尚未调用。
注意：effectful resource resolve失败前可能已经创建部分resource，所以failed仍不等于
“所有side effects absent”。

## During start

```python
class ExecutionStartRejected(Exception):
    """Provider proves accountable native responsibility was not created."""

class ExecutionStartIndeterminate(Exception):
    """Native responsibility may have been created; reconcile only."""
```

处理：

| start结果 | Dispatch变化 |
| --- | --- |
| valid `ExecutionStartReceipt` | accepted |
| `ExecutionStartRejected` | failed |
| `ExecutionStartIndeterminate` |保持requested，追加ambiguous event |
| timeout/OSError/unknown exception |保持requested，追加ambiguous event |
| malformed/mismatched receipt |保持requested，追加ambiguous event |

Provider若在catch中无法证明no side effect，必须使用indeterminate或让原异常冒泡。普通
`ValueError` 不再自动解释成safe failure。

# Core events

保留：

- `EXECUTION_DISPATCH_REQUESTED`
- `EXECUTION_DISPATCH_ACCEPTED`
- `EXECUTION_DISPATCH_FAILED`

建议新增一个EventType，不需要migration（event type是TEXT且无SQL CHECK）：

```text
EXECUTION_DISPATCH_AMBIGUOUS = "ExecutionDispatchAmbiguous"
```

事件data保持有界：

```text
dispatch_id
stage=start
error_type
error_summary (<=256)
```

它不改变dispatch.state；row仍是requested。若进程在start return后、写accepted前直接
crash，来不及追加该event，restart看到requested本身就足够得出ambiguous。

accepted event新增：

```text
dispatch_id
recovery_support
correlation_identity_digest   # optional, not the full Ref
```

完整canonical correlation Ref序列化存入现有`provider_correlation_ref TEXT`。不要把完整
JSON重复进CoreEvent；Ref metadata组合可能超过每值256限制。

# Correlation serialization without migration

新值使用带前缀的canonical JSON：

```text
ref:v1:{"metadata":{...},"native_id":"...","provider":"...",
        "type":"RunRef","uri":"..."}
```

读取规则：

1. `NULL` -> no correlation；
2. `ref:v1:` -> parse完整Ref并执行bounded validation；
3. 其他string -> legacy correlation，只能`RecoverySupport.NONE`；
4. parse失败 ->历史fact仍显示raw locator，但recovery disabled，不能猜。

`record_dispatch_accepted()` 在一个已有SQLite transaction内：

```text
validate requested state
UPDATE row state=accepted, provider_correlation_ref=serialized Ref/legacy
APPEND accepted event(recovery_support, correlation digest)
COMMIT
```

因此support level与correlation同时落盘：support在event，correlation在row。查询receipt时
读取同一transaction产生的row+accepted event。旧accepted event没有support时返回
`NONE`/legacy，不根据当前插件版本补写历史保证。

## Why no new recovery_support column

当前查询量小，accepted event已经是receipt的durable事实，同transaction落库；增加一列
只为避免一次event lookup，不能证明任何新语义。若未来Dispatch列表需要高频按support
过滤，可加derived index/read model；Preview不需要。

## Why not replace TEXT with Ref columns now

现有Ref包含type/provider/native_id/uri/metadata，展开需至少五列并迁移legacy raw strings。
Preview只有一个canonical locator，TEXT可无损保存versioned serialization，Core已经有Ref
constructor负责验证。等ADR-0003完整recovery成为产品承诺时，再评估normalized columns；
本轮拆表收益不足。

# Exact coordinator algorithm

以下是application/SDK伪代码；repository的freeze/request/accept/fail仍是Core命令。

```python
def dispatch_execution(execution_id, inputs, registry, idempotency_key):
    existing = repo.get_dispatch_by_key(idempotency_key)
    if existing is not None:
        # Important: no provider lookup, no contract lookup, no resolve.
        supplied_digest = digest(canonicalize_shape_only(inputs))
        validate_replay_identity(existing, execution_id, supplied_digest)
        return receipt_or_raise_from_durable_facts(existing)

    execution = repo.get_execution(execution_id)
    provider = registry.get(execution.provider_id)
    canonical = canonicalize_and_validate_registered_contracts(inputs, registry)
    validate_input_limits(provider, canonical)
    digest = inputs_digest(canonical)

    dispatch = core.freeze_and_request(
        execution_id, canonical, digest, idempotency_key
    )

    non_effectful, effectful = partition_by_resource_provider_declaration(canonical)

    try:
        early = resolve_and_typecheck(non_effectful)
        provider.preflight(ExecutionPreflightRequest(
            execution_id, dispatch.id, digest, canonical, early
        ))
    except Exception as exc:
        core.record_dispatch_failed(dispatch.id, bounded_error(exc))
        raise DispatchFailed(...) from exc

    try:
        late = resolve_and_typecheck(effectful)
    except Exception as exc:
        core.record_dispatch_failed(dispatch.id, bounded_error(exc))
        raise DispatchFailed(...) from exc

    start_request = ExecutionStartRequest(
        execution_id,
        dispatch.id,
        digest,
        merge_in_canonical_order(canonical, early, late),
    )

    try:
        start_receipt = provider.start(start_request)
        validate_start_receipt(provider, start_request, start_receipt)
    except ExecutionStartRejected as exc:
        core.record_dispatch_failed(dispatch.id, bounded_error(exc))
        raise DispatchFailed(...) from exc
    except BaseException as exc:
        # Catch Exception in real code; BaseException here only emphasizes
        # that no unknown failure is safe to classify as failed.
        core.record_dispatch_ambiguous(dispatch.id, bounded_error(exc))
        raise DispatchAmbiguous(...) from exc

    core.record_dispatch_accepted(dispatch.id, start_receipt)
    return core.get_dispatch_receipt(dispatch.id)
```

生产代码不应catch `KeyboardInterrupt/SystemExit` 为普通异常；伪代码的关键点只是未知
start failure不能写failed。

# Method-level file delta

## `work_core/registry.py` / public SDK DTOs

新增：

- `ResolvedExecutionInput`；
- `ExecutionPreflightRequest`；
- `RecoverySupport`；
- `ExecutionStartReceipt`；
- `DispatchReceipt`（也可放application DTO模块）；
- `ExecutionProvider.preflight` optional detection；
- ResourceProvider optional `effectful_contract_ids` convention。

修改 `ExecutionStartRequest`：canonical `resolved_inputs` + derived `inputs`。

严格分层建议：

- `ResolvedExecutionInput`、Preflight/Start request/receipt 属于public Provider SDK；
- `DispatchReceipt` 属于application read/command API；
- RecoverySupport既用于Provider receipt又用于UI，放public SDK；
-这些都不是domain models，不放`models.py`。

## `work_core/services.py`（过渡期）

在Application coordinator抽出前，可先原地修改以修正确性：

- existing dispatch branch移动到`registry.get()`和registered contract validation之前；
- replay canonicalizer只检查tuple/Ref形状并计算digest，不查provider/contract；
- accepted branch调用repository receipt reader，不再`_resolve_inputs()`；
- `_resolve_inputs()` 返回`tuple[ResolvedExecutionInput,...]`；
-按effect声明partition，early resolve -> preflight -> late resolve；
-start结果normalize/validate；
-unknown start exception走ambiguous，非failed；
-对外返回DispatchReceipt。

之后整个effect driver可机械搬到`application/dispatch.py`；先修行为再移动文件，降低回归
风险。

## `work_core/repository.py`

新增/修改：

- `record_dispatch_accepted(dispatch_id, ExecutionStartReceipt)`：序列化Ref、accepted event
  记录support/digest；
- `record_dispatch_ambiguous(dispatch_id, error)`：row保持requested，只append event并更新
  updated_at；
- `get_dispatch_receipt(dispatch_id)`：读取row与accepted event，解析new/legacy correlation；
- `record_dispatch_failed` 不变，但文档明确其不证明全部resource effect absence。

不新增repository入口允许requested重新start。

## `work_core/events.py`

新增 `EXECUTION_DISPATCH_AMBIGUOUS`。无migration。

## `work_core/errors.py`

新增：

- `ExecutionPreflightRejected`；
- `ExecutionStartRejected`；
-可选`InvalidStartReceipt`，服务层将其按ambiguous处理。

`ExecutionStartIndeterminate` 可以复用 `DispatchAmbiguous`，但Provider不应依赖Core service
error。建议在SDK中单独定义，Coordinator统一映射。

## Provider plugins

- Codex/Pi加side-effect-free preflight；
- start返回typed receipt；
- recovery level按真实restart E2E设置；
-现有handle仍可用于same-process controls；
-Provider observation使用`request.resolved_inputs`生成逐Ref observations。

# Core semantics versus outer-ring changes

## Core semantic changes

只有以下四条：

1. accepted Dispatch command replay不能产生任何external resolution/start side effect；
2. unknown start result不能记failed，必须保持requested/ambiguous；
3. accepted receipt的correlation/recovery claim必须被验证并原子记录；
4. ambiguous是material event，但不是新Dispatch terminal state。

## Application/SDK DTO and orchestration changes

- exact Ref/value envelope；
- derived grouped inputs；
- preflight request/method；
- ResourceProvider effect declaration；
- typed start/dispatch receipts；
- provider-specific recovery level；
-resolve partition/order；
-Host operation progress。

它们不改变Work/Execution/Binding/Ref/Observation ontology。

## Plugin-owned behavior

- driver conditional validation；
- durable start journal；
- native correlation encoding；
- observe/control recovery implementation；
-Console/Sandbox compatibility；
-cleanup/finish idempotency；
-resource read-back/evidence。

# Six required sequence simulations

## Sequence 1 — Successful Codex/Pi interactive Dispatch

示例inputs：Profile snapshot、Prompt artifact、Pi continuation（可选）为non-effectful；Git
Workspace与new tmux console为effectful。

```text
canonicalize + static limits
-> freeze/requested D1
-> resolve Profile/Prompt/Continuation
-> provider.preflight
     Codex: profile.driver==codex, continuation contract compatible
     Pi: selected model matches continuation.model
-> resolve Git Workspace (worktree add/validate)
-> resolve tmux (create/validate pane)
-> provider.start
     writes dispatch-keyed provider journal
     launches native Harness
     returns typed receipt
-> validate receipt
-> accepted transaction
```

预期：start一次；每个resolver一次；request envelope保留exact Ref；accepted事件记录support；
之后observe附SessionRef/RunRef和逐input observations。

当前代码变化：Codex/Pi的Profile/model/continuation checks从start前段提取到preflight；真正
launch仍只在start。

## Sequence 2 — Static rejection before freeze

例：缺少Workspace、unknown Contract、同Ref重复、Prompt超过maximum。

```text
canonicalize/limits -> ContractViolation
```

预期：

-无core_dispatches row；
-无frozen input；
-preflight/resolve/start调用数全0；
-用户可修正同一个Host draft；
-Core不新增event。

当前`test_dispatch_rejects_unknown_contract_or_provider_count_before_persisting`可保留并扩展
spy断言。

## Sequence 3 — Dynamic driver rejection before effectful materialization

Pi真实反例：Continuation model family 与configured Profile model不匹配。当前检查位于
`PiTmuxInteractiveExecutionProvider.start()`，而Git/tmux早已resolve。

新序列：

```text
freeze/requested D2
-> resolve ProfileRef + PiContinuationRef (non-effectful)
-> Pi.preflight detects model mismatch
-> failed D2
```

预期：

-Git worktree resolve count=0；
-tmux resolve/create count=0；
-Pi start count=0；
-Dispatch=failed，inputs保持frozen；
-用户更换Continuation/Profile需新Execution。

另一个例：remote SandboxRef + local tmux pane combination在preflight拒绝。

## Sequence 4 — Resolution failure

### Non-effectful failure

Profile snapshot digest变化/Artifact missing：

```text
freeze/requested
-> early resolve fails
-> failed
-> effectful resolve/start = 0
```

### Effectful failure

Git worktree path被不同commit占用或tmux exact pane identity漂移：

```text
preflight passes
-> effectful Git/tmux resolve raises
-> failed
-> start = 0
```

预期：failed只说明sequence失败；如果Git在失败前创建了部分worktree，Provider/Host可追加
ResourceObservation或cleanup，不自动retry。

当前`test_resolve_or_type_failure_records_failed_dispatch`保留，但拆early/late两个spy用例，
验证preflight顺序。

## Sequence 5 — Start ambiguous

Codex App Server反例：

```text
thread/start creates thread T
turn/start request reaches server
stdio/Host connection fails before typed receipt returns
```

或Pi：tmux launch成功，Provider在写/返回handle时异常。

新处理：

```text
start raises unknown/indeterminate
-> append ExecutionDispatchAmbiguous
-> row remains requested
-> caller receives DispatchAmbiguous
```

重放同一idempotency key：只看到requested并返回ambiguous；不resolve、不start。Provider若有
dispatch-keyed journal，可由独立`recover_start` Host control寻找T；没有则用户只能观察/
人工处理，不能blind retry。

当前行为会把所有异常记failed，必须反转相关测试并新增explicit
`ExecutionStartRejected`安全失败用例。

## Sequence 6 — Accepted replay and restart

```text
first call:
  resolver calls=each 1
  start calls=1
  D=accepted

same-process replay:
  read row+accepted event
  resolver calls unchanged
  start calls unchanged
  returns same DispatchReceipt

new CoreRepository/ExecutionService instance:
  same idempotency request
  no installed provider/resource providers required for receipt replay
  digest is shape-only recomputed from supplied exact Refs
  returns same DispatchReceipt
```

若receipt support：

- `NONE`：只显示historical accepted；不能control；
- `OBSERVE`：Host可另调provider recover/observe(correlation_ref)；
- `CONTROL`：Host可另调recover并幂等finish；
-legacy raw string：返回legacy locator，support=NONE。

accepted replay自身永远不执行recovery；command replay与operational recovery是两个API。

# Additional sequence — Crash before provider.start

```text
freeze/requested COMMIT
process crashes before early resolve/preflight/start
```

数据库与“start后、accepted前crash”相同：requested。系统无法证明call没有发生，因此重放
保守ambiguous。这会留下false-positive ambiguity，但不会生成第二native responsibility。

这是零schema最小方案的明确代价。要区分两者必须引入ADR-0002的starting claim；Preview
不为减少人工恢复而扩大state machine。

# Test plan by file

## `tests/test_work_core_input_dispatch.py`

新增/修改：

1. `test_accepted_replay_does_not_resolve_or_start`：CountingResourceProvider断言resolve仍1；
2. `test_accepted_replay_survives_missing_registry_components`：accepted replay不调用
   registry.get/provider type；
3. `test_resolved_input_envelope_preserves_exact_pairing_and_order`：两Prompt同Contract逐Ref
   对应；
4. `test_grouped_inputs_is_derived_and_cannot_diverge`；
5. `test_preflight_runs_after_pure_resolve_before_effectful_resolve`：trace严格为
   `pure.resolve, preflight, effect.resolve, start`；
6. `test_dynamic_rejection_skips_effectful_resolve_and_start`；
7. `test_explicit_start_rejection_records_failed`；
8. `test_unknown_start_exception_keeps_requested_and_records_ambiguous`；
9. `test_invalid_start_receipt_is_ambiguous_not_failed`；
10. `test_typed_correlation_and_support_round_trip`；
11. `test_legacy_correlation_reads_as_recovery_none`；
12. `test_requested_replay_calls_nothing`；
13. 更新旧“accepted returns receipt”断言为`DispatchReceipt`，删除对返回request.inputs的
    依赖。

## `tests/test_work_core_repository.py`

1. accepted row + support event同transaction；
2. correlation Ref metadata完整round-trip；
3. accepted event只写identity digest，不受Ref metadata总长影响；
4. ambiguous event不改变row.state；
5. duplicate ambiguous report幂等规则（建议按dispatch_id+error digest去重，或明确允许
   多次material events；Preview推荐相同摘要去重）。

## `tests/test_work_core_vertical_slice.py`

- continuation测试改从Provider捕获的start request检查derived inputs，而不是依赖service
  command返回start request；
-仍证明new Execution + previous SessionRef frozen input；
-增加accepted replay后first Execution/second Execution identity不变。

## `tests/test_work_core_resource_observation.py`

- Provider通过`ResolvedExecutionInput.ref`生成两条同Contract、不同Ref observation；
-证明exact association均可写，交叉映射被拒绝。

## `plugins/agent-box-pi/tests/`

- model mismatch在preflight拒绝；fake tmux controller launch/inspect均未调用；
-typed receipt exact dispatch/input digest；
-restart recovery level不得高于真实测试：当前durable start record存在，但finish submit flag
  尚未durable证明前最多`OBSERVE`。

## `plugins/agent-box-codex/tests/`

-App Server当前stdio handle无法跨Host恢复，receipt=`NONE`；
-tmux Provider若以dispatch marker重建pane/session observation，可声明`OBSERVE`；未验证
  idempotent finish前不得`CONTROL`；
-preflight不调用plan_builder、binary或tmux controller；
-SessionRef发现仍通过后续observation，不要求start receipt等于native SessionRef。

## `plugins/agent-box-tmux/tests/` and Git tests

-effect declaration准确；
-同一frozen Ref重复resolve不创建第二session/worktree；
-accepted replay由Core test证明完全不调用resolve；
-partial materialization cleanup仍是plugin test，不引入Core lease。

# Compatibility plan

## One release compatibility shim

```text
legacy ExecutionProvider without preflight
  -> no-op preflight; doctor WARNING

legacy start returns string
  -> accepted legacy correlation; RecoverySupport.NONE; doctor WARNING

legacy ResourceProvider without effectful_contract_ids
  -> treat every contract as effectful
```

这保证已安装插件不会立刻崩，但新官方Harness插件必须全部使用typed协议。下一次Plugin API
major bump删除string result；不同时维护两套长期语义。

## Existing call-site migration

当前脚本/tests若需要查看start request，应从fake Provider捕获`provider.started[-1]`；
application调用只使用DispatchReceipt。UI显示Binding从repository读取frozen refs，不从command
return的resolved values读取。

# Migration proof

本批**不需要SQL migration**：

- `core_dispatches.provider_correlation_ref TEXT` 可保存versioned Ref JSON；
- `state TEXT` 已支持requested/accepted/failed，不加状态；
- `core_events.type TEXT` 无CHECK，可新增ambiguous event；
- `data_json` 可保存support和digest；
-frozen input associations已完整保存Ref；
-ResourceObservation表不变。

唯一可能迫使migration的未来条件：

1. recovery support需要高频SQL过滤/索引；
2. canonical correlation变成多值；
3.完整ADR-0003要求数据库级CHECK保证started iff Ref persisted；
4.需要跨语言直接查询correlation Ref字段而不解析JSON。

这些都不是Preview当前需求，不能提前收税。

# Smaller alternatives considered

## Only fix accepted replay

最小代码量，但不解决exact Observation和start异常误记failed。官方多Harness/Sandbox组合仍会
在wrong Ref mapping和ambiguous start上失败。拒绝。

## Add `input_refs` parallel mapping only

少一个dataclass，却引入position alignment不变量和双份truth。比envelope更复杂。拒绝。

## Embed Ref in every Resource Contract

把Core identity泄漏进每个第三方value，并要求所有Contract重复实现。拒绝。

## Add `starting` state now

能减少requested false-positive ambiguity，并更接近ADR-0002；但会要求claim CAS、recovery
driver、no-side-effect disposition和migration/测试扩展。若Preview不承诺自动recovery，当前
requested保守状态已能防重复start。延期。

## Treat all resolve as effectful and preflight on Refs only

改动更小，但Pi continuation model、Profile driver等权威值无法在preflight读取，只能信Ref
metadata。可作为一周临时cut，不适合作为官方Harness SDK。采用optional effect declaration
更小且足够。

## Let `start()` do preflight internally

当前正是这种形态；Coordinator已经先resolve Git/tmux，太晚。拒绝。

## Store recovery support only in current Provider descriptor

插件升级后会重写历史承诺，无法审计。accepted event已有空间，零schema保存更正确。拒绝。

# Acceptance criteria

协议实现完成必须满足：

1. accepted、failed、requested三种重放均调用`resolve=0`、`start=0`；
2. accepted replay在Provider插件卸载/registry缺失时仍可返回durable receipt；
3.多个同Contract input的exact Ref/value pairing可由Provider直接枚举；
4. dynamic driver rejection发生在Git/tmux effectful resolve前；
5. unknown start exception不写failed；
6. malformed receipt不写accepted；
7. typed correlation Ref与recovery support重启后round-trip；
8. `OBSERVE/CONTROL`无correlation Ref无法构造/接受；
9. App Server provider不虚报restart control；
10. Pi/Codex-tmux只有通过真实restart test才可升support；
11.所有现有terminal/continuation/ResourceObservation不变量保持；
12.不新增SQL migration、Binding/Slot/Sandbox/Harness Core entity。

# Final recommendation

正式选择以下Preview Dispatch协议：

```text
shape/static validation
-> atomic frozen inputs + requested
-> non-effectful resolve
-> side-effect-free driver preflight
-> effectful deterministic resource materialization
-> one accountable provider.start
-> typed receipt
-> atomic accepted receipt
```

任何start未知失败：

```text
requested + ambiguous event
-> reconcile only
-> never blind redispatch
```

任何accepted replay：

```text
read row/event receipt
-> no registry/provider/resource call
```

它对当前Git/tmux现实不做虚假pure要求，对Codex/Pi增加了真正有价值的driver preflight，
保留exact Ref/value association，并诚实承认requested false-positive ambiguity。最重要的是，
它在不新增schema和Core ontology的前提下，让后续application拆分、官方Harness插件和未来
Sandbox vertical slice共享同一条安全Dispatch边界。
