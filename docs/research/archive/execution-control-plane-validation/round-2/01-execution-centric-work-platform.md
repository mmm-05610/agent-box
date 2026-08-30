# Round 2 / 候选 A：Execution-centric Work Platform

本报告日期为 **2026-08-27**。本报告是第二轮对抗验证中候选 A 的设计稿：目标不是宣传，而是把它设计成**最强、最具体、可以被第三轮攻击**的形态。所有结论按以下标签标注：

| 标签 | 含义 |
|---|---|
| **REPOSITORY VERIFIED** | 由当前仓库代码、测试、插件或仓库内文档直接支持（含本设计者本轮亲自核对的源码位置）。 |
| **ROUND-1 EVIDENCE** | 由第一轮四份验证报告与产品校准报告建立的结论，本轮照单接受、不再重证。 |
| **REASONED PROPOSAL** | 从已验证事实推导出的候选 A 设计判断，可能被第三轮推翻。 |
| **REQUIRES USER VALIDATION** | 必须由真实用户行为检验，当前无任何证据。 |

## 接受的第一轮事实（不再争论）

1. 独立 Execution Core 语义部分成立（跨系统责任窗口、冻结输入、幂等 Dispatch），但独立产品尚未成立。**[ROUND-1 EVIDENCE]**
2. Work 必选没有被证明；GitHub Issue、LangGraph Thread 等可能是 Work 的充分替代。**[ROUND-1 EVIDENCE]**
3. Binding 底层零件（digest、immutable manifest、secret reference）已经商品化；统一跨 authority contract/reconciliation 尚未商品化，且证据 reconciliation 是主要差异化与最弱实现。**[ROUND-1 EVIDENCE]**
4. WorkBoard 尚未被证明是用户主动入口；入口评分在红队 subordination test 中为 0。**[ROUND-1 EVIDENCE]**
5. 本候选**不得**通过加入 DAG、Node、routing、scheduler、retry 来增强——这些属于 workflow substrate 责任域，第一轮已明确划出。**[ROUND-1 EVIDENCE]**

另有一条本设计赖以成立、经本轮亲核的仓库事实：当前 `Execution.work_id` 是**必填外键**（`src/agent_box/work_core/models.py:77`，构造时强制非空），`WorkService` 只有 create/complete/reopen 三个操作（`services.py:27-44`）。这条事实直接决定了第 2 节模型选择与第 6 节最小 Core 变更清单。**[REPOSITORY VERIFIED]**

---

# 0. 执行摘要

候选 A 的定义：

> **Agent-Box 是一个人与 Host 共用的"下一次执行"决策台：你带着一个模糊目标来，它把你的下一步意图变成一次冻结了精确输入的责任提交（Execution + Binding + Dispatch），替你收集能证明的和不能证明的事实，然后把决定权还给你——一次只做一步，历史自己长出来。**

产品节奏是核心卖点：**不计划未来，只提交现在**。每一步都是显式的 freeze → dispatch → finish → evidence → decide-next 循环；LangGraph、Temporal、GitHub 各自拥有它们的 routing/retry/history，Agent-Box 只拥有每一次"提交—对账"边界。

判定预告：候选 A 以 **B 模型 Work（可选但一等聚合）** 成立（见第 2 节），最终判词为 **B. 候选 A 只有在 Work 可选时成立**（见第 12 节）。它带 7 条可测量的 kill criteria 进入第三轮。

---

# 1. 产品定义

## 一句话定义

**REASONED PROPOSAL**

> Agent-Box 把模糊工作目标变成逐次承诺的可归责执行：每次启动前冻结"用什么精确依据、交给谁"，结束后对账"实际发生了什么、哪些仍未证明"，Human/Host 在两次执行之间做所有下一步决定。

## 主要用户

**REQUIRES USER VALIDATION**（persona 来自 round-1 用户研究第 3 节，此处为其设计取舍）

主用户：**同时使用多个 coding harness、需要人工 steer 并亲自为结果负责的开发者与小团队负责人**。他们的日常是：切换 worktree/profile/session，多轮纠偏后交付一轮结果；事后要回答"上次那次到底用的什么跑的"。次级用户：需要给 agent workflow 步骤提供责任凭据的平台工程师（他们让 Agent-Box 处于被调用地位，见第 4 节）。

## 用户为什么主动打开 Agent-Box

**REASONED PROPOSAL**（打开动机可推导，频率必须验证）

两个时刻会主动打开，一天数次、每次短驻留：

1. **提交前**："我要让 Codex/Pi 改这个仓库——先确认它会拿到哪个 commit、哪份 prompt、哪个 profile、哪个终端，确认后再放行。"这是一次**有后果动作前的检查点**，不是日常闲逛。
2. **结束后**："这次到底发生了什么？哪些被证实、哪些只是它自己说的？基于此我下一步做什么？"这是**决策时刻**，Agent-Box 是唯一同时看得到冻结合同与跨系统事实的地方。

其余时间用户留在 IDE/harness/issue 里。候选 A 不要求用户常住 WorkBoard——它要求的是**关键动作发生在 WorkBoard**，这与"不是所有工作的主工作台"一致（见第 7 节）。

## 它替代或补充哪个工作位置

补充 terminal/tmux+IDE 与 GitHub Issue 之间的空档；替代的对象是一套**手工台账**：shell history 翻找、目录里的 NOTES.md、"v2-final-final" 分支命名、靠记忆串起的 session ID 与 profile 名。round-1 用户研究确认这类 workaround 存在但未量化损失。**[ROUND-1 EVIDENCE]** 替代是否成立 = kill criterion K5/K6。**[REQUIRES USER VALIDATION]**

## 四个"不是"

