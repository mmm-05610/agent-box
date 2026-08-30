# Round 2 · 候选 D：Embedded Execution SDK / Provenance Middleware

本报告为第二轮对抗验证中候选 D 的独立设计稿。基线日期 **2026-08-27**，工作目录 `/home/maoqh/projects/agent-box`，分支 `spike/real-governed-binding`。

## 报告边界与标签

- 本报告只依据 round-1 四份公开报告、产品重校准文档和当前仓库检查结果撰写；未读取任何其他 round-2 输出。
- 全部结论使用四个标签：

| 标签 | 含义 |
|---|---|
| **REPOSITORY VERIFIED** | 本轮或先前由仓库代码、测试、迁移直接证明的事实 |
| **ROUND-1 EVIDENCE** | 由 round-1 报告核实并作为既定事实接受的内容 |
| **REASONED PROPOSAL** | 本候选的设计主张，是提议而非现状 |
| **REQUIRES USER VALIDATION** | 必须由目标用户行为检验的假设 |

## 接受的第一轮事实

以下六条作为设计约束强制接受：

1. 当前最容易成立的是独立 Core，不是独立产品。**[ROUND-1 EVIDENCE]**
2. 多个成熟系统已拥有 run identity、checkpoint、retry、artifact、trace 和 attestation。**[ROUND-1 EVIDENCE]**
3. Agent-Box 仍可能拥有跨 authority execution envelope 与 reconciliation 的公共语义。**[ROUND-1 EVIDENCE]**
4. SDK/plugin 可能最容易被替代，也可能最容易被采用——两个方向都真实存在。**[ROUND-1 EVIDENCE]**
5. 当前 Work、WorkBoard 和中央数据库的必要性没有被证明。**[ROUND-1 EVIDENCE]**
6. interactive responsibility window 不能被简化成普通函数调用。**[ROUND-1 EVIDENCE]**

---

# Executive 判词预览

候选 D 在最小形态上成立：把现有 `work_core` 的 Execution envelope、typed Ref、输入冻结/digest、幂等 Dispatch receipt 与（收紧后的）Evidence claim 提取为进程内 SDK，删除强制的 Work 与中央数据库要求，允许 Host 持有自己的 identity/scope/UI。三条保留曲线支撑它：仓库现有实现正是这个形状的最小版本（**REPOSITORY VERIFIED**）；round-1 三份报告不约而同收敛到 "library/plugin 是当前最诚实的交付形态"（**ROUND-1 EVIDENCE**）；部署负担接近零，是所有候选中集成摩擦最低的。

但它有两条结构性天花板必须诚实写进定位：(a) 没有 cross-host 一致性机制时，frozen history 只有 tamper-evidence 而非 non-repudiation；(b) Evidence 的可信上限被 provider self-report 封顶（round-1 已证明多数 harness 关键 slot 只能拿到 projected/self-report），SDK 无法靠自身提高证据等级，只能让低等级证据诚实地可比较。因此最终判词见 §13：**B —— 只适合作为首个发行形态，未来需要 service**；升级触发条件在 §11 明确列出。

---

# 1. 最小产品定义

## 1.1 SDK 解决什么

四件普通 launcher/telemetry 库不会一并解决的事 **[REASONED PROPOSAL]**：

1. **承诺冻结的事务性。** Host 从"选择资源"到"产生副作用"之间有一个 TOCTOU 窗口；SDK 用 canonical manifest + digest + 单事务落盘把这个窗口闭合，且一旦冻结不可增补。Core 今天已有该不变量的最小版（同一 Execution 的 input 冻结后禁止新增、digest 唯一、一 Execution 一 Dispatch）。**[REPOSITORY VERIFIED]**（`src/agent_box/work_core/services.py:85` 起 `dispatch_execution`；迁移 `006_resource_contract_inputs.sql`）
2. **责任窗口与 native 身份分离。** Execution 是一次有界的责任尝试；native session/run/job 可以比它宽（Session 承载 N 次）或窄（一个责任跨多 attempt）。SDK 提供这个跨域 join 的公共表达：`continuation_of` 链、`SessionRef` 复用为 frozen input、N:1/1:N 关系表。
3. **幂等接单与崩溃恢复语义。** dispatch 返回 receipt；receipt 状态机显式包含 `ambiguous`（副作用可能已发生但 correlation 未落盘），并提供按 idempotency key 向 Provider 反查或从 frozen inputs 重建 handle 的 recover 钩子。Round-1 已确认这是当前 Core 的最大生产缺口（generic crash reconciliation ABSENT）。**[ROUND-1 EVIDENCE]**（doc 03 实现状态矩阵）
4. **跨 authority 证据的公共词汇。** typed claim 强制携带 issuer/method/evidence-level/disposition/coverage，使不同 adapter 的声明可以放进同一张 expected-vs-actual 对账表里互相比较，而不是各自发明日志格式。

明确不解决：下一步算什么（Host）、重试/定时/队列（Host substrate）、长期目标归属（外部 issue/ticket）、对话与工具循环（harness 自己）。

## 1.2 谁安装它

集成开发者：写 LangGraph node wrapper 的平台工程师、包装 Temporal Activity 的人、维护内部 launcher/CI glue 的工具团队、以及想要 accountable 直接执行的单体开发者（通过 CLI 形态安装）。终端用户永远不需要知道 SDK 存在——他们看到的是 Host 产品里多出来的 binding/frozen digest/receipt/evidence 卡片。**[REASONED PROPOSAL]**

## 1.3 它运行在哪里

Host 进程内。无 daemon、无常驻网络服务。例外是一个同机辅助进程形态：`abx` CLI 作为第二个短命进程访问同一个嵌入存储文件（interactive 场景下 finish/observe 常发生在 dispatch 进程之外）。它是"另一个命令"，不是控制面。存储文件用文件锁协调，SDK 显式拒绝多机共享同一存储的拓扑并报错指向升级路径。**[REASONED PROPOSAL]**（拒绝逻辑是对现有 SQLite 单文件现实的显式化）

## 1.4 它如何与 Host、Provider、Authority 交互

```text
Host 进程
 ├─ Host 代码：拥有 scope（issue/thread/workflow run）、progression、UI、自己的 ID
 ├─ agent-box SDK（in-process）：envelope / manifest / receipt / claims / embedded store
 │    ├─ ResourceProvider 协议 → 各 authority（Git、文件系统、profile store、tmux server、CI API、secret manager…）
 │    └─ ExecutionProvider 协议 → 各执行系统（Codex App Server、tmux harness、K8s Job、CI trigger…）
 └─ abx CLI（另一进程）：attach 打印、observe、finish、show/export evidence
```

- 对 Host：SDK 是被动库。所有调用同步返回值对象；任何事实都同时以纯值返回给调用方，Host 可以自行持久化到任意位置。
- 对 Provider：经 versioned contract 注册表解析出的 adapter（in-process registry 已实现并有 entry-point 加载）。**[REPOSITORY VERIFIED]**（`src/agent_box/work_core/registry.py:62`；ADR-0007）
- 对 Authority：resolve 阶段同步调用 ResourceProvider 取 exact pin 与 read-back；不缓存 authority 状态，不声称拥有资源。

## 1.5 为什么不是普通 logging SDK

