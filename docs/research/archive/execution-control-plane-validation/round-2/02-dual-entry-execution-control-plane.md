# Round 2 · 候选 B：Dual-entry Execution Control Plane（最小可攻击设计）

日期：2026-08-27。
本报告只读取 round-1 四份输出与产品重校准文档、当前仓库代码，不读取任何其他 round-2 输出。

标签含义：

| 标签 | 含义 |
|---|---|
| **REPOSITORY VERIFIED** | 当前仓库代码、迁移、测试或仓库文档直接支持 |
| **ROUND-1 EVIDENCE** | 第一轮验证输出已确立的事实/结论，本轮接受为公理 |
| **REASONED PROPOSAL** | 本轮提出的设计方案，未经实现或用户验证 |
| **REQUIRES USER VALIDATION** | 必须由真实用户行为检验，当前无证据 |

## 0. 结论摘要

**最终判词：A. 候选 B 值得进入第三轮——但以"最小形态"进入**：可嵌入 Core + 共享持久存储 + 双客户端通道，明确禁止先建 daemon/HA/不可旁路 admission authority。理由与条件见第 13 节；十条评分总均值约 **3.0 / 5**。

候选 B 的最小命题是：**无论执行由人发起还是由 workflow 引擎发起，一次责任尝试的合同（frozen inputs → accepted receipt → native correlations → evidence reconciliation → explicit Finish）用同一份 schema、同一组不变量、同一个持久边界来表达。** 直接入口证明这个 contract 在没有 workflow 时仍有用；Host 入口证明它不需要 workflow 让渡任何控制权即可被借用。两个入口不是两种产品，而是同一条合同的两种填充方式。**[REASONED PROPOSAL]**

### 0.1 接受的第一轮事实及其对设计的约束

| # | 第一轮事实（全部 **ROUND-1 EVIDENCE**） | 对候选 B 的强制约束 |
|---|---|---|
| 1 | 独立 Core 部分成立；独立产品与独立 daemon 尚未证明 | dual-entry 初版不得要求常驻 service；部署拓扑是需求结果不是论据 |
| 2 | 多入口 ≠ 独立产品 | 本文档不得把"支持两类 caller"当价值主张；共享合同本身才是被测假设 |
| 3 | 当前无不可旁路 admission authority | control 声明必须收缩到"对已进入请求的准入决定"；fail-closed 警察语义只能列为外部增强与 DEFER |
| 4 | Binding 底层零件已商品化 | 不重造 digest/pin/durable history；只做跨 authority join 与 receipt/recovery 统一 |
| 5 | Evidence actual-consumption coverage 很弱 | 证据承诺上限止于 E3/E5 read-back + 诚实 unknown；不卖 consumed/enforced |
| 6 | WorkBoard 可能只是 inspector | WorkBoard 定位显式收缩为 console/inspector；产品可见入口另置（第 8 节） |
| 7 | 禁止重做 workflow/scheduler/sandbox/platform 来证明 control plane | 第 10 节 KEEP/FIX 清单不允许出现 DAG/Node/retry/scheduler/checkpoint mirror |

---

# 1. Control plane 定义

## 1.1 Agent-Box 最终拥有的事实（终局记录，上游改写无效）

以下事实一旦写入即为本方权威副本；native 系统继续拥有原生对象，但"这次责任尝试把它们关联成什么"由本表回答。**[REPOSITORY VERIFIED — 其中 1/2/4/5 已实现，其余为提案]**

1. Execution identity 与责任窗口边界：`exec_*` 先于 provider start 存在；创建→Dispatch→Finish/terminal 的窗口划分。
2. Frozen input 集合：同一事务写入的 canonical `(contract_id, Ref)` 关联 + `inputs_digest`；冻结后 INPUT 不可新增。
3. Dispatch receipt：requested→accepted/failed 状态、幂等键、provider correlation、时间戳。
4. Native correlation relation：哪些 SessionRef/RunRef/WorkspaceRef/ArtifactRef 属于哪次 Execution（relation 归本方，对象归原生系统）。
5. Observation 投影记录：phase/freshness/outcome 及其观测时点（标注为投影，非权威状态）。
6. （提案）Finish 决定记录：actor、reason、最后 observation 引用；Cross-provider finish aggregate 当前缺失。
7. （可选聚合）Work 显式 complete/reopen 决定及 reason。

## 1.2 外部系统拥有的事实

| Authority | 拥有 | 本方仅持有 |
|---|---|---|
| Git | commit/tree/object 真相 | selector→exact pin 记录、read-back 摘要 |
| CI（GitHub Actions 等） | run/job/attempt、logs、artifacts、environment 审批 | RunRef + head_sha 回读值 |
| Harness/Codex | session/thread/turn、工具循环、resume/fork | Thread/Turn Ref 与 JSONL artifact digest |
| tmux/runtime | 进程、pane 存活、exit | exact pane identity 观测 |
| Workflow 引擎 | graph state、checkpoint、routing、retry、timer | WorkflowInstanceRef/CheckpointRef 作为外部输入 slot |
| 凭据 broker（外部） | secret value、版本、materialization | CredentialRef handle/version（无值） |