| 不是什么 | 为什么 |
|---|---|
| **tmux launcher** | tmux pane 只是本次 Binding 中一个被冻结的资源槽。Launcher 关心"怎么开起来"；候选 A 关心三件 launcher 不做的事：启动前把 requested selector 解析成 exact Ref 并冻结 digest；启动后从各 authority read-back 实际状态并对账；terminal ≠ 完成，Human 显式 Finish 才关闭责任窗口，同一 native session 的续干是新 Execution。运行画面里 pane 甚至可以不存在（headless App Server 或 CI provider 同样成立，见去组件检查）。**[REPOSITORY VERIFIED]**（explicit finish、continuation、evidence 分层均为现有代码路径） |
| **GitHub Issue 复制品** | Issue 拥有协作语义（assignee、评论、sub-issues、自动关闭）；候选 A 的 Work 刻意不拥有这些（第 2 节明确禁止列表）。当 Issue 已存在时，正确做法是把 issue 记进 Work.metadata 的 external ref，让两套 lifecycle 并行而不是复制状态。Work 的不可替代部分只有一条：**在"人挨个提交执行"的产品节奏中充当目标锚点与已完成执行的历史容器**。若用户全程无此需求，Work 可以完全不出场（B 模型保证这点可被演示，见第 8 节）。**[REASONED PROPOSAL]** |
| **LangGraph 弱版本** | LangGraph 决定 what runs next 并以 checkpoint 保证恢复；候选 A 一个都不做。它们是上下位而非竞争：Thread/Checkpoint 作为被冻结的 Binding Resource 出现（WorkflowInstanceRef + exact CheckpointRef），run 循环、Send worker、interrupt/resume 全部留在 LangGraph。反过来 LangGraph 也做不到候选 A 的事：它的 event/checkpoint 历史不能证明外部 Git/workspace/profile 的实际 read-back，也没有 Human Finish 责任边界。**[ROUND-1 EVIDENCE]**（round-1 技术审计 desired-vs-actual 对照表） |
| **不仅是审计 dashboard** | Dashboard 只读；候选 A 的一半价值在写入侧的动作——Binding 确认、Freeze & Launch、explicit Finish、continuation 创建、Work complete。它是 observe/control console：每个证据面板都通向一个合法控制动作（README 定义的操作集 `n/c/l/a/f/w/x`）。**[REPOSITORY VERIFIED]** |

---

# 2. Work 的具体价值

## 选择：B — Work 可选但一等聚合

**REASONED PROPOSAL**，并附理由链。

三个模型的判决已在 round-1 反复压过：A（必选）缺乏被证实的必要性；C（纯外部投影）杀死了候选 A 自己的起点叙事——"从一个模糊目标开始"如果没有 Agent-Box 自有的 Work 对象就无处落脚，产品退化成 SDK。B 是唯一同时满足以下三点的模型：

1. 候选 A 的人类节奏（fuzzy goal → next execution → history）需要 Agent-Box 自有的目标锚点；
2. 程序化节奏（CI webhook 触发的一次修复、LangGraph node wrapper 的调用）不需要也不应该被迫伪造一个 Work；
3. round-1 事实 #2 要求 Work 的存在性由使用证明，而不是由 schema 强制。

**因此候选 A 的产品规则是：人可以不带 Work 直接创建 Execution；但如果人在产品里工作，第一次执行落地时就会自然出现 Work（默认行为，见下文惰性归组）；Issue/Thread 可整体顶替 Work 的位置。** 这条规则同时是对抗性的诚实声明：候选 A 承诺的不是"Work 不可缺少"，而是"在有 Human 节奏的场景里 Work 是最好的容器"。

## Work 独立拥有的最小语义

全部落在当前实现已有字段上，零新增实体：**[REPOSITORY VERIFIED]**

```text
Work = identity + objective 快照（创建时不许改）
     + Execution 归属（member Executions）
     + 显式 closure record（lifecycle: open/completed/abandoned
       + closure_reason + actor/时间戳走事件表）
     + metadata（承载 external refs、创建来源等约定字段）
```

就这么多。没有 acceptance criteria、没有参与者、没有 SLA 字段、没有依赖图——第 2 节末尾的禁令清单全部继承 round-1 结论。

## 哪些状态属于 Work

- 自身 lifecycle 与 closure 理由（human 写入的唯一权威记录）；
- member Executions 的有序时间线（由 execution.work_id 投影而来，不额外存状态）；
- 元数据约定字段：`external_ref`（指向 Issue/Thread/Project）、`originator`（human/host/plugin）。

## 哪些绝不能属于 Work

**REASONED PROPOSAL**（继承 round-1 责任域划分）

- 未来 plan / next-step 列表 / DAG / dependency graph；
- artifacts 的所有权（artifact 属于产生它的 Execution；其他 Work 通过把该 ArtifactRef 冻结为自己的 input 来消费它——当前 artifact-context contract 已支持这种表达，见下文"产物服务多个 Work"）；
- participants/approvals/SLA/deadline 等协作与治理字段（阶段 validation 前 metadata 都不放）；
- 任何由 provider 状态反推的状态。provider terminal 永远不推进 Work lifecycle。

## Work completion authority

**完成权永远在 Human/Host（或其指定的外部系统），永不自动。**

- 默认：Human/Host 在查过 evidence 后显式 complete（带 reason）或 abandon；reopen 同样显式。当前 `complete_work()/reopen_work()` 即此语义，provider terminal 不会触碰它。**[REPOSITORY VERIFIED]**
- 外部权威场景：release manager 在 GitHub 上关闭 issue 时，Agent-Box 不拦截、不复制 close 动作，只在 evidence 时间线记录一条 external-completion 观察并把 Work 标记为 `completed (by external authority: github#123)`——写法用现有 Observation 通道，coverage 标注 issuer 为 github adapter。
- 诚实声明：round-1 已指出外部 issue 系统同样拥有显式 closure/reopen，因此**这不是 Work 的独占语义**；独占性主张只能建立在"完成决策所需的证据刚好只有 Agent-Box 齐备"上——这正是第 5 节和 K4 要检验的东西。

## 外部 Issue/Thread/Project 已存在时如何处理

**REASONED PROPOSAL**

- 不迁移、不复刻状态、不双向同步。将外部对象作为 typed external ref 存入 `Work.metadata["external_ref"]`（如 `github-issue:org/repo#482`、`langgraph-thread:T-9c2…`）。
- 协作、评论、审批继续发生在外部系统；责任窗口与证据继续发生在 Agent-Box。两边各自 lifecycle，互不领导。
- 若用户从头到尾只想用 issue：允许"issue-first 导入"路径——从 external_ref 创建 Work 时 objective 自动取 issue title，此后 issue 关闭时 issue-first 用户的 Work 由他们自己手动 complete 或忽略。绝不自动跟随（避免第二个 lifecycle 状态机的双头权威问题）。

