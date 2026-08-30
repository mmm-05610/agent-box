# Round 4 · Post-run Evidence Reconciliation 的最小 Core 设计

日期 **2026-08-27**。工作目录 `/home/maoqh/projects/agent-box`，分支 `spike/real-governed-binding`。

本轮不讨论产品定位。任务是为 round-3 已定案的 Execution Kernel（K1–K5）设计一个**最小、通用、不泄漏外部产品语义**的 post-run Evidence reconciliation 协议。所有结论基于本轮亲自核对的代码、迁移、测试，以及前三轮已定案文档。

已读输入：round-3 `01-single-kernel-multi-host-red-team.md`（本系列前作）、`03-kernel-substitution-and-package-boundary.md`、`04-preview-a-evidence-falsification.md`、[ADR-0006](../../../adr/0006-resource-contract-input-protocol.md)；代码核对范围：`work_core` 全模块（models/services/repository/registry/events/projection/errors）、`resource_contracts/` 三个契约文件、迁移 001–006、以及指定的三个测试文件（本轮实跑：`test_work_core_input_dispatch.py` + `test_work_core_resource_observation.py` + `test_work_core_real_resource_providers.py` → **12 passed in 1.34s**）。未读取任何其他 round-4 输出；未修改代码；未执行 Git 操作。

标签：

| 标签 | 含义 |
|---|---|
| **IMPLEMENTED / PARTIAL / ABSENT** | 第 1 节实现审计专用三档 |
| **REPOSITORY VERIFIED** | 本轮亲自打开源码/迁移/测试核对（附文件行号） |
| **ROUND-1/3 EVIDENCE** | 前几轮验证报告与 ADR 已确立的结论 |
| **REASONED PROPOSAL** | 本设计主张，未经实现 |
| **UNRESOLVED** | 无法在现有证据下裁决，显式移交 |

## 接受的本轮硬约束（题设背景）

1. Binding = frozen `(contract_id, Ref)` association；ADR-0006 明文："不新增 Binding 实体、表、revision、slot 或 ExecutionInput model" **[ROUND-1/3 EVIDENCE]**。
2. 当前观察通道是自由字符串 state ≤256 + 可选 ArtifactRef，走 `apply_observation(..., resource_states=())`。
3. Provider 拥有可靠观察方法；Core 不推断 Harness 是否真正使用了资源。
4. 不新增 ResourceFact/Evidence/BindingSlot 等 Core entity，**除非先证明现有 association/event/table 无法表达**——第 1、4 节将给出这条证明。
5. 不引入 workflow、business verdict、policy engine、tracing backend、attestation platform。
6. secret value、raw credential、完整 transcript 不进 Core。
7. provider self-report / projection / external authority read-back 必须可区分。
8. projected ≠ consumed；日志缺失不代表 negative evidence。

---

# Executive verdict

**判词（详细理由见文末 #Final verdict）：C —— 需要一张专用的 append-only claim 表。**

三个支撑判断，每一个都是本轮实核结论而非偏好：

1. **现有两个持久位置都被证伪为"无法表达"。**
   - `core_execution_refs` 对同 identity Ref 使用 `INSERT OR IGNORE`（repository.py:230-237），同一资源在两个时刻的两次观察**物理上只能存在一行**——时间序列性被存储结构排除；
   - 观察事件必须穿过 `CoreEvent` 的有界元数据合同：≤16 个键、每值 ≤256 字符（models.py:12-14，`_bounded_metadata` 在 events.py:40-43 强制）。一条完整的 claim 需要 ≥13 个字段（predicate/disposition/coverage/issuer_class/issuer/method/observed_at/valid_at/evidence 定位符/detail/……），**放不下**；放宽全局上限会改动全部事件生产者与消费者共用的不变量——那个代价比一张新表大得多。约束 #4 要求的"先证明无法表达"，在这里是机械算术，不是审美偏好。**[REPOSITORY VERIFIED]**
2. **仓库已有同类晋升的先例与判据。** 当 Dispatch 事实（inputs_digest、provider correlation）超出 refs+event 信封时，006 迁移把它们晋升为专用 `core_dispatches` 表并归档旧行。Post-run evidence 正处于同一种状态：它已经是被追加的事实记录，只是以无类型字符串寄居在通用事件里。**[REPOSITORY VERIFIED 迁移 006；REASONED PROPOSAL 类比成立]**
3. **三方证据收敛于同一个缺口。** round-3/03 把 "Typed EvidenceClaim 与 reconcile 词表" 列入不可约 Kernel K4 并点名 free-string state 是敌意插件可写任意证据的现状漏洞；round-3/04 实测 WorkBoard Evidence 页是计数器（`coverage="coverage unavailable"` 硬编码 model.py:225），并把"resource_state 迁往受控词表+authority/method 字段"列为 v1 产品需求。round-1 技术审计将 Evidence reconciliation 定为主要差异化与最弱实现。本设计即该缺口的收口方案。**[ROUND-1/3 EVIDENCE]**

与本设计的两条红线纪律：(a) claim 表不是新的领域实体——它没有业务生命周期、没有进 services 层的聚合根身份，它是**既有观察通道的类型化重铸**；(b) 所有比较语义（Git HEAD 相等与否、CI SHA 匹配与否）留在 adapter，Core 只做结构校验与确定性汇总。projected ≠ consumed 的分界被做成**类型系统规则**而不是文档道德：只有 `observed` 谓词的 claim 才允许写 conformant/divergent。

---

# Current implementation

逐项回答任务指定问题。标注 IMPLEMENTED / PARTIAL / ABSENT。

