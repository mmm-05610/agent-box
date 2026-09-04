# MIGRATION_PLAN — 迁移工作计划 v2.1

> 权威等级见 [README.md](./README.md)。当前 Verdict：**STYLE DIRECTION APPROVED · INTERACTION DETAILS UNFROZEN · NOT READY FOR PRODUCT IMPLEMENTATION**。
> 本计划分两部分：**Part 1 · Candidate foundation backlog（候选基础工作清单，未授权实施）**与 **Part 2 · Candidate implementation phases**（全部 PROVISIONAL，每个 Phase 开始前必须通过 Phase 级人工评审）。
> 本文件中的全部工作项——包括被称为"基础""低风险"的 Part 1——均为**候选**。本次 style direction checkpoint 不授权修改任何产品代码；F1–F5、M1–M4 与 Phase 1–5 的每一项在开始前都必须：对照实际组件、列出拟修改文件、说明行为不变量、给出验证方案，并获得单独人工批准。不得因为名称含"基础/低风险"而自动执行。
> 总风格获批**不构成**连续实施任何工作项的授权；每项单独提交、单独确认。

---

## Part 1 · Candidate foundation backlog（候选基础工作清单，未授权实施）

后续可能执行的低风险候选工作。特点是不锁定任何 B/C 层视觉细节；但这只是**优先排序参考**，不是实施授权。每项动工前按上方通用门槛单独审批。

| # | 候选工作项 | 内容 | 明确不做 |
|---|---|---|---|
| F1 | 语义 token 增量 | `globals.css` 追加语义变量（`--surface-hover/active/bubble/raise`、`--decision`、`--success/--danger/--warning`、`--faint`、`--focus-ring`、`--shadow-overlay`），**不切默认主题、不改现有预设值**；精确值先按预览探索值落草，标注 provisional，可在后续调整 | 不动 `data-theme` 默认值；不动防闪脚本 |
| F2 | 硬编码颜色清理 | CURRENT_UI_AUDIT §2.1 所列约 15 处 Tailwind 原色（green/emerald/yellow/amber/red-400）→ 语义 token；状态同时保留文字/图标信息 | 不改任何交互逻辑 |
| F3 | 可访问性补齐 | TopBar 四个 icon-only 按钮补 aria-label；可切换按钮补 aria-pressed；`tool-call-block.tsx:34` 补 aria-expanded/controls；queue 拖拽手柄补 aria-label；sidebar disabled 双重淡化修复 | 不改键盘处理逻辑本身 |
| F4 | 状态语义统一 | "成功绿"三种写法、amber/yellow 混用、`STATUS_COLORS` 硬编码 → 语义 token + 图标/文字双编码；错误/重试两类横条的语义区分（重量差异可用现有 token 表达） | 不合并组件结构 |
| F5 | 行为不变量基线 | 为将受视觉替换影响的组件建立截图/fixture 基线（agent-capsule 四态、banner 五类、composer 状态、队列交互），作为后续工作的回归对照 | 不实现新视觉 |

**Part 1 若获批执行的验收**：`pnpm eslint .` / `pnpm test` / `pnpm build` 全绿；新旧主题下视觉回归为零差异（F1 只增不换）；键盘走查通过。

## Maintenance backlog（独立审批，不属于视觉风格批准范围）

以下为**代码维护事项**，与本轮视觉风格批准无关；删除或合并前必须逐项确认引用与行为，单独列出清单获得批准：

| # | 事项 | 门槛 |
|---|---|---|
| M1 | `subagent-session-dialog.tsx` / `sub-agent-session-dialog.tsx` 重复文件处置 | 逐项确认引用与行为后二选一 |
| M2 | `useIsMac` 双判定合一（top-bar.tsx:66-67） | 确认两 API 行为等价 |
| M3 | 设置入口二选一（top-bar.tsx:207 vs sidebar.tsx:668） | 确认入口语义与快捷键不变 |
| M4 | `message-bubble.tsx` 死代码删除 | 确认仅测试引用后删除并同步清理测试 |

## Part 2 · Candidate implementation phases（PROVISIONAL — REQUIRES PHASE-SPECIFIC HUMAN REVIEW）

以下 Phase 均为候选实施方案。**每个 Phase 启动前必须**：
1. 对照真实组件与真实数据核对该 Phase 假设；
2. 给出拟修改文件清单与行为不变量；
3. 产出局部预览或实际页面截图；
4. 单独等待人工确认后方可动工。

### Phase 1（PROVISIONAL）· Chrome 收敛
TopBar 激活态统一低对比表面差；StatusBar 内容裁剪（**先做信息价值审计定案，再动**）；`CountChip` 抽取；字号刻度清零。红线：拖拽区/窗口控制/滑动门控/keep-alive 不变。

### Phase 2（PROVISIONAL）· 消息流：工具事件行 + 完成即降级
三套工具卡皮肤 → 轻量事件行原型；横条归位（可恢复→中性通知条；审批→消息流内嵌琥珀左缘块，处置后降级历史行；致命→destructive 通知条）；队列改一行文字。红线：虚拟化/滚动/状态机/队列行为不变。

### Phase 3（PROVISIONAL）· Composer + Binding 入口
发送按钮中性填充；Binding 常驻 pill → 单行入口 + popover（continuation 只读）；queue 手柄键盘路径。红线：队列/steer/fork/离线首发不变。

### Phase 4（PROVISIONAL）· ExecutionLineagePanel 与 DelegationPanel
4A/4B 两个独立实现，禁止共享业务模型；fork 交互按宪法 §2（发送唯一主动作，信息条只读）。依赖 `agent-box-session` 真实 DTO 落地，实施前需对照真实数据再评审。红线：delegation 状态链/轮询合并/单写 Execution 不变。

### Phase 5（PROVISIONAL）· 主题与默认值
neutral-workbench 是否成为新用户默认主题：**开放**。若确认，防闪脚本同步更新并单独提交。旧 12 预设存留策略：**开放**（倾向保留）。

## 风险与红线（跨 Phase）

| 风险 | 缓解 |
|---|---|
| B/C 层候选细节被当契约实施 | 每 Phase 评审时对照 README 分层清单；截图基线（F5）先行 |
| ws-* 磨砂体系被 token 改动破坏 | F1 单独验收背景图开关 × 新旧主题矩阵 |
| content-parts-renderer 被顺手重构 | 禁止：视觉 Phase 只换样式表达式 |
| Execution/Delegation 语义混淆 | 4A/4B 类型隔离 + 文案评审（禁"合流/legs"） |
| 测试断言写死旧 class | 行为断言（role/aria/data-state）优先 |
| 连续实施惯性 | 本文件明示：总风格获批 ≠ Phase 连续授权 |

## 开放问题（open，不阻塞 Part 1）

1. Terminal 停靠：A（右侧互斥）/ B（底部 + 右侧并存）/ C（可切换）——见 README 候选对比。
2. Aux tab 集合、顺序与入口位置。
3. 状态栏最终项目集合（信息价值审计后定）。
4. 分支创建是否需要独立确认步骤。
5. Binding popover 最终字段与布局。
6. Execution History 节点密度/样式/操作路径。
7. 用量/成本统计入口。
8. neutral-workbench 默认主题与旧预设存留。