## 一个 Execution 的产物服务多个 Work

**归属不转移，消费即引用**：E1（属 W-A）产出 ArtifactRef X（OUTPUT relation）。W-B 下的 E3 需要这份产物时，把 X 冻结为 E3 的 INPUT（artifact-context contract，contract 机制已存在于 preview-resources 插件并在 live runbook 中演练过 prompt artifact 的同构用法）。于是 X 同时出现在两个 Work 的历史里：一处 OUTPUT、一处 INPUT，责任方向清晰，无需多对多 membership，也无需复制历史。今天的 Core 无需修改即可表达此语义。**[REPOSITORY VERIFIED]**

## 删除 Work 后候选 A 是否仍成立

分层回答：

- **机制成立**：删掉 Work 实体，freezing/dispatch/evidence/continuation 全部照常——这正是去组件检查里"去掉 Work 是否成立"必须回答 yes 的原因（第 8 节），也是 B 模型优于 A 的证明义务。
- **产品叙事受损**：没有了"模糊目标 → 历史自然成形"的开场与人类节奏锚点，候选 A 缩水为一个更诚实的名字（governed execution console）。
- **结论**：如果生产数据显示用户全部经由 Issue/Thread 工作而从不打开 Agent-Box 的 Work 视图（kill criterion K2），候选 A 应收缩为 C 模型 + control plane，判词随之降级——这一降级路径在第 10 节写成显式退出条件。

## 禁令继承

不为证明 Work 必要而新增审批、SLA、participant、workflow step、dependency graph 等 ontology。上文全部最小语义均未越界。**[ROUND-1 EVIDENCE]**

---

# 3. 核心用户旅程

以 live runbook 已验证的现实流程为骨架（其中 90% 步骤今天就能跑）：**[REPOSITORY VERIFIED]**（step 结构与快捷键契约）/ **REASONED PROPOSAL**（auto-suggest binding 与惰性归组为新增体验设计）。

```text
T0  User 打开 WorkBoard，新建 Work："给 DSH 开发多会话配置插件"
      —— 一句话，模糊的。没有计划视图、没有步骤列表。（Core: Work created）
T1  User 按 n 创建"当前这一次 Execution"
      —— 只问两件事：responsibility intent（一句自然语言）
         和 provider（默认取上次用的 codex-tmux-interactive）。
      惰性归组：T0 被跳过时，此刻自动建骨架 Work 并提示改名，
      允许"仅本次不留名"。 （WorkBoard/Host；Core: Execution created）
T2  Host 预填 Binding draft：
      workspace selector=HEAD、prompt artifact、profile=codex-plus、
      pane=%2。draft 只是本地文件，此时没有任何 Core 副作用。
      —— Binding 是【自动建议 + 一次性确认】：Composer 逐项展示
      requested selector → resolver → 将解析成的 exact pin，
      User 整体 Review 后放行。逐项 Add/Replace/Remove 保留为高级路径。
      【REQUIRES USER VALIDATION】这是 round-1 风险假设 #1，K3 直接测量。
      （WorkBoard/Host 构造 draft；Provider plugin 提供 resolver）
T3  User 按 l：Freeze & Launch。
      Core 单事务冻结 (contract_id, Ref) associations + inputs_digest，
      resolve，validate against input_limits，调 provider.start，
      落 accepted Dispatch。（Core）
T4  Provider 在 %2 启动 Codex TUI；User 离开 WorkBoard 进入真正的交互，
      多轮 steer。pane idle、turn 完成【都不会】结束责任窗口。
      （Harness 内交互；Provider plugin 观察 projection 回写 Core）
T5  User 干完了，回到 WorkBoard 按 f：explicit Finish。
      Provider 固定 scrollback/session JSONL/workspace facts 为带 digest
      的 ArtifactRef，Execution 转 terminal。（WorkBoard 触发；Provider plugin 执行；
      Core 固化 observation+artifacts）
T6  User 按 e 查看 Evidence：expected-vs-actual 矩阵，每行标
      verified / provider-reported / unknown / unverifiable +
      authority/method/coverage（呈现规范见第 5 节；实现缺口见第 6 节 v1）。
      （WorkBoard 渲染；事实来自 Core + plugin observation）
T7  Review comment 到了。User 基于 E1 卡片"从这里续"：
      新建 E2，S1(SessionRef) 作为 frozen continuation input，
      provenance 记 continuation_of=E1。E1 永不 reopen。
      （WorkBoard/Host 动作；Core 新 Execution；HARNESS 保持 session 连续；
       外部系统无角色）
T8  CI 绿了、review 过了、unknown 清零。User 按 w：Complete Work（reason）。
      下一步永远是人的决定；没有任何引擎接管。
      （WorkBoard；Core 完成 Work lifecycle 转换）
```

操作归属总表：

| 操作 | Core | WorkBoard/Host | Provider plugin | 外部系统 |
|---|---|---|---|---|
| Work 创建/完成/重开 | 持久化 + 事件 | 发起按钮/表单 | — | 可选持有协作 lifecycle |
| Execution 创建 + intent | id/身份/时间戳 | 表单与惰性归组逻辑 | — | — |
| Binding draft 组装 | 无副作用 | composer UI | 提供 resolver 能力 | Git/tmux 等被查询 |
| Freeze & Launch | 事务冻结/digest/idempotency/accepted | 确认触发 | `start()` 真实拉起 | — |
| 交互与 steer | 仅接收 projection | 展示 attach 命令（`a`） | 拥有 native loop | — |
| Explicit Finish | 固化 terminal/artifacts | Finish 按钮 | 采集 scrollback/facts | — |
| Evidence 对账呈现 | 存储 claims/refs/digests | expected-vs-actual 渲染 | 供 method/issuer | Git/CI 权威回读 |
| Continuation | 新 Execution + lineage | "从这里续"入口 | resume/fork session | — |
| Work complete | lifecycle 写入 | 人按下并给理由 | 永不自动 | 可选并行权威 |

