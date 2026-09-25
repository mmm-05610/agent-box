# F3 对话流与交互研究报告（FE-CONVERSATION，Phase 0 研究收口）

- 角色/任务：F3 / FE-CONVERSATION（Phase 0，RESEARCH_ONLY，无实施批文）
- 基线：FE 85cc3cd01497bb185be417a38dbeeeca4edb08e6（work/hd001-f3，clean，实测）；契约基线 wire/1（C-0016 第 8 条）
- 会话：Qoder CLI + Qwen3.8-Flash（C-004/C-007），owner_generation 1，接管登记见 outbox/F3-0005
- 预算：真实模型测试/Codex 审阅消费 **0**；未读密钥；未启动进程/服务
- 证据口径：本树源码实读（file:line）；assistant-ui 0.15.21/@assistant-ui/core 源码实读（旧树 `node_modules/**/src`，只读）；复用结论见同批 reports/reuse.md（前手已交付，本会话承认并补记）
- 外部候选：openai/codex TUI 已实读（本机 clone bfca033，Apache-2.0），证据见 §3.4 与 reuse.md 补记行。

## 0. 结论摘要（请 C 裁决、FC 汇合）

1. **对话区不需要任何新库、不需要从零组件**：现 extensions/agent-conversation（view.tsx 106 行 + styles 49 + entry 18）与 assistant-ui 0.15.21 原语已覆盖流式/思考/工具卡/状态三态；Phase 2 工作量为"存量迁移 + 4 处语义修正"（见 §6 精确路径）。
2. **审批改为对话流内联呈现，撤销 right 区常驻视图**：右下区"无功能不展开"的机制**workbench 已经实现**（shell.tsx:40/96-102），F3 只要不再注册 `agent.interactions` 到 `region:'right'`，右栏即自动收起为 0%——**零核心改动、零新增面板**。外部同向证据：codex TUI 的审批既不在侧栏（`bottom_pane/approval_overlay.rs:173,579`），其裁决结果落为内联历史单元（:394-399），空区组件零高渲染（`pending_thread_approvals.rs:38-40`）。
3. **停止=请求，确认=服务事实**：不得使用 assistant-ui 的 `ComposerPrimitive.Cancel`/`onCancel` 承担产品停止（库把它当本地取消：`cancel: store.onCancel !== undefined`、`cancelRun()` 抛错、附带 composer 草稿回滚语义），保留独立"请求停止"按钮 + `stop-requested` 提示位；两适配器的 stop 前置条件不一致（Pi 允许 `starting`，Codex 只允许 `running`），而 `AgentCapabilities` **在全仓任何 UI 中都未被消费**（grep 仅命中测试夹具 `agent-sessions.test.ts:8`）→ 视图无可信信号，今晚保持 `starting` 禁用并把"缺粒度"登记为契约层缺口，不臆造可停止态（§5.3）。
4. **model/思考强度入口的最小隐藏=删 F3 视图内的 options 渲染块**（view.tsx:85-88），不动 `AgentOption`/`setOption`/适配器（codex 用 options 值钉住下轮 model/effort：client.ts:244-245；BUDGET 要求 Codex 测试显式 gpt-5.6-luna，该能力必须留在连接/测试配置侧，不由 UI 承担）——**零契约改动、零配置管理扩张**。
5. **`agent.open` 归属建议迁出 conversation 包**：现由 agent-conversation 注册（entry.tsx:12-15）并直接 `workbench.open('agent.sessions')`，即对话包知道会话视图 id（跨包耦合）；FC-0010 口径"入口命令由属主包注册"→ 建议 Phase 2 随 SessionBrowser 拆分一并迁给 **agent-sessions（F2）**，F3 附议，需 C/FC 定稿。

## 1. 对话/交互现状事实（本树实读）

| 面 | 事实与位置 |
|---|---|
| 挂载 | `agent.sessions`→left、`agent.conversation`→main、`agent.interactions`→**right**（agent-conversation/src/entry.tsx:10-11；agent-interactions/src/entry.tsx:9） |
| 导航/命令 | `agent.open`（title "Agents"）由 conversation 包注册，执行时打开 sessions+conversation 两视图；同包注册 `agent.navigation`（slot navigation）（entry.tsx:12-15） |
| 运行时 | `ConversationThread` 以 `key={connectionId:sessionId}` 重挂 + 每会话一个 `useExternalStoreRuntime`（view.tsx:65-78,105）；与库"一个 runtime=一个主线程"模型一致（reuse.md 行1） |
| 消息映射 | `convertMessage`：reasoning→`reasoning` part、text→`text`、tools→`tool-call`（`toolCallId=tool.id`，args 双写 `args/argsText`，result 缺失=undefined）；RunStatus→库 status：`starting/running/stop-requested`→running、`cancelled`→incomplete(cancelled)、`failed/unknown`→incomplete(error, error=状态名)、其余→complete(stop)（view.tsx:42-55） |
| 组件 | `TextPart`= `Text smooth={false}`；`ReasoningPart`= 自研 `<details>Thinking`；`ToolPart`= `<details>{toolName} · Running/Result` + args/result `pre`（view.tsx:56-61） |
| 状态提示 | run 徽标 `data-status`（只取该会话 `runs` 的最后一个：view.tsx:69-70,80）；断连横幅"结果未知"（81）；`stop-requested` 提示（82）；`unknown` 提示（83）；`diagnostic`（84）；options 条（85-88）；actionError（97） |
| composer | `ComposerPrimitive.Input + Send`；运行中另挂"Request stop / Stop requested"按钮，`starting` 与 `stop-requested` 均 disabled（91-95）；**未使用 `ComposerPrimitive.Cancel`、未提供 `onCancel`、未提供 queue** |
| 交互卡 | `InteractionCard` 覆盖 kind=approval/choice/confirm/input/editor；`state!=='pending'` 时 fieldset disabled 且**不再渲染任何动作**；仅 `error` 时提示；resolved/expired/unknown **没有终态呈现行**（agent-interactions/src/view.tsx:18-48） |
| 空态 | 右栏恒显示 "Requests" 标题 + "No requests need a response."（同上:53-54） |
| 适配器事实源 | Pi：`stop()` 前置 `running\|starting`（client.ts:283-289），`agent_settled` 无最终 stopReason → `unknown` + diagnostic "Stop was requested; the run ended, but its outcome was never confirmed"（185-196）；断连 → run `unknown` + pending/responding 交互转 `unknown`（123-127）；Codex：`interrupted`→`cancelled`（43）、进程 exit → 运行中/stop-requested 转 `unknown` + 交互转 `unknown`（100-104）、turn 关闭仍 pending → `expired`（132）、`stop()` 前置仅 `running`（251-256） |
| 测试现状 | 对话产品视图**无应用级门**：`apps/desktop/scripts/test-agent-ui.mjs` 只启用 `example.agent-ui`（tmpdir 隔离 userData，19 行实读）；语义证据在 `agent-pi.test.ts:119,223`（stop 永不臆断）与 `agent-ui-probe.test.tsx`（三态区分、tool 合并、跨会话隔离） |
| 示例件 | `examples/agent-ui-probe` 是**受控夹具**探针，用了 `onCancel`+`ComposerPrimitive.Cancel`（view.tsx:36,57）与中文文案"执行中/已返回/停止"——属例独立构建输入（AGENTS.md），不构成产品模式，且其文案与产品视图英文文案**当前不统一**（§5.4） |

## 2. assistant-ui 0.15.21 语义与本任务的取舍（源码级）

采用（直接复用，均为现用法）：`useExternalStoreRuntime` + `convertMessage`（外部权威消息）、`Thread/Message/MessagePart/Composer` 原语、`tool-call` part 的 `toolCallId` 合并与 React key、`Text smooth={false}`（不加库侧时序，如实显示）、status 三态（complete/incomplete-cancelled/incomplete-error）。

明确不用（证据在 reuse.md 各行，此处记决策）：

1. **`onCancel` / `ComposerPrimitive.Cancel`**：core `external-store-thread-runtime-core.ts:287` `cancel: this._store.onCancel !== undefined`；`react/src/primitives/composer/ComposerCancel.ts:11` disabled→return null；`core/src/store/primitive-predicates.ts:16-17`；`cancelRun()`（:880-882）不支持即抛错，且该 runtime 的 cancel 路径带 composer 草稿/resync 语义（:662,873 注释）。→ 产品停止是**跨进程请求**，确认来自服务事实（Pi 只认最终 `stopReason==='aborted'`），把它接到本地 cancel 会造成"看起来已取消"的假事实。保留独立停止按钮（view.tsx:94-95 现形）。
2. **composer queue / steer**：`isRunning` 且无 queue 能力时 Send 自行卸载（`ComposerSend.ts:11-16`、external-store-thread-runtime-core.ts:700-703）。今晚无排队需求→不接入，但须承认副作用：运行中无法输入下一条（现实现同样如此，因另挂停止按钮而可用性问题可接受）。
3. **thread-list / messageRepository / 内置 approval 数据模型**：后端为权威（同 F2 结论）；approval 模型绑在 tool-call part 上，与本契约 `AgentInteraction` 独立生命周期（可无宿主消息、可 expired/unknown）不匹配（`core/src/types/message.ts:230-296`）。仅借鉴其"内联在消息流中"的位置（§3）。
4. **chainOfThought 模式**：已废弃；reasoning 用 part + 自研折叠壳。

## 3. 审批/输入呈现落点

### 3.1 约束（不得违反）
- CHARTER/PLAN/角色卡：不强制审批占右栏；右下区今晚无范围内功能就不展开；审批须显示为**服务事实**并保有其 `pending/responding/resolved/expired/unknown` 生命周期（contract.ts:44-54）。
- 切换会话≠取消，异步请求必须绑定上下文：`AgentInteraction.sessionId/turnId` 已具备（contract.ts:46-47）——现右栏把**所有会话**的交互混列（view.tsx:51-52 只按 `agent.interactions` 全量渲染），属语义缺陷。

### 3.2 方案对比
- **A 内联进对话流（推荐）**：pending 卡按 `turnId` 归属渲染在该轮消息序列末尾，`responding` 显示"已提交，等待服务确认"，终态折叠为一行结果（resolved 显示裁决、expired 显示"请求已失效"、unknown 显示"结果未知"）。理由：库的 approval 位置即内联；workbench 空区自动收起（shell.tsx:40,96-102）；避免"必须开右栏才能批准"的强塞；符合 CHARTER 学习 zcode/Codex 风格。
- **B 动态注册/注销右栏视图**：pending 0↔1 时 dispose/重新 `addView`。可保留队列观，但布局尺寸抖动、收起态与用户手动展开互相打架，且 region 有视图即占位（`has` 只看注册数）。列为备选（若 FC 统一风格需要队列）。
- **C 维持现状**：违反"不强制占右栏"与空区规则，**不采纳**。

### 3.3 落地形态（Phase 2 提案，不含实施）
- `plugins/agent/interactions` 导出 `<InteractionCard>`（现组件迁移 + 补终态行 + 按 `sessionId` 过滤）与 `usePendingInteractions(sessions, sessionId)`；`plugins/agent/conversation` 在线程内渲染 pending 队列（同会话），右栏视图注册撤除。
- 跨会话"还有 N 条待回应"提示：由 interactions 包注册 **statusbar 计数**（`{kind:'component', slot:'statusbar'}` 已存在，FC-0010 口径"组件按属主包注册"），不进右栏、不新增面板。
- 依赖：conversation→interactions 单向包依赖（两包同属 F3 写域；打包/lockfile 归 F0 FE-PREP 步骤 7 与 FC 串行安排）。
- **pending 卡的具体位置**（吸收 §3.4-1/2 证据后的定案建议）：渲染在**线程末尾、composer 之上**（对话区内联，非覆盖层），保持输入框仍可用（区别于 codex 的 composer 覆盖形态，理由：本任务同一 Harness 多会话且 composer 不被审批夺走更符合"如实显示、不隐式阻塞"）；裁决落地后该卡折叠为一行终态并留在时间位置，后续消息继续在其下方追加。

### 3.4 外部候选实读：openai/codex TUI（clone bfca033，Apache-2.0）
证据（repo 相对 `codex-rs/`）与对本任务的四条结论：

1. **审批不在右栏**：pending 审批由 `bottom_pane/approval_overlay.rs`（`ApprovalOverlay` :173，实现 `BottomPaneView` :579）作为**临时覆盖在 composer 位置**的列表选择视图；模块文档称其把 exec/apply-patch/MCP elicitation 请求转为选择视图（:1-2）。排队/延后在 `bottom_pane/mod.rs:1660 push_approval_request`、:705-711（打字空闲后才提升最旧延后项）；跨 thread 的 pending 以 composer 上方横幅呈现（`bottom_pane/pending_thread_approvals.rs`）。→ **支持"审批属于对话主区、不占侧栏"**（我们采纳方向，但不复制其"覆盖输入框"的独占形态，见下）。
2. **裁决结果成为内联历史单元**：用户选择后经 `AppEvent::InsertHistoryCell` 插入 `history_cell::new_approval_decision_cell(...)`（approval_overlay.rs:394-399），文案映射在 `history_cell/approvals.rs:24-37,45,159-255`（Approved "You approved…this time" / Denied "did not approve" / guardian "denied" / TimedOut "Review timed out…" / Abort "canceled the request"）。→ 我们的 **A 方案（pending 内联卡 + 终态折叠为结果行）与其同构**，且时序严格 append，与"按服务事实到达顺序如实显示"一致。
3. **明确不照搬的一处**：远端已解决（本端未知）的请求，codex 走 `chatwidget.rs:1036-1037`（注释 "A remotely resolved request must not remain user-actionable"）→ **静默移除提示且不写结果行**（`app/app_server_events.rs:194 dismiss_app_server_request`）。我们契约有显式 `expired/unknown`（contract.ts:53）且章程要求如实显示服务事实 → **F3 渲染终态文本行，绝不采用"消失即结论"**。此为学习参考后的主动偏离，登记于此。
4. **其余可借鉴点**：(a) 停止=请求、确认=服务事实的两段式（`chatwidget.rs:1887-1895` 立即清队列是乐观 UI；确认来自 `TurnStatus::Interrupted` → `protocol.rs:427-437` → `input_restore.rs:264-274` 才落终态）——与我们 view.tsx:82/94-95 的分段一致；(b) 工具按 `call_id` 路由进度（`exec_cell/model.rs:64-77,122-126,190-194`，完成态 `✓`/`✗ (exit_code)`：`exec_cell/render.rs:225-230`）——与 `toolCallId` 合并同构，可参考其"退出码进标题行"；(c) 思考：完成后的 reasoning 只保留在 transcript（`history_cell/messages.rs:660-677` `transcript_only=true`，:360-366 活动行不显示），空 parts 跳过（:679-690）→ 佐证"折叠壳 + 服务未给思考就不渲染单元"；(d) 断连：`chatwidget/reconnect.rs:9-31` 保留可编辑输入、**绝不自动重发排队提交**、标题行"Reconnecting…"、transcript 落 "Connection lost. Attempting to reconnect…" → 列为 F3 断连纪律（我们现实现无自动重发路径，符合）；(e) 空区自动零高（`pending_thread_approvals.rs:38-40`）→ 与 workbench `has[r]` 收起机制（shell.tsx:40）同思路，A 方案撤右栏注册即自然收起。
5. 许可证：根 `LICENSE` 为 Apache-2.0 正文，`codex-rs/Cargo.toml:160 license="Apache-2.0"`、`tui/Cargo.toml:5 license.workspace=true`；引用为**风格/交互参考，不复制代码**（无移植 Rust TUI 到 React 的问题）。

## 4. model / 思考强度入口的最小隐藏

- 现状：`agent.options` 全量渲染为 select（view.tsx:85-88），Pi 产出 `model`/`thinking`（agent-pi/src/client.ts:314-320），Codex 产出 `model`/`effort`（agent-codex/src/client.ts:303-308）。
- 提案（**最小、零契约改动**）：F3 在对话视图**移除 options 渲染块**（连带 `service.setOption` 的 UI 调用点），即"删除 model/思考强度操作入口"。`AgentOption`/`setOption`/`AgentCapabilities.models|modes` **保持不动**（属公共契约与连接器域，非 F3 写域；删除它们会扩大改动面并破坏 Codex 下轮 model 钉住路径 client.ts:244-245）。
- 不做：不引入任何"配置/Profile/Provider/Model 管理"面、不做按 option id 猜名的过滤开关（那是扩张，不是隐藏）。
- 若后续需要区分"非 model 类可选参数"（今晚无此需求）：需公共契约新增中立分类字段 → C 决策 + F1/连接器域共同改，**不属今晚范围**，此处仅登记为潜在后续。
- 真实测试提醒（给 C/H）：入口隐藏后，Codex"每次显式指定 gpt-5.6-luna"与 Pi"沿用已有配置"仍必须在**测试配置/连接器侧**满足；UI 不再是显式指定通道。BUDGET 的该约束不受本报告影响。

## 5. 统一状态与文案（对话区呈现层，不改判定语义）

### 5.1 词表（RunStatus，contract.ts:5）
| 服务事实 | 徽标 | 提示位 | 停止按钮 |
|---|---|---|---|
| starting | 启动中 | — | 见 5.3 |
| running | 运行中 | — | 可用（"请求停止"） |
| stop-requested | 停止已请求 | "停止已请求，等待服务确认；期间结果未知"（现 view.tsx:82 英文对应） | 禁用并显示"停止已请求" |
| completed | 已完成 | — | 隐藏 |
| cancelled | 已取消 | 消息尾标"本轮已取消" | 隐藏 |
| failed | 失败 | `MessagePrimitive.Error` 通道 | 隐藏 |
| unknown | 结果未知 | "结果未知（断连/未确认）——不推断为成功或取消"（view.tsx:83 + Pi diagnostic:195） | 隐藏 |
- 消息级映射不变（§1 表）；`unknown` 借 error 通道但**文案必须显示 unknown**，不得渲染为"失败"（现 `error: message.status` 已透传，view.tsx:53）。

### 5.2 连接/交互状态
- 断连横幅沿用"运行结果未知 + 从连接处重连"（view.tsx:81），归属提示语**不得**写"已停止/已取消"。
- 交互：pending→"等待你的回应"；responding→"已提交，等待服务确认"；resolved→"已回应：<choice/确认/取消>"；expired→"该请求已失效（未回应即结束）"；unknown→"该请求结果未知"。语义源：Pi 123-127/307、Codex 100-104/132/259-280。**F3 纪律：终态一律落成文本行，不得像 codex 那样让远端已解决的请求静默消失（§3.4-3）**。
- 断连：composer 已有输入内容保留可编辑、**任何情况下不自动重发未确认提交**（参考 codex `chatwidget/reconnect.rs:9-31`；本树无自动重发路径，符合，登记为回归约束）。

### 5.3 停止能力差异（补证后的定案建议：今晚**不改**，登记缺口）
- 事实：Pi 允许停止 `starting`（agent-pi/src/client.ts:283-289 及 :285 注释），Codex 仅 `running`（agent-codex/src/client.ts:251-253）；产品视图对 `starting` 一律禁用（conversation/view.tsx:94）。
- **关键补证**：`AgentCapabilities`（contract.ts:7-15）**在任何 UI 中都没有被消费**——全仓 grep 仅出现在测试夹具 `apps/desktop/src/agent-sessions.test.ts:8`，两个适配器都只声明 `stop:'supported'`（agent-pi:11、agent-codex:22）。因此视图**没有任何可信信号**可判断"当前 run 是否可停止"。
- 结论（避免臆造与避免扩张两条都满足）：
  1. 今晚保持现状（`starting` 禁用）——不产生错误承诺；点击也不会误停。
  2. 若产品要放开"启动中即可请求停止"，需要**公共契约**给 `stop` 增加"可停止状态集合"粒度（新字段/新枚举），属 C 决策 + 连接器域共同改，**F3 不主张在本轮引入**（不扩配置、不扩契约）。
  3. 反例方案已排除：让按钮在 `starting` 可点、靠 `service.stop()` 抛错回显（view.tsx:94→:97），对 Codex 是"每次点击必然报错"的假可用，且把服务端前置条件当错误提示用——不采纳。
- 请 C/FC 知悉：F3 视图与 Codex 前置一致、与 Pi 相比**少一个能力面**是**契约缺粒度**导致，不是 F3 实施缺陷。
- **C-0026 §4 已裁**：本批不动、入 Phase 2 契约变更清单，要求"F1/F3 汇合后提最小契约扩展"。汇合结果与 F1-0010 对齐见 §10（F3 附议 F1 的 run 级投影首选，并把它细化到字段类型与渲染规则）。

### 5.4 语言与风格
产品对话/交互当前为英文，探针为中文。统一文案语言属 FC 汇合层（C-002/C-006 第 6 条），F3 提交上表**语义项**，最终词表由 FC 统一风格定稿；F3 不自造两套文案。

## 6. Phase 2 实施批次建议（待 C 精确路径批准；本轮不动源码）

| # | 文件（迁移后落点） | 动作 | 验收（离线） |
|---|---|---|---|
| 1 | plugins/agent/conversation/src/view.tsx | 移除 options 渲染块；补 5.1/5.2 文案与 `unknown≠failed` 渲染；run 徽标保留"仅展示"注释语义 | 包内组件测试：断言无 model/thinking 入口；unknown 渲染"未知"非"失败" |
| 2 | plugins/agent/interactions/src/{view.tsx,entry.tsx} | 撤 `region:'right'` 注册；导出卡片+按会话过滤；补终态行；statusbar 待回应计数 | 交互卡五态渲染测试；无 pending 时右区无视图→由 workbench 现有 collapse 逻辑收起（shell.tsx 既有测试可扩展） |
| 3 | plugins/agent/conversation/src/view.tsx（内联挂载） | 线程内按 turnId 渲染 pending 交互 | 夹具：pending→resolved 全流程、跨会话不串卡（沿用 probe 隔离断言风格） |
| 4 | plugins/agent/conversation/src/entry.tsx | `agent.open`+navigation 迁 F2（若 C 采纳 §0.5） | 命令/视图 id 解析测试 |
| 5 | apps/desktop 应用门 | 产品对话视图进入应用级门（现仅探针，§1 测试现状行） | `test-agent-ui.mjs` 增加启用 ordessa.agent-conversation 的显式夹具列表（C-0016 第 4 条） |

## 7. 跨包请求
- **FC**：统一文案词表定稿（§5 语义项已给）；确认对话内联卡风格与工具卡一致（同 `<details>` 视觉系）。
- **F1**：`AgentCapabilities` 目前无消费者（§5.3 补证）；若 Phase 2 要让视图按能力事实渲染"可停止状态集合"，须由 F1/连接器与 C 共同给契约粒度，F3 侧只接结果，不自行推断品牌。
- **F2**：`agent.open`/navigation 入口命令迁移意愿确认（§0.5）；F2-0007 已附议，联署范围见 outbox/F3-0007；会话切换时对话区不残留上一会话 pending 卡（内联后由 sessionId 过滤保证）。
- **BC/H**：Codex/Pi 的 `stop` 前置差异、`expired` 与 `unknown` 产生条件（§1 适配器事实行）是否会在 Phase 2 变更；Codex 测试显式指定模型的路径保持非 UI（§4）。
- **C**：`AgentOption`/`setOption`/`AgentCapabilities` 保持不动（F3 不主张改公共契约）；若将来要区分非 model 选项，须契约级决策。

## 8. 验证方式（今晚零真实调用）
1. 组件/包级测试（夹具，不触网）：五态交互卡、unknown/cancelled/failed 区分、无 model/effort 入口、跨会话隔离、内联卡落位。
2. 应用级离线门：`test-agent-ui.mjs` 显式产品夹具 + Electron 隔离 userData（AGENTS.md 纪律）。
3. 真实链路（CP3/CP4）：需 C 预算批准。**运行参数不再自拟**——权威入口＝BE 批文产物 `scripts/hd001/harness-linux-pi.sh`（C-032 §1：install-set 产 deployment.json → server 三旗标 `--data-root/--port/--sidecar-deployment`，且 **`--plugin-root` 必同用**＝BC-0010 硬约束 → 既有 wire `profiles.create`/`sessions.create` seeding）。F3 侧只准备场景清单（多轮流式+工具+真实审批+停止确认+断连 unknown+切换不丢事件）。
   - **R2 现状**：Pi 真实轮**不在** B-HARNESS-PI-001 批内（C-032 §2），另立 grant 且候 budget-request-bounds §4 的逐请求计数依据闭合（C-029 §4 明写"仍未闭合"）⇒ F3 的 CP3/CP4 场景今晚不可执行，预算消费保持 0/99。
   - **审批场景只在 Codex**：与 §12 的 FE 代码级佐证一致（Pi 不产 `kind:'approval'`），不再另设 Pi 审批场景。
4. 代码级证据已在本报告 file:line；探针与产品视图断言分开登记，避免"夹具通过代替真实链路"（PLAN CP 纪律）。
5. **`wire/1` 正式登记时机的 FE 立场**（应 BC-0011 §4 请 C 定释，F3-0011）：R0/R1 是纯 BE 离线门，其时 FE 从未连过该 harness，而 PLAN.md:33 的 CP1 定义正是"连接+Harness 上下文"。F3 建议登记放 CP1，R0+R1 先入"事实底账"加强件；否则已登记的 `wire/1` 之 FE 腿未验证，且清单内三项 FE 扩展（`runs[].stoppable`、`AgentSessionInfo+workspaceId?/pinned?`、`newSession` workspace 形参）会在 FE 批次飞行中派生 contract_version。F3 不要求延后任何 BE 实施批；若 C 判 R0+R1 即登记，请求登记记录写明"FE 腿尚未验证"。

## 9. 未决与证据缺口（如实）
- Markdown 渲染今晚不引入（reuse.md 行7）：如 FC 统一风格需要，需 C 批准新增依赖（候选已核实 MIT/版本兼容）。
- §5.3 已补证收口（保持现状 + 契约缺粒度登记），不再作为未决项；若 C/FC 认为今晚就要"启动中可停止"，则回退为契约粒度请求，须 C 决策。
- 待 F0 FE-PREP 迁移落地：本报告所有 `extensions/**` 证据行号在集成后变为 `plugins/agent/**`，F3 在收到 FC 发布的 clean baseline SHA 后**逐行复核**再申报实施（已写入 outbox/F3-0007 的批文前置条件）。
- 本树无 node_modules 预装：任何构建/测试类验证都需 F0 FE-PREP 落位后按 C 的重任务串行许可执行，F3 本轮未运行安装/构建/测试。
- §3.4 的 codex 证据为**只读实读本机 clone bfca033**（非上游 release 标注版本）：结论均为交互/文案形态参考，不作代码来源；若 FC 需要与官方发布版本号对齐，须另行查证（不影响今晚任何实施结论）。
- ZCode 桌面端本机实例的交互观察（C-001 允许的闭源**风格**参考）**本轮未做**：需人工看屏，F3 未驱动该应用；若 C 需要该项，请指派可观察的会话（不影响今晚任何实施结论）。

## 10. 最小契约扩展汇合结果（应 C-0026 §4；与 F1-0010 对齐）

### 10.1 缺口精确定位（本树实读）
- `AgentSnapshot.runs` 条目形状只有三字段：`{ id, sessionId, status }`（contract.ts:68）——**没有可停止性表达位**。
- `AgentCapabilities.stop: Availability`（contract.ts:11）是**连接级静态**声明：Pi 与 Codex 都写 `'supported'`（agent-pi/src/client.ts:11、agent-codex/src/client.ts:22），二者同时成立，故该字段结构上无法区分"starting 可停"与"仅 running 可停"。
- 补证（本会话新读）：契约**已有**连接器在运行时改 capabilities 的先例——Codex initialize 后把 `models`/`modes` 降级为 `unavailable`（agent-codex/src/client.ts:72、:298），但从不改 `stop`。可见"由连接器投影能力事实、视图只消费"是本契约既有风格，下面的提案不是新发明。
- 视图侧零消费者（§5.3 补证）→ 现在任何"可停止"判断只能靠视图内硬编码状态集合或品牌分支，二者均已被 C-0026 §4 / F1-0010 §3 否决。

### 10.2 候选与推荐（F3 附议 F1 的 A，并细化到字段类型）
**A. run 级投影（推荐）**——runs 条目加一个可选字段，复用**已导出**的 `Availability`（contract.ts:3），不新增枚举字面量：

```ts
runs: Readonly<Record<string, {
  id: string; sessionId: string; status: RunStatus
  stoppable?: Availability
}>>
```

- 四态正好覆盖我们真实的知识状态，无需再造语义：`supported`=本 run 此刻可请求停止；`unsupported`=连接器明确表示不可（Codex 的 starting）；`unknown`=连接器未计算（诚实缺省）；`unavailable`=断连/进程退出后无停止通道（agent-pi:123-127、agent-codex:100-104 两族的既有事实）。
- **F3 视图渲染规则（零品牌分支）**：仅当 `stoppable === 'supported'` 按钮可点；`unsupported`/`unknown`/`undefined`/`unavailable` 一律 disabled 且**不隐藏**按钮，`title` 用 §5.1 词表说明原因。缺省即保守 ⇒ 连接器尚未填该字段时视图行为与今晚完全一致，**无回归**，与 C-0026 §4"此前 UI 维持现状（保守方向，不伪造）"逐字相容。
- 连接器侧各一行映射，不动任何判定逻辑：Pi 在 starting/running 投影 `supported`（其 client.ts:285 注释已给出理由："the prompt ack can precede agent_start"）；Codex 在 starting 投影 `unsupported`、running 投影 `supported`（对齐 client.ts:251-253 的既有的前置）。

**B. 连接级"可停止状态集合"**：`capabilities.stopFrom?: readonly RunStatus[]`。缺点：把 per-run 事实压成连接级常量，对同一连接器下的历史/终态 run 无表达力，仍是静态声明 ⇒ 不推荐。

**写权与边界申报**：A 的落地面 = 契约包一处 additive 可选字段（不改现有字段、不动既有测试）+ 两连接器各一行投影 + F3 视图一行 `disabled` 条件。**F3 只写视图消费点**；`packages/agent-ui-contracts/**` 与连接器写权归 F1/C 指定。`stoppable` 是本地投影字段、不进 wire/1 帧语义，但按 C-0026 §4 由 C 记录并递增 contract_version。F3 不主张本轮之外的任何契约面扩张（不扩 Profile/Provider/Model/配置管理）。

### 10.3 过渡期（契约批文落地前）
维持现状：`starting` 一律禁用（conversation/view.tsx:94），按钮不隐藏、不伪造可点、不靠抛错回显。这是 C-0026 §4 与 F1-0010 §2 的共同口径，F3 无异议。

### 10.4 C-0026 §6 五项验收的可断言化（~~供 FC 直接贴入 Phase 2 批文~~ **⚠ 本表已被 §14.3 取代，请勿抄本表**）

> **02:06 加此警告（F3-0021）**：F3-0008 曾请 FC 把"§10.4 的五项断言抄进批文"，而此后 F3-0014/0015/0019/0020 四次的勘误**全部只就地改在 §14.3**。两表现已不一致，且本表按字面抄会踩四个已知缺陷：
> - **门 1**：断言文案"结果未知"是**中文外推**，产品实文是英文 `Run outcome unknown after disconnect.`（`conversation/view.tsx:83`）⇒ 照抄必假红（§14.9(1)、§14.4 第一条）。
> - **门 2**："选项类控件数=0"**未限域** ⇒ 全 root 查 select 会被 `interactions/view.tsx:29` 与 `workbench/src/shell.tsx:86` 两个合法 select 顶成假红（§14.6、§14.10(4)）；且缺"先断 `.agent-thread` 存在"，夹具装配不全时空转假绿（§14.9(2)）。
> - **门 3**：**本表与 §14.3 测的不是同一件事**。本表写"撤 `region:'right'` 注册后断言 collapsed 且 `inert`"——按 §14.10 的实证，**空区域本来就 inert**（`shell.tsx:40` + `:75`），所以这句是**空断言**；而 §14.3 改为"先 `open` 再 `collapse('right', true)`、收起前先断右栏内容存在"，测的是**收起≠关闭**。两者语义不同，**请 FC 明确本门要证哪一个**（F3 建议：证"收起≠关闭 + 收起后 inert"，因为"空区自动收起"已由 `:40` 与 `resized()` 承担、且它不含 pending 卡在主区的断言）。本表 `:96-99` 的行号引用同样待按符号锚定（§14.7）。
> - **门 5**：本表把"零自动重发"与"卡转终态内联行"并成一条，而 §14.6 已确证**后一半现在就已成立属回归验证、且"终态条目是否留在数组"归 F1/连接器**（`interactions/view.tsx:24-25` 无条件渲染）。
>
> **§14.3 才是五门表的终稿**（门 1/2/3/4/5 已逐门源级实读，含 §14.10 的门 3 更正）。本表保留不删，仅作 F3-0008 时代的历史底稿与 C-0026 §6 的逐门对应索引。

