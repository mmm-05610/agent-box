# Executive summary
>
> Historical record — describes an earlier architecture or validation state and is not current implementation guidance.

> 文档导航：[总目录](../README.md)

2026-08-25 公开 Demo 的主角不是“多 Agent 写出了一个客服应用”，而是一个真实软件项目如何被治理：

```text
Fuzzy Work W1
→ bounded discovery Execution E0
→ material Human decision H1
→ frozen Binding B1
→ composite Execution E1
→ terminal/succeeded（Work 仍 open）
→ real Human product review H2
→ frozen Binding B2
→ continuation Execution E2
→ terminal/succeeded
→ explicit Human Work completion
```

Demo 的核心设计律是：

> Human shapes the Work. Binding freezes the execution basis. Provider realizes the runtime. Harness executes inside that realized environment. Core records responsibility and evidence.

Work 可以长期、模糊并持续演化；Execution 不可以。E0、E1、E2 都必须在 Dispatch 前拥有明确 objective、冻结输入和独立责任边界。任何 Execution 的成功都不会自动完成 Work。

E1 使用一个 composite ExecutionProvider。Provider 插件内部可以拥有 LangGraph、ACP、Claude Code、Codex、多个 Harness session、测试进程、Git worktree 和 bubblewrap；Core 只看 Work、Execution、Dispatch、Binding、Provider、Ref、Observation、Projection、Event 与 Resource Fact。

现有详细产品规格 [SMART_CUSTOMER_SUPPORT_BOT_DEMO_PRODUCT_SPEC.md](./SMART_CUSTOMER_SUPPORT_BOT_DEMO_PRODUCT_SPEC.md) 是 Demo 设计团队的方向参考，**不得作为隐藏输入交给 E0 或 E1**。实际执行只消费现场逐步产生并被 Human 接受的 artifacts。

# Six demo claims

| 命题 | 现场证据 | 失败判据 |
|---|---|---|
| 1. Work 长期、模糊、持续演化 | 同一个 W1 下依次出现 E0、E1、E2；每个 Execution terminal 后 W1 仍 open，最后由 Human 显式完成 | E1 succeeded 自动把 W1 设为 completed，或直接把 seed brief 当完整 Execution 输入 |
| 2. Provider 内部复杂而 Core 不知拓扑 | E1 只显示一个 composite Provider 和一个 WorkflowInstanceRef；插件详情页可展开 LangGraph、Harness 与 test/fix，但 Core schema 无 node/worker/role | Core 出现 WorkflowStep、AgentRole、LangGraphNode 或按 Provider 分支 |
| 3. 外部对象进入 Execution responsibility view | E1/E2 可查询其 frozen inputs、WorkflowInstanceRef、SessionRefs、WorkspaceRef、ArtifactRefs 和实际资源事实 | 只能看日志，不能回答某次 Execution 的输入、输出和实际资源 |
| 4. failure/fix/continuation 责任清晰 | hallucination test failure 与修复都在 E1 内；Human 新要求在 E1 terminal 后创建 E2 | 每次测试失败都创建 Core Execution，或 E2 修改 E1 的 outcome/Binding |
| 5. Binding 是 Execution runtime contract | 展示 Requested → Frozen → Projected → Consumed → Compared；Harness 启动即有 workspace、ACP、config、inputs 和 sandbox | 只把一段上下文塞进 prompt，或用户手工告诉 Harness 路径/端点 |
| 6. Human 是 Work 生命周期参与者 | H1 改变 E1 的产品方向与 B1；H2 改变 E2 objective、B2 和验收标准；最后 Human 关闭 W1 | Human 只点一次“yes”，或 Agent 自行宣布 Work 完成 |

# Initial fuzzy Work brief

公开 Demo 的唯一初始产品输入保持为：

> 帮我做一个本地可运行的小型智能客服 Web 应用。
> 它应该能回答常见客服问题，最好还能处理一些订单类问题；
> 遇到不能确定的事情不要乱说，并且要有一种转人工的方式。
> 希望最终看起来像一个完整的小产品，而不是技术样例。

创建：

```text
Work W1
objective = "Build a useful small customer-support product."
lifecycle = open
```

初始不提供：API、schema、FAQ 数量、UI 页面树、工具列表、RAG 技术、citation 样式或完整验收清单。

可以同时提供的只有非产品细节约束：本地优先、没有商业外部依赖、公开演示时间有限、最终必须可运行。这些属于项目环境约束，不是提前确定产品方案。

# User-visible 5–8 minute narrative

公开叙事建议控制在约 7 分钟。完整 E1/E2 可能超过现场时长，因此主舞台使用一次**提前真实执行并完整留证的 run replay**，页面必须明确标注“Recorded real execution”，不能伪装成实时。最终应用和验收问题现场真实运行；备用场次可以启动 live rerun。

| 时间 | Act | 观众看到什么 | 需要证明什么 |
|---:|---|---|---|
| 0:00–0:35 | 1. 模糊目标 | 创建 W1，只看到四行 seed brief，没有 PRD | Work 可以从模糊目标开始 |
| 0:35–1:25 | 2. Product discovery | E0 产出三个方向、UI 描述、风险和推荐；E0 terminal，但 W1 open | Execution 有界，Work 未完成 |
| 1:25–2:05 | 3. Human decision | 展示 Human 选择 B 并写入具体偏好；形成 accepted product artifact | Human 实质改变后续依据 |
| 2:05–2:45 | 4. Binding B1 | 逐项显示 accepted artifacts、workspace、collaboration、profile、sandbox；B1 freeze，D1 才可接受 | Binding 不是 prompt |
| 2:45–4:05 | 5. Composite E1 | 快速回放 investigation、implementation、test fail、grounding fix、pass、review；不展示 raw token/log | Core 看一个 Execution，Provider 内部很复杂 |
| 4:05–5:35 | 6. 运行产品 | 现场问 FAQ、看 citation、多轮查询订单、未知问题转人工、刷新历史 | 结果是可用产品而非流程表演 |
| 5:35–6:10 | 7. Human review | 用 `ORD-9999` 发现 unknown-order flow 是死路，保存 review artifact | Human review 来自真实使用 |
| 6:10–6:45 | 8. E2 | B2 显示 E1 output + review feedback + continuation SessionRef；E2 独立 terminal | continuation 不重开 E1 |
| 6:45–7:15 | 9. Complete | 复测 unknown-order escalation；Human 显式完成 W1；展示 audit view | outcome、conformance、Work closure 分离 |

Replay 的真实性约束：

- 只能回放 Core 已持久化的 material timeline；
- 每个 ArtifactRef、WorkspaceRef 和测试报告都可打开验证；
- 不补造失败、消费证据或 terminal event；
- 若 live run 首次就通过 hallucination test，不得制造失败，公开讲解预演 run 中真实发生过的 failure/fix。

