# Agent-Box Preview Stack A：外部 Workflow Runtime 选型与接入设计
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 文档导航：[总目录](../README.md)
>
> 调研日期：2026-08-24
>
> 状态：Preview Provider 选型建议
>
> 决策：使用真实外部 Workflow Runtime；首选 LangGraph local Agent Server，fallback 为 DBOS

## Executive verdict

选择 **B：使用真实轻量 workflow 产品更好**。

Stack A 应将自建 `DemoContextProvider` 替换为：

> **LangGraph local Agent Server + LangGraphWorkflowResourceAdapter**

推荐部署方式：

- 单独启动 `langgraph dev --no-reload --no-browser`；
- 不嵌入 Agent-Box Core；
- 不启用 LangSmith tracing；
- Agent-Box 通过官方 SDK/HTTP API 查询；
- LangGraph 持有 thread、run、checkpoint、state、routing 和 interrupts；
- Agent-Box 只保存 Ref、immutable context snapshot 和 evidence。

Fallback：

> **DBOS + SQLite + DBOSWorkflowResourceAdapter**

LangGraph 适合这个位置的核心原因不是它“能画 graph”，而是它天然提供了三层需要的对象：

1. `thread_id`：长期 workflow instance identity；
2. `checkpoint_id`：精确、不可变的 native state revision；
3. `StateSnapshot`：可以映射成 Harness 使用的 immutable context artifact。