| # | 门槛 | 断言（包级夹具 + 产品进应用门各跑一遍，后者不以前者替代） | 证据基础 |
| - | ---- | -------- | -------- |
| 1 | unknown≠failed | 让 run 落 `unknown`，断言出现"结果未知"提示行、**不**出现失败/重试文案、零自动重发 | Pi 断连 agent-pi:123-127；Codex 进程退出 agent-codex:100-104；现视图 `failed\|unknown` 同分支 conversation/view.tsx:53-55 → 本项要求拆分支 |
| 2 | 无 model 入口 | 对话视图渲染后选项类控件数=0（无 `<select>`、无选项按钮）；**同时**夹具直接调 `service.setOption('model', …)` 仍成功 ⇒ 证明只删 UI 通道、保留数据链 | 删点 view.tsx:85-88（§4）；钉模型 agent-codex:244-245 |
| 3 | 右栏收起 | 撤 `region:'right'` 注册后断言 workbench 右面板 collapsed 且 `inert`、无 "Requests" 区标签；pending 卡出现在主区 composer 之前 | 注册点 agent-interactions/src/entry.tsx:9；空区自动收起已由 shell.tsx:40 + :96-99 实现（零核心改动） |
| 4 | 跨会话不串卡 | 会话 A 留 pending → 切 B：B 线程零卡；切回 A：卡仍在且 interaction id 不变 | 现列出全部会话交互 agent-interactions/view.tsx:51-52（无 sessionId 过滤）；线程重挂载键 conversation/view.tsx:105 |
| 5 | 不自动重发未确认提交 | 令 `respond()` 拒绝或回 `expired`/`unknown`：断言 respond 调用计数不增加（零自动重试）、卡转为终态内联行而非消失 | 契约状态集 contract.ts:53；codex 同族对照其 chatwidget 静默移除处（§3.4 的有意偏离项） |

## 11. P2-3 预签范围与 styles 耦合（应 FC-0013 §3；F3-0009 为消息件，本节为证据底稿）

### 11.1 已授权的删除行段（F3 属主文件，除此零授权）
- `conversation/src/view.tsx` **仅 10–40**：`export function SessionBrowser` 整段（:10 声明、:40 闭合）。
- `conversation/src/entry.tsx` **仅 line 4 的 `SessionBrowser` 说明符**（同行 `Conversation` 保留）、**line 10**（`agent.sessions` 的 `region:'left'` 注册）、**lines 12–15**（`agent.open` 命令 + `agent.navigation`，依 C-0026 §3 同批迁 F2）。
- 不授权：`view.tsx` 42–107、`entry.tsx` 其余行（含 :11 `agent.conversation` 注册）、`styles.ts` 整文件。

### 11.2 "零 import 编辑"的可核证依据（删块安全性的来源）
每个顶层辅助都另有消费者：`useState`(:1)→:67；`styles`(:5)→:78、:102-104；`useWorkspace`(:7)→:66、:101；`errorText`(:8)→:75、:86、:94；类型 import(:4)→`convertMessage`。⇒ SessionBrowser 段是自足块，撤除不需触碰 imports；任何"顺手清理 import"都属越界。

### 11.3 styles.ts 的选择器层交错（新发现的风险点）
`styles.ts` 为单模板字符串，会话专属规则与共用/对话规则**在同一选择器列表内合写**，无法按行整段搬移：`:12`（`.agent-section-head button,.agent-actions button`）、`:14-17`（`.agent-connections,.agent-session-list` 系列）、`:27-28`（`.agent-empty,.agent-notice,.agent-error` —— 对话区同样依赖）。共用基座 `:2-7`（`.agent-panel` 变量与焦点/禁用态）。
- 采法：F2 在 sessions 包内**新建自己的样式模块并复制**所需规则（源行：`:8`、`:9-13`、`:14-20`、`:21`、`:22`、`:23-26` + 共用副本 `:2-7`、`:27-28`），**不破坏性拆分 F3 文件**。
- 复制后 conversation 侧会话专属规则成为死 CSS：**P2-3 内不删**（过渡期 F1-0011 §三的新旧并存仍要用），由 F3 在 P2-3 之后的自有批次清理，保留 `:2-7`、`:27-28`。已作为 Phase 2 尾部 F3 待办报 FC。

### 11.4 FC-0013 裁决后的定稿口径（覆盖本报告早期建议）
- `stoppable` 采 **boolean**（F1 原案）而非 F3 的 `?: Availability`：渲染结果等价（`=== true` 才可点，其余 disabled 且不隐藏），残余是"无法区分明确不可停与未计算"⇒ tooltip 用中性文案，将来需解释原因再升级类型。
- 产品面**英文**（FC-0013 §4）：§5.1/§5.2 中的中文建议串作废，改用 F3-0009 四的英文定稿表；其中 `resolved` 终态**只显示 "Request resolved." 不显示答案原文**——契约 `AgentInteraction`（contract.ts:44-54）没有回答字段，显示即伪造。
- 内联卡沿用 `.agent-tool` 同族 `<details>` 视觉（FC-0013 §5）。
- `unknown≠failed` 门槛隐含~~**必须拆** `view.tsx:53-55` 的 `failed|unknown` 合并分支 ⇒ 已请 FC 把该行段显式写入 P2-2 精确路径授权。~~ **〔⚠ 03:47 作废，见 §14.19／F3-0033：拆 `:53` 已撤回（生产不可达）；改为请 FC 增列 `:54`＋`:48-56`。〕**

## 12. `approval` kind 的产生面（01:05 新证据；应 C-013 §4 相关）

- **只有 Codex 会产生 `kind:'approval'`**：`agent-codex/src/client.ts:176`（`item/commandExecution/requestApproval`）与 `:179`（`item/fileChange/requestApproval`）。Pi 侧走 `uiRequest`，方法白名单只有 `select|confirm|input|editor`（`agent-pi/src/client.ts:223`），kind 映射亦只到这四者（`:230`）⇒ **Pi 永不产生 approval**；其余方法名只落 `diagnostic`（`:224-225`）。
  ⇒ 这为 C-013 第 4 条"CP4 审批场景先行 Harness=Codex"补了一条**与 H 不同源的独立 FE 代码级佐证**（H 的证据是后端/协议面）。
- **全仓 UI 零 `kind === 'approval'` 分支**（grep `agent-interactions/src`、`agent-conversation/src` 无匹配）。Codex 审批是**带 `choices` 的普通卡**，应答走 `{ kind: 'choice' }`，其合法性由连接器校验（`agent-codex/src/client.ts:275`：decision 必须 ∈ `interaction.choices`）。
  ⇒ F3 的 P2-2 内联卡**不需要**为 approval 新增行为分支（符合"无品牌/无 kind 特化逻辑"口径）；若要视觉区分，只允许用 `kind` 决定**标签文案**——`kind` 是中立契约字段（**符号锚定**＝`AgentInteraction.kind`（值域见 `contract.ts` 同文件 `:48`）；@85cc3cd 行号 `:48` 仅作证据、步 2 拆契约后失效，见 §14.7），不是品牌标识。
- **对验收夹具的直接含义**：approval 卡形状取 Codex 形（`choices` 两项 approve/deny）；`choice/input/editor` 两家都可能出现；真实审批链路只能在 Codex 上跑（与 C-013 第 4 条一致，F3 不再另设场景）。
- **一处共享谓词风险已提请 F1/FC**（outbox/F3-0010）：C-010 附带把 FE 切换闸口径写作"扫描未 settled **approval**"。若该词按**字面 kind** 实现，则 Pi 侧闸永不触发、Codex 侧也只覆盖两条 `requestApproval`，`select/confirm/input/editor` 的待响应态漏判。F3 建议谓词按 `state ∈ {pending, responding}` 扫全部 `interactions`，`kind` 不参与判定。谓词属 F1 写域（P2-1 gate 导出），F3 只提请不代改。

## 13. 已锁定口径（P2-2 实施时以本节为准，勿再回溯早期建议）

| 事项 | 定稿 | 出处 |
| --- | --- | --- |
| Harness 切换闸谓词 | 「任一 `run.status ∈ {starting, running, stop-requested}` ∨ 任一 `interaction.state ∈ {pending, responding}`」，扫全部会话全部条目；**`kind` 不参与判定**（按字面 `kind==='approval'` 读会使 Pi 永不触发闸、Codex 漏判四类待响应请求） | FC-0015 §1（采纳 F3-0010 §四；F1-0012 确认语义零变更） |
| 谓词命名 | `hasOpenRun()` / `hasAwaitingInteraction()`，**避开 `settled`**（与 Pi `agent_settled` 的 run 落定语义撞词，见 §12） | FC-0015 §2 + F1-0012 §2 |
| 审批卡呈现 | P2-2 内联卡**不为 approval 加行为分支**；只允许 `kind` 决定**标签文案**（如 `Approval required`）——`kind` 是中立契约字段（**符号锚定**＝`AgentInteraction.kind`（值域见 `contract.ts` 同文件 `:48`）；@85cc3cd 行号 `:48` 仅作证据、步 2 拆契约后失效，见 §14.7） | FC-0015 §3 |
| 审批卡夹具形状 | Codex 形：`choices`＝approve/deny、应答走 `{kind:'choice'}`、连接器校验 `decision ∈ choices`（agent-codex:275）；P2-2 夹具与 CP4 共用同一形状 | FC-0015 §3 |
| `wire/1` 正式登记时点 | **B-HARNESS-PI-001 的 R0+R1 绿态 checkpoint**（C 未采纳 F3-0011 的 CP1 建议），但 C 明确"**CP1 联调检查点仍独立存在（FE↔BE 实链配对），两者不混同**"⇒ F3 要求的"不得把已登记读成已配对验收"已由该句满足 | C-0033 §2 |
| 由此对 FE 的实际后果 | 清单内三项 FE 扩展（`runs[].stoppable`、`AgentSessionInfo+workspaceId?/pinned?`、`newSession` workspace 形参）成为已登记基线之上的派生变更 ⇒ P2-2/P2-3 落地时须按**派生后的 contract_version** 复核夹具断言，不沿用登记瞬间的形状 | 推论（F3 自留提醒） |
| F0 停滞期的 F3 姿势 | 批次前置不因 C-0031 改变；若 C 改定接续方案，F3 的"clean baseline 对齐+行号复核"随新基线来源执行；**"旧 baseline 复核行号但不写源码"的等待姿势已入备选** | FC-0015 §4 + F1-0012 §4 |
| **P2-2 测试落点（终，A3 更正为迁移后坐标）** | `apps/desktop/renderer/agent-conversation.test.tsx` + `apps/desktop/renderer/agent-interactions.test.tsx`；P2-1/P2-3 同落 `apps/desktop/renderer/agent-<包>.test.*`；**"包内测试"表述作废**；jsdom 头注 + 四环境桩照抄 probe 先例。（C-0036 §2 原句写作 `apps/desktop/src/…`，经 F3-0018 §二判定由 **C-0042 §2 正式更正为 `renderer/`**，因 `src/` 字面在 clean baseline 下静默不跑） | C-0042 §2（A3）← F3-0018 §二 ← C-0036 §2 + FC-0016 §4 |
| **`vitest.config.ts` 显式授权行（终）** | 三处：两条契约 alias（A2，步 2）＋ `test.include` 的 `src/**`→`renderer/**`（A3，步 6 同批）；A1 的"零改动"限缩为"除上述三处外零改动"。`tsconfig`/`build.mjs` 相对路径同步属原批文 §6 既有范围（A3 §3）。**F0 复活批文文本＝FC-0012+A1+A2+A3** | C-0042 §1/§3（A3）← F3-0018 §一 |
| FE-PREP 步 3 与 `vitest.config.ts` 归属 | 测试文件**保留应用测试目录**（A1 字面＝`apps/desktop/src/`；**A3 §2 已更正为迁移后 `apps/desktop/renderer/`**）、**不迁入 `plugins/**`**（仅 import 重指向）；`vitest.config.ts` 原为"零改动"，经 A2/A3 现为**只许改三处**（两 alias + `test.include`），归属 **F0**，其余改动只经显式批文行；验收附 git-status 核验"无新增 `plugins/**/*.test.*`" | C-0036 §1（A1）+ C-0037（A2）+ C-0042（A3）；F3-0013 §五的归属问题就此关闭 |
| `data-testid` | **禁加**——对话区按既有 `className`/`role` 断言，交互区用**已存在**的 `data-interaction`（`agent-interactions/src/view.tsx:24`，非新增属性）｜⚠ **本行原结论"⇒ 零扩预签行段"已由 §14.14 作废**——它把"断言时读既有 DOM 句柄"与"不需编辑该文件"混为一谈：`data-interaction` 仍是既有属性，但**门 4 需编辑 `:52`**，而交互包从未获授权 | FC-0016 §6 + C-0036 §2 + F3-0014 §二 |
| 五门表的替换项（候 FC 并入 P2-2；**共 5 处，分三批提出**） | **F3-0014/0015 批**：门 2 的 `select` 计数限定对话区作用域（全 root 因 `interactions/view.tsx:29` 合法 `<select>` 假红）；门 5 拆两半——视图侧终态行已成立属回归验证，"终态条目留在数组"挂 F1。**F3-0019 批（对话视图全文实读后）**：门 1 删"`[role=alert]` 为 null"（`:81` 断线必有 alert ⇒ 假红），改为 `:80` `data-status` + `:83` 文案 + 无 `[data-status=failed]` 四条，并记"unknown≠failed 在消息级**尚未成立**（`:53` `failed\|\|unknown` 合并支）"〔⚠ **03:47 二次更正：本门四条断言对未改动的现码即绿＝回归锁；`:53` 拆分已撤回（`message.status` 生产不可达 `unknown`），改判 1a/1b 见 §14.19／F3-0033**〕；门 2 须**先断言 `.agent-thread` 存在**再断"无模型入口"（`:102-104` 占位分支里没有 select ⇒ 空夹具会假绿），且路 A（F1 契约义务）／路 B（`:85-88` 新过滤，需另授权）请 FC 择一〔⚠ **03:22 作废：路 A 已撤回，路 B 是唯一可行路，且门 2 现状为红＝新行为**，见 §14.18／F3-0032；以 §14.3 门 2 行为准〕；门 4 的 `:105` 改标为**会话级重挂载**证据。**并核**：FC-0013 §3 预签 `view.tsx:10-40` 实文是 `SessionBrowser`（且用途＝P2-3 撤除），五门落点在 `:53`/`:80-83`/`:85-88`/`:94-95`/`:105`，逐段另列。⚠ **该五段清单不完整**（只含对话包）——**门 4/门 5 的修复行在交互包 `view.tsx:52`/`:19-21`，从未预签**，见 §14.14／F3-0027。〔⚠ **04:20 缩窄**：其中 `:19-21` 已随门 5 定甲案撤出请求写域 ⇒ **本行现在只剩 `:52` 一条需要增列**，见 §14.21／F3-0035。〕**F3-0020 批（门 3 源级验证后，最后一扇未实读门）**：门 3 删 `foundation.test.tsx:138` 的误挂（它断的是 full-page 时**整个** workspace 被 inert，源文 `shell.tsx:119`，与区域收起无关 ⇒ "收起后区域带 `inert`"**本仓无先例**，F3 首提）；补三条可执行约束——**`model`+`commands` 两个 prop 都要传**（`shell.tsx:26/:31`）、**先 `open` 再 `collapse`**（`model.ts:36` 会 un-collapse）、**收起前先断右栏内容存在**（`shell.tsx:40/:75` 空区域本来就 inert ⇒ 只写后半句即假绿）；并把"断 DOM 消失"改为"断 `inert`"（`ViewSurface` portal 使实例与 DOM 均在，此即"收起≠关闭"的机制）。**另两条跨门规则**：`role=alert` 须按文案区分（`boundary.tsx:5` 崩溃回退与 `conversation/view.tsx:81` 断线告警同 role）；"产品视图是英文"须限缩为 **F3 两包**（workbench/boundary 文案是中文，门 3 命中 shell 标签要用中文），且门 2 的"无 select"必须限域（`shell.tsx:86` 的"移动…"下拉是全仓第二个合法 select）。 | F3-0014 §二 + F3-0015 §一 + **F3-0019 §一/§二/§三** + **F3-0020 §一/§二/§三**（时序：F3-0014 晚于 FC-0016 落盘 76 秒，本件早于批文） |
| `vitest.config.ts` 两条 alias | **已裁（C-0037 修正案 A2）**：两条契约 alias 随步 2 同批**显式改指**新 `contracts/` 域 re-export 入口；该两行归 F0、为批文显式授权行，A1 的"零改动"限缩为"除本两行外零改动"；**"旧路径保留转发文件"被否决**。F0 复活批文文本＝FC-0012 + A1 + A2 | F3-0016 §二 → C-0037 §1/§2 |
| **A2 的连带后果：契约行号引用全部失效** | 步 2 把 `packages/agent-ui-contracts/src/contract.ts` 按域拆往 `contracts/{connections,agent}` ⇒ **只有契约文件的行号引用会失效**（本文 14 处，见 §14.7）；`extensions/**`→`plugins/**` 是整文件机械移动（`fe-prep-research.md:15`"一一对应机械移动"），**`view.tsx`/`entry.tsx` 的行段引用不受影响**（含 F3-0009 预签行段） | C-0037 §1 + `fe-prep-research.md:13,:15` 对照（F3 01:35 新证据） |
| **P2-2 覆盖范围（终，乙案）** | 本轮五门**只做 vitest 半边**（`agent-{conversation,interactions}.test.tsx` 五项断言，以 §14.3 终稿表为准）；**应用半边（`electron/main.ts` 探针 + `scripts/test-agent-shell.mjs` + 已选连接夹具）整体推后续专批**。台账如实记：P2-2 对 C-0026 §6 为**部分满足**，不宣称覆盖。P2-1/P2-3 同构适用。 | C-0046 §1–§3 ＝ `decisions.md` HD-001-C-022 ← F3-0022 §三 |
| **落点字面（已闭合 02:22）** | **`apps/desktop/renderer/agent-<包>.test.*` 为唯一有效落点**——C-0047 §1 明文"以 A3 坐标为准"、§2 命 FC 折批文时统一用 `renderer/` 不沿用 `src/`，且"裁决语义全部不变"。`decisions.md:50` 保留旧字面，**F3 不再请求更正**（C 选了我预备的"回一句以 A3 为准"口径，自带此约束）。可复用规则保留：**批文路径字面一律取 clean baseline 实际路径；`apps/desktop/src/**` 出现在 P2-x 稿件即按可疑处理**（本类四次出现：C-0036 §2 首入裁 → A3 作废 → C-0046 §1 二次带出；F3 报三次、F2-0010 报一次 ⇒ 应前置为成文条款）。 | C-0047 §1/§2（终）← F3-0023 ← C-0042 §2（A3） |
| **他人稿件里的"归因句"也须核** | 验收不只核结论对不对，还要核**归因句对不对**：C-0047 §1 把 `src/` 字面的来源归给 F3-0022（实测该件零路径字面命中，其唯一含 `src→renderer` 之句反而是反向澄清），若照记则根因挂错人、下次无人防。已发 F3-0024 请改一句（无待裁项，不认则不追）。旁证：同件 §3 质疑 F2-0010 的 `owner_generation`，同属"陈述性事实会漂移"。 | F3-0024 §二 ← C-0047 §1（实测反驳） |

| **P2-2 装配配方（终，五门可一步实施）** | **假 `AgentClient`（照抄 `agent-sessions.test.ts:7-23`）＋真 `createAgentConnections`/`createAgentSessions`（`:26-33`）＋`mount(<Conversation service={sessions}/>)`**；`model.ts:13` 证整个 `agent` 切片逐字来自假 client ⇒ **五门每个输入字段可控、零新机制、零跨写域**。⇒ **乙案不降级五门**（应用门卡在"注入已选连接"，jsdom 里 `selectConnection()` 是公开方法）。新测试的 import **不在批文里预写字面**——`fe-prep-research.md:38-42` 的"新归属"列回答的是"测试文件归哪个包"，且该列已被 A1（"不迁入 `plugins/**`，仅 import 重指向"）作废 ⇒ 改用"开工首步实测 `plugins/**` 三处目标＋`vitest.config.ts` alias 现值"句式（三家共用，见 §14.13 勘误段）；门 1 仍另需 `view.tsx:53` 拆分授权。**⚠ 本行原标题"五门可一步实施／零未知"已被后续两节缩窄：§14.14 查出"可断言 ≠ 已授权"（门 4 要改码），§14.17 明写"把 §14.13'实施零未知'这句真正补齐"⇒ 配方可用，但开工前尚需下三行**。 | §14.13（F3 02:27 实读）＋**§14.13 勘误段（F3-0026 自纠 import 依据）**；F3-0025/0026 |
| **开工前置一：断言对象有"可达门槛"，先证其在再断它空** | 对话视图 `view.tsx:100-105` 是**三道串联防占位分支**：`:102` `selectedConnectionId` → `:103` `agent` 快照 → `:104` `agent.selectedSessionId`（契约里**可选**；**符号锚定**＝`AgentSnapshot.selectedSessionId?`，@85cc3cd 行号 `:66` 仅作证据、步 2 后失效，见 §14.7）；三关全过才 `:105` 渲染 `ConversationThread`，而 `.agent-thread`（`:89` `ThreadPrimitive.Root`）在其内部。⇒ **任一关缺失则门 1/门 2 的断言对象根本不存在，一切"不存在/为空"式否定断言空转通过**。夹具须同时凑齐三关并**先断 `.agent-thread` 存在**。门 4/门 5 的卡在 `InteractionPanel`（无占位分支，`:54` 空时有文案），**不受三关影响但仍需第三关作过滤键**（§14.16(4)：不设 `selectedSessionId` 则 `item.sessionId === undefined` 恒 false ⇒ 三段断言全绿而什么都没测）。**可复用判据：凡断言形如"某集合变空"，先问"它是否本来就恒空"，并检查夹具是否显式提供使非空成立的那个输入。** | §14.17(1)/(4) ＋ §14.16(4) ← §14.9(2) 门 2 ＋ §14.10(2) 门 3（同病三部位） |
| **开工前置二：新测试文件的"文件头四件"（承重、自带，不外溢）** | `apps/desktop/vitest.config.ts` 实读全文**只有 `resolve.alias` 两行 + `test.include`，无全局 `environment`** ⇒ ①首行 `// @vitest-environment jsdom`（漏写则 `document` 未定义，**import 阶段即红**）；②`IS_REACT_ACT_ENVIRONMENT = true`（`probe:8`/`foundation:19`/`host:102`）；③`createRoot` **内联**＋**本文件私有** `cleanup`/`afterEach`——仓库**没有任何导出的 mount 辅助**，故四件必须自带，**不得为复用往共用文件加 helper**（会把测试改动外溢进别人写域并牵连 A1 验收面）；④探针三件 DOM 桩（`ResizeObserver`/`scrollTo`/`scrollIntoView`）**分档**：交互包视图只 import `react`+契约（理论上不需），对话包视图确实 import `@assistant-ui/react`（`view.tsx:2-3`）⇒ 按承重照抄。**诚实边界**：本树 `node_modules` 不存在且窗口纪律禁装依赖 ⇒ 无法证明 assistant-ui 具体调用哪个 DOM API，"删桩"留作开工首步的可选优化，不影响正确性。另确证：`ConversationThread` 自包 `<AssistantRuntimeProvider>`（`:78`/`:98`）⇒ **测试侧不需要包 provider、不需要 mock assistant-ui**。 | §14.17(3)/(2)；F3-0030 §三/§四 |
| **开工前置三：P2-2 尚缺的 2 条授权（原第 4 项＝门 5 于 04:16 自撤、原第 2 项＝门 1b 于 05:14 自撤；勿以"预签 10-40"代覆盖）** | ①**门 4＝改码不是断言**：需在交互包 `agent-interactions/src/view.tsx:52` 加一行 `filter(item => item.sessionId === state.agent?.selectedSessionId)`，而**该文件从未预签**（`FC-0013 §3` 只签对话包、用途＝P2-3 撤 `SessionBrowser`）⇒ **批文必须增列该行**。可实施性已确证且**与 F1 完全解耦**：`AgentInteraction.sessionId` 与 `AgentSnapshot.selectedSessionId` 同快照（@85cc3cd 行号 `:46`/`:66` 仅作证据；**批文一律用符号名**，因步 2 拆契约会使其失效，见 §14.7）、连接器侧早已按会话作用域处置交互（codex `client.ts:132`、pi `client.ts:127`）、全仓 UI 侧读取点仅此一处（无第二落点）、且不影响门 3（`shell.tsx:40` 计注册视图数非卡数）。②**门 1** ~~需 `conversation/view.tsx:53` `failed\|\|unknown` 合并支拆分授权（不在预签 `10-40` 内）~~（⚠ **03:43 更正，见 §14.19／F3-0033**：拆 `:53` **从批文撤下**——`message.status` 在生产中永不取值 `unknown`（codex `client.ts:34`、pi `client.ts:36` 消息级值域），拆了零可见变化＝空转批；而门 1 现有四条断言读 run/连接级句柄、**对现码即绿**，属回归锁。**改判为**：1a 零授权照做；~~1b 增列 `conversation/view.tsx:54` 与 `:48-56` 调用点~~）。**〔⚠ 05:14 三次更正（§14.24／F3-0038）：1b 亦整体撤回 ⇒ 门 1 归零授权。理由两条＝①结构不可行：`convertMessage` 为模块级导出、签名只接 `message: AgentMessage`，全仓唯一生产调用点在 `:71`，故"只改末条 assistant 消息"这一我自己设定的边界在 `:51-54` 内**实现不了**，真要修得动 `:71`；②范围不属本门：C-0026 §6 门 1 原文只有 unknown≠failed 且已在运行/徽标层成立。另更正行段算术——函数实为 `:42-55`，我原写的 `:48-56` 一头越出函数体含进 `:56` 的 `TextPart`。缺陷改挂 `[F3-NEW-1]` 候后续专批，不请 FC 背书我的扩范围。〕**③**门 2** 需在 `:85-88` 新增按 `option.id` 的过滤并授权该未授权行段（⚠ **03:22 勘误：不再是"择路"**——路 A＝"契约义务保证 `agent.options` 永不含 model"经实读两连接器已**证伪并撤回**（codex `client.ts:303-304`、pi `client.ts:315` 皆合法发布 supported model），**路 B 是唯一可行路**；门 2 现状为红＝新行为，见 §14.18／F3-0032）。④~~**门 5** 需择甲／乙~~（⚠ **04:16 自我撤回，见 §14.21／F3-0035**：本项**从待裁清单撤下**，不再请 FC 择一。**乙案**（改 `:19-21` 加在途门控防重复提交）经实测**生产不可达**——codex `client.ts:261→:278`、pi `client.ts:294→:301` 的 `route.used=true` 均在**第一个 await 之前**同步置位 ⇒ 第二次点击必 throw、无双发窗口；且它**超出 C-0026 §6 门 5 的原文义**（原文＝不**自动**重发，非防连点），是我在 §14.14 混入的范围扩展。**甲案为定**＝字面回归锁，且我先前那句"字面版结构上必成立＝空断言"**亦作废**：计数断言的被测对象是视图自身的重试路径（生产代码）、假件只是被调用方 ⇒ 属正当回归锁，非桩自证。台账据此如实记"重复提交由连接器保证、位置在五门夹具之外"，门 5 **既不声称覆盖它、也不因未覆盖而判红**。⇒ **门 5 零待裁项、零新增授权**。）。**①③两项任缺其一即不可开工（② 已归零、不再需要授权）。** | §14.14 ＋ §14.16(1)–(3)/(5) ＋ §14.9(1)/(2)；F3-0019/0027 |
## 14. P2-2 验收的可实现路径（01:17 新证据；修正 FC-0015/批文措辞中"包内测试"的不可执行性）

### 14.1 本仓组件级测试的真实形态（实读，@85cc3cd）
- 运行器：`apps/desktop/package.json:11` `"test": "vitest run --maxWorkers=1"`（串行，符合 AGENTS.md "Tests run serially"）。根 `package.json` 的 `test` 只是委托该 workspace。
- **发现范围是硬约束**：`apps/desktop/vitest.config.ts` `test.include: ['src/**/*.test.tsx', 'src/**/*.test.ts']` ⇒ 测试文件**只能**放在 `apps/desktop/src/`。`extensions/**` 下**零**测试文件（本仓全部测试为 `apps/desktop/src/*.test.ts(x)` + `apps/desktop/scripts/*.mjs`）。所以"在 F3 属主包内写测试"这句话在当前配置下**不可执行**，除非改 `vitest.config.ts`——该文件不在任何 FE 包写域内。**（迁移后该 glob 随步 6 改指 `renderer/**`，已由 C-0042 §1（A3）授权归 F0；本条行号/glob 是 `85cc3cd` 的当轮证据，不是待办改动。）**
- 但**跨界直接 import 属主包源码是被确立的做法**，4 处先例：`agent-codex.test.ts:2`、`agent-pi.test.ts:2`、`agent-connections.test.ts:3`、`agent-sessions.test.ts:3-4`。
- **渲染产品扩展视图也有先例**：`foundation.test.tsx:13` 直接 import `extensions/workbench/src/shell`，:108/:134/:154 `mount(<WorkbenchShell …/>)`。⇒ F3 断言真产品视图（非示例）不需要任何新机制。
- 契约别名已就绪：`vitest.config.ts` 把 `@extensions/ordessa.agent-contracts/contract.js` → `packages/agent-ui-contracts/src/contract.ts`，正是 `extensions/agent-conversation/src/view.tsx:4` 用的说明符 ⇒ 现在就能解析。
- jsdom 是**逐文件**开启（config 无 `environment` 默认）：`agent-ui-probe.test.tsx:1` `// @vitest-environment jsdom`。
- assistant-ui 运行时的最小环境桩（照抄即可）：`agent-ui-probe.test.tsx:8` `IS_REACT_ACT_ENVIRONMENT`、`:9` `ResizeObserver`、`:10` `scrollTo`（+:11 `scrollIntoView`），配合 `react` 的 `act` + `react-dom/client` 的 `createRoot`（:2-3）。

### 14.2 建议写入批文的确切路径（两条，均不存在→新建；**坐标已按 A3/C-0042 更正为迁移后**）
- `apps/desktop/renderer/agent-conversation.test.tsx` —— 门 1/2/4/5（**断言以 §14.3 为准**；§10.4 同名门已废弃，见其表头警告）。
- `apps/desktop/renderer/agent-interactions.test.tsx` —— 门 3（右栏收起 + 收起≠关闭）+ 内联卡主区顺序（同上，以 §14.3 门 3 行为准，含 §14.10 的三条约束）。
- **本条初稿曾写 `apps/desktop/src/…`（迁移前坐标）**，该字面在 clean baseline 上会静默不跑，已由 F3-0018 §二 → C-0042 §2（A3）更正；F1/F2 的 P2-1/P2-3 同受该更正覆盖。
- 命名沿用既有 `agent-<包名>.test.*` 家族，与 14.1 的 4 处先例一致；无需新依赖（`@assistant-ui/react 0.15.21` 已是 devDep）。`vitest.config.ts` **确实会改**，但**不由 F3 改**：三处授权行（A2 两 alias + A3 的 `test.include`）全部归 F0，在步 2/步 6 随 FE-PREP 落地（A3 §1、C-0042 §3）。

