# Architecture Redesign Round 2: Core Boundary Attack
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

日期：2026-08-28
输入：Round 1 synthesis、Core boundary、Plugin ecosystem、Web Host 三份报告
方法：不保护 Round 1 结论；以当前代码路径和可复现时序攻击候选架构。

# Attack verdict

候选架构没有被推翻，但它当前把最危险的问题描述成了“包边界整理”，而真实风险是
Dispatch side-effect protocol 尚未闭合。若现在直接实施“Host DispatchCoordinator + 一个
official interactive provider + future Sandbox adapter”，可能得到一个目录更整齐、崩溃
语义却更差的系统。

本轮最严重的发现：

1. **accepted Dispatch 的幂等重放会重新执行 ResourceProvider.resolve。** 当前代码只
   保证不重调 `provider.start()`，并不保证不重复资源副作用；未来云 Sandbox 会把这个
   缺口放大成重复创建/重复计费。
2. **start 成功与 accepted 入库之间存在不可消除的 crash window，而当前 accepted
   correlation 只是任意字符串，不是可验证、可恢复的 canonical Ref。** Host operation
   files 或单进程 lock 不能修复这个事实。
3. **“resolve 必须纯、operational effect 全进 start”不能作为通用规则。** 当前
   `WorkspaceV1` 要求一个已 materialize 的 path，`TmuxConsoleV1` 要求实际 session/pane
   identity；部分 Contract 的 resolve 天然需要 materialization。真正可守的线不是
   “resolve 无副作用”，而是“resolve 不得暗中创建 accountable native Execution，并且
   任何副作用必须 deterministic/idempotent/recoverable”。
4. `ResolvedExecutionInput` 的需求经攻击后仍成立，但 Round 1 的命名和兼容建议不够严：
   双轨保存 grouped values 与 envelopes 会制造两份可能冲突的输入真相。应只有一个
   canonical envelope tuple，grouped view 必须是派生属性。

结论是 **candidate survives with mandatory amendments**，不是“Core 冻结后直接迁目录”。
不需要新增 workflow/agent/sandbox Core ontology，但必须先修正 invocation/receipt/recovery
边界。

# Severity scale

| 等级 | 含义 |
| --- | --- |
| CRITICAL | 可重复 native side effect、产生两个责任事实或使历史宣称失真；迁移前必须修 |
| HIGH | 崩溃/并发下永久无法恢复、资源泄漏或错误终态；Preview 主路径前必须裁决 |
| MEDIUM | 组合不透明、错误 UX 或插件强耦合；可在受控 Preview 限制下延期 |
| LOW | 命名/包装问题，不改变责任或事实正确性 |

# Attack 1 — Host DispatchCoordinator can create split brain

## Candidate claim under attack

Round 1 建议：Core 拥有 freeze/requested/accepted/failed，Host application 的
`DispatchCoordinator` 查 registry、resolve inputs、调用 `ExecutionProvider.start()`，
并记录结果。

## Reproducible sequence

```text
Host A
  1. Core transaction: freeze inputs + Dispatch D state=requested COMMIT
  2. resolve workspace/profile/tmux
  3. provider.start(D) creates native run N
  4. provider returns correlation C
  5. process crashes before Core record accepted

Database after restart:
  D=requested
  correlation=NULL
  native N may be ACTIVE
```

然后 Host B 读取自己的 `host/operations/D.json`。可能的坏实现：

- operation file 写着 `starting`，Host B 猜测重调 start；
- operation file 尚未 flush，Host B 猜测步骤 2 未发生并重调 start；
- Core requested，被解释成“尚未调用 Provider”，重调 start。

任意一种都会把 Host 临时状态升级为 Dispatch truth，形成 split brain。

当前 `ExecutionService.dispatch_execution()` 在 existing requested 时抛
`DispatchAmbiguous`，这恰好是安全行为。迁到 Host 后若为了“恢复友好”绕开这条拒绝，
会倒退。

## Severity

**CRITICAL**，但不是“应用层存在”本身导致，而是 Coordinator 若拥有第二套 state
machine 才导致。