各系统的身份与历史已有成熟商品化能力，本文档不重复建设。**[ROUND-1 EVIDENCE]**

## 1.3 Agent-Box 可以允许 / 拒绝的行为

| 行为 | 允许/拒绝 | 现状 |
|---|---|---|
| 同幂等键不同 inputs 复用 | **拒绝** | REPOSITORY VERIFIED（`dispatch_execution()` 键冲突检查） |
| 一 Execution 二次 Dispatch | **拒绝** | REPOSITORY VERIFIED |
| 冻结后新增 INPUT Ref | **拒绝** | REPOSITORY VERIFIED |
| contract 数量限制违反 / 未知 contract / 解析类型不符 | **拒绝** | REPOSITORY VERIFIED |
| terminal Execution 直接 resume（而非新 continuation E） | 应拒绝但当前允许 | REPOSITORY VERIFIED 缺口（`resume_execution()` 仅查 `resumable_now`），列入 MINIMAL FIX |
| 未声明 contract 的启动请求 | 拒绝（契约层面）；物理旁路不可阻止 | 见 1.4 |

## 1.4 是否必须不可旁路？如果允许旁路还是 control plane 吗？

诚实回答：**初版不必、也做不到不可旁路。** 第三方可以在不经过本方的情况下直接调用 harness/CI——结果是该次执行没有 Execution ID、没有 receipt、没有 evidence closure，而这是静默空洞，系统自身无法察觉。因此：

- 本方控制的是**通过它的每个请求的准入与闭合**：freeze 后不可变、receipt 幂等可恢复、Finish 显式留痕。"control plane"一词在初版只能取 **gateway 语义**（管理所有进入者），不能取 **police 语义**（阻止绕行者）。若某部署需要 police 语义，路径是把凭据发放/调度权外挂到必须咨询本方的 broker/admission 层——那是外部 Authority 组合，属于 DEFER（第 10 节），且即使做了也只能约束依赖这些凭据/调度的执行子集。**[REASONED PROPOSAL]**
- 因此候选 B 对外承诺时自称 execution accountability & admission plane，"非旁路 enforcement"只在第 11 节作为 kill criterion 的对照物出现，不进路线图。一个可以无损绕过的组件在语义上是 conventions library；区别在于本方在自己边界内拥有真实的拒绝权与恢复权（1.3 表前五行是硬拒绝），以及 hosts 把 receipt 当集成契约使用。这个差异是否足以支撑 adoption，交由第三轮证伪。**[REASONED PROPOSAL]**

## 1.5 与 launcher / registry / provenance middleware 的边界

| 组件 | 边界 |
|---|---|
| Launcher（ExecutionProvider adapter） | 拥有 side effect（进程/AppServer/API 调用）与 provider-specific recovery；本方拥有 freeze→receipt 事务和 correlation 存储。本方不 spawn 进程本体，今天 `provider.start()` 由 adapter 执行 [REPOSITORY VERIFIED]。 |
| Registry | 只做 capability/contract 声明与解析校验（in-process）；不做实例租约/健康/权限 [REPOSITORY VERIFIED]，durable inventory 列入 DEFER。 |
| Provenance middleware（未来） | 消费本方导出的 evidence bundle，不反向成为事实源；本方不吞并 OTel/attestation 栈。 |

---

# 2. 两个入口，一条合同

统一请求形态（两入口唯一分叉点是填充方式与交互模式；存储与语义零分叉）。**[REASONED PROPOSAL]**

```text
ExecutionRequest {
  caller              "direct:cli:tui" | "host:<engine>:<graph>/<node>:<run_id>"
  responsibility_intent   <=256 chars
  provider_id             注册的 ExecutionProvider
  inputs                  [(contract_id, selector 或 exact Ref)]
  scope                   { work: work_id } XOR { external_scope: TypedRef }
  idempotency_key         caller 稳定生成
}
ExecutionReceipt {
  execution_id, dispatch_id,
  state ∈ { requested, accepted, failed, reconciled },
  inputs_digest, provider_correlation?, timestamps
}
```

十个设计点逐项对照：

