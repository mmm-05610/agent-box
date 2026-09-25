# LNX-001 · desktop 两实现线证据登记（chat 线 vs settings 线）

- 仓库：`/home/maoqh/projects/agent-box-desktop-next`（对象库；下文所有 git 命令在该目录以
  `git --no-optional-locks` 只读执行）。工作树：chat 线
  `/home/maoqh/projects/agent-box-desktop-next-wsl-round1` @ 08b4eac7，settings 线
  `/home/maoqh/projects/agent-box-desktop-settings-round1` @ 01083212。
- 基点（两侧 merge-base，已复核 `git merge-base feature/agentbox-desktop-product feature/agentbox-desktop-settings`）：
  `b8c2e0b6eb5301c48b91598e94a191d9f7be934a`。下文 "chat 侧" = `b8c2e0b6..feature/agentbox-desktop-product`，
  "settings 侧" = `b8c2e0b6..feature/agentbox-desktop-settings`。
- 提交数（chat 87 / settings 117）为主会话实测，本文不重复统计。
- 本文全程只读（log/show/diff/merge-base/rev-list/diff-tree），未运行任何测试/构建。

## 0 测试入口（声明事实，均未执行）

- `apps/desktop/package.json`（settings 线 tip 读取，两侧对该文件无改动）：
  `test`=`vitest run`；`test:ui`=`vitest run --project ui`（include `src/**/*.test.{ts,tsx}`，
  vitest.config.ts:10）；`test:desktop:platforms`=`vitest run --project electron`（include
  `electron/**`、`scripts/**`、`e2e/**/*.unit.test.ts`，vitest.config.ts:26）；
  `check`=`check:lint && test:ui && test:desktop:platforms && test:desktop:all`；
  `test:e2e`=`npm run build && playwright test e2e/`。
- `tests-js/` 是独立 workspace（根 package.json workspaces 含之），自带
  `test`=`vitest run`、`check`（chat 树 `/home/maoqh/projects/agent-box-desktop-next-wsl-round1/tests-js/package.json`）。
- `apps/shared/package.json`：仅 settings 线新增 `test`=coverage-gap.mjs、
  `test:run`=`cd ../desktop && npx vitest run --project shared`（diff b8c2e0b6..01083212 -- apps/shared/package.json）。
- `apps/desktop/e2e/p*-driver.mjs`（两侧共 8 个新驱动）不在任何 npm script 里，属手动活体取证脚本。
- 两侧 `package.json` 的 vitest/e2e 脚本本体都没被改；唯一 runner 面改动是 settings 线
  `apps/desktop/vitest.config.ts` 增加 `shared` project（6f78e73f）。

## 1 chat 侧能力组（用户可见）

文件归属用 `git log --format='%h %s' b8c2e0b6..feature/agentbox-desktop-product -- <path>` 复核。

