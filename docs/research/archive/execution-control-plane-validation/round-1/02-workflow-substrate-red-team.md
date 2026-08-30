# Red-team verdict

**结论：B. Core 有价值，但应作为 library/plugin。**

**REASONED INFERENCE — 当前独立产品定位基本没有越过“governed node launcher + correlation/evidence index”这条线。** Agent-Box 已实现的硬价值是：为一次 Execution 生成独立 ID 和责任意图，事务性冻结 `(contract_id, Ref)`，计算输入摘要，以幂等键调用 Provider，再保存 Provider/native 引用和观察结果。这是一组好的执行边界不变量，但它们既不要求 Agent-Box 拥有 Work，也不要求拥有独立 UI，更不要求成为用户的首要工作入口。它们可以成为 LangGraph node wrapper、Temporal Activity、Prefect task、GitHub Action、Kubernetes controller/admission helper 或普通 launcher service 内的一层 SDK。

**REPOSITORY VERIFIED — 这不是把实现贬低为“只有脚本”。** 定向运行当前输入冻结、责任意图、资源观察和真实资源 Provider 测试，共 `16 passed`。Core 确实完成输入规范化、数量校验、ResourceProvider 解析与类型校验、原子创建 Dispatch/输入关系、稳定 `inputs_digest`、一 Execution 一 Dispatch、幂等键冲突检查以及 Provider correlation 持久化；见 [`services.py`](../../../../src/agent_box/work_core/services.py#L85)、[`repository.py`](../../../../src/agent_box/work_core/repository.py)、[`test_work_core_input_dispatch.py`](../../../../tests/test_work_core_input_dispatch.py) 与 [`test_work_core_real_resource_providers.py`](../../../../tests/test_work_core_real_resource_providers.py)。反方结论是“这些能力适合作为公共执行库”，不是“这些能力不存在”。

**REPOSITORY VERIFIED — 当前 Preview 自己已经把 Binding 收缩成可嵌入表示。** ADR-0006 明确规定，Preview 的 Binding 就是冻结的 `(contract_id, Ref)` associations 加 `Dispatch.inputs_digest`，不新增 Binding 实体、revision、slot 或 manifest；而且摘要只证明“哪组固定输入与本次 Dispatch 对应”，不证明外部内容或实际消费，见 [ADR-0006](../../../adr/0006-resource-contract-input-protocol.md#L293)。这正是一个 library data structure，而不是独立产品对象的自然证据。

**REPOSITORY VERIFIED — 更强的权威、单调 Observation 和 governed Binding 仍是候选设计，不是当前能力。** ADR-0005 标为 `Proposed`、实现状态为 `Pending`，并列出当前可发生 terminal → active、缺少 authority/provisional 区分、Projection/Refs/facts 非原子提交等问题，见 [ADR-0005](../../../adr/0005-execution-observation-and-projection-semantics.md#L1)；完整 Binding 文档的裁决也是 “MODEL IS PROMISING”，并明确尚未得到真实 Provider enforcement/consumption proof 的强验证，见 [候选模型](../../../architecture/EXECUTION_BINDING_GOVERNED_HANDOFF_MODEL.md)。不能用未来模型替当前独立产品定位作证。

本报告截至 **2026-08-27**。标签含义如下：

- **REPOSITORY VERIFIED**：由当前仓库代码、测试、迁移或仓库文档直接支持；
- **OFFICIAL DOCUMENTED**：由替代系统最新官方文档支持；
- **REASONED INFERENCE**：从已验证事实推导出的红队判断；
- **UNVERIFIED PRODUCT HYPOTHESIS**：需要用户、生产或市场数据验证，不能当作既成事实。

# The strongest subordinate-launcher thesis

最强反方不是“Agent-Box 被 workflow 调用，所以它是下级”。数据库、Kubernetes 和云控制面也常被上游调用。真正的反方链条是：

1. **REPOSITORY VERIFIED — 资源选择权在 Host/UI。** ADR-0006 的精确序列从 “Host/UI 选择已有 Ref 和 `contract_id`”开始；Core 不决定为何选择这些资源，也不决定下一步运行什么。
2. **REPOSITORY VERIFIED — 外部资源真相在 ResourceProvider。** Core 调用 `resolve` 并做类型检查；Git、artifact、profile 的精确 pin/内容校验由对应 Provider 完成。Core 不拥有 Git object、artifact bytes、session、terminal 或 credential。
3. **REPOSITORY VERIFIED — 原生执行真相在 ExecutionProvider。** `dispatch_execution()` 调用 `provider.start()`；当前 `accepted` 本质上表示该调用正常返回并保存了一个字符串 correlation，不等价于外部系统已建立可恢复、不可否认的原生执行。
4. **REPOSITORY VERIFIED — 观察真相仍由同一个 Provider adapter 声明。** WorkBoard 把 adapter 返回的每个 `projected_contract` 写成 `provider-reported:projected`，并硬编码 `coverage="coverage unavailable"`，见 [`app.py`](../../../../plugins/agent-box-workboard/src/agent_box_workboard/app.py#L1202) 与 [`model.py`](../../../../plugins/agent-box-workboard/src/agent_box_workboard/model.py#L225)。
5. **REASONED INFERENCE — Agent-Box 因而主要拥有一个关系。** 它最可靠地知道 “Host 要求把这些 Ref 交给这个 Provider，并且 Provider 返回了这些 native IDs/claims”；它通常不知道 Provider 内部实际读取、使用、忽略或额外访问了什么。

把这一链条压缩后，当前产品实际是：

```text
upstream chooses intent/resources
  -> Agent-Box freezes an input envelope
  -> provider adapter resolves and launches
  -> native system owns execution/history/artifacts
  -> adapter reports IDs/status/claims
  -> Agent-Box indexes and renders them
```

**REASONED INFERENCE — “责任提交”目前是一个有纪律的 API 边界，不是独占的控制权。** 若凭据、admission、scheduler、native lifecycle 和 completion 都不由 Agent-Box 控制，调用方可绕开它直接启动同一 Harness/CI/Job。一个可以无损绕开的“control plane”更准确地说是 conventions library 或 middleware；只有当它成为非旁路的 admission/credential authority，或者其 Work/Execution 身份成为组织流程的完成权威时，才具备独立控制面的必要性。

**REASONED INFERENCE — 新 UUID 和一份 SQLite ledger 不会自动创造产品级 authority。** 任何 launcher 都能添加 `work_id`、`execution_id`、`inputs_digest`、`provider_native_id` 和事件表。真正需要证明的是：删除 Agent-Box 后，哪个业务决策、哪项不可重建的事实或哪个用户工作流会消失，而不只是哪些关联查询变麻烦。当前最强答案仍是“跨系统统一查看与少量冻结不变量”，这支持共享组件，不足以证明独立产品。

# Substitute implementations

下表先给出结论。这里的“少量扩展”不是声称零工程量，而是判断缺口是否要求一个独立产品边界。

| 替代组合 | Work 替身 | Execution/Dispatch 替身 | Binding/Evidence 放置点 | 最小增量 | 红队判定 |
|---|---|---|---|---|---|
| LangGraph | Thread 或外部 issue ID | node/task invocation | checkpointed state + Store + trace/artifact URI | 一个 governed node wrapper 和约 6–10 个结构化字段 | 可替代大部分 Preview |
| Temporal | Workflow ID/Run chain | Activity 或 Child Workflow | Activity input/result + Event History + Memo/Search Attributes | 一个 Activity wrapper、payload schema、外部大对象存储 | 最强通用替代 |
| Prefect | Flow Run/Deployment/外部 project tag | Task Run/Flow Run | parameters、job variables、result、artifact、asset/event | task decorator/block/worker adapter | 可替代大部分 Preview |
| GitHub Actions | Issue/Project | workflow run/job/run attempt | workflow inputs/context、environment、artifact/attestation | reusable workflow/action + GitHub App（可选） | 对 Git/CI 场景更强 |
| Kubernetes | 外部 issue/label/CRD | Job UID/Pod UID | admitted spec、status、logs、provenance | CRD/controller 或 annotation + admission policy | 对容器执行更强 |
| 普通 DB + launcher | 外部 work ref/tag | `execution_attempt` + `dispatch_receipt` | input manifest/digest + typed claim rows | 4 张表和 provider adapter 接口 | 几乎是当前 Core 的本质 |
| Harness + Git + CI | session/issue/branch | native turn/session + CI run | session JSONL、commit/tree、run/job、artifact/attestation | 一份 manifest 或薄 glue service | 单/少 Harness 场景足够 |

## LangGraph + persistence + node state + artifact refs

**OFFICIAL DOCUMENTED — 可覆盖。** LangGraph persistence 在每个 step 保存 checkpoint，以 thread ID 组织状态，支持状态历史、replay/fork 和 pending writes；LangSmith Threads 持久化 run/state/metadata/status；Studio 可检查 thread 历史、prompt、tool arguments/returns、异常并编辑或从历史状态 fork。[LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence)、[Threads](https://docs.langchain.com/langsmith/use-threads)、[Studio](https://docs.langchain.com/langsmith/use-studio)。因此可在 node state/checkpoint 中保存：

- `external_work_ref` / `responsibility_intent`；
- 规范化 `binding_manifest` 与 `binding_digest`；
- Provider、idempotency key、native session/run IDs；
- output artifact URIs/digests；
- typed evidence claims 与 `unknown` coverage；
- human completion 或后续 node 的 decision。

**REASONED INFERENCE — 仍缺。** LangGraph checkpoint 证明 graph 保存了什么，不独立证明 Git/Harness/CI 实际消费了什么；跨多个 graph/runtime 的统一身份和证据查询也需要自建 Store/schema。ArtifactRef 只是应用状态中的 URI/digest，仍需外部 artifact authority。

**REASONED INFERENCE — 缺口不要求独立产品。** 一个 `governed_execution_node()` wrapper 可以在调用前 canonicalize/freeze，在调用后记录 native refs/claims；若要共享查询，再加一张 provenance table 或 LangSmith metadata。除非 Agent-Box 能在 graph 外非旁路地授权/拒绝资源与执行，否则它只是该 node wrapper 的独立部署版本。

## Temporal Workflow/Activity + Event History/Search Attributes

**OFFICIAL DOCUMENTED — 可覆盖。** Temporal 把 Workflow Execution 定义为可靠、持久的执行单元；Workflow ID、Run ID 和 Event History 形成可重放的生命周期。Event History 是 append-only 的持久事件序列，包含 Activity scheduled/started/completed/failed 等事件；Search Attributes 提供可索引的自定义元数据，Memo 提供非索引元数据；Activity 承载普通非确定性外部副作用并把结果写回 Workflow History。[Workflow Execution](https://docs.temporal.io/workflow-execution)、[Events and Event History](https://docs.temporal.io/workflow-execution/event)、[Search Attributes](https://docs.temporal.io/search-attribute)、[Activities](https://docs.temporal.io/activities)。

可直接映射：长期目标用 Workflow ID 或外部 issue ID；一次责任尝试用 Activity/Child Workflow Run；Binding 用不可变 Activity arguments 中的 manifest/digest；Dispatch 用 Activity scheduled/started 与 idempotency key；native correlation/output claims 用 Activity result 和外部 artifact URI；状态、retry、timeout、heartbeat/recovery 由 Temporal 原生拥有。

**REASONED INFERENCE — 仍缺。** Temporal History 证明 Temporal 安排了 Activity、Worker 报告了结果，不证明 Harness 是否真正使用 prompt/plugin/MCP，也不自动理解 Git/worktree/profile/credential 的 authority。大日志和 artifact bytes 也不应塞进 History。

**REASONED INFERENCE — 这仍然只需要 adapter。** 一个 `AgentExecutionActivityInput`、一个 result/claim schema、若干 Git/Harness resolvers 和外部 artifact store 即可。Agent-Box 的 Execution ID 可以退化成 Activity ID/Run ID 加业务 attempt ID；其 event ledger 会重复 Temporal 已拥有的最强生命周期历史。若目标场景已经运行 Temporal，单独部署 Agent-Box 很难证明增量价值。

## Prefect Flow/Task Run + result/artifact/infrastructure

**OFFICIAL DOCUMENTED — 可覆盖。** Prefect Flow/Task Run 自动跟踪状态；Server 数据库存储 flow/task run state/history、logs、deployments、result blocks、artifacts、work pools 和 events；Deployment 描述何时、何地、如何运行，Work Pool 用 base job template/job variables 把 orchestration 接到基础设施；results 可持久化到远端；Artifacts 有版本历史并关联 run；Assets 提供 URI、metadata 和 lineage。[Flows](https://docs.prefect.io/v3/concepts/flows)、[States](https://docs.prefect.io/v3/concepts/states)、[Server](https://docs.prefect.io/v3/concepts/server)、[Deployments](https://docs.prefect.io/v3/concepts/deployments)、[Work pools](https://docs.prefect.io/v3/concepts/work-pools)、[Results](https://docs.prefect.io/v3/advanced/results)、[Artifacts](https://docs.prefect.io/v3/concepts/artifacts)、[Assets](https://docs.prefect.io/v3/concepts/assets)。

**REASONED INFERENCE — 覆盖方式。** Flow Run 或外部 project/issue 是 Work；Task Run/子 Flow Run 是 Execution；parameters、pull steps、job variables、image digest 和 result storage refs 组成 frozen manifest；run state/infrastructure ID/log/artifact/asset materialization 组成 observed facts。一个 task decorator 可以在 run 前写 digest、在 run 后写 typed claim。

**REASONED INFERENCE — 仍缺但不独立。** Prefect 默认不提供 Agent-Box 式跨 Ref contract 类型协议，也不证明 application-level consumption；某些 results 默认不会持久化，需要显式配置。但这些是 schema、block、worker adapter 和 policy 的缺口，不是新的用户产品对象。Agent-Box 若不拥有调度、重试、Worker 或 infrastructure，只是在 Prefect task 前后加 envelope。

## GitHub Actions + environments/artifacts/attestations

**OFFICIAL DOCUMENTED — 对 Git/CI 场景的覆盖比 Agent-Box 更权威。** Workflow run/job API 原生给出 run ID、run attempt、job ID、head SHA、status/conclusion、timestamps、steps 和 runner；workflow context 暴露 `sha`、`workflow_sha`、`run_id`、`run_attempt`。Environments 提供 required reviewers、branch/tag rules、wait timer 和 custom GitHub App protection rules，且环境 secrets 在保护规则通过前不可用。[Workflow jobs API](https://docs.github.com/en/rest/actions/workflow-jobs)、[Contexts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts)、[Environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)。

**OFFICIAL DOCUMENTED — 原生强证据。** Actions artifact v4 使用不可变 artifact ID，上传返回 SHA-256 digest，下载时自动校验；artifact REST 表达 ID、digest、expiry 和所属 workflow run/head SHA。Artifact attestations 可把 artifact digest 作为 subject，生成签名的 build provenance，并由 GitHub CLI 验证。[Artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data)、[Artifact REST](https://docs.github.com/en/rest/actions/artifacts)、[Artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)。

**REASONED INFERENCE — 覆盖方式。** GitHub Issue/Project 是 Work；run/job/attempt 是 Execution；workflow inputs、exact checkout SHA、action SHA、container image digest、environment 和 secret names 是 Binding；environment approval 是 admission；run/job status、logs、artifacts 和 attestations 是 native Evidence。

**REASONED INFERENCE — 仍缺。** GitHub Actions 不擅长长时间交互式本地 Harness、tmux session continuity，不能证明 LLM 实际阅读了 prompt/MCP/plugin，也不是跨任意 CI/本地执行的统一索引。

**REASONED INFERENCE — 最小扩展足够。** 一个 reusable workflow/action 记录 `responsibility_intent`、manifest digest、external refs 和 claim coverage；需要跨系统时再用 GitHub App/数据库聚合。对于以 GitHub 为入口的团队，Agent-Box 把 run/job/artifact/attestation 再复制一份，既没有提高这些事实的真实性，也没有获得 completion authority。

## Kubernetes Job/Pod spec + admission/policy/status

**OFFICIAL DOCUMENTED — 可覆盖。** Kubernetes Job 创建 Pod 并追踪到完成，Job/Pod 有稳定 UID、spec、status 和 conditions；Pod 多数 spec 字段创建后不可变。Admission controllers 在持久化前 mutation/validation；ValidatingAdmissionPolicy 或 webhook 可拒绝、警告或审计不合规配置。[Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/)、[Pods](https://kubernetes.io/docs/concepts/workloads/pods/)、[Admission controllers](https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/)、[Policies](https://kubernetes.io/docs/concepts/policy/)。

**REASONED INFERENCE — 覆盖方式。** Work 用外部 issue/tag/owner reference 或一个极薄 CRD；Execution 用 Job UID/Pod UID；Binding 用最终 admitted Job template/Pod spec 的 canonical digest、image digest、ConfigMap/Secret/volume refs、service account 和 policy decision；Dispatch 是创建 Job；observed 是 status/condition/termination state/log/attestation。

**REASONED INFERENCE — 必须保留的限制。** 不能粗暴声称整个 Job spec 永远不可变；应固定“最终 admitted 的执行模板/实际 Pod spec”及其 UID/digest。Kubernetes desired/actual state只说明基础设施对象的状态，不证明容器内程序读取了某个 Secret、prompt 或 MCP，也不证明没有网络访问其他资源。

**REASONED INFERENCE — 缺口仍适合 controller/policy。** 一个 CRD/controller、annotations、admission policy 和可选 runtime sidecar/eBPF/attestation 可以增加 manifest、claim 和 enforcement。若 Agent-Box 不成为 admission endpoint、credential broker 或 Job controller，它只是生成 Job spec 并收集 status 的 launcher。

## 普通数据库表 + launcher service

**REPOSITORY VERIFIED — 这是最危险的替代，因为它不是类比，而是当前实现的最小重写。** 当前 Core 主要持久化 Work、Execution、Refs、Events、Dispatches；输入摘要是 canonical JSON 的 SHA-256；Provider 协议是 `descriptor/input_limits/start` 和 ResourceProvider `resolve`。一个普通服务只需：

```text
execution_attempt(id, external_work_ref, responsibility_intent, provider, status, timestamps)
execution_input(execution_id, contract_id, ref_json, ordinal, manifest_digest)
dispatch_receipt(execution_id UNIQUE, idempotency_key UNIQUE, native_id, state, error)
evidence_claim(execution_id, subject_ref, issuer, method, coverage, payload_ref, observed_at)
```

在一个事务内插入 `execution_input + dispatch_receipt(requested)`，然后调用 adapter；返回后写 native ID；观察时只接收 typed claim。Work 可以完全删除，仅保留 `external_work_ref`。

**REASONED INFERENCE — 仍缺。** 要补充 crash window/recovery、单调 terminal、签名 claim、retention、ACL 和多租户。这些是生产工程，不是 Agent-Box 独有产品语义。ADR-0002/0003/0005 本身也在处理相同的 launcher transaction/recovery 问题。

**REASONED INFERENCE — 独立产品否定力。** 如果四张表、一个库和 adapter 接口就能保存所有 Agent-Box 独占事实，而最终用户仍在 GitHub/LangGraph/Harness 工作，那么最自然的交付物就是 execution SDK 或 provenance middleware，而不是 WorkBoard。

## Harness session history + Git + CI

**OFFICIAL DOCUMENTED — Harness 已拥有相当多的 native history。** 以 Codex 为例，CLI 可按 session ID resume/fork；非交互模式可输出 JSONL event stream，事件包含 thread/turn、command execution、file change、MCP tool call、web search、errors 和 plan updates，并可在 CI 中运行或恢复 session。[Codex CLI](https://learn.chatgpt.com/docs/codex/cli)、[Developer commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli)、[Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)。Git 给出 commit/tree/diff；CI 给出 run/job/attempt、日志、artifact digest 和 attestation。

**REPOSITORY VERIFIED — 当前 Codex/Pi Provider 也主要把这些原生事实相关联。** Codex Provider 向 App Server `turn/start` 发送 prompt，保存 thread/turn refs，并对 app-server JSONL 求摘要；Pi Provider 保存 prompt digest、tmux pane identity、session JSONL 和 start record。它们把 `tuple(sorted(request.inputs))` 直接记成 `projected_contracts`；这能证明 launcher 做了投影动作，不证明模型实际消费，见 [`Codex provider`](../../../../plugins/agent-box-codex/src/agent_box_codex/provider.py) 与 [`Pi provider`](../../../../plugins/agent-box-pi/src/agent_box_pi/provider.py)。

**REASONED INFERENCE — 单/少 Harness 的最小方案。** 用一份 `execution-manifest.json` 关联 session ID、prompt/profile digest、Git commit/worktree、CI run/attempt 和 artifact attestations，或者在 CI/issue comment 写这些链接。仍缺跨 Harness 统一查询、责任尝试与 session continuity 的明确分离、统一 `unknown` vocabulary；一个 adapter library 正好补足。只有在跨许多 Harness/CI/人类系统并且中央 enforcement 不可旁路时，独立 control plane 才可能胜出。

# Binding challenge

**REASONED INFERENCE — `requested → resolved → frozen → projected → observed → reconciled` 没有显示出一种新计算原语。** 它是已有部署/作业/provenance 概念的跨系统命名：

| Agent-Box 阶段 | 现有概念中的等价物 | 谁通常拥有 |
|---|---|---|
| requested | workflow input、selector、Helm values、launch form、deployment parameters | 用户/Host/workflow |
| resolved | exact commit/image digest/version/UID、defaulted/admitted spec | Git/registry/admission/resolver |
| frozen | immutable job input、Activity payload、lockfile、manifest digest、final Pod spec snapshot | runtime/DB/object store |
| projected | env/mount/argv/prompt/config injection、checkout、secret projection | launcher/worker/kubelet/Harness |
| observed | status、native event、structured log、read-back、adapter self-report | native authority或 observer |
| reconciled | manifest-vs-provenance/policy verification、desired-vs-actual diff | verifier/policy/middleware |

**OFFICIAL DOCUMENTED — provenance 本来就区分声明、生成平台和验证。** SLSA 将 provenance 定义为可验证地描述 artifact 从何处、何时、如何产生；较高 Build 等级要求 provenance 与 artifact digest 绑定，并强调 completeness、authenticity、accuracy，以及由可信 build platform 生成/验证字段。[SLSA provenance](https://slsa.dev/spec/v1.2/provenance)、[Build requirements](https://slsa.dev/spec/v1.2/build-requirements)、[Verifying artifacts](https://slsa.dev/spec/v1.2/verifying-artifacts)。这说明 “有结构化 metadata” 与 “可信 provenance” 之间的差距来自 authority、隔离和验证，不来自把记录放进 Agent-Box。

**REPOSITORY VERIFIED — 当前 Binding 最接近 immutable workflow input snapshot。** Core 冻结的是 Ref identity/metadata 和 `contract_id`，ResourceProvider 在副作用前解析成 Python value；Preview 没有 slot purpose、authority ID、freshness、approval、enforcement 或 actual-consumption aggregate。即使未来候选模型增加这些字段，它仍可序列化成一个 `InputManifest + ValidationClaims + ActualClaims`，由 Temporal/Kubernetes/GitHub/自建 launcher 持有。

**REASONED INFERENCE — 唯一较难被单一现有系统覆盖的是“跨 authority 的同一 subject join”。** 例如一次运行同时固定 Git commit、worktree、Harness profile、tmux pane、credential handle、CI run 与 LangGraph checkpoint，然后把各 authority 的 claims 对到同一 attempt。这是有价值的规范化。但规范化本质是 schema、adapter 和 verifier；在没有中央 admission/credential/enforcement 时，它仍不足以要求一个独立产品。

**REASONED INFERENCE — 红队找不到当前实现中任何无法被 `immutable input manifest + adapter + typed claim` 替代的 Binding 部分。** 候选模型自己设置了三个 kill criteria：真实 Git authority 不能自动 canonicalize/validate、Provider 不能证明或强制 frozen pin 而只能写进 prompt、正常 handoff 仍需人工创建大部分 Ref/slot/approval linkage，任一出现即应判失败，见 [候选模型的 Kill Criteria](../../../architecture/EXECUTION_BINDING_GOVERNED_HANDOFF_MODEL.md#L1190)。当前 Codex/Pi 的 `projected_contracts` 仍属于第二种弱证据，WorkBoard 的逐项 Composer 则接近第三种风险。

# Evidence credibility challenge

必须先问 Evidence 的命题、subject、issuer、method、integrity 和 coverage。日志只有在这些边界清楚时才是某项命题的证据；“保存了日志”本身不是 Evidence。

| Agent-Box 可支持的命题 | 当前强度 | 不能推出什么 |
|---|---|---|
| Core 在某时刻冻结了准确的 `(contract_id, Ref)` 集合及摘要 | **REPOSITORY VERIFIED — 强（对 Agent-Box DB 内事实）** | 外部资源内容未变；Provider 实际使用 |
| ResourceProvider 在 dispatch 前把 Ref 解析成指定 Python 类型 | **REPOSITORY VERIFIED — 强（对本进程控制流）** | 解析值被 Harness 后续消费 |
| Git/worktree 或本地 artifact 在 resolve 时匹配 commit/digest | **REPOSITORY VERIFIED — 中强（对该检查点）** | 整次执行只读了该版本；之后未漂移 |
| `provider.start()` 返回且 correlation 被保存 | **REPOSITORY VERIFIED — 中** | 外部运行已持久接受、可恢复或开始执行 |
| Adapter 报告 phase/native refs/output refs | **REPOSITORY VERIFIED — Provider contract assertion** | 独立 authority 已确认；结果没有冲突 |
| WorkBoard 显示 `provider-reported:projected` | **REPOSITORY VERIFIED — 明确 self-report** | consumed、read、semantically used |
| JSONL/scrollback/start record 具有 digest | **REPOSITORY VERIFIED — 完整性仅覆盖被捕获 bytes** | 捕获完整、事件真实、未发生未记录行为 |
| GitHub artifact/attestation 或 CI run fact | **OFFICIAL DOCUMENTED — 强度来自 GitHub/CI authority** | Agent-Box 重新展示后获得更强保证 |

## Provider self-report 不是独立证明

**REPOSITORY VERIFIED — Core 对资源状态的语义约束极弱。** `apply_observation()` 只要求 state 是非空、长度不超过 256 的字符串，subject 必须是 frozen INPUT，optional evidence 只需是 ArtifactRef；测试中的 fake adapter 可以先写 `projected` 再写 `consumed`，Core 不验证其真值，见 [`services.py`](../../../../src/agent_box/work_core/services.py#L314) 与 [`test_work_core_resource_observation.py`](../../../../tests/test_work_core_resource_observation.py)。因此 “consumed” 当前是被保存的 assertion，不是被 Core 证明的事实。

**REPOSITORY VERIFIED — 即使 ADR-0005 所称 `authoritative` 也主要是 adapter contract-level assertion。** 这比未分类日志诚实，但不是独立 authority。只有 read-back 来自 Git/CI/Vault/Kubernetes authority，或 runtime attestation 由被执行代码不能篡改的控制面产生，证明强度才改变。

## “已投影”不等于“已使用”

**REPOSITORY VERIFIED — Codex 能证明 Agent-Box 把 prompt text 放入 `turn/start` request；Pi 能证明 launcher 构造 argv 并保存 prompt digest。** 这对“投影/提交”是正证据。它不能证明模型注意、理解或依据了哪段 prompt，也不能证明 plugin/MCP 配置在 Harness 内成功加载并影响结果。

**OFFICIAL DOCUMENTED — Codex JSONL 能提供正向事件。** 出现某个 MCP tool call 可以支持“该调用被 Harness 记录”；command/file-change events 可支持特定行为发生。[Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)。但未出现事件通常只是“该 telemetry 未记录”，不是“没有使用”，除非文档和运行时能证明事件流对该行为完整、不可篡改且无旁路。

**REASONED INFERENCE — Harness 是否使用 prompt/MCP/plugin 通常无法由当前 Agent-Box 完整验证。** 可验证层次最多是：配置被解析；参数被送入；插件加载事件出现；具体 tool call 出现；输出引用某数据。越往后越接近使用，但“模型语义上使用”仍不可判定。UI 必须把这些层次分开，不能把 `projected_contracts` 升格为 consumed。

## 无法证明没有使用未声明资源

**REASONED INFERENCE — 当前 Agent-Box 不能给出负向完整性证明。** Codex Provider 明确以外部 sandbox、网络 enabled 启动；Pi 进程可读其进程权限允许的文件/环境。Host、Harness 默认配置、环境变量、credential helper、模型服务、网络、时钟、cache、Git config、用户主目录等都可能成为未声明输入。

要证明“没有使用未声明资源”，至少需要：

- fail-closed filesystem/network/secret allow-list；
- 对所有读取/连接具有完整、抗篡改的 runtime telemetry；
- 隔离运行时与用户步骤的 attestation signing authority；
- 明确定义哪些隐式平台依赖属于 scope；
- subject/digest 与 frozen manifest 绑定，并验证实际输出。

**OFFICIAL DOCUMENTED — 即使 SLSA 也不轻率承诺依赖完整性。** 官方要求说明 provenance completeness，且承认 resolved dependencies 的完整性可能是 best effort、存在未充分捕获的 external parameters。[SLSA Build requirements](https://slsa.dev/spec/v1.2/build-requirements)。Agent-Box 在没有同等级隔离/控制面时不应作更强声称。

## `unknown/unverifiable` 的价值坍塌条件

**REASONED INFERENCE — 诚实显示 unknown 是正确性改进，不自动构成产品价值。** 如果大多数关键 slot 最终都是：Git pin verified、CI artifact attested、Harness prompt projected、plugin/MCP unknown、undeclared inputs unverifiable，那么 Agent-Box 主要增加一个事实索引和警示标签。Git/CI 的强事实来自原系统；Agent-Box 独有的最难命题仍未知。此时 Evidence UI 的审计价值存在，但不足以支持日常独立产品。

**REASONED INFERENCE — 价值不会因存在任何 unknown 就归零；会在 unknown 集中于购买理由时坍塌。** 若产品卖点是“证明实际使用 frozen resources”，而核心 Harness input 长期只有 self-report/projected，独立定位失败；若卖点改为“统一索引并诚实表达 assurance”，那更像 provenance middleware。

# Work replacement challenge

**REPOSITORY VERIFIED — 当前 Work 的不可替代语义很薄。** `Work` 只有 `id/objective/lifecycle/open|completed|abandoned/timestamps/closure_reason/metadata/version`；service 只有 create、complete(reason)、reopen(reason)。没有 acceptance criteria、owner/participants、obligations、decisions、review policy、dependency、deadline、artifact requirement 或基于 Evidence 的 closure rule，见 [`models.py`](../../../../src/agent_box/work_core/models.py#L57) 与 [`services.py`](../../../../src/agent_box/work_core/services.py#L27)。Execution membership 是 `work_id` 外键。

**REPOSITORY VERIFIED — 仓库自己的 ontology 研究给出了删除测试。** 如果 Work 只是 goal 加 refs，它是 correlation/index；只有拥有 status/closure、obligations/decisions、evidence timeline、participants、reopening/archival 等真实 Case 语义才成立，见 [Core ontology research](../../../architecture/AGENT_BOX_CORE_ONTOLOGY_RESEARCH.md#L192)。当前实现只满足其中 objective、closure/reopen 和 membership，远未达到该文档给出的 Case 门槛。

替代逐项如下：

- **OFFICIAL DOCUMENTED — LangGraph Thread。** Thread 是持久化 runs/state/history/metadata/status 的容器，Studio 可查看、编辑、fork 和 rerun。对于“一个长期对话/graph 目标，多次 node execution”，它已经是 Work。它不适合跨 graph、人类流程的通用 case，但此时可存外部 issue ID，而不必再造 Work。[Threads](https://docs.langchain.com/langsmith/use-threads)、[Studio](https://docs.langchain.com/langsmith/use-studio)。
- **OFFICIAL DOCUMENTED — Temporal Workflow ID。** 一个 Workflow ID 及其 Run chain 已提供耐久身份、状态和 Event History；continue-as-new/retry 可保留逻辑链。若长期目标恰是可执行 workflow，另造 Work 只会重复生命周期。[Temporal Workflow Execution](https://docs.temporal.io/workflow-execution)。
- **OFFICIAL DOCUMENTED — GitHub Issue/Project。** Issue 有 open/close、assignee、dependencies/sub-issues、linked branch/PR 和自动关闭；Projects 有自定义字段、views、automation、filter/group/chart。对于软件交付目标，它比当前 Work 拥有更多真实协作语义。[Issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues)、[Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/quickstart-for-projects)、[Issue fields](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-issue-fields)。
- **OFFICIAL DOCUMENTED — Linear/Jira。** Linear issue/project 有可定制 workflow status、负责人、目标日期、issues/docs/resources；项目状态可由用户显式更新，即使所有 issues 完成也不会自动完成，这与 Agent-Box 强调“Execution terminal 不等于 Work complete”并不矛盾。[Linear workflows](https://linear.app/docs/configuring-workflows)、[Linear projects](https://linear.app/docs/projects)、[Project status](https://linear.app/docs/project-status)。Jira work item 原生拥有 status、priority、resolution 和可配置 transition/rules。[Jira work item fields](https://support.atlassian.com/jira-cloud-administration/docs/what-are-issue-statuses-priorities-and-resolutions/)、[Jira workflows](https://support.atlassian.com/jira-cloud-administration/docs/work-with-issue-workflows)。
- **REASONED INFERENCE — external project/application object。** 若客户已有 change request、incident、case、ticket 或 deployment object，Agent-Box 只需保存 typed external ref；外部系统继续拥有 SLA、审批、参与者和 closure。
- **REASONED INFERENCE — 普通 grouping/tag。** 如果唯一需求是把多次 Execution 列在一起，一个 `external_work_ref`/label 足够。objective 可来自 issue title，membership 可由外键/label，complete/reopen 可从外部事件投影。

**REASONED INFERENCE — Work 当前没有通过删除测试。** 删除 `core_works`，在 Execution 上加 `external_work_ref` 和可选 `objective_snapshot`，不会损失任何不可由外部 issue/thread/workflow 或 tag 表达的规则。会损失 Agent-Box 自己的 manual complete/reopen history，但 GitHub/Linear/Jira 同样拥有显式 closure/reopen；这不是独占语义。

**UNVERIFIED PRODUCT HYPOTHESIS — 未来 Work 可能变成真 Case，但那是另一个产品赌注。** 若它拥有跨执行 obligations、审批、participants、decision record、evidence-based closure 与 retention，并且用户把 Agent-Box 当系统记录，此结论可能改变。当前代码和采用证据没有证明这一点。

# User and UI challenge

**REASONED INFERENCE — WorkBoard 与最常用的工作地点竞争，而不是填补空白。** LangGraph 用户已在 Studio 看 graph/thread/trace；GitHub 用户在 Issue/Project/Actions 看目标、审批、run、log 和 artifact；本地开发者在 Harness TUI/tmux 直接交互；CI/operator 在原生控制台处理 retry/cancel。Agent-Box 若只复制摘要，会让用户在“做事的 UI”和“解释关联的 UI”之间切换。

## Binding Composer 是复杂的启动表单

**REPOSITORY VERIFIED — 当前 Composer 的关键动作是选择 Provider、逐 slot 选择 Ref、查看 requested/exact/assurance、重新 resolve，然后 `Freeze & Launch`。** 这是有治理信息的 launch form；它尚未展示跨 authority approval、policy decision、runtime consumption 或自动 rebind 的独立生命周期。

**REASONED INFERENCE — 用户不会高频逐个挑 Ref。** 对日常 coding session，合理 UX 是从 issue/repo/branch/profile/policy 自动解析 defaults，只在 ambiguity、policy violation 或高风险部署时请求选择。若每次运行都手工创建 Ref/slot，governance 的成本会超过收益；候选模型已把这种情况列为 kill criterion。

## Evidence UI 是否值得主动打开

**REASONED INFERENCE — Evidence 是低频、事件驱动界面。** 开发者通常在失败、审计、handoff、approval 或 incident 时查看；日常只需要一个可执行 decision：“可启动/被阻止/发生 divergence/需要人工判断”。把完整 Evidence ledger 作为主界面，很可能把基础设施可观测性包装成产品中心。

**UNVERIFIED PRODUCT HYPOTHESIS — 当前没有证据表明用户会主动进入 WorkBoard。** 可能用户与频率至少分裂为：开发者每天启动但留在 Harness/IDE；平台工程师偶尔维护 policies/adapters；operator 在异常时调查；安全/审计按周期取证；项目经理留在 Issue/Project。没有一个已验证 persona 同时需要高频 Binding Composer、Work lifecycle 与 Evidence explorer。

## 独立 UI 的成立条件

**REASONED INFERENCE — 只有三种情况值得独立 UI。** 一是 Agent-Box 是强制 admission/approval 入口；二是跨系统 incident/audit 的查询量足够大，原生 UI 无法回答；三是 Work 成为组织的 case system of record。否则更自然的 UI 是：GitHub check/issue panel、LangGraph/Temporal metadata view、CLI inspector、IDE panel 或生成的 evidence report。

**REASONED INFERENCE — 当前 WorkBoard 更像 SDK demo/inspector。** 这不是缺点；它可以很好验证模型。但把 inspector 解释成独立产品，会把一个可嵌入的 schema/adapter 问题误包装为新的日常工作台。

# Subordination test

“是否被 workflow 调用”太宽松。本报告使用一个更严格的 **product subordination test**：独立产品不必拥有底层执行，但至少应拥有一个不可被上游原生对象替代的主对象；成为实际入口或非旁路 authority；持有不可由 Provider histories 重建的决策事实；移除它需要业务语义迁移，而不只是换 adapter。

评分：`0` = 未证明/明显由上游拥有，`1` = 共享或部分拥有，`2` = Agent-Box 明确且独占地拥有。分数不是市场定量模型，而是强迫逐项说明 authority。

| 维度 | 严格问题 | 当前评分 | 红队判断 |
|---|---|---:|---|
| identity ownership | 主身份是否不是 invocation 时临时生成的 correlation UUID，并被用户/多个上游长期引用？ | 2 | **REPOSITORY VERIFIED —** Work/Execution 有独立 ID；但独立 UUID 是必要非充分条件。 |
| lifecycle ownership | 生命周期是否由自身规则推进，而不是镜像 Provider/upstream？ | 1 | **REPOSITORY VERIFIED —** Work complete/reopen 自有；Execution phase 主要来自 Provider observation，且强单调语义尚 Pending。 |
| invocation dependency | 没有某个特定上游，产品仍能独立产生主要价值和发起/拒绝执行吗？ | 1 | **REPOSITORY VERIFIED —** WorkBoard 可直接 launch；但价值仍依赖 Provider，且没有非旁路拒绝权。 |
| persistence authority | 数据库是否是某项重要事实的最终 authority，而不是复制/索引？ | 1 | **REPOSITORY VERIFIED —** frozen selection/dispatch intent 是最终记录；native state、actual use、Git/CI truth 不是。 |
| user entry point | 用户是否通常从 Agent-Box 开始工作，而非 Harness/IDE/Issue/workflow？ | 0 | **UNVERIFIED PRODUCT HYPOTHESIS —** 无采用/行为数据；WorkBoard 只能证明入口存在，不能证明它是实际入口。 |
| completion authority | 谁最终有权说长期目标完成，是否有不可替代 closure rule？ | 1 | **REPOSITORY VERIFIED —** Agent-Box 可手动 complete/reopen，但没有 acceptance/approval/evidence closure rule；外部 issue 可等价拥有。 |
| replaceability | 替换 Agent-Box 是否需要迁移业务语义，而非加字段、wrapper 或 adapter？ | 0 | **REASONED INFERENCE —** 七类替代均可保存当前核心字段；主要成本是集成和统一查询。 |
| multi-upstream support | 是否真实支持多个相互独立 upstream，而不是只在接口上可扩展？ | 1 | **REPOSITORY VERIFIED —** 有 Provider registry 及 Codex/Pi/tmux/resource plugins；尚无生产证据证明多 workflow/CI authority 汇聚成为用户必需入口。 |

**REASONED INFERENCE — 总分 7/16，且三个硬门槛未过。** 硬门槛不是总分，而是：(1) 实际 user entry point；(2) 不可旁路的 authority 或不可重建决策；(3) 低 replaceability。Agent-Box 当前三个都未证明。因此，即使它能独立运行、支持多个 Provider、拥有自己的 DB，也仍是产品意义上的 subordinate execution component。

**REASONED INFERENCE — multi-upstream support 是必要但不充分。** OpenTelemetry collector、SDK gateway 和 CI reporter 都可服务多个上游而仍是基础设施组件。只有当跨上游身份/政策/完成决策不能合理放在任何上游，并且组织把中央层当 system of record，才越过独立 control plane 门槛。

# Simplest viable alternative

最小替代不是删除全部 Core，而是把它降为 **`agent-box-execution` SDK + provider adapter library + optional provenance middleware**。

```text
LangGraph / Temporal / Prefect / GitHub / CLI / IDE
                         |
              freeze_and_dispatch(envelope)
                         |
      Resource resolvers + Execution provider adapters
                         |
          native session / Job / CI run / Activity
                         |
            typed claims + native evidence links
```

**REASONED INFERENCE — 推荐交付形态。**

- Python library：canonical Ref codec、resource contract types、input manifest/digest、idempotent dispatch receipt、typed observation/evidence claim；
- adapters：Codex、Pi、tmux、Git/worktree、GitHub Actions、Kubernetes、Temporal/LangGraph/Prefect wrappers；
- optional middleware service：仅在多个上游需要统一查询时部署，接收 claims，不要求所有执行先创建 Work；
- CLI：`freeze`, `dispatch`, `inspect`, `verify`, `export-evidence`；
- upstream-native UI：GitHub check/comment、LangGraph/Temporal metadata、IDE/Harness panel；WorkBoard 保留为开发/诊断 inspector，不作为主产品承诺。

| 当前对象/能力 | 处理 | 最小替代形式 |
|---|---|---|
| `Execution` | **保留但降为值对象/attempt envelope** | `execution_id`, `intent`, `provider`, `external_work_ref`, timestamps |
| `Ref` + Resource Contract | **保留** | provider-neutral typed locator/value protocol |
| frozen inputs + digest | **保留** | immutable `InputManifest`；可存入上游 payload/event/artifact |
| Dispatch/idempotency/correlation | **保留** | launcher receipt + recovery hook；由 Temporal/K8s/GitHub 时复用其原生 ID/history |
| Evidence/Observation | **保留并收紧** | typed claim：subject、issuer、method、assurance、coverage、integrity、timestamp、payload ref |
| Projection | **降级** | adapter-derived view/cache；不与 authority fact 混同 |
| `Work` | **从 mandatory Core 删除** | `external_work_ref`/tag；只有真实 Case 产品验证后再升级 |
| Binding aggregate/Composer | **不引入为 mandatory entity/UI** | manifest + validators + policy/default resolution |
| central event ledger | **可选** | 多上游 provenance middleware；不复制 Temporal/GitHub/K8s 全部历史 |
| WorkBoard | **降为 inspector/demo** | upstream-native panels 和 evidence export |

**REASONED INFERENCE — Temporal/LangGraph plugin 与 SDK 不冲突。** SDK 定义跨 runtime envelope/claim 语义；各 plugin 把它映射到 Activity input/result、node state/checkpoint、Prefect task artifact、GitHub workflow output 或 Kubernetes annotation/status。这样保留当前 Core 中真正通用的部分，又避免建立第二套 Work、DAG、retry、checkpoint、artifact store 和主 UI。

**REASONED INFERENCE — 对已有 workflow engine，首选 activity/node runtime；对没有 workflow 的 direct Harness，首选 launcher SDK。** 只有跨多个 upstream 需要中央索引时才启用服务端。部署拓扑应是需求的结果，不应反过来用服务端存在证明产品独立性。

# What the red team could not explain away

反方仍有四项不能诚实抹掉：

1. **REPOSITORY VERIFIED — 原子冻结输入与 Dispatch intent 是实质不变量。** Host 选择到 Provider side effect 之间的 TOCTOU、幂等键重用和一 Execution 一 Dispatch 确实需要一个共同边界。很多临时 node/launcher 会做错；当前 Core 的实现和测试有复用价值。
2. **REPOSITORY VERIFIED — Execution responsibility 与 reusable native session 的区分有用。** 同一个 Harness session 可服务多个责任尝试；用 session ID 直接代表业务 attempt 会污染 completion、audit 和 continuation。独立 attempt envelope 值得保留。
3. **REASONED INFERENCE — 跨 authority subject matching 确实不容易由单一 workflow engine自然覆盖。** Git commit、worktree、Harness thread/turn、tmux pane、CI run/job、artifact attestation 分属不同 authority。每个上游自己实现 join 会重复并产生不一致；公共 schema/adapter/verifier 很有价值。
4. **REASONED INFERENCE — 诚实表达 `self-reported / authority-attested / runtime-attested / unknown` 是正确方向。** 原生 UI 往往擅长自己的事实，不擅长比较 expected vs actual 的跨系统 coverage。即使最终是 middleware，这仍是 Agent-Box 最值得保留的知识产权。

**UNVERIFIED PRODUCT HYPOTHESIS — 最可能击败本红队结论的真实场景**是：受监管企业同时使用多个 workflow engine、GitHub/其他 CI、Kubernetes、多个 coding Harness 和直接人工 session；所有执行必须经 Agent-Box 才能获得短期凭据/网络/工作区权限；Agent-Box 在 dispatch 前执行跨 authority approval/admission，在受信 runtime 中产生不可篡改的 actual-consumption attestation；审计员和 operator 以 Agent-Box Work/Execution 为唯一 case identity，并由其 closure policy 决定完成。此时任何一个上游都不能拥有全局 lifecycle/authority，SDK 也无法阻止旁路，独立 control plane 可能成为必要。

**REASONED INFERENCE — 但这个失败场景要求 Agent-Box 拥有当前明确不拥有的东西：** credential/admission enforcement、runtime attestation、组织级 case authority 和日常入口。它不能靠未来架构图或多 Provider registry 推定为已成立。

# Evidence that would change this verdict

以下证据会使红队从 B 重新评估 C 或 D；应要求可复验数据，而不是更多概念文档：

1. **UNVERIFIED PRODUCT HYPOTHESIS — 生产采用。** 至少 3 个互不关联团队连续 90 天使用；不是仅跑 demo。提供 Work/Execution 创建量、活跃用户、retention 和失败/调查行为。
2. **UNVERIFIED PRODUCT HYPOTHESIS — 真实多上游。** 同一 Agent-Box deployment 同时接受至少 3 类独立 upstream（例如 Temporal、GitHub、直接 Harness/Kubernetes），且同一 Work 中确有跨 upstream handoff，而不是每种一个孤立 demo。
3. **UNVERIFIED PRODUCT HYPOTHESIS — 首要入口。** 有显著比例的目标从 Agent-Box 发起/完成，用户不是只从原生系统被动跳转；Work complete/reopen 触发真实组织决策。
4. **UNVERIFIED PRODUCT HYPOTHESIS — 非旁路 enforcement。** 展示未通过 frozen binding/approval 的执行无法获得凭据、网络、workspace 或调度能力；绕开 Agent-Box 会 fail closed，而不是少一条 ledger record。
5. **UNVERIFIED PRODUCT HYPOTHESIS — actual consumption coverage。** 对购买理由中的关键资源，至少 80% Execution 产生独立 authority 或 runtime-attested actual facts；`projected/self-reported/unknown` 的比例和原因公开。
6. **UNVERIFIED PRODUCT HYPOTHESIS — 负向或 divergence 价值。** 在受控实验或真实 incident 中，Agent-Box 阻止/发现 Provider 使用错误 commit、错误 credential generation、错误 profile/plugin 或未批准 artifact，而原生 workflow/CI UI 没有发现。
7. **UNVERIFIED PRODUCT HYPOTHESIS — 替换成本。** 用同一场景实现 Temporal Activity、LangGraph wrapper 或 DB launcher，证明它们必须重复一项由 Agent-Box 独占的 business invariant，而不只是复制 4 张表/adapter。
8. **UNVERIFIED PRODUCT HYPOTHESIS — UI pull。** 记录用户主动打开 Binding/Evidence/Work 页面后作出的可观察决策；如果主要访问来自调试开发者或季度审计导出，应接受 inspector/middleware 定位。
9. **UNVERIFIED PRODUCT HYPOTHESIS — provider-neutral continuity。** 替换 Harness/CI 后，上层 workflow/issue 不变，Agent-Box identity、policy、evidence chain 仍保留，并带来实际恢复/合规收益。
10. **UNVERIFIED PRODUCT HYPOTHESIS — 中央完成权威。** Work closure 由 obligations/approvals/evidence rules 驱动，外部 Issue/Project 只作为参与对象；否则 Work 仍应外置。

**REASONED INFERENCE — 判决升级标准。** 若主要证明的是统一 Activity/node execution semantics，应升级为 **C. workflow execution substrate**；若同时证明首要入口、不可旁路 authority、独立 lifecycle/completion 和低 replaceability，才升级为 **D. 独立 control plane 仍有未被推翻的必要性**。

# First-round conclusion

**B. Core 有价值，但应作为 library/plugin。**

**REASONED INFERENCE — 当前证据支持的最窄、最强定位是：** Agent-Box 是一个 provider-neutral execution envelope、governed launcher contract 与 cross-system provenance middleware。它能提高输入冻结、幂等提交、attempt/session 分离和 evidence labeling 的质量；但 Work 没有不可替代 Case 语义，Binding 没有超出 immutable manifest + claims，Evidence 的核心弱点仍是 Provider self-report/unknown，UI 没有被证明是用户入口。

**REASONED INFERENCE — 因此不应把独立 control plane 当默认终局。** 先发布 SDK、Temporal/LangGraph/Prefect/GitHub/Kubernetes adapters 和 evidence verifier；让 Work 外置，让原生 runtime 持有 native lifecycle/history，让 WorkBoard 退居 inspector。只有当生产证据证明中央层不可旁路、actual-consumption 可独立验证、Work 是组织完成权威且多上游用户主动从这里工作，才恢复独立产品假设。

**REPOSITORY VERIFIED — 仓库当前最诚实的材料其实支持这一收缩。** 产品重校准文档要求区分 provider self-report、authority read-back 与 unknown，并承认 Harness 声称加载 plugin 但无独立 observation 时不能显示 verified，见 [产品中心重校准](../../AGENT_BOX_PRODUCT_CENTER_RECALIBRATION_2026-08-27.md#L392)；Binding 候选模型又把不能证明/强制 frozen pin 和大量手工 linkage 列为失败条件。红队只是把这些内部约束执行到底：在失败条件尚未被真实 vertical slice 推翻前，不能把“有价值的执行协议”升级成“必要的独立产品”。
