# Agent-Box Execution Binding / Governed Handoff 真实 Provider 强验证报告
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 文档导航：[总目录](../README.md)

验证日期：2026-08-22
分支：`spike/real-governed-binding`
Spike：`spikes/real_governed_binding/`
最终证据运行：`20260822T050022Z-355af131`

# Verdict

**C. REAL PROVIDERS VALIDATE MODEL**

# One-sentence judgment

真实 Git、真实 Codex CLI、真实本地进程和 Git 原子 CAS 证明 Execution Binding 能形成机器可强制、可验证、可审计的 execution contract；但 Codex required-input evidence 仅为 2/3，undeclared-input coverage 不完整，因此尚不具备冻结 production contract 的证据强度。

# Real systems used

本轮没有使用 Fake Authority 或 Fake Provider 作为正面证据，实际使用了：

- Git CLI 与真实 object database；
- Git detached worktree；
- Git `update-ref <ref> <new> <expected-old>` 原子 compare-and-set；
- Agent-Box 现有 `CodexExecutionProvider`、profile isolation、`CodexLaunchFacade` 与 Codex JSONL parser；
- 真实 Codex CLI，会话 `01a027d7-6599-7380-aff3-fd9c605bfc79`；
- 真实 POSIX 子进程；
- SQLite transaction、unique constraint 和 CAS-style dispatch claim；
- 文件系统真实 bytes 与 SHA-256。

由于当前 Codex 工具沙箱将 `~/.agent-box/profiles/codex-main` 映射为只读，沙箱内首次运行被 Codex 原生 session-store 初始化明确拒绝。最终真实 Codex 实验由用户在正常终端执行同一 Spike；没有改变实验代码、Binding 或预期结果。

# Enforcement evidence

## Git exact pin

Binding 固定 commit B：

```text
expected B = b48d78ebf0151bd80e275c5eb0ac472f34c8cf0f
main HEAD   = 4c7933f3d1b543b839d0dadba8252894179aad51
actual HEAD = b48d78ebf0151bd80e275c5eb0ac472f34c8cf0f
```

Provider 没有把 B 写进 prompt 后相信执行者，而是执行：

```text
git worktree add --detach <worktree> <frozen-commit>
git -C <worktree> rev-parse HEAD
```

只有真实 HEAD 等于 frozen pin 才形成 `consumed + match` fact。main 已经移动不影响 exact B；B 仍在 object database 中，因此 Validation 为 `valid`，Execution 为 `succeeded`，Binding conformance 为 `conformant`。

## Codex workspace exact pin

Execution A 的 frozen workspace pin 与真实启动前 HEAD 完全相同：

```text
expected = 0429f1baa38fc1b840381de0c1d78524e0bc08a4
actual   = 0429f1baa38fc1b840381de0c1d78524e0bc08a4
```

Codex 被启动在该 exact commit 的 detached worktree 中，而不是被提示“请使用这个 commit”。JSONL 原生事件包含 `thread.started`、`turn.started`、`turn.completed`，CLI return code 为 0。

Codex 没有自行 commit，因此 Provider adapter 在隔离 worktree 中对实际 workspace result 创建受控 commit：

```text
output commit = ec224152159753a57da7fd73f26b03755178d50e
output tree   = c7e34b01daa8d84f1a3e44d3428815d57b5f0fda
```

该 commit 只包含：

```text
app.py          | 2 +-
test-report.txt | 1 +
```

受控 commit 是 output pin 的生成机制，不冒充 Codex 原生 commit。它的 provenance 必须在正式 adapter 中明确标为 Provider post-processing。

## Exact instruction bytes

Instruction Artifact 在构造 Codex native request 前读取一次并验证 SHA-256；native request 使用的是已经验证过的 bytes，而不是再次按路径读取：

```text
sha256:034eb3e0da123021a2bda581b1350cbb10832769b45d3d7f6d78563e07c663fb
```

这证明“精确 bytes 被交给 Provider request”，但不证明语言模型在语义上注意或遵循了 prompt 的每个部分。该 assurance 低于 Git HEAD 的 native-state evidence。

