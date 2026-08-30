# Agent-Box Execution Binding / Governed Handoff 流程压力验证
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 文档导航：[总目录](../README.md)

> 验证日期：2026-08-22
> 分支：`spike/execution-binding-flow-stress`
> 实现位置：`spikes/binding_flow_stress/`
> Production Work Core 修改：0

## Verdict

**C. MODEL SURVIVES WITH MINOR CHANGES**

模型承受了外部资源变化、Authority 不稳定、approval 变化、TOCTOU、实际消费偏离、部分消费、弱证据 Provider、secret rotate、实例替换、artifact supersession、多 revision、dispatch 后错误、七个 crash 点、四类并发、三类 Provider、无 AI、无 Workflow、贡献链和自动化负担测试。

结果没有要求新增一级领域对象，也没有要求 workflow、scheduler、resource lifecycle、RBAC、artifact store、telemetry store 或 provider-specific Core 分支。

不能判为 D 的原因有两个：

1. 额外输入的治理需要给 Binding 增加一个有限三值字段 `undeclared_input_mode = allow | forbid | unknown`。
2. TOCTOU 是否真正安全依赖资源原生 API 能否执行 exact address 或原子 conditional-use；本 Spike 只用 Fake Environment Authority 证明了协议形状，没有证明真实 staging/deployment API。

此外，真实 Codex/CI 的 consumption completeness 尚未验证。模型能诚实表达 `unknown`，但产品价值仍取决于真实 Provider 能否避免大量 unknown。

## Test evidence

```text
python3 -m pytest -q spikes/binding_flow_stress/tests
............................
28 passed
```

Spike 使用：

- SQLite current/evidence tables；
- 真实临时 Git repository 和 `GitAuthority`；
- Fake Artifact、Environment、Secret Authorities；
- shell-like、Codex-like、CI-like Provider adapter；
- `BEGIN IMMEDIATE`、Execution version CAS、unique idempotency key；
- derived candidate/contribution queries。

测试 EventLedger 只记录 material facts，恢复不 replay EventLedger。

## Stress summary