| 问题 | 答案 | 标注 | 依据 |
|---|---|---|---|
| frozen input 怎样存储 | `core_execution_refs` 行（relation='input'），由 `create_dispatch_with_inputs()` 在创建 Dispatch 的**同一事务**内写入；之后 INPUT relation 被 `attach_ref` 的守卫拒绝新增（`InputFrozen`） | **IMPLEMENTED** | repository.py:287-331, 205-238; test_input_dispatch.py:149-172 |
| contract_id 在哪里 | 同表的 `contract_id` 列（006 迁移新增）；legacy 行为 NULL 且读取时会抛 `WorkCoreError("legacy input association has no contract_id")`；NATIVE/OUTPUT 关系不使用它 | **IMPLEMENTED** | 006 迁移；repository.py:246-272 |
| resource state 怎样持久化 | 作为 `EXECUTION_PROJECTION_CHANGED` 类型事件的 data 字段：`{observation_kind:"resource", ref_type/provider/native_id[,uri][,metadata], ref_identity_digest, resource_state(≤256), 可选 evidence_type/provider/native_id[,uri]}`。无任何独立列或表 | **IMPLEMENTED（弱形态）** | services.py:314-379（apply_observation→record_resource_state）; repository.py:404-485 |
| CoreEvent 怎样保存 | `core_events(id, subject_id, type, occurred_at ISO text, data_json(sorted-keys dump), idempotency_key TEXT UNIQUE)`；全模块对 events 只有 `_append_event` 一条 INSERT 路径，无 UPDATE/DELETE | **IMPLEMENTED** | 004 迁移:46-53; repository.py:495-497 |
| ArtifactRef 怎样关联 | 作为三元组 `(ref, state, artifact_ref)` 的第三项传入；落库为事件 data 里的**裸定位符字段**（evidence_type/provider/native_id/uri），既不是 refs 表行也没有 FK。目标 artifact 通常由 provider 在 finish 流程另行作为 OUTPUT ref 附着——两个引用之间没有任何一致性检查 | **PARTIAL**（能定位、无完整性关联） | repository.py:457-474; codex/tmux provider finish 流程 |
| 是否有独立 observation table | 无。唯一例外形状是 `core_dispatches`（Dispatch receipt 有自己的表），resource observation 没有对应物 | **ABSENT** | 迁移目录全量核对 |
| state 是覆盖还是 append | **append**：相同 (ref identity, state) 重复提交返回 False 不产事件；不同 state 追加新事件。"latest" 判定靠每次新提交时**线性扫描该 execution 全部 PROJECTION_CHANGED 事件**找同 ref 最新值（repository.py:435-455 的 O(n) 循环） | **IMPLEMENTED（含性能债）** | test_work_core_resource_observation.py:57-73 钉死此语义 |
| contradictory observations 如何表现 | 两条不同 state 自然共存于事件流（历史保真），但**没有任何机制把冲突计算出来**：无 issuer 概念所以无从比较权威级；UI 只渲染计数。一个 fake 插件先写 "projected" 再写 "consumed"，两者的差异在任何视图上都不可见 | **PARTIAL**（数据保真、认知为零） | services/tests 与 board 渲染路径核对 |
| 当前 UI 能查询到什么 | chronicle 卡片（projection phase/outcome、dispatch 状态、ref 计数）、按关系枚举 refs（list_refs/list_input_refs）、evidence modal 只列 refs 数量并渲染硬编码 `coverage="coverage unavailable"`（model.py:225）；resource_observation_count 只是数了写了多少条 | **PARTIAL** | round-3/04 §Evidence inventory 实测 + model.py/app.py 引用 |
| 哪些只是文档设计 | requested-selector provenance、disposition×coverage 词表、reconciler runtime、六档证据呈现、divergent 作为一等 disposition（现只能是 error message 文本）、slot-purpose 寻址、CredentialRef、CI/GitHub/MCP 观察——全部 DOCUMENTED ONLY | **ABSENT** | round-3/04 P1/P2 ledger + round-2 各候选设计稿 |

审计补充三条对本设计直接构成约束的细节：

- **注册表中的契约目录已收缩到三个**：`resource_contracts/` 只有 workspace_v1 / prompt_fragment_v1 / agent_box_profile_v1，CodexContinuationV1 已外移至 codex 插件包（符合 ADR-0007 第三方模式）。claim 词表不得绑定任何具体 contract id。**[REPOSITORY VERIFIED ls + registry import]**
- **pre-start refusal 是现存最硬的对账行为**：四类 resolver 的漂移都会让 dispatch failed 且错误文本可断言（`match="differs"` 等三个测试锚点）。本设计的 divergent vocabulary 必须能把这条今天只存在于错误字符串里的事实升格为一等数据。**[REPOSITORY VERIFIED test_work_core_real_resource_providers.py:59,81]**
- **`record_resource_state` 的"非 fixed INPUT 即拒"守卫已经存在且有测试**（match="fixed INPUT"）。claim 表沿用同一身份匹配规则即可继承这层防伪。**[REPOSITORY VERIFIED test_work_core_resource_observation.py:76-84]**

---

# Required queries

先定义查询，再决定结构。十条查询各自给出"当前数据形态能否回答"判定。

| # | 查询 | 今天能答吗 | 决定的结构要求 |
|---|---|---|---|
| Q1 | 这次 Execution 冻结了哪些 input | ✅ list_input_refs | 无新要求（join 左表已有） |
| Q2 | 哪些被 Provider 投影 | ❌ state 是自由串，"projected" 无受控含义 | predicate 维度 |
| Q3 | 哪些被 runtime/materialization read-back | ❌ 同上；且 read-back 发生在哪里（worktree HEAD? 文件 digest?）无处安放 | predicate=observed + issuer_class=process_observation + method |
| Q4 | 哪些由外部 authority 验证 | ❌ 无 authority 维度 | issuer_class=external_authority + method + detail 双值引述 |
| Q5 | 哪些只有 Provider self-report | ❌ | issuer_class=provider_self_report 单一来源判定 |
| Q6 | 哪些出现 mismatch | ⚠️ 仅 pre-start 场景且以 error 文本存在；post-run mismatch 无表达 | disposition=divergent 成为一等数据 |
| Q7 | 哪些无法观察 | ❌ 无 distinction between 未尝试 vs 结构不可行 | coverage=none 与 unverifiable 分立 |
| Q8 | 哪些 observation 已过期 | ❌ 无观察时间戳（occurred_at≈ingest 时间，但事实何时成立不可知） | observed_at + valid_at 两轴 |
| Q9 | 哪个 Evidence Artifact 支持某声明 | ⚠️ 定位符在事件 data 里，无 join 键，无法反查 | evidence_ref 列 + (execution, ref) 外键式关联 |
| Q10 | 两个 authority 给出矛盾事实如何展示 | ❌ 连冲突都检测不到 | 多 claim 共存 + 确定性冲突规则 |

**结构结论（词汇之前）**：Q2–Q10 九问共同要求的字段集合是 {谓词, 权威类, issuer, method, 两个时间戳, 比较结果, 覆盖声明, 定位符, 双值引述}。这个集合在现有信封里放不下（见 Executive verdict 第 1 条），因此查询需求本身已经完成了方案选择的大部分论证。**[REASONED PROPOSAL]**

---

# Minimal vocabulary

严格三分维度，绝不合并为一个 enum；每个保留词给出生存理由，每个删除词给出删除证据。

## 维度 A：predicate（这次断言的主张是什么）

候选词审判：

