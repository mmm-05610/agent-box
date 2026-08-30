# Round 3 · Work 与 Scope 专项裁决：Agent-Box Execution 是否必须属于 Agent-Box Work

日期：2026-08-27。本报告只读取 round-1 全部四份输出、round-2 两份输出、产品重校准文档与当前仓库代码；未读取任何其他 round-3 输出。未修改代码，未执行 Git 操作。

| 标签 | 含义 |
|---|---|
| **REPOSITORY VERIFIED** | 当前仓库代码、迁移、测试或仓库文档直接支持（含本轮核对的行号） |
| **ROUND-1/2 EVIDENCE** | 第一、二轮验证输出已确立的结论，本轮接受并引用 |
| **REASONED PROPOSAL** | 本轮推导的设计判断 |
| **REQUIRES USER VALIDATION** | 必须由真实用户行为检验 |

---

# Executive verdict

**判词：B. Work 改为 optional first-class aggregate。**

四模型比较结论：A（mandatory）被三轮证据一致否定；C-model（删除 Work、只留 external scope）在机制上完全可行但为时尚早——它牺牲了一个尚未被证伪的产品假设（Human 原生长期目标聚合），而该假设正是两份 round-2 输出各自产品的叙事起点 **[ROUND-1/2 EVIDENCE]**；D-model（移出 Kernel 成 extension）是不必要的工程动作前置。因此：

1. **语义判断（可由证据裁决）：`work_id NOT NULL` 这条强制耦合没有不可替代的回报，删除它的代价接近零、收益立即可见（12 个场景中 7 个不再需要伪造对象）。本轮即可裁定：改为 optional。** 推理主体是语义层，见 Deletion tests 的不对称性。**[REASONED PROPOSAL，基于 REPOSITORY VERIFIED 现状]**
2. **产品假设（不可由代码裁决）：人类会长期主动维护 Agent-Box 原生 Work（而不是让 Issue/Thread 投影顶替）。Work 因此保留为 Kernel 内一等对象而非立即降级 extension/删除。** 若第三轮实测推翻（引用型 round-2 candidate A 的 K2 判据类），应滑向 C-model → 对应本报告判词字母 D。**[REQUIRES USER VALIDATION]**
3. **Preview blocker（是）：standalone Execution 路径今天不存在**（入口三处全部强制先有 Work），无 Work 镜头与双入口 host-default 叙事无法诚实拍摄。修改范围极小（nullable + 一条查询），应在 Preview 前**先改 Core 再拍 Demo**。其余一切（external_scope 槽位、adoption UI、orphan board 视图）都不是 blocker，可延后验证。

模型字母与本报告判词字母映射：Model A→判词 A；Model B→**判词 B**；Model C→判词 D；Model D→判词 C。下文一律使用 Model 字母，仅在第 10 节 Final verdict 使用判词字母。

---

# Current Work reality

以下全部来自代码核对，非设计稿。整体基调：**Work 今天拥有的真实语义 = 身份 + objective 文本 + 三态 lifecycle + 显式 closure 记录 + membership 外键。此外一无所有。** **[REPOSITORY VERIFIED]**

## 1.1 字段与 lifecycle

`Work` dataclass（[models.py](../../../../src/agent_box/work_core/models.py)：57–71）：`id / objective / lifecycle / created_at / updated_at / closure_reason / metadata(≤16 条扁平字符串) / version(OCC)`。
`WorkLifecycle`（models.py:17–20）：`OPEN / COMPLETED / ABANDONED` 三值。

## 1.2 complete / reopen

`WorkService` 仅三个操作（[services.py](../../../../src/agent_box/work_core/services.py)：27–44）：`create_work(objective)`、`complete_work(id, reason)`、`reopen_work(id, reason)`；均带 `expected_version` 乐观并发检查（ConcurrencyConflict，repository.py:134–142）。complete/reopen 是纯治理记录——写入 lifecycle/reason 并 bump version，不产生任何其他副作用。

**ABANDONED 是枚举里的死状态**：没有任何服务路径能到达它（tests/test_work_core_services.py:64–77 是直接在 repository 层构造 ABANDONED Work 来测试拒绝行为）；EventType 里也**没有 WORK_ABANDONED**（events.py:16–29）。即"放弃"这个语义实际不存在，只存在"完成"。**[REPOSITORY VERIFIED]**