## Minimal correction

1. `DispatchCoordinator` 必须是无 durable lifecycle 的 effect driver；Host operation
   status只供 UX，永远不能授权 start/redelivery。
2. requested/side-effect-boundary/correlation 的安全决定只读 Core Dispatch facts。
3. Provider 只能通过 `recover_start(dispatch envelope)` 或 native same-key idempotency
   找回同一 N；不能 blind start。
4. 若 Preview 暂不实现 recovery，保持 `DispatchAmbiguous` 并要求人工处理，不能假装
   recovered。

## Does the attack defeat moving orchestration?

没有。它击败的是“把 state machine 一半搬到 Host”。外部调用可以位于 application
package，但所有 durable transition 和 redelivery authorization 必须仍由 Core控制。

# Attack 2 — Accepted replay repeats resource side effects

## Reproducible code path

当前 `services.py::dispatch_execution()`：

```python
existing = repository.get_dispatch_by_key(idempotency_key)
if existing["state"] == "accepted":
    frozen = repository.list_input_refs(execution_id)
    resolved = self._resolve_inputs(frozen, registry)  # called again
    return ExecutionStartRequest(..., resolved)
```

`_resolve_inputs()` 对每个 Ref 再调 `resource_provider.resolve()`。

当前真实 resolver 已经有副作用：

- `GitWorktreeResourceProvider.resolve()` 在不存在时执行 `git worktree add`；
- `TmuxConsoleResourceProvider.resolve()` 在不存在时执行 `tmux new-session` 和
  `split-window`。

复现时序：

```text
first call
  resolve count=1 -> materialize R1
  provider.start count=1
  D=accepted

same idempotency key replay
  provider.start count remains 1
  resolve count becomes 2 -> validate/recreate/materialize again
```

若 accepted 后用户删除 managed worktree，重放会重新创建它；若未来 Sandbox
`resolve()` 是 create API，则可能创建 S2 或产生第二次计费。即使实现恰好按 Ref 幂等，
accepted command reply 也不应依赖当前 profile/外部资源仍可解析：一个已接受的历史事实
不能因为 Profile 后来改变而“重放失败”。

## Severity

**CRITICAL**。这直接否定“accepted 重放已完全幂等”的广义表述。

## Minimal correction

- accepted 重放只返回持久的 `DispatchReceipt`，绝不 resolve、start 或重建 launch
  request；
- 查询 frozen inputs 使用独立 read API；
- runtime handle recovery 使用 `recover/observe`，不是重走 dispatch command；
- `dispatch_execution()` 的返回类型不能同时扮演“内部 start request”和“外部 command
  receipt”。

无需新表即可先修：现有 dispatch row 足以返回 id/state/inputs_digest/correlation text。
若要声称 durable recovery，则 correlation schema另见 Attack 3。

# Attack 3 — `accepted` does not mean recoverable acceptance

## Current mismatch

当前 schema/state 是：

```text
requested -> accepted | failed
provider_correlation_ref TEXT
```

`_provider_correlation()` 接受任意 string，或对象上任意
`provider_correlation_ref: str`。Core不验证：

- 它是否是 Ref；
- provider namespace 是否等于 accountable provider；
- 是否绑定 dispatch/input digest；
- Host restart 后能否 observe；
- 是否只是 tmux URI、PID、内存 handle 或短期 stdout pipe。

例如当前 Codex tmux provider 的 correlation 是 tmux URI，但 accountable provider 是
Codex；真正 Codex SessionRef 由异步 SessionStart hook 后来取得。Codex App Server
handle持有 stdio process/client，只存在于内存。`accepted` 因而只表示 `start()` 返回，
不表示可跨 Host restart重新取得同一次 native responsibility。

仓库 ADR-0002/0003 已设计 `requested -> starting -> started` 与 canonical correlation
Ref/recover_start，但 migration 006 将旧 started折叠为accepted，当前实现没有落地该
恢复保证。Round 1 的“freeze current Core semantics”若连这个缺口也冻结，就无法支撑Web
Host重启与桌面重连叙事。

