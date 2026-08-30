# Agent-Box Core Ontology Research
>
> Historical record — describes an earlier architecture or validation state and is not current implementation guidance.
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 文档导航：[总目录](../README.md)

Research date: 2026-08-21. This study asks which object should be the natural user-facing center above a coding Harness Adapter. It does not assume that Workflow, Work, or the existing Work Core is correct. The test is lifecycle, authority, deletion-survival and user mental model—not how many fields an object can contain.

## 1. Executive Verdict

The most natural primary object for an Agent-Box-like coding product is a **Task/Case**, but it should be implemented as a **thin Objective + Execution record**, not as a second workflow runtime and not as a universal Work container.

The important distinction is structural:

* A **Task** is a bounded request with an expected completion boundary and an immediately understandable user action (“fix this test failure”).
* A **Goal** is the intended outcome, but by itself is too broad and has no reliable activity/closure boundary.
* A **Workspace** is the persistent place/resources/context, but cannot answer what is being completed.
* A **Workflow** is a strategy for progressing, but cannot naturally represent exploratory or human-first work without becoming a generic case container.
* A **Session/Thread** is continuity of one agent interaction, not continuity of the work itself.
* A **Project** is a portfolio/aggregation boundary; it is too coarse for the default coding action.
* A **Work/Case** is useful only when it has real case semantics: an issue can remain open while its process changes, multiple executions and human actions can be attached, and the record remains valuable after an execution is abandoned. If it is only `{workflow_refs, session_refs, artifact_refs}`, it is a weak container and should be deleted.

### Recommendation

Use a **Task/Case primary object** with a small core:

```text
TaskCase (bounded objective + lifecycle)
ExecutionRef (direct harness, workflow, human or external execution)
Ref (resource, workspace, artifact, context and native IDs)
Event (append-only facts/provenance)
Extension (workflow, harness, memory, UI and integrations)
```

This is a deliberately narrow **TaskCase**, not a mandatory Work layer. It supports a one-shot Codex run, a two-day exploratory task, several workflows, human edits, reopen and external triggers. It becomes a Project only when users explicitly aggregate many independent TaskCases. Goal is a field/contract on TaskCase, not a separate top-level object by default; Workspace is a first-class referenced resource, not the work identity.

Ranking:

1. **Task/Case-centric with Workspace and Goal as orthogonal references — confidence 0.84**
2. **Goal + Workspace dual core with TaskCase as a thin execution-facing projection — confidence 0.68**
3. **Event core + thin TaskCase projection — confidence 0.61**

Workflow-centric is fourth (0.43): excellent for structured execution, poor for direct/human-first work. A broad Work-centric model is fifth (0.39): valid only if it acquires real case semantics; otherwise it is a renamed container.

## 2. Problem Definition

The lower layer is assumed to expose a Harness Adapter for Claude Code, Codex, Hermes, OpenCode and future harnesses: `launch`, `load/resume`, `prompt`, `cancel`, `close`, capability query, profile projection, workspace binding and native session reference. The ontology above it must decide:

1. What the user creates and closes.
2. Which identity survives changes of Workflow, Harness, provider and session.
3. Where human work, artifacts and resources attach.
4. What happens when there is no workflow at all.
5. Which objects are runtime/provider-owned versus Agent-Box-owned.

The product should use the smallest set of domain objects that can explain all twelve scenarios. Storage representation (Markdown, JSON, Git, database, object storage) is not itself an ontology decision.

## 3. Candidate Models

### A — Workflow-centric

`Workflow` owns state, nodes, runs, resources, artifacts and sessions. Natural for Plan→Execute→Review, dynamic branches and parallelism. It becomes awkward when a user explores for two days without a fixed DAG, makes manual edits, or abandons one workflow while the underlying goal/context persists. It also risks duplicating Temporal/LangGraph semantics.

### B — Task-centric

`Task` is the user’s bounded request; Workflow, Session, Workspace, Artifact and Review are ways of executing or completing it. Kandev, Vibe Kanban and Cline strongly support this shape. It is lightweight for “fix this test” and can hold multiple attempts. The risk is vague Task scoping: a “task” can silently become a project unless completion, reopen and child boundaries are explicit.

### C — Work/Case-centric