## 1.3 Execution membership 与数据库约束

- [004_minimal_work_core.sql](../../../../src/agent_box/migrations/004_minimal_work_core.sql):17 —— `core_executions.work_id TEXT NOT NULL REFERENCES core_works(id) ON DELETE RESTRICT`；索引 `idx_core_executions_work(work_id, created_at)`（:32）。
- `PRAGMA foreign_keys = ON` 已启用（core/db.py:89），RESTRICT 是真实生效的约束：有 Execution 的 Work 行不可删除。
- 创建门禁不止外键：`create_execution` 用 `INSERT … SELECT … FROM core_works WHERE id=? AND lifecycle=OPEN`（repository.py:162–170）——目标 Work 不存在抛 `WorkNotFound`，lifecycle 非 OPEN（completed/abandoned）抛 `WorkNotOpen`。测试覆盖两种拒绝（test_work_core_repository.py:96、test_work_core_services.py:48/73）。**含义：completed Work 连追加一条历史记录都不允许；Work 关闭后其时间线永久冻结。**
- Dispatch 表已按 006 迁移重建：`execution_id UNIQUE`（一 E 一 D）、`idempotency_key UNIQUE`、`inputs_digest`（006_resource_contract_inputs.sql）。005 为保留空号（防本地库跳号，005 头注释）。

## 1.4 responsibility intent 存在哪

`responsibility_intent` 不是 core_executions 列；它通过 `execution_created_event()` 归一化（≤256 字符、必填）写进 `ExecutionCreated` 事件的 data（events.py:46–80），读回走 `get_execution_responsibility_intent()`（repository.py:181）。事件表 append-only 且 `idempotency_key UNIQUE`。

## 1.5 Provider terminal 与 Work completion 完全解耦

projection/observation 路径（`observe_projection` / `apply_observation`，services.py:292–336）从不触碰 WorkService；Execution terminal 只写 projection 与 `EXECUTION_TERMINAL` 事件。WORK_COMPLETED 事件只能由显式 `complete_work` 发出。

## 1.6 WorkBoard 如何依赖 Work

- CLI 参数是**互斥且必填**的二元组：`work_id`（位置参数）或 `--new OBJECTIVE`（先建 Work 再打开）（plugins/agent-box-workboard/cli.py:23–25, 48–53）。**不存在无 Work 打开面板的方式**；DB 不存在时连只读模式都拒绝进入（cli.py:43–45）。
- 面板数据结构以 Work 为根：`build_workboard_model(repository, work_id)` 先 `get_work` 再 `list_executions(work_id)`（model.py:267+）；而 `list_executions` 只接受 work_id 这一维度（repository.py:97–107）——**孤儿 Execution 在今天的系统里既无法创建、也无法展示**。
- README 自述定位 "unified Host Console for one Agent-Box Work"；控制键 `n`(建 Execution)/`f`(explicit finish)/`w`(complete + reason)/`x`(reopen) 全部在 Work 语境下工作。
- Evidence 侧的已知缺口照旧：coverage 渲染硬编码（round-2 引 model.py L225），不影响本轮 scope 裁决。

## 1.7 实际上不存在的能力

acceptance criteria、owner/participants、obligation/deadline、evidence-gated closure、artifact 所有权、跨 Work 查询视图、abandon 服务路径、多对多 membership、移动归属、外部 scope 槽位、standalone 创建入口、retention 策略——以上在当前核心层**全部缺失**。其中前几项的缺失正是 round-1 判定"Work 未过删除测试"的原因 **[ROUND-1/2 EVIDENCE]**。

---

# Scenario matrix

## 2.1 四模型逐场景适配表

图例：✔ 天然支持｜◐ 可表达但绕｜✖ 强制伪造或不支持。C-model 指"删 Work、只留 external Ref"，D-model 指"Work 移出 Kernel 为可选包"（D-model 的执行面行为与 B 相同，差异仅在打包位置，表中合并标注）。

