# Round 4 · 红队综合：阻止 Evidence 与插件协议膨胀，及 Preview 最小切口

报告日期 **2026-08-27**。工作目录 `/home/maoqh/projects/agent-box`，分支 `spike/real-governed-binding`。本报告为第四轮工程设计验证的红队产出：攻击对象是两个正在逼近的膨胀方向——**post-run Evidence reconciliation 的字段与机制**、**第三方插件协议的规范化冲动**——并给出到达 Preview-grade 的最小改动集。

## 审计范围与证据基础

已完整阅读：round-3 全部四份（01 单一 Kernel 多 Host / 02 Work 与 Scope 裁决 / 03 Kernel 替代性与包边界 / 04 A 型 Evidence 证伪）、ADR-0006 全文；未读取任何其他 round-4 输出。本轮亲自核对：`work_core/`（services/repository/models/projection/events/registry/resources）、`extensions/`（api/loader/bootstrap）、`resource_contracts/` 三个 contract 文件、五个插件的关键源码、`tests/test_work_core_vertical_slice.py` 等；全套测试在本日早些时候实跑 **328 passed, 1 skipped**。

标签沿用前轮：

| 标签 | 含义 |
|---|---|
| **REPOSITORY VERIFIED** | 本轮亲核源码/迁移/测试的事实（附位置） |
| **ROUND-N EVIDENCE** | 前几轮报告确立的结论 |
| **REASONED PROPOSAL** | 本轮红队判断 |

背景约束照单接受：单一 Kernel、多 Host 形态成立；产品差异在外部包；A 型 WorkBoard 仅属 Preview；Work optional 化非本轮主实现；Provider 负责可靠 observation；Core 不推断外部产品语义；**不新增 ResourceFact/BindingSlot/Evidence/Finish/Continuation Core entity**；terminal 不可 reopen；continuation = 新 E + old SessionRef input；secret 与 raw transcript 不进 Core；不加 workflow/scheduler/retry/supervisor。

---

# Executive verdict

**判词预览：B —— 需要极小结构化 observation + 轻量 Plugin SDK。精确到数量级：Core 净增 2 个受约束枚举列、0 个新实体、0 个新 SPI 类型；同时删除 2 处现有表面（legacy `request_dispatch`、terminal-resume 合法性）；插件系统保持冻结不动。**

三条压缩论证：

1. **Evidence 侧的膨胀压力是真实的，但答案不是十一条字段。** 对 authority/method/coverage/disposition/stage/confidence/integrity/valid_at/evidence_ref/issuer/assurance 十一个候选字段的逐项审判（§Evidence field red-team）只幸存 2 个持久化列（受约束的 `level` + `verdict`），其余全部判"可推导/会乱填/伪造成可信度/重复 Ref-Event/Preview 用不上"。ADR-0006 §10 已把 Preview 存储边界钉死为"frozen associations + inputs_digest"，本轮把唯一值得突破这条边界的地方限定在 resource-state 行上。**[REPOSITORY VERIFIED(现状) + REASONED PROPOSAL(裁决)]**
2. **插件协议已经存在且形状正确，最大的协议风险是继续立法而非缺法。** `extensions/api.py` 只有 descriptor/context/registration 三个类型；loader 有 api_version 门禁、duplicate-id 拒绝、逐条失败隔离、strict 开关；registry 有契约版本化、原子注册、capability 运行期检查——这就是"轻量 Plugin SDK"本身，且 `PLUGIN_API_VERSION=1` 尚未被任何第二方消费过。此刻引入 scaffold 生成器、conformance 认证体系、版本兼容矩阵、Evidence collector 协议，全是在零生态上收税。**[REPOSITORY VERIFIED]**
3. **最小切口的惊人结论：Kernel 改动可以在零个插件文件 diff 的情况下完成并被诚实演示。** 四项 P0（terminal 单调守卫、禁 terminal resume、删 legacy dispatch、failed 幂等显式化）加两列枚举迁移，全部落在 `services.py/repository.py/007 migration/tests`；round-3 已设计好的 divergence fixture 与 post-run read-back 由 **Host 脚本**经现有 `apply_observation()` 写入，`tmux_provider/codex provider` 一行不用改。这是"膨胀被拒绝"的最硬证明：真正的缺口从来不需要动 SPI。**[REPOSITORY VERIFIED + REASONED PROPOSAL]**

---

# Current minimal loop

只陈述代码里已有的东西。九项检查逐一给状态：