# Human participation design

## Intervention A：产品方向收敛

E0 输出三个完整选项，而不是一个 yes/no 问题：

| 选项 | 定位 | 典型能力 | 复杂度/风险 |
|---|---|---|---|
| A | 纯政策 FAQ bot | Chat、FAQ、引用、fallback | 最稳，但工具与 Agent 感较弱 |
| B | 小型客服产品 | FAQ、订单查询、转人工、历史记录 | vertical slice 完整，推荐 |
| C | 迷你客服平台 | 账号、后台、工单流转、多人 | 超出 Demo，风险高 |

Human 不只选择 B，还形成一份可审计决定：

- 选择 B；
- 面向虚构小电商，订单必须明确标为模拟数据；
- 本地优先，不做登录和真实商业集成；
- UI 要像产品，桌面端要能看到最近对话；
- 政策回答要让用户看见来源；
- 不确定时必须清楚说明并提供人工路径；
- 允许执行团队自行决定框架、schema、FAQ 数量、检索方式和具体工具接口。

产生：

```text
ArtifactRef(product-direction-v1 @ sha256:P1)
ArtifactRef(acceptance-criteria-v1 @ sha256:A1)
WorkDecisionRecorded(H1, selected=B, artifacts=P1+A1)
```

P1/A1 是 E1 Binding 的 required inputs；Human 的偏好因此真正改变 E1 的执行基础。

## Intervention B：真实产品 review

E1 完成后 Human 现场打开产品并测试：FAQ、citation、多轮、`ORD-1001`、未知政策、`ORD-9999`。

自然反馈选择：

> 不存在的订单目前只说“未找到”，用户会卡住。请让 unknown-order flow 明确提供转人工卡片，并把订单号预填进工单摘要；其他行为保持不变。

保存 review artifact，包含：

- 实际输入 `ORD-9999 到哪了？`；
- 当前截图/结果；
- 用户体验问题；
- 期望行为；
- 新验收条件；
- 不改变的范围。

产生：

```text
ArtifactRef(review-feedback-v1 @ sha256:R1)
HumanReviewRecorded(H2, artifact=R1)
```

H2 不修改 E1。它成为 E2 的新输入。

# Discovery phase design

选择：**C. 独立 Execution E0**。

判断依据不是“discovery 步骤很多”，而是它拥有独立、可冻结的责任边界：

```text
E0 objective:
  根据 seed brief 与 Demo 约束，产出一份 decision-ready product proposal；
  比较 3 个方向，给出推荐、关键未决项和风险；不写产品代码。

E0 terminal output:
  ProductOptions ArtifactRef
```

E0 的输入虽来自模糊 Work，但 E0 自身并不模糊。它明确只负责“形成可供 Human 决策的选项”，不负责替 Human 决策，也不负责实现。

Human 选择与修改方向是 Host/Work 生命周期中的 material decision，不创建“Human Execution”，也不让 Core 成为 approval workflow engine。

不选择 B（纯 Host 阶段）的原因：AI discovery 本身会消耗模型/session、产生有责任归属的 proposal artifact，值得被 Execution 记录。不选择 A（并入 E1）的原因：E1 Dispatch 前还不存在已接受方向，无法冻结明确责任边界。

# Work / Execution topology

```text
Work W1: Build a useful small customer-support product
│
├─ Execution E0: produce decision-ready product options
│  ├─ Binding B0: seed brief + demo constraints + read-only output location
│  └─ terminal/succeeded → ProductOptions ArtifactRef
│
├─ Human Decision H1
│  └─ accepted ProductDirection + AcceptanceCriteria ArtifactRefs
│
├─ Execution E1: build accepted v1 product
│  ├─ Binding B1 frozen
│  ├─ Dispatch D1
│  ├─ composite Provider internal workflow
│  └─ terminal/succeeded → app/test/workspace artifacts
│
├─ Human Review H2
│  └─ ReviewFeedback ArtifactRef
│
├─ Execution E2: apply accepted review change
│  ├─ Binding B2 frozen
│  ├─ Dispatch D2
│  ├─ optional input SessionRef from E1
│  └─ terminal/succeeded → final app/test/workspace artifacts
│
└─ Human explicit WorkCompleted
```

不变量：

- E0/E1/E2 都属于 W1，但 outcome 仅描述各自 attempt；
- E1 terminal 后永不重新 active；
- E2 使用新的 Binding、Dispatch、timestamps、facts 和 outcome；
- SessionRef 可以跨 E1/E2 共享，但不承载 Work progression；
- 只有 Human/Host 的显式 closure 操作完成 W1。

# E1 definition

## Objective

根据 Human 接受的产品方向，交付一个本地可运行、可被真实提问的小型智能客服 Web 产品，并满足冻结的 v1 acceptance criteria。

## Frozen product outcomes

E1 需要交付的结果是行为级、非实现级的：

- 产品化聊天界面与最近对话；
- 基于 repo-local knowledge 的可信回答和可见来源；
- 基本多轮上下文；
- 一种本地模拟订单查询能力；
- 不确定时不编造并可转人工；
- 本地持久化；
- 可重复启动说明、自动测试和 E2E smoke。

E1 可以自行决定：技术框架、数据库表、知识条目数量、lexical/embedding 策略、API 路径、citation 组件样式和 fake tool 的内部签名。

## Terminal condition

E1 只有在以下均成立时才可 `terminal/succeeded`：

- 应用构建并可启动；
- accepted v1 behavior tests 通过；
- hallucination regression 通过；
- E2E smoke 通过；
- reviewer 没有阻断级问题；
- final workspace、application artifact 和 test report 已原子关联到 terminal observation。

E1 succeeded 不表示 W1 completed，也不保证 Binding conformance；二者在 audit view 中分别显示。

# E1 topology options

## Option A：单一强 supervisor 串行委派

```text
Claude supervisor
→ Codex investigate
→ Codex implement
→ tests
→ Claude review
→ Codex fix
```

优点：实现简单、写入冲突少。缺点：调查串行、supervisor 上下文过重，难以展示并行资源的真实价值。

## Option B：按技术域多 writer 并行

```text
LangGraph
→ frontend writer
→ backend writer
→ retrieval writer
→ testing writer
→ merge agent
```

优点：视觉上“多 Agent”明显。缺点：共享 schema/API 高频冲突，merge 和协调成本大于这个小产品的自然需求；容易为了数量堆 worker。拒绝作为推荐方案。

## Option C：并行只读调查 + 单一受控 writer + 独立 review

