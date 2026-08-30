# Round-2 候选 C — Workflow Execution Substrate

本报告为 Agent-Box 产品定位第二轮对抗验证中候选 C 的设计方案。审计/设计日期 **2026-08-27**。本报告只依赖 round-1 四份文档与产品重校准文档、当前仓库工作树,未读取任何 round-2 其他输出。

标签含义:

- **REPOSITORY VERIFIED**:由当前仓库代码、测试或迁移直接支持;
- **ROUND-1 EVIDENCE**:由第一轮验证文档确立的事实(含其中标记的官方文档证据);
- **REASONED PROPOSAL**:本轮从已验证事实推导出的设计判断;
- **REQUIRES USER VALIDATION**:必须用真实用户行为检验,不能当作既成事实。

# 0. 必须接受的第一轮事实(接受声明)

| # | Round-1 事实 | 本轮处理 |
|---|---|---|
| 1 | Workflow runtime 已拥有成熟 run/task/checkpoint/retry/scheduler | **ROUND-1 EVIDENCE**,见 [round-1 技术替代审计](../round-1/03-technical-substitution-audit.md) 的 identity/dispatch 矩阵;方案绝不复制 |
| 2 | Agent-Box 不应复制 workflow progression | 完全遵守:Host contract 中不存在 routing/retry/checkpoint 语义 |
| 3 | 跨 authority Binding/reconciliation 可能有真实技术价值 | **ROUND-1 EVIDENCE**(round-1 03 判定"跨执行域责任身份、多 authority 对账"是未被单一系统覆盖的真实边界);方案以此为唯一价值锚点 |
| 4 | 若只是 node config + launcher + logs,没有独立价值 | 完全接受;Kill criteria #1/#7 直接针对此风险 |
| 5 | interactive Human Finish、same-session new Execution、多个 native correlations 不自然等同普通 node | **REPOSITORY VERIFIED** 部分(codex plugin 冻结 `thread_id` 且支持同 Execution 多 Turn,[contract.py](../../../../plugins/agent-box-codex/src/agent_box_codex/contract.py));映射规则把它们列为独立类别,不做平凡 1:1 |
| 6 | 用户是否愿意把 workflow action 交给外部 substrate 尚未验证 | 承认为最高风险假设;评分与判词据此压低 |

# 结论预览

**判词:B. 候选 C 仅在 interactive / high-assurance nodes 中成立;交付形态是 SDK+adapter,Work 从强制对象降级为可选扩展。**(论证见 §11–§13)

最强方案不是"让 Agent-Box 服务所有 workflow node",而是把它收缩为一个 **provider-neutral 的 Execution 责任边界协议**:Host(LangGraph/Temporal/Prefect/内部平台)在任何需要独立责任边界的 node/activity 处,提交一次冻结了跨 authority 输入的执行请求,拿回不可变 receipt 与诚实分级的 evidence;interactive 等待与显式 Human Finish 是一等公民,不被降格为后台作业。

---

# 1. 产品定义

## 主要用户

**第一用户:构建 AI agent workflow 的平台工程师**(LangGraph/Temporal/Prefect 或内部 Host 的维护者)。他们在 graph 的少数高风险节点上需要回答:"这一次 delegated action 到底基于什么输入启动、谁接受了、实际发生了什么、哪些仍是 unknown",并且这个答案不能被 workflow retry/checkpoint 改写。这是 round-1 用户研究中的 JTBD-3 与 persona 3([round-1 用户伪造性验证](../round-1/04-user-job-work-demo-falsification.md))。**REQUIRES USER VALIDATION** — 该 persona 的付费意愿未经访谈证实。

**第二用户:在高风险交互执行中被 workflow 唤醒的人类执行者**(接手一个 attach 终端、steer、然后显式 Finish 的开发者/审核者)。他们不从 workflow 开始工作,也不应被要求理解 workflow 引擎。**REQUIRES USER VALIDATION**。

明确排除的"主要用户":只跑普通确定性计算 node 的团队——对这些节点,workflow 自己的 immutable input + history 已足够,**ROUND-1 EVIDENCE**(round-1 02 替代表 Temporal/LangGraph 行)。

## 安装入口

```text
pip install agent-box-execution              # SDK(core spine)
pip install agent-box-execution[langgraph]   # LangGraph adapter
pip install agent-box-execution[temporal]    # Temporal adapter
pip install agent-box-resolver-git ...       # resource resolvers 按需
```