| # | 场景 | 结果 | 压力下的实际语义 |
|---:|---|---|---|
| 0 | 基准 A → B handoff | PASS | A 的 versioned outputs 成为 B 的 candidate；B slots 由 Authority 固定 pin |
| 1 | main C→D、environment 12→13 | PASS | B1 不变；current selectors invalid；exact artifact R valid；B2 仅替换变化 slots |
| 1a | architecture v3 superseded、benchmark v2 production-ineligible | PASS | 二者不在 B1，不能污染 B1；若成为 production slot，由 Authority 返回 purpose invalid |
| 1b | exact C 与 current-head(main) | PASS | exact C 仍存在则 valid；current-head 观察到 D 则 invalid |
| 2 | EnvironmentAuthority unreachable | PASS | resource truth unknown；admission blocked |
| 2a | ArtifactAuthority stale evidence | PASS | resource truth 可为 valid，但 freshness stale；admission blocked |
| 2b | ApprovalVerifier timeout | PASS | approval check unknown；不增加 failure 状态机 |
| 3 | binding-level approval 后 environment 再变化 | PASS | 必须 B3；旧 binding digest approval 不适用 |
| 3a | slot-level approval | PASS | 未变化 artifact slot digest 可复用；变化 environment slot 不可复用 |
| 4 | preflight 后 environment 14→15 | CONDITIONAL | validation 不能防 TOCTOU；provider/native conditional guard 在 side effect 前拒绝 |
| 5 | Binding commit D，actual commit E，Execution succeeded | PASS | outcome=succeeded；conformance=divergent；actual E 永久记录；Binding 不改 |
| 6 | undeclared debug-config | PASS WITH FIELD | fact comparison=undeclared；Binding 三值 mode 派生 conformant/divergent/unknown |
| 7 | required artifact not consumed | PASS | Execution succeeded 保留；conformance divergent；不新增 outcome |
| 8 | secret version 无法证明 | PASS | recorded assurance 可运行但 conformance unknown；enforced assurance dispatch blocked |
| 8a | Provider 无法证明输入集合完整 | PASS | 一个 coverage `ExecutionResourceFact(unverifiable)` 足够，不建 telemetry store |
| 9A | secret exact v7，v8 current，v7 可读 | PASS | exact v7 valid |
| 9B | secret approved-current，v7 不再 current | PASS | invalid: pin_no_longer_current |
| 9C | secret v7 revoked/destroyed | PASS | invalid: pinned_version_unavailable；Core 无 secret value |
| 10 | EnvironmentRef 同名、UID/instance 已替换 | PASS | Ref 不改；composite pin 不同，old Binding invalid |
| 11 | artifact v3 存在但 production-ineligible | PASS | existence 与 purpose eligibility 分开；Authority 决定，Core 不管 lifecycle |
| 12 | B1 invalid → B2 approval revoked → B3 accepted | PASS | 三个 frozen revision 均保留；accepted_binding_id 只指 B3 |
| 13 | DispatchRequested 后发现错误 | PASS | 同 Execution 禁止 clone/rebind；创建新 Execution + 新 Binding |
| 14.1 | resolve 后、freeze 前 crash | PASS | draft slots 从 SQLite 恢复 |
| 14.2 | freeze 后、validation 前 crash | PASS | frozen digest 从实体表恢复 |
| 14.3 | validation running crash | PASS | 同 idempotency key 恢复并完成 |
| 14.4 | validation completed 后 crash | PASS | completed evidence 复用，不写重复 event |
| 14.5 | accepted + DispatchRequested 后 crash | PASS | binding/validation/dispatch 同事务持久化 |
| 14.6 | Provider start 后、native ref 前 crash | PASS | dispatch 已是 starting；重启只 observe，不 blind redispatch |
| 14.7 | actual facts 部分写入 crash | PASS | fact idempotency key 允许补写；重复写不增加记录 |
| 15A | 并发 revalidate | PASS | 不同 key 产生独立 evidence；相同 key 合并为一条 |
| 15B | 并发 accept 两个 revision | PASS | Execution version CAS 只允许一个 winner |
| 15C | rebind 与 dispatch 并发 | PASS | rebind 增加 Execution version；旧 accept CAS 冲突 |
| 15D | authority invalidation 与 admission 并发 | PASS/CONDITIONAL | DB 先发生者决定 admission；accept 后变化由 conditional use/new Execution 处理 |
| 16 | shell/local、Codex-like、CI-like | PASS | 完全相同 Binding ontology；差异只在 capability、launch、evidence |
| 17 | Human → CI → deployment，无 AI | PASS | Binding 仍有独立 admission/audit 价值 |
| 18 | 无 workflow graph | PASS | 创建、validate、accept、execute 均不需要 DAG 或 transition engine |
| 19 | Contribution 查询 | PASS | versioned output/input facts 可派生 direct consumers 和 transitive upstream |
| 20 | 用户维护成本 | CONDITIONAL PASS | helper 自动 carry-forward、authority route、pin、slot reuse、revalidate/rebind；真实 UX 尚未证明 |

### 第一组外部变化的关键判定

B1 只有：

```text
workspace.primary     current-head(main) @ C
artifact.test-report exact @ R
environment.staging  current @ ENV-1/generation12
```

所以：

- main C→D：workspace invalid。
- environment 12→13：environment invalid。
- R 不变：artifact valid。
- architecture v3→v4：不是 B1 input，对 B1 无影响。
- benchmark v2 不再 production eligible：不是 B1 input，对 B1 无影响。

这证明 Binding scope 是 selected slots，不是 Work 上所有 Ref 的隐式依赖集合。

如果后续 production Execution 明确绑定 architecture v3 或 benchmark v2，ArtifactAuthority 才以 `purpose_ineligible` 阻止它。

