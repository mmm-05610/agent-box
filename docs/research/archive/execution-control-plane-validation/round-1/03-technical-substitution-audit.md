# Executive technical findings

本报告审计日期为 **2026-08-27**。结论基于当日可访问的官方文档、官方 API/SDK、官方 GitHub 源码，以及当前工作目录中的实际代码；不把产品宣传、二手比较或 Agent-Box 设计稿当作实现证据。

1. **Execution 的技术空缺是“跨执行域身份”，不是“业界没有执行 ID”。** LangGraph Run、Temporal Workflow/Activity、Prefect FlowRun/TaskRun、GitHub WorkflowRun/Job、Kubernetes Job/Pod、Codex Thread/Turn 都已有成熟身份和生命周期。但这些身份分别由各自系统拥有，粒度也不同：一个逻辑责任窗口可能跨多个 retry attempt、Pod、Turn 或 Workflow Run；同一 Harness Session 也可能承载多个责任窗口。因此，只有在 Agent-Box 需要统一关联多个执行域、把 Work 的责任边界与 native identity 分离时，额外 Execution identity 才有不可替代性。
2. **不可变输入的底层零件已经商品化，统一 Binding 尚未商品化。** Git commit/tree、OCI image digest、GitHub `GITHUB_SHA`/`GITHUB_WORKFLOW_SHA`、Kubernetes immutable Secret/ConfigMap、Temporal Event History、LangGraph checkpoint、SLSA `resolvedDependencies`、artifact SHA-256 都是成熟能力。缺口不是再发明 digest，而是把 requested selector 的解析结果、资源 authority、contract/version、运行时 read-back 和实际使用事实绑定到同一个跨 Provider Execution。
3. **Dispatch 在各自 substrate 内已经成熟。** Temporal、LangGraph Agent Server、Prefect、GitHub Actions 和 Kubernetes 都能区分 API 接受、排队/调度、worker/runner/kubelet 开始以及终态；其中 Temporal、Prefect、LangGraph Agent Server 的 durable queue/recovery 明显强于当前 Agent-Box。Agent-Box 仍可能需要统一 dispatch receipt 和责任归属，但不能声称“现有系统没有接单、幂等或恢复”。
4. **Kubernetes `spec/status`、workflow history、CI metadata、OTel telemetry 和 provenance 都只与 Binding/Evidence reconciliation 部分相似。** 前者各自在自己的 authority 内很强，但不自动比较“冻结的跨资源意图”与“Harness 实际看到/使用的资源”，也不自动给出完整 coverage 或 negative claim。
5. **证据不能用单一强弱序列概括。** digest 证明内容一致性，不证明谁使用过；签名证明某个身份作过声明，不保证声明真实；外部 authority read-back 证明某时刻的外部状态，不证明历史过程；provider self-report 和 process observation 各有盲区；“已投影”不能升级成“已消费”。对 prompt/context/MCP/credential，模型是否真正“使用”通常仍不可验证。
6. **当前仓库只闭合了一个可运行但有限的 Preview spine。** 当前 working tree 已实现 Work、Execution identity、`(contract_id, Ref)` 输入冻结、同步 Dispatch、部分 native correlation、provider projection、Git/file/profile/tmux 的 read-back 以及 Codex App Server/tmux 证据 artifact；相关 135 个测试通过。但 first-class Binding revision/slot/validation、通用 dispatch crash reconciliation、取消、evidence coverage、signed provenance 和 Evidence reconciliation 仍未实现。
7. **最真实的单系统边界**是：以同一责任身份跨接 Coding Harness、workflow、CI、Pod 和人工 finish，并对每个冻结资源保存“authority + pin + disposition + coverage + evidence source”的可验证对账。没有被单一被审计产品完整拥有；但它可以由多个成熟系统组合实现，所以这是一项集成与信任边界创新，而不是底层调度、追踪或密码学创新。

# Method and source policy

## 范围与时间点

- 外部事实仅使用官方文档、官方 API/SDK reference、官方 GitHub repository/source 和必要的官方发布说明。
- OpenAI/Codex 部分按官方 Codex 文档核验；MCP 使用当前 **2026-07-28** specification，而不是仍常见的 2025 lifecycle 语义。当前 MCP core 已取消 protocol-level session；长任务是可选 Tasks extension。
- SLSA 使用当前 **v1.2**；Kubernetes 使用官网当前版本文档；GitHub REST 文档使用当日当前 API 页面。
- “原生”只表示产品直接提供并定义语义；“可自建”表示能借助扩展字段、用户代码、adapter 或额外数据库实现，不能写成产品原生能力。
- 仓库审计对象是当前 filesystem working tree，而不是仅审计 Git `HEAD`。基准 `HEAD` 为 `e340f3b89d85c13d63fe8fc962cb2126177000c2`，但 `work_core` 有未提交修改，Codex/tmux/Pi/WorkBoard plugins 主要为 untracked；因此下文的 IMPLEMENTED 仅表示“当前工作树中存在且可测试”，不表示已提交、已发布或已部署。
- 未读取本目录中其他 round-1 Agent 的报告。

## 判定规则

| 标记 | 本报告中的含义 |
|---|---|
| Native | 产品公开数据模型/API 直接拥有该能力，并定义其 lifecycle/identity。 |
| Conditional | 产品提供必要原语，但精确保证依赖用户配置、pin、特定部署模式或额外官方组件。 |
| Custom | 可以通过应用代码、adapter、扩展字段或外部存储实现，不能归功于原生产品。 |
| None | 在审计资料中未发现该产品承担此能力。 |
| IMPLEMENTED | 当前工作树有执行路径、持久化/行为和测试，不依赖设计稿成立。 |
| PARTIAL | 有真实代码，但覆盖、恢复、authority 或语义仍缺关键一段。 |
| DOCUMENTED ONLY | 设计/ADR/验证文档描述了目标，但当前执行路径没有对应实现。 |
| ABSENT | 当前代码和持久化模型均没有该能力。 |

## 审计问题的严格解释

- **exact revision**：必须是不可随名称移动的 commit/tree/digest/UID/version，而不是 branch、tag、image tag、assistant active version 或 deployment name。
- **accepted Dispatch**：Provider 或 durable control plane 已经返回一个可关联的接单事实；“放入队列”“创建 API 对象”“Pod Pending”不等于 worker/runner/process 已开始负责。
- **read-back**：从拥有该资源真相的 authority 或实际 materialization 重新读取，不是把请求参数原样抄入日志。
- **consumed**：消费者对指定资源有可归属的读取/调用事实。把文本写到 stdin、JSON-RPC request、文件、环境变量或 pane 只算 projected/visible。
- **negative claim**：例如“没有使用任何额外 MCP tool”。只有观测面定义完整且 coverage 可证明时才成立；缺日志通常只能是 unknown。

# Native identity matrix

