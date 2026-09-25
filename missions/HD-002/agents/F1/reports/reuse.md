# F1 复用记录（HD-002 · ordessa connector / 首发合同）

按 I-DECISION-REUSE-001「每个采纳决定附最小一条：问题 → 独立案例/源码证据 → 一致与差异 → 采用方式及落点 → 本地验证」建立。**本轮未开泛架构调研**：优先沿用 HD-001 既有记录（`../../../HD-001/agents/F1/reports/reuse.md`、`connect-research.md`），未重发任何真实模型请求，预算 0。

可核版本：BE `60d868ef258e4044a03c8650312431e5b57a48ab`（HD-002 BASELINE）；FE baseline `867b25d160`；F1 交付 `work/hd002-f1-cp3` @ `221740520b`；FC 集成 `afe7f41e97`（FC-0061）。

## R-1 `newSession()` 落法：本仓先前倾向已被用户裁决**推翻**

- **问题**：后端 connector 实现 `AgentClient.newSession()` 时，点"新对话"是否立刻在后端建会话。
- **既有记录（非本轮重查）**：HD-001 `connect-research.md:62` 记 wire/1 **无纯创建方法**——sessions 族仅 `list/update/archive/createAndSend/send/switchProfile`（该文档记 BE `handlers.py:496-501`），且 `createAndSend` 必带首条消息、accepted 即 `_dispatch`（`handlers.py:2018`、`2038-2041`）。当年列两候选：(a) 复用 REST 兼容层 `POST /api/v1/sessions`（`app.py:309-313`）纯创建；(b) 会话延迟到首条消息实体化。F1 当年**倾向 (a)**，写"随 server connector 批文报 C 定"。
  - 诚实标注：上述 BE 行号是**沿用 HD-001 记录**，本轮未重新逐行核 BE 源码（BE 树不在我写域）。
- **一致与差异**：I-SESSION-FIRST-SEND-001（用户直接授权传达）§1.1–1.2 裁定新对话只是前端未发送草稿、**首次发送才实际创建并执行**，并明确"已有 `createAndSend` 是优先复用路径，不为本交互新增纯创建接口"，§2 撤销"纯创建空会话"作为前置。**即选 (b)，与 F1 先前倾向相反。**故当年"倾向 (a)"自本条起作废，请勿再据旧笔记重开此题。
- **采用方式及落点**：`plugins/connectors/ordessa/src/native.ts` 的 `firstSend` 是唯一建会话路径（`native.ts:134-136` 只 required `sessions.createAndSend`）。实测 grep：本连接器调用的后端方法闭集恰为 `sessions.createAndSend|send|list` + `workspaces.list|open`——**无纯创建、无 `workspaces.allocate`、无 `/tmp` 猜测**。
- **本地验证**：`apps/desktop/renderer/agent-ordessa.test.ts` 以真 `createTransport().open()` 驱动桩 `fetch` + **帧账本**，证"只开新对话／输入未发送／放弃 → 零后端帧、无持久会话"（裁决 §最小验收反例第 1 条）。

## R-2 首发结果未定时能否重发：**社区共识未证**，依据是 mission 自有契约与 FC 裁决

- **问题**：首发超时/传输断（OUTCOME_UNKNOWN）时，可否自动重发。
- **独立案例**：**未证**。本轮未做 I-DECISION-REUSE-001 要求的 2–3 个独立开源项目源码核查（idempotency key / 结果查询模式的社区共识）。按规则明确记为未证，不用 README 或印象凑数。
- **实际依据（授权内）**：BE 的 12 家族错误闭集（我 `wire.ts` 镜像）+ FC-0055/FC-0057 裁决 + 裁决 §最小验收反例第 3 条"不盲目重试导致重复创建，沿用已有幂等/查询能力"。
- **采用方式及落点**：`native.ts` 仅 `UNAVAILABLE`/`WORKER_UNREACHABLE`/`OUTCOME_UNKNOWN` 允许查询，且**沿用调用方原 requestId**，绝不重发；确定性拒绝原样保留。`wire.ts` 把未知家族保守收敛为 `UNAVAILABLE`（偏"可能已接受"一侧）。
- **本地验证**：D1 的 8 门（同 requestId 两帧、query-accepted 正向、5 个确定性家族循环零查询、garbage internalCode 丢弃、可用性失败不得改判 `project-invalid`）。
- **残留风险（如实）**：若 BE 实际存在第 13 个"可安全重发"家族，会被收敛进 UNAVAILABLE 而走查询一侧——后果是多一次查询，不会自动重发。

## R-3 首发执行身份来源（FC-0053）

