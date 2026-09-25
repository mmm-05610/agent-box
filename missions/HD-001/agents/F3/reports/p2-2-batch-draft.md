# P2-2 批文草案（F3 供稿，供 FC 一次成文）

- id: F3-DRAFT-P2-2
- from: F3
- to: FC
- status: 草案／非批文——裁定权在 FC＋C；本件只把已裁口径与已核证据组装成可贴文本，**不新增任何裁定**
- base_sha: 85cc3cd01497bb185be417a38dbeeeca4edb08e6（**行段引用以此为准；clean baseline 到手后按 §3 首步实测复核**）
- contract_version: wire/1
- 依据：C-0026 §6／C-0036（A1）／C-0037（A2）／C-0042（A3）／C-0046＋C-0047（乙案与落点，＝`decisions.md` HD-001-C-022）／FC-0013 §3／FC-0015／FC-0016 §4–§6
- 取代：F3-0008 §三、F3-0013 §三/§四、F3-0014、F3-0019、F3-0020 五处**逐条替换**（本件已折入）；若本件与 §13 表冲突，**以 §13 为准**

## 0. 为什么由 F3 供稿

FC-0016 §5 已命"五门断言表与两处防假绿注意**原文并入** P2-2 批文"。但该表的终稿分散在四批勘误＋三件未回消息里，"原文并入"实际要求 FC 自己做组装与去重。本件把装配做完，FC 只需**删改与签发**。F1 已有 P2-1 草案先例（C-0049 提及），故 F3 同法供稿，不越界。

## 1. 范围（乙案，已由 C 裁）

1.1 P2-2 **只做 vitest 半边**：新建 `apps/desktop/renderer/agent-conversation.test.tsx` 与 `apps/desktop/renderer/agent-interactions.test.tsx`，实现 §4 五门断言。
1.2 **应用半边整体推后续专批**（`electron/main.ts:100-112` 探针、`scripts/test-agent-shell.mjs`、"注入已选连接"的夹具基础设施——三处均 F0 写域，且不在 vitest `include` 内）。
1.3 **乙案不降级五门**：jsdom 里 `selectConnection()` 等服务方法是公开 API，五门的实质断言面不因缺应用半边而缩减；推迟的只是"再去真应用跑一遍"这层外部性。
1.4 台账如实记：P2-2 对 C-0026 §6 为**部分满足**，不得宣称覆盖。
1.5 P2-1/P2-3 同构适用（坐标按 C-0049 已扩至全部 P2 批）。

## 2. 授权写域（**三项增列，缺任一项对应门不可开工**；原第 4 项＝门 5 择一已于 04:16 由 F3 自撤回，见 2.5）