# Conditional-use evidence

本轮使用 Git ref 作为真实 mutable external object。

1. preflight 观察 ref 为 P；
2. validation 后外部 actor 将 ref 从 P 改为 Q；
3. Provider 尝试以 P 为 precondition 原子更新到 R；
4. Git 原生 API 拒绝操作，ref 最终仍为 Q。

实际证据：

```text
P / expected-old = b48d78ebf0151bd80e275c5eb0ac472f34c8cf0f
Q / current      = be399067f5afa2113b5bafbc2e8b232917154648
R / requested    = 4c7933f3d1b543b839d0dadba8252894179aad51
return code      = 128
final ref        = be399067f5afa2113b5bafbc2e8b232917154648
```

Git 的错误明确指出 current Q 与 expected P 不同。这里不是“执行前再 observe 一次”，而是 compare 与 side effect 在同一个 Git native atomic operation 中完成。因此 TOCTOU guard 真实成立。

限制：该实验验证了统一模型可承载原生 precondition，但没有证明 Kubernetes UID/resourceVersion、Vault lease 或真实 deployment API 的具体 adapter。进入 D 前仍应再做一次非 Git mutable system 实验。

# Consumption evidence

## Codex Execution A

三个 required slots：

| Slot | Evidence | Result | Assurance |
|---|---|---|---|
| `workspace.primary` | detached worktree + native `rev-parse HEAD` | consumed + match | native state observed |
| `instruction.primary` | verified bytes used to construct native request | consumed + match | Provider-boundary proof |
| `config.primary` | Codex 没有暴露实际 config consumption | unknown | unverifiable |

Execution A：

```text
outcome     = succeeded
conformance = unknown
```

这个结果不是失败：它证明了 `Execution succeeded != Binding conformant`。系统没有因为 Codex 成功退出就猜测 config 已被消费。

## Independent Execution B

Execution B 使用真实 local-process Provider，不 resume A 的 Codex session：

| Slot | Expected | Actual | Result |
|---|---|---|---|
| workspace | `ec224152…` | `ec224152…` | consumed + match |
| test report | `sha256:270016…` | `sha256:270016…` | consumed + match |
| config | `sha256:ac1ba0…` | `sha256:ac1ba0…` | consumed + match |

B 的真实业务进程 return code 为 0，Execution outcome 为 `succeeded`，Binding conformance 为 `conformant`。

# Completeness score

required-slot evidence：

| Provider | Verified | Not consumed detected | Unknown | Score |
|---|---:|---:|---:|---:|
| Git exact/process | 3 | 0 | 0 | 3/3 = 100% |
| Codex CLI A | 2 | 0 | 1 | 2/3 = 66.7% |
| Independent local process B | 3 | 0 | 0 | 3/3 = 100% |
| Deliberate omission experiment | 2 | 1 | 0 | 3/3 dispositions known |

正常 A→B 路径合计 6 个 required slots，其中 5 个 verified、1 个 unknown：verified ratio 为 **83.3%**，unknown ratio 为 **16.7%**。

但 provider-level 结论必须分开看：Codex 本身为 66.7%，并使整次 Codex conformance 保持 `unknown`。不能用 B 的强 evidence 掩盖 A 的缺口。

# Cross-execution handoff

Execution A 产生两个 actual output facts：

```text
WorkspaceRef @ git.commit ec224152159753a57da7fd73f26b03755178d50e
ArtifactRef  @ sha256 2700165975f68815c97d605c56eca8e90d497ade1264b6282401d13fee99ac27
```

`output_candidates(work_id)` 直接从 actual output facts 派生两个候选；Execution B 通过 `carry_forward_output` 自动获得 Ref、authority 和 exact pin。B 是独立 Provider/Execution，没有 resume A 的 SessionRef。

查询结果：

```text
consumers_of_output(A) = {B}
upstream_executions(B) = {A}
```

这两个关系均由 A output facts 与 B actual input facts 的 Ref + pin 等值连接派生，没有 Contribution entity，也没有人工 contribution edge。

