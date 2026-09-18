# agent-box-env-provider 工作树章程

> 由**调度者**写、**执行者**读。规则正文**引用**主树 `docs/implementation/README.md`（唯一规则文本），不复制。
> 建立：2026-09-19（按 skill `incremental-work-order` 调整当前工作流）。

## 1 我是谁

- 工作树：`/home/maoqh/projects/agent-box-env-provider`　分支：`feature/env-provider-v1`
- 基线：`e39959f`（本批起点；每次调度者合并/改基线会更新这一行）
- 我做什么：后端基础设施实现——Server/Core、插件、Worker、协议、门与证据
- 我**不**做什么：前端（桌面工作树）、发布源 main、Hermes Desktop；不替用户做产品裁决

## 2 写权

- **可写**：`src/agent_box/**`、`plugins/**`、`scripts/server-round1/**`、`tests/**`、
  `docs/implementation/work-orders/**`（契约权威）、`docs/implementation/status.md`（我的执行账）、
  `docs/server-round1/**`（证据）
- **禁止写**：主树的任何文件、其他子树、发布源、受保护路径
- 只显式 `git add -- <paths>`；提交**用 pathspec 形式**（`git commit -m ... -- <paths>`）；
  不 `reset`/`stash`/`clean`、不 `merge` 主干、**不 push**

## 3 队列切片（按此顺序）

| 顺序 | 单 | 一句话 | 依赖 |
| --- | --- | --- | --- |
| 1 | `068-ledger-catchup` | 把本树执行账补齐：60–65 的终态行 + 刷新 52/54/55 的陈旧行 | 无 |
| 2 | `066-shared-session-store` | kilo/opencode 改"共享整库 + 空凭据守卫"；切绑定不搬库 | 无（与 068 可并行） |
| 3 | `067-per-session-admission` | 准入单位从 profile 改为会话；禁同会话双写；home 并发可变态逐家判定 | 45 已落地 |
| 4 | `070-real-endpoint-probes` | 55 的 G2–G4：真实端点探测（R-0011 已授权，不设上限、逐笔记账） | 无 |
| 5 | `069-wsl-observation-54` | 54 的 WSL 通道观测轮（c11 门已绿）：变更集一手事实，含否定项 | 无 |

> 契约文件在 `docs/implementation/work-orders/`；**新单与修订由调度者直接投递进来**（父树对本树有白名单写权），
> 我每个阶段边界重读该目录即可，不需要去别处复制，也没有副本要合并。

## 3b 并行预算（执行者侧）

- 允许开子代理并行：**是**；**同时在跑 ≤4**；**深度 ≤1**（子代理不再开子代理）
- 只允许在**工单声明的 `parallel_units`** 之间并行；没声明就单线程
- 子代理**不执行 git 写操作**、不写契约、不写本树 `status.md`；提交、勾阶段、跑门都由我本人完成
- 子代理的请求数与费用计入本树 `§Spend`，受主树 `prefs.md` 成本上限约束
- 项目 `AGENTS.md` 的模型/数量限额与本节叠加，**取更严者**

## 4 批次与检查点

- **批次 `b1`**：`068 → 066 → 067 → 069` 全部做完（或其中被阻塞的部分如实标注）后收口
- 收口动作：`git tag -a checkpoint/b1 -m "068-069 done; suite <计数>; <日期>"`（**tag 不得覆盖**）+ 把检查点报告写进本树
  `status.md`（能试什么 / 要人拍的 / 花了什么 / 恢复点）→ **然后继续下一批，不为它停下**
- 主树合并时**按 `checkpoint/b1` 指向的 commit sha** 合，不按会移动的分支

## 5 每个阶段边界重读什么（只读，不复制）

```bash
cat docs/implementation/worktree-charter.md        # 本文件：范围/写权/切片/批次
ls  docs/implementation/work-orders/               # 契约与新增单（权威在这里）
cat /home/maoqh/projects/agent-box-server-round1/docs/implementation/README.md     # §3 规则 + §4 纪律
cat /home/maoqh/projects/agent-box-server-round1/docs/implementation/manifest.json  # 队列/依赖/executors
cat /home/maoqh/projects/agent-box-server-round1/docs/implementation/status.md      # 主树汇总账
cat /home/maoqh/projects/agent-box-server-round1/docs/implementation/rulings.md     # 裁决账（R-xxxx）
cat /home/maoqh/projects/agent-box-server-round1/docs/implementation/prefs.md       # 偏好账
```

- **阶段边界 = 每次阶段性提交之前**；纳入**修订**后在本树 status 记 `已纳入 work order <NNN> 修订 @<sha>`
- 契约有问题 → 不改契约，交回调度者改并投递新版本

## 6 格式冻结（迁移债，如实记账）

- **44–65 为 v1 遗留契约**（无 frontmatter、两位编号）：**冻结只读**，不重写、不重命名；若某单需要实质改动，
  改动时一并对齐 v2 并过校验器
- **068 起必须 v2**：frontmatter（JSON 列表）+ 固定小节 + 复选框 Stages + 门四列（断言/反例/缺席行为）
  + `python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py <新单路径> --strict` 必须过
- **66/67 与 44–65 同属 v1 文本**（本批由主树投递，未重写）：按它们自身的小节执行即可；**要改它们**
  （修订/重发）时一并对齐 v2
- **下一批起**：所有新契约一律 v2 + 过校验器（本批的 068/069 已是 v2）

## 7 证据与账

- 证据落点：`docs/server-round1/**`（门报告、JSON、日志摘要；**凭据绝不落盘**）
- 我的账：`docs/implementation/status.md`（每单终态、已知缺口、阻塞、检查点报告、§Spend）

## 8 纪律

见主树 `docs/implementation/README.md §4`：单内不停、批末打 tag 写报告后继续、升级≠停下（标阻塞继续做别的）、
事实分级（实测/引用/未验证）、门要能被证伪、凭据只作 locator。