2.1 新建两测试文件（路径见 §1.1）。
2.2 **增列** `plugins/agent/interactions/src/view.tsx`（原 `extensions/agent-interactions/src/view.tsx`；迁移后坐标按 `fe-prep-research.md:15`"agent-{sessions,conversation,interactions} → `plugins/agent/*`、一一对应机械移动"推出，**仍属 §3.1 首步实测对象**——F3 不以推导代替实测）**的 `:52` 一行** —— 门 4 是**改码**不是断言：`state.agent?.interactions ?? []` 无 sessionId 过滤 ⇒ 需加一行 `.filter(item => item.sessionId === state.agent?.selectedSessionId)`。可实施性与 F1 **完全解耦**：`AgentInteraction.sessionId` 与 `AgentSnapshot.selectedSessionId` 同在一份快照；**（04:36 补强）本门过三问，且"终态卡不会被下层清掉"已由仓内既有测试 `apps/desktop/src/agent-pi.test.ts:281` 背书；`:52` 经 grep 复验为全仓唯一生产读取点（详见研究记录 §14.22）**；连接器（codex `client.ts:132`、pi `client.ts:127`）本就按 sessionId 处置交互；全仓 UI 侧读取点唯一；加过滤**不影响门 3**（`shell.tsx:40` 计注册视图数、非卡片数）。
2.3 **门 1 拆两半**〔⚠ **05:14 二次缩窄：1b 亦整体撤回 ⇒ 门 1 归零授权**，见 §2.3b／研究记录 §14.24〕（⚠ **03:43 由 F3 自查更正，见 F3-0033／研究记录 §14.19**：原稿此处写"增列 `:53`——门 1 的真实落点"，该前提经回源**证伪**并撤回。**撤回理由要两道域一起读，防只查其一就把本项捡回来**：`RunStatus` 的**类型域**含 `unknown`（共 7 值），但两连接器的**生产者值域**都不产它（codex `client.ts:34`＝completed/failed/running；pi `client.ts:36`＝cancelled/failed/completed，未映射时不写＝undefined）⇒ 拆 `:53` 生产上零可见变化）：
- **2.3a（零新授权）**：`plugins/agent/conversation/src/view.tsx` 现有 run/连接级句柄即断言对象（`:69-70`、`:80`、`:83`）——夹具设 `run.status='unknown'` ＋断连，四条断言照 §14.3 门 1 行执行。**批文措辞＝"验证既有行为"，不是"新行为"**（本门现状即绿）。
- **~~2.3b（需增列行号）~~ → 05:14 整体撤回，本项不再请求任何授权**（原文保留作证据；见研究记录 §14.24／F3-0038）：真正的生产可达缺陷在**同一条 `status` 链的末支 `:54`**——pi `client.ts:36` 在 `stopReason` 未映射/缺失时把消息 `status` 写成 `undefined`（`AgentMessage.status?` 为可选字段，符号锚定），`view.tsx:51-53` 三支皆不匹配 ⇒ 落进 `:54` 渲染为 `complete/stop`；同屏 `:80` 徽标却是 `unknown`。⇒ **增列该文件 `:54` 与 `:48-56` 调用点**（两处均不在 FC-0013 §3 预签的 `10-40` 内）。修复面**须限定"该会话最后一条 assistant 消息"**：中间态消息（如 `stopReason='toolUse'`）渲染 `complete` 是正确的，运行进度由 `runs` 承担。**撤回理由（05:14 新查，两条独立）**：①**结构不可行**——`convertMessage` 是模块级导出函数、签名只接 `message: AgentMessage`，全仓唯一生产调用点＝`:71` 把它交给 `useExternalStoreRuntime` ⇒ 它在参数与闭包两处都拿不到"是否末条 assistant 消息"，而本项要求的修复恰恰限定"只改末条"；真要修得改 `:71`（包一层闭包或预映射），属设计改动、可能触 F1 装配面。②**范围不属本门**——C-0026 §6 门 1 原文只有 unknown≠failed，且它在运行/徽标层已成立；本缺陷是 F3 自查所得，按 F3-0035 立的规则（待裁项须回得上游原文）不应请 FC 背书我的扩范围。另附**行段算术更正**：`convertMessage` 实为 `:42-55`（status 四支 `:51-54`），我原写的 `:48-56` 一头含进无关的 `:48`、另一头越出函数含进 `:56` 的 `TextPart`。⇒ 新挂 `[F3-NEW-1]` 候后续专批；**FC 待裁授权 3 条 → 2 条**。
- **撤回项**：原稿的"拆 `:53` 合并支"**不进本批**——`message.status` 在两个连接器里**永不取 `unknown`**（codex `client.ts:34` 消息级只产 `completed`/`failed`/`running`；pi `client.ts:36` 只产 `cancelled`/`failed`/`completed`/`undefined`），全仓 `'unknown'` 的生产者只写 `runs[].status`、`interactions[].state`、`sessionList` 三类字段 ⇒ 拆 `:53` 零可见变化。若 FC 仍要保留，只能记为"防御性/契约完整性"，**不得写成用户可见修复**。
2.4 **门 2（原"路 A／路 B 择一"已由 F3 自查撤回择一，见 F3-0032）**：路 A＝"由契约义务保证 `agent.options` 永不含 `model`"**不成立、已撤回**——两个连接器都**合法地**把 model 作为受支持选项发布（codex `client.ts:303-304`、pi `client.ts:315` 皆 `availability:'supported'` 且带 `values`），契约亦定有 `setOption`（符号锚定：`AgentClient.setOption` 与 `AgentSessions.setOption`；@85cc3cd 行号 `:90`/`:124` **仅作证据**，FE-PREP 步 2 拆契约后失效 ⇒ 批文一律用符号名，见 §14.7）；采路 A 等于要求 F1 删掉既有连接器能力，超出 C-0026 对 F3 的"不得扩展 Profile/Provider/Model"之意（该禁令约束的是 **F3 的 UI**，不是契约的表达能力）。⇒ **路 B＝唯一可行路**：在 `plugins/agent/conversation/src/view.tsx:85-88`（原 `extensions/...`）新增按 `option.id` 的抑制，**该行段不在 FC-0013 §3 预签的 `10-40` 内 ⇒ 须显式授权**。另记：`view.tsx:85-88` 现条件为 `availability==='supported' && values?.length` ⇒ **门 2 今天是红的（对话区确实会渲染 model 下拉），它是新行为、不是回归锁**。**二者不择，门 2 只能写成空断言**——`:85-88` 现文对 `model` 无任何专属抑制。
2.5 **门 5 取甲案（04:16 自我撤回乙案 ⇒ 不再是择一项）**：甲＝按 C-0026 §6 字面语义作**视图侧回归锁**（`respond()` 计数不增＋终态卡不消失），并在台账记「重复提交防护不在五门夹具路径内」。⇒ **F3 撤回原乙案**（改 `interactions/view.tsx:19-21` 加在途门控），两条实测理由：(i) **生产不可达**——codex `client.ts:261` 卫句 → `:278 route.used = true` → `:279` publish `responding` → **`:280` 才出现第一个 await**，pi `client.ts:294→:301→:302→:303` 同形 ⇒ 连点两次的第二次**必 throw**，不存在双发窗口。我上一版所写「连点两次＝两次调用打到连接器」字面不假（service 层 `model.ts:75` 确为直通），但其后果**不是重复提交**，而是第二次 throw 经 `:21` 的 `.catch` 落到 `:47` 弹一条 `role=alert` 的 `Interaction no longer pending`＝**呈现瑕疵、非数据瑕疵**。(ii) **超出门 5 原文义**——原文＝不「自动」重发，防连点是另一件事，系 F3 在 §14.14 混入的范围扩展。另更正一处：我先前写的「字面版结构上必然成立＝空断言」**亦作废**——`respond` 只由 onClick 触发这一事实正是该回归锁要锁的对象，被测物是视图自身（生产代码）、假件只是被调用方 ⇒ 属正当回归锁，非桩自证（判据见报告 §14.21(3)）。**若 C/FC 仍要处置那条假告警**，请另立独立小项并单批 `:19-21` 写域，F3 不夹带进本批。（详见报告 §14.21／F3-0035）
2.6 **零扩面声明**：除 2.2/2.3/2.4（路 B）所列行段外（2.5 已撤回 ⇒ **`interactions/view.tsx:19-21` 不再请求授权**），F3 不请求任何源码写域；`styles.ts` 零授权维持 FC-0013 §3 结论；**禁加 `data-testid`**（FC-0016 §6）。

