# Agent-Box Minimal Work Core Stress Test
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 文档导航：[总目录](../README.md)

Research date: 2026-08-21. This document treats `Work / Execution / Ref / Event / Extension` as a falsifiable hypothesis. It deliberately tests non-coding, long-running, external-event and highly coordinated work. A capability is considered Core-worthy only when it has independent user/domain semantics; implementation convenience is not sufficient.

## 1. Executive Verdict

**Result B — Core is promising but needs one structural clarification, not another domain object.**

The five primitives survive the stress test if they are split by layer and if `Execution` is not required to pretend that a human note, a Temporal workflow, a CI job and a browser research session have identical operational semantics.

The required change is:

* **User/domain core:** `Work` + `ExecutionRef` + `Ref` (with lifecycle/goal and typed references).
* **Runtime/infrastructure core:** `Event` + `Extension` + provider capability/projection contracts.

`Event` and `Extension` are not peers of Work in the user ontology. They are infrastructure primitives. `Ref` is a shared typed value/identity mechanism, not an arbitrary JSON bucket. `Execution` is a cross-system **identity and correlation record**; its provider protocol is capability-qualified and may be absent for human/manual work. It must not be a universal state machine.

Coverage estimate:

* 7 required Work types: **~86% strong or caveated fit**;
* 5 additional extreme scenarios: **~80% strong or caveated fit**;
* 6 simulated providers/extensions: **no Core schema change** if typed refs/events are open and capability namespaces are extension-owned.

The model fails only when it is asked to make Work itself coordinate DAGs, retries, permissions, resource leases, incident state machines, recurring monitors or artifact bytes. Those belong to Workflow/Coordinator, IAM/resource providers, monitoring/automation products and artifact stores.

The most serious danger is not missing a primitive. It is **Execution semantic dilution**: if the common interface collapses to `id/status` plus provider-specific branches, Execution becomes a mere wrapper. The mitigation is to define a small identity/provenance envelope and capability-qualified operations, not to add Activity, Node, Role, Scheduler or universal State to Core.

## 2. Current Core Hypothesis

### Domain meaning

| Primitive | Candidate meaning | Must not own |
|---|---|---|
| Work | Stable identity, objective/intended outcome, lifecycle and completion/closure boundary. | Graph, retry, checkpoint, session transcript, repository/container lifecycle, scheduler. |
| Execution | Concrete activity that advances Work: direct Harness, Workflow, human, CI/external, scanner, browser/research or compute job. | One universal state/retry/transition semantics. |
| Ref | Typed reference to an external object whose lifecycle belongs elsewhere. | Full external object state or arbitrary untyped metadata. |
| Event | Agent-Box cross-system immutable fact/provenance. | Temporal replay history, LangGraph checkpoint, transcript or provider event log. |
| Extension | Plugin boundary for providers, stores, UI, integrations and execution kinds. | A license to silently mutate Core ontology. |

### Minimum execution envelope

```text
ExecutionRecord {
  execution_id,
  work_ref,
  kind,
  provider_ref,
  native_ref,
  status_projection,
  input_refs,
  output_refs,
  started_at, ended_at,
  provenance,
  capabilities,
  metadata
}
```

`status_projection` is not authoritative state. `native_ref` is opaque and provider-owned. An execution provider exposes only operations it can support:

```text
ExecutionProvider
  start(input, bindings) -> NativeExecutionRef
  observe(ref) -> StatusProjection              # required if observable
  send_input(ref, payload) -> Event/Ref           # optional
  request_cancel(ref) -> Outcome                  # optional
  request_pause(ref) -> Outcome                   # optional
  capabilities() -> CapabilitySet                 # required
```

Human/manual execution may have no live provider process: it can be recorded as `ExecutionRecord(kind=human, native_ref=null)` with events and artifact refs. This is intentional; the common object is a record of an advancement activity, not necessarily a process handle.

## 3. Test Method

Each scenario is tested with eight questions:

1. Can the five primitives represent it without special Core fields?
2. Does Work remain independently valuable after executions disappear?
3. Does a new provider require Core code/schema changes?
4. Does provider-native identity remain behind typed/native refs?
5. Does Core start deciding transitions, retries, branches or schedules?
6. Is completion explicit, or is the object actually a Goal/Project/Monitor/Automation?
7. Are artifacts/resources external refs rather than copied lifecycle objects?
8. If a new concept appears, is it a domain primitive, provider extension, projection or external system?

Hard failure markers:

