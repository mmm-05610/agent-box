# Executive user-value verdict

**结论：E. 当前没有足够用户证据。**

仓库已经证明了一组可实现的 execution-accountability 机制；它没有证明有人会为此主动打开一个独立产品，更没有证明 `Work` 是自然入口。最可信的暂定方向是：**若存在需求，Core 更可能由 workflow/Host 间接调用（B），而 WorkBoard 在少数直接交互、故障诊断和审计场景中作为 observe/control console 打开。** 这不是 B 的用户验证结论，只是由当前实现边界推导出的产品假设。

本轮没有进行用户访谈、可用性测试、付费测试、遥测分析或竞品迁移研究，不能把下文的“痛点”当作已被用户确认的需求。

## Evidence vocabulary and repository boundary

本报告只检查了允许范围内的 Work Core、WorkBoard、Binding Composer、Preview runbook/storyboard、Pi/DeepSeek plugin 资料和产品重校准文档；没有读取其他 round-1 输出。

| 标签 | 含义 | 本报告中的例子 |
|---|---|---|
| **REPOSITORY VERIFIED** | 当前仓库代码、测试或脚本可直接证明。 | `dispatch_execution()` 会先持久化 frozen input/Dispatch，再调用 provider；Work 完成是单独的显式服务调用。 |
| **OBSERVED CURRENT WORKFLOW** | 当前 runbook/script 所规定、可运行或可播种的流程；不等于真实用户行为。 | Live runbook 创建一个 investigation Execution，绑定 Git/prompt/profile/tmux pane，并等待输入 `FINISH`。 |
| **REASONED HYPOTHESIS** | 从问题和仓库能力推出的可能任务/价值。 | 平台工程师可能希望把跨 authority 的 frozen binding 回传给 workflow。 |
| **REQUIRES USER VALIDATION** | 必须用目标用户的行为或结果检验，当前没有证据。 | 开发者是否愿意手动构造 Binding、为 provenance 付出启动成本、或把 Work 当入口。 |

### What is actually demonstrated today

- **REPOSITORY VERIFIED：** Work Core 有 `Work → Execution → frozen input refs/Dispatch → observation/native/output refs` 的记录路径；Dispatch 输入有 contract limit、canonical digest 与 idempotency 检查。`WorkService.complete_work()` 是独立于 provider terminal 的显式操作。[`services.py`](../../../../src/agent_box/work_core/services.py)
- **REPOSITORY VERIFIED：** WorkBoard 是单 Work 的持续轮询 chronicle；它允许创建 Execution、编辑本地 Binding draft、`Freeze & Launch`、observe、explicit finish 和 Work completion，且不生成 future graph。它把 Binding draft 和 frozen Core facts 区分开。[`agent-box-workboard/README.md`](../../../../plugins/agent-box-workboard/README.md)
- **REPOSITORY VERIFIED：** Codex/Pi plugin 都将“idle、turn 完成或 pane 死亡”与 Core Execution terminal 分开；Pi continuation 明确要求新 Core Execution。[​`agent-box-pi/README.md`](../../../../plugins/agent-box-pi/README.md) [​`agent-box-codex/README.md`](../../../../plugins/agent-box-codex/README.md)
- **OBSERVED CURRENT WORKFLOW：** 当前 live runbook 的 E1 是一个**只调查、不实现**的 Codex/tmux Execution。其 target repository 由脚本创建，初始内容只有 objective/README，且“implementation is intentionally undecided”。[​`agent-box-preview-live-runbook.md`](../../../demos/agent-box-preview-live-runbook.md) [​`prepare_target_repository.py`](../../../../scripts/preview_demo/prepare_target_repository.py)
- **OBSERVED CURRENT WORKFLOW：** `seed_preview_board.py` 可播种已结束 E1 和未 dispatch E2；`seed_preview_pi_board.py` 可播种四个未 dispatch 的 Pi research Execution。它们是预览 fixture，不是一次真实完成的 DSH plugin 交付。
- **REQUIRES USER VALIDATION：** 现有代码与设计文档不能证明任何外部用户的规模、频率、付费意愿、现有替代方案失效，或 Evidence 是否足够可信。

# Potential users and current workflows

