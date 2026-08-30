# Executive position

**结论：B. 只证明了独立 Core，未证明独立产品。**

Agent-Box 有一块真实且可能独立的责任域：把一次“谁以什么精确依据、对什么责任窗口、交给哪个 provider”的执行承诺，和随后来自 Git、CI、harness、workspace 等 authority 的事实闭合起来。这不是 DAG、调度或 agent supervisor。即使某次 Execution 由 LangGraph 或 Temporal 触发，workflow 仍只拥有“下一步做什么”；Agent-Box 可拥有“这一次是否形成可追溯、不可改写的执行合同，以及事实是否与合同相符”。**[REASONED INFERENCE]**

但这个论证目前只能支持独立的语义 Core：生产 `work_core` 还没有 Binding、Binding slot provenance、Evidence/coverage、显式 Finish 或新的 continuation identity。现有数据库只持久化 Work、Execution、typed Ref、Dispatch 和 Event；`dispatch_execution()` 冻结的也只是输入 Ref 列表及 digest。将它直接称为独立 daemon/database 或 WorkBoard 产品，会把 spike 证据错误升级为市场证据。**[REPOSITORY VERIFIED]**

## Falsifiable thesis

若 Agent-Box 能在至少两类非 workflow 上游（例如 Human/CLI 与 CI）和至少一种 workflow 上游中，持续减少下面的高代价争议，则它是独立 execution accountability/control plane：

> 对任一 accepted Dispatch，系统能在事后回答：请求的 selector 是什么、解析出的精确对象是什么、冻结合同是什么、谁接受了、实际 materialize/consume 的是什么、何处 unknown/divergent；并且任何上游 run、node 或 session 的后续变化都不能改写该答案。

可证伪标准：若客户只需 workflow 自己的 immutable run inputs、job/session IDs 与 logs，或其现有 workflow/CI/harness 可同样以较低成本完成跨 authority pin、admission、actual-consumption read-back 和责任边界，那么 Agent-Box 没有独立价值，只是 node launcher。**[UNVERIFIED PRODUCT HYPOTHESIS]**

