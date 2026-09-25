# FE-SESSIONS 批文就绪清单（预研记录，非批文、非实施）
2026-09-23 00:48 +0800 · F2 · base=85cc3cd · 更新依赖：FC-0012 §3、C-0016、C-0022、BC-0006 §5

批文到达后按此顺序执行；任何与本清单冲突的中央裁决以批文为准。

1. **接收基线**：F0 HANDOFF→FC 集成发布后，从批文指定来源接收 clean baseline SHA（不从 f0 树 dirty 差量取货）；本树 rebase/对齐到该 SHA 前不动。
2. **整包落位（Phase 1 语义）**：extensions/agent-sessions → plugins/agent/sessions（F0 七步之 3 已由 F0 机械迁移完成的，F2 不再移动，只做包内改造）；F2 职责域=plugins/agent/sessions/** + 包测试。
3. **SessionBrowser 拆分（FC-0010/C-0016 §6）**：连接段→plugins/connections（F1 属主）；会话段留 sessions 并加两级分组投影（项目组+「独立会话」组；方案 A 专用 workspace 不列为项目）。
4. **契约扩展实施（C-0016 §5，候正式记录+contract_version）**：AgentSessionInfo+workspaceId?/pinned?；归档/重命名 UI 不做。
5. **状态栏徽标（FC-0010 归属）**：sessions 包注册运行/待审批徽标组件，经 UIContribution slot=statusbar；**推导口径=E-0005/S-0005：扫描全部 runs＋未 settled approval 交互（不只末 run），不得用 execution.state 单字段判定待审批**；不索新聚合接口（S-0005 facade 纪律），从既有 sessions.list/history 面自推导。
6. **独立会话（方案 A 收口，BC-0006 §5 候裁参数）**：workspaces.open 建专用目录；根路径预计=data-root 下、FE 持清理责任、清理=archive 留痕（wire 无物理删除，S-0004）——批文若钉死则照批执行。
7. **五态/恢复语义不变**（phase0-proposal 原结论）：断连保留最后快照+错误行；run unknown 不推断；切会话≠取消。
8. **提交纪律**：仅批准路径逐批提交；不 push、不 add -A；测试串行；Electron/构建重门需 C 重任务许可；零真实调用（预算在 C）。

## 基线代码实貌核对（85cc3cd 只读实测，2026-09-23 00:49）

- `extensions/agent-sessions/` 仅两文件：`src/entry.ts`(8L)+`src/model.ts`(78L，`createAgentSessions(lifetime, connections)` 会话服务)。F2 域规模小、手术式改动即可，无整包重写。
- `SessionBrowser` 实体在 `extensions/agent-conversation/src/view.tsx:10`（消费 AgentSessions 服务；sessionList 五态 loading/partial/error/ready+空 已在 view.tsx:30-34 实装，与 phase0-proposal 空态结论一致）；连接段与会话段耦合点=同文件头部连接选择区（迁 F1 connections 时切分）。
- 批文精确路径候选（供 FC/C 拟定 FE-SESSIONS 批）：`plugins/agent/sessions/src/{entry.ts,model.ts}`+新增分组投影/徽标文件+`plugins/agent/sessions` 包测试；对 `plugins/agent/conversation/src/view.tsx` 的改动属 F3 域，需跨包批准（F3 属主或联署）。

## model.ts 实读：F1/F2 接缝与批次顺序风险（85cc3cd，00:50）

现 `createAgentSessions`(model.ts:5-78) 是**连接持有型门面**：`clients Map/connect()/reconnect()/selectConnection()` 持有 AgentClient 并包 AgentConnections——恰为 PLAN Phase 2「F1 连接服务接走 sessions 中 client持有/当前选择/重连」的对象。**含义**：
1. F2 域净剩=会话投影与操作（refreshSessions/openSession/send/stop/respond + 五态 publish）＋两级分组；F1 批与 F2 批**同文件 model.ts**，须串行或一份联署批文钉死切分线，避免双写。建议向 FC/C 申报：两批合并为一个接缝批或明确先后（F1 先抽连接段，F2 后接会话段；SessionBrowser 拆分同理）。
2. `newSession()` 现无 workspaceId 形参（委托 AgentClient 契约）；方案 A 落地需契约面（contracts/agent）给 create 路径传专用 workspace——与 AgentSessionInfo+workspaceId?/pinned? 同批变更，候 C 正式记录 contract_version。
3. 广播/publish 单快照模型（state+listeners）适配两级分组投影，无需新状态库。

## F3-0006 相关增量（00:52 收讫，CC 链）

- **agent.open 归属**：F3 依 FC-0010"命令由属主包注册"提议 Phase 2 将 `agent.open`（现 conversation/entry.tsx:12-15 注册并 `workbench.open('agent.sessions')`）**迁给 agent-sessions（F2）**。F2 侧就绪：入口命令+视图 id 归 sessions 包与本清单第 3 步（SessionBrowser 拆分）同批做即可；候 FC/C 定稿后计入批准路径（新增文件面：sessions 包 entry 注册命令，改 conversation/entry.tsx 撤除——后者属 F3 域，批文需含 F3 联署段）。
- F3-0006 §5 验收补口（产品夹具进应用门）与 §4 停止差异均落 F3/连接器域，F2 无动作。

## 测试归属事实（85cc3cd 实测，00:52）

- 会话测试现仅一份：`apps/desktop/src/agent-sessions.test.ts`（F0-0003/F2-0003 已请求随包迁入 plugins/agent/sessions，属 F0 FE-PREP §3 "5 件随包"清单）；FE-SESSIONS 批文到达时**以迁移后位置为准**，F2 新增测试只写包内；`agent-pi/agent-codex.test.ts` 属连接器域（H/F1 线），非 F2。
- 若 F0 未随包迁（差量核对时确认），F2 批需含该测试文件迁移动作并请 FC 补路进批准清单。

## C-0026 预裁决对齐（00:53 收讫，本清单以下列口径为准）

1. **批次序=串行 (b)**：FE-CONNECT（F1 主写，model.ts 连接段→plugins/connections/service）先行；**FE-SESSIONS（F2 主写）在后**：model.ts 会话投影+两级分组+SessionBrowser 会话段。各批文钉精确行段，窗口内另一方零写→第 3 步拆分表述按此序执行，F2 等待顺序改为「FE-PREP 集成→FC Phase 2 批文提案→C 逐批签发（CONNECT 先）」。
2. **agent.open 归 F2 定案（C-0026 §3）**：随 SessionBrowser 拆分迁入 sessions 包，F3 撤注册，FC 定精确路径。
3. **starting 可停止差异（§4）**：本批不动、UI 维持保守现状；最小契约扩展（stoppable/stop 前置条件）由 F1/F3 汇合提出、C 随 Phase 2 契约批记录——F2 不伪造可停止态，与会话投影无冲突。
4. **方案 A 收口已裁（C-0025 §5）**：根=data-root 下、FE 持清理责任、archive 即够；normalizedPath 命名随 Phase 2 批文钉。
5. 验收补口（§6，五项应用门）属 conversation/interactions 批，F2 会话列表测试仍在包内自配。

## 契约面实读（packages/agent-ui-contracts/src/contract.ts，85cc3cd）

- `AgentSessionInfo`(L23) 现无 workspace/pinned 字段；`AgentClient.newSession(): Promise<string>`(L85) 与 `AgentSessions.newSession(): Promise<void>`(L119) **均无 workspace 形参**——方案 A 的 create 路径要传专用 workspaceId，签名必须动（候选：`newSession(target?: {workspaceId: string})`，默认=独立会话专用 workspace，由 F2 服务层解析后经参数下传连接器）。
- 该文件 FE-PREP 后位于 `contracts/agent`（D1 双运行时 id 不变）；契约改动=公共契约变更，**只由 C 批文落地**（C-0016 §5），F2 侧引用此为最小变更建议，随 FC Phase 2 汇总提交。

## F3-0007 联署回执（00:56，F2-0008 已发）

agent.open 迁移写权切分获 F3 联署：F2 注册（sessions entry）+F3 撤除（conversation entry 两行）；F2 已表态首选**同批一次提交**（零缺位帧、零双注册），顺序兜底案交 FC 裁。F3 Phase 2 申报表中 #4 交互包 statusbar 待回应计数与 F2 徽标同槽位——施工时注意 slot 组件顺序，属 FC 汇总项，非冲突。

## FC-0013 定稿对齐（00:58 收讫；C-0028 六项预裁认可）——P2-3 FE-SESSIONS 最终范围

1. **P2-3 范围（F2 单一执行写入者）**：两级分组投影；契约扩展实施（AgentSessionInfo+workspaceId?/pinned?、newSession workspace 形参、runs[].stoppable?——三项同批，C 记录派生 contract_version）；agent.open **同批一次提交**迁移（sessions entry 注册 + conversation entry 撤两行/F3-0007 预授权，命令 id+"Agents"标签不变）；SessionBrowser 拆分收尾（会话段入 sessions、连接段归 connections——若连接段搬迁落 P2-3 需 F1 行段预签，候批文草案确认）；包测试随包。
2. **前置链**：FE-PREP 集成 RECEIPT → clean baseline 分发 → 各树对齐后**复核行号**（F3-0007 §五口径）→ C 逐批签发 P2-1→P2-2→P2-3，批间无并行写。P2-1（F1 抽连接段，sessions 转 thin 委托）与 P2-2（F3 对话内联卡等）完成前 F2 零写。
3. 文案口径：产品面英文、workbench 中文（FC-0013 §4）——F2 会话列表/空态新增文案用英文，与现 view.tsx 词表一致。

## FC-0015/C-0033/C-0034 收口（01:14 收讫，全部 cc 知悉类，F2 无 outbox 动作）

1. **闸谓词定稿（FC-0015 §1/§2）——直接约束 F2 徽标推导**：谓词钉死为「任一 run.status ∈ {starting, running, stop-requested} ∨ 任一 interaction.state ∈ {pending, responding}」，扫描**全部会话全部条目**；kind 不参与判定（按 kind==='approval' 字面读的写法被否决）。命名避开 `settled`，用 `hasAwaitingInteraction` / `hasOpenRun` 风格——F2 会话列表"待响应"徽标与 P2-3 投影 helper 以此为准；批文到达时以 P2-1 落地后的实际函数名/行号复核为唯一事实源，不沿用本清单此前任何近似表述。
2. **approval 夹具形状（§3，属 P2-2/F3）**：Codex 形（choices approve/deny、`{kind:'choice'}`、decision∈choices）。F2 无动作；两级分组投影如遇含 approval interaction 的会话，徽标口径按 §1 谓词而非 kind。
3. **F0 停滞（FC-0015 §4 + C-0034）**：C 已呈用户请求重启 F0 会话；FE-PREP 恢复点=f0 树 @7fcdfdf6、步 1/7 完成、余 6 步在册。FC-0013 批次前置不变；若 C 另定接续（移交/分步），"clean baseline 对齐+行号复核"的基线来源随之改，F2 等待姿势不变（旧 baseline 只复核行号、零写源码）。
4. **C-0033（BE 线，无 F2 动作）**：H 执行 B-HARNESS-PI-001；contract 正式登记时点=pi R0+R1 绿态 checkpoint，CP1 独立。窗口纪律与预算零消费保持。

## F3-0013 关联风险与 F2-0009（01:24 已发 FC）

- F3-0013 证明当前配置下"包内测试"静默不跑（include 只盖 apps/desktop/src；extensions/** 零测试——F2 本树独立复核一致）。但 F0 fe-prep-research §3 的"随包走（包内 vitest）"清单（含 agent-sessions.test.ts→plugins/agent/sessions，FC-0012 §3 已采纳）以包内测试机制会落地为前提。两前提若不在批文层合流，FE-PREP 后随包 5 件可能从"能跑"变"静默不跑"。
- F2-0009 请 FC 二选钉死：FE-PREP 负责各包可运行 test 接入并实际验收 vs 随包 5 件暂留 apps/desktop/src。F2 的 P2-3 新测试落点跟随裁定，两者皆备（包内 or `agent-sessions.test.ts` 家族），本清单"包测试随包"表述以批文最终落点为准。

## 测试落点裁定收编（FC-0016→C-0036=decisions HD-001-C-015，01:31 收讫；F2-0009 就此关闭）

1. **裁定**：FE-PREP 修正案 A1——5 个随包测试**不迁入 plugins/\*\***，保留 `apps/desktop/src/` 文件名不变、仅 import 重指向；`vitest.config.ts` 零改动（归属 F0，改动仅经显式批文行）；验收附加 git-status 核验（无新增 `plugins/**/*.test.*`）。**Phase 2 通用口径：P2-3 新测试=`apps/desktop/src/agent-sessions.test.ts` 家族**（本清单此前"包测试随包/F2 新增测试只写包内"表述作废，以此为准）。P2-3 批文输入将含：既有 agent-sessions.test.ts 的 import 重指向核对 + 新增断言同文件/同家族。
2. **断言写法约束（FC-0016 §6 + F3-0014 §二第3条）**：data-testid 禁加；会话列表断言按 view 既有 className/role（interactions 视图有 `data-interaction` 句柄先例，sessions 段实施时实读 `agent-sessions/src/view.tsx` SessionBrowser 部分再定，不外推）。
3. **方法论入册（F3-0014 §四，F2 自受）**：凡写入批文素材的断言必须先全文实读被测视图本体，禁止由 examples 或前手摘要外推——P2-3 提交批文输入前对 sessions view/entry/model 逐文件复核。
4. F3-0014 顺带确证 interactions 无 sessionId 过滤（view.tsx:52），属 F3 自闭环修复+对 F1 的终态条目保留接口约束——与 F2 两级分组徽标无冲突；F2 徽标谓词扫描口径（FC-0015 §1）本就要求全量扫描，不受该过滤修复影响。

## P2-3 批文输入：SessionBrowser 全文实读段表（extensions/agent-conversation/src/view.tsx @85cc3cd，107 行，01:32 逐行读）

- **归属切分**：连接段=L14–27（F1/connections 域）；会话段=L28–38（F2 拆分目标）；L11–13 `perform/actionError` 脚手架两段共用，批文需写明拆分后各自持有副本或抽包内共享件（F2 倾向各段自含、零新抽象）。
- **可断言句柄（无 data-*，全部 class/role/aria）**：`section.agent-panel.agent-sessions`；`.agent-session-heading`（h2 "Sessions"+"New session" 按钮，disabled 门=connected）；五态 L30–33：`[role=status].agent-empty`("Loading sessions…")/`.agent-notice`("Only part of the history is available.")/`[role=alert].agent-error`("Session list failed. Refresh to try again.")/`.agent-empty`("No sessions yet. Start one above.")；`.agent-session-list button` 条目=`<strong>{title}</strong><small>{日期|detail|id}</small>`，选中项=`aria-current="true"`。
- **英文词表现状**（新增文案须同源）：Sessions/Connections/New session/Refresh/Reconnect/Loading…/Connecting/No agent connection is enabled…/Choose a connection/Choose a session。
- **FC-0015 §1 谓词的源级互证**：view.tsx:70 与 :51 的活跃 run 集=`starting|running|stop-requested`，与闸谓词钉死口径完全一致（unknown/cancelled/failed 为终态；`unknown` 走 L83 独立 notice）。F2 徽标实现直接复用该三态+interaction.state 谓词，无需自造状态表。
- 两级分组（workspace 层）落 L28–38 重构：会话条目按 `AgentSessionInfo.workspaceId`（待契约批）分组，"New session" 语义=当前分组下建独立会话（方案 A 专用 workspace）；连接段 L14–27 原样留给 P2-1 搬迁，本批不动其行。

## C-0037 修正案 A2 收编（HD-001-C-016，01:37）

- vitest.config.ts 两条契约 alias 随 FE-PREP 步 2 同批显式改指新 contracts/ 域 re-export 入口（F0 批文显式授权行；A1"零改动"→"除本两行外零改动"）；"旧路径保留转发"否决。F0 复活批文文本=FC-0012+A1+A2。
- C-0037 §3 正式确认 F2-0009 已由 A1 关闭、F2 勿再候裁——本清单 P2-3 测试落点口径最终定格：`apps/desktop/src/agent-sessions.test.ts` 家族。P2-3 批文到达时行号复核需含 P2-1 落地后 view.tsx/model.ts 新基线（85cc3cd 段表仅为 85cc3cd 事实）。

## F3-0017 引用写法收编（01:43，NOTE 知悉类）

- 步 2 契约文件**按域内容拆分** ⇒ 本清单所有 `contract.ts:<行号>` 引用在 FE-PREP 后失效；P2-3 批文输入一律改**符号锚定**：`AgentSessionInfo`（原 L23）/`AgentClient.newSession`（原 L85）/`AgentSessions.newSession`（原 L119）——行号仅作 85cc3cd 当轮证据附注。
- 视图包为 git mv 一一对应移动**不改行号** ⇒ 上文 SessionBrowser 段表（view.tsx:10–40 等）迁移后存活，无需重锚；仅需在 P2-1 落地后复核 model.ts 连接段被抽走后的新基线差量。

## A3 收编——测试落点坐标更正（C-0042=HD-001-C-018，01:49；覆盖本清单前两处"apps/desktop/src/"定格表述）

- **P2-3 新测试最终落点=迁移后坐标 `apps/desktop/renderer/agent-sessions.test.*`**（A1 的 `src/` 字面系迁移前坐标，clean baseline 下 src 已不存在且不会报错——静默不跑面已由 A3 消除）；`test.include` `src/**`→`renderer/**` 为 vitest.config.ts 第三处显式授权行（F0 步 6 同批改）。
- 既有会话测试迁移后= `apps/desktop/renderer/agent-sessions.test.ts`（步 3 留应用门、步 6 随目录改名，仅 import 重指向）。
- F0 复活批文文本=FC-0012+A1+A2+A3。contract_version `wire/1` 已正式转正（C-0040 §3）。
- 本清单此前所有"`apps/desktop/src/agent-sessions.test.ts` 家族"读作"应用测试目录在 clean baseline 上的实际路径"。F2 无新增诉求；P2-3 批文输入按符号锚定+迁移后坐标书写。

## F3-0019 对 P2-3 的连带提醒（01:55 收编，NOTE 类，F2 无新请求）

- **同文件双批面**：`agent-conversation/src/view.tsx` 中 L10–40=SessionBrowser（P2-1 连接段 L14–27 + P2-3 会话段 L28–38 拆分对象），L42–106=对话线程（P2-2 五门落点 :53/:80-83/:85-88/:94-95/:105）。FC-0013 §3"预签 view.tsx:10-40"不覆盖五门——F3 已请 FC 逐段核。F2 侧无冲突（P2-3 只动 10–40 归属，不碰 42+），但 **P2-3 批文的精确路径必须写明拆分只迁 SessionBrowser，禁止顺手触碰 convertMessage/ConversationThread/Conversation**，避免与 P2-2 改动在同一文件互相漂移。
- **施工顺序事实**：P2-2（先于 P2-3）会在 :53 拆 failed/unknown 分支、可能新增视图文案；P2-3 到达时本清单 SessionBrowser 段表仍存活（10–40 未被 P2-2 预签面触碰），但 L42+ 行号会因 :53 拆分下移——P2-3 只引用 ≤40 行段与符号名，不受影响。
- 门 1 教训入我的测试写法纪律：断言先确认夹具装配进了真实区域（如先断 `.agent-thread` 存在再断内容），占位分支会导致"内容不存在"类断言假绿——P2-3 会话列表测试同样先断 `section.agent-sessions` 在场。

## F3-0020/0021 收编（02:12，门 3 勘误类，F2 无动作；两条通则入 P2-3 测试纪律）

- **通则 1（空断言假绿）**：断言"状态变化后特征"前必须先断"变化前内容在场"——门 3 教训=空右栏本就 inert。P2-3 对应面：徽标/分组断言前先断 `.agent-session-list button` 非空且含目标条目；aria-current 断言前先断选中态确实建立。
- **通则 2（夹具装配完备性前置断言）**：先断被测区域根节点在场（`section.agent-sessions`/进入会话后 `section.agent-conversation`）再断其内内容，防占位分支空转通过（F3-0019 门 2 教训同源）。
- F3-0021 自纠=其报告内旧五门表勿被引用，F2 从未引用其表格，无涉。FC 若最终并入版本有疑，以 F3 最新 FACTS 件为准——F2 的 P2-3 输入同理只认最新收编段，本清单历史段若与后件冲突**以件号/入册先后为准，禁用报头 timestamp 判先后**（F3-0037 证伪：179 件中 11 件报头时间晚于落盘、74 件无 timestamp；本行按 F3-0037 就地修正，原句"以时间后到者为准"作废）（本行即冲突裁决规则）。

## F3-0022/C-0046 乙案收编 + F2-0010（02:18）

- **C-0046 乙案**：P2-2 五门本轮只做 vitest 半边，应用半边（main.ts 探针+test-agent-shell.mjs+已选连接夹具）推后续专批；台账如实记部分满足。**P2-1/P2-3 同构适用**→ F2 的 P2-3 验收口径=应用测试目录内 vitest 半边；不照抄 C-0026 §6"各跑一遍"；应用半边与夹具基础设施归后续专批（届时可能列 F0 写域授权行）。
- 既有风险登记：`test-agent-shell.mjs:18` deepEqual 形状锁（探针加字段必同批改）——F2 不触碰该文件，仅知悉。
- **F2-0010 已发**：C-0046 §1 的 `apps/desktop/src/` 字面与 A3 迁移后坐标冲突，请 FC 按 A3 统一/澄清；F2 按 renderer 坐标书写 P2-3 输入不变。

## C-0047/F2-0011 收口（02:25）

- C 勘正确认 P2 测试坐标统一 **A3 renderer/**（F2-0010+F3-0023 双眼防措辞回带获 C 计入 loop-registry）；乙案语义不变。F2 P2-3 输入口径冻结：`apps/desktop/renderer/agent-sessions.test.*` + 契约符号锚定 + 只迁 SessionBrowser + vitest 半边。
- **gen 笔误披露**：F2-0009 与 F2-0010 报头 `owner_generation: 2` 均为同一笔误（误从 F0 gen2 带入），F2 实际自 F2-0004 TAKEOVER 起恒为 **gen 1**、单代单写者；已在 F2-0011 向 C 更正登记。旧消息按不可覆盖原则不改，以此附注为准。

## C-0048 规则收编（02:30）

- 全队规则生效：**批文/裁决中的路径字面落笔前必对照现行权威坐标；`apps/desktop/src/**` 出现于稿件先对 A3（renderer/）**。F2 P2-3 批文输入与本清单未来更新均按此自检。
- 根因口径更新：src/ 字面首次入裁=C-0036 §2（A1 原文），非转述沿用于 F3；F2-0010 的坐标复核方向仍成立。等待 C 对 F2-0011（gen1 更正）的登记回执。

## F3-0030 两条 FE 通用条款在 P2-3 的适用核答（02:58 件，03:05 收编）

- **条款一（可达门槛）F2 侧核毕**：SessionBrowser 的会话列表渲染不落在 Conversation 三关占位分支之后（:14 顶层即出面板），但**自带同型门槛**：`:30–33` 五态全部经 `agent?.sessionList` 可选链、`:34` 列表为 `agent?.sessions.map`——`agent` 快照缺失时容器 div 在场而内容恒空。⇒ P2-3 任何"列表为空/某条不在"的否定式断言，夹具须先建 agent 快照（selectedConnectionId+client 连接）并**正断言 `.agent-session-list` 内已知条目在场**，再写否定式。两级分组落地后同理：先断目标分组头存在，再断组内内容。
- **条款二（文件头四件）F2 侧口径**：新增视图类测试文件首行 `// @vitest-environment jsdom`+`IS_REACT_ACT_ENVIRONMENT`+内联 `createRoot`+本文件私有 cleanup，四件自带、**不往共用文件加 helper**；DOM 三桩（ResizeObserver 等）——拆分后的 sessions 视图只 import react+契约（SessionBrowser 现文不触 assistant-ui），**不照抄桩**，开工首步实测是否需要。既有 `agent-sessions.test.ts` 为纯逻辑测试不受影响。
- F3-0030 §二末段"不确定就开工首步实测"已并入 P2-3 执行计划第 0 步。

## F3-0034 第三次勘误收编 + 两条通用判据入 P2-3（04:10）

- 件体为 P2-2 门 2 断言写法勘误（`.agent-options`/`.agent-thread` 兄弟嵌套、恒绿假断言、"等价 null"假红），**涉 F3 行域，不改 F2 任何已定口径**；F2 仅 cc，按规则以报告收编、不回 outbox。
- **通用判据 A（阳性对照，F3 注明"供 F1/F2 直接抄"）**：断言"某元素不出现／某集合为空"时，同容器内必须再断一条阳性对照（应当出现的那个确实出现）。⇒ 直接约束 F2 的 P2-3 否定式断言：五态"列表为空"须先正断 `.agent-session-list` 容器在场+已知条目在场（与 F3-0030 条款一的两级分组版合并执行）；"某会话不在列表"须同夹具断另一已知会话在列表。
- **通用判据 B（假红新类）**：`X 为 null` 与 `X 内计数为 0` 在 X 渲染成空壳时不等价；写"等价"前先举一个使两者真值不同的渲染场景。⇒ **F2 侧实测对号**：SessionBrowser `:34` 的 `<div className="agent-session-list">` 为**无条件渲染**（`agent?.sessions.map` 于其内），空列表时=空壳 div 在场。故 P2-3 任何"无会话"断言只能写 `容器内 button 计数 == 0`，**禁写 `.agent-session-list` 为 null**（必假红）；"ready-空"态另有独立 `<p className="agent-empty">` 可正断文案。此两处形状差异已钉入断言模板。
- 判据 B 方向为假红、与 F3 前十一例假绿相反；F2 已把两判据并入执行计划第 0 步自检清单（开工首步实测依旧）。

## P2-3 批文输入 · 终版冻结摘要（07:15，**本节为准**；与上文任何段落冲突时按 F3-0037 规则以本收尾节为最新入册）

> 用途：C 签发 FE-SESSIONS 批文与 F2 施工时只对照本节；上文各段仅保留论证轨迹。批文与本节冲突时以批文为准。

### A. 边界与写域
1. 迁移对象**仅 SessionBrowser**（view.tsx L10–40；其中 L14–27 连接段归 P2-1/F1、L28–38 会话段=P2-3 目标）；**禁止触碰** convertMessage（:42–54）/ConversationThread/Conversation——同文件双批面防漂移（P2-2 五门落点 :53/:85-88/:94-95/:105 均在 F3 段）。批文精确路径须写明此排除条款。
2. 包本体：extensions/agent-sessions（现仅 src/entry.ts 8L + src/model.ts 78L，视图寄居 agent-conversation）。
3. agent.open 迁移写权切分：F2 注册（sessions entry）+ F3 撤除（conversation entry 两行），**首选同批一次提交**（零缺位帧），顺序兜底案候 FC 裁。
4. 职责域外零写入；不扩 Profile/Provider/Model/配置管理；starting 可停止差异（§4）本批不动。

### B. 测试坐标与验收
1. 坐标（A3/C-0042）：`apps/desktop/renderer/agent-sessions.test.*`；任何 `apps/desktop/src/**` 字面落笔前先对 A3（C-0048）。5 件包测试按 A1 留应用测试目录仅改 import；验收含 git-status 检查"无新增 plugins/**/*.test.*"。
2. 验收口径（乙案 C-0046/0049）：本批**只做 vitest 半边**；应用半边（main.ts 探针+test-agent-shell.mjs+已连接夹具）归后续专批；台账如实记部分满足；**不抄** C-0026 §6"各跑一遍"。
3. 契约引用一律符号锚点（AgentSessionInfo / AgentClient.newSession / AgentSessions.newSession；F3-0017）；view 文件 git-mv 后行号不变，本清单 SessionBrowser 段表仍有效，开工时对 clean baseline 复核一次。