| 组 | 代表提交 | 文件 | 行为变化 | 依赖 | 测试入口 |
|---|---|---|---|---|---|
| C1 侧栏展示/选择"只有服务知道"的 Workspace（含 WSL 去重） | 720db96d, aa589e3c, fb61af52, e67d6a79, daea675e | `src/application/workspace/workspace-projection.ts(+test)`、`src/types/workspace.ts`（`WorkspaceBackend` 增 `'service'`）、`src/store/workspace-view.ts`、`src/features/chat/sidebar/chat-sidebar.tsx`、`sidebar/workspace-list/{workspace-list,workspace-row}.tsx`、`src/app/composition/wiring/agentbox-main-chat.ts` | 第三类工作区行进入列表/搜索/选择，按服务端 `environment{host,kind,user}`、`distribution/rootPath` 原样呈现并与本地/WSL 行去重（`wsl:${distribution}:${rootPath}` 键，aa589e3c） | 读服务端 catalog 既有字段，未动 wire-v1.ts | `workspace-projection.test.ts`、`service-workspace-rows.test.tsx`；`test:ui` |
| C2 模型控制冷启动自举 + 模型引用可读化 | 828e0114, 35e07b40, bf26cd0f（P42）；b27a4b4f（P37） | `features/chat/composer/{composer-model-selector,profile-controls,model-pill}.tsx(+test)`、`hooks/use-composer-profile.ts(+test)`、`src/application/profile/wire-composer-profile.ts(+test)`、`src/lib/composer/types.ts` | 冷启动零点击出模型控件，含 loading/retry 脸；两条 pill 路径共用一个 resolver | profile/describe 读面（wire） | 同名 `.test.tsx`；活体 `e2e/p42-model-control-bootstrap-driver.mjs` |
| C3 发送路径诚实化（retry 经 submit、队列行绑定、双击重试只发一次） | 43fbb5d2（P32 stage6） | `src/features/chat/agentbox-chat-view.tsx:242,:286,:346`（`composerSurfaceId`/`ComposerSurfaceProvider`） | 注册 composer surface，使 retry 意图走 submit 而非 insert | 后端 queue/turn 协议（两条后端事实随单交回，见 43fbb5d2 正文） | 手动 `e2e/p32-send-path-driver.mjs` |
| C4 "Thought for N" 改由 wire 时间戳决定，秒表降级为 ≈ 估计 | c124787e（P56） | `src/components/chat/activity-timer.ts:57 stampDurationSeconds`、`:92 thoughtLabelFor`、`thread/message-parts.tsx:18,:163`；新测试 `activity-timer.stamps.test.ts` | 时长以记录自带 stamp 为准；无 stamp 才用秒表并加 `≈`；两者皆无则只说"想过" | reasoning part 的 `timestamp/completedAt`（assistant-runtime 层透传，message-parts.tsx:282-284） | `activity-timer.stamps.test.ts` |
| C5 语言切换后已挂载工具卡换语言 | 8badac3f（P69） | `tool/fallback.tsx:44,:399`（`withRuntimeI18nLocale`）、`src/i18n/runtime.ts`（新函数）+`runtime.test.ts`、新测试 `tool/fallback-locale.test.tsx` | locale 成为 buildToolView memo 的真实依赖 | 无后端依赖 | `fallback-locale.test.tsx` |
| C6 远程网关媒体 URL 去 token（header/blob 方案） | 4e8f9374（P54） | `src/lib/desktop-fs.ts:298 mediaRemoteDownloadUrl、:313 mediaRemoteAuthHeaders、:327 mediaRemoteObjectUrl、:348 openRemoteMediaFile、:431 resolveMediaDisplaySrc 分支`；`markdown-text.tsx` 同步改 | 渲染层不再拿到 `?token=`；OAuth 无 renderer token 时 `mediaRemoteAuthHeaders` 返回 null（拒发无凭证请求） | Hermes REST header `x-hermes-session-token` | `media.remote.test.ts`、`tests-js/desktop-no-token-urls.test.ts` |
| C7 转录 markdown 信任边界定档 | 80d62a1d（P57） | `components/assistant-ui/markdown-text.tsx`、`src/lib/markdown-html-depth.ts`、新测试 `markdown-text.trust-boundary.test.tsx` | sanitize/harden 事实写死并有门 | streamdown@2.5.0 / rehype-sanitize@6.0.0（80d62a1d 引 C-51） | `markdown-text.trust-boundary.test.tsx` |
| C8 状态栏可访问命名 | 445b98ba（P38） | `app/shell/chrome/statusbar/statusbar-controls.tsx` + 新测试 `statusbar-naming.test.tsx` | 交互项以其已有文本命名 | 无 | 同名测试 |
| C9 Review 文件树纯键盘可用 | 0b6344a5（P53） | `features/right-sidebar/review/file-tree.tsx` + 新测试 `file-tree.keyboard.test.tsx` | role/tabIndex/键盘补全 | 无 | 同名测试 |
| C10 文案门族（No-literals-in-JSX 咬合门、截断悬停兜底 OverflowTip、产品名） | 9ee320d4、763a25d2（P58）；302ad823、50d40c89（P59）；a449b2e6 | `src/dev/contracts/jsx-copy-literals.test.ts`、`src/dev/contracts/truncation-tip-coverage.test.ts`；`composer/model-pill.tsx`、`right-sidebar/files/{remote-picker,tree}.tsx`、`use-project-tree.ts` | 三处截断统一接同一个 OverflowTip；JSX 字面量门 | 无 | 两个 `dev/contracts/*.test.ts`（在 `ui` project glob 内） |
| C11 Windows 全屏退出重挂 backdrop | 008623fa、b03d3485（P41a） | `electron/windows/window-theme.ts`、`apps/shared/src/translucency.ts`、新测试 `tests-js/desktop-backdrop-reassert.test.ts` | 玻璃聊天窗离开全屏重设 DWM 背景 | Windows DWM（**Windows 特有点，Linux 主线预期不继承其语义**） | `tests-js` `vitest run` |

