# 简洁 AgentBox Desktop 产品交付

这是用户批准的新会话施工队列，不是后端队列，也不是另一份UI预览。

2026-09-14：现有goal持续执行，追加[P07](work-orders/P07-core-contract-and-handoff.md)，
消费[已批准核心语义](contracts/core-semantics-v1.md)。每阶段及goal结束前必须更新status；
前端完成独立交接后，由未来后端goal在双端READY时接管全栈，见[规则](handoff-policy.md)。
不是等两端已联调通过才准联调；本端实施READY与联合验收GREEN严格分开。

```text
desktop-product-delivery/
├── master-plan.md            总目标、上下层边界、自主权、资源与验收纪律
├── status.md                 产品分支维护执行进度；发布源只发布设计
├── manifest.json             前置关系、写入范围、独占组
├── contracts/index.md        后续前后端能力合同的唯一批准入口
└── work-orders/
    ├── P00-handoff.md        接管36R检查点，不重做既有成果
    ├── P01-sidebar-repair.md 先修统一选择与行宽等已确认缺陷
    ├── P02-product-surfaces.md 上层页面、输入框、角色、设置
    ├── P03-application-state-api.md 用例、草稿、状态、通用API边界
    ├── P04-host-retirement.md Electron职责收口、Hermes遗留退役
    ├── P05-contract-integration.md 合同到达后逐项接通真实服务
    └── P06-acceptance.md     真实Electron与完整产品矩阵验收
```

先读[总方针](master-plan.md)、[状态](status.md)、[调度](manifest.json)与
[合同入口](contracts/index.md)，再进入P00。目标分支由新执行会话创建，不由设计者抢先施工。
阶段完成自动提交并继续；单项缺合同不阻塞独立任务，不逐项向用户要“继续”确认。
保留同一goal持续消费增量派工，不为每个新合同新开goal。