## Reproducible sequence

```text
provider.start creates N and returns C
Core writes D=accepted, correlation_text=C
Host restarts
new provider instance has empty _handles
provider.observe(C) expects dispatch id or in-memory Handle
=> KeyError / cannot reconstruct stdio client
```

对于 tmux provider，Host control adapter可以重解 frozen inputs并构造部分 handle；对于
App Server stdio进程，没有通用恢复。插件级差异不能被一个 `accepted` 布尔值掩盖。

## Severity

**CRITICAL**，如果 Preview/产品声称 recoverable；若明确声明某 Provider restart 后
unrecoverable，则为 **HIGH** 产品限制。

## Minimal correction

有两个诚实选项：

### Preview-minimal option

- 将 accepted 文档语义限定为“start call returned and accountability was accepted in this
  Host lifetime”，不宣称 durable recovery；
- Provider descriptor明确 `recovery=unsupported|supported`；
- restart 后无法恢复的 accepted Execution显示 `freshness=UNREACHABLE/UNKNOWN`，不得
  restart；
- tmux/Pi等 Provider以dispatch-keyed durable start marker实现自己的 recover；
- Web Preview若必须演示restart，只选 recovery=supported provider。

### Production-correct option

落实 ADR-0002/0003 的最小 state/canonical correlation/recover_start 语义。它仍不新增
Sandbox/Harness ontology，但会修改 Dispatch schema和协议。

本轮不强行裁决二者；必须在“Web Preview是否承诺Host restart recovery”上显式选择。

# Attack 4 — Pure `resolve()` boundary is not implementable universally

## Counterexample A: Workspace

`WorkspaceV1` 字段是：

```text
path: absolute Path
source_digest
```

消费者要求拿到可用 cwd。对于 frozen Git commit，如果 worktree 尚不存在，某一层必须
执行 `git worktree add` 才能构造合法 `WorkspaceV1`。若 ResourceProvider.resolve 只能纯
validate：

- 要么 Host在freeze前创建worktree，导致尚未Dispatch就有execution-scoped副作用；
- 要么 ExecutionProvider import Git materializer，破坏provider-neutral消费；
- 要么改变 Workspace Contract 为 spec，所有现有consumer都要理解materialization。

## Counterexample B: new tmux console

`TmuxConsoleV1` 包含真实 session_id/pane_ids。Binding Ref是console spec；只有执行
`tmux new-session/split-window` 后才能返回这个 value。纯resolve同样不成立。已有 exact
pane的 validate可以近似纯，但“create new console”不行。

## Counterexample C: Sandbox

SandboxRef可能表示：

- 已存在 sandbox instance：resolve可只validate；
- image/template/policy：必须在Dispatch后create instance；
- remote task-taking sandbox：create可能已经接受agent responsibility，此时它甚至是
  ExecutionProvider。

一个固定“resolve pure”规则无法覆盖三类。

## Severity

**HIGH**。若硬推，会把Git/tmux/sandbox产品分支转移进Harness provider，得到更隐蔽的
耦合。

## Minimal correction

放弃“resolve必须无副作用”的绝对表述，改成可验证规则：

1. ResourceProvider.resolve可以 materialize **input resource**，但不能暗中创建另一
   Core Execution/Dispatch；
2. side-effectful resolve必须按 frozen Ref确定性寻址并且幂等，重复调用不得创建第二
   资源；
3. 远程/计费/长生命周期create必须拥有dispatch-scoped operation key、recover/cleanup，
   不满足则不得走 generic resolve；
4. accountable native task只能由 ExecutionProvider.start创建；
5. resolve产生的 native/materialization facts必须可由Host/Provider记录为observation；
6. accepted重放永不再次resolve（Attack 2）。

Preview 不要为此建立 generic ResourceLease Core entity。Git/tmux保留受控、确定性
materialization；未来Sandbox根据真实API选择provider-private operational adapter或独立
ExecutionProvider。

# Attack 5 — Is `ResolvedExecutionInput` actually necessary?