## 3. 开工首步实测（**批文勿预写迁移后字面**）

clean baseline 到手后、写断言前，F3 自行实测并在冲突时停手回报：
3.1 `plugins/**` 三处目标的实际路径（对话视图／交互视图／sessions model／connections registry 工厂）。
3.2 三条 import 的实际可达性与 `vitest.config.ts` 当时 alias 现值——**含 alias 键名是否仍为 `@extensions/…`**（A2 只说目标随步 2 改指新 `contracts/` 域，未说键名不变）。
3.3 契约引用一律**符号锚定**（`AgentSnapshot.selectedSessionId`、`AgentInteraction.sessionId/kind` 等），不用行号——步 2 按域拆分使 `contract.ts` 行号全部作废（§14.7 备好 13 符号映射表；⚠ 03:49 更正计数——该表已从 10 补至 13（`setOption` 两处见 §14.18(5)／F3-0032，`AgentMessage.status?` 见 §14.19／F3-0033）；**引用行号一律带文件名**，§14.7 消歧条）。
3.4 探针三件 DOM 桩（`ResizeObserver`/`scrollTo`/`scrollIntoView`）能否删：本树无 `node_modules`、窗口纪律禁装 ⇒ 先按承重照抄，删桩属可选优化。
3.5 ~~`view.tsx:54`＋`:48-56`~~／`:85-88` 行段（⚠ **05:14：门 1b 两行段整体撤回** ⇒ 请求写域只剩对话包 `:85-88`＋交互包 `:52`）（⚠ **04:20：`:19-21` 已随门 5 定甲案移出请求写域**，见 §2.5／F3-0035）若因整文件移动或 §2 改动而漂移，以符号与相邻文本再锚，不按记忆施工（⚠ 03:43：`:53` 已随门 1 撤回项移出本批，见 §2.3；新增的 `:54`／`:48-56` 待 FC 增列）。