截至 2026-08-24，LangGraph 1.2.x 是稳定、持续活跃的产品线；PyPI 显示 2026 年 8 月发布了 1.2.11，项目自报 production/stable。[LangGraph PyPI](https://pypi.org/project/langgraph/)、[LangGraph GitHub](https://github.com/langchain-ai/langgraph)

## Exact requirements for Preview workflow integration

这个 Provider 不应叫 ExecutionProvider。它主要承担：

- `Workflow Resource Authority`
- `Workflow Context Snapshotter`
- `Workflow Evidence Adapter`
- 可选 `Workflow State Update Adapter`

最低 contract：

```text
resolve(selector)
  -> WorkflowInstanceRef
  -> current WorkflowRevisionRef

snapshot(instance, revision)
  -> selected external state
  -> immutable ArtifactRef
  -> EvidenceRef

update(instance, base_revision, host_input)
  -> new native revision
  -> optional WorkflowRunRef
  -> update evidence

observe(instance)
  -> latest native state/revision
```

必须满足：

- native identity 由外部 runtime 产生；
- exact revision 由外部 runtime 产生；
- context snapshot 引用该 exact revision；
- 能区分“最新状态”和“Binding 已冻结状态”；
- state 改变后旧 Binding 不发生变化；
- Host 显式决定是否 update/advance；
- Host 显式决定是否据此创建下一次 Core Execution。

它不负责：

- 创建 Agent-Box Execution；
- 接受 Agent-Box Dispatch；
- 自动把一个 workflow node 映射成一个 Execution；
- 镜像 graph 或 checkpoint payload 进 Core；
- 自动执行 `next` node；
- 把 workflow success 当作 Work closure。

## Candidate landscape

本轮保留的真实候选如下。

| 产品 | 2026 状态 | 本地形态 | Native identity / revision | 结论 |
|---|---|---|---|---|
| LangGraph | 1.2.x，production/stable，活跃 | `langgraph dev` 单进程、无 Docker；或 embedded SQLite checkpointer | Thread ID、Run ID、Checkpoint ID | **最佳匹配** |
| DBOS | 2.29.0 stable，活跃 | Python library + 默认 SQLite | Workflow ID、application version、monotonic step function ID | **最佳 fallback** |
| Prefect | 3.8.3，成熟活跃 | local server + SQLite + UI | FlowRun ID、State ID、TaskRun ID | 成熟，但 FlowRun 与 Execution 重叠较强 |
| Temporal | Python SDK 1.31.x，成熟活跃 | 单二进制 dev server + worker + UI | Workflow ID、Run ID、event history | 技术最强，Demo 成本过高 |
| Apache Burr | 0.42.0，Apache incubating/beta | embedded Python + SQLite + UI | app ID、sequence ID、action name | 形状很好，但成熟度不足 |
| Restate | Server 1.7.x、Python SDK 1.0.x | 单二进制 server + application service | Workflow ID、Invocation ID、journal | 真实且轻，但通用状态导出不如 LangGraph |
| Inngest | 1.22.x，活跃 | 单二进制 Dev Server + app endpoint | function/run/step identity | 更偏 event-driven function execution |
| Hatchet | 0.87.x，活跃 | control plane、DB、worker | workflow run/task identities | 对 Preview 太重 |

这些候选都在 2026 年有活跃发布；没有纳入多年不维护或缺少 persistence/native identity 的库。

## LangGraph analysis

### Identity 模型

使用 LangGraph Agent Server 时，identity 层次非常自然：

```text
Graph / Assistant
  └─ Thread
       ├─ Run 1
       │    └─ Checkpoint A
       ├─ Run 2
       │    └─ Checkpoint B
       └─ Run 3
            └─ Checkpoint C
```

官方模型中：

- Thread 是跨多个 run 持久保存 state 的容器；
- Run 是某次 graph invocation；
- Checkpoint 是某个 super-step 边界的完整 state snapshot；
- 同一 Thread 可以产生多个 Run 和多个 Checkpoint。[LangGraph threads](https://docs.langchain.com/langsmith/use-threads)、[runs](https://docs.langchain.com/langsmith/runs)

这比 Prefect FlowRun 或 DBOS Workflow ID 更适合 Agent-Box，因为 `Thread` 不必与某次 Core Execution 一一对应。

### thread_id

Agent Server 的：

```python
thread = await client.threads.create()
thread_id = thread["thread_id"]
```

返回真实 server-native UUID。它可以跨多次 Core Execution 使用：

```text
E1 Binding → Thread T, Checkpoint C1
E2 Binding → Thread T, Checkpoint C2
E3 Binding → Thread T, Checkpoint C3
```

Core Execution 没有被 reopen；只有外部 workflow instance 延续。

### checkpoint_id 与 state

`get_state(thread_id)` 返回：

- `values`
- `next`
- `tasks`
- `interrupts`
- `metadata.step`
- `metadata.writes`
- `checkpoint_id`
- `parent_checkpoint_id`
- `created_at`

[Get Thread State API](https://docs.langchain.com/langsmith/agent-server-api/threads/get-thread-state)

这正好满足 exact native revision。

需要注意：LangGraph 不一定只有一个“当前 node”。并行 super-step、subgraph 或 interrupt 情况下，应保留：

- `next_nodes[]`
- `active_tasks[]`
- `interrupts[]`

Adapter 不应强行压缩成单一 `current_node`。

### state history

Agent-Box 可以通过：

```python
await client.threads.get_history(thread_id=thread_id)
```

或 embedded graph 的：

```python
graph.get_state_history(config)
```

读取完整 checkpoint history。每个 checkpoint 都有 parent、step、writes 和 state。[LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence)

这允许 Adapter：

- 验证 checkpoint 确实存在；
- 保存 native locator；
- 说明 snapshot 来自哪个 step；
- 检测 Binding freeze 期间 workflow 是否又前进了。

### update_state

`update_state` 不会原地修改旧 checkpoint，而会生成新 checkpoint；可以指定 base checkpoint 和 `as_node`。[Update Thread State API](https://docs.langchain.com/langsmith/agent-server-api/threads/update-thread-state)

推荐语义：

```text
Host decides to record E1 result
  → adapter.update(
      thread=T,
      base_checkpoint=C1,
      values={execution_result_ref, human_direction},
      as_node="host_result"
    )
  → LangGraph returns C2
```

这非常适合：

- Human 改变产品方向；
- Host 写入 repair scope；
- Execution 完成后提交 result artifact；
- 外部 graph 根据新 state 计算下一阶段或 recommendation。

Agent-Box Core 不自动进行这个调用。它是 Host 明确发起的 workflow integration action。

### interrupts / HITL

LangGraph `interrupt()` 会：

- 保存 checkpoint；
- 暂停 graph；
- 暴露 JSON-serializable interrupt payload；
- 等待外部输入；
- 使用同一 `thread_id` 恢复。

[LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)

这很适合让外部 workflow 表达：

```text
current phase: repair planning
waiting for: host scope decision
recommendation: targeted repair
```

但不应让 LangGraph interrupt 自动生成 Agent-Box Human Execution。即时选择仍是 Host decision。

### subgraphs

LangGraph 支持 subgraph persistence，并可通过：

```python
get_state(config, subgraphs=True)
```

查看静态可发现的 subgraph state。[LangGraph subgraphs](https://docs.langchain.com/oss/python/langgraph/use-subgraphs)

Preview Adapter 默认只取 top-level state。只有 responsibility 真正位于 subgraph 中时，才额外输出相关 subgraph checkpoint Ref；不要递归复制整个 graph state。

### 本地部署

推荐：

```bash
pip install "langgraph-cli[inmem]" langgraph-sdk
langgraph dev --no-reload --no-browser
```

官方说明 `langgraph dev`：

- 不需要 Docker；
- 是 lightweight local dev server；
- 提供完整 Threads/Runs/Assistants API；
- state 持久化到本地目录；
- 适合 development/testing。[LangGraph CLI](https://docs.langchain.com/langsmith/cli)

同时设置：

```text
LANGSMITH_TRACING=false
LANGGRAPH_CLI_NO_ANALYTICS=1
```

正式 standalone Agent Server 则需要 Postgres、Redis 和相应 license/部署配置，不适合 Preview。[Standalone Agent Server](https://docs.langchain.com/langsmith/deploy-standalone-server)

### SQLite

若不使用 Agent Server，可以直接使用：

```python
SqliteSaver
AsyncSqliteSaver
```

LangGraph 官方将 `langgraph-checkpoint-sqlite` 定位为 local workflow/experimentation persistence。[LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence)

但 Preview 更推荐 local Agent Server，因为它额外提供：

- server-native Thread ID；
- native Run ID；
- HTTP/SDK authority boundary；
- inspectable API；
- 更明显的“外部 workflow runtime”体验。

### 主要风险

- `langgraph dev` 是开发 runtime，不是生产部署。
- hot reload 会削弱 graph definition pin，因此必须 `--no-reload`。
- local dev 的 deployment revision 不如 managed deployment 明确；需要额外绑定 graph source Git SHA/package digest。
- state schema 是 workflow-owned contract，升级必须版本化。
- LangGraph 的 run 与 Agent-Box Execution 都有“运行”语义，需要 UI 明确区分 `WorkflowRunRef` 与 `ExecutionRef`。
- 必须 spike 验证 local state directory 在目标环境的重启恢复行为。

## Prefect analysis

Prefect 的本地开发并不算重：

```bash
pip install prefect
prefect server start
```

默认使用 `~/.prefect/prefect.db` SQLite，并提供本地 API 和 UI。[Prefect local server](https://docs.prefect.io/v3/how-to-guides/self-hosted/server-cli)

### 优点

Native identity 很成熟：

- Flow ID
- FlowRun ID
- TaskRun ID
- State ID
- Deployment ID/version

FlowRun API 还能读取：

- parameters
- context
- labels/tags
- current state
- `state_id`
- `flow_version`
- `deployment_version`
- run count
- infrastructure identity

[Prefect FlowRun API](https://docs.prefect.io/v3/api-ref/rest-api/server/flow-runs/create-flow-run)

Human interaction 也很好：

- pause/suspend；
- typed `RunInput`；
- UI resume；
- 运行中 send/receive input。[Prefect interactive workflows](https://docs.prefect.io/v3/advanced/interactive)

### 不自然之处

Prefect 的主要 state container 是 **FlowRun**，而 FlowRun 本身代表一次应走向 terminal 的 flow invocation。[Prefect flows](https://docs.prefect.io/v3/concepts/flows)

这会出现两种别扭结构。

方案一是一个 FlowRun 跨多个 Core Executions。FlowRun 必须长时间 paused，承担整个 Work progression，UI 中容易被理解为 `Prefect FlowRun ≈ Agent-Box Work`。

方案二是每个 Core Execution 对应一个 FlowRun，此时又会变成 `Prefect FlowRun ≈ Agent-Box Execution`，Prefect 更像 `ExternalWorkflowRunExecutionProvider`，而不是 Context Resource。

此外，Prefect 的 State ID 是精确 native revision，但 flow 的任意 Python local state 并不自动成为可查询 context。通常需要通过 parameters/context、state data/result、artifacts、variables、RunInput 或 task outputs 主动建模。

### 结论

Prefect 技术上完全可接，local UI 也很适合 Demo，但它更适合展示：

> Agent-Box 把一个外部 FlowRun 作为 accountable external workflow execution 接入。

它不是本次“跨多个 Core Executions 共享 workflow context”的最佳选择。

## Temporal analysis

Temporal 的 identity 是最强的一组：

- Namespace
- Workflow ID
- Run ID
- Event History
- Workflow Execution Chain

Workflow Execution 唯一由 namespace、Workflow ID、Run ID 标识；同一 Workflow ID 可通过 retry/Continue-As-New 形成多个 Run。[Temporal Workflow Execution](https://docs.temporal.io/workflow-execution)

### 本地开发

可以单命令启动：

```bash
temporal server start-dev \
  --db-filename ./temporal-preview.db
```

它提供本地 server、文件持久化、Web UI 和 gRPC API。[Temporal CLI start-dev](https://docs.temporal.io/cli/command-reference/server)

但还必须：

- 编写确定性的 Temporal Workflow；
- 启动 Python worker；
- 注册 task queue；
- 编写 Query/Update/Signal handlers。

### 状态查询和更新

Temporal 提供非常优雅的 message model：

- Query：只读当前 workflow state，不进入 event history；
- Signal：异步写入；
- Update：同步、可验证、可追踪的写入。[Temporal message passing](https://docs.temporal.io/encyclopedia/workflow-message-passing)

它在语义上甚至比 LangGraph 更强：

```text
Agent-Box snapshot → Query
Host result update → Update
async external event → Signal
```

### 精确 revision 的问题

Temporal 没有与 LangGraph `checkpoint_id` 完全等价的简单 public abstraction。

可以使用：

- Run ID；
- Event History event ID/history length；
- Query response digest；
- 或通过 tracked Update 返回 snapshot。

但普通 Query 本身不进入 history，所以要证明 Query response 精确对应 history revision，需要额外 watermark 或 Update 设计。

另外，Temporal 不能通用读取 Workflow 的任意内部 state。Workflow 必须显式实现 Query handler。

### 结论

Temporal 在长期、关键业务系统里会是最漂亮的 integration；但 Preview 不值得承担 server、worker、deterministic workflow constraints、Query/Update handlers、event-history revision 映射，以及两套强 execution semantics 的解释成本。

因此：**技术推荐，Preview 不推荐。**

## Other lightweight real workflow products

### DBOS

截至 2026 年 7 月，DBOS Python 2.29.0 为 production/stable；默认使用 SQLite，无需额外 server，生产才推荐 Postgres。[DBOS PyPI](https://pypi.org/project/dbos/)、[DBOS database](https://docs.dbos.dev/python/tutorials/database-connection)

它提供：

- native Workflow ID；
- application version；
- workflow status；
- monotonic `function_id` step sequence；
- durable events；
- messages；
- append-only streams；
- workflow listing/recovery/fork。

[DBOS workflow management](https://docs.dbos.dev/python/tutorials/workflow-management)、[workflow communication](https://docs.dbos.dev/python/tutorials/workflow-communication)

适配结构可以是：

```text
WorkflowInstanceRef
  = DBOS workflow_id

WorkflowRevisionRef
  = workflow_id
  + application_version
  + last completed function_id
  + context stream position/digest

Context ArtifactRef
  = latest native context stream record
```

缺点是 DBOS 没有通用 `get_current_state()` 返回任意 workflow state。Workflow 必须通过 `set_event("current_context", ...)` 或 append-only `write_stream("context-revisions", ...)` 发布可查询 context。

这仍然是真实 DBOS workflow state，不是 Agent-Box 自建服务，但 adapter contract 比 LangGraph 多一个 publishing convention。

**DBOS 是 fallback。**

### Apache Burr

Burr 的形状非常好：

- `app_id`：长期 instance identity；
- `sequence_id`：精确 state revision；
- `action_name`：当前/上次 action；
- SQLite/Postgres/Redis/Mongo persisters；
- state 可按 sequence ID 读取；
- 支持 halt、resume、fork、tracking UI。

[Burr state persistence](https://burr.dagworks.io/concepts/state-persistence/)、[persisters](https://burr.dagworks.io/reference/persister/)

它几乎是 LangGraph 的更轻版本，但存在 Apache incubating、PyPI beta、package namespace 迁移和生态规模较小等风险。因此适合作为实验候选，不作为 Preview fallback。

### Restate

Restate 1.7.x 是活跃的单二进制 durable runtime，Workflow 使用稳定 workflow key，执行产生 Invocation ID 和 journal；支持 attach、cancel、durable promises 和 UI。[Restate workflows](https://docs.restate.dev/tour/workflows)、[invocations](https://docs.restate.dev/foundations/invocations)

问题与 Temporal 类似：需要显式 workflow handlers 暴露 context，public API 中没有像 `checkpoint_id` 一样直接的 state revision，invocation lifecycle 也较容易与 Execution 发生概念重叠。

### Inngest

Inngest Dev Server 是单二进制本地 runtime，有 UI、event、function run 和 durable step state。[Inngest local development](https://www.inngest.com/docs/local-development)

但它主要面向 event-driven functions：长期 workflow instance identity 不如 Thread 自然，任意当前 state/context API 不够直接，更适合 External Workflow Run ExecutionProvider。

### Hatchet

Hatchet 是活跃的 durable workflow/background task 产品，但自托管通常包含 API、engine、数据库和 worker。对这个单一资源 integration 没有超过 LangGraph、DBOS 的价值。

## Comparison table

评分：5 最优；“重叠风险”5 表示风险最高。

| 候选 | Setup | Local-first | Identity | State API | Persistence | Exact revision | Adapter | 重叠风险 | Demo 可见性 | 生态成熟度 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| LangGraph Agent Server | 4 | 5 | 5 | 5 | 5 | 5 | 4 | 3 | 5 | 5 |
| DBOS | 5 | 5 | 4 | 3 | 5 | 3 | 4 | 4 | 3 | 4 |
| Prefect | 3 | 5 | 5 | 3 | 5 | 4 | 3 | 5 | 5 | 5 |
| Temporal | 2 | 3 | 5 | 4 | 5 | 4 | 2 | 5 | 5 | 5 |
| Apache Burr | 5 | 5 | 4 | 5 | 4 | 5 | 5 | 3 | 4 | 2 |
| Restate | 3 | 4 | 5 | 3 | 5 | 3 | 3 | 5 | 4 | 4 |
| Inngest | 4 | 4 | 4 | 2 | 4 | 3 | 3 | 5 | 5 | 4 |
| Hatchet | 2 | 2 | 5 | 3 | 5 | 4 | 2 | 5 | 5 | 4 |

LangGraph 的关键优势是唯一同时自然满足：

```text
long-lived instance
+ exact native revision
+ generic current state
+ update creates new revision
+ local single-process server
```

## Top 3 candidates

### 1. LangGraph

最自然的三层 identity；首选。

### 2. DBOS

部署最轻、真实 durable workflow、SQLite 默认；context 需用 native event/stream 发布。Fallback。

### 3. Prefect

成熟、UI 和 API 最强，但 FlowRun 与 Agent-Box Execution 语义重叠明显。若未来想展示 ExternalWorkflowRunExecutionProvider，它可能升为首选。

Temporal 技术能力高于 Prefect，但不进入 Preview Top 3，因为集成和解释成本明显更高。

## Recommended candidate

首选：

> **LangGraph local Agent Server**

具体不是：

```text
Agent-Box imports LangGraph and quietly calls graph.get_state()
```

而是：

```text
Separate LangGraph local runtime
  owns:
    graph
    threads
    runs
    checkpoints
    state
    routing
    interrupts

LangGraphWorkflowResourceAdapter
  calls:
    official SDK / HTTP API

Agent-Box
  binds:
    ThreadRef
    CheckpointRef
    Context ArtifactRef
    EvidenceRef
```

UI 中显示：

```text
☑ Workflow: LangGraph
  Thread: 4cd3...
  Checkpoint: 1f02...
  Phase: targeted-repair
  Round: 3
  Next: await_host_result
```

Fallback：

> **DBOS 2.x + SQLite**

## Why this is better than self-built ContextProvider

自建 ContextProvider 只能证明：

> Agent-Box 能生成并注入一份 JSON。

LangGraph integration 可以证明：

- identity 来自外部 workflow runtime；
- state 来自外部持久化 authority；
- exact revision 来自 native checkpoint；
- context 有真实 history；
- update 生成新 checkpoint，而不是覆盖 JSON；
- workflow graph、routing 和 interrupt 独立于 Core；
- 同一 external thread 可以进入多个不同 Core Bindings；
- 用户可以在 LangGraph API/Studio 中独立观察它。

需要编写一个 LangGraph workflow definition，但这相当于编写 GitHub Actions workflow YAML：它是外部产品的应用配置，不属于 Agent-Box Core，也不等于 Agent-Box 实现 workflow engine。

## Exact Agent-Box adapter design

```python
class LangGraphWorkflowResourceAdapter:
    async def probe(self) -> ProviderDescriptor:
        # server version, graph IDs, API capabilities
        ...

    async def resolve(
        self,
        endpoint_ref,
        thread_selector,
    ) -> WorkflowResolution:
        # thread_id, graph_id, assistant_id, latest checkpoint
        ...

    async def snapshot(
        self,
        instance_ref,
        expected_checkpoint=None,
    ) -> WorkflowSnapshot:
        # get exact StateSnapshot
        # select configured context fields
        # canonical JSON
        # sha256
        # ArtifactRef + EvidenceRef
        ...

    async def update(
        self,
        instance_ref,
        base_revision_ref,
        host_input_artifact_ref,
        as_node,
    ) -> WorkflowUpdateReceipt:
        # optimistic base-checkpoint check
        # update_state or submit a graph run
        # return new checkpoint/run refs
        ...

    async def observe(
        self,
        instance_ref,
    ) -> WorkflowObservation:
        # latest checkpoint and status only
        ...
```

### Snapshot consistency

若用户选择“latest”：

1. 获取 latest state S1。
2. 取得 S1 的 `checkpoint_id=C1`。
3. 按 C1 从 history/exact-state API 验证。
4. canonicalize selected values。
5. 写 ArtifactRef。
6. freeze Binding。

若 S1 后又出现 C2：

- 当前 Binding 仍绑定 C1；
- 不自动切换到 C2；
- UI 提示 workflow has advanced；
- Host 可以重新生成 Binding draft。

若 update 要基于 C1，但 latest 已是 C2：

- fail with conflict；
- 不静默覆盖或 fork，除非 Host 明确选择 fork。

### Context field mapping

Adapter 使用 provider configuration 映射，不把字段写入 Core ontology：

```yaml
mapping:
  responsibility: $.values.current_responsibility
  phase: $.values.phase
  round: $.values.round
  upstream_artifacts: $.values.upstream_artifacts
  expected_outputs: $.values.expected_outputs
  roles: $.values.roles
  recommendations: $.values.candidate_next_steps
```

Native fields 同时保留：

```json
{
  "next_nodes": ["await_execution_result"],
  "active_tasks": [],
  "interrupts": [],
  "workflow_step": 7
}
```

## Ref mapping

### A. 长期 identity

```text
WorkflowInstanceRef
  provider: langgraph
  native_kind: thread
  native_id: <thread_id>
  locator: http://127.0.0.1:2024/threads/<thread_id>
  graph_id: preview-workflow
```

这可以跨多个 Core Executions 使用。

### B. 精确 native revision

```text
WorkflowRevisionRef
  provider: langgraph
  native_kind: checkpoint
  native_id: <checkpoint_id>
  parent_id: <parent_checkpoint_id>
  scope: <thread_id>
  checkpoint_ns: ""
```

如果某个 Run 产生该 checkpoint，可额外记录：

```text
WorkflowRunRef
  provider: langgraph
  native_id: <run_id>
```

RunRef 是 provenance，不替代 checkpoint revision。

### C. Immutable execution context

```text
ArtifactRef
  media_type: application/vnd.agent-box.workflow-context+json
  digest: sha256:...
  derived_from:
    WorkflowInstanceRef
    WorkflowRevisionRef
```

不应把完整 state、identity、revision、projection 全塞进一个 Ref。

### Graph definition identity

另设：

```text
ArtifactRef / ProviderResourceRef
  graph_id
  assistant_id
  graph source Git SHA
  package lock digest
  langgraph version
  adapter version
```

这是因为 local dev server 的 graph deployment revision 不如 managed deployment 明确。

## Binding mapping

推荐 Binding：

```yaml
workflow.definition:
  ref: langgraph-graph-profile@sha256:...

workflow.instance:
  ref: langgraph-thread:<thread_id>

workflow.revision:
  ref: langgraph-checkpoint:<checkpoint_id>

workflow.context:
  ref: artifact:sha256:<snapshot_digest>

workflow.observation:
  ref: evidence:<snapshot-receipt>

workflow.update_policy:
  mode: host_explicit
  conflict: fail
```

Binding freeze 后：

- Thread 可以继续前进；
- 旧 checkpoint 仍保持 exact；
- snapshot artifact 不改变；
- 本次 Execution 仍基于 frozen context。

## Runtime projection mapping

Context snapshot 投影为：

```text
workspace/
  .agent-box/
    workflow/
      context.json
      context.md
      source.json
```

环境变量：

```text
AGENT_BOX_WORKFLOW_PROVIDER=langgraph
AGENT_BOX_WORKFLOW_THREAD_ID=<thread_id>
AGENT_BOX_WORKFLOW_CHECKPOINT_ID=<checkpoint_id>
AGENT_BOX_WORKFLOW_CONTEXT_DIGEST=sha256:...
```

Claude：

- 将 participant-specific `context.md` 加入启动 context；
- 不授予 Claude 修改 LangGraph state 的凭证。

Codex：

- 将同一 snapshot 投影为 initial input；
- reviewer 只获得读取后的 artifact，不直接访问 workflow API。

多 Harness E7：

- 三个 participant 使用同一 Thread/Checkpoint；
- 每个 participant 获得不同 role projection；
- 只有 Team Provider/Host integration 持有 update capability。

## Evidence mapping

| Claim | Evidence |
|---|---|
| 外部 workflow instance 存在 | Agent Server `threads.get` response、thread locator |
| 当前 revision 是 C1 | `get_state` / history 返回的 checkpoint ID |
| state 在哪个 workflow step | `metadata.step`、writes、next、tasks |
| context 来自 C1 | canonical snapshot 的 `derived_from` + digest |
| Binding 冻结的是 C1 | Binding digest 和 freeze receipt |
| Harness 收到了 context | projection manifest、目标文件 digest、Harness launch receipt |
| Host 更新了 workflow | `update_state` response、新 checkpoint C2 |
| Workflow 自己前进了 | native RunRef、C2 history、next/tasks |
| external runtime 版本 | server/package version 和 graph definition digest |

Assurance 边界：

- LangGraph local Agent Server 是独立于 Harness 的外部 authority；
- 但它仍运行在同一台本机，不是密码学或第三方独立证明；
- Git/GitHub Actions 仍负责 material/CI evidence；
- Workflow evidence 只证明流程 state，不证明代码或测试真的执行。

## What stays entirely outside Core

以下内容全部属于 LangGraph 或 external workflow application：

- graph topology；
- node names；
- transition/routing；
- checkpoint database；
- current workflow state；
- reducers；
- retry policy；
- interrupts；
- subgraphs；
- state schema；
- next-node calculation；
- Run lifecycle；
- replay/time travel；
- Human-input interpretation；
- candidate-next-step generation。

Agent-Box Core 只知道：

- 一个 Ref；
- 一个 Binding slot；
- 一个 ArtifactRef；
- 一个 EvidenceRef；
- 一个 Provider descriptor；
- projection 和 actual facts。

甚至 `phase`、`round`、`roles` 也不应成为 Core 固定字段。它们只是 adapter 映射后的 artifact 内容。

## Minimal integration spike

建议用 2～3 天做一个独立 spike。

### 1. 启动真实 runtime

- 固定 LangGraph、CLI、SDK 精确版本和 hashes；
- `langgraph dev --no-reload --no-browser`；
- tracing/analytics disabled；
- graph application 与 Agent-Box 代码目录分离。

### 2. 定义一个真实外部 workflow

只需包含：

- context derivation；
- `interrupt()` 等待 Execution result/Host input；
- result ingestion；
- routing/recommendation。

这是外部 workflow application，不进入 Core。

### 3. 生成 native identity

- 通过 Agent Server 创建 Thread；
- 提交 Run；
- 运行到 interrupt；
- 取得 Thread ID、Run ID、Checkpoint ID。

### 4. Adapter snapshot

- `get_state`；
- 映射 responsibility/phase/round/upstream/expected outputs/roles；
- canonical JSON；
- SHA-256；
- 生成三个分离的 refs；
- 创建 Binding。

### 5. 真实 Harness projection

- 启动一个 Claude Code Execution；
- CLI 启动时直接看到 workflow context；
- 展示 Binding 中 LangGraph Thread 和 Checkpoint。

### 6. Host update

- Execution finish；
- Host 选择方向；
- Adapter 基于 frozen checkpoint 调用 `update_state` 或提交新 LangGraph Run；
- 验证产生新 checkpoint。

### 7. 新 Core Execution

证明：

```text
E1 → Thread T / Checkpoint C1
E2 → Thread T / Checkpoint C2
```

而不是 reopen E1。

### 8. 必测异常

- server restart 后 Thread/Checkpoint 是否仍可查询；
- Binding freeze 期间 workflow 并发更新；
- update base checkpoint conflict；
- graph code 改变后的 definition mismatch；
- deleted/missing thread；
- state schema 不兼容；
- snapshot 中包含 secret 或超大 payload；
- interrupted subgraph state。

Spike 的通过条件：

- ID 全部来自 LangGraph；
- checkpoint 可独立查询；
- context 不是 Agent-Box 手工生成；
- restart 后仍可恢复；
- 两次 Execution 绑定同一 Thread 的不同 checkpoint；
- Core 中没有 graph/node/routing state。

## Final verdict

选择：

> **B. 使用一个真实轻量 workflow 产品更好。**

首选：

> **LangGraph local Agent Server**

Fallback：

> **DBOS + SQLite**

Stack A 更新为：

```text
Claude Code
Codex App Server
TeamInteractive Provider
Git worktree
bwrap
ACP/acpx + Collaboration Gateway
LangGraph local Agent Server
LangGraphWorkflowResourceAdapter
GitHub Actions
```

这里 LangGraph 不是 Agent-Box 的 workflow engine，也不是新的 Core dependency。

它是一个真实外部 authority domain：

> LangGraph owns workflow identity, state, checkpoint and routing.
>
> Agent-Box binds thread identity, exact checkpoint and immutable context evidence into an Execution.
