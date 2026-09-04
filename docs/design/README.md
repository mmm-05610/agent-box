# Agent-Box Studio · 设计状态索引

> 当前 Verdict：**STYLE DIRECTION APPROVED · INTERACTION DETAILS UNFROZEN · NOT READY FOR PRODUCT IMPLEMENTATION**
> 本文是设计文档的权威等级索引。冲突时按 A > B > C 排序解释；同一层内以各文档为准。

## 文档地图

| 文档 | 角色 |
|---|---|
| [CURRENT_UI_AUDIT.md](./CURRENT_UI_AUDIT.md) | 现有 UI 事实审计（§1–6）+ 工程红线（§6）+ v2 修订记录（§8） |
| [DESIGN_CONSTITUTION.md](./DESIGN_CONSTITUTION.md) | 视觉与交互宪法（本页 A/B/C 分层的细则载体） |
| [COMPONENT_MAPPING.md](./COMPONENT_MAPPING.md) | 组件级处置映射（保留/改视觉/重组/新增） |
| [MIGRATION_PLAN.md](./MIGRATION_PLAN.md) | 候选基础工作清单（未授权实施）+ 候选实施阶段（每项均需单独人工批准） |
| [previews/](./previews/) | 三张概念预览 + 截图（见下方定位说明） |

## A. Frozen principles（已获人工认可，后续工作必须遵守）

1. **工作优先**：默认会话画布与 composer 是绝对主角；风格简洁、高效、安静、平面、低干扰。
2. **渐进披露**：Level 0–3 功能显隐模型成立；Level 2/3 能力不得为展示丰富度而常驻。
3. **单一主动作**：每屏一个主动作（composer 发送；等待时为权限批准）。选择 Execution 历史节点后，发送仍是唯一主动作，信息区只允许弱化的取消/恢复操作。
4. **Execution / Delegation 分离**：两个产品概念、两个数据模型、两组命名；可复用视觉原语，不得混称或共享模型。
5. **continuation 系统判定**：由父存档点 + 目标 Harness + checkpoint 兼容性决定，UI 只读展示结果；不存在用户手选的 continue 参数，不存在自动合流。
6. **完成即降级**：Level 1 状态（运行/等待/可恢复错误/队列）在工作流中自然出现，完成后降级为普通历史，不得继续抢占主界面。
7. **Harness 身份克制**：不得以遍地彩点/色块抢夺注意力；身份标识只在消息头、执行节点、选择入口出现。
8. **保留现有优秀工程行为**：虚拟化、滚动锚定、keep-alive、防 FOUC、WebKit/rem 缩放兼容、键盘分轨、`ws-*` 表面体系、transport 双模式等（红线清单见 CURRENT_UI_AUDIT §6）。
9. **可访问性底线**：无嵌套交互元素；icon-only 有 aria-label；toggle 有状态语义；展开控件有 aria-expanded/controls；focus-visible 全主题清晰（中性高对比环）；状态不得只靠颜色；reduced-motion 不依赖动画；常规视口无水平溢出。

## B. Provisional interaction candidates（当前最优候选，未冻结）

以下交互/布局方案只是当前候选，需结合真实产品数据、现有组件约束与交互试用继续调整；文档中出现"必须/禁止"字样时若涉及本层内容，效力仅限候选方案内部一致性：

| 候选 | 当前方案 | 状态 |
|---|---|---|
| Terminal 停靠 | 右侧 dock，与 Aux 互斥 | **Preview Candidate A**（另有 B/C，见下） |
| Aux 结构 | 双 tab：执行历史 / 委派任务 | tab 集合、顺序、入口位置开放 |
| Binding 编辑 | composer 左下单行入口 + popover | 最终字段、分组、布局开放 |
| Execution 节点选择 | 原生 radio 选父存档点 | 密度、样式、操作路径开放；分支是否需独立确认步骤未决 |
| 状态栏内容 | 分支 / 测试 / 连接三项 | 候选组合，须经信息价值审计后定案（见 §状态栏） |
| composer 元信息 | 右对齐 profile + 上下文% 一行 | 布局候选 |
| 移动端 | Aux/Terminal 覆盖抽屉 | 候选 |
| 分支创建流程 | 信息状态条 + 发送即生效 | 是否需要独立确认步骤未决 |

**Terminal/Aux 停靠候选对比**（当前产品 Terminal 是主区域下方的垂直面板；移到右侧是布局与行为重构，不是换皮）：

| 候选 | 方案 | 消息宽度 | 终端可用面积 | 多面板协作 | 实现复杂度 |
|---|---|---|---|---|---|
| A | Terminal 与 Aux 共用右侧 dock，单次显示一个 | 不受终端挤压 | 受 dock 宽度限制（当前预览 280–640px 可调） | 一次一个辅助面板，注意力集中 | 中：Terminal 迁移到右坞 + 互斥状态管理 |
| B | Terminal 保持底部，Aux 保持右侧，可同时打开 | 被底部终端压缩 | 沿用现有全宽底部面积（现状最充裕） | 三栏同屏，适合"边看输出边查历史" | 低：贴近现状布局 |
| C | 支持底部/右侧停靠切换 | 用户自选 | 用户自选 | 灵活但状态组合多 | 高：两套停靠位置 + 持久化 + 边界情况 |

本轮不替用户决定，不修改产品布局。

**状态栏待定项**：分支/工作位置可能长期有价值；连接状态通常只在异常或变化时有价值；测试统计可能属于当前 Execution 的 Level 1 信息（完成后未必常驻）；语言/缩放属全局设置，是否常驻需真实使用验证。最终内容以信息价值审计为准，当前预览只是候选组合。

## C. Visual exploration only（仅供视觉探索，不得作为验收断言）

预览中的以下内容**只服务于方向讨论**，不能直接映射为产品组件规格，也不能写成测试断言：

- 精确 hex（`#171716`、`#d98e3f` 等）与 oklch 换算；
- 像素尺寸、具体宽度（如 dock 280–640px、aux 21rem、sidebar 17.5rem）、字号、圆角（6/10/12px）；
- 文案（示例会话标题、提示语）与示例 Harness/Profile/branch 名称（CC/CX/GM/OC、zinc-main、zinc-porting、E1–E4 等均为虚构 fixture）；
- 预览页中用于讲解的窗口外元素：控制台条、亮色/150% 切换按钮、页尾"检查要点/操作路径"说明文字。

## 预览定位

三张预览（`previews/preview-1-default-session.html` 等）用于确认信息密度、视觉安静程度、功能显隐原则、Execution/Delegation 概念区分、复杂能力按需打开的整体感觉。每张页面均已注明：

> Concept preview — validates direction, not final layout or component specification.

## Changelog

- **v2（返工）**：v1 的暖黑+琥珀品牌化+pill 化方向废弃（历史细节见 CURRENT_UI_AUDIT §8.1，不再作为实施依据）；Execution Tree 与 Delegation 语义纠正；显隐层级确立。
- **v2.1（本轮）**：记录人工 Verdict（风格方向获批 / 交互细节未冻结 / 不可开始产品实施）；清除 COMPONENT_MAPPING 中 v1 残留；fork 流程去除第二个主动作（发送是唯一主动作）；Terminal/Aux 停靠与状态栏内容转为开放候选；MIGRATION_PLAN 拆分为已批准基础工作与候选实施阶段。