| 设计点 | Direct entry（Human/CLI/WorkBoard → Core） | Host entry（LangGraph/Temporal/Prefect → Core） |
|---|---|---|
| 请求格式 | 同一 envelope；composer 分步填写 draft，`Freeze & Launch` 时成型；CLI 可整包提交 | 同一 envelope；adapter 从 node config/state snapshot 确定性生成，一次成型不可交互修改 |
| Execution identity | 用户确认时创建 `exec_*`，先于任何 side effect | node/activity 进入时创建，先于 provider 调用；crash 前也留下意图记录 |
| Binding draft 来源 | WorkBoard 本地 draft 文件（现状行为）| Host 传入的结构化 manifest；本方照单 canonicalize，不理解 workflow 内部结构 |
| Exact resolution | 同一条 ResourceProvider.resolve 路径 | 完全相同 |
| Accepted Dispatch | 同一 receipt 写入 + chronicle 渲染 | receipt 返回给 host 写回自己的 state/metadata |
| 异步句柄 | 用户留在 WorkBoard 观察或不在线，回来续看 | 返回 `{execution_id, dispatch_id}` 句柄；host 轮询或收 callback |
| Observe/recovery | WorkBoard `o` 观察；tmux plugin `recover_handle()`（现状） | adapter 定期 observe_projection；恢复同样走 plugin-owned recover，host 不直接触碰 native |
| Explicit Finish | 人按键 `f`，记录 actor=human | host 的审批节点代替人提交 Finish（actor=host-delegated-human），或保持 open 直至真人操作；首个显式 Finish 生效并记录 actor |
| Result/evidence callback | 全部进 chronicle，人阅读 evidence card | 同一份 evidence 经 query/export 给 host；host 也可把 receipt URL 写进 PR/LangGraph metadata（分发通道，不是第二事实源） |
| 谁决定下一步 | 人 | workflow 引擎。两处本方都不参与、不推测、不自动续发 |

**共享性检查清单（审查者按此攻击）：** 两入口必须命中同一 `WorkService/ExecutionService` 代码路径、同一张 SQLite schema、同一 receipt/evidence 字段集、同一 Finish 语义与同一 provider 适配。差异只允许出现在：(a) draft 如何产生；(b) scope 默认值；(c) caller 身份串。Demo（第 9 节）须把两侧 receipt 并排展示来证明这一点。若任何 host 适配器发现必须新增独有字段或另一套状态机才能工作，即触发 kill criterion #3。**[REASONED PROPOSAL]**

---

# 3. Work 的位置

**选择：B（Execution 独立、Work 为可选一等 grouping）+ 入口级默认注入（D 的操作面，非 D 的本体分裂）。** **[REASONED PROPOSAL]**

理由链：round-1 已论证强制 Work 会破坏独立性、删除测试未通过；**[ROUND-1 EVIDENCE]** 同时现网 schema 是 `work_id TEXT NOT NULL`（[004_minimal_work_core.sql](../../../../src/agent_box/migrations/004_minimal_work_core.sql)），任何"可选化"都需要一次 MINIMAL FIX。落地为：core schema 增加 `external_scope` 列并与 `work_id` 二选一（互斥 CHECK 约束，单一 scope 字段语义，不分表、不分逻辑）；direct CLI 默认帮用户建一个隐式本地 Work（可后改为 external_scope），host adapter 默认填 external_scope，两者都只是对同一列的不同默认值。

**D 是否造成两套产品？** 逐条检查：
- 若 D 指"两种 scope 语义 + 两套服务代码" —— 会造成两套产品，弃用。
- 若 D 只是默认值策略叠加在同一 ontology 上 —— 不分裂：Execution 合同、receipt、evidence、Finish 完全一致；任何 direct Execution 可以补挂 external issue，任何 host Execution 可以事后被人归入 Work。判定标准写死：*任意一侧的 Execution 能否不换 API 地切换 scope 表示法*。能，则只是默认值不同。**[REASONED PROPOSAL]**

**Work completion 与外部 project/workflow completion 的冲突处理规则：**

1. Provider terminal 永不自动完成 Work（维持第一轮共识）。
2. 本方 complete(reason) 是显式治理动作，语义是"记录一次 Human/Host 判定"，**不声称**外部系统（issue/workflow/PR）的状态随之改变；反之亦然。
3. 外部 completion 事实（如 GitHub Issue closed）只作为 Evidence 进入对应 Execution；是否同步完成 Work 由人决定，UI 呈现 divergence 而不阻塞。
4. Work completed 而 external case 仍 open（或相反）是合法状态，chronicle 中标 divergent 并保留 reopen 通道。**[REASONED PROPOSAL]**

---

# 4. Control 与 Enforcement：九级事实梯

