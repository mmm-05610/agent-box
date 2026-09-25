# Ordessa 桌面 UI 实施：token 与修改路径清单

日期：2026-09-24。依据：`docs/ui-codex-reference-review.md`（A 类范围）与 20 张参考截图逐张核对。品牌保持 Ordessa；不复制截图私有内容。

## 1. 统一视觉 token

在工作台根 `.wb` 定义，agent 面板复用同名 CSS 变量（值一致）：

| Token | 值 | 用途 |
| --- | --- | --- |
| `--ui-surface` | `#FFFFFF` | 主对话区、弹层、输入框底 |
| `--ui-nav` | `#F6F6F6` | 左栏、导航条、状态栏 |
| `--ui-sunken` | `#F0F0F1` | 工具卡/思考区底色、次级区块 |
| `--ui-hover` | `#EAEAEA` | 行 hover |
| `--ui-selected` | `#E3E4E6` | 行选中（灰阶，不用大面积蓝） |
| `--ui-line` | `#E8E8E8` | 1px 分隔线、弹层边界 |
| `--ui-ink` | `#202123` | 主文字 |
| `--ui-ink-secondary` | `#6B6E73` | 次级文字（时间、说明） |
| `--ui-ink-faint` | `#9A9DA2` | 占位、弱提示 |
| `--ui-accent` | `#3B82F6` | 主动作、焦点环、运行/停止 |
| `--ui-bubble` | `#EFF4FB` | 用户消息浅蓝气泡底 |
| `--ui-ok` | `#2E7D46` | 已连接/完成 |
| `--ui-warn` | `#B26A00` | 待响应/未知 |
| `--ui-error` | `#B3261E` | 失败/错误 |
| 圆角 | 面板/弹层 `14px`；输入框 `20px`；按钮/行 `8px`；圆形动作钮 `999px` | |
| 密度 | 侧栏行高 `32px`；正文 `14px/1.6`；助手正文最大宽 `740px` 居中 | |
| 字体 | `system-ui, sans-serif`；代码/路径 `ui-monospace, monospace`（沿用，不新增字体） | |

## 2. 修改路径清单（仅 A 类）

| 文件 | 改动 | 阶段 |
| --- | --- | --- |
| `plugins/workbench/src/styles.ts` | 全套 token 收敛：浅灰导航/状态栏、白色主区、细线、区域 tab 紧凑化、空态、拖放目标、错误条样式 | ① |
| `plugins/workbench/src/shell.tsx` | 仅展示层微调：主区空态文案样式类、状态栏结构保持；不改 region/panel 逻辑与契约 | ① |
| `plugins/agent/sessions/src/styles.ts` | 浅灰侧栏、32px 紧凑单行、灰阶选中、组标题、运行/待响应改为小圆点+文字、项目选择器列表化 | ① |
| `plugins/agent/sessions/src/view.tsx` | 仅结构微调（行内加状态点元素、类名），文案/按钮/选择器 class 全部保留（smoke 依赖 `.agent-sessions`、`.agent-project-picker`、"New session" 等） | ① |
| `plugins/agent/conversation/src/styles.ts` | 白色主区、内容列 740px 居中、用户右气泡/助手左正文、工具卡/思考区统一浅灰圆角卡、审批卡对齐 token、头部紧凑化 | ② |
| `plugins/agent/conversation/src/view.tsx` | `ChatMessage` 读取 role 加 `data-role`（显示层）；工具卡/思考区 summary 结构微调；composer 结构保留（textarea、"Send"/"Start session"/"Request stop" 文案不变） | ②③ |
| `plugins/agent/conversation/src/interaction-card.tsx` | 审批卡视觉类名调整（保留 `agent-interaction`、data-interaction、按钮文案） | ② |
| `apps/desktop/renderer/host.css` | 根色板对齐 token | ① |

## 3. 禁区与约束

