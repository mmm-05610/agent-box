# Round 3 · 红队报告：单一 Kernel、多 Host 形态

审计日期 **2026-08-27**。本报告攻击以下合流命题：

> Agent-Box 可以拥有一个稳定的 Execution Kernel；Execution-centric Work Platform、Dual-entry Control Plane、Workflow Execution Substrate、Embedded SDK/Provenance Middleware 都只是同一 Kernel 的不同 Host、插件或部署包装。Preview 使用 A 型 WorkBoard 体验，但 Core 不因此依赖 A。

本报告只读取 round-1 四份输出、round-2 全部四份候选设计、产品重校准文档，以及本轮亲自核对的当前仓库代码/迁移/测试。未读取任何其他 round-3 输出。未修改代码、未执行 Git 操作。

标签：

| 标签 | 含义 |
|---|---|
| **REPOSITORY VERIFIED** | 本轮亲自打开源码/迁移/测试核对的事实（附文件行号） |
| **ROUND-1/2 EVIDENCE** | 第一轮四份验证与第二轮四份候选设计中确立的结论 |
| **REASONED PROPOSAL** | 本红队从已验证事实推导的判断 |
| **UNRESOLVED** | 本轮无法用现有证据裁决、必须留给下一阶段的问题 |
| **REQUIRES USER VALIDATION** | 必须由真实用户行为检验 |

---

# Executive verdict

**判词：B. 基本成立——但必须删除/外移某些当前 Core 语义，且合流论证目前掩盖了一个它自己无法裁决的产品定位冲突。**

三条支撑判断的发现（细节见后文各节）：

1. **交集是真的。** round-2 四个对立候选在互不读对方的情况下收敛出近乎同一张 Kernel 必改清单：`work_id` 可选化（4/4）、failed-idempotency 修复（3/4 明示）、crash-window reconciliation（4/4）、evidence disposition×coverage 词表（4/4）。语义层面的"同一 Kernel 多包装"不是修辞，四个被测对象真的指向同一个约 6 个函数的核心 envelope：create_execution / dispatch_execution / observe·apply_observation / attach_ref / complete_work±finish / query。**[ROUND-1/2 EVIDENCE]**

2. **稳定性是假的。** 当前 Core 不仅没有证明"稳定"，而且有至少四处**违反其声称不变量的已实现行为**：(a) terminal 之后仍可 resume，且被 `test_work_core_vertical_slice.py:49-53` 作为断言固化；(b) codex provider 在 terminal 投影上返回 `resumable_now=True`（provider.py:452），仅因未声明 resume capability 才碰巧未被调用；(c) legacy `request_dispatch()` 创建无冻结输入的 Dispatch，把该 Execution 永久变成"永远无法 governed-dispatch"的僵尸（repository 的 INPUT 冻结检查随后必然抛错）；(d) `update_projection` 无单调性守卫，terminal→active 翻转可以直接落库且留下不一致的 `ended_at`。**[REPOSITORY VERIFIED]** "stable kernel"一词对今天的树是过期支票。

3. **合流命题隐藏了半个定位冲突。** 它隐藏掉的部分：ontology 冲突是伪冲突——四形态对 Kernel 语义的要求确实可统一（这是 B 判词的依据）。它没解决却假装解决了的部分：**谁先上、买方是谁、入口在哪**。round-2 四份文档给出了四个互斥的主要入口答案（人开工台 / receipt 流入原生工具 / 平台工程师 node 包装 / 个人 CLI 无主页）和四个互斥的首发形态排序。Kernel 对这些问题天然沉默；"都可以做插件"不能代替选择。**[REASONED PROPOSAL]**

合流作为**架构主张**成立（待删除清单执行后）；作为**产品战略**不成立也不必要——第 9 节 kill criteria 把两者分开。

---

# Four-host ownership matrix

四种形态的实际调用关系。"今天？"列标注该归属在当前 working tree 是否已是现实。

