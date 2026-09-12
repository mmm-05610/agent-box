---
name: incremental-work-order
description: >-
  Use when the user asks to 建派工单、追加派单、给正在运行的 Zcode goal 增量加任务、
  更新施工队列/总方针，或一个设计阶段已经闭合、准备转入下一阶段。 It turns the
  agreed design into a self-contained work order with proportional validation. Before
  moving on, proactively ask whether to dispatch the completed stage. Never start a
  second /goal when a long-running goal already exists.
---

# 动态派工单

“派工单”不是一段临时提示词，也不是新的 `/goal`。它是进入仓库、可追踪、可碰撞分析、
可验收的一张增量施工合同。长期执行者只收到一句通知，让它重新读取仓库中的最新计划。

## 先分清三种对象

```text
长期 /goal                         一次启动，负责持续消费施工队列
└── 仓库内 master plan/status      动态总方针与真实进度
    └── work-order N               自包含、可提交、可验收的增量任务
        └── steering message       一句话通知现有执行者重读，不复制整张单
```

- 已有长任务在运行：**禁止再生成 `/goal`**。
- 没有长任务且用户明确要启动：派工单完成后才另给 `/goal`。
- 用户只在讨论方案、尚未裁决：先记录决定或等待裁决，不把开放问题伪装成机械任务。
- 一个阶段已经把边界、目的地、不变量和停止条件讨论清楚，而对话准备进入下一阶段：讨论者
  必须主动总结并询问“是否现在落成派工单”。用户不需要先说固定口令。
- 未经用户确认，不把讨论稿自动写进施工队列；确认后也不重新做一遍已经由执行报告证明的审计。

## 工作流

### 1. 以最近的执行产物为基线

优先使用 Zcode 最近产出的架构树、阶段汇报，以及讨论过程中已经形成的目标树。它们是本阶段
设计输入；不要在讨论阶段为了确认同一件事反复扫描代码。

用户确认派工后，只读取完成落盘所需的调度切片：相关 work order、master plan/status 中对应行、
相关 ruling，以及已有 manifest entry。不要默认完整重读全部 roadmap、历史 batch 和账本。

仅在以下情况做定向代码核对：最近报告没有覆盖一个执行必需事实；两个来源冲突；目标路径或
导入方向会改变；用户明确要求重新审计。沿用报告数字时标明其来源，不把报告快照写成实时实测。

### 2. 判断能否派工

只有边界已定、目的地明确、行为要求明确的工作才能派出。下列任一存在就先停在设计层：

- 模块归属仍有两个合理答案；
- 需要执行者发明协议、数据模型或产品语义；
- 无法说明哪些行为必须保持不变；
- 与正在施工的批次发生未解决的内容依赖。

文件冲突可以靠排序解决；**设计未决不能靠排序解决**。

### 3. 编写自包含派工单

取下一个稳定编号。复制并填写 `assets/work-order-template.md` 的结构。派工单必须让一个只读
仓库、不读聊天记录的执行者也能完成，至少包含：

1. 目标与为什么现在做；
2. 实测现状和带右侧注解的 before/after 目录树；
3. 精确范围、目的地、允许改动与禁止改动；
4. 与其他批次的前置、串行、并行关系；
5. 分阶段步骤和提交边界；
6. 行为不变量、验证命令、实测基线；
7. 必须停止并汇报的条件；
8. 受保护的用户工作树路径；
9. 唯一 GREEN/PARTIAL 状态名。

机械迁移写到文件/目录级；大范围移动必须说明 import、动态 import、mock、fixture、文档路径
如何同步。不得要求用源码文本正则测试结构。

### 4. 接入调度系统

派工单不能成为孤儿。按仓库已有机制同步：batch/work-order index、manifest 的 touched set 与
显式依赖、master plan 的阶段与执行顺序、status 中的 open 行，以及产生任务的 ruling。

若仓库没有这些机制，只建立最小四件套：`master-plan.md`、`status.md`、`work-orders/`、
`manifest.json`。不要把完整计划只留在聊天里。

已有 work order 只增加内部设计、且 touched set 和前置关系不变时，不必重跑全量碰撞工具；
同步该 work order、对应 status/master/ruling 即可。新增 work order、扩大 touched set 或改变
并行关系时才更新 manifest 并运行碰撞检查。碰撞工具只回答“哪些文件相交”，不是业务依赖
调度器；显式内容依赖优先。

### 5. 比例化校验与提交

每次都执行本次文档的本地引用、状态名/编号一致性、`git diff --check` 和 `git status --short`。
只有修改 manifest/schema、碰撞范围或 ownership 定义时，才运行相应解析器或全量工具。
讨论确认过、执行报告已经证明的代码事实不重复测试。

只显式 stage 本张派工单及其调度文档，禁止 `git add .`、`git add -A`、stash 或 reset。
提交信息应能单独说明 “dispatch work order N”。若 `.git` 不可写，报告精确阻塞并给用户可复制的
显式 `git add -- <paths>` 与 `git commit` 命令；不得谎称已提交。

### 6. 通知现有执行者

最终只给一条短 steering，不把派工单全文贴进聊天：

```text
总方针新增 work order <N>。重新读取 <master plan>、<status>、<work order>，重跑
<collision command>；按文档前置关系动态纳入队列，已完成项不要重做。
```

若执行者已经约定在阶段边界自行重读调度文档，文档提交后可以不额外通知；否则发送一句短
steering。若新单必须在其他任务之后独占，必须在这句话里写出。**不要以 `/goal` 开头。**

## 质量门

- 聊天记录消失后仍可执行；
- 执行者没有被迫替维护者作架构裁决；
- 当前长任务不需重启；
- 并发关系可计算，内容依赖有显式覆盖；
- 完成与未完成都有可审计状态；
- 用户未跟踪、未提交或并行中的成果不会被误 stage。