| 环节 | 状态 | 依据 |
|---|---|---|
| frozen inputs | **有** | `dispatch_execution()` 单事务写入 canonical `(contract_id, Ref)` + digest；之后 INPUT 不可新增（`services.py:118-160`、`repository.py:287+`、006 迁移 UNIQUE 约束）**[TEST VERIFIED]** |
| Dispatch | **有（含缺陷）** | requested→accepted/failed；幂等键冲突、跨 Execution 键复用均硬拒；但 failed 后同键同 digest 重放**静默返回新 StartRequest 不重启不复报旧错**（existing-key 分支不区分 failed 态，`services.py:100-116`）**[REPOSITORY VERIFIED]** |
| Ref | **有** | 五类型 frozen dataclass + bounded metadata；NATIVE/INPUT/OUTPUT relation 附着（`models.py:44`、`repository.attach_ref` 重复发现不产生噪声事件）**[TEST VERIFIED]** |
| resource state | **有（弱校验）** | `apply_observation(..., resource_states=)`：任意非空 ≤256 字符串 + 可选 ArtifactRef + ref identity+state 去重；fake 测试先写 projected 再写 consumed 全部通过（`services.py:338-379`）。无词表、无来源分级 **[REPOSITORY VERIFIED]** |
| native/output refs | **有** | observe 时附着 Thread/Turn/pane/artifact refs；单字符串 receipt correlation 为上限（`provider.observe` 各实现）**[REPOSITORY VERIFIED]** |
| Provider finish | **有（plugin-local）** | codex/tmux/pi 三家各自 `finish()` 落盘 scrollback/session JSONL 并 sha256 成 ArtifactRef；submitted 是插件私有布尔位，Kernel 无 Finish 记录（events.py 无 FINISHED 类型）**[REPOSITORY VERIFIED]** |
| terminal observation | **有（不单调）** | projection active/terminal/unknown + outcome/freshness；`observe_projection` 只按 observed_at 新旧丢弃，**无 phase 回退守卫**——terminal→active 可落库且 ended_at 错乱（`services.py:292-303`）**[REPOSITORY VERIFIED]** |
| WorkBoard | **有（计数器级）** | chronicle + binding 视图真实；Evidence 视图只有 counts 与硬编码 `coverage unavailable`（`model.py:225`、`app.py:795-803`、`render.py:162`）**[LOCAL VERIFIED]** |
| plugin discovery | **有且够用** | entry-point 组 `agent_box.plugins`；api_version 不符即 INCOMPATIBLE；duplicate id 拒绝；逐插件异常隔离成 report（strict 可 fail-fast）；contracts 先于 providers 注册；契约须 frozen dataclass + 版本化 id（`extensions/loader.py:62-127`、`registry.py:72-123`）**[TEST VERIFIED]** |

## 真实缺口清单（本轮新列出或确认，不含愿景）

1. **假 consumed 可入库**：`_validate_resource_states` 除非空与长度外不约束内容；这是四轮反复指认的 I7 缺陷，仍然在树上。
2. **terminal-resume 被(错误地)合法化**：`resume_execution()` 只查 `projection.resumable_now is True`（`services.py:381` 区域），而该标志由 **provider 自己构造投影时填入**——codex 在 TERMINAL 投影里按位置传了第三参 `True`（`codex/provider.py:455-458`），于是"terminal 之后可 resume"同时被 `tests/test_work_core_vertical_slice.py:47-53` 作为期望断言固化。守卫存在但钥匙在插件手里。
3. **legacy `request_dispatch()` 仍在公开服务面**（`services.py:71`）：创建无冻结输入的 Dispatch，把 Execution 变成永远无法 governed-dispatch 的僵尸（后续 INPUT 冻结检查必然抛错），并旁路 I1。
4. **崩溃窗口无判定程序**：start() 返回与 `record_dispatch_accepted` 之间崩溃 → correlation 丢失且无从得知是否已产生副作用；requested 态滞留无人枚举。generic reconciliation ABSENT 维持。
5. **selector provenance 缺位**：requested 字符串不入库，resolution-divergence 无法事后质证（round-3 01 列为公共债）。
6. **resume 动作不留痕**：动态 `getattr(provider,"resume")` 调用不写任何事件（无 EXECUTION_RESUMED），审计链断点。
7. **Evidence 读出层无结构可渲染**：board 想画诚实的三态卡也无数据源——这不是 UI 偷懒，是 schema 没给词表。
8. **contract 数量限制即全部 admission 面**：无 expected-assurance/pre-start policy 参数——按 round-3 未决冲突 #9，这应保持为缺口直到试点给出 abort 需求的证据。

---

# Evidence field red-team

对十一个候选字段逐一执行六问（需持久？可推导？会被乱填？制造虚假可信度？重复现有结构？Preview 用否/删除损失？）。审判基准三条：ADR-0006"Core 不解释 provider 状态值"；背景约束"Provider 负责可靠 observation、Core 存事实不存判断"；以及一个不对称原则——**错误字段一旦进 schema，每个未来插件都要为它撒一次谎或空着它**。