| 问题 | A. WorkBoard / Execution-centric 体验 | B. direct + Host shared service | C. LangGraph/Temporal adapter | D. Embedded SDK/middleware |
|---|---|---|---|---|
| 谁创建 Execution | Host runner 脚本/WorkBoard `n` 键调 `ExecutionService.create_execution(work.id, …)` — 今天如此 **[REPOSITORY VERIFIED]** | 入口脚本/CLI 直调同一服务函数 **[ROUND-2 EVIDENCE 02 §2]** | governed node wrapper / Activity 内创建，先于 provider start **[ROUND-2 EVIDENCE 03 §2.1]** | Host 进程内 SDK 调 `Execution.new(...)` 后 freeze/dispatch **[ROUND-2 EVIDENCE 04 §3.1]** |
| 谁提供 scope | **Work（当前强制）**：execution 只能挂在 OPEN Work 下创建 **[REPOSITORY VERIFIED repository.py:163-170]** | `{work}` XOR `{external_scope}` 二选一列 **[ROUND-2 EVIDENCE 02 §3]** | host_ref（Thread/RunID/chain/issue），Work 不存在 **[ROUND-2 EVIDENCE 03 §2.1]** | external_scope 字符串（`linear:SUP-482` 等），可空 **[ROUND-2 EVIDENCE 04 §2.5]** |
| 谁决定下一步 | 人（ chronicle 只陈列事实，无 next API——核心里没有任何"next"概念）**[REPOSITORY VERIFIED + REASONED PROPOSAL]** | 发起方组织流程/引擎；Core 只给 receipt **[ROUND-2 EVIDENCE 02 §2]** | workflow 引擎（routing/retry/checkpoint 全留宿主）**[ROUND-1 EVIDENCE]** | Host 代码；SDK 无 progress 语义 **[ROUND-2 EVIDENCE 04 §1.6]** |
| 谁决定 Finish | 人按键 `f` → 触发 provider plugin 的 `finish()`；kernel 中 Finish 概念不存在 **[REPOSITORY VERIFIED plugin-local]** | 人或 host-delegated-human actor 提交，首个生效并记录 actor **[ROUND-2 EVIDENCE 02 §2]** | Settlement 等待 human_finish 或 auto-settle policy；node return ≠ finish **[ROUND-2 EVIDENCE 03 §6]** | 任意本地短命进程 `abx finish <id>` —— 存储替代 daemon **[ROUND-2 EVIDENCE 04 §5.5]** |
| 谁持久化 | `$AGENT_BOX_HOME` 单 SQLite 文件，进程共享 **[REPOSITORY VERIFIED]** | 同一共享 SQLite/WAL（S1）；拒绝网络化直至触发条件 **[ROUND-2 EVIDENCE 02 §7]** | Core db + 引擎自有 History 双写各归各 **[ROUND-2 EVIDENCE 03 §2.5]** | 嵌入式 SQLite 默认；可整体禁用退化为返回值由 Host 自存（此时跨进程 attach/finish 失效）**[ROUND-2 EVIDENCE 04 §4]** |
| 谁展示 Evidence | WorkBoard chronicle + evidence modal（现硬编码 `coverage unavailable`）**[REPOSITORY VERIFIED model.py:225]** | query/export receipt 静态导出；链接流回 PR/metadata **[ROUND-2 EVIDENCE 02 §8]** | EvidenceReport 作为 Activity result / node state 写回宿主可见面 **[ROUND-2 EVIDENCE 03 §7]** | 返回值对象 + `abx show` / 导出静态卡片贴进宿主世界 **[ROUND-2 EVIDENCE 04 §5.6]** |
| 谁拥有 recovery | tmux plugin `recover_handle()` 仅覆盖已 accepted 且 inputs 可重建路径；App Server handle 是进程内 dict，重启即失 **[REPOSITORY VERIFIED provider.py:233,358-362, tmux_provider.py:254]** | start-attempt 标记 + recover 钩子协议 **[ROUND-2 EVIDENCE 02 §5]** | Temporal replay 幂等重投 + provider 反查钩子；无反查 API 则诚实 ambiguous **[ROUND-2 EVIDENCE 03 §9.2]** | `reconcile_pending()` 枚举滞留 requested receipt 逐条消解 **[ROUND-2 EVIDENCE 04 §3.3]** |
| 主要用户入口 | WorkBoard TUI（主动入口未获任何证据）**[ROUND-1 EVIDENCE subordination test entry point=0]** | receipt/卡片流入原生工具后被点击回访 **[ROUND-2 EVIDENCE 02 §8]** **[REQUIRES USER VALIDATION]** | 宿主自己的 Web UI（Temporal Web/LangGraph Studio），Agent-Box 以字段级存在 **[ROUND-2 EVIDENCE 03 §10]** | 没有 home page；价值署名出现在导出物与他人产品内 **[ROUND-2 EVIDENCE 04 §10]** |

矩阵立刻暴露第一处名实不符：四形态共用一套**写入侧**动词毫无障碍（这也是判词偏 B 的原因），但四形态的**读出侧/恢复侧/入口侧**承诺彼此几乎为零重叠。"不同包装"的说法只在写入合同上成立。

---

# True Kernel intersection

从四个候选反向推导共同必需的最小语义，逐项审判。判定词汇：MUST BE KERNEL（不可下放，否则对应场景在任何形态都无法表达）/ OPTIONAL KERNEL MODULE（必须存在但默认关/可选装）/ HOST/PLUGIN（归属外围）/ SHOULD NOT EXIST（合流后必须删除或永不引入）。每项给 concrete scenario 作依据。