| 级别 | 含义 | 现状 | 备注 |
|---|---|---|---|
| recorded intent | Execution/责任意图已落库 | **IMPLEMENTED** | services.create_execution + event |
| validated input | canonicalize/数量/类型校验通过 | **IMPLEMENTED**（dispatch 时点） | 无独立 validation revision |
| frozen input | `(contract_id, Ref)` 关联 + digest 冻结 | **IMPLEMENTED** | 是 *identity* 冻结，非内容冻结 [ROUND-1 EVIDENCE] |
| admission decision | 按有限规则接受/拒绝进入 | **PARTIAL** | 规则=1.3 表；无 policy engine；物理上可旁路 |
| provider accepted | provider 承担责任的事实 | **PARTIAL** | 当前 ≡ start() 未抛异常 [ROUND-1 EVIDENCE] |
| runtime projected | bytes/argv/env 投影完成 | **PARTIAL** | projected_contracts 自报 + prompt digest |
| externally observed | 从 authority read-back | **PARTIAL** | git HEAD/diff、profile byte-hash、tmux pane、CI head_sha 已有 provider 侧能力，未统一持久化为 fact 结构 |
| attested | 独立签名 attestation | **ABSENT** | DEFER（DSSE/in-toto 接口留给外部 signer） |
| enforced | 运行时 fail-closed 强制 | **ABSENT** | 依赖 broker/sandbox，DEFER |

**Preview 最多诚实承诺到的级别：admission decision（附拒绝理由清单）+ externally observed 的定点 read-back。** 明确不承诺：consumed（D2 以上几乎全为 self-report）、negative claims（undeclared inputs 的 coverage 是 C0）、attested、enforced。所有 UI 词表固定为 conformant/divergent/unknown 三态 + method/authority/coverage 标注；禁止把 accepted 渲染成 verified。**[REASONED PROPOSAL，其中缺口判定为 ROUND-1 EVIDENCE]**

**外部 Authority/Provider 的接口责任（只定义接口，塞不进 Core）：**
- Credential broker：按 exact version/handle materialize，回传不含值的 access fact；Core 只存 CredentialRef（需扩展 RefType，MINIMAL FIX/DEFER 档）。
- Sandbox：fs/net fail-closed，出具运行配置 attestation；bwrap 编排留在 plugin（现有 preview-resources 已有雏形 [REPOSITORY VERIFIED]）。
- Policy engine：admission decision 前对 frozen digest + caller 求值；Core 预留 verdict 插点但不实现求值器。
- Scheduler/timer：完全不引入；deadline 由 caller/host 拥有（Temporal 天然有 timer），Core 只暴露 freshness/staleness。

---

# 5. Durable Receipt 和恢复

一次 Dispatch 的状态边界。**[REASONED PROPOSAL，缺口标注 REPOSITORY VERIFIED]**

| # | 边界 | Owner | 持久性 | 处理 |
|---|---|---|---|---|
| 1 | Core 事务完成（requested + frozen inputs + digest + 幂等键） | Core | durable，先行落库 | 单事务原子写入；此后一切副作用的锚点 [REPOSITORY VERIFIED] |
| 2 | Start-attempt 标记（**新提案**） | Core | durable，start() 前 WAL 写入 | 把崩溃歧义从"是否调过 start"收敛为"已知 attempt 过"；当前缺失，属 crash window 主因 |
| 3 | Provider side effect | Plugin/adapter | 原生系统内 | 本方不复制其内部状态 |
| 4 | Accepted receipt（correlation 落库） | Core | durable | 当前窗口：start() 成功→record_dispatch_accepted() 之间崩溃即 orphan [REPOSITORY VERIFIED] |
| 5 | Process crash | — | — | 恢复协议见下 |
| 6 | Provider handle recovery | Plugin | plugin-owned | 复用 tmux `recover_handle()` 模式：以 inputs_digest+时间窗为指纹向 provider 侧检索已有执行；找到→adopt correlation→标 `reconciled`（比 accepted 多一个来源注记）；找不到→依据 provider 幂等能力决定安全重发或废弃该 E 另起新 E |
| 7 | Duplicate request | Core | — | 同键同 digest→原样返回既有 receipt [REPOSITORY VERIFIED]；同键异 digest→拒绝；一 E 已有 D→拒绝 |
| 8 | Timeout | Caller/Host | — | 本方不设 retry engine（禁令）；只提供 dispatched_at/observed_at 计算 staleness；宿主引擎（如 Temporal timer）愿意管就管 |
| 9 | Failed idempotency 重放（缺陷修复） | Core | — | 当前 failed D + 同键再次调用会静默返回不重启不复报异常 [ROUND-1 EVIDENCE]；FIX：failed 终态返回显式失败 receipt，重试须走 reconcile 或新 E |
| 10 | Provider terminal | Provider→observation | durable projection | 只更新 projection，不触发 Work/EFinish 动作 |
| 11 | Human Finish | Core（新提案 aggregate） | durable，一次性 | `finish(execution_id, actor, reason)`；terminal 且 Finish 落定后 Execution 永不 reopen，continuation 必为 E2 [与第 1 轮 E1/E2 原则一致；现为 plugin-local PARTIAL] |