`Work`/`Case` is a durable issue record with objective, context, decisions, linked activities/executions, documents, resources and closure. A case may be non-linear and have multiple processing routes. SAP describes a Case as a central collection of information for a complex issue, with linked documents, notes, activities, processors, change history and a process route that can change during processing ([Case Management](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/c9b5e9de6e674fb99fff88d72c352291/45f1bb353b5406f7e10000000a155369.html)); Oracle explicitly characterizes cases as long-running, multi-party, document-heavy and iterative/non-linear ([What’s Case Management?](https://docs.oracle.com/en/cloud/saas/fusion-service/fairs/what-s-a-case.html)).

This is structurally different from a container **only if** it owns case identity, closure/archival, obligations/decisions and linked evidence—not if it just groups refs.

### D — Goal-centric

`Goal` is the why; workflows and sessions are execution strategies. It is durable and provider-neutral, but goals can be fuzzy, nested, recurring or unbounded. “Improve the architecture” has no obvious closure; a Goal object tends to expand into Project/Initiative/Task semantics.

### E — Workspace-centric

`Workspace` is the enduring coding scene: repository, worktree, files, tools, environment, memory, sessions and artifacts. VS Code Agent Host is close to this operationally: the host runs next to the workspace, owns sessions independent of clients, and the session can continue when the editor is disconnected ([Agent Host](https://code.visualstudio.com/docs/agents/concepts/agent-host)). A workspace cannot naturally say what constitutes completion, which obligations remain, or why a change is being made.

### F — Event-centric

The core is stable identity plus append-only facts and projections: `goal_created`, `harness_started`, `artifact_created`, `human_decision`, `workflow_started`, `completed`. This is a strong internal architecture for auditability and multiple projections, but a poor sole user object. Users need an actionable record, not an event-sourcing implementation detail.

### G — Goal + Workspace

Two orthogonal objects answer “why?” and “where?”; `Execution` joins them. This avoids putting repositories into a Goal or intent into a Workspace. It is elegant for multi-workflow work, but introduces two user-facing objects before a simple task can start and still needs a Task/Case boundary for closure and review.

### H — Project-centric

`Project` contains goals, workflows, sessions, resources and artifacts. Linear deliberately separates Project (a unit with a clear outcome or planned completion date) from Issues (granular implementation), and Initiative from Projects ([Projects](https://linear.app/docs/projects), [Initiatives](https://linear.app/docs/initiatives)). Project is therefore a useful aggregation layer, not the natural one-shot agent object.

### I — Thread/Session-centric

The Session/Thread contains conversation, context and agent execution. VS Code calls a session the unit of work with an agent and supports handoff between agents ([Sessions and handoff](https://code.visualstudio.com/docs/agents/concepts/sessions)); LangGraph uses Thread as the checkpoint identity. This is excellent for continuity of one agent interaction, but incorrectly equates conversation continuity with work continuity: a user can change Harness, run parallel sessions, edit files manually or replace the workflow while the same task remains open.

## 4. Evaluation Framework

Scores are 1–5: 5 = naturally first-class with little special casing; 3 = workable but needs explicit extensions; 1 = structural mismatch. “No-workflow support” means a direct Harness or human-first path without inventing a fake graph. “Avoids workflow duplication” penalizes objects that own graph/retry/checkpoint semantics already supplied by runtimes.

| Model | Ontological clarity | Completion boundary | No-workflow | Single workflow | Multi-workflow | Direct harness | Human action | Long continuity | Parallelism | Resource continuity | Artifact continuity | Avoids over-abstraction | Avoids workflow duplication | Developer mental model | Pi extensibility | Total / 75 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Workflow | 3 | 4 | 1 | 5 | 5 | 2 | 2 | 4 | 5 | 3 | 3 | 2 | 1 | 3 | 3 | 41 |
| Task | 5 | 5 | 5 | 4 | 4 | 5 | 5 | 4 | 4 | 4 | 4 | 4 | 4 | 5 | 5 | 66 |
| Work/Case | 4 | 4 | 5 | 4 | 5 | 5 | 5 | 5 | 4 | 5 | 5 | 2 | 4 | 3 | 4 | 64 |
| Goal | 4 | 2 | 4 | 4 | 5 | 4 | 5 | 5 | 4 | 4 | 4 | 2 | 4 | 3 | 4 | 56 |
| Workspace | 5 | 1 | 4 | 4 | 4 | 5 | 4 | 5 | 4 | 5 | 5 | 2 | 5 | 4 | 5 | 58 |
| Event | 3 | 3 | 5 | 4 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 5 | 2 | 5 | 66 |
| Goal + Workspace | 5 | 3 | 4 | 5 | 5 | 4 | 5 | 5 | 5 | 5 | 5 | 3 | 5 | 3 | 4 | 66 |
| Project | 4 | 3 | 2 | 4 | 5 | 2 | 4 | 5 | 4 | 5 | 5 | 2 | 5 | 3 | 3 | 51 |
| Thread/Session | 4 | 3 | 5 | 4 | 2 | 5 | 3 | 3 | 3 | 3 | 3 | 4 | 5 | 5 | 5 | 55 |

The tied totals are intentional. Task/Case wins on user clarity and closure; Event, Goal+Workspace and Work/Case score well architecturally but need a thin user-facing boundary. No score licenses implementing all named objects.

## 5. Scenario Stress Tests

### Summary matrix

| Scenario | Workflow | Task | Work/Case | Goal | Workspace | Event | Goal+Workspace | Project | Thread/Session |
|---|---|---|---|---|---|---|---|---|---|
| 1. One-shot test fix | Overweight; fake workflow needed | **Natural** | Natural but slightly formal | Too broad | Missing intent | Internal only | Overweight | Overweight | Natural but no durable issue boundary |
| 2. One 2-hour workflow | Natural | **Natural** | Natural | Needs execution boundary | Supports environment only | Projection | Natural | Possible | Natural but workflow relation external |
| 3. Strategy changes, same target | New graph/version or mutation | **Same Task, new Execution/strategy** | Same Case, process route changes | Same Goal | Same Workspace | Events show change | Same pair, new execution | Same Project | Session may split/handoff |
| 4. Two-day exploratory/human-first | Awkward fake DAG | **Natural** | **Natural** | Natural but unbounded | Natural scene, weak closure | Projection | Needs Task | Too broad | Natural conversation, weak work identity |
| 5. Parallel A/B/C workflows | Parent workflow required | **Task with child executions** | **Case with linked activities** | Natural | Shared workspace risk | Natural event stream | Natural | Natural | Multiple sessions need external parent |
| 6. Workflow abandoned, context remains | Orphaned state unless external parent | **Task remains; execution replaced** | **Case semantics strongest** | Goal survives | Workspace survives | Events survive | Goal/workspace survive | Project survives | Sessions do not explain continuity |
| 7. Human-first | Poor unless human is a node | **Natural** | **Natural** | Natural | Natural | Natural projection | Natural | Possible | Session only captures conversation |
| 8. 100-hour project | One giant graph is bad | Many Tasks + Project | Many Cases + Project | Goal/Initiative above | Workspace(s) | Stream + projections | Project-like pair needed | **Natural aggregation** | Many sessions |
| 9. Weakly coupled features | Separate workflows/graphs | **Two Tasks** | Two Cases | One Goal or two | One repo/workspace | Separate streams | Same workspace, separate goals | One Project + issues | Separate sessions |
| 10. Fork/merge | Native branch semantics | Task with child executions/artifacts | Case activities/branches/evidence | Goal with alternatives | Workspace branches | Event graph | Goal + workspace branches | Project branches | Thread fork only conversation |
| 11. Reopen after bug | New workflow/run, same issue needed | **Reopen Task or linked follow-up** | **Reopen Case / new case activity** | Goal usually unchanged | Workspace unchanged | Reopen event | Same pair + new task | Project unchanged | New session |
| 12. External trigger | Workflow signal/update | **Event reopens/starts execution on Task** | Case event/route | Goal event but closure unclear | Workspace event insufficient | **Natural** | Event joins pair | Project event | Session resume only if supported |

### Scenario 1 — “Fix this test failure”

Create one TaskCase with a goal sentence, one ExecutionRef to Codex, one WorkspaceRef and optional ArtifactRefs. No Workflow object is needed. A Workflow-centric system either creates a degenerate one-node workflow or hides the workflow, which is a sign that Workflow is not the universal user object.

### Scenario 2 — Plan → Execute → Review

TaskCase owns completion (“tests pass and review accepted”); a Workflow Execution owns the Plan/Execute/Review strategy; Harness sessions attach to nodes. This keeps the simple user story and the runtime semantics separate.

### Scenario 3 — strategy changes without target change

Do not mutate the user object into a new Goal. Keep the TaskCase identity and append a `strategy_changed` event; create a new native Workflow Execution or direct execution linked to the same case. Old state remains provenance; the current execution owns current transition state.

### Scenario 4 — exploratory and human-first

The user’s edits, notes, decisions, and several Harness Sessions are activities on one TaskCase. A session can be handed off from one agent to another; VS Code explicitly supports harness-to-harness handoff while retaining context ([sessions](https://code.visualstudio.com/docs/agents/concepts/sessions)). No DAG is required.

### Scenario 5 — parallel workflows

One TaskCase can link three child ExecutionRefs, each with isolated workspace/worktree and shared immutable Context/ArtifactRefs. The case is not a shared mutable state bag; a parent/reducer or human reviews outcomes.

### Scenario 6 — workflow abandoned

The deletion test strongly favors TaskCase/Case: the objective, decisions, workspace, artifacts and human explanation remain meaningful. The old Workflow Execution is closed as abandoned; a replacement execution is linked. This is the one situation where a real Case object is more than a container.

### Scenario 7 — human-first

A user’s manual patch is an event/activity and may produce an ArtifactRef. An Agent review execution is optional. TaskCase remains coherent because its completion boundary is outcome-based, not agent-turn-based.

### Scenario 8 — large project

Use Project only above many independently closable TaskCases. Linear’s model is instructive: Projects have clear outcomes/dates and contain Issues; Initiatives group Projects around objectives ([Projects](https://linear.app/docs/projects), [Initiatives](https://linear.app/docs/initiatives)). Agent-Box should not turn a 100-hour effort into one giant Work/Goal object.

### Scenario 9 — weak coupling

Use two TaskCases, even in one repository and Workspace. Shared filesystem location does not imply shared intent, completion, decisions or retry lifecycle.

### Scenario 10 — fork/merge

The portable core records parent case, branch execution refs, branch workspace/artifact refs and a merge event. A workflow provider may own native graph fork semantics; the case does not.

### Scenario 11 — reopen

Reopen the same TaskCase when the acceptance boundary and identity remain the same; create a linked follow-up when the bug is a distinct outcome/owner. In both cases create a new ExecutionRef, not a new Goal by default. Event history makes the decision auditable.

### Scenario 12 — external trigger

The TaskCase/event stream owns continuity; a GitHub issue/PR/human message starts or resumes an execution if the provider supports it. A Session should not be the owner because it may be gone while the case remains open.

## 6. Task vs Work vs Goal

### Structural definitions

| Object | Definition | Lifecycle authority | Completion boundary | Typical children |
|---|---|---|---|---|
| Task | A bounded request/action with an expected outcome and an actionable status. | User/task system | Explicit done/cancel/blocked/reopen. | Executions, reviews, artifacts, subtasks. |
| Work/Case | A durable issue record whose processing route may change and whose evidence/decisions remain valuable across activities. | Case/product owner | Resolution/closure/archival, often after review. | Activities, executions, documents, parties, evidence. |
| Goal | A desired outcome or constraint that can motivate one or many tasks/executions. | Human/product/initiative owner | Outcome achieved, abandoned, superseded or ongoing. | Tasks, projects, workflows, metrics. |

### Task vs Work

They are distinct only if Task means an atomic bounded action while Work/Case means a durable issue record with a changing processing route, evidence, decisions, obligations and closure/archival semantics. “Task is small, Work is large” is not a valid distinction. A Task can last days; a Case can have one activity.

For Agent-Box, most coding requests begin as Tasks. Promote to Case semantics only when multiple executions/human activities and durable evidence need to remain after one execution is abandoned. Do not require both objects in the default UI.

### Work vs Goal

Goal answers desired outcome; Case answers the record/process around an issue. A Goal can have many Cases and can survive their closure; a Case can be procedural even when the goal is revised. If Work merely stores a goal plus refs, Goal + Execution is enough. A real Case adds obligations, evidence, participants, decisions, status transitions and closure rules.

### Task vs Goal

Goal lacks an action/completion boundary; Task supplies it. “Improve architecture” is a Goal/Project; “review dependency injection patch” is a Task. Do not use Goal as the default object for every prompt.

**Decision:** no separate Task and Work in the minimum core. Use `TaskCase` with an optional `case_mode`/promotion only when structural case semantics appear. Goal is a field or linked ObjectiveRef; Project is an explicit aggregation level.

## 7. Deletion Tests

| Object | Survives workflow deletion? | Survives session deletion? | Independent user value? | Keep as core? |
|---|---|---|---|---|
| Goal/Objective | Yes | Yes | Yes when it spans executions | Field/Ref; separate only at project scale |
| Workspace | Yes | Yes | Yes; repo/environment persists | Ref/provider-owned object |
| Artifact | Yes | Yes | Yes; patch/report/commit remains | External ArtifactRef |
| Decision | Yes | Yes | Yes if it constrains future work | Event/document/ref |
| Context | Yes | Yes | Yes when cross-execution | ContextRef/store, not runtime state duplicate |
| Resource | Yes | Yes | Yes; provider lifecycle exists | ResourceRef/provider-owned |
| Case/Task | Yes | Yes | Yes if completion/evidence remain | **Primary user object** |
| Workflow definition | N/A as strategy | Yes | Yes as reusable strategy | Extension/provider-owned |
| Workflow execution | No (its purpose is execution) | Yes | Runtime audit value only | Native ref |
| Attempt/Run | No | Usually no | Provenance only | Runtime-owned ref |
| Session/Thread | No | No | Conversation value may be archived | Harness/runtime-owned ref |
| Retry state | No | No | No independent value | Runtime-owned |
| Role/Profile | Often yes as identity/config | Yes | IAM/config value, not work | External/profile ref |

**Work-as-container test:** If `Work` contains only GoalRef, ContextRefs, ResourceRefs, ArtifactRefs, WorkflowRefs and SessionRefs, it fails the deletion test as a distinct ontology: it is a correlation/index object. It becomes legitimate only when it owns status/closure, obligations/decisions, evidence timeline, participants and reopening/archival semantics.

## 8. Workspace Model

Workspace is highly important but should remain orthogonal. A workspace can contain one or many TaskCases; one TaskCase can move across workspaces or use multiple isolated worktrees. A repo/worktree is not an intent. The workspace owns:

* repository/worktree/filesystem/environment and capability grants;
* tools/MCP/credentials references and process locality;
* durable files, diffs, branches and workspace-scoped memory;
* attach/detach/lease semantics.

The TaskCase owns why a change is being made and what completion means. VS Code’s Agent Host demonstrates the workspace/session boundary: host state is source of truth for session channels, runs near the workspace, can be remote, and a session continues without a connected client ([architecture](https://code.visualstudio.com/docs/agents/concepts/agent-host)). That is operational continuity, not proof that Workspace should be the user’s work identity.

## 9. Event Model

Event-centric is the best **internal substrate**:

```text
TaskCaseCreated
ExecutionStarted(native_ref, strategy)
HarnessAttached(session_ref)
ContextUpdated(ref)
ArtifactProduced(ref, digest)
HumanDecision(decision_ref)
ExecutionAbandoned(reason)
ExecutionReplaced(old_ref, new_ref)
TaskCaseReopened
TaskCaseCompleted
```

Events provide auditability, projections, cross-runtime correlation and external-trigger continuity. They should not expose a raw event log as the only user object. Users need current status, next action, goal and evidence; those are projections. Event sourcing also cannot replace a runtime’s authoritative Temporal history or LangGraph checkpoint. Agent-Box events are cross-system facts/provenance, not execution replay input.

## 10. Workflow Placement

Workflow should be **an Execution Strategy / Extension**, with four possible execution kinds:

```text
TaskCase
  └── ExecutionRef
       ├── DirectHarnessExecution
       ├── WorkflowExecution
       ├── HumanExecution
       └── ExternalExecution
```

This is more natural than `Work → Workflow[]` because it supports “no Workflow” without a fake placeholder and makes Workflow replacement a new execution under the same case. A native provider retains the real graph/state/retry/run identity; Agent-Box records only references, capability projections and provenance.

## 11. Harness Placement

Ownership should be:

| Relation | Verdict |
|---|---|
| TaskCase → Harness | Valid as a direct execution binding for a one-shot task. |
| Workflow → Harness | Valid as node/step binding, but runtime owns transition. |
| Execution → Harness | **Most stable ownership:** every concrete execution records the native harness/session/profile used. |
| Role → Harness | Valid only as workflow-local role projection; stable role identity belongs to profile/IAM. |
| Profile → Harness | Profile provider owns model/tool/permission config; Agent-Box stores ref and resolved snapshot. |

The same TaskCase may contain a Claude planning session, a Codex implementation execution and a Hermes review execution. The case retains objective/context/artifacts; each execution retains its native session ref and provenance. This prevents “session continuity” from being mistaken for “work continuity.”

## 12. Existing Product Analogues

### Kandev, Vibe Kanban and Cline

Kandev’s supported product boundary is a task/workbench with workflow steps, named sessions, profiles, executors, repositories, parallel sessions, subtasks and review. This is strong evidence for TaskCase + Workspace + Execution, not Workflow as sole object. Vibe Kanban’s Task Attempt is a concrete execution record around a task/worktree. Cline’s Task stores conversation, decisions, files, checkpoints, usage and can resume across editor sessions; its documentation explicitly scopes one task to one goal and provides `/newtask` for a distilled handoff ([tasks](https://docs.cline.bot/core-workflows/task-management), [checkpoints](https://docs.cline.bot/core-workflows/checkpoints)).

### LangGraph and Temporal

These choose runtime-native execution objects because their product problem is durable orchestration: LangGraph Thread/Checkpoint and Temporal Workflow Execution/Event History. They are not evidence that a coding workbench should expose Workflow as its primary user object; they are evidence that Workflow Execution should remain provider-owned beneath a TaskCase.

### Linear, GitHub Issues and Jira-like systems

Linear separates Issue, Project and Initiative: Project has a clear outcome/date and contains Issues; Initiative groups Projects around objectives. This is a mature answer to “small action versus durable aggregation.” GitHub Issues similarly provide a bounded, reopenable issue linked to PRs, commits, discussions and workflows; Project is a view/aggregation layer. Jira’s issue types and workflows likewise separate the work record from its status process. These systems make Task/Case primary because users need a closable item before they need a process diagram.

### VS Code Agent Host

VS Code makes Session the agent unit and Workspace the execution locality. Its session handoff proves a session can change harness while preserving interaction context. It does not make Session a project/task ontology; an external task or issue can own several sessions.

## 13. Case Management Analogy

Case management is the strongest non-software analogue for a true Work object. The SAP case model consolidates heterogeneous documents, business objects, notes, activities, processors, change history and a process route that can change while the case is processed. The Australian Government case standard describes lifecycle management, dynamic routing, clear outcomes, information assignment and audit ([case management standard](https://architecture.digital.gov.au/standard/case-management-standard)). Oracle emphasizes that cases are long-running, multi-party, document-heavy, iterative, non-linear and may revisit phases.

This is materially more than a `Container<Refs>`:

* case identity survives route/process replacement;
* evidence and notes are first-class;
* participants/owners and obligations are tracked;
* closure, cancellation, reopening and archival are explicit;
* the process can be changed without changing the case.

Agent-Box should adopt Case semantics only when it needs these properties. For most coding requests, a TaskCase can start in task mode and promote to case mode; that is one object with stronger lifecycle, not mandatory `Task + Work + Goal` duplication.

## 14. Pi-style Minimal Core

The Pi-like test is not “can the core represent every feature?” It is “can a tiny core host extensions without reimplementing workflow/runtime/harness systems?”

### Candidate minimal cores

| Model | Minimal primitives | What extensions add | Failure |
|---|---|---|---|
| Workflow-centric | Workflow, State, Execution, Ref, Extension | Harness, HITL, artifacts | State/transition duplicates runtime; no-workflow is fake workflow. |
| Task-centric | Task, Execution, Ref, Event, Extension | Workflow, Harness, Workspace, artifacts | Strong default; Task must gain case mode for long non-linear work. |
| Work/Case-centric | Work, Execution, Ref, Event, Extension | Workflow, Harness, Workspace, Goal | Strong if real case semantics; weak if Work only refs. |
| Goal+Workspace | Goal, Workspace, Execution, Ref, Event | Workflow, Harness, artifacts, memory | Orthogonal but two mandatory objects overkill for simple fix. |
| Event-centric | Identity, Event, Ref, Projection, Extension | Task UI, workflow, session, workspace | Great internals; poor user mental model without projection. |
| Session-centric | Session, Message, Workspace, Ref, Extension | Task/workflow/goal | Confuses conversation with work; weak parallel/reopen semantics. |

### Recommended maximum five primitives

1. **TaskCase** — bounded objective, lifecycle, completion/closure, current status and case/task metadata.
2. **ExecutionRef** — a concrete direct Harness, Workflow, Human or External execution; native IDs remain opaque.
3. **Ref** — typed references to Workspace, Resource, Context, Artifact, Profile, Workflow Definition and native provider objects.
4. **Event** — immutable cross-system facts, decisions, provenance and lifecycle history.
5. **Extension** — plugin capability boundary for Workflow providers, Harness adapters, storage, artifact providers, memory, UI and integrations.

Why not fewer? Remove TaskCase and there is no user-facing completion/ownership boundary; Ref + Event alone is an event database. Remove ExecutionRef and direct Harness, Workflow and human action cannot be uniformly related. Remove Ref and every extension leaks provider-specific objects into the core. Remove Event and external triggers, audit, reopen, provenance and projections have no stable internal substrate. Remove Extension and the core becomes a closed product rather than Pi-like.

Why not more? Goal, Workspace, Artifact, Context, Workflow, Session, Run, Attempt, Profile and Resource are all expressible as typed refs/extensions or provider-owned records. Adding each as a core lifecycle object risks a second runtime or a universal container.

## 15. Over-abstraction Risks

| Model | Failure mode | Detection test |
|---|---|---|
| Workflow | All user activity must become nodes/edges; human-first exploration becomes fake workflow. | Can a direct Codex fix exist with no graph? |
| Task | Task silently becomes a 2.0 Project/Work container. | Does it have clear completion and child boundaries? |
| Work/Case | Universal bucket contains every ref but no unique semantics. | Delete Work; if only links disappear, it was a correlation record. |
| Goal | “Improve system” never closes and expands into initiative/project. | Can a user state acceptance criteria and closure? |
| Workspace | IDE-like environment absorbs intent, obligations and project planning. | Move the task to another worktree; does identity remain? |
| Event | User must interpret facts to know what to do next. | Can a new user create/close work without knowing event sourcing? |
| Goal+Workspace | Two-object ceremony for one-shot tasks; neither alone defines closure. | Can “fix this test” be represented in one action? |
| Project | Hundreds of unrelated small tasks become one opaque container. | Does each child have an independent outcome/reopen? |
| Session | A session reset or handoff incorrectly closes/restarts work. | Can two sessions serve one task? |

## 16. Candidate Architectures

### Architecture A — Task-centric

**Core:** Task, Execution, Ref, Event, Extension. **Ownership:** TaskCase owns goal/completion; provider owns Workflow/Run; Harness owns Session; Workspace/provider owns resources. **Lifecycle:** create → active/blocked → complete/cancel → reopen; executions can be replaced. **Example:** “Fix flaky test” starts Codex directly, then adds a reviewer session. **Strengths:** clearest developer model and easiest migration from issue/task systems. **Weaknesses:** long non-linear work may need case promotion. **Over-abstraction:** Task becomes Project if child boundaries are absent. **Complexity:** low. **Clarity:** highest.

### Architecture B — Work/Case-centric

**Core:** Case, Execution, Ref, Event, Extension. **Ownership:** Case owns evidence, decisions, obligations, participants, closure and archival; runtime owns execution. **Lifecycle:** intake → triage → investigate/execute → resolve → post-review → close/reopen. **Example:** a security remediation case has research, implementation, human review and multiple provider workflows. **Strengths:** best for abandoned/replaced workflows and human-first long-running work. **Weaknesses:** feels bureaucratic for a one-line fix; easy to devolve into a container. **Complexity:** medium. **Clarity:** medium unless UI defaults to task mode.

### Architecture C — Goal + Workspace

**Core:** Goal, Workspace, Execution, Ref, Event. **Ownership:** Goal owns intent/outcome; Workspace owns repo/environment/context; executions join them. **Lifecycle:** goals can span tasks; workspaces persist independently; execution starts/stops. **Strengths:** clean orthogonality and shared workspace across workflows. **Weaknesses:** no natural bounded task; requires a hidden Task/Case or makes Goal carry closure. **Complexity:** medium. **Clarity:** good for projects, weak for simple prompts.

### Architecture D — Event-core + thin TaskCase projection

**Core:** Event stream, Ref, projection, Extension; TaskCase is a materialized user view. **Ownership:** events are Agent-Box cross-system facts; native runtime histories remain provider-owned. **Lifecycle:** append facts, project active/completed cases, link executions. **Strengths:** auditability, external events, reopen/fork/merge and pluggable UI/storage. **Weaknesses:** eventual consistency, projection complexity and poor direct mental model if exposed. **Complexity:** high internally, low domain duplication. **Clarity:** high only when TaskCase is the UX.

## 17. User Model vs Internal Model

The user-facing model should be a **TaskCase** with:

* title/goal and acceptance/completion criteria;
* current status and next action;
* linked Workspace/Resource/Context/Artifact refs;
* execution timeline and human decisions;
* optional strategy/workflow label;
* reopen/abandon/complete semantics.

The internal model should be event/ref-oriented:

```text
TaskCase projection
  ← Event stream (Agent-Box facts)
  → ExecutionRef(s)
       → native Workflow/Run/Thread/Session refs
       → native Harness/Provider refs
  → typed external refs
```

The TaskCase is not the authoritative state of a Temporal workflow or LangGraph thread. It is the product identity and a projection of cross-runtime progress. A runtime adapter must preserve native state authority and expose capability-qualified operations.

## 18. Final Ranking

1. **Task/Case-centric + orthogonal Workspace + Goal field/ref — confidence 0.84**

   Best balance of one-shot simplicity, human-first work, multiple executions, reopen, completion and developer mental model. It does not require a universal Work object; case semantics can be activated when needed.

2. **Goal + Workspace with TaskCase projection — confidence 0.68**

   Strong architecture for long projects and shared resources, but too much ceremony as the primary user model. Keep as internal/product-level axes, not the only object users create.

3. **Event-core + thin TaskCase projection — confidence 0.61**

   Best internal extensibility and auditability. It is not sufficient as a user ontology without the TaskCase projection.

4. **Workflow-centric — confidence 0.43**

   Use Workflow as an execution extension/provider object, not universal product root.

5. **Broad Work-centric — confidence 0.39**

   Adopt only if real case semantics are required; otherwise merge it into TaskCase or remove it.

6. **Workspace-centric — confidence 0.34**

   Essential provider/resource boundary, insufficient intent/completion boundary.

7. **Project-centric — confidence 0.31**

   Aggregation layer above many TaskCases, not default execution object.

8. **Goal-centric — confidence 0.29**

   Useful field/initiative layer, weak default work item.

9. **Thread/Session-centric — confidence 0.22**

   Excellent Harness primitive, wrong product-level work identity.

## 19. Final Core Primitives

### Minimal Agent-Box Core

1. **TaskCase** — “what outcome is being pursued, and is it open or closed?”
2. **ExecutionRef** — “which direct Harness, Workflow, human action or external process is acting now?”
3. **Ref** — “where are the workspace, resources, context, artifacts, profile and native objects?”
4. **Event** — “what fact, decision, transition, provenance or external trigger happened?”
5. **Extension** — “which provider/plugin supplies workflow, harness, memory, storage, artifacts, UI or integrations?”

`Goal`, `Workspace`, `Artifact`, `Context`, `Workflow`, `Session`, `Run`, `Attempt`, `Profile` and `Resource` should initially be typed refs, extension-owned records or native-provider objects. Promote one to a core primitive only after it acquires an independent lifecycle that cannot be represented by TaskCase + ExecutionRef + Ref + Event.

## 20. Final Definition

Agent-Box should be a **TaskCase-oriented control plane for coding executions**: a small product identity and event/ref layer above pluggable Harnesses and Workflow providers. It should make direct sessions, structured workflows, human work and external executions look like different execution strategies attached to one bounded case. It should preserve Work/Case semantics only where objective, completion, evidence, decisions, reopening and archival are real; otherwise “Work” is just a container and should not exist as a separate core object.

### Direct answers to the eight required questions

**Q1. Natural user-facing object?** A bounded TaskCase: task by default, case semantics when the work outlives/replaces executions.

**Q2. Is Workflow an execution strategy?** Yes. Workflow is a provider/runtime-owned Execution Strategy, not the universal user object.

**Q3. Do Task and Work both need to exist?** No, not in the minimum core. Use one TaskCase with explicit case semantics; separate only when genuinely different ownership/lifecycle appears.

**Q4. Can Goal replace Work?** No. Goal has intent but not necessarily closure, evidence, obligations or process identity. Use Goal as a field/ref or project-level object.

**Q5. Is Workspace + Goal more orthogonal than Work?** Architecturally yes; as a user-facing default it is too much for a one-shot task and still lacks a bounded completion object.

**Q6. Should Event-centric be internal?** Yes. Events should power projections, audit and cross-runtime correlation; TaskCase should be the user model.

**Q7. Pi-style core under five primitives?** TaskCase, ExecutionRef, Ref, Event, Extension.

**Q8. Simplest definition?** Agent-Box is the place where a bounded coding objective is linked to any execution strategy, Harness, workspace and evidence—without pretending to own the runtime that executes it.
