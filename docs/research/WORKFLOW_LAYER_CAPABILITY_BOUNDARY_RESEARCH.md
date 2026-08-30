# Workflow Layer Capability Boundary Research

> 文档导航：[总目录](../README.md)

> Research date: 2026-08-21.  This is an ownership study, not a feature checklist or a proposal to preserve an existing Agent-Box design. “Native” means a documented first-class model/API in the product; “Partial” means a documented capability with an important lifecycle or ownership gap; “External/User-built” means it can be achieved by application code or an integration but is not owned by the product; “Unsupported” means no credible documented mechanism was found. “Mutable graph” specifically means changing the *definition/topology* of an in-flight instance, not merely updating data or dynamically choosing a pre-authored branch.

## 1. Executive Verdict

**The durable-workflow thesis is substantially true.** Temporal and LangGraph can natively model a durable execution identity, mutable execution data, checkpoints/history, pause/resume, retries, human intervention, branching, parallelism and nesting. A properly designed parent workflow can also retain goals, decision records, references and child workflow links for a long time. Consequently, Agent-Box should **not** introduce a second generic `Attempt`, `Run`, retry state machine, role scheduler, checkpoint store, or workflow-transition engine.

That does **not** make every listed capability “workflow-owned.” Coding workspaces, credentials, git repositories, containers, provider accounts, object storage and harness-native sessions are governed by separate authorities. Mature systems bind or reference these; they do not turn them into workflow-owned objects. Kandev is especially revealing: it already puts tasks, workflows, sessions, profiles, executors, repositories and review surfaces into one product, but its supported production path is task-scoped rather than a generic durable graph runtime.

The evidence supports **Level 2.5 first**: a cross-harness workflow runtime adapter plus a small external, durable namespace for user/project context and resource/artifact references. A future Level 3 `Work` is justified only if it has a lifecycle genuinely independent of every workflow (for example a product/project objective that may outlive, be re-planned through, and remain meaningful after all workflows are deleted). It must not own attempts, roles, sessions, retries, graph state, or provider scheduling.

## 2. Definitions

| Term | Working definition used here | Non-definition / boundary |
|---|---|---|
| Workflow definition | Strategy: graph, state machine, code, task pipeline, routing rules and node bindings. | Not a particular execution. |
| Workflow instance/execution | Durable identity for one logical execution, including its progress/state/history. | In Temporal it may be a chain of runs with one Workflow ID. |
| Run / attempt | Concrete runtime incarnation of an execution, usually with a run ID, worker/activity/task attempts and timings. | Not a higher-level business/work identity. |
| Session | Harness conversation/process identity, often resumable independently of a UI. | It is neither necessarily a workflow nor its source of truth. |
| Work (candidate) | Long-lived goal, decision/constraint record and references that can survive replacement/deletion of workflows. | It does not transition workflow states or schedule actors. |
| Resource / environment | A repository, worktree, container, sandbox, secret, MCP server, credentials or external service. | A workflow normally binds/references it; a resource provider owns lifecycle/access control. |
| Artifact | Durable output reference: file, patch, commit, report, test result or model result, with optional provenance. | An opaque `result` alone is not a general artifact registry. |

## 3. Evaluation Criteria

The tables use **N** = Native first-class; **P** = Partial/limited documented support; **E** = External or application-built; **U** = unsupported/not evidenced. The evidence hierarchy was official docs, then public source documentation/schema. “Long-running” requires durable recovery after process loss, not merely an async method. “Provider replacement” requires preserving the instance’s state while changing the chosen provider/profile; selecting a provider at construction time is only binding. “Artifact” requires a named artifact/result facility, not just returning a Python value.

The systems divide into four different species. Comparing them as if all were durable workflow runtimes would over-credit frameworks and under-credit host products:

1. **Durable runtimes**: Temporal, LangGraph, and (less strongly for mid-run recovery) Prefect.
2. **Agent frameworks**: OpenAI Agents SDK, AutoGen and CrewAI; their loops are programmable but usually need a durable runtime for production-long execution.
3. **Coding control planes**: Kandev and Vibe Kanban; they own task/workspace/session coordination rather than a general graph replay model.
4. **Host/protocol layers**: VS Code Agent Host/AHP and ACP; they standardize a session surface, not a workflow engine.

## 4. System-by-System Analysis

### 4.1 Temporal — durable runtime reference case