下表描述的是应被招募验证的五类人，不是已证实的 persona。每格“当前”均为 **REASONED HYPOTHESIS**，除非另有标签。

| 潜在用户 | 现在如何完成 / 最痛手工步骤 | 发起 / 观察 / 结束 / 查看 Evidence | 频率与合理产品位置 | 为什么不用 shell、tmux、workflow metadata、GitHub 即可？ |
|---|---|---|---|---|
| 直接使用多个 coding Harness 的个人开发者 | 在 terminal/tmux 中切换 Codex、Pi、Claude 等；手工记住 repo、branch/worktree、profile、session ID 和结果。痛点是配置/工作目录漂移、续接时遗漏约束、事后不能回答“那次到底用什么跑的”。 | 开发者本人发起、观察、决定停止；未来的自己或 reviewer 看证据。 | 可能每日多次；若成立，首选轻量 direct console 或 CLI，**不是**要求先建 Work 的主工作台。 | Shell/tmux 已很快；仅当“精确输入 + native identity + 实际观测”降低重跑/误改成本时才有增量价值。个人是否在意该账本仍 **REQUIRES USER VALIDATION**。 |
| 需要 Human steer / explicit Finish 的开发者 | Harness 先产出一轮，用户再追加限制、检查 diff/test、决定何时交付；目前 terminal 退出、一次 turn 完成、任务责任完成常混在一起。痛点是责任窗口被覆盖、无法给下一次尝试保留冻结边界。 | 人发起并持续观察；人（或受托 Host）明确 Finish；人、reviewer 看输出/测试。 | 长任务、风险变更时每周到每日；最像 WorkBoard 的 **observe/control console**。 | tmux 能 attach，Git 能看 diff，却不天然关联“本次责任、冻结输入、同一 native session 的新尝试”。但若用户只需一个 prompt，系统会是多余层。 |
| 构建 LangGraph/Temporal agent workflow 的平台工程师 | workflow 发起 node/activity，自己维护 thread/checkpoint、运行 metadata、资源选择、retry 与人工 gate。痛点不是画图，而是跨 workflow、Git、workspace、harness、CI 的 exact refs 和 provider 接受事实分散。 | workflow/Host 发起；平台、SRE、审批人观察；workflow/Host 或审批人决定后续与完成。 | 每次 workflow run 均可能调用，但人通常只在异常/审批时打开界面；**execution substrate / SDK** 优先。 | 若 workflow state 已带全量 immutable refs、adapter receipt 和 evidence coverage，Agent-Box 是重复品。价值只在它确实填补这些责任边界时，需 integration prototype 验证。 |
| 需要 AI 执行审计与 provenance 的团队 | 使用 GitHub PR/Actions、日志、tracing、工单、手写 release note；调查时人工拼接 commit、CI run、agent transcript 和审批记录。痛点是来源分散、证据覆盖范围不清、provider self-report 被误认为事实。 | CI/平台或开发者发起；安全、SRE、manager/reviewer 观察；release owner/外部系统结束；审计、事故响应、客户团队看证据。 | 发布、合规审查、事故时打开；**audit/history viewer**，不是日常 IDE。 | GitHub 可证明 commit/CI，却不能自动证明交互 Harness 所见配置、workspace 与 session。反过来，若公司不需要这些事实，GitHub/trace 已足够。真实审计要求和可信链仍未知。 |
| 已有 CI/Git/workspace 平台的工程团队 | Git/PR/CI 已定义 scope、访问控制、artifact 与 review；开发者直接跑本地工具。痛点是本地/交互 agent execution 逃逸出已有平台，或跨系统输入无法复现。 | PR/CI/内部平台发起；开发、CI、release owner 观察；外部平台决定完成；reviewer 看 GitHub artifacts。 | 高频自动化、低频人机控制；**后台 library/plugin** 最合适。 | 这类团队不会接受重复 project/workflow/CI UI。只有 Agent-Box 能作为无侵入 adapter 写回 exact refs/evidence，且不取代 GitHub 时才值得接入。 |

**反证门槛：** 访谈中若四类以上受访者回答“我只需 branch + CI URL + agent transcript”，或无法举出一次因资源/会话混淆造成的可量化损失，则独立产品假设应降级；不应把“能记录更多”误写成需求。

# Independent jobs to be done