| 语义项 | 判定 | 依据场景 |
|---|---|---|
| Work | **OPTIONAL KERNEL MODULE** | 场景：GitHub Action nightly 发现 flaky 测试，webhook 触发一次无人命名的修复尝试 Execution——强制 Work 制造伪目标垃圾 [ROUND-2 四份共识]；反例场景：开发者为期一个月的多会话插件开发，需要模糊目标锚点和已完成尝试的时间线 [01 设计]。两个场景都真实 ⇒ 存在但不可强制。 |
| Execution identity | **MUST BE KERNEL** | crash 时序：native start 成功但 correlation 未落盘——只有 start 之前就已存在的稳定 ID 能让恢复程序指认"哪一次责任窗口悬置"。session/run ID 此刻都还不存在。 |
| responsibility intent | **MUST BE KERNEL** | 事故复盘问"这条执行为什么被创建"；当前以规范化 ≤256 字符不可变事件持久（events.py `execution_created_event`，repository 校验规范化一致 **[REPOSITORY VERIFIED]**）。它属于合同正文而非 UI 元数据。 |
| Binding/input associations | **MUST BE KERNEL** | TOCTOU：requested `main`，resolve 得 C，launch 前 main 漂到 D。单事务原子冻结 `(contract_id, Ref)` + digest 是唯一能让"解析结果=启动依据"成立的边界，且已有 UNIQUE 与禁止追加实现 **[REPOSITORY VERIFIED services.py:118-160, repository.py:287-331]**。临时 wrapper 最常做错的地方 [ROUND-1 EVIDENCE]。 |
| requested selector provenance | **OPTIONAL KERNEL MODULE** | 同一 HEAD 漂移事故的事后听证："用户请求的是什么 vs 实际用的是哪个 commit"。今天 selector 字符串根本不入库，divergence-by-resolution 与 launch-divergence 无法区分。所有需要 divergence 呈现的形态（A 的 evidence 卡、C 的 mismatch 回报）共享此需求。[ROUND-1 故障表第一条] |
| exact Ref | **MUST BE KERNEL** | 无争议：frozen dataclass 五元组 + 版本 contract 注册，运行时类型校验 **[REPOSITORY VERIFIED registry.py:72-99, services.py:269-278]**。 |
| Dispatch | **MUST BE KERNEL** | 幂等键重放风暴（LangGraph node retry）下 "只允许一次真实 side effect" 需要 durable 接单记录承载；`execution_id UNIQUE` + `idempotency_key UNIQUE` 已在 schema 层强制 **[REPOSITORY VERIFIED 006 迁移]**。 |
| accepted receipt | **MUST BE KERNEL** | receipt 是上游唯一的集成契约物；requested→accepted 单向状态机已实现，failed 终态不可再转移（repository.py:377-380）——这个过严转移规则本身却是 C 形态 adapter 的陷阱，见冲突 #4。 |
| native correlations | **MUST BE KERNEL** | 一场 interactive 责任窗口 = 1 Codex Thread + N Turn refs + pane + workspace facts；NATIVE relation 附着、重复发现不产生遥测噪声均已实现 **[REPOSITORY VERIFIED repository.py:205-238]**。没有任何单一上游对象能容纳此 join。 |
| Observation（投影） | **MUST BE KERNEL**（最小投影部分） | active/terminal/unknown + outcome/freshness/resumable_now 与 `observed_at<当前` 丢弃旧观测的实现 **[REPOSITORY VERIFIED projection.py, services.py:292-303]**。 |
| Evidence / disposition / coverage | **MUST BE KERNEL**（schema+词表）/ issuer 属 PLUGIN | fake adapter 先写 projected 再写 consumed，Core 全收——自由字符串 state 使账本可被最马虎的插件污染 **[REPOSITORY VERIFIED services.py:338-379]**。分级词表本身沿 round-1 E/D/C 定义 [ROUND-1 EVIDENCE]。**词表若不下沉为受控列，四形态各自发明 JSON 约定，合流死于此。** |
| explicit Finish | **OPTIONAL KERNEL MODULE**（Finish 记录 ledger）；Finish 动作属 PLUGIN | 场景分叉：A 里人按键结束；C 里 activity await settlement 直到 human_finish 或 policy auto-settle；D 里另一终端进程提交 finish。三种表达的接收方必须是同一条 `finish(execution_id, actor, reason)` 记录，否则 sealed 与 unsettled 两套语义必然fork。当前 Finish 只活在三个插件的 `submitted` 布尔位里 **[REPOSITORY VERIFIED provider.py:402-409, tmux_provider.py:320-337]**。 |
| continuation | 表达：**OPTIONAL KERNEL MODULE**（lineage 字段或 provenance 约定）；"terminal 不可 reopen"禁令：**MUST BE KERNEL** | 场景：CI 红后同一 session 修一次——E1 必须封存、E2 新 Binding 新 Dispatch。当前模型连 lineage 字段都没有，反而 vertical-slice 测试断言 terminal 后 resume 合法 **[REPOSITORY VERIFIED tests/test_work_core_vertical_slice.py:49-53]**——禁令方向被现行测试钉反。 |
| persistence | **MUST BE KERNEL**（单 store 族权威）| crash-safe receipt、append-only event、幂等约束都以"一个物理存储"为前提；多机合并/双写不属于任何形态的需求清单。store 拓扑（同机文件 vs 未来 service）是部署变量非语义变量 [ROUND-2 04 §4 升级条件]。 |
| provider registry | in-process 解析 **MUST BE KERNEL**；durable inventory/health/lease **SHOULD NOT EXIST**（现无）| round-1 已警告不得称 control-plane registry [ROUND-1 EVIDENCE]；entry-point 三方加载已实现且有测试基线（135 passed 本轮复跑确认）。 |
| resource contracts | **MUST BE KERNEL** | `vendor.name@1` frozen dataclass + resolve 后 isinstance 校验是把"`main` 漂移"类 bug 变成不可表示的机制；contract 数量限制即最小 admission 面 **[REPOSITORY VERIFIED registry.py:14-15,86-99]**。 |
| （补充审判）legacy `request_dispatch` 免冻结构造意图 | **SHOULD NOT EXIST** | 它制造既无输入冻结又永久无法 governed-dispatch 的僵尸执行（INPUT 冻结检查之后必然抛 InputFrozen），并使 `list_input_refs` 的 contract_id 校验成为对历史行的永久地雷（repository.py:256-259 显式承认 legacy 行会炸）。合流后每一形态都可能踩到，必须删除。**[REPOSITORY VERIFIED services.py:71-83]** |
| （补充审判）assurance/admission 门控求值器、credential broker、scheduler/timer、DAG/Node/routing/retry、auto Work completion | **SHOULD NOT EXIST** | 全部为 round-1 禁令对象且四份 round-2 无一引入；policy engine 至多是 verdict 插点，求值外置 [ROUND-2 02 §4]。 |

交集结论：**约 12 项 MUST/OPTIONAL KERNEL 语义中，当前树完整实现的只有 execution/freeze/dispatch/ref/projection 这条窄 spine；词表、Finish 记录、selector provenance、lineage、ambiguous 态五项是共同缺口，且没有任何一项只服务于单一形态。**这是"同一 Kernel"命题最强的实证，也是"现在就叫 stable"最直接的反证。**[REPOSITORY VERIFIED + REASONED PROPOSAL]**

---

# Irreconcilable conflicts

逐条压力测试任务指定的九组冲突。判决三档：adapter-solvable（外围消化）/ mandatory-kernel-change（不改 Core 就别谈合流）/ irreconcilable-unless-scoped（只能靠收缩命题化解）。