### 14.3 五门的断言手段与先例（全部可在 jsdom 里写死）
| 门 | 断言手段 | 本仓先例 |
| --- | --- | --- |
| 1 unknown≠failed | **（01:49 对话视图全文实读后更正，见 §14.9(1)；初稿的"`[role=alert]` 为 null"作废——`:81` 在断线时必渲染 alert，而 unknown 正来自断线）** 夹具 `run.status='unknown'` **且** `connection.status!=='connected'`；断言 (a) `section.agent-conversation .agent-run-state` 的 `data-status==='unknown'`；(b) `[role=status].agent-notice` 文案 `Run outcome unknown after disconnect.`；(c) **不存在** `[data-status=failed]`；(d) 若有 `[role=alert]`，其文案必须是 `Connection lost…` 断线语义。⇒ 消息级 `unknown` 目前与 `failed` 同形（`:53` 合并支），~~**门 1 是新行为不是回归验证**~~ **⚠ 03:43 作废，见 §14.19／F3-0033：本行四条断言全部读 run/连接级句柄，对未改动的现码即通过 ⇒ 门 1 现状是回归锁；而它声称的"新行为"（拆 `:53`）没有任何断言守着，且 `message.status='unknown'` 在生产中不可达（两连接器消息级值域见 §14.19(2)）。⇒ 本门请拆 1a（本行四条，零新授权）／1b（改 `:54`＋`:48-56`，"未确认运行不得显示为完成"，需增列该两处行号）。** | `conversation/view.tsx:80`（`data-status` 句柄）、`:83`（unknown 文案；⚠ 03:43 该文案在"未断连的未确认收尾"路径下为假因归因，建议改断句柄不断字面串，见 §14.19(4)）；`foundation.test.tsx:158/:246`（`[role=alert]` 及其 `textContent` 的取法） |
| 2 无 model 入口 | **作用域必须限定**：只在对话区容器内断言"无选项控件"（`section.agent-conversation` 下 `querySelectorAll('select')` 长度 0）〔⚠ **03:57 更正，见 §14.20／F3-0034**：~~等价断言 `.agent-options` 为 null~~ 删除——若过滤加在 `:86` 内层链上该 div 仍渲染为空壳 ⇒ 断 null **必假红**。且"长度 0"不够：夹具须放 `model` ＋ 非 model 的 `probe` 两个 supported 带 values 选项，改断 ①`section.agent-conversation` 下 `select` 数 == 1；②存活 `select` 的 `<label>` 文案 == `probe` 的 `title`；③`AgentSnapshot.options` 仍含 `model`（**断数据侧、不断 DOM**——门 2 成立形态恰是 model 的 label 不在 DOM 里）。`.agent-thread` 仅作存在性前置，**不得当计数容器**（`:85` options 条与 `:89` thread 是兄弟，其子树永无 `select` ⇒ "其中 0 个"恒绿＝空断言）。〕**且** ~~直接 `await service.setOption('model', …)` resolve~~（⚠ **03:22 作废，见 §14.18／F3-0032**：`model.ts:76` 只把 `setOption` 透传给 client，而测试里的 client 是**假件** ⇒ 这半句断的是自己造的桩，属空断言；真实连接器对不在 `values` 内的值一律抛错（codex `client.ts:310-315`、pi `client.ts:322-333`），"resolve"在真语义下反而**必红**）。⇒ **不可对整棵 root 查 `select`**：交互视图对 `fields[].choices` 会合法渲染 `<select>`（agent-interactions/src/view.tsx:29），全 root 断言必假红（01:22 源级自我更正）。**（01:49 §14.9(2) 再加两点）** ①断"无 select"前**必须先断言 `section.agent-conversation .agent-thread` 存在**——`view.tsx:102-104` 三道占位分支渲染的 `div.agent-placeholder` 里本就没有 select，夹具装配不全时该断言会**空转通过**；②`view.tsx:85-88` 对 `model` **无任何专属抑制**（条件仅 `availability==='supported' && values?.length`），故门 2 的保障只能来自视图侧硬抑制：**路 B**（在 `:85-88` 新增按 `option.id` 的过滤，属未授权行段的新行为，须在 P2-2 精确路径另行授权）——**路 B 是唯一可行路**（⚠ **03:22 勘误，见 §14.18／F3-0032**：原写"路 A／路 B 二选一请 FC 择一"**作废**。路 A＝"契约义务保证 `agent.options` 永不含 model"**不成立**——两个连接器都**合法地**把 model 作为 `availability:'supported'` 且带 `values` 的选项发布：codex `client.ts:303-304`、pi `client.ts:315`。FC 若选路 A 会**整批作废**）。**重要推论**：`:85-88` 的条件对真实快照里的 model **今天必真** ⇒ **门 2 现状为红，属新行为、不是回归锁**，批文不得写成"验证既有行为"，否则实施者会误判红为回归。 | `agent-ui-probe.test.tsx:29`（`querySelectorAll('button')` + `.disabled`） |
| 3 右栏收起 | **（01:56 实读 `workbench/src/{model,shell}.tsx` + `shared/{boundary,registry}.tsx` 后更正，见 §14.10；初稿把 `:138` 当"区域 inert 先例"挂错主体、且"断空/inert"会假绿）** 用真 `WorkbenchShell` + **`model` 与 `commands` 两个 prop 都要传**（`shell.tsx:26/:31` 对 `commands` 有 `useSyncExternalStore`，漏传即 render 抛错），`forScope(owner).addView(...)` → **先 `open` 再 `collapse('right', true)`**（`model.ts:36` `open()` 会把该区域 un-collapse，反序即失效）；断言分两半：**①收起前先断右栏确有内容**：断 `[data-region=right]` 的 `textContent` 含**夹具自注册视图**的文案（`shell.tsx:40` `has[r]=entries(r).length>0` ⇒ **空区域本来就 inert**，只写后半句等于空断言）〔⚠ **08:41 第十三次五门勘误·见 §14.25／F3-0039**：本行旧措辞为"先断 `section[data-region=right] .agent-conversation` 存在"，**该选择器永不命中**——实读 `agent-conversation/src/entry.tsx:11` 把 `agent.conversation` 注册在 `region: 'main'`，右区只有 `agent.interactions`；且 FC-0017 §P2-2 第 4 点撤 `right` 注册后右区无任何产品视图 ⇒ 照旧抄必假红。夹具须自带视图，先例 `foundation.test.tsx:103-112`〕；②收起后断 `[data-region=right]` 带 `inert`（`shell.tsx:75`）。主区含 pending 卡（卡句柄 `[data-interaction="<id>"]`，见 `agent-interactions/src/view.tsx:24`）。**不可改断"DOM 不存在"**：`shell.tsx:145`+`:15-20` `ViewSurface` 用 portal 挂 `.wb-content`（`:92`），收起不换 host ⇒ 实例与 DOM 仍在，这正是"收起≠关闭"的机制 | `foundation.test.tsx:103-108`（**夹具配方**：`createWorkbench`+`createCommands`+`addView`+`open`+`mount`）、`:110`（`move` 到 right）、`:111-120`（`collapse` 非 close，收起后仍断 `getSelection().right`）、`:135`（5 区齐）。⇒ **"区域收起后带 `inert`"在本仓无既有断言先例**（`:138` 断的是 full-page 时**整个** `[data-testid=workspace]` 被 inert，源文 `shell.tsx:119` `inert={!!full}`，与区域收起无关），该句由 F3 首提 |
| 4 跨会话不串卡 | 同一 service 切 `selectedSessionId` 重渲染，断言 B 线程零卡、切回 A 卡 `id` 不变——**已确证该缺陷成立**：`agent-interactions/src/view.tsx:52` `state.agent?.interactions ?? []` 无任何 sessionId 过滤，而 `AgentSnapshot.selectedSessionId`（@85cc3cd `contract.ts:66` 仅作证据；**批文引用一律用符号名**，步 2 拆契约后行号失效，见 §14.7）就在同一快照里 ⇒ 过滤属 F3 写域内可实现、无跨包依赖 | `foundation.test.tsx:102`（同 service 换 selected 的断言族）+ `conversation/view.tsx:105` 的 `key={connectionId:sessionId}` —— **01:49 §14.9(3) 性质更正：这是"会话级重挂载"证据，不是"不重挂载"先例**；⇒ 对话线程天然按会话隔离，**串卡风险只在交互侧**；卡句柄 `interactions/view.tsx:24`。**（02:52 §14.16 追加：本行须写成三段且夹具必须显式设 `selectedSessionId`）**断言顺序＝**①A 会话下确有一张 `[data-interaction=<id>]`（count≥1 且 id 命中）→ ②切 B 断零 → ③切回 A 断同一 id 再现**；因 `selectedSessionId` 在 `contract.ts:66` 是**可选**字段，〔**04:36 §14.22 证据升级（不改本行口径，只加地基）**：门 4 过三问＝Q1 有生产者（codex `:192/:196-197`、pi `:234`）；Q2 **无下层保证**——终态条目永久留在数组这一半**已由仓内一条已经跑绿的测试证明**：`apps/desktop/src/agent-pi.test.ts:281` 断 `interactions` 长 3，而其中两条已应答（`:270`/`:275`）、一条已过期（`:278`）；同文件 `:265` 的长 0 断的是**实例**作用域（`other-instance` 不入账），**不可**当作"按会话清理"的先例；Q3 被测是生产码——本轮用 `grep -rn "\.interactions" apps extensions packages` 复验 `view.tsx:52` 为全仓唯一生产读取点（其余命中＝连接器、`*.test.ts`、`entry.tsx:9` 注册）。⇒ **夹具的 A 卡须放终态**（`resolved`/`expired`）而非只放 pending：pending 会被断连扫描改标（codex `:104`、pi `:127`），终态不会消失 ⇒ "B 下零卡"通过只能归因于过滤生效。〕夹具不设则过滤恒空 ⇒ 三段全绿而什么都没测（空断言类第 8 例）|
| 5 不自动重发〔⚠ **04:16 更正，见 §14.21／F3-0035：本门取甲案，我上一轮提的"乙案（在 `:19-21` 加在途门控防重复点击）"已撤回**——它防的事生产里不可能发生（codex `client.ts:261→:278`、pi `client.ts:294→:301` 的 `route.used=true` 都在**第一个 await 之前**同步置位 ⇒ 第二次点击必 throw，无竞态窗口），且**不在 C-0026 §6 门 5 的门义内**（原文义＝不**自动**重发，非防连点）；夹具用假 client ⇒ 被下移的保证根本不在测试路径里，照乙案测只会"把桩当保证"。⇒ **门 5 已无待裁项**，见下。〕 | **甲案（＝字面回归锁，现码已成立）**：夹具 `respond()` 计数 + 抛错/回 `expired`，断言计数不增——**这条不是桩自证**，因被测对象是视图自身的重试路径（生产代码），假件只是被调用方；**卡转终态行"这一半现在就已成立"**：`interactions/view.tsx:24-25` 无条件渲染 `<article>` 与 `<small>{item.state}</small>`，四类应答按钮才受 `pending` 门控（:36/:40/:41/:42）⇒ 视图侧是**回归验证**而非新功能；"终态条目仍留在 `interactions` 数组"这一半**本轮已在生产者侧确证**（codex `:132`/`:279`、pi `:127`/`:302-307` 一律 `.map` **原位替换**、不移除条目）⇒ 属 F1/适配器写域、F3 不代改，但**不再是未知**（01:22 源级自我更正 → 04:16 实读四个产地确证） | `agent-ui-probe.test.tsx:12-13`（cleanup/act 手法） |

### 14.4 会让断言"假绿/假红"的坑（务必写进批文注意事项）
- **文案语言不可照抄示例，且"产品视图是英文"这句需限缩（01:56 §14.10(4)）**：英文只覆盖 **F3 两个包的视图**（`agent-conversation`、`agent-interactions`：`Request stop` / `Stop requested` / `Running` / `Result`）；`examples/agent-ui-probe` 断中文（`:26` `执行中`、`:29` `停止`），而 **workbench/boundary 的宿主文案也是中文**（`shell.tsx:12/:121` 区域标签、`:86` `移动…` 下拉、`boundary.tsx:5` 加载失败文案）。⇒ 门 2 一律绑定 F3-0009 表里的英文产品文案，但**门 3 若命中 shell 的区域标签必须用中文**——同一测试文件里两种语言并存，不可笼统写"P2-2 全部英文"。
- **门 2 的"无 select"必须限域到对话区容器**：`shell.tsx:86` 每个区域的 `移动 X 到` 下拉是**全仓第二个合法 `<select>` 来源**（第一个是 `interactions/view.tsx:29` 的 `fields[].choices`）。对整棵 root 查 select 会**必假红**。
- **`role=alert` 不能只数数量**（01:56 新增）：`shared/boundary.tsx:5` 崩溃回退渲染 `<p role="alert">此内容加载失败，可关闭后重新打开。</p>`，与门 1 的断线 `[role=alert].agent-error`（`conversation/view.tsx:81`）同 role。⇒ 凡按 `role=alert` 断言处**须按文案/class 区分**；反向说，"alert 为 null"同时兼作"未崩溃"的证据，不要把两件事并成一条断言。
- **测试句柄两包不同（01:22 源级自我更正，取代本条初稿"产品视图没有 data-testid"）**：**对话区** `extensions/agent-conversation/src/view.tsx` 确实只有 `className`（`agent-notice`/`agent-error`/`agent-tool`/`agent-options`）与 `role`，无 id 句柄；但**交互区** `agent-interactions/src/view.tsx:24` 已有 `<article … data-interaction={item.id}>`。⇒ 门 4/5 的卡身份断言可直接用 `[data-interaction]`，**不需要**为此给对话区新增 `data-testid`，也就不会扩 F3-0009 已预签的 `view.tsx` 行段。批文只需就对话区一侧写清"禁加 id 句柄、按 class/role 断言"。

### 14.5 FE-PREP 迁移后的连带核对（一处可能需要额外授权）
- 迁移把 `extensions/agent-conversation/**` → `plugins/agent/conversation/**` 后，14.1 的 4 处 import 先例和 F3 新测试里的相对路径都要同步改；这属正常批文范围。
- **`vitest.config.ts` 的两条 alias 必然随步 2 失效（01:31 由条件升格为事实，outbox/F3-0016）**：现 alias 为 `@extensions/ordessa.contracts/contract.js`→`packages/foundation-contracts/src/contract.ts`、`@extensions/ordessa.agent-contracts/contract.js`→`packages/agent-ui-contracts/src/contract.ts`；而 FE-PREP **步 2**（`agents/F0/reports/fe-prep-research.md:13`、`:56`）明载把两个 contracts 包拆分迁往新顶层 `contracts/{workbench,commands,settings}` + `contracts/{connections,agent}` ⇒ **两条目标路径同时消失**。消费面含产品源码（`agent-conversation/src/view.tsx:4`、`agent-interactions/src/view.tsx:2`）与既有测试（`foundation.test.tsx:7-9`）。失败**不静默**（vitest 解析报错），但会落在 F0 后继施工中段，而 A1 字面写"零改动"——仅括注"改动只经显式批文行"。⇒ 请求 FC 把该两行重指向预授权为显式批文行（文件仍归 F0）。

### 14.6 对 14.3/14.4 初稿的源级自我更正（01:22；已随 outbox/F3-0014 知会 FC）
- **触发**：BC-0014（BE 侧）报出"批文引用了不存在的接口 `sessions.create`，趁执行者未撞墙先改"。F3 意识到自己 01:19 发出的 F3-0013 属**同一失效形态**（把未实读的口径写成可执行断言），遂对交互视图做首次源级实读。
- **实读对象**：`extensions/agent-interactions/src/view.tsx` 全文 56 行 @85cc3cd（此前只读过 `entry.tsx:9-10`）。
- **三处更正**：①门 2 的 `select` 计数必须限定在对话区作用域（`:29` 交互视图对 `fields[].choices` 合法渲染 `<select>` ⇒ 全 root 断言假红）；②门 5 的"终态行仍在"视图侧**已成立**（`:24-25` 无条件渲染 `<article>` + `<small>{state}</small>`，仅应答按钮受 `pending` 门控），真正的开放半是"终态条目是否留在数组"，属连接器写域（F1）；③门 4/5 无需新增 `data-testid`——`:24` 已提供 `data-interaction`，故不动 F3-0009 预签行段。
- **顺带确证一处缺陷成立且可自修**：`:52` `state.agent?.interactions ?? []` 无 sessionId 过滤（门 4 的根因），而 `selectedSessionId` 就在同一快照（contract.ts:66）⇒ P2-2 内可闭环，无跨包依赖。
- **方法论入册**：凡 F3 写进"请抄进批文"的断言，必须先对**被测视图**做全文实读，不得由示例（examples/agent-ui-probe）或前手摘要外推。本轮之前的门 3–5 断言正是外推所得。

### 14.7 契约行号失效面与再锚定清单（A2 后果；01:36，clean baseline 到达后按此复核）
- **原理**：`git mv` 整文件移动不改行号 ⇒ 本文所有 `extensions/**` 行段引用（含 F3-0009 预签 `view.tsx:10-40`、`entry.tsx` 三处、`view.tsx:53-55` 拆分点）**迁移后继续有效**；而步 2 把单一 `contract.ts` **按域拆成多文件** ⇒ 其中每条声明的行号与所在文件都变，本文 14 处契约引用**全部需重取**。
- **需重锚的 13 个符号**（现基线 `85cc3cd` @`packages/agent-ui-contracts/src/contract.ts`，实测行号）：
  | 现引用 | 符号（再锚定时按此名找，不按行号） | 用途 |
  | --- | --- | --- |
  | `:3` | `Availability` | §10.2 `stoppable` 复用类型 |
  | `:5` | `RunStatus` | 门 1 状态集、闸谓词左半 |
  | `:7` / `:11` | `AgentCapabilities` / `stop` | §10 连接级静态 vs run 级粒度 |
  | `:44` / `:46` | `AgentInteraction` / `sessionId` | 门 4 过滤所需字段 |
  | `:48` | `AgentInteraction.kind`（含 `approval`） | §12 标签文案、kind 不参与闸判定 |
  | `:53` | `AgentInteraction.state`（5 值） | 闸谓词右半、门 5 终态 |
  | `:66` / `:68` | `AgentSnapshot.selectedSessionId` / `runs` | 门 4 作用域、§10 三字段 run 条目 |
  | `:90` / `:124` | `AgentClient.setOption` / `AgentSessions.setOption` | 门 2 原"resolve 半句"所在的两处 `setOption`（该半句已作废，见 §14.18）。**03:35 补入**：本表初版只列 10 个符号、恰漏这两处，而 F3 正好在漏项上写了可贴稿（已在稿内改为符号形） |
  | `:43` | `AgentMessage.status?`（可选，值域＝`RunStatus`） | **03:48 补入**（§14.19(3) 的门 1b 依据）：字段可选 ⇒ `undefined` 合法 ⇒ 视图 `:54` 末支吞成 complete。**批文引用此字段一律用符号名**，且**必须带文件名**以免与视图侧 `:53`/`:54` 撞号。 |
- ⚠ **03:48 消歧**：本表的 `:53` 指 **`contract.ts` 的 `AgentInteraction.state`**；§14.19 撤回的 `:53` 指 **`conversation/view.tsx` 的消息 status 合并支**。两处同号不同文件 ⇒ 今后 F3 所有行号引用**必须带文件名**，批文亦然。
- **规则入册**：今后 F3 写给批文的契约引用**一律符号锚定**（`contract.ts:<符号名>.<成员>`），行号只作当轮证据附注；对 `plugins/**` 视图引用可继续用行号，但须在批文里注明"以整文件机械移动为前提，若该文件在同批被改写则行号作废"。
- **对 F1/F2 的中立提示**（不代主张）：两家批文输入若也含契约行号引用，失效面与此相同。
- **本表的管辖范围（03:35 全文清扫后加收，用于一次性结掉这一类而不逐行改）**：
  - **必须符号形（已逐一核改，这三件是"会被别人复制/照抄"的对象）**：`reports/p2-2-batch-draft.md`（FC 按 FC-0016 §5 原文并入）、本节 §14.3 五门表（同上）、`reports/reuse.md`（后继实施者的复用账）。本轮实查结果＝**可贴稿曾有一处 `contract.ts:90/:124`，且是我在写"路 A 撤回"那轮新引入的**（⇒ 记为"再锚定要覆盖将被复制的那份"这条规则的**第二次违反**，且违反点正是本表自身的漏项）；`reuse.md` 另三处（`:3/:11/:68`、`:66`、`:46`）已改符号形。
  - **保留不动（按本表读作 @85cc3cd 证据即可）**：本文 §3–§12 的历史分析行、以及 **`outbox/**` 已发出的消息**——消息是带时间戳的既发证据，**不回改**（改了会毁"我当时说了什么"这条链）；如需更正，一律另发新件（本轮即 F3-0032 的做法）。
  - **新写规则**：F3 之后任何新工件写契约引用，落笔前先在本表取符号名；**若本表没有该符号，先补本表再写引用**（这次的漏项就是这么来的）。

- **05:09 符号名全表复验（本轮＝首次逐个核名字，此前只核过个数）**：直读 `packages/agent-ui-contracts/src/contract.ts` 全文 127 行（4410 bytes @85cc3cd），**13 个符号的名称与"仅作证据"的行号全部命中**——`Availability`:3／`RunStatus`:5／`AgentCapabilities`:7 与 `stop`:11／`AgentInteraction`:44 与 `sessionId`:46／`kind`:48（5 值含 `approval`）／`state`:53（恰好 5 值）／`selectedSessionId?`:66 与 `runs`:68／`AgentClient.setOption`:90 与 `AgentSessions.setOption`:124／`AgentMessage.status?`:43。⇒ **结论：批文按本表以符号名引用是安全的**（"已查且通过"，落纸以免他人复查）。
  - **⚠ 同次直读查出一条陷阱，须记在表旁**：`RunStatus`:5 的**类型域确实含 `'unknown'`**（全 7 值）。只看类型会以为门 1"消息级永不取 unknown"为假、进而把已撤回的 `:53` 拆分重新捡回来。**不冲突**：§14.19 的撤回依据是**生产者值域**（codex `client.ts:34` 只产 completed/failed/running；pi `client.ts:36` 只产 cancelled/failed/completed／不写＝undefined），不是类型域。⇒ **判据：凡断"某值生产不可达"，须同时写明类型域与生产者值域两个来源**，否则下一位读者只查其中一个就会推翻你的撤回。
  - 同次直读另确认门 2／门 4 夹具用到的字段全部真实存在：`AgentOption.id`:56、`availability`:60、`values`:59、`AgentSnapshot.options`:70、终态值 `resolved`/`expired` 在 `AgentInteraction.state`:53 内。

### 14.8 `src→renderer` 与 A1/A2 的第三行缺口（01:43 新证据；同一文件、同一失败类）
- **实读证据**（本树 `85cc3cd`）：
  - `apps/desktop/vitest.config.ts:8` ⇒ `test: { include: ['src/**/*.test.tsx', 'src/**/*.test.ts'] }`（相对 `apps/desktop/`，因 `package.json:11` 的 `vitest run --maxWorkers=1` 在该目录执行）。
  - `apps/desktop/src/` 现有 **8** 个 `*.test.*` 文件（实测计数）。
  - F0 计划本身要求改这一族文件：`fe-prep-research.md` §1 行 1"apps/desktop/src → renderer … 需同步：tsconfig include、**vitest.config**、build.mjs 与各脚本相对路径、smoke 引用"，步 6"apps/desktop：src→renderer … tsconfig/vitest/package.json scripts/测试 import 路径同步"（`tsconfig.json:24` `"include": ["src", …]`、`scripts/build.mjs:10,16` 同理）。
- **缺口**：A1 判"`vitest.config.ts` 零改动（改动仅经显式批文行）"，A2 只把**第 5–6 行两条 alias**升格为显式授权行。⇒ **第 8 行 `test.include` 是步 6 必然要改、但 A1+A2 字面仍未授权的第二类改动**。F0 复活批文文本已定＝FC-0012+A1+A2（C-0037 §2），不含此行 ⇒ 步 6 会像步 2 一样中段撞墙，只是撞在 F0 自己已列出的同步清单上。
- **对 F3/F1/F2 更危险的一半（静默）**：A1 §2 把 P2 新测试口径写成 `apps/desktop/src/agent-<包>.test.*`，这是**迁移前坐标**。clean baseline 到手时 `src/` 已不存在（步 6 改 `renderer/`），若批文照抄 A1 字面而 `include` 已（正确地）改指 `renderer/**`，则落在 `apps/desktop/src/` 的新测试**一条都不匹配、且因 `renderer/` 里仍有 8 个匹配文件而不会报"No test files found"**——正是 F3-0013 消除过的那个"放了不跑"失败面，被路径口径从后门放回。
- **最小解法（不改任何裁定）**：①批文把 P2 测试落点表述为**"应用测试目录在 clean baseline 上的实际路径"**（迁移后＝`apps/desktop/renderer/agent-<包>.test.*`），或明确 A1 的 `src/` 为迁移前坐标；②把 `vitest.config.ts` 的 `test.include` 行与 A2 两条 alias **同法**授权（归 F0、在步 6 改、列为显式批文行），使 A1 的"零改动"限缩为"除本三行外零改动"。
- **归属自律**：本文件写域仍是 F0 的；F3 只提事实与两种可行写法，不主张改动、不自行代改。若 FC 判 F3 越界，F3 撤回该请求，不自行动工。
- **【已闭合 01:45】**：C-0042（A3，`reply_to: F3-0018`）**两项全采**——§1 授权 `test.include` 为第三处显式批文行、"零改动"限缩为"除上述三处外零改动"；§2 把 A1 的 P2 坐标正式更正为 `apps/desktop/renderer/agent-<包>.test.*` 并明写"你 §二 判断成立"；§3 判 `tsconfig`/`build.mjs` 相对路径同步属原批文 §6 既有范围（故 F3 未提、C 亦未扩），复活批文文本＝FC-0012+A1+A2+A3。**本节据此从"待裁"转为"终口径"，终口径行已入 §13；§14.2 路径已改写。**

### 14.9 对话视图全文实读后的第二次勘误（01:49；§14.6 方法论对 §14.3 门 1/2/4 的再次适用）
对象 `extensions/agent-conversation/src/view.tsx`（本树 `85cc3cd`，107 行）此前只按前手摘要与示例外推，本轮**首次全文实读**。三处问题：一处**假红**、一处**假绿**、一处**作用域误标**。

**(1) 门 1 的"`[role=alert]` 为 null"不成立——会让 F3 自己的验收假红。**
- 实文 `:81` `{agent.connection.status !== 'connected' && <p role="alert" className="agent-error">Connection lost. The result of an active run is unknown. Reconnect from Connections.</p>}` ⇒ **只要断线就一定有 `[role=alert]`**，而 `run.status==='unknown'` 在产品语义里恰恰就是断线后的结果未知态。照初稿断言"alert 为 null"，只有造出**现实中不存在的夹具**（unknown 但 connection 仍 `connected`）才能通过，那就不再测真实场景。
- 实文另两处：`:80` `<div className="agent-run-state" data-status={run?.status ?? 'idle'}>` ⇒ 状态有**稳定属性句柄**；`:83` `{run?.status === 'unknown' && <p role="status" className="agent-notice">Run outcome unknown after disconnect.</p>}`。
- **改后的门 1（四条，均有实文支撑）**：夹具取 `run.status='unknown'` **且** `connection.status!=='connected'`；断言 (a) `section.agent-conversation .agent-run-state` 的 `data-status === 'unknown'`；(b) `[role=status].agent-notice` 文案为 `Run outcome unknown after disconnect.`；(c) **不存在** `[data-status=failed]`（unknown 未被冒充为 failed）；(d) `[role=alert]` 若存在，其文案必须是 `Connection lost…` 那条断线语义，不得出现把该 run 判为失败的表述。
- **同一实文还暴露门 1 的实质落点**：`:53` `message.status === 'failed' || message.status === 'unknown' ? { type:'incomplete', reason:'error', error: message.status }` ⇒ 消息级两者**当前形状完全相同**，只有 `error` 负载字符串不同，而 `:62-64` 的 `ChatMessage` 未提供任何 error 渲染组件 ⇒ **"unknown≠failed"在消息级目前并未成立**，必须拆 `:53` 的合并分支（即 ⑤ 号请求；该行段**尚未获授权**，见 (3)）。**〔⚠ 03:47 本节结论部分作废，见 §14.19：本行"消息级当前形状相同"的观察**成立**（且更弱——`:62-64` 根本没有 error 渲染组件，连 `error` 负载都不显示），但据此提出的"拆 `:53`"是错药——`message.status` 在生产里永不取 `unknown`，拆了零可见变化。真正可达的是同一链末支 `:54` 把 `undefined` 渲染成 complete。〕**

**(2) 门 2 的"对话区无 `select`"是可被空转的断言——会让 F3 自己的验收假绿。**
- 实文 `:85-88`：渲染条件只有 `agent.options.length > 0` 且逐项 `option.availability === 'supported' && option.values?.length` ⇒ **视图对 `model` 没有任何专属抑制**。"对话区无 select"因此只可能来自：夹具恰好没给 supported 选项（**vacuous**），或根本没渲染到对话线程。
- **具体的假绿机制**：`Conversation`（`:100-105`）有三道占位分支——`:102` 无 `selectedConnectionId`、`:103` 无 `agent`、`:104` 无 `sessionId`，任一命中即渲染 `<div className="agent-panel agent-placeholder">`，**其中没有任何 `select`** ⇒ 装配不全的夹具会让"无 select"**通过而完全不触及对话区**。
- **改法（两点须写进批文）**：①门 2 在断言"无模型入口"**之前必须先断言存在** `section.agent-conversation .agent-thread`（证明已进线程而非占位）；②真正的保障只剩两条路，须 FC 择一：**路 A**——契约/适配器义务（`agent.options` 永不含 `model`），归 **F1**，F3 侧只保留 `await service.setOption('model', …)` resolve 的健壮性断言；**路 B**——在 `:85-88` 新增按 `option.id` 的过滤（视图侧硬抑制），属**新行为且落在未授权行段**，须在 P2-2 精确路径另行授权。〔⚠ **本段"两条路须 FC 择一"的口径已于 03:22 作废**：路 A 经实读两连接器证伪、已撤回，路 B 为唯一可行路；本段"①先断 `.agent-thread` 存在"两点仍然有效。见 §14.18／F3-0032。〕F3 不代为择路，只指出"初稿两条路都没选，实施者会写成空断言"。

**(3) 门 4 的先例性质需改标；且五门的对话侧落点几乎全在已预签行段之外（结构性提醒）。**
- `:105` `key={`${state.selectedConnectionId}:${sessionId}`}` 实文确认，但它是**会话级重挂载**的证据（key 含 sessionId），不是"不重挂载"的先例 ⇒ 正确表述：对话线程天然按会话隔离，**串卡风险只存在于交互侧**（`agent-interactions/src/view.tsx:52` 无 sessionId 过滤，§14.3 门 4 已记）。
- 行段核算：F3-0009 经 FC-0013 §3 预签的 `view.tsx:10-40` 其实文是 **`SessionBrowser`（连接/会话面板）**；而门 1/2 的落点在 `:53`、`:80-83`、`:85-88`，stop 文案在 `:94-95`，线程 key 在 `:105` ⇒ **五门的对话侧改动面基本不落在预签段内**。请 FC 在 P2-2 精确路径里**逐段列出** `:53`（门 1 拆分）、`:85-88`（仅当采路 B）与 ⑤ 号请求，不要让"预签 10-40"被当成已覆盖五门。〔⚠ 03:22：路 B 已是**唯一**路 ⇒ `:85-88` 授权**必列**，不再是条件项。〕
- **本轮不推翻**：门 3（右栏收起，属 `WorkbenchShell`，不在本文件）、门 5 的交互视图侧结论（`interactions/view.tsx:24-25`，01:22 已实读）、§14.4 第一条英文文案（`:94-95` `Request stop`/`Stop requested`、`:59` `Running`/`Result` 本轮再确证）。
  - **01:56 更正**：本条把门 3 排除在"本轮不推翻"之外的前提是"没实读所以不动"。实读后门 3 的**先例引用有一处挂错主体、断言有一处会假绿**，见 §14.10；门 5 与 §14.4 第一条的结论不受影响。

### 14.10 门 3 的源级验证（01:56；§14.6 方法论对最后一扇未实读门的适用——它跨到别人的写域）

门 3 是五门里唯一**断言落在 `extensions/workbench/**`（F0/FC 写域）**的一扇，所以我此前只按 §14.3 抄了"先例"而未实读。本轮把 `workbench/src/model.ts`(68)、`workbench/src/shell.tsx`(152)、`shared/boundary.tsx`(5)、`shared/registry.ts`(16) 与 `apps/desktop/src/foundation.test.tsx:100-141` 一次读齐。四条结论：

**(1) 可实现性确认：门 3 全程只用既有导出，F3 不需要碰 workbench/commands 写域、不需要新 stub——但 `WorkbenchShell` 要两个 prop。**
- 夹具配方有现成先例：`foundation.test.tsx:103` `new OwnedResources(), createWorkbench(owner), createCommands(owner)` → `:106-108` `forScope(owner).addView(...)` → `model.service.open(...)` → `mount(<WorkbenchShell model={model} commands={commands} />)` → `:110` `model.move('counter', 'right')` → `:113` `model.collapse('right', true)`。
- **`shell.tsx:26` `WorkbenchShell({ model, commands })` 需要两个 prop**，且 `:31` 对 `commands` 做了 `useSyncExternalStore(commands.subscribe, commands.getSnapshot)`——只传 `model` 会在 render 期抛错。这是实施者最容易漏的一步，**请批文明写"两个 provider 都要建、都要传"**（`createCommands` 的 import 先例同文件 `:9`）。
- 收起后视图仍在：`model.ts:42-45` `collapse()` 只改 `layout.collapsed`、明确保留 selection（对照 `foundation.test.tsx:113-114` 收起后仍断言 `getSelection().right === 'counter'`），`:36` 的 `open()` 则会把该区域 **un-collapse**。

