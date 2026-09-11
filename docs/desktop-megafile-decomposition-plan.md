# Hermes Desktop 大文件职责拆解实施计划

## 1. 任务定义

目标仓库：

```text
/home/maoqh/projects/agent-box-desktop-next
```

本轮执行一次**同包内、行为保持型的大文件职责拆解**。

本轮不设计最终架构，不接入 ACP 或 AgentBox，也不重新安置最终包。只把已经形成的巨型
文件按其现有职责拆成同一 package 内的小模块，使下一阶段可以基于清晰的职责块判断：

- 哪些属于 Harness；
- 哪些属于 Workspace；
- 哪些属于 Desktop Host；
- 哪些属于 Plugin SDK；
- 哪些只是 UI 与客户端状态。

最终应满足：

```text
仓库顶层结构基本不变
产品行为不变
协议与公开接口不变
大文件职责被拆开
每个新模块有单一、可说明的职责
```

## 2. 当前基线与开工前提交

当前工作区包含已经完成的 Desktop-only 裁剪：

- 约 8,937 项已暂存变更；
- 未暂存修改应为 0；
- HEAD 为 `cfdbbb6`；
- 暂存快照已经独立完成 typecheck 和 test collection 验证；
- 当前裁剪状态为 `DESKTOP_EXTERNAL_HERMES_RUNTIME_ONLY_PARTIAL`；
- `apps/desktop/src/agentbox/` 与
  `apps/desktop/src/plugins/agentbox-lab/` 是既有未跟踪 AgentBox POC。

开工前必须：

1. 运行 `git diff --cached --check`；
2. 确认未暂存修改为 0；
3. 确认两个 POC 目录仍为 untracked，索引中为 0 项；
4. 确认暂存内容属于 Phase 1/Phase 2 Desktop-only 裁剪；
5. 把当前暂存裁剪提交为独立 baseline commit；
6. 提交后再次确认除 POC 外工作树干净。

禁止把 POC 纳入提交。禁止 reset、checkout 覆盖、删除 POC 或改写历史。

## 3. 允许和禁止的改造

### 3.1 唯一允许的改造形态

```text
原大文件
  → 同目录或紧邻子目录中的多个单职责模块
  → 原文件保留为兼容入口、barrel 或 composition root
```

必须保持：

- public exports；
- 调用方 import 路径，能不改就不改；
- Hermes REST/JSON-RPC method、event 和 payload；
- Session/Profile/Connection identity；
- 持久化 key 和文件格式；
- Electron IPC channel 和 preload surface；
- UI 行为、文案和交互；
- Plugin SDK 对插件暴露的公共 API；
- local/remote/cloud/SSH 路由行为；
- error、fallback、retry 和 timeout 语义。

### 3.2 明确禁止

- 不接 ACP；
- 不接 AgentBox；
- 不修改或纳入 AgentBox POC；
- 不新建跨 workspace 架构包；
- 不设计 HarnessPort、WorkspacePort 或其他最终 Ports；
- 不改变协议；
- 不进行产品功能重写；
- 不顺手修复无关历史缺陷；
- 不删除、skip、ignore 或放宽测试；
- 不把职责重新堆进万能 `utils.ts`、`helpers.ts`、`manager.ts`、`service.ts`；
- 不用循环依赖作为理由引入全局 service locator；
- 不为了行数指标机械切割紧密状态机。

每个新模块必须能用一句话说明其唯一职责。

## 4. 阶段执行与测试纪律

不要每移动一个函数就运行完整测试。以一个大阶段为单位：

1. 先盘点该阶段目标文件的职责和依赖；
2. 完成该阶段全部职责拆解；
3. 做 import/export 和 TypeScript 静态检查；
4. 统一运行该阶段相关定向测试和 typecheck；
5. 只修复本阶段拆解造成的回归；
6. 阶段门 GREEN 后提交独立 commit；
7. 才能进入下一阶段。

完整 Desktop Vitest、完整 lint 和完整 E2E 只在最终阶段运行一次。遇到基线失败时必须与
baseline/HEAD 对照，禁止为了变绿修改无关产品逻辑。

## 5. 阶段 A：Session/Harness 主链

按顺序拆解：

1. `apps/desktop/src/app/session/hooks/use-session-actions/index.ts`
2. `apps/desktop/src/app/session/hooks/use-session-actions/utils.ts`
3. `apps/desktop/src/store/gateway.ts`
4. `apps/desktop/src/store/session-states.ts`
5. `apps/desktop/src/store/session.ts`

建议用于识别既有职责的方向：

```text
use-session-actions/
├── create-resume-open
├── submit
├── cancel
├── approval-confirm-clarify
├── attachments
├── optimistic-state
└── routing-identity

store/gateway/
├── connection
├── request
├── event-routing
├── gateway-pool
├── reconnect
└── profile-routing

store/session-states/
├── identity
├── projection
├── registry
├── focus
├── event-application
└── lifecycle
```

这些名称只是职责提示，不要求照抄，也不代表创建新架构。不得改变 Session/Hermes 语义。

阶段门：renderer typecheck、上述模块相关 Vitest、`git diff --check`，随后提交。

## 6. 阶段 B：Plugin SDK 与 Workspace 状态

拆解：

1. `apps/desktop/src/extension/sdk/index.ts`
2. `apps/desktop/src/store/projects.ts`

建议职责方向：