**崩溃窗口总结：** 标记(2)+指纹恢复(6)两项把窗口从"无法判断"缩小为"可枚举的两分支查询"。不承诺 at-most-once 万无一失；承诺的是*任何崩溃后存在确定、可操作的下一步判定程序*。通用 retry/queue/worker claim 继续排除在 Core 外 [遵守禁令]。哪部分归 Plugin：一切 provider 特定的句柄发现、attach、JSONL 截获、pane 校验；Core 只认领标记、状态单调转移、事件与 correlation。

---

# 6. Binding/Evidence 数据形态：一个具体例子

场景 E-2841「调查并修复支付回调超时」：Git + workspace + Harness profile + tmux pane + （后续）CI run +（可选）LangGraph checkpoint。图例：✅ 已实现｜◐ 部分（能力存在于 provider/plugin 侧，无统一持久 fact 结构）｜❌ 仅方案。**[REPOSITORY VERIFIED ✅/◐；REASONED PROPOSAL ❌]**

| Slot | requested | exact | frozen | projected | native actual | authority | method | coverage | disposition |
|---|---|---|---|---|---|---|---|---|---|
| Git revision | `current-head(main)@10:00` | `commit ab12..ef` + tree | ◐ 关联+digest ✅ freeze 后锁死 | checkout 到 detached worktree W1 | `rev-parse HEAD^{commit}` == ab12 ⏱resolve 时 | git(repo) | rev-parse read-back | 该 worktree 该时刻 | **conformant**(E5/E6) |
| Workspace W1 | `/wb/w1` | path+UID+基线 commit | WorkspaceRef ✅ | cwd 注入 Codex 进程 | dirty/diff digest = 空 | filesystem+git | status+diff hash | tracked+指定时刻 untracked | conformant（⚠️ 后续漂移不再追） |
| Harness profile P1 | 名字 `pay-debug` | 非 secret manifest sha256 | ◐ 按 Ref 冻结 | env/flag 注入 argv | 重算 byte hash 相等；**消费与否未知** | filesystem | materialize byte-hash | 仅 config 文件字节，不含 secrets | conformant-but-consumed-unknown(E2+E6) |
| tmux pane | socket/session/window/index | pane `%7`, pid 4820 | tmux ResourceRef ✅ | attach+SessionStart hook | 存活+pid 回读；scrollback 截获 sha256 | tmux server(exact socket) | list-panes/display-message | momentary identity；截获字节 | projected/consumed-unknown(E3/E6-partial) |
| Prompt/call thread | thread 新建 | `thread xyz` (CodexContinuationV1) | — | turn/start body 含 prompt | JSONL events 有 tool/file 事件 | codex app-server | turn/read 回放 | server 收录事件 | provider-reported(E2/E4)，attention=E0 unknown |
| CI run（事后关联） | branch+workflow ref | RunRef `r_991` attempt2 + head_sha | ❌（关联型 slot，不预冻结） | — | REST 回读 actual `head_sha` | github API | run/jobs read-back | run+attempt 边界 | 示例判 **divergent**: head_sha≠ab12，job success 不掩盖 ❌ 对账展示 |
| LangGraph checkpoint（可选） | Thread T | checkpoint C12+payload digest ArtifactRef | WorkflowInstanceRef ❌ 类型已有 ✅ 字段 | 由 host 传入 snapshot 引用 | checkpoint 读回 | langgraph store | checkpoint API | payload 边界 | reference-conformant(E5) |
| Undeclared ambient inputs | — | — | — | — | — | — | — | **C0：负向不可证** | unknown-by-design（永不渲染为 clean） |

实现盘点：✅ = Ref 五类、`(contract_id, Ref)` freeze、inputs_digest、dispatch accepted/failed、resource_state(自由串≤256)、ArtifactRef evidence、git read-back、tmux exactness、profile manifest digest [REPOSITORY VERIFIED]。❌ = slot purpose/provenance 列、disposition 枚举、coverage 词表、authority/method 字段、CI/head_sha 对账 fact、CredentialRef 类型 —— 全部是尚待的最小 schema 增量，落在 06 号能力项而非新实体 [REASONED PROPOSAL]。◐ 关键含义：能力散在各 provider，缺一张统一的 per-slot fact 表把它接住。

---

# 7. 独立 service 的必要性（vs embedded SDK）

先定义三种交付形态以防滑坡：**S0 = SDK 库（in-proc）**；**S1 = S0 + 共享 durable store（同一 SQLite 文件多进程打开，WAL）+ CLI**；**S2 = 常驻网络 service**。候选 B 最小形态是 **S1**；S2 只有在下述对比要求出现时才建。**[REASONED PROPOSAL]**