logging SDK 在事后序列化事实，任何顺序错乱都可辩解为日志缺陷；SDK 的核心操作发生在副作用之前并且有权拒绝：validate FAIL 就不该 launch、digest 不匹配就不得复用幂等键、一 Execution 一 Dispatch 是硬约束而非建议。Receipt 是合同回执不是事件行——它包含对未来的承诺（此 key 重放不会再产生第二次副作用）。logging 库没有"撤销前先拦截"的位置。**[REASONED PROPOSAL]**

## 1.6 为什么不是 workflow SDK

SDK 不暴露任何 progress 语义：没有 next()、没有 DAG 句柄、没有 retry policy 参数、没有 checkpoint 类型、没有 timer。查询接口只有 facts（这条 Execution 冻结了什么、谁接受了、观测到了什么、对账结论是什么）。如果用户发现自己在问 SDK"接下来运行什么"，那是产品设计事故。这正是 product center recalibration 中 B+C 主站位的严格投影。**[ROUND-1 EVIDENCE]**（重校准文档 responsibility boundary A/B/C 划分）+ **[REASONED PROPOSAL]**

## 1.7 是否需要 Agent-Box 品牌和独立发行

需要独立发行，品牌权重低于 schema 权重。理由：产品的主要可见物是 schema 与词汇（manifest 字段、claim 等级、receipt 状态、evidence 卡片），它们必须有一个可引用的名字才能跨团队复用与讨论；分发以 PyPI 包为准（`agent-box-core`、`agent-box-abx` CLI、各 `agent-box-adapter-*`），文档站点只需解释 schema 与故障语义。品牌的意义限于让 "Agent-Box Execution ID""evidence card" 成为他人嘴里的名词。不为品牌做独立的营销性 UI。**[REASONED PROPOSAL]**

---

# 2. 最小保留模型

逐一裁决。决定词汇：**KEEP**（一等核心对象）/ **VALUE OBJECT**（不可变值，随请求生成）/ **OPTIONAL EXTENSION**（默认不在最小路径上）/ **REMOVE**（从必选模型删除）。

| 当前对象 | 决定 | 理由 |
|---|---|---|
| Work | **REMOVE**（实体级），位面由可选 `scope_ref` 字符串承接 | Round-1 双报告均判定 Work 未过删除测试：objective/lifecycle/closure 的全部语义可由 GitHub Issue/Jira/LangGraph Thread/Temporal Workflow ID 或纯 tag 表达，且当前 Work 无 acceptance criteria、obligation、evidence-closure rule。**[ROUND-1 EVIDENCE]**（doc 02 Work replacement challenge；doc 04 Work necessity analysis）。技术后果：今天 `Execution.work_id` 是必填外键（models.py:77 直接 raise），必须改为可空 `scope_ref` 并停止写入 `core_works`。 |
| Execution | **KEEP** — 整个 SDK 的中心对象 | 跨域责任身份是 round-1 技术审计确认未被单一外部系统拥有的最窄真实边界；Execution 先于 provider start 存在的实现已是既成资产。**[REPOSITORY VERIFIED]**（models.py `Execution`；ROUND-1 EVIDENCE doc 03 §genuine gaps #1） |
| Binding / input manifest | **KEEP** 并升格为显式 `InputManifest` | 当前冻结的是 `(contract_id, Ref)` association + digest，属 PARTIAL：无 requested selector/pin/authority/resolved_at 分层。SDK 把 manifest 变为一等值对象（含 slot purpose、requested selector、resolved exact pin、authority、assurance、resolver 版本、时间戳），canonical JSON 序列化规则固定、digest = SHA-256 over canonical bytes。这直接填补 round-1 列出的 slot provenance 缺口。**[ROUND-1 EVIDENCE]** + **[REASONED PROPOSAL]** |
| Dispatch | **KEEP** 为 `DispatchReceipt` | idempotency_key 唯一、inputs_digest 绑定、状态机扩为 `prepared → dispatched(requested) → accepted \| failed \| ambiguous`，新增 ambiguous 显式承载崩溃窗口，并用 recover 钩子消解。今日状态机仅 requested/accepted/failed 且 failed+同 key 重调会静默返回新 start request（round-1 发现的缺陷），语义必须修正。**[ROUND-1 EVIDENCE]**（doc 03 Dispatch idempotency 行）+ **[REASONED PROPOSAL]** |
| Ref | **VALUE OBJECT**（保留现形状） | frozen dataclass + 受限枚举 + bounded metadata 的形状已经正确且经测试；保持 provider/native_id/uri/metadata 五元组不变，类型集交由 versioned contract 注册（Codex continuation contract 即先例）。**[REPOSITORY VERIFIED]**（models.py:44 `Ref`） |
| Provider | **KEEP** 为协议与参考 adapters，注册表仅 in-process | Round-1 明确警告不可称其为 control-plane registry；SDK 版继续只做 in-process 解析与 capability/version 声明，durable inventory/health/lease 不做。**[ROUND-1 EVIDENCE]**（doc 03 provider registry 行） |
| Observation/Evidence | **KEEP** 并收紧为 `EvidenceClaim` | 当前 resource-state 观察是自由字符串、coverage 缺失（WorkBoard 甚至硬编码 "coverage unavailable"）。改为 typed claim：subject_ref identity digest、predicate、issuer、method、evidence level（E0–E7）、disposition（D0–D3）、coverage（C0/C1 含窗口与观察面声明）、observed_at、payload ref+digest、可选签名。E/D/C 词汇沿用 round-1 技术审计定义。**[ROUND-1 EVIDENCE]**（doc 03 evidence strength matrix）+ **[REASONED PROPOSAL]** |
| 中央 event ledger / 数据库 | **OPTIONAL EXTENSION** | 见 §4：嵌入存储为默认但可整体禁用，全部事实可退化为返回值由 Host 自持久化。 |

## 2.5 特别问题

**Execution ID 由谁生成？**
SDK 生成，且必须在 provider start 之前存在（现状即如此）。**[REPOSITORY VERIFIED]** 格式保持 `exec_` 前缀随机 ID；另提供确定性派生模式：`execution_id = H(schema_version ‖ host_namespace ‖ host_natural_key ‖ provider)`，用于 Host 崩溃后凭自然键重建同一 ID 再入幂等路径——不确定派生模式下，崩溃恢复依赖 receipt 反查而非 ID 重构，两者取一即可，不强求全用确定性 ID。**[REASONED PROPOSAL]**

**持久化在哪里？**
默认：SDK 私有的嵌入 SQLite（WAL 模式，追加式 lifecycle event 表 + 可更新 projection 表分离），路径随包配置（如 `.agent-box/store.db`）。同时，每次调用的返回值就是完整事实对象，Host 可完全禁用嵌入存储改为自持久化（此时失去跨进程 attach/finish 能力，SDK 启动时以 capability 注记提示该代价）。细节见 §4。

**Work 是否删除？**
实体删除。迁移路线不 DROP 旧表（避免破坏既有库），而是停止读写并把 `work_id` 迁移为可空 `scope_ref`；complete/reopen 服务删除，closure 语义外置给 scope 系统。round-1 user 报告亦给出了相同方向："Default 直接创建 Execution，必要时事后归组"。**[ROUND-1 EVIDENCE]**（doc 04 Work necessity analysis 表）

