# CURRENT_UI_AUDIT — Agent-Box Studio 现有 UI 审计

> 本轮仅设计审计与高保真方案，未修改任何产品代码。
> 审计基线：分支 `studio-shell`，commit `ed66f4d7` 附近工作区状态。
> 审计方法：全量阅读 `src/app/globals.css` 关键段落 + 三路并行组件盘点（App Shell 布局层 / 会话流与 Composer 层 / Execution Tree 与设计系统基座）+ Web Interface Guidelines 对照。

---

## 0. 总评

这是一套**工程质量很高、token 纪律不足**的 UI。Keep-alive 面板、虚拟化消息流、流式状态机、防 FOUC、WebKit rem 缩放兼容等底层实现属于同类产品中的上乘水准；但视觉层缺少一份"宪法"——三级圆角并存、约 15 处硬编码调色板色、accent 语义过载、五类 banner、三套工具卡容器并存。**本轮设计重构的主战场是 token 纪律与信息层级，不是交互逻辑。**

---

## 1. 页面结构（App Shell 解剖）

### 1.1 入口与窗口层

| 层 | 实现 | 说明 |
|---|---|---|
| Provider 栈 | `src/app/layout.tsx` | Intl → Theme → Appearance + `WindowResizeGrips`；内联脚本防暗色白闪（layout.tsx:48-56，`#09090b`） |
| 路由分发 | `src/app/page.tsx` | desktop→`/workspace`，web→token 校验→`/login` 或 `/workspace` |
| 窗口骨架 | `src/app/workspace/layout.tsx` `FolderLayoutShell`（:915-958） | `fixed inset-0 flex-col bg-background`；可选背景图两层 `-z-10`（图片 + `color-mix` 遮罩） |
| 垂直顺序 | 同上 | `WorkspaceChromeController` → `TopBar` → `FolderWorkspaceShell` → `StatusBar` → `AppToaster` |

### 1.2 三栏主体（`workspace/layout.tsx:788-899`）

- `ResizablePanelGroup` 水平三分：**Sidebar**（`ws-surface-sidebar`）| **main**（内嵌垂直组：WorkspaceContent 72% + TerminalPanel 28%）| **AuxPanel**。
- 中列 `WorkspaceContent`（:290-447）再横分：会话 56% / 文件 44%（fusion 模式，`DEFAULT_FUSION_LAYOUT` :91）。
- 非会话路由是 `absolute inset-0 z-40 bg-background ws-transparent-bg` 覆盖层（:427）。

### 1.3 Chrome 各条

- **TopBar**（`top-bar.tsx:94`）：`h-10 bg-muted`，左簇 6 个 ghost 按钮统一 `GHOST_BUTTON` 常量（:32-33），中间 `project › session` + 分支徽章（:157），右簇 terminal/aux 切换 + `WindowControls`。
- **Sidebar**（`sidebar.tsx`）：`@container/sidebar` 容器查询；h-10 头部、`rounded-full` 导航行（:135）、会话列表、底部账户行（:658）。
- **AuxPanel**（`aux-panel.tsx`）：h-10 标签条 + 分段控件槽；窄宽度自动折叠为 dropdown（`shouldCollapseAuxTabs` :55-63）。
- **StatusBar**（`status-bar.tsx:35`）：`h-8 border-t text-xs text-muted-foreground`，左 QuickActions+Stats，右 Update/Tasks/Command/Alerts 四簇。

### 1.4 会话流

- **虚拟化主链路**：`message-list-view.tsx` 按 turn 分组 → `virtualized-message-thread.tsx` 用 virtua `Virtualizer`（bufferSize=800、gap=16），每行 `mx-auto max-w-3xl px-4`；use-stick-to-bottom 吸底。
- **视觉形态**（`ai-elements/message.tsx`）：
  - 用户消息 = 右对齐气泡 `rounded-lg bg-secondary px-4 py-3 ws-msg-secondary`（毛玻璃，:77）；
  - AI 消息 = 全宽无底色行；
  - 工具调用/子代理 = 胶囊 pill `rounded-full bg-primary/10 ws-msg-chip`（`agent-capsule.tsx:88`）+ 可展开体（`rounded-md border border-border/60`）；
  - 委托卡 = 大卡片 `rounded-lg border bg-card ws-msg-card`（`delegated-sub-thread.tsx:98`）。