| 候选 | 判决 | 理由 |
|---|---|---|
| resolved/frozen | **剔除** | 这是 Binding 侧事实，已经被 frozen inputs + inputs_digest 持久地表达了。把它再做一遍 claim，会让 reconcile 变成"冻结因为冻结"的同义反复，且挤占 slot-provenance 的未来位置（那是另一个未定案的增量，不能从这里后门进来）**[ROUND-1/3 EVIDENCE 禁令一致]** |
| projected | **保留** | E2/D1：bytes/ref 已进入执行可见面。对应 Q2。防升级规则见维度 B |
| materialized/visible | **并入 `observed`，剔除原词** | "materialize" 在 git provider 里已被用作 worktree 创建动词，语义撞车；"visible" 是拟人化措辞。read-back 读到的实质就是 substrate 的状态，统一为 `observed` 减少一词多义 |
| observed | **保留（吸收 read-back/materialized）** | 覆盖 process_observation 与 external_authority 两种来源——来源差异交维度 C 不污染谓词 |
| provider-reported-consumed | **改造为 `consumed_reported`** | 原 named 过长且把来源混进主张名；来源已由 issuer_class 表达。该谓词天生仅限 self-report（类型规则强制，见 Provider API 一节） |
| produced | **保留** | diff/test/artifact 等产物归属于哪个输入槽，需要能与 expected 对账的原语；否则 produced facts 只能漂浮在 OUTPUT refs 里无从质证 |

最终 A 轴 = `{projected, observed, consumed_reported, produced}` 四值。

## 维度 B：disposition（比较的结论）

| 候选 | 判决 | 反例驱动 |
|---|---|---|
| conformant | **保留** | profile byte-digest 复核相等这类真实发生的成功比较需要名字；没有它 verified 子集无处安身 |
| divergent | **保留并升格** | 今天 divergent 只能以 error 文本形式存在（"differs from frozen ProfileRef"），CI head_sha≠frozen 这类最有教学价值的 post-run divergence 完全无处落地 **[ROUND-3/4 EVIDENCE §divergence fixture]** |
| unknown | **保留** | 尚未尝试/尚无结论。与 unverifiable 的修复路径不同（见下） |
| unverifiable | **保留、窄定义** | = 结构上不存在 Core 可寻址的任何观察面（例：模型语义 attention、credential 的实际消费版本 **[ROUND-1 EVIDENCE real-provider matrix]**）。unknown 是"能查没查"（待补 CI 回读）；unverifiable 是"没法定义怎么查"。混淆二者会把永久空洞伪装成 TODO |
| not_applicable | **v1 剔除** | claim 只能附着于 frozen INPUT（复用现有 fixed-INPUT 守卫），而任何被冻结的资源都已" applicable"。找不到真实反例。枚举按开放数值扩展留门，出现首个真实场景再加 |

## 维度 C：coverage（观察面大小）

| 候选 | 判决 | 理由 |
|---|---|---|
| complete | **保留、更名风险标注** | 参照 round-1 的 C1 概念，它的可信前提是伴随窗口/观察面声明。为了不让 "complete" 被读成绝对宣称，规则：coverage∈{complete} 时 companion 字段 `coverage_note`(≤256) **必填**，用一句话划界（"tracked files only, at T_valid"） |
| partial | **保留** | scrollback ≤64KiB 截获即天然例子（现有 metadata 已标 partial-scrollback **[REPOSITORY VERIFIED tmux_provider._artifact_ref]**） |
| unknown | **保留** | 覆盖度未知与结论未知（B 轴 unknown）正交：可以"观察到了结论 conformant 但不知道看全了没有" |
| none / unavailable | **保留事实、改名 `none`** | 现役字符串 "coverage unavailable" 读起来像系统故障（也确实一直是谎话 **[ROUND-3/4 EVIDENCE model.py:225]**）；`none` 平铺直叙"没有任何观察覆盖"。改名是一次性偿债 |

负向声明门槛自动生效：`"没有使用额外 MCP"` 这类 negative claim 必须 coverage=complete + 完整观察面声明才可能成立，而今天的任何插件都无法满足该前提——这正是 round-1 约束 #8 要的结构性保证，不需要 Core 理解 MCP。**[REASONED PROPOSAL 基于 ROUND-1/3 EVIDENCE]**

## 字段清单（每个都有"不存就无法正确回答"的反例，否则已删）

| 字段 | 判决 | 不存会答不出的问题（反例） |
|---|---|---|
| ref subject（frozen INPUT 身份五元组） | **必填** | Q1–Q10 全部失去左连接键；防伪守卫失效（任意 Ref 都能挂 claim） |
| predicate | **必填** | Q2/Q3/Q4/Q5 合并成一个桶——这正是今天 state 字符串的谎言面 |
| disposition | **必填** | Q6 塌方：divergent 永远沉底为 error 字符串 |
| coverage (+coverage_note 规则) | **必填** | Q7 塌方：partial-scrollback 与完整回放不可区分 |
| issuer_class ∈ {provider_self_report, process_observation, external_authority, host_observation} | **必填** | 约束 #7 直接失守：profile "加载成功" 这类自报会被渲染成外部验证过的事实 |
| issuer（具体身份串 ≤64，adapter descriptor.id 或子标识） | **必填** | 同类两源无法区分（runner rev-parse vs gh api），追责/复跑定位失败 |
| method（≤64，issuer 名空间内的短 token，如 `rev-parse-head^{commit}`） | **必填** | 重放某个验证步骤失败：审计者知道谁说的却不知道怎么验证 |
| observed_at | **必填** | Q8 塌方；也不可能与 occurred_at（入库时刻）混用——迟到 claim（崩溃恢复后补录）两者差数小时 |
| valid_at（nullable，默认=observed_at） | **必填（可空）** | "快照时 worktree HEAD==C" 与 "finish 后才发现 dirty" 无法区分真伪先后；stale 数学（superseded vs aged-out）失效 |
| evidence_ref（ArtifactRef locator） | **必填（可空）** | Q9 塌方：scrollback/sha256 断言与其支持对象脱钩（今天已是如此） |
| detail（≤256） | **必填（可空、allow-empty-for-non-divergent）** | divergent without values 不可用："head_sha=d39…≠frozen c81…" 必须能被逐字引述——这是 human reviewer 的行动依据 |
| ~~integrity digest~~ | **删除** | 由机械规则替代并强化：claims 的 evidence_ref 若提供，其 native_id 必须匹配 `sha256:[0-9a-f]{64}`（现有实践早已如此 **[REPOSITORY VERIFIED codex provider sha256 用法]**）——独立 integrity 字段制造第二个真相源，0 新增答案 |
| ~~confidence / assurance~~ | **删除** | 十个必需查询无一引用主观分数；round-1 已警告证据强度不是单轴序 **[ROUND-1 EVIDENCE]**；分数只会诱发 UI 打勾剧场 |
| ~~slot_purpose / slot_id~~ | **删除** | 多份同 contract 输入（两份 PromptFragmentV1）用完整 ref 五元组身份寻址即可精确区分（identity addressing 与 dispatch 的 canonical 化同一套规则）；引入 slot 又一轮 ADR-0006 明令禁止的对象。残余限制如实记录：未来 CredentialRef 类"同名多版本"场景若证明不够，另开论证 **[UNRESOLVED]**