**Host 是否可以使用自己的 ID？**
可以，且这是一等功能。三个位置：`host_namespace`（字符串，入幂等派生）、`external_scope`（承载原 Work 位面的外部对象引用，如 `github:org/repo#123` 或 Temporal workflow ID）、Ref 层面的原生关联本来就存 host/provider 的 native_id。SDK 只保证自己 ID 的唯一性语义，对外部 ID 逐字透传不做解释。**[REASONED PROPOSAL]**

**同一个 Session 跨多个 Execution 如何表达？**
现状模型已经是正解的直接雏形：同一 `SessionRef(native_id=S1)` 作为不同 Execution 的 frozen input 出现多次（N Executions : 1 Session），每次续接的新 Execution 记录 `continuation_of=exec_old` provenance 并以旧 Execution 的 output/artifact Ref 作为新输入；E1 永不 reopen，terminal 单调。删除 Work 后此关系反而更纯粹：兄弟 Execution 的聚合视图改为按 `scope_ref` 或按 SessionRef native_id 查询得到，查询结果相同、少一层误导性的生命周期中间层。**[REPOSITORY VERIFIED]**（当前 repository 支持 input 冻结多次引用同一 Ref identity；Pi plugin README 已规定 continuation 必须新建 Core Execution —— ROUND-1 EVIDENCE doc 04）

---

# 3. API / 协议形态

不给完整代码，给具体调用签名与语义。全部同步、进程内、无后台线程。**[REASONED PROPOSAL]**

## 3.1 调用序列

```python
import agent_box as abx

# ---- 阶段一：declare & resolve & freeze（全部本地,provider 未接触）----
ex = abx.Execution.new(
    intent="fix flaky checkout tests",
    provider="codex-appserver@1",
    host_namespace="langgraph.support-bot",
    external_scope="linear:SUP-482",          # 可空；承接 Work 位面
)
prep = ex.prepare()
prep.slot("source",      abx.git.selector(branch="main", repo="..."))
prep.slot("profile",     abx.profile.ref(path=".codex/profiles/oncall.toml"))
prep.slot("instruction", abx.file.ref(path="./prompts/fix.md"))

manifest = prep.resolve(registry)   # ResourceProvider 同步解析:selector→exact pin + read-back
verdict  = prep.validate(policy)    # 类型校验、数量限制、policy 断言 → PASS/WARN(逐条)/FAIL(禁止 freeze)
binding  = prep.freeze()            # canonical bytes + sha256;此后 manifest 不可变;store 内先落盘

# ---- 阶段二：dispatch（唯一副作用点）----
rcpt = abx.dispatch(binding, idempotency_key=abx.default_key(binding))
# rcpt.state ∈ {accepted, failed, ambiguous}
# accepted 携带 provider_correlation + 自动发现的 native Refs(Session/Thread/Turn…)
# key 默认 = H(schema ‖ provider ‖ execution_id ‖ manifest_digest)

# ---- 阶段三：observe（任意次、任意进程）----
abx.observe(ex.id, claims=[
    abx.claim(pred="projected", subject=binding.slot("profile"), method="adapter-report",
              ev=abx.E2, cov=abx.C0),
    abx.claim(pred="state",     subject=binding.slot("source"), method="read-back",
              ev=abx.E5, cov=abx.C1(window="at-finish"), payload=head_tree_digest),
])

fin = abx.finish(ex.id, actor="user:yuki", reason="tests green; handoff")
# 显式关闭责任窗口;actor/reason/最后 observation 快照入 append-only log;terminal 单调

report = abx.reconcile(ex.id)       # expected(manifest) vs actual(claims) 矩阵:
                                    # per-slot conformant/divergent/unknown + coverage 汇总
abx.export_evidence(ex.id, fmt="card-html", out="SUP-482-exec1.html")
```

阶段间的粒度契约：`prepare→freeze` 允许随意放弃（未接触 provider，垃圾无害）；`freeze→dispatch` 之间的 binding 持久可用（崩溃后可从 store 按 execution_id 取回）；dispatch 之后一切都围绕 receipt 与 claims。

## 3.2 故障语义矩阵

| 故障 | 结果 | 恢复协议 |
|---|---|---|
| **Library crash**（freeze 前） | 无外部痕迹 | 调用方重试即可；孤儿 slot 无害 |
| **Library crash**（freeze 后、dispatch 前） | binding 已在 store；provider 未动 | 重开进程后 `abx.resume_execution(execution_id)` 取回 binding 继续；或弃置 |
| **Host crash**（dispatch 进行中、receipt 未落盘） | **关键崩溃窗口** | 见 3.3 |
| Provider side effect 已发生、receipt 未保存 | 同上，receipt 落盘前态为 `dispatched(requested)` | 见 3.3 |
| observe 收到冲突 claims | 均追加（append-only），reconcile 时以 evidence level 与 observed_at 标注冲突而非覆盖 | reconcile 报 `divergent` 逐项列出双方 issuer/method |
| finish 后又收到 observation | 拒绝写入 projection（terminal 单调），claims 记录迟到但不改终态 | — |

## 3.3 关键崩溃窗口的处理（本设计的核心增量）

问题精确陈述：provider.start 已产生外部副作用，但 correlation 回写到 receipt 之前进程死亡。今日 Core 对此没有通用机制（round-1：generic dispatch crash reconciliation **ABSENT**）。**[ROUND-1 EVIDENCE]**

协议设计 **[REASONED PROPOSAL]**：

1. dispatch 前 receipt 以 `dispatched(requested)` 态落盘（单事务内与 manifest 同批提交，现状已有的原子性扩展到 pre-start 写入）；
2. 进程重启后调用 `abx.reconcile_pending()`：列出 store 内所有滞留 `requested` 的 receipt；
3. 对每条询问该 ExecutionProvider 的 recover 钩子：`recover(idempotency_key, binding) -> Correlation | None | Unknown`：
   - Temporal 类 substrate：按 key/activity 名反查原生对象 → 确定 Correlation，receipt 补写为 accepted（附 recovered 标记与时间）；
   - tmux/harness 类：今天的 tmux provider 已经示范了从 frozen inputs 重建 pane/session handle 的可行路径 → 可确定则同上。**[ROUND-1 EVIDENCE]**（doc 03 tmux accepted-dispatch handle recovery 行判 PARTIAL）
   - Codex App Server 类 substrate 若无反查 API：诚实置 `ambiguous`，UI/导出显示 "side effect may have occurred; unresolved"。绝不静默二次 start。
4. `ambiguous` 只能被上述消解过程终结，不能被超时自动改写。

## 3.4 幂等 / 并发 / 版本兼容

