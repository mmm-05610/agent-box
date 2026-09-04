# DESIGN_CONSTITUTION — Agent-Box Studio 视觉宪法 v2

> **Verdict（人工裁定，2026-09）：STYLE DIRECTION APPROVED · INTERACTION DETAILS UNFROZEN · NOT READY FOR PRODUCT IMPLEMENTATION。**已确认原则见 README.md「A. Frozen principles」；布局与实现细节（颜色值/字号/间距/面板宽度/tab 结构等）均为 provisional/open，不得作为实施契约。
> v2 修订（人工审查返工）：推翻 v1 的"暖黑 + 琥珀品牌化 + pill 化"方向。ZCode 界面被认可的原因不是配色，而是**简洁、高效、安静：当前工作内容是绝对主角，功能在工作流中自然出现**。
> 定位：中性、平面、克制的工程工作台。层级靠排版、对齐、留白与 1px 分隔线建立，不靠卡片、阴影、色块和徽标。
> 语义权威：Execution Tree / continuation 的产品语义以 `docs/architecture/EXECUTION_TREE_AND_CROSS_HARNESS_SESSION.md` 为准，本文的 UI 规则不得与其冲突。

---

## 0. 功能显隐层级（Level 0–3，本文最高法则）

界面元素的可见性由层级决定，**禁止让 Level 2/3 能力为了证明"功能丰富"而默认常驻**。

### Level 0 — 永久可见
| 元素 | 形态 | 为什么常驻 |
|---|---|---|
| 项目/会话导航 | 侧栏（可折叠） | 用户定位"我在哪" |
| 当前会话消息流 | 画布主体（最大面积） | 工作内容是绝对主角 |
| 输入框 | 画布底部 composer | "接下来能做什么"的唯一入口 |
| 当前最基本的执行身份 | composer 内一行 muted 小字 + 消息头 Harness 方槽 | 需要可找到，但不构成视觉块 |
| 当前最重要的一个状态或动作 | 消息流内嵌（等待审批/运行中）或 composer 上方待启动条 | 状态属于工作流，不属于仪表盘 |

### Level 1 — 执行时按上下文出现（完成后必须自动降级为普通历史）
| 元素 | 出现位置 | 降级形态 |
|---|---|---|
| 正在执行的 Harness | 消息头（`Claude Code · 执行中`） | 消息头保留文字，去掉"执行中" |
| 思考/工具调用进度 | 消息流内事件行（spinner + shimmer） | 灰色一行（✓ + mono 摘要），可点开 |
| 当前等待审批 | 消息流内琥珀左缘请求块（唯一琥珀时刻） | 一条 muted 历史行（`已批准 · 仅本次 · 14:32`） |
| 可恢复错误/连接问题 | 顶部中性通知条（spinner + 文字 + 重试动作） | 恢复后提示即消失，不染色不驻留 |
| 当前队列摘要 | composer 上一行文字（非卡片） | 发送后即消失 |
| 致命错误 | destructive 左缘 2px 通知条 | 用户处置后收敛为历史行 |

### Level 2 — 用户主动打开
| 元素 | 从哪里打开 | 关闭后如何恢复 |
|---|---|---|
| Execution History（ExecutionLineagePanel） | 顶栏辅助面板按钮 → Aux「执行历史」tab（tab 集合与入口位置开放） | 关闭即收起，不占布局；再点按钮还原 |
| Delegated Tasks（DelegationPanel） | 同上 →「委派任务」tab | 同上 |
| Terminal | 顶栏终端按钮 → 独立右侧工作区（宽度可调，与 Aux 互斥）——**Preview Candidate A**；候选 B（保持底部 + Aux 右侧并存）与 C（可切换停靠）及影响对比见 README「Provisional interaction candidates」。当前产品 Terminal 在主区域下方，迁移属布局重构，未决策不动 | 同上 |
| 完整 Binding 配置 | composer 左下 Harness 入口 → popover | Esc/点击外部关闭，选择保留 |
| tool call 完整输入输出 | 事件行点击展开（aria-expanded） | 再点收起，默认收起 |
| 用量/成本/性能统计 | 会话详情（后续，不常驻） | — |

### Level 3 — 管理界面
Profile / Skill / MCP / Provider / Sandbox / Credential / 安装修复诊断 —— 全部在 Settings，永不进入会话画布。

### 显隐法则
1. **每屏一个主动作**：composer 发送；等待时的权限批准。
2. 状态完成后**必须**降级（Level 1 → 历史行）；降级是硬性要求，不是可选项。
3. 一个元素若要常驻，必须回答"它对每一帧会话都有价值吗"；回答不了就降级或收进 Level 2。
4. 不做状态仪表盘：任何时刻，页面上的"状态块"数量不得超过正在发生的事情数量。

---

## 1. Execution Tree ≠ Delegation Tree（命名与信息架构强分离）

