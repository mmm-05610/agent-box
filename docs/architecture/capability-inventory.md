# Desktop 能力清单 —— 220 条入口归入四堆

这份文件的唯一目的：把今天 Hermes Desktop **认识的全部能力**摆出来，逐条归堆。
归堆之后，"哪些是核心、哪些该抽出去、哪些是我们额外加的"就不再是讨论，而是一张表。

## 0 · 口径：这 220 条是什么

数的是前端**能向后端发起的入口**，两批：

| 批次 | 位置 | 条数 |
|---|---|---|
| REST 面 | `apps/desktop/src/api/*.ts` 13 个模块的导出（含约 10 个常量/底座函数） | 178 |
| 会话主链 RPC | `session.*` / `prompt.*` / `tool.*` / `turn.*` / `model.options` 等方法名 | ~50 |

**不包含**：界面自己做的事（面板、分屏、主题、快捷键、桌宠）、纯前端状态、以及工作区机器能力
（文件树 / Git / 终端 / 预览走 Electron main，不经后端）。
所以这份清单回答的是"前端向后端要什么"，不是"前端能干什么"。

## 1 · 四堆的判据

| 堆 | 判据 | 一句话 |
|---|---|---|
| **一 · 核心** | 换任何 harness / 任何 profile 都原样成立 | 协议级的会话工作台 |
| **二 · Harness 独有** | 只在一个 harness 上成立，或表达的是某个 harness 的产品概念 | 要抽出去，声明式暴露 |
| **三 · 工作台额外** | 单个 harness 给不了，只有"综合工作台"能提供 | 我们存在的理由 |
| **四 · 应用自身** | 跟任何 harness 都无关，服务"这个 app 自己" | 运维，不属于能力体系 |

**归类看概念，不看今天的实现。** 一条能力今天只接 hermes，不等于它是 hermes 独有——
比如"定时触发一个会话"今天只触发 hermes，但它的概念是工作台的，归第三堆。

**升格是进核心的唯一通道**：一项能力在 **≥2 个 harness** 上原生成立、且语义能对齐，才允许从第二堆升进第一堆。

---

## 2 · 第一堆 · 核心（约 45 条）

> 判据：任何一个 harness 接进来，这些都必须工作。协议缺哪条，就隐藏哪条的入口——不是灰掉、更不是点了报错。

### 2.1 会话主链（RPC）

| 入口 | 说明 |
|---|---|
| `session.create` / `session.new` / `session.activate` / `session.close` | 建立与切换会话 |
| `session.list` / `session.next` / `session.prev` | 会话枚举 |
| `prompt.submit` | 提交一轮 |
| `session.interrupt` | 中断（注意：取消是最终态，不是命令回执） |
| `session.history` / `session.resume` / `session.save` | 历史与恢复 |
| `session.info` / `session.title` / `session.status` | 会话元数据 |
| `session.usage` / `session.context_breakdown` | 用量与上下文 |
| `session.cwd.set` / `session.workspace.move` | 工作目录 |
| `turn.result` | 回合终结 |
| `tool.start` / `tool.progress` / `tool.generating` / `tool.complete` | 工具调用四态 |
| `model.options` | 可选模型（能力缺失 → 不显示选择器） |

### 2.2 会话与项目列表（REST）

`fetchSidebarSessions` · `fetchSessionsPage` · `fetchAllProfileSessionsPage` · `pageWindowSessions` ·
`resetSidebarBatchCapability` · `searchSessions` · `getSession` · `getSessionMessages` ·
`fetchLatestSessionMessages` · `getOlderSessionMessages` · `getAllSessionMessages` ·
`renameSession` · `deleteSession` · `setSessionArchived` · `setSessionUnreadRemote` ·
`setSessionPinnedRemote` · `scanSessionPullRequests`

### 2.3 模型与连接

`getGlobalModelInfo` · `getGlobalModelOptions` · `getRecommendedDefaultModel` · `setGlobalModel` ·
`getProfiles` · `createProfile` · `renameProfile` · `deleteProfile` ·
`exportProfileArchive` · `importProfileArchive`