- 不改 `plugins/connectors/**`、`plugins/connections/service/**`（含 `status.tsx`）、契约、Electron bridge、会话/运行生命周期。左下 connection 视觉保持其插件自身样式；workbench 只定义状态栏容器（`.wb-status`）与通用主题变量，不含任何 `.conn-*` 跨插件选择器（评审后已收回，待 connection 插件的唯一写入者消费 `--ui-*` 变量补样式）。
- 保留现有 class/文案锚点：`.conn-status-toggle`、`.agent-placeholder`、`.agent-conversation-head small`（SESSION/NEW SESSION）、`.agent-compose textarea/button`、`.agent-message`、nav `aria-label="Agents"`（smoke/test 依赖）。
- 不新增依赖、不改锁文件。浮层/菜单复用原生 `<details>`/受控 state + 现有样式；不引入新组件库（见 `docs/ui-reuse-log.md`）。
- B 类（服务器/harness 两级、置顶/归档写操作、搜索面板、创建项目、Markdown 渲染升级）：现有接口未支持，列为待确认，不做。
- C 类排除：模型菜单、加号菜单假入口、浏览器/终端/Git、账号/语音/设置页。

## 4. 受控预览方案

新增本地视觉预览入口（测试用途，不进入产品 bundle）：以真实 `SessionBrowser`/`Conversation`/`ConnectionStatus`/`WorkbenchShell` 组件 + 匿名 fixture 服务渲染，Electron `capturePage` 出图（复用 `MODULAR_SCREENSHOT` 机制或独立 preview 脚本）。与真实联调区别：fixture 数据非后端事件流，仅证明布局/样式；发送、停止、审批响应逻辑未变。

## 5. 实跑测试结果（2026-09-24，本轮收尾）

- `npm run typecheck`：通过（tsc --noEmit 无输出）。
- `npm test`（apps/desktop，串行）：11 个文件 129 个用例全部通过，含 sessions/conversation/connections/loader/agent-ui-probe 回归。
- `npm run build`：通过，8 个启用扩展重新构建进 `products/agent-desktop/dist`；`extensions.lock.json` 仅 3 个 entry.js 内容 hash 更新（样式改动的必然结果），无依赖/锁文件语义变化。
- `npm run test:ui-preview`（受控预览，Electron + 临时 userData）：`UI_PREVIEW_OK`，全部断言通过：空态/历史/会话切换/发送回执/工具与思考展开/审批三选项与响应/运行 chip+Stop/停止→cancelled/审批释放回历史/区域折叠展开/separator 存在/键盘调整面板宽度（268→488）/Tab 焦点/对话区滚动（scroller=agent-viewport）/窄窗 760px 无横向溢出/composer 可见/console 错误为 0。
- 指针拖拽改宽在自动化中不可复现（Electron sendInputEvent 合成 mouseMove 不带 buttons 状态，RRP 视为拖拽中止）；已用同一 resize 提交路径的键盘证据替代并在 `docs/ui-reuse-log.md` 记录，建议人工验收时顺手确认真实鼠标拖拽。
- 截图：`docs/ui-preview/01-empty / 02-history / 03-tool-expanded / 04-approval / 05-running / 06-narrow.png`（全部为匿名 fixture 数据；与真实后端联调无关）。

## 6. 外框紧凑化改造（第二轮，ZCode 单侧栏形态）

用户验收后追加：去掉冗余 chrome，向 ZCode"每列一行头、只有一个左侧栏"靠拢。仅动 `plugins/workbench/src/{shell,styles}.tsx`，未触碰 Electron main（frameless 方案当时未启用，后于第三轮 §7 启用）。