外部 workflow/project system 在整个旅程中的位置：**T7 的 review comment 可能来自 GitHub，T8 之后 release owner 可能去 issue 关单**——它们在自己的地盘上运转，Agent-Box 只通过 Binding Resource（T2 的 refs）与 external completion 记录（T8）与之相连。

---

# 4. Workflow 关系

三种情况的行为均已界定，与 round-1 校准报告的 Mode A/B/C 对齐：**[ROUND-1 EVIDENCE]** 归类为设计裁决时标 **REASONED PROPOSAL**。

## 情况一：完全没有 workflow engine（默认与主角）

旅程即第 3 节全流程。所有 decisions 在 Human/Host 手里，Agent-Box 是顶层产品。four parallel research tasks 场景：**由 Host（人或脚本）创建四个独立 Execution**，同挂一个 research Work；每个有自己的 Binding、Dispatch、Finish、Evidence。并行数量从来不是卖点——独立责任窗口才是。

## 情况二：LangGraph Thread/Checkpoint 作为 Binding Resource

LangGraph 继续推进它自己的 context（C1→C2）。当某次执行需要一个确切的上下文版本时，Host adapter 把 Thread T 的 exact checkpoint 冻结为 Binding 输入：

```text
WorkflowInstanceRef(langgraph, thread=T)
CheckpointRef(langgraph, checkpoint=C2, snapshot-digest=…)
ArtifactRef(frozen context snapshot)
```

冻结之后无论 LangGraph 后续怎么 fork/rerun，本次 Execution 的合同不变。LangGraph 不需要知道 Agent-Box 存在。**[REASONED PROPOSAL]**（机制沿用现有 Ref 类型与 adapter 模式；专门 adapter 当前 ABSENT——**[ROUND-1 EVIDENCE]**）

## 情况三：LangGraph/Temporal 主动请求 Agent-Box Execution

一个 governed node wrapper / Activity 调用 library（嵌入模式，见第 9 节）：创建 Execution → 提交 inputs → 获得 receipt（execution_id + inputs_digest + accepted 状态 + SessionRef）→ 完成后回读 evidence claims → workflow 用 receipt 决定路由。**routing、retry、checkpoint 完全不动**。这里 Agent-Box 是被调用者，receipt 与对账是它唯一向上游交付物。

## 五个问答

- **何时是顶层产品？** 当上游不存在或不该存在：人与 harness 的直接循环（情况一）。这是 Candidate A 的定义场景，也因此 direct-use 频率是生死指标（K5）。
- **何时是被调用者？** 凡存在 durable orchestration substrate（LangGraph/Temporal/CI pipeline）。此时顶层身份属于 engine，Agent-Box 属于"提交-凭据"层。两者并存且共享同一个 store——同一位开发者上午手动、下午接 workflow，看到的是连续历史。
- **如何避免成为 workflow 下级？** 不抢 routing，但让上游**重建不出**两样东西：(a) 不可改写的跨 authority 合同与 read-back 对账（engine 的 event history 只含写入 payload，round-1 技术审计已确认 Temporal/LangGraph 均如此）；(b) 有意识的人的责任边界（Human Finish + continuation 断代）。旁路成本衡量下级的真正标准：绕开 Agent-Box 直连 provider 在技术上永远可行（round-1 红队如实指出），候选 A 不假装拥有 enforcement，而是让 bypass 的代价落在"这次的证据链缺失/无法向团队解释"上。**[REASONED PROPOSAL]** 且明确承认：在没有组织性要求的个人场景中，此代价不足以阻止 bypass——这就是为什么 K7 存在。
- **为什么一个 Execution ≠ workflow node？** 方向相反的两个不等式：node 重试三次仍是同一个 logical step，而更换 provider/换 workspace/new constraints 的"看起来像重试"必须是新 Execution（Binding 变了，责任重新开始）；反过来，一次 interactive Execution 横跨 N 个 turn、N 次 human steer 甚至多个 native attempt，却仍是一个责任窗口（Finish 才闭合）。粒度基准是**责任提交**，不是调度步。**[ROUND-1 EVIDENCE]**（round-1 技术审计 execution mapping 分析）
- **四个并行研究任务由谁创建？谁决定下一步？** 创建者：有 accountability 需求的一方——人在 WorkBoard 就是 Host 建；在 Send fan-out 内就是每个 governed wrapper 各自建。下一步的决定者：永远不是 Agent-Box。收到四份 receipt 和 unknown 清单的人（或 workflow 函数）决定。Core 里找不到任何"next"字段。

---

# 5. Binding 与 Evidence

选真实执行：live runbook 的调查 Execution E1（DSH 多会话配置插件 investigation，codex-tmux-interactive，inputs 见 runbook Step 6）。结构为现实存在，对账标签按下述 vocabulary 是**待实现的呈现规范**——实现现状在括号内如实标注。**[REPOSITORY VERIFIED]**（E1 的 inputs/freeze/finish 流程）/ **REASONED PROPOSAL**（标签体系）

证据词汇沿用 round-1 技术审计的 E0–E7（来源强度）、Disposition D0–D3、Coverage C0–C1。**[ROUND-1 EVIDENCE]**