| # | 冲突 | 判决 | 说明 |
|---|---|---|---|
| 1 | A 需要 Work，C/D 不需要 | **mandatory-kernel-change** | 除人人皆知的 NOT NULL 外键，本轮新发现第三处依赖：`create_execution` 的 INSERT..SELECT 强制"父 Work 必须 lifecycle=OPEN"，closed work 下连为历史补建尝试都不可能（repository.py:161-170 **[REPOSITORY VERIFIED]**）。三处一起改（可空 + 去 gate + scope 表达），语义即统一为可选聚合。注意：这不算"Kernel 迁就 A"，因为 02/03/04 都要求同等变更——它是四形态公共债务记在 A 头上了三年而已。 |
| 2 | embedded SDK 可由 Host 持久化 vs B 需要中央 durable identity | **irreconcilable-unless-scoped** | store=false 的纯值模式下，跨进程 finish/recovery/幂等防重全部失效（04 自己承认 capability loss）。合流命题原句"D 可由 Host 持久化"若照字面成立，则 D 形态放弃了 A/C 所必需的全部 durable 不变量——**这不是统一语义，是两种语义**。唯一诚实的化解：把 store-less 标注为 out-of-contract 退化模式（凭证不再可问责），Kernel 的持久化声明不做条件分支。命题措辞须修改。 |
| 3 | workflow node return vs Human explicit Finish | **mandatory-kernel-change** | 只要 Finish 记录不存在于 Kernel，两种闭合就会分叉成"C 的 node return 即 terminal"和"A 的 idle≠done"两套事实标准——现状正是种子：三个插件各自持有 submitted 位。解法是把 Finish ledger（actor/reason/时点/最后 observation 引用）列为 OPTIONAL KERNEL MODULE，让 node-return adapter 写 auto-settle actor、WorkBoard 写 human actor。不改此处，合流在第一次真实 settlement 处断裂。 |
| 4 | Host retry vs new Agent-Box Execution | **mandatory-kernel-change** | 两个硬缺口：(a) failed 状态不可重入——Temporal redelivery 会撞上"dispatch 存在但 failed"的静默返回（services.py:100-116 只查 key+digest 匹配就构造 StartRequest 返回，不重调 start、不报错 **[REPOSITORY VERIFIED]**）；adapter 无法区分 pending/failed/dead。(b) attempts/lineage 无表达位。retry 决策函数（same binding∧intent∧provider ⇒ 同 E attempts，否则新 E）四份 round-2 完全一致 [ROUND-2 EVIDENCE]，但它的执行需要状态机修正 + lineage 表达同时落地。 |
| 5 | Work complete vs external scope complete | adapter-solvable | 无自动跟随 + divergence 并陈即可；两套 lifecycle 并行合法，完成权在人与外部系统各自手里 [ROUND-2 01/02 共识]。唯一要求：不要试图在 Kernel 做 reconciliation 自动化（那是下一个滑坡）。 |
| 6 | local SDK history vs service-side immutable history | **irreconcilable-unless-scoped** | "不可改写历史"只有在单 store 族内可信；跨 store 身份合并/迁移在四个候选中都不存在于需求。合流命题应改写为 per-store-family 主张；全局可检索/抗篡改是显式升级条件（04 §4 触发器③④），不是 Kernel 现状属性。 |
| 7 | direct user Binding draft vs Host 自动 manifest | adapter-solvable（已成事实） | draft 是 WorkBoard 本地文件，从不在 freeze 前接触 Core **[REPOSITORY VERIFIED workboard README/drafts 设计 + ROUND-1 EVIDENCE]**。Host manifest 只是另一种 draft 来源。此项是九组冲突里唯一已经在实现层面消失的。 |
| 8 | Provider-owned recovery vs Kernel receipt | **mandatory-kernel-change** | receipt 说 accepted 而 handle 在死进程 dict 里（codex `_handles: dict[str, Handle]` 内存态 **[REPOSITORY VERIFIED provider.py:232-233]**）；tmux recover_handle 只救 accepted-with-inputs 子集。缺的是接囗契约而非灵感：Dispatch 状态机加 `ambiguous`（或等价 reconcile 协议）+ ExecutionProvider 协议加 recover 钩子声明。四个 round-2 各画了一份几乎相同的协议 [ROUND-2 EVIDENCE]，证明它属于公共语义。 |
| 9 | 不同 Host 对 evidence credibility 要求不同 | adapter-solvable，含一处 UNRESOLVED | 词表统一下沉（authority/method/disposition/coverage 列），attestation/policy engine 外置——02/04 立场一致。UNRESOLVED：候选 C 把 `expected_assurance.on_unmet=abort\|degrade_recorded\|proceed` 放进请求合同并由 pre-start rejection 执行 [ROUND-2 03 §2.1/§2.2]，02/04 坚持"求值外置、verdict 仅插点"[ROUND-2 02 §4, 04 §3.1]。两种立场都能自圆，但 abort 权限一旦进 Kernel 就是第二类 admission authority，回不了头。**留给第三轮后的试点数据裁决：是否存在真实 caller 需要在 start 前被 Machine 拒绝。** |

小结：九组冲突中 **0 组是不可调和的语义分裂**，但 **4 组（#1/#3/#4/#8）是"不改 Core 连谈都不能谈"的公共前置工程**。把"以后都可以做成插件"用在它们身上，等于把公共 Core 工作伪装成分散度工作。

---

# Pluginization red-team

最强攻击版本，不留折中。

## 攻击一：same-schema ≠ same-product，四个"包装"是四个互斥的产品

看 ownership matrix 最后一行：四个主要入口没有任何交集。A 的用户每天要打开一个 TUI 决定节奏；B 的用户在自己的 issue tracker 里点链接；C 的用户永远留在 Temporal Web；D 的用户否认存在任何界面。购买理由同样互斥：A 卖"治理节奏感"，B 卖"组织合同"，C 卖"高危节点的胶水省略"，D 卖"库的正确性"。同时宣称四种 buyer，意味着 roadmap 每一步都要向四种用户解释自己为什么长成了别人的样子——round-2 四份文档恰好给出了四个不同的第一迭代（S1 共享库+薄 adapter / SDK+langgraph extra / CLI 无主页 / WorkBoard 体验）。**[ROUND-2 EVIDENCE]** 同时支持它们 = 一个都没优先 = 用架构共识逃避市场选择。