维度互斥规则（做成构造期校验，fake 插件钻不过去）：

```text
predicate == observed             ⇒ disposition ∈ {conformant, divergent, unknown, unverifiable}
predicate != observed             ⇒ disposition == unknown          （自报永远产生不了“已证实”）
disposition ∈ {conformant, divergent} ⇒ coverage_note 必填 ∧ valid_at 必填
issuer_class == external_authority    ⇒ method 必填 ∧ detail 必填 ∧ predicate == observed
issuer_class == provider_self_report ∧ predicate == observed ⇒ 拒绝（角色错位）
```

最后一条是最重要的边界句：**说"实际发生了什么"和"我使用了什么"必须是两个 API 角色**。Provider 可以报告自己的投影与消费主张（self_report 谓词），但只有独立的观察者来源才能宣称 conformant/divergent。这一条直接把 round-3 点名的 "fake adapter 写 consumed" 从许可问题变成 ValueError。

---

# Implementation alternatives

三方案比较（schema / append-only / 查询 / 冲突 / 版本兼容 / 迁移 / Provider API / WorkBoard / 测试 / 是否形成新 entity）。

## 方案 A：收紧现有 resource_states 字符串协议

把 state 升格为保留语法 `"disp:cov:method:<free>"`，Core 校验前缀。

- schema：零 DDL。
- append-only：继承（现状即 append）。
- 查询：Q4/Q8/Q9/Q10 系统性失败——issuer、双时间戳、artifact 关联、双 authority 冲突没有语法扩展能装下而不变成 CSV-with-colons；SQLite 端要么 LIKE 全扫要么 json_extract 一个"其实我是行的字符串"。
- 冲突：语法纠错的报错信息必然指向格式而非语义（"missing 3rd segment"），插件的调试体验恶劣。
- 版本兼容：每加一个字段改一次语法 = 全体 plugin 破坏性联动。
- 结论：**方向对、载体错**。它实际上是在贫瘠容器里重新发明列，还会顺手发明一门小语言。剔除。**[REASONED PROPOSAL]**

## 方案 B：新增 frozen value object，仍落到现有 event/association

设计 ResourceObservation VO（下面 C 案同款），序列化塞进 `EXECUTION_PROJECTION_CHANGED.data_json` 或作为新事件类型的 data。

致命验算：CoreEvent.data 经 `_bounded_metadata` 校验 ≤16 键 × ≤256 值。清点 claim 最小字段集：subject 三元组展开(ref_type/ref_provider/ref_native_id) + predicate + disposition + coverage + coverage_note + issuer_class + issuer + method + observed_at + valid_at + detail + evidence 四元组(evidence_type/provider/native_id[/uri]) ≈ **15–18 键，且 uri/detail 等长值贴着 256 上限**。要合法就必须：
(i) 放宽 MAX_METADATA_*——这是**全体**事件共享的不变量，改一个数字牵动每个生产者/消费者与既有测试断言，还削弱了对任意事件 payload 的膨胀防线；或者
(ii) 一个 claim 拆多条事件——原子性死亡，半条 claim 是比无 claim 更危险的账目。

即便放宽成功：查询仍需全事件扫描聚合（现状 `record_resource_state` 已经在每次提交时线性扫描全部历史事件找 latest——repository.py:435-455， claim 数量增长后这里是复利债）；SQLite 端无索引可用；冲突计算同样无落地结构。

- 新 entity 判定：号称不加，实际上是把一张窄表的 12 个列改造成散落在 JSON blob 里的约定。**零迁移是幻觉，结构劣化是真。**
- 结论：**VO 保留（进入 C 案），载体否决**。约束 #4 的"除非证明无法表达"在 (i)(ii) 处闭合。**[REPOSITORY VERIFIED 尺寸验算]**

## 方案 C：专用 claim 表（选中）

`core_resource_claims` append-only 表承载 VO；伴随**slim event**（新 EventType `RESOURCE_CLAIM_RECORDED`，data 只放 {claim_row_id, ref_identity_digest, disposition, coverage} ≈4 键——完全在现有信封内）保持事件流消费者的连续性（chronicle 渲染、既有 `_same_projection_semantics` 去重逻辑不受干扰）。

| 比较轴 | 表现 |
|---|---|
| schema | 一张新表 + 一个 enum 扩展 + 索引（DDL 见 #Persistence and migration）；不动任何现有表一行 |
| append-only | INSERT-only by design：repository 不提供任何 UPDATE/DELETE 路径；测试以 grep 断言模块中无 claim UPDATE 语句。更正=新 claim 行；撤销不在 v1（UNRESOLVED 移交） |
| 查询 | (execution_id, ref_identity_digest, seq DESC) 走索引；per-slot latest、per-issuer-class latest 都是 O(log n) 取头；aggregate view 一次扫描建成 |
| 冲突 | 表结构天然支持任意多个同主题 claim 共存 → 冲突成为派生计算而非存储难题（规则见下一节） |
| 版本兼容 | 受控 enum 采用开放整数值（未知值向读者降级显示为 unknown，绝不抛错——三方 plugin 与 core 升级时间解耦）；canonical 序列化带 schema_version 前缀纳入 claim_digest 计算 |
| 迁移 | 007 号纯 CREATE；**零回填**（理由见迁移节） |
| Provider API | apply_observation 增加关键字参数，旧参数 shim 保留至 Preview 结束（详见 #Provider API） |
| WorkBoard | model.py 的硬编码 coverage 行替换为 aggregate view 直读；卡片规则见 #WorkBoard projection |
| 测试 | 12 passed 基线全部保持绿（现存 resource-state 语义测试原样通过）；新增矩阵见 #Test matrix |
| 是否形成新 Core entity | **形式上是表，语义上不是**：无生命周期状态机、无 id 对外的聚合根操作、services 只暴露 append/list/reconcile 三个动作——与 core_dispatches 的地位完全对称。ADR-0006 的禁令条款所防御的是"Binding/Slot/Fact 实体化"；一张为既有可能性(observations)提供的类型化存储不在此列，且其正当性由上一节的无法表达证明书背书 **[REASONED PROPOSAL，判词依据链]**