```text
LangGraph supervisor
├─ product/architecture investigator (read-only)
├─ retrieval/quality investigator (read-only)
└─ fan-in synthesis
    → primary implementer (only writer)
    → deterministic tests
    → evidence-based fix loop
    → independent product/code reviewer (read-only)
    → package outputs
```

优点：并行发生在真正可独立的分析域；实现保持单一集成责任；测试和 review 独立；failure/fix 自然留在 E1。缺点：需要清晰 handoff artifact 和 Provider 内部 orchestration。

推荐 **Option C**。

# Recommended composite Provider topology

E1 Provider 采用 plugin-owned LangGraph orchestration，但不把“每个技术域”都变成 worker。

```text
project_binding
→ bootstrap runtime
→ fan-out investigation
   ├─ product/architecture/UX feasibility
   └─ retrieval/grounding/testing risk
→ fan-in implementation brief
→ primary implementation
→ build + unit/integration/behavior/E2E tests
→ if failure: analyze evidence → same writer fix → rerun (max 3)
→ read-only product/code review
→ if blocking and in accepted scope: one bounded fix loop
→ package artifacts + terminal observation
```

两个 investigation worker 足够：前端、后端、持久化、tool calling 在这个规模下高度耦合，继续拆分不会增加独立性。测试 runner 是确定性进程，不包装成 Agent。Reviewer 独立于 writer，但没有写权限。

# Internal agents and harnesses

| Internal component | Role | Harness | Permission | 输入 | 输出 | Communication | Ref/fact contribution |
|---|---|---|---|---|---|---|---|
| LangGraph supervisor | 编排、预算、fan-out/fan-in、loop termination | plugin runtime，非 LLM role | 只写 provider-owned state/handoff 区 | frozen B1、projection receipts | workflow state、material output list | ACP 调 Harness；内部 state store | WorkflowInstanceRef；不输出 node refs |
| Product/architecture investigator | 收敛产品结构、UI 信息架构、vertical slice 风险 | Claude Code via ACP | product workspace read-only；inputs read-only | product direction、acceptance、empty repo snapshot | investigation artifact | 向 supervisor 返回结构化 result/artifact | Claude SessionRef；必要时 ArtifactRef |
| Retrieval/quality investigator | 设计轻量 retrieval、grounding guard、测试策略 | Codex via ACP | product workspace read-only；inputs read-only | acceptance、knowledge seed、repo snapshot | retrieval/test recommendations | ACP structured result | Codex SessionRef；investigation ArtifactRef |
| Primary implementer | 统一实现 frontend/backend/persistence/retrieval/tools/tests | Codex via ACP | 唯一可写 integration worktree | synthesized brief、B1 inputs、investigation artifacts | commits、runnable app、test changes | ACP task/result；workspace commits | Codex SessionRef、WorkspaceRef outputs、ArtifactRefs |
| Test runner | 执行 build/unit/integration/behavior/E2E | deterministic subprocess | source tree只读或有限生成目录；独立 temp/cache 可写 | exact worktree commit、test config | machine-readable reports | supervisor 捕获 exit/result | TestReport ArtifactRef；可选 RunRef，不记录 PID 噪声 |
| Independent reviewer | 产品、UX、grounding、代码边界 review | Claude Code/browser harness via ACP | review snapshot read-only | runnable app、screenshots、accepted criteria、test report | blocking/non-blocking review artifact | ACP result | Reviewer SessionRef、ReviewReport ArtifactRef |

Harness 选择依据：

- Claude Code 用于跨产品、UX、架构的综合调查与独立 review；
- Codex 用于 repo 内精确调查、实现、测试证据驱动修复；
- LangGraph 提供确定性 orchestration，而不是假装成一个 Agent；
- Hermes 在本任务中没有不可替代职责，默认删除。

任何 Harness 品牌替换都不改变 Core ontology。插件可以用同样角色结构替换为其他可用 Harness。

# LangGraph role

LangGraph 只属于 composite Provider 插件。

## Nodes

1. `project_binding`
2. `bootstrap_runtime`
3. `investigate_product_architecture`
4. `investigate_grounding_quality`
5. `synthesize_implementation_brief`
6. `implement_vertical_slice`
7. `run_tests`
8. `classify_failure`
9. `fix_from_evidence`
10. `independent_review`
11. `fix_blocking_review`
12. `package_and_report`

## Fan-out / fan-in

Nodes 3 和 4 并行，只读且输出独立 artifacts。Node 5 必须 fan-in 后生成一份不可变 implementation brief，writer 不接受两个调查者直接同时改代码。

## State

Graph state 保存：binding digest、runtime projection receipts、worker session handles、handoff artifact locators、workspace locator、current commit、test results、fix iteration、review verdict 和 budget。它是 Provider-owned checkpoint，不进入 Core。

## Failure loop

`run_tests → classify_failure → fix_from_evidence → run_tests`，最多 3 次。Blocking review 最多追加 1 次 bounded fix。超预算、环境不可恢复或 accepted scope 内无法完成时，E1 terminal/failed，而不是无限循环。

## Core visibility

Core 只获得 WorkflowInstanceRef、material Session/Workspace/Artifact Refs、normalized observations、actual resource facts 和最终 outcome。Graph node、edge、checkpoint、worker message和 loop counter都不进入 Core schema。

# ACP role

ACP 有真实价值，但范围严格受控：它给 LangGraph supervisor 一个统一方法管理异构 Claude Code/Codex Harness session、发送结构化任务、接收结果并观察 session lifecycle。

## Topology

```text
LangGraph supervisor
  ├─ ACP → Claude Code investigator/reviewer sessions
  └─ ACP → Codex investigator/implementer sessions
```

Workers 不做任意 peer-to-peer 群聊。所有任务、结果和权限由 supervisor 管理，代码协作仍通过一个受控 worktree。

## Lifecycle ownership

- Composite Provider 创建和关闭本地 ACP broker/channel；
- Provider 为每个 Harness 建 session，并持有 credentials/transport details；
- E1 terminal 后关闭 E1 channel，保留可 continuation 的 native SessionRef；
- E2 创建新 ACP channel，但可以让 Provider 用 E1 的 implementer SessionRef 发起 native continuation。

## Binding and projection

B1 的 `runtime.collaboration` slot 绑定一个 provider-owned collaboration profile ArtifactRef，而不是 Core `ACPConnection`：

```text
ArtifactRef(composite-provider/acp-local-profile-v1 @ sha256:C1)
```

Provider 的 ACP projection handler：

1. 验证 profile digest；
2. 启动 local broker；
3. 生成 execution-scoped endpoint/config；
4. 把 endpoint 投影进 supervisor 和 Harness config/env；
5. 启动前完成 handshake probe；
6. 返回 broker RunRef、Harness SessionRefs 和 projection evidence。