| 场景 | A mandatory | B optional | C-model / D-package |
|---|---|---|---|
| 1 standalone interactive Execution | ✖ 必造 synthetic Work | ✔ NULL 直接建 | ✔ 同 |
| 2 开放式长期插件开发 | ✔ 原生 | ✔ 原生（用则建） | C:✖ 丢原生锚点；D:◐ 装包才有 |
| 3 LangGraph Thread 发起 | ✖ Thread ≠ Work，硬转即伪造 | ✔ external/provenance scope 即可 | ✔ 同 |
| 4 Temporal Activity | ✖ Workflow ID 是事实上的 scope | ✔ 不触碰宿主身份 | ✔ 同 |
| 5 GH Actions CI verification | ✖ run/job 自带完成权 | ✔ CI ref + RunRef 记录即够 | ✔ 同 |
| 6 same-session E1/E2 continuation | ◐ 强塞同 W 会暗示同一责任 | ✔ E 才是断代单位，W 至多事后归组 | ✔ 同 |
| 7 四个并行 research Executions | ◐ 能用但 membership 无协作语义 | ✔ 同挂或全裸皆可 | ✔ 同 |
| 8 artifact 被两个项目使用 | ✖ 单 membership 与双重用途冲突 | ✔ INPUT-freeze 双向引用解决 | ✔ 同 |
| 9 Human 显式验收 | ✔ 有处落笔 | ✔ 建了 Work 就有 | C:✖ 无落点；D:◐ |
| 10 Issue closed 但 evidence unknown | ◐ 外部关闭 vs 内部完成冲突 | ✔ 两套 lifecycle 并行、呈现 divergence | ✔ 同 |
| 11 Work completed 而 workflow 继续 | ✖ 假完成信号误导 | ✔ completion 是一句被记录的话，非全局锁 | ✔ 同 |
| 12 无长期目标的一次高保障执行 | ✖ 最纯粹的伪造压力 | ✔ 本场景就是 nullable 的反例本体 | ✔ 同 |

## 2.2 各场景五问（按 Model B 裁定后的答案）

| # | scope authority | completion authority | Work 是否增加真实语义 | 双重状态风险 | 需 synthetic Work？ |
|---|---|---|---|---|---|
| 1 | 用户本人 | 用户 Finish 后自行判断 | 否 | 无 | **否（B 的成立条件）** |
| 2 | 用户 | 用户 | 是（chronicle 锚点 + 显式验收史） | 无（不复制 issue，若有 issue 则挂 external ref） | 否 |
| 3 | LangGraph Thread（宿主） | Host node/HITL | 否 | 无（不镜像 checkpoint/routing） | 否 |
| 4 | Temporal Workflow chain（宿主） | workflow/人 gate | 否 | 无 | 否 |
| 5 | CI run/PR（外部平台） | merge/release 权威 | 否 | 无（RunRef/head_sha 只是 evidence） | 否 |
| 6 | 每次 E 自带 | 每次独立 Finish | 部分（事后归组可读性） | 低（membership 不参与断代） | 否 |
| 7 | 发起者指定 | 发起者/汇总人 | 弱（只是同屏便利） | 无 | 否 |
| 8 | — | — | 否（ownership 属于产出 E） | 无 | 否 |
| 9 | Human | Human（complete+reason） | 是（这是 Work 唯一的强语义场景） | 与外部审批并存需注意（见 #10/11） | 否 |
| 10 | 双 authority 并存 | 外部已关单、内部 unknown 未清 → **允许 completed-by-external 与 open-with-unknown 同时为真**，UI 标 divergent 不阻塞 | 是（divergence 表达恰是内核价值） | 有，但设计目标是暴露而非消除 | 否 |
| 11 | Human + 外部引擎并行 | 内部 complete 是判定记录不是流程闸门 | 是（区分"我说完了"与"它还在跑"） | 有，处理规则同 #10 | 否 |
| 12 | 无人想命名 → 无 scope | 执行者 | 否 | 无 | **否** |

## 2.3 四个关键场景展开

**#8 artifact 被两个项目使用**：membership 一对一会把产物所有权错误绑定到单一容器。正确表达已存在：ArtifactRef 以 OUTPUT relation 归属产出 E；第二个项目的 E 把同一 ArtifactRef 冻结为自己的 INPUT（artifact-context contract 已支撑该用法）[REPOSITORY VERIFIED 机制，ROUND-2 EVIDENCE 候选 A 第 2 节同结论]。**不需要 m2m membership，也不需要 ownership 转移**。scope authority=两个消费方各自；completion 互不相干。

