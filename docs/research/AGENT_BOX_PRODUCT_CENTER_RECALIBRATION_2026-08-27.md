# Executive verdict

本研究的结论是 **B：需要少量语义修正后聚焦 Demo**。Agent-Box 不应成为 LangGraph、Temporal 或 Prefect 的 workflow runtime；它的辨识度应来自 **跨 authority 的 Execution accountability 与 resource composition**：在 Dispatch 前把 Git、workspace、harness、terminal、credential reference、CI、collaboration 和可选 workflow context 组成一次可验证、可归责的执行合同，Dispatch 后把 native facts 和 evidence 对账回来。

LangGraph/Temporal 已经把“未来如何推进”做得很强。Agent-Box 不应竞争 `what runs next`，而应治理“这一次执行以什么冻结依据被授权、由谁接受、实际发生了什么、产物和证据如何回到后续决策”。

一句话定位：

> Agent-Box is a cross-system execution accountability layer: it composes and freezes external resources into an accountable Execution, dispatches it to a capable provider, and reconciles intended bindings with observed evidence.

口语化宣传句：

> 工作流决定接下来可能做什么；Agent-Box 负责证明这一次到底交给谁、凭什么、用了什么、发生了什么。

## Responsibility boundary

### A. Workflow progression governance

包括：下一步计算、routing、graph state、retry、scheduler、timer、checkpoint、fan-out/fan-in 和 workflow-level human gate。

