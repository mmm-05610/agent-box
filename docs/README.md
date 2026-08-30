# Agent-Box 文档目录

本目录按文档责任分类。常用、稳定的项目入口保留在 `docs/` 根目录；研究、候选架构、验证报告和阶段计划分别进入子目录，避免根目录再次变成时间线式文件堆积。

## 从这里开始

第三方插件开发请先阅读 [Plugin SDK](plugins/PLUGIN_SDK.md)。

| 文档 | 用途 |
|---|---|
| [2026 目标架构（当前权威设计）](architecture/AGENT_BOX_TARGET_ARCHITECTURE_2026.md) | 四轮独立设计、红队攻击和可实现性验证后收敛的 Core/Host/Web/官方插件目标结构与门禁 |
| [当前项目整体架构（新开发者先读）](architecture/CURRENT_PROJECT_ARCHITECTURE.md) | 当前代码分层、核心对象、Provider/插件关系、实现状态与阅读路径 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 当前已实现的系统架构与数据流 |
| [REQUIREMENTS.md](REQUIREMENTS.md) | 产品问题、约束和需求 |
| [ROADMAP.md](ROADMAP.md) | 当前路线和功能状态 |
| [RELEASE.md](RELEASE.md) | 发布流程 |
| [PRODUCT_NARRATIVE.md](product/PRODUCT_NARRATIVE.md) | 产品定位和叙事 |

## Preview Demo

| 文档 | 用途 |
|---|---|
| [DeepSeek Harness Plugin Preview Storyboard（当前）](demos/AGENT_BOX_PREVIEW_DEEPSEEK_HARNESS_PLUGIN_STORYBOARD_2026.md) | 当前 Preview 题材、3–6 分钟逐幕脚本、Hero Moments 和三类 Implementation Gap Ledger |
| [公开 Demo Execution Blueprint（历史题材）](demos/AGENT_BOX_2026_08_25_PUBLIC_DEMO_EXECUTION_BLUEPRINT.md) | 旧客服产品场景的逐 Execution 设计；不再作为当前 Preview 拍摄基准 |
| [PineCare Demo Product Spec（历史题材）](demos/SMART_CUSTOMER_SUPPORT_BOT_DEMO_PRODUCT_SPEC.md) | 旧 Demo 产品场景和行为规格 |
| [Stack A 外部 Workflow Runtime 选型](research/AGENT_BOX_PREVIEW_STACK_A_WORKFLOW_RUNTIME_SELECTION_2026.md) | LangGraph 首选、DBOS fallback、adapter/Ref/Binding/Evidence 设计 |
| [真实 Provider 集成验证与 Demo Storyboard](validation/AGENT_BOX_PREVIEW_REAL_PROVIDER_INTEGRATION_AND_DEMO_STORYBOARD_2026.md) | 2026-08-24 本地/E2E spikes、Readiness、逐幕脚本和实现缺口 |

## Architecture

候选模型、Core 边界和实现前架构设计放在 [`architecture/`](architecture/)：

- [当前项目整体架构（新开发者先读）](architecture/CURRENT_PROJECT_ARCHITECTURE.md)
- [Agent-Box Target Architecture 2026（目标结构）](architecture/AGENT_BOX_TARGET_ARCHITECTURE_2026.md)
- [Adapter-First Architecture](architecture/ADAPTER_FIRST_ARCHITECTURE_RESEARCH.md)
- [Core Ontology Research](architecture/AGENT_BOX_CORE_ONTOLOGY_RESEARCH.md)
- [Execution Binding / Governed Handoff](architecture/EXECUTION_BINDING_GOVERNED_HANDOFF_MODEL.md)
- [Production Minimal Work Core Design v0.1](architecture/PRODUCTION_WORK_CORE_DESIGN_V0_1.md)
- [Work Core v0.1 Architecture and Flow](architecture/WORK_CORE_V0_1_ARCHITECTURE_AND_FLOW.md)
- [Work Core v0.1 Provider and Model Proposal](architecture/WORK_CORE_V0_1_PROVIDER_AND_MODEL_PROPOSAL.md)