**#10 Issue closed 但 Agent-Box evidence 仍 unknown**：这是dual-lifecycle 的试金石。若强制镜像（A 或任何自动同步方案），要么阻断外部关单、要么制造假完成。B 下正确动作：GitHub close 动作作为 external-completion evidence 进入对应 E；Work 保持 OPEN 直至人查完 unknown 显式 complete(reason="closed upstream; unknowns accepted") 或 abandon。scope authority=GitHub（协作）/Agent-Box（责任窗口）分层；completion authority=Human 判定，外部系统只是输入。**[REASONED PROPOSAL]**

**#11 Work completed 但外部 workflow 继续**：completion 是"记录一次人说的话"，不是全局闸门；下游 LangGraph/CI 继续推进时新增的 Executions 无法再挂入该 Work（WorkNotOpen 门禁）[REPOSITORY VERIFIED]。这不是缺陷而是可辩护语义——但必须把它向用户显式说明（"完成后回到新阶段请开新 Work 或 reopen"），否则会表现为静默丢历史。此解释成本记为 B 的一条已知代价。**[REPOSITORY VERIFIED 门禁 + REASONED PROPOSAL 解读]**

**#12 无长期目标的一次高保障执行**：用户要的是 freeze/dispatch/evidence 循环，不是起名压力。A 下唯一出路是 `misc`/日期名垃圾 Work 堆——round-2 输出以 nightly webhook 修复为例独立推出同一反例 **[ROUND-2 EVIDENCE 候选 A §6]**。该场景是 nullable work_id 的直接论据，也是 Viewer 测试里最容易被识破伪造的地方。

---

# Responsibility and completion boundaries

八项边界一次说清；全程零新增实体。**[除注明外均为 REASONED PROPOSAL；现状判断 REPOSITORY VERIFIED]**

| 事项 | 放在哪里 / 由谁拥有 | 现状与裁定点 |
|---|---|---|
| responsibility intent | **Execution**（而非 Work）。今天持久化于 ExecutionCreated 事件 data，随 E 冻结后不可变 | 正确归位：intent 是一次尝试的属性。保持现状即可，不需新列 |
| Work objective | **Work.objective**，创建时的快照 | 保持现状。objective 描述"为什么有一组尝试"，天然属于聚合层 |
| Execution terminal | provider observation → projection（`EXECUTION_TERMINAL` 事件） | 这是**机器观测到的终点**，权限在 provider adapter |
| Human Finish | 目标语义：Core 的 finish(actor, reason) 记录，一经落定不可逆 | 当前只有 plugin-local 实现（tmux/codex provider 内部），**跨 provider aggregate 缺失** [REPOSITORY VERIFIED，第一轮同结论]。Finish ≠ terminal ≠ Work completion，三者不得合并字段 |
| Work completion | WorkService.complete + reason + version（唯一写路径） | 保持显式人工触发；provider terminal 永不推进（已是现状） |
| External completion | 只作为 evidence 进入某次 E；绝不回写 Work lifecycle，也不双向同步 | 关键红线：镜像外部关单 = 第二个 lifecycle 权威，会复活 #10/11 的冲突 |
| Continuation | 新 Execution + provenance lineage（约定键如 `continuation_of`）+ 旧 SessionRef 作为冻结 input（CodexContinuationV1 已示范该形态）| E 是断代单位；Work 只是可选的浏览分组。terminal E 仍可被 resume 的缺口是反向问题，属既有 MINIMAL FIX 清单，不在本轮扩议 |
| retention/ownership | 数据保留策略当前缺位；对象所有权规则：ArtifactRef 归产出 E，Ref relation 归 E，Work 行自身受 RESTRICT 保护不被连带删除 | retention 明确延后（涉及合规，超出 kernel 职责）；不代表可以永远不做，建议列为 v1 前必答问题 |

两句话总结权威序：**机器终点 ≤ 人为 Finish < Work completion（后者只是一句被审计的话，管辖力反而最小）；外部系统的 completion 永远只是证据输入。** 任何把三者合并的实现都是在伪造authority。

---

# External scope representation

先穷尽现有载体，再裁定每一个候选新增。原则：**每个新增都必须给出"不新增就无法表达"的反例，否则不加。** **[方法本身 ROUND-1/2 EVIDENCE（能力矩阵范式），具体裁定 REASONED PROPOSAL]**

