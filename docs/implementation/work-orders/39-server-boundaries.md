# Work Order 39 — 中立 Server 业务边界

状态：READY；基线 b415eb2，依赖38研究已交付，不依赖37转绿。
目标：落实[批准蓝图](../server-architecture-v1.md)，清除 Server 原生 Harness 决策，
修复请求接受/持久化接缝，为40提供真正可调用的中立能力入口。不宣称完整后端产品已完成。

## 范围与结构

```text
before server/
├── application/service.py       ⚠ Codex 条件、重复 accept 风险
├── persistence/repository.py    ⚠ 业务与存储混合
└── composition/codex.py         ⚠ 原生执行路径；不是通用装配
after server/
├── bootstrap/                  ◀ 仅装配具体实现
├── sessions/ profiles/ workspaces/ execution/ events/
│                               ◀ 按已有行为拆职责，用例拥有事务
└── transport/http/             ◀ 调用中立用例
storage/                        ◀ 保留基础设施，不收纳产品业务
plugins/agent-box-harnesses/     ◀ 原生路径由40的复用实现替代
```

允许 server/storage、必要 Core 数据库注入接缝、extensions 契约、对应测试/构建配置/证据修改。
不重写整个 Core；不把旧 Codex 执行器搬进新位置后称完成。39可以用明确隔离的测试 provider
验证中立接口；生产能力在40接好前如实 unavailable，不能退回旧 Codex 特例。

## 阶段与检查点

1. A：确认旧研究执行者已结束且工作树无冲突，从包含 b415eb2 与本派单的当前 HEAD
   创建 `feature/server-harness-extension-v1`（同一后端工作树）。保留历史分支，不 reset。
   读取 Desktop 核心语义、P07 与 handoff-policy，记录版本/摘要。沿用已有 wire 候选，
   只进行双方允许的机械 schema 对齐；不私造另一套产品协议。
   从本阶段开始读取前端实际工作树的 `docs/desktop-product-delivery/contracts/wire-v1/`
   及contracts/index.md，每个阶段边界检查摘要变更，不等40/41完成才答复。
   将确认/具体更正写到本仓 `docs/server-round1/wire-review.md`，含候选来源HEAD、schema摘要、
   ACCEPTED或CHANGES_REQUESTED、逐项差异、测试证据和建议patch（只写本仓，前端自行消费）。
   前端候选是首选；尚未存在时发布需求差异并继续独立工作，不与正在编制的P07另起竞争schema。
   前端明确移交候选编制时才能采用41的后端候选路径，并在双方index记录唯一编制方。
   前端提交修订或接受后端更正后，核对同一摘要；双方分别在各自文档记录接受即可锁定。
   不需用户逐字段批准，也不需等待完整服务/真实模型验证才锁wire。
2. B：分离业务和基础设施；对同幂等键并发请求先写反例再修，确保一次业务接受，
   重放返回同一身份。数据库提交与派发之间的恢复必须有证据；不宣称外部副作用 exactly-once。
3. C：能力声明由实际注册实现与验证结果产生；未实现能力不报支持。中立用例测试中用两个
   非品牌测试 provider 证明无需改 Server 即可选择不同实现；旧原生路径退出生产装配。
4. D：更新目标树、受影响测试、协议状态及尚待40完成项，提交阶段检查点，继续40。

## 不变量、验证与资源

本机权威、稳定身份、版本/事务、秘密不进事件/日志均不变；迁移前备份隔离测试数据，
不得对用户真实数据做自动迁移或清理。先跑对应 pytest 测试文件，阶段末跑受影响组件集；
精确命令和结果写报告，文档/单点错误不重跑全部平台门。保留37报告和已知失败，不伪装新证据。
新 worker/native 集成由40串行接手；和前端仅生产代码可并行，Windows重构建要互斥。

保护：所有兄弟仓库生产代码、用户 HOME/凭据及前端 POC。前端权威文档只读：
`/home/maoqh/projects/agent-box-desktop-next/docs/desktop-product-delivery/`。
后端唯一调度 `docs/implementation/`，每阶段及 goal 最终回复前更新并检查 status。
验证 `git diff --check`，只显式提交本阶段路径，无 push/merge/stash/clean。

只有需改变产品/安全边界或必须碰保护路径才请求裁决；局部失败先修，外部阻断先转可独立阶段。
终态 `SERVER_BOUNDARIES_READY_FOR_HARNESS` / `SERVER_BOUNDARIES_PARTIAL`；前者不是后端全产品GREEN。