* **[F1]** Provider-specific field added to Work/Execution Core schema.
* **[F2]** New execution type requires Core transition logic.
* **[F3]** Work stores runtime checkpoint/session state.
* **[F4]** Core schedules DAG/retry/branch/replay.
* **[F5]** Work has no completion boundary but is forced to remain Work.
* **[F6]** Execution common API reduces to `id/status` with uncontrolled type switches.
* **[F7]** Ref becomes an arbitrary JSON bucket.
* **[F8]** Agent-Box Event becomes a second provider runtime history.
* **[F9]** Extension must modify Core schema to install a capability.
* **[F10]** Removing Work makes native Task/Workflow/Session clearly simpler.

## 4. Work Type Taxonomy

| Type | What persists independently | Typical completion | Natural execution mix |
|---|---|---|---|
| A. Execution | Target/result and acceptance evidence | Objective achieved/accepted | Harness, workflow, CI, human |
| B. Exploration | Evidence, hypotheses, decisions and next question | Decision/understanding reached or abandoned | Research, prototypes, benchmark, human notes |
| C. Decision | Rationale and accepted decision/ADR | Decision accepted/superseded | Research, benchmark, meeting, review |
| D. Response | Incident/evidence/remediation/postmortem | Incident resolved and reviewed | Alert, human acknowledgement, diagnosis, patch, deploy |
| E. Production | Versioned artifact and acceptance/release | Artifact accepted/published | Research, writing, review, CI, publishing |
| F. Continuous | Responsibility/monitor condition, not one result | Often never; periodic obligations | Scheduler/monitor/recurring executions |
| G. Coordination | Outcome across child efforts and gates | Release/response outcome accepted | Many heterogeneous parallel executions |

Types F and G are boundary tests. They may be better modeled as `Responsibility/Monitor` and `Project/Program/Workflow`, respectively, rather than pretending every long-lived process is one Work.

## 5. Scenario Stress Tests

### Core stress matrix

| Work Type | Work stable? | Execution model fits? | New Core fields? | Provider leakage? | Workflow leakage? | Completion clear? | Verdict |
|---|---|---|---|---|---|---|---|
| A. Fix bug/feature/release | Yes | Yes | No | None | Low | Yes | **Strong fit** |
| B. Exploration/research | Yes, as evidence-bearing objective | Yes, including human execution | No | Native refs only | Low | Usually; abandon/decision boundary needed | **Fit with caveats** |
| C. Decision/ADR | Yes, decision record remains | Yes | No; decision is event/artifact | None | Low | Yes when accepted/superseded | **Strong fit** |
| D. Incident/security response | Yes, if Case semantics enabled | Yes | No | Alert/CI/scanner refs | Coordinator extension owns route | Yes: resolved + postmortem | **Fit with caveats** |
| E. Report/release/content production | Yes, artifact-oriented | Yes | No | Artifact provider only | Pipeline extension optional | Yes on acceptance/publication | **Strong fit** |
| F. Continuous monitoring/maintenance | Not always | Recurring executions fit; one Work does not | No if reclassified | Scheduler/monitor refs | Automation owns recurrence | Often no | **Weak fit as Work; use Monitor/Responsibility** |
| G. Release/security coordination | Yes as Case/Project outcome | Yes through coordinator executions | No | Child native refs | Coordinator/Workflow extension | Yes at release/response acceptance | **Fit with caveats** |

### Type A — Execution-oriented Work

**Graph:** `Work(fix test) → DirectHarnessExecution(Codex) → ArtifactRef(patch/test report) → WorkCompleted`.

The five primitives are not too heavy if the API creates a Work and an Execution atomically and hides optional events/refs from a one-shot CLI. The domain object answers what is being fixed and when acceptance is met; Codex session state stays native. No Workflow object is needed. If creating Work is visibly more cumbersome than `codex fix`, [F10] is triggered at the UX layer, not necessarily the ontology layer. Provide an implicit TaskCase and allow users to skip explicit object creation.

### Type B — Exploratory Work

One stable Work objective (“determine whether architecture X is viable”) can accumulate research, prototypes, benchmarks, abandoned runs, human notes, and changed hypotheses. Each is an Execution or human Event with Context/Document/Artifact refs. The Work’s objective can be refined through `ObjectiveUpdated`; old decisions remain events.

The failure mode is letting Work become a notebook, memory database and experiment scheduler. Keep documents/knowledge bases/artifacts external. Use `WorkBlocked` or `WorkAbandoned` when no answer is reachable. **No new Core primitive is required.** A `Decision` should be an ArtifactRef/DocumentRef plus an Event (`decision_recorded`), unless the product specifically needs decision governance across unrelated Work.