## 4.1 现有载体盘点

| 载体 | 能表达什么 | 作 scope 的问题 |
|---|---|---|
| Ref 五类型 + INPUT/NATIVE/OUTPUT association | WORKFLOW_INSTANCE/RUN 类型的 Ref 已可用任意 `provider/native_id` 承载 LangGraph Thread、Temporal Workflow、GitHub issue/run 等 identity | **语义错位**：INPUT 参与 frozen binding 与 inputs_digest（scope 混入即污染合同）；NATIVE 语义是"运行时发现的 native identity"，拿来做创建前的归属声明是对 relation 词表的挪用 |
| ArtifactRef | 可共享产物 | 与 scope 无关 |
| event metadata | CoreEvent.data 受限字符串，append-only | 可记录但无稳定查询通路、非 per-execution 规范槽位 |
| `Execution.provenance` bounded map | **创建时可写、此后不变的受限 map** —— 可以承载 Tier-0 约定如 `provenance["external_scope"]="github-issue:org/repo#42"` | 无类型校验、无索引、无互斥约束；足以撑起 Preview 阶段的记录需求 |

结论：**Preview 不需要任何 schema 新增即可诚实记录 external scope（provenance 约定）**。

## 4.2 五个候选新增逐一裁定

1. **`work_id` nullable —— 采纳，现在就做。** 反例（不放开就无法表达）：场景 #1/#3/#4/#5/#12 中"明确无人想命名的执行"。代码层面 today 无解：构造器强校验（models.py:88–89）、NOT NULL FK、WorkBoard 双参数必填 [REPOSITORY VERIFIED]。逃逸方案"adapter 自动建骨架 Work"等于把强制藏进角落并制造 misc 垃圾堆，第二轮输出已作为失败形态论证过 [ROUND-2 EVIDENCE]。
2. **`external_scope` 专用列 —— 暂缓，条件触发的 Tier-1。** 现状反例（未来确需时的形态）：当产品承诺"跨上游按 scope 聚合检索"时，provenance 约定无法提供 (a) 索引查询 (b) `CHECK(work_id IS NULL OR external_scope IS NULL)` 这类**单一 scope 权威互斥完整性约束**——约定拦不住某个 adapter 既传 work 又写 provenance scope 造成双记账漂移。今天两条都还不是现实需求（multi-entry ≠ 产品价值 [ROUND-1/2 EVIDENCE]），故先约定后升级；一旦引入则推荐 xor CHECK + 局部索引。
3. **`scope_json` blob —— 拒绝。** 序列化 blob 使 scope 不可索引、不可加互斥约束、类型失检；相对 provenance 约定没有增益，相对专用列全是损失。
4. **generic Scope entity —— 拒绝。** 让 Kernel 持有 issue/thread/project 的规范化副本，直接违反"不复制 GitHub Issue/LangGraph Thread"的第一轮边界 [ROUND-1/2 EVIDENCE]；外部对象的真相永远留在其 authority，Agent-Box 只存 typed Ref。
5. **多对多 Work membership —— 拒绝。** 它破坏单一 completion 权威（两个 owner 谁说了算？）；唯一的真实用例 #8 已由 artifact INPUT-freeze 模式解决 [见第 2.3 节]。

---

# Database/API consequences

选择 B 后的具体后果清单（全部只列方案，本轮未实施）：**[REASONED PROPOSAL]**

