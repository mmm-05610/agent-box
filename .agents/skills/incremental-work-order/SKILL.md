---
name: incremental-work-order
description: >-
  Use when the user asks to 建派工单、追加派单、给正在运行的 Zcode goal 增量加任务、
  更新施工队列/总方针，或把讨论结论交给现有长任务执行。 Produces a self-contained,
  versioned work-order document, updates the repository's scheduling/status indexes,
  validates collisions and consistency, commits only the dispatch documents, and returns
  one short steering message for the existing executor. It must not start or propose a
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

## 工作流

### 1. 读取当前调度面

先读仓库 `AGENTS.md`，再寻找并完整读取：master plan / roadmap、status / ledger、
work-order 或 batch 目录的 README 与最近一张单、manifest / collision / ownership 文件，
以及本次架构裁决的 source-of-truth 文档。

若任务涉及架构，先使用仓库适用的架构汇报 Skill，并用真实代码量出目录、依赖和规模。
不要凭聊天记忆写基线。

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

碰撞工具只回答“哪些文件相交”，不是业务依赖调度器。工具输出与内容顺序冲突时，显式依赖
优先，并在 master plan 说明原因。

### 5. 校验与提交

至少执行：manifest/schema 可解析、collision/ownership 工具成功、本地引用存在、状态名与编号
一致、`git diff --check`、`git status --short`。

只显式 stage 本张派工单及其调度文档，禁止 `git add .`、`git add -A`、stash 或 reset。
提交信息应能单独说明 “dispatch work order N”。若 `.git` 不可写，报告精确阻塞并给用户可复制的
显式 `git add -- <paths>` 与 `git commit` 命令；不得谎称已提交。

### 6. 通知现有执行者

最终只给一条短 steering，不把派工单全文贴进聊天：

```text
总方针新增 work order <N>。重新读取 <master plan>、<status>、<work order>，重跑
<collision command>；按文档前置关系动态纳入队列，已完成项不要重做。
```

若新单必须在其他任务之后独占，必须在这句话里写出。**不要以 `/goal` 开头。**

## 质量门

- 聊天记录消失后仍可执行；
- 执行者没有被迫替维护者作架构裁决；
- 当前长任务不需重启；
- 并发关系可计算，内容依赖有显式覆盖；
- 完成与未完成都有可审计状态；
- 用户未跟踪、未提交或并行中的成果不会被误 stage。