> 注意：这里的 profile 只是**"连哪台机器、用谁的凭据"**这一层。profile 的其余含义（人格、bot、账号池）在第二堆——**今天它们是一个词，换 harness 后必须拆成两个**（见 §6）。

### 2.4 工作区（不经后端，列在此处是为了对齐）

文件树 · 文件读写 · diff / 审查 · 终端 · 预览 · 附件与图片。
这些由 Electron main 提供，协议不管；但它们**是核心的一部分**，因为任何 harness 都需要。

---

## 3 · 第二堆 · Harness 独有（约 100 条）

> 判据：只在一个 harness 上成立。**不许进核心目录**，只能以"声明 + 版位"的形式出现。

按维度归，不按 harness 归——五个 harness 各列一张表永远对不齐，按维度一眼看得出谁有谁没有。

### 3.1 审批与沙箱

`session.yolo` · `session.control` / `session.control.read` / `session.control.update`

### 3.2 推理与预算（协议表达不了的一类）

配置键：`agent.reasoning_effort` · `agent.max_turns` · `agent.service_tier` ·
`agent.tool_use_enforcement` · `agent.api_max_retries` · `agent.image_input_mode` · `agent.personalities`

### 3.3 上下文管理

`session.compress` · `session.redirect` · `session.reclaimed`

### 3.4 会话谱系

`session.branch`（今天只有 hermes 有；fork 在协议级是通用概念，见 §6）

### 3.5 交互形态

`prompt.btw`（旁聊/临时只读会话）

### 3.6 直连配置面（hermes 的 config 全组）

`getHermesConfig` · `getHermesConfigRecord` · `getHermesConfigDefaults` · `getHermesConfigSchema` ·
`saveHermesConfig` · `saveHermesConfigRecord` · `config.get` / `config.set` ·
`getEnvVars` · `setEnvVar` · `deleteEnvVar` · `revealEnvVar` ·
`validateProviderCredential` · `getCustomEndpoints` · `saveCustomEndpoint` · `validateCustomEndpoint` ·
`activateCustomEndpoint` · `deleteCustomEndpoint` ·
`listOAuthProviders` · `disconnectOAuthProvider` · `startOAuthLogin` · `submitOAuthCode` ·
`pollOAuthSession` · `cancelOAuthSession`

### 3.7 记忆与整理器

`getMemoryProviderConfig` · `saveMemoryProviderConfig` · `startMemoryProviderOAuth` ·
`getMemoryProviderOAuthStatus` · `getMemoryStatus` · `resetMemory` ·
`getCuratorStatus` · `setCuratorPaused` · `runCurator`

### 3.8 学习与谱系可视化

`getStarmapGraph` · `getLearningNode` · `editLearningNode` · `deleteLearningNode`

### 3.9 工具集系统

`getToolsets` · `setToolsetEnabled` · `getToolsetConfig` · `getToolsetModels` ·
`selectToolsetModel` · `selectToolsetProvider` · `runToolsetPostSetup`

### 3.10 多模型编排

`getAuxiliaryModels` · `getMoaModels` · `saveMoaModels` · `setModelAssignment`

### 3.11 用量统计（服务端口径）

`getUsageAnalytics` —— 今天只有 hermes 算得出来。**概念上属于第三堆**（跨 harness 汇总），
等第二个 harness 接进来再上移。

### 3.12 Profile 的产品含义

`getProfileSoul` · `updateProfileSoul` · `getProfileSetupCommand`
`profile.default` / `profile.create` / `profile.export` / `profile.import` / `profile.next` / `profile.prev`

---

## 4 · 第三堆 · 工作台额外能力（约 60 条）

> 判据：单个 harness 给不了。**这一堆才是这个 app 存在的理由。**