| Binding slot | requested selector | exact Ref | resolver authority | frozen Binding | projection | native correlation | actual read-back | 判定 |
|---|---|---|---|---|---|---|---|---|
| Workspace | "`HEAD` of deepseek-harness-multisession-plugin"（可变！） | WorkspaceRef: commit `C8f3…` + tree `T21a…` | Git provider（rev-parse；沙箱 checkout） | `(workspace@1, ref)` 入 frozen set，digest 参与 inputs_digest | 在该目录启动本次会话 | SessionRef(codex thread) 顺带记录当时 cwd | 会话后 rev-parse HEAD^{commit} + dirty/untracked diff digest | **verified (bounded)**：commit/tree 到 E5/E6；含 dirty check；TOCTOU 边界如实标注（dispatch 与 read-back 之间的漂移不属于 coverage） |
| Responsibility prompt | "investigation prompt"（意图描述） | ArtifactRef: sha256 `9d02…` | 文件 digester（preview-resources） | 同上入 frozen set | bytes 进入 turn/start request body | Thread/Turn IDs（App Server 返回） | request body 与 artifact 双侧 digest 对齐 | **verified-as-projected (E2/E6)**；模型是否阅读/采用：**unknown (E0)** |
| Profile | `codex-plus`（名字可变） | `agent-box.profile@1` config-manifest digest（非 secret 字段） | Profile provider | 同上 | Harness 加载该配置 | 无独立加载事件 | 启动后 re-digest 配置文件（read-back 了字节，非消费） | **provider-reported (D2)** 加载；实际生效：**unknown**——round-1 real-provider matrix 已证 Codex config consumption 未能证明 |
| Console pane | 右下面板 "%2" | TmuxPaneRef `%7` + socket/server PID | tmux provider（format 查询冻结精确 identity） | 同上 | Codex TUI 替换该 pane 内容 | pane ID/session JSONL start record | exact socket 回查 pane identity；finish 时 capture ≤64KiB scrollback 做 sha256 | **verified-momentary (E3/E5)** identity；scrollback 只覆盖捕获 bytes (E6-partial)；完整 transcript：**partial** |
| MCP / credential source | 未进入本 Binding（investigation 无需） | — | — | — | — | MCP tool-call 事件流（若有）可见 | 无 negative surface | 未声明即缺席 → 不推断任何负向结论，整类 **unverifiable (C0)** |

**必须承认无法证明的事实**（每一项都对应购买叙事的一条红线）：模型语义上使用了 prompt/context 的哪一段；plugin/MCP 配置在 harness 内真实生效；credential 的实际消费版本；本次执行没有使用任何未声明资源；64KiB 之外的 scrollback 内容。candidate A 的 UI 规范禁止把这些渲染成 verified——WorkBoard 今天硬编码 `coverage unavailable` 至少没有说谎，v1 要替换为真话而非漂亮话（model.py L225，**[REPOSITORY VERIFIED]**）。

## Evidence 大量 unknown 时，候选 A 是否仍有价值？

仍然有价值，但价值命题要换：不是"我们证明了实际使用"，而是**三件事加起来**(a) verified 子集真实可信且有跨 authority 锚点（Git/tree/read-back 今天就能做到）；(b) known-unknown 被显式命名并有 authority/method 定位，使"success 假象"无法被 provider terminal 制造；(c) 未来自己复查时可秒级重建环境（exact refs + digests）。如果买家的关键 assurance slots 长期落在 unverifiable 且无 admission API 可改善——价值坍塌，触发 K4。**[REASONED PROPOSAL]**，坍塌条件本身 **[ROUND-1 EVIDENCE]**。

---

# 6. 独立平台最低能力

约束：只用现有七个名词的自然承载力——Work / Execution / Binding-input association / Dispatch / Ref / Provider / Observation(Evidence)。三层能力如下；凡需要动 Core 的，给出不用改就无法表达的**具体反例**。

## Preview（今天 + 当前 working tree 的延伸）

- 模糊目标 Work；直接创建 Execution；composer（draft→resolve→review→freeze&launch）；observation/artifact digests；explicit finish；continuation "从这里续"；work complete/reopen。
- 全部能在现有代码路径承载；runbook 已跑通主干。**[REPOSITORY VERIFIED]**
- Preview 明确**不做**：coverage 标签矩阵（以"暂无 coverage 数据"诚实显示）、远程服务、CI adapter。

## v1（可发布的独立平台门槛）

三项必须的最小 Core 修改，每项附反例：

1. **`work_id` 可空（standalone Execution）。**
   反例：GitHub Action 的 nightly 任务发现 flaky 测试，webhook 让 Agent-Box 创建一次修复尝试 Execution——此时没有任何人想为目标起名；强行要求 Work 会制造伪目标垃圾（"`misc`"堆），这正是 A 模式失败的实证形态。当前 models/services 无解，因为 work_id 必填。零代码逃逸方案（自动建骨架 Work）等价于偷偷恢复强制，不予采纳；透明做法就是放开约束。**[REPOSITORY VERIFIED]**（约束存在）/ **REASONED PROPOSAL**（修法）
2. **Binding slot provenance：input association 增加 requested-selector 与 resolved-at/resolver 字段。**
   反例：round-1 故障表第一条——requested `main`，resolve 得 C，launch 时 main 已漂到 D。今天 DB 冻结的是已解析好的 exact Ref，selector 字符串根本没入库，事后既无法回答"用户请求的是什么"，也无法区分 resolution-divergence 与 launch-divergence。这不是字段美化，是 divergence 检测的前提。**[ROUND-1 EVIDENCE]**（故障场景）
3. **Observation 强度标注：resource-state 行增加 issuer/method/assurance/coverage。**
   反例：今天 `record_resource_state` 接受任意 ≤256 字符非空字符串，测试里的 fake adapter 先写 `projected` 再写 `consumed` Core 全收——一个马虎或敌意的 plugin 就能让 dashboard 显示 "consumed"。没有这组字段，第 5 节整套诚实标签在数据层面不可实施。**[REPOSITORY VERIFIED]**（弱约束现状）
4. v1 另需修复两个已知语义缺陷（不改 ontology）：terminal 后仍可 `resume_execution()`（与 continuation 原则冲突）；failed-dispatch 幂等键重发静默返回（round-1 services.py 审计）。**[ROUND-1 EVIDENCE]**

continuation lineage 用现有 `provenance` bounded map 先行约定（`continuation_of=exec_…`），不够再升级 schema。**[REASONED PROPOSAL]**

## Future（方向性，均不新增实体）

- 新 RefType 常量（CredentialRef/EnvironmentRef/CIJobRef/CheckpointRef）：枚举值扩展、复用既有 Ref 结构与 contract 校验。反例：credential handle 现在只能塞进 free-string metadata，类型检查与 no-secret-value 校验都无从谈起。
- Evidence reconciliation 视图：expected-vs-actual 矩阵与 divergence 聚合，全部由已存储 claims 计算——新增查询与渲染，不新增事实类型。
- Crash-reconciliation runtime、cancel/replace 语义：沿 ADR-0002/0003 既定方向。**[ROUND-1 EVIDENCE]**

---

# 7. WorkBoard 定位

**组合答案：observe/control console（主） + Binding Composer（确认制副位） + history/evidence viewer（并列面板）。不自称 general 主工作台。** **[REASONED PROPOSAL]**