- **幂等**：同 key + 同 manifest_digest → 直接返回已有 receipt，不再触碰 provider；同 key 异 digest → 硬错误（防误绑）；异 key 同 digest → 新 Receipt 拒绝（一 Execution 一 Dispatch 不变量，现有 UNIQUE 约束承载）。failed 态的同 key 重调按显式策略：默认抛出原始失败（修正 round-1 发现的静默成功缺陷），`policy=allow_rearm` 时原子地把 receipt 复位为 requested 再走一遍——复位本身也是一条 ledger event。**[ROUND-1 EVIDENCE]**（doc 03 指认 services.py:101 区域缺陷）+ **[REASONED PROPOSAL]**
- **并发**：同一 store 文件的多进程并发由 SQLite WAL + immediate transaction + busy_timeout 承担；单 Execution 级别的两路并发 dispatch 败者获得已有 receipt（UNIQUE 保证 provider.start 只发生一次）。跨机器共享 store：拒绝服务并打印升级指引。Provider 侧并发安全由其 substrate 幂等性负责，SDK 文档须逐 adapter 声明（例如 CI trigger API 天然不幂等时，标注为 unsafe-for-concurrent-dispatch）。
- **Schema/version 兼容**：manifest 首字段固定 `schema_version`；canonical 化规则按版本冻结（N 版读取器须能验 N 与 N−1 的 digest）；contract_id 沿用现有 versioned 注册机制，破性格式变更走 major bump，历史 receipt 保持可读（读者降级为"可验证但部分字段未知"而不是报错）。claim 词表（E/D/C）为开放数值区间，加级别向后兼容。**[REASONED PROPOSAL]**（注册表版本机制 REPOSITORY VERIFIED：registry.py versioned contract）

---

# 4. Persistence 方案

| 方案 | 描述 | 得 | 失 |
|---|---|---|---|
| **A. 完全 Host 持久化** | store=false；一切以返回值为准，Host 自己写库/写 state | 采用门槛最低；Trust 边界清晰（谁的库谁负责）；最适合 LangGraph/Temporal 这类自带 durable state 的 Host | 跨进程 attach/finish/reconcile_pending 无从谈起；SDK 的崩溃恢复钩子失效；同类事实在每个 Host 里再发明一次存放格式，cross-host 统一查询永久不存在 |
| **B. SDK 自带嵌入式 SQLite**（推荐默认） | 前述 WAL 单文件；append-only lifecycle events；per-store 文件锁 | 使 interactive 场景可行（finish 来自另一进程）；崩溃窗口协议有了落点；成本≈零（标准库 sqlite3）；仍是本地文件，用户完全可控 | 拒绝多机共享 ⇒ 组织级查询需另行升级；本机历史对有 root 权限者无抗篡改性 |
| **C. Remote provenance service** | 中央 API + 库；接收 claims、提供统一索引、可挂 admission/signing/retention | 唯一能提供 non-bypassable enforcement、组织完成权威、长 retention 与签名的形态 | 部署/HA/auth 成本；重新背负 round-1 未证毕的 control-plane 论证负担 |
| **D. Manifest/claims 作为 artifact 写回外部系统** | GitHub artifact/attestation、Temporal memo/search attributes、checkpoint annotation、PR comment | 借用宿主系统的不可变性、留存与可见性（免费的非否认增益）；传播面大 | 覆盖碎片化：只在有对应宿主设施的场景有效；检索跨系统仍需聚合 |

**选择：B 为默认 + D 为并行增强；A 作为支持模式；C 仅作显式升级。**

升级到 C 的触发条件（任一为真才启动建设，均由付费方 pull 而非路线图 push）**[REASONED PROPOSAL]**：

1. 客户要求 unforgeable audit trail / 合规级 non-repudiation（B 只有 hash-chain 的 tamper-evidence）；
2. ≥2 个团队要求跨主机统一 Execution 查询或统一 policy 校验；
3. 需要在 dispatch 前做非旁路的 admission/credential 决策（B 结构上做不到 fail-closed）;
4. retention/ACL 超出单机文件的生命周期。

**什么时候中央 service 才必要？** 当且仅当上述 3 成立时，service 从可选组件变为必要组件——因为旁路一个本地库毫无阻力，而旁路 admission endpoint 至少需要绕开基础设施。其余条件（查询、retention、签名）都可以先用 B+D 过渡（签名导出的 evidence blob 放进任何 WORM 存储）。这与 round-1 红队的"非旁路 enforcement 是独立 control plane 的硬门槛"结论一致。**[ROUND-1 EVIDENCE]**（doc 02 subordination test + strongest counterarguments）

---

# 5. Workflow 和直接用户

## 5.1 LangGraph integration

形态：node wrapper helper，非引擎 interceptor。`abx.langgraph.governed_node(fn)` 在节点函数体内先把需要治理的外部资源（repo revision、workspace、harness profile、prompt、checkpoint locator）声明为 slots，resolve+freeze 后才调用真正的 harness；result claims 与 receipt 以普通 dict 写回 node state，随 thread checkpoint 自然持久。路由/中断/fork 语义分毫不动。manifest 里可选 slot 类型 `WorkflowInstanceRef`+checkpoint pin（现有 RefType 已含 WORKFLOW_INSTANCE）。**[REASONED PROPOSAL]**（Ref 枚举 REPOSITORY VERIFIED）

价值锚点：LangGraph checkpoint 保存 graph 持有什么，不证明 Git/workspace/profile 被 harness 实际以何 pin 使用——round-1 已论证该缺口属于 wrapper + claims 层。**[ROUND-1 EVIDENCE]**（doc 02 LangGraph substitute 小节"仍缺"部分）

## 5.2 Temporal integration

形态：Activity 包装器。Activity input payload 携带 manifest（不可变性天然由 Event History 保障）；output payload 携带 receipt 与 claims；`execution_id` 与 manifest_digest 设为 Search Attributes 以便 Temporal Web 内检索。Workflow 本身充当 long-term scope（external_scope=temporal workflow ID）。崩溃恢复几乎免费：Activity task retry 重放 input，SDK 侧 key 相同 ⇒ 幂等返回已有 receipt。**[REASONED PROPOSAL]**（Temporal 语义 ROUND-1 EVIDENCE doc 01/02 引官方文档）

## 5.3 GitHub / CI integration

形态：composite action + job summary writer。action 把 head SHA、action refs（full SHA pin）、镜像 digest 组装成 manifest，输出 digest 到 `$GITHUB_OUTPUT` 与 step summary；运行结束后比对 actual checkout HEAD 与 runner 上二次 read-back，claims 写成 PR checkrun 注释里的迷你 evidence 表格；可选 GitHub attestation 把 evidence 卡片本体作为 subject 之一签名。此场景 Agent-Box 不复制 CI 事实（GitHub 拥有的 head_sha 等由其原生权威背书），只承担"runner 上实际发生了什么"的二次 read-back 对账——这在纯 Actions metadata 之外。**[ROUND-1 EVIDENCE]**（doc 02 GitHub substitute：Actions 不能证明交互 harness/额外 checkout/secret version）

## 5.4 Direct CLI / Harness integration

`abx run --intent ... --source main --profile oncall --instruction prompts/fix.md --provider codex`
一次调用完成 new→prepare→resolve(defaults)→validate→freeze→dispatch，然后打印 attach 命令与 receipt 摘要。绑定选择采用"自动解析 defaults + 一次性 confirm"，而不是逐 slot 手工 composer——round-1 用户报告把"用户愿意手工构造 Binding"列为最高风险假设，SDK 形态的正确回应是不要求该假设成立：defaults 规则来自 config（repo 惯例、目录布局），只在歧义/FAIL 时交互。**[REQUIRES USER VALIDATION]**（defaults 满意度）+ **[REASONED PROPOSAL]**

