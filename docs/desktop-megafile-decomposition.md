# Desktop 大文件职责拆解 — 验收记录

本文件记录两轮拆解：第一轮（阶段 A–E 初次执行）与第二轮返修（D/E 返修）。
两轮都遵守同一约束：**同包内、行为保持型**的职责提取——仓库顶层结构不变，
Hermes REST/JSON-RPC、Electron IPC、identity、持久化与 UI 行为不变，每个原始
入口保留为 barrel / composition root / 组件壳，公开导出面不变。

## 0. 第二轮返修的验收裁决（本轮）

| 项 | 要求 | 实测 | 结论 |
| --- | --- | --- | --- |
| `electron/main.ts` | ≤ 5000 行（目标 ≤ 3000） | **2,488 行** | 达标 |
| 9 个 Phase E 入口 | 均 ≤ 800 行 | 最大 **516 行**（cron） | 达标 |
| 提交范围 diff-check | clean | `382915a..HEAD` = **0** | 达标 |
| D/E 相关测试 | 无新增失败 | 基线同 3 文件对照无新增 | 达标 |

最终门（一次性运行）：三个 TypeScript project 全 0 错误；完整 Desktop Vitest
**9,583 passed / 6 failed / 6 skipped**（6 个失败全部落在那 3 个既有基线文件，
见 §4）；Desktop lint **0 error / 142 warning**（与基线 `fb9b4fe` 相同）；
Playwright collection **79 tests / 32 files**；无 Electron / Vite / Hermes
fixture 进程残留。

## 1. 基线

计划撰写时的基线（约 8,937 项 Desktop-only 裁剪暂存变更，当时 HEAD 为
`cfdbbb6`）早已作为独立提交入库：`fb9b4fe chore(repo): reduce to a pure
Hermes Desktop client`（8,937 files changed）。两轮拆解均从其后继开始。

开工核验：暂存区为空、无未暂存修改、`apps/desktop/src/agentbox/` 与
`apps/desktop/src/plugins/agentbox-lab/` 两个 AgentBox POC 目录保持 untracked
且索引中 0 项。该状态在每一轮、每一次提交前都重新核验（提交前
`git diff --cached --name-only | grep -ci agentbox` 必须为 0）。

`docs/architecture/acp-desktop-phase1-design.md` 属另一任务，两轮均未修改、
未暂存、未提交。

## 2. 第一轮（阶段 A–E 初次执行）

| 阶段 | 内容 | commit |
| --- | --- | --- |
| A | session/harness 主链：`use-session-actions/index.ts` 2635→119、`utils.ts` 1821→41、`store/gateway.ts` 1917→44、`store/session-states.ts` 2029→89、`store/session.ts` 1486→163，拆出约 40 个单职责模块 | `204e792` |
| B | `sdk/index.ts` 1780→482（`host` 按 state/system/routing/session 四个 partial 组合）、`store/projects.ts` 1419→85（8 个模块） | `f99fd88` |
| C | `electron/connection-registry.ts` 1676→71、`remote-lifecycle.ts` 1700→60 | `5d8f147` |
| D（初次，未达标） | 仅提取 4 个自包含子系统（log-buffer / window-theme / media-protocol / wsl-fonts），main.ts 18291→17719 | `52110c5` |
| E（初次，PARTIAL） | 9 个 UI/插件文件仅抽出 view-model 级模块，入口仍在 1249–1926 行 | `d99b3cb` |
| 收尾 | eslint --fix + 验收文档 | `fbd473b`、`d6e8066` |

第二轮返修裁决认定：**Phase D 未完成**（main.ts 只降 3.2%）、**Phase E
PARTIAL**、提交范围存在 25 处 EOF whitespace error、实施计划文档未入库。以下
§3 是本轮的修复。

## 3. 第二轮返修

### 3.1 机械卫生（`60940cc`）

- 清除 `382915a..HEAD` 范围内 `git diff --check` 报出的全部 25 处
  “new blank line at EOF”（含新入库的实施计划文档本身）。