## 攻击二：交集越验越薄，合流的终点是最低公分母

本轮审判筛出的 MUST-BE-KERNEL 清单，正是 round-1 七类替代方案能够廉价重写的那个子集（freeze/单派/idempotency/typed ref）。凡是能形成差异化的能力——assurance 门控、credential 版本 handle、coverage 对照呈现、interactive attach 体验——每加分一项都有三个形态喊"对我无用甚至有害"。理性终局：Kernel 保留 LCD 四件套，差异逻辑全部沉淀到四个 host 包里互相漂移，"一个 Kernel"萎缩成一个无人引用的内部库。反面终点同样存在：为了伺候全部 host，Kernel 吞下 Finish ledger + assurance 门控 + case 模块 + reconcile 引擎 + …，变成谁也不敢动的 framework。两条路线都通向合流叙事破产，区别只是胖死还是瘦死。**[REASONED PROPOSAL]**

## 攻击三："以后可以做成插件"是当前的反阻塞话术

统计口径：要让第二个形态真正跑起来所需的改动里，落点在 Kernel/协议层的比例是压倒性的——本轮确定的 11 项具体缺口（见 Current repository reality），除 WorkBoard 体验调整与 demo 素材两项外全部是 core/schema/plugin-interface 工程。这些工作量不会因为叫"多形态包装"而减少一分；合流口号的真实效果是把它们的排期无限顺延。口号不被戳穿的判定法很简单：90 天内核心 delta 清单交付了多少（kill criterion K3）。

## 攻击四：命题的现状句已经为假

> "Preview 使用 A 型 WorkBoard 体验，但 Core 不因此依赖 A。"

本轮在树上数出的 A-shape 依赖共四处：①`work_id NOT NULL ... ON DELETE RESTRICT`（004 迁移:17）；②execution 创建被父 Work 的 OPEN 态门禁（repository.py:161-170，含专门的 `WorkNotOpen` 错误类）；③explicit Finish 与 terminal 语义完全按交互插件的习惯塑形（tmux/codex/pi 三家都把"是否终局"做成 `submitted` 私有位；codex 甚至在 terminal 投影上印 `resumable_now=True`，provider.py:452）；④WorkBoard 的 chronicle/composer 读路径默认 world 由 Work 组织。合流若是描述句应删；作为目标句则应列出上面这张清欠表，而不是继续用作免检通行证。**[REPOSITORY VERIFIED]**

## 红队必须让步的部分（诚实义务）

结构主张无法抹杀：事务性冻结+mono-dispatch+digest 绑定+append-only events 在四形态的规范文本中逐字相同，而且确实带测试地活着（core 51 + plugins 84 passed 本轮复跑 **[REPOSITORY VERIFIED]**）；round-1 曾把这组不变量评为"实质性的、很多临时 launcher 会做错的"资产 [ROUND-1 EVIDENCE]。合流命题的错误不在"存在公共 Kernel"，而在两点：把"语义可共享"偷换成"四产品可并行追求"；把"应当收敛的 Core"说成"已经稳定的 Core"。上述攻击据此定向，不扩大打击面。

---

# Shared invariants

若合流维持，所有 Host 必须服从的共同不变量。每条给出在当前树的执行状态，并在 A/B/C/D 中搜索反例。

| # | 不变量 | 现树状态 | 反例搜索（哪个形态/场景会击穿它） |
|---|---|---|---|
| I1 | inputs 在 accepted Dispatch 前冻结 | **ENFORCED**，但 legacy `request_dispatch` 路径旁路冻结（生成无 inputs 的 Dispatch 行）**[REPOSITORY VERIFIED services.py:71-83]** | 反例：B 形态的旧脚本若沿用 legacy verb → 直接绕过全部治理承诺。处置：删除路径，无例外。 |
| I2 | accepted Dispatch 只有唯一 accountable Provider | **ENFORCED**（execution_id UNIQUE + 一 E 一 D + 单向状态机）| 未找到反例；LagGraph storm 重放也只能拿到既有 receipt。✅ |
| I3 | terminal 历史不可 reopen | **VIOLATED ×3**：update_projection 无 phase 单调守卫（terminal→active 可落库且 ended_at 逻辑错乱，services.py:292-303）；vertical-slice 测试断言 terminal 后可 resume；codex terminal 投影自带 resumable_now=True 靠 capability 缺席兜底 **[REPOSITORY VERIFIED]** | 击穿场景：A 用户干完在 board 上误触观察刷新 + provider 波动上报 active；D 宿主自建 fake provider 声明 resume capability 后重放旧 session。任一发生，sealed-E1 前提崩塌——这是 continuation 经济学的地基。 |
| I4 | continuation 必产生新 Execution | **NOT REPRESENTABLE**（无 lineage 字段；无 continuity 事件类型）| 击穿场景：C 形态 Continue-As-New/同 Thread 重启约定全靠 metadata 口头约定；audit 无法机械验证。需最小字段/事件 + resume 权限收缩（仅 ACTIVE-idle 态）。 |
| I5 | Provider terminal ≠ Human Finish ≠ Work completion | **PARTIAL**：三方分离在 Work 侧成立（complete_work 独立 **[REPOSITORY VERIFIED]**）；Human Finish 在 Kernel 无存在 | 击穿场景：C 形态图省事把 settlement 绑 provider terminal → fire-and-forget 化，正是 round-1 第 6 条事实禁止的方向。I3/I5 必须随 Finish ledger 一起落地才闭环。 |
| I6 | native identity 不替代 Execution identity | **ENFORCED**（refs 以 NATIVE relation 挂靠，exec_* 先于 start 存在）| 未找到结构性反例。风险仅在文档措辞（如把 thread_id 称作 execution）。✅ |
| I7 | projected 不得升级为 consumed | **VIOLATED-CAPABILITY**：`record_resource_state` 收任意 ≤256 非空串；fake 测试自行写 consumed 通过 **[REPOSITORY VERIFIED services.py:338-360, test_work_core_resource_observation.py 经 ROUND-1 审计确认]** | 击穿场景：D 形态第三方 adapter 诚实欠缺时写宽松字符串；A 形态 dashboard 无从拒绝渲染。这是四形态里最先在真实部署中爆雷的一条。 |
| I8 | Evidence 标 authority/method/coverage | **ABSENT**（事件 data 里只有 state 串 + 可选 artifact 定位；WorkBoard 硬编码 coverage unavailable）| 同 I7；且是 B/C 形态一切对外承诺（receipt 可信、report 分级）的直接前置。 |
| I9 | Host 不得让 Core 决定 next | **TRIVIALLY HOLDS**（无相关 API）| 保护条款：任何"recommended next execution"类查询接口都是违约。列入 conformance 测试即可。✅ |
| I10 | 插件不得修改既有历史语义 | **PARTIAL**：events append-only、dispatch 状态单向、frozen inputs 不可增删（无 UPDATE 语句触及 refs 表）；但 execution 行本体可被 update_projection/version 机制反复改写，work.metadata_json 可变 **[REPOSITORY VERIFIED repository.py:134-144,193-203]** | 击穿场景：管理员工具链借 update 通道"修正"历史 provenance/metadata。修补：对 CREATE 之后的不可变字段子集封 UPDATE，metadata 迁为事件附加。 |