| | Execution Tree / ExecutionLineage | Delegation / Sub-agent Tasks |
|---|---|---|
| 本体 | 一个 Session 内多个**不可变 Execution 存档点**组成的树 | **一次 Execution 内部**的子 Agent/任务委派状态 |
| 父子语义 | 从任意已完成 Execution 继续 → 创建子 Execution；历史节点与其后继**永不删除/覆盖**；切 Harness 或对转译不满意 → 回原节点另开分支 | 任务从属当前执行，无会话历史语义 |
| 分支 | Branch = 指向 head 的可移动命名引用；多分支天然存在；**第一版同一 Session 只有一个写 Execution，不宣称并行写入** | 不适用 |
| 合流 | **不存在"自动合流"**；分支各自独立延续，结果比较由用户发起 | 不适用 |
| continuation | 系统根据父节点 + 目标 Harness + checkpoint 兼容性决定（见 §2），UI 只读展示 | 不适用 |
| UI 形态 | Aux「执行历史」tab：树形存档点列表（radio 选择父节点）+ composer 上方"从此创建分支"待启动条 | Aux「委派任务」tab：当前 Execution 的任务行列表，页首固定注明"属于当前 Execution，不是会话历史" |
| 数据模型 | ExecutionNode / SessionBranch / NativeSessionCheckpoint | delegation-status / task-card 现有模型 |
| 组件 | `ExecutionLineagePanel`（新） | `DelegationPanel`（新，由现有 delegation-status 卡复用视觉原语） |

两者可复用视觉原语（方槽 Harness 缩写、状态字形、mono id），**不得共享数据模型，不得在 UI 中混称**。禁止出现"4 legs""自动合流""并行分支推进"等表述。

## 2. Binding 与 continuation 的正确关系

- 用户在 Execution Tree 中选择**父存档点或当前 branch head**；可编辑本次的 Harness / Profile / Model / Sandbox 等**启动 Binding**（composer 左下紧凑入口 → popover，原生 select）。
- **continuation 路径由系统决定**，依据：父节点、目标 Harness、checkpoint 兼容性。UI 只读显示四种之一（术语与架构文档一致）：
  - `原生继续`（NATIVE_DIRECT_RESUME：同 Harness 且 checkpoint 兼容；同 Harness direct resume **不显示转译提示**）
  - `从公共历史转换`（CANONICAL_MATERIALIZED / 跨 Harness；启动前出示 Loss Report）
  - `最近兼容 checkpoint + 增量历史`（NATIVE_AUGMENTED_RESUME）
  - `新会话`（EMPTY）
- **禁止** `continue` 下拉框、禁止"自动合流"pill、禁止把 continuation 当用户自由参数。
- Binding 配置**不得以五个 pill 永久占据 composer**；默认只露出 Harness 名一行，其余在 popover 内。
- 失败 Execution 无已冻结输出存档：UI 明示"不能作为父存档点"，不假装可继续。
- **发送是唯一主动作**：选择历史节点后，composer 上方仅出现纯信息状态条（"下一条消息将从 E{n} 创建新分支，原分支保留不变" / "下一条消息将从当前 head 原生继续"）+ 只读 continuation 与 Loss Report 提示；信息区只允许弱化的"取消/恢复当前 head"；不提供独立启动按钮。用户发送下一条消息时才创建分支并启动新 Execution（分支是否需要独立确认步骤：open）。

## 3. Palette（中性，dark 为主审对象）

### 暗色（默认审查对象）

> 以下具体数值属 **C 层 Visual exploration**（README），仅用于预览与方向讨论，不得直接作为产品 token 验收断言；落库时的精确值在 token Phase 单独评审。
| Token | 值 | 用途 |
|---|---|---|
| `--background` | `#171716` | 侧栏、画布、终端同底色 |
| `--surface-hover` | `rgb(255 255 255 / 4.5%)` | 行悬停 |
| `--surface-active` | `rgb(255 255 255 / 7%)` | **选中行（当前会话/选中存档点）：低对比表面差，不用琥珀** |
| `--surface-bubble` | `#222221` | 用户消息轻微抬升 |
| `--surface-raise` | `#1f1f1e` | composer、popover、权限卡底 |
| `--border` | `rgb(255 255 255 / 8%)` | 1px 分隔线（层级的主力） |
| `--border-strong` | `rgb(255 255 255 / 14%)` | 输入面/浮层描边 |
| `--foreground` | `#e7e7e5` | 正文 |
| `--muted-foreground` | `#9c9c99` | 次要文本 |
| `--faint` | `#6d6d6a` | 时间戳/元数据（非关键信息） |
| `--decision` | `#d98e3f` | **琥珀：仅 权限/人工决策/必须立即关注的等待**（左缘 2px + 批准按钮 + 分支信息状态条） |
| `--success` | `#62ab6b` | 仅"完成"字形（✓），不整块染色 |
| `--danger` | `#e06c62` | 仅错误字形/左缘，不整块染色 |
| `--warning` | `#d9c34a` | 黄，与琥珀可区分；**永远伴随图标+文字**，状态不得只靠颜色 |
| `--focus-ring` | `#eeeef0` | **focus ring：高对比中性色，不用琥珀** |