用户不需要在 prompt 中说“连接 ACP server”。Harness 启动时已经拥有正确配置。

## Core sees / does not see

Core 看见：B1 的 generic collaboration resource、WorkflowInstanceRef、material SessionRefs、可选 broker RunRef、actual projection/consumption facts。

Core 看不见：ACP endpoint schema、message、worker topology、session protocol、broker routing 和 transport retry。

若 ACP 在 8/25 前不稳定，应首先删除 ACP，改为 Provider-owned subprocess RPC。六个命题仍可由 Binding、workspace projection、LangGraph 和 heterogeneous Harness refs 证明；不能为保留 ACP 降低责任语义。

# Binding B1 blueprint

B1 是 E1 的冻结 execution input contract，不是产品 PRD，也不是一段 prompt。概念字段最小化为：Binding identity/revision/state/digest、purpose、required assurance，以及若干具有 semantic、Ref、exact pin 和 required 标记的 slots。

| Binding slot | Frozen Ref/resource | Pin | Consumer | Runtime projection | Actual consumption evidence |
|---|---|---|---|---|---|
| `input.product_direction` | Human-approved ProductDirection ArtifactRef | `sha256:P1` | supervisor、investigators、writer、reviewer | read-only `/inputs/product-direction` | Provider open+hash；delivery manifest；Harness logical use为 best-effort |
| `input.acceptance_criteria` | accepted AcceptanceCriteria ArtifactRef | `sha256:A1` | supervisor、test worker、reviewer | read-only `/inputs/acceptance`；测试任务结构化注入 | Provider parse+hash；test mapping artifact；logical reasoning unknown |
| `workspace.primary` | empty product WorkspaceRef | `git.commit:BASE` | workspace handler、writer、tests、reviewer | E1 integration worktree；按角色 read-only/read-write mount | mount manifest、`git rev-parse`、final commit/tree、write audit |
| `input.knowledge_seed` | fictional company/seed policy ArtifactRef | `sha256:K1` | retrieval investigator、writer | read-only knowledge seed file | hash/read evidence；生成的 repo-local KB 是 output，不预先规定数量 |
| `input.quality_expectations` | grounding/local-run/test principles ArtifactRef | `sha256:Q1` | quality investigator、tests、reviewer | read-only test contract | parsed test matrix、test report reference |
| `runtime.collaboration` | local collaboration profile ArtifactRef | `sha256:C1` | ACP projection handler | execution-scoped broker + injected endpoint/config | broker RunRef、handshake、ACP session/message counters；内容利用不推断 |
| `runtime.harness_profile` | composite Harness profile ArtifactRef | `sha256:H1` | harness config handler | execution-scoped Claude/Codex config roots | generated config hash、launch argv/env receipt、SessionRefs |
| `runtime.sandbox_policy` | local-demo sandbox policy ArtifactRef | `sha256:S1` | sandbox projection handler | bwrap mounts、network/process/resource limits | namespace/mount manifest、negative access probes、runtime receipt |
| `runtime.model_route`（optional） | model/provider route ArtifactRef | `sha256:M1` | Harness adapters | model config/env without secret values | requested config injected；native model confirmation if available，否则 unknown |

B1 不包含：数据库 schema、API 路径、LangGraph node、worker role、worktree strategy、ACP endpoint、Harness session ID 或测试失败脚本。前五项描述 E1 必须依据什么，后四项描述 Provider 必须为执行实现什么运行资源。

Human acceptance 只针对精确 P1/A1 digest。任何 dispatch 前变更产生新 Binding revision；D1 接受后 B1 永不修改。

# Provider-side Binding consumption model

Provider 不能靠自由 prompt 宣称“我会用这些资源”。Composite 插件拥有一个最小 binding consumer layer：

```text
BindingConsumerDescriptor
  provider_id
  consumer_version
  supported semantic matchers
  supported Ref types / pin schemes
  assurance: enforce | record | unsupported

BindingProjectionHandler
  match(slot summary) -> supported/unsupported
  preflight(bound slot) -> valid/invalid/unknown
  project(bound slot, execution runtime) -> projection receipt
  report_actual(receipt/runtime) -> resource facts
```

插件内部注册以下 handlers：

- workspace/worktree handler；
- immutable artifact materializer；
- ACP collaboration projector；
- Harness config projector；
- bubblewrap sandbox projector。

Core/Host 只消费 provider-neutral verdict、coverage、assurance 和 facts，不读取 handler schema。`semantic_id` 是 bounded canonical identifier，不是可执行 DSL；它只用于匹配已注册 handler。插件 payload 由 ArtifactRef 指向并由插件解释，不进入 Core columns。

最小流程：

1. Host 为 slots 选择 exact Refs/pins；
2. Provider descriptor 对每个 required semantic 声明可消费方式；
3. preflight 返回 valid/invalid/unknown；默认 fail closed；
4. Core 原子接受 `B1 + validation evidence + D1`；
5. Provider 从 D1 envelope 获得 binding ID/digest 和 bound slots；
6. handlers 生成 Provider-owned ProjectionPlan；
7. Provider 启动已经配置好的 supervisor/Harness；
8. handlers/运行时报告 actual facts；
9. Core 将 requested pins 与 actual pins派生比较为 conformant/divergent/unknown。

RefAuthority 与 ExecutionProvider 分离。Demo 只使用 exact local artifact hash 和 Git commit，可由 `LocalArtifactAuthority` 与 `GitWorkspaceAuthority` 解析；Core 不理解文件路径或 Git。完整多 Authority registry、moving selectors、secret rotation 和 approval verifier 不进入 8/25 scope。

# Runtime projection model

```text
Requested resources
→ resolve exact Ref/pin
→ freeze/canonicalize B1 digest
→ provider consumer preflight
→ atomic B1 acceptance + DispatchRequested
→ Dispatch starting
→ provider builds execution-scoped ProjectionPlan
→ materialize read-only inputs
→ create writable integration worktree
→ start ACP/config/sandbox resources
→ launch LangGraph supervisor already configured
→ Harness sessions execute
→ collect material refs/facts
→ atomic terminal projection + outputs
```

ProjectionPlan 是 Provider-owned runtime value，不是 Core BindingSlot DSL，也不持久化进 Core。它可包含实际 mount path、Unix socket、temporary config location、process argv、worktree path和 cleanup callbacks。

Provider 启动前生成一份不可变 `runtime-manifest.json` 作为 ArtifactRef，包含：

- binding ID/digest；
- projected slot keys；
- actual materialized ref/pin；
- mount/config hashes；
- workspace base commit；
- broker/profile identities；
- 不含 secret 的 launch receipts。

该 manifest 是证据，不是新的 Core entity。实际使用事实仍以 ExecutionResourceFact 表达。

