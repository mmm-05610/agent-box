# Pi-like Work Runtime Product Gap Research
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 文档导航：[总目录](../README.md)

Research date: 2026-08-21. This is a product-boundary and ontology comparison, not a feature-count ranking. “Pi-like” is treated as a strict architectural claim: a small stable core, provider-neutral execution, extension-first growth, replaceable UI/storage, and an ecosystem surface that does not require changing the core for each new capability.

## 1. Executive Verdict

The market has products near each edge of the proposed position, but no public product was found that clearly combines all of these as one embeddable core:

* Work/Task as a stable user object above execution;
* direct and workflow execution as peers;
* harness-neutral coding-agent adapters;
* workflow-provider neutrality;
* typed external references and cross-runtime provenance;
* event-backed but runtime-independent lifecycle;
* a ≤5-primitive core with extension-owned workspace, artifact, memory, UI and provider implementations.

However, this is a **Partial gap**, not a clear gap. Kandev already covers most user-visible Task/Workflow/Harness/Workspace coordination; Vibe Kanban and Rover cover task/attempt/worktree orchestration; Cline covers a durable task/session/checkpoint experience; Pi demonstrates the extension-first harness philosophy; Agenta covers agent workspace, traces, configuration and evaluation. The remaining gap is narrower and more infrastructural: **an embeddable, runtime-neutral Task/Case + ExecutionRef + Ref/Event framework**, not a new end-user workbench.

The proposed Work/Execution/Ref/Event/Extension model is therefore viable only if “Work” means a real bounded Task/Case with lifecycle and completion—not a bag of references. If it is only Kandev Task or Vibe TaskAttempt renamed, Agent-Box has no structural differentiation.

### One-line recommendation

Build a **headless, embeddable TaskCase/Execution federation library with Harness and Workflow adapters**, and treat a GUI/workbench as an optional extension; do not build a second Kandev and do not compete with Temporal/LangGraph.

## 2. Agent-Box Candidate Definition

Candidate core:

```text
Work          stable bounded objective + completion/lifecycle boundary
Execution     direct harness, workflow, human or external concrete execution
Ref           typed references to external native objects/resources/artifacts
Event         Agent-Box cross-system facts, not provider replay history
Extension     harness/workflow/workspace/artifact/memory/UI/integration plugins
```

The core owns correlation, user-facing lifecycle, capability-qualified operations, provenance and references. It must not own Temporal event history, LangGraph checkpoints, a universal retry engine, harness conversation state, repository/container/secret lifecycle or artifact bytes.

This is not automatically a product. It earns value only if the core boundary is materially more embeddable and runtime-neutral than existing workbenches, while still giving users a comprehensible Work/Task object.

## 3. Market Taxonomy

| Layer | Primary question | Products |
|---|---|---|
| Harness | How does one coding agent converse, call tools and edit a workspace? | Claude Code, Codex, OpenCode, Pi, Cline, Roo Code |
| Agent framework | How do developers compose agents/tools/messages? | OpenAI Agents SDK, AutoGen, CrewAI |
| Workflow runtime | How are durable state, retries, timers, branches and recovery executed? | Temporal, LangGraph, Prefect, Restate, DBOS |
| Coding workbench | How do users run/review multiple coding agents in workspaces? | Kandev, Vibe Kanban, Rover, Codeg |
| Agent platform/LLMOps | How are agents/prompts evaluated, versioned and observed? | Agenta, LangSmith-like platforms |
| Task/project system | What bounded work/objective is tracked and closed? | Linear, GitHub Issues, Jira |
| Work runtime/framework | A small headless object/event/extension layer above all the above | **No clear mainstream incumbent found** |

The apparent gap is a cross-layer product. It is also a cross-layer maintenance burden: a library must understand enough of every layer to correlate them while refusing to own their semantics.

## 4. Pi Product Philosophy