- **主定位**：治理时刻的控制台。一天的常态是用户在 IDE/harness 里干活；打开 WorkBoard 的理由是提交前检查、结束后的证据阅读、以及 decide-next。这三个动作都改变 Core 状态或应当改变用户判断——console 的每个证据面板都邻接它的合法控制（读 folding 进入 action）。
- **Composer 副位化**：auto-suggest + 一次整体 Review 是主路径；逐项构造保留（专家/调试场景）。这样回应 round-1"用户不会高频逐个挑 Ref"的风险：高频用户看到的 composer 应该是一个 5 秒扫一眼的差异视图（相对上次执行变了什么），不是表单。
- **history/evidence viewer**：chronicle 是默认视觉主体（WorkBoard 现状已是如此）。
- **默认视图**：垂直 chronicle（已发生的 executions，新→旧）+ 顶部"现在"条幅（active execution 及其等待中的决定：待 launch / 待 finish / 待复核 evidence / 待决 Work）。
- **最高频动作**：confirm-and-launch、finish、continue-from-here、review evidence、complete work。
- **隐藏字段**：contract_id、digest 十六进制、resolver 版本、ref metadata——折叠进 detail；首次视图只露人话（repo 名+分支图标、prompt 名、profile 名、终端号）。
- **避免 canvas**：无 edge、无未来节点、无自动进度。产品红线：任何"建议的下一个步骤画在画布上"的功能都会把它拖回 workflow builder——round-1 三份报告的共识。**[ROUND-1 EVIDENCE]**

主动入口问题（K1/K2 将实测）：candidate A 不赌用户全天候住在 WorkBoard，赌的是**有后果的动作愿意来这里确认**。如果连这一点都没有，按 K1 收缩。

---

# 8. 最小 Demo

## 90 秒版（电视购物法则：一次执行、一次续接、一张证据卡）

```text
0:00–0:10  终端里 repos 与模糊任务一句话；WorkBoard 打开，新 Work 已建
           （省略打字过程；严格版可无 Work 冷启动以先声夺人）
0:10–0:30  n 创建 Execution；composer 弹出预填 draft：HEAD→commit C8f3、
           prompt artifact、profile codex-plus、pane %2；Review 页一次性确认
0:30–0:40  l：Freeze & Launch；digest 与 accepted receipt 一闪；
           %2 换成 Codex 真实在干活（不快进的几秒真实输出）
0:40–0:55  f：Finish；时间线上 E1 变 terminal；native SessionRef 出现
0:55–1:15  e：Evidence 卡——绿 2 行（commit/tree verify、prompt projected）
           黄 1 行（profile: provider-reported）灰 1 行（consumption unknown）；
           主持人念出一行黄字："加载是它自己说的，我们不信无凭之词"
1:15–1:30  review 评论到达→ continue-from-here：E2 诞生，同一 SessionRef，
           新 digest；E1 依旧原封不动躺在上面
```

刻意出现的台词钉子：“E1 不会被 reopen，新的责任配新的合同。”

## 3–6 分钟 Preview（完整叙事）

```text
0:00–0:40  问题先行：翻 shell history/NOTES.md/「v2-final」分支找"上次用什么跑的"
           失败的 15 秒真人片段 → 引出 product promise
0:40–1:30  建模糊 Work；n+c+l 完整慢速走一遍四槽 composer（含一次用户
           修改 profile 的互动）；强调此时 Core 里还没有任何东西
1:30–2:20  %2 真实交互（包含一次人工纠偏 steer）；点明 turn 完成≠结束
2:20–3:00  f + e：expected-vs-actual 完整矩阵；authority/method/coverage 展开
           一行绿证据给观众看原始 artifact digest
3:00–3:50  CI 红→continue-from-here 建 E2（只读 review profile + 新 commit）；
           LangGraph 低调出场 10 秒：同一 Thread checkpoint C1→C2 被
           冻结进 E3 的 Binding（仅此一镜头，无 canvas）
3:50–4:40  时间线俯瞰：E1/E2/E3 三段责任的 inputs/Evidence 并排对比；
           unknown 清单公开陈列
4:40–5:20  全部 terminal 而 Work 仍 OPEN；人读完证据按下 Complete Work
           （reason 打字可见）；随后 reopen 演示一次——完成也可撤销，
           因为完成是人说的话，不是机器算的
5:20–5:40  收束句："Plan 是别家的事。这里只提交现在，并记住发生过什么。"
```

## 去组件检查

| 移除 | 是否成立 | 说明 |
|---|---|---|
| **去掉 LangGraph** | ✅ 成立且更清晰 | 3–6 分钟版的 LangGraph 只有 10 秒装饰镜头；90 秒版根本没有。主叙事不欠 workflow 任何债。[ROUND-1 EVIDENCE]（scene-1 预测最强） |
| **去掉 Work** | ✅ 机制成立，❗叙事受损 | 90 秒冷启动变体可以直接 Execution 开场，全部后续照常——这恰是 B 模型的自检义务。丢失的是 fuzzy-goal 开场和历史聚合的打动力。如果两个版本 A/B 测试中无 Work 版理解度相同甚至更高，说明 Work 的产品贡献其实为零——那就应滑向 C 模型（联动 K2）。 |
| **去掉 tmux** | ✅ 成立 | codex App Server plugin（无 tmux 路径）已被证实可走完 thread/start→turn/start→finish 流程；换 headless provider 画面少一个 pane，链条不少一环。[ROUND-1 EVIDENCE]（round-1 技术审计 codex 行） |
| **去掉 Evidence reconciliation** | ❌ 不成立 | 剩下的就是"填表 → 启动 → 看状态"——launcher 定义本身。此环是差异化的全部所在。[ROUND-1 EVIDENCE] |
| **去掉 continuation** | ⚠️ 大幅削弱但仍是一次 accountable dispatch | 单次执行的 freeze/evidence 闭环还在，丢掉的是最强历史断点与"terminal≠完事"教学点。[ROUND-1 EVIDENCE]（首版可先删，第二支视频必须有） |