以下最多三个 JTBD 中，前两个可不依赖 workflow engine；第三个明确依赖。三者均为 **REASONED HYPOTHESIS**，尚没有强到可称“已验证独立 JTBD”。

## JTBD 1 — 直接执行的可复现责任窗口

> 当我准备让 coding harness 在一个会改代码的 workspace 中执行高成本任务时，我想在启动前冻结精确的代码、运行配置和外部能力引用，并在结束后看到哪些事实被证实，从而能复现、评审或安全地继续这次尝试。

- Trigger：切换 harness/profile/worktree、风险修改、需把结果交给他人或未来自己。
- Current workaround：shell history、tmux pane 名称、README、Git branch、截图、手工写 note。
- Failure cost：改错 worktree、使用错误 profile/凭证来源、无法解释变更来源、重复调查。
- Agent-Box intervention：Binding requested→resolved→frozen、accepted Dispatch、SessionRef 和 expected-vs-actual Evidence。
- Measurable outcome：减少“无法复现/无法归因”的执行次数；在 2 分钟内由非操作者重建输入并判断已知/未知。基线与目标尚需测量。
- 是否依赖 workflow engine：否。

## JTBD 2 — 原生 session 连续但责任重新开始

> 当我需要在同一 native agent session 上基于新反馈进行修复时，我想创建一场带新约束和新证据的 Execution，而不改写上一场尝试，从而让 Human steer、失败分析和责任边界保持可审计。

- Trigger：review/CI/人类追加约束后继续同一 session。
- Current workaround：在旧 terminal 继续聊天、用“v2/final-final”标注、另开 branch 或手记 session ID。
- Failure cost：E1 的输入/输出与 E2 混淆，无法知道哪次回应了哪个失败，错误地认为 terminal=完成。
- Agent-Box intervention：旧 SessionRef 作为新 Execution 的 frozen continuation input；显式 Finish；Work/外部 owner 最后决定是否完成。
- Measurable outcome：审阅者能在一次界面查看中区分 E1/E2 的责任、输入差异和交接证据；减少错误继续/错误关闭。需现场任务测试。
- 是否依赖 workflow engine：否。

## JTBD 3 — workflow 发起跨 authority 的可归责动作

> 当 workflow 要把一个有权限和外部资源的 agent action 交给执行 provider 时，我想得到一个不可变的 execution receipt 与证据回传，从而让 workflow 决定下一步时依据可验证事实而不是 provider 的“成功”字符串。

- Trigger：LangGraph/Temporal/内部平台运行到高风险 node/activity。
- Current workaround：将 selectors/metadata 塞入 workflow state，调用脚本，再把 run URL/日志链接写回 state。
- Failure cost：workflow checkpoint、Git revision、workspace、provider session 和 CI attempt 不可可靠关联；retry 可能改变输入。
- Agent-Box intervention：Host/SDK 提交 binding，Core 返回 Dispatch/Execution identity，adapter 以 coverage/authority 回写 evidence。
- Measurable outcome：一次失败/重试可关联到 exact input digest；workflow host 能自动拒绝 incomplete/unknown receipt。需做真实 integration 与故障注入。
- 是否依赖 workflow engine：是；Agent-Box 不拥有 workflow routing/completion。

**JTBD verdict：** 三项都描述了有意义的机制，但没有用户证据表明它们比现有脚本、GitHub metadata 或 workflow state 更值得一层产品。因此不能宣布存在清晰的独立用户任务。

# Work necessity analysis

比较对象：A = Work 必选顶层对象；B = Work 可选 grouping/history；C = 不建 Work，由外部 project/issue/workflow 提供 scope。判断的是用户价值而非 Core 是否能实现。