Temporal’s central objects are Workflow Definition, Workflow Execution, Workflow ID, Run ID, Event History, Workflow/Activity Task and Worker. A Workflow Execution is explicitly its “main unit of execution”; the service persists state transitions and replays deterministic code after failure. A workflow can run seconds or years, wait on signals/timers, pause, receive updates, spawn child workflows and continue-as-new. `Continue-As-New` creates a new Run ID with a fresh history but preserves the Workflow ID chain; retries also create runs in that chain. This is the clearest proof that *run* belongs to the workflow runtime, not a separate work model. [Workflow Execution](https://docs.temporal.io/workflow-execution) and [Continue-As-New](https://docs.temporal.io/develop/go/workflows/continue-as-new) are explicit about both identities.

State authority is the Temporal service’s append-only event history; the worker’s local state is reconstructible cache/replay state. Inputs, command/activity results, signals and workflow decisions are historical provenance. It supports safe in-flight definition evolution through worker versioning/patches, but this is constrained by deterministic replay; it is not an arbitrary dashboard graph editor. A workflow can dynamically choose future activities/children/providers from persisted state, but “replace Claude with Hermes” is application routing logic plus external provider credentials, not a Temporal agent-profile primitive. [Versioning](https://docs.temporal.io/develop/go/workflows/versioning) explains why old executions must remain replay-compatible.

| Capability | N | P | E | U |
|---|:--:|:--:|:--:|:--:|
| Workflow definition | ✓ | | | |
| Durable state | ✓ | | | |
| Run/Attempt | ✓ | | | |
| Retry | ✓ | | | |
| Resume | ✓ | | | |
| Long-running | ✓ | | | |
| Dynamic branch | ✓ | | | |
| Parallel | ✓ | | | |
| Subworkflow | ✓ | | | |
| Mutable graph | | ✓ | | |
| Human approval | | ✓ | | |
| Provider binding | | | ✓ | |
| Provider replacement | | | ✓ | |
| Role/agent binding | | | ✓ | |
| Resource binding | | | ✓ | |
| Environment | | | ✓ | |
| Workspace | | | ✓ | |
| Artifact | | | ✓ | |
| Provenance | ✓ | | | |
| Cross-session continuation | ✓ | | | |
| Workflow composition | ✓ | | | |

**State ownership:** service event history is authority; execution-local variables are recovered by replay; activity/provider/resource state remains external. **Level-3 proximity:** execution durability is maximal, but Goal/workspace/artifact namespaces are deliberately application-owned.

### 4.2 LangGraph / LangChain — durable mutable agent graph

LangGraph’s central objects are `StateGraph`, node, edge, compiled graph, **thread**, checkpoint, `StateSnapshot`, task and Store. With a durable checkpointer, every super-step records state; a thread ID addresses a persistent execution. It natively exposes current state, full state history, pending writes, interrupts, `update_state`, replay and fork. An interrupt saves state and waits indefinitely; subgraphs inherit persistence or can keep their own. [Persistence](https://docs.langchain.com/oss/python/langgraph/persistence), [interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts), and [subgraphs](https://docs.langchain.com/oss/python/langgraph/use-subgraphs) provide concrete APIs rather than marketing claims.

This is the strongest anti-Level-3 counterexample after Temporal: an application can use one durable parent thread with generic state keys `{goal, decisions, constraints, artifacts, resource_refs, workflow_refs}` and alter future routing based on those values. It can also time-travel/fork. Yet topology is code: dynamic `Command` routing and dynamic fan-out are native, whereas adding arbitrary named nodes or safely replacing a deployed graph is not a durable per-instance graph-editing model. The current docs state that latest graph code applies to resumed threads, so migrations are the developer’s responsibility; state evolution is tolerant only when code is tolerant. [Backward compatibility](https://docs.langchain.com/oss/python/langgraph/backward-compatibility).

Provider/agent/model/tool configuration is naturally node-level code/config. Runtime routing can select a different preconfigured agent and retain thread state, but managed provider-profile replacement/provenance is application-built. The cross-thread `Store` is notable: it explicitly exists because checkpointed thread state cannot share information across threads. It is a durable context layer, not proof that a broad Work state machine is needed.

| Capability | N | P | E | U |
|---|:--:|:--:|:--:|:--:|
| Workflow definition | ✓ | | | |
| Durable state | ✓ | | | |
| Run/Attempt | | ✓ | | |
| Retry | ✓ | | | |
| Resume | ✓ | | | |
| Long-running | ✓ | | | |
| Dynamic branch | ✓ | | | |
| Parallel | ✓ | | | |
| Subworkflow | ✓ | | | |
| Mutable graph | | ✓ | | |
| Human approval | ✓ | | | |
| Provider binding | | ✓ | | |
| Provider replacement | | | ✓ | |
| Role/agent binding | | ✓ | | |
| Resource binding | | | ✓ | |
| Environment | | | ✓ | |
| Workspace | | | ✓ | |
| Artifact | | | ✓ | |
| Provenance | ✓ | | | |
| Cross-session continuation | ✓ | | | |
| Workflow composition | ✓ | | | |

**State ownership:** checkpointer owns thread snapshots/history; Store owns cross-thread data; the graph application owns schema and migrations. **Level-3 proximity:** very high for a single goal, but no native project/work object or resource/artifact lifecycle.

### 4.3 Prefect — flow-run orchestration, not replayable agent state

Prefect’s first-class objects are flow, deployment, flow run, task run, state, work pool/queue, worker and block. A Flow Run is explicitly a single invocation whose state lifecycle is stored in the Prefect database; task/flow retries, concurrent tasks, child subflows, deployments and infrastructure selection are mature. [Flows](https://docs.prefect.io/v3/concepts/flows) and [deployments](https://docs.prefect.io/v3/concepts/deployments) are direct evidence. Work pools bridge orchestration to Docker/Kubernetes/serverless infrastructure and provide defaults/overrides. [Work pools](https://docs.prefect.io/v3/concepts/work-pools).

Its durable control-plane state should not be mistaken for arbitrary resumable Python local state: after process disappearance it can mark a run crashed/zombie and rerun according to policy, but it is not a Temporal/LangGraph checkpoint/replay machine. `pause_flow_run` blocks and requires resumption (default timeout one hour); `suspend_flow_run` is the more infrastructure-releasing mechanism. Artifacts are a first-class Prefect concept (markdown/link/table/progress), but coding files/commits remain external resources. A flow can implement dynamic Python control flow and submit task runs, but there is no native live graph topology mutation nor managed agent-provider replacement.

| Capability | N | P | E | U |
|---|:--:|:--:|:--:|:--:|
| Workflow definition | ✓ | | | |
| Durable state | | ✓ | | |
| Run/Attempt | ✓ | | | |
| Retry | ✓ | | | |
| Resume | ✓ | | | |
| Long-running | | ✓ | | |
| Dynamic branch | ✓ | | | |
| Parallel | ✓ | | | |
| Subworkflow | ✓ | | | |
| Mutable graph | | | ✓ | |
| Human approval | | ✓ | | |
| Provider binding | | | ✓ | |
| Provider replacement | | | ✓ | |
| Role/agent binding | | | ✓ | |
| Resource binding | ✓ | | | |
| Environment | ✓ | | | |
| Workspace | | | ✓ | |
| Artifact | ✓ | | | |
| Provenance | ✓ | | | |
| Cross-session continuation | | ✓ | | |
| Workflow composition | ✓ | | | |

**State ownership:** Prefect DB owns run/task state and result references; process memory and domain state remain application-owned. **Level-3 proximity:** good operational pipeline runtime; not a sufficient generic long-lived mutable coding-work container without external state.

### 4.4 Kandev — coding control plane with task-centric orchestration

Kandev’s public, supported product boundary is a Kanban workbench plus **task-scoped sessions**, workflows/steps, agent profiles, executor profiles, repositories/worktrees and review. The docs explicitly support named sessions, parallel sessions, child tasks/dependencies, multi-repository tasks, workflow step prompts/automations, profile models/modes/permissions/credentials, and local/worktree/Docker/SSH/Sprites executors. [Product docs](https://kandev.ai/docs/) and [feature guide](https://github.com/kdlbs/kandev/blob/main/docs/features.md) substantiate this unusually broad coding environment surface.

The authoritative long-lived object is Task, not a replayable workflow execution. Workflow steps model an editable lifecycle/pipeline and can auto-start an agent or become human review gates. Task documents have revision history; review/PR/diffs are output surfaces. Profile choice is step/session-bound and a user can launch another session/profile, but a hot provider replacement preserving a universal in-flight session state is necessarily harness-dependent. Its Office/team functionality is documented as disabled/feature-flagged rather than a production contract, so it is not counted as native durable multi-agent workflow runtime capability.

| Capability | N | P | E | U |
|---|:--:|:--:|:--:|:--:|
| Workflow definition | ✓ | | | |
| Durable state | | ✓ | | |
| Run/Attempt | ✓ | | | |
| Retry | | ✓ | | |
| Resume | ✓ | | | |
| Long-running | | ✓ | | |
| Dynamic branch | | ✓ | | |
| Parallel | ✓ | | | |
| Subworkflow | | ✓ | | |
| Mutable graph | ✓ | | | |
| Human approval | ✓ | | | |
| Provider binding | ✓ | | | |
| Provider replacement | | ✓ | | |
| Role/agent binding | ✓ | | | |
| Resource binding | ✓ | | | |
| Environment | ✓ | | | |
| Workspace | ✓ | | | |
| Artifact | | ✓ | | |
| Provenance | ✓ | | | |
| Cross-session continuation | ✓ | | | |
| Workflow composition | | ✓ | | |

**State ownership:** task/session/workspace records are Kandev-owned; harness conversation, git and executor state are external/native-harness owned. **Level-3 proximity:** high product integration, but Task is essentially a work item above a UI workflow—important evidence that a control plane may need an external identity, not that it needs a second attempt scheduler.

### 4.5 Vibe Kanban — task/worktree launcher and review board

Vibe Kanban owns project, task card, task attempt, coding-agent selection, isolated git worktree and review flow. Tasks can be created without running an agent or “Create & Start” with the default agent/current branch; the docs explicitly show an attempt creation dialog. It supports several agent CLIs and MCP. [Creating tasks](https://www.vibekanban.com/docs/core-features/creating-tasks) and [overview](https://vibekanban.mintlify.dev/docs) describe it as planning/reviewing workspaces rather than a general durable orchestration engine.

Thus its Task Attempt is a valuable concrete example of a harness-launch record, but it has no documented checkpoint/history replay, subworkflow, graph mutation, human approval primitive or cross-provider state migration. Git/worktree is an external-but-bound resource owned by project/workspace tooling.

| Capability | N | P | E | U |
|---|:--:|:--:|:--:|:--:|
| Workflow definition | | ✓ | | |
| Durable state | | | ✓ | |
| Run/Attempt | ✓ | | | |
| Retry | | ✓ | | |
| Resume | | ✓ | | |
| Long-running | | ✓ | | |
| Dynamic branch | | | ✓ | |
| Parallel | ✓ | | | |
| Subworkflow | | | | ✓ |
| Mutable graph | | | | ✓ |
| Human approval | | ✓ | | |
| Provider binding | ✓ | | | |
| Provider replacement | | ✓ | | |
| Role/agent binding | ✓ | | | |
| Resource binding | ✓ | | | |
| Environment | | ✓ | | |
| Workspace | ✓ | | | |
| Artifact | | ✓ | | |
| Provenance | | ✓ | | |
| Cross-session continuation | | ✓ | | |
| Workflow composition | | | | ✓ |

**State ownership:** board/task/attempt is Vibe Kanban; agent session and filesystem history belong to selected harness/git. **Level-3 proximity:** low as a durable runtime, moderate as a task/workspace workbench.

### 4.6 OpenAI Agents SDK — programmable agent run, durable via integrations

The SDK’s primary objects are `Agent`, `Runner`, `RunState`/result, Session, handoff, tool and trace/span. It natively supports multi-agent handoffs, conditional code, parallel calls, tools, per-tool approval interruption and resuming serialized `RunState`; sessions preserve conversation history across runs using SQLite/Redis/SQLAlchemy/OpenAI Conversations. [HITL](https://openai.github.io/openai-agents-python/human_in_the_loop/), [sessions](https://openai.github.io/openai-agents-python/sessions/), and [tracing](https://openai.github.io/openai-agents-python/tracing/) document these surfaces.

It is deliberately **not** its own crash-proof workflow runtime. Its documentation points to Dapr, Temporal, Restate and DBOS integrations for durable long waits/restarts. An SDK run and trace record provider/model output and tool calls but do not become a general attempt/orchestration control plane. Agent model/provider/tool definition lives on Agent/RunConfig; swapping it during an execution is application routing/new-agent construction. Sandbox/MCP/files exist as tool integrations, not resource lifecycle ownership.

| Capability | N | P | E | U |
|---|:--:|:--:|:--:|:--:|
| Workflow definition | ✓ | | | |
| Durable state | | ✓ | | |
| Run/Attempt | ✓ | | | |
| Retry | | ✓ | | |
| Resume | ✓ | | | |
| Long-running | | | ✓ | |
| Dynamic branch | ✓ | | | |
| Parallel | ✓ | | | |
| Subworkflow | ✓ | | | |
| Mutable graph | | | ✓ | |
| Human approval | ✓ | | | |
| Provider binding | ✓ | | | |
| Provider replacement | | ✓ | | |
| Role/agent binding | ✓ | | | |
| Resource binding | | ✓ | | |
| Environment | | ✓ | | |
| Workspace | | ✓ | | |
| Artifact | | ✓ | | |
| Provenance | ✓ | | | |
| Cross-session continuation | ✓ | | | |
| Workflow composition | ✓ | | | |

**State ownership:** Session store owns conversation memory; a serialized RunState is caller-stored; trace backend owns observability. **Level-3 proximity:** not on its own—use it beneath Temporal/LangGraph/etc.

### 4.7 AutoGen — composable team state, caller-persisted

AutoGen’s central units are Agent, Team/group chat, model client, runtime and `TaskResult`. It can save and load an agent/team state (including model context and group-chat manager state), and the saved state carries a version. The official guide explicitly tells callers to serialize it to file/database and notes custom agents must implement their own state. [Managing State](https://microsoft.github.io/autogen/dev/user-guide/agentchat-user-guide/tutorial/state.html). This is valuable continuation, but it is not a first-class server-side run/history/checkpoint authority.

Roles are team member names and routing/group-chat policy; model client/tool/executor choices are agent construction configuration. Parallel/asynchronous messaging is supported by the runtime, yet graph mutation, formal HITL workflow, artifact registry, environment/resource lifecycle and durable crash recovery require host code or a durable orchestration layer.

| Capability | N | P | E | U |
|---|:--:|:--:|:--:|:--:|
| Workflow definition | ✓ | | | |
| Durable state | | | ✓ | |
| Run/Attempt | | ✓ | | |
| Retry | | | ✓ | |
| Resume | | ✓ | | |
| Long-running | | | ✓ | |
| Dynamic branch | ✓ | | | |
| Parallel | ✓ | | | |
| Subworkflow | | ✓ | | |
| Mutable graph | | | ✓ | |
| Human approval | | | ✓ | |
| Provider binding | ✓ | | | |
| Provider replacement | | | ✓ | |
| Role/agent binding | ✓ | | | |
| Resource binding | | | ✓ | |
| Environment | | ✓ | | |
| Workspace | | | ✓ | |
| Artifact | | | ✓ | |
| Provenance | | ✓ | | |
| Cross-session continuation | | ✓ | | |
| Workflow composition | | ✓ | | |

**State ownership:** caller owns serialized state/database; runtime owns in-process delivery. **Level-3 proximity:** low until embedded in a durable workflow runtime.

### 4.8 CrewAI — Flow state persistence, less complete runtime semantics

CrewAI’s units are Agent, Task, Crew and Flow. Its `@persist` decorator persists Flow state (SQLite by default), can resume under the same state ID, or fork state into a fresh ID; it also provides human feedback and conditional/listener routing. [Flows source/docs](https://github.com/crewAIInc/crewAI/blob/main/docs/v1.15.12/en/concepts/flows.mdx) documents those concrete mechanisms. A Flow can carry typed Pydantic or dictionary state, but persistence is snapshot hydration rather than a Temporal-style authoritative event history/replay engine.

Agent role/model/tool binding is declarative at Crew construction. Replacing an agent/provider mid-flow while preserving agent-native context is user logic. Files, code execution, external knowledge and outputs are tools/storage integrations, not one portable artifact/resource authority. The project advises persistence/deployment for production-long tasks, but this is not equivalent to transparent crash recovery of arbitrary in-flight operations.

| Capability | N | P | E | U |
|---|:--:|:--:|:--:|:--:|
| Workflow definition | ✓ | | | |
| Durable state | ✓ | | | |
| Run/Attempt | | ✓ | | |
| Retry | | ✓ | | |
| Resume | ✓ | | | |
| Long-running | | ✓ | | |
| Dynamic branch | ✓ | | | |
| Parallel | ✓ | | | |
| Subworkflow | ✓ | | | |
| Mutable graph | | | ✓ | |
| Human approval | ✓ | | | |
| Provider binding | ✓ | | | |
| Provider replacement | | | ✓ | |
| Role/agent binding | ✓ | | | |
| Resource binding | | ✓ | | |
| Environment | | ✓ | | |
| Workspace | | | ✓ | |
| Artifact | | ✓ | | |
| Provenance | | ✓ | | |
| Cross-session continuation | ✓ | | | |
| Workflow composition | ✓ | | | |

**State ownership:** Flow persistence provider owns snapshots; Agent/Crew configuration owns role/model data. **Level-3 proximity:** usable application workflow layer but needs external resource, artifact and durable-execution substrate.

### 4.9 VS Code Agent Host / AHP — session host, explicitly not workflow runtime

VS Code Agent Host’s center is an agent **session**, host and client channel. The host owns sessions independently from editor clients; an active turn can continue without a connected client, hosts can be remote next to the workspace, and host state is immutable/reducer-based with reconnection snapshots/actions. [Agent Host architecture](https://code.visualstudio.com/docs/agents/concepts/agent-host) is unusually clear on this boundary. It binds agent adapters, workspace operations, terminals, changesets and client/extension tools.

It has no declared workflow definition/run/retry/graph/subworkflow system. AHP should therefore be treated as a harness/session adapter within a workflow node, whose session identifier and changeset/workspace references are captured as provenance.

| Capability | N | P | E | U |
|---|:--:|:--:|:--:|:--:|
| Workflow definition | | | | ✓ |
| Durable state | | ✓ | | |
| Run/Attempt | | ✓ | | |
| Retry | | | ✓ | |
| Resume | ✓ | | | |
| Long-running | ✓ | | | |
| Dynamic branch | | | | ✓ |
| Parallel | | ✓ | | |
| Subworkflow | | | | ✓ |
| Mutable graph | | | | ✓ |
| Human approval | ✓ | | | |
| Provider binding | ✓ | | | |
| Provider replacement | | ✓ | | |
| Role/agent binding | ✓ | | | |
| Resource binding | ✓ | | | |
| Environment | ✓ | | | |
| Workspace | ✓ | | | |
| Artifact | | ✓ | | |
| Provenance | ✓ | | | |
| Cross-session continuation | ✓ | | | |
| Workflow composition | | | | ✓ |

**State ownership:** host is session/channel source of truth; workspace/filesystem is external OS/git authority. **Level-3 proximity:** none; it is a powerful node runtime.

### 4.10 ACP — interoperable session protocol, not an orchestrator

ACP standardizes client↔agent session interactions: `session/new`, optional `session/load`, prompt, update/progress, permissions/file operations and cancellation. The protocol says loading an existing session is only “if supported.” [ACP overview](https://github.com/agentclientprotocol/agent-client-protocol/blob/main/docs/protocol/v1/overview.mdx). It deliberately does not prescribe workflow state, retries, graph topology, provider replacement, artifact catalog or persistence backend.

| Capability | N | P | E | U |
|---|:--:|:--:|:--:|:--:|
| Workflow definition | | | | ✓ |
| Durable state | | | ✓ | |
| Run/Attempt | | ✓ | | |
| Retry | | | ✓ | |
| Resume | | ✓ | | |
| Long-running | | ✓ | | |
| Dynamic branch | | | | ✓ |
| Parallel | | | ✓ | |
| Subworkflow | | | | ✓ |
| Mutable graph | | | | ✓ |
| Human approval | ✓ | | | |
| Provider binding | | ✓ | | |
| Provider replacement | | | ✓ | |
| Role/agent binding | | | ✓ | |
| Resource binding | ✓ | | | |
| Environment | ✓ | | | |
| Workspace | ✓ | | | |
| Artifact | | | ✓ | |
| Provenance | | ✓ | | |
| Cross-session continuation | | ✓ | | |
| Workflow composition | | | | ✓ |

**State ownership:** implementation-specific agent/harness. **Level-3 proximity:** none; preserve ACP session ID/capabilities as runtime provenance only.

### 4.11 Cline — durable task/session with workspace checkpoints, not graph orchestration

Cline’s documented central object is a **Task**: it has a unique ID/storage directory, conversation, command/code-change/decision history, token/cost/time data, can be interrupted/resumed across sessions, and has Git-based workspace checkpoints. Each task is scoped as “one goal”; Cline automatically compacts long context and `/newtask` packages a distilled handoff into a new task. [Task management](https://docs.cline.bot/core-workflows/task-management), [checkpoints](https://docs.cline.bot/core-workflows/checkpoints), and [commands](https://docs.cline.bot/core-workflows/using-commands) provide unusually direct evidence.

This makes Cline a meaningful counterexample to “a workflow must always be a DAG”: one long coding task can contain plan/act, human approvals, model selection, context compaction, task/session continuity and workspace rollback. But it does not expose a documented graph/subworkflow/retry runtime, and checkpoints are a shadow-Git file snapshot—not authoritative provider/session replay. Multi-root workspaces explicitly disable its checkpoints, demonstrating why workspace lifecycle cannot be assumed to be a workflow invariant. Cline's provider/model/tool configuration is harness configuration; mid-task replacement is not a portable native profile-rebinding API.

| Capability | N | P | E | U |
|---|:--:|:--:|:--:|:--:|
| Workflow definition | | ✓ | | |
| Durable state | ✓ | | | |
| Run/Attempt | ✓ | | | |
| Retry | | | ✓ | |
| Resume | ✓ | | | |
| Long-running | | ✓ | | |
| Dynamic branch | | ✓ | | |
| Parallel | | | ✓ | |
| Subworkflow | | | | ✓ |
| Mutable graph | | | | ✓ |
| Human approval | ✓ | | | |
| Provider binding | ✓ | | | |
| Provider replacement | | ✓ | | |
| Role/agent binding | | ✓ | | |
| Resource binding | ✓ | | | |
| Environment | ✓ | | | |
| Workspace | ✓ | | | |
| Artifact | | ✓ | | |
| Provenance | ✓ | | | |
| Cross-session continuation | ✓ | | | |
| Workflow composition | | | | ✓ |

**State ownership:** Cline owns local task/conversation/checkpoint state; shadow Git owns file snapshot mechanics; selected model provider owns native model sessions. **Level-3 proximity:** medium for a single coding task, but no general workflow composition authority.

### 4.12 Codeg — multi-agent coding workspace, not yet evidenced as durable graph runtime

Codeg’s public repository identifies it as a multi-agent coding workspace aggregating sessions from Claude Code, Codex, OpenCode, Pi and others; it supports main-agent delegation to other agent types within one task and runs as desktop/server/Docker. [Codeg repository](https://github.com/xintaofei/codeg) is sufficient evidence for task/session aggregation and multi-agent coordination, but the currently discoverable public material did not establish a durable workflow graph/checkpoint/run schema or retry/mutation contracts. It would be misleading to infer them from the word “workspace.”

| Capability | N | P | E | U |
|---|:--:|:--:|:--:|:--:|
| Workflow definition | | ✓ | | |
| Durable state | | ✓ | | |
| Run/Attempt | | ✓ | | |
| Retry | | | ✓ | |
| Resume | | ✓ | | |
| Long-running | | ✓ | | |
| Dynamic branch | | ✓ | | |
| Parallel | | ✓ | | |
| Subworkflow | | ✓ | | |
| Mutable graph | | | ✓ | |
| Human approval | | ✓ | | |
| Provider binding | ✓ | | | |
| Provider replacement | | ✓ | | |
| Role/agent binding | | ✓ | | |
| Resource binding | ✓ | | | |
| Environment | ✓ | | | |
| Workspace | ✓ | | | |
| Artifact | | ✓ | | |
| Provenance | | ✓ | | |
| Cross-session continuation | ✓ | | | |
| Workflow composition | | ✓ | | |

**State ownership:** Codeg control-plane/task data versus each integrated CLI's session/state is not fully specified by public evidence. **Level-3 proximity:** potentially similar to Kandev/Vibe but not creditable as a durable runtime without schema/API evidence. Roo Code and Claude Code/Teams are likewise harness/product collaboration surfaces in this comparison; neither changes the durable-workflow ownership conclusion without an equivalent documented execution model.

## 5. Capability Matrix

The preceding per-system tables are the normalized matrix required for comparison. Aggregated conclusion: only **Temporal** earns Native for all core durable-execution items except agent/resource/artifact-specific ownership; **LangGraph** is native for most agent workflow semantics but provider/resource/artifact lifecycle remains application-owned. Prefect is production-grade scheduling/infrastructure but weaker for arbitrary in-flight state recovery. Coding platforms have broader workspace integration but weaker runtime durability/mutation.

## 6. Durable Workflow Analysis

### Can an instance last hours, days, weeks and hundreds of steps?

Yes, for Temporal by explicit design: a Workflow Execution can run seconds or years, and Continue-As-New bounds event history while retaining a Workflow ID chain. LangGraph has durable checkpointers, indefinite interrupts and durable thread state; realistic duration depends on the selected checkpointer/server retention and application idempotency. Prefect can operate long-running deployments but has process/host failure semantics rather than execution replay. CrewAI and AutoGen can persist/reload state but delegate reliable process recovery to the deployer. Kandev/AHP may keep sessions alive independent of UI, but this depends on harness/host lifetime and is not portable across providers.

### Is one durable mutable Workflow Instance enough for most long coding work?

**For a single bounded objective: yes, usually.** Make the workflow’s persistent state explicit and reference large files/patches externally; place human gates at policy boundaries; preserve native session IDs, workspace/worktree IDs and provider invocation metadata per node; use an append-only decision log/state reducer; select providers from versioned profiles; use child workflows for parallel/retry-isolated units. A 100-hour coding objective does not intrinsically require a separate Work object.

Three caveats prevent the word “complete”:

1. A generic workflow does not magically migrate native conversation context from Claude/Codex/Hermes. It can retain canonical summarized state and launch a replacement provider, but semantic continuity needs a portable context protocol.
2. Mutation is bounded. Temporal demands replay-safe changes; LangGraph can dynamically route but arbitrary topology changes/migrations are application responsibilities.
3. A repository/container/secret/credential is not workflow-owned merely because a workflow uses it. It has security/lifecycle semantics outside the run.

## 7. Attempt / Run Analysis

| System | Concrete execution model | Retry / continuation consequence | Provider/model provenance |
|---|---|---|---|
| Temporal | Workflow ID + Run ID, child/activity/workflow task executions. | Retry and Continue-As-New create run chain links; activity attempts are runtime-owned. | Inputs/events/activity scheduling recorded; application should add provider profile/version metadata. |
| LangGraph | Thread + checkpoint/super-step task; server deployments also expose runs. | Retry/replay/fork use checkpoints; thread is durable logical identity, not universally a distinct run object. | State/tracing can record it, but schema is app-defined. |
| Prefect | Flow Run, Task Run and state transitions. | Task/flow retries create run/state lifecycle records. | Parameters/tags/logs are native; exact LLM/provider details user-emitted. |
| Kandev | Task session / task attempt. | New session/attempt/profile is control-plane specific, not generic replay. | Profile/executor/task records provide partial provenance. |
| Vibe Kanban | Task Attempt. | Relaunch is a new attempt around a worktree. | Selected agent/profile is recorded; native conversation continuity varies. |
| OpenAI Agents SDK | `Runner` run/result, RunState and trace/span. | Resume RunState; durable retry ownership belongs to integration runtime. | Trace records generation/tool information; model config is available. |
| AutoGen/CrewAI | Team/Crew/Flow invocation and result/state ID. | Caller or Flow persistence decides retry/resume/fork. | Configuration can be recorded but is not a complete runtime ledger. |
| AHP/ACP | Session and turns. | Agent implementation decides retry/load/restart. | Capability/session information, no standard execution ledger. |

**Verdict:** Agent-Box should not define an abstract attempt state machine. It should normalize `RuntimeExecutionRef`/`NativeRunRef` (including `workflow_id`, `run_id`, task/attempt/session IDs and immutable launch provenance) at the adapter boundary. It may create a *logical execution correlation ID* only when multiple runtimes must be correlated; that ID is not a scheduler-owned Attempt.

## 8. State Ownership Analysis

| System | Authority | Shape/history | Compaction and migration |
|---|---|---|---|
| Temporal | Service event history; worker replay cache is derivative. | Deterministic events, command/activity results; structured inputs/payload converters and external refs. | Continue-As-New compacts history by caller-passed state; versioning/patching protects replay. |
| LangGraph | Checkpointer per thread; optional Store across threads. | Arbitrary schema/channels, snapshots, pending writes, history/forks. | DeltaChannel is beta compaction; graph/state migration is application-owned. |
| Prefect | Server DB run/task states/results. | Operational states/logs/parameters/result storage; arbitrary domain state external. | Deployment versioning, retention/config external; no general checkpoint migration. |
| Kandev/Vibe | Product DB task/session/attempt records. | Task documents, board history, workspace/review records; harness context external. | Product-specific, not portable generic state migration. |
| SDK/frameworks | Caller session/persistence store. | Usually JSON snapshot/conversation history. | Caller manages retention/schema migration. |
| AHP/ACP | Host/agent implementation. | Reducer snapshots/actions in AHP; ACP does not mandate a store. | Host/implementation-specific. |

**Does Work State need to be separate?** No for canonical state of one execution: duplicating it creates split-brain authority. Yes only for data that must cross the *identity boundary* of multiple independent workflows/threads, must remain after their deletion, or needs a project-level access/retention policy. LangGraph’s Store is the concrete precedent: a slim cross-thread context store, not a universal work execution state.

## 9. Provider / Role Binding Analysis

Role is overwhelmingly a workflow-local concept: Temporal calls it activity/child worker type; LangGraph uses node/subgraph/agent; OpenAI/CrewAI/AutoGen use Agent/team member; Kandev uses workflow step plus agent profile. It answers “who/what executes this stage?” It normally loses meaning when the workflow definition is replaced. Stable human team membership or account identity is an IAM/workspace object—not an execution Role.

Provider/profile/model/tool/permission binding should therefore be **workflow definition or runtime launch configuration**, with a profile reference resolved through a secure provider registry. Persist an immutable resolved-profile snapshot/hash in the run provenance. A replacement is a workflow mutation/routing decision: keep canonical workflow state, end/park the old native session, start a new node/session with a new profile, and log the handoff. It is not evidence for an independent Work-owned role engine.

## 10. Resource / Environment Analysis

The systems establish a consistent three-way split:

| Scope | Examples | Owner |
|---|---|---|
| Resource provider | Git repository, cloud account, secret manager, MCP server, container image, knowledge base. | Git/SCM, cloud, secret/MCP/knowledge provider. |
| Workspace/executor allocation | Worktree, Docker/VM/sandbox, local/SSH agent host. | Coding control plane or execution provider; Kandev is broad here, Prefect work pools provision infrastructure. |
| Workflow binding | `repo_ref`, worktree/sandbox ID, profile ID, MCP capability set, secret reference, environment manifest. | Workflow definition/launch and provenance. |

Agent-Box should own **typed references and grants/bindings**, not repository/container/secret lifecycle. It may optionally own a workspace allocation abstraction only if it is actually provisioning/sandboxing it; otherwise use `EnvironmentRef` and adapter-specific capability descriptors. Credentials must remain secret-manager references, never copied into workflow/work state.

## 11. Artifact / Provenance Analysis

Prefect has explicit artifacts; Temporal and LangGraph have excellent execution history but no universal file/commit artifact registry; agent frameworks return outputs/traces; Kandev/Vibe provide review/diff/PR surfaces. In coding work, the durable authority for outputs is normally git/object storage/test system/issue tracker, not an orchestrator database.

Use an external artifact provider plus immutable `ArtifactRef` records: URI/content hash/type/producer native-run-ref/input refs/timestamps/version. Keep a small ordered artifact/reference index on the workflow state (and, if justified, cross-workflow context namespace). Do not create another file store or pretend an LLM message is the source of truth for a patch/commit.

## 12. Mutable Workflow Analysis

| Mutation type | Temporal | LangGraph | Prefect | Coding platforms |
|---|---|---|---|---|
| Conditional path / human-directed path | Native signals/updates/state | Native `Command`, interrupt/resume | Native Python control flow | Workflow step/task transition, generally native |
| Dynamic fan-out / child work | Native activities/child workflows | Native task fan-out/subgraphs | Native task/subflow calls | Kandev child/parallel tasks; Vibe parallel tasks |
| Retry route | Native policies/code | Native checkpoint/retry/routing | Native retry policy | partial/relaunch |
| Rebind provider/node | Application state + activity routing | Application state/config + routing | user code | profile/session UI control, partial |
| Change deployed definition | Versioning/patching, replay constrained | latest graph applies; migration discipline required | deploy new code/version | editable workflow template, not execution-safe migration |
| Arbitrary in-flight topology edit | No | No | No | only task/board edits; no durable semantics evidenced |

So “switch workflow” can often be represented as state-driven dynamic routing, child workflow choice or a versioned parent definition. It cannot always be collapsed: when a new strategy has incompatible state schema, trust boundary, resource lease, retention policy or authorization domain, ending one workflow and starting another is clearer and safer. That is a composition boundary, not automatically a Work object requirement.

## 13. Workflow Composition / Subworkflow Analysis

Temporal child workflows, LangGraph subgraphs (with inherited or independent checkpoint scope), Prefect child flow runs and CrewAI nested flows all answer most multi-workflow cases. Parent state can hold child IDs and pass immutable artifacts/results. For loose coupling, Workflow A emits an artifact/event and Workflow B is independently started with an `ArtifactRef`; a project/context store may index both.

Do **not** use shared mutable state casually across parallel children. Give each child a worktree/resource lease, use immutable artifact handoffs, and have the parent merge/reduce status/decisions. LangGraph reducers and Temporal signals/updates provide execution-level coordination; git/SCM remains merge authority.

## 14. Anti-Level-3 Test

The following deliberately assumes no Work object—only a durable parent workflow (Temporal or LangGraph), external resource/artifact providers and optional cross-thread Store.

| Scenario | Can Level 2 solve it naturally? | Concrete construction | Verdict |
|---|---|---|---|
| A. Claude Planner → Codex Executor → Reviewer → Hermes Planner, state retained | Yes | Persist canonical plan/constraints/decision log/artifact refs; each node has a versioned profile; on replacement route to Hermes and start a new native session with a summarized context/artifact bundle. Record old/new native IDs. | **No Level 3 needed.** Native conversation bytes are not portable, but canonical workflow state is. |
| B. 100 hours, repeated pause/resume/retry/replacement | Yes, strongly with Temporal; yes with LangGraph durable storage subject to operations policy. | Signals/interrupts, timers, retries, Continue-As-New or checkpoint retention; profile rebinding as state transition; external workspace leases renewed. | **No Level 3 needed.** |
| C. Plan→Execute→Review becomes Research→Plan→Execute→Security Review | Yes, with a qualification. | Human update changes route/strategy version; Temporal uses replay-safe patch/versioned child workflow; LangGraph uses dynamic route/deployed compatible graph. | **No Level 3 needed** unless migration incompatible—then compose/replace workflow. |
| D. Parallel units share workspace/state/artifacts | Yes, but avoid one writable workspace. | Parent spawns child workflows/subgraphs with isolated worktrees; state is reduced at parent; shared reads via refs; patches/test reports are artifacts. | **No Level 3 needed.** |
| E. Workflow A researches; Workflow B implements | Yes. | Parent/child composition, or A emits research ArtifactRef and triggers B with it; cross-thread Store/index only if independent lifetimes are intended. | **No Level 3 needed.** |

Result: all five requested scenarios are natural Level-2 constructions. None requires Work to own transition, role, session, retry or attempt semantics.

## 15. Remaining Independent Semantics

| Candidate | Truly independent? | Why not simply parent-workflow state? | Value after workflow deletion? | Real analogue | Verdict |
|---|---|---|---|---|---|
| Goal / Objective | Sometimes | A bounded goal can be input/state. A portfolio/project objective may select many independently authorized workflows over months. | Yes, if it is a user/project record. | Kandev task/project; issue trackers. | Potential small Work/project object only at product scope. |
| Durable cross-workflow context | Sometimes | Parent can own child context; independent workflows need a shared store/retention policy. | Yes. | LangGraph Store. | Level 2.5 Context namespace. |
| Cross-workflow decision log | Sometimes | Parent event/state history suffices for one tree; a decision accepted across trees is a project governance record. | Yes. | ADRs/issues/docs. | External document/artifact with refs; do not create scheduler state. |
| Resource namespace | Yes, but not as lifecycle owner | Parent can bind refs, but shared resources need IAM/leases independent of run. | Yes. | Kandev workspace/repositories; cloud/SCM. | External provider + typed ref/grant. |
| Artifact namespace | Yes, as index only | Parent can store refs; independent artifact discovery/retention outlives execution. | Yes. | Git/object store/Prefect artifacts. | External provider + index/ref. |
| Work identity | Sometimes | Workflow ID works for one evolving objective; aggregation across workflows needs a business correlation ID. | Yes. | Project/issue/task IDs. | Optional thin correlation record. |
| Completion criteria | Usually no | It controls execution termination and belongs in definition/state. A contractual acceptance criterion may be project metadata. | Often. | Workflow condition / issue acceptance criteria. | Workflow-owned by default; external only if governance artifact. |

The test is strict: if deleting every workflow still leaves a meaningful user-visible object with access/retention/governance value, it may be Work/project context. If not, keep it in workflow state. A Work object that merely copies graph state, active role, retry count, session pointers and current provider has no independent semantics and creates split brain.

## 16. Ownership Boundary Matrix

| Concept | Workflow-owned | Runtime-owned | External Provider | Potential Work-owned | Verdict |
|---|---|---|---|---|---|
| Goal | bounded objective/input | | issue/project system | portfolio objective | Workflow by default; thin external record only when cross-workflow. |
| Workflow definition | ✓ | deploy/version enforcement | source control | | Workflow-owned. |
| Workflow state | ✓ | checkpoint/event persistence | optional durable store | | One authority: runtime-backed workflow state. |
| Role | ✓ | node scheduling | identity/IAM | stable human membership only | Downsample to workflow node/agent binding. |
| Profile binding | ✓ | resolved launch snapshot | profile/secret registry | | Definition/launch-owned. |
| Provider binding | ✓ | invocation provenance | provider account/model API | | Definition/launch-owned. |
| Attempt/Run | | ✓ | harness-native run | | Runtime-owned; normalize refs only. |
| Session | | ✓ | harness/host storage | | Runtime/harness-owned. |
| Retry | ✓ | execution of policy | | | Workflow policy + runtime implementation. |
| Resource | binding/reference | lease observation | SCM/cloud/MCP/secret manager | namespace/index | Provider-owned lifecycle. |
| Environment | manifest/binding | executor allocation | container/VM/sandbox | | Executor/provider-owned. |
| Workspace | binding/worktree strategy | session attachment | git/worktree/IDE host | project namespace | External/control-plane allocation. |
| Artifact | output reference | capture/provenance | Git/object storage/test/PR system | index/catalog | External canonical storage. |
| Decision | execution decision log | event history | docs/issue system | cross-workflow governance log | Workflow default; external only when independent. |
| Context | execution context | checkpoint/store | knowledge/doc store | cross-workflow context | Level 2.5 store, not duplicate state. |
| History | logical event/checkpoint history | ✓ | trace/log backend | audit index | Runtime authority. |
| Provenance | fields/schema | event/run trace | model/provider/SCM metadata | cross-run index | Capture at runtime, optionally index outside. |
| Completion criteria | ✓ | evaluate/status | contract/issue tracker | contractual criteria | Workflow-owned by default. |

## 17. Level 2 vs 2.5 vs 3

### 1. **B — Level 2.5: Workflow Runtime + external persistent Context/Resource layer (confidence 0.78)**

Use a durable workflow adapter/runtime as the execution authority. Add a deliberately small cross-workflow namespace: `ContextRef`, `DecisionRef`, `ResourceRef`, `EnvironmentRef`, `ArtifactRef`, `WorkflowRef`, access policy and correlation/goal metadata. It has no Run/Attempt/session/retry/role state machine. This matches LangGraph’s thread+Store split and the actual external ownership of coding resources.

### 2. **A — Level 2: cross-Harness Workflow Runtime (confidence 0.66)**

For a product focused on one objective per durable parent workflow, this is enough and should be the implementation baseline. It has the least conceptual duplication. It falls behind B when independently started workflows must share durable, governed context/artifact/resource discovery after their parents have completed.

### 3. **C — Level 3: independent Work object (confidence 0.34)**

Only promote to C after concrete evidence of persistent product/project objects that (a) outlive all workflows, (b) require cross-workflow access/retention/decision governance, and (c) cannot be an issue/project/context namespace. If adopted, it must remain a thin business correlation and reference object. Making it own active execution semantics would reimplement mature workflow/runtime behavior.

## 18. Final Recommendation

1. **Stop designing Work as an execution core.** Do not add Agent-Box-owned `Attempt`, retry/resume, role/session, provider scheduler, checkpoint/history, graph mutation or artifact lifecycle abstractions.
2. **Make a durable workflow instance the default long-running work container.** Prefer Temporal semantics where crash-proof multi-day execution is required; use LangGraph where graph state/HITL/time travel is the agent-facing primitive. Treat Prefect as an infrastructure/scheduled-flow option, not a universal checkpoint engine.
3. **Normalize at adapter boundaries, do not erase native identities.** Persist `WorkflowRef`, `NativeRunRef`, `NativeSessionRef`, resolved profile/provider snapshot, workspace/environment binding and external `ArtifactRef` as provenance.
4. **Build Level 2.5 only as a reference/context layer.** Start with immutable/append-oriented decisions, goal metadata and typed references. Let external Git/SCM/object-store/secret/MCP providers own their material lifecycle.
5. **Gate a future Work object with a deletion test.** If all workflow instances disappear and the proposed data is still a valuable user/project-governance record, it can be Work. Otherwise it belongs to workflow state or runtime history.

### Direct answers to the five required questions

**Q1 — coverage:** approximately **80%** of the requested *execution* capability surface is already mature in the strongest durable runtimes (Temporal ~85%, LangGraph ~80%); across the whole sampled ecosystem it is ~55–65% because coding platforms/frameworks do not offer all durable-runtime guarantees. The missing 20% is mainly not “workflow features”: portable provider-session migration, universal workspace/resource lifecycle, cross-provider artifact catalog and cross-workflow governance.

**Q2 — Attempt/Run:** **Yes, almost completely.** It should be runtime-owned. Agent-Box needs immutable native-run correlation/provenance references, not an independent Attempt lifecycle. A cross-runtime logical correlation ID is acceptable but is not a retry scheduler.

**Q3 — Role/Profile/Provider binding:** **Role and profile/provider binding belong to workflow definition/launch/runtime.** Stable human/account identity belongs to IAM/workspace; it is not a workflow role. Replacement is a logged workflow routing/mutation plus new native session.

**Q4 — long Work vs durable mutable Workflow:** for one objective, it usually adds **no independent value**. It earns value only as cross-workflow, long-lived project/goal/context/governance identity after workflows end or are deleted.

**Q5 — choice:** **1) B Level 2.5 (0.78), 2) A Level 2 (0.66), 3) C Level 3 (0.34).** The ranking is intentionally anti-Level-3: prove the small external context/reference layer insufficient with real product scenarios before promoting it to an execution-owning Work core.