**(2) 我此前挂错的先例：`foundation.test.tsx:138` 不是"区域 inert"的先例。**
- `:138` 实文断言的是 `container.querySelector('[data-testid=workspace]')?.hasAttribute('inert')`——即 **full-page 打开时整个 workspace 被 inert**（源文 `shell.tsx:119` `inert={!!full}`），**与区域收起无关**。
- 真正的区域 inert 在 `shell.tsx:75`：`inert={name !== 'main' && (!has[name] || !!layout.collapsed[name])}`。⇒ **"`[data-region=right]` 收起后带 `inert`" 在本仓没有任何既有断言先例**，是 F3 首次提出。§14.3 门 3 行已就地删掉 `:138` 的引用。

**(3) 门 3 的假绿机制：空区域本来就 inert ⇒ 只写后半句等于空断言。**
- 由 (2) 的 `!has[name] || ...` 与 `:40` `has[r] = entries(r).length > 0`：**没注册任何视图的右栏天然 `inert`**，且 `:40` 的 `entries` 走 `model.regionOf(v)`，若忘了 `addView`/忘了 `open`，右栏是空的、断言"有 inert"**照样通过而完全没触及收起语义** ⇒ **只写后半句即为假绿**。
- 补两条入批文：①**先断收起前右栏确有内容**：断 `[data-region=right]` 的 `textContent` 含夹具自注册视图的文案，证明确实注册并渲染了〔⚠ **08:41 更正（§14.25／F3-0039）**：本条旧写法点名 `section[data-region=right] .agent-conversation`，**该选择器永不命中**（`agent.conversation` 注册在 main 区）——当时未读注册点即落笔，同批三处已一并改〕；②**顺序必须先 `open` 再 `collapse`**（`model.ts:36` 反序会把 collapsed 冲掉）。
- 内容挂载机制一并登记（影响"收起后还在不在"的期望）：`:92` `.wb-content` 是 host，`:145`+`:15-20` `ViewSurface` 用 **portal 把活动视图挂进 host**，`move` 只换 host ⇒ 组件实例不重挂载。所以"收起后内容消失"不能靠 DOM 不存在来断，应断 `inert`/`aria-hidden` 语义。

**(4) 两条跨门规则（本轮新查出的机制，适用于全部五门）。**
- **`Boundary` 是免费的崩溃探针，但必须按文案区分**：`shared/boundary.tsx:5` 捕获后渲染 `<p role="alert">此内容加载失败，可关闭后重新打开。</p>`。它与门 1 的断线 `[role=alert].agent-error`（`agent-conversation/src/view.tsx:81`）**同为 `role=alert`** ⇒ **凡用"数 `role=alert`"作断言的地方都必须按文案/类名区分，不能只数 `role=alert`**；反向用处：视图若抛错，`role=alert` 会出现，所以"alert 为 null"同时是"未崩溃"的证据，写断言时不要把两件事混成一条。
- **§14.4 第一条"产品视图是英文"需限缩**：英文只覆盖 **F3 两个包的视图**（`agent-conversation`、`agent-interactions`）；`workbench/src/shell.tsx`（`:12/:121` 区域中文标签、`:86` `移动 … 到`）与 `boundary.tsx:5` 是**中文**。这有两个后果：一是门 3 的断言若命中 shell 区域标签要用中文；二是 `shell.tsx:86` 是**全仓第二个** `<select>` 来源（`:119` 之外），门 2"对话区无模型入口"若写成"全页无 select"会被 workbench 自己的"移动…"下拉直接判假红——**门 2 必须限域到 `section.agent-conversation`**，与 §14.9(2) 的"先断 `.agent-thread`"是同一件事的两半。


### 14.11 【结构性缺口】五门的"产品进应用门"那一半，落在 A1/A2/A3 之外、且不在 F3 写域（02:13）

查 C-0045（02:09）时顺出两件事实，合起来是 P2-2 目前**最大的未登记面**：

**(1) 全队"root 门绿态"是 Python 专属，FE 测试不在其账本里。**
BC-0022/C-0045 的 `20 failed / 1465 passed / 33 skipped` 名册全是 `tests/**.py`（`-k codex`、`test_first_run_lock.py:453` 等），FE 侧一条都不在这个账本 ⇒ **谁为 P2-2 的绿态作证，不是那扇 root 门**。FE 自己的入口是离散的（根 `package.json` + `apps/desktop/package.json`）：
- `npm test` → `vitest run --maxWorkers=1`，`include` 仅 `src/**/*.{test.ts,tsx}` —— **A1/A2/A3 的全部裁定只作用在这一条上**。
- 另有 **5 个 `.mjs` 门**（`test:foundations` / `test:extensions` / `test:agent-ui` / `test:agent-shell` / `test:agent-process`）+ `test:electron`，**都不是 vitest**：`node:assert/strict` + `mkdtemp` 临时 home + 真启应用（`launch-smoke.mjs`），完全不受 `test.include` 影响。

**(2) C-0026 §6 要求"包级夹具 + 产品进应用门各跑一遍，后者不以前者替代"——那个"产品进应用门"确实存在，但位置一丁点都没授权。** 现有对话/交互的应用级门是：
- `apps/desktop/scripts/test-agent-shell.mjs`（22 行）：以 `extensions/agent-preview.json` 起真应用，`assert.deepEqual(result.agentShell, {navigation, codexVisible, piVisible, emptyConversation, requestsView})`。
- 探针本体在 **`apps/desktop/electron/main.ts:100-112`**（`MODULAR_AGENT_SHELL_SMOKE`，用 `executeJavaScript` 注入 renderer 查真 DOM）。
⇒ 这两处**都不在 `src/**`（vitest 不收）、都不在 A1/A2/A3 已裁落点上、也都不在 F3 写域**（`electron/**`、`scripts/**` 归 F0）。所以 §10.4 表头那句**目前只有一半有落点**：五门的 vitest 半边我已逐门核完（§14.3/§14.10），**应用半边一条都还没有授权路径**。

**(3) 探针实文顺出三条可直接用的证据（也反过来加强门 3 的写法）：**
- `main.ts:109` 用 `[data-region="right"] [role="group"] button` 精确取**右栏页签条** ⇒ 这正是 §14.10(3)"收起前先断右栏有内容"的**选择器先例**（比 `foundation.test.tsx:138` 对口得多；宿主是 `shell.tsx:77` 的 `<div role="group" aria-label="{name}视图">`）。**且这里的 'Requests' 是视图标题（英文，来自扩展贡献），不是区域标签（中文 `右侧栏`）** ⇒ 与 §14.10(4) 的中英并存结论一致、不冲突，反而是一枚旁证。
- `main.ts:108` 断 `.agent-placeholder` 含 `Choose a connection` ⇒ **现有应用级门恰好停在 `conversation/view.tsx:102` 的占位分支**（无选中连接）。含义很硬：**不注入一个"已选连接"的夹具，应用级门永远进不了对话线程**，门 1/门 2/门 4 的"进应用"半边在现结构下**不可表达**，只能表达 presence 类断言（如 `requestsView`）。
- `deepEqual` 是**精确形状**比较 ⇒ **在探针侧新增任何字段，都会把一扇现有绿门直接判红**，必须同批同步改 `test-agent-shell.mjs`。这与 A2/A3 消除的"改一步撞另一处未授权文件"同类，只是第三个文件（仍在 F0 写域）。

**(4) 因此需 FC 明确择一（F3 不代裁）：**
- **甲**：批文扩到"应用半边"——需另授 `apps/desktop/electron/main.ts` 与 `apps/desktop/scripts/test-agent-shell.mjs`（均 F0 写域），并解决"如何注入已选连接"（可能还要动 `extensions/agent-preview.json` 或加一个新 smoke 开关）。代价：跨两个写域、动现有绿门形状。
- **乙**：批文显式声明**本轮五门只做 vitest 半边**，应用半边整体推后，并在验收条款里**改掉"后者不以前者替代"的表述**，避免日后以 vitest 全绿冒充 C-0026 §6 已满足。
- 现状最坏的是**第三种：不写**——批文只含两个 vitest 文件，验收条款却仍照抄 C-0026 §6 ⇒ 实施者只能交一半、报告按五项收。**这一项比门 1/门 2 的任何细节都更能决定 P2-2 是否名副其实**，故单发一件（F3-0022）。

**(5)【已闭合 02:16】C-0046（`reply_to: F3-0022`，记入 decisions.md HD-001-C-022）全盘采乙案**，理由直接采 F3 三条（停在占位分支／需夹具基础设施／presence 冒充行为）：
- 本轮五门**只做 vitest 半边**；应用半边（`electron/main.ts` 探针 + `test-agent-shell.mjs` + 已选连接夹具）**整体推后续专批**，届时另列 F0 写域授权行。
- **台账如实记**：P2-2 对 C-0026 §6 为**部分满足**（vitest 五项 + 包级夹具），应用半边未覆盖**不宣称** ⇒ 我在 §14.11(4) 最担心的"交付一半、按五项收"被明确禁止。
- `deepEqual` 形状锁（`test-agent-shell.mjs:18`）登记为未来探针批次注意项；`main.ts:109` 右栏页签条选择器先例获认可可沿用。
- C 另确认"F3 维持 RESEARCH_ONLY 至批文，正确"，并要求 FC 把同构口径推到 P2-1/P2-3。
⇒ **F3 侧后果**：§14.3 五门表的适用范围**收窄为 vitest 半边**，批文须带覆盖范围声明；门 1/门 2/门 4 不再需要应用侧夹具设计。**但 C-0046 §1 与 decisions.md:50 把落点写成 `apps/desktop/src/agent-*.test.tsx`——那是 A3 已废止的迁移前坐标**，若 FC 照抄即重开 F3-0018→A3 关掉的静默不跑洞 ⇒ 见 §14.12 与 outbox/F3-0023。

### 14.12 C-0046 §1 的落点字面与 A3 冲突（02:18；同一缺陷第三次出现，这次带双重权威）

裁决本体（乙案）我无异议，但**落点字面错了**，且错了两处：

| 出处 | 时间 | 字面 | 效力 |
| --- | --- | --- | --- |
| **C-0042（A3）§2** ＝ `reply_to: F3-0018`，C 亲裁 | 01:45 | `apps/desktop/**renderer**/agent-<包>.test.*` | **现行有效** |
| **C-0046 §1** | 02:16 | `apps/desktop/**src**/agent-{conversation,interactions}.test.tsx` | 迁移前坐标 |
| **`decisions.md:50`（HD-001-C-022）** | 02:16 | 同上 `src/` | 已入**耐久台账** |

**机制不变**（同 §14.8）：步 6 把 `apps/desktop/src → renderer`，`test.include` 同批改 `renderer/**`（A3 第三行）⇒ 落在 `src/` 的两个新测试**一条不匹配**，而 `renderer/` 内仍有 8 个既有匹配文件 ⇒ **vitest 不报 "No test files found"**，五门"已实施"却从未执行。

**这次为什么更危险**：①它写在一条 **APPROVED 裁决**里，且同一句还说着"按 F3 §14.3 终稿表实施"，看起来完全可信；②它同时进了 `decisions.md`，比单条消息耐久；③C-0046 末段要求"**P2-1/P2-3 同构适用**"，同构沿用该句形会让 F1/F2 一起中招。

**处置**：发 outbox/F3-0023（只请改一个词，不请复议任何语义）——①FC 折批文时用 A3 现值 `renderer/`；②请 C 确认是否更正 `decisions.md:50`／C-0046 §1 字面，或回一句"落点以 A3 为准"由我按确认口径登记。**F3 不自改中央台账**（`decisions.md` 归 C），只报冲突。

**方法论记一笔**：这是"字面漂移"类缺陷的第三次（A2 alias → A3 include → C-0046 落点）。共同根因是**跨批次转述时引用了迁移前的坐标而不是迁移后的**。可复用规则：**任何写进批文的路径字面，都要用"clean baseline 上的实际路径"而非记忆坐标**；凡 `apps/desktop/src/**` 字面出现在 P2-x 批文里，一律按可疑处理，先对 A3 再落地。

**(6)【已闭合 02:22，附一条归因更正】C-0047 全采**：§1 明写"**以 A3 坐标为准：`apps/desktop/renderer/agent-<包>.test.*`**"、"C-0046 裁决语义（乙案、五门 vitest 半边、应用半边推专批、台账部分满足如实记）全部不变"；§2 要 FC 折批文时统一用 `renderer/` 不沿用 `src/`。C 选的是我在 F3-0023 §处置里预备的第二种口径（回一句"落点以 A3 为准"），该口径自带"不请改中央台账"⇒ **`decisions.md:50` 的旧字面我不再请求更正**，F3 侧按 A3 锁定。**本类缺陷至此四次出现、三次由 F3 报出（F3-0018→A2/A3、F3-0023→C-0047），一次由 F2 报出（F2-0010）**——多眼机制在被要求时报了一次，说明该规则应当前置为成文条款而非依赖下轮运气。

**(7)【新缺陷类型：裁决件里的"归因句"也会错】C-0047 §1 的根因句与事实相反**：原文"~~`apps/desktop/src/...` 系沿用 **F3-0022 自身框架**的迁移前坐标~~"。实测 `grep -n 'apps/desktop/src\|src/agent-' agents/F3/outbox/F3-0022.md` → **零命中**；F3-0022 全程只称"五门的 vitest 半边"，未写任何测试路径字面，而其中唯一含 `src→renderer` 的一句是**反向澄清**（"步 6 不影响 `electron/**`、`scripts/**`，勿并入 FC-0012 复活批文"）——即该件在阻止坐标串用。真实首次入裁处是 **C-0036 §2**，由 **C-0042 §2（A3）**作废，再于 **C-0046 §1** 二次带出。发 **F3-0024**（NOTE，无待裁项）请 C 把该句改为"跨批次转述时沿用迁移前坐标"。**为什么值得花一条消息**：C 已把本件计入 loop-registry，而**根因挂在谁身上决定下次由谁防**——若记成"F3 的框架带出旧坐标",真正的失效面（任何一方凭记忆在批文/裁决里写路径字面）就没人防。由此补一条方法论：**验收他人结论时，不仅核"结论对不对"，也要核"归因句对不对"**；本轮 F2 被 §3 单独质疑 `owner_generation`，同属"稿件里的事实性陈述（不止裁定本身）会漂移"。

### 14.13 五门 vitest 半边的**装配配方已核完**（02:27；乙案范围锁定后的最后一块实施风险）

乙案把应用半边推走后，P2-2 的可行性只剩一个问题：**门 1/2/4/5 在 jsdom 里能不能真的把产品视图喂到"有内容"的状态？** 此前 §14.11 只证了应用门进不去，没证 vitest 门进得去。本轮实读 `agent-sessions.test.ts:1-40` + `extensions/agent-sessions/src/model.ts:4-13` + 两视图 props，结论：**能，且全程用既有先例、零新机制、零跨写域。**

**配方（三步，均有先例）**：

1. **假 `AgentClient`**——照抄 `agent-sessions.test.ts:7-23`：一个 `let snapshot: AgentSnapshot` + `listeners:Set` + `calls:string[]`，`getSnapshot/subscribe` 直连，七个方法把参数记进 `calls`。
2. **真服务**——`createAgentConnections(registryScope)` → `registry.forScope(xScope).add({id,title,connect: async () => fake.value})` → `createAgentSessions(sessionScope, registry)`（`model.ts:4`），三者全用**真实的** model/registry，只把最外层连接器换假。先例＝同文件 `:26-33`。
3. **挂真产品视图**——`mount(<Conversation service={sessions} />)`（视图 prop 就是 `{ service: AgentSessions }`，`entry.tsx:10` 也是这么喂的）；环境桩照 §14.1 末条四项。

**为什么这条值得单独记（四个后果）**：

1. **`model.ts:13` 是关键证据**：`agent: clients.get(selectedConnectionId ?? '')?.getSnapshot()` ⇒ **整个 `agent` 切片逐字来自假 client 的 snapshot**，包括 `connection.status`、`runs`、`messages`、`interactions`、`options`。⇒ 五门断言的**每一个输入字段都可控**，门 1 要"`status:'unknown'` 且 `connection.status!=='connected'`"、门 5 要"pending 卡 + `respond()` 计数"都在假 client 里一行写完，**不需要碰 `:53` 以外的生产逻辑**。
2. **乙案推迟的那件事，不阻塞 vitest 半边**——§14.11 说应用门卡在"无法注入已选连接"（`main.ts:108`），而 jsdom 里 `await sessions.selectConnection('A')` 就是服务自己的公开方法（先例 `:34`）。⇒ **F3 五门的实质内容没有随乙案被推迟**，推迟的只是"同一条断言在真应用里再跑一遍"这层外部性。这条应写进批文，防止后来者误读乙案＝"五门降级为玩具"。
3. **门 2 的两半在 vitest 半边都可自证**：`setOption` 是真服务方法（`model.ts` 转发给 client）⇒"resolve"半句无需应用门即可断；**路 A（model 永不出现在 `options`）只需假 client 的 `options: […]`**，故 FC 选路 A 或路 B 都不受乙案推迟影响。〔⚠ **本条两个结论已被 §14.18／F3-0032 推翻其前提**：①"resolve 半句可自证"＝**假 client 自证**，不作断言；②"路 A 只需假 client 一行"掩盖了路 A 在真语义下**根本不成立**——假 client 能构造出"永不含 model"，真连接器不能。**本条唯一仍有效的部分**＝门 2 的断言确实在 vitest 半边可完成、不受乙案推迟影响。〕
4. **导入路径不预写字面，改由开工首步实测**（⚠ 本条初稿曾写"照 `:38-39` 形状"，**已由 §14.13 勘误段作废**——该列是"新归属"且被 A1 否决）：五门的 import 会跨 **3 个包**（视图包 + sessions model + connections registry）。现状写法是**相对路径** `../../../extensions/**`（实测 5 个既有测试文件全这样），迁移由 **F0 步 6 的"测试 import 路径同步"**（`fe-prep-research.md:60`）负责，但**其目标目录此刻尚不存在**（FE-PREP 停在步 1）⇒ 批文不应预写 import 字面，只写"**开工首步实测 `plugins/**` 三处目标＋`vitest.config.ts` alias 现值，确认可达后再写断言**"。跨包 import 的合法性由既有 5 个测试文件的事实先例＋`:27` 括注（F0 明确把测试排除在"宿主不得 import 业务源码"之外）保障。

### 14.13 勘误段（02:34；F3-0026 自纠，同属"引用他人工件前先读列语义"类）

**错在哪**：F3-0025 §四.1 让 FC"照 `fe-prep-research.md:38-39` 形状"写新测试的 import 字面。回读该表标题=**"§3 旧测试所有权迁移清单"**、列名=**"新归属"** ⇒ 该列回答的是"**测试文件本身归哪个包**"（表头分组语为"随包走（包内 vitest）"），**不是"从哪儿 import"**。

**为什么这条错误必须马上收**：①**A1（C-0036 §1）已把这一列作废**——"步 3 测试文件保留 `apps/desktop/src/`（**不迁入 `plugins/**`**，仅 import 重指向）"，验收项还是 git-status "**无新增 `plugins/**/*.test.*`**"，而 F0 计划自 00:41 未更新，其 §3 表仍写"随包走"；若我引它当坐标权威，等于把一条**已被现行修正案否决的方案**写进 P2-2 批文。②FC 正在成文，错的引用比缺的引用更贵。

**改成什么（不依赖 F0、不阻塞批文）**：现状 `agent-sessions.test.ts:3-4` 用的是**相对路径**（`../../../extensions/…`）而非别名 ⇒ 迁移后可达性只取决于**步 3 落地后的实际目录**，而该目录此刻不存在（FE-PREP 停在步 1）。故批文宜写"**P2-2 开工首步实测 `plugins/**` 三处目标（视图/sessions model/connections registry 工厂）＋ `vitest.config.ts` alias 现值，确认可达后再写断言；与批文行段冲突即停并回报**"——三家共用同一步。

**其中一项不可省**：契约在视图里是**别名**（`view.tsx:4` `@extensions/ordessa.agent-contracts/contract.js`，由 `vitest.config.ts:5-6` 解析）。**A2 原文只说"两条契约 alias 随步 2 同批显式改指新 contracts/ 域 re-export 入口"——只动目标、未提键名**。⇒ 若步 2 连键名一起改，视图内说明符也得改（属 F0 步 2 既有范围、不新增请求），但**必须进开工首步的实测清单**，否则撞一次"A2 型"静默不可解析。

**§五 附带撤回**：F3-0025 请 F0 确认"`:27` 宿主不得 import 业务源码"是否豁免测试——`fe-prep-research.md:27` 该句自带括注"现 apps/desktop/src 无此 import（实查 .test.tsx 的 `@extensions/ordessa.contracts` 引用为 vitest 内 import map mock，见 §3 loader.test）"，**F0 早已把测试排除在该约束外**，问题不成立，已撤回、无需回信。

**方法论（与 §14.12 并列，本类第六次）**：**引用他人工件前，先读表标题与列名，确认该列回答的是不是我问的问题**；且**修正案（A1/A2/A3）会使既有计划表的某些列失效，引表当权威前须先过一遍现行修正案**。本轮两条可复用规则均由 F3 自查得出，非他人指出。

**剩余实施前提（不改裁定，仅记）**：~~门 1 要落"消息级 unknown"仍需 `view.tsx:53` 拆分授权（open_inputs ⑧）——配方只解决"喂得进去"，不解决"当前实现把 `failed||unknown` 合成一支"。~~ **〔⚠ 03:47 作废，见 §14.19／F3-0033：`message.status` 在生产中永不取 `unknown` ⇒ 该前提不成立；门 1 现四条断言属回归锁。仍成立的半句＝"配方只解决喂得进去"。新的授权请求改行为 `:54`＋`:48-56`。〕**

### 14.14 【自己的覆盖面漏洞】两门的修复动作落在**交互包**，而该包零预签；附门 5 的空断言判定（02:39）

**前提错误**：我此前（open ⑨ 及 §13 两行）把五门当成"只需加断言的回归验证"，于是覆盖面核算**只列了对话包的五行**。实读交互视图后推翻——**门 4 与门 5 有一半是改码，不是断言**。

**(1) 门 4 需要编辑 `agent-interactions/src/view.tsx:52`，而该文件从未预签。** 根因行就是渲染入口：`:52` `const items = state.agent?.interactions ?? []`，**无 sessionId 过滤**。可实施性同时得到确证：**`contract.ts:46` `AgentInteraction.sessionId: string` 已存在**，`selectedSessionId` 在同一快照 ⇒ **过滤完全在 F3 自家包内，不需要 F1 扩契约、不跨包**。授权面则相反：`FC-0013 §3` 的预签原文只针对 `conversation/view.tsx`，用途是 P2-3 撤 `SessionBrowser`。⇒ **批文若按"五行清单"落笔，门 4 开工首步即撞未授权行**——与我替别人查出四次的同一类缺陷，这次出在我自己的核算里。**这是本件唯一必办项。**

**(2) 门 5 的字面版是空断言，可假版现在是红的。**
- **字面"不自动重发"结构上必然成立**：`respond` 只由 onClick 触发（`:37/:38/:40/:41/:44/:45`），全文**无 `useEffect`、无定时器、无重试分支** ⇒ "不点击就断计数为 0"永不会失败＝§14.6/§14.10 定义的空断言。
- **真实风险是重复提交**：`:19-21` `submit` 无在途门控；`:37` 主按钮 `disabled` 只看字段空否，`:40/:41` 在 pending 期间**完全不禁用**；`model.ts:75` `respond: (id,answer)=>selected().respond(id,answer)` **直通不去重**（该文件 `inFlight` 见 `:7/:25/:36/:37/:55`，**只覆盖连接生命周期**）；且 `respond` 不改本地 state，快照更新前条目一直 `pending` ⇒ **连点两次＝两次 `respond(id, …)` 打到连接器**。〔⚠ **04:20 本条结论作废，见 §14.21／F3-0035**：最后一环不成立——codex `client.ts:261` 守卫 → **`:278 route.used = true`** → `:279` 发布 responding → **`:280` 才有第一个 await**（pi `:294→:301→:302→:303` 同形），而 `:262-277`／`:295-300` 全段同步 ⇒ **第二次点击必 throw，无双发窗口**。本条前半段（按钮不禁用、`model.ts:75` 直通）仍为实读事实，但**它不构成可施工的缺陷**。〕
- 两案已交 FC/C 择一（**甲**＝字面语义作回归锁＋台账记"未覆盖重复提交"；**乙**＝改 `:19-21` 加在途门控，断"一次动作恰一次调用"）。**F3 倾向乙**，理由同 §14.10 门 3：写成必过的门等于没写；若判乙超出 C-0026 §6 原意，则明写取甲并另立批次，F3 不自扩范围。〔⚠ **04:20 本条从待裁面撤下，见 §14.21／F3-0035**：乙案**确实**超出原文义（C-0026 §6＝不**自动**重发，非防连点）⇒ 由 F3 自撤回，**门 5 定甲案、零待裁**。另撤回本条对甲案的一句过头话："字面版＝空断言"不确——被测对象是视图自身的重试路径（生产码），假件只是被调用方，甲案是正当回归锁。〕

**(3) 夹具侧配套（不新增机制）**：择乙时，假 client 的 `respond` 须**只计数、不 mutate `state`**——否则条目立刻转终态、按钮消失，双发路径复现不出来。这正是 §14.13 配方可表达的（`model.ts:13` 使快照完全由假 client 决定）。

**方法论（本类第七次）**：**核验收覆盖面时，要按"这条验收是*断言*还是*改码*"分类，再逐行对预签**——只看"断言能不能写出来"会系统性漏掉需要编辑的行。与前一条（§14.13 勘误段的"先读列语义"）并列，且本轮两条均由 F3 自查得出。

### 14.15 【第六例字面漂移，但源头形态不同】C-0047 §2 的更正句漏了 P2-1（02:44）

前四例是"**抄错字面**"（把迁移前坐标写进新稿件）。这一例是反向的：**"更正字面的那句裁决，漏列了它自己的适用范围"**。

- `agents/C/outbox/C-0046.md` 末行把乙案范围扩到三家："**P2-1/P2-3 同构适用**"。
- `agents/C/outbox/C-0047.md:17` 补坐标更正时只列两家："FC 折入 **P2-2/P2-3** 批文时统一使用 A3 坐标（`renderer/`），不沿用 `src/` 字面"。
- ⇒ P2-1 处于"**裁决范围有效、坐标更正未送达**"的缝里。

**已在同级稿件里显形（非假设）**：`agents/F1/outbox/F1-0013.md:17`（`reply_to: FC-0016`）"P2-1 新建测试全部落 **`apps/desktop/src/`**"。该句**归属判断完全正确**（不迁包内、避开静默不执行），只有物理目录字面是迁移前的——而 `src/` 这个字面**躺在 A1 自己的原文里**（`FC-0016 §1` / C-0036 §2 "保留在 `apps/desktop/src/`"），A3（C-0042 §2）正是废它的那条修正案。⇒ **照抄任何一份含 A1 原文的权威件都会把它带出来**，这就是 §14.12 说的"缺陷随权威措辞复现"。

**本树实测（@85cc3cd，02:43）**：`apps/desktop/renderer` 不存在（`ls` 报 No such file）；`vitest.config.ts:8` 现值 `include: ['src/**/*.test.tsx','src/**/*.test.ts']`。步 6 落地 `src→renderer` 且 `test.include` 随 A3 改指 `renderer/**` 后，落在 `apps/desktop/src/` 的新测试**一条不跑且不报错**——正是 F3-0018→A3 消除过的静默面，位置在 F1 的 P2-1。

**处置**：发 **F3-0028（NOTE）**，请求一处措辞把 C-0047 §2 补齐为"所有 P2-x"，不动任何裁定语义；同时给 F1 两个等价选项（预改字面／改用 §14.13 勘误段的"开工首步实测"句式）。

**可复用规则（比这条更正更值钱）**：**排比列举的作用域以"范围句"为准，不以"更正句/执行句"为准**；两份句子彼此不闭合时，以量词更大的那条为准。根因是"每次扩围都重列一遍名单"⇒ 建议 FE 批文统一用全称量词（"所有 P2-x 批次"），把漏列从"必然风险"降为"需要刻意写错"。

**旁证（不请求动作）**：F1-0013 报头 `timestamp: 2026-09-24 09:00 +0800` 比本会话当前（09-23 02:44 +0800）晚约 30 小时。本件按内容采信、只登记异常（同类先例：F2-0011 报头笔误）。若台账按 timestamp 排序，该条会排进未来。

### 14.16 门 4 的机制源级确证 + 一条我自己差点漏掉的空断言陷阱（02:52）

本轮无新件（C-0049 后全队静默），把 §14.14/F3-0027 的"必办项"从**结论**升级为**可写代码的确证**，并顺此查出第八例空断言。

**(1) 交互包今天完全不认识"会话"这件事**：`grep -rn 'sessionId|selectedSession' extensions/agent-interactions/src` **零命中** ⇒ `InteractionPanel`（`view.tsx:50-52`）现在只做 `state.agent?.interactions ?? []`，**没有**任何会话维度。这不是障碍而是确认：过滤所需的两端**本来就在同一个对象里**——`AgentSnapshot`（`contract.ts:62`）同时含 `selectedSessionId?: string`（`:66`）与 `interactions: readonly AgentInteraction[]`（`:70`），而 `AgentWorkspaceSnapshot.agent?: AgentSnapshot`（`:105-111`）就是 `service.getSnapshot()` 的返回 ⇒ 一行 `(state.agent?.interactions ?? []).filter(item => item.sessionId === state.agent?.selectedSessionId)` **零新数据流、零新 prop、零契约改动**。访问路径先例＝兄弟包的 `conversation/view.tsx:101`（`agent?.selectedSessionId`）。

**(2) 与连接器语义一致，不需 F1 配合**：连接器**早已按会话作用域转移交互状态**——`agent-codex/src/client.ts:132` 只对 `item.sessionId === sessionId && item.turnId === id` 的 pending 条目落 `expired`，`:197/:201/:279` 也按 id 定点改；`agent-pi/src/client.ts:127` 断线时按 `sessionId` 把该会话的 pending/responding 全落 `unknown`。⇒ **"交互条目属于某会话"是契约与两侧实现共同承认的事实**，视图侧过滤是把已有事实显示出来，不是新语义 ⇒ **F3-0027 的"必办项"只是授权行问题，不是设计问题**（可与 F1 完全解耦）。

**(3) 唯一 UI 消费者确证**：全仓 `interactions` 的 UI 侧读取点**只有** `agent-interactions/src/view.tsx:52` 一处（其余命中全是 codex/pi 连接器的生产侧）⇒ 门 4 的修复是**单点**，不存在"改了面板忘了徽标"的第二落点。

**(4) 第八例：门 4 的夹具如果不设 `selectedSessionId`，三段断言会全绿而什么都没测**。关键在 `:66` 是**可选**字段：夹具若不写它，则 `item.sessionId === undefined` 恒 false ⇒ **过滤后永远零卡**，于是"B 会话零卡"通过、"切回 A 仍零卡"也通过，而"缺陷已修"从未被证明。这与 §14.9(2) 门 2（占位分支里本无 select）和 §14.10(2) 门 3（空区域本来就 inert）是**同一个病的第三个部位**，但前两处我当时是从**视图分支结构**推出来的，这一处是从**字段可选性**推出来的 ⇒ 方法论补一句：**凡断言形如"某集合变空"，先问"它是否本来就恒空"，并检查夹具是否显式提供使非空成立的那个输入**。⇒ 已就地给 §14.3 门 4 行加"三段式＋夹具必须显式设 `selectedSessionId`"，并同步 `reuse.md` 补记行二的夹具行。

**(5) 负面发现（无需动作）**：加过滤**不会**影响门 3——`shell.tsx:40` 的 `has[r] = entries(r).length > 0` 计的是**注册进该区域的视图条目数**（`InteractionPanel` 由 `entry.tsx:9` 以 `region:'right'`、`title:'Requests'` 注册），**不是卡片数** ⇒ 即使当前会话零交互，右栏仍"有内容"，不会因过滤而自动 inert。两门解耦成立。

**(6) 顺带修好自家报告的一处结构缺陷**：`grep` 全表查重发现 §14.2 有一条 bullet **整行重复两次**（"测试句柄两包不同"，01:22 那次自我更正写盘时被复制），已删重并复扫＝正文级重复行归零。根因＝当时用 python 追加时未检查锚点是否已含同句 ⇒ 与前两处"`**` 不闭合""§15 标题被吃"同属**自写工件的完整性**问题：这类缺陷不会导致错误结论，但会让"引用原文"变成"引用两份原文"。