LangGraph、Temporal、Prefect 正是这些能力的主要拥有者。LangGraph 以 Thread/Checkpoint 保存 graph state，并支持 interrupt、resume、history、fork 和动态 routing；Temporal 以 Workflow Execution/Event History 提供 durable replay、timer、signal、activity 和 retry；Prefect 以 Flow/Task Run、state、deployment、work pool 和 scheduler 管理 pipeline execution。[LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence)、[Temporal Workflow Execution](https://docs.temporal.io/workflow-execution)、[Prefect flows](https://docs.prefect.io/v3/concepts/flows)

这些系统可以把 goal、decision、artifact ref 和 resource ref 放进自己的 state，也可以决定未来启动哪个 agent 或 job。但这不意味着它们拥有 Agent-Box 的产品级责任语义。

### B. Execution accountability governance

这是 Agent-Box 的主战场：

- 这一次责任尝试是什么；
- 它基于哪些 frozen inputs 启动；
- 谁/哪个 accountable ExecutionProvider 接受了 Dispatch；
- native run/session 如何关联、恢复和结束；
- 实际执行投影了什么状态；
- 事实来自哪个 authority、覆盖范围是什么；
- outputs/evidence 如何供 Human/Host 做下一次决定。

`Run`、`Task`、`Job` 或 `Session` 只能提供 native identity；Agent-Box 的 Execution 是跨系统治理记录。它不能假定一个 LangGraph Run、Temporal Run、GitHub Job 或 harness session 自动就是自己的 Execution。

### C. Resource composition / authority governance

Agent-Box 的第二个主战场是把异构外部对象组成一个有边界的 execution input：

```text
source revision
workspace/worktree
terminal pane
harness profile
credential reference
MCP/collaboration endpoint
workflow Thread/Checkpoint
CI run / review artifact
```

每个外部对象都有自己的 authority。Agent-Box 不拥有这些对象，而是要求 adapter 在 Dispatch 前完成：

```text
resolve → validate → freeze → project → attest
```

LangGraph runtime context 可以把数据库连接、用户 ID、model name 和 API client 注入 node；这解决的是 dependency injection，而不是跨 authority 的 governed binding。[LangGraph context](https://docs.langchain.com/oss/python/concepts/context)、[LangGraph graph API](https://docs.langchain.com/oss/python/langgraph/graph-api)

### 主站位

Agent-Box 应主要站在 **B + C**，并把 A 作为可选 external authority。A 不进入 Core；B/C 是 Agent-Box 的产品语义。

## Competitive overlap analysis

| 系统 | 它主要拥有 | 与 Agent-Box 的重叠 | Agent-Box 不应复制的部分 |
|---|---|---|---|
| LangGraph | graph、Thread、Run、Checkpoint、state、interrupt、routing、Send、Store | context、run、暂停、动态并行 | graph progression、checkpoint machine、内部 worker lifecycle |
| Temporal | durable Workflow Execution、Event History、Activity、timer、signal、retry、worker | execution history、long-running、durability | workflow scheduler、replay、activity retry、workflow ID semantics |
| Prefect | Flow/Task Run、state、deployment、work pool、worker、schedule、artifact | provider/infrastructure metadata、run facts | flow/task orchestration、queue、schedule、retry、infra provisioning |
| GitHub Actions | workflow/job/runner、environment approval、secrets、artifacts、run/attempt | CI RunRef、artifact/evidence、environment facts | CI workflow/job scheduler、runner lifecycle、deployment gate |
| Codex/Claude Code/Pi harness | native session、prompt/tool loop、terminal、permissions、resume | SessionRef、native facts、profile/resource projection | harness conversation loop、tool protocol、native session authority |
| agent orchestration products | agents、handoff、tools、teams、manager loop、parallel calls | role/agent composition、external run references | supervisor loop、agent topology、automatic delegation |
| Agent-Box | Work、Execution、Binding、Dispatch、Ref、Evidence、Provider | — | — |

### 如果已有 workflow engine，为什么还需要 Agent-Box？

因为 workflow engine 通常回答：

```text
下一步运行什么？如何等待？如何重试？如何恢复状态？
```

而 Agent-Box 回答：

```text
这次执行到底承诺了什么？谁接受了？使用了哪些精确资源？
哪些事实已被外部 authority 证明？哪些仍然 unknown？
```

一个 LangGraph node 可以读取 `workspace=/repo-a`；一个 Agent-Box Binding 还要记录它解析到哪个 commit、哪个 worktree、哪些权限、哪个 provider、是否冻结、由谁批准，以及执行后是否真的写入了预期位置。

### 如果只有 Agent-Box，没有 workflow engine，它仍解决什么？

仍然能管理一类经常被 workflow runtime 忽略的工作：

- 用户直接启动一次 harness 执行；
- 人工修改后再启动新的 continuation Execution；
- 通过 Git、CI、terminal、workspace 和 credential refs 组成一次执行；
- 对 provider 声称的状态进行 observation/read-back；
- 将成功、失败、partial、unknown、unverifiable 的事实归档；
- 保持 Work open，直到 Human 根据证据明确完成。

这不要求任何 DAG。

### 最容易被误解成什么？

当前故事最容易被误解成四种东西：

1. workflow builder；
2. tmux launcher；
3. DeepSeek profile/config manager；
4. multi-agent supervisor。

这些都不是正确中心。tmux、DeepSeek、LangGraph、GitHub Actions 应作为证明跨 authority 组合的真实素材，而不是产品主角。

### 加入什么会退化成弱 workflow engine？

Preview 不应加入：

- Core DAG/Node/Edge/WorkflowStep；
- Core next-step calculation；
- scheduler/timer/queue；
- generic retry state machine；
- workflow checkpoint mirror；
- agent supervisor；
- 用 Send worker 数量替代 Agent-Box Execution；
- Provider terminal 自动 complete Work。

### Agent-Box 应特别做好的能力

- exact external refs，而不是自由文本描述；
- Dispatch 前 binding freeze；
- provider capability/assurance 声明；
- 多资源、多 authority 的一次性组合；
- input digest 与 idempotent Dispatch；
- native identity 与 Agent-Box identity 的显式关联；
- expected binding 与 actual Evidence 的对账；
- coverage/authority/method/timestamp；
- 失败、partial、unknown、unverifiable 的诚实投影；
- native session continuation 形成新 Execution；
- provider terminal 不自动完成 Work；
- Work 历史记录已经发生的事实，同时保留未来决策开放。

## Refined product thesis

### Binding + Dispatch + Evidence 为什么不是普通 workflow run record？

普通 workflow run record 往往记录：

```text
run started → task running → run succeeded
```

Agent-Box 要记录的闭环是：

```text
requested resource
  → exact resolved Ref
  → frozen Binding
  → accepted Dispatch
  → native run/session
  → observed facts
  → output/evidence reconciliation
```

它的价值在于约束与事实之间的闭合，而不是再增加一个状态字段。

### 为什么同一个 native Session continuation 必须是新 Execution？

因为 session continuity 和 responsibility continuity 不是同一个东西。

```text
E1：第一次责任尝试，基于 Binding B1
S1：native session 仍可继续
E2：新的责任尝试，基于 Binding B2，继续使用 S1
```

E1 已经承担并结束了自己的责任。E2 可能加入了 review、CI failure、新 checkpoint、新 worktree 或新约束。如果重新打开 E1，历史责任会被改写，Binding 和 Evidence 的时间边界会消失。

### 为什么 provider terminal 不应自动 complete Work？

Provider 只能证明：

```text
它自己的 native execution 已经 terminal
```

它不能证明：

```text
Work 的总目标已经满足
所有约束已满足
review/CI/人工验收已经完成
没有 unresolved unknown
```

因此 Work completion 必须是 Human/Host 的显式治理动作。

### 为什么 Work 历史是事实，未来仍是开放决策？

Work 应保存：

```text
已经创建的 Execution
已经冻结的 Binding
已经接受的 Dispatch
已经发生的 Evidence
已经产生的 Artifact
人工决策及其原因
```

它不应保存一个自动计算的“未来 DAG”。下一步可以由 Human、LangGraph、Temporal、CI 事件或 Host 决定；Agent-Box 只在决定实际创建下一次 Execution 时记录新的事实。

## What Agent-Box uniquely governs

Agent-Box 的独特对象关系应是：

```text
Work objective
    │
    ├── Execution E1
    │     ├── Binding B1: Git C1 + Worktree W1 + Pi Profile P1
    │     ├── Dispatch D1: accepted by Provider P
    │     ├── Native Session S1
    │     └── Evidence: commit/test/session facts
    │
    ├── Execution E2
    │     ├── Binding B2: C2 + read-only W2 + reviewer profile
    │     └── Evidence: review result
    │
    └── Human decides whether Work is complete
```

其中 LangGraph 可以额外提供：

```text
Thread T / Checkpoint C2 / context snapshot A2
```

但 T/C2 是 Binding 的外部输入，不是 Agent-Box 的 workflow state。

## What it explicitly does not govern

Agent-Box 不拥有：

- workflow topology；
- graph node/edge；
- future routing；
- workflow retry/scheduler/timer；
- LangGraph checkpoint state machine；
- Temporal event history/replay；
- GitHub Actions job scheduling；
- harness conversation/tool loop；
- tmux server/pane lifecycle；
- Git repository commit authority；
- credential secret value；
- tracing backend；
- generic sandbox platform。

它只保存通用 Ref、Binding slots、Artifact locator/digest、Provider facts 和 Host decisions。

## Preview focus recommendation

### 主角应该是什么？

主角应是：

> 同一个 Work 如何在多个真实外部系统之间，形成多次独立、可归责、可验证的 Execution。

DeepSeek Harness 只是被开发的目标；Codex、Pi、Git、tmux、CI、bwrap、LangGraph、collaboration gateway 是参与证明的外部 authority。

### LangGraph 的地位

选择：**有价值但低调出现的 external authority**。

它不应作为本次 Preview 的主角，也不应移除。它最适合承担一个清晰镜头：

```text
Thread T / Checkpoint C1
  → Host 更新 workflow context
Thread T / Checkpoint C2
  → Agent-Box 为下一次 Execution 冻结 C2 snapshot
```

观众看见它提供真实上下文连续性，但不会误以为 Agent-Box 在画 LangGraph。

### 最能证明不可替代性的三个镜头

1. **Binding freeze**：一个 Execution 同时绑定 exact Git revision/worktree、Pi/DeepSeek profile、MCP/plugin refs、credential ref、terminal resource，以及可选 LangGraph T/C2；所有输入从 requested 变成 resolved/frozen，并有 digest。
2. **Accountable continuation**：E1 的 native session S1 继续使用，但 Host 创建 E2、新 Binding、新 Dispatch；UI 明确显示 E1 terminal、E2 active，绝不显示“resume old E1”。
3. **Expected vs actual evidence**：Git/CI/Harness/terminal/workflow facts 分别显示 authority、method、coverage；provider terminal 不等于 Work complete，Human 最后显式完成 Work。

### 会误导观众的镜头

- LangGraph node canvas 全屏展示；
- 四个隐藏 Send worker 被包装成四个“agent”；
- tmux pane 数量成为主要视觉焦点；
- 只展示 DeepSeek 配置表单；
- 自动从一个 terminal 结束跳到下一个 Execution；
- 自动 retry 或 workflow complete；
- 显示所有资源都 `used=true`，却没有实际 observation；
- 预先画出未来 E1→E2→E3 DAG。

### 3–6 分钟叙事

```text
0:00–0:35  用户创建长期目标 Work；页面显示当前没有未来 Execution 计划。
0:35–1:20  Host 组装第一次 Binding：Git exact revision、worktree、Pi/DeepSeek profile、MCP/plugin/credential refs、terminal；用户 Freeze & Dispatch。
1:20–2:00  E1 真实运行；用户看到 native session 与实际输出，但 terminal 结束不自动关闭 Work。
2:00–2:45  打开 Binding/Evidence：expected 与 actual 分离，展示 Git、session、runtime、配置和覆盖范围。
2:45–3:25  LangGraph 低调出现：同一 Thread 的 C1→C2 context revision；Host 只根据当前事实提出下一次可能 Execution。
3:25–4:20  用户显式创建独立 review/CI/repair Execution；展示新 Binding、新 Dispatch、可共享但 exact 的上下文/产物。
4:20–5:20  review/CI 结果回到 Evidence；一个失败不被自动吞掉；用户决定是否继续。
5:20–5:50  所有当前 Execution terminal，但 Work 仍 Open；Human 查看证据并显式 Complete Work。
```

WorkBoard 应突出：objective、当前 Execution、Dispatch state、Binding frozen count、native refs、Evidence coverage、outputs、unknowns 和明确操作 `New Execution / View Binding / View Evidence / Complete Work`。它不应显示可编辑 graph canvas、自动 next-step 列表或 supervisor topology。

## LangGraph integration recommendation

### Mode A — 普通 Execution，无 workflow resource

```text
Work → Agent-Box Execution → Binding(resources) → Dispatch → Provider
```

- 下一步由 Human/Host 决定；没有 LangGraph。
- Binding 只包含 Git/workspace/harness/credential/MCP 等必要 refs。
- 不进入 Core：graph/state/checkpoint/routing。
- Evidence：Provider native run/session、workspace、Git、runtime facts。
- Preview：默认路径，证明 Agent-Box 不依附 workflow。

### Mode B — Execution 读取并绑定外部 workflow context

```text
LangGraph Thread T + exact Checkpoint C
        ↓ Host adapter freeze
immutable context Artifact A
        ↓
Agent-Box Binding(T, C, A, other resources)
```

- 下一步仍由 Human/Host 决定是否创建 Agent-Box Execution；LangGraph 只拥有自己的 context progression。
- Binding 进入：WorkflowInstanceRef/ThreadRef、exact WorkflowRevisionRef/CheckpointRef、immutable context ArtifactRef。
- 绝不能进入 Core：完整 LangGraph state schema、DAG、node/edge、routing engine、checkpoint state machine。
- Evidence：checkpoint locator、graph/assistant version、snapshot digest、read timestamp、native state query result、coverage/unknown。
- Preview：推荐路径，尤其是 Work 当前确实受外部 workflow context 驱动时。

### Mode C — 外部 workflow run 作为 Provider 负责的执行

```text
Agent-Box Execution
  └── LangGraphExecutionProvider → Thread/Run/Checkpoint
```

- 下一步由 LangGraph workflow 自己决定；Agent-Box 不接管 graph progression。
- Binding：workflow definition/graph ref、ThreadRef、必要时 exact CheckpointRef/context snapshot。
- `RunRef` 可作为 Provider-owned native correlation；不成为 Execution identity 的替代品。
- Core 不保存 workflow state mirror；Provider adapter 保存 native details，Core 保存 refs/evidence/projection。
- Preview：只在确实要把一次外部 workflow run 当作可归责的 Execution 时使用，不作为默认。

### 是否每个 Execution 都绑定 LangGraph？

否。强制绑定会让普通 direct harness、人工动作和 CI 验证被迫创建无意义的 Thread，Agent-Box 也会变成 LangGraph 的 wrapper。

### 四个并行 Pi 怎么做？

Preview 推荐四个独立 Agent-Box Execution，由 Host 创建：

```text
T/C2 context
  ├── E1 Pi review
  ├── E2 Pi test
  ├── E3 Pi document
  └── E4 Pi observe
```

LangGraph `Send` 只适合 graph 内部 worker。只有当某个 worker 需要独立责任、独立 retry、独立 workspace、独立 approval 和用户可见 lifecycle 时，才升级为 Agent-Box Execution。

## Core impact assessment

### KEEP — 强化而不是扩张

- **Work**：长期目标和显式 Human completion；不要承载 workflow state。
- **Execution**：一次独立、可归责的责任尝试；native continuation 必须产生新 Execution。
- **Binding**：Dispatch 前冻结的输入合同，而不是运行时配置快照的随意集合。
- **Dispatch**：正式把责任提交给 accountable ExecutionProvider，具备 idempotency 和 accepted/rejected 事实。
- **Ref**：external identity，不能把 native ID 冒充 Core identity。
- **Evidence/Observation/ResourceFact**：区分 provider self-report、authority read-back、Host observation、unknown/unverifiable。
- **Provider**：声明 capability 和 assurance；不自动决定 Work 完成。

### ADD — 只建议最小语义补强

不建议新增 workflow entity。若当前契约尚未完整表达，最多补强以下通用语义：

1. **Binding slot provenance**：每个 frozen input 保留 requested selector、exact Ref、resolver/provider、resolved-at、digest/assurance。真实反例：用户选 `HEAD`，Dispatch 后 HEAD 改变；没有 exact provenance 就无法证明 E1 用的是哪次提交。
2. **Execution-level native correlation**：允许一个 Execution 关联多个 provider-owned native refs，并标记 primary/continuation/input/output 关系。真实反例：一个 accountable team Execution 包含一个 Codex session、两个 ACP participant sessions 和一个 collaboration event range。
3. **Evidence coverage/authority/method**：让 Evidence 诚实表达 partial、unknown、unverifiable。真实反例：Harness profile 声称加载了 plugin，但没有独立 observation；不能显示为 verified。
4. **Continuation provenance**：新 Execution 明确引用旧 Execution 的 SessionRef/ArtifactRef，而不是恢复旧 Execution。真实反例：E1 terminal 后用相同 native session 进行 repair。

这些都可以用现有 Ref、Binding slot、Artifact 和 Provider-owned adapter 表达时，不应新增 Core entity。

### PLUGIN/HOST — 留在外部

- LangGraph/Temporal/Prefect adapter；
- workflow context freeze 和 snapshot projection；
- node/edge/routing/fan-out；
- Git/CI/terminal/harness/collaboration resource resolution；
- secret materialization；
- sandbox/bwrap/credential broker；
- retry/scheduler/timer；
- native session resume；
- WorkBoard 的 selector、preview、observation 和操作编排；
- artifact body、raw transcript、raw checkpoint payload；
- Host 决定是否创建下一次 Execution。

### REMOVE/DEFER — Preview 不做

- LangGraph ResourceProvider 作为当前 Preview 主线；
- Core workflow mirror；
- generic workflow canvas；
- automatic supervisor/agent team engine；
- generic sandbox platform；
- automatic retry/route/complete；
- 为了展示而伪造完整 Evidence；
- 把所有并行内部 worker 映射成 Agent-Box Execution。

## Risks of the current story

1. **“Work”过宽**：如果 Work 只是 refs 的容器，观众会问为什么不直接用 LangGraph Thread 或 GitHub Issue。必须突出 completion boundary、reopen、human decision 和 cross-runtime evidence。
2. **Binding 视觉过密**：资源数量很多时，Demo 会像表单或配置管理器。只展示三条主证据，其他资源进详情页。
3. **LangGraph 镜头过强**：画出 graph 就会抢走产品主角。只展示 T/C1→T/C2 与 snapshot freeze。
4. **Execution 与 Run 混淆**：必须在 UI 和文档中同时展示 Agent-Box Execution ID 与 native Run/Session ID。
5. **“多 Agent”叙事太弱**：数量不是责任边界。四个独立 Pi 必须有不同 Binding、责任、artifact/evidence 和可单独控制的 lifecycle。
6. **Evidence 过度声称**：provider self-report、read-back 和 unknown 必须分层，否则 Binding 的可信度会被 Demo 破坏。
7. **跨重启/持久化误解**：外部 runtime 的 local dev persistence 不能自动成为 Agent-Box 的 durable guarantee；只能记录 native capability/observation。

## Concrete next actions

### 接下来两周停止

1. 停止为 Agent-Box Core 添加 DAG、Node、Edge、routing、scheduler、retry、checkpoint mirror。
2. 停止把 LangGraph/Send worker、harness session、terminal pane 直接映射为 Agent-Box Execution。
3. 停止扩张 Provider 数量和 Demo 镜头数量，除非它们能证明一个新的 Binding/Evidence/accountability 断点。

### 接下来两周推进

1. **重写 Preview acceptance story**：围绕三个 hero moment——Binding freeze、new Execution continuation、expected-vs-actual Evidence——删掉 workflow-builder 视觉。
2. **审计并冻结 Binding/Evidence 语义**：确认 requested→exact→frozen、provider assurance、native correlation、coverage/unknown 和 continuation provenance 都能诚实表达；优先复用现有 Core。
3. **做一次跨 authority 的真实 Preview vertical slice**：一个 Work、一次 Pi/DeepSeek Execution、一个 Git/worktree、一个 CI/ref、一个可选 LangGraph T/C snapshot，证明 Host 只创建下一次 Execution，不自动推进 workflow。

### Preview 验收问题

演示结束时，观众应该能够回答：

```text
这次 Execution 的责任是什么？
它基于哪一版 Git/workflow/context 启动？
谁接受了 Dispatch？
native session/run 是什么？
实际发生了什么？哪些仍然未知？
为什么下一次 Execution 是新的？
为什么 Work 还需要 Human 完成？
```

如果观众只记住“有四个 agent、一个 LangGraph、几个 tmux pane”，则 Demo 失败。

## Final decision

**选择 B：少量语义修正后聚焦 Demo。** 不需要推翻 Work/Execution/Binding/Dispatch/Ref/Provider/Evidence Core；需要把它明确收缩为跨系统 Execution accountability layer，并把任何 workflow runtime 作为可选外部 authority。

- Agent-Box 一句话定位：**冻结跨系统资源和上下文，提交一次可归责 Execution，并用跨 authority Evidence 对账实际发生的事实。**
- Preview 三个关键镜头：**Binding freeze；native continuation 生成新 Execution；expected/actual Evidence 对账与 Human completion。**
- LangGraph 地位：**有价值但低调出现的 external authority**，用于 Thread/Checkpoint context binding，不做主角。
- 不强制每个 Execution 绑定 LangGraph；A 是默认，B 是外部 workflow 驱动时的推荐，C 是显式 external workflow-run provider 场景。
- 四个 Pi：由 Host 创建四个独立 Agent-Box Execution；LangGraph Send 只保留给内部 worker。
- 当前不应开始 LangGraph ResourceProvider 实现；先冻结 binding/evidence/continuation 语义，再做最小 Host-side workflow context adapter。

## Sources

- [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence)
- [LangGraph context](https://docs.langchain.com/oss/python/concepts/context)
- [LangGraph graph API](https://docs.langchain.com/oss/python/langgraph/graph-api)
- [Temporal Workflow Execution](https://docs.temporal.io/workflow-execution)
- [Prefect flows](https://docs.prefect.io/v3/concepts/flows)
- [Prefect work pools](https://docs.prefect.io/v3/concepts/work-pools)
- [GitHub Actions workflow artifacts](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts)
- [GitHub Actions environments and approvals](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)
- [OpenAI Agents SDK durable execution integrations](https://openai.github.io/openai-agents-python/running_agents/)
- [OpenAI Agents SDK HITL](https://openai.github.io/openai-agents-python/human_in_the_loop/)
- [VS Code agent sessions and handoff](https://code.visualstudio.com/docs/agents/concepts/sessions)