已经形成稳定决策的短文档放在 [`adr/`](adr/)：

- [ADR-0001：Execution attempt 与 session continuity](adr/0001-execution-attempt-vs-session-continuity.md)
- [ADR-0002：Dispatch submission 与 recovery](adr/0002-dispatch-submission-and-recovery-semantics.md)
- [ADR-0003：Dispatch correlation 与 recovery](adr/0003-dispatch-canonical-correlation-and-recovery.md)
- [ADR-0004：ExecutionProvider capability contract](adr/0004-execution-provider-capability-contract.md)
- [ADR-0005：Execution observation 与 projection](adr/0005-execution-observation-and-projection-semantics.md)
- [ADR-0006：Execution Resource Contract 输入协议](adr/0006-resource-contract-input-protocol.md)
- [ADR-0007：第三方 Provider 插件加载](adr/0007-third-party-provider-plugin-loading.md)
- [ADR-0008：结构化 Resource Observation 账本](adr/0008-structured-resource-observations.md)
- [ADR-0009：Atomic Execution Finalization](adr/0009-atomic-execution-finalization.md)
- [ADR-0010：External Git workspace output capture](adr/0010-external-workspace-output-capture.md)

## Research

市场、生态和产品边界研究放在 [`research/`](research/)：

- [Workflow 与 Execution 责任边界市场调研（2026）](research/AGENT_BOX_WORKFLOW_EXECUTION_BOUNDARY_MARKET_RESEARCH_2026.md)
- [Execution Material Capture and Handoff（2026）](research/EXECUTION_MATERIAL_CAPTURE_AND_HANDOFF_RESEARCH_2026.md)
- [Preview Stack A Workflow Runtime 选型](research/AGENT_BOX_PREVIEW_STACK_A_WORKFLOW_RUNTIME_SELECTION_2026.md)
- [Agent Workspace / Run Composer](research/AGENT_WORKSPACE_RUN_COMPOSER_RESEARCH.md)
- [Persistent Agent Environment](research/PERSISTENT_AGENT_ENVIRONMENT_RESEARCH.md)
- [Pi-like Work Runtime Product Gap](research/PI_LIKE_WORK_RUNTIME_PRODUCT_GAP_RESEARCH.md)
- [Project Resource & Capability Runtime](research/PROJECT_RESOURCE_CAPABILITY_RUNTIME_RESEARCH.md)
- [Workflow Layer Capability Boundary](research/WORKFLOW_LAYER_CAPABILITY_BOUNDARY_RESEARCH.md)
- [Workflow Provider Abstraction Feasibility](research/WORKFLOW_PROVIDER_ABSTRACTION_FEASIBILITY.md)
- [Work-Above-Harness Validation](research/WORK_ABOVE_HARNESS_VALIDATION.md)
- [Work Runtime Dependency Landscape](research/WORK_RUNTIME_DEPENDENCY_LANDSCAPE.md)

## Validation and reports

Spike、压力测试、兼容性实验和源码审阅放在 [`validation/`](validation/)：

