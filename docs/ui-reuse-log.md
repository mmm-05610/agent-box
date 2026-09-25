# UI 复用记录（ui-reuse-log）

本轮桌面 UI 优化的组件复用与开源核查记录。原则：优先复用仓库既有依赖与组件；每个新增交互组件先查现有能力，再至少核查一个成熟开源实现；未采用的方案记录理由。

## 已复用（零新增依赖）

| 组件/能力 | 来源 | 许可证 | 版本 | 复用方式 |
|---|---|---|---|---|
| 对话线程框架 | `@assistant-ui/react`（AgentbaseAI） | MIT | 0.15.21（既有依赖） | 继续使用 `ThreadPrimitive` / `MessagePrimitive` / `useExternalStoreRuntime`；本轮只改 per-role `UserMessage` / `AssistantMessage` 展示层与样式，未替换运行时。许可证副本已随扩展分发（`extensions/ordessa.agent-conversation/assistant-ui-LICENSE`）。 |
| 可折叠/可调整面板 | `react-resizable-panels` | MIT | 4.13.2（既有依赖） | 工作台继续用 `Group` / `Panel` / `Separator`；`Separator` 保留 `id=resize-*`、双击 `resize('22%')` 与键盘调整（方向键经面板 `panel.resize` 提交，实测生效）。许可证副本随扩展分发。 |
| 工具卡 / 思考区展开 | 浏览器原生 `<details>/<summary>` | — | — | 未引入 Collapsible 库。核查对象：assistant-ui 的 `CollapsiblePrimitive`（依赖 React context，需把消息树整体接管，超出展示层边界）与 ZCode 的 details 式工具卡；原生方案满足"默认收起、可展开、可访问"且不新增依赖。 |
| 左下连接浮层 | 既有 workbench 连接栏组件 | — | — | 保持既有 DOM 结构与逻辑（默认收起，`role=group` 弹层）。未采用 Radix/shadcn Popover：新增依赖、且现有能力已覆盖截图可见需求（禁区 `connections/service/**` 不动）。 |
| 会话列表、审批卡、composer | 既有 `plugins/agent/sessions`、`plugins/agent/conversation` 组件 | — | — | 仅改 `styles.ts` 与消息角色渲染（`view.tsx` 8 行），审批保持在对话区内；按钮/输入区样式统一到大圆角 token 体系。 |

## 设计规范参考（非代码依赖）

| 来源 | 许可证 | 用法 |
|---|---|---|
| 用户提供的 20 张 Codex 截图（`~/桌面/新建文件夹/`） | 私有截图，仅作用视觉参照 | 布局与视觉基准；未复制其中任何私人内容，全部用匿名 fixture 数据复现。 |
| **ZCode Desktop（`zai-org/ZCode`，用户补充的开源参考）** | Apache-2.0 | 仅对照其根 `DESIGN.md` 设计系统规范做交叉校验，未复制代码。对齐点：语义化 surface 分层（background/panel/sidebar/card/popover 对应我们的 `--ui-*` 灰阶 token）、"先用文字层级、后用边框"的克制原则、品牌色稀疏使用、"calm, dense, operational" 的桌面气质、`--ui-font-size` 驱动的类型尺度。差异：ZCode 有完整暗色主题与 16px 窗口圆角体系，本轮未引入（属 B 类待确认，见 ui-tokens-and-paths.md）。第二轮全 UI 深读（含窗口外壳层）的逐条借鉴清单见 `docs/zcode-borrow-points.md`。第三轮已按该清单落地：外框 frameless（A 类，见 ui-tokens-and-paths.md §7）与对话区 D2–D5（工具卡状态图标、思考区左线旁注、审批卡专用确认色并入流、输入框三态），均为设计约定移植、未复制源码。 |

## 未采用及理由

- **Radix UI / shadcn-vue|react 组件族**：需新增多包依赖与主题系统，违反"依赖新增先报方案"且现有能力已够。
- **dnd / 虚拟列表库**：截图中无可证明的拖拽或超长列表需求，不凭空造功能。
- **ZCode 组件源码直接移植**：Apache-2.0 允许但需保留许可声明与来源链；本轮仅需其设计约定，代码全部留在既有组件内，移植无必要。

## 测试工具说明（受控预览）

- `examples/ui-preview`：fixture connector 通过公开 API `connections.forScope(scope).add(connector)` 注入，不涉及真实后端/模型/凭据；与真实联调（Ordessa Server connector）严格区分。
- 自动化：`npm run test:ui-preview`（Electron，隔离临时 userData，`--no-sandbox` 仅测试用）。
- 已知 harness 限制（证据见 /tmp/preview-run2~4.log）：Electron `sendInputEvent` 的合成 `mouseMove` 不携带按键状态（`buttons===0`），react-resizable-panels 4.13.2 的 pointermove 处理器据此中止拖拽（dist 源码 `qe`: `if (e.buttons === 0) …`）；纯页内合成 PointerEvent 又不能通过其 `Ke` 命中测试。因此指针拖拽改宽无法在自动化中复现，改用**同一提交路径**的键盘证据（separator 聚焦后 ArrowRight ×4：268px → 488px，`keyboardResized:true`）验证 resize 未回归；真实鼠标拖拽建议随人工视觉验收确认。