### 14.17 夹具的**可达门槛三件套**与文件头要求（02:56；把 §14.13"实施零未知"这句真正补齐）

本轮无新件，改压测自己此前当成已知的两件事：①`mount(<Conversation service={sessions}/>)` 到底够不够；②新测试文件的运行环境要求。结果**补上两处真实未知**，并把上一轮的门 4 夹具要求一般化。

**(1) 对话视图有三道串联防占位分支，少一个门槛则整片线程不存在（门 1/门 2 的直接前提）。** `view.tsx:100-105` 实文：
- `:102` `if (!state.selectedConnectionId)` → `div.agent-placeholder` "Choose a connection"
- `:103` `if (!agent)` → 占位 "Connecting"
- `:104` `if (!sessionId)`（= `agent?.selectedSessionId`）→ 占位 "Choose a session"
- `:105` 三关全过才 `return <ConversationThread key={connectionId:sessionId} …/>`，而 `.agent-thread` 是 `:89` `ThreadPrimitive.Root`、**位于 `ConversationThread` 内部**

⇒ **结论（比 §14.9(2) 的门 2 专条更强）**：夹具必须同时满足**三个条件**才能让门 1／门 2 的断言对象存在——只设 `selectedConnectionId` 不够（还差 `agent` 快照与 `selectedSessionId`），只设两个也不够；任一缺失 ⇒ 视图渲染占位 `div`，此时"无 select""无 failed 徽标"**全部空转通过**。§14.16(4) 发现的"`selectedSessionId` 可选"正是**第三关**，上一轮我只报了那一关、未把三关凑齐 ⇒ 本轮补齐。⇒ 门 4/门 5 的卡本身在 `InteractionPanel` 里，**不受这三关影响**（该面板无占位分支，`:54` 空时渲染 "No requests need a response."），但仍需第三关作为过滤键。

**(2) `mount` 一行就够，测试侧不需要 runtime provider。** 决定性证据：`ConversationThread` **自己**在 `:78` 渲染 `<AssistantRuntimeProvider runtime={runtime}>`、`:98` 闭合（`runtime` 来自 `:71` `useExternalStoreRuntime`）⇒ §14.13 配方第 3 步 `mount(<Conversation service={sessions}/>)` **成立，无需在测试里包 provider、无需 mock assistant-ui**。这条排除了"要不要仿 `foundation.test.tsx` 引 `App`/`runtime`"的歧义。

**(3) 新测试文件的文件头是**承重的**，且两包要求不同档：**
- **两包共同必需**：首行 `// @vitest-environment jsdom`——`apps/desktop/vitest.config.ts` **没有全局 `environment`**（实读全文仅 `resolve.alias` 两行 + `test.include`）⇒ **不写这行则 `document` 未定义，测试在 import 阶段即红**；以及 `;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true`（先例 `agent-ui-probe.test.tsx:8`、`foundation.test.tsx:19`、`host.test.tsx:102`）。
- **`mount` 不是可 import 的工具**：三处先例各自内联 `createRoot(document.createElement('div'))` + `act(...)` + 本文件私有 `cleanup`/`afterEach`（`probe:13-14`、`foundation:20/:27`、`host:106`）⇒ **仓库没有任何导出的 mount 辅助**。⇒ F3 的新文件要自带这四件；**不要**为此往共用文件加东西（会把改动外溢到别人写域）。
- **探针那三件桩（`ResizeObserver`/`scrollTo`/`scrollIntoView`，`probe:9-11`）分档**：**交互包视图只 import `react` + 契约**（`agent-interactions/view.tsx:1-2`）⇒ 理论上不需要；**但对话包视图确实 import `@assistant-ui/react` 的 runtime 与 primitives**（`agent-conversation/view.tsx:2-3`，与探针同一批）⇒ 三件桩**按承重处理，照抄**。
- **诚实标注**：本树 `node_modules` 与 `apps/desktop/node_modules` **均不存在**（实测 `ls` 报 No such file），故**无法在此证明 assistant-ui 具体调用哪个 DOM API**；窗口纪律禁装依赖 ⇒ 结论停在"保守照抄"，并把"删掉不需要的桩"留给开工首步实测（属可选优化，不影响正确性）。

**(4) 与 §14.16 的关系**：§14.16 给的是"过滤键必须设"，本条给的是"断言对象必须先存在"。二者合成一条可执行开工序：**先凑齐三门槛证明 `.agent-thread` 在，再谈任何"不存在/为空"断言**；本条即 §14.4 那类坑的**根因版**，建议升为 FE 通用条款（F1 的 statusbar/`hasOpenRun` 断言、F2 的会话列表断言同样适用）。

### 14.18 【自己刚交付的稿件里的错】路 A 根本不成立 ⇒ 门 2 只有一条路，且**现状为红**（03:22；§14.18／F3-0032 是本节的前向引用落点）

**缘起**：本节是对 F3-0031 送出的 `reports/p2-2-batch-draft.md` 的**自我勘误**——那份稿子在 FC-0016 §5 明令"原文并入批文"的链路上，错了会直接被抄进批文。发件后我把稿里一处"看起来最不可能错"的断言拿去对源码，结果它错了两处。

**(1) 错处一：门 2 的 `setOption … resolve` 半句＝假件自证（空断言第九例，新亚种）**
- 原写法：夹具"`agent.options` 不含 model"**同时**直接 `await service.setOption('model', …)` 仍 resolve ⇒ 证明"只删 UI 通道、保留数据链"。
- 实读：`extensions/agent-sessions/src/model.ts:76` 是 `setOption: (id, value) => selected().setOption(id, value)` —— **纯透传**。那么 resolve 与否由谁决定？由 `selected()` 返回的那个 client。而 vitest 里那个 client 是**测试自己造的假件**（§14.16(1) 已确证 `model.ts:13` 整个 `agent` 切片逐字来自假 client）。⇒ **这半句断的是"我写的假函数会执行"**，真连接器语义下它反而**必红**：codex `client.ts:310-315` 对 `availability!=='supported'` 或值不在 `values` 内一律 `throw Error('Option unavailable')`；pi `client.ts:322-333` 同理抛 `'Pi option unavailable'`／`'Invalid Pi model'`。
- **为什么这条比前八条更值得记**：前八条都是"夹具恰好没给数据 ⇒ 断言空转"（弱断言）；这条是"**夹具给了数据，但数据来自我自己**"——它不空转、它会**通过**，因此连"跑绿了"这个信号都不携带任何外部信息。**判据升级**：断言链路上出现的每一个被调用对象，都要问一句"它是生产代码路径还是我造的桩"；桩自己答应自己的事，不算验证。

**(2) 错处二：路 A 是"不成立"，不是"尚未择定"**
- 路 A 的定义（§14.9(2)／§14.13(3)／§13 开工前置三）：靠 F1 的契约/适配器义务保证 `agent.options` **永不含** `model`，视图因此自然无 select。
- 实读两连接器：`extensions/agent-codex/src/client.ts:303-304` 发布 `{ id:'model', title:'Model for next turn', value: model.model, availability:'supported', values: this.models.map(...) }`；`extensions/agent-pi/src/client.ts:315` 在 `models.length` 时 push 同形选项。**两者都是 `availability:'supported'` 且带 `values`** ⇒ 正好满足 `conversation/view.tsx:85-88` 的渲染条件。
- **且这不是可改的疏漏而是契约设计**：`AgentSnapshot.options` 与 `AgentOption`（`packages/agent-ui-contracts/src/contract.ts` 的 `AgentSnapshot.options` / `setOption`）存在的目的**就是**承载 model 选择；把 model 从 options 里禁掉＝掏空该契约字段，且**直接违反本任务"禁止扩展/收缩 Profile、Provider、Model 配置面"的红线**（F1 无权、也不该接这个义务）。⇒ **我提出路 A 的当下它就不可行，而我把它作为"待 FC 择一"的正式选项送进了批文链路**。若 FC 择路 A，整个 P2-2 批次作废重来。
- **代价核算（为什么必须发件）**：路 A 的不可行性**只有读连接器才知道**，而 FC 侧没有理由去读——门 2 属 F3 写域，F3 是这条信息的唯一提供者。这不是"追加噪声"，是在 FC 落笔前撤回一个自己给的假选项。

**(3) 由此得到的新事实：门 2 现状为红 ⇒ 它是新行为，不是回归锁**
- `view.tsx:85-88` 对 `model` **没有任何专属抑制**（条件仅 `availability==='supported' && option.values?.length`），而真实快照今天**确实**含 supported 的 model ⇒ **对话区今天就会渲染 model 入口**。
- 与门 5 对照登记：门 5 的"终态条目留在数组/卡转终态内联行"是**已成立**（回归验证，§14.6）；门 2 是**未成立**（需改码）。⇒ **批文里两门的性质必须分别写**，不得统一表述为"验证既有行为"。
- 实施后果：若实施者按"回归锁"心智写门 2，首跑必红，容易误判为"我把别的东西改坏了"而回退自己的正确改动。**故本条要作为批文注记随门 2 一起贴出**。

**(4) 修订后的门 2 终口径（一条，无择路）**
- 断言：~~先证 `.agent-conversation .agent-thread` 存在（§14.17 三关），再断该容器内 `querySelectorAll('select')` 长度为 0。~~ **⚠ 03:57 本句作废，见 §14.20／F3-0034：`view.tsx:85` 的 options 条与 `:89` 的 `.agent-thread` 是兄弟、其子树内永无 `select` ⇒ "该容器内长度为 0"恒绿。终口径改为三条断言（`section.agent-conversation` 作用域下 select 数 == 1 ＋ 存活 label 文案 == 非 model 探针选项 title ＋ `AgentSnapshot.options` 仍含 model（数据侧）），`.agent-thread` 只作存在性前置。**
- 改动：**必须**在 `conversation/view.tsx:85-88` 增列按 `option.id` 的过滤（视图侧硬抑制）⇒ P2-2 精确路径**须把 `:85-88` 作为必列项**，不再是"仅当采路 B"。
- 保留：数据链不受影响的证明**不再靠 `setOption` 调用**，改由"`AgentSnapshot.options` 仍含 model（断快照字段）而 DOM 无 select（断视图抑制）"两条独立断言承担——前者断数据、后者断 UI，二者不互相证实为桩。
- 归 F1 的部分：无（原"归 F1 的契约义务"随路 A 一并撤回）。

**(5) 本轮已就地更正的位置**：§14.3 门 2 行（FC 抄的正是此行，两处）、§13 五门替换项行、§13 开工前置三 ③、§14.9(2) 末、§14.9(3) 行段核算、§14.13(3)；§10.4 门 2 行**不改**（该表已有"请勿抄本表"总警告，§14.3 为唯一有效值）；`p2-2-batch-draft.md` §2.4／§2.6／§4／§7 已在上一轮改毕。**开工前置的择一余项从 4 条降为 3 条**（门 4 增列、门 1 拆分、门 5 甲/乙），门 2 从"择路"变"必列授权"。**〔⚠ 03:43 更正：其中"门 1 拆分"一项的前提已被 §14.19 推翻 ⇒ 条数仍是 3，但 ② 的内容换行号，勿照旧抄。〕**

### 14.19 【门 1 的第二次更正】〔**前向指针：本节的 1b 已被 §14.24 于 05:14 整体撤回，本节仅 (a)(b)(d) 与"1a 零授权"仍有效；旧文按 §14.7 管辖条不删**〕门 1 的四条断言**现状即全绿**，而它声称要锁的新行为**没有断言守着**；真正可达的缺陷在下一行 `:54`（03:43；§14.3 门 1 行与 §13 开工前置三 ② 是本节的前向引用落点）

> 方法：把 §14.18 抓住门 2 的那把尺子——"结论是不是穿过一个生产里不存在的东西成立"——**逐门重跑**，本轮门 1。纯源码实读，零依赖、零构建、零测试。

**(1) 断言与授权改动不同轴**
- §14.3 门 1 的四条断言全部读 **run 级/连接级**句柄：(a) `view.tsx:80` 的 `data-status`、(b) `:83` 的文案、(c) 不存在 `[data-status=failed]`、(d) `[role=alert]` 文案 ⇒ 数据源是 `:69-70` 取的 `runs` 与 `:81` 的 `connection.status`。
- 而 §13 开工前置三 ② 请 FC 批的改动是"拆 `:53` 的 `failed\|\|unknown` 合并支"，那是 **message 级**（`convertMessage` 的 `:51-54` 链）。⇒ **该改动没有门 1 的任何一条断言覆盖**。
- 反向也成立：夹具只要设 `run.status='unknown'` ＋断连，**四条断言对未改动的现码就会通过**（`:80` 逐字取 `run.status`；`:83` 条件正是 `run?.status === 'unknown'`；`:81` 条件正是 `connection.status !== 'connected'`；(c) 的 `data-status=failed` 从未被任何句柄写出过）。
- ⇒ **门 1 现状＝回归锁，不是新行为验证**。这正是 §14.18(3) 我给门 2 下的判定的镜像——我当时已写"门 1 已是既真 ⇒ 回归验证"，方向对，**但随后仍在 §13 ② 把它当需要授权的新行为提出**＝同源不一致，本轮修。

**(2) 更硬的后果：`:53` 的 `unknown` 支在生产数据下不可达**
- 消息级 `status` 只由两个连接器的投影路径产生，值域有限：codex `client.ts:34` 只产 `completed\|failed\|running`；pi `client.ts:36` 只产 `cancelled\|failed\|completed\|undefined`。
- 全仓 `'unknown'` 的**生产者**只落在三类字段：`runs[].status`（codex `:102`、`:256`；pi `:123`、`:196`、`:281`、`:289`）、`interactions[].state`（codex `:104`；pi `:127`、`:307`）、`sessionList`（codex `:25`；pi `:12`）。**没有一处写 `message.status = 'unknown'`。**
- ⇒ "拆 `:53` 让用户看到 unknown 与 failed 的差别"这个批文理由是**假的**：拆了没有任何可见变化。照此批文增列，会得到"改动＋测试双绿、产品零变化"的**空转批**。

**(3) 本节实际产出：真正生产可达、且今天在屏幕上自相矛盾的缺陷在 `:54` 末支**
- pi `client.ts:36` 的三元链在 `stopReason` **未映射或缺失**时把 `status: undefined` 写进消息；`AgentMessage.status` 是**可选**字段（符号锚定 `AgentMessage.status?`，@85cc3cd 行号 `:43` 仅作证据，见 §14.7）⇒ 该写法合法。
- `view.tsx:51-54`：`undefined` 不匹配 `:51`（三个进行中态）、不匹配 `:52`（`cancelled`）、不匹配 `:53`（`failed\|\|unknown`）⇒ **落进 `:54` 末支 `{ type:'complete', reason:'stop' }`**。
- 而 pi **明确预料**这种缺失：`client.ts:185-196` 注释与分支——"`agent_settled` only proves the run ended… A requested stop never verdicts: without a confirmation it stays unknown"；其 `else` 分支要求 `facts.reason` 为**假值**，并在 `run?.status === 'stop-requested'` 时给出 diagnostic "Stop was requested; the run ended, but its outcome was never confirmed"，随后 `status = 'unknown'` 只交给 `this.updateRun(...)`（**给 run，不给消息**）。
- ⇒ **同屏矛盾**：该会话**最后一条 assistant 气泡显示"正常完成"**（`:54`），同时 run 徽标 `:80` 显示 `unknown`、`:83` 显示"结果未知"。**这才是门 1 本该抓的东西。**
- **诚实的反驳（必须写进批文，否则修复会误伤）**：中间态消息（如 `stopReason = 'toolUse'`）渲染 `complete` 是**正确**的——那条消息本身确实流完了，运行进度由 `runs` 承担。⇒ 修复面**只能限定"该会话最后一条 assistant 消息"**，不能把 `undefined` 一律降级；`view.tsx:69-70` 已有"取最后一条 run"的先例，但 message 侧目前**没有**"我是不是最后一条"的判据（`convertMessage` 是逐条调用，无 index/length 上下文）。
- **归属**：改动落在 `:54` 与 `:48-56` 的调用点，两处**都不在预签 `10-40` 内**；属 F3 自家对话包，**不需 F1、不需契约变更**。

**(4) 顺带查出：`:83` 的文案把"未确认收尾"也说成"断连"**
- `:83` 的条件只看 `run?.status === 'unknown'`，与连接状态**无关**；而 `unknown` 有两个生产者：断连（codex `:100-102`、pi `:121-127`）**和**未确认收尾（pi `:185-196`）。
- ⇒ 未断连时也会显示 `Run outcome unknown after disconnect.`＝**假因归因**。缓解：`:84` 同屏渲染 `agent.diagnostic`，那里才是准确文案。
- **对门 1 的直接影响**：断言 (b) 把这个字符串钉进验收 ⇒ 将来修文案必红。建议 (b) 改断 class/`data-*` 句柄、不断字面串，或明确登记"该串本身待改"。

**(5) 给 FC 的可贴口径：门 1 拆成两半**
- **门 1a（回归锁；批文措辞＝"验证既有行为"）**＝现 §14.3 门 1 的 (a)(c)(d) ＋ (b) 放宽为句柄断言 ⇒ **零新授权，可立即实施**。
- **门 1b（新行为；需增列行号）**＝目标是 `:54` 的"结果未确认的运行不得显示为完成"，**不是** `:53`；批文须增列 `conversation/view.tsx:54` 与 `:48-56` 调用点；夹具须**故意**造"最后一条 assistant 消息 `status` 缺如 ＋ `runs[].status='unknown'`"。
- **`:53` 拆分从批文撤下**；若 FC 仍要保留，只能写成"防御性/契约完整性"，**不得**写成用户可见修复。

**(6) 方法论（与前九例并列，但不是同一个病）**
- 前九例都在问"夹具给的数据真不真"；本例的数据是**真的**、断言也**真的通过**，问题是**断言与要授权的那处 diff 不在同一字段层级**。
- ⇒ 新判据两条：**每条断言都要问它守的是哪一处 diff；每处待授权 diff 都要问哪条断言守它。** 两问有一问答不上，这一门就是空转批。
- 附带的可达性判据：**批"改视图分支"之前，先回源列出该分支的输入值在生产里的全部生产者**；生产者为空 ⇒ 该改动不是修复，是装饰。

**(7) 本轮更正站点**：§14.3 门 1 行（FC 抄的正是此行）、§13 开工前置三 ②、§13 五门替换项的门 1 部分、`p2-2-batch-draft.md` 门 1 相关、`reuse.md` 夹具行、`status.md`。**已发 outbox 不回改**（§14.7 管辖范围三条）⇒ 另发 **F3-0033**。开工前置**条数仍为 3，但 ② 的行号从 `:53` 换成 `:54`＋`:48-56`**。

### 14.20 【门 2 的第二次更正】我上一轮写的"终口径"把 select 数断在了**不含 select 的那个容器**里 ⇒ 现状**恒绿**；另查出权威行里一处**伪等价**会造成假红（03:57；§14.3 门 2 行、§14.18(4)、`p2-2-batch-draft.md` §4 门 2 行是本节落点）

> 方法：仍是 §14.18 那把尺子跑门 2 的后半问句——**"待授权的那处 diff，产物落在断言容器的子树里吗？"** 本轮第一次把 `ConversationThread` 的 JSX 整体结构（`:78-99`）逐行读完，此前我只引用过行号、没核过**层级**。

**(1) 结构性事实（决定本门一切断言）**
- `:85` `{agent.options.length > 0 && <div className="agent-options">…}` 与 `:89` `<ThreadPrimitive.Root className="agent-thread">` 是**同一个 `<section className="agent-panel agent-conversation">`（`:78`）下的兄弟节点**，options 条在前、thread 在后。
- `.agent-thread` 子树里只有 `ThreadPrimitive.Viewport` → `ThreadPrimitive.Messages`（`ChatMessage`＝`<details>`/`<pre>`/文本）与 `.agent-compose`（`ComposerPrimitive.Input`/`Send` ＋ 一个 `button`）⇒ **全树没有任何 `select`**。
- ⇒ **"`.agent-thread` 内 `select` 数＝0" 在现码与加了 `:86` 过滤之后都恒真**＝**空断言**（门 2 版本的同一个病）。
- 而我 §14.18(4) 与可贴稿 §4 门 2 行的字面是"先断 `.agent-conversation .agent-thread` 存在，再断**该容器内** `select` 长度为 0"——"该容器"最近先行词正是 `.agent-thread` ⇒ **照我写的抄，门 2 现在就是绿的，且加了过滤后还是绿的，什么也测不出来**。

**(2) 顺带查出：`section.agent-conversation` 作用域**本身是对的，但那半句"等价断言 `.agent-options` 为 null"是**伪等价 ⇒ 会假红**
- `:85` 的外层门是 `agent.options.length > 0`，`:86` 的内层 `.filter(option => option.availability === 'supported' && option.values?.length)` 只决定**里面 map 出几个 label/select**。
- ⇒ 若按批文在 `:86` 那条链上追加"按 `option.id` 排除 model"，则 `agent.options` 仍非空 ⇒ **`.agent-options` 这个 div 照样渲染（空壳）** ⇒ 断 `为 null` 必红，而产品行为其实已正确。
- 只有一种落点才让两者等价：把过滤提到 `:85` 的外层条件（使 div 整体不出现）。**批文没有指定落点 ⇒ 不得写"等价"，只能钉 select 计数。**（这也是"改动落点未定 ⇒ 断言强度未定"的一个具体后果。）

**(3) 真正抗空转的写法：加一条**阳性对照**（本节的正面产出，建议进门 2 终口径）**
- 夹具同时放**两个** supported＋带 `values` 的选项：`model` 与一个非 model 的 `probe`（视图 `:86-87` 会把每个选项渲成 `<label>{title}<select>…</select></label>`）。
- 三条断言一起才成立：①`.agent-conversation` 下 `select` 数 **== 1**（不是 0）；②存活的那个 `select` 的 `<label>` 文案 == `probe` 的 `title`（证明"少掉的是 model"，而非"整条没渲染"）；③`AgentSnapshot.options` 仍含 `model`（**数据侧断言，不是 DOM**——门 2 成立的形态恰恰是 model 的 label **不**出现在 DOM 里，断 DOM 反而必红）。
- ⇒ 有了 ①②，"抑制"与"缺席"可区分，(1) 的空转与 (2) 的假红**同时被排除**；作用域一律写 **`section.agent-conversation`**，`.agent-thread` 只用作**存在性前置**（证已过 `:102-104` 三关），**绝不用作 select 的作用域**。

**(4) 对已发结论的影响（逐条标明，不整节作废）**
- §14.18(1) 假件自证、(2) 路 A 不成立、(3) "门 2 现状为红"——**前两条不变**；第三条须限定：**"现状为红"只在 `section.agent-conversation` 作用域下成立；在 `.agent-thread` 作用域下现状为绿**（＝(1)）。批文若写"新行为/现状红"，同一句里必须把作用域写死，否则红绿无从判定。
- §14.9(2) 的"先断 `.agent-thread` 存在"**仍然有效**（它是可达性前置，不是 select 作用域）——本轮没有推翻它，只是禁止把它当计数容器。
- §14.3 门 2 行的作用域 `section.agent-conversation` 一直是对的 ⇒ **本轮受损的是我自己"终口径"那两句复述**（§14.18(4) 与可贴稿 §4 行），不是初版。

**(5) 目录与判据**
- 空断言目录回补序号：**第十例＝§14.19（断言与授权 diff 不同轴）**；**第十一例＝本节（断言容器不真正包含被改元素——"作用域写窄了"与"作用域写宽了"是同族的两个方向）**。另登记一个**新类别：伪等价断言**（"A 为 null" 与 "A 内计数为 0" 在元素仍渲染成空壳时不等价），后果方向是**假红**，与前十一例的假绿方向相反 ⇒ 判据补一句：**写"等价"之前，先举出一个使两者真值不同的渲染场景。**
- 通用判据（可直接给全队）：**测"某元素不出现"时，必须在同一容器内同时断言"另一个应当出现的元素确实出现"**；否则容器选错、夹具没数据、整条没渲染三种情况全部表现为绿。

**(6) 本轮已更正站点**：`p2-2-batch-draft.md` §4 门 2 行（FC 要贴的那份，最危险）、§14.18(4) 复述句、§14.3 门 2 行的"等价"半句、`reuse.md` 夹具行补作用域与阳性对照判据、`status.md`。**已发件不回改**（F3-0032 §36 的"该容器内"按此读为 `.agent-conversation`，§14.7 管辖三条）⇒ 另发 **F3-0034**。

### 14.21 【门 5 的更正：乙案撤回】把"可达性判据"用到**门本身要防的事**上 ⇒ 查出乙案防的缺陷在生产里不可能发生，且它根本不在 C-0026 §6 门 5 的门义内（04:16；本轮第一次逐行读 `agent-interactions/src/view.tsx` 全文＋两个连接器的 `respond`）

> 触发方式：§14.19/§14.20 连抓两门后，把同一把尺子对准**我自己在 §14.14 提出、并请 FC 择一的门 5 乙案**。这一次问的不是"断言守哪处 diff"，而是"**乙案要防的那件事，生产里发生得出来吗？**"

**(1) 决定性事实：重复提交在连接器层已被同步挡掉，视图层无竞态可防**
- codex `client.ts:258-281`：`:261` 卫句 `if (!route || !interaction || route.used || interaction.state !== 'pending') throw`→ `:264-277` 全段**同步**（组 `result`，无 await）→ **`:278 route.used = true`** → `:279` publish `state:'responding'` → **`:280` 才出现第一个 `await`**。
- pi `client.ts:291-307`：同形——卫句 `:294` → `:301 route.used = true` → `:302` publish `responding` → `:303` 才 `await this.request(...)`。
- ⇒ 两次点击（同 tick 或相邻 tick）**第二次必 throw**，因为 `used` 在让出事件循环之前已置真 ⇒ **不存在双发的窗口**。`respond` 在 service 层是纯转发（`agent-sessions/src/model.ts:75 respond: (id, answer) => selected().respond(id, answer)`），不引入额外 await。
- **另注**：门 4 的过滤键顺带过了同一道判据——契约 `AgentInteraction.sessionId`（符号锚定，见 §14.7）是**必填非可选**，且 codex `:174` `if (!sessionId) { diagnostic; return }`、pi `:119` `if (!sessionId || !event) { diagnostic; return }` 都把空值挡在构造之前 ⇒ **`:52` 加 sessionId 过滤不会像"字段恒 undefined"那样把面板清空**。这一条我原本预判是缺陷，实测为**干净**，照实记"已查且通过"，以免下一个人重查。

**(2) 但乙案还有第二重问题：它不在门 5 的门义里（范围漂移，且漂移是我造成的）**
- C-0026 §6 门 5 的原文义＝**"不自动重发未确认提交"**（＝不做自动重试），§14.3 门 5 行第一版写的正是这个。
- 而乙案＝"在 `view.tsx:19-21` 加在途门控防**用户重复点击**"——**这是另一件事**，且是我在 §14.14 推导"门 5 可假版现为红"时把两者混为一谈后提出的。⇒ 根因不是 FC 择一难，是**我把自己的范围扩展项混进了待裁清单**。

**(3) 用假件永远证不出被下移的保证（第九例"桩自证"的第三实例，形态不同）**
- 五门夹具的 `agent` 切片逐字来自**假 client**（§14.13 决定性证据 `model.ts:13`）⇒ 上一节那个 `route.used` 卫句**不在测试路径里**。
- ⇒ 若照乙案实施并测"点两次只发一次"，绿/红**只由视图自己新加的 flag 决定**，与被声称要保障的生产行为无关；批文若把它写成"防止重复提交"就是**把桩当保证**。
- **对照之下甲案不作废**：甲案的两条（①卡转终态行不消失、②`respond` 调用计数不增）**被测对象确实是生产代码**（视图的重试路径与渲染分支），假件只是被调用方 ⇒ 属正当的视图侧回归锁，**不是桩自证**。这条区分要写清，免得连坐。

**(4) 处置：乙案撤回，门 5 不再需要 FC 择一**
- 门 5 取**甲案**＝字面回归锁（视图侧两半现码已成立；生产者侧"终态条目留在数组"本轮另在 `codex:132/:279`、`pi:127/:302-307` 确证——四者一律 `.map` **原位替换**、不移除条目）。
- 台账如实记：重复提交防护**由两连接器在 `respond` 内同步保证、位置在 FE 五门夹具之外**⇒ 门 5 **不声称覆盖它**，也**不因"未覆盖"而判红**。
- 若 FC/C 仍想处理"连点两次会弹一条 `role=alert` 的 `Interaction no longer pending`"（这是 (1) 的**真实**后果，属呈现瑕疵而非数据瑕疵），那是**另一批的独立小项**，需要 `interactions/view.tsx:19-21` 授权＋自家写域，F3 不夹带进门 5、本轮也不主张开工。
- ⇒ **开工前置三里的"门 5 甲／乙择一"这一项消失**：门 4 的 `interactions/view.tsx:52` 增列照旧待批，门 5 已无待裁项。前置条数仍 3，但第 3 条的待裁面**变窄**。

**(5) 判据更新（把可达性判据补全）**
- 原句＝"批'改视图分支'前先列出该分支输入值在生产里的全部生产者，生产者空⇒是装饰"。**本轮补第二问**：**"这件事是否已被更下层保证？"**——生产者非空也可能无缺陷（下层已挡）。⇒ 完整判据三条：**①有生产者吗 ②有下层保证吗 ③被测对象是生产代码还是我自己造的桩**。
- 配套一条**范围自省条**：待裁清单里每一项都要回得到**上游原文**（本例＝C-0026 §6）；对不上原文的，先撤下再提，不要请别人替我的范围扩展背书。

**(6) 本轮已更正站点**〔⚠ **04:28 自我更正：本清单当时由记忆生成，只覆盖 5 处；grep 全账后补出另外 6 处**，补全后的完整清单见下，规则见 §15 本轮第 13 例〕：①§14.3 门 5 行（就地标注甲案＋乙案撤回）、②§13"开工前置三"门 5 子句、③§13 替换项行（`:238`，`:52`/`:19-21` 那句缩窄为只剩 `:52`）、④本报告 **§14.14 两条正文**（`:462` 连点结论、`:463` 甲／乙择一）、⑤`p2-2-batch-draft.md` §2.3b／§2.5／§2.6／§4 门 5 行／§7 未决项／**3.5 行段清单**、⑥`reuse.md` **两行**（夹具行 + 缺陷行的四处栏位：`:19-21` 前提、"字面版是空断言"、"两案已交 FC/C 择一"、"若判乙超原意"）、⑦`status.md` 两处（phase 尾条 + **wake_mechanism 引用 §14.14 的那半句**）。已发 outbox 不回改 ⇒ 另发 **F3-0035**（F3-0034 报头句"门 5 甲／乙"仍在，以 F3-0035 为准）。


### 14.22 【门 4 的三问核毕】把 §14.21 的判据用到**唯一剩下的那条"改码"前置**上 ⇒ 结论＝维持请求，但证据等级从"F3 实读推定"升为"**仓内既有绿灯测试背书**"（04:36；本轮第一次用 grep 而非记忆来列"读取点"清单）

**(1) 三问逐问**
- **Q1 有生产者吗**——有。交互条目由 codex `client.ts:192`/`:196-197` 与 pi `client.ts:234` 追加进 `snapshot.interactions`，且 `sessionId` 取自真实请求（pi 侧条目 id 形如 `A:r1`，见其测试 `:267`）。
- **Q2 这件事是否已被更下层保证**——**没有，而且这次的否证来自一条已经在跑的仓内测试**：`apps/desktop/src/agent-pi.test.ts:281` 明确断 `interactions` **长度为 3**，而此时其中**两条已应答**（`:270` confirm/choice 已发出、`:275`）、**一条已过期**（`:278` `extension_ui_expired`）⇒ "终态条目留在数组"不是我的推导，是**被测试锁定的既有行为**。同文件 `:265` 那条 `toHaveLength(0)` 断的是**实例作用域**（带 `'other-instance'` 参数的请求不入账），**不是会话作用域** ⇒ 谁把它当"切会话会清空"的先例，就是拿另一维度的保证冒名。
- **Q3 被测对象是生产码还是我造的桩**——生产码。本轮按第 13 例的新规则**用 grep 复列**读取点：`grep -rn "\.interactions" apps extensions packages` 的全部命中＝两个连接器自家、若干 `apps/desktop/src/*.test.ts`、`extensions/agent-interactions/src/view.tsx:52`（唯一生产读取）、`entry.tsx:9`（只是注册视图、不读卡）。⇒ 全仓无第二落点，`:52` 一处过滤即覆盖显示面。

