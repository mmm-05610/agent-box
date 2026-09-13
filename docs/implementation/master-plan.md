# AgentBox Server — 总实施方针

2026-09-13。独立后端 Codex goal 的唯一施工权威，不属于 Desktop/Zcode 队列。
37 已产生 A/B/C/D 检查点；独立验收仍为 PARTIAL。

## 2026-09-14 调度覆盖（优先于下方历史安排）

用户已批准[Server职责蓝图](server-architecture-v1.md)与四家 Harness 接入尝试。
当前队列：[39 中立Server边界](work-orders/39-server-boundaries.md) →
[40 四Harness复用接入](work-orders/40-four-harness-integration.md) →
[41 核心服务独立验收](work-orders/41-core-service-acceptance.md) →
[42 等待前端与全栈交付](work-orders/42-fullstack-delivery.md)。38研究结束，不再重复广筛；
采用有条件首选进入有门禁的抽取/接入，不是无条件认定四家支持。37历史状态不升级。
执行工作目录不变，新施工分支由39创建 `feature/server-harness-extension-v1`，保留b415eb2历史。
下方“只研究/不能生产”仅描述37/38历史授权，不适用于39/40。没有正在运行的后端goal时，
等待用户启动执行会话；本次文档派发不自动启动旧研究goal。
各阶段必须更新status；任何goal结束前复核状态、证据、待验和写权。单家阻断继续其他可做任务。
真实模型/凭据仍须42的来源及预算授权；两端READY前不联调，跨仓写权由42双门后生效。
39→40→41是主顺序，40单家受阻可先推进41，其余家继续处理。不得将四家全绿作为核心服务前置。
41完成不是goal终点：按42每5分钟检查前端实际状态，使用等待机制而非忙轮询；
前端正常施工、状态未变不是阻断。双门后接管全栈，修复并提交两端结果，禁止只交后端报告。
本节覆盖下方历史“队列空即结束”“不接Desktop”等限制；其他数据/权限/不自动push约束不变。
目标是尝试四家、争取3–4家真实可用，逐家实测而非预填GREEN。独立后端READY、无模型联调、
真实模型可用、完整外围产品四种完成度必须分开。无需每阶段请示是否继续。

## 定位和入口

- 工作目录：`/home/maoqh/projects/agent-box-server-round1`
- 分支：`feature/server-http-codex-r1`
- 代码基线：`80d2017e9a708421556914cd99d843573daf4c68`；HEAD 已有派工文档提交是正常的。
- 设计：[蓝图](blueprint.md)；队列：[status](status.md)；范围：[manifest](manifest.json)。
- 当前任务：[38 — Harness 扩展实现选型](work-orders/38-harness-extension-selection.md)。
- 保留基线：[37 — HTTP Codex](work-orders/37-http-codex.md)，不因选型重跑真实调用。
- 原派工来源：Desktop 仓提交 `d20c774`；其旧后端文档已退役为迁移指引。

## 长期任务与动态派单

本 Codex 会话是新的独立后端执行者，不通知或接管正在跑的 Zcode。
37 的上一轮 goal 已结束。用户可在同一会话启动新的 goal 消费 38；已有 goal 正在运行时
只重读队列，不另建嵌套 goal。38 各研究阶段可继续，最终选型由用户裁决；不自动实施重构。

每个阶段开始/结束、收到增量提示、准备结束当前任务前，重新读取本文件、status 和
manifest，仅加载当前可执行单。新单由设计者追加；执行者按显式依赖和资源互斥协调，
不要自行扩大范围或重做已完成任务。每次结果写 status 和 docs/server-round1 的报告。
同一会话持续消费增量单，不为每张单另开 goal。

队列没有可执行项时，先重读确认再汇报当前边界。不要自行实现待议功能，不空转轮询；
如产品支持暂停/等待任务则使用，否则结束当前 goal，后续由用户在本会话继续追加。
“长期执行”不意味着凭空产生新需求，也不要求无限保持进程运行。

## 当前顺序与验收

当前调度覆盖：下列 A–D 保留为 37 历史阶段。先做 38，暂停 37 自写 Harness 接入体系的
扩展及生产返修；38 完成不代表 37 转绿。复用现成多 Harness 接入项目是硬约束，
不得把 ACP SDK、单家适配器或“参考后自写”冒充复用了整个接入实现。

1. A：Windows 独立 HTTP Server、本机存储和基础产品合同。
2. B：真实 WSL Worker/目录/隔离/取回，无模型。
3. C：HTTP 两轮真实 Codex 与流式事件。
4. D：重启原生续接、故障恢复、可亲手验收步骤。

每阶段集中跑相关门、提交明确检查点。不得用 fake 代替真实最终门，也不为一个局部错误
反复跑所有无关测试。具体模型/凭据来源未确认前零真实模型调用、零凭据内容读取。
37 完成后仅执行队列明确新增的单；没有就停，不自动扩 Pi/UI/安装器/协作。

## 所有权与自主权

- Server 管产品状态、连接与服务；Core 管通用执行；插件解释 native 语义；Worker 管目标执行。
- 所有 Profile/Session/续接权威在 Windows，WSL 项目源码可持久，执行投影有期限。
- 配置 revision、角色 native generation、Session checkpoint 分开。
- 可在确定的边界内调整文件拆分、选成熟库、补窄 SPI、协调子任务。
- 不绕 Core/bwrap、不猜原生状态分类、不改变数据权威、不整个迁入旧 Studio/Tauri。
- 子代理最高 gpt-5.6-sol，判断/审查可用；机械与常规实施用 Luna/Terra，主代理负责集成。

Desktop 36 在另一工作树由 Zcode 执行；本会话不修改 Desktop，不接管其调度。
代码可并行；Windows 大构建与真实模型演练需协调串行。无法确认共享资源空闲时先做其他
安全工作或询问，不杀用户/其他代理进程。禁止推送或自动合并 main。

后续设计者可更新本目录的总方针、蓝图、manifest 和工单；执行者主写 status/执行证据。
并发文档改动保留、不覆盖或顺手提交；发现冲突报告。原后端与旧 Studio 工作树只读。