亮色对：`#fbfbfa` 底 / `#f0efec` 气泡 / `#ffffff` raise / `#1e1e1c` 正文 / `#6f6f6b` muted；`--decision` 提深为 `#b06f1f` 保证对比。

### 颜色纪律
1. 琥珀三场景封顶：权限或人工决策 / 极少数关键动作 / 必须立即关注的等待。**当前会话激活态、focus ring、发送按钮、Harness 身份、更新提示均不使用琥珀。**
2. 发送按钮 = **中性填充**（foreground 底 + background 字），空输入禁用。对比方案后选择干扰更低的中性方案（v1 的琥珀发送按钮废弃）。
3. 状态不能只依赖颜色：必须同时具备文字/图标/结构（✓ ✕ spinner + 文本 + 位置）。
4. Harness 身份 = 中性 mono 方槽缩写（CC/CX/GM/OC）+ 文字，**不用身份色点**（v1 的五色身份点废弃：与语义色冲突且制造彩点噪音）。身份只在三处出现：消息头、执行历史节点、composer 选择入口。
5. 阴影只给浮层（popover/抽屉）一个 token；卡片套卡片禁止；大面积阴影禁止。

## 4. Typography

| 角色 | 字体 | 约束 |
|---|---|---|
| UI/正文 | Inter Variable（现状保留，防闪契约不动） | 正文 14px 基准；消息 15px |
| 工作台方言 | JetBrains Mono（已自托管） | 路径、execution id、checkpoint id、分支名、命令、指标 |

- 六档 rem 刻度不变：10/11/12/14/16/18px（`text-3xs…text-lg`），任意值字号清零。
- `tabular-nums` 用于一切数字（时长、计数、百分比、时间戳）。
- `text-3xs` 不承载关键信息；辅助信息底线 `text-2xs`。
- 层级优先用**字重（400/500/650）+ 颜色三档（fg/muted/faint）+ 留白**表达，不新增框和底色。

## 5. Spacing / 密度 / Radius / Elevation

- 网格 4px；步进 2/4/6/8/12/16/24/32。三档密度区沿用 v1（chrome 24–40px；列表行 28–34px；会话流 16px 消息距 / 24px turn 距，`max-w-3xl` 等效 46rem 居中列）。
- **Radius 只三处**：行/按钮/事件行 6px；输入面/composer/popover 10px；用户气泡 12px。**不再有 pill 化的 chip 体系**（v1 的 toolchip pill、queue chip、五段 binding pill 全部废弃）。
- Elevation：平面为主。层级 = 表面差（hover/active/bubble/raise）+ 1px 分隔线。唯一 shadow token 给 popover/抽屉。
- 工具调用 = 消息流中的**轻量事件行**（图标位 + mono 摘要 + 右侧元数据），展开体 = 左缘 1px 缩进块。不是全宽胶囊、不是卡片。
- Terminal = 可调宽度的真实工作区（等宽字体、命令输入行、1px 分隔的标题行），不是内容卡片。
- 状态栏只保留跨页面持续有价值的信息（分支、测试状态、连接），全部 muted 单行。

## 6. Icon / Motion

- lucide-react 唯一（预览用内联 lucide path）；16/14px 两档，stroke 2。装饰图标 `aria-hidden`；icon-only 按钮必须 `aria-label`。**预览与产品禁止用 emoji 代替正式图标。**
- MOTION 保持三档时长（120/180/240ms）、非对称缓动、只动 transform/opacity；常驻微动效仅存：运行 spinner、shimmer、live-dot 脉冲。`prefers-reduced-motion` 下全部瞬时（reply-fold 1ms 卸载契约保留）。
- 现有优秀实现红线（虚拟化、滚动锚定、keep-alive、防 FOUC、WebKit rem、键盘分轨、`ws-*` 磨砂体系、`usePanelSlideOnToggle` 门控）不变，详见 CURRENT_UI_AUDIT §6。

## 7. 可访问性（硬性）

- 禁止 `<button>` 内嵌 `<button>`/`role="button"` 或任何交互元素嵌套；树/列表行用原生 `<label>+<input type=radio>` 或 `aria-expanded` 按钮承载选择语义。
- 内联权限请求**不是 `alertdialog`**（无 focus trap 就不用 dialog 语义）；只有真正带 focus trap、label、关闭行为的模态框才用 dialog。
- 自定义 tabs/listbox 必须实现完整键盘语义（tablist + aria-selected + 方向键），否则用原生控件；Binding 配置用原生 `<select>`。
- icon-only 按钮 `aria-label`；toggle 用 `aria-pressed`；展开控件 `aria-expanded` + `aria-controls`。
- `:focus-visible` 在暗/亮与全部关键表面清晰（2px `--focus-ring` + 1px offset）。
- reduced-motion 下状态不得依赖动画（spinner 停转时必须有文字态）。
- 390/1024/1440 无水平溢出；150% 字号下核心操作不消失、不重叠（app 高度跟随视口而非字号）。