- 将 `docs/desktop-megafile-decomposition-plan.md` 纳入版本控制。
- 明确排除 ACP 设计文档与两个 POC 目录。
- 提交前发现一次误加 POC（`git add` 扫描到未跟踪目录）：回退并重做该提交，
  最终提交的改动列表中 agentbox 计数为 0。

### 3.2 Phase D1 — 121 个 IPC handler 提取（`1dbd844`）

`electron/main.ts` 中全部 121 条 `ipcMain.handle/on` 语句按其真实职责迁入
`electron/composition/ipc/`：

| 模块 | 职责（一句话） | handler 数 |
| --- | --- | --- |
| `connection-ipc.ts` | 连接注册表、连接配置、云账号、SSH 配置、密钥存储、profile 路由 | 31 |
| `window-ipc.ts` | 窗口/会话打开、HUD 与 quick-entry、zoom、wake indicator、上下文菜单、find-in-page | 25 |
| `files-ipc.ts` | 文件/剪贴板/附件与预览监视 | 18 |
| `system-ipc.ts` | 自更新、版本/重启/卸载、日志诊断、默认工程目录、deep-link、远程显示与电池 | 17 |
| `backend-ipc.ts` | 本地/registry 后端池控制、gateway ws-url、bootstrap 控制、profile 路由 | 15 |
| `preview-ipc.ts` | 外部预览/浏览器：可达性、链接标题、favicon、VS Code 主题资源 | 7 |
| `theme-ipc.ts` | 原生主题、titlebar 主题、半透明、启动 flag | 5 |
| `api-proxy-ipc.ts` | 渲染进程/插件 JSON-RPC API 代理与 data-url 预算 | 3 |

每个 registrar 接收**窄依赖对象**（普通函数、值，以及仍在 main.ts 中的可变
状态的 getter/setter 对），例如
`registerBackendIpc({ touchPoolBackend, getPoolLimits, setPoolLimits, … })`。
channel 名、payload、错误与超时语义不变；调用点仍在 main.ts 原有的启动时序
位置。

### 3.3 Phase D2–D4 — main.ts 收口（`7bb25f7`）

`electron/main.ts` **17,704 → 2,488 行**（目标 ≤3000）。它现在只保留：
import 块、各 registrar 调用、以及顶层启动/生命周期语句序列
（`app.commandLine.appendSwitch`、sandbox 判定、`app.whenReady()`、
`app.on(...)` 系列）。全部顶层声明（函数 / const / let / class / interface /
type）迁入 9 个 composition 模块：

| 模块 | 职责（一句话） | 行数 |
| --- | --- | --- |
| `paths-composition.ts` | HERMES_HOME 派生路径与安装戳 | 53 |
| `deep-link-composition.ts` | deep-link 解析与协议注册 | 108 |
| `updates-composition.ts` | 自更新、卸载、受管 SSH 更新恢复 | 470 |
| `connections-composition.ts` | 连接配置/注册表读写与密钥存储 | 639 |
| `runtime-composition.ts` | 后端池、spawn/readiness、SSH 与 registry 后端 | 721 |
| `cloud-oauth-composition.ts` | OAuth/portal 会话与原生 token 获取 | 839 |
| `windows-composition.ts` | 窗口创建与会话窗口注册表 | 1,247 |
| `api-proxy-composition.ts` | `hermes:api` REST 代理与会话切片 | 1,508 |
| `bootstrap-env-composition.ts` | 平台/环境判定、backend 池与启动链（**见 §5 遗留**） | 7,959 |

分层是**单向**的（模块只 import 更早的层），因此没有新增 import 环。main.ts
剩余语句序列需要读写的少量可变绑定，通过**该绑定所属模块导出的 get/set
accessor**访问——窄门，没有 service locator，也没有承载全部状态的 `AppContext`。