### Type C — Decision Work

The outcome is a decision with evidence. Model:

```text
Work(decide database)
  ├── Execution(research A)
  ├── Execution(benchmark B)
  ├── Execution(human meeting)
  ├── ArtifactRef(ADR)
  └── Event(DecisionRecorded: option=Postgres, rationale_ref=ADR)
```

The decision itself is not a new execution. It is an external durable document/ArtifactRef plus an immutable Event. If decisions must be queried/approved independently across many Work items, add a `DecisionProvider` extension or external ADR system—not a fifth/sixth domain object in Core.

### Type D — Response Work

An incident is a strong Case-like Work: alert intake, acknowledgement, diagnosis, remediation, deploy, monitoring and postmortem. The route is not known in advance. Work owns incident identity, severity/closure/postmortem relevance; a Coordinator/Incident extension owns runbook routing, escalation, paging and parallel dependencies. CI, scanner and monitor statuses remain Refs/projections.

If Work itself adds `severity`, `escalation_policy`, `on_call`, `incident_state_machine`, `rollback_policy` and `SLA timers`, it becomes an Incident Management product ([F4]/[F5]). Those are valid domain semantics only if Agent-Box explicitly becomes an incident system; they should not be smuggled into a generic Work Core.

### Type E — Production Work

Reports, articles, release packages and demos have an artifact lifecycle. Work owns intended audience/acceptance and publication boundary; ArtifactProvider owns bytes, versions, hashes and storage; executions produce refs. A `Published` event and `ArtifactRef` are sufficient for most cases. If artifact review/version lineage becomes the product, use a specialized Artifact/Document provider; do not copy artifact bytes into Work ([F7]).

### Type F — Continuous Work

“Monitor competitors indefinitely” has no closure boundary. Calling it Work violates the strong Work invariant [F5]. Better classifications:

| Model | Meaning | Recommendation |
|---|---|---|
| A. Perpetual Work | One never-completing record | Reject as default; destroys Work completion semantics. |
| B. Goal + recurring Execution | Durable intent with scheduled executions | Valid for a Goal/Responsibility extension; not ordinary Work. |
| C. Monitor/Automation | Trigger/rule owns recurrence and alerting | **Recommended** for monitoring. |
| D. Work per detection | Each detected change creates a bounded Work | **Recommended**: Monitor emits events that instantiate Work. |

The invariant should be: **a Work must have a declared closure rule, even if the rule is “close when superseded” or “close after each cycle.”** Continuous responsibility belongs to `Monitor/Automation/Goal` extensions and emits bounded Works.

### Type G — Coordination Work

“Release Agent-Box 2.0” may be a Project/Program with multiple Work items, or a Case with a Coordinator. Work should link child Works/ExecutionRefs and acceptance criteria but should not own dependency scheduling. A Workflow/Coordinator extension owns A→B dependencies, parallelism, retries and gates; the Work receives status/provenance projections.

Recommended ownership:

1. **Work Core:** stable objective, child Work refs, acceptance summary, correlation and events.
2. **Coordinator/Workflow Extension:** graph, dependency, branch, retry, join, wait and scheduling.
3. **Execution Providers:** native run state and side effects.
4. **External providers:** workspace, CI, secrets, artifacts, monitoring.

If every coordinated Work requires the same coordinator, promote that coordinator to a Workflow/Project product—not to generic Core.

## 6. Five Extreme Scenarios

### H — Multi-workspace/multi-repo

Attach a set of `WorkspaceRef`/`RepositoryRef` values to Work or to individual Execution bindings. Do not assume one WorkspaceRef. A frontend execution can use worktree A, infrastructure CI workspace B, and docs execution C. The Work only owns references and access intent; providers own leases/files. No Core change.

### I — Multi-organization/permission domains

Permissions belong to identity/IAM, Harness profile, Workflow runtime and workspace/resource providers. Work stores authorization context/reference and the event audit, not a permission engine. A security workflow may receive a restricted `ResourceGrantRef`; an external reviewer gets a patch ArtifactRef. If Work gains ACL evaluation, secrets, role hierarchy and policy conditionals, [F1]/[F4] occur. Use a Policy/Grant extension.

### J — Work fork/split