**(2) 会话切换为什么不会清理（逐行实读，不以推断代替）**
- codex `openSession` `:234-239`：`thread/resume` → `history()` → `applySelectedOptions()` → `publish({ selectedSessionId })`，**全程不碰 `interactions`**。
- pi `openSession` `:272` → `opened()`：`:262` 只发布 `selectedSessionId` ＋该会话 `messages`；`:261` 删的是 `runFacts`/`activeMessages`，**与交互数组无关**。
- 会改交互条目**状态**的只有 codex `:104`（由 `:99-104` 的**进程退出/协议错误**触发）与 pi `:127`（`transport_exit`），二者都只把 `pending`/`responding` 改标 `unknown` ⇒ **条目留下、只是换标、视图照旧渲染**（`view.tsx:24-25` 无条件渲染）。

**(3) 对断言写法的直接影响（把门 4 从"能写"提到"写到最强"）**
- **A 会话那张卡必须放终态**（`resolved` 或 `expired`），不要只放 `pending`：pending 卡可能被状态扫描改标后让人误以为"消失＝过滤生效"，终态卡由 `:281` 类测试证明**不会**被下层移除 ⇒ 此时"B 下零卡"若绿，唯一解释就是 `:52` 的 sessionId 过滤起了作用。
- **阳性对照同容器**：切到 B 后 B 自己的一张卡必须在场（容器 `section.agent-interactions`），否则"B 零卡"是空夹具（§14.16 第八例同源）；`selectedSessionId` 是**可选**字段 ⇒ 夹具不设它则过滤后恒空，三段全绿而什么都没测（这条本行早已写，本轮复核仍成立，与 Q1 里 `AgentInteraction.sessionId` **必填**不冲突——两个字段不同名不同约束）。

**(4) 结论、影响面与不扩范围的边界**
- **门 4 维持原请求**：`interactions/view.tsx:52` 的增列仍是 P2-2 唯一"改码"授权（门 1b／门 2 是对话包内的断言与过滤）。给 FC 的增量不是条数而是**证据等级**——若 FC 之前对"是否真有跨会话串卡"存疑，现在可以引一条已跑绿的测试而不是引我的实读。
- 顺带登记但**不请求授权、不改码**：数组只增不减 ⇒ 跨会话长期累积属**数据侧**问题（F1／连接器写域），与门 5 "终态保留"半边同源；本轮只把它作为"为什么必须由视图侧过滤"的依据，不代改。

### 14.23 【全队时钟完整性】把"审计工具本身也要验"用到**收件所依赖的那把尺子**上 ⇒ 查出报头时间不可用于排序（11 件前向落款最多 +31.6h、74 件无该字段），并纠出我自己"把自家 11 字段惯例当全队规约"的倾向（04:51；应 C-0049 之后的待裁空档做的一次横向自查）

**（1）动机与判据**：我的整套节奏建立在"谁在谁之后"上——F3-0015 的起因就是 FC-0016 的"原文并入"命令早于我的勘误落盘 76 秒。此前我从未核过**用来判先后的两个时钟各自是否可信**：①报头 `timestamp`；②文件 mtime。这正是"审计工具本身也要验"一族的第 8 例。

**（2）实量（脚本产出，非估算；样本＝`agents/*/outbox/*.md` 去 README 共 179 件）**
- 有可解析 timestamp：101 件｜无该字段：74 件（C 49、H 7、F0 6、BC 5、E 4、S 3）｜有日期无时刻：4 件（全是我自己的早期件 F3-0001..0004）。
- **报头晚于落盘 >1h（前向落款）＝11 件，只出现在 FC 与 F1 两家，且无一例反向**：F1-0008..0013 前向 25.1–31.6h；FC-0011/0012 前向 24.3h；FC-0008/0009/0010 前向 1.2–1.4h。
- **无第二时钟可对照**：这些件在 control 仓库内未提交（`git log -- <件>` 空）⇒ mtime 是唯一旁证，而它只支持"内容不晚于 mtime"这一方向的推断。

**（3）关键路径落点（为什么不是卫生问题）**：`FC-0012` 正是 §13 那条"FE-PREP 复活批文＝FC-0012+A1+A2+A3"的四件之一。按报头它排在 C-0034…C-0049 与 A1/A2/A3 **之后**；按落盘它写于 00:38，**早于**全部这些裁决（A1＝C-0036@01:27、A2＝C-0037、A3＝C-0042、乙案＝C-0046/0047、坐标更正＝C-0049）。⇒ 由报头推断"FC-0012 已含最新裁决"会直接漏掉 A2/A3 的三处 `vitest.config.ts` 授权与 `renderer/` 坐标。F1-0013（ACK FC-0016 §4）同理会被排到 C 的裁决之后。

**（4）我差点造出的新缺陷（第 18 例，自纠）**：我此前一直按"信件有 11 个报头字段"的标准核自己的件，本轮**几乎据此发件请求 C/BC"补齐 timestamp"**。回读 `COORDINATION.md:10` 才确认规约只要求 `base_sha／contract_version／owner_generation、事实与证据路径、请求动作`——**没有规定 timestamp** ⇒ 那 74 件不是违规。⇒ 规则：**"他人不合规"这种断言在落笔前必须回到规约原文（不是我自己的工件）；引用自己的惯例冒充全队标准，是"把推导当实测"的报头版**。F3-0024（归因句）是同族。

**（5）可复用结论（已发 F3-0037，NOTE→FC）**：①**排序只用件号序列，不用时间词**（"早前／已含／在后"一律改写成"X 之后另有 Y"这种件号关系）；②需要时刻时写"落盘 mtime＝…"，并注明 mtime 只给下限；③我自己的收件水位今后**落盘**在 `status.md`（写本轮实测的 `find -newermt` 锚点），不再凭记忆选时间——这是第 13 例"清单由 grep 而非记忆生成"在收件动作上的对应形态。

**（6）不扩范围的边界**：本件不请求任何人改历史件、不请求新增字段标准、不请求 C 出规约更正（若要统一格式属 C 的规约权，我只登记事实）；对 FC 的唯一请求是第（5）条那种措辞级写法。零新授权请求。

### 14.24 【门 1 的第三次也是最后一次更正：**1b 整体撤回、本门归零授权**——因为我要求授权的行段，装不下我自己要求的修复】（05:13；触发＝本轮首次把批文里将被逐字抄入的三条精确路径**一次读完核**）

**(1) 前两条通过、第三条出局**：
- 门 4 `interactions/view.tsx:52` ＝ `const items = state.agent?.interactions ?? []` **逐字命中**；且 `:54` 直接消费 `items` ⇒ 在 `:52` 加 `.filter(...)` 即全链生效。✅
- 门 2 `conversation/view.tsx:85-88` ✅（上一轮已实读 JSX 层级并定容器）。
- 门 1b `conversation/view.tsx:54`＋`:48-56` ❌ **一处算术错＋一处结构错**。

**(2) 算术错**：`convertMessage` 实占 **`:42-55`**（`:42` 是签名、`:55` 是收尾花括号），status 四支在 **`:51-54`**。我请求的 `:48-56` 一头含进 `:48`（tool `result` 行，与本缺陷无关），另一头**越出函数、含进 `:56` 的 `function TextPart()`——一个不相邻的组件**。⇒ 照旧抄＝给我自己划进一段与门 1 无关的写域；这正是我全程在防的"超范围"，这次写进请求的人是 F3 本人。

**(3) 结构错（更致命）**：`convertMessage` 是**模块级导出函数、签名只接 `message: AgentMessage`**，全仓唯一生产调用点＝`:71` 把它交给 `useExternalStoreRuntime`。⇒ 它**在参数与闭包两处都拿不到"是否本会话最后一条 assistant 消息"**。而我给 1b 写的诚实边界恰恰是"修复面须限定最后一条 assistant 消息（中间态 `toolUse` 渲染 complete 是对的）"。**该边界在 `:51-54` 内不可实现**——必须改 `:71`（用 message 列表包闭包或预映射）或改消息构造。**⇒ 请求授权的行段，容不下要求的修复；这类错只有在开工后才会撞上，届时即成"未授权行段前止步"。**

**(4) 改判＝1b 整体撤回，门 1 归零授权**，两层独立理由：
- **范围层**：C-0026 §6 门 1 原文只有 **unknown ≠ failed**，它在**运行/徽标层已成立**（门 1 现有四条断言对现码即绿＝正当回归锁，§14.19 已定）。"未确认收尾的最后一条气泡显示 complete"是 **F3 自己调研出的新缺陷，不属门 1 原文义务**——按我在 F3-0035 立的规则（**待裁项须回得上游原文，否则自撤而不请他人背书我的扩范围**），1b 本就不该进 P2-2。
- **可行性层**：如上，它需要一次跨 `:71` 的设计改动（可能触到 F1 的消息装配面），不是一行过滤。
- ⇒ **净效果＝FC 待裁授权 3 条 → 2 条**（门 4 `:52`、门 2 `:85-88`），P2-2 少一个不可实施行段。

**(5) 本轮唯一的复用增量（正向）**：`apps/desktop/src/agent-ui-probe.test.tsx:55-61` 的 `it('preserves complete, cancelled and error as distinct library statuses')` 是**全仓第一条"直接调用 converter、表驱动断 `.status`"** 的先例，比挂载视图更省且更贴门 1 语义。**但只能作方法学复用、不可作代码复用**：probe 被测的是 `examples/agent-ui-probe/src/view.tsx:14-17`，判的是 **`message.state`**（`running`/`cancelled`/`error`/`done`），生产 `convertMessage` 判的是 **`message.status?: RunStatus`**（7 值）。⇒ **若照抄该测试形状、只把 import 换成生产包而不改字段名，`status` 恒 `undefined` ⇒ 四支全落 `:54` complete ⇒ 表驱动断言"全绿"而一次真实映射都没发生**。记为**第 21 例：跨夹具复用测试形状时，字段名本身属于被测面**。

**(6) 新挂条目（明确不请求 P2-2 授权）**：`[F3-NEW-1]` 未确认收尾运行的最后一条 assistant 气泡渲染为 complete（`view.tsx:51-54` 末支对 `status===undefined` 的兜底）。修法需消息列表上下文 ⇒ 属设计改动，候 C/FC 立后续专批并定归属（F3 视图侧包一层 or F1 装配侧给出末条标记）。

**(7) 本轮更正站点**：§14.3 门 1 行、§13"开工前置三"标题与 ②、§14.19 末（追加"其 1b 已被 §14.24 撤回"的前向指针，不删原文）、`p2-2-batch-draft.md` §2 标题／§2.3／§2.3b／§3.5 行段清单／§4 门 1 行／§7③、`reuse.md` 夹具行、`status.md` 多处。已发 outbox 不回改 ⇒ 另发 **F3-0038**。


### 14.25 【第十三次五门勘误：门 3 行的选择器在生产坐标上永不命中，而它十二轮没被发现的原因正是"每轮只重读当轮在裁的那一扇门"】（08:41；F3-0039）

**缘起**：FC-0017 §P2-2 把 `p2-2-batch-draft.md` 全文采认为 P2-2 范围，C-0051 §4 又命 FC"按 F3-0032／F3-0033／F3-0026 勘误后的 §14.3＋可贴文本为准，勿用被撤回的旧表述"。⇒ §14.3 的每一行都成了**将被逐字复制进批文**的源头。为核"采认是否走样"，本轮第一次不按裁定焦点、而按**整表逐行**重读五门表——门 3 行当场出局。这是十三轮里第一次重读门 3。

**(1) 事实（本轮实读四处，全部 @85cc3cd）**

| 位置 | 实文（摘要） | 后果 |
| --- | --- | --- |
| `extensions/agent-conversation/src/entry.tsx:11` | addView 把 `agent.conversation` 注册为 `region: 'main'`，组件 `Conversation` | `.agent-conversation` 在**主区** |
| `extensions/agent-interactions/src/entry.tsx:9-10` | addView 把 `agent.interactions`（title `Requests`）注册为 `region: 'right'`，组件 `InteractionPanel` | 右区唯一产品视图是 `.agent-interactions` |
| `extensions/workbench/src/shell.tsx:40` 与 `:75` | `has[r] = entries(r).length > 0`；非 main 区在"无视图或已收起"时带 `inert` | §14.10(3) 的"空区本来就 inert"**仍成立** |
| `apps/desktop/src/foundation.test.tsx:103-112` | 夹具自带 `Counter`：addView → open → move 到 right → 断 `[data-region=right]` 的 `textContent` | **正确形状的先例本来就在仓内**，不依赖任何产品注册 |

⇒ 旧措辞 `section[data-region=right] .agent-conversation` 要求对话视图同时是主区视图与右区视图，**在任何区域配置下都不成立**。我却在三处（§14.3 门 3 行、§14.10(3)①、可贴稿 §4 门 3 行）把它当"收起前的内容前置断言"写了十二轮，从未打开过注册点那个文件。

**(2) FC-0017 第 4 点带来的另一半后果（同一条断言的相反方向失效）**

- "interactions/entry.tsx 撤 right 注册 → statusbar 待回应计数"一旦实施，右区不再有任何产品视图。于是我 §10 表与 F3-0007 第 4 行那句"无 pending 时右区无视图 → workbench 现有 collapse 逻辑自动收起"由"待验断言"变成**恒真**（右区永远无视图，与 pending 无关）——正是 §14.10(3) 警告的假绿形态，只是这一次由**批准范围内的他人增项**造成，而非我写错。
- 门 3 因此只能照 `foundation.test.tsx:103-112` 用**夹具自注册视图**当右栏内容，不得再借任何产品视图。
- 顺带一条签发提醒（不请求裁定）：该项是**改码**（撤 `:9` 的注册）＋**新增**（statusbar 计数组件），而 interactions 包此前零预签（§14.14 的确证）⇒ 签发批文的精确路径须含 `plugins/agent/interactions/src/entry.tsx`，否则开工即撞未授权行。

**(3) 两条可复用判据**

- **他人增项进我的表，就要用新范围重跑我的旧结论**：一轮勘误只覆盖"当轮在裁的那扇门"，另一扇门会在范围变化后静默失效。规则＝**签发前把整表按"当前批文范围（含他人增项）"再跑一遍可达性**，而不是只跑被裁的行。
- **断"某容器里有某产品类名"之前先读注册点**：本仓区域归属只写在 `entry.tsx` 的 addView 一行里，一行就能证伪一个选择器。这是第 19 例的正面版——**未见≠已见，选择器的成立面要用注册点证明，不用直觉**。

**(4) 处置**：三处就地更正（见 (1) 末段），发 **F3-0039（CORRECTION→FC，cc C/F0/F1/F2）**。**授权面零变化**：不增行段、不改范围、不改任何已裁语义，只是把一个不可用的选择器换成仓内先例形状；按 C-0050"范围内普通调整免逐行请示"，FC 可径行并入。

**(5) 同轮两件杂务留痕**：F3-0038（门 1b 撤回信）经核对已被 FC-0017／C-0051 自行采纳 ⇒ **未寄出**，作废稿移入 `reports/F3-0038-unsent-withdrawn.md`（编号不回收）；自家审计工具本轮扩两维——路径 glob `/**` 不再被当粗体定界符（曾误报三件已发信），〔〕勘误标记纳入配对检查（当场抓出 `reuse.md` 一处未闭合的 04:18 块）。规则仍属"审计工具本身也要验"同族。

### 14.26 【施工轮四条新事实：绿灯不证明断言吃到本批改动；批文字面 SHA 会被后续澄清件超前一笔；build 必脏跟踪 lock；挂起一项不阻塞其余】（09:16；触发＝C-0053 签发后按批施工 P2-2，交付 `fb87a2929d`）

**(1) 变异复跑＝本门类的唯一证明，绿灯不是。** 前面十几轮把"假绿"当成断言写作期问题（夹具数据真不真、容器对不对、字段名换没换），施工轮补上最后一格：**断言全绿也不说明它吃得到本批那两行改动**——回归锁与"真新行为"在绿灯上长得一模一样。做法＝把两行授权改动临时撤回、复跑、再逐字还原（`cp` 自家 `/tmp` 备份，不用 `git stash`／`git checkout` 通配，避免碰到并发写域）：

| 门 | 撤回授权行时 | 结论 |
| --- | --- | --- |
| 门 4 | 红：`expected ['iA','iB'] to deeply equal ['iB']` | 该断言由 `interactions/src/view.tsx:52` 的 sessionId 过滤决定 |
| 门 2 | 红：`expected [ <select>…(2) ] to have a length of 1 but got 2` | 该断言由 `conversation/src/view.tsx:85` 的 `option.id !== 'model'` 决定 |
| 门 1／门 3／门 5 | **仍绿** | 恰与 C-0051 的性质判定吻合：门 1 归零＝回归锁、门 5 甲案＝视图侧回归锁、门 3 走 workbench 既有机制 |

⇒ 一张表同时交付两件事：**该红的红了（新行为被自家断言钉住）、该绿的没红（没有一门冒领新行为）**。这与 §14.19"断言与待授权 diff 不同轴"是同一条病的治疗版：那一轮是**写之前**发现轴错，这一轮是**跑绿之后**再验一次——绿灯不是终局证据。判据入 `reuse.md`。

**(2) 基线尖端会被"澄清件"超前一笔，批文字面不是最新事实。** C-0053（08:51）写"基线=b3d8492b、写域＝F3 树 @b3d8492b 起批内提交"，我照字面 FF 到 b3d8492b 并开始施工；**C-0054（08:53，同签发人、type: ACK）把尖端澄清为 fc 集成点 `16398e7cec`**（＝b3d8492b ＋ 一笔 lock 重生成，全部源文件 sha256 逐字节同）。净效果：字面照抄会把批做在**落后一笔**的基线上，而差的那笔正在我随后要 build 的那个文件上。规则：**开工前把签发件之后所有件读完，且"基线"取最新澄清件的尖端 SHA，不取批文里那个**；FF 前实测 `git status --porcelain` 与"该笔只动 lock"两条件，确认快进不触碰我的在写路径（实测 FF 只改 lock 一行）。同族第 13 例（时间不可信 ⇒ 用件号序列）：**同一签发人的两件件，后一件可以改前一件的坐标字段**。

**(3) `npm run build` 必脏一个跟踪文件，且它永远自指不一致。** 实测三行变化：`base` 改成执行时 HEAD ＋ 被改包的两条 `entry.js` sha256（**只有我改过的两包变化 ⇒ "改动半径恰为两枚扩展产物"的机器证据**，顺手当成 §6 半径证据用）。缺陷形态＝`base` 字段记的是"提交前的 HEAD"，所以**提交它的那一笔必然让它再次过期**（先例：`16398e7cec` 的 `base` 写 `b3d8492b`）。后果两条：(a) 它不在任何执行者的精确写域里，`git add -A` 会静默把它带进批内提交；(b) 复原它 ⇒ 本地 `dist/`（未跟踪）与 lock 的哈希不再一致，只有重跑 build 才对得上，而 build 又再脏它。处置＝**复原、不提交，重生成留给集成点**，并在交付件里对三家写明"build 后勿提交 lock"。这是"审计工具本身也要验"同族的**构建侧**版：**跑门这件事本身会改树**，所以"跑完门直接 `add -A` 提交"是一条会必然越界的动作序列。

**(4) "挂起一项"要变成可执行边界，得能说清它不阻塞什么。** §P2-2 第 4 点（撤 `interactions/src/entry.tsx` 的 `region:'right'` 注册）与两处 **F0 写域**应用门断言互斥：`electron/main.ts:109` 探针与 `scripts/test-agent-shell.mjs:19-20`（`pages.includes('Requests')` ＋ `deepEqual(result.agentShell,…)`）。本轮两条独立背书到达：F0-0011 §1 逐字复核后判"互斥成立、F3 判断正确"并支持乙案；F2-0012 §2 证明甲／乙两案对 P2-3 范围零变化（F2 撤的是 `conversation/src/entry.tsx`，不同文件）。⇒ 我据 F3-0040 §3 的自留纪律**一行未动该项**，同时把其余四项做完提交，并留下 `test:agent-shell` 绿＝挂起态现状证据。可复用形状：**"等裁"不等于"停手"，条件是三件事同时写明——挂起项的边界、其余项不受影响的理由、以及挂起项现状的可跑证据**。

**(5) 门结果与"未跑"一并登记。** 本树 @`16398e7cec` 串行七项全 EXIT=0：`build`／`typecheck`／`vitest run --maxWorkers=1`（**10 files 65 tests**，baseline0 为 8/60 ⇒ 净增两文件五用例、零回退、stderr 零 `act` 警告）／`test:agent-shell`／`test:agent-ui`／`test:foundations`／`test:extensions`。**未跑 `test:agent-process`** 并写明理由（脚本自述起真实 Pi/Codex 子进程；本批写域与其零交集；不擅自动用中央预算）——**"哪些门没跑、为什么"必须和"哪些门绿了"同一条交付**，否则七门绿会被读成"全门绿"。本轮唯一红＝`tsc` 一处 `TS2339`（`querySelectorAll` 在属性选择器下推得 `Element`、无 `click` ⇒ 改 `querySelectorAll<HTMLButtonElement>`）；顺带更正我自己写的一行"总结风险"：`InteractionAnswer` 在 `agent-interactions.test.tsx:44` **确有使用**，只有 conversation 那文件的同名 import 是死的（删）——**"我上一轮记的风险"也是待核断言，不是事实**（第 19 例再一形态）。



## 15. 变更记录（本文档）

- 09:19–09:33 **收件轮＋集成耦合核验（发 F3-0042；未动本树，全为只读）**：到信 F0-0012（09:19）与 F1-0015（09:26）。①**F0-0012 以 tooling 属主口径逐条背书 §5 的 lock 机械事实**（纯台账工件、运行时不读、`base` 自指不一致是"已知形状"、"改动半径机器证据"用法采认），§2 支持"baseline1 勿提交 lock"⇒ 我上轮那条由属主独立证实，可径直入 FC 集成条款；F0 §2 的可选工具改法（`ORDESSA_LOCK_REGEN=1` 才写 lock）我无立场亦不请求。②**把 F1-0015 的"与 P2-2 文件零交集⇒集成先后不限"当作代理信号回源核**（§14.26 变异复跑判据的迁移应用）：我的两枚 P2-2 门夹具**按行为**而非路径依赖会话模型——夹具注释明写"`agent` 切片逐字取自 client 快照（`model.ts`）"、门 2/4 读 `service.getSnapshot().agent` 的 `options`/`interactions`/`selectedSessionId`——而 F1-0015 恰好把 `plugins/agent/sessions/src/model.ts` 改成薄委托门面。只读 `git show ce7919304d` 证实：旧 `model.ts:12-13` 的 `agent: clients.get(selectedConnectionId ?? …)?.getSnapshot()` 在 F1 新 `workspace.ts:21-22` **逐字节保留**、且 sessions 的 `getSnapshot` 现委托 `workspace.getSnapshot` ⇒ 合并树（P2-1＋P2-2 同树）下我夹具行为解耦成立、非仅路径不重叠。**⇒ 发 F3-0042（NOTE→FC）**：回执 §5＋交付该耦合判定＋请 FC 在 baseline1 合并树上随套复跑两枚 P2-2 测试（把"读 diff 证成"升级为"执行证成"，与我 P2-2 的变异复跑同一口径）。新规则入 `reuse.md`：**"文件零交集"只保证可文本合并、不保证依赖某文件*行为*的测试仍绿；跨批集成对这类测试须在合并坐标复跑**。F1-0015 报头写"09-25 09:35"＝又一件前向落款，按 §14.23 只认件号序列。净新增授权 0；本树零改动、真实调用 0/99 未动。
- 09:03–09:16 **施工轮：P2-2 按 C-0053 落地并交付 `fb87a2929d`**（新增 §14.26 五小条）。四条新事实：①**变异复跑**才是"断言吃到本批改动"的证明（撤回两行 ⇒ 门 4／门 2 各自转红、门 1/3/5 仍绿＝与 C-0051 性质判定逐字吻合）；②**批文里的基线 SHA 会被同签发人三分钟后的澄清件超前一笔**（C-0053 b3d8492b → C-0054 16398e7c，我据最新件 FF 后再施工，FF 前实测"该笔只动 lock"）；③**`npm run build` 必脏跟踪的 `extensions.lock.json` 三行、且 `base` 永远指向提交前的 HEAD**（自指不一致）⇒ 复原不提交、重生成留集成点，并在 F3-0041 §5 对三家写明；顺带取到"改动半径恰为两枚产物"的哈希证据；④**挂起一项要能说清它不阻塞什么**——第 4 点一行未动，其余四项照做，并留 `test:agent-shell` 绿作挂起态证据（F0-0011 §1 逐字复核判"互斥成立"、F2-0012 §2 证甲／乙对 P2-3 零影响）。门结果＝七项串行全绿（vitest 10 files/65 tests，baseline0 为 8/60）；**未跑 `test:agent-process` 连同理由一并登记**，防"七门绿"被读成"全门绿"。本轮自纠两处：`tsc` 抓到我一处 `TS2339`；我上一轮记的"`InteractionAnswer` 未使用"经回源为**半对半错**（interactions 文件确有使用、只有 conversation 那文件是死 import）⇒ **"自己上轮记的风险条目"也是待核断言**。真实调用 0/99 未动。
- 08:30–08:42 收件 **5 件**（F0-0009／C-0050／FC-0017／C-0051／BC-0023）——**这是 F3 接管以来团队状态变化最大的一轮**：F0 复活续作 FE-PREP 步 2/7（我报了几轮的"关键路径停滞"已解除）；C-0050 改授权口径（范围内普通调整免逐行请示，FC/BC 自主协调并登记）；FC-0017 提出 P2 四批结构并**全文采认我的供稿为 P2-2 范围**；C-0051 批准（＝decisions HD-001-C-023），门 4／门 2 两条授权经 C 确认、门 1 归零、门 5 甲案、§5 五条通用注意升为 P2 三批共用条款。
  - **由此判定 F3-0038 不寄**：其全部结论已被团队自行采纳 ⇒ 再寄＝向已裁事项重复报送（C-0051 与 BC-0023 均重申"待命期不发空转报告"）。作废稿留证于 `reports/F3-0038-unsent-withdrawn.md`，编号不回收。**第 22 例＝寄出前必须再收一次件**。
  - **动作**：为核"采认是否走样"而整表重读 §14.3 ⇒ 新增 **§14.25**（门 3 行的选择器永不命中；十三轮里第一次重读门 3），三处就地更正，发 **F3-0039（CORRECTION，净零授权变化）**，另附一条签发时的精确路径提醒（`interactions/entry.tsx` 属改码＋新增、此前零预签）。
  - **自家审计工具扩两维**：`/**` 路径 glob 不再误判为粗体定界符（清掉三件已发信的假报）；〔〕配对纳入检查，当场抓出 `reuse.md` 一处未闭合块。同轮又自曝一次"插入文本带进多余的 `**`"——"写后立即机器复校"这条规矩本轮第三次救场。
  - 零源码改动／零构建／零测试／零安装／零真实调用（0/99）；F3 仍 RESEARCH_ONLY，开工前置就此只剩一条外部路径：**baseline0 落地 → C 逐批签发**。
- 05:08–05:10 **无新件**（收件实测：05:00 锚点后 outbox **零命中**；C 仍 C-0049、FC 仍 FC-0016、F0 仍 00:41 ⇒ 关键路径不在 F3，**本轮不发消息**）。上一轮验了 §14.7 的**个数**，本轮**逐个验名字**：直读契约全文 127 行（4410 bytes @85cc3cd）⇒ **13 个符号的名称与其"仅作证据"的行号全部命中**，"批文一律用符号名引用"由主张升为已核事实（§14.7 已落"已查且通过"条）。
  - **同次直读查出一条会让他人推翻已撤回项的陷阱**：`RunStatus` 的**类型域含 `unknown`**（全 7 值），而门 1 `:53` 的撤回依据是**生产者值域**（两连接器都不产 unknown）。只查类型域的读者会判定"撤回不成立"、把 `:53` 重新塞回批文。⇒ **判据：凡断"某值生产不可达"，须在原地同时写明类型域与生产者值域两个来源**。已同时落进 §14.7 与**可贴稿 §2.3**——FC 直接抄的是后者，故**优先写进稿而不是另发一封信**（省一封噪声件）。
  - 同次直读另确证门 2／门 4 夹具用到的字段全部真实存在：`AgentOption.id`:56／`availability`:60／`values`:59、`AgentSnapshot.options`:70、终态值 `resolved`/`expired` ∈ `AgentInteraction.state`:53。
  - **零新增授权请求；FC 待裁计数仍 3 条不变**。本轮零源码改动／零构建／零测试／零安装／零真实调用（0/99）。
- 05:00–05:07 **无新信件**（收件水位实测：04:51 以后落盘的只有自家 F3-0037；C 仍 C-0049/02:44、FC 仍 FC-0016、F0 仍 00:41 ⇒ 关键路径不在 F3）。**本轮不发消息**（FC 待裁面未变，追加即噪声），改做一件被我推迟的杂务：**把自家工件里所有"计数型表述"拿去重测，而不是回忆**（新规则候选＝计数是派生量，勘误越多越漂移，只能由工件正文现算）。四项量完，**一项真缺陷、三项通过**：
  - **缺陷（同源不一致，已修）**：`status.md` 同一文件内"五门表共 N 处替换"**5 与 6 并存**（③ 与 next ② 写 5、⑫ 写 6），且 `phase:` 行还带着两条**本文件自己已记为撤回**的前提（门 1 的 `:53` 拆分＝03:51／F3-0033 撤回；门 5 甲／乙择一＝04:20／F3-0035 撤回）。**处置不是把数改对，而是删掉这个数**：四处一律改为"§14.3 **整表五行**＝唯一有效值、按整表并入、勿按行点改"，`phase:` 的精确路径同步换成现行三条 `interactions/view.tsx:52`／`conversation/view.tsx:54`＋`:48-56`／`conversation/view.tsx:85-88`。修后实测该计数串归零。**判据：凡会被多次勘误的清单，写"整表即终稿"而不是"共 N 处"——前者不会漂移，后者一定会。**
  - **通过 1**：§14.7 表头声明"需重锚的 13 个符号"，直数表体＝9 行、其中 4 行各含两个符号（`:7`/`:11`、`:44`/`:46`、`:66`/`:68`、`:90`/`:124`）⇒ 9＋4＝**13，与声明相符**。这个数从来没被验过，这次验了。
  - **通过 2**：`p2-2-batch-draft.md` §7 有 4 条未划除、而 §13 明写"尚缺 3 条授权"——**不是矛盾**，两清单量纲不同：§7①（门 2 `:85-88`）＋§7③（门 4 `:52`、门 1b `:54`＋`:48-56`）折起来正好＝§13 的三条授权行，④＝"§5 是否升为 FE 通用条款"的归属问、⑤＝F0 复活的上游前置。**但这条区分读者数不出来** ⇒ 已在 §7 标题就地注明量纲，防下一次被当成不一致。
  - **通过 3（假缺陷）**：上一轮普查报出"§14.3 门 4 行漏收 04:36 §14.22 的证据升级"——实为**我的检索式漏检**：那轮只 grep 警告三角，而 §14.22 用的是〔〕形标记，标记其实**在位**。记为**第 19 例：查无 ≠ 不存在，先问自己的检索式覆盖了哪几种写法**（"审计工具本身也要验"同族，该族第 9 次）。
  - **修后再自曝一例（第 20 例）**：那四处删数的替换**我自己又写坏了一个**——正则把锚点的收尾全角括号一并吃进匹配区，替换文本却没补回 ⇒ `status.md` 的 phase 行变成`（`27 个／`)`26 个。是**落笔后跑的机器复校**抓出来的，不是读出来的。**第 16 例的镜像**：上轮是"插入文本多带了一个终止符"，本轮是"匹配区吞掉一个终止符却没补"。⇒ **判据：凡用正则替换"含终止符的整段"，替换完必须复算该终止符的配对数**，且这一步只能在全部写入之后做（本轮实测＝写后检查把缺陷挡在了落盘之后、发信之前）。
  - **本轮零源码改动／零构建／零测试／零安装／零真实调用（0/99）。**