- **问题**：首发的 harness/profile 身份从哪来。
- **证据**：FC-0053 裁决 + 本树 hello/profiles 码路径。**非社区复用**，无外部案例核查需求。
- **落点**：只信已认证 `server.hello.nativeExecution.{mode,harness,profileId}`，并在 `profiles.list` 精确交叉核该 id；**不做任何回退挑选**（`native.ts:123-127` `executionProfile`）。
- **本地验证**：离线门 `agent-ordessa.test.ts:178-189`（列表加 `a_first`/`z_last`、翻转、重连均不改判；displayName 缺失只回落 id）+ `:191-203`（无 `nativeExecution` → `native-execution-missing`，明写不得回落到唯一在场的 ready Profile；mode 非 native / 字段缺空错型 / harness 未注册各自红）。
  - **真 Server 侧状态（2026-09-23，C-0048 失败轮，FC-0069 §15 / BC-0062 §10）＝ 半证，且缺的正是 FE 那一半**：BC 用同实例认证直查确认真 Server 上 `nativeExecution.mode=native/harness=pi/profileId` 有效、且 `profiles.list` 对该 profileId **唯一 ready=true** ⇒ **服务端前提成立**；但 FC 的无发送门**未让 FE 执行 `profiles.list`** ⇒ 「连接器据 hello 派生 Profile 且不兜底」这条**在真 Server 上仍未走过**，只有离线门。**未证**，不得因该轮为真 Server 就升格。
  - **C-0058 第三批后的更新（仍未升格，但"FE 不触 `profiles.list`"这半边首次有服务端侧证据）**：BC-0070 §10 给出 tap 全量与 BC 自发两份计数 ⇒ 相减得 FE 归因 `server.hello=1 / profiles.list=0 / workspaces.list=2 / workspaces.open=1 / 所有写类=0`，与读码签名四法四数吻合（F1-0031 §1）。这把"**连接与项目选择阶段绝不触 Profile 查询**"从离线门+UI 观察升级为**服务端入站计数印证**；但**派生链本身**（拿到 hello 的 profileId 后去 `profiles.list` 精确交叉核、不兜底）在真 Server 上**依然零次执行**，因为无首发授权 ⇒ 本条结论**仍为未证**，边界与上一致。表的可反驳性见 F1-0031 §1(a)(b)：依赖 BC 两份列表穷尽、吻合是一致性而非指纹。**〔本条已被第三轮真发部分升格：正向派生链已在真 Server 走过；回退拒绝仍只有离线门——见文末「阶段界重账」，引用本条务必连读那段〕**

## R-4 项目上下文传达与"默认工作区"分支（**该分支已被覆盖，此处为纠偏记录**）

- **问题**：界面所选项目如何成为实际执行目录；未选项目时用什么。
- **落点与验证**：`workspaceId` 进 `createAndSend` 参数（`native.ts:138`），并在任何帧发出**之前**用 `workspaces.open` 复核身份与归档态（`native.ts:143`→`109-121`）。
- **覆盖关系（一手核过）**：`I-PROJECT-REQUIRED-001`（cc F1）第 8 行覆盖 I-SESSION-FIRST-SEND-001 中"不选项目使用Agent默认工作区"的部分，第 20 行把"默认工作区发现/解析/分配"列为**不做、不再作为待裁决项**。因此：
  - 本条目**早先一版**把 `native.ts:204` 的"缺 `workspaceId` 即显式拒绝"记成"§1.5 合规但 §1.4 未满足的缺口"，并向 BC/H 请求默认工作区来源——**该判断已被覆盖、请求已撤销**（见 F1-0015 §1）。现行为就是**目标态**：第 13 行明令"不偷偷回退cwd、home、/tmp或创建默认工作区"。
  - 保留此条是为留证：为什么 F1 曾提过该请求、以及它何时失效，避免后人据旧笔记重开。
- **第 13 行"不串另一服务器项目身份"在我层内是结构性的**：连接身份即连接器身份 `ordessa:${serverInstanceId}`（`client.ts:9`）、握手期身份变化直接抛错要求另起连接（`client.ts:136`）、`projects` 缓存为每 native 半私有并按连接重装（`native.ts:93/100-105`）→ 外来项目 id 必落 `native.ts:113` 而拒。
  - **真 Server 侧目前只证到"不 fork"，未证到"不串"**：C-0048 与 C-0058 两批里，UI 的连接 ID 与本批 `origin|serverId` **一致**（`main.ts:96` 那条断言，F1-0033 §2 把它算作四项 F1 面证据之一），且项目按该作用域可列可选 ⇒ **同一 Server 的不同拼法不会劈成两个身份**这一半有真 Server 观察；而"外来项目 id 被拒"那条**至今无门承载**（正是我在途唯一请求 F1-0024 §2），真 Server 上也从未发生（无首发授权）。两半不得互替。