## Mutation ledger

| Scenario | Current model failure | Required change | Change type | First-class entity? |
|---|---|---|---|---:|
| undeclared input | 原模型能记录 `undeclared`，但无法决定它是否影响 conformance | Binding 增加 `undeclared_input_mode: allow/forbid/unknown` | field addition | 0 |
| weak/incomplete Provider | `required_assurance` 若只描述 address enforcement，无法回答证据不完整是否可 dispatch | 明确 `enforced` 同时要求可强制 pin 且可提供所需消费证据；Provider descriptor 声明 proof/completeness | state semantic clarification + interface capability | 0 |
| incomplete input report | 缺少 required slots 不知道是未消费还是报告没完成 | 用现有 `ExecutionResourceFact(slot=null, disposition=unknown, comparison=unverifiable)` 记录 coverage gap | evidence convention | 0 |
| validation same-key race | 先查再 insert 发生唯一约束竞态 | `INSERT OR IGNORE` 后按 idempotency key 回读 | implementation only | 0 |
| concurrent accept | 两个 valid revision 都可能尝试 dispatch | 使用现有 `Execution.version` CAS；accepted_binding_id 仅能 null→value | repository method / implementation | 0 |
| rebind vs dispatch | 旧 admission 读可能与新 revision intent 竞争 | 创建 revision 增加 Execution.version；accept 带 expected version | implementation only | 0 |
| invalidation vs dispatch | 外部通知可能与 admission 同时发生 | DB 内 material invalidation 与 accept 串行；commit 后变化交给 conditional-use | implementation + boundary clarification | 0 |
| start/native-ref crash | crash 后不知 Provider 是否已启动 | 复用 dispatch runtime row：requested→starting→started；dispatch ID 作为 provider correlation/idempotency | implementation only | 0 |
| partial facts crash | 已写部分 actual evidence | fact idempotency key + append/补写 | implementation only | 0 |
| automatic rebind | 变化 slots 若全部让用户重填，维护成本过高 | helper 只自动 re-resolve 无歧义 moving selectors；exact missing/跨 Ref supersession 返回人工选择 | adapter/helper | 0 |
| Contribution | 没有 Contribution entity | 按 Ref identity + pin join output/input facts，递归生成 derived view | derived query | 0 |

### Mutation totals

```text
implementation only:                 6
field addition:                      1
state semantic clarification:        1
new/extended interface capability:   1
derived view/helper:                 2
ownership boundary change:           0
new first-class entity:              0
```

## First-class entity delta

```text
NEW FIRST-CLASS ENTITY COUNT = 0
```

没有新增：

- Dependency
- Contribution
- Handoff
- ResourceState
- EnvironmentState
- Retry
- WorkflowStep
- Policy
- Manifest
- InputSnapshot
- ResourceVersion
- Invalidation aggregate

`BoundRef` 仍是值对象；`BindingSlot` 仍是 Binding child；Validation、ApprovalDecision、ExecutionResourceFact 仍是 evidence records。

## Boundary violations

| 外部职责 | 是否侵入 | 说明 |
|---|---:|---|
| workflow | 否 | 没有 graph、step、transition、dependency 或 next execution decision |
| scheduler | 否 | 没有 queue、retry、backoff、next_run_at |
| resource manager | 否 | FakeAuthority 的 mutable state 只模拟外部系统；Core 只收 observation/pin |
| RBAC | 否 | Approval 只保存 subject digest、issuer、actor ref、decision/proof |
| artifact store | 否 | 只保存 Ref、digest、purpose verdict，不保存 bytes |
| secret store | 否 | 只保存 handle/version；从未保存 value 或 value hash |
| telemetry | 否 | ResourceFact 只记录 material versioned I/O 和 completeness gap |

TOCTOU guard 是 ExecutionProvider/native resource adapter 的职责。Core 只要求并验证 capability，不提供 universal resource API。

## Provider-specific leakage

```text
Core provider-specific branches = 0
```