## Attempts to remove it

### Alternative 1: every Contract value embeds its source Ref

失败。它要求每个第三方Contract复制Core Ref字段，污染纯资源协议；同一value从不同
authority产生时还会把source identity变成value语义的一部分。

### Alternative 2: Provider queries CoreRepository using execution_id

失败。插件会依赖repository/schema；卸载、remote host和测试隔离变差；Provider还能读取
未授权的其他facts。

### Alternative 3: Host maps observations back by contract_id/digest

失败。多个同 Contract inputs时可能重复digest、不同Ref提供同value，且Host无权猜
provider具体比较逻辑。

### Alternative 4: parallel mappings

```python
values: Mapping[contract_id, tuple[value, ...]]
refs: Mapping[contract_id, tuple[Ref, ...]]
```

技术上可行但更脆弱：必须永久维护两个tuple的顺序等价；任何filter/group transform都会
静默错配。它比单个envelope更不最小。

## Attack result

攻击失败：保留Ref/value association是必要的。当前Core持久化exact association却在
handoff时丢失，是事实缺口。

## Remaining flaw in Round 1 proposal

Round 1建议“兼容一版 grouped inputs + resolved_inputs”。如果两者都作为dataclass字段，
就会出现冲突输入真相：

```text
resolved_inputs says Ref A -> value X
inputs grouped view says value Y
```

## Severity

缺失 envelope 是 **HIGH**（Evidence/operational routing错误）；双轨真相是
**MEDIUM**。

## Minimal correction

唯一 canonical storage：

```python
ResolvedInputEnvelope(contract_id, ref, value)
ExecutionStartRequest.resolved_inputs: tuple[...]
```

旧 `request.inputs` 只能是从 `resolved_inputs` 每次派生的只读 property，不能由调用者
单独传入。名称使用 `Envelope` 避免被误解为新的持久 ExecutionInput entity。

该类型放 public extension/application invocation API；不建表、不赋identity、不提供CRUD。

# Attack 6 — One accountable provider may hide independent failures

## Reproducible partial-start sequence

```text
InteractiveHarnessExecutionProvider.start(D)
  1. SandboxAdapter.create -> sandbox S ACTIVE, billing starts
  2. Workspace projection -> succeeds
  3. ConsoleAdapter.attach -> fails
  4. provider raises
  5. Core records Dispatch failed

External reality:
  S remains active and billable
  Core has D=failed, possibly no Sandbox native Ref
```

另一条：

```text
Sandbox launches Harness H
Console bridge fails after H starts
Provider raises -> D failed
H continues modifying workspace
```

一个aggregate provider若只返回最终异常，就隐藏了S/H的已发生事实。这里问题不是“必须
三个ExecutionProviders”，而是partial start没有receipt/compensation/evidence。

## Severity

**CRITICAL** 对远程/计费sandbox；本地tmux/bwrap为 **HIGH**。

## Minimal correction

1. provider在任何effect前完成所有可做的 compatibility/preflight；
2. 每个component operation使用dispatch_id派生的idempotency key；
3. 每完成一个material effect立即写provider-owned durable start journal；
4. 后续失败时best-effort compensate；
5. 无论compensation结果如何，recover/Host读取journal并附加Sandbox/Console/Harness native
   refs与observations；
6. Dispatch failed文案不能被解释为“没有side effects”；UI应显示possible/known leaked
   resources；
7. 若某个component需要独立objective、retry/outcome/SLA，由Host将其升级为独立
   Execution；否则仍是本次provider内部mechanism。

不需要 child Dispatch 或 ResourceLifecycle Core entity。Provider journal是plugin-owned；
material facts进入已有native refs/observations。

# Attack 7 — Accountability becomes fiction without a typed component protocol

## Failure mode

候选架构说ExecutionProvider“委托Sandbox/Console adapter”，但当前Plugin SDK只注册：

- frozen Contracts；
- ResourceProviders；
- ExecutionProviders。

没有operational adapter registry，`ExecutionStartRequest`也没有Ref。于是实际实现只能：