# Divergence test

Binding 固定 D，真实 Provider 故意 checkout E，并执行一个 return code 0 的真实子进程：

```text
expected pin = 4c7933f3d1b543b839d0dadba8252894179aad51
actual pin   = 305883e7b4a9abcb99b15150251ef61eecccf4bf
process rc   = 0
outcome      = succeeded
conformance  = divergent
```

Binding 未被修改，actual E 永久写入 `ExecutionResourceFact`，Execution outcome 没有被强制改为 failed。requested/frozen、actual 和 outcome 三者保持分离。

# Crash/restart

本轮在真实 local-process path 中覆盖三个窗口。

## Accepted Binding + dispatch transaction 后 crash

新 Runtime 从 SQLite current-state tables 恢复，不 replay EventLedger。第一次 claim 得到 `start`。

## Provider 已启动、native ref 尚未持久化时 crash

真实进程先持久写入包含 `dispatch_id + PID` 的 Provider correlation marker；此时 DB dispatch 为：

```text
state = starting
provider_correlation_ref = NULL
```

再次 restart 后 `claim_provider_start` 返回 `observe`，没有 blind redispatch。Runtime 从 Provider marker 恢复 PID 并将 dispatch 更新为 `started`。

## Consumption facts 部分写入时 crash

先写 1/3 fact，重建 Runtime 后回填完整 3 facts，再重复回填一次。最终 facts 恰好为 3，不是 7。material events 中：

```text
BindingFrozen               = 1
BindingValidationCompleted  = 1
BindingAcceptedForDispatch  = 1
```

恢复依赖普通 SQLite transaction、unique idempotency key、dispatch claim 状态与 Provider correlation，不依赖 event replay 或 workflow engine。

# Automation burden

正常 A→B handoff 的实际人工字段统计：

| Manual input | Count |
|---|---:|
| Execution purpose | 1 |
| Candidate choice | 0（候选无歧义） |
| Approval | 0（本实验不要求） |
| Ref | 0 |
| Authority | 0 |
| Selector | 0 |
| Pin | 0 |
| Slot | 0 |
| Validation row | 0 |
| Rebind | 0 |
| Contribution edge | 0 |

初次 Execution A 仍需要用户提供任务目的/指令；workspace discovery、authority routing 和 pin resolution 由 adapter 完成。Spike 证明自动化路径可行，但当前 production 产品尚未实现这些 adapter conventions 的 UX。因此结论是“模型不要求高人工成本”，不是“产品自动化已经完成”。

# Provider Evidence Matrix

| Provider / Resource | Exact pin enforceable? | Conditional-use? | Actual input observable? | Actual pin observable? | Required-slot completeness | Undeclared-input completeness | Evidence assurance | Failure mode |
|---|---|---|---|---|---|---|---|---|
| Git / WorkspaceRef | Yes：detached worktree at commit | Yes：`update-ref` CAS for Git ref mutation | Yes：native HEAD | Yes：commit SHA | 1/1 | N/A for declared Git object | Native, high | missing commit blocks materialization；stale CAS rejects side effect |
| Codex CLI / WorkspaceRef | Yes：wrapper materializes exact worktree before launch | No generic Codex mutable-resource precondition | Yes at workspace boundary | Yes：pre/post native HEAD | workspace 1/1 | Incomplete | Native + wrapper, high for base commit | profile/session store unavailable；CLI failure；agent may access unobserved files |
| Codex CLI / Instruction Artifact | Yes for exact request bytes | No | Yes at native request boundary | Yes：SHA-256 | instruction 1/1 | Incomplete | Provider-boundary, medium | digest change rejects launch；semantic attention not provable |
| Codex CLI / Config | Validation yes；actual use not enforceable/provable | No | No | No | 0/1, unknown | Incomplete | Unknown | Codex API exposes no consumption proof |
| Local process / Git + file inputs | Yes：detached worktree + verified bytes | Yes when adapter invokes native Git CAS | Yes for instrumented governed inputs | Yes | 3/3 | Incomplete without syscall audit | Native/wrapper, high for declared inputs | digest mismatch rejects launch；omission recorded；arbitrary OS reads may escape observation |
| SQLite dispatch/facts | N/A | Transaction/CAS admission | Yes for persisted facts | Yes | Idempotent recovery | N/A | DB constraints | process correlation must be recoverable; otherwise observe/unknown, never blind redispatch |