# Requested vs actual resource evidence

## 完整证据链

| 阶段 | 权威记录 | 能回答的问题 |
|---|---|---|
| Requested | draft Binding slots / Human artifacts | 这次 Execution 想使用什么？ |
| Frozen | B1 digest + exact Refs/pins | Dispatch 的不可变输入依据是什么？ |
| Resolved | Authority/preflight evidence | 这些 pin 在 dispatch 前是否存在并可用？ |
| Projected | provider runtime manifest/receipts | Provider 实际把什么放进了运行环境？ |
| Harness-visible | mount/config/handshake/argv evidence | Harness 启动时能够访问什么？ |
| Consumed | actual resource facts | 哪些资源被读取、挂载、使用或无法证明？ |
| Compared | match/mismatch/unverifiable | actual 是否符合 B1？ |

## 可以强证明

- exact workspace 被创建并挂载；
- worktree base 和 final Git commit/tree；
- exact artifact 被 Provider 打开、读取并校验 hash；
- exact input file 被 materialized 到只读 mount；
- ACP endpoint/config 被注入且完成 handshake、实际有结构化 exchanges；
- execution-scoped Harness config 被生成，launch receipt 指向其 hash/path；
- bubblewrap mount/namespace policy 已应用，禁止路径的 probe 失败；
- deterministic test runner 在 exact commit 上运行并产生 report；
- Provider 自己读取/解析了 accepted artifacts。

## 只能 best-effort 或 unknown

- LLM 是否在推理中真正“理解并利用”了某段 accepted text；
- 某个 prompt 字段对最终代码的因果贡献；
- Harness 是否遵循了所有软性写作偏好；
- 仅通过 config 请求的 model 是否被上游真实采用，若 native response 无确认；
- 无 filesystem access attestation 时，文件“可见”是否等于被 Harness 进程读取；
- reviewer 的判断是否覆盖了所有潜在缺陷。

规则：不可证明时写 `disposition=unknown` 或 `comparison=unverifiable`，绝不把“投影成功”冒充“逻辑消费”。Binding conformance 可以是 unknown；Execution 仍可 succeeded；Work 仍由 Human 决定是否完成。

# Workspace / sandbox topology

```text
Agent-Box source repo
  └─ 对所有产品 Harness 不可见

Product base repo @ BASE
  ├─ investigator snapshot A (read-only)
  ├─ investigator snapshot B (read-only)
  └─ primary E1 integration worktree (single writer)
       ├─ Codex implementer (read-write)
       ├─ deterministic tests (source + bounded generated dirs)
       ├─ fixer continuation (same writer/session)
       └─ reviewer snapshot @ candidate commit (read-only)

Provider runtime root
  ├─ frozen inputs (read-only)
  ├─ generated Harness configs
  ├─ ACP socket/config
  ├─ temp/cache
  ├─ handoff artifacts
  └─ diagnostics (provider-owned, not Core telemetry)
```

关键规则：

- 产品 repo 在 E1 开始时没有应用代码，只允许 `.gitignore`/空初始 commit；工具链和依赖缓存可以预热，但不预置产品 scaffold；
- investigators 不写产品 workspace；
- 只有 primary implementer 写 integration worktree；
- tests 可以写独立 cache/build/temp 目录，不成为第二个代码 writer；
- reviewer 只读 candidate commit；
- 修复继续使用同一个 writer/worktree，避免 merge swarm；
- Agent-Box 自身 repo 和详细 PineCare 规格不投影给产品 Harness；
- network 默认限制为 LLM/Harness 必需 endpoint；产品运行与测试不依赖商业服务。

WorkspaceRef 由 workspace authority 基于 repo identity + exact base commit 生成。Provider 另外报告 execution-scoped worktree WorkspaceRef；terminal 时报告 final commit/tree pin。强证据来自 mount manifest、Git exact pin 和 sandbox probes，而不是 Agent 自述“我在正确目录工作”。

# Failure/fix loop

## 真实 failure

Testing worker从 accepted 原则“知识库不能支持时不得编造”生成 adversarial behavior test。测试使用 deterministic fake model：当 retrieval 只返回弱相关 Plus 会员政策时，fake model会给出听起来合理但无真实来源的家庭共享规则。

测试问题：

> Plus 会员可以共享给五个家庭成员吗？

初始 vertical slice 的常见缺陷是直接把 top-1 检索结果交给模型并展示输出，没有最低相关度 gate 或 citation/source validation。测试因此可靠暴露：

```text
retrieval: weakly related membership policy
model: fabricated family-sharing rule
expected: explicit unknown + escalation
actual: unsupported answer
result: grounded behavior test failed
```

测试并不在应用代码中植入 bug，也不把“必须先失败”写进 B1。它只是用独立 fake model稳定检查真实产品约束。若实现首次就正确通过，系统不得篡改结果；公开 Demo 可回放预演中真实发生过的 failure/fix。

## Fix loop

1. Test runner产生 machine-readable failure report；
2. supervisor 将 exact query、retrieval candidates、scores、model structured output和 citation list交给 implementer；
3. implementer判断问题位于 grounding boundary，而非文案；
4. 增加/调整最低相关度阈值；
5. 只允许本次 retrieval result中的 source IDs；
6. 没有受支持结论时强制 fallback；
7. 将问题加入 regression dataset；
8. 重跑 retrieval、behavior、API 与 E2E tests；
9. pass 后继续独立 review。

## Execution boundary

留在 E1 内部：编译错误、单元/集成/E2E失败、grounding test失败、reviewer在已接受范围内发现的阻断缺陷、同一 workspace 的证据驱动修复，以及 Provider 内部 checkpoint recovery。

创建新 Core Execution：E1 terminal 后 Human 改变产品意图/验收标准；E1 terminal/failed 后的显式 retry；需要改变 accepted Binding；或 continuation 使用新的 dispatch responsibility。

Core 不记录 `TestStepFailed`、fix iteration 或 LangGraph edge。可将 failure report ArtifactRef作为 material evidence附加 E1，但它不改变 Execution phase；E1直到最终 terminal 前保持 active。

# Human review

E1 terminal/succeeded 后，Host 提供“打开应用”操作。Human 使用固定的验收卡，但可以自由提问。

建议现场顺序：

1. “退款多久到账？”——验证 grounded answer/citation；
2. “我的订单已经发货了。”→“ORD-1001，那还能改地址吗？”——验证多轮+订单工具；
3. “Plus 会员能共享给五个人吗？”——验证 unknown/fallback；
4. 点击创建人工工单——验证 escalation；
5. “ORD-9999 到哪了？”——自然发现 dead-end；
6. 刷新——验证历史记录。