默认倾向最小改动的前提在此处的正确应用是：A/B 的"少改"是以牺牲 Q4/Q8/Q9/Q10 四个问题的可回答性与既有事件信封的完整性和为代价的——**因少改代码牺牲语义正确性，正是任务禁止的方向**。

---

# Responsibility boundary

严格四层分工；Core 不理解 Git HEAD、MCP call、credential、LangGraph checkpoint 的具体语义。

## Core（agent_box.work_core）

1. **关联**：claim 只能挂在本 Execution 的 frozen `(contract_id, Ref)` 身份上（沿用现有 identity-matching 与 "fixed INPUT" 拒绝语义——test 已钉死的行为平移到 claims 入口）；
2. **校验**：enum 合法性 + 维度互斥规则 + 尺寸上限 + evidence_ref 形状（sha256 格式机械校验）。全部是**结构与代数**检查，零领域知识；
3. **持久化 provenance**：append-only 行 + slim 事件；幂等（claim_digest UNIQUE）；
4. **确定性汇总**：给定 claims 集合，输出 per-slot 视图（规则见下节）。同样的输入永远得到同样的输出——reconcile 是纯函数，不是引擎；
5. **展示 unknown/conflict/stale 的原始材料**： Core 提供 last-write 时点与 supersession 事实；"过期阈值"是 Host/UI 参数（例如 board 默认 >24h 标灰），Core 不定政策。

Core 明确不做：推断消费、理解任何资源语义、评价 issuer 诚实度、发出 negative conclusion、把 disposition 汇总成 pass/fail 总分、从 evidence 推动下一步。

## ResourceProvider / contract adapter

- **怎样 read-back**：拥有 read-back 的全部知识（rev-parse 何物、API endpoint 怎么调、digest 怎么算）。产出 claim 的 method/issuer/detail 由它负责填；
- **怎样比较 external value**：expected 值来自 resolve 时返回的 contract 对象（adapter 自己持有），actual 来自第二次 read-back；比较在自己的进程内完成后把结论装进 disposition——“比较发生在 adapter 的地盘”是 Core 不懂 Git 的机制保障；
- **怎样判断 coverage**：声明自己看了什么面（哪些文件、哪个 API 字段、多久窗口）。only the observer knows its own blindness；
- **怎样生成 evidence artifact**：捕获 bytes → sha256 → 存文件（自己的 evidence root）→ ArtifactRef(native_id="sha256:<hex>")。Core 只见 locator；
- **哪些 claim 可被信任**：adapter 不能自封信任级。issuer_class 声明是被记录的**申报**，board 按"external_authority 但无 evidence_ref"降权渲染（amber 角标）。残余风险如实承认：恶意 adapter 谎称 issuer_class 在 v1 结构内无法根治——这与 round-3 定下的 gateway-not-police 立场一致，实质防线是 conformance 语料与 review。**[REASONED PROPOSAL；残余风险 REQUIRES USER VALIDATION for threat model]**

## ExecutionProvider

- provider-owned runtime observation：turn/session/tool 事件流仍是它的领地（codex JSONL、tmux hook）；
- native session facts：Thread/Turn RunRefs 继续走 NATIVE relation（不是 claim——session 身份不是资源状态）；
- projection facts：ACTIVE/idle/terminal 继续走 observe_projection（不是 claim——投影是执行态不是资源态）。**红线：ExecutionProvider 不得借 apply_observation 把运行时叙事伪装成资源 claim**；
- finish 时采集：scrollback/session artifact 沿用现有流程，产物以 evidence_ref 形式被后续 claim 引用。

## Host/UI（WorkBoard、CLI、未来 IDE panel）

- 选择展示粒度与排序（哪些槽置顶、unknown 折叠策略）；
- 要求重新观察（触发 adapter 再跑一次 read-back —— 这是新的观察请求，产生的永远是新 claim，不改旧 claim）；
- 用户确认动作（人看过 evidence 后 complete work 等）发生在既有治理动词上，与 claim 层无关；
- **永不改变历史**：UI 没有 claim 编辑入口；连"撤销"都没有（v1 无 withdraw 的一致决定）。

---

# Claim and aggregate model

## raw claim（append-only）

```python
@dataclass(frozen=True)
class ResourceObservation:
    ref: Ref                                    # 必须命中 frozen INPUT identity
    predicate: Predicate                        # projected | observed | consumed_reported | produced
    disposition: Disposition                    # conformant | divergent | unknown | unverifiable
    coverage: Coverage                          # complete | partial | unknown | none
    issuer_class: IssuerClass                   # 见四值
    issuer: str                                 # ≤64
    method: str | None                          # ≤64；条件必填见互斥规则
    observed_at: datetime                       # 事实成立于/被读取于
    valid_at: datetime | None                   # 默认=observed_at
    detail: str | None                          # ≤256；条件必填
    evidence_ref: Ref | None                    # ARTIFACT，native_id 需 sha256 形
```

互斥规则在 `__post_init__` 构造期强制（上文代码块）——**非法组合连实例都造不出来**，Core 端二次校验属于纵深防御。

## derived current reconciliation view（纯函数派生，物化可选）

`reconciliation_view(execution_id)` 按槽（ref identity）聚合：

1. 每个 (slot, issuer_class) 取最新有效 claim（按 valid_at, observed_at, seq 排序取头）；
2. **effective_disposition** per slot = 各 issuer_class 最新结论按保守优先级归并：`divergent > unverifiable > unknown > conformant`。直觉：最坏的可靠结论代表槽位的诚实状态；conformant 只有在没有任何更高优先级结论时胜出——**provider 自报永远覆盖不掉一次真实的 divergent**；
3. **conflict flag**：≥2 个 issuer_class 的最新结论分属不同值 → 该槽标 conflicted，并列出双方 claim_row_id。无裁决器：Core 并排陈列，Trust 排序（比如 external_authority > provider_self_report）是**展示层策略**，Core 输出按 class 分组的原始矩阵；
4. **staleness 材料**：每槽输出 newest_valid_at/newest_observed_at + 是否被更新 claim superseded；"够不够旧"的阈值留给 Host；
5. **legacy 区块**：只在资源曾走过旧 `resource_states` 通道而无 typed claim 时合成一行灰条（predicate=—, disposition=unknown, coverage=none, issuer=留空的 synthetic 标记）。合成行不落库，属读侧投影。