- [Minimal Work Core Stress Test](validation/AGENT_BOX_MINIMAL_WORK_CORE_STRESS_TEST.md)
- [Execution Binding Flow Stress Validation](validation/EXECUTION_BINDING_FLOW_STRESS_VALIDATION.md)
- [Execution Binding Real Provider Validation](validation/EXECUTION_BINDING_REAL_PROVIDER_VALIDATION.md)
- [第三方 tmux 插件真实验证](validation/THIRD_PARTY_TMUX_PLUGIN_VALIDATION_2026-08-25.md)
- [Preview Real Provider Integration and Demo Storyboard](validation/AGENT_BOX_PREVIEW_REAL_PROVIDER_INTEGRATION_AND_DEMO_STORYBOARD_2026.md)
- [Work Core v0.1 Prototype Development and Validation](validation/WORK_CORE_V0_1_PROTOTYPE_DEVELOPMENT_AND_VALIDATION_REPORT.md)
- [Work Core v0.1 Source Review Findings](validation/WORK_CORE_V0_1_SOURCE_REVIEW_FINDINGS.md)
- [Minimal Work Core v0.1 契约冻结与检查点验证](validation/最小工作核心V0_1契约冻结与检查点工作流验证报告.md)
- [最小工作核心真实 Provider 兼容性实验](validation/最小工作核心真实提供方兼容性实验完整过程.md)
- [最小工作核心证伪实验](validation/最小工作核心证伪实验报告.md)
- [生产最小工作核心 Phase 1 实现与验证](validation/生产最小工作核心Phase1实现与验证完整报告.md)
- [Atomic Execution Finalization](validation/ATOMIC_EXECUTION_FINALIZATION_2026-08-28.md)
- [Git Detached-Worktree Output Capture](validation/GIT_DETACHED_WORKTREE_OUTPUT_CAPTURE_2026-08-28.md)
- [Preview Checkpoint Blocker Fix](validation/PREVIEW_CHECKPOINT_BLOCKER_FIX_2026-08-28.md)

## Plans

有明确交付阶段和任务拆解的文档放在 [`plans/`](plans/)：

- [Preview 一天 Core 补齐切片（当前）](plans/PREVIEW_ONE_DAY_CORE_COMPLETION_CUT.md)
- [Preview Checkpoint Staging Manifest](plans/PREVIEW_CHECKPOINT_STAGING_MANIFEST_2026-08-28.md)
- [2026 架构迁移实施路线（当前）](plans/ARCHITECTURE_TRANSITION_PLAN_2026.md)
- [Preview 完整 Core 补齐计划（Preview 后硬化参考）](plans/PREVIEW_MINIMUM_CORE_COMPLETION_PLAN_2026.md)
- [Phase 1 Implementation Plan](plans/PHASE_1_IMPLEMENTATION_PLAN.md)
- [Phase 2 ACP Runtime](plans/PHASE_2_ACP_RUNTIME.md)
- [Work Core Production Implementation Plan — 2026-08-25](plans/WORK_CORE_PRODUCTION_IMPLEMENTATION_PLAN_2026-08-25.md)

## Product, specs and operations

- [`product/`](product/)：产品定位和叙事。
- [`architecture/LOCAL_WEB_HOST_AND_WORKBENCH.md`](architecture/LOCAL_WEB_HOST_AND_WORKBENCH.md)：Local Web Host 与唯一管理界面。
- [`validation/WEB_PRODUCT_LOOP_AND_TUI_RETIREMENT_2026-08-28.md`](validation/WEB_PRODUCT_LOOP_AND_TUI_RETIREMENT_2026-08-28.md)：Web E1→E2 与 TUI retirement 验收。
- [`demos/`](demos/)：Demo 场景、规格和执行蓝图。
- [`specs/`](specs/)：具体功能、GUI、集成和迁移规格。
- [`troubleshooting/`](troubleshooting/)：运行故障排查。
- [`superpowers/`](superpowers/)：特定设计任务的计划和设计记录。

## 归档规则

- `docs/` 根目录仅保留稳定入口文档和本索引。
- 新的市场或生态调研进入 `research/`。
- 候选系统模型进入 `architecture/`；被接受后再压缩为 ADR。
- 实验过程、证伪、兼容性和源码审阅进入 `validation/`。
- 带日期和阶段任务的交付计划进入 `plans/`。
- Demo 的用户故事和演示脚本进入 `demos/`。
- 移动文档时必须同步更新仓库内相对链接。
# Local Web Preview

Start the primary Preview interface with `agent-box web --no-browser`. The
Host serves the built Workbench and owns the per-home mutation lock. The
browser uses `/api/v1`; it does not access SQLite or the legacy PyWebView
bridge.