chat tip 08b4eac7（P70 阶段 1）只改 `docs/desktop-product-delivery/status.md`（+26），是观测记录不是代码。

## 2 settings 侧能力组（用户可见）

| 组 | 代表提交 | 文件 | 行为变化 | 依赖 | 测试入口 |
|---|---|---|---|---|---|
| S1 thought.delta 进入转录 + parts 按服务事件序渲染 | 139ac21c、7318d33b（P35/R-0073） | `src/application/session/wire-session-projection.ts(+test)`、`agentbox-chat-view.tsx:45 thoughtPart、:64 partsInServiceOrder、:149、:190`（未认领 thought 自成行） | 思考段按事件序落进所属消息行；以 `emittedAt` 定死起止；无思考则不渲染块 | wire `thought.delta` 事件与 `emittedAt` | `wire-session-projection.test.ts`、`p35-event-order.test.ts`、`agentbox-chat-view.test.ts` |
| S2 子代理可见性（委派行、运行清单、"hierarchy unknown"） | cd6ed791、8657193c、9c6f541c、ef46b6fb、17955165（P36） | `src/lib/tool-view/delegation.ts(+test)`、`tool/delegate-wire.ts(+test)`、`features/chat/work-status-panel.tsx(+test)`、i18n 6 份各 4-5 键 | 从本会话 tool 调用推导在飞委派；wire 没给的字段显式标"未提供" | 无新 wire 面（自述 wire 不传 subagent 事件） | 同名测试 |
| S3 AgentBox 路径工具卡展开/收起 + changed-files diff | 41f6095f、e9fe3d3c、113dd50e、e091b367（P43） | `thread/changed-files-card.tsx(+test)`、`tool/p43-wire-result-disclosure.test.tsx`、`lib/tool-view/index.ts`、`store/review.ts(+test)`、`right-sidebar/review/index.tsx`、`agentbox-chat-view.tsx:347-359`（`$agentBoxTranscript` effect） | wire 形状 result 可展开；local/remote/失败三态 diff 卡 | 后端工单 52 的 `resultExcerpt`（e9fe3d3c）；`window.hermesDesktop` review 面 | 同名测试；手动 `e2e/p43-agentbox-transcript-observation.mjs` |
| S4 Retry 要么发出要么明说 | a0f9e597、ad51faf5（P41b） | `thread/assistant-message.tsx`、`agentbox-turn-failure.test.tsx`、i18n `retryNotSent` | 重试失败不把草稿喂回输入框 | 无 | 同名测试 |
| S5 模型/服务商页从服务事实说话：harness 目录、三态、provider facts、上游模型可勾选 | 911e0255、3c532018、d67f9c23（P39）；d6115294（P46 观测）；e5b4d697（P50）；3ec01999、1b6bcd2e、5c03b5ba、ea40965c（P40）；7e314ab2、90ee31a1、3eb47e13、01083212（P28） | `features/settings/agentbox-model-settings.tsx(+test)`、`provider-presets.ts(+test)`、`application/profile/profile-maintenance-port.ts`、`store/agentbox-service.ts`、`features/profiles/index.tsx`、i18n `settings.product.models.*` 等 | 声明顺序/声明事实直读；not-ready、unreachable、真未声明三态分文案；上游拉回的模型并入记录 | **唯一动过 wire 契约面的一条线**：`src/types/wire/wire-v1.ts`（7e314ab2 hello.harnesses、P28 provider facts）+ 再生成 `docs/desktop-product-delivery/contracts/wire-v1/generated/wire-v1.schema.json`（生成工件） | 同名测试、`wire-v1.provider-facts.test.ts`、手动 `e2e/p39-harness-catalog-driver.mjs`、`p40-three-truths-driver.mjs`、`p46-real-service-catalog-driver.mjs` |
| S6 i18n 目录完整性与量词/时长本地化 | 68e82636、eb146af2、1d98f766、9c60e97a（P48） | `src/i18n/catalog-integrity.test.ts`（新）、`src/lib/keybinds/labels.ts(+test)`、`activity-timer.ts:41`（`formatElapsed(seconds, labels)`）、`activity-timer.test.ts`（新）、`activity-timer-text.tsx`、`assistant-message.tsx`、`message-parts.tsx`、`tool-view/format.ts`、`lib/tool-view/tool-view-labels.test.ts` | 六语言键集齐（4 个 open-record 前缀除外）；`12s`→"12 秒"一族；`CountNounKey` 封闭联合 | 无 | `catalog-integrity.test.ts`、`activity-timer.test.ts`、`labels.test.ts` |
| S7 禁原生 title= 门 + 清 27 处 | 10f7c2f6…c57ef351（P49） | `components/ui/__tests__/no-native-title.{test,scan}.ts(x)` 及 pet/plugins/settings 等 20+ 组件 | 悬停不再靠浏览器原生 tooltip | 无 | `no-native-title.test.ts` |
| S8 DESIGN.md 路径声明门 | aacf2e6e（P51） | `src/docs/design-paths.test.ts`（新）、`apps/desktop/DESIGN.md` | 文档声称的目录必须存在 | 无 | 同名测试 |
| S9 prefers-reduced-motion 落到 rAF Loader | 2b8074ec、0ff43929（P52） | `components/ui/loader.tsx(+reduced-motion.test.tsx)`、`diff-count.tsx` | 减弱动效时 rAF 停摆 | 无 | `loader.reduced-motion.test.tsx` |
| S10 远程媒体走受管协议（与 C6 同题不同解） | 42245f47（hand-back）、8a54a984（P55 stages 2-3） | `src/lib/desktop-fs.ts:287 managedRemoteMediaUrl、:298、:320-321`、`media.remote.test.ts` | 远程 media/流一律 `hermes-media://remote/<file>?connectionId&profile`，凭证留在主进程 | 主进程协议 handler（既有） | `media.remote.test.ts` |
| S11 shared 包测试 runner | 6f78e73f、6ba5a375（P47/QA-012） | `apps/desktop/vitest.config.ts`（+`shared` project）、`apps/shared/{package.json,scripts/coverage-gap.mjs,src/vitest.setup.ts}` | `@hermes/shared` 测试文件从无人执行变为有 runner 并度量缺口 | 无 | `npm run test --workspace apps/shared`（声明） |
| S12 lint 卫生（import 顺序 7 文件 + 拷贝守卫正则去冗余转义） | a59d6efc…76edb75b（P34） | `agentbox-sessions/*`、`chat-bar.tsx`、`product-copy-guard.test.ts` 等 | 无行为变化 | 无 | lint/typecheck |

