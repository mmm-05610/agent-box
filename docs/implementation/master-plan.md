# AgentBox Server — 总实施方针

2026-09-13。独立后端 Codex goal 的唯一施工权威，不属于 Desktop/Zcode 队列。
用户已授权创建此工作树并执行 37；生产实现尚未开始。

## 定位和入口

- 工作目录：`/home/maoqh/projects/agent-box-server-round1`
- 分支：`feature/server-http-codex-r1`
- 代码基线：`80d2017e9a708421556914cd99d843573daf4c68`；HEAD 已有派工文档提交是正常的。
- 设计：[蓝图](blueprint.md)；队列：[status](status.md)；范围：[manifest](manifest.json)。
- 当前任务：[37 — HTTP Codex](work-orders/37-http-codex.md)。
- 原派工来源：Desktop 仓提交 `d20c774`；其旧后端文档已退役为迁移指引。

## 长期任务与动态派单

本 Codex 会话是新的独立后端执行者，不通知或接管正在跑的 Zcode。
先做 37 的 A→B→C→D，各阶段通过后可继续，不逐阶段等待批准；工单明确要求的
凭据来源授权、外部阻断和越界裁决仍必须停下询问。

每个阶段开始/结束、收到增量提示、准备结束当前任务前，重新读取本文件、status 和
manifest，仅加载当前可执行单。新单由设计者追加；执行者按显式依赖和资源互斥协调，
不要自行扩大范围或重做已完成任务。每次结果写 status 和 docs/server-round1 的报告。
同一会话持续消费增量单，不为每张单另开 goal。

队列没有可执行项时，先重读确认再汇报当前边界。不要自行实现待议功能，不空转轮询；
如产品支持暂停/等待任务则使用，否则结束当前 goal，后续由用户在本会话继续追加。
“长期执行”不意味着凭空产生新需求，也不要求无限保持进程运行。

## 当前顺序与验收

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