| 场景 | A. Work 必选 | B. Work 可选 grouping | C. 外部 scope | 最合理结论 |
|---|---|---|---|---|
| 单次独立 interactive Execution | 先填 objective，启动摩擦高；除非后续要审计，否则只是 wrapper。 | 默认直接创建 Execution，必要时事后归组。 | repo/terminal 足够。 | **B/C**；Work 必选无不可替代价值。 |
| 长期插件开发目标 | 能保留调查、实现、review、CI 与 Human decision 的事实时间线。 | 需要长期洞察时创建/关联 Work。 | GitHub issue/project 可提供目标与完成状态。 | **B**；Work 可做跨系统 chronicle，不能取代 issue。 |
| 一次 CI verification | Work 可能与 PR/commit/Actions run 重复，且多一层状态。 | 只在 CI 例外需要跨执行归档时关联。 | CI run/PR 是主 scope。 | **C/B**；CI 是外部 completion authority。 |
| 同一 native session 跨两次责任尝试 | Work 将 E1/E2 放在同一历史中，但不是新 Execution 的技术前提。 | E1/E2 可通过 exact SessionRef 关联，按需归组。 | 外部 ticket 或 parent run 也可作为 scope。 | **B**；不可替代的是新 Execution + continuation provenance，非 Work。 |
| 四个并行调研 Execution | 有一个可看聚合面和总体目标。 | 同样可归组；只有需要 Human 汇总时显示。 | LangGraph Thread、issue 或 research folder 可聚合。 | **B**；主要是展示/观察便利。 |
| 一个 Execution 的产物被两个项目使用 | 强制单一 Work 会暗示错误归属，甚至复制历史。 | Artifact/Ref 可多处引用，Work 只是其中一个视图。 | 两个 project/release 都可引用 artifact。 | **B/C**；Work 不能是 artifact ownership 边界。 |
| Human 显式完成 | 可记录一个治理决定和理由。 | 仅在 Work 真的代表待验收目标时开启。 | release/issue/workflow approval 常拥有真正完成权。 | **B**；completion 由 Human/Host **或外部系统**负责，provider 不负责。 |
| 已有 LangGraph Thread | Work 复制 goal/状态，最易变成 wrapper。 | 可把 Thread/Checkpoint 与 Work 关联，留给需要跨域证据的用户。 | Thread 是天然 scope。 | **C/B**；绝不能强制新增 Work。 |

### What Work adds, and what it does not

- **REPOSITORY VERIFIED：** Work 提供 lifecycle、objective、Execution 列表及显式 complete/reopen API；provider terminal 不会自动完成它。
- **REASONED HYPOTHESIS：** 它在“长期、跨 provider、需 Human 验收”的任务中可提供有意义的事实 chronicle、共同观察面和 closure decision。
- **只是展示便利的部分：** 将四个卡片放同屏、显示总数、把 E1/E2 排序；这些可由 issue/thread/PR 或 query view 实现。
- **不可替代的价值目前未被证明：** 没有证据表明用户不能用 issue/Thread/PR 获得同等 scope，或愿意维护第二个 completion 状态。

**建议：** Core 可以保留 Work，但产品入口应接受 `Execution` 直接创建和外部 scope reference；Work 默认可选、可后加、不可假定拥有 artifact。Work completion 是发起它的 Human/Host 的明确治理动作；若外部 workflow/PR/release 是最终 authority，Agent-Box 只记录其 Ref/Evidence，不能抢占完成权。Preview 第一屏不应从 Work 表单开始；先让观众看到一个“将以何种精确输入发起的 Execution”，再在需要解释长期目标与 Human closure 时引入 Work。

# Demo removal tests

判定基准是当前可跑的 live runbook，而非 storyboard 中尚待实现的丰富目标状态。Storyboard 是 **REASONED HYPOTHESIS / planned demo**；它自己也写明 DSH fixture/profile 尚未就绪。[​`AGENT_BOX_PREVIEW_DEEPSEEK_HARNESS_PLUGIN_STORYBOARD_2026.md`](../../../demos/AGENT_BOX_PREVIEW_DEEPSEEK_HARNESS_PLUGIN_STORYBOARD_2026.md)