### C. 行为口径
1. 状态徽标谓词（FC-0015/C-0033 钉死）：`hasOpenRun` = 任一 run.status ∈ {starting, running, stop-requested}；`hasAwaitingInteraction` = 任一 interaction.state ∈ {pending, responding}；**全 sessions 全条目扫描、不看 kind、不用 settled 措辞**；facade 不新增全局聚合方法（S-0005），徽标用既有 sessions 列表自推导。
2. 两级分组（独立/项目会话）：P2-3 定稿范围（FC-0013+C-0028）。
3. 方案 A：独立会话经 workspaces.open 用用户不可见专用目录、根置 data-root 下、FE 持清理责任、archive-only 无物理删除、根路径=调用方入参（S-0004/E-0005）。

### D. 断言纪律（F2 应用版，全部并入夹具模板）
1. **阳性前置**（F3-0030 条款一+通则 2）：任何否定式断言前，夹具先建 agent 快照（selectedConnectionId+connected）并正断 `.agent-session-list` 内已知条目在场；分组场景先正断目标组头存在；被测区域根节点（`section.agent-sessions`）存在性先行。
2. **阳性对照**（F3-0034 判据 A）："不出现/为空"断言必配同容器一条"应出现的确实出现"。
3. **空壳 div 禁断 null**（F3-0034 判据 B）：`:34` `.agent-session-list` 无条件渲染⇒"无会话"只能写容器内 button 计数==0，**禁**断容器为 null；ready-空态另正断 `<p.agent-empty>` 文案。
4. **文件头四件**（F3-0030 条款二）：新 DOM 测试文件首行 `// @vitest-environment jsdom`+`IS_REACT_ACT_ENVIRONMENT=true`+内联 createRoot+本文件私有 cleanup；**不建共用 mount helper**；sessions 视图不 import assistant-ui⇒DOM 三桩不照抄、开工实测。