- **Composer**（`message-input.tsx:1864`）：`codeg-composer-chrome rounded-xl border border-foreground/20`，聚焦 `focus-within:border-ring ring-[3px]`；底部状态行；发送区为分体式按钮（send + steer/fork 附加菜单，:1701-1741）。

### 1.5 Execution Tree 现状

- **`src/features/agentbox/execution-tree/` 是空目录**——命名先于实现，执行树 UI 尚不存在。
- 现有近似形态是"委托卡片"：`DelegatedSubThread`（内联单行卡）、`SubAgentOverlay`（左下浮层 `w-72 rounded-xl bg-card/60 backdrop-blur`）、`DelegationStatusGroupCard`（轮询合并卡）。
- **BindingBar**（`features/agentbox/components/binding-bar.tsx:138-168`）：composer 上方五段 pill（harness·profile·model·sandbox·continue），设计完整但**当前无任何非测试消费方**（G7 接线未完成）。

---

## 2. 视觉不一致

### 2.1 Token 纪律

| 问题 | 证据 |
|---|---|
| 硬编码调色板色约 15 处 | `collapsible-system-message.tsx:40-41`（yellow-500）、`reply-artifacts.tsx:176`（green-600/500）、`plan-card.tsx:63`（red-700/500）、`ai-elements/tool.tsx:55-61`（五色）、`pi-project-trust-banner.tsx:351`（red-500/700）、`profiles-settings-section.tsx:329,351,510`（text-red-400 直写） |
| GitHub 系 hex 未走主题变量 | `globals.css:1851-2018`（`#2ea043/#1f6feb/#cf222e/#f85149` 等，git/终端装饰色） |
| "成功绿"三种写法 | green-600 / emerald-500 / green-500 并存（delegation-status-badge / task-card / types.ts:752） |
| amber 与 yellow 混用 | delegation-status-badge.tsx:34（amber-500）vs types.ts:752（yellow-400） |
| Windows 关闭红硬编码 | `window-controls.tsx:110`（`#e81123/#c50f1f`，可 token 化） |
| 字号碎片化 | layout 目录：`text-xs`×94、`text-sm`×45、`text-2xs`×20、`text-3xs`×11，另有 `text-[0.625rem]`×6 等任意值与 `text-2xs` 语义重复（`sidebar.tsx:86` vs `globals.css:1039`） |
| 透明度漂移 | `bg-card`、`/40`、`/50`、`/60`、`/95` 与 `border-border`、`/40`、`/60`、`/70` 无规则散布（plan-card.tsx:165 vs delegated-sub-thread.tsx:98 vs reply-artifacts.tsx:133） |

### 2.2 形状与激活态

- **三级圆角并存**：卡片同时存在 `rounded-md`（tool-call-block.tsx:27）、`rounded-lg`（plan-card.tsx:165 等 5 处）、`rounded-xl`（permission-dialog.tsx:101 等 3 处）三种规范。
- **同族元素不同圆角**：sidebar 导航行 `rounded-full`（:135）、branch-tree-collapsible.tsx:29 `rounded-xl`、同文件 :31 `rounded-lg`、branch-dropdown.tsx:616 `rounded-md`。
- **激活/选中态四套**：TopBar toggle `bg-accent`（:175,:188）、sidebar 路由行 `bg-sidebar-primary/8`（:139）、view pill `bg-accent`（:184）、command-dropdown `bg-accent/60`（:283）。
- **分隔线三层制**：`border-border`、`border-border/50`、`ws-chrome-border`/`ws-strip-line` 混用（sidebar.tsx:349-350 移动/桌面各一套）。

### 2.3 工具卡三套皮肤

1. 旧 `tool-call-block.tsx`：`rounded-md border text-xs`，错误态 `bg-destructive/5`；
2. 新 `agent-capsule.tsx`：`rounded-full bg-primary/10` pill，错误体 `bg-destructive/10 p-3`；
3. `ai-elements/tool.tsx:33`：`rounded-md border-border/60` + Badge 状态色。

三者不共享容器 token，用户在同一条会话里能看到三种工具调用的长相。

---

## 3. 组件重复