- 删除全局 `.wb-bar` 品牌行与左侧 `.wb-navigation` 图标栏（原三层顶行堆叠 → 每列单行）。
- 品牌 `Ordessa` 与 navigation 贡献（Agents 图标，icon-only，aria-label 保留）并入左区头行；toolbar/布局切换/重置按钮并入主区头行右侧。
- 区域上下文动作（移动…/×/−）hover/focus-within 才展开（平时 0 宽），与 ZCode 一致。
- navigation utility 段改渲染进状态栏。
- 兼容：`nav button[aria-label=Agents]`、`收起/展开左侧栏`、`resize-left`、`wb-left` 等预览/测试锚点全部保留，preview 断言未改即通过。

## 7. 去原生标题栏（第三轮，frameless，用户批准）

用户确认 OS 标题栏仅显示 "Ordessa Desktop" 且菜单栏已隐藏后批准移除。窗口边框属宿主职责，全部改动在 `apps/desktop/`，workbench 插件保持 Electron 无关。

- `electron/main.ts`：非 darwin 平台 `frame:false`；新增 `window:minimize / toggle-maximize / close / is-maximized` IPC，每条都校验 `event.sender === win.webContents && event.senderFrame === mainFrame && url === 'ordessa://desktop/index.html'`，不信任任何其它 frame。maximize/unmaximize 事件推送 `window:chrome-state` 同步按钮图标。
- `electron/preload.ts`：仅非 darwin 时 `contextBridge.exposeInMainWorld('desktopWindow', …)`，只暴露固定 channel 的薄封装与可退订监听。
- `renderer/window-chrome.tsx`：有 API 时置 `html[data-frameless]` 与 `--wb-window-controls:138px`，渲染右上角 最小化/最大化(还原)/关闭 按钮（role=group，中文 aria-label）；无 API（jsdom、浏览器、macOS）渲染 null，零影响。
- `renderer/host.css`：frameless 下左/主区头行与 full-page bar 设 `-webkit-app-region:drag`，按钮/select/拖拽 tab 设 no-drag；主区头行 padding-right 避让窗口按钮。
- `electron/preview-main.ts`：预览窗同样 frameless 并镜像同一组 IPC，截图与真实外框一致。
- 回退：单行 `frame: !frameless` 改回即可，其余为增量。
- 风险（待人工验收）：GNOME/XWayland 下去边框后的边缘拖拽缩放与 Win+方向键贴靠行为由合成器决定，自动化无法覆盖，需在真实桌面确认。

## 8. 对话区 ZCode 对齐（第三轮，D2–D5）

仅动 `plugins/agent/conversation/src/{view,styles,interaction-card}.tsx`，锚点（`.agent-tool`/`data-tool-state`/`.agent-reasoning`/`.agent-interaction header small`/`.agent-compose`）全部保留。

- D2 工具卡状态图标（参考 ZCode `ai-elements/tool.tsx`）：completed 绿勾、running 蓝色旋转虚线圆（`prefers-reduced-motion` 下停转）、failed 红叉沿用原样式、unknown 圆圈提示；图标为纯 SVG，不改 `summary` 的 textContent。
- D3 思考区轻处理（参考 `reasoning.tsx`）：由灰底卡片改为左侧竖线 + 弱化文字的分栏旁注，与工具输出拉开层级。
- D4 审批卡专用确认色（参考 `confirmation.tsx`）：新增 `--ui-confirm/-soft/-line` 三元组（不复用 `--ui-ok`）；pending/responding 左侧 3px 确认色描边、PENDING 标签转确认色、动作按钮换确认色底；resolved 卡片转浅确认底、expired/unknown 转中性灰。卡片位置从头部下方横幅移入消息流末尾（composer 上方），与 ZCode 流内确认一致；`.agent-interactions-in-thread` 类名保留。
- D5 输入框三态（参考 `prompt-editor/ChatPromptEditor.tsx`）：resting → hover 边框加深 → focus-within 边框+底色微升+阴影，加 transition。
- 验证：build/typecheck/129 测试/preview 全绿；截图 03（绿勾）、04（流内确认卡）、05（左线思考旁注 + 蓝色 spinner）逐项目视确认。