### E. 开工第 0 步自检清单
①对 clean baseline 复核段表行号与符号锚点；②实测新测试文件是否需 DOM 桩；③路径字面 vs A3；④夹具按 D1/D3 预检（防恒绿/假红两向）；⑤收齐 C 的 F2-0011（gen1）登记回执与 FC 同批提交裁决（若未随批文给出）。

### F. 等待链快照（本节记录时点）
F0 会话候用户重启→FE-PREP 步骤 2–7→集成 RECEIPT→clean baseline 分发→f2 树对齐→P2-1（F1）→P2-2（F3，其授权现净余 2 条）→**P2-3 FE-SESSIONS 批文到 F2**。F2 侧输入冻结完毕，批文到达即可执行；零源码写入、零真实调用（0/99）不变。

## 冻结摘要·增补一（FC-0017/C-0050/C-0051=HD-001-C-023 收编，07:25 UTC 实测收件；与终版摘要并读，冲突以本增补为准）

1. **P2-3 范围以批准文本钉定**：①sessions/model.ts 两级分组投影（依 P2-1 门面）；②SessionBrowser 拆分收尾=conversation/view.tsx L10–40 撤除+**entry.tsx line4/10/12–15 撤除**（F3-0009 预签；行段**以 P2-2 集成后的文件实态复核**再锚定）+**agent.open 同 commit 迁移注册**（FC 采认 F2 同批方案，零缺位帧）；③**契约扩展实施随本批**：AgentSessionInfo+workspaceId?/pinned?、newSession workspace 形参——additive 可选已由 C 一次记录（C-023 §3），施工=实现侧落码，非契约再议；④方案 A 专用目录（根=data-root、FE 持清理、archive 留痕）；⑤测试 renderer/agent-sessions.test.*，同构乙案半边。
2. **§5 通用注意五条= P2 三批共用条款（C-023 §4 采认）**，并入本清单 D 节为 **D5**：可达门槛／空集判据（=D2/D3 已覆盖）／**role=alert 按文案断言**（P2-3 五态错误件断文案不依赖 role 属性存在性）／**select 限域**（sessions 视图无 select，知悉即可）／**语言混用**（新增 UI 文案与现英文保持一致，不引入中英混排）。
3. **签发流程与等待链更新**：F0 已复活（F0-0009，gen2，步 2/7 续作 @7fcdfdf 恢复点确认）→ FE-PREP 集成 RECEIPT → **baseline0 → C 当日签发 P2-1∥P2-2 并行**（两批文件零交集）→ 双 HANDOFF → FC 集成 → **baseline1 → C 签发 P2-3**。尾批（F3 死 CSS／F0 应用半边专批／[F3-NEW-1]）另立，不占 P2-3 范围。
4. **C-0050 授权口径**：import 重指向／测试发现路径／构建接线／A 类机械修正由 FC 自主协调登记——F2 施工期此类调整不再逐行往返 C；公共契约、范围变化、跨线语义、真实调用 grant、禁改面仍归 C。开工首步实测迁移后路径与 alias 现值（FC-0017 §流程 4，三批通用）已在本清单 E①/②覆盖。
5. **收件纪律**：三件均 cc/无 F2 应答义务，按 C-0050"待命期不发空转报告"仅报告收编、不发 outbox。F2 施工就绪态在 baseline1 前不再变更冻结内容；若批文与增补冲突以批文为准。