## 具体行为裁决

| 问题 | 裁决 | 说明 |
|---|---|---|
| contradiction 如何表现 | 如上 conflict flag；同 class 内新旧矛盾不算 conflict、算 superseded | 保证外部矛盾（authority vs provider）一定浮出，内部迭代噪音不刷屏 |
| stale observation | 露出材料不定阈值（Core 层）；示例规则随 UI 附带 | stale 永不隐藏 newer-superior 结论；superseded claim 仍可展开查看 |
| 多 issuer | 天然共存；view 按 class 分列 | 例：process_observation 说 conformant 而外部 CI 说 divergent → effective=divergent + conflict flag |
| 相同 claim 幂等 | content digest UNIQUE；重复提交返回 existing row（repository 返回 created=False），**不产第二条 slim event** | 幂等键=规范序列化(execution, ref identity, predicate, issuer_class, issuer, method, disposition, coverage, valid_at 毫秒截断, detail 规范空白折叠, evidence native_id) 的 sha256 |
| claim 撤回/更正 | 更正=追加新 claim（自然 supersede）；撤回 **v1 不做** | 反例 Hunt 未能找到"撤销优于反驳"的场景：错误的 conformant 会被后续 divergent 打败（保守归并），错误本身也是历史。恶意假 claim 的治理 UNRESOLVED，随 trust-model 验证进第三阶段 |
| terminal 后是否可追加 Evidence | **允许** | 现实场景：迟到 CI 结果、崩溃恢复补录、人工复核。claim 通道与 projection 通道完全隔离，terminal 单调性不受影响（补一条回归测试钉死） |
| 追加是否改变 Execution outcome | **永不** | outcome 只能由 provider terminal projection 推动（现状路径）。claims 是关于资源的账，outcome 是关于执行的账。两个账户永不混线——round-3 不变量 I5/I7 的延续 |

坚持到底的三层分离（任务指定原文）：**Execution outcome ≠ resource disposition ≠ Work completion**。分别由 observe_projection（provider 策略）、claims 表+保守归并（观察者多数派）、complete_work（Human 显式动作）驱动，三者无任何写路径交叉。

---

# Provider API

最小形态评估：**保留 `apply_observation` 主入口，增加 `resource_observations=` 关键字参数承载 VO 序列；`resource_states=` 转为 deprecated shim**（比全新顶层函数好：调用方迁移是一行参数名，sane default 保持行为连续）。

```python
def apply_observation(
    self,
    execution_id: str,
    projection: ExecutionProjection,
    *,
    native_refs=(),
    output_refs=(),
    resource_states=(),        # legacy strings；Preview 内继续可用（DeprecationWarning）
    resource_observations=(),  # tuple[ResourceObservation, ...]
) -> Execution: ...
```

逐项说明：

- **backward compatibility**：resource_states 路径原语义逐字节保留（相同 state no-op、fixed-INPUT 守卫、bounded 256）。shim 存续整个 Preview，v1 移除并在移除前一个 minor 打 warning。现有三个插件与全部现存测试不经修改即可保持绿色；**[REPOSITORY VERIFIED for current semantics being preservable]**
- **malformed/untrusted plugin**：三层。(a) 构造期 `__post_init__`（enum、尺寸、组合规则）；(b) repository 层 fixed-INPUT 身份守卫（沿现状）；(c) external_authority 缺 method/detail 拒绝。谎言空间被压到"如实填报 claim 内容但谎报角色"一格，其治理 UNRESOLVED（见上节）；
- **unknown 怎样提交**：一等公民。`ResourceObservation(predicate=OBSERVED, issuer_class=PROCESS_OBSERVATION, disposition=UNKNOWN, coverage=NONE, method="snapshot-diff", detail="workspace changed during run; re-check queued")` 合法且常见——**提交 unknown 比不提交更有价值**（它区别于沉默）；
- **evidence_ref 怎样验证**：v1 机械两层——类型必须是 ARTIFACT + native_id 匹配 `sha256:<64hex>`。内容可达性/digest 复核属于读方（exporter/board 点击时）或 host 工具，Core 不做 IO；记录为明确取舍（对照 round-1：digest 由写侧自算是 known-limitation）**[ROUND-1 EVIDENCE 所循]**；
- **多个同 Contract Ref**（如两份 PromptFragmentV1）：identity 五元组寻址天然区分 prompt-a/prompt-b 两行；无 slot ID 也无需 slot ID。限制记录在案（见词表节的 slot 删除说明）；
- **没有 slot ID 时如何精确关联**：同上——关联键从来都是 (contract_id, full-ref-identity)，与 dispatch 冻结与 canonical digest 用的键完全一致。slot purpose 属于另一条已否决路线，不被此需求复活。

ExecutionProvider 与 claim 的接口边界补充一句定型：codex/pi 等插件今天放在 observation 里的 `projected_contracts` 自报字段不迁入 claims 表（它是启动投影的自报副本，hypernym 上属于 provider narrative）——在 v1 中要么继续作为 provider 观察对象的附属元数据，要么升格为 predicate=projected 的正经 claim（每个 frozen input 一条，issuer_class=provider_self_report）。后者是推荐归宿。**[REASONED PROPOSAL]**

---

# Persistence and migration

建议 migration `007_resource_claims.sql`（设计稿，不实施）：

```sql
CREATE TABLE core_resource_claims (
    seq            INTEGER PRIMARY KEY AUTOINCREMENT,   -- 稳定插入序（排序 tie-breaker）
    execution_id   TEXT NOT NULL REFERENCES core_executions(id) ON DELETE CASCADE,
    -- frozen-input 身份五元组（与 core_execution_refs 相同的身份语义）
    ref_type       TEXT NOT NULL,
    ref_provider   TEXT NOT NULL,
    ref_native_id  TEXT NOT NULL,
    ref_uri        TEXT,
    ref_meta_json  TEXT NOT NULL DEFAULT '{}',
    ref_identity_digest TEXT NOT NULL,                  -- 复用现有 _ref_identity_digest 算法
    -- claim 正文
    schema_version INTEGER NOT NULL DEFAULT 1,
    predicate      TEXT NOT NULL,
    disposition    TEXT NOT NULL,
    coverage       TEXT NOT NULL,
    coverage_note  TEXT,
    issuer_class   TEXT NOT NULL,
    issuer         TEXT NOT NULL,
    method         TEXT,
    observed_at    TEXT NOT NULL,
    valid_at       TEXT,
    detail         TEXT,
    -- evidence 定位（可空）
    ev_provider    TEXT,
    ev_native_id   TEXT,
    ev_uri         TEXT,
    claim_digest   TEXT NOT NULL UNIQUE,                -- 幂等键
    created_at     TEXT NOT NULL
);
CREATE INDEX idx_claims_slot ON core_resource_claims
    (execution_id, ref_identity_digest, seq DESC);
CREATE INDEX idx_claims_time ON core_resource_claims
    (execution_id, observed_at);
```