十条中现树完全达标仅 3 条（I2/I6/I9），4 条带洞，3 条缺失。所谓"稳定 Kernel"的真实含义是：**以这份欠账清单结清为前提的承诺**。

---

# API pressure test

四个最小调用序列，全部使用当前真实签名核验，检验能否不加形态专属字段地命中同一组 Kernel API。

## A — WorkBoard direct interactive（今天可跑）

```python
repo   = CoreRepository()
works  = WorkService(repo); ex = ExecutionService(repo)
w      = works.create_work("调查 DSH 插件")                       # ✅ 今日
e      = ex.create_execution(w.id, "codex-tmux-interactive",
                             responsibility_intent="…")            # ✅ 今日
req    = ex.dispatch_execution(e.id, [(cid, ref), …], registry,
                                idempotency_key="…")                # ✅ 今日（先冻结后start）
obs    = provider.finish(handle)                                   # plugin 侧
ex.apply_observation(e.id, obs.projection, native_refs=obs.native_refs,
                     output_refs=obs.output_refs)                  # ✅ 今日
works.complete_work(w.id, reason="reviewed; unknowns listed")      # ✅ 今日
```
序列无需任何新字段即成立（live runbook 与测试双重证实）。**[REPOSITORY VERIFIED]**

## B — service API caller（基本可用，一处造假成本）

```python
w = works.create_work("<<goal-fabricated>>")                        # ⚠️ 断裂点 F1
e = ex.create_execution(w.id, provider_id="github-actions",
                        responsibility_intent="deploy verify")
ex.dispatch_execution(e.id, inputs=[(ci_contract, run_spec)], registry, key)
ex.observe_projection(e.id, projection_from_ci_adapter)
```
F1：caller 只想要一次有据部署，被迫捏造 objective。其余动词零分叉。**[REPOSITORY VERIFIED for signatures] / REASONED PROPOSAL for scenario**

## C — LangGraph/Temporal caller（今日不通过）

```python
e = ex.create_execution(scope=?, "codex-app-server", intent=…)      # ❌ F2: 无 scope 参数
req = ex.dispatch_execution(e.id, inputs, registry, key=tmporal_stable_key)
# Temporal redelivery after transient failure:
req2 = ex.dispatch_execution(e.id, same_inputs, registry, same_key) # ❌ F3: 若首次失败，
#     返回全新 StartRequest 但无人调用 provider.start、无异常、无记录 → replay 无法分辨
ex.cancel(e.id)                                                      # ❌ F4: 不存在
settlement = ex.settlement(e.id)                                     # ❌ F5: 不存在
gate = expected_assurance(on_unmet="abort")                          # ❌ F6: 无 admission 参数
```
六个断点中 F3 是必修级缺陷（静默成功假象），F4/F5/F6 属于公共模块增补，F2 即冲突 #1。

## D — embedded Host（接口贴合最好，两处部署摩擦）

```python
from agent_box.work_core import CoreRepository, …                    # ✅ 直接 import
ex.dispatch_execution(...)                                           # ✅
```
摩擦：F7 存储位置与连接管理绑定 `$AGENT_BOX_HOME` 布局的进程级假设，Host 想换存储布局需改 core.db 而非配置；F8 多 host_namespace 无隔离位（幂等键命名空间契约靠自觉）。

**结论**：happy-path 的六动词确实是公用的，四个序列无一需要在 `services.py` 加 if-分支；断裂全部发生在**参数面缺失（scope/assurance/settlement/cancel）与状态机缺陷（failed 静默）**上——这正是"语义可合流、现状不合格"的精确解剖。**[REPOSITORY VERIFIED + REASONED PROPOSAL]**

---

# Current repository reality

严格分层清单，特别警告：**round-2 的任何设计词汇都不是当前事实**。