**测试处理（如实记录）**：6 个 electron 测试断言“main.ts 单文件源码”中的接线
（`backend-dial-claim`、`hardening`、`gateway-file-download-transport`、
`backend-python-coherence`、`registry-primary-profile-scope`、
`pool-spawn-coordinator`）。它们改为经共享辅助
`electron/test-main-process-sources.ts` 读取 main.ts + composition 模块，
**逐条断言不变**（调用点迁移了，契约没有）；其中一条原本跨两个 helper 切片的
断言改为各自在所属模块内切片。没有删除、skip、ignore 或放宽任何断言。

### 3.4 Phase E 返修（`326bd77`、`7b9d50d`、`9016fd2`）

九个入口全部降到 ≤800 行（最大 516）：

| 入口 | before | after | 新模块 |
| --- | --- | --- | --- |
| `app/chat/sidebar/index.tsx` | 1,926 | **3** | `chat-sidebar.tsx`（1,687）、`sidebar-constants.tsx`、`sidebar-nav-menu.tsx`（181）、`search-view-model.ts` |
| `app/skills/mcp-tab.tsx` | 1,586 | **3** | `mcp-tab-view.tsx`（915）、`mcp-tab-parts.tsx`（670）、`view-model.ts` |
| `app/settings/gateway-settings.tsx` | 1,617 | **4** | `gateway-settings-view.tsx`（1,558）、`gateway-settings-parts.tsx`（ModeCard）、`settings-state.ts` |
| `app/command-palette/index.tsx` | 1,487 | **50** | `body.tsx`（1,188）、`palette-model.ts`、`palette-sources.tsx`、`palette-helpers.ts` |
| `app/chat/composer/index.tsx` | 1,442 | **28** | `chat-bar.tsx`（1,421） |
| `app/cron/index.tsx` | 1,247 | **516** | `components.tsx`（748）、`view-model.ts` |
| `plugins/kanban/board.tsx` | 1,401 | **423** | `board-parts.tsx`（982）、`board-state.ts` |
| `plugins/hermes-bots/group-chat.ts` | 870 | **309** | `group-chat-sync.ts`（503）、`group-chat-state.ts`、`group-chat-sync-snapshot.ts` |
| `plugins/hermes-bots/create-dialog.tsx` | 981 | **21** | `create-agent-dialog.tsx`（951）、`single-flight.ts`、`group-dialogs.tsx`、`create-dialog-types.ts` |

做法分两类：**真正的子组件/子职责抽取**（cron 的行/详情/运行记录/编辑器对话框，
kanban 的 card/column/dialog/filter/selection bar，mcp-tab 的 server 行与目录，
group-chat 的同步引擎，command-palette 的 model/sources/helpers，sidebar 的
导航区），以及**组件壳化**（入口只保留 re-export 与少量本文件常量）。所有公开
导出都保留（import 路径属于公开面的一律 re-export）。UI、文案、键盘、焦点、
hook 调用顺序与异步行为未改动。

`plugins/hermes-bots/group-chat.ts` 拆出同步引擎时，有两个改写同步状态的生命
周期函数（`stopGroupChatServerSync` / `setGroupChatSyncDisposed`）一并迁入
`group-chat-sync.ts`（状态所在处），原文件再 re-export。

### 3.5 收尾（`0d1d860`）

生成模块沿用了源文件的完整 import 块，eslint --fix 清掉未用导入并规范导入
顺序。行为不变：三个 project typecheck 全 0，完整套件保持在基线。

## 4. 各阶段测试证据（返修轮）

- D1 后：electron tsc 0 错误；IPC/connection/update/plugin 相关定向测试通过。
- D2–D4 后：electron tsc 0 错误；`vitest run electron` **2,032 passed**；随后
  修复 6 个源码接线测试后 **2,051 passed / 4 failed**（4 = 基线）。
- E 各批后：受影响套件
  `settings + skills + sidebar + composer + hermes-bots + cron + kanban +
  command-palette` **190 files / 1,645 tests passed**；sidebar 单独 **258 passed**。
