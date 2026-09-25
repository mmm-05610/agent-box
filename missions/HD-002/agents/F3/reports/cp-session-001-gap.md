# F3 域 CP-SESSION-001 验收面缺口盘点（只读实测，非交付声明）

时间：2026-09-23 10:52 +0800 · 树：`worktrees/harness-desktop-002/f3` @ `d534b16a03`（父 = FE baseline1 `d44a5f8e2c`）
读法：下列每条都是本轮 `grep`/`sed`/`git merge-tree` 实测，不含推测；行号属本树，集成后需按 baseline2 复核。
目的：应 C-0012「盘点候选是否满足…对话内交互、右栏移除」与 I-PROJECT-REQUIRED-001「每个阻塞给代码事实」。

## 1. 检查点验收面 → F3 域现状

| 检查点条目（SESSION-CHECKPOINT.md §本阶段验收面） | F3 域现状 | 证据 |
| --- | --- | --- |
| 权限/输入请求在对话中可达并可响应，不串会话 | **部分**：面板已有完整可操作实现，但只在右区；对话区仅「报数 + Review 跳转」。不串会话已成立 | `plugins/agent/interactions/src/view.tsx:52`（`filter(item => item.sessionId === selectedSessionId)`）、`:18-49`（fields/choices/confirm/input/editor + `service.respond` + 错误 `role=alert`）；`plugins/agent/interactions/src/entry.tsx:9`（`region:'right'`）；`conversation/src/view.tsx`（`.agent-pending` 只渲染计数 + `commands.execute('agent.interactions.open')`） |
| 空辅助区不常驻 | **未做**：`right` 常驻注册仍在 | `interactions/src/entry.tsx:9` |
| 流式文本、思考、工具过程/结果及产出不伪造 | **已具素材**：工具 `running/completed/failed` + `data-tool-state`；部分流式参数原样显示不丢 | `conversation/src/view.tsx:63-68`（`prettyJson` + `ToolPart`） |
| model/思考强度切换不启用 | **已具素材**：`hiddenOptionIds = {model, thinking, effort}` 且其它 supported 项照常渲染（UI-only，契约不动） | `conversation/src/view.tsx` 顶部与 options filter |
| 停止请求与终态/未知不混淆 | **已具素材**：`data-status` 原样投影，`unknown` 独立文案 ≠ failed | `conversation/src/view.tsx`（`agent-run-state`、`Run outcome unknown after disconnect.`）；`d534b16a03` gate 1 |
| 新对话草稿 / 首条创建 / 续聊 | **阻塞**：无 `selectedSessionId` 时整块对话不渲染，草稿无处可输入 | `conversation/src/view.tsx` 末段 `if (!sessionId) return <…Choose a session…>` |
| 必须选有效项目，否则不得发送 | **契约缺位**：FE 全线无项目字段 | `contracts/agent/src/agent.ts:81-91`（`newSession(): Promise<string>`、`send(sessionId,text)`）、`:98-104`（`AgentWorkspaceSnapshot` 无项目）、`:106-118`（`AgentSessions` 无项目） |

## 2. 决定 B4 形态的新证据（推翻 F3-0004 §B4 的「乙案便宜」假设）

- `contracts/workbench/src/workbench.ts:4` 区域每个视图一条 `region`，但 `plugins/workbench/src/shell.tsx:117`：`activeViews = views.filter(v => … selection[model.regionOf(v)!] === v.id)` —— **同一区域每帧只渲染被选中的那一个视图**。故把 `agent.interactions` 注册成第二个 `main` 视图不能与对话并存，「对话内」只能靠组合进对话组件本身。
- 跨包 import 的成本实测：现有插件之间**零**互相 import（`grep '@extensions/' plugins/agent/*/src/*` 只命中 `ordessa.contracts` 与 `ordessa.agent-contracts` 两个契约包），`plugins/agent/interactions/package.json` 无 `exports` 字段且 `private: true`。因此「interactions 导出、conversation import」会新建**第一条 plugin→plugin 依赖边**，与 `AGENTS.md`「Lumino 负责插件依赖解析」及 FC-0014「不能在此包暗加」相触。
- 结论：FC-0014 原本的**甲案（卡片实现迁入 conversation bundle）是唯一不新增依赖边的路径**；F3-0004 §B4 建议的「留包内 + 导出」作废（见 F3-0005 更正）。代价是 `SESSION-BASELINE-TARGET.md` 前端目标树里 `interactions/ 对话内审批/输入响应` 这一行需要 FC/C 一并处置（保留包但改承载说明，或本批从产品清单撤下），该处置不属 F3 写域。