Review artifact 必须记录观察证据，不允许只写“UI 再好看一点”。本次反馈选定 unknown-order escalation，因为它跨越真实 UX、Agent behavior、backend response和测试边界，又足够小，适合独立 E2。

# E2 definition

## Objective

在不回归 E1 已通过行为的前提下，使 unknown-order flow 提供清晰的人工升级卡片，并将未知订单号预填进支持工单摘要。

## Binding B2

B2 是全新 frozen Binding，包含：

- `workspace.primary`：E1 final WorkspaceRef @ exact commit；
- `input.application_artifact`：E1 final application ArtifactRef；
- `input.test_report`：E1 passing TestReport ArtifactRef；
- `input.review_feedback`：Human ReviewFeedback ArtifactRef @ R1；
- `input.acceptance_criteria`：更新后的增量 criteria @ A2；
- `input.session_continuity`：可选 E1 implementer SessionRef；
- 新 execution-scoped collaboration/profile/sandbox resources。

## Expected changes

- backend 对 unknown-order 返回 typed escalation eligibility和订单摘要；
- frontend 展示明确 escalation card；
- ticket summary包含 `ORD-9999`；
- 新 API/behavior/frontend/E2E regression；
- E1 全量测试仍通过。

## Terminal condition

E2 通过增量验收、全量回归和 smoke；final refs/facts 原子关联 terminal/succeeded。E1 的 phase、outcome、Binding、facts、timestamps 永不改变。

# Session continuity demonstration

E1 implementer SessionRef 只表示 Provider-native context continuity：

```text
E1 --NATIVE--> SessionRef S_impl
E1 terminal/succeeded

E2 --INPUT--> SessionRef S_impl
E2 --Binding--> B2
E2 --Dispatch--> D2
```

Provider 在 dispatch 前验证 S_impl 仍可作为 continuation source。如果可用，Codex adapter用 native resume/continue 启动 E2；如果不可用，创建新 SessionRef，不影响 E2 identity。

即使复用 S_impl：

- E2 仍有新 execution ID；
- E2 有新 Binding B2 和 Dispatch D2；
- E2 使用从 E1 commit派生的新 execution-scoped worktree；
- E2 有新 WorkflowInstanceRef 和 ACP channel；
- E2 的 RunRefs、facts、outputs、outcome和timestamps独立；
- E1 永久 terminal。

SessionRef 不作为 Dispatch canonical correlation，除非 Provider 能证明它唯一定位本次 D2；Codex thread通常跨多个 Execution共享，因此不合格。Composite Provider可用 provider-owned WorkflowInstanceRef/RunRef作为 durable canonical correlation。

# Ref / Event / Fact timeline

| Seq | Core subject | Material record | 说明 |
|---:|---|---|---|
| 1 | W1 | `WorkCreated` | fuzzy objective，lifecycle=open |
| 2 | E0 | `ExecutionCreated`、B0 accepted、D0 requested | precise discovery responsibility |
| 3 | E0 | Workflow/Session refs（如实际产生） | 只记录 material native objects |
| 4 | E0 | ProductOptions ArtifactRef + `ExecutionTerminal(succeeded)` | terminal bundle原子接受 |
| 5 | W1 | `WorkDecisionRecorded(H1)` | 指向 accepted product/criteria artifacts |
| 6 | E1 | `ExecutionCreated` | provider=composite-product-builder |
| 7 | E1 | `BindingFrozen(B1)` | exact refs/pins + digest |
| 8 | E1/D1 | `BindingAcceptedForDispatch` + `ExecutionDispatchRequested` | 同事务冻结 responsibility basis |
| 9 | E1/D1 | Dispatch starting/started或honest weak disposition | canonical correlation按ADR处理 |
| 10 | E1 | WorkflowInstanceRef、Harness SessionRefs、WorkspaceRef | Provider observations/material ref commands |
| 11 | E1 | input ResourceFacts | projected/consumed/match/unknown evidence |
| 12 | E1 | FailureReport ArtifactRef | material defect evidence，不是新 Execution |
| 13 | E1 | Passing TestReport、ReviewReport、Application、final Workspace refs | material outputs |
| 14 | E1 | output ResourceFacts + terminal/succeeded | 与terminal observation原子接受 |
| 15 | W1 | `HumanReviewRecorded(H2)` | 指向 ReviewFeedback ArtifactRef；W1仍open |
| 16 | E2 | `ExecutionCreated`、B2 frozen/accepted、D2 requested | 新责任边界 |
| 17 | E2 | INPUT SessionRef S_impl | continuation context，不是E1 reopen |
| 18 | E2 | new WorkflowInstanceRef/WorkspaceRef/RunRefs | E2 native runtime |
| 19 | E2 | actual input/output facts、final artifacts、terminal/succeeded | 独立 conformance/outcome |
| 20 | W1 | `WorkCompleted` | Human显式验收完成 |

不记录 raw telemetry：token、ACP messages、日志行、heartbeat、每个 LangGraph node、每个测试进程 PID、stdout chunk、poll 无变化结果。

# Final audit view

最终 UI 应能在一个责任视图中回答：

```text
Work W1 — completed by Human
  objective: Build a useful small customer-support product
  evolution:
    seed brief
    → H1 accepted product direction
    → H2 accepted unknown-order improvement

  Execution E0 — terminal/succeeded
    responsibility: decision-ready discovery
    input: seed brief + constraints
    output: ProductOptions ArtifactRef

  Execution E1 — terminal/succeeded
    Dispatch D1
    accepted Binding B1 @ digest
    Provider: composite-product-builder
    canonical correlation: WorkflowInstanceRef/RunRef if durable
    native refs:
      WorkflowInstanceRef
      Claude SessionRefs
      Codex SessionRefs
      WorkspaceRef
    outputs:
      FailureReport ArtifactRef
      Passing TestReport ArtifactRef
      ReviewReport ArtifactRef
      Application ArtifactRef
      final WorkspaceRef @ commit
    binding conformance: conformant / unknown with per-slot evidence
    Work effect: none automatically

  Human Review H2
    ReviewFeedback ArtifactRef

  Execution E2 — terminal/succeeded
    Dispatch D2
    accepted Binding B2 @ digest
    inputs:
      E1 final workspace/artifacts
      review feedback
      optional continuation SessionRef
    outputs:
      final Application ArtifactRef
      passing TestReport ArtifactRef
      final WorkspaceRef @ new commit
    binding conformance: conformant / unknown

  WorkCompleted
    actor: Human/Host
    reason: accepted final product after live review
```

UI 默认展示上述 material view；Provider 详情页可以跳转诊断，但不把 raw LangGraph/ACP telemetry复制进 Core。

# Core Gap Ledger