## 5.5 Interactive tmux / Codex / Pi execution

没有任何一步退化为普通函数调用的假象，诚实分层 **[REASONED PROPOSAL]**（第 6 条第一轮事实的正面消化）：

- dispatch 返回时责任窗口已开、provider 进程/pane 已起（这部分与任何 subprocess 调用无异）；
- 窗口在中途跨越多个进程存活：dispatch 进程退出后，pane 与 session 仍在，后续 `abx observe <id>` / `abx finish <id> --actor me --reason ...` 是新的短命进程，通过嵌入存储接续同一场 Execution——存储替代了 daemon 的地位；
- Finish 语义与 turn 完成/idle/pane 死亡解耦，沿用现有插件已实现的 explicit finish + scrollback/session artifact 捕获能力。**[REPOSITORY VERIFIED]**（codex/tmux/pi 插件存在于 working tree 并带测试；explicit finish 语义 ROUND-1 EVIDENCE doc 03）
- 剩余弱点如实声明：App Server client handle 不持久，重启后的 reattach 依赖 recover 钩子（§3.3），Codex substrate 无反查 API 时落 ambiguous。**[ROUND-1 EVIDENCE]**

## 5.6 Direct user 无 WorkBoard 时如何完成四个动作

| 动作 | 界面 |
|---|---|
| 选择 Binding | `abx run` 的自动 defaults + confirm 提示；歧义时终端内列出候选项让用户按键挑选 |
| Attach | dispatch 输出直接给出可粘贴的 `tmux attach -t ...` / `codex resume` 命令（插件现状已实现 attach command 打印）|
| Finish | `abx finish <id>`（或 harness 内自定义 hook 键位转发到该命令）|
| 查看 Evidence | `abx show <id>`（终端渲染对账矩阵）与 `abx export` 生成的静态 HTML/markdown 卡片，可贴进 PR/issue/incident review |

无一处需要打开独立常驻 UI。**[REASONED PROPOSAL]**

---

# 6. Binding/Evidence 的独特性

退化命题：SDK 最终只是一个 `dict + UUID + JSON log`。下面七项是防御，每项给出"为什么 dict-log 做不到或做不对"。

1. **Typed contract。** slots 上的 contract_id 经版本注册表校验，resolve 后做运行时类型检查；selector 与 exact pin 是不同类型（`Requested(selector str)` vs `Resolved(ref_type, native_id, uri)`），把"`main` 漂移"这类 bug 在类型层面变得不可表示而非仅未观察到。dict-log 把二者混在同一字符串里。**[REPOSITORY VERIFIED]**（ResourceProvider resolve 后类型校验与 contract 数量限制在 services.py `_validate_input_limits/_resolve_inputs`）
2. **Canonical manifest。** 序列化规则确定性（sorted keys、显式 ordinal、bounded fields、schema_version 前置），digest 可第三方重算验证；"两次 resolve 结果是否一致"变成字节比较。JSON log 无 canonical 化，digest 断言不可复核。**[REASONED PROPOSAL]**（canonical 规则以测试钉死）
3. **Exact authority Ref。** 每 slot 记录解析它的 authority（git object store / registry / secret manager）与其 assurance 声明；审计者可区分 "Commit C 经 Git authority 验证" 与 "某 adapter 声称用了 C"。
4. **Provider acceptance。** receipt 区分 "API 调用未抛异常"、"substrate 持久接单"、"worker 实际开始"——round-1 指出现状 accepted 只是第一种。状态机字段 `accepted_basis: protocol-response | durable-object | worker-heartbeat`（ adapter 如实申报），reconcile 把它纳入证据分级。**[ROUND-1 EVIDENCE]**（doc 02 "provider.start 正常返回≠durable accept"；doc 03 accountability matrix）+ **[REASONED PROPOSAL]**
5. **Disposition / coverage。** claim 类型在构造期就强制携带 disposition(D0–D3) 与 coverage(C0/C1)，省略即编译失败。"没找到日志所以没用过"这种推断在类型层无法生成 negative conclusion；negative claim 必须 C1（观察面+时间窗+全集声明）。**[ROUND-1 EVIDENCE]**（doc 03 E/D/C 定义）+ **[REASONED PROPOSAL]**
6. **Integrity。** lifecycle 事件 append-only、每个 manifest/artifact digest 入链；JSONL transcript/scrollback 摘要沿用现有实践并把它标为"仅覆盖捕获到的 bytes"。**[REPOSITORY VERIFIED]**（现有 artifact SHA-256 实践）
7. **Continuation provenance。** `continuation_of` + 复用 SessionRef 作为冻结输入，terminal Execution 永不可 reopen（refuse API + 测试）。历史的责任边界不被任何后续调用改写——这是 dict+log 最容易悄悄丢失的性质。**[ROUND-1 EVIDENCE]**（doc 01 execution independence 分析； continuation 为产品要求、当前实现未闭合——此处 SDK 设计把其列为规格而不仅是期望）

**这些是否足以阻止其他团队轻易重写？** 诚实回答，分三层 **[REASONED PROPOSAL]**：

- 单 Host 浅层复制：不设防。四个表 + adapter 接口几天可写出 demo（round-1 红队已演示等价物）。承认这一点，不部署模糊话术。
- 跨 Host 语义一致的复制：显著更贵。崩溃窗口、ambiguity、mono-dispatch、canonical 稳定性、mono terminal、claim 词表，这些边界情形每个都要重新踩坑且有破坏性（重放导致双跑副作用是真金白银的事故）；参考实现 + conformance 测试套件把隐式知识显式化，复刻者的错误会出现在我们已写测试的地方。
- 生态锁定：取决于分发后是否有第二、第三个 adapter 由非我方贡献。这是唯一真正的护城河候选，也是 kill criterion §11-5 的监测点。

结论：独特性存在于"语义 + 边界情形正确性 + 词汇"的组合，不在任何单一数据结构。若 12 个月内 vocabulary 未成为他人的引用单位，此论证失效。

---

# 7. UI 和 WorkBoard

**选择组合：删除 WorkBoard 的产品地位；保留代码为 optional inspector（`abx ui` 启动的开发诊断工具）；生成静态 evidence report 作为唯一面向他人的呈现物；embeddable UI components 暂缓至有明确 pull。** **[REASONED PROPOSAL]**

裁决依据：

- round-1 三份报告一致：WorkBoard 未被证明是用户入口，更像 SDK 的 demo/inspector；hardcoded "coverage unavailable" 说明其 Evidence 视图尚不满足自身承诺。**[ROUND-1 EVIDENCE]**（doc 02 User and UI challenge；doc 04 WorkBoard role assessment）
- SDK 形态下 inspector 的正当职能收窄为三类：开发期调试 adapter resolve/freeze 是否符合预期；amber 调查（ambiguous receipts 排队检查）；本地演进时的 schema 巡检。这恰好是 TUI 已有能力（chronicle 轮询、details 展开、Binding draft 编辑可删去——编辑职责移交 Host defaults/policy）的自然子集。
- 删除项：Work 创建入口、Complete/Reopen Work 键位、Binding Composer 交互路径（draft 逻辑保留给开发者、终端用户不再接触）。1310 行 app.py 预计收缩至一半以下，转向只读 viewer。**[REPOSITORY VERIFIED]**（app.py 体量与键位面）