| 移除项 | Demo 仍能证明什么 | 丢失什么 | 是否暴露只是 launcher？ | 是否更清楚？ |
|---|---|---|---|---|
| LangGraph | 当前 live path 仍能展示 Git/prompt/profile/pane 的 freeze、Codex session、explicit finish、部分 observation。 | 当前 runbook 本来就未绑定 LangGraph；因此没有已演示能力损失。未来若声称 workflow integration，则失去 external-context case。 | 不必然；Binding/Evidence 仍在。 | **是**，对首次观看更清楚；仅在平台场景用 5 秒 sidecar。 |
| Work | 仍能证明一次 Execution 的 contract、Dispatch、native ref、Evidence。 | 长目标的时间线与 Human closure 解释。 | 不会，只要显示 expected/actual 与 new Execution continuation；反而测试 Core 是否独立。 | **是**，先做无 Work 的 60 秒版本。 |
| tmux | 若改用可见 provider terminal 或 headless receipt，仍能证明 freeze/dispatch/evidence。 | live interactive attach、精确 pane ref、自然的 Human steer 画面。 | 风险下降：少一个“tmux launcher”视觉锚点；若只剩 launch success，则风险上升。 | 多数首看场景 **是**；保留一个简洁 terminal 即可。 |
| 多 Pi | 当前主 live runbook 使用 Codex；Pi 四路只是 seed/preview material。 | 并行独立责任的压力例子。 | **否**；多 agent 数量从不是独特价值。 | **是**；删去炫技与角色配置噪音。 |
| Binding Composer | 脚本仍可直接调用 `dispatch_execution()` 冻结四个 input，故可证明 Core 机制。 | 观众不能看到用户如何选择 requested resource 变 exact/frozen；也无法判断产品是否让人完成任务。 | **是，明显**；画面会变成 launcher script。 | 不应删；可缩为 3 个资源、一次 Review。 |
| Evidence reconciliation | 仍能显示 provider 启动及 native session。 | “实际发生了什么、哪些未知”的唯一差异化闭环；也无法区分 provider-reported 与 independent facts。 | **是，决定性**。 | 不应删；应只显示 2 个 verified/partial/unknown 对比项。 |
| session continuation | 仍证明单次 accountable dispatch。 | “同 Session 但新责任”的关键责任模型和对终端续聊的替代。 | 部分是；仍不是纯 launcher，但少了最强历史断点。 | 首版可先删以缩短；第二段/第二个视频必须保留。 |
| CI | 当前 live runbook没有 CI。 | plugin 结果的独立可重复验证和失败反馈。 | 不改变当前 launcher 风险。 | **是**，从最小闭环删去；在“目标插件真实完成”版再加。 |
| Human Complete Work | 当前 runbook要求 Finish E1，未强制演示 Complete Work。 | Work 不等于 provider terminal 的教学点。 | 不改变 Execution 本体；删除会让 Work 的必要性更可检验。 | **是**，若首版无 Work；若展示长期 Work，保留 5 秒收尾。 |

## Falsification consequence for the current theme

当前题材声称的用户结果是“session-local config 隔离且 MCP/plugin/credential source 共享”。**当前 Demo 不能证明该结果：** live script 的 prompt 明确要求 investigation only；target repo 是空的初始 scaffold；Pi plugin 证明的是 Pi/DeepSeek research execution 与 credential 引用不落盘，不是 DSH multi-session plugin。任何视频若把 E1 terminal 或 seeded E2 当作“插件已被验证”都属于错误陈述。

# Minimal irreducible demo

最小不可删除闭环不是 Work、LangGraph、CI、tmux 或多 Pi，而是：

```text
一个真实的、可改变 workspace 的 Execution
  → 人/Host 选择 3 个必要 input（workspace revision、responsibility artifact、harness/profile）
  → requested 解析为 exact refs 并 Freeze
  → Provider accepted Dispatch，显示独立 native SessionRef
  → Human 显式 Finish，回收 actual workspace/result facts
  → Evidence 明确标出 verified / provider-reported / unknown
  → 因新反馈在同一 Session 创建 E2（新 Binding），绝不重开 E1
```

这条闭环才同时反驳“只是 session UI”和“只是 tmux launcher”：它要求 contract 在启动前冻结、事实在结束后对账、continuation 不能改写历史。Work 可作为可选 parent，workflow/CI 作为后续压力测试。

**尚未达成的最低真实结果：** 若继续使用 DeepSeek Harness 题材，必须在录制前加入真正的 DSH fixture 和一个可重复的验证命令，至少证明：A/B config digest 不同；共享 source digest 相同；credential 仅为 reference 且 scoped scan 的结论标为 partial；失败时 evidence 说明 coverage。否则应换成一个已有可运行 target，不得用 storyboard/seed 数据补足。

## Alternative 30–90 second demos