Represent `WorkSplit`/`WorkDerived` Events and parent/related typed refs. Create Work B and C with copied or referenced context and explicit `derived_from` relation. Parent/child is a relation type, not a new primitive. The split semantics (copy, move, shared, supersede) belong to a Work relation provider or host policy. No scheduler required.

### K — Work merge

Do not silently merge identities. Create a new canonical Work or designate one survivor; append `WorkMerged` with source refs, preserve all event histories and mark source Works `superseded`. If external issue systems have their own merge semantics, keep native refs. This is lifecycle + relation events, not a Merge primitive.

### L — Reopen after months

Reopen the old Work when acceptance boundary, ownership and objective are materially the same; create a linked Work when the issue is a new objective or different owner. Both are represented by `WorkReopened` or `WorkRelated` events and new ExecutionRefs. No new Goal/Workflow primitive is needed.

## 7. Execution Abstraction Test

### Model 1 — Universal Execution

All direct Harness, Workflow, Human and CI work is `Execution`. This is acceptable only as an identity/provenance record. It is not acceptable as one operational state machine: a human action has no process cancellation; a Temporal workflow has signals/retries; a CI job has provider status; a scanner may be one-shot and immutable.

### Model 2 — Execution + ExecutionProvider

**Recommended.** Core stores `ExecutionRecord`; provider extensions implement capability-qualified operations and projections. `kind` is an open string/namespace, not a Core enum requiring code changes. A provider declares:

```text
capabilities = {
  observe: required,
  send_input: optional,
  pause: optional,
  resume: optional,
  cancel: optional,
  attach_artifact: optional,
  human_gate: optional
}
```

Outcomes must distinguish `supported`, `unsupported`, `emulated`, `pending`, and `provider_native`.

### Model 3 — Activity + Execution

An `Activity` could mean “a Work-relevant thing someone/something did”; `Execution` would mean the machine/provider run that performed it. This cleanly models a human edit as Activity and a CI run as Execution. But adding Activity to Core is not yet justified: an Activity can be an Event (`HumanDecision`, `ArtifactProduced`) or an `ExecutionRecord(kind=human)`. Introduce Activity only if users need planned assignments, due dates, responsibility and completion independent of execution—i.e., a task/case activity system.

### Model 4 — Action + Execution

`Action` (“review patch”) and `Execution` (“Codex session that reviewed it”) is useful for a workflow engine or task system, but the current Work Core does not need to own planned Action semantics. Use input/output refs and provider metadata. Add Action only when Agent-Box becomes a planning/task product; otherwise [F10] indicates extra abstraction.

### Is Human Action really an Execution?

Conceptually, human action is not a process execution in the same sense as a Workflow. Operationally, recording it as an Execution-kind is useful for one uniform timeline and ownership. The distinction is exposed through capabilities: `human` has `observe` and `append_event`, but not `cancel`/`pause`. If the UI needs richer human assignment/checklist semantics, a HumanInteraction extension can project Activities without changing Core.

**Verdict:** keep one `ExecutionRecord` identity envelope; do not promise one universal execution behavior.

## 8. Work Boundary Test

### Minimum irreducible Work semantics

Work is removable only if these survive as a coherent user object:

1. stable identity/correlation;
2. intended outcome/objective;
3. closure rule and lifecycle (open, blocked, abandoned, completed, superseded/reopened);
4. evidence/context/artifact references relevant to that outcome;
5. relation to executions and human/external facts.

Remove Work and a native Workflow/Session can represent a process, but cannot naturally represent direct+human+multiple-replaced executions with one outcome boundary. If a deployment has only one native Workflow and no cross-execution evidence, Work is unnecessary [F10].

### Work must not become

* Project: many independently closable Works should be a Project/collection extension.
* Goal: indefinite objective should be Goal/Responsibility/Monitor.
* Incident system: severity/escalation/runbooks belong to Incident extension.
* Workflow engine: dependencies/retries/branches belong to Coordinator.
* Artifact store: bytes/versions belong to Artifact provider.
* Workspace manager: repos/worktrees/containers belong to Workspace provider.

## 9. Continuous Work Boundary

Completion is a strong invariant for ordinary Work. The model should reject or reclassify records with no plausible closure. Use:

```text
Monitor/Automation (extension-owned recurrence)
  └── emits ExternalTrigger / Alert events
        └── creates bounded Work instances
              └── executions and artifacts
```

This preserves a clean product mental model: “monitoring” is a responsibility/automation, “investigate this detected regression” is Work. If the user insists on one ongoing Goal, keep it outside Work or as an optional GoalRef; do not weaken all Works’ closure semantics.

