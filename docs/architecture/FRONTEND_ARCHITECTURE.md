# Agent-Box Studio 前端架构设计 v1

> 状态：设计稿，待用户批准后实施。
> 位置：`docs/architecture/FRONTEND_ARCHITECTURE.md`
> 日期：2026-09-03
> 前置：减法 R1-R6 已完成（分支 studio-shell），前端功能面已收敛。

---

## 0. 设计目标（按优先级）

1. **可扩展性**：用户将持续增加能力。四个已知的扩展轴：
   - 新 harness（agent 类型：Claude / Codex / 未来更多）
   - 新工具渲染（agent 工具调用的 UI 呈现）
   - 新面板（审查 / 浏览器 / 未来画布类）
   - **后端整体替换**（Rust codeg-server → Python agent-box-web 中间层）
2. **单人可读性**：任何模块一个下午能读完。禁止 1000+ 行文件成为常态（UI 大组件例外需注释理由）。
3. **可测试性**：每个模块可独立单测（port 可 mock）。
4. **保留资产**：不重写 transport 层（已干净）、shadcn/ui 组件库、4800+ 测试。

## 1. 参照项目研究与取舍

| 项目 | 核心模式 | 我们采纳 | 我们不采纳 | 理由 |
|---|---|---|---|---|
| [assistant-ui](https://www.assistant-ui.com/docs/architecture) | ① **Runtime 单缝**：UI 只跟 `AssistantRuntime` 接口对话，后端无关；② **ExternalStoreRuntime**：外部状态 → runtime 桥接；③ 消息 = 类型化 **parts** 组合；④ headless 原语（ThreadPrimitive/ComposerPrimitive）+ 样式层分离 | Runtime 单缝思想、parts 消息模型、headless/样式分层 | 直接引入该库为依赖 | 我们的需求（多客户端 attach、mid-turn 权限、harness 注册表、后端替换）与它的 chat 中心模型差异大，适配成本 > 自建核心；模式可免费借（MIT） |
| [Vercel AI SDK v5](https://ai-sdk.dev) | UIMessage = parts 流；tool-call 带输入/输出/状态流式；传输层可插拔 | parts 联合类型定义方式、tool 生命周期（input-streaming→running→result） | 它的 HTTP 流协议 | 我们的事件源是 WS attach 协议，不是 SSE；但 parts 数据形状对齐它，未来若接标准 LLM 服务零翻译 |
| [LobeChat](https://lobehub.com/zh/docs/development/basic/folder-structure) | `src/features/`（领域模块，组件+store 同居）+ `services/`（API 层）+ `store/`（zustand 切片）；monorepo | **features/ 领域目录形态**、services 即 ports 的分层 | 它的数据库优先本地模式、CSS-in-JS | 目录形态是它被大规模验证的最大价值；本地 DB 与我们后端形态不符 |
| LibreChat | 端点即插件（EndpointsPlugin 注册） | **注册表模式**用于 harness 适配器 | 它的整体（Express+React 老栈） | 注册表是"加新 harness 不改核心"的机制保障 |

**一句话总结**：**借 assistant-ui 的"缝"，AI SDK 的"数据形状"，LobeChat 的"目录"，LibreChat 的"注册表"**——四家的精华各取一层，全部自持（不加重依赖）。

## 2. 目标架构总览

```text
                    ┌──────────────────────────────────────────┐
                    │  app/（Next.js 路由壳，薄）                │
                    ├──────────────────────────────────────────┤
                    │  features/（领域模块 = 产品的全部能力）      │
                    │  session/  projects/  terminal/  search/  │
                    │  settings/  automations/  tasks/          │
                    │  每个模块：components/ + store.ts + api.ts │
                    │            + events.ts（自己的订阅）       │
                    ├──────────────────────────────────────────┤
                    │  core/（与产品无关的地基）                  │
                    │  ports/     接口定义（见 §4）               │
                    │  domain/    领域类型（见 §5）               │
                    │  registry/  四个扩展点注册表（见 §6）        │
                    │  transport/ 现有实现平移（已干净）           │
                    ├──────────────────────────────────────────┤
                    │  components/（纯展示 + shadcn/ui 库）       │
                    └──────────────────────────────────────────┘

数据流（单向）：
  UI 组件 → feature store action → port 调用 → transport → 后端
  后端事件 → core/ports/EventChannel → feature 自己的订阅 → store → UI
```

**铁律**：

1. `features/*` 之间**禁止横向 import**——需要别人的数据走 `core/domain` 类型 + 自己订阅事件，或上提到父级。例外：可 import `core/**` 与 `components/**`。
2. `components/` **禁止 import** `features/`、`core/ports`（纯展示，数据全走 props）。
3. 状态只用 zustand store（每 feature 一个）；React Context 仅保留：i18n、theme、以及 runtime 实例的 DI（一个 `<SessionRuntimeProvider>`）。
4. 所有后端访问必须过 port 接口；**UI/store 永不直接 import `core/transport`**（后端替换日 = 只换 port 实现的绑定）。

## 3. 目录规格（目标树）

```text
src/
  app/                        # 路由：/workspace /settings /merge /import-sessions
  core/
    domain/
      project.ts              # Project / ProjectOrigin
      conversation.ts         # Conversation / ConversationStatus / ConversationSummary
      message.ts              # Turn / MessagePart 联合类型（§5.2）
      session-event.ts        # 归一化 SessionEvent 联合（§5.3）
      permission.ts           # PermissionRequest / QuestionRequest / PlanApproval
      agent.ts                # HarnessDescriptor（来自注册表）
    ports/
      transport.ts            # 现有 Transport 接口平移
      event-channel.ts        # 订阅-分发 + 断线语义
      session-runtime.ts      # ★ 单缝：连接/发送/事件流/快照/权限（§4.1）
      projects.ts             # 项目注册表 CRUD + 变更事件
      git.ts  terminal.ts  skills.ts  settings.ts …
      backend.ts              # ★ Port 绑定点：当前 Rust 实现；未来 agent-box-web 实现
    registry/
      harnesses.ts            # harness 注册表（§6.1）
      tool-renderers.ts       # 工具调用渲染注册表（§6.2）
      part-renderers.ts       # 消息 part 渲染注册表（§6.3）
      panels.ts               # 右面板/设置分区注册表（§6.4）
    transport/                # tauri-transport / web-transport / remote-desktop（现状平移）
  features/
    session/
      components/             # TranscriptView / Composer / PermissionCard / ToolCard…
      model/                  # SessionEvent → Turn/parts 归约器（从 adapters 平移改造）
      store.ts                # 会话视图状态（当前轮、pending 权限、草稿）
      runtime.ts              # SessionRuntime 的 CodegRust 实现（attach/prompt/…）
      api.ts  events.ts
    projects/
      components/             # 项目树侧栏、项目新建流程
      store.ts  api.ts  events.ts
    terminal/  search/  settings/  automations/  tasks/ …同构
  components/                 # ui/（shadcn）+ layout/（TopBar/StatusBar 等壳件）
```

## 4. 核心抽象规格

### 4.1 SessionRuntime（最重要的一条缝）

```ts
interface SessionRuntime {
  // 生命周期
  connect(spec: SessionSpec): Promise<void>      // harness + cwd + 续接 sessionId
  disconnect(): Promise<void>
  // 输入
  send(input: ComposerInput): Promise<void>      // 文本/附件/命令，归一化
  cancel(): Promise<void>
  // 输出：归一化事件的可订阅流（见 §5.3）
  events: Subscribable<SessionEvent>             // 内部处理 seq/重放/快照对齐
  // 交互请求
  permissions: Subscribable<PermissionRequest[]>
  respondPermission(id: string, answer: PermissionAnswer): Promise<void>
  // 恢复
  restore(conversationId: ID): Promise<SessionSnapshot>
}
```

要点：

- **UI 和 store 只见这个接口**。attach 协议、事件去重（event_seq）、快照/replay 决策、`waitForReady` 时序——全部封装在实现里（现在散在 transport + acp-connections-context 各处）。
- 归一化发生在 runtime 边界：ACP 事件、Codex 专有事件、未来非 ACP harness 事件 → 统一 `SessionEvent`。**`conversation_status_changed` 这类产品级事实走 EventChannel，不混进会话流**（修掉审计泄漏 L2）。
- 快照/重放语义由 runtime 内部保证（先快照后增量，seq 单调），消灭前端三通道收敛。

### 4.2 Port 绑定点（后端替换的插槽）

```ts
// core/ports/backend.ts
export interface BackendPorts {
  session: SessionRuntime
  projects: ProjectsPort
  git: GitPort
  terminal: TerminalPort
  events: EventChannel
  // …
}
// 现在唯一实现：createCodegRustBackend(transport)  —— 全部映射到现有命令
// 未来：       createAgentBoxBackend(httpClient)   —— 映射到 agent-box-web /api/v1
```

`app/` 根部一个 `<BackendProvider backend={createCodegRustBackend(transport)}>`——**换后端 = 改这一行**。

## 5. 领域模型

### 5.1 Project（落实 D-003）

```ts
interface Project {
  id: ID
  name: string
  origin: { kind: "local"; path: string }
            | { kind: "ssh" | "wsl" | "docker"; host: HostRef; path: string }
  createdAt: ISOString
  lastActiveSessionId?: ID
}
```

### 5.2 MessagePart（对齐 AI SDK v5，注册表开放）

```ts
type MessagePart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string; collapsed: boolean }
  | { type: "tool-call"; toolName: string; state: "input"|"running"|"result"|"error";
      input?: unknown; output?: unknown }        // 渲染查 §6.2 注册表，找不到用通用卡
  | { type: "file-change"; files: FileChange[] } // 轮末产物
  | { type: "error"; message: string }
  | { type: "custom"; partType: string; data: unknown }  // 注册表扩展
```

### 5.3 SessionEvent（归一化事件联合）

现有 40+ 种 ACP 事件收敛为 ~12 种领域事件：`turn-started / part-appended / part-updated / turn-completed / permission-requested / permission-resolved / status-changed / session-error / snapshot-hydrated …`。归约器（`features/session/model`）把它们变成 Turn+parts。**新增 harness 事件 = 在 runtime 实现里翻译成这 12 种，不新增 UI 分支。**

## 6. 四个扩展点（可扩展性的机制保障）

| 注册表 | 接口 | 扩展动作 |
|---|---|---|
| harnesses | `{ id, displayName, icon, capabilities, connect(spec): SessionRuntime }` | 新 agent：实现 SessionRuntime + 注册，零 UI 改动 |
| tool-renderers | `Map<toolName, Component<{part: ToolCallPart}>>` | 新工具卡：注册组件；未注册回退通用卡（标题+状态+JSON） |
| part-renderers | `Map<partType, Component>` | 新消息类型（画布/图表/…）：自定义 part + 渲染器 |
| panels | `{ id, title, icon, component }[]` | 右面板新标签 / 设置新分区：注册即出现在 UI |

## 7. 状态与事件规则

- 每 feature 一个 zustand store；切片订阅（selector）；跨 feature 数据靠事件各自收敛，不互读 store（确需共享的上提到 `core` 或父组件状态）。
- **UI 开关类状态**（sidebar/aux/terminal 开合、宽度）合并为单 `workspace-shell` store，消灭 6 个小 context。
- 事件订阅归 feature 自己（`features/*/events.ts`），`app/layout` 不再集中接线。
- 断线恢复：EventChannel 统一提供 `onReconnect`；feature 在自己的 events.ts 里声明重取。

## 8. 迁移映射（现状 → 目标）

| 现状 | 目标 | 方式 |
|---|---|---|
| `lib/transport/` | `core/transport/` | 平移 |
| `lib/api.ts`（5400 行） | 各 `features/*/api.ts` + `core/ports/*` | 按函数族机械拆分，port 接口先行 |
| `acp-connections-context.tsx`（6000 行） | `features/session/runtime.ts`（CodegRust 实现）+ `model/`（归约）+ `store.ts` + `components/` | **分四步拆**：①port 接口+runtime 抽取 ②归约器平移 ③权限/重连模块化 ④UI 挂接。每步可独立验收 |
| `lib/adapters/*`（事件→消息） | `features/session/model/` | 平移 + 换 part 类型 |
| `contexts/workspace-context`（文件 tab） | `features/files/` | 平移 |
| `app-workspace-store` | `features/projects/store.ts`（folder→project 改名） | 随 S2.3 项目树一起 |
| sidebar/aux/terminal 等 6 个 context | `features/shell/workspace-shell store` | 合并 |
| `workbench-route-context` | `features/shell/route store` | 平移改名 |
| TopBar/StatusBar | `components/layout/`（读 shell store） | 微调 |

## 9. 扩展剧本（设计自证）

1. **加 harness**：写 `XxxRuntime implements SessionRuntime` → `registry/harnesses` 注册 → agent 选择器自动出现。不碰 transcript/composer/权限任何代码。
2. **加工具渲染**：一个组件 + 一行注册。未注册工具自动落通用卡，永不崩。
3. **加右面板标签**（如"审查"）：`registry/panels` 注册 → 面板出现。
4. **换后端到 agent-box-web**：实现 `createAgentBoxBackend` → 改 `<BackendProvider>` 一行。UI/feature 零改动（这正是今天目标的插槽）。
5. **加新消息类型**：自定义 part + 渲染器注册；归约器在 runtime 侧翻译事件。

## 10. 决策点（需用户裁决）

**Q-ARCH-1：assistant-ui 依赖 vs 自持核心？**
- A. 自持核心（本设计，推荐）：接口我们定义，贴合多客户端/权限/harness 需求；工作量集中在 session 模块拆解（本来就要做）。
- B. 引入 assistant-ui：转写/composer 立刻精致，但runtime 适配层会把我们的领域模型压扁成它的 chat 模型，后端替换日多一层翻译。
- C. 折中：自持核心 + 未来局部借用它的 headless 原语做 transcript 滚动/虚拟化（可后补，不锁死）。

**Q-ARCH-2：monorepo（pnpm workspace）vs 单包？**
- 单包（推荐，现状）：体量未到拆包阈值；目录纪律即可。将来 features 稳定后可无痛升 workspace。

## 11. 实施切片（批准后执行，每片独立验收）

- **F1**：建 `core/`（domain/ports/registry 骨架）+ 拆 `api.ts`（纯机械，测试护航）
- **F2**：SessionRuntime 接口 + CodegRust 实现（从 acp-connections 抽取，先只服务现有 UI）
- **F3**：session 模块整体搬家（归约器→parts 模型、权限流、store）——最大片
- **F4**：shell 合并（6 context → 1 store）+ TopBar/StatusBar 挂接
- **F5**：projects 模块（folder→project 改名 + S2.3 项目树侧栏，一次做完）
- **F6**：注册表落位 + 扩展剧本 1-5 各写一个冒烟测试

## 12. F2 设计：SessionRuntime 的 CodegRust 实现（抽取方案）

### 12.1 范围与原则

- **只加不改**：本片新增 `features/session/`，不改动 acp-connections-context（UI 重挂在 F3）。
- 实现包住**现有命令面**（acp_connect/prompt/cancel/respond_permission/get_session_snapshot…）与**现有事件通道**（attach 协议 + legacy firehose），把它们翻译成 §5.3 的 9 种 SessionEvent。
- runtime 是纯 TS 类（非 React），单测用 mock transport。

### 12.2 文件与职责

```text
features/session/
  runtime.ts          CodegRustSessionRuntime implements SessionRuntime
                      - connect: preflight→connect→（web 模式）waitForReady→attach(带 sinceSeq)
                      - events: 单一 Subscribable；内部处理 seq 去重/快照对齐/重连重放
                      - send/cancel/respondPermission: 命令直通
                      - restore: get_session_snapshot → snapshot-hydrated 事件
  model/normalize.ts  纯函数：EventEnvelope → SessionEvent（下表）
  model/normalize.test.ts
  runtime.test.ts     mock transport 行为测试
```

### 12.3 归一化映射表（ACP/Codeg 事件 → SessionEvent）

| 源事件（EventEnvelope.type） | SessionEvent | 载荷来源 |
|---|---|---|
| session_request/chat started（turn 开始类） | turn-started | conversation_id |
| user_message 回显 | part-appended (text, role=user) | content |
| assistant_message/content deltas | part-appended (text) / part-updated | content_block |
| thinking/reasoning 块 | part-appended (reasoning) | content |
| tool_call | part-appended (tool-call, state=running) | title/input |
| tool_call_update (结果/失败) | part-updated (tool-call→result/error) | output/error |
| plan/available_update 等 UI 级 | part-appended (custom, partType) | 原样 |
| permission_request / plan_approval_request / question_request | permission-requested | 统一 PermissionRequest 形状 |
| permission resolution 类 | permission-resolved | id/outcome |
| conversation_status_changed | status-changed | status |
| turn/end 类 | turn-completed | usage/duration |
| snapshot 帧（attach 协议） | snapshot-hydrated | LiveSessionSnapshot |
| error / process_exit | session-error | message |
| 未知事件 | （丢弃 + 计数，绝不崩） | — |

映射表是**唯一允许知道源事件方言的地方**；新 harness 只需再写一张表。

### 12.4 测试策略

- `normalize.test.ts`：每个源事件至少 1 正例 + 未知事件丢弃例；快照对齐（seq 回退保护）。
- `runtime.test.ts`：connect 时序（preflight→connect→ready→attach）、send 直通、重连重放（lastAppliedSeq 作为 since_seq）、权限作答直通。
- core 层：registry 四件套（注册/获取/列表/未注册回退）+ domain 形状守护（parts 判别联合穷尽性）。

## 13. F3-F6 概要设计

- **F3（session 模块搬家）**：ConversationTabView 改为消费 `useSessionRuntime()`（Provider 注入实例）；acp-connections-context 的归约器/权限/配置逻辑分文件迁入 `features/session/{model,components}`；`acp-connections-context.tsx` 最终删除。分 4 个可验收小步执行。
- **F4（shell 合并）**：sidebar/aux/terminal/search-dialog/automations-view/tasks-view/workbench-route 7 个 context → `features/shell/store.ts` 单 zustand store（面板开合/路由/搜索框）；TopBar/StatusBar 改读 store。
- **F5（projects 模块）**：app-workspace-store + sidebar-conversation-list → `features/projects/`（Folder→Project 改名、项目→会话两级树、S2.3 侧栏）。
- **F6（注册表落位）**：agent 选择器改读 harnesses 注册表；工具卡渲染查 tool-renderers；右面板 tabs 查 panels；写 5 个扩展剧本冒烟测试。
