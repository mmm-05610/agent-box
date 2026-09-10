# Desktop 大文件职责拆解 — 验收记录

本轮执行了一次**同包内、行为保持型的大文件职责拆解**（见
`docs/desktop-megafile-decomposition-plan.md`）。仓库顶层结构不变；产品行为、
Hermes REST/JSON-RPC 协议、Electron IPC、identity、持久化与 UI 行为不变；
每个原始大文件保留为 barrel 或 composition root，公开导出面不变。

## 1. 基线

计划撰写时的基线（约 8,937 项 Desktop-only 裁剪暂存变更，当时 HEAD 为
`cfdbbb6`）在开工前已作为独立提交入库：

- `fb9b4fe chore(repo): reduce to a pure Hermes Desktop client`
  （8,937 files changed, 1969 insertions(+), 2593389 deletions(-)）

本轮全部阶段从其后继 `382915a` 开始。开工前核验：暂存区为空、无未暂存修改、
`apps/desktop/src/agentbox/` 与 `apps/desktop/src/plugins/agentbox-lab/`
两个 AgentBox POC 目录保持 untracked 且索引中 0 项。

## 2. 各阶段结果

| 阶段 | 文件 | before → after (行) | commit |
| --- | --- | --- | --- |
| A | `src/app/session/hooks/use-session-actions/index.ts` | 2635 → 119 | `204e792` |
| A | `src/app/session/hooks/use-session-actions/utils.ts` | 1821 → 41 (barrel) | `204e792` |
| A | `src/store/gateway.ts` | 1917 → 44 (barrel) | `204e792` |
| A | `src/store/session-states.ts` | 2029 → 89 (barrel) | `204e792` |
| A | `src/store/session.ts` | 1486 → 163 (barrel) | `204e792` |
| B | `src/sdk/index.ts` | 1780 → 482 | `f99fd88` |
| B | `src/store/projects.ts` | 1419 → 85 (barrel) | `f99fd88` |
| C | `electron/connection-registry.ts` | 1676 → 71 (barrel) | `5d8f147` |
| C | `electron/remote-lifecycle.ts` | 1700 → 60 (barrel) | `5d8f147` |
| D | `electron/main.ts` | 18291 → 17719 | `52110c5` |
| E | 9 个 UI/插件文件（见 §5） | 每文件拆出 view-model / 状态 / 对话框模块 | `d99b3cb` |
| — | eslint --fix 收尾（全部被改文件回到基线 lint 状态） | — | `fbd473b` |

### 阶段 A — Session/Harness 主链（`204e792`）

- `use-session-actions/`：`session-actions-options.ts`（共享契约）、
  `created-this-run.ts`、`usage-mirror.ts`、`fresh-draft.ts`、
  `session-create.ts`、`session-navigation-actions.ts`、`resume-session.ts`、
  `branching.ts`、`session-removal-actions.ts`；`index.ts` 保留为
  composition root（hook 调用顺序与 useCallback 依赖数组原样保留）。
- `use-session-actions/utils.ts` → barrel，拆出 `message-equivalence`、
  `resume-reconciliation`、`live-projection-merge`、`branch-messages`、
  `optimistic-session-rows`、`session-registry-lookup`、
  `runtime-info-mirror`、`gone-session-verdict`。
- `store/gateway/`：`registry-state`（HMR-stable 单例 + 激活权威 +
  turn-lease 台账）、`route-probes`、`secondary-pool`（连接池 + pin 会计 +
  ensure 门面）、`requests`、`leases`。分层无环。
- `store/session-states/`：`session-state-registry`（状态镜像 + tile 注册表
  机器，作为一个内聚整体保留，906 行）、`state-projections`、`owner-holds`、
  `bot-chat-scope`、`tile-delegate`、`tile-rebinding`、`tile-operations`。
- `store/session/`：`atoms`（原子银行 + 作用域持久化 setter + composer 选择，
  615 行；`setConnection` 会重扫 composer 选择，二者内联）、
  `navigation-memory`、`default-workspace`、`identity`、`list-merge`、
  `owner-hints`。