三类 Provider 使用同一：

```text
ExecutionBinding
  → BindingSlot
  → BoundRef
  → BindingValidation
  → ExecutionResourceFact
```

Provider-specific 内容仅有：

- 支持哪些 enforcement mode；
- launch mechanics；
- native conditional-use/precondition；
- consumption evidence 的来源与 completeness；
- native correlation ref。

Core 没有 `if provider == codex/ci/shell`。

## Automation burden

### 正常 handoff 的系统自动项

- 从同一 Work 的 Execution output facts 发现 candidate Ref；
- carry-forward exact Ref + pin；
- 按 `(Ref.type, Ref.provider)` 路由 Authority；
- current selector 的 pin resolution；
- clone revision 时复制未变化 slots；
- revalidate；
- 对无歧义 moving selector 自动 rebind；
- 由 versioned I/O facts 派生 contribution。

### 正常用户输入

理想正常路径只需要：

1. Execution purpose；
2. 有歧义时选择 candidate；
3. 外部 approval。

用户不应手填：

- authority ID；
- commit/digest/generation pin；
- unchanged slot；
- approval subject digest/link；
- validation rows；
- contribution edges。

### 仍然必须人工介入的正确边界

- exact pin 已消失，不能猜替代版本；
- artifact v3 与 v4 是不同 Ref，业务意图不明确；
- approval subject 内容变化；
- Authority unknown 且没有安全 fail-open 规则。

因此自动化压力结果是 **CONDITIONAL PASS**：模型允许低人工成本，但 production UX/adapters 仍需证明。如果真实 handoff 要用户逐项创建 Ref/slot/pin，产品应判 FAIL。

## Restart / concurrency result

可以使用普通 SQLite/SQL 事务、CAS 和 idempotency 解决，无需分布式 workflow runtime。

最小规则：

1. Frozen Binding 只读。
2. `Execution.version` 是 accept/rebind 的 CAS token。
3. `accepted_binding_id` 只允许 `null → binding_id` 一次。
4. accepted binding、validation ID、dispatch row、material event 同事务。
5. validation/fact/event 各自有 unique idempotency key。
6. provider start 在外部调用前把 dispatch 标记为 `starting`。
7. crash 后 `starting` 只能 observe/reconcile，不能 blind start。
8. Authority notification 是新的 Validation evidence，不修改 Binding。
9. 如果 notification 在 accept 前提交，admission blocked；如果 accept 已提交，Binding 不回滚，交给 native conditional-use 或新 Execution。

EventLedger 不承担恢复源，实体/evidence tables 才是恢复源。

## Contribution derivation result

不需要 Contribution entity。

直接贡献查询：

```text
A.output(actual Ref identity + pin)
JOIN
B.input(consumed same Ref identity + pin)
```

反向 lineage：从最终 Execution 的 consumed input facts 找同 pin 的 producing output facts，然后递归。

Spike 已证明：

```text
Execution A --produced R--> Execution B --produced REL1--> Execution C

consumers(A) = {B}
consumers(B) = {C}
upstream(C)  = {A, B}
```

限制也是合理的：如果 actual consumption 是 unknown，贡献链必须保持 unknown，不能用 requested Binding 冒充 actual contribution。

## Bloat assessment

最可能膨胀的三个位置：

### 1. BindingSlot selector

最高风险。

必须保持：

```text
selector_kind: bounded namespaced operation
selector_value: opaque bounded argument
```

复杂判断留给 Authority。禁止增加 AND/OR、branch、dependency、conditional transition、retry、dynamic expression。出现这些即 `MODEL BLOAT`。

### 2. BindingValidation

它只能是一轮 flat observation/check evidence。

禁止拥有：

- retry/backoff；
- step dependency；
- wait state；
- callback workflow；
- repair/rebind transition。

重试由调用方再次创建 Validation；rebind 由新 Binding revision 表达。

### 3. ExecutionResourceFact