## 3 公共转录渲染重叠（重点）

方法：`git diff b8c2e0b6..feature/agentbox-desktop-product -- <file>` 与
`...feature/agentbox-desktop-settings -- <file>`。改动量（shortstat）：

| 文件 | chat | settings |
|---|---|---|
| thread/message-parts.tsx | +11/−18 | +1/−1 |
| tool/fallback.tsx | +10/−4 | +1/−1 |
| chat/activity-timer.ts | +84/−7 | +12/−2 |
| chat/agentbox-chat-view.tsx | +11/−3 | +159/−43 |

- **activity-timer / "Thought for N"：同一逻辑的两种演进，两侧行为必须同时保留。**
  chat P56 把标签决策改为记录优先（activity-timer.ts:57 `stampDurationSeconds`、:92
  `thoughtLabelFor`，message-parts.tsx:163 改调它并删掉原三分支）；settings P48 把
  `formatElapsed` 签名改为 `formatElapsed(seconds, labels)`（settings 树
  activity-timer.ts:41，:43 `labels.durationSeconds(String(seconds))`），调用点
  message-parts.tsx（settings 树 ~:173 单行改传 `t.assistant.thread`）。合并后 chat 的
  `thoughtLabelFor` 内部对 `formatElapsed` 的调用（activity-timer.ts:97 一带）必须适配
  settings 的新签名，否则 chat 的 `activity-timer.stamps.test.ts` 与 settings 的
  `activity-timer.test.ts` 必有一侧红——两个测试文件同名不同体、互不冲突但断言不同签名。
  另外 settings 注释自认 `M:SS` 钟面形是否产品决策"没人写过"（settings 树
  activity-timer.ts:31-38 注释），chat 的 `≈` 降级标记与 settings 的本地化秒单位落在同一
  输出串上，两义并存需重推。