| 场景 | 30–90 秒可展示内容 | 它检验的定位 | 首看理解预测 |
|---|---|---|---|
| 1. 完全没有 workflow engine | 0–15 秒：从一个已有 repo 的未 dispatch Execution 打开 Binding，选择 `HEAD`、责任 artifact、Codex profile；15–30 秒：requested→exact→frozen，accepted Dispatch；30–55 秒：agent 做一项真实小改动；55–75 秒：Finish 后展示实际 HEAD/输出与一个 unknown；75–90 秒：因 review comment 以同 Session 新建 E2。 | Agent-Box 是否能独立于 DAG 而管理一次可归责 execution。 | **最强。** 观众只需理解“这一次交给谁、基于什么、实际发生什么”。若仍被看成 launcher，独立价值应被否定。 |
| 2. LangGraph 发起一次 Agent-Box Execution | 0–15 秒：Host 显示 Thread `T`、Checkpoint `C12`；15–35 秒：Host 将 C12 snapshot 和 repo ref 交给 Agent-Box，获得 Execution/Dispatch receipt；35–60 秒：provider terminal/CI 返回 evidence；60–75 秒：Host 只读取 receipt 决定下一步，画面标明 routing 仍属 LangGraph。 | Agent-Box 是否是 workflow 的 execution-accountability substrate，而不是 graph UI。 | 对平台工程师较强；对一般首次观众较弱，因为他们先要理解两套系统。 |
| 3. 只作为 library/plugin 嵌入 Host | 0–20 秒：一个 Host CLI/IDE command 调用 library，显示输入 selector 与返回的 exact refs/digest；20–45 秒：provider 接受并返回 native correlation；45–70 秒：Host 的 PR/issue panel 展示 receipt 与 partial evidence 链接。没有 WorkBoard。 | Core 是否可作为 SDK/plugin 提供增量，而 WorkBoard 是否只是可选 inspector。 | 对工程团队很可信，但视觉感染力最低；若这是唯一能得到明确 pull 的形式，应接受 D，而不要强建独立 UI。 |

**优先顺序：** 先录制/测试场景 1。只有场景 1 已被理解且用户要求 workflow integration 时，再测试场景 2；场景 3 用于决定产品包装而非向首次观众解释概念。

# WorkBoard role assessment

## Recommended role

**主定位：observe/control console；次定位：Binding debugger 与 audit/history viewer。** 它不应是所有用户的主操作界面、workflow canvas 或长期仅用于 Preview 的临时 UI。对于 SDK/Host 触发的 execution，它应按需打开到一个 Execution/Work 的 facts，而不是要求用户从 WorkBoard 开始。

| 检查项 | 当前判断 | 证据与影响 |
|---|---|---|
| 选择过多 | **部分是。** New Execution 先选 provider、再输入 responsibility、再进入 composer；首看者需要理解 provider/contract/adapter。 | 当前 app 的表单与 composer 为真实实现。对普通开发者应由 Host 预填/简化，而不是删掉 expert path。 |
| 太像启动表单 | **是，有风险。** 未 dispatch E 的主要动作是 Compose Binding / Freeze & Launch。 | 若没有随后 expected-vs-actual evidence，它会被合理地看成 launcher。 |
| 太像 workflow canvas | **否。** UI 是 chronicle/history + selected inspector；代码和 README 都禁止 future graph/auto progression。 | 这是明确优点，应保持。 |
| Provider 配置泄漏 | **大体否，但 provider 选择仍暴露。** Pi 的 model/credential config 在 plugin-owned config，不在 Binding；Composer 按 resource slots。 | 当前 UI仍展示 provider id/contract id，技术术语对新人不友好；需 label 为“执行工具/本次资源”，并默认隐藏 advanced refs。 |
| Binding/Evidence 价值是否直观 | **Binding 较直观，Evidence 仍不足。** Binding draft/frozen distinction 与 requested/exact review 已有；但 WorkBoard model 的 `coverage` 固定为 `coverage unavailable`，Evidence modal 主要列 Ref/计数并说明 independent coverage unknown。 | 不应宣称已提供可信 reconciliation UX；需要真实 expected-vs-actual matrix、authority/method/coverage 的可读呈现。 |
| 用户离开脚本后仍能完成任务 | **部分具备，非通用。** WorkBoard 有 explicit controls；Pi 宣称 recover，Codex runbook 另有脚本恢复，且 runbook 明说不会伪造通用跨进程 provider-handle recovery。 | 不能将“可离开脚本”作为产品承诺，直到 provider-owned recovery 对目标 provider 做成可发现、可测试的 capability。 |