- **唯一键**：`claim_digest UNIQUE`（幂等）；无其他唯一约束——多 issuer/time 共存是特性。execution FK 上不做级联删除争议：跟随 core_executions 即可（与 refs/dispatches 一致）；
- **append-only 规则**：repository 新增 `insert_claim()/list_claims()/reconciliation_view()` 三个方法；模块内禁写任何针对该表的 UPDATE/DELETE——用一条 grep 式单测固化（与"events 无 update"同一纪律模式）；
- **事件**：每行 insert 成功时附发 `RESOURCE_CLAIM_RECORDED` slim event（data={claim_seq, ref_identity_digest, disposition, coverage}——4 键，裕量充足，且绕开了既有 `_same_projection_semantics` 的语义去重误伤：type 不同天然不去重）。幂等重复提交不重复发事件；
- **查询路径**：①per-execution 全量 claim 列表（audit 导出用）；②per-slot 分组视图（board 卡片主读路径，idx_claims_slot 覆盖）；③stale 巡检（host 定时器按 idx_claims_time 扫最近窗口）；
- **历史自由字符串数据的处理**：**零回填**。理由：(a) legacy state 字符串语义未被 Core 定义过，事后猜测 predicate/issuer 是 fabrication——恰好违反本轮的诚实原则；(b) 读侧合成灰条（aggregate 的 legacy 区块）已让旧数据可见且诚实标记为 unverified-era；(c) 回填是不可逆写入，违背 events 先例（006 archive 选择保档不涂改）。若未来确需结构化迁移，单向脚本 + 干跑输出先行，另案处理；
- **是否需要回填的最终回答**：不需要；需要的是**新旧行的可视区分**（claim 行有 issuer_class，合成行没有），已在 view 规则内；
- 版本兼容：enum 以整数存储、名称由 core 层映射，未知数值渲染为 `unknown(<n>)` 不抛错；claim_digest 含 schema_version，跨版本重复提交会视为新 claim（安全方向的保守行为）。

---

# WorkBoard projection

替换对象：model.py:225 的 `coverage="coverage unavailable"` 硬编码与 app.py 的 refs-count 证据弹窗（round-3/04 的 P0-2 从"两态薄卡"升级为本结构的完整卡）。

**普通用户第一眼看到的每槽一行薄卡**（技术行默认折叠）：

```text
┌ Workspace · commit pinned before launch ──────────────────────┐
│ Expected  commit c81a…e  tree T21…                            │
│ Frozen    ✔ frozen at dispatch  digest included               │
│ Observed  ● conformant — Git rev-parse HEAD^{commit}          │
│           Worktree HEAD matched at launch; drift after start   │
│           not tracked (snapshot window only)                  │
│ Source    process · git-provider @ launch −3m  ▾ details      │
├───────────────────────────────────────────────────────────────┤
│ Instruction · prompt file                                     │
│ Projected ✔ bytes entered model request                       │
│ Consumed ? UNKNOWN — nobody can see whether the model used it │
├───────────────────────────────────────────────────────────────┤
│ ⚠ CONFLICT  CI head_sha d39… ≠ frozen c81…                    │
│   github-api says divergent (run r_991·attempt 2)             │
│   provider self-report earlier said conformant                │
│   → see both claims ▾                                         │
├───────────────────────────────────────────────────────────────┤
│ Plugin usage                                                  │
│ ○ UNVERIFIABLE — no observation surface exists for MCP calls  │
└───────────────────────────────────────────────────────────────┘
```

必修元素与纪律：

- **unknown 与 unverifiable 分色分词**（黄 "?" vs 灰 "○"）——VQ5 型观众测试的历史弱点就在这里被视觉承担；
- **conflicting claims 必须双列**并各附 claim 来源跳转（detail 双值引述此时兑现价值）；
- **Provider self-report 永远带署名角标**（"provider 说…"句式），即使它是当前唯一信息也不得去掉署名降格为事实陈述；
- coverage_note 与 detail 原文展示在 details 折叠区，含 evidence 链接与 digest 首八位；
- **禁止**：总分解/百分比/绿勾墙/"✅ verified"出现在任何非 conformant-and-current 的格子；stale/superseded 结论以时间线可回溯但不参与顶部结论；
- legacy 无 claim 资源的合成灰条文案固定：「No post-launch observation was recorded for this resource.」——不美化、不省略。

Phase 排序建议（Preview→v1）：Preview 先落 Predicates{observed}+issue-free unknown/unverifiable 行为（覆盖 live runbook 的 workspace/profile/prompt/pane 四槽），projected/consumed_reported/produced 与 conflict UX 随第二批插件接入进入；这项排序与 round-3/04 的"两态薄卡先行、typed claim 其次"的 P0/P2 分层一致。**[ROUND-3 EVIDENCE P0-2/P2-1 呼应]**

---

# Test matrix

落点建议新建 `tests/test_work_core_claims.py`；基线纪律：下列每一项都不得破坏现有 12 passed（三个指定文件的存量断言原样存活）。

