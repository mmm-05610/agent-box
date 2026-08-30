# Agent‑Box：Workflow 与 Execution 责任边界市场调研（2026）

> 文档导航：[总目录](../README.md)

**研究截止日期：2026‑08‑24**

**证据范围：** 官方文档、官方架构/SDK 文档、官方仓库与开放规范。没有把厂商术语等同于能力；文中的“推断”是基于多份一手资料的比较结论。内部逐项 claim ledger 属于当时的临时研究材料，当前仓库不再依赖该文件。

## Executive summary

**明确判定：B. Current model has differentiation, but boundary needs tightening。**

Agent‑Box 已经靠近一个可信的独立层，但还不能把其中任何单点能力宣称为新类别。2026 年的事实是：

- Temporal、Restate、DBOS 已经非常擅长 durable progression、timer、retry、replay 和 crash recovery；Airflow、Prefect、Dagster 已经覆盖成熟的调度、部署与数据编排。
- LangGraph、Microsoft Agent Framework、CrewAI、Flowise 等已经拥有 agent graph、循环、handoff、checkpoint、HITL 和 multi-agent coordination。
- OpenAI Sandbox Agents、Anthropic Managed Agents、E2B、Daytona、Modal、Dagger 已经覆盖大量 sandbox、session、workspace materialization、snapshot、network policy 与 runtime preparation。
- Pydantic AI Harness 已明确区分 run / conversation / step，并把 continuation 建模为同 conversation 中的新 run；Temporal、GitHub Actions 也已有成熟 run/attempt identity。所谓“执行尝试身份”本身不是空白。
- SLSA 已明确区分外部请求参数（如 `main`）和解析依赖（如 commit digest）；Bazel Remote Execution 以 digest 绑定 command/input root/platform；GitHub artifact attestation 对产物和 workflow/commit 建立签名声明。所谓“冻结输入/证明”也不是空白。

但没有找到一个主流系统同时完成下面这件事：

> 在不拥有 workflow progression 的前提下，用同一责任模型关联 Harness、CI、Human、sandbox、deployment 与外部 workflow；冻结一次独立 side-effect attempt 的预期资源；保留 native run/session/workflow identity；再以明确的证据来源、强度和覆盖率记录实际可证明的资源使用与跨执行贡献。

这是一个**跨域组合 gap**，不是每个组成概念都缺失。Agent‑Box 的可守边界应是：

> **provider-neutral governed execution contract and evidence ledger**：决定“一次异构执行由谁负责、被允许使用什么、可证明实际用了什么、输出如何成为后续输入”；不决定“下一步运行什么”。

因此，如果去掉 Agent‑Box 自己所有 Workflow-specific 逻辑，只保留 Work / Execution / Binding / Dispatch / Ref / Provider / Evidence，**仍然存在一个独立且有价值的产品层，但有条件**：它必须通过至少三个异构 provider 的真实 adapter 证明自己能收集或验证资源事实。若只是保存声明性 metadata，它会退化成又一个 run catalog，而不是基础设施层。

## What modern workflow systems already solve extremely well

### Durable progression 已经是成熟基础设施