- **双顶栏**：`app-title-bar.tsx`（h-8/h-11，center slot）与 `top-bar.tsx`（h-10，手写三簇）是并行的两套标题栏。
- **徽标样式三处复制**：`sidebar.tsx:550,636`、`quick-actions-dropdown.tsx:211,220` —— 相同的 mono 计数芯片，未提取。
- **死代码**：`message-bubble.tsx`（旧气泡样式）除测试外无引用；`tool-call-block.tsx` 仅剩 2 处引用。
- **疑似复制文件**：`sub-agent-session-dialog.tsx`（108 行）与 `subagent-session-dialog.tsx`（260 行）仅差一个连字符。
- **巨型分发器**：`content-parts-renderer.tsx`（约 2900 行）单文件承担全部 part 渲染，另有 `part-renderer-dispatch.tsx` / `tool-renderer-dispatch.tsx` 并存。
- **Banner 五处**：session-failure、session-config-stale、pi-project-trust、composer-connection-status，外加 conversation-shell.tsx:372 与 :383 两段 className 完全同构的 destructive 条。
- **双 Mac 判定**：`top-bar.tsx:66-67` 同时用 `useIsMac()` 与 `usePlatform().isMac`。
- **设置入口重复**：`top-bar.tsx:207` 与 `sidebar.tsx:668` 各自调 `openSettingsWindow`。
- **四套同构布局逻辑**：`workspace/layout.tsx:546-762` 的 build/apply/handle×2 是复制粘贴式 ref+clamp 模式。
- **双选择器体系**：agent-selector.tsx（747 行独立实现）与设计完好的 BindingBar 并存，多 harness 选择实际仍走前者。

---

## 4. 信息层级问题

1. **accent 语义过载**：同一 token 既当分支标签底色（top-bar.tsx:157）、面板激活态（:175,:188）、侧栏 pill 激活（sidebar.tsx:184），弱化了每一处的辨识力。
2. **错误与重试不可分**：conversation-shell 顶/底部共 5 类横条插入位，边界都是 `border-t border-destructive/20 bg-destructive/5`——"致命错误"与"自动重试中"长得一样。
3. **嵌套深度无规则**：assistant 全宽无底色、工具胶囊 `bg-primary/10`、委托卡 `bg-card` 之间没有统一的表面层级阶梯；胶囊体 `mt-3` 悬空于 pill 下方（agent-capsule.tsx:152），视觉归属弱。
4. **status bar 无主次**：四簇全部 `text-xs text-muted-foreground`，Update/Tasks/Command/Alerts 无视觉权重差。
5. **辅助层级靠字号碎片**：`text-3xs`/`text-2xs`/`text-xs` 混排代替分组与留白。

---

## 5. 可访问性

### 5.1 缺口（按 Web Interface Guidelines 对照）

| 问题 | 证据 |
|---|---|
| icon-only 按钮缺 aria-label | `top-bar.tsx` 全文件仅 Search 有；PanelLeft（:105）、SquareTerminal（:172）、PanelRight（:185）、Settings（:207）只有 `title`；toggle 无 `aria-pressed` |
| 展开控件缺 aria-expanded | `tool-call-block.tsx:34`（无 aria-expanded/aria-controls） |
| 拖拽手柄无键盘替代 | `message-queue-display.tsx:59`（GripVertical 无 aria-label、无键盘排序） |
| 历史轮次 dimming 无语义 | `message-list-view.tsx:731` 用 `opacity-70` 表达 |
| disabled 双重淡化 | `sidebar.tsx:141` `text-muted-foreground/60 opacity-70`，可能低于 4.5:1 |
| 低对比小字 | `text-3xs`（10px）在 muted 底上多处（agent-capsule.tsx:114、message-queue-display.tsx:64） |
| 无 high-contrast 支持 | 仅两处 `prefers-reduced-motion`，无对比度增强档 |

### 5.2 已达标（好的范例）