### 阶段 B — Plugin SDK 与 Projects（`f99fd88`）

- `sdk/`：`host-state`（只读原子视图）、`host-system`（logs / OAuth /
  navigation / events / request 门面）、`host-routing`（profile/agent 路由与
  retain）、`host-session`（open/scope/new-chat/focus）、
  `host-session-options`（公开选项类型）。`index.ts` 以 spread 组合出
  **同名同键**的 `host` 对象，contribution-ui 再导出块逐字保留，插件公开 API
  不变（`src/sdk/index.test.ts`、`profile-routing.test.ts`、
  `plugin-open-session-plan.test.ts` 全绿）。
- `store/projects/`：`scope`、`cwd-identity`、`gateway`（projects.* JSON-RPC
  管道）、`refresh`、`repo-scan`、`crud`（乐观写入）、`dialogs`、`worktrees`。
  分层无环：scope ← gateway/cwd-identity/dialogs ← refresh ← crud/worktrees。

### 阶段 C — Electron Connection/Remote 生命周期（`5d8f147`）

- `electron/connection-registry/`：`identity`、`route-resolution`、`roster`、
  `schema`（schema-normalization + update-eligibility）、`migration`、
  `registry-ops`（CRUD + primary/last-used + drift reconciliation）。
  包内私有助手（`localEntry`、`normalizedSshTarget`、`pickCanonicalConnection`、
  `LABEL_MAX`）仅包内导出，barrel 面不变。
- `electron/remote-lifecycle/`：`resolve`（安装定位 + 平台/更新门）、
  `ownership`（token/lockfile/pid 存活/陈旧清理/受管更新终止命令）、
  `spawn`（spawn 命令、readiness 刮取、端口转发、served-token 采用）、
  `connect`（编排器）。原文件通过末尾 export 块导出的全部名字逐字保留。

### 阶段 D — Electron composition root（`52110c5`）

main.ts（18,291 行）只提取了**自包含**的子系统到 `electron/composition/`：

- `log-buffer.ts` — desktop.log 缓冲/轮转/flush；`initDesktopLogBuffer`
  一次性传入日志路径；ring 读取经 `getRecentHermesLogLines`；退出时的
  定时器清理经 `cancelScheduledDesktopLogFlush`。
- `window-theme.ts` — 原生主题来源持久化、半透明状态、聊天窗 surface
  选项、titlebar overlay；main 仅经 `setRendererTitleBarTheme` /
  `setTranslucencyState` 修改两处活跃状态。
- `media-protocol.ts` — 预览文件元数据与预览常量（`registerMediaProtocol`
  本身是 composition root 的接线，留在 main.ts）。
- `wsl-fonts.ts` — WSL 字体修复。

**结构阻塞说明（按计划 §12 记录，非失败）**：main.ts 其余 ~17.7k 行是
boot 状态机、窗口生命周期、本地/registry 后端池与 121 个 IPC handler，
全部共享模块级单例（`mainWindow`、`poolLimits`、`bootstrapState`、
`connectionRegistryCache`、`ensureBackend`/`ensureRegistryBackend` 等）。
在不重新设计架构、不引入 service locator、不改变行为的本轮约束下，这些
职责无法安全抽成独立模块；按计划"内聚状态机可保留并解释"的条款保留。
main.ts 仍为唯一 composition root。

### 阶段 E — 大型 UI 与插件文件（`d99b3cb`）

| 文件 | 拆出 | 保留 |
| --- | --- | --- |
| `app/chat/sidebar/index.tsx` | `search-view-model.ts` | `ChatSidebar`（1950 → 主组件） |
| `app/skills/mcp-tab.tsx` | `view-model.ts` | `McpTab` |
| `app/settings/gateway-settings.tsx` | `settings-state.ts` | `ModeCard` + 表单组件 |
| `app/command-palette/index.tsx` | `palette-model.ts` | `CommandPalette` 等 |
| `app/chat/composer/index.tsx` | —（无干净接缝，整体保留并说明） | `ChatBar` |
| `app/cron/index.tsx` | `view-model.ts` | `CronView` |
| `plugins/kanban/board.tsx` | `board-state.ts` | `Card`/`Column` 等 |
| `plugins/hermes-bots/create-dialog.tsx` | `single-flight.ts`、`group-dialogs.tsx` | `CreateAgentDialog` |
| `plugins/hermes-bots/group-chat.ts` | `group-chat-state.ts`、`group-chat-sync-snapshot.ts` | 同步引擎 |