| # | 场景 | 断言要点 | 对应现状锚点 |
|---|---|---|---|
| T1 | exact match | observed+conformant+complete+note 必填组合入表成功；view effective=conformant | 现有 profile digest 相等路径语义平移 |
| T2 | mismatch | observed+divergent；error-message-only 时代结束；detail 双值可读 | real_resource_providers "differs" 锚点的 post-run 对偶 |
| T3 | projection only | projected claim 无 disposition 断言资格（强制 unknown）；view 无 conformant 提升 | 约束 #8 类型化 |
| T4 | provider self-report | consumed_reported 通过；validator 签名角标所需字段齐备；试图 observed+conformant+self_report → ValueError | 互斥规则⑤ |
| T5 | external authority read-back | missing method/detail 拒绝；齐备则入表并置顶 view | 互斥规则④ |
| T6 | partial coverage | coverage=partial+note 短句合法；scrollback 场景引用 | 现 partial-scrollback metadata 精神 |
| T7 | unknown | 观察 face=none + disposition=unknown 合法且**不等同** unverifiable 显示 | Q7 拆分 |
| T8 | unverifiable | 合法提交（no surface）；保守归并位居 unknown 之上、divergent 之下 | 维度 B 定义 |
| T9 | contradictory claims | process=conformant vs external=divergent → conflict flag + effective=divergent；双 id 均可列举 | Q10 |
| T10 | stale observation | 同槽同 class 更晚 valid_at 的新 claim supersede 旧的；view 取新存旧皆可查；阈值不在 Core | Q8 |
| T11 | duplicate idempotent claim | 同 digest 二次提交 → created=False、无新 event、行数不变 | append-only 纪律 |
| T12 | claim for non-input Ref | ValueError "not a fixed INPUT"——现语义在 claims 入口原样复现 | resource_observation.py:76-84 平移 |
| T13 | terminal 后追加 Evidence | EXECUTION_TERMINAL 已落的 execution 收 late claim 成功；outcome/projection 零变化（终局单调回归） | I5/I7 延续 |
| T14 | secret 泄漏拒绝 | 超 256 字符 detail/state-length 攻击 → 拒绝；evidence 非 sha256 形 → 拒绝。（如实标注：这是结构性缓冲，语义级 redaction 仍在 provider/host 责任区——constraint #6 的分工） | 尺寸上限即护栏 |
| T15 | 多个相同 contract inputs | 两份 PromptFragmentV1 分别 claim 精确落入各自 identity；互不串扰 | identity addressing |
| T16（加菜） | append-only 整备 | grep 式断言：claims 表无 UPDATE/DELETE 语句存在于 repository 模块 | events 同款纪律 |
| T17（加菜） | view 纯函数性 | 相同 claim 集 → 相同 view dict（顺序无关输入、确定输出） | reconcile=纯函数承诺 |

---

# Core boundary

| 分类 | 内容 |
|---|---|
| **必须进入 Core 的最小改动** | ①`ResourceObservation` VO + 四个受控 enum + 组合校验（models 或就近新模块）；②`core_resource_claims` 表（007）+ 三个 repository 方法 + slim EventType；③`apply_observation(resource_observations=)` 入口与 legacy shim；④`reconciliation_view()` 纯函数（保守归并/conflict/supersession/legacy 合成）；⑤T 矩阵测试 |
| **可以留在 Plugin** | 一切 resolver/read-back/比较逻辑与 vocabulary **填充**（git rev-parse、gh api、tmux format、profile 复核、CI 对账、JSONL 摘要）；artifacts 生产与存放；credential 值卫生；semantic-to-claim 的翻译；recover 钩子的资源侧实现 |
| **可以只做 UI** | 展示顺序/折叠策略/信任权重视觉化/过期阈值/导出排版；conflict 的"哪边更可信"高亮（读 policy，不写 policy） |
| **Preview 临时可用（过渡品，均带淘汰时钟）** | resource_states 字符串通道（deprecation warning → v1 移除）；读侧 legacy 灰条合成；board 仅渲染 observed 系谓词（第二轮再补 projected/consumed 列） |
| **v1 前必须完成** | claims 表与 View 上线；≥2 个异构 provider emitting typed claims（本地 git/workspace 族 + codex 自报族即达标起点）；board 顶部行切换到 view 数据源；T1–T17 全绿；自由字符串通道 removal warning 已发过一个 minor |
| **绝对不要建设** | business verdict/pass-fail 总分/policy engine/tracing ingestion/attestation platform/negative-claim inference/log-scan-based reconciliation/auto-workflow-from-disposition/withdraw-API（除非第三阶段给出反例）/Claims 的 CRUD 管理界面（claim 不是可管理资产，是事实沉积） |

一句话边界：**Core 收纳"关于冻结资源的被声明事实"，收纳的方式是类型和代数；理解这些事实为什么为真的每一种学问，都在 Core 之外。**

---

# Final verdict

**C. 需要专门持久化的 claim/observation record——但它是一次存储形态晋升，不是一次本体论扩张。**

推理链收束：

1. **为什么不选 A**：十 Queries 中 Q4/Q8/Q9/Q10 在字符串协议下结构性地无解；压缩语法是在贫瘠容器里发明小语言，代价曲线比新表陡峭。**[REASONED PROPOSAL，对比推演]**
2. **为什么不选 B**：方案自身通过了思想实验、死在了算术上——16×256 的事件信封装不下 15±键的诚实 claim；强行放宽则动摇全体事件的生产消费合同，得不偿失；且 VO 在“落到 association”的路上还会撞上 INSERT OR IGNORE 的时间序列不可能性（同 identity 两行不许共存）。B 的正确遗产——VO 本身——被 C 全盘继承。**[REPOSITORY VERIFIED bounds/multiplicity 证明]**
3. **为什么不选 D（完全留给插件）**：K4（round-3/03）已裁定受控证据词表属于不可约 Kernel——词汇一旦私有化，第二家 provider 接入日就是 claim 不可比之日；且现状 record_resource_state 的 O(n) 扫描与 UI 硬编码表明无中央归属时证据通道会退化成计数器。D 是我们刚刚花三轮论证逃离的原点。**[ROUND-1/3 EVIDENCE]**
4. **为什么不选 E**：证据不仅足够而且过度充裕：三条独立链条（查询需求算术、信封容量算术、三轮外部评审汇聚）指向同一结论。E 应当保留给无法复核的世界。
5. **本判决的风险自查**（对抗义务）：判 C 的最强反方是"Asher ADR-0006 作者会说'这就是被你们警告过的 resource facts 表'"。回应已内置于判决：ADR-0006 的 Preview 决策当时是对的行为（Preview 不需要 Q4–Q10；自由串够用且诚实）；本次改判的正当事由不是口味而是三样新增事实——查询需求被本轮首次显式清单化、容量/多重性证明首次算术化、post-run divergence 已被 round-3/04 证伪为产品必要叙事。**ADR 的自我修正条款（"除非先证明无法表达"）恰恰是被本次履约触发的，而不是被绕过的。**该段落本身应被视为对 ADR-0006 的 amendment 提案，随本设计一并送审。**[REASONED PROPOSAL]**

**实施排序合约（承接 round-3/03 的工程序清单，插入而不重排）**：007 迁移+VO+View 属 K4 承诺的兑现件，排在 failed-idempotency 与 resume-on-terminal 两修之后、adapters/recover 协议之前；WorkBoard 切换 view 数据源与此同步；P0-2 薄卡录制在 claims 上线前后各有一版，话术分别遵循 round-3/04 §3 的强准确句（不含 reconciliation）与新句（含 honest reconciliation）。

*本报告未读取其他 round-4 输出；除本文所写文件与目录外未修改任何代码、测试或文档；未执行 Git 操作。*