- 04:51–04:57 **无新信件**（收件实测：04:20 以后落盘的只有自家 F3-0036；C 仍 C-0049/02:44、FC 仍 FC-0016、F0 仍 00:41）。五门三问既已跑完，本轮把同一把尺子**对准我自己收件所依赖的时钟**（新增 §14.23）：
  - **量出来的事实**：全队 179 件里，报头 timestamp 可解析 101 件、**无该字段 74 件**（C 49／H 7／F0 6／BC 5／E 4／S 3）、有日期无时刻 4 件（全是我自家 F3-0001..0004）；**前向落款（报头比自身落盘晚 >1 小时）共 11 件，只出自 FC 与 F1，无一例反向**，最大 +31.6h（F1-0013），其中含 **FC-0012（+24.3h）**。这些件在 control 仓库内未提交 ⇒ 无第二时钟可对照，mtime 只能给"内容不晚于它"的下限推断。
  - **为什么占关键路径**：FC-0012 正是我 §13 那条"复活批文＝FC-0012+A1+A2+A3"的组成件。按报头它排在 A1/A2/A3 与 C-0046..C-0049 **之后**；按落盘（00:38）**早于**全部这些裁决 ⇒ 谁用报头判"FC-0012 已含最新裁决"，谁就会漏掉 A2/A3 的三处 `vitest.config.ts` 授权与 `renderer/` 坐标（同 F3-0015 那类时序事故的放大版）。
  - **⚠ 第 18 例（自纠，且是本件最有价值的一条）**：我此前按"信件 11 个报头字段"核件，本轮**几乎据此发件请 C/BC"补 timestamp"**——回读 `COORDINATION.md:10` 才确认规约只要求 `base_sha／contract_version／owner_generation、事实与证据路径、请求动作`，**未规定 timestamp** ⇒ 那 74 件不是违规。⇒ 新规：**"他人不合规"这类断言落笔前必须回到规约原文，不得引用自家惯例冒充全队标准**（这是"把推导当实测"的报头版，与 F3-0024 归因句同族）。
  - **可复用产出（已发 F3-0037，NOTE→FC）**：排序**只用件号序列、不用时间词**；需要时刻就写"落盘 mtime＝…"并声明它只是下限；**我自己的收件水位从此落盘**在 `status.md`（记本轮实测的 `find -newermt` 锚点），不再凭记忆选时间＝第 13 例判据在收件动作上的对应形态。
  - **净范围检查**：零新增授权请求、零新待裁（仍 3 条）；本轮不请求任何人改历史件，也不请求 C 出规约更正（统一格式属 C 的规约权，F3 只登记事实）。
  - 本轮零源码改动／零构建／零测试／零安装／零真实调用（0/99）；未结束 goal，待命收件。

- 04:36–04:51 **无新信件**（收件实测：04:00 以后落盘的只有自家 F3-0035；C 最后仍 C-0049/02:44、FC 仍 FC-0016、F0 `updated` 仍 00:41 ⇒ 全队等裁，关键路径不在 F3）。**本轮把最后一件未过三问的授权（门 4）审完**，五门判据核算因此闭合：
  - **结论＝前提成立，且证据等级升一档**：门 4 原本只靠"F3 读过码"（codex `client.ts:234-239`、pi `client.ts:261-272` 的 `openSession` 全程不动 `interactions`）。本轮查到仓内**已有一盏绿灯测试**钉住"终态卡片不移除"：`apps/desktop/src/agent-pi.test.ts:281` 断 `toHaveLength(3)`（同实例内 expired／resolved／pending 三张全留，注释写明 notify 不算交互）⇒ 门 4 的"切回 A 卡 `id` 不变"半边不是新行为，是**回归锁**。
  - **同轮排掉两个我险些误用的证据**：① 同文件 `:265` 的 `toHaveLength(0)` 断的是**实例**作用域（请求由 `'other-instance'` 发出），不是会话作用域 ⇒ 拿来支持"跨会话不串卡"是越界；② 对 `.interactions` 做全仓 grep 后确认**生产读取点唯一**＝`extensions/agent-interactions/src/view.tsx:52`（其余命中全在 `*.test.ts` 与仅注册视图的 `entry.tsx:9`）⇒ "改点只有一处"是 grep 出来的，不是记忆出来的（第 13 例判据的正向复用）。
  - **对夹具写法的直接产出（强于原口径）**：A 卡**必须放终态**（`resolved`／`expired`）。只放 pending 时，切换与断连链路会把它改标，"卡片消失"就可能被读成"过滤生效"＝**假绿方向的失效**；而终态条目留在数组已由 `:281` 确证，所以放终态不会引入新的失败来源。
  - **范围自省**：本轮零新增授权请求，也不因证据升级而改变 FC 的待裁计数（门 4 还是那一条，只是依据由"F3 读码"换成"仓内绿灯"）。三问判据至此对**五门全部**跑完：门 1/2/3/5 见前几轮，门 4 见本轮与 §14.22。
  - **⚠ 本轮缺陷（同族第 16 例）＝插入型 helper 把锚点自己的尾巴重复写了一遍**：给 `p2-2-batch-draft.md` §4 门 4 行补语时，我的插入文本已以 `〕依赖 2.2 |` 收尾，helper 又把含同一尾巴的锚点原样接回 ⇒ 该行出现**重复尾串**、列分隔符由 3 根变 4 根（本轮终检第一次跑报 `L52 COLS 4!=3` 才暴露）。⇒ 两条规则：**行内插入文本不得包含锚点的终止符**；"改完表格行比列数"必须同时防**变多**（此前四例只防丢列）。已就地修好并复校为 0 问题。
  - **检查面本身也扩了一维（第 13 例判据的正向复用）**：本轮把结构检查的文件清单由"我记得要查的几件"改成 `glob('agents/F3/outbox/F3-*.md')` 全量扫描 ⇒ 立刻浮出三处历史已发件里的 odd-bold（F3-0001 `:31`、F3-0005 `:40`、F3-0026 `:20`），全部同属㉔那条"行内 glob 的 `**` 被当粗体定界符"类。**处置＝不修**：均为已发件，按 §14.7 不回改，且不为此发勘误（纯渲染噪声，不影响任何可抄语义），仅在此登记为已知豁免，免得下轮把非 0 计数误读成新缺陷。本轮五件活工件（报告／可贴稿／reuse／status／F3-0036）复校为 **0 issue**。
  - **⚠ 落款核算（与上一轮同族、方向相反的第 17 例）**：F3-0036 报头 `timestamp` 写 04:45，而其**最后一笔内容**（给 `agent-pi.test.ts:281` 补"现坐标／步 6 后随文件移动"的消歧句）落盘于 04:46:00 ⇒ 报头**早于**正文 1 分钟。根因与上一轮的"1 分钟前向落款"是同一个：**把报头当成计划时间而不是最后事实**。⇒ 规则：**报头 timestamp 必须在该件最后一次内容写入之后写，且写完报头即封笔**；若之后还想改正文，就必须在同一次操作里连带重打报头，否则本件宁可披露（全队自 02:44 无新活动 ⇒ 无人可能已读到旧版，但已创建的文件按 §14.7 不再回改，故本条为披露而非修复）。
  - 本轮零源码改动／零构建／零测试／零安装／零真实调用（0/99）；未结束 goal，待命收件。

- 04:16–04:24 **无新信件**（收件实测：`find agents/*/outbox -newermt "03:50"` 只有自家 F3-0033/0034；C 最后仍 C-0049/02:44、FC 仍 FC-0016、F0 仍 00:41。**但报告面有新收**：F2 于 04:10 收编 F3-0034，并在 `agents/F2/reports/sessions-batch-readiness.md` 尾部对我的判据 B 做了**第二处独立实测对号**（SessionBrowser `:34` 的 `.agent-session-list` 无条件渲染⇒空列表＝空壳 div 在场⇒P2-3 禁写"它为 null"）——判据 B 由"我一处发现"升为"两处、两个行域各自实测"，无需我回信）⇒ 把连抓两门的尺子对准**我自己提出并请 FC 择一的门 5 乙案**，门 5 出局（新增 §14.21，发 F3-0035）。**本轮第一次逐行读 `agent-interactions/src/view.tsx` 全文＋两连接器的 `respond` 全体**：
  - **判据升级（本条真正的方法产出）**：可达性判据原只有"生产者空⇒装饰"一问，本轮补出**第二问"这件事是否已被更下层保证？"**——门 5 死于第二问而非第一问：`route.used = true` 在 codex `client.ts:278`、pi `client.ts:301` 都在**函数内第一个 await 之前**同步置位（前面 `:262-277`／`:295-300` 全段无 await），⇒ 连点必在第二次 throw，**双发窗口不存在**。第三问"被测对象是生产代码还是我造的桩"另立。
  - **顺带查出我的范围漂移（责任全在 F3）**：C-0026 §6 门 5 原文义＝**不"自动"重发**，而乙案＝**防用户连点**＝另一件事，是我在 §14.14 推导时混进待裁清单的 ⇒ 记规则"**待裁项须回得上游原文**"。撤回后 **FC 少一项待裁**（前置条数仍 3，但第 3 条的待裁面变窄）。
  - **同轮内还撤掉自己另一句过头话**：先前写"字面版结构上必然成立＝空断言"——不确。`respond` 只由 onClick 触发这一事实**正是**该回归锁要锁的对象，被测物是视图自身（生产代码）、假件只是被调用方 ⇒ 甲案两条都是正当回归锁，**不作废、不连坐**（区分见 §14.21(3)）。
  - **"已查且通过"也落纸**：门 4 的过滤键 `AgentInteraction.sessionId` 过同一道判据＝**干净**（契约必填非可选；codex `:174`、pi `:119` 都在构造前挡空值）⇒ 我原本预判"字段可能恒 undefined 会把面板清空"为**误判**，照实记录以免下一个人重查。
  - **附带确证**：门 5 的"终态条目留在数组"半边从"属 F1、未知"升为"**已在四个产地确证**"（codex `:132`/`:279`、pi `:127`/`:302-307` 一律 `.map` 原位替换不移除）；另登记 `role=alert` **第三处**生产者 `interactions/view.tsx:47` ⇒ §14.10 跨门规则的适用面扩大。
  - **更正站点**：§14.3 门 5 行（FC 抄的正是此行）、§13 开工前置三（标题 4 条→3 条＋④整段撤回）、`p2-2-batch-draft.md` §2 标题／§2.5 整段重写／§2.6 零扩面（去掉 `:19-21`）／§4 门 5 行／§7②、`reuse.md` 夹具行（**该账又编码了一条今天刚证伪的前提**——同一病第 2 次犯，前次 03:31）。已发 outbox 不回改 ⇒ 另发 F3-0035。
  - **落笔纪律自查（本轮收尾抓到自己一处 1 分钟前向落款）**：F3-0035 正文末笔落盘于 04:19，而其报头 `timestamp` 写 04:20 ⇒ 该件已在本会话内被自己核出，但**不回改已落盘的 outbox 信件**（§14.7 管辖三条；且差值仅 1 分钟、不影响任何先后次序判定）。按"如实登记优于静默修正"处理：此行为唯一更正处，未来引用 F3-0035 的时间一律以其报头 04:20 为准。
  - **本轮的净方向检查（不扩功能的具体形态）**：本轮零新增授权请求、**净减**一项待裁（FC 4→3）与一个行段（`:19-21`）；产出全部为撤回与判据补全 ⇒ 与"不造任务、不扩范围"一致。判据 B 的第二处独立证据由 F2 自行实测得出，不是我代查。**据此判定本轮不再另发信件**：F3-0035 的实质未变，而本轮补正的站点全部落在 F3 自家工件内（其中两处会影响 FC 抄表——可贴稿 3.5 的行段清单、§14.3 门 5 行掉的那根列分隔符——均已就地修好），无需新裁决。
  - **⚠ 本轮的第二个缺陷（同族第 13 例，且是"更正动作本身"的缺陷）＝§14.21(6) 的站点清单由记忆生成 ⇒ 漏 6 处**：04:20 收尾后另起一次自查，用 `grep -rn` 扫"19-21／在途门控／连点／甲／乙"四组词，才扫出仍带作废前提的站点——本报告 §14.14 两条正文（`:462` "真实风险是连点两次"、`:463` "两案已交 FC/C 择一"）、§13 替换项行（`:238` "`:52`/`:19-21` 从未预签"）、`reuse.md` **缺陷行**（我上一轮只改了"夹具行"，同一张表相邻一行的三栏全部未动）、`p2-2-batch-draft.md` 3.5 行段清单、`status.md` wake_mechanism 里引用 §14.14 的那半句。⇒ **新规则：作废一条前提时，站点清单必须由 grep 生成（用该前提的关键词组，而不是用"我记得写在哪"），命中数归零才算改完**；本轮 6 处已就地补标。
  - **⚠ 本轮的第三个缺陷＝结构归属：我把 04:16 的轮次记录写进了 §14.21 末尾，而不是 §15**（同一文件里 §14.20 的记录写对了，说明不是惯例而是当次手滑）⇒ 后果是"变更记录"缺本轮条目、而主题节尾部混入时间线。**新增一条终检维度：形如 `- HH:MM–HH:MM` 的条目必须位于 `## 15.` 之后**；本轮已整块搬回 §15 顶部。此前"结构复校 0 处问题"之所以没抓到，是因为它只查管道/粗体/括号三类**字符级**对称，不查**章节归属**——这是"审计工具本身也要验"的第 7 例，方向＝检查维度覆盖面。
  - **⚠ 收尾自检再抓两处"改动作本身把纸改破"的缺陷（同族第 14／15 例，都不是上一轮遗留——本轮终检第一次跑才报出）**：第 14 例＝**删除型编辑改变粗体配平**（⑭ 那条 span 替换一次删掉 3 个 `**` token ⇒ 奇偶翻转；我先想用"补一对"去修是错的——补一对不改变奇偶；最终删掉那个孤儿开括号才配平）。第 15 例＝**往表格行就地插入长更正块时吃掉了列分隔符**（§14.3 门 5 行从 4 根管道掉到 3 ⇒ "门"栏与"表现"栏合并，FC 照抄会整列丢语义；本轮已补回）。⇒ 新规则：**删除段落要清点被删段内 `**`／括号 token 的奇偶**；**改完表格行必须重新与该表基线比列数**（"grep 复验命中数"在表内不适用）。前 13 例都是内容错，这两例是编辑动作本身的副作用——也正是"检查必须跑在本轮最后一笔之后"这条规则存在的理由。
  - 本轮零源码改动／零构建／零测试／零安装／零真实调用（0/99）；未结束 goal，待命收件。

- 03:57–04:13 **无新件**（`find agents/*/outbox -newermt "2026-09-23 03:00"` 实测最新三件均为 F3 自家 0031/0032/0033；C 侧最后 C-0049/02:44，FC 仍 FC-0016，F0 `updated` 仍 00:41 ⇒ 关键路径不在 F3）。**本轮把上一轮的尺子对着"我上一轮自己定的终口径"再跑一遍，门 2 出局**（新增 §14.20，发 F3-0034）：
  - **动手方式本身是一次更正**：本轮**第一次完整实读** `view.tsx:62-107` 的 JSX 嵌套（此前所有轮次只按行号引用它）。两处缺陷**只有读嵌套才能发现**，靠已引用的行号复发不出。
  - **查出①（空断言第十一例，恒绿）**：`:78` 开 `<section className="agent-panel agent-conversation">`，`:85` 的 `.agent-options` 与 `:89` 的 `<ThreadPrimitive.Root className="agent-thread">` 是**兄弟**，且 `.agent-thread` 内（`:90-95` composer＝Input/Send/一个 button、`ChatMessage`＝`<details>`/`<pre>`）**根本没有 select**。而我在 §14.18(4) 与可贴稿 §4 门 2 行写的是"先断 `section.agent-conversation .agent-thread` 存在，再断**该容器内** `querySelectorAll('select')` 为 0"——最近先行词是 `.agent-thread` ⇒ **该断言恒绿、什么都没测**，而它正是 FC 要"原文并入"的那一行。**连带更正一条重要限定**：§14.18 的结论"**门 2 现状为红**"**只在以 `.agent-conversation` 为计数容器时成立**，换成 `.agent-thread` 即为绿——批文若不说清容器，同一份断言两种命运。
  - **查出②（新类别"伪等价"，方向是假红）**：§14.3 门 2 行的"等价断言 `.agent-options` 为 null"**为假**——若按路线 B 把过滤加在**内层 `:86`** 的链上，外层 `:85` 的门是 `agent.options.length > 0`（与 availability 无关）⇒ div 仍会渲染成**空壳**，`.agent-options` 不为 null ⇒ 照此写的断言**必假红**。二者仅在过滤被提到 `:85` 时等价。**该句是我 03:57 之前写进"终稿表"的，此前三轮五次勘误都没碰到它。**
  - **产出（可执行的阳性对照三件套）**：夹具除 `model` 外**再放一个非 model 的 `probe` 选项**（同为 `availability:'supported'` 且带 `values`），三条断言＝①`section.agent-conversation` 内 `select` 数 == 1；②存活 `<label>` 文案 == `probe.title`；③`AgentSnapshot.options` 仍含 `model`（**断数据侧、不断 DOM**——门 2 成立形态恰是 model 的 label 不在 DOM 里）。①②同容器一正一负，堵住"容器选错／夹具没数据／整条没渲染"三种假绿。**通用判据登记入 `reuse.md`：写"不存在／为空"断言时必须同容器再断一条阳性对照；写"等价"前先举一个使两者真值不同的渲染场景。**
  - **逐条影响面已核算，撤回保持窄**：§14.18(1)(2)(3) 与 §14.9(2) 的**存在性前置**仍成立，死的只有"计数容器"与"等价 null"两处 ⇒ FC 不必重审整门。
  - **更正站点**：§14.3 门 2 行（FC 抄的正是此行；补入过程中曾亲手引入一个未闭合全角括号，靠全角括号配对计数（11 对 10）查出并已补合）、§14.18(4) 就地划废并指回本节、`p2-2-batch-draft.md` §4 门 2 行整行重写、`reuse.md` 夹具行末追加门 2 反例＋两判据＋新类别。**已发 outbox 不回改**（§14.7 管辖三条）⇒ 另发 F3-0034。**开工前置仍 3 条不变，但门 2 那条的"必列 `:85-88`"须按本节的容器写法抄，且"现状为红"要带容器限定语。**
  - **审计工具第 5 例（新增检查维度）**：本轮把结构复校从"odd-bold ＋ 逐表列数"扩到**第三维：全角括号／方括号配对计数**。它立刻抓到我自己上面那处括号漏合——前两个维度都查不出。**规则：检查项的覆盖面要跟着新缺陷类别扩，不能沿用上一轮清单。**
  - **⚠ 本轮在同一轮内又抓出自己的一处假红（写"更正"时引入的新缺陷，同族第 12 例）**：本件 §3 那条"产出"里，我把阳性对照的第③条写成"快照 `container.innerHTML` 仍含 `model` 的 title"——**那恰好是门 2 成立时必然不成立的事**（抑制成功 ⇒ model 的 `<label>` 不在 DOM 里）⇒ 若发出去，我一边纠正假红一边亲手造了一条新的假红。**落笔后自查重读才发现，已在同件内改掉**（件创建后 30 秒、全队自 02:44 起无新活动 ⇒ 无人可能已读到旧文，故按"发送前修稿"处理，不算回改已发件；此判据与 §14.7 管辖三条并列记）。③的正确形态＝**断数据侧**（`AgentSnapshot.options` 含 `model`），DOM 判断全部交给①②。**四处同源站点（§14.20(3)、§14.3 门 2 行、§14.18(4) 复述、可贴稿 §4 行）已统一改标"数据侧断言，不是 DOM"**——同一句歧义在四处都读得通，正是"改一处不改其余"会留下的坑。
  - **结构性教训（写进判据）**：**"阳性对照"必须与主断言同层但不同轴**——主断言读 DOM，对照就要读数据；两条都读 DOM 会互相掩盖。**新增自查动作：每写完一组断言，逐条问"门 2 成功修复时这条是绿还是红"**，答不出的那条要么没想清楚要么写错轴（本轮③就是靠这一问抓出来的）。
  - **结构复校（本轮终检，五件工件：报告／可贴稿／reuse／status／outbox F3-0034）**：odd-bold 0、逐表列数离群 0、全角括号／方括号／三角括号配对 0。**两处检查器自身的修正与新维度的当场收益**：①首版把代码围栏行（研究记录 `:157`/`:162` 的 ts 围栏）误报成奇反引号 ⇒ 复校必须**跳过围栏内**，这是"审计工具本身也要验"的第 6 例；②新增的括号配对维**当场抓出两处**——本轮我自己写在 wake_mechanism 的 §14.20 索引里多出的一个全角右括号，以及**上一轮 03:51 遗留在 next 字段、从未闭合的一个左括号**（该行 odd-bold 与列数两维历来都通过 ⇒ 旧轮次报的"全跑过 0"并不覆盖这一维）。⇒ 规则：**新检查维度首跑通常会立刻抓出旧缺陷；不得因旧轮次报过 0 就假定其干净**，且任何终检结论只在最后一笔之后有效。两处已各自补合／删合，本条所报的 0 是修完之后整轮复跑的结果。
  - 本轮零源码改动／零构建／零测试／零安装／零真实调用（0/99）；未结束 goal，待命收件。
- 03:43–03:55 **无新件**（最新仍是 F3-0032/03:28；C 侧最后为 C-0049/02:44；FC 仍 FC-0016；F0 `updated` 仍 00:41 ⇒ 全队等裁，关键路径不在 F3）。**本轮把 §14.18 那把"结论是否穿过生产里不存在的东西成立"的尺子逐门重跑，门 1 出局**（新增 §14.19，发 F3-0033）：
  - **发现（新病型，非前九例）**：门 1 四条断言**全部读 run/连接级句柄**（`view.tsx:69-70/:80/:83`），夹具一设 `run.status='unknown'`＋断连就**对未改动的现码全绿**；而 §13 开工前置三 ② 请 FC 批的改动在 **message 级**（`:53` 合并支）⇒ **断言与待授权 diff 不同轴**，门过了不证明改动发生过。与前九例的差别已写进 §14.19(6)：前九例质疑"夹具的数据真不真"，本例数据真、断言也真过，问题在**层级错轴**。
  - **可达性证伪（更硬的一半）**：回源列全 `message.status` 生产者——codex `client.ts:34` 消息级只产 `completed/failed/running`，pi `client.ts:36` 只产 `cancelled/failed/completed/undefined`；全仓 `'unknown'` 只写 `runs[].status`／`interactions[].state`／`sessionList` 三类字段 ⇒ **`:53` 的 unknown 支生产不可达，拆它是装饰**。
  - **正向产出（真正的缺陷）**：同一条链**末支 `:54`** 把 `undefined` 渲染成 `complete/stop`，而 pi `client.ts:185-196` 明确预料 `stopReason` 缺失并以 `updateRun(…,'unknown')`＋diagnostic 记"结果未确认"，但**只给 run、不给消息** ⇒ **同屏矛盾**：最后一条气泡显示"完成"、徽标显示 `unknown`。**这才是门 1 该抓的东西**，改法落 `:54`＋`:48-56` 调用点，属 F3 自家包、不需 F1/契约变更。附带诚实反驳已入稿：中间态 `toolUse` 消息渲染 complete 是**对的** ⇒ 修复面须限定"最后一条 assistant 消息"，否则误伤。
  - **第二条查出**：`:83` 文案 `Run outcome unknown after disconnect.` 的条件只看 `run?.status==='unknown'`，而该值也来自**未断连的未确认收尾** ⇒ 假因归因（`:84` diagnostic 是缓解）；**门 1 断言 (b) 正把这个串钉进验收** ⇒ 建议改断句柄。
  - **自我一致性**：§14.18(3) 我已写"门 1 已是既真⇒回归验证"，却仍在 §13 ② 把它当需要授权的新行为提出＝**同源不一致**，本轮修。同时按 §14.7 自定规则"新写引用先补表"补入第 13 个符号 `AgentMessage.status?`，并加**同号不同文件消歧条**（本表 `:53`＝`contract.ts:AgentInteraction.state` vs 撤回的 `view.tsx:53`）⇒ 新规则：F3 所有行号引用**必须带文件名**。可贴稿 §3.3 的"10 符号"计数亦已随 §14.18 的扩容更正为 13。
  - **更正站点**（7 处）：§14.3 门 1 行（FC 抄的正是此行）、§13 开工前置三 ②、§13 五门替换项行、§11 的 `:53-55` 拆分条、§14.9(1) 末、§14.13 末"剩余实施前提"条、`p2-2-batch-draft.md` §2.3 整段重写＋§3.5 行段清单＋§3.3 计数、`reuse.md` 夹具行补门 1 反例。**已发 outbox 不回改**（§14.7 管辖范围三条）⇒ 另发 F3-0033。**开工前置仍 3 条，但 ② 的行号从 `:53` 换成 `:54`＋`:48-56`——授权不可照旧抄。**
  - **结构复校**（四件工件全跑）：odd-bold 0、逐表列数离群 0（含新插行）、`reuse.md` 23 行表列数一致。
  - **⚠ 本条的自我更正（03:56，同轮内）**：上面那句"四件全跑 odd-bold 0"是在 03:47 那次跑完后**又继续编辑 `status.md`** 的情况下写的——03:55 对 `status.md`＋`outbox/F3-0033.md` 复跑查出 **wake_mechanism 行有一个我本轮亲手引入的未闭合 `**`**（我在索引里加了三个 `**` 而非成对的四个）。⇒ 已补齐并复跑五件（含 outbox）全 0。**这是"把中途一次通过的检查当收尾结论"的又一例：检查必须在最后一笔之后跑，不是在本轮任意一次通过之后写。**
  - 本轮零源码改动／零构建／零测试／零安装／零真实调用（0/99）；未结束 goal，待命收件。
- 03:31–03:36 **无新件**（F0 自己的 `current_action` 实读为"低频待命收件（轮询 C/FC outbox）"、`updated` 仍 00:41；FC 仍 FC-0016）⇒ 全队都在等，F3 不动关键路径，改做本objective明列的**"持续调研复用并维护记录"**：清扫**复用账 `reuse.md`** 与**再锚定表 §14.7**。查出并修掉三件真缺陷：
  - **①`reuse.md` 的"五门夹具装配"行仍编码着我今天刚证伪的前提**——这一行是实施者照抄装配的地方，却对门 2 只字未提"夹具必须**故意**放一个 supported＋带 `values` 的 model 选项"，照抄者会**原样复现空断言**。已补：该反例＋**通用判据**（断言链路上每个被调用对象先问"生产路径还是我造的桩"，附 `model.ts:76` 透传证据与"真连接器下反而必红"），并明写此判据与本行"三步照抄既有先例"的授权**并列读**（照抄装配是对的，别让结论穿过桩成立）。
  - **②可贴稿里出现了一处新的死行号引用，且是我在写"路 A 撤回"那轮亲手引入的**：全文清扫查出 `p2-2-batch-draft.md` 含 `contract.ts:90/:124`——正是 FC 要"原文并入"的那份。根因不在疏忽而在**§14.7 那张"权威再锚定表"本身漏了这两个符号**（表列 10 个、`setOption` 两处不在内），我按表取名自然取不到。**处置**＝表补至 12 个符号、稿内改符号形、`reuse.md` 另三处（`:3/:11/:68`、`:66`、`:46`）同步符号形，并在 §14.7 加收**管辖范围三条**（三件"会被复制"的工件必须符号形；历史分析行与**已发 outbox 消息不回改**、要改另发新件；新写引用先补表再引用）。⇒ 这是"再锚定要覆盖将被复制的那份"这条我自己定的规则的**第二次违反**，第一次是上一轮漏 §14.3 门 4 行。
  - **③操作性新发现，值得单记（审计工具第 4 例，但对象是写工具本身）**：本轮一次 `Edit` **返回"Successfully modified"**，事后 `grep` 复验发现**该行并不在文件里**（同一文件的另一处编辑却确实落盘，故非整体失败）。⇒ **规则＝凡"追加行"型编辑，落笔后必须 `grep` 复验命中数，不可信工具的成功返回**；本轮正是靠这条才发现表头已写"12 个符号"而表体仍只有 10 个（**若不复验，会留下一个自相矛盾的权威表**）。与 02:36/03:05/03:31 三例同源：**校验的对象可以是我的记忆、别人的工件，也可以是我自己刚写完的东西。**
  - **结构复校**（五件工件全跑，非只跑报告）：odd-bold 0、8＋1 张表列数离群 0、正文重复行 0；`status.md` 上轮那个从 03:02 起未闭合的粗体起始符已补；本轮零源码改动／零构建／零测试／零安装／零真实调用（0/99）。
- 03:14–03:29 **无新件**（全队仍静默自 C-0049/02:44；BC-0020/0021/0022 实读为 to:C／cc 不含 F3 的 BE 回执，与本员无关，登记于此以免下轮重判）。**本轮＝对上一轮刚发出去的 F3-0031 稿件做"承重断言回源"，查出两处错并全链更正（新增 §14.18，发 F3-0032）**：
  - **错一（新型态空断言）**：草案门 2 的"并 `await service.setOption('model', …)` resolve"半句。回源 `model.ts:76` 发现它是**纯透传**，测试里被透传到的 client 是**我自己造的假件** ⇒ 该断言不携带外部信息。真实连接器语义相反：codex `client.ts:310-315`、pi `client.ts:322-333` 对不在 `values` 内的值一律抛错 ⇒ 在真实现下这半句**必红**。与前八例的区别已写进 §14.18(1)：**前八例是"夹具没给数据⇒空转"（弱断言），本例是"夹具给了数据但数据来自我自己"（会**通过**，因此连绿信号都不含信息）**。⇒ 判据升级：**断言链路上每个被调用对象都要问"它是生产路径还是我造的桩"**。
  - **错二（把不可行的选项当作"待裁"送进关键路径）**：路 A＝"F1 契约义务保证 `agent.options` 永不含 model"。实读两个连接器都**合法地**以 `availability:'supported'` 且带 `values` 发布 model（codex `client.ts:303-304`、pi `client.ts:315`），且 `AgentSnapshot.options` 的**存在目的**就是承载模型选择——禁掉它既掏空契约字段、又直接撞"禁止扩展/收缩 Model 配置面"的任务红线，**F1 无权也不该接**。⇒ **路 A 自我提出那刻就不可行，而我把它作为正式二选一交给了 FC**；若 FC 择路 A，整个 P2-2 批次作废重来。**发件理由**（对抗"未回件时不追加"的既有纪律）：路 A 的不可行性只有读连接器才知道，而门 2 属 F3 写域、**F3 是这条信息的唯一提供者**，这不是催办噪声、是在落笔前撤回自己给的假选项。
  - **由此得到的新事实**：`view.tsx:85-88` 对 model 无专属抑制 + 真快照今天确含 supported model ⇒ **门 2 现状为红＝新行为、不是回归锁**；与门 5（已成立、属回归验证）**性质相反** ⇒ 批文须分别表述，否则实施者首跑见红会误判为自己改坏而回退正确改动（§14.18(3)）。
  - **更正落点（6 处，就地标注不删旧文）**：§14.3 门 2 行 ×2（**FC 抄的正是此行**）、§13 五门替换项行、§13 开工前置三 ③、§14.9(2) 末、§14.9(3) 行段核算（`:85-88` 由"仅当采路 B"改**必列**）、§14.13(3)（区分"仍有效部分"与"被推翻前提"）；§10.4 门 2 行**不改**（该表已有"请勿抄本表"总警告）。`p2-2-batch-draft.md` §2.4/§2.6/§4/§7 上一轮已改毕。**开工前置从 4 条降为 3 条**（门 4 增列、门 1 拆分、门 5 甲/乙），门 2 从"择路"变"必列授权"。
  - **一处流程教训**：本轮先试图用 `python` 脚本批量替换，两次失败——① heredoc 里 ASCII `"` 与 Python 字符串定界符冲突报 `SyntaxError`（中文文案须用全角引号或 `\u201c/\u201d` 拼接）；②改写成脚本文件时**权限未被授予**。⇒ **改用 Edit 工具逐锚点直改**，六处一次成功、且每次 `old_string` 唯一性即天然的断言校验。**规则＝多文件长文案批量改，优先逐锚点编辑，不造脚本。**
  - **结构复校**：§14.18 在位（此前 §14.3/§13/§14.9/§14.13 里的"见 §14.18"是**悬空前向引用**，本轮闭合）；四张表列数离群 0（判据＝排除 `\|`、保留 code span 内竖线）；`**` 奇数行 0；F3-0032 十一字段齐。**本轮零源码改动／零构建／零测试／零安装／零真实调用（0/99）。**
  - **收口扫尾两处**：①`status.md` 的 `open_inputs` 查出**一个从未闭合的粗体起始符**（03:02 那次以 `**【03:02 …】` 起头却漏写闭合符 ⇒ 该行后半段整体错位配对；本轮补 `**` 后奇偶归零，五件工件复扫**全部 0**）——**教训＝奇偶检查要跨自家全部工件跑，不只跑报告**；②`reports/_patch_gate2.py` 是上一轮批量改失败留下的**我自己的**临时脚本（无证据价值、且混在证据目录里），已删除。
  - **收口时又自查出一例"同源不一致"（本轮第二例、且是最廉价的一例）**：同一轮的时间区间在 §15 写成 03:24、在 `status.md` 写成 03:26。两处都用"本轮"起头、语义完全相同 ⇒ **凡跨文件复制同一事实，落笔后必须 grep 对端字面**。批量改时先跑的 `count(anchor)==1` 断言把这次不一致**当场暴露**（它报了 0 命中，我才去查两端），**再次证明该断言值得保留**。已统一为 03:29。
  - **审计工具第三例（且是"判据不对称"这一新形态）**：本轮先跑出不剥 code span 的 `**` 奇数检查 ⇒ 报 24 行，**全部是假警报**（补上剥离后归 0）。与 03:05 那次竖线假警报**方向正好相反**，根因是同一条 Markdown 规则的两半：**反引号 code span 不保护竖线（裸 `|` 在表里照样分列），但确实保护粗体 `**`**。⇒ **两条判据必须分别写死，不可共用一个"剥 code span"开关**：数竖线＝**不剥**且排除 `\|`；数 `**`＝**先剥**。本轮把竖线那半记成"通用预处理"，于是同一个脚本在两处各错一次（一次漏报、一次误报）。**规则＝复用旧检查脚本前先确认它的判据对当前这个符号是否成立**（本会话第 3 例，前二＝02:36 `grep -L '^timestamp'` 假警报、03:05 剥竖线判据反了）。