- **message-parts / fallback：改动互补但同文件近距冲突。**
  chat fallback.tsx:399 `withRuntimeI18nLocale(locale, () => buildToolView(...))`（P69 语言
  热更新）与 settings fallback.tsx:462 `copy.details.searchResults`（P48 退役硬编码英文）
  同在 `ToolEntry` 一个函数内、相距约 60 行——文本冲突概率中等、语义正交，两者都须存活。
- **agentbox-chat-view：正交能力挤在同一片。**
  chat 只在 imports（:18）与 JSX 体加 surface id/Provider（:242/:286/:346，P32 retry 走
  submit）；settings 重写了消息构建函数（:45 `thoughtPart`、:64 `partsInServiceOrder`、
  :149/:190 调用）并加 `$agentBoxTranscript` effect 与 `delegations` prop（:347-359/:408）。
  两侧都改 import 头部与组件函数体——合并必冲突，但无一处是"同一行为的两个答案"（不同于
  §5 的 media）。注意巧合：settings 的 thoughtPart 输出
  `timestamp/completedAt`（Unix 秒），chat 的 thoughtLabelFor 恰好消费这两个字段——是互补
  而非重复；该咬合只能靠运行验证，不能从 diff 断言。

## 4 i18n 重叠与键位差异

两侧都改 `ar/en/index/ja/ru/types/zh-hant/zh`（chat 另改 `runtime.ts(+runtime.test.ts)`）。
键位差异方法（可复现）：

```
git show <branch>:apps/desktop/src/i18n/en.ts | python3 /tmp/i18n_keys.py   # 递归键路径集合
git diff b8c2e0b6..<branch> -- apps/desktop/src/i18n/en.ts                  # 权威逐行核对
```

- en.ts：base 3454 键；chat 净 +7/−1（`sidebar.serviceWorkspace.{envLocal,envSsh,envWsl}`、
  `composer.modelSelector{Loading,Retry,Unavailable}`、`rightSidebar.unreadableRow`；删
  composer 子树 formatter 键 `harness: name => 'Harness: ${name}'`，随 a25a5adb 调用点一起
  删）；settings 净 +53（assistant.thread.duration*/wireFiles*/retryNotSent、
  assistant.tool.counts.*/details/subagentFact*、settings.product.models.* 等）。
  **两侧新增键交集为空**（comm 对 chat-only/settings-only 集合输出 0 条共有新增）→ 无
  同键重复定义风险，只有插入位置相邻的行冲突。
- **真正的不一致在覆盖面**：chat 的新键只写进了 en/zh/zh-hant（chat 线 ja.ts 的 diff
  新增行数 = 0；`git show feature/agentbox-desktop-product:apps/desktop/src/i18n/ja.ts |
  grep envWsl` 无结果），settings 的新键六语言全齐。`define-locale.ts` 的
  `TranslationOverride` 使 ja/ar/ru 是 en 的 deep-partial 覆盖（types 不会红），但 settings
  线的 `src/i18n/catalog-integrity.test.ts` 要求除 4 个 open-record 前缀外全语言 leaf 路径
  一致 ⇒ **合流后 chat 的 3 语言新键会被 settings 的门判红**（从源码推断，未运行）。
  这是键位之外最实际的门冲突。