## 4. 五门断言（终稿；详表见 conversation-research.md §14.3）

| 门 | 断言要点 |
| --- | --- |
| 1 unknown≠failed | 夹具 `run.status='unknown'` **且** `connection.status!=='connected'`；断 `section.agent-conversation .agent-run-state` 的 `data-status==='unknown'`、`[role=status].agent-notice` 文案 `Run outcome unknown after disconnect.`、**不存在** `[data-status=failed]`；若有 `[role=alert]` 其文案必须是断线语义（`:81` 断线时必渲染 alert ⇒ **不可断 `[role=alert]` 为 null**）。**本门零授权**（05:14：1a 是对既有行为的回归锁、1b 已整体撤回，见 §2.3／研究记录 §14.24）。断言形状可复用仓内先例 `apps/desktop/src/agent-ui-probe.test.tsx:55-61`（表驱动、直接调 converter 断 `.status`），**但字段名必须从探针的 `state` 换成生产包的 `status`——不改名则四支全落末支，表驱动会"全绿"而一次真实映射都没测**（第 21 例） |
| 2 无 model 入口 | 夹具须**故意**在快照里放**两个** `availability:'supported'` 且带 `values` 的选项：一个 `model`（照 codex `client.ts:303-304` 的形状）＋一个非 model 的 `probe`，否则"无下拉"是**因为没数据**而非因为被抑制。**先断 `section.agent-conversation .agent-thread` 存在（仅作可达性前置），再把三条计数断言的作用域一律写死为 `section.agent-conversation`**：①该容器内 `querySelectorAll('select')` 长度 **== 1**；②存活 `select` 所属 `<label>` 文案 == `probe` 的 `title`；③`AgentSnapshot.options` 仍含 `model`（**数据侧断言，不是 DOM**：门 2 成立的形态恰恰是 model 的 label **不**出现在 DOM 里，把③写成 DOM 断言反而必红）。⚠ **03:57 自我更正（见 §14.20／F3-0034）**：本行原写"再断**该容器内** select 长度为 0（等价 `.agent-options` 为 null）"两处皆错——(a) "该容器"最近先行词是 `.agent-thread`，而 `view.tsx:85` 的 options 条与 `:89` 的 `.agent-thread` 是**兄弟**、其子树内永无 `select` ⇒ 该断言**恒绿＝空断言**；(b) 在 `:86` 内层链加过滤时 `.agent-options` div 仍渲染为空壳 ⇒ 断 `为 null` **必假红**。⇒ **禁写"等价"、禁把 `.agent-thread` 当计数容器**。本行**原写法里"并 `await service.setOption('model', …)` resolve"这半句亦作废**：`model.ts:76` 只是把 `setOption` 透传给 client，测试里那个 client 是**我自己造的假件** ⇒ "resolve" 由夹具自证（第 9 例空断言）；真连接器对不在 `values` 内的值**抛** `Option unavailable`（codex `:312`、pi `:324`）。依赖 2.4 |
| 3 右栏收起 | 真 `WorkbenchShell`，**`model` 与 `commands` 两个 prop 都要传**；`addView` → **先 `open` 再 `collapse('right', true)`**（`model.ts:36` 的 `open()` 会 un-collapse，反序即失效）；**收起前先断右栏确有内容**：断 `[data-region=right]` 的 `textContent` 含**夹具自注册视图**的文案（空区域本来就 inert ⇒ 否则空断言）〔⚠ **08:41 勘误·见 §14.25／F3-0039**：旧措辞 `section[data-region=right] .agent-conversation` **永不命中**——`agent.conversation` 注册在 `region: 'main'`，且 FC-0017 §P2-2 第 4 点撤 `right` 注册后右区无产品视图 ⇒ 必假红；夹具须自带视图，先例 `foundation.test.tsx:103-112`〕，收起后断 `[data-region=right]` 带 `inert`。**不可断"DOM 消失"**：`ViewSurface` 用 portal，收起不换 host——实例仍在正是"收起≠关闭"的机制 |
| 4 跨会话不串卡 | 同一 service 切 `selectedSessionId` 重渲染，三段式：B 线程零卡 → 切回 A 卡 `id` 不变 → **夹具必须显式设 `selectedSessionId`**（该字段可选 ⇒ 不设则过滤后恒空，三段全绿而什么都没测）；〔04:36 §14.22：A 卡**须放终态**（`resolved`/`expired`），只放 pending 会被断连改标、产生"消失＝过滤生效"的误判；终态留存已由仓内绿灯测试 `apps/desktop/src/agent-pi.test.ts:281` 证明〕依赖 2.2 |
| 5 不自动重发／终态保留 | 夹具 `respond()` 计数＋抛错或回 `expired`。视图侧"卡转终态仍显示"已是既有行为（`:24-25` 无条件渲染 `<article>` 与 `<small>{item.state}</small>`）⇒ 属回归验证；"终态条目是否留在数组"由连接器决定，属 F1 写域，F3 不代改——但**本轮已在生产者侧确证**（codex `:132`/`:279`、pi `:127`/`:302-307` 一律 `.map` 原位替换、不移除条目）。重复提交一半**依 2.5 定为甲案**：夹具计数属视图侧正当回归锁；连接器的 `route.used` 同步卫句在五门夹具路径之外，门 5 **不声称覆盖、亦不因未覆盖判红**。 |