1. **`work_id` nullable 是否足够：schema 层足够**。它解除存在性强制；配合现有 WorkNotOpen 门禁继续保证"挂载必须发生在 Work 存活期"。仅 nullable 不能表达的只剩 scope 槽位的完整性约束与索引（见 4.2 第 2 条，Tier-1 条件触发）。
2. **standalone Execution 如何创建**：`ExecutionService.create_execution(work_id=None, …)` 分支 + 一个 headless verb（如 `agent-box create-execution`）补齐 CLI 面；WorkBoard 不需要为此改动主流程。
3. **以后如何归入 Work**：只允许从 NULL 一次性 adoption（新小服务方法 + 新 EventType 如 EXECUTION_GROUPED 追加事件），理由见 5。
4. **是否允许从一个 Work 移到另一个**：不允许（v1）。反例支撑规则：没有任何 12 场景需要 move 而不能改用"另一 Work 重开 + adoption 语义"替代；而 move 会破坏 chronicle 的 append-only 直觉并使 membership 历史需要一个二级账本。成本大收益无。
5. **是否允许多个 Work**：不允许。单一归属保住唯一 completion 权威；跨项目共享走 artifact 引用（2.3/#8）。
6. **Work 删除/关闭对 Execution 的影响**：RESTRICT + foreign_keys=ON 使含子 E 的 Work 行物理不可删 [REPOSITORY VERIFIED]；completed Work 继续拒绝新增（现状门禁不变），已有 E 自然跑完 Finish 不受阻。reopen 与 abandoned 服务路径维持现状（abandon 缺口见 9）。
7. **query/index**：现有 `idx_core_executions_work` 继续服务常规列表；为孤儿增加 partial index（`WHERE work_id IS NULL`）+ `list_unassigned_executions()` 读接口。CLI 优先暴露，board 二期跟进。
8. **migration compatibility**：SQLite 不能原位 DROP NOT NULL，需要表重建（rename→create→copy→swap，006 迁移重建 dispatches 时已留下 archive 表先例 [REPOSITORY VERIFIED]）。当前无生产装机负担，沿 006 模式新建 007 迁移风险低；旧路径 legacy works/work_attempts 不受影响（004 已声明 additive 边界）。
9. **WorkBoard 如何显示 orphan Execution**：v0 方案 = CLI 只读列表 + board 启动信息提示 N 条 unassigned；v1 方案 = board 增加"Unassigned"分区或从孤儿 ad-hoc 建组。Provider API **零影响**：ExecutionStartRequest 只含 execution_id/dispatch_id/digest/resolved inputs，binding 不感知 scope [REPOSITORY VERIFIED 结构]，这保证了"scope 归属变化永不改写冻结合同"的不变量。

---

# Demo implications

围绕"A 型 Demo（以 Work 开场）与中立 Kernel"回答五问：

1. **Preview 可否强制从 Work 开始？** 作为**这一支视频/board 流程的编排选择可以**，但它必须是表述为 WorkBoard Host 规则的东西，而不是 Agent-Box 合同的暗示。机制上 B 落地后两者都真实可达。
2. **这是否只是 WorkBoard 的 Host 规则？** 是，且应当这样声明。WorkBoard 今天的交互前提（互斥参数、以 Work 为根的 model）属于它自己的 UX 决策层 [REPOSITORY VERIFIED]；Kernel 从 B 之后不再给它背书。声明句式建议固定："本控制台按 Work 组织；Kernel 允许无 Work 的执行。"
3. **Viewer 是否会误以为所有调用都必须有 Work？** 若镜头里从未出现第二条路径，会——而且会顺着误读出"A 型是产品本质"的错误推论（round-1 viewer comprehension 框架下这是典型失败信号："Work 与我的调用是什么关系"答不出）[ROUND-1 EVIDENCE 方法 + REASONED PROPOSAL 预测]。
4. **怎样在 Demo 中准确表达？** 三件套：(a) 每个 execution 卡片带 caller/scope 行（`caller=host:langgraph:… scope=T-9c2` 或 `caller=direct:cli scope=—`）；(b) 旁白/字幕钉一句"Work 是给人看的目标锚点，不是执行的准入条件"；(c) receipt 并排镜头沿用第二轮的两镜头对拍法，证明同一合同两种 scope **[ROUND-2 EVIDENCE 手法]**。
5. **是否需要额外展示 standalone Execution？** 需要，且放在开场 15–20 秒（冷启动变体已在第二轮候选 A 的 90 秒版中排练过 [ROUND-2 EVIDENCE]）。它同时完成两件事：先声夺人地证明中立性；把 #12 场景的真实性演给观众。若无此段，B 判词对自己的自检义务（"去掉 Work 是否仍成立"）就没有履行 **[ROUND-1 EVIDENCE removal-test 义务 + REASONED PROPOSAL]**。

---

# Deletion tests

四个模拟删除，各自真正失去的东西。前三个基于现状代码推演，第四个是假想释绑。**[结论 REPOSITORY VERIFIED / REASONED PROPOSAL 混合，逐条标注]**

