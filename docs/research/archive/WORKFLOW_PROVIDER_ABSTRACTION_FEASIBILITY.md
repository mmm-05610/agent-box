# Workflow Provider Abstraction / Control Plane Feasibility
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 文档导航：[总目录](../README.md)

Research date: 2026-08-21. This document evaluates whether Agent-Box can sit above several workflow runtimes as a portable semantic layer or control plane. It is intentionally adversarial: an adapter is credited only when the target runtime preserves the source meaning, not merely when glue code can be written.

## 1. Executive Verdict

There is **not** a sufficiently rich, lossless common workflow language across Temporal, LangGraph, Prefect, Restate, DBOS, CrewAI, AutoGen and the OpenAI Agents SDK. Their shared surface is real but shallow: identify a logical execution, start it, observe it, provide an external input, cancel it, and retrieve a provider-native reference. Above that, the authorities diverge:

* Temporal is an event-history/deterministic-replay system with Workflow ID/Run ID chains, signals/updates, activities and child workflows.
* LangGraph is a graph-state/checkpoint/thread system with super-step reducers, dynamic interrupts, replay and state forks.
* Prefect is a server-observed Flow/Task Run state machine with infrastructure work pools and Python execution; it is not a replay-equivalent checkpoint runtime.
* Restate is a journaled durable-process runtime with workflow keys, durable promises, state and timers.
* DBOS is a Postgres-backed annotated function/step runtime with transactional workflow state and recovery.
* CrewAI, AutoGen and OpenAI Agents SDK are agent/application frameworks whose persistence and durability are more configurable or integration-dependent.

**Recommendation:** choose **C + a constrained part of D**:

1. **C — Native Workflow + unified Control Plane** is the primary product boundary.
2. Add a deliberately small **portable common envelope** (definition metadata, input/output references, profile/harness/resource bindings, lifecycle commands and provenance), but do not promise a portable graph/state/retry/mutation IR.
3. Permit provider-native definitions and an explicit, isolated escape hatch. A future IR should be an *interchange/inspection format* or a compiler for a declared subset, not the source of truth for all runtimes.

Confidence: C-first 0.82; C + narrow D 0.76; full portable IR B 0.38; self-built runtime A 0.18.

The durable workflow report reached a similar Level-2.5 conclusion. This report narrows it further: an external context/reference and observability layer is portable; execution semantics are not.

## 2. Problem Definition

Three directions must remain distinct:

| Direction | Agent-Box owns | What the runtime still owns | Feasibility |
|---|---|---|---|
| A. Harness Adapter | launch/load/prompt/cancel, capability/profile projection, workspace binding and native session refs for Claude/Codex/Hermes/OpenCode | Coding-agent loop and native conversation | High; existing strategy is sound. |
| B. Self-built Workflow Runtime | graph, state, checkpoint, retry, scheduling, crash recovery, HITL, composition | Harness only | Low strategic value; competes with mature durable engines. |
| C. Workflow Control Plane/Adapter | native workflow registration, lifecycle operations, portable references, bindings, provenance and observability projections | graph/state/checkpoint/retry/transition semantics | High if deliberately non-semantic; risky if advertised as migration portability. |

The key question is not “can an adapter translate method calls?” It is: **does translating a workflow preserve the target runtime’s important guarantees and the author’s intended meaning?**

## 3. Workflow Runtime Semantic Models

### 3.1 Temporal