| 维度 | embedded SDK(S0) | dual-entry S1 | dual-entry S2 | 判断 |
|---|---|---|---|---|
| concurrent callers | 每 host 一份实例，跨进程不共享状态 | CLI/WorkBoard/LangGraph-node 三类并发读写同库可行（SQLite WAL + busy_timeout，限单机）[可行性推断] | 跨机器并发 | 单机并发是双入口的真实最低需求，S1 足够 |
| append-only history | 随宿主消亡/易被清理 | 库文件长存、event ledger 累积 | 更强+备份策略 | S1 已满足"活过 session"的要求 |
| recovery | 依附宿主进程存活 | 下一个进程打开文件即可执行第 5 节恢复协议 | 远程恢复 | crash-safe receipt 正是 S>S0 的核心理由之一 |
| identity authority | 各宿主各自 UUID，可能撞车 | 单库统一 exec 空间 | 全组织唯一 | "E 能同时被人和 engine 引用"需要 S1 起步 |
| multi-upstream query | 无中心视图，每宿主自建 | 单文件即跨入口 chronicle/导出 | 跨主机聚合成卖点 | 注意：多入口≠必须网络服务（fact #2） |
| credentials | 宿主环境碎片化 | 同机 shared file 权限兜底，broker 仍外部 | 可接入集中 broker | 集中凭据属 enterprise 增强，DEFER |
| latency | 最低 | 本地文件 µs–ms；每 E 仅两次写（requested/accepted），不在热路径 | 网络 hop | admission 频率低，延迟非风险 |
| deployment | 零 | pip 安装+一个文件 | 服务、HA、迁移、ACL | S2 成本最高且第一轮已断言 daemon 未证明 [ROUND-1 EVIDENCE] |
| offline/local use | 强 | 完全离线可用（个人开发者主场景） | 弱 | direct entry 的价值前提是离线可用，排除 S2-first |

**应放弃 service（退到 S0/D）的条件（任一成立）：**
1. 试点期 >90% Executions 来自同一 host，direct entry 无留存使用；
2. 无第二个并发 writer 出现在真实一周窗口；
3. 用户明确以宿主自有 state/artifact 存储为准，本方文件沦为双写负担；
4. 跨入口 chronicle/export 功能两周无人调用。
反向升级条件（S1→S2）：≥2 台机器的 callers 需要 overlapping history、或集中 ACL/审计合规被点名要求。在这些条件发生之前新建 S2 即违反最小性原则。**[REASONED PROPOSAL]**

---

# 8. 用户和 UI

谁会主动打开 WorkBoard（诚实排序）：

| persona | 打开频率 | 用途 |
|---|---|---|
| nobody in normal path | — | host 自动发起时无人需要打开任何面板；receipt 写回宿主 state 即结束 **[REQUIRES USER VALIDATION]** |
| operator/SRE | 事故/失败时 | 定位"那次到底用什么跑的"，查看 divergence |
| auditor | 周期/取证 | 导出 evidence bundle，核对 unknown 比例 |
| direct user | 任务开始与结束时 | composer 发起、Finish、读 evidence card |
| workflow platform engineer | 排障时 | 检查 adapter 的 receipt/schema 是否正确 |

Round-1 已指出 Evidence 是低频事件驱动界面，WorkBoard 更像 inspector。**[ROUND-1 EVIDENCE]** 接受之：WorkBoard 正式定位为 **console/inspector**（观察到 launch 结束、帮助做四类显式决定：finish/complete/new-E-from-evidence/escalate），永不做日常主界面、不画图、不推进。

**独立产品的可见入口在哪里（不由 WorkBoard 承担）：** **[REASONED PROPOSAL]**
1. Shell：`agent-box execution new …` / `agent-box receipt <id>` —— direct 用户的第一入口就是命令行动词，而不是 TUI 应用；
2. Host 内部：adapter 把 receipt URL/ID 写回宿主可见面（LangGraph metadata、PR comment、Temporal search attribute）—— 用户在既有工具里遇到链接；
3. 导出物：`agent-box export-evidence <id>` 产出的静态 bundle/report —— auditor/operator 的入口随工单流转。
换言之，候选 B 的产品面是**合同与链接在网络中流动**，不是一块登录后的 dashboard。WorkBoard 只是这三条入口背后的检视台。此判断中"人是否会点击这些链接回访"仍 **[REQUIRES USER VALIDATION]**。

---

# 9. 最小 Demo

两个镜头，彼此衔接、各自可独立观看；共用一个 provider（Codex tmux）、≤4 个 resource slots、零 Pi 集群、零多 provider 数量堆砌。**[REASONED PROPOSAL]**

**镜头 1（约 90s，无 workflow）：** 开发者在 repo 上发起一次会改码的调查修复。CLI 三行给出 requested（branch `main`、profile、prompt 文件）→ composer 显示 requested→exact（commit SHA/sha256）→ Freeze & Launch，chronicle 出现 receipt（digest、幂等键）与 native SessionRef → agent 改一处代码 → 人按 `f` 显式 Finish（画面强调 idle≠finish）→ evidence card 三行：git pin **verified**、profile **projected, consumed-unknown**、undeclared inputs **unknown** → review 意见到达，同 session 建 E2（新 Binding B2），E1 永不重开。反驳点：不是 session UI、不是 tmux launcher。