- **"上次选择恢复"归 F2**（第 19 行，且明示"记忆是非秘密UI选择，不引入Profile/配置管理产品"）；F1 只发布选择态、不建第二套记忆（`client.ts:361-363`）。
- **仍待真实证据（未证）**：第 15/25 行要求的"实际执行位置/cwd 与所选项目一致"需真实 FE↔BE 运行，本树不可产生——连接器未启用（属 C-0020 候选窗口）且 Pi/ACP 桥路线待用户裁定（I-ESCALATION-REQUIRED-001）。见 F1-0015 §3 B-2。**〔本条两点前提已过时：连接器已启用并已在真 Server 上真跑、路线已定（固定 Go ACP 桥 + 直连原生 Pi 0.86.1）；但结论不变——§25 仍未证，且不得由文本两轮 PASS 顺带签收，见文末「阶段界重账」第 5 条〕**

## R-5 与既有记录的关系

connections/注册表/契约 Token/Lumino 底座四条复用决定见 HD-001 `reuse.md`（`forScope().add()` 注册点、Token 单实例链、MIT/BSD 许可已核），本文件**不重复展开**（规则要求先复用已有记录）。HD-002 与 HD-001 是不同 mission 目录：跨 mission 追加指针属他人写域，未擅动——如需在 HD-001 记录里加一条指向本文件的索引，请 FC 定点或授权。

## R-6 查询兜底的项目归属：原判"实测缺陷/明令违约"**已被我自己读码推翻**（F1-0023）

~~R-1/R-2 交叠处有一条实测缺陷：query 兜底命中的首发，其会话被记在用户**后选**的项目下（booking 在报错前、生产静默）…故本条是**裁决明令违约**~~ → **该结论作废**。F1-0023 §1 直读 `221740520b` 证：两条路径在比对**之前**就收敛——`native.ts:149-164`（直达 `:151-152` 取 `sent.session.id`；取不到才 `:159-162` 查 `sendOutcome.query`；**共用出口** `:164 return { sessionId, profileId }`）→ `client.ts:390` resolve → `:404` 取 id → `:406` 读 `sessions` → `:407` 找该会话 → `:410-411` 比对 `confirmed.workspaceId` 与**发送时**的 `workspaceId`（容许 `normalizedPath` 命名）→ 不等即 `:412` 抛 `bound to a different project`。⇒ **比对本来就覆盖兜底路径**；且 `:415` 合成用的是闭包里发送时的 id，不是当前选择，所以"记在后选项目下"这条机制**不存在**。F1-0013 的观测 `listHadSession:false` **为真**，错在我的解释（数据与解释分开撤）。
下列字段事实仍为真（S-0020 按 `60d868ef` 同源行号答毕；本条不是社区共识问题，而是本仓服务端形状）：

- `sendOutcome.query` accepted 是固定挑出的子集 `{outcome, sessionId, executionId?, configVersion, queueItemId?}`——**结构上不含**项目绑定（`handlers.py:2112-2114` → `repository.py:540-558`）。
- `server_sessions.workspace_id` 为 `TEXT NOT NULL REFERENCES server_workspaces(id)`（`database.py:84-86`），只在 INSERT 写入、**所有 UPDATE 路径无一触碰** → 绑定**不可变**，唯一真相即该列。故 FE 见到的任何错绑必来自 **FE 侧合成**，不是 BE 改绑。
- 直达 accepted/replay 返回完整 session_record **含 `workspaceId`**（`handlers.py:2039-2055`）→ **两路径不对称**，正是本反例的形状。
- 相邻更正：`executions.list` 投影**含** `workspaceId/workspace/placement`（F1-0016 §4 曾猜它同缺，已废）。

**于是本条的真实剩余量缩小，且性质从"行为缺陷"降为"测试缺口 + 一态语义"**（F1-0023 §3）：
- **缺一条组合门**：`agent-ordessa-connector.test.ts:13` 已把 `sendOutcome.query` 列入封闭方法集，但唯一碰兜底的 `:173-183` 断言的是"直达报 `OUTCOME_UNKNOWN` → 抛错且不落会话"；**没有门在 client 层驱动「直达失败→兜底 accepted→返回真 sessionId」**，故 `:411` 与兜底的交叉面**行为由构造保证、无门承载**（3 处 `responses.set('sessions', …)` 全在直达路径 `:137/:147/:161`）。
- **列表滞后那一态是"合成"不是"未验证"**：`confirmed === undefined` 时 `:411` 短路不比对，`:413-415` 补一条 `{ id, title, workspaceId(发送时) }`，由门 `:137` 明确祝福，下一次列表读才以 Server 真相覆盖；另 `:418` 会把 `selectedWorkspaceId` 复位到发送时项目，覆盖发送飞行中的新选择。
- 原提议的"三态失败闭合改造"（等/不等/滞后记未验证）**撤销**——现码已是失败闭合，改 `:137` 的祝福语义属**产品语义变更、需新裁决**，不是我的实现偏好可自决。

**状态：待 FC 二选一**——点这一条小门，或直接结案（判 `:411` 无需再钉）。未点名不施工，本树 `221740520b` 维持停写。I-PROJECT-REQUIRED-001 §25"执行侧 cwd 与所选项目一致"**仍未证**：C-0048 明写本批不点 Send、不得调 `createAndSend`/`send`，故其配对门不覆盖首发。