**普通用户在哪里完成操作：** 全部在自己已住的地方——CLI/Tmux/Harness 内发起与结束；GitHub PR/checkrun 看摘要与 evidence 卡片；IDE/Host 面板读自家渲染的 receipt；Linux 工程师 grep `abx export` 生成的 markdown。Agent-Box 出现在结果的署名处，不出现在流程的前台。

---

# 8. Demo

原则（承袭 round-1 falsification 报告的红线）：不能只放代码滚动和 JSON dump；观众必须看到因为 SDK 而不同的现实结局。**[REASONED PROPOSAL]**

## 8.1 60–90 秒 integration Demo（卖点三拍）

| 时间 | 画面 | 独特结果 |
|---|---|---|
| 0–25s | 一个 LangGraph 支持机器人脚本首次运行；中途 Ctrl-C 杀死；再次运行 | **双开事故没有发生**：屏幕上 Codex pane 只有 1 个，日志打出 `receipt reused (idempotency_key=…)`,观众肉眼对比左栏"无 SDK 复刻脚本"跑出的两个重复 pane |
| 25–55s | resolve 之后、launch 之前 sabotage:`main` 被推进一个 commit；watcher 显示 selector 漂移告警；SDK 按 frozen digest 继续 launch 并在 reconcile 时打出 `divergent(pin=C requested-main → actual=D)` | **漂移被抓住且留痕**:普通 launch 脚本右栏里 D 悄悄跑了,无人知晓 |
| 55–85s | `abx show` 渲染对账卡片:绿 verified(Git commit/tree read-back)、黄 provider-reported(prompt projected)、灰 unknown(plugin consumption),最后 evidence HTML 卡片贴进一条真实 GitHub PR 评论 | **一屏看清已证明 vs 未知**,且产物进入了同事已经在看的地方 |

理解测试问题预设：观众应能说出"崩溃后为什么只有一个 pane"与"灰色格子是什么意思"。

## 8.2 3 分钟端到端 Demo（真实 repo、真实 harness、一次真正的失败处理）

0:00–0:30 开发者在真实 repo 上 `abx run`(终策略 interaction):defaults 弹出 workspace/worktree/profile/指令文件候选,confirm;freeze 摘要与 digest 展示一瞬。
0:30–1:10 Codex 在 pane 中真实修改文件、跑测试;开发者照常干活。
1:10–1:45 第一拍重演于叙事中:mid-dispatch kill -9 整个 shell;重新打开终端 `abx reconcile-pending`;recover 钩子从 frozen inputs 找回 pane,receipt 标 `accepted (recovered)`,时间线显示 crash→recover 两行。
1:45–2:20 第二拍:sabotage(编辑 profile 文件);SDK 在 validate 时 WARN(digest 变化),按策略 freeze 旧值并标注,finish 后 reconcile 显示 profile slot divergent —— 随后 `abx finish --reason "manual fix applied"`,E2 同 session 新 Execution 携带 review comment 作新 slot,E1 永久 immutable 的证据展示(尝试 reopen 被拒)。
2:20–3:00 浏览器打开导出的静态 evidence 卡片:expected-vs-actual 矩阵、可点击的 authority 链接(git commit、Codex thread、CI run)、unknown 区诚实列明;结尾一句字幕:"如果你的 agent 平台已经有这些卡片的格式约定,这就是 Agent-Box。"

## 8.3 这种形态的视频传播劣势（不说漂亮的场面话）

- **没有主场。** 画面主体是别人家的产品(LangGraph studio/GitHub/tmux)+ 一个终端;观众的自然归因错误率高("这是 LangGraph 的新功能?")——round-1 comprehension test 的失败预测在这类素材上只会更糟。**[ROUND-1 EVIDENCE]**(doc 04 viewer comprehension test "当前预测:不通过")
- **价值的最佳时刻全是"没有发生的坏事"。** 双开没发生、漂移被抓住、孤儿窗口被找回——负空间叙事在视频里先天弱势,必须靠对照栏人工制造对比,有摆拍嫌疑且信息密度低。
- **受众漏斗极窄。** 会被吸引看完的人几乎已经是要集成平台工程师本人,普通科技媒体传播近乎为零;视频不是获客渠道,是销售辅助材料。接受并按销售工具制作(可直接跳转章节号)而非营销内容。
- 缓解手段(有限):把 evidence 卡片当成视觉主角反复露出并打水印;每个 beat 左右分屏 with/without 对照;"ambiguity was resolved honestly"这类台词比画面更有传播力的话由脚本承担。

---

# 9. 迁移当前仓库（只提出路线,不实施）

| 资产 | 处置 |
|---|---|
| `work_core/models.py` 的 Execution/Ref/projection | **保留**,随 Work 外键改造(`work_id`→可空 `scope_ref`);Manifest、DispatchReceipt、EvidenceClaim 为新增类型 |
| `work_core/services.py` create/complete/reopen_work | **删除**(随 Work 实体) |
| `dispatch_execution`/canonicalize/digest/idempotency 路径 | **保留**为 SDK 核心,修复 failed-idempotency 语义、增加 `reconcile_pending` 与 recover 钩子接口(§3.3) |
| `providers/resources.py`(Git/file/profile/tmux resolver) | **保留**,平移为第一个 reference ResourceProvider 集 |
| codex / pi / tmux / preview-resources plugins | **保留**为 reference ExecutionProviders(注入点从 plugin 目录调整为独立发行包;untracked 内容需入库 —— 迁移动作的一部分) |
| `registry.py` + ADR-0007 entry-point 加载 | **保留**不动,in-process 定位不变 |
| 数据库 migrations 001–006 | **保留链**,新增 007:`core_executions.work_id` 改 nullable、新增 manifests/claims 表;`core_works` 停止写入但不 DROP(老库兼容)。**不引入全新 schema 破坏升级** |
| `minimal_work_core` spike | 作为拆包起点参照(CORE_CONTRACT_V0.md 与 runtime 形状已被验证) |
| `binding_flow_stress`(28 场景)/`real_governed_binding` spikes | **保留**为 SDK conformance 测试套件的种子 |
| WorkBoard plugin | 降级为 `abx ui` inspector;删 Work 生命周期键位与 composer 主路径;README 与产品宣称全面改写 |
| Preview/demo 材料 | 删除:seed_preview_board*.py 系列 fixtures、以 Work 为主角的 storyboard 叙事、demo blueprint 中依赖 WorkBoard 表单的镜头;`preview_demo/prepare_target_repository.py` 保留改造为 e2e fixture |
| `launch.py`(sandbox bind-mount planner) | **暂留主仓**,future 拆至 sandbox helper 包(它与 envelope 语义无关,只是 harness 相关实用件) |
| TUI app.py(顶层 agent-box 应用) | 收缩为主 CLI(claude/workboard 双入口合一),长期目标只剩 `abx` 单词根 |