## 5. 通用注意事项（建议升为 FE 三家共用条款）

5.1 **可达门槛**：凡断言对象位于占位分支之后，夹具须先满足该视图全部可达条件、并**先断该对象存在**，再写任何"不存在／为空"断言。对话视图是**三道串联防**（`:102` `selectedConnectionId` → `:103` `agent` 快照 → `:104` `selectedSessionId`），`.agent-thread` 在第三关之后。
5.2 **一般判据**：凡断言形如"某集合变空"，先问"它是否本来就恒空"，并检查夹具是否显式提供使非空成立的那个输入。
5.3 **`role=alert` 按文案区分**：`boundary.tsx:5` 的加载失败回退与 `conversation/view.tsx:81` 的断线告警同 `role` ⇒ 只按 role 选择器断言会互串。
5.4 **`select` 断言必须限域**：全仓有两个合法 `<select>` 来源（`interactions/view.tsx:29` 的 `fields[].choices`、`shell.tsx:86` 的"移动…到"下拉），对整棵 root 查 `select` 必假红。
5.5 **语言混用**：英文产品文案只覆盖 F3 两包（`Request stop`／`Stop requested`／`Running`／`Result`）；workbench/boundary 宿主文案是中文（`shell.tsx:12/:121`、`:86`、`boundary.tsx:5`），探针示例也是中文（`probe:26 执行中`、`:29 停止`）⇒ **门 3 命中 shell 区域标签须用中文**，不可笼统写"P2-2 全部英文"。
5.6 **文件头四件（承重、自带、不外溢）**：`vitest.config.ts` **无全局 `environment`** ⇒ 首行 `// @vitest-environment jsdom`（漏写则 `document` 未定义、**import 阶段即红**）；`IS_REACT_ACT_ENVIRONMENT = true`；`createRoot` 内联＋本文件私有 `cleanup`/`afterEach`（**仓库没有任何导出的 mount 辅助，不得为复用往共用文件加 helper**）；按 §3.4 决定是否带三件 DOM 桩。
5.7 **不需 runtime provider**：`ConversationThread` 自包 `<AssistantRuntimeProvider>`（`view.tsx:78/:98`）⇒ 测试侧 `mount(<Conversation service={sessions}/>)` 即可，不需包 provider、不需 mock assistant-ui。
5.8 **夹具配方**：假 `AgentClient`（照 `agent-sessions.test.ts:7-23`）＋**真** `createAgentConnections`/`createAgentSessions`（`:26-33`）；决定性证据 `model.ts:13`——整个 `agent` 切片逐字来自假 client ⇒ 五门每个输入字段可控、零新机制、零跨写域。