| 字段 | 裁决 | 六问要点 |
|---|---|---|
| **authority** | **REJECT（列）** | ①不必持久：read-back 类 claim 的权威就是 subject Ref 的 `.provider`（git/tmux/profile resolver 名字已在行里）；②插件会把它当自由品牌栏填 "GitHub™ certified"；③真值核验者仍要去外部系统复核，标签不增加任何真实性；④删除损失≈0——渲染时可从 level=readback 推导措辞。 |
| **method** | **REJECT（列）** | 方法描述本质是 plugin-local 散文（rev-parse/display-message/jsonl-hash…）；枚举化即失去表达力，自由文本化即垃圾场。它属于 state_summary 文本与插件文档，不属于受控 schema。 |
| **coverage** | **REJECT NOW / v1 条件复活** | C0/C1 词表在设计上正确 [ROUND-1]，但当前一切负向命题都只能是 unknown——没有一条现实路径能产生 bounded-complete（sandbox/audit 面不存在）。现在持久化 coverage 只会诱导插件随手写 bounded-complete = 制度化的虚假严谨。v1 触发条件：出现第一个真的负向 claim 消费场景（如 fail-closed runtime）。 |
| **disposition** | **拆分吸收，不设此列** | D0–D3 全谱系过度；Preview 真正需要的区分恰好分解为两个更小的正交列：*谁说的*（level）与 *和预期比怎么样*（verdict）。合并语义见下方最小集。 |
| **stage** | **REJECT** | 可完全推导：pre-start 失败已是 `dispatch.state=FAILED`+error 文本（fixture 已验证）；post-run 观察天然晚于 dispatch 事件序。第四根时间戳只会乱填。 |
| **confidence** | **REJECT** | 数字式伪精确的重灾区：插件会齐刷刷写 0.9；没有任何 ground truth 能惩罚他们。二值的 UNKNOWN 已经表达了全部诚实信息。 |
| **integrity** | **REJECT for Preview** | ArtifactRef 构造时就强制 sha256（prompt/profile/tmux artifacts 均如此，REPOSITORY VERIFIED）——digest 已存在于 Ref.native_id/metadata，再存一份是重复；签名链属于 v1 明确拒绝清单。保留现状即可支持"完整性针对已捕获字节"的表述。 |
| **valid_at** | **REJECT** | resource-state 行已有 occurred_at，事件有 created_at；TTL/freshness 语义属于 ResourceProvider 的 resolve 校验（tree mismatch 即弃），不是存储字段。 |
| **evidence_ref** | **KEEP（现状）** | 已实现：可选 ArtifactRef 定位 + digest。零改动。这是唯一原样幸存的候选。 |
| **issuer** | **DERIVE，不新建列** | input-subject claims 的 issuer ≡ subject Ref.provider；execution-provider claims 的 writer ≡ 该 Execution 绑定的唯一 provider（mono-dispatch 保证）。两者都在渲染时可查。第三方" ghost 插件冒名写 claim"的问题in-process本来就防不住（见安全节），多一列只改变谎话的署名格式。 |
| **assurance** | **REJECT（红线）** | 这是 pre-start policy 词汇 [ROUND-3 冲突#9 UNRESOLVED]；放进 observation 就是把 admission authority 从后门请进来。等真有一个 caller 需要 on_unmet=abort 再说。 |

### 最小字段集（净增持久化面 = 2 列）

现有 resource-state 记录（subject ref identity + ≤256 summary + optional ArtifactRef + occurred_at）之上，随 007 迁移重建小表（沿 006 archive 先例）加入：

```sql
level    TEXT NOT NULL CHECK (level IN ('REPORTED','READBACK','UNKNOWN'))
         -- REPORTED = provider/plugin 自报；READBACK = 对 authority/物料的独立再读；
         -- UNKNOWN   = 明确不知道
verdict  TEXT NOT NULL CHECK (verdict IN ('PASS','FAIL','NOT_CHECKED'))
         -- 仅 READBACK 行允许 PASS/FAIL；与冻结合同比较由 provider 完成后申报
```

配套规则：summary 文本（≤256 自由文本）承载 method/authority 的人类可读说明；board 渲染规则固定为 READBACK+PASS→✓、READBACK+FAIL→divergent 红、REPORTED→「它自己说的」黄、UNKNOWN→灰。**projected→consumed 升级谎言被语法层面终结**：你最多宣称 REPORTED(consumed)，永远无法自称 READBACK 而不留下可质证的 artifact digest。这就是对抗 fake-consumed 的全部所需——再多一列都是给未来的插件增加填写负担。

---

# Reconciliation red-team

八条攻击逐条过堂。能完全成立的划 ✓，部分成立的标让步条件。

| # | 攻击 | 判定 | 论证 |
|---|---|---|---|
| 1 | Core generic reconciliation 不可能 | **✓ 成立（90%）** | Core 不知道 git 树意味着什么、CI head_sha 属于谁；ADR-0006 第 10 节禁止 Core 实现 Git/Harness 语义。**10% 让步**：有一种"比较"不是产品语义而是簿记完整性——哪些 frozen input **从未收到任何 observation**。这是个 GROUP BY，不推断意义。这是本轮准备让 Core 拥有的唯一 reconcile 行为：`list_unobserved_inputs(execution_id)` 式查询。 |
| 2 | 比较应完全由 ResourceProvider 完成 | **✓ 成立并背书** | 这正是现行成功的模式：GitWorktreeResourceProvider.resolve 已在 start 前做 tree/HEAD 校验并 raise（fixture S5 依赖它）；post-run 的 snapshot()+比对也应归同一 provider 的方法，输出 verdict 申报给 Core 存储。Core 当邮局不当法官。 |
| 3 | Evidence 只是插件生成的 artifact | **✗ 不成立** | 若证据仅是 artifact blob： rogue 插件可以把 blob 标题为 "verified matrix" 而 board 无语法手段拒绝渲染；跨 provider 的 claim 不能互相比较（round-3 03 的词汇漂移论证）；unknown 也无处安放。**内核真理的一半**：payload bytes 确实必须留在 Core 外（raw transcript 禁令），Core 只持有 constrained 行 + digest 反查。C 选项把这个一半扩大成了全部——过了。 |
| 4 | resource_states 自由字符串已足够 | **✗ 不成立（已被实证击穿）** | 事实反证：fake adapter 写 consumed 通过测试；WorkBoard 只能显示 coverage unavailable。自由串等于让每个插件发明私有方言，四轮收敛出的那点词汇资产就地蒸发。这攻击的价值在于提醒我们:**别用十一列去修一个两列就能修的洞**。 |
| 5 | typed claims 只是另一套 tracing | **◐ 对了一半** | 如果采纳 §上一节十一个字段的候选集，是的——那是一套没有采样器的 OTel。以 2 列 + 现有事件流交付、并明文禁入 trace/span/baggage 概念后，claim 只是账本的受限注记。防线写成规则：claims schema 里永久不得出现 span/trace/id-import 概念。 |
| 6 | post-run 对账会被 unknown 淹没 | **✓ 成立且已被接受为前提** | round-1/2 共识:harness 关键 slot 大多不可验证;E≤4 天花板结构性存在。正确的反应恰恰是小面积 claim 面(灰行便宜)与叙事转向(pre-flight refusal + sealed history 卖点),而不是为了减少灰行而发明强证据字段。unknown 不是 bug,是产品语境的正确底色。 |
| 7 | 恶意插件可以同时启动并"验证"自己 | **✓ 成立,in-process 下无解** | 同进程、同信任域;任何"VERIFIED"都是插件的自说自话,包括我们自己的 reference providers。可用对策只有缓解三件:(a)level 列迫使谎言留下语法痕迹(自称 READBACK 却无可复核 digest 时审计工具可扫描);(b)渲染处展示 writer 身份(派生);(c)关键 slot 的最终裁决永远依赖外部 authority 二次回读习惯,不依赖面板颜色。根治方案=容器化插件平台=任务明令不做。承认这一点是本报告诚实义务的一部分。 |
| 8 | 多 issuer 造成无法解释的冲突 | **✗ 基本不成立** | mono-dispatch 使 execution-provider 维度只有一个 writer;input-subject 维度的潜在多 writer 场景极窄且现无实现。即便发生:append-only 保存双方、按时序并陈,Truth 仲裁本来就不该是 Core 的职分。"无法解释"只发生在试图自动合并时——所以不改写、不仲裁是答案,不是问题。 |

### 攻击后幸存的 Kernel 最小行为（全部）

1. observation 行携带 2 个受约束枚举（上节）；
2. completeness 查询：per-frozen-input 最近一次 observation / 从未观察清单（喂 WorkBoard 卡与 export）；
3. append-only 不可改写、冲突并陈不仲裁（现状已有，守之）；
4. **明确不做**：reconciliation engine、expected-vs-actual 自动比较器、跨 authority 语义理解、coverage 推断。

---

# Plugin SDK red-team

对十条攻击逐一裁决。总基调已在 Executive 给出：**SDK 已轻，勿再加冕。**

| # | 攻击 | 判定 | 说明 |
|---|---|---|---|
| 1 | 统一 Plugin object 会变 God object | **✗ 目前不会；风险在未来添加的字段** | 现形状三个动词（descriptor/build/registration）×三个组件元组，刚好覆盖 Core 认识的三种组件。膨胀路径清晰可见：有人提议往 PluginRegistration 加 ui_adapters/evidence_collectors/exporters。**规矩建议固化为一句话**：Core 扩展面只有 Contract/ResourceProvider/ExecutionProvider 三种（round-3 03 同判决）；其他一切适配面（board 的两组 entry-point 已示范）是各 Host 包私有协议。[REPOSITORY VERIFIED(api.py 三类型)] |
| 2 | descriptor 与 entry point 重复 | **◐ 小疣，不值得治** | entry_point.name 与 descriptor.id 可能不一致；loader 按 entry name 排序、按 descriptor.id 拒重。做一个 equality 断言是仪式性严格；文档约定即可。真正的小疣是 `register_resource_provider(str, provider)` 的 legacy 双形态（registry.py:133-164 还在伺候 in-tree/test doubles）——P2 清理项，非本轮。 |
| 3 | capability 声明会漂移 | **◐ 真，但解药不是 schema** | flags dict 由 require_capability 只在使用点检查；声明 supported 但方法缺失只在调用路径暴露。增加注册期深度校验=新权限机器；正确剂量是 **conformance kit 里放一个"声明的 capability 必须可调用"的 smoke test**（几十行，吃现有五插件跑通即达标）。recover 成为下一枚 key 时同样适用。 |
| 4 | scaffold 制造低质量插件 | **✓ 成立，scaffold 应拒绝** | 参考实现才是正道：preview-resources 插件全文 20 行，比任何 generator 输出更能教会人写对。生成器会把过期模板固化成生态惯性。REJECT。 |
| 5 | conformance 只能测接口不能测真实保证 | **✓ 成立，因此不得对外叫认证** | kit 能测：frozen dataclass 注册、未知 contract 拒绝、limit 冲突、restart 重载、坏类型拒启；不能测：profile adapter 是否真的读了字节、tmux adapter 是否漏掉 pane 漂移。定位必须是**开发期回归工具**，输出"通过 N 项接口场景"，永不输出 "Certified Agent-Box Provider"。round-3 kill #5（认证语料盲区）照单继承。 |
| 6 | WorkBoard adapter 污染插件基础依赖 | **◐ 现状可容忍，须钉住一条线** | 本轮核实：`pi/workboard_input.py:13` import `agent_box_workboard.adapters` —— provider 发行包内确实住着 Board 私有协议模块。依赖方向是 provider→board（不违反 board→core 单向），且这些模块仅通过 `agent_box.workboard_*` entry-point 组被懒加载，Core/runtime 永不触碰。可接受；但**若哪天 provider 包的 core 导入路径能传递 import 到 workboard，即为违规**——import-linter 一条规则的事，P2。 |
| 7 | Evidence collector 应是独立插件 | **✓ 方向对，v1 做** | 收集/渲染 claim 的代码不该在 kernel 也不该逼每个 provider 复写。作为 exporter 插件包消费 SQLite 视图即可，无需新协议对象（exporter 是函数不是 SPI）。v1 与 static evidence card 一起立项。 |
| 8 | 版本矩阵过度 | **✓ 会过度，现在是防住它的时刻** | PLUGIN_API_VERSION=1 单整数门禁已够用（loader 现行为）。矩阵化（API×插件兼容网格）出现在第二个 major bump 且生态 >3 插件之前都属于幻想工程。规则先行写在 docs：签名破坏才 bump；新增 Protocol 方法走 getattr-可选模式（resume 的动态调用已是先例）。 |
| 9 | 插件卸载后历史 Ref 是否可读 | **✓ 结构上是，且这是优点** | refs/events/dispatch rows/digests 都是普通文本行，读取不需要类（list_input_refs 直接返回 persist 的 contract_id 字符串，006 迁移文本列）。卸载后损失的只是能力（重新 resolve/recover/继续 turn）——呈现降级为 display-only 是正确语义而非缺陷。**converse 必须钉死为不变量：不得有任何读路径 require 注册表在场。** 现状满足（board model 读 repo 不 touch registry）。 |
| 10 | 第三方插件能否伪造 authority | **✓ 能，同信任域下不可防** | 见安全节第 3 条；这是 in-process 模型的定义性代价，不是待修 bug。 |

---

# Security and trust

八项检查按"Preview 必须解决 / v1 解决 / in-process 模型根本无法解决"三档落位。

| # | 事项 | 档位 | 说明 |
|---|---|---|---|
| 1 | 不可信插件在 Core 进程内执行 | **模型限界，永不解决**（容器平台被任务禁止） | loader docstring 已直白："Plugin packages are trusted executable Python code"；隔离只是 import 失败的报告隔离。Preview 要做的唯一事是**把这句话放进面向用户的安装文档首屏**，不许藏在 docstring 里。 |
| 2 | 插件读取 secret | **Preview：规则层解决** | 能拿到的防线：(a) profile contract 显式排除 auth.json/history 等敏感易变文件（resources.py `_PROFILE_EXCLUDED_NAMES`）；(b) Binding metadata 禁 secret value 约定；(c) Pi 以环境引用 DEEPSEEK_API_KEY 不落盘（config.py 注释）已示范规范形态。in-process 下插件偷读 env 无法技术阻断——审计靠 scoped scan 习惯（DSH storyboard 亦然）。 |
| 3 | 插件写假 Evidence | **无法根治；缩小爆炸半径（Preview 交付）** | level 列使谎话有语法形状（自称 READBACK 需配 artifact digest，抽查工具可扫）；verdict=FAIL 需指认与冻结合同的比对据；writer 身份渲染时派生展示。剩余风险如实声明："面板绿色=这个插件的证词，不是法庭判决。" |
| 4 | 插件修改 workspace | **v1：检测层** | 进程内拦不住 rm -rf。可行的只剩事后审计钩子：finish 时 provider 对 managed workspace 出具 snapshot（head/tree/diff_digest）作为 READBACK 行——它不能阻止破坏，只保证破坏留痕并可归因。列为 v1 增强（本轮 slice 中由 host 脚本手工触发即可）。 |
| 5 | 插件阻塞/崩溃 | **Preview：既有隔离已够** | import 期：逐 entry-point try/except → FAILED record（loader 现状）[TEST VERIFIED]。运行期阻塞是宿主调度问题：推荐 host 以线程+超时包裹 adapter 调用，写进 kit 文档；Core 不内置执行器（那是 worker 平台的滑坡入口）。 |
| 6 | 插件 ID 抢占 | **Preview：文档约定** | 同一轮加载 duplicate id 拒绝 ✓（先按字母序加载者胜）。跨发行包抢注 group entry 的防御就是命名空间约定（`vendor.*` 前缀建议）+发布渠道审核（pip 层职责）。不上 RAII 权限机制。 |
| 7 | 依赖冲突 | **Preview：无为而治** | pip 分区安装的现实；reference adapters 保持 stdlib-only 以身作则；不为"依赖和谐"造 lock 工具。 |
| 8 | 插件升级后历史解释变化 | **Preview：契约冻结已解决** | contract_id@N 不可变：旧行永远按 @1 解释，@2 并行注册互不污染（registry 拒重同名 id，CONTRACT_TYPES 目录仅为兼容索引）。唯一残余风险是 renderer 对旧 @1 停止理解的"展示腐烂"——列入 kit 的 restart-reload 测试场景即可。 |

**总结**：八项里六项由"信任文档 + 受控词汇 + 现有隔离"覆盖；两项（改 workspace 审计、negative coverage）顺延 v1；没有任何一项需要新 Core 实体或新 SPI 面。任务的反目标（不要因噎设计容器化插件平台）与本裁决天然一致。

---

# Core change triage

十个候选改动逐一判定。

| # | 改动 | 判定 | 依据 |
|---|---|---|---|
| 1 | terminal monotonic guard | **P0** | `observe_projection` 加 phase 回退拒绝（terminal 之后任何投影只能 terminal|unknown 或被拒并记事件）；数行改动，护住 sealed-history 地基 I3 的前半。无它，Evidence 排版得先问"这份记录还算数吗"。**[缺口 REPOSITORY VERIFIED services.py:292-303]** |
| 2 | 禁止 terminal resume | **P0** | 两刀：(a) Core 在 resume 入口直接拒绝 `phase is TERMINAL`，不再信 provider 填的 `resumable_now`（钥匙从插件手里收回）；(b) 改写 vertical-slice 测试中"terminal 后 resume 成功"的断言为 rejection 断言（tests/test_work_core_vertical_slice.py:47-53）；(c) codex provider 构造 terminal 投影时的 `True` 位修正（provider.py:455）。附带补 EXECUTION_RESUMED 事件填充审计缝（#6 缺口）可在同一刀内完成。 |
| 3 | legacy request_dispatch deprecate/remove | **P0（直接 remove）** | 它是 I1 的活体旁路 + 僵尸 Execution 制造机 + 旧 schema 行为地雷（round-3 01 补充审判同判）。deprecation 周期毫无意义：consumers 仅 tests 与可能的 demo 脚本；删除并同步改写相应测试。对外发布说明一行即可。 |
| 4 | failed idempotency 语义 | **P0** | existing-key 分支补 `state=='failed'` 判断：直接 raise `DispatchFailed(previous_error)`（或按受控 rearm 策略显式复位并记账）。这一处是所有 Host-retry 形态（Temporal redelivery/LangGraph node retry）接入的前置；修复成本 ≈10 行 + 一个分支测试。**[缺陷定位 services.py:100-116]** |
| 5 | ambiguous dispatch | **P1** | 含三件：requested 态滞留扫描（reconcile_pending）、ExecutionProvider 协议的可选 recover 钩子 key、ambiguous 终态与 recover→accepted(recovered) 转移。round-2 四候选各写过一遍协议，设计成本为零；但 Preview slice 不触发崩溃镜头时它不阻塞，故 P1。注意骨架必须保持"provider 反查，Core 不猜"。 |
| 6 | structured resource observation | **P0（最小变体）/ REJECT（完整谱系）** | 采用 §最小字段集的 2 列迁移（007 rebuild，含 archive 表先例）。完整 E/D/C/authority/method 列族按 §field red-team 判 REJECT。这一条是本报告标题里"膨胀 vs 最小"的分水岭。 |
| 7 | Evidence aggregate query | **P1** | `observations_for(execution_id)` / `unobserved_input_slots(execution_id)` 两个只读 helper（repository 层 SQL GROUP BY），供 board 薄卡与 export 使用；不算 reconcile engine。无它则 P0-6 的两列躺在库里没人消费（exit criteria E5 会立刻命中）。 |
| 8 | Work optional | **P1（本报告视角）** | round-3 02 已裁定 nullable+查询为 Preview blocker 且近乎无损——本报告全盘援引，不在本轮重审；相对本轮聚焦面（evidence/插件）排序为 P1，若录制日程确定则按 round-3 02 结论提前至先做。实现面引用其第 9 节五件套清单，不复制。 |
| 9 | plugin API version | **P2（已存在，仅立法）** | PLUGIN_API_VERSION=1 门禁已实现并有 INCOMPATIBLE 分支 [TEST VERIFIED]。剩下的工作是两页文档：bump 规则（签名破坏才升）、新增能力的 getattr-可选惯例、"registered-but-absent" 降级语义。**禁止**的实现冲动：semver 解析器、兼容矩阵生成器、双版本并存加载。 |
| 10 | conformance kit | **P1（轻量）** | 内容全部回收既有资产：five-plugin 烟测 + spikes/binding_flow_stress 28 场景裁剪 + capability-declared-is-callable 检查 +（新增两列后的）claim-vocabulary 错误用例。交付形态 pytest fixtures 包，不是 CLI 产品、不是认证流程。kickoff 前 dev-loop 内建一个"说谎 adapter 必须被抓"的反向用例（kit 自我检验，见 exit E4）。 |

triage 外的两个显式 REJECT 呼声（防止它们借尸还魂）：Finish aggregate service（违反本轮实体禁令的精神——等 v1 以单个事件类型 EXECUTION_FINISHED(actor,reason) 交付，不动 ontology）；Coverage 持久列（理由见 field 表）。gate/query `expected_assurance.on_unmet` 同 REJECT，维持 round-3 UNRESOLVED 悬置。

---

# Preview minimal slice

一天量级、不伪造 post-run Evidence 的最短闭环。组件全选存量真实资产：ResourceProvider × Git/Profile/Prompt（现成，TEST VERIFIED），ExecutionProvider × Codex-tmux（现成，LOCAL VERIFIED），Host 脚本 × run_investigation_execution.py 改造（改脚本而非插件——这本身就是论点）。

```text
T0  007 迁移落地：observation 行带 level/verdict 受约束枚举（006 rebuild 先例）
T1  services.apply_observation 校验两枚举；非法组合（REPORTED+PASS 等）拒绝
T2  host 脚本 finish 后追加三次真实申报：
      a. git snapshot(): head/tree/diff_digest vs 冻结 commit
         → level=READBACK, verdict=head==pin ? PASS : FAIL, summary 带 rev-parse 说明
      b. profile manifest digest 复算 vs 冻结 digest
         → level=READBACK, verdict=PASS/FAIL
      c. prompt/model consumption
         → level=UNKNOWN, verdict=NOT_CHECKED, summary 如实写“无观察面”
T3  divergence beat：profile-drift fixture（round-3 §Deliberate divergence fixture）
     → dispatch FAILED + reason 高亮在卡片上层
T4  WorkBoard thin card：
      替换 model.py 硬编码 coverage 行为三行——
        ✓ 精确输入已在启动前核对（READBACK+PASS 计数）
        ⚠ 以下来自 provider 自报（REPORTED）
        ? 无法验证（UNKNOWN）
      数据源=aggregate query（P1 的两个 helper 中至少第一个）
T5  E2 same-session continuation：沿用 derived 'continues native session' 关系镜头
```

**必须真实存在的 Core 字段**：`dispatch.state/error`（refusal beat）、`inputs_digest`、两枚举列、ArtifactRef、occurred_at——此外无。
**必须由 Plugin/UI 推导的部分**：authority 名称与方法散文（summary 文本）、writer 显示身份、置信措辞、issue/PR 链接行、全部 unknown 的措辞。
**切片的自我审查线**：卡上必须至少一行真 UNKNOWN；不允许出现 "verified"一词置于任何 REPORTED 行附近；T3 失败原因字符串必须包含 provider 原始 ValueError（不转译美化）。满足这三条，slice 就不违反任务红线；违反任何一条即是伪造。

---

# v1 boundary

Preview 之后的最小增强队列（每项一行理由），随后是指令要求的拒绝名单。

增强队列：

1. ambiguous + reconcile_pending + provider recover 声明 key（crash 窗口闭合；协议草稿 round-2 04 §3.3 现成）；
2. requested-selector provenance 列（slot purpose + selector 字符串；解锁 resolution-divergence 叙事）；
3. EXPORT_FINISHED 事件：EXECUTION_FINISHED(actor, reason)——以事件交付 Finish 记录而不设实体（遵守禁令的字面与精神）；
4. external_scope 查询视图 + standalone 创建 verb（援引 round-3 02 Tier-1 条款）；
5. exporter-evidence 静态卡片插件（markdown/html，消费 aggregate query）；
6. capability smoke test 扩容进 kit；workspace snapshot 审计行成为 provider 推荐实践。

**拒绝名单（每项一句否决理由）**：

- signed attestation 平台——签名解决的是信任分发，当前连第一个外部消费者都没有；DSSE 接口留给外部 signer（round-3 03 移出表同判）。
- generic policy engine——admission authority 的滑梯入口；abort 需求尚无一个真实 caller（round-3 冲突 #9 悬置条款）。
- full negative evidence——C1 需要完整观测面声明机制，今天的runtime根本提供不了观测完备性；先有 fail-closed runtime 再谈。
- remote plugin sandbox——in-process 信任模型的定义性代价，抑制它的成本是一个新平台；文档披露优于假防护。
- marketplace——pip + entry-points 已经是市场；策展/评分/签名基础设施是无生态税。
- generic tracing——claims ≠ spans；OTel 集成属 Host 世界，混入即触发 exit E-谱系的语义混淆。
- workflow features——四轮禁令原文引用即可：retry/scheduler/DAG/node/supervisor 永不入 Kernel。

---

# File impact

可能修改的文件清单（列出而已，本轮未实施）。标注 ★ 的文件**绝不出现具体产品名**（Codex/GitHub/LangGraph/DeepSeek/tmux 字样皆禁）——Core 层必须维持 provider-neutral 措辞，这既是 ADR-0006 §10 的延伸义务，也让 Kernel diff 可被任何 Host 复用评审。

| 层 | 文件 | 改动性质 |
|---|---|---|
| Core ★ | `src/agent_box/work_core/services.py` | resume 阶段拒绝+RESUMED 事件；remove request_dispatch；failed-key 显式失败；observation 枚举校验 |
| Core ★ | `src/agent_box/work_core/repository.py` | observation 行读写迁至新列；phase 单调守卫；两个 aggregate 查询 |
| Core ★ | `src/agent_box/migrations/007_*.sql` ★ | 小表 rebuild（archive 先例）+2 受约束列；（独立批次的）008_work_optional.sql 援引 round-3 02 清单 |
| Core ★ | `src/agent_box/work_core/models.py` / `projection.py` | 仅在需要把枚举提升为共享常量时触碰；ResumableNow 字段语义注释更新 |
| Core ★ | `src/agent_box/extensions/*` 、`resource_contracts/*` | **零改动（目标状态）**——若出现 diff，即本报告失败的信号 |
| Registry ★ | `src/agent_box/work_core/registry.py` | **零改动**；仅在 recover capability key 立法（v1）时加一行 keys 常量 |
| Plugins | `plugins/agent-box-codex/.../provider.py:455` | terminal 投影 resumable_now 位修正（一行） |
| Plugins | 其余 provider/resource/board 交互代码 | **零改动**；workboard_control/workboard_input 模块不动 |
| WorkBoard | `plugins/agent-box-workboard/src/.../model.py:225`、`app.py:795-803`、`render.py:162` | thin card 三行替换 counts/硬编码 coverage；README 更新截图文字 |
| Tests ★ | `tests/test_work_core_vertical_slice.py` | terminal-resume 断言反转 + request_dispatch 用例迁移到 dispatch_execution |
| Tests ★ | `tests/test_work_core_resource_observation.py`、新增 `test_migration_007.py`、aggregate-query 用例、分叉枚举组合矩阵 | 枚举校验与回退守卫的正面+负面用例 |
| Docs | `docs/adr/0008-observation-level-and-verdict.md`（新）★措辞中立；ADR-0006 附录链接 | 固化两列语义与 REJECT 清单（防回潮的宪法条文） |
| Docs | plugins README、安装信任声明首屏、kit 说明 | 产品名可出现；loader "trusted code" 声明升级为用户文档 |

行数预算粗估：Core+迁移+测试 ≈ 300–400 行 diff；WorkBoard ≈ 60；插件 ≈ 5。**零协议、零实体、零 entry-point 组变更。**

---

# Exit criteria

≥8 项可操作退出条件，含任务指定的全部八类。每项附测量方法与命中动作。

| # | 条件 | 测量 | 命中动作 |
|---|---|---|---|
| E1 | **Evidence 字段多数永远为空/恒 UNKNOWN**：上线 60 天样本中非 UNKNOWN 行占比 <15%，且提不出任何一个能改善特定 slot 的 read-back 手段 | 抽样 DB + per-slot 统计 | 撤回两列的对外叙事（退化为内部审计行）；stop 投资 export/card |
| E2 | **Provider claim 无法区分 authority**：≥2 次审计发现插件在无对应 digest/无二次回读的情况下写 READBACK+PASS 且抽查工具抓不到 | 构造故意说谎 adapter 跑 kit + 生产抽查 | 词汇制度宣告失效 → Evidence 回退 C-路线（纯 artifact），删除面板染色 |
| E3 | **插件规范比写插件复杂**：kit/协议文档页数 > 最小 reference 插件 LOC（preview-resources=20 行是永久标尺） | 行数比 | 冻结立法、砍文档到一页；任何新协议提案需先交出 reference PR |
| E4 | **conformance 无法检测真实保证**：已知说谎 adapter 在 kit 下绿灯通过 | kit 开发自测（反向用例为第一公民） | kit 降级为 style-checker 并公告局限；不得用于任何对外声称 |
| E5 | **WorkBoard 仍是计数器**：thin card 落地两周后无人打开 board，或 claim 列仍未被任何面板消费 | 打开日志/panel 截图对比 | 接受 inspector 终局；E 卡叙事移交静态 export |
| E6 | **API version 频繁破坏**：12 个月内 >1 次 major bump 导致任一存量插件返工 | git log + 插件 churn | 触发版本纪律复审；连续两次即冻结 API 至有 ≥2 外部插件为止 |
| E7 | **Preview 只能靠脚本填 claim**：>2 个真实集成后，claims 的唯一书写者仍是仓库内 host script（provider 自身从不申报） | 按集成方统计 claim 来源 | 两列制度判定为成本>价值：裁撤 claim 面板功能，保留 DB 行仅供审计 |
| E8 | **用户无法理解 known/unknown**：viewer VQ5 类问题两轮盲测 <4/5 通过 | round-3 viewer test 协议 | 停用三色卡的营销使用，降为工程师调试视图；对外话术回到 refusal+sealed 双卖点 |
| E9 | **协议先于生态死亡**：6 个月无第二个非我方插件贡献 PR，同期协议/文档净增长 >30% | repo metrics | 触发"收敛冻结"：一年内只修 bug 不添协议；round-3 03 K4/K8 合流执行 |
| E10 | **downstream 绕过 claims**：宿主 adapter 直接写原生事件绕开 apply_observation 的枚举通道 | 数据库 diff 审计 | 说明词汇强制的 API 易用性失败——受控写入必须成为最省力路径，否则整改 API 而非宣传纪律 |

E1/E2/E7 是 Evidence 线的三重保险（字段死、词失真、无人写）；E4/E5/E8 是消费端三保险；E3/E6/E9 是协议端膨胀断路器；E10 是激励相容终检。

---

# Final verdict

## **B. 需要极小结构化 observation + 轻量 Plugin SDK。**

推理收拢：

1. **A 被否**：完整 Plugin SDK（scaffold/认证/矩阵）与十一字段 Evidence Core 的每一克重量都被本轮 attack 反复压回了地面；它们解决的是想象中的生态问题，代价是把二十行的 reference 插件变成三百行的合规作业。
2. **C 被否但不冤枉**："Evidence 全留插件 artifact" 在 trust、可比性、unknown 三个点上输给了两条受约束枚举列；但它赢下的那一半——bytes 不进 Core、比较逻辑留在 provider、Core 不当法官——被完整吸收为 B 的地基。
3. **D 被否**：terminal-resume 与 failed-idempotency 是行为缺陷，文档治不了；"只修文档"是对四轮已验证缺口的擅自赦免。
4. **E 不适用**：spine 有 328 个通过的测试看着，问题从来不是路线生死，而是克制与否。
5. **B 的执行句**：做 §triage 的四个 P0 + 一个两列迁移 + 一个聚合查询；冻结 extensions/resource_contracts/registry 为零 diff；Kit 以二十行插件为体量标尺、以"说谎 adapter 必须被抓"为自我检验；所有别的想法——好的也罢、宏大的也罢——统一进 §v1 boundary 的队列与 REJECT 名单，并且每一项都必须带着 ≥1 个真实消费者敲门才能出来。

最后一句话收束：

> 这个 Kernel 剩下的所有信誉都押在"它不说它做不到的话"上。两列受约束的枚举是这个承诺目前最便宜的兑现方式；第十一列 Evidence 字段、第三个 SPI 基类、第一台 scaffold 生成器——每一个都会让下一次诚实变得更贵。停在那里。

*本报告未读取其他 round-4 输出；除本文件外未修改任何代码、测试或文档；未执行 Git 操作。*