结论：Demo 的重心排序 = Evidence > continuation > Binding freeze 速度 > Work > tmux > LangGraph。与其余候选形成可辨识差异的正是前三项。

---

# 9. 产品与部署

| 问题 | 裁决 | 依据 |
|---|---|---|
| **独立 daemon/database 是否必要** | **Preview：否。** `$AGENT_BOX_HOME` 单文件 SQLite + 进程内 registry 就是全部，pip install -e 各插件即用。**v1：条件触发的远程化**——当第二类并发客户端（CI caller + 人）同时读写时再评估 server 化；在此之前 daemon 是未被证明的需求。[ROUND-1 EVIDENCE]（daemon 未获证明）+ REASONED PROPOSAL（触发条件） |
| **CLI/API/WorkBoard 关系** | 同一个 Core store 的三种皮：CLI（`agent-box`，headless verbs，脚本与 host 用）；library API（`work_core.services`，嵌入模式直调）；WorkBoard（人类 console）。三者的写入走同一套服务函数与事件表，绝不允许 WorkBoard 私有旁路。[REPOSITORY VERIFIED]（三者均现存于同一 services 层之上） |
| **Provider plugin 如何分发** | pip 包 + entry-point 注册，进程内原子装进 ExtensionRegistry——现有机制即分发方式，Preview 阶段仓库内 `-e ./plugins/...` 安装即文档化的用户路径。市场形态（远程 registry/签名）defer 到 adoption 证明后。[REPOSITORY VERIFIED] |
| **数据 authority** | 严格分域：Agent-Box DB 是**承诺与断代**的最终权威（哪个合同被冻结、谁接受了、什么时间谁 Finish、Work 何时被人关闭）；Git/GitHub/harness/tmux 是**原生真相**的最终权威；Evidence 每行携带 issuer，集中存储不升格证据强度——集中的是索引与对照，不是真相本身。[ROUND-1 EVIDENCE]（证据等级原则） |
| **是否允许嵌入 Host** | 允许且是一等形态：library 模式给 workflow/CI caller；此时 WorkBoard 退化为 inspector，Work 可不存在（联动 B 模型）。嵌入与独立两种形态长期共存而非先后替代——白天嵌入跑 workflow，晚上人类开 console 接管，共享同一历史。[REASONED PROPOSAL] |
| **用户为什么不直接选 SDK** | SDK 给零件，平台给四样 SDK 天然不给的东西：(1) **人类节奏的固定语汇**——Finish/continue/complete 不是库函数而是制度化的团队动作；(2) **跨 provider 统一记忆**——Codex 与 Pi 换着用时 history 连续可比；(3) **现成的诚实证据语汇**——verified/provider-reported/unknown 分层与 coverage 规范，团队不必自研信任标准；(4) **立即可用的插件面**——不用先写 adapter。诚实附注：对手观点"四人以下团队要的其实就是 SDK +一份 manifest"[ROUND-1 EVIDENCE]，此裁决的真正防线是 K5——direct-use 场景必须在现实中反复发生。 |

---

# 10. 自我攻击与退出条件

## 最强的五个反对理由

1. **"我的 stack 已经覆盖 80%。"** GitHub Issue（目标）+ branch/PR（revision 锚点）+ Actions run URL（执行事实）+ transcript（过程）对单人轻度使用者完全够用；round-1 七类替代组合逐一成立，普通 DB+四张表甚至是当前 Core 的最小重写。候选 A 的反击只能在"跨 authority 同窗对账 + 责任断代"这两件它们凑不齐的事上，而这个差距对不是每天踩坑的用户不可感知。[ROUND-1 EVIDENCE]
2. **节奏税。** freeze-review-launch-finish 四步纪律在高频小事上是负担；用户会绕开 WorkBoard 直接 `codex` 起手，产品沦为"只记录了我记得记录的那几次"的选择性账本——选择性账本比没有账本更危险（诱发虚假安心）。bypass 技术上永可行（无 enforcement），round-1 红队判定此类纪律若无中央拦截难以维持。[ROUND-1 EVIDENCE]
3. **Unknown 海洋。** 关键槽位（profile 生效、MCP、credential）的最佳可能证据大多停在 provider-reported/projected；如果买家需要的 assurance 恰好集中在黑带区，green rows 只是无关紧要的边角料，产品最诚实的部分变成了最没用的部分。[ROUND-1 EVIDENCE]
4. **workflow 团队从不把它当顶层。** 平台工程师的薪资脉络决定了他们把一切塞进 Temporal/LangGraph；候选 A 在那个世界里永远是 callee，是 receipt bus，"Platform"二字名不副实；而个人开发者市场又小又付费难。两头不到岸。[REASONED PROPOSAL]（基于 round-1 persona 与 subordination test）
5. **理解鸿沟。** 首看观众的直觉误判率极高（round-1 viewer test 预测 fail）："这不是给 tmux 加了个表单吗""Work 和 issue 有啥区别""为什么不直接看 log"。每一问都需要 20 秒讲解才能拆掉；如果 Demo 需要 3 分钟铺垫才成立，口碑传播基本死亡。[ROUND-1 EVIDENCE]

## Kill criteria（≥5 条，全部可测量；命中即触发对应退出）