顺序建议:①拆包抽 core(改外键) → ②manifest/claim/收据语义落地 + 修 failed-idempotency → ③reconcile_pending+recover → ④`abx` CLI 与 ui 降级 → ⑤文档/Preview 清理。每步可独立合入,当前 135 个通过测试为核心回归网。**[REPOSITORY VERIFIED]**(测试计数 ROUND-1 EVIDENCE doc 03;文件路径本轮核实)

---

# 10. 商业和采用路径

- **谁决定采用:** 自底向上是个人开发者装 CLI(零审批);中辛之路是 platform/tooling 团队在单个 workflow/host 里试点 node/activity wrapper(一个 PR + 一个依赖);上行触发器是 compliance/audit 团队认定 evidence 导出满足其评审要求。审批最重的买家(受监管企业)同时也是最难被纯 SDK 满足的(要 non-repudiation ⇒ 等 service)。**[REQUIRES USER VALIDATION]**
- **集成成本:** Python Host + 现成 adapter:小时~天(声明 slots + 调五六个 API);新 ExecutionProvider:天~周(依 substrate 的接单/反查能力差异巨大,Codex 类无反查 API 者最贵);非 Python Host:目前无答案,需 gRPC sidecar 或语言移植——诚实列为 SDK 候选的真实局限,不粉饰。**[REASONED PROPOSAL]**
- **开源/商业边界:** 全部 envelope/schema/CLI/reference adapters 以宽松许可开源(这是 schema 被信任的前提);商业选项仅当 C 方案存在后才讨论:hosted provenance service、企业 retention/SIEM 导出、attestation 托管、支持与 SLA。开源核心的完整性不受商业层影响是被刻意保住的性质。**[REASONED PROPOSAL]**
- **为什么不是一次性内部 library:** 三点。①词汇的网络效应只有在共享时存在,每个团队 fork 一次,Binding/Evidence 词表就碎一次,回到各说各话的原点;②边界情形(§6 所列)的修复集中维护远便宜于四处重挖;③跨 provider reference adapters 是持续追着上游 API 变化的苦役,单独任何内部团队都不会养——中心化分发是这个苦役唯一经济上可持续的组织形式。
- **网络效应 / adapter value / schema value:** 飞轮:采纳者贡献新 adapter → 每个新 adapter 增加所有既有采纳者的证据覆盖率 → evidence 卡片作为工件(PR 评论/incident report)向外流通,每次流通都是一次免费分销;词表(E/D/C、divergent、continuation_of)进入团队会议用语即是 schema value 的领先指标。以上均为假设。**[REQUIRES USER VALIDATION]**
- **没有独立 UI 时用户如何认识产品价值:** 通过三个既有触点——①事故复盘里那句"幸亏当时 digest 对不上没让它跑";②PR/issue 里同行可见的 evidence 卡片署名;③"为什么你们的 agent 没有发生过重跑事故"的口碑问答。度量方式:导出物的他引次数与第三方 adapter PR 数量,而非 DAU(它根本没有 home page 可谈 DAU)。**[REASONED PROPOSAL]**

---

# 11. 自我攻击和退出条件

## 11.1 六个必答问题

**Q1 SDK 是否太容易被复制?** 是,在单 Host 粒度上是(a detailed answer in §6 第三层)。防御兑现的前提——conformance suite 早日公开、reference adapters 覆盖 ≥3 个异质 substrate(本地 process、k8s/CI 类 API 型、App Server 类流式型)、词表开始被他方引用——任何一个缺席都等同于裸奔。**[REASONED PROPOSAL]**

**Q2 没有中央 authority 后 frozen history 是否可信?** 比 log 可信(hash-chain + canonical 复算 + 写回外部不可变存储可交叉验证),远不及 signed central log(tamper-evidence ≠ non-repudiation;本机 admin/root 可篡)。缓解:D 增强路径的 attestation 写回应做成一等特性而非 afterthought;凡合规买家咨询一律如实回答"到此为止,更多要等 service"。市场话术若越界一次,evidence 信任资产清零。**[REASONED PROPOSAL]**

**Q3 不同 Host 是否产生不兼容语义?** 会,范围可控:SDK 语义被钉死在 freeze/admit/claim 窄带上,Host 各自的差异( progressing、own IDs、各自的 storage)被 `host_namespace` 与 conformance label 吸收——claims 带 `conformance: v1` 徽章,不符者可见地降级为"部分兼容"。真正难挡的是 Host 借 flexility 自造 slot 语义绕开 typed contract;唯一护栏是把逃生舱口(自由 metadata)做得显眼且被标记为 out-of-contract,让偏离可见。接受残余分歧,不为消灭它扩建规范。**[REASONED PROPOSAL]**

**Q4 Evidence 是否沦为 logs wrapper?** 当且仅当 claim 流的主体停留在 E≤4(provider self-report/projected)且消费者无从行动。round-1 证明现状正是如此(harness 关键 slot 主要是 self-report);SDK 能做的只是诚实标注与可比性。识别信号见 §13 升级条件②;若两年内 Git/CI/容器外的 slot 依然大面积灰格,证据论点破产,只剩下簿册便利性——那其实也就是 OTel 已经占据的位置。**[ROUND-1 EVIDENCE]** + **[REASONED PROPOSAL]**

**Q5 interactive execution 是否迫使重新引入 daemon?** 三个逃逸舱依次用尽才算被迫:(i)嵌入存储让跨进程 finish/observe 无 daemon 化(§5.5,已验证插件模式);(ii)recover 钩子吃掉最常见崩溃窗口;(iii)same-machine 第二用户场景显式不支持。剩余真需求只有两个:多方异地协作 attached session、central credential/admission——前者本来就不是单一 vendetta 能解决的频道,后者即升级条件③。趋势监测指标:`abx` 用户询问"能不能多人同时看一个 execution"的比例。**[REASONED PROPOSAL]**

**Q6 没有 Work 后长期责任如何表达?** 由 external scope(Jira/issue/workflow chain)+ `continuation_of` Execution 链承担,结束权在外部系统;付出的确定代价是:Agent-Box 自己不再有原生 completion aggregate("这个 goal 下面 5 场 Execution 都什么状态")——每次想看都要 query 两次(本地链 + 远端 scope)。判断:该代价小于带着 dual-lifecycle 冲突上岗的成本(round-1 已指出第二个 completion lifecycle 的接受度本身就是高风险假设)。**[REQUIRES USER VALIDATION]**

## 11.2 Kill criteria(达到任一即停止投入或重新定位)