- types.ts：两侧各加各的（chat 4 个 hunk：2326/2571/2604/3262 行域；settings 10 个 hunk：
  40/411/456/2549/2849/3467-3653 行域），源行窗口不重叠 ⇒ 文本大概率可并。但 types.ts 是
  `Translations` 唯一形状源、**两条线都在写它（非单写者接缝）**——它作为"谁先写谁定形"的
  接缝属性只在未来单写者化之后才成立。
- index.ts：同一处相邻两行两侧各改一行（chat 在 `./runtime` 导出行加
  `withRuntimeI18nLocale`；settings 在 `./types` 类型导出行加 `CountNounKey`）→ 必小冲突、
  语义正交。

## 5 desktop-fs.ts / media.remote.test.ts 重叠与平台相关性

- 两侧同题异解，且都在**逐字重写 base 的同一函数**
  `mediaExternalUrl`（b8c2e0b6 版 ~:280-296，即工单 AUD-F-030 点名的
  `desktop-fs.ts:294` token-in-URL）：
  - chat P54（4e8f9374）：拆出 token-free 下载 URL（:298）+ header 凭证
    `x-hermes-session-token`（:313，OAuth 返回 null）+ 异步 blob
    `mediaRemoteObjectUrl`（:327，调用方负责 `URL.revokeObjectURL`）+ 无桥远程分支改走
    blob（:431）。
  - settings P55（8a54a984）：远程两路 media 全收敛到受管协议
    `hermes-media://remote/...`（:287/:298/:320-321），凭证留主进程 handler。
  裁定单（chat 228f0d24、settings 84ef0f1c）要求"优先 hermes-media；否则 blob 且**两树
  同形**"——两树实际各取一边；settings 42245f47 明记"跨树读取被禁、无法核实同形"。
- `media.remote.test.ts`：两侧都改写 base 同一个测试
  `'rewrites gateway-local paths to an authenticated download URL'`（~:58），断言互斥
  （chat：URL 无 token + header/blob 新 describe；settings：精确 `hermes-media://remote/…`
  期望值 + 五种连接形态的"任何可产出 URL 的解析后 searchParams 无 token"门）。
  **合并后该文件同一实现只能绿一侧**；这是全部重叠面里唯一的"同一逻辑两个答案"。
- OAuth 远程 + 无 `window.hermesDesktop` 桥的边缘：chat 的
  `resolveMediaDisplaySrc→mediaRemoteObjectUrl` 在 `mediaRemoteAuthHeaders()` 为 null 时
  抛错（chat :327-345 代码），settings 则解析成协议 URL——两解的用户可见结果不同（从
  diff 可见，未运行）。
- **平台相关性**：desktop-fs/media 两侧改动都不含 OS 路径逻辑（`filePathFromMediaPath`
  本体未动）；Linux 相关性是间接的——`hermes-media` 协议的注册在 electron 主进程、跨平台
  行为需 Linux 验证。真正的平台事实：chat C1 组含 WSL distro+rootPath 去重
  （workspace-projection.ts，aa589e3c）；chat C11 是 Windows-DWM 专属；两侧证据文档反复
  登记的 4-7 个 electron live-loopback 预红家族（含 `wsl-path-bridge*.test.ts`）属
  electron project，是 Linux 主线必踩的已知红。

## 6 main 分支（e08fa034）独有 11 提交的性质

可复现：

```
git rev-list --count b8c2e0b6..main                      # = 11
git log --oneline b8c2e0b6..main                          # 9 docs 提交 + 2 merge
git log --no-merges --name-only --format= b8c2e0b6..main | sort -u | grep -vE '^docs/|^\.agents/|^$'   # 空
git diff-tree --no-commit-id --name-only -r e08fa034       # 仅 .agents/skills/incremental-work-order/** 3 个删除
```

- **9 个非 merge 提交确属纯文档/skill**：36 个唯一文件，全在 `docs/**` 与
  `.agents/skills/incremental-work-order/**`（其中 e08fa034 只是删 skill 影子副本，与 chat
  9d0d126d/P44、settings e17004e6/P45 是三线独立做的同一清理）。