```text
sdk/
├── public-types
├── readonly-state
├── host-actions
├── session-actions
├── profile-routing
├── contribution-ui
└── request-facade

store/projects/
├── identity
├── registry
├── path-normalization
├── recent-projects
├── open-select-actions
└── local-remote-routing
```

只拆职责，不把 SDK 改成 Ports，不改变插件公开 API。

阶段门：renderer typecheck、SDK/Projects/Plugins 相关 Vitest、`git diff --check`，随后提交。

## 7. 阶段 C：Electron Connection/Remote 生命周期

拆解：

1. `apps/desktop/electron/connection-registry.ts`
2. `apps/desktop/electron/remote-lifecycle.ts`

按现有逻辑区分：

```text
connection-registry/
├── schema-normalization
├── migration
├── CRUD
├── primary-last-used
├── route-resolution
└── update-eligibility

remote-lifecycle/
├── resolve
├── bootstrap
├── spawn
├── readiness
├── ownership
├── reconnect
└── shutdown
```

不得改变 SSH、remote、cloud、profile 或 Hermes 行为。

阶段门：Electron typecheck、connection/remote/SSH 相关 Vitest、`git diff --check`，随后提交。

## 8. 阶段 D：Electron composition root

最后处理：

```text
apps/desktop/electron/main.ts
```

这是最高风险阶段。只允许提取已经存在的职责，禁止重新设计架构。建议目的地：

```text
electron/composition/
├── backend-composition.ts
├── connection-composition.ts
├── ipc-registration.ts
├── window-composition.ts
├── update-composition.ts
└── app-lifecycle.ts
```

最终 `main.ts` 继续是唯一 composition root，只负责调用提取后的模块，不得变成新的全局
框架。必须保持：

- Electron app 生命周期；
- single-instance；
- tray/quit；
- backend ownership；
- 进程回收；
- 窗口创建顺序；
- IPC 注册时机；
- update exit gate；
- error reporting 和日志顺序。

阶段门：Electron typecheck，以及 main/backend/window/lifecycle/quit/update 相关 Vitest，
`git diff --check`，随后提交。

## 9. 阶段 E：大型 UI 与插件文件

在 A–D 全部 GREEN 后，处理：

```text
apps/desktop/src/app/chat/sidebar/index.tsx
apps/desktop/src/app/skills/mcp-tab.tsx
apps/desktop/src/app/settings/gateway-settings.tsx
apps/desktop/src/app/command-palette/index.tsx
apps/desktop/src/app/chat/composer/index.tsx
apps/desktop/src/app/cron/index.tsx
apps/desktop/src/plugins/kanban/board.tsx
apps/desktop/src/plugins/hermes-bots/group-chat.ts
apps/desktop/src/plugins/hermes-bots/create-dialog.tsx
```

只提取：

- 子组件；
- view-model derivation；
- dialog/panel sections；
- event handlers；
- 纯格式化和状态转换；
- 已存在的 orchestration 子职责。

不改变 UI、文案、交互，不重新设计 Kanban 或 Hermes Bots。

以下文件暂不因行数强拆：

```text
apps/desktop/src/components/pane-shell/tree/store.ts
apps/desktop/src/types/hermes.ts
apps/desktop/src/global.d.ts
apps/desktop/src/components/assistant-ui/tool/fallback-model/index.ts
```

它们目前主要是内聚算法或合同库存，不属于本轮职责屎山。

阶段门：UI/plugin 相关定向 Vitest、renderer typecheck、`git diff --check`，随后提交。

## 10. 拆解质量门

- 原入口文件应尽量压缩成清晰的 composition/barrel；
- 新模块通常不超过 800 行；
- 不应产生新的 1,200 行以上职责混合文件；
- 内聚状态机若无法安全降到 1,200 行以下，可以保留并解释，禁止为数字强拆；
- 不得新增循环 import；
- 不得增加跨层反向依赖；
- public export 不得漂移；
- 不得把测试实现细节导出成生产 API。

每个阶段必须记录：

- 原文件行数与当前行数；
- 新文件清单；
- 每个新文件的一句话职责；
- public API 是否变化；
- 调用点是否变化；
- 测试命令和结果；
- 本阶段发现并修复的回归；
- 已知基线失败；
- commit SHA。

## 11. 最终验收

所有阶段结束后只运行一次最终门：

1. Desktop renderer/electron/e2e 三个 TypeScript project typecheck；
2. 完整 Desktop Vitest；
3. Desktop lint；
4. Playwright collection；
5. `git diff --check`；
6. 检查 POC 仍未修改、未暂存、未提交；
7. 检查无 dev server、Electron、Hermes fixture 等残留进程。

完整测试若仍出现此前已确认的 5 个 HEAD 基线失败：

- `api-transport.test.ts` 1 项；
- `mcp-oauth-callback-ipc.test.ts` 2 项；
- `voice-prefs.test.ts` 2 项；

必须做精确 baseline 对照并如实报告，不得视为新回归，也不得现场放宽测试。

最终新增或更新目标仓文档：

```text
docs/desktop-megafile-decomposition.md
```

内容包括 before/after、模块职责、测试证据、各阶段 commit 和遗留问题。

最终停止在“职责拆解完成”。不得进入 ACP、AgentBox、Ports 或最终包安置。

## 12. 阻塞与回退规则

如果某阶段无法在同包、同行为、同公开接口条件下解决循环依赖或结构阻塞：

1. 保留已经 GREEN 的前序阶段；
2. 回退当前未完成阶段；
3. 精确记录依赖环、文件和阻塞原因；
4. 不带病进入下一阶段；
5. 不擅自扩大架构范围。