它只能保存 material actual I/O：Ref、pin、disposition、comparison、proof/completeness。

禁止接收：

- stdout/stderr；
- tool event stream；
- transcript；
- metrics/heartbeat；
- arbitrary provider payload。

次级风险是 ApprovalDecision 变 RBAC、RefAuthority 变 resource manager；当前测试没有要求跨越边界。

## Simplifications

压力后建议删减或推迟：

1. `BindingSlot` 不需要 undeclared policy；额外输入模式只在 Binding 上有一个三值字段。
2. 不需要 mutable `Binding.valid`、`invalidated_at` 或 `superseded` state；都由 Validation/新 revision/accepted pointer 派生。
3. 不需要 `BindingCandidate` table；candidate 是 Work graph derived view。
4. 不需要 `BindingSnapshot`；frozen Binding 就是 snapshot。
5. 不需要 `ConsumptionReport`/`Contribution` 新对象；现有 ResourceFact 足够。
6. `resolver_id/version/selection_provenance_ref` 对压力流程不是必需字段，可推迟到真实审计需求证明后再加。
7. `BindingValidation.abandoned` 不是首个 Spike 的必要 terminal state；running/completed 加 stale-running cleanup 已足够。

不可删除：

- exact `pin_scheme + pin_value`；
- selector 与 purpose；
- approval subject digest；
- actual/ref pin；
- conformance 与 Execution outcome 的分离；
- validation freshness；
- provider evidence completeness。

## Final model

压力后的最小模型仍是：

```text
Work
Execution
Ref

ExecutionBinding {
  execution_id
  revision
  purpose
  required_assurance: enforced | recorded
  undeclared_input_mode: allow | forbid | unknown   # 唯一新增字段
  supersedes_binding_id?
  content_digest
  state: draft | frozen
}

BindingSlot {               # Binding child
  role
  required
  selector_kind/value
  BoundRef
  approval_required
  slot_digest
}

BoundRef {                  # value object
  Ref
  authority_id
  pin_scheme/value
}

BindingValidation {
  binding_digest
  verdict: valid | invalid | unknown
  items
  observed_at / valid_until
  trigger
  idempotency_key
}

ApprovalDecision {
  subject_digest
  issuer / actor_ref
  decision / proof_ref
  decided_at / expires_at
  supersedes_decision_id?
}

ExecutionResourceFact {
  direction: input | output
  disposition: consumed | not_consumed | unknown | produced
  actual Ref + pin
  comparison: match | mismatch | undeclared | unverifiable
  reporter / assurance / evidence_ref
  idempotency_key
}

RefAuthority.resolve / validate
ExecutionProvider.start / observe + governed capability/evidence declaration
EventLedger(material facts only)
```

派生而不持久化为一级对象：

- readiness/admission；
- binding conformance；
- candidate inputs；
- contribution graph；
- current/superseded revision view；
- freshness/stale view。

## Recommendation

**SIMPLIFY**

不要立即 Freeze production contract，也不需要 Redesign 或 Stop。

下一阶段只做两件事：

1. 把 `undeclared_input_mode` 和 `required_assurance` 的有限语义写进候选 contract，明确禁止扩展为 policy DSL。
2. 用一个真实 conditional-use 环境 API 和一个真实 Codex/CI adapter 验证：
   - provider 能否在 side effect 前强制 pin/precondition；
   - actual consumption completeness 是否足够高；
   - 正常 handoff 是否真的只需 purpose、歧义选择和 approval。

如果真实 Provider 只能通过 prompt 声明输入、无法强制或证明 actual pin，或者正常流程仍需手工维护大量 slots/refs，则应停止把该机制提升为产品中心，而不是继续增加对象补洞。

当前压力验证结论：

> 模型没有被复杂流程击穿，也没有膨胀成 workflow/resource/policy runtime；它以 0 个新一级实体、1 个有限字段变更存活，但仍需真实原子消费与自动化证据后才能 Freeze。