**镜头 2（约 60s，LangGraph 发起）：** 同一台机器同一把 Core。一个 ~50 行脚本 node 调用 adapter：传入 thread/checkpoint 引用 + 同样的三个资源选择 → 收到**与镜头 1 字段逐一相同**的 receipt → host 把 receipt 写回自己的 state（画面上宿主负责 routing/retry 徽标高亮）→ CI run 回读 head_sha，出现 divergent 红行且 job success 绿色并存 → workflow 自己决定分支。结尾画外 3 秒：左右并排两条 receipt/evidence，同一 schema，caller 不同。**[共享合同即本镜头唯一信息量]**

素材缺口（必须如实标注）：镜头 2 的 LangGraph adapter 当前不存在（插件目录只有 codex/pi/tmux/preview-resources/workboard [REPOSITORY VERIFIED]），需要一个 spike 级薄包装复用 `services.py`；divergent 展示依赖第 6 节 ❌ 项的最小落地。判断标准沿用第 1 轮 viewer comprehension 七问；预测镜头 1 通过、镜头 2 对非平台观众弱，若观众复述"多了个开 agent 的窗口"则直判 fail，不得加旁白补救。**[REASONED PROPOSAL + ROUND-1 EVIDENCE(验收方法)]**

---

# 10. Core 影响

| 类别 | 项目 | 说明 |
|---|---|---|
| KEEP | Work(可选化)、Execution、Ref 五类、freeze+digest+幂等 receipt、projection/observation、in-process registry、Codex/tmux/Pi plugins、WorkBoard(inspector 位) | 全部已存在且经 135 测试 [REPOSITORY VERIFIED] |
| MINIMAL FIX | ①scope 可选化：external_scope 列替代 work_id NOT NULL；②Execution.finish(actor, reason) aggregate + terminal 不可 resume 守卫（含 lineage event）；③start-attempt 先写标记；④reconcile 命令 + failed-幂等重放缺陷修复；⑤resource_state 自由串→(disposition, authority, method, coverage) 受限枚举字段的增量迁移 | 全部是对现有表/服务的窄改，无新实体 |
| PLUGIN/HOST | LangGraph/Temporal/Prefect/GitHub adapters；credential broker/sandbox/policy engine 接口实现；provider handle recovery 具体协议；evidence 导出报告；OTel/attestation 接线；所有 deadline/retry | 禁令遵守：不进 Core |
| DEFER | 不可旁路 admission authority、S2 daemon/HA/ACL、签名 attestation、自动化 reconciliation 比较器、Work 的 Case 化(obligations/participants)、multi-store 身份合并 | 各配 revisit 条件（第 7/11 节） |

**显式排除（与禁令逐词对齐）：** DAG ✗ Node ✗ Agent ✗ Participant ✗ Message ✗ generic retry ✗ workflow mirror ✗。**[ROUND-1 EVIDENCE(禁令)]**

---

# 11. 自我攻击和退出条件

**Q1 没有不可旁路 enforcement 时为何不是 ledger？** 因为它在本边界内有三件 ledger 没有的东西：带拒绝规则的准入决策（1.3 表）、崩溃后可执行的确定性恢复协议（第 5 节）、被 hosts 当作集成契约的 receipt 语义。但如果试点团队从不援引这三者、仅将其当作事后查询索引，那它就**是** ledger，kill criterion #5 触发降级。此攻击无法在设计层面彻底免疫，只能用行为数据裁决。**[REASONED PROPOSAL]**

**Q2 用户为何不直接用 workflow metadata？** 单引擎/单栈用户的回答确实是"直接用更好"——workflow metadata 就地、免新系统。本候选的目标剩余人群只有三类：混合栈（LangGraph+CI+本地 harness 并存，metadata 无共同 join 点）、无 workflow 的 direct 执行（metadata 无处安放）、引擎更换频繁（metadata 无法搬家）。访谈证实目标市场主要由第一类构成不了时，候选即失效。这是有意保留的攻击面而非遗漏。**[REASONED PROPOSAL]**

**Q3 WorkBoard 为何不是另一个 dashboard？** 区别在于每次呈现都服务一个显式治理决定（finish/continue/new-E/diverge 升级），并且 expected-vs-actual 矩阵的原生 dashboard 都不给。观察型访问占比过高、且无决策产出的试用，即坐实 dashboard 判定（kill criterion #6）。**[REASONED PROPOSAL]**

**Q4 Evidence 大量 unknown 怎么办？** 预设词典：unknown 不是失败而是**定价事实**——购买故事只建立在强事实槽位（git/CI/workspace/toolchain）上；slot 级 unknown 比例公开进导出报告。红线：若试点垂直里 required slots 多数持续 unknown 且无外部 broker/sandbox 就无法改善，说明本市场的证据护城河不存在，转向 receipt/recovery 中间件定位或退出。**[ROUND-1 EVIDENCE(弱点) + REASONED PROPOSAL(对策)]**