Pi’s official documentation calls it a “minimal terminal coding harness” designed to stay small at the core and be extended through TypeScript extensions, skills, prompt templates, themes and packages ([Pi docs](https://pi.dev/docs/latest)). Public package/extension docs show:

* a focused AgentSession/coding-agent loop rather than a project-management model;
* model/provider selection at the harness layer;
* local/project settings and npm/git package loading;
* extensions registering tools, commands, shortcuts, flags, UI and event handlers;
* session lifecycle events and extension state reconstruction;
* project/global resource discovery and package filtering ([packages](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md), [extensions](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)).

### Why Pi feels minimal and ecosystem-oriented

1. **One mental model:** run Pi in a project; the agent has a session; extensions add behavior.
2. **Small primitive surface:** session/agent loop, tool, message/event, settings and extension loader.
3. **Deep extension boundary:** extensions can register tools/commands/shortcuts, intercept events, persist state, customize UI, invoke subprocesses and integrate external systems.
4. **Discoverable packaging:** npm/git packages, project/global scopes, manifests and package filtering.
5. **Core/runtime ownership is clear:** Pi owns the harness loop; extensions own domain features.
6. **Composable rather than policy-heavy:** no mandatory Kanban, project, workflow or external work identity.
7. **Source-level simplicity:** an extension can be one TypeScript file, while richer packages remain possible.

Pi is not Work-centric. Its success demonstrates an extension philosophy and a harness core, not a missing Work ontology. Treating `Pi Session → Agent-Box Work` as a direct analogy is a category error: a Session has conversation continuity; Work requires outcome/lifecycle continuity.

### Pi-to-Agent-Box mapping

| Pi concept | Agent-Box analogue | Confidence |
|---|---|---|
| AgentSession | ExecutionRef / NativeSessionRef | High |
| LLM provider/model | Harness/Profile adapter | High, but not identical: Pi provider is model API, Agent-Box provider is coding runtime. |
| Tool/command/shortcut | Extension capability | High |
| Event handlers | Event/Extension hooks | High |
| Session state | Native execution state | High; should remain harness-owned. |
| Project directory | WorkspaceRef | High |
| Pi package | Agent-Box plugin | High |
| Prompt/skill/theme | Extension resource | High |
| User goal/task | **No direct Pi primitive** | Important gap, not proof of market demand. |

## 5. Kandev Deep Dive

Kandev is the closest existing product to a user-facing Agent-Box candidate. Its official boundary is a coding-agent workbench: assign repository work to agents, review results, and control environments/credentials ([Kandev docs](https://kandev.ai/docs/)).

### What Kandev Task owns

Kandev’s documented Task surface can own or link:

* title/objective, description, state and plan/documents;
* workflow and workflow step position;
* one or more named agent sessions;
* agent profile (model, mode, permissions, environment, MCP, credentials);
* executor profile (local, worktree, Docker, SSH, Sprites);
* workspace/repository/worktree/branch bindings;
* child tasks/subtasks and dependencies;
* parallel sessions, targeted messages and cross-task coordination;
* workflow events/automations, human review gates and external triggers;
* changes, diffs, pull requests, walkthroughs and task documents.

The feature guide explicitly says subtasks inherit parent workspace, workflow, profile, executor and repositories; the agents/profile docs expose ACP-driven model/mode/config and MCP; automation docs support task-backed scheduled/webhook work ([features](https://github.com/kdlbs/kandev/blob/main/docs/features.md), [profiles](https://kandev.ai/docs/agents-and-profiles), [automation](https://kandev.ai/docs/automation-and-mcp)).

### Task–Workflow–Session relation

```text
Workspace
  └── Task
       ├── Workflow / WorkflowStep (strategy and board position)
       ├── Session(s) (agent conversations/executions)
       ├── AgentProfile / ExecutorProfile
       ├── Repository / worktree / branch
       ├── child Tasks / dependencies
       └── review/diff/PR/doc artifacts
```

Kandev therefore allows a Task without a meaningful multi-step Workflow: a task can be created and a session started, and regular workflow entry actions/human gates are optional. It is not a generic arbitrary execution attachment API: its supported path is task-scoped, and the backend injects task/workspace/run identifiers into sessions. A human action and a workflow step are represented through task/session/step surfaces, not as a fully uniform `Execution` algebra.

### Is Kandev a “Work-layer Pi”?

**No, not in the strict sense.** Kandev has genuine extension/plugin APIs—its experimental plugin contract includes Task, Workspace, Workflow, WorkflowStep, AgentProfile, Repository, Session, Message and host data accessors ([plugin authoring](https://kandev.ai/docs/plugins-authoring)). It also has agent/executor/integration/MCP extension guides. But it remains an integrated application platform:

* Task/Kanban/workflow/review/workspace are built-in domain models.
* The backend, WebSocket API, MCP, desktop/web UI and task lifecycle are tightly coordinated.
* Plugin capabilities are permissioned additions to the Kandev model, not a way to replace the core ontology.
* It is a local/self-hosted workbench, not a small dependency-free library/runtime.
* The supported product boundary explicitly excludes feature-flagged Office autonomy from the production contract.

Kandev is stronger as a complete end-user workbench. Agent-Box can only differentiate structurally by being more embeddable, less UI/Kanban-opinionated, and explicit about Workflow/Workspace/Artifact providers as replaceable external authorities.

## 6. Vibe Kanban / Rover / Cline

### Vibe Kanban

Vibe Kanban centers on Project → Task → Task Attempt/Workspace. A task may be created without starting an agent or created-and-started with an agent/current branch; each task runs in an isolated git worktree and supports multiple coding agents ([creating tasks](https://www.vibekanban.com/docs/core-features/creating-tasks), [workspaces](https://www.vibekanban.com/docs/workspaces/creating-workspaces)).

It is close to `Work + Execution` for coding, but:

* Attempt is a launch/review unit around a task, not a general direct/workflow/human execution algebra.
* Git worktree and review are first-class product assumptions.
* Workflow portability and plugin-first core are not its central contract.

### Rover

The public Rover repository describes a local manager for Claude Code, Codex, Cursor, Gemini and Qwen. `rover task` creates a task, isolated container/workspace and branch, runs a predefined agent workflow in the background, collects documents, allows iteration/manual shell, inspect/diff/merge/push ([Rover repository](https://github.com/endorhq/rover)).

Rover is a **task runner/workspace manager** with strong harness neutrality at launch and parallel isolation. It is not a general Work runtime: task, workspace, predefined workflow, container and agent are integrated; no public evidence of a replaceable event/ref/extension core comparable to Pi.

### Cline

Cline centers on Task: each task has a unique ID, conversation history, decisions, file changes, command executions, token/cost/time tracking, cross-session resume and Git-based checkpoints ([tasks](https://docs.cline.bot/core-workflows/task-management), [checkpoints](https://docs.cline.bot/core-workflows/checkpoints)). It supports Plan/Act, context compaction, `/newtask`, model/provider configuration and workspace file rollback.

Cline is effectively `Goal + Context + Session + Workspace checkpoints` in one Task, but it remains a single-harness product. It lacks a provider-neutral Workflow/Execution registry, cross-harness native identity model and externally replaceable workspace/artifact/runtime ownership. It validates Task-centric UX; it does not already provide Agent-Box’s proposed cross-runtime framework.

## 7. Agenta / Similar Platforms

Agenta describes itself as an open-source workspace for building/running agents, with cloud/self-hosting, traces, version history, prompt management, evaluation and observability ([docs](https://agenta.ai/docs/), [repository](https://github.com/Agenta-AI/agenta)). Its newer workspace/agent-builder language can look like a Work Layer, but the technical center is LLMOps/application lifecycle:

* prompt/agent configuration and variants;
* playground and evaluation datasets/judges;
* deployment environments and production traces;
* observability/version comparison.

Agenta is not a coding Harness-neutral Work runtime. It does not own repository workspaces, coding sessions, Workflow Runtime identity or human coding completion. It is a relevant precedent for versioned configuration, trace/event projection and plugin/application integration, not a direct competitor.

## 8. Workflow & Agent Framework Comparison

| Product | Primary object | Workflow placement | Harness placement | Workspace | Artifact | Event/history | Plugin model |
|---|---|---|---|---|---|---|---|
| Temporal | Workflow Execution / ID + Run ID | Core durable strategy | Activity/application integration | External activity/resource | External activity output | Authoritative event history | SDK/integration, not a user Work plugin |
| LangGraph | Graph + Thread/Checkpoint | Core graph runtime | Node/tool/agent integration | External config/tool | State/store/external | Checkpoint/history | Graph/node/tool ecosystem |
| Prefect | FlowRun/TaskRun | Core Python orchestration | Task body/integration | Work pools/blocks | Results/artifacts | Run state DB | Blocks/tasks/integrations |
| Restate | Workflow/service key/journal | Core durable process | Handler integration | External service/runtime | Handler output/external | Journal/state | SDK/service handlers |
| DBOS | Annotated workflow/step/ID | Core durable functions | Step/application integration | DB/queue/runtime | Step output/external | Postgres records | Language SDKs |
| CrewAI | Flow/Crew/Agent/Task | Flow core | Agent/LLM/tool config | Executor/tool dependent | Outputs/files | Flow persistence/traces | Python framework extensions |
| AutoGen | Agent/Team/messages | Team loop | Model client/tool | External | Messages/results | Caller-saved state | Agent/tool/runtime components |
| OpenAI Agents SDK | Agent/Runner/RunState/Session | Runner/handoff loop | Agent/model/tool | Sandbox/tool integration | Results/files | Session/trace | Tools/agents/integrations |
| Kandev | Task + Session + Workspace | Task workflow steps | Agent/profile/executor integration | First-class | Diff/PR/docs/review | Task/session/activity records | Experimental host plugins |
| Vibe Kanban | Project/Task/Attempt | Task execution/review | Selected agent | First-class git worktree | Diff/PR | Board/attempt records | MCP/integrations |
| Rover | Task + isolated workspace | Predefined agent workflow | Selected CLI agent | First-class container/worktree | Documents/diffs | Task store/output docs | Configuration, not general plugin core |
| Cline | Task/session | Plan/Act internal pattern | Product itself | Project files/checkpoints | File snapshots/diffs | Task conversation/checkpoints | Extensions/rules/providers, same harness |
| Pi | AgentSession | Not core; extensions can orchestrate | **Product core** | Current project directory | Files/session outputs | Session event log | **Strong first-class package/extensions** |
| Agenta | App/agent/prompt/version/trace | Custom workflow/eval integration | LLM/app providers | External app/workspace | Eval outputs/traces | Observability/version history | LLMOps integrations |

The major coding Harnesses sit below this product layer:

| Harness | User-created object | Owns | Does not provide as a product-level abstraction |
|---|---|---|---|
| Claude Code | Conversation/task session in a project | Agent loop, tools, files, permissions, model/provider configuration | Cross-harness Work identity or workflow-neutral execution registry |
| Codex | Thread/task execution in a workspace | Coding-agent turns, tools, approvals/sandbox and native session state | A shared TaskCase across other Harnesses/workflow engines |
| OpenCode | Agent session/project run | Terminal coding loop, model/provider config, tools and files | Durable cross-provider Work/Case lifecycle |
| Roo Code | VS Code agent task/mode/session | Modes, rules, tools, provider configuration and file edits | Runtime-neutral Work identity and external execution federation |

These products can be excellent Harness providers without being missing Work runtimes. A Harness Adapter should preserve their native session/thread/run refs rather than pretend their internal models are equivalent.

## 9. Core Ontology Comparison

| Product | Work-centric | Harness-neutral | Workflow-neutral | Minimal core | Plugin-first | Embeddable |
|---|---:|---:|---:|---:|---:|---:|
| Kandev | 4/5 | 4/5 | 2/5 | 2/5 | 3/5 | 2/5 |
| Vibe Kanban | 3/5 | 4/5 | 3/5 | 3/5 | 2/5 | 2/5 |
| Rover | 3/5 | 4/5 | 2/5 | 3/5 | 2/5 | 3/5 |
| Cline | 3/5 | 1/5 | 4/5 | 4/5 | 3/5 | 3/5 |
| Pi | 1/5 | 3/5 (model provider, not coding harness) | 5/5 | **5/5** | **5/5** | **4/5** |
| Agenta | 3/5 (agent/app workspace) | 3/5 | 3/5 | 3/5 | 3/5 | 3/5 |
| LangGraph | 1/5 | 3/5 | 1/5 | 3/5 | 4/5 | 4/5 |
| Temporal | 1/5 | 3/5 | 1/5 | 2/5 | 3/5 | 4/5 |
| Agent-Box candidate | **5/5** | **5/5** | **5/5** | **5/5** | **5/5** | **5/5** |

The candidate row is a design aspiration, not evidence. The gap exists only if these properties are simultaneously delivered without degrading into a Kandev-style integrated application or a weak lifecycle wrapper.

## 10. Extensibility Comparison

### Pi

Pi is genuinely extension-first: package manifests can load extensions, skills, prompts and themes from npm/git/project/global scopes; extensions can register tools, commands, shortcuts, flags, UI and event handlers; state can be reconstructed from sessions. New capability often does not modify core. This is the strongest precedent.

### Kandev

Kandev has a meaningful but bounded plugin host: experimental plugins access typed Task/Session/Workspace/Workflow/Profile/Repository APIs, require declared permissions, and can write tasks/messages or invoke utility agents. Agents, executors, integrations and MCP also have extension guides. The core schema remains Kandev’s; a plugin cannot replace Task with an arbitrary Work object. This is “integrated platform with extension points,” not “extension-defined ontology.”

### Cline/Roo/Pi-like harnesses

Cline’s rules, commands, hooks/checkpoints and provider adapters extend behavior but remain within one Task/session product. Roo Code and similar VS Code agents have modes/rules/providers but no evidence of a provider-neutral work runtime. Pi’s extension API is broader and cleaner, but its object boundary stops at the harness session.

### Workflow runtimes/frameworks

Temporal, LangGraph, Prefect, Restate and DBOS expose SDK/plugin/integration surfaces, but the extension unit is a Workflow/Activity/Node/Task/Handler—not a replaceable product-level Work model. CrewAI/AutoGen/OpenAI expose agents/tools/model clients; they do not provide the proposed cross-harness Work extension contract.

## 11. Embeddability Comparison

| Product | CLI/headless | Library/SDK | UI separable | Core embeddability | Why |
|---|---:|---:|---:|---:|---|
| Kandev | Yes | API/MCP, but backend/product model expected | Partial | Medium-low | Web/desktop/backend/DB and Task model are integrated. |
| Vibe Kanban | Yes/MCP | API integration | Partial | Medium-low | Workspace/task/review product assumptions. |
| Rover | Yes | CLI-oriented | Higher | Medium | Manager/workspace daemon, not a generic library ontology. |
| Cline | CLI/headless available | SDK/product runtime | VS Code-centric | Medium | Task/session/checkpoint internals remain product-specific. |
| Pi | Yes/RPC/AgentSession | **Yes** | TUI can be replaced via SDK/extensions | **High for harness** | Small core and packages, but no Work layer. |
| Agenta | API/SDK | Yes | Cloud/self-hosted UI | Medium | LLMOps/application platform. |
| Temporal/LangGraph/DBOS | Yes | **Yes** | Separate UI possible | High for runtime | They are runtime/framework products. |
| Agent-Box candidate | Yes | **Target: yes** | **Target: yes** | **Target: high** | Must avoid requiring a full server/UI to create a TaskCase. |

Embeddability is the strongest potential Agent-Box difference. It must be proven by an actual library API and persistence adapters, not by providing a CLI.

## 12. Duplicate Product Test

### Is Agent-Box just Kandev Task + Session renamed?

**Partly.** Kandev already has Task objective/lifecycle, Workflow steps, sessions, profiles, executors, workspaces, repositories, artifacts/review, subtasks and automations. If Agent-Box ships another UI with the same assumptions, it is duplicate. Structural difference remains only in headless embeddability, provider-neutral execution algebra, native identity preservation and replaceable core storage/domain extensions.

### Is it Vibe Kanban Task + Attempt?

**Partly.** Vibe supplies task/worktree/attempt/agent selection/parallel execution. It lacks a general Work/Case/event/ref framework and workflow-provider neutrality. But a minimal Agent-Box must prove those are user needs, not ontology preferences.

### Is it Cline Task generalized?

**No, but close at the UX edge.** Cline offers a single-harness Task with context/session/files/checkpoints. Agent-Box’s cross-harness and cross-runtime native identity/provenance is structurally broader; direct one-harness users need no Agent-Box layer.

### Is it LangGraph Thread + Store?

**No.** Thread/Store are runtime state and memory; Agent-Box Work/TaskCase would own user completion and link several heterogeneous executions. LangGraph remains the workflow authority.

### Is it Temporal Workflow ID with a wrapper?

**No, but could degenerate into it.** A TaskCase must support direct Harness/human/external executions and survive workflow replacement. If every Work has one Temporal workflow and no independent closure/evidence, the wrapper is unnecessary.

### Is it GitHub Issue + Actions?

**Potentially close for teams.** Issue already has stable intent/completion, comments/evidence, reopen, PR/artifact links and external automation; Actions supplies execution. Agent-Box must add multi-Harness native session/profile/resource normalization and embeddable plugin semantics to be more than a new issue tracker.

## 13. Structural Differentiation

Only these qualify as real differentiation:

| Candidate difference | Existing coverage | Structural value |
|---|---|---|
| Work-first identity | Kandev Task, Vibe Task, Cline Task, GitHub Issue partly cover | Moderate; must include direct/human/external execution and replacement semantics. |
| Harness-neutral | Kandev/Vibe/Rover cover launch; ACP/AHP standardize sessions | Moderate; native identity/provenance and policy across workflow runtimes is less covered. |
| Workflow-neutral | Workbenches have opinionated workflows; runtimes are not work-centric | **Strongest potential gap.** Workflow is an extension/provider, not core. |
| ≤5 primitive core | Pi strongly demonstrates harness version; workbench products do not | Moderate only if embeddability/user demand exists. |
| Embeddable | Pi and runtimes are embeddable; Kandev/Vibe less so | Strong candidate gap for cross-layer TaskCase framework. |
| Extension-first ontology | Pi strong; Kandev plugin is schema-bounded | Potentially strong but costly to prove/ecosystem-build. |
| Native identity preservation | Runtime/harness products preserve own IDs; control planes often project them | Useful operational boundary, not sufficient alone. |

“More lightweight,” “supports two more agents,” “different UI,” “headless mode” and “another dashboard” are weak/non-structural unless they follow from a genuinely different ownership and embedding boundary.

## 14. User Segments

| User | Best existing fit | Agent-Box value |
|---|---|---|
| A. Solo, Claude only | Claude Code/Cline/Pi | Near zero; extra TaskCase layer is friction. |
| B. Solo, Claude + Codex | Kandev/Vibe/Rover; possibly Agent Host | Moderate if they need cross-harness context/provenance without a workbench. |
| C. Advanced developer custom workflow | LangGraph/Temporal/CrewAI + Pi/SDK | Moderate-high for attaching workflows and harnesses, but native runtimes already solve execution. |
| D. Team unified coding-agent platform | Kandev/Vibe + GitHub/Linear | Agent-Box can be a backend/framework, but Kandev is stronger turnkey product. |
| E. Framework author embedding agents | **Potential Agent-Box target** | High if API is small, headless, storage/provider-neutral and stable. |
| F. Enterprise Kandev-style UI/workbench | Kandev/Vibe/enterprise agent host | Low unless Agent-Box partners as a lower-level runtime. |

The strongest target is **E**, with a secondary advanced-developer/team platform audience. “People who like extensibility” is not enough; the concrete need is framework authors or internal platform teams embedding multiple harnesses/workflow providers into their own product while retaining their own UI/storage/project model.

## 15. Product Gap Test

### Result A — Clear gap

Not supported by evidence. Kandev/Vibe/Rover/Cline cover the user-facing task/workbench side; Pi covers a small extension-first harness; runtimes cover execution. The combination is not fully occupied, but the demand is unproven.

### Result B — Narrow gap

**Best result.** A headless, embeddable Work/TaskCase framework with native identity preservation and dual adapters (Workflow Provider + Harness Runtime) is not clearly offered by a mainstream product. It must target framework authors/platform builders rather than ordinary coding-agent users.

### Result C — Crowded

True at the end-user workbench layer. A new GUI that combines Tasks, Workflows, Sessions, Worktrees, profiles and reviews would face Kandev/Vibe/Rover and eventually IDE hosts.

### Result D — Wrong abstraction

Partly true for individual developers and one-harness work. They typically need a Task/Session, not Work Framework. The market does not yet prove a broad demand for a Work runtime; the product must validate embeddability/platform use cases before expanding.

## 16. Absorption Risk

| Risk | Likelihood | What gets absorbed | Structural residue |
|---|---:|---|---|
| Harness absorption | High | Profiles, sessions, tools, model selection and simple workflows by Claude/Codex/IDE hosts | Cross-harness case identity and external execution correlation. |
| Workflow absorption | Medium-high | Harness adapters and agent nodes in LangGraph/Temporal/etc. | Cross-runtime user TaskCase and control-plane refs. |
| Workbench absorption | High | Plugin system, more agents, headless API, workflow steps, artifacts | Only if Agent-Box is materially more embeddable and less opinionated. |
| Protocol absorption | Medium-high | Common session/capabilities via ACP/AHP | Protocols do not define case/completion/artifact/work identity. |
| “Pi philosophy” imitation | High | Small core and extension loading | Philosophy alone is not defensible; ecosystem/community must exist. |

### Structural wall versus feature gap

**Potential structural walls:** cross-runtime identity/correlation, stable user completion/case semantics, independent direct/human/workflow executions, external ref authority, embeddable provider-neutral extension contract.

**Temporary feature gaps:** number of supported harnesses, UI dashboards, kanban views, model profiles, CLI/headless mode, basic workflow templates, logs and generic plugin commands. Existing products can add these.

## 17. Delete-Difference Tests

### If Kandev adds a complete plugin system, all harness adapters, workflow-provider extensions, CLI/headless and embeddable API

Agent-Box would retain only a difference if its core is **not Kandev’s Task/Workspace/Workflow schema**: a library-level TaskCase/ExecutionRef/Event protocol where Kandev itself, Temporal, LangGraph, or a custom host can be adapters and where UI/storage/workspace/artifact lifecycle are replaceable. If Agent-Box still requires its own Task UI, Workspace DB and workflow board, the answer becomes “nothing structural remains.”

### If Agent-Box has no GUI/Kanban/review UI

It can retain independent value as an embedded framework for User E (framework authors) and internal platform teams only if:

* `TaskCase`, `ExecutionRef`, `Ref`, `Event`, `Extension` are stable APIs;
* direct Harness, native Workflow, human and external executions are peers;
* storage, event bus, artifact store, workspace provider and UI are replaceable;
* native identities and capabilities are preserved, not flattened;
* the library can be used inside another product without starting Agent-Box’s server/UI.

Without these, no GUI means no product: it becomes an undocumented object wrapper.

## 18. Product Landscape Map

```text
Harnesses              Claude Code, Codex, OpenCode, Cline, Roo, Pi
    │                   native sessions, tools, profiles, workspace edits
    ▼
Agent frameworks       OpenAI Agents SDK, AutoGen, CrewAI
    │                   agent/team/tool loops; caller-owned persistence
    ▼
Workflow runtimes      Temporal, LangGraph, Prefect, Restate, DBOS
    │                   durable state, retries, scheduling, composition
    ▼
Coding workbenches     Kandev, Vibe Kanban, Rover, Codeg
    │                   task/workspace/attempt/review/product UI
    ▼
Agent platforms        Agenta and LLMOps/evaluation/observability systems
    │
Task/project systems   Linear, GitHub Issues, Jira

Candidate unoccupied intersection:
  embeddable TaskCase + Execution federation + typed refs/events + plugins
```

## 19. Competitive Matrix

| Product | Work-centric | Harness-neutral | Workflow-neutral | Minimal core | Plugin-first | Embeddable |
|---|---:|---:|---:|---:|---:|---:|
| Kandev | High (Task) | High in coding agents | Low-medium | Low-medium | Medium | Low-medium |
| Vibe Kanban | Medium (Task) | High | Medium | Medium | Low-medium | Low-medium |
| Rover | Medium (Task) | High | Low-medium | Medium | Low | Medium |
| Codeg | Medium (Task/session, public evidence limited) | High aggregation | Medium | Unknown | Unknown | Medium |
| Cline | Medium (Task) | Low | Medium-high | High for harness | Medium | Medium |
| Pi | Low (Session) | Medium for model providers | High | **Very high** | **Very high** | High for harness |
| Agenta | Medium (agent/app workspace) | Medium | Medium | Medium | Medium | Medium |
| LangGraph | Low (Thread/Graph) | Medium | Low | Medium | High framework | High |
| Temporal | Low (Workflow Execution) | Medium | Low | Low-medium | Medium | High runtime |
| Agent-Box candidate | High | High | High | **Target: very high** | **Target: very high** | **Target: high** |

## 20. Closest Competitors

1. **Kandev — threat high (0.90).** Closest user-facing object and feature set: Task, workflows, sessions, profiles, executors, workspace, parallelism, subtasks, review and plugins. It is less embeddable and more integrated/opinionated; if Agent-Box builds a workbench, Kandev is the direct competitor.
2. **Vibe Kanban — threat medium-high (0.76).** Task/Attempt/worktree/multi-agent execution is close, but the product is more board/workspace-centric and less plugin/runtime-neutral.
3. **Cline — threat medium (0.61).** Task/session/checkpoint UX is close for individuals, but it is harness-specific and not a cross-runtime framework.
4. **Rover — threat medium (0.55).** Local task/container/parallel agent manager with direct CLI simplicity; lacks the proposed ontology/plugin federation.
5. **Pi — threat medium (0.50).** Strongest precedent for the philosophy and embeddable extension core, but centered on a single harness session rather than Work/Execution federation.

Agenta, LangGraph and Temporal are adjacent rather than direct competitors: Agenta owns LLMOps/evals/observability; LangGraph/Temporal own execution semantics.

## 21. Agent-Box Product Boundary

### Agent-Box should own

* a bounded `Work`/`TaskCase` identity with objective, completion, lifecycle, reopen/abandon and user-facing status;
* `ExecutionRef` for direct Harness, native Workflow, human action and external run;
* typed `Ref` values and capability-qualified native references;
* append-only cross-system Events/provenance and projections;
* extension contracts for Harness, Workflow, Workspace, Artifact, Context, Storage, UI and integrations;
* provider-neutral binding metadata and handoff/context packages.

### Agent-Box should not own

* harness conversation/session internals;
* workflow graph/state/checkpoint/replay/retry/scheduling;
* repository, worktree, container, credential or secret lifecycle;
* artifact bytes or canonical Git/PR/test authority;
* a mandatory Kanban UI or fixed project hierarchy;
* universal “role” identity outside workflow/profile/IAM;
* a second event history that competes with Temporal/LangGraph runtime history.

### Work versus Task naming

Use **TaskCase** internally or expose “Task” in the UI. Reserve “Work” only if case semantics are implemented. A generic Work name without a stronger lifecycle will be perceived as Kandev Task, Vibe Task, Cline Task or GitHub Issue with renamed fields.

## 22. Final Ranking

1. **C. Harness Adapter library only — confidence 0.86**

   Highest certainty of user value and lowest duplication; it is already the clearest Agent-Box foundation. It is not the full candidate vision, but it is safer than inventing an unvalidated Work framework.

2. **B. Pi-like Work Runtime / Framework — confidence 0.58**

   Narrow opportunity if delivered headless/embeddable for framework authors and internal platform teams, with a real TaskCase and native identity/event/ref protocol. Validate demand before broadening.

3. **E. Workflow Control Plane — confidence 0.53**

   Valuable as part of B: native workflow registry, lifecycle projection, capabilities, bindings, artifacts and provenance. Weak if it is only start/stop/status wrapper.

4. **A. Full Kandev competitor — confidence 0.29**

   Crowded and expensive; Kandev already owns the integrated workbench position.

5. **D. Workflow Runtime competitor — confidence 0.12**

   Directly duplicates Temporal/LangGraph/Prefect/Restate/DBOS and has no evidence-based advantage.

## 23. Final Recommendation

Run a narrow product validation around **User E**: embed Agent-Box into another CLI/IDE/team platform, attach a direct Claude/Codex session and a LangGraph/Temporal execution to the same TaskCase, preserve native refs, project events/artifacts, and let the host own UI/storage. If the host integration does not produce value beyond a few API wrappers, stop at the Harness Adapter library.

The product should be called a Work Runtime only after it demonstrates all of these without a fixed UI:

1. A task can start with no Workflow.
2. A task can attach multiple heterogeneous executions.
3. A workflow can be replaced without changing the TaskCase identity.
4. Human edits and external CI/GitHub events are first-class events.
5. Native state and identity remain authoritative.
6. A host can replace persistence, artifact storage, workspace provider and UI.
7. Plugins add a new provider without changing the five core primitives.

If these tests fail, the honest product is a Harness Adapter library plus integrations—not a Pi-like Work Runtime.

## 24. Final Answers

**Q1. Has someone already built “Work above Workflow”?** Partially. Kandev/Vibe/Cline build Task above agent execution; GitHub/Linear build Issue/Project above automation. No clear mainstream embeddable, workflow-neutral, harness-neutral Work Runtime was found.

**Q2. Closest candidate?** Kandev for user-facing product; Pi for extension philosophy; the combination is not currently present in one clearly documented product.

**Q3. Has Kandev occupied the position?** It has occupied the integrated coding control-plane/workbench position. It has not clearly occupied the minimal embeddable Work Framework position.

**Q4. Is Pi-like Work Runtime a real gap?** **Partial gap.** The architecture is not fully covered; demand is unproven and the end-user workbench space is crowded.

**Q5. Most likely independent positioning?** “An embeddable TaskCase/Execution federation layer that connects any coding Harness or Workflow Runtime while preserving native identity and external resource/artifact ownership.”

**Q6. Compete with Kandev or go lower/more embeddable?** Go lower and more embeddable. A full Kandev competitor is the wrong first move.

**Q7. If “minimal” and “pluginized” are removed, is structural difference left?** Very little. Without a true embeddable core, native identity preservation and provider-neutral execution model, Agent-Box becomes another Task/workbench wrapper. Minimalism and plugins are not the moat; they are prerequisites for the narrower framework position.

## One-line Verdict

> Agent-Box 的“Pi-like Work Runtime”定位是 **Partial gap**，因为 Kandev/Vibe/Cline 已覆盖大部分用户侧 Task/Workbench 需求，而真正未被清晰占据的只是一个面向框架作者的、可嵌入且保持原生身份的 TaskCase/Execution/Ref/Event federation layer。