## 冻结摘要·增补二（C-0053 签发＋FC-0018 条款升格，07:53）

1. **baseline0=b3d8492b 已登记**（F0-0010 七步全绿、fc 树快进实测 clean）；**P2-1（F1）∥P2-2（F3）批文已发**，基线同 b3d8492b；F2 无应答义务。**F2 施工触发链**：双 HANDOFF→FC 集成→baseline1→C 签 P2-3。f2 树当前仍 @85cc3cd，**开工首步=快进对齐 baseline1**。
2. **§5 共用条款 5→7 条（FC-0018 依 C-0050 口径采认 F3-0034 两判据升格）**，本清单 D5 同步扩：
   - **⑥ 范围变更整表重跑**："他人增项改变批文范围时，可达性按新范围**整表**重跑，不只跑被裁行"⇒ P2-1 连接段/P2-2 对话段落地后，SessionBrowser 五态/分组的可达性表须对**集成后新实态**全表复核（并入 E①，由"复核行号"升为"复核整表可达性"——约束级=共用条款）。
   - **⑦ 容器断言先读 entry 注册点**："断言容器含某产品类名前，先读该视图的 entry 注册点（区域归属唯一书写处）"⇒ P2-3 拆出后 `section.agent-sessions` 的区域归属以 **agent-sessions/src/entry.ts 注册行**为准（拆分前寄居 agent-conversation entry:line4/10/12–15）；夹具装配先核注册链再写容器断言。