- **但"11 个提交只改文档"整体不成立**：39901ad9、86945468 两个 merge 相对 first-parent
  引入大量产品源码（`git diff --name-status ffbcfaf9 39901ad9 | head`——含
  `electron/host-capabilities/platform/wsl-workspace*.ts` 等 Q1 内容）。其 second parents
  （ee721f5d=Q1 tip、b6932ea2=Q2 tip）**都已是 b8c2e0b6 的祖先**
  （`git merge-base --is-ancestor ee721f5d b8c2e0b6` 与 `... b6932ea2 b8c2e0b6` 均真），
  所以这两个 merge 对产品代码**零净新增**，只是把 Q1/Q2 并入 main 的第一父链。
- 陷阱登记：`git diff --name-only b8c2e0b6..main` 显示 181 文件/14325 删除——那是
  tree-diff 的双向噪声（b8c2e0b6 在 b6932ea2 之后还含两功能线共用的底座工作，main 没有），
  主会话"8 个文件"口径无法由上述任一命令复现，更接近的是 9 个非 merge 提交里 skill 的
  3 删除 + docs 33 —— 结论以"非 merge 提交全 docs、merge 提交零净新增"为准。

## 7 无法从 diff 确认的语义 / 风险

1. 远程媒体两解（blob vs hermes-media）的最终形态裁定是产品决策，diff 只能证明两树已
   偏离"两树同形"裁定；OAuth-远程-无桥路径两解行为不同（§5），需运行验证。
2. chat P56 与 settings P35 在 `timestamp/completedAt` 字段上的咬合是字段名巧合级别的
   一致，合并后 `thoughtLabelFor` 是否真拿到 settings 落的 stamp 无法静态断言。
3. catalog-integrity 门对 chat 3 语言新增键的判红是从源码推断（测试未运行）。
4. 两侧证据文档登记的四项门（tsc/lint/build/vitest）与 4-7 个 electron live-loopback 预红
   均为账面事实；Linux 环境下该家族红/绿状态未知。
5. wire-v1.ts 与生成 schema 只有 settings 线演进（hello.harnesses、provider facts）；
   chat 线依赖的 wire 字段（P33 catalog environment、P56 stamps）是否已在契约文件中登记，
   两侧 diff 均未显示新增契约字段——无法确认契约完备。
6. 两侧 e2e driver 的活体结论（PASS/FAIL 计数）只存在于 docs evidence，未复核。
7. `.agents/skills/incremental-work-order/**`、`docs/desktop-product-delivery/**` 中的
   规程（写路径互斥、单执行者声明等）是否对合流仍有约束力，属 I 的裁定范围。

## 8 历史文档登记（不得恢复调度权威）

以下路径改动属旧调度体系，按 AGENTS.md 仅保留为历史：

- `docs/desktop-product-delivery/work-orders/**`：chat 侧 39 文件、settings 侧 31 文件。
- `docs/desktop-product-delivery/evidence/**`：chat 侧 36 文件、settings 侧 86 文件。
- `docs/desktop-product-delivery/work-orders/queue.json`：两线各有"QUEUE: 声明本队列为
  单执行者"提交（chat 2fd70c9b、settings 641f2664）——纯调度历史。
- `docs/desktop-product-delivery/{worktree-charter.md,status.md}`：两线各 1+。
- `docs/desktop-product-delivery/contracts/wire-v1/{README.md,generated/wire-v1.schema.json}`：
  settings 侧 2 文件——**schema.json 是生成工件**（生成器为 `wire-v1.ts` 的
  `wireJsonSchemas()`，见 wire-v1.ts:12-16 头注），登记时与手写文档区分。
- `.agents/skills/incremental-work-order/**`：chat 4 文件、settings 4 文件、main 3 删除；
  三线各自删除/影子化（9d0d126d、e17004e6、e08fa034）。
- 两线所有 `ops 轮 N / charter / dispatch / ledger / 账` 前缀提交（chat 约 40+、settings
  约 40+，见各自 `git log --oneline b8c2e0b6..<branch>`）：正文只动上述 docs 路径者，
  登记为历史调度文本，不构成产品能力。

产品代码 / 测试 / 生成工件三类已在 §1/§2 表内逐组区分：测试一律以 `*.test.ts(x)`、
`tests-js/**`、`e2e/*.mjs`（手动）标注；生成工件仅 wire-v1.schema.json 一处；其余为产品
源码。