| # | 判据（阈值） | 测量方法 | 触发的退出 |
|---|---|---|---|
| K1 | **主动入口失败**：14 天试用中，用户日均主动打开 WorkBoard <1 次或其中关键决策动作（confirm/finish/complete/continue）<2 次/周 | 产品遥测（opt-in diary 校准） | 收缩为 SDK 附带 inspector（回归 round-1 verdict B） |
| K2 | **Work 被彻底替代**：≥60% 执行的 Work 由外部系统 ref 投影且用户从不打开 Agent-Box Work 视图；A/B demo 中无-Work 版理解度 ≥ 有-Work 版 | 引用分析 + demo A/B 理解度测试 | 候选 A 降级为 C 模型 → control-plane 候选重组 |
| K3 | **Binding 操作成本过高**：新手单次 confirm-to-launch 中位数 >30s，或放弃率 >20%；对照组裸命令约 2s | wizard friction test（round-1 验证计划第 3 步） | auto-binding 必须做成零击键默认；再测仍超限则候选 A 的 UX 前提死亡 |
| K4 | **证据大面积不可验证**：买家 declared-required slots 中 verified 占比 <30%，且两个迭代周期（≈60 天）内无法提升（无新 authority/read-back 手段可用） | 抽样 audit + per-slot coverage 统计 | 差异化主张坍塌 → 转向 provenance middleware / SDK |
| K5 | **direct use 频率不足**：真实部署中无 workflow 上游、由人发起的执行占比 <20%，持续一个月 | dispatch 来源标记（host=human vs plugin/webhook） | 顶层产品假设失败 → 全面转嵌入式/API 形态（verdict→C 族） |
| K6 | **叙事不可救**：≥5 名首看者盲测中"不是 tmux launcher"/"为何新 E2"/"terminal≠完成"任一题连续两轮 <4/5 通过 | round-1 viewer comprehension test 协议原样执行 | Demo 主叙事重构；若第三轮仍败则传播策略被判死刑，仅余技术叙事 |
| K7 | **节奏不被遵守（bypass）**：harness 侧观测到 ≥30% 的大改动执行未经 explicit finish，即用户直接关 pane 干完走人，或绕开 WorkBoard 手动起 provider | provider-side 信号（session 存在而无 Core 记录配对扫描，抽样核对） | 候选 A 的"制度性节奏"证伪 → 只有 enforcement/admission 前提下重建（那是另一个产品赌注） |

五条理由与七条判据的对射：理由1↔K2/K5；理由2↔K7/K3；理由3↔K4；理由4↔K5；理由5↔K6。全部判据命中任何一个都不是修 bug，而是结构性退出信号。

---

# 11. 统一评分

| 维度 | 分数 | 理由 |
|---|---:|---|
| independent JTBD | **3** | JTBD1/2（可复现责任窗口、session 连续责任重启）确实不依赖 workflow engine 且痛点机制真实 [ROUND-1 EVIDENCE]；但无用户证据，频率未知。 |
| differentiation | **4** | 跨 authority 冻结+read-back 对账+责任断代是组合出的真空白 [ROUND-1 EVIDENCE]；窄（远非底层创新）但真实存在且对手无动机补齐。 |
| user friction | **2** | 每执行 4 个治理动作 vs 传统 1 条命令；最大负债项。唯一的减法杠杆是 auto-binding+单屏 review，能否压到 <30s 未经验证 [REQUIRES USER VALIDATION]。 |
| evidence credibility | **2** | 当前最弱实现（coverage unavailable、自由字符串 state、projected≠consumed）[REPOSITORY VERIFIED]；Verified 子集扎实但太窄。设计的三层标签诚实有余，强证明不足。 |
| workflow integration | **3** | Mode A/B/C 语义清晰、正交性好；adapter 全部 ABSENT，Mode C receipts schema 未实现 [ROUND-1 EVIDENCE]。设计高分、履约低分，取中。 |
| implementation feasibility | **3** | spine（freeze/dispatch/events/artifacts）可运行，135 tests 绿 [ROUND-1 EVIDENCE]；v1 三修改边界小；风险集中在 evidence 标注的实现质量与 crash window。 |
| replaceability | **2** | 高可替换性压力（round-1 红队 7 类替代、SDK 最小形态成立）[ROUND-1 EVIDENCE]；防线只剩统一节奏与证据语汇这类"软独占"。 |
| deployment burden | **4** | 单机 file-based、pip 即用、无 daemon 承诺 [REPOSITORY VERIFIED]；对个人/小团队负担近零。团队远程化时负担未知（defer）。 |
| Demo clarity | **3** | 90 秒版避开全部 round-1 误导镜头、机位极简，预测可过一半题目；但从未实拍，viewer test 预言保守 [ROUND-1 EVIDENCE 给予的悲观先验]。 |
| Core boundary integrity | **5** | 零 DAG/零 routing/零 retry；新增仅一处解除约束（work_id nullable）+两处标注列，全部附不可表达反例；无 ontology 膨胀。[REASONED PROPOSAL] |

加权印象：differentiation 高、credibility 与 friction 低——典型的"差异化真实但兑现昂贵"剖面。第三轮攻击应集中火力在这两项低分的因果链上：friction 高导致 bypass（K7），bypass 导致账本残缺，残缺的账本让 credibility 问题雪上加霜。

---

# 12. 最终判词

## **B. 候选 A 只有在 Work 可选时成立。**

**推理链**：

1. 候选 A 的用户体验设计（fuzzy goal → 逐次承诺 → 历史成形）在机制层已具备可运行的骨架，且行为被本仓库 tested paths 覆盖过半。[REPOSITORY VERIFIED]
2. 但它的开工前提有一条不能碰的底线：Work 不能成为强制父级。round-1 已证 Work 必选无必要性、Issue/Thread 可替代 [ROUND-1 EVIDENCE]；而候选 A 自身的 startup 叙事恰恰最容易诱使设计者把 work_id 焊死——当前 schema 正是这么焊死的（models.py L77）。判词 B 把这条底线写成裁决本身：B 模型下候选 A 是一个差异化真实、部署近乎免费、可以拿去第三方攻击的具体方案；一旦滑向强制 Work，它在第一个月就会积累 misc 工作堆和双头 completion 状态，逐步退化为精致 launcher + 冗余工单系统。
3. 它也不会无限上升为完整独立平台：嵌入形态与独立形态必须长期共存（第 9 节），顶层数量由 direct-use 频率（K5）裁决，而非愿景。

**附带进入第三轮的条件**（均可测量，见第 10 节）：K1–K7 七条判据作为下一阶段的验收框架；其中 K2（Work 可选性的实证）与 K4（证据可验证率的下限）两条直接决定候选 A 在第三轮应按"B 成立"还是"降级为 C/control-plane"继续。

**如果只允许一句话带走**：候选 A 押注的不是"人们需要一个 Work 系统"，而是"人们在动手之前愿意 花 30 秒锁定依据、在收工之后愿意花 60 秒认清事实"——前者可以被 Issue 顶替，后者暂时无人可顶替。第三轮请围绕这个不对称性攻击。

---

*本报告未读取 round-2 其他输出；除本文所写文件与目录外未修改任何代码、测试或既有文档；未执行 Git 操作。*