入口是 **被 workflow worker 进程 import 的库 + adapter**,不是一个常驻平台。WorkBoard 保留为开发态 inspector(`agent-box-board`),不作为承诺入口。**REASONED PROPOSAL**,依据是 round-1 红队建议的交付形态(SDK + adapters + optional middleware,[round-1 red-team](../round-1/02-workflow-substrate-red-team.md)#Simplest-viable-alternative)。**REQUIRES USER VALIDATION** — round-1 风险假设 #4(workflow 平台是否愿意接入外部 callback schema)未测。

## workflow 开发者为什么采用

只有两个理由成立时才采用:

1. **省掉每个引擎 × 每个 provider × 每类资源重复手写的胶水不变量**:canonicalize→事务性冻结→digest→幂等 dispatch→attempt/session 分离→typed evidence claim。这些是临时代码最容易做错的部分,而当前 Core 已有可复用的实现与测试(**REPOSITORY VERIFIED**:输入冻结/契约限制/digest/idempotency 在 [services.py](../../../../src/agent_box/work_core/services.py) 与测试中落地;round-1 02 也承认这是"实质不变量")。
2. **高保障场景的证据语法**:当合规/事故复盘要求区分 projected / provider-reported / external-authority / attested / unknown 时,自写 wrapper 通常只会复制日志 URL。

单引擎 + 单 provider + 低保障要求的团队,这两个理由都不成立——他们应当继续用自己的 wrapper。这一点在 §11 自我攻击中正面承认。

## 它替代的重复代码

以 Temporal 为例,没有 Agent-Box 时,每次把 harness/外部动作包成 Activity,各团队都会重写:

- 把 requested selector 解析成 exact pin 并防止 resolve/launch 之间漂移(TOCTOU);
- Activity 输入 payload 的 canonical 化与 digest 计算;
- 外部副作用的幂等键管理与 crash 后"did it already start?"恢复;
- native session/run ID 回收与 attempt lineage 记录;
- 结束后把 Git actual HEAD / CI SHA / transcript digest 写回 history 的 claim 结构。

Agent-Box 把这五件事变成一次 SDK 调用背后的公共实现。**REPOSITORY VERIFIED**(其中 1/2/4/5 对应现有 Core 能力;3 的 crash reconciliation 当前 ABSENT,**ROUND-1 EVIDENCE**,须列为实现前置项)。

## 它与普通 Activity/node wrapper 的区别

普通 wrapper:`node config → env/payload → launch → logs`,全部真相都在单一 engine 内。

本方案的 wrapper 多出四个不可替代断言(**ROUND-1 EVIDENCE**,round-1 01 "Binding as contract" 四条断言的直接沿用):

1. 选择与版本分离(requested selector ≠ exact pin);
2. 冻结与 admission 分离(frozen 后 validation 只能判 valid/invalid,不能改写);
3. 期望与实际分离(provider success ≠ 使用了声明值,evidence 按 level/disposition/coverage 标注);
4. 责任与执行机制分离(receipt 属于责任窗口,不推出下一步)。

且 wrapper 若写死在一个 engine 里,就失去了同一 contract 服务 Human/CLI/CI 上游的能力(round-1 反复强调的"入口策略是 distribution 非 ontology")。

## 为什么它不是新的 workflow engine

协议中**不存在**任何以下概念:**next-node、edge/routing、retry policy、timer、queue/scheduler、checkpoint 格式、fan-out/fan-in 拓扑**。Execution 之间的先后关系只以两种形式出现:(a) Host 自己的 state/history,(b) 新 Execution 上的 `continuation_of` 血缘字段。取消、超时的"决定权"全部还给 Host;Agent-Box 只记录结果事实。这与产品重校准的 REMOVE 清单一致([重校准](../../AGENT_BOX_PRODUCT_CENTER_RECALIBRATION_2026-08-27.md)#REMOVEDEFER)。**REASONED PROPOSAL**。

## 它仍称为 Agent-Box 产品,还是 SDK?

**两者分层:SDK 是交付形态,Agent-Box 是其中的合同与词汇的名称。**

- 下限(必须成立):`agent-box-execution` Python SDK——Execution/request/receipt/evidence 协议 + resolvers + provider adapters;
- 中间层:可选本地 daemon(服务 §6 interactive 场景跨终端 attach);
- 上层(暂缓):中央 service/middleware,直到出现 ≥2 团队共用统一索引的真实需求。

因此对外叙事应为:"Agent-Box is the accountability protocol your workflow calls at high-stakes nodes"(产品名保留),而不是一个新的工作台。若后续验证显示连高保障段也需要纯嵌入式形态,则按判词 C 收缩为纯 SDK——判词 B 与 C 的差别只在 packaging,不在语义域。**REASONED PROPOSAL**。

---

# 2. Host contract

Provider-neutral 的调用流程。以下为本轮设计的核心贡献;所有字段命名是提案而非实现。**REASONED PROPOSAL** 除特别注明外。

## 2.1 请求:ExecutionRequest

```text
ExecutionRequest {
  request_id: uuid                                  # host 生成,仅日志用途
  host_ref: HostScopeRef {                          # external scope/workflow Ref
    system: temporal|langgraph|prefect|github_actions|human_cli|internal
    scope_type: workflow_chain|workflow_run|thread|run|flow_run|issue|none
    native_id: <WorkflowID+RunID | ThreadID | FlowRunID | WorkflowRunID | terminal>
    locator?: <ActivityID | NodeID | checkpoint_id | run_attempt>   # 可缺省
    uri?
  }
  responsibility_intent: bounded_text + category    # 本次责任窗口的一句话意图
  resources: [ ResourceSelector {                   # requested selectors,slot-purpose 寻址
    slot_purpose: source_revision|workspace|harness_profile|
                  credential_handle|mcp_definitions|terminal|workflow_context_snapshot
    selector: <branch@repo | worktree path | profile name | secret handle/version |
               server list | pane spec | thread+checkpoint ref>
  }]
  expected_assurance: [ SlotAssurance {
    slot_purpose
    min_level: any|projected|provider_reported|process_observed|
                external_authority|attested          # 见 §7 分级
    on_unmet: abort|degrade_recorded|proceed          # admission 策略
  }]
  idempotency_key: host_stable_string
      # 推荐: f"{system}:{scope_native_id}:{locator}" (+ input_digest 由 Core 追加)
      # 冲突语义: 同 key 同 inputs → 幂等返回既有 receipt; 不同 inputs → reject
  callback: inline | async{ sink_ref }              # async 模式的回写位置
}
```

## 2.2 接单:ExecutionReceipt

```text
ExecutionReceipt {
  execution_id                    # Agent-Box 身份,先于 provider start 存在 [REPOSITORY VERIFIED]
  request_digest                  # canonical JSON of normalized request
  binding_digest                  # canonical frozen input digest = 现 inputs_digest 语义
                                   # [REPOSITORY VERIFIED services.py:_inputs_digest]
  frozen_slots: [{ slot_purpose, requested_selector, resolved_ref,
                   authority, resolved_at, resolution_method }]
  dispatch: { state: accepted|rejected|failed,
              idempotency_key, native_correlation_refs[], at }
  rejection_reason?               # 未达 expected_assurance 时的 pre-start 拒绝(admission)
}
```

关键语义:receipt 是**不可变事实**,不是状态机起点。Host 之后一切等待/查询只能引用 `execution_id`。

## 2.3 观察与结算:Observation / EvidenceReport / Settlement

```text
Observation { execution_id, projection: active(idle|running)|terminal(outcome)|unknown,
              native_refs[], observed_at }        # 继承现 projection 语义 [REPOSITORY VERIFIED]

EvidenceReport { claims: [ EvidenceClaim ] }       # 见 §7 的六级格式

Settlement {
  execution_id
  final_projection                                  # 终态:terminal/unknown,永不 active
  human_finish?: { actor, reason, at }              # 显式 Human Finish 记录
  cancellation?: { requested_at, honored?, late_after_terminal?, verified? }
  open_unknowns: count + listing_ref                # 未闭合 unknown 清单
  artifacts: [ArtifactRef with digest]
}
```

## 2.4 控制面动作

| 动作 | 语义 | 归属 |
|---|---|---|
| `query(execution_id)` | 只读拉取 receipt/claims/projection | Core |
| `attach_info(execution_id)` | 返回 attach 描述(tmux socket/pane ids、AppServer thread id、TUI 连接命令),给人原生附着 | adapter(ExecutionProvider)+Core 索引 |
| `cancel(execution_id, reason)` | **请求**式取消:尽力转发给 provider interrupt;最终以观察到的终态为准,迟到取消记 `late_after_terminal` | Core 记录 + provider adapter 执行 |
| `pause_for_human(execution_id)` | 声明该 Execution 进入 human-in-command;Host 应视为长阻塞等待 | Core 记录状态 + Host adapter 映射等待原语 |
| `finish_by_human(execution_id, actor, reason)` | 显式 Human Finish:触发 provider finish 流程(回收 scrollback/transcript artifact)、结算 evidence、解除 Host 等待 | provider adapter + Core |

注意与现状的差距:`finish_by_human` 的 actor/approval/coverage aggregate 当前不存在(`PARTIAL` 仅在 codex tmux plugin 内部);cancellation 在 Core ABSENT。**ROUND-1 EVIDENCE**(round-1 03 实现状态矩阵)——这两项是 substrate 合同的硬前置,不是锦上添花。

## 2.5 Core 与 adapter 的职责切分

| 职责 | 归属 | 说明 |
|---|---|---|
| Execution 身份、canonical 化、事务性冻结、binding digest、幂等唯一性、事件账本 | **Core** | 全部已存在且经过测试 **[REPOSITORY VERIFIED]** |
| requested→exact 解析(Git commit/tree、profile manifest digest、pane identity、credential version handle) | **Resource resolver(adapter)** | 当前仅本地 Git/file/profile/tmux 有实现;GitHub/K8s/secret manager/MCP registry 需新增 **[ROUND-1 EVIDENCE]** |
| workflow context snapshot(Thread+Checkpoint→immutable ArtifactRef) | **Host adapter** | 对应重校准 Mode B,已有设计定位 **[ROUND-1 EVIDENCE]** |
| provider start/attach/steer/finish/cancel 翻译(Codex/Pi/tmux/未来 Claude Code) | **ExecutionProvider adapter** | codex/pi/tmux plugins 已存在未提交工作树中 **[REPOSITORY VERIFIED git status]** |
| 等待映射(Temporal activity await/signal、LangGraph interrupt+checkpoint) | **Host adapter** | 不进 Core;Host 语义各异 |
| evidence 的 issuer/method/level/disposition/coverage 标注与持久化 | **Core(词法)+adapter(产出)** | 六级词汇表见 §7;当前 Core 只有自由字符串 state,需收紧 **[REPOSITORY VERIFIED models.py/services.py apply_observation 无校验]** |
| routing/retry/timer/checkpoint/拓扑 | **Host,绝对不进任何层** | ROUND-1 EVIDENCE 事实 #1/#2 |

---

# 3. Execution 与 node/activity 映射

约束:**不得增加 Core Node/Activity entity**。映射关系完全活在 adapter 与 host_ref 字段里;Core 只认识 Execution + typed Refs。这与重校准 REMOVE 清单一致。**REASONED PROPOSAL**。

## 3.1 对照表

| Native 对象 | 自然责任粒度 | 与 Agent-Box Execution 的典型基数 |
|---|---|---|
| LangGraph Node | 一次 graph step/task | 一个 node 通常发起 **0..N** 个 Execution(N=Send fan-out 或重绑定 retry) |
| LangGraph Run | 一次 assistant invocation(thread 内) | 简单情形 **1 Run : 1 Execution**;HITL continuation 时 1 Thread : N Execution |
| LangGraph Send / 并行 worker | graph 内部扇出 | 只有 worker 需要**独立 workspace/审批/lifecycle** 时升级为独立 Execution(重校准立场)否则不产生 Execution |
| Temporal Workflow / Workflow ID chain | 长逻辑执行 | chain 映射到 **host_ref.scope**,不是 Execution;Executions 是 chain 里被 delegate 出去的活动 |
| Temporal Activity(+Task attempts) | 一次非确定性副作用 | 若 Activity 恰好承载一次 harness 责任则近似 **1:1**;Activity Task attempt 只是 correlation refs,**绝不当 Execution** |
| Prefect FlowRun / TaskRun | flow/task invocation | batch 型 **1:1**;FlowRun 内多个 TaskRun 各自委托时 1 FlowRun : N Execution |
| GitHub Actions WorkflowRun / Job | CI trigger/job | 纯 CI 责任通常**不需要** Execution(native 元数据足够,round-1 判定);当 job 是被某个更高层 Execution 委托的 authority 事实来源时作为 **RunRef correlation** 附着 |
| Codex/Pi Session(Thread)/Turn | 对话容器 / 一轮交互 | Session 过宽、Turn 过窄;常见 **N Execution : 1 Session**(continuation)或 **1 Execution : M Turn**(同 Binding 多轮)**[ROUND-1 EVIDENCE + REPOSITORY VERIFIED codex contract]** |
| Agent-Box Execution | 一次有界责任窗口 | 开始前合同 + 结束后归责边界;1:N native objects,N:1 native session |

## 3.2 必答问题

**何时一一对应?**
节点是一次性的、非交互的外部副作用拥有自己的资源(batch transform activity、一次性 harness 调用、CI 验证),且无独立于 workflow 的长期目标——此时 1 node : 1 Execution 是默认约定俗成的最简形状。这是**唯一**允许 1:1 心智模型的情形。**REASONED PROPOSAL**

**何时一个 node 产生多个 Execution?**
四种触发,彼此正交:
1. **重绑定 retry**:retry policy 重新 resolve(如分支又前进了、profile 变更)→ 每次 freeze 都是新 Binding → 新 Execution;
2. **Send/并行扇出**:每个 worker 有独立 workspace、审批或 lifecycle;
3. **同 session 重开责任**(continuation):E1 terminal 后同一 Thread 因新约束开启 E2,`continuation_of=E1` + input `SessionRef=S1`;
4. **assurance 升级**:首次尝试 assurance 未满足,on_unmet=abort,人工批准后以新 assurance 重新进入。
**REASONED PROPOSAL**,第 3 条与 codex/pi plugin README 语义一致 **[REPOSITORY VERIFIED via round-1]**。

**何时多个 node/run 属于一个 Execution?**
仅当:同一份 frozen Binding、同一 responsibility intent、同一 provider logical execution 同时跨越多个 graph 步骤——典型是一个**长交互 harness 会话**被若干辅助 node(monitor、validate-input、post-process)围绕,它们不改变资源集合。保守原则:**宁可多个小 Execution,不合并**;合并条件不满足时强行共享会让审计窗口失真。**REASONED PROPOSAL**

**retry 是否新建 Execution?**
决策函数:

```text
same_execution(retry) ⇔ (binding 不变 ∧ intent 不变 ∧ provider 不变 ∧ 无新 approval/authority 进入)
```

成立时 retry 以 **attempts** 表示:多个 native RunRef/attempt refs 挂在同一 Execution 下、事件账本记录每次 observe;不成立任一项即新 Execution(输入漂移→重新 freeze;换 provider;CI 失败引入新事实→remediation escalation)。诚实说明:当前 Core 模型没有 attempt lineage 字段(`Execution` dataclass 无此概念,**REPOSITORY VERIFIED** [models.py](../../../../src/agent_box/work_core/models.py));最小做法是不加实体,attempt 作为附加 NATIVE Ref + 事件序列表达,**REASONED PROPOSAL**,并修正 round-1 发现的 failed-idempotency 缺陷(same-key 再调用不再静默返回,`services.py:101`)**[ROUND-1 EVIDENCE]**。特别注意与 round-1 03 的表述一致性:Prefect FlowRun `run_count` 式同 ID retry 与 Kubernetes Pod 替换(UID 变化但 Job 同责任)都属于 attempts,而 Temporal Continue-As-New / GitHub rerun-new-job-execution 视 binding 是否重 freeze 决定。

**same native session continuation?**
Session continuity 与 responsibility continuity 正交:同一 S1 可以承载 E1…En,每个 Ei 用完即封存,永不 reopen。当前 `resume_execution()` 允许对 terminal Execution 调用,与本原则冲突 **[ROUND-1 EVIDENCE, round-1 01]**;substrate 方案下该接口必须改为:对 terminal E 只能派生带 `continuation_of` 的新 E(REPOSITORY 级语义修正,属最小迁移,§4.6)。**REASONED PROPOSAL**

**Human Finish 与 node return?**
Node return 必须 await 于 `finish_by_human`(或 Host 明确声明的 auto-settle policy)产生的 Settlement,**不是** turn completed、TUI idle、process exit 三者中的任何一个。**REASONED PROPOSAL**;依据是 round-1 已确认的事件语义(EXECUTION_TERMINAL 由 observation 驱动,而 Human Finish 是另一层治理决定)[ROUND-1 EVIDENCE events.py]。workflow 侧如果选择 fire-and-forget,Execution 保持 open 并出现在 orphan 查询里——这是合法配置,但要可见。

**workflow cancel 与 Provider terminal 冲突?**
优先序规则(永久不可改写):
1. provider 先 terminal → cancel 无论如何到达都记 `late_after_terminal=true`,终态以 terminal 为准;
2. cancel 生效 → projection=cancelled/aborted outcome;若 harness 进程无法保证死亡(例如 tmux pane 存续),evidence 必须显式标注 "cancel-requested; termination unverified"(unknown level),禁止写成成功取消;
3. 竞态 → 先到的权威事实定型,后到的作为事后记录附加。
当前 Core 无 cancel 命令(ABSENT),上表是实现合同。**REASONED PROPOSAL**(建立在 ROUND-1 EVIDENCE 的 ABSENT 事实上)

---

# 4. Work 的去留

**选择:D. Core 不要求 Work,提供可选 Case/Work extension。**

## 4.1 为什么是 D 而不是 A/B/C

- **A(强制 Work)出局**:substrate 的每一次请求都来自已有 long-running scope(Temporal chain、Thread、Issue),强制 parent 等于命令 Host 再造一个影子 object;round-1 04 场景表中 A 无一列胜出。**ROUND-1 EVIDENCE**
- **C(彻底删除 Work)过激**:direct interactive 用户(Human 发起、Human Finish)在没有 workflow 时确实缺少一处长期目标锚点与 completion 决定记录;JTBD-1/2(不依赖 workflow)仍是潜在市场。**ROUND-1 EVIDENCE**(round-1 01 工作分析选 B 的理由)
- **B 与 D 的差别**:B 说"Work 可选";D 进一步规定 **Work 的现行强制模型迁出 Core 主路径、以 extension 包(Case)提供**——因为 round-1 红队已经证明现行 Work 没通过删除测试(objective+lifecycle 无 acceptance/obligation/participants,替代物 Issue/Thread/Project 均更强)**[ROUND-1 EVIDENCE round-1 02]**。保留它作为 Core 强制外键,等于让一个已证伪"不可替代性"的对象持续向每个 API 施加税。**REASONED PROPOSAL**

## 4.2 失去 Human completion 后怎么办

三层兜底:
1. direct(无 workflow)使用场景装上 Case extension,获得 complete_work/reopen_work 及 completion decision 历史(现服务方法原样搬移,services.py 的 `complete_work/reopen_work` **[REPOSITORY VERIFIED]**);
2. substrate 场景中,"完成判定权"本来就属于 Host/PR/release owner——Agent-Box 以 `external_completion_ref`(PR merged / release tag / issue closed)记录外来完成事实,不抢所有权(与重校准"Work completion 必须是 Human/Host 显式治理动作"一致,只是动作发生在别处)；
3. 无任何 scope 的孤立 Execution 允许存在(orphan 可查询),不影响证据链价值。

## 4.3 direct interactive use 是否仍支持

支持,而且是候选 C 的另一半:CLI/console 入口 `agent-box run --goal … ` 直接创建无 host_ref(scope_type=human_cli,native_id=terminal id)的 Execution,走同一 Freeze→Dispatch→Finish 协议。这保证 substrate 不是"逼所有人先进 workflow"。round-1 demo 移除测试也证明"无 workflow 版本反而首看更清楚" **[ROUND-1 EVIDENCE round-1 04]**。

## 4.4 没有 workflow 的用户是否属于产品范围

属于,但排序第二。商业上先验证 Host-driven 段(round-1 判定 B 为优先方向),direct 段用同一 SDK 复用,不单独承诺桌面产品。**REASONED PROPOSAL** 融合 **UNVERIFIED PRODUCT HYPOTHESIS**。

## 4.5 是否应保留 WorkBoard

保留但收缩为 **inspector/debug console**(round-1 04 的主定位:observe/control console)。它不再是安装入口或默认界面;其 Evidence 面板恰好是 §7 分级格式最早的试验场(当前 `coverage unavailable` 硬编码必须先替换,**REPOSITORY VERIFIED** app.py/model.py per round-1 引用)。**REASONED PROPOSAL**

## 4.6 最小 migration/API 变更(设计,不实施)

1. `core_executions.work_id` 从 NOT NULL 改 nullable;新增 `scope_json`(HostScopeRef)与 `continuation_of`(nullable,指向 execution_id);
2. 现有 `create_execution()` 增加 `scope=` 参数路径,`work_id` 参数移入 `case_ext.create_case(...)`;事件类型新增 `EXECUTION_SETTLED`/`HUMAN_FINISH_RECORDED`/`CANCEL_REQUESTED`,沿用现 EventType 枚举模式 **[REPOSITORY VERIFIED events.py]**;
3. `resume_execution()` 收紧:terminal 时抛出,提示派生 continuation_of 新 Execution;
4. Work 模型本身不动,打包进 `agent_box.case` extension——SQL 迁移量集中在一张表的约束与两列新增;
5. WorkBoard 读路径兼容 nullable work_id(列表页允许空 scope 分组)。

以上是让 substrate 成立的**最小**侵入集,不触碰 Ref/Dispatch/Evidence 存储布局。**REASONED PROPOSAL**

---

# 5. Binding 与普通 workflow input 的差异

用一个真实 Temporal 例子。

## 场景

Temporal workflow `ml-rollout`:Activity `patch-service-agent` 要让 coding harness 在 `deploy-repo` worktree 里改 Terraform 并提 PR。

```python
@activity.defn
async def patch_service_agent(input: PatchInput) -> PatchResult: ...
# input = {"branch": "main", "worktree": "/wt/deploy", "profile": "tf-prod",
#          "prompt_ref": "s3://prompts/tf-patch.md", "ticket": "OPS-482"}
```

## workflow state/input 已经保存了什么

**ROUND-1 EVIDENCE**(round-1 02 Temporal 节,官方文档佐证):Event History 不可变保存 Activity scheduled 的完整 payload——也就是上面这些**字符串**;Activity result 同样入库;Search Attributes/Memo 可挂业务元数据;retry/heartbeat/cancel 生命周期全归 Temporal。

## Agent-Box 额外冻结什么(workflow 原生不拥有的)

| 冻结物 | 为什么 Event History 给不了 |
|---|---|
| `branch:"main"` 在 resolve 时刻的 exact commit+tree(authority read-back) | History 只有字符串 `"main"`;payload 提交后 main 可能前进,**History 无法证明活动跑时用了哪个 commit** |
| worktree 物化后的 actual HEAD + dirty/diff digest | 这发生在 worker 文件系统里,不在 History |
| profile manifest 的 byte digest(排除 credential) | 字符串 `"tf-prod"` 可随时被编辑;versioning 归文件系统/Git,Workflow 不知道 |
| credential **handle+version**(不含值) | Temporal 明确建议 secrets 在 Activity 内从外部 manager 取;取的是哪个 version,History 无从知晓 |
| dispatch 前 atomic freeze 的 slot 集合与 binding digest | payload 到 start 之间存在 TOCTOU 窗口(resolved≠launched);durable acceptance 与实际 process started 的区分也超出 History 表达(Activity Started 是 worker 报告,不是 provider-side 接单收据)|
| resolution 每个 slot 的 authority/resolved_at/method | 让"main 当时是什么"可以事后被独立质证,而不是相信 payload 抄写 |

随后 evidence 回写:`activity.return value` 不再是一句 "done",而是携带 §7 分级的 EvidenceReport(Git HEAD verified / tests provider-reported / MCP load unknown / PR link),Host 把 report 存入自己的 History/Search Attributes —— 回写就是普通 Activity result,不需要 Temporal 信任 Agent-Box。

## 如果用户自己写几十行 adapter 就能实现,为什么还要 Agent-Box

诚实的答案分两层:

1. **几十行版本是存在的,而且对单引擎低保障团队应该继续自己写。**他们只需要 payload+logs 时,`:40 行 git rev-parse + activity inputs digest` 就够,Agent-Box 是过度工程。这一坦白写进 Kill criteria #1。**REASONED PROPOSAL**
2. 当需求越过硬门槛时,自写版会漏掉的恰是不可修补的不变量:atomic freeze(解析结果与 launch 请求的一致性要求事务边界)、幂等冲突检测(started-but-not-recorded 的 crash 窗口)、跨引擎统一的 claim 词汇(每家 ad-hoc JSON shape 无法互相比较)、以及"期望 vs 实际"的 divergent 判定规则。这些在当前仓库是经过 135 个测试的实现,不是纸面设计。**REPOSITORY VERIFIED**(测试计数 **ROUND-1 EVIDENCE**)——价值是否大到付费,取决于组织横跨多少引擎×provider×保障等级,**REQUIRES USER VALIDATION**。

---

# 6. Interactive Execution

Substrate 的差异化支柱之一:workflow 调用的执行可以是人在环上的交互会话,不得被降格为后台作业。逐项设计:

- **如何 attach terminal**:`dispatch` 返回的 receipt 含 `attach_info`(tmux socket+session+window+pane ids,或 AppServer thread id + 连接命令)。用户**原生** attach(tmux attach / TUI connect),不经 workflow、不经 Agent-Box 代理流量。相关精确 pane 资源/attach 能力已在 tmux provider 实现 **[REPOSITORY VERIFIED via round-1 03 矩阵]**。
- **workflow 是否阻塞等待**:由 Host adapter 决定,Core 不要求——Temporal 推荐模式:长 activity `await settlement`,期间 `activity.heartbeat()` 维持活性(activity heartbeat timeout 设宽);LangGraph 推荐模式:node 发起后在 graph 层 interrupt+checkpoint,人不占 worker;Prefect 类似 pause/await。Core 只提供 query/settlement 通知,等待原语全部是宿主的。**REASONED PROPOSAL**
- **Harness idle**:turn completed/TUI idle 只把 projection 置为 `active(idle)`,**永远不是终态**;Host 持续等 Settlement。现投影枚举(active/terminal/unknown + outcome/resumable_now)已能表达 **[REPOSITORY VERIFIED projection.py]**。
- **Human steer**:中途追加指令 = 同一 Execution 内追加 turn(codex provider 支持 steer/多 Turn **[REPOSITORY VERIFIED via round-1 03]**),事件账本记录 steer;若 steer 需要改变资源集合/责任 → 不允许原地改,走 §3.2 新 Execution 路径。
- **explicit Finish**:人执行 `agent-box finish`(CLI/board 按钮),调 provider.finish()(回收 scrollback/transcript artifacts)→ Settlement.human_finish={actor,reason,at} → Host await 处恢复,node 返回 evidence。actor/approval 记录当前缺失,是实现项 **[ROUND-1 EVIDENCE partial]**。
- **process exit**:harness 进程退出 ≠ Finish。exit 且未见 finish → projection=`terminal(outcome=exited_without_finish)` + orphan 告警,execution 保持待决;不自动结算证据 coverage。防止"关窗即验收"。
- **session resume**:worker/客户端崩溃后,重启方用持久化的 accepted dispatch + frozen inputs 重建控制:tmux 路径 recover_handle 已部分可用(AppServer handle 仅进程内存、DB 写前崩溃丢 correlation 仍是缺口)**[ROUND-1 EVIDENCE PARTIAL]**——通用 crash reconciliation(detect pending & reattach by native id)列为 P0 前置实现项。
- **timeout/cancel**:互动超时不是自动失败:endpoint 超时记 observation(timeout at T),continuation/放弃决定交还 Host;settlement 中如实保留 unknown。cancel 语义遵 §3.2 最后一条。
- **Host recovery**:Temporal replay 场景下,receipt/settlement 必须可以从 History 确定性重建 → 要求 receipt 内容为纯数据、幂等 key 稳定;宿主重启后 query(execution_id) 仍可拉取全部事实(SQLite 账本持久)。idempotency 的 failed 态缺陷修复同 §3.2。**REASONED PROPOSAL**

不可妥协的红线:**interactive execution 不能为了适配 workflow runtime 而被改成 fire-and-forget 后台任务;等待体验的差异是它存在的理由之一。**(对应 round-1 事实 #5)

---

# 7. Evidence 可信度

## 7.1 六级可信度与回传格式

采纳 round-1 技术审计的证据学框架(E0–E7/Disposition/Coverage),压缩为 brief 指定的六档。**ROUND-1 EVIDENCE** 框架 + **REASONED PROPOSAL** 编码:

| 档位 | 对应 round-1 等级 | 能证明 | 典型例子 |
|---|---|---|---|
| `projected` | E2/D1 | bytes/ref 已放进 env/stdin/JSON-RPC/pane/context | prompt 写入 turn/start 请求体 |
| `provider-reported` | E4/D2 | Harness/runtime 自报收到/消耗/产出 | AppServer tool-call event;"tests passed" |
| `process-observed` | E3(/D1–D2) | 独立进程/OS/终端观察:PID、pane 活性、fs HEAD、exit code | rev-parse HEAD 于实际 worktree;scrollback digest |
| `external-authority` | E5(/D3 条件) | 拥有真相的 authority read-back:Git、GitHub API、K8s、Vault audit | PR head_sha 比对;secret version access receipt |
| `attested` | E6/E7 | digest 绑定 / 受信 signer 签名声明(DSSE/in-toto/SLSA) | artifact sha256 校验 + signed provenance |
| `unknown/unverifiable` | E0 | 什么都不证明 | 模型是否语义使用 prompt;未声明资源的负向 claim(除非 coverage 达 C1) |

```jsonc
EvidenceClaim {
  claim_id, execution_id,
  subject:      { kind: slot|artifact|execution, ref },     // 指向 frozen slot 或产出物
  proposition,                                              // e.g. "workspace HEAD == c1a9…"
  issuer:       git_resolver|codex_provider|tmux_observer|github_api|…
  method:       rev-parse|api-read-back|jsonl-hash|… ,
  level:        projected|provider-reported|process-observed|
                external-authority|attested|unknown,
  disposition:  unknown|projected|provider-reported-consumed|
                authority-verified-consumed|produced|mismatch|divergent,
  coverage:     { kind: unknown|bounded-complete,
                  window?, surface?, failure_modes? },
  integrity:    { digest, signature?, signed_by? },
  observed_at, payload_artifact_ref?
}
```

要点:`mismatch/divergent` 是一等 disposition(CI head_sha ≠ requested、workspace dirty、profile 被中途编辑都要落在可见档位),而当前 `apply_observation` 接受任意自由字符串、fake adapter 可自行写 consumed——必须替换为上述受控词汇并把 issuer/coverage 持久化。**REPOSITORY VERIFIED(现弱点)/ REASONED PROPOSAL(目标格式)**。

## 7.2 workflow 据此能做什么 / 不能做什么

能:
1. **门控路由**:报告存在 mismatch 或 required-assurance 未满足 → Host 自己的 conditional 决定 repair/review 分支(routing 仍在 Host);
2. **沉淀审计**:report 整体写入 Event History/Search Attributes/PR comment,成为 workflow 的一等输出;
3. **量化未知**:open_unknowns 计数让人工审批有的放矢;
4. **重放一致**:因为 evidence 是 deterministic 数据,Replay 不引入歧义。

不能:
1. 断言"模型理解/遵循了 prompt"(attention 不可观测 → unknown);
2. 在 coverage<bounded-complete 时作负向断言("没用额外 MCP");
3. 把 execution success 升格为业务验收(Settlement ≠ 完成,判定在外部 authority/Human);
4. 让集中存储冒充独立证据强度——Level 来自 issuer authority,不来自 Agent-Box 数据库。

**REASONED PROPOSAL**(界限沿用 round-1 02/03 两份红队与技术审计结论)

---

# 8. 分发与部署

| 形态 | durability/身份 | 集成复杂度 | interactive attach | 部署负担 | 适用 |
|---|---|---|---|---|---|
| **Python SDK(嵌入 worker)** | 依赖宿主持久化 + 本地 SQLite 账本;身份随 Core DB | 低~中(进程内调用) | 最强(直接持有 PTY/stdio/tmux) | 最低 pip install | 首选,绝大多数单团队 |
| Sidecar(每 worker pod) | 中;与 worker 生命周期绑定 | 中(IPC 协议) | 中(PTY 经 sidecar 需转发) | 中(K8s 注入模板) | 仅当 worker 无法装 python 库 |
| Local daemon(单机常驻) | 中高(独立 SQLite,跨终端存活) | 中(local socket + 版本协调) | 强(daemon 代管 handle,崩溃恢复更好) | 中(一用户一进程) | **Fallback/增强**:直接交互段 + 跨终端 attach |
| Remote service | 最高 | 高(auth/多租户) | 弱~中(session gateway 成本高) | 高 | ≥2 团队需要统一索引/策略时再说 |
| Workflow-specific plugin(如 langchain-community 式分发) | 同 SDK | 每引擎一份,碎片化 | 取决底座 | 低 | 作为 SDK 的**分发外壳**,不是独立形态 |

**首选:Python SDK**,plugin 包只是它在各生态的发布皮;**fallback/local 升级:local daemon**,专门解决 §6 的跨进程恢复与多人共看(单一用户的 SQLite 已够,无需服务端共识)。**中央数据库:当前不需要**。SQLite per deployment(.agent-box/)足以支撑 receipt/claim 查询与追加性;仅当出现组织级"所有 Execution 必须可全局检索"的合规需求,才启用 remote middleware——那时它收 claim、不发号施令。Round-1 的部署形态权衡(sdk/service trade-off 表)与判决升级标准均支持此择序。**REASONED PROPOSAL**,引 **ROUND-1 EVIDENCE**。

顺带回应:"SDK 单机 SQLite 会不会毁掉 durable receipts?"——不会立即;真正的 durability gap 只在"native start 成功但 record_dispatch_accepted 之前崩溃"的窗口。substate 设计通过 host-stable idempotency_key + provider-side 可重查 id(correlation before ack)收敛此窗口,是 P0 前置(§6/§9)。**ROUND-1 EVIDENCE(crash window ABSENT)+ REASONED PROPOSAL**

---

# 9. 最小 integration(设计草图,不实现)

## 9.1 LangGraph sketch

```python
# 包: agent-box-execution[langgraph]
from agent_box_exec.langgraph import governed_tool_node, settle_from_state

graph.add_node("patch_agent",
    governed_tool_node(                       # 不是新 engine:只是包装函数
        slot_purpose_map={
            "source_revision": StateSelector("git_branch"),
            "workspace":       StaticSelector("/wt/deploy"),
            "harness_profile": StaticSelector("tf-prod"),
            "workflow_context_snapshot": CheckpointSelector(),   # 冻结 thread+checkpoint → ArtifactRef
        },
        provider="codex_appserver",
        expected_assurance={"source_revision": ("external_authority", "abort"),
                            "mcp_definitions": ("provider_reported", "degrade_recorded")},
    ))

# governed_tool_node 内部行为(无 graph/step 侵入):
#   1. build ExecutionRequest(host_ref=thread_id+checkpoint_id, idempotency=f"lg:{thread}:{checkpoint}")
#   2. core.freeze_and_dispatch(...) -> receipt; 若 rejected -> raise GraphRejected (node-level, Host 自己处理)
#   3. interactive: return interrupt(payload=receipt.attach_info)
#      resume 时 -> wait_for_settlement() -> return {"ab_receipt": settlement.model_dump()}
#   4. evidence 自动写入 state["ab_receipt"]; LangGraph checkpointer 持久化照旧, Core 不镜像
```

Retry/rebind 语义落点:LangGraph node-level retry(policy 定义在编译参数里)如果是同一 frozen receipt 的二次投递 → Core 幂等返回既有 execution;若 state 里 requested branch 变了 → digest 不同 → 新 Execution 自然发生,**Zero graph-schema knowledge in core**。

## 9.2 Temporal sketch

```python
# 包: agent-box-execution[temporal]
AB_SETUP = ab.TemporalSetup(data_dir="./.agent-box")

@activity.defn
async def patch_service_agent(ctx: asyncio.CancelGroup, inp: PatchInput) -> dict:
    req = ab.ExecutionRequest(
        host_ref=ab.HostScopeRef.temporal(inp.workflow_id, inp.run_id,
                                          locator=f"activity:{ctx.info().activity_id}"),
        responsibility_intent="Patch terraform and open PR for OPS-482",
        resources=[...],                     # 同 §5 示例
        expected_assurance=[...],
        idempotency_key=f"temporal:{inp.run_id}:{ctx.info().activity_id}",
    )
    receipt = AB_SETUP.client.freeze_and_dispatch(req)
    if not receipt.accepted:
        raise ApplicationError(receipt.rejection_reason, non_retryable=True)  # 让 workflow 走自己的分支

    try:
        while True:
            obs = AB_SETUP.client.query(receipt.execution_id).projection
            if obs.terminal or obs.state == "active-idle-waiting-human":
                break
            ctx.heartbeat() ; await asyncio.sleep(30)
    except asyncio.CancelledError:
        AB_SETUP.client.cancel(receipt.execution_id, reason="workflow cancel")
        raise

    settlement = AB_SETUP.client.settlement(receipt.execution_id)
    # Temporal determinism: settlement 是纯数据 -> Replay 安全; SearchAttribute 可选挂 execution_id
    return {"ab_settlement": settlement.model_dump()}
```

Interactive human waits:同 activity 内 heartbeat 循环直至 Human Finish(或 split into signal-wait)。continue-as-new 场景:新 Run 带 `continuation_of` 新 request —— Host 决定,Core 只记录血缘。

两个 sketch 的共同点:**学习面只有一个函数族(freeze_and_dispatch / query / cancel / settlement)**;其余全是各引擎母语。

---

# 10. Demo(90 秒平台工程师 Demo)

设定观众:管理 Temporal/LangGraph 生产 agent workflow 的平台工程师。

| 时间 | 画面 | 旁白要点 |
|---|---|---|
| 0–10s | Temporal Web UI:workflow 停在 `patch-service-agent` activity,event history 显示 `ActivityTaskScheduled`,无结果 | "workflow 卡在一个不该由它自己背责任的动作上" |
| 10–25s | 切到工程师侧:提交 ExecutionRequest;面板展示 requested(`branch=main` 等 3 slots)→ resolved/frozen(exact commit `c1a9…`+tree、profile digest、cred version **handle**) | "**freeze 时刻 pin 死了**;下面会看到为什么重要" |
| 25–33s | (插入 3 秒)第二次请求因 `expected_assurance.source_revision=external_authority` 未达而被 **pre-start 拒绝**(requested selector 解析不到 pinned 规则) | 证明这不是 launcher:会说不 |
| 33–45s | Receipt 回到 workflow event history(activity started);右侧真实终端出现 harness 会话;工程师 `tmux attach` 进入 | "执行交给了有权限的人+进程;workflow 只是等着" |
| 45–60s | 人 steer 一轮修改 → 在 box CLI 打 `agent-box finish`;面板点亮 evidence:**Git HEAD external-authority ✓ / tests provider-reported / MCP loading unknown / 1 divergent(profile 在运行中被编辑过)** | "注意没有人说'一切成功';分级+分歧被显式暴露" |
| 60–75s | 回到 Temporal UI:settlement 作为 activity result 入 History;workflow 的下一行是 **它自己的** condition 代码 reading the report → 路由去 review 分支 | "下一步是谁决定的?workflow。Agent-Box 从头到尾没画过一个箭头" |
| 75–90s | 因 review 意见,同一 native session 开 E2(面板并排 E1 sealed / E2 new binding);E1 依旧不可变 | "责任窗口被封存,历史不可能被改写" |

## 为什么一般观众可能看不懂 & 如何避免显得只是 node launcher

- **理解门槛**:需要预先知道 Temporal activity 是什么 + 容忍治理词汇(freeze/assurance)。一般观众的 10 秒注意力里,屏幕上半部看起来仍然是"启动了一个 agent"。对策:(a) 平台版 demo 只面向平台渠道;(b) 给一般观众准备 round-1 推荐的无-workflow 60 秒版本(zero-engineering minimal loop);(c) 全程角标 **"谁决定下一步:Temporal"**,视觉上不断否定 orchestration 误读。
- **反 launcher 的三根钉子**:① pre-start rejection(拒绝执行的瞬间,launcher 人设崩塌);② divergent fact不被 success 吞掉(日志工具做不到主动对账);③ sealed E1 + E2 continuation(启动器从不关心历史不可变)。
- 观众测试沿用 round-1 七题准则,预期"什么被证明了/什么仍 unknown""和 Temporal 关系"两题过线、"为什么不用 shell"一题最难 —— 老实说这决定了 demo 的成败阈值在平台人群内测。**REQUIRES USER VALIDATION**

---

# 11. 自我攻击与退出条件

## 五个必答攻击

1. **为什么 workflow 团队不自己写 wrapper?**
   他们会,而且多数情况下应该。Agent-Box 只在三种条件下勉强值得存在:横跨 ≥2 引擎或 ≥2 providers(不变量无法在各处一致复刻)、required-assurance(自写版本几乎总是止步于 logs)、或 interactive-finish 语义(node return 必须等人,自写极易写成轮询 pane/exit)。三者全不占的组织不是目标用户。**REASONED PROPOSAL**,采纳 **REQUIRES USER VALIDATION** 的企业级怀疑(round-1 风险 #1/#4)。
2. **是否被上游 lifecycle 完全支配?**
   Entry/exit/retry/进度确实全在上游。辩护:positioning 就是"选择性责任边界"而非"总控";但承认在 non-bypass enforcement 出现前(credential/admission hooks),上游随时可绕开 Agent-Box 直发 provider——这意味着产品主张必须是"更好的合同",而非"唯一的通道"。round-1 subordination test 已给出 7/16 的冷酷分数,本项目没有推翻它的证据。**ROUND-1 EVIDENCE + REASONED PROPOSAL**
3. **Work/WorkBoard 是否变成多余?**
   在 substrate 路径内:基本是。所以 §4 直接选择 D(extension + inspector)。多余的判定不必回避,转为架构结果。**REASONED PROPOSAL** 基于 **ROUND-1 EVIDENCE**(Work 未通过删除测试;UI pull 未证明)。
4. **interactive execution 是否与 workflow runtime 冲突?**
   有真实工程冲突:Temporal activity 占用 worker slot 长时间 heartbeat(浪费 worker 容量或心跳超时误杀)、LangGraph interrupt 恢复后 attach 信息可能过期(harness 进程也死了)、replay 时 interrupt 语义要求 deterministic。缓解(signal-based detach-wait、daemon 手柄代管、recovery 验证)都是可行工程但尚无任何生产案例;这正是判词把"interactive"列为前提条件而非普适能力的原因。**REASONED PROPOSAL + REQUIRES USER VALIDATION**
5. **替换 Agent-Box 是否只需复制几个字段?**
   对 happy-path、单引擎、低保障:**是的**,4 张表 + 一层 wrapper 即可(round-1 已经演示过最小 schema)。要让"复制几个字段"失效,需要上面三条件至少其一——即差异化不是普遍存在的,是局部持有的。本判词(B 而非 A)正是这句实话的结构化表达。**ROUND-1 EVIDENCE + REASONED PROPOSAL**

## Kill criteria(≥5;命中任意一条,相应结论降级或终止)

1. **launcher 复归**:试点中单引擎团队用 ≤1 人日 wrapper 复制了他们需要的全部行为,且 90 天后无人续用 Agent-Box → C(纯 SDK)甚至 E。
2. **interactive 支柱塌陷**:≥2/3 个 interactive 试点中,durable-wait 在宿主语义下无法干净实现(心跳误杀/恢复丢失 attach),被迫退化成后台 job → 撤回"interactive/high-assurance"判词的前半段,只剩 assurance 段。
3. **信用坍缩**:试点的结算报告中 >50% 关键 slot 停留 unknown/projected,且利益相关者认为这与"读日志"无差异 → evidence pillar 失败,退化为 correlation index。
4. **boundary 腐蚀**:任何一次为了促成集成而在 Core 里添加 retry policy/scheduler/checkpoint mirror/node entity 的时刻 → 架构红线突破,即刻中止 substrate 主张(自我证伪条款)。
5. **分发通道封锁**:≥2 家目标平台以安全/权限政策拒绝第三方 receipt callback/evidence write-back 的 schema → B2B substrate 路线沉没,仅剩 direct-personal 市场(规模存疑)。
6. **认知失败**:面向平台工程师的内测中,多数观看者仍描述产品为"帮我启动 node 的工具" → 叙事失败,即使技术成立也应停止投入。
7. **零残留测试**:真实事故复盘时,删除 Agent-Box 后团队说不出任何一个此前能回答而现在不能的问题 → replaceability 定罪,E。

---

# 12. 统一评分

1–5,高分=对该维度有利。

| 维度 | 分 | 依据 |
|---|---:|---|
| independent JTBD | **3** | JTBD-3 存在且机制具体,但完全依赖 workflow 语境,且仅有 REASONED HYPOTHESIS 级证据(round-1 04) |
| differentiation | **3** | 跨 authority 冻结+六档证据+continuation 语义组合确无单品对照(ROUND-1 EVIDENCE 03#7);但组件高度商品化、组合可被手抄 |
| user friction | **2** | Host 要接 request/settle 两个面,Interactive 还要教会"blocked 不等于死机";概念负载对普通开发者偏高 |
| evidence credibility | **2** | 分级词汇设计合格,但现实管线 today 大多 provider-report/unknown,且 attestation 全链路 ABSENT;呈现格式的改进没有改变 issuer 权威结构(REPOSITORY VERIFIED + ROUND-1 EVIDENCE) |
| workflow integration | **4** | Contract 与 Temporal/LangGraph 原语(action await/checkpoint interrupt/search attributes)映射顺畅,官方能力经 round-1 官方文档核验;适配面小(一个函数族) |
| implementation feasibility | **3** | SDK/spine 大半已在仓库(合计 135 个测试通过,ROUND-1 EVIDENCE);欠缺:crash reconciliation、cancel、settlement/human_finish、failed-idempotency 修复——皆为常规工程但无一件已完成 |
| replaceability(protection) | **2** | happy-path 可抄;三条件之外的用户流失毫无阻力(round-1 02 七类替代) |
| deployment burden | **4** | SDK-first + 可选 local daemon,无中央数据库要求;显著优于独立 control plane(对手选项) |
| Demo clarity | **2** | 对 platform engineer 中上;对大众接近不可懂(round-1 04 理解测试预测不过线);必须双版本运营 |
| Core boundary integrity | **4** | 增加的全部是语义(security vocabulary, settlement)不加 engine;唯一破口是动 work_id nullable + continuation 语义收紧(仍无新实体) |
| **合计** | **29/50** | 中位偏弱:强在"放在哪"(integration/boundary/burden),弱在"凭什么有人要"(friction/evidence/replaceability/JTBD-evidence) |

---

# 13. 最终判词

**B. 候选 C 仅在 interactive / high-assurance nodes 中成立。**

分解陈述:

1. **不整体成立(A 否)**:对所有 node 通吃的 substrate 没有过任何一轮的反驳——普通确定性 node 的最佳归属是引擎自身 metadata,"-Agent-Box 化"每一个 node 只会产生摩擦与重复账本(ROUND-1 EVIDENCE facts #4 + Kill #1/#7)。**REASONED PROPOSAL**
2. **成立的窄域**:同时满足以下任两条的 node/activity 集——①人在环上(attach/steer/explicit Finish 是责任闭环的一部分);②expected_assurance 高于 projected(需要 authority read-back 甚至 attestation);③同一 native session 需要多窗口延续或一对多 native correlations;④frozen 输入横跨 ≥2 个 authority(Git×profile×credential×context snapshot)。这些恰是 round-1 反复确认"workflow/CI/K8s 单品都不自然拥有"的边界。**ROUND-1 EVIDENCE**
3. **交付形态与 C 的关系**:SDK/adapter 是 packaging 结论(round-1 B 判词照单全收);"B"回答的是语义域在哪,而不否认包装上是 SDK——若未来高保障窄域也被证明可完全自助(pilot kill #1),最终归 C,届时本文件的主张已被忠实执行并退役。
4. **不是 D(双入口 control plane)**:两个硬前提(non-bypassable admission、organizational completion authority)没有任何证据,**且依赖 round-1 已列为最高风险的 enforcement 能力建设**——在 pilot 之前谈 dual-entry 属于倒果为因。**ROUND-1 EVIDENCE + UNVERIFIED PRODUCT HYPOTHESIS**
5. **仍需要当前 Work Core 吗?——需要 spine,不需要 mandatory Work。**dispatch_execution 的事务冻结/idempotency/event ledger/Ref 协议是 substrate 的 SDK 地基,直接复用;强制 `work_id` 外键则在本设计中被否定(§4 迁移 D):work 降级为可选 Case extension,scope 由 HostScopeRef 承担。**REPOSITORY VERIFIED(spine 存在)+ REASONED PROPOSAL(降级方案)**
6. **走向 A 或死亡的最低验证组**(借用 round-1 已规划的评估器):pilot 组合 = (1 interactive-heavy LangGraph workflow)+(1 Temporal high-assurance workflow),90 天,采集四数——wrapper 替代率(自写 vs AB)、settlement unknown 比例、mismatch/拒绝拦截次数、durable-wait 故障率。四项全绿才可复议 A;Kill criteria 任一触发则降 C/E。**REQUIRES USER VALIDATION**

一句话收束:

> 把"每一次被 workflow 委托的高危动作"变成一条不能被改写的合同——仅在有人要对它签字(Interactive Finish)或有权威要对它验真(high assurance)的地方,这个 substrate 才值得存在;其余地方,请继续使用你本来就在用的 workflow。