已实现（本轮亲核）：Execution 先于 start 存在、`(contract_id,Ref)` 单事务冻结+digest+幂等（services/repository/006 迁移三层一致）；一 E 一 Dispatch；INPUT 冻结后禁增；append-only 事件账本（idempotency_key UNIQUE）；projection 冻结 dataclass；in-process registry + versioned frozen-dataclass contracts + entry-point 扩展装载；`$AGENT_BOX_HOME` 单 SQLite；006 迁移带 archive 表的历史兼容先例；资源 resolver（git/file/profile/tmux）+ dispatch 后 read-back 能力；codex app-server/tmux/pi 三套 provider 带 explicit-finish 与 artifact digest；工作核心测试基线 51 passed + 插件 84 passed（本轮复跑核实，与 round-1 数字一致）。

部分实现：resource-state 观察（自由串 ≤256，可附 ArtifactRef，按 ref identity+state 去重，但无词表）；dispatch crash 处理（仅 tmux recover_handle 覆盖 accepted-after-persist 子集）；旧 schema 历史行归档机制（pre_v006_archive）。

仅文档/从未存在：Binding revision/slot/validation 系统（ADR/设计稿级别）；Evidence reconciliation runtime；cancel；Settlement/human-finish aggregate；coverage 词表；attempts/continuation lineage 字段；scope_ref/external_scope 列；ambiguous 状态；reconcile_pending；assurance 门控参数。round-2 出现的 `ExecutionRequest/Receipt/Settlement/EvidenceClaim/InputManifest/governed_node/abx.*` 命令全部是**纸面 API**。**[REPOSITORY VERIFIED absence]**

八项特别检查结论表：

| 检查项 | 状态 | 关键证据 |
|---|---|---|
| Work 强制外键 | **实况比已知更严**：NOT NULL + ON DELETE RESTRICT + 父 OPEN 态插入门禁三重锁 | 004 迁移:17; repository.py:161-170 |
| terminal/resume | **负资产**：terminal 后 resume 被测试固化为期望行为；codex terminal 投影 resumable_now=True | vertical_slice.py:47-53; provider.py:450-453 |
| explicit Finish | Kernel 不存在；三插件私有 submitted 位各自实现 | provider/tmux/pi 各 finish() |
| evidence coverage | ABSENT + UI 硬编码 `coverage unavailable` | model.py:225 |
| crash window | ABSENT（generic）; requested→start→accepted 间崩溃无枚举判定程序 | 03 实现矩阵经 ROUND-1 + 本轮 services 复核 |
| provider handle recovery | PARTIAL：tmux accepted 子集；app-server dict 进程内存 | tmux_provider.recover_handle; provider.py:232 |
| persistence ownership | 单文件 SQLite 即 Kernel 的隐式所有权；store 家族边界从未明文 | src/agent_box/core/db 路径假定 |
| inputs provenance | ABSENT：selector 字符串不入库，digest 只盖精确 Ref 集 | _inputs_digest 规范 |

Anti-conflation 黑名单（本轮最常见的张冠李戴，写作"当前支持"即撒谎）：external_scope/scope_ref、可空 work_id、Finish ledger、disposition×coverage 受控词表、continuation_of、ambiguous、reconcile_pending、pre-start assurance rejection、abx CLI、LangGraph/Temporal adapters。

---

# Alternative architecture

以"合流修正案"为主选项的前提下，给出四个替代及其拆分成本/语义收益，均保留为**触发式后备**而非并行立项。

**Alt-0（推荐主线）修正版单一 Kernel**：执行上文 11 项欠账的最小子集——删除 legacy dispatch 路径与 OPEN 态门禁、work_id 可空+scope 表达、dispatch 状态机加 failed-replay 显式失败与 ambiguous 态、Finish ledger 模块、evidence 词表列、lineage/provenance 约定、provider 协议加 recover 声明。成本估算：全部为既有表的窄迁移与新事件类型，核心回归网 135 个测试可护住；预计小团队数周量级。收益：四形态获得同一个可辩护的合同层。其后 A/B/C/D 各自只剩包装工程。**[REASONED PROPOSAL]**

**Alt-1 两 Core 切分**：「Accountability Envelope Core」（freeze/dispatch/claims/receipt，现在即可独立发布）与「Governance Case Core」（Work/Case/drafts/console 演进室）分开仓库演进，后者 library 依赖前者。收益：A 型体验的爆炸半径被隔离，governance 侧行政语义的随意生长不再威胁 envelope 的稳定性承诺。成本：两包版本协调、共享 fixture 建设；对单人仓库现阶段是提前优化。触发条件：A 形态开始索要 Case/审批/participants 类扩张时立即执行。

**Alt-2 只留 SDK**（round-1 fallback 直达）：envelope 发布为库+CLI，WorkBoard 降 inspector，多形态之争消解为 reference-apps 集。收益最大诚实度、最小幻想成本；放弃全部平台级诉求。触发条件：K5/K7 同时命中。

**Alt-3 A 与 C 分协议**：WorkBoard 说 draft-composer 方言，substrate 说 request/receipt 方言，两层各自编译到 Alt-0 的同一组核心动词——注意这与 Alt-0 的差别只是「是否承认方言层的公开性」。把它单列的原因：如果 K8（API uniformity audit）失败，这是体面的第二次止损位，总好过在核心 services.py 里塞条件分支。

**Alt-4 只留 service**（dual-entry first）：从 receipt 中央化起步。不建议：daemon 未获任何 round 证据 [ROUND-1 EVIDENCE]，且 02 候选自己都把它设为 S1 之后的条件升级。

分割线总结：Alt-0 与 Alt-1 是互补关系（先 0 后 1 当 A 开始膨胀）；Alt-2/3/4 分别由不同 kill criteria 点火。不做的是：保持现状继续叠加形态。

---

# Kill criteria

≥8 条可验证条件，及命中时的归途。测量主体除非注明均为产品方自查+试点数据。