“Current support”以 2026-08-23 当前源码和 ADR 实现计划为准；ADR 已冻结但尚未落地的能力明确标记为 pending。

| Demo requirement | Current support | Missing mechanism | Owner | Reason / decision |
|---|---|---|---|---|
| Work identity + explicit completion | 已有 Work lifecycle/service | 增加更清晰 UI/audit展示 | Core已有，Host展示 | provider-neutral且已实现 |
| 多 Execution 属于同一 Work | 已有模型/关系 | E0/E1/E2 Host commands/UI | Core已有，Host | 不需新实体 |
| Execution single-attempt、terminal不可逆 | ADR-0001/0005 已冻结，源码仍可 same-Execution resume/last-write覆盖 | 按ADR落地 new-Execution continuation与monotonic apply | Core | Demo前P0，不能由插件安全补救 |
| one Dispatch、starting/started、correlation | ADR-0002～0004 已冻结，源码仅requested | migration/CAS/digest/typed Provider/recovery | Core | Demo前P0，provider-neutral runtime safety |
| typed Refs和Execution ref graph | 已有五种 Ref及INPUT/OUTPUT/NATIVE关系 | versioned codec、atomic terminal bundle按ADR补齐 | Core | 已在ADR范围 |
| Material Events | 已有 bounded ledger | 增加 Binding/WorkDecision/HumanReview 等少量 material event types | Core | 通用审计边界，不建workflow |
| Frozen Execution Binding | 当前生产代码无；已有候选模型与28项压力测试 | 最小 `ExecutionBinding + slots + digest + accepted_binding_id`，accept与D1同事务 | **Core** | 同时满足五条准入：provider-neutral；插件不能保证全局唯一/原子；CI/local/composite均需；无Provider branch；不复制runtime |
| Requested vs actual consumption | 当前无 ExecutionResourceFact | 最小append-only ResourceFact与derived conformance | **Core** | outcome与actual责任审计跨Provider通用；插件自存无法形成统一audit |
| Full Binding approval/validation platform | 候选文档有设计，production无 | 8/25仅Human artifact digest + exact local pin preflight | Host/Plugin，full Core post-demo | Demo不需要RBAC、revocation、moving selector系统 |
| RefAuthority registry | production无，spike已验证 | 8/25只需LocalArtifact/GitWorkspace resolver；统一registry后置 | Plugin/extension first | exact local resources可安全独立解析；不要赶工膨胀Core |
| Provider binding semantic matching | production无 | plugin-owned consumer descriptor + projection handlers；Core只读generic coverage/verdict | Plugin | Provider最懂如何投影；不能把ACP/bwrap/config schema放Core |
| Runtime projection receipts | 无通用实现 | provider-owned runtime manifest + ResourceFacts/ArtifactRef | Plugin reports，Core records | Core不存ProjectionPlan |
| LangGraph workflow | 无，也不应有 | plugin-owned graph/checkpoint | Plugin | 删除后Core语义不变 |
| ACP collaboration | 既有ACP能力，但非Work Core | composite plugin ACP projector/lifecycle | Plugin | Core不新增ACP ontology |
| Workspace/worktree/sandbox | 已有launch/profile/project能力可复用 | composite provider adapters + exact evidence | Plugin/existing authorities | Core只记WorkspaceRef/facts |
| Human decision/review | Work completion已有，决策artifact链不足 | Host记录material event，artifact进入后续Binding | Host + minimal Core event | 不建Human workflow/RBAC |
| Session continuation E2 | ADR-0001已冻结，源码仍resume旧E | 创建E2 + INPUT SessionRef + B2/D2 | Core service + Provider native adapter | Demo前P0 |
| Composite Provider durable recovery | typed contract pending | provider-owned durable Workflow/Run correlation，或诚实weak | Plugin obeys Core ADR | 不把Session/PID伪装成durable |
| Work/Execution audit read model | CLI查询正在计划，完整UI无 | Host projection/API组合现有表与facts | Host/read model | 不新增audit aggregate |

8/25 只允许两个超出 ADR-0001～0005 的 Core 增量：**最小 frozen Binding** 和 **ExecutionResourceFact**。两者已有 provider-neutral 模型和多 Provider 压力证据。不得顺带实现完整 ApprovalDecision、Authority lifecycle、Binding revision UX、secret/environment治理或 contribution aggregate。

# Plugin responsibilities

- LangGraph graph、checkpoint、fan-out/fan-in和loop policy；
- internal worker roles、Harness选择和session topology；
- ACP broker、protocol、message和session lifecycle；
- Claude/Codex/Hermes native adapters；
- Binding semantic matcher与projection handlers；
- worktree创建/清理和single-writer enforcement；
- bubblewrap argv、mount、env、network和resource limits；
- Harness config生成、model/provider routing和secret resolution；
- product discovery prompts、implementation synthesis和review prompts；
- test runner、failure classification和fix loop；
- runtime manifest、diagnostics和material evidence提取；
- Provider-owned canonical correlation/recovery algorithm；
- 将 native state标准化为Observation、Refs和ResourceFacts。

插件不拥有 Work closure、Execution identity、accepted Binding唯一性、Dispatch state、Core projection或统一审计结论。

# Core responsibilities

- Work identity、objective evolution metadata和显式 closure；
- Execution identity、single-attempt责任、one-cycle timestamps和terminal monotonicity；
- 每个 Execution 至多一个 accepted Binding和一个 Dispatch；
- frozen Binding digest、exact slots和accept+dispatch原子边界；
- Dispatch requested/starting/started、submission digest和canonical correlation；
- Provider registry的provider-neutral runtime safety contract；
- normalized Observation/Projection及原子Refs/Facts/Event应用；
- SessionRef continuation作为新Execution input；
- material Ref/Event/ResourceFact persistence；
- requested vs actual的derived conformance；
- Work→Executions→Bindings→Refs/Facts/outputs的责任查询。

Core 永远不拥有 Agent、Worker、Role、DAG、ACP、MCP、sandbox、worktree、Harness config或Provider dependency ontology。

# Components rejected