- Button 统一 `focus-visible:ring-[3px] ring-ring/50`（ui/button.tsx:8）；原生按钮 `focus-visible:ring-2 ring-inset`（sidebar.tsx:138,648）。
- 虚拟化 viewport `tabIndex=0` + `focus-visible:ring-2 ring-inset` + `data-focus-origin` 区分指针/键盘焦点（virtualized-message-thread.tsx:228-266）——WCAG 2.4.7 意识很强。
- `workspace-degraded-banner.tsx` 带 `role="status" aria-live="polite"`；WindowControls 全部 aria-label。
- aux-panel.tsx:307-312 用 `hidden` 而非 `sr-only` 防单 tab 陷阱，有明确推理注释。
- globals.css:23-35 对 WebKit rem 钉死 bug 的防御（`line-height: 1.5em`）注释质量极高。

---

## 6. 必须保留的优秀实现（重构红线）

以下实现是本轮视觉重构**不可破坏**的资产，任何视觉改动不得触碰其行为契约：

1. **防 FOUC**（layout.tsx:47-56）：CSS-only 暗色底 + hydration 前 appearance 注入；新主题若改默认暗色值须同步内联脚本。
2. **`usePanelSlideOnToggle`**（workspace/layout.tsx:151-174）：240ms 面板滑动动画仅在用户切换时触发，hydration/拖拽不动画。
3. **`KeptMountedSurface`**（:199-219）：`inert` + `invisible` 保持会话挂载不丢滚动位置，并堵住 Monaco visibility 与 portal 逃逸两个真实 bug。
4. **虚拟化 + 吸底 + 反向分页**（virtualized-message-thread.tsx）：`LOAD_OLDER_THRESHOLD_PX`、显式 prependEpoch/scope 防跳屏、memo 骨架。
5. **流式状态机**（agent-capsule.tsx:75-85）：运行→完成自动折叠、非错误→错误自动展开、Shimmer 流式标题。
6. **队列系统**（chat-input.tsx）：排队消息拖拽排序/编辑/删除 + steer 失败回落 enqueue。
7. **断点恢复 / 离线首发**（chat-input.tsx:69-76）：`allowOfflineCompose` 懒建会话。
8. **ws-surface / ws-msg 表面体系**（globals.css:1063-1330）：背景图开/关的零回归组合式设计（无 base 规则 + color-mix 降级）——这是极精细的工程，新 token 必须兼容此契约。
9. **缩放体系**：`text-2xs/3xs` 用 rem 联动（globals.css:1039-1043）、`--radius` 乘法式刻度（:1017-1031）——任何新字号/圆角必须走 rem。
10. **shell store slice 模式**（features/shell/store.ts）：7 context 合并为单 zustand store，TopBar 收窄订阅只订布尔值。
11. **delegation-card.ts 纯函数状态解析**（:587-617）：优先级链 + 宽容解析，单真相源。
12. **像素级 rail 对齐**（status-bar.tsx:41-54、sidebar.tsx:498-505）：状态栏图标与侧栏导航图标锁定同一轴线，随 zoom 缩放。

---

## 7. 与目标定位的差距总结

目标定位："Codex 的工作台信息架构 + ZCode 的暖黑紧凑视觉语言 + Agent-Box 的多 Harness/Profile/Execution Tree 特征"。

| 维度 | 现状 | 差距 |
|---|---|---|
| 暖黑视觉语言 | 12 个 data-theme 预设全是冷灰（neutral/zinc/slate…），无暖调炭黑预设 | 需新增暖黑主题为默认，且 light 对应暖纸白 |
| 单一 accent | `--accent` 在 shadcn 体系里是"悬停底色"，真正的品牌 accent 缺位；语义过载 | 需分离 `--brand-accent`（琥珀，品牌）与交互 accent（悬停/选中），并规定各自可用场景 |
| 紧凑密度 | chrome 高度纪律好（h-6/7/8/10），但消息区间距、卡片内边距三套并存 | 需定义密度档与间距刻度 |
| 信息架构 | 三栏 + aux + terminal 已具备工作台骨架 | 消息流内的层级（用户/AI/工具/委派）需要统一的表面阶梯 |
| Execution Tree | 空目录，仅有委托卡 | 本轮给出高保真形态（预览 3），不实现逻辑 |
| 多 Harness/Profile | BindingBar 已设计未接线；harness 徽标无统一视觉 | 需定义 harness 标识的统一视觉（徽标形状/色环/字重） |

---

## 8. v2 修订（人工审查返工后追加）

> 本节更新前文的结论性判断；§1–§6 的事实审计仍然有效，§6 优秀实现清单与"重构红线"全部保留并继续生效。