| 能力 | 今天的入口 | 今天的状态 |
|---|---|---|
| 定时触发任意 harness | `cron.ts` 全 12 条 | 有，只触发 hermes |
| 被消息/webhook 触发任意 harness | `messaging.ts` 全 11 条（含 webhook） | 有，只触发 hermes |
| 一份技能库喂给所有 harness | `getSkills` · `getSkillContent` · `setSkillEnabled` · `getOfficialSkills` · `getSkillHubSources` · `searchSkillsHub` · `previewSkillHub` · `scanSkillHub` · `installSkillFromHub` · `uninstallSkillFromHub` · `updateSkillsFromHub` | 有，只喂 hermes |
| 一份 MCP 配置喂给所有 harness | `mcp.ts` 全 8 条 | 有，只喂 hermes |
| 给所有 harness 供本地模型 | `local-models.ts` 全 16 条 | 有 |
| 语音输入输出 | `transcribeAudio` · `speakText` · `setTtsLease` · `getElevenLabsVoices` + 4 个超时常量 | 有 |
| 终端后端选择 | `getTerminalBackends` · `selectTerminalBackend` | 有 |
| 桌面操作（computer use） | `getComputerUseStatus` · `grantComputerUsePermissions` | 有 |
| 机器上的 git 托管凭据 | `getGhAuthStatus` | 有 |
| 会话导入与迁移 | `app/session-import/` | 有 |
| 并行多 agent 看板 | `plugins/kanban/` | 插件雏形 |
| 跨 harness 会话列表 | —— | **没有** |
| 跨 harness 接力（A 的会话交给 B 继续） | —— | **没有** |
| 跨 harness 统一审查 | —— | **没有** |
| 跨 harness 搜索 | —— | **没有** |
| **混编流水线**（同一条任务里 codex 写、claude 审、hermes 发消息） | —— | **没有** |

最后一条是杀手能力：前三堆的一切，都是为了让这一条成立。

---

## 5 · 第四堆 · 应用自身（约 15 条）

> 跟任何 harness 都无关，服务"这个 app 自己"。**不该和前三条混在一个体系里。**

`updateHermes` · `checkHermesUpdate` · `getActionStatus` · `restartGateway` ·
`runDoctor` · `runSecurityAudit` · `runBackup` · `runDebugShare` ·
`getStatus` · `getLogs`

底座（不是能力，是通道）：`client.ts` 全 13 条 · `plugins.ts` 3 条（`activeConnection` / `pluginRest` / `pluginSocket`）

---

## 6 · 填不进去的：六件要你拍板的事

这六条是真正需要判断的，其余 210 多条都是搬运。

| # | 边界 | 两边的理由 | 我的建议 |
|---|---|---|---|
| 1 | **profile** | 核心要"连哪台机器、用谁的凭据"；hermes 的 profile 还带人格、bot、账号池 | **拆成两个词**：连接（核心）+ 人格/bot（第二堆） |
| 2 | **技能** | 它既是某个 harness 的扩展载荷（第二堆），又是工作台统一库（第三堆） | **拆开**：库和工作台管理面归第三堆；"这个 harness 怎么加载技能"归第二堆声明 |
| 3 | **子代理可见性** | 今天 hermes 里不可见（第二堆）；但 codex/Claude Code 都有子代理，它明显该是核心 | 先确认另外两个有没有 → 有就**进核心**（这是升格规则的第一个真实用例） |
| 4 | **会话分支 / 续接** | 今天只有 hermes 有 `session.branch` | 若协议级 fork 成立 → **进核心**；否则留第二堆 |
| 5 | **computer use / 终端后端** | 是工作台的机器能力，还是某个 harness 的能力 | 归**第三堆**（机器能力由工作台提供，harness 只是使用者） |
| 6 | **用量统计** | 今天只有 hermes 服务端算得出来 | 今天留第二堆；跨 harness 汇总的目标形态归**第三堆** |

---

## 7 · 读数

| 堆 | 条数 | 占比 |
|---|---|---|
| 一 · 核心 | ~45 | 20% |
| 二 · Harness 独有 | ~100 | 45% |
| 三 · 工作台额外 | ~60 | 27% |
| 四 · 应用自身 + 底座 | ~15 | 7% |

**这就是"前端为什么必须瘦"的数字证据**：今天前端认识约 220 条，其中真正属于核心的只有 45 条。
其余 175 条，要么是某个 harness 的产品面，要么是工作台额外的，要么是 app 自己的运维——
它们全都不该长在核心上。

**下一步**：§6 的六条定了，第一堆的边界就定了。第一堆定了，前端架构就定了。