| 删除对象 | 真正失去什么 | 保住什么 |
|---|---|---|
| **① Work object 整体**（C-model） | (a) Human 原生长程目标的 objective 锚点与其时间线容器；(b) 唯一落在 Kernel 内的显式验收记录（complete reason/version 化 transitions——GitHub/Linear 也有等价物，但它在你自己的证据栈里这件事没了）(c) WorkBoard 的组织根与所有 w/x/f 快捷键语境；(d) 惰性/显式归组的落点。约 services.py:27–44 的 18 行服务 + 一张表 + 两个事件类型的篇幅 | 整条 frozen→dispatch→evidence→continuation 合同链完好无损。这正是"Work 非执行合同的一部分"的最硬证据 **[REPOSITORY VERIFIED]** |
| **② 仅删 complete/reopen** | Work 退化为文件夹/tag：无 lifecycle、无验收语义 | 无独特语义残留。推论：**completion 记录对就是 Work 的不可还原内核**；若某天判定这两条也无价值，应整体删除而非留壳 **[REASONED PROPOSAL，与 round-1 subordination 表 completion-authority=1 一致]** |
| **③ WorkBoard Work view** | 纯呈现层损失：时间线 UI、composer 入口 | CLI/export 仍可达全部事实；board 定位本来就该是 inspector [ROUND-1/2 EVIDENCE]。损失最小的删除项 |
| **④ 仅删 mandatory work_id**（B 的实施动作） | **语义上什么都不失去**：三个 Work 服务操作、全部既有事件、RESTRICT 约束、board 流程原样保留；变化的只是"不再强迫每个执行找一个主人" | 换来场景 #1/#3/#4/#5/#12 原生成立，demo 冷启动真实化，kernel 独立性可测。**得失严重不对称——这是本轮全部论证的支点** |

不对称性判读：④ 得大于失且几乎无偿；① 失大于得且时机未到；②③ 是辅助洞察（用于圈定 Work 的价值内核与呈现层可牺牲度）。

---

# Core boundary assessment

六准则 × 四模型快评（✔ 符合 / ◐ 张力 / ✖ 违反）。**[ROUND-1/2 EVIDENCE 准则来源，评分 REASONED PROPOSAL]**

| 准则 | A mandatory | B optional | C-model 删 Work | D-model extension 包 |
|---|---|---|---|---|
| 不拥有 workflow progression | ✔ | ✔ | ✔ | ✔ |
| 不复制 GitHub Issue/Thread | ✖ 强制归属逼用户二选一宿主 | ✔ issue 只是 ref/metadata | ✔ 更彻底 | ✔ |
| 不迫使 Host 创造假对象 | ✖ 四类宿主场景全是伪造压力 | ✔ NULL/scoped 均原生 | ✔ | ✔ |
| 保留 direct Human 长期目标体验 | ✔ | ✔ | ✖ 失去自有锚点 | ◐ 装包后才恢复 |
| 不破坏已发生历史 | ✔ | ✔（006 式 rebuild 先例）| ✔ | ◐ 迁移打包成本 |
| 不引入新的 Core ontology | ✔（反向：它就是今天的 ontology）| ✔ 零新增实体 | ✔ 减一个 | ◐ 引入包边界概念 |

综合：**B 六项全 ✔/低张力，是最贴合 Kernel 中立性的形态。** C-model 在"不复制/不造假"两项更彻底，但在第四项牺牲未被证伪的产品假设——正确的姿势是把它做成 B 的**触发式继任者**而非立刻执行：当 work-usage 实测出现 K2 型信号（Agent-Box Work 被外部投影全面顶替、human 从不打开）时降级路径成立 [ROUND-2 EVIDENCE 判据形态]。D-model 唯一的独立理由是 Kernel 纯洁性的美学追求与第三方嵌入 wanting less surface；等 B 平稳后再抽取成本更低（因为依赖方已经学会容忍 Work 缺席），故顺位最后。

---

# Minimal decision

**1. 现在是否必须修改 Core？** 语义层早已越线（三轮共认），工程层这次必须回答：**是——但只有一个变更达到"现在就做"级别：work_id nullable。** 其余全部进延后队列。理由：它是 12 个场景中 7 个的解锁点、是 Preview blocker、且 deletion-test 证明近乎无损。**[REASONED PROPOSAL]**