| Rejected component | 原因 |
|---|---|
| Core `Agent/Worker/AgentRole` | Provider内部拓扑，不是跨Provider责任语义 |
| Core `WorkflowStep/DAG/LangGraphNode` | 复制workflow engine，破坏opaque Provider边界 |
| Core `ACPConnection/MCPServer/AgentMessage` | transport/config/message属于插件，Binding只持generic resource Ref |
| Core `SandboxConfig/WorktreeStrategy` | Provider projection mechanics，不是Execution input ontology |
| 多个并行 code writers | 小产品共享API/schema高度耦合，merge成本人为制造 |
| Hermes worker | 当前无独立职责；记忆由artifacts/session refs已满足 |
| 第三个以上 investigator | 不产生新的独立工作域，增加演示噪声 |
| 向量数据库/外部RAG服务 | 24级别本地知识无需重基础设施，且与六命题无关 |
| 真实订单/CRM/客服平台 | 外部风险和实现量大，不增强Work/Binding责任证明 |
| 完整Approval/RBAC系统 | Human decision artifact已满足Demo，RBAC会扩成平台项目 |
| 全量RefAuthority/secret/environment治理 | 压力模型重要，但非本产品Execution所需 |
| Raw telemetry复制到Core | Core ledger只记录material facts，不做日志/trace warehouse |
| 为每个test failure创建Execution | 测试循环是E1内部实现责任；只有新意图/新attempt才新Execution |
| Same-Execution resume | 违反ADR-0001和terminal不可逆 |
| 用prompt传workspace/ACP/config路径 | 无法冻结、强制、审计或比较actual，否定Binding价值 |

# Implementation complexity

整体复杂度为 **高，但来自真实责任边界**，不是组件数量。

主要工作域：

| Workstream | 难度 | 核心风险 |
|---|---:|---|
| ADR-0001～0005 production landing | 高 | Dispatch/Observation事务与现有行为迁移 |
| Minimal Binding + ResourceFact vertical slice | 高 | 不能把candidate模型一次性全搬进Core |
| Composite Provider orchestration | 中高 | graph termination、heterogeneous sessions、material evidence |
| Workspace/sandbox projection | 中 | exact pin、single writer、cleanup、可验证mount |
| Customer-support product build | 中 | frontend/backend/RAG/tool/persistence集成 |
| Deterministic behavior tests | 中 | 不依赖随机LLM，同时真实覆盖grounding |
| Agent-Box audit/read model | 中 | 把责任视图讲清楚而不展示raw telemetry |
| Public demo rehearsal | 高 | runtime时长、外部模型波动、回放真实性 |

真正的 critical path 是 Core operational spine + minimal Binding evidence，而不是 PineCare 应用本身。

# 8/25 feasibility

基于当前源码检查，Work/Execution/Ref/Event骨架已存在，但以下仍未在 production 落地：ADR-0001～0005 的关键修正、完整 Dispatch spine、frozen Binding、ExecutionResourceFact和composite Provider。因此：

> 从当前状态在两天内同时完成全部生产化机制、插件、产品和现场实时构建，风险极高；不能声称“稳妥可交付”。

达到本 Blueprint 的可行条件：

1. ADR-0001～0005 P0 在 8/24 上午前 green；
2. minimal Binding/ResourceFact 只从已验证 spike提取最窄 vertical slice；
3. 8/24 中午冻结 composite Provider拓扑，不再增加worker/tool；
4. 产品 workspace、依赖缓存、browser/test runtime预热，但不预置产品代码；
5. 8/24 完成至少一次真实 W1/E0/H1/E1/H2/E2 rehearsal并保留material audit；
6. 公开场次使用透明 real-run replay + live product验收；不赌现场从零构建必须在7分钟内完成；
7. ACP、LangGraph或任一Harness不稳定时按下面顺序裁剪，而不绕过Binding/Execution语义。

Go/no-go checkpoint：

- 如果 B1 无法在 Core 中 frozen并与D1原子接受：**No-go for differentiated claim**；
- 如果 actual facts只能由UI硬编码：**No-go**；
- 如果 E2仍通过resume旧E1实现：**No-go**；
- 如果只有应用未完成，可降低视觉细节；
- 如果只有ACP不稳定，可以安全删除ACP。

# Scope cuts if needed

按以下顺序裁剪：

1. 删除 Hermes；
2. 删除 ACP，改用 Provider-owned local subprocess RPC；
3. 从两个 investigator减为一个综合read-only investigator；
4. 删除 LangGraph依赖，保留plugin-owned最小确定性orchestrator；
5. 删除embedding、streaming、mobile polish和非关键UI动效；
6. E1只保留FAQ/citation、order lookup、fallback/ticket、history和核心tests；
7. 将完整E1/E2改为透明真实run replay，只保留产品现场运行；
8. audit UI降为清晰CLI/JSON+artifact links，但必须保留责任关系。

绝不裁剪：

- W1跨E0/E1/E2；
- H1和H2真实改变后续Binding；
- E1/E2各自frozen Binding和Dispatch；
- terminal不可逆与new-Execution continuation；
- requested vs actual evidence；
- hallucination behavior test及真实结果；
- E1 outcome不自动完成Work；
- Human显式WorkCompleted；
- Core不理解Provider内部拓扑。

# Final blueprint

最终推荐蓝图：

1. 创建模糊 Work W1，只保存 seed brief；
2. 用独立、只读、责任明确的 E0 产生三方向 ProductOptions；
3. Human 选择“FAQ + mock order + escalation”方向并写入产品偏好，形成accepted artifacts；
4. 创建 E1，将 accepted product/criteria、empty product workspace、knowledge seed、quality expectations、collaboration/profile/sandbox资源解析为 exact Refs/pins；
5. Core freeze B1，并与唯一 D1原子接受；
6. Composite Provider按plugin-owned handlers投影workspace、inputs、ACP、Harness config和bubblewrap；
7. LangGraph在插件内部并行运行两个read-only调查者，fan-in后交给唯一Codex writer；
8. 确定性tests暴露真实grounding flaw，E1内部完成evidence-based fix loop；
9. 独立只读reviewer通过后，Provider报告actual inputs/outputs、test/app/workspace artifacts，E1 terminal/succeeded；
10. W1保持open，Human现场运行产品；
11. Human发现unknown-order dead-end，保存ReviewFeedback ArtifactRef；
12. 创建E2和B2，以E1 exact outputs、review artifact、updated criteria和optional SessionRef为输入；
13. E2使用新Dispatch、新worktree、新workflow runtime完成改动与回归；E1永不改变；
14. Human复测并显式完成W1；
15. 最终audit view按W1展示E0/H1/E1/H2/E2、Bindings、Refs、Events、actual facts、outcomes、conformance和WorkCompleted。

这个设计的差异化不在 Agent 数量，而在它把真实项目中的模糊目标、Human决定、冻结输入、复杂执行、运行资源、实际证据、失败修复、终结后revision和显式完成放进同一条可审计责任链，同时保持Core provider-neutral。

# Verdict

**C. STRONG DIFFERENTIATED DEMO BLUEPRINT**

成立条件是：公开 Demo 必须真实实现 minimal frozen Binding、actual ResourceFacts和new-Execution continuation；如果这三项只做成演示页面或prompt约定，Verdict将立即降为 A。复杂度不能通过给Core加入Provider-specific ontology补足。
