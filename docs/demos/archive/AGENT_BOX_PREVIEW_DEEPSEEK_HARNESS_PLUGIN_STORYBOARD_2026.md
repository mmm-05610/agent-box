# Executive verdict
>
> Historical record — describes an earlier architecture or validation state and is not current implementation guidance.

> 文档导航：[总目录](../README.md)
> 状态：**当前 Preview Demo 基准题材与实施反推文档**
> 日期：2026-08-24

新的 Demo 题材应当采用。它比账单分摊小工具更直接地暴露 Agent-Box 的核心价值：一次 Execution 需要同时冻结代码、外部 workflow revision、Harness profile、session-local 配置规则、共享 capability 引用、credential 引用、runtime policy、review/CI 输入，并在结束时对这些预期与实际 materialization 做跨系统对账。

最终判断是：

> **A. FREEZE MODEL AND BUILD**

新题材没有产生需要重开 Core ontology 的反例。当前真正的阻碍是已知核心语义尚未产品化：Production Binding、freeze、Dispatch 原子边界、Evidence/ExecutionResourceFact、显式 Finish，以及“continuation 创建新 Execution”尚未贯通。它们是实现缺口，不是增加 WorkController、WorkflowStep、Agent、Participant 或 Message 等实体的理由。

本 Demo 的一句话叙事是：

> 用户为当前责任选择代码、workflow、配置、共享能力和执行工具；Agent-Box 冻结依据、组装真实运行环境、允许持续交互，并在结束时证明实际发生了什么。

## 本文证据边界

本文不重新做市场选型，继承[上一轮真实 Provider 验证](../validation/AGENT_BOX_PREVIEW_REAL_PROVIDER_INTEGRATION_AND_DEMO_STORYBOARD_2026.md)的结果。为确定 Author Harness，仅补做了窄范围本机检查：