1. **Logging 降解实证:** 发布后 90 天,抽样集成中 >70% 长期禁用嵌入存储且从未回读 manifest/claims(只留 digest 在自家日志),⇒ schema 价值未发生,撤回 SDK 叙事、按 utility library 维护。
2. **证据天花板僵局:** ≥2 个真实集成里,购买决策相关的关键 slot 连续一季度 mostly unknown/self-report(E≤4),且下游使用者明确表示 reading 输出无法做出任何行动 ⇒ reconciliation 卖点证伪(承继 round-1 counterargument #2 的触发条款)。
3. **Schema 不被照单全收:** ≥3 个外部采纳者在首月即 fork/修改 canonicalization 或 receipt 语义 ⇒ 词汇护城河不成立,降级为参考实现项目。
4. **Daemon 不可逆渗透:** 在获得任何规模化采用证据之前,≥2 个旗舰 Host 需求迫使建设常驻 gateway/daemon 才能 attach ⇒ 事实上已滑向候选 C/D 形态,届时应以那个候选重新立项评估,而非由 SDK 项目夹带生长。
5. **第二 Host 零采纳:** 首发 6 个月内除第一个集成对象外无任何第二方 Host/团队接入 ⇒ 跨 Host 论题死亡,收缩为该团队的内部 launcher library。
6. **上游平台原生化冲击:** LangGraph/Temporal/GitHub 任一方发布覆盖同一 JTBD(freeze manifest + idempotent dispatch + typed claims)的原生 feature 且摩擦可接受 ⇒ 替代窗口关闭(此为 round-1 最强反方 #1 的现实化触发),转向差异化生存空间评估或退出。
7. **Evidence 输出误导率超标:** reviewer 盲测中基于导出卡片做出的可行动判断误判率高于让其直接阅读原生 logs 的对照组 ⇒ 诚实标注的努力净效果为负,立即冻结该功能宣称(round-1 assumption #5 验证失败的具体化)。

---

# 12. 统一评分

评分约定:**分数越高越有利于候选 D**(故 replaceability 2 分意为"容易被替换,是弱项")。评分为定性排序工具,精度 ±1。

| 维度 | 分 | 依据摘要 |
|---|---:|---|
| independent JTBD | 3 | 三个 JTBD 机制上成立但无一有用户证据(round-1 verdict E);SDK 形态至少不制造 JTBD 假象,主打假设#1(自动化 defaults)刻意绕开最强阻力。**[REQUIRES USER VALIDATION]** |
| differentiation | 3 | 词汇组合与边界情形正确性是真差异化但均可拆解复制;无单一不可仿部件(§6 承认)。 |
| user friction | 4 | 安装即用、无 daemon、无审批;残余摩擦是 binding 纪律本身,由 defaults 模式吸收大部分。 |
| evidence credibility | 2 | 自身不提升证据等级,只提升可比性与诚实度;E5+ 覆盖依赖外部 authority 配合,短期结构上偏弱(§11 Q4)。 |
| workflow integration | 5 | 寄生于既有 substrate 是字面意义上的 native fit;Temporal case 几乎免费拿到崩溃恢复。 |
| implementation feasibility | 4 | 骨干(dispatch/idempotency/ref/registry/resource resolvers/providers)已在 working tree 运行并有测试;增量集中在 manifest 分层、claim 类型、reconcile_pending、CLI 重塑——无科研风险,工量中等。**[REPOSITORY VERIFIED]** |
| replaceability | 2 | round-1 红队已给出七种可替代组合,本设计未消除其中任何一种;唯一弹性是生态锁定(未证实)。**[ROUND-1 EVIDENCE]** |
| deployment burden | 5 | 近乎为零的标准库依赖 + 一个 SQLite 文件;全部候选中最优属性,也是采用的先头部队。 |
| Demo clarity | 2 | 负空间叙事+他人产品占屏,视频渠道先天弱势(§8.3);销售可救,传播难救。 |
| Core boundary integrity | 4 | keep-set 最窄且与四份 round-1 结论零冲突;删 Work/删 DB 强制/拒绝 progress 语义,B+C 主站位执行得最彻底。风险点是后续 feature creep 会最先从这里破口(recover 钩子离 session gateway 只差半步)。 |

加权印象:这是一个**边界干净、落地最快、但独占性最弱**的候选。适合在当前证据水平下起步,不适合作为信念终点。

---

# 13. 最终判词

## **B. 只适合作为首个发行形态，未来需要 service。**

## 论证

**(1) 为什么现在选 D 形态是对的。** 六条强制接受的第一轮事实中没有一条为 Work、WorkBoard 或中央数据库背书,而全部六条都被本设计绕开而非对抗:删 Work(事实 5)、借宿主持久化与生命周期(事实 2)、保留下来的恰恰是被确认仍未被外部商品化的跨 authority envelope 公共语义(事实 3)、用嵌入存储+recover 钩子正面处理 interactive 窗口(事实 6)、把 fact 4 的双刃性(易被替代/易被采纳)当作_deploy_or_die 的紧迫性来源而非绝望理由。且最接近现实的一步恰是从现存 working tree 里走出来而非新建宫殿——实现可行性打 4 分是有源码作保的。**[REPOSITORY VERIFIED]**

**(2) 为什么 B 而非 A(D 值得进第三轮)。** 因为第三轮应比较的是候选间残余分歧(service 要不要建、何时建),而这个分歧在本候选内部已被§4/§11 的升级条件显式参数化了;继续带着"D 可以永续"的修辞进第三轮只会重复 round-1 的僵局。且 A 的表述适用于"还有开放分歧"的情形——本文的回答是开放的,只是设置了客观触发器。

**(3) 为什么不是 C(workflow substrate)或 D(dual-entry)。** C 要求接管 progress 语义,违反 recalibration 主站位与本报告 §1.6;D(dual-entry)在本体系标记下指"dual-entry control plane",其成立的先决条件(non-bypassable admission,升级条件③)尚无任何客户 pull,提前建设正是 round-1 判定为未证实的赌注。保持 upgrade-trigger 待命,而非先造好等待需求。

**(4) 为什么不是 E(不成立)。** 如果 SDK 不能以最小诚实闭环(resolve→freeze→idempotent dispatch→typed claims→reconcile)被构建并被至少一个真实 Host 试用,才是 E;骨干已在库内运行,13 条路径里没有一条存在技术不可能性,故 E 否决不成立——注意这不等于已证明任何人要它,**[REQUIRES USER VALIDATION]** 覆盖全部采纳侧断言。

## 通往下一形态的触发器速览(与 §11 kill criteria 互为镜像)

| 信号 | 动作 |
|---|---|
| 升级条件③(admission 不可旁路成为真需求) | 启动 service 建设,候选升级为 dual-entry control plane |
| 升级条件①/②(compliance 级 audit/跨团队统一索引) | 启动 hosted service 但**不**迁移 dispatch 路径(local-first 保留) |
| Kill #5/#6(第二 Host 零采纳/上游原生化) | 收缩为内部库或退出,不进入第三轮 |
| 90 天累计 ≥2 个真实集成 × 关键 slot 证据大多 E≤4 | 主动下调 reconciliation 宣称,重写 evidence 叙事 |

## 遗留给下一轮的问题

1. `scope_ref` 是否足以承载全部已被外置于 Issue/Jira/Workflow-ID 的 long-term duty,还是需要一个最小 group object(不带 lifecycle)?——取决于用户访谈,Q6 的两次 query 体验抱怨频度。
2. Embeddable UI components 的真实 pull 有多大(evidence 卡片的 IDE 渲染是自然需求还是伪需求)?
3. 非 Python Host 的 sidecar/gRPC 边界是否应该在 SDK v1 就预留 ABI,还是明确推迟?
4. Conformance suite 的最小集是什么(canonicalization 向量、crash-window scenario 矩阵能否直接从 binding_flow_stress 的 28 场景裁剪)?——建议下轮任何候选都以此为共同基建,便于横向对比。

---

*报告完。本文件仅为研究产出;未修改任何代码,未执行 git 操作。*