## 6. 验收口径

6.1 串行全绿（`vitest run --maxWorkers=1`）；**root 门纯 Python，不替 FE 作证**，故 FE 绿态只由本批 vitest 结果与后续应用专批作证。
6.2 附加核验：`git status` 确认**无新增 `plugins/**/*.test.*`**（A1/A2/A3 验收项）。
6.3 `vitest.config.ts` 只许改三处（A2 两 alias ＋ A3 的 `test.include`），**全归 F0 写域，F3 不自行改**。
6.4 台账记"部分满足"，措辞见 §1.4。

## 7. 未决项（等 FC／C 落笔，F3 不催办）

**量纲说明（05:03，防被误读成与 §13 的"3 条"互相矛盾）**：本清单按"**等谁落笔**"排，不是"授权行数"——①＋③合计＝研究记录 §13"开工前置三"的**三条授权行**（门 2 `:85-88`／门 4 `:52`；**门 1b 已于 05:14 整体撤回 ⇒ 授权现为 2 条**，见 §2.3b／§14.24）；④是"§5 是否升为 FE 通用条款"的措辞归属问，⑤是 F0 的上游前置，二者**均不计入授权数**。

① 2.4 路 B 的 `view.tsx:85-88` 授权行（**路 A 已撤回，不再是选项**）；② ~~2.5 甲／乙择一~~ → **04:16 已自定甲案、乙案撤回，本项从待裁清单移除**；③ 2.2 交互包 `:52` 增列，与 ~~**2.3b 对话包 `:54`＋`:48-56` 增列**~~（**05:14 整体撤回**，见 §2.3b／§14.24）（⚠ 03:49：原 2.3 的 `:53` 已撤回，见 §2.3／F3-0033；2.3a 零授权，不需要批文行）；④ §5 是否升为 FE 通用条款（与 F3-0020 §4 两条并列）；⑤ F0 FE-PREP 复活并给出 clean baseline——**⑤ 是 §3 全部实测的前置，也是 F3 施工的真正起点**。

F3 维持 RESEARCH_ONLY：不写源码、不装／不建／不测、零真实调用（0/99）。