1. harnesses plugin直接import `agent_box_tmux`/某sandbox包；
2. 写`if sandbox.provider == ...`；
3. 把live controller塞进frozen Contract；
4. 让Host Broker调用sandbox并把结果塞回provider。

选项4最危险：若Host Broker真正启动Harness process，ExecutionProvider.start只剩wrapper，
“唯一accountable start入口”变成文档虚构。

## Severity

**HIGH**，但Sandbox尚未进入Preview时可以延期。

## Minimal correction

- 当前tmux允许明确的Python optional dependency；不要谎称已经通用；
- Harness provider必须是调用component adapter的一方，Host只做dependency injection，不替
  它执行launch sequence；
- 第一个真实Sandbox先使用provider-private adapter；第二个实现出现且字段重合后再抽
  plugin-level SPI；
- live controller不得进入Ref/Contract持久语义；
- Core不新增SandboxProvider类型。

# Attack 8 — Static input limits can freeze an invalid combination

## Reproducible sequence

一个provider支持Codex/OpenCode/Pi，静态limits取union：

```text
Profile=Pi
CodexContinuationRef=S_codex     # union mapping says optional/accepted
RemoteSandboxRef=S_remote
TmuxPaneRef=%2                   # both individually accepted
```

Core数量检查通过，inputs被freeze，requested Dispatch创建。只有start内部选择Pi driver后才
发现continuation不兼容，或remote sandbox不能bridge本地tmux。Dispatch failed；用户无法在
同一Execution修正Binding，必须新建Execution。

## Severity

**MEDIUM**。它不会破坏Core truth，但会制造大量本可在freeze前拒绝的失败Execution。

## Minimal correction

- Host adapter提供profile-specific compatibility preview；
- provider暴露side-effect-free `preflight(candidate exact inputs)` Host action；
- Freeze & Launch前Host必须运行同一provider validation library；
- `start()`仍必须重复验证，不能信UI；
- 不向Core增加conditional input DSL；若driver差异持续扩大，按责任/输入合同拆
  ExecutionProvider。

# Attack 9 — Finish is another duplicate side-effect window

## Current path

Web提案要求finish带HTTP idempotency key，但当前Provider finish幂等主要依赖内存字段：

```python
handle.submitted = True
```

Codex/Pi/tmux provider restart后重建handle时，这个位可能丢失。时序：

```text
1. Host calls finish
2. Provider captures transcript, stops/cleans pane or closes process
3. Host crashes before apply_observation terminal commit
4. Host restarts, Core still ACTIVE
5. user retries Finish
6. provider repeats cleanup/capture or cannot find native process
```

Core terminal sealing只能阻止第二个terminal projection写入；阻止不了第2次native cleanup、
artifact覆盖或丢失第一次evidence。

## Severity

**HIGH**。

## Minimal correction

- finish以dispatch_id为provider-native idempotency key；
- Provider在cleanup前写durable submit/finalize marker；
- artifacts采用content-addressed或write-once路径，不能覆盖第一次结果；
- retry先recover/observe marker，再补交Core observation，不重复native finish；
- Host operation idempotency只防HTTP重放，不能替代Provider finish幂等；
- 不新增Core FINALIZING phase，UI FINALIZING仍是Host状态。

# Attack 10 — Single Host lock is not a correctness boundary

## Reproducible paths

- Web Host持有`host.lock`，旧WorkBoard仍直接调用`ExecutionService`；
- stale PID判断错误，第二Host抢锁；
- 同一SQLite被另一个Python embedder直接使用；
- Provider action开始后Host进程失联，OS释放file lock，第二Host启动。

SQLite/unique Dispatch能阻止同Execution创建第二Dispatch，却不能阻止：

- accepted replay重新resolve（Attack 2）；
- finish/observe并发调用；
- requested ambiguity下错误start；
-两个Host对同一pane/session执行control action。

## Severity

**HIGH** during migration。

## Minimal correction