**First-class objects:** Workflow Definition, Workflow Execution, Workflow ID, Run ID, Event History, Workflow Task, Activity, Child Workflow, Signal, Update, Timer and Worker. The [Workflow Execution reference](https://docs.temporal.io/workflow-execution) says an execution is the main unit of execution, owns exclusive local state, communicates through signals/activities, and is recoverable by replay. An execution can last seconds or years. A Workflow ID plus Run ID identifies an execution; retries and Continue-As-New form a Workflow Execution Chain. [Continue-As-New](https://docs.temporal.io/develop/go/workflows/continue-as-new) closes one run and starts another with the same Workflow ID and a fresh event history.

**Identity authority:** Temporal service; Workflow ID is the stable logical identity and Run ID is a concrete history/run incarnation. **State authority:** service event history; worker memory is a replay cache. **Transition authority:** deterministic workflow code emits commands; service records events. **Parallelism/composition:** activities, futures/selectors and child workflows. **Retry:** activity retry policy, workflow retry/chain and Continue-As-New are distinct. **Mutation/versioning:** Signals/Updates can alter data and future routing; arbitrary code changes are constrained by deterministic replay and handled with worker versioning/patching ([versioning](https://docs.temporal.io/develop/go/workflows/versioning)). **HITL:** signal/update plus a durable wait. **Long-running:** native and explicit.

### 3.2 LangGraph

**First-class objects:** Graph/StateGraph, Node, Edge, compiled graph, Thread, State, Checkpoint, StateSnapshot, task, Command, Interrupt, Subgraph and optional Store. With a checkpointer, every super-step is persisted and a `thread_id` addresses accumulated state and its history. [Persistence](https://docs.langchain.com/oss/python/langgraph/persistence) documents snapshots, pending writes, state history, replay and forks; [interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts) suspend at arbitrary code points and resume with `Command`; [subgraphs](https://docs.langchain.com/oss/python/langgraph/use-subgraphs) distinguish per-invocation, per-thread and stateless persistence.

**Identity authority:** the checkpointer/server owns Thread ID and checkpoint namespace; a run is a graph invocation over a thread, not a Temporal-equivalent run chain. **State authority:** checkpoint snapshots/reducer outputs; Store is cross-thread memory. **Transition authority:** graph nodes, edges, reducers and `Command` routing. **Parallelism/composition:** super-steps execute scheduled nodes concurrently; subgraphs may inherit or own checkpoints. **Retry:** replay from a checkpoint/fork, node/task retry and application idempotency—not the same as activity retry. **Mutation/versioning:** dynamic route and `update_state` are native; deployed graph code applies to resumed threads and migration compatibility remains application responsibility ([backward compatibility](https://docs.langchain.com/oss/python/langgraph/backward-compatibility)). **HITL:** dynamic interrupt with serialized payload/resume value. **Long-running:** native with durable checkpointer/server, subject to storage and idempotency design.

### 3.3 Prefect

**First-class objects:** Flow (decorated Python function), Deployment, Flow Run, Task, Task Run, State, Work Pool/Queue, Worker and Block. A [Flow Run](https://docs.prefect.io/v3/concepts/flows) is a single invocation; its state lifecycle is recorded in the Prefect database. Tasks and child flows provide concurrency, caching, retries and composition. Work pools bridge orchestration and Docker/Kubernetes/serverless infrastructure ([work pools](https://docs.prefect.io/v3/concepts/work-pools)).

**Identity authority:** Prefect server/database for Flow Run and Task Run. **State authority:** operational run state/results in the database; arbitrary Python local state is not automatically replayable. **Transition authority:** Python control flow plus Prefect task/flow scheduling. **Parallelism/composition:** futures, tasks and child flows. **Retry:** task/flow retries with delay/limits; a retry is a state transition of a run, not Temporal event replay. **Mutation/versioning:** deploy new code/deployment; no generic in-flight graph migration. **HITL:** pause/suspend flow APIs and external UI/input, but pause duration and execution-host semantics matter. **Long-running:** operationally supported, but a crashed process may become Crashed/Zombie and be rerun; do not equate this with deterministic recovery from an arbitrary program point. [States](https://docs.prefect.io/v3/concepts/states) explicitly distinguishes run states from flow/task templates.

### 3.4 Restate

**First-class objects:** Service/Handler, Workflow, workflow key, `WorkflowContext`, journaled steps, durable promises, state, timers, signals/events and retry policies. Restate describes itself as a runtime for durable processes; completed steps are journaled and replayed after failure, and state can be queried beyond a process invocation ([overview](https://docs.restate.dev/), [workflows](https://docs.restate.dev/tour/workflows)).

**Identity authority:** a workflow key, commonly a business key, within a service/workflow type. **State authority:** Restate journal/state store. **Transition authority:** ordinary application code executing through durable context actions. **Parallelism/composition:** async calls, promises and workflow handlers. **Retry:** transient/terminal error policies, journal replay and cancellation; not interchangeable with Temporal activity retry. **Mutation/versioning:** code/version compatibility and handler routing are runtime/application concerns; no universal graph editor. **HITL:** durable promises, signals and webhook/event waiting. **Long-running:** native, but state retention defaults and key semantics differ from Temporal. Restate is closer to a durable-process adapter target than to a graph DSL.

### 3.5 DBOS

**First-class objects:** annotated Workflow function, Step, workflow ID/status, Postgres-backed execution history, durable queue, scheduled job and transaction. [DBOS workflow docs](https://docs.dbos.dev/python/tutorials/workflow-tutorial) state that an interrupted workflow recovers from its last completed step; [Why DBOS](https://docs.dbos.dev/why-dbos) describes days/weeks execution and Postgres durability; status includes execution attempts ([workflow/step reference](https://docs.dbos.dev/golang/reference/workflows-steps)).

**Identity authority:** DBOS workflow ID and Postgres/control plane. **State authority:** database transactions and step records. **Transition authority:** application code/annotations. **Parallelism/composition:** durable queues, child workflows and language concurrency helpers. **Retry:** recovery/dequeue attempts and step re-execution with database semantics; not Temporal’s event-command model. **Mutation/versioning:** registered code and schema migrations are application concerns. **HITL:** durable sleep/events/queues can implement it, but it is less of a named workflow-interrupt abstraction. **Long-running:** native; Conductor provides operational control plane/retention as a separate product ([architecture](https://docs.dbos.dev/architecture)).

### 3.6 CrewAI

**First-class objects:** Flow, Flow State, Agent, Task, Crew, kickoff, listeners/routers, human feedback and `@persist`. Persistent Flow state can resume under the same ID or fork from a state snapshot ([Flow persistence](https://github.com/crewAIInc/crewAI/blob/main/docs/v1.15.12/en/concepts/flows.mdx)).

**Identity authority:** Flow/state ID and the application persistence provider. **State authority:** persisted Flow snapshot; agent conversation state is separate. **Transition authority:** decorators/listeners/routers and Crew process. **Parallelism/composition:** crews, asynchronous tasks and nested flows. **Retry:** task/process/application retry, not a uniform durable engine contract. **Mutation/versioning:** Python Flow code and configuration; no cross-runtime graph migration. **HITL:** human feedback APIs/async providers. **Long-running:** persistence and deployment help, but crash-proof exactly-once semantics depend on deployment and user code.

### 3.7 AutoGen

**First-class objects:** Agent, Team/group chat, model client, runtime, messages and TaskResult. Teams and agents expose `save_state`/`load_state`; state includes model context and manager/thread data and is explicitly serializable by the caller ([state guide](https://microsoft.github.io/autogen/dev/user-guide/agentchat-user-guide/tutorial/state.html)).

**Identity authority:** application/runtime; saved team state is caller-owned. **State authority:** serialized agent/team state, not a server-side workflow history. **Transition authority:** team termination condition, speaker selection and message delivery. **Parallelism/composition:** async agents/teams and nested tools. **Retry/HITL/long-running:** patterns exist but durable recovery, approval storage and scheduling are external. AutoGen is a framework to embed, not a portable workflow engine target with a stable execution contract.

### 3.8 OpenAI Agents SDK

**First-class objects:** Agent, Runner, RunResult/RunState, Session, handoff, tool approval, trace/span and model client. The SDK offers handoffs, parallel patterns, human approval interruptions and serialized state; sessions persist conversation history. Its own documentation directs durable long-running use to Temporal, Restate, DBOS and Dapr integrations ([running agents](https://openai.github.io/openai-agents-python/running_agents/), [HITL](https://openai.github.io/openai-agents-python/human_in_the_loop/), [sessions](https://openai.github.io/openai-agents-python/sessions/)).

**Identity authority:** caller/session store and trace backend; a Runner invocation is not a durable workflow execution. **State authority:** Session/RunState chosen by caller. **Transition authority:** Runner loop, handoffs, guardrails and application code. **Retry/long-running:** integration-owned. **Composition/HITL:** strong at agent-loop level but not a general durable graph contract.

### 3.9 Kandev, Vibe Kanban and Codeg

These are coding control planes rather than interchangeable workflow runtimes.

* **Kandev:** Task, Workflow/Step, named Session, Agent Profile, Executor Profile, Workspace/Repository and review artifacts. Its docs support parallel sessions, child tasks, workflow events, local/worktree/Docker/SSH/Sprites executors and profile permissions ([docs](https://kandev.ai/docs/), [features](https://github.com/kdlbs/kandev/blob/main/docs/features.md)). Task/session/workspace records are the product authority; harness execution is an integration boundary.
* **Vibe Kanban:** Project, Task, Task Attempt, agent selection, isolated git worktree and review. An attempt is a launch/review record, not a replayable workflow run ([task creation](https://www.vibekanban.com/docs/core-features/creating-tasks)).
* **Codeg:** public materials describe a multi-agent coding workspace aggregating sessions and delegating sub-agents inside a task ([repository](https://github.com/xintaofei/codeg)); insufficient public schema exists to credit it with a portable durable workflow model.

## 4. Common Semantic Subset

The table evaluates a candidate IR. **Exact** means meaning and authority survive; **Reasonable** means a useful projection exists but important semantics differ; **Lossy** means translation is possible only by changing behavior or delegating to opaque provider code; **Impossible** means no honest common meaning exists without making one provider emulate another.

| Semantic | Temporal | LangGraph | Prefect | Restate | DBOS | CrewAI | OpenAI/AutoGen | Truly portable? |
|---|---|---|---|---|---|---|---|---|
| WorkflowDefinition | Exact | Exact | Reasonable | Reasonable | Reasonable | Reasonable | Lossy | **Reasonable only** |
| WorkflowInstanceRef | Exact ID+Run chain | Reasonable thread/checkpoint | Exact FlowRun | Exact key/execution | Exact workflow ID | Reasonable state ID | Lossy session/run | **Reference envelope, not shared identity** |
| Node/Step | Exact activity/child | Exact node/task | Exact task/flow | Reasonable durable action | Exact step | Reasonable task/listener | Lossy agent/tool turn | **Reasonable** |
| Dependency/Edge | Exact code/await | Exact edge/reducer | Reasonable Python/futures | Reasonable code control | Reasonable code control | Reasonable listeners | Lossy handoff/loop | **Reasonable for DAG subset** |
| Input/Output | Exact payload/event | Exact serializable state | Exact parameters/results | Exact calls/state | Exact function/step values | Reasonable typed state | Reasonable messages/results | **Yes, with refs** |
| StateRef | Event history | Checkpoint/thread | Run state | Journal/state | DB records | Snapshot | Caller session | **Opaque native ref only** |
| ContextRef | App payload/memo | Store/thread | External result | Workflow state | DB/external | Flow state | Session | **Yes as external reference** |
| ResourceRef | Activity/external | config/tool/runtime | Block/work pool | service/dependency | DB/queue/runtime | tool/executor | tool/sandbox | **Yes as binding metadata** |
| ArtifactRef | External activity output | state/store/external | artifact/result | handler output/external | step output/external | output/file | result/file | **Yes as external ref** |
| ProfileRef | App activity routing | config/node | deployment/work pool | service config | worker/config | agent/LLM config | Agent/model config | **Yes as launch metadata** |
| HarnessRef | Activity implementation | node/tool implementation | task body | handler | step | agent/task | tool/agent | **Yes as adapter contract** |
| Condition | deterministic code | Command/reducer | Python | code/promise | code | router/listener | app loop | **Only as declarative subset** |
| ParallelGroup | child/activity futures | super-step/fan-out | futures/task runner | async calls | durable concurrency | async tasks | parallel calls | **Lossy barrier/error semantics** |
| HumanGate | signal/update/wait | interrupt/Command | pause/suspend | promise/signal | event/queue/sleep | feedback | approval/RunState | **Lifecycle envelope only** |
| ChildWorkflow | first-class child | subgraph | child Flow | handler/workflow call | child workflow | nested Flow/Crew | nested agent | **Lossy; opaque child ref** |
| RetryPolicy | activity/workflow/chain | replay/task/idempotency | task/flow retry | transient error/replay | recovery/attempt | task/app policy | integration/app | **No single exact policy** |
| TimeoutPolicy | multiple workflow/activity timers | app/timeouts/checkpoint | flow/task timeout | durable timer | durable timeout/sleep | app/deployment | runner/integration | **Only coarse deadline** |
| CompletionCondition | workflow return/close | END/terminal state | FlowRun terminal state | workflow completion | return/status | Flow result | result/termination | **Yes, coarse** |

The real common subset is therefore approximately:

```text
PortableExecutionEnvelope {
  definition_ref, instance_ref, input_refs, output_refs,
  profile_ref, harness_ref, resource_refs, artifact_refs,
  lifecycle operations, status projection, provenance, trace links
}
```

It is a **control/provenance envelope**, not a portable execution semantics.

### Matrix 2 — Provider comparison

| Provider | Identity | State authority | Retry | Mutation/versioning | Composition | HITL | Resource | Agent binding |
|---|---|---|---|---|---|---|---|---|
| Temporal | Workflow ID + Run ID chain | Event history/replay | Activity/workflow policies, Continue-As-New | Signals/Updates; replay-safe patches/worker versions | Child Workflows | Signals/Updates/waits | Activities/external | Application activity/profile routing |
| LangGraph | Thread + checkpoint/run | Checkpointer + Store | Replay/fork/task retry/idempotency | `Command`, `update_state`, latest graph compatibility | Subgraphs | Dynamic `interrupt` + `Command` | Config/tools/external | Node/subgraph config |
| Prefect | FlowRun + TaskRun | Server DB run states | Task/flow retry | New deployments/Python control flow | Child flows/tasks | Pause/suspend/input | Work pools/blocks/executor | Task/deployment code |
| Restate | Workflow/service key | Journal + keyed state | Transient/terminal policy + journal replay | Handler/code versioning; no common graph migration | Durable calls/promises | Promises/signals/events | Services/dependencies | Handler configuration |
| DBOS | Workflow ID/status/attempt | Postgres step/transaction records | Recovery/dequeue/step semantics | Registered code/schema/application migration | Queues/child workflows | Durable sleep/events/queues | DB/queue/runtime | Step/application config |
| CrewAI | Flow/state ID + kickoff | Persisted Flow state | Task/app policy | Python Flow/listener code | Nested Flows/Crews | Human feedback | Tools/executor | Agent/Crew/LLM config |
| OpenAI Agents SDK | Runner run/RunState/session/trace | Caller session/RunState | App or durable integration | Agent/handoff code | Handoffs/agents-as-tools | Tool approval interruptions | Tools/sandboxes/MCP | Agent/model/client config |
| AutoGen | Agent/team/runtime invocation | Caller-saved team state | App/runtime | Team/message policy | Nested teams/tools | App pattern | Executors/tools | Agent/model client |
| Kandev | Task/session/workspace | Product task/session records + harness | Session/relaunch policy | Workflow step/task edits | Child tasks/parallel sessions | Review/approval steps | Repositories/executors/workspaces | Step/profile/session |
| Vibe Kanban | Project/task/attempt | Board/attempt + harness/git | Relaunch/task policy | Board/task edits | Parallel tasks | Review UI | Git worktrees | Selected agent |
| Codeg | Task/session aggregate (publicly evidenced) | Product + integrated CLI (not fully specified) | Not evidenced as common runtime | Delegation/task behavior | Main-agent subagents | Product/harness-dependent | Workspace/CLI | Integrated agent sessions |

The rows are intentionally not normalized into one “workflow object.” They show why the portable object should be a reference and capability envelope.

## 5. Semantic Mismatches

### State: event history is not a snapshot

Temporal’s event history is executable replay input; changing a past decision can violate determinism. LangGraph’s checkpoint is an inspectable state snapshot with reducer writes, pending writes, time travel and forks. Prefect state is an operational status object around a Python run; it does not reconstruct arbitrary local variables. Restate journals completed actions; DBOS stores completed steps/transactions in Postgres. A `get_state()` API can project all of these to JSON, but only by discarding the authority and recovery semantics that matter.

**Verdict:** expose `NativeStateRef`, `StateSummary`, and optional `StateProjection`; do not define a universal `State` that Agent-Box can read/write as if it were authoritative.

### Execution identity: only correlation is portable

Temporal’s Workflow ID/Run ID chain is not equivalent to LangGraph’s Thread plus checkpoint ID, Prefect’s FlowRun, Restate’s workflow key or CrewAI’s persisted state ID. A native reference must retain provider, native kind, logical ID, concrete execution ID, version and URL. Agent-Box may issue a correlation ID that links multiple native executions, but must not claim they are the same runtime identity.

### Retry: same word, different guarantee

Temporal Activity RetryPolicy controls attempts around an Activity and interacts with event history; workflow retries/Continue-As-New alter execution chains. LangGraph replay can re-execute LLM/API calls and requires idempotent side effects; successful parallel writes may be reused. Prefect can retry a TaskRun/FlowRun and track `AwaitingRetry`, but host crashes can produce `Crashed`/`Zombie`. Restate replays journaled actions; DBOS recovers completed steps transactionally. A portable `max_attempts` field is not enough to preserve these guarantees.

**Verdict:** portable policy may express intent (`retry transient failures`, `deadline`, `idempotency key`); exact policy remains provider extension.

### Mutation: five different meanings

1. Choose a runtime branch from state.
2. Dynamically fan out work.
3. Edit state/checkpoint and resume.
4. Deploy a new definition for future executions.
5. Migrate an in-flight execution to a new definition/provider.

Temporal supports (1), (2), signals/updates for data, and controlled (4)/(5) through replay-safe versioning. LangGraph supports (1), (2), checkpoint edits/forks and dynamic interrupts, but latest graph code/migration responsibility is application-owned. Prefect and CrewAI support Python-level (1)/(2) but not a common in-flight migration contract. Calling all five “mutable workflow” would produce a false portable feature.

### Composition: child, subgraph, subflow and nested agent are not isomorphic

Temporal Child Workflow has a service-owned lifecycle and event relationship. LangGraph subgraph has checkpoint namespace and configurable per-invocation/per-thread memory. Prefect child FlowRun has server state but shares Python process/context patterns. CrewAI nested Flow/Crew is application composition. An adapter can preserve a `child_ref` and a parent-child correlation, but cannot promise equivalent cancellation, state visibility, retry, or history behavior.

### Human intervention: lifecycle envelope only

Signal, interrupt, pause, approval, feedback, durable promise and resume token all mean “external input can unblock progress,” but differ in when state is persisted, whether the node re-executes, what payload is legal, whether the process is released, and whether approval is tied to a tool call. Portable IR should model a `HumanGate` with `request_ref`, `decision`, `resume`, and `timeout`; provider-specific behavior must remain visible.

## 6. Minimum-Common-Denominator Risk

An interface of `create()`, `start()`, `pause()`, `resume()`, `cancel()`, `status()`, `get_state()` is a **lifecycle abstraction**, not a workflow semantic abstraction. It has value for a dashboard, automation API and adapter boundary, but weak value as a workflow authoring product. `get_state()` cannot safely mean “read and mutate authoritative state” across event histories, snapshots, operational states and caller-owned memory.

The opposite failure is a “rich common IR” that adds graph nodes, reducers, retry modes, child workflows, state migration, dynamic routing and HITL semantics. To preserve each target, the compiler must add provider-specific code, wrapper tasks and state stores. At that point Agent-Box has either:

* reimplemented the runtime’s semantics (Architecture A), or
* produced a lowest-common-denominator wrapper and required users to escape constantly.

**Classification:** the honest common layer is B/C hybrid only at the control-plane boundary: richer than start/stop/status because it unifies refs, bindings, capabilities, lifecycle intent, artifact/provenance and observation; not rich enough to claim workflow-definition portability.

## 7. Portable Workflow IR

### What can be portable

A constrained IR can describe a **logical plan**:

```yaml
workflow:
  api_version: agentbox.dev/v0
  steps:
    - id: planner
      kind: harness_call
      harness_ref: planner-profile
    - id: coder
      kind: harness_call
      depends_on: [planner]
    - id: reviewer
      kind: harness_call
      depends_on: [coder]
      output_schema: review-result
  transitions:
    - when: reviewer.approved == true
      to: complete
    - when: reviewer.needs_fix == true
      to: coder
  bindings:
    resources: [workspace-ref]
    artifacts: [patch-ref, test-report-ref]
```

The compiler can produce a Temporal workflow function, a LangGraph StateGraph, a Prefect Flow, or a CrewAI Flow **for the declared subset**. The IR is useful for validation, UI, policy, static inspection, and a simple-native runner. It must label generated output as provider-specific and preserve the source spec as a plan, not pretend it is a portable recovery history.

### Coverage estimate

For the requested semantics, a strict same-behavior portable IR covers approximately **45–55%**:

* 90%: node/step identity, dependencies, serializable inputs/outputs, coarse terminal status, external artifact/resource references, profile/harness metadata.
* 70%: straightforward sequential/branching/fan-out workflows.
* 50%: coarse deadlines, human gates and parent-child correlation.
* 20–35%: retry semantics, state inspection/mutation, provider replacement, composition and version migration.
* 0–15%: preserving Temporal replay, LangGraph reducer/checkpoint/fork behavior, Prefect work-pool scheduling, Restate journal semantics or DBOS transactional exactly-once guarantees in one target-neutral model.

The overall estimate is not an average of feature checkboxes: the lower-level semantics dominate correctness. A 50% IR that compiles to unsafe recovery behavior is not “half a workflow engine”; it is a useful plan/control envelope.

## 8. Compiler Feasibility Test

### Workflow A — Planner → Coder → Reviewer loop

**Portable:** nodes, dependencies, structured review output, branch intent, profile/harness/resource/artifact refs and completion status.

**Temporal:** compile to deterministic workflow code; Planner/Coder/Reviewer become activities or child workflows. Review result drives an activity/child route. Retry is provider-specific; native session references are activity payload/provenance. Human-driven `needs_replan` is a Signal/Update. **Glue:** activity wrappers, payload schemas, determinism constraints, provider-specific retry.

**LangGraph:** compile nodes/edges and a typed reducer state; reviewer returns `Command(goto=...)`. **Glue:** state schema/reducers, checkpointer, idempotent tasks, interrupt handling. **Loss:** the portable loop does not define checkpoint granularity or reducer conflict semantics.

**Prefect:** compile Flow/Tasks and Python conditional loop. **Glue:** task result serialization, task/flow retry and deployment/work-pool config. **Loss:** no equivalent replay/checkpoint mutation semantics.

**CrewAI:** compile Flow listeners/routers and Agent/Crew calls. **Glue:** persisted Flow state, typed output validation, task/agent configuration. **Loss:** Agent/Crew process and recovery semantics are not equivalent to Temporal/LangGraph.

**Result:** 75–85% of the *logical plan* maps; 40–55% of execution semantics map without an escape hatch.

### Workflow B — Researcher A/B → barrier → Synthesizer → Planner

**Portable:** parallel group, join/barrier, artifact refs, partial-failure policy, timeout intent.

**Temporal:** child/activity fan-out, `Promise.all`/selectors, explicit join and RetryPolicy; artifact refs are activity outputs. **Glue:** define whether partial success is an event, state, or child result; exact cancellation and timeout policies.

**LangGraph:** parallel nodes in a super-step with reducer channels, then Synthesizer edge. **Glue:** reducers for concurrent writes and checkpointer; failure behavior may leave pending writes and resume semantics. **Loss:** super-step boundaries and reducer conflict semantics are not portable.

**Prefect:** submit task futures and wait; task states support partial failure and retries. **Glue:** work pool/concurrency and result storage. **Loss:** no common checkpoint barrier or replay guarantee.

**CrewAI:** async tasks/Flow listeners can implement fan-out/join. **Glue:** synchronization and persistence code. **Loss:** no provider-neutral barrier/recovery contract.

**Result:** 60–75% logical mapping; 30–45% same failure/retry semantics.

### Workflow C — multi-day Plan → Execute → Human Approval → Security Review → Fix → Release

**Portable:** ordered stages, external HumanGate, deadlines, artifacts, workspace/resource refs, child review, coarse provider replacement and terminal completion.

**Temporal:** excellent native fit: durable waits/signals, activity/child workflows, long timers, retries, Continue-As-New and explicit versioning. Provider replacement is a state transition to a new activity/profile and native session, not a runtime feature. **Glue:** provider session context migration and workspace leases.

**LangGraph:** excellent state/HITL fit with checkpointer/interrupts/subgraphs; dynamic route and state inspection are strong. **Glue:** idempotency, graph deployment compatibility, large-state externalization. **Loss:** no universal in-flight graph/provider migration.

**Prefect:** Flow pause/suspend, task retries and work pools work operationally. **Glue:** external state, human input storage, workspace lease and run recovery. **Loss:** arbitrary code replay and provider replacement semantics.

**CrewAI:** persisted Flow state and human feedback can model it. **Glue:** deployment durability, structured state, provider/session replacement. **Loss:** strong runtime recovery/attempt semantics.

**Result:** 70–85% logical plan; only Temporal/LangGraph provide a naturally strong runtime target. A compiler that promises all four targets are equivalent is misleading.

## 9. Provider-specific Escape Hatches

An IR may expose:

```yaml
portable:
  retry:
    intent: transient_failure
    max_attempts: 3
provider_extensions:
  temporal:
    activity_retry_policy: {...}
    continue_as_new: {...}
  langgraph:
    reducers: {...}
    checkpoint_namespace: ...
  prefect:
    work_pool: ...
    task_runner: ...
  crewai:
    persist_backend: sqlite
```

Escape hatches are legitimate when they are explicit, namespaced, versioned and visible in the UI/provenance. They become a design failure when:

* more than roughly **25–30% of semantic behavior** in a definition lives in provider extensions;
* an extension changes the meaning of a portable field rather than refining it;
* the same workflow cannot be validated without importing a provider SDK;
* a provider extension is required for correctness, recovery or security rather than optimization;
* extensions leak into shared state schema or lifecycle APIs.

At that threshold the definition is native to that provider and should be stored/declared as such. Agent-Box may still index and operate it, but should stop calling it portable IR.

## 10. Workflow Portability Demand

### Migration portability

Likely low. Users rarely migrate a mature Temporal/LangGraph workflow by translating its source code because the runtime is selected for reliability model, language, deployment, history, observability, team expertise and operational ecosystem. Migration is expensive precisely because semantic details matter. Vendor lock-in is a real concern, but an opaque adapter cannot remove it without weakening guarantees.

### Multi-runtime operation

More credible. An organization may use Temporal for payments/long waits, LangGraph for agent reasoning/HITL, Prefect for data/infrastructure scheduling, DBOS for Postgres-centric services and a simple runner for local coding. A single control plane can discover native definitions, launch executions, attach the same profile/harness/resource catalog, correlate artifacts/traces and expose common lifecycle actions. This is not migration portability; it is **operational federation**.

### Unified observability/management

Strongest demand. OpenTelemetry succeeds because it standardizes telemetry semantics and context, not because it makes databases execute the same query plan. OTel’s [semantic conventions](https://opentelemetry.io/docs/concepts/semantic-conventions/) use common names for traces, metrics, logs, profiles and resources while preserving backend behavior. Agent-Box can apply the same pattern to workflow/run/node/harness/artifact/provenance events.

**Conclusion:** portability is primarily a control-plane and observability demand; definition migration is a secondary, subset-only demand.

## 11. Multi-runtime Control Plane

A realistic Agent-Box can host:

```text
Control Plane
  WorkflowCatalog      native definition refs + optional portable plan
  ExecutionRegistry    NativeWorkflowRef + status projection + correlation
  BindingRegistry      ProfileRef / HarnessRef / ResourceRef / EnvironmentRef
  ArtifactIndex         external ArtifactRef + hashes/producers
  Provenance            normalized events + native trace links
  LifecycleGateway      start / signal-or-input / pause-if-supported / cancel
  CapabilityRegistry    supports_resume, supports_state_read, supports_human_gate...

Providers
  Temporal adapter | LangGraph adapter | Prefect adapter | Restate adapter | DBOS adapter | ...

Harness adapters
  Claude Code | Codex | Hermes | OpenCode | AHP/ACP sessions
```

The adapter contract should return capability-qualified operations, not pretend all providers support all methods:

```text
register_native_definition(ref, metadata)
start(definition_ref, input_refs, bindings) -> NativeWorkflowRef
send_input(ref, payload) -> NativeEventRef
request_pause(ref) -> {accepted | unsupported | pending}
resume(ref, token_or_payload)
cancel(ref)
get_status(ref) -> normalized status + native status
get_projection(ref) -> safe summary, never universal authoritative state
subscribe_events(ref) -> normalized event envelope
```

This is materially richer than a mere wrapper because it unifies identity correlation, capability negotiation, bindings, artifact/provenance, policy and observability. It remains intentionally weaker than a runtime’s execution semantics.

## 12. Harness Adapter Combination Value

The two-sided model has real value because workflow runtimes and coding harnesses fail at different boundaries:

```text
Portable execution envelope / control plane
        ↓ provider adapter
Temporal | LangGraph | Prefect | Restate | DBOS
        ↓ node/task/activity adapter
Harness Runtime Adapter
        ↓
Claude Code | Codex | Hermes | OpenCode | ACP/AHP
```

Agent-Box can preserve a workflow-engine-neutral `HarnessBinding` containing profile projection, capability requirements, workspace/environment references, native session ref and handoff/context package. It can normalize provenance from a Temporal Activity calling Codex, a LangGraph node calling Claude, or a Prefect task launching OpenCode. It can also show whether a requested operation is native, emulated or unsupported.

The combination is **not** multiplicative for free. Provider×harness testing grows quickly; state/context transfer between native sessions remains lossy; permissions and workspace lifecycles vary; each runtime’s retry behavior can re-invoke a harness. The product must make the boundary explicit and avoid retrying non-idempotent coding side effects blindly.

## 13. Architecture A/B/C Comparison

| Architecture | Strengths | Structural weaknesses | Verdict |
|---|---|---|---|
| A. Self-built Workflow Runtime | Full coherent semantics; one native UX; no provider drift. | Rebuilds durable state/replay, retry, scheduling, timers, HITL, composition, scaling and operations; competes with Temporal/LangGraph/DBOS. | Reject unless Agent-Box’s primary product is itself a runtime and it has a unique execution model. |
| B. Portable Workflow Compiler/IR | Write once for a graph subset; static validation/UI; can target simple runner and multiple providers. | 45–55% same-semantics coverage; state/retry/mutation/HITL/composition escape hatches; migration promises become unsafe. | Useful as optional subset/interchange, not primary authority. |
| C. Control Plane only | Works with native definitions; captures real runtime strengths; multi-runtime operations and unified bindings/observability are valuable; lower semantic debt. | Provider APIs differ; lifecycle projection is partial; cannot offer one graph authoring experience. | Best primary architecture. |
| D. B + C hybrid | Control plane always works; IR handles a declared common subset; native definitions remain first-class. | Requires strict product language and compiler/version discipline. | Recommended: C first, narrow D second. |

## 14. Existing Precedents

### Successful precedents and what they actually standardize

* **Terraform Providers:** Terraform owns a stable resource/data-source lifecycle and provider schema protocol; providers own resource semantics. The provider schema is machine-readable and versioned ([provider framework](https://developer.hashicorp.com/terraform/plugin/framework/providers), [schema command](https://developer.hashicorp.com/terraform/cli/commands/providers/schema)). Terraform does not make AWS, Kubernetes and GitHub resources execute the same way; it standardizes desired resource management and planning.
* **Kubernetes CRD/controller:** the API standardizes desired state, status and reconciliation; controllers retain domain-specific semantics. It is a control-plane pattern, not a portable implementation language.
* **OpenTelemetry:** standardizes names/attributes/events and context for observability, while each system keeps execution semantics. This is the closest precedent for Agent-Box’s useful cross-runtime layer.
* **OCI/container runtime:** standardizes image/config/runtime interfaces around a strong artifact/process boundary, not arbitrary application scheduling semantics.
* **LLVM IR:** succeeds because it targets a constrained, compiler-oriented machine model with explicit semantics; it is not a common representation of every language runtime, database transaction or distributed scheduler.
* **SQL:** has a stable declarative relational model, but dialects, transaction isolation, extensions and query planners still matter; “SQL portability” routinely stops at a declared subset.

### Workflow portability precedent

Common Workflow Language (CWL), WDL, BPMN/BPEL and scientific workflow formats demonstrate that a DAG/task interchange subset is possible. They usually standardize inputs, outputs, tools, dependencies and metadata—not deterministic event histories, graph-state reducers, provider retries, long-lived human gates or runtime migration. Historical workflow interoperability efforts therefore support a **portable plan subset**, not a universal durable runtime IR.

No credible mainstream product was found that transparently lets one rich workflow definition execute equivalently on Temporal, LangGraph, Prefect and CrewAI. Existing “adapters” generally wrap one engine, convert a task/agent call, or expose lifecycle/telemetry—not preserve execution semantics.

## 15. Absorption / Commoditization Risk

### Risk 1 — LangGraph/Temporal/Kandev absorb harness adapters

High over time. VS Code Agent Host/AHP, ACP, OpenAI Agents integrations and coding workbenches are already converging on session/tool/workspace adapters. If each workflow runtime directly supports Claude/Codex/Hermes, a harness-only Agent-Box layer loses differentiation.

### Risk 2 — common abstraction collapses to wrapper

High for full portability. If the public API is start/stop/status plus opaque refs, the product is a valuable operations gateway only if it adds unified bindings, access policy, provenance, artifacts and observability. It should not market itself as portable workflow authoring.

### Risk 3 — abstraction becomes a second runtime

High if Agent-Box owns state mutation, retries, child lifecycle, graph migration or universal HumanGate semantics. Each feature must either emulate provider semantics poorly or become an independent runtime (Architecture A).

### Risk 4 — escape-hatch pollution

High. The 25–30% semantic threshold above is a practical stop rule. If exceeded, store the workflow natively and expose an indexed control-plane view.

### Risk 5 — users do not migrate workflow runtimes

Medium-high. Migration portability is likely an architecture concern rather than a frequent buying requirement. Multi-runtime operations and auditability are more credible.

### Risk 6 — adapter maintenance cost

High. Temporal, LangGraph, Prefect, Restate and DBOS have different versioning, SDK languages, deployment models and event schemas. CrewAI/AutoGen/OpenAI add framework churn. Build adapters around stable HTTP/CLI/API surfaces and capability probes; do not mirror every SDK type.

### Risk 7 — double-sided combination complexity

High. Provider × harness combinations, context conversion, retry idempotency, workspace leases and provenance normalization require contract tests and explicit capability states. The value exists only if Agent-Box owns the cross-product operational problem better than each vendor’s native integration.

## 16. Ownership Matrix

| Concept | Agent-Box owns | Workflow Provider owns | Harness Runtime owns | External owns |
|---|---|---|---|---|
| Native workflow definition | catalog/ref/index | source of truth | | SCM/registry may store source |
| Portable plan subset | optional validated IR | compiler target | | SCM |
| Workflow instance/run identity | correlation ID + native ref | authoritative native identity/history | native task/session ref | |
| State/checkpoint/replay | projection metadata only | authoritative state/recovery | native conversation state | databases used by provider |
| Transition/branch/parallelism | intent metadata/policy | execution semantics | harness turn/tool loop | |
| Retry/timeout | intent and policy envelope | exact retry/timeout behavior | native tool retry | external side-effect idempotency |
| Human gate | request/decision index and UI | signal/interrupt/pause semantics | approval/tool permission | identity/notification systems |
| Provider/profile binding | registry, projection, audit | node/task/activity binding | model/tool configuration | credentials/secrets |
| Harness binding | adapter contract/capabilities | task/activity implementation | session/process semantics | |
| Resource/environment | refs, grants, policy | binding/lease hints | workspace process/files | SCM/cloud/secret/MCP/container provider |
| Artifact | index, hash/provenance link | output capture hooks | files/diffs/commits produced | Git/object store/test/PR system |
| Observability | normalized events/correlation/UI | native events/traces | native trace/session events | OTel/log backend |
| Version/migration | catalog compatibility metadata | runtime versioning/migration | harness/session compatibility | deployment registry |

## 17. Product Boundary

Agent-Box should promise:

* one catalog for native workflow definitions and provider capabilities;
* a normalized `WorkflowRef`/`ExecutionRef` envelope preserving every native ID rather than replacing it;
* lifecycle commands with explicit `supported`, `emulated`, `pending` and `unsupported` results;
* profile/provider/harness/resource/environment binding metadata and capability validation;
* a Harness Adapter that launches/loads/prompts/cancels coding agents and preserves native session refs;
* artifact references, hashes, workspace/worktree refs and end-to-end provenance;
* unified status/event/log/trace projections, ideally via OpenTelemetry-compatible attributes;
* optional portable plan IR for the 45–55% declared subset, with provider extensions isolated and visible;
* native escape-hatch access and no claim that `get_projection()` is authoritative workflow state.

Agent-Box should **not** promise:

* one state model or one checkpoint format;
* identical retry/timeout behavior;
* portable event-history replay or reducer semantics;
* arbitrary in-flight graph mutation or state migration across providers;
* equivalent child workflow/subgraph semantics;
* universal provider/session context migration;
* ownership of repositories, containers, credentials, artifacts or harness conversations;
* that all providers are interchangeable merely because they implement lifecycle methods.

## 18. Final Ranking

1. **C — Native Workflow + unified Control Plane (0.82 confidence).** Most defensible demand: federated execution management, bindings, provenance, artifacts and observability. Runtime-native definitions remain authoritative.
2. **D — C plus a narrow portable common subset/IR and native escape hatch (0.76 confidence).** Valuable for simple plans, validation, templates and a simple runner; must never hide semantic loss.
3. **B — Portable Workflow IR + provider adapters as the primary authoring model (0.38 confidence).** Only credible for a restricted DAG/task subset; not for durable agent workflows with replay, checkpoint, HITL and mutation.
4. **A — Self-built Workflow Runtime (0.18 confidence).** Highest implementation and operational risk, least differentiated from mature runtimes, and duplicates the capabilities Agent-Box should consume.

## 19. Recommendation

Implement Agent-Box as a **workflow federation/control plane with two adapters**:

1. Keep the Harness Adapter as the stable lower-level contract.
2. Add Workflow Provider Adapters that register native definitions and return capability-qualified lifecycle/projection/event operations.
3. Define a portable `ExecutionEnvelope` and `PlanSubset` rather than a universal Workflow State/Retry/Mutation model.
4. Use native workflow source as the source of truth; generated provider code must be marked compiled/native and retain a back-reference to the plan.
5. Make `NativeWorkflowRef`, `NativeRunRef`, `NativeSessionRef`, `ArtifactRef`, `ResourceRef`, `ProfileRef` and provenance first-class Agent-Box records.
6. Build compiler tests for A/B/C workflows and require semantic-diff reports. A provider adapter must disclose which guarantees are exact, lossy or extension-only.
7. Stop expanding the IR when provider extensions exceed 25–30% of behavior or are required for correctness/recovery.

### Eight direct answers

**Q1. Is there a strong common semantic layer?** Yes for control/provenance/refs; no for durable execution semantics.

**Q2. Can it be stronger than start/stop/status/resume?** Yes, if it adds capability negotiation, native identity correlation, bindings, artifact/provenance, event projections and policy. It is not stronger by inventing a universal state/retry model.

**Q3. Is Portable Workflow IR realistic?** Only as a declared subset/interchange plan: about **45–55%** same-behavior coverage for the requested agent-workflow features, substantially higher for simple DAGs and lower for recovery/mutation.

**Q4. Do users need portability?** Migration portability is weak; multi-runtime control and unified observability/management are materially more credible.

**Q5. Compete with runtimes or sit above them?** Sit above them. Self-building a competing runtime is not justified by the evidence.

**Q6. Does the two-sided abstraction create value?** Yes: unified workflow-engine-neutral harness binding, capabilities, provenance and resources are a real cross-product problem. The value is operational federation, not semantic erasure.

**Q7. Ranking?** 1) C, 2) D, 3) B, 4) A, with the confidence values above.

**Q8. If LangGraph and Temporal natively support Claude/Codex/Hermes tomorrow, what remains?** A narrower but defensible Agent-Box role remains: cross-runtime catalog and lifecycle gateway, workflow↔harness/resource/profile binding policy, native-reference correlation, artifact/provenance index, unified observability and multi-runtime operations. If Agent-Box’s only proposed value is portable agent binding or a universal workflow DSL, that value is structurally at risk of absorption.

## One-sentence answer

Agent-Box should become a unified layer **above** Workflow Runtimes only as a control plane that standardizes references, capabilities, bindings, artifacts, provenance and observation—plus a visibly limited common plan subset—and it should absolutely not standardize authoritative state, replay, retry, scheduling, graph mutation, child-workflow semantics or resource/harness lifecycles.