外部系统的职责划分不是想象出来的：Temporal 将 Workflow Execution 定义为主执行单位，并以 event history/replay 持久恢复；LangGraph checkpointer 保存 thread-scoped graph-state snapshots；这些确实是 workflow runtime 应拥有的状态，而非本 Core 应镜像的内容。**[OFFICIAL DOCUMENTED]** [Temporal Workflow Execution](https://docs.temporal.io/workflow-execution)；[LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence)

## Independent Execution identity

`Execution` 不是“任何 native object 的别名”，而是一次有开始前合同与结束后归责边界的尝试。成立的前提是它必须能跨 native lifecycle、资源 authority 和上游触发者；否则直接采用 Run/Job/Session 更简单。

| 场景 | 只有 workflow Run/Node 或 native ID 会丢失什么 | 是否真实痛点 | 为什么是独立持久化 identity | 事实 owner |
|---|---|---|---|---|
| 1. Interactive harness：用户在 S1 中经历多轮提示、工具调用、人类纠偏，最后明确 `Finish Execution` | 一轮模型回复、terminal idle 或 process exit 都不是“责任窗口已提交”。Run 记录也无法自然表示“继续对话仍属 E1，但 Finish 后才能固定 outputs/evidence”。 | 是。错误把 idle/exit 当完成，会遗漏最后人工纠偏后的 commit、session event range 和未验证配置。 | E1 把 B1、accepted D1、S1 和 Finish 时的证据封为一个窗口；native session 仍由 harness 拥有。 | Harness 拥有 turn/session；Git 拥有 HEAD；Agent-Box 拥有 E1/D1/B1/Finish 边界；Human/Host 拥有关闭决定。 |
| 2. Native continuation：E1 已 terminal，仍复用 S1；CI 失败或人工审查使 workspace、checkpoint、profile/credential ref 变成 B2 | 把 S1 resume 或同一 workflow node 重开，会让 E1 看似曾使用 B2，抹掉“旧责任已结束、新责任才开始”。 | 是。此类审计争议不是美学：错误 workspace 或新约束可能使补救结果被归到已验收的第一次尝试。 | 创建 E2，关联 `continuation_of=E1` 与 input `SessionRef=S1`；E1 永不 reopen。 | Harness 拥有 S1 continuity；CI/authority 给出失败事实；Agent-Box 拥有 E1/E2 责任分界及各自 Binding/Dispatch。 |
| 3. 跨系统一次 code-change Execution：精确 Git commit/worktree、harness profile、credential handle、terminal sandbox、可选 LangGraph checkpoint；结束时又关联 S1、commit/tree、CI Run/Job | 单个 workflow node 仅知道自己的 config/run；tmux pane、workflow checkpoint、Git revision、CI actual `head_sha` 没有共同 identity 或共同的 expected-vs-actual 对账。 | 是，尤其在故障调查、受限凭据、并发 worktree、交接和合规 review 中；单一日志无法证明哪个版本被执行。 | E 将多 native refs 标为同一责任提交的 inputs/correlations/outputs，而不宣称拥有这些系统。 | Git/CI/harness/terminal/LangGraph 各拥有原生事实；Agent-Box 仅拥有关系、冻结 digest、证据 method/coverage。 |
| 4. Provider terminal：CI job success 或 harness session terminal，但 Work 的验收仍需 review、部署检查或 Human accept | 将 provider terminal 升格为长期目标完成，遗漏未处理的 unknown、scope 外变更或另一个 required authority。 | 是。CI run 成功只说明该 run 的定义和环境内完成；GitHub 也将 logs/artifacts 附着于 workflow run，而非业务验收。 | Work（或外部 case）与 E 分离，让所有 Execution terminal 后仍可显式判断目标是否完成。 | Provider 拥有 terminal/outcome；Work owner/Human 或外部 case system 拥有 goal completion。 |

仓库已有部分而非全部支撑：Execution ID 先于 provider start 存在、native `SessionRef`/`RunRef` 以 relation 附加、provider terminal 不自动 close Work，均有源码与测试；但现有 vertical slice 仍允许对同一 terminal Execution 调用 `resume_execution()`，与上表 E1/E2 原则冲突。**[REPOSITORY VERIFIED]** 因而“continuation 必为新 Execution”是产品要求，不是当前实现事实。

## Binding as contract versus launch configuration

真正的闭环是：

```text
requested selector → exact resolved Ref → frozen Binding
→ accepted Dispatch → projection/materialization → native observation
→ Evidence reconciliation (conformant | divergent | unknown)
```

它与 `workflow node config → env vars → launch → logs` 的本质差异不在“多存几个字段”，而在四个不可替代的断言：

1. **选择与版本分离。** `main`、`HEAD`、`approved-current` 是可变请求；commit SHA、artifact digest、secret version、environment UID+generation 才是可比较的结果。配置通常只能说明“当时给 launcher 的字符串”。
2. **冻结和 admission 分离。** frozen Binding 不因 validation 过期或资源漂移而修改；新 validation 只能判其 valid/invalid/unknown，accepted Dispatch 只能引用一个精确 digest。
3. **期望与实际分离。** provider success 不证明使用了声明值。Evidence 必须由 authority/native read-back 标注 method、time 和 coverage，允许 unknown，而非从 log 推断。
4. **责任和执行机制分离。** Dispatch 表示 provider 接受该合同；projection 是观察，不是 workflow state，更不能推出下一步或 Work completion。

当前实现已经可靠地做了最小版的后半部分：同一 Execution 的 input Ref 在 dispatch 后禁止新增；digest 与 idempotency key 持久化；provider 成功后 Dispatch 记为 `accepted`，启动失败记为 `failed`。相关 14 个 input-freeze/vertical-slice/stress 单测于本轮通过。**[REPOSITORY VERIFIED]**

但它还不是上述 Binding contract：Ref 没有 requested selector、exact pin、resolver、resolved-at、assurance；没有独立 Binding revision/validation，Provider actual consumption 与 ResourceFact coverage 也没有 production persistence。把今天的 digest 宣传为完整 governed contract 是不成立的。**[REPOSITORY VERIFIED]**

## Real failure scenarios

下列不是抽象“可审计性”，而是闭环不全会造成的可复现错配。real-governed-binding spike 已以真实 Git/local process 验证移动 selector、实际 commit 偏离、crash recovery；flow-stress spike 覆盖 28 个场景，但它们不是 production implementation。**[REPOSITORY VERIFIED]**

| 故障 | 普通 launch/log 不能可靠回答 | 合同需要的控制与事实 |
|---|---|---|
| `main` 在 resolve/launch 之间由 C 漂到 D | node config 仍是 `main`，日志可能没有 native HEAD；无法判定 E 用 C 还是 D | B1 固定 requested `current-head(main)` 与 resolved C；native detached worktree/HEAD read-back。若 D 才被使用，记 divergent 或拒绝。 |
| profile/config 在 resolve 后被编辑 | 环境变量只留路径/名字，无法知道启动时 byte digest；harness 声称加载也未必可观测 | 将 profile artifact/version/digest 作 Binding slot；materialized bytes/read-back 是 evidence；无法证明 consumption 则明确 unknown。 |
| credential reference 物化错误 | “SECRET_NAME=prod” 既不能证明拿到哪个 version，也不应把 secret value 写日志 | Binding 仅保存 handle/version/approval；credential broker 按 exact pin 或 conditional-use materialize，回传不泄露值的 authority fact。没有 enforcement 时禁止标成 enforced。 |
| continuation 选错 workspace | session ID 相同会掩盖 cwd/worktree 更换；历史 E1 的 output 与 E2 的 patch 混在一起 | 新 E2 Binding 必填 `SessionRef S1` 与 exact W2/commit；E1 terminal immutable；Git actual HEAD/cwd evidence 分属 E2。 |
| CI 声明 C，实际 `head_sha` 为 D | workflow 文件、dispatch input 或 UI label 可以都是 C，CI 仍可能跑 D | 保存 CI RunRef/attempt、workflow definition pin 和 GitHub 回读的 actual `head_sha`；C≠D 不因 job success 消失。GitHub 文档也说明 partial re-run 的日志需跨 attempts 才完整，单次 log archive 不是完备历史。**[OFFICIAL DOCUMENTED]** [GitHub Actions logs](https://docs.github.com/en/actions/how-tos/monitor-workflows/use-workflow-run-logs) |

这些故障中，Git/CI head SHA、错误 worktree 和 credential version 是用户/组织真实风险；“模型究竟是否语义上 attention 到 prompt”往往不可证明，应是 `unknown`，不能伪装为痛点已经解决。**[REASONED INFERENCE]**

## Control-plane independence test

题设五项是好的必要起点，但不足以充分区分独立 control plane 与精致 launcher：

| 判据 | 判断 | 反例/修正 |
|---|---|---|
| 可脱离 workflow 创建 Execution | 必要但不充分 | 单机 CLI wrapper 也能做到。必须在无 workflow 时仍完成 binding/admission/evidence 的有用闭环。 |
| identity 独立于 node/run | 必要但不充分 | 任意数据库可另造 UUID。必须能表达一对多 native correlations、跨系统 inputs/outputs，且不改写过去。 |
| 有 accepted Dispatch 与 terminal boundary | 必要但不充分 | queue/job launcher 也有 accepted/finished。terminal 必须与 explicit Finish、evidence finalization 和 Work/business completion 语义分开。 |
| workflow 不能改写 frozen history | 必要 | 还需 Agent-Box 自己也不能以 mutable metadata、terminal→active 或 admin update 改写核心声明；当前源码对此未完全达标。 |
| 服务 Human、CLI、LangGraph、Temporal、CI 等多个上游 | 强信号但不充分 | 多入口不等于付费价值；至少应有两个不同 buyer workflow 复用同一 contract，而不是只提供不同启动按钮。 |

修正后的充分性近似为：**独立 admission authority + durable non-rewriteable execution contract + cross-authority actual-fact reconciliation + non-workflow demand + adapter economics**。缺一项就应降级。尤其 admission 不能只是保存一个 launch request：必须能根据 provider assurance 和 external authority 在 side effect 前拒绝、或诚实标记 recorded/unknown。**[REASONED INFERENCE]**

类比有帮助但不能代替证据。Kubernetes 可被更上层系统调用仍是 control plane，因为其 API、desired state、admission/controllers、持久集群状态与 data plane 是独立 authority；Agent-Box 没有也不应复制 scheduler/controllers/desired-state reconciliation。**[OFFICIAL DOCUMENTED]** [Kubernetes components](https://kubernetes.io/docs/concepts/overview/components/)  CI control plane 也比 runner 丰富：它拥有 queue/retry/secret/environment gate；Agent-Box 不应重建这些，而只把 CI Run/Job 的 exact facts 纳入某个更广的 Execution contract。transaction/job systems 的相似处是 idempotent acceptance 和 durable boundary；不同处是 Agent-Box 的核心价值必须来自异构 resource provenance，而不是 ACID 本身。**[REASONED INFERENCE]**

## Work analysis

| 模型 | 最强论证 | 主要代价 |
|---|---|---|
| A. Work 是一等 Core object | 跨多次 E 的长期 objective、Human explicit completion、未解决 unknown 和历史决定有共同锚点；避免把 CI/harness terminal 错当业务完成。 | 与 Jira/Temporal/incident/case system 重叠，且容易滑向 next-step/workflow ownership。 |
| B. Execution 独立，Work 是可选 grouping | 将可移植性最大化：CI plugin、CLI 或 workflow adapter 可以只创建 E；需要长期目标才挂 Work/external case Ref。 | 单次 direct user journey 若无 grouping，难以呈现是否已经验收；需设计清楚 orphan/retention/owner。 |
| C. 无 Work，归属/完成交给外部系统 | 最小、最不与 workflow 竞争；适合纯 SDK/admission gateway。 | Human direct harness 和跨系统修复会失去一处可见、明确的长期责任边界；每个集成须再造归属语义。 |

选择 **B**：Execution 应独立；Work 是可选但一等的 grouping/acceptance aggregate，不能是 Execution 存在的前提。理由不是已有代码有 `work_id`，恰恰相反：若所有 Execution 都强制 parent Work，就无法证明它对 CI/plugin/CLI 的独立性。保留 Work 的产品价值需由“Human 直接管理跨多次尝试的长期目标”验证；否则只允许 `external_case_ref` 更合适。**[REASONED INFERENCE]**

## Product versus architecture

- **Core 是否值得独立存在？是，有条件。** 有条件地独立持久化 E/Binding/Dispatch/Evidence 是跨系统 contract 的最小承载；它可被 library、sidecar 或 service 采用。**[REASONED INFERENCE]**
- **是否值得独立 daemon/database？尚未证明。** crash recovery、cross-client history、append-only evidence 与 concurrent admission 是理由；仓库 spike 用 SQLite 验证了形状，但 production Core 尚缺完整 Binding/Evidence/Finish，且没有多用户、规模、留存或运维收益证据。**[REPOSITORY VERIFIED]**
- **是否值得独立 WorkBoard？尚未证明。** 对 Human-owned B 型 Work，显示冻结输入、actual facts、unknown 和 explicit completion 可能是高价值；对纯 Temporal/LangGraph teams，它可能只是又一个 run UI。先以只读 Execution detail/evidence view 验证，再投资 board。**[UNVERIFIED PRODUCT HYPOTHESIS]**
- **第一阶段入口能否为 LangGraph/Temporal plugin？可以。** 插件可在 node/activity 边界创建 E，冻结外部 context snapshot，回写 EvidenceRef；它不得劫持 routing/retry/checkpoint。入口策略是 distribution，非 ontology。**[REASONED INFERENCE]**
- **“workflow integration 进入市场”不等于“语义属于 workflow”。** 前者表示 workflow 是上游 caller/销售渠道；后者表示 Agent-Box 的 canonical ID、history、progression 与 node/run 同构。只有前者允许 Human/CLI/CI 在没有 DAG 时使用相同 contract，也允许一个 E 跨 workflow、harness 和 CI。**[REASONED INFERENCE]**

## Strongest counterarguments

1. **成熟 workflow/CI 已经可存 inputs、artifacts、logs、immutable run history。** 最难回答。若用户资源只在单一 engine 内、其 input 是不可变 artifact、实际消费由 engine 原生可读，Agent-Box 是重复账本。支持方只能以跨 authority pin/enforcement/actual evidence 的可量化差异回应，不能凭“更可审计”取胜。**[REASONED INFERENCE]**
2. **真实 harness 很难证明 config/credential/prompt 的完整消费；unknown 会很多。** 仓库 real-provider matrix 明确 Codex config consumption 未能证明、undeclared reads 不完整。若关键路径长期只能 unknown，contract 成为漂亮的启动 manifest，不足以卖独立产品。**[REPOSITORY VERIFIED]**
3. **责任边界可能是任意切分，强加 E1/E2 增加操作负担。** 没有可预测的“何时新 E”规则，用户会把每个 turn、CI job 或 tmux pane 都变成 E，最终等同 workflow node launcher。必须以 binding/responsibility change、explicit Finish、独立 approval/retry/owner/workspace 作为升级阈值，而不是 native object 数量。**[REASONED INFERENCE]**

第三项会迫使定义收缩，但前两项中第一项在目标市场被证实时，足以推翻独立产品定位；第二项在 required-assurance use cases 中被证实时，也足以推翻。

## Conditions under which the thesis fails

下列任一条件成立，应把结论降为 C 或 D：

1. 两个真实非 workflow 场景和一个 workflow 集成中，用户无法指出 Agent-Box 阻止或定位的一次实际错配（错误 revision/profile/workspace/credential/CI SHA），或现有工具以同等低成本已处理。
2. 每个目标 provider 的 required Binding slot 中，实际消费 evidence 大多只能 `unknown`，且 provider 无 exact/conditional-use admission API；此时不能承诺 control。
3. Execution identity 没有稳定的 owner、responsibility intent、immutable Finish/terminal 或跨 authority refs；仅是一层 workflow-run UUID 映射。
4. 产品必须自己实现 node/edge、retry、timer、routing、checkpoint mirror 才能让用户采用；这说明缺失的是 workflow substrate 而非 accountability plane。
5. WorkBoard 的唯一有用动作变成“看另一个系统的 logs、再跳回原系统操作”，没有在 Evidence/acceptance 上做出独有决策。

## First-round verdict

**B. 只证明了独立 Core，未证明独立产品。**

第一轮最强支持性结论是：独立 Execution identity 与 Binding→Dispatch→Evidence 闭环在“跨 authority、责任变化、需要 actual read-back”的条件下不是 workflow node launcher；它们构成可复用的 execution-accountability Core。**[REASONED INFERENCE]**

本轮不能越过的事实是：生产实现仍只有最小 input freeze/dispatch，并有 terminal resume 与 mutable metadata 等语义缺口；real-governed-binding 测试还因缺失 provider 模块无法收集。故独立 daemon、WorkBoard 和市场需求均未获证明。下一轮应以三条真实 vertical slices（interactive explicit Finish、same-session new-E continuation、CI actual-SHA divergence）测量事故避免率、unknown 比例与集成成本；没有这些结果，应转为 **D. 嵌入式 library/plugin**，而非建设独立产品。**[REPOSITORY VERIFIED]**