# Mutation ledger

| Scenario / problem | Required change | Classification | Domain model change? |
|---|---|---|---|
| Git exact commit must be enforced | detached-worktree launch adapter + native HEAD evidence | implementation only | No |
| Moving selector C→D | real Git Authority observation + existing rebind | implementation only | No |
| File input must use exact bytes | read once, hash, construct request from verified bytes | implementation only | No |
| Provider capabilities differ | expose enforcement/evidence capability per ref type | interface capability | No |
| Real TOCTOU | Authority/adapter must expose native guarded action such as Git CAS | interface capability | No |
| Codex does not commit output | controlled Provider post-processing commit with explicit provenance | implementation only / field clarification | No |
| Codex config consumption unavailable | record unknown; optionally block `required_assurance=enforced` | boundary limitation | No |
| Undeclared file reads not globally observable | report coverage incomplete; do not infer absence | boundary limitation | No |
| Process started before native ref DB write | durable `dispatch_id` correlation and observe-on-restart | interface capability | No |
| Contribution query | join actual output/input facts by Ref + exact pin | derived view | No |
| Normal handoff ergonomics | candidate discovery/routing/rebind automation | product limitation | No |

没有出现 `MODEL EXPANSION REQUIRED`。

# First-class entity delta

**0**

没有新增 Dependency、Handoff、Manifest、InputSnapshot、ResourceVersion、Contribution、ResourceState、Policy 或其他一级领域实体。

新增代码全部属于：

- Authority adapter；
- Execution Provider wrapper；
- evidence DTO；
- 实验 orchestration；
- derived query；
- test helper。

# Boundary violations

| Boundary | Violation? | Reason |
|---|---|---|
| Workflow | No | A→B 由测试代码顺序创建；Binding 不决定下一次何时运行 |
| Scheduler / retry | No | 没有 queue、timer、retry state machine |
| Resource lifecycle | No | Git/file/Codex 资源由原生系统拥有；Core 只存 Ref、pin、evidence |
| RBAC / policy engine | No | 本轮没有扩展 approval；`undeclared_input_mode` 仍是三值字段 |
| Artifact store | No | Core 不保存 artifact bytes；仅保存路径 Ref 与 digest |
| Telemetry/log store | No | Codex JSONL 留在 Provider diagnostics；Core 只存 material facts |

受控 output commit 是 Provider adapter 的输出归一化，不是 Core 接管 Git lifecycle。Git CAS 是 Authority/native operation，不是 Core 管理 ref lifecycle。

# Provider-specific leakage

Core 中新增 provider-specific branch：**0**。

Git、Codex 和 local process 的差异全部留在 adapter capability 与 evidence 生成中。Core 只处理：

- frozen BoundRef；
- Validation verdict；
- accepted binding；
- actual fact；
- conformance derivation。

不存在 `if provider == codex` 或 `if provider == ci`。

# Unknown-rate assessment

required-input unknown：

- Codex：1/3，33.3%；
- local process：0/3，0%；
- 正常 A→B 总体：1/6，16.7%。

undeclared-input completeness：

- Codex：不完整；
- local process：没有 syscall audit 时不完整；
- deliberate extra read：Provider instrumentation 能记录 `undeclared`，但不能由此推断“没有其他 undeclared inputs”。

因此不能声称系统具有 hermetic execution。Binding 可以准确表达 evidence coverage 和 unknown，但无法凭模型本身制造 Provider 没有提供的事实。

# Contribution result

PASS。

Contribution 链可由以下 current/evidence rows 派生：