## 10. Coordination / Workflow Leakage Test

### Who owns dependencies?

| Concern | Owner |
|---|---|
| Child Work relation/correlation | Work Core relation + Events |
| DAG/graph topology | Workflow/Coordinator Extension |
| Schedule next execution | Workflow/Coordinator or external scheduler |
| Retry/backoff | Execution provider/workflow runtime |
| Parallel fan-out/join | Workflow/Coordinator |
| Resource lease/concurrency | Workspace/resource provider |
| Aggregate completion projection | Work Core projection/host policy |
| Final acceptance decision | Human/Work policy event |

The Core may accept an external intent such as `start execution X for Work Y` or `WorkCompleted` decision. It must not decide “after A, launch B” itself. Once it does, [F4] triggers and the Core is a Workflow Engine.

## 11. Event Test

### Is Event a domain or implementation primitive?

Both, but at different layers:

* **Domain:** a human/user-visible immutable fact (decision, completion, reopen, artifact produced, external trigger) is meaningful even after runtime deletion.
* **Infrastructure:** an append-only event log, projection builder and event sink are implementation mechanisms.

Agent-Box Event is an infrastructure primitive carrying selected domain facts. It should not reproduce provider runtime histories. It earns Core status because cross-system facts, reopen, external triggers, audit and provenance need one correlation substrate even when no workflow exists.

### If Event is removed

Work + Execution + Ref can show current state, but cannot robustly explain replacement, reopen, human actions, external triggers, historical decisions or cross-runtime provenance. A database audit log could reintroduce Event under another name. Keep it internally, but do not make users author raw events.

## 12. Ref Test

`Ref` is the most useful shared utility and the most dangerous abstraction.

### Shared contract

```text
Ref {
  type: namespace/name,
  provider: optional provider id,
  id or uri: opaque stable identity,
  version/digest: optional immutable selector,
  capabilities: optional projection,
  display: optional UI metadata
}
```

WorkspaceRef, ArtifactRef, ContextRef, ProfileRef and NativeSessionRef share identity/authority/provenance, but not lifecycle operations. `Ref` must not claim one `load()`/`update()` protocol. The typed namespace communicates capabilities and ownership.

### Provider leakage

Store `NativeSessionRef(provider=claude, id=...)`, `NativeWorkflowRef(provider=temporal, workflow_id=..., run_id=...)`, `LangGraphThreadRef(thread_id=..., checkpoint_id=...)`, `GitHubActionsRunRef(run_id=...)`; never add `temporal_run_id`, `checkpoint_id` or `claude_transcript` directly to Work. Provider-specific metadata is namespaced and opaque. This avoids [F1] and [F7].

### Is Ref a Core primitive?

It is a **runtime/infrastructure core primitive**, not a domain object. It belongs in SDK/schema because every extension needs stable external identity, but it should remain small and typed. If `Ref` becomes arbitrary JSON, replace it with named provider contracts and reject [F7].

## 13. Extension Test

Six simulated extensions were attached sequentially:

| Extension | Core changes? | New event | New ref | Provider capability |
|---|---:|---|---|---|
| Claude/Codex Harness Adapter | No | ExecutionStarted/Completed, HarnessAttached | NativeSessionRef, ProfileRef | prompt/load/cancel/observe depending on harness |
| LangGraph Workflow Adapter | No | WorkflowStarted/Interrupted/Completed | NativeWorkflowRef(Thread/Checkpoint) | send_input/resume/state_projection |
| Human Interaction | No | HumanRequested/Decision/ArtifactProduced | optional HumanInteractionRef | append_event, notify, decision |
| GitHub Actions | No | ExternalRunStarted/Completed | ExternalRunRef/ArtifactRef | observe/cancel if API supports |
| Security Scanner | No | ScanStarted/Finding/Completed | ScanRef/FindingRef/ArtifactRef | observe/report |
| Monitoring/Alert | No | ExternalTrigger/AlertRaised | MonitorRef/AlertRef | subscribe/acknowledge/emit Work |

### Installation simulation

1. Extension declares `kind_namespace`, provider identity, capabilities, ref types and event types.
2. Core stores these as namespaced opaque types and validates only base shape/ownership.
3. Provider emits cross-system Events through the event sink.
4. UI/storage/artifact projections subscribe without Core schema changes.
5. A host decides whether an event creates a new Work or attaches to an existing one.

This is Pi-like in the relevant sense: adding a tool/provider does not modify the harness core. The difference is that Work semantics require a stable cross-provider correlation/lifecycle envelope; that extra boundary is why Agent-Box is harder to keep tiny.