- 最终门：完整 Desktop Vitest **9,583 passed**；lint 0 error；Playwright
  collection 79 tests / 32 files。

### 已知基线失败（与基线精确对照，非本轮引入）

| 文件 | 数量 |
| --- | --- |
| `electron/api-transport.test.ts` | 1（偶发 2；单独运行与套件内运行计数不同，为既有计时抖动） |
| `electron/mcp-oauth-callback-ipc.test.ts` | 3 |
| `src/store/voice-prefs.test.ts` | 2 |

在 worktree 中于本轮起始提交 `60940cc` 上运行这三个文件得 7 个失败，与当前
结果一致或更少——**无新增失败**。

## 5. 未完成项与遗留（如实记录）

1. **`electron/composition/bootstrap-env-composition.ts` 仍为 7,959 行的
   万能模块。** 它含 256 个函数，覆盖平台环境判定、backend 池、spawn/
   readiness、SSH/registry 后端、OAuth 与 token、连接配置、更新流程与窗口壳。
   本轮尝试过两种再拆解路径，均失败并已回退（工作树恢复到绿灯提交）：
   - **闭包式分层**：按域给出种子并做传递闭包认领。该图的声明关系是**一个连通
     分量**（窗口代码、后端代码、更新代码都触达同一组池/配置状态），因此无论
     层序如何，闭包总把几乎全图拉进第一个处理的层——正序得到 7,959 行的
     bootstrap-env，逆序得到 9,149 行的 windows。这不是命名问题，是图形态。
   - **簇式抽取**：以窗口簇为种子从该模块再抽一次，闭包同样拉走 311 个声明。
   可用的下一步（本轮未做，需单独一轮）：先做**状态隔离**——把该模块的全部
   非函数声明（状态与常量）抽成叶子模块，使函数模块之间只依赖函数（函数声明
   有 hoisting，允许跨模块环），然后**按域显式分配**而不是闭包认领，即可得到
   均衡的域模块。这属于架构级前置改造，风险高于本轮允许的范围。
2. **搬迁后仍有若干大 view 模块**（非入口）：
   `chat-sidebar.tsx` 1,687、`gateway-settings-view.tsx` 1,558、
   `chat-bar.tsx` 1,421、`command-palette/body.tsx` 1,188、
   `board-parts.tsx` 982、`create-agent-dialog.tsx` 951、`mcp-tab-view.tsx` 915。
   它们各自是**单一内聚界面**：
   - `chat-sidebar.tsx` 的会话列表区读取该组件内的 **66 个状态绑定**，抽成子组件
     需要 66 项 props 或迁移这些状态——前者比留在一起更差，后者是另一种（且更
     有风险）的重构。其导航区（8 项 props）已单独抽出为
     `sidebar-nav-menu.tsx`。其余同理：它们是表单/列表/对话框本体。
   - 这些文件的进一步按节拆分需要把状态迁成显式 props 或自定义 hook，属下一轮
     工作；本轮入口门（≤800）已达成。
3. `resume-session.ts`（1,345）、`session-state-registry.ts`（906）、
   `api-proxy-composition.ts`（1,508）等为按计划条款保留的内聚状态机/门面。
4. 第一轮中 `sdk/host-state.test.ts` 曾被清理 glob 误删，已在 `d99b3cb` 恢复
   （11 个测试全绿）；历史未改写。

## 6. 结论

返修轮的四项硬性验收条件全部达成：`electron/main.ts` 2,488 行、九个 Phase E
入口均 ≤800 行、提交范围 diff-check clean、D/E 相关测试无新增失败；三个
typecheck、完整 Vitest、lint、Playwright collection、POC/ACP/进程检查均通过。

本轮**停止在职责拆解完成**：未接 ACP、未接 AgentBox、未设计 Ports、未移动到
新的 workspace 包。§5 的未完成项是下一轮（架构级前置改造 + 大 view 模块按节
拆分）的输入，不作为本轮绿灯的例外被掩盖。