| # | 条件（可操作判定） | 命中后果 |
|---|---|---|
| K1 | **第二 Host 吸收失败**：在 Alt-0 delta 交付后的 10 人日内，第二个形态（建议 LangGraph adapter）未能仅靠声明的扩展点接入内核（需改动 core 语义或再加迁移），或新增 >200 行核心外 glue 之外还要动 services.py | 「必须拆分」→ 按 Alt-1/Alt-3 切分，合流叙事即时降格 |
| K2 | **Host 俘获 Kernel**：任何一个后续 PR 为迁就单一 Host 而放松 I1–I10 任一条（放松 terminal 单调性、放宽 input freeze、在核心加 next-API 等） | 「必须拆分」无条件触发，无需讨论——这是合流命题的自我伪造条款 |
| K3 | **插件化=拖延症实证**：Alt-0 欠账清单 90 天内未交付 ≥80% | 「必须选择单一产品形态」——公共工程都付不出钱，谈不上供养四个形态 |
| K4 | **崩溃确定性失败**：注入 kill -9 于 start 与 record_accepted 之间的演练中，tmux 与 app-server 两 adapter 的 reconcile 输出任一无法收敛为 accepted(recovered)/ambiguous 二值之一，或出现静默二次 start | 「必须降级 SDK」的诚实形态：撤回一切 durable/conformance 承诺，核心宣传收缩为 in-process 库 |
| K5 | **负载单一来源**：30 天试点窗口内 >70% Execution 来自同一 Host 族且无双并发 writer 出现 | 「必须选择单一产品形态」：multi-host 市场故事停止投资 |
| K6 | **Evidence 词表无人消费**：≥2 个对外导出器（PR 卡片/宿主 report/审计 export）均未实际渲染 authority×method×disposition 字段，或下游表示与读日志无差 | 「必须降级」：reconciliation 卖点撤回，Kernel 缩为 receipt bus（round-1 counterargument #1 的合流版复发信号） |
| K7 | **A 型体验无自主拉力**（承 round-2/01 K1）：关键决策动作 <2 次/周/用户持续两周 | A 降格 inspector；合流继续于 B/C/D 三形态——即整题滑入「只能支持其中两到三种形态」态 |
| K8 | **API uniformity audit 失败**：任一新形态接入过程中被发现必须在核心状态机中加入形态专属条件分支（if caller_type==…）才能工作 | 立即启用 Alt-3 方言协议层，「同一组 API」宣言作废 |
| K9 | **store 家族越界**：出现无 enterprise driver 背书的跨机器同步/共享服务器需求（用户自发的，非合规要求） | 若为合规/admission 驱动 → 按既有升级条件建 service（合流框架兼容）；若仅为便利渴求 → 强化 per-store 边界措辞，拒绝做 osmotic 服务化 |
| K10 | **上游原生化冲击**：LangGraph/Temporal/GitHub 任一方原生发布覆盖 freeze-manifest+idempotent-dispatch+typed-claims 且摩擦低于我们的集成路径 [ROUND-2 04 K6 的合流版] | 公共交集价值归零 → Alt-2 全面接管，只做品牌 thin layer 或退出 |

点火对照表：K1/K2/K8 → 拆分；K4/K6 → 降级；K3/K5/K7 → 单一形态选择（并决定哪种）；K9 分叉处理；K10 → 战略退出评估。**反向确认通道**：K3 按期清偿 + K1 通过 + 试点双形态 60 天共存而无 I1–I10 例外的，是「合流成立」所需的唯一直接正证据——在此之前，合流最多处于"未被反驳"状态。

---

# Final verdict

**B. 单一 Kernel、多 Host 形态基本成立，但必须删除/外移某些当前 Core 语义。**

裁决要点收拢：

1. **成立的部分是有实物担保的。** 四个互不通气的 round-2 候选收敛到同一份内核必改清单、同一个六动词 envelope、同一套不变量表述；核心的那半打 hard invariants（冻结原子性/单派/幂等/append-only）在带测试地产出中存活了三轮攻击。语义统一的架构判断被数据反复背书。**[ROUND-1/2 EVIDENCE + REPOSITORY VERIFIED]**
2. **不成立的部分同样有实物指控。** "stable"一词对现树为假：terminal-resume 被测试固化、legacy 免冻结通道存活、terminal→active 无守卫、fake-consumed 畅通、A 形态依赖三重锁未清。合流当前是一个**债务重组方案**，不是一个事实陈述。
3. **命题的修订文本应为**：「存在一个可以成为稳定 Kernel 的最小语义集（12 项判定见 True Kernel intersection）；四形态在该 Kernel 结清 11 项欠账之前不构成可交付的集合；Preview 的 A 型体验只是第一个客户而非引力中心。」 其中"不构成可交付的集合"由 K3（90 天清偿率）与 K1（第二 Host 10 日吸收）机械执法。
4. **对任务元问题的正面回答**：合流命题是否隐藏产品定位冲突？——**隐藏了一半，且是真的一半**。ontology 层的冲突（Work 是否强制、Finish 归谁、retry 语义）经得起审视并能被一组窄迁移消解；但四个候选给出的**主要入口、首发形态与买家画像互相矛盾**，这部分冲突不随 Kernel 统一而消失，只能由市场实验裁决（K5/K7 为其代理指标）。Kernel 共识的真实功能是让这场实验可以在同一具躯体上进行四次，而不是替公司免掉四次里的任何一次。
5. **给第四轮（若有）的唯一建议**：不要再审文档了。把 Alt-0 的 11 项欠账当一份 diff 去结，然后让 LangGraph adapter（最苛刻的第二 Host）与 WorkBoard 并行开火——所有剩余的哲学分歧会在第一周 code review 里比三轮纸上辩论暴露得更多。

*本报告未读取其他 round-3 输出；未修改任何代码；未执行 Git 操作。*
