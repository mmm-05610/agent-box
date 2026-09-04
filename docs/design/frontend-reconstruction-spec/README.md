# Agent-Box Studio Frontend Reconstruction Specification

## Verdict

**READY FOR HUMAN FRONTEND IMPLEMENTATION SPEC REVIEW**
**PRODUCT IMPLEMENTATION NOT STARTED**

本目录把既有设计宪法、当前源码审计、UI-1 证据和官方 upstream 研究收敛为可分阶段实施、可测试、可回滚的前端规范。它不改变 Session/Execution/Binding 协议，也不授权连续实施。

## Frozen principles

- 会话画布和 Composer 是默认主角；Agent 正文直接铺在画布上。
- 工具、思考、读取、编辑和终端事件使用统一扁平事件骨架；完成后自动降低视觉权重。
- 普通事件无装饰性卡片、阴影、渐变、发光和彩色边缘；用户消息只允许轻微表面差。
- 颜色不独立承担状态语义；必须同时有图标、文字或结构。
- Execution History 是会话 lineage 的不可变存档树；Delegation 是当前 Execution 内部任务，二者数据模型和入口分离。
- continuation 由系统 preflight 判定，UI 只读展示；选择历史节点后发送仍是唯一启动动作。
- Terminal、Execution History、Delegation、Binding 详情按需出现；390px 使用抽屉/独立视图。
- 保留虚拟化、增量加载、滚动锚定、keep-alive、响应式、主题、缩放、键盘和 WebSocket 行为。

## Open decisions

仍需人工确认：Terminal/Aux 停靠方案；Aux tabs 集合和入口；Binding popover 字段；历史节点密度；分支是否需要独立确认；状态栏最终内容；neutral-workbench 默认主题；是否保留旧主题；用量统计入口。

## Navigation

| 文档 | 用途 |
|---|---|
| [UPSTREAM_COMPONENT_RESEARCH.md](./UPSTREAM_COMPONENT_RESEARCH.md) | 五个官方项目的源码、结构和可移植结论 |
| [LICENSE_AND_PROVENANCE_LEDGER.md](./LICENSE_AND_PROVENANCE_LEDGER.md) | 许可证、版本、复制和 attribution 台账 |
| [CURRENT_COMPONENT_GRAPH.md](./CURRENT_COMPONENT_GRAPH.md) | Studio 当前调用图、authority、重复和 UI-1 残留 |
| [FLAT_TRANSCRIPT_SPEC.md](./FLAT_TRANSCRIPT_SPEC.md) | transcript entry、状态、交互和响应式规范 |
| [COMPONENT_ARCHITECTURE.md](./COMPONENT_ARCHITECTURE.md) | React 组件边界和 discriminated union |
| [COMPOSER_INFORMATION_ARCHITECTURE.md](./COMPOSER_INFORMATION_ARCHITECTURE.md) | Composer 常驻/摘要/popover/条件矩阵 |
| [EXECUTION_DELEGATION_TERMINAL_INTEGRATION.md](./EXECUTION_DELEGATION_TERMINAL_INTEGRATION.md) | 三者边界和三种布局候选 |
| [MIGRATION_PLAN.md](./MIGRATION_PLAN.md) | UI-2A 至 UI-3 的独立交付计划 |
| [VISUAL_ACCEPTANCE_MATRIX.md](./VISUAL_ACCEPTANCE_MATRIX.md) | 截图、键盘、主题、缩放和无卡片断言 |
| [IMPLEMENTATION_DECISIONS.md](./IMPLEMENTATION_DECISIONS.md) | 已确定项、开放项和推荐选项 |
| [SOURCE_ADOPTION_PLAN.md](./SOURCE_ADOPTION_PLAN.md) | upstream→local 映射或本地重实现清单 |

## Evidence boundary

研究 clone 位于 `/tmp/agentbox-upstream-research.vH1Wwv/`，不属于产品仓库。当前产品代码、依赖、lockfile、后端和旧设计文档均未由本规范修改。精确 token、字号、间距和面板尺寸仍是 provisional，不能直接写成截图像素契约。