- Host lock是UX/operational guard，不写入Core语义；
- 所有mutating clients在serve运行时路由到它；旧直接路径只读或显式拒绝；
- Core CAS/idempotency/terminal seal仍是最后防线；
- Provider start/finish/recover自身按dispatch id幂等；
- 不以“只有一个进程”作为任何安全证明。

# Attack 11 — Resource resolution order leaks hidden semantics

## Current code path

`_resolve_inputs()`按canonical `(contract_id, Ref identity)`顺序逐个调用providers。该顺序
本来只是digest规范化，却意外变成materialization顺序。若三项都有副作用：

```text
contract A workspace -> creates worktree
contract B sandbox   -> creates remote sandbox
contract C console   -> fails validation
```

则一个字典/contract ID命名变化都可能改变外部资源创建顺序和泄漏面。Core的canonical
排序不应成为operational plan。

## Severity

**HIGH** for effectful providers，当前local resources为 **MEDIUM**。

## Minimal correction

- canonical input order只用于digest与envelope稳定性；
- effectful materialization顺序由accountable ExecutionProvider的显式internal launch plan
  决定；
- Coordinator可pure-validate所有inputs，但不能按contract字母序执行异构create；
- 对仍在resolve中materialize的legacy providers，要求deterministic/idempotent，并明确
  它们是迁移例外；
- 不把launch order持久化为Core workflow。

# Attack 12 — Failed Dispatch is not proof of no side effect

## Current path

`dispatch_execution()` 捕获任何 resolve/start exception，立即
`record_dispatch_failed(error)`。同一个failed状态覆盖：

- unknown Contract type前置错误（通常freeze前已挡）；
- Profile drift（无native effect）；
- worktree已创建后下一个resolve失败；
- native Harness已启动但Provider在构造handle/return时异常；
-network timeout after remote create。

UI若把 failed渲染为“没有启动”，就是虚假叙事。

## Severity

**CRITICAL** for evidence honesty。

## Minimal correction

不必立刻增加Dispatch状态枚举，但必须：

- 文档/UI把failed定义为“governed dispatch sequence failed”，不推断side-effect absence；
- Provider/Host在可观察时追加native refs和ResourceObservations，即使Dispatch failed；
- error artifact可说明最后完成stage和compensation；
-只有provider contract给出`no_side_effect`证据时才允许安全redelivery；当前Preview保守地不
  redeliver同一Execution。

# Attack matrix

| # | Attack | Severity | Candidate survives? | Required before |
| ---: | --- | --- | --- | --- |
| 1 | Host/Core split-brain state machine | CRITICAL | Yes, if Host is stateless driver | application extraction |
| 2 | accepted replay re-resolves effects | CRITICAL | Yes, direct fix | any Sandbox / Web retry |
| 3 | accepted correlation not durable | CRITICAL/HIGH | Only with explicit recovery tier | restart claim |
| 4 | pure resolve impossible | HIGH | Yes, revise absolute rule | provider migration |
| 5 | Ref/value envelope necessity | HIGH | Yes; proposal survives attack | Evidence/plugin composition |
| 6 | aggregate partial-start leakage | CRITICAL | Yes, provider journal/compensation | remote Sandbox |
| 7 | missing operational adapter protocol | HIGH | Yes, defer generic SPI | second Sandbox |
| 8 | static input limits invalid bundle | MEDIUM | Yes, Host preflight | multi-driver UX |
| 9 | duplicate Finish window | HIGH | Yes, Provider idempotency | mutating Web controls |
| 10 | Host lock false safety | HIGH | Yes, route mutations + Core/Provider guards | dual-client migration |
| 11 | canonical order becomes launch order | HIGH | Yes, explicit internal launch plan | effectful resource composition |
| 12 | failed mistaken for no side effect | CRITICAL | Yes, semantics/evidence correction | truthful Preview UI |

# Revised minimal architecture after attack

```text
Clients
  -> one Host application facade
       -> Core Dispatch commands (only durable state authority)
       -> stateless Dispatch effect driver
            -> pure/deterministic input validation
            -> one accountable ExecutionProvider.start
                 -> explicit internal launch plan
                 -> provider-private Console/Sandbox adapters
                 -> durable provider start journal
       -> Core accepted/failed + native refs/observations
```