**2. Preview 前是否必须修改？** 是。否则 (a) no-Work 镜头作假或穿帮；(b) dual-entry host-default 叙事塌回 A；(c) 第三轮实测 orphan/direct usage 的数据根本采不到。**[REASONED PROPOSAL]**

**3. 可以延后验证的部分**：
   - external_scope 专用列/xor 约束（Tier-1，等待 grouped-query pull 数据）；
   - standalone 的 board 分区视图（先 CLI 列表顶替）；
   - abandon 服务路径补全（小，但无场景压力）；
   - adoption-from-NULL 服务动词；
   - retention/ownership 策略（合规议题，独立立项）；
   - Move/m2m —— 建议为"永久拒绝"除非出现新的可表达性反例。

**4. 如果暂不修改，如何避免进一步耦合**：（不推荐的路线，但给出止损措施）冻结一切隐含 mandatory 的新功能面（composer 深化、按 Work 的批量操作、教程口径）；对外文档给 Work 强制打 known-limitation 标签；每次新的宿主 adapter PR 若被迫建 Work 都记录在案——每一条这类记录都是未来迁移面的利息。**[REASONED PROPOSAL]**

**5. 若修改：最小文件/API/migration 范围（仅列范围，本轮未动代码）** **[全部 REPOSITORY VERIFIED 现状 + REASONED PROPOSAL 范围]**

```text
src/agent_box/work_core/models.py        Execution.work_id: str | None；构造校验放宽
src/agent_box/work_core/services.py      ExecutionService.create_execution 接受 work_id=None
src/agent_box/work_core/repository.py    create_execution 拆分：NULL 直插 / 非 NULL 保留
                                         INSERT…SELECT OPEN 门禁；新增 list_unassigned_executions()
src/agent_box/work_core/events.py        （可选）EXECUTION_GROUPED 事件类型——adoption 用，
                                         不做 adoption 则不动
migrations/007_work_optional.sql          core_executions 重建（006 archive 先例），partial index
tests/  test_work_core_services.py / _repository.py / _vertical_slice.py /
        test_work_core_input_dispatch.py  补 standalone 用例；调整必填假设的既有断言
plugins/agent-box-workboard              v0 仅启动横幅 + CLI --list-unassigned；
                                         主界面 zero-change
```

排除在范围外的诱惑（明示不做）：scope_json、Scope entity、m2m、move API、board 大改、retention。

---

# Final verdict

**B. Work 改为 optional first-class aggregate。**（对应判词字母 B；Model 字母同为 B）

四方澄清：

- **哪一项是语义判断**：mandatory 耦合无可赎回的回报、释绑近乎无损（Deletion tests ④ 的不对称性）——依据可复核的代码事实与前两轮一致性结论作出，属 **REASONED PROPOSAL on REPOSITORY VERIFIED**，接受技术性反驳但不接受重证。同判归：零新增 ontology 地达成 optional（nullable + provenance Tier-0 约定）、五个 scope 新增候选的采纳/拒绝清单、single-membership/move 禁令、三层完成权威排序。
- **哪一项是产品假设**：「Humans 会持续把长程目标放进 Agent-Box 原生 Work 并回来做显式验收」——这一条决定 Work 该活在 Kernel（本次裁决）还是迟早走 C-model/extension。**[REQUIRES USER VALIDATION]** 配套测量信号：direct-user 是否自发创建≥1 个存续 >2 周的 Work；human-opened Work 占比；K2 型外部投影覆盖率 [ROUND-2 EVIDENCE 判据]。
- **哪一项需要用户验证**：上述产品假设，加上 standalone 高频场景的真实频率（验证 nullable 的解放是否真被使用而非仅被容忍）、issue-first 工作者对 dual-lifecycle divergence 呈现的理解度（scenario #10 的 UI 承诺）。
- **哪一项是 Preview blocker**：standalone 路径缺失（= 第 9 节最小修改范围中的 models/services/repository/migration/tests 五件套）。blocker 的解法必须在拍摄任何无 Work 镜头之前落地；WorkBoard orphan 分区、external_scope 列、adoption 动词等均明确**不阻塞** Preview。

一句话收束：**Work 应该是 Kernel 里一位不再检查门票的一等公民——Viewer 来去自由；至于这位公民最终会不会成为主角，交给第三轮的用户证据投票，不由 schema 提前代投。**