3. P2-2 批文含 F3-0032/0033/0034/**0039** 勘误链——与 F2 无冲突；F3-0039 为门 3 必红断言拦截（第十三次勘误），佐证 D 节判据体系有效。
4. 待 FC 集成 RECEIPT（baseline0 最终确认件）到达后，F2 可用 b3d8492b 做**只读**迁移实态预检（renderer 坐标/alias/文件布局），为开工第 0 步省时——不写树、不对齐，正式对齐留 baseline1。

## 增补二·预检结果（baseline0 只读实测 @b3d8492b，07:54——开工第 0 步 E①②③ 预清）

1. **尖端更正（C-0054）**：P2 开工基线以 fc 集成树尖端 **16398e7c**（lock 重生成、余逐字节同）为准；FC 集成 RECEIPT 候发。F2 对齐动作仍留 baseline1 后。
2. **顶层重排实测**：`extensions/` 已消失→`plugins/ + contracts/ + platform/ + tooling/ + products/`。F2 域新坐标=**plugins/agent/sessions/**{manifest.json,package.json,build.mjs,src/entry.ts,src/model.ts}；SessionBrowser 寄居 **plugins/agent/conversation/src/view.tsx**。批文/记录旧路径字面一律按此重映射（C-0048 自检已过）。
3. **段表存活确认**：baseline0 与 85cc3cd 的 view.tsx **逐行等同**（git-mv 保号实证）；SessionBrowser L10–40/五态 L30–33/无条件列表 div L34 原样。旧记录"总 107 行"系笔误，实为 106 行，无行移。
4. **vitest 实值**：include=`renderer/**/*.test.{ts,tsx}` ✓；alias 契约实值=`contracts/foundation/src/contract.ts` 与 **`contracts/agent-ui/src/contract.ts`**（旧 packages/*-contracts 坐标作废，E② 按此钉死）。
5. **测试文件就位**：`apps/desktop/renderer/agent-sessions.test.ts` 已在 include 内（A1+A3 兑现）；`agent-connections.test.ts` 既存=P2-1 落点基础。
6. 增补一第 2 条 entry 撤除行段（line4/10/12–15）所指文件=plugins/agent/conversation/src/**entry.tsx**（.tsx 后缀实测确认）；行段仍按条款⑥于 P2-2 集成后整表复核。

## 增补三（F3-0040 冲突回报处置 + F2-0012 已发，09:05）

- **F3-0040**：P2-2 开工 ACK＋冲突即停——批文第 4 点（interactions/entry.tsx 撤 region:'right'→statusbar 计数）与 F0 写域两条全绿探针（main.ts:109、test-agent-shell.mjs:19/:20 deepEqual 形状锁）互斥；F3 建议乙案（第 4 点移应用半边专批），候 C 裁；其余四项照常施工。**对 P2-3 影响=零**（F2 撤除的是 conversation entry，非 interactions entry——已在 F2-0012 §2 论证）。
- **F2-0012 已发（POSITION→F3，cc FC/C/F1）**：①statusbar 命名重叠 F2 无涉——P2-3 无状态栏组件，徽标=列表项级、FC-0015 谓词自推导；旧"同槽位"风险登记**降级为非冲突**；②甲/乙两案 P2-3 范围零变化（两 entry 文件无交集）；③F3 §2 实测表与 F2 预检逐项互印；契约文件=两行 `export *` 转发⇒符号锚点天然唯一路径。
- F0-0011（POSITION，第 4 点归属裁决材料，cc 不含 F2）知悉不回应；C-0052 联调挂点与右区 Requests 页的链形对表=F3/BC 侧事务，F2 无涉。
- F3 披露的 timestamp 占位串规则（寄出前机器检查）——F2 自检：本会话所有已发件无占位串（F2-0011 后件均实测回填）。
- 等待项新增一个小分叉：**C 对第 4 点甲/乙的裁决**不改变 F2 输入，仅影响 baseline1 上右区注册实态（E①整表复核时按实态处理，条款⑥）。

## 增补四（P2-2 交付 + lock 规则入 P2-3 施工纪律，09:26）

- **F3-0041**：P2-2 HANDOFF_READY，HEAD=**fb87a292**（基线=16398e7c 尖端非 b3d8492b）；第 4 点整项挂起候 C 裁（一行未动，五门+授权①②+门1/门5 已在 HEAD）；变异复跑证据随批。**F2-0012 两处被采纳**：§2 甲乙零影响入 F3 §4 论证链；§3 契约两行 `export *` 转发事实⇒F3 契约引用全符号形（F2 同规则已冻结）。
- **F0-0012（POSITION，背书"执行者勿提交 lock"）**⇒ **P2-3 施工新纪律**：`products/agent-desktop/extensions.lock.json` 为纯台账工件（运行时不读、门不依赖）；F2 批内**任何 build 后必复原 lock、不入提交**；重生成只归 FC 集成点（先例 16398e7cec）。并入 E 清单为 **E⑥：HANDOFF 前 `git status` 核验=无 lock 改动、无 plugins/**/\*.test.\* 新增（A1）、vitest.config 零改动**。
- 等待链推进：候 F1 P2-1 HANDOFF → FC baseline1 集成（两批零交集先后不限）→ **C 签 P2-3**；第 4 点裁决与 F2 输入零关（增补三已论证），仅按条款⑥在整表复核时吸收实态。

## 交接封条（用户指令暂停，09:31）

- **恢复入口**：agents/F2/status.md（PAUSED_BY_USER 全字段版）→ 本文件"终版冻结摘要"→ 增补一/二/三/四。历史段落为论证轨迹，不再需要通读。
- **停表事实**：F2 树 @85cc3cd clean、零源码写入、零真实调用（0/99）、gen1 单写者；已发件至 F2-0012（被 F3-0041 采纳）。
- **在途事件（恢复时先收）**：F1-0015（P2-1 HANDOFF_READY）、F3-0041（P2-2 @fb87a292）均已核；**F0-0013 报头未读**——恢复第一步先读。候 FC baseline1 集成 RECEIPT→C 签 P2-3（+第 4 点甲/乙裁，非阻塞）。
- Monitor 已停（TaskStop b4m0acbjx）；暂停期间无轮询、无写件。goal 未结束，仅按用户指令挂起动作。