关键修订：

1. Core/application invocation DTO使用一个canonical
   `ResolvedInputEnvelope(contract_id, ref, value)` tuple；grouped values仅为派生视图。
2. accepted dispatch replay返回`DispatchReceipt`，不resolve、不start。
3. Host operation state永远不授权start/finish retry。
4. Resource resolve不强求绝对pure；但side-effectful resolve必须deterministic、按Ref幂等，
   且不得创建accountable native task。
5. ExecutionProvider在start内部拥有显式component order、journal、compensation和aggregate
   evidence。
6. Sandbox通用SPI继续延期；第一个实现provider-private，第二个实现再抽象。
7. 对recovery承诺必须二选一：Preview明确unsupported，或落实canonical correlation/
   recover_start；不能用accepted字符串冒充durable recovery。

# Minimal correction set

## P0 before application/Web mutations

1. 修accepted replay：返回持久receipt，不再resolve；
2. 定义canonical `ResolvedInputEnvelope` 与derived grouped view；
3. 定义typed `DispatchReceipt`/`ExecutionStartReceipt` 最小语义；
4. 定义failed不证明no-side-effect，并让failed execution仍可追加facts；
5. Provider finish按dispatch id实现durable idempotency；
6. application coordinator禁止使用Host operation state决定redelivery；
7. 迁移期间serve存在时其他mutating client必须路由或拒绝。

## P0 only if restart recovery is a Preview claim

1. canonical correlation Ref；
2. provider recovery capability；
3. `recover_start` 的 correlated/no-side-effect/indeterminate disposition；
4. correlation + durable accepted/started transition的原子写入；
5. 至少一个真实Provider restart E2E。

## P1 before a remote/paid Sandbox

1. dispatch-keyed sandbox create；
2. provider-owned start journal和cleanup recovery；
3. partial-start native refs/observations；
4. Sandbox × Console compatibility tests；
5. 明确区分resource sandbox和task-taking ExecutionProvider。

# What this round rejects

- 拒绝把Host operation JSON当作第二Dispatch ledger；
- 拒绝在accepted replay中重建resolved launch request；
- 拒绝用file lock代替Core/Provider幂等；
- 拒绝绝对“resolve无副作用”口号；
- 拒绝把live launcher/controller塞进frozen Contract；
- 拒绝为partial start新增child Dispatch或ResourceLifecycle Core entity；
- 拒绝让Host SandboxBroker真正承担Harness launch后仍声称ExecutionProvider是唯一入口；
- 拒绝将failed解释为“nothing ran”；
- 拒绝为了multi-driver条件输入向Core加入DSL；
- 拒绝在只有一个Sandbox实现时制定行业通用SPI。

# Final adversarial verdict

**不重开 Core ontology，但暂停目录级重构，先修 Dispatch invocation/replay/recovery
protocol。**

最能推翻候选架构的不是“一个Harness插件是否太大”，而是以下问题：

> 在任意Host crash点，数据库能否阻止第二次native side effect，并能否诚实说明第一次
> side effect是否已经发生？

当前答案：

- 对第二次 `ExecutionProvider.start()`：existing requested会保守拒绝，基本安全；
- 对第二次 `ResourceProvider.resolve()`：accepted replay会再次执行，尚不安全；
- 对start后、accepted前：能阻止blind retry，但可能永久ambiguous；
- 对accepted后Host restart：不同Provider恢复能力不一致，accepted text correlation不足；
- 对Finish：Provider内存幂等不足以覆盖restart。

因此候选架构只有在以下三条成为硬门槛后才可进入实施：

1. accepted/failed/requested命令重放不产生未授权side effect；
2. exact Ref/value association完整穿过handoff；
3. recovery能力按Provider诚实分级，任何durable claim都由真实restart E2E证明。

满足后，Core、Host、官方Harness插件和未来Sandbox资源的边界仍然成立；不满足时，Web
和插件拆分只是在不可靠Dispatch之上增加更多调用者。