## 14. Pi Extensibility Comparison

| Question | Pi | Agent-Box candidate |
|---|---|---|
| Core remains ≤5 concepts? | Yes-ish: session/agent loop, tools/messages/events/settings/extension | Possible only with Work lifecycle kept strict |
| New provider without core change? | Model providers/settings/extensions | Yes for Harness/Workflow/CI/Scanner via namespaced refs/events |
| Core owns runtime state? | Yes, Pi owns its own session loop/state | No, providers own native state |
| UI replaceable? | TUI plus RPC/SDK paths | Must be explicitly replaceable |
| Storage replaceable? | Session/settings conventions, package/project scopes | Event/store/ref adapters must be replaceable |
| Extension can add UI/tools/events? | Strong | Strong target |
| Extension can replace primary ontology? | Not generally | Should not silently replace Work; host may provide another projection |
| User mental model | “Run a coding agent in this project” | “Track an outcome across one or more executions” |
| Main complexity | Harness extensibility | Cross-runtime identity/lifecycle and non-overlap |

Agent-Box can match Pi’s extension mechanics, but not its exact simplicity because it sits above heterogeneous authorities. The solution is not more Core objects; it is strict ownership and optional projections.

## 15. Schema Prototypes

All four graphs use one common shape. Provider details are refs/extensions, not Core fields.

### 15.1 Simple execution Work

```yaml
work:
  id: work:bug-123
  objective: "Fix failing payment test"
  completion: "tests pass and patch reviewed"
  status: open
  refs:
    - {type: workspace, id: ws:checkout}
executions:
  - id: exec:1
    work: work:bug-123
    kind: harness
    provider: codex
    native_ref: {type: codex_session, id: sess:abc}
    status: completed
    outputs: [{type: artifact, id: git:patch:sha256:...}]
events:
  - {type: work_created, work: work:bug-123}
  - {type: execution_started, execution: exec:1}
  - {type: artifact_produced, artifact: git:patch:sha256:...}
  - {type: work_completed, reason: tests_and_review_passed}
```

No nullable workflow/retry/role/session state appears in Work.

### 15.2 Exploratory Work

```yaml
work:
  id: work:architecture-choice
  objective: "Determine whether Temporal migration is viable"
  completion: "decision recorded or investigation abandoned"
  refs: [{type: context, id: doc:constraints}]
executions:
  - {id: exec:research, kind: harness, native_ref: {type: claude_session, id: sess:r1}}
  - {id: exec:benchmark, kind: external, native_ref: {type: ci_run, id: ci:44}}
  - {id: exec:prototype, kind: human, native_ref: null}
events:
  - {type: context_updated, ref: doc:hypothesis-v2}
  - {type: execution_abandoned, execution: exec:prototype, reason: wrong_assumption}
  - {type: decision_recorded, artifact: doc:adr-17}
  - {type: work_completed, reason: decision_accepted}
```

The evolving knowledge is documents/artifacts/context refs, not Work-owned “memory state.”

### 15.3 Incident response Work

```yaml
work:
  id: work:incident-9001
  objective: "Resolve elevated checkout errors and publish postmortem"
  completion: "service healthy, remediation deployed, postmortem accepted"
  refs:
    - {type: alert, id: pagerduty:9001}
    - {type: workspace, id: ws:payments}
executions:
  - {id: exec:ack, kind: human, native_ref: null}
  - {id: exec:diagnose, kind: workflow, native_ref: {type: langgraph_thread, id: t:diag}}
  - {id: exec:patch, kind: harness, native_ref: {type: codex_session, id: s:patch}}
  - {id: exec:deploy, kind: ci, native_ref: {type: github_actions_run, id: 882}}
events:
  - {type: external_trigger_received, ref: pagerduty:9001}
  - {type: human_decision, decision: rollback}
  - {type: artifact_produced, ref: git:commit:...}
  - {type: work_completed, reason: postmortem_accepted}
```

Runbook/escalation/dependency logic remains an Incident/Workflow extension.

### 15.4 Coordinated release Work