| 产品 | 真实 native identities | 持久性与 retry/resume | exact revision 表达 | 关联基数 | 是否仍需要 Agent-Box Execution |
|---|---|---|---|---|---|
| LangGraph OSS / Agent Server | OSS：`thread_id`、`checkpoint_id`/namespace、task id；runtime 还可见 run/node attempt。Agent Server：assistant、thread、run、checkpoint/cron。 | 有 checkpointer 才有 durable thread/checkpoint；Agent Server 把 assistants/threads/runs/checkpoints 持久化。worker 中断可从 checkpoint 恢复；同一 thread 可有多个 run。 | assistant configuration 有 version history；deployment revision 管 code。但 run 通常引用 graph/default assistant 或 assistant ID，不能从这些 overview 证明每次 run 同时冻结了 assistant active version、部署源码和全部外部依赖。 | Thread 1:N Run；Run 1:N node/task/checkpoint；一个 node 可有多次 attempt。 | 单一 LangGraph 产品且“一次 run=一个责任窗口”时可复用 Run；跨 direct Harness/CI/K8s 或跨多个 run 时仍需要。见 [Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)、[Runs](https://docs.langchain.com/langsmith/runs)、[Agent Server](https://docs.langchain.com/langsmith/agent-server)、[Assistants](https://docs.langchain.com/langsmith/assistants)。 |
| Temporal | Namespace + Workflow ID + Run ID；Activity ID；Activity Task token/attempt；Workflow Task。 | Workflow ID 是业务逻辑 ID；Retry、Continue-As-New、Cron、Reset 产生新 Run ID。`first_execution_run_id` 可作为 chain anchor。Activity Execution 可包含多个 Activity Task attempts，task token 每次变化。 | Worker Deployment Version = deployment name + Build ID；Pinned workflow 可锁到一个 Deployment Version。但 Build ID 不是天然的 source commit/digest。 | Workflow ID chain 1:N Run；Run 1:N Activity Execution；Activity Execution 1:N Activity Task attempt。 | 若责任就是一个 Temporal Workflow chain，可用 Workflow ID + chain/run；若要跨 Activity、Harness Session、CI 或人工 finish，仍需要。见 [Workflow/Run ID](https://docs.temporal.io/workflow-execution/workflowid-runid)、[Activity Execution](https://docs.temporal.io/activity-execution)、[Worker Versioning](https://docs.temporal.io/worker-versioning)。 |
| Prefect | Flow、Deployment、FlowRun、TaskRun、work pool/queue/worker、state/run count。 | 手工 retry 保持同一 FlowRun ID 和 parameters，`run_count` 增加；TaskRun 以 flow_run_id + task_key + dynamic_key 去重/关联。暂停/挂起后可 resume。 | Deployment config 有 version history；Prefect 可记录 branch/commit metadata，但官方明确该 metadata **不影响 deployment execution**。pull step/image 是否真锁定该 revision 取决于用户配置。 | Deployment 1:N FlowRun；FlowRun 1:N TaskRun；retry 是同一 run 的新 run_count。 | 单一 Prefect flow 可复用 FlowRun；跨多个 flow/task 或 coding session 时仍需要。见 [Deployment versioning](https://docs.prefect.io/v3/how-to-guides/deployments/versioning)、[FlowRun retry](https://docs.prefect.io/v3/how-to-guides/workflows/retry-flow-runs)、[TaskRun API](https://docs.prefect.io/v3/api-ref/rest-api/server/task-runs/create-task-run)。 |
| GitHub Actions | Workflow ID、WorkflowRun ID、run number、run attempt、Job ID/check run、step number、artifact ID。 | `GITHUB_RUN_ID` rerun 时不变，`GITHUB_RUN_ATTEMPT` 增加；rerun 会重新产生 job executions。run/job/artifact 按 retention 持久。 | `GITHUB_SHA` 是触发 commit；`GITHUB_WORKFLOW_SHA` 是 workflow file commit；REST run 包含 `head_sha` 和 reusable workflow resolved SHA。Action 只有完整 commit SHA 才不可移动，tag/branch 可漂移。 | Workflow 1:N Run；Run 1:N Job（matrix 可扩展）；Run 1:N Attempt；Job 1:N Step/Check。 | 对纯 CI responsibility，WorkflowRun + attempt 通常足够；跨 CI、Harness 和 workspace 时需要。见 [Variables](https://docs.github.com/en/actions/reference/workflows-and-actions/variables)、[Workflow runs API](https://docs.github.com/en/rest/actions/workflow-runs)、[Workflow jobs API](https://docs.github.com/en/rest/actions/workflow-jobs)。 |
| Kubernetes | API object `{cluster, namespace, kind, name, UID}`；Job UID；Pod UID；container/restart count；ownerReference。 | UID 在 cluster 生命周期内区分同名历史对象。Job retry 可创建多个新 Pod UID；Pod 不会被“重新调度”，替换 Pod 即新 UID。Job suspend 会终止 active Pods，resume 再建 Pods。 | `resourceVersion` 是并发/存储版本，不是代码 revision；`generation` 是 spec generation；容器 exact revision 应用 OCI digest；Pod/Job UID 精确定位对象实例。 | Job 1:N Pod；Pod 1:N container restart；ownerReference 原生关联。 | 若责任严格等于一个 Kubernetes Job，可用 Job UID；跨 Job/Pod、外部 workflow、Harness 或人工边界时需要。见 [Object IDs](https://kubernetes.io/docs/concepts/overview/working-with-objects/names/)、[Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/)、[Pod lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)。 |
| Codex App Server | Thread ID、root `sessionId`、Turn ID、Item ID；forked thread 有新 Thread ID、保留 root sessionId 并记录 fork origin。 | 非 ephemeral thread 默认持久；`thread/resume` 继续同一 thread；新 `turn/start` 追加 Turn；fork 产生新 thread。Turn 可 interrupt，active Turn 可 steer 而不新建 Turn。 | Thread/Turn input 和 rollout 可读回，但 CLI/App Server binary revision、profile/config/MCP server/tool revision并不由 Thread ID 自动表达；per-turn cwd/model/sandbox 可覆盖。 | Session 1:N Thread fork；Thread 1:N Turn；Turn 1:N Item。 | **通常需要。** Thread 对责任窗口往往过宽，Turn 对多轮交互又过窄；同一 Thread 可被多个 Agent-Box Execution continuation 使用。见 [Codex App Server](https://developers.openai.com/codex/app-server)。 |
| MCP 2026-07-28（补充） | Core 无 protocol-level session；JSON-RPC request id 仅关联一次请求。状态型工具自行返回 handle；可选 Tasks extension 有 `taskId`。 | 当前协议为 stateless request。handle 的 durability/expiry 由 server 定义。Tasks extension 要求返回前 durable create，之后 `tasks/get/update/cancel`。 | tool schema/name、server info 和 list cache 不是 code digest；工具列表可变化，annotations 必须视为 untrusted，除非 server 可信。 | 一个 host 可接多个 server；一个 tool call 可关联 task；显式 handle 可跨多次 call。 | MCP Task 只能替代单个 tool/background task identity，不能替代跨 Harness/workflow 的责任身份。见 [2026 Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)、[2026 release](https://blog.modelcontextprotocol.io/posts/2026-07-28/)、[Tasks extension](https://tasks.extensions.modelcontextprotocol.io/specification/draft/tasks)。 |
| OpenTelemetry | Trace ID、Span ID、parent、Span Link；LogRecord 可带 TraceId/SpanId；Resource/InstrumentationScope。 | OTel API 不承诺 backend retention。Span 结束后是 telemetry record；sampling/export failure 可导致缺失。retry/continuation 由应用自行建 span/link。 | 任意 revision 可作为 attribute/resource semantic convention，但不是 execution pin。 | Trace tree 1:N span；Span Link 支持跨 trace 的多对多因果关联。 | OTel 适合作 correlation plane，不是 authoritative execution identity/control plane。见 [Traces](https://opentelemetry.io/docs/concepts/signals/traces/)、[Tracing API](https://opentelemetry.io/docs/specs/otel/trace/api/)、[Logs](https://opentelemetry.io/docs/concepts/signals/logs/)。 |
| in-toto / SLSA | in-toto Statement subject、predicate、Envelope/signature；classic layout/step/link；SLSA `builder.id` 和可选 `invocationId`。 | 作为 artifact/attestation 持久；没有 runtime retry/resume lifecycle。`invocationId` 的语义由 builder 定义且仅 SHOULD globally unique。 | subject/resource descriptor digest、`gitCommit`、builder version/dependencies；签名绑定 Statement。 | Statement 可有多个 subjects；一个 subject 可有多个 attestations；一个 link 可被多个 layout 验证。 | 它是证据/供应链身份，不是 dispatch 或交互执行身份；需要外部 runtime/Execution。见 [in-toto Attestation Framework](https://github.com/in-toto/attestation/blob/main/spec/README.md)、[SLSA Build Provenance](https://slsa.dev/spec/v1.2/build-provenance)。 |

**Identity 判断：** Agent-Box 不应以“更好的 Run ID”自我定位。它合理的技术角色只能是一个 **cross-domain responsibility identity**：在 provider start 前存在，允许 1:N native refs，也允许同一 native Session 被 N 个责任窗口引用，并把 Work closure 与 native terminal state 分开。

# Immutable input capability matrix

| 产品 | run/job spec | exact source/runtime revision | input snapshot/digest 与 config version | secret reference | resolve-time / run-time read-back | 防 mutable selector 漂移 |
|---|---|---|---|---|---|---|
| LangGraph | Native：run input/config/metadata；checkpoint 保存 graph state。 | Conditional：deployment revision、assistant version 各自存在；OSS graph code 和全部 tool/model dependency 需自建 pin。 | Native/Conditional：checkpoint、assistant config version；没有统一 run Binding digest。 | Conditional：deployment env/secrets，不是 run-level credential pin。 | Native 对 checkpoint/run；Custom 对 Git、MCP、workspace 等外部资源。 | Custom：运行前将 selector 解析为 digest/immutable URI 并保存。 |
| Temporal | Native：Workflow input/commands/results 进入 immutable Event History。 | Conditional：Worker Deployment Version/Build ID；必须自行把 Build ID 绑定到 image/source digest。 | Native history；Custom input digest/config schema/version。 | Custom：Activity/worker 从 secret manager 取 reference。 | Native history read-back；外部资源实际状态要由 Activity 查询并记录。 | Custom：Workflow/Activity 代码先 resolve 并把 exact value 写进 history。 |
| Prefect | Native：FlowRun parameters/state；deployment config。 | Conditional：可记录 VCS SHA，但官方说明 metadata 不影响执行；pull step/image 必须另行 pin。 | Native deployment version；Conditional result persistence/cache（results 默认不持久）。 | Conditional：可通过 deployment/infrastructure/secret integrations 注入，但不是统一 immutable credential binding。 | Native flow/task state；Custom workspace/secret/source read-back。 | Custom：固定 image digest/commit，避免每次 pull mutable branch。 |
| GitHub Actions | Native：触发 event、workflow run/job metadata。 | Native `GITHUB_SHA`、`GITHUB_WORKFLOW_SHA`；Conditional：所有 `uses:` 都应 full SHA pin。 | Native workflow/ref/SHA 与 dispatch inputs；artifact 有 SHA-256 digest；没有整个 runner input snapshot。 | Native symbolic `${{ secrets.NAME }}`，value 运行时解密；名称不锁定 secret value/version。 | Native run/job API；Custom 比较 runner actual `git rev-parse HEAD`、toolchain 与 secret version。 | Conditional：workflow/action/reusable workflow 用 full SHA；branch/tag/image tag 仍可漂移。官方确认 full SHA immutable：[Managing custom actions](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/manage-custom-actions)。 |
| Kubernetes | Native：API server 保存 admitted Job/Pod spec；Pod template 多数字段不可变。 | Conditional：image digest 原生；tag 可漂移；source commit 不属于 Kubernetes。 | Conditional：immutable ConfigMap/Secret；可在 annotation 写 digest；API 不自动生成整份 Binding digest。 | Native `secretKeyRef`/Secret volume/imagePullSecrets；Secret 默认可变，volume 更新最终一致，env value 不随更新刷新。 | Native API spec/status 和 container `imageID`；Custom 应用是否读取/使用配置。 | Conditional：image digest、immutable Secret/ConfigMap、UID；admission 后应 read-back 最终 spec。见 [Images](https://kubernetes.io/docs/concepts/containers/images/)、[Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)。 |
| Codex App Server | Native：thread/turn request、rollout/items；per-turn overrides。 | None/Custom：App Server 不把 executable/source/profile revision变成 thread identity。 | Partial：thread 可读回，dynamic tools/turn input 可持久；没有统一 context digest/config version。 | Custom：profile/环境/OAuth 管理；thread 不应复制 credential。 | Native `thread/read`/turn events；仍只能证明 server 接收/记录，不能证明模型消费。 | Custom：调用方冻结 prompt/profile/workspace/MCP definition，并在 turn 前后验证。 |
| MCP 2026 | Native：单次 call request；Tasks extension 的 task record。 | None：tool/server revision digest 不在 core identity。 | Tool schema 可缓存并变更；无统一 immutable invocation manifest。 | Native transport auth/OAuth 是请求凭据；应传 reference/token，不把 secret 放 tool metadata。 | `tools/list`/`tools/call` 是 provider read-back/self-report；外部 effect 要再读目标 authority。 | Custom：固定 server identity/schema digest/tool version并验证 effect。 |
| in-toto/SLSA | 不是 pre-run scheduler spec；是 retrospective signed BuildDefinition/Statement。 | Native digest/resource descriptor；SLSA 支持 `gitCommit`。 | Native `externalParameters`、`internalParameters`、`resolvedDependencies`、subject digest；L3 externalParameters 要完整，但 resolved dependency completeness 仍是 best effort。 | 通常不记录 secret value；credential policy/version要额外 predicate。 | Verifier 可对 artifact/digest/signature read-back；事实准确性仍依赖受信 builder。 | Conditional：attestation + admission/policy 能拒绝不匹配；attestation 本身不阻止运行时漂移。见 [SLSA Build Provenance](https://slsa.dev/spec/v1.2/build-provenance)。 |
| OTel | None：telemetry 不是 execution input authority。 | Attribute only。 | Attribute only；可被丢弃/采样。 | 不应放 secret；Baggage 无内建 integrity check。 | 只能观测已 instrument 的数据。 | None。见 [Baggage security](https://opentelemetry.io/docs/concepts/signals/baggage/)。 |

关键区别：

- **冻结 selector 的字符串不够。** `main`、`v1`、`latest`、assistant active version、Secret name 都可能移动；冻结的应是 authority 返回的 exact pin。
- **冻结 Ref association 也不等于冻结内容。** association digest 只能回答“选了哪些引用”；必须由资源 authority 把 Ref 解析成 commit/tree/content digest/UID/resourceVersion 等，并在 materialization 后 read-back。
- **Secret reference 优于 secret copy，但仍有版本语义。** Kubernetes Secret name 和 GitHub secret name 是引用，默认可指向更新后的 value；若执行要求可重现，需要 immutable Secret UID/version 或外部 secret version ID，同时避免在证据中泄露 value。
- **read-back 有时间边界。** resolve-time read-back 证明接单前状态；run-time read-back 证明投影/使用时状态；两者之间仍可能 TOCTOU。防漂移需要 conditional use（例如 object UID/resourceVersion、digest pull）或再次比较。

# Dispatch/accountability matrix

| 产品 | 接受/拒绝事实 | 幂等 | queue/schedule 与正式开始 | native correlation | cancel/recovery | interactive 与 background 差异 |
|---|---|---|---|---|---|---|
| LangGraph Agent Server | create run 先建立 `pending` durable run；worker lease 后执行。validation/multitask strategy 可 reject/interrupt/enqueue。 | 未发现公开 create-run 通用 idempotency key；可由调用方 metadata/数据库或应用 key 自建。queue attempt 的 exactly-once 领取不等于外部副作用幂等。 | API 创建 pending run ≠ worker 已取得 lease；官方 lifecycle 明确分两步。 | run ID + thread ID + assistant ID；checkpoint/task IDs。 | cancel run、checkpoint resume、durable queue；外部 API task 仍需业务幂等。 | thread/stream/HITL 能支持多轮，但 run 仍是一次 assistant invocation，不等于长期 coding process attach。 |
| Temporal | Start Workflow 被 Service 接受后有 Workflow/Run ID；WorkflowTask/ActivityTask 分别有 Scheduled、Started、terminal events。 | Workflow ID + conflict/reuse policy 可 Fail、Use Existing、Terminate Existing；Activity 外部副作用仍须 idempotent。 | Task Queue 持久保存 task；worker poll/Started 才是 worker 承担。Scheduled 不是 worker acceptance。 | Namespace + WorkflowID + RunID；ActivityID + attempt/task token；Event History。 | cancel、terminate、timeout、retry、reset、Continue-As-New、replay recovery；Activity cancel 通常需 heartbeat 才及时收到。 | Signals/Queries/Updates 提供交互，但没有本地 TUI/pane attach；长 idle workflow 与进程 idle 是不同模型。见 [Task Queues](https://docs.temporal.io/task-queue)、[Tasks](https://docs.temporal.io/tasks)、[Event History](https://docs.temporal.io/encyclopedia/event-history)。 |
| Prefect | FlowRun 可 Scheduled；worker 开始 provisioning 时 Pending，基础设施启动后 Running；Crashed 表示 infrastructure failure。 | deployment flow run API 有 `idempotency_key`；TaskRun identity key 可返回现存对象。 | work pool/queue 中 Scheduled ≠ worker provisioning ≠ flow Running。 | FlowRun/TaskRun ID、state history、worker/infrastructure PID（部署模式相关）。 | cancellation 是 request；worker 必须在线且能定位 infrastructure 才能执行；retry 同 run ID + run_count。 | pause/suspend/resume 和 typed user input 是 workflow interaction，不是持续 terminal attach。见 [States](https://docs.prefect.io/v3/concepts/states)、[Workers](https://docs.prefect.io/v3/concepts/workers)、[Cancellation](https://docs.prefect.io/v3/advanced/cancel-workflows)。 |
| GitHub Actions | 当前 workflow dispatch REST 成功返回 **200 + workflow run ID/URLs**；这证明 run 已创建，不证明 job 已分配 runner。 | API 未提供调用方 idempotency key；需外部 key/concurrency/业务输入去重。 | WorkflowRun queued；Job queued；runner assignment/start 后 job 有 runner_id/name 和 started_at。 | WorkflowRun ID + attempt；Job ID/check run；head/workflow SHA；artifact workflow_run link。 | cancel run、rerun workflow/jobs；runner 失联由平台状态处理。 | 没有原生 coding session attach；debug/approval/environment gate 不是长期责任窗口。见 [Workflow dispatch API](https://docs.github.com/en/rest/actions/workflows)、[Workflow jobs API](https://docs.github.com/en/rest/actions/workflow-jobs)。 |
| Kubernetes | API create admission 成功只表示对象已存储；同名 create 通常冲突。Pod `Pending` 明确包含等待调度和拉镜像。 | 无通用 idempotency token；确定性 name、create conflict、UID/resourceVersion precondition 可构建幂等。 | Job controller 创建 Pod；scheduler bind node；kubelet/container runtime start。每层责任不同。 | Job UID、Pod UID、ownerReference、nodeName、containerID/imageID。 | delete/cancel、Job suspend/resume、controller retry；Pod replacement 是新 UID，Job 保持。 | `kubectl exec/attach` 只能附着到已运行 Pod；并不赋予 Job 人工 finish 语义。 |
| Codex App Server | `thread/start` / `thread/resume` 和 `turn/start` JSON-RPC response 给出 IDs；后续 event 表明 in-progress/completed/interrupted/failed。 | 公共方法未定义 idempotency key；重复 `turn/start` 可能创建新 Turn，调用方必须去重。 | App Server response 是 Harness 接受；实际模型/工具执行通过 Turn/Item events 观察。没有外部 durable queue receipt。 | Thread/Turn/Item IDs；fork/root session correlation。 | turn interrupt；进程重启后可用 persisted thread resume。App Server 进程本身的管理/重连由 client 负责。 | 原生支持 steer、多 Turn 和 server requests，最接近 interactive；官方把 App Server定位为 rich client integration，批处理/CI 更适合 SDK。 |
| MCP 2026 | 普通 tool call 返回 complete/input_required；Tasks extension 只有 durable create 后才可返回 `taskId`。 | annotations 可声明 idempotent hint，但 client 必须把 annotations 当 untrusted；协议不提供通用 idempotency key。 | 普通 call 同步；Tasks extension 才有 background task/poll。 | JSON-RPC request ID、显式 state handle、可选 taskId；core 无 session。 | Tasks extension cancel/update/get；普通 tool 的恢复由 tool 自己定义。 | MRTR 支持中途输入；但它仍是 stateless request retry，不是 native coding thread。 |
| OTel | 不 dispatch。Span status 不能当接单 receipt。 | 不适用。 | telemetry 只能描述层次，不能承担 queue/worker ownership。 | Trace/Span/Link 适合传播 Agent-Box Execution ID。 | 不适用；export retry 不是 workload recovery。 | 同上。 |
| in-toto/SLSA | 不 dispatch；attestation 是执行后声明。 | 同一 subject 可有多份 attestation；去重/防 replay 由 verifier/policy/store。 | 不适用。 | builder ID、invocationId、subject digest、signature。 | 不恢复 workload；验证失败只影响 policy/admission。 | 不适用。 |

**Accountability 判断：** Agent-Box 需要把至少四个事实分开持久化：`dispatch requested`、control plane durable accepted、specific worker/provider started、native responsibility terminal。当前生态普遍已经这样分层；Agent-Box 的价值只能是跨 Provider 统一 receipt/correlation，而不是把“API 调用无异常”命名为 universal acceptance。

# Desired-versus-actual comparison

| 已有机制 | 它真正比较/记录什么 | 与 Binding/Evidence reconciliation 等价吗 | 缺失边界 |
|---|---|---|---|
| Kubernetes spec/status、Deployment desired/observed | API object 的 desired state 与 Kubernetes components 更新的 current state；controller持续收敛。 | **局部最接近，但不等价。** | spec 可更新；status 只覆盖集群对象；不认识 prompt、Git workspace dirty state、Harness Thread、MCP tool consumption 或人工责任完成。见 [Kubernetes objects](https://kubernetes.io/docs/concepts/overview/working-with-objects/)。 |
| Kubernetes Job/Pod owner/status | Job 统计 Pods/completions/failures，ownerReference 关联 UID；finalizer 保证 Pod 被计入 Job status 后再删除。 | 对 Job→Pod actual 很强；对跨系统 Binding 不等价。 | 一个成功 Pod 不证明外部资源、credential、prompt 与所声明 Binding 一致。 |
| Temporal Event History | Service 持久化 Workflow/Activity scheduling、started/results/commands/events，供 replay 和恢复。 | 是强 process history，不是 cross-resource reconciliation。 | history 中只包含 workflow 记录的 payload；未写入的 workspace/MCP/secret actual 不会自动出现，也无签名 provenance。 |
| LangGraph checkpoint/thread state | 每一步 state snapshot、next/tasks/checkpoint lineage；可 resume/time travel。 | 是 execution state snapshot，不是 evidence ledger。 | 外部 tool effect、输入资源 authority、完整消费 coverage 需应用自行记录；checkpoint 存在不证明 artifact/secret 被使用。 |
| Prefect state/run metadata | FlowRun/TaskRun state transitions、run_count、parameters/deployment metadata。 | 相似于 observation。 | code SHA metadata不决定实际 pull；results 默认不持久；用户输出文件不会自动被 Prefect 跟踪。见 [Results](https://docs.prefect.io/v3/advanced/results)、[Caching](https://docs.prefect.io/v3/concepts/caching/)。 |
| GitHub CI run metadata | workflow/head SHA、run attempt、jobs/runner、conclusion、logs、artifact ID/digest。 | 对 CI actual SHA 和 artifact lineage 很强。 | `uses:` mutable tag、runner 内 additional checkout、downloaded tools、secret version、外部 deployment effect仍需显式记录/read-back。 |
| OTel trace/log | instrumented operation 的时间、attributes、events、links；LogRecord 可关联 TraceId/SpanId。 | 只相似于 observation/correlation。 | 可采样、丢失、伪造或由进程自报；无默认签名、输入 completeness 或 negative coverage；无 SDK 时 API 可 no-op。 |
| in-toto layout/link、SLSA provenance | subject digest 与 signed predicate；classic in-toto layout 还能验证授权 functionary、materials/products 和步骤规则。 | 对 artifact provenance 可实现高强度 reconciliation；不等于 live execution control。 | 准确性仍依赖 attester/build platform trust；SLSA resolved dependency completeness 到 L3 仍 best effort；通常是事后 artifact-centered。见 [in-toto spec](https://github.com/in-toto/specification/blob/master/in-toto-spec.md)、[SLSA provenance](https://slsa.dev/spec/v1.2/provenance)。 |
| Codex Thread/Turn event stream | Harness 接收的 thread/turn/item、status、tool events。 | 对 native observation 很有价值。 | 不能独立证明 caller 冻结了什么，也不能证明模型注意/使用了所有上下文；client 进程日志仍是 provider-side evidence。 |

Agent-Box 所描述的 reconciliation 若要与上述能力形成真实差异，必须至少执行以下比较，而不能只展示状态：

1. frozen Binding slot 的 requested selector、resolved exact Ref、authority 与 contract version；
2. dispatch 时重新 read-back 的可用性/identity；
3. materialization 后的 actual resource identity；
4. Harness/provider 报告的 projected/consumed/produced disposition；
5. 每个 slot 和 undeclared inputs 的 coverage；
6. mismatch、unknown、unverifiable 不能被 execution success 覆盖；
7. evidence artifact 的 digest/signature/issuer/retention。

# Evidence strength matrix

## 证据不是单轴分数

以下等级描述“证据来源与完整性”，**不是完全有序的安全分数**。例如，签名的错误声明不比正确的 authority read-back 更真实；进程外观察也可能比 provider 自报更独立但语义更浅。

| 等级 | 名称 | 能证明 | 不能证明 |
|---|---|---|---|
| E0 | unknown / unverifiable | 目前没有足够观测。 | 任何正面或负面事实。 |
| E1 | declaration / configured | 用户或配置声明了 selector、Ref、tool、secret name、desired state。 | 资源存在、未漂移、被投影或被使用。 |
| E2 | projected / visible | bytes/reference 已放入文件、stdin、env、JSON-RPC request、pane 或 context assembly。 | 消费者读取、理解、调用或依赖了它。 |
| E3 | process observation | 独立 OS/tmux/container observer 看到了 PID、pane、exit、filesystem HEAD 等。 | 进程内部语义、模型 attention、外部 effect 的正确性。 |
| E4 | provider self-report | Harness/runtime 报告 session/turn/run/status/tool event。 | provider 没有遗漏或伪报；跨资源 authority 真相。 |
| E5 | external authority read-back | Git/Kubernetes/GitHub/secret manager/registry 等 authority 在某时刻返回了 actual identity/state。 | 历史期间始终如此、实际 consumer 使用过、返回内容未被错误解释。 |
| E6 | cryptographic digest-bound | read-back bytes/对象与 frozen digest 一致，或 artifact 与 digest 一致。 | 谁生成/使用了内容、业务正确性、时间和 authorization。 |
| E7 | signed attestation | 受信 signer 对 subject digest/predicate 作了可验证声明；tamper 和 signer identity 可检查。 | signer 的陈述一定真实、观测完整，或未声明的资源不存在。in-toto 的验证模型明确仍要求 recognized attesters 和 artifact digest match：[validation model](https://github.com/in-toto/attestation/blob/main/docs/validation.md)。 |

另设两个正交维度：

- **Disposition：** D0 unknown；D1 projected/visible；D2 provider-reported consumed/produced；D3 由目标 authority 的访问审计或隔离执行机制验证 consumed/effect。D2/D3 只能针对具体资源语义，不能用“Execution succeeded”批量推导。
- **Coverage：** C0 unknown/incomplete；C1 bounded-complete（观测面、时间窗、资源全集和失败模式已定义）。任何“没有使用 X”“没有 undeclared input”的 negative claim 必须至少 C1；日志中没出现只等于 E0/C0。

## 具体资源测试

| 资源 | 可获得的最强合理证据 | 正确结论 | 常见错误升级 |
|---|---|---|---|
| Git commit/tree | branch 在 authority resolve 为 commit；commit 指向 tree；read-back object existence；保存 commit/tree IDs。Git 是 content-addressable object store，commit 指向 top-level tree：[Git objects](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)。 | exact commit/tree 可到 E5/E6；branch 只 E1。 | commit/tree 一致不代表 materialized workspace 无修改。 |
| workspace actual HEAD | 在实际工作目录执行 `rev-parse HEAD^{commit}`，另读 `HEAD^{tree}`、tracked/untracked status 和 diff digest。 | HEAD match 是 E3/E5；加 clean/dirty/diff 才覆盖 working tree actual。 | 只比较 HEAD 就声称 workspace 内容完全等于 commit。 |
| tmux pane | 从 exact socket read-back server PID、session/window/pane IDs、pane PID/dead/exit；capture scrollback 后 hash。 | momentary identity/reachability 是 E3/E5；scrollback digest 只证明被捕获的有限文本 E6。 | pane name、PID 或最后 64 KiB scrollback证明完整 session、prompt consumption 或成功。 |
| Harness session | App Server `thread/start/read/resume` 和 Turn events；tmux Codex SessionStart hook。 | 官方 App Server response/read-back可到 E4/E5；hook 是 provider/process self-report E4。 | thread/session ID 单独证明特定 Binding 已被使用。 |
| prompt/context | prompt file digest + launch-time read-back；JSON-RPC `turn/start` request/event log；必要时 harness 回显/context manifest。 | file bytes 与 request body可到 E6/E2；“server accepted input”可 D2（仅按 API contract）。 | 将 projected 文本写成模型“已阅读/理解/采用”；模型 attention 通常 E0。 |
| MCP/plugin | 当前 `tools/list`/plugin registry read-back；tool call/result；最终 effect 从目标 authority再读回。当前 MCP tool list 可变化，tool annotations 对 client 是 untrusted。 | available 是 E5 的时点事实；call result 是 E4；effect read-back 才可能 E5/E6/D3。 | tool 被列出即已调用；call success 即外部 effect 一定成立；plugin version 字符串即代码 pin。 |
| credential reference | 保存 secret name + authority/UID/version（不保存 value）；目标系统 access/audit/token issuer receipt。 | reference 只 E1；投影到 env/volume 为 E2；访问审计或外部认证成功才可能 D3。 | secret name 证明使用了特定 value；把 secret hash 写入证据而泄露/支持离线猜测。 |
| CI actual SHA | GitHub WorkflowRun API 的 head/workflow SHA；runner actual checkout HEAD 再 read-back；比较二者。 | GitHub metadata E5；runner HEAD E3/E5；match 后才能声明 checkout 符合。 | `GITHUB_SHA` 自动证明脚本没有另行 checkout 或下载 mutable dependency。 |
| workflow checkpoint | LangGraph checkpoint ID/state read-back，或 Temporal Event History event IDs/payload。 | 是 runtime authority 的 durable state E5；若对 payload另做 digest可 E6。 | checkpoint存在即外部副作用 exactly once，或证明所有输入均被使用。 |
| artifact | authority artifact ID/URI + downloaded bytes digest；再加 DSSE/in-toto/SLSA signer verification。GitHub Actions artifact API原生返回 `sha256` digest和 workflow run/head SHA。 | digest 是 E6；可信 signer + verified subject 是 E7。 | URI/文件名当内容 identity；signed provenance 当作 builder 永不说错。见 [GitHub artifacts API](https://docs.github.com/en/rest/actions/artifacts)、[artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)。 |

# Execution mapping analysis

| 对象 | 最自然的责任粒度 | retry/resume/continuation 时 identity | 与 Agent-Box Execution 的基数 | 简化为该对象会丢失什么 |
|---|---|---|---|---|
| LangGraph Node | 一次 graph step/task，适合把一个外部 Harness call 包为 node。 | node retry 是同一逻辑 task 的 attempt；checkpoint resume 可重放/跳过已成功 task。 | 一个 Agent-Box Execution 可能由一个 node dispatch；一个 run 通常产生 N 个 Execution。也可能一个 Execution 跨多个 node/checkpoint。 | Work responsibility、跨 node continuation、native Session、非 LangGraph entry、显式 Human Finish。 |
| LangGraph Run | 一次 assistant invocation，thread 可持久。 | worker retry/checkpoint recovery通常保持 run；在同一 thread 发起后续 invocation会产生新 run。 | 简单请求可 1:1；多 agent/run、HITL continuation 或 direct Harness 混合时为 1:N/N:1。 | 同一责任跨 run 的 identity；run 中多个外部执行的独立 Binding/receipt。 |
| Temporal Workflow Execution | 一个 Workflow Run；Workflow ID chain 是更长的逻辑 execution。 | Workflow Task retry保持 Run；Workflow Retry/Continue-As-New/Reset 产生新 Run ID。 | Agent-Box responsibility 可映射整个 Workflow ID chain；也可由一个 workflow dispatch N 个 Agent-Box Executions。 | chain 与单 Run的选择、direct interactive session、Work closure和输入对账。 |
| Temporal Activity Execution | 一个 logical Activity，可有多个 Activity Task attempts。 | attempt/task token变化；Activity ID 在 Workflow Run 内定位逻辑 Activity。 | 若 Activity 正好是一次 Harness责任，可近似 1:1；一个 Agent-Box Execution 也可能由多个 Activities组成。 | Workflow-level intent、跨 Continue-As-New lineage、交互 idle/Human Finish。绝不能把 Activity Task attempt直接当责任 identity。 |
| Prefect FlowRun | 一次 flow invocation。 | retry保持 FlowRun ID，run_count增加；resume同 run state。 | batch型可 1:1；FlowRun内 N 个 TaskRun/Harness calls时 1:N。 | Task级责任和跨 flow/interactive continuation。 |
| Prefect TaskRun | 一次 task logical run。 | retry一般由同 TaskRun/run_count/state history表示。 | 一次外部 provider call可 1:1；mapped tasks产生 N 个 Execution。 | flow整体责任、共享 session、多步 human finish。 |
| GitHub WorkflowRun | 一次 workflow trigger，rerun保持 Run ID、attempt增加。 | rerun attempt变化；job executions重新产生。 | 纯 CI通常 1:1；matrix/jobs为一个 Execution对多个 native Job，或每 Job一个 Execution。 | coding session、CI前后人工/部署责任、跨 attempt 的资源对账粒度。 |
| GitHub Job | runner上一个 job/check run。 | rerun产生新的 job execution/ID，仍属于同 WorkflowRun/attempt。 | matrix中一对多；若每个 job 是独立责任也可1:1。 | workflow trigger、整体 conclusion、跨 job artifacts和 rerun continuity。 |
| Kubernetes Job | one-off logical task，controller拥有 completions/retries。 | Job UID保持；失败/重试/parallel产生新 Pod UIDs；suspend/resume重建 Pods。 | 最自然 1 Agent-Box Execution : 1 Job : N Pods。 | 非集群执行、Session/Turn、artifact/provenance、人类责任关闭。 |
| Kubernetes Pod | 一个具体调度/运行实例。 | container可在同 Pod重启；Pod失败替换是新 UID。 | 一个 Job责任通常对应多个 Pods；只有明确“单 Pod attempt”时1:1。 | logical retry、Job outcome、跨 Pod continuity。 |
| Harness Session / Codex Thread | 连续对话/原生记忆容器。 | resume保持 Thread；fork新 Thread但共享 root session；process restart后可恢复。 | 常见 **N Agent-Box Executions : 1 Session**（多个责任/continuation），也可一个 Execution跨多个 Turns。 | 每次责任、冻结输入、dispatch和人工 accept/finish；Session通常过宽。 |
| Harness Turn | 一次 user request + agent work。 | steer不新 Turn；后续 `turn/start` 新 ID；interrupt终止当前 Turn。 | 多轮责任为 1 Execution : N Turns；一次性请求才1:1。 | idle期间责任仍开放、多轮修正、同一 Binding下后续 Turn。 |
| Agent-Box Execution（目标语义） | 一次有界责任窗口：Provider、冻结输入、一个接单关系、可有多个 native refs，Work closure独立。 | provider retry可保持；native replacement/新 Binding原则上新 Execution；同 Session continuation可新 Execution绑定相同 Thread。 | 天然支持 1:N native objects 和 N:1 native Session。 | 若没有对账和 receipt，它会退化为额外 UUID/关联表。 |

## 特殊状态结论

- **Retry：** 不应自动创建新 Agent-Box Execution。若 retry 保持相同责任、Binding 和 provider logical execution（Prefect FlowRun run_count、Temporal Activity Execution、Kubernetes Job），同一 Execution 更自然；若换 Provider、重新 Binding 或责任改变，则新 Execution。
- **Resume：** 恢复同一 native logical identity、冻结输入仍有效时可保持；若 resume API产生新 native Run，Execution 应保存 lineage，而不是覆盖旧 Ref。
- **Continuation：** 同一 Codex Thread 的新工作目标不应仅因 thread相同而合并。Session continuity 与 responsibility identity 是正交关系。
- **Interactive idle：** Turn completed、TUI idle、pane仍活着都不是 Human Finish。它们只说明 provider状态；责任窗口是否关闭需要明确协议。
- **Human Finish：** 这是 Agent-Box/plugin policy，不是 LangGraph interrupt、Temporal workflow close、Prefect pause、GitHub approval或Pod exit的同义词。若 Human Finish 是核心差异，必须持久化 actor、时点、outcome、最后 observation与evidence coverage；当前 Core 尚未做到完整这一点。

# Deployment form trade-offs

以下只比较技术影响，不推导用户价值或产品路线。

| 维度 | A. 独立 service/control plane | B. workflow execution substrate | C. embedded library/SDK | D. dual-entry service（service API + local/interactive entry） |
|---|---|---|---|---|
| durability | 有独立 DB/queue/worker 时高；必须自行实现 HA、migration、outbox/reconcile。 | 通常最高；Temporal/LangGraph/Prefect 已有 durable state、retry/checkpoint。 | 默认低，取决于 host 进程和宿主持久化。 | control record可高；local entry 与 service 之间仍有断连/同步窗口。 |
| identity authority | 可权威拥有 Agent-Box Execution/Binding ID；native truth仍在外部系统。 | runtime权威拥有 Workflow/Run；Agent-Box identity要么映射、要么成为额外 domain record。 | identity由嵌入 host拥有，跨 host唯一性/retention需自行保证。 | 中央 service拥有 identity，local client拥有进程事实；双 authority必须明确。 |
| integration complexity | 每个 Harness/workflow/CI/resource authority都要adapter、auth和recovery。高。 | 要把责任建模成workflow/activity/node，并写interceptor/activity adapter。中高。 | 单个 Harness最简单；每个宿主重复集成。低到中。 | 最高：既要service adapters，又要local attach/recovery/离线同步协议。 |
| latency | 有网络与持久化 hop；可异步。 | 有schedule/checkpoint latency，短交互可能明显。 | 最低，本地函数/进程调用。 | local path低，central admission/ledger增加一次或多次往返。 |
| interactive attach | 需专门session gateway、PTY/tmux routing和authorization。 | workflow原生弱，通常靠external session/activity。 | 最强，直接持有PTY/process/stdio。 | 可以较强，但必须把central Execution与local handle可靠correlate。 |
| recovery | 可统一reconcile，但所有provider recovery都要实现。 | batch/workflow recovery成熟；长期本地TUI/stdio handle仍需定制。 | 进程重启后默认弱；除非native session可resume且宿主保存correlation。 | service state可恢复；local handle可能丢失，需要exact pane/session identity和reattach。 |
| multi-workflow compatibility | 高，前提是adapter contract保持provider-neutral。 | 对选定runtime最佳；其他runtime变成nested/external calls。 | 依赖每个host，难形成统一cross-workflow view。 | 高，但测试矩阵和协议版本负担最大。 |
| evidence collection | 可集中收集并分级，但必须保留issuer/authority，不可把集中存储误当独立证据。 | history/checkpoint天然强；外部resource actual仍需activity/adapters。 | 最接近进程、filesystem和prompt projection；集中完整性/retention较弱。 | 可同时采local process与central authority证据；也最容易出现重复、乱序和coverage歧义。 |
| deployment burden | 独立服务、DB、queue、secrets、HA、upgrade。高。 | 运行时本身已有明显部署/运维成本。中高到高。 | 最低，无独立control plane；升级跟随host。 | 最高，需要service和local agent/client双发布面。 |

# Agent-Box repository reality

## 可重复验证范围

- Core/Resource Contract 相关测试（`tests/test_work_core*.py tests/test_resource_contracts.py`）：`51 passed in 0.27s`。
- Codex/tmux/Pi/Preview Resources/WorkBoard plugin 测试：`84 passed in 7.12s`。
- 合计 **135 passed**。这证明当前代码路径在测试环境中可运行，不证明外部生产 provider、长期 crash recovery、HA 或证据真实性。

## 实现状态矩阵

| 能力 | 状态 | 当前真实实现 | 严格限制 |
|---|---|---|---|
| Work | **IMPLEMENTED** | 持久 `Work(id, objective, lifecycle)`；create/complete/reopen；closure与Execution outcome分离。见 [`models.py`](../../../../src/agent_box/work_core/models.py#L58)、[`services.py`](../../../../src/agent_box/work_core/services.py#L27)。 | lifecycle只有 open/completed/abandoned；没有证据门槛、review/acceptance aggregate。 |
| Execution identity | **IMPLEMENTED** | Provider启动前生成 `exec_*`，关联Work/provider/responsibility intent；持久projection/timestamps/provenance/version；可附NATIVE/INPUT/OUTPUT refs。见 [`models.py`](../../../../src/agent_box/work_core/models.py#L75)、[`repository.py`](../../../../src/agent_box/work_core/repository.py#L146)。 | 没有parent/retry/continuation/replacement lineage字段；`provenance`只是bounded string map。 |
| Ref | **IMPLEMENTED** | `SessionRef/WorkflowInstanceRef/RunRef/WorkspaceRef/ArtifactRef`，保存provider/native_id/URI/bounded metadata和relation。 | enum缺少credential/environment/job/pod/checkpoint等专门类型；没有独立Ref authority record、issuer或retention。见 [`models.py`](../../../../src/agent_box/work_core/models.py#L23)。 |
| requested selector → exact Ref resolution | **PARTIAL** | Git provider把selector解析为exact commit+tree；file prompt保存SHA-256；profile计算非secret配置manifest digest；tmux provider可冻结/回读pane identity。见 [`resources.py`](../../../../src/agent_box/work_core/providers/resources.py#L45)。 | 只覆盖本地Git/file/profile/tmux；无GitHub/K8s/secret manager/MCP registry等authority；profile明确排除credential，尚无CredentialRef。 |
| Binding / input association | **PARTIAL** | 第一次dispatch在同一SQLite事务保存canonical `(contract_id, Ref)` INPUT集合、创建dispatch并写 `inputs_digest`；之后INPUT不可增加。见 [`services.py`](../../../../src/agent_box/work_core/services.py#L85)、[`repository.py`](../../../../src/agent_box/work_core/repository.py#L287)。 | 没有Binding实体、revision、slot/purpose、validation/approval、authority snapshot、undeclared-input policy。`inputs_digest`是**Ref identity集合摘要**，不是资源内容摘要；内容保证完全由各ResourceProvider承担。 |
| Resource Contract/version | **IMPLEMENTED** | versioned `contract_id`、frozen dataclass、ExecutionProvider数量限制、resolve后runtime type检查；in-process registry原子注册extension bundle。见 [`registry.py`](../../../../src/agent_box/work_core/registry.py#L62)。 | registry只在进程内；无durable provider inventory、health/lease、auth policy、binary digest或capability attestation。 |
| Dispatch record | **PARTIAL** | SQLite `core_dispatches`每Execution唯一、idempotency key唯一，状态 requested/accepted/failed，保存inputs_digest和provider_correlation_ref；provider.start返回后才accepted。见 [`006_resource_contract_inputs.sql`](../../../../src/agent_box/migrations/006_resource_contract_inputs.sql#L20)。 | 是同步调用，不是durable worker claim；accepted含义由provider.start隐式决定；无started/worker identity/receipt schema/cancel。legacy `request_dispatch()` 明确不freeze/resolve，仍公开存在。 |
| Dispatch idempotency | **PARTIAL** | 同key+同Execution+同inputs_digest不重复调用provider.start；跨Execution或不同inputs会reject。 | **失败语义缺陷：** 已存在的 failed dispatch再次用同key调用时，代码只重新resolve并返回 `ExecutionStartRequest`，不会再次start、也不会重新抛出旧失败；调用方可能把无异常误认成功。见 [`services.py`](../../../../src/agent_box/work_core/services.py#L101)。 |
| generic Core dispatch crash reconciliation | **ABSENT** | 无runtime command/state；ADR只描述requested/accepted correlation和recovery目标。 | native start成功后、`record_dispatch_accepted()`前崩溃会留下requested且可能已创建外部执行；此时 correlation尚未持久，无法安全判断是否重发。App Server handle仅在进程内字典。 |
| tmux accepted-dispatch handle recovery | **PARTIAL** | tmux plugin可从已持久化的accepted dispatch与frozen inputs执行特定 `recover_handle()`。 | 仅覆盖已经accepted且有足够tmux identity的路径；不能弥合native start成功但accepted/correlation尚未入库的窗口。 |
| provider registry | **IMPLEMENTED**（仅in-process scope） | execution/resource providers、descriptor/version、capabilities、entry-point extension loader。 | 不能把它表述成control-plane provider registry；无实例责任、worker lease、health、durable availability和权限。 |
| native correlation | **PARTIAL** | dispatch可存一个`provider_correlation_ref`；observation可附多个Session/Run Ref。Codex App Server保存Thread和每个Turn；tmux保存pane/session并可追加Codex session。 | 一个单字符串receipt不足以表达多native对象/attempt lineage；App Server start后DB写前的crash会丢Thread ID。 |
| projection / observation | **PARTIAL** | provider-neutral `active/terminal/unknown`、outcome、`resumable_now`、`observed/stale/unreachable`；semantic不变时poll不写ledger。见 [`projection.py`](../../../../src/agent_box/work_core/projection.py#L32)、[`services.py`](../../../../src/agent_box/work_core/services.py#L292)。 | 无provider observation序列号、issuer、signed time、lease/fencing；新旧比较只看provider给的 `observed_at`。projection仍是provider self-report/host observation。 |
| resource state observation | **PARTIAL** | 对frozen INPUT Ref可写任意非空state和optional ArtifactRef；按Ref identity+state去重。见 [`repository.py`](../../../../src/agent_box/work_core/repository.py#L404)。 | state是自由字符串；没有 disposition taxonomy、authority、evidence level、coverage、comparison result。`ref_identity_digest`只压缩定位Ref，不是resource content proof。 |
| materialization/read-back | **PARTIAL** | Git detached worktree创建后read-back actual HEAD；prompt read-back content digest；profile重新算config digest；tmux exact pane检查。Git snapshot可给head/tree/diff_digest/dirty。 | read-back没有统一持久事实结构；dispatch后snapshot没有自动写入resource evidence；各provider覆盖和时间窗不同。 |
| Codex App Server native session | **IMPLEMENTED**（working-tree plugin） | 启动App Server stdio；`thread/start` / `thread/resume`、`turn/start`、steer、多Turn、explicit finish；observation附Thread/Turn Ref；finish hash JSONL event artifact。见 [`provider.py`](../../../../plugins/agent-box-codex/src/agent_box_codex/provider.py#L216)。 | plugin目录当前untracked；client handle不持久，Agent-Box restart后没有App Server recover path；event log是client/provider侧记录，不是signed external attestation。 |
| Codex tmux interactive attach/provider | **IMPLEMENTED** | exact tmux console/pane资源、attach、SessionStart hook、reachability/dead observation；`finish()`保存最多64 KiB scrollback与session event artifact。见 [`tmux_provider.py`](../../../../plugins/agent-box-codex/src/agent_box_codex/tmux_provider.py#L100)。 | partial scrollback不是完整transcript；pane失联只投影unknown；hook是self-report。 |
| Codex tmux explicit Human Finish | **PARTIAL** | Codex tmux provider只有显式`finish()`才把本地责任置terminal；这实现了provider-specific语义。 | 该decision只在plugin handle内，且没有actor、approval、最后observation/evidence coverage aggregate。 |
| cross-provider/core Human Finish aggregate | **ABSENT** | 无。 | Core没有统一decision event或跨provider语义。 |
| continuation | **PARTIAL** | Codex continuation contract冻结 `thread_id`；App Server可在一个Execution内追加Turns；tmux可从accepted dispatch+frozen inputs重建control。见 [`contract.py`](../../../../plugins/agent-box-codex/src/agent_box_codex/contract.py#L9)、[`tmux_provider.py`](../../../../plugins/agent-box-codex/src/agent_box_codex/tmux_provider.py#L254)。 | Core `resume_execution()`只有capability check和动态调用，不写resume event/attempt/lineage；当前Codex providers未声明Core `resume` capability。Continuation与same-Execution resume语义未统一。 |
| evidence artifact/digest | **PARTIAL** | prompt、Git diff、App Server event JSONL、tmux scrollback/session event均可SHA-256；ArtifactRef可作为output或resource-state locator。 | 无artifact store/retention/issuer、signature、trusted timestamp、attestation schema；hash由同一provider计算，通常仍是self-report。 |
| evidence provenance metadata | **PARTIAL** | `Execution.provenance` bounded map；resource state可附ArtifactRef；Codex observation返回 `projected_contracts`。 | provenance没有schema/issuer/signature/verification；`projected_contracts`未形成Core evidence record。 |
| evidence coverage | **ABSENT** | 无。 | 没有declared-versus-actual集合、slot coverage、完整性声明、negative-claim规则或coverage aggregate。 |
| first-class Binding validation | **DOCUMENTED ONLY** | 设计文档提出Binding/slot/validation/resource fact与stress cases。 | 当前schema没有Binding、Binding revision、BindingValidation或ExecutionResourceFact；设计说明不能算实现。 |
| Evidence reconciliation runtime | **ABSENT** | 无。 | 当前没有跨authority comparison、disposition、coverage或reconciler；完整闭环的最后一步尚不存在。 |
| cancellation / replacement | **ABSENT**（Core） | projection枚举可表达cancelled/abandoned outcome。 | Core没有cancel command、provider cancel调用、replacement/parent lineage、fencing。 |
| LangGraph/Temporal/Prefect/GitHub/Kubernetes adapters | **ABSENT** | 当前production/preview plugins是Codex、tmux、Pi、WorkBoard及本地resource providers。 | 文档/spike中的runtime选型不等于可注册ExecutionProvider/ResourceProvider实现。 |
| signed attestation / OTel export | **ABSENT** | 无。 | 没有DSSE/in-toto/SLSA生成/验证，也没有Execution trace context或OTel exporter集成。 |

## 当前真实闭环

当前代码可以诚实表述为：

```text
provider-specific selector
→ some exact Ref resolution (Git/file/profile/tmux)
→ frozen (contract_id, Ref) associations + association digest
→ synchronous provider.start
→ accepted OR failed dispatch row
→ optional one-string receipt + discovered native Refs
→ provider-specific materialization
→ provider/host observation + optional hashed artifacts
→ arbitrary resource-state records
→ [no generic Evidence reconciliation]
```

这比“只有设计”更成熟，但尚不等于题设完整链条。最显著的生产缺口不是 UI，而是 dispatch crash window、failed idempotency语义、provider handle durability、统一 actual fact schema和coverage/reconciliation。

# Genuine technical gaps

以下缺口在被审计的单一外部系统中没有完整替代；其中不少可通过组合而非自研底座补齐。

1. **跨执行域的责任身份。** 单个 ID 同时关联 Work、一个冻结输入集合、一个dispatch responsibility、N个native workflow/job/pod/session/turn refs、人工finish和证据。这是 Agent-Box Execution 最合理的独立边界。
2. **跨资源 authority 的冻结与二次回读。** 在一个Binding中同时包含 Git commit/tree、workspace materialization、profile config、prompt artifact、MCP/plugin definition、credential reference、CI SHA、Kubernetes UID/image digest，并在dispatch/materialization/finish各阶段按各自authority核验。
3. **统一但不抹平语义的 Dispatch receipt。** 既保留 provider-native queued/leased/started/terminal，又提供Agent-Box requested/accepted/rejected/reconcile状态；支持crash后通过外部idempotency/correlation安全恢复。
4. **Evidence reconciliation 的 slot-level disposition + coverage。** 把 intended、resolved、projected、provider-reported consumed、external actual、produced、mismatch、unknown分开，并允许Execution succeeded同时存在Binding divergent/unknown。
5. **interactive responsibility window。** Session/Thread太宽、Turn太窄；idle与finish不同。以明确Human Finish关闭责任，同时保留native session continuation，是workflow/CI/Pod对象普遍不拥有的边界。
6. **跨系统多对多 lineage。** 一个Execution跨多Turns/Pods/Activities；一个Session跨多个Executions；retry/resume/continuation/replacement不能被一个 `native_id` 字符串覆盖。
7. **可成立的 negative evidence。** 对“没有额外输入/工具/credential”“required input未消费”的结论，需要可声明的observation surface和coverage。OTel/log absence、partial scrollback或provider projected list都不足。

这些边界是否值得形成独立产品，技术调查不能回答；但它们确实不是简单把某个 LangGraph Run、Temporal Workflow、Kubernetes Job 或 Codex Thread换个名字。

# Capabilities already commoditized

以下能力已有成熟替代，Agent-Box 不应把它们单独当技术空白：

- durable workflow/run/task identities、状态历史、retry、resume、checkpoint、time travel；
- durable task queue、worker lease/poll、scheduling、cancellation和replay recovery；
- API desired/actual state、UID/ownerReference、controller reconciliation；
- exact Git commit/tree、full action SHA、workflow/head SHA、OCI image digest；
- immutable Secret/ConfigMap和secret reference injection；
- WorkflowRun/Job/Pod/Activity/Turn native metadata和artifact correlation；
- caller idempotency key（Prefect）或业务ID冲突策略（Temporal/Kubernetes deterministic name）；
- native coding Thread/Turn persistence、resume、fork、steer、interrupt；
- trace/span/log correlation与Span Links；
- artifact digest、DSSE/in-toto signed attestation、SLSA build provenance；
- post-run artifact verification与supply-chain policy。

一个成熟组合已经可以提供大部分零件：Temporal/LangGraph/Prefect负责durability和dispatch，Kubernetes负责process desired/actual，Codex App Server负责native interactive session，GitHub Actions负责CI SHA/jobs/artifacts，OTel负责correlation，in-toto/SLSA负责signed provenance。组合仍缺统一责任identity、resource semantics、trust policy和reconciliation，但不能把组合成本误写成底层能力不存在。

# Questions technology cannot answer

1. 用户是否真的需要在一个界面看到跨workflow/Harness/CI/Kubernetes的Execution，而不是继续使用各自native UI？
2. 一个Agent-Box Execution应按Turn、Session、workflow run、Activity、Job，还是“人工可验收责任窗口”切分？这是产品/治理决定。
3. Human Finish由执行者、reviewer、Work owner还是自动policy拥有？terminal、success、accepted和complete是否分离？
4. 哪些资源必须进入Binding，哪些是允许的undeclared ambient input？完整性要求会直接决定实现成本和隐私风险。
5. 对prompt/context，“consumed”应指server接收、进入model context、模型产生attention，还是输出可归因？后两者未必可证明。
6. provider self-report、local process observation、external authority和signed attestation之间，组织愿意信任谁？技术只能实现选定trust model。
7. 是否允许保存prompt、tool transcript、credential version、full workspace diff？retention、隐私、合规和成本不是identity模型能决定。
8. 独立service、workflow substrate、embedded SDK或dual-entry的部署负担是否可接受，需要用户价值、运维能力和商业约束研究。
9. 额外Execution/Binding/Evidence对象带来的解释和操作成本，是否低于跨系统关联收益？需要实测而非架构推理。

# First-round technical verdict

**已有成熟替代的声明：**

- Execution/run/job/session的native身份、durable workflow history、retry/resume/checkpoint、queue/worker dispatch、Kubernetes desired/actual、CI actual SHA、artifact digest、OTel correlation、in-toto/SLSA attestation都已有成熟方案。
- exact Ref解析使用的基本技术——Git/OCI digest、UID、immutable object、versioned config、secret reference——也已成熟。

**需要跨产品组合才能获得的能力：**

- `workflow durability + native coding session + exact source/workspace pin + CI/K8s actual + trace correlation + signed artifact provenance` 必须至少组合runtime/Harness/resource authorities/telemetry/attestation。
- 任一workflow产品都可以通过自建Activities/Nodes/Tasks收集这些事实，但那是集成实现，不是其原生统一Binding。

**未被单一外部系统拥有的真实技术边界：**

- Work之下、跨Provider的责任Execution identity；
- 同一Execution对多种资源authority的冻结、materialization read-back、native execution correlation和slot-level evidence reconciliation；
- Session continuity与责任窗口/Human Finish分离；
- 对undeclared/negative evidence有明确coverage，而不是从日志缺失推断。

**当前仍是未验证理想的声明：**

- Agent-Box尚未实现first-class Binding revision/validation/approval、通用accepted→started→terminal receipt、crash reconciliation、cancel/replacement、consumed evidence、coverage、signed provenance或自动Evidence reconciliation。
- 当前`projected_contracts`、resource-state自由字符串、hashed JSONL/scrollback只能支持有限的projected/observed证据；不能证明所有输入被消费，也不能证明没有额外输入。
- 当前App Server/tmux/plugins主要位于未提交working tree；测试通过不能替代production crash、external authority、long-running session和adversarial evidence验证。

**第一轮技术判定：** Agent-Box 的四个关键词中，Execution 的cross-domain boundary和Evidence reconciliation存在真实但窄的技术空缺；Binding的大多数底层原语、Dispatch的大多数runtime能力和Evidence的digest/trace/attestation能力已经商品化。产品若只实现“额外Execution ID + frozen Ref digest + provider status dashboard”，会被现有Run/Job/Session metadata替代；只有真正完成跨authority read-back、durable receipt/recovery、disposition/coverage和不可混淆的reconciliation，才跨过单纯集成层的技术门槛。

# Official sources

## LangGraph / LangSmith

- [LangGraph Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)
- [LangGraph Functional API](https://docs.langchain.com/oss/python/langgraph/functional-api)
- [Agent Server architecture and run lifecycle](https://docs.langchain.com/langsmith/agent-server)
- [Agent Server Runs](https://docs.langchain.com/langsmith/runs)
- [Assistants and versioning](https://docs.langchain.com/langsmith/assistants)
- [Scalability and resilience](https://docs.langchain.com/langsmith/scalability-and-resilience)
- [Official LangGraph runtime source](https://github.com/langchain-ai/langgraph/blob/main/libs/langgraph/langgraph/runtime.py)
- [Official Python SDK Runs source](https://github.com/langchain-ai/langgraph/blob/main/libs/sdk-py/langgraph_sdk/_async/runs.py)

## Temporal

- [Workflow ID and Run ID](https://docs.temporal.io/workflow-execution/workflowid-runid)
- [Activity Execution](https://docs.temporal.io/activity-execution)
- [Tasks](https://docs.temporal.io/tasks)
- [Task Queues](https://docs.temporal.io/task-queue)
- [Events and Event History](https://docs.temporal.io/workflow-execution/event)
- [Event History encyclopedia](https://docs.temporal.io/encyclopedia/event-history)
- [Worker Versioning](https://docs.temporal.io/worker-versioning)
- [Continue-As-New](https://docs.temporal.io/workflow-execution/continue-as-new)
- [Retry Policies](https://docs.temporal.io/encyclopedia/retry-policies)

## Prefect

- [Flow run creation / idempotency API](https://docs.prefect.io/v3/api-ref/python/prefect-deployments-flow_runs)
- [Manual FlowRun retry](https://docs.prefect.io/v3/how-to-guides/workflows/retry-flow-runs)
- [TaskRun REST API](https://docs.prefect.io/v3/api-ref/rest-api/server/task-runs/create-task-run)
- [States](https://docs.prefect.io/v3/concepts/states)
- [Workers](https://docs.prefect.io/v3/concepts/workers)
- [Deployments](https://docs.prefect.io/v3/concepts/deployments)
- [Deployment versioning](https://docs.prefect.io/v3/how-to-guides/deployments/versioning)
- [Cancellation](https://docs.prefect.io/v3/advanced/cancel-workflows)
- [Interactive workflows](https://docs.prefect.io/v3/advanced/interactive)
- [Results](https://docs.prefect.io/v3/advanced/results)
- [Caching](https://docs.prefect.io/v3/concepts/caching)

## GitHub Actions

- [Default variables and run/SHA identities](https://docs.github.com/en/actions/reference/workflows-and-actions/variables)
- [Workflow dispatch REST API](https://docs.github.com/en/rest/actions/workflows)
- [Workflow runs REST API](https://docs.github.com/en/rest/actions/workflow-runs)
- [Workflow jobs REST API](https://docs.github.com/en/rest/actions/workflow-jobs)
- [Artifacts REST API](https://docs.github.com/en/rest/actions/artifacts)
- [Managing action revisions](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/manage-custom-actions)
- [Using secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
- [Artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)

## Kubernetes

- [Objects, spec and status](https://kubernetes.io/docs/concepts/overview/working-with-objects/)
- [Object names and UIDs](https://kubernetes.io/docs/concepts/overview/working-with-objects/names/)
- [Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/)
- [Pod lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)
- [Container images and digest pinning](https://kubernetes.io/docs/concepts/containers/images/)
- [Secrets and immutable Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
- [Owners and dependents](https://kubernetes.io/docs/concepts/overview/working-with-objects/owners-dependents/)

## Codex / MCP

- [Codex App Server](https://developers.openai.com/codex/app-server)
- [MCP 2026-07-28 Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- [MCP 2026-07-28 official release notes](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- [MCP Tasks extension](https://tasks.extensions.modelcontextprotocol.io/specification/draft/tasks)

## OpenTelemetry

- [Traces](https://opentelemetry.io/docs/concepts/signals/traces/)
- [Tracing API and Span Links](https://opentelemetry.io/docs/specs/otel/trace/api/)
- [Logs](https://opentelemetry.io/docs/concepts/signals/logs/)
- [Baggage and integrity/security limitations](https://opentelemetry.io/docs/concepts/signals/baggage/)

## in-toto / SLSA / Git / tmux

- [in-toto Attestation Framework specification](https://github.com/in-toto/attestation/blob/main/spec/README.md)
- [in-toto Envelope / DSSE signature layer](https://github.com/in-toto/attestation/blob/main/spec/v1/envelope.md)
- [in-toto validation model](https://github.com/in-toto/attestation/blob/main/docs/validation.md)
- [Classic in-toto specification](https://github.com/in-toto/specification/blob/master/in-toto-spec.md)
- [SLSA v1.2 Provenance](https://slsa.dev/spec/v1.2/provenance)
- [SLSA v1.2 Build Provenance schema](https://slsa.dev/spec/v1.2/build-provenance)
- [Official Git book: Git objects](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)
- [Official Git revision parser reference](https://git-scm.com/docs/git-rev-parse)
- [Official tmux formats reference](https://github.com/tmux/tmux/wiki/Formats)