**REQUIRES USER VALIDATION：** 用户是否愿意在 TUI 手工 Add/Replace/Remove Binding，而非让 IDE/CLI/workflow host 自动生成，是最高风险的 UX 前提之一。

# Viewer comprehension test

将 Preview 当作可证伪实验，而非产品宣传。招募没有参与设计的目标用户；每位看同一未经讲解的 3–6 分钟录像，然后在不回放的情况下口头回答。不要给选项或解释性旁白提示答案。

| 观看后问题 | 合格答案必须包含 | 失败信号 |
|---|---|---|
| Agent-Box 管什么？ | 一次 Execution 的 frozen cross-system inputs、Dispatch responsibility 与 evidence reconciliation；不管理 agent 对话本身。 | “它启动 tmux/Codex”或“它管理 DeepSeek 配置”。 |
| 它和 LangGraph 的关系？ | LangGraph 决定 workflow/thread/checkpoint/下一步；Agent-Box 可绑定一个 exact context 并记录实际 execution。 | “Agent-Box 是 LangGraph UI/替代品”。 |
| 为什么不是 tmux launcher？ | 启动前 exact binding，启动后 independent/native facts 与 expected-vs-actual evidence，且 terminal 不能自动完成 Work。 | “多了一个窗口来开 agent”。 |
| Binding 与 config 有何区别？ | Binding 是本次 Execution 选择并冻结的 refs；provider/harness config 是插件/运行环境自己的长期设置，secret 不进入 Binding。 | 把 model、MCP JSON、credential 值当成每次表单配置。 |
| 为什么同一 Session 要新建 Execution？ | Session 可连续，但新的责任、约束、证据和 Dispatch 必须有新的时间边界。 | “恢复旧任务继续即可”。 |
| 什么事实被证明，什么仍未知？ | 至少说出一个 exact/verified fact 和一个 provider-reported/partial/unknown fact，以及证据 authority。 | “全部成功”或不区分 confidence。 |
| 为什么 Execution terminal 后 Work 仍 Open？ | provider 只能完成自己；Human/Host/外部 workflow 仍要判断目标、CI、review 与 unknown。 | “系统忘了关 Work”。 |

### Acceptance rule

- 每题必须由至少 4/5 名首看者独立答对，且“不是 tmux launcher”“Binding vs config”“terminal vs Work Open”三题必须全部达到该阈值。
- 观众必须能指出画面中一个真实 evidence source，而不是复述旁白。
- 任何一题未通过，即故事不成立；先删镜头/改可观察事实再重测，不靠增加架构解释补救。
- **当前预测：不通过。** 当前 live runbook没有 LangGraph、CI、DSH fixture 或真实 plugin acceptance matrix；WorkBoard Evidence 覆盖信息也不足以使新观众稳定回答“已证明/未知”。此为 **REASONED HYPOTHESIS**，须以测试证伪。

# Highest-risk product assumptions

风险按“错误后会使产品定位失效的程度”排序；均为 **REQUIRES USER VALIDATION**。