```yaml
work:
  id: work:release-2
  objective: "Release Agent-Box 2.0"
  completion: "all acceptance gates passed and rollout stable"
  refs:
    - {type: project, id: project:agent-box-2}
    - {type: workspace, id: ws:release}
executions:
  - {id: exec:backend, kind: workflow, native_ref: {type: temporal_workflow, id: wf:b}}
  - {id: exec:frontend, kind: workflow, native_ref: {type: langgraph_thread, id: t:f}}
  - {id: exec:security, kind: scanner, native_ref: {type: scanner_run, id: scan:7}}
  - {id: exec:release, kind: ci, native_ref: {type: github_actions_run, id: 99}}
events:
  - {type: child_execution_attached, execution: exec:backend}
  - {type: artifact_produced, ref: artifact:security-report}
  - {type: human_decision, decision: release_approved}
  - {type: work_completed, reason: rollout_stable}
extensions:
  coordinator: {provider: temporal, native_ref: {type: temporal_workflow, id: wf:release-coordinator}}
```

The `coordinator` is explicitly an extension/native execution, not hidden Core scheduling.

## 16. Core Mutation Report

| Stage | Scenario pressure | Core change | Assessment |
|---|---|---|---|
| Initial | Five primitives | Work/Execution/Ref/Event/Extension | Candidate |
| A | Simple fix | None | Good; implicit creation needed for UX |
| B | Exploration | None; add evidence/decision refs/events | Good; do not add Notebook/Decision primitive |
| C | Decision | None; ADR/Decision event + ArtifactRef | Good; external governance if needed |
| D | Incident | None; Incident/Coordinator extension | Good; do not add incident state machine to Work |
| E | Production | None; ArtifactProvider/DocumentRef | Good; artifact bytes stay external |
| F | Continuous | Reclassify to Monitor/Goal/Automation extension | Necessary boundary correction, not Core growth |
| G | Coordination | None; Workflow/Coordinator Execution extension | Good; no scheduler in Work |
| H | Multi-workspace | None; multiple typed Workspace/Repository refs | Good |
| I | Permissions | None; Policy/Grant extension and IAM refs | Good |
| J | Split | None; relation events/derived Work refs | Good |
| K | Merge | None; merged/superseded event relation | Good |
| L | Reopen | None; lifecycle/event policy | Good |
| Plugins 1–6 | New execution/provider types | None; namespaced ref/event/capability registration | Pi-like success |

### Reasonable changes versus ontology failures

**Reasonable:** adding an open event type, a namespaced Ref type, a provider capability, a projection, or a relation event. **Failure:** adding Work fields for Temporal retries, LangGraph checkpoints, scanner findings, Kubernetes pod state, permission policy, scheduler dependencies or artifact bytes. Those are [F1]–[F9] ownership violations.

## 17. Failure Conditions

| Condition | Observed in stress test? | Decision |
|---|---:|---|
| F1 Provider field enters Core schema | No | Enforce native refs + namespaced metadata. |
| F2 New execution type needs Core transition code | No | Open `kind` namespace + provider capabilities. |
| F3 Work stores checkpoint/session state | No | Keep state in native provider; Work stores projections/refs. |
| F4 Core decides DAG/retry/branch | **Risk in G, prevented** | Require Coordinator/Workflow extension. |
| F5 No completion boundary | **Yes for F** | Reclassify Monitor/Responsibility/Goal; do not call ordinary Work. |
| F6 Execution only id/status | **Risk** | Preserve provider refs, input/output refs, capabilities and provenance; no fake universal behavior. |
| F7 Ref arbitrary JSON | **Risk** | Typed namespace, opaque ID, digest/version and declared capabilities only. |
| F8 Event duplicates runtime history | No | Cross-system facts only; store native history refs. |
| F9 Extension modifies Core schema | No in simulation | Version extension manifest and reject hidden schema mutation. |
| F10 Native object simpler after removing Work | **Yes for one-shot single-provider work** | Allow implicit Work or direct Harness mode; Work is not mandatory for every invocation. |

The two marked risks are product boundary facts, not reasons to add primitives. F5 says some ongoing things are not Work; F10 says the user should not pay ontology ceremony for a one-shot harness run.

## 18. User-facing vs Runtime Core

### A. User/domain core — maximum 3

1. **Work** — objective, completion/closure, lifecycle, user-visible status, evidence/decision refs.
2. **Execution** — concrete advancement record, including direct Harness, Workflow, Human and External kinds; native behavior remains provider-owned.
3. **Ref** — typed link to external workspace/resource/context/artifact/profile/native object.

This is enough for user language: “What is this?”, “How is it being advanced?”, “What external things/evidence are attached?” Event history is not a required user-facing object, and Extension is not a user domain object.

### B. Runtime/infrastructure core — maximum 5