### 8.1 方向校准

v1 把"ZCode 风格"误读为"暖黑主题 + 琥珀品牌化 + pill 化 chip 体系"。人工审查澄清：ZCode 被认可的本质是**简洁、高效、安静——当前工作内容是绝对主角，功能在工作流中自然出现**。由此：

- 配色从暖调炭黑（#1c1c1a + 琥珀 #eda23a 品牌化）改为**中性深灰黑**（#171716），琥珀降级为"决策/关键等待"专用语义色（§7 的琥珀七场景纪律被 v2 宪法 §3 颜色纪律取代）。
- v1 的装饰性组件全部废弃：五段 Binding pill、queue 虚线 chip、harness 五色身份点、琥珀发送按钮、琥珀 focus ring、琥珀当前会话行、三级重量横条中的"决策琥珀横条"（改为消息流内嵌请求块）。
- 激活态统一为低对比灰底（`--surface-active`），不再整行琥珀。

### 8.2 产品语义纠正（依据 EXECUTION_TREE_AND_CROSS_HARNESS_SESSION.md）

v1 预览 3 把 Execution Tree 误设计为"多 Agent 并行委派 + 完成后自动合流"的 Delegation Tree。正确语义：

- **Execution Tree = 一个 Session 内不可变 Execution 存档点的树**（父子继续、分支保留、branch head、native checkpoint、四种 continuation mode 由系统决定）。第一版不做多分支并行写入，**不存在自动合流**。
- **Delegation = 一次 Execution 内部的子 Agent 任务**，与会话历史完全两个数据模型。
- UI 组件与命名强分离：`ExecutionLineagePanel`（执行历史 tab）与 `DelegationPanel`（委派任务 tab）；委派 tab 页首固定注明"属于当前 Execution，不是会话历史"。
- v1 的 "continue 自动合流" pill 删除。continuation 是系统只读判定（原生继续 / 从公共历史转换 / 最近兼容 checkpoint + 增量历史 / 新会话），用户只能选择父存档点与 Binding。
- 失败 Execution 无已冻结输出存档，UI 明示不可作为父存档点（架构 §4 约束的 UI 化）。

### 8.3 功能显隐层级

新增最高法则（v2 宪法 §0）：Level 0 永久可见 / Level 1 执行时出现且完成即降级 / Level 2 用户主动打开 / Level 3 管理界面。审计 §4 的"信息层级问题"（banner 五类、工具卡三套、嵌套无规则）按此层级收敛：

- Level 1 横条收敛为两类：顶部中性通知条（可恢复问题，处置后消失）与消息流内嵌块（审批/致命）。v1 的"三级横条"简化——决策类不再占横条位。
- 工具调用统一为轻量事件行（事件不是文档，也不是胶囊组件展览）。

### 8.4 新旧预览差异清单

| 旧预览（已废弃，移入 previews/attic/） | 新预览 | 关键差异 |
|---|---|---|
| preview-1-app-shell（琥珀 logo/发送/激活行/更新徽标，ctx chip pill 化） | preview-1-default-session | 中性激活灰底；无琥珀；chip→纯文本/mono；状态栏 4 簇→3 项；新增"默认状态足够安静"的显隐验证 |
| preview-2-conversation-tooling（工具 pill 四态、决策 alertdialog 语义、queue chip、turn-stats 卡） | preview-2-live-execution | 工具=pill→轻量事件行；权限=琥珀左缘内联块（group 语义）且处理后**降级为历史行**；队列=一行文字；连接问题=中性条且恢复即消失；证明"完成即降级" |
| preview-3-execution-tree（Delegation 冒充执行树、4 legs、自动合流、五段 binding pill、五色身份点、树面板常驻） | preview-3-on-demand-capabilities | 默认纯会话；Aux 按需打开且「执行历史」(radio 选父存档点 + 真实父子/branch/head/checkpoint/continuation) 与「委派任务」（当前 Execution 内）双 tab 分离；Terminal 独立可调宽工作区与 Aux 互斥；选历史节点→composer 上纯信息状态条（发送是唯一主动作），continuation 只读随 Harness 绑定变化；失败节点不可作父存档点；390 用抽屉不硬四栏 |
