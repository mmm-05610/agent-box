# agent-box v2 愿景（Vision · 宪法）
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 定位：锁定大方向与不变式，作为后续每个小迭代决策的基准。
> 不包含机制 / 实现细节——那些在每个迭代里各自定（见「明确不在本文档」节）。

## 一句话

agent-box v2 = **跟着项目走的 agent 工作台**——为多 agent 项目协作提供统一的
结构化现场。它是**平台**，不是执行者，也不是决策者。

## 核心模型：两层

```
~/.agent-box/          系统级 = 公司总部（人维护，静态）
  ├─ profiles/         员工档案（= v1 profile）
  ├─ rules/            公司最高规则
  └─ knowledge/        全公司共享知识

<repo>/.agent-box/     项目级 = 项目组（状态自动维护，跟着 repo 走）
  ├─ team/             谁参与、各自职责          ← 人定
  ├─ rules/            组内协作约定              ← 人 + agent 共创
  ├─ status/           进度 / 完成度             ← 自动维护
  ├─ artifacts/        产出（不散落）            ← 自动回收
  └─ sessions/         谁干了什么               ← 自动记录
```

- **项目是公司的子集**：项目级引用系统级员工与共享知识，叠加项目自己的内容。
- **v1 / v2 正交**：v1 = 身份（每台机器的 profile），v2 = 工作现场（每个项目的
  `.agent-box/`）。`launch = 身份 × 现场`。

## 不变式（Invariants）

1. **内容与机制分离** —— 内容由人（及人机共创）制定；机制（注入 / 隔离 / 回收）
   由 agent-box 提供。
2. **状态自动维护，规则人机共创** —— 进度、完成度、产出、会话由平台自动回收维护；
   协作规则走「agent 提议 → 人批准 → 成为项目规则」的闭环。
3. **平台不指挥** —— 谁干什么、怎么协作由配置声明；agent-box 只让声明在运行时生效，
   不决定内容。
4. **v1 是 v2 的地基** —— v1 的 profile（员工档案）、bwrap 隔离、launch 机制全部复用；
   v2 在其上增加项目级目录与运行时协作层。

## 明确不在本文档（「法律」）

回写通道（MCP / 挂载目录）、目录结构细节、命令接口、GUI 形态、第一个迭代做哪块——
均在各小迭代中确定。本文档只做宪法，不做立法。

---

_2026-08-05 头脑风暴沉淀。_