## 3. baseline2 移植实测（只读，未碰索引/工作树）

`git merge-tree --write-tree --merge-base=d44a5f8e2c 8c676d20e2 d534b16a03`：

- 唯一冲突 = `plugins/agent/conversation/src/entry.tsx`（三方 `76bfb56eea`/`9bfc6a75c3`/`deff4df539`），成因：F2 在 P2-3A 把 `CommandsToken`/`agent.open`/`SessionBrowser`/navigation 移出该文件，而 `d534` 的 `commands={commands}` 需要该 token。
- 卡片迁入对话后不再需要命令跳转 → 丢该 hunk 即无冲突；`view.tsx` 与其余 4 路径自动合并。
- 起点未收口：候选 `8c676d20e2` 含 `4915e9a15e` 但**不含** F2-0003 的 `8c89691491`（Sessions 连接段删除），`integration/checkpoint.json` 仍 `FE_BASELINE1_VERIFIED_BE_OFFLINE_ONLY_NOT_PAIRED`。

## 4. 本盘点不声称的事

不代表任何验收项已通过；不改他树、不改契约、不改产品清单/lock；F3 在收到 baseline2 精确 SHA 与包裁定前保持源码零写入。

## 5. FC clean 基线 `3527affc2a` 上的开工可行性（FC-0021 §F3 指派的只读核账，2026-09-23 10:58 +0800）

- 该基线含 `b7ac3d4312`（F2 P2-3A）、`8c676d20e2`、`362dddd15f`（F0 探针）、`630adf0300`（F1 reconnect 闸）、`3527affc2a`（F2 选择恢复/唯一注册测例）。
- `git show 3527affc2a:plugins/agent/conversation/src/entry.tsx`：已是 F2 形状 —— requires 仅 `WorkbenchToken/AgentSessionsToken`，`component: () => <Conversation service={sessions} />`。→ 素材的右栏 hunk 丢弃后**无共享面冲突**。
- `git show 3527affc2a:plugins/agent/conversation/src/view.tsx`：`:26 ToolPart({toolName,args,result})` 仍是旧形（无 failed 态/无 `data-tool-state`/无 `argsText` 原样显示），`:68 Conversation({service})`，`:72 if (!sessionId) → Choose a session`。→ 卡片落点与草稿 composer 的改动位置确认。
- `git merge-tree --write-tree --merge-base=d44a5f8e2c 3527affc2a d534b16a03`：唯一冲突仍 = `conversation/src/entry.tsx`（三方 `9bfc6a75c3`/`deff4df539`），`view.tsx` 自动合并。
- **卡片迁入 conversation bundle 不需要任何新增依赖边或契约**：`contracts/agent-ui/src/contract.ts` 全文只有两行 `export * from '../../connections/src/connections'` + `export * from '../../agent/src/agent'`，故 `AgentInteraction`/`InteractionAnswer` 已可从 conversation **现在就已依赖**的 `@extensions/ordessa.agent-contracts/contract.js`（`conversation/src/entry.tsx:3` 同一 specifier）取用；`respond(interactionId, answer)` 亦已在 `AgentSessions`（`contracts/agent/src/agent.ts:116`）。
- 产品清单事实：`products/agent-desktop/extensions.json` 现 enabled 含 `ordessa.agent-interactions`；按 FC-0024 由其单写撤下，F3 不写该文件与 lock。