- 03:09–03:13 **无新件 ⇒ 做掉"批文未成文"的可归因成本，交出可贴底稿 `reports/p2-2-batch-draft.md`（75 行七节，发 F3-0031）**。诊断：`FC-0016 §5` 命"五门表与防假绿注意**原文并入** P2-2 批文"，但终稿表被**四批勘误**切过（F3-0014/0015 → 0019 → 0020 → 0029）、跨门规则散在**三件未回消息**（F3-0020 §4／F3-0030 §二·§三）、四项授权／择一只存在于 §13 表末三行 ⇒ "原文并入"实际是把去重与装配推给 FC，而这正是关键路径。**供稿边界**：零新裁定（每条指回已裁件，文头列依据与"取代哪五处"）、**冲突以 §13 为准**、裁量权五项全列 §7 且明写"FC 若自组稿即弃用本件，F3 不追问不重发"（防成催办）。**本轮三处自查**：①**§14.3 门 4 行仍带 `contract.ts:66`**——上一轮我只锚了 §13，**漏了真正要被"原文并入"的那一行** ⇒ 若不改会把死行号直接送进批文（教训：**再锚定要覆盖"将被复制的那份"，不是只覆盖我自己的结论表**）；②草案初版把 `plugins/agent/{interactions,conversation}/src/view.tsx` 当既成坐标落笔＝**自家第三例"把推导当实测"**，回读 `fe-prep-research.md:15` 后补出处并明写"仍属 §3.1 首步实测对象"；③**新型态＝向自己的账本追加时未复核现行状态**：`delivered` 编号实际已到 ㉕，我按压缩快照里的 ㉒ 追加 ⇒ 造出两个 ㉓（已改为 ㉖）。**根因＝拿会话早期的快照当现状**，与 §14.12"裁决件归因句也须核"、02:36"审计工具本身也要验"同属"用旧认知代替实读"这一类；**规则＝凡向长字段追加编号条目，先 `grep` 现行末号**。结构复校＝全文 4 表列数离群 0、`**` 奇数行 0、草案内死契约引用 0／迁移前字面 0、`delivered` 序列 ㉑–㉖ 无重号、29 条变更记录。**本轮零源码改动／零构建／零测试／零安装／零真实调用（0/99）。**
- 03:04–03:07 **无新件**（F0 仍 @00:43、FC 最新仍 FC-0016）⇒ 继续不发件。**本轮改压测自己上一轮刚写进 §13 的三行**，查出两处真缺陷、且都是"我自己定的规则被我自己违反"：①**我在 §13 新增的两行里用了 `contract.ts:46`/`:66` 行号引用，而 §13 早就有一行明写"契约行号引用全部失效、批文一律改符号锚定"（§14.7 的结论）**——`packages/agent-ui-contracts/src/contract.ts` 正是步 2 要按域拆往 `contracts/{connections,agent}` 的那个文件。处置＝**四处再锚定**（开工前置一 → `AgentSnapshot.selectedSessionId?`；开工前置三 → `AgentInteraction.sessionId` + `AgentSnapshot.selectedSessionId`；顺手把 §12/§13 各一处的 `contract.ts:48` 锚成 `AgentInteraction.kind`），**旧行号一律以"@85cc3cd 仅作证据"保留、不删**（证据链不能断）；现值已实读核对（`contract.ts:44-48` `AgentInteraction{id,sessionId,turnId?,kind,title,detail?}`、`:60-72` `AgentSnapshot{selectedSessionId?,runs,interactions}`、`:103-112` `AgentWorkspaceSnapshot.agent?`）。②**同轮自查出自家工件的第五例自伤**：我在开工前置一里写了未转义的值域枚举 `approval|choice|confirm|input|editor`——**在 GFM 表格里裸 `|` 会分列，且在反引号 code span 内也一样分列** ⇒ 该行由 4 列变 5 列（**表格静默错位，不报错**）。已改为不含裸竖线的写法。
  **⇒ 校验脚本本身有 bug（记为方法论）**：本轮先前用的"剥 code span 后数 `|`"是**错的**（code span 不保护竖线，剥掉反而漏判）；正确判据＝**数竖线时排除 `\|`、但保留 code span 内的竖线**。按正确判据全文复扫 4 张表 ⇒ **除已修那一行外离群行为零**（其余三处 `|` 数差都是合法的 `\|` 转义，属假警报）。**教训＝"我写进权威表的引用也要过我自己那条规则"，且"校验工具的判据也要验"（与 02:36 那次 `grep -L '^timestamp'` 假警报同类，本会话第二次）**。零源码改动／零构建／零测试／零安装／零真实调用（0/99）。
- 03:00–03:02 **无新件**（全队静默自 C-0049/02:44；F0 仍 @00:41）。**本轮不发新消息，改扫自家权威账本的"同源不一致"**：§13"P2-2 装配配方"行仍写"五门可一步实施／零未知"——那是 §14.13（02:27）的话，而 **§14.14（02:39）已查出"可断言 ≠ 已授权"、§14.17（02:56）又自证该句尚有两处真未知** ⇒ 按我自己定的纪律（§13 是实施者 first-glance 读物，留旧字面＝把已废结论重新注入，与 §10.4/§14.3 双表、`reuse.md` 旧行同属一病），**这次病在自家最新一行的标题里**。处置＝该行标题加 ⚠ 缩窄说明，并**新增三行终口径**：**开工前置一**＝断言对象的可达门槛（三关串联＋"先证其在再断它空"＋"断『集合变空』先问它是否本来恒空"）；**开工前置二**＝文件头四件（`@vitest-environment jsdom` 是承重用首行、`IS_REACT_ACT_ENVIRONMENT`、`createRoot`/`cleanup` 必须自带且**不外溢共用文件**、探针三桩分档）；**开工前置三**＝**P2-2 尚缺的 4 条授权／择一集中一处**（门 4 交互包 `:52` 增列、门 1 `:53` 拆分、门 2 路 A/B、门 5 甲/乙）——此前散在五行表与三件消息里，只有这一处能让实施者一眼看全"不批就开不了工"。**不发件的判断依据**：F3-0027/0029/0030 三件均未回，20 分钟内我已发 4 封 ⇒ 在 FC 未回时追加是噪声不是推进；本轮价值全部落在自家工件。**结构校验**＝§13 表 20→23 行、`## 14` 与 `## 15` 标题各在位一次、剥 code span 后逐行 `**` 奇数**归零**、正文级重复行**归零**、546 行。**本轮零源码改动／零构建／零测试／零安装／零真实调用（0/99）。**
- 02:55–02:57 无新件。**实测自己"实施零未知"这句话，结果补出两处真未知并一次修好**：①`vitest.config.ts` 全文实读＝**只有两 alias + `test.include`、没有全局 `environment`** ⇒ 新测试文件首行 `// @vitest-environment jsdom` 是**承重行**（漏写则 import 阶段即红），且 `mount` **仓库里根本没有导出辅助**（probe/foundation/host 三处各自内联 `createRoot`+`act`+私有 `cleanup`）⇒ 只能自带四件、**不得**为省事往共用文件加东西；②对话视图 `view.tsx:100-105` 有**三道串联防占位分支**（`selectedConnectionId`→`agent`→`selectedSessionId`），`.agent-thread` 在第三关之后 ⇒ **把 §14.16 的单字段要求一般化为"三门槛"**：任一缺失则"无 select""无 failed 徽标"整片空转通过（这是 §14.4 那类坑的根因版，宜升 FE 通用条款）。③顺带确证 §14.13 配方成立：`ConversationThread` 自己在 `:78/:98` 包了 `AssistantRuntimeProvider` ⇒ **测试侧不需要包 provider、不需要 mock assistant-ui**。④探针三件 DOM 桩**分档**：交互包只 import react+契约（可不带），对话包确实 import `@assistant-ui/react`（`:2-3`，与探针同批）⇒ 按承重照抄；**本树无 `node_modules` 故无法实证哪个 API 被调**，窗口纪律禁装 ⇒ 结论诚实停在"保守照抄、删桩留待开工首步实测"。新增 §14.17、`reuse.md` 夹具行补文件头要求，发 **F3-0030（NOTE）**（含三家共用的"先凑三门槛、再断不存在"次序）。**本轮零源码改动／零构建／零测试／零安装／零真实调用（0/99）。**
- 02:51–02:54 无新件（C-0049 后全队静默、F0 仍 @00:41）。**把 F3-0027 的必办项从结论升级为可写码的确证，并自查出第八例空断言**：`grep sessionId` 在交互包**零命中**＋`AgentSnapshot` 同含 `selectedSessionId?: string`（`:66`）与 `interactions`（`:70`）＋`AgentWorkspaceSnapshot.agent?: AgentSnapshot`（`:105-111`）⇒ 门 4 修复＝**一行 filter、零新 prop/契约**，且连接器（codex `:132`、pi `:127`）**本就按 sessionId 转移交互状态**、UI 侧读取点全仓唯一 ⇒ **门 4 与 F1 完全解耦**（对 FC 的意义＝不必挂 P2-1 义务）。但**由字段可选性**推出新坑：夹具不设 `selectedSessionId` ⇒ 过滤恒空 ⇒ 门 4 三段全绿而什么都没测 ⇒ §14.3 门 4 行就地加**三段式＋夹具必设该字段**（与门 2 占位分支、门 3 空区域同病第三处；方法论：断「集合变空」先问它是否本来恒空）。另确证**加过滤不影响门 3**（`shell.tsx:40` 计注册视图数非卡片数）。**顺手又修一处自家工件缺陷**：全表查重查出 §14.2 有一条 bullet 整行重复两次（01:22 那次 python 追加未验锚点所致），已删重并复扫正文级重复归零。新增 §14.16、reuse.md 夹具行同步补该要求，发 **F3-0029（NOTE）**（明写「不重开 F3-0027、F1/F2 无需动作、C 无待裁项」以免成噪声）。**本轮零源码改动／零构建／零测试／零真实调用（0/99）。**
- 02:47–02:50 收件 **C-0049（`reply_to: F3-0028`）＝F3-0028 全采**：C-0047 §2 的坐标更正范围扩至"**全部 P2 批（P2-1/P2-2/P2-3）**"、并命 FC 折 P2-1 草案时按此更正 ⇒ **F3-0028 闭合**（发出约 2 分钟即裁，本会话最快一次）。登记口径差异：C 用"**穷举三家**"而非我建议的"**所有 P2-x** 全称量词"——语义已闭合，但**下次新增批次仍需重列**，故 §14.15 规则留作 FE 通用条款建议、不再单独追。**随后转做"维护记录"这条明确职责**：`reports/reuse.md`（复用账，wake_mechanism 点名的继承工件）自 01:19 未更新，其**最后一行仍写着三处已被现行修正案作废的结论**——①测试落点 `apps/desktop/src/`（A3 已改 `renderer/`）、②"不为测试改 `vitest.config.ts` 的 include/别名"（A2/A3 已给三处授权行，惟**全归 F0 写域、F3 仍不自己改**）、③"断言绑英文产品文案"（§14.10 已限缩为 F3 两包、命中 workbench/boundary 须用中文）。⇒ 同属我此前 hunt 的"**同源不一致**"类（§10.4 vs §14.3 是同一个病的显症），**且发生在我自己的权威账本里**：后继会话的 first-glance 读物若带旧字面，等于把已废方案重新注入。处置＝**四处定点更正**（python 按唯一锚点替换、逐条打印命中数=1，避开中英引号歧义）＋新增 **补记行二**三行：五门夹具装配（§14.13）、右栏收起可断言机制（§14.10，含"不复用 `shell.tsx:138`"负面登记）、会话串卡与重复提交（§14.14，明标"**须新写、无可复用先例**"＋"不自扩范围"前置）。表结构校验＝全部行 9 列（10 个 `|`）齐。**本轮零源码改动／零构建／零测试／零真实调用（0/99）。**
- 02:40–02:44 先收尾自己的工件：**修掉两处 `**` 不闭合**（§13 装配配方行、§14.13 勘误段各一处），根因是**行内字面 glob `plugins/**` 的尾部 `**` 被当作粗体定界符**；处置＝把 glob 收进反引号，随后用"剥 code span 后逐行计数"的脚本全表复扫得 **483 行零奇数**（结构完好：47 个 `##`/`###`、§15 标题在位）。**教训补一条**：写含 glob 的中文正文时，`**` 结尾的通配符必须进 code span，否则不是"难看"而是**会吃掉后半句的粗体并让相邻行成对失衡**——这类自伤只有在全文计数时才暴露。收件：新件仅 **F1-0013**（cc 含 F3）——其归属判断正确但 **P2-1 落点写字面 `apps/desktop/src/`**，顺此查出**第六例字面漂移的新形态**：`C-0047 §2` 的坐标更正句只列 P2-2/P2-3，而 `C-0046` 末行把裁决范围写到 P2-1 ⇒ 更正未送达；且 `src/` 字面就在 A1 原文里，照抄 A1 者必然带出。本树实测 `renderer/` 不存在、`vitest.config.ts:8` 仍 `src/**` ⇒ 步 6 后该处测试静默不跑。新增 §14.15（含"排比列举的作用域以范围句为准、不以更正句为准"的可复用规则），发 **F3-0028（NOTE）**请求把 C-0047 §2 补齐为"所有 P2-x"（一处措辞、不动裁定），并对 F1-0013 的未来 30 小时 timestamp 做无动作旁证登记。

- 02:36–02:39 无新件、F0 仍 @00:41。**转攻自己尚未压测的断言面**：先确证门 4 可实施（`contract.ts:46` 有 `sessionId` ⇒ 过滤是自家包内的事），再实读交互视图全文＋`model.ts:75`，**查出两件**：①**我自己的覆盖面核算漏了交互包**——门 4 的本质是改 `view.tsx:52`、门 5 择乙则要改 `:19-21`，而 `agent-interactions/**` **从未预签**（FC-0013 §3 只签对话包且用途是 P2-3 撤 `SessionBrowser`）；②**门 5 字面版是空断言**（`respond` 仅由 onClick 触发、全文无 effect/定时器/重试），而**可假版现在是红的**（视图无在途门控＋`model.ts:75` 直通不去重＋`respond` 不改 state ⇒ 连点两次=两次调用；`inFlight` 只管连接）。⇒ 新增 §14.14，**就地更正 §13 两处同源结论**（data-testid 行"⇒ 零扩预签行段"作废、五门表"五行清单"标注不完整），发 **F3-0027（QUESTION）**：必办项＝增列交互包 `:52`，另请 FC/C 就门 5 择甲／乙（F3 倾向乙并给出不扩范围的条件）。**本类第七次，且两条均由自查得出。**
- 02:31–02:35 收件 **C-0048（`to: F3`，`reply_to: F3-0024`）＝归因更正全采**：loop-registry v28 条目已就地改为"非任何 F3 件带出；失效面=任何一方凭记忆写路径字面"，可复用规则登记生效；**F3 实测该 v28 原文确认（不采信转述）**，F3-0023/0024 双闭。收 F2-0011（to C）判与 F3 无关跳过，但**顺手用它的教训自查自家 25 件报头**：`owner_generation` 全为 1、`base_sha`/`reply_to` 齐全（一次 `grep -L '^timestamp'` 假警报源于我自己漏了 `- ` 前缀，已纠——工具也要验）。**随后自查出 F3-0025 自身的一处引用错误并即刻发 F3-0026 勘误**：我让 FC 照 `fe-prep-research.md:38-39` 写 import 字面，而该列是**"新归属"（文件归哪个包）**、且**已被 A1 作废**（A1＝不迁入 `plugins/**`）⇒ 新增 §14.13 勘误段（含"开工首步实测"替代句式＋A2 只改 alias 目标未提键名的实测引文＋§五 向 F0 的提问因 `:27` 括注自答而撤回），并**就地改掉 §13 装配配方行里同源的错误子句**；本件未影响 §二 配方与 §三"乙案不降级五门"两项结论。
- 02:25–02:29 范围与落点两问闭合后，**把最后一块实施风险（五门到底喂不喂得进 jsdom）核完**：实读 `agent-sessions.test.ts:1-40`＋`extensions/agent-sessions/src/model.ts:4-13`＋两视图 props＋`entry.tsx:8-10`，得**三步装配配方且全用既有先例**，`model.ts:13` 更证**整个 `agent` 切片逐字来自假 client ⇒ 五门输入字段全可控**；随之确定**"乙案不降级五门"**（应用门的"注入已选连接"障碍在 jsdom 里就是 `selectConnection()` 公开方法），并查出第五次"字面漂移"隐患（新测试 import 须取 F0 表 `:38-39` 的迁移后坐标，注意其包名与目录名不同；实测 5 个既有测试全用 `../../../extensions/**`）与一处需 F0 确认的约束豁免（`:27`"宿主不得 import 业务源码"是否豁免测试）。新增 §14.13、§13 加"装配配方"行，发 **F3-0025（FACTS）**；本轮另确证 `fe-prep-research.md:60` 已含"测试 import 路径同步"，故该项**不是新缺口**（负面结果也登记）。§0–§14.12 未改。

- 02:20–02:23 收 **C-0047**（`reply_to: F2-0010, F3-0023`）：§1 全采我的 F3-0023——"以 **A3 坐标为准 `renderer/`**"、"C-0046 裁决语义全部不变"，§2 命 FC 折批文统一用 `renderer/` ⇒ **§14.12 与 F3-0023 就此闭合**（补 (6) 闭合标注），且因 C 选的是我预备的"回一句以 A3 为准"口径，**`decisions.md:50` 旧字面不再请求更正**；顺带发现 §1 的**归因句为假**（称旧坐标来自 F3-0022，实测该件路径字面零命中、其 `src→renderer` 一句是反向澄清）→ 补 **(7) 新缺陷类型"裁决件里的归因句也会错"**，发 **F3-0024**（NOTE，唯一请求＝改一句根因，因本件已入 loop-registry、根因挂错人则下次无人防）；§13 两行改为"已闭合"终口径并新增"他人稿件里的归因句也须核"一行。**另修一处自伤**：上一轮插入 §14.12 时误删了 `## 15.` 标题（变更记录失去归属），本轮恢复并补本条。**P2-2 范围与落点两问均已闭合，F3 侧开工前唯一未闭合项收敛为"FC 批文成文 + F0 复活"**。§0–§14.11、§13 其余行未改。
- 02:16–02:18 收 **C-0046（乙案全采）+ `decisions.md` HD-001-C-022**：①就地给 §14.11 补 **(5)【已闭合】**，记裁决四条（vitest 半边／应用半边推专批／台账如实记部分满足／deepEqual 与 `main.ts:109` 登记）；②新增 **§14.12**——查出 C-0046 §1 与台账 `:50` 的落点字面是 A3 已作废的迁移前坐标 `src/`，且这次带"APPROVED + 耐久台账 + P2-1/P2-3 同构适用"三重放大，发 **F3-0023** 只请改一个词（不请复议语义），并登记"字面漂移"类缺陷第三次与可复用规则；③本轮结论：**P2-2 范围已定（五门只做 vitest 半边），开工前唯一未闭合项降为 FC 批文成文 + F0 复活**。§0–§14.11 其余内容未改。
- 02:02–02:15 新增 **§14.10**（门 3 源级验证：`shell.tsx:75` 才是区域 inert、`:138` 是全页先例的错归、空区域本就 inert 的空断言坑、`boundary.tsx:5` 共用 `role=alert`、`shell.tsx:86` 第二个合法 select）→ 就地重写 §14.3 门 3 行与 §14.4；查出自家报告内**两张五门表打架**（F3-0008 曾指向旧的 §10.4）→ 给 §10.4 加废弃警告、§14.2 改指 §14.3，发 **F3-0021**；再查出**五门的应用半边落在 A1/A2/A3 之外且不在 F3 写域**（FE 门实为 vitest + 5 个 `.mjs` 应用门 + `test:electron`，`main.ts:108` 证明其停在占位分支）→ 新增 §14.11 发 **F3-0022** 请甲/乙裁决；§13 替换项并为"共 5 处分三批"。
- 00:57 追加 §10（C-0026 §4 要求的 F1/F3 汇合结果 + §6 五项验收可断言化）、§5.3 加裁决指针。
- 01:02 追加 §11（P2-3 预签行段 + 删块安全性依据 + styles 交错风险 + FC-0013 裁决后的定稿口径），并把变更记录移至文末。前手章节（§0–§9）与 §10 内容未改。
- 01:06 追加 §12（`approval` kind 只由 Codex 产生 + 全仓零 kind 分支 + 夹具含义 + gate 谓词风险提请），变更记录顺延为 §13。§11 与本消息无关的历史条目未改。
- 01:09 §8 第 3 项改为指向 BE 权威启动脚本并登记 R2 未开放事实、新增第 5 项（`wire/1` 登记时机的 FE 立场，F3-0011）。§0–§7、§9–§12 未改。
- 01:11 新增 §13（FC-0015/C-0033 后的已锁定口径速查表，含"派生 contract_version 需复核夹具断言"的自留提醒），变更记录顺延为 §14。§0–§12 未改。
- 01:17 追加 §14（P2-2 验收可实现路径：`test.include` 硬约束 ⇒ "包内测试"不可执行；给出两条确切断言文件路径 + 五门断言手段先例 + 两处假绿坑 + FE-PREP 后 `vitest.config.ts` 别名归属待声明），变更记录顺延为 §15。§0–§13 未改。
- 01:22 受 BC-0014 触发做交互视图首次全文实读，就地更正 §14.3 门 2/门 5 与 §14.4 第二条（三处外推错），新增 §14.6 记更正与方法论；同件发出 outbox/F3-0014 勘误。§0–§13、§14.1/§14.2/§14.5 未改。
- 01:27 收 FC-0016 + C-0036（cc F3：A1 批准、测试口径登记、`data-testid` 禁加），裁定入册 §13 新增 4 行；发现 mtime 时序问题（F3-0014 晚于 FC-0016 落盘 76 秒，而 FC-0016 §5 要求"原文并入"），遂发 outbox/F3-0015 请求一次表格替换。§0–§12、§14 未改。
- 01:32 补核 FE-PREP 步 2 与 A1 的一致性：证实 `vitest.config.ts` 两条 alias 的目标路径**必随步 2 消失**（`fe-prep-research.md:13,:56`）⇒ §14.5 第二条由条件式改事实式，§13 增 1 行；同时确认 F2-0009 的二选一已被 A1 裁结。发 outbox/F3-0016（转告 F2 + 请求把 alias 重指向预授权为显式批文行）。§0–§13 其余行、§14.1–§14.4/§14.6 未改。
- 01:39 收 C-0037（A2 批准，alias 两行显式入批文、归 F0、"零改动"限缩）⇒ §13 alias 行改写为已裁事实并新增 1 行登记 A2 的连带后果；新增 §14.7 量化失效面（14 处契约行号引用 → 10 个符号的再锚定表；`extensions/**`→`plugins/**` 是整文件机械移动，故视图行段引用含 F3-0009 预签段均存活）并发 outbox/F3-0017 提请批文内契约引用改符号锚定。C-0038/C-0039 判为 BE-only（to/cc 无 F3）跳过。§0–§14.6 未改。
- 01:44 查 A1/A2 未覆盖的第三处同类缺口：`vitest.config.ts:8` 的 `test.include: ['src/**…']` 必随步 6 `apps/desktop/src→renderer` 改，而 A2 只授权第 5–6 行两 alias（证据：F0 计划 §1 行 1 与步 6 自列"需同步 vitest.config"）；并推出**静默**的一半——A1 §2 的 P2 落点 `apps/desktop/src/agent-<包>.test.*` 是迁移前坐标，照抄进批文会让新测试一条都不匹配且因 `renderer/` 内仍有 8 个匹配文件而不报错。新增 §14.8，发 outbox/F3-0018（两项最小解法，均不改裁定；声明归属自律与越界即撤回）。§0–§14.7 未改。
- 01:47 收 **C-0042（修正案 A3，reply_to: F3-0018）——两项全采**：`test.include` 升为第三处显式授权行（步 6 同批、归 F0）、"零改动"限缩为"除上述三处外"；A1 的 P2 坐标正式更正为 `apps/desktop/renderer/agent-<包>.test.*`（C 明写"你 §二 判断成立"）；`tsconfig`/`build.mjs` 同步判属原批文 §6 既有范围；复活批文＝FC-0012+A1+A2+A3。据此就地更新终口径：§13 两行（落点行改迁移后坐标、归属行改"只许三处"）、§14.1 加"当轮证据非待办"注、§14.2 两条路径改 `renderer/` 并记初稿曾写 `src/`、§14.8 标【已闭合】。**本轮不发新消息**：C-0042 已 to FC 并 cc F0/F1/F2/BC，且明写"无需补消息"，F1/F2 已直接收到同一更正，补件只会成为噪声。C-0041 判为 BE-only 跳过。
- 01:53 对 `extensions/agent-conversation/src/view.tsx`（107 行）做**首次全文实读**（§14.6 方法论对门 1/2/4 的再次适用），查出**两处新错＋一处性质误标**：门 1 的"`[role=alert]` 为 null"必假红（`:81` 断线必有 alert，而 unknown 正是断线态），改为 `:80 data-status`+`:83` 文案+无 `[data-status=failed]`+alert 语义四条，并确证"unknown≠failed 在消息级**尚未成立**（`:53` `failed||unknown` 合并支、`:62-64` 无 error 渲染）"⇒ 门 1 是新行为；门 2 必假绿（`:85-88` 对 model 无专属抑制，且 `:102-104` 占位分支内本无 select ⇒ 空夹具空转通过），补"先断 `.agent-thread` 存在"并要求 FC 在**路 A（F1 契约义务）／路 B（`:85-88` 新过滤、需另授权）**择一；门 4 的 `:105` 由"不重挂载先例"改标为**会话级重挂载**证据。另提结构性核算：FC-0013 §3 预签 `view.tsx:10-40` 实文是 `SessionBrowser`，五门落点（`:53`/`:80-83`/`:85-88`/`:94-95`/`:105`）基本不在其内。新增 §14.9、**就地更正 §14.3 门 1/门 2/门 4 三行**（FC 抄的正是此表）、§13 替换项行合并为"共 4 处分两批"；发 outbox/F3-0019。BC-0019 判 BE-only 跳过；F0 仍无进展（00:43 后）。§0–§12、§14.1/§14.2/§14.4–§14.8 未改。
- 02:02 把 §14.6 方法论用到**最后一扇未实读的门**（门 3 右栏收起，唯一断言落在别人写域的一扇）：实读 `workbench/src/model.ts`(68)、`workbench/src/shell.tsx`(152)、`shared/boundary.tsx`(5)、`shared/registry.ts`(16) 与 `foundation.test.tsx:100-141`。查出**一处先例挂错主体＋一处假绿**：①`:138` 断的是 full-page 时**整个** `[data-testid=workspace]` 被 inert（源文 `shell.tsx:119`），与区域收起无关 ⇒ "收起后 `[data-region=right]` 带 inert"**本仓无既有断言先例**，F3 首提；②`shell.tsx:75` 的 `!has[name] || collapsed` ⇒ **空区域本来就 inert**，只写后半句即空断言 ⇒ 须**先断右栏内容存在**、且**先 `open` 再 `collapse`**（`model.ts:36` 会 un-collapse）；③"`WorkbenchShell` 需 `model`+`commands` 两个 prop"（`:26/:31`）是最易漏的实施前提；④portal 挂载（`:145`/`:15-20`/`:92`）⇒ "收起≠关闭"不能靠 DOM 消失来断。另查出**两条跨门规则**：`boundary.tsx:5` 崩溃回退与 `conversation/view.tsx:81` 断线告警同 `role=alert` ⇒ 计数式断言须按文案区分；"产品视图是英文"须限缩为 F3 两包（workbench/boundary 是中文），且 `shell.tsx:86` 的"移动…"下拉是全仓第二个合法 select ⇒ 门 2 必须限域。新增 §14.10、**就地更正 §14.3 门 3 行与 §14.4**（FC 抄的正是这两处）、§13 替换项行改"共 5 处／三批"；发 outbox/F3-0020。收件：C-0043/BC-0020/H-0010 **全为 BE-only**（cc 有 FC 无 F3）跳过，登记一事——三件均 pin `wire/1（正式）`，与 §13 口径一致。F0 仍无进展（00:43 后）。§0–§13 其余行、§14.1–§14.3 门 1/2/4/5 行、§14.5–§14.9 未改（§14.9 末条"本轮不推翻"已加 01:56 更正注）。
- 02:08 写 F3-0020 时顺手核引用，查出**我自己埋的更危险的一处**：报告里其实有**两张五门表**，而 **F3-0008 曾请 FC"把 §10.4 抄进批文"**、§10.4 标题也写着"供 FC 直接贴入"——但 F3-0014/0015/0019/0020 四次勘误**全部只改在 §14.3**。⇒ 若照 F3-0008 的指引抄 §10.4，**四次勘误等于没发生**（源头选错，比 F3-0015 的时间差更严重）。就地处置：§10.4 表头加醒目**废弃警告**并逐条列出按字面抄会踩的四缺陷（门 1 中文外推必假红／门 2 未限域必假红且缺前置存在断言会假绿／**门 3 两表测的根本不是同一件事且本表那句是空断言**／门 5 两半混一条且另一半归 F1），表**不删**只标历史；§14.2 两条"文件→门"映射由 §10.4 改指 §14.3。发 **F3-0021**（自纠＋声明责任在 F3，并请 FC 裁门 3 语义 A 空区自动收起／B 收起≠关闭，F3 建议 B 但不代定）。§0–§13 其余行、§14.1–§14.10 未改（除 §14.2 两条映射行）。
- 02:15 查 C-0045（02:09，BE-only 跳过）时顺出 **P2-2 最大的未登记面**，新增 §14.11 并发 **F3-0022（QUESTION）**：①全队 root 门绿态 `20F/1465P/33S` **纯 Python**，FE 不在该账本 ⇒ P2-2 绿态无人作证；FE 入口离散——vitest（`include` 仅 `src/**`，A1/A2/A3 只作用于此）**之外还有 5 个 `.mjs` 真启应用的门 + `test:electron`**，均不受 `test.include` 影响；②C-0026 §6 每门要求的"产品进应用门"确有实体（`scripts/test-agent-shell.mjs` + 探针本体 `electron/main.ts:100-112`），但**两处都不在 vitest 收取范围、不在 A1/A2/A3 已裁落点、也不在 F3 写域** ⇒ §6"后者不以前者替代"**目前只有一半有落点**；③`main.ts:108` 断 `.agent-placeholder` 含 `Choose a connection` ⇒ **现有应用级门恰停在 `conversation/view.tsx:102` 占位分支**，不注入已选连接就永远进不了对话线程 ⇒ 门 1/2/4 的应用半边**现结构下不可表达**；④反向风险：`test-agent-shell.mjs:18` 的 `deepEqual` 是形状锁，探针加字段即把一扇现有绿门判红（同 A2/A3 类，第三个文件）。**顺得正面收获**：`main.ts:109` 的 `[data-region="right"] [role="group"] button` 才是门 3"收起前断右栏有内容"的对口选择器先例（远胜我误挂的 `foundation.test.tsx:138`），且其 'Requests' 是英文**视图标题**而非中文区域标签，反向旁证 §14.10(4)。请 FC 裁**甲**（扩授权到 F0 两文件＋解决夹具）／**乙**（本轮明做 vitest 半边并改写"后者不以前者替代"），F3 倾向乙并声明最坏是"不写"。收件 C-0045/BC-0022/H-0011 全 BE-only；C 在 C-0045 §3 亲写"**FE-PREP（F0）为当前全队关键路径**"＝与我 status 关键路径判断一致。§0–§14.10 未改。
