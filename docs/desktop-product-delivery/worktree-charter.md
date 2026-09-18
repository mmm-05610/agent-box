# agent-box-desktop-next-wsl-round1 工作树章程

> 由**调度者**写、**执行者**读。规则正文引用主树 `docs/implementation/README.md`（唯一规则文本），不复制。
> 建立：2026-09-19（按 skill 调整工作流；此前 P00–P20 已全部收口并释放租约，本树为空闲态）。

## 1 我是谁

- 工作树：`/home/maoqh/projects/agent-box-desktop-next-wsl-round1`　分支：`feature/agentbox-desktop-product`
- 基线：`df05959e`（P00–P20 收口、租约 RELEASED 的那个提交；调度者改基线时更新这一行）
- 我做什么：桌面产品（Ordessa）—— Electron 主进程、renderer、共享合同（wire TS）、打包
- 我**不**做什么：后端实现（`agent-box-env-provider`）、发布源 main、Hermes Desktop；不替用户做产品裁决

## 2 写权

- **可写**：`apps/desktop/**`、`apps/shared/**`、`tests-js/**`、`scripts/**`、
  `docs/desktop-product-delivery/work-orders/**`（契约权威）、`docs/desktop-product-delivery/status.md`（我的执行账）、
  `docs/desktop-product-delivery/evidence/**`（证据）
- **禁止写**：主树任何文件、其他子树、发布源、`docs/desktop-product-delivery/contracts/**` 里**别人**的评审面
  （我的合同面 `contracts/wire-v1/` 可写，但摘要更新必须与后端同步后一次完成）
- 只显式 `git add -- <paths>`；提交**用 pathspec 形式**；不 `reset`/`stash`/`clean`、不 `merge` 主干、**不 push**

## 3 队列切片（按此顺序）

| 顺序 | 单 | 一句话 | 依赖 |
| --- | --- | --- | --- |
| 1 | `P21-wire-relock-and-new-surfaces` | 与后端对齐当前 wire 摘要（两仓重锁）+ 接上 62/63/64 的三个只读面与 60 的角色设置增量 | 后端 58–64 已落地 |

> 上一批（P00–P20）已全部收口。契约文件在 `docs/desktop-product-delivery/work-orders/`；
> **新单由调度者直接投递进来**，我每个阶段边界重读该目录与主树的规则/队列/账。

## 3b 并行预算（执行者侧）

- 允许开子代理并行：**是**；同时在跑 ≤4；深度 ≤1（子代理不再开子代理）
- 只在工单声明的 `parallel_units` 之间并行；没声明就单线程
- 子代理**不跑 git 写操作**、不写契约、不写本树 status；提交/勾阶段/跑门由我本人完成；费用计入本节 `§Spend`

## 4 批次与检查点

- **批次 `Q1`**：`P21` 做完（或被阻塞部分如实标注）后收口
- 收口：`git tag -a checkpoint/Q1 -m "P21 done; build+tsc+eslint+vitest counts; <日期>"`（tag 不得覆盖）
  + 检查点报告写进本树 `status.md`（能试什么 / 要人拍的 / 花了什么 / 恢复点）→ **然后继续，不为它停下**
- 主树合并时按 `checkpoint/Q1` 的 **commit sha** 合，不按分支

## 5 每个阶段边界重读什么（只读，不复制）

```bash
cat docs/desktop-product-delivery/worktree-charter.md          # 本文件
ls  docs/desktop-product-delivery/work-orders/                 # 契约与新增单
cat /home/maoqh/projects/agent-box-server-round1/docs/implementation/README.md      # §3 规则 + §4 纪律
cat /home/maoqh/projects/agent-box-server-round1/docs/implementation/manifest.json   # 队列/依赖/executors
cat /home/maoqh/projects/agent-box-server-round1/docs/implementation/status.md       # 主树汇总账
cat /home/maoqh/projects/agent-box-server-round1/docs/implementation/rulings.md      # 裁决账（R-xxxx）
cat /home/maoqh/projects/agent-box-server-round1/docs/implementation/prefs.md        # 偏好账
```

- **阶段边界 = 每次阶段性提交之前**；纳入修订后在本树 status 记 `已纳入 work order <ID> 修订 @<sha>`
- 契约有问题 → 不改契约，交回调度者

## 6 格式

- 本树沿用 **`P<nn>-<slug>.md`** 编号（与后端 3 位数字编号不同），**内容**按 v2：frontmatter（JSON 列表）+
  固定小节（Objective / Current state / Scope / Requirements / Stages / Gates / Validation / DoD / Acceptance）
  + 复选框 Stages + 门四列（断言 / 反例 / 缺席行为）
- 结构校验：`python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py <本单> --strict`
  （校验器的文件名规则假设数字编号，**P 编号会报文件名一条**——那是预期，其余诊断必须为空）
- **P00–P20 为旧格式文本**：冻结只读，不重写；实质改动时一并对齐

## 7 证据与账

- 证据落点：`docs/desktop-product-delivery/evidence/**`（构建/tsc/eslint/vitest 输出摘要、截图；**凭据绝不落盘**）
- 我的账：`docs/desktop-product-delivery/status.md`（每单终态、已知缺口、阻塞、检查点报告、§Spend）

## 8 纪律

见主树 `docs/implementation/README.md §4`：单内不停、批末打 tag 写报告后继续、升级≠停下、事实分级、
门要能被证伪、凭据只作 locator；**桌面侧额外**：`tsc`/`eslint`/`build`/`vitest` 四项必须真跑并记计数，
renderer 层序守卫不得放宽。