Temporal 的核心对象是 durable **Workflow Execution**：状态来自 Event History，worker crash 后通过 deterministic replay 恢复；Workflow ID、Run ID 和 execution chain 区分业务连续性、retry 与 Continue‑As‑New。Activity Execution 又可包含多个 Activity Task attempt，默认是 at-least-once，外部副作用仍要求幂等处理。[Temporal Workflow Execution](https://docs.temporal.io/workflow-execution)、[Activity Execution](https://docs.temporal.io/activity-execution)、[Python error-handling guidance](https://docs.temporal.io/develop/python/best-practices/error-handling)。

Restate 与 DBOS 进一步把 durable calls、timers、promises/signals、saga 和 transaction semantics 做成编程模型；DBOS 明确指出非事务外部 step 在“副作用已发生、checkpoint 尚未落盘”之间仍可能重试。这说明 mature durable execution 能缩小 uncertainty window，但不能凭空给任意外部系统 exactly-once。[Restate Workflows](https://docs.restate.dev/tour/workflows)、[DBOS workflow tutorial](https://docs.dbos.dev/typescript/tutorials/workflow-tutorial)、[DBOS step failure semantics](https://docs.dbos.dev/golang/tutorials/step-tutorial)。

### 调度、部署和基础设施选择也很成熟

Prefect 以 Flow/Task Run 为中心，持久化状态并通过 work pool 把执行交给 process、Docker、Kubernetes 或 serverless；deployment 管理代码来源、版本 metadata、image/job variables 与 pull steps。它比 Temporal 更接近“orchestration state + infrastructure submission”，但 Python flow host 丢失仍可能形成 zombie，而不是由 Event History 自动 replay。[Prefect flows](https://docs.prefect.io/v3/concepts/flows)、[work pools](https://docs.prefect.io/v3/concepts/work-pools)、[deployments](https://docs.prefect.io/v3/concepts/deployments)。

Airflow 仍以 DAG / DagRun / TaskInstance 为中心，官方明确说 DAG 负责顺序、retry、timeout，而不关心 task 内部发生什么。Airflow 3.x 已加入 first-class human input；deferrable tasks 可释放 worker 并等待 trigger；versioned Git DAG bundle 可让 DagRun 使用特定 commit 的 DAG 定义。这些已经足以否定“Agent‑Box 需要自己实现 scheduler、durable wait 或通用 approval runtime”。[Airflow DAGs](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dags.html)、[HITL](https://airflow.apache.org/docs/apache-airflow/stable/tutorial/hitl.html)、[DAG bundles](https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/dag-bundles.html)。

Dagster 则以 software-defined asset 为中心，拥有 asset/job/op、dynamic mapping、run launcher、retry、observation/data version 和 column lineage。它对“数据资产如何产生”比通用 agent run 更有语义；这也是警告：Agent‑Box 不应把通用 provenance 扩成数据 catalog 或 asset orchestrator。[Dagster overview](https://docs.dagster.io/)、[dynamic graphs](https://master.dagster.dagster-docs.io/concepts/ops-jobs-graphs/dynamic-graphs)、[asset observations](https://master.dagster.dagster-docs.io/concepts/assets/asset-observations)。

### 它们通常不解决什么

主流 workflow engine 通常不负责证明 activity/task 内部实际 checkout 的 commit、读取的 config digest、连接的 service generation 或 agent 真正消费的文件。它们能传参数、选择 image、保存 deployment version 或启动容器；这些是**声明和准备**，不是自动形成“实际消费证明”。例外是若 workflow 与受控 builder/runtime 结合，例如 Airflow versioned Git bundle、SLSA builder、Bazel REAPI，某些输入可得到强绑定；但该保证是域内且依赖可信执行边界，不应被概括成 workflow 普遍能力。

## What agent workflow frameworks already solve

LangGraph 已覆盖 arbitrary graph、cycle、dynamic routing、subgraph、thread-scoped checkpoint、time travel/fork、pending writes 和 durable interrupt。恢复 interrupt 时 node 从头开始，所以 interrupt 前的副作用必须幂等；这是真正的 runtime contract，不只是 UI 上的 pause。[LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence)、[interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)。

OpenAI Agents SDK 已提供 manager-as-tool、handoff、session、guardrail、tool approval 与 tracing；其文档把 durable long-running orchestration交给 Temporal、Restate、Dapr 等外部集成，而不是把普通 `Runner` 描述为 durable engine。[Multi-agent](https://openai.github.io/openai-agents-python/multi_agent/)、[HITL](https://openai.github.io/openai-agents-python/human_in_the_loop/)、[running agents](https://openai.github.io/openai-agents-python/running_agents/)。其新的 Sandbox Agents 又补上 provider-neutral sandbox manifest/session/snapshot/capability/audit 层，这使“统一 sandbox provider”也不再是空白。[Sandbox guide](https://openai.github.io/openai-agents-python/sandbox/guide/)。

CrewAI Flows、Flowise Agentflow V2、Microsoft Agent Framework 都已覆盖多 agent、routing、loop、parallel/fan-in、checkpoint、human feedback/approval 和 handoff。AutoGen 官方仓库已建议新用户转向 Microsoft Agent Framework；把 AutoGen 作为 2026 年唯一微软主线会误读生态。[CrewAI Flows](https://docs.crewai.com/v1.15.17/en/concepts/flows)、[Microsoft Agent Framework workflow samples](https://github.com/microsoft/agent-framework/blob/main/python/samples/03-workflows/README.md)、[AutoGen repository](https://github.com/microsoft/autogen)。

Pydantic AI 是本次最重要的反例之一。Harness `StepPersistence` 已有 `run_id`、`conversation_id`、`step_index`、`parent_run_id`；continuation 是同 conversation 中的新 run；append-only tool-effect ledger 能表示 started 后 crash 的 `unknown_after_crash`。它明确不自动重放不安全副作用，也不恢复整个 graph/capability state。[Pydantic AI StepPersistence](https://pydantic.dev/docs/ai/harness/step-persistence/)。其 durable execution 依赖 Temporal、DBOS、Prefect、Restate 集成，并对 model/tool ID 的稳定解析提出约束。[Durable execution overview](https://pydantic.dev/docs/ai/capabilities/durable_execution/overview/)。

结论不是“agent framework 不懂责任边界”，而是：它们的责任边界通常停在 agent run、graph thread、tool effect 或 framework session；很少跨到 CI job、human operation、sandbox generation 和 external workflow run 的统一证据模型。

## What visual workflow platforms already solve

n8n、Dify、Coze、Flowise 已经把 connector node、branch/loop、retry/error branch、wait、人类批准、agent/tool、执行历史和 node-level observability 产品化。尤其 Dify Human Input 支持表单、编辑、多个 action branch、timeout；Flowise 有 supervisor-worker multi-agent 与 checkpoint；Coze 有 async execution ID 和 Question-node interrupt/resume；n8n 能用原 workflow 或当前 workflow 版本重试已有执行。[Dify Human Input](https://docs.dify.ai/en/cloud/use-dify/nodes/human-input)、[Flowise Agentflow V2](https://docs.flowiseai.com/using-flowise/agentflowv2)、[Coze API reference](https://github.com/coze-dev/coze-studio/wiki/6.-API-Reference)、[n8n executions](https://docs.n8n.io/workflows/executions/all-executions/)。

这些产品的中心对象仍是 workflow/app/flow 与 node execution。Git 环境、credential、connector configuration、input/output log 足以支持 automation UX，但通常不等于：本次 node attempt 被强制绑定到 exact secret generation、实际读取 exact artifact digest、或所有未声明输入均被排除。Agent‑Box 若建设 visual builder、connector marketplace 或 generic approval inbox，会直接进入它们的成熟战场。

## What execution/sandbox platforms solve

Anthropic Managed Agents 已把 Agent、Environment、Session、Events 分开：cloud session 在 isolated sandbox 中运行；self-hosted worker 由客户负责 staging code/resources。重要限制是 Environment 明确**不 versioned**，session 引用 environment ID 并不等价于冻结 exact generation。[Managed Agents quickstart](https://platform.claude.com/docs/en/managed-agents/quickstart)、[environments](https://platform.claude.com/docs/en/managed-agents/environments)、[self-hosted sandboxes](https://platform.claude.com/docs/en/managed-agents/self-hosted-sandboxes)。

OpenAI Sandbox Agents 的 `Manifest` 是 fresh session 的期望 workspace contract，但对复用 session/snapshot 并非完整 live source of truth；`GitRepo(ref="main")` 仍允许浮动 ref。其 materialization 代码记录每个写入文件的 SHA‑256，这是强于普通 trace 的“实际物化”证据，但仍不能证明 agent 语义上读取/消费了文件。[Sandbox guide](https://openai.github.io/openai-agents-python/sandbox/guide/)、[materialization source](https://github.com/openai/openai-agents-python/blob/main/src/agents/sandbox/materialization.py)。

E2B、Daytona、Modal 已原生提供 sandbox ID、process/filesystem、snapshot/image、pause/resume、network control 和 lifecycle；Daytona 还有 audit log 与 OTel collection。Dagger 更进一步，把 File/Directory 内容寻址，把 Service/Secret/LLM 建成 typed runtime resources，并提供 trace。[E2B Sandbox SDK](https://e2b.dev/docs/sdk-reference/python-sdk/v2.14.0/sandbox_async)、[Daytona snapshots](https://www.daytona.io/docs/en/snapshots/)、[Modal Sandboxes](https://modal.com/docs/guide/sandboxes)、[Dagger core types](https://docs.dagger.io/next/extending/type-system/core-types/)。

GitHub Copilot coding agent 在 ephemeral GitHub Actions 环境运行，每个 session 有隔离 workspace/branch、session log/tool history，signed commit 可链接到 session；GitHub Actions 本身还提供稳定 `GITHUB_RUN_ID`、递增 `GITHUB_RUN_ATTEMPT` 和解析后的 `GITHUB_SHA`。[Copilot agent tracking](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/manage-and-track-agents)、[Actions variables](https://docs.github.com/en/actions/reference/workflows-and-actions/variables)。

结论很直接：**不要建设 general sandbox platform**。Agent‑Box 的机会是绑定和引用这些 runtime 的 exact identity/generation，接收其 evidence，并在 provider 无法证明时诚实记录 partial/unknown。

## Capability matrix

标记：**S** = strong/native；**P** = partial；**I** = integration-dependent；**N** = not primary concern；**Ø** = absent / 未找到公开保证。每格附带语义，不以存在 API 代替 durable guarantee。

| Product | Orchestration | Agent coordination | Durability | Runtime isolation | Resource binding |
|---|---|---|---|---|---|
| Temporal | **S** event-history workflow | **I** activity内实现 | **S** replay/timer/signal | **I** worker/codec/deployer | **P** payload/search attr；外部资源自理 |
| Prefect | **S** Python flow/task | **N** 可作为 task payload | **P** 持久状态，非 history replay | **S** work-pool infra | **P** deployment/image/version，可 runtime override |
| Dagster | **S** asset/job DAG | **N** 非 agent core | **P** run/event state与retry | **S** process/Docker/K8s launcher | **P** code location/resource config |
| Airflow 3.x | **S** DAG/scheduler | **N** task内自理 | **S** scheduler/deferral；task非replay | **I** executor/operator | **P/S** Git bundle 可 pin DAG；task资源仍自理 |
| Restate / DBOS | **S** code-defined workflows | **I** 用户层 | **S** journal/durable calls/timers | **I** deployment/runtime | **P** invocation input，不是通用资源图 |
| LangGraph | **S** cyclic state graph | **S** supervisor/handoff可组合 | **S** checkpoint/interrupt（需store） | **I** tools/runtime | **P** state/config，不是强资源 binding |
| OpenAI Agents SDK | **P** runner/agent loop | **S** tools-as-agents/handoffs | **I** 外部 durable runtime | **S** Sandbox Agents（beta） | **P** manifest/session；floating refs允许 |
| CrewAI | **S** Flow routing/loop | **S** crews/agents | **P** persistence/checkpoints | **I** tool/runtime | **P** flow state与config |
| AutoGen | **P** team conversation | **S** teams/message passing | **P/I** state由调用者保存 | **I** code executor | **P** config，不是冻结证据 |
| Microsoft Agent Framework | **S** graph/functional workflow | **S** handoff/agents-as-tools | **S/P** checkpoints + host store | **I** hosting/channel/runtime | **P** session/checkpoint config |
| Pydantic AI | **P** graph/agent loop | **P** delegation/toolsets | **S/P** StepPersistence；durability靠集成 | **I** tool environment | **P** stable resolver/model-tool IDs |
| LlamaIndex Workflows | **S** event-driven workflow | **S** multi-agent patterns | **P/I** context + DBOS等 | **I** outside core | **P** context/inputs |
| n8n | **S** visual automation | **P** agent/tool nodes | **S/P** persisted executions/wait | **I** deployment/node dependent | **P** credentials/env/Git deployment |
| Dify | **S** app workflow | **P/S** agent/tool nodes | **P** persisted run/loop state | **I** code sandbox/deployment | **P** app/node config |
| Coze | **S** workflow/async run | **P/S** agent nodes | **P** async/interruption | **I** platform-managed | **P** connector/node config |
| Flowise | **S** Agentflow graph | **S** supervisor/workers | **P/S** checkpoints/resume | **I** deployment/tool dependent | **P** flow credentials/state |
| Anthropic Managed Agents | **P** agent session/task | **S** agent/tools/MCP | **S/P** managed session lifecycle | **S** cloud/self-hosted sandbox | **P** environment/session；env不versioned |
| E2B / Daytona / Modal | **N** SDK lifecycle | **N** 不协调 agent | **S/P** sandbox/snapshot lifecycle | **S** 核心产品 | **S/P** image/snapshot/policy，各家不同 |
| Dagger | **S** pipeline composition | **P** LLM core type | **P** cache/engine，不是durable process | **S** containerized execution | **S** content-addressed input/resource types |
| GitHub Actions | **S** job/step DAG | **N** job内容自理 | **S** hosted run/retry | **S/P** hosted/self-hosted runner | **S/P** workflow SHA/image/action refs，非全资源 |

| Product | Execution identity | Recovery | Evidence | Provenance | Human governance |
|---|---|---|---|---|---|
| Temporal | **S** Workflow/Run/Activity/Task token | **S** replay/retry/reconcile | **S** history；资源消费 **N** | **P** workflow causality，不是artifact lineage | **S/P** signal/update；human task需建模 |
| Prefect | **S/P** flow/task run + run_count | **P** retry/reschedule；zombie风险 | **S** state/log/result；资源 **P** | **P** run lineage | **P** pause/suspend/automations |
| Dagster | **S** run/step/asset materialization | **P/S** retries/re-execution | **S** asset events/metadata | **S** data/asset lineage | **I/N** sensor/外部系统 |
| Airflow 3.x | **S** DagRun/TaskInstance/try | **S** scheduler retries/deferral | **S** task history/log/XCom；资源 **P** | **P** DAG dependency；外部lineage集成 | **S** HumanOperator/Input |
| Restate / DBOS | **S** keyed invocation/workflow ID | **S** journal/restart | **S** journal；actual resource **N** | **P** call graph | **S/P** durable signal/promise |
| LangGraph | **S/P** thread/checkpoint/task | **S** replay/fork/resume | **S** state/task writes；资源 **P** | **P** graph/message history | **S** interrupt/edit/resume |
| OpenAI Agents SDK | **P** run/session/trace/span | **I** Temporal/Restate等 | **S** trace/tool/audit；materialization **P** | **P** handoff/trace，不是artifact chain | **S** approval interruption |
| CrewAI | **P** flow state/crew execution | **P** checkpoint/resume | **P/S** traces/hooks/state | **P** task outputs | **S** human feedback |
| AutoGen | **P** run/team/conversation | **P/I** caller存取state | **P** messages/events | **P** conversation lineage | **P** UserProxy；in-run持久性弱 |
| Microsoft Agent Framework | **S/P** run/session/checkpoint | **S/P** checkpoint restore | **S/P** events/telemetry | **P** workflow/message lineage | **S** requests/approval/handoff |
| Pydantic AI | **S** conversation/run/step/effect | **S/P** unknown-after-crash，policy外置 | **S** append-only effect ledger | **P** parent run/tool effects | **P** deferred tools/外部host |
| LlamaIndex Workflows | **P** workflow/context/run | **P/I** durable host integration | **P** events/context | **P** event flow | **S/P** human event pattern |
| n8n | **S** execution/node execution | **S/P** retry/wait | **S** node input/output/log | **P** execution dataflow | **S** wait/approval/form patterns |
| Dify | **S** app run/node run | **P** retry/error branch | **S** node history/token/timing | **P** node dataflow | **S** first-class Human Input |
| Coze | **S/P** execute_id/node run | **P** retry/async resume | **P/S** logs/node output | **P** workflow dataflow | **S/P** Question interrupt/resume |
| Flowise | **S/P** flow/session/checkpoint | **S/P** checkpoint restart | **S/P** flow trace/state | **P** node flow | **S** approve/reject/feedback |
| Anthropic Managed Agents | **S** session/work/environment IDs | **S/P** rescheduling/session ops | **S** events/tool records；resource **P** | **P** session outputs | **S/P** permission policy可变 |
| E2B / Daytona / Modal | **S** sandbox/process IDs | **S/P** pause/resume/snapshot | **P/S** logs/audit/OTel | **N/Ø** 非贡献图 | **Ø** 不拥有human workflow |
| Dagger | **S/P** call/trace/cache identity | **P** deterministic rerun/cache | **S** trace + CAS resources | **P/S** content dependency graph | **Ø** 非human governance |
| GitHub Actions | **S** run ID + attempt + job | **S** rerun/retry | **S** logs/SHA/attestation | **S/P** artifact/build provenance | **S/P** environments/required reviewers |

矩阵中的关键不是谁“全绿”，而是谁拥有哪一种 authority：Temporal 对 history/replay 有 authority；sandbox provider 对隔离和 live session 有 authority；SLSA builder 对 build provenance 有 authority；trace backend 只对收到的 telemetry 有 authority。Agent‑Box 不应复制这些 authority，而应保存它们的 Ref、claim、trust 与 coverage。

## Orchestration vs Execution vs Runtime vs Governance

| 层 | 核心问题 | 成熟 owner | Agent‑Box 应做 | Agent‑Box 不应做 |
|---|---|---|---|---|
| **A. Orchestration** | 谁先/后执行、branch、retry、wait | Temporal、Airflow、Prefect、LangGraph、Dify 等 | 只引用 workflow/run/node/attempt；接受触发 | DAG、scheduler、timer、routing、checkpoint |
| **B. Execution** | 谁启动一次 harness/CI/process/human side effect | native provider、CI、managed agent、workflow activity | 创建独立责任 attempt；冻结 dispatch intent；关联 native run | 伪装成所有 provider 的实际执行引擎 |
| **C. Runtime preparation** | workspace、sandbox、image、network、service、config | E2B、Daytona、Modal、Dagger、K8s、provider runtime | 解析并绑定 exact Ref；委托 prepare；收集准备事实 | 通用 sandbox、container scheduler、秘密管理系统 |
| **D. Governance / provenance** | 允许什么、实际可证明什么、输出如何流转、谁负责 | SLSA/in-toto、OpenLineage、policy/attestation 系统各覆盖一域 | 统一 execution-scoped contract、evidence coverage、cross-system contribution | 自创 tracing backend或取代密码学 provenance 标准 |

四层可以在一个产品里共存，但不能因此混为一个保证。例如“workflow node 参数含 `commit=abc`”只属于 orchestration input；“sandbox checkout 了 abc”是 preparation/observation；“受信 builder 证明输入 digest 为 abc 且 coverage complete”才是治理证据。

### Retry、recovery 与 compensation 不能混用

- **真正 durable：** Temporal history replay、Restate/DBOS journal、Airflow scheduler state 等能在进程 crash 后重建 control state；普通 SDK 的 `retry()` 或 SQLite checkpoint 不能自动获得同等级保证。
- **delivery semantics：** Temporal Activity 是 at-least-once；DBOS 非事务 step 也可能在副作用后、checkpoint前再次执行。exactly-once 通常只在同一 transactional boundary 或幂等/dedup protocol 内成立。
- **partial failure：** fan-out 中某个 branch失败时，LangGraph pending writes、workflow task state或平台node history可以避免/控制部分重做，但外部side effect是否重复仍由node/provider contract决定。
- **compensation：** Temporal saga、Restate/DBOS compensation、visual flow error branch通常是用户显式编排的反向操作，不是自动回滚任意外部副作用。Agent‑Box应记录 compensation Execution 与 `compensates` relation，不应执行 saga policy。
- **immutable input：** history/checkpoint使过去control input不可随意改写，不等于external resource immutable。只有 exact digest/generation、enforcement和evidence共同存在时，才能宣称强 binding。

### Evidence vocabulary 建议

Agent‑Box 不应使用单一 `actual_used=true`。建议把事实分为：

1. **requested**：用户/workflow 请求了什么，例如 branch `main`；
2. **resolved/frozen**：dispatch 前解析为 exact commit/image/config generation；
3. **projected**：adapter 计划注入或映射给 provider 的内容；
4. **visible/materialized**：运行环境中可见或已写入，例如文件 SHA‑256；
5. **provider-reported consumed**：provider 声称读取/采用；
6. **independently observed / attested**：由可信中介、CAS、builder attestation 或 enforcement point 证明。

每层还要记录 `coverage = complete | partial | unknown | unverifiable`、authority、method、timestamp 与 evidence Ref。**可见不等于消费；消费 self-report 不等于排除了未声明输入。** SLSA 的 `externalParameters → resolvedDependencies` 与 completeness 是最接近的成熟先例，但它属于受控 build domain。[SLSA Build Provenance v1.2](https://slsa.dev/spec/v1.2/build-provenance)。

## Where Agent-Box currently overlaps too much

### Workflow state

若 `WorkflowInstanceRef` 继续扩展出 node state、edge、route、checkpoint、retry policy、timer 或 wait queue，Agent‑Box 就在重复 Temporal/LangGraph/Airflow/Prefect。最危险的信号不是 schema 中出现 `Workflow`，而是 Core 开始决定 next runnable node 或恢复 graph state。

### Human approval

Airflow、Dify、n8n、Flowise、LangGraph、Microsoft Agent Framework 已有 pause、form、approve/reject、timeout、resume 等运行时。Agent‑Box 可以把 Human 作为一种 ExecutionProvider，记录 decision identity、授权依据、输入/输出 Ref 和 provenance；不应拥有通用 inbox、escalation scheduler、form builder 或 approval state machine。

### Agent collaboration

Supervisor、handoff、agent-as-tool、shared message state、team routing 是 LangGraph、OpenAI Agents SDK、Microsoft Agent Framework、CrewAI、AutoGen、Flowise 的核心竞争面。ACPX collaboration 可作为 bound communication/session resource 和 evidence source；Core 不应定义 agent graph、message bus 或 delegation protocol。

### Observability

LangSmith 的 “run” 是 trace/span 语义，记录 prompt、message、tool、token、latency 与 thread；Langfuse、Phoenix 和 OpenTelemetry GenAI 也覆盖 trace/observation/session/agent/tool attributes。[LangSmith concepts](https://docs.langchain.com/langsmith/observability-concepts)、[OpenTelemetry GenAI attributes](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/)。Agent‑Box 若保存任意 span、全文 prompt 或 token dashboard，就是在造 tracing backend。

真正不同的是 normative material history：哪一个 Core Execution 对某个 side effect 负责；哪份 Binding 在 dispatch boundary 冻结；某个 evidence claim 来自谁、覆盖什么、是否可验证；哪个 output Ref 成为另一个 Execution 的 input。Trace 可以被链接或导出，但不应定义这些不变量。

### Sandbox/runtime

OpenAI Sandbox Agents、Anthropic Managed Agents、E2B、Daytona、Modal、Dagger 已经覆盖 isolation、snapshot、workspace、network 和 process lifecycle。Agent‑Box 自建 sandbox plane 会消耗巨大工程量并削弱 provider neutrality。它应要求 provider 返回 `SandboxRef`/snapshot or image digest/policy evidence；强约束需要由实际 sandbox enforcement point 提供。

### Execution attempt semantics

这不是无人区：

- Temporal 有 Workflow ID / Run ID、Activity Execution / Activity Task attempt 与 task token；
- GitHub Actions 有稳定 run ID 和递增 run attempt；
- Pydantic AI Harness 有 conversation/run/step/effect，continuation 新建 run；
- DBOS/Restate 有 invocation/workflow identity 和 durable journal。

Agent‑Box 的差异只能是**跨 provider 的规范化责任边界**，而不是“首次发明 attempt”。它当前“一次 Execution 至多一个 accepted Dispatch、terminal 不可逆、continuation 新建 Execution 并复用 SessionRef”的 ADR 有价值，但必须被描述为跨系统 policy，而不是普遍行业唯一语义。Temporal 会把 activity retries 归入同一 Activity Execution；Prefect manual retry 可保持同一 FlowRun ID；这种不一致只能通过保留 native identity 和关系来桥接，不能抹平。

## Where Agent-Box is genuinely differentiated

### 1. 跨域 responsibility envelope

单一 Work 下可以关联 coding-agent invocation、CI job、human review、deployment operation、external workflow run，而每个都是独立 Execution responsibility attempt。OpenLineage 有跨平台 Job/Run/Dataset，但重点是数据 lineage；SLSA 有 build invocation，但不覆盖 human/session/workflow；agent frameworks 又只覆盖本框架内部。因此跨域统一仍是可信 gap。[OpenLineage object model](https://openlineage.io/docs/spec/object-model/)。

### 2. Epistemically explicit Binding / Evidence

主流系统常保存 config、manifest、params 或 trace。Agent‑Box 若严格保留 requested、resolved/frozen、projected、visible、reported-consumed、attested 以及 unknown/partial coverage，就不是换术语，而是在表达不同知识强度。关键价值是拒绝从“prompt 中提到配置”推断“配置被消费”。

### 3. Session continuity 与责任 attempt 解耦

Pydantic AI 已证明这种分离是合理的，因此不是独占创新；但将同一规则规范化到 Claude/Codex/native agent session、CI rerun、workflow retry 和 human continuation，仍可产生跨 provider 的一致审计价值。`SessionRef`、`RunRef`、`WorkflowInstanceRef` 必须保留各自 native authority，不成为 Execution 的别名。

### 4. Cross-system Ref / contribution graph

`E1 produced ArtifactRef X → E2 consumed X → Human E3 approved X → E4 deployed X` 是 execution-level contribution graph。它应能导入/导出 in-toto/SLSA/OpenLineage，而不是复制它们。in-toto Statement 要求 subject digest；GitHub artifact attestation 把 artifact 与 workflow/repository/commit 等 signed claims 关联，都是应复用的强事实格式。[in-toto Statement v1](https://in-toto.io/Statement/v1)、[GitHub artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations)。

### 5. Dispatch uncertainty 作为治理事实

Temporal、DBOS 等 runtime 在自己域内处理 dispatch/replay；弱 provider、local harness 或外部 SaaS 可能在“request 已发出但 native ref 未持久化”时留下不确定性。Agent‑Box 能把 `requested → starting → started/correlated` 与 `unknown/unverifiable` 保留下来，而不是自动 retry 造成重复 side effect。独特性仍在跨-provider contract 与保守降级，不在某个状态名。

## Hypothesis validation

### H1: **Partially supported**

“workflow 强于 what runs next，弱于 heterogeneous execution actual-use”总体成立。Temporal/Airflow/Prefect/LangGraph 的中心确实是 progression/state；但不能忽略 SLSA、Bazel REAPI、Dagger、Airflow Git DAG bundles 等强反例。它们能在受控域内绑定 exact inputs、CAS digests 或 DAG commit。因此 gap 是**跨异构 execution 的统一 evidence coverage**，不是“workflow 全都不懂资源”。[Bazel Remote Execution API](https://github.com/bazelbuild/remote-apis/blob/main/build/bazel/remote/execution/v2/remote_execution.proto)。

### H2: **Supported, with qualification**

没有找到一个 reviewed product 把 Harness、CI、Human、sandbox、workspace、external workflow 放进同一 Execution responsibility model。OpenLineage 的 Job/Run、SLSA invocation、OpenAI/Anthropic managed agent runtime 都是重要 partial counterexample，但各有 data/build/agent domain 边界。这是负面搜索结果，不是数学证明。

### H3: **Partially supported**

主流 agent tracing 主要记录 messages/prompts/tools/spans/tokens；通常不严格区分 requested/resolved/projected/visible/consumed。反例包括 Pydantic AI stable resolver、OpenAI sandbox materialization hash，以及 agent 域外的 SLSA resolvedDependencies。故“完全没有”被否定，“没有统一跨资源证据模型”仍成立。

### H4: **Partially rejected**

Pydantic AI Harness 已把 continuation 建成同 conversation 的新 run；Temporal 和 GitHub Actions 已明确区分 run/attempt；Microsoft Agent Framework 也区分 session 与 checkpoint execution state。部分 agent CLI/session 产品确实仍把 resume 当作原 session 继续，但市场并不普遍缺失该语义。Agent‑Box 的机会是 normalization，不是发明 identity separation。

### H5: **Partially supported**

通用 workflow engine 通常不会把 Git commit、sandbox policy、service generation、collaboration config、artifact digest 统一成 execution-scoped governed resources。但 Airflow Git bundle、Prefect deployment/work pool、SLSA resolved dependency、Dagger CAS、sandbox snapshot/image 各自覆盖强子集。Agent‑Box 只能声称“统一和证据分层”是 gap。

### H6: **Supported conditionally**

“governed execution substrate / execution contract / responsibility & provenance layer”比“workflow governance”更可信。条件是 Core 永不拥有 progression，Binding 必须可执行或可验证，provider 必须声明 evidence coverage，且真实 adapter 能产生强于 metadata 的事实。否则它只是 orchestration 旁边的一份审计表。

## Competitive / adjacent system map

| Layer | Representative systems | Native authority | Agent‑Box relationship |
|---|---|---|---|
| Durable progression | Temporal, Restate, DBOS | history/journal, timers, retry, signals | external orchestrator; import native refs |
| Batch/data orchestration | Airflow, Prefect, Dagster | schedule, deployment, task/asset run | workflow bridge; no mirrored DAG state |
| Agent graph/runtime | LangGraph, MAF, CrewAI, OpenAI Agents SDK, Pydantic AI | graph/thread/message/tool effect | execution provider or upstream caller |
| Visual automation | n8n, Dify, Coze, Flowise | visual flow, connector, HITL UX | opaque workflow provider or node plugin |
| Managed coding agent | Anthropic Managed Agents, GitHub Copilot coding agent, Codex-class runtimes | session, workspace, tool execution | native session/run refs + evidence adapter |
| Sandbox/runtime | E2B, Daytona, Modal, Dagger | isolation, image/snapshot, process, network | preparation/execution authority; bind exact ref |
| Telemetry | OTel, LangSmith, Langfuse, Phoenix | spans, prompts, tools, tokens, evals | export/link; never redefine as responsibility |
| Data/build provenance | OpenLineage, SLSA, in-toto, Sigstore attestations | standardized lineage/attestation claims | import/export evidence and subject refs |
| CI execution | GitHub Actions and peers | run/attempt/job, resolved SHA, artifacts | provider adapter; preserve native attempt IDs |

市场没有一个简单的“Agent‑Box 竞品”象限。风险反而是每向外扩一层，就会遇到一个成熟 owner；可守位置只能是各层之间的 execution contract 与 evidence join。

## DO NOT BUILD

1. **不要做 DAG / arbitrary graph engine。** 不拥有 node、edge、cycle、fan-out/fan-in、subworkflow 或 runnable calculation。
2. **不要做 general scheduler、durable timer、checkpoint 或 replay engine。** 使用 Temporal/Restate/DBOS/Airflow/Prefect/LangGraph。
3. **不要做通用 retry policy。** Agent‑Box 只规定“若外部系统产生了新的独立 side-effect responsibility，则创建新 Execution”；什么时候重试由 workflow/provider 决定。
4. **不要做 generic HITL runtime。** 不做 approval inbox、form builder、escalation、notification、SLA timer。只记录 Human Execution/Decision 的身份、依据、结果与 Ref。
5. **不要做 agent supervisor、handoff protocol、shared memory 或 message bus。** ACPX/MCP/agent-team config 是外部 bound resource/context。
6. **不要做 tracing backend。** 不存全量 span、prompt、token、latency dashboard；链接/export 到 OTel/LangSmith/Langfuse/Phoenix。
7. **不要做 general sandbox/container platform。** 集成 E2B/Daytona/Modal/Dagger/Kubernetes/managed-agent sandbox。
8. **不要做 visual workflow builder 或 connector marketplace。** n8n/Dify/Coze/Flowise 已经成熟。
9. **不要发明另一套 cryptographic attestation 或 data-lineage 标准。** 复用 in-toto/SLSA/Sigstore/OpenLineage。
10. **不要做 portable workflow IR。** WorkflowInstanceRef 是 opaque external identity；不要试图统一 Temporal history、LangGraph checkpoint、Airflow TaskInstance 和 Dify node state。

## SHOULD INTEGRATE

- **Workflow authorities：** Temporal、Airflow、Prefect、Dagster、Restate/DBOS、LangGraph。adapter 只映射 workflow run/node/activity/attempt Ref 与 Agent‑Box Execution。
- **Agent runtimes：** OpenAI Agents SDK、Pydantic AI、Microsoft Agent Framework、CrewAI、LlamaIndex，以及 Claude/Codex-class managed/native sessions。保留 native session/run/thread ID。
- **Sandbox/runtime：** OpenAI Sandbox Agents、Anthropic Managed Agents、E2B、Daytona、Modal、Dagger。让它们执行 prepare/isolate，Agent‑Box 接收 snapshot/image/policy/materialization evidence。
- **CI/build：** GitHub Actions 等。直接吸收 run ID、attempt、resolved SHA、artifact digest 和 attestation，不把它们降成字符串参数。
- **Telemetry：** OTel 为默认导出面；LangSmith/Langfuse/Phoenix 作为关联 trace Ref。
- **Provenance：** SLSA/in-toto/Sigstore 与 OpenLineage 做双向 import/export；Agent‑Box 只补 execution responsibility 和跨域 Ref 关系。
- **Identity/security：** 外部 secret manager、OIDC/workload identity 和 policy engine；Core 只引用 exact secret/config generation 或 policy decision evidence，不保存秘密。

## POTENTIAL CORE OWNERSHIP

Core 只应拥有会跨所有 provider 保持不变的最小不变量：

- `Work`：长期目标/责任容器，可跨 workflow、humans、retries 与工具；不是 scheduler。
- `Execution`：一次独立 dispatch/side-effect responsibility attempt；terminal 不可逆。
- `Dispatch`：不可变 submission intent、idempotency/correlation 与不确定性窗口。
- `Binding`：dispatch 前冻结的 intended resource set，区分 request 与 exact resolution。
- `Ref`：外部对象的 opaque stable identity，不复制 native payload/state。
- `Evidence/ResourceFact`：append-only claim，带 authority、method、assurance、coverage 与 scope。
- `Contribution relation`：Execution produced/consumed/approved/deployed 哪个 exact Ref。
- `Session continuity relation`：new Execution 可引用同一 SessionRef；native session 不拥有 Work lifecycle。
- `Provider capability contract`：只声明 Core 真正依赖的 resolve/prepare delegation、dispatch correlation、observe、evidence coverage 和 recovery guarantees。

Core 不应把 `provider.capabilities` 变成无限 node-feature registry。只有会改变 Core 安全语义的能力才能进入 typed contract。

## POTENTIAL PLUGIN OWNERSHIP

- `WorkflowInstanceRef`、native workflow run/node/activity/attempt mapper；
- Git branch→commit resolver、checkout HEAD observer、worktree/workspace evidence collector；
- sandbox image/snapshot/policy/network evidence collector；
- Claude/Codex/Pydantic/MAF session and invocation adapter；
- GitHub Actions/CI run-attempt/commit/artifact adapter；
- Human identity/approval provider adapter；
- ACP/MCP endpoint/config/capability projection adapter；
- OTel trace-link exporter；
- SLSA/in-toto/OpenLineage importer/exporter；
- provider-specific recovery/correlation implementation 和 conformance tests。

Plugin 可以拥有 native parsing、API calls 与 evidence acquisition；不能把 native workflow state提升成 Core state。

## Workflow relationship models A-D

| Model | Ownership | 适合场景 | 是否支持 | 风险/判断 |
|---|---|---|---|---|
| **A. Workflow completely owns execution** | workflow 同时拥有 progression 与 side-effect attempt | 单一 Temporal/DBOS app，activity 已有充分幂等、审计和 provenance | **允许 no-op integration**；可只导入历史 | Agent‑Box 价值最低；不要强插一层 |
| **B. Agent‑Box is a Workflow plugin/node runtime** | workflow 决定 next；Agent‑Box 治理某个 side-effectful node 的 execution boundary | Temporal activity 启动 coding agent；Airflow task 调 CI；LangGraph node 调 human/provider | **推荐默认** | 最清晰；plugin 若开始控制 retry/branch 就越界 |
| **C. Workflow is a bound execution resource/context** | ExecutionProvider 在别处；Binding 引用 WorkflowInstanceRef/node/checkpoint 作为上下文 | 外部 harness 被某 workflow 委派；人工/CI 操作需知道所属流程 | **应支持** | Ref 必须 opaque；最容易因同步 node state 滑向 workflow governance |
| **D. Whole workflow run is one ExecutionProvider** | external workflow 对 Core opaque；整个 run 是一次 native execution | n8n/Dify/Coze SaaS flow、第三方 deployment workflow，内部无法逐 node 归责 | **应支持为粗粒度 fallback** | coverage 必须标 partial/opaque；不能伪造内部 attempt |

四种关系都应**可表达**，但不应被强行语义等价。推荐默认是 **B**；D 是低可见度集成的安全降级；C 用于 context binding；A 在 workflow 已完整承担责任时应接受 Agent‑Box 没有必要。

最容易导致定位滑成 workflow governance 的是 **C**：一旦 `WorkflowInstanceRef` 开始拥有 current node、route、retry、pause 或 completion，它就从 Ref 变成第二套 workflow aggregate。B 也有次生风险：node plugin 若主动排队、retry 或选择后继节点，也会变成嵌套 orchestrator。

## Recommended product boundary

Agent‑Box 只负责从“准备 dispatch”到“可归责 terminal/unknown”的**execution responsibility envelope**，并把它放进长期 Work 与跨系统 Ref graph。Workflow、native session 和 sandbox 各自保留 authority：

```text
Workflow / Human / Host  ── decides what runs next
             │
             ▼
Agent‑Box Execution Contract
  resolve/freeze Binding
  create Execution + Dispatch identity
  delegate prepare/start to Provider
  persist canonical native correlation
  accept monotonic observations/evidence
  link inputs, outputs, continuation, contribution
             │
             ▼
Provider / Sandbox / CI / Harness / Human
  owns actual runtime, native state, isolation and native recovery
```

边界测试很简单：若一个功能需要回答“下一节点是谁”，它不属于 Core；若它回答“这次独立 side effect 的责任、exact intended resources、native identity 和可证明事实是什么”，它可能属于 Core。

## Recommended one-sentence positioning

> **Agent‑Box 是一个 provider-neutral governed execution contract 与 evidence ledger：它冻结异构执行的预期资源，关联一次独立 side-effect responsibility attempt，并记录各 runtime 实际能够证明其使用和产出的内容，而不决定下一步运行什么。**

## Recommended architecture boundary

1. **Binding acceptance 在 side-effect boundary 之前发生。** request 可浮动，accepted binding 必须解析为 provider 能执行/验证的 exact Ref，不能解析时明确标 unknown/conditional。
2. **Core Execution identity 先于 provider start。** native `RunRef`、`SessionRef`、`WorkflowInstanceRef` 是 correlation/context，不替代 Core identity。
3. **Retry/rerun/terminal continuation 默认创建新 Execution。** 同一 native session 可以复用；外部 workflow 若采用不同 retry identity，保留其 native关系而不改写。
4. **Provider 是 guarantee adapter，不是 node connector。** contract 至少覆盖 resolve capability、preparation delegation、start/correlation、observe/recovery、output refs、evidence coverage。
5. **Evidence append-only、带 epistemic metadata。** 不从声明推断消费，不从 process exit=0 推断 binding conformant。
6. **Projection 是当前责任视图，不是完整 telemetry。** 全量 traces 留在 observability backend，以 `TraceRef` 关联。
7. **Workflow bridge 单向映射 identity/context。** 不镜像 graph、node state、checkpoint 或 retry policy。
8. **标准优先。** Artifact digest/attestation 用 in-toto/SLSA；data lineage 用 OpenLineage；telemetry 用 OTel；Core 保存链接和跨域责任关系。

## 3 strongest expansion directions

### 1. Universal execution evidence envelope

1. **现有产品未完全解决：** SLSA 强于 build、OpenLineage 强于 data、tracing 强于 LLM telemetry、sandbox audit 强于 runtime events；没有跨 Harness/CI/Human/workflow 的统一 evidence coverage。
2. **自然 ownership：** 它直接围绕 Execution、Binding、ResourceFact、Ref 与 provenance。
3. **层级：** evidence schema、trust/coverage 和 contribution relation 属于 **Core**；采集器属于 plugin。
4. **workflow 风险：** 低，只要 evidence 不触发 routing/retry。
5. **最小 spike：** 同一 `main` 请求分别交给 coding-agent sandbox 与 GitHub Actions；冻结 commit/image；收集 actual HEAD、sandbox/image/snapshot、native run/attempt、artifact digest；故意制造一项无法证明的 config，验证查询能返回 `partial/unknown` 而非 false success。

### 2. Provider capability + evidence adapter contract

1. **现有产品未完全解决：** connector 通常只表达“能调用”，sandbox SDK 只表达 runtime capability，workflow activity 只表达 callable；很少声明可提供何种 correlation/recovery/actual-resource evidence。
2. **自然 ownership：** Provider 已是 Agent‑Box 的 execution boundary。
3. **层级：** typed guarantee vocabulary 属于 **Core**；每个 provider 实现属于 plugin/integration。
4. **workflow 风险：** 中低；严禁加入 branch、node、schedule 等 feature flags。
5. **最小 spike：** 为 local process、GitHub Actions、E2B/Daytona 三类 provider 做同一 conformance suite，注入 response-loss、native-start-before-correlation、branch movement、snapshot mismatch，比较可恢复与 evidence coverage。

### 3. Cross-system responsibility and contribution graph

1. **现有产品未完全解决：** OpenLineage 数据中心、SLSA build中心、agent trace session中心；跨 Human/CI/harness 的 material contribution join 仍碎片化。
2. **自然 ownership：** Work 是长期容器，Execution 是责任节点，Ref 是跨系统对象。
3. **层级：** 最小 relation/queries 属于 **Core**；SLSA/in-toto/OpenLineage/OTel 转换属于 integration。
4. **workflow 风险：** 中；图只能描述已经发生的 contribution，不能成为计划图或 runnable DAG。
5. **最小 spike：** `coding E1 produced commit X → CI E2 consumed X/produced artifact Y → Human E3 approved Y → deployment E4 consumed Y`，从四个 native systems 导入证据，并用一个查询定位每条边的 authority/coverage。

## 3 dangerous expansion directions

1. **Workflow control plane / portable IR。** 会立刻承担 graph semantic mismatch、scheduler、mutation、retry、HITL 与 deployment，成为低配 Temporal/LangGraph/n8n。
2. **All-in-one agent runtime。** supervisor、memory、message bus、tool delegation、sandbox 会与 OpenAI/Anthropic/MAF/LangGraph 等正面竞争，并破坏 provider neutrality。
3. **Universal observability and policy platform。** 收集所有 span/prompt/token，再加 dashboard/alert/policy，会稀释 material evidence；真正的责任事实反而淹没在 telemetry 中。

## Research uncertainties

- OpenAI Sandbox Agents、Anthropic Managed Agents、Microsoft Agent Framework、Pydantic AI Harness 都处于快速演进期；本文只描述截至研究日公开 contract，部分仍为 beta/0.x。
- Coze 云产品的地区/版本差异较大；本报告对 workflow runtime 的细节主要依据官方开源 Coze Studio wiki/repository，不能外推所有 SaaS tier。
- Flowise、CrewAI、Dify 的 self-hosted 与 cloud persistence/HA guarantee 可能不同；“有 checkpoint/API”没有被提升为 Temporal 等价的 durability。
- Dagster 一些动态 graph/run retry 资料位于官方 versioned/legacy documentation；产品方向清楚，但具体 API 可能迁移。
- 未对所有商业产品做 black-box fault injection；文中的 durable/actual-use 结论以公开 contract 为上限。未公开的内部能力不计入。
- “实际消费”对通用 agent 往往不可完全观察。除非文件、network、secret、service 全部经过可信 mediation/enforcement/attestation，系统最多报告 partial evidence；这是可观测性限制，不是 schema 能消除的问题。
- 没有找到足够公开官方材料证明 Codex cloud 对 exact workspace generation、attempt identity 和 resource attestation 的完整 contract，因此未做超出文档的推断。
- “没有单一产品完成跨域组合”是本次样本内的负面发现；未来可能被 managed agent control plane、CI provenance 或 sandbox orchestration 产品吸收。

## Final verdict

### **B. Current model has differentiation, but boundary needs tightening**

不是 A，因为 Work / Execution / Binding / Dispatch / Ref / Provider / Evidence 的组合仍能表达主流 workflow、agent framework、sandbox 与 provenance 标准之间没有统一负责的跨域问题。

还不是无条件的 C，因为市场已覆盖 Agent‑Box 多个重要子语义：attempt identity、continuation separation、resolved dependency、sandbox manifest/session、artifact attestation、content-addressed runtime resource。若没有真实 adapter、强 evidence acquisition 和 coverage discipline，Agent‑Box 只是重复的 metadata control plane。

对最终问题的直接回答是：

> **是。去掉所有 Workflow-specific 逻辑后，Agent‑Box 仍有一个独立且有价值的产品层。这个层不是 workflow governance，而是 heterogeneous governed execution substrate：一个跨 provider 的执行契约、责任边界与证据/贡献账本。**

它成立的必要条件是：

- 不拥有 what-runs-next；
- Binding 能从 request 解析/冻结到 exact resource，而不只是参数袋；
- Provider 能声明并实测 correlation、recovery 和 evidence coverage；
- unknown/partial/unverifiable 是一等结果；
- native workflow/run/session/sandbox identity 全部保留；
- 至少用 Harness + CI + Human（或 Sandbox）三个异构系统证明同一模型能产生跨执行价值。

若上述条件做不到，答案会变成**否**：因为剩余层只会是 workflow/agent runtime 已有 execution metadata 的再索引，没有足够的 enforcement、evidence 或跨系统责任价值。

---

## Appendix A — 重点产品 18 维审计

以下每个条目用相同四组维度，避免把 connector、API、durable guarantee 和 actual-use evidence 混为一谈。

### Temporal

- **1–6 Primary object / definition / state / failure / HITL / agents：** 围绕 Workflow Execution、Event History、Activity、Child Workflow、Signal/Update/Timer 组织；code-defined control flow 可循环、动态分支、并发和嵌套。history persistence + deterministic replay 是 durable guarantee。Workflow/Activity retry、timeout/backoff 成熟；Activity 默认 at-least-once，非事务 side effect 必须幂等。Human 可经 Signal/Update 建模，但 Human Decision 不是内建专用对象；multi-agent 只是在 activity/workflow 用户逻辑中实现。[Workflow Execution](https://docs.temporal.io/workflow-execution)、[Retry policies](https://docs.temporal.io/encyclopedia/retry-policies)。
- **7–10 Isolation / binding / pinning / actual evidence：** worker 的 process/container/image、filesystem/network/secrets 由部署系统负责。history 中的 payload 与 workflow code compatibility 不等于 exact Git/workspace/service generation binding；没有通用 requested→resolved→actual resource schema，也不会证明 activity 实际 checkout/read 了什么。
- **11–14 Responsibility / session / cross-provider / provider abstraction：** Workflow ID+Run ID 标识 run chain；Activity Execution 可包含多个 Activity Task attempt，task token 是 attempt-level handle。这比很多系统成熟，但与 Agent‑Box“一次 Execution 一个 side-effect attempt”不相同。没有 agent Session 概念；Continue-As-New 新建 Run。不同 provider 可作为 Activity 实现；Worker/Task Queue 不是声明 resource-consumption/evidence 的通用 Provider contract。[Activity Execution](https://docs.temporal.io/activity-execution)。
- **15–18 Observability / provenance / Ref / Work：** Event History、Visibility、logs/metrics/traces 提供强 workflow responsibility history；artifact/resource lineage 需应用建模。外部对象通常是 payload/search attribute 或应用自定义 ID，不是 typed cross-system Ref。Workflow ID 通常是最高层业务过程 identity；长期 Work 跨多个不同 workflow/human system 不是原生 aggregate。

### Prefect

- **1–6：** 以 Flow、Task、FlowRun、TaskRun、Deployment、Work Pool 为中心；任意 Python control flow、mapping、nested flow 支持动态分支/并发。状态持久化、schedule/pause/suspend/retry 可用，但不是 Temporal 式 event-history replay；host 丢失可留下 zombie。Human interaction 通常经 pause/suspend/automation/外部 UI；不是 agent-team runtime。[Flows](https://docs.prefect.io/v3/concepts/flows)、[flow-run APIs](https://docs.prefect.io/v3/api-ref/python/prefect-flow_runs)。
- **7–10：** Work Pool/Worker 可提交 process、Docker、K8s、serverless，基础设施模板可以受控。Deployment 可记录 source-derived version、image、job variables、pull steps，但 runtime override 与动态 pull 使它们不是自动冻结/证明；没有统一 actual checkout/config/service generation consumption evidence。[Work pools](https://docs.prefect.io/v3/concepts/work-pools)、[deployments](https://docs.prefect.io/v3/concepts/deployments)。
- **11–14：** FlowRun/TaskRun 是清晰责任对象；manual retry 可保持同 FlowRun ID 并增加 `run_count`，与“retry=new Execution”不同。nested flow 创建独立 backend run。无 agent session continuity；可以在 task 内跨 provider，但 Block/Worker/Integration 更像 deployment connector，不声明强 evidence/recovery coverage。[Retry flow runs](https://docs.prefect.io/v3/how-to-guides/workflows/retry-flow-runs)。
- **15–18：** UI/state/log/result/event 粒度强；provenance 主要是 flow/task dependency 和结果，不是通用 material contribution graph。外部对象多为 block/config/parameter。Deployment/Flow 是上层组织对象，没有独立跨多 workflow、human、CI 的 Work aggregate。

### Dagster

- **1–6：** 核心是 Asset、Asset Materialization、Job/Op/Graph、Run；主要 topology 是 data dependency DAG，dynamic output 支持 runtime map/collect，graph/job 可复用组合，cycle 不是目标。持久 event log/run state、retry/re-execution、partition/backfill 成熟；HITL 和 agent supervisor 非核心。[Dagster overview](https://docs.dagster.io/)、[dynamic graphs](https://master.dagster.dagster-docs.io/concepts/ops-jobs-graphs/dynamic-graphs)。
- **7–10：** Run Launcher 支持同进程、Docker、K8s；resource/config、code location 和 IOManager 负责 runtime/input。它能记录 asset data version、observation 和 metadata，但不会统一冻结 arbitrary Git/workspace/sandbox/service/secrets generation，也不证明 op 的全部实际消费。[Run launchers](https://master.dagster.dagster-docs.io/deployment/run-launcher)、[asset observations](https://master.dagster.dagster-docs.io/concepts/assets/asset-observations)。
- **11–14：** Run/step/attempt 与 asset materialization identity 清楚；FROM_FAILURE re-execution 可复用已成功 outputs，具体依赖 IOManager。无 agent session；cross-provider 通过 resource/op integration。Resource 是 dependency injection abstraction，不是 execution evidence-capability Provider。
- **15–18：** 对 asset lineage、materialization、data version、column lineage 很强；对 human/harness/CI responsibility 较弱。AssetKey 是稳定外部数据 identity 的强域内 Ref 反例，但不是通用 Run/Session/Sandbox Ref。最高层是 asset/job/asset selection，而非长期 Work。

### Airflow 3.x

- **1–6：** 核心是 DAG、DagRun、Task、TaskInstance；静态无环图，支持 dynamic task mapping、TaskGroup/subDAG替代式组合与 trigger rules，cycle 不允许。scheduler/database 持久 run/task state、retry/backoff/timeout、deferrable wait；Airflow 3.x 有 HumanOperator/Input，支持等待、提交和 timeout。agent coordination 不是 core。[DAGs](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dags.html)、[HITL](https://airflow.apache.org/docs/apache-airflow/stable/tutorial/hitl.html)。
- **7–10：** executor/operator 决定 process/K8s等隔离；task内部 workspace/network/secrets 自理。versioned GitDagBundle 可把 DagRun 的 DAG definition 固定到 commit，但 local/S3/GCS bundle 可不 versioned，且不覆盖 task 实际 checkout、image、service/config consumption。[DAG bundles](https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/dag-bundles.html)。
- **11–14：** DagRun/TaskInstance/try_number 区分 run 与 attempt；clear/retry 会保留部分历史，但 XCom/rendered templates 可能不作为旧 attempt 完整快照。无 agent Session。operator/provider package 是 integration connector，通常不声明 actual-use coverage 或 canonical recovery guarantee。[Dag run](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html)。
- **15–18：** logs、task history、XCom、datasets/lineage integrations 可观测；material responsibility 仍停在 task边界。外部 object 常是 connection/operator params。DAG/DagRun 是最高组织层，没有长期跨多个 DAG/human/CI 的 Work aggregate。

### LangGraph

- **1–6：** 核心是 StateGraph、node、edge、thread/checkpoint；支持 cycle、conditional edge、dynamic routing、parallel Send、subgraph/reusable nodes、多-agent supervisor/handoff。checkpoint 每 super-step 持久化；可 replay、fork、resume、durable interrupt。node retry有 API；interrupt resume 会从 node 开头重跑，副作用需幂等。Human 可 pause/edit state/reject/resume，是 runtime一等模式。[Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)、[Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)。
- **7–10：** sandbox/process/workspace/network 不由 graph core 强制；tool/node 自行准备。config/state 能传 resource identifier，但没有通用 exact Git/image/secret/service-generation binding，也不自动证明实际消费。checkpoint 证明 graph state，不证明 external runtime state。
- **11–14：** thread/checkpoint/task/write 提供 graph责任粒度；node attempt 与 external side effect identity需应用关联。thread continuation通常复用 thread ID并增加 checkpoint，而非天然新独立 Execution。任何 provider/tool可接入，但 abstraction 重点是 Runnable/tool/node，不是 prepare/evidence/recovery capability contract。
- **15–18：** LangSmith/OTel 可记录 node/LLM/tool trace、tokens与state；graph causality强，artifact/material contribution需自建。外部对象通常存 state/config。thread/graph run 常是最高层，没有独立 Work 跨多个 graph runtime。

### OpenAI Agents SDK（含 Sandbox Agents）

- **1–6：** 核心是 Agent、Runner/Run、Session、Tool、Handoff、Guardrail、Trace；manager-as-tool 与 handoff 支持多 agent routing/delegation，共享对话上下文。普通 Runner 是 agent loop，不是通用 DAG/durable engine；HITL 可在 tool approval 处中断/恢复，durability推荐外部 orchestrator。[Multi-agent](https://openai.github.io/openai-agents-python/multi_agent/)、[HITL](https://openai.github.io/openai-agents-python/human_in_the_loop/)。
- **7–10：** Sandbox Agents 提供 local/Docker/hosted provider、Manifest、session、snapshot、capability、network/filesystem/command boundary。Manifest 是 fresh-session desired state，不是复用 live sandbox 的完整 source of truth；Git ref可浮动。MaterializationResult 的 path+SHA‑256证明实际物化，不证明 agent消费，也未形成全资源 completeness。[Sandbox guide](https://openai.github.io/openai-agents-python/sandbox/guide/)、[materialization source](https://github.com/openai/openai-agents-python/blob/main/src/agents/sandbox/materialization.py)。
- **11–14：** Run/session/trace/tool call有 identity，但没有像 Pydantic Harness 一样公开统一的 independent side-effect attempt ledger；session可延续上下文。Sandbox provider已有较强 capability/preparation abstraction，外层 Runner拥有 approval/tracing/handoff，sandbox拥有commands/files/isolation；resource consumption/output/recovery覆盖仍非统一 contract。[Sandbox session reference](https://openai.github.io/openai-agents-python/ref/sandbox/session/sandbox_session/)。
- **15–18：** 内建 trace覆盖 agent、generation、tool、handoff、guardrail；sandbox audit events可关联 backend/session。provenance主要是trace causality，缺少跨 CI/Human/artifact contribution。native IDs可作为应用 Ref，但无通用 Ref graph；Session/Run是上层，长期 Work跨多个 workflow/provider非core。

### CrewAI

- **1–6：** 核心是 Agent、Task、Crew、Flow、state；Flow支持start/listen/router、loop、parallel path与多 crew/agent composition。state persistence/checkpoint/fork/resume和human feedback存在；retry/durability强度依赖持久化与host，不应等同Temporal。[Flows](https://docs.crewai.com/v1.15.17/en/concepts/flows)、[checkpointing](https://docs.crewai.com/v1.15.17/en/concepts/checkpointing)。
- **7–10：** tool/code execution环境依赖部署与集成；Flow state/inputs/config不是exact workspace/image/service binding。Execution-boundary hooks能观察或介入 agent execution，是很接近治理的扩展点，但仍不会自动产生 actual resource coverage。[Execution-boundary hooks](https://docs.crewai.com/v1.15.17/en/learn/execution-boundary-hooks)。
- **11–14：** crew/flow execution、task与state ID有框架内责任；session/memory continuity与独立side-effect attempt区分不如Pydantic Harness严格。多模型/工具/provider可接，但 abstraction以agent/tool为中心，不声明runtime preparation与evidence guarantee。
- **15–18：** tracing/hooks/state/output可观测；task output chain可作轻 provenance，非跨系统artifact evidence。外部资源多为tool inputs/config。Flow/Crew execution是最高层，长期 Work不是独立对象。[Human feedback](https://docs.crewai.com/v1.15.17/en/learn/human-feedback-in-flows)。

### AutoGen 与 Microsoft Agent Framework

- **1–6：** AutoGen核心是 conversable agent、message、team/run；round-robin、selector、Swarm等支持multi-agent与handoff，但graph/durable progression不如后继 MAF。AutoGen state可save/load；in-run UserProxy持有不稳定状态，官方建议在人类交互边界分段运行。MAF则已有functional/graph workflow、fan-out/in、loop、checkpoint/resume、handoff、tool approval/HITL和workflow-as-agent。[AutoGen teams](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/teams.html)、[state](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/state.html)、[MAF samples](https://github.com/microsoft/agent-framework/blob/main/python/samples/03-workflows/README.md)。
- **7–10：** AutoGen code executor/MAF hosting可委托process/container/channel，但 exact Git/workspace/image/network/secrets pinning不是统一core；message/config/state也不是actual consumption evidence。MAF文档明确 checkpoint是execution state而非protocol state，说明其边界仍围绕workflow/session。[MAF hosting decision](https://github.com/microsoft/agent-framework/blob/main/docs/decisions/0027-hosting-channels.md)。
- **11–14：** AutoGen team run、agent、conversation有identity但需要caller组织持久化；MAF更清楚地区分session/checkpoint/workflow run。两个框架均支持cross-model/tool/provider，但adapter重点是agent/chat/tool/hosting，不是跨CI/Human/sandbox的resource-evidence provider。
- **15–18：** messages/events/telemetry提供conversation和workflow observability；provenance是message/tool causality。外部对象通常是configuration或应用ID。Team/Workflow/Session为上层，没有长期跨框架Work。AutoGen已非微软对新用户的主推荐，2026架构判断应以MAF为主线。[AutoGen repository](https://github.com/microsoft/autogen)。

### Pydantic AI / Graph / Harness

- **1–6：** 核心是 Agent、Model、Tool/Toolset、Run、message history；Graph/agent loop可组织stateful branching，多-agent常以delegation/tool实现。durable execution通过Temporal/DBOS/Prefect/Restate集成。deferred tool/HITL由host恢复；不是自带visual workflow runtime。[Durable execution overview](https://pydantic.dev/docs/ai/capabilities/durable_execution/overview/)。
- **7–10：** runtime isolation外置。Temporal integration要求stable model/toolset identity并限制运行时解析漂移，这是强binding子集；但Git/workspace/sandbox/service/artifact的统一冻结与actual evidence不存在。[Temporal integration](https://pydantic.dev/docs/ai/capabilities/durable_execution/temporal/)。
- **11–14：** Harness StepPersistence是强反例：`conversation_id`组织连续上下文，每次`Agent.run`有新`run_id`，内部有`step_index`和`parent_run_id`；append-only effect lifecycle把crash后不明副作用标为`unknown_after_crash`，orchestrator决定是否replay。它不自动恢复graph/capability或dedup side effect。模型/tool provider可替换，但provider abstraction不覆盖全部runtime resources。[StepPersistence](https://pydantic.dev/docs/ai/harness/step-persistence/)。
- **15–18：** messages、usage、tool effects、traces和run lineage强；artifact/provenance跨系统仍外置。模型/tool IDs有稳定引用语义，但不是universal Ref。Conversation/run是框架上层，长期 Work可由应用创建但非core。

### LlamaIndex Workflows / Agents

- **1–6：** 核心是 event-driven Workflow、Event、Step、Context；可表达branch、loop、concurrent events、subworkflow与agent patterns。Context/state可持久化，DBOS等提供durable integration；human-in-loop通过event/input pattern。multiple agents与handoff有官方patterns。[Workflows repository](https://github.com/run-llama/workflows-py)、[multi-agent patterns](https://github.com/run-llama/llama_index/blob/main/docs/src/content/docs/framework/understanding/agent/multi_agent.md)。
- **7–10：** process/sandbox/workspace/environment外置；Context和workflow input不构成exact resource enforcement。没有统一requested/resolved/actual resource evidence或undeclared-input coverage。
- **11–14：** workflow run/context/step event提供框架责任，durable attempt semantics由DBOS等host决定；agent chat/session continuity与independent external side effect需应用建模。LLM/tool/provider广泛，但provider抽象偏model/index/tool，不含runtime preparation/evidence/recovery。[DBOS example](https://github.com/run-llama/llama-agents/blob/main/examples/dbos/README.md)。
- **15–18：** event stream、context、tracing提供workflow/agent observability；RAG/index data lineage有域内能力，但不是跨execution贡献账本。外部对象通常以index/tool/config/ID出现。Workflow/agent session是上层，Work需外置。

### n8n

- **1–6：** 核心是 Workflow、Node、Execution；visual DAG-like flow支持branch、loop、subworkflow、error workflow、wait和大量reusable connector。execution持久化、node retry和重新执行成熟；可等待form/webhook/email approval，但Human Decision通常是节点/输入，不是独立责任aggregate。AI agent/tool nodes提供有限agent orchestration。[Executions](https://docs.n8n.io/workflows/executions/all-executions/)。
- **7–10：** isolation取决于self-hosted/worker/node；某些节点可访问host filesystem/process，需额外安全控制。credential、environment、Git source control和node params属于deployment/config；Git保存/发布版本不等于每次execution exact binding或actual consumption。[Source-control environments](https://docs.n8n.io/source-control-environments/create-environments/)、[security audit](https://docs.n8n.io/hosting/securing/security-audit/)。
- **11–14：** execution/node execution与retry identity可查询；可选择按original/current workflow retry，说明definition version与attempt有区别。session continuity主要由AI node/application实现。跨provider强在connector catalog，但connector不是prepare/consume/evidence capability provider。
- **15–18：** node input/output/status/log与binary execution data可观测；provenance是workflow dataflow，删除execution会删除历史。外部对象多为credential/JSON/connector metadata。Workflow/Execution是最高层，无跨多个workflow的长期Work。[Send and wait](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gmail/message-operations/)。

### Dify

- **1–6：** 核心是 App、Workflow/Chatflow、Node、Run；支持condition、iteration、loop、agent/tool、knowledge retrieval和reusable node patterns。node error handling/retry/fail branch、持久run history可用。Human Input是first-class node，支持表单、编辑、多个action/rejection路径和timeout；agent coordination主要通过agent/node/flow组合。[Human Input](https://docs.dify.ai/en/cloud/use-dify/nodes/human-input)、[Loop](https://docs.dify.ai/en/cloud/use-dify/nodes/loop)。
- **7–10：** code/tool sandbox与platform deployment提供一定隔离，但workspace/Git/service generation不是统一资源对象；模型/provider/credential/node config可声明，未形成exact resolved vs actual consumed proof。
- **11–14：** app run/node run/loop iteration有责任粒度；chat conversation提供continuity，但与independent external attempt的关系由flow定义。跨model/tool/provider强，但plugin/node abstraction主要是connector/capability，不声明correlation/recovery/evidence coverage。
- **15–18：** history/log展示app/node inputs、outputs、timing、token与dataflow；provenance停在flow内。external resource常为dataset/tool/credential ID或JSON。App/Conversation/Workflow Run是上层，无独立Work跨多个apps/humans/CI。[History and logs](https://docs.dify.ai/en/cloud/use-dify/debug/history-and-logs)。

### Coze / Coze Studio

- **1–6：** 核心是 Bot/App、Workflow、Node、Execution；官方开源实现显示branch、loop、batch、subworkflow、retry/timeout/default branch。Question node可interrupt/resume，async API返回execute_id；agent/tool coordination以平台node为主。[Workflow node types](https://github.com/coze-dev/coze-studio/wiki/11.-Add-new-workflow-node-types-%28backend%29)、[API reference](https://github.com/coze-dev/coze-studio/wiki/6.-API-Reference)。
- **7–10：** cloud/self-hosted runtime负责node execution，具体sandbox/network/workspace guarantee随部署而异；resource/connector/model config不是统一exact binding，也未公开完整actual-consumption evidence。
- **11–14：** workflow execute_id/node execution可关联；conversation与workflow execution分开，但independent side-effect attempt/retry映射并非通用contract。跨provider依靠plugin/node connector，不声明runtime preparation与evidence coverage。
- **15–18：** workflow logs、node input/output/status提供观测；provenance是平台内dataflow。external identity主要是app/workflow/plugin/conversation IDs。最高层是App/Bot/Workflow，长期跨系统Work不原生。

### Flowise

- **1–6：** 核心是 Chatflow/Agentflow、Node、Flow State、Session/Checkpoint；Agentflow V2支持condition、iteration、loop、subflow、queue、supervisor/worker multi-agent。checkpoint可让app restart后resume；HITL支持proceed/reject/feedback与tool approval。[Agentflow V2](https://docs.flowiseai.com/using-flowise/agentflowv2)、[HITL](https://docs.flowiseai.com/tutorials/human-in-the-loop)。
- **7–10：** isolation/environment由部署、tool与code node负责；credential、flow state、node input不是exact Git/image/service binding。没有实际资源消费证明或completeness。
- **11–14：** flow/session/checkpoint/node有运行identity；session continuation与node attempt存在但不是跨provider responsibility contract。model/tool/vector DB/provider integration广，provider语义仍是connector/node。
- **15–18：** flow trace/state/node output可观测；message/dataflow provenance强于execution material provenance。外部资源通常是credential/component IDs。Flow/Session是最高层，无独立长期Work。

### AI execution / sandbox / coding-agent infrastructure（重点邻接组）

- **1–6：** Anthropic Managed Agents围绕Agent/Environment/Session/Event；E2B/Daytona/Modal围绕Sandbox/Snapshot/Process；GitHub Copilot coding agent围绕Agent Session/Task/PR；Dagger围绕typed pipeline/core resources。它们不普遍拥有general DAG/HITL，但能被orchestrator调用。Anthropic/GitHub有agent session和human review workflow，sandbox providers则没有。[Anthropic quickstart](https://platform.claude.com/docs/en/managed-agents/quickstart)、[GitHub agent sessions](https://docs.github.com/en/copilot/how-tos/github-copilot-app/agent-sessions)。
- **7–10：** 这是它们最强的维度：fresh isolated sandbox、image/snapshot、filesystem/process、network policy、package/environment、workspace/branch。仍须看exact guarantee：Anthropic Environment不versioned；Daytona禁止部分mutable system tags但普通mutable image tag仍可能使用；OpenAI Manifest允许floating Git ref。Dagger CAS与Bazel REAPI是exact input binding强反例。actual runtime logs/materialization/audit比workflow参数更强，但通常不能证明语义消费或排除全部undeclared input。[Anthropic environments](https://platform.claude.com/docs/en/managed-agents/environments)、[Daytona snapshots](https://www.daytona.io/docs/en/snapshots/)、[Dagger core types](https://docs.dagger.io/next/extending/type-system/core-types/)。
- **11–14：** sandbox/session/process/run IDs明确；pause/resume/snapshot通常延续同sandbox，coding-agent resume延续session。GitHub Actions有run/attempt；Anthropic self-hosted worker接收session/work/environment IDs。各家provider abstraction主要覆盖sandbox backend或agent environment，较少统一Human/CI/workflow responsibility与actual-resource evidence。[Self-hosted sandboxes](https://platform.claude.com/docs/en/managed-agents/self-hosted-sandboxes)、[Actions variables](https://docs.github.com/en/actions/reference/workflows-and-actions/variables)。
- **15–18：** session events、tool logs、audit、OTel、signed commits和CAS graph很强；跨executionartifact→human→deploy provenance仍需外部标准/系统。它们的IDs可自然成为Ref。Task/Session/Sandbox通常是最高层，没有provider-neutral长期Work。这一组最适合成为Agent‑Box integration，不适合被重新实现。

## Appendix B — 保证强度的三个关键反例

### SLSA：requested 与 resolved 并非 Agent‑Box 独有

SLSA v1.2 Build Provenance 的 `externalParameters` 可表达 branch `main`，`resolvedDependencies` 可表达实际解析的 commit digest；另有 builder ID、globally unique invocation ID、subject/output digest 与 completeness。它证明 request→resolution→attestation 在受控 builder 中已经成熟。Agent‑Box 的增量只能是把这种语义推广到非 build execution，并保留无法达到 SLSA assurance 时的 partial/unknown。[SLSA Build Provenance](https://slsa.dev/spec/v1.2/build-provenance)。

### Bazel REAPI：exact contract 与 attempt identity 是两件事

Remote Execution `Action` 通过 digest 绑定 Command、input root 与 platform，输出进入 CAS；但规范允许服务器多次、甚至并行执行同一 Action。也就是说，hermetic/reproducible input contract 并不自动提供“唯一 side-effect attempt”。Agent‑Box 的 Binding 与 Execution/Dispatch 分离是有实际语义的，但不应声称两者此前从未被区分。[Remote Execution API](https://github.com/bazelbuild/remote-apis/blob/main/build/bazel/remote/execution/v2/remote_execution.proto)。

### Pydantic AI Harness：continuation provenance 已有强先例

StepPersistence 的 conversation/run/step/effect ledger直接否定“agent framework 普遍无法区分 session continuity 与 execution attempt”。Agent‑Box 必须赢在跨 Claude/Codex/CI/Human/workflow 的相同责任查询，而不是在单一 agent runtime 中重做该 ledger。[Pydantic AI StepPersistence](https://pydantic.dev/docs/ai/harness/step-persistence/)。