```text
A ExecutionResourceFact(direction=output, Ref=X, pin=P)
JOIN
B ExecutionResourceFact(direction=input, disposition=consumed, Ref=X, pin=P)
```

本轮真实查询同时得到 A→B consumers 和 B→A upstream。无需新增 Contribution entity，也无需人工维护 contribution edge。

# Kill criteria check

| Kill criterion | Result | Evidence |
|---|---|---|
| A. Provider 只能通过 prompt 接收 pin | PASS / not triggered | Git/Codex workspace 均由 detached worktree 机器强制 |
| B. actual facts 大量 unknown，导致多数 Execution unknown | PASS with Codex warning | 总体 1/6 unknown；但 Codex 每次含不可证 config 时 conformance 会 unknown |
| C. A→B 需要大量手填 Ref/slot/pin | PASS / not triggered | handoff pin、authority、slot、edge 均为 0 manual |
| D. Core 出现 provider-specific branch | PASS / not triggered | adapter-only differences |
| E. 真实 API 差异要求多个一级对象 | PASS / not triggered | entity delta 0 |
| F. conditional-use 只能 validate 后相信未变化 | PASS / not triggered | Git atomic CAS 真实拒绝 stale operation |
| G. Contribution 只能人工声明 | PASS / not triggered | actual output/input facts 自动 join |

需要保留的黄色警告：若 Agent-Box 的核心产品路径只使用当前 Codex evidence contract，并把不可证明的 config 设为 required，则这些 Codex Execution 的 conformance 会长期为 unknown。这是 Provider/product limitation，不应用新增领域对象掩盖。

# Final model delta

相对上一轮，领域对象与状态语义没有变化：

```text
Work
Execution
Ref
ExecutionBinding
BindingSlot
BoundRef
BindingValidation
ApprovalDecision
ExecutionResourceFact
RefAuthority
ExecutionProvider
EventLedger
```

`undeclared_input_mode = allow | forbid | unknown` 保持不变，没有演化为 DSL。

只建议收紧两个 extension interface capability：

1. `RefAuthority`/resource adapter 应声明并实现它能提供的 native enforcement：immutable address、conditional use 或 observe only；conditional use 必须返回 native operation evidence。
2. `ExecutionProvider` 应声明 actual-evidence coverage：哪些 required ref type 能报告 consumed/not_consumed/unknown、actual pin assurance，以及 undeclared-input coverage 是否 complete。

这些是 capability/response contract，不是新的领域实体或状态机。Core admission 在 `required_assurance=enforced` 下可以依据能力拒绝弱 Provider；它不负责让弱 Provider 变强。

# Freeze recommendation

**One more spike**

可以冻结领域模型的核心分离原则，但暂不冻结完整 production extension contract。下一轮只应验证两个边界，不再扩 ontology：

1. 在非 Git mutable system 上验证一次原生 conditional-use，例如已有 Kubernetes cluster 的 UID/resourceVersion precondition，或真实 deployment API 的 generation CAS；
2. 为 Codex 或另一 autonomous-agent Provider 实现/验证明确的 consumption evidence capability contract，目标是 required slots 不因普通 config 输入而长期 unknown，并量化 undeclared-input coverage。

如果第二点仍只能依赖 prompt/self-report，应将 Governed Binding 定位为 Git/CI/deployment 等可执行强约束 Provider 的内部机制，而不是宣称对所有 agent execution 都能提供强 conformance。

# Final conclusion

模型没有被现实击穿：Binding 不是 Ref list、manifest 或 prompt context。它确实在 Git checkout、Git atomic CAS、进程 request construction、actual native-state capture、crash recovery 和跨 Execution fact join 上形成了可执行合同。

现实同时给出了清晰上限：合同强度由 Authority/Provider 的 native enforcement 与 evidence 决定。Core 可以保存 `unknown`、阻止高 assurance dispatch、记录 divergence，但不能替 Provider 证明它无法观察的消费。因此本轮支持 **C. REAL PROVIDERS VALIDATE MODEL**，不支持 **D. CONTRACT READY TO FREEZE**。