- Claude Code `2.1.241`、OpenCode `1.18.21`、Hermes Agent `0.19.0`、DSH `0.1.0-rc.6`、Codex CLI `0.149.0` 均存在；
- OpenCode 本机 CLI 明确提供 project/cwd、`--session`、`--continue`、`--fork`、交互模式、session export 和原生 ACP server；
- `demo-opencode` 和 `demo-hermes` 均已使用不污染原 profile 的可写临时副本完成真实模型验证；
- OpenCode fresh、same-ID resume、visible TUI attach 和第三轮交互已 E2E；原 profile 的 provider projection 仍有结构漂移，详见下节；
- Hermes CLI fresh/same-ID resume 和 bwrap 内 ACP fresh session/prompt 已 E2E；TUI 请求稳定性及 ACP load 后继续存在限制；
- Agent-Box 已有 OpenCode/Hermes config profile 投影和 MCP/ACP 适配基础；
- DSH 已安装，但本机尚无可启动的 `tui`/`headless` profile；它是被开发和验证的 target runtime，不是当前最稳的 Author；
- Codex App Server 的 thread/turn/steer/recovery/结构化输出已在上一轮 E2E 验证；Codex CLI 与 App Server 的 thread/resume 能力也有[官方接口说明](https://developers.openai.com/codex/app-server/)支持。

因此，拍摄主路径选择 **Codex Interactive Author Provider**。OpenCode 承担 E0 read-only investigation，Hermes 承担 E4 的 fresh ACP session-isolation participant；Codex 继续承担结构化 Reviewer 和团队中的其余 participant。Claude 和 DSH 不作为开发 Harness 进入主路径。

## 追加 Harness 实测：demo-opencode 与 demo-hermes

所有写入和模型 session 都发生在 `/tmp` 中的 profile 副本；用户创建的 `/home/maoqh/.agent-box/profiles/demo-*` 没有被修改。状态是按具体责任能力判断，不把一个总状态强行覆盖所有入口。

| 能力 | `demo-opencode` | `demo-hermes` |
|---|---|---|
| Agent-Box profile resolve | LOCAL VERIFIED：config + 独立 data store 均存在 | LOCAL VERIFIED：config + 独立 state/session store 均存在 |
| bwrap cwd/config projection | LOCAL VERIFIED：config → `~/.config/opencode`，data → `~/.local/share/opencode` | LOCAL VERIFIED：profile → `~/.hermes` |
| fresh native session | E2E：`ses_fcc30e895ffe7gxTo3s7bIbI6P` | E2E：`20260824_204806_c5e22b` |
| native resume | E2E：same ID，返回 `RESUME_OK` | E2E：same ID，明确报告 resumed history并返回 `HERMES_RESUME_OK` |
| visible interactive TUI | E2E：resume同一session，第三轮返回 `INTERACTIVE_OK`，clean exit打印恢复命令 | PARTIAL：TUI成功attach并重放history，但第三轮请求超过90秒无结果，需两次Ctrl-C退出 |
| ACP fresh prompt | E2E（direct XDG profile projection）：`ses_fcc2a4fafffeHjhZh04L6u7zh9` | E2E（Agent-Box bwrap）：`0a4ef62b-3829-46bf-b889-1880ccbe04f8`，返回 `HERMES_BWRAP_ACP_OK` |
| ACP under Agent-Box bwrap | PARTIAL：initialize/new成功，prompt 90秒无chunk；acpx外层bwrap还触发Bun `SIGILL/SIGSEGV` | READY for fresh participant：initialize/new/prompt/end_turn成功；`hermes acp --check`通过 |
| ACP continuation | 未作为Preview能力通过 | NOT READY：`session/load`成功，但后续prompt稳定返回 `stopReason=refusal` |

OpenCode 首次使用原 `demo-opencode` projection 调用时创建了 `ses_fcc31e38affeFqx3n95FGNPJxd`，但错误为 `"undefined/chat/completions" cannot be parsed as a URL`，同时进程 exit code 仍为 0。只在临时副本中把 provider 恢复为当前 OpenCode 所需的 `npm + options.baseURL/options.apiKey` 结构后，模型、resume和TUI才全部成功。这给出两个 adapter 约束：

1. OpenCode projector 必须版本化修复，不能继续把 `baseURL/apiKey` 平铺在 provider 根层；
2. ExecutionProvider 必须解析 native error event，不能用 process exit code 0 推断成功。

另有一个必须在录制前修复的本机安全问题：原 `demo-opencode/dot-opencode-data/auth.json` 以及两个 profile 目录当前是 world-writable (`0777`)。凭证文件至少应收紧到 owner-only，并把权限事实纳入 profile preflight；文档不记录任何 credential value。

Hermes 的结论也必须限定：fresh CLI、CLI resume 和 fresh ACP participant 可用，但它当前不适合作为主 interactive Author，也不能承诺 ACP continuation。TUI 还显示当前安装方式将不再获得上游支持的警告，因此录制环境应固定并预检版本，不在现场升级。

# New Demo topic assessment

被开发的产品是：

> **DeepSeek Harness Multi-Session Config Plugin**

它解决同一 DSH runtime 内的三个边界：

1. Session A/B/C 各自拥有 session-local config，修改和生命周期互不污染；
2. MCP registry、plugin set 和 credential source 等能力由引用和共享 materialization 提供，而不是复制进每个 session；
3. 并发启动、restart 和 native session continuation 后仍保持隔离与共享不变量。

初始 Work 只写：

> 给 DeepSeek Harness 做一个多会话配置插件：不同会话需要独立配置，但 MCP、插件和凭证这类外部能力应该可以共享。

它不预先规定 overlay、copy-on-write、进程隔离、目录布局、锁策略或 reload 语义。第一步是 bounded investigation Execution，因为调查会启动真实 Harness、读取目标 runtime、产生可审计 artifact，并且有独立责任和 terminal output。Human 根据该 artifact 做 H1；它不是无责任边界的 Host research，也不需要为凑数量继续拆分。

# Why this topic is stronger/weaker than previous toy app

## 更强的部分

| 维度 | 新题材的优势 |
|---|---|
| Binding 必要性 | session-local config、共享 capability、credential ref、workflow checkpoint 和 runtime policy 都必须在启动前确定；不再像普通 prompt 附件 |
| Authority domain | Git、LangGraph、Harness session、DSH runtime、Collaboration Gateway、GitHub Actions 各自提供不同 native identity 和事实 |
| Projection 可见性 | 可以直接展示 config overlay、只读 shared mount、workspace、participant role 和 credential locator 如何进入运行时 |
| Evidence 对账 | config digest 不同、shared source digest 相同、secret 未落盘、并发 session ID 独立，都可形成明确事实 |
| continuation | 原生 session 延续与新 Core Execution 的分离是自然需求，不是为了演示硬造的剧情 |
| multi-Harness | isolation、sharing、race 三个并行调查责任天然互补，团队执行不是“多 Agent 炫技” |
| CI | isolation/sharing matrix 是真实、可失败、可重复的验证，不是普通 shell 成功动画 |

## 更弱的部分

- 成品不像 Web 小工具那样一眼可见，需要用三列 session 面板和简洁 test matrix 把技术行为可视化。
- “Agent-Box 原本就管理 Harness 配置”与“正在开发 DSH 配置插件”在表面上相似，容易被误读为自举式配置管理演示。
- 如果镜头只显示启动命令和配置文件，Agent-Box 会看起来像 launcher；必须保留 Binding freeze、独立 review/CI、Evidence 对账和 Work closure。
- DSH 当前为 rc 且本机 profile 尚未初始化，目标项目的真实 fixture 和可重复启动是拍摄前硬依赖。

修正方法是在所有核心画面保持双标签：

```text
Project being built
DeepSeek Harness Multi-Session Config Plugin

Managed by
Agent-Box Work Core
```

成品画面只负责证明插件工作；相邻的 Binding、GitHub Actions、LangGraph、Gateway 和 Evidence 画面负责证明 Agent-Box 治理了跨系统 Execution。

# Final Provider Stack for this topic

| 组件 | 本 Demo 角色 | 当前依据 | Preview 决定 |
|---|---|---|---|
| Codex Interactive | Interactive Author ExecutionProvider | Codex App Server E2E 已验证；CLI `0.149.0` 存在 | **主路径** |
| Codex App Server reviewer | Independent Review ExecutionProvider | 结构化 review、thread/turn、steer、恢复已 E2E | **保留**；独立 registration/session/read-only Dispatch |
| TeamInteractiveExecutionProvider | 多 Harness 的唯一 accountable Provider | Gateway + 三 participant 底层 E2E 已验证，aggregate lifecycle 尚待产品化 | **保留，P1 拍摄能力** |
| Git / git worktree | Source Authority + Workspace Projector + Evidence source | READY | **必须真实** |
| bwrap | Runtime Projector + partial isolation evidence | PARTIAL，但足以证明 config/runtime projection | **保留并明确 partial** |
| LangGraph local Agent Server | Workflow Authority + Evidence source | exact Thread/Checkpoint/state/snapshot 可用；restart 查询部分异常 | **薄接入，非主角** |
| ACP/acpx | Harness control/transport | 底层多 participant E2E | **只承担 transport/session control** |
| thin Collaboration Gateway | Collaboration Authority | registration/send/read/handshake/event-range/digest 已验证 | **多 Harness 场景必须真实** |
| MCP projection | 向 Harness 暴露 Gateway tools | 不是 collaboration authority | **薄 adapter，可见但不抢镜** |
| GitHub Actions hosted | CI ExecutionProvider + Evidence source | exact SHA、run/attempt、rerun 已真实验证 | **必须真实** |
| DSH `0.1.0-rc.6` + test fixture | 被开发/验证的 external runtime | binary 存在；profile fixture 未就绪 | **目标系统，P0 fixture** |
| OpenCode `demo-opencode` | E0 read-only InvestigationProvider | fresh/resume/TUI E2E；profile projector结构漂移；bwrap内ACP prompt挂起 | **用于E0，不用于Team ACP或主Author** |
| Hermes `demo-hermes` | E4 fresh ACP participant | CLI fresh/resume和bwrap ACP fresh prompt E2E；TUI不稳、ACP continuation拒绝 | **用于一次fresh团队participant，不承担resume** |
| Claude Code | 可替换 Author | session/resume 可用，之前 endpoint TLS 阻塞 | **不进入主拍摄路径** |

这里没有 CompositeProvider。多 Harness Execution 仍只有一个 accepted Dispatch，但 participant specs、Gateway、workflow、workspace 和 policy 都作为可见 Binding slots；TeamInteractive Provider 只拥有 aggregate runtime manifest 和整体 Finish。

# Author Harness choice

## 选择

主 Author 使用 **Codex Interactive**，Reviewer 使用独立的 **Codex App Server Review Provider**。

这不是为了品牌统一，而是当前环境中 Codex 的真实模型调用、native thread/turn、structured output 和恢复路径已有最强证据。Author 与 Reviewer 的独立性由以下边界构成：

- 不同 Provider registration；
- 不同 Execution、Binding、Dispatch；
- 不同 native thread；
- Author 可写 worktree，Reviewer 使用 exact commit 的只读 materialization；
- Reviewer 使用冻结 review criteria 和 output schema；
- Reviewer 不能继承 Author transcript/session；
- 两者分别产生 output/evidence refs。

同一产品并不自动破坏责任独立性；反过来，不同品牌也不能自动证明独立性。

## 为什么当前不选其他候选

| 候选 | 本机事实 | 决定 |
|---|---|---|
| OpenCode `1.18.21` | fresh/resume/visible TUI已E2E；原profile投影结构错误，bwrap内ACP prompt挂起 | 用于E0 read-only investigation；修projector后可作为Author fallback，不进入Team ACP主路径 |
| Hermes `0.19.0` | CLI fresh/resume和bwrap内fresh ACP prompt已E2E；TUI第三轮挂起，ACP load后prompt refusal | 用于E4 fresh session-isolation investigator；禁止承担continuation和主Author |
| DSH `0.1.0-rc.6` | launcher 已安装，但 `tui/headless` profile 不存在 | 作为 target runtime；避免被开发产品同时扮演开发者造成叙事递归 |
| Claude Code `2.1.241` | native session/resume 已验证；实际 endpoint 曾被 TLS 阻塞 | endpoint 修复也只作为插件替换位，不作为 Preview 依赖 |
| Codex CLI `0.149.0` | App Server E2E、thread/turn/recovery 和结构化 review 已验证 | 当前最稳主 Author；多 Harness 也可复用已验证的 `codex-acp` |

修改原因：Author 从 Claude 候选切到 Codex 是 **PROVIDER REALITY**；OpenCode用于E0、Hermes只用于fresh团队participant同样来自 **PROVIDER REALITY**；DSH 只做 target 是 **PRODUCT STORY**；Reviewer 仍单独 Dispatch 是 **CORE SEMANTICS**。

# Demo narrative thesis

开头不解释架构，也不展示未来步骤，只提出一个模糊、真实的 Harness infra Work。之后每次只回答：

> 根据现在已有的事实，下一次由谁承担什么责任，它启动前必须拥有并冻结什么？

全片的进展逻辑是：

- Work 对未来开放；
- Execution 对当前责任有界；
- Binding 把外部 authority 的 identity、revision 和 material 固定下来；
- Provider 负责把它们投影成真实运行环境；
- Human 可以在一个 interactive responsibility window 内持续 steer；
- Finish 才触发输出和 Evidence 固定；
- 新事实出现后，Human/Host 再决定是否创建下一 Execution；
- Provider terminal 永远不自动完成 Work。

画面上不出现可运行 DAG。结尾时间线只描述已经发生的历史。

# Full user-visible storyboard

目标片长约 5 分 20 秒。所有耗时过程使用“提前真实运行、由 Core 持久化事实回放”的形式，并清楚标注 `Recorded real execution`；terminal attach、DSH 三 session 行为和最终核验保留现场实拍。若真实 CI failure 与预设不同，现场叙事跟随真实 failure，不制造 `parallel_session_start` 失败。

## Scene 1 — 只有一个模糊 Work（0:00–0:18）

### Viewer sees

页面只显示双标签、Work objective 和 `Open`：

```text
Project being built: DeepSeek Harness Multi-Session Config Plugin
Managed by: Agent-Box

不同会话需要独立配置，但 MCP、插件和凭证等外部能力应该可以共享。

Work: Open
```

没有 Execution 列表、DAG、实现方案或未来步骤。

### User action

用户点击 `Decide next action`，选择“先调查 DSH 现有 profile、session、config composition 和 capability source”。

### Agent-Box visible response

出现一个新的 bounded Investigation Execution draft，objective 明确为“产出 decision-ready investigation artifact，不修改产品代码”。

### Native systems visible

Git source locator、DSH runtime descriptor、OpenCode `demo-opencode` read-only investigator profile；LangGraph 只在资源详情里显示 Thread T / Checkpoint C1 / phase investigation。

### Behind the scenes

创建 Work W；Host 提出 E0 draft；Binding B0 包含 exact source、DSH installation Ref、investigation criteria、WorkflowInstanceRef、WorkflowRevisionRef 和 read-only runtime policy。尚未 Dispatch。

### Why this scene exists

证明 Work 可以模糊，但当前 Execution 必须 bounded；未来不是预先设计好的流程。

### Risk

如果 UI 同时预告 Implementation/Review/CI，观众会立刻把 Agent-Box 看成 workflow 产品。

## Scene 2 — 调查先产生事实，不替 Human 决策（0:18–0:45）

### Viewer sees

`Freeze & Launch` 后，进度条依次显示 exact commit、workflow snapshot、read-only worktree、runtime projection。快速回放调查结果：copy config、layered overlay、immutable shared base + session overlay、process-level isolation 四种方向及真实约束。

### User action

用户打开 Investigation Artifact，查看 DSH 当前 profile composition、session/resume 入口、共享能力位置和未知项。

### Agent-Box visible response

E0 进入 `FINALIZING`，固定 native SessionRef、artifact digest、Git facts 和 observed runtime version，随后 `TERMINAL / SUCCEEDED`。Work 仍为 `Open`；页面才出现“根据当前事实选择方向”。

### Native systems visible

OpenCode terminal 回放、DSH `--dump-config`/profile probe、Git exact HEAD、LangGraph C1。

### Behind the scenes

Codex InvestigationProvider 接受唯一 Dispatch；ArtifactRef `investigation-v1@sha256:I1` 成为 output。Evidence 只能证明读取了哪些命令输出和 materialization；不能证明模型读懂了所有内容。

### Why this scene exists

证明 AI investigation 也是可归责的 Execution，但 Execution output 只成为后续 Human decision 的输入。

### Risk

调查细节过长会把视频变成 DSH 技术教程；公开片只保留结论与 evidence locator。

## Scene 3 — H1 真正改变后续依据（0:45–1:03）

### Viewer sees

Human decision panel 显示四个方向、代价和未知项。用户选择：

> immutable shared base + session-local overlay；credential 只保存 authority reference，不复制 secret；同一 Execution 中共享能力必须固定到 exact revision。

### User action

用户补充：“中途 shared source 更新不得静默改变已冻结 Execution；下一次 Execution 才能选择新 revision。”然后保存决定。

### Agent-Box visible response

生成两个不可变 artifacts：`architecture-direction@D1` 与 `acceptance-matrix@A1`。Host 更新外部 LangGraph Thread T，产生 Checkpoint C2 / phase implementation。此时才出现“实现当前选择”的 next action。

### Native systems visible

LangGraph Thread T 的 C1 → C2 更新详情；不展示 graph 或 route。

### Behind the scenes

H1 是 Work-level decision event + ArtifactRefs，不是 Human Execution。LangGraph 拥有 workflow state；Agent-Box adapter 读取 C2 并准备 snapshot，Core 不保存 checkpoint payload或 next-node logic。

### Why this scene exists

证明 Human 决定不是装饰性 approval：D1/A1 和 C2 将进入下一 Binding，直接改变实现责任与共享资源语义。

### Risk

如果 H1 看起来像工作流审批节点，会削弱开放式 Work 叙事；UI 文案必须是“当前决定”，而非“Step 2”。

## Scene 4 — Binding Hero：选择资源，而不是逐个配置 Harness（1:03–1:35）

### Viewer sees

Implementation Execution 的资源清单：

```text
Source                  Git commit C1 / tree G1
Target runtime          DSH 0.1.0-rc.6 fixture
Direction               Artifact D1
Acceptance matrix       Artifact A1
External workflow       LangGraph Thread T / Checkpoint C2
Author                   Codex Interactive profile author-v1
Shared MCP              Registry M @ digest M1
Shared plugins          Plugin Set P @ digest P1
Credential source       CredentialRef CR1 (value hidden)
Runtime                  bwrap policy BP1 · partial isolation
```

用户不编辑 prompt、路径、环境变量或 MCP endpoint。

### User action

点击 `Freeze & Launch`。

### Agent-Box visible response

逐项显示：resolve exact refs → snapshot LangGraph C2 → freeze Binding B1 → accept Dispatch D1 → create worktree → materialize one shared base → create session overlay → project config/context → verify HEAD → launch terminal。

### Native systems visible

Git/worktree、LangGraph API、bwrap mount manifest、Codex CLI；credential value 始终不可见。

### Behind the scenes

Binding freeze 与 Dispatch acceptance 是同一事务边界。Provider-owned runtime manifest 可以含 mount path、env 和 process handles，但 Binding 保留所有用户选择的 slots。actual HEAD、snapshot digest、mount/config digests写入 ResourceFacts。

### Why this scene exists

这是全片最重要的 Binding 证明：用户选择的是本次责任所需的既有资源，Harness 启动时已经拥有正确环境。

### Risk

若进度条只是动画、detail 无 exact Ref 和 evidence，画面会像普通 launcher。每项必须可展开看到 authority、revision 和 method。

## Scene 5 — Interactive responsibility window（1:35–2:06）

### Viewer sees

真实 terminal 打开，Codex 已知道 workspace、D1、A1、LangGraph context、测试期待、共享资源引用和权限。它开始实现插件；第一轮后 UI 仍显示 `Execution ACTIVE`。

### User action

用户在同一 terminal 中继续说：

> 共享 MCP 的生命周期再检查一下；credential 不应该复制进 session profile。

Harness 修改实现并运行局部测试。用户最后在 Agent-Box 点击 `Finish Execution`。

### Agent-Box visible response

idle、一次回复结束或局部测试完成都不改变 Core terminal 状态。点击 Finish 后才显示 `FINALIZING`：停止接受新交互、固定 output commit/tree/diff、SessionRef、turn/event range、runtime facts 和 conformance；随后 E1 terminal。

### Native systems visible

Codex interactive TUI、Git diff/test、bwrap runtime。Agent-Box 状态条始终在 terminal 旁可见。

### Behind the scenes

CodexInteractiveExecutionProvider 对 E1 的一个 accepted Dispatch 负责。native thread `S1` 是 SessionRef；turn IDs 是 native RunRefs/event locators。显式 submit 调用 Provider finalizer，而非把 process exit 映射成业务完成。

### Why this scene exists

证明 Execution 是持续交互责任窗口，不是单轮 prompt/job；Agent-Box 管理责任终点，而非推测 Harness 是否“做完”。

### Risk

如果用户仍需手工告诉 Agent 项目路径、角色或 MCP endpoint，Binding 价值会当场失效。

## Scene 6 — 独立 Review 是新的责任（2:06–2:27）

### Viewer sees

E1 terminal 后，页面只提出当前可能动作：“独立审查 output commit C2”。用户创建 Review Execution，Binding 显示 exact commit、read-only workspace、D1/A1、review criteria 和独立 reviewer profile。

### User action

点击 Launch，随后打开结构化 review JSON：隔离路径正确，但并发启动的 overlay materialization/rename 路径存在竞态风险。

### Agent-Box visible response

显示独立 Codex thread/turn、JSON schema validation 和 artifact digest。Reviewer 没有 Author SessionRef，也没有写权限。

### Native systems visible

Codex App Server、只读 Git worktree、结构化 JSON output。

### Behind the scenes

CodexReviewExecutionProvider 是另一个 provider registration 和 Dispatch。它消费 E1 output ArtifactRef/WorkspaceRef；review finding 是 ArtifactRef，不直接修改 E1 outcome，也不自动触发修复。

### Why this scene exists

证明相同产品也可形成真正独立的责任边界；独立性来自 session、权限、Binding 和 Dispatch，而非 logo 数量。

### Risk

Author/Reviewer 都是 Codex 可能被质疑不够异构。detail 必须明确展示独立 thread、read-only materialization、无 transcript inheritance；E0的OpenCode和E4的Hermes证明provider-neutral组合，但不为logo牺牲Reviewer的结构化输出能力。

## Scene 7 — CI 完成运行，但验证失败（2:27–2:52）

### Viewer sees

Human/Host 现在决定验证 C2，创建 GitHub Actions CI Execution。画面显示 workflow definition exact revision、source C2、run ID、run attempt 和 read-back `head_sha=C2`。真实 matrix 中一个测试失败，例如 `parallel_session_start`。

### User action

用户展开失败 artifact，而不是点击自动 retry。

### Agent-Box visible response

```text
CI Execution: terminal — operationally completed
Verification report: FAILED — parallel_session_start
Work: Open
```

系统仅提供当前可选动作：调查竞态、限定修复范围、暂不处理。

### Native systems visible

真实 GitHub Actions run/attempt/log/artifact、exact Git SHA。失败类型以实际 run 为准，禁止预先伪造。

### Behind the scenes

GitHubActionsExecutionProvider 记录 RunRef、attempt、head_sha、workflow ref、logs/report/artifact digest。Execution operational outcome 与 verification artifact 中的产品判断分离；Core 不新增 generic business verdict enum。

### Why this scene exists

证明外部 CI 是独立责任域，且“Provider 正常完成”不等于产品通过，也不等于 Work 完成。

### Risk

真实 run 若无失败不能演戏。拍摄 reference run 必须保留真实失败；若失败项不同，改旁白和 repair scope。

## Scene 8 — Multi-Harness 联合诊断，而不是三个隐藏 worker（2:52–3:34）

### Viewer sees

用户创建当前 Diagnosis Execution，Binding 清楚展开：

```text
Participant A  Hermes · session isolation investigator   read-only · fresh ACP
Participant B  Codex  · MCP/plugin sharing investigator read-only
Participant C  Codex  · concurrency repair analyst       scoped writer/analysis
Collaboration   Gateway CG1 via ACP/acpx
Workflow        Thread T / exact checkpoint C2
Workspace       failing commit C2
Inputs          CI report + review artifact + reproduction
Runtime         bwrap policy BP-team
```

### User action

用户点击一次 `Freeze & Launch`。

### Agent-Box visible response

编译三个 participant-specific artifacts、建立 execution-scoped endpoint、注册 participant、投影相同 workflow snapshot和不同角色/权限，然后打开三个真实 pane。Gateway 页显示 A/B/C handshake；Hermes A 报告 overlay 边界，Codex B 报告 shared source identity，Codex C 汇总 race reproduction。

### Native systems visible

一个 `hermes acp` 与两个 `codex-acp` participant process/session、acpx、Collaboration Gateway、MCP tool projection、Git/bwrap、LangGraph context。

### Behind the scenes

Core 只看到 E4 → 一个 TeamInteractiveExecutionProvider → 一个 accepted Dispatch。ParticipantSpec 是 provider-owned schema 的 ArtifactRef/Binding slots；runtime manifest 保存 process handles。Gateway 是 Collaboration Authority；ACP/acpx 只是 control/transport；MCP 只暴露 send/read/list/handshake tools。aggregate Finish 固定 participant SessionRefs 和 Gateway event range/digest。

### Why this scene exists

证明 Binding 可以把多个真实 Harness、角色、权限、workspace、workflow 和 collaboration 组合成一个用户可见团队环境，同时不迫使 Core 管理三条生命周期。

### Risk

三个完整 TUI 会拖节奏并造成噪音。使用三 pane + 每个仅一个清晰交付；若 participant 需要独立 retry/outcome，则不得留在本 E4，必须升级为独立 Execution。

## Scene 9 — H2 限定 repair scope，并新建 continuation Execution（3:34–4:14）

### Viewer sees

Review、CI 和团队诊断并列。Human 选择：

> 本轮只修并发创建 overlay 的原子性和 cleanup；保持 immutable shared base 语义，不扩展动态 plugin reload。credential 继续只引用，增加 secret-not-copied regression test。

页面随后显示 LangGraph same Thread T、new Checkpoint C3 / phase repair。新的 Repair Execution Binding 包含 C2、review、CI、diagnosis、H2 artifact、C3，以及 `continuation SessionRef S1`。

### User action

保存 H2，点击 `Freeze & Launch`。

### Agent-Box visible response

UI 明确并列：

```text
E1  TERMINAL   Author Session S1
E5  ACTIVE     Continuation input S1 → native resume S1
```

绝不显示 `Resume E1`。Codex terminal 恢复旧 native thread，但运行在新 exact worktree/new Binding 下；修复后用户再次显式 Finish。

### Native systems visible

LangGraph C3、Codex resumed thread S1、new Git worktree、review/CI/diagnosis artifacts。

### Behind the scenes

H2 是 Work decision artifact；adapter 更新外部 workflow。Core 创建新 Execution E5、Binding B5、Dispatch D5；SessionRef S1 只是 input continuation ref。旧 E1 永远 terminal。Provider 验证 resumed native thread ID 与 S1 相同，同时记录新 Execution ID、new event range 和 output commit C3。

### Why this scene exists

把 session continuity 与 Execution responsibility 分开，并证明新事实会改变新 Binding，而不会重开历史责任。

### Risk

旧 `resume_execution` 当前实现会复用原 Execution，这正是 P0 必修缺口；未修前不能拍摄此镜头。

## Scene 10 — 成品行为与最终 CI（4:14–4:52）

### Viewer sees

真实 DSH fixture 同时打开 Session A/B/C 三列：A/B config identity 不同；修改 A 后 B/C digest 不变；三者引用同一 MCP registry M1、plugin set P1、CredentialRef CR1；secret value 不出现在 session config。随后 GitHub Actions exact C3 matrix 全部通过。

### User action

用户 restart/continue Session A，确认 native session continuity 和 config boundary；再打开 final targeted review。

### Agent-Box visible response

显示 DSH test evidence、final reviewer artifact、CI RunRef/attempt/head_sha。UI 明确标注：实际调用 MCP 的 A 已观察，B 为 unknown；所有插件是否被模型实际使用为 unverifiable。

### Native systems visible

DSH runtime/plugin、三个 session panes、GitHub Actions、Codex targeted reviewer、Git facts。

### Behind the scenes

DSH verification adapter 只采集 target-runtime session IDs、config/shared-source digests和测试报告；它不让 DSH session 成为 Core entity。CI 与 Reviewer 仍是独立 Executions。负向 secret scan 的证据范围限定为已枚举 materialization roots，不声称覆盖进程内存或外部系统。

### Why this scene exists

让观众直观看见被开发产品真实工作，同时用 partial/unknown/unverifiable 防止 Evidence 退化成“all used=true”。

### Risk

如果只拍测试名，成品不可感知；如果停留太久解释 DSH 内部，又会盖过 Agent-Box。三列 UI/terminal 应控制在 20 秒内。

## Scene 11 — Expected 与 Actual 对账（4:52–5:13）

### Viewer sees

Evidence Summary 左右对照：

| Binding expected | Actual evidence |
|---|---|
| A config `X` | projected `X`，Git/filesystem probe verified，complete |
| B config `Y` | projected `Y`，verified，complete |
| shared MCP `M1` | A/B/C 指向同一 materialization `M1`，verified，complete for projection |
| credential source `CR1` | reference projected；secret absent from enumerated session roots，partial |
| MCP consumption | A observed；B/C unknown |
| every plugin used | unverifiable |

### User action

用户展开一项，看到 authority、method、coverage、timestamp 和 EvidenceRef，而非 raw trace 洪流。

### Agent-Box visible response

清楚区分 requested、frozen、projected/materialized、provider-reported、independently observed。`可见 ≠ 已消费` 固定显示在页脚。

### Native systems visible

Git、filesystem/mount probe、Gateway event range、LangGraph checkpoint、GitHub Actions report；Harness self-report 单独标记。

### Behind the scenes

ExecutionResourceFacts 关联 Binding slot、actual Ref/digest、authority、method 和 coverage。Artifact body 留在 artifact store，Core 保存 locator/digest/关系；secret value、raw checkpoint payload和完整 transcript不进入 Core。

### Why this scene exists

证明 Agent-Box 不只是把工具串起来，而是把 Execution 的约定与跨 authority 事实闭合起来。

### Risk

术语过多会像审计数据库。默认层只用“已冻结/已验证/部分可证/无法确认”，技术字段放 detail。

## Scene 12 — Provider 成功不自动完成 Work（5:13–5:30）

### Viewer sees

所有当前 Executions 已 terminal，但 Work 仍为 `Open`。Human 查看 final product、CI、review、关键 Evidence 和 unresolved unknowns，点击 `Complete Work`。结尾显示只读历史时间线：调查、H1、实现、review、CI failure、团队诊断、H2、continuation repair、CI pass、H3 completion。

### User action

Human 写入完成理由并确认 H3。

### Agent-Box visible response

Work 变为 `Completed`。历史页强调 `what happened`，没有可运行 node/edge 或“重新执行整个流程”按钮。

### Native systems visible

最后只保留 Ref 汇总：Git revisions、LangGraph checkpoints、Harness sessions、Gateway transcript digest、GitHub run IDs。

### Behind the scenes

WorkService 记录 explicit completion event、reason 和 material evidence relations。任何 Provider terminal 或 verification pass 都没有关闭 Work。

### Why this scene exists

证明 Human/Host 拥有 Work progression 和 closure；Agent-Box 保留受治理的过去，未来由当下决定。

### Risk

如果结尾用 DAG 总览或“workflow completed”，会推翻全片叙事；只能显示不可执行的历史时间线。

# Internal reference trace

以下只供拍摄、fixture 和 rehearsal 使用，不能在产品开头作为预定义 workflow 展示。编号在真实 run 中可以变化。

| 历史项 | 当时才做出的决定/责任 | 关键 Binding / output |
|---|---|---|
| Work W | 模糊 DSH multi-session plugin objective | Open；无未来 Execution |
| E0 Investigation | 调查当前配置/session/capability 机制 | source C0 + Thread T/C1 + read-only policy → I1 |
| H1 | 选择 immutable shared base + session-local overlay；credential ref only | D1 + A1；LangGraph C2 |
| E1 Implementation | 实现被接受的方向 | C0 + D1/A1 + T/C2 + M1/P1/CR1 + bwrap → C2 + Session S1 |
| E2 Review | 独立审查 exact C2 | read-only C2 + criteria → R1 |
| E3 CI | 对 exact C2 运行 matrix | workflow exact ref + C2 → failed report F1 |
| E4 Team diagnosis | 联合定位 isolation/sharing/concurrency 问题 | participants A/B/C + Gateway + T/C2 + C2 + R1/F1 → diagnosis G1 |
| H2 | 限定 atomic overlay/cleanup/secret regression scope | RepairScope H2；LangGraph C3 |
| E5 Repair | 新责任，继续 native S1 | C2 + R1/F1/G1/H2 + T/C3 + continuation S1 → C3 |
| E6 Targeted review | 确认修复未扩大语义 | read-only C3 + H2 → R2 |
| E7 CI | exact C3 final matrix | run/attempt/head_sha + report → pass |
| H3 | Human 体验三 session 并审阅 unknowns | explicit Work completion |

E0–E7 不是产品 workflow 定义，只是一次已经发生的 reference history。任何一步的新事实都允许 Human/Host 选择不同的下一步或暂时停止。

# Binding Hero Moment

时长：25 秒。

先用 8 秒展示 B1 中 exact Git、D1/A1、LangGraph T/C2、Author profile、MCP M1、Plugin P1、CredentialRef CR1 和 bwrap BP1；点击一次 `Freeze & Launch`。接着用 12 秒让每个 slot 从 `resolved` 变为 `frozen`，再显示 worktree、shared base、session overlay、context 和 credential reference 被投影。最后 5 秒真实 terminal 出现，Harness 第一行 summary 已列出责任、workspace、共享 refs 和约束。

验收标准：用户没有手工输入角色、路径、context、MCP endpoint 或 credential；每个进度项可展开到 exact Ref/Evidence，而非动画。

# Interactive Execution Hero Moment

时长：25 秒。

真实 Codex terminal 第一轮实现结束，Agent-Box 仍显示 E1 `ACTIVE`。用户追加“credential 不应该复制进 session profile”，Harness 继续修改。用户点击 `Finish Execution` 后才出现 `FINALIZING`，依次固定 commit/tree/diff、SessionRef S1、event range、runtime facts，最终 terminal。

核心台词：

> 一轮回答结束不是责任结束；这次 Execution 由用户显式提交。

# Session Continuation Hero Moment

时长：18 秒。

左右并列：`E1 TERMINAL / Session S1` 与 `E5 ACTIVE / continuation input S1`。中间显示新 Binding 的 C2、CI F1、review R1、H2、LangGraph C3。terminal 以 native `resume S1` 启动，但 UI 永不出现 `E1 resumed`。

验收标准：新 Execution ID、new Binding revision、new Dispatch、新 event range；native SessionRef 保持 S1。

# Workflow Hero Moment

时长：12 秒。

只在两个 Execution detail 之间切换：E0 使用 `Thread T / C1 / investigation`；H1 后 E1 使用 `same Thread T / C2 / implementation`；H2 后 E5 使用 `same Thread T / C3 / repair`。每个 checkpoint 对应不同 snapshot digest。

旁白：

> LangGraph 保持外部流程连续性；Agent-Box 只把当时的 exact checkpoint 绑定进一场新的责任执行。

# Multi-Harness Hero Moment

时长：30 秒。

前 8 秒展开 Hermes A、Codex B/C、Gateway CG1、T/C2、C2、R1/F1和权限；点击一次 Launch。中间 10 秒显示三个 pane 依次 join 和 handshake。后 12 秒 A/B/C 各给出 isolation、sharing、race 的一条结论，并通过 Gateway 汇合。

验收标准：三个真实 native sessions/processes 可见；participant specs 保留在 Binding；Core 只有一个 E4、一个 accountable Provider、一个 Dispatch。

# CI Hero Moment

时长：18 秒。

真实 GitHub Actions 显示 `run_id`、`run_attempt`、`head_sha=C2`，matrix 的真实失败项变红。Agent-Box 同屏显示：`Execution operationally completed` 与 `Verification FAILED`，Work 仍 Open。不能用模拟 shell 或预造 failure。

# Evidence Hero Moment

时长：20 秒。

左侧 B1 expected，右侧 actual evidence。A/B config 与 shared M/P 显示 verified；credential absence 显示 partial；MCP consumption 显示 `A observed / B unknown`；every plugin used 显示 `unverifiable`。展开其中一项看到 authority、method、coverage、timestamp、EvidenceRef。

# Human Decision Hero Moment

时长：18 秒。

H1 选择 shared base + local overlay 并加入 credential-ref-only 约束；画面立即预览“将进入下一 Binding：D1/A1”。H2 从真实 R1/F1/G1 限定 atomic overlay + cleanup，不加入动态 reload；下一 Binding B5 随之变化。

重点不是点击 approval，而是决定具体改变了后续 Execution 的输入和责任范围。

# Work Completion Hero Moment

时长：12 秒。

final CI 和 review 均通过，Work 仍显示 `Open`。Human 看到 unresolved unknowns 后点击 `Complete Work`；只读历史时间线出现。没有 workflow-complete 或 Provider 自动闭合。

# Provider role mapping

| 真实组件 | Accountable ExecutionProvider | Resource Authority | Provisioner / Projector | Evidence Adapter | Host / Workflow integration |
|---|---:|---:|---:|---:|---:|
| OpenCode Investigation registration | E0 | native session identity（仅自身域） | read-only context/profile/data-dir projection | JSON events/session locator；错误event必须覆盖exit code | 否 |
| Codex Interactive registration | E1/E5 | native thread/turn identity（仅自身域） | context/profile/session projection | session/turn/event locator；部分为 self-report | 否 |
| Codex Review registration | E2/E6 | native thread/turn identity | read-only workspace + schema projection | structured review + digest | 否 |
| TeamInteractive Provider | E4 唯一 accountable Provider | 否 | participant runtime aggregate | aggregate native refs/finalization facts | 否 |
| Hermes ACP adapter | E4 内部participant，不是Core Provider | Hermes ACP session identity | read-only role/context + bwrap profile | ACP updates/end_turn；fresh session范围 | 否 |
| Git | 否 | commit/tree/HEAD authority | worktree materialization | HEAD/tree/diff facts | 否 |
| bwrap | 否 | 对自身 runtime/process identity 有限 | mount/env/config/policy projection | argv/mount/process facts，assurance partial | 否 |
| LangGraph | 否 | Thread/Checkpoint/Run/state authority | context snapshot由 adapter 投影 | checkpoint/state query + snapshot digest | 外部 workflow owns state；Host 决定是否创建 Execution |
| Collaboration Gateway | 否 | endpoint/participant/event range authority | execution-scoped endpoint | handshake/events/transcript digest | 否 |
| ACP/acpx | 否 | native agent session/control identity | 启动、attach、cancel、stream transport | transport/session events | 否 |
| MCP adapter | 否 | 否 | 暴露 Gateway tools | tool-call observation，不能证明理解/完整消费 | 否 |
| GitHub Actions | E3/E7 | run/attempt/head_sha/workflow native facts | hosted runner/workflow execution | logs/report/artifact/head_sha | 否 |
| DSH plugin fixture/probe | 否；它是被测产品 | target session/profile/runtime identity | fixture/profile/session overlay | config/shared refs/session/test facts | 否 |
| Human/Host | 否（同步决定） | decision provenance | 提出 Binding draft | decision artifact/event | 决定下一步、更新 LangGraph、完成 Work |

Collaboration Authority 明确是 Gateway；ACP/acpx 不是 peer collaboration authority，MCP 更不是。它们分别是控制/transport 和 tool projection。

# Binding slot mapping

| Binding slot | 值的表达 | 谁 resolve/freeze | 谁 projection | Core 是否理解 payload |
|---|---|---|---|---:|
| `source.revision` | Git commit Ref + tree metadata | GitAuthority | WorktreeProjector | 否 |
| `workspace.intent` | writable/read-only policy ArtifactRef | Host + runtime adapter | Git/bwrap | 否 |
| `target.runtime` | DSH installation/profile descriptor Ref | DSH adapter | DSH fixture projector | 否 |
| `direction` | H1 immutable ArtifactRef D1 | ArtifactAuthority | Harness context projector | 否 |
| `acceptance.matrix` | ArtifactRef A1 | ArtifactAuthority | Harness/CI adapters | 否 |
| `workflow.instance` | WorkflowInstanceRef Thread T | LangGraph adapter | context projector | 否 |
| `workflow.revision` | exact Checkpoint Ref Cn | LangGraph adapter | context projector | 否 |
| `workflow.context` | checkpoint-derived immutable ArtifactRef | ArtifactAuthority | `context.md`/env/tool resource | 否 |
| `harness.profile` | provider registration/profile Ref | Provider registry | Interactive Provider | 否 |
| `continuation.session` | previous native SessionRef S1 | native Harness adapter | Provider resume input | 否 |
| `session.config.rules` | contract ArtifactRef | Host/artifact authority | DSH/Harness projector | 否 |
| `shared.mcp` | Registry Ref + exact digest M1 | MCP registry adapter | one shared materialization/reference | 否 |
| `shared.plugins` | Plugin set Ref + exact digest P1 | plugin source adapter | one shared materialization/reference | 否 |
| `credential.source` | authority locator/version Ref CR1，不含值 | credential adapter | reference/handle/env indirection | 否 |
| `runtime.policy` | ArtifactRef BP1 | runtime adapter | bwrap | 否 |
| `review.inputs` / `ci.inputs` | R/F/G ArtifactRefs | ArtifactAuthority | Harness/CI adapters | 否 |
| `team.participant_specs` | 3 个 provider-owned spec ArtifactRefs | Team Provider adapter validates | per-participant config/role/permission | 否 |
| `collaboration.endpoint` | CollaborationRef CG1 | Gateway | ACP/MCP projections | 否 |

Core 只要求 slot 有稳定 key、typed Ref/ArtifactRef、resolved revision、required/optional、assurance expectation 和 freeze record；它不加入 DSH/MCP/plugin/participant 专用实体。

# Ref mapping

| 对象 | Ref | native identity / digest | 注意 |
|---|---|---|---|
| Codex author session | SessionRef | App Server thread ID | continuation input；不是 Execution ID |
| Codex author turn | RunRef 或 Evidence locator | turn ID | 不把每个 turn 变成 Core Execution |
| Codex reviewer | SessionRef + RunRef | independent thread/turn IDs | 与 Author 分离 |
| OpenCode investigator | SessionRef | `ses_...` | E0独立session；不继承Codex Author |
| Hermes team participant | SessionRef | ACP UUID | E4 fresh-only；当前不作为continuation input |
| Git source | WorkspaceRef/Ref metadata | commit SHA + tree SHA | mutable selector 只在 freeze 前存在 |
| output | ArtifactRef / WorkspaceRef | commit/tree/diff digest | dirty tree必须显式记录，不伪装成 commit |
| LangGraph instance | WorkflowInstanceRef | `thread_id` | 长期 identity |
| LangGraph revision | Ref（provider/native revision） | `checkpoint_id` | exact revision；无需新增 Core enum 才能用 metadata/typed provider ref 表达 |
| LangGraph run | RunRef | `run_id` | 仅在相关 Execution 使用 |
| workflow context | ArtifactRef | canonical snapshot SHA-256 | Harness 实际消费的不可变内容 |
| collaboration | Ref/ArtifactRef | endpoint ID + config/version | execution-scoped |
| participant | SessionRefs + spec ArtifactRefs | native session IDs + spec digests | 不是 Participant Core entity |
| DSH target session | ArtifactRef/ResourceFact locator | DSH native session ID | 是被测产品事实，不是 Core DSHSession |
| DSH session config | ArtifactRef/ResourceFact | canonical config digest | secret 永不进入 artifact |
| MCP registry | Ref + ArtifactRef | registry native ID/version + digest | frozen shared source |
| plugin set | Ref + ArtifactRef | source revision + manifest digest | 不拆成 Plugin Core entity |
| credential source | Ref | authority locator/version/handle ID | 不存 value，谨慎处理低熵 secret hash |
| CI | RunRef | GitHub `run_id` + `run_attempt` | actual `head_sha` 写 fact |
| CI report | ArtifactRef | report/artifact digest | verification result留在 artifact语义 |
| Evidence | EvidenceRef | provider locator or immutable digest | authority/method/coverage/timestamp |

如果现有 RefType 不足以优雅表示 checkpoint revision，不需要新 `WorkflowStep`；可先用 provider-qualified Ref/metadata，后续仅在跨 Provider contract 真有稳定共性时增加一个窄的 revision ref type。

# Evidence mapping

| 声明 | Authority / method | Coverage | 能证明 | 不能证明 |
|---|---|---|---|---|
| source frozen at C | Git `rev-parse`/object DB | complete for resolve | selector 当时解析为 exact commit/tree | Harness 没访问别的代码 |
| actual workspace HEAD=C | Git inside materialized worktree | complete for HEAD | 启动前 HEAD 匹配 | 运行中没有未声明文件输入 |
| context from LangGraph C2 | LangGraph get_state + checkpoint ID；snapshot canonical hash | complete for snapshot derivation | exact native revision和投影 artifact一致 | Harness 理解/遵循全部 context |
| A/B config X/Y | filesystem canonicalization + digest + mount manifest | complete for enumerated paths | 投影内容和路径匹配 | 进程从未读取其他 config |
| A mutation不污染 B | before/after digests + file identity probes | complete for tested roots/time range | B 在测试窗口内容不变 | 所有未来 interleaving 都无竞态 |
| shared MCP/plugin source相同 | common materialization Ref/digest + mount/path/inode evidence | complete for projection | A/B/C 指向同一冻结 source | 每个 Harness 实际调用/使用全部能力 |
| credential只引用 | projection manifest + enumerated root scan using non-secret canary strategy | partial | 已枚举 session roots 未出现 secret；reference存在 | 进程内存、日志、外部系统和未枚举路径绝对无 secret |
| parallel A/B/C | DSH IDs + concurrent test report + config digests | complete for tested run | 三 native session独立且本次无交叉 | 所有机器/负载下都无 race |
| continuation正确 | old/new Core IDs + same native SessionRef + new Binding/Dispatch | complete | session continuity与Execution分离 | 模型内部记忆绝对完整 |
| Gateway handshake | Gateway participant registry/event range | complete for Gateway observations | A/B/C 注册和消息事件发生 | Agent 阅读/理解消息内容 |
| Harness invoked MCP | native tool event/Gateway receive event | partial | 特定调用在覆盖范围内发生 | 未记录路径中无其他调用 |
| every plugin used | 无可靠 authority | unverifiable | 无 | “所有插件都被实际使用” |
| CI ran exact C | GitHub Actions run API `head_sha`/attempt | complete for native run identity | 该 run 对 C 执行 | 测试矩阵覆盖所有产品行为 |

Evidence UI 的默认中文层级：`已验证`、`部分可证`、`未知`、`无法验证`。底层 contract 使用 `complete/partial/unknown/unverifiable`。

# DeepSeek Harness plugin verification matrix

| 测试 | Setup / action | 必须观察的结果 | 主要 evidence authority | Coverage |
|---|---|---|---|---|
| `session_config_isolation` | 以 shared base M1/P1/CR1 创建 A(profile A)、B(profile B) | A/B canonical config digest不同；local roots不同 | DSH probe + filesystem facts | complete for fixture |
| `session_config_mutation_does_not_leak` | 修改 A local key，前后采集 A/B/C | 仅 A digest变化，B/C和shared base不变 | filesystem diff/digest | complete for tested roots |
| `shared_mcp_visibility` | A/B/C 解析 MCP capability | 三者引用同一 RegistryRef/digest/materialization，不存在三份漂移副本 | MCP registry + mount manifest | complete for projection；consumption另计 |
| `shared_plugin_visibility` | A/B/C 列出可用 plugin set | source Ref/digest一致；local config仅含引用/overlay | plugin manifest + filesystem | complete for visibility |
| `shared_credential_reference` | A/B/C 获取 credential handle | CredentialRef/authority locator一致；运行能经受控方式取用 | credential adapter + DSH probe | partial；不持久化 secret |
| `secret_not_copied_to_session_config` | 使用随机 canary credential，枚举所有 session materialization roots | canary不在任何 session-local file/report；仅 reference存在 | negative scanner report digest | complete only for enumerated roots；全局为 partial |
| `parallel_session_start` | barrier 同时启动 A/B/C，多轮重复 | native IDs独立；config digest正确；shared refs一致；无临时文件/rename污染 | DSH IDs + test runner + filesystem | partial across sampled interleavings |
| `session_restart_consistency` | 结束 A 进程后以同一 native session/profile continuation | A local boundary保留；shared revision仍为冻结 M1/P1 | DSH session API + config facts | complete for tested restart |
| `new_execution_continuation` | E1 terminal；E5 以 S1 + new Binding启动 | same S1、new Execution/Binding/Dispatch；新 inputs可见 | Core + Harness native ID | complete |
| `shared_resource_update_behavior` | 发布 M2/P2；E1仍 active，另建新 Execution | E1不静默漂移；新 Execution可显式绑定 M2/P2 | Binding refs + runtime materialization | complete for frozen executions |
| `profile_cleanup` | Finish/cleanup A，不结束B/C shared materialization使用 | A local overlay按policy清理；B/C和shared base仍可用；最终引用归零再cleanup | projector manifest + filesystem | partial until lifecycle cases覆盖 |
| `invalid_or_missing_ref_fails_closed` | shared digest/credential locator错误 | Dispatch前或Harness start前失败，不回退复制/默认全局config | adapter error + no-process fact | complete for tested errors |

真实 CI 至少覆盖上述前十项；负向测试与 race repetition 的次数进入 test config ArtifactRef，不能靠旁白声称“并发安全”。

# Demo narrative risks

| 风险 | 严重度 | 修正 |
|---|---:|---|
| 被误解为 DSH 配置管理器 | 高 | 全程双标签；让 GitHub Actions、LangGraph、Review、Gateway、Binding/Evidence跨域出现 |
| 被看成 Agent-Box 自己开发自己 | 高 | DSH 明确是外部 target runtime；主 Author 不用 DSH；DSH session facts只作被测结果 |
| 被看成 launcher | 高 | Freeze 前 exact refs、Finish 后 evidence对账、CI独立责任和continuation必须入镜 |
| 被看成 workflow engine | 高 | 开头无未来步骤；LangGraph只在resource detail；结尾只读history而非DAG |
| Author/Reviewer 同品牌“不独立” | 中 | 展示独立registration/thread/permissions/Dispatch；E0 OpenCode与E4 Hermes提供异构可见性，但不以稳定性换Reviewer contract |
| bwrap被误称强sandbox | 中 | UI标记`partial isolation`、shared network/root bind等限制；只宣称runtime/config projection |
| credential absence过度证明 | 高 | coverage限定enumerated roots；不保存secret/hash；全局结论保持partial |
| shared capability 与 exact Binding 冲突 | 高 | H1规定Execution内绑定immutable revision；新revision进入新Binding，不使用可漂移live source |
| DSH rc/profile fixture不稳定 | 高 | P0固定版本、仓内最小fixture、启动/cleanup/restart preflight；失败则No-Go拍摄 |
| Multi-Harness 太慢/太吵 | 中 | 三 pane、每人一条交付、预录真实run；3分钟版可删但完整Preview保留 |
| 真实CI failure不可控 | 中 | 使用真实test-driven reference run；结果不同就改story；绝不伪造失败 |
| UI术语过载 | 中 | 默认中文摘要，authority/method/coverage放二级detail |
| 手工配置暴露 | 高 | 所有角色、路径、endpoint、context来自Binding；任何拍摄中手工复制都是阻断性缺陷 |
| OpenCode provider projection漂移 | 高 | P0修复`npm + options`并加版本fixture；native error event必须令Execution失败 |
| OpenCode bwrap内ACP挂起 | 中 | E0使用CLI/TUI，不把OpenCode放进Team ACP；保留direct ACP事实但不夸大runtime assurance |
| Hermes TUI与ACP continuation不稳 | 中 | 只用于E4 fresh ACP participant；不承担Author、reviewer continuation或session/load |
| profile credential权限过宽 | 高 | 录制前preflight强制auth owner-only；拒绝world-writable credential/profile目录 |

# Core Implementation Gap Ledger

以下均按“是否无法诚实证明 Agent-Box 核心语义”判断。P0 项属于 **MUST BE CORE BEFORE DEMO**，但仍只使用既有 Work/Execution/Binding/Dispatch/Ref/Provider/Evidence 概念。

| Priority | Gap | 为什么新 Demo 必须 | 当前已有基础 | 最小实现 | 验收条件 | 不应该扩展成什么 |
|---|---|---|---|---|---|---|
| P0 | Production Binding aggregate + revision | 没有它就不能说明 E1/E5 启动依据 | prototype RoleBinding、Refs、架构文档 | `bindings` + ordered/versioned `binding_slots`；draft/frozen 状态；值为typed Ref/ArtifactRef | 每个 Execution恰有一个dispatch使用的frozen revision；freeze后不可变 | PRD schema、workflow step、产品专用config实体 |
| P0 | Resolve/freeze contract + per-slot assurance expectation | 区分selector、exact revision和可证明程度 | Ref metadata、provider descriptors | slot保存requested、resolved ref、required、authority、expected assurance、resolution evidence | mutable Git selector不能进入frozen；C2/M1/P1等可独立查询 | 通用policy language或证明系统 |
| P0 | Binding freeze + accepted Dispatch atomicity | 避免Dispatch接受后Binding仍改变 | dispatch idempotency和SQLite transaction基础 | 单事务校验frozen revision、创建/accept Dispatch、写event并锁定execution binding ID | 并发freeze/dispatch测试中不存在accepted dispatch指向draft/变更Binding | scheduler、queue、retry engine |
| P0 | Evidence / ExecutionResourceFact persistence | Hero对账无法用Ref列表替代 | `core_execution_refs`、events、projection | fact关联 execution、slot、expected/actual Ref、authority、method、coverage、timestamp、EvidenceRef | 可查询X/Y/M1/CR1的projected/observed事实；重复observe幂等 | tracing backend、message/event warehouse |
| P0 | Explicit Finish/Submit + FINALIZING semantics | interactive idle/process exit不能关闭责任 | Phase/projection、terminal observation | Core command请求finish；Provider finalizer幂等；Host/UI可显示READY_TO_SUBMIT/FINALIZING，Core只记录必要事件/terminal projection | 多轮后仍active；只有finish完成才固定outputs/facts并terminal；失败可恢复finalization | 把每个TUI状态加入Core ontology |
| P0 | Continuation always creates new Execution | E1 terminal + E5 active + same S1是核心镜头 | SessionRef、provider resume capability | 新服务命令从terminal source Execution读取SessionRef，创建new Execution draft/input ref；删除/禁用原地`resume_execution`路径 | 旧E永远terminal；new E有new Binding/Dispatch；native ID相同 | Execution reopen、session lifecycle mirror |
| P0 | Native correlation and output finalization transaction | Finish必须把SessionRef、commit/report与正确Execution闭合 | `apply_observation`和Ref relation | provider finalization result幂等写native/output refs、facts、terminal projection；失败留可恢复状态 | crash/retry不重复fact、不丢output、不误terminal | 通用distributed transaction平台 |
| P0 | Work-level material evidence relation | H1/H2/H3和final evidence必须可从Work历史找到 | Work events、ArtifactRef、旧work_artifacts原型 | typed relation把decision/output/evidence ArtifactRefs关联Work/Execution，不复制body | Work detail能列出D1/A1/R/F/G/final reports及provenance | Contribution、DependencyEdge、generic knowledge graph |
| P1 | Explicit operational outcome vs result artifact presentation | CI run完成但verification失败需诚实表达 | Outcome projection + ArtifactRef | Core outcome保持operational；业务结果只在provider artifact/fact schema和UI adapter中解释 | 不新增generic verdict enum；UI可同时显示terminal与FAILED report | 通用业务verdict ontology |
| P1 | Retention/cleanup facts | DSH overlay/shared base cleanup是验收项 | runtime/worktree cleanup逻辑 | cleanup结果作为facts/events；不自动等同Execution outcome | policy、targets、actual result可审计 | resource scheduler/garbage-collection平台 |
| P2 | richer assurance roll-up | Evidence摘要可更易读 | per-fact coverage | 只做派生view，不写新的truth字段 | summary可追溯到facts，unknown不被吞掉 | 自动信任评分/attestation平台 |

现有 `ExecutionService.resume_execution(execution_id, ...)` 与 `test_phase_one_service_slice_preserves_execution_through_resume...` 明确保留原 Execution ID，和冻结语义冲突。P0 修复应迁移成“create continuation Execution”，不是给旧方法换名字。

# Plugin Implementation Gap Ledger

| Priority | Gap | 为什么新 Demo 必须 | 当前已有基础 | 最小实现 | 验收条件 | 不应该扩展成什么 |
|---|---|---|---|---|---|---|
| P0 | Codex Interactive Author Provider | 真实TUI、持续交互、S1、Finish | Codex/App Server E2E和CLI存在 | start/attach/observe/finalize/resume-to-new-E；投影cwd/context/profile | 真实model turn、多轮steer、explicit Finish、crash后observe、same S1 continuation | Agent supervisor |
| P0 | GitAuthority | exact source/output facts是全片信任锚 | READY spike | resolve commit/tree、validate HEAD、capture output commit/tree/diff | freeze/launch/finish三时点全部真实匹配 | Git hosting平台 |
| P0 | WorktreeProjector | author/reviewer权限和materialization | READY spike | writer/read-only worktree lifecycle + dirty handling | reviewer不能写；writer output可固定；cleanup幂等 | workspace云平台 |
| P0 | bwrap RuntimeProjector | config/shared mount/overlay可见 | PARTIAL spike和现有launch | versioned policy compile、mount/env manifest、PTY passthrough、facts | TUI可交互；实际mount/config可probe；UI显示partial assurance | 通用sandbox平台 |
| P0 | LangGraphWorkflowResourceAdapter | 真实external Thread/Checkpoint/context | exact state/snapshot已验证 | resolve T/C、canonical context snapshot、update_state入口、evidence | C1/C2/C3 exact snapshot；失败不回退自建JSON authority | workflow engine、route mirror |
| P0 | GitHubActionsExecutionProvider | 真实exact-SHA isolation matrix | READY spike | trigger execution ref、observe run/attempt/head_sha、collect report/artifact | real pass/fail run；rerun attempt明确；head_sha严格校验 | CI scheduler或generic verdict |
| P0 | DSH fixture + verification adapter | 成品本身必须可真实启动和验证 | DSH binary rc.6；profile缺失 | 固定版本、最小tui/headless profile、A/B/C fixtures、probe/report schema | matrix可本地和Actions重复；session IDs/digests真实；secret不持久化 | DeepSeekSession/MCPServer Core实体 |
| P1 | Codex Review Provider productization | 独立review镜头 | E2E spike | read-only exact commit、criteria/schema、thread/turn、artifact digest、targeted resume | 不继承author session；JSON schema valid；reviewer continuation另建Execution | 通用review ontology |
| P1 | ACP/acpx adapter productization | Team Provider启动/观察participant | Codex三participant E2E；Hermes fresh bwrap ACP E2E | version check、fresh create/cancel/attach/events、failure mapping；resume按Harness capability gate | E4 Hermes fresh + 2 Codex可启动；不把Hermes ACP resume宣称supported | supervisor/delegation engine |
| P1 | Collaboration Gateway adapter | CG1 authority和evidence | send/read/handshake/event digest E2E | execution endpoint、registration、event range、digest、cleanup | A/B/C handshake和消息可验证；无workflow/task logic | message bus、memory、task graph |
| P1 | TeamInteractiveExecutionProvider | Multi-Harness Hero | 推荐责任结构已定，未产品化 | validate participant spec artifacts；aggregate start/attach/finalize | Core一个Dispatch；UI三个native sessions；aggregate Finish幂等 | opaque CompositeProvider、Core participant lifecycle |
| P1 | ParticipantSpec schema | 每个participant角色/权限必须在Binding可见 | ArtifactRef和Gateway participant模型 | provider-versioned JSON schema，canonical digest | A/B/C spec可展开、可重现；不落Core专用表 | Participant/Agent Core entity |
| P1 | MCP projection of Gateway tools | Harness自动获取collaboration | MCP apply基础 | execution-scoped send/read/list/handshake tools | 无手工endpoint配置；tool event与Gateway event相关联 | 把MCP当authority或message ontology |
| P0 | OpenCode v2 provider projector修复 | E0真实模型调用当前会生成`undefined/chat/completions`且exit 0 | fresh/resume/TUI在临时正确结构下已E2E | 版本化生成`npm + options`；解析native error event；权限preflight | 原`demo-opencode`不手改即可fresh/resume/TUI；错误event使Execution失败；auth非world-writable | 为OpenCode重写配置系统 |
| P1 | Hermes fresh ACP participant adapter | E4需要一个真实异构participant | bwrap内initialize/new/prompt/end_turn E2E | capability descriptor标记fresh-only；采集session/update和SessionRef | E4可稳定fresh启动；UI明确continuation unsupported | 为Hermes补通用supervisor或伪造resume |
| P2 | final artifact attestation | 增强provenance | artifact digest已有 | 对final report/commit生成可验证statement | verifier可独立校验subject digest | Preview内完整SLSA平台 |

# Host/UI Gap Ledger

| Priority | Gap | 为什么新 Demo 必须 | 当前已有基础 | 最小实现 | 验收条件 | 不应该扩展成什么 |
|---|---|---|---|---|---|---|
| P0 | Work current-state page | 开头只能有模糊Work，结尾仍需显式完成 | Work lifecycle service | objective/status/current facts/decisions，不显示未来graph | 新Work无future executions；terminal后仍Open | workflow canvas |
| P0 | Current Execution draft + Binding selector | 用户选择resources而非写prompt | profile/library UI基础 | slot cards、Ref picker、required validation、detail | 可选择C/D/A/T/C/M/P/CR/BP并生成draft | generic form builder |
| P0 | Freeze & Launch progress | Binding Hero需真实反馈 | launch/projector primitives | 由真实provider events驱动resolve/freeze/materialize/verify/start | 失败停在准确阶段；不能播放假进度 | scheduler dashboard |
| P0 | Interactive terminal attach | 用户必须实时多轮交互 | CLI launch/TUI基础 | PTY handle + attach/reconnect + execution state side rail | terminal断开不终止E；重连保留native identity | web IDE/terminal平台 |
| P0 | Finish Execution action | 责任终点不能由idle/exit推断 | Core projection | 用户command、confirm、finalization progress、recover/retry | outputs/facts完成前不terminal；幂等 | approval workflow |
| P0 | next-action decision surface | 每次只决定当前下一步 | Work/decision服务基础 | 根据artifacts展示Host建议和自由draft入口；无预定义future nodes | E结束才出现；Human可忽略建议 | progression authority |
| P0 | Evidence summary + detail | 防止变launcher | Ref/event基础 | expected/actual对照、authority/method/coverage、unknown保留 | Hero表格可由真实facts生成 | tracing viewer |
| P0 | Complete Work | H3必须由Human显式完成 | `complete_work`已存在 | final evidence/unknown review + reason | Provider/CI不能调用自动完成；Human操作可审计 | auto-close policy engine |
| P1 | Human decision artifact UX | H1/H2必须改变Binding | decision/artifact原型 | options/selected/rationale/scope/artifact digest；一键加入新draft | D1/A1/H2在后续Binding可见 | Human Task Provider |
| P1 | Team panes + Binding expansion | 三participant必须有视觉存在 | Gateway/PTY底层 | 3 pane、role/permission badge、handshake状态 | 无需逐个配置；每pane对应native SessionRef | multi-agent canvas |
| P1 | LangGraph resource detail | workflow真实但不抢镜 | adapter spike | product/thread/checkpoint/phase/snapshot digest | 不展示graph；C1/C2/C3可追溯 | workflow UI |
| P1 | CI operational/result split view | 失败镜头需避免双布尔混淆 | Actions facts | run状态与report result分栏 | completed+FAILED可同时显示 | generic business verdict |
| P1 | Work History + Audit UI | 结尾展示过去而非计划 | events/refs | immutable chronological history和filters | 无run graph/replay whole workflow按钮 | DAG/history混合画布 |
| P1 | Project-vs-manager visual framing | 避免配置管理器误读 | 无 | 固定双标签、颜色/图标域、镜头标题 | 用户测试能正确复述两者关系 | 品牌装饰性动画 |
| P2 | 3-minute edit mode | 发布渠道压缩 | storyboard | 隐藏secondary details，保留3 hero clips | 180秒内仍含Binding/continuation/evidence | 单独产品模式 |

# P0 / P1 / P2 priority

## P0 — Preview 的诚实性门槛

1. Core：Production Binding/revision/slots、freeze、Dispatch 原子性、ResourceFact/Evidence、显式 Finish、new-Execution continuation、finalization幂等、Work material relations。
2. Plugin：Codex Interactive、OpenCode Investigation + v2 projector/error parser、Git/worktree、bwrap projection、LangGraph adapter、GitHub Actions、可重复的 DSH fixture/test adapter。
3. Host/UI：Work current、Binding selector、Freeze & Launch、terminal attach、Finish、next-action、Evidence、Complete Work。

任一 P0 缺失都不应录制“完整 Preview”。尤其不能用假 Binding JSON、假 CI、手工 terminal 配置或旧 Execution resume 来绕过。

## P1 — 完整 5–6 分钟版的重要增强

- Codex reviewer productization；
- ACP/acpx + Gateway + TeamInteractive Provider + ParticipantSpec；
- Hermes fresh-only ACP participant adapter；
- H1/H2 UX、Team panes、LangGraph/CI detail、History/Audit UI；
- OpenCode v2 projector/error-event/permission修复；
- Hermes fresh-only ACP capability gate。

多 Harness 是完整 Preview 的强 Hero，但若只允许三分钟，它可以从公开剪辑中删除，不影响 Binding + interactive + continuation + evidence 的核心证明。底层已验证成果仍保留在长期版本。

## P2 — 不阻碍 Preview

- final artifact attestation；
- richer assurance roll-up；
- 3-minute专用编辑模式；
- 更完整 retention、长期统计和高级审计过滤。

# Minimal build order

## 三周核心能力顺序

### Week 1 — 冻结责任依据

1. 建 Production Binding、BindingSlot、revision 和 draft/frozen persistence；
2. 实现 resolve/freeze validation 和 per-slot assurance expectation；
3. 使 frozen Binding 与 accepted Dispatch 在同一事务内闭合；
4. 加入并发、幂等、freeze后不可变和mutable-selector拒绝测试。

周末验收：可以在没有 Provider 特判的情况下，创建 B1、freeze exact Git/LangGraph/Artifact refs，并保证 D1 只引用 B1。

### Week 2 — 让互动 Execution 能诚实结束和延续

1. 加入 ExecutionResourceFact/EvidenceRef persistence和slot关联；
2. 实现 explicit Finish/Submit、幂等 finalizer、crash/recovery；
3. 删除“原地 resume terminal Execution”的产品入口，改为 new Execution + previous SessionRef；
4. 建 Work-level material artifact/evidence relations。

周末验收：E1 多轮 active → Finish → terminal；E5 new ID/new Binding/new Dispatch → same native S1，旧 E1 不变。

### Week 3 — 一条真实 vertical slice

1. 接通 Git/worktree + bwrap + Codex Interactive；
2. 接通最薄 LangGraph T/C/snapshot adapter；
3. 用最小 Host/UI 展示 Binding freeze、terminal attach、Finish、Evidence 对账和 Complete Work；
4. 以 DSH fixture 运行 isolation/sharing最小matrix；
5. 把已有 Codex Review/GitHub Actions spike接入production contract。

周末验收：不用手工复制context/路径/endpoint，能从一个模糊Work走到一次真实Author、new-E continuation、exact-SHA CI和Human closure。

## 三周之后

再产品化 TeamInteractive/Gateway/participant panes，完成full 5–6 minute cut。不要在 Core P0 未闭合时优先打磨多 Agent 视觉效果。

# What should remain frozen in Core

- Work 是长期目标和 Human closure 边界；不拥有固定未来流程。
- Execution 是一次独立责任尝试；一个 accepted Dispatch 只有一个 accountable ExecutionProvider。
- Binding 是 Dispatch 前冻结的本次执行依据；Provider runtime manifest不是Binding替代品。
- Dispatch 是责任提交边界，不是 scheduler job。
- Ref 指向外部 identity；ArtifactRef固定不可变内容；Core不复制外部系统 payload。
- Evidence/ResourceFact 记录 actual facts、authority、method和coverage，不宣称全知。
- Workflow/Human/Host 决定下一步；LangGraph拥有workflow state/routing/checkpoint。
- CLI idle、单轮结束和process exit不自动等于责任 terminal；显式 Finish闭合interactive Execution。
- continuation必须创建new Execution/new Binding/new Dispatch；previous SessionRef只是输入。
- Provider terminal、CI pass或review success都不自动完成Work。
- participant specs、DSH session/config、MCP registry、plugin set和credential source优先用Ref/ArtifactRef/Binding slot/ResourceFact表达。

新题材没有证明这些不变量中的任何一个错误。

# What should NOT be built

本阶段不要新增：

- WorkController、ProgressionAuthority；
- WorkflowStep、Node、Edge、scheduler、generic retry engine；
- Agent、Harness、Participant、Message、Contribution、DependencyEdge Core entity；
- DeepSeekSession、HarnessConfig、MCPServer、Plugin Core entity；
- workflow state mirror、checkpoint payload store、next-node calculation；
- generic business verdict enum；
- tracing backend、message bus、agent supervisor、delegation policy；
- workflow builder、通用sandbox平台、credential vault；
- 动态plugin reload平台或DSH专用配置产品功能扩张。

ParticipantSpec 是 provider-owned versioned ArtifactRef；Gateway messages属于Gateway；CI verification属于report artifact；credential secret属于外部authority。Core只保存关系、Refs和可审计facts。

# Preview Go / No-Go verdict

## A. FREEZE MODEL AND BUILD

当前真实 Stack 足以证明 Agent-Box 的独立价值，但完整拍摄仍受 P0 implementation gates 约束。`FREEZE MODEL` 不等于“现有代码已经完成”，而是停止 ontology 发散，按既有模型补齐不可缺少的生产语义。

### 1. 这个题材是否比账单小工具更适合？

**是。** 它让 Binding、projection、authority、session continuity、Evidence coverage 和 multi-Harness 都成为问题本身的自然需要，而不是为了介绍 Agent-Box 外加的流程。代价是成品视觉性较弱，必须用三 session 对照和简洁 matrix补足。

### 2. 是否会被误解为配置管理器？

**会，这是最大叙事风险。** 修正手段是：全程双标签区分被开发产品和治理产品；主 Author 不用 DSH；一定展示 LangGraph exact checkpoint、独立 Codex review、真实 GitHub Actions、Gateway、多域 Binding/Evidence以及Human completion。不能把视频剪成“Agent-Box 启动三个带不同配置的DSH”。

### 3. 最重要的三个镜头是什么？

1. **Binding Hero**：一次选择 exact source、T/C2、D1/A1、M1/P1/CR1和runtime，然后自动准备并启动已知上下文的真实Harness；
2. **Session Continuation Hero**：E1 terminal、E5 active、same native S1、new Binding/Dispatch；
3. **Evidence Hero**：expected vs actual，同时诚实出现 verified、partial、unknown、unverifiable。

Multi-Harness 很有传播力，但它排第四；没有前三个，它只会像多Agent launcher。

### 4. 哪些 Core gap 现在必须补？

Production Binding/revision/slots、freeze、Binding+Dispatch atomicity、per-slot assurance、ExecutionResourceFact/Evidence persistence、explicit Finish/finalization、new-Execution continuation、Work-level material relation。旧 `resume_execution` 的原地恢复语义必须修正。

### 5. 哪些 gap 必须留在 Plugin/Host？

Codex/OpenCode/DSH/Git/bwrap/LangGraph/GitHub Actions/ACP/acpx/Gateway adapters、TeamInteractive orchestration和ParticipantSpec都属于 Plugin；H1/H2决策、LangGraph state update、next-action建议、Binding selector、terminal panes、History和Complete UI属于Host/UI。DSH config、MCP/plugin/credential payload绝不进入Core ontology。

### 6. 只有三周时的最小顺序是什么？

第一周 Binding/freeze/atomic Dispatch；第二周 Evidence + explicit Finish + new-E continuation；第三周 Git/worktree+bwrap+Codex+LangGraph 的真实vertical slice和最小UI，再接已有Reviewer/Actions能力。Team multi-Harness放在核心闭合之后。

### 7. 有足以推翻核心模型的 blocker 吗？

**没有。** shared resource与exact Binding的表面冲突可通过“同一Execution共享一个immutable exact materialization；新revision进入新Binding”解决。三participant可作为可见Binding resources并由一个Team Provider aggregate负责。DSH session/config仍可用Refs、Artifacts和Facts表达。

### 8. 下一阶段是否停止架构发散？

**是。** 正式进入：

```text
Core gap implementation
→ provider adapter implementation
→ end-to-end rehearsal
→ Preview recording
```

只有出现现有 Work/Execution/Binding/Dispatch/Ref/Provider/Evidence 无法表达的真实 E2E counterexample，才重新开启模型讨论；当前题材没有提供这样的 counterexample。