**Q5 双入口是否只是没有选定方向？** 反驳：双入口本身确实不是方向（fact #2）；方向是"**一条合同对两类发起者同等成立**"这个可证伪假设——demo 并排 receipts 就是让它在 150 秒内可被判死刑。若第三轮数据表明两类 caller 需要实质不同的 envelope/流程，假设即倒，直接裁 kill criterion #3，不会因为投了双入口而不肯撤。**[REASONED PROPOSAL]**

**Kill criteria（触达即降级）：**
1. 问题发现访谈 ≥半数 mono-stack 受访者表示 workflow/log metadata 完全覆盖其调查需求；
2. Host integration spike 中 adapter 无法在不增 Core 实体/第二语义的前提下接到 ≥2 个引擎；
3. 共享合同检验失败：direct 与 host 路径出现字段集或 Finish/recovery 语义分叉；
4. 试点周内第二个并发 writer 从未自然出现，且无跨入口查询调用 → 放弃 S1 差异，转纯 SDK；
5. 事故复盘 head-to-head（Temporal retries+git logs vs 本方）在时长与结论质量上无显著差；
6. 观察型访问占绝对主导、每次访问无决策产出 → 接受 dashboard 判定；
7. required slots 的 unknown 占多数且改善手段都要先建 broker/sandbox/policy → 证据定位退出。

**降级链条：** A 失败 → 直接接收 SDK/embedded 包装（round-1 结论 B/D 的合流），enterprise admission 场景若被点名再单独立项；不存在第四种中间态。**[REASONED PROPOSAL]**

---

# 12. 统一评分（1–5；5=对候选最有利）

| 维度 | 分 | 说明 |
|---|---:|---|
| independent JTBD | 2.5 | JTBD1/2/3 机制清晰但零用户证据，第 1 轮明言不能宣布独立任务成立 [ROUND-1 EVIDENCE] |
| differentiation | 3 | 跨 authority join + crash-safe receipt 真实存在但零件商品化封顶 |
| user friction | 2 | 手工 Binding 构造成本是最大 UX 风险；host 侧 auto-fill 只解决一半 [REQUIRES USER VALIDATION] |
| evidence credibility | 2.5 | git/CI/workspace/toolchain 强；prompt/MCP/credential 消费长期 unknown 是结构性的 |
| workflow integration | 3.5 | 需求单向：引擎不让渡任何控制即可借 wrap，适配阻力小；但 adapter 均未实现 |
| implementation feasibility | 4 | 大部分脊柱已在工作树内通过 135 测试；五项 MINIMAL FIX 均为窄改 [REPOSITORY VERIFIED] |
| replaceability | 2 | Temporal/Prefect wrapper 可复刻大半；复刻成本集中在 join+recovery 协议 |
| deployment burden | 3.5 | S1=pip+单文件零运维；S2 边界清晰推迟；上限封在单机假设 |
| Demo clarity | 3.5 | 镜头 1 符合第 1 轮"最强首看"预测；镜头 2 需要观众预置理解，且 adapter 待建 |
| Core boundary integrity | 4 | 本设计零新增禁令实体；police/broker/scheduler 全部外推 |
| **均值** | **~3.0** | — |

---

# 13. 最终判词

**A. 候选 B 值得进入第三轮** —— 附带三条不可拆分的准入门禁（三者任一不被接受则本判词作废，回落 D）：

1. **形态门禁：** 第三轮实现物必须是 S1 最小形态（嵌入 Core + 共享 SQLite + CLI + ≤2 个薄 adapter）；任何 S2/daemon/HA/ACL/不可旁路 enforcement 的工作在获得第 7 节升级条件前视为违规投入。
2. **证明义务门禁：** 第三轮必须交付两个 demo 镜头的实拍 + 至少一个真实 Host integration spike 的 receipt 回写，并按第 11 节七个 kill criteria 采集数据；概念增量不再是有效产出。
3. **诚实词表门禁：** 一切对外表述采用 disposition×coverage×authority 词表；accepted/projection 不得渲染为 verified/consumed（Preview 承诺上限=第 4 节天花板）。

路线分支预告：门禁通过且 kill criteria 全绿 → 讨论的将是"以 SDK 为默认包装的双通道执行合同"，独立产品的成立与否交给 market 数据而非架构；中途触达 enterprise admission pull → 授权转入"内部平台优先"路线；两项皆无 → 按 SDK 交付并把 WorkBoard 定格为 debug inspector。本判词对 product-market 的任何乐观预期不作背书。**[REASONED PROPOSAL；JTBD/friction 部分 REQUIRES USER VALIDATION]**