| 排名 | 假设 | 失败意味着什么 | 最低成本验证（不在本轮实施） |
|---:|---|---|---|
| 1 | 用户愿意主动构造 Binding。 | 独立 WorkBoard 退化为复杂 launcher；必须由 Host/SDK 自动生成。 | 让 5 位多-harness 开发者在真实任务中分别使用“手工 composer”和“自动候选 + confirm”；量时、误选、放弃率。 |
| 2 | exact provenance/evidence 比 GitHub/trace metadata 有足够增量。 | 审计故事不成立，Core 只是重复日志库。 | 取 3 个真实 incident/review，要求团队用现有工具和 Agent-Box mock 分别回答输入/实际/unknown；比较用时和错误。 |
| 3 | Work 是自然入口且第二个 completion lifecycle 可被接受。 | Work 必选会造成启动摩擦和状态冲突。 | A/B 原型：直接 `New Execution` vs `Create Work → Execution`；观察任务完成率，并问何时愿意创建 Work。 |
| 4 | workflow 平台愿意把 execution responsibility 交给外部系统。 | 最有规模的 B2B integration path 不存在。 | 为一个 LangGraph/Temporal internal workflow 写只读 receipt adapter；访问 3 名平台工程师，测试 callback schema、ownership、retry/approval 冲突。 |
| 5 | Evidence 的 authority/coverage 足以建立信任。 | “verified”成为危险 UI 词，甚至增加审计风险。 | 做一份故意 partial/contradictory fixture，请安全/SRE reviewer 标注可相信/不可相信的结论；测误判率。 |
| 6 | 多 harness 直接用户群足够大且问题足够频繁。 | 个人桌面产品的 TAM/频率不足。 | 7 天 diary study：记录每次切换工具、worktree、profile、session continuation 和真实代价；不只问偏好。 |
| 7 | continuation 新 Execution 的模型符合用户心智。 | 用户会绕过系统继续旧 terminal，历史模型失去价值。 | 在 review-failure scenario 中给两种 UI，测用户是否能解释 E1/E2 和选择正确动作。 |
| 8 | 目标 DSH 插件题材本身代表可购买任务。 | Demo 即使精彩也只是内部自举/边缘问题。 | 访谈 DSH/agent platform 使用者，先问现有 session config isolation/共享 capability 的事故和预算，再展示概念。 |

# Low-cost validation plan

不实施，只定义最小顺序；每一步都允许否定前一步的乐观叙事。

1. **问题发现（1 周，8–10 人）：** 2 位多 harness 开发者、2 位需要 human steering 的开发者、3 位 workflow/platform 工程师、2 位审计/安全/CI owner。采用最近一次真实任务回溯，收集原始命令、ticket/PR/trace 链和失败成本；禁止先演示产品。
2. **Artifact test（2–3 天）：** 用静态 expected→actual evidence card 和 E1→E2 continuation card，不运行产品。要求参与者回答上节七题并排序“会替换什么”。若不能理解，先改叙事，勿扩展 adapter。
3. **Wizard friction test（1 周）：** 让 5 位用户完成一次真实或合成但有后果的 dispatch；比较 direct execution、auto-binding confirm、full composer。成功标准不是“能完成”，而是比现有 shell/workflow metadata 少一次错误或少 20% 重建时间。
4. **Host integration spike（1 周）：** 仅接一个外部 LangGraph/Temporal/内部 Host，证明 external scope、idempotent receipt、known/unknown evidence callback；不增加 workflow engine 功能。若 Host 只想写自己的 metadata，则转向 SDK 或停止该路径。
5. **真实 target acceptance（并行前置）：** 建立 DSH fixture 与 isolation/shared-capability test matrix；把每条证据写 authority/method/coverage。未完成前，不录制“插件已证明”的 Demo。
6. **定位决策门：** 若 direct-user workflow 每周没有至少一次高成本触发，停止独立 WorkBoard 主入口；若 Host integration 获得明确 pull，则优先 SDK/plugin，WorkBoard 收缩为 inspect/debug UI。

# First-round conclusion

Agent-Box 当前最扎实的不是“用户会主动管理 Work”，而是一个可被 Host 利用的语义：把一次 agent execution 的**预期输入、接受的 Dispatch、native identity、实际 evidence 与 unknown**保持在同一责任记录中。仓库实现和 Preview runbook使这个说法具备可测试的技术基础。

但本轮没有任何用户证据证明该技术基础是独立产品任务；而当前 DeepSeek Harness 主题的 live path 只完成调查、没有真实插件 fixture/验收，不能作为用户价值的证据。最诚实的下一步不是扩张 Work、LangGraph、Pi 或 CI 镜头，而是先用无 workflow、可直接对比 shell 的最小 execution/evidence/continuation 闭环测试理解与摩擦；同时让一个真实 Host 决定是否需要 SDK receipt。

因此本轮选择 **E. 当前没有足够用户证据**。B（主要由 workflow/Host 间接使用）是应优先验证的方向，不能提前当作产品结论；若它失败，WorkBoard 应收缩为审计/debug 辅助界面或 SDK/plugin 的演示工具，而非继续建设成一个更复杂的 launcher。