计划中"暂不因行数强拆"的四个文件
（`pane-shell/tree/store.ts`、`types/hermes.ts`、`global.d.ts`、
`assistant-ui/tool/fallback-model/index.ts`）未动。

## 3. 测试证据

- **最终门（一次性）**：
  - `tsc -p tsconfig.json / tsconfig.electron.json / tsconfig.e2e.json --noEmit`
    三个项目全部 0 错误。
  - 完整 Desktop Vitest：**9584 tests：9572 passed / 6 failed / 6 skipped**。
    6 个失败全部为 HEAD 基线已知失败，且已在干净 worktree（`git worktree`
    指向基线提交）逐文件对照复现，非本轮回归：
    - `electron/api-transport.test.ts`（1）
    - `electron/mcp-oauth-callback-ipc.test.ts`（3；计划记录为 2，基线复现 3）
    - `src/store/voice-prefs.test.ts`（2）
  - Desktop lint（`eslint src/ electron/`）：相对基线 `fb9b4fe`
    （142 problems / 0 errors / 142 warnings）**0 新增错误、0 新增警告**。
    未跟踪的 AgentBox POC 文件自身携带 lint findings，按纪律未修改。
  - Playwright collection：`npx playwright test --list` → **79 tests in 32
    files**，全部可收集。
  - `git diff --check` 干净；`git diff --cached --check` 干净。
  - AgentBox POC 目录始终 untracked、未修改（`git diff --cached --name-only |
    grep -ci agentbox` 每次提交前 = 0；期间一次误加已在提交前剔除并重做提交）。
  - 无残留 dev server / Electron / Hermes fixture 进程。
- **阶段门（各阶段提交前）**：阶段 A store 1497 通过 + session 800 通过；
  阶段 B projects/profile/dialog 156 + sdk 66 通过；阶段 C electron
  connection/remote 相关 254 通过；阶段 D 全 electron 2051 通过（5 个基线
  失败）；阶段 E UI/插件 199 文件 1720 通过。

## 4. 已知基线失败（非本轮引入）

| 文件 | 数量 | 计划记录 |
| --- | --- | --- |
| `electron/api-transport.test.ts` | 1 | 1 |
| `electron/mcp-oauth-callback-ipc.test.ts` | 3 | 2（基线复现 3，分布与计划略有出入，均为既有） |
| `src/store/voice-prefs.test.ts` | 2 | 2 |

以上均在干净 worktree 的基线提交上复现，本轮未触碰相关产品代码路径。

## 5. 遗留问题

1. `electron/main.ts` 仍有 ~17.7k 行（见 §2 阶段 D 的结构阻塞说明）。
   后续如需继续拆解，需要先做"共享单例 → 显式依赖"的架构级前置工作，
   属于计划明确排除的下一阶段范畴。
2. `resume-session.ts`（1345 行）、`session-state-registry.ts`（906 行）、
   `secondary-pool.ts`（~1000 行）、`group-chat.ts`（引擎部分）为按计划
   条款保留的内聚状态机/门面，未达"通常 800 行"的软指标，已逐一说明。
3. `src/store/session/atoms.ts`（615 行）中 composer 选择与
   `setConnection` 的重扫逻辑内生耦合，随 bank 保留。
4. 阶段 E 中 `host-state.test.ts` 曾被清理 glob 误删，已在 `d99b3cb`
   恢复（11 个测试全绿）；Phase B 提交（`f99fd88`）因此包含过一次该文件的
   删除，`fbd473b`/`d99b3cb` 已恢复，历史不再改写。

## 6. 结论

职责拆解完成。所有阶段 GREEN、独立提交、最终验收通过；未接 ACP、未接
AgentBox、未设计 Ports、未移动到新的 workspace 包，停留在"职责拆解完成"。