1. **Ref/Identity** — typed external/native identities and capability namespaces.
2. **Event** — immutable cross-system fact stream and projection input.
3. **ExecutionProvider** — capability-qualified adapter protocol.
4. **Extension** — loading/versioning/permissions/registration boundary.
5. **Projection/Store** — replaceable persistence and read-model layer.

`Work` and `Execution` are persisted through this runtime layer, but their domain meaning is not the same as Event/Extension/Provider mechanics. If the implementation needs both `ExecutionRecord` and `ExecutionProvider`, that is not two user-facing primitives: one is data, one is an adapter protocol.

## 19. Final Minimal Core

### Recommended schema boundary

```text
Work
  stable id
  objective + completion rule
  lifecycle/status
  refs + execution refs

ExecutionRecord
  stable id
  work id + kind + provider/native refs
  status projection + input/output refs + provenance

Ref
  type namespace + opaque id/uri + version/digest + capabilities

EventLog
  cross-system facts + timestamps + actor/provider + refs

ExtensionRegistry
  provider kinds + ref/event namespaces + capability contracts + projections
```

### Explicit non-members

No Core `State`, `RetryPolicy`, `Node`, `Edge`, `Role`, `Session`, `Workspace`, `Artifact`, `Decision`, `Activity`, `Scheduler`, `Permission`, `Project` or `Monitor` object is justified by this stress test. Each may be an extension/provider object or typed ref. A future product may promote one only after it has an independent lifecycle and user need.

## 20. Final Recommendation

1. Keep the five names only after separating domain and infrastructure layers; do not present them as five equivalent ontology objects.
2. Make Work completion mandatory for ordinary Work. Add explicit Monitor/Automation/Goal/Project extensions for things that are inherently perpetual or aggregating.
3. Define Execution as an identity/provenance envelope with capability-qualified provider operations. Do not promise one behavior for human, workflow, Harness and CI executions.
4. Keep Ref typed and opaque; forbid arbitrary metadata buckets and provider-specific Core fields.
5. Keep Event as internal cross-system facts/provenance, never as a second replay/runtime history.
6. Make Extension registration open and namespaced so six tested providers install without Core changes.
7. Allow a one-shot “direct Harness mode” that creates an implicit Work or execution-only local record; avoid forcing full Work UX for simple tasks.
8. Put coordination, incident, monitoring, permissions, artifact storage, recurring scheduling and workflow semantics in extensions or external systems.

## 21. Direct Answers

**Q1. Can the five primitives cover seven Work types?** Approximately 86% strong/caveated fit. Types A–E and G fit when specialized semantics are extensions; Type F is not ordinary Work and must be reclassified.

**Q2. Minimum non-deletable Work semantics?** Stable identity, intended outcome, closure rule/lifecycle, evidence/context references, and relation to concrete executions/facts.

**Q3. Can Execution unify Direct Harness/Workflow/Human/External?** Yes as an identity/provenance envelope; no as a universal operational state machine. Capability-qualified providers are mandatory.

**Q4. Should Human Action be Execution?** It may be an Execution kind for uniform timeline/correlation, but its rich semantics belong to a HumanInteraction/Activity extension. Do not force process operations on it.

**Q5. Is Event first-class?** Yes internally as cross-system facts/provenance; no as a user-facing domain object or provider replay substitute.

**Q6. Is Ref first-class?** Yes in runtime/schema, as a typed identity utility; no as a universal JSON object or lifecycle abstraction.

**Q7. Is Extension a domain primitive?** No. It is a runtime architecture primitive that enables the domain core to remain stable.

**Q8. Does Continuous Work expose a Work-definition problem?** Yes. Perpetual monitors/responsibilities have no ordinary closure; use Monitor/Automation/Goal and create bounded Works from events.

**Q9. Does Coordination require Workflow/Coordinator?** Yes. Dependencies, retries, branches, joins and scheduling must belong to a Coordinator/Workflow extension or external orchestrator.

**Q10. Final minimal Core?** User-facing: Work, Execution, Ref. Runtime: Ref/Identity, Event, ExecutionProvider, Extension, Projection/Store.

## Core Survival Verdict

> 在 **7 类 Work** 和 **6 种异质 Execution Provider** 压力测试后，当前 Core 是 **Needs Change**；最主要原因是它必须明确拆成“3 个 user/domain primitives + 5 个 runtime primitives”，并把持续型责任、协调调度、权限、artifact lifecycle 和 provider-native state 坚决下沉到 Extension/外部系统，否则 Work 会膨胀成万能容器或 Workflow Engine。
